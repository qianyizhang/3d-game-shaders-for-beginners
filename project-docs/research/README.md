# Replacing the mill: asset feasibility

**Start with the canal weather station.** Its hardest shapes are a small
building and a stepped quay. Source the surface maps and ordinary props; make
the station silhouette, striped gauge, and channel as one composition.
The **night market** has the closest ready-made prop match and the most
useful modular kit. The **ferry landing** is a strong art direction if there
is time to build its boat and roof. The **puppet yard** earns its higher cost
if posing the dragon will be a core lesson.

Local views, available in the research checkout:
[visual sourcing report](../../.local/mill-sourcing-boards/index.html)
· [Original concept boards](../../.local/mill-scene-concepts/index.html)
· [Image archive and prompts](../../.local/imagegen/index.html).

[Source catalog and license notes](sources.md)
· [Single-scene BOMs](single-scenes.md)
· [Journey and effect BOMs](journeys-and-effects.md)

| Candidate | Art effort | Sourceability | Make for the shot |
| --- | ---: | --- | --- |
| [Canal weather station](single-scenes.md#canal-weather-station) | **15–27 h** | Good materials and background props | Shell, channel, striped gauge |
| [Lantern ferry landing](single-scenes.md#lantern-ferry-landing) | **18–37 h** | Good materials; free hull as a stand-in | Curved roof, covered ferry and pole |
| [Glasshouse and koi pond](single-scenes.md#glasshouse-and-koi-pond) | **18–35 h** | Pots and plants ready; fish candidates available | Modular iron frame and readable pond |
| [Night market repair stall](single-scenes.md#night-market-repair-stall) | **17–32 h** | Strongest kit fit; close red tool chest | Custom stall front, neon shape and drain |
| [Water puppet maker’s yard](single-scenes.md#water-puppet-makers-yard) | **27–50 h** | Generic workshop stock; dragon stand-in only | Lacquered dragon, segmented body and tail |
| [Workroom → porch → canal](journeys-and-effects.md#workroom-porch-canal) | **+15–28 h** | Interior props and a character base | Three reads of one gauge, one keeper pose |
| [Museum of light and water](journeys-and-effects.md#museum-of-light-and-water) | **18–34 h** standalone | Most parts are primitives or repeated modules | One kit, three well-lit exhibits |
| [Ferry crossing before the storm](journeys-and-effects.md#ferry-crossing-before-the-storm) | **+19–38 h** | Reuses the landing's hero kit | Opposite pier, ferryman poses, storm shot |

The plus sign means **additional art work after the related single scene**.
The station journey therefore totals **30–55 h** and the ferry journey
**37–75 h** before renderer or gameplay work. The museum has no parent scene.

## What the estimates buy

These are planning ranges in **hands-on hours for one artist comfortable with
Blender**, not measured build times or quotes. They include selecting sources,
simplifying and recoloring, custom meshes, UV and map preparation, staging and
one look pass for a compact set of reviewable shots. Assume one material style,
a few intentionally composed views, and props that can stand still. For each
single scene, the baseline is five main shots plus a smoke close-up:

| Shot | Proof the art is doing its job |
| --- | --- |
| Material corner | A broad surface shows UVs and normal detail; a real bevel or joint reads in AO and outlines. |
| Waterline | The same marked object is visible above and below water; an opaque bed has a pattern to displace. |
| Grazing reflection | An object and its reflection read clearly; the camera can move the object offscreen to expose a miss. |
| Near to far | Three recognizable forms overlap at different depths, with a clean foreground edge. |
| Night source | One bright region stands apart from a dim surface and gives bloom a visible source. |
| Smoke source | One small vent or vessel against a legible background; frame the outlet and plume together. |

These are targets for the [19 exercises in the research baseline](../../mill-shader-lab/src/lessons.ts).
The BOM also reserves a simple emitter mesh and shot for the sprite/volume
smoke comparison reviewed separately in the working tree.
The images establish composition, palette and material contrasts. They do
not specify meshes, UVs, rigging, or a repeatable camera. Aim to match what
reads in each frame: the silhouette, color relationships, waterline and light.
Exact image detail, a complete walkable world, additional styles and simulations
need separate estimates. None of the candidates requires a paid asset in its
baseline plan.

**Where the finish time goes:** match scale and bevels, choose one color palette,
flatten overly photographic albedo detail for storybook art, tune normal strength
and highlight response, and keep decoration out of the lesson shots. Reuse a
few surfaces and props across the whole composition. Model the features that
change the depth buffer: the step, roof edge, window recess, and submerged
marker. A normal map can carry scratches and grain.

## Separate renderer work

The [current loader](../../mill-shader-lab/src/assets.ts) consumes the lab's
own v1 JSON and binary format. A served `?scene=` manifest selects a file;
it does not import GLB, reframe cameras, or infer which parts make water,
shadows or glow. The [bookmarks](../../mill-shader-lab/src/bookmarks.json),
[focus targets](../../mill-shader-lab/src/main.ts),
[window glow](../../mill-shader-lab/src/shaders/lighting.glsl), and
[swatch, light bounds, prop clips and axle](../../mill-shader-lab/src/lab.ts)
and [chimney origin](../../mill-shader-lab/src/shaders/atmosphere.frag) are
tied to the mill. The loader also requires six mesh roles and resource slots
for props and effects even if a concept leaves them out. For a prototype,
map to the existing roles; for a lasting replacement, make decorative roles
optional and move scene anchors into scene data.
The [water pass](../../mill-shader-lab/src/shaders/water-geometry.frag)
needs a separate water surface, its own mask slots, and a flow map.
The opaque [shader](../../mill-shader-lab/src/shaders/opaque.frag) samples
a legacy specular map; its GGX lesson uses separate controls.
A downloaded PBR roughness texture is not a drop-in specular mask.

For planning, set aside **8–16 engineering hours once** for a narrow static
export/import path and scene anchors, then **3–6 hours per single scene**
for bookmarks, map and scale checks, and the shot checks. Those are
separate estimates, subject to the first integration. Keep the
[existing lab verification](../mill-shader-lab-verification.md) as the
behavior reference. Skinning, glass over water, moving wetness and cloud
shadows, cross-scene continuity, and boat controls are separate work.

## One afternoon to reduce uncertainty

Before building the set, spend **3–5 art hours within the station budget**
on **one waterline shot**: a short quay, two steps, a painted gauge and
a patterned bed. Use the selected sandstone and timber at final camera
distance. Build the roof or other scenery only after the marker and the
water read at a glance. If choosing between the station and market, reuse
that blockout as the market's tiled drain and compare the two surface palettes
from the same camera. This tests the art direction before the asset list grows.

Research checked **12 November 2026** against
`0c031e6c664a6034dde05a3c047a9aa6af938738`. Checked primary listings and
license pages where accessible, local links, and the eight BOM totals. Leads
that could not be fully checked are labeled. The local sourcing report samples
six source color maps and seven imported meshes outside the shader lab.
The concept boards, sourcing report and image archive are local and ignored
by Git. Recheck listings and included licenses when acquiring assets;
update this research when a scene is selected.
