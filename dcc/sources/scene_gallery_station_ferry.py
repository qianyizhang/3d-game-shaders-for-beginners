"""Authored gallery kits for the weather station and ferry landing."""

import math
import random

from .scene_gallery_geometry import Scene


def build_station() -> Scene:
    scene = Scene(
        "weather-station", "Canal weather station", "weather-station",
        "A teal measuring house with a copper roof, timber dock and marked gauge over clear canal tiles.",
    )
    rng = random.Random(41)
    teal = ("4a8a80", "548e83", "598c7f", "41766e", "65958a")
    stones = ("bdb396", "c6b89a", "b4aa8e", "d4c2a3")
    timber = ("95653e", "9f7148", "b08153", "886044")
    dark, copper = "303f3b", "d68c54"

    # Sandstone walls leave an actual opening for the window and door.
    walls = scene.part("station-shell", "Station shell", "Teal stone courses, sandstone quoins and open window and door bays.")
    for z0, z1 in [(-5.62, -5.41)]:
        walls.box("45756e", (-5.06, .89, z0, .93, 3.66, z1), .035, surface="stone")
    for x0, x1 in [(-5.08, -4.84), (.72, .95)]:
        walls.box("4b8075", (x0, .89, -5.6, x1, 3.65, -2.12), .035, surface="stone")
    # Subdivide the front between the openings so no stone bridges a recess.
    front_spans = (
        (-5.05, -3.99, .92, 3.64), (-1.63, -.98, .92, 3.64), (.40, .94, .92, 3.64),
        (-3.99, -1.63, .92, 1.64), (-3.99, -1.63, 3.20, 3.64), (-.98, .40, 3.21, 3.64),
    )
    for a, b, bottom, top in front_spans:
        row = 0
        while bottom + row * .32 < top - .025:
            y = bottom + row * .32
            x = a
            while x < b - .025:
                dx = .38 if row % 2 == 0 and x == a else rng.uniform(.55, .74)
                walls.box(rng.choice(teal), (x, y, -2.36, min(x+dx-.012,b), min(y+.304,top), -2.095), .007, surface="stone")
                x += dx
            row += 1
    for x in (-5.06, .58):
        for row in range(8):
            y = .94 + row * .333
            walls.box(stones[row % len(stones)], (x, y, -2.25, x + (.38 if row % 2 else .46), y+.319, -2.035), .023, surface="stone")
    walls.box("658779", (-5.09, .90, -5.63, .97, 1.065, -2.055), .024, surface="stone")

    joinery = scene.part("window-and-door", "Window and door", "Recessed amber panes, fanlight, rust-colored planks and iron hardware.")
    joinery.box("513e31", (-3.99, 1.64, -2.40, -1.62, 3.21, -2.16), .035, surface="wood")
    panes = ("efae51", "f8ce76", "dc9448", "ffd790", "eab35f", "f6bd64")
    for column in range(3):
        for row in range(2):
            x, y = -3.86 + column*.728, 1.76 + row*.657
            joinery.box(panes[row * 3 + column], (x, y, -2.22, x+.661, y+.600, -2.145), .015)
    joinery.box("d1b899", (-4.12, 1.60, -2.38, -1.50, 1.76, -1.98), .035, surface="stone")
    joinery.box("c8b499", (-4.11, 3.07, -2.38, -1.50, 3.25, -1.99), .027, surface="stone")
    for x in (-4.07, -1.66):
        joinery.box("b9a88c", (x, 1.69, -2.34, x+.14, 3.18, -2.038), .013, surface="stone")
    joinery.box("4e3d32", (-1.04, .94, -2.42, .48, 3.21, -2.185), .034, surface="wood")
    for i in range(6):
        x = -.908 + i * .205
        joinery.box(("963f30", "a34b36", "a64e39")[i % 3], (x, 1.02, -2.18, x+.194, 2.58, -2.04), .013, surface="wood")
    for i in range(3):
        x = -.89+i*.407
        joinery.box(panes[4+i%2], (x, 2.62, -2.17, x+.36, 3.045, -2.07), .008)
    joinery.box("713a2e", (-.91, 2.19, -2.06, .3, 2.32, -2.009), .014, surface="wood")
    joinery.tube(dark, (.13,1.78,-2.03), (.13,1.78,-1.92), .038, surface="metal")
    joinery.tube(dark, (.13,1.78,-1.92), (-.04,1.78,-1.92), .027, surface="metal")

    roof = scene.part("roof-and-flue", "Ribbed copper roof", "Sloping roof panels, standing seams, exposed brackets, gutter and vented flue.")
    ridge_z, ridge_y = -3.86, 4.98
    for z in (-5.96, -1.74):
        y = 3.63
        for i in range(31):
            x = -5.43 + i*.222
            xx = x + .221
            color = ("b05b3c", "c87149", "cb7752", "b66348", "c26b41")[i % 5]
            quad = [(x,y,z), (xx,y,z), (xx,ridge_y,ridge_z), (x,ridge_y,ridge_z)]
            roof.face(color, quad if z > ridge_z else quad[::-1], surface="metal")
            roof.tube("d78c5f", (x,y+.025,z), (x,ridge_y+.02,ridge_z), .019, sides=6, surface="metal")
        roof.tube("784333", (-5.47,y-.04,z), (1.53,y-.04,z), .069, sides=8, surface="wood")
    for x in (-5.42, 1.45):
        roof.tube("b86240", (x,3.63,-5.99), (x,ridge_y,-3.86), .061, surface="metal")
        roof.tube("b86240", (x,ridge_y,-3.86), (x,3.63,-1.73), .061, surface="metal")
        profile = [(x,3.57,-5.92), (x,3.57,-1.80), (x,4.94,-3.86)]
        roof.face("346056", profile if x < 0 else profile[::-1], surface="wood")
    roof.tube(copper, (-5.5,ridge_y+.015,ridge_z), (1.56,ridge_y+.015,ridge_z), .071, surface="metal")
    roof.tube(copper, (-5.5,3.59,-1.70), (1.58,3.59,-1.70), .087, surface="metal")
    downpipe = [(-4.70,3.59,-1.70), (-4.70,3.34,-1.72), (-4.91,3.13,-1.95), (-4.91,1.06,-1.96)]
    for a,b in zip(downpipe, downpipe[1:]):
        roof.tube(copper, a, b, .056, surface="metal")
        roof.ellipsoid(copper, b, (.056,.056,.056), sides=8, rings=4, surface="metal")
    for x in (-4.40, -2.88, -1.32, .88):
        roof.box("674e39", (x,3.39,-2.23,x+.13,3.59,-1.79), .018, surface="wood")
        roof.tube("745039", (x+.065,3.12,-2.052), (x+.065,3.51,-1.83), .045, sides=6, surface="wood")
    roof.box("65594c", (-3.94,4.15,-4.91,-3.29,5.23,-4.24), .045, surface="stone")
    roof.box("464843", (-4.00,5.08,-4.99,-3.22,5.28,-4.17), .045, surface="stone")
    for i in range(4):
        y = 4.63 + .105*i
        roof.box("6c665b", (-3.94,y,-4.4,-3.29,y+.058,-4.22), .009, surface="metal")

    weather = scene.part("weather-instruments", "Weather instruments", "Cup anemometer, arrow vane and a rigid windsock with a visibly open mouth.")
    x,y,z = -.43, 4.68, -3.69
    weather.tube(dark, (x,y,z), (x,5.99,z), .047, surface="metal")
    weather.tube(copper, (x,5.82,z), (x,6.05,z), .063, surface="metal")
    for i in range(3):
        a = .23 + math.tau*i/3
        dx,dz = math.cos(a),math.sin(a)
        weather.tube(dark, (x,5.98,z), (x+.42*dx,5.98,z+.42*dz), .027, surface="metal")
        weather.ellipsoid("384440", (x+.49*dx,5.98,z+.49*dz), (.11,.115,.109), surface="metal")
    weather.tube(dark, (x-.49,5.54,z), (x+.54,5.54,z), .022, surface="metal")
    fin = [(x+.12,5.55,z), (x+.56,5.43,z), (x+.57,5.71,z), (x+.12,5.60,z)]
    for face in (fin,fin[::-1]):
        weather.face("be875a",face,surface="metal")
    weather.tube("895137", (.96,4.13,-3.47), (.96,5.64,-3.47), .038, surface="metal")
    weather.tube("895137", (.96,5.64,-3.47), (1.25,5.64,-3.35), .028, surface="metal")
    for i in range(5):
        x0, x1 = 1.23+i*.244,1.23+(i+1)*.244
        y0, y1 = 5.54-i*.065,5.54-(i+1)*.065
        r0,r1 = .212-i*.025,.212-(i+1)*.025
        color = "c44836" if i%2==0 else "f0dbb3"
        for j in range(12):
            a,b = math.tau*j/12,math.tau*(j+1)/12
            def ring(x: float, y: float, r: float, t: float) -> tuple[float,float,float]:
                return (x,y+r*math.cos(t),-3.35+r*math.sin(t))
            band = [ring(x0,y0,r0,a),ring(x0,y0,r0,b),ring(x1,y1,r1,b),ring(x1,y1,r1,a)]
            weather.face(color,band)
            weather.face("7b4338" if i%2==0 else "a08a70",band[::-1])
    weather.ellipsoid(copper,(.96,5.65,-3.47),(.057,.057,.057),surface="metal")

    beacon = scene.part("station-beacon", "Station beacon", "Amber lens set in a copper cage and a bent mounting arm.")
    bx,by,bz = .66,2.96,-1.78
    beacon.tube(dark,(bx,by-.35,-2.10),(bx,by-.35,bz),.037,surface="metal")
    beacon.tube(copper,(bx,by-.35,bz),(bx,by-.19,bz),.046,surface="metal")
    beacon.tube("a76339",(bx,by-.19,bz),(bx,by-.135,bz),.166,surface="metal")
    beacon.ellipsoid("ffbf50",(bx,by,bz),(.129,.162,.127),sides=12)
    beacon.tube(copper,(bx,by+.125,bz),(bx,by+.20,bz),.154,end_radius=.091,surface="metal")
    for j in range(6):
        a = math.tau*j/6
        dx,dz = .137*math.cos(a),.137*math.sin(a)
        beacon.tube("a56a42",(bx+dx,by-.134,bz+dz),(bx+dx,by+.134,bz+dz),.013,sides=6,surface="metal")

    quay = scene.part("station-quay", "Stepped sandstone quay", "Capped stone courses, staggered joints and three separate steps down to the landing.")
    quay.box("75816b",(-7.6,-1.25,-6.9,4.9,.85,-1.19),.044,surface="stone")
    for row in range(5):
        y = -.96+row*.35
        for i in range(18):
            x = -7.58+i*.715 + (row%2)*.267
            if x >= 4.89:
                continue
            quay.box(stones[(i+row)%4],(x,y,-1.20,min(x+.696,4.9),y+.33,-1.105),.018,surface="stone")
    for i in range(18):
        x = -7.61 + i*.698
        quay.box(stones[(i+1)%4],(x,.73,-1.76,x+.679,.92,-1.051),.036,surface="stone")
    for row in range(4):
        for i in range(17):
            x,z = -7.56+i*.73,-1.84-row*.51
            quay.box(stones[(i+row+2)%4],(x,.848,z-.48,x+.705,.893,z),.012,surface="stone")
    for row in range(3):
        for i in range(5):
            x,z,y = -1.45+i*.46,-1.1+row*.39,.72-row*.224
            quay.box(stones[(row+i)%4],(x,-.48,z-.34,x+.441,y,z+.47),.032,surface="stone")

    landing = scene.part("station-dock", "Timber landing and rail", "Beveled dock planks, capped posts and a low safety rail around the open stair.")
    for i in range(11):
        x = -1.72+i*.247
        landing.box(timber[i%4],(x,.103,-.102,x+.233,.247,1.23),.022,surface="wood")
    for x in (-1.71,.96):
        for z in (.16,1.14):
            landing.box("755037",(x,-1.1,z,x+.16,.57,z+.16),.021,surface="wood")
            landing.tube(dark,(x+.082,.309,z+.157),(x+.082,.309,z+.182),.039,surface="metal")
    for a,b in [(-5.96,-2.09),(1.68,4.56)]:
        for i in range(4):
            x = a+(b-a)*i/3
            landing.tube(dark,(x,.912,-1.26),(x,1.47,-1.26),.039,surface="metal")
            landing.ellipsoid(dark,(x,1.49,-1.26),(.063,.055,.063),surface="metal")
        for y in (1.13,1.43):
            landing.tube(dark,(a,y,-1.26),(b,y,-1.26),.03,surface="metal")

    gauge = scene.part("striped-gauge", "Striped water gauge", "Vermilion and cream scale, stamped tick marks and brass rivets above and below the water.")
    gauge.box("314c48",(1.30,-1.12,.35,1.87,1.64,.59),.043,surface="wood")
    for i in range(9):
        y = -1.10+i*.297
        gauge.box("cd4c36" if i%2==0 else "f4dfb1",(1.362,y,.571,1.803,y+.296,.628),.008)
    for i in range(16):
        y = -1.04+i*.159
        gauge.box(dark,(1.379,y,.627,1.51 if i%3==0 else 1.448,y+.017,.645))
    for y in (-.84,-.34,.22,.77,1.32):
        gauge.tube("d0a374",(1.733,y,.626),(1.733,y,.655),.027,sides=8,surface="metal")
    gauge.box(copper,(1.27,1.57,.33,1.89,1.68,.66),.027,surface="metal")

    bed = scene.part("canal-bed", "Inlaid canal bed", "Staggered cream and blue-green pavers with paired chevrons; all geometry is opaque beneath a separate water sheet.")
    bed.box("314f4e",(-9.5,-1.48,-1.5,10,-1.20,9.2),.018,surface="stone")
    palette = ("c4b28e", "a58566", "8ba99f", "70978f", "ceb88e")
    for row in range(13):
        for i in range(25):
            x = -9.25+i*.751+(row%2)*.375
            z = -1.43+row*.80
            y = -1.119 if row>1 else -.91
            color = palette[(i+row+rng.randrange(3))%len(palette)]
            bed.box(color,(x,-1.22,z,x+.723,y,z+.763),.023,surface="stone")
            if (i+row)%3==0:
                for off in (.18,.39):
                    bed.face("51746f",[(x+.18,y+.001,z+off+.06),(x+.50,y+.001,z+off+.18),
                                       (x+.50,y+.001,z+off+.12),(x+.18,y+.001,z+off)])
    scene.water("canal-water", "Canal water sheet", "One independent surface at the gauge’s zero line.", (-9.5,-1.48,10,9.2))

    props = scene.part("station-yard", "Tool chest and cask", "Two authored maintenance props tucked beside the downspout.")
    props.box("935947",(-4.77,.895,-1.99,-4.06,1.18,-1.61),.034,surface="metal")
    props.box("bd6853",(-4.79,1.15,-2.01,-4.04,1.28,-1.585),.03,surface="metal")
    props.box(dark,(-4.54,1.27,-1.89,-4.29,1.35,-1.81),.022,surface="metal")
    props.tube("ad784b",(-5.4,.9,-1.83),(-5.4,1.58,-1.83),.255,end_radius=.219,sides=12,surface="wood")
    for y,r in [(1.01,.259),(1.41,.247),(1.57,.223)]:
        props.tube("56564b",(-5.4,y,-1.83),(-5.4,y+.044,-1.83),r,sides=12,surface="metal")

    shore = scene.part("station-bank", "Far-bank grove", "A low green bank and faceted crowns establish a second layer of depth.")
    shore.box("687b55",(1.08,-.19,-8.9,10.4,.67,-5.95),.09,surface="stone")
    shore.box("718a58",(1.05,.65,-9.1,10.8,.84,-5.98),.06)
    for x,z,h in [(2.38,-7.35,2.6),(4.51,-7.16,3.5),(6.44,-8.09,3.2),(8.52,-7.55,3.5)]:
        shore.tube("654c3c",(x,.81,z),(x,h,z),.10,end_radius=.048,surface="wood")
        for i in range(3):
            shore.ellipsoid(("61794b","748d54","50734d")[i],(x+(i-1)*.52,h+(i%2)*.32,z-.13*i),(.80,.79,.67),sides=9,rings=5)

    scene.lights.extend([
        ((-3.31,2.34,-2.04), 5.5, (2.1,.82,.25)),
        ((-2.43,2.34,-2.04), 6.0, (2.1,.82,.25)),
        ((bx,by,bz), 5.9, (3.2,1.38,.25)),
    ])
    return scene


