// Map: the world's intro and outro (setting Intro and outro). On the discovery Forest Adventure:
// no music on a whole map any more; opening the world at the table, the intro is offered and the ambiances and
// events wait, silent; it plays once, and they fade in at its end. Leaving, the outro is offered; as it starts they
// fade out, and the app goes back to the worlds when it ends. Skipping the intro starts them at once.
//   node tests/map/intro-outro.mjs    (MAP_APP=map for the live app)
import { chromium } from '../ballade/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = process.env.MAP_APP || 'map-preview';
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
  await page.setInputFiles('#pick-file', path.join(ROOT, 'docs/discovery/maps/261121_the_forest_adventure.troubadour-map'));
  for (let t = 0; t < 600; t++) { if (await page.evaluate(async () => !!(window.MapDB && (await window.MapDB.list()).length))) break; await page.waitForTimeout(500); }
  const uid = await page.evaluate(async () => (await window.MapDB.list())[0].uid);
  // The world's intro and outro: two of its musics.
  const picked = await page.evaluate(async (u) => {
    const r = await window.MapDB.get(u);
    const general = r.world.places.reduce((n, p) => n + p.general.filter((c) => c.zone === 'music').length, 0);
    const mus = r.world.places.flatMap((p) => p.elements.flatMap((e) => e.cards)).filter((c) => c.zone === 'music');
    r.world.intro = mus[0].file; r.world.outro = mus[1].file;
    await window.MapDB.put(r);
    return { general, intro: mus[0].name, outro: mus[1].name };
  }, uid);
  ok(picked.general === 0, `no music on a whole map once imported (${picked.general})`);
  await page.evaluate((u) => { Object.assign(window.MapUI.settings, { fade: 1500, fadeIn: 1500, musicAuto: false, introOutro: true }); location.hash = `#/play/${u}/0`; }, uid);
  await page.waitForFunction(() => window.MapAudio && window.MapAudio.isOpen(), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const st = () => page.evaluate(() => {
    const A = window.MapAudio, vs = A.voices();
    const map = vs.filter((v) => !v.world);
    return {
      card: (() => { const b = document.getElementById('mw-arrive'); return b && !b.hidden ? b.textContent.replace(/\s+/g, ' ') : ''; })(),
      mapPlaying: map.filter((v) => v.state === 'playing').length, mapEnding: map.filter((v) => v.state === 'ending').length, mapAll: map.length,
      env: map.filter((v) => v.state === 'playing').map((v) => +v.env.gain.value.toFixed(2)),
      music: vs.filter((v) => v.world && v.state === 'playing').map((v) => v.card.name),
      hold: A.holding(), screen: document.documentElement.dataset.screen,
    };
  });
  let s = await st();
  ok(/Intro/.test(s.card) && s.card.includes(picked.intro), `the intro is offered as the world opens (${s.card})`);
  ok(s.hold && s.mapPlaying === 0 && s.mapAll > 0, `the ambiances and events wait (${s.mapPlaying} of ${s.mapAll} playing)`);
  await page.click('#mw-arrive .ar-go');
  await page.waitForTimeout(2500);
  s = await st();
  ok(s.music.length === 1 && s.music[0] === picked.intro && s.mapPlaying === 0, `the intro plays, alone (${JSON.stringify(s.music)}, map ${s.mapPlaying})`);
  // Its end: taken to its last 1.5 s.
  const card = await page.evaluate((n) => window.MapAudio.voices().find((v) => v.world && v.card.name === n).card, picked.intro);
  await page.evaluate((n) => { const A = window.MapAudio; const v = A.voices().find((o) => o.world && o.card.name === n); A.jump(v.card, 1.5); }, picked.intro);
  await page.waitForTimeout(2600);
  s = await st();
  ok(!s.hold && s.mapPlaying > 0 && !s.music.includes(picked.intro), `played once, then the ambiances and events come in (${s.mapPlaying} playing, music ${JSON.stringify(s.music)})`);
  ok(s.env.some((g) => g < 0.999), `they fade in (${JSON.stringify(s.env.slice(0, 6))})`);
  void card;
  await page.waitForTimeout(2000);

  // Leaving: the outro.
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('#ask[open]');
  const text = await page.textContent('#ask-text');
  ok(text.includes(picked.outro), `leaving tells of the outro (${text.slice(0, 80)})`);
  await page.click('#ask-acts button.danger');
  await page.waitForTimeout(400);
  s = await st();
  ok(/Outro/.test(s.card) && s.screen === 'world', `the outro is offered (${s.card})`);
  await page.click('#mw-arrive .ar-go');
  await page.waitForTimeout(2200);
  s = await st();
  ok(s.music.includes(picked.outro) && s.mapPlaying === 0, `the outro plays, the map's sounds fade out (music ${JSON.stringify(s.music)}, map ${s.mapPlaying} playing, ${s.mapEnding} ending)`);
  await page.evaluate((n) => { const A = window.MapAudio; const v = A.voices().find((o) => o.world && o.card.name === n); A.jump(v.card, 1.2); }, picked.outro);
  await page.waitForTimeout(5000);
  s = await page.evaluate(() => ({ screen: document.documentElement.dataset.screen, hash: location.hash }));
  ok(s.screen === 'library', `back to the worlds when it ends (${JSON.stringify(s)})`);

  // Skipping the intro: the sounds of the map start at once.
  await page.evaluate((u) => { location.hash = `#/play/${u}/0`; }, uid);
  await page.waitForFunction(() => window.MapAudio && window.MapAudio.isOpen() && !document.getElementById('mw-arrive').hidden, null, { timeout: 120000 });
  await page.click('#mw-arrive .ar-skip');
  await page.waitForTimeout(800);
  s = await st();
  ok(!s.hold && s.mapPlaying > 0 && !s.music.length, `skipped: the ambiances and events start, no music (${s.mapPlaying} playing)`);
  // The setting off: no intro.
  await page.evaluate(() => { window.MapUI.settings.introOutro = false; location.hash = '#/'; });
  await page.waitForSelector('#ask[open]');
  await page.click('#ask-acts button.danger');
  await page.waitForFunction(() => document.documentElement.dataset.screen === 'library', null, { timeout: 20000 });
  ok(true, 'the setting off: leaving asks no outro');
  await page.evaluate((u) => { location.hash = `#/play/${u}/0`; }, uid);
  await page.waitForFunction(() => window.MapAudio && window.MapAudio.isOpen(), null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  s = await st();
  ok(!s.card && !s.hold && s.mapPlaying > 0, `the setting off: no intro, the map plays at once (${s.card || 'no card'})`);
  ok(!errors.length, `no page error${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally { await browser.close(); server.close(); }
console.log(fails ? `\n${fails} failed` : '\nAll good');
process.exit(fails ? 1 : 0);
