# Troubadour Ballade: debug and rebuild plan

Version 1, 14 November 2026. Scope: the Ballade player (`docs/ballade/`, phones and computers) and its builder, rebuilt from scratch. Design rules: `261114_troubadour_graphic_charter.md`.

## 1. Goals

| # | Goal | Measured by |
| --- | --- | --- |
| G1 | **Gapless and smooth**: no click, no hole, no jump in volume, ever | automated render test (section 6) finds no silence over 10 ms inside a sound or between sounds meant to touch, no step over 1 dB at a seam |
| G2 | **The builder times everything** | every sound has an absolute place on its chapter's timeline; the player computes nothing the troubadour must check |
| G3 | **The fewest taps at the table** | a chapter without a choice plays from Begin to its end with **one tap**; a choice adds one tap; a cue the troubadour placed adds one tap; nothing else needs touching |
| G4 | **Builds like an editor** | a troubadour who knows any video or audio editor uses it without reading anything |
| G5 | **Holds on a phone** | a 90-minute story runs on an iPhone 12 from the Home Screen with the screen locked between taps, without a crash or a drift over 50 ms |

## 2. What is wrong today (audit)

Found in the code (`flow-player.js` 1361 lines, `flow-editor.js` 885 lines) and in the sessions of October.

### 2.1 Sound

| # | Problem | Cause | Effect |
| --- | --- | --- | --- |
| A1 | Gap at every loop of an MP3 | MP3 encoders add 576 to 2400 samples of silence at the start and the end (encoder delay and padding); `loopStart`/`loopEnd` loop the silence too | an audible hole each turn of an ambiance or a music |
| A2 | No crossfade between scenes | a gate fades the old run out and starts the new one after the pour | a drop to silence, then a fade in |
| A3 | Clicks at starts and stops | hard starts when `fadeIn` is 0; `stop()` without a micro ramp in places | clicks on events and on pause |
| A4 | Uneven loudness | each file plays at its own level; only a per card slider | music too loud next to a quiet ambiance |
| A5 | Every sound of a chapter decoded in full | `decodeAudioData` on each file (a 5 min stereo music is about 100 MB of float PCM) | memory pressure, kill risk on iPhone, a long "Loading sounds" |
| A6 | Pause rebuilds sources | resume creates a new `BufferSource` with an approximate offset; random sounds only mute | small jumps, drift between the card and the sound |
| A7 | Timing tied to drawing | gates open when the gold reaches them on screen (`goldArrived`, pixels per second, pour in pixels) | timing changes with the screen, the Wire speed setting and fonts; `requestAnimationFrame` stops when the screen locks, so a gate can open late |
| A8 | Audio clock and wake | `AudioContext` suspended by iOS on interruption (call, Siri, lock) and not always resumed; silent switch handled only through `audioSession` | silence after a phone call; a scene that never starts |

### 2.2 Model and builder

| # | Problem | Effect |
| --- | --- | --- |
| B1 | Time is relative: steps, offsets inside steps, `next`, runs between gates | the troubadour cannot see when a sound plays; the player does arithmetic at the table |
| B2 | Gates mix two ideas: "wait for the table" and "a new scene" | too many taps (every scene waits by default) |
| B3 | A loop's length is ambiguous (its own duration, the sounds beside it, "until the gate") | long or short cards for no visible reason |
| B4 | The builder is a vertical list of steps with forms | no overview, no drag in time, no waveform, no scrubbing, no undo |
| B5 | No preview that matches the player | the builder previews one card at a time with another code path |

## 3. The new model: one timeline per chapter

The `.troubadour-ballade` file gets **format version 2**. Version 1 files open and are converted (section 3.4).

### 3.1 Objects

| Object | Meaning | Main fields |
| --- | --- | --- |
| **Chapter** | one timeline | `tracks`, `clips`, `markers`, `choice` |
| **Track** | a horizontal lane; any number, any name; its kind (music, ambiance, events) only sets its default colour and loudness target | `id`, `name`, `kind` (music, ambiance, events), `volume`, `mute` |
| **Clip** | one sound placed in time | `id`, `track`, `file`, `at` (seconds from the chapter start), `in` (seconds into the file), `length`, `loop` (`once`, `loop`, `random`), `fadeIn`, `fadeOut`, `fadeCurve` (`linear`, `equal-power`, `s`), `gain` (dB), `holdToCue` (bool) |
| **Cue** (marker) | the timeline stops here and waits for the troubadour | `id`, `at`, `name`, `hold` (which clips keep looping while it waits: all `holdToCue` clips crossing it) |
| **Section** (marker) | a named moment, for reading and jumping, never stops anything | `id`, `at`, `name` |
| **Choice** | at the end of the chapter's trunk: a question and 2 or 3 ways, each a timeline of its own | `question`, `answers[{label, timeline}]` |
| **Crossfade** | two clips that overlap on one track crossfade automatically over the overlap | derived, not stored |