def build_ferry() -> Scene:
    scene = Scene(
        "ferry-landing", "Lantern ferry landing", "ferry-landing",
        "An amber lantern marks the landing between a curved pavilion roof and a covered wooden ferry.",
    )
    slate = ("8e8e87","aca395","999387","a29a8f","b2a797")
    browns = ("8a5737","a36f47","a9714a","895739")
    dark = "4e3b36"
    rng = random.Random(66)

    quay = scene.part("ferry-quay", "Pavilion quay and steps", "Four broad treads and an irregular pale stone retaining wall frame the ferry basin.")
    quay.box("6e7771",(-9.6,-1.22,-7.1,-1.65,1.13,-1.37),.055,surface="stone")
    for row in range(6):
        y = -1.03+row*.35
        for i in range(12):
            x = -9.56+i*.655+(row%2)*.28
            if x > -1.71:
                continue
            quay.box(slate[(i+row)%5],(x,y,-1.41,min(x+.636,-1.64),y+.328,-1.28),.023,surface="stone")
    for row in range(4):
        z,y = -1.37+row*.44,.945-row*.297
        for i in range(5):
            x = -4.32+i*.52
            quay.box(slate[(i+row+1)%5],(x,-.76,z-.42,x+.504,y,z+.54),.04,surface="stone")
    for i in range(12):
        x = -9.54+i*.66
        quay.box(slate[i%5],(x,1.07,-1.91,x+.634,1.25,-1.22),.042,surface="stone")
    for x,y,z in [(-5.2,.35,-1.05),(-6.12,.61,-1.01),(-6.85,.59,-.87),(-7.35,.46,-.93)]:
        quay.ellipsoid("777b6c",(x,y,z),(.65,.78,.62),sides=8,rings=5,surface="stone")
    for x in (-4.55,-1.63):
        quay.tube("78563e",(x,.125,.52),(x,.75,.52),.116,sides=8,surface="wood")
        quay.tube("b99568",(x,.30,.52),(x,.38,.52),.123,sides=8,surface="wood")

    pavilion = scene.part("river-pavilion", "River pavilion facade", "Oyster plaster, lattice and dark timber framing under bracketed eaves.")
    for x in (-6.42,-4.97,-3.53,-2.10):
        pavilion.box("68483b",(x,1.21,-2.34,x+.16,3.77,-2.12),.023,surface="wood")
    for x,z in [(-6.40,-5.20),(-2.10,-5.20)]:
        pavilion.box("61463b",(x,1.20,z,x+.18,3.76,z+.17),.026,surface="wood")
    for y in (1.22,3.58):
        pavilion.box("5c4338",(-6.5,y,-5.32,-1.89,y+.18,-2.06),.025,surface="wood")
    pavilion.box("c7b295",(-6.42,1.40,-5.18,-2.06,3.55,-4.96),.026,surface="stone")
    pavilion.box("b9aa94",(-6.42,1.43,-5.14,-6.24,3.55,-2.30),.029,surface="stone")
    pavilion.box("b9aa94",(-2.21,1.43,-5.13,-2.02,3.54,-2.33),.027,surface="stone")
    pavilion.box("d1b899",(-6.39,1.42,-2.43,-5.03,3.54,-2.26),.018,surface="stone")
    pavilion.box("554139",(-4.98,1.48,-2.44,-3.55,3.49,-2.30),.015,surface="wood")
    pavilion.box("9c6b46",(-4.88,1.57,-2.35,-3.66,3.35,-2.27),.018,surface="wood")
    for x in (-4.77,-4.51,-4.26,-4.0,-3.75):
        pavilion.box("655044",(x,1.62,-2.285,x+.036,3.30,-2.221),.007,surface="wood")
    pavilion.box("d2bca1",(-3.51,1.45,-2.44,-2.11,3.54,-2.27),.013,surface="stone")
    pavilion.box("524139",(-3.42,2.02,-2.34,-2.18,3.17,-2.22),.018,surface="wood")
    for i in range(4):
        for j in range(3):
            x,y = -3.35+.293*i,2.09+.332*j
            pavilion.box(("dba760","dbad70","e7b977")[(i+j)%3],(x,y,-2.251,x+.249,y+.294,-2.201),.011)
    for x in (-6.27,-4.95,-3.55,-2.22):
        pavilion.box("895941",(x,3.27,-2.37,x+.125,3.54,-1.90),.018,surface="wood")
        pavilion.box("83553e",(x-.046,3.50,-2.32,x+.17,3.61,-1.79),.015,surface="wood")
        pavilion.tube("81543e",(x+.06,3.13,-2.16),(x+.06,3.51,-1.91),.042,sides=6,surface="wood")

    roof = scene.part("curved-eaves", "Curved tile eaves", "Modeled tile ribs run down a curved roof with raised tips and a thick ridge.")
    center_z = -3.71
    heights = (4.82,4.41,4.06,3.87,3.81,3.875)
    spreads = (0,.37,.80,1.30,1.76,2.06)
    start,step,n = -6.83,.241,22

    def roof_point(x: float, j: int, side: int) -> tuple[float,float,float]:
        endpoint = max(0,abs(x+4.18)-1.43)/1.21
        flare = endpoint*endpoint
        return (x,heights[j]+(.10+.23*j/5)*flare,center_z+side*(spreads[j]+.07*flare*j/5))

    for side in (-1,1):
        for i in range(n):
            x,X = start+i*step,start+(i+1)*step
            for j in range(len(heights)-1):
                quad = [roof_point(x,j+1,side),roof_point(X,j+1,side),roof_point(X,j,side),roof_point(x,j,side)]
                roof.face(("4f585a","556265","5e6869","48565a")[(i+j)%4],quad if side>0 else quad[::-1],surface="clay")
                roof.tube("798381",roof_point(x,j,side),roof_point(x,j+1,side),.035,sides=6,surface="clay")
            roof.tube("495558",roof_point(x,5,side),roof_point(X,5,side),.055,sides=8,surface="clay")
        for x in (start,start+n*step):
            for j in range(5):
                roof.tube("3d494d",roof_point(x,j,side),roof_point(x,j+1,side),.075,sides=8,surface="clay")
    roof.tube("5a6463",roof_point(start,0,1),roof_point(start+n*step,0,1),.11,sides=8,surface="clay")
    for x in (start-.13,start+n*step+.13):
        inward = 1 if x < -4 else -1
        roof.tube("785d4d",(x+inward*.15,4.90,center_z),(x,5.08,center_z),.079,end_radius=.036,sides=8,surface="clay")

    ferry = scene.part("ferry-hull", "Covered ferry hull", "Raised bow and stern, layered planking, gunwales and a slatted deck.")
    xc,zc = 1.68,1.72
    hull_stations = [(-2.69,.055,.44,.16),(-2.42,.36,.24,-.15),(-1.89,.63,.11,-.31),
                     (-1.24,.79,.09,-.40),(-.58,.85,.08,-.43),(0,.87,.08,-.44),(.62,.85,.09,-.43),
                     (1.25,.78,.10,-.40),(1.9,.60,.16,-.33),(2.44,.34,.29,-.12),(2.82,.047,.53,.22)]
    hull_rows = [(0,.36),(.24,.65),(.51,.83),(.74,.94),(1,1)]

    def hull_point(station: tuple[float,float,float,float], row: int, side: int) -> tuple[float,float,float]:
        x,w,top,base = station
        yf,zf = hull_rows[row]
        return (x+xc,base+(top-base)*yf,zc+side*w*zf)

    for s, t in zip(hull_stations,hull_stations[1:]):
        for side in (-1,1):
            for row in range(4):
                quad = [hull_point(s,row,side),hull_point(t,row,side),hull_point(t,row+1,side),hull_point(s,row+1,side)]
                ferry.face(("4b3733","644632","805736","aa774b")[row],quad if side==1 else quad[::-1],surface="wood")
                if row in (1,3):
                    ferry.tube(("684632","765237")[row//2],hull_point(s,row,side),hull_point(t,row,side),.024,sides=6,surface="wood")
            a,b = hull_point(s,4,side),hull_point(t,4,side)
            ferry.tube("bc915d",a,b,.055,sides=8,surface="wood")
        underside = [hull_point(s,0,-1),hull_point(t,0,-1),hull_point(t,0,1),hull_point(s,0,1)]
        ferry.face("584133",underside,surface="wood")
    for i,(x,w,y) in enumerate([(-2.28,.27,.182),(-1.99,.46,.147),(-1.70,.56,.109),(-1.41,.65,.085),(-1.12,.70,.062),(-.83,.73,.059),
                                (-.54,.76,.057),(-.25,.76,.056),(.04,.76,.056),(.33,.74,.058),(.62,.72,.060),(.91,.67,.069),
                                (1.20,.63,.082),(1.49,.56,.092),(1.78,.49,.133),(2.07,.39,.174),(2.36,.27,.228),(2.63,.10,.345)]):
        ferry.box(browns[i%4],(xc+x-.137,y-.075,zc-w,xc+x+.134,y+.014,zc+w),.012,surface="wood")
    for side in (-1,1):
        zz = zc+side*.65
        ferry.box("956138",(xc-1.5,.22,zz-.055,xc+1.4,.30,zz+.055),.018,surface="wood")
        for x in (xc-1.35,xc-.73,xc+.10,xc+.8,xc+1.25):
            ferry.box("76513a",(x-.027,.06,zz-.03,x+.026,.223,zz+.031),.007,surface="wood")

    canopy = scene.part("ferry-canopy", "Woven ferry canopy", "Rounded reed cover with ribbed arches and four slender timber supports.")
    start,end = .36,2.35

    def canopy_point(x: float, j: int) -> tuple[float,float,float]:
        theta = math.pi*j/8
        return (x,1.39+.36*math.sin(theta),zc-.81*math.cos(theta))

    for x in (start+.09,end-.12):
        for side in (-1,1):
            z = zc+side*.60
            canopy.box("84603d",(x-.041,.10,z-.036,x+.042,1.44,z+.036),.009,surface="wood")
            canopy.tube("8a603d",(x,.95,z),(x+.19 if x<1 else x-.19,1.39,z),.021,sides=6,surface="wood")
    for i in range(13):
        x = start+(end-start)*i/13
        X = start+(end-start)*(i+1)/13
        for j in range(8):
            quad = [canopy_point(x,j+1),canopy_point(X,j+1),canopy_point(X,j),canopy_point(x,j)]
            canopy.face(("bd9054","cd9c5e","c29459","b98e58")[(i+j)%4],quad,surface="wood")
            canopy.face("805f44",quad[::-1],surface="wood")
            if i % 3 == 0 or i in (0,12):
                canopy.tube("966c44",canopy_point(x,j),canopy_point(x,j+1),.026,sides=6,surface="wood")
    for j in (0,2,4,6,8):
        canopy.tube("a3784a",canopy_point(start-.052,j),canopy_point(end+.05,j),.034,sides=7,surface="wood")

    pole = scene.part("bamboo-pole", "Marked bamboo pole", "An inclined pole with alternating amber bands and dark growth rings crosses the waterline.")
    a,b = (2.57,-1.30,3.42),(4.42,2.35,2.68)

    def point(t: float) -> tuple[float,float,float]:
        return tuple(start+(end-start)*t for start,end in zip(a,b))

    for i in range(12):
        t,T = i/12,(i+1)/12
        pole.tube(("d6ac63","9b7747","c89e58")[i%3],point(t),point(T),.073-.026*t,end_radius=.073-.026*T,sides=10,surface="wood")
        pole.tube("775738",point(t),point(t+.013),.079-.026*t,sides=10,surface="wood")
    tie_z = 2.77
    for off in (0,.066,.132):
        pole.tube("a58158",(3.27,.25+off,tie_z),(3.62,.27+off,tie_z+.10),.017,sides=6,surface="wood")

    light = scene.part("ferry-lantern", "Paper lantern and bracket", "Faceted amber paper, fine lantern ribs, knotted tassel and a wooden pier bracket.")
    lx,ly,lz = -.92,2.74,-1.20
    light.box("624b3b",(-1.66,1.20,-1.35,-1.47,3.64,-1.14),.024,surface="wood")
    light.box("75533a",(-1.71,3.49,-1.36,-.78,3.63,-1.13),.026,surface="wood")
    light.tube("75533a",(-1.54,3.08,-1.23),(-1.05,3.52,-1.23),.052,sides=8,surface="wood")
    light.tube("594139",(lx,3.52,lz),(lx,ly+.37,lz),.018,sides=6,surface="metal")
    light.ellipsoid("ffb63c",(lx,ly,lz),(.259,.377,.250),sides=16,rings=10)
    for dy in (-.30,-.21,-.10,0,.10,.21,.30):
        r=.254*math.sqrt(1-(dy/.38)**2)
        light.tube("cc7939",(lx,ly+dy-.008,lz),(lx,ly+dy+.008,lz),r+.007,sides=16)
    for dy,r in [(-.366,.117),(.338,.119)]:
        light.tube("6f4b3a",(lx,ly+dy,lz),(lx,ly+dy+.053,lz),r,sides=12,surface="metal")
    light.tube("a7533c",(lx,ly-.34,lz),(lx,ly-.58,lz),.021,surface="wood")
    light.tube("b8593c",(lx,ly-.60,lz),(lx,ly-.76,lz),.052,end_radius=.025,sides=9)
    fire = scene.part("quay-brazier", "Clay brazier", "A three-legged bowl with a raised ceramic rim and visible coal bed.")
    fx,fz = -2.68,-1.79
    for i in range(3):
        a = math.tau*i/3
        dx,dz = math.cos(a),math.sin(a)
        fire.tube("58423a",(fx+.16*dx,1.26,fz+.16*dz),(fx+.11*dx,1.46,fz+.11*dz),.036,sides=7,surface="metal")
    fire.tube("8d6150",(fx,1.39,fz),(fx,1.64,fz),.13,end_radius=.267,sides=14,surface="clay")
    fire.tube("aa7860",(fx,1.60,fz),(fx,1.656,fz),.279,sides=14,surface="clay")
    fire.tube("51473f",(fx,1.654,fz),(fx,1.659,fz),.232,sides=14)
    for i in range(5):
        a = math.tau*i/5
        fire.ellipsoid(("704b40","a86b50","594d44")[i%3],(fx+.13*math.cos(a),1.682,fz+.13*math.sin(a)),(.052,.029,.064),sides=6,rings=4)

    paving = scene.part("submerged-paving", "Submerged ferry paving", "Cool block paving and ochre inlays provide tracked features under the ferry and pole.")
    paving.box("435858",(-9,-1.53,-1.35,8.5,-1.21,10.3),.025,surface="stone")
    palette = ("929388","747f7f","9ca190","7d9690","b6a487")
    for j in range(15):
        z = -1.28+j*.753
        for i in range(23):
            x = -8.8+i*.748+(j%2)*.347
            y = -.95 if j<2 else -1.15
            paving.box(palette[(i+2*j+rng.randrange(3))%5],(x,-1.23,z,x+.704,y,z+.712),.029,surface="stone")
            if (i+j)%5==0:
                paving.face("c8ae7e",[(x+.17,y+.001,z+.35),(x+.35,y+.001,z+.55),
                                        (x+.54,y+.001,z+.35),(x+.35,y+.001,z+.16)])
    scene.water("ferry-water","Ferry basin water","The basin has its own surface; the ferry hull, pole and pavers remain in the opaque pass.",(-9,-1.35,8.5,10.3))

    hills = scene.part("river-ridges", "Two river ridges", "Layered grey-green ridge silhouettes give depth without competing with the ferry.")
    for z, scale, color in [(-16.8,1.32,"859c9d"),(-11.5,1.0,"697f7e")]:
        for x,h,w in [(-5.5,2.3,4.5),(-1.28,1.66,3.8),(2.0,3.05,2.9),(5.0,3.83,3.1),(7.85,2.7,3.2),(11.3,3.15,3.4)]:
            hills.ellipsoid(color,(x,-.64,z),(w*scale,h*scale,2.1*scale),sides=10,rings=6)
    maple = scene.part("autumn-maple", "Autumn maple", "Angled branches and warm faceted leaf masses frame the edge of the pavilion.")
    trunk = [(-7.5,1.24,-2.05),(-7.25,2.58,-1.95),(-7.58,3.65,-1.94),(-7.22,4.72,-1.99)]
    for a,b,r in zip(trunk,trunk[1:],(.25,.20,.155)):
        maple.tube("76563f",a,b,r,end_radius=r*.78,sides=8,surface="wood")
    for b in [(-8.27,4.75,-2.26),(-7.65,5.13,-1.60),(-6.75,5.18,-1.59),(-6.1,4.8,-2.2),(-7.0,5.32,-2.77)]:
        maple.tube("76563f",trunk[2],b,.093,end_radius=.034,sides=7,surface="wood")
        for i in range(3):
            maple.ellipsoid(("a9583a","c57548","b36342")[i],(b[0]+(i-1)*.43,b[1]+.15*(i%2),b[2]+.14*i),(.63,.47,.55),sides=9,rings=5)

    scene.lights.extend([
        ((lx,ly,lz),5.0,(4.2,1.62,.25)),
        ((-2.83,2.71,-2.16),5.8,(2.5,.88,.17)),
        ((fx,1.69,fz),9.5,(.65,.24,.047)),
    ])
    return scene
