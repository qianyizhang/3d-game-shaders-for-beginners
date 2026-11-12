"""Validate, curate, and render the local ImageGen catalog."""
from __future__ import annotations

import argparse
from hashlib import sha256
from html import escape
import json
from pathlib import Path, PurePosixPath
import re
import sys
from typing import NotRequired, TypedDict, cast
from urllib.parse import urlsplit

DEFAULT_ARCHIVE = Path(__file__).resolve().parents[1] / ".local" / "imagegen"
STATES = ("review", "shortlist", "selected", "shelved")
ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
FORMATS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}

class Use(TypedDict):
    label: str
    path: str

class Entry(TypedDict):
    id: str
    title: str
    kind: str
    status: str
    file: str
    sha256: str
    width: int
    height: int
    tags: list[str]
    created_at: str | None
    created_at_source: NotRequired[str]
    tool: str
    model: str | None
    model_revision: str | None
    model_source: str
    prompt: str | None
    prompt_source: str
    thread_id: str | None
    tool_output: str
    content_credential_instance: NotRequired[str | None]
    parents: list[str]
    uses: list[Use]
    note: NotRequired[str]
    alt: NotRequired[str]

def field(row: dict, key: str, nullable: bool = False) -> str | None:
    value = row[key]
    if nullable and value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be nonempty text")
    return value

def read_catalog(root: Path) -> list[Entry]:
    catalog: object = json.loads((root / "catalog.json").read_text())
    if not isinstance(catalog, dict) or catalog.get("version") != 1 or not isinstance(catalog.get("images"), list):
        raise ValueError("expected catalog version 1 and an images list")
    entries: list[Entry] = []
    ids, paths, hashes = set(), set(), set()
    for row in catalog["images"]:
        if not isinstance(row, dict):
            raise ValueError("image entry must be an object")
        slug = field(row, "id")
        if not ID.fullmatch(slug) or slug in ids:
            raise ValueError(f"invalid or duplicate ID: {slug}")
        for key in ("title", "kind", "tool", "model_source", "prompt_source", "tool_output"):
            field(row, key)
        for key in ("prompt", "model", "model_revision", "created_at", "thread_id"):
            field(row, key, nullable=True)
        if row["status"] not in STATES:
            raise ValueError(f"{slug}: invalid status {row['status']!r}")
        if any(type(row[key]) is not int or row[key] <= 0 for key in ("width", "height")):
            raise ValueError(f"{slug}: image dimensions must be positive integers")
        for key in ("tags", "parents"):
            if not isinstance(row[key], list) or not all(isinstance(x, str) and x.strip() for x in row[key]):
                raise ValueError(f"{slug}: {key} must be a list of text values")
        file = PurePosixPath(field(row, "file"))
        if file.parts != ("originals", file.name) or file.suffix.lower() not in FORMATS or file.stem != slug:
            raise ValueError(f"{slug}: expected originals/{slug}.<image format>")
        local = root / file
        if local.is_symlink() or not local.is_file() or local.resolve().parent != root / "originals":
            raise ValueError(f"{slug}: original is missing or is a symlink: {file}")
        with local.open("rb") as original:
            actual = sha256(original.read()).hexdigest()
        if actual != row["sha256"]:
            raise ValueError(f"{slug}: original bytes do not match the catalog")
        if actual in hashes or file.as_posix() in paths:
            raise ValueError(f"{slug}: duplicate original bytes or path; reuse the existing row")
        if not isinstance(row["uses"], list):
            raise ValueError(f"{slug}: uses must be a list")
        for use in row["uses"]:
            if not isinstance(use, dict):
                raise ValueError(f"{slug}: each use must have a label and a path")
            field(use, "label")
            href = urlsplit(field(use, "path"))
            if href.scheme or href.netloc or not href.path or href.path.startswith("/"):
                raise ValueError(f"{slug}: use must be a relative report path")
        ids.add(slug)
        paths.add(file.as_posix())
        hashes.add(actual)
        entries.append(cast(Entry, row))
    for row in entries:
        missing = set(row["parents"]) - (ids - {row["id"]})
        if missing:
            raise ValueError(f"{row['id']}: invalid parent IDs: {', '.join(sorted(missing))}")
    on_disk = {f.relative_to(root).as_posix() for f in (root / "originals").iterdir() if not f.name.startswith(".")}
    if on_disk != paths:
        raise ValueError(f"unregistered archive files: {', '.join(sorted(on_disk - paths))}")
    return entries

def e(value: str | None) -> str:
    return escape(value if value is not None else "Not recorded")

