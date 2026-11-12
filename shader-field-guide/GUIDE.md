# Shader Field Guide

**A compact modern mental model of 3D rendering, with all 33 original tutorial sections accounted for.**

Inspired by the topics of David Lettier's [3D Game Shaders for Beginners](https://lettier.github.io/3d-game-shaders-for-beginners/index.html). This is a newly authored explanation, not a reproduction of that site's prose, diagrams, or examples.

## 0 · The whole renderer in one picture

```text
CPU: meshes, textures, camera, lights, materials
         │
         ▼
GPU: VERTEX SHADER           [per vertex]
    local → world → view → clip; pass UV, normal, world position
         │
         ▼
    RASTERIZER              [fixed-function GPU stage]
    clip, primitive coverage, interpolate UV/normals/depth
         │
         ▼
    FRAGMENT SHADER          [per fragment / sample]
    sample material → evaluate direct/indirect light → output colors
         │
         ▼
    RENDER TARGETS           [2D images]
    scene HDR color + hardware depth + optional normals/velocity
         │
         ▼
    SCREEN-SPACE PASSES      [per output pixel]
    AO / reflections / DOF / bloom / outlines / grading
         │
         ▼
    OUTPUT
    exposure → tone map → encode sRGB → display
```

**The key:** a shader does not magically know where data comes from. Its inputs are either (1) GPU attributes, (2) constants/uniform buffers set by the CPU, (3) textures produced by assets or earlier passes, or (4) built-in GPU state. Fragment shaders write outputs into the currently bound render attachments; the next pass can sample those attachments as textures.

In WebGL2, the practical stages you author here are *vertex* and *fragment*. Rasterization is not a shader function you directly call. WebGPU adds compute pipelines and uses WGSL instead of GLSL. Vertex/tessellation/geometry/mesh shaders belong to different graphics API feature sets, not universal hooks exposed by every renderer.

## 1 · Coordinate spaces, without the confusion

| Space | Position means | Typical data |
|---|---|---|
| Object / local | relative to the mesh origin | `a_position` |
| World | relative to the scene origin | lighting positions and light directions |
| View / eye | relative to the camera | camera-facing effects, view depth |
| Clip | homogeneous coordinates before perspective divide | `gl_Position` |
| NDC | `clip.xyz / clip.w` | x/y in −1…1; WebGL z in −1…1 |
| Screen / UV | pixels or normalized texture positions | postprocessing lookups |

```glsl
// Vertex shader: GLSL ES 3.00
#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 uv;
uniform mat4 model, view, projection;
out vec3 worldPosition, worldNormal;
out vec2 texCoord;
void main() {
    vec4 world = model * vec4(position, 1.0);
    worldPosition = world.xyz;
    // For non-uniform scale: use transpose(inverse(mat3(model))) instead.
    worldNormal = normalize(mat3(model) * normal);
    texCoord = uv;
    gl_Position = projection * view * world;
}
```

**Two conventions to remember:** a WebGL/OpenGL conventional perspective depth buffer is nonlinear, and its clip/NDC Z convention is not automatically identical to WebGPU's. Never mix view-space coordinates, world-space normals and clip-space directions in one lighting equation without explicitly transforming them.

## 2 · Fragment lighting: what changed since Phong

The classic Blinn–Phong model is a useful learning tool:

```glsl
vec3 H = normalize(L + V);
float NoL = max(dot(N,L), 0.0);
float highlight = pow(max(dot(N,H),0.0), shininess);
vec3 lit = albedo * NoL + specularColor * highlight;
```

A modern **metallic-roughness** material has better semantics:

- **Base color:** diffuse reflectance for a dielectric; specular reflectance tint for a metal.
- **Metalness:** mixes dielectric and conductive behavior. Usually near 0 or 1.
- **Roughness:** controls the width of a *microfacet* reflection lobe (GGX is common).
- **Normal:** the effective local surface orientation; a tangent-space normal map perturbs this without changing the silhouette.
- **Emission:** light emitted by the surface, potentially above display white in an HDR pipeline.

For one light, the useful decomposition is

