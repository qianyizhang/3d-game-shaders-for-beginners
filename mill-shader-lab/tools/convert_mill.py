"""Export the original Panda3D scene, in native units, to local mesh buffers."""
from __future__ import annotations

import array
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

from direct.actor.Actor import Actor
from panda3d.core import (
    GeomVertexReader, Loader, LMatrix4f, NodePath, TextureAttrib, Thread,
    TransparencyAttrib, load_prc_file_data,
)

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / ".local" / "mill-assets"
MODELS = ROOT / "demonstration" / "eggs" / "mill-scene"
PROPS = {"shutters": "shutters", "vane": "weather-vane", "banner": "banner"}
MESH_ROLES = {"wheel-lp": "wheel", "water-lp": "water"}
AUX = {
    "flow": "images/up-flow.png", "foam": "images/foam-pattern.png",
    "smoke": "images/smoke.png", "grain": "images/color-noise.png",
    "neutralLut": "images/lookup-table-neutral.png",
    "dayLut": "images/lookup-table-0.png", "nightLut": "images/lookup-table-1.png",
    "wheelAudio": "sounds/wheel.ogg", "waterAudio": "sounds/water.ogg",
}
TEXTURE_ROLES = ("color", "normal", "specular", "reflection", "refraction")


def y_up(v):
    return (v[0], v[2], -v[1])


def append_span(blob, values):
    offset = len(blob)
    if sys.byteorder != "little":
        values = values[:]
        values.byteswap()
    blob.extend(values.tobytes())
    return [offset, len(values)]


def vertices(data, transform):
    normal_transform = LMatrix4f(transform)
    if not normal_transform.invert_in_place():
        raise ValueError("Singular mesh transform")
    normal_transform.transpose_in_place()
    pos, normal, uv, tangent, bitangent = [
        GeomVertexReader(data, key)
        for key in ("vertex", "normal", "texcoord", "tangent", "binormal")
    ]
    values = array.array("f")
    for _ in range(data.get_num_rows()):
        p = transform.xform_point(pos.get_data3f())
        n = normal_transform.xform_vec(normal.get_data3f()).normalized()
        t = transform.xform_vec(tangent.get_data3f()).normalized()
        b = transform.xform_vec(bitangent.get_data3f()).normalized()
        values.extend((*y_up(p), *y_up(n), *uv.get_data2f(), *y_up(t), *y_up(b)))
    return values


def material(path, geom_state, texture_paths):
    state = path.get_net_state().compose(geom_state)
    textures = state.get_attrib(TextureAttrib)
    stages = list(textures.get_on_stages())
    if len(stages) != len(TEXTURE_ROLES):
        raise ValueError(f"{path}: expected five authored stages, found {stages}")
    result = {}
    for role, stage in zip(TEXTURE_ROLES, stages, strict=True):
        if stage.get_texcoord_name().get_name() != "texcoord":
            raise ValueError(f"{path}: unexpected UV set for {stage}")
        name = textures.get_on_texture(stage).get_filename().get_basename()
        source = MODELS / "tex" / name
        texture_paths[f"textures/{name}"] = source
        result[role] = f"textures/{name}"
    result["cutout"] = state.has_attrib(TransparencyAttrib) or result["color"].endswith("blank.png")
    return result


def pieces(root, texture_paths):
    for path in root.find_all_matches("**/+GeomNode"):
        node = path.node()
        for index in range(node.get_num_geoms()):
            yield path, node.get_geom(index), material(path, node.get_geom_state(index), texture_paths)


def triangles(geom, start):
    for i in range(geom.get_num_primitives()):
        faces = geom.get_primitive(i).decompose()
        if faces.get_num_vertices_per_primitive() != 3:
            raise ValueError(f"Non-triangle primitive {faces}")
        for j in range(faces.get_num_vertices()):
            yield start + faces.get_vertex(j)


def export_scene(blob, texture_paths):
    root = NodePath(Loader.get_global_ptr().load_sync(str(MODELS / "mill-scene.bam")))
    batches = {}
    for path, geom, maps in pieces(root, texture_paths):
        role = MESH_ROLES.get(path.get_name(), "mill")
        matrix = path.get_mat(root)
        # Keep the wheel's local vertices, origin and rotation axis.
        origin = y_up(matrix.get_row3(3)) if role == "wheel" else (0, 0, 0)
        transform = LMatrix4f.ident_mat() if role == "wheel" else matrix
        key = role, tuple(maps.items())
        batch = batches.setdefault(key, (array.array("f"), array.array("I"), origin))
        positions, indices, _ = batch
        indices.extend(triangles(geom, len(positions) // 14))
        positions.extend(vertices(geom.get_vertex_data(), transform))
    if {key[0] for key in batches} != set(MESH_ROLES.values()) | {"mill"}:
        raise ValueError("Missing original scene roles")
    return [
        dict(role=role, textures=dict(maps), origin=origin,
             vertices=append_span(blob, data), indices=append_span(blob, indices))
        for (role, maps), (data, indices, origin) in batches.items()
    ]


def export_prop(role, source, blob, texture_paths):
    actor = Actor(str(MODELS / f"{source}.bam"))
    ((path, geom, maps),) = pieces(actor, texture_paths)
    vdata = geom.get_vertex_data()
    transform = path.get_mat(actor)
    clips = {}
    for name in actor.get_anim_names():
        control = actor.get_anim_control(name)
        offsets = []
        for frame in range(control.get_num_frames()):
            actor.pose(name, frame)
            actor.update(force=True)
            deformed = vdata.animate_vertices(True, Thread.get_current_thread())
            offsets.append(append_span(blob, vertices(deformed, transform)))
        clips[name] = dict(fps=control.get_frame_rate(), frames=offsets)
    actor.cleanup()
    return dict(role=role, textures=maps, origin=[0, 0, 0], clips=clips,
                vertices=next(iter(clips.values()))["frames"][0],
                indices=append_span(blob, array.array("I", triangles(geom, 0))))


def main():
    os.chdir(ROOT / "demonstration")
    load_prc_file_data("conversion", "model-cache-dir /tmp/mill-panda-cache")
    blob = bytearray()
    files = {path: ROOT / "demonstration" / path for path in AUX.values()}
    meshes = export_scene(blob, files)
    meshes.extend(export_prop(role, source, blob, files) for role, source in PROPS.items())
    ART.mkdir(parents=True, exist_ok=True)
    for url, source in files.items():
        target = ART / url
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    (ART / "geometry.bin").write_bytes(blob)
    originals = [MODELS / f"{name}.bam" for name in ["mill-scene", *PROPS.values()]]
    manifest = dict(version=1, scene="Original mill", axes="x,z,-y", geometry="geometry.bin",
                    meshes=meshes, resources=AUX, sources={
                        str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                        for path in [*originals, *files.values()]
                    })
    (ART / "scene.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{len(meshes)} meshes; {len(blob):,} bytes; {len(files)} texture/audio files → {ART}")


if __name__ == "__main__":
    main()
