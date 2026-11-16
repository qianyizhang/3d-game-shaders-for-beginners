# DCC gallery — low-fidelity implementation

**Status:** Accepted workflow, provisional visual design. The user approved
reuse-first browsing, a focused inspector, unchanged artwork, and retaining the
green/cream identity for now. A more developed visual design is a later pass.

## Bounded work

- **Problem:** Scenes, objects, parts, materials and maps share one text list.
  Relationships fall below the preview; materials lose their visual context.
  The [local review](../.local/reviews/gallery/2026-11-13-shared-design/review.html)
  records the baseline and alternatives.
- **Change:** Visual scene browsing, all-kind search, a focused neutral preview,
  labelled maps, consumers and source/delivery records. Keep rights visible.
- **Accept:** Offline `file://` use; shareable selections; restored filters, scroll
  and focus on return; camera and UV controls; empty and failed-preview recovery;
  narrow reflow. Preserve artwork, IDs and reviewed delivery pins.
- **Delivery:** Local source and rebuilt catalog, then browser verification. No
  remote publication, art promotion or package extraction in this slice.

## Owners

`dcc/gallery.py` resolves and verifies selected deliveries. `tools/catalog.mts`
projects them using the same types as the browser. `web/catalog-model.ts`
owns queries and relationships; `web/gallery.ts` owns navigation and DOM;
`web/viewer.ts` owns neutral WebGL previews and uploaded mesh buffers;
`web/motion.ts` evaluates delivered rigid clips and joint limits;
`web/playback.ts` owns the clock, scrubber and single-joint inspection;
`web/thumbnails.ts` queues visible cards for one shared renderer. Thumbnails
are ephemeral browser images. There is no background disk cache.

Source records are disclosed on demand. Material and texture rights are traced
through recorded consumers. The preview shows base color and authored rigid
motion for rigged objects. Inspect Shader Lab for its shading and lesson effects.
Working source and reviewed delivery remain distinct.

Only extract a shared module into repo-kit when a second real consumer (proposed:
game's 2D cabinet) adopts the same behavior. Taxonomy, artwork, renderer meaning,
rights and review gates remain project-owned.

## Verification

```sh
npm ci --prefix dcc
npm --prefix dcc test
python3.12 -m unittest discover -s dcc
python3.12 dcc/gallery.py
npm --prefix dcc run test:browser
```

Browser checks use DCC's own pinned `playwright-core` development
dependency and disposable Chrome, without the Lab server. Set `DCC_GALLERY_DIR`
to check a different generated output. On this Mac, launch Chrome outside the
restricted sandbox as required by the browser-testing guide.

Exercise selection, return context, preview controls, no matches, invalid routes,
stale-load protection and missing geometry/graphics recovery. Keep visual review
separate from technical assertions. Re-run affected checks when catalog,
renderer or navigation inputs change. The initial browsing slice preserved
artwork and Lab lessons. The later [art polish](asset-polish.md) and
[motion variations](asset-motion.md) have their own reviewed deliveries; Lab pins
remain separate.
