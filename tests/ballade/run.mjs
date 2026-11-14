// Ballade sound lab runner (261114_ballade_plan.md, phases 0 and 1).
//   node tests/ballade/run.mjs [file.troubadour-ballade ...]
// With no argument, every discovery tale in docs/ballade/discovery. Writes tests/ballade/report.json and
// prints a summary: "before" is the raw files looped the old way (the baseline), "engine" is what the Ballade
// engine plays. It fails (exit 1) when the engine leaves a hole, a click, a hard start or a hard stop.
// CHROMIUM=/path/to/chrome to use a given browser (else Playwright's own).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((ok) => server.listen(0, ok));
const base = `http://localhost:${server.address().port}`;

const disc = path.join(ROOT, 'docs/ballade/discovery');
const inputs = process.argv.slice(2).length ? process.argv.slice(2).map((f) => path.resolve(f))
  : fs.readdirSync(disc).filter((f) => f.endsWith('.troubadour-ballade')).map((f) => path.join(disc, f));

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`${base}/tests/ballade/lab.html`);
await page.waitForFunction(() => window.labReady);

const report = [];
let failed = 0;
for (const f of inputs) {
  const url = '/' + path.relative(ROOT, f).split(path.sep).join('/');
  const r = await page.evaluate((u) => window.runLab(u), url);
  report.push(Object.assign({ file: path.relative(ROOT, f) }, r));
  const count = (list) => { const by = {}; list.forEach((x) => { by[x.kind] = (by[x.kind] || 0) + 1; }); return Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ') || 'clean'; };
  console.log(`\n${r.story}: ${r.cards} cards, ${r.sounds} sounds`);
  console.log(`  raw files, old loop: ${count(r.before)}`);
  console.log(`  through the engine:  ${count(r.engine)}`);
  r.engine.forEach((x) => console.log(`    ${x.kind}: ${x.name} (${x.where})${x.gapMs ? ` ${x.gapMs} ms` : ''}${x.jump ? ` jump ${x.jump}` : ''}${x.amp ? ` amp ${x.amp}` : ''}`));
  failed += r.engine.length;
}
fs.writeFileSync(path.join(ROOT, 'tests/ballade/report.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
server.close();
if (failed) { console.log(`\n${failed} problem(s) left in what the engine plays.`); process.exit(1); }
console.log('\nThe engine plays every card gapless and without a click.');
