# The `.troubadour-ballade` file format (version 1)

A `.troubadour-ballade` file is a story **and its timing**: a `.troubadour` file (see [TROUBADOUR_FORMAT.md](TROUBADOUR_FORMAT.md)) with one more entry, `flow.json`. The Ballade editor writes it on a computer; Troubadour Ballade plays it on a phone, chapter by chapter, as a cascade of timed sound cards joined by a golden wire.

## Container

The same ZIP as a `.troubadour` (stored entries, UTF-8 names, no ZIP64), with the `.troubadour-ballade` extension:

```
story.json
flow.json
sounds/1/music/01-tavern-hearth.mp3
...
```

`story.json` and the audio are kept exactly as in the `.troubadour` the Ballade was made from, revision included. Dropping `flow.json` gives that `.troubadour` back: Troubadour Ballade does it with **Export .troubadour**.

## `flow.json`

```json
{
  "format": "troubadour-ballade",
  "version": 1,
  "id": "0d6b7e7a-2f0c-4c55-9f43-3c6f1f0c1a7e",
  "story": "6f1c2a7e-4b8d-4f3a-9a51-2d0c8e7b1f42",
  "revision": 2,
  "bard": "Arthur",
  "created": "2026-10-17T07:40:00Z",
  "forged": "2026-10-17T08:12:09Z",
  "generator": "Troubadour Ballade editor (web)",
  "chapters": [
    {
      "steps": [
        {
          "title": "Opening",
          "gate": true,
          "next": null,
          "cards": [
            { "name": "Tavern hearth", "file": "sounds/1/music/01-tavern-hearth.mp3", "zone": "music",
              "offset": 0, "start": 0, "duration": 182.4, "repeat": false, "fadeIn": 2, "fadeOut": 4, "volume": 0.75 },
            { "name": "Rain on stone", "file": "sounds/1/ambience/01-rain-on-stone.mp3", "zone": "ambience",
              "offset": 5, "start": 0, "duration": 300, "play": "loop", "hold": true, "repeat": true, "fadeIn": 2, "fadeOut": 4, "volume": 0.6 }
          ]
        },
        {
          "title": "",
          "gate": false,
          "next": 12,
          "cards": [
            { "name": "Church bells", "file": "sounds/1/events/01-church-bells.mp3", "zone": "events",
              "offset": 0, "start": 0, "duration": 8.2, "play": "once", "hold": false, "repeat": false, "fadeIn": 0, "fadeOut": 0, "volume": 0.75 },
            { "name": "Crows", "file": "sounds/1/events/02-crows.mp3", "zone": "events",
              "offset": 0, "start": 0, "duration": 3.1, "play": "random", "hold": true, "repeat": true, "gapMin": 5, "gapMax": 30, "fadeIn": 0, "fadeOut": 0, "volume": 0.6 }
          ]
        }
      ]
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `format` | string | Always `"troubadour-ballade"`. |
| `version` | integer | `1`. A reader refuses versions it does not know. |
| `id` | string | UUID of the Ballade, created the first time it is rhythmed, kept by every later revision. |
| `story` | string | `id` of the story in `story.json`. |
| `revision` | integer | Hidden counter, +1 every time the Ballade is rhythmed. |
| `bard` | string | Troubadour name of whoever rhythmed this revision (registered name, or `"Forgotten Troubadour"`). |
| `created`, `forged`, `generator` | string | As in `story.json`. |
| `chapters` | array | One entry per chapter of `story.json`, in the same order. |
| `chapters[].steps` | array of steps | Played from top to bottom. |

A **step**:

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Shown on the wire. Empty: the names of its sounds. |
| `gate` | boolean | `true`: the wire stops before this step and waits for the troubadour's tap. The first step of a chapter is always a gate. |
| `next` | number or `null` | When the step after it starts, in seconds from the start of this one. `null`: when its last card that ends on its own ends (cards that `hold` are not waited for; a step of such cards alone hands over at once). Cards still playing carry on under the next step. Ignored when the next step is a gate, except to tell when the wire reaches it. |
| `cards` | array of cards | 0 to 3 sounds side by side. |

A **card**:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Card title. |
| `file` | string | Path of the audio entry in the archive (any sound of the story, from any chapter or the soundbox). |
| `zone` | string | `music`, `ambience`, `events` or `soundbox`: the colour of the card. |
| `offset` | number | Seconds after the start of the step. |
| `start` | number | Seconds into the sound where it begins (trim). |
| `play` | string | `once`: the sound plays one time. `loop`: it repeats without a break. `random`: it plays, waits a random pause of `gapMin` to `gapMax` seconds, plays again, and so on. Missing (files from before it): `loop` if `repeat`, else `once`. |
| `hold` | boolean | `true`: the card plays until the next gate is tapped, the choice is picked or the chapter is left, whatever its `duration`. Always `true` for `random`, never for `once`. |
| `duration` | number | `once`: seconds it plays, at most the length of the sound after `start`. `loop` without `hold`: seconds it loops. `random`: seconds of each play, at most the sound after `start`. A `loop` that holds keeps a duration for older players (300 s by default). |
| `repeat` | boolean | Written for the players that came before `play`: `true` for `loop` and `random`, which they loop for `duration`. |
| `gapMin`, `gapMax` | number | `random` only: the shortest and longest pause between two plays, in seconds (default 5 and 30). |
| `fadeIn`, `fadeOut` | number | Seconds, 0 for none. |
| `volume` | number | 0 to 1. |

A chapter may end on a **choice** (drawn in silver): `chapters[].choice` holds a `question` and 2 to 12 `answers`, each `{ "label", "steps" }`. The chapter's own `steps` play first; when they end, the wire stops at the silver gate and asks the question. Picking an answer plays that answer's `steps` (the first one is always a gate). An answer may end on a **choice of its own** (`answers[].choice`, same shape), and so on, up to 24 choices deep: choices nest as deep as the story needs. A way that ends with no choice ends the chapter. Ways do not join again.

```json
"choice": { "question": "Do they open the crypt?",
  "answers": [
    { "label": "Yes", "steps": [ ... ],
      "choice": { "question": "Fight or flee?",
        "answers": [ { "label": "Fight", "steps": [ ... ] }, { "label": "Flee", "steps": [] } ] } },
    { "label": "No", "steps": [ ... ] } ] }
