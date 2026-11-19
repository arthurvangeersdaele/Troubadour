#!/usr/bin/env python3
"""Makes a preview of a web app beside it, so a rebuilt version can be tried on a phone without touching the app
troubadours play with: docs/<app> is copied to docs/<app>-preview, with its own offline cache and its own database,
"(preview)" in its name and a small Preview badge. Installed from its own address, it is a separate Home Screen app.

  python3 .github/scripts/make_preview.py ballade
  python3 .github/scripts/make_preview.py map

A preview is promoted by merging its branch (the real app then has the same code) and deleting the copy.
"""
import re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'docs'
CACHE = {'ballade': ('troubadour-ballade-', 'troubadour-bpreview-'), 'map': ('troubadour-map-', 'troubadour-mpreview-')}
BADGE = ('<div aria-hidden="true" style="position:fixed;left:50%;top:calc(2px + env(safe-area-inset-top));transform:translateX(-50%);z-index:9999;'
         'font:600 11px \'Barlow Semi Condensed\',system-ui,sans-serif;letter-spacing:1px;text-transform:uppercase;padding:2px 10px;'
         'border-radius:8px;background:#F0C24F;color:#1A1206;pointer-events:none">Preview</div>')

app = sys.argv[1]
src, dst = ROOT / app, ROOT / f'{app}-preview'
if dst.exists():
    shutil.rmtree(dst)
shutil.copytree(src, dst)
old, new = CACHE[app]
sw = dst / 'sw.js'
text = sw.read_text()
if old not in text:
    sys.exit(f'{sw}: no cache named {old}*')
sw.write_text(text.replace(old, new))
# Its own stories or worlds (its own IndexedDB): on a computer the preview and the app share an address, and a
# preview that writes a newer kind of record must never touch what the app plays at the table.
DBS = {'ballade': ('flow-db.js', 'troubadour-ballade'), 'map': ('map-db.js', 'troubadour-map')}
dbf, dbname = DBS[app]
dbp = dst / dbf
dbt = dbp.read_text()
if f"const NAME = '{dbname}';" not in dbt:
    sys.exit(f'{dbp}: no database named {dbname}')
dbp.write_text(dbt.replace(f"const NAME = '{dbname}';", f"const NAME = '{dbname}-preview'; // its own records: the app played at the table is never touched"))
for m in dst.glob('*.webmanifest'):
    t = m.read_text()
    t = re.sub(r'("(?:short_)?name"\s*:\s*")([^"]+)"', lambda x: f'{x.group(1)}{x.group(2)} (preview)"', t)
    m.write_text(t)
page = dst / 'index.html'
t = page.read_text()
t = re.sub(r'<title>([^<]+)</title>', r'<title>\1 (preview)</title>', t, count=1)
t = t.replace('</body>', BADGE + '\n</body>', 1)
page.write_text(t)
print('made', dst.relative_to(ROOT.parent))
