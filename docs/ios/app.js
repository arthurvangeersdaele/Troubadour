/* Troubadour for iPhone.
 * A Home Screen web app that follows the Android app: a library of stories kept on the phone (IndexedDB),
 * a story editor (chapters, Music / Ambiances / Events, the story's soundbox), the live mixing table,
 * a shared soundbox, settings, and .troubadour import and export (the format of TROUBADOUR_FORMAT.md).
 */
(() => {
  'use strict';

  const VERSION = '261023.2';
  const root = document.documentElement;
  if (!root.classList.contains('mode-app')) {
    // In a browser tab or on another device the page only shows its notice: register nothing, store nothing.
    return;
  }

  const $ = (s) => document.querySelector(s);
  // The device the app runs on, for its texts: iPhone, iPad or tablet (Android).
  const DEV = window.TROUBADOUR_DEVICE || 'iPhone';
  const IOS = DEV !== 'tablet';
  const DB = window.TroubadourDB;
  const FMT = window.Troubadour;
  const ZONES = [
    { id: 'music', label: 'Music', color: 'var(--music)', loop: 2, empty: 'No music in this chapter yet.', hint: 'Add music: one track plays at a time' },
    { id: 'ambience', label: 'Ambiances', color: 'var(--amb)', loop: 2, empty: 'No ambiances in this chapter yet.', hint: 'Add ambiances: rain, fire, crowds' },
    { id: 'events', label: 'Events', color: 'var(--evt)', loop: 0, empty: 'No events in this chapter yet.', hint: 'Add events: bells, roars, explosions' },
  ];
  const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));
  const SOUNDBOX_ZONE = { id: 'soundbox', label: 'Soundbox', color: 'var(--accent)', loop: 0, hint: 'Add quick effects: critical hits, level ups' };
  const LOOP_LABELS = ['1×', '2×', '∞'];
  const LOOP_NAMES = ['once', 'twice', 'infinite', 'random'];
  const LOOP_INDEX = { once: 0, twice: 1, infinite: 2, random: 3 };
    const WIDE = matchMedia('(min-width: 1181px)');

  const svg = (d, size = 18, fill = false) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`;
  const ICON = {
    back: svg('<path d="M15 18l-6-6 6-6"/>', 20),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 19),
    close: svg('<path d="M18 6L6 18M6 6l12 12"/>', 18),
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>', 16, true),
    pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>', 16, true),
    stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>', 14, true),
    random: svg('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>', 14),
    volDown: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 12h5"/>', 15),
    volUp: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 12h5M18.5 9.5v5"/>', 15),
    star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', 16),
    starFill: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', 16, true),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
    import: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>', 16),
    share: svg('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', 18),
    edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', 16),
    more: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', 18, true),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 16),
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>', 14),
    left: svg('<path d="M15 18l-6-6 6-6"/>', 14),
    right: svg('<path d="M9 18l6-6-6-6"/>', 14),
    up: svg('<path d="M18 15l-6-6-6 6"/>', 14),
    down: svg('<path d="M6 9l6 6 6-6"/>', 14),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', 18),
    book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>', 22),
    compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>', 22),
    files: svg('<path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>', 18),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16),
  };

  /* ================= Settings ================= */
  const KEY = 'troubadour.settings';
  const DEFAULTS = {
    theme: 'obsidian', mode: 'dark', fade: 2000, fadeIn: 1000, crossfade: true, silence: false, awake: true, silent: true,
    master: 0.8, sbVol: 0.8, sbOpen: null, pins: [], randomMax: 5, life: false, lifeEvery: 6,
    // Volume on the table cards, per row: 'hidden' (no control, narrowest cards), 'simple' (two buttons) or 'full' (a slider).
    vol: { music: 'hidden', ambience: 'hidden', events: 'hidden' },
    landscape: true,
  };
  const settings = Object.assign({}, DEFAULTS, readJSON(KEY));
  settings.vol = Object.assign({}, DEFAULTS.vol, settings.vol || {});
  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage full */ } }

  const lightQuery = matchMedia('(prefers-color-scheme: light)');
  function applyTheme() {
    const mode = settings.mode === 'system' ? (lightQuery.matches ? 'light' : 'dark') : settings.mode;
    root.dataset.theme = TroubadourThemes.resolve(settings.theme);
    root.dataset.mode = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bar').trim();
    document.querySelectorAll('.swatch').forEach((s) => { s.dataset.mode = mode; });
  }
  lightQuery.addEventListener?.('change', () => settings.mode === 'system' && applyTheme());

  /* ================= Small helpers ================= */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(cls, html, label, onClick) {
    const b = el('button', cls);
    b.type = 'button';
    b.innerHTML = html;
    if (label) { b.setAttribute('aria-label', label); b.title = label; }
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function setP(input) { input.style.setProperty('--p', `${(input.value - input.min) / (input.max - input.min) * 100}%`); }
  function fmt(s) { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  const size = (b) => FMT.formatSize(b || 0);
  const plural = (n, w, many) => `${n} ${n === 1 ? w : (many || `${w}s`)}`;
  function yymmdd(d = new Date()) {
    return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  const debounce = (fn, ms) => { let t = 0; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); fn(); }; return d; };

  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function busy(title, step = '', frac = null) {
    $('#busy').hidden = false;
    $('#busy-title').textContent = title;
    $('#busy-step').textContent = step;
    const bar = $('#busy-bar');
    bar.parentNode.hidden = frac == null;
    if (frac != null) bar.style.width = `${Math.round(frac * 100)}%`;
  }
  function idle() { $('#busy').hidden = true; }

  /** A small question: resolves with the value of the button tapped (null when dismissed).
   *  With `input`, resolves with { value, text }. */
  function ask(title, text, buttons, input) {
    const dlg = $('#ask');
    $('#ask-title').textContent = title;
    $('#ask-text').textContent = text || '';
    $('#ask-text').hidden = !text;
    const acts = $('#ask-acts');
    acts.textContent = '';
    let field = null;
    if (input) {
      field = el('input', 'ask-input');
      field.type = 'text';
      field.value = input.value || '';
      field.placeholder = input.placeholder || '';
      field.maxLength = input.max || 120;
      field.setAttribute('enterkeyhint', 'done');
      acts.before(field);
    }
    return new Promise((resolve) => {
      let answered = false;
      const finish = (v) => {
        if (answered) return;
        answered = true;
        if (field) field.remove();
        if (dlg.open) dlg.close();
        resolve(input ? (v == null ? null : { value: v, text: field.value.trim() }) : v);
      };
      buttons.forEach((b) => {
        const x = el('button', `btn ${b.cls || ''}`, b.label);
        x.type = 'button';
        x.onclick = () => finish(b.value);
        acts.append(x);
      });
      if (field) field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(buttons[buttons.length - 1].value); } });
      dlg.addEventListener('close', () => finish(null), { once: true });
      dlg.showModal();
      if (field) setTimeout(() => field.focus(), 50);
    });
  }

  function openSheet(title) {
    $('#sheet-title').textContent = title;
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = '';
    if (!$('#sheet').open) $('#sheet').showModal();
    return body;
  }
  function closeSheet() { if ($('#sheet').open) $('#sheet').close(); }

  /** Duration of an audio blob in seconds, or null. */
  function probeDuration(blob) {
    return new Promise((ok) => {
      const url = URL.createObjectURL(blob);
      const a = new Audio();
      let t = 0;
      const end = (v) => { clearTimeout(t); URL.revokeObjectURL(url); a.removeAttribute('src'); ok(v); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => end(isFinite(a.duration) && a.duration > 0 ? a.duration : null);
      a.onerror = () => end(null);
      t = setTimeout(() => end(null), 4000);
      a.src = url;
      a.load();
    });
  }

  async function download(file, onBytes, signal) {
    const res = await fetch(file, { signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(`Download failed (${res.status}).`);
    const type = res.headers.get('content-type') || 'audio/mpeg';
    if (!res.body || !res.body.getReader) { const b = await res.blob(); onBytes && onBytes(b.size); return b; }
    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      onBytes && onBytes(value.byteLength);
    }
    return new Blob(chunks, { type });
  }

  /* ================= Library data ================= */
  let STORIES = [];           // every story, newest first
  let SHARED = [];            // shared soundbox sounds
  let SIZES = new Map();      // blob key -> bytes

  async function refresh() {
    // Sizes come from the sounds themselves: reading every stored blob just to measure it froze Safari.
    [STORIES, SHARED, RECENT] = await Promise.all([DB.listStories(), DB.getKV('soundbox', []), DB.getKV('recent', {})]);
    RECENT = RECENT || {};
    await settleLibrary();
    SIZES = new Map();
    STORIES.forEach((st) => DB.soundsOf(st).forEach((s) => { if (s.size && !SIZES.has(s.blob)) SIZES.set(s.blob, s.size); }));
    SHARED.forEach((s) => { if (s.size && !SIZES.has(s.blob)) SIZES.set(s.blob, s.size); });
  }
  function storyBytes(story) {
    const seen = new Set();
    let n = 0;
    DB.soundsOf(story).forEach((s) => { if (!seen.has(s.blob)) { seen.add(s.blob); n += SIZES.get(s.blob) || s.size || 0; } });
    return n;
  }
  function soundCount(story) { return DB.soundsOf(story).length; }

  function newSound(blobKey, name, fileName, sizeBytes, loop, duration) {
    return { uid: DB.uid(), name: (name || 'Sound').slice(0, 80), blob: blobKey, fileName: fileName || 'sound.mp3', size: sizeBytes || 0, loop, volume: 0.75, duration: duration || null, extra: {} };
  }
  const cleanName = (fileName) => (fileName || 'Sound').replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[\s._-]+/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()) || 'Sound';

  /** The story object on screen when there is one (so edits never race the database), else the stored one. */
  let lastTableStory = null;
  async function liveStory(uid) {
    if (ed && ed.story.uid === uid) return ed.story;
    if (tbl && tbl.story.uid === uid) return tbl.story;
    if (lastTableStory && lastTableStory.uid === uid) return lastTableStory;
    return DB.getStory(uid);
  }

  /* ================= Routing ================= */
  let screen = null;
  function show(id) {
    ['library', 'sbx', 'editor', 'table'].forEach((s) => { $(`#${s}`).hidden = s !== id; });
    screen = id;
  }

  async function route() {
    const h = location.hash || '#/';
    let m;
    if ((m = h.match(/^#\/play\/([^/]+)(?:\/(\d+))?/))) {
      const s = await liveStory(decodeURIComponent(m[1]));
      if (!s) { location.replace('#/'); return; }
      leaveEditor();
      openTable(s, Math.max(0, parseInt(m[2] || '1', 10) - 1));
      return;
    }
    const leaving = !!tbl;
    if (leaving) {
      // Leaving the table: show a short loading screen while the sounds are let go, instead of a frozen page.
      busy('Closing the table', tbl.story.title);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
      closeTable();
    }
    try { await routeRest(h); } finally { if (leaving) setTimeout(idle, 150); }
  }

  async function routeRest(h) {
    let m;
    if ((m = h.match(/^#\/edit\/([^/]+)(?:\/(\d+|soundbox))?/))) {
      const s = await liveStory(decodeURIComponent(m[1]));
      if (!s) { location.replace('#/'); return; }
      openEditor(s, m[2] === 'soundbox' ? 'soundbox' : Math.max(0, parseInt(m[2] || '1', 10) - 1));
      return;
    }
    leaveEditor();
    await refresh();
    if (h.startsWith('#/soundbox')) { show('sbx'); renderShared(); document.title = 'Soundbox | Troubadour'; }
    else { show('library'); renderLibrary(); document.title = 'Troubadour'; }
    releaseWake();
  }

  /* ================= Library screen ================= */
  // Layout B: the story played last (or added last) in big, on its cover, ready to resume; the others in a list.
  let RECENT = {};            // story uid -> { at: ms, ch: chapter index or null when never played }
  const recentSave = debounce(() => DB.setKV('recent', RECENT).catch(() => {}), 600);
  function markRecent(uid, ch) {
    RECENT[uid] = { at: Date.now(), ch };
    recentSave();
  }
  function storyKey(s) {
    if (s.id) return s.id;
    if ((s.source || '').startsWith('discovery:')) return s.source.slice(10);
    return s.uid;
  }
  function lookOf(s) { return TroubadourCover.look(storyKey(s), s.extra && s.extra.cover); }
  function sourceLabel(s) {
    const src = s.source || '';
    if (src.startsWith('discovery')) return 'Discovery';
    if (src === 'import') return 'Imported';
    return 'Your story';
  }
  /** Every story gets its cover once and keeps it (it travels in its .troubadour), and a place in the recent list
   * (the order of the library, nothing more):
   * a story never seen here counts as just opened, so a story just added comes first. */
  async function settleLibrary() {
    let changed = false;
    const keep = new Set();
    for (const s of STORIES) {
      keep.add(s.uid);
      if (!RECENT[s.uid]) { RECENT[s.uid] = { at: Date.parse(s.updated || '') || Date.now(), ch: null }; changed = true; }
      const lk = lookOf(s);
      const c = s.extra && s.extra.cover;
      if (!c || c.kind !== lk.kind || c.tint !== lk.tint) {
        s.extra = Object.assign({}, s.extra || {}, { cover: TroubadourCover.stored(lk) });
        try { await DB.putStory(s, false); } catch (e) { /* kept for this session only */ }
      }
    }
    Object.keys(RECENT).forEach((k) => { if (!keep.has(k)) { delete RECENT[k]; changed = true; } });
    if (changed) await DB.setKV('recent', RECENT).catch(() => {});
  }
  function byRecent() {
    const at = (s) => (RECENT[s.uid] && RECENT[s.uid].at) || 0;
    return STORIES.slice().sort((a, b) => at(b) - at(a));
  }
  function playAt(s, ch) { audio(); location.hash = `#/play/${encodeURIComponent(s.uid)}/${(ch || 0) + 1}`; }

  function renderLibrary() {
    const grid = $('#story-grid');
    grid.textContent = '';
    if (!STORIES.length) {
      const hello = el('div', 'hello');
      hello.innerHTML = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';
      hello.append(el('h1', '', 'Your table awaits'), el('p', 'lead', 'Rhythm a story with your own sounds, import a .troubadour file, or start from a tale of La Troupe.'));
      grid.append(hello, el('h3', 'lib-h', 'Add a story'));
      const doors = el('div', 'lib-doors');
      doors.append(...addDoors());
      grid.append(doors);
      return;
    }
    const [first, ...rest] = byRecent();
    const wrap = el('div', 'lib-b');
    wrap.append(heroCard(first));
    const list = el('div', 'lib-list');
    list.append(el('h3', 'lib-h', rest.length ? 'All stories' : 'Your library'));
    rest.forEach((s) => list.append(storyRow(s)));
    const add = el('button', 'srow add');
    add.type = 'button';
    add.innerHTML = `<span class="add-i">${ICON.plus}</span>`;
    const at = el('span', 'stxt');
    at.append(el('b', '', 'Add a story'), el('span', 'meta', 'New, Discovery, Recueil or a .troubadour file'));
    add.append(at);
    add.onclick = () => openAddStory();
    list.append(add);
    wrap.append(list);
    grid.append(wrap);
  }

  function heroCard(s) {
    const lk = lookOf(s);
    const r = RECENT[s.uid] || {};
    const c = el('section', 'hero');
    c.style.setProperty('--c', TroubadourCover.tintCss(lk.tint));
    c.append(TroubadourCover.element(lk, false));
    const inner = el('div', 'hero-in');
    const kick = el('div', 'hero-kick');
    kick.append(el('span', 'tag', sourceLabel(s)), el('span', 'kick', r.ch != null ? 'Last opened' : 'Just added'));
    inner.append(kick, el('h2', '', s.title || 'Untitled story'));
    if (s.description) inner.append(el('p', 'hero-sub clamp', s.description));
    inner.append(el('p', 'hero-meta', `${plural(s.chapters.length, 'chapter')}, ${plural(soundCount(s), 'sound')}, ${size(storyBytes(s))}`));
    inner.append(el('span', 'grow'));
    const acts = el('div', 'hero-acts');
    if (s.damaged) acts.append(btn('hb primary', '<span>Repair the sounds</span>', null, () => repairStory(s)));
    else acts.append(btn('hb primary', `${ICON.play}<span>Play</span>`, null, () => playAt(s, 0)));
    acts.append(btn('hb more', ICON.more, `More: ${s.title}`, () => storyMenu(s)));
    inner.append(acts);
    c.append(inner);
    return c;
  }

  function storyRow(s) {
    const lk = lookOf(s);
    const row = el('div', 'srow');
    row.style.setProperty('--c', TroubadourCover.tintCss(lk.tint));
    const art = TroubadourCover.element(lk, false);
    const txt = el('div', 'stxt');
    txt.append(el('b', '', s.title || 'Untitled story'), el('span', 'meta', `${sourceLabel(s)}, ${plural(s.chapters.length, 'chapter')}, ${plural(soundCount(s), 'sound')}`));
    row.append(art, txt, btn('more', ICON.more, `More: ${s.title}`, () => storyMenu(s)));
    if (s.damaged) row.append(btn('btn slim repair', '<span>Repair</span>', null, () => repairStory(s)));
    else row.append(btn('go', ICON.play, `Play ${s.title}`, () => playAt(s, 0)));
    return row;
  }

  /** Behind the ⋯ of a story: edit, export, delete. */
  function storyMenu(s) {
    const body = openSheet(s.title || 'Untitled story');
    const by = [];
    if (s.bard) by.push(`by ${s.bard}`);
    if (s.revision) by.push(`revision ${s.revision}`);
    body.append(el('p', 'menu-by', [sourceLabel(s), ...by].join(', ')));
    const list = el('div', 'story-menu');
    const go = (fn) => () => { closeSheet(); fn(); };
    const chs = el('ol', 'menu-chs');
    s.chapters.forEach((ch, i) => {
      const li = el('li');
      li.append(btn('chap-go', `<span class="n">${i + 1}</span><span>${(ch.title || 'Untitled chapter').replace(/[<&]/g, (x) => (x === '<' ? '&lt;' : '&amp;'))}</span>`, `Play chapter ${i + 1}`, go(() => playAt(s, i))));
      chs.append(li);
    });
    list.append(
      btn('btn', `${ICON.edit}<span>Edit</span>`, null, go(() => { location.hash = `#/edit/${encodeURIComponent(s.uid)}/1`; })),
      btn('btn', `${ICON.share}<span>Export</span>`, null, go(() => exportStories([s]))),
      btn('btn danger', `${ICON.trash}<span>Delete</span>`, null, go(() => deleteStory(s))),
    );
    body.append(chs, list);
  }

  /** The four ways to add a story: shown on the library, and behind the + of the top bar. */
  function addDoors(then = () => {}) {
    const go = (fn) => () => { then(); fn(); };
    return [
      door('new', ICON.plus, 'New story', 'With your own sounds, from Files', go(() => newStory())),
      door('discovery', ICON.compass, 'Discovery', 'Three ready stories, sounds included', go(() => openDiscovery())),
      door('recueil', ICON.book, 'The Recueil', 'Tales rhythmed by other troubadours', go(() => openRecueil())),
      door('import', ICON.files, 'Import .troubadour', 'From Files, iCloud Drive or AirDrop', go(() => pickTroubadour())),
    ];
  }
  function openAddStory() {
    const body = openSheet('Add a story');
    const doors = el('div', 'lib-doors add-doors');
    doors.append(...addDoors(() => closeSheet()));
    body.append(doors);
  }

  function door(kind, icon, title, text, onClick) {
    const d = el('button', `ldoor d-${kind}`);
    d.type = 'button';
    d.innerHTML = `<span class="di">${icon}</span>`;
    d.append(el('b', '', title), el('span', '', text));
    d.onclick = onClick;
    return d;
  }

  async function newStory() {
    const a = await ask('New story', 'Give your story a name. You can change it later.', [
      { label: 'Cancel', value: null }, { label: 'Create', value: 'ok', cls: 'primary' },
    ], { placeholder: 'The Drowned Abbey', max: 120 });
    if (!a || !a.value) return;
    const story = {
      uid: DB.uid(), id: null, revision: 0, created: null, bard: '', title: a.text || 'Untitled story', description: '', extra: {},
      chapters: [{ uid: DB.uid(), title: 'Chapter 1', extra: {}, music: [], ambience: [], events: [] }], soundbox: [], source: 'new',
    };
    await DB.putStory(story);
    location.hash = `#/edit/${encodeURIComponent(story.uid)}/1`;
  }

  async function deleteStory(s) {
    const n = soundCount(s);
    const v = await ask(`Delete “${s.title}”?`, `Its ${plural(s.chapters.length, 'chapter')} and ${plural(n, 'sound')} leave this ${DEV}. Export it first if you want to keep a copy.`, [
      { label: 'Cancel', value: null }, { label: 'Delete', value: 'del', cls: 'danger' },
    ]);
    if (v !== 'del') return;
    await DB.deleteStory(s.uid);
    if (lastTableStory && lastTableStory.uid === s.uid) lastTableStory = null;
    settings.pins = settings.pins.filter((p) => !DB.soundsOf(s).some((x) => x.uid === p));
    save();
    await refresh();
    renderLibrary();
    toast(`“${s.title}” deleted.`);
  }

  /* ================= Import ================= */
  function pickTroubadour() { $('#pick-troubadour').click(); }
  $('#pick-troubadour').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/\.(troubadour|bardic|zip)$/i.test(f.name)) {
      toast('Choose a .troubadour file.');
      return;
    }
    const r = repairUid;
    repairUid = null;
    await importFile(f, f.name, r);
  });

  async function importFile(blob, label, repairUid = null) {
    try {
      busy('Opening the tale', label, 0);
      const d = await FMT.unpack(blob, (done, total) => busy('Opening the tale', `Reading sound ${done} of ${total}`, done / total));
      idle();
      const added = await importDraft(d, {}, repairUid);
      if (added && repairUid) { await DB.collect(); toast(`“${added.title}” is repaired.`); }
      if (added) { await refresh(); if (screen === 'library') renderLibrary(); toast(`“${added.title}” is on your table.`); }
      return added;
    } catch (err) {
      idle();
      await ask('This file could not be opened', err.message || String(err), [{ label: 'OK', value: 'ok', cls: 'primary' }]);
      return null;
    }
  }

  /** Stores an unpacked .troubadour draft (see troubadour-format.js unpack). Asks before replacing a story it already has. */
  async function importDraft(d, extra = {}, repairUid = null) {
    if (!d.chapters.length) throw new Error('This tale has no chapter.');
    const stories = await DB.listStories();
    const twin = stories.find((s) => s.id && s.id === d.id);
    let uid = DB.uid();
    let id = d.id;
    if (repairUid) {
      uid = repairUid; // repairing a damaged story: replace it without asking
    } else if (twin) {
      const newer = d.revision > (twin.revision || 0);
      const v = await ask(`You already have “${twin.title}”`, newer
        ? `Yours is revision ${twin.revision}, this file is revision ${d.revision}. Replace yours with it?`
        : `Yours is revision ${twin.revision}, this file is revision ${d.revision}, not newer. Replace yours anyway, or keep both?`, [
        { label: 'Cancel', value: null }, { label: 'Keep both', value: 'both' }, { label: 'Replace', value: 'replace', cls: 'primary' },
      ]);
      if (!v) return null;
      if (v === 'replace') uid = twin.uid;
      else id = null; // the copy becomes a story of its own, with a new id at its next export
    }
    const total = d.chapters.reduce((a, c) => a + DB.ZONES.reduce((b, z) => b + c[z].length, 0), 0) + d.soundbox.length;
    let n = 0;
    const store = async (s) => {
      busy('Storing the sounds', `${++n} of ${total}`, n / Math.max(1, total));
      const key = await DB.putBlob(s.blob);
      const out = newSound(key, s.name, s.fileName, s.blob.size, s.loop, s.duration);
      out.volume = typeof s.volume === 'number' ? s.volume : 0.75;
      out.extra = s.extra || {};
      return out;
    };
    try {
      const chapters = [];
      for (const c of d.chapters) {
        const ch = { uid: DB.uid(), title: c.title || `Chapter ${chapters.length + 1}`, extra: c.extra || {}, music: [], ambience: [], events: [] };
        for (const z of DB.ZONES) for (const s of c[z]) ch[z].push(await store(s));
        chapters.push(ch);
      }
      const soundbox = [];
      for (const s of d.soundbox) soundbox.push(await store(s));
      const story = Object.assign({
        audioChecked: true, damaged: false,
        uid, id, revision: id ? d.revision : 0, created: id ? d.created : null, bard: d.bard || '',
        title: d.title || 'Untitled tale', description: d.description || '', extra: d.extra || {}, chapters, soundbox, source: 'import',
      }, extra);
      await DB.putStory(story);
      if (twin && uid === twin.uid) await DB.collect();
      idle();
      return story;
    } catch (err) {
      idle();
      await DB.collect().catch(() => {});
      throw quotaMessage(err);
    }
  }

  function quotaMessage(err) {
    if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''))) {
      return new Error(`Your ${DEV} has no room left for these sounds. Free some space, or delete a story you no longer play.`);
    }
    return err;
  }

  /* ---------- Repairing stories imported before 261016.2 ---------- */
  // A sound stored by those versions may give back the start of its .troubadour archive: its first bytes are then
  // the ZIP signature "PK\x03\x04" instead of audio. Each story is checked once, by reading 4 bytes per sound.
  async function scanDamage() {
    let found = false;
    for (const s of await DB.listStories()) {
      if (s.audioChecked) continue;
      let bad = false;
      for (const x of DB.soundsOf(s)) {
        try {
          const b = await DB.getBlob(x.blob);
          if (!b) continue;
          const h = new Uint8Array(await b.slice(0, 4).arrayBuffer());
          if (h[0] === 0x50 && h[1] === 0x4B && h[2] === 0x03 && h[3] === 0x04) { bad = true; break; }
        } catch (e) { /* unreadable: leave it */ }
      }
      s.audioChecked = true;
      s.damaged = bad;
      found = found || bad;
      await DB.putStory(s, false);
    }
    if (found) { await refresh(); if (screen === 'library') renderLibrary(); }
  }

  let repairUid = null;
  async function repairStory(s) {
    // A tale of the Recueil downloads again by itself; any other story needs its .troubadour file.
    let tale = null;
    if (s.id) {
      try {
        const data = await fetch('../recueil/index.json', { cache: 'no-cache' }).then((r) => r.json());
        tale = (data.tales || []).find((t) => t.id === s.id) || null;
      } catch (e) { /* offline */ }
    }
    const v = await ask(`Repair “${s.title}”`, tale
      ? `An older version of Troubadour stored its sounds wrongly: they all play the first sound. Troubadour downloads this tale from the Recueil again. Changes you made to it on this ${DEV} are lost.`
      : `An older version of Troubadour stored its sounds wrongly: they all play the first sound. Choose its .troubadour file again (from Files or iCloud Drive) to repair it. Changes you made to it on this ${DEV} are lost.`, [
      { label: 'Cancel', value: null }, { label: tale ? 'Download again' : 'Choose the file', value: 'go', cls: 'primary' },
    ]);
    if (!v) return;
    if (tale) {
      try {
        let got = 0;
        busy('Fetching the tale', tale.title, 0);
        const blob = await download(`../recueil/${encodeURIComponent(tale.file)}`, (n) => { got += n; busy('Fetching the tale', `${tale.title}, ${size(got)}`, tale.size ? Math.min(1, got / tale.size) : null); });
        await importFile(blob, tale.title, s.uid);
      } catch (e) {
        idle();
        ask('The tale could not be downloaded', 'Check your connection and try again.', [{ label: 'OK', value: 'ok', cls: 'primary' }]);
      }
      return;
    }
    repairUid = s.uid;
    pickTroubadour();
  }

  /* ---------- The Recueil ---------- */
  async function openRecueil() {
    const body = openSheet('The Recueil');
    body.className = 'rec-sheet';
    body.append(el('p', 'muted', `Tales rhythmed by La Troupe. Adding one downloads it to your ${DEV}, sounds included: it then plays without a connection.`));
    const list = el('div', 'rlist');
    list.append(el('p', 'muted', 'Fetching the Recueil…'));
    body.append(list);
    let data;
    try {
      data = await fetch('../recueil/index.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    } catch (e) {
      list.textContent = '';
      list.append(el('p', 'muted', `The Recueil needs a connection. Try again once your ${DEV} is online.`));
      return;
    }
    await refresh();
    const tales = (data.tales || []).slice().sort((a, b) => a.title.localeCompare(b.title));
    list.textContent = '';
    if (!tales.length) list.append(el('p', 'muted', 'The Recueil is empty for now.'));
    tales.forEach((t) => {
      const row = el('div', 'rrow');
      const txt = el('div', 'rt');
      txt.append(el('b', '', t.title));
      const by = [t.bard ? `by ${t.bard}` : null, plural((t.chapters || []).length, 'chapter'), t.sounds ? plural(t.sounds, 'sound') : null, t.size ? size(t.size) : null].filter(Boolean).join(', ');
      txt.append(el('small', '', by));
      if (t.description) txt.append(el('p', '', t.description));
      const have = STORIES.find((s) => s.id && s.id === t.id);
      const label = !have ? 'Add' : (t.revision > (have.revision || 0) ? 'Update' : 'Added');
      const b = btn(`btn ${label === 'Added' ? '' : 'primary'}`, label === 'Added' ? `${ICON.check}<span>Added</span>` : `<span>${label}</span>`, null, async () => {
        if (label === 'Added') { const v = await ask(`“${t.title}” is already on your table`, 'Download it again and replace yours?', [{ label: 'Cancel', value: null }, { label: 'Download again', value: 'go', cls: 'primary' }]); if (!v) return; }
        closeSheet();
        try {
          let got = 0;
          busy('Fetching the tale', t.title, 0);
          const blob = await download(`../recueil/${encodeURIComponent(t.file)}`, (n) => { got += n; busy('Fetching the tale', `${t.title}, ${size(got)}`, t.size ? Math.min(1, got / t.size) : null); });
          await importFile(blob, t.title);
        } catch (e) {
          idle();
          ask('The tale could not be downloaded', 'Check your connection and try again.', [{ label: 'OK', value: 'ok', cls: 'primary' }]);
        }
      });
      row.append(txt, b);
      list.append(row);
    });
  }

  /* ---------- Discovery stories (the web edition's three stories) ---------- */
  async function openDiscovery() {
    const body = openSheet('Discovery stories');
    body.append(el('p', 'muted', `The three stories of the web edition, with their sounds. Each one downloads once, then lives on your ${DEV} like any story you rhythm, ready to edit and play offline.`));
    const list = el('div', 'rlist');
    list.append(el('p', 'muted', 'Fetching the stories…'));
    body.append(list);
    let stories, library;
    try {
      [stories, library] = await Promise.all([
        fetch('../play/stories.json', { cache: 'no-cache' }).then((r) => r.json()),
        fetch('../play/library.json', { cache: 'no-cache' }).then((r) => r.json()),
      ]);
    } catch (e) {
      list.textContent = '';
      list.append(el('p', 'muted', `These stories need a connection to download. Try again once your ${DEV} is online.`));
      return;
    }
    await refresh();
    list.textContent = '';
    stories.stories.forEach((meta) => {
      const files = [];
      meta.chapters.forEach((c) => { const z = library.chapters[`${meta.id}/${c.id}`] || {}; DB.ZONES.forEach((k) => (z[k] || []).forEach((s) => files.push(s))); });
      if (!files.length) return;
      const bytes = files.reduce((a, s) => a + (s.size || 0), 0);
      const have = STORIES.find((s) => s.source === `discovery:${meta.id}`);
      const row = el('div', 'rrow');
      const txt = el('div', 'rt');
      txt.append(el('b', '', meta.title), el('small', '', `${plural(meta.chapters.length, 'chapter')}, ${plural(files.length, 'sound')}, ${size(bytes)}`));
      if (meta.blurb) txt.append(el('p', '', meta.blurb));
      const b = have
        ? btn('btn', `${ICON.check}<span>Added</span>`, null, () => { closeSheet(); location.hash = `#/edit/${encodeURIComponent(have.uid)}/1`; })
        : btn('btn primary', '<span>Add</span>', null, () => { closeSheet(); addDiscovery(meta, library); });
      row.append(txt, b);
      list.append(row);
    });
  }

  async function addDiscovery(meta, library) {
    const chapters = meta.chapters.map((c) => ({ uid: DB.uid(), title: c.title, extra: {}, music: [], ambience: [], events: [], src: library.chapters[`${meta.id}/${c.id}`] || {} }));
    const jobs = [];
    chapters.forEach((ch) => DB.ZONES.forEach((z) => (ch.src[z] || []).forEach((s) => jobs.push({ ch, z, s }))));
    const shared = await DB.getKV('soundbox', []);
    const sharedFiles = new Set(shared.map((x) => x.extra && x.extra.web));
    const sbJobs = (library.soundbox || []).filter((s) => !sharedFiles.has(s.file));
    const total = jobs.length + sbJobs.length;
    const totalBytes = jobs.concat(sbJobs.map((s) => ({ s }))).reduce((a, j) => a + (j.s.size || 0), 0) || 1;
    let doneBytes = 0, n = 0;
    try {
      const fetchOne = async (s) => {
        const blob = await download(`../play/${s.file}`, (b) => { doneBytes += b; busy(`Adding ${meta.title}`, `Sound ${n + 1} of ${total}, ${size(doneBytes)} of ${size(totalBytes)}`, doneBytes / totalBytes); });
        n += 1;
        return blob;
      };
      busy(`Adding ${meta.title}`, 'Starting', 0);
      for (const j of jobs) {
        const blob = await fetchOne(j.s);
        const key = await DB.putBlob(blob);
        const zone = ZONE[j.z];
        j.ch[j.z].push(newSound(key, j.s.name, j.s.file.split('/').pop(), blob.size, LOOP_NAMES[zone.loop], null));
      }
      for (const s of sbJobs) {
        const blob = await fetchOne(s);
        const key = await DB.putBlob(blob);
        const x = newSound(key, s.name, s.file.split('/').pop(), blob.size, 'once', null);
        x.extra = { web: s.file };
        shared.push(x);
      }
      chapters.forEach((c) => { delete c.src; });
      const story = {
        uid: DB.uid(), id: null, revision: 0, created: null, bard: 'Troubadour', title: meta.title, description: meta.blurb || '', extra: {},
        chapters, soundbox: [], source: `discovery:${meta.id}`,
      };
      await DB.setKV('soundbox', shared);
      await DB.putStory(story);
      idle();
      await refresh();
      renderLibrary();
      toast(`${meta.title} is on your table.`);
    } catch (err) {
      idle();
      await DB.collect().catch(() => {});
      const e = quotaMessage(err);
      ask('The story could not be added', e.message === err.message ? 'Check your connection and try again.' : e.message, [{ label: 'OK', value: 'ok', cls: 'primary' }]);
    }
  }

  /* ================= Export ================= */
  /** The bard name that signs exports: registered with GitHub in Settings, else Forgotten Barde. */
  async function ensureBard() {
    return window.Troubadour.bardName();
  }

  async function draftOf(story) {
    const conv = async (s) => {
      const blob = await DB.getBlob(s.blob);
      if (!blob) throw new Error(`The sound “${s.name}” is missing from this ${DEV}.`);
      return { name: s.name, blob, fileName: s.fileName || `${FMT.slug(s.name, 'sound')}.mp3`, loop: s.loop, volume: s.volume, duration: s.duration, extra: s.extra || {} };
    };
    const chapters = [];
    for (const c of story.chapters) {
      const ch = { title: c.title, extra: c.extra || {} };
      for (const z of DB.ZONES) { ch[z] = []; for (const s of c[z]) ch[z].push(await conv(s)); }
      chapters.push(ch);
    }
    const soundbox = [];
    for (const s of story.soundbox) soundbox.push(await conv(s));
    return { id: story.id, revision: story.revision || 0, created: story.created, title: story.title, description: story.description, extra: story.extra || {}, chapters, soundbox };
  }

  /** Forges each story as its next revision, then offers the share sheet (it needs a fresh tap on iPhone). */
  async function exportStories(list) {
    if (!list.length) { toast('No story to export yet.'); return; }
    const bard = await ensureBard();
    if (!bard) return;
    const files = [];
    try {
      for (let i = 0; i < list.length; i++) {
        if (ed && ed.story.uid === list[i].uid) saveSoon.flush();
        const story = (await liveStory(list[i].uid)) || list[i];
        const label = list.length > 1 ? `${story.title} (${i + 1} of ${list.length})` : story.title;
        busy('Rhythming the .troubadour', label, 0);
        const draft = await draftOf(story);
        const errors = FMT.validate(draft, bard);
        if (errors.length) { idle(); await ask(`“${story.title}” cannot be exported yet`, errors.join(' '), [{ label: 'OK', value: 'ok', cls: 'primary' }]); continue; }
        const out = await FMT.pack(draft, bard, (f) => busy('Rhythming the .troubadour', label, f), { generator: `Troubadour web app (${DEV}) ${VERSION}` });
        story.id = out.story.id;
        story.revision = out.story.revision;
        story.created = out.story.created;
        story.bard = bard;
        await DB.putStory(story, false);
        files.push(new File([out.blob], `${yymmdd()}_${FMT.slug(story.title, 'story')}.troubadour`, { type: 'application/octet-stream' }));
      }
    } catch (err) {
      idle();
      await ask('The export stopped', (quotaMessage(err).message) || String(err), [{ label: 'OK', value: 'ok', cls: 'primary' }]);
      return;
    }
    idle();
    if (!files.length) return;
    await refresh();
    if (screen === 'library') renderLibrary();
    offerFiles(files);
  }

  function offerFiles(files) {
    const body = openSheet(files.length > 1 ? `${files.length} stories rhythmed` : 'Your .troubadour is ready');
    const total = files.reduce((a, f) => a + f.size, 0);
    body.append(el('p', 'muted', `${files.map((f) => f.name).join(', ')} (${size(total)}). Save it to Files or iCloud Drive as a backup, or AirDrop it to another troubadour.`));
    if (files.some((f) => f.size > FMT.SHARE_LIMIT)) body.append(el('p', 'warn', 'Over 100 MB: fine for a backup or AirDrop, too big for the Recueil.'));
    const acts = el('div', 'set-acts');
    const canShare = navigator.canShare && navigator.canShare({ files });
    if (canShare) {
      acts.append(btn('btn primary', `${ICON.share}<span>Share or save</span>`, null, async () => {
        try { await navigator.share({ files, title: files.length > 1 ? 'Troubadour stories' : files[0].name }); closeSheet(); }
        catch (e) { if (e.name !== 'AbortError') toast('Sharing did not work. Try Download.'); }
      }));
    }
    files.forEach((f) => {
      const a = el('a', `btn ${canShare ? '' : 'primary'}`, files.length > 1 ? f.name : 'Download');
      const url = URL.createObjectURL(f);
      a.href = url;
      a.download = f.name;
      $('#sheet').addEventListener('close', () => setTimeout(() => URL.revokeObjectURL(url), 60000), { once: true });
      acts.append(a);
    });
    body.append(acts);
  }

  /* ================= Story editor ================= */
  let ed = null; // { story, ch: index | 'soundbox' }
  const saveSoon = debounce(async () => {
    if (!ed) return;
    try { await DB.putStory(ed.story); $('#ed-saved').textContent = 'Saved'; }
    catch (e) { $('#ed-saved').textContent = 'Not saved'; toast(quotaMessage(e).message); }
  }, 500);
  function openEditor(story, ch) {
    const fresh = !ed || ed.story.uid !== story.uid;
    if (fresh) { stopPreview(); ed = { story, ch: 0 }; forgeTip(); }
    ed.ch = ch === 'soundbox' ? 'soundbox' : Math.min(ch, story.chapters.length - 1);
    show('editor');
    document.title = `${story.title} | Troubadour`;
    const t = $('#ed-title');
    if (document.activeElement !== t) t.value = story.title;
    $('#ed-saved').textContent = '';
    renderEdRail();
    renderEdMain();
    acquireWake();
  }
  /* On a phone or a tablet, building a story is easier in the website's Story builder: say so on entering the editor. */
  const tipShown = new Set();
  async function forgeTip() {
    // Once per story each time the app opens (not again when coming back from the table).
    if (settings.noForgeTip || !ed || tipShown.has(ed.story.uid)) return;
    tipShown.add(ed.story.uid);
    const v = await ask('Rhythming a story?', 'For creating a story, the Story builder of the Troubadour website, on a computer, is the most comfortable: room for every chapter and your MP3s dropped in with the mouse. Rhythm it there, then import the .troubadour here. The editor of this app is made for quick changes.', [
      { label: 'Do not show again', value: 'never' }, { label: 'Got it', value: 'ok', cls: 'primary' },
    ]);
    if (v === 'never') { settings.noForgeTip = true; save(); }
  }

  function leaveEditor() {
    if (!ed) return;
    saveSoon.flush();
    stopPreview();
    ed = null;
  }
  function goEd(ch) {
    if (!ed) return;
    history.replaceState(null, '', `#/edit/${encodeURIComponent(ed.story.uid)}/${ch === 'soundbox' ? 'soundbox' : ch + 1}`);
    openEditor(ed.story, ch);
  }

  $('#ed-title').addEventListener('input', (e) => { if (!ed) return; ed.story.title = e.target.value.slice(0, 120) || ''; dirty(); });
  $('#ed-title').addEventListener('blur', (e) => { if (ed && !ed.story.title.trim()) { ed.story.title = 'Untitled story'; e.target.value = ed.story.title; dirty(); } });
  $('#ed-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  function renderEdRail() {
    const rail = $('#ed-rail');
    rail.textContent = '';
    rail.append(el('h3', '', 'Chapters'));
    ed.story.chapters.forEach((c, i) => {
      const count = DB.ZONES.reduce((a, z) => a + c[z].length, 0);
      const b = el('div', 'chap');
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.setAttribute('aria-current', String(ed.ch === i));
      const t = el('span', 't');
      t.append(el('span', '', c.title || `Chapter ${i + 1}`), el('div', 'cnt', plural(count, 'sound')));
      const mv = el('span', 'mv');
      const up = btn('', ICON.up, 'Move chapter up', (e) => { e.stopPropagation(); moveChapter(i, -1); });
      const dn = btn('', ICON.down, 'Move chapter down', (e) => { e.stopPropagation(); moveChapter(i, 1); });
      up.disabled = i === 0;
      dn.disabled = i === ed.story.chapters.length - 1;
      mv.append(up, dn);
      b.append(el('span', 'n', String(i + 1)), t, mv);
      b.onclick = () => goEd(i);
      rail.append(b);
    });
    const add = btn('btn add-chap', `${ICON.plus}<span>Add a chapter</span>`, null, () => {
      ed.story.chapters.push({ uid: DB.uid(), title: `Chapter ${ed.story.chapters.length + 1}`, extra: {}, music: [], ambience: [], events: [] });
      dirty();
      goEd(ed.story.chapters.length - 1);
      setTimeout(() => $('.chap-title')?.select(), 30);
    });
    rail.append(add);
    const sb = el('div', 'chap sbchap');
    sb.setAttribute('role', 'button');
    sb.tabIndex = 0;
    sb.setAttribute('aria-current', String(ed.ch === 'soundbox'));
    sb.innerHTML = `<span class="n">${ICON.starFill}</span>`;
    const t = el('span', 't');
    t.append(el('span', '', 'Soundbox'), el('div', 'cnt', plural(ed.story.soundbox.length, 'effect')));
    sb.append(t);
    sb.onclick = () => goEd('soundbox');
    rail.append(sb);
    rail.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function moveChapter(i, d) {
    const list = ed.story.chapters;
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    dirty();
    goEd(ed.ch === i ? j : ed.ch === j ? i : ed.ch);
  }

  function renderEdMain() {
    const main = $('#ed-main');
    main.textContent = '';
    if (ed.ch === 'soundbox') {
      const top = el('div', 'ed-top');
      top.innerHTML = `<span class="n star-n">${ICON.starFill}</span>`;
      top.append(el('h2', 'ed-h', 'Story soundbox'));
      main.append(top);
      main.append(el('p', 'muted small ed-note', 'Quick effects for this story only. They sit next to your shared soundbox on the table.'));
      main.append(zoneRow(SOUNDBOX_ZONE, ed.story.soundbox));
      return;
    }
    const ch = ed.story.chapters[ed.ch];
    const top = el('div', 'ed-top');
    top.append(el('span', 'n', String(ed.ch + 1)));
    const t = el('input', 'chap-title');
    t.value = ch.title;
    t.maxLength = 120;
    t.setAttribute('aria-label', `Title of chapter ${ed.ch + 1}`);
    t.setAttribute('enterkeyhint', 'done');
    t.oninput = () => { ch.title = t.value; const r = $('#ed-rail .chap[aria-current="true"] .t span'); if (r) r.textContent = t.value || `Chapter ${ed.ch + 1}`; dirty(); };
    t.onkeydown = (e) => { if (e.key === 'Enter') t.blur(); };
    top.append(t);
    const del = btn('btn del slim', `${ICON.trash}<span class="long">Remove</span>`, null, async () => {
      const n = DB.ZONES.reduce((a, z) => a + ch[z].length, 0);
      if (n) {
        const v = await ask(`Remove “${ch.title}”?`, `Its ${plural(n, 'sound')} go with it.`, [{ label: 'Cancel', value: null }, { label: 'Remove', value: 'rm', cls: 'danger' }]);
        if (v !== 'rm') return;
      }
      stopPreview();
      ed.story.chapters.splice(ed.ch, 1);
      dirty();
      goEd(Math.max(0, ed.ch - 1));
    });
    del.disabled = ed.story.chapters.length === 1;
    top.append(del);
    main.append(top);
    ZONES.forEach((z) => main.append(zoneRow(z, ch[z.id])));
  }

  function zoneRow(zone, list) {
    const row = el('div', 'zrow');
    row.style.setProperty('--z', zone.color);
    const label = el('div', 'zl');
    label.append(el('span', '', zone.label));
    const dz = el('div', 'dz');
    dz.style.setProperty('--z', zone.color);
    list.forEach((s, i) => dz.append(editCard(s, i, list, zone, () => { renderEdRail(); renderEdMain(); })));
    const hint = el('button', 'hint');
    hint.type = 'button';
    hint.innerHTML = `${ICON.plus}<span>${list.length ? 'Add more' : zone.hint}</span>`;
    hint.onclick = () => openPicker(zone, list);
    dz.append(hint);
    row.append(label, dz);
    return row;
  }

  function editCard(s, i, list, zone, rerender) {
    const c = el('div', 'sc');
    c.style.setProperty('--z', zone.color);
    const top = el('div', 'row');
    const name = el('input');
    name.value = s.name;
    name.maxLength = 80;
    name.setAttribute('aria-label', 'Sound name');
    name.setAttribute('enterkeyhint', 'done');
    name.oninput = () => { s.name = name.value; dirty(); };
    name.onblur = () => { if (!s.name.trim()) { s.name = cleanName(s.fileName); name.value = s.name; dirty(); } };
    name.onkeydown = (e) => { if (e.key === 'Enter') name.blur(); };
    const x = btn('x', ICON.x, `Remove ${s.name}`, () => {
      if (previews.has(s.uid)) stopPreview(s.uid);
      list.splice(i, 1);
      dirty();
      rerender();
    });
    top.append(name, x);
    const bottom = el('div', 'row');
    const play = btn('pb play', previews.has(s.uid) ? ICON.pause : ICON.play, `Listen to ${s.name}`, () => togglePreview(s, c, play));
    if (previews.has(s.uid)) { c.classList.add('playing'); const p = previews.get(s.uid); p.card = c; p.btn = play; }
    const meta = el('span', 'meta');
    [s.duration ? fmt(s.duration) : null, size(SIZES.get(s.blob) || s.size)].filter(Boolean).forEach((t) => meta.append(el('span', '', t)));
    const mv = el('span', 'mvh');
    const l = btn('', ICON.left, 'Move earlier', () => { if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; dirty(); rerender(); } });
    const r = btn('', ICON.right, 'Move later', () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; dirty(); rerender(); } });
    l.disabled = i === 0;
    r.disabled = i === list.length - 1;
    mv.append(l, r);
    const loop = el('button', 'loop');
    loop.type = 'button';
    loop.title = zone.id !== 'music' ? 'Loop: once, twice, forever, random' : 'Loop: once, twice, forever';
    const paintLoop = () => {
      if (s.loop === 'random') loop.innerHTML = ICON.random; else loop.textContent = LOOP_LABELS[LOOP_INDEX[s.loop] ?? 0];
      loop.classList.toggle('inf', s.loop === 'infinite');
      loop.classList.toggle('rnd', s.loop === 'random');
    };
    paintLoop();
    loop.onclick = () => { s.loop = LOOP_NAMES[((LOOP_INDEX[s.loop] ?? 0) + 1) % (zone.id !== 'music' ? 4 : 3)]; paintLoop(); dirty(); };
    // Soundbox effects fire once per tap: no loop button for them.
    bottom.append(play, meta, mv);
    if (zone.id !== 'soundbox') bottom.append(loop);
    // Default volume of the sound: the level it starts at on the table.
    const volRow = el('label', 'row edvol');
    volRow.append(el('span', 'vl', 'Volume'));
    const vr = el('input');
    vr.type = 'range'; vr.min = 0; vr.max = 1; vr.step = 0.05; vr.value = typeof s.volume === 'number' ? s.volume : 0.75;
    vr.setAttribute('aria-label', `Default volume of ${s.name}`);
    vr.style.setProperty('--z', zone.color); setP(vr);
    const vp = el('b', 'vp', `${Math.round(+vr.value * 100)}`);
    vr.addEventListener('input', () => {
      s.volume = Math.round(+vr.value * 100) / 100;
      const p = previews.get(s.uid);
      if (p) { if (p.gain) p.gain.gain.setTargetAtTime(curve(s.volume), ctx.currentTime, 0.03); else p.el.volume = s.volume; }
      vp.textContent = `${Math.round(s.volume * 100)}`;
      setP(vr);
      dirty();
    });
    volRow.append(vr, vp);
    c.append(top, bottom, volRow);
    return c;
  }

  /* Listening in the editor: as many sounds at once as the troubadour likes (a music under its ambiances,
   * an event over them), each through the table's volume curve, following its slider as it moves. */
  const previews = new Map(); // sound uid -> { el, url, card, btn, gain }
  async function togglePreview(s, card, b) {
    if (previews.has(s.uid)) { stopPreview(s.uid); return; }
    const blob = await DB.getBlob(s.blob);
    if (!blob) { toast('This sound is missing.'); return; }
    if (previews.has(s.uid)) return;
    applyAudioSession();
    const p = { url: URL.createObjectURL(blob), card, btn: b, gain: null };
    p.el = new Audio(p.url);
    // iOS ignores an audio element's own volume: a gain node does it, so the slider is heard as it moves.
    try {
      const c = audio();
      p.gain = c.createGain();
      p.gain.gain.value = curve(Math.min(1, s.volume ?? 0.75));
      c.createMediaElementSource(p.el).connect(p.gain).connect(masterGain);
    } catch (e) { p.gain = null; p.el.volume = Math.min(1, s.volume ?? 0.75); }
    p.el.onended = () => stopPreview(s.uid);
    previews.set(s.uid, p);
    card.classList.add('playing');
    b.innerHTML = ICON.pause;
    p.el.play().catch(() => stopPreview(s.uid));
    if (!s.duration) {
      p.el.addEventListener('loadedmetadata', () => {
        if (isFinite(p.el.duration)) { s.duration = p.el.duration; dirty(); }
      }, { once: true });
    }
  }
  /** Stops one sound (by uid), or every sound heard in the editor. */
  function stopPreview(uid) {
    const ids = uid ? [uid] : [...previews.keys()];
    ids.forEach((id) => {
      const p = previews.get(id);
      if (!p) return;
      previews.delete(id);
      p.el.pause(); p.el.removeAttribute('src'); p.el.load();
      URL.revokeObjectURL(p.url);
      if (p.card) p.card.classList.remove('playing');
      if (p.btn) p.btn.innerHTML = ICON.play;
      if (p.gain) { try { p.gain.disconnect(); } catch (e) { /* gone */ } }
    });
  }

  /* Story details: description, bard and revision. */
  function openStoryInfo() {
    if (!ed) return;
    const s = ed.story;
    const body = openSheet('Story details');
    const f = el('label', 'field');
    f.append(el('span', '', 'A few words for other troubadours'));
    const ta = el('textarea');
    ta.rows = 3;
    ta.maxLength = 400;
    ta.placeholder = 'A flooded monastery, a choir of ghosts and a very angry abbot.';
    ta.value = s.description || '';
    ta.oninput = () => { s.description = ta.value; dirty(); };
    f.append(ta);
    body.append(f);
    const facts = [];
    facts.push(s.revision ? `Exported as revision ${s.revision}${s.bard ? `, signed by ${s.bard}` : ''}.` : 'Not exported yet: the first export rhythms revision 1.');
    if (s.source && s.source.startsWith('discovery')) facts.push('A discovery story of the web edition.');
    facts.push(`${plural(s.chapters.length, 'chapter')}, ${plural(soundCount(s), 'sound')}, ${size(storyBytes(s))} on this ${DEV}.`);
    body.append(el('p', 'muted small', facts.join(' ')));
    const acts = el('div', 'set-acts');
    acts.append(
      btn('btn', `${ICON.share}<span>Export as .troubadour</span>`, null, () => { closeSheet(); saveSoon.flush(); exportStories([s]); }),
      btn('btn danger', `${ICON.trash}<span>Delete this story</span>`, null, async () => {
        closeSheet();
        await refresh();
        const fresh = STORIES.find((x) => x.uid === s.uid) || s;
        const before = STORIES.length;
        await deleteStory(fresh);
        await refresh();
        if (STORIES.length < before) { ed = null; location.hash = '#/'; }
      }),
    );
    body.append(acts);
  }

  /* ================= Sound picker ================= */
  // Two sources: the sounds already on this device (any story, the shared soundbox), and every sound of the
  // Recueil. One search runs through the source shown; every row can be heard before it is added.
  let pickTarget = null; // { zone, list, after }
  const RECUEIL = '../recueil/';
  let recueil = null;        // the Recueil's sounds, once fetched
  let recueilLoad = null;
  const recueilBytes = new Map(); // id -> Promise<Blob>
  const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function loadRecueil() {
    if (!recueilLoad) {
      recueilLoad = fetch(`${RECUEIL}sounds.json`, { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((d) => { recueil = (d.sounds || []).map((x) => Object.assign(x, { key: fold(`${x.name} ${x.tale} ${x.bard} ${x.row}`) })); return recueil; })
        .catch((e) => { recueilLoad = null; throw e; });
    }
    return recueilLoad;
  }
  /** One sound of the Recueil: only its own bytes are fetched (the tales store their sounds as plain byte ranges). */
  function recueilBlob(x) {
    if (!recueilBytes.has(x.id)) {
      recueilBytes.set(x.id, (async () => {
        let part = null;
        try {
          const res = await fetch(RECUEIL + encodeURIComponent(x.file), { headers: { Range: `bytes=${x.offset}-${x.offset + x.length - 1}` } });
          if (res.status === 206) { const b = await res.blob(); if (b.size === x.length) part = b; }
          else if (res.ok) part = (await res.blob()).slice(x.offset, x.offset + x.length);
        } catch (e) { /* tried below */ }
        if (!part) throw new Error('This sound of the Recueil could not be fetched. Check your connection.');
        if (x.deflated) part = await new Response(part.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
        const ext = (x.path.split('.').pop() || 'mp3').toLowerCase();
        // A standalone copy (never a slice): Safari stores slices of a big blob wrongly.
        return new Blob([await part.arrayBuffer()], { type: { m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav' }[ext] || 'audio/mpeg' });
      })().catch((e) => { recueilBytes.delete(x.id); throw e; }));
    }
    return recueilBytes.get(x.id);
  }

  // Listening in the picker: one sound at a time.
  const pickPlay = { key: null, el: null, url: null, btn: null };
  function stopPick() {
    if (pickPlay.el) { pickPlay.el.pause(); pickPlay.el.removeAttribute('src'); pickPlay.el.load(); }
    if (pickPlay.url) URL.revokeObjectURL(pickPlay.url);
    if (pickPlay.btn) { pickPlay.btn.innerHTML = ICON.play; pickPlay.btn.classList.remove('on', 'wait'); }
    Object.assign(pickPlay, { key: null, el: null, url: null, btn: null });
  }
  async function togglePick(key, getBlob, b) {
    if (pickPlay.key === key) { stopPick(); return; }
    stopPick();
    pickPlay.key = key; pickPlay.btn = b;
    b.classList.add('on', 'wait');
    b.innerHTML = ICON.pause;
    try {
      const blob = await getBlob();
      if (pickPlay.key !== key) return;
      if (!blob) throw new Error('This sound is missing.');
      applyAudioSession();
      pickPlay.url = URL.createObjectURL(blob);
      pickPlay.el = new Audio(pickPlay.url);
      pickPlay.el.volume = 0.75;
      pickPlay.el.onended = stopPick;
      b.classList.remove('wait');
      await pickPlay.el.play();
    } catch (e) {
      if (pickPlay.key === key) stopPick();
      toast(e.message || 'This sound could not be played.');
    }
  }

  let pickSource = 'device';
  function openPicker(zone, list, after) {
    pickTarget = { zone, list, after };
    stopPick();
    const body = openSheet(`Add to ${zone.label}`);
    body.className = 'picker';
    $('#sheet').addEventListener('close', stopPick, { once: true });
    const fromFiles = btn('btn big-pick', `${ICON.files}<span>Choose from Files</span>`, null, () => $('#pick-audio').click());
    body.append(fromFiles);

    // On this device: reusing a sound takes no extra space.
    const seen = new Map();
    const sources = STORIES.map((st) => (ed && st.uid === ed.story.uid ? ed.story : st));
    if (ed && !sources.includes(ed.story)) sources.unshift(ed.story);
    sources.forEach((st) => {
      (st.chapters || []).forEach((c) => ZONES.forEach((z) => (c[z.id] || []).forEach((s) => { if (!seen.has(s.blob)) seen.set(s.blob, { s, from: st.title, kind: z.id }); })));
      (st.soundbox || []).forEach((s) => { if (!seen.has(s.blob)) seen.set(s.blob, { s, from: st.title, kind: 'soundbox' }); });
    });
    SHARED.forEach((s) => { if (!seen.has(s.blob)) seen.set(s.blob, { s, from: 'Shared soundbox', kind: 'soundbox' }); });
    const inList = new Set(list.map((s) => s.blob));
    const local = [...seen.values()].filter((x) => !inList.has(x.s.blob)).sort((a, b) => a.s.name.localeCompare(b.s.name))
      .map((x) => ({ key: `d:${x.s.blob}`, name: x.s.name, kind: x.kind, sub: [x.from, x.s.duration ? fmt(x.s.duration) : null].filter(Boolean).join(', '), x, fold: fold(`${x.s.name} ${x.from} ${x.kind}`) }));

    const tabs = el('div', 'seg pick-tabs');
    const tab = (id, label) => { const b = el('button', '', label); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.src = id; b.onclick = () => { pickSource = id; paintTabs(); draw(); }; return b; };
    tabs.append(tab('device', `On this ${DEV}`), tab('recueil', 'From the Recueil'));
    const paintTabs = () => tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.src === pickSource)));
    const q = el('input', 'pick-q');
    q.type = 'search';
    q.setAttribute('enterkeyhint', 'search');
    q.setAttribute('autocomplete', 'off');
    const head = el('div', 'pick-head');
    head.append(tabs, q);
    body.append(head);

    const ul = el('div', 'pick-list');
    const chosen = new Map(); // key -> row data
    const addBtn = btn('btn primary', 'Add', null, async () => {
      const picked = [...chosen.values()];
      stopPick();
      closeSheet();
      let n = 0;
      try {
        for (const r of picked) {
          if (r.x) {
            const s = r.x.s;
            list.push(newSound(s.blob, s.name, s.fileName, SIZES.get(s.blob) || s.size, LOOP_NAMES[zone.loop], s.duration));
          } else {
            busy('Adding sounds from the Recueil', `${r.name} (${n + 1} of ${picked.length})`, n / picked.length);
            const blob = await recueilBlob(r.rx);
            const key = await DB.putBlob(blob);
            SIZES.set(key, blob.size);
            const fileName = r.rx.path.split('/').pop();
            list.push(newSound(key, r.rx.name, fileName, blob.size, LOOP_NAMES[zone.loop], r.rx.duration || null));
          }
          n += 1;
        }
      } catch (err) {
        toast(quotaMessage(err).message || err.message, 4000);
      }
      idle();
      afterAdd(n);
    });
    addBtn.disabled = true;
    const paintAdd = () => { addBtn.disabled = !chosen.size; addBtn.textContent = chosen.size ? `Add ${plural(chosen.size, 'sound')}` : 'Add'; };
    const ROWNAME = { music: 'Music', ambience: 'Ambiance', events: 'Event', soundbox: 'Soundbox' };
    const ROWCOLOR = { music: 'var(--music)', ambience: 'var(--amb)', events: 'var(--evt)', soundbox: 'var(--accent)' };
    // What suits the row best comes first: its own kind, then (for effects) the other kind of effect.
    const kind = zone.id;
    const near = { soundbox: 'events', events: 'soundbox', music: 'ambience', ambience: 'music' }[kind];
    const rank = (k) => (k === kind ? 0 : k === near ? 1 : 2);

    const row = (r, getBlob) => {
      const lab = el('label', 'pick-row');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = chosen.has(r.key);
      cb.onchange = () => { cb.checked ? chosen.set(r.key, r) : chosen.delete(r.key); paintAdd(); };
      const t = el('span', 'pt');
      // Its kind as a coloured tag, as in the Story builder.
      const line = el('small', '');
      if (r.kind) { const tag = el('span', 'pick-tag', ROWNAME[r.kind] || r.kind); tag.style.setProperty('--z', ROWCOLOR[r.kind] || 'var(--accent)'); line.append(tag); }
      line.append(document.createTextNode(r.sub));
      t.append(el('b', '', r.name), line);
      const pb = el('button', 'pick-play');
      pb.type = 'button';
      pb.innerHTML = pickPlay.key === r.key ? ICON.pause : ICON.play;
      if (pickPlay.key === r.key) { pb.classList.add('on'); pickPlay.btn = pb; }
      pb.setAttribute('aria-label', `Listen to ${r.name}`);
      pb.onclick = (e) => { e.preventDefault(); e.stopPropagation(); togglePick(r.key, getBlob, pb); };
      lab.append(cb, el('i'), t, pb);
      return lab;
    };
    const draw = () => {
      ul.textContent = '';
      const term = fold(q.value.trim());
      if (pickSource === 'device') {
        q.placeholder = `Search ${plural(local.length, 'sound')} on this ${DEV}`;
        const hits = local.filter((r) => !term || r.fold.includes(term));
        if (!hits.length) ul.append(el('p', 'muted small pick-empty', local.length ? 'No sound matches.' : `No other sound on this ${DEV} yet. Try the Recueil.`));
        hits.slice().sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name)).slice(0, 300).forEach((r) => ul.append(row(r, () => DB.getBlob(r.x.s.blob))));
        return;
      }
      q.placeholder = 'Search a sound, a tale or a troubadour';
      if (!recueil) {
        ul.append(el('p', 'muted small pick-empty', 'Fetching the sounds of the Recueil…'));
        loadRecueil().then(() => { if (pickSource === 'recueil' && $('#sheet').open) draw(); })
          .catch(() => { ul.textContent = ''; ul.append(el('p', 'muted small pick-empty', 'The Recueil could not be reached. Check your connection.')); });
        return;
      }
      // Sounds of the same kind as the row first (music for Music, and so on).
      const hits = recueil.filter((x) => !term || x.key.includes(term))
        .sort((a, b) => rank(a.row) - rank(b.row) || a.name.localeCompare(b.name));
      if (!hits.length) ul.append(el('p', 'muted small pick-empty', 'No sound of the Recueil matches.'));
      hits.slice(0, 300).forEach((x) => {
        const r = { key: `r:${x.id}`, name: x.name, kind: x.row, sub: [x.tale, x.duration ? fmt(x.duration) : null].filter(Boolean).join(', '), rx: x };
        ul.append(row(r, () => recueilBlob(x)));
      });
    };
    q.oninput = draw;
    if (!local.length) pickSource = 'recueil';
    paintTabs();
    draw();
    const bar = el('div', 'pick-bar');
    bar.append(addBtn);
    body.append(ul, bar);
  }

  $('#pick-audio').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!pickTarget || !files.length) return;
    const { zone, list } = pickTarget;
    closeSheet();
    let n = 0, skipped = 0;
    try {
      for (const f of files) {
        if (!FMT.isAudio(f)) { skipped += 1; continue; }
        busy('Adding sounds', `${f.name} (${n + 1} of ${files.length})`, n / files.length);
        const duration = await probeDuration(f);
        const key = await DB.putBlob(f);
        SIZES.set(key, f.size);
        list.push(newSound(key, cleanName(f.name), f.name, f.size, LOOP_NAMES[zone.loop], duration));
        n += 1;
      }
    } catch (err) {
      toast(quotaMessage(err).message, 4000);
    }
    idle();
    if (skipped) toast(`${plural(skipped, 'file')} skipped: not audio.`);
    afterAdd(n);
  });

  function afterAdd(n) {
    if (!n || !pickTarget) return;
    if (pickTarget.after) { pickTarget.after(); return; }
    if (ed) { dirty(); renderEdRail(); renderEdMain(); }
  }

  /* ================= Shared soundbox screen ================= */
  const saveShared = debounce(() => DB.setKV('soundbox', SHARED).catch((e) => toast(quotaMessage(e).message)), 400);
  function renderShared() {
    const box = $('#shared-list');
    box.textContent = '';
    const zone = { ...SOUNDBOX_ZONE, hint: 'Add your first effects: critical hits, level ups, explosions' };
    const dz = el('div', 'dz');
    dz.style.setProperty('--z', zone.color);
    SHARED.forEach((s, i) => dz.append(editCard(s, i, SHARED, zone, renderShared)));
    const hint = el('button', 'hint');
    hint.type = 'button';
    hint.innerHTML = `${ICON.plus}<span>${SHARED.length ? 'Add more' : zone.hint}</span>`;
    hint.onclick = () => openPicker(zone, SHARED, () => { saveShared(); renderShared(); });
    dz.append(hint);
    box.append(dz);
  }
  // Cards call dirty() when they change: on the shared screen that saves the shared soundbox, in the editor the story.
  function dirty() {
    if (screen === 'sbx') { saveShared(); return; }
    $('#ed-saved').textContent = '';
    saveSoon();
  }

  /* ================= Audio ================= */
  let ctx = null, masterGain = null, sbGain = null;
  const curve = (v) => v * v;
  const randomMax = () => Math.min(10, Math.max(1, Math.round(+settings.randomMax || 5)));
  /* Living ambiances: while it plays, an ambiance drifts up to 10 points above or below its volume, a new drift about every
   * settings.lifeEvery seconds (a little sooner or later each time), glided so it never jumps. Off: back to its volume. */
  /** The volume an ambiance is heard at right now, from the drift it is gliding through. */
  function lifeHeard(v) {
    if (v.lifeT0 == null) return v.vol;
    const k = Math.min(1, Math.max(0, (performance.now() - v.lifeT0) / Math.max(1, v.lifeMs)));
    return v.lifeFromV + (v.lifeToV - v.lifeFromV) * k;
  }
  const lifeEvery = () => Math.min(30, Math.max(2, Math.round(+settings.lifeEvery || 6)));
  setInterval(() => {
    if (typeof tbl === 'undefined' || !tbl || !ctx) return;
    const now = performance.now();
    tbl.all.forEach((v) => {
      if (!v.life || v.zone.id !== 'ambience') return;
      const g = v.life.gain;
      if (!settings.life || !v.active) {
        if (v.lifeOn) { v.lifeOn = false; g.cancelScheduledValues(ctx.currentTime); g.setTargetAtTime(1, ctx.currentTime, 0.4); }
        return;
      }
      if (v.lifeOn && now < v.lifeAt) return;
      v.lifeOn = true;
      const off = (Math.random() * 2 - 1) * 0.1;
      const base = Math.max(0.001, v.vol);
      const f = Math.min(4, curve(Math.min(1, Math.max(0, base + off))) / curve(base));
      const secs = lifeEvery() * 0.9;
      // Its own record of the glide, for the mark on the card (some browsers do not report a gain in motion).
      const from = v.lifeOn && v.lifeT0 != null ? lifeHeard(v) / Math.max(0.001, v.vol) : 1;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(f, ctx.currentTime + secs);
      Object.assign(v, { lifeFromV: from * Math.max(0.001, v.vol), lifeToV: Math.sqrt(f * curve(base)), lifeT0: now, lifeMs: secs * 1000 });
      v.lifeAt = now + lifeEvery() * 1000 * (0.75 + Math.random() * 0.5);
    });
  }, 250);
  const randomPause = () => 500 + Math.floor(Math.random() * Math.max(1, randomMax() * 1000 - 500));
  function applyAudioSession() {
    try { if (navigator.audioSession) navigator.audioSession.type = settings.silent ? 'playback' : 'auto'; } catch (e) { /* older iOS */ }
  }
  function audio() {
    if (!ctx) {
      applyAudioSession();
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      masterGain = ctx.createGain();
      masterGain.gain.value = curve(settings.master);
      masterGain.connect(ctx.destination);
      sbGain = ctx.createGain();
      sbGain.gain.value = curve(settings.sbVol);
      sbGain.connect(masterGain);
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
    return ctx;
  }
  function freeElement(el) {
    try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* gone */ }
  }
  /** iOS sometimes leaves the sound engine stopped (suspended or interrupted) and resume() never takes.
   * After a tap that should have played, a check marks it broken; the next tap builds a new engine. */
  let audioBroken = false;
  function checkAudio() {
    if (!ctx) return;
    const c = ctx, t0 = c.currentTime;
    setTimeout(() => {
      if (ctx !== c || !tbl) return;
      const stuck = c.state !== 'running' || c.currentTime === t0;
      if (stuck && tbl.all.some((v) => v.state === 'playing')) {
        audioBroken = true;
        tbl.all.forEach((v) => { if (v.active) { v.reset(); } });
        toast('The sound engine stalled. Tap the sound again.');
      }
    }, 900);
  }
  function rebuildAudio() {
    audioBroken = false;
    const old = ctx;
    ctx = null; masterGain = null; sbGain = null;
    try { old && old.close(); } catch (e) { /* closed */ }
    audio();
    if (tbl) tbl.all.forEach((v) => v.rewire());
  }
  /** The master play, pause and stop buttons fade over 3 s. */
  const MASTER_FADE = 3000;
  function ramp(param, target, secs) {
    const t = ctx.currentTime;
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
    param.linearRampToValueAtTime(target, t + Math.max(secs, 0.012));
  }

  class Voice {
    constructor(sound, zone, chapter) {
      this.sound = sound; this.zone = zone; this.chapter = chapter;
      this.loop = LOOP_INDEX[sound.loop] ?? zone.loop;
      if (this.loop === 3 && zone.id === 'music') this.loop = 0;
      this.vol = typeof sound.volume === 'number' ? sound.volume : 0.75;
      this.state = 'loading';
      this.plays = 0; this.el = null; this.url = null; this.env = null; this.vg = null; this.timer = 0; this.card = null;
      // Random events, as in the Android app: rnd while the sound keeps coming back, next = when it plays again (0 while it plays).
      this.rnd = false; this.next = 0; this.startedAt = 0;
    }
    attach(blob) {
      this.url = URL.createObjectURL(blob);
      this.makeElement();
      this.set('ready');
    }
    /** A fresh audio element on this voice's sound (also used when the sound engine is rebuilt). */
    makeElement() {
      const el = (this.el = new Audio());
      el.preload = 'auto';
      el.loop = this.loop === 2;
      el.addEventListener('loadedmetadata', () => this.paint());
      el.addEventListener('ended', () => { if (el === this.el) this.ended(); });
      el.addEventListener('error', () => { clearTimeout(this.timer); this.set('error'); });
      el.src = this.url;
      el.load();
    }
    /** The sound engine was rebuilt: the old element belongs to the old engine, take a new one. */
    rewire() {
      if (!this.el) return;
      clearTimeout(this.timer);
      this.dropTwin(true);
      freeElement(this.el);
      this.src = null; this.env = null; this.vg = null; this.life = null; this.xf = null;
      this.fadingOut = null;
      this.makeElement();
      this.plays = 0;
      this.set('ready');
    }
    graph() {
      if (this.env) return;
      audio();
      const src = (this.src = ctx.createMediaElementSource(this.el));
      this.vg = ctx.createGain(); this.vg.gain.value = curve(this.vol);
      this.env = ctx.createGain(); this.env.gain.value = 0;
      // Living events: a gain of its own lets the volume drift around the troubadour's setting.
      this.life = ctx.createGain(); this.life.gain.value = 1;
      // xf: this round's share of a blended loop (1 outside a blend).
      this.xf = ctx.createGain(); this.xf.gain.value = 1;
      src.connect(this.xf).connect(this.vg).connect(this.life).connect(this.env).connect(masterGain);
    }
    get active() { return this.state === 'playing' || this.state === 'ending'; }
    get usable() { return this.el && this.state !== 'loading' && this.state !== 'error'; }
    play(fadeIn = 0.03) {
      if (!this.usable) return;
      this.graph();
      clearTimeout(this.timer);
      if (this.loop === 3) { this.rnd = true; this.next = 0; this.startedAt = Date.now(); }
      if (this.state === 'ending') { ramp(this.env.gain, 1, 0.15); this.set('playing'); return; }
      if (this.state === 'paused' && this.fadingOut) {
        // Resumed while its pause still fades out: rise back from the level heard now, no jump.
        const t = ctx.currentTime, from = this.pauseLeft;
        this.fadingOut = null;
        this.env.gain.cancelScheduledValues(t);
        this.env.gain.setValueAtTime(from, t);
        this.env.gain.linearRampToValueAtTime(1, t + Math.max(fadeIn * (1 - from), 0.012));
        this.set('playing');
        return;
      }
      if (this.state === 'ready') { this.el.currentTime = 0; this.plays = 0; }
      // From silence, rise over fadeIn. ramp() would start from gain.value, which Safari still reports
      // as the old level (1 after a sound ended), so the fade-in was lost there.
      const t = ctx.currentTime;
      this.env.gain.cancelScheduledValues(t);
      this.env.gain.setValueAtTime(0, t);
      this.env.gain.linearRampToValueAtTime(1, t + Math.max(fadeIn, 0.012));
      const p = this.el.play();
      if (p) p.catch(() => this.set('ready'));
      this.set('playing');
    }
    /** Pause with a fade out of ms (the card's pause button uses the fade-out setting, the master button 3 s).
     * The card shows paused at once; the element only stops once the fade is over. */
    pause(ms = 40) {
      if (!this.active) return;
      clearTimeout(this.timer);
      this.dropTwin(true);
      ms = Math.max(40, ms);
      ramp(this.env.gain, 0, ms / 1000);
      this.fadingOut = { at: Date.now(), ms };
      this.timer = setTimeout(() => { this.fadingOut = null; this.el.pause(); }, ms + 10);
      this.set('paused');
    }
    /** Level still heard while a pause fades out (0 once it is over). */
    get pauseLeft() {
      const f = this.fadingOut;
      return f ? Math.max(0, 1 - (Date.now() - f.at) / f.ms) : 0;
    }
    end(ms) {
      this.rnd = false; this.next = 0;
      if (this.state === 'paused' && this.fadingOut) {
        // Stopped while its pause fades out: let that fade finish, then let go.
        const left = Math.min(ms, Math.max(40, Math.round(this.fadingOut.ms * this.pauseLeft)));
        clearTimeout(this.timer);
        ramp(this.env.gain, 0, left / 1000);
        this.fadingOut = null;
        this.set('ending');
        this.timer = setTimeout(() => this.reset(), left + 40);
        return;
      }
      if (this.state === 'paused') { this.reset(); return; }
      if (!this.active) { this.paint(); return; }
      if (!this.active) return;
      clearTimeout(this.timer);
      ramp(this.env.gain, 0, ms / 1000);
      this.set('ending');
      this.timer = setTimeout(() => this.reset(), ms + 40);
    }
    /** Blend (sound.blend s, forever loops only): the length of the crossfade between two rounds, at most a third of the sound. */
    get blend() {
      const b = Number(this.sound.blend ?? (this.sound.extra && this.sound.extra.blend) ?? 0);
      const d = this.el && isFinite(this.el.duration) ? this.el.duration : 0;
      return this.loop === 2 && b > 0 && d > 1.5 ? Math.min(b, d / 3) : 0;
    }
    /** A blended loop: near the end of a round, the next round starts on a second element and the two cross over. */
    blendTick() {
      if (!this.el || !this.xf) return;
      const b = this.blend;
      if (!b) { if (this.loop === 2 && !this.el.loop && !this.twin) this.el.loop = true; return; }
      if (this.el.loop) this.el.loop = false;
      if (this.state !== 'playing' || this.twin) return;
      const left = this.el.duration - this.el.currentTime;
      if (!(left <= b)) return;
      const old = this.el, oldXf = this.xf;
      const nu = new Audio(this.url);
      nu.preload = 'auto';
      nu.addEventListener('ended', () => { if (nu === this.el) this.ended(); });
      const xf = ctx.createGain();
      ctx.createMediaElementSource(nu).connect(xf).connect(this.vg);
      const t = ctx.currentTime, span = Math.max(0.05, left);
      xf.gain.setValueAtTime(0, t); xf.gain.linearRampToValueAtTime(1, t + span);
      oldXf.gain.cancelScheduledValues(t); oldXf.gain.setValueAtTime(1, t); oldXf.gain.linearRampToValueAtTime(0, t + span);
      nu.play().catch(() => {});
      this.el = nu; this.xf = xf;
      this.twin = { el: old, xf: oldXf };
      this.twinTimer = setTimeout(() => this.dropTwin(), span * 1000 + 150);
    }
    /** Lets the round that blended out go; `now`: also brings the current round to full level at once. */
    dropTwin(now) {
      clearTimeout(this.twinTimer);
      const tw = this.twin;
      this.twin = null;
      if (tw) { try { tw.el.pause(); tw.el.removeAttribute('src'); tw.el.load(); } catch (e) { /* gone */ } try { tw.xf.disconnect(); } catch (e) { /* gone */ } }
      if (now && this.xf && ctx) { const g = this.xf.gain; g.cancelScheduledValues(ctx.currentTime); g.setValueAtTime(1, ctx.currentTime); }
    }
    reset() {
      clearTimeout(this.timer);
      this.fadingOut = null;
      this.dropTwin(true);
      if (this.el) { this.el.pause(); try { this.el.currentTime = 0; } catch (e) { /* not loaded */ } }
      this.plays = 0;
      this.set('ready');
    }
    ended() {
      this.plays += 1;
      if (this.loop === 1 && this.plays < 2 && this.active) { this.el.currentTime = 0; this.el.play().catch(() => {}); return; }
      this.reset();
    }
    /** Random event between two plays (Android: randomOn && nextAt > 0). */
    get waiting() { return this.rnd && this.next > 0; }
    setLoop(l) {
      this.loop = l;
      if (l === 3) this.rnd = this.active || this.state === 'paused';
      else { this.rnd = false; this.next = 0; }
      if (this.el) this.el.loop = l === 2;
      if (l === 0 && this.plays > 0) this.plays = 0;
      this.sound.loop = LOOP_NAMES[l];
      tableDirty();
      this.paint();
    }
    setVol(v) {
      this.vol = v;
      this.sound.volume = Math.round(v * 100) / 100;
      tableDirty();
      if (this.vg) { const g = this.vg.gain; g.cancelScheduledValues(ctx.currentTime); g.setTargetAtTime(curve(v), ctx.currentTime, 0.03); }
    }
    /** Simple volume buttons: one step is 25 %, reached smoothly over 2 s. */
    stepVol(dir) {
      const q = this.vol * 4;
      const t = dir > 0 ? Math.min(1, (Math.floor(q + 1e-6) + 1) / 4) : Math.max(0, (Math.ceil(q - 1e-6) - 1) / 4);
      if (t === this.vol) return;
      const secs = Math.max(0.3, Math.abs(t - this.shownVol()) / 0.25 * 2);
      this.volFrom = this.shownVol(); this.volAt = performance.now(); this.volMs = secs * 1000;
      this.vol = t;
      this.sound.volume = t;
      tableDirty();
      if (this.vg) {
        const g = this.vg.gain, now = ctx.currentTime;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(curve(t), now + secs);
      }
      this.paint();
    }
    /** The volume heard right now (follows a ramp in progress). */
    shownVol() {
      if (!this.volMs) return this.vol;
      const f = Math.min(1, (performance.now() - this.volAt) / this.volMs);
      if (f >= 1) { this.volMs = 0; return this.vol; }
      return this.volFrom + (this.vol - this.volFrom) * f;
    }
    progress() {
      if (this.state === 'ready' || this.state === 'loading' || this.state === 'error') return 0;
      if (this.loop === 2) return -1;
      const d = this.el.duration;
      if (!d || !isFinite(d)) return 0;
      const total = this.loop === 1 ? 2 * d : d;
      return Math.min(1, (this.plays * d + this.el.currentTime) / total);
    }
    remaining() {
      const d = this.el && this.el.duration;
      if (!d || !isFinite(d) || this.loop === 2) return null;
      const total = this.loop === 1 ? 2 * d : d;
      return Math.max(0, total - (this.plays * d + this.el.currentTime));
    }
    set(state) { this.state = state; this.paint(); }
    paint() { if (this.card) paintCard(this); }
    /** Silences the voice at once (cheap). */
    silence() {
      clearTimeout(this.timer);
      if (this.el) this.el.pause();
      if (this.env) { try { this.env.disconnect(); } catch (e) { /* already */ } }
      this.card = null;
    }
    /** Lets go of the audio data. Done a few voices at a time, after the screen has changed. */
    release() {
      // Safari keeps a media element's decoder until it is told to load nothing: without that, each story opened
      // left all its players behind, and past Safari's limit no sound played any more until the app restarted.
      this.dropTwin(true);
      if (this.src) { try { this.src.disconnect(); } catch (e) { /* already */ } }
      if (this.el) freeElement(this.el);
      if (this.url) URL.revokeObjectURL(this.url);
      this.el = null; this.url = null; this.src = null; this.env = null;
    }
    destroy() { this.silence(); this.release(); }
  }

  /* ================= Mixing table ================= */
  let tbl = null;         // { story, chapters: [{ meta, voices: {music:[],...}, railBtn }], all: [] }
  let chapterIdx = 0;
  let pausedByAll = [];
  let heldRandom = [];   // random events that were waiting when everything was paused
  const sb = { pads: [], sources: new Set() };
  // Loop and volume changes made at the table are kept with the story.
  const tableSave = debounce(() => { if (tbl) DB.putStory(tbl.story, false).catch(() => {}); }, 800);
  function tableDirty() { tableSave(); }

  async function openTable(story, idx) {
    if (tbl && tbl.story.uid === story.uid) { setChapter(Math.min(idx, tbl.chapters.length - 1)); show('table'); return; }
    closeTable();
    audio();
    tbl = { story, chapters: [], all: [] };
    story.chapters.forEach((c, i) => {
      const ch = { meta: c, index: i, voices: {} };
      ZONES.forEach((zone) => {
        ch.voices[zone.id] = (c[zone.id] || []).map((s) => { const v = new Voice(s, zone, ch); tbl.all.push(v); return v; });
      });
      tbl.chapters.push(ch);
    });
    $('#t-story').textContent = story.title;
    show('table');
    document.title = `${story.title} | Troubadour`;
    renderRail();
    setChapter(Math.min(idx, tbl.chapters.length - 1));
    setSoundbox(settings.sbOpen ?? false);
    paintMaster();
    mediaSession(story);
    acquireWake();
    // Everything is already on the phone: hand each sound its stored audio, the chapter on screen first.
    const t = tbl;
    const order = [...ZONES.flatMap((z) => t.chapters[idx] ? t.chapters[idx].voices[z.id] : [])];
    t.all.forEach((v) => { if (!order.includes(v)) order.push(v); });
    loadPads(story);
    while (order.length) {
      if (tbl !== t) return;
      // A sound tapped while loading jumps the queue, then plays as soon as it is ready.
      const w = order.findIndex((x) => x.wanted);
      const v = order.splice(w >= 0 ? w : 0, 1)[0];
      try {
        const blob = await DB.getBlob(v.sound.blob);
        if (tbl !== t) return;
        if (blob) v.attach(blob); else v.set('error');
      } catch (e) { v.set('error'); }
      if (v.wanted) { v.wanted = false; if (v.state === 'ready') toggleVoice(v); else v.paint(); }
    }
  }

  function closeTable() {
    if (!tbl) return;
    tableSave.flush();
    const voices = tbl.all;
    lastTableStory = tbl.story;
    voices.forEach((v) => v.silence());
    tbl = null;
    pausedByAll = [];
    stopSoundbox();
    sb.pads = [];
    $('#zones').textContent = '';
    $('#rail').textContent = '';
    $('#pads').textContent = '';
    let i = 0;
    const step = () => {
      const end = Math.min(voices.length, i + 6);
      for (; i < end; i++) voices[i].release();
      if (i < voices.length) setTimeout(step, 16);
    };
    setTimeout(step, 120);
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }

  function renderRail() {
    const rail = $('#rail');
    rail.textContent = '';
    rail.append(el('h3', '', 'Chapters'));
    tbl.chapters.forEach((c, i) => {
      const b = el('button', 'chap');
      b.type = 'button';
      b.append(el('span', 'n', String(i + 1)), el('span', 't', c.meta.title), el('i', 'live'));
      b.title = `Chapter ${i + 1}: ${c.meta.title}`;
      b.addEventListener('click', () => goChapter(i));
      c.railBtn = b;
      rail.append(b);
    });
  }
  function goChapter(i) {
    if (!tbl || i < 0 || i >= tbl.chapters.length) return;
    history.replaceState(null, '', `#/play/${encodeURIComponent(tbl.story.uid)}/${i + 1}`);
    setChapter(i);
  }

  function setChapter(i) {
    // Silence between chapters (setting): the sounds of the other chapters fade out over 4 s.
    if (settings.silence && tbl && i !== chapterIdx && tbl.chapters[i]) {
      const here = new Set(ZONES.flatMap((z) => tbl.chapters[i].voices[z.id]));
      tbl.all.forEach((v) => {
        if (here.has(v) || !(v.active || v.state === 'paused' || v.waiting)) return;
        v.end(4000);
        v.paint();
      });
      pausedByAll = pausedByAll.filter((v) => here.has(v));
      heldRandom = heldRandom.filter((v) => here.has(v));
      paintMaster();
    }
    chapterIdx = i;
    markRecent(tbl.story.uid, i);
    const ch = tbl.chapters[i];
    $('#t-chapter').textContent = `Chapter ${i + 1}: ${ch.meta.title}`;
    tbl.chapters.forEach((c, j) => c.railBtn.setAttribute('aria-current', String(j === i)));
    ch.railBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const zones = $('#zones');
    zones.textContent = '';
    ZONES.forEach((zone) => {
      const row = el('div', `zrow vm-${(settings.vol && settings.vol[zone.id]) || 'hidden'}`);
      row.style.setProperty('--z', zone.color);
      const label = el('div', 'zl');
      label.append(el('span', '', zone.label));
      const cards = el('div', 'cards');
      const voices = ch.voices[zone.id];
      if (!voices.length) cards.append(el('div', 'empty', zone.empty));
      voices.forEach((v) => cards.append(v.card ? v.card.root : buildCard(v)));
      row.append(label, cards);
      zones.append(row);
    });
    zones.scrollTop = 0;
    requestAnimationFrame(() => rollTitles(zones));
    tbl.all.forEach((v) => v.card && paintCard(v));
  }

  function buildCard(v) {
    const c = el('div', 'c');
    c.style.setProperty('--z', v.zone.color);
    const mode = (settings.vol && settings.vol[v.zone.id]) || 'hidden';
    c.classList.add(`vm-${mode}`);
    const head = el('div', 'ch');
    // The title rolls inside its frame when it is longer than the card (see rollTitles).
    const name = el('b', 'nm'); name.title = v.sound.name; name.append(el('span', '', v.sound.name));
    const rem = el('small');
    const loop = el('button', 'loop');
    loop.type = 'button'; loop.title = v.zone.id !== 'music' ? 'Loop: once, twice, forever, random' : 'Loop: once, twice, forever';
    loop.addEventListener('click', () => v.setLoop((v.loop + 1) % (v.zone.id !== 'music' ? 4 : 3)));
    head.append(name);
    if (mode !== 'hidden') head.append(rem);
    head.append(loop);
    const track = el('div', 'track'); const fill = el('div', 'fill'); track.append(fill);
    const ctrl = el('div', 'ctrl');
    const play = el('button', 'pb play'); play.type = 'button';
    play.addEventListener('click', () => toggleVoice(v));
    const end = el('button', 'pb end'); end.type = 'button'; end.innerHTML = ICON.stop;
    end.setAttribute('aria-label', `Fade out ${v.sound.name}`); end.title = 'Fade out';
    end.addEventListener('click', () => v.end(settings.fade));
    const vol = el('input');
    vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = v.vol;
    vol.setAttribute('aria-label', `${v.sound.name} volume`);
    vol.style.setProperty('--z', v.zone.color); setP(vol);
    vol.addEventListener('input', () => { v.setVol(+vol.value); setP(vol); });
    let lvl = null;
    if (mode === 'full') ctrl.append(play, end, vol);
    else if (mode === 'simple') {
      lvl = el('span', 'lvl');
      const dn = btn('vb', ICON.volDown, `Lower ${v.sound.name}`, () => v.stepVol(-1));
      const up = btn('vb', ICON.volUp, `Raise ${v.sound.name}`, () => v.stepVol(1));
      ctrl.append(play, end, dn, lvl, up);
    } else ctrl.append(play, end, rem);
    c.append(head, track, ctrl);
    v.card = { root: c, rem, loop, fill, play, end, lvl, vol: mode === 'full' ? vol : null };
    paintCard(v);
    return c;
  }

  /** Fade-in of a sound started with Play, in seconds (Off: a click-free 30 ms). */
  const startFade = () => Math.max(0.03, (+settings.fadeIn || 0) / 1000);
  function toggleVoice(v) {
    if (audioBroken) rebuildAudio();
    audio();
    // Still loading: it plays as soon as it is ready (and is loaded next).
    if (v.state === 'loading') { v.wanted = !v.wanted; v.paint(); return; }
    // Between two plays, a tap stops the random event.
    if (v.waiting) { v.rnd = false; v.next = 0; v.paint(); return; }
    acquireWake();
    if (v.state === 'playing') { v.pause(settings.fade); return; }
    if (v.zone.id === 'music' && v.state !== 'ending') {
      const others = tbl.all.filter((o) => o !== v && o.zone.id === 'music' && (o.active || o.state === 'paused'));
      const crossing = others.some((o) => o.active);
      others.forEach((o) => o.end(settings.crossfade ? settings.fade : 150));
      v.play(crossing && settings.crossfade && v.state !== 'paused' ? settings.fade / 1000 : startFade());
    } else {
      // A tap on Play rises over the fade-in (music, ambiances); events strike at once. Replays never come here.
      v.play(v.zone.id === 'ambience' ? startFade() : 0.03);
    }
    pausedByAll = pausedByAll.filter((o) => o !== v);
    paintMaster();
    if (v.state === 'playing') checkAudio();
  }

  function paintCard(v) {
    const k = v.card; if (!k) return;
    // Living ambiances: a discreet mark shows the volume heard right now; the slider and the number keep the troubadour's own.
    if (v.life && v.zone.id === 'ambience') {
      const alive = !!(settings.life && v.lifeOn && v.active);
      const heard = alive ? lifeHeard(v) : v.vol;
      if (k.vol) { k.vol.classList.toggle('living', alive); if (alive) k.vol.style.setProperty('--lp', Math.min(1, heard).toFixed(3)); }
      if (k.lvl) { k.lvl.classList.toggle('living', alive); if (alive) k.lvl.style.setProperty('--lo', `${((heard - v.vol) * 90).toFixed(1)}px`); }
    }
    const waiting = v.waiting;
    const on = v.active || waiting;
    k.root.classList.toggle('on', on);
    k.root.classList.toggle('loading', v.state === 'loading');
    k.root.classList.toggle('wanted', !!(v.wanted && v.state === 'loading'));
    k.root.classList.toggle('err', v.state === 'error');
    const icon = v.state === 'playing' || waiting ? 'pause' : 'play';
    if (k.icon !== icon) { k.play.innerHTML = ICON[icon]; k.icon = icon; }
    k.play.setAttribute('aria-label', `${v.state === 'playing' ? 'Pause' : waiting ? 'Stop' : 'Play'} ${v.sound.name}`);
    k.play.disabled = !v.usable;
    k.end.disabled = !(on || v.state === 'paused');
    if (k.loopShown !== v.loop) {
      if (v.loop === 3) { k.loop.innerHTML = ICON.random; k.loop.setAttribute('aria-label', 'Random: plays again after a short random pause'); }
      else { k.loop.textContent = LOOP_LABELS[v.loop]; k.loop.removeAttribute('aria-label'); }
      k.loopShown = v.loop;
    }
    k.loop.classList.toggle('inf', v.loop === 2);
    k.loop.classList.toggle('rnd', v.loop === 3);
    const p = v.progress();
    if (p < 0) { k.fill.style.width = on || v.state === 'paused' ? '100%' : '0'; k.fill.style.background = 'var(--blue)'; }
    else { k.fill.style.width = `${p * 100}%`; k.fill.style.background = `hsl(${Math.round(130 * (1 - p))},72%,50%)`; }
    let txt = '', warn = false;
    if (v.state === 'loading') txt = v.wanted ? 'plays when loaded' : 'loading…';
    else if (v.state === 'error') txt = 'unavailable';
    else if (waiting) txt = `next ${fmt(Math.max(0, (v.next - Date.now()) / 1000))}`;
    else if (heldRandom.includes(v)) txt = 'held';
    else if (on || v.state === 'paused') {
      if (v.loop === 2) txt = '∞ loop';
      else { const r = v.remaining(); if (r != null) { txt = fmt(r); warn = r <= 10; } }
    }
    if (k.rem.textContent !== txt) k.rem.textContent = txt;
    k.rem.classList.toggle('warn', warn);
    if (k.lvl) {
      const pct = `${Math.round(v.shownVol() * 100)}`;
      if (k.lvl.textContent !== pct) k.lvl.textContent = pct;
      k.lvl.classList.toggle('moving', !!v.volMs);
    }
  }

  /* Titles longer than their card roll slowly back and forth inside it. */
  function rollTitles(scope) {
    scope.querySelectorAll('.nm').forEach((b) => {
      const span = b.firstElementChild;
      if (!span) return;
      b.classList.remove('roll');
      const over = span.scrollWidth - b.clientWidth;
      if (over > 2) {
        b.classList.add('roll');
        b.style.setProperty('--roll', `${-over - 4}px`);
        b.style.setProperty('--rd', `${(3 + over / 18).toFixed(1)}s`);
      }
    });
  }
  window.addEventListener('resize', () => { if (tbl) rollTitles($('#zones')); });

  function pauseAll() {
    if (!tbl) return;
    audio();
    if (pausedByAll.length || heldRandom.length) {
      pausedByAll.forEach((v) => v.state === 'paused' && v.play(MASTER_FADE / 1000));
      pausedByAll = [];
      const now = Date.now();
      heldRandom.forEach((v) => { v.rnd = true; v.next = now + randomPause(); v.paint(); });
      heldRandom = [];
    } else {
      pausedByAll = tbl.all.filter((v) => v.state === 'playing');
      pausedByAll.forEach((v) => v.pause(MASTER_FADE));
      // Random events waiting for their next play hold still too.
      heldRandom = tbl.all.filter((v) => v.waiting);
      heldRandom.forEach((v) => { v.rnd = false; v.next = 0; v.paint(); });
    }
    paintMaster();
  }
  function stopAll() {
    if (!tbl) return;
    tbl.all.forEach((v) => v.end(MASTER_FADE));
    pausedByAll = [];
    heldRandom = [];
    stopSoundbox();
    paintMaster();
  }
  function paintMaster() {
    const b = $('#pause-all');
    const resume = pausedByAll.length > 0 || heldRandom.length > 0;
    b.innerHTML = resume ? ICON.play : ICON.pause;
    b.setAttribute('aria-label', resume ? 'Resume all' : 'Pause all');
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = tbl && tbl.all.some((v) => v.state === 'playing') ? 'playing' : 'paused'; } catch (e) { /* not supported */ }
    }
  }

  /* ---------- Soundbox drawer: the story's effects, then the shared ones ---------- */
  async function loadPads(story) {
    const shared = await DB.getKV('soundbox', []);
    const t = tbl;
    sb.pads = [
      ...story.soundbox.map((s) => ({ s, own: true, buffer: null, state: 'loading' })),
      ...shared.map((s) => ({ s, own: false, buffer: null, state: 'loading' })),
    ];
    renderPads();
    for (const p of sb.pads) {
      if (tbl !== t) return;
      try {
        const blob = await DB.getBlob(p.s.blob);
        if (!blob) throw new Error('missing');
        const data = await blob.arrayBuffer();
        audio();
        p.buffer = await new Promise((ok, ko) => { const r = ctx.decodeAudioData(data, ok, ko); if (r && r.catch) r.catch(ko); });
        p.state = 'ready';
      } catch (e) { p.state = 'error'; }
      if (tbl === t) renderPads();
    }
  }
  function setSoundbox(open) {
    $('#soundbox').hidden = !open;
    $('#sb-toggle').setAttribute('aria-pressed', String(open));
    $('#scrim').hidden = !(open && !WIDE.matches);
    if (open) renderPads();
  }
  function toggleSoundbox() {
    const open = $('#soundbox').hidden;
    settings.sbOpen = open; save();
    setSoundbox(open);
  }
  function orderedPads() {
    const pinned = settings.pins.map((u) => sb.pads.find((p) => p.s.uid === u)).filter(Boolean);
    return pinned.concat(sb.pads.filter((p) => !settings.pins.includes(p.s.uid)));
  }
  function renderPads() {
    const pads = $('#pads');
    if ($('#soundbox').hidden) return;
    pads.textContent = '';
    if (!sb.pads.length) {
      const e = el('div', 'sb-empty', 'No effects yet. Add some to this story in the editor, or to your shared soundbox.');
      pads.append(e);
      return;
    }
    let lastGroup = null;
    orderedPads().forEach((p) => {
      const pinned = settings.pins.includes(p.s.uid);
      const group = pinned ? 'Pinned' : p.own ? 'This story' : 'Shared';
      if (group !== lastGroup) { pads.append(el('h4', 'pad-g', group)); lastGroup = group; }
      const b = el('button', 'pad' + (pinned ? ' pinned' : '') + (p.own ? '' : ' shared'));
      b.type = 'button';
      b.disabled = p.state !== 'ready';
      b.append(el('span', '', p.state === 'error' ? `${p.s.name} (unavailable)` : p.s.name));
      const pin = el('span', 'pin');
      pin.innerHTML = pinned ? ICON.starFill : ICON.star;
      pin.setAttribute('role', 'button'); pin.setAttribute('aria-label', `Pin ${p.s.name}`); pin.tabIndex = 0;
      pin.addEventListener('click', (e) => { e.stopPropagation(); togglePin(p.s.uid); });
      b.append(pin);
      b.addEventListener('click', () => firePad(p, b));
      pads.append(b);
    });
  }
  function togglePin(uid) {
    const i = settings.pins.indexOf(uid);
    if (i >= 0) settings.pins.splice(i, 1); else settings.pins.push(uid);
    save(); renderPads();
  }
  function firePad(p, b) {
    if (!p.buffer) return;
    audio();
    const src = ctx.createBufferSource();
    src.buffer = p.buffer;
    const g = ctx.createGain();
    g.gain.value = curve(typeof p.s.volume === 'number' ? Math.min(1, p.s.volume / 0.75) : 1);
    src.connect(g).connect(sbGain);
    src.start();
    sb.sources.add(src);
    src.onended = () => sb.sources.delete(src);
    if (b) { b.classList.remove('fire'); void b.offsetWidth; b.classList.add('fire'); b.addEventListener('animationend', () => b.classList.remove('fire'), { once: true }); }
  }
  function stopSoundbox() {
    sb.sources.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } });
    sb.sources.clear();
  }

  function mediaSession(story) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: story.title, artist: 'Troubadour', artwork: [{ src: 'icons/261014_troubadour_ios_512.png', sizes: '512x512', type: 'image/png' }] });
      navigator.mediaSession.setActionHandler('play', () => { if (pausedByAll.length) pauseAll(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (!pausedByAll.length) pauseAll(); });
      navigator.mediaSession.setActionHandler('stop', stopAll);
    } catch (e) { /* partial support */ }
  }

  // Live progress, about 15 times a second like the app.
  setInterval(() => {
    if (!tbl || document.hidden || screen !== 'table') return;
    const ch = tbl.chapters[chapterIdx];
    if (!ch) return;
    ZONES.forEach((z) => ch.voices[z.id].forEach((v) => (v.active || v.state === 'paused' || v.waiting || heldRandom.includes(v) || v.volMs) && paintCard(v)));
    tbl.chapters.forEach((c) => c.railBtn.classList.toggle('playing', ZONES.some((z) => c.voices[z.id].some((v) => v.active || v.waiting))));
    if (pausedByAll.length && !pausedByAll.some((v) => v.state === 'paused')) { pausedByAll = []; paintMaster(); }
  }, 66);

  // Random events (TableSession.runRandom on Android): once a random event has stopped sounding,
  // it gets a next play time 0.5 s to the longest pause later, and plays again when that time comes.
  setInterval(() => {
    if (!tbl) return;
    const now = Date.now();
    tbl.all.forEach((v) => v.blendTick());
    tbl.all.forEach((v) => {
      if (!v.rnd) return;
      const sounding = v.state === 'playing' || v.state === 'paused' || v.state === 'ending';
      if (sounding) { if (v.next) v.next = 0; return; }
      if (now - v.startedAt <= 400) return;
      if (!v.next) { v.next = now + randomPause(); v.paint(); }
      else if (now >= v.next) { v.next = 0; v.play(); }
    });
  }, 50);

  /* ================= Settings dialog ================= */
  function buildSettings() {
    const pick = $('#theme-pick');
    const paintThemes = () => TroubadourThemes.render(pick, settings.theme, (id) => { settings.theme = id; save(); syncSettings(); });
    paintThemes();
    $('#settings').addEventListener('toggle', paintThemes);
    segment('#mode-pick', 'mode', (v) => v);
    segment('#fade-pick', 'fade', Number);
    segment('#fadein-pick', 'fadeIn', Number);
    const stepRandom = (d) => { settings.randomMax = Math.min(10, Math.max(1, randomMax() + d)); save(); syncSettings(); };
    $('#random-less').addEventListener('click', () => stepRandom(-1));
    $('#opt-life').addEventListener('change', (e) => { settings.life = e.target.checked; save(); syncSettings(); });
    const stepLife = (d) => { settings.lifeEvery = Math.min(30, Math.max(2, lifeEvery() + d)); save(); syncSettings(); };
    $('#life-less').addEventListener('click', () => stepLife(lifeEvery() > 10 ? -2 : -1));
    $('#life-more').addEventListener('click', () => stepLife(lifeEvery() >= 10 ? 2 : 1));
    $('#random-more').addEventListener('click', () => stepRandom(1));
    $('#opt-crossfade').addEventListener('change', (e) => { settings.crossfade = e.target.checked; save(); });
    $('#opt-silence').addEventListener('change', (e) => { settings.silence = e.target.checked; save(); });
    $('#opt-awake').addEventListener('change', (e) => { settings.awake = e.target.checked; save(); settings.awake ? acquireWake() : releaseWake(); });
    $('#opt-silent').addEventListener('change', (e) => { settings.silent = e.target.checked; save(); applyAudioSession(); });
    document.querySelectorAll('[id^="vol-"][data-zone]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      settings.vol[g.dataset.zone] = b.dataset.v; save(); syncSettings();
      // Rebuild the cards of the table with their new controls.
      if (tbl) { tbl.all.forEach((v) => { v.card = null; }); setChapter(chapterIdx); }
    })));
    $('#opt-landscape').addEventListener('change', (e) => { settings.landscape = e.target.checked; save(); applyOrientation(); });
    if (window.BardAccount) window.BardAccount.mount($('#troubadour-account'));
    $('#app-version').textContent = `version ${VERSION}`;
    $('#app-device').textContent = DEV === 'tablet' ? 'Android tablet' : DEV;
    syncSettings();
  }
  function segment(sel, key, cast) {
    $(sel).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      settings[key] = cast(b.dataset.v); save();
      syncSettings();
    }));
  }
  function syncSettings() {
    document.querySelectorAll('#theme-pick .theme').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === TroubadourThemes.resolve(settings.theme))));
    document.querySelectorAll('#mode-pick button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.mode)));
    document.querySelectorAll('[id^="vol-"][data-zone]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.vol[g.dataset.zone]))));
    $('#opt-landscape').checked = settings.landscape;
    document.querySelectorAll('#fade-pick button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.v === settings.fade)));
    document.querySelectorAll('#fadein-pick button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.v === (settings.fadeIn ?? 1000))));
    $('#random-val').textContent = `${randomMax()} s`;
    $('#random-note').textContent = `Plays again after a pause of 0.5\u00a0s to ${randomMax()}\u00a0s`;
    $('#random-less').disabled = randomMax() <= 1;
    $('#opt-life').checked = !!settings.life;
    $('#life-val').textContent = `${lifeEvery()} s`;
    $('#life-note').textContent = `A new volume about every ${lifeEvery()}\u00a0s`;
    $('#life-less').disabled = !settings.life || lifeEvery() <= 2;
    $('#life-more').disabled = !settings.life || lifeEvery() >= 30;
    $('#life-row').classList.toggle('off', !settings.life);
    $('#random-more').disabled = randomMax() >= 10;
    $('#opt-crossfade').checked = settings.crossfade;
    $('#opt-silence').checked = !!settings.silence;
    $('#opt-awake').checked = settings.awake;
    $('#opt-silent').checked = settings.silent;
    applyTheme();
  }
  async function openSettings() {
    syncSettings();
    $('#settings').showModal();
    const info = $('#store-info');
    info.textContent = 'Checking…';
    const [p] = await Promise.all([DB.persistence(), refresh()]);
    const bytes = [...SIZES.values()].reduce((a, b) => a + b, 0);
    info.textContent = '';
    const line = el('p', 'store-line');
    line.append(el('b', '', size(bytes)), document.createTextNode(` of sounds in ${plural(STORIES.length, 'story', 'stories')} and the shared soundbox.`));
    info.append(line);
    const prot = el('p', `store-prot ${p.persisted ? 'ok' : 'warn'}`);
    prot.textContent = p.persisted
      ? 'Protected: iOS keeps your stories, even when space runs low.'
      : p.persisted === false
        ? `Not protected yet: ${IOS ? 'iOS' : 'Android'} may clear them if your ${DEV} runs out of space. Keep a backup with Export every story.`
        : 'This iOS version does not say whether your stories are protected. Keep a backup with Export every story.';
    info.append(prot);
    if (p.quota) info.append(el('p', 'muted small', `Room left for Troubadour: about ${size(Math.max(0, p.quota - (p.usage || 0)))}.`));
  }

  /* ================= Keep the screen awake ================= */
  let wake = null, videoAwake = false;
  const storyOpen = () => screen === 'table' || screen === 'editor';
  async function acquireWake() {
    if (!settings.awake || !storyOpen() || document.visibilityState !== 'visible') return;
    if ('wakeLock' in navigator && !wake) {
      try {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
        return;
      } catch (e) { wake = null; }
    }
    if (wake || videoAwake) return;
    // Fallback for iOS versions where the Wake Lock API is missing from Home Screen apps:
    // a tiny silent looping video keeps the display on while it plays.
    const v = $('#awake-video');
    if (!v.src) v.src = '261014_keep_awake.mp4';
    v.play().then(() => { videoAwake = true; }).catch(() => {});
  }
  function releaseWake() {
    if (wake) { wake.release().catch(() => {}); wake = null; }
    if (videoAwake) { $('#awake-video').pause(); videoAwake = false; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { acquireWake(); if (ctx && ctx.state !== 'running' && tbl) ctx.resume().catch(() => {}); }
    else { saveSoon.flush(); tableSave.flush(); }
  });
  // Wake lock and audio can only start from a tap on iPhone: retry on the next one.
  document.addEventListener('touchend', () => { if (settings.awake && storyOpen() && !wake && !videoAwake) acquireWake(); }, { passive: true });

  /** Leaving the table is asked first (it cuts the scene), then every sound fades out before the table closes. */
  async function leaveTable() {
    if (!tbl) { location.hash = '#/'; return; }
    const t = tbl;
    const v = await ask('Leave the story?', 'Every sound fades out and the table closes.', [
      { label: 'Stay', value: null }, { label: 'Leave', value: 'leave', cls: 'danger' },
    ]);
    if (v !== 'leave' || tbl !== t) return;
    const back = tableFrom === 'editor' ? `#/edit/${encodeURIComponent(t.story.uid)}/${chapterIdx + 1}` : '#/';
    const sounding = t.all.some((x) => x.active || x.waiting || (x.state === 'paused' && x.fadingOut));
    t.all.forEach((x) => x.end(settings.fade));
    pausedByAll = []; heldRandom = [];
    stopSoundbox();
    paintMaster();
    if (sounding) {
      busy('Leaving the table', t.story.title);
      await new Promise((r) => setTimeout(r, settings.fade + 60));
      if (tbl !== t) { idle(); return; }
    }
    location.hash = back;
  }

  /* ================= Wiring ================= */
  function renderStaticIcons() {
    document.querySelectorAll('[data-action="home"], [data-action="leave-table"]').forEach((b) => (b.innerHTML = ICON.back));
    document.querySelectorAll('[data-action="settings"]').forEach((b) => (b.innerHTML = ICON.gear));
    document.querySelectorAll('#soundbox [data-action="soundbox"], .set-head .ico').forEach((b) => (b.innerHTML = ICON.close));
    $('[data-action="story-info"]').innerHTML = ICON.info;
    $('[data-action="export-current"]').innerHTML = ICON.share;
    $('#sb-toggle .star').innerHTML = ICON.starFill;
    $('[data-action="stop-all"]').innerHTML = ICON.stop;
    document.querySelectorAll('.i-plus').forEach((n) => (n.outerHTML = ICON.plus));
    document.querySelectorAll('.i-import').forEach((n) => (n.outerHTML = ICON.import));
    document.querySelectorAll('.i-play').forEach((n) => (n.outerHTML = ICON.play));
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'home': location.hash = '#/'; break;
      case 'leave-table': leaveTable(); break;
      case 'settings': openSettings(); break;
      case 'soundbox': toggleSoundbox(); break;
      case 'pause-all': pauseAll(); break;
      case 'stop-all': stopAll(); break;
      case 'import': pickTroubadour(); break;
      case 'new-story': newStory(); break;
      case 'add-story': openAddStory(); break;
      case 'add-shared': openPicker({ ...SOUNDBOX_ZONE, label: 'the shared soundbox' }, SHARED, () => { saveShared(); renderShared(); }); break;
      case 'story-info': openStoryInfo(); break;
      case 'export-current': if (ed) { saveSoon.flush(); exportStories([ed.story]); } break;
      case 'play-current':
        if (ed) { saveSoon.flush(); audio(); const ch = ed.ch === 'soundbox' ? 1 : ed.ch + 1; location.hash = `#/play/${encodeURIComponent(ed.story.uid)}/${ch}`; }
        break;
      case 'export-all': $('#settings').close(); refresh().then(() => exportStories(STORIES)); break;
      case 'wipe': wipeAll(); break;
      case 'close-sheet': closeSheet(); break;
    }
  });
  let tableFrom = 'library';
  window.addEventListener('hashchange', (e) => {
    // Leaving the table goes back where it was opened from: the editor or the library.
    if (/#\/play\//.test(e.newURL) && !/#\/play\//.test(e.oldURL || '')) tableFrom = /#\/edit\//.test(e.oldURL || '') ? 'editor' : 'library';
    route();
  });

  async function wipeAll() {
    const v = await ask('Erase everything?', `Every story, sound and effect leaves this ${DEV} for good. Export your stories first if you want to keep them.`, [
      { label: 'Cancel', value: null }, { label: 'Erase', value: 'erase', cls: 'danger' },
    ]);
    if (v !== 'erase') return;
    $('#settings').close();
    closeTable();
    leaveEditor();
    await DB.wipe();
    lastTableStory = null;
    settings.pins = [];
    save();
    location.hash = '#/';
    await route();
    toast('Troubadour is empty again.');
  }

  $('#scrim').addEventListener('click', toggleSoundbox);
  ['#settings', '#sheet'].forEach((s) => $(s).addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }));
  WIDE.addEventListener?.('change', () => tbl && setSoundbox(!$('#soundbox').hidden));

  const master = $('#master'), masterVal = $('#master-val');
  master.value = settings.master; masterVal.textContent = Math.round(settings.master * 100); setP(master);
  master.addEventListener('input', () => {
    settings.master = +master.value; masterVal.textContent = Math.round(settings.master * 100); setP(master);
    if (masterGain) masterGain.gain.setTargetAtTime(curve(settings.master), ctx.currentTime, 0.03);
    save();
  });
  const sbVol = $('#sb-volume');
  sbVol.value = settings.sbVol; setP(sbVol);
  sbVol.addEventListener('input', () => {
    settings.sbVol = +sbVol.value; setP(sbVol);
    if (sbGain) sbGain.gain.setTargetAtTime(curve(settings.sbVol), ctx.currentTime, 0.03);
    save();
  });

  /* ================= Smooth volume sliders ================= */
  // Safari's own range inputs only move when the small thumb is hit exactly, ignore taps on the bar,
  // and lose the drag to the row that scrolls sideways. Here the whole bar is the handle:
  // touch anywhere on it, the value jumps under the finger and follows it, and nothing else scrolls.
  function rangeValue(input, clientX) {
    const r = input.getBoundingClientRect();
    const pad = 8; // half the thumb, so the ends are reachable
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
    input.classList.add('dragging');
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
      input.classList.remove('dragging');
      input.removeEventListener('pointermove', move);
      input.removeEventListener('pointerup', up);
      input.removeEventListener('pointercancel', up);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    input.addEventListener('pointermove', move);
    input.addEventListener('pointerup', up);
    input.addEventListener('pointercancel', up);
  }, { passive: false });

  /* ================= Orientation ================= */
  // iOS does not let a web app lock the screen: with Lock landscape on, an upright phone shows the
  // turn-your-phone screen. Where the browser can lock (Android), it is asked to.
  function applyOrientation() {
    root.classList.toggle('allow-portrait', !settings.landscape);
    try {
      if (screen.orientation && screen.orientation.lock) {
        if (settings.landscape) screen.orientation.lock('landscape').catch(() => {});
        else if (screen.orientation.unlock) screen.orientation.unlock();
      }
    } catch (e) { /* not supported */ }
    if (tbl) requestAnimationFrame(() => rollTitles($('#zones')));
  }
  applyOrientation();

  /* ================= Updates ================= */
  let updateReady = false;
  function reloadIfIdle() {
    if (!updateReady || tbl || !$('#busy').hidden || document.querySelector('dialog[open]')) return;
    if (ed) saveSoon.flush();
    setTimeout(() => location.reload(), 300);
  }
  window.addEventListener('hashchange', () => setTimeout(reloadIfIdle, 600));

  /* ================= Boot ================= */
  async function boot() {
    renderStaticIcons();
    buildSettings();
    applyAudioSession();
    if ('serviceWorker' in navigator) {
      // Updates: each time Troubadour comes back to the screen it checks for a new version.
      // When one has arrived, the app reloads by itself, never in the middle of a session at the table.
      navigator.serviceWorker.register('sw.js').then((reg) => {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      }).catch(() => {});
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) return;
        updateReady = true;
        reloadIfIdle();
      });
    }
    try {
      await DB.open();
      DB.persistence().catch(() => {});
    } catch (e) {
      document.body.append(el('p', 'fatal', `Troubadour cannot reach its storage on this ${DEV} (${e.message || e}). Close the app and open it again.`));
      return;
    }
    await route();
    scanDamage().catch(() => {});
  }
  boot();
})();
