/* Troubadour Ballade: the player. A chapter runs as a cascade of steps, top to bottom, joined by a golden wire.
 *
 * Every sound is scheduled on the audio clock: a step starts its cards (each after its own offset),
 * and the next step follows on its own when this one ends, unless it is a gate, which waits for a tap.
 * Pausing suspends the audio clock, so the whole timeline pauses with it.
 */
(function (global) {
  'use strict';

  const { $, el, ICON, settings, saveSettings, toast, audio, decode } = global.FlowUI;
  const F = global.TroubadourBallade;
  const LEAD = 0.06; // seconds between a tap and the sound
  const POUR = 0.5;  // a gate opens: the gold runs down from it to the sounds, which start as it arrives

  const P = {
    rec: null, ch: 0, steps: [], buffers: new Map(), blobs: null, loading: 0,
    voices: [], starts: [], gate: null, end: null, forced: new Set(), paused: false, bus: null, sbBus: null,
    dom: null, raf: 0, focus: -1, touched: 0, onLeave: null, chapterToken: 0,
    // A chapter may end on a choice (silver), and every way on a choice of its own: its trunk plays first,
    // then the way the bard picks, then the way picked at its end, and so on. `path` holds the answers picked.
    chapter: null, trunk: [], path: [], segs: [], choiceAt: null,
  };

  const validChoice = (c) => (c && Array.isArray(c.answers) && c.answers.length >= 2 ? c : null);
  /** The lists on the wire, one per depth: { start (index in P.steps), steps, choice (at its end, or null) }. */
  function segmentsOf() {
    const segs = [];
    let holder = P.chapter || { steps: [] };
    let start = 0;
    for (let d = 0; ; d++) {
      const steps = holder.steps || [];
      const choice = validChoice(holder.choice);
      segs.push({ start, steps, choice });
      start += steps.length;
      if (!choice || P.path[d] == null || !choice.answers[P.path[d]]) break;
      holder = choice.answers[P.path[d]];
    }
    return segs;
  }
  /** The choice the wire will stop at next (the last list's, not picked yet), or null. */
  const choiceOf = () => { const l = P.segs[P.segs.length - 1]; return l && l.choice && P.path.length < P.segs.length ? l.choice : null; };
  /** Its depth: how many choices come before it. */
  const choiceDepth = () => P.segs.length - 1;
  /** The steps on the wire: the trunk, then each chosen way (whose first step is always a gate). */
  function pathSteps() {
    P.segs = segmentsOf();
    return P.segs.flatMap((g, d) => (d === 0 ? g.steps : g.steps.map((s, k) => (k === 0 ? Object.assign({}, s, { gate: true }) : s))));
  }

  /* ---------- Opening and closing ---------- */

  async function open(rec, chapter, opts = {}) {
    P.rec = rec;
    P.onLeave = opts.onLeave || null;
    P.blobs = opts.blobs || await global.FlowDB.filesOf(rec);
    const { ctx, master } = audio(true);
    if (!P.bus) { P.bus = ctx.createGain(); P.bus.connect(master); P.sbBus = ctx.createGain(); P.sbBus.connect(master); }
    P.sbBus.gain.value = settings.sbVolume;
    master.gain.value = settings.master;
    buildChrome();
    // The cascade shows at once; the sounds decode behind it, the dock says how many are left.
    openChapter(Math.min(Math.max(0, chapter || 0), rec.story.chapters.length - 1), false).catch((e) => toast(`Could not open this chapter: ${e.message || e}`));
    loop();
  }

  function close() {
    stopAll(true);
    cancelAnimationFrame(P.raf);
    P.raf = 0;
    P.rec = null;
    P.buffers.clear();
    P.blobs = null;
    if (P.paused) { const { ctx } = audio(); ctx.resume().catch(() => {}); P.paused = false; }
  }

  async function openChapter(i, autostart) {
    const token = ++P.chapterToken;
    if (P.voices.length || P.starts.length) stopAll();
    P.ch = i;
    P.chapter = P.rec.flow.chapters[i] || { steps: [] };
    P.trunk = P.chapter.steps || [];
    P.path = []; P.choiceAt = null;
    P.steps = pathSteps();
    P.starts = []; P.gate = null; P.end = null; P.focus = -1; P.touched = 0; P.forced.clear();
    renderChapters();
    renderCascade();
    toTop();
    // Decode the sounds of this chapter (and the soundbox) before the first tap.
    const want = new Set();
    // Every way of every choice is ready before it is picked.
    F.allSteps(P.chapter).forEach((s) => (s.cards || []).forEach((c) => want.add(c.file)));
    (P.rec.story.soundbox || []).forEach((s) => want.add(s.file));
    const missing = [...want].filter((f) => !P.buffers.has(f));
    P.loading = missing.length;
    paintDock();
    for (const f of missing) {
      if (token !== P.chapterToken) return;
      const blob = P.blobs.get(f);
      try { if (blob) P.buffers.set(f, await decode(blob)); } catch (e) { console.warn('Could not decode', f, e); }
      P.loading -= 1;
      paintDock();
    }
    // Drop sounds no longer needed (the soundbox stays).
    for (const k of [...P.buffers.keys()]) if (!want.has(k) && !P.voices.some((v) => v.file === k)) P.buffers.delete(k);
    if (token !== P.chapterToken) return;
    P.loading = 0;
    paintDock();
    renderPads();
    if (autostart && P.steps.length) { go(0); toTop(); }
  }

  /* ---------- Timeline ---------- */

  const now = () => audio().ctx.currentTime;

  function makeVoice(stepIdx, k, card, t0) {
    const buf = P.buffers.get(card.file);
    if (!buf) return null;
    if (card.play === 'random') return randomVoice(stepIdx, k, card, t0, buf);
    const { ctx } = audio();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const start = Math.min(card.start || 0, Math.max(0, buf.duration - 0.05));
    // A loop that holds plays until a gate, the choice or the end of the chapter fades it out.
    const hold = !!card.hold;
    const dur = hold ? Infinity : card.repeat ? card.duration : Math.min(card.duration, buf.duration - start);
    if (card.repeat) { src.loop = true; src.loopStart = start; src.loopEnd = buf.duration; }
    const g = ctx.createGain();
    const vol = card.volume;
    const fi = Math.min(card.fadeIn || 0, hold ? 30 : dur);
    const fo = hold ? 0 : Math.min(card.fadeOut || 0, Math.max(0, dur - fi));
    g.gain.setValueAtTime(fi > 0 ? 0 : vol, t0);
    if (fi > 0) g.gain.linearRampToValueAtTime(vol, t0 + fi);
    if (fo > 0) { g.gain.setValueAtTime(vol, t0 + dur - fo); g.gain.linearRampToValueAtTime(0, t0 + dur); }
    src.connect(g).connect(P.bus);
    src.start(t0, start);
    if (!hold) src.stop(t0 + dur + 0.03);
    const v = { step: stepIdx, k, file: card.file, src, g, t0, end: t0 + dur, cut: null, hold };
    src.onended = () => { v.done = true; try { g.disconnect(); } catch (e) { /* gone */ } };
    return v;
  }

  /** A random card: the sound, a pause of gapMin to gapMax seconds, the sound again, until it is faded out. */
  function randomVoice(stepIdx, k, card, t0, buf) {
    const { ctx } = audio();
    const g = ctx.createGain();
    g.gain.setValueAtTime(card.volume, t0);
    g.connect(P.bus);
    const start = Math.min(card.start || 0, Math.max(0, buf.duration - 0.05));
    const len = Math.max(0.05, Math.min(card.duration, buf.duration - start));
    const lo = card.gapMin ?? 5, hi = Math.max(lo, card.gapMax ?? 30);
    const v = { step: stepIdx, k, file: card.file, src: null, g, t0, end: Infinity, cut: null, hold: true, random: true };
    const play = (at) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start(at, start);
      src.stop(at + len + 0.03);
      v.src = src;
      src.onended = () => {
        // Faded out, or the chapter was left: the chain ends here.
        if (v.cut != null || !P.voices.includes(v)) { v.done = true; try { g.disconnect(); } catch (e) { /* gone */ } return; }
        play(Math.max(ctx.currentTime + 0.05, at + len) + lo + Math.random() * (hi - lo));
      };
    };
    play(t0);
    return v;
  }

  /** Starts step i at t0 and chains the steps that follow on their own, up to the next gate. */
  function schedule(i, t0) {
    const step = P.steps[i];
    P.starts[i] = t0;
    step.cards.forEach((c, k) => {
      if (P.forced.has(`${i}:${k}`)) return; // already started by hand
      const v = makeVoice(i, k, c, t0 + c.offset);
      if (v) P.voices.push(v);
    });
    const endT = t0 + F.stepLength(step);
    if (i + 1 < P.steps.length) {
      if (P.steps[i + 1].gate) P.gate = { i: i + 1, t: endT };
      else schedule(i + 1, endT);
    } else if (choiceOf() && i === P.steps.length - 1) {
      P.choiceAt = endT; // the wire stops at the silver gate: the bard picks the way
    } else {
      // Sounds that hold go on after the end: they stop with the chapter.
      P.end = P.voices.reduce((a, v) => (v.hold && v.cut == null ? a : Math.max(a, v.cut ?? v.end)), endT);
    }
  }

  /** The bard picks answer a of the choice at depth d. Picked when the wire waits at it, its way starts at once;
   *  picked ahead of time, its first gate waits like any other. A way already playing is kept; a way picked
   *  ahead and not started yet can still be changed (what came after it is forgotten). */
  function choose(d, a) {
    const seg = P.segs[d];
    if (!seg || !seg.choice || !seg.choice.answers[a]) return;
    const b = seg.start + seg.steps.length; // where its way starts on the wire
    if (P.path[d] != null && P.starts[b] != null) { if (a !== P.path[d]) toast('This way is already playing. Stop the chapter to choose again.'); return; }
    if (P.loading) { toast('The sounds of this chapter are still loading.'); return; }
    const st = state();
    const waiting = st.mode === 'choice' && choiceDepth() === d;
    const at = P.path.length > d ? (P.gate && P.gate.i >= b ? P.gate.t : null) : P.choiceAt;
    P.path = P.path.slice(0, d).concat(a);
    P.steps = pathSteps();
    // Steps after b were never started (the way did not run yet): forget them.
    P.starts.length = Math.min(P.starts.length, b);
    if (P.gate && P.gate.i >= b) P.gate = null;
    renderCascade();
    if (P.steps[b]) {
      P.choiceAt = null;
      if (waiting) { go(b); return; }
      if (at != null) P.gate = { i: b, t: at };
    } else if (choiceOf()) {
      // An empty way that ends on another choice: the wire waits at that one now.
      P.choiceAt = at;
    } else {
      // An empty way that ends the chapter: the chapter ends where the choice was (if the wire got there).
      P.choiceAt = null;
      if (at != null) P.end = P.voices.reduce((m, v) => (v.hold && v.cut == null ? m : Math.max(m, v.cut ?? v.end)), waiting ? now() : at);
    }
    paintDock();
  }

  /** Moves the wire to step i now: whatever was waiting after the current moment is called off. */
  function go(i) {
    if (i < 0 || i >= P.steps.length) return;
    if (P.loading) { toast('The sounds of this chapter are still loading.'); return; }
    const { ctx } = audio(true);
    if (P.paused) { ctx.resume().catch(() => {}); P.paused = false; }
    const t = now();
    const run = runIndex(i);
    // Steps not started yet are called off. Inside the same run, the late sounds of a step already playing still come in;
    // a gate closes the run before it: its sounds fade out as the new one begins.
    P.voices = P.voices.filter((v) => {
      const same = runIndex(v.step) === run;
      if (v.t0 > t && !(same && P.starts[v.step] <= t && v.step < i)) { try { v.src.onended = null; v.src.stop(); v.g.disconnect(); } catch (e) { /* not started */ } return false; }
      if (!same && P.steps[i].gate && !v.done && v.cut == null) fadeVoice(v, settings.fade);
      return true;
    });
    for (let j = 0; j < P.starts.length; j++) if (j >= i || P.starts[j] > t) P.starts[j] = undefined;
    P.gate = null; P.end = null; P.choiceAt = null;
    // Opening a gate: the gold first runs down from the gate to the sounds, then they start.
    schedule(i, t + (P.steps[i].gate || i === 0 ? POUR : LEAD));
    P.focus = -1;
    P.touched = 0;
    global.FlowApp && global.FlowApp.wake();
    paintDock();
  }

  /** The gate a step hangs from: steps share a run until the next gate. */
  function runIndex(i) {
    let g = 0;
    for (let j = 0; j <= i && j < P.steps.length; j++) if (j === 0 || P.steps[j].gate) g = j;
    return g;
  }

  /** Starts one card now, by hand, ahead of the wire. Not once the wire has reached it. */
  function force(i, k) {
    const key = `${i}:${k}`;
    const c = P.steps[i] && P.steps[i].cards[k];
    if (!c || P.loading || cardReached(i, k)) return;
    audio(true);
    if (P.paused) { audio().ctx.resume().catch(() => {}); P.paused = false; }
    const t = now();
    const pending = voiceOf(i, k);
    if (pending && pending.t0 > t) { try { pending.src.onended = null; pending.src.stop(); pending.g.disconnect(); } catch (e) { /* not started */ } P.voices = P.voices.filter((v) => v !== pending); }
    const v = makeVoice(i, k, c, t + LEAD);
    if (!v) return;
    P.voices.push(v);
    P.forced.add(key);
    // A ripple runs through the card as it starts.
    const info = P.dom && P.dom.cards.get(key);
    if (info) { info.card.classList.remove('kick'); void info.card.offsetWidth; info.card.classList.add('kick'); if (info.hand) { info.hand.classList.remove('kick'); void info.hand.getBBox(); info.hand.classList.add('kick'); }
      setTimeout(() => { info.card.classList.remove('kick'); if (info.hand) info.hand.classList.remove('kick'); }, 750); }
    if (P.end != null && !v.hold) P.end = Math.max(P.end, v.end);
    global.FlowApp && global.FlowApp.wake();
    paintDock();
  }
  /** True once the card has started, or the wire went past its start. */
  function cardReached(i, k) {
    const t = now();
    const v = voiceOf(i, k);
    if (v && v.t0 <= t) return true;
    if (P.forced.has(`${i}:${k}`)) return true;
    const st = P.starts[i];
    if (st != null && st + P.steps[i].cards[k].offset <= t) return true;
    // A run the wire has left behind (a later gate was opened) stays behind.
    const cur = state().cur;
    return cur >= 0 && runIndex(i) < runIndex(cur);
  }

  function fadeVoice(v, ms) {
    const t = now();
    if (v.t0 > t) { try { v.src.onended = null; v.src.stop(); v.g.disconnect(); } catch (e) { /* not started */ } v.cut = t; v.done = true; return; }
    const f = Math.max(0.03, ms / 1000);
    try {
      const g = v.g.gain;
      const cur = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(cur, t);
      g.linearRampToValueAtTime(0, t + f);
      v.src.stop(t + f + 0.03);
    } catch (e) { /* already stopped */ }
    v.cut = Math.min(v.end, t + f);
  }

  /** Fades every sound out and puts the chapter back at its start. */
  function stopAll(quick) {
    const ms = quick ? 120 : settings.fade;
    if (P.paused) { audio().ctx.resume().catch(() => {}); P.paused = false; }
    P.voices.forEach((v) => { if (!v.done && v.cut == null) fadeVoice(v, ms); });
    P.voices = [];
    P.starts = []; P.gate = null; P.end = null; P.focus = -1; P.forced.clear(); P.choiceAt = null;
    // Back to the start: the choice is open again.
    if (P.path.length) { P.path = []; P.steps = pathSteps(); if (P.rec && P.dom) renderCascade(); }
    paintDock();
  }

  function togglePause() {
    const { ctx } = audio();
    if (!P.starts.some((s) => s != null)) return;
    if (P.paused) { ctx.resume().catch(() => {}); P.paused = false; }
    else { ctx.suspend().catch(() => {}); P.paused = true; }
    paintDock();
  }

  /** What the wire is doing right now. */
  function state() {
    const t = P.rec ? now() : 0;
    let cur = -1;
    P.starts.forEach((s, i) => { if (s != null && s <= t) cur = i; });
    const started = P.starts.some((s) => s != null);
    if (!started) return !P.steps.length && choiceOf() ? { mode: 'choice', cur: -1, t } : { mode: 'idle', cur: -1, t };
    if (P.choiceAt != null && t >= P.choiceAt) return { mode: 'choice', cur, t };
    if (P.gate && t >= P.gate.t) return { mode: 'wait', cur, gate: P.gate.i, t };
    if (P.end != null && t >= P.end) return { mode: 'done', cur, t };
    return { mode: 'run', cur, t };
  }

  /** The step the golden button moves to. */
  function nextTarget(s) {
    if (s.mode === 'idle') return 0;
    if (s.mode === 'wait') return s.gate;
    if (s.mode === 'done' || s.mode === 'choice') return -1;
    if (P.gate) return P.gate.i;
    const pending = P.starts.findIndex((x, i) => i > s.cur && x != null);
    return pending > 0 ? pending : (s.cur + 1 < P.steps.length ? s.cur + 1 : -1);
  }

  /* ---------- Soundbox ---------- */

  function fire(sound) {
    const buf = P.buffers.get(sound.file);
    if (!buf) { toast('This effect is still loading.'); return; }
    const { ctx } = audio(true);
    if (P.paused) { ctx.resume().catch(() => {}); P.paused = false; paintDock(); }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = typeof sound.volume === 'number' ? sound.volume : 0.75;
    src.connect(g).connect(P.sbBus);
    src.start();
  }

  function renderPads() {
    const box = $('#fl-pads');
    box.textContent = '';
    const list = P.rec.story.soundbox || [];
    if (!list.length) { box.append(el('p', 'fl-sb-empty', 'This story has no soundbox effects.')); return; }
    list.forEach((s, i) => {
      const b = el('button', 'pad');
      b.type = 'button';
      b.append(el('span', 'k', String(i + 1)), document.createTextNode(s.name));
      b.addEventListener('click', () => { fire(s); b.classList.remove('fire'); void b.offsetWidth; b.classList.add('fire'); });
      box.append(b);
    });
  }

  /* ---------- Drawing ---------- */

  function buildChrome() {
    $('#fl-story').textContent = P.rec.story.title || 'Story';
    $('#fl-master').value = settings.master;
    paintRange($('#fl-master'));
    $('#fl-sbvol').value = settings.sbVolume;
    paintRange($('#fl-sbvol'));
  }

  function paintRange(r) { r.style.setProperty('--p', `${Math.round(r.value * 100)}%`); }

  function renderChapters() {
    const nav = $('#fl-chapters');
    nav.textContent = '';
    P.rec.story.chapters.forEach((c, i) => {
      const b = el('button', 'fl-chip');
      b.type = 'button';
      b.setAttribute('aria-current', String(i === P.ch));
      b.append(el('b', '', String(i + 1)), el('span', '', c.title || `Chapter ${i + 1}`));
      b.addEventListener('click', () => { if (i !== P.ch) openChapter(i, false); });
      nav.append(b);
    });
    const on = nav.querySelector('[aria-current="true"]');
    if (on) nav.scrollLeft = Math.max(0, on.offsetLeft - nav.clientWidth / 2 + on.clientWidth / 2);
  }

  const ZCOL = { music: 'var(--music)', ambience: 'var(--amb)', events: 'var(--evt)', soundbox: 'var(--accent)' };
  const ZNAME = { music: 'Music', ambience: 'Ambiance', events: 'Event', soundbox: 'Soundbox' };

  const holdLabel = (c) => (c.play === 'random' ? 'random' : 'loop');

  function stepLabel(s, i) {
    if (s.title) return s.title;
    return s.cards.map((c) => c.name).join(' + ') || `Step ${i + 1}`;
  }

  /* A chapter is drawn as runs: a run opens on a gate and holds the steps that follow on their own.
   * Inside a run, time flows down: every card starts at the height of its start and is as tall as it lasts
   * (long sounds squeezed, short ones stretched to stay readable), so sounds that overlap sit side by side.
   * The golden wire runs down the left, a thread branches to each card, and a playhead sweeps down with time. */
  const PAD = 40;      // room above the first sounds of a run, for the lane wires to branch off
  /** A run with more lanes needs more room on top: its rails leave one another like steps of a stair. */
  /** How tall the split to a lane `dx` px away is: like the logo, the wire takes its time to lean across. */
  const splitOf = (dx) => Math.round(Math.min(190, 40 + dx * 0.75));
  const padOf = (lanes, step) => (lanes > 1 ? Math.max(PAD, 6 + splitOf(step * Math.ceil((lanes - 1) / 2)) + 12) : PAD);
  const RUN_PX = 540;   // a run is drawn about this tall...
  const MIN_PPS = 2;    // ...at no less than 2 px per second
  const MAX_PPS = 36;   // and no more than 36
  const SILENT_PX = 26; // a silence is drawn no longer than this
  const MIN_PX = 50;    // a sound shorter than that still shows its name

  function runsOf(steps) {
    const runs = [];
    steps.forEach((s, i) => { if (i === 0 || s.gate) runs.push({ gate: i, steps: [] }); runs[runs.length - 1].steps.push(i); });
    return runs;
  }

  /** Lays out one run: card positions (seconds), lanes, and the time-to-pixel map. */
  function layoutRun(run, offsets, last, minPx = MIN_PX) {
    const items = [];
    let stepsEnd = 0;
    run.steps.forEach((i) => { stepsEnd = Math.max(stepsEnd, offsets[i] + F.stepLength(P.steps[i])); });
    run.steps.forEach((i) => {
      const s = P.steps[i];
      // A sound that holds is drawn down to the end of its run, and carries on under the gate that cuts it.
      s.cards.forEach((c, k) => {
        const s0 = offsets[i] + c.offset;
        items.push({ i, k, c, s0, s1: c.hold ? Math.max(stepsEnd, s0 + 12) + 1 : s0 + c.duration });
      });
    });
    // A run that a gate follows ends with its steps: sounds still playing carry on under the next gate.
    const end = last ? Math.max(stepsEnd, ...items.map((x) => x.s1), 0) : stepsEnd;
    // How long the run plays on its own; sounds that hold go on after it, until the next gate.
    const own = Math.max(stepsEnd, ...items.filter((x) => !x.c.hold).map((x) => (last ? x.s1 : 0)), 0);
    items.forEach((x) => { x.e = Math.min(x.s1, Math.max(end, x.s0 + 0.1)); x.cont = x.s1 > x.e + 0.05 || !!x.c.hold; });
    // One speed for the whole run: so many pixels per second, the same for every card and for the time line.
    // A card is as tall as it lasts; sounds side by side are sized by the same rule.
    // Silence is not drawn to scale: where no sound plays the wire stays short (the gold still takes the time
    // it lasts, but never travels a long empty stretch). Only stretches with sounds are drawn at the run's speed.
    const busy = [];
    items.map((x) => [x.s0, x.e]).sort((a, b) => a[0] - b[0]).forEach(([a, b]) => {
      const lastB = busy[busy.length - 1];
      if (lastB && a <= lastB[1] + 0.05) lastB[1] = Math.max(lastB[1], b); else busy.push([a, b]);
    });
    const busyT = busy.reduce((n, [a, b]) => n + (Math.min(b, end) - Math.max(0, a)), 0);
    const pps = Math.min(MAX_PPS, Math.max(MIN_PPS, RUN_PX / Math.max(busyT, 0.1)));
    // The map from time to height, cut at every start and end of a sound. A sound too short to read gets the
    // room it needs by stretching its own stretch of time: the gold then slows down across it, so it still reaches
    // the bottom of every card exactly when its sound ends, at the same height on every lane.
    const top = Math.max(end, ...items.map((x) => x.e));
    const ts = [...new Set([0, end, top, ...items.flatMap((x) => [Math.max(0, x.s0), x.e])])].sort((p, q) => p - q);
    const segs = ts.slice(1).map((t1, k) => {
      const t0 = ts[k];
      const dense = busy.some(([p, q]) => p < t1 - 1e-6 && q > t0 + 1e-6);
      const full = (t1 - t0) * pps;
      return { t0, t1, len: dense ? full : Math.min(full, SILENT_PX) };
    }).filter((g) => g.t1 - g.t0 > 1e-6);
    items.slice().sort((p, q) => p.s0 - q.s0).forEach((x) => {
      const inside = segs.filter((g) => g.t0 >= x.s0 - 1e-6 && g.t1 <= x.e + 1e-6);
      const span = inside.reduce((n, g) => n + g.len, 0);
      if (inside.length && span < minPx) inside.forEach((g) => { g.len += span > 0 ? (minPx - span) * (g.len / span) : (minPx - span) / inside.length; });
    });
    let yc = 0;
    segs.forEach((g) => { g.y0 = yc; yc += g.len; });
    const map = (t) => {
      t = Math.max(0, Math.min(t, top));
      for (const g of segs) if (t <= g.t1) return g.y0 + (t - g.t0) / (g.t1 - g.t0) * g.len;
      return yc;
    };
    items.forEach((x) => { x.y0 = map(x.s0); x.y1 = Math.max(map(x.e), x.y0 + 1); });
    // Lanes: each card takes the first lane free at its top (a very short card keeps a readable height).
    const lanes = [];
    items.sort((a, b) => a.s0 - b.s0 || a.i - b.i || a.k - b.k).forEach((x) => {
      let l = lanes.findIndex((free) => free <= x.y0 + 0.5);
      if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = x.y1 + 4;
      x.lane = l;
    });
    const height = Math.max(map(top), 24);
    return { items, lanes: Math.max(1, lanes.length), end, own, pps, height, map, y: map };
  }

  /* The whole chapter shares one golden wire, drawn as a single SVG over the cascade. The spine runs down the
   * left, through every gate and every choice, to Next chapter. A sound hangs on the right of its wire like a
   * flag: its outline leaves the wire in a soft S, runs down its right side and comes back into the wire, which
   * goes on straight through it. The first lane hangs on the spine itself; every other lane is a rail that
   * leaves the spine in an S under the gate. Lighting is one clip that grows down, so the gold flows like a
   * liquid: no seams between pieces, no glow doubled where two strokes meet. */
  const SLOPE = 190;   // a card's outline leaves its wire over at most this height

  function renderCascade() {
    const box = $('#fl-cascade');
    box.textContent = '';
    P.dom = { runs: [], end: null, cards: new Map(), dots: [], shown: 0, last: 0, choices: [] };
    const pending = choiceOf();
    if (!P.steps.length && !pending) box.append(el('p', 'fl-empty', 'This chapter has no steps yet. Shape it in the Ballade editor, on a computer.'));
    P.offsets = F.runOffsets(P.steps);
    const runs = runsOf(P.steps);
    const cs = getComputedStyle(box);
    const width = Math.max(240, (box.clientWidth || 360) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const NS = 'http://www.w3.org/2000/svg';
    const under = document.createElementNS(NS, 'svg');
    under.setAttribute('class', 'fl-under');
    under.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fl-flow');
    svg.setAttribute('aria-hidden', 'true');
    box.append(under, svg);
    // Every choice on the path sits right after the steps of its list, before the way it opens.
    const forks = P.segs.map((g, d) => (g.choice ? { at: g.start + g.steps.length, sec: renderChoice(g.choice, d) } : null)).filter(Boolean);
    const placeForks = (upto) => forks.forEach((fk) => { if (!fk.sec.parentNode && fk.at <= upto) box.append(fk.sec); });
    const wayFrom = P.segs.length > 1 ? P.segs[1].start : Infinity;
    runs.forEach((run, r) => {
      placeForks(run.gate);
      const lastRun = r === runs.length - 1;
      let L = layoutRun(run, P.offsets, lastRun);
      if (L.lanes === 1) { const L1 = layoutRun(run, P.offsets, lastRun, 84); if (L1.lanes === 1) L = L1; }
      const sec = el('section', `fl-run${run.gate >= wayFrom ? ' way' : ''}`);
      const g = P.steps[run.gate];
      const row = el('div', 'fl-node-row');
      const node = el('button', 'fl-node gate');
      node.type = 'button';
      // The first gate starts the chapter (play); the ones after it are gates the wire waits at.
      node.innerHTML = run.gate === 0 ? ICON.go : ICON.gate;
      node.setAttribute('aria-label', `Go: ${stepLabel(g, run.gate)}`);
      node.addEventListener('click', () => go(run.gate));
      const meta = el('div', 'fl-meta');
      meta.append(el('b', '', stepLabel(g, run.gate)));
      const sub = el('span', 'fl-sub', `${run.gate === 0 ? 'Starts on your tap' : 'Waits for your tap'}${L.own > 0.5 ? `, ${F.clock(L.own)}` : ''}`);
      meta.append(sub);
      row.append(node, meta);
      sec.append(row);

      const area = el('div', 'fl-area');
      // Symmetric, like the logo: the spine runs down the middle, the first lane on it, the next ones take turns
      // right and left of it. Every sound is a quarter of the screen wide (less only if the lanes would not fit).
      const X = width / 2;
      const gap = 10;
      const m = Math.ceil((L.lanes - 1) / 2);
      const cw = Math.floor(Math.min(width / 4, (width / 2 - 2 - m * gap) / (m + 0.5)));
      const step = cw + gap;
      const pad = padOf(L.lanes, step);
      const H = L.height + pad + 9;
      area.style.height = `${H}px`;
      const narrow = cw < 118;
      const place = (l) => { const rail = X + (l === 0 ? 0 : (l % 2 ? 1 : -1) * Math.ceil(l / 2) * step); return { rail, left: rail - cw / 2, w: cw }; };
      if (narrow) area.classList.add('narrow');
      const cards = [];
      L.items.forEach((x) => {
        const top = x.y0 + pad;
        const h = x.y1 - x.y0;
        const ch = Math.max(24, h - 4);
        const pl = place(x.lane);
        // The wire splits round the sound like the logo: both sides lean out over a long height (about four
        // times their own width, at most a third of the card), and meet again the same way at its bottom.
        const d = Math.round(Math.max(10, Math.min(ch * 0.34, pl.w * 2, SLOPE)));
        const c = x.c;
        // Room decides the card's face: one line (short), a one-line name (mid), or the full card.
        const short = ch < 76;
        const card = el('button', `fl-card c${x.cont ? ' cont' : ''}${short ? ' short' : ch < 100 ? ' mid' : ''}`);
        card.type = 'button';
        // Its words start where the card is nearly full width.
        card.style.cssText = `top:${top}px;left:${pl.left}px;width:${pl.w}px;height:${ch}px;--d:${Math.round(d * (short ? 0.4 : 0.72))}px`;
        card.style.setProperty('--z', ZCOL[c.zone] || 'var(--accent)');
        const head = el('div', 'fl-ch');
        head.append(el('b', '', c.name));
        const tags = el('div', 'fl-tags');
        tags.append(el('span', 'fl-zone', ZNAME[c.zone] || ''));
        if (c.repeat) { const rp = el('span', 'fl-rep'); rp.innerHTML = c.play === 'random' ? ICON.random : ICON.repeat; tags.append(rp); }
        const time = el('span', 'fl-time', c.hold ? holdLabel(c) : F.clock(c.duration));
        // Shown when the troubadour starts the sound by hand, ahead of the wire.
        const hand = el('span', 'fl-hand'); hand.innerHTML = ICON.hand; hand.title = 'Started by hand';
        tags.append(hand, time);
        const track = el('div', 'fl-track');
        const fill = el('i');
        track.append(fill);
        // The name, time and bar stay in sight while a tall card scrolls by.
        const stick = el('div', 'fl-stick');
        stick.append(head, tags, track);
        card.append(stick);
        card.addEventListener('click', () => {
          const v = voiceOf(x.i, x.k);
          if (v && !v.done && v.cut == null && v.t0 <= now()) { fadeVoice(v, settings.fade); toast(`Fading out ${c.name}.`, 1600); }
        });
        area.append(card);
        // Start now: a bead on the wire, where the card leaves it.
        const size = short ? 22 : 24;
        const pb = el('button', 'fl-force');
        pb.type = 'button';
        pb.style.cssText = `left:${pl.rail - size / 2}px;top:${top - size / 2}px;width:${size}px;height:${size}px`;
        pb.setAttribute('aria-label', `Start ${c.name} now`);
        pb.innerHTML = ICON.go;
        pb.addEventListener('click', (e) => { e.stopPropagation(); force(x.i, x.k); });
        area.append(pb);
        const info = { lastRun: lastRun && !pending, card, fill, time, c, pb, top, left: pl.left, w: pl.w, ch, d, rail: pl.rail, lane: x.lane, run: r, s0: x.s0, e: x.e, cont: x.cont, span: Math.max(0.05, x.e - x.s0), extra: -1, spent: false, path: null, under: null };
        cards.push(info);
        P.dom.cards.set(`${x.i}:${x.k}`, info);
      });
      // The steps that follow on their own: a dot on the spine, tap to jump there.
      run.steps.slice(1).forEach((i) => {
        const d = el('button', 'fl-dot');
        d.type = 'button';
        const y = L.y(P.offsets[i]) + pad;
        d.style.top = `${y}px`;
        const over = cards.find((k) => k.lane === 0 && y > k.top && y < k.top + k.ch);
        d.style.left = `${over ? over.left : X}px`;
        d.title = stepLabel(P.steps[i], i);
        d.setAttribute('aria-label', `Jump to ${stepLabel(P.steps[i], i)}`);
        d.addEventListener('click', () => go(i));
        area.append(d);
        P.dom.dots.push({ d, i, run: r, y });
      });
      const head = el('div', 'fl-playhead');
      head.hidden = true;
      area.append(head);
      sec.append(area);
      box.append(sec);
      P.dom.runs.push({ run, L, pad, sec, node, sub, area, head, total: H, cards, X, top: 0, cy: 0 });
    });
    placeForks(Infinity);
    const end = el('div', 'fl-end');
    const btn = el('button', 'fl-nextch');
    btn.type = 'button';
    const last = P.ch + 1 >= P.rec.story.chapters.length;
    const enode = el('span', 'fl-node gate');
    enode.innerHTML = last ? ICON.stop : ICON.next;
    const label = el('span', 'fl-meta');
    if (last) label.append(el('b', '', 'End of the story'));
    else label.append(el('span', 'k', 'Next chapter'), el('b', '', P.rec.story.chapters[P.ch + 1].title || `Chapter ${P.ch + 2}`));
    btn.append(enode, label);
    btn.disabled = last;
    btn.addEventListener('click', () => { if (!last) openChapter(P.ch + 1, !!settings.autoNext); });
    end.append(btn);
    box.append(end);
    P.dom.end = { end, btn, node: enode, cy: 0 };
    P.dom.width = width;
    P.dom.svg = svg;
    P.dom.under = under;
    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => measure());
  }

  /** A silver gate: its question, and one button per way. A choice already passed shows the way picked
   *  (still open to change while that way has not started). */
  function renderChoice(choice, depth) {
    const sec = el('section', 'fl-choice');
    const seg = P.segs[depth];
    const b = seg.start + seg.steps.length;
    const picked = P.path[depth];
    const locked = picked != null && P.starts[b] != null;
    if (picked != null) sec.classList.add('picked');
    const row = el('div', 'fl-node-row');
    const node = el('span', 'fl-node gate silver');
    node.innerHTML = ICON.fork;
    const meta = el('div', 'fl-meta');
    meta.append(el('span', 'k', depth ? `Choice ${depth + 1}` : 'Choice'), el('b', '', choice.question || 'Which way?'));
    row.append(node, meta);
    const answers = el('div', 'fl-answers');
    const btns = choice.answers.map((a, k) => {
      const btn = el('button', `fl-answer${picked === k ? ' chosen' : picked != null ? ' other' : ''}`);
      btn.type = 'button';
      btn.disabled = locked && picked !== k;
      const first = (a.steps || [])[0];
      btn.append(el('b', '', a.label || `Way ${k + 1}`));
      const more = validChoice(a.choice);
      if (first) btn.append(el('small', '', stepLabel(first, b)));
      else if (more) btn.append(el('small', '', more.question || 'Another choice'));
      btn.addEventListener('click', () => choose(depth, k));
      answers.append(btn);
      return btn;
    });
    sec.append(row, answers);
    P.dom.choices.push({ sec, node, btns, cy: 0, depth, b });
    return sec;
  }

  /** A card's outline, as a flag on its wire: out of the wire in a soft S, down its right side, back into the wire.
   *  Open along the wire (the wire draws that side); `close` closes it for the fill. */
  function flag(f, xc, y, w, h, d, close) {
    // The wire splits round the sound: each side straight down along it, a long lean out, straight down at the
    // card's edge, then the same lean back in. Open, it is the two sides; closed, the body between them.
    const side = (hw) => `C${f(xc)} ${f(y + d * 0.42)} ${f(xc + hw)} ${f(y + d * 0.45)} ${f(xc + hw)} ${f(y + d)}`
      + `V${f(y + h - d)}C${f(xc + hw)} ${f(y + h - d * 0.45)} ${f(xc)} ${f(y + h - d * 0.42)} ${f(xc)} ${f(y + h)}`;
    const hw = w / 2;
    if (!close) return `M${f(xc)} ${f(y)}${side(hw)}M${f(xc)} ${f(y)}${side(-hw)}`;
    return `M${f(xc)} ${f(y)}${side(hw)}C${f(xc)} ${f(y + h - d * 0.42)} ${f(xc - hw)} ${f(y + h - d * 0.45)} ${f(xc - hw)} ${f(y + h - d)}`
      + `V${f(y + d)}C${f(xc - hw)} ${f(y + d * 0.45)} ${f(xc)} ${f(y + d * 0.42)} ${f(xc)} ${f(y)}Z`;
  }

  /** Draws the wire from where things actually sit on the page (text may wrap, fonts may load late). */
  function measure() {
    const D = P.dom;
    if (!D || !D.svg || (!D.runs.length && !D.choices.length)) { if (D && D.svg) { D.svg.innerHTML = ''; D.under.innerHTML = ''; } return; }
    const box = $('#fl-cascade');
    const b = box.getBoundingClientRect();
    const rel = (e) => { const r = e.getBoundingClientRect(); return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height }; };
    const W = Math.ceil(box.clientWidth);
    const Ht = Math.ceil(box.scrollHeight);
    const f = (n) => Math.round(n * 10) / 10;
    const wires = [];
    const frames = [];
    let X = null;
    D.runs.forEach((R) => {
      const a = rel(R.area);
      const n = rel(R.node);
      R.top = a.y; R.left = a.x; R.cy = n.y + n.h / 2;
      if (X == null) X = n.x + n.w / 2;
      D.dots.forEach((o) => { if (o.run === D.runs.indexOf(R)) o.gy = a.y + o.y; });
      // Rails: like the logo, every lane splits from the spine at one point under the gate, each in a long S
      // (straight down, a slow lean across, straight down again), then runs down past its last card.
      // A wire is not drawn through a sound: it splits round it (the sound's outline is the wire there).
      const holesOf = (lane) => R.cards.filter((c) => c.lane === lane).map((c) => [a.y + c.top, a.y + c.top + c.ch]).sort((p, q) => p[0] - q[0]);
      const vert = (x, yA, yB, holes) => {
        let y = yA;
        let d = '';
        holes.forEach(([t, bt]) => { if (bt <= y) return; if (t > y) d += `V${f(t)}`; d += `M${f(x)} ${f(bt)}`; y = bt; });
        if (yB > y) d += `V${f(yB)}`;
        return d;
      };
      R.holes = holesOf(0);
      const lanes = [...new Set(R.cards.map((c) => c.lane))].filter((l) => l > 0).sort((p, q) => p - q);
      const ys = a.y + 6;
      lanes.forEach((l) => {
        const x1 = a.x + R.cards.find((c) => c.lane === l).rail;
        const B = splitOf(Math.abs(x1 - X));
        const y1 = ys + B;
        wires.push(`M${f(X)} ${f(ys)}C${f(X)} ${f(ys + B * 0.42)} ${f(x1)} ${f(y1 - B * 0.55)} ${f(x1)} ${f(y1)}${vert(x1, y1, a.y + R.total - 4, holesOf(l))}`);
      });
      R.cards.forEach((c) => {
        const x = a.x + c.rail, y = a.y + c.top;
        c.gy = y; c.gx = a.x + c.left;
        frames.push({ c, d: flag(f, x, y, c.w, c.ch, c.d, false), fill: flag(f, x, y, c.w, c.ch, c.d, true) });
      });
    });
    const en = rel(D.end.node);
    D.end.cy = en.y + en.h / 2;
    D.choices.forEach((C) => { const cn = rel(C.node); C.cy = cn.y + cn.h / 2; if (X == null) X = cn.x + cn.w / 2; });
    if (X == null) X = en.x + en.w / 2;
    // The spine: straight down from the first gate (or choice) to Next chapter, through every gate and choice.
    const y0 = Math.min(D.runs.length ? D.runs[0].cy : Infinity, D.choices.length ? D.choices[0].cy : Infinity);
    const spineHoles = D.runs.flatMap((R) => R.holes || []).sort((p, q) => p[0] - q[0]);
    let sp = `M${f(X)} ${f(y0)}`;
    let yy = y0;
    spineHoles.forEach(([t, bt]) => { if (bt <= yy) return; if (t > yy) sp += `V${f(t)}`; sp += `M${f(X)} ${f(bt)}`; yy = bt; });
    if (D.end.cy > yy) sp += `V${f(D.end.cy)}`;
    wires.unshift(sp);
    const id = `fl-${P.chapterToken}`;
    const svg = D.svg;
    [svg, D.under].forEach((g) => { g.setAttribute('width', W); g.setAttribute('height', Ht); g.setAttribute('viewBox', `0 0 ${W} ${Ht}`); });
    // Under each sound: its body, and the gold that fills it when it is started by hand (clipped to its own level).
    D.under.innerHTML = `<defs>${frames.map((o, k) => `<clipPath id="${id}-h${k}" clipPathUnits="userSpaceOnUse"><rect x="${f(o.c.gx - 2)}" y="${f(o.c.gy)}" width="${f(o.c.w + 4)}" height="0"/></clipPath>`).join('')}</defs>`
      + frames.map((o, k) => `<path class="body" d="${o.fill}" style="--z:${o.c.card.style.getPropertyValue('--z')}"/><path class="by-hand" d="${o.fill}" clip-path="url(#${id}-h${k})"/>`).join('');
    svg.innerHTML = `<defs>`
      + `<g id="${id}-w">${wires.map((d) => `<path d="${d}"/>`).join('')}</g>`
      + `<g id="${id}-f">${frames.map((o) => `<path d="${o.d}"/>`).join('')}</g>`
      + `<g id="${id}-g">${frames.map((o, k) => `<path data-k="${k}" d="${o.d}"/>`).join('')}</g>`
      + `<clipPath id="${id}-c" clipPathUnits="userSpaceOnUse"><rect x="-20" y="0" width="${W + 40}" height="0"/>${frames.map((o) => `<rect x="${f(o.c.gx - 8)}" y="${f(o.c.gy - 8)}" width="${f(o.c.w + 16)}" height="0"/>`).join('')}</clipPath>`
      + `</defs>`
      + `<g class="base"><use class="bf" href="#${id}-f"/><use class="bw" href="#${id}-w"/></g>`
      + `<g class="gilt" clip-path="url(#${id}-c)">`
      + `<g class="halo"><use href="#${id}-w"/><use href="#${id}-g"/></g>`
      + `<g class="halo2"><use href="#${id}-w"/><use href="#${id}-g"/></g>`
      + `<g class="core"><use href="#${id}-w"/><use href="#${id}-g"/></g>`
      + `<g class="shine"><use href="#${id}-w"/><use href="#${id}-g"/></g>`
      + `</g>`;
    const rects = svg.querySelectorAll('clipPath rect');
    D.clip = rects[0];
    const fpaths = svg.querySelectorAll(`#${id}-g path`);
    const fills = D.under.querySelectorAll('path.body');
    const hands = D.under.querySelectorAll('path.by-hand');
    const handRects = D.under.querySelectorAll('clipPath rect');
    frames.forEach((o, k) => { o.c.rect = rects[k + 1]; o.c.path = fpaths[k]; o.c.under = fills[k]; o.c.hand = hands[k]; o.c.handRect = handRects[k]; o.c.hh = -1; o.c.extra = -1; o.c.spent = false; });
    D.lit = -1;
    D.H = Ht;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function voiceOf(i, k) {
    for (let n = P.voices.length - 1; n >= 0; n--) if (P.voices[n].step === i && P.voices[n].k === k) return P.voices[n];
    return null;
  }

  function setCls(node, name, on) { if (node.classList.contains(name) !== on) node.classList.toggle(name, on); }

  /** Where the wire is inside run r, in seconds of its plan (follows jumps), or null before it starts. */
  function runTime(R, t) {
    let cur = -1;
    R.run.steps.forEach((i) => { const s = P.starts[i]; if (s != null && s <= t && (cur < 0 || s >= P.starts[cur])) cur = i; });
    if (cur < 0) return null;
    return P.offsets[cur] + (t - P.starts[cur]);
  }

  /** One frame: pours the gold down the wire, lights the cards, moves the playhead and the countdowns. */
  function frame() {
    if (!P.rec || !P.dom) return;
    const D = P.dom;
    const s = state();
    const t = s.t;
    P.voices = P.voices.filter((v) => !(v.done && (v.cut ?? v.end) < t - 2));
    const curRun = D.runs.findIndex((R) => R.run.steps.includes(s.cur));
    // Where the gold should be: the playhead inside the run that plays, a waiting gate, or Next chapter.
    let target = 0;
    D.runs.forEach((R, r) => {
      const rt = curRun > r && runTime(R, t) != null ? Math.max(runTime(R, t), R.L.end + 1) : runTime(R, t);
      R.rt = rt;
      if (rt != null) target = Math.max(target, rt >= R.L.end ? R.top + R.total : R.top + R.pad + R.L.map(rt));
      if (s.mode === 'wait' && s.gate === R.run.gate) target = Math.max(target, R.cy);
      // A gate just opened: the gold runs from it down to the top of its sounds, which start as it arrives.
      const st = P.starts[R.run.gate];
      if (st != null && st > t) {
        const u = Math.min(1, Math.max(0, 1 - (st - t) / POUR));
        const e = u * u * (3 - 2 * u);
        target = Math.max(target, R.cy + e * (R.top + R.pad - R.cy));
      }
    });
    if (s.mode === 'idle') target = 0;
    const waitAt = s.mode === 'choice' ? D.choices.find((C) => C.depth === choiceDepth()) : null;
    if (waitAt) target = Math.max(target, waitAt.cy);
    if (s.mode === 'done') target = D.end.cy;
    // The gold flows: it follows the playhead exactly; along bare wire (a run's end down to the next gate,
    // a jump ahead) it runs at an easy pace the eye can follow, slowing as it arrives.
    const ms = performance.now();
    const dt = D.last ? Math.min(0.1, (ms - D.last) / 1000) : 0;
    D.last = ms;
    const gap = target - D.shown;
    if (gap <= 0 || gap < 12) D.shown = target;
    else D.shown += Math.min(gap, Math.max(90 * dt, gap * (1 - Math.exp(-dt / 0.24))));
    const Y = D.shown;
    const yr = Math.round(Y * 2) / 2;
    if (D.clip && yr !== D.lit) { D.lit = yr; D.clip.setAttribute('height', String(yr)); }
    let focusY = null;
    D.runs.forEach((R, r) => {
      const started = R.rt != null;
      const waiting = (s.mode === 'wait' && s.gate === R.run.gate) || (s.mode === 'idle' && r === 0);
      setCls(R.sec, 'lit', started && Y >= R.cy - 2);
      setCls(R.sec, 'waiting', waiting && !started);
      setCls(R.sec, 'past', started && R.rt >= R.L.end);
      const local = Y - R.top;
      const show = started && r === curRun && R.rt < R.L.end + 0.5 && s.mode !== 'idle' && local > 0 && local < R.total;
      R.head.hidden = !show;
      if (show) { R.head.style.transform = `translateY(${local}px)`; focusY = Y; }
      if (waiting) focusY = R.cy - 30;
    });
    D.cards.forEach((x, key) => {
      const [i, k] = key.split(':').map(Number);
      const st = P.starts[i];
      const v = voiceOf(i, k);
      const c = x.c;
      let on = false, done = false, frac = 0, left = c.duration, started = false;
      if (v) {
        const end = v.cut ?? v.end;
        on = t >= v.t0 && t < end;
        done = t >= end;
        frac = Math.min(1, Math.max(0, (t - v.t0) / Math.max(0.01, v.end - v.t0)));
        left = Math.max(0, v.end - Math.max(t, v.t0));
        started = t >= v.t0;
      } else if ((st != null && st <= t) || P.forced.has(key)) { done = true; started = true; }
      const forced = P.forced.has(key);
      const reached = !!(on || done || forced || (st != null && st + c.offset <= t) || (s.cur >= 0 && runIndex(i) < runIndex(s.cur)));
      setCls(x.card, 'on', on);
      setCls(x.card, 'done', done && !on);
      setCls(x.card, 'warn', on && left <= 10);
      setCls(x.card, 'reached', reached);
      setCls(x.pb, 'gone', reached);
      // A sound that has finished turns grey at once, its frame too; the wire it hangs from stays gold.
      const over = done && !on;
      setCls(x.card, 'spent', forced && done);
      if (x.path && over !== x.spent) { x.spent = over; x.path.style.opacity = over ? '0' : ''; }
      if (x.under) { setCls(x.under, 'on', on); setCls(x.under, 'done', over); }
      // The bar moves with the wire (a card started by hand, off the wire, follows its own sound).
      const R = D.runs[x.run];
      let p = frac;
      if (!forced && R.rt != null && !(done && !x.cont)) p = Math.min(1, Math.max(0, (R.rt - x.s0) / Math.max(0.01, x.span)));
      if (done) p = 1;
      if (x.cont && on && !forced && R.rt != null) left = Math.max(0, x.s0 + x.span - R.rt);
      x.fill.style.width = `${p * 100}%`;
      // A card lights with the wire; one started by hand, or a sound already over, has its own gold.
      let extra = 0;
      // Started by hand, ahead of the wire: the sound runs on its own little wire. Its outline lights from its
      // top down and its body fills with gold, both at the pace of its own sound; when it ends, the gold drains away
      // and the card rests, dimmed, until the wire comes by.
      const own = forced && started && (on || !done);
      const lvl = own ? (c.hold ? 1 : p) : 0;
      if (own) extra = Math.max(3, lvl * x.ch) + 8;
      extra = Math.round(extra);
      if (x.rect && extra !== x.extra) { x.extra = extra; x.rect.setAttribute('height', String(extra)); }
      if (x.handRect) {
        const hh = forced && started ? Math.round((done ? 1 : lvl) * x.ch) : 0;
        if (hh !== x.hh) { x.hh = hh; x.handRect.setAttribute('height', String(hh)); }
        setCls(x.hand, 'on', forced && on);
        setCls(x.hand, 'hold', forced && on && !!c.hold);
      }
      setCls(x.card, 'hand', forced);
      const txt = forced && done && !on ? 'played' : c.hold ? (on ? (x.lastRun ? '∞' : 'till Go') : holdLabel(c)) : on ? (x.cont && left <= 0 ? 'till Go' : F.clock(left)) : F.clock(c.duration);
      if (x.time.textContent !== txt) x.time.textContent = txt;
    });
    D.dots.forEach(({ d, i, gy }) => setCls(d, 'lit', P.starts[i] != null && P.starts[i] <= t && Y >= (gy || 0) - 1));
    D.choices.forEach((C) => {
      const at = C === waitAt;
      setCls(C.sec, 'waiting', at);
      setCls(C.sec, 'lit', Y >= C.cy - 2 || (P.path[C.depth] != null && P.starts[C.b] != null));
      if (at) focusY = C.cy - 30;
    });
    const arrived = s.mode === 'done' && Y >= D.end.cy - 2;
    setCls(D.end.end, 'lit', arrived);
    setCls(D.end.btn, 'ready', arrived || (s.mode === 'run' && P.end != null && P.end - t < 5));
    if (s.mode === 'done') focusY = D.end.cy - 40;
    follow(focusY);
    paintDock(s);
  }

  /** A new chapter opens at its top. A glide still running (iOS keeps them going) is cut first. */
  function toTop() {
    const sc = $('#fl-scroll');
    sc.style.overflowY = 'hidden';
    sc.scrollTop = 0;
    void sc.offsetHeight;
    sc.style.overflowY = '';
    sc.scrollTop = 0;
    requestAnimationFrame(() => { sc.scrollTop = 0; });
    P.scrolling = Date.now();
    P.touched = 0;
  }

  /** Keeps the wire in sight without chasing it: the page turns only when the gold nears the bottom
   * (or leaves the top), so a chapter that starts keeps its title on screen. */
  function follow(y) {
    if (y == null || Date.now() - P.touched < 5000) return;
    const sc = $('#fl-scroll');
    const h = sc.clientHeight;
    const pos = y - sc.scrollTop;
    if (pos >= h * 0.1 && pos <= h * 0.62) return;
    const want = Math.max(0, y - h * 0.25);
    if (Math.abs(sc.scrollTop - want) < 48) return;
    if (P.scrolling && Date.now() - P.scrolling < 700) return;
    P.scrolling = Date.now();
    const quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;
    sc.scrollTo({ top: want, behavior: quiet ? 'auto' : 'smooth' });
  }

  let lastDock = '';
  function paintDock(s) {
    if (!P.rec) return;
    s = s || state();
    const goBtn = $('#fl-go');
    const target = nextTarget(s);
    let label, sub, cls;
    if (P.loading) { label = 'Loading sounds'; sub = `${P.loading} left`; cls = 'loading'; }
    else if (s.mode === 'idle') { label = 'Begin'; sub = P.steps[0] ? stepLabel(P.steps[0], 0) : 'Nothing to play'; cls = 'ready'; }
    else if (s.mode === 'wait') { label = 'Go'; sub = stepLabel(P.steps[s.gate], s.gate); cls = 'ready'; }
    else if (s.mode === 'choice') { label = 'Choose'; sub = (choiceOf() && choiceOf().question) || 'Pick the way'; cls = 'ready silver'; }
    else if (s.mode === 'done') {
      const last = P.ch + 1 >= P.rec.story.chapters.length;
      label = last ? 'The end' : 'Next chapter'; sub = last ? 'Every chapter is played' : (P.rec.story.chapters[P.ch + 1].title || `Chapter ${P.ch + 2}`); cls = last ? 'off' : 'ready';
    } else if (target >= 0) {
      const at = P.gate ? P.gate.t : P.starts[target];
      const inS = at != null ? Math.max(0, at - s.t) : null;
      label = P.gate && target === P.gate.i ? 'Go now' : 'Skip';
      sub = `${stepLabel(P.steps[target], target)}${inS != null ? `, in ${F.clock(inS)}` : ''}`;
      cls = 'quiet';
    } else {
      label = 'Last step'; sub = P.end != null ? `Ends in ${F.clock(P.end - s.t)}` : ''; cls = 'off';
    }
    const key = `${label}|${sub}|${cls}|${P.paused}|${s.mode}|${s.cur}`;
    if (key === lastDock) return;
    lastDock = key;
    goBtn.className = `fl-go ${cls}`;
    goBtn.disabled = cls === 'off' || cls === 'loading';
    $('#fl-go-label').textContent = label;
    $('#fl-go-sub').textContent = sub;
    const pb = $('#fl-pause');
    pb.innerHTML = P.paused ? ICON.play : ICON.pause;
    pb.setAttribute('aria-label', P.paused ? 'Resume' : 'Pause');
    pb.classList.toggle('on', P.paused);
    pb.disabled = s.mode === 'idle';
    $('#fl-stop').disabled = s.mode === 'idle';
    const step = s.cur >= 0 ? `Step ${s.cur + 1} of ${P.steps.length}` : `${P.steps.length} steps`;
    $('#fl-status').textContent = P.paused ? `Paused, ${step}` : step;
    document.querySelectorAll('#fl-chapters .fl-chip').forEach((b, i) => b.classList.toggle('live', i === P.ch && s.mode !== 'idle'));
  }

  function onGo() {
    const s = state();
    if (s.mode === 'choice') {
      // The answers are on the wire: bring them into view.
      const C = P.dom && P.dom.choices.find((x) => x.depth === choiceDepth());
      if (C) { P.touched = 0; P.scrolling = 0; follow(C.cy - 30); C.sec.classList.remove('nudge'); void C.sec.offsetWidth; C.sec.classList.add('nudge'); }
      return;
    }
    if (s.mode === 'done') { if (P.ch + 1 < P.rec.story.chapters.length) openChapter(P.ch + 1, !!settings.autoNext); return; }
    const t = nextTarget(s);
    if (t >= 0) go(t);
  }

  function loop() {
    cancelAnimationFrame(P.raf);
    const tick = () => {
      try { frame(); } catch (e) { if (!tick.warned) { console.error('Troubadour Ballade frame', e); tick.warned = true; } }
      P.raf = requestAnimationFrame(tick);
    };
    P.raf = requestAnimationFrame(tick);
  }

  /* ---------- Wiring (once) ---------- */
  function wire() {
    $('#fl-go').addEventListener('click', onGo);
    $('#fl-pause').addEventListener('click', togglePause);
    $('#fl-stop').addEventListener('click', () => stopAll());
    $('#fl-pause').innerHTML = ICON.pause;
    $('#fl-stop').innerHTML = ICON.stop;
    $('#fl-sb').innerHTML = ICON.star;
    $('#fl-sb').addEventListener('click', () => { const d = $('#fl-drawer'); d.hidden = !d.hidden; $('#fl-sb').setAttribute('aria-pressed', String(!d.hidden)); });
    $('#fl-drawer-close').innerHTML = ICON.close;
    $('#fl-drawer-close').addEventListener('click', () => { $('#fl-drawer').hidden = true; $('#fl-sb').setAttribute('aria-pressed', 'false'); });
    $('#fl-master').addEventListener('input', (e) => {
      settings.master = Number(e.target.value);
      paintRange(e.target);
      const { ctx, master } = audio();
      master.gain.setTargetAtTime(settings.master, ctx.currentTime, 0.03);
      saveSettings();
    });
    $('#fl-sbvol').addEventListener('input', (e) => {
      settings.sbVolume = Number(e.target.value);
      paintRange(e.target);
      if (P.sbBus) P.sbBus.gain.value = settings.sbVolume;
      saveSettings();
    });
    let resizeT = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => { if (P.rec && P.dom && P.dom.width !== null) renderCascade(); }, 150);
    });
    // Text that wraps differently (a font arriving late) moves the gates: the wire is redrawn to follow.
    if ('ResizeObserver' in window) {
      let mt = 0;
      new ResizeObserver(() => { cancelAnimationFrame(mt); mt = requestAnimationFrame(() => { if (P.rec && P.dom) measure(); }); }).observe($('#fl-cascade'));
    }
    const sc = $('#fl-scroll');
    ['touchstart', 'wheel', 'mousedown'].forEach((ev) => sc.addEventListener(ev, () => { P.touched = Date.now(); }, { passive: true }));
    $('#fl-back').innerHTML = ICON.back;
    $('#fl-back').addEventListener('click', () => { if (P.onLeave) P.onLeave(); });
  }

  global.FlowPlayer = { open, close, wire, state: () => (P.rec ? state() : null), isOpen: () => !!P.rec, chapter: () => P.ch, togglePause };
})(window);
