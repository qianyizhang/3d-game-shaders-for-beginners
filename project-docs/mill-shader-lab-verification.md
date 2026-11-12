# Mill Shader Lab: setup and verification

From the checkout root, convert the original art once:

```sh
python3.12 -m venv .local/mill-convert-venv
.local/mill-convert-venv/bin/python -m pip install panda3d==1.10.16
.local/mill-convert-venv/bin/python mill-shader-lab/tools/convert_mill.py
cd mill-shader-lab
npm ci
npm run dev
```

Open the address printed by Vite. For a static build, use `npm run build`
and `npm run preview -- --port 4317`. Both local servers mount
`.local/mill-assets/` at `/mill-assets/`. The static `dist/` has no original art.
Serve a cleared manifest at that path or point the lab at one with
`?scene=URL`. WebGL 2 is required; the lab labels the unavailable state instead
of substituting an illustration. Without a renderable float target, the HDR
bloom option is disabled and the legacy exercise remains live.

The converter reads the four original BAMs using Panda3D 1.10.16. It preserves
native units, converts Z-up to Y-up as `(x, z, -y)`, and preserves the wheel's
local origin `(-0.51001, 2.01001, -3.5)` and rotation about X. It separates
water, batches static geometry by material, retains UVs and tangent bases, and
bakes the original shutter, vane and banner clips. Diffuse textures decode
from sRGB on load. Normals, specular, masks, flow and lookup tables are data.
The ignored scene manifest identifies named roles, texture roles and source
digests. The upstream license covers code; keep original art, audio and
captures local.

## Run the checks

From `mill-shader-lab/`, after setup:

```sh
npm test
```

This builds the lab, starts a temporary loopback preview, and runs the
19 lessons in headless Chrome with a disposable profile. The test blocks
off-origin app requests; it needs no internet, native SDK, or running server
after the npm dependencies and original asset conversion are in place. It
checks rendered pixels, shader edit recovery, audio, GPU and asset failure
paths, keyboard controls, and Chrome touch emulation at 360 CSS pixels.
Screenshots stay in memory during routine runs.

To regenerate the browser side of the local comparison gallery:

```sh
npm run capture:parity -- ../.local/mill-verification/chrome
```

Append case names to capture a subset. This uses the same offline preview and
browser harness, and writes PNGs only to the requested output directory.

From the checkout root, with the SDK and GPU access described in the
[native reference](native-reference.md):

```sh
python3.12 mill-shader-lab/tools/native_parity.py .local/mill-verification/native
```

The native helper compiles a temporary copy of the prepared C++ demo, mounts
the original models beside the temporary binary, and calls the existing
capture CLI. It adds pose and effect inputs needed for the comparisons and
leaves the demo sources and shaders intact. It shares the browser
[bookmark data](../mill-shader-lab/src/bookmarks.json), converts the vertical
FOV to native horizontal FOV at 4:3, and normalizes the angle before passing it
to the native camera. Both sides capture frame 60 at 1200×900, with the same
camera, sun pitch and focus per pair, and smoke disabled. The motion pair
uses sweep sample 16 at frame 60. The focus pair uses UV (0.16, 0.13).
Individual pass settings live in the [native](../mill-shader-lab/tools/native_parity.py)
and [browser](../mill-shader-lab/test/parity.mjs) cases.

## Results and limits

Native reference revision: `933a5256541b46f774fc2b6cbf1e3174e98e906a`.
The retained evidence and review index are in
[the local comparison bundle](../.local/mill-verification/gallery.html).

- **Waterline:** Original wheel, channel, mill and dock align in Chrome.
  Changing 1.050 to 0.935 affects visible water pixels while the opaque
  foreground stays fixed. Miss pixels match the undistorted sample.
  The live GLSL edit changes the render; a failed compile preserves it;
  reset restores the reference. Stepping pivots the wheel when linked flow runs.
- **Full flow:** All 19 live rows have repeatable settings, real passes or
  inputs, relevant buffer views and reset. Verified the live effects, source
  disclosure, keyboard scene control, narrow touch drag and comparison,
  opt-in audio, and SDR and no-WebGL states in Chrome. Compared forward
  and deferred lighting at the same settings; average error was about 0.02
  per channel on the 0–255 display scale.
