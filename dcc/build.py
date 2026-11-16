"""Build or verify immutable DCC delivery candidates. No Shader Lab imports."""

import argparse
import io
import json
from pathlib import Path
import tempfile
import zipfile

from delivery import FORMAT, digest, encode, read_release
from sources import scene_gallery_geometry
from sources.scene_gallery_glass_market import build_glasshouse, build_market
from sources.scene_gallery_puppet import build_puppet
from sources.scene_gallery_station_ferry import build_ferry, build_station

ROOT = Path(__file__).resolve().parent
BUILDERS = {key: (fn, module) for key, fn, module in (
    ("glasshouse", build_glasshouse, "scene_gallery_glass_market.py"),
    ("weather-station", build_station, "scene_gallery_station_ferry.py"),
    ("ferry-landing", build_ferry, "scene_gallery_station_ferry.py"),
    ("night-market", build_market, "scene_gallery_glass_market.py"),
    ("puppet-yard", build_puppet, "scene_gallery_puppet.py"),
)}

def make_candidate(slug: str, output: Path) -> Path:
    build, module = BUILDERS[slug]
    scene = build()
    meta = json.loads((ROOT / "sources/catalog.json").read_text())
    declared = meta["scenes"][slug]["objects"]
    if declared.keys() & scene.instances.keys():
        raise ValueError(f"{slug}: duplicate object instance ID")
    objects = {**declared, **scene.instances}
    assigned = [part for obj in objects.values() for part in obj["parts"]]
    if sorted(assigned) != sorted(scene.parts):
        raise ValueError(f"{slug}: objects must assign each authored part exactly once")
    rigs = {rig["name"] for rig in scene.rigs}
    if {obj["rig"] for obj in objects.values() if "rig" in obj} != rigs:
        raise ValueError(f"{slug}: catalog rig assignments do not match the authored rigs")
    if any(obj.get("variantOf", key) not in objects for key, obj in objects.items()):
        raise ValueError(f"{slug}: unknown variant source")

    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        model = scene_gallery_geometry.export(scene, work)
        model.update(
            objects=objects, tags=meta["scenes"][slug]["tags"], provenance=meta["provenance"],
            source=f"sources/{module}",
        )
        resources = {path for part in model["parts"] for mesh in part["meshes"] for path in mesh["textures"].values()}
        # The contact pattern belongs to the art; the Lab owns animated flow, smoke and LUTs.
        model["waterResources"] = {"contact": "maps/contact.png"}
        resources.add("maps/contact.png")
        files = {key: (work / key).read_bytes() for key in sorted(resources | {"geometry.bin"})}
        files["scene.json"] = encode(model)
    fingerprint = {
        name: digest((ROOT / name).read_bytes())
        for name in ["build.py", "sources/catalog.json", "sources/scene_gallery_geometry.py", f"sources/{module}"]
    }
    if slug == "glasshouse":
        for name in ("sources/pond_objects.py", "sources/placement.py", "sources/scenes/glasshouse.json"):
            fingerprint[name] = digest((ROOT / name).read_bytes())
    if slug in {"glasshouse", "puppet-yard"}:
        fingerprint["sources/motions.py"] = digest((ROOT / "sources/motions.py").read_bytes())
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo(name)
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, content)
    payload = archive.getvalue()
    identity = digest(encode({"archive": digest(payload), "sources": fingerprint}))
    delivery = f"{slug}-{identity[:16]}"
    folder = output / delivery
    manifest = {
        "id": delivery, "scene": slug, "format": FORMAT, "sourceDigests": fingerprint,
        "archiveSha256": digest(payload), "files": {name: digest(data) for name, data in files.items()},
    }
    if folder.exists():
        read_release(folder, digest(encode(manifest)))
    else:
        folder.mkdir(parents=True)
        (folder / "payload.zip").write_bytes(payload)
        (folder / "manifest.json").write_bytes(encode(manifest))
    return folder


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", nargs="*", choices=None, metavar="SCENE")
    parser.add_argument("--output", type=Path, default=ROOT.parent / ".local/dcc/candidates")
    parser.add_argument("--verify", action="store_true", help="Verify deliveries already under --output")
    args = parser.parse_args()
    if args.verify:
        folders = sorted(path for path in args.output.iterdir() if (path / "manifest.json").is_file())
        if not folders:
            parser.error("no deliveries found")
        for folder in folders:
            read_release(folder)
            print(f"Verified {folder.name}")
        return
    for slug in args.scene or BUILDERS:
        if slug not in BUILDERS:
            parser.error(f"unknown scene: {slug}")
        print(make_candidate(slug, args.output))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        raise SystemExit(str(error))
