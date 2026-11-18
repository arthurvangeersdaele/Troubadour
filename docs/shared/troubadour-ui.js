/* Troubadour shared kernel: the helpers every Troubadour web app had its own copy of (Ballade's flow-ui.js and
 * Map's map-ui.js were forks of each other). One file now, loaded before each app's own helpers:
 *
 *   TroubadourUI.make({ key, defaults, shared, migrate, icons, guard })  ->  the app's helper object
 *
 * What it unifies (261118_troubadour_unifier.md):
 *  - settings: each app keeps its own key, and the settings every app shares ('troubadour.settings') are listed
 *    once, here (SHARED), with one name each; a setting set in one app holds in all of them;
 *  - the volume curve: a slider value v is heard as v * v everywhere (Troubadour web, iPhone, Android, Map, Ballade);
 *  - theme, toast, busy veil, the question dialog, file delivery, the audio context and its limiter.
 * Tokens (colours, sizes, timings) live in tokens.css, built from troubadour.tokens.json. */
(function (global) {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  /** An interface icon on the charter's grid (24 x 24, 2 px stroke, round caps and joins). */
  function svg(body, size = 18, fill = false) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  /** The icons every app uses. An app adds its own with make({ icons }). */
  const ICON = {
    back: svg('<path d="M15 18l-6-6 6-6"/>', 20),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 19),
    close: svg('<path d="M18 6L6 18M6 6l12 12"/>', 18),
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>', 16, true),
    // A play glyph centred by eye in its circle (a triangle centred by its box looks pushed to the right).
    go: svg('<path d="M7.2 5.3v13.4a1 1 0 0 0 1.5.86l10.7-6.7a1 1 0 0 0 0-1.72L8.7 4.44a1 1 0 0 0-1.5.86z"/>', 16, true),
    // A gate on the wire: an arch with two closed doors.
    fork: svg('<circle cx="12" cy="3.6" r="1.4" fill="currentColor"/><path d="M12 4.6v5.4"/><path d="M12 10c0 3.6-5.5 4.2-5.5 8.4"/><path d="M12 10c0 3.6 5.5 4.2 5.5 8.4"/><circle cx="6.5" cy="19.4" r="1.6" fill="currentColor"/><circle cx="17.5" cy="19.4" r="1.6" fill="currentColor"/>', 20),
    gate: svg('<path d="M5 20.5V10a7 7 0 0 1 14 0v10.5"/><path d="M12 3.6v16.9"/><path d="M3.5 20.5h17"/><path d="M9.6 12.6v1.6M14.4 12.6v1.6"/>', 20),
    next: svg('<path d="M5.5 5.6v12.8a1 1 0 0 0 1.55.83l9.2-6.4a1 1 0 0 0 0-1.66l-9.2-6.4a1 1 0 0 0-1.55.83z"/><rect x="17.2" y="5" width="2.6" height="14" rx="1.1"/>', 16, true),
    pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>', 16, true),
    stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>', 14, true),
    star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', 18),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
    import: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>', 16),
    share: svg('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', 16),
    edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', 16),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 16),
    up: svg('<path d="M18 15l-6-6-6 6"/>', 14),
    down: svg('<path d="M6 9l6 6 6-6"/>', 14),
    skip: svg('<path d="M5 5l9 7-9 7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>', 16),
    more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>', 18),
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>', 14),
    hand: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.3 14a1.5 1.5 0 0 1 2.4-1.8L8 15"/>', 14),
    repeat: svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 13),
    infinity: svg('<path d="M6.5 8.5c-2 0-3.5 1.6-3.5 3.5s1.5 3.5 3.5 3.5c3.5 0 7.5-7 11-7 2 0 3.5 1.6 3.5 3.5s-1.5 3.5-3.5 3.5c-3.5 0-7.5-7-11-7z"/>', 14),
    random: svg('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>', 13),
    help: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 3.9"/><circle cx="12" cy="17.2" r=".9" fill="currentColor"/>', 16),
    once: svg('<path d="M5 12h11M13 8l4 4-4 4"/><path d="M20 6v12"/>', 13),
    tap: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.3 14a1.5 1.5 0 0 1 2.4-1.8L8 15"/>', 15),
    clock: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>', 15),
    follow: svg('<path d="M12 4v13M7 12l5 5 5-5"/><path d="M5 20.5h14"/>', 15),
  };

  /* ---------- Settings ---------- */
  /** The settings shared by every Troubadour player and builder, saved in 'troubadour.settings'.
   *  Left: the name in the app's own settings; right: the shared name (the Troubadour player's, and Android's key). */
  const SHARED = {
    theme: 'theme', mode: 'mode', fade: 'fade', fadeIn: 'fadeIn', crossfade: 'crossfade', randomMax: 'randomMax',
    life: 'life', lifeEvery: 'lifeEvery', awake: 'awake', master: 'master', silent: 'silent', even: 'even',
    sbVolume: 'sbVol', // the soundbox volume: sbVol in Troubadour (web, iPhone, Android), sbVolume in Ballade and Map
  };
  const BASE = 'troubadour.settings';
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };

  /** Fades offered everywhere (ms): Off, 0.5, 1, 2 or 4 s. An older value lands on the nearest one. */
  const FADES = [0, 500, 1000, 2000, 4000];
  /** A slider value (0 to 1) as it is heard: the same curve on every platform (TableSession.kt: curve). */
  const curve = (v) => v * v;

  function createSettings({ key, defaults, migrate }) {
    let s = readJSON(key);
    if (!s) { const b = readJSON(BASE) || {}; s = { theme: b.theme, mode: b.mode }; } // first run: Troubadour's look
    const out = Object.assign({}, defaults);
    Object.keys(defaults).forEach((k) => { if (s && s[k] != null) out[k] = s[k]; });
    const b = readJSON(BASE) || {};
    Object.keys(SHARED).forEach((k) => { if (k in defaults && b[SHARED[k]] != null) out[k] = b[SHARED[k]]; });
    if (defaults.vol) out.vol = Object.assign({}, defaults.vol, (s && s.vol) || {});
    if ('fade' in defaults && !FADES.includes(+out.fade)) out.fade = +out.fade > 2500 ? 4000 : 2000;
    if (migrate) migrate(out, s || {});
    return out;
  }
  function saveSettings(key, settings) {
    try {
      localStorage.setItem(key, JSON.stringify(settings));
      const b = readJSON(BASE) || {};
      Object.keys(SHARED).forEach((k) => { if (k in settings) b[SHARED[k]] = settings[k]; });
      localStorage.setItem(BASE, JSON.stringify(b));
      global.dispatchEvent(new CustomEvent('troubadour:settings'));
    } catch (e) { /* private mode */ }
  }
  function applyTheme(settings) {
    const root = document.documentElement;
    let mode = settings.mode;
    if (mode === 'system') mode = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    root.dataset.theme = global.TroubadourThemes ? TroubadourThemes.resolve(settings.theme) : settings.theme;
    root.dataset.mode = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.body || root).getPropertyValue('--bar').trim() || '#15151B';
  }

  /* ---------- Feedback ---------- */
  let toastTimer = 0;
  /** One sentence at the bottom, 2.8 s (charter 6.7); errors may stay up to 5 s. */
  function toast(msg, ms = 2800) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, Math.min(ms, 5000));
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
   *  With `field` ({ placeholder, max, value }), it also asks for a line of text: resolves with { value, text }. */
  function ask(title, text, buttons, field) {
    const dlg = $('#ask');
    $('#ask-title').textContent = title;
    $('#ask-text').textContent = text || '';
    $('#ask-text').hidden = !text;
    const acts = $('#ask-acts');
    acts.textContent = '';
    dlg.querySelectorAll('.ask-fields').forEach((o) => o.remove());
    let input = null, input2 = null, size = null;
    const box = el('div', 'ask-fields');
    const make = (f) => {
      const w = el('label', 'ask-f');
      if (f.label) w.append(el('span', 'ask-label', f.label));
      const i = el('input', 'ask-field');
      i.type = 'text';
      i.placeholder = f.placeholder || '';
      i.maxLength = f.max || 120;
      i.value = f.value || '';
      w.append(i);
      box.append(w);
      return i;
    };
    if (field) { input = make(field); acts.before(box); }
    // A second field (Map: a new world's name, then the name of its first map).
    if (field && field.second) input2 = make(field.second);
    // A choice of map size: [[label, value], ...] with the one picked.
    if (field && field.sizes) {
      size = field.sizes.value;
      const w = el('div', 'ask-f ask-size');
      w.append(el('span', 'ask-label', field.sizes.label || 'Map size'));
      const seg = el('div', 'seg small');
      seg.setAttribute('role', 'radiogroup');
      const paint = () => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === size)));
      field.sizes.options.forEach(([label, v]) => {
        const b = el('button', '', label); b.type = 'button'; b.dataset.v = v; b.setAttribute('role', 'radio');
        b.addEventListener('click', () => { size = v; paint(); });
        seg.append(b);
      });
      paint();
      w.append(seg);
      box.append(w);
    }
    return new Promise((resolve) => {
      let answered = false;
      const finish = (v) => {
        if (answered) return; answered = true;
        if (dlg.open) dlg.close();
        resolve(field ? (v == null ? null : { value: v, text: input.value.trim(), text2: input2 ? input2.value.trim() : '', size }) : v);
      };
      buttons.forEach((b) => {
        const x = el('button', `btn ${b.cls || ''}`, b.label);
        x.type = 'button';
        x.onclick = () => finish(b.value);
        acts.append(x);
      });
      if (input) {
        const main = buttons[buttons.length - 1];
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(main.value); } });
      }
      dlg.addEventListener('close', () => finish(null), { once: true });
      dlg.showModal();
      if (input) input.focus();
    });
  }

  /** Hands a file over: the share sheet on a phone (Files, AirDrop), a download elsewhere. */
  async function deliver(blob, fileName) {
    const file = new File([blob], fileName, { type: 'application/octet-stream' });
    const phone = !document.documentElement.classList.contains('pc');
    if (phone && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fileName }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return true;
  }

  /* ---------- Contextual sheet ---------- */
  /** The rows of a contextual sheet (the menu of a story, a tale, a world): [{ icon, label, sub, cls, run }].
   *  Same look in the Story builder, the online player, Ballade and Map (components.css: .t-menu). */
  function menuRows(items, onPick) {
    const body = el('div', 't-menu');
    items.filter(Boolean).forEach((it) => {
      const b = el('button', `t-menu-item ${it.cls || ''}`.trim());
      b.type = 'button';
      if (it.icon) { const i = el('span', 't-menu-ico'); i.innerHTML = it.icon; b.append(i); }
      const t = el('span'); t.append(el('b', '', it.label)); if (it.sub) t.append(el('small', '', it.sub));
      b.append(t);
      b.addEventListener('click', () => { if (onPick) onPick(it); if (it.run) it.run(); });
      body.append(b);
    });
    return body;
  }

  /** The helper object of one app. */
  function make({ key, defaults, migrate, icons, guard }) {
    const settings = createSettings({ key, defaults, migrate });
    let ctx = null, master = null;
    /** The audio context. `wake` resumes it (from a tap): reading the clock must never resume a paused table. */
    function audio(wake) {
      if (!ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        ctx = new AC({ latencyHint: 'playback' });
        master = ctx.createGain();
        master.gain.value = curve(settings.master);
        // A limiter after the master (the shared engine's): sounds evened out and stacked together never clip.
        const E = global.TroubadourEngine || global.BalladeEngine;
        if (E) { const lim = E.limiter(ctx); master.connect(lim); lim.connect(ctx.destination); } else master.connect(ctx.destination);
        // After a call, a lock or a switch of app, the sound comes back on its own (when the app wants it).
        if (E && guard) E.guard(ctx, guard);
      }
      if (wake && (ctx.state === 'suspended' || ctx.state === 'interrupted')) ctx.resume().catch(() => {});
      return { ctx, master };
    }
    function applyAudioSession() {
      try { if (navigator.audioSession) navigator.audioSession.type = settings.silent ? 'playback' : 'auto'; } catch (e) { /* older iOS */ }
    }
    async function decode(blob) {
      const { ctx: c } = audio();
      const data = await blob.arrayBuffer();
      return new Promise((ok, ko) => { const r = c.decodeAudioData(data, ok, ko); if (r && r.catch) r.catch(ko); });
    }
    return {
      $, el, svg, ICON: Object.assign({}, ICON, icons || {}), settings,
      saveSettings: () => saveSettings(key, settings), applyTheme: () => applyTheme(settings),
      toast, busy, idle, ask, deliver, audio, decode, applyAudioSession, curve, menuRows,
    };
  }

  global.TroubadourUI = { make, $, el, svg, ICON, SHARED, FADES, curve, toast, ask, deliver, menuRows, applyTheme, createSettings };
})(window);
