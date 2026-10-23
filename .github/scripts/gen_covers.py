#!/usr/bin/env python3
"""Story covers: one drawing of the five motifs, written out for the web player, the iPhone app and Android.

Run from the repository root after changing a motif:
    python3 .github/scripts/gen_covers.py
It writes docs/play/cover.js, docs/ios/cover.js and app/src/main/java/com/troubadour/app/ui/CoverArt.kt.
Every motif is drawn in a 320 x 140 box with the same thin gold line, the story colour as the only accent.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KINDS = ['bard', 'music', 'book', 'scroll', 'map']
# A story's tint is a role of the theme, not a colour: every theme (and any new one) dresses every cover.
# amb, evt and blue are theme colours; violet and ember are mixes of them.
TINTS = ['amb', 'evt', 'blue', 'violet', 'ember']
# The colour each tint has in the default theme, written next to it in the file for tools that do not know themes.
TINT_HEX = {'amb': '#4DB6A6', 'evt': '#E5655B', 'blue': '#5B9BF5', 'violet': '#B58AE8', 'ember': '#E39B54'}
# Discovery stories keep the covers chosen for them.
FIXED = {'forest': ['book', 'amb'], 'big-war': ['bard', 'evt'], 'underwater': ['music', 'blue']}
# Roles in the motifs: c = the story tint, gold = the theme accent (the wire), pale = accent toward the text,
# bg = the card behind (cut-outs), cream = the theme text.
ROLES = {'none': 0, 'c': 1, 'gold': 2, 'pale': 3, 'bg': 4, 'cream': 5}


def n(v):
    return ('%.2f' % v).rstrip('0').rstrip('.')


def circle(cx, cy, r):
    return f'M{n(cx - r)} {n(cy)}a{n(r)} {n(r)} 0 1 0 {n(2 * r)} 0a{n(r)} {n(r)} 0 1 0 {n(-2 * r)} 0Z'


def ellipse(rx, ry):
    return f'M{n(-rx)} 0a{n(rx)} {n(ry)} 0 1 0 {n(2 * rx)} 0a{n(rx)} {n(ry)} 0 1 0 {n(-2 * rx)} 0Z'


def rect(x, y, w, h, r=0):
    if not r:
        return f'M{n(x)} {n(y)}H{n(x + w)}V{n(y + h)}H{n(x)}Z'
    return (f'M{n(x + r)} {n(y)}H{n(x + w - r)}a{n(r)} {n(r)} 0 0 1 {n(r)} {n(r)}V{n(y + h - r)}'
            f'a{n(r)} {n(r)} 0 0 1 {n(-r)} {n(r)}H{n(x + r)}a{n(r)} {n(r)} 0 0 1 {n(-r)} {n(-r)}V{n(y + r)}'
            f'a{n(r)} {n(r)} 0 0 1 {n(r)} {n(-r)}Z')


def S(d, fill='none', fo=1, stroke='none', sw=1.6, so=1, dash=None, t=None):
    return {'d': d, 'fill': fill, 'fo': fo, 'stroke': stroke, 'sw': sw, 'so': so, 'dash': dash, 't': t or [0, 0, 0, 1]}


LUTE = [160, 80, -32, 0.82]
MOTIFS = {
    'bard': [
        S('M18 70H100C124 70 126 50 150 50H170C194 50 196 70 220 70H302', stroke='gold', so=0.75),
        S('M100 70H220', stroke='gold', so=0.95),
        S('M100 70C124 70 126 90 150 90H170C194 90 196 70 220 70', stroke='gold', so=0.75),
        S(rect(136, 62, 13, 36, 6.5), fill='c', fo=0.55),
        S(rect(153.5, 50, 13, 48, 6.5), fill='c', fo=0.8),
        S(rect(171, 36, 13, 62, 6.5), fill='c'),
        S(circle(100, 70, 3), fill='pale'),
        S(circle(220, 70, 3), fill='pale'),
    ],
    'music': [
        *[S(f'M14 {50 + 8 * i}C90 {40 + 8 * i} 230 {62 + 8 * i} 306 {46 + 8 * i}', stroke='cream', sw=0.8, so=0.13) for i in range(5)],
        S('M0 -6C22 -6 34 14 30 34C26 52 12 60 0 60C-12 60 -26 52 -30 34C-34 14 -22 -6 0 -6Z', fill='c', fo=0.18, stroke='gold', sw=1.9, t=LUTE),
        S(circle(0, 20, 8.5), stroke='gold', sw=1.9, t=LUTE),
        S(circle(0, 20, 5), stroke='gold', sw=1.9, so=0.8, dash=[1.5, 2.5], t=LUTE),
        S('M-9 44H9', stroke='gold', sw=1.9, t=LUTE),
        S('M-5 -6V-54H5V-6', stroke='gold', sw=1.9, t=LUTE),
        S('M-5 -18H5M-5 -30H5M-5 -42H5', stroke='gold', sw=1.9, so=0.6, t=LUTE),
        S('M-5 -54L-10 -74L2 -76L5 -54', stroke='gold', sw=1.9, t=LUTE),
        S('M-9 -60H-13M-10 -67H-14M3 -62H7M3 -70H7', stroke='gold', sw=1.9, so=0.8, t=LUTE),
        S('M-2 -54V44M0 -54V44M2 -54V44', stroke='gold', sw=0.7, so=0.7, t=LUTE),
        S(ellipse(5, 3.8), fill='c', t=[80, 74, -22, 1]),
        S('M84.4 72.5V48C90 51 94 54 92 60', stroke='c', sw=1.6),
        S(ellipse(4.4, 3.4), fill='c', fo=0.8, t=[236, 56, -22, 1]),
        S(ellipse(4.4, 3.4), fill='c', fo=0.8, t=[256, 50, -22, 1]),
        S('M240 54.6V34L260 28V48.6', stroke='c', sw=1.5, so=0.8),
    ],
    'book': [
        S('M160 28L162.4 33.6L168 36L162.4 38.4L160 44L157.6 38.4L152 36L157.6 33.6Z', fill='pale'),
        S(circle(132, 30, 1.3), fill='gold', fo=0.7),
        S(circle(190, 26, 1.6), fill='gold', fo=0.7),
        S('M160 54C140 46 114 44 96 49V106C114 101 140 103 160 111Z', fill='c', fo=0.14, stroke='gold', sw=1.7),
        S('M160 54C180 46 206 44 224 49V106C206 101 180 103 160 111Z', fill='c', fo=0.14, stroke='gold', sw=1.7),
        S('M96 106V110C114 105 140 107 160 115C180 107 206 105 224 110V106', stroke='gold', sw=1.7, so=0.6),
        S('M106 62C120 58 136 59 150 64M106 71C120 67 136 68 150 73M106 80C120 76 136 77 150 82M106 89C118 86 128 86 138 89'
          'M170 64C184 59 200 58 214 62M170 73C184 68 200 67 214 71M170 82C184 77 194 76 202 77', stroke='gold', sw=1, so=0.45),
        S('M200 48V100L205 95L210 100V47Z', fill='c'),
    ],
    'scroll': [
        S('M232 22C250 34 246 62 214 84L206 90C212 68 220 42 232 22Z', fill='c', fo=0.12, stroke='gold', sw=1.7, so=0.9),
        S('M232 22L198 98', stroke='gold', sw=1.1),
        S(rect(116, 36, 88, 70), fill='bg', stroke='gold', sw=1.7),
        S(rect(116, 36, 88, 70), fill='c', fo=0.12),
        S(rect(106, 29, 108, 10, 5), fill='bg', stroke='gold', sw=1.7),
        S(rect(106, 103, 108, 10, 5), fill='bg', stroke='gold', sw=1.7),
        S('M128 52H192M128 60H186M128 68H192M128 76H170', stroke='gold', sw=1, so=0.5),
        S(circle(186, 92, 10.5), stroke='c', sw=1.2, dash=[2, 2]),
        S(circle(186, 92, 8), fill='c'),
        S('M186 87L187.6 90.4L191 92L187.6 93.6L186 97L184.4 93.6L181 92L184.4 90.4Z', fill='bg', fo=0.55),
    ],
    'map': [
        S('M26 112C60 112 70 92 96 92C116 92 120 104 132 96M188 48C204 40 220 46 236 42C256 37 268 30 290 28', stroke='gold', sw=1.8, dash=[0.5, 6]),
        S(circle(26, 112, 4), fill='c'),
        S(circle(96, 92, 4.5), fill='bg', stroke='c', sw=2),
        S(circle(236, 42, 4.5), fill='bg', stroke='c', sw=2),
        S('M284 22L296 34M296 22L284 34', stroke='c', sw=2.6),
        S(circle(160, 70, 36), stroke='gold', sw=1.5, so=0.6, dash=[1, 4]),
        S(circle(160, 70, 24), stroke='gold', sw=1.5, so=0.55),
        S('M160 70L172 58M160 70L172 82M160 70L148 82M160 70L148 58', stroke='gold', sw=1, so=0.6),
        S('M160 36L166 64L194 70L166 76L160 104L154 76L126 70L154 64Z', stroke='gold', sw=1.5),
        S('M160 36L166 64L160 70L154 64Z', fill='c'),
        S('M160 104L166 76L160 70L154 76Z', fill='gold', fo=0.35),
        S(circle(160, 70, 2.4), fill='pale'),
    ],
}

JS = '''/* Story covers: generated by .github/scripts/gen_covers.py, do not edit by hand.
 * Every colour comes from the theme (CSS variables): a new theme dresses every cover without redrawing anything. */
(function (global) {
  'use strict';
  const KINDS = %(kinds)s;
  const TINTS = %(tints)s;
  const TINT_HEX = %(tinthex)s;
  const FIXED = %(fixed)s;
  // The tints as theme colours.
  const TINT_CSS = {
    amb: 'var(--amb)', evt: 'var(--evt)', blue: 'var(--blue)',
    violet: 'color-mix(in srgb, var(--evt) 50%%, var(--blue))',
    ember: 'color-mix(in srgb, var(--music) 55%%, var(--evt))',
  };
  const ROLE_CSS = { c: 'var(--cv-c)', gold: 'var(--cv-line)', pale: 'var(--cv-pale)', bg: 'var(--cv-ground)', cream: 'var(--cv-ink)' };
  const MOTIFS = %(motifs)s;
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function tintOfHex(hex) {
    const k = Object.keys(TINT_HEX).find((t) => TINT_HEX[t].toUpperCase() === String(hex || '').toUpperCase());
    return k || null;
  }
  /** The cover of a story: the one it carries (extra.cover), else the Discovery one, else one picked from its key. */
  function look(key, carried) {
    if (carried && KINDS.includes(carried.kind)) {
      const tint = TINTS.includes(carried.tint) ? carried.tint : tintOfHex(carried.color);
      if (tint) return { kind: carried.kind, tint };
    }
    if (FIXED[key]) return { kind: FIXED[key][0], tint: FIXED[key][1] };
    const h = hash(String(key || 'story'));
    return { kind: KINDS[h %% KINDS.length], tint: TINTS[(h >>> 8) %% TINTS.length] };
  }
  /** What a story stores: the tint, and its colour in the default theme for tools that do not know themes. */
  function stored(lk) { return { kind: lk.kind, tint: lk.tint, color: TINT_HEX[lk.tint] }; }
  function tintCss(tint) { return TINT_CSS[tint] || TINT_CSS.amb; }
  /** The motif as an SVG string, fitted in its box, painted with the theme. */
  function svg(kind) {
    const parts = (MOTIFS[kind] || MOTIFS.bard).map((s) => {
      const t = s.t;
      const tr = t[0] || t[1] || t[2] || t[3] !== 1 ? ` transform="translate(${t[0]} ${t[1]}) rotate(${t[2]}) scale(${t[3]})"` : '';
      let st = `fill:${s.fill === 'none' ? 'none' : ROLE_CSS[s.fill]}`;
      if (s.fill !== 'none' && s.fo !== 1) st += `;fill-opacity:${s.fo}`;
      if (s.stroke !== 'none') {
        st += `;stroke:${ROLE_CSS[s.stroke]};stroke-width:${s.sw};stroke-linecap:round;stroke-linejoin:round`;
        if (s.so !== 1) st += `;stroke-opacity:${s.so}`;
        if (s.dash) st += `;stroke-dasharray:${s.dash.join(' ')}`;
      }
      return `<path d="${s.d}"${tr} style="${st}"/>`;
    });
    return `<svg class="cover-art" viewBox="0 0 320 140" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
  }
  /** A cover element: <div class="cover"> with the story tint; its ground, halo and frame come from the stylesheet. */
  function element(lk, framed) {
    const d = document.createElement('div');
    d.className = 'cover' + (framed ? ' framed' : '');
    d.style.setProperty('--cv-c', tintCss(lk.tint));
    d.innerHTML = svg(lk.kind);
    return d;
  }
  global.TroubadourCover = { KINDS, TINTS, TINT_HEX, look, stored, tintCss, svg, element, hash };
})(window);
'''


def kt_role(r):
    return ROLES[r]


def kt_float(v):
    s = n(v)
    return (s if '.' in s else s + '.0') + 'f'


def write():
    motifs_js = json.dumps(MOTIFS, separators=(',', ':'))
    js = JS % {
        'kinds': json.dumps(KINDS), 'tints': json.dumps(TINTS), 'tinthex': json.dumps(TINT_HEX),
        'fixed': json.dumps(FIXED), 'motifs': motifs_js,
    }
    for p in ['docs/play/cover.js', 'docs/ios/cover.js']:
        (ROOT / p).write_text(js)

    lines = []
    for k in KINDS:
        rows = []
        for s in MOTIFS[k]:
            dash = 'null' if not s['dash'] else 'floatArrayOf(' + ', '.join(kt_float(x) for x in s['dash']) + ')'
            t = s['t']
            rows.append(f'            CoverShape("{s["d"]}", {kt_role(s["fill"])}, {kt_float(s["fo"])}, {kt_role(s["stroke"])}, '
                        f'{kt_float(s["sw"])}, {kt_float(s["so"])}, {dash}, {kt_float(t[0])}, {kt_float(t[1])}, {kt_float(t[2])}, {kt_float(t[3])}),')
        lines.append(f'        "{k}" to listOf(\n' + '\n'.join(rows) + '\n        ),')
    fixed = ', '.join(f'"{k}" to ("{v[0]}" to "{v[1]}")' for k, v in FIXED.items())
    kt = KT.replace('@KINDS@', ', '.join(f'"{k}"' for k in KINDS)) \
        .replace('@TINTS@', ', '.join(f'"{t}"' for t in TINTS)) \
        .replace('@TINTHEX@', ', '.join(f'"{t}" to "{h}"' for t, h in TINT_HEX.items())) \
        .replace('@FIXED@', fixed).replace('@MOTIFS@', '\n'.join(lines))
    (ROOT / 'app/src/main/java/com/troubadour/app/ui/CoverArt.kt').write_text(kt)


KT = '''package com.troubadour.app.ui

// Story covers: generated by .github/scripts/gen_covers.py, do not edit by hand.
// Every colour comes from the theme: a new theme dresses every cover without redrawing anything.

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp
import org.json.JSONObject

/** One stroke or fill of a motif. Roles: 0 none, 1 story tint, 2 theme accent (the wire), 3 accent toward the text, 4 card, 5 text. */
class CoverShape(
    val d: String, val fill: Int, val fillA: Float, val stroke: Int, val width: Float, val strokeA: Float,
    val dash: FloatArray?, val tx: Float, val ty: Float, val rot: Float, val sc: Float,
) {
    val path: Path by lazy { PathParser().parsePathString(d).toPath() }
}

/** A cover: a motif and a tint, the tint being a role of the theme (amb, evt, blue, violet, ember). */
data class CoverLook(val kind: String, val tint: String)

object Covers {
    val KINDS = listOf(@KINDS@)
    val TINTS = listOf(@TINTS@)
    /** The colour each tint has in the default theme, stored next to it for tools that do not know themes. */
    val TINT_HEX = mapOf(@TINTHEX@)
    private val FIXED = mapOf(@FIXED@)

    val MOTIFS: Map<String, List<CoverShape>> = mapOf(
@MOTIFS@
    )

    private fun hash(s: String): Long {
        var h = 0x811c9dc5L
        for (ch in s) {
            h = h xor ch.code.toLong()
            h = (h * 0x01000193L) and 0xFFFFFFFFL
        }
        return h
    }

    /** Same rule as the web and iPhone: the cover the story carries, else the Discovery one, else one picked from its key. */
    fun look(key: String, extra: String?): CoverLook {
        try {
            val c = JSONObject(extra ?: "{}").optJSONObject("cover")
            val kind = c?.optString("kind").orEmpty()
            if (kind in KINDS) {
                val tint = c!!.optString("tint").takeIf { it in TINTS }
                    ?: TINT_HEX.entries.firstOrNull { it.value.equals(c.optString("color"), ignoreCase = true) }?.key
                if (tint != null) return CoverLook(kind, tint)
            }
        } catch (e: Exception) { /* no cover carried */ }
        FIXED[key]?.let { return CoverLook(it.first, it.second) }
        val h = hash(key.ifBlank { "story" })
        return CoverLook(KINDS[(h % KINDS.size).toInt()], TINTS[((h ushr 8) % TINTS.size).toInt()])
    }
}

/** The tint as a colour of the current theme. */
@Composable
fun tintColor(tint: String): Color = when (tint) {
    "evt" -> C.evt
    "blue" -> C.blue
    "violet" -> lerp(C.evt, C.blue, 0.5f)
    "ember" -> lerp(C.music, C.evt, 0.45f)
    else -> C.amb
}

/** A story cover: the ground (the theme card, a halo of the tint, a soft vignette), the motif fitted in the middle,
 * a thin frame when big enough. rightHalf: the motif sits in the right half (the hero card writes on the left). */
@Composable
fun StoryCover(look: CoverLook, modifier: Modifier = Modifier, framed: Boolean = true, rightHalf: Boolean = false, ground: Boolean = true) {
    val c = tintColor(look.tint)
    val line = C.accent
    val pale = lerp(C.accent, C.text, 0.45f)
    val card = C.card
    val ink = C.text
    val shade = C.bg
    val shapes = Covers.MOTIFS[look.kind] ?: Covers.MOTIFS.getValue("bard")
    fun paintOf(role: Int): Color = when (role) {
        1 -> c
        2 -> line
        3 -> pale
        4 -> card
        else -> ink
    }
    Box(modifier) {
        Canvas(Modifier.fillMaxSize()) {
            val x0 = if (rightHalf) size.width / 2f else 0f
            val w = size.width - x0
            val h = size.height
            if (ground) {
                drawRect(card)
                drawRect(
                    Brush.radialGradient(
                        0.55f to Color.Transparent, 1f to shade.copy(alpha = 0.55f),
                        center = Offset(size.width / 2f, h / 2f), radius = maxOf(size.width, h) * 0.75f,
                    )
                )
            }
            drawRect(
                Brush.radialGradient(
                    0f to c.copy(alpha = 0.22f), 0.55f to c.copy(alpha = 0.06f), 1f to Color.Transparent,
                    center = Offset(x0 + w / 2f, h / 2f), radius = maxOf(w * 0.42f, h * 0.7f),
                )
            )
            val k = minOf(w / 320f, h / 140f)
            translate(x0 + (w - 320f * k) / 2f, (h - 140f * k) / 2f) {
                scale(k, k, pivot = Offset.Zero) {
                    shapes.forEach { s ->
                        translate(s.tx, s.ty) {
                            rotate(s.rot, pivot = Offset.Zero) {
                                scale(s.sc, s.sc, pivot = Offset.Zero) {
                                    if (s.fill != 0) drawPath(s.path, paintOf(s.fill), alpha = s.fillA, style = Fill)
                                    if (s.stroke != 0) drawPath(
                                        s.path, paintOf(s.stroke), alpha = s.strokeA,
                                        style = Stroke(
                                            width = s.width, cap = StrokeCap.Round, join = StrokeJoin.Round,
                                            pathEffect = s.dash?.let { PathEffect.dashPathEffect(it) },
                                        ),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        if (framed) Box(Modifier.fillMaxSize().padding(6.dp).border(1.dp, line.copy(alpha = 0.22f), RoundedCornerShape(9.dp)))
    }
}
'''

if __name__ == '__main__':
    write()
