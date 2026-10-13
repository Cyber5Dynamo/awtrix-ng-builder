#!/usr/bin/env python3
"""Baut aus den Frontend-Dateien eine einzelne, eigenständige HTML-Datei.

Aufruf:  python3 tools/build_standalone.py
Ergebnis: dist/awtrix_ng_builder_standalone.html
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = root / "custom_components" / "awtrix_ng_builder" / "frontend"
out = root / "dist" / "awtrix_ng_builder_standalone.html"

html = (src / "index.html").read_text(encoding="utf-8")

css = (src / "style.css").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}</style>")

for name in ("migrator.js", "app.js"):
    js = (src / name).read_text(encoding="utf-8").replace("</script>", "<\\/script>")
    html = html.replace(f'<script src="{name}"></script>', f"<script>\n{js}</script>")

assert not re.search(r'<(link|script)[^>]+(href|src)="(style|app|migrator)', html), "Nicht alles eingebettet"

out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"geschrieben: {out} ({out.stat().st_size // 1024} KiB)")
