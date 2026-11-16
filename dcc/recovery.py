"""Sync immutable DCC objects to the public Object Library, or restore from Git metadata."""

import argparse
import getpass
import io
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zipfile

from delivery import ReleaseRef, VerifiedRelease, delivery_roots, digest, encode, load_release, read_release, safe_path

DCC = Path(__file__).resolve().parent
DEFAULT = DCC.parent / ".local/dcc/remote-backup"
RECEIPT = DCC / "recovery-manifest.json"
BASE = "https://r2-object-library.landy123007.chatgpt.site"
NAMESPACE = "3d-game-shaders-for-beginners/dcc"
MAX = 32 * 1024 * 1024


def read_json(path: Path) -> dict:
    return json.loads(path.read_bytes())


def put_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Keep the Git receipt diffable by file, source and delivery without
    # expanding every mesh range onto its own line.
    if path == RECEIPT:
        def compact(value):
            return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))

        def section(value):
            if not isinstance(value, dict):
                return compact(value)
            members = ",\n".join(f"    {compact(key)}: {compact(item)}" for key, item in sorted(value.items()))
            return "{\n" + members + "\n  }"

        rows = ",\n".join(f"  {compact(key)}: {section(value)}" for key, value in sorted(data.items()))
        raw = ("{\n" + rows + "\n}\n").encode()
    else:
        raw = encode(data)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        tmp.write(raw)
        temp = Path(tmp.name)
    temp.replace(path)


def checked(data: bytes, sha: str, size: int) -> bytes:
    if len(data) != size or digest(data) != sha:
        raise ValueError(f"Wrong bytes for {sha[:12]}")
    return data


def texture_archive(textures: dict[str, bytes]) -> bytes:
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
        for sha, data in sorted(textures.items()):
            archive.writestr(zipfile.ZipInfo(f"{sha}.png"), data)
    return stream.getvalue()


