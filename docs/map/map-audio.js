/* Troubadour Map: the sounds of the place on screen, heard from the player point.
 *
 * Every card of the place has a voice: its source, then its own volume, then the gain of the space
 * (distance and walls, 1 for the cards of the whole place), then the master volume.
 *
 *   MapAudio.open(place, world, buffers)  starts the voices of a place (buffers: Map(file => AudioBuffer))
 *   MapAudio.sync()                       after an edit: voices for new cards, none for removed ones
 *   MapAudio.hear(point)                  moves the listener, every gain glides to its new value
 *   MapAudio.voice(card)                  the voice of a card: { state: 'idle' | 'playing' | 'paused', waiting, heard }
 *   MapAudio.toggle(card) play or pause, stop(card) fade out to the start, progress(card), setVolume(card, v), close(), fadeAll()
 *   MapAudio.onChange = fn                called when a voice starts or stops
 */
(function (global) {
  'use strict';

  const { audio, settings } = global.MapUI;
  const M = global.TroubadourMap;

  let place = null, world = null, buffers = new Map(), point = [0, 0];
  const voices = new Map(); // card => voice
  const api = { onChange: null };

  const changed = () => { if (api.onChange) api.onChange(); };
  const now = () => audio().ctx.currentTime;

  function makeVoice(card, el) {
    const { ctx, master } = audio();
    const space = ctx.createGain();
    const own = ctx.createGain();
    own.gain.value = card.volume;
    own.connect(space); space.connect(master);
    space.gain.value = el ? 0 : 1;
    return { card, el, own, space, src: null, state: 'idle', heard: el ? 0 : 1, offset: 0, startedAt: 0, timer: 0, token: 0, left: 0 };
  }

  /** The cards of the place: those of the whole place, then those of every element. */
  function cardsOf(p) {
    const out = p.general.map((c) => ({ card: c, el: null }));
    p.elements.forEach((e) => e.cards.forEach((c) => out.push({ card: c, el: e })));
    return out;
  }

  /** Where the sound is now, in seconds into it. */
  function position(v) {
    if (!v.src) return v.offset;
    const d = v.src.buffer.duration || 1;
    const t = audio().ctx.currentTime - v.startedAt;
    return v.card.play === 'loop' ? t % d : Math.min(d, t);
  }

  function startSource(v, fadeIn, from = 0) {
    const buf = buffers.get(v.card.file);
    if (!buf) return false;
    const { ctx } = audio();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = v.card.play === 'loop';
    const env = ctx.createGain();
    src.connect(env); env.connect(v.own);
    const t = now();
    env.gain.setValueAtTime(fadeIn ? 0 : 1, t);
    if (fadeIn) env.gain.linearRampToValueAtTime(1, t + fadeIn);
    const offset = Math.max(0, Math.min(buf.duration - 0.01, from % buf.duration));
    src.start(t, offset);
    v.src = src; v.env = env; v.startedAt = t - offset;
    const token = ++v.token;
    src.onended = () => {
      if (token !== v.token) return; // stopped by hand: already handled
      v.src = null;
      v.offset = 0;
      if (v.state !== 'playing') return;
      if (v.card.play === 'random') waitAgain(v);
      else if (v.card.play === 'twice' && v.left > 0) { v.left -= 1; startSource(v, 0); }
      else { v.state = 'idle'; changed(); if (v.card.zone === 'music') nextMusic(v); }
    };
    return true;
  }

  /** A random card: a pause of gapMin to gapMax seconds, then the sound again. */
  function waitAgain(v) {
    const gap = v.card.gapMin + Math.random() * Math.max(0, v.card.gapMax - v.card.gapMin);
    v.waiting = true;
    v.nextAt = Date.now() + gap * 1000;
    clearTimeout(v.timer);
    v.timer = setTimeout(() => { v.waiting = false; if (v.state === 'playing') startSource(v, 0); changed(); }, gap * 1000);
    changed();
  }

  /** The musics of a group (the whole map, or one element), in their order. */
  const musicsOf = (v) => [...voices.values()].filter((o) => o.el === v.el && o.card.zone === 'music');
  /** "Play after", as in Troubadour: musics set to it make a playlist of their group. When a music ends on its
   *  own (its 1× or 2× played through, not stopped or paused), the next one set to play after starts: after a
   *  track of the playlist, the next one of the playlist in order (the last one ends it); after any other music,
   *  the first one of the playlist that follows it (from the start again). */
  function nextMusic(v) {
    const row = musicsOf(v);
    if (row.some((o) => o !== v && o.state === 'playing')) return; // another music already took over
    const at = row.indexOf(v);
    const order = v.card.play === 'after' ? row.slice(at + 1) : [...row.slice(at + 1), ...row.slice(0, at)];
    const n = order.find((o) => o.card.play === 'after');
    if (n) play(n);
  }

  /** Plays a card: from where it was paused, else from its start. A music started by hand takes over from
   *  the other musics of its group (they fade out). */
  function play(v, alone) {
    if (v.state === 'playing') return;
    if (v.card.zone === 'music' && !alone) musicsOf(v).forEach((o) => { if (o !== v && o.state !== 'idle') halt(o, settings.fade); });
    const resume = v.state === 'paused';
    if (!resume) { v.offset = 0; v.left = v.card.play === 'twice' ? 1 : 0; }
    v.state = 'playing';
    v.waiting = false;
    const fade = v.card.zone === 'events' || v.card.zone === 'soundbox' ? 0 : 0.6;
    if (!startSource(v, fade, v.offset)) v.state = 'idle';
    changed();
  }

  /** Fades a card out. `keep`: paused, it starts again where it was; otherwise back to its start. */
  function halt(v, ms, keep) {
    clearTimeout(v.timer);
    const wasWaiting = v.waiting;
    v.waiting = false;
    if (v.src) {
      const { ctx } = audio();
      const src = v.src, env = v.env;
      v.offset = keep ? position(v) : 0;
      v.token += 1;
      const t = ctx.currentTime, end = t + Math.max(0.03, ms / 1000);
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(env.gain.value, t);
      env.gain.linearRampToValueAtTime(0, end);
      try { src.stop(end + 0.02); } catch (e) { /* already stopped */ }
      v.src = null;
    } else if (!keep) v.offset = 0;
    // A random card between two plays has nothing to keep: pausing it stops it.
    v.state = keep && !wasWaiting && v.state === 'playing' ? 'paused' : 'idle';
  }

  function drop(v) {
    halt(v, 300);
    const space = v.space;
    setTimeout(() => { try { space.disconnect(); } catch (e) { /* gone */ } }, 600);
  }

  /** The gain of the space for every voice of an element, from where the player point stands. */
  function hear(p) {
    if (p) point = p;
    if (!place) return;
    const { ctx } = audio();
    const t = ctx.currentTime;
    const memo = new Map();
    voices.forEach((v) => {
      let g = 1;
      if (v.el) {
        if (!memo.has(v.el)) memo.set(v.el, M.hearing(point, v.el, place.walls, world.wallLoss).gain);
        g = memo.get(v.el);
      }
      v.heard = g;
      v.space.gain.cancelScheduledValues(t);
      v.space.gain.setTargetAtTime(g, t, 0.08);
    });
  }

  function sync() {
    if (!place) return;
    const live = new Set();
    cardsOf(place).forEach(({ card, el }) => {
      live.add(card);
      let v = voices.get(card);
      if (!v) { v = makeVoice(card, el); voices.set(card, v); }
      v.el = el;
      v.own.gain.setTargetAtTime(card.volume, now(), 0.03);
      if (v.src) v.src.loop = card.play === 'loop';
      if (card.play !== 'twice') v.left = 0;
    });
    voices.forEach((v, card) => { if (!live.has(card)) { drop(v); voices.delete(card); } });
    hear();
    changed();
  }

  function open(p, w, bufs) {
    close(settings.fade);
    place = p; world = w; buffers = bufs; point = p.player.slice();
    sync();
    audio(true);
    // Every card starts with its map: the map decides how much of an element is heard. Of several musics in
    // a group, only the first starts; the others follow it, one after another.
    const groups = new Set();
    voices.forEach((v) => {
      if (v.card.zone !== 'music') { play(v, true); return; }
      const g = v.el || 'map';
      if (groups.has(g)) return;
      groups.add(g);
      const row = musicsOf(v);
      play(row.find((o) => o.card.play !== 'after') || row[0], true);
    });
    changed();
  }

  function close(ms = settings.fade) {
    voices.forEach((v) => {
      halt(v, ms);
      const space = v.space;
      setTimeout(() => { try { space.disconnect(); } catch (e) { /* gone */ } }, ms + 400);
    });
    voices.clear();
    place = null;
    changed();
  }

  function fadeAll() { voices.forEach((v) => halt(v, settings.fade)); changed(); }

  const voiceOf = (card) => voices.get(card) || null;
  /** Play, or pause (with a fade) where it is. */
  function toggle(card) {
    const v = voices.get(card);
    if (!v) return;
    audio(true);
    if (v.state === 'playing') { halt(v, settings.fade, true); changed(); } else play(v);
  }
  /** Fade out and back to the start. */
  function stop(card) {
    const v = voices.get(card);
    if (!v || v.state === 'idle') return;
    halt(v, settings.fade);
    changed();
  }
  /** How far a card is, as Troubadour shows it: { p } from 0 to 1 (-1 for an endless loop), { left } in seconds
   *  (null for an endless loop; a 2× counts both plays), and { next } in seconds while a random card waits. */
  function progress(card) {
    const v = voices.get(card);
    const buf = buffers.get(card.file);
    const d = buf ? buf.duration : 0;
    if (!v || !d) return { p: 0, left: null, next: null };
    if (v.waiting) return { p: 0, left: null, next: Math.max(0, ((v.nextAt || 0) - Date.now()) / 1000) };
    if (card.play === 'loop') return { p: -1, left: null, next: null };
    const total = card.play === 'twice' ? 2 * d : d;
    const done = (card.play === 'twice' && v.state !== 'idle' ? (1 - v.left) * d : 0) + (v.state === 'idle' ? 0 : position(v));
    return { p: Math.min(1, done / total), left: Math.max(0, total - done), next: null };
  }
  /** A card's own volume. `secs`: glide there over that time (the simple volume buttons), else at once. */
  function setVolume(card, vol, secs) {
    card.volume = vol;
    const v = voices.get(card);
    if (!v) return;
    const g = v.own.gain, t = now();
    g.cancelScheduledValues(t);
    if (secs) { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(vol, t + secs); }
    else g.setTargetAtTime(vol, t, 0.03);
  }

  const list = () => [...voices.values()].map((v) => ({ name: v.card.name, state: v.state, heard: Math.round(v.heard * 100) / 100, gain: Math.round(v.space.gain.value * 100) / 100 }));
  Object.assign(api, { open, close, sync, hear, toggle, stop, progress, setVolume, fadeAll, list, voice: voiceOf, isOpen: () => !!place, point: () => point });
  global.MapAudio = api;
})(window);
