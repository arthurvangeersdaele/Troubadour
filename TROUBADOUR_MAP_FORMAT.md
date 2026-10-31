# The `.troubadour-map` file format (version 1)

A `.troubadour-map` file is a **world**: a `.troubadour` file (see [TROUBADOUR_FORMAT.md](TROUBADOUR_FORMAT.md)) with one more entry, `map.json`. A world holds **places**, each one a map drawn by the troubadour, and every place holds **elements**: shapes drawn by hand or stamped from the library (a lake, mountains, a forest), which can carry sound cards. **Walls** are drawn on the map too: they muffle the sounds behind them. At the table, the troubadour drags the **player point** across the map and hears what the party hears.

Troubadour Map (`docs/map/`) writes and plays it.

## Container

The same ZIP as a `.troubadour` (stored entries, UTF-8 names, no ZIP64), with the `.troubadour-map` extension:

```
story.json
map.json
sounds/1/music/01-tavern-hearth.mp3
...
```

`story.json` and the audio are kept exactly as in the `.troubadour` the world was made from, revision included: every sound card of the map points to a sound of that story. Dropping `map.json` gives that `.troubadour` back: Troubadour Map does it with **Export .troubadour**.

## `map.json`

```json
{
  "format": "troubadour-map",
  "version": 1,
  "id": "7c2e4f1a-0b9d-4e63-8a27-5d1f6c3b9e40",
  "story": "6f1c2a7e-4b8d-4f3a-9a51-2d0c8e7b1f42",
  "revision": 2,
  "bard": "Chiffon",
  "created": "2026-10-31T17:40:00Z",
  "forged": "2026-10-31T19:12:09Z",
  "generator": "Troubadour Map (web)",
  "wallLoss": 0.7,
  "places": [
    {
      "id": "nave",
      "title": "The flooded nave",
      "width": 2000,
      "height": 1250,
      "player": [1000, 900],
      "general": [
        { "name": "Abbey organ", "file": "sounds/1/music/01-abbey-organ.mp3", "zone": "music", "play": "loop", "autoplay": true, "volume": 0.6 }
      ],
      "walls": [
        { "points": [[400, 200], [400, 1000], [1600, 1000]] }
      ],
      "elements": [
        {
          "id": "font",
          "title": "Holy water font",
          "shape": { "type": "path", "closed": true, "points": [[900, 500], [980, 470], [1040, 540], [960, 600]] },
          "radius": 260,
          "cards": [
            { "name": "Dripping water", "file": "sounds/1/ambience/02-drips.mp3", "zone": "ambience", "play": "loop", "autoplay": true, "volume": 0.8 },
            { "name": "Whispers", "file": "sounds/1/events/03-whispers.mp3", "zone": "events", "play": "random", "autoplay": true, "gapMin": 4, "gapMax": 20, "volume": 0.5 }
          ],
          "link": null
        },
        {
          "id": "stairs",
          "title": "Stairs to the crypt",
          "shape": { "type": "stamp", "stamp": "stairs", "x": 1500, "y": 300, "size": 140, "rotation": 0 },
          "radius": 0,
          "cards": [],
          "link": "crypt"
        }
      ]
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `format` | string | Always `"troubadour-map"`. |
| `version` | integer | `1`. A reader refuses versions it does not know. |
| `id` | string | UUID of the world, created the first time it is forged, kept by every later revision. |
| `story` | string | `id` of the story in `story.json`. |
| `revision` | integer | Hidden counter, +1 every time the world is forged. |
| `bard` | string | Troubadour name of whoever forged this revision (registered name, or `"Forgotten Troubadour"`). |
| `created`, `forged`, `generator` | string | As in `story.json`. |
| `wallLoss` | number | 0 to 1, default 0.7: the share of a sound that each wall between it and the player point takes away (0.7: a wall leaves 30 % of the sound, two walls 9 %). |
| `places` | array | At least one place, in the order of the world. |

A **place** (one map):

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique in the world; links point to it. |
| `title` | string | Shown at the top of the map. |
| `width`, `height` | number | Size of the map, in map units (400 to 8000). Every coordinate below is in these units, from the top left corner. |
| `player` | [x, y] | Where the player point stands when the place opens. |
| `general` | array of cards | Sounds of the whole place: heard everywhere at their own volume, never muffled by distance or walls. |
| `walls` | array | Each `{ "points": [[x, y], ...] }`, an open line of 2 points or more. |
| `elements` | array of elements | Drawn shapes and library drawings, in drawing order (the last on top). |

An **element**:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique in the place. |
| `title` | string | May be empty. |
| `shape` | object | `{ "type": "path", "closed": bool, "points": [[x, y], ...] }` for a shape drawn by hand (closed: an area, open: a line such as a river), or `{ "type": "stamp", "stamp": "<name>", "x", "y", "size", "rotation" }` for a library drawing centred on `x`, `y`, `size` units wide, turned by `rotation` degrees. |
| `radius` | number | 0 to 4000: how far beyond its outline its sounds carry. Shared by all its cards. |
| `cards` | array of cards | 0 or more sounds of the story. An element without cards is a drawing only. |
| `link` | string or `null` | `id` of another place of the world: tapping the element at the table offers to go there. |

Library drawings known in version 1: `lake`, `mountains`, `hill`, `forest`, `tree`, `swamp`, `rocks`, `fire`, `tower`, `ruins`, `cave`, `stairs`, `door`, `bridge`, `tent`, `well`, `altar`, `grave`. A reader that does not know a stamp draws it as a plain circle of its size, and keeps it when it re-saves the file.

A **card**:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Card title. |
| `file` | string | Path of the audio entry in the archive (any sound of the story, from any chapter or the soundbox). |
| `zone` | string | `music`, `ambience`, `events` or `soundbox`: the colour of the card. |
| `play` | string | `loop`: again and again without a break. `once`: one time, when the troubadour taps it. `random`: it plays, waits a random pause of `gapMin` to `gapMax` seconds, and plays again. |
| `autoplay` | boolean | `true`: the card starts when its place opens (`loop` and `random` only). `false`: it waits for the troubadour's tap. |
| `gapMin`, `gapMax` | number | `random` only, in seconds (default 5 and 30). |
| `volume` | number | 0 to 1, default 0.75. |

Unknown fields must be kept when a tool re-saves a file.

## Hearing a place

Every card of an element plays (or waits) wherever the player point is; only its loudness follows the map:

1. **Distance.** `d` is the distance from the player point to the element: 0 inside a closed shape, else the distance to its outline (to its line, for an open shape). A stamp counts as a disc of diameter `size`. The card is heard at `volume × (1 − d / radius)` while `d < radius`, and not at all beyond. An element with a radius of 0 is heard only from inside it.
2. **Walls.** Draw a straight line from the player point to the nearest point of the element (no line when the point is inside). Each wall segment it crosses multiplies the sound by `1 − wallLoss`.
3. **General cards** ignore both: they are heard at their own `volume` everywhere on their place.

Moving the player point changes every gain smoothly (a short glide, no clicks). Leaving a place for another fades out every sound of the first place and starts the cards of the second that `autoplay`.

## A first world from a `.troubadour`

Importing a plain `.troubadour` builds a world with one place per chapter, named after it. The chapter's music and ambiances become the place's general cards (the first music and every endless ambiance start with the place); its events wait in the sound list, to be laid on the map. Nothing is drawn yet: the troubadour draws walls and elements, and drops sound cards on them.
