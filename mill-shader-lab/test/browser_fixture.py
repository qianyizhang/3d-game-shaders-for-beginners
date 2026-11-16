"""Build an unreviewed Glasshouse candidate for the browser smoke test only."""

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

LAB = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(LAB.parent / "dcc"), str(LAB / "tools")]
from build import make_candidate  # noqa: E402
from build_scene_gallery import load_scene, prepare  # noqa: E402
from delivery import digest  # noqa: E402


def main(output: Path) -> None:
    slug = "glasshouse"
    pin = json.loads((LAB / "dcc-lock.json").read_text())["scenes"][slug]
    shots = json.loads((LAB / "tools/scene_shots.json").read_text())[slug]
    with TemporaryDirectory() as temp:
        candidate = make_candidate(slug, Path(temp))
        # Check the same required bindings against a fresh, verified candidate.
        pin.update(id=candidate.name, manifestSha256=digest((candidate / "manifest.json").read_bytes()))
        prepare(load_scene(slug, pin, (candidate.parent,)), shots, output)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
