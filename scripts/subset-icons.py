#!/usr/bin/env python3
"""Shrinks the Material Symbols icon font of a hosted app to the icons its code names.

The full font is 4 MB. Apps built by AI tools use it through ligatures (<span class="material-
symbols-outlined">dashboard</span>) and normally load it from Google, which the platform's content
security policy blocks (the icon names then show as plain text and the layout falls apart).

    pip install fonttools brotli
    python3 scripts/subset-icons.py hosted/<slug> [--style outlined|rounded|sharp]

The font itself comes from the npm package `material-symbols` (any copy in the workspace store
will do). Writes hosted/<slug>/public/fonts/material-symbols.woff2 and material-symbols.css (the
class `material-symbols-outlined` and the font face); link the stylesheet in index.html:
`<link rel="stylesheet" href="/fonts/material-symbols.css">` (same origin, so the CSP allows it).
Run it again when the app uses more icons.
Every quoted word in the source that is an icon name counts as used (icons chosen at run time
come from such lists), so nothing the app can show is dropped.
"""

import argparse
import re
import sys
from pathlib import Path

try:
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fonttools is missing: pip install fonttools brotli")

CODE = {".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".json"}
WORD = re.compile(r"[a-z][a-z0-9_]{1,40}")


def find_font(app: Path, style: str) -> Path:
    pattern = f"material-symbols-{style}.woff2"
    for base in [app, *app.parents]:
        for hit in (base / "node_modules" / "material-symbols").glob(pattern):
            return hit
        # Not a dependency of the app: the copy in the workspace store is just as good.
        for hit in sorted(base.glob(f"node_modules/.pnpm/material-symbols@*/node_modules/material-symbols/{pattern}")):
            return hit
    sys.exit("material-symbols is not installed in this workspace (pnpm add -D material-symbols in any package)")


def used_words(app: Path) -> set[str]:
    words: set[str] = set()
    for path in app.rglob("*"):
        if path.suffix not in CODE or "node_modules" in path.parts or "dist" in path.parts:
            continue
        words.update(WORD.findall(path.read_text(errors="ignore")))
    return words


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("app", type=Path)
    parser.add_argument("--style", default="outlined", choices=["outlined", "rounded", "sharp"])
    args = parser.parse_args()
    app: Path = args.app.resolve()
    source = find_font(app, args.style)

    font = TTFont(source)
    glyph_names = set(font.getGlyphOrder())
    icons = sorted(used_words(app) & glyph_names)
    cmap = font.getBestCmap()
    letters = [cmap[ord(c)] for c in "abcdefghijklmnopqrstuvwxyz0123456789_" if ord(c) in cmap]

    options = Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    # Without closure only the ligatures of the kept icons remain (with it, all of them would).
    options.layout_closure = False
    options.notdef_outline = True
    options.name_IDs = [1, 2]
    subsetter = Subsetter(options)
    subsetter.populate(glyphs=[".notdef", *letters, *icons])
    subsetter.subset(font)

    out = app / "public" / "fonts"
    out.mkdir(parents=True, exist_ok=True)
    woff = out / "material-symbols.woff2"
    font.save(woff)
    (out / "material-symbols.css").write_text(
        "@font-face {\n"
        "  font-family: 'Material Symbols Outlined';\n"
        "  font-style: normal;\n"
        "  font-weight: 100 700;\n"
        "  font-display: block;\n"
        "  src: url('/fonts/material-symbols.woff2') format('woff2');\n"
        "}\n\n"
        ".material-symbols-outlined {\n"
        "  font-family: 'Material Symbols Outlined';\n"
        "  font-weight: normal;\n"
        "  font-style: normal;\n"
        "  font-size: 24px;\n"
        "  line-height: 1;\n"
        "  letter-spacing: normal;\n"
        "  text-transform: none;\n"
        "  display: inline-block;\n"
        "  white-space: nowrap;\n"
        "  word-wrap: normal;\n"
        "  direction: ltr;\n"
        "  -webkit-font-smoothing: antialiased;\n"
        "  font-feature-settings: 'liga';\n"
        "}\n"
    )
    print(f"{len(icons)} icons, {woff.stat().st_size / 1024:.0f} kB -> {woff.relative_to(app.parent.parent)}")


if __name__ == "__main__":
    main()
