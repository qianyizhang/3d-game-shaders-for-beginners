"""A lacquered water puppet and its workshop, built from authored meshes."""

from __future__ import annotations

from math import cos, pi, sin, tau
from typing import TYPE_CHECKING

from .scene_gallery_geometry import Scene

if TYPE_CHECKING:
    from .scene_gallery_geometry import Part

Vec3 = tuple[float, float, float]
Link = tuple[Vec3, float]

TEAL = "2f8279"
LIGHT_TEAL = "58a49a"
DARK_TEAL = "214e4a"
GOLD = "edb753"
DARK_GOLD = "b87a36"
RED = "b64537"
DARK_RED = "652c2b"
CREAM = "f5dfac"
INK = "272a2c"
TIMBER = "795344"
TIMBER_LIGHT = "aa7452"
TIMBER_DARK = "4c3632"
STONE = "b3a68c"

# Knuckles are explicit pose data. The tail uses the same segmented
# construction in both poses; gaps and brass pins mark the pivot locations.
BODY: tuple[Link, ...] = (
    ((-2.45, .81, -.38), .29),
    ((-1.90, .56, -.28), .41),
    ((-1.28, .52, -.13), .45),
    ((-.66, .51, .12), .38),
    ((-.08, .44, .34), .28),
)
TAIL_DIPPED: tuple[Link, ...] = (
    BODY[-1],
    ((.48, .26, .58), .23),
    ((1.00, .07, .91), .18),
    ((1.44, -.19, 1.22), .135),
    ((1.88, -.43, 1.31), .095),
)
TAIL_RAISED: tuple[Link, ...] = (
    BODY[-1],
    ((.48, .57, .58), .23),
    ((.94, .68, .91), .18),
    ((1.36, .88, 1.11), .135),
    ((1.70, 1.13, 1.14), .095),
)


def _lerp(a: Vec3, b: Vec3, t: float) -> Vec3:
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def _arc(part: Part, color: str, points: list[Vec3], width: float, surface: str = "flat") -> None:
    for a, b in zip(points, points[1:]):
        part.tube(color, a, b, width, sides=6, surface=surface)


def _fin(part: Part, edge: list[Vec3], tips: list[Vec3], width: float,
         color: str = RED, trim: str = GOLD) -> None:
    """Carve a thick, two-sided flame or crest, then line its front edge."""
    front = lambda p: (p[0], p[1], p[2] + width / 2)
    back = lambda p: (p[0], p[1], p[2] - width / 2)
    for a, b, c, d in zip(edge, edge[1:], tips, tips[1:]):
        section = [a, b, d, c]
        if (b[0]-a[0]) * (c[1]-a[1]) - (b[1]-a[1]) * (c[0]-a[0]) < 0:
            section.reverse()
        part.face(color, [front(p) for p in section], surface="lacquer")
        part.face(DARK_RED, [back(p) for p in reversed(section)], surface="lacquer")
        for u, v in [(a, b), (d, c)]:
            part.face(DARK_GOLD, [front(u), back(u), back(v), front(v)], surface="lacquer")
    for u, v in [(tips[0], edge[0]), (edge[-1], tips[-1])]:
        part.face(trim, [front(u), back(u), back(v), front(v)], surface="lacquer")
    _arc(part, trim, [front(p) for p in tips], .026, "lacquer")


