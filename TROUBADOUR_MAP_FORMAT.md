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
            { "name": "Whispers", "file": "sounds/1/events/03-whispers.mp3", "zone": "events", "play": "random", "autoplay": true, "randomMax": 20, "volume": 0.5 }
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
| `soundbox` | array | Optional. Cards (zone `soundbox`, played once) at hand on every map, behind the Soundbox button. |
| `stamps` | array | Optional. Places drawn by the troubadour, laid like the drawings of the library (an element's `shape.stamp` names one by its `id`): `{ id, name, v, strokes: [{ w, p: [[x, y], ...] }], paint: [{ c, w, p }], fills: [{ x, y, c }] }`. Points and widths run from 0 to 1 in the place's square; strokes are drawn in the map's ink, paint (the brush) under them, and each fill colours the closed shape around its point. A colour `c` is a colour of the theme (`water`, `leaf`, `stone`, `ground`, `fire`, `ambience`, `events`, `soundbox`, `music` or `hole`) or a `#rrggbb`. Older places may hold a stroke as a bare list of points (width 0.022). |
| `music` | array | Optional. Cards (zone `music`) of the world's musics, behind the Music button at the table: heard everywhere, they play on from one map to the next. Absent, a reader builds it from every music of the story. A music card laid on a place does not sound from the map: it names the music that starts (crossfading the one playing) when the party arrives on that place. |

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
| `radius` | number | 0 to 4000 map units: how far beyond its outline its sounds carry. Shared by all its cards. Troubadour Map shows it as a share of the place's width (200 on a 2000-wide place: 10 %). |
| `cards` | array of cards | 0 or more sounds of the story. An element without cards is a drawing only. |
| `link` | string or `null` | `id` of another place of the world: tapping the element at the table offers to go there. |

Library drawings known in version 1: `lake`, `mountains`, `hill`, `forest`, `tree`, `swamp`, `rocks`, `fire`, `tower`, `ruins`, `cave`, `stairs`, `door`, `bridge`, `tent`, `well`, `altar`, `grave`. A reader that does not know a stamp draws it as a plain circle of its size, and keeps it when it re-saves the file.

A **card**:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Card title. |
| `file` | string | Path of the audio entry in the archive (any sound of the story, from any chapter or the soundbox). |
| `zone` | string | `music`, `ambience`, `events` or `soundbox`: the colour of the card. |
| `play` | string | As the loop button of Troubadour: `once` (1×) one time, `twice` (2×) two times in a row, `loop` (∞) again and again without a break, `random` (not for music): it plays, waits a random pause of 0.5 s to its longest pause, and plays again; `after` (music only): a playlist, it starts when the music before it ends on its own. |
| `autoplay` | boolean | Cards of the whole place only: `true`, the card starts when its place opens; `false`, it waits for the troubadour's Play. The cards of an element always start with their place: the map alone decides how much of them is heard. |
| `randomMax` | number | Optional, 1 to 30 s: the longest pause of a `random` card, as a Troubadour sound's `randomMax`. Absent: the one of the settings (5 s by default). Older files gave `gapMin` and `gapMax`; `gapMax` is read as `randomMax`. |
| `blend` | number | Optional, in seconds: a `loop` card crosses over between two rounds over this time (at most a third of the sound), as a Troubadour sound's `blend`. |
| `volume` | number | 0 to 1, default 0.75. |

Unknown fields must be kept when a tool re-saves a file.

## Hearing a place

Every card of an element starts with its place and plays wherever the player point is (the troubadour can still pause it, stop it or change its loop at the table); only its loudness follows the map:

1. **Distance.** An element is heard at 100 % of its volume at its middle (the deepest point of a drawn area, the centre of a library drawing, anywhere on a drawn line), and less and less in a straight line out to 0 % at the edge of its reach, which is its outline grown by `radius`. With `m` the depth of its middle (half the `size` of a stamp, the largest distance from a point inside an area to its outline, 0 for a line) and `d` the distance from the player point to the outline: outside, `volume × (radius − d) / (radius + m)` while `d < radius`; inside, `volume × (radius + depth of the point) / (radius + m)`. An element with a radius of 0 is heard only inside it.
2. **Walls.** Draw a straight line from the player point to the nearest point of the element (no line when the point is inside). Each wall segment it crosses multiplies the sound by `1 − wallLoss`.
3. **General cards** ignore both: they are heard at their own `volume` everywhere on their place.

Every card behaves as a card of the Troubadour player: volumes are heard on Troubadour's curve (the square of the setting), the simple volume buttons glide 25 % in 2 s, Play rises over the fade-in of the settings (events strike at once), Pause and Stop fade out over the fade-out of the settings, starting a music crossfades the music playing in its group, ambiances can live (drift up to 10 points around their volume), and the master pause and stop fade over 3 s. Moving the player point changes every gain smoothly (a short glide, no clicks). Leaving a place for another fades out every sound of the first place and starts the cards of the second that `autoplay`.

## A first world from a `.troubadour`

Importing a plain `.troubadour` builds a world with one empty place per chapter, named after it. No sound is laid anywhere: every sound of the story waits in the sound list, and the troubadour draws walls and elements and lays the sounds on them. A card laid on the map starts as a loop for music and ambiances, at random for events and soundbox effects, starting with its place.

## A blank world, and sounds added later

A world can start blank: its `story.json` has a title and one chapter, `"Map sounds"` with `"map": true`, that holds the sounds added in Troubadour Map (audio files of the device, in `sounds/map/<row>/`). Every sound of another `.troubadour` can also join a world: they are copied into a chapter of their own, named after that story, with `"map": true` (audio in `sounds/x<n>/`). Sounds taken from the Recueil go to a chapter `"Recueil"` with `"map": true` (audio in `sounds/recueil/<row>/`), each with the `recueil` id of the sound and its `tale`. Chapters with `"map": true` are sound lists, not places: a reader making places from chapters skips them. Troubadour and the Ballade read them as ordinary chapters.
