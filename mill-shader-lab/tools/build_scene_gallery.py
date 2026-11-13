#!/usr/bin/env python3
"""Prepare the Lab's local scene assets from pinned DCC deliveries."""

import argparse
import json
from pathlib import Path
import re
import sys
import zipfile

from scene_gallery_practice import practice
from scene_gallery_practice_maps import write_resources

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB.parent))
from dcc.delivery import default_deliveries, encode, read_release, safe_path  # noqa: E402

ROOT = LAB.parent / ".local/mill-assets/scene-gallery"
ORDER = ["weather-station", "ferry-landing", "glasshouse", "night-market", "puppet-yard"]
MATERIAL_NOTES = {
    "weather-station": "Compare the sandstone joints, long timber grain and highlights on the copper roof.",
    "ferry-landing": "Follow the UVs along the curved eaves and compare the plaster with the lattice and roof tiles.",
    "glasshouse": "Compare the painted iron frame and glazed pond tiles. Look for the same texel scale across adjacent faces.",
    "night-market": "Use the shutter slats and pipe bends to compare painted metal, wood and masonry.",
    "puppet-yard": "Compare lacquer highlights on the dragon with the timber and folded backdrop.",
}


def prepare(slug: str, pin: dict, staging: dict, deliveries: Path, root: Path) -> dict:
    delivery = pin["id"]
    if not re.fullmatch(rf"{re.escape(slug)}-[0-9a-f]{{16}}", delivery):
        raise ValueError(f"{slug}: invalid locked delivery ID")
    manifest, data = read_release(deliveries / delivery, pin["manifestSha256"])
    model = json.loads(data["scene.json"])
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
    parser.add_argument("--deliveries", type=Path, default=default_deliveries(LAB.parent))
    parser.add_argument("scene", nargs="*", choices=None)
    args = parser.parse_args()
    locks = json.loads((LAB / "dcc-lock.json").read_text())
    if locks["version"] != 1:
        raise ValueError("Unsupported Shader Lab DCC lock version")
    staging = json.loads((LAB / "tools/scene_shots.json").read_text())
    entries = []
    for slug in args.scene or ORDER:
        if slug not in locks["scenes"]:
            raise ValueError(f"{slug}: no DCC delivery pinned")
        entries.append(prepare(slug, locks["scenes"][slug], staging[slug], args.deliveries, args.output))
    if not args.scene:
        (args.output / "catalog.json").write_bytes(encode(entries))
    print(f"Prepared {len(entries)} pinned scene(s) at {args.output}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        raise SystemExit(f"Lab asset preparation failed: {error}")