def _head(part: Part) -> None:
    # Rounded wood masses stay separate at the mouth: muzzle, lower jaw and
    # inset throat give the head an open expression in the three-quarter view.
    ellipsoid = part.ellipsoid
    ellipsoid(DARK_TEAL, (-2.39, .88, -.37), (.33, .54, .28), surface="lacquer")
    ellipsoid(DARK_GOLD, (-2.58, .93, -.35), (.37, .48, .31), surface="lacquer")
    ellipsoid(TEAL, (-2.48, 1.30, -.36), (.48, .46, .34), surface="lacquer")
    ellipsoid(INK, (-2.78, 1.13, -.34), (.45, .15, .25), surface="lacquer")
    ellipsoid(RED, (-2.97, 1.055, -.33), (.43, .086, .25), surface="lacquer")
    ellipsoid(GOLD, (-2.99, .995, -.34), (.48, .095, .27), surface="lacquer")
    ellipsoid(DARK_GOLD, (-2.95, 1.325, -.32), (.48, .17, .32), surface="lacquer")
    ellipsoid(GOLD, (-3.14, 1.42, -.32), (.33, .14, .28), surface="lacquer")
    ellipsoid(RED, (-3.15, 1.27, -.32), (.27, .044, .268), surface="lacquer")
    ellipsoid(DARK_RED, (-3.21, 1.445, -.085), (.095, .063, .048), surface="lacquer")
    ellipsoid(INK, (-3.24, 1.443, -.050), (.055, .036, .026), surface="lacquer")
    ellipsoid(DARK_RED, (-3.21, 1.445, -.555), (.095, .063, .048), surface="lacquer")

    for side in (-1, 1):
        z = -.36 + side * .291
        ellipsoid(DARK_GOLD, (-2.65, 1.47, z), (.29, .236, .092), surface="lacquer")
        ellipsoid(INK, (-2.70, 1.48, z + side * .066), (.218, .167, .067), surface="lacquer")
        ellipsoid(CREAM, (-2.71, 1.48, z + side * .097), (.175, .135, .064), surface="lacquer")
        ellipsoid(INK, (-2.752, 1.483, z + side * .149), (.078, .094, .040), surface="lacquer")
        ellipsoid("fff4d9", (-2.785, 1.526, z + side * .183), (.026, .024, .016), surface="lacquer")
        brow = [(-2.94, 1.57, z + side*.102), (-2.80, 1.66, z + side*.147),
                (-2.63, 1.68, z + side*.128), (-2.48, 1.61, z + side*.083)]
        _arc(part, GOLD, brow, .047, "lacquer")
        # Teeth are set into the red lip; two front fangs break its silhouette.
        for i in range(6):
            x = -3.29 + i*.103
            y = 1.245 + (i % 2)*.008
            tooth = .115 if i == 3 else .052
            part.tube(CREAM, (x, y, -.32 + side*.228),
                      (x + .012, y - tooth, -.32 + side*.228), .028,
                      end_radius=.007, sides=6, surface="lacquer")

    for row, dx in enumerate((.0, .07, .13)):
        y = 1.37 - row*.14
        _fin(part, [(-2.46, y-.18, -.060), (-2.28, y-.14, -.055), (-2.14, y-.11, -.056)],
             [(-2.41, y+.01, -.055), (-2.19+dx, y+.06, -.059),
              (-1.98+dx, y+.20, -.065)], .078, (TEAL, RED, DARK_TEAL)[row])

    # Curving antlers, a rear horn, and a thin moustache add distinct carved
    # silhouettes rather than relying on generic sphere primitives.
    for z in (-.49, -.17):
        curve = [(-2.63, 1.65, z), (-2.52, 1.79, z), (-2.31, 1.86, z),
                 (-2.22, 2.02, z), (-2.17, 2.16, z)]
        for i, (a, b) in enumerate(zip(curve, curve[1:])):
            part.tube(GOLD, a, b, (.083, .072, .049, .027)[i],
                      end_radius=(.072, .049, .027, .006)[i], sides=9, surface="lacquer")
        part.tube(DARK_GOLD, (-2.51, 1.79, z), (-2.49, 1.96, z),
                  .047, end_radius=.008, sides=8, surface="lacquer")
    _fin(part, [(-2.43, 1.60, -.35), (-2.27, 1.64, -.35), (-2.16, 1.50, -.35)],
         [(-2.39, 1.74, -.35), (-2.21, 1.77, -.35), (-2.04, 1.93, -.35)], .12)
    _arc(part, DARK_GOLD, [(-3.11, 1.35, -.075), (-3.35, 1.30, .005),
                           (-3.55, 1.24, .030), (-3.58, 1.36, .034)], .019, "lacquer")
    for i, (x, y, z) in enumerate([(-2.71, .74, -.08), (-2.60, .67, -.075), (-2.49, .59, -.070)]):
        ellipsoid((GOLD, TEAL, GOLD)[i], (x, y, z), (.103, .074, .036), surface="lacquer")


