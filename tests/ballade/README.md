# Ballade sound lab

Phases 0 and 1 of `261114_ballade_plan.md`. Measures, in headless Chromium, what keeps Troubadour Ballade from being gapless: silence at the ends of looping files (a hole at every turn), jumps at loop seams (clicks), hard starts and hard stops.

```
cd tests/ballade
npm install
npx playwright install chromium
node run.mjs                      # every discovery tale
node run.mjs path/to/story.troubadour-ballade
```

Writes `report.json` with two lists per tale: `before` (the raw files looped the old way) and `engine` (every card played through `docs/ballade/ballade-engine.js`, as the player does). It exits 1 when the engine list is not empty. The GitHub workflow `Ballade sound lab` runs it on every change to the Ballade and keeps the report.

Baseline, 14 November 2026 (today's player): every looping sound of both discovery tales has a hole at each turn, from 44 ms to 873 ms (encoder silence at the ends of the MP3 files), and 7 loops click at their seam.

With the engine (Ballade 261114.1): both tales clean, no hole, no click, no hard start or stop.
