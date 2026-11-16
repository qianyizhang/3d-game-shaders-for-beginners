"""Check pinned imports and batch failure without access to DCC authoring code."""

import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

LAB = Path(__file__).resolve().parents[1]
DCC = LAB.parent / 'dcc'
sys.path.insert(0, str(LAB.parent))
from dcc.delivery import delivery_roots, digest, encode, read_release  # noqa: E402


class AdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lock = json.loads((LAB / 'dcc-lock.json').read_text())
        cls.releases = {}
        # Build fixtures before staging the isolated adapter. Keep the Lab's real
        # required bindings, but pin fixture manifests rather than reviewed bytes.
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([sys.executable, str(DCC / 'build.py'), '--output', temp,
                            *cls.lock['scenes']], check=True, stdout=subprocess.DEVNULL)
            for folder in sorted(Path(temp).iterdir()):
                manifest, files = read_release(folder)
                raw = (folder / 'manifest.json').read_bytes()
                slug = manifest['scene']
                cls.lock['scenes'][slug].update(id=folder.name, manifestSha256=digest(raw))
                cls.releases[slug] = (raw, files)
        if cls.releases.keys() != cls.lock['scenes'].keys():
            raise ValueError('Missing DCC adapter test fixtures')

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.lab = self.root / 'mill-shader-lab'
        tools = self.lab / 'tools'
        tools.mkdir(parents=True)
        for name in ('build_scene_gallery.py', 'scene_gallery_practice.py',
                     'scene_gallery_practice_maps.py', 'scene_shots.json'):
            shutil.copyfile(LAB / 'tools' / name, tools / name)
        dcc = self.root / 'dcc'
        dcc.mkdir()
        shutil.copyfile(DCC / 'delivery.py', dcc / 'delivery.py')
        self.roots = delivery_roots(self.root)
        self.inputs = {}
        self.locks = copy.deepcopy(self.lock)
        for i, slug in enumerate(self.releases):
            self.inputs[slug] = self.stage(slug, self.roots[i % 2])
        # Lab requirements must not depend on either catalog, even malformed ones.
        for root in self.roots:
            (root / 'index.json').write_text('unrelated invalid catalog')
        self.write_lock()
        self.output = self.root / 'prepared'
        self.command = [sys.executable, str(tools / 'build_scene_gallery.py'), '--output', str(self.output)]

    def stage(self, slug, root):
        folder = root / self.lock['scenes'][slug]['id']
        folder.mkdir(parents=True, exist_ok=True)
        manifest, files = self.releases[slug]
        (folder / 'manifest.json').write_bytes(manifest)
        for name, data in files.items():
            path = folder / 'files' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return folder

    def write_lock(self):
        (self.lab / 'dcc-lock.json').write_bytes(encode(self.locks))

    def run_adapter(self, *args):
        return subprocess.run([*self.command, *args], capture_output=True, text=True)

    def test_all_pins_prepare_from_split_sources_without_authoring_code(self):
        result = self.run_adapter()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual({p.parent.name for p in self.output.glob('*/waterline.json')}, set(self.lock['scenes']))
        self.assertEqual(len(json.loads((self.output / 'catalog.json').read_text())), len(self.lock['scenes']))
        for folder in self.inputs.values():
            self.assertIn(str(folder), result.stdout)

    def test_later_missing_pin_preserves_existing_output_and_subset_is_independent(self):
        shutil.rmtree(self.inputs['puppet-yard'])
        failed = self.run_adapter()
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn(self.lock['scenes']['puppet-yard']['id'], failed.stderr)
        self.assertFalse(self.output.exists())
        self.output.mkdir()
        (self.output / 'catalog.json').write_bytes(b'existing output')
        failed = self.run_adapter()
        self.assertNotEqual(failed.returncode, 0)
        self.assertEqual({p.name: p.read_bytes() for p in self.output.iterdir()}, {'catalog.json': b'existing output'})
        subset = self.run_adapter('weather-station')
        self.assertEqual(subset.returncode, 0, subset.stderr)

    def test_incompatible_later_pin_is_rejected_before_any_scene_is_written(self):
        self.locks['scenes']['glasshouse']['requiredJoints'].append('missing-test-joint')
        self.write_lock()
        failed = self.run_adapter()
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn('required joint binding is missing', failed.stderr)
        self.assertFalse(self.output.exists())

    def test_corrupt_pinned_manifest_is_rejected_before_output(self):
        path = self.inputs['puppet-yard'] / 'manifest.json'
        path.write_bytes(path.read_bytes() + b'\n')
        failed = self.run_adapter()
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn('manifest digest does not match the lock', failed.stderr)
        self.assertFalse(self.output.exists())

    def test_override_is_exclusive_and_ignores_broken_default_copy(self):
        explicit = self.root / 'explicit'
        failed = self.run_adapter('--deliveries', str(explicit), 'glasshouse')
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn(str(explicit), failed.stderr)
        self.assertNotIn(str(self.inputs['glasshouse']), failed.stderr)
        self.assertFalse(self.output.exists())
        self.stage('glasshouse', explicit)
        (self.inputs['glasshouse'] / 'manifest.json').write_text('invalid JSON')
        result = self.run_adapter('--deliveries', str(explicit), 'glasshouse')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual({p.name for p in self.output.iterdir()}, {'glasshouse'})

    def test_null_pin_digest_cannot_disable_verification(self):
        self.locks['scenes']['puppet-yard']['manifestSha256'] = None
        self.write_lock()
        failed = self.run_adapter()
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn('invalid delivery pin', failed.stderr)
        self.assertFalse(self.output.exists())

    def test_axes_roles_parts_and_map_bindings_are_preflighted(self):
        for field, message in (('axes', 'scene or axes'), ('roles', 'opaque and water'),
                               ('parts', 'required part'), ('maps', 'texture binding')):
            with self.subTest(field=field):
                slug = 'glasshouse'
                folder = self.stage(slug, self.inputs[slug].parent)
                model = json.loads(self.releases[slug][1]['scene.json'])
                if field == 'axes':
                    model['axes'] = 'z-up'
                elif field == 'roles':
                    for mesh in model['meshes']:
                        mesh['role'] = 'opaque'
                elif field == 'parts':
                    model['parts'] = []
                elif field == 'maps':
                    model['parts'][0]['meshes'][0]['textures']['normal'] = 'maps/missing.png'
                raw = encode(model)
                (folder / 'files/scene.json').write_bytes(raw)
                manifest = json.loads(self.releases[slug][0])
                manifest['files']['scene.json'] = digest(raw)
                raw_manifest = encode(manifest)
                (folder / 'manifest.json').write_bytes(raw_manifest)
                self.locks['scenes'][slug]['manifestSha256'] = digest(raw_manifest)
                self.write_lock()
                failed = self.run_adapter()
                self.assertNotEqual(failed.returncode, 0)
                self.assertIn(message, failed.stderr)
                self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