def _links(part: Part, path: tuple[Link, ...], first: int = 0) -> None:
    for i, ((a, ra), (b, rb)) in enumerate(zip(path, path[1:]), start=first):
        start, stop = _lerp(a, b, .070), _lerp(a, b, .930)
        radius = (ra + rb) / 2
        # Slim dark knuckle below each painted cap; a raised ring defines
        # the edge of the turned wooden shell and catches the incident light.
        part.tube(INK, a, b, radius*.63, end_radius=rb*.61, sides=10, surface="wood")
        for t0, t1, c, r0, r1 in [
            (.07, .145, DARK_GOLD, ra*.89, ra*.98),
            (.145, .57, TEAL, ra*.98, radius*1.09),
            (.57, .855, LIGHT_TEAL if i % 2 == 0 else TEAL, radius*1.09, rb*.96),
            (.855, .93, GOLD, rb*.96, rb*.84),
        ]:
            part.tube(c, _lerp(a, b, t0), _lerp(a, b, t1), r0, end_radius=r1,
                      sides=14, surface="lacquer")
        # The lower lacquer stripe and brass pin heads are actual geometry.
        z = (start[2]+stop[2])*.5 + radius*.68
        y = (start[1]+stop[1])*.5 - radius*.43
        _arc(part, RED, [(start[0], start[1]-radius*.38, z-.10),
                         ((start[0]+stop[0])*.5, y, z),
                         (stop[0], stop[1]-radius*.30, z+.04)],
             radius*.105, "lacquer")
        for side in (-1, 1):
            pin = (b[0], b[1], b[2]+side*rb*.76)
            part.tube(DARK_GOLD, pin, (pin[0], pin[1], pin[2]+side*.042),
                      rb*.26, sides=9, surface="metal")
            part.tube(CREAM, (pin[0], pin[1], pin[2]+side*.043),
                      (pin[0], pin[1], pin[2]+side*.054), rb*.105, sides=8, surface="metal")
        # Repeated fan-shaped painted scales facing the viewer.
        for t, row in ((.34, 0), (.64, 1)):
            x0, y0, z0 = _lerp(a, b, t)
            size = radius * .31
            z0 += radius*(1.025 if row == 0 else .950)
            y0 += (1-2*row)*radius*.18
            points = [(x0 + size*cos(pi*j/8), y0 + size*sin(pi*j/8), z0)
                      for j in range(9)]
            _arc(part, GOLD, points, radius*.047, "lacquer")

        if radius > .135:
            crest = [(a[0]+.1, a[1]+ra*.72, a[2]),
                     ((a[0]+b[0])*.5, (a[1]+b[1])*.5+radius*.88, (a[2]+b[2])*.5),
                     (b[0]-.052, b[1]+rb*.70, b[2])]
            tips = [(crest[0][0]+.005, crest[0][1]+.042, crest[0][2]),
                    (crest[1][0]+.04, crest[1][1]+radius*.64, crest[1][2]),
                    (crest[2][0]+.12, crest[2][1]+radius*.60, crest[2][2])]
            _fin(part, crest, tips, radius*.26)


