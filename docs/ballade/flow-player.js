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
  const TRAVEL = 900; // px per second: only when the troubadour jumps ahead (a gate tapped early) does the gold hurry
  /** The clock: the gold moves down the wire at one speed, px per second, everywhere (cards, silences, bare wire).
   *  The screen follows it, so the page scrolls with the music. Set in Settings. */
  const SCALE = 2.5; // cards two to three times as tall as the plain clock would draw them
  const pps = () => SCALE * Math.max(4, Math.min(30, Number(settings.clock) || 10));

  const P = {
    rec: null, ch: 0, steps: [], buffers: new Map(), blobs: null, loading: 0,
    voices: [], starts: [], gate: null, end: null, forced: new Set(), paused: false, bus: null, sbBus: null,
    dom: null, raf: 0, pours: {}, focus: -1, touched: 0, onLeave: null, chapterToken: 0,
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
    P.path = []; P.choiceAt = null; P.jump = false;
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

  function makeVoice(stepIdx, k, card, t0, from = 0) {
    const buf = P.buffers.get(card.file);
    if (!buf) return null;
    if (card.play === 'random') return randomVoice(stepIdx, k, card, t0, buf);
    const { ctx } = audio();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let start = Math.min(card.start || 0, Math.max(0, buf.duration - 0.05));
    if (from > 0) start = Math.min(buf.duration - 0.05, start + (card.play === 'loop' ? from % Math.max(0.05, buf.duration - start) : from));
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
    // The page stays still: the choice tapped keeps its place on the screen while the cascade is redrawn.
    const sc = $('#fl-scroll');
    const old = P.dom && P.dom.choices.find((C) => C.depth === d);
    const before = old ? old.sec.getBoundingClientRect().top : null;
    P.path = P.path.slice(0, d).concat(a);
    P.steps = pathSteps();
    // Steps after b were never started (the way did not run yet): forget them.
    P.starts.length = Math.min(P.starts.length, b);
    if (P.gate && P.gate.i >= b) P.gate = null;
    renderCascade();
    const now_ = P.dom.choices.find((C) => C.depth === d);
    if (before != null && now_) { sc.scrollTop += now_.sec.getBoundingClientRect().top - before; P.cam = sc.scrollTop; }
    P.touched = Date.now();
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
    P.gate = null; P.end = null; P.choiceAt = null; P.jump = false;
    // Opening a gate: the gold first runs down from the gate to the sounds, then they start.
    schedule(i, t + (P.steps[i].gate || i === 0 ? pourOf(i) : LEAD));
    P.focus = -1;
    P.touched = 0;
    global.FlowApp && global.FlowApp.wake();
    paintDock();
  }

  /** How long the gold takes from gate i down to its sounds, at its steady pace (the sounds start as it arrives). */
  function pourOf(i) {
    const R = P.dom && P.dom.runs.find((x) => x.run.gate === i);
    const dur = R && R.nb ? Math.min(5, Math.max(0.05, (R.top + R.pad - R.nb) / pps())) : POUR;
    P.pours[i] = dur;
    return dur;
  }

  /* ---------- The clock on the wire ---------- */

  /** Seconds into run R at time t (negative while the gold pours from its gate to its sounds), or null. */
  function runClock(R, t) {
    let cur = -1;
    R.run.steps.forEach((i) => { const s = P.starts[i]; if (s != null && s <= t && (cur < 0 || s >= P.starts[cur])) cur = i; });
    if (cur >= 0) return P.offsets[cur] + (t - P.starts[cur]);
    const g = P.starts[R.run.gate];
    return g != null ? t - g : null;
  }
  /** The top of the node the gold flows into after run R: the next gate, a choice, or Next chapter. */
  function stopAfter(R) {
    const D = P.dom;
    const tops = [D.end.nt].concat(D.runs.map((x) => x.nt), D.choices.map((C) => C.nt)).filter((y) => y != null && y > R.top + 1);
    return tops.length ? Math.min(...tops) : D.end.nt;
  }
  /** Where the gold is in run R at time t: down from the gate at the clock's pace, through the sounds, on down
   *  the bare wire to the next node, where it stops. Null before the run starts. */
  function goldIn(R, t) {
    const rc = runClock(R, t);
    if (rc == null || R.nb == null) return null;
    return Math.min(stopAfter(R), Math.max(R.nb, R.top + R.pad + rc * pps()));
  }
  /** The run that plays last (the one the wire is in), or null. */
  function liveRun(t) {
    const D = P.dom;
    if (!D) return null;
    let best = null, bs = -Infinity;
    D.runs.forEach((R) => { R.run.steps.forEach((i) => { const s = P.starts[i]; if (s != null && s > bs) { bs = s; best = R; } }); });
    void t;
    return best;
  }
  /** True once the gold has reached the node after the run that plays (the gate, the choice, Next chapter). */
  function goldArrived(t) {
    const R = liveRun(t);
    if (!R || R.nb == null) return true; // nothing drawn yet: go by the times alone
    const y = goldIn(R, t);
    return y != null && y >= stopAfter(R) - 0.5;
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
    P.starts = []; P.gate = null; P.end = null; P.focus = -1; P.forced.clear(); P.choiceAt = null; P.jump = false;
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
    // The gate, the choice and the end open when the gold gets there, at the clock's pace.
    const there = P.jump || ((P.choiceAt != null && t >= P.choiceAt) || (P.gate && t >= P.gate.t) || (P.end != null && t >= P.end) ? goldArrived(t) : false);
    if (P.choiceAt != null && t >= P.choiceAt && there) return { mode: 'choice', cur, t };
    if (P.gate && t >= P.gate.t && there) return { mode: 'wait', cur, gate: P.gate.i, t };
    if (P.end != null && t >= P.end && there) return { mode: 'done', cur, t };
    return { mode: 'run', cur, t };
  }

  /** The step the golden button moves to. */
  function nextTarget(s) {
    if (s.mode === 'idle') return 0;
    if (s.mode === 'wait') return s.gate;
    if (s.mode === 'done' || s.mode === 'choice') return -1;
    if (P.gate) return P.gate.i;
    // The next step waiting on the clock. A gate the gold is still pouring from was just opened: the button
    // leads past it, to the gate after it (or, with none, to the choice or the next chapter).
    const pending = P.starts.findIndex((x, i) => i > s.cur && x != null && x > s.t);
    if (pending >= 0 && !(pending === 0 || P.steps[pending].gate)) return pending;
    const from = pending >= 0 ? pending : s.cur;
    for (let k = from + 1; k < P.steps.length; k++) if (P.steps[k].gate) return k;
    return -1;
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

  const modeIcon = (c) => (c.play === 'random' ? ICON.random : c.hold ? ICON.infinity : ICON.once);
  const modeName = (c) => (c.play === 'random' ? 'Random until the gate' : c.hold ? 'Loops until the gate' : c.play === 'loop' ? 'Loops, then stops by itself' : 'Plays once, then stops');

  /* ---------- A card opened: its sound alone (like a card in the Troubadour app) ---------- */
  let opened = null; // { i, k, bar, btn, time, vol }
  function openCard(i, k) {
    const c = P.steps[i] && P.steps[i].cards[k];
    if (!c) return;
    $('#sheet-title').textContent = c.name;
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = 'fl-cardpanel';
    body.style.setProperty('--z', ZCOL[c.zone] || 'var(--accent)');
    const meta = el('div', 'cp-meta');
    const kind = el('span', 'cp-kind'); kind.append(el('i', 'fl-pill'), el('span', '', ZNAME[c.zone] || ''));
    const mode = el('span', 'cp-mode'); mode.innerHTML = modeIcon(c); mode.append(el('span', '', modeName(c)));
    meta.append(kind, mode);
    const bar = el('div', 'cp-bar'); const fill = el('i'); bar.append(fill);
    const row = el('div', 'cp-row');
    const btn = el('button', 'cp-play'); btn.type = 'button';
    btn.addEventListener('click', () => cardToggle(i, k));
    const time = el('span', 'cp-time');
    row.append(btn, time);
    const vrow = el('label', 'cp-vol');
    const vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = c.volume;
    vol.style.setProperty('--z', ZCOL[c.zone] || 'var(--accent)');
    const vv = el('b', '', String(Math.round(c.volume * 100)));
    vol.addEventListener('input', () => {
      c.volume = Number(vol.value); vv.textContent = String(Math.round(c.volume * 100)); paintRange(vol);
      const v = voiceOf(i, k);
      if (v && !v.done && v.cut == null) { const t = now(); try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(v.paused ? 0 : c.volume, t, 0.03); } catch (e) { /* gone */ } }
    });
    paintRange(vol);
    vrow.append(el('span', '', 'Volume'), vol, vv);
    body.append(meta, bar, row, vrow);
    opened = { i, k, fill, btn, time };
    paintCard();
    const dlg = $('#sheet');
    if (!dlg.open) dlg.showModal();
    dlg.addEventListener('close', () => { opened = null; }, { once: true });
  }
  /** Play or pause this one sound. Paused, it stops where it is (silent for a random card); played again, it goes on
   *  from there. A sound not started yet, or over, starts now. */
  function cardToggle(i, k) {
    const c = P.steps[i].cards[k];
    const v = voiceOf(i, k);
    const t = now();
    if (v && !v.done && v.cut == null && v.t0 <= t) {
      if (!v.paused) {
        v.paused = true; v.pausedAt = t;
        try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.03); } catch (e) { /* gone */ }
        if (!v.random && v.src) { v.pos = t - v.t0; try { v.src.onended = null; v.src.stop(t + 0.15); } catch (e) { /* gone */ } }
      } else {
        const dt = t - v.pausedAt;
        v.paused = false;
        if (!v.random) {
          // Start again from where it stopped: same sound, same loop, the rest of its length.
          const nv = makeVoice(i, k, Object.assign({}, c, { fadeIn: 0.2 }), t + LEAD, v.pos);
          if (nv) { nv.t0 = t + LEAD - v.pos; nv.end = v.end + dt; P.voices = P.voices.filter((x) => x !== v); P.voices.push(nv); }
        } else { try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(c.volume, t, 0.05); } catch (e) { /* gone */ } }
      }
    } else if (!cardReached(i, k)) {
      force(i, k);
    } else {
      const nv = makeVoice(i, k, c, t + LEAD);
      if (nv) { P.voices = P.voices.filter((x) => x !== v); P.voices.push(nv); P.forced.add(`${i}:${k}`); }
    }
    paintCard();
  }
  function paintCard() {
    if (!opened) return;
    const { i, k, fill, btn, time } = opened;
    const c = P.steps[i] && P.steps[i].cards[k];
    if (!c) return;
    const v = voiceOf(i, k);
    const t = now();
    const playing = !!(v && !v.done && v.cut == null && v.t0 <= t && !v.paused);
    const want = playing ? 'pause' : 'play';
    if (btn.dataset.s !== want) { btn.dataset.s = want; btn.innerHTML = playing ? ICON.pause : ICON.play; btn.setAttribute('aria-label', playing ? 'Pause this sound' : 'Play this sound'); }
    let frac = 0, txt = c.hold ? '∞' : F.clock(c.duration);
    if (v && v.t0 <= t) {
      const at = v.paused ? v.pausedAt : Math.min(t, v.cut ?? v.end);
      const len = Number.isFinite(v.end - v.t0) ? v.end - v.t0 : 0;
      frac = len ? Math.min(1, (at - v.t0) / len) : ((at - v.t0) % 10) / 10;
      txt = len ? `${F.clock(at - v.t0)} / ${F.clock(len)}` : F.clock(at - v.t0);
    }
    fill.style.width = `${frac * 100}%`;
    if (time.textContent !== txt) time.textContent = txt;
  }

  const holdLabel = (c) => (c.play === 'random' ? 'random' : 'loop');

  function stepLabel(s, i) {
    if (s.title) return s.title;
    return s.cards.map((c) => c.name).join(' + ') || `Step ${i + 1}`;
  }

  /* A chapter is drawn as runs: a run opens on a gate and holds the steps that follow on their own.
   * Inside a run, time flows down: every card starts at the height of its start and is as tall as it lasts
   * (long sounds squeezed, short ones stretched to stay readable), so sounds that overlap sit side by side.
   * The golden wire runs down the left, a thread branches to each card, and a playhead sweeps down with time. */
  const PAD = 10;      // room above the first sounds of a run, for the lane wires to branch off
  /** A run with more lanes needs more room on top: its rails leave one another like steps of a stair. */
  /** How tall the split to a lane `dx` px away is: like the logo, the wire takes its time to lean across. */
  const splitOf = (dx) => Math.round(Math.min(24, 16 + dx * 0.05));
  /** Where lane l of n sits, in steps from the spine. An odd number of lanes puts the first on the spine and the others
   *  in turns right and left; an even number leaves the spine free between them (two lanes: half a step either side). */
  const laneOffset = (l, n) => (n % 2 ? (l === 0 ? 0 : (l % 2 ? 1 : -1) * Math.ceil(l / 2)) : (l % 2 ? -1 : 1) * (Math.floor(l / 2) + 0.5));
  const maxOffset = (n) => (n % 2 ? (n - 1) / 2 : n / 2 - 0.5);
  const padOf = (lanes, step) => (lanes > 1 ? Math.max(PAD, splitOf(step * maxOffset(lanes)) + 2) : PAD);
  const RUN_PX = 540;   // a run is drawn about this tall...
  const MIN_PPS = 2;    // ...at no less than 2 px per second
  const MAX_PPS = 36;   // and no more than 36
  const HOLD_MIN = 6;   // seconds: a loop that holds, with nothing beside it, is drawn this long
  const MIN_PX = 66;    // a sound shorter than that still shows its name (the only card taller than it lasts)

  function runsOf(steps) {
    const runs = [];
    steps.forEach((s, i) => { if (i === 0 || s.gate) runs.push({ gate: i, steps: [] }); runs[runs.length - 1].steps.push(i); });
    return runs;
  }

  /** Lays out one run: card positions (seconds), lanes, and the time-to-pixel map. */
  function layoutRun(run, offsets, last, minPx = MIN_PX, fixedPps = 0) {
    const items = [];
    let stepsEnd = 0;
    run.steps.forEach((i) => { stepsEnd = Math.max(stepsEnd, offsets[i] + F.stepLength(P.steps[i])); });
    // Every sound ends somewhere on the clock: one played once at its end. A loop that holds (until the next gate)
    // is drawn only as long as the last sound beside it, whatever its own length: it goes on playing at the gate,
    // so it never makes the scene longer. Alone, it is drawn a few seconds long.
    const others = Math.max(stepsEnd, 0, ...run.steps.flatMap((i) => P.steps[i].cards.filter((c) => !c.hold).map((c) => offsets[i] + c.offset + c.duration)));
    run.steps.forEach((i) => {
      const s = P.steps[i];
      s.cards.forEach((c, k) => {
        const s0 = offsets[i] + c.offset;
        items.push({ i, k, c, s0, s1: c.hold ? Math.max(others, s0 + HOLD_MIN) : s0 + c.duration });
      });
    });
    // The run ends when its last sound does (a loop: its length or the last sound beside it).
    const end = Math.max(stepsEnd, ...items.map((x) => x.s1), 0);
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
    const pps = fixedPps || Math.min(MAX_PPS, Math.max(MIN_PPS, RUN_PX / Math.max(busyT, 0.1)));
    void busyT;
    // The map from time to height: one speed for the whole chapter, silences included, so the gold always flows
    // at the same pace down the screen. A sound too short to read is drawn taller than it lasts; the gold does not
    // slow down for it (the card turns grey when its sound is over, the gold carries on at its pace).
    const top = Math.max(end, ...items.map((x) => x.e));
    const map = (t) => Math.max(0, Math.min(t, top)) * pps;
    items.forEach((x) => { x.y0 = map(x.s0); x.y1 = Math.max(map(x.e), x.y0 + minPx); });
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
    // Redrawn (a way picked, a font loaded): the gold takes its place at once instead of running from the top.
    P.dom = { runs: [], end: null, cards: new Map(), dots: [], shown: 0, last: 0, choices: [], fresh: true, head: null };
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
    // The time line: one for the whole chapter, it goes with the gold everywhere, cards or bare wire,
    // and only hides while the gold rests in a gate, a choice or Next chapter.
    const headG = el('div', 'fl-playhead fl-clock');
    headG.hidden = true;
    box.append(headG);
    // Every choice on the path sits right after the steps of its list, before the way it opens.
    const forks = P.segs.map((g, d) => (g.choice ? { at: g.start + g.steps.length, sec: renderChoice(g.choice, d) } : null)).filter(Boolean);
    const placeForks = (upto) => forks.forEach((fk) => { if (!fk.sec.parentNode && fk.at <= upto) box.append(fk.sec); });
    const wayFrom = P.segs.length > 1 ? P.segs[1].start : Infinity;
    // One speed for the whole chapter: the slowest any of its runs would need to fit about RUN_PX.
    const chPps = pps(); // the clock: one speed for every chapter, so a minute is always as tall
    runs.forEach((run, r) => {
      placeForks(run.gate);
      const lastRun = r === runs.length - 1;
      const L = layoutRun(run, P.offsets, lastRun, MIN_PX, chPps);
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
      const m = maxOffset(L.lanes);
      const cw = Math.floor(Math.min(width / 4, (width / 2 - 2 - m * gap) / (m + 0.5)));
      const step = cw + gap;
      const pad = padOf(L.lanes, step);
      // Room under the sounds for every rail to lean back into the spine before the next gate.
      const foot = L.lanes > 1 ? splitOf(step * m) + 2 : 0;
      const H = L.height + pad + 9 + foot;
      area.style.height = `${H}px`;
      const narrow = cw < 118;
      const place = (l) => { const rail = X + laneOffset(l, L.lanes) * step; return { rail, left: rail - cw / 2, w: cw }; };
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
        // Room decides the card's face (the name, the kind of sound and how it plays always show):
        //   small  (under 80 px): the name on one line, then kind, play mode (icon) and time on one line;
        //   medium (80 to 140 px): the name on up to two lines, the kind, then play mode (icon and word) and time;
        //   large  (140 px and more): the name on up to three lines, larger, the kind, the play mode in words, the time.
        const short = ch < 80;
        const size = ch < 80 ? 'sz-s' : ch < 140 ? 'sz-m' : 'sz-l';
        const card = el('button', `fl-card c${x.cont ? ' cont' : ''} ${size}`);
        card.type = 'button';
        // Its words start where the card is nearly full width.
        card.style.cssText = `top:${top}px;left:${pl.left}px;width:${pl.w}px;height:${ch}px;--d:${Math.round(d * (short ? 0.4 : 0.72))}px;--db:${Math.round(short ? 0 : d)}px`;
        card.style.setProperty('--z', ZCOL[c.zone] || 'var(--accent)');
        const head = el('div', 'fl-ch');
        // The name stays on one line; too long for the card, it rolls slowly across it.
        const nm = el('b'); nm.append(el('span', '', c.name)); head.append(nm);
        const kind = el('div', 'fl-kind');
        const pill = el('i', 'fl-pill'); pill.title = ZNAME[c.zone] || '';
        kind.append(pill);
        const tags = el('div', 'fl-tags');
        // How it plays, as a symbol: it stops by itself (its length is fixed, so is its card), it loops until the
        // gate is tapped, or it comes back at random until then.
        const mode = el('span', 'fl-mode');
        mode.innerHTML = modeIcon(c);
        mode.title = modeName(c);
        tags.append(mode);
        const time = el('span', 'fl-time', c.hold ? '' : F.clock(c.duration));
        // Shown when the troubadour starts the sound by hand, ahead of the wire.
        const hand = el('span', 'fl-hand'); hand.innerHTML = ICON.hand; hand.title = 'Started by hand';
        tags.append(hand, time);
        const fill = el('i'); // no progress bar any more: the gold on the card is its time
        // The name, kind and play mode stay in sight while a tall card scrolls by.
        const stick = el('div', 'fl-stick');
        stick.append(head, kind, tags);
        card.append(stick);
        card.addEventListener('click', () => openCard(x.i, x.k));
        area.append(card);
        // Start now: a bead on the wire, where the card leaves it.
        const bead = short ? 22 : 24;
        const pb = el('button', 'fl-force');
        pb.type = 'button';
        pb.style.cssText = `left:${pl.rail - bead / 2}px;top:${top - bead / 2}px;width:${bead}px;height:${bead}px`;
        pb.setAttribute('aria-label', `Start ${c.name} now`);
        pb.innerHTML = ICON.go;
        pb.addEventListener('click', (e) => { e.stopPropagation(); force(x.i, x.k); });
        area.append(pb);
        const info = { stick, db: -1, lastRun: lastRun && !pending, card, fill, time, c, pb, top, left: pl.left, w: pl.w, ch, d, rail: pl.rail, lane: x.lane, run: r, s0: x.s0, e: x.e, cont: x.cont, span: Math.max(0.05, x.e - x.s0), extra: -1, spent: false, path: null, under: null };
        cards.push(info);
        P.dom.cards.set(`${x.i}:${x.k}`, info);
      });
      // The steps that follow on their own: a dot on the spine, tap to jump there.
      run.steps.slice(1).forEach((i) => {
        const d = el('button', 'fl-dot');
        d.type = 'button';
        const y = L.y(P.offsets[i]) + pad;
        d.style.top = `${y}px`;
        // Inside a sound that sits on the spine, the spine is that sound's outline: the dot sits on it, exactly.
        const over = cards.find((k) => Math.abs(k.rail - X) < 1 && y > k.top && y < k.top + k.ch);
        d.style.left = `${over ? X - lensEdge(over.w / 2, over.ch, over.d, y - over.top) : X}px`;
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
      P.dom.runs.push({ run, L, pad, foot, sec, node, sub, area, head, total: H, cards, X, top: 0, cy: 0 });
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
    P.dom.head = headG;
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
  function flag(f, xc, y, w, h, d, close, db = d, sq = 0) {
    // The wire splits round the sound: each side straight down along it, a long lean out, straight down at the
    // card's edge, then the same lean back in. Open, it is the two sides; closed, the body between them.
    // At the bottom, `db` (the height of the lean back in) and `sq` (0: a long point, 1: square) let the end of the
    // card give way to its words when they slide down it on a scroll: it flattens into a square end that holds them.
    const yb = y + h - db;
    const lo = (hw) => [xc + hw, y + h - db * 0.45 * (1 - sq), xc + hw * 0.62 * sq, y + h - db * 0.42 * (1 - sq)];
    const side = (hw) => { const [ax, ay, bx, by] = lo(hw); return `C${f(xc)} ${f(y + d * 0.42)} ${f(xc + hw)} ${f(y + d * 0.45)} ${f(xc + hw)} ${f(y + d)}`
      + `V${f(yb)}C${f(ax)} ${f(ay)} ${f(bx)} ${f(by)} ${f(xc)} ${f(y + h)}`; };
    const hw = w / 2;
    if (!close) return `M${f(xc)} ${f(y)}${side(hw)}M${f(xc)} ${f(y)}${side(-hw)}`;
    const [ax, ay, bx, by] = lo(-hw);
    return `M${f(xc)} ${f(y)}${side(hw)}C${f(bx)} ${f(by)} ${f(ax)} ${f(ay)} ${f(xc - hw)} ${f(yb)}`
      + `V${f(y + d)}C${f(xc - hw)} ${f(y + d * 0.45)} ${f(xc)} ${f(y + d * 0.42)} ${f(xc)} ${f(y)}Z`;
  }


  /** How far the outline of a sound stands from its wire, `y` px below its top (the curves of flag(), sampled). */
  function lensEdge(hw, h, d, y) {
    const cub = (a, b, c, e, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * e;
    const along = (x0, x1, y0, y1, yy) => {
      let px = x0, py = y0;
      for (let k = 1; k <= 32; k++) {
        const t = k / 32;
        const qx = cub(x0, x0, x1, x1, t), qy = cub(y0, y0 + (y1 - y0) * 0.42, y0 + (y1 - y0) * 0.45, y1, t);
        if (qy >= yy) return px + (qx - px) * ((yy - py) / Math.max(1e-6, qy - py));
        px = qx; py = qy;
      }
      return x1;
    };
    if (y <= 0 || y >= h) return 0;
    if (y < d) return along(0, hw, 0, d, y);
    if (y > h - d) return along(0, hw, 0, d, h - y); // the bottom is the top, upside down
    return hw;
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
      R.top = a.y; R.left = a.x; R.cy = n.y + n.h / 2; R.nb = n.y + n.h; R.nt = n.y;
      if (X == null) X = n.x + n.w / 2;
      D.dots.forEach((o) => { if (o.run === D.runs.indexOf(R)) o.gy = a.y + o.y; });
      R.dotsOff = false;
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
      const onSpine = (c) => Math.abs(a.x + c.rail - X) < 1;
      R.holes = R.cards.filter(onSpine).map((c) => [a.y + c.top, a.y + c.top + c.ch]).sort((p, q) => p[0] - q[0]);
      // A wire only runs where it carries sounds. A rail ends with the last sound of its lane, unless that sound lasts
      // to the end of the run: then it leans back into the spine and carries the gold on to the next gate.
      const bottom = Math.max(0, ...R.cards.map((c) => a.y + c.top + c.ch));
      const lastOf = (lane) => Math.max(...R.cards.filter((c) => c.lane === lane).map((c) => a.y + c.top + c.ch));
      const reaches = (lane) => lastOf(lane) >= bottom - 6;
      const sideLanes = [...new Set(R.cards.filter((c) => !onSpine(c)).map((c) => c.lane))];
      // No sound on the spine (two or four lanes) and a rail that carries the gold to the end: the spine would only
      // be a bare wire beside the sounds, between the gate and the next one. It stops where the rails leave it.
      R.noSpine = R.cards.length > 0 && !R.cards.some(onSpine) && sideLanes.some(reaches);
      if (R.noSpine) R.holes = [[a.y + 0.5, a.y + R.total + 1.5]];
      R.reaches = reaches; R.lastOf = lastOf;
      const lanes = [...new Set(R.cards.filter((c) => !onSpine(c)).map((c) => c.lane))].sort((p, q) => p - q);
      const ys = a.y;
      lanes.forEach((l) => {
        const x1 = a.x + R.cards.find((c) => c.lane === l).rail;
        const B = splitOf(Math.abs(x1 - X));
        const y1 = ys + B;
        // ...and comes back into the spine the same way under its sounds, so every wire ends on the next gate.
        const ym = a.y + R.total + 2;
        const yb = ym - B;
        const out = `M${f(X)} ${f(ys)}C${f(X)} ${f(ys + B * 0.42)} ${f(x1)} ${f(y1 - B * 0.55)} ${f(x1)} ${f(y1)}`;
        if (R.reaches(l)) wires.push(`${out}${vert(x1, y1, yb, holesOf(l))}C${f(x1)} ${f(yb + B * 0.55)} ${f(X)} ${f(ym - B * 0.42)} ${f(X)} ${f(ym)}`);
        else wires.push(`${out}${vert(x1, y1, R.lastOf(l), holesOf(l))}`); // ends with its last sound
      });
      R.cards.forEach((c) => {
        const x = a.x + c.rail, y = a.y + c.top;
        c.gy = y; c.gx = a.x + c.left;
        frames.push({ c, d: flag(f, x, y, c.w, c.ch, c.d, false), fill: flag(f, x, y, c.w, c.ch, c.d, true) });
      });
    });
    const en = rel(D.end.node);
    D.end.cy = en.y + en.h / 2; D.end.nt = en.y;
    const choiceHoles = [];
    D.choices.forEach((C) => {
      const cn = rel(C.node); C.cy = cn.y + cn.h / 2; C.nt = cn.y; if (X == null) X = cn.x + cn.w / 2;
      // The answers sit on the spine: the wire goes behind none of them.
      const ans = C.sec.querySelector('.fl-answers');
      if (ans) { const r = rel(ans); choiceHoles.push([r.y - 2, r.y + r.h + 2]); }
    });
    if (X == null) X = en.x + en.w / 2;
    // The spine: straight down from the first gate (or choice) to Next chapter, through every gate and choice.
    const y0 = Math.min(D.runs.length ? D.runs[0].cy : Infinity, D.choices.length ? D.choices[0].cy : Infinity);
    const spineHoles = D.runs.flatMap((R) => R.holes || []).concat(choiceHoles).sort((p, q) => p[0] - q[0]);
    let sp = `M${f(X)} ${f(y0)}`;
    let yy = y0;
    spineHoles.forEach(([t, bt]) => { if (bt <= yy) return; if (t > yy) sp += `V${f(t)}`; sp += `M${f(X)} ${f(bt)}`; yy = bt; });
    if (D.end.cy > yy) sp += `V${f(D.end.cy)}`;
    wires.unshift(sp);
    D.dots.forEach((o) => { const R = D.runs[o.run]; o.d.hidden = !!(R && R.noSpine); });
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
    const bpaths = svg.querySelectorAll(`#${id}-f path`);
    const fills = D.under.querySelectorAll('path.body');
    const hands = D.under.querySelectorAll('path.by-hand');
    const handRects = D.under.querySelectorAll('clipPath rect');
    frames.forEach((o, k) => { o.c.rect = rects[k + 1]; o.c.path = fpaths[k]; o.c.base = bpaths[k]; o.c.db = -1; o.c.under = fills[k]; o.c.hand = hands[k]; o.c.handRect = handRects[k]; o.c.hh = -1; o.c.extra = -1; o.c.spent = false; });
    D.lit = -1;
    D.H = Ht;
    // Names too long for their card roll across it.
    D.cards.forEach((x) => {
      const b = x.card.querySelector('.fl-ch b'); const sp = b && b.firstChild;
      if (!sp) return;
      const over = sp.scrollWidth - b.clientWidth;
      x.card.classList.toggle('roll', over > 2);
      if (over > 2) { b.style.setProperty('--roll', `${-over - 6}px`); b.style.setProperty('--rt', `${Math.max(5, over / 14 + 3)}s`); }
    });
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
    // Where the gold is: on the clock. It runs down from the gate that opened, through the sounds and the silences
    // between them, and on down the bare wire to the next node, always at the same pace.
    let target = 0;
    const live = liveRun(t);
    D.runs.forEach((R, r) => {
      const y = goldIn(R, t);
      R.rt = runClock(R, t);
      if (R.rt != null && R.rt < 0) R.rt = null; // still pouring: its sounds have not started
      if (y == null) return;
      // A run the wire has left (a later gate opened) is gold all the way down.
      target = Math.max(target, live && r < D.runs.indexOf(live) ? stopAfter(R) : y);
    });
    if (s.mode === 'idle') target = 0;
    const waitAt = s.mode === 'choice' ? D.choices.find((C) => C.depth === choiceDepth()) : null;
    if (waitAt) target = Math.max(target, waitAt.cy);
    if (s.mode === 'wait') { const G = D.runs.find((R) => R.run.gate === s.gate); if (G) target = Math.max(target, G.cy); }
    if (s.mode === 'done') target = D.end.cy;
    const ms = performance.now();
    const dt = D.last ? Math.min(0.5, (ms - D.last) / 1000) : 0;
    D.last = ms;
    // The gold follows the clock exactly. Only a jump the troubadour makes (a gate tapped early) makes it hurry.
    if (D.fresh) { D.fresh = false; D.shown = target; }
    const gap = target - D.shown;
    if (gap <= 0 || gap <= Math.max(30, pps() * dt * 3)) D.shown = target;
    else D.shown = Math.max(D.shown + TRAVEL * dt, target - 700);
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
      const show = started && R === live && R.rt < R.L.end + 0.5 && s.mode !== 'idle' && local > 0 && local < R.total;
      R.head.hidden = true;
      void show;
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
      const txt = forced && done && !on ? 'played' : c.hold ? (on ? (x.lastRun ? '∞' : '') : '') : on ? (x.cont && left <= 0 ? '' : F.clock(left)) : F.clock(c.duration);
      if (x.time.textContent !== txt) x.time.textContent = txt;
    });
    // The time line and its dot: wherever the gold runs, hidden only inside a gate, a choice or Next chapter.
    if (D.head) {
      const inNode = D.runs.some((R) => R.nt != null && Y >= R.nt - 3 && Y <= R.nb + 3)
        || D.choices.some((C) => C.nt != null && Y >= C.nt - 3 && Y <= C.cy + 3)
        || (D.end.nt != null && Y >= D.end.nt - 3);
      const showG = s.mode === 'run' && Y > 0 && !inNode;
      D.head.hidden = !showG;
      if (showG) { D.head.style.transform = `translateY(${Y}px)`; focusY = Y; }
    }
    if (opened) paintCard();
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
    follow(focusY, dt);
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
  /** The camera: it glides after the gold every frame (eased, never faster than a quick glance), keeping it about
   *  a third down the screen. A touch hands the scroll to the troubadour for five seconds. */
  function follow(y, dt) {
    const sc = $('#fl-scroll');
    if (!sc) return;
    if (y == null || Date.now() - P.touched < 5000) { P.cam = null; return; }
    const h = sc.clientHeight;
    const want = Math.min(Math.max(0, sc.scrollHeight - h), Math.max(0, y - h * 0.36));
    // Taken over again (a jump, a new chapter, a scroll by hand): start from where the page really is.
    if (P.cam == null || Math.abs(P.cam - sc.scrollTop) > 3) P.cam = sc.scrollTop;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { P.cam = want; sc.scrollTop = want; return; }
    const step = Math.min(0.1, dt || 1 / 60);
    let next = P.cam + (want - P.cam) * (1 - Math.exp(-step / 0.35));
    const cap = 1100 * step;
    next = P.cam + Math.max(-cap, Math.min(cap, next - P.cam));
    if (Math.abs(want - next) < 0.25) next = want;
    if (next === P.cam) return;
    P.cam = next;
    sc.scrollTop = next;
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
      label = last ? 'The end' : 'Next chapter'; sub = last ? 'Fade out and finish' : (P.rec.story.chapters[P.ch + 1].title || `Chapter ${P.ch + 2}`); cls = 'ready';
    } else if (target >= 0) {
      const at = P.gate ? P.gate.t : P.starts[target];
      let inS = at != null ? Math.max(0, at - s.t) : null;
      // The gate opens when the gold reaches it: count down to that.
      const R = P.gate && liveRun(s.t);
      if (R && R.nb != null) { const y = goldIn(R, s.t); if (y != null) inS = Math.max(inS || 0, (stopAfter(R) - y) / pps()); }
      label = P.gate && target === P.gate.i ? 'Go now' : 'Skip';
      sub = `${stepLabel(P.steps[target], target)}${inS != null ? `, in ${F.clock(inS)}` : ''}`;
      cls = 'quiet';
    } else if (choiceOf()) {
      // The last step plays: the choice is next. Tapping brings the wire there at once.
      label = 'Choose'; sub = choiceOf().question || 'Pick the way'; cls = 'quiet silver';
    } else if (P.ch + 1 < P.rec.story.chapters.length) {
      label = 'Next chapter'; sub = P.rec.story.chapters[P.ch + 1].title || `Chapter ${P.ch + 2}`; cls = 'quiet';
    } else {
      label = 'The end'; sub = 'Fade out and finish'; cls = 'quiet';
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
    const more = P.ch + 1 < P.rec.story.chapters.length;
    if (s.mode === 'done') { if (more) openChapter(P.ch + 1, !!settings.autoNext); else stopAll(); return; }
    const t = nextTarget(s);
    if (t >= 0) { go(t); return; }
    // The last step plays and the button still leads on: to the choice (the wire goes there now),
    // to the next chapter, or, at the end of the story, a fade out.
    if (choiceOf()) {
      P.choiceAt = now(); P.jump = true; P.touched = 0;
      const C = P.dom && P.dom.choices.find((x) => x.depth === choiceDepth());
      if (C) { C.sec.classList.remove('nudge'); void C.sec.offsetWidth; C.sec.classList.add('nudge'); }
      paintDock();
      return;
    }
    if (more) openChapter(P.ch + 1, !!settings.autoNext); else stopAll();
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

  global.FlowPlayer = { open, close, wire, relayout: () => { if (P.rec && P.dom) renderCascade(); }, state: () => (P.rec ? state() : null), isOpen: () => !!P.rec, chapter: () => P.ch, togglePause };
})(window);