def card(row: Entry, index: int) -> str:
    slug, path = e(row["id"]), e(row["file"])
    label = e(row.get("alt") or row["title"])
    priority = 'fetchpriority="high"' if index == 0 else 'loading="lazy" decoding="async"'
    tags = " · ".join(map(e, row["tags"]))
    revision = e(row["model_revision"] or "Exact revision not recorded")
    uses = " · ".join(f'<a href="{e(x["path"])}">{e(x["label"])}</a>' for x in row["uses"])
    parents = " · ".join(f'<a href="#{e(x)}">{e(x)}</a>' for x in row["parents"])
    note = f'<p class="fine">{e(row["note"])}</p>' if row.get("note") else ""
    return f'''<article id="{slug}" data-kind="{e(row["kind"])}" data-status="{e(row["status"])}">
<a class="art" href="{path}" aria-label="Open original: {e(row["title"])}"><img src="{path}"
  width="{row["width"]}" height="{row["height"]}" {priority} alt="{label}"></a>
<div class="card-body"><p class="eyebrow">{e(row["kind"])} <span class="status">{e(row["status"].capitalize())}</span></p>
<h2>{e(row["title"])}</h2><p class="fine">{tags}</p>{note}
<details><summary>Prompt &amp; provenance</summary>
<dl><dt>Image ID</dt><dd>{slug}</dd><dt>Model</dt><dd>{e(row["model"])} · {revision}<br>{e(row["model_source"])}</dd>
<dt>Tool</dt><dd>{e(row["tool"])}</dd><dt>Created (UTC)</dt><dd>{e(row["created_at"])}<br>{e(row.get("created_at_source"))}</dd>
<dt>Original</dt><dd><a href="{path}">{path}</a> · {row["width"]} × {row["height"]}</dd>
<dt>Source output</dt><dd>{e(row["tool_output"])}</dd><dt>Chat ID</dt><dd>{e(row["thread_id"])}</dd>
<dt>Parent images</dt><dd>{parents or "None"}</dd></dl>
<p class="fine">{e(row["prompt_source"])}</p><div class="prompt">{e(row["prompt"])}</div>
</details>{f'<p class="uses">{uses}</p>' if uses else ''}</div></article>'''

def render(entries: list[Entry]) -> str:
    kinds = "".join(f'<option>{e(k)}</option>' for k in dict.fromkeys(row["kind"] for row in entries))
    status = "".join(f'<option value="{s}">{s.capitalize()}</option>' for s in STATES)
    cards = "\n".join(card(row, i) for i, row in enumerate(entries))
    return (TEMPLATE.replace("@@KINDS@@", kinds).replace("@@STATUS@@", status)
            .replace("@@COUNT@@", str(len(entries))).replace("@@CARDS@@", cards))