def _tail_fan(part: Part, tip: Link, raise_tip: bool) -> None:
    (x, y, z), r = tip
    direction = 1 if raise_tip else -1
    # Separate carved fan at the last hinge. Its red and gold edges give
    # learners a clean line to trace on either side of the water.
    base = [(x-.05, y-r*.25, z), (x+.17, y+direction*.09-.04, z+.01),
            (x+.40, y+direction*.18-.07, z+.03)]
    tip = [(x+.07, y+.115, z), (x+.39, y+.19+direction*.13, z+.015),
           (x+.58, y+.21+direction*.24, z+.035)]
    _fin(part, base, tip, .095, RED)
    _arc(part, CREAM, [(x+.015, y-.025, z+.055), (x+.20, y+direction*.052+.03, z+.063),
                        (x+.41, y+direction*.11+.075, z+.077)], .019, "lacquer")


def _dragon(scene: Scene) -> None:
    joints = []

    def hinge(part: Part, pivot: Vec3, axis: Vec3, amplitude: float,
              speed: float, reverse: bool = False, pose_limit: int = 14) -> None:
        # Opposite phases let adjoining links flex in different directions.
        joint = dict(id=part.slug, pivot=pivot, axis=axis, amplitude=amplitude,
                     phase=pi if reverse else 0, speed=speed, parts=[part.slug], poseLimit=pose_limit, label=part.title)
        if joints:
            joint["parent"] = joints[-1]["id"]
        joints.append(joint)

    yaw = (0, 1, 0)
    dip = (0, 0, 1)
    head = scene.part("dragon-head", "Lacquered dragon head", "Carved snout, antlers, open jaws and painted cheek fins.")
    _head(head)
    hinge(head, BODY[0][0], yaw, .036, 2.05)
    chest = scene.part("dragon-chest", "Dragon chest links", "The first two turned shells share a hinged neck pivot.")
    _links(chest, BODY[:3])
    hinge(chest, BODY[0][0], yaw, .050, 2.40, True)
    torso = scene.part("dragon-body", "Dragon body links", "Gilt seams, painted scales and a brass pin at the tail root.")
    _links(torso, BODY[2:], first=2)
    hinge(torso, BODY[2][0], yaw, .065, 2.10)
    for i, (label, axis, amplitude, speed, reverse) in enumerate([
        ("Tail root", yaw, .12, 2.45, False),
        ("Tail shoulder", dip, .040, 2.75, True),
        ("Submerged tail link", yaw, .16, 2.55, True),
        ("Tail tip and fan", dip, .050, 3.30, False),
    ]):
        slug = f"dragon-tail-{i + 1}"
        link = scene.part(slug, label, "A lacquered shell and brass hinge on the articulated tail.")
        _links(link, TAIL_DIPPED[i:i + 2], first=i)
        if i == len(TAIL_DIPPED) - 2:
            _tail_fan(link, TAIL_DIPPED[-1], False)
        hinge(link, TAIL_DIPPED[i][0], axis, amplitude, speed, reverse, (24, 18, 32, 18)[i])
    scene.rigs.append(dict(name="Water dragon", joints=joints))

    raised = scene.part("dragon-raised", "Raised puppet pose", "The same head and body with the tail joints angled up.")
    raised.visible = False
    _head(raised)
    _links(raised, BODY)
    _links(raised, TAIL_RAISED)
    _tail_fan(raised, TAIL_RAISED[-1], True)


