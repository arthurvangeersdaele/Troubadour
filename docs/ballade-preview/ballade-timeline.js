/* Troubadour Ballade, format version 2: one timeline per chapter (261114_ballade_plan.md, sections 3 and 4.1).
 * Pure: no screen, no sound. The player, the builder and the tests use it.
 *
 *  - fromV1(flow): a version 1 flow.json (steps, gates, offsets) as a version 2 one (clips at absolute times,
 *    cues, sections, choices), every relative time kept (3.4).
 *  - clean(flow): a version 2 flow.json made safe: fields in range, unknown fields kept.
 *  - Clock: the chapter clock (4.1). It runs from Begin, stops at cues and choices, holds on Pause, and plans
 *    every sound ahead on the audio clock (look-ahead 2 s), so a sound starts on time even if the screen sleeps.
 *
 * The rules (3.2): the clock runs from Begin; a clip sounds from `at` to `at + length`. At a cue the clock stops:
 * clips that `holdToCue` and cross it keep looping, the others end as written. Go releases the clock: what comes
 * next starts exactly when it would have, counted from the cue. A choice waits like a cue; the chosen way's
 * timeline continues the clock from 0. The chapter ends when its last clip ends.
 */
(function (global) {
  'use strict';

  const VERSION = 2;
  const KINDS = ['music', 'ambience', 'events'];
  const KIND_NAMES = { music: 'Music', ambience: 'Ambiance', events: 'Events' };
  const LOOPS = ['once', 'loop', 'random'];
  const CURVES = ['linear', 'equal-power', 's'];
  const MAX_SECONDS = 4 * 3600;
  const MAX_DEPTH = 24;
  const HOLDS_ALONE = 6; // s: a run of held loops alone reaches its gate after this (as the v1 player drew it)
  const HOLD_FADE = 1.5; // s: a held clip fades at least this long when Go is tapped (3.2.3)

  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------- Version 1 to version 2 ---------- */

  const playOf = (c) => (LOOPS.includes(c.play) ? c.play : c.repeat ? 'loop' : 'once');
  const holdsV1 = (c) => playOf(c) === 'random' || (playOf(c) === 'loop' && !!c.hold);
  const kindOf = (zone) => (KINDS.includes(zone) ? zone : 'events'); // a soundbox sound sits with the events
  /** A v1 step's own length: until `next`, else until its last card that ends on its own ends. */
  const stepLength = (s) => (s.next != null ? Number(s.next) || 0 : (s.cards || []).reduce((a, c) => (holdsV1(c) ? a : Math.max(a, (+c.offset || 0) + (+c.duration || 0))), 0));

  /** One list of v1 steps (a chapter's trunk or a way) as one timeline starting at 0. */
  function timelineOf(steps, choice, depth) {
    const clips = [], markers = [];
    let t = 0;            // where the current run starts
    let runEnd = 0;       // where the wire reaches the next gate, from the run's start
    let stepAt = 0;
    let anyEnds = false;
    const runHolds = [];  // held clips of the current run: they loop until the gate after it
    const closeRun = (end) => { runHolds.forEach((c) => { c.length = r3(Math.max(0.5, end - c.at)); }); runHolds.length = 0; };
    (steps || []).forEach((s, i) => {
      if (i > 0 && s.gate) {
        const end = t + (anyEnds ? runEnd : Math.max(runEnd, HOLDS_ALONE));
        closeRun(end);
        markers.push({ id: `q${markers.length + 1}`, type: 'cue', at: r3(end), name: String(s.title || '') });
        t = end; stepAt = 0; runEnd = 0; anyEnds = false;
      } else if (i > 0) {
        stepAt += stepLength(steps[i - 1]);
      }
      runEnd = Math.max(runEnd, stepAt + stepLength(s));
      if (s.title && !(i > 0 && s.gate)) markers.push({ id: `s${markers.length + 1}`, type: 'section', at: r3(t + stepAt), name: String(s.title) });
      (s.cards || []).forEach((c) => {
        const play = playOf(c), hold = holdsV1(c);
        const at = r3(t + stepAt + (+c.offset || 0));
        const clip = {
          id: '', track: '', name: String(c.name || 'Sound'), file: String(c.file || ''), kind: kindOf(c.zone),
          at, in: r3(+c.start || 0), length: r3(+c.duration || 1), loop: play,
          fadeIn: r3(+c.fadeIn || 0), fadeOut: r3(+c.fadeOut || 0), fadeCurve: 'equal-power', volume: r2(num(c.volume, 0.75, 0, 1)),
          holdToCue: hold,
        };
        if (play === 'random') { clip.each = r3(+c.duration || 1); clip.gapMin = r3(num(c.gapMin, 5, 0, 600)); clip.gapMax = r3(num(c.gapMax, 30, 0, 600)); }
        if (!hold) { anyEnds = true; runEnd = Math.max(runEnd, stepAt + (+c.offset || 0) + clip.length); } else runHolds.push(clip);
        clips.push(clip);
      });
    });
    // The end of the trunk: the choice (it waits like a cue) or the chapter's end.
    const end = t + (anyEnds ? runEnd : (runHolds.length ? Math.max(runEnd, HOLDS_ALONE) : runEnd));
    closeRun(end);
    const tl = { tracks: [], clips, markers };
    tracks(tl);
    if (choice && Array.isArray(choice.answers) && depth < MAX_DEPTH) {
      tl.choice = Object.assign({}, choice, {
        at: r3(end),
        answers: choice.answers.map((a) => {
          const way = Object.assign({}, a, { timeline: timelineOf(a.steps, a.choice, depth + 1) });
          delete way.steps; delete way.choice;
          return way;
        }),
      });
      delete tl.choice.steps;
    }
    return tl;
  }

  /** Lays the clips on tracks: one per kind, and another of that kind wherever two would overlap (an overlap on
   *  one track is a crossfade in version 2, which version 1 never asked for). */
  function tracks(tl) {
    const byTrack = {};
    tl.tracks = [];
    tl.clips.slice().sort((a, b) => a.at - b.at).forEach((c) => {
      const end = c.at + c.length;
      let tr = tl.tracks.find((t) => t.kind === c.kind && byTrack[t.id] <= c.at + 1e-6);
      if (!tr) {
        const n = tl.tracks.filter((t) => t.kind === c.kind).length;
        tr = { id: `t${tl.tracks.length + 1}`, name: KIND_NAMES[c.kind] + (n ? ` ${n + 1}` : ''), kind: c.kind, volume: 1, mute: false };
        tl.tracks.push(tr);
      }
      byTrack[tr.id] = end;
      c.track = tr.id;
    });
    tl.clips.forEach((c, i) => { c.id = `c${i + 1}`; });
    const order = { music: 0, ambience: 1, events: 2 };
    tl.tracks.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
  }

  /** A version 1 flow.json as version 2: the same Ballade, timed on one clock per chapter. */
  function fromV1(flow) {
    if (!flow || flow.version !== 1) throw new Error('Not a version 1 Ballade');
    const out = Object.assign({}, flow, { version: VERSION, converted: 1 });
    out.chapters = (flow.chapters || []).map((ch) => {
      const c = Object.assign({}, ch, timelineOf(ch.steps, ch.choice, 0));
      delete c.steps;
      if (!ch.choice) delete c.choice;
      return c;
    });
    return out;
  }

  /* ---------- Version 2, cleaned ---------- */

  function cleanTimeline(tl, depth = 0) {
    const out = Object.assign({}, tl);
    out.tracks = (tl.tracks || []).map((t, i) => Object.assign({}, t, {
      id: String(t.id || `t${i + 1}`), name: String(t.name || '').slice(0, 60), kind: KINDS.includes(t.kind) ? t.kind : 'events',
      volume: num(t.volume, 1, 0, 1), mute: !!t.mute,
    }));
    const ids = new Set(out.tracks.map((t) => t.id));
    out.clips = (tl.clips || []).filter((c) => ids.has(c.track)).map((c, i) => {
      const o = Object.assign({}, c, {
        id: String(c.id || `c${i + 1}`), name: String(c.name || 'Sound').slice(0, 120), file: String(c.file || ''),
        kind: KINDS.includes(c.kind) ? c.kind : 'events',
        at: r3(num(c.at, 0, 0, MAX_SECONDS)), in: r3(num(c.in, 0, 0, MAX_SECONDS)), length: r3(num(c.length, 1, 0.05, MAX_SECONDS)),
        loop: LOOPS.includes(c.loop) ? c.loop : 'once',
        fadeIn: r3(num(c.fadeIn, 0, 0, 30)), fadeOut: r3(num(c.fadeOut, 0, 0, 30)),
        fadeCurve: CURVES.includes(c.fadeCurve) ? c.fadeCurve : 'equal-power',
        volume: r2(num(c.volume, 0.75, 0, 1)), holdToCue: !!c.holdToCue,
      });
      if (o.loop === 'random') { o.each = r3(num(c.each, o.length, 0.05, MAX_SECONDS)); o.gapMin = r3(num(c.gapMin, 5, 0, 600)); o.gapMax = r3(num(c.gapMax, Math.max(o.gapMin, 30), o.gapMin, 600)); }
      else { delete o.each; delete o.gapMin; delete o.gapMax; }
      return o;
    });
    out.markers = (tl.markers || []).filter((m) => m.type === 'cue' || m.type === 'section')
      .map((m, i) => Object.assign({}, m, { id: String(m.id || `m${i + 1}`), at: r3(num(m.at, 0, 0, MAX_SECONDS)), name: String(m.name || '').slice(0, 80) }))
      .sort((a, b) => a.at - b.at);
    if (tl.choice && Array.isArray(tl.choice.answers) && tl.choice.answers.length >= 2 && depth < MAX_DEPTH) {
      out.choice = Object.assign({}, tl.choice, {
        question: String(tl.choice.question || '').slice(0, 140),
        at: r3(num(tl.choice.at, endOf(out), 0, MAX_SECONDS)),
        answers: tl.choice.answers.slice(0, 12).map((a) => Object.assign({}, a, { label: String(a.label || '').slice(0, 60), timeline: cleanTimeline(a.timeline || {}, depth + 1) })),
      });
    } else delete out.choice;
    return out;
  }
  function clean(flow) {
    if (!flow || flow.format !== 'troubadour-ballade' || flow.version !== VERSION) throw new Error('Not a version 2 Ballade');
    return Object.assign({}, flow, { chapters: (flow.chapters || []).map((c) => cleanTimeline(c)) });
  }

  /** Where a timeline ends: its last clip that ends on its own (held clips end at their cue). */
  function endOf(tl) {
    return (tl.clips || []).reduce((a, c) => Math.max(a, c.at + c.length), 0);
  }

  /* ---------- The chapter clock (4.1) ---------- */

  /**
   * new Clock(timeline, { now, start(clip, when, offset), hold(clip, when, fade), lookAhead, onState })
   *   now(): the audio clock, in seconds (AudioContext.currentTime). start(): plays `clip` at audio time `when`,
   *   `offset` seconds into it (a late start). hold(): a held clip ends, fading over `fade` seconds from `when`.
   * States: 'waiting' (before Begin), 'running', 'cue' (stopped at a cue), 'choice', 'ended'; paused on top.
   * tick() plans ahead; call it every 250 ms from a setInterval (it keeps running with the screen locked).
   */
  class Clock {
    constructor(tl, opt) {
      this.opt = Object.assign({ lookAhead: 2, start() {}, hold() {}, onState() {} }, opt);
      this.enter(tl, 'waiting');
    }
    enter(tl, state) {
      this.tl = tl;
      this.pos0 = 0;          // clock position (s) when the audio clock read t0
      this.t0 = null;
      this.done = new Set();  // clips already planned
      this.passed = new Set(); // cues already released
      this.paused = false;
      this.set(state);
    }
    set(state) { if (this.state !== state) { this.state = state; this.opt.onState(state, this); } }
    /** The clock's position now (s from the start of the timeline). */
    position() { return this.state === 'running' && !this.paused ? this.pos0 + (this.opt.now() - this.t0) : this.pos0; }
    /** The next place the clock stops: a cue not released yet, the choice, or the end. */
    stop() {
      const cue = this.tl.markers.find((m) => m.type === 'cue' && !this.passed.has(m.id) && m.at >= this.pos0 - 1e-9);
      if (cue) return { type: 'cue', at: cue.at, cue };
      if (this.tl.choice) return { type: 'choice', at: this.tl.choice.at };
      return { type: 'ended', at: endOf(this.tl) };
    }
    run() { this.t0 = this.opt.now(); this.set('running'); this.tick(); }
    begin() { if (this.state === 'waiting') this.run(); }
    tick() {
      if (this.state !== 'running' || this.paused) return;
      const p = this.position(), st = this.stop();
      const limit = Math.min(p + this.opt.lookAhead, st.at);
      for (const c of this.tl.clips) {
        if (this.done.has(c.id) || c.at >= limit - 1e-9 && !(c.at <= p)) continue;
        if (c.at >= st.at - 1e-9) continue; // comes after the stop: planned once the clock is released
        if (c.at + c.length <= p) { this.done.add(c.id); continue; } // over before we got here
        this.done.add(c.id);
        const when = this.t0 + (c.at - this.pos0);
        this.opt.start(c, Math.max(when, this.opt.now()), Math.max(0, p - c.at));
      }
      if (p >= st.at - 1e-9) { this.pos0 = st.at; this.set(st.type); }
    }
    /** The clips that hold across where the clock stands: they loop while it waits, and end at Go. */
    held() { return this.tl.clips.filter((c) => c.holdToCue && this.done.has(c.id) && c.at < this.pos0 + 1e-9 && c.at + c.length >= this.pos0 - 1e-3); }
    endHeld() { const t = this.opt.now(); this.held().forEach((c) => this.opt.hold(c, t, Math.max(c.fadeOut, HOLD_FADE))); }
    go() {
      if (this.state !== 'cue') return;
      const st = this.stop();
      this.endHeld();
      this.passed.add(st.cue.id);
      this.run();
    }
    choose(i) {
      if (this.state !== 'choice') return;
      const a = this.tl.choice.answers[i];
      if (!a) return;
      this.endHeld();
      this.enter(a.timeline, 'running');
      this.run();
    }
    pause() { if (this.state === 'running' && !this.paused) { this.pos0 = this.position(); this.paused = true; } }
    resume() { if (this.paused) { this.paused = false; this.t0 = this.opt.now(); this.tick(); } }
  }

  const api = { VERSION, fromV1, clean, endOf, Clock, HOLD_FADE };
  global.BalladeTimeline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
