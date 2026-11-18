# Statecharts as tests

The logic charts of `261118_troubadour_unifier.md` (section 4), run against the real shared code:

| Chart | Code | What is checked |
| --- | --- | --- |
| 4.1 Sound card | `docs/shared/troubadour-voice.js` (web player, Troubadour for iPhone) | every event (play, pause, end, ended) in every state (loading, ready, playing, paused, ending, error); the timed arrows; the loop modes; a measured sound's start, evening and seam |
| Interrupted | `docs/shared/troubadour-engine.js` (`guard`) | back after a call or a lock: resumed, unless the troubadour had paused |
| 4.3 Map place | `docs/map/map-format.js` (`placeState`) | heard, pre-roll, asleep by distance; walking never skips the pre-roll; walls muffle |
| 4.2 Ballade chapter | `docs/ballade/flow-player.js` (`state()`), in a browser: `tests/ballade/statechart.mjs` | waiting, Begin, pause holds the clock, the gate reached by the clock waits for Go, the choice waits for an answer, Next chapter (13 checks, in the Ballade sound lab workflow) |

```
node tests/statecharts/run.mjs
```

Runs in the Platform contract workflow on every push and pull request. A change to a chart is a change to the table in `run.mjs` first.
