// Ballade format version 2 (261114_ballade_plan.md, P2, and the clock of 4.1): conversion, round trip, timing.
//   node tests/ballade/timeline.mjs
// 1. Every discovery tale converts from version 1: every card becomes one clip, every gate after the first a cue,
//    every relative time kept, no two clips overlapping on one track, held clips ending at their cue.
// 2. A converted file cleans to itself (round trip).
// 3. Lowered back to version 1, every card is where it was (the player of today reads version 1).
// 4. The clock plays a chapter with cues and a choice: every sound starts within 5 ms of its place on the
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

/* ---------- Back to version 1 (the player of today reads it) ---------- */
// A converted tale lowered again: every card starts where it did, counted from its gate, with its file, start,
// volume and way of playing; the same gates; the same choices. Then a free version 2 timeline (four sounds at once,
// sections, a muted track, a track's volume) lowers to steps a version 1 player plays at the same times.
console.log('Version 2 to version 1');
const v1Key = (run, at, c) => `${run}|${Math.round(at * 1000)}|${c.file}|${c.start || 0}|${c.volume}|${playOf(c)}|${holds(c)}`;
for (const f of tales) {
  const v1 = JSON.parse(execFileSync('unzip', ['-p', path.join(disc, f), 'flow.json']).toString());
  const back = T.toV1(T.fromV1(v1));
  ok(back.version === 1 && back.id === v1.id, `${f}: lowered to version 1, same id`);
  const same = (s1, s2, where) => {
    const a = v1Starts(s1 || []).map(([r, at, c]) => v1Key(r, at, c)).sort(), b = v1Starts(s2 || []).map(([r, at, c]) => v1Key(r, at, c)).sort();
    ok(JSON.stringify(a) === JSON.stringify(b), `${where}: every card where it was (${a.length} and ${b.length})`);
    ok((s2 || []).every((s) => s.cards.length <= 3), `${where}: at most three cards a step`);
    ok((s1 || []).filter((s, i) => i > 0 && s.gate).length === (s2 || []).filter((s, i) => i > 0 && s.gate).length, `${where}: the same gates`);
  };
  v1.chapters.forEach((ch, i) => {
    same(ch.steps, back.chapters[i].steps, `${f} ch${i + 1}`);
    const walk = (c1, c2, where) => {
      if (!c1) { ok(!c2, `${where}: no choice`); return; }
      ok(!!c2 && c2.answers.length === c1.answers.length && c2.question === c1.question && !('at' in c2), `${where}: the choice`);
      c1.answers.forEach((a, j) => { same(a.steps, c2.answers[j].steps, `${where} way ${j + 1}`); walk(a.choice, c2.answers[j].choice, `${where} way ${j + 1}`); });
    };
    walk(ch.choice, back.chapters[i].choice, `${f} ch${i + 1}`);
  });
}
{
  const clip = (id, track, at, length, extra) => Object.assign({ id, track, name: id, file: `${id}.mp3`, kind: 'ambience', at, in: 0, length, loop: 'once', fadeIn: 0, fadeOut: 0, fadeCurve: 'equal-power', volume: 0.5, holdToCue: false }, extra);
  const tl = {
    tracks: [{ id: 'a', name: 'Rain', kind: 'ambience', volume: 0.5, mute: false }, { id: 'b', name: 'Hits', kind: 'events', volume: 1, mute: false }, { id: 'm', name: 'Muted', kind: 'music', volume: 1, mute: true }],
    clips: [clip('r', 'a', 0, 20, { loop: 'loop', holdToCue: true }), clip('e1', 'b', 2, 1), clip('e2', 'b', 2, 1), clip('e3', 'b', 2.5, 1), clip('e4', 'b', 3, 1), clip('x', 'm', 1, 5), clip('after', 'b', 21, 2), clip('sec', 'b', 25, 2)],
    markers: [{ id: 'q', type: 'cue', at: 20, name: 'The door' }, { id: 's', type: 'section', at: 24, name: 'Inside' }],
  };
  const steps = T.stepsOf(tl);
  const starts = v1Starts(steps.map((s) => Object.assign({}, s, { cards: s.cards })));
  const at = (name) => { const x = starts.find(([, , c]) => c.name === name); return x && [x[0], Math.round(x[1] * 1000) / 1000]; };
  ok(JSON.stringify(at('r')) === '[0,0]' && JSON.stringify(at('e4')) === '[0,3]' && JSON.stringify(at('e1')) === '[0,2]', 'free timeline: four sounds at once start where they are, over two steps');
  ok(JSON.stringify(at('after')) === '[1,1]' && JSON.stringify(at('sec')) === '[1,5]', 'free timeline: after the cue, counted from it, sections kept');
  ok(!at('x'), 'free timeline: a muted track is left out');
  ok(steps.find((s) => s.cards.some((c) => c.name === 'r')).cards.find((c) => c.name === 'r').volume === 0.25, "free timeline: a track's volume multiplies its clips'");
  ok(steps.filter((s) => s.gate).length === 2 && steps[0].gate && steps.find((s) => s.title === 'The door').gate, 'free timeline: the cue is a gate, named');
  ok(steps.some((s) => s.title === 'Inside' && !s.gate), 'free timeline: a section is a step of its own');
  const runLen = steps.slice(0, steps.findIndex((s, i) => i > 0 && s.gate)).reduce((a, s) => a + len(s), 0);
  ok(Math.abs(runLen - 20) < 1e-6, `free timeline: the gate falls on its cue (${runLen} s)`);
  ok(steps.every((s) => s.cards.length <= 3), 'free timeline: at most three cards a step');
  // Times that version 1 cannot hold (hundredths) are rounded where they stand, never adding up along a run.
  const fine = { tracks: [{ id: 'e', name: 'Events', kind: 'events', volume: 1, mute: false }], clips: Array.from({ length: 12 }, (_, i) => clip(`f${i}`, 'e', 1.04 + i * 2.04, 0.5)), markers: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, type: 'section', at: 0.97 + i * 4.08, name: `S${i}` })) };
  const fs1 = v1Starts(T.stepsOf(fine).map((s) => ({ ...s, next: Math.round(s.next * 10) / 10, cards: s.cards.map((c) => ({ ...c, offset: Math.round(c.offset * 10) / 10 })) })));
  const worst = Math.max(...fine.clips.map((c) => Math.abs(fs1.find(([, , k]) => k.name === c.id)[1] - c.at)));
  ok(worst <= 0.0501, `hundredths rounded to tenths where they stand: every sound within 0.05 s (worst ${worst.toFixed(3)} s)`);
  // Two clips overlapping on one track crossfade over the overlap.
  const xf = { tracks: [{ id: 'm', name: 'Music', kind: 'music', volume: 1, mute: false }], clips: [clip('a', 'm', 0, 10, { kind: 'music', fadeOut: 1 }), clip('b', 'm', 7, 10, { kind: 'music' }), clip('c', 'm', 8, 1, { kind: 'music' })], markers: [] };
  const fd = T.fadesOf(xf);
  ok(fd.get('a').fadeOut === 3 && fd.get('b').fadeIn === 3, `overlap of 3 s: a fades out and b fades in over 3 s (${fd.get('a').fadeOut}, ${fd.get('b').fadeIn})`);
  ok(fd.get('c').fadeIn === 0, 'a clip inside another is heard over it, without a crossfade');
  ok(T.overlapsOf(xf).some((o) => o.at === 7 && o.length === 3), 'the overlap is told, for the builder');
  const lc = T.stepsOf(xf).flatMap((s) => s.cards);
  ok(lc.find((c) => c.name === 'a').fadeOut === 3 && lc.find((c) => c.name === 'b').fadeIn === 3, 'lowered, the cards carry the crossfade');
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
