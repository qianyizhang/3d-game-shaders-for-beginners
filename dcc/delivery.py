"""Locate and verify exact DCC releases without loading consumer or authoring code."""

from dataclasses import dataclass
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile
import zlib

FORMAT = "dcc-scene-v1"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encode(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()


def safe_path(name: str) -> bool:
    return isinstance(name, str) and bool(re.fullmatch(r"[\w-]+(?:\.[\w-]+)*(?:/[\w-]+(?:\.[\w-]+)*)*", name, re.ASCII))


def _sha256(value: object) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[0-9a-f]{64}", value))


@dataclass(frozen=True)
class ReleaseRef:
    id: str
    manifest_sha256: str | None = None

    def __post_init__(self) -> None:
        if not safe_path(self.id) or "/" in self.id:
            raise ValueError(f"Invalid delivery ID: {self.id!r}")
        if self.manifest_sha256 is not None and not _sha256(self.manifest_sha256):
            raise ValueError(f"{self.id}: invalid expected manifest digest")


@dataclass(frozen=True)
class VerifiedRelease:
    """Fresh caller-owned data; frozen fields do not make the dictionaries immutable."""

    folder: Path
    manifest: dict
    files: dict[str, bytes]


class DeliveryError(ValueError):
    def __init__(self, required: ReleaseRef, attempts: tuple[tuple[Path, str], ...], hint: str):
        self.required = required
        self.attempts = attempts
        detail = "\n".join(f"  {folder}: {reason}" for folder, reason in attempts)
        super().__init__(f"{required.id}: {hint}\n{detail}")


class DeliveryUnavailable(DeliveryError):
    def __init__(self, required: ReleaseRef, attempts: tuple[tuple[Path, str], ...]):
        super().__init__(required, attempts,
                         "no hydrated copy; restore this revision or use --deliveries with a complete copy")


class DeliveryInvalid(DeliveryError):
    def __init__(self, required: ReleaseRef, attempts: tuple[tuple[Path, str], ...]):
        super().__init__(required, attempts,
                         "invalid copy; repair it or explicitly select another source with --deliveries")


def delivery_roots(repo: Path, override: Path | None = None) -> tuple[Path, ...]:
    """Construct search scope without reading any consumer metadata or source files."""
    return (override,) if override is not None else (repo / ".local/dcc/restored", repo / "dcc/deliveries")


def load_release(required: ReleaseRef, *, roots: tuple[Path, ...]) -> VerifiedRelease:
    """Try whole copies in order. Only absent/unhydrated copies permit fallback."""
    attempts: tuple[tuple[Path, str], ...] = ()
    last_error = None
    for root in roots:
        folder = (root / required.id).absolute()
        try:
            manifest, files = read_release(folder, required.manifest_sha256)
        except DeliveryUnavailable as error:
            attempts += error.attempts
            last_error = error
        except DeliveryInvalid as error:
            raise DeliveryInvalid(required, attempts + error.attempts) from error
        else:
            return VerifiedRelease(folder, manifest, files)
    raise DeliveryUnavailable(required, attempts) from last_error


class _Unhydrated(ValueError):
    pass


def _present(path: Path) -> bool:
    # lstat keeps dangling symlinks and permission errors from looking absent.
    try:
        path.lstat()
    except FileNotFoundError:
        return False
    return True


def read_release(folder: Path, expected_manifest: str | None = None) -> tuple[dict, dict[str, bytes]]:
    """Verify one exact folder; build/restore callers never search other locations."""
    required = ReleaseRef(folder.name, expected_manifest)
    try:
        return _read_release(folder, expected_manifest)
    except _Unhydrated as error:
        raise DeliveryUnavailable(required, ((folder, str(error)),)) from error
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, RuntimeError, zlib.error) as error:
        raise DeliveryInvalid(required, ((folder, str(error)),)) from error


def _read_release(folder: Path, expected_manifest: str | None) -> tuple[dict, dict[str, bytes]]:
    if not _present(folder):
        raise _Unhydrated("revision directory absent")
    raw = (folder / "manifest.json").read_bytes()
    if expected_manifest is not None and digest(raw) != expected_manifest:
        raise ValueError("manifest digest does not match the lock")
    manifest: object = json.loads(raw)
    if not isinstance(manifest, dict) or manifest.get("format") != FORMAT or manifest.get("id") != folder.name:
        raise ValueError("invalid delivery identity")
    names = manifest.get("files")
    if not isinstance(names, dict) or not all(safe_path(name) for name in names):
        raise ValueError("invalid member paths")
    if not _sha256(manifest.get("archiveSha256")) or not all(_sha256(sha) for sha in names.values()):
        raise ValueError("invalid payload digests")
    if not isinstance(manifest.get("scene"), str):
        raise ValueError("invalid delivery scene")
    if _present(folder / "files"):
        if not (folder / "files").is_dir():
            raise ValueError("restored files must be a directory")
        # A partial restored copy is invalid even when a ZIP also exists.
        data = {name: (folder / "files" / name).read_bytes() for name in names}
    else:
        archive_path = folder / "payload.zip"
        if not _present(archive_path):
            raise _Unhydrated("payload missing; use dcc/recovery.py restore")
        archive = archive_path.read_bytes()
        if archive.startswith(b"version https://git-lfs.github.com/spec/v1"):
            raise _Unhydrated("local ZIP is an LFS pointer; use dcc/recovery.py restore")
        if digest(archive) != manifest["archiveSha256"]:
            raise ValueError("invalid archive digest")
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            if sorted(bundle.namelist()) != sorted(names):
                raise ValueError("invalid archive members")
            data = {name: bundle.read(name) for name in names}
    for name, content in data.items():
        if digest(content) != names[name]:
            raise ValueError(f"corrupt payload {name}")
    return manifest, data
