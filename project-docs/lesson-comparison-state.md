# Lesson comparison state

## Scope and acceptance

`LabState` owns comparison transitions; callers request actions instead of
coordinating public field writes. The change preserves original mill and authored
scene behavior,
including shared A/B camera and clocks, partial effect references, frozen joint
offsets, Legacy coupling, and the distinction between holding and stopping a
camera sweep. Camera gestures, geometry, shaders, buffer inspection policy and
DCC delivery are outside this change.

The seam is `LabState`'s action and read interface. Lesson definitions remain in
`lessons.ts`; scene staging and ordered joint limits come from the loaded scene.
The UI adapter executes DOM updates, shader reset and buffer selection explicitly.
`MillLab` continues to own compilation, including last-working-shader recovery,
and rendering. No effect runner or adapter framework is introduced.

Invalid or unavailable interactive requests return a typed rejection without
changing state. Lesson definitions are code-owned inputs; scene configuration is
validated by the asset loader before state construction.
The module derives availability for disabled controls and checks action
preconditions itself. Invalid numerical inputs are rejected, not clamped.
Comparison snapshots cannot mutate the module; renderer reads do not require a
whole-state copy each frame. Camera orbit and target remain mutable for gestures.

## Verification and delivery

Baseline: `fcfff5c1c78838141ec848595af9bc2358d017cf`.

Use direct transition tests through the production interface for sequencing,
rejection and copy isolation. Retain browser/pixel checks for original-mill
lessons, all five authored kits, shader failure recovery, Legacy flow/wheel
coupling, sweep motion, pose refraction and cast shadows, keyboard and touch.
Run the existing TypeScript/build and offline browser gates. Rendering tests
remain necessary; transition tests do not establish pixel correctness.

Delivery is a reviewed local commit. Routine captures stay in memory; temporary
verification material is retired after the result is recorded here or in the
handoff.

Verified on 2026-11-15 against the working-tree implementation:

- `npm run test:state`: 14 transition tests passed.
- `npm run build`: TypeScript and production build passed.
- `node test/full.mjs`: all 20 original-mill lessons passed, including shader
  failure recovery with side/playback preserved, audio, GPU/asset failures,
  keyboard and 360-pixel touch checks.
- `node test/scene-lessons.mjs`: all 20 shared lessons passed on each of the five
  authored kits, plus both creature animation and frozen pose comparisons.
- `python3.12 test/dcc_adapter.py`: adapter check passed.

Chrome used disposable profiles and blocked off-origin app requests. These checks
cover state, interaction and rendering; they are not a full accessibility audit.
The existing large-chunk build warning remains. No dependencies were added.
