// Map sound lab runner (261114_map_plan.md, M0 and M1).
//   node tests/map/run.mjs path/to/world.troubadour-map
// 1. Offline: every looping sound of the world through the shared engine (lab.html): holes, clicks, level steps
//    at the turn; and how even the loudness is, by kind.
// 2. Live: the real app opens the world at the table; time to the first sound, time to change map, then streamed
//    loops are taken to two seconds before their turn and the master is recorded through it.
// Writes tests/map/report.json. Exits 1 on a problem. CHROMIUM=/path/to/chrome to use a given browser.
import { chromium, devices } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const world = process.argv[2] && path.resolve(process.argv[2]);
if (!world || !fs.existsSync(world)) { console.error('Give a .troubadour-map file.'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let p = u === '/__world' ? world : path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!(p === world || p.startsWith(ROOT)) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((ok) => server.listen(0, ok));
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch(Object.assign({ args: ['--autoplay-policy=no-user-gesture-required'] }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
let failed = 0;
const report = {};

// ---- 1. Offline ----
{
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${base}/tests/map/lab.html`);
  await page.waitForFunction(() => window.labReady);
  const r = await page.evaluate(() => window.runLab('/__world'));
  report.offline = r;
  console.log(`${r.story}: ${r.sounds} sounds, ${r.loops} looping cards`);
  console.log(`  loops as they were: ${r.before.length} with a hole at each turn${r.before.length ? ` (${Math.min(...r.before.map((x) => x.gapMs))} to ${Math.max(...r.before.map((x) => x.gapMs))} ms)` : ''}`);
  console.log(`  through the engine: ${r.engine.length ? '' : 'clean'}`);
  r.engine.forEach((x) => console.log(`    ${x.kind}: ${x.name} (${x.where})${x.gapMs ? ` ${x.gapMs} ms` : ''}${x.jump ? ` jump ${x.jump}` : ''}${x.dB ? ` ${x.dB} dB` : ''}`));
  if (r.notes.length) console.log(`  ${r.notes.length} loops end and start at different levels by themselves (${r.notes.map((x) => `${x.name} ${x.dB} dB`).join(', ')})`);
  Object.entries(r.loudness).forEach(([z, l]) => console.log(`  loudness, ${z}: ${l.sounds} sounds, ${l.spreadBefore} dB apart as they are, ${l.spreadAfter} dB evened out`));
  failed += r.engine.length;
  await page.close();
}

// ---- 2. Live ----
{
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/docs/map/index.html`);
  await page.waitForTimeout(600);
  await page.setInputFiles('#pick-file', world);
  await page.waitForFunction(() => window.MapAudio && window.MapAudio.isOpen(), null, { timeout: 300000 });
  // Opened once (its sounds measured and kept): now the time a table waits, from the library.
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(800);
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].forEach((b) => /Leave/.test(b.textContent) && b.click()));
  await page.waitForFunction(() => !window.MapAudio.isOpen());
  const live = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.MapAudio, out = { open: 0, maps: [], turns: [] };
    const list = await window.MapDB.list();
    let t0 = performance.now();
    location.hash = `#/play/${list[0].uid}/0`;
    while (!A.isOpen()) await wait(10);
    out.open = Math.round(performance.now() - t0);
    const n = document.querySelectorAll('#mw-places .chap:not(.add)').length;
    for (let k = 1; k <= n; k++) {
      const to = k % n; t0 = performance.now();
      location.hash = location.hash.replace(/\/\d+$/, `/${to}`);
      while (!document.getElementById('mw-sub').textContent.startsWith(`Map ${to + 1}:`)) await wait(5);
      out.maps.push(Math.round(performance.now() - t0));
      await wait(700);
    }
    await wait(1500);
    // Record the master through the turn of streamed loops that are heard.
    const { ctx } = window.MapUI.audio();
    const rec = ctx.createScriptProcessor(4096, 1, 1);
    let chunks = [];
    rec.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    const mute = ctx.createGain(); mute.gain.value = 0;
    rec.connect(mute).connect(ctx.destination);
    const heard = A.voices().filter((v) => v.state === 'playing' && v.card.play === 'loop' && v.heard > 0.5 && A.streams().some((s) => s.name === v.card.name));
    for (const v of heard.slice(0, 4)) {
      // Alone, so the turn is not hidden under the others.
      const others = A.voices().filter((o) => o !== v && o.state === 'playing');
      others.forEach((o) => { o.space.gain.cancelScheduledValues(0); o.space.gain.value = 0; });
      v.space.gain.cancelScheduledValues(0); v.space.gain.value = 1; v.life.gain.cancelScheduledValues(0); v.life.gain.value = 1;
      const tap = ctx.createGain(); v.space.connect(tap); tap.connect(rec);
      const sr = ctx.sampleRate, w = Math.round(sr * 0.1);
      const db = (x) => 20 * Math.log10(x + 1e-9);
      const listen = async (ms) => {
        chunks = [];
        await wait(ms);
        const d = new Float32Array(chunks.reduce((s, c) => s + c.length, 0)); let o = 0; chunks.forEach((c) => { d.set(c, o); o += c.length; });
        const lv = []; for (let i = 0; i + w <= d.length; i += w) { let s = 0; for (let k = i; k < i + w; k++) s += d[k] * d[k]; lv.push(db(Math.sqrt(s / w))); }
        let run = 0, hole = 0; for (let i = 0; i < d.length; i++) { if (Math.abs(d[i]) < 0.001) { run++; hole = Math.max(hole, run); } else run = 0; }
        const sorted = lv.slice().sort((a, b) => a - b), median = sorted[sorted.length >> 1];
        return { holeMs: Math.round(hole / sr * 1000), dipDb: +(median - Math.min(...lv)).toFixed(1) };
      };
      // The sound away from its turn (what it does by itself), then through its turn.
      A.jump(v.card, 30); await wait(900);
      const own = await listen(3600);
      A.jump(v.card, 2.5); await wait(900);
      const turn = await listen(3600);
      tap.disconnect();
      out.turns.push({ name: v.card.name, holeMs: turn.holeMs, ownHoleMs: own.holeMs, dipDb: turn.dipDb, ownDipDb: own.dipDb });
    }
    return out;
  });
  report.live = live; report.errors = errors;
  console.log(`\nAt the table: world open in ${live.open} ms; maps changed in ${live.maps.join(', ')} ms`);
  live.turns.forEach((t) => console.log(`  turn of ${t.name}: longest silence ${t.holeMs} ms (${t.ownHoleMs} ms by itself), deepest dip ${t.dipDb} dB (${t.ownDipDb} dB by itself)`));
  if (errors.length) { console.log('  page errors:', errors); failed += errors.length; }
  // A loop whose end and start differ by themselves (told by the offline part) dips at its turn: that is the sound.
  const uneven = new Set(report.offline.notes.map((x) => x.name));
  live.turns.forEach((t) => { if (t.holeMs > t.ownHoleMs + 30 || (!uneven.has(t.name) && t.dipDb > t.ownDipDb + 4)) failed += 1; });
  if (live.maps.some((m) => m > 400)) failed += 1;
  await ctx.close();
}
fs.writeFileSync(path.join(ROOT, 'tests/map/report.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
server.close();
if (failed) { console.log(`\n${failed} problem(s).`); process.exit(1); }
console.log('\nClean.');