def prepare(root: Path, previous: dict, deliveries: Path | None = None) -> dict:
    from build import BUILDERS, make_candidate

    index = read_json(DCC / "deliveries/index.json")
    if not isinstance(index, dict) or index.get("version") != 1 or not isinstance(index.get("scenes"), dict):
        raise ValueError("Invalid selected delivery index")
    index = index["scenes"]
    lock = DCC.parent / "mill-shader-lab/dcc-lock.json"
    locks = read_json(lock)
    if not isinstance(locks, dict) or locks.get("version") != 1 or not isinstance(locks.get("scenes"), dict):
        raise ValueError(f"{lock}: invalid Lab delivery lock")
    pins = locks["scenes"]
    required = {}
    for pin in pins.values():
        if not isinstance(pin, dict) or not isinstance(pin.get("manifestSha256"), str):
            raise ValueError("Invalid Lab delivery pin")
        ref = ReleaseRef(pin["id"], pin["manifestSha256"])
        prior = required.get(ref.id)
        if prior and prior.manifest_sha256 is not None and prior.manifest_sha256 != ref.manifest_sha256:
            raise ValueError(f"{ref.id}: conflicting pinned manifest digests")
        required[ref.id] = ref
    # Keep the existing pin-first order so shared texture-pack bytes stay stable.
    for ref in sorted((ReleaseRef(delivery) for delivery in index.values()), key=lambda ref: ref.id):
        required.setdefault(ref.id, ref)
    roots = delivery_roots(DCC.parent, deliveries)
    releases = [load_release(ref, roots=roots) for ref in required.values()]
    by_id = {release.manifest["id"]: release for release in releases}
    for scene, delivery in list(index.items()) + [(scene, pin["id"]) for scene, pin in pins.items()]:
        if by_id[delivery].manifest["scene"] != scene:
            raise ValueError(f"{delivery}: delivery does not match required scene {scene}")

    plan = dict(version=1, namespace=NAMESPACE, endpoint=BASE, blobs={}, deliveries={}, working={}, masters={})
    textures: dict[str, bytes] = {}
    prior_textures = previous.get("textures", {})
    plan["textures"] = {}

    def blob(data: bytes, folder: str, name: str) -> str:
        sha = digest(data)
        if sha in plan["blobs"]:
            return sha
        if not 0 < len(data) <= MAX:
            raise ValueError(f"{name}: Object Library size limit")
        info = {"folder": f"{NAMESPACE}/{folder}", "name": name, "bytes": len(data)}
        prior = previous.get("blobs", {}).get(sha)
        if prior:
            if prior["bytes"] != len(data):
                raise ValueError("Existing receipt has wrong size")
            info = prior
        plan["blobs"][sha] = info
        path = root / "payloads" / sha
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
        else:
            checked(path.read_bytes(), sha, len(data))
        return sha

    def add(verified: VerifiedRelease) -> None:
        release, files = verified.manifest, verified.files
        model = json.loads(files["scene.json"])
        geometry = files[model["geometry"]]
        parts = {part["slug"]: part for part in model["parts"]}
        objects = {}
        ranges = []
        for obj_id, obj in sorted(model["objects"].items()):
            sections = sorted({(mesh[field][0], mesh[field][1] * 4)
                               for part in obj["parts"] for mesh in parts[part]["meshes"]
                               for field in ("vertices", "indices")})
            chunks = [geometry[offset:offset + length] for offset, length in sections]
            sha = blob(b"".join(chunks), f"objects/{release['scene']}/{obj_id}", "geometry.bin")
            objects[obj_id] = {"blob": sha, "ranges": [list(section) for section in sections]}
            ranges.extend(sections)
        cursor = 0
        for offset, length in sorted(ranges):
            if offset != cursor or length <= 0:
                raise ValueError(f"{release['id']}: geometry coverage overlaps or has gaps")
            cursor += length
        if cursor != len(geometry):
            raise ValueError(f"{release['id']}: incomplete geometry coverage")
        maps = {}
        for name, data in files.items():
            if name in ("scene.json", model["geometry"]):
                continue
            if not name.endswith(".png"):
                raise ValueError(f"Unsupported delivery dependency: {name}")
            maps[name] = add_texture(data)
        entry = {"release": release, "model": model, "objects": objects, "maps": maps}
        plan["deliveries"][release["id"]] = entry

    def add_texture(data: bytes) -> str:
        sha = digest(data)
        if sha in prior_textures and "key" in previous["blobs"][prior_textures[sha]]:
            pack = prior_textures[sha]
            plan["textures"][sha] = pack
            plan["blobs"][pack] = previous["blobs"][pack]
        else:
            textures[sha] = data
        return sha

    # Keep the exact selected and lesson-pinned revisions, as well as the working artwork.
    plan["selected"] = index
    for release in releases:
        add(release)
    for slug in BUILDERS:
        candidate = make_candidate(slug, root / "candidates")
        verified = load_release(ReleaseRef(candidate.name), roots=(candidate.parent,))
        release = verified.manifest
        existing = next((key for key, item in plan["deliveries"].items()
                         if item["release"]["scene"] == slug and item["release"]["files"] == release["files"]), None)
        if existing is None:
            add(verified)
        plan["working"][slug] = existing or release["id"]
    source_root = DCC / "sources"
    source_files = {path.relative_to(DCC).as_posix(): digest(path.read_bytes())
                    for path in sorted(source_root.rglob("*")) if path.is_file() and not path.is_symlink()
                    and path.suffix in {".py", ".json"}}
    plan["sourceDigests"] = source_files
    from sources.pond_objects import OBJECTS, make_object
    from sources.scene_gallery_geometry import export
    for asset in OBJECTS:
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            model = export(make_object(asset), work)
            files = {path for part in model["parts"] for mesh in part["meshes"] for path in mesh["textures"].values()}
            maps = {path: add_texture((work / path).read_bytes()) for path in sorted(files)}
            geo = blob((work / model["geometry"]).read_bytes(), f"masters/{asset}", "geometry.bin")
            plan["masters"][asset] = dict(model=model, geometry=geo, maps=maps,
                                          version=digest(encode(dict(model=model, geometry=geo, maps=maps))))
    if textures:
        pack = blob(texture_archive(textures), "textures", "shared-maps.zip")
        plan["textures"].update({sha: pack for sha in textures})
    put_json(root / "plan.json", plan)
    for release in releases:
        print(f"Delivery {release.manifest['id']}: {release.folder}")
    return plan


class RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(path: str, params: dict, data: bytes | None = None, headers: dict | None = None) -> bytes:
    query = f"?{urlencode(params)}" if params else ""
    req = Request(f"{BASE}{path}{query}", data=data, headers={"User-Agent": "ObjectLibraryCLI/1.1", **(headers or {})})
    with build_opener(RejectRedirect()).open(req, timeout=35) as response:
        payload = response.read(MAX + 1)
        if len(payload) > MAX:
            raise ValueError("Response exceeds Object Library file limit")
        return payload


def password() -> str:
    value = os.environ.get("OBJECT_LIBRARY_UPLOAD_PASSWORD")
    if not value:
        path = DCC.parent / ".env.local"
        if path.is_file():
            if path.is_symlink() or path.stat().st_mode & 0o077:
                raise ValueError(".env.local must be a regular, owner-only file")
            for line in path.read_text().splitlines():
                key, sep, item = line.partition("=")
                if sep and key.strip() == "OBJECT_LIBRARY_UPLOAD_PASSWORD":
                    value = item.strip().strip("'").strip('"')
    if not value and sys.stdin.isatty():
        value = getpass.getpass("Object Library upload password: ")
    if not value or "\n" in value or "\r" in value:
        raise ValueError("Set OBJECT_LIBRARY_UPLOAD_PASSWORD or provide it at the private prompt")
    return value