TEMPLATE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Generated images · Mill Shader Lab</title>
<style>
:root{color-scheme:light;--paper:#f5f2e8;--ink:#203330;--muted:#4a5d55;--line:#c8cbbc;--green:#234f44;--rust:#8d4029;--card:#fffdf6;--mono:ui-monospace,SFMono-Regular,Consolas,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:1rem/1.5 system-ui,sans-serif}a{color:var(--green);text-underline-offset:.2em}:focus-visible{outline:3px solid #a54827;outline-offset:3px}[hidden]{display:none!important}.wrap{width:min(100% - 2.5rem,75rem);margin-inline:auto}
header{background:#1a3932;color:#fff4df;padding:1.2rem 0 1.55rem;border-bottom:.25rem solid #b47149}header a{color:#ffdc9d}header :focus-visible{outline-color:#ffdc9d}.meta,.eyebrow,.status{font:700 .72rem/1.4 var(--mono);letter-spacing:.075em;text-transform:uppercase}.meta{color:#ffdc9d;margin:0}.intro{max-width:65ch;margin:.4rem 0 .75rem;color:#e0ebe0}
h1,h2{font-family:Georgia,'Times New Roman',serif;line-height:1.1;margin:0}h1{font-size:clamp(2.65rem,7vw,5.7rem);letter-spacing:-.055em;margin-top:.35rem}h2{font-size:1.45rem;letter-spacing:-.02em}.links{display:flex;gap:.3rem 1rem;flex-wrap:wrap;font-size:.9rem}
main{padding:1.1rem 0 2.2rem}form{display:grid;grid-template-columns:minmax(0,2fr) repeat(2,minmax(8rem,1fr)) auto;align-items:end;gap:.55rem .7rem}label{display:block;font-weight:650;font-size:.85rem;margin-bottom:.22rem}input,select,button{width:100%;font:inherit;color:var(--ink);min-height:3rem;border:1px solid #6b7b70;border-radius:.28rem;background:var(--card);padding:.45rem .55rem}button{cursor:pointer;color:var(--green);font-weight:700}#count{font-size:.85rem;color:var(--muted);margin:.75rem 0 .55rem}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem;align-items:start}article{min-width:0;background:var(--card);border:1px solid var(--line);border-radius:.45rem}article:target{outline:3px solid #a54827;outline-offset:2px}.art{display:block}.art img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:contain;background:#dfddd0;border-radius:.4rem .4rem 0 0}.card-body{padding:.65rem .75rem .72rem}.eyebrow{margin:0 0 .27rem;display:flex;justify-content:space-between;align-items:center;gap:.4rem;color:var(--rust)}.status{background:#e7ebdd;color:var(--green);padding:.16rem .3rem;border-radius:.16rem;letter-spacing:.04em}.fine,.uses{color:var(--muted);font-size:.81rem;margin:.35rem 0}.uses{margin:.55rem 0 0}
details{margin-top:.5rem;border-top:1px solid var(--line);overflow-wrap:anywhere}summary{cursor:pointer;color:var(--green);font-size:.88rem;font-weight:700;padding:.45rem 0 .15rem}dl{display:grid;grid-template-columns:6rem minmax(0,1fr);gap:.25rem .4rem;font-size:.79rem}dt{font-weight:700}dd{margin:0}.prompt{white-space:pre-wrap;background:#f0eee2;padding:.55rem;font-size:.82rem;border-radius:.2rem}#empty{padding:.75rem;border-left:.22rem solid var(--rust);background:var(--card)}
@media(max-width:58rem){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:38rem){.wrap{width:calc(100% - 1.3rem)}.grid,form{grid-template-columns:1fr}form{gap:.48rem}}
</style></head><body>
<header><div class="wrap"><p class="meta">Mill Shader Lab / Image archive</p><h1>Generated images</h1>
<p class="intro">@@COUNT@@ originals, with the prompts and provenance kept beside them. Open any image for the full file.</p>
<nav class="links" aria-label="Archive links"><a href="catalog.json">Catalog data</a><a href="README.md">Archive notes</a>
<a href="../../project-docs/imagegen-governance.md">How to curate</a></nav></div></header>
<main class="wrap"><search id="filters" hidden><form action="index.html" method="get">
<div><label for="query">Search titles, tags or prompts</label><input type="search" id="query" name="q" spellcheck="false"></div>
<div><label for="kind">Group</label><select id="kind" name="kind"><option value="">All groups</option>@@KINDS@@</select></div>
<div><label for="status">Status</label><select id="status" name="status"><option value="">All statuses</option>@@STATUS@@</select></div>
<button type="reset">Clear filters</button></form></search>
<p id="count" role="status">@@COUNT@@ images</p><p id="empty" hidden>No images match. Clear or change the filters.</p>
<div class="grid">@@CARDS@@</div></main>
<script>
const form = document.querySelector('form');
const cards = [...document.querySelectorAll('article')];
const lookup = cards.map(card => card.textContent.toLowerCase());
function filter() {
  const terms = form.elements.q.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);
  const kind = form.elements.kind.value;
  const status = form.elements.status.value;
  let count = 0;
  cards.forEach((card, i) => {
    const match = (!kind || card.dataset.kind === kind) && (!status || card.dataset.status === status)
      && terms.every(term => lookup[i].includes(term));
    card.hidden = !match;
    if (match) count++;
  });
  document.querySelector('#count').textContent = count === 1 ? '1 image' : count + ' images';
  document.querySelector('#empty').hidden = count !== 0;
}
form.addEventListener('input', filter);
form.addEventListener('change', filter);
form.addEventListener('reset', () => setTimeout(filter, 0));
form.addEventListener('submit', event => { event.preventDefault(); filter(); });
document.querySelector('#filters').hidden = false;
filter();
</script></body></html>
"""

def write(path: Path, content: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content)
    tmp.replace(path)

def initialize(root: Path) -> None:
    originals = root / "originals"
    originals.mkdir(parents=True, exist_ok=True)
    catalog = root / "catalog.json"
    if not catalog.exists():
        if any(not f.name.startswith(".") for f in originals.iterdir()):
            raise ValueError("originals already exist; restore or reconstruct catalog.json first")
        with catalog.open("x", encoding="utf-8") as stream:
            stream.write('{"version": 1, "images": []}\n')
    notes = root / "README.md"
    if not notes.exists():
        with notes.open("x", encoding="utf-8") as stream:
            stream.write("# Generated image archive\n\n"
                         "Open the [gallery](index.html) or [catalog data](catalog.json).\n")

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    options = parser.add_mutually_exclusive_group()
    options.add_argument("--check", action="store_true", help="Verify original files without writing.")
    options.add_argument("--init", action="store_true", help="Create an empty archive if none exists.")
    options.add_argument("--status", nargs=2, metavar=("ID", "STATUS"), help=f"Set one status: {', '.join(STATES)}.")
    args = parser.parse_args()
    root = args.archive.resolve()
    try:
        if args.init:
            initialize(root)
        entries = read_catalog(root)
        if args.status:
            slug, status = args.status
            row = next((r for r in entries if r["id"] == slug), None)
            if row is None or status not in STATES:
                raise ValueError(f"unknown image ID or status: {slug} {status}")
            row["status"] = status
        if not args.check:
            html = render(entries)
            if args.status:
                write(root / "catalog.json", json.dumps({"version": 1, "images": entries}, ensure_ascii=False, indent=2) + "\n")
            write(root / "index.html", html)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Image catalog: {exc}", file=sys.stderr)
        return 1
    print(f"{'Verified' if args.check else 'Cataloged'} {len(entries)} originals in {root}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
