#!/usr/bin/env bash
set -euo pipefail

docs_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
output="${1:-$docs_dir}"
main_title="3D Game Shaders For Beginners"
upstream="https://github.com/lettier/3d-game-shaders-for-beginners"
fork="https://github.com/qianyizhang/3d-game-shaders-for-beginners"
pandoc="${PANDOC:-pandoc}"
highlight="--highlight-style=breezedark"
help="$("$pandoc" --help)"
if [[ "$help" == *--syntax-highlighting* ]]; then
  highlight="--syntax-highlighting=breezedark"
fi

mkdir -p -- "$output"
stage="$(mktemp -d "$output/.docs-build.XXXXXXXX")"
trap 'rm -rf -- "$stage"' EXIT

render() {
  local source="$1" file="$2" title="$3"
  "$pandoc" \
    -f gfm -t html5 --wrap=none "$highlight" \
    --template="$docs_dir/_template.html5" \
    --metadata pagetitle="$title" --metadata author-meta="David Lettier" \
    --metadata css="style.css" "$source" |
    sed -E \
      -e 's|href="(sections/)?([a-z-]+)\.md([#?][^"]*)?"|href="\2.html\3"|g' \
      -e 's|href="\.\./README\.md"|href="index.html"|g' \
      -e "s|href=\"\.\./demonstration/([^\"]*)\"|href=\"$upstream/blob/master/demonstration/\1\" target=\"_blank\" rel=\"noopener noreferrer\"|g" \
      -e "s|href=\"((project-docs\|dcc)/[^\"]*)\"|href=\"$fork/blob/master/\1\"|g" \
      > "$stage/$file"
}

for source in "$docs_dir"/../sections/*.md
do
  name="${source##*/}"
  name="${name%.md}"
  case "$name" in
    ssao) title=SSAO ;;
    glsl) title=GLSL ;;
    *) title="$(tr -- '-' ' ' <<< "$name" | awk '{for (i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2); print}')";;
  esac
  render "$source" "$name.html" "$title | $main_title"
done
render "$docs_dir/../README.md" index.html "$main_title"
mv -f -- "$stage"/*.html "$output/"
