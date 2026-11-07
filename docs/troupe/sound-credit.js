/* Troubadour: the locked identity of a sound (its "sound" block, TROUBADOUR_FORMAT.md), shown and filled in
 * by the Story builder, its sound library and the Recueil.
 *
 * A sound is known by the SHA-256 of its bytes. Once a sound is in the Recueil, its origin (source, author,
 * licence) and the troubadour who brought it are locked: the Recueil check refuses any change. Only its name
 * stays free, and the Recueil shows every name troubadours gave it. */
(() => {
  'use strict';
  const LICENCES = ['CC0', 'Public domain', 'CC BY 3.0', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0', 'OGA-BY 3.0',
    'GNU GPL', 'GNU GPL v2+', 'GNU GPL v3', 'GNU GPL v3+', 'BSD'];
  const LICENCE_URL = {
    'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
    'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
    'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'OGA-BY 3.0': 'https://static.opengameart.org/OGA-BY-3.0.txt',
    'GNU GPL': 'https://www.gnu.org/licenses/gpl-3.0.html',
    'GNU GPL v2+': 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html',
    'GNU GPL v3': 'https://www.gnu.org/licenses/gpl-3.0.html',
    'GNU GPL v3+': 'https://www.gnu.org/licenses/gpl-3.0.html',
    'BSD': 'https://opensource.org/license/bsd-3-clause',
  };
  const BASE = new URL('../recueil/', document.currentScript ? document.currentScript.src : location.href).href;
  const ICON_X = '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  const INFO = '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>';

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const link = (href, text) => {
    if (!/^https?:\/\//.test(href || '')) return document.createTextNode(text);
    const a = el('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a;
  };

  /** The id of a sound: the first 16 hex digits of the SHA-256 of its bytes (as the Recueil check computes it). */
  async function idOf(blob) {
    const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  let reg = null;
  /** The Recueil's sounds by id (docs/recueil/sounds.json). */
  function registry() {
    if (!reg) {
      reg = fetch(`${BASE}sounds.json`, { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((d) => new Map((d.sounds || []).map((x) => [x.id, x])))
        .catch((e) => { reg = null; throw e; });
    }
    return reg;
  }

  /** The "sound" block a sound of the library brings into a story. */
  function blockOf(x) {
    const b = { id: x.id, origin: JSON.parse(JSON.stringify(x.origin || [])) };
    if (x.edited) b.edited = true;
    if (x.parent) b.parent = x.parent;
    if (x.brought) b.brought = Object.assign({}, x.brought);
    return b;
  }
  const hasOrigin = (block) => !!(block && Array.isArray(block.origin) && block.origin.length);

  /** One line for a list: "Wildfire Games, CC BY-SA 3.0". */
  function short(block) {
    if (!hasOrigin(block)) return '';
    const authors = [...new Set(block.origin.map((o) => o.author).filter(Boolean))];
    const lics = [...new Set(block.origin.map((o) => o.licence).filter(Boolean))];
    return [authors.join(', '), lics.join(', ')].filter(Boolean).join(', ');
  }

  /* ---------- the dialog ---------- */
  // A modal <dialog>: it opens above anything, even another open dialog (the sound picker of the iPhone app).
  function veil(cls) {
    document.getElementById('credit-dlg')?.remove();
    const d = document.createElement('dialog');
    d.id = 'credit-dlg';
    d.className = `forge credit ${cls || ''}`;
    const close = () => { if (d.open) d.close(); d.remove(); };
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('click', (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    });
    document.body.append(d);
    d.showModal();
    return { box: d, close };
  }
  function head(box, title, close) {
    const h = el('div', 'cr-head');
    const x = el('button', 'cr-close');
    x.type = 'button'; x.innerHTML = ICON_X; x.setAttribute('aria-label', 'Close'); x.onclick = close;
    h.append(el('h2', '', title), x);
    box.append(h);
  }

  /** The credits of a sound, read only. item: { name, origin, edited, parent, brought, names, variants } */
  function renderCredits(box, item) {
    const ul = el('ul', 'cred-src');
    (item.origin || []).forEach((o) => {
      const li = el('li');
      const from = el('div', 'cred-from');
      if (o.own) from.append('Recorded by its troubadour');
      else {
        if (o.project) from.append(`${o.project}: `);
        from.append(link(o.url, o.title || o.url || 'source'));
        if (o.original) { from.append(' ('); from.append(link(o.original, 'original')); from.append(')'); }
      }
      const who = el('div', 'cred-who');
      who.append(o.author || 'Unknown author', ', ');
      who.append(link(LICENCE_URL[o.licence] || '', o.licence || 'no licence'));
      li.append(from, who);
      ul.append(li);
    });
    box.append(el('h3', '', item.origin && item.origin.length > 1 ? 'Sources' : 'Source'), ul);
    if (item.edited) box.append(el('p', 'cred-note', 'Cut, mixed or filtered from its source: it stays under the licence of its source.'));
    const b = item.brought || {};
    if (b.troubadour) {
      const p = el('p', 'cred-note');
      p.append('Brought by ', el('b', '', b.troubadour), b.tale ? ` in ${b.tale}` : '', b.date ? `, ${b.date}` : '', '.');
      box.append(p);
    }
    const names = item.names || [];
    if (names.length) {
      box.append(el('h3', '', 'Known in the Recueil as'));
      const nl = el('ul', 'cred-names');
      names.forEach((n) => { const li = el('li'); li.append(el('b', '', n.name), ` in ${n.tale}, by ${n.bard}`); nl.append(li); });
      box.append(nl);
    }
    if (item.variants && item.variants.length) {
      box.append(el('h3', '', 'Other versions'));
      const vl = el('ul', 'cred-names');
      item.variants.forEach((v) => { const li = el('li'); li.append(el('b', '', v.name), ` in ${v.tale}, by ${v.bard}`); vl.append(li); });
      box.append(vl);
    }
  }

  /** Read-only credits of a sound of the Recueil. */
  function show(item) {
    const { box, close } = veil();
    head(box, item.name || 'Sound', close);
    if (!hasOrigin(item)) { box.append(el('p', '', 'This sound does not say where it comes from yet.')); if (item.hint) box.append(el('p', '', item.hint)); }
    else renderCredits(box, item);
    const acts = el('div', 'acts');
    const ok = el('button', 'btn primary', 'Done'); ok.type = 'button'; ok.onclick = close;
    acts.append(ok);
    box.append(acts);
  }

  /** Lets a troubadour give the origin of a sound that is not in the Recueil yet. onSave({ origin, edited }). */
  function edit(name, block, onSave) {
    const { box, close } = veil('edit');
    head(box, name || 'Sound', close);
    box.append(el('p', 'cred-lead', 'Where does this sound come from? The Recueil only takes tales whose every sound names its source, its author and its licence. Once the tale is in the Recueil, this is locked: the sound keeps its credits wherever it goes, whatever name it is given.'));
    const list = el('div', 'cred-rows');
    box.append(list);
    const rows = [];
    const addRow = (o) => {
      o = o || {};
      const r = el('fieldset', 'cred-row');
      r.innerHTML = `<label class="field"><span>Link to the source</span><input type="url" class="c-url" placeholder="https://freesound.org/…" autocomplete="off" spellcheck="false"></label>
        <label class="field"><span>File or title</span><input class="c-title" maxlength="120" autocomplete="off"></label>
        <label class="field"><span>Author</span><input class="c-author" maxlength="160" autocomplete="off"></label>
        <label class="field"><span>Licence</span><select class="c-lic"><option value="">Choose…</option>${LICENCES.map((l) => `<option>${l}</option>`).join('')}</select></label>
        <label class="cred-own"><input type="checkbox" class="c-own"> I recorded or made it myself</label>`;
      const q = (c) => r.querySelector(c);
      q('.c-url').value = o.url || ''; q('.c-title').value = o.title || ''; q('.c-author').value = o.author || '';
      q('.c-lic').value = LICENCES.includes(o.licence) ? o.licence : ''; q('.c-own').checked = !!o.own;
      const paintOwn = () => { q('.c-url').closest('label').hidden = q('.c-own').checked; };
      q('.c-own').onchange = paintOwn; paintOwn();
      if (rows.length) {
        const rm = el('button', 'linkish cred-rm', 'Remove this source'); rm.type = 'button';
        rm.onclick = () => { rows.splice(rows.indexOf(r), 1); r.remove(); };
        r.append(rm);
      }
      r.extra = { project: o.project, original: o.original };
      rows.push(r);
      list.append(r);
    };
    ((block && block.origin) || [{}]).forEach(addRow);
    const more = el('button', 'linkish', 'Add another source (a mix)'); more.type = 'button'; more.onclick = () => addRow();
    const ed = el('label', 'cred-own');
    ed.innerHTML = '<input type="checkbox" class="c-edited"> I cut, mixed or filtered it';
    ed.querySelector('input').checked = !!(block && block.edited);
    const err = el('p', 'cred-err');
    const acts = el('div', 'acts');
    const save = el('button', 'btn primary', 'Save the source'); save.type = 'button';
    const cancel = el('button', 'btn', 'Cancel'); cancel.type = 'button'; cancel.onclick = close;
    acts.append(save, cancel);
    box.append(more, ed, err, acts);
    save.onclick = () => {
      const origin = [];
      const problems = [];
      rows.forEach((r, i) => {
        const q = (c) => r.querySelector(c);
        const o = { title: q('.c-title').value.trim(), url: q('.c-url').value.trim(), author: q('.c-author').value.trim(), licence: q('.c-lic').value };
        if (q('.c-own').checked) { o.own = true; delete o.url; }
        if (r.extra.project) o.project = r.extra.project;
        if (r.extra.original) o.original = r.extra.original;
        const n = rows.length > 1 ? ` (source ${i + 1})` : '';
        if (!o.own && !/^https?:\/\//.test(o.url)) problems.push(`A link to the source${n}.`);
        if (!o.author) problems.push(`Its author${n}.`);
        if (!o.licence) problems.push(`Its licence${n}.`);
        Object.keys(o).forEach((k) => { if (o[k] === '') delete o[k]; });
        origin.push(o);
      });
      if (problems.length) { err.textContent = `Still missing: ${problems.join(' ')}`; return; }
      onSave({ origin, edited: ed.querySelector('input').checked });
      close();
    };
    setTimeout(() => list.querySelector('input')?.focus(), 30);
  }

  window.TroubadourCredit = { LICENCES, INFO, idOf, registry, blockOf, hasOrigin, short, show, edit };
})();
