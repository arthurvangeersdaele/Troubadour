/* Troubadour Map: library, import and export, the panel beside the map, settings and routing.
 *   #/                  the worlds kept on this device
 *   #/play/<uid>/<n>    a world at the table, on its place n
 *   #/edit/<uid>/<n>    the editor of a world (drawing, sounds, places)
 */
(function () {
  'use strict';

  const VERSION = '261108.24';
  const { $, el, svg, ICON, settings, saveSettings, applyTheme, toast, busy, idle, ask, deliver, audio, decode, applyAudioSession } = window.MapUI;
  const M = window.TroubadourMap;
  const DB = window.MapDB;
  const V = window.MapView;
  const A = window.MapAudio;
  const pc = () => document.documentElement.classList.contains('pc');

  let screen = '';
  let rec = null;          // the world on screen: { uid, story, world, files }
  let pi = 0;              // index of its place on screen
  let mode = 'edit';
  let tapped = null;       // at the table: the element whose sounds the panel shows
  let saveTimer = 0;
  const buffers = new Map(); // file => AudioBuffer, for the world on screen
  const place = () => rec.world.places[pi];

  /* ================= Library ================= */

  /** The ways to add a world: on the library when it is empty, and behind the + of the top bar. */
  function addDoors(then = () => {}) {
    const go = (fn) => () => { then(); fn(); };
    const door = (kind, icon, title, text, fn) => {
      const d = el('button', `ldoor d-${kind}`);
      d.type = 'button';
      d.innerHTML = `<span class="di">${icon}</span>`;
      d.append(el('b', '', title), el('span', '', text));
      d.addEventListener('click', fn);
      return d;
    };
    return [
      door('new', ICON.plus, 'New world', 'A blank map, with your own sounds', go(newWorld)),
      door('import', ICON.import, 'Import', 'A .troubadour or .troubadour-map file', go(pickFile)),
    ];
  }
  function openAddWorld() {
    $('#sheet-title').textContent = 'Add a world';
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = '';
    const doors = el('div', 'lib-doors add-doors');
    doors.append(...addDoors(() => $('#sheet').close()));
    body.append(doors);
    $('#sheet').showModal();
  }

  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const cardCount = (r) => r.world.places.reduce((a, p) => a + p.general.length + p.elements.reduce((b, e) => b + e.cards.length, 0), 0);
  /** A small picture of the world's first place, in place of a cover. */
  /* The colour of a world, as Troubadour picks the tint of a story cover (cover.js): the one its story carries,
   * else one drawn from its key. Its colours come from the theme. */
  const TINTS = ['amb', 'evt', 'blue', 'violet', 'ember'];
  const TINT_HEX = { amb: '#4DB6A6', evt: '#E5655B', blue: '#5B9BF5', violet: '#B58AE8', ember: '#E39B54', gold: '#E0A84B' };
  const TINT_CSS = { amb: 'var(--amb)', evt: 'var(--evt)', blue: 'var(--blue)', violet: 'color-mix(in srgb, var(--evt) 50%, var(--blue))', ember: 'color-mix(in srgb, var(--music) 55%, var(--evt))', gold: 'var(--music)' };
  function tintOf(r) {
    const carried = r.story.extra && r.story.extra.cover;
    if (carried) {
      if (TINT_CSS[carried.tint]) return carried.tint;
      const k = Object.keys(TINT_HEX).find((t) => TINT_HEX[t].toUpperCase() === String(carried.color || '').toUpperCase());
      if (k) return k;
    }
    const key = String(r.world.id || r.story.id || r.uid || 'world');
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return TINTS[(h >>> 8) % TINTS.length];
  }
  /** A theme colour (var() or color-mix) as the canvas can paint it. */
  function solid(css) {
    const probe = el('span');
    probe.style.color = css;
    probe.hidden = true;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }
  /** A small picture of the world's first map, dressed as a Troubadour story cover (its tint, gold wires, light). */
  function mapCover(r, big, card) {
    const cv = el('canvas', 'cover');
    cv.setAttribute('aria-hidden', 'true');
    const tint = TINT_CSS[tintOf(r)];
    window.MapStamps.register(r.world.stamps);
    cv.style.setProperty('--cv-c', tint);
    if (card) card.style.setProperty('--c', tint);
    requestAnimationFrame(() => V.storyThumb(cv, r.world.places[0], solid(tint)));
    return cv;
  }
  function btnEl(cls, html, label, fn) {
    const b = el('button', cls);
    b.type = 'button';
    b.innerHTML = html;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }
  const playAt = (r) => { location.hash = `#/play/${r.uid}/0`; };
  const editAt = (r) => { location.hash = `#/edit/${r.uid}/0`; };

  function heroCard(r) {
    const c = el('section', 'hero mp-hero');
    c.append(mapCover(r, true, c));
    const inner = el('div', 'hero-in');
    const kick = el('div', 'hero-kick');
    kick.append(el('span', 'tag', r.world.revision ? `Revision ${r.world.revision}` : 'World'), el('span', 'kick', 'Last opened'));
    inner.append(kick, el('h2', '', r.story.title || 'World'));
    inner.append(el('p', 'hero-sub clamp', r.world.places.map((p) => p.title).join(', ')));
    inner.append(el('p', 'hero-meta', `${plural(r.world.places.length, 'map')}, ${plural(cardCount(r), 'sound card')}, by ${r.world.bard || r.story.bard || 'Forgotten Troubadour'}`));
    inner.append(el('span', 'grow'));
    const acts = el('div', 'hero-acts');
    acts.append(
      btnEl('hb primary', `${ICON.play}<span>Play</span>`, null, () => playAt(r)),
      btnEl('hb more', ICON.more, `More: ${r.story.title}`, () => worldMenu(r)),
    );
    inner.append(acts);
    c.append(inner);
    openOnTap(c, r);
    return c;
  }
  /** As in Troubadour: a tap anywhere on a world (not on its buttons) plays it. */
  function openOnTap(card, r) {
    card.classList.add('tappable');
    card.addEventListener('click', (e) => { if (!e.target.closest('button, a')) playAt(r); });
  }

  function worldRow(r) {
    const row = el('div', 'srow');

    const txt = el('div', 'stxt');
    txt.append(el('b', '', r.story.title || 'World'), el('span', 'meta', `${plural(r.world.places.length, 'map')}, ${plural(cardCount(r), 'sound card')}`));
    row.append(mapCover(r, false, row), txt,
      btnEl('more', ICON.more, `More: ${r.story.title}`, () => worldMenu(r)),
      btnEl('go', ICON.play, `Play ${r.story.title}`, () => playAt(r)));
    openOnTap(row, r);
    return row;
  }

  async function renderLibrary() {
    const grid = $('#world-list');
    const recs = await DB.list();
    grid.textContent = '';
    if (!recs.length) {
      const hello = el('div', 'hello');
      hello.innerHTML = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';
      hello.append(el('h1', '', 'Your world awaits'), el('p', 'lead', 'Draw the maps of your world, lay your sounds on the map, and hear what the party hears as it walks. Start a blank world, or import a .troubadour story.'));
      grid.append(hello, el('h3', 'lib-h', 'Add a world'));
      const doors = el('div', 'lib-doors');
      doors.append(...addDoors());
      grid.append(doors);
      return;
    }
    const [first, ...rest] = recs;
    const wrap = el('div', 'lib-b');
    wrap.append(heroCard(first));
    const list = el('div', 'lib-list');
    list.append(el('h3', 'lib-h', rest.length ? 'All worlds' : 'Your worlds'));
    rest.forEach((r) => list.append(worldRow(r)));
    const add = el('button', 'srow add');
    add.type = 'button';
    add.innerHTML = `<span class="add-i">${ICON.plus}</span>`;
    const at = el('span', 'stxt');
    at.append(el('b', '', 'Add a world'), el('span', 'meta', 'New, or a .troubadour or .troubadour-map file'));
    add.append(at);
    add.addEventListener('click', openAddWorld);
    list.append(add);
    wrap.append(list);
    grid.append(wrap);
  }

  /** The sizes of a map, as the editor offers them. */
  const SIZES = [['Small', 1600, 1000], ['Medium', 2000, 1250], ['Large', 3200, 2000], ['Huge', 4800, 3000]];
  const sizeField = (p) => ({ label: 'Map size', options: SIZES.map(([l]) => [l, l]), value: (SIZES.find(([, w, h]) => p && p.width === w && p.height === h) || SIZES[1])[0] });
  /** A map takes a new size: what is drawn on it stretches with it. */
  function resizePlace(p, label) {
    const z = SIZES.find(([l]) => l === label);
    if (!z || (p.width === z[1] && p.height === z[2])) return false;
    const fx = z[1] / p.width, fy = z[2] / p.height;
    const sc = (q) => [Math.round(q[0] * fx), Math.round(q[1] * fy)];
    p.width = z[1]; p.height = z[2];
    p.player = sc(p.player);
    p.walls.forEach((w) => { w.points = w.points.map(sc); });
    p.elements.forEach((e) => {
      const sh = e.shape;
      if (sh.type === 'stamp') { sh.x = Math.round(sh.x * fx); sh.y = Math.round(sh.y * fy); sh.size = Math.round(sh.size * Math.sqrt(fx * fy)); } else sh.points = sh.points.map(sc);
      if (e.radius) e.radius = Math.round(e.radius * Math.sqrt(fx * fy));
    });
    return true;
  }

  async function newWorld() {
    const a = await ask('New world', 'A name for your world and for its first map. You add the sounds while you draw.', [
      { label: 'Cancel', value: null }, { label: 'Create', value: 'ok', cls: 'primary' },
    ], { label: 'World', placeholder: 'The Drowned Abbey', max: 120, second: { label: 'First map', placeholder: 'The village', max: 80 }, sizes: sizeField(null) });
    if (!a || !a.value) return;
    const bard = window.Troubadour.bardName();
    const story = M.blankStory(a.text || 'New world', bard);
    const world = M.blankWorld(story, bard);
    world.places[0].title = a.text2 || 'Map 1';
    resizePlace(world.places[0], a.size);
    const r = await DB.put({ uid: DB.uid(), story, world, files: {} });
    location.hash = `#/edit/${r.uid}/0`;
  }

  function menu(title, items) {
    $('#sheet-title').textContent = title;
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = 'mp-menu';
    items.forEach(([icon, label, sub, fn, cls]) => {
      const b = el('button', `mp-menu-item ${cls || ''}`);
      b.type = 'button';
      b.innerHTML = icon;
      const t = el('span');
      t.append(el('b', '', label), el('small', '', sub));
      b.append(t);
      b.addEventListener('click', () => { $('#sheet').close(); fn(); });
      body.append(b);
    });
    $('#sheet').showModal();
  }

  function worldMenu(r, fromTable) {
    menu(r.story.title || 'World', [
      ...(fromTable ? [] : [[ICON.edit, 'Edit the world', 'Draw its maps, lay its sounds', () => editAt(r)]]),
      [ICON.share, 'Export .troubadour-map', 'Forges the next revision, signed with your troubadour name', () => exportWorld(r)],
      [ICON.trash, 'Remove from this device', 'Keep a .troubadour-map if you want it back', async () => {
        const ok = await ask(`Remove ${r.story.title}?`, 'Its maps, its drawings and its sounds leave this device.', [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, cls: 'danger' }]);
        if (!ok) return;
        await DB.remove(r.uid);
        if (rec && rec.uid === r.uid) { leaveOk = true; location.hash = '#/'; } else renderLibrary();
      }, 'danger'],
    ]);
  }

  async function exportWorld(r) {
    try {
      flush();
      busy('Forging the .troubadour-map', '', 0);
      const files = await DB.filesOf(r);
      const out = await M.pack(r.story, r.world, files, window.Troubadour.bardName(), (f) => busy('Forging the .troubadour-map', '', f), `Troubadour Map ${VERSION}`);
      // Keep the forged revision, but not a copy: the record holds the live world.
      Object.assign(r.world, { id: out.world.id, revision: out.world.revision, bard: out.world.bard, created: out.world.created, forged: out.world.forged, generator: out.world.generator });
      await DB.put(r);
      idle();
      await deliver(out.blob, out.fileName);
    } catch (e) { idle(); toast(`Could not forge: ${e.message || e}`, 4200); }
  }


  /* ================= Import ================= */
  function pickFile() {
    const input = $('#pick-file');
    if (!document.documentElement.classList.contains('ios')) input.accept = '.troubadour,.troubadour-map,.bardic,application/zip';
    input.value = '';
    input.click();
  }

  async function importFile(file) {
    const isMap = /\.troubadour-map$/i.test(file.name);
    try {
      busy('Opening the story', file.name, 0);
      const { story, world, files } = await M.read(file, (n, t) => busy('Opening the story', `Sound ${n} of ${t}`, n / t));
      let wd = world ? M.normalize(world, files) : M.defaultWorld(story, window.Troubadour.bardName());
      const all = await DB.list();
      let uid = DB.uid();
      const twin = all.find((r) => (world ? r.world.id === wd.id : r.story.id && r.story.id === story.id && !r.world.revision));
      if (twin) {
        idle();
        const newer = world && (wd.revision || 0) > (twin.world.revision || 0);
        const answer = await ask(`${story.title} is already here`, world
          ? `This device holds revision ${twin.world.revision || 0} of this world; the file is revision ${wd.revision || 0}.${newer ? ' The file is newer.' : ''}`
          : 'A world of this story, never forged yet, is already on this device.', [
          { label: 'Cancel', value: null },
          { label: 'Keep both', value: 'both' },
          { label: 'Replace', value: 'replace', cls: 'primary' },
        ]);
        if (!answer) return;
        if (answer === 'replace') uid = twin.uid;
        else if (world) wd = Object.assign({}, wd, { id: window.Troubadour.uuid(), revision: 0 });
      }
      const keys = {};
      let n = 0;
      for (const [p, b] of files) {
        n += 1;
        busy('Keeping the sounds on this device', `${n} of ${files.size}`, n / files.size);
        keys[p] = await DB.putBlob(b);
      }
      const r = await DB.put({ uid, story, world: wd, files: keys });
      await DB.collect();
      idle();
      if (!world) { toast('Your world is ready: one map per chapter. Its sounds wait in Add sounds: draw the map, then lay them on it.', 5200); location.hash = `#/edit/${r.uid}/0`; }
      else { toast(`${story.title} is ready.`); location.hash = `#/play/${r.uid}/0`; }
    } catch (e) {
      idle();
      toast(`${isMap ? 'This .troubadour-map' : 'This file'} could not be opened: ${e.message || e}`, 5200);
    }
  }

  /* ================= Saving ================= */
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }
  function flush() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (rec) DB.put(rec).catch((e) => toast(`Could not save: ${e.message || e}`, 4000));
  }

  /* ================= Sounds of the world ================= */
  async function ensure(fileList, label) {
    const need = [...new Set(fileList)].filter((f) => f && !buffers.has(f) && rec.files[f]);
    let n = 0;
    for (const f of need) {
      n += 1;
      if (need.length > 2 && label !== false) busy('Loading the sounds', `${n} of ${need.length}`, n / need.length);
      try { buffers.set(f, await decode(await DB.getBlob(rec.files[f]))); } catch (e) { /* unreadable: stays silent */ }
    }
    if (need.length > 2 && label !== false) idle();
  }
  const placeFiles = (p) => p.general.map((c) => c.file).concat(...p.elements.map((e) => e.cards.map((c) => c.file)));

  /** One sound previewed in the editor or the sound picker, on its own. */
  let preview = null;
  async function listen(file, btn, getBlob) {
    const { ctx: c0 } = audio(true); // inside the tap: wakes the audio before anything waits
    if (c0.state !== 'running') c0.resume().catch(() => {});
    if (preview) { const was = preview; preview = null; try { was.src.stop(); } catch (e) { /* done */ } if (was.btn) was.btn.innerHTML = ICON.play; if (was.file === file) return; }
    if (btn) btn.classList.add('wait');
    try {
      if (getBlob && !buffers.has(file)) buffers.set(file, await decode(await getBlob()));
      else await ensure([file], false);
    } catch (e) { /* unreadable */ }
    if (btn) btn.classList.remove('wait');
    const buf = buffers.get(file);
    if (!buf) { toast('This sound cannot be read here.'); return; }
    const { ctx, master } = audio(true);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start();
    preview = { src, file, btn };
    if (btn) btn.innerHTML = ICON.pause;
    src.onended = () => { if (preview && preview.src === src) { preview = null; if (btn) btn.innerHTML = ICON.play; } };
  }
  function stopPreview() { if (preview) listen(preview.file); }

  /* ================= A world ================= */
  const here = () => `#/${mode}/${rec.uid}/${pi}`;
  async function openWorld(r, n, m) {
    if (!(rec && rec.uid === r.uid)) {
      A.close(0);
      buffers.clear();
      rec = r;
      window.MapStamps.register(rec.world.stamps);
      buildStamps();
    }
    mode = m;
    goPlace(Math.max(0, Math.min(rec.world.places.length - 1, n || 0)), true);
  }

  /** Takes the party to another map by a way (a door, stairs): it arrives beside the way that leads back,
   *  on the side of the middle of the map, never on its sign. */
  function travel(to) {
    const from = place(), dest = rec.world.places[to];
    const back = dest.elements.find((e) => e.link === from.id);
    if (back) {
      const b = M.bounds(back.shape), c = M.centre(back.shape);
      const mid = [dest.width / 2, dest.height / 2];
      let dx = mid[0] - c[0], dy = mid[1] - c[1];
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const half = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2;
      const gap = half + Math.max(80, Math.min(dest.width, dest.height) * 0.08);
      dest.player = [Math.round(Math.max(20, Math.min(dest.width - 20, c[0] + dx * gap))), Math.round(Math.max(20, Math.min(dest.height - 20, c[1] + dy * gap)))];
      save();
    }
    goPlace(to);
  }

  async function goPlace(n, first) {
    stopPreview();
    pi = n;
    // At the table, the sound menu stays open on the whole map of the new place.
    tapped = undefined;
    if (mode === 'play') setPanel(true);
    $('#mw-title').textContent = rec.story.title || 'World';
    $('#mw-sub').textContent = `Map ${pi + 1}: ${place().title}`;
    $('#world').dataset.mode = mode; // the tools are laid out before the map fits beside them
    V.setMode(mode);
    V.show(place(), rec.world);
    renderPlaces();
    if (location.hash !== here()) history.replaceState(null, '', here());
    await setMode(mode, !first);
  }

  async function setMode(m, keepAudio) {
    mode = m;
    $('#world').dataset.mode = m;
    // The player leads nowhere but the table: the editor opens from the library.
    $('#mw-switch').hidden = m === 'play';
    // At the table, the sound menu opens on a double tap only (an element, or the map itself).
    // At the table, the sound menu opens on the whole map; while drawing, the panel follows the screen's width.
    tapped = undefined;
    setPanel(m === 'play');
    if (m !== 'play') { closeSoundbox(); closeMusic(); }
    const was = V.mode();
    V.setMode(m);
    if (was !== m) { V.fit(); renderPlaces(); }
    $('#mw-stamps').hidden = true;
    if (m === 'play') {
      await ensure(placeFiles(place()));
      A.setMusic(worldMusic());
      A.open(place(), rec.world, buffers);
      acquireWake();
      $('#mw-play-tip').textContent = `${settings.trail ? "Drag the golden point to draw the party's trail: it walks it a second later." : 'Drag the golden point to move the party.'} Double tap an element, or the map, for its sounds. Long press a sign to take its way.`;
      // The tip shows the first three times a world is played, and goes at the first touch of the map.
      let seen = 0;
      try { seen = Number(localStorage.getItem('troubadour.map.tips') || 0); } catch (e) { /* private mode */ }
      clearTimeout(setMode.tip);
      if (seen < 3 && !keepAudio) {
        try { localStorage.setItem('troubadour.map.tips', String(seen + 1)); } catch (e) { /* private mode */ }
        $('#mw-play-tip').classList.remove('gone');
        setMode.tip = setTimeout(() => $('#mw-play-tip').classList.add('gone'), 8000);
      } else $('#mw-play-tip').classList.add('gone');
    } else {
      if (!keepAudio || A.isOpen()) A.close();
      releaseWake();
    }
    renderPanel();
  }

  /** The maps of the world, as Troubadour's chapters: a numbered rail (a strip under the top bar on a narrow
   *  screen, and always at the table, so the map keeps the left of the screen). */
  function renderPlaces() {
    const rail = $('#mw-places');
    rail.textContent = '';
    rail.append(el('h3', '', 'Maps'));
    const links = new Set(place().elements.map((e) => e.link).filter(Boolean));
    rec.world.places.forEach((p, i) => {
      const b = el('button', 'chap');
      b.type = 'button';
      if (i === pi) b.setAttribute('aria-current', 'true');
      b.append(el('span', 'n', String(i + 1)), el('span', 't', p.title));
      if (links.has(p.id)) { const pin = el('i', 'way'); pin.innerHTML = ICON.pin; b.append(pin); b.title = `Map ${i + 1}: ${p.title}. An element of this map leads there`; }
      else b.title = `Map ${i + 1}: ${p.title}`;
      if (mode === 'edit' && i === pi) {
        // The map on screen: a tap renames it.
        const pen = el('i', 'ren'); pen.innerHTML = ICON.edit; b.append(pen);
        b.title += '. Tap to rename it';
      }
      b.addEventListener('click', () => { if (i !== pi) goPlace(i); else if (mode === 'edit') renamePlace(p); });
      rail.append(b);
      if (i === pi) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    });
    if (mode === 'edit') {
      const add = el('button', 'chap add');
      add.type = 'button';
      add.append(el('span', 'n', '+'), el('span', 't', 'New map'));
      add.addEventListener('click', () => addPlace());
      rail.append(add);
    }
    $('#mw-sub').textContent = `Map ${pi + 1}: ${place().title}`;
  }

  async function renamePlace(p) {
    const a = await ask('This map', 'Its name, and its size: what is drawn on it grows or shrinks with it.', [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', cls: 'primary' }], { label: 'Name', placeholder: `Map ${pi + 1}`, value: p.title, max: 80, sizes: sizeField(p) });
    if (!a || !a.value) return;
    if (a.text) p.title = a.text;
    const grown = resizePlace(p, a.size);
    save(); renderPlaces();
    if (grown) { V.show(p, rec.world); V.fit(); }
    if (!V.selected()) renderPanel();
  }
  async function addPlace(title) {
    if (!title) {
      const a = await ask('New map', 'A new map in this world: a cellar, the next town, the road between them.', [{ label: 'Cancel', value: null }, { label: 'Create', value: 'ok', cls: 'primary' }], { label: 'Name', placeholder: `Map ${rec.world.places.length + 1}`, max: 80, sizes: sizeField(null) });
      if (!a || !a.value) return null;
      title = a.text;
      addPlace.size = a.size;
    }
    const p = M.newPlace(title || `Map ${rec.world.places.length + 1}`);
    if (addPlace.size) { resizePlace(p, addPlace.size); addPlace.size = null; }
    rec.world.places.push(p);
    save();
    goPlace(rec.world.places.length - 1);
    return p;
  }

  /* ================= The panel ================= */
  /** Opens or closes the panel (at the table: the sound menu), and paints the Sounds button. */
  function setPanel(open) {
    $('#world').classList.toggle('panel', !!open);
    paintMenuBtn();
  }
  function paintMenuBtn() {
    const b = $('#mw-menu');
    if (b) b.setAttribute('aria-pressed', String($('#world').classList.contains('panel') && (mode === 'edit' ? !edView : !tapped)));
  }
  let liveRows = [];
  /** Builds cards whose live painting goes to `rows` instead of the sound menu's. */
  function withRows(rows, fn) { const was = liveRows; liveRows = rows; try { return fn(); } finally { liveRows = was; } }

  function slider(label, value, min, max, step, fmt, oninput) {
    const row = el('label', 'slide');
    const s = el('span', '', label);
    const input = el('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    const b = el('b', '', fmt(Number(value)));
    input.addEventListener('input', () => { b.textContent = fmt(Number(input.value)); oninput(Number(input.value)); });
    input.addEventListener('change', save);
    row.append(s, input, b);
    return row;
  }
  /** How far an element's sounds carry beyond its edge, in % of the width of its place. */
  function reachSlider(e) {
    const w = place().width;
    return slider('Heard up to', Math.round((e.radius / w) * 100), 0, 100, 1, (v) => `${v} %`, (v) => {
      e.radius = Math.round((v / 100) * w);
      if (A.isOpen()) A.hear();
      V.redraw();
    });
  }
  function section(title, extra) {
    const s = el('section', 'pn');
    const h = el('h3');
    h.append(el('span', '', title), el('span', 'grow'));
    if (extra) h.append(extra);
    s.append(h);
    return s;
  }
  const ZONE_LABEL = { music: 'Music', ambience: 'Ambiance', events: 'Event', soundbox: 'Soundbox' };

  /** The loop button, as in Troubadour: 1×, 2×, ∞, then random (ambiances, events) or play after (music). */
  const LOOP_LABEL = { once: '1×', twice: '2×', loop: '∞' };
  const LOOP_TITLE = { once: 'Plays once', twice: 'Plays twice', loop: 'Plays again and again', random: 'Random: plays again after a random pause', after: 'Play after: starts when another music ends on its own' };
  function paintLoop(btn, c) {
    btn.className = `loop${c.play === 'loop' ? ' inf' : c.play === 'random' ? ' rnd' : c.play === 'after' ? ' aft' : ''}`;
    if (c.play === 'random') btn.innerHTML = ICON.random; else if (c.play === 'after') btn.innerHTML = ICON.after; else btn.textContent = LOOP_LABEL[c.play];
    btn.title = `${LOOP_TITLE[c.play]} (tap to change)`;
    btn.setAttribute('aria-label', `Loop of ${c.name}: ${LOOP_TITLE[c.play]}`);
  }
  const fmtLeft = (sec) => { sec = Math.ceil(sec || 0); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const clockOf = (sec) => { sec = Math.max(0, Math.round(sec || 0)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const ZONE_COLOUR = { music: 'var(--music)', ambience: 'var(--amb)', events: 'var(--evt)', soundbox: 'var(--blue)' };

  /** A sound card, built like Troubadour's (.c: name and loop, progress, play, stop, volume as set in Settings).
   *  In the editor: preview, loop, + and −, remove. At the table, a thin meter tells how much reaches the party. */
  function cardRow(c, list, owner) {
    const row = el('div', 'c');
    row.style.setProperty('--z', ZONE_COLOUR[c.zone] || 'var(--accent)');
    const zoneKey = c.zone === 'soundbox' ? 'events' : c.zone;
    const vm = mode === 'edit' ? 'simple' : ((settings.vol && settings.vol[zoneKey]) || 'full');
    row.classList.add(`vm-${vm}`);

    const head = el('div', 'ch');
    // A long name rolls inside its frame, as in Troubadour (see rollTitles).
    const nm = el('b', 'nm');
    nm.title = `${c.name} (${ZONE_LABEL[c.zone] || c.zone})`;
    nm.append(el('span', '', c.name));
    head.append(nm);
    let rem = null;
    if (mode === 'play' && vm !== 'hidden') { rem = el('small'); head.append(rem); }
    // The world's musics have no loop of their own: the queue says what comes next.
    const worldMus = !!(rec && rec.world.music && list === rec.world.music);
    const loop = el('button');
    loop.type = 'button';
    paintLoop(loop, c);
    loop.addEventListener('click', () => {
      // The world's musics: 1×, 2× or ∞ (what comes next is the queue's).
      const ways = worldMus ? ['once', 'twice', 'loop'] : c.zone === 'music' ? ['once', 'twice', 'loop', 'after'] : ['once', 'twice', 'loop', 'random'];
      const next = ways[(ways.indexOf(c.play) + 1) % ways.length];
      Object.assign(c, M.cleanCard(Object.assign({}, c, { play: next })));
      save();
      if (A.isOpen()) A.sync();
      if (mode === 'edit') renderPanel(); else paintLoop(loop, c);
    });
    head.append(loop);
    if (mode === 'edit') {
      const x = el('button', 'loop x');
      x.type = 'button';
      x.innerHTML = ICON.x;
      x.title = 'Remove this card';
      x.setAttribute('aria-label', `Remove ${c.name}`);
      x.addEventListener('click', () => {
        list.splice(list.indexOf(c), 1);
        // A music taken out of the world leaves the maps it was laid on too (else it would come back with them).
        if (worldMus) rec.world.places.forEach((p) => { p.general = p.general.filter((o) => !(o.zone === 'music' && o.file === c.file)); p.elements.forEach((e) => { e.cards = e.cards.filter((o) => !(o.zone === 'music' && o.file === c.file)); }); });
        save(); syncAudio(); renderPanel(); V.redraw(); renderPlaces();
      });
      head.append(x);
    }
    row.append(head);

    // The editor: the longest pause of a random card, as in Troubadour (0.5 s to it; Auto: the one of the settings).
    if (mode === 'edit' && c.play === 'random') {
      const opts = el('div', 'opts');
      const val = el('b');
      const paintGap = () => { val.textContent = c.randomMax ? `${c.randomMax} s` : `Auto`; less.disabled = !c.randomMax; more.disabled = c.randomMax >= A.RANDOM_TOP; };
      const stepGap = (d) => {
        const n = (c.randomMax || 0) + d;
        Object.assign(c, M.cleanCard(Object.assign({}, c, { randomMax: n >= 1 ? n : 0 })));
        if (!(n >= 1)) delete c.randomMax;
        save(); paintGap();
      };
      const box = el('div', 'stepper');
      box.setAttribute('role', 'group'); box.setAttribute('aria-label', `Longest pause of ${c.name}`);
      const less = el('button', '', '‹'); less.type = 'button'; less.setAttribute('aria-label', 'Shorter'); less.addEventListener('click', () => stepGap(-1));
      const more = el('button', '', '›'); more.type = 'button'; more.setAttribute('aria-label', 'Longer'); more.addEventListener('click', () => stepGap(1));
      box.append(less, val, more);
      opts.append(el('span', '', 'Longest pause'), box);
      opts.title = `Plays again after a pause of 0.5 s to this. Auto: ${A.randomMax()} s, from the settings`;
      paintGap();
      row.append(opts);
    }

    // The progress of the sound (at the table), and how much of an element reaches the party.
    let fill = null, bar = null;
    if (mode === 'play') {
      const track = el('div', 'track');
      fill = el('div', 'fill');
      track.append(fill);
      row.append(track);
    }

    const ctrl = el('div', 'ctrl');
    const pb = el('button', 'pb play');
    pb.type = 'button';
    pb.innerHTML = ICON.play;
    ctrl.append(pb);
    let end = null;
    if (mode === 'edit') {
      pb.title = 'Listen';
      pb.setAttribute('aria-label', `Listen to ${c.name}`);
      pb.addEventListener('click', () => listen(c.file, pb));
    } else {
      pb.addEventListener('click', () => { A.toggle(c); refreshLive(); });
      end = el('button', 'pb end');
      end.type = 'button';
      end.innerHTML = ICON.stop;
      end.title = 'Fade out';
      end.setAttribute('aria-label', `Fade out ${c.name}`);
      end.addEventListener('click', () => { A.stop(c); refreshLive(); });
      ctrl.append(end);
    }
    let lvl = null, vol = null, paintLvl = () => {};
    if (vm === 'full') {
      vol = el('input');
      vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = c.volume;
      vol.style.setProperty('--z', ZONE_COLOUR[c.zone] || 'var(--accent)');
      vol.setAttribute('aria-label', `${c.name} volume`);
      vol.addEventListener('input', () => { A.setVolume(c, Number(vol.value)); paintRange(vol); });
      vol.addEventListener('change', save);
      ctrl.append(vol);
    } else if (vm === 'simple') {
      // Two buttons, as in Troubadour: 25 % steps, glided smoothly over 2 s a step (from the volume heard now).
      lvl = el('span', 'lvl');
      paintLvl = () => {
        const v = A.voice(c);
        const pct = `${Math.round(A.shownVolume(c) * 100)}`;
        if (lvl.textContent !== pct) lvl.textContent = pct;
        lvl.classList.toggle('moving', !!(v && v.volMs));
      };
      const step = (dir) => {
        if (!A.stepVolume(c, dir)) return;
        paintLvl();
        save();
      };
      const dn = el('button', 'vb vdn'); dn.type = 'button'; dn.innerHTML = ICON.volDown; dn.setAttribute('aria-label', `Lower ${c.name}`);
      dn.addEventListener('click', () => step(-1));
      const up = el('button', 'vb'); up.type = 'button'; up.innerHTML = ICON.volUp; up.setAttribute('aria-label', `Raise ${c.name}`);
      up.addEventListener('click', () => step(1));
      paintLvl();
      ctrl.append(dn, lvl, up);
    } else if (mode === 'play') {
      rem = el('small');
      ctrl.append(rem);
    }
    row.append(ctrl);

    if (mode === 'play') {
      liveRows.push(() => {
        // Painted as Troubadour paints its cards.
        const v = A.voice(c);
        const st = v ? v.state : 'idle';
        const waiting = !!(v && v.waiting);
        const on = !!(v && (v.active || waiting));
        // Living ambiances: a discreet mark shows the volume heard right now; the slider and the number keep the card's own.
        if (c.zone === 'ambience') {
          const heard = A.living(c), alive = heard != null;
          if (vol) { vol.classList.toggle('living', alive); if (alive) vol.style.setProperty('--lp', Math.min(1, heard).toFixed(3)); }
          if (lvl) { lvl.classList.toggle('living', alive); if (alive) lvl.style.setProperty('--lo', `${((heard - c.volume) * 90).toFixed(1)}px`); }
        }
        row.classList.toggle('on', on);
        row.classList.toggle('paused', st === 'paused');
        const icon = st === 'playing' || waiting ? 'pause' : 'play';
        if (pb.dataset.i !== icon) { pb.innerHTML = ICON[icon]; pb.dataset.i = icon; }
        pb.setAttribute('aria-label', `${st === 'playing' ? 'Pause' : waiting ? 'Stop' : 'Play'} ${c.name}`);
        pb.disabled = !buffers.get(c.file);
        end.disabled = !(on || st === 'paused');
        paintLvl();
        const pr = A.progress(c);
        if (pr.p < 0) { fill.style.width = on || st === 'paused' ? '100%' : '0'; fill.style.background = 'var(--blue)'; }
        else { fill.style.width = `${pr.p * 100}%`; fill.style.background = `hsl(${Math.round(130 * (1 - pr.p))},72%,50%)`; }
        let txt = '', warn = false;
        if (waiting) txt = `next ${fmtLeft(pr.next)}`;
        else if (v && v.held) txt = 'held';
        else if (on || st === 'paused') {
          if (c.play === 'loop') txt = '∞ loop';
          else if (pr.left != null) { txt = fmtLeft(pr.left); warn = pr.left <= 10; }
        }
        if (rem && rem.textContent !== txt) rem.textContent = txt;
        if (rem) rem.classList.toggle('warn', warn);
      });
    }
    return row;
  }

  function addSoundsButton(list, label, target) {
    const b = el('button', 'btn slim');
    b.type = 'button';
    b.innerHTML = `${ICON.plus}<span>${label || 'Add sounds'}</span>`;
    b.addEventListener('click', () => pickSounds(list, target));
    return b;
  }

  function cardsBlock(title, list, owner, empty, targetName) {
    // The element's name is read when the picker opens: renamed meanwhile, it shows its new name.
    const target = () => (owner ? elName(owner) : targetName || null);
    const s = section(title, mode === 'edit' ? addSoundsButton(list, 'Add', target) : null);
    if (!list.length) s.append(el('div', 'pn-empty', empty));
    list.forEach((c) => s.append(cardRow(c, list, owner)));
    return s;
  }

  function renderPanel() {
    paintMenuBtn();
    liveRows.length = 0;
    const box = $('#mw-inspector');
    box.textContent = '';
    if (!rec) return;
    const p = place();
    const sel = mode === 'edit' ? V.selected() : tapped;
    // At the table, the panel is the sound menu: a small title, and what it shows (an element, or the whole map).
    const head = $('#mw-side-title');
    head.textContent = '';
    if (mode === 'play') { head.className = 'mp-menu-title'; head.append(el('small', '', 'Sound menu'), el('span', '', sel ? elName(sel) : 'Whole map')); }
    else { head.className = ''; head.textContent = sel ? elName(sel) : p.title; }
    if (mode === 'edit' && edView && !sel) {
      head.textContent = edView === 'music' ? 'Music of the world' : 'Soundbox of the world';
      if (edView === 'music') editMusic(box); else editSoundbox(box);
    } else if (mode === 'edit') { if (sel) editElement(box, sel); else editPlace(box, p); }
    else if (sel) playElement(box, sel); else playPlace(box, p);
    paintEdView();
    paintRanges(box);
    refreshLive();
    requestAnimationFrame(() => rollTitles(box));
  }

  /** A name longer than its card rolls back and forth inside it (as in Troubadour). */
  function rollTitles(root) {
    root.querySelectorAll('.nm').forEach((nm) => {
      const span = nm.firstChild;
      if (!span) return;
      nm.classList.remove('roll');
      const over = span.scrollWidth - nm.clientWidth;
      if (over > 2) {
        nm.classList.add('roll');
        nm.style.setProperty('--roll', `${-(over + 10)}px`);
        nm.style.setProperty('--rd', `${Math.max(3, over / 18)}s`);
      }
    });
  }
  const stampLabel = (id) => { const c = window.MapStamps.custom(id); return c ? c.name : (window.MapStamps.LIST.find((s) => s.id === id) || { label: id }).label; };
  const elName = (e) => e.title || (e.shape.type === 'stamp' ? stampLabel(e.shape.stamp) : e.shape.closed ? 'Drawn area' : 'Drawn line');

  /* The world's soundbox and music, in the editor: behind the Soundbox and Music buttons of its top bar. */
  let edView = null; // null (the map or the element selected), 'soundbox' or 'music'
  function paintEdView() {
    if (mode !== 'edit') return;
    const open = $('#world').classList.contains('panel');
    $('#mw-sb').setAttribute('aria-pressed', String(open && edView === 'soundbox'));
    $('#mw-mus-btn').setAttribute('aria-pressed', String(open && edView === 'music'));
  }
  function showEdView(v) {
    const open = $('#world').classList.contains('panel');
    if (open && edView === v) { edView = null; setPanel(false); renderPanel(); return; }
    edView = v;
    if (V.selected()) V.select(null);
    setPanel(true);
    renderPanel();
  }
  /** Moves a card up or down its list. */
  function orderButtons(list, c) {
    const box = el('span', 'ord');
    [['↑', -1, 'Move up'], ['↓', 1, 'Move down']].forEach(([t, d, label]) => {
      const b = el('button', 'loop', t); b.type = 'button'; b.title = label; b.setAttribute('aria-label', `${label}: ${c.name}`);
      const i = list.indexOf(c);
      b.disabled = d < 0 ? i <= 0 : i >= list.length - 1;
      b.addEventListener('click', () => { const k = list.indexOf(c); list.splice(k, 1); list.splice(k + d, 0, c); save(); renderPanel(); });
      box.append(b);
    });
    return box;
  }
  function orderedBlock(title, list, empty, target) {
    const s = cardsBlock(title, list, null, empty, target);
    s.querySelectorAll('.c').forEach((row, i) => { const ch = row.querySelector('.ch'); if (ch) ch.insertBefore(orderButtons(list, list[i]), ch.querySelector('.loop')); });
    return s;
  }
  function editMusic(box) {
    const list = worldMusic();
    box.append(el('p', 'pn-note', 'The musics of the world, behind the Music button at the table. They play on from one map to the next. A music laid on the whole map starts when the party arrives there; laid on a place, when the party walks into it (and the map\'s comes back when it walks out).'));
    const offMaps = (c) => rec.world.places.forEach((p) => { p.general = p.general.filter((o) => !(o.zone === 'music' && o.file === c.file)); p.elements.forEach((e) => { e.cards = e.cards.filter((o) => !(o.zone === 'music' && o.file === c.file)); }); });
    box.append(fxZone(list, (c) => ({ key: `w:${c.file}`, getBlob: () => DB.getBlob(rec.files[c.file]), save: () => { save(); syncAudio(); }, rerender: () => { renderPanel(); V.redraw(); }, removeText: 'It leaves the music of this world, and the maps it is laid on.', onRemove: offMaps, colour: 'var(--music)', loops: ['once', 'twice', 'loop'] }),
      'Add musics: from this device, the Recueil or Files', () => {
        fxPicker('the music', new Set(list.map((c) => rec.files[c.file])), async (picked) => {
          for (const r of picked) {
            const key = r.blobKey || await DB.putBlob(await r.getBlob());
            const path = freePath(`sounds/map/music/${window.Troubadour.slug(r.name, 'sound')}.${r.ext || 'mp3'}`);
            rec.files[path] = key;
            list.push(Object.assign(M.card({ name: String(r.name || 'Music').slice(0, 80), file: path, zone: 'music', volume: 0.75 }, { play: 'loop' }), { size: r.size || 0, duration: r.duration || 0 }));
          }
          flush();
          renderPanel();
        }, 'music');
      }, 'var(--music)'));
  }



  function editPlace(box, p) {
    const name = section('Map');
    const t = el('input'); t.type = 'text'; t.value = p.title; t.maxLength = 80; t.setAttribute('aria-label', 'Name of the map');
    t.addEventListener('input', () => { p.title = t.value.trim() || 'Map'; renderPlaces(); save(); });
    name.append(t);
    const size = el('div', 'seg small');
    SIZES.forEach(([label, w, h]) => {
      const b = el('button', '', label);
      b.type = 'button';
      b.setAttribute('aria-checked', String(p.width === w && p.height === h));
      b.addEventListener('click', () => {
        if (!resizePlace(p, label)) return;
        save(); V.show(p, rec.world); V.fit(); renderPanel();
      });
      size.append(b);
    });
    const sz = el('div', 'row-set');
    sz.append(el('span', '', 'Map size'), size);
    name.append(sz);
    box.append(name);

    box.append(cardsBlock('Whole map', p.general, null, 'Sounds heard everywhere on this map, whatever the distance and the walls: the wind, the rain. A music laid here starts when the party arrives.'));


    const walls = section('Walls');
    walls.append(slider('Muffle', Math.round(rec.world.wallLoss * 100), 0, 100, 5, (v) => `${v} %`, (v) => { rec.world.wallLoss = v / 100; save(); }));
    walls.append(el('p', '', 'Each wall between a sound and the party takes this share of it away. The same for every map of the world.'));
    box.append(walls);

    const how = section('Drawing');
    how.append(el('p', '', 'Wall: draws walls (Shift for a straight one). Element: draw a shape that ends near its start for an area, or a line for a river or a road. Library: lakes, mountains, forests and more. Double tap an element (with the select tool) to give it sounds, a reach and a way to another place.'));
    box.append(how);

    const acts = section('This map');
    const row = el('div', 'pn-acts');
    const up = el('button', 'btn slim', 'Move up'); up.type = 'button'; up.disabled = pi === 0;
    up.addEventListener('click', () => { movePlace(-1); });
    const down = el('button', 'btn slim', 'Move down'); down.type = 'button'; down.disabled = pi === rec.world.places.length - 1;
    down.addEventListener('click', () => { movePlace(1); });
    const del = el('button', 'btn slim danger', 'Delete'); del.type = 'button'; del.disabled = rec.world.places.length < 2;
    del.addEventListener('click', async () => {
      const ok = await ask(`Delete ${p.title}?`, 'Its drawings and sound cards go with it. The sounds stay in the story.', [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, cls: 'danger' }]);
      if (!ok) return;
      rec.world.places.splice(pi, 1);
      rec.world.places.forEach((q) => q.elements.forEach((e) => { if (e.link === p.id) e.link = null; }));
      save();
      goPlace(Math.max(0, pi - 1));
    });
    row.append(up, down, del);
    acts.append(row);
    box.append(acts);
  }

  function movePlace(d) {
    const list = rec.world.places;
    const [p] = list.splice(pi, 1);
    list.splice(pi + d, 0, p);
    pi += d;
    save();
    renderPlaces();
    renderPanel();
    history.replaceState(null, '', here());
  }

  function editElement(box, e) {
    const sh = e.shape;
    const id = section('Element');
    const t = el('input'); t.type = 'text'; t.value = e.title; t.maxLength = 80; t.placeholder = 'Name (shown on the map)';
    t.addEventListener('input', () => { e.title = t.value.trim(); $('#mw-side-title').textContent = e.title || 'Element'; V.redraw(); save(); });
    id.append(t);
    if (sh.type === 'stamp') {
      const w = place().width;
      id.append(slider('Size', Math.round((sh.size / w) * 200) / 2, 1, 60, 0.5, (v) => `${v} % of the map`, (v) => { sh.size = Math.max(10, Math.round((v / 100) * w)); V.redraw(); }));
      id.append(slider('Turn', sh.rotation, -180, 180, 5, (v) => `${v}°`, (v) => { sh.rotation = v; V.redraw(); }));
    } else if (sh.points.length > 2) {
      const l = el('label', 'row-set toggle');
      const span = el('span', '', 'Closed shape');
      span.append(el('small', '', 'An area (inside it, its sounds are at full volume), or a line'));
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = sh.closed;
      cb.addEventListener('change', () => { V.snapshot(); sh.closed = cb.checked; V.redraw(); save(); });
      l.append(span, cb, el('i'));
      id.append(l);
    }
    box.append(id);

    box.append(cardsBlock('Sounds', e.cards, e, 'No sound yet: this element is a drawing only. Add sounds of the story to hear it from the map.'));

    const reach = section('Reach');
    reach.append(reachSlider(e));
    reach.append(el('p', '', 'How far beyond its edge its sounds carry, in % of the width of the map, the same for all of them: full inside, fading to silence at this distance. The tinted ground shows it.'));
    box.append(reach);

    const way = section('Leads to');
    const sel = el('select');
    sel.setAttribute('aria-label', 'Map this element leads to');
    const none = el('option', '', 'Nowhere'); none.value = ''; sel.append(none);
    rec.world.places.forEach((q, i) => { if (i === pi) return; const o = el('option', '', q.title); o.value = q.id; sel.append(o); });
    const nw = el('option', '', '+ A new map'); nw.value = '__new'; sel.append(nw);
    sel.value = e.link || '';
    sel.addEventListener('change', () => {
      if (sel.value === '__new') {
        const p = M.newPlace(e.title || `Map ${rec.world.places.length + 1}`);
        rec.world.places.push(p);
        e.link = p.id;
        renderPlaces();
        renderPanel();
      } else e.link = sel.value || null;
      V.redraw(); save(); renderPlaces();
    });
    way.append(sel, el('p', '', 'At the table, a long press on its sign (in its middle) takes the party there: a door, stairs, a road to the next town.'));
    box.append(way);

    const acts = el('div', 'pn-acts');
    const del = el('button', 'btn slim danger');
    del.type = 'button';
    del.innerHTML = `${ICON.trash}<span>Delete this element</span>`;
    del.addEventListener('click', () => { V.deleteSelected(); });
    acts.append(del);
    box.append(acts);
  }

  /** How much of an element reaches the party (worked out again only when the party moves). */
  const heardMemo = new Map();
  function heardOf(e, p) {
    const pt = A.point(), m = heardMemo.get(e);
    if (m && m.x === pt[0] && m.y === pt[1] && m.walls === p.walls.length) return m.h;
    const h = M.hearing(pt, e, p.walls, rec.world.wallLoss);
    heardMemo.set(e, { x: pt[0], y: pt[1], walls: p.walls.length, h });
    return h;
  }
  /** The heading of an element's sounds: a gauge and how much of it reaches the party. The section is dimmed out of reach. */
  function heardLine(e, p, sub, sec) {
    const bar = el('i');
    const txt = el('span');
    const gauge = el('b'); gauge.append(bar);
    sub.append(gauge, txt);
    liveRows.push(() => {
      const h = heardOf(e, p);
      const pct = Math.round(h.gain * 100);
      const t = h.d === 0 ? 'Here, 100 %' : pct > 0 ? `${pct} %${h.walls ? `, ${h.walls} wall${h.walls > 1 ? 's' : ''}` : ''}` : 'Out of reach';
      if (txt.textContent !== t) txt.textContent = t;
      bar.style.width = `${pct}%`;
      sub.classList.toggle('far', pct === 0);
      if (sec) sec.classList.toggle('far', pct === 0);
    });
  }

  /** The sound menu of the whole map: its own sounds, then the sounds of every element, under its name: the
   *  elements the party hears most come first; those out of reach go last, folded (a tap on their name unfolds them). */
  const unfolded = new Set();
  const notMusic = (list) => list.filter((c) => c.zone !== 'music');
  /** The music heard now (playing or paused), first in the sound menu whatever it shows. */
  function musicSlot(box) {
    const s = section('Music', null);
    const all = el('button', 'btn slim');
    all.type = 'button';
    all.innerHTML = `${ICON.music}<span>All musics</span>`;
    all.addEventListener('click', openMusic);
    s.querySelector('h3').append(all);
    const holder = el('div', 'el-cards');
    s.append(holder);
    let shown, rows = [];
    liveRows.push(() => {
      const c = A.currentMusic();
      if (c !== shown) {
        shown = c;
        holder.textContent = ''; rows = [];
        s.hidden = !c;
        if (c) { holder.append(withRows(rows, () => cardRow(c, rec.world.music, null))); requestAnimationFrame(() => rollTitles(holder)); }
      }
      rows.forEach((f) => f());
    });
    box.append(s);
  }
  function playPlace(box, p) {
    musicSlot(box);
    const gen = notMusic(p.general);
    if (gen.length || !p.elements.some((e) => notMusic(e.cards).length)) box.append(cardsBlock('Heard everywhere', gen, null, 'No sound for the whole map. Add some in the editor.'));
    const els = p.elements.filter((e) => notMusic(e.cards).length);
    const secs = new Map();
    els.forEach((e) => {
      const sub = el('span', 'heard-pct');
      const s = section(elName(e), sub);
      s.classList.add('el-sounds');
      const head = s.querySelector('h3');
      const fold = el('span', 'fold');
      fold.innerHTML = ICON.chevron;
      head.prepend(fold);
      head.setAttribute('role', 'button');
      head.tabIndex = 0;
      head.title = 'Show or hide its sounds';
      const flip = () => { if (unfolded.has(e)) unfolded.delete(e); else unfolded.add(e); refreshLive(); };
      head.addEventListener('click', flip);
      head.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); flip(); } });
      const body = el('div', 'el-cards');
      notMusic(e.cards).forEach((c) => body.append(cardRow(c, e.cards, e)));
      s.append(body);
      heardLine(e, p, sub, s);
      secs.set(e, s);
      box.append(s);
    });
    if (!els.length) return;
    let order = '';
    liveRows.push(() => {
      // Folded: out of reach and not opened by hand. Ordered by what the party hears, not while a finger is on the menu.
      secs.forEach((s, e) => s.classList.toggle('folded', heardOf(e, p).gain === 0 && !unfolded.has(e)));
      if (box.matches(':active') || box.contains(document.activeElement) && document.activeElement.matches('input')) return;
      const sorted = els.map((e, i) => ({ e, i, g: heardOf(e, p).gain })).sort((a, b) => (b.g > 0) - (a.g > 0) || b.g - a.g || a.i - b.i);
      const key = sorted.map((x) => x.i).join(',');
      if (key === order) return;
      order = key;
      sorted.forEach((x) => box.append(secs.get(x.e)));
    });
  }

  /** The sound menu of one element (a double tap on the map's ground brings the whole map back). */
  function playElement(box, e) {
    musicSlot(box);
    const own = notMusic(e.cards);
    if (e.link) {
      const to = rec.world.places.findIndex((q) => q.id === e.link);
      if (to >= 0) {
        const go = el('button', 'btn primary go-place');
        go.type = 'button';
        go.innerHTML = `${ICON.link}<span>Go to ${rec.world.places[to].title}</span>`;
        go.addEventListener('click', () => travel(to));
        box.append(go);
      }
    }
    if (own.length || !e.link) {
      const sub = el('span', 'heard-pct');
      const s = section('Sounds', sub);
      if (!own.length) s.append(el('div', 'pn-empty', 'No sound on this element.'));
      own.forEach((c) => s.append(cardRow(c, e.cards, e)));
      if (own.length) heardLine(e, place(), sub, s);
      box.append(s);
    }
    if (own.length) {
      const reach = section('Reach');
      reach.append(reachSlider(e));
      box.append(reach);
    }
  }

  /** The coloured part of a slider, up to its thumb. */
  const paintRange = (r) => r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min || 1)) * 100}%`);
  function paintRanges(root) { root.querySelectorAll('input[type="range"]').forEach(paintRange); }
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('input[type="range"]')) paintRange(e.target); });

  let liveTimer = 0;
  function refreshLive() { liveRows.forEach((f) => f()); musRows.forEach((f) => f()); }
  function liveLoop() {
    clearInterval(liveTimer);
    liveTimer = setInterval(() => { if (screen === 'world' && mode === 'play' && !document.hidden) { refreshLive(); paintMaster(); } }, 66);
  }

  function syncAudio() {
    if (mode !== 'play' || !A.isOpen()) return;
    ensure(placeFiles(place())).then(() => A.sync());
  }

  /* ================= More sounds for the world ================= */
  /** Picks files with a hidden input of its own (several at once when `multiple`). */
  function chooseFiles(accept, multiple) {
    return new Promise((ok) => {
      const i = el('input');
      i.type = 'file';
      if (accept && !document.documentElement.classList.contains('ios')) i.accept = accept;
      i.multiple = !!multiple;
      // iPhone fires `change` only for an input that stays in the page.
      i.hidden = true;
      document.body.append(i);
      i.addEventListener('change', () => { ok([...i.files]); i.remove(); });
      i.click();
    });
  }
  function freePath(base) {
    let p = base, n = 2;
    while (rec.files[p]) { p = base.replace(/(\.[a-z0-9]+)$/i, `-${n}$1`); n += 1; }
    return p;
  }

  /** Audio files of this device become sounds of the world (in its Map sounds chapter). */
  async function addFromDevice(after) {
    const files = (await chooseFiles('audio/*,.mp3,.ogg,.m4a,.wav', true)).filter((f) => window.Troubadour.isAudio(f) || /^audio\//.test(f.type));
    if (!files.length) return;
    const zone = await ask(files.length > 1 ? `${files.length} sounds: what are they?` : `${files[0].name}: what is it?`, 'It sets their colour and how they play once laid on the map: music and ambiances loop, events come back at random.', [
      { label: 'Music', value: 'music' }, { label: 'Ambiance', value: 'ambience' }, { label: 'Event', value: 'events', cls: 'primary' },
    ]);
    if (!zone) return;
    try {
      const ch = M.ownChapter(rec.story);
      let n = 0;
      for (const f of files) {
        n += 1;
        busy('Keeping the sounds on this device', `${n} of ${files.length}`, n / files.length);
        const ext = (f.name.split('.').pop() || 'mp3').toLowerCase();
        const name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120) || 'Sound';
        const path = freePath(`sounds/map/${zone}/${window.Troubadour.slug(name, 'sound')}.${ext}`);
        rec.files[path] = await DB.putBlob(f);
        ch[zone].push({ name, file: path, loop: zone === 'events' ? 'random' : 'infinite', volume: 0.75 });
      }
      idle();
      flush();
      after();
    } catch (e) { idle(); toast(`Could not keep the sounds: ${e.message || e}`, 4200); }
  }

  /** Every sound of another .troubadour story joins the world, in a chapter named after it. */
  async function addFromStory(after) {
    const [f] = await chooseFiles('.troubadour,.bardic,.troubadour-map,.troubadour-ballade', false);
    if (!f) return;
    try {
      busy('Opening the story', f.name, 0);
      const { story, files } = await M.read(f, (n, t) => busy('Opening the story', `Sound ${n} of ${t}`, n / t));
      const k = (rec.story.chapters || []).length + 1;
      const ch = { title: story.title || f.name, map: true, music: [], ambience: [], events: [] };
      const seen = new Set();
      const list = M.soundsOf(story).filter((x) => files.has(x.file) && (seen.has(x.file) ? false : seen.add(x.file)));
      let n = 0;
      for (const x of list) {
        n += 1;
        busy('Keeping the sounds on this device', `${n} of ${list.length}`, n / list.length);
        const path = freePath(`sounds/x${k}/${x.file.replace(/^sounds\//, '')}`);
        rec.files[path] = await DB.putBlob(files.get(x.file));
        ch[x.zone === 'soundbox' ? 'events' : x.zone].push({ name: x.name, file: path, loop: x.loop || 'once', volume: typeof x.volume === 'number' ? x.volume : 0.75 });
      }
      rec.story.chapters = (rec.story.chapters || []).concat(ch);
      idle();
      flush();
      toast(`${list.length} sound${list.length > 1 ? 's' : ''} of ${ch.title} added.`);
      after();
    } catch (e) { idle(); toast(`This story could not be opened: ${e.message || e}`, 4200); }
  }

  /* ================= The Recueil's sounds ================= */
  // Every sound of every tale of the Recueil (docs/recueil/sounds.json). Only a sound's own bytes are fetched:
  // the tales store their sounds uncompressed, so each one is a byte range of its .troubadour file.
  const RECUEIL = '../recueil/';
  const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let recueil = null, recueilLoad = null;
  const recueilBytes = new Map(); // id -> Promise<Blob>
  const taleBlobs = new Map();    // .troubadour file -> Promise<Blob>, when a whole tale had to be fetched
  function loadRecueil() {
    if (!recueilLoad) {
      recueilLoad = fetch(`${RECUEIL}sounds.json`, { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((d) => { recueil = (d.sounds || []).map((x) => Object.assign(x, { key: fold(`${x.name} ${x.tale} ${x.bard}`) })); return recueil; })
        .catch((e) => { recueilLoad = null; throw e; });
    }
    return recueilLoad;
  }
  function wholeTale(file) {
    if (!taleBlobs.has(file)) {
      taleBlobs.set(file, fetch(RECUEIL + encodeURIComponent(file)).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .catch((e) => { taleBlobs.delete(file); throw e; }));
    }
    return taleBlobs.get(file);
  }
  function recueilBlob(x) {
    if (!recueilBytes.has(x.id)) {
      recueilBytes.set(x.id, (async () => {
        let part = null;
        if (!taleBlobs.has(x.file)) {
          try {
            const res = await fetch(RECUEIL + encodeURIComponent(x.file), { headers: { Range: `bytes=${x.offset}-${x.offset + x.length - 1}` } });
            if (res.status === 206) { const bl = await res.blob(); if (bl.size === x.length) part = bl; }
            else if (res.ok) taleBlobs.set(x.file, res.blob());
          } catch (e) { /* the whole tale, below */ }
        }
        if (!part) part = (await wholeTale(x.file)).slice(x.offset, x.offset + x.length);
        if (x.deflated) part = await new Response(part.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
        if (part.size !== x.size) throw new Error('The sound came back damaged. Try again.');
        const ext = (x.path.split('.').pop() || 'mp3').toLowerCase();
        return new Blob([part], { type: ext === 'ogg' ? 'audio/ogg' : ext === 'm4a' ? 'audio/mp4' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg' });
      })().catch((e) => { recueilBytes.delete(x.id); throw e; }));
    }
    return recueilBytes.get(x.id);
  }
  /** A sound of the Recueil joins the world (once): its bytes on this device, a line in the Recueil chapter. */
  async function keepRecueil(x) {
    const zone = x.row === 'soundbox' ? 'events' : (x.row || 'events');
    let ch = (rec.story.chapters || []).find((c) => c.map === true && c.title === 'Recueil');
    if (!ch) { ch = { title: 'Recueil', map: true, music: [], ambience: [], events: [] }; rec.story.chapters.push(ch); }
    const had = ch[zone].find((s) => s.recueil === x.id);
    if (had) return Object.assign({ zone }, had);
    const blob = await recueilBlob(x);
    const path = freePath(`sounds/recueil/${zone}/${window.Troubadour.slug(x.name, 'sound')}.${(x.path.split('.').pop() || 'mp3').toLowerCase()}`);
    rec.files[path] = await DB.putBlob(blob);
    const s = { name: x.name, file: path, loop: zone === 'events' ? 'random' : 'infinite', volume: 0.75, recueil: x.id, tale: x.tale };
    // Its locked identity travels with it (TROUBADOUR_FORMAT.md, "sound"), like in the Story builder.
    if (x.origin && x.origin.length) s.sound = Object.assign({ id: x.id, origin: x.origin }, x.edited ? { edited: true } : {}, x.parent ? { parent: x.parent } : {}, x.brought ? { brought: x.brought } : {});
    ch[zone].push(s);
    flush();
    return Object.assign({ zone }, s);
  }

  /* ================= The sound browser (the Add sheet, and the library drawer of the editor) ================= */
  const pickState = { src: 'world', type: 'all', q: '' };
  const TYPE_LABEL = { music: 'Music', ambience: 'Ambiance', events: 'Event', soundbox: 'Soundbox' };

  /** Fills `root` with the sounds of the world or of the Recueil, filtered by kind and search.
   *  `target()` gives where a tap adds a sound: { list, name }. With `drag`, a sound can also be dragged
   *  onto an element of the map (or onto its ground: the whole map). Returns { paint }. */
  function soundBrowser(root, target, drag) {
    root.textContent = '';
    const bar = el('div', 'snd-bar');
    const seg = (cls, items, key) => {
      const g = el('div', `seg small ${cls}`);
      g.setAttribute('role', 'radiogroup');
      items.forEach(([v, label]) => {
        const b = el('button', '', label);
        b.type = 'button';
        b.dataset.v = v;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => { pickState[key] = v; paintSegs(); paint(); });
        g.append(b);
      });
      return g;
    };
    const srcSeg = seg('snd-src', [['world', 'This world'], ['recueil', 'Recueil']], 'src');
    const typeSeg = seg('snd-type', [['all', 'All'], ['music', 'Music'], ['ambience', 'Amb.'], ['events', 'Events']], 'type');
    const paintSegs = () => {
      srcSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === pickState.src)));
      typeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === pickState.type)));
    };
    const search = el('input', 'snd-search');
    search.type = 'search';
    search.placeholder = 'Search a sound';
    search.value = pickState.q;
    search.addEventListener('input', () => { pickState.q = search.value; paint(); });
    bar.append(srcSeg, typeSeg, search);
    const box = el('div', 'snd-list');
    const foot = el('div', 'snd-foot');
    const fromDevice = el('button', 'btn slim');
    fromDevice.type = 'button';
    fromDevice.innerHTML = `${ICON.import}<span>This device</span>`;
    fromDevice.title = 'Audio files of this device';
    fromDevice.addEventListener('click', () => addFromDevice(() => { pickState.src = 'world'; paintSegs(); paint(); }));
    const fromStory = el('button', 'btn slim');
    fromStory.type = 'button';
    fromStory.innerHTML = `${ICON.import}<span>.troubadour</span>`;
    fromStory.title = 'Every sound of a .troubadour story';
    fromStory.addEventListener('click', () => addFromStory(() => { pickState.src = 'world'; paintSegs(); paint(); }));
    foot.append(fromDevice, fromStory);
    root.append(bar, box, foot);

    const changed = () => { save(); syncAudio(); renderPanel(); renderPlaces(); V.redraw(); if (drag) paintMarks(); };
    const inList = (list, file) => list.find((c) => c.file === file);
    const typeOk = (zone) => pickState.type === 'all' || pickState.type === zone || (pickState.type === 'events' && zone === 'soundbox');
    const words = () => fold(pickState.q).split(/\s+/).filter(Boolean);
    const marks = [];
    const paintMarks = () => marks.forEach((f) => f());

    /** Puts a sound (resolved by `get`, which may fetch it from the Recueil) into a list, or takes it out. */
    async function toggleIn(list, get) {
      const x = await get();
      const had = inList(list, x.file);
      if (had) list.splice(list.indexOf(had), 1); else list.push(M.card(x));
      changed();
      return !had;
    }

    /** One row: preview, name, where it comes from, its kind, and the add mark. */
    function row(name, sub, zone, file, get, onListen) {
      const r = el('div', `snd z-${zone}`);
      r.setAttribute('role', 'button');
      r.tabIndex = 0;
      const lis = el('button', 'snd-play');
      lis.type = 'button';
      lis.innerHTML = ICON.play;
      lis.setAttribute('aria-label', `Listen to ${name}`);
      lis.addEventListener('click', (ev) => { ev.stopPropagation(); onListen(lis); });
      const t = el('span', 'snd-t');
      t.append(el('b', '', name), el('small', '', sub));
      const tag = el('span', 'snd-tag', TYPE_LABEL[zone] || zone);
      const mark = el('span', 'snd-mark');
      const isIn = () => { const f = file(); return !!(f && inList(target().list, f)); };
      const paintMark = (busyNow) => {
        const on = isIn();
        r.classList.toggle('in', on);
        mark.innerHTML = busyNow ? '<i class="spin"></i>' : on ? ICON.check : ICON.plus;
        r.setAttribute('aria-pressed', String(on));
      };
      marks.push(() => paintMark());
      paintMark();
      const go = async (list) => {
        if (r.classList.contains('busy')) return;
        r.classList.add('busy'); paintMark(true);
        try { await toggleIn(list, get); } catch (e) { toast(`Could not add it: ${e.message || e}`, 3600); }
        r.classList.remove('busy'); paintMark();
      };
      let dragged = false;
      r.addEventListener('click', () => { if (dragged) { dragged = false; return; } go(target().list); });
      r.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(target().list); } });
      if (drag) {
        // Drag a sound onto the map: on an element, it joins its sounds; on the ground, the whole map's.
        r.addEventListener('pointerdown', (ev) => {
          if (ev.button > 0 || ev.target.closest('.snd-play')) return;
          const id = ev.pointerId, x0 = ev.clientX, y0 = ev.clientY;
          let ghost = null, over = undefined;
          const move = (e2) => {
            if (e2.pointerId !== id) return;
            const dx = e2.clientX - x0, dy = e2.clientY - y0;
            if (!ghost) {
              // Mostly sideways: a drag. Up and down stays a scroll of the list.
              if (Math.hypot(dx, dy) < 8 || Math.abs(dy) > Math.abs(dx) * 1.2) return;
              ghost = el('div', `snd-ghost z-${zone}`, name);
              document.body.append(ghost);
              try { r.setPointerCapture(id); } catch (err) { /* old browsers */ }
              r.classList.add('dragging');
            }
            e2.preventDefault();
            ghost.style.transform = `translate(${e2.clientX + 12}px, ${e2.clientY - 18}px)`;
            const hit = V.elementAtClient(e2.clientX, e2.clientY);
            if (hit !== over) { over = hit; V.hover(hit === undefined ? null : hit); ghost.classList.toggle('on', hit !== undefined); ghost.dataset.to = hit === undefined ? '' : hit ? elName(hit) : 'Whole map'; }
          };
          const up = async (e2) => {
            if (e2.pointerId !== id) return;
            r.removeEventListener('pointermove', move);
            r.removeEventListener('pointerup', up);
            r.removeEventListener('pointercancel', up);
            V.hover(null);
            if (!ghost) return;
            dragged = true;
            ghost.remove();
            r.classList.remove('dragging');
            if (e2.type === 'pointercancel') return;
            const hit = V.elementAtClient(e2.clientX, e2.clientY);
            if (hit === undefined) return;
            const list = hit ? hit.cards : place().general;
            r.classList.add('busy'); paintMark(true);
            try {
              const x = await get();
              if (!inList(list, x.file)) { list.push(M.card(x)); changed(); }
              toast(`${name}: added to ${hit ? elName(hit) : 'the whole map'}.`, 1800);
              if (hit) V.flash(hit);
            } catch (err) { toast(`Could not add it: ${err.message || err}`, 3600); }
            r.classList.remove('busy'); paintMark();
          };
          r.addEventListener('pointermove', move);
          r.addEventListener('pointerup', up);
          r.addEventListener('pointercancel', up);
        });
      }
      r.append(lis, t, tag, mark);
      return r;
    }

    function paintWorld() {
      const seen = new Set();
      const sounds = M.soundsOf(rec.story).filter((x) => rec.files[x.file] && (seen.has(x.file) ? false : seen.add(x.file)));
      const w = words();
      let group = null, n = 0;
      sounds.forEach((x) => {
        if (!typeOk(x.zone)) return;
        if (w.length && !w.every((k) => fold(x.name).includes(k))) return;
        const g = x.chapter >= 0 ? (rec.story.chapters[x.chapter].title || `Chapter ${x.chapter + 1}`) : 'Soundbox';
        if (g !== group) { group = g; box.append(el('h4', '', g)); }
        n += 1;
        box.append(row(x.name, g, x.zone, () => x.file, async () => x, (btn) => listen(x.file, btn)));
      });
      if (!n) box.append(el('div', 'pn-empty', pickState.q || pickState.type !== 'all' ? 'No sound here with these filters.' : 'No sound in this world yet: take some from the Recueil, this device or a .troubadour story.'));
    }

    function paintRecueil() {
      if (!recueil) {
        box.append(el('div', 'pn-empty', 'Opening the Recueil…'));
        loadRecueil().then(() => { if (pickState.src === 'recueil' && root.isConnected) paint(); },
          () => { box.textContent = ''; box.append(el('div', 'pn-empty', 'The Recueil cannot be reached right now. Check your connection.')); });
        return;
      }
      const w = words();
      const hits = recueil.filter((x) => typeOk(x.row) && w.every((k) => x.key.includes(k)));
      const shown = hits.slice(0, 150);
      // No heading per tale: each sound already names its tale under its own name.
      shown.forEach((x) => {
        const zone = x.row === 'soundbox' ? 'events' : x.row;
        const kept = () => { const ch = (rec.story.chapters || []).find((c) => c.map === true && c.title === 'Recueil'); const s2 = ch && (ch[zone] || []).find((y) => y.recueil === x.id); return s2 ? s2.file : null; };
        box.append(row(x.name, `${x.tale}${x.duration ? `, ${clockOf(x.duration)}` : ''}`, x.row, kept, () => keepRecueil(x),
          (btn) => listen(`recueil:${x.id}`, btn, () => recueilBlob(x))));
      });
      if (!hits.length) box.append(el('div', 'pn-empty', 'No sound of the Recueil with these filters.'));
      else if (hits.length > shown.length) box.append(el('p', 'snd-more', `${hits.length - shown.length} more: search to narrow them down.`));
    }

    function paint() {
      marks.length = 0;
      box.textContent = '';
      box.scrollTop = 0;
      if (pickState.src === 'recueil') paintRecueil(); else paintWorld();
    }
    paintSegs();
    paint();
    return { paint, paintMarks };
  }

  /** The Add sheet: sounds for one list of cards (an element's, the whole map's, or the soundbox). */
  function pickSounds(list, target) {
    if (typeof target === 'function') target = target();
    if (target === 'the music') pickState.type = 'music';
    stopPreview();
    $('#sheet-title').textContent = target ? `Sounds of ${target}` : 'Sounds of the whole map';
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = 'snd-pick';
    $('#sheet').classList.add('wide');
    const holder = el('div', 'snd-holder');
    body.append(holder);
    soundBrowser(holder, () => ({ list, name: target }), false);
    const done = el('button', 'btn primary slim', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => $('#sheet').close());
    holder.querySelector('.snd-foot').append(el('span', 'grow'), done);
    $('#sheet').addEventListener('close', () => { stopPreview(); $('#sheet').classList.remove('wide'); }, { once: true });
    $('#sheet').showModal();
  }



  /* ================= Tools ================= */
  const TOOL_ICON = { select: ICON.select, hand: ICON.hand, wall: ICON.wall, pen: ICON.pen, stamp: ICON.stamp, eraser: ICON.eraser };
  function paintTools(t) {
    document.querySelectorAll('#mw-tools [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  }
  function buildStamps() {
    const box = $('#mw-stamps');
    box.textContent = '';
    const pal = V.palette();
    const S = window.MapStamps;
    if (rec) S.register(rec.world.stamps);
    const tile = (id, label, extra) => {
      const b = el('button');
      b.type = 'button';
      b.dataset.stamp = id;
      const cv = el('canvas');
      cv.width = 112; cv.height = 112;
      const c = cv.getContext('2d');
      c.translate(56, 56);
      S.draw(c, id, 100, pal);
      b.append(cv, el('span', '', label));
      if (extra) b.append(extra);
      b.addEventListener('click', () => { V.setStamp(id); paintStamps(id); box.hidden = true; toast(`Tap the map to lay ${label.toLowerCase()}.`, 1800); });
      box.append(b);
    };
    // First, a new place of your own; then the places of this world; then the library.
    const add = el('button', 'st-new');
    add.type = 'button';
    add.innerHTML = `<span class="st-plus">${ICON.plus}</span><span>New place</span>`;
    add.addEventListener('click', () => { box.hidden = true; placeEditor(null); });
    box.append(add);
    if (((rec && rec.world.stamps) || []).length) box.append(el('h4', 'st-g', 'Your places'));
    ((rec && rec.world.stamps) || []).forEach((st) => {
      const ed = el('span', 'st-edit');
      ed.innerHTML = ICON.edit;
      ed.setAttribute('role', 'button');
      ed.setAttribute('aria-label', `Change ${st.name}`);
      ed.title = 'Change this place';
      ed.addEventListener('click', (e) => { e.stopPropagation(); box.hidden = true; placeEditor(st); });
      tile(st.id, st.name, ed);
    });
    let group = null;
    box.prepend(placeSizeRow());
    S.LIST.forEach((s) => {
      if (s.group !== group) { group = s.group; box.append(el('h4', 'st-g', group)); }
      tile(s.id, s.label);
    });
    paintStamps(null);
  }
  /* The size a place is laid at: Auto gives each its natural size (a bush small, a kingdom huge); the others
   * give every place the same share of the map's width. Changed afterwards on the place itself, in % of the map. */
  const PLACE_SIZES = [['auto', 'Auto', 'Each place at its natural size'], ['s', 'S', '6 % of the map'], ['m', 'M', '10 % of the map'], ['l', 'L', '16 % of the map'], ['xl', 'XL', '25 % of the map']];
  const PLACE_SHARE = { s: 0.06, m: 0.1, l: 0.16, xl: 0.25 };
  const placeShare = (id) => PLACE_SHARE[settings.placeSize] || (window.MapStamps.natural ? window.MapStamps.natural(id) : 0.07);
  V.setStampSizer && V.setStampSizer((id, p) => Math.max(20, Math.round((p.width * placeShare(id)) / 5) * 5));
  function placeSizeRow() {
    const row = el('div', 'st-size');
    row.append(el('span', '', 'Size'));
    const seg = el('div', 'seg small');
    seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Size of the places you lay');
    PLACE_SIZES.forEach(([v, label, tip]) => {
      const b = el('button', '', label);
      b.type = 'button'; b.setAttribute('role', 'radio'); b.title = tip; b.dataset.v = v;
      b.setAttribute('aria-checked', String((settings.placeSize || 'auto') === v));
      b.addEventListener('click', () => {
        settings.placeSize = v; saveSettings();
        seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.v === v)));
        hint.textContent = tip;
      });
      seg.append(b);
    });
    const hint = el('small', '', (PLACE_SIZES.find((x) => x[0] === (settings.placeSize || 'auto')) || PLACE_SIZES[0])[2]);
    row.append(seg, hint);
    return row;
  }
  let currentStamp = null;
  function paintStamps(id) { currentStamp = id; document.querySelectorAll('#mw-stamps [data-stamp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stamp === id))); }

  /* ================= A place of your own: lines in the theme's ink, colour poured into its shapes or brushed under its lines ================= */
  const LINE_W = [0.01, 0.022, 0.036];   // fine, normal, bold
  const BRUSH_W = [0.03, 0.06, 0.11];
  const ERASE_R = [0.02, 0.04, 0.075];
  function placeEditor(existing) {
    const S = window.MapStamps;
    const norm = (sk) => (Array.isArray(sk) ? { w: 0.022, p: sk } : sk);
    const st = existing ? JSON.parse(JSON.stringify(existing)) : { id: `p-${Math.random().toString(36).slice(2, 10)}`, name: '', strokes: [], fills: [], paint: [], v: 0 };
    st.strokes = (st.strokes || []).map(norm); st.fills = st.fills || []; st.paint = st.paint || [];
    const history = [];
    const remember = () => { history.push(JSON.stringify({ strokes: st.strokes, fills: st.fills, paint: st.paint })); if (history.length > 80) history.shift(); };
    let tool = 'line', size = 1, colour = 'water';
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem('troubadour.map.colours') || '[]').filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6); } catch (e) { recent = []; }

    $('#sheet-title').textContent = existing ? 'Change the place' : 'New place';
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = 'pe';
    $('#sheet').classList.add('wide');

    const name = el('input', 'pe-name');
    name.type = 'text'; name.maxLength = 40; name.placeholder = 'Its name: Lighthouse, Old mill, Temple…'; name.value = st.name;
    name.setAttribute('aria-label', 'Name of the place');
    name.setAttribute('enterkeyhint', 'done');
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

    const stage = el('div', 'pe-stage');
    const cv = el('canvas', 'pe-canvas');
    cv.setAttribute('aria-label', 'Drawing of the place');
    stage.append(cv);

    // Tools: lines, brush, pour, eraser; then the size, undo and start again.
    const tools = el('div', 'pe-tools');
    const tbtn = (id, icon, label) => {
      const b = el('button', 'pe-t'); b.type = 'button'; b.innerHTML = icon; b.title = label; b.setAttribute('aria-label', label); b.dataset.t = id;
      b.addEventListener('click', () => { tool = id; paintTools(); });
      return b;
    };
    const BRUSH = svg('<path d="M18.5 3.5l2 2-8.2 8.2-2.4.4.4-2.4z"/><path d="M9.6 13.8c-2.4-.3-4.4 1.4-4.4 3.8 0 1.4-.8 2.2-1.7 2.4 3.6 1.4 7.6-.4 7.6-4.2"/>', 18);
    const POUR = svg('<path d="M5 11l7-7 7 7-7 7z"/><path d="M5 11h14"/><path d="M20 15s1.6 2 1.6 3.1a1.6 1.6 0 0 1-3.2 0C18.4 17 20 15 20 15z"/>', 18);
    tools.append(tbtn('line', ICON.pen, 'Lines'), tbtn('brush', BRUSH, 'Brush: colour under the lines'), tbtn('pour', POUR, 'Pour a colour into a shape'), tbtn('erase', ICON.eraser, 'Eraser: rub out'));
    const sizes = el('div', 'pe-sizes');
    [0, 1, 2].forEach((k) => {
      const b = el('button', 'pe-s'); b.type = 'button'; b.dataset.s = k; b.setAttribute('aria-label', ['Fine', 'Medium', 'Large'][k]); b.title = ['Fine', 'Medium', 'Large'][k];
      b.append(el('i'));
      b.addEventListener('click', () => { size = k; paintTools(); });
      sizes.append(b);
    });
    const undo = el('button', 'pe-t'); undo.type = 'button'; undo.innerHTML = ICON.undo; undo.title = 'Undo'; undo.setAttribute('aria-label', 'Undo');
    undo.addEventListener('click', () => { const h = history.pop(); if (!h) return; Object.assign(st, JSON.parse(h)); draw(); });
    const clear = el('button', 'pe-t'); clear.type = 'button'; clear.innerHTML = ICON.trash; clear.title = 'Start again'; clear.setAttribute('aria-label', 'Start again (undo brings it back)');
    clear.addEventListener('click', () => { if (!st.strokes.length && !st.paint.length && !st.fills.length) return; remember(); st.strokes = []; st.fills = []; st.paint = []; draw(); toast('Cleared. Undo brings it back.', 1600); });
    const tools2 = el('div', 'pe-tools');
    tools2.append(sizes, el('span', 'grow'), undo, clear);

    // Colours: those of the theme, your own (the colour picker), the last ones you made.
    const colours = el('div', 'pe-colours');
    const pal = V.palette();
    const fillOf = (k) => (k === 'hole' ? '#17130F' : pal[k] || k);
    const chip = (k, label) => {
      const c = el('button', 'pe-c'); c.type = 'button'; c.dataset.c = k; c.title = label; c.setAttribute('aria-label', `${label}: tap to pick it, or drag it into a shape`);
      c.style.setProperty('--fill', fillOf(k));
      // A tap picks the colour (for the brush or the pour); a drag pours it where the finger lifts.
      c.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const id = e.pointerId, x0 = e.clientX, y0 = e.clientY;
        let ghost = null;
        try { c.setPointerCapture(id); } catch (err) { /* old browsers */ }
        const move = (ev) => {
          if (ev.pointerId !== id) return;
          if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) { ghost = el('div', 'pe-ghost'); ghost.style.setProperty('--fill', fillOf(k)); document.body.append(ghost); }
          if (ghost) ghost.style.transform = `translate(${ev.clientX - 14}px, ${ev.clientY - 14}px)`;
        };
        const up = (ev) => {
          if (ev.pointerId !== id) return;
          c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up);
          if (ghost) { ghost.remove(); if (ev.type === 'pointerup') pourAt(ev.clientX, ev.clientY, k); return; }
          colour = k;
          if (tool === 'line' || tool === 'erase') tool = 'brush';
          paintTools();
        };
        c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      });
      return c;
    };
    /* The colour picker: hue, colour and light, on sliders (the phone's own picker closes on its own in a dialog). */
    const hexOf = (h, sa, l) => {
      sa /= 100; l /= 100;
      const k = (n) => (n + h / 30) % 12, a2 = sa * Math.min(l, 1 - l);
      const f = (n) => Math.round(255 * (l - a2 * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
      return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    };
    const hslOf = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
      let h = 0;
      if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return [Math.round(((h * 60) + 360) % 360), Math.round(d ? (d / (1 - Math.abs(2 * l - 1))) * 100 : 0), Math.round(l * 100)];
    };
    const picker = el('div', 'pe-picker');
    picker.hidden = true;
    function openPicker() {
      const [h0, s0, l0] = /^#[0-9a-f]{6}$/i.test(colour) ? hslOf(colour) : [30, 45, 45];
      picker.textContent = '';
      const sw = el('span', 'sw'), hx = el('span', 'hx');
      const top = el('div', 'row'); top.append(sw, hx);
      const slider = (label, min, max, v) => { const l = el('label'); const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = 1; i.value = v; l.append(el('span', '', label), i); return { l, i }; };
      const H = slider('Hue', 0, 359, h0), C = slider('Colour', 0, 100, s0), L = slider('Light', 8, 92, l0);
      const paint = () => {
        const h = +H.i.value, sa = +C.i.value, l = +L.i.value, hex = hexOf(h, sa, l);
        sw.style.setProperty('--fill', hex); hx.textContent = hex.toUpperCase();
        H.i.style.setProperty('--track', `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((d) => hexOf(d, 85, 55)).join(',')})`);
        C.i.style.setProperty('--track', `linear-gradient(90deg, ${hexOf(h, 0, l)}, ${hexOf(h, 100, l)})`);
        L.i.style.setProperty('--track', `linear-gradient(90deg, ${hexOf(h, sa, 8)}, ${hexOf(h, sa, 50)}, ${hexOf(h, sa, 92)})`);
        return hex;
      };
      [H, C, L].forEach((x) => x.i.addEventListener('input', paint));
      const acts = el('div', 'acts');
      const no = el('button', 'btn slim', 'Cancel'); no.type = 'button'; no.addEventListener('click', () => { picker.hidden = true; });
      const yes = el('button', 'btn slim primary', 'Use it'); yes.type = 'button';
      yes.addEventListener('click', () => {
        const hex = paint();
        recent = [hex].concat(recent.filter((x) => x !== hex)).slice(0, 6);
        try { localStorage.setItem('troubadour.map.colours', JSON.stringify(recent)); } catch (e) { /* private mode */ }
        colour = hex;
        if (tool === 'line' || tool === 'erase') tool = 'brush';
        picker.hidden = true;
        paintColours();
      });
      acts.append(no, yes);
      picker.append(top, H.l, C.l, L.l, acts);
      paint();
      picker.hidden = false;
    }
    const paintColours = () => {
      colours.textContent = '';
      S.FILLS.forEach(([k, label]) => colours.append(chip(k, label)));
      recent.forEach((h) => colours.append(chip(h, h.toUpperCase())));
      const more = el('button', 'pe-c pe-more');
      more.type = 'button';
      more.title = 'Another colour';
      more.setAttribute('aria-label', 'Another colour');
      more.innerHTML = ICON.plus;
      more.addEventListener('click', () => openPicker());
      colours.append(more);
      paintTools();
    };
    const hint = el('p', 'pe-hint');

    const foot = el('div', 'pe-foot');
    if (existing) {
      const del = el('button', 'btn slim danger', 'Delete'); del.type = 'button';
      del.addEventListener('click', async () => {
        const used = rec.world.places.reduce((n, p) => n + p.elements.filter((e) => e.shape.type === 'stamp' && e.shape.stamp === st.id).length, 0);
        const ok = await ask(`Delete ${existing.name}?`, used ? `It is laid ${used} time${used > 1 ? 's' : ''} on the maps of this world: those become plain circles.` : 'It leaves the library of this world.', [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, cls: 'danger' }]);
        if (!ok) return;
        rec.world.stamps = (rec.world.stamps || []).filter((x) => x.id !== st.id);
        S.forget(st.id);
        save(); buildStamps(); V.redraw();
        $('#sheet').close();
      });
      foot.append(del);
    }
    const cancel = el('button', 'btn slim', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', () => $('#sheet').close());
    const ok = el('button', 'btn slim primary', existing ? 'Save' : 'Add to the library'); ok.type = 'button';
    ok.addEventListener('click', () => {
      if (!st.strokes.length && !st.paint.length) { toast('Draw your place first.', 1800); return; }
      st.name = name.value.trim() || 'Place';
      st.v = (existing ? (existing.v || 0) : 0) + 1;
      const list = rec.world.stamps || (rec.world.stamps = []);
      const at = list.findIndex((x) => x.id === st.id);
      if (at >= 0) list[at] = st; else list.push(st);
      S.register([st]);
      save(); buildStamps(); V.redraw();
      $('#sheet').close();
      if (!existing) { V.setStamp(st.id); paintStamps(st.id); toast(`Tap the map to lay ${st.name.toLowerCase()}.`, 2000); }
    });
    foot.append(el('span', 'grow'), cancel, ok);

    const side = el('div', 'pe-side');
    side.append(name, tools, tools2, colours, hint);
    const main = el('div', 'pe-main');
    main.append(stage, side);
    body.append(main, foot, picker);

    const HINTS = {
      line: 'Draw the lines of your place with your finger. A line that ends near its start closes the shape.',
      brush: 'Paint with the colour picked: it always stays under the lines.',
      pour: 'Tap inside a closed shape to pour the colour picked. You can also drag a colour into a shape.',
      erase: 'Rub out lines and paint. A tap inside a shape takes its poured colour away.',
    };
    function paintTools() {
      tools.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === tool)));
      sizes.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.s) === size)));
      sizes.dataset.tool = tool;
      colours.querySelectorAll('.pe-c[data-c]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === colour && tool !== 'line' && tool !== 'erase')));
      cv.style.cursor = tool === 'pour' ? 'cell' : tool === 'erase' ? 'none' : 'crosshair';
      hint.textContent = HINTS[tool];
    }
    let live = null, eraser = null, rubbed = false;
    const widthNow = () => (tool === 'brush' ? BRUSH_W[size] : LINE_W[size]);
    function draw() {
      const r = cv.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(10, Math.round(r.width));
      if (cv.width !== Math.round(w * d)) { cv.width = cv.height = Math.round(w * d); }
      const c = cv.getContext('2d');
      c.setTransform(d, 0, 0, d, 0, 0);
      const p = V.palette();
      c.fillStyle = p.paper; c.fillRect(0, 0, w, w);
      c.strokeStyle = p.line; c.lineWidth = 1; c.globalAlpha = 0.5;
      for (let i = 1; i < 8; i++) { const q = Math.round((i * w) / 8) + 0.5; c.beginPath(); c.moveTo(q, 0); c.lineTo(q, w); c.moveTo(0, q); c.lineTo(w, q); c.stroke(); }
      c.globalAlpha = 1;
      const shown = Object.assign({}, st, { v: `e${JSON.stringify(st.strokes).length}-${JSON.stringify(st.paint).length}-${JSON.stringify(st.fills)}` });
      c.drawImage(S.picture(shown, Object.assign({ hole: '#17130F' }, p)), 0, 0, w, w);
      if (live) {
        // The line or the paint being drawn, over the picture (it takes its place when the finger lifts).
        const col = live.kind === 'brush' ? fillOf(live.c) : p.ink;
        c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w * live.w;
        if (live.kind === 'brush') c.globalAlpha = 0.85;
        c.beginPath(); live.p.forEach((q, i) => (i ? c.lineTo(q[0] * w, q[1] * w) : c.moveTo(q[0] * w, q[1] * w)));
        if (live.p.length === 1) { c.arc(live.p[0][0] * w, live.p[0][1] * w, c.lineWidth / 2, 0, Math.PI * 2); c.fill(); } else c.stroke();
        c.globalAlpha = 1;
      }
      if (eraser) {
        c.strokeStyle = p.ink; c.lineWidth = 1.5; c.setLineDash([3, 3]);
        c.beginPath(); c.arc(eraser[0] * w, eraser[1] * w, ERASE_R[size] * w, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      }
    }
    const toUnit = (cx, cy) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (cx - r.left) / r.width)), Math.max(0, Math.min(1, (cy - r.top) / r.height))]; };
    const r3 = (v) => Math.round(v * 1000) / 1000;
    function pourAt(cx, cy, k) {
      const r = cv.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return;
      const [x, y] = toUnit(cx, cy);
      const next = S.fillAt(st, x, y, k);
      if (!next) { toast('Pour the colour inside a closed shape.', 1800); return; }
      remember(); st.fills = next; draw();
    }
    /** The eraser rubs out what lies under it: the lines and the paint are cut where it passes. */
    function rub(x, y) {
      const rr = ERASE_R[size];
      let changed = false;
      const cut = (list) => {
        const out = [];
        list.forEach((sk) => {
          // Points close enough together for the eraser to cut between them.
          const dense = [];
          sk.p.forEach((q, i) => {
            if (i) { const a = sk.p[i - 1]; const n = Math.ceil(Math.hypot(q[0] - a[0], q[1] - a[1]) / (rr / 3)); for (let k = 1; k < n; k++) dense.push([a[0] + ((q[0] - a[0]) * k) / n, a[1] + ((q[1] - a[1]) * k) / n]); }
            dense.push(q);
          });
          let run = [], hit = false;
          dense.forEach((q) => {
            if (Math.hypot(q[0] - x, q[1] - y) <= rr + sk.w / 2) { hit = true; if (run.length > 1) out.push(Object.assign({}, sk, { p: run.map((v) => [r3(v[0]), r3(v[1])]) })); run = []; }
            else run.push(q);
          });
          if (!hit) { out.push(sk); return; }
          changed = true;
          if (run.length > 1) out.push(Object.assign({}, sk, { p: run.map((v) => [r3(v[0]), r3(v[1])]) }));
        });
        return out;
      };
      const s2 = cut(st.strokes), p2 = cut(st.paint);
      if (!changed) return;
      if (!rubbed) { remember(); rubbed = true; }
      st.strokes = s2; st.paint = p2;
    }
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [x, y] = toUnit(e.clientX, e.clientY);
      if (tool === 'pour') { pourAt(e.clientX, e.clientY, colour); return; }
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
      if (tool === 'erase') { rubbed = false; eraser = [x, y]; eraser.moved = false; eraser.start = [x, y]; rub(x, y); draw(); return; }
      live = { kind: tool, c: colour, w: widthNow(), p: [[r3(x), r3(y)]] };
      draw();
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = toUnit(e.clientX, e.clientY);
      if (eraser) {
        if (Math.hypot(x - eraser.start[0], y - eraser.start[1]) > 0.01) eraser.moved = true;
        const keep = { moved: eraser.moved, start: eraser.start };
        eraser = Object.assign([x, y], keep);
        rub(x, y); draw(); return;
      }
      if (!live) return;
      const last = live.p[live.p.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < 0.005) return;
      live.p.push([r3(x), r3(y)]);
      draw();
    });
    const end = () => {
      if (eraser) {
        // A tap that rubbed nothing, inside a coloured shape: its poured colour goes.
        if (!eraser.moved && !rubbed) {
          const next = S.fillAt(st, eraser.start[0], eraser.start[1], 'stone');
          if (next) { const kept = next.slice(0, -1); if (kept.length !== st.fills.length) { remember(); st.fills = kept; } }
        }
        eraser = null; draw(); return;
      }
      if (!live) return;
      if (live.kind === 'line') {
        // A line that ends near where it began closes itself, so it can take a colour.
        const a = live.p[0], b = live.p[live.p.length - 1];
        if (live.p.length > 4 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05) live.p.push([a[0], a[1]]);
        remember(); st.strokes.push({ w: live.w, p: live.p });
      } else { remember(); st.paint.push({ c: live.c, w: live.w, p: live.p }); }
      live = null; draw();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (eraser && !eraser.moved) return; });
    const ro = new ResizeObserver(() => draw());
    ro.observe(stage);
    $('#sheet').addEventListener('close', () => { ro.disconnect(); $('#sheet').classList.remove('wide'); body.className = ''; }, { once: true });
    paintColours();
    $('#sheet').showModal();
    requestAnimationFrame(draw);
  }

  /* ================= Settings ================= */
  function buildSettings() {
    const paintThemes = () => window.TroubadourThemes.render($('#theme-pick'), window.TroubadourThemes.resolve(settings.theme), (id) => { settings.theme = id; saveSettings(); applyTheme(); paintSettings(); });
    $('#mode-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      settings.mode = b.dataset.v; saveSettings(); applyTheme(); paintSettings();
    });
    $('#fade-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      settings.fade = Number(b.dataset.v); saveSettings(); paintSettings();
    });
    // Playback, as in Troubadour.
    $('#fadein-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      settings.fadeIn = Number(b.dataset.v); saveSettings(); paintSettings();
    });
    const stepRandom = (d) => { settings.randomMax = Math.min(A.RANDOM_TOP, Math.max(1, A.randomMax() + d)); saveSettings(); paintSettings(); };
    $('#random-less').addEventListener('click', () => stepRandom(-1));
    $('#random-more').addEventListener('click', () => stepRandom(1));
    $('#opt-life').addEventListener('change', (e) => { settings.life = e.target.checked; saveSettings(); paintSettings(); });
    const stepLife = (d) => { settings.lifeEvery = Math.min(30, Math.max(2, A.lifeEvery() + d)); saveSettings(); paintSettings(); };
    $('#life-less').addEventListener('click', () => stepLife(A.lifeEvery() > 10 ? -2 : -1));
    $('#life-more').addEventListener('click', () => stepLife(A.lifeEvery() >= 10 ? 2 : 1));
    $('#opt-crossfade').addEventListener('change', (e) => { settings.crossfade = e.target.checked; saveSettings(); });
    document.querySelectorAll('[id^="vol-"][data-zone]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      settings.vol[g.dataset.zone] = b.dataset.v; saveSettings(); paintSettings();
      if (rec && mode === 'play') renderPanel();
    }));
    $('#opt-trail').addEventListener('change', (e) => { settings.trail = e.target.checked; saveSettings(); paintSettings(); });
    $('#trail-speed').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      settings.trailSpeed = Number(b.dataset.v); saveSettings(); paintSettings();
    });
    $('#opt-trail-walls').addEventListener('change', (e) => { settings.trailWalls = e.target.checked; saveSettings(); });
    $('#rotate-ok').addEventListener('click', () => { settings.portrait = true; saveSettings(); document.documentElement.classList.add('portrait-ok'); if (V.fit && screen === 'world') requestAnimationFrame(() => V.fit()); });
    $('#opt-portrait').addEventListener('change', (e) => { settings.portrait = e.target.checked; saveSettings(); document.documentElement.classList.toggle('portrait-ok', settings.portrait); });
    $('#opt-rings').addEventListener('change', (e) => { settings.rings = e.target.checked; saveSettings(); V.redraw(); });
    $('#opt-awake').addEventListener('change', (e) => { settings.awake = e.target.checked; saveSettings(); settings.awake ? acquireWake() : releaseWake(); });
    $('#opt-silent').addEventListener('change', (e) => { settings.silent = e.target.checked; saveSettings(); applyAudioSession(); });
    $('[data-action="wipe"]').addEventListener('click', async () => {
      const ok = await ask('Erase everything?', 'Every world and every sound leaves this device. Your settings stay.', [{ label: 'Cancel', value: false }, { label: 'Erase', value: true, cls: 'danger' }]);
      if (!ok) return;
      A.close(0); rec = null; leaveOk = true;
      await DB.wipe();
      $('#settings').close();
      location.hash = '#/';
      renderLibrary();
    });
    $('#app-version').textContent = `version ${VERSION}`;
    if (window.BardAccount) window.BardAccount.mount($('#troubadour-account'));
    buildSettings.paintThemes = paintThemes;
  }
  function paintSettings() {
    buildSettings.paintThemes();
    document.querySelectorAll('#mode-pick [data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.mode)));
    document.querySelectorAll('#fade-pick [data-v]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.v) === settings.fade)));
    document.querySelectorAll('[id^="vol-"][data-zone]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.vol[g.dataset.zone]))));
    document.querySelectorAll('#fadein-pick [data-v]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.v) === (settings.fadeIn ?? 1000))));
    $('#random-val').textContent = `${A.randomMax()} s`;
    $('#random-note').textContent = `Plays again after a pause of 0.5\u00a0s to ${A.randomMax()}\u00a0s`;
    $('#random-less').disabled = A.randomMax() <= 1;
    $('#random-more').disabled = A.randomMax() >= A.RANDOM_TOP;
    $('#opt-life').checked = !!settings.life;
    $('#life-val').textContent = `${A.lifeEvery()} s`;
    $('#life-note').textContent = `A new volume about every ${A.lifeEvery()}\u00a0s`;
    $('#life-less').disabled = !settings.life || A.lifeEvery() <= 2;
    $('#life-more').disabled = !settings.life || A.lifeEvery() >= 30;
    $('#life-row').classList.toggle('off', !settings.life);
    $('#opt-crossfade').checked = settings.crossfade;
    $('#opt-rings').checked = settings.rings;
    $('#opt-trail-walls').checked = settings.trailWalls !== false;
    $('#opt-portrait').checked = !!settings.portrait;
    $('#opt-trail').checked = settings.trail;
    $('#trail-speed-row').hidden = !settings.trail;
    document.querySelectorAll('#trail-speed [data-v]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.v) === settings.trailSpeed)));
    $('#opt-awake').checked = settings.awake;
    $('#opt-silent').checked = settings.silent;
  }
  async function openSettings() {
    paintSettings();
    $('#settings').showModal();
    const info = $('#store-info');
    info.textContent = 'Checking…';
    const p = await DB.persistence();
    const size = (b) => window.Troubadour.formatSize(b || 0);
    info.textContent = `${p.usage != null ? `In use: about ${size(p.usage)}.` : ''} ${p.persisted ? 'Protected: the browser keeps it even when space runs low.' : 'Not protected: the browser may clear it if space runs low.'}`;
  }

  /* ================= Keep the screen awake ================= */
  let wake = null, videoAwake = false;
  async function acquireWake() {
    if (!settings.awake || screen !== 'world' || mode !== 'play' || document.visibilityState !== 'visible') return;
    if ('wakeLock' in navigator && !wake) {
      try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); return; } catch (e) { wake = null; }
    }
    if (wake || videoAwake) return;
    const v = $('#awake-video');
    if (!v.src) v.src = '../ios/261014_keep_awake.mp4';
    v.play().then(() => { videoAwake = true; }).catch(() => {});
  }
  function releaseWake() {
    if (wake) { wake.release().catch(() => {}); wake = null; }
    if (videoAwake) { $('#awake-video').pause(); videoAwake = false; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      acquireWake();
      if (A.isOpen()) { const { ctx } = audio(); if (ctx.state !== 'running') ctx.resume().catch(() => {}); }
    } else flush();
  });

  /* ================= Routing ================= */
  function show(id) {
    ['library', 'world', 'sbx'].forEach((s) => { $(`#${s}`).hidden = s !== id; });
    screen = id;
    document.documentElement.dataset.screen = id;
    if (id !== 'world') { A.close(); releaseWake(); stopPreview(); closeMusic(); closeSoundbox(); stopPads(); }
    if (id !== 'sbx') stopFxWhere((k) => k.startsWith('shared:'));
  }

  /** Leaving a world asks first, whatever the way out (the back button of the top bar, of the browser or of the phone). */
  let leaveOk = false;
  async function leaveWorld() {
    if (screen !== 'world' || !rec) { location.hash = '#/'; return; }
    const playing = mode === 'play';
    const ok = await ask(`Leave ${rec.story.title || 'this world'}?`,
      playing ? 'Its sounds fade out and you go back to your worlds.' : 'Your drawing is saved. You go back to your worlds.',
      [{ label: 'Stay', value: false }, { label: 'Leave', value: true, cls: 'danger' }]);
    if (!ok) return;
    leaveOk = true;
    location.hash = '#/';
  }
  async function route() {
    const m = /^#\/(play|edit)\/([^/]+)(?:\/(\d+))?$/.exec(location.hash);
    if (!m && screen === 'world' && rec && !leaveOk) {
      // A back gesture: stay in the world (its address comes back) and ask.
      history.pushState(null, '', here());
      leaveWorld();
      return;
    }
    leaveOk = false;
    if (!m && location.hash === '#/soundbox') { flush(); show('sbx'); rec = null; renderShared(); return; }
    if (!m) { flush(); show('library'); rec = null; await renderLibrary(); return; }
    const n = Number(m[3] || 0);
    if (rec && rec.uid === m[2] && screen === 'world') {
      if (m[1] !== mode) { flush(); mode = m[1]; if (n !== pi) await goPlace(n); else await setMode(mode); }
      else if (n !== pi) goPlace(n);
      return;
    }
    const r = await DB.get(m[2]);
    if (!r) { location.hash = '#/'; return; }
    DB.put(r).catch(() => {}); // last opened: first in the library
    show('world');
    await openWorld(r, n, m[1]);
  }

  /* ================= The world's music (the Music button, right of the Soundbox) ================= */
  /** The musics of the world: kept in map.json (world.music). An older world starts from every music of its story;
   *  a music laid on a map always joins them (it starts when the party arrives on that map). */
  function worldMusic() {
    const w = rec.world;
    const seen = new Set();
    const add = (x) => { if (x.file && rec.files[x.file] && !seen.has(x.file)) { seen.add(x.file); w.music.push(M.card(Object.assign({}, x, { zone: 'music' }))); } };
    if (!Array.isArray(w.music)) {
      w.music = [];
      M.soundsOf(rec.story).forEach((x) => { if (x.zone === 'music') add(x); });
    }
    w.music = w.music.filter((c) => rec.files[c.file]);
    // Their loop: 1×, 2× or ∞. Musics that had none of them (play after, or the days without a loop button) loop.
    if (w.musicLoops !== 1) { w.music.forEach((c) => { c.play = 'loop'; }); w.musicLoops = 1; }
    w.music.forEach((c) => { c.zone = 'music'; if (!['once', 'twice', 'loop'].includes(c.play)) c.play = 'loop'; });
    w.music.forEach((c) => seen.add(c.file));
    w.places.forEach((p) => p.general.concat(...p.elements.map((e) => e.cards)).forEach((c) => { if (c.zone === 'music') add(c); }));
    return w.music;
  }

  const musRows = [];
  let musQ = '';
  function openMusic() {
    closeSoundbox();
    $('#mw-mus').hidden = false;
    $('#world').classList.add('over');
    $('#mw-mus-btn').setAttribute('aria-pressed', 'true');
    A.setMusic(worldMusic());
    renderMusic();
  }
  function closeMusic() {
    $('#mw-mus').hidden = true;
    if ($('#mw-sbx').hidden) $('#world').classList.remove('over');
    $('#mw-mus-btn').setAttribute('aria-pressed', 'false');
    musRows.length = 0;
  }
  /** Every music of the world, the one heard now first: a tap plays it (crossfading the one playing). */
  let musQueueView = false;
  function renderMusic() {
    musRows.length = 0;
    const now = $('#mw-mus-now'), list = $('#mw-mus-list');
    now.textContent = ''; list.textContent = '';
    const all = rec.world.music || [];
    $('#mw-mus-queue').setAttribute('aria-pressed', String(musQueueView));
    $('.mus-q').hidden = musQueueView;
    // The music heard now: its card (progress, play and pause, stop, volume).
    let shown, nowRows = [];
    musRows.push(() => {
      const c = A.currentMusic();
      if (c !== shown) {
        shown = c;
        now.textContent = ''; nowRows = [];
        if (c) { now.append(withRows(nowRows, () => cardRow(c, all, null))); requestAnimationFrame(() => rollTitles(now)); }
        else now.append(el('p', 'mus-none', 'No music playing. Tap one below.'));
      }
      nowRows.forEach((f) => f());
    });
    // The queue button: how many musics wait.
    const paintQ = (n) => { $('#mw-mus-queue').innerHTML = ICON.queue + (n ? `<i class="qn">${n}</i>` : ''); };
    let qn = A.queue().length;
    paintQ(qn);
    musRows.push(() => {
      const n = A.queue().length;
      if (n === qn) return;
      qn = n;
      paintQ(n);
      // The queue moved on by itself (a music ended): its view is drawn again, outside this paint.
      if (musQueueView) setTimeout(renderMusic, 0);
    });
    if (!all.length) { list.append(el('p', 'sb-empty', 'No music in this world yet. Add some in the editor, behind its Music button.')); refreshLive(); return; }
    const iconBtn = (cls, icon, label, fn) => {
      const b = el('button', `mus-i ${cls}`); b.type = 'button'; b.innerHTML = icon; b.title = label; b.setAttribute('aria-label', label);
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(b); });
      return b;
    };
    const ensureMusic = async (c, r, pb) => {
      audio(true);
      if (buffers.get(c.file)) return true;
      r.classList.add('busy'); pb.classList.add('wait');
      await ensure([c.file], false);
      pb.classList.remove('wait'); r.classList.remove('busy');
      if (!buffers.get(c.file)) { toast('This music cannot be read here.'); return false; }
      return true;
    };
    const musicRow = (c, opts) => {
      const r = el('div', 'snd z-music mus-row');
      r.setAttribute('role', 'button');
      r.tabIndex = 0;
      const pb = el('span', 'snd-play');
      pb.innerHTML = ICON.play;
      const t = el('span', 'snd-t');
      const sub = el('small', '', '');
      t.append(el('b', '', c.name), sub);
      r.append(pb, t, ...opts.buttons(r, pb));
      const go = async () => { if (r.classList.contains('busy')) return; if (!(await ensureMusic(c, r, pb))) return; A.setMusic(all); opts.play(); refreshLive(); };
      r.addEventListener('click', go);
      r.addEventListener('keydown', (ev) => { if (ev.target === r && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); go(); } });
      musRows.push(() => {
        const v = A.voice(c), st = v ? v.state : 'idle';
        const icon = st === 'playing' ? 'pause' : 'play';
        if (pb.dataset.i !== icon) { pb.innerHTML = ICON[icon]; pb.dataset.i = icon; }
        r.classList.toggle('in', st === 'playing' || st === 'paused');
        const b = buffers.get(c.file);
        const txt = st === 'playing' ? 'Playing' : st === 'paused' ? 'Paused' : st === 'ending' ? 'Fading out' : b ? clockOf(b.duration) : '';
        if (sub.textContent !== txt) sub.textContent = txt;
      });
      return r;
    };

    if (musQueueView) {
      // The queue: what plays next, in order. A tap plays one now.
      const q = A.queue();
      if (!q.length) list.append(el('p', 'sb-empty', 'The queue is empty. Add musics to it with their queue button.'));
      q.forEach((c, i) => list.append(musicRow(c, {
        play: () => A.playMusic(c, i),
        buttons: () => [
          iconBtn('', ICON.up, 'Play earlier', () => { A.queueMove(i, -1); renderMusic(); }),
          iconBtn('', ICON.down, 'Play later', () => { A.queueMove(i, 1); renderMusic(); }),
          iconBtn('', ICON.x, 'Take out of the queue', () => { A.queueRemove(i); renderMusic(); }),
        ],
      })));
      list.querySelectorAll('.mus-row').forEach((r, i, rows) => { const bs = r.querySelectorAll('.mus-i'); bs[0].disabled = i === 0; bs[1].disabled = i === rows.length - 1; });
      refreshLive();
      return;
    }

    const words = fold(musQ).split(/\s+/).filter(Boolean);
    const rows = new Map();
    all.forEach((c) => {
      if (words.length && !words.every((k) => fold(c.name).includes(k))) return;
      const r = musicRow(c, {
        play: () => A.toggle(c),
        buttons: (row, pb) => [iconBtn('', ICON.queueAdd, 'Add to the queue', async (b) => {
          if (!(await ensureMusic(c, row, pb))) return;
          A.setMusic(all);
          A.queueAdd(c);
          b.classList.remove('done'); void b.offsetWidth; b.classList.add('done');
          toast(`${c.name}: in the queue.`, 1400);
        })],
      });
      rows.set(c, r);
      list.append(r);
    });
    if (!rows.size) list.append(el('p', 'sb-empty', 'No music with this name.'));
    // The one heard now goes first; the others keep their order.
    let order = null;
    musRows.push(() => {
      const c = A.currentMusic();
      if (c === order) return;
      order = c;
      const first = c && rows.get(c);
      [...rows.values()].forEach((r) => list.append(r));
      if (first) { list.prepend(first); list.scrollTop = 0; }
    });
    refreshLive();
  }

  /* ================= Effects, as in the Troubadour web app: the shared soundbox, the world's soundbox ================= */
  let SHARED = []; // { id, name, blob, size, duration, volume }
  const saveShared = () => DB.setKV('soundbox', SHARED).catch((e) => toast(`Could not save: ${e.message || e}`, 4000));
  const fmtSize = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const DEV = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone|iPod/.test(navigator.userAgent) ? 'iPhone' : 'device';

  /** Listening to effects: as many at once as the troubadour likes, each through the table's volume curve. */
  const fxPreviews = new Map(); // key -> { src, gain, card, btn }
  function stopFx(key) {
    const p = fxPreviews.get(key);
    if (!p) return;
    fxPreviews.delete(key);
    try { p.src.stop(); } catch (e) { /* done */ }
    if (p.card) p.card.classList.remove('playing');
    if (p.btn) { p.btn.innerHTML = ICON.play; p.btn.classList.remove('on'); }
  }
  const stopFxWhere = (f) => [...fxPreviews.keys()].filter(f).forEach(stopFx);
  async function toggleFx(key, getBlob, vol, card, b) {
    if (fxPreviews.has(key)) { stopFx(key); return; }
    const { ctx, master } = audio(true);
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    let buf = buffers.get(key);
    if (!buf) {
      if (b) b.classList.add('wait');
      try { buf = await decode(await getBlob()); buffers.set(key, buf); } catch (e) { buf = null; }
      if (b) b.classList.remove('wait');
      if (!buf) { toast('This sound is missing.'); return; }
    }
    if (fxPreviews.has(key)) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = A.curve(vol());
    src.connect(gain).connect(master);
    src.start();
    fxPreviews.set(key, { src, gain, card, btn: b });
    if (card) card.classList.add('playing');
    if (b) { b.innerHTML = ICON.pause; if (b.classList.contains('pick-play')) b.classList.add('on'); }
    src.onended = () => { const p = fxPreviews.get(key); if (p && p.src === src) stopFx(key); };
  }

  /** An effect card, as Troubadour's: its name, remove, listen, length and size, move earlier or later, volume. */
  function fxCard(s, i, list, o) {
    const c = el('div', 'sc');
    c.style.setProperty('--z', o.colour || 'var(--accent)');
    const top = el('div', 'row');
    const name = el('input');
    name.value = s.name;
    name.maxLength = 80;
    name.setAttribute('aria-label', 'Sound name');
    name.setAttribute('enterkeyhint', 'done');
    name.oninput = () => { s.name = name.value; o.save(); };
    name.onblur = () => { if (!s.name.trim()) { s.name = 'Effect'; name.value = s.name; o.save(); } };
    name.onkeydown = (e) => { if (e.key === 'Enter') name.blur(); };
    const x = el('button', 'x');
    x.type = 'button'; x.innerHTML = ICON.x; x.setAttribute('aria-label', `Remove ${s.name}`);
    x.onclick = async () => {
      const v = await ask(`Remove “${s.name}”?`, o.removeText, [{ label: 'Cancel', value: null }, { label: 'Remove', value: 'rm', cls: 'danger' }]);
      if (v !== 'rm') return;
      stopFx(o.key);
      list.splice(list.indexOf(s), 1);
      if (o.onRemove) o.onRemove(s);
      o.save();
      o.rerender();
    };
    top.append(name, x);
    const bottom = el('div', 'row');
    const play = el('button', 'pb play');
    play.type = 'button'; play.innerHTML = ICON.play; play.setAttribute('aria-label', `Listen to ${s.name}`);
    play.onclick = () => toggleFx(o.key, o.getBlob, () => s.volume, c, play);
    if (fxPreviews.has(o.key)) { c.classList.add('playing'); play.innerHTML = ICON.pause; const p = fxPreviews.get(o.key); p.card = c; p.btn = play; }
    const meta = el('span', 'meta');
    const paintMeta = () => { meta.textContent = ''; [s.duration ? clockOf(s.duration) : null, s.size ? fmtSize(s.size) : null].filter(Boolean).forEach((t) => meta.append(el('span', '', t))); };
    paintMeta();
    // Older effects learn their size (and length) the first time they show.
    if (!s.size || !s.duration) {
      o.getBlob().then(async (blob) => {
        if (!blob) return;
        let changed = false;
        if (!s.size) { s.size = blob.size; changed = true; }
        if (!s.duration) { try { const b = buffers.get(o.key) || await decode(blob); buffers.set(o.key, b); s.duration = Math.round(b.duration * 10) / 10; changed = true; } catch (e) { /* unreadable */ } }
        if (changed) { paintMeta(); o.save(); }
      }).catch(() => {});
    }
    const mv = el('span', 'mvh');
    const mvb = (icon, label, d) => {
      const b = el('button'); b.type = 'button'; b.innerHTML = icon; b.setAttribute('aria-label', label); b.title = label;
      b.disabled = d < 0 ? i === 0 : i === list.length - 1;
      b.onclick = () => { const j = i + d; if (j < 0 || j >= list.length) return; [list[j], list[i]] = [list[i], list[j]]; o.save(); o.rerender(); };
      return b;
    };
    mv.append(mvb(ICON.left, 'Move earlier', -1), mvb(ICON.right, 'Move later', 1));
    bottom.append(play, meta, mv);
    // A music's loop, as on Troubadour's cards: 1×, 2×, ∞ (soundbox effects fire once, they have none).
    if (o.loops) {
      const loop = el('button');
      loop.type = 'button';
      paintLoop(loop, s);
      loop.addEventListener('click', () => {
        const next = o.loops[(o.loops.indexOf(s.play) + 1) % o.loops.length];
        Object.assign(s, M.cleanCard(Object.assign({}, s, { play: next })));
        paintLoop(loop, s);
        o.save();
      });
      bottom.append(loop);
    }
    // Its volume: the level it fires at.
    const volRow = el('label', 'row edvol');
    volRow.append(el('span', 'vl', 'Volume'));
    const vr = el('input');
    vr.type = 'range'; vr.min = 0; vr.max = 1; vr.step = 0.05; vr.value = typeof s.volume === 'number' ? s.volume : 0.75;
    vr.setAttribute('aria-label', `Default volume of ${s.name}`);
    vr.style.setProperty('--z', o.colour || 'var(--accent)');
    const vp = el('b', 'vp', `${Math.round(+vr.value * 100)}`);
    vr.addEventListener('input', () => {
      s.volume = Math.round(+vr.value * 100) / 100;
      const p = fxPreviews.get(o.key);
      if (p) p.gain.gain.setTargetAtTime(A.curve(s.volume), audio().ctx.currentTime, 0.03);
      vp.textContent = `${Math.round(s.volume * 100)}`;
      o.save();
    });
    volRow.append(vr, vp);
    c.append(top, bottom, volRow);
    requestAnimationFrame(() => paintRange(vr));
    return c;
  }
  /** The dashed zone of effects, with its Add button at the foot. */
  function fxZone(list, opts, hint, onAdd, colour) {
    const dz = el('div', 'dz');
    dz.style.setProperty('--z', colour || 'var(--accent)');
    list.forEach((s, i) => dz.append(fxCard(s, i, list, opts(s))));
    const h = el('button', 'hint');
    h.type = 'button';
    h.innerHTML = `${ICON.plus}<span>${list.length ? 'Add more' : hint}</span>`;
    h.onclick = onAdd;
    dz.append(h);
    return dz;
  }

  /* The shared soundbox screen (the star of the worlds screen). */
  function renderShared() {
    const box = $('#shared-list');
    box.textContent = '';
    box.append(fxZone(SHARED, (s) => ({ key: `shared:${s.blob}`, getBlob: () => DB.getBlob(s.blob), save: saveShared, rerender: renderShared, removeText: 'It leaves your shared soundbox.' }),
      'Add your first effects: critical hits, level ups, explosions', addShared));
  }
  function addShared() {
    fxPicker('the shared soundbox', new Set(SHARED.map((s) => s.blob)), async (picked) => {
      for (const r of picked) {
        const blob = r.blobKey ? null : await r.getBlob();
        const key = r.blobKey || await DB.putBlob(blob);
        SHARED.push({ id: DB.uid(), name: String(r.name || 'Effect').slice(0, 80), blob: key, size: r.size || (blob && blob.size) || 0, duration: r.duration || 0, volume: 0.75 });
      }
      await saveShared();
      renderShared();
    });
  }

  /* The world's soundbox, in the editor. */
  function editSoundbox(box) {
    const list = rec.world.soundbox || (rec.world.soundbox = []);
    box.append(el('p', 'pn-note', 'Quick effects for this world only. They sit next to your shared soundbox on the table.'));
    box.append(fxZone(list, (c) => ({ key: `w:${c.file}`, getBlob: () => DB.getBlob(rec.files[c.file]), save, rerender: renderPanel, removeText: 'It leaves the soundbox of this world.' }),
      'Add effects: critical hits, doors, thunder', () => {
        fxPicker('the soundbox', new Set(list.map((c) => rec.files[c.file])), async (picked) => {
          for (const r of picked) {
            const key = r.blobKey || await DB.putBlob(await r.getBlob());
            const path = freePath(`sounds/map/soundbox/${window.Troubadour.slug(r.name, 'sound')}.${r.ext || 'mp3'}`);
            rec.files[path] = key;
            list.push(Object.assign(M.card({ name: String(r.name || 'Effect').slice(0, 80), file: path, zone: 'soundbox', volume: 0.75 }, { play: 'once' }), { size: r.size || 0, duration: r.duration || 0 }));
          }
          flush();
          renderPanel();
        });
      }));
  }

  /** The sound picker of the Troubadour web app: Files, the sounds on this device or the Recueil, ticked and added at once.
   *  `have` holds the stored sounds already in the list; `onAdd(rows)` gets { name, blobKey | getBlob, size, duration, ext }. */
  let fxSource = 'device';
  async function fxPicker(label, have, onAdd, kind = 'soundbox') {
    stopPreview();
    // On this device: every sound of every world, and the shared soundbox. Reusing one takes no extra space.
    const seen = new Map();
    const extOf = (p) => ((String(p).split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3');
    (await DB.list()).forEach((r) => {
      (r.world.soundbox || []).forEach((c) => { const k = r.files[c.file]; if (k && !seen.has(k)) seen.set(k, { name: c.name, from: r.story.title || 'World', kind: 'soundbox', key: k, ext: extOf(c.file), size: c.size, duration: c.duration }); });
      M.soundsOf(r.story).forEach((x) => { const k = r.files[x.file]; if (k && !seen.has(k)) seen.set(k, { name: x.name, from: r.story.title || 'World', kind: x.zone, key: k, ext: extOf(x.file) }); });
    });
    SHARED.forEach((s) => { if (!seen.has(s.blob)) seen.set(s.blob, { name: s.name, from: 'Shared soundbox', kind: 'soundbox', key: s.blob, size: s.size, duration: s.duration }); });
    const local = [...seen.values()].filter((x) => !have.has(x.key)).sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => ({ key: `d:${x.key}`, name: x.name, kind: x.kind, sub: [x.from, x.duration ? clockOf(x.duration) : null].filter(Boolean).join(', '), blobKey: x.key, ext: x.ext || 'mp3', size: x.size, duration: x.duration, fold: fold(`${x.name} ${x.from} ${x.kind}`), getBlob: () => DB.getBlob(x.key) }));

    $('#sheet-title').textContent = `Add to ${label}`;
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = 'picker';
    const stopPick = () => stopFxWhere((k) => k.startsWith('pick:'));
    const fromFiles = el('button', 'btn big-pick');
    fromFiles.type = 'button';
    fromFiles.innerHTML = `${ICON.files}<span>Choose from Files</span>`;
    fromFiles.onclick = async () => {
      const files = (await chooseFiles('audio/*,.mp3,.ogg,.m4a,.wav', true)).filter((f) => window.Troubadour.isAudio(f) || /^audio\//.test(f.type));
      if (!files.length) return;
      stopPick();
      $('#sheet').close();
      busy('Adding sounds', '', 0);
      try {
        const rows = [];
        for (const f of files) {
          let duration = 0;
          try { duration = Math.round((await decode(f)).duration * 10) / 10; } catch (e) { /* unreadable */ }
          rows.push({ name: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Effect', getBlob: async () => f, size: f.size, duration, ext: extOf(f.name) });
        }
        await onAdd(rows);
        toast(`${plural(rows.length, 'sound')} added.`);
      } catch (e) { toast(e.message || String(e), 4000); }
      idle();
    };
    body.append(fromFiles);

    const tabs = el('div', 'seg pick-tabs');
    const tab = (id, text) => { const b = el('button', '', text); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.src = id; b.onclick = () => { fxSource = id; paintTabs(); draw(); }; return b; };
    tabs.append(tab('device', `On this ${DEV}`), tab('recueil', 'From the Recueil'));
    const paintTabs = () => tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.src === fxSource)));
    const q = el('input', 'pick-q');
    q.type = 'search';
    q.setAttribute('enterkeyhint', 'search');
    q.setAttribute('autocomplete', 'off');
    const head = el('div', 'pick-head');
    head.append(tabs, q);
    body.append(head);

    const ul = el('div', 'pick-list');
    const chosen = new Map();
    const addBtn = el('button', 'btn primary', 'Add');
    addBtn.type = 'button';
    addBtn.disabled = true;
    const paintAdd = () => { addBtn.disabled = !chosen.size; addBtn.textContent = chosen.size ? `Add ${plural(chosen.size, 'sound')}` : 'Add'; };
    addBtn.onclick = async () => {
      const picked = [...chosen.values()];
      stopPick();
      $('#sheet').close();
      let n = 0;
      try {
        const rows = [];
        for (const r of picked) {
          if (r.rx) {
            busy('Adding sounds from the Recueil', `${r.name} (${n + 1} of ${picked.length})`, n / picked.length);
            const blob = await recueilBlob(r.rx);
            rows.push({ name: r.name, getBlob: async () => blob, size: blob.size, duration: r.rx.duration || 0, ext: extOf(r.rx.path) });
          } else rows.push(r);
          n += 1;
        }
        await onAdd(rows);
        if (rows.length) toast(`${plural(rows.length, 'sound')} added.`);
      } catch (e) { toast(e.message || String(e), 4000); }
      idle();
    };
    const ROWNAME = { music: 'Music', ambience: 'Ambiance', events: 'Event', soundbox: 'Soundbox' };
    const ROWCOLOR = { music: 'var(--music)', ambience: 'var(--amb)', events: 'var(--evt)', soundbox: 'var(--accent)' };
    const near = { soundbox: 'events', events: 'soundbox', music: 'ambience', ambience: 'music' }[kind];
    const rank = (k) => (k === kind ? 0 : k === near ? 1 : 2);
    const row = (r) => {
      const lab = el('label', 'pick-row');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = chosen.has(r.key);
      cb.onchange = () => { if (cb.checked) chosen.set(r.key, r); else chosen.delete(r.key); paintAdd(); };
      const t = el('span', 'pt');
      const line = el('small', '');
      if (r.kind) { const tag = el('span', 'pick-tag', ROWNAME[r.kind] || r.kind); tag.style.setProperty('--z', ROWCOLOR[r.kind] || 'var(--accent)'); line.append(tag); }
      line.append(document.createTextNode(r.sub));
      t.append(el('b', '', r.name), line);
      const pb = el('button', 'pick-play');
      pb.type = 'button';
      const pk = `pick:${r.key}`;
      pb.innerHTML = fxPreviews.has(pk) ? ICON.pause : ICON.play;
      pb.setAttribute('aria-label', `Listen to ${r.name}`);
      pb.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!fxPreviews.has(pk)) stopPick(); // one at a time in the picker
        toggleFx(pk, r.rx ? () => recueilBlob(r.rx) : r.getBlob, () => 0.75, null, pb);
      };
      lab.append(cb, el('i'), t);
      if (window.TroubadourCredit) {
        const info = el('button', 'pick-info');
        info.type = 'button';
        info.innerHTML = window.TroubadourCredit.INFO;
        info.setAttribute('aria-label', `Source of ${r.name}`);
        info.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (r.rx) window.TroubadourCredit.show(r.rx); else window.TroubadourCredit.show({ name: r.name, hint: 'Give it a source in the Story builder, on a computer: the Recueil only takes sounds that name theirs.' }); };
        lab.append(info);
      }
      lab.append(pb);
      return lab;
    };
    const draw = () => {
      ul.textContent = '';
      const term = fold(q.value.trim());
      if (fxSource === 'device') {
        q.placeholder = `Search ${plural(local.length, 'sound')} on this ${DEV}`;
        const hits = local.filter((r) => !term || r.fold.includes(term));
        if (!hits.length) ul.append(el('p', 'muted small pick-empty', local.length ? 'No sound matches.' : `No other sound on this ${DEV} yet. Try the Recueil.`));
        hits.slice().sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name)).slice(0, 300).forEach((r) => ul.append(row(r)));
        return;
      }
      q.placeholder = 'Search a sound, a tale or a troubadour';
      if (!recueil) {
        ul.append(el('p', 'muted small pick-empty', 'Fetching the sounds of the Recueil…'));
        loadRecueil().then(() => { if (fxSource === 'recueil' && $('#sheet').open) draw(); })
          .catch(() => { ul.textContent = ''; ul.append(el('p', 'muted small pick-empty', 'The Recueil could not be reached. Check your connection.')); });
        return;
      }
      const hits = recueil.filter((x) => !term || x.key.includes(term)).sort((a, b) => rank(a.row) - rank(b.row) || a.name.localeCompare(b.name));
      if (!hits.length) ul.append(el('p', 'muted small pick-empty', 'No sound of the Recueil matches.'));
      hits.slice(0, 300).forEach((x) => ul.append(row({ key: `r:${x.id}`, name: x.name, kind: x.row, sub: [x.tale, x.duration ? clockOf(x.duration) : null].filter(Boolean).join(', '), rx: x })));
    };
    q.oninput = draw;
    if (!local.length) fxSource = 'recueil';
    paintTabs();
    draw();
    const bar = el('div', 'pick-bar');
    bar.append(addBtn);
    body.append(ul, bar);
    $('#sheet').addEventListener('close', stopPick, { once: true });
    $('#sheet').showModal();
  }

  /* ================= The soundbox (at the table), as Troubadour's drawer: the world's effects, then the shared ones ================= */
  let sbGain = null;
  let pads = []; // { s, own, id, key, getBlob, buffer, state }
  const sbSources = new Set();
  function openSoundbox() {
    closeMusic();
    $('#mw-sbx').hidden = false;
    $('#world').classList.add('over');
    $('#mw-sb').setAttribute('aria-pressed', 'true');
    loadPads();
  }
  function closeSoundbox() {
    $('#mw-sbx').hidden = true;
    if ($('#mw-mus').hidden) $('#world').classList.remove('over');
    $('#mw-sb').setAttribute('aria-pressed', 'false');
  }
  async function loadPads() {
    const r = rec;
    pads = [
      ...(rec.world.soundbox || []).map((c) => ({ s: c, own: true, id: `${rec.uid}:${c.file}`, key: `w:${c.file}`, getBlob: () => DB.getBlob(rec.files[c.file]) })),
      ...SHARED.map((c) => ({ s: c, own: false, id: c.id, key: `shared:${c.blob}`, getBlob: () => DB.getBlob(c.blob) })),
    ].map((p) => Object.assign(p, { buffer: buffers.get(p.key) || null, state: buffers.get(p.key) ? 'ready' : 'loading' }));
    renderPads();
    for (const p of pads) {
      if (p.buffer) continue;
      try {
        const blob = await p.getBlob();
        if (!blob) throw new Error('missing');
        p.buffer = await decode(blob);
        buffers.set(p.key, p.buffer);
        p.state = 'ready';
      } catch (e) { p.state = 'error'; }
      if (rec !== r) return;
      renderPads();
    }
  }
  const pins = () => (Array.isArray(settings.pins) ? settings.pins : (settings.pins = []));
  function orderedPads() {
    const pinned = pins().map((u) => pads.find((p) => p.id === u)).filter(Boolean);
    return pinned.concat(pads.filter((p) => !pins().includes(p.id)));
  }
  function renderPads() {
    const box = $('#mw-pads');
    if ($('#mw-sbx').hidden) return;
    box.textContent = '';
    if (!pads.length) { box.append(el('div', 'sb-empty', 'No effects yet. Add some to this world in the editor, or to your shared soundbox.')); return; }
    let lastGroup = null;
    orderedPads().forEach((p) => {
      const pinned = pins().includes(p.id);
      const group = pinned ? 'Pinned' : p.own ? 'This world' : 'Shared';
      if (group !== lastGroup) { box.append(el('h4', 'pad-g', group)); lastGroup = group; }
      const b = el('button', `pad${pinned ? ' pinned' : ''}${p.own ? '' : ' shared'}`);
      b.type = 'button';
      b.disabled = p.state !== 'ready';
      b.append(el('span', '', p.state === 'error' ? `${p.s.name} (unavailable)` : p.s.name));
      const pin = el('span', 'pin');
      pin.innerHTML = pinned ? ICON.starFill : ICON.star;
      pin.setAttribute('role', 'button'); pin.setAttribute('aria-label', `Pin ${p.s.name}`); pin.tabIndex = 0;
      pin.addEventListener('click', (e) => { e.stopPropagation(); togglePin(p.id); });
      b.append(pin);
      b.addEventListener('click', () => firePad(p, b));
      box.append(b);
    });
  }
  function togglePin(id) {
    const list = pins();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    saveSettings(); renderPads();
  }
  /** A pad fires its effect once, at once (a tap again fires it again). */
  function firePad(p, b) {
    if (!p.buffer) return;
    const { ctx, master } = audio(true);
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (!sbGain) { sbGain = ctx.createGain(); sbGain.gain.value = A.curve(settings.sbVolume); sbGain.connect(master); }
    const src = ctx.createBufferSource();
    src.buffer = p.buffer;
    const g = ctx.createGain();
    g.gain.value = A.curve(typeof p.s.volume === 'number' ? Math.min(1, p.s.volume / 0.75) : 1);
    src.connect(g).connect(sbGain);
    src.start();
    sbSources.add(src);
    src.onended = () => sbSources.delete(src);
    if (b) { b.classList.remove('fire'); void b.offsetWidth; b.classList.add('fire'); b.addEventListener('animationend', () => b.classList.remove('fire'), { once: true }); }
  }
  function stopPads() {
    sbSources.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } });
    sbSources.clear();
  }
  function paintMaster() {
    const b = $('#mw-pause');
    const resume = A.resumePending();
    if (b.dataset.i === (resume ? 'play' : 'pause')) return;
    b.dataset.i = resume ? 'play' : 'pause';
    b.innerHTML = resume ? ICON.play : ICON.pause;
    b.classList.toggle('on', resume);
    b.setAttribute('aria-label', resume ? 'Resume all' : 'Pause all');
  }

  /* ================= The drawing tools: moved by their grip, always inside the map ================= */
  const TOOLS_KEY = 'troubadour.map.tools';
  function placeTools(x, y) {
    const tools = $('#mw-tools'), stage = $('#mw-stage');
    const sw = stage.clientWidth, sh = stage.clientHeight, tw = tools.offsetWidth, th = tools.offsetHeight;
    if (!sw || !tw) return;
    const nx = Math.max(6, Math.min(sw - tw - 6, x)), ny = Math.max(6, Math.min(sh - th - 6, y));
    tools.style.left = `${nx}px`; tools.style.top = `${ny}px`;
    return [nx, ny];
  }
  function wireToolsGrip() {
    const grip = $('#mw-grip'), tools = $('#mw-tools');
    grip.innerHTML = svg('<circle cx="9" cy="5" r="1.4"/><circle cx="15" cy="5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="15" cy="19" r="1.4"/>', 18, true);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(TOOLS_KEY) || 'null'); } catch (e) { saved = null; }
    const restore = () => { if (saved) placeTools(saved[0], saved[1]); else placeTools(tools.offsetLeft, tools.offsetTop); };
    new ResizeObserver(restore).observe($('#mw-stage'));
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const id = e.pointerId, x0 = e.clientX - tools.offsetLeft, y0 = e.clientY - tools.offsetTop;
      grip.setPointerCapture(id);
      tools.classList.add('moving');
      const move = (ev) => { if (ev.pointerId === id) saved = placeTools(ev.clientX - x0, ev.clientY - y0) || saved; };
      const up = (ev) => {
        if (ev.pointerId !== id) return;
        tools.classList.remove('moving');
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        try { localStorage.setItem(TOOLS_KEY, JSON.stringify(saved)); } catch (err) { /* private mode */ }
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }

  /* ================= Wiring ================= */
  function wire() {
    document.querySelectorAll('[data-action="settings"]').forEach((b) => { b.innerHTML = ICON.gear; b.addEventListener('click', openSettings); });
    document.querySelectorAll('.set-head .ico, [data-action="close-sheet"]').forEach((b) => { b.innerHTML = ICON.close; });
    $('[data-action="close-sheet"]').addEventListener('click', () => $('#sheet').close());
    document.querySelectorAll('.i-import').forEach((s) => { s.outerHTML = ICON.import; });
    $('[data-action="add-world"]').innerHTML = ICON.plus;
    $('[data-action="add-world"]').addEventListener('click', openAddWorld);
    $('#pick-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importFile(f); });
    $('#library').addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    $('#library').addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); importFile(f); } });

    // The iPhone and iPad hint, until it is dismissed.
    const root = document.documentElement;
    let hinted = false;
    try { hinted = localStorage.getItem('troubadour.map.ioshint') === '1'; } catch (e) { /* private mode */ }
    if (root.classList.contains('ios') && !root.classList.contains('standalone') && !hinted) $('#ios-hint').hidden = false;
    $('#ios-hint-close').addEventListener('click', () => { $('#ios-hint').hidden = true; try { localStorage.setItem('troubadour.map.ioshint', '1'); } catch (e) { /* private mode */ } });

    // World screen.
    $('#mw-back').innerHTML = ICON.back;
    $('#mw-back').addEventListener('click', () => leaveWorld());
    $('#mw-more').innerHTML = ICON.share;
    $('#mw-switch').innerHTML = ICON.go;
    $('#mw-sb .star').innerHTML = ICON.star;
    $('#mw-sb').addEventListener('click', () => { if (mode === 'edit') { showEdView('soundbox'); return; } if ($('#mw-sbx').hidden) openSoundbox(); else closeSoundbox(); });
    $('#mw-mus-btn .ic').innerHTML = ICON.music;
    $('#mw-mus-btn').addEventListener('click', () => { if (mode === 'edit') { showEdView('music'); return; } if ($('#mw-mus').hidden) openMusic(); else closeMusic(); });
    $('#mw-mus-close').innerHTML = ICON.close;
    $('#mw-mus-queue').addEventListener('click', () => { musQueueView = !musQueueView; renderMusic(); });
    $('#mw-mus-close').addEventListener('click', closeMusic);
    $('#mw-mus-q').addEventListener('input', (e) => { musQ = e.target.value; renderMusic(); });
    // The shared soundbox, from the worlds screen (as in Troubadour).
    document.querySelectorAll('[data-action="shared"]').forEach((b) => { b.innerHTML = ICON.star; b.addEventListener('click', () => { location.hash = location.hash === '#/soundbox' ? '#/' : '#/soundbox'; }); });
    $('[data-action="add-shared"]').innerHTML = `${ICON.plus}<span class="long">Add effects</span>`;
    $('[data-action="add-shared"]').addEventListener('click', addShared);
    $('#mw-sbx-close').innerHTML = ICON.close;
    $('#mw-sbx-close').addEventListener('click', closeSoundbox);
    $('#mw-sbvol').value = settings.sbVolume;
    paintRange($('#mw-sbvol'));
    $('#mw-sbvol').addEventListener('input', (e) => { settings.sbVolume = Number(e.target.value); if (sbGain) sbGain.gain.setTargetAtTime(A.curve(settings.sbVolume), audio().ctx.currentTime, 0.03); });
    $('#mw-sbvol').addEventListener('change', saveSettings);
    wireToolsGrip();
    $('#mw-more').addEventListener('click', () => rec && worldMenu(rec, mode === 'play'));
    $('#mw-panel').innerHTML = svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>', 19);
    $('#mw-panel').addEventListener('click', () => $('#world').classList.toggle('panel'));
    $('#mw-side-close').innerHTML = ICON.close;
    $('#mw-side-close').addEventListener('click', () => { setPanel(false); if (mode === 'edit' && edView) { edView = null; renderPanel(); } });
    // The sound menu of the whole map, left of the Soundbox: opens it, or closes it when it already shows the whole map.
    $('#mw-menu .ic').innerHTML = ICON.sound;
    $('#mw-menu').addEventListener('click', () => {
      const open = $('#world').classList.contains('panel');
      // In the editor: the panel of the map, or of the element selected.
      if (mode === 'edit') { if (open && !edView) setPanel(false); else { edView = null; setPanel(true); renderPanel(); } return; }
      if (open && !tapped) { setPanel(false); return; }
      tapped = null;
      setPanel(true);
      renderPanel();
    });
    $('#mw-switch').addEventListener('click', () => { location.hash = `#/play/${rec.uid}/${pi}`; });
    document.querySelectorAll('#mw-tools [data-tool]').forEach((b) => { b.innerHTML = TOOL_ICON[b.dataset.tool]; });
    $('#mw-tools [data-act="undo"]').innerHTML = ICON.undo;
    $('#mw-tools').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool === 'stamp') {
        // The library opens with nothing picked: a place is armed only once chosen in it.
        const box = $('#mw-stamps');
        if (!box.hidden) { box.hidden = true; paintTools(V.tool()); return; }
        paintStamps(null);
        box.hidden = false;
        box.scrollTop = 0;
        b.setAttribute('aria-pressed', 'true');
        return;
      }
      $('#mw-stamps').hidden = true;
      if (b.dataset.tool) V.setTool(b.dataset.tool);
      else if (b.dataset.act === 'undo') { if (!V.undo()) toast('Nothing to undo.', 1400); }
      else if (b.dataset.act === 'fit') V.fit();
    });
    $('#mw-fill').innerHTML = ICON.fit;
    $('#mw-fill').addEventListener('click', () => V.fit());

    $('#mw-fade').innerHTML = ICON.stopMusic;
    // The master buttons, as in Troubadour: pause (or resume) everything and stop everything, over 3 s.
    $('#mw-fade').addEventListener('click', () => { A.stopMusic(); refreshLive(); paintMaster(); });
    $('#mw-pause').innerHTML = ICON.pause;
    $('#mw-pause').addEventListener('click', () => { A.pauseAll(); refreshLive(); paintMaster(); });
    $('#mw-master').value = settings.master;
    paintRange($('#mw-master'));
    $('#mw-master-val').textContent = String(Math.round(settings.master * 100));
    $('#mw-master').addEventListener('input', (e) => {
      settings.master = Number(e.target.value);
      $('#mw-master-val').textContent = String(Math.round(settings.master * 100));
      const { ctx, master } = audio();
      master.gain.setTargetAtTime(A.curve(settings.master), ctx.currentTime, 0.03);
    });
    $('#mw-master').addEventListener('change', saveSettings);

    // The map.
    V.mount($('#mw-canvas'));
    $('#mw-canvas').addEventListener('pointerdown', () => $('#mw-play-tip').classList.add('gone'));
    V.onTool = (t) => { paintTools(t); if (t !== 'stamp') $('#mw-stamps').hidden = true; };
    // An element deleted (its button, the Delete key, the eraser): its panel closes, never falling back on the map's
    // panel (where the map itself can be deleted).
    let shownEl = null;
    V.onSelect = (e) => {
      if (mode !== 'edit') return;
      const gone = !e && shownEl && !place().elements.includes(shownEl);
      shownEl = e || null;
      if (e) edView = null;
      if (gone) setPanel(false);
      renderPanel();
    };
    // A new element: a name of its own, and its panel opens to name it and give it sounds.
    V.onCreate = (e) => {
      if (mode !== 'edit') return;
      if (!e.title) {
        const sh = e.shape;
        const kind = sh.type === 'stamp' ? stampLabel(sh.stamp) || 'Drawing' : sh.closed ? 'Area' : 'Line';
        const same = place().elements.filter((x) => x !== e && x.title && x.title.startsWith(kind)).length;
        e.title = same ? `${kind} ${same + 1}` : kind;
        save(); V.redraw();
      }
      // A place laid: back to the select tool, to move it or open it. The panel stays as it was: open, it shows the new place.
      if (e.shape.type === 'stamp') V.setTool('select');
      edView = null;
      renderPanel();
    };
    // The tools stand beside the map, never over it: the whole map fits next to them.
    V.insets = () => {
      const t = $('#mw-tools'), cv = $('#mw-canvas');
      if (mode !== 'edit' || !t.offsetWidth) return {};
      const a = t.getBoundingClientRect(), c = cv.getBoundingClientRect();
      const wide = a.width > a.height;
      if (wide) return a.top - c.top < c.height / 2 ? { top: a.bottom - c.top + 8 } : { bottom: c.bottom - a.top + 8 };
      return a.left - c.left < c.width / 2 ? { left: a.right - c.left + 8 } : { right: c.right - a.left + 8 };
    };
    // A double tap on an element opens its panel (over the map on a narrow screen), and its name to type.
    V.onOpen = () => {
      if (mode !== 'edit') return;
      renderPanel();
      $('#world').classList.add('panel');
      const t = $('#mw-inspector input[type="text"]');
      if (t && pc()) t.focus();
    };
    V.onEdit = () => { save(); if (mode === 'edit') { renderPlaces(); } if (A.isOpen()) { A.sync(); } };
    V.onPlayer = (p) => { if (A.isOpen()) A.hear(p); };
    // At the table, a double tap opens the sound menu: of the element tapped, or of the whole map.
    V.onTap = (e) => {
      tapped = e || null;
      renderPanel();
      setPanel(true);
    };
    // A long press on the way of an element: off to the map it leads to.
    V.onLink = (e) => {
      const to = rec.world.places.findIndex((q) => q.id === e.link);
      if (to < 0 || to === pi) return;
      toast(`To ${rec.world.places[to].title}`, 1600);
      travel(to);
    };
    A.onChange = () => { V.redraw(); };

    // Browsers keep sound off until a touch or a click: every gesture wakes the audio, unless paused by hand.
    // iPhone also wants a sound started inside that gesture: a silent one, once.
    const unlock = () => {
      const { ctx } = audio();
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      if (!unlock.done) {
        unlock.done = true;
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      }
    };
    ['pointerdown', 'touchend', 'keydown'].forEach((t) => document.addEventListener(t, unlock, { capture: true, passive: true }));
    buildStamps();
    paintStamps('lake');
    V.setTool('select');

    // Keys, while drawing.
    document.addEventListener('keydown', (e) => {
      if (screen !== 'world' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (mode === 'edit') V.undo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (mode === 'edit') {
        const map = { v: 'select', h: 'hand', w: 'wall', e: 'eraser' };
        const k = e.key.toLowerCase();
        if (map[k]) { V.setTool(map[k]); return; }
        if (k === 'l') { paintStamps(null); $('#mw-stamps').hidden = false; return; }
        if ((e.key === 'Delete' || e.key === 'Backspace') && V.selected()) { e.preventDefault(); V.deleteSelected(); return; }
        if (e.key === 'Escape') { $('#mw-stamps').hidden = true; V.select(null); return; }
      }
      if (e.key.toLowerCase() === 'f') V.fit();
      if (mode === 'play' && e.code === 'Space') { e.preventDefault(); $('#mw-pause').click(); }
    });

    window.addEventListener('hashchange', route);
    window.addEventListener('pagehide', flush);
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (settings.mode === 'system') applyTheme(); });
    // A new theme or appearance: the map pictures of the library are drawn again in its colours.
    new MutationObserver(() => { if (screen === 'library') requestAnimationFrame(() => renderLibrary()); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });
  }

  /* ================= No page zoom ================= */
  // Safari ignores user-scalable=no: its pinch (gesture events) and a quick second tap would still zoom
  // the page. Only the map zooms, with its own two-finger gesture.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !(e.target.closest && e.target.closest('#mw-canvas'))) e.preventDefault(); }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const t = Date.now();
    // A second tap within 300 ms: its default (zoom) is cancelled; the map handles its own double taps.
    // Buttons keep their quick taps (touch-action: manipulation already stops the zoom on them).
    if (t - lastTouchEnd < 300 && !(e.target.closest && e.target.closest('button, a, input, textarea, select, label, [role="button"]'))) e.preventDefault();
    lastTouchEnd = t;
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  /* ================= Smooth volume sliders (as in Troubadour) ================= */
  // Safari's range inputs only move when the small thumb is hit exactly: here the whole bar is the handle.
  function rangeValue(input, clientX) {
    const r = input.getBoundingClientRect();
    const pad = 8;
    const f = Math.min(1, Math.max(0, (clientX - r.left - pad) / Math.max(1, r.width - 2 * pad)));
    const min = +input.min || 0, max = input.max === '' ? 100 : +input.max, step = +input.step || 1;
    return Math.round((min + f * (max - min)) / step) * step;
  }
  document.addEventListener('pointerdown', (e) => {
    const input = e.target.closest && e.target.closest('input[type="range"]');
    if (!input || input.disabled || e.button > 0) return;
    e.preventDefault();
    const id = e.pointerId;
    try { input.setPointerCapture(id); } catch (err) { /* older iOS */ }
    const set = (x) => {
      const v = rangeValue(input, x);
      if (+input.value === v) return;
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(e.clientX);
    let frame = 0, lastX = e.clientX;
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      ev.preventDefault();
      lastX = ev.clientX;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; set(lastX); });
    };
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      if (frame) { cancelAnimationFrame(frame); frame = 0; set(lastX); }
      input.removeEventListener('pointermove', move);
      input.removeEventListener('pointerup', up);
      input.removeEventListener('pointercancel', up);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    input.addEventListener('pointermove', move);
    input.addEventListener('pointerup', up);
    input.addEventListener('pointercancel', up);
  }, { passive: false });

  async function boot() {
    applyTheme();
    applyAudioSession();
    wire();
    buildSettings();
    liveLoop();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    try { await DB.open(); DB.persistence().catch(() => {}); SHARED = (await DB.getKV('soundbox', [])) || []; } catch (e) {
      document.body.append(el('p', 'fatal', `Troubadour Map cannot reach its storage here (${e.message || e}).`));
      return;
    }
    await route();
  }
  boot();
})();
