// The timeline builder (261114_ballade_plan.md, P4 and the first codes of P5), in a browser, on the preview.
//   node tests/ballade/timeline-builder.mjs
// A discovery tale opened on the timeline: every card a clip where the steps put it, the cues as gold flags.
// A clip dragged (snapping to a cue), trimmed, cut at the playhead; a cue added; undo and redo. The chapter
// clock plays it through the engine: the playhead moves, it stops at a cue, Go plays on. Back to the steps:
// they play what the timeline says. Exported, the file holds timeline.json and flow.json; read again, the same.
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
const APP = process.env.BALLADE_APP || 'ballade-preview';
console.log(`(testing docs/${APP})`);

const browser = await chromium.launch(Object.assign({ args: ['--autoplay-policy=no-user-gesture-required'] }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' ')));
let failures = 0, checks = 0;
const ok = (cond, label) => { checks++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); if (!cond) failures++; };
const T = () => page.evaluate(() => { const s = FlowTimeline.__state(); const tl = s.flow.chapters[s.ch]; return { clips: tl.clips.length, cues: tl.markers.filter((m) => m.type === 'cue').map((m) => m.at), undo: s.undo.length, redo: s.redo.length, sel: s.sel, playhead: s.playhead, pps: s.pps }; });

try {
  await page.goto(`${base}/${APP}/`);
  await page.waitForSelector('.bm-tale');
  // The discovery tale with cues: brought onto the device by playing it once.
  await page.locator('.bm-tale', { hasText: 'Treasure' }).click();
  await page.locator('.bm-btn', { hasText: 'Play' }).click();
  await page.waitForFunction(() => window.FlowPlayer && FlowPlayer.state() && FlowPlayer.state().mode === 'idle', null, { timeout: 60000 });
  const uid = await page.evaluate(async () => (await FlowDB.list()).find((r) => /Treasure/.test(r.story.title)).uid);
  const v1 = await page.evaluate(async (u) => (await FlowDB.get(u)).flow, uid);

  // The steps view has a way to the timeline.
  await page.evaluate((u) => { location.hash = `#/edit/${u}/0`; }, uid);
  await page.waitForSelector('#fe-timeline');
  await page.click('#fe-timeline');
  await page.waitForFunction(() => !document.getElementById('timeline').hidden && document.querySelectorAll('#tl-tracks .tl-clip').length > 0, null, { timeout: 20000 });
  ok(true, 'Timeline opens from the steps view');
  ok(await page.isVisible('#tl-banner'), 'made from the steps: a line says so');
  const s0 = await T();
  const v1cards = v1.chapters[0].steps.reduce((a, s) => a + s.cards.length, 0);
  ok(s0.clips === v1cards, `every card of the chapter is a clip (${s0.clips} of ${v1cards})`);
  ok((await page.locator('#tl-tracks .tl-clip').count()) === s0.clips, 'every clip drawn');
  const gates = v1.chapters[0].steps.filter((s, i) => i > 0 && s.gate).length;
  ok(s0.cues.length === gates && (await page.locator('.tl-flag.cue').count()) === gates, `the gates are gold cue flags (${gates})`);
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => [...document.querySelectorAll('#tl-tracks canvas.wave')].some((c) => c.width > 0)), 'the waveforms are drawn');

  // Drag the first event clip near the first cue: it snaps onto it.
  const pick = await page.evaluate(() => {
    const s = FlowTimeline.__state(), tl = s.flow.chapters[s.ch];
    const cue = tl.markers.find((m) => m.type === 'cue');
    const c = tl.clips.find((x) => x.loop === 'once' && x.at < cue.at - 3 && !tl.clips.some((o) => o !== x && o.track === x.track && o.at > x.at && o.at < cue.at + x.length + 1));
    const d = document.querySelector(`.tl-clip[data-clip="${c.id}"]`).getBoundingClientRect();
    return { id: c.id, at: c.at, cue: cue.at, x: d.left + Math.min(40, d.width / 2), y: d.top + d.height / 2, pps: s.pps };
  });
  const dx = (pick.cue - pick.at) * pick.pps + 4; // 4 px past the cue
  await page.mouse.move(pick.x, pick.y); await page.mouse.down();
  await page.mouse.move(pick.x + dx / 2, pick.y, { steps: 5 }); await page.mouse.move(pick.x + dx, pick.y, { steps: 5 }); await page.mouse.up();
  const after = await page.evaluate((id) => {
    const s = FlowTimeline.__state(), tl = s.flow.chapters[s.ch], c = tl.clips.find((x) => x.id === id);
    const pts = [0].concat(tl.markers.map((m) => m.at), tl.clips.filter((x) => x !== c).flatMap((x) => [x.at, x.at + x.length]));
    return { at: c.at, len: c.length, onPoint: pts.some((p) => Math.abs(p - c.at) < 1e-6 || Math.abs(p - (c.at + c.length)) < 1e-6) };
  }, pick.id);
  const moved = after.at;
  const raw = pick.at + dx / pick.pps;
  ok(after.onPoint && Math.abs(moved - raw) <= 8 / pick.pps + 1e-6, `a clip dragged 4 px past a cue snaps to the nearest edge or marker (at ${moved}, the hand at ${raw.toFixed(2)})`);
  ok((await T()).undo === 1, 'one step of history');
  await page.keyboard.press('Control+z');
  ok(Math.abs((await page.evaluate((id) => { const s = FlowTimeline.__state(); return s.flow.chapters[s.ch].clips.find((c) => c.id === id).at; }, pick.id)) - pick.at) < 1e-6, 'Ctrl+Z puts it back');
  await page.keyboard.press('Control+Shift+z');
  ok(Math.abs((await page.evaluate((id) => { const s = FlowTimeline.__state(); return s.flow.chapters[s.ch].clips.find((c) => c.id === id).at; }, pick.id)) - moved) < 1e-6, 'Ctrl+Shift+Z moves it again');

  // Trim its right edge in.
  const tr = await page.evaluate((id) => { const s = FlowTimeline.__state(); const c = s.flow.chapters[s.ch].clips.find((x) => x.id === id); const d = document.querySelector(`.tl-clip[data-clip="${id}"]`).getBoundingClientRect(); return { len: c.length, x: d.right - 3, y: d.top + d.height / 2, pps: s.pps }; }, pick.id);
  await page.mouse.move(tr.x, tr.y); await page.mouse.down(); await page.mouse.move(tr.x - tr.pps * tr.len * 0.4, tr.y, { steps: 6 }); await page.mouse.up();
  const len2 = await page.evaluate((id) => { const s = FlowTimeline.__state(); return s.flow.chapters[s.ch].clips.find((c) => c.id === id).length; }, pick.id);
  ok(len2 < tr.len - 0.2 && len2 > 0.2, `its right edge trims it (${tr.len} to ${len2} s)`);

  // A cue at the playhead (C), a section (M), cut at the playhead (S).
  await page.evaluate((t) => { FlowTimeline.__state().playhead = t; }, moved + len2 / 2);
  await page.evaluate((id) => { FlowTimeline.__state().sel = { type: 'clip', id }; }, pick.id);
  const before = await T();
  await page.keyboard.press('s');
  ok((await T()).clips === before.clips + 1, 'S cuts the selected sound at the playhead');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { FlowTimeline.__state().playhead = 1.5; });
  await page.keyboard.press('c');
  ok((await T()).cues.includes(1.5), 'C adds a cue at the playhead');
  await page.keyboard.press('Delete');
  ok(!(await T()).cues.includes(1.5), 'Delete removes the selected cue');

  // The codes of P5: fade handles, the volume line, the clipboard, Alt-drag, ripple, crossfades, checks.
  const C = (id) => page.evaluate((id) => { const s = FlowTimeline.__state(); return JSON.parse(JSON.stringify(s.flow.chapters[s.ch].clips.find((c) => c.id === id) || null)); }, id);
  const big = await page.evaluate(() => { const s = FlowTimeline.__state(), tl = s.flow.chapters[s.ch]; const c = tl.clips.filter((x) => x.loop === 'loop').sort((a, b) => b.length - a.length)[0]; s.sel = { type: 'clip', id: c.id }; return c.id; });
  await page.keyboard.press('Escape'); await page.evaluate((id) => { FlowTimeline.__state().sel = { type: 'clip', id }; }, big);
  await page.evaluate(() => { document.querySelector('#tl-zin').click(); document.querySelector('#tl-zin').click(); });
  await page.waitForTimeout(200);
  const hnd = await page.evaluate((id) => { const d = document.querySelector(`.tl-clip[data-clip="${id}"]`); const f = d.querySelector('.fh.in').getBoundingClientRect(), v = d.querySelector('.vline').getBoundingClientRect(); return { fx: f.left + f.width / 2, fy: f.top + f.height / 2, vx: v.left + 30, vy: v.top, pps: FlowTimeline.__state().pps }; }, big);
  await page.evaluate((id) => { const s = FlowTimeline.__state(), c = s.flow.chapters[s.ch].clips.find((x) => x.id === id); c.fadeIn = 0.5; c.fadeOut = 0.5; if (c.length < 6) c.length = 6; c.volume = 0.7; }, big);
  await page.evaluate(() => { document.querySelector('#tl-zin').click(); });
  await page.waitForTimeout(150);
  Object.assign(hnd, await page.evaluate((id) => { const d = document.querySelector(`.tl-clip[data-clip="${id}"]`); const root = document.getElementById('tl-tracks'); root.scrollLeft = Math.max(0, d.offsetLeft + 176 - 300); const f = d.querySelector('.fh.in').getBoundingClientRect(); return { fx: f.left + f.width / 2, fy: f.top + f.height / 2, pps: FlowTimeline.__state().pps }; }, big));
  const c0 = await C(big);
  await page.mouse.move(hnd.fx, hnd.fy); await page.mouse.down(); await page.mouse.move(hnd.fx + hnd.pps * 1.5, hnd.fy, { steps: 6 }); await page.mouse.up();
  const c1 = await C(big);
  ok(Math.abs(c1.fadeIn - (c0.fadeIn + 1.5)) < 0.11, `the fade-in handle drags the fade (${c0.fadeIn} to ${c1.fadeIn} s)`);
  const h2 = await page.evaluate((id) => { const d = document.querySelector(`.tl-clip[data-clip="${id}"]`); const root = document.getElementById('tl-tracks'); root.scrollLeft = Math.max(0, d.offsetLeft + 176 - 300); const v = d.querySelector('.vline').getBoundingClientRect(); return { x: Math.max(v.left + 30, root.getBoundingClientRect().left + 200), y: v.top }; }, big);
  await page.mouse.move(h2.x, h2.y); await page.mouse.down(); await page.mouse.move(h2.x, h2.y + 10, { steps: 4 }); await page.mouse.up();
  const c2 = await C(big);
  ok(c2.volume < c1.volume - 0.1, `the volume line drags the volume down (${c1.volume} to ${c2.volume})`);
  const n0 = (await T()).clips;
  await page.keyboard.press('Control+d');
  const dup = (await T()).sel.id;
  const cd = await C(dup);
  ok((await T()).clips === n0 + 1 && Math.abs(cd.at - (c2.at + c2.length)) < 1e-6 && cd.track === c2.track, 'Ctrl+D lays a copy right after it');
  await page.evaluate((id) => { FlowTimeline.__state().sel = { type: 'clip', id }; FlowTimeline.__state().playhead = 2; }, big);
  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  const pasted = await C((await T()).sel.id);
  ok((await T()).clips === n0 + 2 && pasted.at === 2 && pasted.file === c2.file, 'Ctrl+V pastes it at the playhead');
  // Pasted over the original on the same track: a crossfade, drawn as a gold X.
  await page.waitForTimeout(100);
  ok((await page.locator('.tl-xfade').count()) > 0, 'two clips overlapping on a track show a gold crossfade');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  ok((await T()).clips === n0, 'undone twice: as before');
  // Ripple: Shift+Delete closes the gap.
  const rp = await page.evaluate(() => { const s = FlowTimeline.__state(), tl = s.flow.chapters[s.ch]; const c = tl.clips.slice().sort((a, b) => a.at - b.at).find((x) => tl.clips.some((o) => o.at >= x.at + x.length)); s.sel = { type: 'clip', id: c.id }; const after = tl.clips.filter((o) => o.at >= c.at + c.length).map((o) => [o.id, o.at]); return { len: c.length, after }; });
  await page.keyboard.press('Shift+Delete');
  const moved2 = await page.evaluate((after) => { const s = FlowTimeline.__state(), tl = s.flow.chapters[s.ch]; return after.map(([id, at]) => [tl.clips.find((c) => c.id === id).at, at]); }, rp.after);
  ok(moved2.length > 0 && moved2.every(([now, was]) => Math.abs(now - (was - rp.len)) < 1e-6), `Shift+Delete removes it and closes the gap (${moved2.length} moved back ${rp.len} s)`);
  await page.keyboard.press('Control+z');
  // Alt-drag: a copy moves, the clip stays.
  const ad = await page.evaluate((id) => { const d = document.querySelector(`.tl-clip[data-clip="${id}"]`); const root = document.getElementById('tl-tracks'); root.scrollLeft = Math.max(0, d.offsetLeft + 176 - 300); const r = d.getBoundingClientRect(); return { x: Math.max(r.left + 40, root.getBoundingClientRect().left + 220), y: r.top + r.height - 8, at: FlowTimeline.__state().flow.chapters[FlowTimeline.__state().ch].clips.find((c) => c.id === id).at, pps: FlowTimeline.__state().pps }; }, big);
  const na = (await T()).clips;
  await page.keyboard.down('Alt'); await page.mouse.move(ad.x, ad.y); await page.mouse.down(); await page.mouse.move(ad.x + ad.pps * 2, ad.y, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Alt');
  const alt = await page.evaluate((id) => { const s = FlowTimeline.__state(); return { n: s.flow.chapters[s.ch].clips.length, orig: s.flow.chapters[s.ch].clips.find((c) => c.id === id).at, sel: s.sel && s.sel.id }; }, big);
  ok(alt.n === na + 1 && alt.orig === ad.at && alt.sel !== big, 'Alt-drag moves a copy, the clip stays');
  await page.keyboard.press('Control+z');
  ok((await T()).clips === na, 'one undo takes the copy away');
  // Timing helpers (P7): fit to the music, hold until the next cue; the overview.
  const helper = await page.evaluate(() => {
    const s = FlowTimeline.__state(), tl = s.flow.chapters[s.ch];
    const c = tl.clips.find((x) => x.loop !== 'once' && tl.markers.some((m) => m.type === 'cue' && m.at > x.at + 0.1));
    if (!c) return null;
    c.holdToCue = false; c.length = Math.max(0.5, c.length / 2);
    s.sel = { type: 'clip', id: c.id };
    return c.id;
  });
  if (helper) {
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); // a redraw of the inspector, through the history
    const btn = page.locator('#tl-inspector button', { hasText: /Hold until/ });
    ok((await btn.count()) === 1, 'a loop that does not hold offers to hold until the next cue');
    await btn.click();
    const hc = await page.evaluate((id) => { const s = FlowTimeline.__state(), tl = s.flow.chapters[s.ch]; const c = tl.clips.find((x) => x.id === id); const cue = tl.markers.filter((m) => m.type === 'cue' && m.at > c.at + 0.1).sort((a, b) => a.at - b.at)[0]; return { hold: c.holdToCue, end: c.at + c.length, cue: cue.at }; }, helper);
    ok(hc.hold && Math.abs(hc.end - hc.cue) < 1e-6, `held until its cue (ends ${hc.end}, cue ${hc.cue})`);
    await page.keyboard.press('Control+z');
  } else ok(true, '(no loop to hold in this chapter)');
  const ov = await page.evaluate(() => { const c = document.getElementById('tl-overview'); return { w: c.width, h: c.height }; });
  ok(ov.w > 100 && ov.h > 10, 'the overview of the chapter is drawn');

  // Checks: shown with nothing selected.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  ok(/Checks/.test(await page.textContent('#tl-inspector')), 'the inspector lists the checks before exporting');
  await page.click('#tl-fit');

  // Play: the chapter clock through the engine. It stops at the first cue; Go plays on.
  const firstCue = (await T()).cues[0];
  await page.evaluate((t) => { FlowTimeline.__state().playhead = Math.max(0, t - 1.2); }, firstCue);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => FlowTimeline.__state().clock && FlowTimeline.__state().clock.state === 'running', null, { timeout: 30000 });
  ok(true, 'Space plays from the playhead');
  await page.waitForFunction(() => FlowTimeline.__state().clock && FlowTimeline.__state().clock.state === 'cue', null, { timeout: 8000 });
  const atCue = await page.evaluate(() => FlowTimeline.__state().clock.position());
  ok(Math.abs(atCue - firstCue) < 1e-6, `the clock stops at the cue (${atCue.toFixed(3)} for ${firstCue})`);
  ok(await page.isVisible('.tl-go'), 'Go shows while the table waits');
  const ph1 = await page.evaluate(() => document.getElementById('tl-ph').style.transform);
  await page.click('.tl-go');
  await page.waitForTimeout(700);
  const run = await page.evaluate(() => ({ st: FlowTimeline.__state().clock && FlowTimeline.__state().clock.state, p: FlowTimeline.__state().clock && FlowTimeline.__state().clock.position(), voices: FlowTimeline.__state().voices.size }));
  ok(run.st === 'running' && run.p > firstCue + 0.4, `Go plays on (${run.st}, ${run.p && run.p.toFixed(2)} s)`);
  ok(run.voices > 0, `sounds play through the engine (${run.voices})`);
  ok((await page.evaluate(() => document.getElementById('tl-ph').style.transform)) !== ph1, 'the gold playhead moves');
  await page.keyboard.press('Space');
  ok(!(await page.evaluate(() => FlowTimeline.__state().clock)), 'Space stops');

  // Back to the steps: they play what the timeline says.
  await page.click('#tl-back');
  await page.waitForFunction(() => !document.getElementById('editor').hidden);
  await page.waitForTimeout(400);
  const rec = await page.evaluate(async (u) => { const r = await FlowDB.get(u); return { hasTl: !!r.timeline, v2: r.timeline, v1: r.flow }; }, uid);
  ok(rec.hasTl && rec.v2.version === 2, 'the timeline is kept with the story');
  const lowered = await page.evaluate((v2) => BalladeTimeline.toV1(v2).chapters[0].steps, rec.v2);
  ok(JSON.stringify(lowered) === JSON.stringify(rec.v1.chapters[0].steps.map((s) => s)), 'its steps are the timeline lowered');
  ok(await page.isVisible('#fe-tlnote'), 'the steps view says it was built on the timeline');
  // A sound previewed in the steps view (its length learnt) keeps the timeline; a step changed drops it.
  await page.evaluate(async (u) => { const r = await FlowDB.get(u); r.lengths = {}; await FlowDB.put(r); }, uid);
  await page.evaluate((u) => { location.hash = '#/'; }, uid); await page.waitForTimeout(300);
  await page.evaluate((u) => { location.hash = `#/edit/${u}/0`; }, uid);
  await page.waitForSelector('#fe-timeline'); await page.waitForTimeout(800);
  const pv = page.locator('#fe-sounds button.pv').first();
  ok((await pv.count()) === 1, 'the steps view lists the sounds with a listen button');
  await pv.click(); await page.waitForTimeout(800);
  ok(await page.evaluate(async (u) => Object.keys((await FlowDB.get(u)).lengths || {}).length > 0, uid), 'listening learnt the length of the sound');
  await page.waitForTimeout(700);
  ok(await page.evaluate(async (u) => !!(await FlowDB.get(u)).timeline, uid), 'opening the steps and listening to a sound keeps the timeline');

  // Export, then read again.
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.click('#fe-forge');
  const file = await (await dl).path();
  const read = await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const r = await TroubadourBallade.read(new File([bin], 'x.troubadour-ballade'));
    return { tl: !!r.timeline, v: r.flow.version, clips: r.timeline && r.timeline.chapters[0].clips.length, cues: r.timeline && r.timeline.chapters[0].markers.filter((m) => m.type === 'cue').length };
  }, fs.readFileSync(file).toString('base64'));
  const now = rec.v2.chapters[0];
  ok(read.tl && read.v === 1 && read.clips === now.clips.length && read.cues === now.markers.filter((m) => m.type === 'cue').length, `exported: flow.json (version ${read.v}) and timeline.json (${read.clips} clips, ${read.cues} cues), read back the same`);
  if (process.env.SHOT) {
    await page.evaluate((u) => { location.hash = `#/timeline/${u}/0`; }, uid);
    await page.waitForFunction(() => !document.getElementById('timeline').hidden && document.querySelectorAll('#tl-tracks .tl-clip').length > 0);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: process.env.SHOT });
  }
  ok(!errors.length, `no page error${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `${failures} of ${checks} checks failed` : `All ${checks} checks pass.`);
process.exit(failures ? 1 : 0);
