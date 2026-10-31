/* Troubadour Map: the map on screen, its drawing tools and the player point.
 *
 *   MapView.mount(canvas)
 *   MapView.show(place, world)       draws a place and fits it to the screen
 *   MapView.setMode('edit' | 'play') MapView.setTool(id)  MapView.setStamp(id)
 *   MapView.select(element | null)   MapView.fit()  MapView.undo()  MapView.redraw()
 *   callbacks: onSelect(el), onEdit() (the place changed: save it), onTap(el), onPlayer(point), onTool(id)
 *
 * Tools (edit): select (move elements and the player point), wall, pen (a shape: closed when it ends near
 * its start, else a line), stamp (a drawing of the library), eraser, hand (move the map).
 * At the table (play): drag the player point, or tap the map to send it there; tap an element to open it.
 * Everywhere: wheel or pinch to zoom, two fingers, the middle button or Space to move the map.
 */
(function (global) {
  'use strict';

  const M = global.TroubadourMap;
  const S = global.MapStamps;

  let cv = null, ctx = null, place = null, world = null;
  let mode = 'edit', tool = 'pen', stamp = 'lake', selected = null;
  let view = { x: 0, y: 0, k: 1 };
  let dpr = 1, W = 0, H = 0, dirty = true;
  let pal = null;
  const undoStack = [];
  const api = { onSelect: null, onEdit: null, onTap: null, onPlayer: null, onTool: null };

  /* ---------- Colours of the map, from the theme ---------- */
  function hex(c) {
    c = String(c || '').trim();
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
    const r = /rgba?\(([^)]+)\)/.exec(c);
    if (r) return r[1].split(',').slice(0, 3).map((x) => Number(x));
    return [128, 128, 128];
  }
  const mix = (a, b, t) => { const p = hex(a), q = hex(b); return `rgb(${p.map((v, i) => Math.round(v * (1 - t) + q[i] * t)).join(',')})`; };
  const alpha = (a, t) => `rgba(${hex(a).join(',')},${t})`;
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    const card = v('--card'), text = v('--text');
    pal = {
      bg: v('--bg'), paper: card, line: v('--line'), ink: mix(text, card, 0.12), muted: v('--muted'), accent: v('--accent'),
      music: v('--music'), ambience: v('--amb'), events: v('--evt'), soundbox: v('--blue') || v('--accent'),
      ground: card, water: mix(v('--amb'), card, 0.55), leaf: mix('#6E9A4A', card, 0.45), fire: mix(v('--music'), card, 0.15),
      stone: mix(text, card, 0.82),
    };
    dirty = true;
  }

  /* ---------- Coordinates ---------- */
  const toWorld = (sx, sy) => [(sx - view.x) / view.k, (sy - view.y) / view.k];
  const toScreen = (p) => [p[0] * view.k + view.x, p[1] * view.k + view.y];
  function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  let needFit = false;
  function fit() {
    if (!place || W < 50 || H < 50) { needFit = true; return; }
    needFit = false;
    // Room for the tools on the left while drawing.
    const m = 24, left = mode === 'edit' && W > 600 ? 70 : m;
    const k = Math.min((W - m - left) / place.width, (H - m * 2) / place.height);
    view = { k, x: left + (W - m - left - place.width * k) / 2, y: (H - place.height * k) / 2 };
    dirty = true;
  }
  function zoomAt(sx, sy, f) {
    const k = Math.max(0.05, Math.min(8, view.k * f));
    const [wx, wy] = toWorld(sx, sy);
    view.k = k; view.x = sx - wx * k; view.y = sy - wy * k;
    dirty = true;
  }

  /* ---------- Hit tests ---------- */
  function nearPath(p, pts, closed, tol) {
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) if (M.nearestOnSegment(p, pts[i], pts[(i + 1) % pts.length]).d2 <= tol * tol) return true;
    return pts.length === 1 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= tol;
  }
  function elementAt(p) {
    const tol = 12 / view.k;
    for (let i = place.elements.length - 1; i >= 0; i--) {
      const e = place.elements[i], s = e.shape;
      if (s.type === 'stamp') { if (Math.hypot(p[0] - s.x, p[1] - s.y) <= s.size / 2 + tol * 0.5) return e; }
      else if ((s.closed && M.inside(p, s.points)) || nearPath(p, s.points, s.closed, tol)) return e;
    }
    return null;
  }
  function wallAt(p) {
    const tol = 12 / view.k;
    for (let i = place.walls.length - 1; i >= 0; i--) if (nearPath(p, place.walls[i].points, false, tol)) return place.walls[i];
    return null;
  }
  function onPlayer(sx, sy) { const q = toScreen(place.player); return Math.hypot(sx - q[0], sy - q[1]) <= 26; }

  /* ---------- Undo ---------- */
  function snapshot() {
    undoStack.push(JSON.stringify({ walls: place.walls, elements: place.elements, player: place.player }));
    if (undoStack.length > 60) undoStack.shift();
  }
  function undo() {
    const s = undoStack.pop();
    if (!s || !place) return false;
    const o = JSON.parse(s);
    place.walls = o.walls; place.elements = o.elements; place.player = o.player;
    if (selected) select(place.elements.find((e) => e.id === selected.id) || null);
    edited();
    return true;
  }
  function edited() { dirty = true; if (api.onEdit) api.onEdit(); }

  /* ---------- Pointer input ---------- */
  const pointers = new Map();
  let gesture = null; // { kind, ... }
  let spaceDown = false;

  function down(e) {
    if (!place) return;
    cv.setPointerCapture(e.pointerId);
    const s = local(e);
    pointers.set(e.pointerId, s);
    if (pointers.size === 2) {
      // Two fingers: whatever was being drawn is dropped, the map moves and zooms.
      if (gesture && gesture.kind === 'stroke') gesture = null;
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      dirty = true;
      return;
    }
    if (pointers.size > 2) return;
    const w = toWorld(s[0], s[1]);
    const panning = e.button === 1 || e.button === 2 || spaceDown || (mode === 'edit' && tool === 'hand');
    if (panning) { gesture = { kind: 'pan', last: s }; cv.classList.add('grabbing'); return; }

    if (mode === 'play') {
      if (onPlayer(s[0], s[1])) { gesture = { kind: 'player', moved: true }; cv.classList.add('grabbing'); return; }
      gesture = { kind: 'tap', start: s, last: s, el: elementAt(w) };
      return;
    }
    // Edit
    if (tool === 'select') {
      if (onPlayer(s[0], s[1])) { snapshot(); gesture = { kind: 'player' }; cv.classList.add('grabbing'); return; }
      const el = elementAt(w);
      if (el) { select(el); snapshot(); gesture = { kind: 'move', el, last: w, moved: false }; cv.classList.add('grabbing'); return; }
      select(null);
      gesture = { kind: 'pan', last: s };
      return;
    }
    if (tool === 'wall' || tool === 'pen') { gesture = { kind: 'stroke', tool, pts: [w], shift: e.shiftKey }; dirty = true; return; }
    if (tool === 'stamp') {
      snapshot();
      const el = M.cleanElement({ id: M.shortId(), title: '', radius: 200, cards: [], shape: { type: 'stamp', stamp, x: w[0], y: w[1], size: Math.round(Math.max(120, Math.min(600, 110 / view.k)) / 10) * 10, rotation: 0 } }, place.width, place.height);
      place.elements.push(el);
      select(el);
      edited();
      gesture = { kind: 'move', el, last: w, moved: false };
      return;
    }
    if (tool === 'eraser') { gesture = { kind: 'erase', took: false }; erase(w, gesture); return; }
  }

  function move(e) {
    if (!pointers.has(e.pointerId)) { hover(e); return; }
    const s = local(e);
    pointers.set(e.pointerId, s);
    if (!gesture) return;
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      view.x += c[0] - gesture.c[0]; view.y += c[1] - gesture.c[1];
      if (gesture.d > 0) zoomAt(c[0], c[1], d / gesture.d);
      gesture.d = d; gesture.c = c;
      dirty = true;
      return;
    }
    const w = toWorld(s[0], s[1]);
    switch (gesture.kind) {
      case 'pan':
        view.x += s[0] - gesture.last[0]; view.y += s[1] - gesture.last[1]; gesture.last = s; dirty = true; break;
      case 'tap':
        if (Math.hypot(s[0] - gesture.start[0], s[1] - gesture.start[1]) > 6) gesture.panning = true;
        if (gesture.panning) { view.x += s[0] - gesture.last[0]; view.y += s[1] - gesture.last[1]; dirty = true; }
        gesture.last = s; break;
      case 'player':
        place.player = clampPoint(w);
        dirty = true;
        if (api.onPlayer) api.onPlayer(place.player);
        break;
      case 'move': {
        const dx = w[0] - gesture.last[0], dy = w[1] - gesture.last[1];
        gesture.last = w; gesture.moved = true;
        const sh = gesture.el.shape;
        if (sh.type === 'stamp') { sh.x += dx; sh.y += dy; } else sh.points.forEach((p) => { p[0] += dx; p[1] += dy; });
        dirty = true;
        break;
      }
      case 'stroke': {
        const last = gesture.pts[gesture.pts.length - 1];
        if (Math.hypot(w[0] - last[0], w[1] - last[1]) * view.k > 3) gesture.pts.push(w);
        gesture.shift = gesture.shift || e.shiftKey;
        dirty = true;
        break;
      }
      case 'erase': erase(w, gesture); break;
      default:
    }
  }

  function up(e) {
    pointers.delete(e.pointerId);
    cv.classList.remove('grabbing');
    if (!gesture) return;
    if (gesture.kind === 'pinch') { if (pointers.size < 2) gesture = null; return; }
    const g = gesture;
    gesture = null;
    if (g.kind === 'tap' && !g.panning) {
      if (g.el) { if (api.onTap) api.onTap(g.el); }
      else glidePlayer(toWorld(g.start[0], g.start[1]));
    } else if (g.kind === 'player') {
      edited();
    } else if (g.kind === 'move') {
      const sh = g.el.shape;
      if (sh.type === 'stamp') { sh.x = Math.round(sh.x); sh.y = Math.round(sh.y); } else sh.points.forEach((p) => { p[0] = Math.round(p[0]); p[1] = Math.round(p[1]); });
      if (g.moved || tool === 'stamp') edited(); else undoStack.pop();
    } else if (g.kind === 'stroke') finishStroke(g);
    dirty = true;
  }

  function finishStroke(g) {
    let pts = g.pts;
    if (g.tool === 'wall') {
      pts = g.shift ? [pts[0], pts[pts.length - 1]] : M.simplify(pts, 7);
      if (pts.length < 2 || Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 8 && pts.length === 2) return;
      snapshot();
      place.walls.push({ points: pts.map((p) => [Math.round(p[0]), Math.round(p[1])]) });
      edited();
      return;
    }
    pts = M.simplify(pts, 3);
    if (pts.length < 2) return;
    // A shape that ends near where it began is closed: an area. Otherwise it is a line (a river, a road).
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < 12) return;
    const gap = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    const closed = pts.length > 2 && gap < Math.max(30 / view.k, len * 0.15);
    if (closed && gap < 2) pts.pop();
    snapshot();
    const el = M.cleanElement({ id: M.shortId(), title: '', radius: 200, cards: [], shape: { type: 'path', closed, points: pts } }, place.width, place.height);
    place.elements.push(el);
    select(el);
    edited();
  }

  function erase(w, g) {
    const el = elementAt(w);
    const wall = el ? null : wallAt(w);
    if (!el && !wall) return;
    snapshot();
    if (el) { place.elements.splice(place.elements.indexOf(el), 1); if (selected === el) select(null); }
    else place.walls.splice(place.walls.indexOf(wall), 1);
    g.took = true;
    edited();
  }

  function clampPoint(p) { return [Math.round(Math.max(0, Math.min(place.width, p[0]))), Math.round(Math.max(0, Math.min(place.height, p[1])))]; }

  /** At the table, a tap on the map sends the party there: a short glide, so the sounds glide with it. */
  let glide = 0;
  function glidePlayer(to) {
    if (!place) return;
    to = clampPoint(to);
    const from = place.player.slice(), t0 = performance.now(), ms = 450;
    cancelAnimationFrame(glide);
    const step = (t) => {
      const u = Math.min(1, (t - t0) / ms), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      place.player = [Math.round(from[0] + (to[0] - from[0]) * e), Math.round(from[1] + (to[1] - from[1]) * e)];
      dirty = true;
      if (api.onPlayer) api.onPlayer(place.player);
      if (u < 1) glide = requestAnimationFrame(step); else edited();
    };
    glide = requestAnimationFrame(step);
  }

  function hover(e) {
    if (!place) return;
    const s = local(e);
    const w = toWorld(s[0], s[1]);
    let cur = '';
    if (spaceDown || (mode === 'edit' && tool === 'hand')) cur = 'grab';
    else if (onPlayer(s[0], s[1]) && (mode === 'play' || tool === 'select')) cur = 'grab';
    else if (mode === 'play') cur = elementAt(w) ? 'pointer' : 'crosshair';
    else if (tool === 'select') cur = elementAt(w) ? 'move' : 'default';
    else if (tool === 'eraser') cur = elementAt(w) || wallAt(w) ? 'pointer' : 'default';
    else cur = 'crosshair';
    cv.style.cursor = cur;
  }

  function wheel(e) {
    if (!place) return;
    e.preventDefault();
    const s = local(e);
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(s[0], s[1], Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    else { view.x -= e.deltaX; view.y -= e.deltaY; dirty = true; }
  }

  /* ---------- Drawing ---------- */
  function tracePath(pts, closed) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    if (closed) ctx.closePath();
  }
  const zoneColour = (el) => (el.cards[0] ? pal[el.cards[0].zone] || pal.accent : pal.ink);

  /** The ground an element's sounds reach: the shape grown by its radius. */
  function drawReach(el, strength) {
    const c = zoneColour(el), sh = el.shape;
    ctx.save();
    ctx.fillStyle = alpha(c, 0.06 + 0.16 * strength);
    ctx.strokeStyle = ctx.fillStyle;
    if (sh.type === 'stamp') { ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.size / 2 + el.radius, 0, Math.PI * 2); ctx.fill(); }
    else if (el.radius > 0) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.lineWidth = el.radius * 2;
      tracePath(sh.points, sh.closed);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawElement(el, heard) {
    const sh = el.shape;
    const c = zoneColour(el);
    ctx.save();
    if (sh.type === 'stamp') {
      ctx.translate(sh.x, sh.y);
      ctx.rotate((sh.rotation * Math.PI) / 180);
      S.draw(ctx, sh.stamp, sh.size, pal);
    } else {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      tracePath(sh.points, sh.closed);
      if (sh.closed) { ctx.fillStyle = el.cards.length ? alpha(c, 0.22) : alpha(pal.ink, 0.06); ctx.fill(); }
      ctx.strokeStyle = el.cards.length ? mix(c, pal.ink, 0.35) : pal.ink;
      ctx.lineWidth = sh.closed ? 4 : 7;
      ctx.stroke();
    }
    ctx.restore();
    if (heard > 0.01) {
      ctx.save();
      ctx.strokeStyle = alpha(c, 0.25 + 0.55 * heard);
      ctx.lineWidth = 3 / view.k + 6 * heard / view.k;
      ctx.lineJoin = 'round';
      if (sh.type === 'stamp') { ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.size / 2 + 6 / view.k, 0, Math.PI * 2); }
      else tracePath(sh.points, sh.closed);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawWall(w, ghost) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    tracePath(w.points, false);
    ctx.strokeStyle = ghost ? alpha(pal.ink, 0.6) : pal.ink;
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.strokeStyle = mix(pal.ink, pal.paper, 0.55);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    dirty = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    if (!place) return;
    const audioOn = mode === 'play' && global.MapAudio && global.MapAudio.isOpen();
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);

    // The paper and its grid.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30 / view.k;
    ctx.fillStyle = pal.paper;
    ctx.fillRect(0, 0, place.width, place.height);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, place.width, place.height); ctx.clip();
    ctx.strokeStyle = alpha(pal.ink, 0.05);
    ctx.lineWidth = 1 / view.k;
    ctx.beginPath();
    for (let x = 100; x < place.width; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, place.height); }
    for (let y = 100; y < place.height; y += 100) { ctx.moveTo(0, y); ctx.lineTo(place.width, y); }
    ctx.stroke();

    // How far every sound reaches, then the elements, then the walls on top.
    const heard = new Map();
    place.elements.forEach((el) => {
      if (!el.cards.length) return;
      let h = 0;
      if (audioOn) {
        el.cards.forEach((c) => { const v = global.MapAudio.voice(c); if (v && v.state === 'playing') h = Math.max(h, v.heard); });
      }
      heard.set(el, h);
      const rings = mode === 'edit' || global.MapUI.settings.rings || el === selected;
      if (rings) drawReach(el, h);
    });
    place.elements.forEach((el) => drawElement(el, heard.get(el) || 0));
    place.walls.forEach((w) => drawWall(w));
    ctx.restore();

    // The line being drawn.
    if (gesture && gesture.kind === 'stroke') {
      const pts = gesture.tool === 'wall' && gesture.shift ? [gesture.pts[0], gesture.pts[gesture.pts.length - 1]] : gesture.pts;
      if (gesture.tool === 'wall') drawWall({ points: pts }, true);
      else { ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = pal.accent; ctx.lineWidth = 4; tracePath(pts, false); ctx.stroke(); ctx.restore(); }
    }

    // In screen pixels from here: labels, the selection, the player point.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 14px "Barlow Semi Condensed", system-ui, sans-serif';
    ctx.textAlign = 'center';
    place.elements.forEach((el) => {
      const b = M.bounds(el.shape);
      const [cx] = toScreen([(b[0] + b[2]) / 2, 0]);
      const [, by] = toScreen([0, b[3]]);
      const label = el.title || (el.cards.length ? el.cards.map((c) => c.name).slice(0, 2).join(', ') + (el.cards.length > 2 ? '…' : '') : '');
      if (label) {
        ctx.lineWidth = 4; ctx.strokeStyle = alpha(pal.paper, 0.9); ctx.fillStyle = pal.ink;
        ctx.strokeText(label, cx, by + 18); ctx.fillText(label, cx, by + 18);
      }
      if (el.link) {
        const [lx, ly] = toScreen([b[2], b[1]]);
        ctx.beginPath(); ctx.arc(lx, ly, 11, 0, Math.PI * 2); ctx.fillStyle = pal.accent; ctx.fill();
        ctx.strokeStyle = pal.bg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lx - 4, ly + 4); ctx.lineTo(lx + 4, ly - 4); ctx.moveTo(lx - 1, ly - 4); ctx.lineTo(lx + 4, ly - 4); ctx.lineTo(lx + 4, ly + 1); ctx.stroke();
      }
    });
    if (selected && mode === 'edit') {
      const b = M.bounds(selected.shape);
      const p = toScreen([b[0], b[1]]), q = toScreen([b[2], b[3]]);
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5;
      ctx.strokeRect(p[0] - 8, p[1] - 8, q[0] - p[0] + 16, q[1] - p[1] + 16); ctx.restore();
    }
    const [px, py] = toScreen(place.player);
    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fillStyle = alpha(pal.accent, 0.18); ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.fillStyle = pal.accent; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = pal.bg; ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = pal.bg; ctx.fill();
  }

  function loop() {
    if (dirty) draw();
    requestAnimationFrame(loop);
  }

  function resize() {
    const r = cv.parentNode.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(3, global.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    if (needFit) fit();
    dirty = true;
  }

  /** A small picture of a place, for the library. */
  function thumb(canvas, p) {
    if (!pal) readPalette();
    const r = canvas.getBoundingClientRect();
    const d = Math.min(2, global.devicePixelRatio || 1);
    const w = Math.max(60, r.width || 140), h = Math.max(60, r.height || 110);
    canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
    const c = canvas.getContext('2d');
    const k = Math.min((w - 12) / p.width, (h - 12) / p.height);
    const ox = (w - p.width * k) / 2, oy = (h - p.height * k) / 2;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.fillStyle = pal.bg; c.fillRect(0, 0, w, h);
    c.setTransform(d * k, 0, 0, d * k, d * ox, d * oy);
    c.fillStyle = pal.paper; c.fillRect(0, 0, p.width, p.height);
    c.lineJoin = 'round'; c.lineCap = 'round';
    p.elements.forEach((el) => {
      const sh = el.shape;
      if (sh.type === 'stamp') { c.save(); c.translate(sh.x, sh.y); c.rotate((sh.rotation * Math.PI) / 180); S.draw(c, sh.stamp, sh.size, pal); c.restore(); return; }
      c.beginPath(); sh.points.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); if (sh.closed) c.closePath();
      const z = el.cards[0] ? pal[el.cards[0].zone] || pal.accent : pal.ink;
      if (sh.closed) { c.fillStyle = alpha(z, 0.3); c.fill(); }
      c.strokeStyle = z; c.lineWidth = 6 / Math.max(k, 0.2) * 0.4; c.stroke();
    });
    c.strokeStyle = pal.ink; c.lineWidth = Math.max(14, 3 / k);
    p.walls.forEach((wl) => { c.beginPath(); wl.points.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); });
    c.fillStyle = pal.accent; c.beginPath(); c.arc(p.player[0], p.player[1], 5 / k, 0, Math.PI * 2); c.fill();
  }

  /* ---------- Public ---------- */
  function mount(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    readPalette();
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!pointers.size) cv.style.cursor = ''; });
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(resize).observe(cv.parentNode);
    document.addEventListener('keydown', (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
      if (e.code === 'Space' && mode === 'edit') { spaceDown = true; e.preventDefault(); }
    });
    document.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
    new MutationObserver(readPalette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });
    resize();
    loop();
  }
  function show(p, w) {
    place = p; world = w; selected = null; undoStack.length = 0;
    fit();
    dirty = true;
  }
  function setMode(m) { mode = m; if (m === 'play') select(null); dirty = true; }
  function setTool(t) { tool = t; if (api.onTool) api.onTool(t); dirty = true; }
  function setStamp(id) { stamp = id; setTool('stamp'); }
  function select(el) {
    if (selected === el) { dirty = true; return; }
    selected = el;
    dirty = true;
    if (api.onSelect) api.onSelect(el);
  }
  function deleteSelected() {
    if (!selected) return;
    snapshot();
    place.elements.splice(place.elements.indexOf(selected), 1);
    select(null);
    edited();
  }
  function centreOn(p) { view.x = W / 2 - p[0] * view.k; view.y = H / 2 - p[1] * view.k; dirty = true; }

  Object.assign(api, {
    mount, show, setMode, thumb, palette: () => { if (!pal) readPalette(); return pal; }, setTool, setStamp, select, fit, undo, snapshot, deleteSelected, centreOn,
    redraw: () => { dirty = true; }, zoom: (f) => zoomAt(W / 2, H / 2, f),
    tool: () => tool, mode: () => mode, selected: () => selected, canUndo: () => undoStack.length > 0,
  });
  global.MapView = api;
})(window);
