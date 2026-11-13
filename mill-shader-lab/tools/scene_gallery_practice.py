"""Scene-specific staging and authored resources for the shared Lab lessons."""

from dataclasses import dataclass

Vec3 = tuple[float, float, float]


@dataclass(frozen=True)
class View:
    target: Vec3
    offset: Vec3
    fov: float = 42
    sun: float = 246

    def pose(self) -> dict:
        return dict(target=self.target, offset=self.offset, fov=self.fov, near=.12, far=85, sun=self.sun)


@dataclass(frozen=True)
class Staging:
    material: View
    reflected: View
    depth: View
    smoke: Vec3
    smoke_scale: float
    smoke_view: Vec3
    swatch: Vec3
    swatch_radius: float
    near: Vec3
    far: Vec3
    aim_down: Vec3
    night: View | None = None


# Coordinates are in the authored meshes' world space (Y up).
STAGING = {
    "weather-station": Staging(
        material=View((-1.92, 2.83, -1.94), (2.6, 2.1, 6.1), 40, 240),
        reflected=View((.65, .72, -.16), (1.8, 1.46, 5.6)),
        depth=View((.78, .89, .65), (3.9, 2.7, 6.8), 45),
        smoke=(-3.61, 5.30, -4.59), smoke_scale=.56, smoke_view=(-3.2, 1.35, -4.8),
        swatch=(-.51, 1.79, -.90), swatch_radius=.46,
        near=(1.63, 1.40, .63), far=(-.23, 2.03, -2.03), aim_down=(2.1, -.12, 4.13),
    ),
    "ferry-landing": Staging(
        material=View((-3.54, 2.89, -2.08), (2.3, 1.7, 5.6), 43, 243),
        reflected=View((.15, .69, .20), (1.6, 1.52, 5.90), 47),
        depth=View((1.65, .50, 2.28), (1.72, 2.6, 6.8), 49),
        smoke=(-2.68, 1.71, -1.79), smoke_scale=.47, smoke_view=(1.55, 1.05, 3.9),
        swatch=(-2.54, 2.02, -1.08), swatch_radius=.44,
        near=(1.74, 2.07, 2.25), far=(-2.48, 2.43, -2.2), aim_down=(1.73, -.08, 5.02),
    ),
    "glasshouse": Staging(
        material=View((1.29, 2.04, -1.95), (2.25, 1.9, 4.9), 44, 239),
        reflected=View((.72, .62, -.36), (1.33, 1.55, 5.38), 48),
        depth=View((.58, .63, 1.24), (2.04, 2.4, 5.7), 49),
        smoke=(2.59, 4.49, -4.27), smoke_scale=.44, smoke_view=(3.1, 1.09, 3.8),
        swatch=(1.12, 1.22, -1.48), swatch_radius=.39,
        near=(.12, .29, 4.15), far=(1.48, .74, -1.95), aim_down=(1.90, -.1, 4.1),
        night=View((2.06, 1.99, -1.85), (1.8, 1.10, 4.12), 43, 96),
    ),
    "night-market": Staging(
        material=View((1.68, 2.26, -1.07), (2.1, 1.34, 5.6), 45, 247),
        reflected=View((.85, .66, .36), (1.25, 1.20, 4.57), 49),
        depth=View((.92, .58, 1.75), (2.22, 2.1, 5.2), 48),
        smoke=(-3.63, .81, -2.62), smoke_scale=.48, smoke_view=(-2.05, 1.28, 3.52),
        swatch=(1.68, 1.75, -.21), swatch_radius=.43,
        near=(1.46, .10, 4.65), far=(1.35, 2.10, -1.08), aim_down=(2.05, -.18, 4.05),
        night=View((.41, 2.40, -.85), (2.1, .95, 6.1), 46, 96),
    ),
    "puppet-yard": Staging(
        material=View((-.83, 2.16, -1.39), (2.0, 1.41, 5.7), 43, 242),
        reflected=View((.30, .58, -.30), (1.45, 1.49, 5.15), 49),
        depth=View((.36, .66, .92), (2.3, 2.4, 6.1), 47),
        smoke=(2.54, .75, -1.35), smoke_scale=.48, smoke_view=(1.30, 1.08, 3.92),
        swatch=(-.08, 1.76, -.74), swatch_radius=.41,
        near=(.55, -.814, 2.85), far=(.58, .95, -1.80), aim_down=(1.82, -.1, 4.24),
    ),
}


def practice(slug: str, shots: list[dict], shot: dict) -> dict:
    s = STAGING[slug]
    overview, waterline = shots[:2]
    def pose(view: dict) -> dict:
        return {key: view[key] for key in ("target", "offset", "fov", "near", "far", "sun")}
    night_shot = next((v for v in shots if v["slug"] in {"night", "lamp"}), None)
    night = s.night.pose() if s.night else pose(night_shot or overview)
    daytime = next((v for v in shots if v["slug"] == "day"), overview)
    smoke_target = (s.smoke[0] + .25*s.smoke_scale, s.smoke[1] + 1.43*s.smoke_scale, s.smoke[2])
    poses = {
        "Overview": pose(daytime),
        "Wall and roof": s.material.pose(),
        "Waterline": pose(waterline),
        "Across the pond": s.reflected.pose(),
        "Night window": night,
        "Near to far": s.depth.pose(),
        "Chimney": View(smoke_target, s.smoke_view, 37).pose(),
        "Camera sweep": pose(daytime),
    }
    start = {
        "waterline": "Waterline", "day": "Overview", "night": "Night window", "lamp": "Night window",
    }.get(shot["slug"], "Overview")
    if shot["slug"] == "overview" and shot["sun"] < 180:
        start = "Night window"
    # The manifest's entry camera stays separate from its lesson bookmarks.
    return dict(bookmarks=poses, start=start, swatch=dict(center=s.swatch, radius=s.swatch_radius),
                smoke=dict(origin=s.smoke, scale=s.smoke_scale), focus=dict(near=s.near, far=s.far),
                reflectionAim=s.aim_down)
