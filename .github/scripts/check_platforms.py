#!/usr/bin/env python3
"""The platform contract of Troubadour (261118_troubadour_unifier.md): what must stay true across the website,
La Troupe, Troubadour (web, iPhone, Android), Ballade and Map. Run on every push and pull request.

  1. Tokens: docs/shared/tokens.css and TroubadourTokens.kt are what troubadour.tokens.json says.
  2. One palette: no sheet but tokens.css declares a theme colour (--bg, --accent, --music...).
  3. Offline apps: every local file a Home Screen app loads is in its service worker, and the app and its
     service worker carry the same VERSION.
  4. Words (charter 9): no long dash, no bullet sign and no "rhythm" in what a troubadour reads.
"""
import re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs'
errors = []

# 1. Tokens
r = subprocess.run([sys.executable, str(ROOT / '.github/scripts/build_tokens.py'), '--check'], capture_output=True, text=True)
if r.returncode:
    errors.append((r.stderr or r.stdout).strip())

# 2. One palette
THEME_VARS = re.compile(r'--(bg|bar|card|line|text|muted|accent|music|amb|evt|blue|on-z|danger|gold|silver)\s*:')
for css in DOCS.rglob('*.css'):
    if css.name == 'tokens.css' or 'vendor' in css.parts:
        continue
    for n, line in enumerate(css.read_text().splitlines(), 1):
        if THEME_VARS.search(line):
            errors.append(f'{css.relative_to(ROOT)}:{n}: a theme colour is declared outside shared/tokens.css')

# 3. Offline apps
for app in ('ios', 'ballade', 'map'):
    page = (DOCS / app / 'index.html').read_text()
    sw = (DOCS / app / 'sw.js').read_text()
    listed = set(re.findall(r"'([^']+)'", sw))
    for ref in re.findall(r'(?:src|href)="([^"]+\.(?:js|css))(?:\?[^"]*)?"', page):
        if ref.startswith('http'):
            continue
        if ref not in listed:
            errors.append(f'docs/{app}/sw.js: {ref} is loaded by the app but not kept for offline use')
    v_app = re.search(r"const VERSION = '([^']+)'", (DOCS / app / 'app.js').read_text())
    v_sw = re.search(r"const VERSION = '([^']+)'", sw)
    if v_app and v_sw and v_app.group(1) != v_sw.group(1):
        errors.append(f'docs/{app}: app.js VERSION {v_app.group(1)} and sw.js VERSION {v_sw.group(1)} differ')

# 4. Words, in strings only (comments may say anything)
STRING = re.compile(r'"(?:[^"\\\n]|\\.)*"|\'(?:[^\'\\\n]|\\.)*\'|`[^`]*`')
BAD = re.compile(r'—|•|\b[Rr]hythm')
files = [p for p in list(DOCS.rglob('*.js')) + list(DOCS.rglob('*.html')) + list((ROOT / 'app/src').rglob('*.kt'))
         if 'vendor' not in p.parts]
for f in files:
    text = f.read_text(errors='ignore')
    if f.suffix == '.html':
        text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
        chunks = [text]
    else:
        text = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)
        text = '\n'.join(re.sub(r'(^|\s)//.*$', '', l) for l in text.splitlines())
        chunks = STRING.findall(text)
    for c in chunks:
        m = BAD.search(c)
        if m:
            errors.append(f'{f.relative_to(ROOT)}: "{m.group(0)}" in a text a troubadour reads: {c.strip()[:70]}')
            break

if errors:
    print('Platform contract broken:\n  ' + '\n  '.join(errors))
    sys.exit(1)
print('Platform contract holds.')
