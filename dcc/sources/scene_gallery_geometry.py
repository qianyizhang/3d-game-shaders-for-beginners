"""Geometry, procedural material and manifest helpers for the five scene kits."""

from dataclasses import dataclass, field
import json
import math
from pathlib import Path
import struct
from typing import Callable
import zlib

Vec3 = tuple[float, float, float]
Vec2 = tuple[float, float]
RGB = tuple[int, int, int]
Bounds = tuple[Vec3, Vec3]
AXES = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


@dataclass(frozen=True)
class Surface:
    period: float  # Scene units per map tile on planar surfaces.
    relief: float  # Height scale in scene units, before finite differences.
    pigment: float
    specular: int


SURFACES = {
    "flat": Surface(.90, 0, 0, 0),
    "stone": Surface(.90, .009, .125, 16),
    "wood": Surface(1.12, .006, .145, 29),
    "metal": Surface(.82, .003, .115, 84),
    "clay": Surface(.76, .004, .110, 32),
    "lacquer": Surface(.94, .002, .055, 145),
    "glaze": Surface(.86, .002, .100, 108),
}


def add(a: Vec3, b: Vec3) -> Vec3:
    return tuple(x + y for x, y in zip(a, b))


def sub(a: Vec3, b: Vec3) -> Vec3:
    return tuple(x - y for x, y in zip(a, b))


def scale(a: Vec3, f: float) -> Vec3:
    return tuple(x * f for x in a)


def dot(a: Vec3, b: Vec3) -> float:
    return sum(x * y for x, y in zip(a, b))


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(a: Vec3) -> Vec3:
    return scale(a, 1 / math.hypot(*a))


def png(path: Path, w: int, h: int, sample: Callable[[int, int], RGB]) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    raw = b"".join(b"\0" + bytes(c for x in range(w) for c in sample(x, y)) for y in range(h))
    header = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    )


@dataclass
class Geometry:
    vertices: list[float] = field(default_factory=list)
    indices: list[int] = field(default_factory=list)

    def face(self, points: list[Vec3], repeat: float, *, period: float | None = None,
             along: Vec3 | None = None, chart: list[Vec2] | None = None) -> None:
        if len(points) < 3:
            raise ValueError("A face needs at least three vertices")
        edges = [sub(point, points[0]) for point in points[1:]]
        n = unit(cross(edges[0], edges[-1]))
        if chart is not None:
            # Use the chart's U derivative, including on tapered surfaces.
            # The authored cylinder and ellipsoid charts have outward winding.
            du1, dv1 = (v - u for u, v in zip(chart[0], chart[1]))
            du2, dv2 = (v - u for u, v in zip(chart[0], chart[-1]))
            det = du1 * dv2 - du2 * dv1
            t = unit(scale(sub(scale(edges[0], dv2), scale(edges[-1], dv1)), 1 / det))
            b = scale(cross(n, t), math.copysign(1, det))
        elif period is not None:
            # Anchor adjacent coplanar faces to the same grid. Wood follows
            # the length of the board; end faces fall back to the face grid.
            axis = along if along is not None and abs(dot(n, along)) < .92 else (
                AXES[2] if abs(n[0]) > max(abs(n[1]), abs(n[2])) else AXES[0]
            )
            t = unit(sub(axis, scale(n, dot(axis, n))))
            b = cross(n, t)
            chart = [(dot(p, t) * repeat / period, dot(p, b) * repeat / period) for p in points]
        else:
            # Water's flow and normal maps use the authored per-surface chart.
            t = unit(edges[0])
            b = cross(n, t)
            width = max(.001, max(abs(dot(p, t)) for p in edges))
            height = max(.001, max(abs(dot(p, b)) for p in edges))
            chart = [(dot(p, t) * repeat / width, dot(p, b) * repeat / height)
                     for p in [(0.0, 0.0, 0.0), *edges]]
        index = len(self.vertices) // 14
        for p, uv in zip(points, chart, strict=True):
            self.vertices.extend((*p, *n, *uv, *t, *b))
        for i in range(1, len(points) - 1):
            self.indices.extend((index, index + i, index + i + 1))


