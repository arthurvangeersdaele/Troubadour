# Map sound lab

Phases M0 and M1 of `261114_map_plan.md`. Measures, in headless Chromium, what keeps Troubadour Map from sounding smooth.

```
cd tests/map
npm install
npx playwright install chromium
node run.mjs path/to/world.troubadour-map
```

1. **Offline**: every looping sound of the world, rendered through the shared engine (`docs/shared/troubadour-engine.js`): a hole or a click at a loop turn fails. It also tells how even the loudness is by kind, and which loops end and start at different levels by themselves (told, not failed: that is the sound).
2. **Live**: the real app opens the world at the table. Time to open, time to change map, then streamed loops are taken to their turn and the master is recorded through it, against the same sound away from its turn.

Writes `report.json`. Exits 1 on a problem. It needs a world file, so it runs by hand (worlds are too heavy for the repo).

The Wolves of Hollowmere, 14 November 2026: as the loops were, 17 had a hole at each turn (16 to 4441 ms). With Map 261114.02: no hole, no click; loudness apart by 0 dB (music), 3.2 dB (ambiances), 2.5 dB (events) once evened out, from 2, 8.7 and 8.3 dB; world open in under 1 s once measured, maps changed in under 100 ms.

## Listening in the editor (M3)

```
node tests/map/listen.mjs [path/to/world.troubadour-map]
```

Runs `docs/map-preview` when it exists (`MAP_APP=map` for the live app), on the discovery world by default. Checks that the editor opens silent, that Listen (the headphones, or S) opens Heard now, that the panel lists what the golden point hears as it moves, the loudest on top, that the meter reads the mix, that a slider sets a card's volume, that listening follows a change of map, and that the table shows neither. Uses the Playwright of `tests/ballade`. Run by the Map editor workflow.

## The codes of an editor (M4)

```
node tests/map/editor.mjs [path/to/world.troubadour-map]
```

Undo and redo for every change (drawing, sounds, their settings), a step per change once things settle, 200 per map; what the app learns of a sound by itself (its length) is no step. The clipboard: copy, cut, paste at the pointer (on any map of the world), duplicate, Alt-drag. Snapping to the edges and middles of the other places, with a gold guide, and Ctrl held to move freely. The reach handle. The page of keys (?). 50 undos and 50 redos give the same map.

## The intro and the outro

```
node tests/map/intro-outro.mjs
```

On the discovery Forest Adventure: no music on a whole map once imported. With the setting Intro and outro, the intro is offered as the world opens at the table, its ambiances and events wait silent, it plays once, and they fade in at its end; skipped, they start at once. Leaving, the outro is offered; they fade out as it starts, and the app goes back to the worlds when it ends. Off, neither is offered. Run by the Map editor workflow.
