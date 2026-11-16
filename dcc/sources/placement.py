"""Place object masters while preserving UVs and joint relationships."""

from copy import deepcopy
from dataclasses import dataclass
from math import cos, sin

from .scene_gallery_geometry import Geometry, Part, Scene, Vec3, add, scale


@dataclass(frozen=True)
class Placement:
    id: str
    asset: str
    position: Vec3
    scale: float = 1
    yaw: float = 0


def place(scene: Scene, master: Scene, instance: Placement) -> list[str]:
    if master.slug != instance.asset or instance.scale <= 0:
        raise ValueError(f"Invalid placement for {instance.id}")
    prefix = "" if instance.id == instance.asset else f"{instance.id}-"
    aliases = {part: prefix + part for part in master.parts}
    if scene.parts.keys() & aliases.values():
        raise ValueError(f"Duplicate placed parts for {instance.id}")
    c, s = cos(instance.yaw), sin(instance.yaw)

    def rotate(v: Vec3) -> Vec3:
        x, y, z = v
        return x*c-z*s, y, x*s+z*c

    def point(v: Vec3) -> Vec3:
        return add(instance.position, scale(rotate(v), instance.scale))

    for name, part in master.parts.items():
        dest = Part(aliases[name], part.title, part.description, role=part.role, visible=part.visible)
        dest.origin = point(part.origin)
        dest.points = [scale(rotate(p), instance.scale) for p in part.points]
        for material, geo in part.materials.items():
            result = Geometry(indices=list(geo.indices))
            for i in range(0, len(geo.vertices), 14):
                p, n = geo.vertices[i:i+3], geo.vertices[i+3:i+6]
                uv = geo.vertices[i+6:i+8]
                tangent, bitangent = geo.vertices[i+8:i+11], geo.vertices[i+11:i+14]
                result.vertices.extend((*scale(rotate(tuple(p)), instance.scale), *rotate(tuple(n)),
                                        *uv, *rotate(tuple(tangent)), *rotate(tuple(bitangent))))
            dest.materials[material] = result
        scene.parts[dest.slug] = dest
    for rig in master.rigs:
        joints = []
        for joint in rig["joints"]:
            values = {**joint, "id": prefix+joint["id"], "pivot": point(joint["pivot"]), "axis": rotate(joint["axis"]),
                      "parts": [aliases[p] for p in joint["parts"]]}
            if "parent" in joint:
                values["parent"] = prefix+joint["parent"]
            joints.append(values)
        placed = {"name": rig["name"] if not prefix else instance.id, "joints": joints}
        if "clips" in rig:
            placed["clips"] = [{**deepcopy(clip), "tracks": {prefix+key: deepcopy(value)
                                for key,value in clip["tracks"].items()}} for clip in rig["clips"]]
        scene.rigs.append(placed)
    return list(aliases.values())
