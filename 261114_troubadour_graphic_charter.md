# Troubadour graphic charter

Version 1, 14 November 2026. Applies to every Troubadour surface: the website, La Troupe (web player, Story builder, Recueil), Troubadour for iPhone and tablets, the Android app, Troubadour Ballade and its builder, Troubadour Map.

This charter writes down what the code already does (sources: `docs/play/style.css`, `docs/site.css`, `docs/troupe/troupe.css`, `docs/ballade/flow.css`, `docs/themes.js`, `branding/`). Where the code disagrees with itself, the charter picks one value and marks the other as **to align**. A new screen follows this charter; a change to it is a decision, made on purpose.

---

## 1. Principles

1. **The table first.** Every screen is used during a game, at night, by someone talking to players. Dark by default, large targets, nothing that blinks without a reason.
2. **Three colours carry the meaning.** Yellow is music, green (teal) is ambiance, red is event. They mean only that, everywhere.
3. **Gold is time and action.** The accent and the Ballade wire are gold: what moves, what plays, what to tap next. Silver is a choice. Red-danger is destruction.
4. **Serif for names, sans for everything else.** Cormorant SC names things (titles, logo, chapter numbers); Barlow Semi Condensed says everything else.
5. **Calm motion.** Things glide, fade and pour; nothing bounces except a dot that lights up.

---

## 2. Logo and icons

### 2.1 Troubadour mark

Three vertical rounded bars, left to right yellow, teal, red, on a dark rounded square.

| Element | Value |
| --- | --- |
| Canvas | 1024 × 1024, corner radius 256 (round) or 0 (square variant for stores) |
| Background | `#15151B` |
| Bars | width 128, corner radius 64 (fully round ends) |
| Colours | `#E0A84B` (music), `#4FB3A5` (ambiance), `#E06A63` (event) |
| Heights | left medium, middle tallest, right in between, bottoms aligned, as in `branding/261013_troubadour_icon.svg` |
| Files | `branding/261013_troubadour_icon.svg`, `_square.svg`, `_pumpkin` variants (limited) |

Rules: never recolour the bars per theme, never add a stroke, never put the mark on a light background without its dark square.

### 2.2 Troubadour Ballade mark

The Troubadour mark darkened, with a golden wire drawn over it: a dot at the top, a straight stem, then two S-shaped arms down to two dots.

| Element | Value |
| --- | --- |
| Background | `#0A0A0D` |
| Bars (dimmed) | `#5C4627`, `#244E49`, `#5C302D` |
| Wire path | `M512 196V500 C512 630 352 640 352 812 M512 500 C512 630 672 640 672 812` |
| Wire | stroke `#F4C651`, width 26, round caps; glow: same path, `#F0C24F`, width 34, blur 22, opacity .75 |
| Dots | `#FFE08A`; top r 38 at (512,176), bottom r 46 at (352,826) and (672,826) |
| File | `branding/261017_troubadour_ballade_icon.svg` |

Any drawing of "the Ballade wire" in a splash, a loader or a page uses exactly this geometry.

### 2.3 Interface icons

| Property | Value |
| --- | --- |
| Grid | 24 × 24 viewBox |
| Stroke | `currentColor`, width 2, round caps, round joins, no fill (filled only for play, pause, stop, dots) |
| Sizes | 14, 16, 18, 19 or 20 px rendered |
| Colour | inherits the text colour of its button |

Play mode symbols on Ballade cards: **→|** stops by itself, **∞** loops until the gate, **shuffle** random until the gate.

---

## 3. Colour

### 3.1 Tokens

Every surface reads these CSS custom properties (the Android app mirrors them in `Theme.kt`). Never hard-code a theme colour in a component.

| Token | Role |
| --- | --- |
| `--bg` | page background |
| `--bar` | top bars, side panels, dialogs |
| `--card` | cards, buttons, inputs |
| `--line` | 1 px borders, tracks of sliders, separators |
| `--text` | main text |
| `--muted` | secondary text, inactive icons |
| `--accent` | the theme's action colour (gold in Obsidian) |
| `--music`, `--amb`, `--evt` | the three sound kinds |
| `--blue` | "loops forever" badge only |
| `--on-z` | text on a filled zone or accent colour |
| `--shadow` | drop shadow colour |
| `--danger`, `--on-danger` | destructive actions, never themed |

