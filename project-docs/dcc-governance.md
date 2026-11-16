# DCC asset governance

**Decision:** Keep the DCC library in this repository under `dcc/`. It owns
the artwork and can build its catalog without Shader Lab. The Lab imports a
pinned delivery. A separate repository is outside this rollout.

## Ownership

| Home | Owns |
| --- | --- |
| `dcc/` | Editable models and recipes, scene assemblies, objects and parts, UVs, materials, textures, rigs, provenance, licenses, catalog tooling and reviewed deliveries. |
| `mill-shader-lab/` | Shader bindings, lesson text, exercise cameras and settings, a delivery lock, the offline adapter and runtime checks. |
| Local review output | Generated gallery, thumbnails and captures. Keep the set needed for active review and rebuild routine previews from source. |

Each asset has one editable master. The existing procedural recipes are the
masters for the first kits. A Blender handoff names the new master and
retains the previous one in history. A GLB can serve as a portable delivery
or preview; keep the source and any map or rig data the format cannot carry.

## Catalog and navigation

Browse **Scene → Object → Part → Material → Texture**. A scene can place an
instance of an object with its own transform. The Glasshouse placement format
supports position, scale, and yaw. A part is a named piece of an object, such
as the Vermilion koi’s tail stem. Objects, materials and textures are reusable
by ID. A rename or file move preserves the ID. A remix that needs independent
edits gets its own ID and records its source; unchanged reuse just adds a reference.

The catalog records names, descriptions, tags, dependencies and provenance.
Use fields for kind, rights, rigged status and map roles, and tags for
discovery, such as `waterline`, `lacquer` and `storybook`. Generate search
and reverse “used by” links from those records. The gallery supports
filtering, links to the editable source, isolated object and part previews,
and a UV checker. Each material binding identifies the texture, role, color
space, UV set and channel where applicable. Open each texture independently
and show every use. The first gallery is read only; future browser edits
produce an explicit variant or patch for review.

## Git metadata and deliveries

- **Ordinary Git:** Catalog records, procedural masters, provenance and
  license records, export tools, delivery manifests, the recovery manifest
  and the Lab lock.
- **Binary storage:** Use the object recovery workflow below for approved
  DCC artwork. Keep a separate recovery copy; the existing delivery ZIPs
  are local fallback copies and are excluded from Git. Keep private masters
  in authenticated storage. Routine captures and reproducible intermediates
  remain local.
- **Rights:** Record creator, origin, license or permission, and restrictions
  before admitting an asset. Keep original mill art and its conversions local
  under the [upstream license scope](../README.md#license). The
  [ImageGen archive](imagegen-governance.md) retains its originals; DCC
  links to those records as references.

A reviewed delivery has an immutable ID, source hashes, format version and
manifest of payload paths and hashes. Keep deliveries recoverable while a
consumer pins them. The Lab lock records the delivery ID and manifest digest.
Its adapter verifies the payloads and the IDs, joint names and map roles
needed by lessons, then prepares the existing Lab format. The Lab runs
offline from that bundle. Updating a master does not update the pin. A missing
payload or incompatible delivery fails preparation with a clear error.

The [delivery selection contract](delivery-selection.md) owns location precedence,
overrides and failure behavior. Each consumer chooses its required revisions;
the shared delivery module locates and verifies their bytes.

**Current state:** The five authored kits now live under [dcc/](../dcc/README.md).
The independent gallery reads the reviewed delivery index. The Lab's separate
delivery lock lives at `mill-shader-lab/dcc-lock.json`.
Glasshouse instantiates both koi and the terracotta planter from standalone
masters. Other objects still use scene-space recipes.

## Remote object recovery

Use repo-kit's `r2-object-backup` skill for the shared workflow. If it is not
installed, read `skills/r2-object-backup/SKILL.md` in repo-kit at `5d73f79` or a
later revision containing the skill. The commands below use `dcc/recovery.py`
directly and do not require a repo-kit installation.

The [Object Library](https://r2-object-library.landy123007.chatgpt.site/api-guide.md)
is the primary remote target for the approved authored DCC kits. Its files are
public. The namespace is `3d-game-shaders-for-beginners/dcc`. Exclude original
mill assets, research originals, local captures, credentials and private
sources. Public backup is authorized for the five authored scene kits and
three standalone masters in the initial manifest. The `local-use` label in
existing release metadata predates this backup approval; preserve the exact
reviewed manifests. The public backup does not grant a separate asset license.
Review future changes for rights before uploading.

**Promote a reviewed candidate.** Run `python3.12 dcc/build.py glasshouse`
and inspect the candidate in `.local/dcc/candidates/`. For a reviewed candidate,
keep its manifest and local payload together under `dcc/deliveries/<id>/` and
update `dcc/deliveries/index.json`. Only the manifest and index go into Git.
The next sync must verify that this release can be restored from R2. A Lab
pin change is separate; the pin records the exact release manifest digest.
Older required deliveries can remain in `.local/dcc/restored` while the new
candidate lives in `dcc/deliveries`; automatic lookup resolves each independently.
With `--deliveries`, the supplied directory must contain every required revision.

**Sync after an authorized art change.** From the repository root:

1. Run `python3.12 dcc/recovery.py prepare`. The plan covers current artwork,
   selected catalog versions, Lab pins and standalone masters. It stores
   geometry per object by stable ID and hash. Shared texture maps are
   deduplicated by hash and stored in independent packs. Scene layouts, rig
   bindings, material roles and hashes belong in the Git recovery manifest.
2. Review `.local/dcc/remote-backup/plan.json`. Run
   `python3.12 dcc/recovery.py upload --public-approved` only for cleared
   bytes. Follow the shared skill's batch and failure rules. The default
   sends at most nine new files. Resume the same plan and journal;
   `python3.12 dcc/recovery.py status` reports verified and pending counts.
   Supply `OBJECT_LIBRARY_UPLOAD_PASSWORD` through the environment, the
   private prompt, or ignored, owner-only `.env.local`.
3. When no files remain, run
   `python3.12 dcc/recovery.py record --output .local/dcc/restore-review`.
   This downloads into a clean directory and verifies every delivery member
   before replacing `dcc/recovery-manifest.json`. Keep that manifest and the
   authored sources and metadata together in Git. Leave the Lab pin unchanged
   unless the user requests a delivery upgrade. Use a new output directory
   each time. To use the new copy immediately, pass it as `--deliveries` to
   `dcc/gallery.py` or the Lab adapter. Normal gallery builds use the repository's
   selected index; an explicit gallery source uses that directory's index. Lab
   builds always use their own lock. A restored index does not decide whether an
   exact revision is usable; the loader verifies the required revision's bytes
   and any pinned manifest digest.

**Restore on a new device.** Use the checkout that contains the verified
manifest. Restore needs no LFS payloads or upload credential. Run from the
repository root:

```sh
python3.12 dcc/recovery.py restore --output .local/dcc/restored
python3.12 dcc/gallery.py --deliveries .local/dcc/restored
```

Restore reconstructs the reviewed catalog selection, current working artwork
and any separately pinned versions as directories, checking the original
member hashes. The gallery keeps its reviewed selection. The manifest's
`working` entries point to the latest working revisions. Standalone masters
are under `_masters/`; editable procedural sources are in Git.

Existing local ZIPs remain a fallback for the reviewed and pinned versions.
