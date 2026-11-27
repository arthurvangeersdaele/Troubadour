// Troubadour intro and outro (docs/shared/troubadour-intro.js), in Troubadour for iPhone and in the web player.
// iPhone: the discovery Forest Adventure added, a music marked intro and one marked outro (as the builders do);
// opening the story offers the intro (the gold ring), it plays once; leaving offers the outro: every other sound
// fades out as it starts, and the table closes when it ends. Web player: the same with a .troubadour file.
//   node tests/intro/run.mjs
import { chromium } from '../ballade/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  const size = fs.statSync(p).size, range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  const type = TYPES[path.extname(p)] || (p.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream');
  if (range) { const a = +range[1], b = range[2] ? +range[2] : size - 1; res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1 }); fs.createReadStream(p, { start: a, end: b }).pipe(res); return; }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  /* ---------- Troubadour for iPhone ---------- */
  const ctx = await browser.newContext({ viewport: { width: 932, height: 430 }, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'standalone', { get: () => true }); } catch (e) { /* */ } const P = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { if (window.__toEnd && this.duration > 10) { this.currentTime = this.duration - 1.5; window.__toEnd = false; } return P.call(this); }; try { localStorage.setItem('troubadour.settings', JSON.stringify({ fade: 1000, fadeIn: 500 })); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/docs/ios/index.html`);
  await page.waitForTimeout(2500);
  await page.getByText('Discovery', { exact: true }).first().click();
  await page.waitForTimeout(1000);
  await page.locator('dialog[open] button:has-text("Add")').first().click();
  for (let t = 0; t < 120; t++) { await page.waitForTimeout(1000); if (await page.locator('button:has-text("Play"):visible').count()) break; }
  const names = await page.evaluate(async () => {
    const D = window.TroubadourDB, s = (await D.listStories())[0];
    const m = s.chapters[0].music;
    window.TroubadourIntro.setRole(s.chapters, m[0], 'intro');
    window.TroubadourIntro.setRole(s.chapters, m[1], 'outro');
    await D.putStory(s);
    return { intro: m[0].name, outro: m[1].name };
  });
  await page.locator('button:has-text("Play"):visible').first().click();
  for (let t = 0; t < 120; t++) { await page.waitForTimeout(1000); if (await page.locator('.t-oneshot').count()) break; }
  const card = () => page.evaluate(() => { const b = document.querySelector('.t-oneshot'); return b ? b.textContent.replace(/\s+/g, ' ') : ''; });
  let c = await card();
  ok(/Intro/.test(c) && c.includes(names.intro), `iPhone: the intro is offered as the story opens (${c})`);
  await page.waitForTimeout(6500); // the gold ring closes: it plays by itself
  const playing = () => page.evaluate(() => [...document.querySelectorAll('.c')].filter((x) => x.querySelector('.pb.play[aria-label^="Pause"], .pb.play.on, .pb.play[aria-pressed="true"]')).map((x) => x.querySelector('b.nm').title));
  const state = (n) => page.evaluate((n) => { const c = [...document.querySelectorAll('.c')].find((x) => x.querySelector('b.nm').title === n); return c ? c.querySelector('.loop').textContent + '|' + c.className : ''; }, n);
  c = await card();
  const st1 = await state(names.intro);
  ok(!c && /1×/.test(st1), `iPhone: it plays by itself, once (${st1})`);
  // An ambiance meanwhile, to see it fade out with the outro.
  await page.locator('.zrow:nth-child(2) .c .pb.play').first().click();
  await page.waitForTimeout(1500);
  await page.locator('[data-action="leave-table"]').first().click();
  await page.waitForSelector('#ask[open]');
  const txt = await page.textContent('#ask-text');
  ok(txt.includes(names.outro), `iPhone: leaving tells of the outro (${txt.slice(0, 60)})`);
  await page.click('#ask-acts button.danger');
  await page.waitForTimeout(400);
  c = await card();
  ok(/Outro/.test(c) && c.includes(names.outro), `iPhone: the outro is offered (${c})`);
  await page.click('.t-oneshot .os-go');
  await page.waitForTimeout(2500);
  const live = await page.evaluate(() => [...document.querySelectorAll('.c')].map((x) => [x.querySelector('b.nm').title, x.querySelector('.pb.play').getAttribute('aria-label') || '']));
  const sounding = live.filter(([, l]) => /^Pause/.test(l)).map(([n]) => n);
  ok(sounding.length === 1 && sounding[0] === names.outro, `iPhone: the outro alone plays, the rest faded out (${JSON.stringify(sounding)})`);
  // Leave again during the outro: the table closes at once.
  await page.locator('[data-action="leave-table"]').first().click();
  await page.waitForFunction(() => !/#\/play\//.test(location.hash), null, { timeout: 15000 });
  ok(true, 'iPhone: Leave during the outro closes the table');
  // Once more, the outro played to its end (taken to its last 1.5 s): the table closes by itself.
  await page.locator('button:has-text("Play"):visible').first().click();
  for (let t = 0; t < 60; t++) { await page.waitForTimeout(500); if (await page.locator('.t-oneshot').count()) break; }
  await page.click('.t-oneshot .os-skip');
  await page.locator('[data-action="leave-table"]').first().click();
  await page.waitForSelector('#ask[open]');
  await page.click('#ask-acts button.danger');
  await page.waitForSelector('.t-oneshot');
  await page.evaluate(() => { window.__toEnd = true; });
  await page.click('.t-oneshot .os-go');
  const t0 = Date.now();
  await page.waitForFunction(() => !/#\/play\//.test(location.hash), null, { timeout: 20000 }).catch(() => {});
  const closed = await page.evaluate(() => !/#\/play\//.test(location.hash));
  ok(closed, `iPhone: the outro played through, the table closes (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  ok(!errors.length, `iPhone: no page error${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await ctx.close();

  /* ---------- The web player: a .troubadour whose first music is its intro, the second its outro ---------- */
  const tale = path.join(os.tmpdir(), 'troubadour-intro-test.troubadour');
  execFileSync('python3', ['-c', `
import zipfile, json, sys
zi = zipfile.ZipFile(sys.argv[1]); zo = zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_STORED)
s = json.loads(zi.read('story.json')); m = s['chapters'][0]['music']
m[0]['role'] = 'intro'; m[1]['role'] = 'outro'
zo.writestr('story.json', json.dumps(s))
for n in zi.namelist():
    if n != 'story.json': zo.writestr(n, zi.read(n))
zo.close()`, path.join(ROOT, 'docs/recueil/werewolf.troubadour'), tale]);
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await wctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await wctx.addInitScript(() => { const P = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { if (window.__toEnd && this.duration > 10) { this.currentTime = this.duration - 1.5; window.__toEnd = false; } return P.call(this); }; try { localStorage.setItem('troubadour.web', JSON.stringify({ fade: 1000, fadeIn: 500 })); } catch (e) { /* */ } });
  const w = await wctx.newPage();
  const werr = [];
  w.on('pageerror', (e) => werr.push(e.message));
  await w.goto(`${base}/docs/play/index.html#/troubadour`);
  await w.waitForTimeout(1200);
  await w.setInputFiles('#troubadour-input', tale);
  await w.locator('button:has-text("Play"):visible').first().waitFor({ timeout: 60000 });
  await w.locator('button:has-text("Play"):visible').first().click();
  await w.waitForSelector('.t-oneshot', { timeout: 120000 });
  const wcard = () => w.evaluate(() => { const b = document.querySelector('.t-oneshot'); return b ? b.textContent.replace(/\s+/g, ' ') : ''; });
  let wc = await wcard();
  ok(/Intro/.test(wc) && wc.includes('Market day'), `web: the intro is offered once the story is ready (${wc})`);
  await w.click('.t-oneshot .os-go');
  await w.waitForTimeout(1500);
  const wplaying = () => w.evaluate(() => [...document.querySelectorAll('.c')].filter((x) => /^Pause/.test(x.querySelector('.pb.play').getAttribute('aria-label') || '')).map((x) => x.querySelector('b.nm').title));
  ok(JSON.stringify(await wplaying()) === '["Market day"]', `web: Play now, the intro plays (${JSON.stringify(await wplaying())})`);
  await w.locator('[data-action="back"]').first().click();
  await w.waitForSelector('#leave[open]');
  ok((await w.textContent('#leave-text')).includes('Quiet village'), 'web: leaving tells of the outro');
  await w.click('#leave [data-leave="go"]');
  await w.waitForSelector('.t-oneshot');
  wc = await wcard();
  ok(/Outro/.test(wc) && wc.includes('Quiet village'), `web: the outro is offered (${wc})`);
  await w.evaluate(() => { window.__toEnd = true; });
  await w.click('.t-oneshot .os-go');
  await w.waitForTimeout(800);
  ok(JSON.stringify(await wplaying()) === '["Quiet village"]', `web: the outro alone plays (${JSON.stringify(await wplaying())})`);
  await w.waitForFunction(() => document.getElementById('table').hidden, null, { timeout: 20000 }).catch(() => {});
  ok(await w.evaluate(() => document.getElementById('table').hidden), 'web: the outro played through, the table closes');
  ok(!werr.length, `web: no page error${werr.length ? `: ${werr.join(' | ')}` : ''}`);
  fs.rmSync(tale, { force: true });
} finally { await browser.close(); server.close(); }
console.log(fails ? `\n${fails} failed` : '\nAll good');
process.exit(fails ? 1 : 0);
