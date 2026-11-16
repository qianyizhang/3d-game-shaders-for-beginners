"""Object-space koi, pots and leaves, independent of any scene."""

from math import atan2, cos, pi, sin, tau

from .scene_gallery_geometry import Part, Scene, Vec3, add, cross, dot, scale, sub
from .motions import koi_clips

OBJECTS = ("amber-koi", "vermilion-koi", "terracotta-planter")


def two_faces(part, color, points):
    part.face(color, points)
    part.face(color, list(reversed(points)))


def tint(color: str, factor: float) -> str:
    return "".join(f"{min(255, round(channel * factor)):02x}" for channel in bytes.fromhex(color))


def pot(part, color, x, y, z, radius, height):
    """Turn a continuous clay wall through the lip into a recessed interior."""
    profile = ((.00,.60),(.06,.64),(.16,.67),(.78,.97),(.83,1.00),
               (.85,1.055),(.94,1.075),(1.00,1.025),(1.00,.88),
               (.94,.84),(.79,.80))
    top = height + .035
    sides = 16
    rings = [[(x+radius*r*cos(tau*i/sides),y+top*h,z+radius*r*sin(tau*i/sides))
              for i in range(sides)] for h,r in profile]
    for row,(low,high) in enumerate(zip(rings,rings[1:])):
        shade = tint(color, .72 if row >= 8 else 1.08 if row in (5,6,7) else .91 if row == 0 else 1)
        for i in range(sides):
            j = (i+1)%sides
            part.face(shade,[low[i],high[i],high[j],low[j]],surface="clay")
    part.face(tint(color,.75),rings[0])
    # Soil closes the interior below the rim, rather than covering the pot mouth.
    part.face("473b2b",list(reversed(rings[-1])))


def fin(part: Part, outline: list[Vec3], axis: Vec3, thickness: float,
        color: str, underside: str) -> None:
    """A thin closed fin with a raised centre and tapered perimeter."""
    if dot(cross(sub(outline[1],outline[0]),sub(outline[-1],outline[0])),axis) < 0:
        outline = list(reversed(outline))
    centre = tuple(sum(point[i] for point in outline)/len(outline) for i in range(3))
    front = [add(point,scale(axis,thickness*.18)) for point in outline]
    back = [add(point,scale(axis,-thickness*.18)) for point in outline]
    high,low = add(centre,scale(axis,thickness*.5)),add(centre,scale(axis,-thickness*.5))
    for i in range(len(outline)):
        j = (i+1)%len(outline)
        part.face(color,[high,front[i],front[j]])
        part.face(underside,[low,back[j],back[i]])
        part.face(underside,[front[i],back[i],back[j],front[j]])


def blade(part, base, tip, width, colors):
    x,y,z = base
    X,Y,Z = tip
    dx, dz = X-x, Z-z
    span = max(.001, (dx*dx+dz*dz)**.5)
    wx,wz = -dz*width/span, dx*width/span
    mid = (x+dx*.54, y+(Y-y)*.56+.07, z+dz*.54)
    a = (mid[0]+wx,mid[1]-.07,mid[2]+wz)
    b = (mid[0]-wx,mid[1]-.085,mid[2]-wz)
    for color, rim in zip(colors, (a,b)):
        two_faces(part,color,[base,rim,mid])
        two_faces(part,color,[mid,rim,tip])
    part.tube("9ea64e",base,mid,.008,sides=5)
    part.tube("9ea64e",mid,tip,.006,end_radius=.002,sides=5)


