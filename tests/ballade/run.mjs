// Ballade sound lab runner (phase 0 of 261114_ballade_plan.md).
//   node tests/ballade/run.mjs [file.troubadour-ballade ...]
// With no argument, every discovery tale in docs/ballade/discovery. Writes tests/ballade/report.json and
// prints a summary. Report-only for now: it exits 0 whatever it finds (the baseline before the new engine).
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
for (const f of inputs) {
  const url = '/' + path.relative(ROOT, f).split(path.sep).join('/');
  const r = await page.evaluate((u) => window.runLab(u), url);
  report.push(Object.assign({ file: path.relative(ROOT, f) }, r));
  const by = {};
  r.findings.forEach((x) => { by[x.kind] = (by[x.kind] || 0) + 1; });
  console.log(`\n${r.story}: ${r.cards} cards, ${r.sounds} sounds`);
  Object.entries(by).forEach(([k, n]) => console.log(`  ${k}: ${n}`));
  const gaps = r.findings.filter((x) => x.kind === 'loop gap').sort((a, b) => b.gapMs - a.gapMs).slice(0, 5);
  gaps.forEach((g) => console.log(`    ${g.gapMs} ms hole each turn: ${g.name} (${g.where})`));
}
fs.writeFileSync(path.join(ROOT, 'tests/ballade/report.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
server.close();
