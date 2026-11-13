"""Authored glasshouse and repair-stall models for the local Lab gallery."""

import json
from math import cos, pi, sin, tau
from pathlib import Path

from .scene_gallery_geometry import Scene
from .pond_objects import blade, make_object, pot
from .placement import Placement, place

def pond_placements() -> tuple[Placement, ...]:
    path = Path(__file__).with_name("scenes") / "glasshouse.json"
    return tuple(Placement(**entry) for entry in json.loads(path.read_text()))


def chain(part, color, points, radius, surface="metal", sides=8):
    for a, b in zip(points, points[1:]):
        part.tube(color, a, b, radius, sides=sides, surface=surface)


def two_faces(part, color, points):
    part.face(color, points)
    part.face(color, list(reversed(points)))


def checker(part, bounds, height, size, colors, base, diagonal=False):
    x0, z0, x1, z1 = bounds
    part.box(base, (x0, height-.24, z0, x1, height-.025, z1), .015)
    for row in range(round((z1-z0)/size)):
        for col in range(round((x1-x0)/size)):
            x = x0+col*size
            z = z0+row*size
            X, Z = min(x+size, x1)-.014, min(z+size, z1)-.014
            x, z = x+.014, z+.014
            tone = colors[(row+col) % len(colors)]
            if diagonal:
                tile = [(x,height,Z),(X,height,Z),(X,height,z),(x,height,z)]
                part.face(tone, tile[:3], surface="glaze")
                part.face(colors[(row+col+1)%len(colors)], [tile[0],tile[2],tile[3]], surface="glaze")
            else:
                part.box(tone, (x,height-.035,z,X,height,Z), .011, surface="stone")


def trim_wall(part, x0, x1, z, base, bands, colors, width=.59):
    for row in range(bands):
        y = base+row*.21
        x = x0 - (row % 2)*width/2
        index = 0
        while x < x1:
            left, right = max(x, x0)+.012, min(x+width,x1)-.012
            if right-left > .035:
                part.box(colors[(index+row*2)%len(colors)], (left,y,z-.05,right,y+.193,z+.04), .012, surface="stone")
            x += width
            index += 1


def arch(part, color, cx, spring, z, radius_x, radius_y, width=.035, steps=12):
    points = [(cx+radius_x*cos(pi*i/steps), spring+radius_y*sin(pi*i/steps), z) for i in range(steps+1)]
    chain(part, color, points, width)
    return points


def pane(part, color, x, y, X, Y, z):
    two_faces(part, color, [(x,y,z),(X,y,z),(X,Y,z),(x,Y,z)])


