"""Contract checks for reading the selected DCC deliveries."""

import json
from pathlib import Path
import shutil
import tempfile
import unittest

from delivery import default_deliveries, read_release

DCC = Path(__file__).resolve().parent
DELIVERIES = default_deliveries(DCC.parent)


class DeliveryTest(unittest.TestCase):
    def test_metadata_only_release_points_to_restore(self):
        with tempfile.TemporaryDirectory() as temp:
            release = Path(temp) / "glasshouse-6fe1d62e8dd2d304"
            release.mkdir()
            shutil.copyfile(DCC / "deliveries" / release.name / "manifest.json", release / "manifest.json")
            with self.assertRaisesRegex(ValueError, "payload missing; use dcc/recovery.py restore"):
                read_release(release)

    def test_stale_restore_does_not_hide_new_pins(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            restored = repo / ".local/dcc/restored"
            restored.mkdir(parents=True)
            (restored / "index.json").write_text('{"version": 1, "scenes": {}}')
            lock = repo / "mill-shader-lab/dcc-lock.json"
            lock.parent.mkdir()
            lock.write_text('{"scenes": {"glasshouse": {"id": "glasshouse-next"}}}')
            self.assertEqual(default_deliveries(repo), repo / "dcc/deliveries")
            (restored / "glasshouse-next").mkdir()
            (restored / "glasshouse-next/manifest.json").write_text('{}')
            self.assertEqual(default_deliveries(repo), restored)

    def test_selected_deliveries_match_catalog(self):
        index = json.loads((DCC / "deliveries/index.json").read_text())["scenes"]
        for scene, delivery in index.items():
            with self.subTest(scene=scene):
                manifest, _ = read_release(DELIVERIES / delivery)
                self.assertEqual(manifest["scene"], scene)


if __name__ == "__main__":
    unittest.main()