### 3.2 Everyday themes, dark (default)

| Theme | bg | bar | card | line | text | muted | accent |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Obsidian | `#0F0F13` | `#15151B` | `#1C1C24` | `#2E2E39` | `#ECE8DE` | `#A29FAE` | `#E0A84B` |
| Parchment | `#1E1912` | `#251F16` | `#30281D` | `#4A3D2B` | `#F1E6CF` | `#BBA987` | `#E0B062` |
| Blood | `#140B0C` | `#1A0E10` | `#261517` | `#43242A` | `#F2E4E2` | `#B79A9D` | `#F0606A` |
| Divination | `#0B1020` | `#0F1529` | `#18213D` | `#2B3762` | `#E6E9F8` | `#9EA6C8` | `#C9A7F5` |

Zone colours in every dark everyday theme: music `#E0A84B`, ambiance `#4FB3A5`, event `#E06A63`, blue `#2F8BFF`, shadow `rgba(0,0,0,.45)`.

### 3.3 Everyday themes, light

| Theme | bg | bar | card | line | text | muted | accent |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Obsidian | `#F2F1F4` | `#FBFBFC` | `#FFFFFF` | `#DAD8E0` | `#1A1A22` | `#6B6878` | `#B37714` |
| Parchment | `#F3EAD7` | `#EDE1C8` | `#FBF5E8` | `#D9C7A3` | `#2E2416` | `#7A6A4E` | `#A06A16` |
| Blood | `#F7EDED` | `#F0E1E1` | `#FFF9F9` | `#E2C6CA` | `#2A1416` | `#84636A` | `#B3303B` |
| Divination | `#ECEFFA` | `#E3E8F7` | `#FAFBFF` | `#CBD2EE` | `#141A33` | `#5D6590` | `#7450C2` |

Zone colours in light: music `#B37714`, ambiance `#1F857A`, event `#C2443D`, blue `#1F6FE0`, on-z `#FFFFFF`, shadow `rgba(40,30,20,.16)`.

### 3.4 Limited editions (offered until 31 December 2026)

Pumpkin, Santa, Pride, Dragonfire, Abyss, Excalibur: one look each, same in dark and light mode, full values in `docs/play/style.css`. They are marked by a gold medal (radial `#FFF4C2` to `#B8860B`, star `#7A5408`, glow `rgba(246,201,69,.75)` pulsing over 2.4 s). From 1 January 2027 only collected ones stay. Pride adds the six-stripe flag under the top bars (4 px).

### 3.5 Fixed colours (never themed)

| Use | Dark | Light |
| --- | --- | --- |
| Danger | `#E5534B` | `#CF3B32` |
| Ballade gold | `#F0C24F` | `#C48A0E` |
| Ballade gold hot (bright core, dots) | `#FFE08A` | `#E0A62A` |
| Ballade gold glow | `rgba(240,194,79,.55)` | `rgba(196,138,14,.35)` |
| Ballade silver (choices) | `#DCE3EC`, hot `#FFFFFF`, glow `rgba(214,226,240,.5)`, ink `#161A20` | `#7E8A99`, hot `#B9C3CF`, glow `rgba(110,125,145,.35)`, ink `#FFFFFF` |
| Ballade bare wire | `color-mix(--muted 38%, --line)` | same |
| Splash ground | `#0F0F13` (Troubadour), `#0A0A0D` (Ballade) | same |

In Pride and Excalibur the Ballade gold is `#D9A520`.

### 3.6 Meaning of colour

| Colour | Means | Never |
| --- | --- | --- |
| Music yellow | a music card, its zone label, its progress | a warning |
| Ambiance teal | an ambiance | success messages |
| Event red | an event; also "less than 10 s left" | delete (that is `--danger`) |
| Accent | the next action, the selected item, focus | decoration |
| Gold (Ballade) | time that has passed or is playing, gates | a static border |
| Silver (Ballade) | a choice between ways | anything else |
| Danger red | delete, erase, leave without saving | a sound kind |