def koi(scene, key, name, bend, pattern):
    body = scene.part(f"{key}-body", f"{name} · body", "Rounded painted body, inset eyes, gill accents and thin volumetric fins.")
    tail = scene.part(f"{key}-tail", f"{name} · tail stem", "A tapered closed tail stem pivots inside the painted body.")
    fork = scene.part(f"{key}-fork", f"{name} · tail fork", "Two vertical lobes form a thin closed caudal fan on the existing hinge.")
    profile = [(-.74,.044,.075),(-.52,.083,.095),(-.35,.112,.148),
               (-.12,.153,.192),(.12,.177,.211),(.32,.172,.205),
               (.49,.148,.169),(.64,.113,.126),(.75,.077,.087),
               (.815,.047,.058),(.845,.025,.035)]
    bands = [bend*.95,bend*.53,bend*.25,bend*.065,0,0,0,0,0,0,0]
    sides = 16

    def ring(a, ry, rz, offset):
        return [(a,ry*cos(tau*i/sides),rz*sin(tau*i/sides)+offset) for i in range(sides)]

    rings = [ring(*section, offset) for section, offset in zip(profile,bands)]
    cream, underside = "efe1b8", "d7c4a0"
    # Large, separated dorsal patches read at pond scale without banding the belly.
    patches = ((-.22,.24,-.35,1.20),(.44,.27,.40,1.30)) if pattern == 1 else (
        (-.38,.15,.30,1.25),(.12,.23,-.18,1.35),(.66,.14,.08,1.20))
    pigment = "c57a2e" if pattern == 1 else "d85222"

    def skin(part, left, right):
        x = (left[0][0]+right[0][0])*.5
        for i in range(sides):
            j = (i+1)%sides
            angle = atan2(sin(tau*(i+.5)/sides),cos(tau*(i+.5)/sides))
            painted = any(((x-cx)/width)**2+((angle-phi)/spread)**2 < 1
                          for cx,width,phi,spread in patches)
            color = pigment if painted else cream if cos(angle) > -.25 else underside
            part.face(color,[left[j],right[j],right[i],left[i]],surface="lacquer")

    for row,(left,right) in enumerate(zip(rings,rings[1:])):
        skin(tail if row == 0 else body,left,right)
    # Keep the original joint pivots and overlapping closed collars.
    body_cap = ring(-.565,.060,.074,bend*.60)
    tail_cap = ring(-.466,.062,.072,bend*.45)
    skin(body,body_cap,rings[1])
    skin(tail,rings[1],tail_cap)
    body.face(cream,list(reversed(body_cap)))
    body.face(cream,rings[-1])
    tail.face(cream,list(reversed(rings[0])))
    tail.face(cream,tail_cap)

    for sign in (-1,1):
        fin(fork,[(x,sign*y,bend*.95+z) for x,y,z in (
            (-.705,.026,0),(-.89,.15,.003),(-1.13,.265,.01),
            (-1.055,.075,.012),(-.91,.012,.008))],
            (0,0,1),.024,"f1d7a0","c9aa76")
        fin(body,[(.39,-.055,sign*.145),(.20,-.10,sign*.31),
                  (-.035,-.115,sign*.37),(.015,-.13,sign*.18),(.17,-.095,sign*.14)],
            (0,1,0),.022,"ead7ae","bba77e")
        fin(body,[(-.26,-.08,bend*.10+sign*.13),(-.40,-.12,bend*.18+sign*.24),
                  (-.48,-.12,bend*.25+sign*.16),(-.36,-.09,bend*.16+sign*.09)],
            (0,1,0),.016,"d9c394","bba77e")
        body.ellipsoid("d7c4a0",(.663,.037,sign*.112),(.034,.030,.013),sides=10,rings=6)
        body.ellipsoid("292f26",(.675,.041,sign*.124),(.024,.025,.010),sides=10,rings=6)
        body.ellipsoid("fff3c8",(.683,.050,sign*.132),(.007,.007,.004),sides=6,rings=4)
        gill = [(.50,.09,sign*.134),(.445,.028,sign*.179),(.45,-.04,sign*.168),(.49,-.087,sign*.132)]
        for u,v in zip(gill,gill[1:]):
            body.tube("b59b77",u,v,.006,sides=5)
    fin(body,[(.34,.155,0),(.12,.265,0),(-.16,.247,bend*.04),(-.38,.115,bend*.20)],
        (0,0,1),.023,"d7ba81","b48d58")
    body.ellipsoid("745e47",(.849,-.008,0),(.008,.012,.027),sides=10,rings=6)
    body.tube("ead2a0",(.852,.003,-.026),(.852,.003,.026),.006,sides=7)

    rate = 5.15 if pattern == 1 else 4.45
    direction = 1 if pattern == 1 else -1
    scene.rigs.append({"name": name, "joints": [
        {"id": body.slug, "pivot": (0,0,0), "axis": (0,direction,0), "amplitude": .055,
         "phase": pi, "speed": rate, "parts": [body.slug], "poseLimit": 20, "label": "Body"},
        {"id": tail.slug, "parent": body.slug, "pivot": (-.52,0,bend*.53), "axis": (0,direction,0),
         "amplitude": .235, "phase": 0, "speed": rate, "parts": [tail.slug],
         "poseLimit": 30 if pattern == 1 else 32, "label": "Tail stem"},
        {"id": fork.slug, "parent": tail.slug, "pivot": (-.74,0,bend*.95), "axis": (0,direction,0),
         "amplitude": .125, "phase": -.55, "speed": rate, "parts": [fork.slug], "poseLimit": 24, "label": "Tail fork"},
    ]})
    scene.rigs[-1]["clips"] = koi_clips(scene.rigs[-1]["joints"], amber=pattern == 1)


def make_object(asset: str) -> Scene:
    model = Scene(asset, asset.replace("-", " ").capitalize(), "", "")
    if asset == "vermilion-koi":
        koi(model, asset, "Vermilion koi", -.30, 2)
    elif asset == "amber-koi":
        koi(model, asset, "Amber koi", .16, 1)
    elif asset == "terracotta-planter":
        part = model.part(asset, "Terracotta planter", "A tapered clay pot with a rounded lip, visible inner wall and recessed soil.")
        pot(part, "bd7955", 0, 0, 0, .22, .32)
    else:
        raise ValueError(f"Unknown standalone object: {asset}")
    return model
