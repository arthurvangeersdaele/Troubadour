/* The main menu of La Troupe's builders on a computer (Ballade builder, Map builder), drawn after the Story builder:
 * a create card, an import zone (drop a file or browse), then the history of what this computer keeps, newest first,
 * each with Edit, Play, Export and More. The page around it gives the La Troupe bar (smart back, page name, actions).
 *
 *   TroupeBuilderMenu.render(host, {
 *     create: { title, sub, onClick },           the main way to start
 *     more: [{ title, sub, tag, onClick }],      other ways to start (discovery tales...)
 *     drop: { text, accept, onFile, onBrowse },  the import zone
 *     history: { title, empty, items: [{ title, meta, updated, cover, onEdit, onPlay, onExport, exportLabel, onMore }] }
 *   })
 */
(function (g) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    plus: svg('<path d="M12 5v14M5 12h14"/>', 22),
    drop: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>', 26),
    edit: svg('<path d="M13 11 4 20"/><rect x="8.5" y="5.75" width="14" height="5.5" rx="1.4" fill="currentColor" transform="rotate(45 15.5 8.5)"/>', 16),
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    share: svg('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>', 16),
    more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>', 18),
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function button(cls, html, label, fn) {
    const b = el('button', cls); b.type = 'button'; b.innerHTML = html;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  /** "Today, 14:05", "Yesterday", "3 days ago", or the date. */
  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const day = 86400000, start = new Date(); start.setHours(0, 0, 0, 0);
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d >= start) return `Today, ${t}`;
    if (d >= start - day) return `Yesterday, ${t}`;
    const n = Math.floor((start - d) / day) + 1;
    if (n < 7) return `${n} days ago`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }

  function head(title, n) {
    const h = el('h3', 'bm-h');
    h.append(el('span', '', title));
    if (n) h.append(el('span', 'bm-n', String(n)));
    return h;
  }

  function render(host, o) {
    host.textContent = '';
    const root = el('div', 'bm');
    if (o.hero) {
      const hero = el('header', 'bm-hero');
      if (o.hero.mark) { const m = el('span', 'bm-mark'); m.innerHTML = o.hero.mark; hero.append(m); }
      const ht = el('div', 'bm-hero-t');
      ht.append(el('p', 'bm-kicker', 'La Troupe des Troubadours'), el('h1', '', o.hero.title), el('p', 'bm-lead', o.hero.lead));
      hero.append(ht);
      root.append(hero);
    }

    // 1. Start: create, or import
    const top = el('section', 'bm-top');
    const create = el('button', 'bm-create');
    create.type = 'button';
    create.innerHTML = `<span class="bm-plus">${I.plus}</span>`;
    const ct = el('span', 'bm-txt'); ct.append(el('b', '', o.create.title), el('span', '', o.create.sub));
    create.append(ct);
    create.addEventListener('click', o.create.onClick);

    const drop = el('div', 'bm-drop');
    drop.tabIndex = 0;
    drop.setAttribute('role', 'button');
    drop.setAttribute('aria-label', o.drop.text);
    drop.innerHTML = `<span class="bm-drop-i">${I.drop}</span>`;
    const dt = el('span', 'bm-txt'); dt.append(el('b', '', 'Import'));
    const line = el('span'); line.append(document.createTextNode(`${o.drop.text}, or `), el('u', '', 'browse'));
    dt.append(line); drop.append(dt);
    drop.addEventListener('click', o.drop.onBrowse);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.drop.onBrowse(); } });
    let depth = 0;
    drop.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { depth += 1; drop.classList.add('over'); } });
    drop.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('over'); });
    drop.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; depth = 0; drop.classList.remove('over'); if (f) { e.preventDefault(); e.stopPropagation(); o.drop.onFile(f); } });
    top.append(create, drop);
    root.append(top);

    if (o.more && o.more.length) {
      root.append(head(o.moreTitle || 'Discovery tales', o.more.length));
      const more = el('section', 'bm-more');
      o.more.forEach((m) => {
        const b = el('button', 'bm-tale'); b.type = 'button';
        if (m.tag) b.append(el('span', 'bm-tag', m.tag));
        b.append(el('b', '', m.title), el('span', '', m.sub));
        b.addEventListener('click', m.onClick);
        more.append(b);
      });
      root.append(more);
    }

    // 2. History
    const h = o.history;
    root.append(head(h.title, h.items.length));
    const list = el('section', 'bm-list');
    if (!h.items.length) list.append(el('p', 'bm-empty', h.empty));
    h.items.forEach((it) => {
      const row = el('article', 'bm-row');
      const cov = el('span', 'bm-cover');
      if (it.cover) cov.append(it.cover);
      const txt = el('div', 'bm-rtxt');
      txt.append(el('b', '', it.title), el('span', 'bm-meta', it.meta));
      const w = when(it.updated);
      if (w) txt.append(el('span', 'bm-when', `Last changed ${w.charAt(0).toLowerCase()}${w.slice(1)}`));
      const acts = el('div', 'bm-acts');
      acts.append(
        button('bm-btn main', `${I.edit}<span>Edit</span>`, `Edit ${it.title}`, it.onEdit),
        button('bm-btn', `${I.play}<span>Play</span>`, `Play ${it.title}`, it.onPlay),
        button('bm-btn', `${I.share}<span>${it.exportLabel || 'Export'}</span>`, `${it.exportLabel || 'Export'}: ${it.title}`, it.onExport),
        button('bm-btn ico-only', I.more, `More: ${it.title}`, it.onMore),
      );
      row.append(cov, txt, acts);
      row.addEventListener('click', (e) => { if (!e.target.closest('button')) it.onEdit(); });
      list.append(row);
    });
    root.append(list);
    host.append(root);
  }

  g.TroupeBuilderMenu = { render, when };
})(window);
