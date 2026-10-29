/* Install now: every a.install link points to the right app for this device.
 *   Android phone           the latest APK
 *   iPhone, iPad, tablet    the Home Screen app (ios/)
 *   computer                a window with one QR code per phone, to scan with it
 * Needs device.js. Used by How to use and the web player. The QR library loads on first use. */
(function () {
  var me = document.currentScript, ROOT = new URL('./', me.src).href;
  var RELEASE = 'https://github.com/arthurvangeersdaele/Troubadour/releases/tag/dev-latest', apk = RELEASE;
  var IOS = ROOT + 'ios/', h = document.documentElement;
  var links = [].slice.call(document.querySelectorAll('a.install'));
  if (!links.length) return;
  function setAll(url) { links.forEach(function (a) { a.href = url; }); }
  if (h.classList.contains('android')) setAll(RELEASE);
  else if (h.classList.contains('touch')) setAll(IOS);
  else setAll(ROOT + '#get');

  fetch('https://api.github.com/repos/arthurvangeersdaele/Troubadour/releases/tags/dev-latest')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var a = j && (j.assets || []).filter(function (x) { return /\.apk$/i.test(x.name); })[0];
      if (!a) return;
      apk = a.browser_download_url;
      if (h.classList.contains('android')) setAll(apk);
    }).catch(function () {});

  var css = '.in-veil{position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:rgba(5,5,8,.72);backdrop-filter:blur(3px);padding:16px}'
    + '.in-veil[hidden]{display:none}'
    + '.in-box{position:relative;background:var(--bar);color:var(--text);border:1px solid var(--line);border-radius:18px;padding:26px 28px 24px;max-width:600px;width:100%;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.5);font-family:"Barlow Semi Condensed",system-ui,sans-serif}'
    + '.in-box h3{font-family:"Cormorant SC",serif;font-size:28px;margin:0 0 4px}'
    + '.in-box>p{color:var(--muted);font-size:15px;margin:0 0 16px}'
    + '.in-pair{display:grid;grid-template-columns:1fr 1fr;gap:22px}'
    + '.in-code{background:#fff;border-radius:14px;padding:14px;width:200px;height:200px;margin:0 auto 14px;display:grid;place-items:center}'
    + '.in-code svg{width:100%;height:100%;display:block}'
    + '.in-pair b{display:block;font-size:17px;margin-bottom:4px}'
    + '.in-pair span{display:block;color:var(--muted);font-size:14px;line-height:1.4}'
    + '.in-close{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer;display:grid;place-items:center}'
    + '.in-close:hover{border-color:var(--muted)}';
  var veil = null, last = null;
  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    veil = document.createElement('div');
    veil.className = 'in-veil'; veil.hidden = true;
    veil.setAttribute('role', 'dialog'); veil.setAttribute('aria-modal', 'true'); veil.setAttribute('aria-labelledby', 'in-title');
    veil.innerHTML = '<div class="in-box"><button class="in-close" type="button" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg></button>'
      + '<h3 id="in-title">Install Troubadour</h3><p>Scan with the phone or tablet you play with.</p>'
      + '<div class="in-pair"><div><div class="in-code" data-for="android"></div><b>Android phone</b><span>The APK downloads. Open it and allow installs from your browser when asked.</span></div>'
      + '<div><div class="in-code" data-for="ios"></div><b>iPhone and tablets</b><span>Open the page, then add Troubadour to your Home Screen.</span></div></div></div>';
    document.body.appendChild(veil);
    veil.querySelector('.in-close').addEventListener('click', hide);
    veil.addEventListener('click', function (e) { if (e.target === veil) hide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !veil.hidden) hide(); });
  }
  function draw(el, url) { var q = qrcode(0, 'M'); q.addData(url); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
  function show(a) {
    if (!veil) build();
    draw(veil.querySelector('[data-for="android"]'), apk);
    draw(veil.querySelector('[data-for="ios"]'), IOS);
    last = a; veil.hidden = false; veil.querySelector('.in-close').focus();
  }
  function hide() { veil.hidden = true; if (last) last.focus(); }
  function withQr(done) {
    if (typeof qrcode === 'function') return done();
    var s = document.createElement('script');
    s.src = ROOT + 'vendor/qrcode-generator-1.4.4.js';
    s.onload = done;
    document.head.appendChild(s);
  }
  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (!h.classList.contains('pc')) return;
      e.preventDefault();
      withQr(function () { show(a); });
    });
  });
})();
