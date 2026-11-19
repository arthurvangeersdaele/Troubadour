/* Troubadour Map: the sounds of the map on screen, heard from the party's point.
 *
 * Each card of the map has a voice. A voice behaves exactly as a card of the Troubadour player:
 *
 *   source → xf (one round of a blended loop) → vg (curve of the card's volume) → life (living ambiances)
 *          → env (play, pause and stop fades) → space (distance and walls, 1 for the whole map) → master
 *
 *   MapAudio.open(place, world, buffers)  starts the voices of a map (buffers: Map(file => AudioBuffer))
 *   MapAudio.sync()                       after an edit: voices for new cards, none for removed ones
 *   MapAudio.hear(point)                  moves the listener, every gain glides to its new value
 *   MapAudio.voice(card)                  { state: 'idle' | 'playing' | 'paused' | 'ending', waiting, held, heard, … }
 *   MapAudio.toggle(card), stop(card), progress(card), setVolume(card, v), stepVolume(card, dir), shownVolume(card),
 *   living(card), pauseAll(), stopAll(), resumePending(), close(), fadeAll()
 *   MapAudio.onChange = fn                called when a voice starts or stops
 */
(function (global) {
  'use strict';

  const { audio, settings } = global.MapUI;
  const E = global.BalladeEngine; // the shared sound engine: trimmed ends, loop seams, loudness (261114_map_plan.md, M1)
  const M = global.TroubadourMap;

  let place = null, world = null, buffers = new Map(), point = [0, 0];
  const voices = new Map(); // card => voice
  const api = { onChange: null, onPlace: null };
  // The master pause, as in Troubadour: the voices it paused, and the random events it held between two plays.
  let pausedByAll = [], heldRandom = [];

  const changed = () => { if (api.onChange) api.onChange(); };
  const now = () => audio().ctx.currentTime;

  /* ---------- Troubadour's rules ---------- */
  /** Volumes are heard on a curve (a slider at 50 % is a quarter of the power). */
  const curve = (v) => v * v;
  /** The master play, pause and stop buttons fade over 3 s. */
  const MASTER_FADE = 3000;
  const RANDOM_TOP = 30;
  const randomMax = () => Math.min(RANDOM_TOP, Math.max(1, Math.round(+settings.randomMax || 17)));
  /** A card's own longest pause (1 to 30 s), else the one of the settings. */
  const ownPause = (card) => { const n = Number(card && card.randomMax); return n >= 1 && n <= RANDOM_TOP ? n : null; };
  /** A random event plays again after 0.5 s to its longest pause. */
  const randomPause = (v) => 500 + Math.floor(Math.random() * Math.max(1, (ownPause(v.card) || randomMax()) * 1000 - 500));
  /** Fade-in of a sound started with Play, in seconds (Off: a click-free 30 ms). */
  const startFade = () => Math.max(0.03, (+settings.fadeIn || 0) / 1000);
  const lifeEvery = () => Math.min(30, Math.max(2, Math.round(+settings.lifeEvery || 13)));

  function ramp(param, target, secs) {
    const t = now();
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
    param.linearRampToValueAtTime(target, t + Math.max(secs, 0.012));
  }

  function makeVoice(card, el) {
    const { ctx, master } = audio();
    const vg = ctx.createGain(); vg.gain.value = curve(card.volume);
    const life = ctx.createGain(); life.gain.value = 1;
    const env = ctx.createGain(); env.gain.value = 0;
    const space = ctx.createGain(); space.gain.value = el ? 0 : 1;
    const nm = ctx.createGain(); nm.gain.value = 1; // evens out the loudness of the sound, by kind
    vg.connect(nm).connect(life).connect(env).connect(space).connect(master);
    return {
      card, el, vg, nm, life, env, space, src: null, xf: null, twin: null,
      state: 'idle', heard: el ? 0 : 1, offset: 0, startedAt: 0, timer: 0, token: 0, plays: 0,
      rnd: false, next: 0, rndAt: 0, fadingOut: null, volMs: 0, volFrom: card.volume, volAt: 0,
      get active() { return this.state === 'playing' || this.state === 'ending'; },
      get waiting() { return this.rnd && this.next > 0; },
      get held() { return heldRandom.includes(this); },
    };
  }

  /** The cards of the map: those of the whole map, then those of every element. Musics belong to the world
   *  (its Music button), not to a map: a music laid on a map only tells which one starts when the party arrives. */
  const isMusic = (c) => c.zone === 'music';
  function cardsOf(p) {
    const out = p.general.filter((c) => !isMusic(c)).map((c) => ({ card: c, el: null }));
    p.elements.forEach((e) => e.cards.forEach((c) => { if (!isMusic(c)) out.push({ card: c, el: e }); }));
    return out;
  }
  /** The music of the map: the first music laid on it (the whole map first), or null. */
  function themeOf(p) {
    return p.general.find(isMusic) || p.elements.reduce((f, e) => f || e.cards.find(isMusic), null) || null;
  }

  /* ---------- The world's musics: one voice each, heard everywhere, kept from one map to the next ---------- */
  let jukebox = [];
  let queue = []; // the musics to play next, in order
  function setMusic(cards) {
    jukebox = (cards || []).slice();
    const live = new Set(jukebox);
    jukebox.forEach((c) => {
      let v = voices.get(c);
      if (!v) { v = makeVoice(c, null); v.world = true; voices.set(c, v); }
      if (!v.volMs) v.vg.gain.setTargetAtTime(curve(c.volume), now(), 0.03);
      if (v.src) v.src.loop = c.play === 'loop' && !queue.length && !blendOf(v);
    });
    voices.forEach((v, c) => { if (v.world && !live.has(c)) { drop(v); voices.delete(c); } });
    queue = queue.filter((c) => live.has(c));
    changed();
  }
  /** The music heard now: the one playing, else the one paused, else the one fading out (null: none). */
  function currentMusic() {
    const ws = jukebox.map((c) => voices.get(c)).filter(Boolean);
    const v = ws.find((o) => o.state === 'playing') || ws.find((o) => o.state === 'paused') || ws.find((o) => o.state === 'ending');
    return v ? v.card : null;
  }

  /* ---------- Where a sound really is: its ends without the encoder's silence, its loop points, its loudness ----------
   * Decoded sounds are measured by the engine; streamed ones carry the same numbers, measured once by the app. */
  const FULL = { a: 0, b: 0, la: 0, lb: 0, lufs: null };
  function infoOf(file) {
    const s = buffers.get(file);
    if (!s) return FULL;
    if (s.stream) return s.b > 0 ? s : { a: 0, b: s.duration || 0, la: 0, lb: s.duration || 0, lufs: null };
    return E.analyse(s);
  }
  const isStream = (v) => { const s = buffers.get(v.card.file); return !!(s && s.stream); };
  /** The length of the sound, ends trimmed. */
  const duration = (v) => { const i = infoOf(v.card.file); return Math.max(0, i.b - i.a); };
  /** Where a new round of a loop starts and where it turns, in seconds from the trimmed start. */
  const headOf = (v) => { const i = infoOf(v.card.file); return Math.max(0, i.la - i.a); };
  const turnOf = (v) => { const i = infoOf(v.card.file); return Math.max(0, i.lb - i.a); };
  /** The gain that brings the sound to the loudness of its kind (music -18, ambiance -22, events -16 LUFS). */
  function normOf(v) {
    if (settings.even === false) return 1;
    const L = infoOf(v.card.file).lufs;
    if (!(L > -60)) return 1;
    const zone = v.card.zone === 'soundbox' ? 'events' : v.card.zone;
    const target = E.TARGET[zone] != null ? E.TARGET[zone] : -18;
    return Math.min(Math.pow(10, 6 / 20), Math.max(Math.pow(10, -9 / 20), Math.pow(10, (target - L) / 20)));
  }
  function evenOut() { voices.forEach((v) => v.nm.gain.setTargetAtTime(normOf(v), now(), 0.3)); }

  /** A loop crosses its two rounds over: a decoded one only when the card asks for a blend (its seam is exact
   *  otherwise, written by the engine); a streamed one always, over a third of a second at least, since a media
   *  element cannot turn on a sample. In seconds, at most a third of the sound. */
  const STREAM_SEAM = 0.35;
  function blendOf(v) {
    const b = Number(v.card.blend || 0) || (isStream(v) ? STREAM_SEAM : 0), d = turnOf(v) - headOf(v);
    return v.card.play === 'loop' && !(v.world && queue.length) && b > 0 && d > 1.5 ? Math.min(b, d / 3) : 0;
  }
  /** Where the round heard now is, in seconds from the trimmed start of the sound. */
  function position(v) {
    if (!v.src) return v.offset;
    if (v.src.media) return Math.max(0, (v.src.media.currentTime || 0) - v.src.info.a);
    const e = now() - v.startedAt;
    const L = v.src.L;
    if (!L) return Math.min(duration(v), e);
    const first = L.loopEnd - L.a, per = Math.max(0.01, L.loopEnd - L.loopStart);
    return e < first ? e : first + ((e - first) % per);
  }

  /** A new round of the sound, from `from` seconds, into the voice's chain. */
  function startSource(v, from = 0) {
    const buf = buffers.get(v.card.file);
    if (!buf) return false;
    v.nm.gain.setTargetAtTime(normOf(v), now(), 0.05);
    if (buf.stream) return startStream(v, buf, from);
    const { ctx } = audio();
    const info = E.analyse(buf);
    const src = ctx.createBufferSource();
    const xf = ctx.createGain(); xf.gain.value = 1;
    src.connect(xf).connect(v.vg);
    const t = now();
    if (v.card.play === 'loop' && !(v.world && queue.length) && !blendOf(v)) {
      // The engine's gapless loop: ends trimmed, the seam crossfaded inside the buffer, the turn on a sample.
      const L = E.loopOf(buf, 0, true);
      src.buffer = L.buf; src.loop = true; src.loopStart = L.loopStart; src.loopEnd = L.loopEnd;
      src.L = L;
      src.start(t, E.loopPos(L, Math.max(0, from)));
    } else {
      const d = Math.max(0.02, info.b - info.a);
      const offset = Math.max(0, Math.min(d - 0.01, from));
      src.buffer = buf; src.loopStart = info.la; src.loopEnd = info.lb;
      src.start(t, info.a + offset, d - offset);
    }
    v.src = src; v.xf = xf; v.startedAt = t - Math.max(0, from);
    const token = ++v.token;
    src.onended = () => { if (token === v.token) ended(v); };
    return true;
  }
  /* Long sounds (the musics, the long ambiances) are streamed: a media element into the same chain, so they start
   * at once and take no memory, whatever their length. The app hands { stream: true, url, duration } for them. */
  const waitingTouch = new Set(); // elements the browser refused to start without a touch
  function tryPlay(m) {
    const p = m.play();
    if (p && p.catch) p.then(() => waitingTouch.delete(m)).catch((e) => { if (e && e.name === 'NotAllowedError') waitingTouch.add(m); });
  }
  ['pointerdown', 'touchend', 'keydown'].forEach((k) => document.addEventListener(k, () => {
    if (!waitingTouch.size) return;
    [...waitingTouch].forEach((m) => { waitingTouch.delete(m); if (m.dataset.live) tryPlay(m); });
  }, { capture: true, passive: true }));
  /** A media element on the sound, ready at `at` seconds into the file. */
  function deck(s, at, rest) {
    const m = new Audio();
    m.preload = rest ? 'none' : 'auto';
    m.dataset.live = '1';
    m.src = s.url;
    if (at > 0.02) { try { m.currentTime = at; } catch (e) { /* set once it is known */ } }
    m.addEventListener('loadedmetadata', () => {
      if (!(s.b > 0) && Number.isFinite(m.duration) && m.duration > 0) s.duration = m.duration;
      if (at > 0.02 && Math.abs(m.currentTime - at) > 0.3) { try { m.currentTime = at; } catch (e) { /* stays */ } }
    });
    return m;
  }
  function undeck(m) {
    delete m.dataset.live; waitingTouch.delete(m);
    try { m.pause(); } catch (e) { /* gone */ }
    m.removeAttribute('src'); try { m.load(); } catch (e) { /* gone */ }
  }
  function startStream(v, s, from) {
    const { ctx } = audio();
    const info = infoOf(v.card.file);
    const d = Math.max(0, info.b - info.a);
    const offset = d ? Math.max(0, Math.min(d - 0.05, from)) : Math.max(0, from);
    // A loop out of reach waits, unread, until the party comes near (restTick).
    const rest = !v.world && v.el && !v.near && v.card.play === 'loop';
    // The next round of a loop was made ready a moment before its turn (blendTick).
    let m = null;
    if (v.primed && Math.abs(v.primed.at - (info.a + offset)) < 0.02) m = v.primed.m; else if (v.primed) undeck(v.primed.m);
    v.primed = null;
    if (!m) m = deck(s, info.a + offset, rest);
    m.loop = false;
    let node = null;
    const xf = ctx.createGain(); xf.gain.value = 1;
    try { node = ctx.createMediaElementSource(m); node.connect(xf); } catch (e) { node = null; m.volume = curve(v.card.volume); }
    xf.connect(v.vg);
    const src = {
      media: m, info, buffer: s,
      get loop() { return m.loop; }, set loop(x) { /* a streamed loop turns by crossing two rounds (blendTick) */ },
      stop() { undeck(m); if (node) { try { node.disconnect(); } catch (e) { /* gone */ } } },
    };
    v.src = src; v.xf = xf; v.startedAt = now() - offset; v.quiet = 0;
    const token = ++v.token;
    m.addEventListener('ended', () => { if (token === v.token) ended(v); });
    m.addEventListener('error', () => { if (token === v.token && m.dataset.live) reset(v); });
    if (!rest) tryPlay(m);
    return true;
  }
  /** A streamed sound ends where its sound ends, not where its file does (the encoder's silence is left out). */
  function endTick(v) {
    const m = v.src && v.src.media;
    if (!m || v.twin || !v.active) return;
    const b = v.src.info.b;
    if (b > 0 && m.currentTime >= b - 0.012 && !blendOf(v)) ended(v);
  }
  /** A streamed loop nobody hears (its place is out of reach) rests: nothing is read from the device for it. */
  function restTick(v, t) {
    const m = v.src && v.src.media;
    if (!m || !m.dataset.live || v.state !== 'playing' || v.twin || v.world || v.card.play !== 'loop') return;
    if (v.el && !v.near) {
      if (!v.quiet) v.quiet = t;
      else if (t - v.quiet > 2500 && !m.paused) m.pause();
    } else {
      v.quiet = 0;
      if (m.paused && !waitingTouch.has(m)) tryPlay(m);
    }
  }
  function stopSource(v) {
    v.token += 1;
    if (v.primed) { undeck(v.primed.m); v.primed = null; }
    if (v.src) { try { v.src.stop(); } catch (e) { /* already */ } try { v.xf.disconnect(); } catch (e) { /* gone */ } }
    v.src = null; v.xf = null;
  }
  /** A blended loop: near the end of a round, the next one starts and the two cross over. */
  const CURVE = 32;
  const UP = Float32Array.from({ length: CURVE }, (_, k) => Math.sin((k / (CURVE - 1)) * Math.PI / 2));
  const DOWN = Float32Array.from({ length: CURVE }, (_, k) => Math.cos((k / (CURVE - 1)) * Math.PI / 2));
  /** Two rounds cross over at equal power: the level stays even through the turn. */
  function cross(up, down, t, span) {
    try {
      up.cancelScheduledValues(t); up.setValueCurveAtTime(UP, t, span);
      down.cancelScheduledValues(t); down.setValueCurveAtTime(DOWN, t, span);
    } catch (e) {
      up.cancelScheduledValues(t); up.setValueAtTime(0, t); up.linearRampToValueAtTime(1, t + span);
      down.cancelScheduledValues(t); down.setValueAtTime(1, t); down.linearRampToValueAtTime(0, t + span);
    }
  }
  function blendTick(v) {
    if (!v.src || v.twin || v.state !== 'playing') return;
    const b = blendOf(v);
    if (!b) return;
    const left = turnOf(v) - position(v);
    const s = buffers.get(v.card.file);
    // A streamed loop gets its next round ready (loaded, at its place) a few seconds before the turn.
    if (s && s.stream && !v.primed && left <= b + 3 && left > b && !(v.src.media && v.src.media.paused)) {
      const at = infoOf(v.card.file).a + headOf(v);
      v.primed = { m: deck(s, at, false), at };
    }
    if (!(left <= b)) return;
    const old = { src: v.src, xf: v.xf };
    v.token += 1; // the old round's end is no longer this voice's end
    const span = Math.max(0.05, left);
    const primed = v.primed; v.primed = null;
    v.src = null; // the old round lives on as the twin
    v.primed = primed;
    startSource(v, headOf(v));
    cross(v.xf.gain, old.xf.gain, now(), span);
    v.twin = old;
    v.twinTimer = setTimeout(() => dropTwin(v), span * 1000 + 150);
  }
  function dropTwin(v, full) {
    clearTimeout(v.twinTimer);
    const tw = v.twin;
    v.twin = null;
    if (tw) { try { tw.src.stop(); } catch (e) { /* gone */ } try { tw.xf.disconnect(); } catch (e) { /* gone */ } }
    if (full && v.xf) { const g = v.xf.gain; try { g.cancelScheduledValues(now()); g.setValueAtTime(1, now()); } catch (e) { /* a curve still runs: it ends at 1 */ } }
  }

  /* ---------- A voice, as Troubadour's Voice ---------- */
  function play(v, fadeIn = 0.03) {
    if (!buffers.get(v.card.file)) return;
    clearTimeout(v.timer);
    if (v.card.play === 'random') { v.rnd = true; v.next = 0; v.rndAt = Date.now(); }
    const g = v.env.gain;
    if (v.state === 'ending') { ramp(g, 1, 0.15); v.state = 'playing'; changed(); return; }
    if (v.state === 'paused' && v.fadingOut) {
      // Resumed while its pause still fades out: rise back from the level heard now, no jump.
      const t = now(), from = pauseLeft(v);
      v.fadingOut = null;
      g.cancelScheduledValues(t); g.setValueAtTime(from, t);
      g.linearRampToValueAtTime(1, t + Math.max(fadeIn * (1 - from), 0.012));
      v.state = 'playing'; changed();
      return;
    }
    if (v.state === 'idle') { v.offset = 0; v.plays = 0; }
    const t = now();
    g.cancelScheduledValues(t); g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(1, t + Math.max(fadeIn, 0.012));
    stopSource(v);
    if (!startSource(v, v.offset)) return;
    v.state = 'playing';
    changed();
  }
  /** Pause with a fade out of ms: the card shows paused at once, the sound stops once the fade is over. */
  function pause(v, ms = 40) {
    if (!v.active) return;
    clearTimeout(v.timer);
    dropTwin(v, true);
    ms = Math.max(40, ms);
    ramp(v.env.gain, 0, ms / 1000);
    v.fadingOut = { at: Date.now(), ms };
    v.timer = setTimeout(() => { v.fadingOut = null; v.offset = position(v); stopSource(v); }, ms + 10);
    v.state = 'paused';
    changed();
  }
  /** Level still heard while a pause fades out (0 once it is over). */
  function pauseLeft(v) {
    const f = v.fadingOut;
    return f ? Math.max(0, 1 - (Date.now() - f.at) / f.ms) : 0;
  }
  /** Fade out over ms, then back to the start. */
  function end(v, ms) {
    v.rnd = false; v.next = 0;
    if (v.state === 'paused' && v.fadingOut) {
      // Stopped while its pause fades out: let that fade finish, then let go.
      const left = Math.min(ms, Math.max(40, Math.round(v.fadingOut.ms * pauseLeft(v))));
      clearTimeout(v.timer);
      ramp(v.env.gain, 0, left / 1000);
      v.fadingOut = null;
      v.state = 'ending';
      v.timer = setTimeout(() => reset(v), left + 40);
      changed();
      return;
    }
    if (v.state === 'paused') { reset(v); return; }
    if (!v.active) { changed(); return; }
    clearTimeout(v.timer);
    ramp(v.env.gain, 0, ms / 1000);
    v.state = 'ending';
    v.timer = setTimeout(() => reset(v), ms + 40);
    changed();
  }
  function reset(v) {
    clearTimeout(v.timer);
    v.fadingOut = null;
    dropTwin(v, true);
    stopSource(v);
    v.offset = 0; v.plays = 0;
    v.state = 'idle';
    changed();
  }
  /** The sound came to its end on its own. */
  function ended(v) {
    // A loop that came to its end without a seam (too short to cross, or its length unknown): round again.
    if (v.card.play === 'loop' && v.state === 'playing' && !(v.world && queue.length)) { stopSource(v); startSource(v, headOf(v)); return; }
    v.plays += 1;
    if (v.card.play === 'twice' && v.plays < 2 && v.active) { stopSource(v); startSource(v, 0); return; }
    const natural = v.state === 'playing';
    reset(v);
    // The world's music, at its end (1× or 2× played through, or the round of a loop when musics wait): the next one
    // of the queue; with nothing queued, a loop plays on and the others stop there.
    if (natural && v.world) {
      const next = queue.length ? voices.get(queue.shift()) : null;
      if (next && next !== v) toggleVoice(next);
      else if (next === v || v.card.play === 'loop') play(v, 0.03);
      changed();
      return;
    }
    // A music that played through on its own hands over to the next one set to play after it.
    if (natural && v.card.zone === 'music') nextMusic(v);
  }

  /** The musics of a group (the whole map, or one element), in their order. */
  const musicsOf = (v) => (v.world ? jukebox.map((c) => voices.get(c)).filter(Boolean) : [...voices.values()].filter((o) => !o.world && o.el === v.el && o.card.zone === 'music'));
  /** "Play after", as in Troubadour: musics set to it make a playlist of their group. When a music ends on its
   *  own (its 1× or 2× played through, not stopped, paused or faded out), the next one set to play after starts:
   *  after a track of the playlist, the next one of the playlist in order (the last one ends it); after any other
   *  music, the first one of the playlist that follows it (from the start again). */
  function nextMusic(v) {
    const row = musicsOf(v);
    if (row.some((o) => o !== v && o.active)) return; // another music already took over
    const at = row.indexOf(v);
    const order = v.card.play === 'after' ? row.slice(at + 1) : [...row.slice(at + 1), ...row.slice(0, at)];
    const n = order.find((o) => o.card.play === 'after' && buffers.get(o.card.file));
    if (n && n.state !== 'playing') toggleVoice(n);
  }

  /** The card's play button, as Troubadour's toggleVoice. */
  function toggleVoice(v) {
    audio(true);
    // Between two plays, a tap stops the random event.
    if (v.waiting) { v.rnd = false; v.next = 0; changed(); return; }
    if (v.state === 'playing') { pause(v, settings.fade); return; }
    // One music at a time, also when the one asked for was still fading out (two quick changes of map).
    if (v.card.zone === 'music') {
      const others = musicsOf(v).filter((o) => o !== v && (o.active || o.state === 'paused'));
      const crossing = others.some((o) => o.active);
      others.forEach((o) => end(o, settings.crossfade ? settings.fade : 150));
      play(v, crossing && settings.crossfade && v.state !== 'paused' ? settings.fade / 1000 : startFade());
    } else {
      // A tap on Play rises over the fade-in (music, ambiances); events strike at once. Replays never come here.
      play(v, v.card.zone === 'ambience' ? startFade() : 0.03);
    }
    pausedByAll = pausedByAll.filter((o) => o !== v);
    heldRandom = heldRandom.filter((o) => o !== v);
  }

  /* ---------- Volume ---------- */
  function setVol(v, vol) {
    v.card.volume = vol;
    v.volMs = 0;
    const g = v.vg.gain;
    g.cancelScheduledValues(now()); g.setTargetAtTime(curve(vol), now(), 0.03);
  }
  /** The simple volume buttons: one step is 25 %, reached smoothly over 2 s. */
  function stepVol(v, dir) {
    const vol = v.card.volume, q = vol * 4;
    const t = dir > 0 ? Math.min(1, (Math.floor(q + 1e-6) + 1) / 4) : Math.max(0, (Math.ceil(q - 1e-6) - 1) / 4);
    if (t === vol) return false;
    const shown = shownVol(v);
    const secs = Math.max(0.3, Math.abs(t - shown) / 0.25 * 2);
    v.volFrom = shown; v.volAt = performance.now(); v.volMs = secs * 1000;
    v.card.volume = t;
    const g = v.vg.gain, at = now();
    g.cancelScheduledValues(at); g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(curve(t), at + secs);
    return true;
  }
  /** The volume heard right now (follows a glide in progress). */
  function shownVol(v) {
    if (!v.volMs) return v.card.volume;
    const f = Math.min(1, (performance.now() - v.volAt) / v.volMs);
    if (f >= 1) { v.volMs = 0; return v.card.volume; }
    return v.volFrom + (v.card.volume - v.volFrom) * f;
  }

  /* ---------- Living ambiances ----------
   * While it plays, an ambiance drifts up to 10 points above or below its volume, a new drift about every
   * settings.lifeEvery seconds (a little sooner or later each time), glided so it never jumps. Off: back to its volume. */
  function lifeHeard(v) {
    if (v.lifeT0 == null) return v.card.volume;
    const k = Math.min(1, Math.max(0, (performance.now() - v.lifeT0) / Math.max(1, v.lifeMs)));
    return v.lifeFromV + (v.lifeToV - v.lifeFromV) * k;
  }
  setInterval(() => {
    if (!place) return;
    const nowMs = performance.now();
    voices.forEach((v) => {
      if (v.card.zone !== 'ambience') return;
      const g = v.life.gain, t = now();
      if (!settings.life || !v.active) {
        if (v.lifeOn) { v.lifeOn = false; v.lifeT0 = null; g.cancelScheduledValues(t); g.setTargetAtTime(1, t, 0.4); }
        return;
      }
      if (v.lifeOn && nowMs < v.lifeAt) return;
      const base = Math.max(0.001, v.card.volume);
      const off = (Math.random() * 2 - 1) * 0.1;
      const f = Math.min(4, curve(Math.min(1, Math.max(0, base + off))) / curve(base));
      const secs = lifeEvery() * 0.9;
      // Its own record of the glide, for the mark on the card.
      const from = v.lifeOn && v.lifeT0 != null ? lifeHeard(v) / base : 1;
      v.lifeOn = true;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(f, t + secs);
      Object.assign(v, { lifeFromV: from * base, lifeToV: Math.sqrt(f * curve(base)), lifeT0: nowMs, lifeMs: secs * 1000 });
      v.lifeAt = nowMs + lifeEvery() * 1000 * (0.75 + Math.random() * 0.5);
    });
  }, 250);

  // Random events (as Troubadour): once a random event has stopped sounding, it gets a next play time 0.5 s
  // to its longest pause later, and plays again when that time comes. Blended loops cross over here too.
  setInterval(() => {
    if (!place) return;
    const t = Date.now();
    let moved = false;
    voices.forEach((v) => {
      blendTick(v);
      endTick(v);
      restTick(v, t);
      if (!v.rnd) return;
      const sounding = v.state === 'playing' || v.state === 'paused' || v.state === 'ending';
      if (sounding) { if (v.next) v.next = 0; return; }
      if (t - v.rndAt <= 400) return;
      if (!v.next) { v.next = t + randomPause(v); moved = true; }
      else if (t >= v.next) { v.next = 0; play(v); }
    });
    // Someone resumed by hand everything the master pause had paused: the master button is a pause again.
    if (pausedByAll.length && !pausedByAll.some((v) => v.state === 'paused')) { pausedByAll = []; moved = true; }
    if (moved) changed();
  }, 50);

  /* ---------- Space ---------- */
  /** The gain of the space for every voice of an element, from where the player point stands. */
  /** p: where the party is; still: false while it walks or is dragged, true once it stops there. */
  function hear(p, still) {
    if (p) point = p;
    if (still === false) moving = true;
    else if (still === true) moving = false;
    if (!place) return;
    followZone();
    const t = now();
    const memo = new Map();
    voices.forEach((v) => {
      let g = 1, near = true;
      if (v.el) {
        if (!memo.has(v.el)) {
          // Heard, pre-roll (a resting loop already runs, silent) or asleep: map-format.js, placeState.
          const st = M.placeState(point, v.el, place.walls, world.wallLoss);
          memo.set(v.el, [st.gain, st.state !== 'asleep']);
        }
        [g, near] = memo.get(v.el);
      }
      v.heard = g; v.near = near;
      v.space.gain.cancelScheduledValues(t);
      v.space.gain.setTargetAtTime(g, t, 0.15);
    });
  }

  function drop(v, ms = 300) {
    end(v, ms);
    v.rnd = false;
    const space = v.space;
    setTimeout(() => { reset(v); try { space.disconnect(); } catch (e) { /* gone */ } }, ms + 400);
  }

  function sync() {
    if (!place) return;
    const live = new Set();
    cardsOf(place).forEach(({ card, el }) => {
      live.add(card);
      let v = voices.get(card);
      if (!v) { v = makeVoice(card, el); voices.set(card, v); }
      v.el = el;
      if (!v.volMs) v.vg.gain.setTargetAtTime(curve(card.volume), now(), 0.03);
      if (v.src) v.src.loop = card.play === 'loop' && !blendOf(v);
      if (card.play !== 'random' && v.rnd) { v.rnd = false; v.next = 0; }
      if (card.play === 'random' && v.active) v.rnd = true;
    });
    voices.forEach((v, card) => { if (!v.world && !live.has(card)) { drop(v); voices.delete(card); } });
    pausedByAll = pausedByAll.filter((v) => v.world || live.has(v.card));
    heldRandom = heldRandom.filter((v) => v.world || live.has(v.card));
    hear();
    changed();
  }

  function open(p, w, bufs) {
    // The sounds of the map left fade out; the world's music plays on.
    voices.forEach((v, c) => { if (!v.world) { drop(v, settings.fade); voices.delete(c); } });
    pausedByAll = pausedByAll.filter((v) => v.world); heldRandom = heldRandom.filter((v) => v.world);
    place = p; world = w; buffers = bufs; point = p.player.slice();
    sync();
    audio(true);
    // Every card starts with its map (with the fade-in of Play; events strike at once): the map decides how much of
    // an element is heard.
    voices.forEach((v) => { if (!v.world) play(v, v.card.zone === 'ambience' ? startFade() : 0.03); });
    // A music laid on the map starts as the party arrives (crossfading the one playing), unless it already plays:
    // the one of the place the party stands in, else the one of the whole map.
    zoneKey = undefined;
    const theme = zoneMusic() || p.general.find(isMusic) || null;
    zoneKey = theme ? theme.file : 'map'; moving = false;
    const tv = theme && [...voices.values()].find((o) => o.world && o.card.file === theme.file);
    if (tv && tv.state !== 'playing' && !(musicLocked && currentMusic())) toggleVoice(tv);
    changed();
  }

  /* ---------- Music zones: a music laid on a place starts when the party walks into it ---------- */
  let zoneKey, moving = false;
  function zoneMusic() {
    for (let i = place.elements.length - 1; i >= 0; i--) {
      const e = place.elements[i];
      const m = e.cards.find(isMusic);
      if (m && M.hearing(point, e, place.walls, world.wallLoss).d === 0) { zoneEl = e; return m; }
    }
    zoneEl = null;
    return null;
  }
  let zoneEl = null;
  /** The music of the world with this file, started (the place's own card, or the whole map's, reached by its file). */
  function startZone(file) {
    const tv = [...voices.values()].find((o) => o.world && o.card.file === file);
    if (tv && tv.state !== 'playing') toggleVoice(tv);
  }
  /** Called as the party moves: stopping in a place with a music crossfades to it; stopping out of it brings back the
   *  music of the whole map. Only where the party stops counts: a place it only walks through leaves the music as it
   *  is. Only a change of zone switches the music, so a music chosen by hand plays on. */
  // The music lock (261114_map_plan.md, M6): the music heard stays, whatever place the party reaches.
  let musicLocked = false;
  function followZone() {
    if (!place || zoneKey === undefined || moving) return;
    const z = zoneMusic();
    const key = z ? z.file : 'map';
    if (key === zoneKey) return;
    zoneKey = key;
    if (musicLocked) return;
    // Arriving on a place with music: the app may show its musics first (setting Ask before a place's music); it
    // starts one itself, or calls back the fallback when nothing was touched.
    if (z && api.onPlace) {
      const el = zoneEl, cards = el.cards.filter(isMusic);
      if (api.onPlace({ el, cards, start: () => { if (zoneKey === key && settings.musicAuto !== false) startZone(z.file); } })) return;
    }
    if (!z && api.onPlace) api.onPlace(null);
    // Music starts by itself on arrival (setting, on by default); off, the music heard plays on.
    if (settings.musicAuto === false) return;
    const target = z || place.general.find(isMusic);
    if (!target) return;
    startZone(target.file);
  }

  /** Everything stops: the world is left, or drawn. */
  function close(ms = settings.fade) {
    musicLocked = false;
    voices.forEach((v) => drop(v, ms));
    voices.clear();
    pausedByAll = []; heldRandom = []; queue = [];
    place = null;
    changed();
  }

  /* ---------- The master buttons (3 s fades) ---------- */
  /** Pause everything, or resume what the master pause paused. */
  function pauseAll() {
    audio(true);
    if (pausedByAll.length || heldRandom.length) {
      pausedByAll.forEach((v) => v.state === 'paused' && play(v, MASTER_FADE / 1000));
      pausedByAll = [];
      const t = Date.now();
      heldRandom.forEach((v) => { v.rnd = true; v.next = t + randomPause(v); });
      heldRandom = [];
    } else {
      pausedByAll = [...voices.values()].filter((v) => v.state === 'playing');
      pausedByAll.forEach((v) => pause(v, MASTER_FADE));
      // Random events waiting for their next play hold still too.
      heldRandom = [...voices.values()].filter((v) => v.waiting);
      heldRandom.forEach((v) => { v.rnd = false; v.next = 0; });
    }
    changed();
  }
  function stopAll() {
    voices.forEach((v) => end(v, MASTER_FADE));
    pausedByAll = []; heldRandom = [];
    changed();
  }
  /* The queue of the world's music. */
  /** A loop playing ends its round when a music waits in the queue, and loops again when the queue empties. */
  function loopsNow() { voices.forEach((v) => { if (v.world && v.src) v.src.loop = v.card.play === 'loop' && !queue.length && !blendOf(v); }); }
  function queueAdd(card) { queue.push(card); loopsNow(); changed(); }
  function queueRemove(i) { queue.splice(i, 1); loopsNow(); changed(); }
  function queueMove(i, d) { const j = i + d; if (j < 0 || j >= queue.length) return; [queue[i], queue[j]] = [queue[j], queue[i]]; changed(); }
  /** Plays a music now (crossfading the one playing), taking it out of the queue. */
  function playMusic(card, i) { if (i != null) queue.splice(i, 1); const v = voices.get(card); if (v && v.state !== 'playing') toggleVoice(v); changed(); }

  /** The master stop: the world's music fades out over 3 s (the sounds of the map play on). */
  function stopMusic() {
    voices.forEach((v) => { if (v.world) end(v, MASTER_FADE); });
    pausedByAll = pausedByAll.filter((v) => !v.world);
    changed();
  }
  const resumePending = () => pausedByAll.length > 0 || heldRandom.length > 0;

  /* ---------- Cards ---------- */
  const voiceOf = (card) => voices.get(card) || null;
  function toggle(card) { const v = voices.get(card); if (v) toggleVoice(v); }
  function stop(card) { const v = voices.get(card); if (v) end(v, settings.fade); }
  /** How far a card is, as Troubadour shows it: { p } from 0 to 1 (-1 for an endless loop), { left } in seconds
   *  (null for an endless loop; a 2× counts both plays), and { next } in seconds while a random card waits. */
  function progress(card) {
    const v = voices.get(card);
    const d = v ? duration(v) : 0;
    if (!v || !d) return { p: 0, left: null, next: null };
    if (v.waiting) return { p: 0, left: null, next: Math.max(0, (v.next - Date.now()) / 1000) };
    if (v.state === 'idle') return { p: 0, left: null, next: null };
    if (card.play === 'loop') return { p: -1, left: null, next: null };
    const total = card.play === 'twice' ? 2 * d : d;
    const done = v.plays * d + position(v);
    return { p: Math.min(1, done / total), left: Math.max(0, total - done), next: null };
  }
  /** A card's own volume (the slider): at once, with a click-free glide. */
  function setVolume(card, vol) {
    const v = voices.get(card);
    if (v) setVol(v, vol); else card.volume = vol;
  }
  /** The simple buttons: a 25 % step, glided over 2 s. */
  function stepVolume(card, dir) {
    const v = voices.get(card);
    if (v) return stepVol(v, dir);
    const q = card.volume * 4;
    const t = dir > 0 ? Math.min(1, (Math.floor(q + 1e-6) + 1) / 4) : Math.max(0, (Math.ceil(q - 1e-6) - 1) / 4);
    if (t === card.volume) return false;
    card.volume = t;
    return true;
  }
  function shownVolume(card) { const v = voices.get(card); return v ? shownVol(v) : card.volume; }
  /** Living ambiances: the volume heard now, or null when the card is not living. */
  function living(card) {
    const v = voices.get(card);
    return v && settings.life && v.lifeOn && v.active && card.zone === 'ambience' ? lifeHeard(v) : null;
  }

  /* ---------- Heard now (the editor only: nothing here runs at the table) ---------- */
  /** The cards of the map sounding now, the loudest first: how much the point hears of each, and its own level. */
  function heardNow() {
    return [...voices.values()].filter((v) => !v.world && (v.state === 'playing' || v.waiting))
      .map((v) => ({ card: v.card, heard: v.heard, level: v.heard * curve(v.card.volume), waiting: !!v.waiting }))
      .sort((a, b) => (a.waiting - b.waiting) || b.level - a.level || a.card.name.localeCompare(b.card.name));
  }
  let analyser = null, meterBuf = null, peakHold = 0, peakAt = 0;
  /** The level of the whole mix after the master, 0 to 1 (1 is full scale), with its peak held for 1 s. */
  function meter() {
    const { ctx, master } = audio();
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; master.connect(analyser); meterBuf = new Float32Array(analyser.fftSize); }
    analyser.getFloatTimeDomainData(meterBuf);
    let pk = 0;
    for (let i = 0; i < meterBuf.length; i++) { const a = Math.abs(meterBuf[i]); if (a > pk) pk = a; }
    const t = Date.now();
    if (pk >= peakHold || t - peakAt > 1000) { peakHold = pk; peakAt = t; }
    return { level: pk, peak: peakHold };
  }
  function meterOff() {
    if (!analyser) return;
    try { audio().master.disconnect(analyser); } catch (e) { /* already apart */ }
    analyser = null; peakHold = 0;
  }

  function fadeAll() { stopAll(); }

  const list = () => [...voices.values()].map((v) => ({ name: v.card.name, state: v.state, waiting: v.waiting, heard: Math.round(v.heard * 100) / 100, gain: Math.round(v.space.gain.value * 100) / 100, env: Math.round(v.env.gain.value * 100) / 100, vg: Math.round(v.vg.gain.value * 1000) / 1000, life: Math.round(v.life.gain.value * 1000) / 1000 }));
  Object.assign(api, {
    open, close, sync, hear, setMusic, currentMusic, themeOf, queueAdd, queueRemove, queueMove, playMusic, queue: () => queue.slice(), toggle, stop, progress, setVolume, stepVolume, shownVolume, living,
    pauseAll, stopAll, stopMusic, resumePending, fadeAll, list, voices: () => [...voices.values()], evenOut, jump: (card, left) => { const v = voices.get(card); if (v && v.src) { const at = Math.max(0, turnOf(v) - left); stopSource(v); startSource(v, at); } }, streams: () => [...voices.values()].filter((v) => v.src && v.src.media).map((v) => ({ name: v.card.name, t: Math.round(v.src.media.currentTime * 10) / 10, paused: v.src.media.paused, heard: Math.round(v.heard * 100) / 100 })), voice: voiceOf, curve, MASTER_FADE, randomMax, RANDOM_TOP, lifeEvery,
    isOpen: () => !!place, point: () => point, lockMusic: (on) => { musicLocked = !!on; changed(); }, musicLocked: () => musicLocked, heardNow, meter, meterOff,
  });
  global.MapAudio = api;
})(window);
