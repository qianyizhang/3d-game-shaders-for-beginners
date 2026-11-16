# Authored kit polish — 15 November 2026

**Scope:** Review the five kits, then refine the existing low-poly artwork.
The gallery interface remains deliberately low-fidelity; this pass changes art.
The [local review bundle](../.local/reviews/assets/2026-11-15-polish/index.html)
holds the visual comparison, baseline and verification summary.

- **Problem:** The koi have flat sideways tail fans and abrupt head/fins; the
  planters read as stacked cylinders; distant ferry ridges read as boulder clumps.
- **Change:** Refine koi silhouette, fin volume and paint grouping; give pots
  a shaped rim and recessed soil; replace the ferry background's repeated
  ellipsoids with continuous faceted ridges. Keep IDs, placement, rig pivots,
  scene scale, map roles and the refraction subjects intact.
- **Acceptance:** Matched neutral views at fixed framing; inspect details and
  scene-scale readings; check revised geometry and posed joint continuity;
  verify immutable candidate payloads and recovery. Review the other three kits
  and retain them where changes are not justified by this pass.
- **Delivery:** Local source → candidate builds → visual/technical review → DCC
  catalog selection. Lab delivery pins remain separate and unchanged. No new
  asset families or external artwork enter this pass.

## Decisions

Preserve the stylized diorama look. Favor clearer primary forms and joins before
adding small detail. The gallery reads reviewed deliveries, while source recipes
are editable masters; compare current source builds as well as the selected
delivery when they differ. A changed neutral render is not a new Lab parity claim.

## Verification plan

Use the current source as the before baseline and immutable candidate files as
the after input. Hold preview camera and bounding frame constant across each
pair. Check finite geometry, outward faces for closed authored surfaces, unchanged
part/joint IDs and pivots, and the affected posed views. Run DCC contracts and the
offline gallery journey against the updated selection. Exercise the candidate in
the Lab with temporary prepared manifests, without changing its delivery lock.
Keep restore verification separate from visual acceptance.

## Delivery status

- **Implemented and reviewed:** Two koi, shared planter forms and ferry ridges.
  The five-kit review retained the station, market and puppet yard. The DCC
  catalog selected `glasshouse-bfadcfd99c3401c7` and
  `ferry-landing-8f7294ac53208ed7` for this review. The later
  [motion delivery](asset-motion.md) carries the same Glasshouse meshes and maps.
- **Verified locally:** Ten DCC tests, candidate payload integrity, unchanged
  object/rig bindings, matched neutral and Lab captures, every revised koi
  hinge at both limits, animation/refraction/shadow response, and the offline
  gallery journey including unavailable and recovery paths.
- **Verified recovery — 16 November:** The user approved the nine-file public
  upload. All nine files passed download/hash verification; a fresh restore
  reconstructed seven deliveries from 29 remote objects. Its gallery passed
  the full consumer journey before the recovery manifest was recorded. A
  repeat prepare requires zero uploads. Local ZIP fallback copies remain.
- **Lab:** Delivery pins are unchanged.
