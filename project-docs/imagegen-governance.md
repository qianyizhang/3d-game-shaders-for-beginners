# Generated image archive

Use this procedure for every ImageGen output made for this repository:
new images, edits, alternatives and rejected attempts. Keep an original
even if it never appears in a report.

1. **Save.** Put the unmodified output in
   `.local/imagegen/originals/<stable-id>.<format>` as soon as it returns.
   Keep the native format and embedded credentials. Give edits new IDs;
   link them to their inputs. When an identical original is already present,
   reuse it and record the additional source or use. Keep existing report
   links working; use an alias where needed.
2. **Record.** Add the original to [the local catalog](../.local/imagegen/catalog.json)
   using an existing record or the example below. Record title, group, tags, exact
   submitted prompt, tool, model and revision if evidenced, UTC creation time,
   source output and chat, input references, dimensions, and SHA-256. Use
   `null` for an unavailable prompt, date, model or revision and state why in
   the corresponding source note. Copy the tool's actual model label or the
   image's embedded label with its provenance; do not infer a version from
   visual style or release timing. Never backfill a missing prompt by
   describing the picture.
3. **Curate.** Open [the gallery](../.local/imagegen/index.html). Search titles,
   tags and prompts, then filter by group or status. Use **review** for fresh
   work, **shortlist** for live contenders, **selected** for a choice the user
   has made, and **shelved** for work out of contention. A status change leaves
   the original in place. Add a short `note` if a decision needs a reason.
4. **Verify.** Rebuild before handing off. Every original must have a catalog
   row and pass its hash check; every row must open its original. The
   generated HTML is a view; `catalog.json` owns metadata and curation.

From the repository root, run `python3.12 tools/imagegen_catalog.py --init`
before the first save in a checkout that has no archive. If restoring an
archive, copy its catalog and originals together before rebuilding.

For an existing archive:

```sh
python3.12 tools/imagegen_catalog.py
python3.12 tools/imagegen_catalog.py --check
python3.12 tools/imagegen_catalog.py --status weather-station shortlist
```

Add an entry to the catalog’s `images` list. Replace the example values
with the actual output metadata; `parents` holds archive IDs, and `uses`
holds objects with a `label` and a report `path` relative to the archive.

```json
{
  "id": "canal-study",
  "title": "Canal study",
  "kind": "Scene",
  "status": "review",
  "tags": ["waterline"],
  "file": "originals/canal-study.png",
  "width": 1536,
  "height": 1024,
  "sha256": "<SHA-256 of the original file>",
  "created_at": null,
  "created_at_source": "The tool did not expose a creation time",
  "tool": "image_gen.imagegen (built-in)",
  "model": null,
  "model_revision": null,
  "model_source": "The tool did not expose a model label",
  "prompt": "<exact submitted prompt>",
  "prompt_source": "Generation call",
  "thread_id": null,
  "tool_output": "<original output filename>",
  "parents": [],
  "uses": []
}
```

| File | Home and retention |
| --- | --- |
| **ImageGen original** | Keep in the archive, including shelved work. Do not overwrite or automatically delete. This is the user's exception to routine artifact retirement. |
| **Resize, crop, contact sheet** | Keep with its report while useful. Link to the original from the catalog when the view matters; do not count it as another generation. |
| **Shader capture, Blender sketch, third-party asset preview** | Keep with its own report and provenance. Label the source type. It is not an ImageGen original. |

The archive is local and ignored by Git. For recovery, back up
`catalog.json` and `originals/` together; the gallery can be rebuilt.
Do not rely on the ImageGen cache as the archive. Promote selected assets
into a shipping bundle only as a separate, authorized delivery step. Review
report derivatives when their decision is settled; curation and derivative
cleanup do not authorize deletion of originals.
