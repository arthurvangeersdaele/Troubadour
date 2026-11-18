// The Ballade chapter's statechart (261118_troubadour_unifier.md, 4.2) as a test, on the real player in a browser:
// waiting (idle) --Begin--> running --the clock reaches a gate--> at a cue (wait) --Go--> running
// --end of the trunk--> at the choice --an answer--> running (its way) ... --Next chapter--> waiting.
// Pause and resume hold the clock in any running state. An event with no arrow leaves the state as it was.
//   node tests/ballade/statechart.mjs        (CHROMIUM=/path/to/chrome to use a given browser)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, 'docs', decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((ok) => server.listen(0, ok));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch(Object.assign({ args: ['--autoplay-policy=no-user-gesture-required'] }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let failures = 0, checks = 0;
const ok = (cond, label) => { checks++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); if (!cond) failures++; };
const state = () => page.evaluate(() => { const s = FlowPlayer.state(); return s ? s.mode + (FlowPlayer.isPaused() ? '+paused' : '') : 'closed'; });
const until = async (want, ms) => { const end = Date.now() + ms; let s; while (Date.now() < end) { s = await state(); if (want(s)) return s; await page.waitForTimeout(250); } return s; };

console.log('Ballade chapter (ballade/flow-player.js, state())');
await page.goto(`${base}/ballade/`);
await page.waitForSelector('.bm-tale');
await page.locator('.bm-tale', { hasText: 'Treasure' }).click();
await page.locator('.bm-btn', { hasText: 'Play' }).click();
const opened = await until((s) => s === 'idle', 30000);
ok(opened === 'idle', `open a chapter --> waiting (idle), got ${opened}`);
const ch0 = await page.evaluate(() => FlowPlayer.chapter());

// Waiting: Pause has no arrow (nothing plays yet).
await page.evaluate(() => FlowPlayer.togglePause());
ok((await state()).startsWith('idle'), 'waiting --pause--> still waiting');
if ((await state()).includes('paused')) await page.evaluate(() => FlowPlayer.togglePause());

// Begin.
await page.click('.fl-go');
ok((await until((s) => s === 'run', 5000)) === 'run', 'waiting --Begin--> running');

// Pause and resume hold the clock.
await page.evaluate(() => FlowPlayer.togglePause());
const t1 = await page.evaluate(() => FlowPlayer.state().t);
await page.waitForTimeout(600);
const t2 = await page.evaluate(() => FlowPlayer.state().t);
ok((await state()) === 'run+paused' && Math.abs(t2 - t1) < 0.05, 'running --Pause--> paused, the clock stands still');
await page.evaluate(() => FlowPlayer.togglePause());
ok((await state()) === 'run', 'paused --Resume--> running');

// The clock reaches the gate: the wire waits for the table.
const atGate = await until((s) => s === 'wait' || s === 'choice', 90000);
ok(atGate === 'wait', `running --the clock reaches a gate--> at a cue, got ${atGate}`);
if (atGate === 'wait') {
  await page.waitForTimeout(1500);
  ok((await state()) === 'wait', 'at a cue: it never goes on by itself');
  await page.click('.fl-go');
  ok((await until((s) => s === 'run', 5000)) === 'run', 'at a cue --Go--> running');
}

// The end of the trunk: the choice.
const atChoice = await until((s) => s === 'choice', 120000);
ok(atChoice === 'choice', `running --end of the trunk--> at the choice, got ${atChoice}`);
await page.click('.fl-go').catch(() => {});
await page.waitForTimeout(800);
ok((await state()) === 'choice', 'at the choice --Go--> still at the choice (only an answer goes on)');
await page.locator('.fl-answer').first().click();
ok((await until((s) => s === 'run' || s === 'wait', 5000)) !== 'choice', 'at the choice --an answer--> its way plays');

// Next chapter: waiting again, in the next chapter.
await page.click('.fl-nextch');
const next = await until((s) => s === 'idle', 15000);
const ch1 = await page.evaluate(() => FlowPlayer.chapter());
ok(next === 'idle' && ch1 === ch0 + 1, `--Next chapter--> waiting in the next chapter, got ${next} in chapter ${ch1}`);

ok(errors.length === 0, `no page error${errors.length ? ': ' + errors.join('; ') : ''}`);
await browser.close();
server.close();
console.log(failures ? `${failures} of ${checks} checks failed` : `All ${checks} checks pass.`);
process.exit(failures ? 1 : 0);
