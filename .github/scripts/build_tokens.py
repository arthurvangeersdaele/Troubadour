#!/usr/bin/env python3
"""Builds every platform's design tokens from the one source, docs/shared/troubadour.tokens.json (W3C DTCG 2025.10).

Writes:
  docs/shared/tokens.css                                   (website, La Troupe, web player, iPhone, Ballade, Map)
  app/src/main/java/com/troubadour/app/ui/TroubadourTokens.kt   (Android)

  python3 .github/scripts/build_tokens.py           rebuild both files
  python3 .github/scripts/build_tokens.py --check   fail if a file is not what the tokens say (CI)
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'docs/shared/troubadour.tokens.json'
CSS = ROOT / 'docs/shared/tokens.css'
KT = ROOT / 'app/src/main/java/com/troubadour/app/ui/TroubadourTokens.kt'
ORDER = ['bg', 'bar', 'card', 'line', 'text', 'muted', 'accent', 'music', 'amb', 'evt', 'blue', 'on_z', 'shadow']

tokens = json.loads(SRC.read_text())


def node(path):
    n = tokens
    for p in path.split('.'):
        n = n[p]
    return n


def value(t, seen=()):
    """The token's value, aliases ({group.token}) followed."""
    v = t['$value']
    if isinstance(v, str) and v.startswith('{') and v.endswith('}'):
        ref = v[1:-1]
        if ref in seen:
            sys.exit(f'Alias loop at {ref}')
        return value(node(ref), seen + (ref,))
    return v


def css_color(v):
    a = v.get('alpha', 1)
    if a == 1:
        return v['hex']
    r, g, b = (round(c * 255) for c in v['components'])
    return f'rgba({r},{g},{b},{a:g})'.replace('0.', '.')


def css_var(name):
    return '--' + name.replace('_', '-')


def dim(v):
    return f"{v['value']}{v['unit']}"


def build_css():
    th = tokens['theme']
    out = ['/* GENERATED from troubadour.tokens.json by .github/scripts/build_tokens.py. Do not edit: edit the tokens and run the script.',
           ' * Every Troubadour web surface links this sheet first. The Android app reads the same tokens (ui/TroubadourTokens.kt). */', '']
    for tid, g in ((k, v) for k, v in th.items() if not k.startswith('$')):
        meta = g['$extensions']['com.troubadour']
        modes = ['any'] if meta['special'] else ['dark', 'light']
        for m in modes:
            vals = '; '.join(f'{css_var(k)}:{css_color(value(g[m][k]))}' for k in ORDER)
            scheme = meta.get('scheme', m)
            if m == 'any':
                sel = f'[data-theme="{tid}"][data-mode]'
            elif tid == 'obsidian' and m == 'dark':
                sel = ':root, [data-theme="obsidian"][data-mode="dark"]'
            else:
                sel = f'[data-theme="{tid}"][data-mode="{m}"]'
            out.append(f'{sel} {{ {vals}; color-scheme: {scheme}; }}')
    # An unknown theme still gets the zones of its mode.
    for m in ('dark', 'light'):
        z = tokens['zone'][m]
        out.insert(4 if m == 'dark' else 5, f'[data-mode="{m}"] {{ ' + '; '.join(f'{css_var(k)}:{css_color(value(z[k]))}' for k in z if not k.startswith('$')) + f'; color-scheme: {m}; }}')
    fx = tokens['fixed']
    for m in ('dark', 'light'):
        vals = '; '.join(f'{css_var(k)}:{css_color(value(fx[k][m]))}' for k in fx if not k.startswith('$') and isinstance(fx[k], dict) and m in fx[k])
        out.append(('' if m == 'dark' else '') + (':root' if m == 'dark' else '[data-mode="light"]') + f' {{ {vals}; }}')
    gm = fx['gold_muted_themes']
    out.append(', '.join(f'[data-theme="{t}"]' for t in gm['$extensions']['com.troubadour']['themes']) + f' {{ --gold:{css_color(value(gm))}; }}')
    for k in ('splash', 'splash_ballade'):
        out.append(f':root {{ {css_var(k)}:{css_color(value(fx[k]))}; }}')
    for grp, pre in (('radius', 'r'), ('space', 'sp'), ('size', 'sz'), ('motion', 't')):
        g = tokens[grp]
        out.append(':root { ' + '; '.join(f'--{pre}-{k.replace("_", "-").lstrip("s") if grp == "space" else k.replace("_", "-")}:{dim(value(g[k]))}' for k in g if not k.startswith('$')) + '; }')
    return '\n'.join(out) + '\n'


def hexl(v):
    return '0x' + v['hex'][1:] + 'L'


def build_kt():
    th = tokens['theme']
    rows, light_specials = [], []
    for tid, g in ((k, v) for k, v in th.items() if not k.startswith('$')):
        meta = g['$extensions']['com.troubadour']
        for m in (['any'] if meta['special'] else ['dark', 'light']):
            rows.append(f'        "{tid}.{m}" to longArrayOf(' + ', '.join(hexl(value(g[m][k])) for k in ORDER[:-1]) + '),')
        if meta['special'] and meta.get('scheme') == 'light':
            light_specials.append(f'"{tid}"')
    fx = tokens['fixed']
    consts = []
    for k in fx:
        if k.startswith('$') or not isinstance(fx[k], dict):
            continue
        if 'dark' in fx[k]:
            for m in ('dark', 'light'):
                v = value(fx[k][m])
                if v.get('alpha', 1) == 1:
                    consts.append(f'    const val {k.upper()}_{m.upper()} = {hexl(v)}')
    a = tokens['audio']
    return f'''// GENERATED from docs/shared/troubadour.tokens.json by .github/scripts/build_tokens.py. Do not edit:
// edit the tokens and run the script. The web reads the same tokens (docs/shared/tokens.css).
package com.troubadour.app.ui

/** Design tokens shared with every Troubadour surface. */
object TroubadourTokens {{
    /** Order of each palette: bg, bar, card, line, text, muted, accent, music, amb, evt, blue, onZ (RGB, no alpha). */
    val palettes: Map<String, LongArray> = mapOf(
{chr(10).join(rows)}
    )

    /** Limited editions drawn on a light ground whatever the appearance. */
    val lightSpecials: Set<String> = setOf({", ".join(light_specials)})

{chr(10).join(consts)}

    /** A slider value v is heard as v to this power, on every platform. */
    const val VOLUME_CURVE_EXPONENT = {value(a["volume_curve_exponent"])}
    const val LOUDNESS_MUSIC_LUFS = {value(a["loudness_music_lufs"])}
    const val LOUDNESS_AMBIANCE_LUFS = {value(a["loudness_ambiance_lufs"])}
    const val LOUDNESS_EVENTS_LUFS = {value(a["loudness_events_lufs"])}
    val FADE_CHOICES_MS = intArrayOf({", ".join(str(x) for x in a["$extensions"]["com.troubadour"]["fade_choices_ms"])})
}}
'''


def main():
    check = '--check' in sys.argv
    bad = []
    for path, text in ((CSS, build_css()), (KT, build_kt())):
        if check:
            if not path.exists() or path.read_text() != text:
                bad.append(str(path.relative_to(ROOT)))
        else:
            path.write_text(text)
            print('wrote', path.relative_to(ROOT))
    if bad:
        sys.exit('Out of date with the tokens, run python3 .github/scripts/build_tokens.py: ' + ', '.join(bad))


if __name__ == '__main__':
    main()
