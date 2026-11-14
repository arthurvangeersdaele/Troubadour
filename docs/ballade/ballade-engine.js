/* Troubadour Ballade engine (phase 1 of 261114_ballade_plan.md).
 * The one place where a card becomes sound: the player and the sound lab (tests/ballade) both go through it,
 * so what the lab measures is what the table hears. Nothing in here draws.
 *
 *  analyse(buf)        once per decoded sound: where the sound really starts and ends (encoder silence trimmed)
 *                      and its loudness.
 *  loopOf(buf, a, s)   a gapless loop of buf from a: the silence at the ends is cut and the seam is crossfaded
 *                      (equal power), so a loop never has a hole or a click at its turn.
 *  voice(...)          one card, scheduled on the audio clock, with micro fades so nothing clicks.
 *  shot(...)           one pass of a sound (random cards, soundbox), with the same micro fades.
 *  guard(ctx, run)     resumes the sound after a call, a lock or a switch of app. */
(function (global) {
  'use strict';

  const SILENT = Math.pow(10, -60 / 20); // under -60 dBFS is silence (encoder padding, empty tails)
  const RAMP = 0.006;                   // every start and every stop glides at least this long (s)
  const SEAM = 0.08;                    // loop seam crossfade (s)
  const TARGET = { music: -18, ambience: -22, events: -16, soundbox: -16 }; // LUFS by kind
  const NORM_MIN = Math.pow(10, -9 / 20), NORM_MAX = Math.pow(10, 6 / 20);

  const channels = (buf) => Array.from({ length: buf.numberOfChannels }, (_, k) => buf.getChannelData(k));

  /** Where the sound starts and ends (s), its loudness (LUFS, gated, no K-weighting), cached on the buffer. */
  function analyse(buf) {
    if (buf._ballade) return buf._ballade;
    const ch = channels(buf), n = buf.length, sr = buf.sampleRate;
    const loud = (i) => { for (const d of ch) if (Math.abs(d[i]) >= SILENT) return true; return false; };
    let a = 0; while (a < n && !loud(a)) a++;
    let b = n; while (b > a && !loud(b - 1)) b--;
    if (b - a < sr * 0.02) { a = 0; b = n; } // all but silent: keep it as it is
    // Loudness: 400 ms blocks, absolute gate -70, relative gate -10 (EBU R128, simplified).
    const blk = Math.max(1, Math.round(sr * 0.4)), ms = [];
    for (let s = a; s + blk <= b || (s === a && s < b); s += blk) {
      const e = Math.min(b, s + blk); let sum = 0;
      for (const d of ch) for (let i = s; i < e; i += 2) sum += d[i] * d[i];
      ms.push(sum / (Math.ceil((e - s) / 2) * ch.length));
    }
    const lu = (m) => -0.691 + 10 * Math.log10(m + 1e-12);
    let g = ms.filter((m) => lu(m) > -70);
    if (g.length) { const mean = g.reduce((x, y) => x + y, 0) / g.length; const rel = lu(mean) - 10; g = g.filter((m) => lu(m) > rel); }
    const lufs = g.length ? lu(g.reduce((x, y) => x + y, 0) / g.length) : -70;
    // Loops also leave out a fade baked into the file (a tail dying out, a head creeping in): their ends are where
    // the sound, in 50 ms windows, first and last comes within 30 dB of its own loudness (2 s at most each side).
    const w = Math.max(1, Math.round(sr * 0.05)), T = Math.max(-60, lufs - 30);
    const win = (s0) => { let m = 0; const e = Math.min(b, s0 + w); for (const d of ch) for (let i = s0; i < e; i++) m += d[i] * d[i]; return lu(m / ((e - s0) * ch.length)); };
    let la = a; while (la + w < Math.min(b, a + 2 * sr) && win(la) < T) la += w;
    let lb = b; while (lb - w > Math.max(la + w, b - 2 * sr) && win(lb - w) < T) lb -= w;
    if (lb - la < sr * 0.5) { la = a; lb = b; }
    buf._ballade = { a: a / sr, b: b / sr, la: la / sr, lb: lb / sr, lufs, loops: new Map() };
    return buf._ballade;
  }

  /** The gain that brings a sound of this kind to its target loudness (1 when evening out is off). */
  function norm(buf, zone, even) {
    if (!even) return 1;
    const t = TARGET[zone] != null ? TARGET[zone] : -18;
    const L = analyse(buf).lufs;
    if (!(L > -60)) return 1;
    return Math.min(NORM_MAX, Math.max(NORM_MIN, Math.pow(10, (t - L) / 20)));
  }

  /** A gapless loop of buf from `from` (s). Returns { buf, a, loopStart, loopEnd }: play from a, it runs to loopEnd,
   *  then turns between loopStart and loopEnd. The last SEAM before loopEnd is the tail crossfaded into the head,
   *  so the turn lands inside continuous sound. `shared`: the buffer is also played once elsewhere, so the seam is
   *  written into a copy instead of the buffer itself. */
  function loopOf(buf, from, shared) {
    const info = analyse(buf), sr = buf.sampleRate;
    // From the card's start, or where the sound comes in if that is later; to where it dies out.
    const a0 = (from || 0) > info.a ? Math.min(from, info.lb - 0.05) : info.la;
    const key = Math.round(a0 * 1000);
    if (info.loops.has(key)) return info.loops.get(key);
    const a = Math.round(a0 * sr), b = Math.round(info.lb * sr);
    const x = Math.min(Math.round(SEAM * sr), Math.floor((b - a) / 4));
    let out = { buf, a: a / sr, loopStart: a / sr, loopEnd: b / sr };
    if (x >= 32) {
      let dst = buf;
      // The first loop of a sound writes its seam into the buffer itself (no copy in memory); the samples it
      // overwrites are kept, so a second loop point, or a sound also played once (`shared`), gets a clean copy.
      const X0 = Math.min(b, Math.round(SEAM * sr));
      if (shared || info.loops.size || info.tail) {
        const C = global.AudioBuffer;
        dst = new C({ length: b, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
        for (let k = 0; k < buf.numberOfChannels; k++) {
          dst.getChannelData(k).set(buf.getChannelData(k).subarray(0, b));
          if (info.tail) dst.getChannelData(k).set(info.tail[k], b - X0);
        }
        dst._ballade = info;
      } else {
        info.tail = channels(buf).map((d) => d.slice(b - X0, b));
      }
      const orig = (k, i) => (info.tail && dst === buf ? null : info.tail && i >= b - X0 ? info.tail[k][i - (b - X0)] : null);
      for (let k = 0; k < dst.numberOfChannels; k++) {
        const d = dst.getChannelData(k), src = buf.getChannelData(k);
        const at = (i) => { const o = orig(k, i); return o == null ? src[i] : o; };
        for (let i = 0; i < x; i++) {
          const p = (i + 0.5) / x;
          d[b - x + i] = at(b - x + i) * Math.cos(p * Math.PI / 2) + at(a + i) * Math.sin(p * Math.PI / 2);
        }
      }
      out = { buf: dst, a: a / sr, loopStart: (a + x) / sr, loopEnd: b / sr };
    }
    info.loops.set(key, out);
    return out;
  }

  /** Where a loop is (s in its buffer) after `e` seconds of play. */
  function loopPos(L, e) {
    const first = L.loopEnd - L.a;
    if (e < first) return L.a + e;
    const per = Math.max(0.01, L.loopEnd - L.loopStart);
    return L.loopStart + ((e - first) % per);
  }

  /** One card on the clock. card: { file, zone, start, duration, play, repeat, hold, fadeIn, fadeOut, volume }.
   *  `from`: seconds already played (resuming a card). Returns { src, g, t0, end, hold } or null. */
  function voice(ctx, out, buf, card, t0, from, opts) {
    opts = opts || {};
    const info = analyse(buf);
    const loops = !!(card.repeat || card.hold || card.play === 'loop');
    const hold = !!card.hold;
    const src = ctx.createBufferSource();
    let pos;
    let len; // how long this card sounds (s), Infinity when held
    if (loops) {
      const L = loopOf(buf, card.start || 0, opts.shared);
      src.buffer = L.buf; src.loop = true; src.loopStart = L.loopStart; src.loopEnd = L.loopEnd;
      pos = loopPos(L, Math.max(0, from || 0));
      len = hold ? Infinity : Math.max(0.05, card.duration - (from || 0));
    } else {
      src.buffer = buf;
      const begin = Math.max(info.a, Math.min(card.start || 0, info.b - 0.05));
      pos = Math.min(info.b - 0.02, begin + Math.max(0, from || 0));
      len = Math.max(0.02, Math.min(card.duration - (from || 0), info.b - pos));
    }
    const g = ctx.createGain();
    const vol = Math.max(0, card.volume == null ? 1 : card.volume) * norm(buf, card.zone, opts.even);
    const fi = Math.max(RAMP, Math.min(card.fadeIn || 0, hold ? 30 : len / 2));
    const fo = hold ? 0 : Math.max(RAMP, Math.min(card.fadeOut || 0, Math.max(0, len - fi)));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + fi);
    if (!hold) { g.gain.setValueAtTime(vol, t0 + len - fo); g.gain.linearRampToValueAtTime(0, t0 + len); }
    src.connect(g).connect(out);
    src.start(t0, pos);
    if (!hold) src.stop(t0 + len + 0.02);
    return { src, g, t0, end: t0 + len, hold, vol };
  }

  /** One pass of a sound at `at` (random cards, soundbox): from `start` for at most `len` s, gliding in and out. */
  function shot(ctx, out, buf, at, start, len, vol) {
    const info = analyse(buf);
    const s = Math.max(info.a, Math.min(start || 0, info.b - 0.02));
    const l = Math.max(0.02, Math.min(len == null ? Infinity : len, info.b - s));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const v = vol == null ? 1 : vol;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + RAMP);
    g.gain.setValueAtTime(v, at + l - RAMP);
    g.gain.linearRampToValueAtTime(0, at + l);
    src.connect(g).connect(out);
    src.start(at, s);
    src.stop(at + l + 0.02);
    return { src, g, end: at + l, len: l };
  }

  /** Fades a gain to silence from now over `sec` (at least RAMP). Returns when it is silent. */
  function fadeOut(ctx, g, sec) {
    const t = ctx.currentTime, f = Math.max(RAMP, sec);
    const p = g.gain;
    const cur = p.value;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
    p.setValueAtTime(cur, t);
    p.linearRampToValueAtTime(0, t + f);
    return t + f;
  }

  /** A brick-wall limiter at -1 dBFS for the master, so evened-out sounds stacked together never clip. */
  function limiter(ctx) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -2; c.knee.value = 1; c.ratio.value = 20; c.attack.value = 0.002; c.release.value = 0.2;
    return c;
  }

  /** Brings the sound back after an interruption (a call, the screen locked, another app): `run()` says whether the
   *  table should be sounding (not paused by the bard). The schedule needs no fixing: the audio clock stood still. */
  function guard(ctx, run) {
    const kick = () => { if (run() && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    global.addEventListener('pageshow', kick);
    global.addEventListener('focus', kick);
    ['touchend', 'pointerup', 'keydown'].forEach((ev) => global.addEventListener(ev, kick, { passive: true }));
    if (ctx.addEventListener) ctx.addEventListener('statechange', () => { if (ctx.state === 'interrupted') setTimeout(kick, 400); });
    return kick;
  }

  global.BalladeEngine = { analyse, norm, loopOf, loopPos, voice, shot, fadeOut, limiter, guard, RAMP, SEAM, TARGET, SILENT };
})(typeof window !== 'undefined' ? window : globalThis);
