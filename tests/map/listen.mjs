// Map: hearing in the editor, the table (arrival of a music, way around walls, signs, pinned effects, S6). Runs the preview by default (MAP_APP=map for the live app).
//   node tests/map/listen.mjs [path/to/world.troubadour-map]
// Opens a world, goes to the editor, listens, moves the golden point and checks what the panel says.
import { chromium } from '../ballade/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = process.env.MAP_APP || (fs.existsSync(path.join(ROOT, 'docs/map-preview')) ? 'map-preview' : 'map');
const world = path.resolve(process.argv[2] || path.join(ROOT, 'docs/discovery/maps/261117_the_four_lands.troubadour-map'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, u);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

let fails = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) fails++; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/docs/${APP}/index.html`);
  await page.waitForTimeout(600);
  await page.setInputFiles('#pick-file', world);
  // Imported, a world joins the list without opening.
  // (An async test function would count as true at once: the list is asked from here, every half second.)
  for (let t = 0; t < 600; t++) { if (await page.evaluate(async () => !!(window.MapDB && (await window.MapDB.list()).length))) break; await page.waitForTimeout(500); }
  await page.waitForTimeout(1500);
  // A second map (a copy of the first), to listen across a change of map.
  const uid = await page.evaluate(async () => {
    const r = (await window.MapDB.list())[0];
    if (r.world.places.length < 2) {
      const p = JSON.parse(JSON.stringify(r.world.places[0]));
      p.id = `${p.id}-2`; p.title = `${p.title} again`;
      r.world.places.push(p);
      await window.MapDB.put(r);
    }
    window.__mapIds = r.world.places.map((q) => q.id);
    return r.uid;
  });

  // The editor: silent until asked.
  await page.evaluate((u) => { location.hash = `#/edit/${u}/0`; }, uid);
  await page.waitForFunction(() => document.getElementById('world').dataset.mode === 'edit');
  await page.waitForTimeout(400);
  ok(!(await page.evaluate(() => window.MapAudio.isOpen())), 'the editor opens silent');
  ok(await page.isVisible('#mw-listen'), 'the headphones show in the editor');
  ok((await page.locator('#mw-heard').count()) === 0, 'no Heard now window any more');

  // A sound of the picker is heard when its play button is tapped (it was silent: two functions had one name).
  await page.evaluate(() => window.MapView.select(null));
  await page.waitForTimeout(200);
  const tab = page.locator('#mw-inspector [role="tab"]:visible', { hasText: /Sounds/ }).first();
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(200); }
  const add = page.locator('#mw-inspector button:visible', { hasText: /^Add/ }).first();
  if (await add.count()) {
    await add.click();
    await page.waitForSelector('#sheet[open] .snd-play', { timeout: 5000 });
    const icon0 = await page.evaluate(() => document.querySelector('#sheet[open] .snd-play').innerHTML);
    await page.click('#sheet[open] .snd-play');
    await page.waitForFunction((i0) => { const b = document.querySelector('#sheet[open] .snd-play'); return b && !b.classList.contains('wait') && b.innerHTML !== i0; }, icon0, { timeout: 15000 }).catch(() => {});
    const st = await page.evaluate((i0) => ({ pause: document.querySelector('#sheet[open] .snd-play').innerHTML !== i0, open: window.MapAudio.isOpen() }), icon0);
    ok(st.pause && !st.open, `the play button of the sound picker plays the sound (${st.pause ? 'playing' : 'silent'})`);
    await page.click('#sheet[open] .snd-play');
    await page.evaluate(() => document.getElementById('sheet').close());
  } else ok(false, 'the map panel has a button to add sounds');

  // Hear what the party hears.
  await page.click('#mw-listen');
  await page.waitForFunction(() => window.MapAudio.isOpen(), null, { timeout: 60000 });
  ok((await page.getAttribute('#mw-listen', 'aria-pressed')) === 'true', 'the headphones: the editor hears the map');
  const probe = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.MapAudio;
    const shapes = [...new Set([...A.voices()].filter((v) => !v.world && v.el && v.el.shape).map((v) => v.el))];
    const out = { voices: A.voices().length, places: [] };
    const pts = shapes.slice(0, 6).map((e) => window.TroubadourMap.centre(e.shape)).concat([[1, 1]]);
    for (const p of pts) {
      A.hear(p, true);
      await wait(600);
      out.places.push(A.heardNow().filter((h) => h.heard > 0.01 && !h.waiting).map((h) => h.card.name).sort().join('|'));
    }
    return out;
  });
  ok(probe.voices > 0, `the map's sounds opened (${probe.voices})`);
  ok(probe.places.some((q) => q.length > 0), 'from a place, the point hears its sounds');
  ok(new Set(probe.places).size > 1, 'moving the golden point changes what is heard');

  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  ok(!(await page.evaluate(() => window.MapAudio.isOpen())), 'S stops hearing');
  await page.keyboard.press('s');
  await page.waitForFunction(() => window.MapAudio.isOpen(), null, { timeout: 60000 });
  // Another map of the world, while listening: it listens there.
  const n = await page.evaluate(async () => (await window.MapDB.list())[0].world.places.length);
  if (n > 1) {
    await page.evaluate((u) => { location.hash = `#/edit/${u}/1`; }, uid);
    await page.waitForFunction(() => document.getElementById('mw-sub').textContent.startsWith('Map 2:'));
    await page.waitForFunction(() => window.MapAudio.isOpen(), null, { timeout: 60000 });
    ok(true, 'changing map while hearing, the new map is heard');
  }
  await page.evaluate((u) => { location.hash = `#/play/${u}/0`; }, uid);
  await page.waitForFunction(() => document.getElementById('world').dataset.mode === 'play');
  await page.waitForFunction(() => window.MapAudio.isOpen(), null, { timeout: 60000 });
  ok(await page.isHidden('#mw-listen'), 'at the table: no headphones button');
  // Now playing under the name, and the music lock (M6).
  await page.waitForFunction(() => window.MapAudio.currentMusic(), null, { timeout: 20000 }).catch(() => {});
  const m0 = await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.name; });
  if (m0) {
    ok((await page.textContent('#mw-sub')).includes(`Music: ${m0}`), `now playing under the name of the world (${await page.textContent('#mw-sub')})`);
    ok((await page.locator('.mp-mlock').count()) === 0, 'no music lock any more');
    // Arriving on a place with another music: its name, "Plays in 5 s", Play now and Skip.
    const zoneAt = await page.evaluate(() => {
      const cur = window.MapAudio.currentMusic();
      const e = window.MapView.__place().elements.find((x) => x.cards.some((c) => c.zone === 'music' && (!cur || c.file !== cur.file)));
      return e && window.TroubadourMap.centre(e.shape);
    });
    if (zoneAt) {
      const arriveAt = async () => { await page.evaluate((p) => { window.MapAudio.hear([1, 1], true); }, zoneAt); await page.waitForTimeout(400); await page.evaluate((p) => window.MapAudio.hear(p, true), zoneAt); await page.waitForSelector('#mw-arrive:not([hidden])', { timeout: 4000 }).catch(() => {}); };
      await page.evaluate(() => { window.MapUI.settings.musicAuto = true; });
      await arriveAt();
      if (process.env.SHOT) { await page.waitForTimeout(2200); await page.screenshot({ path: process.env.SHOT }); }
      ok(/Plays in [1-5] s/.test(await page.textContent('#mw-arrive')), `automatic: the place's music plays in a few seconds (${(await page.textContent('#mw-arrive .ar-clock')) || 'no card'})`);
      const before = await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.file; });
      await page.click('#mw-arrive .ar-skip');
      await page.waitForTimeout(6000);
      ok(await page.isHidden('#mw-arrive') && (await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.file; })) === before, 'Skip keeps the music heard');
      await arriveAt();
      await page.waitForTimeout(5800);
      const after = await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.file; });
      ok(after && after !== before && await page.isHidden('#mw-arrive'), 'nothing touched: it plays after 5 s');
      // Out of the place but within its hearing circle: the music stays. Out of the circle: it gives way at once.
      const ring = await page.evaluate((p0) => {
        const P = window.MapView.__place(), M = window.TroubadourMap;
        const e = P.elements.find((x) => x.cards.some((c) => c.zone === 'music') && M.hearing(p0, x, [], 0).d === 0);
        const b = M.bounds(e.shape);
        // Just beyond its edge, inside the circle, on the side of the map with room.
        const r = e.radius, x = b[2] + Math.min(r / 3, 60);
        return { inside: [x, (b[1] + b[3]) / 2], r };
      }, zoneAt);
      await page.evaluate((p) => window.MapAudio.hear(p, true), ring.inside);
      await page.waitForTimeout(1500);
      const still = await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.file; });
      ok(still === after, 'off the place but within its hearing circle: its music stays');
      await page.evaluate(() => window.MapAudio.hear([1, 1], false)); // walking out, not even stopped
      await page.waitForTimeout(400);
      ok(await page.isHidden('#mw-arrive'), 'out of the circle: no card, at once');
      await page.waitForTimeout(2500);
      const gone = await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.file; });
      ok(gone !== after, `out of the circle: the place's music gave way while walking (${gone || 'silence'})`);
      await page.evaluate(() => window.MapAudio.hear([1, 1], true));
      // Musics are never heard by distance: they belong to the world.
      const dist = await page.evaluate(async () => {
        const A = window.MapAudio, wait = (ms) => new Promise((r) => setTimeout(r, ms)), p = window.MapView.__place();
        const out = [];
        for (const q of [[1, 1], [p.width - 1, p.height - 1], [p.width / 2, p.height / 2]]) { A.hear(q, false); await wait(300); out.push(...A.voices().filter((v) => v.world).map((v) => v.heard)); }
        A.hear([1, 1], true);
        return out;
      });
      ok(dist.length > 0 && dist.every((h) => h === 1), `musics are heard in full wherever the party is (${dist.length} readings)`);
      await page.waitForSelector('#mw-arrive', { state: 'hidden', timeout: 8000 }).catch(() => {});
      // Not automatic: the card asks.
      await page.evaluate(() => { window.MapUI.settings.musicAuto = false; const m = window.MapAudio.currentMusic(); if (m) window.MapAudio.stop(m); });
      await page.waitForTimeout(800);
      const other = await page.evaluate(() => {
        const ms = window.MapAudio.voices().filter((v) => v.world && v.card.zone === 'music').map((v) => v.card);
        window.MapAudio.toggle(ms[ms.length - 1]);
        return ms[ms.length - 1].file;
      });
      await page.waitForTimeout(500);
      await arriveAt();
      ok(/Play this music\?|Which music here\?/.test(await page.textContent('#mw-arrive')), 'not automatic: the card asks (Play or Skip)');
      await page.waitForTimeout(6000);
      ok(!(await page.isHidden('#mw-arrive')), 'not automatic: nothing plays by itself');
      await page.click('#mw-arrive .ar-go');
      await page.waitForTimeout(800);
      ok((await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.file; })) !== other, 'Play moves to the music of the place');
      await page.evaluate(() => { window.MapUI.settings.musicAuto = true; });
      // The music settings of 20 November.
      const cur = () => page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.file; });
      const geo = await page.evaluate((p0) => {
        const P = window.MapView.__place(), M = window.TroubadourMap;
        const e = P.elements.find((x) => x.cards.some((c) => c.zone === 'music') && M.hearing(p0, x, [], 0).d === 0);
        const b = M.bounds(e.shape);
        return { on: p0, ring: [b[2] + Math.min(e.radius / 3, 60), (b[1] + b[3]) / 2], id: e.id };
      }, zoneAt);
      const reset = async () => { await page.evaluate(() => { window.MapAudio.hear([1, 1], true); const m = window.MapAudio.currentMusic(); if (m) window.MapAudio.stop(m); }); await page.waitForTimeout(1600); };
      // Suggestions off: no card, nothing changes.
      await reset();
      await page.evaluate(() => { window.MapUI.settings.musicSuggest = false; });
      await page.evaluate((p) => window.MapAudio.hear(p, true), geo.on);
      await page.waitForTimeout(1200);
      ok(await page.isHidden('#mw-arrive'), 'Music suggestions off: no card on a place with music');
      await page.evaluate(() => { window.MapUI.settings.musicSuggest = true; });
      // The card shows in the hearing circle.
      await reset();
      await page.evaluate(() => { window.MapUI.settings.musicIn = 'circle'; window.MapUI.settings.musicWait = 2; });
      await page.evaluate((p) => window.MapAudio.hear(p, true), geo.ring);
      await page.waitForSelector('#mw-arrive:not([hidden])', { timeout: 3000 }).catch(() => {});
      ok(/Plays in 2 s/.test((await page.textContent('#mw-arrive')) || ''), 'The card shows in its hearing circle, with the time set (2 s)');
      await page.waitForTimeout(2600);
      const inRing = await cur();
      ok(!!inRing && await page.isHidden('#mw-arrive'), 'Autoplay after 2 s, in the circle');
      // Stops out of the place: the party stands in the circle, off the place, where the card could show: it stays.
      await page.evaluate(() => { window.MapUI.settings.musicOut = 'place'; });
      await page.evaluate((p) => window.MapAudio.hear(p, false), geo.ring);
      await page.waitForTimeout(800);
      ok((await cur()) === inRing, 'Stops out of the place, but never while the party is where it could start');
      await page.evaluate(() => { window.MapUI.settings.musicIn = 'place'; });
      await page.evaluate((p) => window.MapAudio.hear(p, true), geo.on); await page.waitForTimeout(400);
      await page.evaluate((p) => window.MapAudio.hear(p, false), geo.ring);
      await page.waitForTimeout(2200);
      ok((await cur()) !== inRing, 'Stops out of the place: off the place, it gives way');
      // Autostop off: the music plays on, leaving.
      await reset();
      await page.evaluate(() => { window.MapUI.settings.musicOut = 'circle'; window.MapUI.settings.musicStop = false; });
      await page.evaluate((p) => window.MapAudio.hear(p, true), geo.on);
      await page.waitForTimeout(2800);
      const kept = await cur();
      await page.evaluate(() => window.MapAudio.hear([1, 1], true));
      await page.waitForTimeout(2200);
      ok(!!kept && (await cur()) === kept, 'Autostop off: the music plays on when the party leaves');
      await page.evaluate(() => { window.MapUI.settings.musicStop = true; });
      // The card shows while walking, as soon as the party is in the area, and goes when it leaves before a music plays.
      await reset();
      await page.evaluate(() => { window.MapUI.settings.musicAuto = false; });
      await page.evaluate((p) => window.MapAudio.hear(p, false), geo.on);
      await page.waitForSelector('#mw-arrive:not([hidden])', { timeout: 3000 }).catch(() => {});
      ok(!(await page.isHidden('#mw-arrive')), 'the card shows while the party walks onto the place');
      ok((await page.locator('#mw-arrive .ar-go.bare').count()) === 1 && (await page.locator('#mw-arrive .ar-go > svg').count()) === 0, 'no Autoplay: the play button alone, no ring');
      await page.evaluate(() => window.MapAudio.hear([1, 1], false));
      await page.waitForTimeout(500);
      ok(await page.isHidden('#mw-arrive'), 'the card goes when the party leaves before a music plays');
      await page.evaluate(() => window.MapAudio.hear([1, 1], true));
      // Crossing hearing circles: every music of every circle holding the party is on the card.
      const cross = await page.evaluate(async (id) => {
        const P = window.MapView.__place(), M = window.TroubadourMap, A = window.MapAudio, wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const ms = P.elements.filter((x) => x.cards.some((c) => c.zone === 'music'));
        // Two places with music whose circles cross: a point in both, on neither.
        for (const a of ms) for (const b of ms) {
          if (a === b) continue;
          const ba = M.bounds(a.shape), bb = M.bounds(b.shape);
          const ca = [(ba[0] + ba[2]) / 2, (ba[1] + ba[3]) / 2], cb = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
          for (let t = 0.05; t < 1; t += 0.05) {
            const q = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t];
            const ha = M.hearing(q, a, [], 0), hb = M.hearing(q, b, [], 0);
            if (ha.gain > 0 && hb.gain > 0 && ha.d > 0 && hb.d > 0) {
              window.MapUI.settings.musicIn = 'circle';
              const m = A.currentMusic(); if (m) A.stop(m);
              await wait(1200);
              A.hear(q, true); await wait(400);
              const files = [a, b].map((e) => e.cards.find((c) => c.zone === 'music').file);
              const box = document.getElementById('mw-arrive');
              return { shown: !box.hidden, alts: box.querySelectorAll('.ar-alt').length, both: files[0] !== files[1] };
            }
          }
        }
        return null;
      }, geo.id);
      if (cross && cross.both) {
        const crossMore = await page.evaluate(() => ({ alts: document.querySelectorAll('#mw-arrive .ar-alt').length }));
        ok(crossMore.alts >= 1, 'crossing circles: every music on the card');
      }
      if (cross && cross.both) ok(cross.shown && cross.alts >= 1, `crossing hearing circles: the musics of both places on the card (${cross.alts + 1})`);
      else console.log('skip crossing circles: no two crossing circles in this world');
      await page.evaluate(() => { window.MapUI.settings.musicIn = 'place'; window.MapUI.settings.musicAuto = true; window.MapAudio.hear([1, 1], true); });
      await page.waitForTimeout(600);
      // Every music of the place on the card: a second one is added, and played from its line.
      await reset();
      const second = await page.evaluate((id) => {
        const P = window.MapView.__place(), e = P.elements.find((x) => x.id === id);
        const own = e.cards.find((c) => c.zone === 'music');
        const mapM = (P.general.find((c) => c.zone === 'music') || {}).file;
        const other = window.MapAudio.voices().filter((v) => v.world && v.card.file !== own.file && v.card.file !== mapM && v.state !== 'playing').map((v) => v.card)[0];
        e.cards.push(Object.assign({}, own, { name: other.name, file: other.file }));
        window.MapAudio.sync();
        return other.file;
      }, geo.id);
      await page.evaluate(() => { window.MapUI.settings.musicAuto = false; const m = window.MapAudio.currentMusic(); if (m) window.MapAudio.stop(m); });
      await page.waitForTimeout(1600);
      await page.evaluate((p) => window.MapAudio.hear(p, true), geo.on);
      await page.waitForSelector('#mw-arrive:not([hidden])', { timeout: 3000 }).catch(() => {});
      ok((await page.locator('#mw-arrive .ar-alt').count()) === 1 && /Which music here\?/.test(await page.textContent('#mw-arrive')), 'a place with two musics: both on the card');
      if (await page.locator('#mw-arrive .ar-alt').count()) await page.click('#mw-arrive .ar-alt');
      await page.waitForTimeout(600);
      ok((await cur()) === second, 'a tap on the second plays it');
      await page.evaluate((id) => { const e = window.MapView.__place().elements.find((x) => x.id === id); e.cards.pop(); window.MapAudio.sync(); window.MapUI.settings.musicAuto = true; window.MapUI.settings.musicWait = 5; }, geo.id);
    }
  }
  // The sound menu of a place goes back to the whole map in one tap.
  {
    const crumb = await page.evaluate(async () => {
      const P = window.MapView.__place(), e = P.elements.find((x) => x.cards.length);
      window.MapView.onTap(e); await new Promise((r) => setTimeout(r, 300));
      const b = document.querySelector('#mw-side-title .mp-crumb');
      if (!b) return { b: false };
      b.click(); await new Promise((r) => setTimeout(r, 300));
      return { b: true, back: /Whole map/.test(document.getElementById('mw-side-title').textContent) && !document.querySelector('#mw-side-title .mp-crumb') };
    });
    ok(crumb.b && crumb.back, 'the sound menu of a place has a Whole map button that goes back');
  }
  // A music let go for another keeps where it was, for when the party comes back (S6).
  const s6 = await page.evaluate(async () => {
    const A = window.MapAudio, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.MapUI.settings.fade = 600; // quicker crossfades for the test
    const ms = A.voices().filter((v) => v.world && v.card.zone === 'music').map((v) => v.card);
    if (ms.length < 2) return null;
    const [a, b] = ms;
    if (A.voice(a).state !== 'playing') A.toggle(a);
    await wait(3500);
    const at = A.position(a);
    A.toggle(b); await wait(1500);
    const bPlays = A.voice(b).state === 'playing';
    A.toggle(a); await wait(300);
    return { at, back: A.position(a), bPlays };
  });
  if (s6) ok(s6.bPlays && s6.back >= s6.at - 0.2, `a music let go for another plays on from where it was when it comes back (${s6.at.toFixed(1)} s, back at ${s6.back.toFixed(1)} s)`);
  await page.evaluate(() => { window.MapUI.settings.fade = 4000; });

  // The master pause holds every random event still, also one sounding when it is pressed (its play used to
  // end during the 3 s fade and draw a next one).
  const held = await page.evaluate(async () => {
    const A = window.MapAudio, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rs = A.voices().filter((v) => v.card.play === 'random');
    if (!rs.length) return null;
    const r = rs.reduce((a, b) => ((a.card.duration || 9) < (b.card.duration || 9) ? a : b));
    if (r.state !== 'playing') { if (r.waiting) A.toggle(r.card); A.toggle(r.card); }
    for (let i = 0; i < 40 && r.state !== 'playing'; i++) await wait(50);
    const was = r.state;
    A.pauseAll();
    let heard = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 14000) { if (rs.some((v) => v.state === 'playing' && v.env.gain.value > 0.05 && Date.now() - t0 > 3200)) heard++; await wait(100); }
    A.pauseAll();
    await wait(500);
    return { was, heard, back: rs.filter((v) => v.rnd || v.state === 'playing').length, n: rs.length };
  });
  if (held) {
    ok(held.heard === 0, `master pause: no random event plays while everything is paused (${held.heard} moments heard, ${held.n} random events, one was ${held.was})`);
    ok(held.back > 0, `master resume: the random events come back (${held.back})`);
  }
  // A long press on the map sends the party there, the shortest way around the walls (M6).
  const way = await page.evaluate(() => {
    const V = window.MapView, p = V.__place(), M = window.TroubadourMap;
    const W = p.width, H = p.height, x = Math.round(W * 0.5);
    p.walls.push({ points: [[x, Math.round(H * 0.1)], [x, Math.round(H * 0.9)]], __test: 1 });
    const a = [Math.round(W * 0.3), Math.round(H * 0.5)], b = [Math.round(W * 0.7), Math.round(H * 0.5)];
    const path = V.__findPath(a, b);
    const crossings = path ? path.slice(1).reduce((n, q, i) => n + M.wallsBetween(path[i], q, p.walls), 0) : -1;
    const len = path ? path.slice(1).reduce((l, q, i) => l + Math.hypot(q[0] - path[i][0], q[1] - path[i][1]), 0) : 0;
    return { ok: !!path, crossings, len, straight: Math.hypot(b[0] - a[0], b[1] - a[1]), n: path ? path.length : 0, ends: path && [path[0], path[path.length - 1]], a, b };
  });
  ok(way.ok && way.crossings === 0 && way.len > way.straight * 1.1 && way.n <= 8, `the way around a wall: no wall crossed, ${way.n} points, ${Math.round(way.len)} long for ${Math.round(way.straight)} straight`);
  // On the screen: a long press beyond the wall draws the trail there.
  await page.evaluate(() => { const t = document.getElementById('mw-play-tip'); if (t) t.classList.add('gone'); document.getElementById('world').classList.remove('panel'); });
  await page.waitForTimeout(400);
  const lp = await page.evaluate(() => { const V = window.MapView, p = V.__place(); p.player = [Math.round(p.width * 0.3), Math.round(p.height * 0.5)]; const s = V.__toScreen([Math.round(p.width * 0.7), Math.round(p.height * 0.5)]), r = document.getElementById('mw-canvas').getBoundingClientRect(); return [r.left + s[0], r.top + s[1]]; });
  await page.mouse.move(lp[0], lp[1]); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  const tr = await page.evaluate(() => window.MapView.__trail());
  ok(tr && tr.n >= 3, `a long press beyond the wall sends the party round it (${tr ? `${tr.n} points, ${tr.phase}` : 'no trail'})`);
  await page.evaluate(() => { const p = window.MapView.__place(); p.walls = p.walls.filter((w) => !w.__test); });
  // Pinned effects: a strip over the map at the table, one tap fires one (M6).
  await page.evaluate((u) => { window.MapUI.settings.pins = [`${u}:sounds/soundbox/thunder.mp3`]; location.hash = `#/edit/${u}/0`; }, uid);
  await page.waitForFunction(() => document.getElementById('world').dataset.mode === 'edit');
  await page.evaluate((u) => { location.hash = `#/play/${u}/0`; }, uid);
  await page.waitForFunction(() => document.getElementById('world').dataset.mode === 'play' && window.MapAudio.isOpen(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const b = document.querySelector('#mw-pinstrip .pad'); return b && !b.disabled; }, null, { timeout: 20000 }).catch(() => {});
  const strip = await page.evaluate(() => [...document.querySelectorAll('#mw-pinstrip .pad')].map((b) => ({ t: b.textContent, d: b.disabled })));
  ok(strip.length === 1 && strip[0].t === 'Thunderclap' && !strip[0].d, `a pinned effect shows over the map at the table (${JSON.stringify(strip)})`);
  // A sign tapped once while the party stands on it takes its way (M6).
  const sign = await page.evaluate(() => {
    const V = window.MapView, p = V.__place();
    const e = p.elements.find((x) => x.shape.type === 'stamp');
    e.link = window.__mapIds && window.__mapIds[1];
    p.player = [e.shape.x, e.shape.y + Math.round(e.shape.size / 4)];
    V.redraw();
    const s = V.__toScreen([e.shape.x, e.shape.y]), r = document.getElementById('mw-canvas').getBoundingClientRect();
    return { x: r.left + s[0], y: r.top + s[1], link: e.link };
  });
  if (sign.link) {
    await page.mouse.click(sign.x, sign.y);
    await page.waitForFunction(() => document.getElementById('mw-sub').textContent.startsWith('Map 2:'), null, { timeout: 4000 }).catch(() => {});
    ok((await page.textContent('#mw-sub')).startsWith('Map 2:'), 'a tap on a sign the party stands on takes its way');
  }
  // The music menu in full screen: the music heard, the queue, then the search.
  await page.click('#mw-mus-btn');
  await page.waitForSelector('#mw-mus:not([hidden])');
  await page.click('#mw-mus-full');
  await page.waitForTimeout(300);
  const fs = await page.evaluate(() => {
    const m = document.getElementById('mw-mus').getBoundingClientRect(), body = document.querySelector('.mp-body').getBoundingClientRect();
    const up = document.getElementById('mw-mus-upnext').getBoundingClientRect(), q = document.querySelector('.mus-q').getBoundingClientRect();
    return { full: m.width >= body.width - 2 && m.height >= body.height - 2, order: !document.getElementById('mw-mus-upnext').hidden && up.top < q.top, setting: window.MapUI.settings.musicFull };
  });
  ok(fs.full && fs.order && fs.setting, `the music menu takes the full screen, the queue above the search (${JSON.stringify(fs)})`);
  await page.click('#mw-mus-full');
  await page.click('#mw-mus-close');
  for (let i = 0; i < 5; i++) await page.click('#mw-title');
  await page.waitForTimeout(700);
  const dbg = await page.evaluate(() => (document.querySelector('.mp-debug pre') || {}).textContent || '');
  ok(/audio clock [\d.]+ s/.test(dbg) && /voices \d+, playing \d+/.test(dbg), 'five taps on the name of the world: the debug overlay');
  ok(!errors.length, `no page error${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `\n${fails} failed` : '\nAll good');
process.exit(fails ? 1 : 0);
