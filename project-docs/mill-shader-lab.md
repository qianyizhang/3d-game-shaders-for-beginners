# Mill Shader Lab build checklist

**Accepted scope.** Build the static browser lab in `mill-shader-lab/`, beside the original `demonstration/` and the companion `shader-field-guide/`. Keep the original scene and teach the classic techniques alongside the best of Shader Field Guide. Every technique below has a repeatable scene setting, a learner action, and a visible result.

## Scene and lab

- [ ] **Browser stack.** TypeScript and plain HTML/CSS, Three.js as the sole runtime package, and readable GLSL ES 3.00. The lab owns pass order, shader inputs, and debug views. Serve static files; Panda3D is only an offline reference and asset tool.
- [ ] **Original mill assets for local use.** Convert the [four BAM models and their textures](../demonstration/src/main.cxx) offline. Check orientation, scale, pivots, texture color spaces, and animated parts. Keep asset paths and named roles (mill, wheel, water, shutters, vane, banner) in a replaceable scene manifest. Keep converted original art and audio in the ignored `.local/mill-assets/`; the [upstream license](../README.md) only covers code. Record provenance and use cleared replacement assets for a shared build.
- [ ] **Play.** Orbit, pan, zoom, set focus, and restore the overview. Provide midday, midnight, daylight scrub, play/pause, wheel and flow, moving props, smoke, and opt-in sound. Keep independently toggleable effects in one panel so they can be combined.
- [ ] **Practice.** Open a named scene setting; predict, change one input, and compare the same camera, clock, and other inputs. Each row below needs a real task and a reset. Include a small edit to a running shader in the first water lesson, with compile feedback and the last working render preserved.
- [ ] **Inspect.** Select actual render targets with a label, its producing pass, and the next pass that reads it. Keep the original inspector's useful groups: geometry, water masks and hit UVs, lighting, AO, focus and blur, and final color stages. Map old buffer names to their browser equivalents, including any values now reconstructed from depth.

## Repeatable scene settings

| Setting | What to frame and hold |
| --- | --- |
| **Overview** | Match the native reset camera and composition. Use it as the common frame for legacy parity captures, with a named time preset and animation frozen. |
| **Wall and roof** | Sunlit wall, corner, and roof edge; use oblique light to reveal texture and shadows. Hold geometry and camera for material comparisons. |
| **Waterline** | Wheel and waterway at midday; show water crossing the wheel and dock. Hold wheel phase and water time while comparing individual passes. |
| **Across the pond** | Look across the water from a low angle. Keep a reflected object in view, then move it outside the frame to expose a screen-space miss. |
| **Night window** | Midnight with window light on. Frame both a bright window and a dull wall in the same shot. |
| **Near to far** | Frame near dock or wheel and farther mill or bank together. Fix camera and time; move the focus point for depth of field. |
| **Camera sweep** | Replay the same short pan from Overview; keep scene time fixed to isolate camera motion. |

The native reference is [reset and defaults](../demonstration/src/main.cxx), with sun animation stopped (`/` if running), then midday (`1`, sun pitch 270°) or midnight (`2`, 90°). `R` resets camera, fog (2/9), foam depth (1.5), relative refraction index (1.05), and focus; it does not reset effect toggles. Preserve these values in a **Legacy** preset, translating units if the import changes scale. The close-ups above are new bookmarks, not native presets.

### Native reference procedure

