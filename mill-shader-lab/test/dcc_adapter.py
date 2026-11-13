"""Check the Lab's pinned import without access to the DCC authoring code."""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

LAB = Path(__file__).resolve().parents[1]
DCC = LAB.parent / "dcc"
sys.path.insert(0, str(LAB.parent))
from dcc.delivery import default_deliveries  # noqa: E402


class AdapterTest(unittest.TestCase):
    def test_adapter_prepares_all_pins_and_rejects_missing_joint(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            lab = root / "lab"
            tools = lab / "tools"
            tools.mkdir(parents=True)
            for name in ("build_scene_gallery.py", "scene_gallery_practice.py",
                         "scene_gallery_practice_maps.py", "scene_shots.json"):
                shutil.copyfile(LAB / "tools" / name, tools / name)
            delivery = root / "dcc"
            delivery.mkdir()
            shutil.copyfile(DCC / "delivery.py", delivery / "delivery.py")
            lock = json.loads((LAB / "dcc-lock.json").read_text())
            path = lab / "dcc-lock.json"
            path.write_text(json.dumps(lock))
            output = root / "prepared"
            command = [sys.executable, str(tools / "build_scene_gallery.py"),
                       "--deliveries", str(default_deliveries(LAB.parent)), "--output", str(output)]
            subprocess.run(command, capture_output=True, check=True)
            self.assertEqual({p.parent.name for p in output.glob("*/waterline.json")}, set(lock["scenes"]))
            lock["scenes"]["glasshouse"]["requiredJoints"].append("missing-test-joint")
            path.write_text(json.dumps(lock))
            rejected = root / "rejected"
            bad = subprocess.run(command[:-1] + [str(rejected), "glasshouse"], capture_output=True, text=True)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("required joint binding is missing", bad.stderr)
            self.assertFalse(rejected.exists())


if __name__ == "__main__":
    unittest.main()