def get_blob(sha: str, row: dict) -> bytes:
    key = row["key"]
    if not key.startswith(f"library/{NAMESPACE}/"):
        raise ValueError("Unexpected Object Library namespace in receipt")
    for attempt in range(3):
        try:
            data = request("/download", {"key": key})
            break
        except HTTPError as error:
            if error.code not in (502, 503, 504) or attempt == 2:
                raise
        except (URLError, TimeoutError, ConnectionError, IncompleteRead):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)
    return checked(data, sha, row["bytes"])


def upload(root: Path, limit: int) -> int:
    plan = read_json(root / "plan.json")
    if (plan["version"], plan["namespace"], plan["endpoint"]) != (1, NAMESPACE, BASE):
        raise ValueError("Wrong sync plan identity")
    progress = root / "verified.json"
    verified = read_json(progress) if progress.is_file() else {}
    for sha in set(verified) & plan["blobs"].keys():
        expected = plan["blobs"][sha]
        row = verified[sha]
        if any(row[key] != expected[key] for key in ("folder", "name", "bytes")):
            raise ValueError("Local upload journal does not match the prepared plan")
    pending = [(sha, row) for sha, row in plan["blobs"].items() if "key" not in row and sha not in verified]
    secret = password() if pending else ""
    for sha, row in pending[:limit]:
        path = root / "payloads" / sha
        data = checked(path.read_bytes(), sha, row["bytes"])
        if not row["folder"].startswith(f"{NAMESPACE}/"):
            raise ValueError("Refusing upload outside the repository namespace")
        try:
            receipt = json.loads(request("/api/upload", {"name": row["name"], "folder": row["folder"]}, data, {
                "Content-Type": "application/octet-stream", "x-content-sha256": sha,
                "x-upload-password": secret,
            }))
        except HTTPError as error:
            if error.code == 429:
                print(f"Rate limited; wait {error.headers.get('Retry-After', '600')} seconds before resuming.", flush=True)
                return 75
            raise
        result = {**row, "key": receipt["key"]}
        get_blob(sha, result)
        verified[sha] = result
        put_json(progress, verified)
        print(f"Verified {len(verified)} new: {row['folder']}/{row['name']}", flush=True)
    remaining = set(plan["blobs"]) - set(verified) - {sha for sha, row in plan["blobs"].items() if "key" in row}
    print(f"{len(remaining)} objects still to upload.", flush=True)
    return 0


def final_manifest(root: Path) -> dict:
    plan = read_json(root / "plan.json")
    progress = root / "verified.json"
    verified = read_json(progress) if progress.is_file() else {}
    for sha, row in plan["blobs"].items():
        if "key" not in row:
            if sha not in verified:
                raise ValueError("Sync is incomplete; keep the existing recovery manifest")
            plan["blobs"][sha] = verified[sha]
    return plan


def require_current_snapshot(work: Path, plan: dict, deliveries: Path | None = None) -> None:
    # A long, rate-limited upload can outlive the working art it began with.
    # Leave its journal intact and require a new prepare if those inputs moved.
    with tempfile.TemporaryDirectory(dir=work) as scratch:
        current = prepare(Path(scratch), plan, deliveries)
    for field in ("deliveries", "selected", "working", "masters", "textures", "sourceDigests"):
        if encode(current[field]) != encode(plan[field]):
            raise ValueError("Local DCC assets changed during sync; prepare again before recording")


