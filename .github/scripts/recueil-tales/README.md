# Recueil tales rhythmed by Troubadour

Scripts that built the ten tales signed **Troubadour** in `docs/recueil/` (October 2026).

- `plan.py`: the tales, their chapters and every sound with its source file and recipe.
- `fetch.py`, `resolve.py`: pull the source files from blob-less clones of the open-source game repos.
- `build.py`: cuts, loops and levels each sound and encodes it to MP3 (needs ffmpeg and numpy).
- `forge.py`: writes `story.json` and the `.troubadour` archive; `credits.py` credits every source file.
- `publish.py`: copies the tales into `docs/recueil/` and writes `docs/recueil/CREDITS.md`.

Paths at the top of the scripts point to the machine they were run on: adjust them before running again.

## November 2026: Werewolves of Ravenmoor

- `plan_261107_werewolves.py`: the tale (copy it over `plan.py` to rebuild it). It adds a `soundbox` list of its own sounds to a story.
- Every event and soundbox card lasts at least 5 s (`MIN_EVENT` in `build.py`): short hits are layered over a bed, or given a long echo tail.
- In a `mix`, a layer placed at 0 s is a bed: it is repeated to fill the whole length.
- `forge.py` now writes the locked `sound` block of every sound (id of its bytes, origin, who brought it), reusing the block of a sound already in the Recueil.
- `qa2.py` measures quiet stretches and peaks, `peakfix.py` brings peaks under 0.92.
