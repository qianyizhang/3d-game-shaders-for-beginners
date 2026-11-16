"""Generate a read-only, offline catalog from verified deliveries."""

import argparse
import base64
import json
import subprocess
from pathlib import Path

from delivery import ReleaseRef, delivery_roots, load_release

ROOT = Path(__file__).resolve().parent


def build(deliveries: Path | None, output: Path, selected: set[str]) -> None:
    roots = delivery_roots(ROOT.parent, deliveries)
    index_path = (deliveries if deliveries is not None else ROOT / "deliveries") / "index.json"
    index = json.loads(index_path.read_text())
    if (not isinstance(index, dict) or index.get("version") != 1
            or not isinstance(index.get("scenes"), dict) or not selected <= index["scenes"].keys()):
        raise ValueError(f"{index_path}: invalid delivery index or unknown scene")
    scenes = []
    sources: dict[str, Path] = {}
    for slug, delivery in sorted(index["scenes"].items()):
        if selected and slug not in selected:
            continue
        release = load_release(ReleaseRef(delivery), roots=roots)
        manifest, files = release.manifest, release.files
        model = json.loads(files["scene.json"])
        if not isinstance(model, dict) or manifest["scene"] != slug or model.get("scene") != slug:
            raise ValueError(f"Delivery does not match catalog scene {slug}")
        # Preserve the existing source-link policy, including symlink resolution.
        source = model.get("source")
        if not isinstance(source, str) or not source:
            raise ValueError(f"{slug}: missing or invalid working source path")
        model["source"] = str((ROOT / source).resolve().relative_to(ROOT))
        scenes.append(dict(slug=slug, delivery=manifest["id"], model=model,
                           files={name: base64.b64encode(data).decode() for name, data in files.items()}))
        sources[delivery] = release.folder
    if not scenes:
        raise ValueError(f"{index_path}: no scenes in the catalog")
    # Python remains the sole owner of exact-release selection and verification.
    # The checked TS producer and browser share the catalog/motion contracts.
    request = dict(sourceRoot=str(ROOT), output=str(output.resolve()), scenes=scenes)
    result = subprocess.run(["node", str(ROOT / "tools/generate.mjs")],
                            input=json.dumps(request), text=True, capture_output=True)
    if result.returncode:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or "TypeScript gallery build failed")
    for delivery, folder in sources.items():
        print(f"Delivery {delivery}: {folder}")
    print(result.stdout, end="")


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
