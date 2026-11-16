#!/usr/bin/env bash
set -euo pipefail

demo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
compiler="${CXX:-g++}"
include_dir="${P3D_INCLUDE_PATH:-/usr/include/panda3d}"
lib_dir="${P3D_LIB_PATH:-/usr/lib/$("$compiler" -print-multiarch)/panda3d}"
python_include="${PYTHON_INCLUDE_PATH:-$(python3.12 -c 'import sysconfig; print(sysconfig.get_path("include"))')}"

for path in "$include_dir/pandaFramework.h" "$lib_dir/libp3framework.so" "$python_include/Python.h"
do
  if [[ ! -f "$path" ]]; then
    printf 'Missing SDK header or library: %s\n' "$path" >&2
    printf 'Install Panda3D and Python development headers, or set P3D_INCLUDE_PATH, P3D_LIB_PATH and PYTHON_INCLUDE_PATH.\n' >&2
    exit 1
  fi
done
lib_dir="$(cd -- "$lib_dir" && pwd -P)"

binary="$demo_dir/3d-game-shaders-for-beginners"
tmp="$(mktemp "${binary}.XXXXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
"$compiler" -std=c++11 -O2 -Wall -Wextra -Werror \
  -isystem "$include_dir" -isystem "$python_include" "$demo_dir/src/main.cxx" \
  -L"$lib_dir" -Wl,-rpath,"$lib_dir" \
  -lp3framework -lpanda -lpandafx -lpandaexpress -lpandaphysics \
  -lp3dtoolconfig -lp3dtool -pthread -o "$tmp"
chmod +x "$tmp"
mv -f -- "$tmp" "$binary"
