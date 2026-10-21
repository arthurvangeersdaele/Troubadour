/* Troubadour Ballade: the editor, on a computer. Shapes every chapter of a story into steps:
 * up to three sounds side by side in a step, each played once, looped or at random, with its own offset,
 * trim and fades. Between two steps, a link says how the lower one starts: on the troubadour's tap (a gate,
 * which fades out what still plays above), when the sounds above end, or after a set time. Sentences under
 * every link and in the inspector say which sounds carry on and which stop. */
(function (global) {
  'use strict';

  const { $, el, ICON, toast, busy, idle, ask, deliver, audio, decode } = global.FlowUI;
  const F = global.TroubadourBallade;
  const MIME = 'application/x-troubadour-ballade';
  const ZCOL = { music: 'var(--music)', ambience: 'var(--amb)', events: 'var(--evt)', soundbox: 'var(--accent)' };
  const ZNAME = { music: 'Music', ambience: 'Ambiances', events: 'Events', soundbox: 'Soundbox' };

  const E = { rec: null, ch: 0, path: [], sel: null, tab: 'chapter', buffers: new Map(), blobs: null, preview: null, onLeave: null, onPlay: null, saveT: 0 };

  async function open(rec, opts = {}) {
    E.rec = rec;
    E.ch = Math.min(opts.chapter || 0, rec.story.chapters.length - 1);
    E.path = [];
    E.sel = null;
    E.onLeave = opts.onLeave; E.onPlay = opts.onPlay;
    E.blobs = await global.FlowDB.filesOf(rec);
    E.rec.lengths = E.rec.lengths || {};
    $('#fe-title').textContent = rec.story.title || 'Story';
    $('#fe-sub').textContent = `Ballade editor, revision ${rec.flow.revision || 0}, ${rec.flow.bard || ''}`;
    renderAll();
  }
  function close() { closeHelp(); stopPreview(); flush(); E.rec = null; E.buffers.clear(); E.blobs = null; }

  const chapter = () => E.rec.flow.chapters[E.ch];
  const validC = (c) => (c && Array.isArray(c.answers) && c.answers.length ? c : null);
  /** The list of steps a path leads to: the chapter itself ([]), or a way, found by its answers from the top. */
  function holderAt(path) {
    let h = chapter();
    for (const k of path) { const c = validC(h.choice); if (!c || !c.answers[k]) return null; h = c.answers[k]; }
    return h;
  }
  /** What is being edited (E.path): the chapter's start, or a way, however deep. */
  const holder = () => { const h = holderAt(E.path); if (h) return h; E.path = []; return chapter(); };
  /** The choice at the end of the list being edited. */
  const choice = () => validC(holder().choice);
  /** The choice the way being edited comes from, and its answer. */
  const parentChoice = () => (E.path.length ? validC(holderAt(E.path.slice(0, -1)).choice) : null);
  const wayLabel = (a, k) => (a && a.label) || `Way ${k + 1}`;
  const steps = () => { const h = holder(); h.steps = h.steps || []; return h.steps; };
  const samePath = (p, q) => p.length === q.length && p.every((v, i) => v === q[i]);
  /** Opens a list of steps in the cascade. */
  function goTo(path) { E.path = path; E.sel = null; closeHelp(); stopPreview(); renderAll(); $('#fe-main').scrollTop = 0; }

  /* ---------- Saving ---------- */
  function changed(redraw = true) {
    const st = steps();
    if (st[0]) st[0].gate = true;
    $('#fe-saved').textContent = 'Saving…';
    clearTimeout(E.saveT);
    E.saveT = setTimeout(flush, 500);
    if (redraw) { renderSteps(); renderInspector(); renderChapters(); renderSounds(); }
  }
  async function flush() {
    clearTimeout(E.saveT);
    if (!E.rec) return;
    try { await global.FlowDB.put(E.rec); $('#fe-saved').textContent = 'Saved on this computer'; } catch (e) { $('#fe-saved').textContent = 'Not saved'; toast(`Could not save: ${e.message || e}`); }
  }

  /* ---------- Lengths and preview ---------- */
  async function buffer(file) {
    if (E.buffers.has(file)) return E.buffers.get(file);
    const blob = E.blobs.get(file);
    if (!blob) return null;
    const b = await decode(blob);
    E.buffers.set(file, b);
    if (!E.rec.lengths[file]) { E.rec.lengths[file] = Math.round(b.duration * 10) / 10; changed(false); }
    return b;
  }
  const lengthOf = (file) => E.rec.lengths[file] || null;

  function stopPreview() {
    if (E.preview) { try { E.preview.src.stop(); } catch (e) { /* done */ } E.preview.btn && E.preview.btn.classList.remove('on'); E.preview = null; }
  }
  /** Plays a sound (or a card, with its trim, length and fades) in the headphones of the bard. */
  async function preview(file, card, btn) {
    const same = E.preview && E.preview.key === (card ? card : file);
    stopPreview();
    if (same) return;
    const b = await buffer(file);
    if (!b) return;
    const { ctx, master } = audio(true);
    const src = ctx.createBufferSource();
    src.buffer = b;
    const g = ctx.createGain();
    const t = ctx.currentTime + 0.03;
    if (card) {
      const start = Math.min(card.start, b.duration - 0.05);
      // A loop that holds is heard for 30 s; a random sound plays once.
      const loop = card.play === 'loop';
      const dur = loop ? (card.hold ? 30 : card.duration) : Math.min(card.duration, b.duration - start);
      if (loop) { src.loop = true; src.loopStart = start; src.loopEnd = b.duration; }
      const fi = Math.min(card.fadeIn, dur); const fo = Math.min(card.fadeOut, dur - fi);
      g.gain.setValueAtTime(fi ? 0 : card.volume, t);
      if (fi) g.gain.linearRampToValueAtTime(card.volume, t + fi);
      if (fo) { g.gain.setValueAtTime(card.volume, t + dur - fo); g.gain.linearRampToValueAtTime(0, t + dur); }
      src.start(t, start); src.stop(t + dur);
    } else { g.gain.value = 0.75; src.start(t); }
    src.connect(g).connect(master);
    E.preview = { src, key: card || file, btn };
    if (btn) btn.classList.add('on');
    src.onended = () => { if (E.preview && E.preview.src === src) stopPreview(); };
    renderSounds(false);
  }

  /* ---------- Help: a (?) next to everything that needs a word ---------- */
  const HELP = {
    chapter: ['How a chapter plays', `
      <p>A chapter is a list of <b>steps</b>, played from top to bottom. A step plays up to three sounds side by side.</p>
      <p>Between two steps, you choose how the next one starts:</p>
      <ul>
        <li><b>On my tap</b>: a <b>gate</b>. The wire stops and waits for you to tap Go at the table.</li>
        <li><b>When the sounds end</b>: the next step follows on its own, as soon as the sounds of the step above are over.</li>
        <li><b>After a set time</b>: the next step follows on its own after so many seconds, even if the sounds above go on.</li>
      </ul>
      <p>The steps between two gates form one scene. Its sounds overlap freely. <b>Tapping a gate ends the scene</b>: everything still playing above fades out, and the step below starts.</p>`],
    link: ['How the next step starts', `
      <p><b>On my tap</b> puts a gate here. The wire waits for you, however long it takes. When you tap Go, every sound still playing above <b>fades out</b> (the fade length is in Settings), then the step below starts.</p>
      <p><b>When the sounds end</b>: the step below starts as soon as the sounds of the step above that end on their own are over. Loops and random sounds that last until the next gate are not waited for: they go on under the next step.</p>
      <p><b>After a set time</b>: the step below starts so many seconds after the step above began. Sounds still playing then are <b>not cut</b>: they carry on under it.</p>
      <p>The sentence under these buttons always says which sounds stop and which carry on.</p>`],
    plays: ['How a sound plays', `
      <p><b>Once</b>: the sound plays one time, whole or the part you set, then stops on its own.</p>
      <p><b>Loop</b>: the sound repeats without a break. It stops at the <b>next gate</b> (when you tap Go, pick an answer or leave the chapter), or after the time you set.</p>
      <p><b>Random</b>: the sound plays, then waits a random pause, then plays again, and so on. Birds, drops, distant thunder. It goes on until the <b>next gate</b>.</p>
      <p>A sound that lasts until the next gate never holds up the wire: the next step does not wait for it.</p>`],
    starts: ['When the sound starts', `
      <p>Seconds after the start of its step. 0 starts it with the step; 5 lets the step begin, then brings it in five seconds later.</p>
      <p>At the table, you can always start a sound earlier by tapping the bead on its wire.</p>`],
    fate: ['What happens to this sound', `
      <p>This sentence follows the sound through the chapter: when it starts, whether the next steps begin while it plays, and what stops it.</p>
      <p>Only a <b>gate</b> (your tap), the <b>choice</b> or the end of the chapter cuts a sound. A step that follows on its own never does.</p>`],
    choice: ['A choice at the end of the chapter', `
      <p>The chapter can end on a question for the table, with two or three answers. It is a <b>silver gate</b>.</p>
      <p>The steps <b>before the choice</b> play first. Then the wire stops and shows the answers. You tap the one your players picked: its <b>way</b>, a list of steps of its own, plays and ends the chapter.</p>
      <p>Picking an answer works like a gate: everything still playing fades out, and the first step of the way starts. Ways never join again.</p>
      <p>A way can end on a choice of its own, and its answers on choices of theirs, as deep as your story goes.</p>
      <p>To edit a way, use its button under the question, or the map of ways on the left.</p>`],
    ways: ['The ways of a chapter', `
      <p>Every list of steps of the chapter, as a tree. <b>Chapter start</b> is the list that plays first. Under each <span class="fe-pop-fork">question</span> come its answers, each with its own steps, and maybe a question of its own.</p>
      <p>Click a line to open it in the cascade. The number is how many steps it holds. The ways that lead to the one open are marked in silver.</p>
      <p>At the table, only the ways actually picked are drawn on the wire, one after the other.</p>`],
  };
  let pop = null;
  function closeHelp() { if (pop) { pop.remove(); pop = null; } }
  function help(key) {
    const b = el('button', 'fe-help');
    b.type = 'button';
    b.innerHTML = ICON.help;
    b.setAttribute('aria-label', `Help: ${HELP[key][0]}`);
    b.title = HELP[key][0];
    b.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      const again = pop && pop.dataset.key === key;
      closeHelp();
      if (again) return;
      pop = el('div', 'fe-pop');
      pop.dataset.key = key;
      pop.setAttribute('role', 'dialog');
      const h = el('div', 'fe-pop-h');
      h.append(el('b', '', HELP[key][0]));
      const x = el('button', 'fe-x'); x.type = 'button'; x.innerHTML = ICON.x; x.setAttribute('aria-label', 'Close');
      x.addEventListener('click', closeHelp);
      h.append(x);
      const body = el('div', 'fe-pop-b');
      body.innerHTML = HELP[key][1];
      pop.append(h, body);
      pop.addEventListener('click', (ev) => ev.stopPropagation());
      document.body.append(pop);
      const r = b.getBoundingClientRect();
      const w = pop.offsetWidth, hgt = pop.offsetHeight;
      const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
      const below = r.bottom + 8 + hgt < innerHeight - 8;
      pop.style.left = `${left}px`;
      pop.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - 8 - hgt)}px`;
    });
    return b;
  }

  /* ---------- Cards ---------- */
  function newCard(snd) {
    return F.card(Object.assign({ zone: snd.zone }, snd), lengthOf(snd.file));
  }
  function addSound(snd, at, into) {
    const st = steps();
    const c = newCard(snd);
    if (into != null) {
      if (st[into].cards.length >= F.LANES) { toast(`A step holds ${F.LANES} sounds side by side at most.`); return; }
      st[into].cards.push(c);
      E.sel = { i: into, k: st[into].cards.length - 1 };
    } else {
      const pos = at == null ? st.length : at;
      st.splice(pos, 0, { title: '', gate: true, next: null, cards: [c] });
      E.sel = { i: pos, k: 0 };
    }
    changed();
    if (!lengthOf(snd.file)) buffer(snd.file).then(() => { Object.assign(c, F.cleanCard(c, lengthOf(snd.file))); renderAll(); }).catch(() => {});
  }
  function moveCard(from, toStep, toIndex, newStepAt) {
    const st = steps();
    const [c] = st[from.i].cards.splice(from.k, 1);
    if (newStepAt != null) {
      st.splice(newStepAt, 0, { title: '', gate: true, next: null, cards: [c] });
      E.sel = { i: newStepAt, k: 0 };
    } else {
      const i = toStep;
      if (st[i].cards.length >= F.LANES) { st[from.i].cards.splice(from.k, 0, c); toast(`A step holds ${F.LANES} sounds side by side at most.`); return; }
      const k = toIndex == null ? st[i].cards.length : Math.min(toIndex, st[i].cards.length);
      st[i].cards.splice(k, 0, c);
      E.sel = { i, k };
    }
    changed();
  }

  /* ---------- Who plays when: the sentences that explain the cascade ---------- */
  const q = (c) => `<b>${escapeHtml(c.name)}</b>`;
  const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  const stepName = (st, i) => `step ${i + 1}${st[i] && st[i].title ? ` (${escapeHtml(st[i].title)})` : ''}`;

  /** The step that opens the scene step i belongs to (a scene runs from a gate to the next one). */
  function sceneOf(st, i) { let g = i; while (g > 0 && !st[g].gate) g--; return g; }
  /** The first gate after step i, or -1 when the scene runs to the end of the list. */
  function gateAfter(st, i) { for (let j = i + 1; j < st.length; j++) if (st[j].gate) return j; return -1; }
  /** What ends the scene of step i, in words: the next gate, the choice, or the end of the chapter. */
  function sceneEnd(st, i) {
    const g = gateAfter(st, i);
    if (g >= 0) return `you tap the gate of ${stepName(st, g)}`;
    if (choice()) return 'you pick an answer of the choice';
    return 'you leave the chapter';
  }
  /** Sounds of the scene still playing when step i hands over to the next one. */
  function liveAfter(st, i) {
    const offs = F.runOffsets(st);
    const T = offs[i] + F.stepLength(st[i]);
    const out = [];
    for (let j = sceneOf(st, i); j <= i; j++) {
      st[j].cards.forEach((c) => {
        const end = c.hold ? Infinity : offs[j] + c.offset + c.duration;
        if (end > T + 0.05) out.push({ c, j, end, late: end - T });
      });
    }
    return { T, live: out };
  }
  /** The sound of step i that ends last, of those that end on their own. */
  function lastEnding(s) {
    let best = null;
    s.cards.forEach((c) => { if (!c.hold && (!best || c.offset + c.duration > best.offset + best.duration)) best = c; });
    return best;
  }

  /** Under a link: which sounds the next step finds still playing, and what becomes of them. */
  function linkSentence(st, i) {
    const nxt = st[i + 1];
    const { live } = liveAfter(st, i);
    if (nxt.gate) {
      if (!live.length) return `The wire waits here for your tap. Nothing above is still playing by then, so ${stepName(st, i + 1)} starts in silence.`;
      const holds = live.filter((x) => x.c.hold).map((x) => q(x.c));
      const ends = live.filter((x) => !x.c.hold).map((x) => q(x.c));
      let t = 'The wire waits here for your tap. When you tap Go, ';
      if (holds.length) t += `${list(holds)} ${holds.length > 1 ? 'fade' : 'fades'} out`;
      if (ends.length) t += `${holds.length ? ', and ' : ''}${list(ends)} ${ends.length > 1 ? 'fade' : 'fades'} out if still playing`;
      return `${t}.`;
    }
    const start = st[i].next != null ? `${stepName(st, i + 1)} starts ${secs(st[i].next)} s after ${stepName(st, i)} began` : (() => {
      const l = lastEnding(st[i]);
      return l ? `${stepName(st, i + 1)} starts as soon as ${q(l)} ends (${F.clock(l.offset + l.duration)} into ${stepName(st, i)})` : `${stepName(st, i + 1)} starts at once, with ${stepName(st, i)}`;
    })();
    if (!live.length) return `No tap needed: ${start}.`;
    const held = live.filter((x) => x.c.hold);
    return `No tap needed: ${start}. Nothing is cut: ${list(live.map((x) => q(x.c)))} ${live.length > 1 ? 'carry' : 'carries'} on under it.${held.length ? ` ${held.length === live.length ? (held.length > 1 ? 'They' : 'It') : list(held.map((x) => q(x.c)))} ${held.length > 1 ? 'go' : 'goes'} on until ${sceneEnd(st, i)}.` : ''}`;
  }

  /** The life of one card, in words. */
  function fateSentence(st, i, c) {
    const offs = F.runOffsets(st);
    const at = offs[i] + c.offset;
    const parts = [];
    parts.push(c.offset ? `Starts ${secs(c.offset)} s after ${stepName(st, i)} begins.` : `Starts with ${stepName(st, i)}.`);
    const end = c.hold ? Infinity : at + c.duration;
    // The steps of the same scene that begin while it still plays.
    const under = [];
    for (let j = i + 1; j < st.length && !st[j].gate; j++) if (offs[j] < end - 0.05 && offs[j] >= at - 0.05) under.push(j);
    if (under.length) parts.push(`${under.length > 1 ? `Steps ${under[0] + 1} to ${under[under.length - 1] + 1} begin` : `${stepName(st, under[0])[0].toUpperCase()}${stepName(st, under[0]).slice(1)} begins`} while it plays: it carries on under ${under.length > 1 ? 'them' : 'it'}.`);
    if (c.hold) parts.push(`${c.play === 'random' ? 'It comes back at random' : 'It loops'} until ${sceneEnd(st, i)}, then fades out.`);
    else {
      parts.push(`It ends on its own ${F.clock(c.duration)} later${c.play === 'loop' ? ', after looping' : ''}.`);
      let last = i; while (last + 1 < st.length && !st[last + 1].gate) last++;
      const sceneLen = offs[last] + F.stepLength(st[last]);
      if (end > sceneLen + 0.05) {
        const gA = gateAfter(st, last);
        const how = gA >= 0 ? `you tap the gate of ${stepName(st, gA)}` : choice() ? 'you pick an answer of the choice' : 'you leave the chapter';
        parts.push(`If ${how} before then, it fades out early.`);
      }
    }
    return parts.filter(Boolean).join(' ');
  }

  /* ---------- Drawing ---------- */
  function renderAll() { renderChapters(); renderSteps(); renderInspector(); renderSounds(); }

  function renderChapters() {
    const nav = $('#fe-chapters');
    nav.textContent = '';
    nav.append(el('h3', '', 'Chapters'));
    E.rec.story.chapters.forEach((c, i) => {
      const b = el('button', 'chap');
      b.type = 'button';
      b.setAttribute('aria-current', String(i === E.ch));
      const n = F.allSteps(E.rec.flow.chapters[i]).length;
      b.append(el('span', 'n', String(i + 1)), el('span', 't', c.title || `Chapter ${i + 1}`), el('small', 'fe-count', `${n} step${n === 1 ? '' : 's'}`));
      b.addEventListener('click', () => { E.ch = i; E.path = []; E.sel = null; stopPreview(); closeHelp(); renderAll(); $('#fe-main').scrollTop = 0; });
      nav.append(b);
    });
    const tree = waysTree();
    if (tree) nav.append(tree);
    const tools = el('div', 'fe-tools');
    const reset = el('button', 'btn small', 'Rebuild this chapter');
    reset.type = 'button';
    reset.title = 'Replace its steps with a first Ballade made from its sounds';
    reset.addEventListener('click', async () => {
      const ok = await ask('Rebuild this chapter?', 'Its steps, and its choice, are replaced by a first Ballade made from its sounds: music and ambiances together, then every other sound behind its own gate.', [{ label: 'Cancel', value: false }, { label: 'Rebuild', value: true, cls: 'primary' }]);
      if (!ok) return;
      E.rec.flow.chapters[E.ch] = F.defaultChapter(E.rec.story.chapters[E.ch], E.rec.lengths);
      E.sel = null; E.path = [];
      changed();
    });
    tools.append(reset);
    nav.append(tools);
  }

  const label = (s, i) => s.title || s.cards.map((c) => c.name).join(' + ') || `Step ${i + 1}`;
  function secs(v) { return Math.round(v * 10) / 10; }

  function dropZone(node, onDrop) {
    node.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); e.stopPropagation(); node.classList.add('over'); } });
    node.addEventListener('dragleave', () => node.classList.remove('over'));
    node.addEventListener('drop', (e) => {
      node.classList.remove('over');
      const raw = e.dataTransfer.getData(MIME);
      if (!raw) return;
      e.preventDefault(); e.stopPropagation();
      onDrop(JSON.parse(raw));
    });
  }

  function gap(at) {
    const g = el('div', `fe-gap${at >= steps().length ? ' end' : ''}`);
    g.append(el('span', '', at >= steps().length ? 'Drop a sound here: a new step at the end' : 'Drop here: a new step'));
    dropZone(g, (d) => { if (d.kind === 'sound') addSound(d.snd, at); else moveCard(d.from, null, null, at); });
    return g;
  }

  /** The map of the chapter's ways, in the rail: every list of steps, every choice, as deep as they go. */
  function waysTree() {
    if (!validC(chapter().choice)) return null;
    const box = el('div', 'fe-tree');
    const h = el('div', 'fe-flabel'); h.append(el('h3', '', 'Ways of this chapter'), help('ways'));
    box.append(h);
    const walk = (hold, path) => {
      const n = (hold.steps || []).length;
      const on = samePath(path, E.path);
      const trail = !on && path.length < E.path.length && samePath(path, E.path.slice(0, path.length));
      const row = el('button', `fe-tnode${on ? ' on' : trail ? ' trail' : ''}${path.length ? ' way' : ''}`);
      row.type = 'button';
      row.style.setProperty('--depth', String(path.length));
      const pc = path.length ? validC(holderAt(path.slice(0, -1)).choice) : null;
      row.append(el('span', 't', path.length ? wayLabel(pc.answers[path[path.length - 1]], path[path.length - 1]) : 'Chapter start'), el('small', '', `${n}`));
      row.title = `${n} step${n === 1 ? '' : 's'}`;
      row.addEventListener('click', () => goTo(path));
      box.append(row);
      const c = validC(hold.choice);
      if (!c) return;
      const q = el('div', 'fe-tq');
      q.style.setProperty('--depth', String(path.length));
      q.innerHTML = ICON.fork;
      q.append(el('span', '', c.question || 'A choice'));
      box.append(q);
      c.answers.forEach((a, k) => walk(a, path.concat(k)));
    };
    walk(chapter(), []);
    return box;
  }

  /** Over the cascade, when a way is open: the path that leads to it, and the other answers of its choice. */
  function navBar() {
    if (!E.path.length) return null;
    const bar = el('div', 'fe-crumbs');
    const crumb = (txt, path, q) => {
      const b = el('button', `fe-crumb${samePath(path, E.path) ? ' on' : ''}`);
      b.type = 'button';
      if (q) b.append(el('small', '', q));
      b.append(el('span', '', txt));
      b.addEventListener('click', () => goTo(path));
      return b;
    };
    bar.append(crumb('Chapter start', []));
    E.path.forEach((k, d) => {
      const c = validC(holderAt(E.path.slice(0, d)).choice);
      const sep = el('span', 'fe-sep'); sep.innerHTML = ICON.fork;
      bar.append(sep, crumb(wayLabel(c.answers[k], k), E.path.slice(0, d + 1), c.question || 'Choice'));
    });
    const box = el('div', 'fe-nav');
    box.append(bar);
    const pc = parentChoice();
    if (pc && pc.answers.length > 1) {
      const sib = el('div', 'fe-sibs');
      sib.append(el('span', 'muted small', 'Other answers:'));
      const up = E.path.slice(0, -1);
      pc.answers.forEach((a, k) => {
        if (k === E.path[E.path.length - 1]) return;
        const b = el('button', 'fe-way silver'); b.type = 'button';
        const n = (a.steps || []).length;
        b.append(el('span', '', wayLabel(a, k)), el('small', '', `${n} step${n === 1 ? '' : 's'}${validC(a.choice) ? ', then a choice' : ''}`));
        b.addEventListener('click', () => goTo(up.concat(k)));
        sib.append(b);
      });
      box.append(sib);
    }
    return box;
  }

  /** The node above the first step: what starts the list. */
  function startNode() {
    const pc = parentChoice();
    const box = el('div', `fe-start${pc ? ' silver' : ''}`);
    const node = el('span', 'fe-node');
    node.innerHTML = pc ? ICON.fork : ICON.go;
    const txt = el('div', 'fe-start-t');
    if (pc) {
      const k = E.path[E.path.length - 1];
      txt.append(el('b', '', `Starts when you pick "${wayLabel(pc.answers[k], k)}"${pc.question ? `, to "${pc.question}"` : ''}`));
      txt.append(el('span', 'muted small', 'Like a gate: everything still playing before the choice fades out, then the first step of this way starts.'));
      const up = el('button', 'btn small fe-up', 'Back to the steps before this choice'); up.type = 'button';
      up.addEventListener('click', () => goTo(E.path.slice(0, -1)));
      txt.append(up);
    } else {
      txt.append(el('b', '', 'Starts when you tap Play'));
      txt.append(el('span', 'muted small', 'The first step always waits for you.'));
    }
    box.append(node, txt);
    return box;
  }

  /** Between two steps: how the lower one starts, and what it means for the sounds above. */
  function link(i) {
    const st = steps();
    const s = st[i], nxt = st[i + 1];
    const mode = nxt.gate ? 'tap' : s.next != null ? 'after' : 'end';
    const box = el('div', `fe-link ${mode}`);
    const node = el('span', 'fe-node');
    node.innerHTML = mode === 'tap' ? ICON.gate : mode === 'after' ? ICON.clock : ICON.follow;
    const body = el('div', 'fe-link-b');
    const head = el('div', 'fe-link-h');
    head.append(el('span', 'fe-link-q', `How does step ${i + 2} start?`), help('link'));
    const opts = el('div', 'fe-opts');
    const opt = (v, icon, txt, title) => {
      const b = el('button', `fe-opt${mode === v ? ' on' : ''}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(mode === v));
      b.title = title;
      b.innerHTML = icon;
      b.append(el('span', '', txt));
      b.addEventListener('click', () => {
        if (v === 'tap') { nxt.gate = true; s.next = null; }
        else if (v === 'end') { nxt.gate = false; s.next = null; }
        else { nxt.gate = false; s.next = secs(s.next != null ? s.next : Math.max(1, F.stepLength(Object.assign({}, s, { next: null })) || 10)); }
        changed();
      });
      return b;
    };
    const l = lastEnding(s);
    opts.append(
      opt('tap', ICON.tap, 'On my tap (gate)', 'The wire waits for you; your tap fades out what still plays above'),
      opt('end', ICON.follow, l ? `When ${s.cards.filter((c) => !c.hold).length > 1 ? 'its sounds end' : `"${l.name}" ends`}` : 'Straight away, under its loops', 'Follows on its own, when the sounds above that end on their own are over'),
    );
    const after = opt('after', ICON.clock, 'After', 'Follows on its own after a set time');
    if (mode === 'after') {
      const n = el('input', 'fe-secs'); n.type = 'number'; n.min = 0; n.step = 0.5; n.value = s.next;
      n.setAttribute('aria-label', `Seconds before step ${i + 2} starts`);
      n.addEventListener('click', (e) => e.stopPropagation());
      n.addEventListener('change', () => { s.next = Math.max(0, secs(Number(n.value) || 0)); changed(); });
      after.append(n, el('span', '', 's'));
    } else after.querySelector('span').textContent = 'After a set time';
    opts.append(after);
    const say = el('p', 'fe-say');
    say.innerHTML = linkSentence(st, i);
    body.append(head, opts, say);
    box.append(node, body);
    return box;
  }

  /** After the last step: the choice, or the end of the chapter. */
  function endNode() {
    const st = steps();
    const c = choice();
    const box = el('div', 'fe-endnode');
    const last = st.length - 1;
    const { live } = last >= 0 ? liveAfter(st, last) : { live: [] };
    const names = list(live.map((x) => q(x.c)));
    if (c) {
      box.classList.add('silver');
      const node = el('span', 'fe-node'); node.innerHTML = ICON.fork;
      const body = el('div', 'fe-link-b');
      const head = el('div', 'fe-link-h');
      head.append(el('span', 'fe-link-q', 'Then the choice'), help('choice'));
      const qrow = el('div', 'fe-qrow');
      const qi = el('input', 'fe-question');
      qi.value = c.question || ''; qi.placeholder = 'The question, e.g. Do they open the crypt?'; qi.maxLength = 140;
      qi.setAttribute('aria-label', 'Question of the choice');
      qi.addEventListener('input', () => { c.question = qi.value; changed(false); });
      qi.addEventListener('change', () => renderChapters());
      const del = el('button', 'ico small'); del.type = 'button'; del.innerHTML = ICON.trash; del.title = 'Remove the choice and its ways';
      del.addEventListener('click', async () => {
        const ok = await ask('Remove this choice?', 'Its question and every way after it leave the chapter, with their steps.', [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, cls: 'danger' }]);
        if (!ok) return;
        delete holder().choice; E.sel = null; changed();
      });
      qrow.append(qi, del);
      const answers = el('div', 'fe-answers');
      c.answers.forEach((a, k) => {
        const row = el('div', 'fe-answer');
        const name = el('input', 'fe-alabel'); name.value = a.label || ''; name.maxLength = 40; name.placeholder = `Answer ${k + 1}`;
        name.setAttribute('aria-label', `Answer ${k + 1}`);
        name.addEventListener('input', () => { a.label = name.value; changed(false); });
        name.addEventListener('change', () => { renderSteps(); renderChapters(); });
        const n = (a.steps || []).length;
        const sub = validC(a.choice);
        const go = el('button', 'btn small fe-silver', `${n ? `Edit its ${n} step${n === 1 ? '' : 's'}` : 'Add its steps'}${sub ? ' and its choice' : ''}`);
        go.type = 'button';
        go.addEventListener('click', () => goTo(E.path.concat(k)));
        row.append(name, go);
        if (c.answers.length > 2) {
          const x = el('button', 'fe-x'); x.type = 'button'; x.innerHTML = ICON.x; x.title = 'Remove this answer and its way';
          x.addEventListener('click', () => { c.answers.splice(k, 1); E.sel = null; changed(); });
          row.append(x);
        }
        answers.append(row);
      });
      if (c.answers.length < F.MAX_ANSWERS) {
        const more = el('button', 'btn small fe-silver', '+ Answer'); more.type = 'button';
        more.addEventListener('click', () => { c.answers.push({ label: `Way ${c.answers.length + 1}`, steps: [] }); changed(); });
        answers.append(more);
      }
      const say = el('p', 'fe-say');
      say.innerHTML = `The wire stops here and shows the answers. When you pick one, ${live.length ? `${names} ${live.length > 1 ? 'fade' : 'fades'} out and ` : ''}its way starts.`;
      body.append(head, qrow, answers, say);
      box.append(node, body);
      return box;
    }
    const node = el('span', 'fe-node'); node.innerHTML = ICON.stop;
    const body = el('div', 'fe-link-b');
    body.append(el('span', 'fe-link-q', E.path.length ? 'End of this way, and of the chapter' : 'End of the chapter'));
    const say = el('p', 'fe-say');
    say.innerHTML = live.length
      ? `Still playing here: ${names}. ${live.some((x) => x.c.hold) ? 'Loops and random sounds go on until you open the next chapter or stop; the others play to their end.' : 'They play to their end.'}`
      : 'Every sound has ended by then. At the table, Next chapter lights up.';
    body.append(say);
    {
      const add = el('button', 'btn small fe-silver', 'Add a choice here');
      add.type = 'button';
      add.title = 'A silver gate with a question: each answer leads to its own end of the chapter';
      add.addEventListener('click', () => {
        holder().choice = { question: '', answers: [{ label: 'Yes', steps: [] }, { label: 'No', steps: [] }] };
        E.sel = null; changed();
      });
      const row = el('div', 'fe-row'); row.append(add, help('choice'));
      body.append(row);
    }
    box.append(node, body);
    return box;
  }

  const PLAY_TXT = (c) => (c.play === 'random' ? `Random, ${secs(c.gapMin)} to ${secs(c.gapMax)} s apart` : c.play === 'loop' ? (c.hold ? 'Loop, until the gate' : `Loop, ${F.clock(c.duration)}`) : `Once, ${F.clock(c.duration)}`);

  function renderSteps() {
    const main = $('#fe-main');
    const keep = main.scrollTop;
    main.textContent = '';
    const st = steps();
    const head = el('div', 'fe-head');
    const t = E.rec.story.chapters[E.ch].title || `Chapter ${E.ch + 1}`;
    head.append(el('p', 'kicker', `Chapter ${E.ch + 1}`), el('h2', '', t));
    const how = el('div', 'fe-how');
    how.append(el('span', 'muted', 'Steps play from top to bottom. Between two steps, you choose how the next one starts.'), help('chapter'));
    head.append(how);
    const nav = navBar();
    if (nav) head.append(nav);
    main.append(head);
    const col = el('div', `fe-cascade${E.path.length ? ' way' : ''}`);
    col.append(startNode());
    st.forEach((s, i) => {
      col.append(gap(i));
      const art = el('article', 'fe-step');
      const top = el('header', 'fe-step-top');
      const num = el('span', 'fe-num', String(i + 1));
      const title = el('input', 'fe-stitle');
      title.value = s.title; title.placeholder = `Name this step (${label(Object.assign({}, s, { title: '' }), i)})`; title.maxLength = 80;
      title.setAttribute('aria-label', `Name of step ${i + 1}`);
      title.addEventListener('input', () => { s.title = title.value; changed(false); });
      title.addEventListener('change', () => renderSteps());
      const acts = el('div', 'fe-acts');
      const mk = (icon, lbl, fn, dis) => { const b = el('button', 'ico small'); b.type = 'button'; b.innerHTML = icon; b.title = lbl; b.setAttribute('aria-label', lbl); b.disabled = !!dis; b.addEventListener('click', fn); return b; };
      acts.append(
        mk(ICON.up, 'Move up', () => { [st[i - 1], st[i]] = [st[i], st[i - 1]]; E.sel = null; changed(); }, i === 0),
        mk(ICON.down, 'Move down', () => { [st[i + 1], st[i]] = [st[i], st[i + 1]]; E.sel = null; changed(); }, i === st.length - 1),
        mk(ICON.trash, 'Remove this step', async () => {
          if (s.cards.length) {
            const ok = await ask('Remove this step?', `Step ${i + 1} and its ${s.cards.length} sound${s.cards.length > 1 ? 's' : ''} leave the chapter. The sounds stay in the story.`, [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, cls: 'danger' }]);
            if (!ok) return;
          }
          st.splice(i, 1); E.sel = null; changed();
        }),
      );
      top.append(num, title, acts);
      art.append(top);

      const lanes = el('div', 'fe-lanes');
      s.cards.forEach((c, k) => {
        const card = el('div', `fe-card${c.hold ? ' hold' : ''}`);
        card.draggable = true;
        card.tabIndex = 0;
        card.style.setProperty('--z', ZCOL[c.zone]);
        if (E.sel && E.sel.i === i && E.sel.k === k) card.classList.add('sel');
        card.append(el('b', '', c.name));
        const meta = el('span', 'fe-cmeta');
        meta.innerHTML = c.play === 'random' ? ICON.random : c.play === 'loop' ? ICON.repeat : ICON.once;
        meta.append(el('span', '', `${PLAY_TXT(c)}${c.offset ? `, from +${F.clock(c.offset)}` : ''}`));
        card.append(meta);
        const x = el('button', 'fe-x'); x.type = 'button'; x.innerHTML = ICON.x; x.setAttribute('aria-label', `Remove ${c.name}`); x.title = 'Remove from this step';
        x.addEventListener('click', (e) => { e.stopPropagation(); s.cards.splice(k, 1); E.sel = null; changed(); });
        card.append(x);
        card.addEventListener('click', () => { E.sel = { i, k }; renderSteps(); renderInspector(); });
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData(MIME, JSON.stringify({ kind: 'card', from: { i, k } })); e.dataTransfer.effectAllowed = 'move'; });
        dropZone(card, (d) => {
          if (d.kind === 'sound') {
            if (s.cards.length >= F.LANES) { toast(`A step holds ${F.LANES} sounds side by side at most.`); return; }
            s.cards.splice(k, 0, newCard(d.snd)); E.sel = { i, k }; changed();
          } else if (d.from.i === i) {
            const [m] = s.cards.splice(d.from.k, 1); s.cards.splice(k, 0, m); E.sel = { i, k }; changed();
          } else moveCard(d.from, i, k);
        });
        lanes.append(card);
      });
      if (s.cards.length < F.LANES) {
        const slot = el('div', 'fe-slot', s.cards.length ? '+ Drop a sound to play it alongside' : 'Drop a sound here');
        dropZone(slot, (d) => { if (d.kind === 'sound') addSound(d.snd, null, i); else if (d.from.i !== i) moveCard(d.from, i, null); });
        lanes.append(slot);
      }
      dropZone(lanes, (d) => { if (d.kind === 'sound') addSound(d.snd, null, i); else if (d.from.i !== i) moveCard(d.from, i, null); });
      art.append(lanes);

      // A small timeline of the step: when each sound starts, how long it plays; a held sound runs off the edge.
      if (s.cards.some((c) => !c.hold || c.offset > 0)) {
        const own = F.stepLength(s);
        const len = Math.max(0.1, own, ...s.cards.map((c) => c.offset + (c.hold ? 0 : c.duration)), ...s.cards.map((c) => c.offset + 4));
        const ruler = el('div', 'fe-ruler');
        s.cards.forEach((c) => {
          const bar = el('i', c.hold ? 'hold' : '');
          bar.style.left = `${(c.offset / len) * 100}%`;
          bar.style.width = c.hold ? `${100 - (c.offset / len) * 100}%` : `${Math.max(1, (c.duration / len) * 100)}%`;
          bar.style.setProperty('--z', ZCOL[c.zone]);
          ruler.append(bar);
        });
        if (i + 1 < st.length && !st[i + 1].gate && own < len - 0.05) { const m = el('b', 'fe-mark'); m.style.left = `${(own / len) * 100}%`; m.title = `Step ${i + 2} starts here`; ruler.append(m); }
        const cap = el('div', 'fe-rcap');
        cap.append(el('span', '', '0:00'), el('span', '', s.cards.some((c) => c.hold) ? `${F.clock(len)}, loops go on` : F.clock(len)));
        art.append(ruler, cap);
      }
      col.append(art);
      if (i + 1 < st.length) col.append(link(i));
    });
    col.append(gap(st.length));
    col.append(endNode());
    main.append(col);
    main.scrollTop = keep;
  }

  function field(lbl, input, hint, helpKey) {
    const l = el('label', 'fe-field');
    const top = el('span', 'fe-flabel', lbl);
    if (helpKey) top.append(help(helpKey));
    l.append(top, input);
    if (hint) l.append(el('small', '', hint));
    return l;
  }
  function numIn(v, step, min, max, on) {
    const i = el('input'); i.type = 'number'; i.step = step; i.min = min; if (max != null) i.max = max; i.value = v;
    i.addEventListener('change', () => on(Number(i.value)));
    return i;
  }

  function renderInspector() {
    const box = $('#fe-inspector');
    box.textContent = '';
    const st = steps();
    const s = E.sel && st[E.sel.i];
    const c = s && s.cards[E.sel.k];
    if (!c) {
      box.append(el('h3', '', 'Sound'));
      box.append(el('p', 'muted small', 'Click a sound in the cascade to choose how it plays, when it starts and how it fades. To add one, drag it from the list below onto a step, or between two steps for a new step.'));
      return;
    }
    const len = lengthOf(c.file);
    const head = el('div', 'fe-ins-head');
    head.style.setProperty('--z', ZCOL[c.zone]);
    head.append(el('h3', '', `Step ${E.sel.i + 1}, ${ZNAME[c.zone] || 'sound'}`));
    const pv = el('button', 'btn small'); pv.type = 'button'; pv.innerHTML = `${ICON.play}<span>Listen</span>`;
    pv.addEventListener('click', () => preview(c.file, c, pv));
    head.append(pv);
    box.append(head);
    const name = el('input'); name.value = c.name; name.maxLength = 120;
    name.addEventListener('input', () => { c.name = name.value || 'Sound'; changed(false); });
    name.addEventListener('change', () => renderSteps());
    box.append(field('Name at the table', name));
    const upd = (fn) => (v) => { fn(v); Object.assign(c, F.cleanCard(c, len)); changed(); };
    const whole = () => (len ? secs(Math.max(0.1, len - c.start)) : c.duration);

    // How it plays: once, loop, random.
    const seg = el('div', 'fe-modes');
    [['once', ICON.once, 'Once'], ['loop', ICON.repeat, 'Loop'], ['random', ICON.random, 'Random']].forEach(([v, icon, txt]) => {
      const b = el('button', `fe-mode${c.play === v ? ' on' : ''}`);
      b.type = 'button'; b.setAttribute('aria-pressed', String(c.play === v));
      b.innerHTML = icon; b.append(el('span', '', txt));
      b.addEventListener('click', upd(() => {
        if (v === c.play) return;
        if (v === 'once') { c.play = 'once'; c.hold = false; c.duration = whole(); }
        else if (v === 'loop') { c.play = 'loop'; c.hold = true; c.duration = Math.max(c.duration, 300); }
        else { c.play = 'random'; c.hold = true; c.duration = whole(); c.fadeIn = 0; c.fadeOut = 0; }
      }));
      seg.append(b);
    });
    box.append(field('How it plays', seg, null, 'plays'));
    const sub = el('div', 'fe-sub');
    if (c.play === 'once') {
      sub.append(el('p', 'muted small', `Plays one time, then stops on its own.${len ? ` The sound lasts ${F.clock(len)}.` : ''}`));
      const r = el('div', 'fe-row');
      r.append(numIn(c.duration, 0.5, 0.1, len || null, upd((v) => { c.duration = v; })));
      if (len && Math.abs(c.duration - whole()) > 0.05) { const w = el('button', 'btn small', 'Whole sound'); w.type = 'button'; w.addEventListener('click', upd(() => { c.duration = whole(); })); r.append(w); }
      sub.append(field('Plays for (seconds)', r));
    } else if (c.play === 'loop') {
      sub.append(el('p', 'muted small', 'Repeats without a break. It stops:'));
      const stops = el('div', 'fe-modes small');
      const sb = (hold, txt) => { const b = el('button', `fe-mode${c.hold === hold ? ' on' : ''}`, txt); b.type = 'button'; b.setAttribute('aria-pressed', String(c.hold === hold)); b.addEventListener('click', upd(() => { c.hold = hold; })); return b; };
      stops.append(sb(true, 'At the next gate'), sb(false, 'After a set time'));
      sub.append(stops);
      if (!c.hold) sub.append(field('Loops for (seconds)', numIn(c.duration, 1, 0.1, null, upd((v) => { c.duration = v; })), `${F.clock(c.duration)}, then it ends on its own`));
    } else {
      sub.append(el('p', 'muted small', 'Plays the sound, waits a random pause, plays it again, until the next gate.'));
      const r = el('div', 'fe-row');
      r.append(field('Pause from (s)', numIn(c.gapMin, 0.5, 0, 600, upd((v) => { c.gapMin = v; c.gapMax = Math.max(c.gapMax, v); }))), field('to (s)', numIn(c.gapMax, 0.5, 0, 600, upd((v) => { c.gapMax = Math.max(v, c.gapMin); }))));
      sub.append(r);
      const r2 = el('div', 'fe-row');
      r2.append(numIn(c.duration, 0.5, 0.1, len || null, upd((v) => { c.duration = v; })));
      if (len && Math.abs(c.duration - whole()) > 0.05) { const w = el('button', 'btn small', 'Whole sound'); w.type = 'button'; w.addEventListener('click', upd(() => { c.duration = whole(); })); r2.append(w); }
      sub.append(field('Each time, plays for (seconds)', r2));
    }
    box.append(sub);

    box.append(field('Starts', numIn(c.offset, 0.5, 0, null, upd((v) => { c.offset = v; })), `seconds after step ${E.sel.i + 1} begins (0: with it)`, 'starts'));
    box.append(field('Begins at', numIn(c.start, 0.5, 0, len || null, upd((v) => { c.start = v; })), 'seconds into the sound file, to skip its beginning'));
    if (c.play !== 'random') {
      const fades = el('div', 'fe-row');
      fades.append(field('Fade in (s)', numIn(c.fadeIn, 0.5, 0, 30, upd((v) => { c.fadeIn = v; }))));
      if (!c.hold) fades.append(field('Fade out (s)', numIn(c.fadeOut, 0.5, 0, 30, upd((v) => { c.fadeOut = v; }))));
      box.append(fades);
      if (c.hold) box.append(el('small', 'muted', 'It fades out at the gate that stops it, over the fade set in Settings.'));
    }
    const vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = c.volume;
    vol.style.setProperty('--z', ZCOL[c.zone]); vol.style.setProperty('--p', `${c.volume * 100}%`);
    const vv = el('b', 'fe-vol', String(Math.round(c.volume * 100)));
    vol.addEventListener('input', () => { c.volume = Number(vol.value); vol.style.setProperty('--p', `${c.volume * 100}%`); vv.textContent = String(Math.round(c.volume * 100)); changed(false); });
    const vrow = el('div', 'fe-row'); vrow.append(vol, vv);
    box.append(field('Volume', vrow));
    const fate = el('div', 'fe-fate');
    const fh = el('div', 'fe-flabel'); fh.append(el('span', '', 'In the chapter'), help('fate'));
    const fp = el('p', '');
    fp.innerHTML = fateSentence(st, E.sel.i, c);
    fate.append(fh, fp);
    box.append(fate);
  }

  function renderSounds(full = true) {
    const box = $('#fe-sounds');
    if (!full && box.childNodes.length) {
      box.querySelectorAll('.fe-snd .pv').forEach((b) => b.classList.toggle('on', !!(E.preview && E.preview.key === b.dataset.file)));
      return;
    }
    box.textContent = '';
    const tabs = el('div', 'seg small fe-tabs');
    [['chapter', 'This chapter'], ['others', 'Other chapters'], ['soundbox', 'Soundbox']].forEach(([v, t]) => {
      const b = el('button', '', t); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(E.tab === v));
      b.addEventListener('click', () => { E.tab = v; renderSounds(); });
      tabs.append(b);
    });
    box.append(tabs);
    const used = new Map();
    steps().forEach((s) => s.cards.forEach((c) => used.set(c.file, (used.get(c.file) || 0) + 1)));
    const groups = [];
    const st = E.rec.story;
    if (E.tab === 'chapter') F.ZONES.forEach((z) => groups.push([ZNAME[z], (st.chapters[E.ch][z] || []).map((s) => Object.assign({ zone: z }, s))]));
    else if (E.tab === 'soundbox') groups.push(['Soundbox', (st.soundbox || []).map((s) => Object.assign({ zone: 'soundbox' }, s))]);
    else st.chapters.forEach((c, i) => { if (i !== E.ch) groups.push([`${i + 1}. ${c.title || 'Chapter'}`, F.ZONES.flatMap((z) => (c[z] || []).map((s) => Object.assign({ zone: z }, s)))]); });
    const list = el('div', 'fe-snds');
    groups.forEach(([title, sounds]) => {
      if (!sounds.length) return;
      list.append(el('h4', '', title));
      sounds.forEach((snd) => {
        const row = el('div', 'fe-snd');
        row.draggable = true;
        row.style.setProperty('--z', ZCOL[snd.zone]);
        const pv = el('button', 'pv'); pv.type = 'button'; pv.innerHTML = ICON.play; pv.dataset.file = snd.file; pv.setAttribute('aria-label', `Listen to ${snd.name}`);
        pv.addEventListener('click', () => preview(snd.file, null, pv));
        if (E.preview && E.preview.key === snd.file) pv.classList.add('on');
        const name = el('span', 'nm', snd.name);
        const len = lengthOf(snd.file);
        const meta = el('small', '', `${len ? F.clock(len) : ''}${used.get(snd.file) ? `, used ${used.get(snd.file)}×` : ''}`);
        const add = el('button', 'add'); add.type = 'button'; add.innerHTML = ICON.plus; add.title = 'Add as a new step at the end'; add.setAttribute('aria-label', `Add ${snd.name} as a new step`);
        add.addEventListener('click', () => addSound(snd));
        row.append(pv, name, meta, add);
        row.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData(MIME, JSON.stringify({ kind: 'sound', snd: { name: snd.name, file: snd.file, zone: snd.zone, loop: snd.loop, volume: snd.volume } }));
          e.dataTransfer.effectAllowed = 'copy';
        });
        list.append(row);
      });
    });
    if (!list.childNodes.length) list.append(el('p', 'muted small', 'No sounds here.'));
    box.append(list);
  }

  /* ---------- Export ---------- */
  async function forge() {
    await flush();
    const bard = global.Troubadour.bardName();
    try {
      busy('Rhythming the .troubadour-ballade', '', 0);
      const out = await F.pack(E.rec.story, E.rec.flow, E.blobs, bard, (f) => busy('Rhythming the .troubadour-ballade', '', f), 'Troubadour Ballade editor (web)');
      E.rec.flow = out.flow;
      await global.FlowDB.put(E.rec);
      idle();
      $('#fe-sub').textContent = `Ballade editor, revision ${out.flow.revision}, ${out.flow.bard}`;
      await deliver(out.blob, out.fileName);
      toast(`${out.fileName} rhythmed, revision ${out.flow.revision}. Open it in Troubadour Ballade on your phone.`, 4200);
    } catch (e) { idle(); toast(`Could not rhythm: ${e.message || e}`, 4200); }
  }
  async function exportTroubadour() {
    try {
      busy('Writing the .troubadour', '', 0);
      const out = await F.packTroubadour(E.rec.story, E.blobs, (f) => busy('Writing the .troubadour', '', f));
      idle();
      await deliver(out.blob, out.fileName);
    } catch (e) { idle(); toast(`Could not write the .troubadour: ${e.message || e}`, 4200); }
  }

  function wire() {
    // While something is dragged, the gaps between steps open up to receive it.
    document.addEventListener('dragstart', () => { if (!$('#editor').hidden) document.body.classList.add('fe-dragging'); });
    ['dragend', 'drop'].forEach((ev) => document.addEventListener(ev, () => document.body.classList.remove('fe-dragging')));
    $('#fe-back').innerHTML = ICON.back;
    $('#fe-back').addEventListener('click', async () => { await flush(); if (E.onLeave) E.onLeave(); });
    $('#fe-play').addEventListener('click', async () => { await flush(); if (E.onPlay) E.onPlay(E.ch); });
    $('#fe-forge').addEventListener('click', forge);
    $('#fe-troubadour').addEventListener('click', exportTroubadour);
    document.addEventListener('click', closeHelp);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHelp(); });
    $('#fe-main').addEventListener('scroll', closeHelp, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (!E.rec || !E.sel || $('#editor').hidden) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
        const s = steps()[E.sel.i];
        if (s) { s.cards.splice(E.sel.k, 1); E.sel = null; changed(); }
      }
    });
  }

  global.FlowEditor = { open, close, wire, flush };
})(window);
