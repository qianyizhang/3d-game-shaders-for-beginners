# Delivery selection and verification

**Status:** Implemented and verified locally.

- **Problem:** Choosing one delivery directory from both the gallery catalog and
  Lab lock lets an unrelated consumer change another consumer's inputs.
- **Change:** Consumer-owned revision requirements → per-release location and
  verification → consumer compatibility checks → output writes.
- **Accept:** Independent catalog and Lab pins, mixed source directories, strict
  explicit overrides, visible corruption, input preflight and preserved recovery
  retention. No artwork, pin, publication or renderer changes.

## Owners and interface

`dcc/delivery.py` owns `ReleaseRef`, `VerifiedRelease`, `load_release` and the
exact-folder `read_release` verifier used by builds and restores. A reference
names an exact delivery ID and optional expected manifest digest. A verified
release contains its source folder, manifest and complete payload bytes. These
are caller-owned in-memory records, not deeply immutable objects or a cache.

`load_release(required, roots=...)` reads files but writes nothing. It knows no
catalog or Lab lock schema. `delivery_roots(repo, override)` only constructs the
ordered paths; it does not inspect files. Both loading interfaces share one
verifier for identity, paths, ZIP structure and hashes.

- **Gallery:** Parses its catalog and chooses the requested scenes. Normal builds
  use `dcc/deliveries/index.json`; an explicit `--deliveries PATH` uses
  `PATH/index.json`. A restored index cannot change normal build requirements.
- **Lab adapter:** Parses its own lock, loads only requested pins, and checks scene
  identity, axes, roles, parts, joints and texture bindings before writing assets.
- **Recovery:** Parses repository selections and Lab pins, retains their union
  with every pin digest enforced, then adds working artwork and standalone masters.
  Its source override does not change the repository's retention requirements.
  Both metadata files are required; a missing lock cannot silently drop retained
  pins from a recovery plan. Pin-first processing preserves texture-pack ordering.

## Location and failure policy

Automatic lookup tries `.local/dcc/restored`, then `dcc/deliveries`, separately
for each exact revision. A complete delivery comes from one location; members
are never combined across copies. `--deliveries PATH` supplies the sole root and
is parsed before any default-source inspection.

`DeliveryUnavailable` permits the next root: the revision directory is absent,
or a valid manifest has no hydrated payload (missing ZIP/files or an LFS pointer).
`DeliveryInvalid` stops lookup: a present directory has a missing/invalid manifest,
a wrong pinned digest, corrupt ZIP/member, incomplete restored files or unreadable
data. A valid second copy does not conceal an invalid first copy. Errors retain
attempted locations, reasons and the underlying cause. Successful commands report
the source folder of each required revision.

All required delivery inputs are verified before output writes. The Lab also
preflights all requested lesson bindings. Gallery projection is assembled in
memory before writing. Later generation or write failures may leave partial
output; this is not transactional replacement of output directories. Recovery's
existing clean-restore publication and snapshot checks remain in force.

## Verification

Run from the repository root with local delivery payloads available:

```sh
npm ci --prefix dcc
python3.12 -m unittest discover -s dcc
python3.12 mill-shader-lab/test/dcc_adapter.py
```

These checks cross the production loader and consumer entry points. They cover
absence, unhydrated copies, corruption, wrong pins, incomplete files, overrides,
stale catalogs, split source roots and preflight preserving output. The recovery
round trip uses an in-memory remote and deliberately selects a revision distinct
from its Lab pin, regardless of the checkout's catalog. It retains both revisions,
working artwork and standalone masters.

For prepared asset changes, also run the [Lab scene lesson gate](mill-shader-lab-verification.md#run-the-checks).
Use matched generated-output comparisons to distinguish selection changes from
rendering changes. Browser and output checks from a shared working tree do not
replace checking an isolated commit candidate when unrelated edits are excluded.
