/* Troubadour Ballade: the timeline builder (261114_ballade_plan.md, P4 and the first codes of P5).
 *
 * A chapter is one timeline (format version 2, ballade-timeline.js): tracks across, every sound a clip at its own
 * time, cues where the table waits (gold flags), sections to read and jump (muted flags), a choice at the end whose
 * ways each continue the clock. The gold playhead is the chapter clock itself (BalladeTimeline.Clock), playing
 * through the shared engine: what is heard here is what the table hears.
 *
 * The timeline is kept with the story (rec.timeline) and lowered to version 1 steps for the player of today
 * (rec.flow, BalladeTimeline.toV1); an export writes both (timeline.json beside flow.json).
 */
(function (global) {
  'use strict';

  const { $, el, ICON, toast, busy, idle, audio, decode, settings } = global.FlowUI;
  const F = global.TroubadourBallade;
  const BT = global.BalladeTimeline;
  const EN = global.TroubadourEngine || global.BalladeEngine;

  const KINDS = ['music', 'ambience', 'events'];
  const KNAME = { music: 'Music', ambience: 'Ambiance', events: 'Events' };
  const HEAD = 176;       // px: the track headers
  const ROW = 64;         // px: a track
  const SNAP_PX = 8;      // px: how near a snap point pulls
  const HISTORY = 200;
  const r3 = (v) => Math.round(v * 1000) / 1000;

  const T = {
    rec: null, flow: null, ch: 0, way: [], sel: null, pps: 24, playhead: 0, snap: true,
    undo: [], redo: [], saveT: 0, onLeave: null, onPlay: null,
    clock: null, voices: new Map(), timer: 0, raf: 0, buffers: new Map(), peaks: new Map(), loading: null, drag: null,
  };

  /* ---------- Opening ---------- */

  /** Opens the timeline of a story: its own when it was built here, else made from its steps (every relative time kept). */
  async function open(rec, opts = {}) {
    T.rec = rec;
    T.onLeave = opts.onLeave || null; T.onPlay = opts.onPlay || null;
    T.ch = Math.max(0, Math.min(opts.chapter || 0, rec.story.chapters.length - 1));
    T.way = []; T.sel = null; T.undo = []; T.redo = []; T.playhead = 0;
    const fresh = !(rec.timeline && rec.timeline.version === BT.VERSION && (rec.timeline.chapters || []).length === (rec.flow.chapters || []).length);
    T.flow = fresh ? BT.fromV1(Object.assign({}, rec.flow, { version: 1 })) : BT.clean(rec.timeline);
    T.converted = fresh;
    T.blobs = await global.FlowDB.filesOf(rec);
    $('#tl-title').textContent = rec.story.title || 'New Ballade';
    $('#editor').hidden = true;
    $('#timeline').hidden = false;
    document.documentElement.dataset.screen = 'timeline';
    $('#tl-banner').hidden = !fresh;
    $('#tl-banner').textContent = fresh ? 'Made from the steps of this Ballade, every time kept. Check the cues: the table waits at each gold flag.' : '';
    fit();
    render();
  }
  function close() {
    stop();
    flush();
    T.rec = null; T.flow = null; T.buffers.clear(); T.blobs = null;
    $('#timeline').hidden = true;
  }

  /* ---------- What is edited ---------- */
  const chapterTl = () => T.flow.chapters[T.ch];
  /** The timeline the tabs show: the chapter's, or a way's (however deep). */
  function tlAt(way) {
    let tl = chapterTl();
    for (const k of way) { if (!tl.choice || !tl.choice.answers[k]) return null; tl = tl.choice.answers[k].timeline; }
    return tl;
  }
  const tl = () => { const t = tlAt(T.way); if (t) return t; T.way = []; return chapterTl(); };
  const fileLen = (f) => (T.rec.lengths && T.rec.lengths[f]) || (T.buffers.get(f) && T.buffers.get(f).duration) || null;
  const trackOf = (id) => tl().tracks.find((t) => t.id === id);
  const clipOf = (id) => tl().clips.find((c) => c.id === id);
  const markerOf = (id) => tl().markers.find((m) => m.id === id);
  const uid = (p) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  /** Where the timeline needs room to: its end, its markers, its choice, the playhead, plus a margin. */
  const span = () => Math.max(60, BT.endOf(tl()), ...tl().markers.map((m) => m.at), tl().choice ? tl().choice.at : 0, T.playhead) + 30;

  /* ---------- History and saving ---------- */
  const snap = () => JSON.stringify(T.flow.chapters[T.ch]);
  /** Every change goes through here: one step of the history, then saved. */
  function edit(fn, keepSel) {
    const before = snap();
    fn();
    if (snap() === before) return;
    T.undo.push({ ch: T.ch, s: before });
    if (T.undo.length > HISTORY) T.undo.shift();
    T.redo.length = 0;
    changed(keepSel);
  }
  function undoRedo(back) {
    const from = back ? T.undo : T.redo, to = back ? T.redo : T.undo;
    const st = from.pop();
    if (!st) { toast(back ? 'Nothing to undo.' : 'Nothing to redo.', 1400); return; }
    if (st.ch !== T.ch) { T.ch = st.ch; T.way = []; }
    to.push({ ch: st.ch, s: JSON.stringify(T.flow.chapters[st.ch]) });
    T.flow.chapters[st.ch] = JSON.parse(st.s);
    if (T.sel && !(T.sel.type === 'clip' ? clipOf(T.sel.id) : T.sel.type === 'marker' ? markerOf(T.sel.id) : T.sel.type === 'track' ? trackOf(T.sel.id) : tl().choice)) T.sel = null;
    changed(true);
  }
  function changed(keepSel) {
    if (!keepSel && T.sel && T.sel.type === 'clip' && !clipOf(T.sel.id)) T.sel = null;
    T.converted = false;
    $('#tl-banner').hidden = true;
    $('#tl-saved').textContent = 'Saving…';
    clearTimeout(T.saveT);
    T.saveT = setTimeout(flush, 500);
    render();
  }
  async function flush() {
    clearTimeout(T.saveT);
    if (!T.rec || !T.flow) return;
    // The timeline is the Ballade now; the player of today reads its steps.
    T.rec.timeline = BT.clean(T.flow);
    const low = BT.toV1(T.rec.timeline);
    T.rec.flow = Object.assign({}, T.rec.flow, { chapters: low.chapters });
    try { await global.FlowDB.put(T.rec); $('#tl-saved').textContent = 'Saved in this browser'; } catch (e) { $('#tl-saved').textContent = 'Not saved'; toast(`Could not save: ${e.message || e}`); }
  }

  /* ---------- Sounds: decoded on demand, peaks for the waveforms ---------- */
  async function buffer(file) {
    if (!T.rec) return null;
    if (T.buffers.has(file)) return T.buffers.get(file);
    const blob = T.blobs && T.blobs.get(file);
    if (!blob) return null;
    try {
      const b = await decode(blob);
      if (!T.rec) return null;
      const m = T.rec.flow.sounds && T.rec.flow.sounds[file];
      if (m && m.size === blob.size && m.b > m.a) b._ballade = { a: m.a, b: m.b, la: m.la, lb: m.lb, lufs: m.lufs, loops: new Map() };
      T.buffers.set(file, b);
      T.rec.lengths = T.rec.lengths || {};
      if (!T.rec.lengths[file]) T.rec.lengths[file] = Math.round(b.duration * 10) / 10;
      return b;
    } catch (e) { return null; }
  }
  /** The loudest sample of each 1/50 s of a sound, for its waveform. */
  function peaksOf(file) {
    if (T.peaks.has(file)) return T.peaks.get(file);
    const b = T.buffers.get(file);
    if (!b) return null;
    const per = Math.max(1, Math.floor(b.sampleRate / 50)), n = Math.ceil(b.length / per);
    const out = new Float32Array(n);
    for (let ch = 0; ch < Math.min(2, b.numberOfChannels); ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) { let m = 0; const e = Math.min(d.length, (i + 1) * per); for (let j = i * per; j < e; j += 4) { const a = Math.abs(d[j]); if (a > m) m = a; } if (m > out[i]) out[i] = m; }
    }
    let top = 0; for (let i = 0; i < n; i++) top = Math.max(top, out[i]);
    if (top > 0) for (let i = 0; i < n; i++) out[i] /= top;
    T.peaks.set(file, out);
    return out;
  }
  let peaksQueue = Promise.resolve();
  function wantPeaks(file) {
    if (T.peaks.has(file) || (T.wanted || (T.wanted = new Set())).has(file)) return;
    T.wanted.add(file);
    peaksQueue = peaksQueue.then(async () => { if (!T.rec) return; await buffer(file); peaksOf(file); if (T.rec) paintWaves(); });
  }

  /* ---------- Drawing ---------- */
  const x = (t) => t * T.pps;
  const tOf = (px) => px / T.pps;
  const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };

  function render() {
    if (!T.rec) return;
    renderTop();
    renderWays();
    renderMedia();
    renderTracks();
    renderInspector();
    paintTransport();
  }
  function renderTop() {
    const sel = $('#tl-chapter');
    sel.textContent = '';
    T.rec.story.chapters.forEach((c, i) => { const o = el('option', '', `${i + 1}. ${c.title || `Chapter ${i + 1}`}`); o.value = String(i); if (i === T.ch) o.selected = true; sel.append(o); });
    $('#tl-undo').disabled = !T.undo.length; $('#tl-redo').disabled = !T.redo.length;
    $('#tl-undo').title = T.undo.length ? `Undo (Ctrl+Z): ${T.undo.length} step${T.undo.length > 1 ? 's' : ''}` : 'Nothing to undo';
    $('#tl-redo').title = T.redo.length ? `Redo (Ctrl+Shift+Z): ${T.redo.length} step${T.redo.length > 1 ? 's' : ''}` : 'Nothing to redo';
  }
  /** The ways: "Before the choice" and its answers, one row per depth, as takes in a take folder. */
  function renderWays() {
    const box = $('#tl-ways');
    box.textContent = '';
    let t = chapterTl();
    if (!t.choice) { box.hidden = true; return; }
    box.hidden = false;
    for (let d = 0; t && t.choice; d++) {
      const row = el('div', 'tl-wayrow');
      const here = T.way.slice(0, d);
      const trunk = el('button', 'tl-way', d === 0 ? 'Before the choice' : 'This way');
      trunk.type = 'button';
      trunk.setAttribute('aria-pressed', String(T.way.length === d));
      trunk.addEventListener('click', () => { T.way = here; T.sel = null; render(); });
      row.append(el('span', 'tl-q', t.choice.question || 'The choice'), trunk);
      t.choice.answers.forEach((a, k) => {
        const b = el('button', 'tl-way', a.label || `Way ${k + 1}`);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(T.way.length > d && T.way[d] === k && T.way.length === d + 1));
        if (T.way.length > d + 1 && T.way[d] === k) b.classList.add('on-path');
        b.addEventListener('click', () => { T.way = here.concat(k); T.sel = null; render(); });
        row.append(b);
      });
      box.append(row);
      if (T.way.length > d) t = t.choice.answers[T.way[d]] && t.choice.answers[T.way[d]].timeline; else break;
    }
  }

  function renderMedia() {
    const box = $('#tl-media');
    box.textContent = '';
    box.append(el('h3', '', 'Sounds'));
    const all = F.soundsOf(T.rec.story).filter((s) => s.file);
    const groups = [['This chapter', all.filter((s) => s.chapter === T.ch)], ['Other chapters', all.filter((s) => s.chapter >= 0 && s.chapter !== T.ch)], ['Soundbox', all.filter((s) => s.chapter < 0)]];
    const seen = new Set();
    groups.forEach(([h, list]) => {
      list = list.filter((s) => { const k = `${s.file}|${s.zone}`; if (seen.has(k)) return false; seen.add(k); return true; });
      if (!list.length) return;
      box.append(el('h4', '', h));
      list.forEach((s) => {
        const kind = KINDS.includes(s.zone) ? s.zone : 'events';
        const row = el('div', `tl-snd k-${kind}`);
        row.draggable = true;
        row.title = `${s.name}: drag it onto a track, or add it at the playhead`;
        const len = fileLen(s.file);
        row.append(el('span', 'n', s.name), el('small', '', len ? fmt(len) : ''));
        const add = el('button', 'ico small', ''); add.type = 'button'; add.innerHTML = ICON.plus; add.setAttribute('aria-label', `Add ${s.name} at the playhead`);
        add.addEventListener('click', () => addSound(s, null, T.playhead));
        row.append(add);
        row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-ballade-sound', JSON.stringify(s)); e.dataTransfer.effectAllowed = 'copy'; });
        box.append(row);
      });
    });
    if (!seen.size) box.append(el('p', 'tl-hint', 'This story has no sounds yet: add them in the steps view.'));
  }

  function renderTracks() {
    const t = tl();
    const W = HEAD + x(span());
    const root = $('#tl-tracks');
    const keepX = root.scrollLeft, keepY = root.scrollTop;
    root.textContent = '';
    const inner = el('div', 'tl-inner');
    inner.style.width = `${W}px`;
    // The ruler, its flags, and the corner (add a track).
    const rr = el('div', 'tl-rrow');
    const corner = el('div', 'tl-corner');
    const addT = el('button', 'btn slim', 'Add a track'); addT.type = 'button';
    addT.addEventListener('click', () => addTrack('events'));
    corner.append(addT);
    const ruler = el('div', 'tl-ruler');
    ruler.style.width = `${x(span())}px`;
    const cv = el('canvas'); ruler.append(cv);
    T.rulerCv = cv;
    t.markers.forEach((m) => ruler.append(flag(m)));
    if (t.choice) ruler.append(choiceFlag(t.choice));
    ruler.addEventListener('pointerdown', rulerDown);
    rr.append(corner, ruler);
    inner.append(rr);
    // The tracks.
    const lanes = el('div', 'tl-lanes');
    if (!t.tracks.length) lanes.append(el('p', 'tl-hint tl-empty', 'Drag a sound from the left onto this space, or add a track.'));
    t.tracks.forEach((tr) => {
      const row = el('div', `tl-track k-${tr.kind}${tr.mute ? ' muted' : ''}`);
      row.dataset.track = tr.id;
      const head = el('div', 'tl-head');
      if (T.sel && T.sel.type === 'track' && T.sel.id === tr.id) head.classList.add('sel');
      const nm = el('button', 'tl-tname', tr.name || KNAME[tr.kind]); nm.type = 'button';
      nm.addEventListener('click', () => { T.sel = { type: 'track', id: tr.id }; renderTracks(); renderInspector(); });
      const mute = el('button', 'tl-mute', 'M'); mute.type = 'button';
      mute.setAttribute('aria-pressed', String(!!tr.mute)); mute.title = tr.mute ? 'Unmute this track' : 'Mute this track (it is left out at the table)';
      mute.addEventListener('click', () => edit(() => { tr.mute = !tr.mute; }));
      head.append(el('i', 'strip'), nm, mute);
      const lane = el('div', 'tl-lane');
      lane.dataset.track = tr.id;
      lane.style.width = `${x(span())}px`;
      t.clips.filter((c) => c.track === tr.id).forEach((c) => lane.append(clipEl(c)));
      lane.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-ballade-sound')) { e.preventDefault(); lane.classList.add('over'); } });
      lane.addEventListener('dragleave', () => lane.classList.remove('over'));
      lane.addEventListener('drop', (e) => {
        lane.classList.remove('over');
        const d = e.dataTransfer.getData('text/x-ballade-sound');
        if (!d) return;
        e.preventDefault();
        const r = lane.getBoundingClientRect();
        addSound(JSON.parse(d), tr.id, snapTime(Math.max(0, tOf(e.clientX - r.left)), null));
      });
      lane.addEventListener('pointerdown', (e) => { if (e.target === lane) { T.sel = null; setPlayhead(snapTime(tOf(e.clientX - lane.getBoundingClientRect().left), null)); renderTracks(); renderInspector(); } });
      row.append(head, lane);
      lanes.append(row);
    });
    // A free space under the tracks takes a sound too (a new track of its kind).
    const free = el('div', 'tl-free');
    free.style.width = `${W}px`;
    free.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-ballade-sound')) { e.preventDefault(); free.classList.add('over'); } });
    free.addEventListener('dragleave', () => free.classList.remove('over'));
    free.addEventListener('drop', (e) => {
      free.classList.remove('over');
      const d = e.dataTransfer.getData('text/x-ballade-sound');
      if (!d) return;
      e.preventDefault();
      const r = free.getBoundingClientRect();
      addSound(JSON.parse(d), 'new', snapTime(Math.max(0, tOf(e.clientX - r.left - HEAD)), null));
    });
    lanes.append(free);
    inner.append(lanes);
    // Markers as lines across the tracks, and the gold playhead.
    t.markers.forEach((m) => { const ln = el('i', `tl-mline ${m.type}`); ln.style.left = `${HEAD + x(m.at)}px`; inner.append(ln); });
    if (t.choice) { const ln = el('i', 'tl-mline choice'); ln.style.left = `${HEAD + x(t.choice.at)}px`; inner.append(ln); }
    const ph = el('i', 'tl-playhead'); ph.id = 'tl-ph';
    inner.append(ph);
    const sg = el('i', 'tl-snapline'); sg.id = 'tl-snapline'; sg.hidden = true;
    inner.append(sg);
    root.append(inner);
    root.scrollLeft = keepX; root.scrollTop = keepY;
    paintRuler();
    paintPlayhead();
    paintWaves();
  }

  function clipEl(c) {
    const len = fileLen(c.file);
    const d = el('div', `tl-clip k-${c.kind}${c.loop !== 'once' ? ' loops' : ''}`);
    if (T.sel && T.sel.type === 'clip' && T.sel.id === c.id) d.classList.add('sel');
    d.dataset.clip = c.id;
    d.style.left = `${x(c.at)}px`;
    d.style.width = `${Math.max(6, x(c.length))}px`;
    const cv = el('canvas', 'wave'); d.append(cv);
    const top = el('div', 'cap');
    top.append(el('b', '', c.name));
    if (c.holdToCue) { const h = el('span', 'badge', '∞'); h.title = 'Holds: loops on while the table waits at a cue'; top.append(h); }
    if (c.loop === 'random') top.append(el('span', 'badge', 'random'));
    d.append(top);
    // A loop longer than its sound: a notch at every turn.
    if (c.loop === 'loop' && len) {
      const per = Math.max(0.05, len - (c.in || 0));
      for (let k = per; k < c.length - 0.01 && k / per < 200; k += per) { const n = el('i', 'notch'); n.style.left = `${x(k)}px`; d.append(n); }
    }
    // Fades, as gold ramps in the corners.
    if (c.fadeIn > 0) { const f = el('i', 'fade in'); f.style.width = `${x(Math.min(c.fadeIn, c.length))}px`; d.append(f); }
    if (c.fadeOut > 0) { const f = el('i', 'fade out'); f.style.width = `${x(Math.min(c.fadeOut, c.length))}px`; d.append(f); }
    d.append(el('i', 'edge l'), el('i', 'edge r'));
    d.addEventListener('pointerdown', (e) => clipDown(e, c, d));
    d.addEventListener('dblclick', () => { setPlayhead(c.at); });
    if (!T.peaks.has(c.file)) wantPeaks(c.file);
    return d;
  }
  function paintWaves() {
    document.querySelectorAll('#tl-tracks .tl-clip').forEach((d) => {
      const c = clipOf(d.dataset.clip);
      const cv = d.querySelector('canvas.wave');
      const pk = c && T.peaks.get(c.file);
      if (!c || !pk || !cv) return;
      const w = Math.min(4096, Math.max(6, Math.round(x(c.length)))), h = ROW - 22;
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      g.fillStyle = getComputedStyle(d).getPropertyValue('--k').trim() || '#888';
      g.globalAlpha = 0.7;
      const len = pk.length / 50, from = c.in || 0;
      const per = Math.max(0.05, len - from);
      for (let px = 0; px < w; px++) {
        const t = (px / w) * c.length;
        let ft;
        if (c.loop === 'once' || c.loop === 'random') ft = from + (c.loop === 'random' ? t % Math.max(0.05, (c.each || len) ) : t);
        else ft = from + (t % per);
        const v = pk[Math.min(pk.length - 1, Math.floor(ft * 50))] || 0;
        if (ft > len) continue;
        const a = Math.max(0.5, v * (h / 2 - 1));
        g.fillRect(px, h / 2 - a, 1, a * 2);
      }
    });
  }
  function paintRuler() {
    const cv = T.rulerCv;
    if (!cv) return;
    const w = Math.round(x(span())), h = 28;
    const dpr = Math.min(2, global.devicePixelRatio || 1);
    cv.width = Math.round(Math.min(32000, w) * dpr); cv.height = h * dpr;
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    g.strokeStyle = cs.getPropertyValue('--line').trim(); g.fillStyle = cs.getPropertyValue('--muted').trim();
    g.font = '500 11px "Barlow Semi Condensed", system-ui, sans-serif'; g.textBaseline = 'top';
    // A label every 1, 5, 10, 30 or 60 s, whichever leaves at least 70 px between two.
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => x(s) >= 70) || 600;
    const minor = step >= 10 ? step / 5 : step / 2;
    for (let t = 0; x(t) <= w; t += minor) {
      const px = Math.round(x(t)) + 0.5, major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      g.beginPath(); g.moveTo(px, major ? 12 : 20); g.lineTo(px, h); g.stroke();
      if (major) g.fillText(fmt(t).replace(/\.0$/, ''), px + 3, 2);
    }
  }
  function flag(m) {
    const f = el('button', `tl-flag ${m.type}`);
    f.type = 'button';
    f.style.left = `${x(m.at)}px`;
    if (T.sel && T.sel.type === 'marker' && T.sel.id === m.id) f.classList.add('sel');
    f.append(el('span', '', m.name || (m.type === 'cue' ? 'Cue' : 'Section')));
    f.title = m.type === 'cue' ? `Cue at ${fmt(m.at)}: the table waits here for Go` : `Section at ${fmt(m.at)}`;
    f.addEventListener('pointerdown', (e) => markerDown(e, m, f));
    return f;
  }
  function choiceFlag(c) {
    const f = el('button', 'tl-flag choice');
    f.type = 'button';
    f.style.left = `${x(c.at)}px`;
    if (T.sel && T.sel.type === 'choice') f.classList.add('sel');
    f.append(el('span', '', c.question || 'The choice'));
    f.title = `The choice at ${fmt(c.at)}: the table picks a way`;
    f.addEventListener('pointerdown', (e) => markerDown(e, c, f, true));
    return f;
  }
  function paintPlayhead() {
    const ph = $('#tl-ph');
    if (!ph) return;
    const playing = T.clock && T.clock.tl === tl();
    const p = playing ? T.clock.position() : T.playhead;
    ph.hidden = !!(T.clock && T.clock.tl !== tl());
    ph.style.transform = `translateX(${HEAD + x(p)}px)`;
    $('#tl-time').textContent = fmt(T.clock ? T.clock.position() : T.playhead);
  }

  /* ---------- The inspector ---------- */
  function field(label, input, hint) {
    const f = el('label', 'tl-field');
    f.append(el('span', '', label), input);
    if (hint) f.append(el('small', '', hint));
    return f;
  }
  function numIn(v, step, min, max, on) {
    const i = el('input'); i.type = 'number'; i.step = step; i.min = min; i.max = max; i.value = String(v);
    i.addEventListener('change', () => { const n = Number(i.value); if (Number.isFinite(n)) edit(() => on(Math.min(max, Math.max(min, n))), true); });
    return i;
  }
  function textIn(v, max, on, ph) {
    const i = el('input'); i.type = 'text'; i.maxLength = max; i.value = v || ''; if (ph) i.placeholder = ph;
    i.addEventListener('change', () => edit(() => on(i.value.trim()), true));
    return i;
  }
  function seg(options, value, on) {
    const s = el('div', 'seg small'); s.setAttribute('role', 'radiogroup');
    options.forEach(([v, label]) => { const b = el('button', '', label); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(v === value)); b.addEventListener('click', () => edit(() => on(v), true)); s.append(b); });
    return s;
  }
  function renderInspector() {
    const box = $('#tl-inspector');
    box.textContent = '';
    const s = T.sel;
    const t = tl();
    if (s && s.type === 'clip' && clipOf(s.id)) {
      const c = clipOf(s.id);
      box.append(el('h3', '', c.name), el('p', 'tl-kind', `${KNAME[c.kind]} on ${(trackOf(c.track) || {}).name || 'a track'}`));
      box.append(field('Plays', seg([['once', 'Once'], ['loop', 'Loop'], ['random', 'Random']], c.loop, (v) => {
        c.loop = v;
        if (v === 'random') { c.each = c.each || Math.min(c.length, fileLen(c.file) || c.length); c.gapMin = c.gapMin ?? 5; c.gapMax = c.gapMax ?? 30; } else { delete c.each; delete c.gapMin; delete c.gapMax; }
        if (v === 'once') { c.holdToCue = false; const fl = fileLen(c.file); if (fl) c.length = r3(Math.min(c.length, Math.max(0.05, fl - (c.in || 0)))); }
      })));
      if (c.loop !== 'once') {
        const hold = el('input'); hold.type = 'checkbox'; hold.checked = !!c.holdToCue;
        hold.addEventListener('change', () => edit(() => { c.holdToCue = hold.checked; }, true));
        box.append(field('Holds at a cue', hold, 'Loops on while the table waits at the cue it crosses, and fades out at Go.'));
      }
      box.append(
        field('Starts at (s)', numIn(c.at, 0.1, 0, 14400, (v) => { c.at = r3(v); })),
        field('Length (s)', numIn(c.length, 0.1, 0.05, 14400, (v) => { c.length = r3(v); })),
        field('From (s into the sound)', numIn(c.in || 0, 0.1, 0, 14400, (v) => { c.in = r3(v); })),
        field('Fade in (s)', numIn(c.fadeIn, 0.1, 0, 30, (v) => { c.fadeIn = r3(v); })),
        field('Fade out (s)', numIn(c.fadeOut, 0.1, 0, 30, (v) => { c.fadeOut = r3(v); })),
      );
      if (c.loop === 'random') box.append(
        field('Each play (s)', numIn(c.each || c.length, 0.1, 0.05, 600, (v) => { c.each = r3(v); })),
        field('Pause, shortest (s)', numIn(c.gapMin ?? 5, 0.5, 0, 600, (v) => { c.gapMin = r3(v); if (c.gapMax < v) c.gapMax = r3(v); })),
        field('Pause, longest (s)', numIn(c.gapMax ?? 30, 0.5, 0, 600, (v) => { c.gapMax = r3(Math.max(v, c.gapMin || 0)); })),
      );
      const vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = c.volume;
      const vb = el('b', '', `${Math.round(c.volume * 100)}`);
      vol.addEventListener('input', () => { vb.textContent = `${Math.round(vol.value * 100)}`; const v = T.voices.get(c.id); if (v && v.g && !v.random) v.g.gain.setTargetAtTime(Number(vol.value) * (v.norm || 1) * trackVol(c), audio().ctx.currentTime, 0.03); });
      vol.addEventListener('change', () => edit(() => { c.volume = Math.round(Number(vol.value) * 100) / 100; }, true));
      const vr = el('div', 'tl-vol'); vr.append(vol, vb);
      box.append(field('Volume', vr));
      const del = el('button', 'btn slim danger', 'Delete this sound'); del.type = 'button';
      del.addEventListener('click', () => deleteSel());
      box.append(del);
    } else if (s && s.type === 'marker' && markerOf(s.id)) {
      const m = markerOf(s.id);
      box.append(el('h3', '', m.type === 'cue' ? 'Cue' : 'Section'));
      box.append(field('Name', textIn(m.name, 80, (v) => { m.name = v; }, m.type === 'cue' ? 'What the table waits for' : 'A name to read')));
      box.append(field('Kind', seg([['cue', 'Cue: the table waits'], ['section', 'Section: a name only']], m.type, (v) => { m.type = v; })));
      box.append(field('At (s)', numIn(m.at, 0.1, 0, 14400, (v) => { m.at = r3(v); })));
      const del = el('button', 'btn slim danger', m.type === 'cue' ? 'Delete this cue' : 'Delete this section'); del.type = 'button';
      del.addEventListener('click', () => deleteSel());
      box.append(del);
    } else if (s && s.type === 'track' && trackOf(s.id)) {
      const tr = trackOf(s.id);
      box.append(el('h3', '', tr.name || KNAME[tr.kind]));
      box.append(field('Name', textIn(tr.name, 60, (v) => { tr.name = v; })));
      box.append(field('Kind', seg(KINDS.map((k) => [k, KNAME[k]]), tr.kind, (v) => { tr.kind = v; t.clips.forEach((c) => { if (c.track === tr.id) c.kind = v; }); }), 'Sets its colour and how loud its sounds are evened out.'));
      const vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = tr.volume;
      vol.addEventListener('change', () => edit(() => { tr.volume = Math.round(Number(vol.value) * 100) / 100; }, true));
      box.append(field('Volume of the track', vol));
      const del = el('button', 'btn slim danger', 'Delete this track and its sounds'); del.type = 'button';
      del.addEventListener('click', () => deleteSel());
      box.append(del);
    } else if (s && s.type === 'choice' && t.choice) {
      const c = t.choice;
      box.append(el('h3', '', 'The choice'));
      box.append(field('Question', textIn(c.question, 140, (v) => { c.question = v; }, 'What the table decides')));
      box.append(field('Comes at (s)', numIn(c.at, 0.1, 0, 14400, (v) => { c.at = r3(v); }), 'The clock waits here for the table to pick a way. Each way then plays on from its own start.'));
      c.answers.forEach((a, k) => {
        const row = el('div', 'tl-answer');
        row.append(textIn(a.label, 60, (v) => { a.label = v || `Way ${k + 1}`; }, `Way ${k + 1}`));
        if (c.answers.length > 2) { const x_ = el('button', 'ico small', ''); x_.type = 'button'; x_.innerHTML = ICON.trash; x_.title = 'Remove this way'; x_.addEventListener('click', () => edit(() => { c.answers.splice(k, 1); })); row.append(x_); }
        box.append(row);
      });
      const add = el('button', 'btn slim', 'Add a way'); add.type = 'button';
      add.addEventListener('click', () => edit(() => { c.answers.push({ label: `Way ${c.answers.length + 1}`, timeline: { tracks: [], clips: [], markers: [] } }); }));
      const del = el('button', 'btn slim danger', 'Remove the choice and its ways'); del.type = 'button';
      del.addEventListener('click', () => deleteSel());
      box.append(add, del);
    } else {
      const ch = T.rec.story.chapters[T.ch] || {};
      box.append(el('h3', '', ch.title || `Chapter ${T.ch + 1}`));
      const end = BT.endOf(t), cues = t.markers.filter((m) => m.type === 'cue').length;
      box.append(el('p', 'tl-kind', `${t.clips.length} sound${t.clips.length === 1 ? '' : 's'} on ${t.tracks.length} track${t.tracks.length === 1 ? '' : 's'}, ${fmt(end)} long, ${cues} cue${cues === 1 ? '' : 's'}${t.choice ? ', then a choice' : ''}.`));
      box.append(el('p', 'tl-hint', 'The table taps Begin, then Go at each gold cue, and picks a way at the choice. Nothing else needs a tap.'));
      if (!t.choice) {
        const add = el('button', 'btn slim', 'Add a choice at the end'); add.type = 'button';
        add.addEventListener('click', () => edit(() => { t.choice = { question: '', at: r3(BT.endOf(t)), answers: [{ label: 'Way 1', timeline: { tracks: [], clips: [], markers: [] } }, { label: 'Way 2', timeline: { tracks: [], clips: [], markers: [] } }] }; T.sel = { type: 'choice' }; }, true));
        box.append(add);
      }
      box.append(el('p', 'tl-hint', 'Keys: Space plays from the playhead, C adds a cue, M a section, S cuts a sound at the playhead, arrows nudge, Delete removes, Ctrl+Z undoes.'));
    }
  }

  /* ---------- Editing ---------- */
  function addTrack(kind) {
    let id;
    edit(() => {
      const t = tl();
      const n = t.tracks.filter((x_) => x_.kind === kind).length;
      id = uid('t');
      t.tracks.push({ id, name: KNAME[kind] + (n ? ` ${n + 1}` : ''), kind, volume: 1, mute: false });
      T.sel = { type: 'track', id };
    }, true);
    return id;
  }
  /** A sound of the story laid on a track (null: the first of its kind, 'new': a new one) at `at`. */
  async function addSound(s, trackId, at) {
    const kind = KINDS.includes(s.zone) ? s.zone : 'events';
    let len = fileLen(s.file);
    if (!len) { await buffer(s.file); len = fileLen(s.file) || 10; }
    edit(() => {
      const t = tl();
      let tr = trackId && trackId !== 'new' ? trackOf(trackId) : null;
      if (!tr && trackId !== 'new') tr = t.tracks.find((x_) => x_.kind === kind && !t.clips.some((c) => c.track === x_.id && c.at < at + len && c.at + c.length > at));
      if (!tr) {
        const n = t.tracks.filter((x_) => x_.kind === kind).length;
        tr = { id: uid('t'), name: KNAME[kind] + (n ? ` ${n + 1}` : ''), kind, volume: 1, mute: false };
        t.tracks.push(tr);
      }
      const loops = !!s.loop || kind !== 'events';
      const c = {
        id: uid('c'), track: tr.id, name: s.name || 'Sound', file: s.file, kind: tr.kind, at: r3(at), in: 0,
        length: r3(loops ? Math.max(len, 30) : len), loop: loops ? 'loop' : 'once', fadeIn: kind === 'events' ? 0 : 2, fadeOut: kind === 'events' ? 0 : 2,
        fadeCurve: 'equal-power', volume: s.volume != null ? s.volume : 0.75, holdToCue: false,
      };
      t.clips.push(c);
      T.sel = { type: 'clip', id: c.id };
    }, true);
  }
  function deleteSel() {
    const s = T.sel;
    if (!s) return;
    edit(() => {
      const t = tl();
      if (s.type === 'clip') t.clips = t.clips.filter((c) => c.id !== s.id);
      else if (s.type === 'marker') t.markers = t.markers.filter((m) => m.id !== s.id);
      else if (s.type === 'track') { t.tracks = t.tracks.filter((x_) => x_.id !== s.id); t.clips = t.clips.filter((c) => c.track !== s.id); }
      else if (s.type === 'choice') { delete t.choice; if (T.way.length) T.way = []; }
      T.sel = null;
    }, true);
  }
  function addMarker(type) {
    edit(() => {
      const t = tl();
      const at = r3(T.clock ? T.clock.position() : T.playhead);
      if (t.markers.some((m) => Math.abs(m.at - at) < 0.05 && m.type === type)) return;
      const m = { id: uid(type === 'cue' ? 'q' : 's'), type, at, name: '' };
      t.markers.push(m);
      t.markers.sort((a, b) => a.at - b.at);
      T.sel = { type: 'marker', id: m.id };
    }, true);
  }
  /** S: the selected sound cut in two at the playhead. */
  function split() {
    const c = T.sel && T.sel.type === 'clip' && clipOf(T.sel.id);
    const p = T.playhead;
    if (!c || p <= c.at + 0.05 || p >= c.at + c.length - 0.05) { toast('Put the playhead over the selected sound to cut it there.', 2000); return; }
    edit(() => {
      const t = tl();
      const k = r3(p - c.at), len = fileLen(c.file);
      const b = JSON.parse(JSON.stringify(c));
      b.id = uid('c'); b.at = r3(p); b.length = r3(c.length - k); b.fadeIn = 0;
      if (c.loop === 'loop' && len) { const per = Math.max(0.05, len - (c.in || 0)); b.in = r3((c.in || 0) + (k % per)); } else if (c.loop === 'once') b.in = r3((c.in || 0) + k);
      c.length = k; c.fadeOut = 0;
      t.clips.push(b);
      T.sel = { type: 'clip', id: b.id };
    }, true);
  }
  function nudge(d) {
    const s = T.sel;
    if (!s) return;
    edit(() => {
      if (s.type === 'clip') { const c = clipOf(s.id); if (c) c.at = r3(Math.max(0, c.at + d)); }
      else if (s.type === 'marker') { const m = markerOf(s.id); if (m) { m.at = r3(Math.max(0, m.at + d)); tl().markers.sort((a, b) => a.at - b.at); } }
      else if (s.type === 'choice' && tl().choice) tl().choice.at = r3(Math.max(0, tl().choice.at + d));
    }, true);
  }

  /* ---------- Snapping ---------- */
  /** The times something dragged sticks to: the start, the playhead, markers, the choice, other clips' edges. */
  function snapPoints(exceptId) {
    const t = tl(), pts = [0, T.playhead];
    t.markers.forEach((m) => pts.push(m.at));
    if (t.choice) pts.push(t.choice.at);
    t.clips.forEach((c) => { if (c.id !== exceptId) pts.push(c.at, c.at + c.length); });
    return pts;
  }
  /** The nearest snap point within reach of v: { t, d } (null when none). */
  function snapNear(v, exceptId, extra) {
    if (!T.snap) return null;
    let best = null;
    snapPoints(exceptId).concat(extra || []).forEach((p) => { const d = Math.abs(p - v); if (x(d) <= SNAP_PX && (!best || d < best.d)) best = { d, t: p }; });
    return best;
  }
  /** Otherwise a tenth of a second (a whole second when zoomed far out). */
  const grid = (v) => { const g = T.pps < 6 ? 1 : 0.1; return r3(Math.round(v / g) * g); };
  function snapTime(v, exceptId, extra) {
    if (!T.snap) return r3(v);
    const best = snapNear(v, exceptId, extra);
    showSnap(best ? best.t : null);
    return best ? r3(best.t) : grid(v);
  }
  function showSnap(at) {
    const s = $('#tl-snapline');
    if (!s) return;
    s.hidden = at == null;
    if (at != null) s.style.left = `${HEAD + x(at)}px`;
  }

  /* ---------- Dragging ---------- */
  function clipDown(e, c, d) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    T.sel = { type: 'clip', id: c.id };
    const r = d.getBoundingClientRect();
    const edge = e.clientX - r.left < 8 ? 'l' : r.right - e.clientX < 8 ? 'r' : null;
    const len = fileLen(c.file);
    T.drag = { kind: edge ? `trim-${edge}` : 'move', c, x0: e.clientX, y0: e.clientY, at0: c.at, len0: c.length, in0: c.in || 0, track0: c.track, before: snap(), moved: false, alt: e.altKey, fl: len };
    d.setPointerCapture(e.pointerId);
    d.addEventListener('pointermove', dragMove);
    d.addEventListener('pointerup', dragUp, { once: true });
    d.addEventListener('pointercancel', dragUp, { once: true });
    document.querySelectorAll('#tl-tracks .tl-clip.sel').forEach((n) => n.classList.remove('sel'));
    d.classList.add('sel');
    renderInspector();
  }
  function dragMove(e) {
    const g = T.drag;
    if (!g) return;
    const dx = e.clientX - g.x0;
    if (!g.moved && Math.abs(dx) < 3 && Math.abs(e.clientY - g.y0) < 3) return;
    g.moved = true;
    const c = g.c, dt = tOf(dx);
    if (g.kind === 'move') {
      // Its start or its end sticks to what is near.
      const want = Math.max(0, g.at0 + dt);
      const a = snapNear(want, c.id), b = snapNear(want + c.length, c.id);
      if (!T.snap) c.at = r3(want);
      else if (a && (!b || a.d <= b.d)) { c.at = r3(a.t); showSnap(a.t); }
      else if (b) { c.at = r3(Math.max(0, b.t - c.length)); showSnap(b.t); }
      else { c.at = grid(want); showSnap(null); }
      // Up or down: onto another track (its kind follows).
      const lane = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList && n.classList.contains('tl-lane'));
      if (lane && lane.dataset.track !== c.track) { const tr = trackOf(lane.dataset.track); if (tr) { c.track = tr.id; c.kind = tr.kind; } }
    } else if (g.kind === 'trim-r') {
      let end = snapTime(g.at0 + g.len0 + dt, c.id);
      // A sound played once cannot outlast itself; a loop can (its turns show as notches).
      if (c.loop === 'once' && g.fl) end = Math.min(end, g.at0 + Math.max(0.05, g.fl - g.in0));
      c.length = r3(Math.max(0.1, end - g.at0));
    } else if (g.kind === 'trim-l') {
      let at = snapTime(g.at0 + dt, c.id);
      at = Math.min(at, g.at0 + g.len0 - 0.1);
      if (c.loop === 'once') at = Math.max(at, g.at0 - g.in0); // not before the sound's own start
      at = Math.max(0, at);
      const k = at - g.at0;
      c.at = r3(at); c.length = r3(g.len0 - k);
      if (c.loop === 'once') c.in = r3(Math.max(0, g.in0 + k));
    }
    // Moved without a redraw of everything: only this clip.
    const d = document.querySelector(`#tl-tracks .tl-clip[data-clip="${c.id}"]`);
    if (d) {
      if (d.parentNode.dataset.track !== c.track) { const lane = document.querySelector(`#tl-tracks .tl-lane[data-track="${c.track}"]`); if (lane) lane.append(d); d.className = d.className.replace(/k-\w+/, `k-${c.kind}`); }
      d.style.left = `${x(c.at)}px`; d.style.width = `${Math.max(6, x(c.length))}px`;
    }
    $('#tl-time').textContent = fmt(g.kind === 'trim-r' ? c.at + c.length : c.at);
  }
  function dragUp(e) {
    const g = T.drag;
    T.drag = null;
    if (e && e.currentTarget) e.currentTarget.removeEventListener('pointermove', dragMove);
    showSnap(null);
    if (!g) return;
    if (g.moved && snap() !== g.before) {
      T.undo.push({ ch: T.ch, s: g.before });
      if (T.undo.length > HISTORY) T.undo.shift();
      T.redo.length = 0;
      changed(true);
    } else { renderTracks(); renderInspector(); }
  }
  function markerDown(e, m, f, isChoice) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    T.sel = isChoice ? { type: 'choice' } : { type: 'marker', id: m.id };
    const g = { x0: e.clientX, at0: m.at, before: snap(), moved: false };
    f.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dx = ev.clientX - g.x0;
      if (!g.moved && Math.abs(dx) < 3) return;
      g.moved = true;
      m.at = Math.max(0, snapTime(g.at0 + tOf(dx), null, []));
      f.style.left = `${x(m.at)}px`;
      const lines = document.querySelectorAll(`#tl-tracks .tl-mline.${isChoice ? 'choice' : m.type}`);
      void lines;
      $('#tl-time').textContent = fmt(m.at);
    };
    f.addEventListener('pointermove', move);
    f.addEventListener('pointerup', () => {
      f.removeEventListener('pointermove', move);
      showSnap(null);
      if (g.moved && snap() !== g.before) {
        if (!isChoice) tl().markers.sort((a, b) => a.at - b.at);
        T.undo.push({ ch: T.ch, s: g.before }); T.redo.length = 0; changed(true);
      } else { renderTracks(); renderInspector(); }
    }, { once: true });
    renderInspector();
  }
  function rulerDown(e) {
    if (e.target.closest('.tl-flag')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = (ev) => Math.max(0, tOf(ev.clientX - r.left));
    setPlayhead(at(e));
    const ruler = e.currentTarget;
    ruler.setPointerCapture(e.pointerId);
    const move = (ev) => setPlayhead(at(ev));
    ruler.addEventListener('pointermove', move);
    ruler.addEventListener('pointerup', () => ruler.removeEventListener('pointermove', move), { once: true });
  }
  function setPlayhead(t) {
    T.playhead = Math.max(0, t);
    if (T.clock) play(T.playhead); // playing: it plays on from there
    paintPlayhead();
  }

  /* ---------- Zoom ---------- */
  function zoom(f, aroundPx) {
    const root = $('#tl-tracks');
    const cx = aroundPx == null ? root.clientWidth / 2 : aroundPx;
    const t = tOf(root.scrollLeft + cx - HEAD);
    T.pps = Math.max(1, Math.min(400, T.pps * f));
    renderTracks();
    root.scrollLeft = Math.max(0, HEAD + x(t) - cx);
  }
  function fit() {
    const root = $('#tl-tracks');
    const w = Math.max(300, (root.clientWidth || 900) - HEAD - 40);
    T.pps = Math.max(1, Math.min(200, w / Math.max(30, BT.endOf(tl()) + 10)));
    if (T.rec) renderTracks();
    root.scrollLeft = 0;
  }

  /* ---------- Playing: the chapter clock through the engine ---------- */
  const trackVol = (c) => { const t = trackOf(c.track) || (T.clock && T.clock.tl.tracks.find((x_) => x_.id === c.track)); return t ? t.volume : 1; };
  const even = () => settings.even !== false;
  async function ready(t) {
    const files = [...new Set(t.clips.map((c) => c.file))].filter((f) => !T.buffers.has(f));
    if (!files.length) return;
    busy('Preparing the sounds', '', 0);
    for (let i = 0; i < files.length; i++) { await buffer(files[i]); busy('Preparing the sounds', `${i + 1} of ${files.length}`, (i + 1) / files.length); }
    idle();
  }
  /** Every way of the timeline, for a choice picked while playing. */
  function allTimelines(t, out = []) { out.push(t); if (t.choice) t.choice.answers.forEach((a) => allTimelines(a.timeline, out)); return out; }
  async function play(from) {
    stop(true);
    const t = tl();
    await ready(t);
    if (T.choiceReady !== t) { for (const w of allTimelines(t).slice(1)) await ready(w); T.choiceReady = t; }
    const { ctx, master } = audio(true);
    if (!T.bus) { T.bus = ctx.createGain(); T.bus.connect(master); }
    master.gain.value = global.FlowUI.curve(settings.master);
    const clock = new BT.Clock(t, {
      now: () => ctx.currentTime,
      start: (c, when, offset) => startClip(c, when, offset),
      hold: (c, when, fade) => endClip(c, fade),
      onState: () => paintTransport(),
    });
    T.clock = clock;
    clock.pos0 = Math.max(0, from || 0);
    t.markers.forEach((m) => { if (m.type === 'cue' && m.at < clock.pos0 - 1e-6) clock.passed.add(m.id); });
    clock.run();
    T.timer = setInterval(() => { if (T.clock === clock) clock.tick(); }, 250);
    const frame = () => {
      if (T.clock !== clock) return;
      paintPlayhead();
      // The view follows the gold while it plays.
      if (clock.tl === tl() && !T.drag) {
        const root = $('#tl-tracks'), px = HEAD + x(clock.position());
        if (px > root.scrollLeft + root.clientWidth - 60 || px < root.scrollLeft + HEAD) root.scrollLeft = Math.max(0, px - HEAD - 40);
      }
      if (clock.state === 'ended' && !T.voices.size) { T.playhead = clock.pos0; stop(); return; }
      T.raf = requestAnimationFrame(frame);
    };
    T.raf = requestAnimationFrame(frame);
    paintTransport();
  }
  function startClip(c, when, offset) {
    const muted = (T.clock && T.clock.tl.tracks.find((x_) => x_.id === c.track) || {}).mute;
    if (muted) return;
    const buf = T.buffers.get(c.file);
    if (!buf) return;
    const { ctx } = audio();
    const vol = (c.volume == null ? 0.75 : c.volume) * trackVol(c);
    if (c.loop === 'random') {
      const g = ctx.createGain(); g.gain.value = vol * EN.norm(buf, c.kind, even()); g.connect(T.bus);
      const v = { c, g, random: true, srcs: [], until: c.holdToCue ? Infinity : when + c.length - offset, timer: 0 };
      const each = Math.max(0.05, c.each || c.length);
      const one = (at) => {
        if (T.voices.get(c.id) !== v || at >= v.until) { if (at >= v.until) finish(); return; }
        const s = EN.shot(ctx, g, buf, at, c.in || 0, Math.min(each, v.until - at), 1);
        v.srcs.push(s.src);
        const gap = (c.gapMin ?? 5) + Math.random() * Math.max(0, (c.gapMax ?? 30) - (c.gapMin ?? 5));
        const next = s.end + gap;
        v.timer = setTimeout(() => one(next), Math.max(0, (next - ctx.currentTime - 1) * 1000));
      };
      const finish = () => { if (T.voices.get(c.id) === v) { T.voices.delete(c.id); setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, 500); } };
      T.voices.set(c.id, v);
      one(when);
      return;
    }
    const card = { file: c.file, zone: c.kind, start: c.in || 0, duration: c.length, play: c.loop, hold: c.loop === 'loop' && c.holdToCue, repeat: c.loop !== 'once', fadeIn: offset > 0 ? 0 : c.fadeIn, fadeOut: c.fadeOut, volume: vol };
    const e = EN.voice(ctx, T.bus, buf, card, when, offset, { even: even() });
    const v = { c, src: e.src, g: e.g, norm: EN.norm(buf, c.kind, even()) };
    T.voices.set(c.id, v);
    e.src.onended = () => { if (T.voices.get(c.id) === v) T.voices.delete(c.id); try { e.g.disconnect(); } catch (er) { /* gone */ } };
  }
  function endClip(c, fade) {
    const v = T.voices.get(c.id);
    if (!v) return;
    const { ctx } = audio();
    const end = EN.fadeOut(ctx, v.g, fade);
    if (v.random) { clearTimeout(v.timer); v.srcs.forEach((s) => { try { s.stop(end + 0.05); } catch (e) { /* done */ } }); T.voices.delete(c.id); }
    else { try { v.src.stop(end + 0.05); } catch (e) { /* done */ } }
  }
  function stop(quiet) {
    if (T.clock) T.playhead = Math.max(0, T.clock.tl === tl() ? T.clock.position() : T.playhead);
    clearInterval(T.timer); cancelAnimationFrame(T.raf);
    T.clock = null;
    const { ctx } = audio();
    T.voices.forEach((v) => {
      const end = EN.fadeOut(ctx, v.g, 0.08);
      if (v.random) { clearTimeout(v.timer); v.srcs.forEach((s) => { try { s.stop(end + 0.02); } catch (e) { /* done */ } }); } else { try { v.src.stop(end + 0.02); } catch (e) { /* done */ } }
    });
    T.voices.clear();
    if (!quiet) { paintTransport(); paintPlayhead(); }
  }
  function go() { if (T.clock && T.clock.state === 'cue') { T.clock.go(); paintTransport(); } }
  function choose(i) {
    if (!(T.clock && T.clock.state === 'choice')) return;
    // The view follows the way picked.
    const path = T.way.concat(i);
    T.clock.choose(i);
    T.way = path;
    T.sel = null;
    render();
  }

  function paintTransport() {
    const st = T.clock ? T.clock.state : 'stopped';
    $('#tl-play').innerHTML = T.clock && st !== 'ended' ? ICON.pause : ICON.play;
    $('#tl-play').title = T.clock ? 'Stop where it is (Space)' : 'Play from the playhead (Space)';
    $('#tl-play').setAttribute('aria-label', $('#tl-play').title);
    const box = $('#tl-wait');
    box.textContent = '';
    if (st === 'cue') {
      const cue = T.clock.stop().cue;
      const b = el('button', 'btn slim primary tl-go', 'Go'); b.type = 'button';
      b.title = `The table waits at ${cue && cue.name ? cue.name : 'the cue'}: Go plays on (G)`;
      b.addEventListener('click', go);
      box.append(el('span', 'tl-waits', cue && cue.name ? `Waits: ${cue.name}` : 'Waits at the cue'), b);
    } else if (st === 'choice') {
      box.append(el('span', 'tl-waits', T.clock.tl.choice.question || 'The choice'));
      T.clock.tl.choice.answers.forEach((a, i) => { const b = el('button', 'btn slim tl-go silver', a.label || `Way ${i + 1}`); b.type = 'button'; b.addEventListener('click', () => choose(i)); box.append(b); });
    } else if (st === 'ended') box.append(el('span', 'tl-waits', 'The end of the chapter'));
    $('#tl-snap').setAttribute('aria-pressed', String(T.snap));
  }

  /* ---------- Wiring ---------- */
  function wire() {
    $('#tl-back').innerHTML = ICON.back;
    $('#tl-back').addEventListener('click', async () => { stop(); await flush(); const r = T.rec, ch = T.ch; close(); if (T.onLeave) T.onLeave(r, ch); });
    $('#tl-undo').innerHTML = global.FlowUI.ICON.undo || '↶';
    $('#tl-redo').innerHTML = global.FlowUI.ICON.redo || '↷';
    $('#tl-undo').addEventListener('click', () => undoRedo(true));
    $('#tl-redo').addEventListener('click', () => undoRedo(false));
    $('#tl-chapter').addEventListener('change', (e) => { stop(); T.ch = Number(e.target.value); T.way = []; T.sel = null; T.playhead = 0; fit(); render(); });
    $('#tl-play').addEventListener('click', () => { if (T.clock && T.clock.state !== 'ended') stop(); else play(T.playhead); });
    $('#tl-home').innerHTML = ICON.back;
    $('#tl-home').addEventListener('click', () => { const was = !!T.clock; stop(); T.playhead = 0; paintPlayhead(); $('#tl-tracks').scrollLeft = 0; if (was) play(0); });
    $('#tl-cue').addEventListener('click', () => addMarker('cue'));
    $('#tl-section').addEventListener('click', () => addMarker('section'));
    $('#tl-snap').addEventListener('click', () => { T.snap = !T.snap; paintTransport(); });
    $('#tl-zin').addEventListener('click', () => zoom(1.5));
    $('#tl-zout').addEventListener('click', () => zoom(1 / 1.5));
    $('#tl-fit').addEventListener('click', fit);
    $('#tl-tableplay').addEventListener('click', async () => { stop(); await flush(); if (T.onPlay) T.onPlay(T.rec, T.ch); });
    $('#tl-tracks').addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoom(Math.exp(-e.deltaY * 0.01), e.clientX - $('#tl-tracks').getBoundingClientRect().left);
    }, { passive: false });
    document.addEventListener('keydown', (e) => {
      if ($('#timeline').hidden || !T.rec) return;
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (k === 'z') { e.preventDefault(); undoRedo(!e.shiftKey); }
        else if (k === 'y') { e.preventDefault(); undoRedo(false); }
        return;
      }
      if (e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); $('#tl-play').click(); }
      else if (k === 'g' || e.key === 'Enter') { if (T.clock && T.clock.state === 'cue') { e.preventDefault(); go(); } }
      else if (k === 'c') addMarker('cue');
      else if (k === 'm') addMarker('section');
      else if (k === 's') split();
      else if (k === 'n') { T.snap = !T.snap; paintTransport(); toast(T.snap ? 'Snapping on.' : 'Snapping off.', 1200); }
      else if (k === '+' || k === '=') zoom(1.5);
      else if (k === '-') zoom(1 / 1.5);
      else if (k === 'z') fit();
      else if (e.key === 'Home') $('#tl-home').click();
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (T.sel) { e.preventDefault(); deleteSel(); } }
      else if (e.key === 'Escape') { T.sel = null; renderTracks(); renderInspector(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (T.sel) { e.preventDefault(); nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1)); } }
    });
    global.addEventListener('resize', () => { if (T.rec && !$('#timeline').hidden) renderTracks(); });
  }

  global.FlowTimeline = {
    open, close, wire, flush,
    // For the tests.
    __state: () => T, __play: play, __stop: stop, __go: go, __choose: choose,
  };
})(window);
