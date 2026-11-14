# Map sound lab

Phases M0 and M1 of `261114_map_plan.md`. Measures, in headless Chromium, what keeps Troubadour Map from sounding smooth.

```
cd tests/map
npm install
npx playwright install chromium
node run.mjs path/to/world.troubadour-map
```

1. **Offline**: every looping sound of the world, rendered through the shared engine (`docs/ballade/ballade-engine.js`): a hole or a click at a loop turn fails. It also tells how even the loudness is by kind, and which loops end and start at different levels by themselves (told, not failed: that is the sound).
2. **Live**: the real app opens the world at the table. Time to open, time to change map, then streamed loops are taken to their turn and the master is recorded through it, against the same sound away from its turn.

Writes `report.json`. Exits 1 on a problem. It needs a world file, so it runs by hand (worlds are too heavy for the repo).

The Wolves of Hollowmere, 14 November 2026: as the loops were, 17 had a hole at each turn (16 to 4441 ms). With Map 261114.02: no hole, no click; loudness apart by 0 dB (music), 3.2 dB (ambiances), 2.5 dB (events) once evened out, from 2, 8.7 and 8.3 dB; world open in under 1 s once measured, maps changed in under 100 ms.
