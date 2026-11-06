/* Recueil: the shared library of .troubadour files, listed from ../recueil/index.json (built by a GitHub Action). */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const list = $('#tales');
  const chev = '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function size(bytes) {
    if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const mb = bytes / 1048576;
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  }

  let tales = [];

  function render(filter) {
    list.textContent = '';
    const q = (filter || '').trim().toLowerCase();
    const shown = tales.filter((t) => !q || [t.title, t.bard, t.description, ...(t.chapters || [])].join(' ').toLowerCase().includes(q));
    if (!tales.length) {
      list.append(el('li', 'empty-rec', 'The Recueil is still blank, waiting for its first tale. Will it be yours?'));
      return;
    }
    if (!shown.length) {
      list.append(el('li', 'empty-rec', 'No tale answers to that name.'));
      return;
    }
    shown.forEach((t) => {
      const li = el('li', 'tale');
      const head = el('button');
      head.type = 'button';
      head.setAttribute('aria-expanded', 'false');
      const n = (t.chapters || []).length;
      head.append(el('span', 't', t.title), el('span', 'tc', `${n} chapter${n === 1 ? '' : 's'}`), el('span', 'ts', size(t.size)));
      head.insertAdjacentHTML('beforeend', chev);
      const inside = el('div', 'inside');
      const by = el('p', 'by');
      const sign = [t.bard ? `by ${t.bard}` : '', t.revision > 1 ? `revision ${t.revision}` : ''].filter(Boolean).join(', ');
      by.textContent = [sign, t.description || ''].filter(Boolean).join('. ');
      if (by.textContent) inside.append(by);
      const ol = el('ol');
      (t.chapters || []).forEach((c) => ol.append(el('li', '', c)));
      const acts = el('div', 'acts');
      const href = `../recueil/${encodeURIComponent(t.file)}`;
      const play = el('a', 'btn primary pc-only', 'Play');
      play.href = `../play/?troubadour=${encodeURIComponent(href)}`;
      const dl = el('a', 'btn dl', 'Download');
      dl.href = href;
      dl.setAttribute('download', t.file);
      const open = el('a', 'btn pc-only', 'Open in the builder');
      open.href = `builder.html?open=${encodeURIComponent(href)}`;
      const credits = el('button', 'btn', 'Sounds and credits');
      credits.type = 'button';
      credits.setAttribute('aria-expanded', 'false');
      const box = el('div', 'tale-sounds');
      box.hidden = true;
      credits.onclick = () => {
        box.hidden = !box.hidden;
        credits.setAttribute('aria-expanded', String(!box.hidden));
        if (!box.hidden && !box.dataset.done) fillSounds(box, t);
      };
      acts.append(play, dl, open, credits);
      inside.append(ol, acts, box);
      head.onclick = () => {
        const on = !li.hasAttribute('open');
        li.toggleAttribute('open', on);
        head.setAttribute('aria-expanded', String(on));
      };
      li.append(head, inside);
      list.append(li);
    });
  }

  /* Every sound of a tale, once, under the name(s) this tale gives it, with its locked credits (sound-credit.js). */
  function fillSounds(box, t) {
    const C = window.TroubadourCredit;
    box.textContent = '';
    box.append(el('p', 'tale-wait', 'Fetching the sounds…'));
    C.registry().then((reg) => {
      box.dataset.done = '1';
      box.textContent = '';
      const mine = [...reg.values()].filter((x) => (x.tales || [x.tale]).includes(t.title));
      if (!mine.length) { box.append(el('p', 'tale-wait', 'No sound of this tale is in the library yet.')); return; }
      const ROW = { music: 'Music', ambience: 'Ambiances', events: 'Events', soundbox: 'Soundbox' };
      const ul = el('ul', 'snd-list');
      ['music', 'ambience', 'events', 'soundbox'].forEach((row) => {
        const here = mine.filter((x) => (x.rows || [x.row])[0] === row);
        if (!here.length) return;
        ul.append(el('li', 'snd-row', ROW[row]));
        here.sort((a, b) => a.name.localeCompare(b.name)).forEach((x) => {
          const names = [...new Set((x.names || []).filter((n) => n.tale === t.title).map((n) => n.name))];
          const others = [...new Set((x.names || []).filter((n) => n.tale !== t.title).map((n) => n.name))].filter((n) => !names.includes(n));
          const li = el('li', 'snd');
          const txt = el('div', 'snd-t');
          txt.append(el('b', '', names.join(', ') || x.name), el('small', '', C.short(x) || 'No source'));
          if (others.length) txt.append(el('small', 'aka', `Also known as ${others.join(', ')}`));
          if (x.brought && x.brought.tale && x.brought.tale !== t.title) txt.append(el('small', 'aka', `Brought by ${x.brought.troubadour} in ${x.brought.tale}`));
          const info = el('button', 'cut src');
          info.type = 'button';
          info.innerHTML = C.INFO;
          info.setAttribute('aria-label', `Credits of ${names[0] || x.name}`);
          info.onclick = () => C.show(Object.assign({}, x, { name: names[0] || x.name }));
          li.append(txt, info);
          ul.append(li);
        });
      });
      box.append(ul);
    }, () => {
      box.textContent = '';
      box.append(el('p', 'tale-wait', 'The sounds could not be fetched. Check your connection and try again.'));
    });
  }

  fetch('../recueil/index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { tales: [] }))
    .catch(() => ({ tales: [] }))
    .then((data) => {
      tales = (data.tales || []).slice().sort((a, b) => a.title.localeCompare(b.title));
      $('#seek').hidden = tales.length < 6;
      render();
    });
  $('#q').addEventListener('input', (e) => render(e.target.value));
})();