def build_glasshouse(placements: tuple[Placement, ...] | None = None) -> Scene:
    instances = pond_placements() if placements is None else placements
    s = Scene("glasshouse", "Glasshouse and koi pond", "glasshouse",
              "Iron arches, honey-colored stone and two painted koi over a blue-and-cream checker.")

    def add_instance(instance: Placement) -> None:
        master = make_object(instance.asset)
        parts = place(s, master, instance)
        obj = dict(title=master.title, parts=parts, asset=instance.asset, position=instance.position,
                   yaw=instance.yaw, scale=instance.scale,
                   tags=["creature", "lacquer", "waterline"] if master.rigs else ["prop", "clay", "plant"])
        if master.rigs:
            obj["rig"] = s.rigs[-1]["name"]
        s.instances[instance.id] = obj
    iron, trim, brass = "3c6857", "658d71", "b79c59"
    frame = s.part("iron-bays", "Repeated iron bays", "Repeated arches, collars and mullions form the open front of the glasshouse.")
    side = s.part("roof-side", "Roof ribs and end glazing", "Iron rafters and a few opaque frosted panes define the glasshouse without a transmission layer over the pond.")
    door = s.part("arched-door", "Arched door", "An open-panel door with curved muntins, kick plates, hinges and a brass knob.")
    z0, z1 = -2.05, -5.3
    edges = (-3.75,-2.24,-.75,.75,2.24,3.75)
    eave, ridge = 3.22, 4.53
    for x in edges:
        frame.box(iron,(x-.047,.32,z0-.04,x+.047,eave,z0+.045),.016,surface="metal")
        for yy in (.34,.96,2.06,3.06):
            frame.box(trim,(x-.071,yy,z0-.065,x+.071,yy+.061,z0+.068),.014,surface="metal")
        for z in (z1,):
            side.box(iron,(x-.048,.32,z-.047,x+.048,eave,z+.047),.016,surface="metal")
    for left, right in zip(edges,edges[1:]):
        cx = (left+right)/2
        arch(frame,trim,cx,2.32,z0+.018,(right-left)/2-.075,.57)
        frame.tube(iron,(left,3.04,z0),(right,3.04,z0),.040,sides=6)
        if abs(cx) > .1:
            frame.tube(iron,(cx,.81,z0),(cx,2.88,z0),.025,sides=6)
            frame.tube(trim,(left,1.77,z0),(right,1.77,z0),.026,sides=6)
            frame.box("a67759",(left+.045,.38,z0-.054,right-.045,.84,z0+.095),.023,surface="clay")
            trim_wall(frame,left+.045,right-.045,z0+.057,.41,2,("b67b55","ab6f50","c28760"))
            frame.box("d4bd90",(left+.04,.816,z0-.085,right-.04,.884,z0+.14),.014,surface="stone")
        pane(side,("91b39a" if cx < .2 else "a6bda4"),left+.055,1.05,right-.055,2.56,z1+.037)
    for z in (z0,z0-.78,z0-1.56,z0-2.36,z1):
        chain(side,iron,[(-3.85,eave,z),(0,ridge,z),(3.85,eave,z)],.056)
        for x in (-2.5,-1.25,1.25,2.5):
            y = ridge-abs(x)/3.85*(ridge-eave)
            side.ellipsoid(brass,(x,y,z),(.054,.049,.043),sides=7,rings=4)
    for x in (-3.85,-2.57,-1.28,0,1.28,2.57,3.85):
        y = ridge-abs(x)/3.85*(ridge-eave)
        side.tube(trim,(x,y,z1-.10),(x,y,z0+.17),.044,sides=8)
    for i in range(4):
        z = z0-i*.81
        for x in (-3.75,3.75):
            side.box(iron,(x-.034,.84,z-.034,x+.034,eave,z+.035),.012,surface="metal")
            if i > 0:
                side.tube(iron,(x,1.05,z),(x,1.05,z+.81),.028)
                side.tube(iron,(x,2.0,z),(x,2.0,z+.81),.025)
        if i > 1:
            color = ("91b9ac","acc8b0")[i%2]
            two_faces(side,color,[(3.705,1.06,z+.05),(3.705,1.06,z+.77),(3.705,1.97,z+.77),(3.705,1.97,z+.05)])
    arch(side,trim,0,3.23,z0+.02,1.61,1.11,width=.031)
    arch(side,brass,0,3.23,z0+.024,.53,.43,width=.025,steps=10)
    for x in (-3.75,0,3.75):
        y = ridge if x == 0 else eave
        side.tube(brass,(x,y,z0),(x,y+.21,z0),.083,end_radius=.019,sides=8)
    door.box(iron,(-.64,.34,z0+.046,-.55,2.26,z0+.11),.019,surface="metal")
    door.box(iron,(.54,.34,z0+.046,.63,2.26,z0+.11),.019,surface="metal")
    arch(door,iron,-.006,2.26,z0+.078,.587,.505,.051)
    door.box("4b7961",(-.548,.34,z0+.065,.54,.93,z0+.128),.018,surface="metal")
    for x in (-.49,.073):
        door.box("5a8a6b",(x,.43,z0+.116,x+.41,.82,z0+.145),.015,surface="metal")
    for y in (1.03,1.61,2.23):
        door.tube(iron,(-.59,y,z0+.077),(.57,y,z0+.077),.032)
    door.tube(iron,(0,.91,z0+.078),(0,2.74,z0+.078),.027)
    for y in (.68,1.99):
        door.box(brass,(-.672,y,z0+.108,-.501,y+.103,z0+.151),.014)
    door.ellipsoid(brass,(.44,1.02,z0+.149),(.058,.057,.036),sides=10,rings=6)

    pond = s.part("pond-coping", "Limestone rim and landing", "A beveled coping, dry flagstones and a lower tread make the pond depth legible.")
    pond.box("cbb085",(-4.75,-.43,-5.42,4.8,.315,-1.27),.027,surface="stone")
    for row in range(5):
        for col in range(12):
            x,z = -4.62+col*.77,-5.34+row*.79
            pond.box(("d0ba92","e0c8a0","d7b890")[(col+row*2)%3],(x,.295,z,x+.748,.343,z+.765),.011,surface="stone")
    for col in range(12):
        x = -4.61+col*.77
        pond.box("e2c89b",(x,.155,-1.49,x+.749,.346,-1.20),.028,surface="stone")
    for i in range(3):
        x = .67+i*.64
        pond.box("c9ab7e",(x,-.53,-1.31,x+.619,-.159,-.62),.034,surface="stone")
    for side_x in (-4.73,4.52):
        for i in range(8):
            z = -1.26+i*.78
            pond.box("ddc294",(side_x,-.65,z,side_x+.24,.244,z+.755),.021,surface="stone")
    bed = s.part("checker-tiles", "Patterned pond bed", "A slanted navy and cream checker gives the refraction ray bold edges to displace.")
    bounds = (-4.63,-1.22,4.60,5.23)
    checker(bed,bounds,-.87,.704,("b9b086","386477"),"44686c",diagonal=True)
    s.water("pond-water", "Pond water", "A separate, unbroken surface over the checker and the fish.", bounds)

    for instance in (item for item in instances if item.asset.endswith("-koi")):
        add_instance(instance)
    leaf = s.part("waterline-leaf", "Waterline leaf", "A broad veined leaf and bent stem cross the water and stay readable at both index settings.")
    stem = [(1.54,-.79,.84),(1.55,-.35,.92),(1.51,.03,.93),(1.56,.45,.91),(1.71,.82,.83)]
    chain(leaf,"6d8342",stem,.067,surface="flat")
    blade(leaf,stem[-1],(2.49,1.33,.38),.40,("a9b855","7c9b46"))
    blade(leaf,stem[3],(1.22,.69,.57),.14,("9caf5b","628847"))

    planting = s.part("pots-and-planting", "Pots and planting", "Hand-built clay and celadon containers with broad-leaf foliage and marigold accents.")
    for j,(x,y,z,r,h,c) in enumerate(((-3.45,.35,-1.72,.41,.52,"54928a"),(-2.82,.35,-1.61,.22,.32,"bd7955"),
                                     (3.38,.35,-1.75,.35,.49,"c4845a"),(2.60,.35,-2.64,.28,.43,"679a8e"))):
        if j != 1:
            pot(planting,c,x,y,z,r,h)
        for i in range(7):
            angle = i*tau/7+j
            base = (x,y+h+.036,z)
            end = (x+cos(angle)*(.30+r*.66),y+h+.39+(i%3)*.106,z+sin(angle)*(.28+r*.60))
            blade(planting,base,end,.13+(i%2)*.028,("66804a","8b9b53"))
        if j in (0,2):
            for i in range(4):
                xx = x+(i-1.5)*.13
                y1 = y+h+.65+(i%2)*.085
                planting.tube("64824a",(x,y+h,z),(xx,y1,z-.03),.019,sides=6)
                for k in range(5):
                    planting.ellipsoid(("d48544","e7a447")[k%2],(xx+cos(k*tau/5)*.077,y1+sin(k*tau/5)*.077,z-.02),(.061,.058,.043),sides=8,rings=4)
                planting.ellipsoid("a15e36",(xx,y1,z+.015),(.056,.055,.045),sides=8,rings=4)

    for instance in (item for item in instances if not item.asset.endswith("-koi")):
        add_instance(instance)

    fixture = s.part("lamp-and-vent", "Fixture and stove vent", "A brass shade and bulb, plus a hollow-looking capped pipe mounted above the roof.")
    chain(fixture,brass,[(2.69,2.81,-2.07),(2.69,2.81,-1.82),(2.69,2.66,-1.82)],.030)
    fixture.tube("9a7950",(2.69,2.48,-1.82),(2.69,2.65,-1.82),.17,end_radius=.068,sides=12,surface="metal")
    fixture.ellipsoid("f9c971",(2.69,2.46,-1.82),(.109,.071,.103),sides=10,rings=5)
    fixture.tube("59726c",(2.59,3.58,-4.27),(2.59,4.38,-4.27),.091,sides=10,surface="metal")
    fixture.tube("344743",(2.59,4.38,-4.27),(2.59,4.45,-4.27),.151,end_radius=.09,sides=10,surface="metal")
    fixture.tube("263934",(2.59,4.449,-4.27),(2.59,4.466,-4.27),.041,sides=10)
    s.lights.append(((2.69,2.45,-1.79),1.5,(2.25,1.31,.42)))
    return s


