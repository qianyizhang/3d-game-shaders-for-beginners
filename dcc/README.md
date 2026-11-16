# DCC asset library

This is the canonical art home for the five scene kits. Read the
[governance](../project-docs/dcc-governance.md) for ownership and retention.

The [art polish](../project-docs/asset-polish.md#delivery-status) has verified
remote recovery. See [motion variations](../project-docs/asset-motion.md) for
the current follow-up scope.

Use the [fresh-device restore procedure](../project-docs/dcc-governance.md#remote-object-recovery)
to hydrate the catalog and Lab. If you already have a local restore or the
reviewed delivery archives, install the independent DCC toolchain once with
`npm ci --prefix dcc`, then run `python3.12 dcc/gallery.py`. Node and TypeScript
are build-time tools; the generated gallery still opens offline without them.

Open the [local catalog](../.local/dcc/gallery/index.html). It works offline
without Shader Lab. Browse a scene through objects, parts, materials and maps,
or search and filter the whole catalog. Start with scene thumbnails, then inspect
objects, parts and labelled map swatches. Return to Results to recover the search,
filters, scroll and focused card. Selection links include the active filters.
The mesh viewer has orbit, zoom, reset and a UV checker. Rigged objects also
offer authored motion variations, explicit play/pause, scrubbing and single-joint
inspection. Previews start still; leaving the object or hiding the page stops
playback. Inspect the Lab for actual refraction, shadows and lessons.

**Low-fidelity implementation:** the workflow is accepted; the visual design is
provisional. See [scope, owners and verification](../project-docs/dcc-gallery.md).
One shared renderer makes thumbnails for visible cards in the browser. No Lab
captures, server or persistent thumbnail cache are required. Source and delivery
details remain available; the reviewed delivery does not follow working edits.

- `sources/` holds procedural masters and the source catalog. The first
  assemblies place geometry in authored scene space. Object and part IDs are
  stable and browsable. The [Glasshouse placements](sources/scenes/glasshouse.json)
  compose the two koi and terracotta planter from independent masters. Other
  objects still use scene-space recipes.
- `deliveries/` tracks reviewed release manifests and the catalog selection in
  `index.json`. Existing ZIPs in those directories are ignored local copies.
- `recovery-manifest.json` pins the R2 objects and the metadata needed to
  reconstruct the releases, working revisions, and standalone masters.
- `web/*.ts` holds the maintained browser source; `types.d.ts` shares catalog,
  mesh, rig/clip and viewer contracts with `tools/*.mts`, the typed catalog producer.
  `gallery.py` owns verified-delivery input, then invokes that producer.
- Compiled scripts go under ignored `.local/dcc/compiled/`. The generated page
  and decoded payloads go under `.local/dcc/gallery/`; neither belongs in Git.

Use the [rulebook](../project-docs/dcc-governance.md#remote-object-recovery)
to review and promote a candidate, sync it, or restore assets. After restoring
the art, run `python3.12 -m unittest discover -s dcc` for the local contracts.
The recovery tests use an in-memory service and send no project data.

## Gallery development

Use the [gallery verification commands](../project-docs/dcc-gallery.md#verification)
for type, motion and offline browser checks. The generator compiles the current
sources before writing the gallery. Type or projection errors preserve the
previous gallery. See the [TypeScript migration](../project-docs/dcc-typescript.md)
for the build boundary.