The player reads absolute times. The only things that stop time are **cues** and **choices**, placed by the troubadour on purpose.

### 3.2 Timing rules

1. The chapter clock runs from Begin. A clip sounds from `at` to `at + length`.
2. At a cue, the clock stops. Clips with `holdToCue` crossing the cue keep looping (sample-accurate, see 4.2); the others end as written. Go releases the clock: the next clip starts **exactly** when it would have, relative to the cue.
3. A held clip ends with a fade (the clip's `fadeOut`, at least 1.5 s) when Go is tapped, unless it continues past the cue on the timeline, in which case it simply keeps playing.
4. The chapter ends when its last clip ends. Next chapter is offered; with "Next chapter starts at once" it starts by itself after a crossfade.
5. A choice waits like a cue; the chosen way's timeline continues the clock.

### 3.3 Fewest taps

| Moment | Taps today | Taps after |
| --- | --- | --- |
| Start a chapter | 1 | 1 |
| Each scene change | 1 (every gate) | 0, unless the troubadour placed a cue |
| A choice | 1 | 1 |
| Next chapter | 1 | 0 with the setting on, else 1 |

The builder suggests cues only where the troubadour's story needs the table (opt in), never by default.

### 3.4 Converting version 1

Each run becomes a stretch of timeline; its gate becomes a cue only when it is not the first run of the chapter; card offsets become absolute `at`; `hold` cards become `holdToCue` clips ending at the next cue; choices map one to one. A converted file opens in the new builder with a banner: "Converted from an older Ballade, check the cues."

## 4. The new engine (one engine for player and builder)

A single module, `ballade-engine.js`, used by the Parade player, the builder's preview and the tests. Nothing in it draws; the screens read its clock.

### 4.1 Clock

The engine's clock is `AudioContext.currentTime` plus a chapter offset that pauses at cues and on Pause. Every sound is scheduled ahead (look-ahead 2 s, re-planned every 250 ms from a `setInterval` that keeps running with the screen locked). The screen's gold, playhead and scroll follow the engine; they never decide anything.

### 4.2 Gapless sounds

1. **Trim encoder silence** when a sound is imported: read the LAME/Xing header (encoder delay and padding) when present, else detect leading and trailing digital silence under -70 dBFS, and store `trimStart`/`trimEnd` with the sound. Loops use the trimmed points.
2. **Seam crossfade for loops** that do not loop cleanly: two sources overlapping 40 to 120 ms at the loop point with equal-power curves; the builder shows a "seam" setting per clip (auto, off, length).
3. **Micro fades**: every start and stop has at least 5 ms ramp, so nothing clicks.
4. **Crossfades** between overlapping clips on one track and between scenes released by a cue: equal-power, length from the clips' fades (default 2 s).

### 4.3 Loudness

At import, measure integrated loudness (a simplified EBU R128 on a mono sum, gated) and store a `norm` gain per sound, so every sound sits at -18 LUFS by kind: music -18, ambiance -22, events -16. Clip `gain` is relative to that. Master and per-track volumes go through the Troubadour volume curve and glide over 2 s.

### 4.4 Memory

1. Decode only what the next 3 minutes of the timeline need, plus every held clip, plus the soundbox; free buffers 30 s after their last use.
2. Musics and ambiances longer than 90 s play through streamed `<audio>` elements routed into the graph (as Troubadour Map does), with gapless looping handled by two alternating elements and the seam crossfade.
3. Decode at the context's sample rate once; never keep the compressed blob and the PCM of a sound both in memory longer than needed.

### 4.5 Interruptions

Resume the context on `visibilitychange`, `pageshow`, `audiosession` events and the first touch after an interruption; recompute the schedule from the chapter clock (which did not move while suspended); show "Tap to resume the sound" only if the browser still refuses. Keep the screen awake while a chapter plays (Wake Lock, video fallback on old iOS).

## 5. The new builder

### 5.1 Principle

A horizontal **timeline editor** like Premiere, Final Cut, Logic or Audacity, dressed in the Troubadour charter, with a **program monitor**: a phone-shaped live preview of the Parade player on the right, running on the same engine. Computer and iPad in landscape; other devices get a fallback page. Mouse and keyboard on a computer, touch on an iPad (drag, pinch to zoom, long press for the context menu, two-finger scrub), trackpad gestures supported.

### 5.2 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top bar (56): back · story title · chapter tabs · undo/redo · Forge · ⚙      │
├───────────────┬───────────────────────────────────────────┬──────────────────┤
│ Media (280)   │ Ruler with timecode, sections, cues, choice│ Program monitor  │
│  This chapter │───────────────────────────────────────────│ (phone preview,  │
│  Other chapt. │ Track headers │ Tracks with clips          │  live Parade)    │
│  Soundbox     │ (180)         │  waveforms, fades, loops   │                  │
│  Recueil      │               │                            │──────────────────│
│  search       │               │  gold playhead             │ Inspector (320)  │
│               │───────────────────────────────────────────│  selected clip,  │
│               │ Overview (mini map of the whole chapter)   │  cue or track    │
├───────────────┴───────────────────────────────────────────┴──────────────────┤
│ Transport (56): ⏮ ▶/⏸ ⏹ · timecode 00:03:12.4 · loop region · snap · zoom    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Editing codes borrowed from video and sound editors

| Code | Behaviour | Troubadour dress |
| --- | --- | --- |
| Tracks and track headers | name, kind colour strip, mute (M), solo (S), volume knob, height drag | header `--bar`, 3 px kind strip on the left like the player's zone labels |
| Clips | rounded 8 px blocks with the waveform, name on top, kind colour at 25 % fill, waveform at 70 % | waveform drawn in the kind colour, name in Barlow 13 px 600 |
| Trim | drag the left or right edge; Alt to slip the content inside the clip | edge handles appear on hover, 6 px |
| Loop extension | drag the right edge past the file's end: repeats shown as notches, like Logic's loop tail | notches in `--muted`, ∞ badge when `holdToCue` |
| Fades | corner handles drag the fade in and out; Alt-drag the curve (linear, equal-power, S) | fade drawn as a gold dashed curve over the clip |
| Gain line | a horizontal line inside the clip, drag up or down (dB shown) | thin `--text` line, value in a tooltip |
| Playhead | vertical line across ruler and tracks, draggable; scrubbing plays a short loop under it | **the gold wire**: 2 px gold, 12 px hot dot on the ruler |
| Ruler | timecode `mm:ss.t`, seconds ticks, zoom to frames of 100 ms | Barlow tabular numbers, `--muted` |
| Markers | **cues** as gold flags (stop and wait), **sections** as muted flags (labels only), the **choice** as a silver flag at the end | flags drawn like the player's gate nodes |
| Snapping | to playhead, clip edges, markers, the end of the file, a grid of 1 s or 0.1 s; toggle N | snap line flashes gold |
| Ripple | Shift-drag or Delete with ripple moves everything after; plain Delete leaves a gap | gap shown hatched |
| Crossfade | overlap two clips on a track: an X appears, equal-power by default | X in gold |
| Split | S at the playhead | |
| Selection | click, Shift for range, Cmd/Ctrl for many, rubber band; Cmd/Ctrl+A | selected: accent border + inset ring (charter 5.4) |
| Clipboard | Cmd/Ctrl+C, X, V at the playhead; Alt-drag duplicates | |
| Undo | Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, 200 steps, history panel | |
| Zoom | + and −, Cmd/Ctrl+scroll, pinch, Z to fit the chapter | |
| Transport keys | Space play/pause, J K L shuttle (reverse, stop, forward, repeat for 2×, 4×), Home/End, I/O to set the loop region | |
| Nudge | arrows move the selection by 0.1 s (Shift: 1 s) | |
| Media browser | list with waveform thumbnails, search, hover preview, drag onto a track | kind pill, duration, credits (i) |
| Inspector | fields for the selection; numbers drag horizontally to scrub values | charter dialog styles, steppers and sliders |
| Program monitor | the phone preview plays exactly what the Parade player will show and play | real Parade screen at 390 × 844, scaled |
| Overview | the whole chapter in one strip with the visible window as a gold frame | like an audio editor's overview |

### 5.4 Choices in the builder

The choice flag at the end of the trunk opens **ways**: tabs above the tracks ("Before the choice", "Yes", "No"), each a timeline continuing the clock, like takes in a take folder. The program monitor follows the selected way.

### 5.5 Automatic timing helpers

1. **Auto-arrange a chapter** from its sounds (music bed, ambiances under it, events spread on the timeline at section marks), as a starting point.
2. **Fit to music**: stretch ambiance loops to the end of the music they sit under.
3. **Cue suggestions**: a dim hint where a long silence or a music end could want a cue (never placed by itself).
4. **Checks before forging**: holes in the sound, clips cut mid-word (long silence detection), a cue with nothing held across it, sounds over -1 dBFS after gain, missing sources (Recueil rule).

## 6. Debug and test

### 6.1 Automatic tests (run in the repo, headless Chromium, on every push of `docs/ballade/`)

| Test | How | Pass |
| --- | --- | --- |
| Gapless loop | render a looping clip 10 turns with `OfflineAudioContext`; scan for runs of samples under -60 dBFS | none over 10 ms at seams |
| Seams between clips | render touching clips and crossfades | no silence over 10 ms, RMS step under 1 dB |
| Clicks | high-pass the render, find peaks over -30 dBFS at starts and stops | none |
| Timing | schedule a chapter with cues; compare planned and rendered onsets | under 5 ms |
| Conversion | open every v1 file in `docs/ballade/discovery`, convert, play | same sounds, same order, cues where gates were |
| Memory | play a 90 min synthetic story; sample `performance.memory` where available | under 300 MB, no growth per chapter |
| Format | round trip: open, forge, open again | identical JSON |

### 6.2 Device checklist (by hand, each release)

iPhone (Home Screen app), iPad, an Android phone in Chrome, a computer: lock and unlock during a cue; a phone call during a chapter; silent switch on; Bluetooth speaker connected and disconnected; background for 10 minutes; airplane mode (offline after install).

### 6.3 Instrumentation

A hidden debug overlay (five taps on the story title): engine clock, scheduled sounds, buffers in memory, decode queue, context state, last interruption. Logs can be copied to send.

## 7. Phases

Work happens on weekends and weekday evenings (project rule). One phase can take one or several sessions; each ends with a deploy and the device checklist.

| Phase | Content | Done when |
| --- | --- | --- |
| **P0 Groundwork** | test harness (6.1) running against today's player; debug overlay; this plan's open questions answered | the tests run and show today's gaps and clicks |
| **P1 Engine** | `ballade-engine.js`: clock, scheduler, micro fades, crossfades, trimming, seam crossfade, loudness, memory window, interruptions | all automatic tests pass on synthetic chapters |
| **P2 Format v2** | schema, reader/writer, v1 conversion, `TROUBADOUR_BALLADE_FORMAT.md` updated | discovery tales convert and round trip |
| **P3 Player on the engine** | Parade reads v2, draws from the engine clock; cues and choices; Next chapter auto | one tap per chapter on the discovery tales; device checklist passes |
| **P4 Builder shell** | layout, tracks, ruler, playhead, transport, zoom, media browser, drag clips, program monitor | a chapter can be built and played in the monitor |
| **P5 Builder editing** | trim, slip, loop tail, fades and curves, gain line, snapping, ripple, split, crossfades, undo, clipboard, keyboard | the editing codes of 5.3 all work |
| **P6 Markers and ways** | cues, sections, choice and ways, checks before forging | a story with a choice is built without touching JSON |
| **P7 Helpers and polish** | auto-arrange, fit to music, cue hints, overview, accessibility, charter review | the two discovery tales are rebuilt in the new builder |
| **P8 Release** | update the help pages, How to use, discovery tales v2, service worker | shipped on the site |

## 8. Risks

| Risk | Answer |
| --- | --- |
| iOS memory limits on long stories | the decode window and streamed long sounds (4.4); test on the oldest supported iPhone |
| `<audio>` elements are not sample-accurate | use them only for long beds, with seam crossfades; events always from buffers |
| Loudness measuring is slow on phones | measure in the builder (computer) and store it in the file; phones only read it |
| Converting v1 changes timing | conversion keeps every relative time; the banner asks to check cues |
| The builder grows too big for one file | modules: `engine`, `model`, `timeline-view`, `media`, `inspector`, `monitor`, `keys` |

## 9. Decisions (14 November 2026)

1. The name stays **Troubadour Ballade** (no Parade).
2. Cues never release by themselves: the table always taps Go.
3. Tracks are **free**: any number, any name; a track's kind only sets its default colour and loudness target.
4. The builder runs on a **computer and an iPad in landscape** (touch editing: drag, pinch to zoom, long press for menus, two-finger scrub). Phones and other devices get a fallback page explaining where to build.
