# Buffer inspection

## Scope and accepted design

Baseline: `537523a86d6362db81a77831c20b28aeb1525aea`.

`BufferInspection` owns view routing previously repeated across UI grouping,
shader selection, texture selection and conditional pass execution. It resolves
one view from current accepted settings. The seam returns the explanation, shader, image binding and additional
inspection requirements together. Static definitions retain existing view names,
order, groups and lesson view lists.

MillLab and Post supply concrete typed resource bindings. They keep pass order,
uniforms, shader compilation and last-working-shader recovery. GPU keeps target
allocation, resizing and drawing. Inspection borrows resources; it does not
allocate, draw, dispose or retain a resolved view across state changes. Texture
references are live resources, not image snapshots. No render graph, registration
system, generic adapter or cache is introduced.

The UI adapter requests selection and refreshes explanations and visible source
together after selection, A/B, effect changes, successful shader edits and reset.
Each render resolves once for its requirements and displayed image. Reading
inspection information performs no GPU work. The accepted LabState contract is
unchanged.

Dynamic explanations follow the selected rendering path. In particular, legacy
Bloom blur is an inspection-only preview: legacy bloom add consumes extraction
directly. HDR bloom add consumes the blurred bright pass. This corrects the old
HDR-only description without changing rendering. Focus blur previews also name
the actual consumer selected by dilation. Disabled shadow, AO, deferred, focus,
motion and filter outputs identify inspection-only consumption where applicable.

## Acceptance and delivery

Keep original-mill and authored-scene behavior, disabled-effect inspection,
forward/deferred routing, A/B edits, attachment slots, display encoding, offline
operation and GPU fallback. Inspection requirements request the existing work;
they do not enable an effect or change the ordered pass sequence.

Test through the production inspection interface, then check selection, displayed
shader and actual pixels through the existing browser UI. Cover HDR/SDR bloom,
forward/deferred, disabled effects, shader-edit failure recovery, attachment
channels and output encoding. Pure routing checks cannot prove GPU correctness.

Required checks: inspection and comparison-state tests, TypeScript/build, the
20 original-mill lessons, all 20 shared lessons on five authored kits and both
frozen-pose comparisons, plus the existing DCC adapter gate. Dependencies and
native shaders do not change; reuse their existing setup. Routine captures stay
in memory. Record final results here, without a separate verification bundle.

Delivery is a reviewed local change. Publication and remote operations are
outside this scope.

## Verification

Verified on 2026-11-15 against the working-tree implementation above baseline:

- `npm run test:inspection`: all 7 production-interface tests passed, covering
  all 42 views and missing-attachment failure/recovery.
- `npm run test:state`: all 14 comparison-state tests passed.
- `npm run build`: TypeScript and production build passed.
- `node test/full.mjs`: all 20 original-mill lessons passed, including the new
  inspection source/image checks, live explanations, disabled-effect work,
  A/B shader-edit recovery, HDR/SDR bloom, GPU/asset fallback, audio, keyboard
  and 360-pixel touch checks.
- `node test/scene-lessons.mjs`: all 20 shared lessons passed on each of the
  five authored kits, plus both creature-animation and frozen-pose comparisons.
- `python3.12 test/dcc_adapter.py`: adapter check passed.
- Desktop and 360-pixel inspector captures were inspected. The longer legacy
  bloom explanation wraps within the panel; the narrow page has no horizontal
  overflow. Temporary captures were retired after inspection.

Chrome used disposable profiles and blocked off-origin app requests. The full
suite now waits for the shader drawer's queued toggle refresh before checking
its source, rather than treating nonempty old text as refreshed content.
This is not a full accessibility audit. The existing large-chunk build warning
remains. No dependencies or shaders changed. Concurrent DCC gallery edits were
excluded from this change and review.