Discovery stories use the logo bars in order: Forest yellow, Underwater teal, Big War red.

### 3.7 Contrast

Text on `--bg`, `--bar` or `--card` is at least 4.5:1 for `--text` and 3:1 for `--muted` in every everyday theme. Text on a filled zone colour is `--on-z`. A new colour pair is checked before it ships.

---

## 4. Typography

### 4.1 Families

| Family | Weights | Use |
| --- | --- | --- |
| **Cormorant SC** (Google Fonts) | 600, 700 | logo, h1 to h3, story and chapter titles, chapter numbers, splash words, big button labels (Ballade dock) |
| **Barlow Semi Condensed** (Google Fonts) | 400, 500, 600 | everything else |
| `ui-monospace, Menlo, Consolas` | 600 | keyboard keys (`kbd`) only |

Fallbacks: `serif` for Cormorant SC, `system-ui, sans-serif` for Barlow. Load both with `display=swap`.

### 4.2 Scale (apps)

| Role | Family | Size | Weight | Line height | Letter spacing |
| --- | --- | --- | --- | --- | --- |
| Body | Barlow | 15 px | 400 | 1.35 | 0 |
| Page title (h1) | Cormorant | clamp(34, 5vw, 52) | 700 | 1.05 | .4 px |
| Dialog title | Cormorant | 26 px | 700 | 1.1 | .4 px |
| Top bar title | Cormorant | 20 px (17 on phones) | 700 | 1.1 | .4 px |
| Logo in a bar | Cormorant | 24 px | 700 | 1 | .4 px |
| Story card title | Cormorant | 30 px | 700 | 1 | .4 px |
| Section label (overline) | Barlow | 13 px | 600 | 1 | 2 px, UPPERCASE, `--muted` |
| Card title | Barlow | 15 px | 600 | 1.2 | 0, one line, ellipsis (Ballade: rolls) |
| Secondary text | Barlow | 13 px | 400 | 1.35 | 0, `--muted` |
| Numbers, times | Barlow | as context | 600 | | `font-variant-numeric: tabular-nums` |
| Chapter number | Cormorant | 18 px | 700 | 1 | accent colour |

### 4.3 Scale (website)

Body 18 px / 1.5 (17 px under 640 px). Hero h1 clamp(44, 8vw, 88). Section h2 clamp(34, 5vw, 52). Lead clamp(19, 2.2vw, 23), `--muted`. Kicker 15 px, 600, 2 px spacing, uppercase, accent. Logo 28 px, 1 px spacing.

### 4.4 Inputs on iPhone

Any text input is at least 16 px, so iOS never zooms into it.

---

## 5. Space, size and shape

### 5.1 Spacing

Base step 2 px; the steps used are **4, 6, 8, 10, 12, 16, 20, 24, 28, 36, 48, 72**. Gaps between cards 8 px; between sections 12 px inside dialogs, 72 px on the website (52 px on phones). Page side padding: 20 px (website), `max(12px, safe-area)` in app bars, 16 px in phone apps.

### 5.2 Radius

| Element | Radius |
| --- | --- |
| Call-to-action button (website, primary actions) | **12 px**, never a pill |
| Standard button `.btn` (apps) | 10 px (**to align**: `troupe.css` uses 10, the website 12; apps keep 10, calls to action 12) |
| Icon button `.ico` 40 px | 10 px; `.ico.small` 34 px: 9 px |
| Chip, stepper, segmented control | 10 px (segment buttons inside: 7 px) |
| Sound card, pad, theme tile, empty box, settings tile | 12 px |
| Story card, dialog | 16 px |
| Play button in a card `.pb` | 10 px (9 px on short screens) |
| Badge, edition tag | 999 px (the only pills allowed: small, non-clickable labels) |
| Slider track | 2 px; thumb round |
| App icon | 22.5 % of its side |

### 5.3 Sizes

