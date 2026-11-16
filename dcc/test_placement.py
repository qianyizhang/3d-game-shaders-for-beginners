"""Check that scene instances can change without altering object masters."""

from dataclasses import replace
import unittest

from sources.pond_objects import make_object
from sources.placement import Placement, place
from sources.scene_gallery_geometry import Scene
from sources.scene_gallery_puppet import BODY, build_puppet
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


    def test_puppet_neck_branches_at_its_shared_torso_join(self):
        joints = {joint["id"]: joint for joint in build_puppet().rigs[0]["joints"]}
        self.assertNotIn("parent", joints["dragon-body"])
        self.assertEqual(joints["dragon-chest"]["pivot"], BODY[2][0])
        self.assertEqual(joints["dragon-chest"]["parent"], "dragon-body")
        self.assertEqual(joints["dragon-head"]["parent"], "dragon-chest")
        self.assertEqual(joints["dragon-tail-1"]["parent"], "dragon-body")

    def test_copied_rig_remaps_clip_tracks_without_mutating_the_master(self):
        master = make_object("amber-koi")
        scene = Scene("copies", "Copies", "", "")
        place(scene, master, Placement("second-koi", "amber-koi", (2, 1, -1), .8, .7))
        rig = scene.rigs[0]
        ids = {joint["id"] for joint in rig["joints"]}
        self.assertEqual(rig["name"], "second-koi")
        for clip in rig["clips"]:
            self.assertEqual(set(clip["tracks"]), ids)
        first = next(iter(rig["clips"][0]["tracks"]))
        rig["clips"][0]["tracks"][first]["amplitude"] = 999
        self.assertNotEqual(next(iter(master.rigs[0]["clips"][0]["tracks"].values()))["amplitude"], 999)


if __name__ == "__main__":
    unittest.main()
