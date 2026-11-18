// Troubadour statecharts as tests (261118_troubadour_unifier.md, section 4 and P4).
// Each chart is a transition table: for every state, every event, the state that must follow. The runner builds
// each state on the real shared code (fakes stand in for the browser's audio), fires each event and checks.
// An event with no arrow must leave the state as it was: an impossible state fails here before it ships.
//
//   node tests/statecharts/run.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (rel, ctx) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, checks = 0;
const ok = (cond, label) => { checks++; if (!cond) { failures++; console.log('  FAIL', label); } };

/* ---------- Fakes: a media element and an audio context, enough for the card's logic ---------- */
class Param {
  constructor(v) { this.value = v; }
  setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } setTargetAtTime(v) { this.value = v; }
  cancelScheduledValues() {} cancelAndHoldAtTime() {}
}
class FakeNode { constructor() { this.gain = new Param(1); } connect(n) { return n; } disconnect() {} }
class FakeAudio {
  constructor() { this.currentTime = 0; this.duration = 10; this.paused = true; this.loop = false; this.preload = ''; this.l = {}; this.dataset = {}; }
  addEventListener(t, f) { (this.l[t] ||= []).push(f); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {} removeAttribute() {}
  set src(v) { this._src = v; } get src() { return this._src; }
  fire(t) { (this.l[t] || []).forEach((f) => f()); }
}
function sandbox() {
  const g = { console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Math, Number, Object, Array, Map, Set, JSON, isFinite, performance, Float32Array };
  g.globalThis = g; g.window = g;
  g.Audio = FakeAudio;
  g.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL() {} };
  g.document = { addEventListener() {}, hidden: false };
  g.addEventListener = () => {};
  return vm.createContext(g);
}

/* ---------- 4.1 A sound card (shared by the web player and Troubadour for iPhone) ---------- */
async function card() {
  console.log('Sound card (shared/troubadour-voice.js)');
  const sb = sandbox();
  load('docs/shared/troubadour-engine.js', sb);
  load('docs/shared/troubadour-voice.js', sb);
  const ctx = { currentTime: 0, state: 'running', createGain: () => new FakeNode(), createMediaElementSource: () => new FakeNode() };
  const Voice = sb.TroubadourVoice.define({
    audio: () => ctx, ctx: () => ctx, master: () => new FakeNode(), settings: { even: true }, curve: (v) => v * v,
    paintCard() {}, playAfter() {},
  });
  const zone = (id, loop) => ({ id, loop });
  const make = (loop = 'once') => new Voice({ loop, volume: 0.75 }, zone(loop === 'random' ? 'events' : 'music', 0), {});

  // How to bring a card into each state.
  const STATES = {
    loading: async () => make(),
    ready: async () => { const v = make(); v.attach({}); return v; },
    playing: async () => { const v = await STATES.ready(); v.play(); return v; },
    paused: async () => { const v = await STATES.playing(); v.pause(40); await sleep(70); return v; },
    ending: async () => { const v = await STATES.playing(); v.end(400); return v; },
    error: async () => { const v = await STATES.ready(); v.el.fire('error'); return v; },
  };
  const EVENTS = {
    play: (v) => v.play(),
    pause: (v) => v.pause(40),
    end: (v) => v.end(400),
    ended: (v) => v.el && v.el.fire('ended'),
  };
  // The chart: state -> event -> next state ('=' : unchanged).
  const CHART = {
    loading: { play: '=', pause: '=', end: '=', ended: '=' },
    ready: { play: 'playing', pause: '=', end: '=', ended: '=' },
    playing: { play: 'playing', pause: 'paused', end: 'ending', ended: 'ready' },
    // ended while paused: the sound ran out during the pause's fade, nothing is left to resume.
    paused: { play: 'playing', pause: '=', end: 'ready', ended: 'ready' },
    ending: { play: 'playing', pause: 'paused', end: 'ending', ended: 'ready' },
    error: { play: '=', pause: '=', end: '=', ended: '=' },
  };
  for (const [s, row] of Object.entries(CHART)) {
    for (const [e, want] of Object.entries(row)) {
      const v = await STATES[s]();
      ok(v.state === s, `${s}: could not reach the state (got ${v.state})`);
      EVENTS[e](v);
      const exp = want === '=' ? s : want;
      ok(v.state === exp, `${s} --${e}--> ${exp}, got ${v.state}`);
    }
  }
  // Timed arrows.
  { const v = await STATES.ending(); await sleep(480); ok(v.state === 'ready', `ending --fade over--> ready, got ${v.state}`); }
  { const v = await STATES.paused(); ok(v.el.paused, 'paused: the element stops once the fade is over'); }
  // Loop modes.
  { const v = new Voice({ loop: 'twice', volume: 1 }, zone('ambience', 0), {}); v.attach({}); v.play(); v.el.fire('ended');
    ok(v.state === 'playing', `twice: first end --> playing, got ${v.state}`); v.el.fire('ended'); ok(v.state === 'ready', `twice: second end --> ready, got ${v.state}`); }
  { const v = new Voice({ loop: 'infinite', volume: 1 }, zone('ambience', 0), {}); v.attach({}); ok(v.el.loop === true, 'infinite: the element loops natively'); }
  { const v = new Voice({ loop: 'random', volume: 1 }, zone('events', 0), {}); v.attach({}); v.play(); ok(v.rnd === true, 'random: playing keeps the sound coming back'); }
  { const v = new Voice({ loop: 'random', volume: 1 }, zone('music', 0), {}); ok(v.loop === 0, 'random is not offered on music (falls back to once)'); }
  { const v = new Voice({ loop: 'after', volume: 1 }, zone('events', 0), {}); ok(v.loop === 0, 'play after is music only (falls back to once)'); }
  // Fade-in on Play (the iPhone case): silent until the sound really comes out and the context runs, then the rise.
  {
    const ramps = [];
    const g2 = { value: 1, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v, at) { ramps.push([v, at]); this.value = v; }, setTargetAtTime(v) { this.value = v; } };
    let resumed = 0;
    ctx.state = 'suspended'; ctx.resume = () => { resumed++; ctx.state = 'running'; ctx.currentTime = 50; return Promise.resolve(); };
    const v = await STATES.ready(); v.graph(); v.env.gain = g2;
    v.play(2);
    ok(g2.value === 0 && ramps.length === 0, 'fade-in: silent until the sound comes out (no rise planned yet)');
    v.el.fire('playing'); await sleep(5);
    ok(resumed === 1, 'fade-in: a suspended context is woken first');
    ok(ramps.length === 1 && ramps[0][0] === 1 && Math.abs(ramps[0][1] - 52) < 1e-9, `fade-in: rises over 2 s from when it really plays (${JSON.stringify(ramps)})`);
    await sleep(1600);
    ok(ramps.length === 1, 'fade-in: the safety net does not rise twice');
    ctx.state = 'running';
  }
  // Measured sound: starts where it really starts, evens out, seams at the trimmed points.
  { const v = await STATES.ready(); v.info = { a: 0.2, b: 9.5, la: 0.4, lb: 9.4, lufs: -30, d: 10 }; v.play(); ok(Math.abs(v.el.currentTime - 0.2) < 1e-9, 'measured: plays from its true start');
    ok(Math.abs(v.norm - Math.pow(10, 6 / 20)) < 1e-6, 'measured music at -30 LUFS: +6 dB at most'); }
  { const v = new Voice({ loop: 'infinite', volume: 1 }, zone('ambience', 0), {}); v.attach({}); v.info = { a: 0, b: 10, la: 0.4, lb: 9.4, lufs: -22, d: 10 }; v.play();
    ok(v.seam > 0, 'measured forever loop: has a seam'); v.el.currentTime = 9.2; v.blendTick();
    ok(!!v.twin && v.el.currentTime === 0.4, 'seam: the next round starts at the loop start on a second element');
    ok(v.el.loop === true, 'seam: the native loop stays beneath'); }
}

