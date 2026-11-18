/* Troubadour Ballade: library, import, settings and routing.
 *   #/            the stories kept on this device
 *   #/play/<uid>  the player (a chapter as a cascade of steps)
 *   #/edit/<uid>  the editor (computer)
 */
(function () {
  'use strict';

  const VERSION = '261118.6';
  const { $, el, ICON, settings, saveSettings, applyTheme, toast, busy, idle, ask, deliver, audio, decode, applyAudioSession } = window.FlowUI;
  const F = window.TroubadourBallade;
  const DB = window.FlowDB;
  const pc = () => document.documentElement.classList.contains('pc');
  const ipad = () => document.documentElement.classList.contains('ipad');
  /** The builder runs on a computer, and on an iPad held sideways (charter 8). */
  const canBuild = () => pc() || (ipad() && matchMedia('(orientation: landscape) and (min-width: 1000px)').matches);
  let screen = '';

  /* ================= Library ================= */
  /** The Ballade online player (#/online, on a computer): open a .troubadour-ballade and play it here, as Troubadour's online player does. */
  const isOnline = () => location.hash === '#/online';
  let fromOnline = false;
  function barFor(online) {
    const here = document.querySelector('.bm-bar .here');
    if (here) here.textContent = online ? 'Ballade online player' : 'Ballade builder';
    document.querySelectorAll('[data-bm="new"]').forEach((b) => { b.hidden = online; });
    document.title = online ? 'Ballade online player | Troubadour' : 'Troubadour Ballade';
  }
  function renderOnline(recs) {
    const steps = (r) => r.flow.chapters.reduce((a, c) => a + F.allSteps(c).length, 0);
    const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
    window.TroupeBuilderMenu.render($('#bm-host'), {
      hero: { title: 'Ballade online player', lead: 'Open a .troubadour-ballade and play it on this screen: the golden wire runs, every sound falls at its moment.',
        mark: '<svg viewBox=\"0 0 24 24\" class=\"portal\"><rect x=\"2.5\" y=\"4\" width=\"19\" height=\"13\" rx=\"2.5\"/><path d=\"M12 10.6a.9.9 0 1 1 .9.9 2 2 0 1 1-2-2 3 3 0 1 1 3 3\"/><path d=\"M9 21h6M12 17v4\"/></svg>' },
      more: DISCOVERIES.filter((d) => !recs.some((r) => r.flow.id === d.id && (r.flow.revision || 0) >= d.revision))
        .map((d) => ({ tag: 'Discovery tale', title: d.title, sub: d.blurb, onClick: () => addDiscovery(d) })),
      drop: { text: 'Drop a .troubadour-ballade here', onFile: importFile, onBrowse: pickFile },
      history: {
        title: 'In this browser, for now', playOnly: true,
        note: "Opened here, kept only in this browser's temporary storage: it may be cleared without asking. Your files stay safe where you keep them.",
        empty: 'Nothing here yet. Open a .troubadour-ballade to play it.',
        items: recs.map((r) => {
          const cover = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          cover.setAttribute('viewBox', '290 120 444 770');
          cover.innerHTML = '<path d="M512 196V500C512 630 352 640 352 812M512 500C512 630 672 640 672 812"/><circle cx="512" cy="176" r="38"/><circle cx="352" cy="826" r="46"/><circle cx="672" cy="826" r="46"/>';
          return { title: r.story.title || 'Story', meta: `${n(r.story.chapters.length, 'chapter')}, ${n(steps(r), 'step')}`, updated: r.updated, cover,
            onPlay: () => { location.hash = `#/play/${r.uid}`; }, onMore: () => storyMenu(r) };
        }),
      },
    });
  }

  /** On a computer, the library is the Ballade builder's main menu, after the Story builder. */
  function renderMenu(recs) {
    const steps = (r) => r.flow.chapters.reduce((a, c) => a + F.allSteps(c).length, 0);
    const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
    window.TroupeBuilderMenu.render($('#bm-host'), {
      hero: { title: 'Ballade builder', lead: 'Command time: set the exact moment of every sound of your story, and the golden wire plays it for you at the table.',
        mark: '<svg viewBox="290 120 444 770" class="wire"><path d="M512 196V500C512 630 352 640 352 812M512 500C512 630 672 640 672 812"/><circle cx="512" cy="176" r="38"/><circle cx="352" cy="826" r="46"/><circle cx="672" cy="826" r="46"/></svg>' },
      create: { title: 'New Ballade', sub: 'A blank Ballade, then your chapters, sounds and steps', onClick: newBallade },
      more: DISCOVERIES.filter((d) => !recs.some((r) => r.flow.id === d.id && (r.flow.revision || 0) >= d.revision))
        .map((d) => ({ tag: 'Discovery tale', title: d.title, sub: d.blurb, onClick: () => addDiscovery(d) })),
      drop: { text: 'Drop a .troubadour or a .troubadour-ballade here', onFile: importFile, onBrowse: pickFile },
      history: {
        title: 'Your Ballades, in this browser',
        note: "These live in this browser's storage, which it may clear without asking (private windows, cleaning up space, another browser). Export each one to keep it for good.",
        empty: 'Nothing here yet. Your Ballades are kept in this browser as you shape them.',
        items: recs.map((r) => {
          const cover = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          cover.setAttribute('viewBox', '290 120 444 770');
          cover.innerHTML = '<path d="M512 196V500C512 630 352 640 352 812M512 500C512 630 672 640 672 812"/><circle cx="512" cy="176" r="38"/><circle cx="352" cy="826" r="46"/><circle cx="672" cy="826" r="46"/>';
          return {
            title: r.story.title || 'Story',
            meta: `${n(r.story.chapters.length, 'chapter')}, ${n(steps(r), 'step')}${r.flow.revision ? `, revision ${r.flow.revision}` : ''}`,
            updated: r.updated,
            cover,
            exportLabel: 'Export',
            onEdit: () => { location.hash = `#/edit/${r.uid}`; }, onPlay: () => { location.hash = `#/play/${r.uid}`; },
            onExport: () => exportFlow(r), onMore: () => storyMenu(r),
          };
        }),
      },
    });
  }

  async function renderLibrary() {
    await loadDiscoveries();
    const list = $('#flow-list');
    const recs = await DB.list();
    if (pc() && window.TroupeBuilderMenu) { barFor(isOnline()); if (isOnline()) renderOnline(recs); else renderMenu(recs); return; }
    list.textContent = '';
    // As in Troubadour and Map: a welcome and the ways in when the device holds nothing; else the story last
    // opened as a big card, the others in rows under it, and a last row to add one.
    if (!recs.length) {
      const hello = el('div', 'hello');
      hello.innerHTML = MARK;
      hello.append(el('h1', '', 'Your Ballade awaits'), el('p', 'lead', 'Every sound of a chapter waits on a golden wire and plays on time: you only tap Go at the gates. Import a story, or start from a discovery tale.'));
      list.append(hello, el('h3', 'lib-h', 'Add a story'));
      const doors = el('div', 'lib-doors');
      doors.append(...addDoors());
      list.append(doors);
      return;
    }
    const at = (r) => RECENT[r.uid] || Date.parse(r.updated || '') || 0;
    const [first, ...rest] = recs.slice().sort((x, y) => at(y) - at(x));
    const wrap = el('div', 'lib-b');
    wrap.append(heroCard(first));
    const rows = el('div', 'lib-list');
    rows.append(el('h3', 'lib-h', rest.length ? 'All stories' : 'Your library'));
    rest.forEach((r) => rows.append(storyRow(r)));
    const add = el('button', 'srow add');
    add.type = 'button';
    add.innerHTML = `<span class="add-i">${ICON.plus}</span>`;
    const t = el('span', 'stxt');
    t.append(el('b', '', 'Add a story'), el('span', 'meta', 'A discovery tale, or a file'));
    add.append(t);
    add.addEventListener('click', openAddStory);
    rows.append(add);
    wrap.append(rows);
    list.append(wrap);
  }

  /* The Ballade mark in gold: the wire runs down from its dot and splits in two (branding, 2.2 of the charter). */
  const WIRE = '<path d="M512 196V500C512 630 352 640 352 812M512 500C512 630 672 640 672 812"/><circle cx="512" cy="176" r="38"/><circle cx="352" cy="826" r="46"/><circle cx="672" cy="826" r="46"/>';
  const MARK = `<svg class="bl-mark" viewBox="300 120 424 760" aria-hidden="true">${WIRE}</svg>`;
  /** When each story was last opened on this device (its uid: a time), so the last one leads the library. */
  const RECENT = (() => { try { return JSON.parse(localStorage.getItem('troubadour.ballade.recent') || '{}'); } catch (e) { return {}; } })();
  function opened(uid) { RECENT[uid] = Date.now(); try { localStorage.setItem('troubadour.ballade.recent', JSON.stringify(RECENT)); } catch (e) { /* private mode */ } }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const stepsOf = (r) => r.flow.chapters.reduce((a, c) => a + F.allSteps(c).length, 0);
  /** A story's cover: its golden wire, branching once for every chapter (up to five), on the dark of the night. */
  function cover(r) {
    const n = Math.max(1, Math.min(5, r.story.chapters.length));
    const xs = Array.from({ length: n }, (_, i) => (n === 1 ? 160 : 70 + (180 * i) / (n - 1)));
    const arms = xs.map((x) => `M160 34V62C160 92 ${x} 92 ${x} 124V150`).join('');
    const c = el('span', 'cover bl-cover');
    c.innerHTML = `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="glow"><path d="${arms}"/></g><g class="core"><path d="${arms}"/></g><circle cx="160" cy="28" r="7"/>${xs.map((x) => `<circle cx="${x}" cy="154" r="7.5"/>`).join('')}</svg>`;
    return c;
  }
  function btnEl(cls, html, label, fn) {
    const b = el('button', cls);
    b.type = 'button';
    b.innerHTML = html;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }
  const playAt = (r) => { location.hash = `#/play/${r.uid}`; };
  /** As in Troubadour: a tap anywhere on a story (not on one of its buttons) plays it. */
  function openOnTap(card, r) {
    card.classList.add('tappable');
    card.addEventListener('click', (e) => { if (!e.target.closest('button, a')) playAt(r); });
  }
  function heroCard(r) {
    const c = el('section', 'hero bl-hero');
    c.style.setProperty('--c', 'var(--gold)');
    c.append(cover(r));
    const inner = el('div', 'hero-in');
    const kick = el('div', 'hero-kick');
    kick.append(el('span', 'tag', r.flow.revision ? `Revision ${r.flow.revision}` : 'Ballade'), el('span', 'kick', RECENT[r.uid] ? 'Last opened' : 'Just added'));
    inner.append(kick, el('h2', '', r.story.title || 'Story'));
    inner.append(el('p', 'hero-sub clamp', r.story.chapters.map((ch) => ch.title || 'Chapter').join(', ')));
    inner.append(el('p', 'hero-meta', `${plural(r.story.chapters.length, 'chapter')}, ${plural(stepsOf(r), 'step')}, by ${r.flow.bard || r.story.bard || 'Forgotten Troubadour'}`));
    inner.append(el('span', 'grow'));
    const acts = el('div', 'hero-acts');
    acts.append(btnEl('hb primary', `${ICON.play}<span>Play</span>`, null, () => playAt(r)), btnEl('hb more', ICON.more, `More: ${r.story.title}`, () => storyMenu(r)));
    inner.append(acts);
    c.append(inner);
    openOnTap(c, r);
    return c;
  }
  function storyRow(r) {
    const row = el('div', 'srow');
    row.style.setProperty('--c', 'var(--gold)');
    const txt = el('div', 'stxt');
    txt.append(el('b', '', r.story.title || 'Story'), el('span', 'meta', `${plural(r.story.chapters.length, 'chapter')}, ${plural(stepsOf(r), 'step')}`));
    row.append(cover(r), txt, btnEl('more', ICON.more, `More: ${r.story.title}`, () => storyMenu(r)), btnEl('go', ICON.play, `Play ${r.story.title}`, () => playAt(r)));
    openOnTap(row, r);
    return row;
  }
  /** The ways to add a story: on the library when it is empty, and behind the + of the top bar. */
  function addDoors(then = () => {}) {
    const door = (kind, icon, title, text, fn) => {
      const d = el('button', `ldoor d-${kind}`);
      d.type = 'button';
      d.innerHTML = `<span class="di">${icon}</span>`;
      d.append(el('b', '', title), el('span', '', text));
      d.addEventListener('click', () => { then(); fn(); });
      return d;
    };
    return [
      door('new', ICON.import, 'Import', 'A .troubadour-ballade, or a .troubadour', pickFile),
      door('disc', DISC, 'Discovery', `${DISCOVERIES.length === 2 ? 'Two tales' : DISCOVERIES.length === 1 ? 'A tale' : 'Tales'} already timed, sounds included`, openDiscovery),
    ];
  }
  const DISC = window.FlowUI.svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>', 20);
  function sheet(title) {
    $('#sheet-title').textContent = title;
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = '';
    return body;
  }
  function openAddStory() {
    const doors = el('div', 'lib-doors add-doors');
    doors.append(...addDoors(() => $('#sheet').close()));
    sheet('Add a story').append(doors);
    if (!$('#sheet').open) $('#sheet').showModal();
  }
  /** The discovery tales: one tap adds one (or plays it, when it is already on this device). */
  async function openDiscovery() {
    await loadDiscoveries();
    const recs = await DB.list();
    const doors = el('div', 'lib-doors add-doors bl-disc');
    DISCOVERIES.forEach((d) => {
      const have = recs.find((r) => r.flow.id === d.id && (r.flow.revision || 0) >= d.revision);
      const b = el('button', 'ldoor d-tale');
      b.type = 'button';
      b.innerHTML = `<span class="di">${have ? ICON.play : DISC}</span>`;
      b.append(el('b', '', d.title), el('span', '', have ? 'On this device: tap to play' : d.blurb));
      b.addEventListener('click', () => { $('#sheet').close(); if (have) playAt(have); else addDiscovery(d); });
      doors.append(b);
    });
    if (!DISCOVERIES.length) doors.append(el('p', 'muted', 'The discovery tales need a connection to download. Try again once you are online.'));
    sheet('Discovery tales').append(doors);
    if (!$('#sheet').open) $('#sheet').showModal();
  }

  /* ================= Discovery tale ================= */
  /* The discovery tales live in docs/discovery/ballades/, listed in docs/discovery/index.json (shared by every app). */
  let DISCOVERIES = [];
  let discoveryLoad = null;
  function loadDiscoveries() {
    if (!discoveryLoad) {
      discoveryLoad = fetch('../discovery/index.json', { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((d) => {
          DISCOVERIES = (d.ballades || []).map((b) => Object.assign({}, b, {
            file: `../discovery/${b.file}`,
            blurb: b.size ? `${b.blurb} About ${Math.max(1, Math.round(b.size / 1e6))} MB.` : b.blurb,
          }));
        })
        .catch(() => { discoveryLoad = null; });
    }
    return discoveryLoad;
  }
  async function addDiscovery(d) {
    try {
      busy(`Downloading ${d.title}`, '', 0);
      const res = await fetch(d.file);
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        busy(`Downloading ${d.title}`, total ? `${window.Troubadour.formatSize(got)} of ${window.Troubadour.formatSize(total)}` : window.Troubadour.formatSize(got), total ? got / total : null);
      }
      await importFile(new File(parts, d.file.split('/').pop()));
    } catch (e) {
      idle();
      toast(`${d.title} could not be downloaded (${e.message || e}). Check your connection and try again.`, 5200);
    }
  }

  function storyMenu(r) {
    $('#sheet-title').textContent = r.story.title || 'Story';
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = 'fl-menu';
    const item = (icon, label, sub, fn, cls) => {
      const b = el('button', `fl-menu-item ${cls || ''}`);
      b.type = 'button';
      b.innerHTML = icon;
      const t = el('span');
      t.append(el('b', '', label), el('small', '', sub));
      b.append(t);
      b.addEventListener('click', () => { $('#sheet').close(); fn(); });
      body.append(b);
    };
    if (pc() || ipad()) item(ICON.edit, 'Edit the Ballade', 'Steps, gates, timings and fades', () => { location.hash = `#/edit/${r.uid}`; });
    item('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>', 'Rename the Ballade', 'Its title, on its cover and at the table', async () => {
      const a = await ask('Rename the Ballade', '', [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', cls: 'primary' }], { label: 'Name', placeholder: 'Story title', value: r.story.title, max: 120 });
      if (!a || !a.value || !a.text) return;
      r.story.title = a.text;
      await DB.put(r);
      renderLibrary();
    });
    item(ICON.share, 'Export .troubadour-ballade', 'Exports the next revision, signed with your troubadour name', () => exportFlow(r));
    item(ICON.share, 'Export .troubadour', 'The story alone, for Troubadour', () => exportTroubadour(r));
    item(ICON.trash, (document.documentElement.classList.contains('pc') ? 'Remove from this browser' : 'Remove from this device'), 'Keep a .troubadour-ballade if you want it back', async () => {
      const ok = await ask(`Remove ${r.story.title}?`, 'Its Ballade and its sounds leave this device.', [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, cls: 'danger' }]);
      if (!ok) return;
      await DB.remove(r.uid);
      renderLibrary();
    }, 'danger');
    $('#sheet').showModal();
  }

  async function exportFlow(r) {
    try {
      busy('Exporting the .troubadour-ballade', '', 0);
      const files = await DB.filesOf(r);
      const out = await F.pack(r.story, r.flow, files, window.Troubadour.bardName(), (f) => busy('Exporting the .troubadour-ballade', '', f), `Troubadour Ballade ${VERSION}`);
      r.flow = out.flow;
      await DB.put(r);
      idle();
      await deliver(out.blob, out.fileName);
    } catch (e) { idle(); toast(`Could not export: ${e.message || e}`, 4200); }
  }
  async function exportTroubadour(r) {
    try {
      busy('Writing the .troubadour', '', 0);
      const files = await DB.filesOf(r);
      const out = await F.packTroubadour(r.story, files, (f) => busy('Writing the .troubadour', '', f));
      idle();
      await deliver(out.blob, out.fileName);
    } catch (e) { idle(); toast(`Could not write the .troubadour: ${e.message || e}`, 4200); }
  }

  /* ================= Import ================= */
  function pickFile() {
    const input = $('#pick-file');
    // iPhone greys out files whose type it does not know: no filter there.
    if (!document.documentElement.classList.contains('iphone')) input.accept = '.troubadour,.troubadour-ballade,.bardic,.bardic-flow,application/zip';
    input.value = '';
    input.click();
  }

  /** A blank Ballade: one empty chapter, opened in the Ballade builder, as New story in the Story builder. */
  async function newBallade() {
    const bard = window.Troubadour.bardName();
    const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const story = { format: 'troubadour', version: 2, id: window.Troubadour.uuid(), revision: 1, bard, title: '', created: stamp,
      chapters: [{ title: 'Chapter 1', music: [], ambience: [], events: [] }], soundbox: [] };
    const rec = await DB.put({ uid: DB.uid(), story, flow: F.defaultFlow(story, {}, bard), files: {}, lengths: {} });
    location.hash = `#/edit/${rec.uid}`;
  }

  async function importFile(file) {
    const isFlow = /\.(troubadour-ballade|bardic-flow)$/i.test(file.name);
    try {
      busy('Opening the story', file.name, 0);
      const { story, flow, files } = await F.read(file, (n, t) => busy('Opening the story', `Sound ${n} of ${t}`, n / t));
      // How long every sound lasts: from story.json, else measured.
      const lengths = {};
      (story.chapters || []).forEach((c) => F.ZONES.forEach((z) => (c[z] || []).forEach((s) => { if (s.duration) lengths[s.file] = s.duration; })));
      (story.soundbox || []).forEach((s) => { if (s.duration) lengths[s.file] = s.duration; });
      const toMeasure = [...files.keys()].filter((p) => !lengths[p]);
      let n = 0;
      for (const p of toMeasure) {
        n += 1;
        busy('Measuring the sounds', `${n} of ${toMeasure.length}`, n / toMeasure.length);
        try { lengths[p] = Math.round((await decode(files.get(p))).duration * 10) / 10; } catch (e) { /* unreadable: left free */ }
      }
      let fl = flow ? F.normalize(flow, story, lengths, files) : F.defaultFlow(story, lengths, window.Troubadour.bardName());
      // The same Flow already here?
      const all = await DB.list();
      let uid = DB.uid();
      const twin = all.find((r) => (flow ? r.flow.id === fl.id : r.story.id && r.story.id === story.id && !r.flow.revision));
      if (twin) {
        idle();
        const newer = flow && (fl.revision || 0) > (twin.flow.revision || 0);
        const answer = await ask(`${story.title} is already here`, flow
          ? `This device holds revision ${twin.flow.revision || 0} of its Ballade; the file is revision ${fl.revision || 0}.${newer ? ' The file is newer.' : ''}`
          : 'A Ballade of this story, never exported yet, is already on this device.', [
          { label: 'Cancel', value: null },
          { label: 'Keep both', value: 'both' },
          { label: 'Replace', value: 'replace', cls: 'primary' },
        ]);
        if (!answer) return;
        if (answer === 'replace') uid = twin.uid;
        else if (flow) fl = Object.assign({}, fl, { id: window.Troubadour.uuid(), revision: 0 });
      }
      const keys = {};
      n = 0;
      for (const [p, b] of files) {
        n += 1;
        busy('Keeping the sounds on this device', `${n} of ${files.size}`, n / files.size);
        keys[p] = await DB.putBlob(b);
      }
      const rec = await DB.put({ uid, story, flow: fl, files: keys, lengths });
      await DB.collect();
      idle();
      // Imported or downloaded, a Ballade joins the list without opening: Edit or Play it from there.
      if (!flow) toast(pc() || ipad() ? `A first Ballade of ${story.title} was made from its sounds: Edit it to shape it.` : 'A first Ballade was made from its sounds. Shape it in the Ballade builder, on a computer or an iPad.', 4600);
      else toast(`${story.title} is in your list.`);
      if (location.hash === '#/' || !location.hash || isOnline()) renderLibrary(); else location.hash = '#/';
    } catch (e) {
      idle();
      toast(`${isFlow ? 'This .troubadour-ballade' : 'This file'} could not be opened: ${e.message || e}`, 5200);
    }
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
    $('#clock-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      settings.clock = Number(b.dataset.v); saveSettings(); paintSettings();
      if (window.FlowPlayer.isOpen()) window.FlowPlayer.relayout();
    });
    $('#opt-even').addEventListener('change', (e) => { settings.even = e.target.checked; saveSettings(); });
    $('#opt-autonext').addEventListener('change', (e) => { settings.autoNext = e.target.checked; saveSettings(); });
    $('#opt-awake').addEventListener('change', (e) => { settings.awake = e.target.checked; saveSettings(); settings.awake ? acquireWake() : releaseWake(); });
    $('#opt-silent').addEventListener('change', (e) => { settings.silent = e.target.checked; saveSettings(); applyAudioSession(); });
    $('[data-action="wipe"]').addEventListener('click', async () => {
      const ok = await ask('Erase everything?', 'Every Ballade and every sound leaves this device. Your settings stay.', [{ label: 'Cancel', value: false }, { label: 'Erase', value: true, cls: 'danger' }]);
      if (!ok) return;
      window.FlowPlayer.close(); window.FlowEditor.close();
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
    document.querySelectorAll('#clock-pick [data-v]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.v) === Number(settings.clock || 10))));
    document.querySelectorAll('#fade-pick [data-v]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.v) === settings.fade)));
    $('#opt-awake').checked = settings.awake;
    $('#opt-even').checked = settings.even !== false;
    $('#opt-autonext').checked = !!settings.autoNext;
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
    if (!settings.awake || screen !== 'player' || document.visibilityState !== 'visible') return;
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
      // Back from the lock screen: wake the audio clock again, unless the bard paused it.
      const st = window.FlowPlayer.state();
      if (st && st.mode !== 'idle') { const { ctx } = audio(); if (ctx.state !== 'running' && !document.querySelector('#fl-pause.on')) ctx.resume().catch(() => {}); }
    } else window.FlowEditor.flush();
  });
  document.addEventListener('touchend', () => { if (settings.awake && screen === 'player' && !wake && !videoAwake) acquireWake(); }, { passive: true });

  /* ================= Routing ================= */
  function show(id) {
    ['library', 'player', 'editor', 'nobuild'].forEach((s) => { $(`#${s}`).hidden = s !== id; });
    screen = id;
    document.documentElement.dataset.screen = id;
    if (id === 'player') acquireWake(); else releaseWake();
  }

  async function route() {
    const m = /^#\/(play|edit)\/([^/]+)(?:\/(\d+))?$/.exec(location.hash);
    if (screen === 'player' && !(m && m[1] === 'play')) window.FlowPlayer.close();
    if (screen === 'editor' && !(m && m[1] === 'edit')) window.FlowEditor.close();
    if (isOnline()) fromOnline = true;
    else if (!m && fromOnline && screen === 'player') { location.replace('#/online'); return; }
    else if (!m) fromOnline = false;
    if (!m) { show('library'); await renderLibrary(); return; }
    const rec = await DB.get(m[2]);
    if (!rec) { location.hash = '#/'; return; }
    if (m[1] === 'edit') {
      if (!canBuild()) {
        // A phone, or an iPad held upright: a page that says where to build, and offers to play.
        const upright = ipad();
        $('#nobuild-title').textContent = upright ? 'Turn your iPad sideways' : 'The builder needs a bigger screen';
        $('#nobuild-text').textContent = upright ? 'The builder opens on an iPad held sideways, or on a computer. It opens by itself as you turn it.' : 'Shape the timing of your Ballade on a computer, or on an iPad held sideways. Here, you can play it.';
        $('#nobuild-play').onclick = () => { location.hash = `#/play/${rec.uid}`; };
        show('nobuild');
        return;
      }
      show('editor');
      await window.FlowEditor.open(rec, { chapter: Number(m[3] || 0), onLeave: () => { location.hash = '#/'; }, onPlay: (ch) => { location.hash = `#/play/${rec.uid}/${ch}`; } });
    } else {
      opened(rec.uid);
      if (screen === 'player' && window.FlowPlayer.isOpen()) return;
      show('player');
      const title = rec.story.title || 'Story';
      const t0 = Date.now();
      busy('Opening the story', title, 0);
      try {
        await window.FlowPlayer.open(rec, Number(m[3] || 0), { onLeave: () => { location.hash = '#/'; },
          onProgress: (n, t) => busy('Opening the story', t ? `${title}, ${n} of ${t} sounds` : title, t ? n / t : 1) });
        await new Promise((res) => setTimeout(res, Math.max(0, 700 - (Date.now() - t0))));
      } finally { idle(); }
    }
  }

  /* ================= Wiring ================= */
  function wire() {
    $('#help').innerHTML = window.FlowUI.svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6M12 17v.5"/>', 19);
    document.querySelectorAll('[data-action="settings"]').forEach((b) => { b.innerHTML = ICON.gear; b.addEventListener('click', openSettings); });
    document.querySelectorAll('.set-head .ico, [data-action="close-sheet"]').forEach((b) => { b.innerHTML = ICON.close; });
    $('[data-action="close-sheet"]').addEventListener('click', () => $('#sheet').close());
    document.querySelectorAll('.i-import').forEach((s) => { s.outerHTML = ICON.import; });
    $('[data-action="add-story"]').innerHTML = ICON.plus;
    $('[data-action="add-story"]').addEventListener('click', openAddStory);
    document.querySelectorAll('[data-bm="new"], [data-bm="open"]').forEach((b) => b.addEventListener('click', pickFile));
    $('#pick-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importFile(f); });
    // A file dropped anywhere on the library (computer).
    $('#library').addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    $('#library').addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); importFile(f); } });
    window.FlowPlayer.wire();
    window.FlowEditor.wire();
    window.addEventListener('hashchange', route);
    $('#nobuild-back').addEventListener('click', () => { location.hash = '#/'; });
    // An iPad turned sideways on the fallback page opens the builder.
    matchMedia('(orientation: landscape)').addEventListener('change', () => { if (screen === 'nobuild' && canBuild()) route(); });
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (settings.mode === 'system') applyTheme(); });
    // Space pauses at the table on a computer.
    document.addEventListener('keydown', (e) => {
      if (screen === 'player' && e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); window.FlowPlayer.togglePause(); }
    });
  }

  async function boot() {
    applyTheme();
    // In a browser tab on an iPhone, or on another device, the page only shows how to install it.
    if (!document.documentElement.classList.contains('mode-app')) return;
    applyAudioSession();
    wire();
    buildSettings();
    window.FlowApp = { wake: acquireWake };
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    try { await DB.open(); DB.persistence().catch(() => {}); } catch (e) {
      document.body.append(el('p', 'fatal', `Troubadour Ballade cannot reach its storage here (${e.message || e}).`));
      return;
    }
    await route();
  }
  boot();
})();