def _shelter(part: Part) -> None:
    box, tube = part.box, part.tube
    for x in (-4.85, -1.57, 2.12):
        for z in (-3.15, -1.35):
            box(TIMBER_DARK, (x-.14, .31, z-.14, x+.14, 3.33, z+.14), .035, "wood")
            box(DARK_GOLD, (x-.16, .31, z-.16, x+.16, .45, z+.16), .024, "wood")
        for side in (-1, 1):
            # Short diagonal braces below the front beam.
            end = (x + .47*side, 3.18, -1.34)
            if -5.04 < end[0] < 2.33:
                tube(TIMBER, (x, 2.68, -1.34), end, .096, sides=4, surface="wood")
    box(TIMBER, (-5.12, 3.10, -1.49, 2.39, 3.37, -1.23), .037, "wood")
    box(TIMBER, (-5.12, 3.17, -3.29, 2.39, 3.45, -3.03), .029, "wood")
    for i in range(15):
        x = -4.98 + i*.515
        tube(TIMBER_DARK, (x, 3.31, -3.50), (x, 3.37, -2.49), .088, sides=4, surface="wood")
        tube(TIMBER_DARK, (x, 3.37, -2.49), (x, 3.25, -.96), .088, sides=4, surface="wood")
    # Distinct roof courses and rounded tiles, with a brass-colored edge.
    faces = [(-3.52, 3.44, -2.45, 3.79), (-2.45, 3.79, -.89, 3.38)]
    for z0, y0, z1, y1 in faces:
        part.face(DARK_RED, [(-5.18, y0, z0), (-5.18, y1, z1),
                             (2.48, y1, z1), (2.48, y0, z0)], surface="clay")
        for i in range(34):
            x = -5.12 + i*.224
            color = ("97604c", "a86b53", "b8795c", "9d5944")[i % 4]
            tube(color, (x, y0+.018, z0), (x, y1+.018, z1),
                 .084, sides=7, surface="clay")
    tube("b77f57", (-5.21, 3.84, -2.45), (2.53, 3.84, -2.45),
         .106, sides=10, surface="clay")


def _backdrop(part: Part) -> None:
    box, tube = part.box, part.tube
    tube(DARK_GOLD, (-4.52, 2.93, -2.85), (-1.82, 2.93, -2.85),
         .048, sides=9, surface="metal")
    for i in range(15):
        x = -4.47 + i*.175
        z = -2.835 + .025*cos(i*pi/2)
        color = ("783934", "824039", "8e473b", "823b33")[i % 4]
        box(color, (x, 1.00, z-.04, x+.18, 2.90, z), .009)
    box(DARK_GOLD, (-4.47, .99, -2.83, -1.84, 1.045, -2.78), .012)
    box(DARK_GOLD, (-4.47, 2.83, -2.83, -1.84, 2.89, -2.78), .012)
    for i in range(19):
        x = -4.43 + i*.140
        tube(DARK_GOLD, (x, 1.02, -2.79), (x, .955-(i % 3)*.010, -2.79),
             .014, sides=5)
    # A five-petal lotus and rows of gilt wave crests are modeled as painted
    # pieces on the curtain so the artwork reads from oblique views too.
    cx, cy, z = -3.17, 2.22, -2.765
    for dx, peak, base in [(-.50, .19, -.23), (-.31, .35, -.14), (0, .47, 0),
                           (.31, .35, .14), (.50, .19, .23)]:
        outline = [(cx+base-.085, cy-.09, z), (cx+dx-.080, cy+peak*.61, z),
                   (cx+dx, cy+peak, z), (cx+dx+.080, cy+peak*.61, z),
                   (cx+base+.085, cy-.09, z)]
        for i in range(1, len(outline)-1):
            points = [outline[0], outline[i+1], outline[i]]
            part.face(RED if abs(dx) < .35 else "b85e40", points)
        _arc(part, GOLD, outline, .013)
    _arc(part, "a6a36c", [(cx, cy-.075, z), (cx-.04, cy-.22, z),
                          (cx-.10, cy-.39, z)], .018)
    for row in range(2):
        for i in range(6):
            x = -4.35 + i*.417 + row*.07
            y = 1.31+row*.21
            path = [(x + .20*(1-cos(pi*j/10)),
                     y + .165*sin(pi*j/10), -2.756) for j in range(11)]
            _arc(part, TEAL if row == 0 else DARK_TEAL, path, .043)
            _arc(part, DARK_GOLD, [(X, Y+.040, Z+.01) for X, Y, Z in path], .015)


