#!/usr/bin/env python3
"""Prepare the Lab's local scene assets from pinned DCC deliveries."""

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import re
import sys
import zipfile

from scene_gallery_practice import practice
from scene_gallery_practice_maps import write_resources

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB.parent))
from dcc.delivery import ReleaseRef, VerifiedRelease, delivery_roots, encode, load_release, safe_path  # noqa: E402

ROOT = LAB.parent / ".local/mill-assets/scene-gallery"
ORDER = ["weather-station", "ferry-landing", "glasshouse", "night-market", "puppet-yard"]
MATERIAL_NOTES = {
    "weather-station": "Compare the sandstone joints, long timber grain and highlights on the copper roof.",
    "ferry-landing": "Follow the UVs along the curved eaves and compare the plaster with the lattice and roof tiles.",
    "glasshouse": "Compare the painted iron frame and glazed pond tiles. Look for the same texel scale across adjacent faces.",
    "night-market": "Use the shutter slats and pipe bends to compare painted metal, wood and masonry.",
    "puppet-yard": "Compare lacquer highlights on the dragon with the timber and folded backdrop.",
}


@dataclass(frozen=True)
class SceneInput:
    slug: str
    release: VerifiedRelease
    model: dict


def load_scene(slug: str, pin: dict, roots: tuple[Path, ...]) -> SceneInput:
    if (not isinstance(pin, dict) or not isinstance(pin.get("id"), str)
            or not isinstance(pin.get("manifestSha256"), str)
            or any(not isinstance(pin.get(key), list) or not all(isinstance(item, str) for item in pin[key])
                   for key in ("requiredParts", "requiredJoints"))):
        raise ValueError(f"{slug}: invalid delivery pin")
    delivery = pin["id"]
    if not re.fullmatch(rf"{re.escape(slug)}-[0-9a-f]{{16}}", delivery):
        raise ValueError(f"{slug}: invalid locked delivery ID")
    release = load_release(ReleaseRef(delivery, pin["manifestSha256"]), roots=roots)
    manifest, data = release.manifest, release.files
    model = json.loads(data["scene.json"])
    if not isinstance(model, dict):
        raise ValueError(f"{slug}: invalid scene model")
    if manifest["scene"] != slug or model["scene"] != slug or model["axes"] != "y-up":
        raise ValueError(f"{slug}: delivery scene or axes do not match")
    if {m["role"] for m in model["meshes"]} != {"opaque", "water"}:
        raise ValueError(f"{slug}: lesson needs separate opaque and water geometry")
    parts = {part["slug"] for part in model["parts"]}
    active_parts = {mesh["part"] for mesh in model["meshes"]}
    if not set(pin["requiredParts"]) <= active_parts <= parts:
        raise ValueError(f"{slug}: a required part binding is missing")
    joints = {joint["id"] for rig in model["rigs"] for joint in rig["joints"]}
    if not set(pin["requiredJoints"]) <= joints:
        raise ValueError(f"{slug}: a required joint binding is missing")
    geo = model["geometry"]
    contact = model["waterResources"]["contact"]
    if not safe_path(geo) or geo not in data or contact not in data:
        raise ValueError(f"{slug}: missing geometry or contact texture")
    for part in model["parts"]:
        for mesh in part["meshes"]:
            maps = mesh["textures"]
            if set(maps) != {"color", "normal", "specular", "reflection", "refraction"} or any(path not in data for path in maps.values()):
                raise ValueError(f"{slug}: missing texture binding for {part['slug']}")
    return SceneInput(slug, release, model)


def prepare(scene: SceneInput, staging: dict, root: Path) -> dict:
    slug, model, data = scene.slug, scene.model, scene.release.files
    geo = model["geometry"]
    contact = model["waterResources"]["contact"]
    target = root / slug
    target.mkdir(parents=True, exist_ok=True)
    for name, content in data.items():
        if name == "scene.json":
            continue
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    write_resources(target)
    shots = staging["shots"]
    for shot in shots:
        (target / f"{shot['slug']}.json").write_bytes(encode(dict(
            version=1, axes="x,z,-y", scene=model["title"], geometry=geo, meshes=model["meshes"],
            waterline={**{key: shot[key] for key in ("target", "offset", "fov", "near", "far", "sun")}, "subject": staging["subject"]},
            practice=practice(slug, shots, shot),
            nightLights=model["lights"], rigs=model["rigs"],
            resources=dict(flow="maps/practice-flow.png", foam=contact, smoke="maps/practice-smoke.png",
                           grain="maps/black.png", neutralLut="maps/practice-neutral-lut.png",
                           dayLut="maps/practice-day-lut.png", nightLut="maps/practice-night-lut.png"),
        )))
    return dict(slug=slug, title=model["title"], concept=model["concept"], summary=model["summary"],
                subject=staging["subject"], shots=shots, parts=model["parts"],
                materialNote=MATERIAL_NOTES[slug], creatures=[rig["name"] for rig in model["rigs"]])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT)
    parser.add_argument("--deliveries", type=Path, help="Read locked deliveries only from this directory")
    parser.add_argument("scene", nargs="*", choices=None)
    args = parser.parse_args()
    locks = json.loads((LAB / "dcc-lock.json").read_text())
    if not isinstance(locks, dict) or locks.get("version") != 1 or not isinstance(locks.get("scenes"), dict):
        raise ValueError("Unsupported Shader Lab DCC lock version")
    staging = json.loads((LAB / "tools/scene_shots.json").read_text())
    roots = delivery_roots(LAB.parent, args.deliveries)
    inputs = []
    for slug in args.scene or ORDER:
        if slug not in locks["scenes"]:
            raise ValueError(f"{slug}: no DCC delivery pinned")
        inputs.append((load_scene(slug, locks["scenes"][slug], roots), staging[slug]))
    entries = [prepare(scene, settings, args.output) for scene, settings in inputs]
    if not args.scene:
        (args.output / "catalog.json").write_bytes(encode(entries))
    for scene, _ in inputs:
        print(f"Delivery {scene.release.manifest['id']}: {scene.release.folder}")
    print(f"Prepared {len(entries)} pinned scene(s) at {args.output}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        raise SystemExit(f"Lab asset preparation failed: {error}")
