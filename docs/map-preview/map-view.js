/* Troubadour Map: the map on screen, its drawing tools and the player point.
 *
 *   MapView.mount(canvas)
 *   MapView.show(place, world)       draws a place and fits it to the screen
 *   MapView.setMode('edit' | 'play') MapView.setTool(id)  MapView.setStamp(id)
 *   MapView.select(element | null)   MapView.fit()  MapView.undo()  MapView.redraw()
 *   callbacks: onSelect(el), onEdit() (the place changed: save it), onTap(el) (a double tap at the table),
 *   onOpen(el) (a double tap while drawing), onPlayer(point), onTool(id)
 *
 * Tools (edit): select (move elements and the player point), wall, pen (a shape: closed when it ends near
 * its start, else a line), stamp (a drawing of the library), eraser, hand (move the map).
 * At the table (play): drag the player point to draw the party's trail; a second after the finger lifts, the point
 * walks it (a tap moves nothing). Double tap an element to open it.
 * Everywhere: wheel or pinch to zoom, two fingers, the middle button or Space to move the map.
 */
(function (global) {
  'use strict';

  const M = global.TroubadourMap;
  const S = global.MapStamps;

  let cv = null, ctx = null, place = null, world = null;
  let mode = 'edit', tool = 'select', stamp = 'lake', selected = null;
  // More places selected with the one shown in the panel (Shift, a band, Ctrl+A): they move, go and copy together.
  const group = new Set();
  let view = { x: 0, y: 0, k: 1 };
  let dpr = 1, W = 0, H = 0, dirty = true;
  let pal = null;
  const undoStack = [], redoStack = [];
  const api = { onNoWay: null, onHold: null, onCreate: null, onSelect: null, onEdit: null, onTap: null, onOpen: null, onLink: null, onPlayer: null, onTool: null };

  /* ---------- Colours of the map, from the theme ---------- */
  function hex(c) {
    c = String(c || '').trim();
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
    const f = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(c); // a colour-mix, as browsers report it
    if (f) return [f[1], f[2], f[3]].map((x) => Math.round(Number(x) * 255));
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

  let needFit = null;
  let fillOnResize = true; // at the table, the map keeps filling the screen until the troubadour zooms or pans
  /** `fit()` shows the whole place. `fill()` fills the screen with the map, the party's point at mid-height
   *  (and as near the middle across as the map allows). */
  function fit(kind) {
    if (kind === 'fill') return fill();
    if (!place || W < 50 || H < 50) { needFit = 'fit'; return; }
    needFit = null;
    fillOnResize = true;
    if (mode === 'play') {
      // At the table: the whole map, as large as the screen allows, centred.
      const k = containK();
      view = { k, x: (W - place.width * k) / 2, y: (H - place.height * k) / 2 };
      dirty = true;
      return;
    }
    // While drawing: as large as the screen allows, beside the tools (never under them).
    const m = 12;
    const ins = Object.assign({ left: 0, top: 0, right: 0, bottom: 0 }, api.insets ? api.insets() : {});
    const L = Math.max(m, ins.left), R = Math.max(m, ins.right), T = Math.max(m, ins.top), B = Math.max(m, ins.bottom);
    const k = Math.min((W - L - R) / place.width, (H - T - B) / place.height);
    view = { k, x: L + (W - L - R - place.width * k) / 2, y: T + (H - T - B - place.height * k) / 2 };
    dirty = true;
  }
  function fill() {
    if (!place || W < 50 || H < 50) { needFit = 'fill'; return; }
    needFit = null;
    const k = Math.max(W / place.width, H / place.height);
    const [px, py] = place.player;
    const x = Math.min(0, Math.max(W - place.width * k, W / 2 - px * k));
    view = { k, x, y: H / 2 - py * k };
    fillOnResize = true;
    dirty = true;
  }
  function zoomAt(sx, sy, f) {
    fillOnResize = false;
    const lo = mode === 'play' && place ? containK() : 0.05;
    const k = Math.max(lo, Math.min(8, view.k * f));
    const [wx, wy] = toWorld(sx, sy);
    view.k = k; view.x = sx - wx * k; view.y = sy - wy * k;
    keepOnMap();
    dirty = true;
  }

  /** The largest scale that shows the whole map. */
  function containK() { return Math.min(W / place.width, H / place.height); }

  /** At the table, the screen never leaves the map: no zooming out past the whole map, and no panning past
   *  its edges (along a side shorter than the screen, the map stays centred). */
  function keepOnMap() {
    if (mode !== 'play' || !place || W < 50 || H < 50) return;
    const lo = containK();
    if (view.k < lo) { view.k = lo; }
    const mw = place.width * view.k, mh = place.height * view.k;
    view.x = mw <= W ? (W - mw) / 2 : Math.min(0, Math.max(W - mw, view.x));
    view.y = mh <= H ? (H - mh) / 2 : Math.min(0, Math.max(H - mh, view.y));
  }

  /* ---------- Hit tests ---------- */
  function nearPath(p, pts, closed, tol) {
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) if (M.nearestOnSegment(p, pts[i], pts[(i + 1) % pts.length]).d2 <= tol * tol) return true;
    return pts.length === 1 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= tol;
  }
  /* The layers of the editor: an element hidden is not drawn while editing, an element locked cannot be touched on
   * the map (it still is from the layers list). An aid for drawing only: nothing of it is saved, the table sees all. */
  const layers = { hidden: new Set(), locked: new Set(), wallsHidden: false, wallsLocked: false };
  const editing = () => mode === 'edit';
  const shown = () => (editing() && layers.hidden.size ? place.elements.filter((e) => !layers.hidden.has(e)) : place.elements);
  const shownWalls = () => (editing() && layers.wallsHidden ? [] : place.walls);
  const untouchable = (e) => editing() && (layers.hidden.has(e) || layers.locked.has(e));
  function elementAt(p) {
    const tol = 12 / view.k;
    for (let i = place.elements.length - 1; i >= 0; i--) {
      const e = place.elements[i], s = e.shape;
      if (untouchable(e)) continue;
      if (s.type === 'stamp') { if (Math.hypot(p[0] - s.x, p[1] - s.y) <= s.size / 2 + tol * 0.5) return e; }
      else if ((s.closed && M.inside(p, s.points)) || nearPath(p, s.points, s.closed, tol)) return e;
    }
    return null;
  }
  function wallAt(p) {
    if (editing() && (layers.wallsHidden || layers.wallsLocked)) return null;
    const tol = 12 / view.k;
    for (let i = place.walls.length - 1; i >= 0; i--) if (nearPath(p, place.walls[i].points, false, tol)) return place.walls[i];
    return null;
  }
  /** The reach handle of the selected element: on its reach ring, right of its rightmost point. */
  function reachHandle(el) {
    const sh = el.shape;
    if (sh.type === 'stamp') return [sh.x + sh.size / 2 + el.radius, sh.y];
    let r = sh.points[0];
    sh.points.forEach((q) => { if (q[0] > r[0]) r = q; });
    return [r[0] + el.radius, r[1]];
  }
  function onReachHandle(sx, sy) {
    if (!selected || group.size || mode !== 'edit' || tool !== 'select' || !place.elements.includes(selected)) return false;
    const q = toScreen(reachHandle(selected));
    return Math.hypot(sx - q[0], sy - q[1]) <= 18;
  }
  function onPlayer(sx, sy) { const q = toScreen(place.player); return Math.hypot(sx - q[0], sy - q[1]) <= 26; }

  /* ---------- Undo and redo ---------- */
  // Every change of the map is a step: drawing, moving, the sounds of a place or of the whole map and their
  // settings. The map is kept as it was after the last step (base); a change, once things settle (400 ms, or at
  // the start of the next gesture), pushes that base on the undo stack. 200 steps, per map, until it is left.
  const HISTORY = 200;
  let base = null, commitTimer = 0;
  // What the app learns of a sound by itself (its length and weight, written once read) is no step of the history.
  const LEARNT = ['duration', 'size'];
  function skipLearnt(k, v) { return LEARNT.includes(k) && this && typeof this.file === 'string' ? undefined : v; }
  const stateOf = () => JSON.stringify({ walls: place.walls, elements: place.elements, player: place.player, general: place.general }, skipLearnt);
  /** Gives the cards of a state brought back what is known of their sounds now. */
  function relearn(o) {
    const known = new Map();
    place.general.concat(...place.elements.map((e) => e.cards)).forEach((c) => { if (c && c.file && !known.has(c.file)) known.set(c.file, c); });
    (o.general || []).concat(...o.elements.map((e) => e.cards)).forEach((c) => {
      const k = c && known.get(c.file);
      if (k) LEARNT.forEach((f) => { if (k[f] != null && c[f] == null) c[f] = k[f]; });
    });
  }
  function commit() {
    clearTimeout(commitTimer); commitTimer = 0;
    if (!place) return;
    const s = stateOf();
    if (base === null || s === base) { base = s; return; }
    undoStack.push(base);
    if (undoStack.length > HISTORY) undoStack.shift();
    redoStack.length = 0;
    base = s;
    if (api.onHistory) api.onHistory();
  }
  function commitSoon() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 400); }
  /** Before a change: what was changed before it becomes its own step. */
  function snapshot() { commit(); }
  function applyState(st) {
    const o = JSON.parse(st);
    relearn(o);
    place.walls = o.walls; place.elements = o.elements; place.player = o.player;
    if (o.general) place.general = o.general;
    base = st;
    const ids = [...group].map((e) => e.id);
    if (selected) select(place.elements.find((e) => e.id === selected.id) || null);
    group.clear(); ids.forEach((id) => { const e = place.elements.find((x_) => x_.id === id); if (e && e !== selected) group.add(e); });
    dirty = true;
    if (api.onEdit) api.onEdit();
    // What the app tidies as it shows the map again (a name given to a place) is not a step of its own.
    base = stateOf();
    if (api.onHistory) api.onHistory();
  }
  function undo() {
    if (!place) return false;
    commit();
    const st = undoStack.pop();
    if (!st) return false;
    redoStack.push(base);
    applyState(st);
    return true;
  }
  function redo() {
    if (!place) return false;
    commit();
    const st = redoStack.pop();
    if (!st) return false;
    undoStack.push(base);
    applyState(st);
    return true;
  }
  function edited() { dirty = true; commitSoon(); if (api.onEdit) api.onEdit(); }

  /* ---------- Clipboard: copy, cut, paste, duplicate (Alt-drag too) ---------- */
  // Kept for the session, across the maps of the world (the sounds are the world's).
  let clip = null; // { world, el (JSON) }
  let pointerW = null; // the pointer on the map, where a paste lands
  function shiftShape(sh, dx, dy) {
    if (sh.type === 'stamp') { sh.x += dx; sh.y += dy; } else sh.points.forEach((q) => { q[0] += dx; q[1] += dy; });
  }
  function cloneElement(el) {
    const c = JSON.parse(JSON.stringify(el));
    c.id = M.shortId();
    if (c.link === place.id) c.link = null;
    return c;
  }
  /** Lays a copy on the map: centred on `at` when given, else `off` from where it was; kept on the map. */
  function lay(src, at, off) {
    const c = cloneElement(src);
    const ctr = M.centre(c.shape);
    if (at) shiftShape(c.shape, at[0] - ctr[0], at[1] - ctr[1]); else if (off) shiftShape(c.shape, off, off);
    const b = M.bounds(c.shape);
    const dx = b[0] < 0 ? -b[0] : b[2] > place.width ? place.width - b[2] : 0;
    const dy = b[1] < 0 ? -b[1] : b[3] > place.height ? place.height - b[3] : 0;
    if (dx || dy) shiftShape(c.shape, dx, dy);
    const sh = c.shape;
    if (sh.type === 'stamp') { sh.x = Math.round(sh.x); sh.y = Math.round(sh.y); } else sh.points.forEach((q) => { q[0] = Math.round(q[0]); q[1] = Math.round(q[1]); });
    snapshot();
    place.elements.push(c);
    select(c);
    edited();
    return c;
  }
  /* ---------- Snapping and guides ---------- */
  // A place moved snaps its left, middle or right (top, middle, bottom) to those of the other places of the map
  // when it comes within 6 pixels of the screen; a gold line shows it. N turns it off; Ctrl or Cmd held, for once.
  let snapOn = true;
  try { snapOn = localStorage.getItem('troubadour.map.snap') !== '0'; } catch (e) { /* private mode */ }
  let guides = []; // [{ x } | { y }] in units of the map, while a place is being moved
  function setSnap(on) { snapOn = !!on; try { localStorage.setItem('troubadour.map.snap', on ? '1' : '0'); } catch (e) { /* private mode */ } }
  function snapOffset(el, raw, off, free) {
    guides = [];
    if (!snapOn || free) return raw.slice();
    // The bounds of the place where the finger would take it.
    const b = M.bounds(el.shape);
    const nb = [b[0] - off[0] + raw[0], b[1] - off[1] + raw[1], b[2] - off[0] + raw[0], b[3] - off[1] + raw[1]];
    const mine = { x: [nb[0], (nb[0] + nb[2]) / 2, nb[2]], y: [nb[1], (nb[1] + nb[3]) / 2, nb[3]] };
    const tol = 6 / view.k;
    const best = { x: null, y: null };
    place.elements.forEach((o) => {
      if (o === el || layers.hidden.has(o.id) || (gesture && gesture.others && gesture.others.includes(o))) return;
      const ob = M.bounds(o.shape);
      const theirs = { x: [ob[0], (ob[0] + ob[2]) / 2, ob[2]], y: [ob[1], (ob[1] + ob[3]) / 2, ob[3]] };
      ['x', 'y'].forEach((a) => mine[a].forEach((m) => theirs[a].forEach((t) => {
        const d = t - m;
        if (Math.abs(d) <= tol && (!best[a] || Math.abs(d) < Math.abs(best[a].d))) best[a] = { d, at: t };
      })));
    });
    // The middle of the map too.
    const mid = { x: place.width / 2, y: place.height / 2 };
    ['x', 'y'].forEach((a) => { const m = mine[a][1], d = mid[a] - m; if (Math.abs(d) <= tol && (!best[a] || Math.abs(d) < Math.abs(best[a].d))) best[a] = { d, at: mid[a] }; });
    const out = raw.slice();
    if (best.x) { out[0] += best.x.d; guides.push({ x: best.x.at }); }
    if (best.y) { out[1] += best.y.d; guides.push({ y: best.y.at }); }
    return out;
  }
  function copy() { if (!selected || !place) return false; clip = { world: world && world.id, from: place.id, els: JSON.stringify(selection()) }; return true; }
  /** Lays copies of several places together: their middle at `at`, or `off` aside; the first is the one shown. */
  function layMany(srcs, at, off) {
    if (srcs.length === 1) return lay(srcs[0], at, off);
    const bs = srcs.map((e) => M.bounds(e.shape));
    const box = [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
    let dx = off || 0, dy = off || 0;
    if (at) { dx = at[0] - (box[0] + box[2]) / 2; dy = at[1] - (box[1] + box[3]) / 2; }
    // Kept on the map, all of them together.
    dx = Math.max(-box[0], Math.min(place.width - box[2], dx)); dy = Math.max(-box[1], Math.min(place.height - box[3], dy));
    snapshot();
    const made = srcs.map((src) => {
      const c = cloneElement(src);
      shiftShape(c.shape, Math.round(dx), Math.round(dy));
      place.elements.push(c);
      return c;
    });
    group.clear(); made.slice(1).forEach((e) => group.add(e));
    selected = null; select(made[0], true);
    edited();
    return made[0];
  }
  function cut() { if (!copy()) return false; deleteSelected(); return true; }
  function paste() {
    if (!clip || !place || mode !== 'edit') return null;
    if (world && clip.world && clip.world !== world.id) return false;
    const srcs = JSON.parse(clip.els);
    const inView = pointerW && pointerW[0] >= 0 && pointerW[1] >= 0 && pointerW[0] <= place.width && pointerW[1] <= place.height;
    return layMany(srcs, inView ? pointerW : null, clip.from === place.id ? 32 : 0);
  }
  /** Arrows: the selection moves by `d` units of the map (one step of the history per press). */
  function nudge(dx, dy) {
    const all = selection();
    if (!all.length || mode !== 'edit') return false;
    snapshot();
    all.forEach((e) => shiftShape(e.shape, dx, dy));
    edited();
    return true;
  }
  function duplicate() { if (!selected || !place) return null; return layMany(selection(), null, 32); }

  /* ---------- The party's trail (at the table) ---------- */
  // Dragging the golden dot draws a dashed trail, treasure-map style; lifting the finger marks its end with a
  // cross. A second later the dot walks the trail at a steady pace (easing in and out), and the sounds follow it.
  const WALK_DELAY = 1000;
  let trail = null; // { pts, phase: 'draw' | 'wait' | 'walk', cum, len, t0, dur, timer, at }

  /** Stops any trail: the dot stays where it is now. */
  function dropTrail() {
    if (!trail) return;
    clearTimeout(trail.timer);
    trail = null;
    light = true;
  }
  function startTrail() {
    dropTrail();
    trail = { pts: [place.player.slice()], phase: 'draw' };
  }
  /** Walls stop the party (Settings): no step of the trail, or of the point, goes through a wall. */
  const blocked = (a, b) => global.MapUI.settings.trailWalls !== false && M.wallsBetween(a, b, place.walls) > 0;
  function addToTrail(w) {
    const q = clampPoint(w);
    const last = trail.pts[trail.pts.length - 1];
    if (blocked(last, q)) return; // the trail waits at the wall until the finger comes back round it
    if (Math.hypot(q[0] - last[0], q[1] - last[1]) * view.k >= 4) trail.pts.push(q);
    light = true;
  }
  /* ---------- Sending the party (M6): a long press on the map, the shortest way around the walls ---------- */
  /** The way from a to b: straight when no wall is between, else around the walls on a grid (A*), pulled tight.
   *  Null when walls close it off. */
  function findPath(a, b) {
    if (!blocked(a, b)) return [a.slice(), b.slice()];
    const cs = Math.max(place.width, place.height) / 140, nx = Math.ceil(place.width / cs), ny = Math.ceil(place.height / cs);
    const wall = new Uint8Array(nx * ny);
    const near2 = (cs * 0.8) * (cs * 0.8);
    place.walls.forEach((w) => {
      for (let i = 1; i < w.points.length; i++) {
        const p = w.points[i - 1], q = w.points[i];
        const x0 = Math.max(0, Math.floor((Math.min(p[0], q[0]) - cs) / cs)), x1 = Math.min(nx - 1, Math.ceil((Math.max(p[0], q[0]) + cs) / cs));
        const y0 = Math.max(0, Math.floor((Math.min(p[1], q[1]) - cs) / cs)), y1 = Math.min(ny - 1, Math.ceil((Math.max(p[1], q[1]) + cs) / cs));
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
          if (M.nearestOnSegment([(gx + 0.5) * cs, (gy + 0.5) * cs], p, q).d2 <= near2) wall[gy * nx + gx] = 1;
        }
      }
    });
    const cellOf = (pt) => [Math.max(0, Math.min(nx - 1, Math.floor(pt[0] / cs))), Math.max(0, Math.min(ny - 1, Math.floor(pt[1] / cs)))];
    // The nearest free cell to a point (it may stand right by a wall).
    const free = (c) => {
      if (!wall[c[1] * nx + c[0]]) return c;
      for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x_ = c[0] + dx, y_ = c[1] + dy;
        if (x_ >= 0 && y_ >= 0 && x_ < nx && y_ < ny && !wall[y_ * nx + x_]) return [x_, y_];
      }
      return null;
    };
    const s0 = free(cellOf(a)), g0 = free(cellOf(b));
    if (!s0 || !g0) return null;
    const N = nx * ny, start = s0[1] * nx + s0[0], goal = g0[1] * nx + g0[0];
    const gS = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
    const h = (i) => Math.hypot((i % nx) - g0[0], Math.floor(i / nx) - g0[1]);
    const open = [[h(start), start]];
    gS[start] = 0;
    const steps = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    while (open.length) {
      // A small binary heap would be quicker; a map has at most 140 × 140 cells, a sorted pop is enough.
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, i] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (shut[i]) continue;
      if (i === goal) { found = true; break; }
      shut[i] = 1;
      const cx = i % nx, cy = Math.floor(i / nx);
      for (const [dx, dy, w] of steps) {
        const x_ = cx + dx, y_ = cy + dy;
        if (x_ < 0 || y_ < 0 || x_ >= nx || y_ >= ny) continue;
        const j = y_ * nx + x_;
        if (wall[j] || shut[j]) continue;
        if (dx && dy && (wall[cy * nx + x_] || wall[y_ * nx + cx])) continue; // no corner cut through a wall
        const g = gS[i] + w;
        if (g < gS[j]) { gS[j] = g; from[j] = i; open.push([g + h(j), j]); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goal; i >= 0; i = from[i]) { cells.push([((i % nx) + 0.5) * cs, (Math.floor(i / nx) + 0.5) * cs]); if (i === start) break; }
    cells.reverse();
    const pts = [a.slice(), ...cells, b.slice()];
    // Pulled tight: from each point, straight to the farthest one no wall hides.
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && blocked(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out.map((q) => [Math.round(q[0]), Math.round(q[1])]);
  }
  /** Sends the party to w along its way: the trail is drawn, and walked a second later. */
  function sendTo(w) {
    const to = clampPoint(w);
    const path = findPath(place.player, to);
    if (!path) { if (api.onNoWay) api.onNoWay(); return false; }
    dropTrail();
    trail = { pts: path, phase: 'draw' };
    endTrail();
    return true;
  }

  function measure(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return cum;
  }
  function endTrail() {
    const pts = trail.pts.length > 2 ? M.simplify(trail.pts, 2 / view.k) : trail.pts;
    const cum = measure(pts);
    const len = cum[cum.length - 1];
    if (pts.length < 2 || len * view.k < 8) { dropTrail(); return; }
    trail = Object.assign(trail, { pts, cum, len, phase: 'wait', at: 0 });
    trail.timer = setTimeout(() => { if (trail && trail.phase === 'wait') { trail.phase = 'walk'; trail.t0 = trail.tl = performance.now(); light = true; } }, WALK_DELAY);
    light = true;
  }
  /** The cross at the end of a trail, on screen (null while the trail is drawn). */
  function crossAt() { return trail && trail.phase !== 'draw' && trail.len ? toScreen(trail.pts[trail.pts.length - 1]) : null; }
  /** The cross dragged to a new spot, even while the party walks: the trail follows the finger from its end. Brought
   *  back over the trail still ahead, it shortens it there. */
  function dragCross(w) {
    const q = clampPoint(w);
    const pts = trail.pts;
    const from = trail.phase === 'walk' ? along(trail.at).i : 1; // the trail behind the party stays as it is
    const near = 14 / view.k;
    for (let j = Math.max(1, from); j < pts.length - 1; j++) {
      if (Math.hypot(pts[j][0] - q[0], pts[j][1] - q[1]) < near) { pts.length = j + 1; break; }
    }
    const last = pts[pts.length - 1];
    if (!blocked(last, q) && Math.hypot(q[0] - last[0], q[1] - last[1]) * view.k >= 4) pts.push(q);
    trail.cum = measure(pts);
    trail.len = trail.cum[trail.cum.length - 1];
    if (trail.at > trail.len) trail.at = trail.len;
    light = true;
  }
  /** The point at distance d along the trail. */
  function along(d) {
    const { pts, cum } = trail;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1, u = Math.max(0, Math.min(1, (d - cum[i - 1]) / seg));
    return { p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u], i };
  }
  function stepTrail() {
    if (!trail || trail.phase !== 'walk' || !place) return;
    // A steady pace, set in Settings (a share of the map's longer side per second), easing in over the first
    // half second and out over the last stretch. The trail may change on the way (its cross dragged elsewhere).
    const t = performance.now(), dt = Math.min(0.1, (t - trail.tl) / 1000);
    trail.tl = t;
    const speed = Math.max(place.width, place.height) * (Number(global.MapUI.settings.trailSpeed) || 0.1);
    const left = trail.len - trail.at;
    const k = Math.min(1, 0.15 + (t - trail.t0) / 600) * Math.min(1, 0.12 + left / (speed * 0.6));
    trail.at = Math.min(trail.len, trail.at + speed * k * dt);
    const { p } = along(trail.at);
    place.player = [Math.round(p[0]), Math.round(p[1])];
    if (api.onPlayer) api.onPlayer(place.player, false);
    light = true;
    const holding = gesture && gesture.kind === 'cross';
    if (trail.at >= trail.len - 0.01 && !holding) { place.player = trail.pts[trail.pts.length - 1].slice(); if (api.onPlayer) api.onPlayer(place.player, true); trail = null; edited(); }
  }
  function drawTrail() {
    if (!trail || trail.pts.length < 2) return;
    // What is left of the trail: from the dot (once it walks) to the end.
    let pts = trail.pts;
    if (trail.phase === 'walk') { const { p, i } = along(trail.at); pts = [p].concat(trail.pts.slice(i)); }
    const sp = pts.map(toScreen);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash([2, 9]);
    ctx.lineDashOffset = trail.phase === 'walk' ? -trail.at * view.k : 0;
    ctx.beginPath(); sp.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.strokeStyle = alpha(pal.paper, 0.85); ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = pal.ink; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.setLineDash([]);
    if (trail.phase !== 'draw') {
      // The cross that marks the spot.
      const [x, y] = sp[sp.length - 1], r = 9;
      ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      ctx.strokeStyle = alpha(pal.paper, 0.9); ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = pal.events; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- Pointer input ---------- */
  const pointers = new Map();
  let last = { t: 0, s: [0, 0], el: null }; // the last tap, to tell a double tap
  const PRESS_MS = 650;
  let press = null; // a long press on the link of an element: { el, t0, timer, s }
  function linkAt(sx, sy) {
    if (!place) return null;
    for (let i = place.elements.length - 1; i >= 0; i--) {
      const e = place.elements[i];
      if (!e.link) continue;
      const q = toScreen(M.centre(e.shape));
      if (Math.hypot(sx - q[0], sy - q[1]) <= 24) return e;
    }
    return null;
  }
  function endPress() { if (press) { clearTimeout(press.timer); press = null; light = true; } }
  let gesture = null; // { kind, ... }
  let spaceDown = false;

  function down(e) {
    if (!place) return;
    cv.setPointerCapture(e.pointerId);
    const s = local(e);
    pointers.set(e.pointerId, s);
    if (pointers.size === 2) {
      // Two fingers: whatever was being drawn is dropped, the map moves and zooms.
      endPress();
      if (gesture && gesture.kind === 'stroke') gesture = null;
      if (gesture && gesture.kind === 'player' && trail && trail.phase === 'draw') dropTrail();
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
      // A long press on a sign takes its way; on the party's point, moving the finger cancels it and drags the point.
      const lk = linkAt(s[0], s[1]);
      if (lk) {
        endPress();
        press = { el: lk, t0: performance.now(), s, timer: setTimeout(() => { const e2 = press && press.el; endPress(); gesture = null; if (e2 && api.onLink) api.onLink(e2); }, PRESS_MS) };
        light = true;
      }
      // The cross of a trail: dragged elsewhere, even while the party walks.
      const cx = crossAt();
      if (cx && Math.hypot(s[0] - cx[0], s[1] - cx[1]) <= 26 && !(onPlayer(s[0], s[1]) && trail.phase === 'wait')) {
        endPress();
        if (trail.phase === 'wait') { clearTimeout(trail.timer); trail.pts = trail.pts.slice(); }
        gesture = { kind: 'cross' }; cv.classList.add('grabbing'); dirty = true;
        return;
      }
      // On the point: a drag moves it, a tap (or a double tap) counts as a tap on the map below it.
      if (onPlayer(s[0], s[1])) { gesture = { kind: 'player', start: s, el: elementAt(w), dragged: false }; return; }
      // A long press anywhere else (not on a sign): the party goes there, the shortest way around the walls.
      if (!lk && pointers.size === 1) {
        endPress();
        press = { go: w, t0: performance.now(), s, timer: setTimeout(() => { endPress(); gesture = null; sendTo(w); }, PRESS_MS) };
        light = true;
      }
      gesture = { kind: 'tap', start: s, last: s, el: elementAt(w) };
      return;
    }
    // Edit
    if (tool === 'select') {
      // The reach handle: drag the ring of what is heard, the number follows.
      if (onReachHandle(s[0], s[1])) { snapshot(); gesture = { kind: 'reach', el: selected }; cv.classList.add('grabbing'); dirty = true; return; }
      if (onPlayer(s[0], s[1])) { snapshot(); gesture = { kind: 'player', start: s, dragged: false }; cv.classList.add('grabbing'); return; }
      const el = elementAt(w);
      if (el && e.shiftKey) { toggleSelect(el); return; }
      if (el) {
        // Alt-drag: a copy is moved, the element stays. A place of a selection of many moves them all.
        const many = !e.altKey && (el === selected || group.has(el)) && group.size > 0;
        const dragged = e.altKey ? lay(el, null, 0) : el;
        const others = many ? selection().filter((x_) => x_ !== dragged) : [];
        select(dragged, many); snapshot();
        const g = { kind: 'move', el: dragged, others, last: w, moved: false, s0: s };
        // A long press without moving: the menu of the element (duplicate, delete, size, turn).
        g.hold = setTimeout(() => {
          if (gesture !== g || g.moved) return;
          gesture = null; cv.classList.remove('grabbing');
          if (api.onHold) api.onHold(el, e.clientX, e.clientY);
        }, PRESS_MS);
        gesture = g; cv.classList.add('grabbing'); return;
      }
      // Shift on the map: a band selects every place it touches.
      if (e.shiftKey) { gesture = { kind: 'band', a: w, b: w }; return; }
      select(null);
      gesture = { kind: 'pan', last: s };
      return;
    }
    if (tool === 'wall' || tool === 'pen') { gesture = { kind: 'stroke', tool, pts: [w], shift: e.shiftKey }; dirty = true; return; }
    if (tool === 'stamp') {
      snapshot();
      const el = M.cleanElement({ id: M.shortId(), title: '', radius: Math.round(place.width * 0.1), cards: [], shape: { type: 'stamp', stamp, x: w[0], y: w[1], size: stampSizer ? stampSizer(stamp, place) : Math.round(Math.max(120, Math.min(600, 110 / view.k)) / 10) * 10, rotation: 0 } }, place.width, place.height);
      place.elements.push(el);
      select(el);
      edited();
      gesture = { kind: 'move', el, last: w, moved: false, created: true };
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
      keepOnMap();
      if (gesture.d > 0) zoomAt(c[0], c[1], d / gesture.d);
      gesture.d = d; gesture.c = c;
      dirty = true;
      return;
    }
    if (press && Math.hypot(s[0] - press.s[0], s[1] - press.s[1]) > 10) endPress();
    const w = toWorld(s[0], s[1]);
    switch (gesture.kind) {
      case 'pan': fillOnResize = false;
        view.x += s[0] - gesture.last[0]; view.y += s[1] - gesture.last[1]; keepOnMap(); gesture.last = s; dirty = true; break;
      case 'tap':
        if (Math.hypot(s[0] - gesture.start[0], s[1] - gesture.start[1]) > 6) { gesture.panning = true; if (press && press.go) endPress(); }
        if (gesture.panning) { fillOnResize = false; view.x += s[0] - gesture.last[0]; view.y += s[1] - gesture.last[1]; keepOnMap(); dirty = true; }
        gesture.last = s; break;
      case 'cross': if (trail) dragCross(w); break;
      case 'player':
        if (!gesture.dragged && Math.hypot(s[0] - gesture.start[0], s[1] - gesture.start[1]) < 5) break;
        // At the table, with the trail on (Settings): a trail to walk. Otherwise the point follows the finger.
        const walks = mode === 'play' && global.MapUI.settings.trail !== false;
        if (!gesture.dragged && walks) startTrail();
        if (!gesture.dragged && !walks) dropTrail();
        gesture.dragged = true;
        cv.classList.add('grabbing');
        if (walks) { addToTrail(w); break; }
        if (mode === 'play' && blocked(place.player, clampPoint(w))) break;
        place.player = clampPoint(w);
        light = true;
        if (api.onPlayer) api.onPlayer(place.player, false);
        break;
      case 'band': gesture.b = w; light = true; break;
      case 'reach': {
        const d = M.reach(w, gesture.el.shape).d;
        gesture.el.radius = Math.round(Math.max(0, Math.min(4000, d)) / 10) * 10;
        gesture.moved = true;
        dirty = true;
        if (api.onReach) api.onReach(gesture.el);
        break;
      }
      case 'move': {
        // A finger that only trembles does not move the element (nor spoil a long press).
        if (!gesture.moved && gesture.s0 && Math.hypot(s[0] - gesture.s0[0], s[1] - gesture.s0[1]) < 8) break;
        clearTimeout(gesture.hold);
        let dx = w[0] - gesture.last[0], dy = w[1] - gesture.last[1];
        gesture.last = w; gesture.moved = true;
        // Snapping: the raw way the finger went is kept, the place jumps to the edges and middles of the others.
        gesture.raw = gesture.raw || [0, 0];
        gesture.raw[0] += dx; gesture.raw[1] += dy;
        const off = gesture.off || [0, 0];
        const want = snapOffset(gesture.el, gesture.raw, off, e.ctrlKey || e.metaKey);
        dx = want[0] - off[0]; dy = want[1] - off[1];
        gesture.off = want;
        shiftShape(gesture.el.shape, dx, dy);
        (gesture.others || []).forEach((o) => shiftShape(o.shape, dx, dy));
        dirty = true;
        break;
      }
      case 'stroke': {
        const last = gesture.pts[gesture.pts.length - 1];
        if (Math.hypot(w[0] - last[0], w[1] - last[1]) * view.k > 3) gesture.pts.push(w);
        gesture.shift = gesture.shift || e.shiftKey;
        light = true;
        break;
      }
      case 'erase': erase(w, gesture); break;
      default:
    }
  }

  function up(e) {
    endPress();
    pointers.delete(e.pointerId);
    cv.classList.remove('grabbing');
    if (!gesture) return;
    if (gesture.kind === 'pinch') { if (pointers.size < 2) gesture = null; return; }
    const g = gesture;
    gesture = null;
    if (g.kind === 'player' && mode === 'play' && !g.dragged) g.kind = 'tap';
    if (g.kind === 'tap' && !g.panning) {
      // Only a drag moves the party: a tap moves nothing. A double tap on an element opens its sounds.
      const t = performance.now();
      const twice = last.t && last.el === g.el && t - last.t < 350 && Math.hypot(g.start[0] - last.s[0], g.start[1] - last.s[1]) < 30;
      last = twice ? { t: 0, s: [0, 0], el: null } : { t, s: g.start, el: g.el };
      if (twice && api.onTap) api.onTap(g.el || null);
    } else if (g.kind === 'cross') {
      if (trail) {
        if (trail.phase === 'wait') { trail.phase = 'draw'; endTrail(); }
        else if (trail.at >= trail.len - 0.01) { place.player = trail.pts[trail.pts.length - 1].slice(); if (api.onPlayer) api.onPlayer(place.player, true); trail = null; edited(); }
      }
    } else if (g.kind === 'player') {
      if (trail && trail.phase === 'draw') endTrail();
      else { edited(); if (g.dragged && api.onPlayer) api.onPlayer(place.player, true); }
    } else if (g.kind === 'move') {
      clearTimeout(g.hold);
      if (!g.moved) {
        const t = performance.now();
        if (last.el === g.el && t - last.t < 350) { last = { t: 0, s: [0, 0], el: null }; if (api.onOpen) api.onOpen(g.el); }
        else last = { t, s: [0, 0], el: g.el };
      }
      [g.el, ...(g.others || [])].forEach((x_) => { const sh = x_.shape; if (sh.type === 'stamp') { sh.x = Math.round(sh.x); sh.y = Math.round(sh.y); } else sh.points.forEach((p) => { p[0] = Math.round(p[0]); p[1] = Math.round(p[1]); }); });
      if (g.moved || tool === 'stamp') edited();
      if (g.created && api.onCreate) api.onCreate(g.el);
    } else if (g.kind === 'reach') { if (g.moved) edited(); }
    else if (g.kind === 'band') {
      const lo = [Math.min(g.a[0], g.b[0]), Math.min(g.a[1], g.b[1])], hi = [Math.max(g.a[0], g.b[0]), Math.max(g.a[1], g.b[1])];
      const hit = place.elements.filter((x_) => { if (untouchable(x_)) return false; const b = M.bounds(x_.shape); return b[0] <= hi[0] && b[2] >= lo[0] && b[1] <= hi[1] && b[3] >= lo[1]; });
      const keep = selection();
      const all = [...new Set(keep.concat(hit))];
      group.clear(); all.slice(1).forEach((x_) => group.add(x_));
      selected = null; select(all[0] || null, true);
    }
    else if (g.kind === 'stroke') finishStroke(g);
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
    const el = M.cleanElement({ id: M.shortId(), title: '', radius: Math.round(place.width * 0.1), cards: [], shape: { type: 'path', closed, points: pts } }, place.width, place.height);
    place.elements.push(el);
    select(el);
    edited();
    if (api.onCreate) api.onCreate(el);
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

  function hover(e) {
    if (!place) return;
    const s = local(e);
    const w = toWorld(s[0], s[1]);
    pointerW = w;
    let cur = '';
    if (spaceDown || (mode === 'edit' && tool === 'hand')) cur = 'grab';
    else if (onPlayer(s[0], s[1]) && (mode === 'play' || tool === 'select')) cur = 'grab';
    else if (mode === 'play' && crossAt() && Math.hypot(s[0] - crossAt()[0], s[1] - crossAt()[1]) <= 26) cur = 'grab';
    else if (mode === 'play') cur = elementAt(w) ? 'pointer' : 'crosshair';
    else if (tool === 'select') cur = onReachHandle(s[0], s[1]) ? 'ew-resize' : elementAt(w) ? 'move' : 'default';
    else if (tool === 'eraser') cur = elementAt(w) || wallAt(w) ? 'pointer' : 'default';
    else cur = 'crosshair';
    cv.style.cursor = cur;
  }

  function wheel(e) {
    if (!place) return;
    e.preventDefault();
    const s = local(e);
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(s[0], s[1], Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    else { fillOnResize = false; view.x -= e.deltaX; view.y -= e.deltaY; keepOnMap(); dirty = true; }
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

  function drawElement(el) {
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
  }
  /** The ring around an element that is heard, wider as it is louder. */
  function drawHeard(el, heard) {
    const sh = el.shape, c = zoneColour(el);
    ctx.save();
    ctx.strokeStyle = alpha(c, 0.25 + 0.55 * heard);
    ctx.lineWidth = 3 / view.k + 6 * heard / view.k;
    ctx.lineJoin = 'round';
    if (sh.type === 'stamp') { ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.size / 2 + 6 / view.k, 0, Math.PI * 2); }
    else tracePath(sh.points, sh.closed);
    ctx.stroke();
    ctx.restore();
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

  /* What does not change while the party moves (the paper, its ground, every drawing, the walls, the names) is painted
   * once into two layers kept aside, and only laid back each frame: under them and over them, what does change (how far
   * the sounds reach and which are heard, the trail, the party). A frame of a walk costs two images, not the whole map. */
  let light = false, layerA = null, layerB = null;
  function layer(old) {
    const c = old || document.createElement('canvas');
    if (c.width !== cv.width || c.height !== cv.height) { c.width = cv.width; c.height = cv.height; }
    return c;
  }
  function paintStatic() {
    const main = ctx;
    layerA = layer(layerA); layerB = layer(layerB);
    // Under: the table, the paper and its ground.
    ctx = layerA.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30 / view.k;
    ctx.fillStyle = pal.paper;
    ctx.fillRect(0, 0, place.width, place.height);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, place.width, place.height); ctx.clip();
    // The ground of this map (its panel in the editor); a map without one keeps the old setting, then the grid.
    const ground = place.ground || (global.MapUI && global.MapUI.settings.ground) || 'grid';
    if (ground === 'grid') {
      ctx.strokeStyle = alpha(pal.ink, 0.05);
      ctx.lineWidth = 1 / view.k;
      ctx.beginPath();
      for (let x = 100; x < place.width; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, place.height); }
      for (let y = 100; y < place.height; y += 100) { ctx.moveTo(0, y); ctx.lineTo(place.width, y); }
      ctx.stroke();
    } else if (ground !== 'empty') {
      const pat = groundPattern(ground);
      if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, place.width, place.height); }
    }

    ctx.restore();
    // Over: the elements, the walls, then in screen pixels the names and the signs of the ways.
    ctx = layerB.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layerB.width, layerB.height);
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, place.width, place.height); ctx.clip();
    shown().forEach((el) => drawElement(el));
    shownWalls().forEach((w) => drawWall(w));
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 14px "Barlow Semi Condensed", system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (!global.MapUI || global.MapUI.settings.names !== false) drawLabels();
    shown().forEach((el) => {
      if (!el.link) return;
      // The way to another map, in the middle of the element: a long press on it goes there.
      const [lx, ly] = toScreen(M.centre(el.shape));
      ctx.beginPath(); ctx.arc(lx, ly, 15, 0, Math.PI * 2); ctx.fillStyle = pal.accent; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = pal.bg; ctx.stroke();
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(lx - 5, ly + 5); ctx.lineTo(lx + 5, ly - 5); ctx.moveTo(lx - 1, ly - 5); ctx.lineTo(lx + 5, ly - 5); ctx.lineTo(lx + 5, ly + 1); ctx.stroke();
    });
    ctx = main;
  }

  function draw() {
    if (!ctx) return;
    const heavy = dirty || !layerA || layerA.width !== cv.width || layerA.height !== cv.height;
    dirty = false; light = false;
    if (!place) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      layerA = null;
      return;
    }
    if (heavy) paintStatic();
    // At the table, and in the editor while it listens.
    const audioOn = !!(global.MapAudio && global.MapAudio.isOpen());
    const world = () => { ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y); ctx.beginPath(); ctx.rect(0, 0, place.width, place.height); ctx.clip(); };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layerA, 0, 0);

    // How far every sound reaches, under the drawings.
    const heard = new Map();
    ctx.save(); world();
    shown().forEach((el) => {
      if (!el.cards.length) return;
      let h = 0;
      if (audioOn) {
        el.cards.forEach((c) => { const v = global.MapAudio.voice(c); if (v && v.state === 'playing') h = Math.max(h, v.heard); });
      }
      heard.set(el, h);
      const rings = mode === 'edit' || global.MapUI.settings.rings || el === selected;
      if (rings) drawReach(el, h);
    });
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layerB, 0, 0);
    // What is heard right now, ringed.
    ctx.save(); world();
    heard.forEach((h, el) => { if (h > 0.01) drawHeard(el, h); });
    ctx.restore();
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);

    // The line being drawn.
    if (gesture && gesture.kind === 'stroke') {
      const pts = gesture.tool === 'wall' && gesture.shift ? [gesture.pts[0], gesture.pts[gesture.pts.length - 1]] : gesture.pts;
      if (gesture.tool === 'wall') drawWall({ points: pts }, true);
      else { ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = pal.accent; ctx.lineWidth = 4; tracePath(pts, false); ctx.stroke(); ctx.restore(); }
    }

    // In screen pixels from here: the long press on a way, the selection, the party.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (press && press.go) {
      // The long press that sends the party: a gold ring fills round the finger.
      const f = Math.min(1, (performance.now() - press.t0) / PRESS_MS);
      if (f > 0.15) { ctx.beginPath(); ctx.arc(press.s[0], press.s[1], 24, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.strokeStyle = pal.accent; ctx.lineWidth = 4; ctx.stroke(); }
      light = true;
    }
    if (press && press.el && press.el.link) {
      const [lx, ly] = toScreen(M.centre(press.el.shape));
      const f = Math.min(1, (performance.now() - press.t0) / PRESS_MS);
      ctx.beginPath(); ctx.arc(lx, ly, 21, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.strokeStyle = pal.accent; ctx.lineWidth = 4; ctx.stroke();
      light = true;
    }
    if (hoverEl) {
      const b = M.bounds(hoverEl.shape);
      const p = toScreen([b[0], b[1]]), q = toScreen([b[2], b[3]]);
      ctx.save(); ctx.strokeStyle = pal.accent; ctx.lineWidth = 3; ctx.fillStyle = alpha(pal.accent, 0.12);
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(p[0] - 10, p[1] - 10, q[0] - p[0] + 20, q[1] - p[1] + 20, 12) : ctx.rect(p[0] - 10, p[1] - 10, q[0] - p[0] + 20, q[1] - p[1] + 20);
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (mode === 'edit' && group.size) {
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.2;
      group.forEach((g_) => { if (!place.elements.includes(g_)) return; const b = M.bounds(g_.shape), p = toScreen([b[0], b[1]]), q = toScreen([b[2], b[3]]); ctx.strokeRect(p[0] - 6, p[1] - 6, q[0] - p[0] + 12, q[1] - p[1] + 12); });
      ctx.restore();
    }
    if (gesture && gesture.kind === 'band') {
      const p = toScreen(gesture.a), q = toScreen(gesture.b);
      ctx.save(); ctx.fillStyle = alpha(pal.accent, 0.08); ctx.strokeStyle = pal.accent; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.fillRect(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]));
      ctx.strokeRect(Math.min(p[0], q[0]) + 0.5, Math.min(p[1], q[1]) + 0.5, Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]));
      ctx.restore();
    }
    if (selected && mode === 'edit') {
      const b = M.bounds(selected.shape);
      const p = toScreen([b[0], b[1]]), q = toScreen([b[2], b[3]]);
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5;
      ctx.strokeRect(p[0] - 8, p[1] - 8, q[0] - p[0] + 16, q[1] - p[1] + 16); ctx.restore();
      if (tool === 'select' && place.elements.includes(selected) && !group.size) {
        // The reach handle, in the colour of the element's sounds; its number while it is dragged.
        const h = toScreen(reachHandle(selected)), c = zoneColour(selected);
        const busyReach = gesture && gesture.kind === 'reach';
        ctx.save();
        ctx.beginPath(); ctx.arc(h[0], h[1], busyReach ? 9 : 7, 0, Math.PI * 2);
        ctx.fillStyle = pal.bg; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = c; ctx.stroke();
        if (busyReach) {
          ctx.font = '600 13px system-ui, sans-serif'; ctx.textBaseline = 'middle';
          const t = api.reachLabel ? api.reachLabel(selected) : `Reach ${selected.radius}`, tw = ctx.measureText(t).width;
          ctx.fillStyle = alpha(pal.bg, 0.85);
          ctx.fillRect(h[0] + 14, h[1] - 11, tw + 12, 22);
          ctx.fillStyle = pal.ink; ctx.fillText(t, h[0] + 20, h[1]);
        }
        ctx.restore();
      }
    }
    if (guides.length && gesture && gesture.kind === 'move') {
      ctx.save(); ctx.strokeStyle = pal.accent; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      guides.forEach((g) => {
        ctx.beginPath();
        if (g.x != null) { const a = toScreen([g.x, 0]), b = toScreen([g.x, place.height]); ctx.moveTo(Math.round(a[0]) + 0.5, a[1]); ctx.lineTo(Math.round(b[0]) + 0.5, b[1]); }
        else { const a = toScreen([0, g.y]), b = toScreen([place.width, g.y]); ctx.moveTo(a[0], Math.round(a[1]) + 0.5); ctx.lineTo(b[0], Math.round(b[1]) + 0.5); }
        ctx.stroke();
      });
      ctx.restore();
    } else guides = [];
    drawTrail();
    const [px, py] = toScreen(place.player);
    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fillStyle = alpha(pal.accent, 0.18); ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.fillStyle = pal.accent; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = pal.bg; ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = pal.bg; ctx.fill();
  }

  /** The ground under the map (chosen map by map, in its panel): grass or dirt, a soft tile of the theme's paper, painted once per theme. */
  const grounds = new Map();
  function groundPattern(kind) {
    const key = `${kind}|${pal.paper}`;
    if (grounds.has(key)) return grounds.get(key);
    const T = 400, c = document.createElement('canvas');
    c.width = c.height = T;
    const g = c.getContext('2d');
    const base = kind === 'grass' ? mix('#7FAE5A', pal.paper, 0.72) : mix('#A07A52', pal.paper, 0.7);
    g.fillStyle = base; g.fillRect(0, 0, T, T);
    let s = kind === 'grass' ? 7 : 13;
    const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // Soft patches, then the small marks: tufts of grass, or pebbles and specks of earth.
    for (let i = 0; i < 26; i++) {
      const x = R() * T, y = R() * T, r = 30 + R() * 60;
      g.fillStyle = alpha(kind === 'grass' ? mix('#5E8F3E', pal.paper, 0.6) : mix('#7C5A38', pal.paper, 0.6), 0.25);
      [[0, 0], [T, 0], [-T, 0], [0, T], [0, -T]].forEach(([dx, dy]) => { g.beginPath(); g.ellipse(x + dx, y + dy, r, r * 0.6, R() * 3, 0, Math.PI * 2); g.fill(); });
    }
    const markC = alpha(kind === 'grass' ? mix('#3F6F2A', pal.paper, 0.45) : mix('#5A3E24', pal.paper, 0.45), 0.55);
    g.strokeStyle = markC; g.fillStyle = markC; g.lineCap = 'round'; g.lineWidth = 2.2;
    for (let i = 0; i < 70; i++) {
      const x = 8 + R() * (T - 16), y = 8 + R() * (T - 16);
      if (kind === 'grass') { g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x - 6, y - 7); g.moveTo(x, y); g.lineTo(x, y - 9); g.moveTo(x + 4, y); g.lineTo(x + 6, y - 7); g.stroke(); }
      else { g.beginPath(); g.ellipse(x, y, 2 + R() * 4, 1.5 + R() * 2.5, R() * 3, 0, Math.PI * 2); g.fill(); }
    }
    const pat = ctx.createPattern(c, 'repeat');
    grounds.set(key, pat);
    return pat;
  }

  /** The names of the elements, laid so that none covers another, the party's point or a sign: under the element,
   *  else above it, else inside it; a name with no free place left is drawn faint, under the element. */
  function drawLabels() {
    const taken = [];
    const box = (x, y, w, h) => ({ x0: x, y0: y, x1: x + w, y1: y + h });
    const hits = (r, own) => taken.some((t) => t.el !== own && r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
    // The drawings of the library (a forest, a lake) are not written over either, except by their own name.
    shown().forEach((el) => {
      if (el.shape.type !== 'stamp') return;
      const b = M.bounds(el.shape), [x0, y0] = toScreen([b[0], b[1]]), [x1, y1] = toScreen([b[2], b[3]]), d = (x1 - x0) * 0.15;
      taken.push(Object.assign(box(x0 + d, y0 + d, x1 - x0 - 2 * d, y1 - y0 - 2 * d), { el }));
    });
    const [px, py] = toScreen(place.player);
    taken.push(box(px - 24, py - 24, 48, 48));
    shown().forEach((el) => { if (el.link) { const [lx, ly] = toScreen(M.centre(el.shape)); taken.push(box(lx - 18, ly - 18, 36, 36)); } });
    const order = place.elements.map((el, i) => ({ el, i })).sort((a, b) => (b.el.cards.length > 0) - (a.el.cards.length > 0) || a.i - b.i);
    ctx.textBaseline = 'middle';
    order.forEach(({ el }) => {
      const label = el.title || (el.cards.length ? el.cards.map((c) => c.name).slice(0, 2).join(', ') + (el.cards.length > 2 ? '…' : '') : '');
      if (!label) return;
      const b = M.bounds(el.shape);
      const [x0, y0] = toScreen([b[0], b[1]]), [x1, y1] = toScreen([b[2], b[3]]);
      const cx = (x0 + x1) / 2, w = ctx.measureText(label).width + 8, h = 18;
      const tries = [[cx, y1 + 12], [cx, y0 - 12], [cx, (y0 + y1) / 2 + ((y1 - y0) > 60 ? (y1 - y0) / 4 : 0)], [cx, y1 + 30], [cx, y0 - 30]];
      if (el.shape.type === 'path' && !el.shape.closed) {
        // A line (a river, a road): its name rides along it, just above or below.
        const pts = el.shape.points;
        const along = [];
        [0.5, 0.3, 0.7, 0.15, 0.85].forEach((f) => { const q = toScreen(pts[Math.min(pts.length - 1, Math.round(f * (pts.length - 1)))]); along.push([q[0], q[1] - 14], [q[0], q[1] + 14]); });
        tries.unshift(...along);
      }
      let at = null;
      for (const t of tries) {
        const r = box(t[0] - w / 2, t[1] - h / 2, w, h);
        if (r.y0 < 2 || r.y1 > H - 2 || r.x0 < 2 || r.x1 > W - 2 || hits(r, el)) continue;
        at = t; taken.push(r); break;
      }
      const faint = at == null;
      const [lx, y] = faint ? tries[0] : at;
      ctx.globalAlpha = faint ? 0.35 : 1;
      ctx.lineWidth = 4; ctx.strokeStyle = alpha(pal.paper, 0.9); ctx.fillStyle = pal.ink;
      ctx.strokeText(label, lx, y); ctx.fillText(label, lx, y);
      ctx.globalAlpha = 1;
    });
    ctx.textBaseline = 'alphabetic';
  }

  function loop() {
    stepTrail();
    if (dirty || light) draw();
    requestAnimationFrame(loop);
  }

  function resize() {
    const r = cv.parentNode.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, global.devicePixelRatio || 1); // two is sharp enough for a map, and less than half the pixels of three to paint each frame
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (!needFit && place && mode === 'play') { if (fillOnResize) fit(); else keepOnMap(); }
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    if (needFit) fit(needFit);
    dirty = true;
  }

  /** A small picture of a place, for the library. */
  /** The picture of a map in the library, dressed as a Troubadour story cover: no paper, the story's tint glowing
   *  behind (the .cover background), the map drawn in gold wires, its areas washed with the tint, the party a point of light. */
  function storyThumb(canvas, p, tint) {
    readPalette();
    const r = canvas.getBoundingClientRect();
    const d = Math.min(2, global.devicePixelRatio || 1);
    const w = Math.max(60, r.width || 140), h = Math.max(60, r.height || 110);
    canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
    const c = canvas.getContext('2d');
    const gold = pal.accent, card = pal.paper;
    // The drawings fill the picture, with a margin, centred on them.
    const b = p.elements.length || p.walls.length
      ? p.elements.map((e) => M.bounds(e.shape)).concat(p.walls.map((wl) => wl.points.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[0]), Math.max(a[3], q[1])], [Infinity, Infinity, -Infinity, -Infinity])))
        .reduce((a, x) => [Math.min(a[0], x[0]), Math.min(a[1], x[1]), Math.max(a[2], x[2]), Math.max(a[3], x[3])])
      : [0, 0, p.width, p.height];
    const pad = Math.min(w, h) * (Math.min(w, h) > 120 ? 0.08 : 0.14);
    const k = Math.min((w - 2 * pad) / Math.max(1, b[2] - b[0]), (h - 2 * pad) / Math.max(1, b[3] - b[1]));
    const ox = w / 2 - ((b[0] + b[2]) / 2) * k, oy = h / 2 - ((b[1] + b[3]) / 2) * k;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, w, h);
    const px = (n) => n / k; // a width in screen pixels
    const big = Math.min(w, h) > 120;
    c.setTransform(d * k, 0, 0, d * k, d * ox, d * oy);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const wire = { ...pal, paper: card, ground: card, ink: gold, line: gold, muted: gold, stone: mix(tint, card, 0.55), water: mix(tint, card, 0.6), leaf: mix(tint, card, 0.7), fire: tint, accent: tint, music: tint, ambience: tint, events: tint, soundbox: tint, mono: true, monoFill: alpha(tint, 0.3) };
    p.elements.forEach((el) => {
      const sh = el.shape;
      if (sh.type === 'stamp') { c.save(); c.translate(sh.x, sh.y); c.rotate((sh.rotation * Math.PI) / 180); c.globalAlpha = 0.95; S.draw(c, sh.stamp, sh.size, wire); c.restore(); return; }
      c.beginPath(); sh.points.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); if (sh.closed) c.closePath();
      if (sh.closed) { c.fillStyle = alpha(tint, 0.16); c.fill(); }
      c.strokeStyle = alpha(gold, sh.closed ? 0.9 : 0.75); c.lineWidth = px(big ? 1.7 : 1.1); c.stroke();
    });
    c.strokeStyle = gold; c.lineWidth = px(big ? 2.2 : 1.4);
    p.walls.forEach((wl) => { c.beginPath(); wl.points.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); });
    // The party: a point of light in the story's tint.
    const [x, y] = p.player, rr = px(big ? 26 : 9);
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, alpha(tint, 0.55)); g.addColorStop(1, alpha(tint, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill();
    c.fillStyle = tint; c.beginPath(); c.arc(x, y, px(big ? 4.5 : 2.6), 0, Math.PI * 2); c.fill();
    c.fillStyle = mix(gold, '#ffffff', 0.45); c.beginPath(); c.arc(x, y, px(big ? 1.8 : 1), 0, Math.PI * 2); c.fill();
  }

  function thumb(canvas, p, cover) {
    readPalette(); // the theme may have changed since the last picture
    const r = canvas.getBoundingClientRect();
    const d = Math.min(2, global.devicePixelRatio || 1);
    const w = Math.max(60, r.width || 140), h = Math.max(60, r.height || 110);
    canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
    const c = canvas.getContext('2d');
    // `cover`: the map fills the picture, centred on its drawings (the big card of the library).
    let k, ox, oy;
    if (cover) {
      k = Math.max(w / p.width, h / p.height);
      const b = p.elements.length ? p.elements.map((e) => M.bounds(e.shape)).reduce((a, x) => [Math.min(a[0], x[0]), Math.min(a[1], x[1]), Math.max(a[2], x[2]), Math.max(a[3], x[3])]) : [0, 0, p.width, p.height];
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      ox = Math.min(0, Math.max(w - p.width * k, w / 2 - cx * k));
      oy = Math.min(0, Math.max(h - p.height * k, h / 2 - cy * k));
    } else {
      k = Math.min((w - 12) / p.width, (h - 12) / p.height);
      ox = (w - p.width * k) / 2; oy = (h - p.height * k) / 2;
    }
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
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // A right click on an element, while drawing: its menu, as a long press.
      if (mode !== 'edit' || !place || e.pointerType === 'touch') return;
      const r = cv.getBoundingClientRect();
      const el = elementAt(toWorld(e.clientX - r.left, e.clientY - r.top));
      if (el && api.onHold) { gesture = null; select(el); api.onHold(el, e.clientX, e.clientY); }
    });
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
    dropTrail();
    place = p; world = w; selected = null; group.clear(); undoStack.length = 0; redoStack.length = 0; base = null; clearTimeout(commitTimer); commit();
    fit();
    dirty = true;
  }
  function setMode(m) { if (m !== mode) dropTrail(); mode = m; if (m === 'play') select(null); dirty = true; }
  function setTool(t) { tool = t; if (api.onTool) api.onTool(t); dirty = true; }
  function setStamp(id) { stamp = id; setTool('stamp'); }
  let stampSizer = null;
  /** fn(stampId, place) gives the size of a place being laid, in units of the map. */
  function setStampSizer(fn) { stampSizer = fn; }
  function select(el, keepGroup) {
    if (!keepGroup) group.clear();
    if (el) group.delete(el);
    if (selected === el) { dirty = true; return; }
    selected = el;
    dirty = true;
    if (api.onSelect) api.onSelect(el);
  }
  /** Every place selected: the one shown in the panel first. */
  function selection() { return selected ? [selected, ...[...group].filter((e) => place.elements.includes(e) && e !== selected)] : []; }
  /** Shift-click: a place joins the selection (it is the one the panel shows), or leaves it. */
  function toggleSelect(el) {
    if (!el) return;
    if (el === selected) { const next = [...group].find((e) => place.elements.includes(e)) || null; if (next) group.delete(next); selected = null; select(next, true); return; }
    if (group.has(el)) { group.delete(el); dirty = true; if (api.onSelect) api.onSelect(selected); return; }
    if (selected) group.add(selected);
    select(el, true);
  }
  function selectAll() {
    const all = place.elements.filter((e) => !untouchable(e));
    if (!all.length) return 0;
    group.clear(); all.slice(1).forEach((e) => group.add(e));
    selected = null; select(all[0], true);
    return all.length;
  }
  function deleteSelected() {
    if (!selected) return;
    snapshot();
    const gone = new Set(selection());
    place.elements = place.elements.filter((e) => !gone.has(e));
    select(null);
    edited();
  }
  /** The element under a point of the screen (client coordinates), for a sound dropped on the map. */
  function elementAtClient(cx, cy) {
    if (!place || !cv) return null;
    const r = cv.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return undefined;
    return elementAt(toWorld(cx - r.left, cy - r.top));
  }
  /** The element a dragged sound would join (null: none), outlined on the map. */
  let hoverEl = null;
  function dropHover(el) { if (hoverEl !== el) { hoverEl = el || null; light = true; } }
  function flash(el) { selected = el; dirty = true; if (api.onSelect) api.onSelect(el); }
  function centreOn(p) { view.x = W / 2 - p[0] * view.k; view.y = H / 2 - p[1] * view.k; dirty = true; }

  Object.assign(api, {
    mount, show, setMode, thumb, palette: () => { if (!pal) readPalette(); return pal; }, setTool, tool: () => tool, setStamp, setStampSizer, layers, zoomBy: (f) => { zoomAt(W / 2, H / 2, f); }, zoomShown: () => (place && W > 50 ? view.k / Math.min(W / place.width, H / place.height) : 1), select, selection, toggleSelect, selectAll, nudge, fit, fill, undo, redo, commit, commitSoon, copy, cut, paste, duplicate, hasClip: () => !!clip, elementAtClient, flash, hover: dropHover, snapshot, deleteSelected, centreOn,
    storyThumb,
    __toScreen: (p) => toScreen(p), __place: () => place, __findPath: (a, b) => findPath(a, b), sendTo, snap: (on) => (on === undefined ? snapOn : setSnap(on)), guides: () => guides.slice(), __reachHandle: () => selected && reachHandle(selected), edited, __trail: () => trail && { phase: trail.phase, n: trail.pts.length, pts: trail.pts.map((q) => q.slice()) }, redraw: () => { dirty = true; }, touch: () => { light = true; }, zoom: (f) => zoomAt(W / 2, H / 2, f),
    tool: () => tool, mode: () => mode, selected: () => selected, canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0, history: () => ({ undo: undoStack.length, redo: redoStack.length }),
  });
  global.MapView = api;
})(window);
