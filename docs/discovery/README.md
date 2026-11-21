# Discovery

Everything Troubadour offers to try at once, in one place. The Recueil (`docs/recueil/`) holds the troupe's tales; this folder holds only the discovery content.

```
discovery/
├── index.json                     the one list every app reads
├── CREDITS.md                     where every sound comes from
├── sounds/                        the discovery stories of Troubadour
│   ├── forest/                    The Forest Adventure
│   │   ├── 1-in-the-forest/
│   │   │   ├── music/
│   │   │   ├── ambience/
│   │   │   └── events/
│   │   └── ...
│   ├── underwater/                Underwater Adventure
│   ├── big-war/                   The Big War
│   └── soundbox/                  quick effects shared by the three stories
├── ballades/                      the discovery tales of Troubadour Ballade (.troubadour-ballade)
└── maps/                          the discovery worlds of Troubadour Map (.troubadour-map)
```

## Who reads it

| App | Reads | Shows |
| --- | --- | --- |
| Web player (`docs/play/`) | `stories`, `library` | the three discovery stories, played from the browser |
| Troubadour for iPhone and iPad (`docs/ios/`) | `stories`, `library` | Discovery: adds a story to the device |
| Troubadour for Android | `stories`, `library` (from the site) | Discovery: adds a story to the device |
| Troubadour Ballade (`docs/ballade/`) | `ballades` | Discovery tales |
| Troubadour Map (`docs/map/`) | `maps` | Discovery worlds |

## Adding or changing something

1. Drop the files in their folder: MP3s under `sounds/<story>/<chapter>/<zone>/`, a `.troubadour-ballade` in `ballades/`, a `.troubadour-map` in `maps/`.
2. In `index.json`, write by hand only: a story's `id`, `title`, `blurb` and its chapters (`id` = folder, `title`); for a ballade or a map, its `file`, `title` and `blurb`.
3. Push to `main`: the **Update discovery index** action fills in the rest (sound lists and sizes, the `id` and `revision` read from each file). By hand: `python3 .github/scripts/build_discovery_index.py`.
4. Add the sounds' sources to `CREDITS.md`.

A sound card's title comes from its file name: `01_rain-on-leaves.mp3` shows as **Rain on leaves**; a leading number only sets the order. Keep each file under 100 MB (GitHub limit). The apps offer a new revision of a ballade or a map when its `revision` grows.

Built by scripts in `.github/scripts/`: `build_flow_forest.py`, `build_flow_discovery.py` and `build_flow_choices.py` (the ballades), `map-worlds/forest.py` and `map-worlds/four_lands.py` (the maps). The forest's sounds of 21 November 2026 (higher quality, and the new ones): `web-sounds/forest_hq_261121.py`.
