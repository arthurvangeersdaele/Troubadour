/* Troubadour Map: the sounds of the place on screen, heard from the player point.
 *
 * Every card of the place has a voice: its source, then its own volume, then the gain of the space
 * (distance and walls, 1 for the cards of the whole place), then the master volume.
 *
 *   MapAudio.open(place, world, buffers)  starts the voices of a place (buffers: Map(file => AudioBuffer))
 *   MapAudio.sync()                       after an edit: voices for new cards, none for removed ones
 *   MapAudio.hear(point)                  moves the listener, every gain glides to its new value
 *   MapAudio.voice(card)                  the voice of a card: { state: 'idle' | 'playing' | 'waiting', heard }
 *   MapAudio.toggle(card), stop(card), setVolume(card, v), close(), fadeAll()
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
    return { card, el, own, space, src: null, state: 'idle', heard: el ? 0 : 1, offset: 0, startedAt: 0, timer: 0, token: 0 };
  }

  /** The cards of the place: those of the whole place, then those of every element. */
  function cardsOf(p) {
    const out = p.general.map((c) => ({ card: c, el: null }));
    p.elements.forEach((e) => e.cards.forEach((c) => out.push({ card: c, el: e })));
    return out;
  }

  function startSource(v, fadeIn) {
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
    const offset = v.card.play === 'loop' ? v.offset % buf.duration : 0;
    src.start(t, offset);
    v.src = src; v.env = env; v.startedAt = t - offset;
    const token = ++v.token;
    src.onended = () => {
      if (token !== v.token) return; // stopped by hand: already handled
      v.src = null;
      if (v.card.play === 'random' && v.state === 'playing') waitAgain(v);
      else { v.state = 'idle'; v.offset = 0; changed(); }
    };
    return true;
  }

  /** A random card: a pause of gapMin to gapMax seconds, then the sound again. */
  function waitAgain(v) {
    const gap = v.card.gapMin + Math.random() * Math.max(0, v.card.gapMax - v.card.gapMin);
    v.state = 'playing';
    v.waiting = true;
    clearTimeout(v.timer);
    v.timer = setTimeout(() => { v.waiting = false; if (v.state === 'playing') startSource(v, 0); changed(); }, gap * 1000);
    changed();
  }

  function play(v) {
    if (v.state === 'playing') return;
    v.state = 'playing';
    v.waiting = false;
    if (!startSource(v, v.card.play === 'once' ? 0 : 0.6)) v.state = 'idle';
    changed();
  }

  function halt(v, ms) {
    clearTimeout(v.timer);
    v.waiting = false;
    if (v.src) {
      const { ctx } = audio();
      const src = v.src, env = v.env;
      if (v.card.play === 'loop') v.offset = (ctx.currentTime - v.startedAt) % (src.buffer.duration || 1);
      v.token += 1;
      const t = ctx.currentTime, end = t + Math.max(0.03, ms / 1000);
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(env.gain.value, t);
      env.gain.linearRampToValueAtTime(0, end);
      try { src.stop(end + 0.02); } catch (e) { /* already stopped */ }
      v.src = null;
    }
    v.state = 'idle';
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
    voices.forEach((v) => { if (v.card.autoplay && v.card.play !== 'once') play(v); });
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
  function toggle(card) {
    const v = voices.get(card);
    if (!v) return;
    audio(true);
    if (v.state === 'playing') { halt(v, v.card.play === 'once' ? 120 : settings.fade); changed(); } else play(v);
  }
  function setVolume(card, vol) {
    card.volume = vol;
    const v = voices.get(card);
    if (v) v.own.gain.setTargetAtTime(vol, now(), 0.03);
  }

  Object.assign(api, { open, close, sync, hear, toggle, setVolume, fadeAll, voice: voiceOf, isOpen: () => !!place, point: () => point });
  global.MapAudio = api;
})(window);
