# Shader Field Guide (2026)

An independent, concise, visually coherent modernization of the concepts in [David Lettier's *3D Game Shaders for Beginners*](https://lettier.github.io/3d-game-shaders-for-beginners/index.html).

**What's included**

- `index.html` — responsive interactive lesson site, with one 3D scene, 17 lesson modes, a before/after split, camera orbit and controls.
- `demo.html` — the same guide in a generated, standalone page that can open directly from disk. After editing `index.html` or `src/`, run `python3 build_demo.py` from this directory. Use `python3 build_demo.py --check` to check for drift.
- `src/renderer.js` — original WebGL2 / GLSL ES 3.00 implementation: geometry, MRT, hardware depth, PBR lighting, stylization, multi-pass HDR bloom, final color management.
- `src/lessons.js` — concise conceptual explanations, pipeline inputs/outputs and code motifs.
- `src/main.js` — interface and interactions.
- `GUIDE.md` — the compact written rewrite: pipeline mental model, core snippets, tradeoffs, **coverage of all 33 original sections**, and a modern learning path.

## Run

This uses **no dependencies and no bundler**. Because ES modules may not load from a `file://` URL, run any static web server:

```bash
cd shader-field-guide
python3 -m http.server 8000
# Open http://localhost:8000
```

Use a recent browser with WebGL2 enabled. Orbit with a drag, zoom using the mouse wheel; select lessons from the left panel; drag the before/after split slider and adjust material controls.

## Technical boundaries

- The scene is rendered using WebGL2, *not* a framework such as Three.js. It includes procedurally created mesh geometry and independently written shaders.
- Uses RGBA16F HDR targets when supported. On WebGL2 with RGBA8 targets, the base scene still renders, and the HDR bloom lesson marks the effect unavailable. If WebGL2 cannot start, the clearly labeled Canvas2D preview illustrates effects without running shaders.
- The PBR implementation includes direct GGX lighting and approximate ambient, **not** IBL, shadows, or production-quality multiple-scattering compensation.
- `Normal detail` demonstrates procedural normal perturbation, **not** a real tangent-space normal-map asset. The guide includes the actual TBN mapping pattern.
- `Color grading` is a split-tone demonstration, **not** a 3D LUT implementation.
- The advanced material in `GUIDE.md` (SSR, SSAO/GTAO, DOF, deferred shading, motion vectors, temporal methods, water foam/flow) **is conceptual only**: there is no misleading simulated toggle pretending to implement it.
- Performance was not benchmarked on real devices. Scene complexity is intentionally tiny. The live view renders the geometry twice to produce a clean A/B comparison.

## Source code licensing

Source code in this package is independently authored and is released under MIT (see `LICENSE`). All text, layout and teaching examples are original and may be redistributed with attribution under CC BY 4.0. No original tutorial images or prose were copied.

The underlying shader ideas, like other common mathematical and graphics algorithms, are not proprietary to this project. Attribution to Lettier is included for the inspiration and chapter scope.
