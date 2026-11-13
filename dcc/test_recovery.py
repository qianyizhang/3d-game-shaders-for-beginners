"""Recovery contract checks using the real five kits and an in-memory service."""

from contextlib import redirect_stdout
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

import recovery
from delivery import default_deliveries


class RecoveryTest(unittest.TestCase):
    def test_restore_rejects_dangling_destination_symlink_before_downloading(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "output"
            output.symlink_to(Path(temp) / "missing")
            plan = dict(version=1, namespace=recovery.NAMESPACE, endpoint=recovery.BASE)
            with self.assertRaisesRegex(ValueError, "new restore destination"):
                recovery.restore(plan, output)
            self.assertTrue(output.is_symlink())

    def test_public_download_recovers_from_a_transient_failure(self):
        data = b"geometry"
        row = {"key": f"library/{recovery.NAMESPACE}/test", "bytes": len(data)}
        with patch.object(recovery, "request", side_effect=[URLError("disconnect"), data]), patch.object(recovery.time, "sleep"):
            self.assertEqual(recovery.get_blob(recovery.digest(data), row), data)

    def test_clean_restore_matches_pins_and_rejects_bad_bytes(self):
        with tempfile.TemporaryDirectory() as temp, redirect_stdout(io.StringIO()):
            work = Path(temp) / "work"
            originals = default_deliveries(recovery.DCC.parent)
            plan = recovery.prepare(work, {}, originals)
            store = {}
            posts = []

            def request(path, params, data=None, headers=None):
                if path == "/api/upload":
                    self.assertEqual(recovery.digest(data), headers["x-content-sha256"])
                    self.assertTrue(params["folder"].startswith(recovery.NAMESPACE + "/"))
                    key = f"library/{params['folder']}/{recovery.digest(data)}--{params['name']}"
                    store[key] = data
                    posts.append(key)
                    return recovery.encode({"key": key})
                self.assertEqual(path, "/download")
                return store[params["key"]]

            with patch.object(recovery, "request", request), patch.object(recovery, "password", return_value="synthetic"):
                recovery.upload(work, 9)
                with self.assertRaisesRegex(ValueError, "incomplete"):
                    recovery.final_manifest(work)
                while len(posts) < len(plan["blobs"]):
                    recovery.upload(work, 9)
                snapshot = recovery.final_manifest(work)
                recovery.require_current_snapshot(work, snapshot, originals)
                recovery.check_sources(snapshot)
                bad_source = {**snapshot, "sourceDigests": {"sources/catalog.json": "0" * 64}}
                with self.assertRaisesRegex(ValueError, "Git revision"):
                    recovery.check_sources(bad_source)
                recovery.restore(snapshot, Path(temp) / "restored")
                restored_index = recovery.read_json(Path(temp) / "restored/index.json")
                self.assertEqual(restored_index, recovery.read_json(recovery.DCC / "deliveries/index.json"))
                for delivery, entry in snapshot["deliveries"].items():
                    folder = Path(temp) / "restored" / delivery
                    original = originals / delivery
                    manifest = (folder / "manifest.json").read_bytes()
                    if original.exists():
                        self.assertEqual(manifest, (original / "manifest.json").read_bytes())
                    self.assertEqual(recovery.read_release(folder)[0]["files"], entry["release"]["files"])
                self.assertEqual(len(list((Path(temp) / "restored/_masters").iterdir())), 3)
                synced = recovery.prepare(Path(temp) / "resync", snapshot, Path(temp) / "restored")
                self.assertTrue(all("key" in row for row in synced["blobs"].values()))
                recovery.upload(Path(temp) / "resync", 9)
                self.assertEqual(len(posts), len(plan["blobs"]))

                drifted = {**snapshot, "working": {}}
                with self.assertRaisesRegex(ValueError, "assets changed"):
                    recovery.require_current_snapshot(work, drifted, originals)

                store[posts[0]] = b"bad"
                with self.assertRaisesRegex(ValueError, "Wrong bytes"):
                    recovery.restore(snapshot, Path(temp) / "rejected")
                self.assertFalse((Path(temp) / "rejected").exists())


if __name__ == "__main__":
    unittest.main()