```text
reflected radiance ≈ incoming radiance × NoL × (diffuse BRDF + specular BRDF)
specular BRDF = D_GGX × G_Smith × F_Schlick / (4 × NoL × NoV)
```

`D` = distribution of microfacet normals. `G` = microfacet occlusion/masking. `F` = Fresnel fraction reflected at the interface. PBR still needs realistic illumination; without image-based lighting (IBL), a metallic object can look unnaturally dark in the shadows. The site demo supplies direct lights and a simple ambient approximation so its PBR preview is **educational, not a production reference renderer**.

**Shadows still require geometry/visibility information.** A typical real-time shadow map draws scene depth from the light's viewpoint, transforms a receiver into that light's clip space, and compares stored depth against receiver depth. Add a slope-aware bias and PCF/other filtering to reduce acne and hard stair-stepped edges. Directional sunlight often needs cascades; contact shadows or ray tracing can fill in missing small-scale detail. The live scene's floor contact darkening is an artistic approximation, **not** a shadow map.

**Stylization is not superseded by PBR.** Rim light, toon bands, posterization and silhouettes remain valid choices; just distinguish artistic terms from physically motivated terms. Schlick's Fresnel is not the same thing as an added rim glow.

## 3 · Rendering to textures and choosing a pipeline

Framebuffer objects (FBOs) let a pass render into a texture instead of the screen. Multiple render targets (MRT) let a geometry pass produce more than one texture: for example, scene color and normals. A **G-buffer** commonly stores depth, normals and material attributes to shade later.

| Architecture | Best fit | Tradeoffs |
|---|---|---|
| Forward | Few/moderate lights, simpler scenes, transparency and MSAA | Repeats lighting on shaded fragments |
| Forward+ / clustered | Many local lights with tiled/clustered light lists | Needs light culling infrastructure |
| Deferred shading | Many opaque objects/lights, complex decals and screen-space light evaluation | G-buffer bandwidth, transparency, MSAA complexities |
| Hybrid | Opaque deferred/clustered, transparent forward, specialized extra passes | More orchestration, common in production |

A *separate texture for every intermediate value* is not automatically best. Bandwidth, GPU attachment count, cache behavior and resolve costs matter. Modern approaches often reconstruct view position from depth instead of storing three extra floating-point position channels.

The live demo uses two scene renders for the comparison UI (before and after). Each scene render writes linear scene color, world normals and a hardware depth texture. The expensive bloom path uses lower-resolution offscreen targets. It is a small renderer, not a deferred-shading engine.

## 4 · Image-space effects, sorted by the data they need

### Only scene color

- **Gaussian / box blur:** weighted neighborhood sampling. Separable Gaussian is O(2k) rather than O(k²) taps; use multiple downsampled scales for large glow radii.
- **Bloom:** bright regions in **linear HDR** → downsample → blur → add to HDR scene → tone map. Brightness thresholds on already-clamped SDR footage cannot distinguish 1× white from a 10× emissive surface.
- **Median / Kuwahara filtering:** edge-aware local image stylization. Median chooses a neighborhood order statistic; Kuwahara chooses a low-variance subregion. Both can preserve structure while suppressing texture detail.
- **Sharpen:** center-weighted local contrast; can accentuate aliasing, noise and compression.
- **Pixelization:** quantize screen sampling coordinates. For authentic low-res appearance, use a lower-resolution scene target and nearest-neighbor upscale.
- **Posterization:** quantize color/luminance; may need dithering.
- **Chromatic aberration:** offset R/B UV samples relative to G. Mostly an art-direction tool.
- **Film grain:** hash pixel coordinates and time/frame index; apply late to avoid smearing by temporal reconstruction.
- **LUT/color grading:** grade after lighting at a *specified* point in the display pipeline; 3D LUTs offer interpolated RGB transforms.
- **Dilation:** morphological max filter; expands bright regions, but is not a substitute for a high-quality bokeh filter.

### Need depth (and sometimes normals)

