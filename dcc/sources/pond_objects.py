"""Object-space koi, pots and leaves, independent of any scene."""

from math import cos, pi, sin, tau

from .scene_gallery_geometry import Scene

OBJECTS = ("amber-koi", "vermilion-koi", "terracotta-planter")


def two_faces(part, color, points):
    part.face(color, points)
    part.face(color, list(reversed(points)))


def pot(part, color, x, y, z, radius, height):
    part.tube(color, (x,y,z), (x,y+height,z), radius*.62, end_radius=radius, sides=14, surface="clay")
    part.tube(color, (x,y+height-.065,z), (x,y+height+.035,z), radius*1.06, sides=14, surface="clay")
    part.tube("473b2b", (x,y+height+.035,z), (x,y+height+.044,z), radius*.87, sides=14)


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
    body = scene.part(f"{key}-body", f"{name} · body", "Painted body with inset eyes, dorsal fin and paired pectoral fins.")
    tail = scene.part(f"{key}-tail", f"{name} · tail stem", "A closed tail stem pivots inside the painted body.")
    fork = scene.part(f"{key}-fork", f"{name} · tail fork", "The fork follows the tail stem and flexes about its own hinge.")
    profile = [(-.74,.044,.075),(-.52,.083,.095),(-.23,.133,.18),(.12,.169,.205),(.41,.157,.184),(.61,.123,.137),(.76,.065,.081)]
    bands = [bend*.95,bend*.53,bend*.13,0,0,0,0]

    def ring(a, ry, rz, offset):
        return [(a,ry*cos(tau*i/12),rz*sin(tau*i/12)+offset) for i in range(12)]

    rings = [ring(*section, offset) for section, offset in zip(profile,bands)]
    cream, underside = "efe1b8", "d7c4a0"

    def skin(part, left, right, row):
        for i in range(12):
            j = (i+1)%12
            dorsal = i < 3 or i >= 9
            painted = dorsal and ((row*3 + min(i,11-i)+pattern) % 7 in (0,1,2,3))
            color = ("d75c28" if pattern == 1 else "d85222") if painted else (cream if dorsal else underside)
            part.face(color,[left[j],right[j],right[i],left[i]],surface="lacquer")

    for row, (left, right) in enumerate(zip(rings,rings[1:])):
        skin(tail if row == 0 else body, left, right, row)
    # Narrow overlapping caps stay inside the original silhouette at rest and
    # keep the hinge closed when its two rigid shells turn against each other.
    body_cap = ring(-.565,.060,.074,bend*.60)
    tail_cap = ring(-.466,.062,.072,bend*.45)
    skin(body, body_cap, rings[1], 1)
    skin(tail, rings[1], tail_cap, 0)
    body.face(cream, list(reversed(body_cap)))
    body.face(cream, rings[-1])
    tail.face(cream, list(reversed(rings[0])))
    tail.face(cream, tail_cap)
    for sign in (-1,1):
        two_faces(fork,"f1c985",[(-.69,.015,bend*.92),(-1.10,.032,bend+sign*.26),(-.94,-.03,bend+sign*.06)])
        two_faces(body,"ead7ae",[(.28,-.065,sign*.14),(-.11,-.10,sign*.40),(-.06,-.125,sign*.145)])
        body.ellipsoid("292f26",(.64,.045,sign*.112),(.033,.027,.033),sides=8,rings=4)
        body.ellipsoid("fff3c8",(.654,.055,sign*.13),(.011,.011,.011),sides=6,rings=4)
    two_faces(body,"cc753e",[(.29,.144,0),(.03,.252,0),(-.34,.119,bend*.19)])

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


def make_object(asset: str) -> Scene:
    model = Scene(asset, asset.replace("-", " ").capitalize(), "", "")
    if asset == "vermilion-koi":
        koi(model, asset, "Vermilion koi", -.30, 2)
    elif asset == "amber-koi":
        koi(model, asset, "Amber koi", .16, 1)
    elif asset == "terracotta-planter":
        part = model.part(asset, "Terracotta planter", "A clay pot and soil insert.")
        pot(part, "bd7955", 0, 0, 0, .22, .32)
    else:
        raise ValueError(f"Unknown standalone object: {asset}")
    return model
