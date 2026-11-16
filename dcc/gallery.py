"""Generate a read-only, offline catalog from verified deliveries."""

import argparse
import base64
import json
import os
from pathlib import Path
from shutil import copyfile

from delivery import ReleaseRef, delivery_roots, digest, load_release

ROOT = Path(__file__).resolve().parent
ROLES = {"color": ("Base color", "sRGB", "RGB"), "normal": ("Normal", "Linear", "RGB"),
         "specular": ("Specular mask", "Linear", "R"), "reflection": ("Reflection mask", "Linear", "R"),
         "refraction": ("Refraction mask", "Linear", "R"), "contact": ("Water contact pattern", "Linear", "R")}


def build(deliveries: Path | None, output: Path, selected: set[str]) -> None:
    roots = delivery_roots(ROOT.parent, deliveries)
    index_path = (deliveries if deliveries is not None else ROOT / "deliveries") / "index.json"
    index = json.loads(index_path.read_text())
    if (not isinstance(index, dict) or index.get("version") != 1
            or not isinstance(index.get("scenes"), dict) or not selected <= index["scenes"].keys()):
        raise ValueError(f"{index_path}: invalid delivery index or unknown scene")
    nodes: dict[str, dict] = {}
    scenes: dict[str, dict] = {}
    outputs: dict[str, bytes] = {}
    sources: dict[str, Path] = {}

    def node(kind: str, key: str, title: str, **fields: object) -> dict:
        identifier = f"{kind}/{key}"
        if identifier in nodes:
            raise ValueError(f"Duplicate catalog ID: {identifier}")
        entry = dict(id=identifier, kind=kind, title=title, **fields)
        nodes[identifier] = entry
        return entry

    def texture(path: str, payload: bytes, tags: list[str]) -> str:
        key = Path(path).stem
        identifier = f"texture/{key}"
        sha = digest(payload)
        if identifier in nodes:
            if nodes[identifier]["sha256"] != sha:
                raise ValueError(f"Texture ID {identifier} has multiple masters")
            return identifier
        file = f"textures/{key}.png"
        outputs[file] = payload
        node("texture", key, key.replace("-", " "), tags=tags, file=file, sha256=sha,
             data="data:image/png;base64," + base64.b64encode(payload).decode())
        return identifier

    for slug, delivery in sorted(index["scenes"].items()):
        if selected and slug not in selected:
            continue
        release = load_release(ReleaseRef(delivery), roots=roots)
        manifest, files = release.manifest, release.files
        sources[delivery] = release.folder
        model = json.loads(files["scene.json"])
        if not isinstance(model, dict) or manifest["scene"] != slug or model["scene"] != slug:
            raise ValueError(f"Delivery does not match catalog scene {slug}")
        data_file = f"{slug}.js"
        outputs[data_file] = f'DCC_GEOMETRY("{slug}","{base64.b64encode(files[model["geometry"]]).decode()}");\n'.encode()
        scenes[slug] = {"geometry": data_file, "delivery": manifest["id"], "provenance": model["provenance"]}
        source = str((ROOT / model["source"]).resolve().relative_to(ROOT))
        scene = node("scene", slug, model["title"], summary=model["summary"], tags=model["tags"],
                     scene=slug, source=source, sourceLink=os.path.relpath(ROOT / source, output), children=[], meshParts=[p["slug"] for p in model["parts"] if p["visible"]])
        parts = {part["slug"]: part for part in model["parts"]}
        for key, obj in model["objects"].items():
            entry = node("object", f"{slug}/{key}", obj["title"], scene=slug, source=source, sourceLink=os.path.relpath(ROOT / source, output), children=[],
                         tags=obj["tags"], meshParts=obj["parts"], rig=obj.get("rig"), variantOf=obj.get("variantOf"))
            scene["children"].append(entry["id"])
            for part_id in obj["parts"]:
                part = parts[part_id]
                detail = node("part", f"{slug}/{part_id}", part["title"], scene=slug, source=source, sourceLink=os.path.relpath(ROOT / source, output),
                              summary=part["description"], tags=sorted(set(obj["tags"] + [part["role"]])),
                              meshParts=[part_id], children=[], meshes=part["meshes"], bounds=part["bounds"])
                entry["children"].append(detail["id"])
                for mesh in part["meshes"]:
                    name = Path(mesh["textures"]["color"]).stem
                    material_key = name if mesh["role"] != "water" else "water-surface"
                    material_id = f"material/{material_key}"
                    bindings = {**mesh["textures"]}
                    if mesh["role"] == "water":
                        bindings.update(model["waterResources"])
                    maps = []
                    for role, path in bindings.items():
                        label, color, channels = ROLES[role]
                        tex = texture(path, files[path], ["map"])
                        if label.lower() not in nodes[tex]["tags"]:
                            nodes[tex]["tags"].append(label.lower())
                        maps.append(dict(texture=tex, role=label, colorSpace=color, channels=channels, uv="UV0"))
                    if material_id not in nodes:
                        node("material", material_key, material_key.replace("-", " "), tags=[name.rsplit("-", 1)[-1]],
                             bindings=maps, children=list(dict.fromkeys(m["texture"] for m in maps)))
                    elif nodes[material_id]["bindings"] != maps:
                        raise ValueError(f"{material_id}: inconsistent bindings")
                    if material_id not in detail["children"]:
                        detail["children"].append(material_id)

    if not scenes or (selected and selected != scenes.keys()):
        raise ValueError("One or more selected scenes have no verified delivery")
    for entry in nodes.values():
        for child in entry.get("children", []):
            nodes[child].setdefault("usedBy", []).append(entry["id"])
    # Finish delivery verification and catalog projection before touching output.
    data = json.dumps(dict(nodes=nodes, scenes=scenes), ensure_ascii=True, separators=(",", ":"))
    output.mkdir(parents=True, exist_ok=True)
    (output / "textures").mkdir(exist_ok=True)
    for name, payload in outputs.items():
        (output / name).write_bytes(payload)
    for name in ("index.html", "gallery.js", "viewer.js", "style.css"):
        copyfile(ROOT / "web" / name, output / name)
    (output / "catalog.js").write_text("window.DCC_CATALOG=" + data + ";\n")
    for delivery, folder in sources.items():
        print(f"Delivery {delivery}: {folder}")
    print(f"Built catalog for {len(scenes)} scene(s), {len(nodes)} records at {output / 'index.html'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deliveries", type=Path, help="Use only this directory and its catalog index")
    parser.add_argument("--output", type=Path, default=ROOT.parent / ".local/dcc/gallery")
    parser.add_argument("scene", nargs="*")
    args = parser.parse_args()
    build(args.deliveries, args.output, set(args.scene))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit(f"DCC gallery failed: {error}")
