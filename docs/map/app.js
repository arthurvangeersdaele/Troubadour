/* Troubadour Map: library, import and export, the panel beside the map, settings and routing.
 *   #/                  the worlds kept on this device
 *   #/world/<uid>/<n>   a world, on its place n
 */
(function () {
  'use strict';

  const VERSION = '261031.1';
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
  const MAP_ART = '<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 18l30-10 44 10 30-10v64l-30 10-44-10-30 10z" opacity=".5"/><path d="M38 8v64M82 18v64" opacity=".35"/><circle cx="60" cy="46" r="7" fill="currentColor" stroke="none"/><circle cx="60" cy="46" r="17" stroke-dasharray="4 5"/><circle cx="60" cy="46" r="29" stroke-dasharray="3 6" opacity=".6"/></svg>';

  async function renderLibrary() {
    const list = $('#world-list');
    const recs = await DB.list();
    list.textContent = '';
    if (!recs.length) {
      const w = el('div', 'mp-welcome');
      w.innerHTML = `${MAP_ART}
        <h1>Hear the world as they walk it.</h1>
        <p>Draw each place of your world: its walls, its lakes and forests, its shrines. Lay your sounds on the map, then move the party's golden point at the table. Every sound swells as they come close, and walls muffle what lies behind them.</p>
        <p class="muted">Start from a <b>.troubadour</b> story: its chapters become the places of your world, its sounds wait to be laid on the map. A <b>.troubadour-map</b> opens as it was forged.</p>`;
      const b = el('button', 'btn primary', 'Import a story');
      b.type = 'button';
      b.addEventListener('click', pickFile);
      w.append(b);
      list.append(w);
      return;
    }
    recs.forEach((r) => {
      const card = el('article', 'mp-item');
      const cv = el('canvas');
      cv.setAttribute('aria-hidden', 'true');
      const body = el('div');
      const main = el('button', 'mp-item-main');
      main.type = 'button';
      const n = r.world.places.length;
      const sounds = r.world.places.reduce((a, p) => a + p.general.length + p.elements.reduce((b, e) => b + e.cards.length, 0), 0);
      main.append(el('h2', '', r.story.title || 'World'));
      main.append(el('p', 'muted', `${n} place${n > 1 ? 's' : ''}, ${sounds} sound card${sounds === 1 ? '' : 's'}, by ${r.world.bard || r.story.bard || 'Forgotten Troubadour'}`));
      const chips = el('ul', 'mp-chips');
      r.world.places.slice(0, 6).forEach((p) => chips.append(el('li', '', p.title)));
      if (n > 6) chips.append(el('li', '', `and ${n - 6} more`));
      main.append(chips);
      main.addEventListener('click', () => { location.hash = `#/world/${r.uid}/0`; });
      const acts = el('div', 'mp-item-acts');
      const open = el('button', 'btn primary slim');
      open.type = 'button';
      open.innerHTML = `${ICON.play}<span>Open</span>`;
      open.addEventListener('click', () => { location.hash = `#/world/${r.uid}/0`; });
      const more = el('button', 'ico small');
      more.type = 'button';
      more.innerHTML = ICON.more;
      more.setAttribute('aria-label', `More for ${r.story.title}`);
      more.addEventListener('click', () => worldMenu(r));
      acts.append(open, el('span', 'grow'), more);
      body.append(main, acts);
      card.append(cv, body);
      list.append(card);
      requestAnimationFrame(() => V.thumb(cv, r.world.places[0]));
    });
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

  function worldMenu(r) {
    menu(r.story.title || 'World', [
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
      if (!world) toast('Your world is ready: one place per chapter. Draw its walls and elements, then lay the sounds on them.', 5200);
      else toast(`${story.title} is ready.`);
      location.hash = `#/world/${r.uid}/0`;
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
  async function openWorld(r, n) {
    const same = rec && rec.uid === r.uid;
    if (!same) {
      A.close(0);
      buffers.clear();
      rec = r;
      mode = pc() ? 'edit' : 'play';
    }
    goPlace(Math.max(0, Math.min(rec.world.places.length - 1, n || 0)), true);
  }

  async function goPlace(n, first) {
    stopPreview();
    pi = n;
    tapped = null;
    $('#mw-title').textContent = rec.story.title || 'World';
    $('#mw-sub').textContent = place().title;
    V.show(place(), rec.world);
    renderPlaces();
    if (location.hash !== `#/world/${rec.uid}/${pi}`) history.replaceState(null, '', `#/world/${rec.uid}/${pi}`);
    await setMode(mode, !first);
  }

  async function setMode(m, keepAudio) {
    mode = m;
    $('#world').dataset.mode = m;
    document.querySelectorAll('#mw-mode [data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === m)));
    V.setMode(m);
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
    const o = el('option', '', '+ New place'); o.value = 'new'; pick.append(o);
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
  function cardRow(c, list, owner) {
    const row = el('div', `mcard ${c.zone}`);
    const h = el('div', 'mcard-h');
    h.append(el('b', '', c.name), el('span', 'pill', ZONE_LABEL[c.zone] || c.zone));
    if (mode === 'edit') {
      const x = el('button', 'x');
      x.type = 'button';
      x.innerHTML = ICON.x;
      x.title = 'Remove this card';
      x.addEventListener('click', () => { list.splice(list.indexOf(c), 1); save(); syncAudio(); renderPanel(); V.redraw(); renderPlaces(); });
      h.append(x);
    }
    row.append(h);
    if (mode === 'edit') {
      const seg = el('div', 'seg small');
      [['loop', 'Loop'], ['random', 'Random'], ['once', 'On tap']].forEach(([v, label]) => {
        const b = el('button', '', label);
        b.type = 'button';
        b.setAttribute('aria-checked', String(c.play === v));
        b.title = v === 'loop' ? 'Plays again and again' : v === 'random' ? 'Plays, waits a random pause, plays again' : 'Plays once, when you tap it at the table';
        b.addEventListener('click', () => { Object.assign(c, M.cleanCard(Object.assign({}, c, { play: v, autoplay: v !== 'once' }))); save(); renderPanel(); });
        seg.append(b);
      });
      row.append(seg);
      const opts = el('div', 'opts');
      if (c.play !== 'once') {
        const l = el('label');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = c.autoplay;
        cb.addEventListener('change', () => { c.autoplay = cb.checked; save(); });
        l.append(cb, document.createTextNode('Starts with the place'));
        opts.append(l);
      }
      if (c.play === 'random') {
        const gap = (key, label) => {
          const l = el('label');
          const i = el('input'); i.type = 'number'; i.min = 0; i.max = 600; i.step = 1; i.value = c[key];
          i.addEventListener('change', () => { Object.assign(c, M.cleanCard(Object.assign({}, c, { [key]: Number(i.value) }))); save(); renderPanel(); });
          l.append(document.createTextNode(label), i);
          return l;
        };
        opts.append(gap('gapMin', 'Pause from'), gap('gapMax', 'to'), document.createTextNode('s'));
      }
      if (opts.childNodes.length) row.append(opts);
    }
    const r = el('div', 'mcard-r');
    const pb = el('button', 'pb');
    pb.type = 'button';
    pb.innerHTML = ICON.play;
    if (mode === 'edit') {
      pb.title = 'Listen';
      pb.addEventListener('click', () => listen(c.file, pb));
    } else {
      pb.addEventListener('click', () => { A.toggle(c); refreshLive(); });
    }
    const vol = el('input');
    vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = c.volume;
    vol.setAttribute('aria-label', `Volume of ${c.name}`);
    vol.addEventListener('input', () => A.setVolume(c, Number(vol.value)));
    vol.addEventListener('change', save);
    r.append(pb, vol);
    if (mode === 'play' && owner) {
      const meter = el('span', 'heard');
      const bar = el('i');
      meter.append(bar);
      meter.title = 'How much of it reaches the party';
      r.append(meter);
      liveRows.push(() => {
        const v = A.voice(c);
        const on = !!(v && v.state === 'playing');
        row.classList.toggle('on', on);
        pb.innerHTML = on ? (c.play === 'once' ? ICON.stop : ICON.pause) : ICON.play;
        bar.style.width = `${Math.round((v ? v.heard : 0) * 100)}%`;
      });
    } else if (mode === 'play') {
      liveRows.push(() => {
        const v = A.voice(c);
        const on = !!(v && v.state === 'playing');
        row.classList.toggle('on', on);
        pb.innerHTML = on ? (c.play === 'once' ? ICON.stop : ICON.pause) : ICON.play;
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
    how.append(el('p', '', 'Wall: draws walls (Shift for a straight one). Element: draw a shape that ends near its start for an area, or a line for a river or a road. Library: lakes, mountains, forests and more. Select an element to give it sounds, a reach and a way to another place.'));
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
    history.replaceState(null, '', `#/world/${rec.uid}/${pi}`);
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
    reach.append(slider('Heard up to', e.radius, 0, 2000, 10, (v) => `${v}`, (v) => { e.radius = v; V.redraw(); }));
    reach.append(el('p', '', 'How far beyond its edge its sounds carry, the same for all of them: full inside, fading to silence at this distance. The tinted ground shows it.'));
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
    box.append(cardsBlock('Whole place', p.general, null, 'No sound for the whole place. Add some in Draw.'));
    const near = section('Around the party');
    const list = el('div', 'pn');
    near.append(list);
    box.append(near);
    const els = p.elements.filter((e) => e.cards.length || e.link);
    if (!els.length) near.append(el('div', 'pn-empty', 'No element has sounds on this map yet. Switch to Draw, select a shape and add sounds to it.'));
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
      reach.append(slider('Heard up to', e.radius, 0, 2000, 10, (v) => `${v}`, (v) => { e.radius = v; A.hear(); V.redraw(); }));
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
    const all = M.soundsOf(rec.story).filter((s) => rec.files[s.file]);
    // The same file once: the first place it appears.
    const seen = new Set();
    const sounds = all.filter((s) => (seen.has(s.file) ? false : seen.add(s.file)));
    const paint = () => {
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
        b.setAttribute('aria-pressed', String(chosen.has(s)));
        const lis = el('button', 'lis');
        lis.type = 'button';
        lis.innerHTML = ICON.play;
        lis.title = 'Listen';
        lis.addEventListener('click', (ev) => { ev.stopPropagation(); listen(s.file, lis); });
        const t = el('b', '', s.name);
        b.append(el('i'), lis, t, el('small', '', ZONE_LABEL[s.zone]));
        const toggle = () => { if (chosen.has(s)) chosen.delete(s); else chosen.add(s); b.setAttribute('aria-pressed', String(chosen.has(s))); paintGo(); };
        b.addEventListener('click', toggle);
        b.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
        box.append(b);
      });
      if (!box.childNodes.length) box.append(el('div', 'pn-empty', q ? 'No sound by that name.' : 'This story has no sounds.'));
    };
    search.addEventListener('input', paint);
    go.addEventListener('click', () => {
      [...chosen].forEach((s) => list.push(M.card(s)));
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
    body.append(search, box, acts);
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
    const m = /^#\/world\/([^/]+)(?:\/(\d+))?$/.exec(location.hash);
    if (!m) { flush(); show('library'); rec = null; await renderLibrary(); return; }
    if (rec && rec.uid === m[1] && screen === 'world') { const n = Number(m[2] || 0); if (n !== pi) goPlace(n); return; }
    const r = await DB.get(m[1]);
    if (!r) { location.hash = '#/'; return; }
    show('world');
    await openWorld(r, Number(m[2] || 0));
  }

  /* ================= Wiring ================= */
  function wire() {
    document.querySelectorAll('[data-action="settings"]').forEach((b) => { b.innerHTML = ICON.gear; b.addEventListener('click', openSettings); });
    document.querySelectorAll('.set-head .ico, [data-action="close-sheet"]').forEach((b) => { b.innerHTML = ICON.close; });
    $('[data-action="close-sheet"]').addEventListener('click', () => $('#sheet').close());
    document.querySelectorAll('.i-import').forEach((s) => { s.outerHTML = ICON.import; });
    $('[data-action="import"]').addEventListener('click', pickFile);
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
    $('#mw-more').addEventListener('click', () => rec && worldMenu(rec));
    $('#mw-panel').innerHTML = svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>', 19);
    $('#mw-panel').addEventListener('click', () => $('#world').classList.toggle('panel'));
    $('#mw-side-close').innerHTML = ICON.close;
    $('#mw-side-close').addEventListener('click', () => $('#world').classList.remove('panel'));
    $('#mw-mode').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b && b.dataset.v !== mode) setMode(b.dataset.v); });
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
    document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => V.zoom(Number(b.dataset.zoom))));

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
    V.onSelect = () => { if (mode === 'edit') { renderPanel(); if (V.selected() && !pc()) $('#world').classList.add('panel'); } };
    V.onEdit = () => { save(); if (mode === 'edit') { renderPlaces(); } if (A.isOpen()) { A.sync(); } };
    V.onPlayer = (p) => { if (A.isOpen()) A.hear(p); };
    V.onTap = (e) => {
      tapped = e;
      renderPanel();
      if (!pc()) $('#world').classList.add('panel');
    };
    A.onChange = () => { V.redraw(); };
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
      if (e.key.toLowerCase() === 'f') V.fit();
      if (mode === 'play' && e.code === 'Space') { e.preventDefault(); $('#mw-pause').click(); }
    });

    window.addEventListener('hashchange', route);
    window.addEventListener('pagehide', flush);
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (settings.mode === 'system') applyTheme(); });
  }

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
