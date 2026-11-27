// Map: the music follows the party, under stress. A scripted walk across the discovery world, stopping on places
// with music and off them, quickly and slowly, with the cards left to count down, skipped, or tapped. After each
// stop has settled, the music heard must be the one expected, alone, and heard (not stuck in silence).
//   node tests/map/music-walk.mjs [steps]    (MAP_APP=map for the live app)
import { chromium } from '../ballade/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = process.env.MAP_APP || 'map-preview';
const STEPS = Number(process.argv[2] || 40);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/docs/${APP}/index.html`);
  await page.waitForTimeout(600);
  await page.setInputFiles('#pick-file', path.join(ROOT, 'docs/discovery/maps/261117_the_four_lands.troubadour-map'));
  for (let t = 0; t < 600; t++) { if (await page.evaluate(async () => !!(window.MapDB && (await window.MapDB.list()).length))) break; await page.waitForTimeout(500); }
  const uid = await page.evaluate(async () => (await window.MapDB.list())[0].uid);
  await page.evaluate((u) => { window.MapUI.settings.fade = 1500; window.MapUI.settings.musicAuto = true; location.hash = `#/play/${u}/0`; }, uid);
  await page.waitForFunction(() => window.MapAudio && window.MapAudio.isOpen(), null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  // Spots: the middle of every place with music, and spots with none.
  const spots = await page.evaluate(() => {
    const p = window.MapView.__place(), M = window.TroubadourMap;
    const music = p.elements.filter((e) => e.cards.some((c) => c.zone === 'music')).map((e) => ({ at: M.centre(e.shape), file: e.cards.find((c) => c.zone === 'music').file, name: e.title }));
    const none = [[20, 20], [p.width - 20, 20], [20, p.height - 20]].map((at) => ({ at, file: null, name: 'nowhere' }));
    const mapMusic = (p.general.find((c) => c.zone === 'music') || {}).file || null;
    return { music, none, mapMusic };
  });
  console.log(`(${spots.music.length} places with music; the map's music: ${spots.mapMusic})`);
  let rnd = 7;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  let expected = await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.file; });
  let bad = 0;
  for (let i = 0; i < STEPS; i++) {
    const r = rand();
    const spot = r < 0.65 ? spots.music[Math.floor(rand() * spots.music.length)] : spots.none[Math.floor(rand() * spots.none.length)];
    const quick = rand() < 0.3; // leave again before anything settles
    const what = rand(); // the card: left alone, skipped, or tapped
    await page.evaluate((p) => window.MapAudio.hear(p, true), spot.at);
    await page.waitForTimeout(300);
    const card = await page.evaluate(() => { const b = document.getElementById('mw-arrive'); return b && !b.hidden ? b.textContent : ''; });
    const cur = await page.evaluate(() => { const m = window.MapAudio.currentMusic(); return m && m.file; });
    let action = 'none';
    if (quick) { await page.waitForTimeout(500 + rand() * 1500); action = 'walked on'; continue; }
    if (card) {
      if (what < 0.25) { await page.click('#mw-arrive .ar-skip'); action = 'skip'; }
      else if (what < 0.5) { await page.click('#mw-arrive .ar-go'); action = 'tap'; }
      else action = 'wait';
    }
    // What should be heard once settled.
    if (card && action !== 'skip') {
      if (spot.file) expected = spot.file;
      else expected = spots.mapMusic || null;
    } else expected = undefined; // skipped, or nothing proposed: the music heard plays on, or fades out (Autostop: no map music to come back)
    await page.waitForTimeout((action === 'wait' ? 5200 : 300) + 1500 + 900);
    const st = await page.evaluate(() => {
      const A = window.MapAudio;
      const w = A.voices().filter((v) => v.world);
      const playing = w.filter((v) => v.state === 'playing');
      return { playing: playing.map((v) => v.card.file), ending: w.filter((v) => v.state === 'ending').map((v) => v.card.file), gains: playing.map((v) => +v.env.gain.value.toFixed(2)), card: !document.getElementById('mw-arrive').hidden };
    });
    const good = st.playing.length <= 1 && !st.ending.length && st.gains.every((g) => g > 0.9) && (expected === undefined ? !st.playing.length || st.playing[0] === cur : expected ? st.playing[0] === expected : !st.playing.length) && !st.card;
    if (!good) { bad++; console.log(`FAIL step ${i}: at ${spot.name} (${card ? card.replace(/\s+/g, ' ').slice(0, 60) : 'no card'}), ${action}: expected ${expected}, heard ${JSON.stringify(st)}`); expected = st.playing[0] || null; }
  }
  ok(bad === 0, `${STEPS} stops across the world: always one music, the expected one, heard in full (${bad} wrong)`);
  // Pleasant creek, a music that loops on its own (101.6 s): once decoded (it is, from its first start), its turn
  // has no hole and no dip; streamed, two rounds crossed over 0.35 s.
  const turn = await page.evaluate(async () => {
    const A = window.MapAudio, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const pc = A.voices().find((v) => v.world && /Pleasant/.test(v.card.name));
    if (!pc) return null;
    A.voices().filter((v) => v.world && v.state === 'playing').forEach((v) => A.stop(v.card));
    await wait(2500);
    A.toggle(pc.card); await wait(3000); // started (streamed, or decoded already), and decoded meanwhile
    A.stop(pc.card); await wait(2500);
    A.toggle(pc.card); await wait(2500);
    const decoded = !pc.src.media;
    const { ctx } = window.MapUI.audio();
    const rec = ctx.createScriptProcessor(4096, 1, 1);
    let chunks = [];
    rec.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    const mute = ctx.createGain(); mute.gain.value = 0;
    rec.connect(mute).connect(ctx.destination);
    const tap = ctx.createGain(); pc.vg.connect(tap); tap.connect(rec);
    const sr = ctx.sampleRate, w = Math.round(sr * 0.05), db = (x) => 20 * Math.log10(x + 1e-9);
    const listen = async (ms) => {
      chunks = []; await wait(ms);
      const d = new Float32Array(chunks.reduce((s, c) => s + c.length, 0)); let o = 0; chunks.forEach((c) => { d.set(c, o); o += c.length; });
      const lv = []; for (let i = 0; i + w <= d.length; i += w) { let s2 = 0; for (let k = i; k < i + w; k++) s2 += d[k] * d[k]; lv.push(db(Math.sqrt(s2 / w))); }
      let run = 0, hole = 0; for (let i = 0; i < d.length; i++) { if (Math.abs(d[i]) < 0.0005) { run++; hole = Math.max(hole, run); } else run = 0; }
      const sorted = lv.slice().sort((a, b) => a - b);
      return { holeMs: Math.round(hole / sr * 1000), dipDb: +(sorted[sorted.length >> 1] - sorted[1]).toFixed(1) };
    };
    A.jump(pc.card, 40); await wait(700);
    const own = await listen(3000);
    A.jump(pc.card, 1.5); await wait(300);
    const at = await listen(3000);
    tap.disconnect();
    return { decoded, own, at };
  });
  if (turn) ok(turn.decoded && turn.at.holeMs <= turn.own.holeMs + 5 && turn.at.dipDb <= turn.own.dipDb + 3, `Pleasant creek decoded, its turn as smooth as the rest (${JSON.stringify(turn)})`);
  ok(!errors.length, `no page error${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally { await browser.close(); server.close(); }
console.log(fails ? `\n${fails} failed` : '\nAll good');
process.exit(fails ? 1 : 0);
