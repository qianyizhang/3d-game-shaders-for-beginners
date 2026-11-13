"""Read and verify a portable DCC delivery without loading authoring tools."""

import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

FORMAT = "dcc-scene-v1"


def default_deliveries(repo: Path) -> Path:
    restored = repo / ".local/dcc/restored"
    local = repo / "dcc/deliveries"
    restored_index = restored / "index.json"
    if not restored_index.is_file():
        return local
    selected = local / "index.json"
    if selected.is_file() and json.loads(restored_index.read_bytes()) != json.loads(selected.read_bytes()):
        return local
    lock = repo / "mill-shader-lab/dcc-lock.json"
    if lock.is_file():
        pins = json.loads(lock.read_bytes())["scenes"]
        if any(not (restored / pin["id"] / "manifest.json").is_file() for pin in pins.values()):
            return local
    return restored


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encode(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()


def safe_path(name: str) -> bool:
    return bool(re.fullmatch(r"[\w-]+(?:\.[\w-]+)*(?:/[\w-]+(?:\.[\w-]+)*)*", name, re.ASCII))


def read_release(folder: Path, expected_manifest: str | None = None) -> tuple[dict, dict[str, bytes]]:
    raw = (folder / "manifest.json").read_bytes()
    if expected_manifest and digest(raw) != expected_manifest:
        raise ValueError(f"{folder.name}: manifest digest does not match the lock")
    manifest = json.loads(raw)
    if manifest["format"] != FORMAT or manifest["id"] != folder.name:
        raise ValueError(f"{folder.name}: invalid delivery identity")
    names = manifest["files"]
    if not all(safe_path(name) for name in names):
        raise ValueError(f"{folder.name}: invalid member paths")
    if (folder / "files").is_dir():
        # Recovered directories retain the original pinned manifest. Each
        # member has the same digest as in the historical delivery archive.
        data = {name: (folder / "files" / name).read_bytes() for name in names}
    else:
        archive_path = folder / "payload.zip"
        if not archive_path.is_file():
            raise ValueError(f"{folder.name}: payload missing; use dcc/recovery.py restore")
        archive = archive_path.read_bytes()
        if archive.startswith(b"version https://git-lfs.github.com/spec/v1"):
            raise ValueError(f"{folder.name}: local ZIP is an LFS pointer; use dcc/recovery.py restore")
        if digest(archive) != manifest["archiveSha256"]:
            raise ValueError(f"{folder.name}: invalid archive digest")
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            members = bundle.namelist()
            if sorted(members) != sorted(names):
                raise ValueError(f"{folder.name}: invalid archive members")
            data = {name: bundle.read(name) for name in members}
    for name, content in data.items():
        if digest(content) != manifest["files"][name]:
            raise ValueError(f"{folder.name}: corrupt payload {name}")
    return manifest, data
