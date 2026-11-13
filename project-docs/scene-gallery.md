# Scene and part gallery

Open the [local gallery](../.local/mill-assets/scene-gallery/index.html). It shows
the assembled weather station, lantern ferry landing, glasshouse, night market,
and water puppet yard. Each kit supports 20 shared Lab lessons and eight Lab
camera settings. The gallery shows selected views, a matched Waterline A/B,
a material study, and rendered parts. The original mill remains the default
Lab scene when its local assets are installed.

The [DCC governance](dcc-governance.md) defines the separate `dcc/` namespace
and the delivery boundary. Browse assets in the [independent DCC catalog](../dcc/README.md)
or use the Lab gallery for shader comparisons.

The scene kits are compact, authored interpretations of the [single-scene parts
lists](research/single-scenes.md). They use authored geometry and maps for stone,
timber, metal, clay, lacquer and glazed tile. Planar UVs use a shared physical
scale; wood grain follows the length of the board; curved charts wrap at tile
boundaries. The material study shows the UV checker, albedo, and flat and sampled
normals from the actual Lab buffers. No vendor files are needed to build the kits.
When present locally, concept art appears as a gallery reference and does not
appear in the renderer.
The original mill’s art and captures remain for local use.

## Run locally

On a new device, [restore the DCC payloads](dcc-governance.md#remote-object-recovery)
first. Then, from the checkout root:

```sh
npm --prefix mill-shader-lab ci
python3.12 mill-shader-lab/tools/build_scene_gallery.py
npm --prefix mill-shader-lab run dev -- --port 4317 --strictPort
```

The gallery’s live links use this port. To open the weather station before
generating the gallery, use
`http://127.0.0.1:4317/?scene=/mill-assets/scene-gallery/weather-station/waterline.json`.
Choose a lesson to open its staged camera. In Waterline, lower **Relative index**
to **0.935**, and switch **A · Reference** and **B · Experiment**. The patterned
bed and submerged part shift while the dry part holds. **Reset exercise**
restores the lesson’s staged camera, sun and frame. In the glasshouse and
puppet yard, **Play** and **Step frame** move the creature joints. Use
**Scene & effects → Animate creatures** to hold the current pose independently
of the scene clock. The reset pose is the reference for gallery captures.

The glasshouse and puppet yard also have **Pose joints: refraction and shadows**.
Play or step, then click **Freeze frame**. This locks the clock and starts A and
B at the same pose. Select a joint and change its rotation in B. Switch A/B in
**Refracted color**, **Refraction hit UV**, and **Shadow visibility**. Only the
pose changes between sides; the camera, light and water settings are shared.
**Save B as A** sets a new reference. **Unfreeze frame** clears the edits and
lets you play or step again.

To regenerate the gallery captures and HTML, run the capture tool from
`mill-shader-lab/` using Chrome with a disposable profile:

```sh
npm run build
node tools/capture_scene_gallery.mjs
```

The concept boards, sourcing review, and first Waterline prototype are optional
local research files. They are not included in the restore. The gallery can be
generated without them. See [verification](mill-shader-lab-verification.md#run-the-checks)
for the lesson tests.

The [DCC library](../dcc/README.md) owns the art. The Lab’s
[adapter](../mill-shader-lab/tools/build_scene_gallery.py) verifies and unpacks
the [pinned deliveries](../mill-shader-lab/dcc-lock.json), adds lesson staging
and maps, and writes the existing v1 scene manifests under the ignored
`.local/mill-assets/scene-gallery/` directory. No working DCC source is read.
The Lab gallery renders parts from the prepared mesh ranges. A Water mask shows the
water plane in context. Optional night anchors specify a world position,
positive falloff, and linear RGB intensity. Creature rigs attach opaque parts
to named, parented hinge joints. Joint pivots use the authored rest pose and
both water and opaque passes see the same animated geometry.

The smoke lesson uses a flue or vessel as appropriate to the kit. Both smoke
modes share an emitter and clock. The gallery demonstrates rigid hinges for
two koi and the dragon; it does not cover skinning, pathfinding, physical water
interaction or cloth. The glasshouse uses open bays and opaque tinted panels.
The three research journeys remain separate.

| Scene | Good lesson starting points |
| --- | --- |
| Canal weather station | Compare copper specular with sandstone and timber; use the painted gauge to see the refraction boundary. |
| Lantern ferry landing | Trace the curved roof UVs and watch the lantern and ferry reflection disappear when the source leaves the frame. |
| Glasshouse and koi pond | Compare painted iron with glazed tiles. Step the submerged koi, then freeze their pose before changing the index. |
| Night market repair stall | Compare bright extraction from the sign and work light. Use the ribbed shutter to distinguish material detail from geometry. |
| Water puppet maker’s yard | Follow the lacquered tail across the waterline and switch near/far focus. Compare sprite and volume smoke over the vessel. |
