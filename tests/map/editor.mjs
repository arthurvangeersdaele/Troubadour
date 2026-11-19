// Map M4: the codes of an editor. Runs the preview by default (MAP_APP=map for the live app).
//   node tests/map/editor.mjs [path/to/world.troubadour-map]
// Undo and redo for everything, the clipboard (copy, cut, paste on another map, duplicate, Alt-drag),
// the reach handle, the page of keys; 50 undos and 50 redos give the same world.
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
  await page.waitForFunction(async () => window.MapDB && (await window.MapDB.list()).length > 0, null, { timeout: 300000, polling: 500 });
  await page.waitForTimeout(1500);
  // A second map (a copy of the first), to listen across a change of map.
  const uid = await page.evaluate(async () => {
    const r = (await window.MapDB.list())[0];
    if (r.world.places.length < 2) {
      const p = JSON.parse(JSON.stringify(r.world.places[0]));
      p.id = `${p.id}-2`; p.title = `${p.title} again`;
      // Two places only, far apart, to measure snapping on.
      const st = p.elements.find((e) => e.shape.type === 'stamp');
      p.elements = [0, 1].map((i) => Object.assign(JSON.parse(JSON.stringify(st)), { id: `snap-${i}`, title: `Snap ${i + 1}`, link: null, shape: Object.assign({}, st.shape, { x: i ? 1400 : 500, y: i ? 1100 : 400, size: 160 }) }));
      r.world.places.push(p);
      await window.MapDB.put(r);
    }
    return r.uid;
  });


  await page.evaluate((u) => { location.hash = `#/edit/${u}/0`; }, uid);
  await page.waitForFunction(() => document.getElementById('world').dataset.mode === 'edit');
  await page.waitForTimeout(500);
  const n0 = await page.evaluate(() => window.MapView.__place().elements.length);
  ok(n0 > 3, `the map has its places (${n0})`);
  const hist = () => page.evaluate(() => window.MapView.history());
  ok((await page.isDisabled('#mw-tools [data-act="undo"]')) && (await page.isDisabled('#mw-tools [data-act="redo"]')), 'a map just opened: nothing to undo or redo');

  // The first place, selected; its centre on screen.
  const pick = (i) => page.evaluate((i) => {
    const p = window.MapView.__place(), e = p.elements[i];
    window.MapView.select(e);
    const c = window.TroubadourMap.centre(e.shape), s = window.MapView.__toScreen(c), r = document.getElementById('mw-canvas').getBoundingClientRect();
    return { id: e.id, title: e.title, x: r.left + s[0], y: r.top + s[1], radius: e.radius };
  }, i);

  // What the app learns of a sound by itself (its length, read once) is no step of the history.
  await pick(0); await page.waitForTimeout(800);
  ok((await hist()).undo === 0, 'selecting, and the sounds read, leave nothing to undo');
  // Delete, undo, redo.
  let e0 = await pick(0);
  await page.keyboard.press('Delete');
  ok((await page.evaluate(() => window.MapView.__place().elements.length)) === n0 - 1, 'Delete removes the place');
  await page.keyboard.press('Control+z');
  ok((await page.evaluate(() => window.MapView.__place().elements.length)) === n0, 'Ctrl+Z brings it back');
  await page.keyboard.press('Control+Shift+z');
  ok((await page.evaluate(() => window.MapView.__place().elements.length)) === n0 - 1, 'Ctrl+Shift+Z deletes it again');
  await page.keyboard.press('Control+z');
  ok((await page.evaluate(() => window.MapView.__place().elements.length)) === n0, 'and undo once more');

  // A change of sound settings (no drawing) is a step too.
  await page.evaluate(() => { const e = window.MapView.__place().elements.find((x) => x.cards.length); e.cards[0].volume = 0.21; window.MapView.edited(); });
  await page.waitForTimeout(600);
  const h1 = await hist();
  await page.keyboard.press('Control+z');
  ok((await page.evaluate(() => window.MapView.__place().elements.find((x) => x.cards.length).cards[0].volume)) !== 0.21, 'a sound volume changed is undone');
  await page.keyboard.press('Control+y');
  ok((await page.evaluate(() => window.MapView.__place().elements.find((x) => x.cards.length).cards[0].volume)) === 0.21, 'and redone (Ctrl+Y)');
  ok(h1.undo === 1 && h1.redo === 0, `a new change ends what could be redone (${h1.undo} to undo, ${h1.redo} to redo)`);

  // Copy and paste at the pointer; cut; duplicate.
  e0 = await pick(1);
  await page.keyboard.press('Control+c');
  await page.mouse.move(e0.x + 120, e0.y + 80);
  await page.keyboard.press('Control+v');
  let now = await page.evaluate(() => window.MapView.__place().elements.length);
  const pasted = await page.evaluate(() => { const e = window.MapView.selected(); return { id: e.id, title: e.title, cards: e.cards.length }; });
  const orig = await page.evaluate((id) => window.MapView.__place().elements.find((x) => x.id === id).cards.length, e0.id);
  ok(now === n0 + 1 && pasted.id !== e0.id && pasted.cards === orig, `Ctrl+V lays a copy with its sounds (${pasted.title})`);
  const at = await page.evaluate(() => { const e = window.MapView.selected(); const c = window.TroubadourMap.centre(e.shape), s = window.MapView.__toScreen(c), r = document.getElementById('mw-canvas').getBoundingClientRect(); return [r.left + s[0], r.top + s[1]]; });
  ok(Math.hypot(at[0] - (e0.x + 120), at[1] - (e0.y + 80)) < 3, 'the copy lands at the pointer');
  await page.keyboard.press('Control+d');
  ok((await page.evaluate(() => window.MapView.__place().elements.length)) === n0 + 2, 'Ctrl+D duplicates');
  await page.keyboard.press('Control+x');
  ok((await page.evaluate(() => window.MapView.__place().elements.length)) === n0 + 1, 'Ctrl+X cuts');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  ok((await page.evaluate(() => window.MapView.__place().elements.length)) === n0, 'three undos: as before the clipboard');

  // Alt-drag: a copy moves, the place stays.
  e0 = await pick(2);
  await page.mouse.move(e0.x, e0.y);
  await page.keyboard.down('Alt');
  await page.mouse.down(); await page.mouse.move(e0.x + 60, e0.y + 40, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  const alt = await page.evaluate((id) => { const p = window.MapView.__place(); const o = p.elements.find((x) => x.id === id); const s = window.MapView.selected(); return { n: p.elements.length, moved: s.id !== id, oc: window.TroubadourMap.centre(o.shape), sc: window.TroubadourMap.centre(s.shape) }; }, e0.id);
  ok(alt.n === n0 + 1 && alt.moved && Math.hypot(alt.sc[0] - alt.oc[0], alt.sc[1] - alt.oc[1]) > 20, 'Alt-drag moves a copy, the place stays');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  ok((await page.evaluate(() => window.MapView.__place().elements.length)) === n0, 'undone');

  // The reach handle.
  e0 = await pick(3);
  await page.waitForTimeout(100);
  const hd = await page.evaluate(() => { const r = document.getElementById('mw-canvas').getBoundingClientRect(); const h = window.MapView.__reachHandle(); const s = window.MapView.__toScreen(h); return [r.left + s[0], r.top + s[1]]; });
  await page.mouse.move(hd[0], hd[1]); await page.mouse.down(); await page.mouse.move(hd[0] + 90, hd[1], { steps: 10 }); await page.mouse.up();
  const r1 = await page.evaluate((id) => window.MapView.__place().elements.find((x) => x.id === id).radius, e0.id);
  ok(r1 > e0.radius, `dragging the reach handle out widens the reach (${e0.radius} to ${r1})`);
  const shown = await page.evaluate(() => { const r = document.querySelector('.reach-row b'); return r && r.textContent; });
  ok(!shown || /size|edge/.test(shown), `the panel follows (${shown || 'panel closed'})`);
  await page.keyboard.press('Control+z');
  ok((await page.evaluate((id) => window.MapView.__place().elements.find((x) => x.id === id).radius, e0.id)) === e0.radius, 'undo puts the reach back');

  // Snapping, on the second map (two places, far apart): a place dragged 3 pixels beside the middle of the other
  // jumps to it, a gold guide shows; Ctrl held, it stays where the finger left it.
  await page.evaluate((u) => { location.hash = `#/edit/${u}/1`; }, uid);
  await page.waitForFunction(() => document.getElementById('mw-sub').textContent.startsWith('Map 2:'));
  await page.waitForTimeout(400);
  const snapTry = async (ctrl) => {
    const a = await pick(0);
    const k = await page.evaluate(() => window.MapView.__toScreen([1, 0])[0] - window.MapView.__toScreen([0, 0])[0]);
    const dxs = (1400 - 500) * k + 3, dys = 120;
    await page.mouse.move(a.x, a.y);
    if (ctrl) await page.keyboard.down('Control');
    await page.mouse.down(); await page.mouse.move(a.x + dxs / 2, a.y + dys / 2, { steps: 6 }); await page.mouse.move(a.x + dxs, a.y + dys, { steps: 6 });
    const shown = await page.evaluate(() => window.MapView.guides());
    await page.mouse.up();
    if (ctrl) await page.keyboard.up('Control');
    const x = await page.evaluate(() => window.MapView.__place().elements[0].shape.x);
    await page.keyboard.press('Control+z');
    return { x, raw: 500 + dxs / k, shown };
  };
  const sn = await snapTry(false);
  ok(sn.x === 1400 && sn.shown.some((g) => g.x != null && [1320, 1400, 1480].some((v) => Math.abs(g.x - v) < 0.5)), `a place 3 pixels beside the middle of another snaps to it, on a gold guide (x ${sn.x}, the finger ${sn.raw.toFixed(1)})`);
  const fr = await snapTry(true);
  ok(Math.abs(fr.x - fr.raw) <= 1 && !fr.shown.length, `Ctrl held: no snapping (x ${fr.x})`);
  ok((await page.evaluate(() => window.MapView.__place().elements[0].shape.x)) === 500, 'both undone');
  await page.evaluate((u) => { location.hash = `#/edit/${u}/0`; }, uid);
  await page.waitForFunction(() => document.getElementById('mw-sub').textContent.startsWith('Map 1:'));
  await page.waitForTimeout(300);

  // Paste on another map of the world.
  await pick(0);
  await page.keyboard.press('Control+c');
  await page.evaluate((u) => { location.hash = `#/edit/${u}/1`; }, uid);
  await page.waitForFunction(() => document.getElementById('mw-sub').textContent.startsWith('Map 2:'));
  await page.waitForTimeout(300);
  const m2 = await page.evaluate(() => window.MapView.__place().elements.length);
  await page.mouse.move(500, 400);
  await page.keyboard.press('Control+v');
  ok((await page.evaluate(() => window.MapView.__place().elements.length)) === m2 + 1, 'a place copied on one map is pasted on another');
  await page.waitForTimeout(600);
  ok((await hist()).undo === 1, 'each map has its own history');
  await page.keyboard.press('Control+z');

  // 50 steps undone and redone: the same map.
  await page.evaluate((u) => { location.hash = `#/edit/${u}/0`; }, uid);
  await page.waitForFunction(() => document.getElementById('mw-sub').textContent.startsWith('Map 1:'));
  await page.waitForTimeout(300);
  const start = await page.evaluate(() => JSON.stringify(window.MapView.__place().elements));
  for (let i = 0; i < 50; i++) {
    await page.evaluate((i) => { const p = window.MapView.__place(); const e = p.elements[i % p.elements.length]; window.MapView.snapshot(); if (e.shape.type === 'stamp') e.shape.x += 3; else e.shape.points.forEach((q) => { q[0] += 3; }); e.radius += 10; window.MapView.edited(); window.MapView.commit(); }, i);
  }
  const end = await page.evaluate(() => JSON.stringify(window.MapView.__place().elements));
  ok((await hist()).undo === 50, '50 steps kept');
  for (let i = 0; i < 50; i++) await page.keyboard.press('Control+z');
  ok((await page.evaluate(() => JSON.stringify(window.MapView.__place().elements))) === start, '50 undos: the map as it was');
  for (let i = 0; i < 50; i++) await page.keyboard.press('Control+Shift+z');
  ok((await page.evaluate(() => JSON.stringify(window.MapView.__place().elements))) === end, '50 redos: the map as it was made');

  // The page of keys.
  await page.keyboard.press('?');
  ok(await page.isVisible('#sheet') && /Keyboard shortcuts/.test(await page.textContent('#sheet-title')), '? opens the page of keys');
  await page.keyboard.press('Escape');
  if (process.env.SHOT) { await pick(3); await page.waitForTimeout(200); await page.screenshot({ path: process.env.SHOT }); }
  ok(!errors.length, `no page error${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `\n${fails} failed` : '\nAll good');
process.exit(fails ? 1 : 0);