| Element | Size |
| --- | --- |
| Top bar | 56 px high (50 px on short landscape phones) |
| Icon button | 40 × 40 (small 34 × 34) |
| Standard button | 44 px high, padding 0 18 px; small 34 px, padding 0 12 px |
| Website CTA | 48 px high, padding 0 20 px; big 56 px, padding 0 26 px |
| Play button in a card | 38 × 38 (32 on short screens) |
| Chip | 40 px high |
| Toggle | 42 × 24, knob 18 |
| Slider | 28 px hit area, 4 px track, 16 px thumb with 2 px `--card` ring |
| Minimum touch target | 34 × 34 px; 44 × 44 for anything used during play |

### 5.4 Borders and elevation

Borders are 1 px `--line`. A selected item gets `--accent` border plus a 1 px inset ring of the same colour (`box-shadow: 0 0 0 1px var(--accent) inset`). A playing card uses its zone colour the same way.

| Level | Shadow |
| --- | --- |
| Hover lift (story card) | `0 12px 30px var(--shadow)`, translateY(-2px) |
| Drawer | `-20px 0 50px var(--shadow)` |
| Dialog | `0 30px 80px var(--shadow)`, backdrop `rgba(0,0,0,.45)` |
| Glow (gold) | `0 0 8 to 14px var(--gold-glow)` |

---

## 6. Components

### 6.1 Buttons

| Kind | Look | Use |
| --- | --- | --- |
| Primary | fill `--accent`, text `--on-z`, border `--accent`; hover brightness 1.08 | the one main action of a screen |
| Secondary | fill `--card`, border `--line`, text `--text`; hover border `--muted` | other actions |
| Danger | text `--danger`, border mixed with `--danger`; in a confirm dialog filled `--danger`, text `--on-danger` | delete, erase |
| Website CTA (`.shine`) | light fill, white border, glint sweep and turning white ring | the one call to action of a page section |
| Icon | `.ico`, 40 px | toolbars |

One primary button per screen or dialog. Labels are verbs, one to three words, sentence case ("Add a sound", not "ADD SOUND"). Disabled: opacity .5, no hover.

### 6.2 Sound card (players)

Anatomy, top to bottom: title row (name, loop badge, time), progress track (6 px, zone colour), controls (play/pause 38 px, stop, volume slider in zone colour). Card: `--card`, 1 px `--line`, radius 12, padding 8 × 10, gap 7. Playing: zone border plus inset ring. Loop badge: 24 px high, radius 6; ∞ blue, random red, after yellow.

### 6.3 Ballade card (Ballade player)

Name on one line that rolls when too long; a zone pill (18 × 5 px, radius 3); a play mode symbol; no progress bar. Height is its duration on the clock. Faces: small under 80 px, medium 80 to 140 px, large 140 px and more. Tapping opens the card panel (name, kind, mode, progress bar, play/pause for that sound alone, volume).

### 6.4 Ballade wire

| Layer | Stroke (player) | Colour | Opacity |
| --- | --- | --- | --- |
| Halo | 11 px | gold | .16 |
| Halo 2 | 6 px | gold | .32 |
| Core | 3.2 px | gold | 1 |
| Shine | 1.1 px | gold hot | .75 (.45 light) |
| Bare wire | 3 px | wire colour | 1 |

Straight lines and round joins only. Gates: 46 px round nodes; lit gold; waiting gates pulse (box-shadow 0 to 4 px, 1.4 s). Choice gates silver, answers as silver pills with a sheen sweep (3.2 s). The time line is a 2 px gold line with a 12 px hot dot, hidden only inside a node.

### 6.5 Dialogs and sheets

Width `min(520px, 100vw - 24px)`, max height `100dvh - 24px`, radius 16, `--bar` fill, 1 px `--line`, padding 0 20 18. Title sticky (26 px Cormorant) with a 14 px fade under it. Sections separated by 1 px `--line`, 12 px padding, overline labels. Close is an `.ico.small` at the top right. Confirm dialogs: title, one sentence, buttons right-aligned, Cancel first, the action last.

### 6.6 Controls

