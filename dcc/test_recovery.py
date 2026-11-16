"""Recovery contract checks using the real five kits and an in-memory service."""

from contextlib import ExitStack, redirect_stdout
import io
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

import recovery
from delivery import DeliveryUnavailable, ReleaseRef, delivery_roots, load_release


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
            selected = recovery.read_json(recovery.DCC / "deliveries/index.json")
            locks = recovery.read_json(recovery.DCC.parent / "mill-shader-lab/dcc-lock.json")
            refs = {identifier: ReleaseRef(identifier) for identifier in selected["scenes"].values()}
            refs.update({pin["id"]: ReleaseRef(pin["id"], pin["manifestSha256"]) for pin in locks["scenes"].values()})
            originals = {identifier: load_release(ref, roots=delivery_roots(recovery.DCC.parent))
                         for identifier, ref in refs.items()}
            # Always retain two revisions, even when the checkout's catalog matches its lock.
            pinned = originals[locks["scenes"]["weather-station"]["id"]]
            selected_id = "weather-station-0000000000000001"
            current = Path(temp) / "selected" / selected_id
            current.mkdir(parents=True)
            (current / "manifest.json").write_bytes(recovery.encode({**pinned.manifest, "id": selected_id}))
            for name, data in pinned.files.items():
                path = current / "files" / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            refs[selected_id] = ReleaseRef(selected_id)
            originals[selected_id] = load_release(refs[selected_id], roots=(current.parent,))
            selected["scenes"]["weather-station"] = selected_id
            # Exercise a real recovery plan with required revisions split across roots.
            repo = Path(temp) / "repo"
            dcc = repo / "dcc"
            shutil.copytree(recovery.DCC / "sources", dcc / "sources")
            shutil.copyfile(recovery.DCC / "build.py", dcc / "build.py")
            recovery.put_json(dcc / "deliveries/index.json", selected)
            recovery.put_json(repo / "mill-shader-lab/dcc-lock.json", locks)
            roots = delivery_roots(repo)
            for i, (identifier, release) in enumerate(originals.items()):
                folder = roots[i % 2] / identifier
                folder.mkdir(parents=True)
                (folder / "manifest.json").write_bytes((release.folder / "manifest.json").read_bytes())
                for name, data in release.files.items():
                    path = folder / "files" / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(data)
            import build
            scope.enter_context(patch.object(recovery, "DCC", dcc))
            scope.enter_context(patch.object(build, "ROOT", dcc))
            plan = recovery.prepare(work, {})
            self.assertTrue(set(refs) <= plan["deliveries"].keys())
            self.assertEqual(plan["selected"], selected["scenes"])
            self.assertEqual(set(plan["working"]), set(selected["scenes"]))
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
                        self.assertEqual(manifest, (originals[delivery].folder / "manifest.json").read_bytes())
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
        pin = recovery.read_json(recovery.DCC.parent / "mill-shader-lab/dcc-lock.json")["scenes"]["weather-station"]
        release = load_release(ReleaseRef(pin["id"], pin["manifestSha256"]), roots=delivery_roots(recovery.DCC.parent))
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            dcc = repo / "dcc"
            recovery.put_json(dcc / "deliveries/index.json", {"version": 1, "scenes": {}})
            recovery.put_json(repo / "mill-shader-lab/dcc-lock.json", {
                "version": 1, "scenes": {"weather-station": pin,
                                          "missing": {"id": "missing-pin", "manifestSha256": "0" * 64}}})
            folder = dcc / "deliveries" / pin["id"]
            folder.mkdir()
            (folder / "manifest.json").write_bytes((release.folder / "manifest.json").read_bytes())
            for name, data in release.files.items():
                target = folder / "files" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            work = repo / "work"
            with patch.object(recovery, "DCC", dcc), self.assertRaises(DeliveryUnavailable):
                recovery.prepare(work, {})
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
