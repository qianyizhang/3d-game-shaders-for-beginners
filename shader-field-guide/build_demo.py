"""Generate the disk-openable copy of Shader Field Guide."""

import argparse
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent
ENTRY = '  <script type="module" src="./src/main.js"></script>'
MODULES = ("lessons.js", "renderer.js", "fallback.js", "main.js")
IMPORT = re.compile(r"^import \{[^\n]+\} from '\./([\w.-]+)';$")


def standalone_html() -> str:
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    if page.count(ENTRY) != 1:
        raise ValueError("Expected one main.js script tag in index.html")
    parts = ["  <script>", "(() => {"]
    available = set()
    for name in MODULES:
        parts.append(f"\n/* src/{name} */")
        source = (ROOT / "src" / name).read_text(encoding="utf-8")
        if "</script" in source.lower():
            raise ValueError(f"{name} contains an HTML script end tag")
        for line in source.splitlines():
            if line.startswith("import "):
                match = IMPORT.fullmatch(line)
                if not match or match[1] not in available:
                    raise ValueError(f"Cannot inline import in {name}: {line}")
                continue
            parts.append(line.removeprefix("export "))
        available.add(name)
    parts.extend(("})();", "  </script>"))
    return page.replace(ENTRY, "\n".join(parts))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if demo.html is stale")
    args = parser.parse_args()
    demo = ROOT / "demo.html"
    page = standalone_html()
    if args.check:
        if not demo.is_file() or demo.read_text(encoding="utf-8") != page:
            parser.exit(1, "demo.html is stale; run python3 build_demo.py\n")
    else:
        demo.write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
