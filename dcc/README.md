# DCC asset library

This is the canonical art home for the five scene kits. Read the
[governance](../project-docs/dcc-governance.md) for ownership and retention.

Use the [fresh-device restore procedure](../project-docs/dcc-governance.md#remote-object-recovery)
to hydrate the catalog and Lab. If you already have a local restore or the
reviewed delivery archives, run `python3.12 dcc/gallery.py`.

Open the [local catalog](../.local/dcc/gallery/index.html). It works offline
without Shader Lab. Browse a scene through objects, parts, materials and maps,
or search and filter the whole catalog. The mesh viewer is a neutral preview
with a UV checker. Inspect the Lab for actual refraction, shadows and lessons.

- `sources/` holds procedural masters and the source catalog. The first
  assemblies place geometry in authored scene space. Object and part IDs are
  stable and browsable. The [Glasshouse placements](sources/scenes/glasshouse.json)
  compose the two koi and terracotta planter from independent masters. Other
  objects still use scene-space recipes.
- `deliveries/` tracks reviewed release manifests and the catalog selection in
  `index.json`. Existing ZIPs in those directories are ignored local copies.
- `recovery-manifest.json` pins the R2 objects and the metadata needed to
  reconstruct the releases, working revisions, and standalone masters.
- `web/` is the catalog and viewer. The generated page and decoded payloads
  go under `.local/dcc/gallery/`.

Use the [rulebook](../project-docs/dcc-governance.md#remote-object-recovery)
to review and promote a candidate, sync it, or restore assets. After restoring
the art, run `python3.12 -m unittest discover -s dcc` for the local contracts.
The recovery tests use an in-memory service and send no project data.
