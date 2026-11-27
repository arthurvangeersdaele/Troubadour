/* Troubadour settings rows: the rows every Troubadour app's settings share, written once, in one order, with one
 * wording (261118_troubadour_unifier.md, P3). A page leaves a placeholder where they go:
 *
 *   <div data-t-rows="fadein fade random life crossfade silence even silent"></div>
 *
 * and this script, loaded before the app's own script, puts the rows there. Each row keeps the element ids the
 * apps already read (opt-awake, fade-pick...), so the apps' code does not change. A row name may carry a class
 * for that page: "silent.ios-only". Rows are always laid out in the order of ORDER, whatever the placeholder says.
 */
(function () {
  'use strict';

  const seg = (id, label, opts) => `<div class="seg small" id="${id}" role="radiogroup" aria-label="${label}">${opts.map(([v, t]) => `<button type="button" role="radio" data-v="${v}">${t}</button>`).join('')}</div>`;
  const FADES = [[0, 'Off'], [500, '0.5 s'], [1000, '1 s'], [2000, '2 s'], [4000, '4 s']];
  const toggle = (id, title, note) => (cls) => `<label class="row-set toggle${cls}"><span>${title}<small>${note}</small></span><input type="checkbox" id="${id}"><i></i></label>`;
  const row = (inner, extra = '') => (cls) => `<div class="row-set${cls}"${extra}>${inner}</div>`;
  const VOLS = [['hidden', 'Hidden'], ['simple', 'Simple'], ['full', 'Full']];

  const ROWS = {
    /* Screen */
    awake: toggle('opt-awake', 'Keep screen awake', 'While you play, so the sound never stops with the screen'),
    /* Player interface */
    cardvolume: (cls) => `<p class="muted small set-note${cls}">Hidden keeps the cards narrow. Simple adds two buttons that move the volume by 25&nbsp;% steps, smoothly over 2&nbsp;s. Full adds a slider. Each sound starts at the volume it was given in its builder.</p>`
      + [['music', 'Music'], ['ambience', 'Ambiances'], ['events', 'Events']].map(([z, t]) => `<div class="row-set${cls}"><span>${t}</span>${seg(`vol-${z}`, `Volume on the ${t} cards`, VOLS).replace('<div class="seg small"', `<div class="seg small" data-zone="${z}"`)}</div>`).join(''),
    /* Playback */
    fadein: row(`<span>Fade-in on Play<small>Music and ambiances rise over this time when you start them; replays and events start at once</small></span>${seg('fadein-pick', 'Fade-in duration', FADES)}`),
    fade: row(`<span>Fade-out on stop<small>When a sound pauses or stops</small></span>${seg('fade-pick', 'Fade-out duration', FADES)}`),
    random: row('<span>Random sounds<small id="random-note">Plays again after a pause of 0.5&nbsp;s to 5&nbsp;s</small></span><div class="stepper" role="group" aria-label="Longest pause of random sounds"><button type="button" id="random-less" aria-label="Shorter">‹</button><b id="random-val">5 s</b><button type="button" id="random-more" aria-label="Longer">›</button></div>'),
    life: (cls) => toggle('opt-life', 'Living ambiances', 'Each ambiance drifts up to 10 above or below its volume, now and then, so it feels alive')(cls)
      + row('<span>Drift every<small id="life-note">A new volume about every 6&nbsp;s</small></span><div class="stepper" role="group" aria-label="Time between two drifts"><button type="button" id="life-less" aria-label="Shorter">‹</button><b id="life-val">6 s</b><button type="button" id="life-more" aria-label="Longer">›</button></div>', ' id="life-row"')(cls),
    crossfade: toggle('opt-crossfade', 'Crossfade music tracks', 'Starting a track fades out the one playing'),
    intro: toggle('opt-intro', 'Intro and outro', 'A story\'s intro is offered as it opens, its outro before you leave: each plays once, and the outro fades every other sound out'),
    silence: toggle('opt-silence', 'Silence between chapters', 'Opening another chapter fades out the sounds of the previous one over 4 s'),
    even: toggle('opt-even', 'Even out the loudness', 'Every music, ambiance and event sits at the level of its kind, so no sound jumps out or gets lost'),
    silent: toggle('opt-silent', 'Ignore silent mode', 'Sounds still play when your iPhone or iPad is set to silent (the side switch or Control Center)'),
  };
  const ORDER = Object.keys(ROWS);

  document.querySelectorAll('[data-t-rows]').forEach((slot) => {
    const want = slot.dataset.tRows.trim().split(/\s+/).map((w) => { const [name, ...cls] = w.split('.'); return { name, cls: cls.length ? ' ' + cls.join(' ') : '' }; });
    want.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
    const html = want.map(({ name, cls }) => (ROWS[name] ? ROWS[name](cls) : '')).join('');
    const box = document.createElement('div');
    box.innerHTML = html;
    slot.replaceWith(...box.childNodes);
  });
})();
