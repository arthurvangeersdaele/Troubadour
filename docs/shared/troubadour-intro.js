/* Troubadour intro and outro: a music of the story marked "intro" is offered as the story opens at the table, a
 * music marked "outro" before going back to the stories (setting Intro and outro). Both play once (1×), whatever
 * their loop. As the outro starts, every other sound fades out, and the table closes when it ends. Shared by the
 * web player and Troubadour for iPhone (the Android app does the same in TableScreen.kt).
 *
 * A music carries its part in its card of story.json: "role": "intro" or "role": "outro" (TROUBADOUR_FORMAT.md).
 *
 *   const IO = TroubadourIntro.define(host)
 *   host: { on() setting on; voices() every voice of the table; start(v) plays a voice (as a tap on Play);
 *           fadeAll(except) fades every other sound out; leave() closes the table at once }
 *   IO.intro()           as a story opens: offers its intro
 *   IO.outro()           a voice to offer before leaving, or null (none, setting off, or it already plays)
 *   IO.offerOutro(v)     offers it; Leave now, or its end, calls host.leave()
 *   IO.leaving()         true while the outro plays (a second Leave leaves at once)
 *   IO.reset()           the table closed
 */
(function (global) {
  'use strict';

  const ROLES = ['intro', 'outro'];
  const roleOf = (s) => { const r = s && (s.role ?? (s.extra && s.extra.role)); return ROLES.includes(r) ? r : ''; };
  const WAIT = 5; // seconds of the gold ring before the music plays by itself

  function define(host) {
    let box = null, tick = 0, done = 0, watch = 0, cur = null;
    const isMusic = (v) => v.zone && v.zone.id === 'music';
    const find = (kind) => host.voices().find((v) => isMusic(v) && roleOf(v.sound) === kind) || null;
    const sounding = (v) => v.state === 'playing' || v.state === 'ending' || v.wanted;

    function close() {
      clearInterval(tick); clearTimeout(done); tick = 0; done = 0;
      if (box) { box.remove(); box = null; }
    }
    function restore() {
      if (!cur) return;
      const v = cur.v;
      v.loop = cur.loop;
      if (v.el) v.el.loop = v.loop === 2;
      if (v.card) v.paint();
    }
    function finish(left) {
      clearInterval(watch); watch = 0;
      const was = cur;
      restore();
      cur = null;
      if (was && was.kind === 'outro') { if (left === 'stay') return; host.leave(); }
    }
    /** Plays the voice once: its loop is 1× until it ends (then it gets its own loop back). */
    function playOnce(kind, v) {
      cur = { kind, v, loop: v.loop, started: false };
      v.loop = 0; v.plays = 0;
      if (v.el) v.el.loop = false;
      if (kind === 'outro') host.fadeAll(v);
      if (!sounding(v)) host.start(v);
      if (v.card) v.paint();
      clearInterval(watch);
      watch = setInterval(() => {
        if (!cur) return;
        if (sounding(cur.v)) { cur.started = true; }
        // Over: played through, stopped, faded out (paused stays the troubadour's).
        else if (cur.started && cur.v.state !== 'paused') { finish('end'); return; }
        // Another music taken during the outro: the troubadour stays.
        if (kind === 'outro' && host.voices().some((o) => o !== cur.v && isMusic(o) && o.state === 'playing')) {
          finish('stay');
        }
      }, 250);
    }
    /** The card: the gold ring counts 5 s and the music plays; Play now; Skip (the intro) or Leave now (the outro). */
    function offer(kind, v) {
      close();
      const doc = global.document;
      box = doc.createElement('div');
      box.className = 't-oneshot';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', kind === 'intro' ? 'Intro of the story' : 'Outro of the story');
      const R = 27, C = (2 * Math.PI * R).toFixed(1);
      box.innerHTML = `<button type="button" class="os-go" style="--os-s:${WAIT}s;--os-c:${C}" aria-label="Play ${esc(v.sound.name)} now" title="Play it now">`
        + `<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="trk" cx="32" cy="32" r="${R}"/><circle class="ring" cx="32" cy="32" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>`
        + '<span class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/></svg></span></button>'
        + `<div class="os-txt"><small>${kind === 'intro' ? 'Intro' : 'Outro'}</small><b>${esc(v.sound.name)}</b><span class="os-clock"></span></div>`
        + `<button type="button" class="os-skip">${kind === 'intro' ? 'Skip' : 'Leave now'}</button>`;
      doc.body.append(box);
      const clock = box.querySelector('.os-clock');
      let left = WAIT;
      const paint = () => { clock.textContent = kind === 'intro' ? `Plays in ${left} s` : `Plays in ${left} s, then the table closes`; };
      paint();
      const go = () => { if (!box) return; close(); playOnce(kind, v); };
      box.querySelector('.os-go').addEventListener('click', go);
      box.querySelector('.os-skip').addEventListener('click', () => { close(); if (kind === 'outro') host.leave(); });
      tick = setInterval(() => {
        left -= 1;
        // A music started meanwhile: the intro gives way.
        if (kind === 'intro' && host.voices().some((o) => isMusic(o) && o !== v && sounding(o))) { close(); return; }
        if (left > 0) paint();
      }, 1000);
      done = setTimeout(go, WAIT * 1000);
      global.requestAnimationFrame(() => box && box.classList.add('counting'));
    }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    return {
      intro() { if (!host.on()) return; const v = find('intro'); if (v) offer('intro', v); },
      outro() {
        if (!host.on()) return null;
        const v = find('outro');
        if (!v || v.state === 'playing' || v.state === 'error') return null;
        return v;
      },
      offerOutro(v) { offer('outro', v); },
      leaving: () => !!(cur && cur.kind === 'outro'),
      reset() { close(); clearInterval(watch); watch = 0; restore(); cur = null; },
    };
  }

  /** Marks a music of the story as its intro or outro (or neither): one intro and one outro per story. */
  function setRole(chapters, s, role) {
    if (role) chapters.forEach((c) => (c.music || []).forEach((o) => { if (o !== s && roleOf(o) === role) { if (o.extra) delete o.extra.role; delete o.role; } }));
    s.extra = s.extra || {};
    delete s.role;
    if (role) s.extra.role = role; else delete s.extra.role;
  }

  /** The row of a music's card in a builder: "Opens or closes the story": None, Intro, Outro. */
  function roleRow(doc, chapters, s, onChange) {
    const row = doc.createElement('label');
    row.className = 'row edrole';
    const t = doc.createElement('span'); t.className = 'vl'; t.textContent = 'Intro or outro';
    const sel = doc.createElement('select');
    sel.setAttribute('aria-label', `${s.name}: intro or outro of the story`);
    sel.title = 'The intro is offered as the story opens at the table, the outro before leaving it. Both play once.';
    [['', 'Neither'], ['intro', 'Intro of the story'], ['outro', 'Outro of the story']].forEach(([v, n]) => { const o = doc.createElement('option'); o.value = v; o.textContent = n; sel.append(o); });
    sel.value = roleOf(s);
    sel.addEventListener('mousedown', (e) => e.stopPropagation());
    sel.onchange = () => { setRole(chapters, s, sel.value); if (onChange) onChange(); };
    row.append(t, sel);
    return row;
  }

  global.TroubadourIntro = { define, roleOf, setRole, roleRow, ROLES };
})(window);
