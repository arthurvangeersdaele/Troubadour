/* Troubadour Map: reads and writes .troubadour-map files, and the geometry of hearing.
 * Spec: TROUBADOUR_MAP_FORMAT.md at the repo root.
 *
 * A .troubadour-map file is a .troubadour file with one more entry: map.json, the world (its places,
 * their walls and elements). story.json and the audio stay exactly as in the .troubadour it was made from.
 *
 * Needs ../troupe/troubadour-format.js (window.Troubadour) for the ZIP reader and writer.
 */
(function (global) {
  'use strict';

  const B = global.Troubadour;
  const MAP_VERSION = 1;
  const ZONES = ['music', 'ambience', 'events'];
  const PLAYS = ['once', 'twice', 'loop', 'random'];
  const STAMPS = ['lake', 'mountains', 'hill', 'forest', 'tree', 'swamp', 'rocks', 'fire', 'tower', 'ruins', 'cave', 'stairs', 'door', 'bridge', 'tent', 'well', 'altar', 'grave'];
  const W = 2000, H = 1250;

  const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const shortId = () => Math.random().toString(36).slice(2, 9);

  /** Every sound of a story: { name, file, zone, chapter (index, or -1 for the soundbox), loop, volume } */
  function soundsOf(story) {
    const out = [];
    (story.chapters || []).forEach((c, i) => ZONES.forEach((z) => (c[z] || []).forEach((s) => out.push({ name: s.name, file: s.file, zone: z, chapter: i, loop: s.loop, volume: s.volume }))));
    (story.soundbox || []).forEach((s) => out.push({ name: s.name, file: s.file, zone: 'soundbox', chapter: -1, loop: s.loop, volume: s.volume }));
    return out;
  }

  /* ---------- Cleaning ---------- */

  function cleanCard(c) {
    const out = Object.assign({}, c);
    out.name = String(c.name || 'Sound').slice(0, 120);
    out.file = String(c.file || '');
    out.zone = ['music', 'ambience', 'events', 'soundbox'].includes(c.zone) ? c.zone : 'events';
    out.play = PLAYS.includes(c.play) ? c.play : 'loop';
    out.autoplay = c.autoplay !== false;
    if (out.play === 'random') {
      out.gapMin = r1(num(c.gapMin, 5, 0, 600));
      out.gapMax = r1(num(c.gapMax, Math.max(out.gapMin, 30), out.gapMin, 600));
    } else { delete out.gapMin; delete out.gapMax; }
    out.volume = r2(num(c.volume, 0.75, 0, 1));
    return out;
  }

  const pt = (p, w, h) => [Math.round(num(p && p[0], 0, -w, 2 * w)), Math.round(num(p && p[1], 0, -h, 2 * h))];

  function cleanShape(s, w, h) {
    if (s && s.type === 'stamp') {
      const out = Object.assign({}, s);
      out.stamp = String(s.stamp || 'lake');
      out.x = Math.round(num(s.x, w / 2, -w, 2 * w));
      out.y = Math.round(num(s.y, h / 2, -h, 2 * h));
      out.size = Math.round(num(s.size, 160, 10, 4000));
      out.rotation = Math.round(num(s.rotation, 0, -360, 360));
      return out;
    }
    const pts = Array.isArray(s && s.points) ? s.points.map((p) => pt(p, w, h)) : [];
    if (!pts.length) return null;
    return Object.assign({}, s, { type: 'path', closed: !!(s && s.closed) && pts.length > 2, points: pts });
  }

  function cleanElement(e, w, h) {
    const shape = cleanShape(e && e.shape, w, h);
    if (!shape) return null;
    const out = Object.assign({}, e);
    out.id = String(e.id || shortId());
    out.title = String(e.title || '').slice(0, 80);
    out.shape = shape;
    out.radius = Math.round(num(e.radius, 200, 0, 4000));
    out.cards = (e.cards || []).map(cleanCard);
    out.link = e.link ? String(e.link) : null;
    return out;
  }

  function cleanPlace(p, i) {
    const out = Object.assign({}, p);
    out.id = String(p.id || `place-${i + 1}`);
    out.title = String(p.title || `Place ${i + 1}`).slice(0, 80);
    out.width = Math.round(num(p.width, W, 400, 8000));
    out.height = Math.round(num(p.height, H, 400, 8000));
    out.player = pt(p.player || [out.width / 2, out.height / 2], out.width, out.height);
    out.general = (p.general || []).map(cleanCard);
    out.walls = (p.walls || []).map((w) => Object.assign({}, w, { points: (w.points || []).map((q) => pt(q, out.width, out.height)) })).filter((w) => w.points.length >= 2);
    out.elements = (p.elements || []).map((e) => cleanElement(e, out.width, out.height)).filter(Boolean);
    return out;
  }

  /** Brings a world in line with its story: ids unique, links to places that exist, cards on sounds the archive holds. */
  function normalize(world, files) {
    const out = Object.assign({}, world);
    out.wallLoss = r2(num(world.wallLoss, 0.7, 0, 1));
    const seen = new Set();
    out.places = (world.places || []).map(cleanPlace).map((p) => {
      while (seen.has(p.id)) p.id = `${p.id}-${shortId()}`;
      seen.add(p.id);
      return p;
    });
    if (!out.places.length) out.places = [newPlace('The first place')];
    const ids = new Set(out.places.map((p) => p.id));
    const keep = (c) => !files || files.has(c.file);
    out.places.forEach((p) => {
      p.general = p.general.filter(keep);
      const eids = new Set();
      p.elements.forEach((e) => {
        while (eids.has(e.id)) e.id = `${e.id}-${shortId()}`;
        eids.add(e.id);
        e.cards = e.cards.filter(keep);
        if (e.link && !ids.has(e.link)) e.link = null;
      });
    });
    return out;
  }

  function newPlace(title, id) {
    return { id: id || `place-${shortId()}`, title: title || 'New place', width: W, height: H, player: [W / 2, Math.round(H * 0.72)], general: [], walls: [], elements: [] };
  }

  /** A card made from a sound of the story, ready to be heard on the map: music and ambiances loop,
   *  events and soundbox effects come back at random; all start with the place. */
  function card(sound, opts = {}) {
    const play = sound.zone === 'events' || sound.zone === 'soundbox' ? 'random' : 'loop';
    return cleanCard(Object.assign({ name: sound.name, file: sound.file, zone: sound.zone, play, autoplay: true, volume: typeof sound.volume === 'number' ? sound.volume : 0.75 }, opts));
  }

  function worldOf(story, places, bard) {
    return normalize({
      format: 'troubadour-map', version: MAP_VERSION, id: B.uuid(), story: story.id || null, revision: 0,
      bard: bard || B.FORGOTTEN, created: now(), wallLoss: 0.7, places,
    });
  }

  /** A first world from a plain .troubadour: one empty place per chapter. Its sounds wait in the sound list,
   *  nothing is laid on the map yet. */
  function defaultWorld(story, bard) {
    const chs = (story.chapters || []).filter((c) => c.map !== true);
    return worldOf(story, chs.length ? chs.map((c, i) => newPlace(c.title || `Chapter ${i + 1}`, `place-${i + 1}`)) : [newPlace('The first place', 'place-1')], bard);
  }

  /** The chapter of story.json that holds the sounds added in Troubadour Map (made when first needed). */
  const OWN = 'Map sounds';
  function ownChapter(story) {
    let c = (story.chapters || []).find((x) => x.title === OWN && x.map === true);
    if (!c) { c = { title: OWN, map: true, music: [], ambience: [], events: [] }; story.chapters = (story.chapters || []).concat(c); }
    return c;
  }

  /** A blank world: a story with no sound yet, and one empty place. */
  function blankStory(title, bard) {
    const stamp = now();
    const story = { format: 'troubadour', version: 2, id: B.uuid(), revision: 0, bard: bard || B.FORGOTTEN, title: title || 'New world', description: '', created: stamp, generator: 'Troubadour Map (web)', chapters: [], soundbox: [] };
    ownChapter(story);
    return story;
  }
  function blankWorld(story, bard) { return worldOf(story, [newPlace('The first place', 'place-1')], bard); }

  /* ---------- Geometry of hearing ---------- */

  /** Nearest point to p on the segment a-b, and its squared distance. */
  function nearestOnSegment(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q = [a[0] + t * dx, a[1] + t * dy];
    return { q, d2: (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 };
  }

  function inside(p, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  /** How far p is from an element, and the nearest point of it: { d, q } (d 0 and q p when p is inside). */
  function reach(p, shape) {
    if (shape.type === 'stamp') {
      const r = shape.size / 2;
      const dx = p[0] - shape.x, dy = p[1] - shape.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= r) return { d: 0, q: p };
      return { d: dist - r, q: [shape.x + (dx / dist) * r, shape.y + (dy / dist) * r] };
    }
    const pts = shape.points;
    if (pts.length === 1) return { d: Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]), q: pts[0] };
    if (shape.closed && inside(p, pts)) return { d: 0, q: p };
    let best = { q: pts[0], d2: Infinity };
    const n = shape.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const r = nearestOnSegment(p, pts[i], pts[(i + 1) % pts.length]);
      if (r.d2 < best.d2) best = r;
    }
    return { d: Math.sqrt(best.d2), q: best.q };
  }

  /** Does the line p1-p2 cross the wall segment p3-p4? The wall segment counts its start point but not its end,
   *  so a line through the joint of two wall segments crosses one wall, not two (and never slips through). */
  function crosses(p1, p2, p3, p4) {
    const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
    if (d1 * d2 >= 0) return false;
    return d3 * d4 < 0 || (d3 === 0 && d4 !== 0);
  }

  /** How many wall segments stand between a and b. */
  function wallsBetween(a, b, walls) {
    let n = 0;
    walls.forEach((w) => { for (let i = 0; i < w.points.length - 1; i++) if (crosses(a, b, w.points[i], w.points[i + 1])) n += 1; });
    return n;
  }

  /** The share of an element's sound heard at p: { gain (0 to 1), d, walls }. */
  function hearing(p, el, walls, wallLoss) {
    const { d, q } = reach(p, el.shape);
    if (d > 0 && d >= el.radius) return { gain: 0, d, walls: 0 };
    const near = d > 0 ? 1 - d / el.radius : 1;
    const n = d > 0 ? wallsBetween(p, q, walls) : 0;
    return { gain: near * Math.pow(1 - wallLoss, n), d, walls: n };
  }

  /** Bounding box of a shape: [x0, y0, x1, y1]. */
  function bounds(shape) {
    if (shape.type === 'stamp') { const r = shape.size / 2; return [shape.x - r, shape.y - r, shape.x + r, shape.y + r]; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shape.points.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    return [x0, y0, x1, y1];
  }
  function centre(shape) {
    if (shape.type === 'stamp') return [shape.x, shape.y];
    const b = bounds(shape);
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }

  /** A hand-drawn line made lighter: Ramer-Douglas-Peucker, keeping points further than `eps` from the line. */
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let best = -1, bd = 0;
      for (let i = a + 1; i < b; i++) {
        const d = nearestOnSegment(pts[i], pts[a], pts[b]).d2;
        if (d > bd) { bd = d; best = i; }
      }
      if (best > 0 && bd > eps * eps) { keep[best] = 1; stack.push([a, best], [best, b]); }
    }
    return pts.filter((_, i) => keep[i]).map((p) => [Math.round(p[0]), Math.round(p[1])]);
  }

  /* ---------- Reading ---------- */

  /** Reads a .troubadour or a .troubadour-map. Resolves with { story, world (null for a plain .troubadour), files: Map(path => Blob) }. */
  async function read(file, onProgress) {
    const zip = await B.readZip(file);
    if (!zip.has('story.json')) throw new Error('This file has no story.json: it is not a Troubadour story.');
    const story = JSON.parse(await (await zip.get('story.json')()).text());
    if (story.format !== 'troubadour' && story.format !== 'bardic') throw new Error('story.json is not a Troubadour story.');
    if (story.version !== 1 && story.version !== 2) throw new Error(`This story uses format version ${story.version}, which Troubadour Map does not know yet.`);
    if (story.version === 1) story.bard = story.bard || story.author || B.FORGOTTEN;
    let world = null;
    if (zip.has('map.json')) {
      world = JSON.parse(await (await zip.get('map.json')()).text());
      if (world.format !== 'troubadour-map') throw new Error('map.json is not a Troubadour Map.');
      if (world.version !== MAP_VERSION) throw new Error(`This world uses version ${world.version}, which this Troubadour Map does not know yet. Update the app.`);
    }
    const fromMap = world ? (world.places || []).flatMap((p) => (p.general || []).concat(...(p.elements || []).map((e) => e.cards || [])).map((c) => c.file)) : [];
    const paths = [...new Set(soundsOf(story).map((s) => s.file).concat(fromMap))].filter((p) => p && zip.has(p));
    const files = new Map();
    let n = 0;
    for (const p of paths) {
      const blob = await zip.get(p)();
      const type = /\.ogg$/i.test(p) ? 'audio/ogg' : /\.m4a$/i.test(p) ? 'audio/mp4' : /\.wav$/i.test(p) ? 'audio/wav' : 'audio/mpeg';
      files.set(p, new Blob([blob], { type }));
      n += 1;
      if (onProgress) onProgress(n, paths.length);
    }
    return { story, world, files };
  }

  /* ---------- Writing ---------- */

  function yymmdd(d = new Date()) {
    return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Forges the next revision of the world. Resolves with { blob, world, fileName }. */
  async function pack(story, world, files, bard, onProgress, generator) {
    const stamp = now();
    const out = Object.assign({}, world, {
      format: 'troubadour-map',
      version: MAP_VERSION,
      id: world.id || B.uuid(),
      story: story.id || null,
      revision: (world.revision || 0) + 1,
      bard: (bard || B.FORGOTTEN).trim(),
      created: world.created || stamp,
      forged: stamp,
      generator: generator || 'Troubadour Map (web)',
    });
    const entries = [
      { name: 'story.json', data: new TextEncoder().encode(JSON.stringify(story, null, 2) + '\n') },
      { name: 'map.json', data: new TextEncoder().encode(JSON.stringify(out, null, 2) + '\n') },
    ];
    [...files.keys()].sort().forEach((p) => entries.push({ name: p, data: files.get(p) }));
    const blob = await B.writeZip(entries, onProgress);
    return { blob, world: out, fileName: `${yymmdd()}_${B.slug(story.title, 'world')}.troubadour-map` };
  }

  /** The story alone, as a plain .troubadour. */
  async function packTroubadour(story, files, onProgress) {
    const used = new Set(soundsOf(story).map((s) => s.file));
    const entries = [{ name: 'story.json', data: new TextEncoder().encode(JSON.stringify(story, null, 2) + '\n') }];
    [...files.keys()].filter((p) => used.has(p)).sort().forEach((p) => entries.push({ name: p, data: files.get(p) }));
    const blob = await B.writeZip(entries, onProgress);
    return { blob, fileName: `${yymmdd()}_${B.slug(story.title, 'story')}.troubadour` };
  }

  global.TroubadourMap = {
    MAP_VERSION, ZONES, PLAYS, STAMPS, OWN, soundsOf, ownChapter, blankStory, blankWorld, cleanCard, cleanElement, cleanPlace, normalize, newPlace, card, defaultWorld,
    reach, crosses, wallsBetween, hearing, bounds, centre, simplify, inside, nearestOnSegment, shortId,
    read, pack, packTroubadour, yymmdd,
  };
})(window);
