# Journey and effect bills of materials

[Compare all candidates](README.md) · [Sources and licenses](sources.md)

Journey hours cover art and shot setup. They do not include camera
transitions, scene streaming, playable controls, or a new effect. Where a
journey extends a single scene, its parent BOM owns the reused assets.

## Workroom, porch, canal

[Storyboard](../../.local/mill-scene-concepts/index.html#workroom-journey)
· **+15–28 h** over the [weather station](single-scenes.md#canal-weather-station).

| Additional BOM | Route and likely refinement | Art h |
| --- | --- | ---: |
| 1 workroom corner, 1 bench, 1 task lamp | **Use / adapt.** [Wooden Table 02](https://polyhaven.com/a/wooden_table_02), [Desk Lamp Arm 01](https://polyhaven.com/a/desk_lamp_arm_01) and the station's wall material. Frame a corner rather than a whole room. | 3–5 |
| 1 sheltered porch | **Adapt.** Extend the station shell with roof lip, posts and rail. Reuse the canal-facing window and palette. | 1–3 |
| 1 hero gauge with dry and wet looks | **Adapt.** Improve the shared striped plate and brass cap for a close shot. Add a wet mask or a few still beads; use the same scale and materials outside. | 2–4 |
| 1 keeper in a raincoat, 2 held poses | **Adapt.** [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters) as a body candidate; author a simple coat and gauge grip. Bake the still poses for baseline export. | 5–9 |
| 3 linked shot setups | **Assemble.** Warm lamp, cool porch, visible waterline. Use the same gauge in all three; dress only what's in frame. | 4–7 |

**Keep the storyboard’s best idea:** the striped gauge is the constant.
Test the route as three bookmarks in one scene. Live precipitation,
wetting and indoor/outdoor exposure can come after the three images work.

## Museum of light and water

[Storyboard](../../.local/mill-scene-concepts/index.html#museum-journey)
· **18–34 h standalone** · Best for controlled comparisons.

| BOM | Route and likely refinement | Art h |
| --- | --- | ---: |
| 1 material gallery bay and shared architecture kit | **Make / adapt.** Repeat a stone wall, arch, plinth and skylight frame; use [sandstone maps](https://polyhaven.com/a/white_sandstone_bricks) at architectural scale. | 5–8 |
| 1 water court, 1 platform, 1 patterned shallow pool | **Make.** Reuse the architecture and materials. Add a patterned opaque floor and a marked post crossing the water so refraction remains teachable. | 4–8 |
| 1 projection room | **Adapt.** Reuse the bay as a dark box with a black stone wall, an aperture, one bright lamp and a small smoke vessel. | 3–6 |
| 1 copper sphere, 1 painted cube, 1 amber lamp | **Make.** Simple geometry with controlled roughness, normal detail and a separately controlled bright source. Use [Poly Haven Studio](https://polyhaven.com/a/poly_haven_studio) for a Blender look test if useful. | 2–4 |
| 3 rooms staged for the test shots | **Assemble.** Keep identical dimensions and materials on the test kit. Repeat shots and hold local framing when comparing the different rooms. | 4–8 |

**The asset-saving move:** build three visible exhibit bays from one set
and place the same kit in each. A walkable museum, carried objects and
dynamic room lighting are optional interaction work. Mirror-like environment
reflections on the copper in the drawing are a separate renderer feature;
the lab's existing copper swatch can still teach direct GGX response.

## Ferry crossing before the storm

[Storyboard](../../.local/mill-scene-concepts/index.html#storm-crossing)
· **+19–38 h** over the [ferry landing](single-scenes.md#lantern-ferry-landing).

| Additional BOM | Route and likely refinement | Art h |
| --- | --- | ---: |
| 1 opposite pier, 1 mooring point, distant silhouettes | **Adapt / make.** Reuse the landing's stone and timber modules. Change outline and light so the arrival shore feels distinct. | 4–7 |
| 1 boat revision, 1 lantern mount, 1 stern cloth | **Adapt.** Reuse the hero ferry and lamp; check boat silhouette in low camera and add a distinct red cloth. | 2–5 |
| 1 ferryman, 2 rowing/docking poses | **Adapt.** [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters) as a donor. Make hat and cloak, pose the pole and lamp grips. This includes the character for the landing if it wasn't made already. | 5–10 |
| Rain, splash and spray artwork; 1 foggy sky look | **Adapt / make.** [Particle Pack](https://kenney.nl/assets/particle-pack) as a sprite donor, simple authored rain and foam marks, [overcast reference](https://polyhaven.com/a/kloofendal_overcast_puresky). Reuse the opaque shore as the depth target. | 4–7 |
| 3 shot setups and palette pass | **Assemble.** Calm reflection, wet crossing, lantern close-up at dock. Keep the same boat and lamp identifiable throughout. | 4–9 |

**Build the sequence as three fixed shots first.** A playable crossing adds
boat motion, shoreline bounds, moving water, lantern control, and resets so
an exercise can reproduce the same encounter. The art estimate includes
composed weather imagery, with no assumption that those systems exist.

## Optional experiment assets

Incremental art estimates for one bounded demonstration. Reuse assets already
in a scene's BOM; do not add both estimates for the same work.

| Study | Smallest useful asset kit | Additional art h | Renderer or interaction work |
| --- | --- | ---: | --- |
| [Three styles](../../.local/mill-scene-concepts/index.html#style-swap) | Keep one layout and camera. Prepare a realistic surface set, a simplified painted set, and a three-tone wash ramp; [The Met painting](https://www.metmuseum.org/art/collection/search/51662) guides spacing and value. | 8–16 | Reuse cel/outlines first; implement depth washes and style controls only if needed. |
| [Seasons](../../.local/mill-scene-concepts/index.html#season-swap) | Keep dock and gauge. Add a runoff sheet, sparse leaf shapes, snow caps and an ice edge. Use [Snow 001](https://ambientcg.com/view?id=Snow001) for detail. | 6–12 | Use fixed presets first. Flowing runoff, drifting leaves or ice behavior are new work. |
| [Living rig](../../.local/mill-scene-concepts/index.html#rig-and-wind) | One poseable dragon tail or one human forearm. Build a short joint chain and a clean deforming mesh; retain the base's rigid version for the same pose. | 8–16 | Skinning or deformation in color, shadow and depth passes; pose input and reset. Object motion vectors later. |
| [Vane and cloth](../../.local/mill-scene-concepts/index.html#rig-and-wind) | Use one rigid vane and one striped, subdivided windsock with a fixed rim. [Rough Linen](https://polyhaven.com/a/rough_linen) is a texture donor. | 2–5 | Start with repeatable vertex bend and a gust control. Cloth physics can wait. |
| [Cloud, rain and runoff](../../.local/mill-scene-concepts/index.html#weather-effects) | Rain sprites, puddle or ripples map, dry/wet versions of one wall, a runoff strip and a soft cloud mask. Use a [particle kit](https://kenney.nl/assets/particle-pack) or draw simple masks. | 4–9 | Compare cloud lighting, wetness, drops and contact ripples separately. Textures do not simulate water. |
| [Fire and smoke](../../.local/mill-scene-concepts/index.html#weather-effects) | A simple brazier, bright flame card or flipbook, and [smoke sprites](https://kenney.nl/assets/smoke-particles) against a patterned wall. | 3–7 | Reuse the sprite overlay and, when available, the volume mode with a scene emitter. Fire and volumetric lighting remain separate. |
