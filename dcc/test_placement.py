"""Check that scene instances can change without altering object masters."""

from dataclasses import replace
import unittest

from sources.pond_objects import make_object
from sources.scene_gallery_glass_market import build_glasshouse, pond_placements


class PlacementTest(unittest.TestCase):
    def test_instance_lifecycle_preserves_shared_object_and_joint_ids(self):
        base = pond_placements()
        scene = build_glasshouse(base)
        planter = base[-1]
        double = build_glasshouse((*base, replace(planter, id="planter-copy", position=(2., .35, -1.))))
        self.assertEqual(set(double.parts) - set(scene.parts), {"planter-copy-terracotta-planter"})
        left = scene.parts["terracotta-planter"]
        right = double.parts["planter-copy-terracotta-planter"]
        self.assertEqual(left.materials, right.materials)
        self.assertNotEqual(left.origin, right.origin)
        removed = build_glasshouse(base[:-1])
        self.assertEqual(set(scene.parts) - set(removed.parts), {"terracotta-planter"})
        self.assertEqual(scene.rigs, removed.rigs)
        self.assertEqual(make_object("vermilion-koi").rigs[0]["joints"][0]["pivot"], (0, 0, 0))
        self.assertEqual(scene.rigs[1]["joints"][0]["pivot"], tuple(base[1].position))
        with self.assertRaisesRegex(ValueError, "Duplicate placed parts"):
            build_glasshouse((*base, planter))


if __name__ == "__main__":
    unittest.main()
