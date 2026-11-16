"""Keep the refined props closed and usable through the authored-asset interface."""

from collections import Counter, defaultdict
import math
import unittest

from sources.pond_objects import make_object
from sources.scene_gallery_station_ferry import build_ferry


def closed_volumes(part):
    edges = Counter()
    neighbors = defaultdict(set)
    volumes = defaultdict(float)
    for geometry in part.materials.values():
        if not all(math.isfinite(value) for value in geometry.vertices):
            raise AssertionError(f"{part.slug}: nonfinite vertex attributes")
        for start in range(0, len(geometry.indices), 3):
            a, b, c = [tuple(round(value, 8) for value in geometry.vertices[index*14:index*14+3])
                       for index in geometry.indices[start:start+3]]
            ab, ac = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
            cross = (ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0])
            if math.hypot(*cross) < 1e-12:
                raise AssertionError(f"{part.slug}: degenerate triangle")
            for u, v in ((a, b), (b, c), (c, a)):
                edges[tuple(sorted((u, v)))] += 1
                neighbors[u].add(v)
                neighbors[v].add(u)
            volumes[a] += (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2])
                           + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6
    if any(count != 2 for count in edges.values()):
        raise AssertionError(f"{part.slug}: an open or multiply shared edge")
    unseen = set(neighbors)
    result = []
    while unseen:
        pending = [unseen.pop()]
        volume = 0
        while pending:
            vertex = pending.pop()
            volume += volumes[vertex]
            adjacent = neighbors[vertex] & unseen
            unseen.difference_update(adjacent)
            pending.extend(adjacent)
        result.append(volume)
    return result


class ArtGeometryTest(unittest.TestCase):
    def test_koi_shells_and_fins_remain_closed_with_vertical_tail_fans(self):
        for name in ("amber-koi", "vermilion-koi"):
            model = make_object(name)
            for part in model.parts.values():
                with self.subTest(asset=name, part=part.slug):
                    self.assertTrue(all(volume > 0 for volume in closed_volumes(part)))
            low, high = model.parts[f"{name}-fork"].bounds
            self.assertGreater(high[1]-low[1], 2*(high[2]-low[2]))

    def test_planter_has_recessed_soil_and_a_closed_wall(self):
        pot = make_object("terracotta-planter").parts["terracotta-planter"]
        self.assertTrue(all(volume > 0 for volume in closed_volumes(pot)))
        soil = pot.materials[("473b2b", "flat")]
        self.assertLess(max(soil.vertices[1::14]), pot.bounds[1][1]-.04)

    def test_ridges_are_two_continuous_closed_landforms(self):
        ridge = build_ferry().parts["river-ridges"]
        volumes = closed_volumes(ridge)
        self.assertEqual(len(volumes), 2)
        self.assertTrue(all(volume > 0 for volume in volumes))


if __name__ == "__main__":
    unittest.main()
