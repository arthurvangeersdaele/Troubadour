/* Troubadour Story builder draft: the story being forged is kept in this browser (IndexedDB) as it changes,
 * sounds included, so leaving the page, closing the tab or a crash never loses the work.
 * Each sound file is written once, under a key of its own; the story itself is a small record rewritten on every change. */
(() => {
  'use strict';
  const DB_NAME = 'troubadour-builder';
  const STORY = 'draft';
  const BLOBS = 'blobs';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORY)) db.createObjectStore(STORY);
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  const done = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
  const ask = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

  // Every sound blob gets a stable key the first time it is saved; the same File object keeps it.
  const keys = new WeakMap();
  const saved = new Set();
  let n = 0;
  const keyOf = (blob) => {
    let k = keys.get(blob);
    if (!k) { k = `b${Date.now().toString(36)}${(++n).toString(36)}${Math.random().toString(36).slice(2, 7)}`; keys.set(blob, k); }
    return k;
  };

  const strip = (s) => {
    const o = { name: s.name, fileName: s.fileName, loop: s.loop, volume: s.volume, extra: s.extra || {}, blob: keyOf(s.blob) };
    if (s.duration) o.duration = s.duration;
    return o;
  };

  /** Every sound key still used by any kept story. */
  async function usedKeys(tx) {
    const recs = await ask(tx.objectStore(STORY).getAll());
    const used = new Set();
    recs.forEach((r) => { (r.chapters || []).forEach((c) => window.Troubadour.ZONES.forEach((z) => (c[z] || []).forEach((x) => used.add(x.blob)))); (r.soundbox || []).forEach((x) => used.add(x.blob)); });
    return used;
  }

  /** Writes the story under its uid ('current' for the one kept before stories had their own); only the sound files
   *  not written before are stored. Files no story uses any more are removed. */
  async function save(state, current, uid = 'current') {
    const db = await open();
    const sounds = [];
    const record = {
      v: 1, savedAt: Date.now(), current, uid,
      id: state.id, revision: state.revision, created: state.created,
      title: state.title || '', description: state.description || '', extra: state.extra || {},
      chapters: state.chapters.map((c) => {
        const out = { title: c.title, extra: c.extra || {} };
        window.Troubadour.ZONES.forEach((z) => { out[z] = c[z].map((s) => { sounds.push(s); return strip(s); }); });
        return out;
      }),
      soundbox: state.soundbox.map((s) => { sounds.push(s); return strip(s); }),
    };
    const fresh = sounds.filter((s) => !saved.has(keyOf(s.blob)));
    if (fresh.length) {
      const tx = db.transaction(BLOBS, 'readwrite');
      const st = tx.objectStore(BLOBS);
      const seen = new Set();
      fresh.forEach((s) => { const k = keyOf(s.blob); if (!seen.has(k)) { seen.add(k); st.put(s.blob, k); } });
      await done(tx);
      seen.forEach((k) => saved.add(k));
    }
    const tx = db.transaction([STORY, BLOBS], 'readwrite');
    tx.objectStore(STORY).put(record, uid);
    const used = await usedKeys(tx);
    sounds.forEach((x) => used.add(keyOf(x.blob)));
    const all = await ask(tx.objectStore(BLOBS).getAllKeys());
    all.forEach((k) => { if (!used.has(k)) { tx.objectStore(BLOBS).delete(k); saved.delete(k); } });
    await done(tx);
  }

  /** The saved story with its sound files back as blobs, or null. */
  async function load(uid = 'current') {
    const db = await open();
    const tx = db.transaction([STORY, BLOBS], 'readonly');
    const record = await ask(tx.objectStore(STORY).get(uid));
    if (!record) return null;
    const blobs = new Map();
    const bs = tx.objectStore(BLOBS);
    const want = new Set();
    record.chapters.forEach((c) => window.Troubadour.ZONES.forEach((z) => (c[z] || []).forEach((s) => want.add(s.blob))));
    record.soundbox.forEach((s) => want.add(s.blob));
    await Promise.all([...want].map(async (k) => { const b = await ask(bs.get(k)); if (b) blobs.set(k, b); }));
    let lost = 0;
    const back = (s) => {
      const b = blobs.get(s.blob);
      if (!b) { lost++; return null; }
      keys.set(b, s.blob); saved.add(s.blob);
      return Object.assign({}, s, { blob: b });
    };
    const story = {
      id: record.id, revision: record.revision || 0, created: record.created,
      title: record.title, description: record.description, extra: record.extra || {},
      chapters: record.chapters.map((c) => {
        const out = { title: c.title, extra: c.extra || {} };
        window.Troubadour.ZONES.forEach((z) => { out[z] = (c[z] || []).map(back).filter(Boolean); });
        return out;
      }),
      soundbox: record.soundbox.map(back).filter(Boolean),
    };
    return { story, current: record.current || 0, savedAt: record.savedAt, lost };
  }

  async function clear() {
    const db = await open();
    const tx = db.transaction([STORY, BLOBS], 'readwrite');
    tx.objectStore(STORY).clear();
    tx.objectStore(BLOBS).clear();
    await done(tx);
    saved.clear();
  }

  /** The stories kept in this browser, newest first: { uid, title, chapters, sounds, savedAt, revision }. */
  async function list() {
    const db = await open();
    const tx = db.transaction(STORY, 'readonly');
    const st = tx.objectStore(STORY);
    const [recs, ks] = await Promise.all([ask(st.getAll()), ask(st.getAllKeys())]);
    return recs.map((r, i) => {
      let n = (r.soundbox || []).length;
      (r.chapters || []).forEach((c) => window.Troubadour.ZONES.forEach((z) => { n += (c[z] || []).length; }));
      return { uid: ks[i], discovery: (r.extra || {}).discovery || null, title: r.title || '', chapters: (r.chapters || []).length, sounds: n, savedAt: r.savedAt || 0, revision: r.revision || 0 };
    }).sort((a, b) => b.savedAt - a.savedAt);
  }

  /** Removes one story, and the sound files only it used. */
  async function remove(uid) {
    const db = await open();
    const tx = db.transaction([STORY, BLOBS], 'readwrite');
    tx.objectStore(STORY).delete(uid);
    await done(tx);
    const t2 = db.transaction([STORY, BLOBS], 'readwrite');
    const used = await usedKeys(t2);
    const all = await ask(t2.objectStore(BLOBS).getAllKeys());
    all.forEach((k) => { if (!used.has(k)) { t2.objectStore(BLOBS).delete(k); saved.delete(k); } });
    await done(t2);
  }

  const newUid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  /** A .troubadour (a File, a Blob or a URL) joins the list of this browser, without opening. onProgress(fraction, text). */
  async function addFile(source, onProgress) {
    let blob = source;
    if (typeof source === 'string') {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      blob = await res.blob();
    }
    const d = await window.Troubadour.unpack(blob, (k, total) => onProgress && onProgress(k / total, `Reading sound ${k} of ${total}`));
    if (!d.chapters.length) throw new Error('This tale has no chapter.');
    delete d.bard;
    const uid = newUid();
    await save(d, 0, uid);
    return { uid, title: d.title || 'Untitled story' };
  }

  /** A discovery story (docs/discovery/index.json: its chapters, the library of its sounds) joins the list, sounds downloaded. */
  async function addDiscovery(meta, library, base, onProgress) {
    const Z = window.Troubadour.ZONES;
    const wanted = [];
    const chapters = meta.chapters.map((c) => {
      const z = (library.chapters || {})[`${meta.id}/${c.id}`] || {};
      const ch = { title: c.title, extra: {} };
      Z.forEach((k) => { ch[k] = (z[k] || []).map((x) => { const s = { name: x.name, fileName: x.file.split('/').pop(), loop: x.loop || (k === 'events' ? 'once' : 'infinite'), volume: typeof x.volume === 'number' ? x.volume : 0.75, extra: {}, url: base + x.file, size: x.size || 0 }; wanted.push(s); return s; }); });
      return ch;
    });
    const mk = (x, loop) => { const s = { name: x.name, fileName: x.file.split('/').pop(), loop: x.loop || loop, volume: typeof x.volume === 'number' ? x.volume : 0.75, extra: {}, url: base + x.file, size: x.size || 0 }; wanted.push(s); return s; };
    const soundbox = (library.soundbox || []).filter((x) => x && x.file).map((x) => mk(x, 'once'));
    const total = wanted.reduce((a, s) => a + s.size, 0);
    let got = 0;
    const files = new Map();
    for (const s of wanted) {
      if (!files.has(s.url)) {
        const res = await fetch(s.url);
        if (!res.ok) throw new Error(`a sound could not be downloaded (${res.status})`);
        const b = await res.blob();
        files.set(s.url, new File([b], s.fileName, { type: b.type || 'audio/mpeg' }));
        got += s.size || b.size;
        if (onProgress) onProgress(total ? Math.min(1, got / total) : null, `${files.size} of ${wanted.length} sounds`);
      }
      s.blob = files.get(s.url);
      delete s.url; delete s.size;
    }
    const uid = newUid();
    await save({ id: null, revision: 0, created: null, title: meta.title, description: meta.blurb || '', extra: { discovery: meta.id }, chapters, soundbox }, 0, uid);
    return { uid, title: meta.title };
  }

  /** A new title for a kept story. */
  async function rename(uid, title) {
    const d = await load(uid);
    if (!d) return;
    d.story.title = title;
    await save(d.story, d.current, uid);
  }

  window.TroubadourDraft = { save, load, clear, list, remove, addFile, addDiscovery, rename, newUid };
})();