def _bench(part: Part) -> None:
    box = part.box
    box(TIMBER_DARK, (-1.33, .43, -2.62, 1.65, .99, -1.83), .025, "wood")
    for x in (-1.26, 1.45):
        for z in (-2.55, -1.90):
            box(TIMBER, (x-.063, .34, z-.067, x+.063, 1.09, z+.067), .018, "wood")
    for i in range(5):
        z = -2.68+i*.197
        box(TIMBER_LIGHT if i % 2 else TIMBER, (-1.40, 1.05, z, 1.71, 1.17, z+.181),
            .024, "wood")
    for x in (-1.15, .11, 1.30):
        box(TIMBER_LIGHT, (x, .65, -1.825, x+.26, .94, -1.785), .017, "wood")
        box(DARK_GOLD, (x+.08, .766, -1.782, x+.19, .802, -1.749), .008, "metal")
    for x in (.79, 1.21):
        for z in (-1.76, -1.48):
            box(TIMBER_DARK, (x-.037, .345, z-.037, x+.037, .65, z+.037), .012, "wood")
    box(TIMBER, (.70, .65, -1.84, 1.34, .76, -1.38), .028, "wood")


def _craft(part: Part) -> None:
    box, tube, ellipsoid = part.box, part.tube, part.ellipsoid
    # One framed swatch panel, one blank carving, paint pots and two tools.
    box(TIMBER_LIGHT, (.30, 1.177, -2.56, 1.37, 1.70, -2.465), .025, "wood")
    for i, color in enumerate((GOLD, RED, TEAL, CREAM)):
        x = .37+i*.229
        box(color, (x, 1.34, -2.461, x+.17, 1.58, -2.447), .004, "lacquer")
        box(DARK_GOLD, (x+.02, 1.262, -2.459, x+.156, 1.281, -2.442), .003)
    box(TIMBER_LIGHT, (-.46, 1.18, -2.43, -.08, 1.34, -2.12), .038, "wood")
    ellipsoid("c09561", (-.27, 1.34, -2.25), (.13, .095, .098), surface="wood")
    for i, color in enumerate((RED, TEAL, DARK_GOLD)):
        x = -1.20+i*.22
        tube(color, (x, 1.174, -2.31), (x, 1.33+i*.018, -2.31),
             .085, end_radius=.099, sides=10, surface="clay")
        tube(INK, (x, 1.33+i*.018, -2.31), (x, 1.345+i*.018, -2.31), .076, sides=10)
        tube(CREAM, (x-.01, 1.29, -2.32), (x+.061, 1.60+i*.04, -2.26),
             .017, end_radius=.010, sides=6, surface="wood")
    tube(TIMBER_LIGHT, (-.43, 1.20, -2.010), (-.14, 1.20, -1.956),
         .033, sides=7, surface="wood")
    tube("bbb7a5", (-.15, 1.20, -1.956), (.021, 1.195, -1.924),
         .023, end_radius=.012, sides=5, surface="metal")
    tube(TIMBER, (.26, 1.208, -1.985), (.42, 1.208, -2.164), .025, sides=6, surface="wood")
    tube(TIMBER_DARK, (.357, 1.225, -2.204), (.47, 1.225, -2.130), .046, sides=7, surface="wood")


def _lighting(part: Part) -> None:
    tube, ellipsoid = part.tube, part.ellipsoid
    x, z = -2.30, -1.73
    tube(INK, (x, 3.49, z), (x, 2.90, z), .026, sides=8, surface="metal")
    tube(DARK_GOLD, (x, 2.89, z), (x, 2.64, z),
         .103, end_radius=.32, sides=16, surface="metal")
    tube(GOLD, (x, 2.649, z), (x, 2.612, z), .321, end_radius=.286, sides=16, surface="metal")
    ellipsoid("ffd488", (x, 2.592, z), (.144, .105, .144), sides=14, surface="lacquer")
    # A nested clay vessel stands near the far post. The charcoal is opaque
    # geometry; this asset does not pretend to run a smoke simulation.
    x, z = 2.54, -1.35
    tube(DARK_RED, (x, .348, z), (x, .62, z), .192, end_radius=.31, sides=13, surface="clay")
    tube(RED, (x, .63, z), (x, .694, z), .317, end_radius=.313, sides=13, surface="clay")
    tube(INK, (x, .69, z), (x, .700, z), .265, sides=13)
    for dx, dz in ((.08, .06), (-.08, .11), (.018, -.077), (-.14, -.022)):
        ellipsoid("644337", (x+dx, .699, z+dz), (.067, .041, .060), sides=7, rings=4)
        ellipsoid("d67b40", (x+dx+.012, .725, z+dz), (.022, .011, .017), sides=6, rings=3)


