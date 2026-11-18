// Ballade format version 2 (261114_ballade_plan.md, P2, and the clock of 4.1): conversion, round trip, timing.
//   node tests/ballade/timeline.mjs
// 1. Every discovery tale converts from version 1: every card becomes one clip, every gate after the first a cue,
//    every relative time kept, no two clips overlapping on one track, held clips ending at their cue.
// 2. A converted file cleans to itself (round trip).
// 3. The clock plays a chapter with cues and a choice: every sound starts within 5 ms of its place on the
//    timeline counted from the tap that released it, pauses shift what follows by exactly their length,
//    held sounds end at Go with at least 1.5 s of fade, and the states follow the chart (4.2).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T = createRequire(import.meta.url)(path.join(ROOT, 'docs/ballade/ballade-timeline.js'));
let failures = 0, checks = 0;
const ok = (cond, label) => { checks++; if (!cond) { failures++; console.log('  FAIL', label); } };

const disc = path.join(ROOT, 'docs/discovery/ballades');
const tales = fs.readdirSync(disc).filter((f) => f.endsWith('.troubadour-ballade'));

/* Version 1 timing, written again here on purpose (an independent reading of TROUBADOUR_BALLADE_FORMAT.md). */
const playOf = (c) => (['once', 'loop', 'random'].includes(c.play) ? c.play : c.repeat ? 'loop' : 'once');
const holds = (c) => playOf(c) === 'random' || (playOf(c) === 'loop' && !!c.hold);
const len = (s) => (s.next != null ? s.next : s.cards.reduce((a, c) => (holds(c) ? a : Math.max(a, c.offset + c.duration)), 0));
function v1Starts(steps) { // per card: [run index, seconds from the run's start]
  const out = []; let run = -1, at = 0;
  steps.forEach((s, i) => { if (i === 0 || s.gate) { run++; at = 0; } else at += len(steps[i - 1]); s.cards.forEach((c) => out.push([run, at + c.offset, c])); });
  return out;
}

function checkTimeline(v1steps, tl, label) {
  const cards = v1Starts(v1steps || []);
  ok(tl.clips.length === cards.length, `${label}: ${cards.length} cards, ${tl.clips.length} clips`);
  const cues = tl.markers.filter((m) => m.type === 'cue');
  const gates = (v1steps || []).filter((s, i) => i > 0 && s.gate).length;
  ok(cues.length === gates, `${label}: ${gates} gates after the first, ${cues.length} cues`);
  const runStart = [0, ...cues.map((c) => c.at)];
  cards.forEach(([run, at, c], i) => {
    const k = tl.clips[i];
    ok(k.file === c.file && k.in === (c.start || 0) && k.volume === c.volume, `${label}: ${c.name} keeps its file, start and volume`);
    ok(Math.abs(k.at - (runStart[run] + at)) < 1e-6, `${label}: ${c.name} at ${k.at}, expected ${runStart[run] + at}`);
    ok(k.holdToCue === holds(c), `${label}: ${c.name} holds as before`);
    if (k.holdToCue) { const end = run + 1 < runStart.length ? runStart[run + 1] : tl.choice ? tl.choice.at : null; if (end != null) ok(Math.abs(k.at + k.length - end) < 1e-3 || k.length === 0.5, `${label}: ${c.name} holds to its cue`); }
  });
  const byTrack = {};
  tl.clips.slice().sort((a, b) => a.at - b.at).forEach((c) => { ok(!(byTrack[c.track] > c.at + 1e-6), `${label}: ${c.name} does not overlap on ${c.track}`); byTrack[c.track] = c.at + c.length; });
  return cues.length;
}

console.log('Ballade format version 2 (docs/ballade/ballade-timeline.js)');
const converted = [];
for (const f of tales) {
  const v1 = JSON.parse(execFileSync('unzip', ['-p', path.join(disc, f), 'flow.json']).toString());
  const v2 = T.fromV1(v1);
  converted.push([f, v2]);
  ok(v2.version === 2 && v2.id === v1.id && v2.revision === v1.revision, `${f}: version 2, same id and revision`);
  v1.chapters.forEach((ch, i) => {
    checkTimeline(ch.steps, v2.chapters[i], `${f} ch${i + 1}`);
    const walk = (c1, c2, where) => {
      if (!c1) { ok(!c2, `${where}: no choice`); return; }
      ok(!!c2 && c2.answers.length === c1.answers.length && c2.question === c1.question, `${where}: the choice and its answers`);
      c1.answers.forEach((a, j) => { checkTimeline(a.steps, c2.answers[j].timeline, `${where} way ${j + 1}`); walk(a.choice, c2.answers[j].timeline.choice, `${where} way ${j + 1}`); });
    };
    walk(ch.choice, v2.chapters[i].choice, `${f} ch${i + 1}`);
  });
  const a = T.clean(v2), b = T.clean(JSON.parse(JSON.stringify(a)));
  ok(JSON.stringify(a) === JSON.stringify(b), `${f}: cleans to itself (round trip)`);
  ok(JSON.stringify(a.chapters) === JSON.stringify(v2.chapters), `${f}: a converted file is already clean`);
}

