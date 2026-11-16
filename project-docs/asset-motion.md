# Rig motion variations — 16 November 2026

**Scope:** Three motion variations for both koi and the Water dragon, with
paused playback, scrubbing and single-joint inspection in the asset gallery.
Keep the stylized artwork and the low-fidelity gallery direction.

- **Problem:** Rigged assets are static in the catalog. The puppet's head owns
  the full joint chain, and its differing oscillator rates drift out of rhythm.
- **Change:** Give the puppet a torso root with independent chest/head and tail
  branches. Author calm, lively and sequential joint-sweep clips for each rig.
  Use shared cycle timing with delayed downstream movement; preserve geometry,
  joint IDs and existing Lab pins. Expose motion only when inspecting a rigged
  object. Cards and scenes stay static.
- **Acceptance:** Visible, distinct motion loops; inspect loop seams and joint
  contact at representative frames; head motion leaves the puppet tail fixed.
  Check hierarchy math, limits, malformed data, loop continuity, remapped
  instances, pause/scrub/reset, navigation and background stop, reduced-motion
  default, graphics failure and offline/narrow-layout behavior.
- **Delivery:** Source → candidate deliveries → gallery and visual review →
  catalog selection → verified recovery. Clips are delivery metadata, not new
  binary artwork. Keep the previous art-polish approval scoped to its nine
  reviewed files; inspect any new backup plan before sending bytes.

## Ownership

`dcc/sources/motions.py` owns authored clips in degrees and seconds. Each rig
carries its clips with its joints; placement remaps clip joint IDs. The DCC
preview evaluator owns rigid world-pivot transforms and validates its inputs.
The gallery owns its explicit playback clock, with GPU geometry uploaded once
per selection. Shader lessons and their default animation remain Lab-owned.

The [local review bundle](../.local/reviews/assets/2026-11-16-motion/index.html)
holds motion comparisons and the final verification summary. This is rigid
articulation, not a skinned fish, physically simulated swimming, or a new Lab
parity claim.

## Result

- **Implemented:** Nine clips across the two koi and the Water dragon. The
  puppet uses a torso root; its chest pivots at the torso join. Gallery motion
  starts paused, reuses GPU buffers, supports scrubbing and isolated joint tests,
  and stops on navigation, background/offscreen state or graphics loss.
- **Selected:** `glasshouse-f130110d7d563326` and
  `puppet-yard-fcb13f71f2b55152`. Geometry/map bytes and Lab pins are unchanged.
- **Verified:** Authored motion math/limits/loop tests, instance remapping,
  offline gallery and nine-clip browser journeys, clean recovery, video playback
  and sampled visual review. See the bundle record for exact checks and limits.
- **Recovery:** The previously approved nine-file upload is complete. The new
  motion metadata reconstructs eight deliveries from the same 29 verified
  objects, with zero additional uploads. Independent local ZIPs remain.
- **Documentation:** The old gallery help and design note said rig playback
  belonged only in the Lab. They now distinguish neutral DCC motion previews
  from Lab shader effects and lesson animation.