def toolbox(part, x, y, z, scale=1.0, color="ab563c"):
    w,d,h = .62*scale,.38*scale,.32*scale
    part.box(color,(x-w/2,y,z-d/2,x+w/2,y+h,z+d/2),.044*scale,surface="metal")
    part.box(color,(x-w*.516,y+h*.81,z-d*.517,x+w*.516,y+h,z+d*.526),.029*scale,surface="metal")
    part.box("463b37",(x-w*.49,y+h*.76,z+d*.493,x+w*.49,y+h*.807,z+d*.52),.006*scale)
    for side in (-1,1):
        xx = x+side*w*.26
        part.box("c99959",(xx-.032*scale,y+h*.68,z+d*.516,xx+.032*scale,y+h*.89,z+d*.55),.009*scale,surface="metal")
    chain(part,"59504a",[(x-w*.20,y+h,z),(x-w*.20,y+h+.090*scale,z),
                         (x+w*.20,y+h+.090*scale,z),(x+w*.20,y+h,z)],.026*scale)


def build_market() -> Scene:
    s = Scene("night-market", "Night market repair stall", "night-market",
              "A magenta cube and ochre awning over a corner repair shop and a tiled storm drain.")
    facade = s.part("corner-facade", "Corner facade and pipes", "Blue-violet masonry, a shallow shop recess and warm copper service pipes.")
    shutter = s.part("ribbed-shutter", "Ribbed teal shutter", "A steel frame with folded slats, ledge and latch.")
    awning = s.part("striped-awning", "Ochre awning", "Alternating fabric panels, drooping hems and triangular steel braces.")
    shadow, base, rust = "323140", "676278", "906147"
    facade.box(base,(-3.05,.43,-3.50,4.0,4.52,-1.37),.043,surface="stone")
    facade.box("514e65",(-3.12,.43,-3.53,-2.65,4.55,-1.22),.022,surface="stone")
    facade.box("615368",(-3.06,4.33,-3.53,4.06,4.56,-1.20),.037,surface="stone")
    facade.box(shadow,(-2.59,.50,-1.38,-.05,2.80,-1.20),.025,surface="wood")
    for i in range(6):
        y = .46+i*.53
        facade.box("827178",(-3.055,y,-1.286,-2.67,y+.497,-1.177),.016,surface="stone")
    for i in range(4):
        facade.box("594f5a",(-2.48,1.0+i*.40,-1.29,-.14,1.067+i*.40,-1.13),.012,surface="wood")
    facade.box("b4896e",(-.01,.51,-1.40,.45,3.12,-1.19),.026,surface="stone")
    facade.box("806a6d",(3.56,.42,-1.40,4.0,3.22,-1.19),.028,surface="stone")
    chain(facade,rust,[(3.77,.48,-.91),(3.77,.66,-.91),(3.77,.81,-1.12),(3.77,2.56,-1.13),
                       (3.77,2.73,-1.15),(3.52,2.87,-1.15),(3.52,3.42,-1.15),(-.18,3.42,-1.15)],.078)
    for y in (.73,1.22,2.41,2.66,3.17):
        x = 3.77 if y < 2.67 else 3.52
        facade.tube("b88959",(x,y,-1.15),(x,y+.064,-1.15),.101,sides=12,surface="metal")
    shutter.box("304e54",(.44,1.16,-1.43,3.55,3.18,-1.15),.025,surface="metal")
    for i in range(13):
        y = 1.24+i*.144
        c = ("448177","4d8c81","3e746d")[i%3]
        shutter.box(c,(.50,y,-1.167,3.48,y+.108,-1.089),.017,surface="metal")
        shutter.box("759386",(.51,y+.064,-1.104,3.47,y+.089,-1.066),.007,surface="metal")
    for x in (.44,3.48):
        shutter.box("4e5954",(x,1.17,-1.187,x+.075,3.19,-1.031),.016,surface="metal")
    shutter.box(rust,(2.94,1.25,-1.089,3.16,1.342,-1.006),.012,surface="metal")
    for i in range(11):
        x,X = -2.56+i*.247,-2.56+(i+1)*.247-.008
        c = ("d79c48","c7833b","dfac54","c58c43")[i%4]
        hem = 2.53+(i%2)*.045
        two_faces(awning,c,[(x,2.99,-1.19),(X,2.99,-1.19),(X,hem,-.24),(x,hem,-.24)])
        two_faces(awning,c,[(x,hem,-.24),(X,hem,-.24),(X,hem-.132,-.21),(x+.028,hem-.178,-.208)])
    for x in (-2.59,.18):
        chain(awning,shadow,[(x,2.99,-1.17),(x,2.55,-.24),(x,2.22,-1.17),(x,2.99,-1.17)],.032)

    bench = s.part("repair-counter", "Repair counter", "A worn timber slab, drawer stack and bent-metal underframe.")
    bench.box("a78560",(.44,1.02,-1.14,3.48,1.174,-.23),.037,surface="wood")
    bench.box("6c5949",(.47,.49,-1.12,1.39,1.04,-.29),.019,surface="wood")
    for i in range(3):
        yy=.522+i*.157
        bench.box(("59736d","627971","51675e")[i],(.523,yy,-.31,1.345,yy+.13,-.248),.013,surface="metal")
        bench.box("bd9868",(.825,yy+.045,-.252,1.058,yy+.081,-.209),.013,surface="metal")
    for xx in (1.47,3.31):
        bench.box(shadow,(xx,.46,-1.08,xx+.103,1.059,-.96),.019,surface="metal")
        bench.box(shadow,(xx,.46,-.35,xx+.103,1.059,-.245),.019,surface="metal")
        chain(bench,rust,[(xx+.06,.58,-.994),(xx+.06,1.03,-.297)],.039)
    tools = s.part("bench-tools", "Tool chest and hand tools", "A red cantilever-style toolbox, tool cup, wrench and two metal tins.")
    toolbox(tools,1.15,1.174,-.63,1.12)
    tools.tube("a47b50",(1.94,1.173,-.53),(1.94,1.424,-.53),.122,sides=12,surface="metal")
    tools.tube("4e443d",(1.94,1.422,-.53),(1.94,1.435,-.53),.097,sides=12)
    chain(tools,"b66a44",[(1.87,1.37,-.55),(1.82,1.74,-.56)],.036)
    chain(tools,"b8a58e",[(2.00,1.34,-.57),(2.12,1.68,-.58),(2.16,1.755,-.58),(2.14,1.83,-.58)],.031)
    chain(tools,"b8a58e",[(2.12,1.68,-.58),(2.06,1.752,-.58),(2.08,1.824,-.58)],.031)
    for i in range(2):
        x = 2.63+i*.33
        tools.tube("858070",(x,1.176,-.56),(x,1.25+i*.03,-.56),.135,sides=12,surface="metal")
        tools.tube("bfa98a",(x,1.25+i*.03,-.56),(x,1.274+i*.03,-.56),.14,sides=12,surface="metal")

    alley = s.part("alley-utilities", "Alley and utility props", "Layered alley frontage, boxes, fuel can, drainpipes and a vent vessel.")
    for j,(x,z,w,height) in enumerate(((-6.4,-4.93,2.0,5.1),(-4.89,-7.31,1.8,6.0),(3.91,-5.62,2.1,5.3))):
        alley.box(("525370","42485d","4d5066")[j],(x,.36,z-w,x+w,height,z),.033,surface="stone")
        for row in range(2):
            for col in range(2):
                X,Y = x+.31+col*.76,1.65+row*1.36
                alley.box("b38963" if (row+col+j)%3 == 0 else "303b53",(X,Y,z-.04,X+.41,Y+.79,z+.026),.016)
                alley.box("70636d",(X-.047,Y-.09,z-.02,X+.453,Y-.029,z+.098),.014,surface="stone")
    for j in range(2):
        x,z = -4.23+j*.72,-2.80-j*.49
        toolbox(alley,x,.46,z,1.22,("74776f","867261")[j])
    toolbox(alley,2.93,.48,-.64,1.02,"72716a")
    alley.box("9d5e46",(2.13,.48,-.75,2.46,.86,-.43),.047,surface="metal")
    alley.tube("ba8057",(2.34,.85,-.54),(2.34,.91,-.54),.052,sides=8,surface="metal")
    alley.tube("776957",(-3.63,.45,-2.62),(-3.63,.74,-2.62),.22,end_radius=.26,sides=12,surface="metal")
    alley.tube("343749",(-3.63,.73,-2.62),(-3.63,.79,-2.62),.211,end_radius=.15,sides=12)
    for i in range(2):
        x,z = -4.26-i*.72,-3.53-i*1.55
        alley.ellipsoid("d58e5b",(x,2.11,z),(.119,.16,.116),sides=9,rings=6)

    lights = s.part("shop-lights", "Cube sign and task lamp", "A geometric magenta cube paired with a warm brass work light.")
    sx, sy, sz, k = -1.97,3.67,-1.124,.50
    outline = [(sx+sin(i*tau/6)*k,sy+cos(i*tau/6)*k,sz) for i in range(6)]
    panel = [(x,y,z-.058) for x,y,z in reversed(outline)]
    lights.face("57304c",panel)
    chain(lights,"b34c81",outline+[outline[0]],.068,surface="metal")
    chain(lights,"f294c1",[(x,y,z+.055) for x,y,z in outline+[outline[0]]],.032,surface="flat")
    for i in (1,3,5):
        x,y,z = outline[i]
        lights.tube("ef95c0",(sx,sy,sz+.055),(x,y,z+.055),.032,sides=8)
    lights.ellipsoid("f5add0",(sx,sy,sz+.055),(.034,.032,.031),sides=8,rings=4)
    chain(lights,"7f654c",[(1.97,2.93,-1.2),(1.97,2.93,-.75),(1.97,2.74,-.75)],.036)
    lights.tube("68534d",(1.97,2.53,-.75),(1.97,2.72,-.75),.235,end_radius=.083,sides=12,surface="metal")
    lights.tube("c6a464",(1.97,2.515,-.75),(1.97,2.558,-.75),.239,sides=12,surface="metal")
    lights.ellipsoid("ffd690",(1.97,2.501,-.75),(.14,.081,.135),sides=12,rings=6)
    s.lights.extend((((sx,sy,sz+.07),2.1,(2.35,.23,1.1)),
                     ((1.91,2.19,-.67),1.13,(2.58,1.38,.48)),
                     ((.13,.48,.57),.56,(.43,.26,.58))))

    drain = s.part("sidewalk-and-drain", "Curb and drain", "Stone pavers and contrasting glazed bricks form a recessed drain with a dry rim.")
    curb = (-1.24,.71,4.37,4.67)
    for slab in ((-6.2,-.72,-7.65,5.7,.44,.71),(-6.2,-.72,.71,-1.24,.44,5.35),
                 (4.37,-.72,.71,5.7,.44,5.35),(-1.24,-.72,4.67,4.37,.09,5.35)):
        drain.box("595160",slab,.025,surface="stone")
    for row in range(4):
        for col in range(16):
            x,z = -5.90+col*.70,-1.92+row*.646
            drain.box(("837077","765f65","88777d","725f69")[(row+col*3)%4],(x,.426,z,x+.67,.469,z+.619),.015,surface="stone")
    for i in range(10):
        x = -1.25+i*.564
        color = "d2a65f" if i in (2,5,8) else ("aa8680" if i%2 else "997979")
        drain.box(color,(x,.318,.57,x+.543,.465,.837),.032,surface="stone")
        drain.box("977774",(x,-.01,4.55,x+.545,.112,4.79),.026,surface="stone")
    for i in range(7):
        z=.73+i*.559
        for x in (-1.35,4.27):
            drain.box(("997978","aa8780")[i%2],(x,.239,z,x+.233,.437,z+.542),.026,surface="stone")
    trim_wall(drain,-1.24,4.37,.773,-.63,4,("bb9278","8c7b79","a48573"),width=.565)
    floor = s.part("tiled-drain-bed", "Drain floor tiles", "Pale and violet paving lies below the drain and gives transmitted rays a repeatable target.")
    checker(floor,curb,-.67,.47,("baa28e","626272","9a8275","7e7c87"),"635361")
    grate = s.part("drain-grate", "Waterline iron grate", "The pitched grate crosses the waterline. Pale bolt heads and ochre bar marks make the wet half easy to follow.")
    for i in range(7):
        x=-.87+i*.187
        grate.tube("5e4f50",(x,.27,.85),(x,-.43,1.74),.048,sides=6,surface="metal")
        for j in range(3):
            fraction = .16+j*.27
            y,z=.27-.7*fraction,.85+.89*fraction
            grate.tube(("b9996d","a27a57")[i%2],(x,y,z),(x,y-.047,z+.060),.050,sides=6,surface="metal")
    for y,z in ((.29,.84),(.04,1.15),(-.40,1.72)):
        grate.tube("82614f",(-.95,y,z),(.34,y,z),.060,sides=7,surface="metal")
        for x in (-.90,.31):
            grate.ellipsoid("c5a276",(x,y+.053,z),(.043,.026,.035),sides=8,rings=4)
    s.water("drain-water", "Storm drain water", "A shallow surface cut to the drain; the grate and tile bed remain opaque.", curb)
    return s
