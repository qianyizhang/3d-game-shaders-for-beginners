#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: demonstration/macos.sh build
       demonstration/macos.sh run [demo arguments]

PANDA3D_SDK overrides SDK discovery. Otherwise the launcher checks
.local/panda3d-sdk in the checkout, then /Library/Developer/Panda3D.
USAGE
}

fail() { printf '%s\n' "$*" >&2; exit 1; }

action="${1:-run}"
case "$action" in
  -h|--help) usage; exit 0 ;;
  build|run) if (( $# )); then shift; fi ;;
  *) usage >&2; exit 2 ;;
esac
if [[ "$action" == build && $# -ne 0 ]]; then usage >&2; exit 2; fi
[[ "$(uname -s)" == Darwin ]] || fail "This launcher requires macOS."

demo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_dir="$(dirname "$demo_dir")"
if [[ -n "${PANDA3D_SDK:-}" ]]; then
  sdk="$PANDA3D_SDK"
elif [[ -e "$repo_dir/.local/panda3d-sdk/lib/libp3framework.dylib" ]]; then
  sdk="$repo_dir/.local/panda3d-sdk"
else
  sdk=/Library/Developer/Panda3D
fi
[[ -f "$sdk/lib/libp3framework.dylib" ]] || fail \
  "Panda3D SDK libraries missing at $sdk/lib. Set PANDA3D_SDK to an extracted SDK or install the macOS C++ SDK."
sdk="$(cd -- "$sdk" && pwd -P)"
binary="$demo_dir/3d-game-shaders-for-beginners"

if [[ "$action" == build ]]; then
  [[ -f "$sdk/include/pandaFramework.h" ]] || fail \
    "Panda3D C++ headers missing at $sdk/include. Select C++ Header Files when installing the SDK."
  arch="$(uname -m)"
  if ! lipo -verify_arch "$arch" "$sdk/lib/libp3framework.dylib"; then
    if [[ "$arch" == arm64 ]] && lipo -verify_arch x86_64 "$sdk/lib/libp3framework.dylib"; then
      arch=x86_64
    else
      fail "Panda3D SDK has no compatible architecture for this Mac."
    fi
  fi
  tmp="$(mktemp "${binary}.XXXXXXXX")"
  trap 'rm -f -- "$tmp"' EXIT
  clang++ -arch "$arch" -std=c++11 -O2 \
    -I"$sdk/include" "$demo_dir/src/main.cxx" \
    -L"$sdk/lib" -lp3framework -lpanda -lpandafx -lpandaexpress -lpandaphysics \
    -lp3dtoolconfig -lp3dtool -o "$tmp"
  chmod +x "$tmp"
  mv -f -- "$tmp" "$binary"
  printf 'Built %s (%s)\n' "$binary" "$arch"
else
  [[ -x "$binary" ]] || fail "Demo binary missing. Run demonstration/macos.sh build first."
  cd -- "$demo_dir"
  export PANDA_PRC_DIR="$demo_dir"
  export DYLD_LIBRARY_PATH="$sdk/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
  exec "$binary" "$@"
fi
