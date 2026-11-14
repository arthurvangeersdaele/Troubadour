# Ballade sound lab

Phase 0 of `261114_ballade_plan.md`. Measures, in headless Chromium, what keeps Troubadour Ballade from being gapless: silence at the ends of looping files (a hole at every turn), jumps at loop seams (clicks), hard starts and hard stops.

```
cd tests/ballade
npm install
npx playwright install chromium
node run.mjs                      # every discovery tale
node run.mjs path/to/story.troubadour-ballade
```

Writes `report.json`. The GitHub workflow `Ballade sound lab` runs it on every change to the Ballade and keeps the report. It only reports for now; once the new engine lands (phase 1), the same checks become pass or fail.

Baseline, 14 November 2026 (today's player): every looping sound of both discovery tales has a hole at each turn, from 44 ms to 873 ms (encoder silence at the ends of the MP3 files), and 7 loops click at their seam.