@dataclass
class Part:
    slug: str
    title: str
    description: str
    role: str = "opaque"
    visible: bool = True
    materials: dict[tuple[str, str], Geometry] = field(default_factory=dict)
    points: list[Vec3] = field(default_factory=list)
    origin: Vec3 = (0, 0, 0)

    def face(self, color: str, points: list[Vec3], surface: str = "flat", repeat: float = 1) -> None:
        self._face(color, points, surface, repeat)

    def _face(self, color: str, points: list[Vec3], surface: str, repeat: float = 1, *,
              along: Vec3 | None = None, chart: list[Vec2] | None = None) -> None:
        period = None if self.role == "water" else SURFACES[surface].period
        self.materials.setdefault((color, surface), Geometry()).face(
            points, repeat, period=period, along=along, chart=chart)
        self.points.extend(points)

    @property
    def bounds(self) -> Bounds:
        low = tuple(min(axis) for axis in zip(*self.points))
        high = tuple(max(axis) for axis in zip(*self.points))
        return add(low, self.origin), add(high, self.origin)

    def box(self, color: str, bounds: tuple[float, ...], bevel: float = 0, surface: str = "flat") -> None:
        x, y, z, X, Y, Z = bounds
        dimensions = X - x, Y - y, Z - z
        bevel = max(0, min(bevel, .44 * min(dimensions)))
        along = AXES[dimensions.index(max(dimensions))] if surface == "wood" else None
        low = [(x, y, Z), (X, y, Z), (X, y, z), (x, y, z)]
        lip = [(a, Y - bevel, c) for a, _, c in low]
        top = [(x + bevel, Y, Z - bevel), (X - bevel, Y, Z - bevel),
               (X - bevel, Y, z + bevel), (x + bevel, Y, z + bevel)]
        for i in range(4):
            j = (i + 1) % 4
            self._face(color, [low[i], low[j], lip[j], lip[i]], surface, along=along)
            if bevel:
                self._face(color, [lip[i], lip[j], top[j], top[i]], surface, along=along)
        self._face(color, top, surface, along=along)
        self._face(color, low[::-1], surface, along=along)

    def tube(self, color: str, a: Vec3, b: Vec3, r: float, end_radius: float | None = None,
             sides: int = 10, surface: str = "flat") -> None:
        axis = unit(sub(b, a))
        u = unit(cross(axis, (0, 1, 0) if abs(axis[1]) < .9 else (1, 0, 0)))
        v = cross(axis, u)
        directions = [add(scale(u, math.cos(t * math.tau / sides)), scale(v, math.sin(t * math.tau / sides)))
                      for t in range(sides)]
        end = r if end_radius is None else end_radius
        first = [add(a, scale(d, r)) for d in directions]
        last = [add(b, scale(d, end)) for d in directions]
        self.face(color, first[::-1], surface)
        self.face(color, last, surface)
        period = SURFACES[surface].period
        length = math.hypot(*sub(b, a), end - r) / period
        turns = max(1, round(math.pi * (r + end) / period))
        for i in range(sides):
            j = (i + 1) % sides
            v0, v1 = -i * turns / sides, -(i + 1) * turns / sides
            self._face(color, [first[i], first[j], last[j], last[i]], surface,
                       chart=[(0, v0), (0, v1), (length, v1), (length, v0)])

    def ellipsoid(self, color: str, center: Vec3, radii: Vec3, sides: int = 12, rings: int = 6,
                  surface: str = "flat") -> None:
        x, y, z = center
        rx, ry, rz = radii
        period = SURFACES[surface].period
        turns = max(1, round(math.pi * (rx + rz) / period))
        meridian = math.pi * (ry + (rx + rz) * .5) * .5 / (period * rings)
        slices = []
        for j in range(1, rings):
            phi = math.pi * j / rings
            slices.append([(x + rx * math.sin(phi) * math.cos(i * math.tau / sides),
                            y + ry * math.cos(phi),
                            z + rz * math.sin(phi) * math.sin(i * math.tau / sides)) for i in range(sides)])
        for i in range(sides):
            j = (i + 1) % sides
            u0, u1 = i * turns / sides, (i + 1) * turns / sides
            uc = (u0 + u1) * .5
            self._face(color, [(x, y + ry, z), slices[0][j], slices[0][i]], surface,
                       chart=[(uc, 0), (u1, meridian), (u0, meridian)])
            self._face(color, [(x, y - ry, z), slices[-1][i], slices[-1][j]], surface,
                       chart=[(uc, rings * meridian), (u0, (rings - 1) * meridian), (u1, (rings - 1) * meridian)])
            for ring, (a, b) in enumerate(zip(slices, slices[1:]), start=1):
                v0, v1 = ring * meridian, (ring + 1) * meridian
                self._face(color, [a[i], a[j], b[j], b[i]], surface, chart=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)])


