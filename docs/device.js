/* Which device is this? Classes on <html>, set before the first paint, so each page shows only what works here.
 *   pc       a mouse and a screen of at least 900 px: the builders, Play a tale, QR codes for the phone apps
 *   ios      iPhone, iPad or iPod (iPadOS reports a Mac with a touch screen)
 *   iphone   an iPhone or iPod          ipad      an iPad
 *   android  an Android phone           atablet   an Android tablet
 *   tablet   an iPad or Android tablet  phone     an iPhone or an Android phone
 *   touch    no computer: phone or tablet
 * Used by the website pages (home, How to use, La Troupe, Troubadour Ballade). */
(function () {
  var h = document.documentElement, ua = navigator.userAgent;
  var pc = false;
  try { pc = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)').matches; } catch (e) {}
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var iphone = /iPhone|iPod/.test(ua);
  var ipad = ios && !iphone;
  var androidAny = !ios && /Android/i.test(ua);
  var atablet = androidAny && !/Mobile/.test(ua);
  var android = androidAny && !atablet;
  if (ios || androidAny) pc = false;
  var set = { pc: pc, ios: ios, iphone: iphone, ipad: ipad, android: android, atablet: atablet,
    tablet: ipad || atablet, phone: iphone || android, touch: !pc };
  Object.keys(set).forEach(function (k) { h.classList.toggle(k, set[k]); });
})();
