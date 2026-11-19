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
    window.__mapIds = r.world.places.map((q) => q.id);
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
      const all = A.heardNow().filter((h) => h.heard > 0.01), now = all.map((h) => h.card.name), waits = all.filter((h) => h.waiting).map((h) => h.card.name);
      out.places.push({ p, rows, now, waits, none: !!document.querySelector('#mw-heard-list .hn-none') });
    }
    return out;
  });
  ok(probe.voices > 0, `the map's sounds opened (${probe.voices})`);
  // The panel is at most 400 ms old: a random event may have started, ended or begun its wait since.
  const apart = (a, b) => a.filter((x) => !b.includes(x)).length + b.filter((x) => !a.includes(x)).length;
  ok(probe.places.every((q) => apart(q.rows, q.now) <= 1 && (!q.now.length || q.now.slice(0, 3).includes(q.rows[0]) || q.waits.includes(q.rows[0]))), 'the panel lists what the point hears, the loudest on top');
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
  // Now playing under the name, and the music lock (M6).
  await page.waitForFunction(() => window.MapAudio.currentMusic(), null, { timeout: 20000 }).catch(() => {});
  const m0 = await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.name; });
  if (m0) {
    ok((await page.textContent('#mw-sub')).includes(`Music: ${m0}`), `now playing under the name of the world (${await page.textContent('#mw-sub')})`);
    await page.waitForSelector('.mp-mlock', { state: 'visible', timeout: 5000 }).catch(() => {});
    if (await page.isVisible('.mp-mlock')) await page.click('.mp-mlock'); else await page.evaluate(() => window.MapAudio.lockMusic(true));
    await page.waitForTimeout(300);
    ok((await page.textContent('#mw-sub')).includes('(kept)'), 'the lock keeps the music, and says so');
    const kept = await page.evaluate(async () => {
      const A = window.MapAudio, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      window.MapUI.settings.musicAsk = false; // the music starts on arrival, without asking first
      const zones = window.MapView.__place().elements.filter((e) => e.cards.some((c) => c.zone === 'music'));
      const go = async () => { const out = []; for (const e of zones) { A.hear(window.TroubadourMap.centre(e.shape), true); await wait(600); const m = A.currentMusic(); out.push(m && m.name); A.hear([1, 1], true); await wait(400); } return out; };
      const locked = await go();
      A.lockMusic(false);
      const free = await go();
      return { locked, free };
    });
    ok(kept.locked.length > 0 && kept.locked.every((n) => n === m0), `locked: walking into places with their own music keeps ${m0} (${kept.locked.length} places)`);
    ok(kept.free.some((n) => n !== m0), `unlocked: a place with its own music changes it (${kept.free.join(', ')})`);
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