```

In the player, only the ways picked are drawn, one after the other on the spine, each choice in silver where it is asked. A choice already passed shows the answer picked; while its way has not started yet, another answer can still be picked (what was picked after it is forgotten). Picking an answer works like a gate: whatever still plays fades out.

Unknown fields must be kept when a tool re-saves a file.

## Playing

In the player, time flows down: inside a run (a gate and the steps that follow it on their own) the run has one speed (about 420 px for the whole run, 2 to 36 px per second), each card sits at the height where it starts and is exactly as tall as it lasts at that speed (only a sound under a second or so keeps a readable minimum), so sounds that overlap stand side by side, sized alike. The time line, the gold on the cards and their progress bars move together at that speed. One spine runs down the left through every gate and every choice to Next chapter. A sound swells out of the right of its wire like the logo's split: its outline runs down along the wire, leans out over a long height (about twice the card's width, at most a third of the card), runs down at full width, and leans back into the wire the same way, while the wire goes on straight through it. Every rail runs down to the end of its run. The first lane hangs on the spine; every other lane is a rail that splits from the spine at one point under the gate, like the Troubadour Ballade logo: straight down, a slow lean across (taller the further it goes), then straight down along its cards. The gold flows down the wire and round each card as the sound plays. Each card has a start button, to start it by hand ahead of the wire; once the wire has reached it, or left its run behind, the button is gone. A card started by hand is greyed out once it has played.

A chapter opens on its first gate. Tapping a gate fades out the sounds of the run before it (its pending sounds are called off): loops and random cards that `hold` stop there, and so does anything else still playing. Picking an answer of a choice does the same. A step that follows on its own never cuts a sound: whatever plays carries on under it. Starting a step starts each of its cards after its `offset`; when the step ends (`next`, or its last card), the following step starts on its own, unless it is a gate, where the wire waits. After the last step, the wire waits for **Next chapter**. Tapping a step's node jumps the wire there; tapping a playing card fades it out.

## A first Ballade from a `.troubadour`

Importing a plain `.troubadour` builds a first Ballade for each chapter: the first music and up to two ambiances open the chapter together, then every other music, the other ambiances (three at a time) and each event get a gate of their own. Endless sounds become loops that hold until the next gate, random sounds become random cards (which hold too), sounds played twice loop for twice their length, the others play once.

## In the editor

Between two steps, the editor shows one link: **On my tap (gate)** sets `gate` on the lower step; **When the sounds end** clears it and sets `next` to `null`; **After a set time** clears it and sets `next`. Under every link, a sentence names the sounds the tap fades out, or those that carry on under the next step. The inspector of a card says the same for that card: when it starts, under which steps it carries on, and what stops it.