def _courtyard(part: Part) -> None:
    box, tube = part.box, part.tube
    box("7b6557", (-5.34, -1.02, -3.88, 5.06, .24, -.83), .06, "stone")
    for row in range(5):
        z = -3.84 + row*.60
        for i in range(18):
            x = -5.31 + i*.573
            color = ("a27560", "b0846c", "b29076", "a37b66")[(i + row*3) % 4]
            box(color, (x, .244, z, x+.550, .344, z+.579), .018, "clay")

    # Cut stone arch around a side entrance. Each wedge has a front, back,
    # and deep inner return so the opening stays readable at grazing angles.
    box(STONE, (2.52, .344, -3.44, 3.04, 2.40, -3.11), .032, "stone")
    box(STONE, (4.60, .344, -3.44, 5.12, 2.40, -3.11), .032, "stone")
    box("877865", (2.54, 2.37, -3.52, 5.13, 2.54, -3.034), .028, "stone")
    cx, cy = 3.82, 1.71
    inner, outer = .79, 1.18
    for i in range(12):
        lo, hi = pi*i/12+.009, pi*(i+1)/12-.009
        at = lambda angle, radius, z: (cx+radius*cos(angle), cy+radius*sin(angle), z)
        q = [at(lo, inner, -3.06), at(lo, outer, -3.06),
             at(hi, outer, -3.06), at(hi, inner, -3.06)]
        r = [(x, y, -3.53) for x, y, _ in q]
        color = ("baa68b", "c6b59d", "ac987d")[i % 3]
        part.face(color, q, surface="stone")
        part.face(color, r[::-1], surface="stone")
        for j in range(4):
            k = (j + 1) % 4
            part.face(color, [q[k], q[j], r[j], r[k]], surface="stone")
    for x in (3.00, 4.58):
        for y in (.36, .70, 1.04, 1.38):
            box("c1ad8e", (x-.12, y, -3.48, x+.12, y+.313, -3.044), .023, "stone")
    tube("927158", (2.51, 2.94, -3.29), (5.16, 2.94, -3.29),
         .104, sides=8, surface="clay")


def _plants(part: Part) -> None:
    tube, ellipsoid = part.tube, part.ellipsoid
    for x, z, scale in [(4.26, -2.77, 1), (2.61, -2.63, .71)]:
        tube("985f4d", (x, .342, z), (x, .342+scale*.32, z),
             scale*.17, end_radius=scale*.225, sides=11, surface="clay")
        tube(DARK_GOLD, (x, .342+scale*.30, z), (x, .342+scale*.35, z),
             scale*.23, sides=11, surface="clay")
        tube(TIMBER_DARK, (x, .342+scale*.35, z), (x, .342+scale*.36, z),
             scale*.187, sides=11, surface="clay")
        for i in range(7):
            a = tau*i/7
            dx, dz = cos(a)*scale, sin(a)*scale
            y = .342+scale*(.73+.045*(i % 3))
            tube(DARK_TEAL, (x, .342+scale*.32, z), (x+dx*.28, y, z+dz*.28),
                 scale*.014, sides=5)
            ellipsoid(("5d7b57", "789265", "82985e")[i % 3],
                      (x+dx*.31, y, z+dz*.31), (scale*.15, scale*.075, scale*.13),
                      sides=8, rings=4)


