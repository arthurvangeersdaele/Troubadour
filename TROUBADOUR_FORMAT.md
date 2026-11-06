# The `.troubadour` file format (version 2)

A `.troubadour` file is one story, sounds included, that can be shared between game masters. The web Story builder writes it, the Recueil lists it, and the Android app and Troubadour for iPhone import and export it.

## Container

- A standard **ZIP archive** with the `.troubadour` extension.
- Entries are written **stored** (method 0, no compression): MP3 files do not compress, and stored entries open instantly on a phone. Readers must also accept **deflated** entries (method 8), in case someone zips a story by hand.
- File names are UTF-8 (general purpose flag bit 11).
- The first entry is `story.json`. Readers must not rely on the order, though.
- No ZIP64: a `.troubadour` file stays under 4 GB. Files shared through the Recueil must stay under **100 MB** (GitHub's limit).

```
story.json
sounds/1/music/01-tavern-hearth.mp3
sounds/1/ambience/01-rain-on-stone.mp3
sounds/1/events/01-church-bells.mp3
sounds/2/music/01-final-duel.mp3
sounds/soundbox/01-critical-hit.mp3
```

The folder layout above is what the builder writes, but readers find sounds **only through the `file` paths in `story.json`**, never by guessing paths. Several sounds may point to the same `file` (a sound reused in another chapter or zone): writers store it once, and readers must not assume one file per sound.

## `story.json`

The field `bard` keeps its name from the Bardic days: it holds the troubadour name.

```json
{
  "format": "troubadour",
  "version": 2,
  "id": "6f1c2a7e-4b8d-4f3a-9a51-2d0c8e7b1f42",
  "revision": 3,
  "bard": "Arthur",
  "title": "The Drowned Abbey",
  "description": "A flooded monastery, a choir of ghosts and a very angry abbot.",
  "created": "2026-10-13T18:40:00Z",
  "forged": "2026-10-15T20:12:09Z",
  "generator": "Troubadour Story builder (web)",
  "chapters": [
    {
      "title": "The flooded nave",
      "music": [
        { "name": "Tavern hearth", "file": "sounds/1/music/01-tavern-hearth.mp3", "loop": "infinite", "volume": 0.75, "duration": 182.4 }
      ],
      "ambience": [],
      "events": []
    }
  ],
  "soundbox": [
    { "name": "Critical hit", "file": "sounds/soundbox/01-critical-hit.mp3", "loop": "once", "volume": 0.75 }
  ]
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `format` | string | yes | Always `"troubadour"`. |
| `version` | integer | yes | `2`. A reader refuses versions it does not know. |
| `id` | string | yes | UUID of the story, created at the first rhythm and kept by every later revision. Lets the app recognise a newer revision of a story it already has. |
| `revision` | integer | yes | Hidden counter, 1 for the first rhythm, +1 every time the story is rhythmed again. Never typed by hand. |
| `bard` | string | yes | Troubadour name of whoever rhythmed this revision: the name registered with a GitHub account in the settings (app or web), or `"Forgotten Troubadour"` for a troubadour who has not connected one. 1 to 60 characters. |
| `title` | string | yes | Story title, 1 to 120 characters. |
| `description` | string | no | One or two sentences. |
| `created` | string | no | ISO 8601 date of the first rhythm, kept across revisions. |
| `forged` | string | no | ISO 8601 date of this revision. |
| `generator` | string | no | Tool that wrote the file. |
| `chapters` | array | yes | At least one chapter, in play order. |
| `chapters[].title` | string | yes | Chapter title. |
| `chapters[].music` / `ambience` / `events` | array of sounds | yes | The three rows of the mixing table: Music, Ambiances, Events. May be empty. |
| `soundbox` | array of sounds | yes | Quick effects for this story. May be empty. |

A **sound**:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Card title. |
| `file` | string | yes | Path of the audio entry inside the archive. MP3 recommended; OGG, M4A and WAV are accepted. |
| `loop` | string | yes | `"once"`, `"twice"` or `"infinite"` (the 1×, 2× and ∞ of the app). Events and ambiances may also use `"random"` (not music): the sound plays again and again, after a random pause of 0.5 s up to a maximum set in the player's settings (1 to 10 s). A reader that does not know `"random"` plays the sound once, and keeps the value when it re-saves the file. |
| `blend` | number | no | Seconds. Only with `"infinite"`: the end of each round fades out while the sound starts again and fades in, so the loop has no gap or click (a crossfade of the loop, at most a third of the sound). Absent or 0: a plain loop. Readers that do not know it play a plain loop and keep it when they re-save. |
| `volume` | number | no | 0 to 1, default 0.75. |
| `duration` | number | no | Seconds, informative only. |

Default loop modes used by the builder: Music and Ambiances `infinite`, Events and Soundbox `once`. Soundbox effects fire once per tap: players ignore their `loop`, and the editors show no loop button for them.

The JSON keys stay `music`, `ambience` and `events`; the apps show the rows as Music, Ambiances and Events.

Unknown fields must be kept when a tool re-saves a file, so later versions can add things without breaking older ones.

Known optional extras: files from before November 2026 may carry `"recueil": { "tale": "Werewolf", "bard": "Troubadour" }` on a sound taken from the Recueil's sound library. The `sound` block below replaces it.

### The identity of a sound

A sound may carry a `sound` block: who made it and who brought it, locked once it is in the Recueil.

```json
{ "name": "Rain on the windows", "file": "sounds/2/ambience/02-rain-on-the-windows.mp3", "loop": "infinite",
  "sound": {
    "id": "9f2c41d07a3be815",
    "origin": [ { "title": "indoors_rain.ogg", "url": "https://github.com/…/indoors_rain.ogg",
                  "original": "https://freesound.org/people/InspectorJ/sounds/346641/",
                  "project": "Cataclysm: DDA CC-Sounds", "author": "InspectorJ", "licence": "CC BY 3.0" } ],
    "edited": true,
    "parent": "1b07c3e59d40aa12",
    "brought": { "troubadour": "Chiffon", "tale": "The 1950 Asylum", "date": "2026-10-15" }
  } }
```

| Field | Notes |
| --- | --- |
| `id` | The first 16 hexadecimal digits of the SHA-256 of the audio entry's bytes. The same bytes are the same sound, whatever its name, its row or its tale. |
| `origin` | Where it comes from, one entry per source (a mix has several). `author` and `licence` are required, and `url` (the page or file of the source) unless `own` is `true` (recorded or made by its troubadour). `title`, `project` (the game or pack it comes from) and `original` (the first upload, when `url` is a copy) are optional. Licences: `CC0`, `Public domain`, `CC BY 3.0`, `CC BY 4.0`, `CC BY-SA 3.0`, `CC BY-SA 4.0`, `OGA-BY 3.0`, `GNU GPL`, `GNU GPL v2+`, `GNU GPL v3`, `GNU GPL v3+`, `BSD`. |
| `edited` | `true` when it was cut, mixed, filtered… from its origin. It stays under the licence of its origin. |
| `parent` | The `id` of the sound it was made from, when a tool changed its bytes. |
| `brought` | The troubadour who first rhythmed it into a tale, that tale and the day. |

Writers:

1. compute `id` from the bytes they store, every time they rhythm;
2. same `id` as the opened block: keep the block as it is, and add `brought` (the troubadour who rhythms, the story's title, today) if it has none;
3. different `id` (the sound was cropped or re-encoded): write a new block with the new `id`, `parent` set to the old `id`, the same `origin`, `edited: true` and a new `brought`;
4. no block: write `id` and `brought`, and `origin` once the troubadour gives it (the Story builder asks, on each card).

Readers that do not show it keep it untouched when they re-save, like any unknown field. The Android app and the iPhone app do.

The Recueil is strict: every sound of a tale in it has a `sound` block whose `id` matches its bytes, with an `origin`. Once a sound is in the Recueil, its `origin`, `edited`, `parent` and `brought` are locked: a pull request that changes them for a known `id` is refused, in any tale. Its `name` stays free, and [`docs/recueil/sounds.json`](docs/recueil/sounds.json) lists each sound once, by `id`, with every name it has in the tales (`names`), the rows it plays in (`rows`), its credits and where to fetch its bytes. A sound made from another one (`parent`) must keep every origin of it, and is shown under it in the sound libraries.

The story's own `extra` may carry `"cover": { "kind": "book", "tint": "amb", "color": "#4DB6A6" }`: the cover the apps draw for it in the library. `kind` is one of `bard` (the Troubadour wire and bars), `music`, `book`, `scroll` (chronicle) or `map` (journey). `tint` is a role of the theme, not a colour: `amb`, `evt` and `blue` are theme colours, `violet` and `ember` mixes of them, so the cover follows whatever theme the troubadour picks. `color` is that tint in the default theme, for tools that do not know themes (files from before `tint` carry only `color`, matched back to its tint). The apps pick a cover the first time they see a story (from its `id`, so the same story gets the same cover everywhere) and keep it from then on, so it travels with the file.

The Recueil's sound library relies on stored entries: a sound's bytes are one contiguous range of the `.troubadour` file, which the Story builder downloads on its own. Deflated entries still work, they are inflated after download.

## Versioning a story

Every tool that writes a `.troubadour` file (web Story builder, Android app, Troubadour for iPhone) does the same thing when it rhythms:

1. keep `id` and `created` from the opened file, or create them for a new story;
2. set `revision` to the opened revision + 1 (1 for a new story);
3. set `bard` to the registered troubadour name (or `Forgotten Troubadour`), and `forged` to now.

Nobody has to sign in. Without a GitHub connection, every file is signed **Forgotten Troubadour**. In the settings of any Troubadour (Android, iPhone, web player, Story builder), a troubadour can connect a GitHub account and register a troubadour name **once and for all**: it cannot be changed, and no other account can take it (case, accents and spacing do not make a different name). The registry is [`docs/recueil/troubadours.json`](docs/recueil/troubadours.json), written only by the sign-in helper ([`auth-worker/`](auth-worker/)).

The Recueil checks every pull request: a registered name only signs tales sent by its GitHub owner, `Forgotten Troubadour` is open to everyone, a tale already in the Recueil keeps its troubadour, and an update must raise its revision.

## Version 1

Version 1 files (October 2026) have no `id`, `revision` or `bard`, and an optional `author`. Readers still accept them: `author` becomes `bard`, `revision` counts as 1 and a new `id` is created when they are rhythmed again, which writes version 2.