def restore(plan: dict, output: Path) -> None:
    if (plan["version"], plan["namespace"], plan["endpoint"]) != (1, NAMESPACE, BASE):
        raise ValueError("Wrong recovery manifest identity")
    if output.exists() or output.is_symlink():
        raise ValueError("Use a new restore destination")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as temp:
        temp = Path(temp)
        downloads = {sha: get_blob(sha, row) for sha, row in plan["blobs"].items()}
        textures = {}
        for pack in set(plan["textures"].values()):
            with zipfile.ZipFile(io.BytesIO(downloads[pack])) as archive:
                for sha, member in plan["textures"].items():
                    if member == pack:
                        data = archive.read(f"{sha}.png")
                        textures[sha] = checked(data, sha, len(data))
        recovered = temp / "deliveries"
        recovered.mkdir()
        for name, entry in plan["deliveries"].items():
            if not safe_path(name) or "/" in name:
                raise ValueError(f"Invalid delivery ID {name}")
            model, release = entry["model"], entry["release"]
            folder = recovered / name
            payload = folder / "files"
            geometry = bytearray()
            segments = []
            for item in entry["objects"].values():
                data = downloads[item["blob"]]
                cursor = 0
                for offset, size in item["ranges"]:
                    segments.append((offset, data[cursor:cursor+size]))
                    cursor += size
                if cursor != len(data):
                    raise ValueError(f"{name}: incomplete object geometry")
            for offset, data in sorted(segments):
                if offset != len(geometry):
                    raise ValueError(f"{name}: invalid assembly offsets")
                geometry.extend(data)
            files = {"scene.json": encode(model), model["geometry"]: bytes(geometry)}
            files.update({name: textures[sha] for name, sha in entry["maps"].items()})
            if set(files) != set(release["files"]):
                raise ValueError(f"{name}: incomplete restored delivery")
            for relative, data in files.items():
                if not safe_path(relative):
                    raise ValueError(f"Unsafe restored path: {relative}")
                checked(data, release["files"][relative], len(data))
                path = payload / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            (folder / "manifest.json").write_bytes(encode(release))
            read_release(folder)
        # Recovery preserves the review selection. Working artwork and older
        # Lab pins remain available as separate, exact delivery directories.
        put_json(recovered / "index.json", {"version": 1, "scenes": plan["selected"]})
        for asset, row in plan.get("masters", {}).items():
            if not safe_path(asset) or "/" in asset:
                raise ValueError("Invalid master ID")
            data = {"object.json": encode(row["model"]), "geometry.bin": downloads[row["geometry"]]}
            data.update({name: textures[sha] for name, sha in row["maps"].items()})
            if digest(encode({key: row[key] for key in ("model", "geometry", "maps")})) != row["version"]:
                raise ValueError(f"{asset}: master version mismatch")
            for name, payload in data.items():
                if not safe_path(name):
                    raise ValueError(f"Unsafe master file: {name}")
                target = recovered / "_masters" / asset / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
        if output.exists() or output.is_symlink():
            raise ValueError("Restore destination appeared during download")
        recovered.rename(output)
    print(f"Restored {len(plan['deliveries'])} deliveries from {len(downloads)} verified remote files: {output}")


def check_sources(plan: dict) -> None:
    for name, sha in plan["sourceDigests"].items():
        if not safe_path(name) or not name.startswith("sources/"):
            raise ValueError(f"Invalid source path: {name}")
        path = DCC / name
        if not path.is_file() or digest(path.read_bytes()) != sha:
            raise ValueError(f"{name}: check out the Git revision that matches the recovery manifest")


def status(work: Path) -> None:
    plan = read_json(work / "plan.json")
    progress = work / "verified.json"
    verified = read_json(progress) if progress.is_file() else {}
    total = len(plan["blobs"])
    complete = sum("key" in row or sha in verified for sha, row in plan["blobs"].items())
    print(f"{complete}/{total} remote files verified; {total - complete} pending")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "status", "upload", "record", "restore"])
    parser.add_argument("--work", type=Path, default=DEFAULT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--deliveries", type=Path,
                        help="Read selected and Lab-pinned inputs only from this directory")
    parser.add_argument("--limit", type=int, default=9)
    parser.add_argument("--public-approved", action="store_true", help="Confirm the prepared bytes are cleared for public download")
    args = parser.parse_args()
    if args.action == "prepare":
        previous = read_json(RECEIPT) if RECEIPT.is_file() else {}
        plan = prepare(args.work, previous, args.deliveries)
        pending = sum("key" not in row for row in plan["blobs"].values())
        print(f"{len(plan['working'])} scenes, {len(plan['deliveries'])} revisions, {pending} new remote files; inspect {args.work / 'plan.json'}")
    elif args.action == "status":
        status(args.work)
    elif args.action == "upload":
        if not args.public_approved or not 1 <= args.limit <= 9:
            parser.error("upload requires --public-approved and --limit 1–9")
        return upload(args.work, args.limit)
    elif args.action == "record":
        if args.output is None:
            parser.error("record requires a new --output directory for the clean restore")
        plan = final_manifest(args.work)
        require_current_snapshot(args.work, plan, args.deliveries)
        restore(plan, args.output)
        put_json(RECEIPT, plan)
        print(f"Recorded verified recovery at {RECEIPT}")
    else:
        if args.output is None:
            parser.error("restore requires --output")
        plan = read_json(RECEIPT)
        check_sources(plan)
        restore(plan, args.output)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except HTTPError as error:
        raise SystemExit(f"Object Library HTTP {error.code}; stopped without retrying")
    except (OSError, ValueError, KeyError, IncompleteRead, zipfile.BadZipFile) as error:
        raise SystemExit(f"DCC recovery: {error}")
