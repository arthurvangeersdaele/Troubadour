// Map M3: listening in the editor (Heard now). Runs the preview by default (MAP_APP=map for the live app).
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
  await page.waitForFunction(async () => window.MapDB && (await window.MapDB.list()).length > 0, null, { timeout: 300000, polling: 500 });
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
    return r.uid;
  });

  // The editor: silent until asked.
  await page.evaluate((u) => { location.hash = `#/edit/${u}/0`; }, uid);
  await page.waitForFunction(() => document.getElementById('world').dataset.mode === 'edit');
  await page.waitForTimeout(400);
  ok(!(await page.evaluate(() => window.MapAudio.isOpen())), 'the editor opens silent');
  ok(await page.isVisible('#mw-listen'), 'the Listen button shows in the editor');
  ok(await page.isHidden('#mw-heard'), 'Heard now is closed');

  // Listen.
  await page.click('#mw-listen');
  await page.waitForFunction(() => window.MapAudio.isOpen(), null, { timeout: 60000 });
  ok(await page.isVisible('#mw-heard'), 'listening opens Heard now');
  ok((await page.getAttribute('#mw-listen', 'aria-pressed')) === 'true', 'the button shows it listens');

  // Where every sounding element is, and how much the point hears there.
  const probe = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.MapAudio;
    const shapes = [...new Set([...A.voices()].filter((v) => !v.world && v.el && v.el.shape).map((v) => v.el))];
    const out = { voices: A.voices().length, places: [] };
    // Points: every element's centre, and a far corner.
    const pts = shapes.slice(0, 6).map((e) => window.TroubadourMap.centre(e.shape)).concat([[1, 1]]);
    for (const p of pts) {
      A.hear(p, true);
      await wait(600);
      const rows = [...document.querySelectorAll('#mw-heard-list .hn-row')].map((r) => r.querySelector('.n').textContent);
      const now = A.heardNow().filter((h) => h.heard > 0.01).map((h) => h.card.name);
      out.places.push({ p, rows, now, none: !!document.querySelector('#mw-heard-list .hn-none') });
    }
    return out;
  });
  ok(probe.voices > 0, `the map's sounds opened (${probe.voices})`);
  // The panel is at most 400 ms old: a random event may have started or ended since.
  const apart = (a, b) => a.filter((x) => !b.includes(x)).length + b.filter((x) => !a.includes(x)).length;
  ok(probe.places.every((q) => apart(q.rows, q.now) <= 1 && (!q.now.length || q.now.slice(0, 3).includes(q.rows[0]))), 'the panel lists what the point hears, the loudest on top');
  ok(probe.places.some((q) => q.rows.length > 0), 'some place hears something');
  ok(new Set(probe.places.map((q) => q.rows.join('|'))).size > 1, 'moving the point changes the list');
  probe.places.forEach((q) => console.log(`     at ${q.p.map(Math.round)}: ${q.rows.join(', ') || '(nothing)'}  /  ${q.now.join(', ')}`));

  // The meter moves with sound.
  const lv = await page.evaluate(async () => {
    const A = window.MapAudio, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const best = A.voices().filter((v) => !v.world && v.el && v.el.shape)[0];
    A.hear(window.TroubadourMap.centre(best.el.shape), true);
    await wait(1500);
    let m = 0; for (let i = 0; i < 20; i++) { m = Math.max(m, A.meter().peak); await wait(50); }
    return { m, w: document.querySelector('#mw-meter .lv').style.width };
  });
  ok(lv.m > 0.001, `the meter reads the mix (peak ${lv.m.toFixed(3)}, bar ${lv.w})`);

  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  // A volume slider sets the card.
  const vol = await page.evaluate(async () => {
    const row = document.querySelector('#mw-heard-list .hn-row');
    if (!row) return null;
    const input = row.querySelector('input'), name = row.querySelector('.n').textContent;
    input.value = '0.33'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const h = window.MapAudio.heardNow().find((x) => x.card.name === name);
    return h && h.card.volume;
  });
  ok(vol === 0.33, 'a slider of Heard now sets the card volume');

  // The S key stops; the table never shows the panel.
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  ok(!(await page.evaluate(() => window.MapAudio.isOpen())) && (await page.isHidden('#mw-heard')), 'S stops listening and closes the panel');
  await page.keyboard.press('s');
  await page.waitForFunction(() => window.MapAudio.isOpen(), null, { timeout: 60000 });
  // Another map of the world, while listening: it listens there.
  const n = await page.evaluate(async () => (await window.MapDB.list())[0].world.places.length);
  if (n > 1) {
    await page.evaluate((u) => { location.hash = `#/edit/${u}/1`; }, uid);
    await page.waitForFunction(() => document.getElementById('mw-sub').textContent.startsWith('Map 2:'));
    await page.waitForFunction(() => window.MapAudio.isOpen(), null, { timeout: 60000 });
    ok(true, 'changing map while listening listens on the new map');
  }
  await page.evaluate((u) => { location.hash = `#/play/${u}/0`; }, uid);
  await page.waitForFunction(() => document.getElementById('world').dataset.mode === 'play');
  await page.waitForFunction(() => window.MapAudio.isOpen(), null, { timeout: 60000 });
  ok(await page.isHidden('#mw-heard') && await page.isHidden('#mw-listen'), 'at the table: no Listen button, no panel');
  ok(!errors.length, `no page error${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `\n${fails} failed` : '\nAll good');
process.exit(fails ? 1 : 0);
