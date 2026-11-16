"""Delivery loading and gallery selection contracts through their production interfaces."""

import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from delivery import (DeliveryInvalid, DeliveryUnavailable, ReleaseRef, delivery_roots,
                      digest, encode, load_release, read_release)

DCC = Path(__file__).resolve().parent


def write_release(root: Path, identifier: str, *, restored: bool = False,
                  scene: str | None = None) -> tuple[ReleaseRef, dict[str, bytes]]:
    """Small portable fixture; consumer checks also exercise the real authored kits."""
    if scene is None:
        scene = identifier.rsplit('-', 1)[0]
    model = dict(scene=scene, title=scene, summary='Fixture', tags=[], source='sources/fixture.py',
                 geometry='mesh.bin', provenance={}, rigs=[], parts=[], objects={})
    files = {'scene.json': encode(model), 'mesh.bin': b'geometry'}
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        for name, data in files.items():
            archive.writestr(zipfile.ZipInfo(name), data)
    payload = stream.getvalue()
    manifest = encode(dict(format='dcc-scene-v1', id=identifier, scene=scene,
                           archiveSha256=digest(payload), files={name: digest(data) for name, data in files.items()}))
    folder = root / identifier
    folder.mkdir(parents=True)
    (folder / 'manifest.json').write_bytes(manifest)
    if restored:
        (folder / 'files').mkdir()
        for name, data in files.items():
            (folder / 'files' / name).write_bytes(data)
    else:
        (folder / 'payload.zip').write_bytes(payload)
    return ReleaseRef(identifier, digest(manifest)), files


class DeliveryTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.roots = (self.root / 'restored', self.root / 'local')
        self.identifier = 'scene-0123456789abcdef'

    def test_zip_and_restored_files_return_identical_verified_bytes(self):
        ref, files = write_release(self.roots[0], self.identifier, restored=True)
        write_release(self.roots[1], self.identifier)
        first = load_release(ref, roots=self.roots)
        second = load_release(ref, roots=self.roots[1:])
        self.assertEqual(first.folder, self.roots[0] / ref.id)
        self.assertEqual(first.manifest, second.manifest)
        self.assertEqual(first.files, files)
        self.assertEqual(first.files, second.files)
        first.files.clear()
        self.assertEqual(load_release(ref, roots=self.roots).files, files)

    def test_absent_metadata_only_and_lfs_copies_allow_fallback(self):
        ref, files = write_release(self.roots[1], self.identifier)
        for state in ('absent', 'metadata', 'lfs'):
            with self.subTest(state=state):
                if state == 'metadata':
                    write_release(self.roots[0], self.identifier)
                    (self.roots[0] / ref.id / 'payload.zip').unlink()
                elif state == 'lfs':
                    (self.roots[0] / ref.id / 'payload.zip').write_bytes(b'version https://git-lfs.github.com/spec/v1\n')
                loaded = load_release(ref, roots=self.roots)
                self.assertEqual(loaded.folder, self.roots[1] / ref.id)
                self.assertEqual(loaded.files, files)

    def test_missing_payload_lists_attempts_and_restore_action(self):
        ref, _ = write_release(self.roots[1], self.identifier)
        (self.roots[1] / ref.id / 'payload.zip').unlink()
        with self.assertRaises(DeliveryUnavailable) as caught:
            load_release(ref, roots=self.roots)
        error = caught.exception
        self.assertEqual(error.required, ref)
        self.assertEqual([folder for folder, _ in error.attempts], [root / ref.id for root in self.roots])
        self.assertIn('payload missing; use dcc/recovery.py restore', str(error))
        self.assertIsNotNone(error.__cause__)
        with self.assertRaises(DeliveryUnavailable):
            read_release(self.roots[1] / ref.id)

    def test_invalid_copies_stop_before_a_valid_second_copy(self):
        for damage in ('missing-manifest', 'malformed', 'identity', 'unsafe-path', 'member-hash',
                       'archive-hash', 'archive-members', 'invalid-zip', 'incomplete-files', 'dangling-folder'):
            with self.subTest(damage=damage), tempfile.TemporaryDirectory() as temp:
                roots = (Path(temp) / 'first', Path(temp) / 'second')
                ref, _ = write_release(roots[0], self.identifier, restored=damage in ('member-hash', 'incomplete-files'))
                write_release(roots[1], self.identifier)
                folder = roots[0] / ref.id
                path = folder / 'manifest.json'
                manifest = json.loads(path.read_bytes())
                if damage == 'missing-manifest':
                    path.unlink()
                elif damage == 'malformed':
                    path.write_text('[]')
                elif damage == 'identity':
                    manifest['id'] = 'another'
                    path.write_bytes(encode(manifest))
                elif damage == 'unsafe-path':
                    manifest['files']['../escape'] = '0' * 64
                    path.write_bytes(encode(manifest))
                elif damage == 'member-hash':
                    (folder / 'files/mesh.bin').write_bytes(b'corrupt')
                elif damage == 'incomplete-files':
                    (folder / 'files/mesh.bin').unlink()
                    shutil.copyfile(roots[1] / ref.id / 'payload.zip', folder / 'payload.zip')
                elif damage == 'archive-hash':
                    (folder / 'payload.zip').write_bytes(b'corrupt')
                elif damage in ('archive-members', 'invalid-zip'):
                    payload = b'not a ZIP'
                    if damage == 'archive-members':
                        stream = io.BytesIO()
                        with zipfile.ZipFile(stream, 'w') as archive:
                            archive.writestr('extra', b'unexpected')
                        payload = stream.getvalue()
                    (folder / 'payload.zip').write_bytes(payload)
                    manifest['archiveSha256'] = digest(payload)
                    path.write_bytes(encode(manifest))
                elif damage == 'dangling-folder':
                    shutil.rmtree(folder)
                    folder.symlink_to(Path(temp) / 'absent')
                with self.assertRaises(DeliveryInvalid) as caught:
                    load_release(ReleaseRef(ref.id), roots=roots)
                self.assertEqual(len(caught.exception.attempts), 1)
                self.assertEqual(caught.exception.attempts[0][0], folder)
                self.assertIn('--deliveries', str(caught.exception))

    def test_wrong_pin_stops_and_retains_prior_attempts(self):
        ref, _ = write_release(self.roots[1], self.identifier)
        with self.assertRaisesRegex(DeliveryInvalid, 'manifest digest does not match the lock') as caught:
            load_release(ReleaseRef(ref.id, '0' * 64), roots=self.roots)
        self.assertEqual(len(caught.exception.attempts), 2)

    def test_unreadable_copy_is_invalid_not_absent(self):
        ref, _ = write_release(self.roots[0], self.identifier)
        write_release(self.roots[1], self.identifier)
        original = Path.read_bytes
        blocked = self.roots[0] / ref.id / 'manifest.json'

        def read(path):
            if path == blocked:
                raise PermissionError('fixture denied')
            return original(path)

        with patch.object(Path, 'read_bytes', read), self.assertRaisesRegex(DeliveryInvalid, 'fixture denied') as caught:
            load_release(ref, roots=self.roots)
        self.assertEqual(len(caught.exception.attempts), 1)

    def test_reference_rejects_unsafe_ids_and_invalid_digests(self):
        for identifier in ('../escape', '/absolute', 'nested/release', '', None):
            with self.subTest(identifier=identifier), self.assertRaises(ValueError):
                ReleaseRef(identifier)
        with self.assertRaises(ValueError):
            ReleaseRef(self.identifier, 'not-a-digest')

    def test_source_scope_does_not_read_metadata(self):
        for name in ('dcc/deliveries/index.json', '.local/dcc/restored/index.json', 'mill-shader-lab/dcc-lock.json'):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('invalid JSON')
        self.assertEqual(delivery_roots(self.root), (self.root / '.local/dcc/restored', self.root / 'dcc/deliveries'))
        override = self.root / 'explicit'
        self.assertEqual(delivery_roots(self.root, override), (override,))

    def test_selected_deliveries_match_catalog(self):
        index = json.loads((DCC / 'deliveries/index.json').read_text())['scenes']
        for scene, identifier in index.items():
            with self.subTest(scene=scene):
                release = load_release(ReleaseRef(identifier), roots=delivery_roots(DCC.parent))
                self.assertEqual(release.manifest['scene'], scene)


class GallerySelectionTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.repo = Path(temp.name)
        self.dcc = self.repo / 'dcc'
        self.dcc.mkdir()
        for name in ('delivery.py', 'gallery.py'):
            shutil.copyfile(DCC / name, self.dcc / name)
        shutil.copytree(DCC / 'web', self.dcc / 'web')
        shutil.copytree(DCC / 'tools', self.dcc / 'tools')
        for name in ('types.d.ts', 'tsconfig.json', 'tsconfig.tools.json', 'package.json'):
            shutil.copyfile(DCC / name, self.dcc / name)
        (self.dcc / 'node_modules').symlink_to(DCC / 'node_modules', target_is_directory=True)
        self.local = self.dcc / 'deliveries'
        self.restored = self.repo / '.local/dcc/restored'
        self.output = self.repo / 'output'
        self.first, _ = write_release(self.restored, 'first-0123456789abcdef', restored=True)
        self.second, _ = write_release(self.local, 'second-0123456789abcdef')
        self.index(self.local, {'first': self.first.id, 'second': self.second.id})
        self.index(self.restored, {'first': self.first.id})

    def index(self, root, scenes):
        root.mkdir(parents=True, exist_ok=True)
        (root / 'index.json').write_bytes(encode(dict(version=1, scenes=scenes)))

    def run_gallery(self, *args):
        return subprocess.run([sys.executable, str(self.dcc / 'gallery.py'), '--output', str(self.output), *args],
                              capture_output=True, text=True)

    def test_catalog_uses_split_sources_despite_stale_index_and_unrelated_lab_pin(self):
        lock = self.repo / 'mill-shader-lab/dcc-lock.json'
        lock.parent.mkdir()
        for content in (encode(dict(scenes={'missing': {'id': 'missing-pin'}})), b'invalid JSON'):
            with self.subTest(lock=content):
                lock.write_bytes(content)
                result = self.run_gallery()
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(str(self.restored / self.first.id), result.stdout)
                self.assertIn(str(self.local / self.second.id), result.stdout)
                catalog = (self.output / 'catalog.js').read_text()
                self.assertIn(self.first.id, catalog)
                self.assertIn(self.second.id, catalog)

    def test_override_uses_its_catalog_without_default_metadata(self):
        (self.local / 'index.json').write_text('invalid JSON')
        result = self.run_gallery('--deliveries', str(self.restored))
        self.assertEqual(result.returncode, 0, result.stderr)
        catalog = (self.output / 'catalog.js').read_text()
        self.assertIn(self.first.id, catalog)
        self.assertNotIn(self.second.id, catalog)

    def test_override_does_not_fall_back_to_available_local_bytes(self):
        self.index(self.restored, {'second': self.second.id})
        result = self.run_gallery('--deliveries', str(self.restored))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(str(self.restored / self.second.id), result.stderr)
        self.assertNotIn(str(self.local), result.stderr)
        self.assertFalse(self.output.exists())

    def test_later_missing_delivery_preserves_output(self):
        self.index(self.local, {'first': self.first.id, 'second': 'second-missing'})
        result = self.run_gallery()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())
        self.output.mkdir()
        (self.output / 'catalog.js').write_bytes(b'existing output')
        result = self.run_gallery()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual({p.name: p.read_bytes() for p in self.output.iterdir()}, {'catalog.js': b'existing output'})
        subset = self.run_gallery('first')
        self.assertEqual(subset.returncode, 0, subset.stderr)

    def test_source_symlink_outside_dcc_is_rejected_before_output(self):
        outside = self.repo / 'outside'
        outside.mkdir()
        (self.dcc / 'sources').symlink_to(outside, target_is_directory=True)
        result = self.run_gallery()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())

    def test_type_error_keeps_last_generated_gallery(self):
        self.output.mkdir()
        (self.output / 'catalog.js').write_bytes(b'existing output')
        source = self.dcc / 'web/catalog-model.ts'
        source.write_text(source.read_text() + '\nconst invalid: number = "bad";\n')
        result = self.run_gallery()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Type', result.stderr)
        self.assertEqual({p.name: p.read_bytes() for p in self.output.iterdir()}, {'catalog.js': b'existing output'})

    def test_invalid_projection_preserves_the_existing_gallery(self):
        folder = self.local / self.second.id
        manifest, original = read_release(folder)
        self.output.mkdir()
        (self.output / 'catalog.js').write_bytes(b'existing output')
        for damage in ('wrong-source', 'wrong-tags', 'unknown-part'):
            with self.subTest(damage=damage):
                files = dict(original)
                model = json.loads(files['scene.json'])
                if damage == 'wrong-source':
                    model['source'] = 42
                elif damage == 'wrong-tags':
                    model['tags'] = 42
                else:
                    model['objects'] = {'broken': {'title': 'Broken', 'tags': [], 'parts': ['missing']}}
                files['scene.json'] = encode(model)
                stream = io.BytesIO()
                with zipfile.ZipFile(stream, 'w') as archive:
                    for name, data in files.items():
                        archive.writestr(name, data)
                payload = stream.getvalue()
                changed = {**manifest, 'archiveSha256': digest(payload),
                           'files': {name: digest(data) for name, data in files.items()}}
                (folder / 'payload.zip').write_bytes(payload)
                (folder / 'manifest.json').write_bytes(encode(changed))
                result = self.run_gallery()
                self.assertNotEqual(result.returncode, 0)
                if damage == 'wrong-source':
                    self.assertIn('second: missing or invalid working source path', result.stderr)
                self.assertEqual({p.name: p.read_bytes() for p in self.output.iterdir()}, {'catalog.js': b'existing output'})

    def test_scene_names_cannot_escape_or_collide_with_gallery_files(self):
        self.output.mkdir()
        (self.output / 'catalog.js').write_bytes(b'existing output')
        for i, slug in enumerate(('../escaped', 'catalog', 'gallery')):
            with self.subTest(slug=slug):
                ref, _ = write_release(self.local, f'fixture-{i}', scene=slug)
                self.index(self.local, {slug: ref.id})
                result = self.run_gallery()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn(slug, result.stderr)
        self.assertFalse((self.repo / 'escaped.js').exists())
        self.assertEqual({p.name: p.read_bytes() for p in self.output.iterdir()}, {'catalog.js': b'existing output'})

    def test_missing_compiler_has_setup_action_and_preserves_output(self):
        (self.dcc / 'node_modules').unlink()  # Only the fixture symlink.
        result = self.run_gallery()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('npm ci --prefix dcc', result.stderr)
        self.assertFalse(self.output.exists())

    def test_malformed_authoritative_catalog_does_not_use_restored_index(self):
        (self.local / 'index.json').write_text('invalid JSON')
        result = self.run_gallery()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
