"""Capture isolated native variants using a temporary copy of the prepared demo."""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import json
import math
import os
from pathlib import Path
import platform
import subprocess
import tempfile

LAB = Path(__file__).resolve().parents[1]
ROOT = LAB.parent
DEMO = ROOT / "demonstration"
BOOKMARKS = json.loads((LAB / "src" / "bookmarks.json").read_text())
TOGGLES = (
    "ssao", "blinnPhong", "fresnel", "rimLight", "refraction", "reflection",
    "fog", "outline", "celShading", "normalMaps", "bloom", "sharpen",
    "depthOfField", "filmGrain", "flowMaps", "lookupTable", "painterly",
    "motionBlur", "posterize", "pixelize", "chromaticAberration",
)
BASE = {"blinnPhong", "refraction", "normalMaps", "flowMaps"}


@dataclass(frozen=True)
class Case:
    scene: str
    effects: tuple[str, ...] = ()
    values: dict[str, float] = field(default_factory=dict)
    buffers: tuple[str, ...] = ("final", "final")
    inspect: str | None = None


CASES = {
    "spaces": Case("Overview", buffers=("final", "Normals 0")),
    "material": Case("Wall and roof", ("normalMaps",), inspect="Normals 0"),
    "lighting": Case("Wall and roof", ("blinnPhong",), inspect="Specular"),
    "fresnel": Case("Across the pond", ("fresnel",), {"reflection": 1}, inspect="Specular"),
    "rim": Case("Across the pond", ("rimLight",)),
    "cel": Case("Wall and roof", ("celShading",)),
    "refraction": Case("Waterline", values={"bRior": 0.935}, inspect="Refraction UV"),
    "reflection": Case("Across the pond", ("reflection",), inspect="Reflection UV"),
    "foam": Case("Waterline", values={"aFoam": 1.5, "bFoam": 3}, inspect="Foam"),
    "fog": Case("Near to far", ("fog",), inspect="Fog"),
    "ssao": Case("Wall and roof", ("ssao",), inspect="SSAO Blur"),
    "outline": Case("Wall and roof", ("outline",), inspect="Outline"),
    "focus": Case("Near to far", ("depthOfField",), {"focusX": 0.16, "focusY": 0.13}, inspect="Depth of Field Blur"),
    "motion": Case("Camera sweep", ("motionBlur",), {"sweep": 1}),
    "filter": Case("Wall and roof", ("painterly",)),
    "bloom": Case("Night window", ("bloom",), inspect="Bloom"),
    "poster": Case("Wall and roof", ("posterize",)),
    "pixel": Case("Wall and roof", ("pixelize",)),
    "sharpen": Case("Wall and roof", ("sharpen",)),
    "grain": Case("Night window", ("filmGrain",)),
    "chromatic": Case("Night window", ("chromaticAberration",)),
    "grade": Case("Overview", ("lookupTable",), inspect="Lookup Table"),
}


def insert(source: str, marker: str, replacement: str) -> str:
    if source.count(marker) != 1:
        raise RuntimeError(f"Native source marker changed: {marker}")
    return source.replace(marker, replacement)


def native_source() -> str:
    """Use the real capture CLI and render graph; add per-case input overrides."""
    source = '#include <cstdlib>\n' + (DEMO / "src" / "main.cxx").read_text()
    source = insert(source, "  int        cameraNear", "  float      cameraNear")
    source = insert(source, "  int        cameraFar", "  float      cameraFar")
    source = insert(source, '  load_prc_file("panda3d-prc-file.prc");', """
  auto labNumber = [](const char *key, double fallback) {
    const char *value = std::getenv(key);
    return value ? std::stod(value) : fallback;
  };
  const bool labCapture = capturing && std::getenv("MILL_PARITY");
  if (labCapture) {
    cameraRotatePhi = labNumber("LAB_PHI", cameraRotatePhi);
    cameraRotateTheta = labNumber("LAB_THETA", cameraRotateTheta);
    cameraRotateRadius = labNumber("LAB_RADIUS", cameraRotateRadius);
    cameraLookAt = LVecBase3(labNumber("LAB_X", 0), labNumber("LAB_Y", 0), labNumber("LAB_Z", 0));
    cameraFov = labNumber("LAB_FOV", cameraFov);
    cameraNear = labNumber("LAB_NEAR", cameraNear);
    cameraFar = labNumber("LAB_FAR", cameraFar);
    cameraNearFar = LVecBase2f(cameraNear, cameraFar);
    rior.set(labNumber("LAB_RIOR", 1.05), labNumber("LAB_RIOR", 1.05));
    foamDepth.set(labNumber("LAB_FOAM", 0), labNumber("LAB_FOAM", 0));
    mouseFocusPoint.set(labNumber("LAB_FOCUS_X", mouseFocusPoint[0]), labNumber("LAB_FOCUS_Y", mouseFocusPoint[1]));
""" + "\n".join(f'    {name}Enabled = makeEnabledVec(labNumber("LAB_{name}", 0));' for name in TOGGLES)
       + '\n  }\n  load_prc_file("panda3d-prc-file.prc");')
    source = insert(source, "  float mixFactor = 1.0 - (sin(toRadians(p))", """
  if (const char *pitch = std::getenv("LAB_SUN")) {
    p = std::stof(pitch);
    sunlightPivotNP.set_p(p);
    moonlightPivotNP.set_p(p - 180);
  }
  float mixFactor = 1.0 - (sin(toRadians(p))""")
    source = insert(source, "    cameraLookAt =\n      calculateCameraLookAt", """
    if (labCapture && labNumber("LAB_SWEEP", 0)) {
      cameraRotateTheta = labNumber("LAB_THETA", cameraRotateTheta)
        + std::max(0, captureFramesRun - 43) * 0.008 * 180.0 / 3.141592653589793;
    }
    cameraLookAt =
      calculateCameraLookAt""")
    return source


