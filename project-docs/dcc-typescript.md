# DCC TypeScript migration

**Accepted scope:** Strict TypeScript for the browser modules and gallery
catalog generation. DCC owns its pinned Node toolchain. Python retains asset
recipes, immutable delivery verification and remote recovery. The gallery remains
an offline `file://` artifact with no runtime server or new browser dependency.

- **Why:** Share catalog, mesh, rig/clip and viewer contracts between their
  producer and consumers. Catch incompatible changes before opening the browser.
- **Boundary:** The Python gallery entry point resolves and verifies deliveries;
  the TypeScript generator projects those verified inputs into the catalog and
  emits browser assets. Each behavior has one implementation.
- **Preserve:** Appearance, navigation, motion, public IDs, delivery selection,
  corrupt-input failures, source links, and the last valid gallery when type
  checking or catalog projection fails.
- **Verify:** Strict checks, the existing gallery and motion journeys, production
  delivery/preflight contracts, generated catalog equivalence and matched frames.
  Verify installation with an empty cache in a disposable directory.
- **Delivery:** Tracked TypeScript and package metadata; ignored compiled output.
  No art edits, public uploads, Lab pin changes or repo-kit extraction.

## Result

The browser modules are tracked `.ts` sources. `tools/catalog.mts` and
`tools/input.mts` own typed projection and input validation; `gallery.py` retains
release selection, verification and the established CLI. `types.d.ts` is shared;
DOM-only contracts stay under `web/`. Classic emitted scripts preserve `file://`
loading without a bundler or a server. Runtime motion validation remains active.

`npm ci --prefix dcc` installs the pinned toolchain. `python3.12 dcc/gallery.py`
checks and compiles both sides before generating the gallery. Compilation and
projection errors leave the previous gallery intact. `npm --prefix dcc run check`
checks without writing output. Compiled code lives under `.local/dcc/compiled/`.

Migration validation passed: strict and indexed-access checks, 31 Python contracts, four
motion tests, offline gallery/playback journeys, empty-cache installation and
build, all 952 catalog records equal to the previous producer, and byte-identical
koi/puppet rest and motion renders. The local verification bundle is
`.local/reviews/gallery/2026-11-16-typescript/`.

Use the [gallery verification commands](dcc-gallery.md#verification) to recheck
the current build. The migration itself changed neither the art pipeline nor
delivery and recovery pins.
