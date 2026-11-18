/* Troubadour sound card, the logic every Troubadour table shares (261118_troubadour_unifier.md, P3): the web
 * player and Troubadour for iPhone build their cards on it, so a card plays, pauses, fades, loops, blends and
 * evens out the same way on both. Its states are the statechart of the unifier (section 4.1), tested by
 * tests/statecharts.
 *
 *   const Voice = TroubadourVoice.define(host);  new Voice(sound, zone, chapter)
 *
 * host: { audio() builds the audio context; ctx() the context (or null); master() the master gain; settings;
 *         curve(v); paintCard(v); playAfter(v) a music ended by itself; dirty() the story changed (optional);
 *         onState(v) (optional); measureKey(v, blob) and store for the engine's measurements (optional) }
 *
 * States: loading, ready, playing, paused, ending, error (see paint() and the statechart). */
(function (global) {
  'use strict';

  const LOOP_NAMES = ['once', 'twice', 'infinite', 'random', 'after'];
  const LOOP_INDEX = { once: 0, twice: 1, infinite: 2, random: 3, after: 4 };

  /** Lets a media element go: Safari keeps its decoder until it is told to load nothing. */
  function freeElement(el) {
    try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* gone */ }
  }

  function define(host) {
    const ctxOf = () => host.ctx();
    const noop = () => {};
    if (!host.dirty) host.dirty = noop;
    function ramp(param, target, secs) {
      const t = ctxOf().currentTime;
      const v = param.value;
      param.cancelScheduledValues(t);
      param.setValueAtTime(v, t);
      param.linearRampToValueAtTime(target, t + Math.max(secs, 0.012));
    }
    class Voice {
      constructor(sound, zone, chapter) {
        this.sound = sound; this.zone = zone; this.chapter = chapter;
        this.loop = LOOP_INDEX[sound.loop] ?? zone.loop;
        if ((this.loop === 4 && zone.id !== 'music') || (this.loop === 3 && zone.id === 'music')) this.loop = 0;
        if (this.loop === 3 && zone.id === 'music') this.loop = 0;
        this.vol = typeof sound.volume === 'number' ? sound.volume : 0.75;
        this.state = 'loading';
        this.plays = 0; this.el = null; this.url = null; this.env = null; this.vg = null; this.timer = 0; this.card = null;
        // Random events, as in the Android app: rnd while the sound keeps coming back, next = when it plays again (0 while it plays).
        this.rnd = false; this.next = 0; this.startedAt = 0;
      }
      attach(blob) {
        this.url = URL.createObjectURL(blob);
        this.measure(blob);
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
        host.audio();
        const src = (this.src = ctxOf().createMediaElementSource(this.el));
        this.vg = ctxOf().createGain(); this.vg.gain.value = host.curve(this.vol);
        this.env = ctxOf().createGain(); this.env.gain.value = 0;
        // Living events: a gain of its own lets the volume drift around the troubadour's setting.
        this.life = ctxOf().createGain(); this.life.gain.value = 1;
        // xf: this round's share of a blended loop (1 outside a blend).
        this.xf = ctxOf().createGain(); this.xf.gain.value = 1;
        // nm: the evening-out gain (the level of the sound's kind, 1 until it is measured or when off).
        this.nm = ctxOf().createGain(); this.nm.gain.value = this.norm;
        src.connect(this.xf).connect(this.vg).connect(this.life).connect(this.env).connect(this.nm).connect(host.master());
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
          const t = ctxOf().currentTime, from = this.pauseLeft;
          this.fadingOut = null;
          this.env.gain.cancelScheduledValues(t);
          this.env.gain.setValueAtTime(from, t);
          this.env.gain.linearRampToValueAtTime(1, t + Math.max(fadeIn * (1 - from), 0.012));
          this.set('playing');
          return;
        }
        if (this.state === 'ready') { this.el.currentTime = this.head; this.plays = 0; }
        // From silence, rise over fadeIn. Set from 0 on purpose: ramp() would start from gain.value, which Safari
        // still reports as the old level (1 after a sound ended).
        const g = this.env.gain, el = this.el, c = ctxOf();
        const t = c.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(0, t);
        // The rise starts when the sound really comes out. On iPhone the context is often still waking (after a
        // lock, a call or another app: its clock jumps ahead when it runs again, so a rise planned now would
        // already be over), and Safari starts a media element a few hundred ms after play(): the fade-in was lost.
        const token = this.riseToken = (this.riseToken || 0) + 1;
        let risen = false;
        const rise = () => {
          if (risen || token !== this.riseToken || this.state !== 'playing' || this.el !== el) return;
          risen = true;
          const now = c.currentTime;
          g.cancelScheduledValues(now);
          g.setValueAtTime(0, now);
          g.linearRampToValueAtTime(1, now + Math.max(fadeIn, 0.012));
        };
        const whenRunning = () => (c.state === 'running' ? rise() : Promise.resolve(c.resume && c.resume()).then(rise, rise));
        if (el.paused) el.addEventListener('playing', whenRunning, { once: true }); else whenRunning();
        setTimeout(whenRunning, 1500); // never silent for long, whatever the browser reports
        const p = el.play();
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
      /* ---------- The shared engine's numbers (../shared/troubadour-engine.js), as in Ballade and Map ----------
       * Measured once per sound in the background: where it really starts (no encoder silence), where a round of its
       * loop starts and turns, how loud it is. Until then, and if it cannot be read, the sound plays as it always did. */
      measure(blob) {
        const E = window.TroubadourEngine;
        if (!E || !E.measure) return;
        E.measure(null, blob, host.measureKey ? host.measureKey(this, blob) : null, host.store || null).then((info) => {
          if (!info || !(info.b > 0)) return;
          this.info = info;
          if (this.nm && ctxOf()) this.nm.gain.setTargetAtTime(this.norm, ctxOf().currentTime, 0.3);
        }).catch(() => {});
      }
      /** Where the sound really starts (s in the file). */
      get head() { return this.info ? this.info.a : 0; }
      /** The gain that brings it to the level of its kind (music -18, ambiance -22, events -16 LUFS). */
      get norm() { const E = window.TroubadourEngine; return E && E.gainOf ? E.gainOf(this.info, this.zone.id, host.settings.even !== false) : 1; }
      /** A measured forever loop crosses its rounds at its trimmed points (the engine's seam for streamed sounds),
       *  unless the troubadour set a blend of their own. In seconds, 0 when none. */
      get seam() {
        const i = this.info, E = window.TroubadourEngine;
        if (this.loop !== 2 || !i || this.blend || !E) return 0;
        const d = i.lb - i.la;
        return d > 1.5 ? Math.min(E.STREAM_SEAM, d / 3) : 0;
      }
      /** A blended loop: near the end of a round, the next round starts on a second element and the two cross over.
       *  The engine's seam keeps the native loop beneath, so a round still turns if the timers ever sleep. */
      blendTick() {
        if (!this.el || !this.xf) return;
        const b = this.blend, sm = this.seam;
        if (!b) { if (this.loop === 2 && !this.el.loop) this.el.loop = true; if (!sm) return; } else if (this.el.loop) this.el.loop = false;
        if (this.state !== 'playing' || this.twin) return;
        const turn = b ? this.el.duration : this.info.lb;
        const left = turn - this.el.currentTime;
        if (!(left <= (b || sm + 0.06)) || left < 0) return;
        const old = this.el, oldXf = this.xf;
        const nu = new Audio();
        nu.preload = 'auto';
        nu.loop = !b;
        nu.addEventListener('ended', () => { if (nu === this.el) this.ended(); });
        nu.src = this.url;
        // A new round starts where the loop does (set before it loads: the browser starts there).
        const at = b ? 0 : this.info.la;
        if (at > 0.02) { try { nu.currentTime = at; } catch (e) { /* set at load */ } }
        const xf = ctxOf().createGain();
        ctxOf().createMediaElementSource(nu).connect(xf).connect(this.vg);
        const t = ctxOf().currentTime, span = Math.max(0.05, left);
        if (b) {
          xf.gain.setValueAtTime(0, t); xf.gain.linearRampToValueAtTime(1, t + span);
          oldXf.gain.cancelScheduledValues(t); oldXf.gain.setValueAtTime(1, t); oldXf.gain.linearRampToValueAtTime(0, t + span);
        } else {
          // Equal power, so the level holds through the seam (straight steps: a pause may cut in at any time).
          xf.gain.cancelScheduledValues(t); xf.gain.setValueAtTime(0, t);
          oldXf.gain.cancelScheduledValues(t); oldXf.gain.setValueAtTime(1, t);
          for (let k = 1; k <= 8; k++) {
            const q = k / 8, at2 = t + span * q;
            xf.gain.linearRampToValueAtTime(Math.sin(q * Math.PI / 2), at2);
            oldXf.gain.linearRampToValueAtTime(Math.cos(q * Math.PI / 2), at2);
          }
        }
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
        if (now && this.xf && ctxOf()) { const g = this.xf.gain; g.cancelScheduledValues(ctxOf().currentTime); g.setValueAtTime(1, ctxOf().currentTime); }
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
        if (this.state === 'error') return; // an unreadable sound stays unreadable (statechart)
        this.plays += 1;
        if (this.loop === 1 && this.plays < 2 && this.active) { this.el.currentTime = this.head; this.el.play().catch(() => {}); return; }
        const natural = this.state === 'playing';
        this.reset();
        // A music that played through on its own hands over to the next one set to play after it.
        if (natural && this.zone.id === 'music') host.playAfter(this);
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
        host.dirty();
        this.paint();
      }
      setVol(v) {
        this.vol = v;
        this.volMs = 0;
        this.sound.volume = Math.round(v * 100) / 100;
        host.dirty();
        if (this.vg) { const g = this.vg.gain; g.cancelScheduledValues(ctxOf().currentTime); g.setTargetAtTime(host.curve(v), ctxOf().currentTime, 0.03); }
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
        host.dirty();
        if (this.vg) {
          const g = this.vg.gain, now = ctxOf().currentTime;
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(host.curve(t), now + secs);
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
      set(state) { this.state = state; this.paint(); if (host.onState) host.onState(this); }
      paint() { if (this.card) host.paintCard(this); }
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
    return Voice;
  }

  global.TroubadourVoice = { define, LOOP_NAMES, LOOP_INDEX, freeElement };
})(typeof window !== 'undefined' ? window : globalThis);