- **Fog:** reconstruct *linear* view distance, then mix fog color using `exp(−density × distance)` for constant-density extinction. Height fog and volumetric fog integrate through 3D space.
- **Outlining:** edge detection on depth/normal discontinuities; scale depth thresholds with distance.
- **SSAO:** sample nearby 3D positions using depth and normals, estimate local occlusion, denoise/bilateral blur. GTAO and temporally accumulated AO are valuable next steps.
- **Depth of field:** compute circle of confusion from depth and focal parameters. The basic near/far crossfade is an approximation; production versions handle foreground bleed, bokeh and gather/scatter more carefully.
- **Screen-space reflection:** march a reflected view ray against screen depth; misses off-screen/occluded geometry. Use confidence and fallbacks (probes, environment maps, hardware ray tracing where available).
- **Screen-space refraction:** approximate transmission through a surface using background color/depth plus refracted/offset rays. Thickness and disoccluded background are major pitfalls.
- **Foam/intersections:** find where the depth of a liquid surface approaches depth of scene geometry; modulate by moving noise/foam masks.

### Need previous-frame information

- **Motion blur:** use motion vectors (current vs previous clip-space positions) and a shutter-time sample integration. Camera-only reprojection misses moving objects.
- **Temporal anti-aliasing / temporal denoising (modern addition):** jitter the camera, reproject previous history, reject disocclusions/ghosting, blend filtered results. This temporal infrastructure matters for noisy AO, reflections and upscalers.

### Need animation data

- **Flow mapping:** sample a 2D vector field and advect UV coordinates to give moving-water/smoke patterns. For long animations, wrap and blend phases to avoid an obvious texture jump or excessive UV drift.

## 5 · Color pipeline: the most important correctness rule

```
texture: base color (sRGB) ──decode──┐
texture: normal/roughness (data) ─────┤
lights + material ───────────────────┼─► linear scene radiance (can exceed 1)
                                     │    ├─► bloom / linear compositing
                                     │    └─► exposure → tone mapping
                                     └────────► output sRGB encoding → display
```

- Convert sRGB *color* textures to linear RGB before lighting; many modern graphics APIs and engines can automatically decode appropriately declared texture formats.
- **Do not decode** normal, roughness, metalness, depth, velocity or other numeric data maps as sRGB colors.
- Tone mapping maps HDR radiance into a finite display range; the sRGB encoding is a *separate* operation.
- `pow(x, 2.2)` and `pow(x, 1/2.2)` are approximations to the real piecewise sRGB transfer functions. Avoid double-encoding or treating already encoded values as linear.
- Display color space/gamut and transfer function are different concepts. Work explicitly within a named color space (e.g., linear-sRGB), then convert to your intended output.

## 6 · The 33-section migration map

Every original section is represented below, including the original setup material. **Live** means an interactive demonstration on this site; **Guide** means the concept is explained here but no live implementation is claimed.