@dataclass
class Scene:
    slug: str
    title: str
    concept: str
    summary: str
    parts: dict[str, Part] = field(default_factory=dict)
    lights: list[tuple[Vec3, float, Vec3]] = field(default_factory=list)
    rigs: list[dict] = field(default_factory=list)
    instances: dict[str, dict] = field(default_factory=dict)

    def part(self, slug: str, title: str, description: str) -> Part:
        if slug in self.parts:
            raise ValueError(f"Duplicate part {self.slug}/{slug}")
        self.parts[slug] = Part(slug, title, description)
        return self.parts[slug]

    def water(self, slug: str, title: str, description: str,
              bounds: tuple[float, float, float, float], y: float = 0) -> Part:
        part = self.part(slug, title, description)
        part.role = "water"
        x, z, X, Z = bounds
        part.face("569a9a", [(x, y, Z), (X, y, Z), (X, y, z), (x, y, z)], repeat=2)
        return part




def noise(u: float, v: float, width: int, height: int, seed: int) -> float:
    """Cubic lattice noise with periodic values and slopes at the tile edge."""
    x, y = u * width, v * height
    i, j = math.floor(x), math.floor(y)
    s, t = x - i, y - j
    s, t = s * s * (3 - 2 * s), t * t * (3 - 2 * t)

    def lattice(a: int, b: int) -> float:
        h = ((a % width) * 0x9E3779B9 ^ (b % height) * 0x85EBCA6B ^ seed * 0xC2B2AE35) & 0xffffffff
        h = ((h ^ (h >> 16)) * 0x45D9F3B) & 0xffffffff
        return (h ^ (h >> 16)) / 0x7fffffff - 1

    low = (1 - s) * lattice(i, j) + s * lattice(i + 1, j)
    high = (1 - s) * lattice(i, j + 1) + s * lattice(i + 1, j + 1)
    return (1 - t) * low + t * high


def material_sample(surface: str, u: float, v: float) -> tuple[float, float, float]:
    """Return pigment variation, relative height and a specular multiplier."""
    cloud = noise(u, v, 4, 5, 3)
    grit = noise(u, v, 19, 23, 5)
    if surface == "stone":
        pores = max(0, -grit - .26)
        return .60 * cloud + .26 * grit - .41 * pores, .27 * cloud + .23 * grit - .26 * pores, .86 + .21 * grit
    if surface == "wood":
        # Long fibers wander and broaden. U follows the plank or tube axis.
        offset = .037 * noise(u, v, 3, 5, 13)
        grain = noise(u, v + offset, 3, 18, 19)
        dark_fibers = max(0, -grain - .22)
        return .52 * grain + .35 * cloud - .31 * dark_fibers, .48 * grain + .10 * grit, .91 + .30 * grain
    if surface == "metal":
        brush = noise(u, v, 7, 28, 11)
        oxide = max(0, -.72 * cloud - .28 * grit - .16)
        return .28 * cloud + .19 * brush - .66 * oxide, .15 * brush - .14 * oxide, 1 + .25 * brush - .65 * oxide
    if surface == "clay":
        ribs = .16 * math.sin(math.tau * (6 * u + .11 * cloud))
        return .53 * cloud + .21 * grit + ribs, .28 * cloud + .18 * grit + ribs, .88 + .23 * cloud
    if surface == "glaze":
        firing = noise(u + .06 * cloud, v - .05 * cloud, 6, 7, 23)
        return .56 * firing + .26 * cloud + .10 * grit, .16 * firing + .07 * grit, .99 + .18 * firing
    # The lacquer should mostly read as paint and smooth highlight, not grain.
    return .52 * cloud + .15 * grit, .12 * cloud + .08 * grit, .99 + .09 * cloud


def encode_normal(x: float, y: float) -> RGB:
    n = unit((x, y, 1))
    return tuple(round((c * .5 + .5) * 255) for c in n)