- **Native parity:** The 22 isolated pairs show the expected behavior where
  the algorithms overlap. Framing matches; material colors, light intensity
  and the size of a change vary. Browser-only variants (GGX, true deferred
  lighting, exponential fog, depth/normal outlines, HDR bloom and split
  toning) have separate live tests. The task does not require pixel equality.

The window light is a localized emission approximation of the native spotlights.
The browser traces reflections on the water, with sky on a screen-space miss;
the native renderer also reflects on selected opaque materials and has a
separate reflection blur. Native Fresnel boosts material specular; the browser
lesson exposes the angle-dependent water reflection weight. Native cel uses
smooth thresholds; the browser uses distinct bands. The lab freezes the last
advected UV when flow is off; the native shader removes the offset on disable.
Browser focus uses depth distance and extends far colors behind silhouettes;
native focus uses view-space point distance and a brightest-neighbor dilation.
Browser motion uses camera reprojection only. Legacy bloom remains a thresholded
neighborhood pass; HDR bloom extracts values above linear white, blurs at half
resolution, adds, then tone maps. The LUT tiles are trilinearly sampled in the
browser. The native demo mixes two opposite tile samples. Exact sRGB and the
native 2.2 power curve are separate final encodings.

The original [refraction lesson](../sections/screen-space-refraction.md) has two
stale descriptions. The native [UV pass](../demonstration/shaders/fragment/screen-space-refraction.frag)
uses visibility to mix the UV coordinates and writes blue as 1. The
[native color pass](../demonstration/shaders/fragment/refraction.frag) returns
undistorted background outside the mask. A future tutorial correction should
show those two code paths in the Markdown and generated HTML. This task keeps
the original tutorial intact.

## Inspector map

| Native inspector | Browser inspector |
| --- | --- |
| Positions 0, Normals 0 | Raw depth → Linear depth / View position, Encoded normals |
| Positions 1, Normals 1 | Water depth, Water normals; water compositing compares opaque and water depth before using a sample |
| Positions 2, Smoke Mask | Nearest opaque/water depth reconstructed by the post passes; Smoke mask for the separate sprite overlay |
| Refraction Mask, Refraction UV, Refraction | Water mask, Refraction hit UV, Refracted color |
| Reflection Mask, Reflection UV, Reflection Color, Reflection | Reflection mask, Reflection hit UV / visibility, Reflection color, Fresnel weight |
| Reflection Blur | No separate browser blur; the reflection lesson contrasts mirror and sampled rippled normals |
| Foam Mask, Foam | Flow direction / Flow UV, Foam; the sampled pattern and contact depth both feed Foam |
| SSAO, SSAO Blur | SSAO raw, SSAO filtered |
| Base, Specular, Base Combine | Opaque / Forward / Deferred color, Specular, Refracted color; add Shadow map and Shadow visibility |
| Fog, Outline, Painterly, Bloom, Scene Combine | Fog amount, Outline edges, Filtered color, Bloom extraction / blur / combined, Final color |
| Out of Focus, Dilation, Depth of Field Blur, Depth of Field | Blurred source, Dilated source / blur, Focus / blur mask, Depth of field |
| Posterize, Pixelize, Film Grain, Motion Blur | Display linear for the color effects, Motion blur / Motion direction |
| Lookup Table, Gamma Correction, Chromatic Aberration | Graded linear, Final color with the selected output curve and fringing |

The original chapter index remains linked from the lab. Its companion's 17
modes map to these live lessons: Microfacet PBR → GGX; Blinn–Phong → Lighting;
Normal buffer and Depth reconstruction → Spaces; Normal detail → Texturing;
Cel shading and Rim lighting → Fresnel/rim/cel; Depth fog → Fog; Depth/normal
outlines → Outlines; HDR bloom → Bloom; Spatial blur → Blur; Posterization,
Pixelation and Sharpen → Sampling; Color grading → LUT and color; Film grain
and Chromatic aberration → Grain and fringing.
