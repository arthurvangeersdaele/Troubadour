/* Troubadour Map: library, import and export, the panel beside the map, settings and routing.
 *   #/                  the worlds kept on this device
 *   #/play/<uid>/<n>    a world at the table, on its place n
 *   #/edit/<uid>/<n>    the editor of a world (drawing, sounds, places)
 */
(function () {
  'use strict';

  const VERSION = '261101.2';
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
  function mapCover(r, big) {
    const cv = el('canvas', 'cover');
    cv.setAttribute('aria-hidden', 'true');
    requestAnimationFrame(() => V.thumb(cv, r.world.places[0], big));
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
    c.style.setProperty('--c', 'var(--accent)');
    c.append(mapCover(r, true));
    const inner = el('div', 'hero-in');
    const kick = el('div', 'hero-kick');
    kick.append(el('span', 'tag', r.world.revision ? `Revision ${r.world.revision}` : 'World'), el('span', 'kick', 'Last opened'));
    inner.append(kick, el('h2', '', r.story.title || 'World'));
    inner.append(el('p', 'hero-sub clamp', r.world.places.map((p) => p.title).join(', ')));
    inner.append(el('p', 'hero-meta', `${plural(r.world.places.length, 'place')}, ${plural(cardCount(r), 'sound card')}, by ${r.world.bard || r.story.bard || 'Forgotten Troubadour'}`));
    inner.append(el('span', 'grow'));
    const acts = el('div', 'hero-acts');
    acts.append(
      btnEl('hb primary', `${ICON.play}<span>Play</span>`, null, () => playAt(r)),
      btnEl('hb', `${ICON.edit}<span>Edit</span>`, null, () => editAt(r)),
      btnEl('hb more', ICON.more, `More: ${r.story.title}`, () => worldMenu(r)),
    );
    inner.append(acts);
    c.append(inner);
    return c;
  }

  function worldRow(r) {
    const row = el('div', 'srow');
    row.style.setProperty('--c', 'var(--line)');
    const txt = el('div', 'stxt');
    txt.append(el('b', '', r.story.title || 'World'), el('span', 'meta', `${plural(r.world.places.length, 'place')}, ${plural(cardCount(r), 'sound card')}`));
    row.append(mapCover(r), txt,
      btnEl('more', ICON.more, `More: ${r.story.title}`, () => worldMenu(r)),
      btnEl('go', ICON.play, `Play ${r.story.title}`, () => playAt(r)));
    return row;
  }

  async function renderLibrary() {
    const grid = $('#world-list');
    const recs = await DB.list();
    grid.textContent = '';
    if (!recs.length) {
      const hello = el('div', 'hello');
      hello.innerHTML = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';
      hello.append(el('h1', '', 'Your world awaits'), el('p', 'lead', 'Draw the places of your world, lay your sounds on the map, and hear what the party hears as it walks. Start a blank world, or import a .troubadour story.'));
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

  async function newWorld() {
    const a = await ask('New world', 'Give your world a name. You add its sounds while you draw it.', [
      { label: 'Cancel', value: null }, { label: 'Create', value: 'ok', cls: 'primary' },
    ], { placeholder: 'The Drowned Abbey', max: 120 });
    if (!a || !a.value) return;
    const bard = window.Troubadour.bardName();
    const story = M.blankStory(a.text || 'New world', bard);
    const r = await DB.put({ uid: DB.uid(), story, world: M.blankWorld(story, bard), files: {} });
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
      ...(fromTable ? [] : [[ICON.edit, 'Edit the world', 'Draw its places, lay its sounds', () => editAt(r)]]),
      [ICON.share, 'Export .troubadour-map', 'Forges the next revision, signed with your troubadour name', () => exportWorld(r)],
      [ICON.share, 'Export .troubadour', 'The story alone, for Troubadour and Ballade', () => exportTroubadour(r)],
      [ICON.trash, 'Remove from this device', 'Keep a .troubadour-map if you want it back', async () => {
        const ok = await ask(`Remove ${r.story.title}?`, 'Its places, its drawings and its sounds leave this device.', [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, cls: 'danger' }]);
        if (!ok) return;
        await DB.remove(r.uid);
        if (rec && rec.uid === r.uid) location.hash = '#/'; else renderLibrary();
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
  async function exportTroubadour(r) {
    try {
      busy('Writing the .troubadour', '', 0);
      const files = await DB.filesOf(r);
      const out = await M.packTroubadour(r.story, files, (f) => busy('Writing the .troubadour', '', f));
      idle();
      await deliver(out.blob, out.fileName);
    } catch (e) { idle(); toast(`Could not write the .troubadour: ${e.message || e}`, 4200); }
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
      if (!world) { toast('Your world is ready: one place per chapter. Its sounds wait in Add sounds: draw the map, then lay them on it.', 5200); location.hash = `#/edit/${r.uid}/0`; }
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
  async function listen(file, btn) {
    if (preview) { const was = preview; preview = null; try { was.src.stop(); } catch (e) { /* done */ } if (was.btn) was.btn.innerHTML = ICON.play; if (was.file === file) return; }
    await ensure([file], false);
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
    }
    mode = m;
    goPlace(Math.max(0, Math.min(rec.world.places.length - 1, n || 0)), true);
  }

  async function goPlace(n, first) {
    stopPreview();
    pi = n;
    tapped = null;
    $('#mw-title').textContent = rec.story.title || 'World';
    $('#mw-sub').textContent = place().title;
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
    const sw = $('#mw-switch');
    sw.hidden = m === 'play';
    sw.innerHTML = `${ICON.play}<span>Play</span>`;
    sw.title = 'Play this place at the table';
    // At the table, the map on the left and the sounds of the whole place open beside it.
    $('#world').classList.toggle('panel', m === 'play');
    $('#mw-panel').setAttribute('aria-label', m === 'play' ? 'Show or hide the sounds' : 'Show the panel');
    const was = V.mode();
    V.setMode(m);
    if (was !== m) { V.fit(m === 'play' ? 'fill' : 'fit'); renderPlaces(); }
    $('#mw-stamps').hidden = true;
    if (m === 'play') {
      await ensure(placeFiles(place()));
      A.open(place(), rec.world, buffers);
      acquireWake();
      $('#mw-play-tip').classList.remove('gone');
      clearTimeout(setMode.tip);
      setMode.tip = setTimeout(() => $('#mw-play-tip').classList.add('gone'), 6000);
    } else {
      if (!keepAudio || A.isOpen()) A.close();
      releaseWake();
    }
    renderPanel();
  }

  function renderPlaces() {
    const rail = $('#mw-places');
    rail.textContent = '';
    rail.append(el('h3', '', 'Places'));
    const links = new Set(place().elements.map((e) => e.link).filter(Boolean));
    rec.world.places.forEach((p, i) => {
      const b = el('button', `place${links.has(p.id) ? ' linked' : ''}`);
      b.type = 'button';
      if (i === pi) b.setAttribute('aria-current', 'true');
      b.append(el('span', '', p.title));
      const count = p.general.length + p.elements.reduce((a, e) => a + e.cards.length, 0);
      if (count) b.append(el('small', '', String(count)));
      if (links.has(p.id)) b.title = 'An element of this place leads there';
      b.addEventListener('click', () => { if (i !== pi) goPlace(i); });
      rail.append(b);
    });
    const add = el('button', 'place add');
    add.type = 'button';
    add.innerHTML = `${ICON.plus}<span>New place</span>`;
    add.addEventListener('click', () => addPlace());
    rail.append(add);
    const pick = $('#mw-place-pick');
    pick.textContent = '';
    rec.world.places.forEach((p, i) => { const o = el('option', '', p.title); o.value = String(i); pick.append(o); });
    if (mode === 'edit') { const o = el('option', '', '+ New place'); o.value = 'new'; pick.append(o); }
    pick.value = String(pi);
  }

  function addPlace(title) {
    const p = M.newPlace(title || `Place ${rec.world.places.length + 1}`);
    rec.world.places.push(p);
    save();
    goPlace(rec.world.places.length - 1);
    return p;
  }

  /* ================= The panel ================= */
  const liveRows = [];

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

  /** A sound card in the panel. In Draw: how it plays. At the table: play, pause and its volume. */
  /** The loop button, as in Troubadour: 1×, 2×, ∞, and random (not for music). */
  const LOOPS = ['once', 'twice', 'loop', 'random'];
  const LOOP_LABEL = { once: '1×', twice: '2×', loop: '∞' };
  const LOOP_TITLE = { once: 'Plays once', twice: 'Plays twice', loop: 'Plays again and again', random: 'Random: plays again after a random pause' };
  function paintLoop(btn, c) {
    btn.className = `loop${c.play === 'loop' ? ' inf' : c.play === 'random' ? ' rnd' : ''}`;
    if (c.play === 'random') btn.innerHTML = ICON.random; else btn.textContent = LOOP_LABEL[c.play];
    btn.title = `${LOOP_TITLE[c.play]} (tap to change)`;
    btn.setAttribute('aria-label', `Loop of ${c.name}: ${LOOP_TITLE[c.play]}`);
  }
  const clockOf = (sec) => { sec = Math.max(0, Math.round(sec || 0)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };

  /** A sound card. In the editor: how it plays, a preview, its volume. At the table: a full card, as in Troubadour
   *  (loop button, progress, play and pause, stop, volume as set in Settings), plus how much of it reaches the party. */
  function cardRow(c, list, owner) {
    const row = el('div', `mcard ${c.zone}`);
    const h = el('div', 'mcard-h');
    h.append(el('b', '', c.name), el('span', 'pill', ZONE_LABEL[c.zone] || c.zone));
    const loop = el('button');
    loop.type = 'button';
    paintLoop(loop, c);
    loop.addEventListener('click', () => {
      const ways = c.zone === 'music' ? LOOPS.slice(0, 3) : LOOPS;
      const next = ways[(ways.indexOf(c.play) + 1) % ways.length];
      Object.assign(c, M.cleanCard(Object.assign({}, c, { play: next })));
      save();
      if (A.isOpen()) A.sync();
      if (mode === 'edit') renderPanel(); else { paintLoop(loop, c); paintGaps(); }
    });
    h.append(loop);
    if (mode === 'edit') {
      const x = el('button', 'x');
      x.type = 'button';
      x.innerHTML = ICON.x;
      x.title = 'Remove this card';
      x.addEventListener('click', () => { list.splice(list.indexOf(c), 1); save(); syncAudio(); renderPanel(); V.redraw(); renderPlaces(); });
      h.append(x);
    }
    row.append(h);

    // Options: when a card of the whole place starts, and the pauses of a random card.
    const opts = el('div', 'opts');
    const paintGaps = () => {
      opts.textContent = '';
      if (mode === 'edit' && !owner) {
        const l = el('label');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = c.autoplay;
        cb.addEventListener('change', () => { c.autoplay = cb.checked; save(); });
        l.append(cb, document.createTextNode('Starts with the place'));
        opts.append(l);
      }
      if (mode === 'edit' && c.play === 'random') {
        const gap = (key, label) => {
          const l = el('label');
          const i = el('input'); i.type = 'number'; i.min = 0; i.max = 600; i.step = 1; i.value = c[key];
          i.addEventListener('change', () => { Object.assign(c, M.cleanCard(Object.assign({}, c, { [key]: Number(i.value) }))); save(); paintGaps(); });
          l.append(document.createTextNode(label), i);
          return l;
        };
        opts.append(gap('gapMin', 'Pause from'), gap('gapMax', 'to'), document.createTextNode('s'));
      }
      opts.hidden = !opts.childNodes.length;
    };
    paintGaps();
    row.append(opts);

    // At the table: the progress of the sound.
    let fill = null, rem = null;
    if (mode === 'play') {
      const track = el('div', 'track');
      fill = el('div', 'fill');
      track.append(fill);
      row.append(track);
    }

    const r = el('div', 'mcard-r');
    const pb = el('button', 'pb');
    pb.type = 'button';
    pb.innerHTML = ICON.play;
    r.append(pb);
    let end = null;
    if (mode === 'edit') {
      pb.title = 'Listen';
      pb.addEventListener('click', () => listen(c.file, pb));
    } else {
      pb.addEventListener('click', () => { A.toggle(c); refreshLive(); });
      end = el('button', 'pb end');
      end.type = 'button';
      end.innerHTML = ICON.stop;
      end.title = 'Stop: fade out, back to the start';
      end.setAttribute('aria-label', `Stop ${c.name}`);
      end.addEventListener('click', () => { A.stop(c); refreshLive(); });
      r.append(end);
    }
    // How the volume shows (Settings, Player interface, as in Troubadour): always a slider in the editor.
    const zoneKey = c.zone === 'soundbox' ? 'events' : c.zone;
    const vm = mode === 'edit' ? 'full' : ((settings.vol && settings.vol[zoneKey]) || 'full');
    row.classList.add(`vm-${vm}`);
    let lvl = null, moveEnd = 0;
    if (vm === 'full') {
      const vol = el('input');
      vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = c.volume;
      vol.setAttribute('aria-label', `Volume of ${c.name}`);
      vol.addEventListener('input', () => A.setVolume(c, Number(vol.value)));
      vol.addEventListener('change', save);
      r.append(vol);
    } else if (vm === 'simple') {
      // Two buttons: 25 % steps, gliding 2 s per step.
      lvl = el('span', 'lvl');
      const paintLvl = () => { lvl.textContent = `${Math.round(c.volume * 100)}`; lvl.classList.toggle('moving', performance.now() < moveEnd); };
      const step = (dir) => {
        const q = c.volume * 4;
        const t = dir > 0 ? Math.min(1, (Math.floor(q + 1e-6) + 1) / 4) : Math.max(0, (Math.ceil(q - 1e-6) - 1) / 4);
        if (t === c.volume) return;
        const secs = Math.max(0.3, (Math.abs(t - c.volume) / 0.25) * 2);
        A.setVolume(c, t, secs);
        moveEnd = performance.now() + secs * 1000;
        paintLvl();
        setTimeout(paintLvl, secs * 1000 + 20);
        save();
      };
      const dn = el('button', 'vb'); dn.type = 'button'; dn.innerHTML = ICON.volDown; dn.setAttribute('aria-label', `Lower ${c.name}`);
      dn.addEventListener('click', () => step(-1));
      const up = el('button', 'vb'); up.type = 'button'; up.innerHTML = ICON.volUp; up.setAttribute('aria-label', `Raise ${c.name}`);
      up.addEventListener('click', () => step(1));
      paintLvl();
      r.append(dn, lvl, up);
    } else {
      rem = el('small', 'rem');
      r.append(rem);
    }
    let bar = null;
    if (mode === 'play' && owner) {
      const meter = el('span', 'heard');
      bar = el('i');
      meter.append(bar);
      meter.title = 'How much of it reaches the party';
      r.append(meter);
    }
    if (mode === 'play') {
      liveRows.push(() => {
        const v = A.voice(c);
        const st = v ? v.state : 'idle';
        const on = st === 'playing';
        row.classList.toggle('on', on);
        row.classList.toggle('paused', st === 'paused');
        const icon = on ? 'pause' : 'play';
        if (pb.dataset.i !== icon) { pb.innerHTML = ICON[icon]; pb.dataset.i = icon; }
        pb.setAttribute('aria-label', `${on ? 'Pause' : 'Play'} ${c.name}`);
        end.disabled = st === 'idle';
        const pr = A.progress(c);
        fill.style.width = `${pr.length ? Math.min(100, (pr.at / pr.length) * 100) : 0}%`;
        if (rem) rem.textContent = v && v.waiting ? 'waiting' : pr.length ? `${clockOf(pr.at)} / ${clockOf(pr.length)}` : '';
        if (bar) bar.style.width = `${Math.round((v ? v.heard : 0) * 100)}%`;
      });
    }
    row.append(r);
    return row;
  }

  function addSoundsButton(list, label) {
    const b = el('button', 'btn slim');
    b.type = 'button';
    b.innerHTML = `${ICON.plus}<span>${label || 'Add sounds'}</span>`;
    b.addEventListener('click', () => pickSounds(list));
    return b;
  }

  function cardsBlock(title, list, owner, empty) {
    const s = section(title, mode === 'edit' ? addSoundsButton(list, 'Add') : null);
    if (!list.length) s.append(el('div', 'pn-empty', empty));
    list.forEach((c) => s.append(cardRow(c, list, owner)));
    return s;
  }

  function renderPanel() {
    liveRows.length = 0;
    const box = $('#mw-inspector');
    box.textContent = '';
    if (!rec) return;
    const p = place();
    const sel = mode === 'edit' ? V.selected() : tapped;
    $('#mw-side-title').textContent = sel ? (sel.title || (sel.shape.type === 'stamp' ? stampLabel(sel.shape.stamp) : sel.shape.closed ? 'Drawn area' : 'Drawn line')) : p.title;
    if (mode === 'edit') { if (sel) editElement(box, sel); else editPlace(box, p); }
    else if (sel) playElement(box, sel); else playPlace(box, p);
    paintRanges(box);
    refreshLive();
  }
  const stampLabel = (id) => (window.MapStamps.LIST.find((s) => s.id === id) || { label: id }).label;

  function editPlace(box, p) {
    const name = section('Place');
    const t = el('input'); t.type = 'text'; t.value = p.title; t.maxLength = 80; t.setAttribute('aria-label', 'Name of the place');
    t.addEventListener('input', () => { p.title = t.value.trim() || 'Place'; $('#mw-sub').textContent = p.title; renderPlaces(); save(); });
    name.append(t);
    const size = el('div', 'seg small');
    [['Small', 1600, 1000], ['Medium', 2000, 1250], ['Large', 3200, 2000], ['Huge', 4800, 3000]].forEach(([label, w, h]) => {
      const b = el('button', '', label);
      b.type = 'button';
      b.setAttribute('aria-checked', String(p.width === w && p.height === h));
      b.addEventListener('click', () => {
        const fx = w / p.width, fy = h / p.height;
        p.width = w; p.height = h;
        p.player = [Math.round(p.player[0] * fx), Math.round(p.player[1] * fy)];
        save(); V.show(p, rec.world); renderPanel();
      });
      size.append(b);
    });
    const sz = el('div', 'row-set');
    sz.append(el('span', '', 'Map size'), size);
    name.append(sz);
    box.append(name);

    box.append(cardsBlock('Whole place', p.general, null, 'Sounds heard everywhere on this map, whatever the distance and the walls: its music, the wind, the rain.'));

    const walls = section('Walls');
    walls.append(slider('Muffle', Math.round(rec.world.wallLoss * 100), 0, 100, 5, (v) => `${v} %`, (v) => { rec.world.wallLoss = v / 100; save(); }));
    walls.append(el('p', '', 'Each wall between a sound and the party takes this share of it away. The same for every place of the world.'));
    box.append(walls);

    const how = section('Drawing');
    how.append(el('p', '', 'Wall: draws walls (Shift for a straight one). Element: draw a shape that ends near its start for an area, or a line for a river or a road. Library: lakes, mountains, forests and more. Double tap an element (with the select tool) to give it sounds, a reach and a way to another place.'));
    box.append(how);

    const acts = section('This place');
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
      id.append(slider('Size', sh.size, 40, 1200, 10, (v) => String(v), (v) => { sh.size = v; V.redraw(); }));
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
    sel.setAttribute('aria-label', 'Place this element leads to');
    const none = el('option', '', 'Nowhere'); none.value = ''; sel.append(none);
    rec.world.places.forEach((q, i) => { if (i === pi) return; const o = el('option', '', q.title); o.value = q.id; sel.append(o); });
    const nw = el('option', '', '+ A new place'); nw.value = '__new'; sel.append(nw);
    sel.value = e.link || '';
    sel.addEventListener('change', () => {
      if (sel.value === '__new') {
        const p = M.newPlace(e.title || `Place ${rec.world.places.length + 1}`);
        rec.world.places.push(p);
        e.link = p.id;
        renderPlaces();
        renderPanel();
      } else e.link = sel.value || null;
      V.redraw(); save(); renderPlaces();
    });
    way.append(sel, el('p', '', 'At the table, tapping this element offers to take the party there: a door, stairs, a road to the next town.'));
    box.append(way);

    const acts = el('div', 'pn-acts');
    const del = el('button', 'btn slim danger');
    del.type = 'button';
    del.innerHTML = `${ICON.trash}<span>Delete this element</span>`;
    del.addEventListener('click', () => { V.deleteSelected(); });
    acts.append(del);
    box.append(acts);
  }

  function playPlace(box, p) {
    box.append(cardsBlock('Whole place', p.general, null, 'No sound for the whole place. Add some in Edit.'));
    const near = section('Around the party');
    const list = el('div', 'pn');
    near.append(list);
    box.append(near);
    const els = p.elements.filter((e) => e.cards.length || e.link);
    if (!els.length) near.append(el('div', 'pn-empty', 'No element has sounds on this map yet. Open Edit, double tap a shape and add sounds to it.'));
    const rows = els.map((e) => {
      const b = el('button', 'mp-menu-item');
      b.type = 'button';
      const t = el('span');
      const name = el('b', '', e.title || e.cards.map((c) => c.name).join(', ') || 'Element');
      const sub = el('small');
      t.append(name, sub);
      b.append(t);
      b.addEventListener('click', () => { tapped = e; renderPanel(); });
      return { b, e, sub };
    });
    liveRows.push(() => {
      const pt = A.point();
      const sorted = rows.map((r) => Object.assign(r, { h: M.hearing(pt, r.e, p.walls, rec.world.wallLoss) }))
        .sort((a, b) => b.h.gain - a.h.gain || a.h.d - b.h.d);
      sorted.forEach((r) => {
        const pct = Math.round(r.h.gain * 100);
        r.sub.textContent = r.h.d === 0 ? 'The party is here' : pct > 0 ? `${pct} % heard${r.h.walls ? `, through ${r.h.walls} wall${r.h.walls > 1 ? 's' : ''}` : ''}` : r.e.link && !r.e.cards.length ? 'A way to another place' : 'Out of reach';
      });
      // Loudest on top.
      sorted.forEach((r, i) => { if (list.children[i] !== r.b) list.insertBefore(r.b, list.children[i] || null); });
    });
  }

  function playElement(box, e) {
    const back = el('button', 'btn slim');
    back.type = 'button';
    back.innerHTML = `${ICON.back}<span>${place().title}</span>`;
    back.addEventListener('click', () => { tapped = null; renderPanel(); });
    box.append(back);
    if (e.link) {
      const to = rec.world.places.findIndex((q) => q.id === e.link);
      if (to >= 0) {
        const go = el('button', 'btn primary go-place');
        go.type = 'button';
        go.innerHTML = `${ICON.link}<span>Go to ${rec.world.places[to].title}</span>`;
        go.addEventListener('click', () => goPlace(to));
        box.append(go);
      }
    }
    if (e.cards.length || !e.link) box.append(cardsBlock('Sounds', e.cards, e, 'No sound on this element.'));
    if (e.cards.length) {
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
  function refreshLive() { liveRows.forEach((f) => f()); }
  function liveLoop() {
    clearInterval(liveTimer);
    liveTimer = setInterval(() => { if (screen === 'world' && mode === 'play') refreshLive(); }, 200);
  }

  function syncAudio() {
    if (mode !== 'play' || !A.isOpen()) return;
    ensure(placeFiles(place())).then(() => A.sync());
  }

  /* ================= The sound picker ================= */
  /** Picks files with a hidden input of its own (several at once when `multiple`). */
  function chooseFiles(accept, multiple) {
    return new Promise((ok) => {
      const i = el('input');
      i.type = 'file';
      if (accept && !document.documentElement.classList.contains('ios')) i.accept = accept;
      i.multiple = !!multiple;
      i.addEventListener('change', () => ok([...i.files]));
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

  function pickSounds(list) {
    stopPreview();
    $('#sheet-title').textContent = 'Add sounds';
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = '';
    const search = el('input', 'pick-search');
    search.type = 'search';
    search.placeholder = 'Search the sounds of the story';
    const box = el('div', 'pick-list');
    const chosen = new Set();
    const go = el('button', 'btn primary');
    go.type = 'button';
    const paintGo = () => { go.disabled = !chosen.size; go.textContent = chosen.size ? `Add ${chosen.size} sound${chosen.size > 1 ? 's' : ''}` : 'Pick sounds'; };
    let sounds = [];
    const paint = () => {
      // The same file once: the first place it appears.
      const seen = new Set();
      sounds = M.soundsOf(rec.story).filter((x) => rec.files[x.file] && (seen.has(x.file) ? false : seen.add(x.file)));
      box.textContent = '';
      const q = search.value.trim().toLowerCase();
      let group = null;
      sounds.forEach((s) => {
        if (q && !s.name.toLowerCase().includes(q)) return;
        const g = s.chapter >= 0 ? (rec.story.chapters[s.chapter].title || `Chapter ${s.chapter + 1}`) : 'Soundbox';
        if (g !== group) { group = g; box.append(el('h4', '', g)); }
        const b = el('div', `pick ${s.zone}`);
        b.setAttribute('role', 'button');
        b.tabIndex = 0;
        b.setAttribute('aria-pressed', String(chosen.has(s.file)));
        const lis = el('button', 'lis');
        lis.type = 'button';
        lis.innerHTML = ICON.play;
        lis.title = 'Listen';
        lis.addEventListener('click', (ev) => { ev.stopPropagation(); listen(s.file, lis); });
        const t = el('b', '', s.name);
        b.append(el('i'), lis, t, el('small', '', ZONE_LABEL[s.zone]));
        const toggle = () => { if (chosen.has(s.file)) chosen.delete(s.file); else chosen.add(s.file); b.setAttribute('aria-pressed', String(chosen.has(s.file))); paintGo(); };
        b.addEventListener('click', toggle);
        b.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
        box.append(b);
      });
      if (!box.childNodes.length) box.append(el('div', 'pn-empty', q ? 'No sound by that name.' : 'No sound in this world yet: bring some from this device, or from a .troubadour story.'));
    };
    search.addEventListener('input', paint);
    go.addEventListener('click', () => {
      [...chosen].forEach((f) => { const x = sounds.find((y) => y.file === f); if (x) list.push(M.card(x)); });
      $('#sheet').close();
      save();
      syncAudio();
      renderPanel();
      renderPlaces();
      V.redraw();
    });
    const acts = el('div', 'ask-acts');
    acts.style.marginTop = '10px';
    acts.append(go);
    // More sounds for the world: audio files, or every sound of another story.
    const src = el('div', 'pick-src');
    const fromDevice = el('button', 'btn slim');
    fromDevice.type = 'button';
    fromDevice.innerHTML = `${ICON.import}<span>From this device</span>`;
    fromDevice.addEventListener('click', () => addFromDevice(paint));
    const fromStory = el('button', 'btn slim');
    fromStory.type = 'button';
    fromStory.innerHTML = `${ICON.import}<span>From a .troubadour</span>`;
    fromStory.addEventListener('click', () => addFromStory(paint));
    src.append(fromDevice, fromStory);
    body.append(src, search, box, acts);
    paint();
    paintGo();
    $('#sheet').addEventListener('close', stopPreview, { once: true });
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
    window.MapStamps.LIST.forEach((s) => {
      const b = el('button');
      b.type = 'button';
      b.dataset.stamp = s.id;
      const cv = el('canvas');
      cv.width = 112; cv.height = 112;
      const c = cv.getContext('2d');
      c.translate(56, 56);
      window.MapStamps.draw(c, s.id, 100, pal);
      b.append(cv, el('span', '', s.label));
      b.addEventListener('click', () => { V.setStamp(s.id); paintStamps(s.id); box.hidden = true; toast(`Tap the map to lay ${s.label.toLowerCase()}.`, 1800); });
      box.append(b);
    });
  }
  let currentStamp = 'lake';
  function paintStamps(id) { currentStamp = id; document.querySelectorAll('#mw-stamps [data-stamp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stamp === id))); }

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
    document.querySelectorAll('[id^="vol-"][data-zone]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      settings.vol[g.dataset.zone] = b.dataset.v; saveSettings(); paintSettings();
      if (rec && mode === 'play') renderPanel();
    }));
    $('#opt-rings').addEventListener('change', (e) => { settings.rings = e.target.checked; saveSettings(); V.redraw(); });
    $('#opt-awake').addEventListener('change', (e) => { settings.awake = e.target.checked; saveSettings(); settings.awake ? acquireWake() : releaseWake(); });
    $('#opt-silent').addEventListener('change', (e) => { settings.silent = e.target.checked; saveSettings(); applyAudioSession(); });
    $('[data-action="wipe"]').addEventListener('click', async () => {
      const ok = await ask('Erase everything?', 'Every world and every sound leaves this device. Your settings stay.', [{ label: 'Cancel', value: false }, { label: 'Erase', value: true, cls: 'danger' }]);
      if (!ok) return;
      A.close(0); rec = null;
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
    $('#opt-rings').checked = settings.rings;
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
      if (A.isOpen() && !$('#mw-pause').classList.contains('on')) { const { ctx } = audio(); if (ctx.state !== 'running') ctx.resume().catch(() => {}); }
    } else flush();
  });

  /* ================= Routing ================= */
  function show(id) {
    ['library', 'world'].forEach((s) => { $(`#${s}`).hidden = s !== id; });
    screen = id;
    document.documentElement.dataset.screen = id;
    if (id !== 'world') { A.close(); releaseWake(); stopPreview(); }
  }

  async function route() {
    const m = /^#\/(play|edit)\/([^/]+)(?:\/(\d+))?$/.exec(location.hash);
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
    $('#mw-back').addEventListener('click', () => { location.hash = '#/'; });
    $('#mw-more').innerHTML = ICON.share;
    $('#mw-more').addEventListener('click', () => rec && worldMenu(rec, mode === 'play'));
    $('#mw-panel').innerHTML = svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>', 19);
    $('#mw-panel').addEventListener('click', () => $('#world').classList.toggle('panel'));
    $('#mw-side-close').innerHTML = ICON.close;
    $('#mw-side-close').addEventListener('click', () => $('#world').classList.remove('panel'));
    $('#mw-switch').addEventListener('click', () => { location.hash = `#/play/${rec.uid}/${pi}`; });
    $('#mw-place-pick').addEventListener('change', (e) => {
      if (e.target.value === 'new') addPlace(); else goPlace(Number(e.target.value));
    });
    document.querySelectorAll('#mw-tools [data-tool]').forEach((b) => { b.innerHTML = TOOL_ICON[b.dataset.tool]; });
    $('#mw-tools [data-act="undo"]').innerHTML = ICON.undo;
    $('#mw-tools [data-act="fit"]').innerHTML = ICON.fit;
    $('#mw-tools').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool === 'stamp') {
        const box = $('#mw-stamps');
        if (V.tool() === 'stamp' && !box.hidden) { box.hidden = true; return; }
        V.setStamp(currentStamp);
        box.hidden = false;
        return;
      }
      $('#mw-stamps').hidden = true;
      if (b.dataset.tool) V.setTool(b.dataset.tool);
      else if (b.dataset.act === 'undo') { if (!V.undo()) toast('Nothing to undo.', 1400); }
      else if (b.dataset.act === 'fit') V.fit();
    });
    $('#mw-fill').innerHTML = ICON.fit;
    $('#mw-fill').addEventListener('click', () => V.fill());

    $('#mw-fade').innerHTML = ICON.stop;
    $('#mw-fade').addEventListener('click', () => { A.fadeAll(); refreshLive(); });
    $('#mw-pause').innerHTML = ICON.pause;
    $('#mw-pause').addEventListener('click', () => {
      const { ctx } = audio();
      const b = $('#mw-pause');
      if (ctx.state === 'running') { ctx.suspend(); b.classList.add('on'); b.innerHTML = ICON.play; }
      else { ctx.resume(); b.classList.remove('on'); b.innerHTML = ICON.pause; }
    });
    $('#mw-master').value = settings.master;
    paintRange($('#mw-master'));
    $('#mw-master').addEventListener('input', (e) => {
      settings.master = Number(e.target.value);
      const { ctx, master } = audio();
      master.gain.setTargetAtTime(settings.master, ctx.currentTime, 0.03);
    });
    $('#mw-master').addEventListener('change', saveSettings);

    // The map.
    V.mount($('#mw-canvas'));
    V.onTool = (t) => { paintTools(t); if (t !== 'stamp') $('#mw-stamps').hidden = true; };
    V.onSelect = () => { if (mode === 'edit') renderPanel(); };
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
    V.onTap = (e) => {
      tapped = e;
      renderPanel();
      $('#world').classList.add('panel');
    };
    A.onChange = () => { V.redraw(); };

    // Browsers keep sound off until a touch or a click: every gesture wakes the audio, unless paused by hand.
    // iPhone also wants a sound started inside that gesture: a silent one, once.
    const unlock = () => {
      if ($('#mw-pause').classList.contains('on')) return;
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
    V.setTool(pc() ? 'pen' : 'select');

    // Keys, while drawing.
    document.addEventListener('keydown', (e) => {
      if (screen !== 'world' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (mode === 'edit') V.undo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (mode === 'edit') {
        const map = { v: 'select', h: 'hand', w: 'wall', p: 'pen', e: 'eraser' };
        const k = e.key.toLowerCase();
        if (map[k]) { V.setTool(map[k]); return; }
        if (k === 'l') { V.setStamp(currentStamp); $('#mw-stamps').hidden = false; return; }
        if ((e.key === 'Delete' || e.key === 'Backspace') && V.selected()) { e.preventDefault(); V.deleteSelected(); return; }
        if (e.key === 'Escape') { $('#mw-stamps').hidden = true; V.select(null); return; }
      }
      if (e.key.toLowerCase() === 'f') V.fill();
      if (mode === 'play' && e.code === 'Space') { e.preventDefault(); $('#mw-pause').click(); }
    });

    window.addEventListener('hashchange', route);
    window.addEventListener('pagehide', flush);
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (settings.mode === 'system') applyTheme(); });
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
    try { await DB.open(); DB.persistence().catch(() => {}); } catch (e) {
      document.body.append(el('p', 'fatal', `Troubadour Map cannot reach its storage here (${e.message || e}).`));
      return;
    }
    await route();
  }
  boot();
})();
