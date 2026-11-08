/* Troubadour Map: the library of drawings (lake, mountains, forest...), drawn in ink on the map.
 *
 *   MapStamps.LIST            [{ id, label }]
 *   MapStamps.draw(ctx, id, size, pal)   draws the stamp centred on (0, 0), `size` units wide
 *
 * `pal` holds the colours of the map: { ink, ground, water, leaf, fire, stone, accent, hole }.
 * Every drawing is made of simple paths, so it stays sharp at any zoom.
 */
(function (global) {
  'use strict';

  const LIST = [
    { id: 'lake', label: 'Lake' }, { id: 'mountains', label: 'Mountains' }, { id: 'hill', label: 'Hills' },
    { id: 'forest', label: 'Forest' }, { id: 'tree', label: 'Tree' }, { id: 'swamp', label: 'Swamp' },
    { id: 'rocks', label: 'Rocks' }, { id: 'fire', label: 'Campfire' }, { id: 'tower', label: 'Tower' },
    { id: 'ruins', label: 'Ruins' }, { id: 'cave', label: 'Cave' }, { id: 'stairs', label: 'Stairs' },
    { id: 'door', label: 'Door' }, { id: 'bridge', label: 'Bridge' }, { id: 'tent', label: 'Tent' },
    { id: 'well', label: 'Well' }, { id: 'altar', label: 'Altar' }, { id: 'grave', label: 'Grave' },
  ];

  /** A small seeded random, so a stamp looks the same every time it is drawn. */
  function rng(seed) {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /** A closed blob through n points around (cx, cy), radius r, wobble w (0 to 1). */
  function blob(ctx, cx, cy, rx, ry, n, w, rand) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 - w / 2 + rand() * w;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (i === 0) { const z = pts[n - 1]; ctx.moveTo((z[0] + p[0]) / 2, (z[1] + p[1]) / 2); }
      ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    ctx.closePath();
  }

  function crown(ctx, x, y, r, rand) { blob(ctx, x, y, r, r * 0.92, 7, 0.28, rand); }

  const D = {
    lake(c, s, p, rand) {
      blob(c, 0, 0, s * 0.48, s * 0.36, 11, 0.3, rand);
      c.fillStyle = p.water; c.fill(); c.stroke();
      c.globalAlpha = 0.55;
      [[-0.12, -0.06, 0.12], [0.1, 0.08, 0.09], [-0.02, 0.15, 0.07]].forEach(([x, y, w]) => {
        c.beginPath(); c.moveTo((x - w) * s, y * s); c.quadraticCurveTo(x * s, (y - 0.03) * s, (x + w) * s, y * s); c.stroke();
      });
      c.globalAlpha = 1;
    },
    mountains(c, s, p) {
      const peaks = [[-0.22, 0.3, 0.26, 0.62], [0.2, 0.32, 0.24, 0.5], [0, 0.34, 0.3, 0.8]];
      peaks.forEach(([x, base, half, h]) => {
        const top = base - h;
        c.beginPath(); c.moveTo((x - half) * s, base * s); c.lineTo(x * s, top * s); c.lineTo((x + half) * s, base * s); c.closePath();
        c.fillStyle = p.stone; c.fill(); c.stroke();
        // Shade on the right side.
        c.save(); c.globalAlpha = 0.5;
        for (let k = 1; k < 5; k++) {
          const t = k / 5;
          c.beginPath(); c.moveTo((x + half * t * 0.6) * s, (top + h * t * 0.6) * s); c.lineTo((x + half * t * 0.6 + 0.02) * s, (base - 0.02) * s); c.stroke();
        }
        c.restore();
        // Snow.
        c.beginPath(); c.moveTo((x - half * 0.28) * s, (top + h * 0.28) * s); c.lineTo(x * s, top * s); c.lineTo((x + half * 0.28) * s, (top + h * 0.28) * s);
        c.lineTo((x + half * 0.1) * s, (top + h * 0.22) * s); c.lineTo((x - half * 0.05) * s, (top + h * 0.3) * s); c.closePath();
        c.fillStyle = p.ground; c.fill(); c.stroke();
      });
    },
    hill(c, s, p) {
      [[-0.18, 0.18, 0.3, 0.32], [0.16, 0.24, 0.26, 0.24]].forEach(([x, base, half, h]) => {
        c.beginPath(); c.moveTo((x - half) * s, base * s); c.bezierCurveTo((x - half * 0.5) * s, (base - h) * s, (x + half * 0.5) * s, (base - h) * s, (x + half) * s, base * s);
        c.fillStyle = p.leaf; c.fill(); c.stroke();
        c.save(); c.globalAlpha = 0.5;
        for (let k = 0; k < 3; k++) { const t = 0.15 + k * 0.12; c.beginPath(); c.moveTo((x + half * t) * s, (base - h * 0.45 + k * 0.03) * s); c.lineTo((x + half * t + 0.03) * s, (base - h * 0.3 + k * 0.03) * s); c.stroke(); }
        c.restore();
      });
    },
    forest(c, s, p, rand) {
      const spots = [];
      for (let i = 0; i < 11; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.32;
        spots.push([Math.cos(a) * d, Math.sin(a) * d * 0.8, 0.09 + rand() * 0.05]);
      }
      spots.sort((a, b) => a[1] - b[1]).forEach(([x, y, r]) => {
        c.beginPath(); c.moveTo(x * s, (y + r * 0.6) * s); c.lineTo(x * s, (y + r * 1.4) * s); c.stroke();
        crown(c, x * s, y * s, r * s, rand); c.fillStyle = p.leaf; c.fill(); c.stroke();
      });
    },
    tree(c, s, p, rand) {
      c.beginPath(); c.moveTo(-0.04 * s, 0.42 * s); c.lineTo(-0.03 * s, 0.05 * s); c.lineTo(0.03 * s, 0.05 * s); c.lineTo(0.04 * s, 0.42 * s); c.closePath();
      c.fillStyle = p.stone; c.fill(); c.stroke();
      crown(c, 0, -0.12 * s, 0.32 * s, rand); c.fillStyle = p.leaf; c.fill(); c.stroke();
    },
    swamp(c, s, p, rand) {
      blob(c, 0, 0.05 * s, 0.46 * s, 0.3 * s, 10, 0.35, rand);
      c.fillStyle = p.water; c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const y = (-0.08 + i * 0.08) * s;
        c.beginPath(); c.moveTo(-0.3 * s, y); c.lineTo(-0.1 * s, y); c.moveTo(0.02 * s, y + 0.02 * s); c.lineTo(0.26 * s, y + 0.02 * s); c.stroke();
      }
      [[-0.22, -0.02], [0.18, 0.12], [0.05, -0.12], [-0.05, 0.2]].forEach(([x, y]) => {
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(x * s, y * s); c.lineTo((x + k * 0.04) * s, (y - 0.12 + Math.abs(k) * 0.03) * s); c.stroke(); }
      });
    },
    rocks(c, s, p, rand) {
      [[-0.18, 0.08, 0.17], [0.14, 0.12, 0.13], [0, -0.12, 0.15], [0.24, -0.1, 0.08]].forEach(([x, y, r]) => {
        c.beginPath();
        const n = 6;
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rand(); const k = 0.75 + rand() * 0.3; const px = (x + Math.cos(a) * r * k) * s, py = (y + Math.sin(a) * r * k * 0.8) * s; i ? c.lineTo(px, py) : c.moveTo(px, py); }
        c.closePath(); c.fillStyle = p.stone; c.fill(); c.stroke();
      });
    },
    fire(c, s, p) {
      c.beginPath(); c.moveTo(-0.3 * s, 0.3 * s); c.lineTo(0.3 * s, 0.14 * s); c.moveTo(-0.3 * s, 0.14 * s); c.lineTo(0.3 * s, 0.3 * s); c.stroke();
      c.beginPath(); c.moveTo(0, -0.4 * s);
      c.bezierCurveTo(0.2 * s, -0.15 * s, 0.26 * s, 0.05 * s, 0.14 * s, 0.2 * s);
      c.bezierCurveTo(0.06 * s, 0.28 * s, -0.06 * s, 0.28 * s, -0.14 * s, 0.2 * s);
      c.bezierCurveTo(-0.26 * s, 0.05 * s, -0.14 * s, -0.1 * s, -0.04 * s, -0.16 * s);
      c.bezierCurveTo(-0.04 * s, -0.24 * s, -0.02 * s, -0.32 * s, 0, -0.4 * s);
      c.fillStyle = p.fire; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(0.02 * s, -0.12 * s); c.bezierCurveTo(0.1 * s, 0, 0.1 * s, 0.12 * s, 0, 0.18 * s); c.bezierCurveTo(-0.08 * s, 0.12 * s, -0.06 * s, 0.02 * s, 0.02 * s, -0.12 * s);
      c.fillStyle = p.accent; c.fill();
    },
    tower(c, s, p) {
      c.beginPath();
      c.moveTo(-0.18 * s, 0.42 * s); c.lineTo(-0.15 * s, -0.22 * s); c.lineTo(-0.22 * s, -0.22 * s); c.lineTo(-0.22 * s, -0.4 * s);
      [-0.22, -0.13, -0.04, 0.05, 0.14].forEach((x, i) => { c.lineTo((x) * s, -0.4 * s); c.lineTo((x + 0.045) * s, -0.4 * s); c.lineTo((x + 0.045) * s, (i < 4 ? -0.33 : -0.4) * s); c.lineTo((x + 0.09) * s, (i < 4 ? -0.33 : -0.4) * s); });
      c.lineTo(0.22 * s, -0.4 * s); c.lineTo(0.22 * s, -0.22 * s); c.lineTo(0.15 * s, -0.22 * s); c.lineTo(0.18 * s, 0.42 * s); c.closePath();
      c.fillStyle = p.stone; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-0.04 * s, -0.04 * s); c.lineTo(-0.04 * s, -0.12 * s); c.arc(0, -0.12 * s, 0.04 * s, Math.PI, 0); c.lineTo(0.04 * s, -0.04 * s); c.closePath(); c.fillStyle = p.hole; c.fill();
      c.beginPath(); c.moveTo(-0.07 * s, 0.42 * s); c.lineTo(-0.07 * s, 0.26 * s); c.arc(0, 0.26 * s, 0.07 * s, Math.PI, 0); c.lineTo(0.07 * s, 0.42 * s); c.fill();
    },
    ruins(c, s, p) {
      const piece = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x * s, y * s) : c.moveTo(x * s, y * s))); c.closePath(); c.fillStyle = p.stone; c.fill(); c.stroke(); };
      piece([[-0.4, 0.3], [-0.4, -0.2], [-0.3, -0.26], [-0.26, -0.08], [-0.18, -0.14], [-0.14, 0.3]]);
      piece([[-0.02, 0.3], [-0.02, -0.34], [0.06, -0.38], [0.12, -0.3], [0.12, 0.3]]);
      piece([[0.24, 0.3], [0.24, 0.02], [0.32, -0.04], [0.4, 0.06], [0.4, 0.3]]);
      c.beginPath(); c.moveTo(-0.46 * s, 0.32 * s); c.lineTo(0.46 * s, 0.32 * s); c.stroke();
      [[-0.08, 0.26], [0.2, 0.24], [0.44, 0.22]].forEach(([x, y]) => { c.beginPath(); c.rect(x * s, y * s, 0.05 * s, 0.05 * s); c.fill(); c.stroke(); });
    },
    cave(c, s, p, rand) {
      blob(c, 0, 0.02 * s, 0.46 * s, 0.38 * s, 9, 0.22, rand); c.fillStyle = p.stone; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-0.2 * s, 0.32 * s); c.bezierCurveTo(-0.22 * s, -0.08 * s, -0.1 * s, -0.18 * s, 0, -0.18 * s);
      c.bezierCurveTo(0.1 * s, -0.18 * s, 0.22 * s, -0.08 * s, 0.2 * s, 0.32 * s); c.closePath(); c.fillStyle = p.hole; c.fill(); c.stroke();
    },
    stairs(c, s, p) {
      c.beginPath(); c.rect(-0.3 * s, -0.42 * s, 0.6 * s, 0.84 * s); c.fillStyle = p.stone; c.fill(); c.stroke();
      for (let i = 1; i < 7; i++) { const y = (-0.42 + i * 0.12) * s; c.beginPath(); c.moveTo(-0.3 * s, y); c.lineTo(0.3 * s, y); c.stroke(); }
      c.beginPath(); c.moveTo(0, -0.3 * s); c.lineTo(0, 0.24 * s); c.moveTo(-0.08 * s, 0.14 * s); c.lineTo(0, 0.24 * s); c.lineTo(0.08 * s, 0.14 * s); c.stroke();
    },
    door(c, s, p) {
      c.beginPath(); c.moveTo(-0.26 * s, 0.42 * s); c.lineTo(-0.26 * s, -0.1 * s); c.arc(0, -0.1 * s, 0.26 * s, Math.PI, 0); c.lineTo(0.26 * s, 0.42 * s); c.closePath();
      c.fillStyle = p.stone; c.fill(); c.stroke();
      [-0.12, 0, 0.12].forEach((x) => { c.beginPath(); c.moveTo(x * s, -0.32 * s); c.lineTo(x * s, 0.42 * s); c.stroke(); });
      c.beginPath(); c.arc(0.16 * s, 0.1 * s, 0.03 * s, 0, Math.PI * 2); c.fillStyle = p.ink; c.fill();
    },
    bridge(c, s, p) {
      c.beginPath(); c.rect(-0.44 * s, -0.16 * s, 0.88 * s, 0.32 * s); c.fillStyle = p.stone; c.fill();
      for (let i = 0; i < 9; i++) { const x = (-0.4 + i * 0.1) * s; c.beginPath(); c.moveTo(x, -0.16 * s); c.lineTo(x, 0.16 * s); c.stroke(); }
      [-0.16, 0.16].forEach((y) => { c.beginPath(); c.moveTo(-0.48 * s, y * s); c.quadraticCurveTo(0, (y * 1.6) * s, 0.48 * s, y * s); c.stroke(); });
    },
    tent(c, s, p) {
      c.beginPath(); c.moveTo(-0.42 * s, 0.34 * s); c.lineTo(0, -0.36 * s); c.lineTo(0.42 * s, 0.34 * s); c.closePath(); c.fillStyle = p.fire; c.globalAlpha = 0.75; c.fill(); c.globalAlpha = 1; c.stroke();
      c.beginPath(); c.moveTo(0, -0.36 * s); c.lineTo(-0.1 * s, 0.34 * s); c.lineTo(0.1 * s, 0.34 * s); c.closePath(); c.fillStyle = p.hole; c.fill();
      c.beginPath(); c.moveTo(0, -0.36 * s); c.lineTo(0, -0.46 * s); c.lineTo(0.12 * s, -0.42 * s); c.lineTo(0, -0.38 * s); c.stroke();
    },
    well(c, s, p) {
      c.beginPath(); c.ellipse(0, 0.22 * s, 0.3 * s, 0.12 * s, 0, 0, Math.PI * 2); c.fillStyle = p.stone; c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, 0.22 * s, 0.2 * s, 0.07 * s, 0, 0, Math.PI * 2); c.fillStyle = p.water; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-0.24 * s, 0.2 * s); c.lineTo(-0.24 * s, -0.2 * s); c.moveTo(0.24 * s, 0.2 * s); c.lineTo(0.24 * s, -0.2 * s); c.stroke();
      c.beginPath(); c.moveTo(-0.36 * s, -0.16 * s); c.lineTo(0, -0.42 * s); c.lineTo(0.36 * s, -0.16 * s); c.closePath(); c.fillStyle = p.fire; c.fill(); c.stroke();
    },
    altar(c, s, p) {
      c.beginPath(); c.rect(-0.36 * s, -0.02 * s, 0.72 * s, 0.14 * s); c.rect(-0.26 * s, 0.12 * s, 0.52 * s, 0.26 * s); c.fillStyle = p.stone; c.fill(); c.stroke();
      [-0.24, 0.24].forEach((x) => {
        c.beginPath(); c.rect((x - 0.03) * s, -0.2 * s, 0.06 * s, 0.18 * s); c.fillStyle = p.ground; c.fill(); c.stroke();
        c.beginPath(); c.ellipse(x * s, -0.25 * s, 0.025 * s, 0.05 * s, 0, 0, Math.PI * 2); c.fillStyle = p.fire; c.fill();
      });
    },
    grave(c, s, p) {
      c.beginPath(); c.moveTo(-0.2 * s, 0.36 * s); c.lineTo(-0.2 * s, -0.12 * s); c.arc(0, -0.12 * s, 0.2 * s, Math.PI, 0); c.lineTo(0.2 * s, 0.36 * s); c.closePath();
      c.fillStyle = p.stone; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(0, -0.22 * s); c.lineTo(0, 0.08 * s); c.moveTo(-0.09 * s, -0.12 * s); c.lineTo(0.09 * s, -0.12 * s); c.stroke();
      c.beginPath(); c.moveTo(-0.36 * s, 0.38 * s); c.quadraticCurveTo(0, 0.3 * s, 0.36 * s, 0.38 * s); c.stroke();
    },
  };

  /* ---------- Places made by the troubadour (world.stamps): strokes in ink, colours dropped inside them ----------
   * A place is { id, name, strokes: [[[x, y], ...], ...], fills: [{ x, y, c }] }, points from 0 to 1 in its square.
   * `c` names a colour of the map (water, leaf, stone...), so a place follows the theme. It is painted once on a
   * canvas of its own (cached for the theme of the moment), then laid on the map like the other drawings. */
  const FILLS = [['water', 'Water'], ['leaf', 'Grass'], ['stone', 'Stone'], ['ground', 'Ground'], ['fire', 'Fire'], ['ambience', 'Teal'], ['events', 'Red'], ['soundbox', 'Blue'], ['music', 'Gold'], ['hole', 'Dark']];
  const RES = 512;
  const custom = new Map();
  const cache = new Map();
  const isCustom = (id) => custom.has(id);
  function register(list) { (list || []).forEach((st) => { if (st && st.id) { custom.set(st.id, st); } }); }
  function forget(id) { custom.delete(id); }
  function rgbOf(c) {
    c = String(c || '').trim();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
    m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(c);
    if (m) return [m[1], m[2], m[3]].map((x) => Math.round(Number(x) * 255));
    m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) return m[1].split(/[ ,]+/).slice(0, 3).map(Number);
    return [128, 128, 128];
  }
  function inkLayer(st, ink) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = RES;
    const c = cv.getContext('2d');
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = RES * 0.022;
    (st.strokes || []).forEach((pts) => {
      if (!pts.length) return;
      if (pts.length === 1) { c.beginPath(); c.arc(pts[0][0] * RES, pts[0][1] * RES, c.lineWidth / 2, 0, Math.PI * 2); c.fill(); return; }
      c.beginPath();
      pts.forEach((q, i) => (i ? c.lineTo(q[0] * RES, q[1] * RES) : c.moveTo(q[0] * RES, q[1] * RES)));
      c.stroke();
    });
    return cv;
  }
  /** The region around a point, bounded by the ink: a mask of RES x RES, or null when it reaches the edge (not closed). */
  function region(alpha, x, y) {
    const sx = Math.max(0, Math.min(RES - 1, Math.round(x * RES))), sy = Math.max(0, Math.min(RES - 1, Math.round(y * RES)));
    const open = (i) => alpha[i] < 110;
    const start = sy * RES + sx;
    if (!open(start)) return null;
    const mask = new Uint8Array(RES * RES);
    const stack = [start];
    mask[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const px = i % RES, py = (i - px) / RES;
      if (px === 0 || py === 0 || px === RES - 1 || py === RES - 1) return null;
      const n = [i - 1, i + 1, i - RES, i + RES];
      for (const j of n) if (!mask[j] && open(j)) { mask[j] = 1; stack.push(j); }
    }
    return mask;
  }
  function alphaOf(st) {
    const d = inkLayer(st, '#000').getContext('2d').getImageData(0, 0, RES, RES).data;
    const a = new Uint8Array(RES * RES);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return a;
  }
  /** Drops colour `c` at (x, y): the fills of the place after it, or null when the point is not inside a closed shape. */
  function fillAt(st, x, y, c) {
    const alpha = alphaOf(st);
    const mask = region(alpha, x, y);
    if (!mask) return null;
    const at = (f) => mask[Math.max(0, Math.min(RES - 1, Math.round(f.y * RES))) * RES + Math.max(0, Math.min(RES - 1, Math.round(f.x * RES)))];
    return (st.fills || []).filter((f) => !at(f)).concat([{ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, c }]);
  }
  /** The place painted with the colours of `pal`, as a canvas (cached). */
  function picture(st, pal) {
    const key = `${st.id}|${st.v || 0}|${pal.ink}|${FILLS.map(([k]) => pal[k]).join('|')}`;
    if (cache.has(key)) return cache.get(key);
    const ink = inkLayer(st, pal.ink);
    const out = document.createElement('canvas');
    out.width = out.height = RES;
    const c = out.getContext('2d');
    if ((st.fills || []).length) {
      const alpha = alphaOf(st);
      const img = c.createImageData(RES, RES);
      const d = img.data;
      st.fills.forEach((f) => {
        const mask = region(alpha, f.x, f.y);
        if (!mask) return;
        const [r, g, b] = rgbOf(pal[f.c] || pal.stone);
        // The colour runs under the ink a little, so no seam shows along the lines.
        for (let i = 0; i < mask.length; i++) {
          if (!mask[i]) continue;
          for (const j of [i, i - 1, i + 1, i - RES, i + RES, i - 2, i + 2, i - 2 * RES, i + 2 * RES]) {
            if (j < 0 || j >= mask.length) continue;
            d[j * 4] = r; d[j * 4 + 1] = g; d[j * 4 + 2] = b; d[j * 4 + 3] = 255;
          }
        }
      });
      c.putImageData(img, 0, 0);
    }
    c.drawImage(ink, 0, 0);
    if (cache.size > 80) cache.clear();
    cache.set(key, out);
    return out;
  }

  function draw(ctx, id, size, pal) {
    if (custom.has(id)) {
      const full = Object.assign({ hole: '#17130F' }, pal);
      ctx.save();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(picture(custom.get(id), full), -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = pal.ink;
    pal = Object.assign({ hole: '#17130F' }, pal);
    ctx.lineWidth = Math.max(1.2, size * 0.018);
    const fn = D[id];
    if (fn) fn(ctx, size, pal, rng(id));
    else { ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  global.MapStamps = { LIST, draw, FILLS, register, forget, isCustom, custom: (id) => custom.get(id), fillAt, picture };
})(window);
