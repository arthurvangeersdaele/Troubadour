/* La Troupe's sound: as the door opens, the room's pub ambiance (voices, mugs and bottles, a bard
 * in the corner, the fire) fading in and looping with a long crossfade, so the loop is never heard.
 * Used by the home page (the door) and La Troupe (the room). The sound toggle in La Troupe's bar turns it off for good
 * on this device ('troubadour.pubSound' = 'off'). Sounds and credits: troupe/sounds/. */
(function (g) {
  'use strict';
  var BASE = new URL('./sounds/', document.currentScript.src).href;
  var KEY = 'troubadour.pubSound', HANDOFF = 'troubadour.pubSince';
  var VOL = 0.55, XF = 4; // ambiance level, crossfade between two passes of the loop (s)
  var ctx = null, master = null, playing = false, timer = null, files = {}, bufs = {};

  function muted() { try { return localStorage.getItem(KEY) === 'off'; } catch (e) { return false; } }
  function setMuted(off) { try { if (off) localStorage.setItem(KEY, 'off'); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ } }

  function audio() {
    if (ctx) return ctx;
    var AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    return ctx;
  }
  /** Fetches a file early (no decoding yet: that needs the audio context). */
  function prefetch(name) {
    if (!files[name]) files[name] = fetch(BASE + name).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
    return files[name];
  }
  function buffer(name) {
    if (!bufs[name]) bufs[name] = prefetch(name).then(function (a) {
      return new Promise(function (res, rej) { ctx.decodeAudioData(a.slice(0), res, rej); });
    });
    return bufs[name];
  }

  /** One pass of the loop from `offset`, fading out over its last XF seconds while the next pass fades in. */
  function pass(b, when, offset) {
    var src = ctx.createBufferSource(), gain = ctx.createGain(), dur = b.duration - offset;
    src.buffer = b; src.connect(gain); gain.connect(master);
    gain.gain.setValueAtTime(offset > 0 ? 1 : 0, when);
    if (!offset) gain.gain.linearRampToValueAtTime(1, when + XF);
    gain.gain.setValueAtTime(1, when + dur - XF);
    gain.gain.linearRampToValueAtTime(0, when + dur);
    src.start(when, offset); src.stop(when + dur + 0.05);
    var next = when + dur - XF;
    timer = setTimeout(function () { if (playing) pass(b, next, 0); }, Math.max(0, (next - ctx.currentTime - 1.5) * 1000));
  }

  /** Starts the pub ambiance, fading in over `fade` seconds. `since`: when it began on the previous page (ms). */
  function start(fade, since) {
    if (muted() || playing || !audio()) return;
    playing = true;
    if (ctx.state === 'suspended') ctx.resume();
    buffer('261030_pub_ambiance.mp3').then(function (b) {
      if (!playing) return;
      var period = b.duration - XF, offset = since ? ((Date.now() - since) / 1000) % period : 0;
      pass(b, ctx.currentTime + 0.05, offset);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(VOL, ctx.currentTime + (fade || 2));
    }).catch(function () { playing = false; });
  }
  function stop(fade) {
    if (!playing || !ctx) return;
    playing = false; clearTimeout(timer);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + (fade || 0.6));
  }

  /** The door opens: the pub fades in behind it. Call from the click. */
  function door() {
    if (muted() || !audio()) return;
    if (ctx.state === 'suspended') ctx.resume();
    start(1.6);
    try { sessionStorage.setItem(HANDOFF, String(Date.now())); } catch (e) { /* none */ }
  }

  /** La Troupe: keep the room's sound going. Browsers only let a page play after a tap or a key, so if it is held
   *  back, it starts with the visitor's first touch. */
  function room(button) {
    var since = null, fromDoor = false;
    try { since = +sessionStorage.getItem(HANDOFF) || null; fromDoor = !!since; sessionStorage.removeItem(HANDOFF); } catch (e) { /* none */ }
    function paint() {
      if (!button) return;
      var off = muted();
      button.setAttribute('aria-pressed', String(!off));
      button.setAttribute('aria-label', off ? 'Turn the room sound on' : 'Turn the room sound off');
      button.title = off ? 'Room sound off' : 'Room sound on';
      button.classList.toggle('off', off);
    }
    paint();
    if (!muted()) {
      start(fromDoor ? 0.8 : 2.5, since);
      var wake = function () {
        if (ctx && ctx.state === 'suspended') ctx.resume();
        ['pointerdown', 'keydown', 'touchstart'].forEach(function (t) { removeEventListener(t, wake, true); });
      };
      ['pointerdown', 'keydown', 'touchstart'].forEach(function (t) { addEventListener(t, wake, true); });
    }
    if (button) button.addEventListener('click', function () {
      if (muted()) { setMuted(false); start(1.5); } else { setMuted(true); stop(0.8); }
      paint();
    });
    addEventListener('pagehide', function () { stop(0.2); });
  }

  g.TroupePub = { door: door, room: room, stop: stop, prefetch: function () { prefetch('261030_pub_ambiance.mp3'); }, muted: muted };
})(window);
