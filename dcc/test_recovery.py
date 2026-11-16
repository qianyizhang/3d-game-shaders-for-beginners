"""Recovery contract checks with authored fixtures and an in-memory service."""

from contextlib import ExitStack, redirect_stdout
import io
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

import build
import recovery
from delivery import DeliveryUnavailable, delivery_roots
from test_delivery import write_release


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
        with tempfile.TemporaryDirectory() as temp, redirect_stdout(io.StringIO()), ExitStack() as scope:
            work = Path(temp) / "work"
            repo = Path(temp) / "repo"
            dcc = repo / "dcc"
            shutil.copytree(recovery.DCC / "sources", dcc / "sources")
            shutil.copyfile(recovery.DCC / "build.py", dcc / "build.py")
            scope.enter_context(patch.object(recovery, "DCC", dcc))
            scope.enter_context(patch.object(build, "ROOT", dcc))

            # Keep two authentic-format revisions in different roots without downloading reviewed art.
            scene = "weather-station"
            restored_root, selected_root = delivery_roots(repo)
            pinned = build.make_candidate(scene, restored_root)
            pinned_manifest, files = recovery.read_release(pinned)
            current = selected_root / f"{scene}-0000000000000001"
            recovery.put_json(current / "manifest.json", {**pinned_manifest, "id": current.name})
            for name, data in files.items():
                target = current / "files" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            originals = {folder.name: (folder / "manifest.json").read_bytes() for folder in (pinned, current)}
            selected = {scene: current.name}
            recovery.put_json(selected_root / "index.json", {"version": 1, "scenes": selected})
            recovery.put_json(repo / "mill-shader-lab/dcc-lock.json", {"version": 1, "scenes": {
                scene: {"id": pinned.name, "manifestSha256": recovery.digest(originals[pinned.name])},
            }})

            plan = recovery.prepare(work, {})
            self.assertTrue(originals.keys() <= plan["deliveries"].keys())
            self.assertEqual(plan["selected"], selected)
            self.assertEqual(plan["working"].keys(), build.BUILDERS.keys())
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
                recovery.require_current_snapshot(work, snapshot)
                recovery.check_sources(snapshot)
                bad_source = {**snapshot, "sourceDigests": {"sources/catalog.json": "0" * 64}}
                with self.assertRaisesRegex(ValueError, "Git revision"):
                    recovery.check_sources(bad_source)
                recovery.restore(snapshot, Path(temp) / "restored")
                restored_index = recovery.read_json(Path(temp) / "restored/index.json")
                self.assertEqual(restored_index, recovery.read_json(recovery.DCC / "deliveries/index.json"))
                for delivery, entry in snapshot["deliveries"].items():
                    folder = Path(temp) / "restored" / delivery
                    manifest = (folder / "manifest.json").read_bytes()
                    if delivery in originals:
                        self.assertEqual(manifest, originals[delivery])
                    self.assertEqual(recovery.read_release(folder)[0]["files"], entry["release"]["files"])
                self.assertEqual(len(list((Path(temp) / "restored/_masters").iterdir())), 3)
                synced = recovery.prepare(Path(temp) / "resync", snapshot, Path(temp) / "restored")
                self.assertTrue(all("key" in row for row in synced["blobs"].values()))
                recovery.upload(Path(temp) / "resync", 9)
                self.assertEqual(len(posts), len(plan["blobs"]))

                drifted = {**snapshot, "working": {}}
                with self.assertRaisesRegex(ValueError, "assets changed"):
                    recovery.require_current_snapshot(work, drifted)

                store[posts[0]] = b"bad"
                with self.assertRaisesRegex(ValueError, "Wrong bytes"):
                    recovery.restore(snapshot, Path(temp) / "rejected")
                self.assertFalse((Path(temp) / "rejected").exists())

    def test_missing_required_pin_leaves_plan_and_existing_output_untouched(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            dcc = repo / "dcc"
            ref, _ = write_release(dcc / "deliveries", "weather-station-0000000000000001")
            pin = {"id": ref.id, "manifestSha256": ref.manifest_sha256}
            recovery.put_json(dcc / "deliveries/index.json", {"version": 1, "scenes": {}})
            recovery.put_json(repo / "mill-shader-lab/dcc-lock.json", {
                "version": 1, "scenes": {"weather-station": pin,
                                          "missing": {"id": "missing-pin", "manifestSha256": "0" * 64}}})
            work = repo / "work"
            with patch.object(recovery, "DCC", dcc), self.assertRaises(DeliveryUnavailable) as caught:
                recovery.prepare(work, {})
            self.assertEqual(caught.exception.required.id, "missing-pin")
            self.assertFalse(work.exists())
            work.mkdir()
            (work / "plan.json").write_bytes(b"existing plan")
            with patch.object(recovery, "DCC", dcc), self.assertRaises(DeliveryUnavailable):
                recovery.prepare(work, {})
            self.assertEqual({p.name: p.read_bytes() for p in work.iterdir()}, {"plan.json": b"existing plan"})

    def test_override_does_not_replace_repository_requirements(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            dcc = repo / "dcc"
            recovery.put_json(dcc / "deliveries/index.json", {"version": 1, "scenes": {"selected": "selected-revision"}})
            recovery.put_json(repo / "mill-shader-lab/dcc-lock.json", {"version": 1, "scenes": {}})
            explicit = repo / "explicit"
            recovery.put_json(explicit / "index.json", {"version": 1, "scenes": {}})
            with patch.object(recovery, "DCC", dcc), self.assertRaises(DeliveryUnavailable) as caught:
                recovery.prepare(repo / "work", {}, explicit)
            self.assertEqual(caught.exception.required.id, "selected-revision")
            self.assertEqual([path for path, _ in caught.exception.attempts], [explicit / "selected-revision"])
            self.assertFalse((repo / "work").exists())

    def test_missing_or_invalid_retention_metadata_fails_before_output(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            dcc = repo / "dcc"
            recovery.put_json(dcc / "deliveries/index.json", {"version": 1, "scenes": {}})
            work = repo / "work"
            with patch.object(recovery, "DCC", dcc), self.assertRaises(FileNotFoundError):
                recovery.prepare(work, {})
            self.assertFalse(work.exists())
            lock = repo / "mill-shader-lab/dcc-lock.json"
            for bad in ({}, {"version": 1, "scenes": {"scene": {"id": "scene-id", "manifestSha256": None}}}):
                recovery.put_json(lock, bad)
                with patch.object(recovery, "DCC", dcc), self.assertRaises(ValueError):
                    recovery.prepare(work, {})
                self.assertFalse(work.exists())

    def test_conflicting_pin_digests_are_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            dcc = repo / "dcc"
            recovery.put_json(dcc / "deliveries/index.json", {"version": 1, "scenes": {}})
            recovery.put_json(repo / "mill-shader-lab/dcc-lock.json", {"version": 1, "scenes": {
                "first": {"id": "same-revision", "manifestSha256": "0" * 64},
                "second": {"id": "same-revision", "manifestSha256": "1" * 64}}})
            with patch.object(recovery, "DCC", dcc), self.assertRaisesRegex(ValueError, "conflicting pinned"):
                recovery.prepare(repo / "work", {})
            self.assertFalse((repo / "work").exists())


if __name__ == "__main__":
    unittest.main()
