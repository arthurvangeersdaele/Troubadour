/* Light rays for the walk through the La Troupe door.
 * The rays are painted once, at low resolution, into one soft image; the browser then only turns and fades that
 * image (transform and opacity), which costs next to nothing on phones and large screens alike.
 * TroubadourRays.show(x, y) puts them at the doorway and returns the element. */
(function (g) {
  'use strict';
  function paint(size) {
    var c = document.createElement('canvas'), ctx = c.getContext('2d'), R = size / 2, n = 18;
    c.width = c.height = size;
    ctx.translate(R, R);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      var w = 0.012 + Math.pow(Math.random(), 2) * 0.05, k = 0.4 + Math.random() * 0.6, L = R * (0.65 + Math.random() * 0.35);
      var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
      gr.addColorStop(0, 'rgba(255,214,140,' + 0.5 * k + ')');
      gr.addColorStop(0.35, 'rgba(240,180,90,' + 0.22 * k + ')');
      gr.addColorStop(1, 'rgba(220,150,60,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - w) * L, Math.sin(a - w) * L);
      ctx.lineTo(Math.cos(a + w) * L, Math.sin(a + w) * L);
      ctx.closePath(); ctx.fill();
    }
    return c;
  }
  function show(x, y) {
    var D = Math.ceil(Math.hypot(innerWidth, innerHeight) * 2.2);
    var c = paint(256);
    c.className = 'light-rays';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;left:' + (x - D / 2) + 'px;top:' + (y - D / 2) + 'px;width:' + D + 'px;height:' + D + 'px;';
    document.body.appendChild(c);
    return c;
  }
  g.TroubadourRays = { show: show };
})(window);