def make_maps(root: Path, materials: set[tuple[str, str]]) -> None:
    maps = root / "maps"
    maps.mkdir(exist_ok=True)

    def solid(name: str, color: RGB) -> None:
        png(maps / f"{name}.png", 1, 1, lambda _x, _y: color)

    for name, rgb in {"black": (0, 0, 0), "white": (255, 255, 255), "flat-normal": (128, 128, 255),
                      "reflection": (142, 142, 142), "flow": (141, 121, 0)}.items():
        solid(name, rgb)
    for color, surface in sorted(materials):
        if surface == "flat":
            solid(f"{color}-{surface}", tuple(bytes.fromhex(color)))
    for surface in sorted({s for _, s in materials} - {"flat"}):
        emit_surface(maps, surface, sorted(color for color, kind in materials if kind == surface))

    def ripples(x: int, y: int) -> RGB:
        u, v = x * math.tau / 96, y * math.tau / 96
        return encode_normal(.044 * math.cos(2 * u + v) + .015 * math.sin(4 * v - u),
                             .06 * math.cos(2 * u + v) - .019 * math.sin(4 * v - u))

    def contact(x: int, y: int) -> RGB:
        u, v = x * math.tau / 48, y * math.tau / 48
        shade = round(67 + 30 * math.sin(3 * u + 2 * v) + 25 * math.sin(5 * v - u))
        return (shade,) * 3

    png(maps / "ripple.png", 96, 96, ripples)
    png(maps / "contact.png", 48, 48, contact)


def emit_surface(maps: Path, surface: str, colors: list[str]) -> None:
    style = SURFACES[surface]
    size = 96
    tile = [material_sample(surface, (x + .5) / size, 1 - (y + .5) / size)
            for y in range(size) for x in range(size)]

    def sample(x: int, y: int) -> tuple[float, float, float]:
        return tile[(y % size) * size + x % size]

    for color in colors:
        rgb = tuple(bytes.fromhex(color))

        def albedo(x: int, y: int) -> RGB:
            shade = 1 + style.pigment * sample(x, y)[0]
            return tuple(max(0, min(255, round(channel * shade))) for channel in rgb)

        png(maps / f"{color}-{surface}.png", size, size, albedo)

    def normal(x: int, y: int) -> RGB:
        gradient = style.relief * size / (2 * style.period)
        # Image rows run downward; the shader's tangent-space V runs upward.
        du = (sample(x - 1, y)[1] - sample(x + 1, y)[1]) * gradient
        dv = (sample(x, y + 1)[1] - sample(x, y - 1)[1]) * gradient
        return encode_normal(du, dv)

    def specular(x: int, y: int) -> RGB:
        value = max(0, min(255, round(style.specular * sample(x, y)[2])))
        return (value, value, value)

    png(maps / f"{surface}-normal.png", size, size, normal)
    png(maps / f"{surface}-spec.png", size, size, specular)


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def map_path(name: str) -> str:
    return f"maps/{name}.png"


def export(scene: Scene, root: Path) -> dict:
    """Emit one binary, pose manifests and part ranges for real-mesh previews."""
    root.mkdir(parents=True, exist_ok=True)
    make_maps(root, {m for part in scene.parts.values() for m in part.materials})
    data = bytearray()
    grouped: dict[str, list[dict]] = {}
    for key, part in scene.parts.items():
        meshes = grouped[key] = []
        for (color, surface), geometry in part.materials.items():
            start = len(data)
            data.extend(struct.pack(f"<{len(geometry.vertices)}f", *geometry.vertices))
            index = len(data)
            data.extend(struct.pack(f"<{len(geometry.indices)}I", *geometry.indices))
            water = part.role == "water"
            textures = {
                "color": f"{color}-{surface}", "normal": "ripple" if water else f"{surface}-normal",
                "specular": "black" if surface == "flat" else f"{surface}-spec",
                "reflection": "reflection" if water else "black", "refraction": "white" if water else "black",
            }
            meshes.append(dict(role=part.role, part=key, origin=part.origin,
                               vertices=[start, len(geometry.vertices)], indices=[index, len(geometry.indices)],
                               textures={name: map_path(file) for name, file in textures.items()}))
    (root / "geometry.bin").write_bytes(data)
    active = [mesh for key, part in scene.parts.items() if part.visible for mesh in grouped[key]]
    return dict(scene=scene.slug, title=scene.title, concept=scene.concept, summary=scene.summary,
                geometry="geometry.bin", axes="y-up", meshes=active, rigs=scene.rigs,
                lights=[dict(center=c, falloff=f, color=rgb) for c, f, rgb in scene.lights],
                parts=[dict(slug=part.slug, title=part.title, description=part.description, role=part.role,
                            visible=part.visible, bounds=part.bounds, meshes=grouped[part.slug])
                       for part in scene.parts.values()])
