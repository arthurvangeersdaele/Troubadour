# Troubadour

Bardic is now **Troubadour**. This repository starts a fresh history from Bardic as of 21 October 2026; `.bardic` and `.bardic-flow` files open everywhere as before. Setting up GitHub Pages, the GitHub sign-in and the Android builds: [261021_troubadour_setup.md](261021_troubadour_setup.md).

Game Master Phone Sound Table: an Android app that lets tabletop RPG game masters run music, ambiances and sound effects live from their phone.

Project page: https://arthurvangeersdaele.github.io/Troubadour/

## Tutorial

[![Troubadour tutorial: watch the video](docs/tutorial/261015_troubadour_tutorial_poster.jpg)](https://arthurvangeersdaele.github.io/Troubadour/tutorial/261015_troubadour_tutorial_en.mp4)

Three minutes, subtitled, no voice over: what Troubadour is, a chapter of Underwater Adventure layered sound by sound (headphones on), how to rhythm and share a story, La Troupe, and where to get Troubadour. [Watch it in English](https://arthurvangeersdaele.github.io/Troubadour/tutorial/261015_troubadour_tutorial_en.mp4), [en français](https://arthurvangeersdaele.github.io/Troubadour/tutorial/261015_troubadour_tutorial_fr.mp4), or on the [project page](https://arthurvangeersdaele.github.io/Troubadour/#tutorial). Files, subtitles (`.srt`) and sound credits are in [`docs/tutorial/`](docs/tutorial/).

**Play it in your browser:** https://arthurvangeersdaele.github.io/Troubadour/play/ with three ready-made stories (The Forest Adventure, The Big War, Underwater Adventure), the mixing table and the soundbox. More tales, like Werewolf, are in La Troupe. No import and no story editing in the web edition; its sounds live in [`docs/play/sounds/`](docs/play/sounds/).

**On iPhone:** [Troubadour for iPhone](https://arthurvangeersdaele.github.io/Troubadour/ios/) installs from Safari on the Home Screen (Share, then Add to Home Screen). It only runs from there: opened in a browser tab it shows the install steps, and on other devices it says it is made for iPhone. The Troubadour page shows its install button only on an iPhone.

## Status

**Android beta.** The app follows Troubadour for iPhone, natively:

- **Library**: stories kept on the phone, with four ways to add one: New story, Discovery (the web edition's three stories), the Recueil, Import .troubadour.
- **Story editor**: chapters (add, rename, reorder, remove), Music / Ambiances / Events and the story's own soundbox; sounds picked from the phone or a cloud folder, or reused from another story; listen, rename, reorder, loop mode.
- **Mixing table**: the chapter on screen is loaded into the engine as soon as it opens, so its sounds start instantly. Up to 20 sounds held at once; a sound of another chapter takes the voice of an idle card. Music crossfades, green-to-red progress along the bottom edge of each card with a countdown, pause/resume all, fade out all, master volume. Events and ambiances can also be set to random: they come back after a pause of 0.5 s to a maximum set in Settings (1 to 10 s). Music cannot (one track at a time, with crossfades).
- **Soundbox**: the story's effects and the shared ones, decoded in memory and fired without taking any of the 20 voices; pins.
- **Settings**: Obsidian, Parchment, Blood and Divination in dark, light or system mode, troubadour name, fade-out length, music crossfade, keep the screen awake, storage, export every story, erase everything.
- **Playback with the screen off**: a media notification with Pause all and Fade out all; pauses on phone calls and when headphones are unplugged.
- `.troubadour` import and export (format 2), with the revision counter and the troubadour name.

The engine test screen of step 1 is still there, under Settings, About, Engine test.

## Try it on your phone

1. Open the [latest dev build](https://github.com/arthurvangeersdaele/Troubadour/releases/tag/dev-latest) on your Android phone.
2. Download the `.apk` and open it. Allow installs from your browser when Android asks.
3. Tap **Discovery** to add a ready-made story, or **New story** to build one with your own sounds, then **Play**.

Every push to `main` rebuilds the APK automatically (GitHub Actions). All builds share the same debug key, so a new build installs over the previous one. When the build fails, the compiler errors are reported as an annotation on the run.

## Architecture

| Layer | Tech |
| --- | --- |
| UI | Kotlin, Jetpack Compose, landscape only; fonts Cormorant SC and Barlow Semi Condensed (SIL OFL, `app/src/main/assets/licenses/`) |
| Storage | `filesDir/library/`: one JSON file per story, the shared soundbox, and the audio files they point to (`data/Library.kt`) |
| Audio | C++ mixer on [Oboe](https://github.com/google/oboe) (AAudio / OpenSL ES), one low-latency output stream |
| Decoding | Android NDK `AMediaExtractor` + `AMediaCodec`, streamed per voice into lock-free ring buffers |
| Target | minSdk 26 (Android 8.0), targetSdk 35 (raise to 36 before publishing on Google Play) |

Engine details (`app/src/main/cpp/audio_engine.cpp`):

- up to 20 voices mixed in a single audio callback, no allocation or locks on the audio thread;
- one decoder thread fills a 2-second ring buffer per voice, so every loaded sound is pre-decoded and starts instantly;
- loop once / twice / infinite handled at decode time for gapless loops;
- fade-out on End, smoothed volume changes (no clicks), linear resampling to the device rate;
- fade envelope per voice: fade-in for crossfades, 40 ms fade on pause (no click), resume from a fade-out;
- soundbox effects decoded fully in memory and mixed as one-shots (up to 24 at once) with their own volume;
- automatic stream reopen when the output device changes (headphones, Bluetooth).

## Web edition

`docs/play/` is a static page served by GitHub Pages (no build step):

- `stories.json`: the three stories and their chapters;
- `sounds/<story>/<chapter>/{music,ambience,events}/*.mp3` and `sounds/soundbox/*.mp3`: the audio files;
- `library.json`: the list of sound files, rebuilt automatically by the **Update sound library** action when MP3s are pushed (or by hand with `python3 .github/scripts/build_sound_library.py`).

Opening a story downloads every MP3 of every chapter into memory, so each sound starts instantly. Events and ambiances can be set to random (their loop button cycles 1×, 2×, ∞, random): they play again after a pause of 0.5 s up to the longest pause set in Settings, Random sounds (1 to 10 s), like on Android and iPhone. Themes (Obsidian, Parchment, Blood, Divination, each dark or light), fade-out length, music crossfade and screen wake lock are in Settings.

## Troubadour for iPhone

`docs/ios/` is a Home Screen web app that follows the Android plan, served by GitHub Pages (no build step):

- **Stories kept on the phone**: stories, chapters and sounds live in IndexedDB (`db.js`), sounds as blobs shared between stories, and the app asks iOS for persistent storage (Settings shows whether it is granted and how much room is left).
- **Library**: new story, import a `.troubadour` from Files, add a tale of the Recueil, or add one of the three discovery stories (downloaded once from `docs/play/`).
- **Story editor**: chapters (add, rename, reorder, remove), Music, Ambiances and Events with loop mode, order and preview per sound, the story's own soundbox, a description. Sounds come from Files or are reused from any story already on the phone.
- **Mixing table**: the same table as the web player (cards, loops, random events and ambiances, fades, crossfade, master), plus a soundbox drawer with the story's effects and the shared ones. Loop and volume changes made at the table are kept.
- **Shared soundbox**: quick effects available on every table.
- **Export**: rhythms the next revision of a story (`.troubadour` format 2, signed with the troubadour name) and opens the iOS share sheet: Files, iCloud Drive, AirDrop. Files are named `YYMMDD_story-title.troubadour`. Settings can export every story at once, as a backup.
- **Settings**: theme (Obsidian, Parchment, Blood, Divination), dark, light or system, troubadour name, fade-out, music crossfade, keep the screen awake (on by default), play with the silent switch on (on by default).
- Landscape only (portrait shows a turn-your-phone screen). `sw.js` keeps the app itself offline; bump its `VERSION` (and `VERSION` in `app.js`) when shipping a change.

iOS limits to know: audio stops when the screen locks in a Home Screen app, hence the screen kept awake; storage can only be cleared by iOS when it is not marked persistent, so exporting stories now and then is the backup.

## La Troupe des Troubadours

`docs/troupe/` is the community corner of the site:

Builder and playing your own files are for computers (the app does both on a phone); on a phone La Troupe shows the Recueil only.

- **Play a tale** (`../play/#/troubadour`): opens a `.troubadour` file from the computer, or a tale of the Recueil, on the player's mixing table.
- **Story builder** (`builder.html`): name a story and its chapters, drop MP3s into Music, Ambiances, Events and the Soundbox, and download a `.troubadour` file. Everything runs in the browser, nothing is uploaded. It can also open an existing `.troubadour` to edit it. Each zone has **From a link or YouTube** (`cropper.js`): paste a link to an audio file, or a YouTube link, listen, set the start, the end and fades, and only that part is kept (encoded as MP3 in the browser by LAME, `vendor/lame.min.js`, LGPL). An audio link is fetched by the browser, so the site hosting it must allow it (CORS); otherwise download the file and drop it in the same dialog. YouTube cannot be downloaded by a web page: the video plays in an embedded player and the builder records the tab's own sound while the chosen part plays (Chrome or Edge; share **This tab** with its audio). The scissors on each card crop a sound already in the story. Events and ambiances can be set to random here too. **Recueil sounds** (`library.js`) opens a column between the chapter and the soundbox with every sound of every tale in the Recueil, searchable by sound, tale or troubadour, with Music, Ambiances, Events and Soundbox in separate tabs: listen, then drag one onto a row of the chapter or onto the soundbox, or tap Add. Only that sound's bytes are downloaded, as an HTTP range of its tale's `.troubadour` (the tales store their sounds uncompressed); if the server ignores ranges, the tale is fetched once and the sound cut out of it. Each sound appears once, with every name troubadours gave it, and its versions (crops, mixes) under it. An added sound brings its locked identity (`sound` in the `.troubadour`: source, author, licence, the troubadour who brought it). The **i** on each card (`sound-credit.js`) shows those credits, or asks for the source of a sound that has none yet: the Recueil only takes tales whose every sound has one. The story in progress is saved in the browser as it changes, sounds included (IndexedDB, `draft.js`): leaving the page or closing the tab never loses it, and it comes back on the next visit until **New story** clears it. Rhythming empties the builder for the next tale: to change a rhythmed tale again, open its `.troubadour` (its revision count carries on).
- **Recueil** (`recueil.html`): the shared library of `.troubadour` files stored in `docs/recueil/`. Anyone can add one through a pull request ([how](docs/recueil/README.md)); the **Recueil** action checks pull requests and, once they are merged, rebuilds `docs/recueil/index.json` (the tales) and `docs/recueil/sounds.json` (every sound of the Recueil once, by the id of its bytes, with its credits, all its names and rows, and its byte range in the `.troubadour`, for the sound libraries of the Story builder and the Map). The check refuses a sound without source, and any change to the origin or the troubadour of a sound already in the Recueil. Each tale has **Sounds and credits**: its sounds under the names it gives them, with an **i** for their source, author, licence and other names. `.github/scripts/migrate_sound_identity.py` gave the first tales their sound identities from the credit tables (November 2026).

The `.troubadour` format (a ZIP with `story.json` and the audio files, signed with a troubadour name and versioned by a hidden revision counter) is specified in [TROUBADOUR_FORMAT.md](TROUBADOUR_FORMAT.md). The troubadour name is set in Settings: the web player's (shared with the Story builder) and the Android app's. In the app, `app/src/main/java/com/troubadour/app/troubadour/` reads and writes the format and `settings/BardSettings.kt` keeps the troubadour name; the engine test screen can already open a `.troubadour` and export it as its next revision.

## Troubadour Ballade

`docs/ballade/` is a second app in the repo, not shown on the Troubadour page yet: https://arthurvangeersdaele.github.io/Troubadour/ballade/

Troubadour Ballade is for troubadours who prepare the exact timing of their sounds before the session, then follow it at the table. It plays vertically, on a phone held upright:

- **Library**: the stories kept on the device (IndexedDB, `flow-db.js`), Import, Settings. No Recueil, no Discovery.
- **Player**: the story title on top, the chapters in a row that scrolls sideways, then the chapter as a cascade of steps from top to bottom. A step holds up to three sounds side by side; a golden wire runs down the screen, splits to the cards of a step and joins again below, and lights each card as its moment comes, so the coming sounds are always in sight. Steps follow on their own when the one above ends; gates wait for a tap on **Go**. At the end of a chapter, the wire waits on a golden **Next chapter** button. Pause (the whole timeline stops with the audio clock), fade out everything, master volume, the story's soundbox in a drawer, tap a playing card to fade it out, tap any step to jump there.
- **Editor** (computer only for now): steps, gates, when the next step starts, and for each card its offset, length, trim, repeat, fades and volume; sounds dragged from the chapter, another chapter or the soundbox. Importing a `.troubadour` builds a first Ballade to start from. **Rhythm .troubadour-ballade** writes the file for the phone, **Export .troubadour** gives the story back without its Ballade.
- Same themes and troubadour name as Troubadour. Home Screen web app on iPhone (`sw.js` keeps it offline; bump `VERSION` there and in `app.js` when shipping a change). The Android build comes next.

- **Discovery tale**: Underwater Adventure, timed chapter by chapter (`docs/ballade/discovery/261017_underwater-adventure.troubadour-ballade`), offered in the library until it is added. Rebuilt from the web edition's sounds by `python3 .github/scripts/build_flow_discovery.py`.

The `.troubadour-ballade` format (a `.troubadour` plus `flow.json`) is specified in [TROUBADOUR_BALLADE_FORMAT.md](TROUBADOUR_BALLADE_FORMAT.md).

## Troubadour Map

`docs/map/` is a third app, in La Troupe next to the Ballade: https://arthurvangeersdaele.github.io/Troubadour/map/ (web app first; the Android version comes later).

A story becomes a **world**, its chapters become **places**, and each place is a map the troubadour draws. At the table, the troubadour drags the party's golden point across the map and hears what the party hears.

- **Library**, laid out like Troubadour's: the last opened world in a big card (its first place as the picture, Play and ⋯, where Edit the world sits), the others in rows, and **Add a world** (also the + of the top bar): **New world** (blank, named, with your own sounds) or **Import** (`.troubadour` or `.troubadour-map`). Each world opens either in the **player** (`#/play/…`) or in the **editor** (`#/edit/…`), two screens of their own; the player has no way into the editor. Importing a `.troubadour` makes one empty place per chapter: its sounds wait in the sound list, nothing is preset. The sound picker (Add, on an element or the whole place) shows the sounds of the world or of the **Recueil** (`docs/recueil/sounds.json`, each sound fetched alone by byte range and kept in the world's `Recueil` chapter), filtered by kind (All, Music, Ambiances, Events) and by search; a tap adds a sound at once (a second tap takes it away), its play button previews it. It also brings audio files from the device, or every sound of another `.troubadour`.troubadour`.
- **Draw** (`map-view.js`): walls (Shift for a straight one), elements drawn by hand (a shape that ends near its start is an area, otherwise a line, such as a river), the library of drawings (`map-stamps.js`: lake, mountains, hills, forest, tree, swamp, rocks, campfire, tower, ruins, cave, stairs, door, bridge, tent, well, altar, grave), eraser, select and move, undo, pan and zoom (wheel, pinch, Space or the hand). The panel gives a selected element its name, its sound cards (any sound of the story, several per element: loop, random or on tap, starting with the place or not, volume), its **reach** (one radius for all its cards, measured from its outline, set in % of the width of the map) and the place it **leads to**. A place has its own name, size and **whole-place** sounds; the wall muffle slider (share of a sound each wall takes away) is shared by the world.
- **Play** (`map-audio.js`): the map fills the screen on the left with the party's point at mid-height (the fill button brings that view back), the Sound menu with the sounds of the whole place opens beside it (the panel button hides it; it scrolls up and down only). Full sound cards as in Troubadour: loop button (1×, 2×, ∞, random; no random for music), progress bar, Play and Pause (it resumes where it was), Stop (fade out, back to the start), and the volume as set in Settings, Player interface, per row (Hidden, Simple in 25 % steps over 2 s, or Full with a slider). The cards of an element are always on: they start with their place, the map decides how much of them is heard. The page never zooms (no double-tap or pinch zoom): only the map zooms, with two fingers. Drag the point to move the party (a tap moves nothing); **double tap** an element for its sounds in the **Sound menu** (in the editor, a double tap opens an element's panel). Each element's sounds play at 100 % of their volume at its middle, falling in a straight line to 0 % at the edge of its reach, then × (1 − muffle) for every wall crossed on the way; gains glide, no clicks. Its menu holds its cards (play, pause, volume, how much reaches the party), its reach, and **Go to** the place it leads to (the sounds of the old place fade out, the new one starts). Whole-place sounds ignore distance and walls. Pause all, fade out everything and the master volume sit in a chip of the top bar, as in Troubadour.
- Same themes and troubadour name as Troubadour. Landscape only on phones and tablets, like Troubadour (upright, it asks to turn the phone); on a computer, any window. The panel slides over the map on a narrow screen. Any touch or click wakes the audio (browsers keep it off until then). Offline once opened (`sw.js`: bump `VERSION` there and in `app.js` when shipping a change).

The `.troubadour-map` format (a `.troubadour` plus `map.json`) is specified in [TROUBADOUR_MAP_FORMAT.md](TROUBADOUR_MAP_FORMAT.md).

- **Design as in Troubadour** (Nov 2026): the top bar shows the world and its map as Troubadour shows the story and its chapter; the maps sit on Troubadour's numbered chapter rail (a column while drawing on a wide screen, a strip under the top bar on a narrow one and always at the table); sound cards are Troubadour's own and behave like them (`.c`: loop button 1×, 2×, ∞, then random, or play after for musics, a playlist; time left, red in its last 10 s, "∞ loop", or "next 0:12" while a random sound waits, when a tap on Play stops it; a bar from green to red, blue for ∞; Play and Pause, fade out, volume as set in Settings), with a thin meter for how much of an element reaches the party.
- **At the table the screen never leaves the map**: it opens on the whole map, cannot zoom out past it, and cannot pan beyond its edges (`keepOnMap` in `map-view.js`).
- **Editor**: the drawing tools move by their grip and stay inside the map's frame; sounds are added with + Add (the world's sounds and the Recueil's). Each world has a soundbox (one-shot pads behind the Soundbox button at the table). Every card starts with its map; several musics play one after another.
- **Sound menu** (at the table): open by default on the whole map, also behind the Sounds button (left of the Soundbox); a double tap on an element shows its sounds, on the map's ground the whole map again; it lists the sounds heard everywhere, then each element's under its name. A long press on an element's sign (in its middle) takes the party to the map it leads to.
- **Navigation** (Nov 2026): as the Troubadour web app, the library has no link back to La Troupe; a world shows Play and More (Edit the world sits in More), and a tap on a world plays it. Leaving a world asks first, whatever the way out: the back button of the top bar, of the browser or of the phone.
- **UX review** (Nov 2026), after building a full world on a phone and a computer. At the table: the Sound menu puts the elements the party hears first, with a gauge of how much reaches it; those out of reach go last, dimmed and folded (a tap on a name unfolds it). Through a way, the party arrives beside the way back, never on its sign. Names on the map never cover one another, the party's point, a sign or a library drawing (a line carries its name along it). Walls stop the party (Settings, At the table): neither the point nor its trail goes through a wall. The tip shows the first three times only, at the foot of the map. A soundbox pad stays lit while it sounds, with a bar for its length. In the editor: a new world asks its name and the name of its first map; a tap on the map on screen (with its pencil) renames it, and New map asks a name; a new element gets a name (Area, Line, or the drawing's name) and its panel opens at once; the tools stand beside the map and the map fits next to them (a slim column on a phone), with a single See the whole map button; the sound picker takes the whole screen on a phone, one line a sound, and shows the element's current name. A pin marks the maps an element leads to. On a phone on its side, the world card keeps Play in view.
- **Music, shared soundbox, upright phones** (Nov 2026): maps carry ambiances and events; musics belong to the world. The Music button, right of the Soundbox, lists every music of the world, the one heard now first with its whole card, with a search field; a tap plays one, crossfading the one playing, and it plays on from map to map. A music laid on a map starts when the party arrives there. The Sound menu always shows the music heard now (playing or paused) first. The star of the worlds screen opens the shared soundbox, as in Troubadour: effects from the Recueil, your worlds or this device, waiting on every world after its own. The cross at the end of the party's trail can be dragged elsewhere, even while the party walks; the walking speeds are half what they were. Settings, Appearance: Upright phone too lets the app work held upright. Actions that cannot be taken back (remove, delete, erase, leave, stop everything) are red.
- **Editor and layout** (Nov 2026): the master stop fades out the world's music only. In the editor, the Soundbox and Music buttons of the top bar open the world's soundbox and music to fill and order; export lives in the worlds screen only. A new world, a new map and a tap on the map on screen ask its name and its size (Small to Huge; what is drawn grows with it). The Soundbox and the Music take the room of the sound menu: the map makes way, beside it or above it. Dialogs have Troubadour's size and keep clear of the notch; on a phone on its side, a question sits above the keyboard on one line. Upright, the buttons stay on the right and the drawing tools lie in a row.
- **Soundboxes as in the Troubadour web app** (Nov 2026): the shared soundbox screen, the world's soundbox in the editor and their picker are Troubadour's own: effect cards (name, remove, listen, length and size, move earlier or later, volume) in a dashed zone with Add more, and the picker with Choose from Files, On this device or From the Recueil, ticks, sources and one Add button. At the table, the drawer shows Pinned, This world and Shared pads; a tap fires an effect, ☆ pins it to the top.
- **Music queue and top bars** (Nov 2026): at the table, the top bar reads Master, Sounds, Music, Soundbox, Settings; in the editor, Play, Sounds (the panel of the map), Music, Soundbox, Settings. The world's musics have no loop button: each row of the Music panel has an Add to the queue button, the queue button of its head (with how many wait) shows the queue to reorder, empty or play from. At its end a music hands over to the next one of the queue, or plays again when the queue is empty. Taking a music out of the world also takes it off the maps it was laid on.
- **Library covers as in Troubadour** (Nov 2026): the picture of each world's first map is dressed as a Troubadour story cover: the world's tint (picked as Troubadour picks a story's) glows behind it and frames it, the map is drawn in gold wires with its areas washed in the tint, and the party is a point of light. Every colour comes from the theme.
- **Places of your own** (Nov 2026): the editor has no free drawing tool any more. The library of places opens with New place: name it, draw it with your finger in the theme's ink, then drag colours (water, grass, stone, fire...) into its closed shapes. It joins the library of the world (a pencil changes or deletes it), is laid like any drawing, and travels in the .troubadour-map. The music of the world is edited with Troubadour's cards (dashed zone, chevrons to reorder, volume). Every question is centred on screen; the master stop shows a small note, as it stops the music; − and + stay together on the cards.
- **Place editor on a phone** (Nov 2026): everything holds on the screen, upright (the drawing on top, as large as the room left) or on its side (the drawing at the left, the tools beside it). Another colour opens the editor's own picker (hue, colour, light), as the phone's picker closes on its own inside a dialog.
- **Music loops** (Nov 2026): the world's musics have their loop again, 1×, 2× or ∞ (not play after: the queue says what comes next), on their cards at the table and in the editor. A music ends, or a loop ends its round, when a music waits in the queue; with an empty queue a loop plays on and 1× or 2× stop.
- **Place editor, more** (Nov 2026): lines, brush, pour and eraser, each in three sizes (a fine line among them). The brush paints colour always under the lines; a colour picker adds any colour (the last six stay at hand); the eraser rubs out lines and paint where it passes, and a tap inside a shape takes its poured colour away.
- **Laying places** (Nov 2026): a place picked in the library closes the library; one tap lays it and the select tool comes back. An open panel stays open and shows the new place; a closed one stays closed. Deleting an element closes its panel: it never falls back on the panel of the map.
- **Sound dynamics as in Troubadour** (Nov 2026): every card plays as a card of the Troubadour player. Volumes follow Troubadour's curve; the slider glides without clicks and the simple buttons glide 25 % in 2 s, from the volume heard now. Play rises over the fade-in (Settings, Playback: Off, 0.5, 1, 2 or 4 s; events strike at once), Pause and Stop fade out over the fade-out, a pause resumed while it still fades rises back from where it is, and Play during a stop's fade brings it back. Starting a music fades out the one playing in its group (Crossfade music tracks). Random sounds play again after 0.5 s to their longest pause (Settings, or their own in the editor, 1 to 30 s). Living ambiances drift up to 10 points around their volume every few seconds, with Troubadour's discreet mark on the slider or the number. Blended loops cross over between rounds. The master pause holds everything over 3 s (random sounds waiting show "held") and resumes it over 3 s; the master stop fades everything, soundbox included, over 3 s.
- **The party's trail** (at the table): dragging the golden point draws a dotted trail, treasure-map style, and lifting the finger marks its end with a red cross; one second later the point walks the trail at a steady pace (Settings, At the table: Party's trail on or off, and its walking speed: Slow, Normal, Fast or Very fast), easing in and out, the sounds following it. With the trail off, the point follows the finger. A new drag stops the walk where it is and starts a new trail. In the editor, a drag still places the point directly.

## Icons

- `branding/`: the Troubadour icon and its pumpkin version, each with rounded corners (web, social) and as a full square (stores; Android and iOS cut their own shape). 1024 × 1024 SVG.
- Android: adaptive icon in `app/src/main/res/` (`mipmap-anydpi-v26/ic_launcher.xml`, with a monochrome layer for themed icons). The pumpkin version is ready as `@mipmap/ic_launcher_pumpkin`: point `android:icon` and `android:roundIcon` in the manifest to it to switch.
- Web: `docs/icons/` (favicon and Apple touch icon).
- Troubadour Ballade: `branding/261017_troubadour_ballade_icon.svg` (and `_square`), the Troubadour icon darkened with a golden wire splitting in two; PNGs in `docs/ballade/icons/`.
- Troubadour Map: `branding/261031_troubadour_map_icon.svg` (and `_square`), the Troubadour icon darkened with the golden point and the dotted rings of its reach; PNGs in `docs/map/icons/`.

## Build locally

Open the folder in Android Studio (it will offer to create the Gradle wrapper), or with Gradle 8.11 installed:

```
gradle assembleDebug
```

## Roadmap

- Web edition (available): play in the browser on a computer, with La Troupe (Story builder, Recueil, playing your own `.troubadour` files). On a phone, the web offers the discovery stories and the Recueil.
- Troubadour for iPhone (available): Home Screen web app with stories kept on the phone, editor, mixing table, soundboxes and `.troubadour` import and export.

1. Audio engine: 20 voices, gapless loops, fades (done, tested on a phone)
2. Android app beta: library, editor, mixing table, soundbox, settings and themes, `.troubadour` import and export, Discovery and Recueil (available)
3. Field tests at the table, fixes and polish (in progress)
4. Release on Google Play: target API 36, store listing (planned)