Use the [native capture CLI](native-reference.md#capture-the-scene-or-one-buffer) for matching references. Start from reset camera with default effects. At 1200×900 and 60 frames, capture midday and midnight final color, midday with depth of field disabled, and midday Refraction UV. The UV pass can show detail beyond the water; the [refraction color pass](../demonstration/shaders/fragment/refraction.frag) applies the material mask when sampling.

## Technique checklist

**O** = [original tutorial and demo](../README.md); legacy keys are reference locators from the [native controls](../sections/running-the-demo.md#demo-controls). **F** = [Field Guide](../shader-field-guide/src/lessons.js). Each entry is live unless marked as context.

### Geometry and light

- [ ] **Spaces, GLSL, render to texture** · O + F · **Overview.** Follow a selected point from object to screen. Switch between scene color, encoded normals, raw depth, linear depth, and view position. Show the actual vertex and fragment code and the buffer each pass writes.
- [ ] **Texturing and normal mapping** · O `o` + F · **Wall and roof.** Compare UV checker, color map, flat normal, and sampled tangent-space normal map. Move light; surface detail changes while the silhouette stays fixed. Use procedural perturbation as a comparison.
- [ ] **Lighting, shadows, and specular** · O `0` + F · **Wall and roof.** Compare diffuse only, Phong, and Blinn–Phong on the same patch. Move light and change shininess; inspect the highlight and shadow separately.
- [ ] **GGX microfacet lighting** · F · **Wall and roof.** Compare legacy specular to GGX with matched light and geometry. Change roughness and metalness on a material swatch; observe highlight spread and the diffuse/specular balance.
- [ ] **Fresnel, rim, and cel shading** · O `3/4/8` + F · **Across the pond / Wall and roof.** Vary viewing angle for Fresnel and artistic rim, then move light across cel bands. Expose each separately so the two edge effects are distinguishable.
- [ ] **Forward and deferred shading** · O chapter + F context · **Overview.** Switch opaque lighting from geometry pass to a fullscreen pass that reads the G-buffer. Show the buffers and comparable output; render transparent water separately. The original demo's named geometry buffers alone are not evidence of deferred lighting.

### Water and depth

- [ ] **Screen-space refraction** · O `,` and `=` · **Waterline.** Vary relative index from the legacy 1.05. Inspect water mask, hit UV and refracted color. Behind-water geometry shifts; foreground stays fixed. Show the undistorted fallback on a miss.
- [ ] **Screen-space reflection** · O `m` · **Across the pond.** Compare mirror-like and rippled normals, then orbit until the source leaves the frame. Inspect reflection mask, hit/visibility and color.
- [ ] **Foam and flow maps** · O `-` and `.` · **Waterline.** Change foam depth from 1.5 and see the shoreline/contact band widen. Pause and step the flow; show the direction field and moving UVs, with no change to mesh shape. Preserve the legacy flow/wheel link in Legacy mode.
- [ ] **Fog** · O `p`, `[`, `]` + F · **Near to far.** Compare the legacy near/far ramp against exponential density fog at the same camera. Inspect depth and fog amount; nearer and farther objects respond differently.
- [ ] **SSAO** · O `y` · **Wall and roof.** Inspect raw and filtered occlusion at wall/roof and dock joints. Change radius or enable/disable; contact darkens without moving the light.
- [ ] **Outlines** · O `u` + F · **Wall and roof.** Compare legacy position edges against depth/normal edges. Tune a threshold; distinguish the silhouette from a crease inside it.
- [ ] **Depth of field and dilation** · O `h` and focus pick · **Near to far.** Pick the dock, then the mill. Inspect focus/blur mask, blurred source and dilated source; show the foreground bleed dilation addresses.
- [ ] **Motion blur** · O `6` · **Camera sweep.** Compare the same frame with blur off and on. Show camera reprojection or sample direction. A stopped camera should have no camera-motion blur; object motion vectors are outside this parity requirement.

### Image and color

- [ ] **Blur and painterly filtering** · O `7` + F · **Wall and roof.** Compare box blur, separable Gaussian, and Kuwahara at a window edge. Show what each does to the edge. Cover median as reference context; it is documented but not wired into the native demo.
- [ ] **Bloom** · O `i` + F · **Night window.** Compare the legacy thresholded neighborhood filter with HDR bright-pass → half-resolution blur → add → tone map. Inspect extraction and blur. Keep the HDR lesson disabled if float rendering is unavailable.
- [ ] **Posterize, pixelize, and sharpen** · O `j/k/l` + F · **Wall and roof.** Adjust levels, block size, and strength separately; distinguish bands, block sampling, and edge ringing. Keep the legacy pixelize background mask available.
- [ ] **Film grain and chromatic aberration** · O `n` and backslash + F · **Night window.** Freeze/step grain; move the focus marker and see RGB fringing change with distance from it. Compare the draft's fixed-center version as a starting case.
- [ ] **LUT and color output** · O `9` + F · **Overview and Night window.** Compare neutral and day/night grades with a real LUT, plus Field Guide split toning. Use a gray ramp to compare the legacy power curve and exact sRGB encoding. Show where tone mapping and encoding happen, and apply display encoding once.

## Completion and build order

- [ ] **First proof:** The original mill, wheel and water load and align in desktop Chrome on this Mac. The wheel has a working pivot and the water and opaque geometry are separate. A proxy can help test the renderer; only the original assets pass this gate. The Waterline refraction lesson runs end to end with pause, matched A/B, a working shader edit, mask/UV inspection, and reset. Use this to settle asset conversion and pass wiring before adding the other rows.
- [ ] **Parity evidence:** For each O row, compare a representative before/after against the native view at matched camera, time, focus, and effect state where practical. Compare observable behavior in matching views; pixel-identical output is not required. Capture the setting and relevant buffer, and explain deliberate differences. Use fixed-frame native captures for repeated checks where supported.
- [ ] **Full lab:** Complete every live row, including all 17 Field Guide modes as mapped techniques. Setup/build/run become browser onboarding; the 33-section source index remains linked. Verify the full flow in desktop Chrome and Safari, including keyboard, a narrow touch layout, a bad shader edit, and GPU capability fallback. A fallback illustration does not count as a passing GPU exercise.