/* ---------- The clock ---------- */
console.log('The chapter clock');
for (const [f, v2] of converted) {
  for (const [ci, ch] of v2.chapters.entries()) {
    let audio = 100; // the audio clock, s
    const starts = [], holdsEnded = [], states = [];
    const clock = new T.Clock(ch, {
      now: () => audio,
      start: (c, when, offset) => starts.push({ c, when, offset, tl: clock.tl }),
      hold: (c, when, fade) => holdsEnded.push({ c, when, fade }),
      onState: (s) => states.push(s),
    });
    const release = []; // [audio time, timeline position] of each Begin, Go, answer, resume
    const run = (secs) => { for (let t = 0; t < secs; t += 0.25) { audio += 0.25 + (Math.random() - 0.5) * 0.02; clock.tick(); if (clock.state !== 'running') break; } };
    clock.begin(); release.push([audio, 0, clock.tl]);
    let guard = 0;
    let paused = false;
    let answered = 0;
    while (clock.state !== 'ended' && guard++ < 200) {
      run(4000);
      if (!paused && clock.state === 'running') { /* never: run() stops only at a stop */ }
      if (clock.state === 'cue') {
        audio += 3.7; clock.tick(); ok(clock.state === 'cue', `${f} ch${ci + 1}: a cue waits for Go`);
        const at = clock.pos0, before = holdsEnded.length;
        clock.go(); release.push([audio, at, clock.tl]);
        ok(holdsEnded.slice(before).every((h) => h.fade >= T.HOLD_FADE - 1e-9), `${f} ch${ci + 1}: held sounds fade at least ${T.HOLD_FADE} s at Go`);
        // Pause 2 s somewhere in the next run: what follows moves by exactly 2 s.
        if (!paused) { run(0.5); clock.pause(); const p = clock.position(); audio += 2; ok(Math.abs(clock.position() - p) < 1e-9, `${f} ch${ci + 1}: the clock stands still on Pause`); clock.resume(); release.push([audio, clock.pos0, clock.tl]); paused = true; }
      } else if (clock.state === 'choice') {
        audio += 2.1; clock.tick(); ok(clock.state === 'choice', `${f} ch${ci + 1}: the choice waits for an answer`);
        clock.go(); ok(clock.state === 'choice', `${f} ch${ci + 1}: Go does not answer a choice`);
        clock.choose(0); answered++; release.push([audio, 0, clock.tl]);
      }
    }
    ok(clock.state === 'ended', `${f} ch${ci + 1}: the chapter ends (${states.join(' > ')})`);
    ok(states[0] === 'waiting' && states[1] === 'running', `${f} ch${ci + 1}: waiting, then running on Begin`);
    // Every start: within 5 ms of its place counted from the last release before it, on the same timeline.
    let worst = 0;
    for (const s of starts) {
      const rel = release.filter(([t, , tl]) => tl === s.tl && t <= s.when + 1e-9).pop();
      const late = s.offset > 0 ? 0 : Math.abs((s.when - rel[0]) - (s.c.at - rel[1]));
      worst = Math.max(worst, late);
    }
    ok(worst < 0.005, `${f} ch${ci + 1}: every sound starts within 5 ms of its place (worst ${(worst * 1000).toFixed(2)} ms)`);
    const tlIds = new Map();
    const key = (x) => { if (!tlIds.has(x.tl)) tlIds.set(x.tl, tlIds.size); return `${tlIds.get(x.tl)}:${x.c.id}`; };
    const planned = new Set(starts.map(key));
    ok(starts.length === planned.size, `${f} ch${ci + 1}: no sound planned twice`);
    ok(states.filter((x) => x === 'choice').length === answered, `${f} ch${ci + 1}: every choice answered once (nested ones included)`);
  }
}

console.log(failures ? `${failures} of ${checks} checks failed` : `All ${checks} checks pass.`);
process.exit(failures ? 1 : 0);