def _pool_rim(part: Part) -> None:
    box = part.box
    box("8f7f6c", (-5.50, -1.04, -.87, -5.16, .24, 5.01), .036, "stone")
    box("8f7f6c", (4.93, -1.04, -.87, 5.28, .24, 5.01), .036, "stone")
    box("8f7f6c", (-5.5, -1.04, 4.83, 5.28, .24, 5.16), .034, "stone")
    for i in range(18):
        x = -5.45+i*.594
        color = ("a79577", "c0af8f", "ad9b83")[i % 3]
        box(color, (x, .225, -.99, x+.575, .35, -.64), .025, "stone")
        box(color, (x, .223, 4.87, x+.575, .344, 5.20), .025, "stone")
    for i in range(10):
        z = -.66+i*.557
        color = ("c0af8f", "ad9b83", "a79577")[i % 3]
        box(color, (-5.50, .218, z, -5.145, .346, z+.531), .024, "stone")
        box(color, (4.93, .218, z, 5.285, .346, z+.531), .024, "stone")
    for i in range(4):
        x = -4.25 + i*.425
        box("b2a185", (x, -.80, -.64, x+.401, -.25, -.215), .024, "stone")
        box("968976", (x, -.84, -.213, x+.401, -.52, .25), .022, "stone")
    # Small wooden blocking locates the puppet's dry end against the rim.
    box(TIMBER_DARK, (-2.94, .336, -.811, -2.45, .47, -.408), .024, "wood")
    box(TIMBER, (-2.61, .335, -.75, -2.34, .58, -.53), .019, "wood")


def _pool_tiles(part: Part) -> None:
    box = part.box
    box("3b635f", (-5.17, -.966, -.66, 4.96, -.85, 4.91), .016)
    colors = ("80a28d", "4e7c72", "61887e", "a3b095", "6b9889", "52766c")
    for row in range(12):
        for col in range(22):
            x, z = -5.154+col*.458, -.645+row*.461
            color = colors[(3*col+row+(col+row)%3) % len(colors)]
            box(color, (x, -.866, z, x+.437, -.816, z+.439), .018, "clay")
            if (col + 2*row) % 5 in (0, 1):
                cx, cz = x+.218, z+.219
                # Ceramic inlays, flush to the checkerboard surface.
                part.face("d6bc87", [(cx-.131, -.814, cz), (cx, -.814, cz+.107),
                                     (cx+.131, -.814, cz), (cx, -.814, cz-.107)])


def build_puppet() -> Scene:
    scene = Scene(
        "puppet-yard",
        "Water puppet maker’s yard",
        "puppet-yard",
        "A lacquered dragon bends off a timber workshop stage into a shallow tiled pool.",
    )
    _shelter(scene.part("shelter", "Workshop shelter", "Carved braces, exposed rafters and a tiled timber canopy."))
    _backdrop(scene.part("curtain", "Painted stage curtain", "A gilt lotus and wave border on folded red cloth."))
    _bench(scene.part("bench", "Workbench and stool", "Timber worktop, drawers and a low carving stool."))
    _craft(scene.part("craft-props", "Craft props", "Pigment pots, brushes, a color swatch and carving tools."))
    _lighting(scene.part("lamp-vessel", "Lamp and smoke vessel", "A hanging brass task light and a small clay charcoal vessel."))
    _courtyard(scene.part("courtyard", "Courtyard edge", "A terracotta stage and cut stone side entrance."))
    _plants(scene.part("potted-plants", "Potted plants", "Two clay planters frame the side entrance."))
    _pool_rim(scene.part("pool-rim", "Pool rim and steps", "Cut stone coping and a pair of submerged steps."))
    _pool_tiles(scene.part("pool-tiles", "Patterned pool bed", "An opaque ceramic grid with pale diamond inlays."))
    scene.water("pool-water", "Separate water surface", "The water layer refracts the tile grid and the submerged tail.",
                (-5.15, -.665, 4.95, 4.88))
    _dragon(scene)

    scene.lights.append(((-2.30, 2.565, -1.66), 5.2, (3.8, 1.80, .52)))
    return scene
