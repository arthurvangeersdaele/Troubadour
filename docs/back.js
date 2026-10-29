/* Smart back button for the pages under La Troupe (web player, Story builder, Recueil, Ballade).
 * The back button returns where the visitor entered La Troupe from:
 *   the home page      ‹ Website      (Test it quick)
 *   How to use         ‹ How to use   (the discovery cards, Open the web player)
 *   anywhere else      ‹ La Troupe
 * Moving between La Troupe's tabs keeps that place; passing through La Troupe's own page resets it. */
(function () {
  var KEY = 'troubadour.back';
  var ROOT = new URL('./', document.currentScript.src).href;
  var TROUPE = ['play/', 'troupe/builder.html', 'troupe/recueil.html', 'troubadour-ballade/', 'ballade/'];
  function get() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function set(v) { try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch (e) { /* private mode */ } }

  var ref = document.referrer, from = null;
  if (ref && ref.indexOf(ROOT) === 0) {
    var path = ref.slice(ROOT.length).split(/[?#]/)[0];
    if (path === '' || path === 'index.html') from = { href: ROOT, label: 'Website' };
    else if (path.indexOf('how-to-use/') === 0) from = { href: ROOT + 'how-to-use/', label: 'How to use' };
    else if (TROUPE.some(function (p) { return path.indexOf(p) === 0; })) from = get(); // a tab: keep the way in
    else from = null; // La Troupe itself, or another page
    set(from);
  } else if (ref) {
    set(null); // came from another site
  } else {
    from = get(); // reload or typed address: keep what this tab knew
  }
  if (!from) return;
  function apply() {
    document.querySelectorAll('a.back').forEach(function (a) {
      a.href = from.href;
      a.setAttribute('aria-label', 'Back to ' + from.label);
      var s = a.querySelector('span');
      if (s) s.textContent = from.label;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