| # | Original section | Status | Clean replacement / reason |
|---:|---|---|---|
| 1 | Setup | Guide | No Panda3D/compilers required for the WebGL2 demo |
| 2 | Building the demo | Guide | Native browser import and static local server |
| 3 | Running the demo | Guide | Sidebar selection, orbit and material sliders |
| 4 | Reference frames | Guide | Explicit object → world → view → clip → NDC → UV |
| 5 | GLSL | Guide | GLSL ES 3.00, explicit `in`, `out`, uniforms and outputs |
| 6 | Render to texture | Live | Scene FBO, MRT normals, depth attachment, post passes |
| 7 | Texturing | Guide | UV interpolation, sRGB base color vs data maps |
| 8 | Lighting | Live | Lambert vs GGX microfacet PBR |
| 9 | Blinn–Phong | Live | Lambert diffuse vs diffuse with a Blinn–Phong highlight |
| 10 | Fresnel factor | Live | Schlick Fresnel inside GGX BRDF |
| 11 | Rim lighting | Live | Separate artistic glow from Fresnel |
| 12 | Cel shading | Live | Quantized diffuse lighting |
| 13 | Normal mapping | Live* | Procedural normal perturbation live; TBN map code in lesson |
| 14 | Deferred rendering | Guide | Forward / forward+ / deferred tradeoff |
| 15 | Fog | Live | Exponential attenuation using linear depth |
| 16 | Blur | Live | 9-tap preview; separable Gaussian in bloom pipeline |
| 17 | Bloom | Live with HDR targets | HDR extraction + half-res separable blur + recombination |
| 18 | SSAO | Guide | Depth-based samples, reconstruction, denoising, GTAO |
| 19 | Motion blur | Guide | Per-object and camera motion vectors, exposure samples |
| 20 | Chromatic aberration | Live | Offset RGB sampling |
| 21 | Screen-space reflection | Guide | Depth ray-marching, visibility limits, fallbacks |
| 22 | Screen-space refraction | Guide | Background/depth/thickness limitations |
| 23 | Foam | Guide | Surface intersection depth + pattern mask |
| 24 | Flow mapping | Guide | Advected UVs sampled from a 2D direction field |
| 25 | Outlining | Live | Normal+depth discontinuity |
| 26 | Depth of field | Guide | CoC, bokeh and foreground occlusion |
| 27 | Posterization | Live | Color quantization |
| 28 | Pixelization | Live | Block-centered image sampling |
| 29 | Sharpen | Live | Five-tap Laplacian-style sharpening |
| 30 | Dilation | Guide | Max filter / morphological growth |
| 31 | Film grain | Live | Integer pixel hash after output transform |
| 32 | Lookup table | Live* | Split-toning demo; genuine 3D LUT discussed |
| 33 | Gamma correction | Live | Linear scene → tone map → exact sRGB output encoding |

\* An accessible stand-in, not a full asset-driven or LUT implementation. **No SSR, SSAO, DOF, motion blur or deferred renderer is secretly simulated in the live canvas.** Those require extra buffers or temporal infrastructure and are intentionally left as guided advanced work.

## 7 · What to learn next, in order

1. **GLSL and transforms:** understand exactly where attributes, varyings, uniforms, textures and fragment outputs originate.
2. **Lighting:** Lambert → Blinn–Phong → GGX PBR with linear color management. Study normal-map tangent bases.
3. **GPU passes:** draw to a framebuffer; expose its color, depth and normals; sample them in a full-screen triangle.
4. **Postprocessing:** outline → depth fog → separable blur → HDR bloom → tone map / color grade.
5. **Screen-space reconstruction:** depth to position; SSAO/GTAO; SSR limitations; disocclusion artifacts.
6. **Temporal graphics:** motion vectors, TAA, histories, denoising and dynamic resolution.
7. **Modern engines/APIs:** glTF assets, IBL, clustered lighting; then consider WebGPU/WGSL compute or built-in render graphs in Godot/Unity/Unreal.

## 8 · Small implementation details that matter

- The original `Texturing` fragment snippet declares a `vec2` output but samples a 4-component color and references an undeclared variable; treat it as prose, not paste-ready code.
- Its `Posterization` example shows a multiplication expression without assignment to the output; a readable version should explicitly assign.
- Its approximate gamma `pow(2.2)` may be sufficient for a chalkboard demonstration, but not for a strict color-managed pipeline.
- Its multiple-attachment advice is overly broad if interpreted as “always write every possible render target.” More targets can increase memory traffic and cost.
- Screen-space algorithms are often *partial estimators* of 3D effects. SSR cannot see geometry absent from the current camera image; motion blur cannot infer object motion from camera matrices alone.

## References and acknowledgement

- David Lettier, [*3D Game Shaders for Beginners*](https://lettier.github.io/3d-game-shaders-for-beginners/index.html), all 33 sections (2019–2020 source material).
- Khronos, [glTF 2.0 specification — Materials and BRDF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
- Google, [Filament PBR material model and GLSL implementation](https://google.github.io/filament/Filament.html).
- Three.js, [Color Management](https://threejs.org/manual/pages/color-management.html).
- MDN, [WebGL2RenderingContext](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext) and [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API).

This guide is original writing and the live code is independently authored. The original repository's software license **does not grant permission to reuse its tutorial text and illustrations**; none are copied here.
