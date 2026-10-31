/* Light rays for the walk through the La Troupe door.
 * Soft shafts of warm light drawn on a canvas, each one alive on its own: it drifts a little, breathes, widens and
 * fades at its own pace, so the light plays rather than spins. The home page starts them at the doorway; La Troupe
 * picks them up where they were (same seed, same clock, kept in sessionStorage) and lets them fade with the gold.
 * Drawn at reduced resolution and stretched, which keeps them soft and cheap on phones and large screens alike. */
(function (g) {
  'use strict';
  var KEY = 'troubadour.rays';

  function rng(seed) { // small deterministic generator, so both pages draw the same rays
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  function makeRays(seed) {
    var r = rng(seed), rays = [], n = 26;
    for (var i = 0; i < n; i++) {
      rays.push({
        a: (i / n) * Math.PI * 2 + (r() - 0.5) * 0.22,      // base angle
        w: 0.006 + Math.pow(r(), 2) * 0.05,                 // half width (rad): mostly fine, a few broad
        k: 0.35 + r() * 0.65,                               // strength
        len: 0.55 + r() * 0.5,                              // reach, as a share of the screen diagonal
        p: [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28], // phases
        f: [0.25 + r() * 0.5, 0.6 + r() * 1.1, 0.15 + r() * 0.3]
      });
    }
    return rays;
  }

  /** Starts the rays. o = { seed, t0, z, origin(t) -> [x, y] in CSS px, alpha(t) -> 0..1, until (ms) } */
  function start(o) {
    var c = document.createElement('canvas');
    c.className = 'light-rays';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:' + (o.z || 302);
    document.body.appendChild(c);
    var ctx = c.getContext('2d'), rays = makeRays(o.seed), raf = 0, scale = 0.35, W = 0, H = 0;
    function size() {
      W = Math.max(1, Math.round(innerWidth * scale)); H = Math.max(1, Math.round(innerHeight * scale));
      c.width = W; c.height = H;
    }
    size();
    addEventListener('resize', size);
    function frame() {
      var t = Date.now() - o.t0, s = t / 1000;
      if (o.until && t > o.until) { stop(); return; }
      var A = Math.max(0, Math.min(1, o.alpha(t)));
      ctx.clearRect(0, 0, W, H);
      if (A > 0.002) {
        var org = o.origin(t), x = org[0] * scale, y = org[1] * scale, diag = Math.hypot(W, H);
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < rays.length; i++) {
          var q = rays[i];
          // each ray drifts, breathes and flickers on its own slow rhythm
          var ang = q.a + 0.035 * Math.sin(q.f[0] * s + q.p[0]) + 0.015 * Math.sin(q.f[1] * s * 0.7 + q.p[1]);
          var br = 0.5 + 0.5 * Math.sin(q.f[1] * s + q.p[2]);
          var slow = 0.5 + 0.5 * Math.sin(q.f[2] * s + q.p[3]);
          var a = A * q.k * (0.25 + 0.75 * br * (0.4 + 0.6 * slow));
          if (a < 0.01) continue;
          var w = q.w * (0.75 + 0.5 * slow), L = diag * q.len * (0.85 + 0.25 * br);
          var gr = ctx.createRadialGradient(x, y, 0, x, y, L);
          gr.addColorStop(0, 'rgba(255,246,214,' + (0.55 * a) + ')');
          gr.addColorStop(0.18, 'rgba(255,226,150,' + (0.32 * a) + ')');
          gr.addColorStop(0.55, 'rgba(255,200,110,' + (0.10 * a) + ')');
          gr.addColorStop(1, 'rgba(255,190,100,0)');
          ctx.fillStyle = gr;
          // a soft shaft: a wide faint wedge and a narrow brighter core
          for (var k = 0; k < 2; k++) {
            var ww = k ? w * 0.35 : w;
            ctx.globalAlpha = k ? 0.9 : 0.55;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(ang - ww) * L, y + Math.sin(ang - ww) * L);
            ctx.lineTo(x + Math.cos(ang + ww) * L, y + Math.sin(ang + ww) * L);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        // the source itself: a soft white-gold bloom where the rays meet
        var bl = ctx.createRadialGradient(x, y, 0, x, y, diag * 0.22);
        bl.addColorStop(0, 'rgba(255,248,225,' + (0.5 * A) + ')');
        bl.addColorStop(1, 'rgba(255,220,150,0)');
        ctx.fillStyle = bl; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      raf = requestAnimationFrame(frame);
    }
    function stop() { cancelAnimationFrame(raf); removeEventListener('resize', size); if (c.parentNode) c.parentNode.removeChild(c); }
    raf = requestAnimationFrame(frame);
    return { stop: stop, canvas: c };
  }

  function save(seed, t0) { try { sessionStorage.setItem(KEY, JSON.stringify({ seed: seed, t0: t0 })); } catch (e) { /* none */ } }
  function take() { try { var v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); return v; } catch (e) { return null; } }

  g.TroubadourRays = { start: start, save: save, take: take };
})(window);