/* ---------- Interrupted: the engine's guard (every platform comes back by itself, unless paused) ---------- */
async function interrupted() {
  console.log('Interrupted (shared/troubadour-engine.js, guard)');
  const sb = sandbox();
  const listeners = {};
  sb.document = { addEventListener: (t, f) => ((listeners[t] ||= []).push(f)), hidden: false };
  sb.addEventListener = (t, f) => ((listeners[t] ||= []).push(f));
  load('docs/shared/troubadour-engine.js', sb);
  for (const [paused, want] of [[false, 1], [true, 0]]) {
    let resumed = 0;
    const ctx = { state: 'interrupted', resume() { resumed++; this.state = 'running'; return Promise.resolve(); }, addEventListener() {} };
    for (const k of Object.keys(listeners)) delete listeners[k];
    sb.TroubadourEngine.guard(ctx, () => !paused);
    (listeners.visibilitychange || []).forEach((f) => f());
    ok(resumed === want, `interrupted --back, ${paused ? 'paused by the troubadour' : 'playing'}--> ${want ? 'resumed' : 'stays paused'}`);
  }
}

/* ---------- 4.3 A place's sounds in Map ---------- */
function place() {
  console.log('Map place (map/map-format.js, placeState)');
  const sb = sandbox();
  load('docs/map/map-format.js', sb);
  const M = sb.TroubadourMap || Object.values(sb).find((x) => x && typeof x.placeState === 'function');
  ok(!!M, 'map-format.js exposes placeState');
  if (!M) return;
  const el = { radius: 100, shape: { type: 'stamp', x: 0, y: 0, size: 40 } }; // reach: 20 (stamp) + 100
  const at = (x) => M.placeState([x, 0], el, [], 0.7).state;
  ok(at(0) === 'heard', 'inside the place: heard');
  ok(at(110) === 'heard', 'within its reach: heard');
  ok(at(200) === 'preroll', 'within 1.5 times its reach plus 80: pre-roll');
  ok(at(300) === 'asleep', 'beyond: asleep');
  // Walking in small steps: asleep never jumps to heard, heard never drops to asleep.
  const ORDER = { asleep: 0, preroll: 1, heard: 2 };
  let prev = at(400), jumps = 0;
  for (let x = 400; x >= -400; x -= 2) { const s = at(x); if (Math.abs(ORDER[s] - ORDER[prev]) > 1) jumps++; prev = s; }
  ok(jumps === 0, `walking across: always through pre-roll (${jumps} jumps)`);
  // A wall muffles but does not change the pre-roll ring.
  const wall = [{ points: [[60, -50], [60, 50]] }];
  const h = M.placeState([110, 0], el, wall, 0.7);
  ok(h.state === 'heard' && h.gain < M.placeState([110, 0], el, [], 0.7).gain, 'behind a wall: heard, softer');
}

/* ---------- 4.2 A Ballade chapter ---------- */
function ballade() {
  console.log('Ballade chapter: in a browser, tests/ballade/statechart.mjs (Ballade sound lab workflow)');
}

await card();
await interrupted();
place();
ballade();
console.log(failures ? `${failures} of ${checks} checks failed` : `All ${checks} checks pass.`);
process.exit(failures ? 1 : 0);