def environment(case: Case, side: str) -> dict[str, str]:
    pose = BOOKMARKS[case.scene]
    x, z, minus_y = pose["target"]
    dx, dz, minus_dy = pose["offset"]
    radius = math.sqrt(dx * dx + dz * dz + minus_dy * minus_dy)
    fov_x = math.degrees(2 * math.atan(math.tan(math.radians(pose["fov"]) / 2) * 4 / 3))
    values = {
        "MILL_PARITY": 1, "LAB_X": x, "LAB_Y": -minus_y, "LAB_Z": z,
        "LAB_RADIUS": radius, "LAB_PHI": math.degrees(math.acos(dz / radius)),
        "LAB_THETA": (math.degrees(math.atan2(-minus_dy, dx)) % 360), "LAB_FOV": fov_x,
        "LAB_NEAR": pose["near"], "LAB_FAR": pose["far"], "LAB_SUN": pose["sun"],
        "LAB_FOCUS_X": case.values.get("focusX", 0.509167), "LAB_FOCUS_Y": case.values.get("focusY", 0.598),
        "LAB_RIOR": case.values.get(side + "Rior", 1.05),
        "LAB_FOAM": case.values.get(side + "Foam", 0), "LAB_SWEEP": case.values.get("sweep", 0),
    }
    values.update({
        "LAB_" + key: int(side == "b") if key in case.effects else case.values.get(key, int(key in BASE))
        for key in TOGGLES
    })
    return {key: str(value) for key, value in values.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--only", choices=CASES, nargs="+")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    sdk = Path(os.environ.get("PANDA3D_SDK", ROOT / ".local" / "panda3d-sdk")).resolve()
    architectures = subprocess.check_output(["lipo", "-archs", sdk / "lib/libp3framework.dylib"], text=True).split()
    architecture = platform.machine() if platform.machine() in architectures else "x86_64"
    with tempfile.TemporaryDirectory(prefix="mill-native-parity-") as tmp:
        work = Path(tmp)
        cpp, binary = work / "main.cxx", work / "mill-native"
        cpp.write_text(native_source())
        # Panda's model path points to the executable directory ($MAIN_DIR).
        for name in ("eggs", "images", "fonts", "shaders"):
            (work / name).symlink_to(DEMO / name, target_is_directory=True)
        subprocess.run([
            "clang++", "-arch", architecture, "-std=c++11", "-O2",
            "-I" + str(sdk / "include"), cpp, "-L" + str(sdk / "lib"),
            "-lp3framework", "-lpanda", "-lpandafx", "-lpandaexpress",
            "-lpandaphysics", "-lp3dtoolconfig", "-lp3dtool", "-o", binary,
        ], check=True)
        for name in args.only or CASES:
            case = CASES[name]
            tasks = [(side, buffer, side) for side, buffer in zip(("a", "b"), case.buffers, strict=True)]
            if case.inspect:
                tasks.append(("buffer", case.inspect, "b"))
            for suffix, buffer, side in tasks:
                env = {**os.environ, "PANDA_PRC_DIR": str(DEMO), "DYLD_LIBRARY_PATH": str(sdk / "lib"),
                       **environment(case, side)}
                target = output / f"{name}-{suffix}.png"
                result = subprocess.run([
                    binary, "--capture", target, "--preset",
                    "midnight" if BOOKMARKS[case.scene]["sun"] == 90 else "midday",
                    "--buffer", buffer, "--frames", "60", "--disable", "particles",
                ], cwd=DEMO, env=env, capture_output=True, text=True, timeout=45)
                if result.returncode or not target.exists() or (buffer == "final" and target.stat().st_size < 2000):
                    raise RuntimeError(f"{name}/{side}/{buffer}: {result.stdout}\n{result.stderr}")
            print(f"{name}: {case.scene}, pitch {BOOKMARKS[case.scene]['sun']}°, frame 60, {len(tasks)} captures", flush=True)


if __name__ == "__main__":
    main()