Segmented control: `--card`, 1 px `--line`, radius 10, padding 3; selected segment fill `--text`, text `--bg`. Toggle: off `--line`, on `--accent` with knob `--on-z`. Stepper: − value + in one `--card` box. Inputs: `--card`, `--line`, radius 9, focus border `--accent`, no glow.

### 6.7 Toasts

Bottom centre, above the safe area, max width `100vw - 40px`, one sentence, 2.8 s by default (up to 5 s for errors), no buttons.

### 6.8 Empty states

Dashed 1 px `--line` box, radius 12, padding 14, `--muted` 14 px text saying what to do next.

---

## 7. Motion

| Use | Duration | Easing |
| --- | --- | --- |
| Hover, border, colour | .15 s | ease |
| Small state change (toggle, fill) | .2 s | ease |
| Theme change | .3 s background and colour | ease |
| Panel or drawer | .25 to .3 s | ease-out |
| Colour glide (home showcase) | 1.4 s | cubic in-out |
| Gate pulse | 1.4 s loop | ease-in-out |
| Live dot pulse | 1.6 s loop | ease-in-out |
| Medal glow | 2.4 s loop | ease-in-out |
| Splash | 2.8 s (Troubadour), 3.9 s (Ballade), tap to skip | per keyframe |
| Audio fades | 2 s default stop fade (0.5, 1, 2, 4 s in Settings); master changes glide 3 s; volume steps glide 2 s | linear or `setTargetAtTime` |

`prefers-reduced-motion: reduce` stops every loop animation, scroll smoothing and splash motion; final states show at once.

---

## 8. Layout and platforms

| Breakpoint | Change |
| --- | --- |
| 420 px | website back link loses its label |
| 480 px | long tabs hide |
| 560 px | edition tag hides |
| 640 px | phone layout: rows scroll sideways, compact bars, website nav links hide |
| 900 px | chapter rail becomes a strip; `.pc` needs at least 900 px and a fine pointer |
| 1180 px | soundbox becomes a drawer |
| height 520 px | short landscape phone: three rows fit, controls shrink |

| Surface | Orientation | Notes |
| --- | --- | --- |
| Troubadour app (Android, iPhone) | landscape only | a turn-your-phone screen otherwise |
| Troubadour Ballade player | portrait only | the wire runs top to bottom |
| Troubadour Map | landscape only | |
| Story builder, Map editor | computer only (`.pc`) | phones see a short notice |
| Ballade builder | computer, and iPad in landscape | other devices see a fallback page |
| Website | any | |

iPhone web apps run only from the Home Screen ("this page is the app"); a browser tab shows the install guide. Safe areas are respected with `env(safe-area-inset-*)` on every bar.

---

## 9. Words

1. English only in the apps and the website.
2. Never a long dash (—) and never a bullet sign (•) in any text the user sees. Use a comma, a colon or a new sentence.
3. Troubadours **rhythm** stories (they no longer "forge").
4. Names: Troubadour, Troubadour Ballade (Ballade in context), Troubadour Map, La Troupe (La Troupe des Troubadours in titles), Recueil, troubadour name, Forgotten Troubadour.
5. Sentence case for buttons and labels; Title Case only for story and chapter titles.
6. Say what will happen, in plain words: "Waits for your tap", "Fade out and finish".
7. Never say the web version is free.

---

## 10. Files

New files follow `YYMMDD_name` (for example `261114_troubadour_graphic_charter.md`). Code files keep their usual names. A `VERSION` in each web app (`YYMMDD.n`) and in its service worker changes together with every shipped change.

---

## 11. To align (found while writing this charter)

| Item | Now | Charter |
| --- | --- | --- |
| `.btn` radius | 10 px (La Troupe), 12 px (website) | apps 10 px, calls to action 12 px |
| Ballade answers | pill-shaped | allowed: they are silver choice tokens, not calls to action; review if this conflicts with the "never pill" rule |
| Gold in light mode | `#C48A0E` in Ballade only | use it for every gold element in light mode |
| Dialog backdrops | `.45` in apps, `.72` blur 3 px on the website QR veil | apps keep `.45`; website overlays may blur |
