#!/usr/bin/env python3
"""Builds docs/discovery/index.json, the one list of Troubadour's discovery content.

Every app reads this file (the web player, Troubadour for iPhone and iPad, the Android app, Troubadour Ballade
and Troubadour Map); every path in it is relative to docs/discovery/.

    docs/discovery/
    ├── index.json                    this list
    ├── CREDITS.md                    where every sound comes from
    ├── sounds/<story>/<chapter>/music|ambience|events/*.mp3   the discovery stories
    ├── sounds/soundbox/*.mp3         the soundbox shared by the discovery stories
    ├── ballades/*.troubadour-ballade the discovery tales of Troubadour Ballade
    └── maps/*.troubadour-map         the discovery worlds of Troubadour Map

Written by hand in index.json:
    stories[]   id (= folder under sounds/), title, blurb, chapters[] { id (= folder), title }
    ballades[]  file, title, blurb
    maps[]      file, title, blurb
Filled in by this script (never edit them by hand):
    library     { chapters: { "<story>/<chapter>": { music, ambience, events: [{ name, file, size }] } }, soundbox: [...] }
    ballades[]  id, revision, size (from the file's flow.json)
    maps[]      id, revision, size (from the file's map.json)

The card title comes from the file name: 01_rain-on-leaves.mp3 shows as "Rain on leaves"; a leading number only sets
the order. Run it by hand with: python3 .github/scripts/build_discovery_index.py
"""
import json
import os
import re
import zipfile
from pathlib import Path

DISC = Path(os.environ.get("TROUBADOUR_DISCOVERY_DIR") or Path(__file__).resolve().parents[2] / "docs" / "discovery")
ZONES = ("music", "ambience", "events")
AUDIO = {".mp3", ".ogg", ".m4a", ".wav"}


def title_from(path: Path) -> str:
    name = re.sub(r"^\d+[\s._-]*", "", path.stem)
    name = re.sub(r"[_-]+", " ", name).strip() or path.stem
    return name[:1].upper() + name[1:]


def sounds_in(folder: Path) -> list:
    if not folder.is_dir():
        return []
    files = sorted(f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in AUDIO)
    return [{"name": title_from(f), "file": f.relative_to(DISC).as_posix(), "size": f.stat().st_size} for f in files]


def archive(entry: dict, inner: str) -> dict:
    """Reads id and revision of a .troubadour-ballade or .troubadour-map; hand fields stay first."""
    path = DISC / entry["file"]
    if not path.is_file():
        raise SystemExit(f"index.json lists {entry['file']}, which is not in docs/discovery/")
    with zipfile.ZipFile(path) as z:
        meta = json.loads(z.read(inner))
    out = {k: entry[k] for k in ("file", "title", "blurb") if k in entry}
    out.update(id=meta["id"], revision=meta.get("revision", 0), size=path.stat().st_size)
    return out


def main() -> None:
    index_path = DISC / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    chapters = {}
    for story in index["stories"]:
        for chapter in story["chapters"]:
            base = DISC / "sounds" / story["id"] / chapter["id"]
            chapters[f'{story["id"]}/{chapter["id"]}'] = {z: sounds_in(base / z) for z in ZONES}
    out = {
        "about": "Troubadour discovery content. Hand-written: stories, and file/title/blurb of ballades and maps. "
                 "Everything else is filled in by .github/scripts/build_discovery_index.py.",
        "stories": index["stories"],
        "library": {"chapters": chapters, "soundbox": sounds_in(DISC / "sounds" / "soundbox")},
        "ballades": [archive(b, "flow.json") for b in index.get("ballades", [])],
        "maps": [archive(m, "map.json") for m in index.get("maps", [])],
    }
    listed = {e["file"] for e in out["ballades"] + out["maps"]}
    for folder, ext in (("ballades", ".troubadour-ballade"), ("maps", ".troubadour-map")):
        for f in sorted((DISC / folder).glob(f"*{ext}")):
            if f.relative_to(DISC).as_posix() not in listed:
                print(f"warning: {f.relative_to(DISC)} is not listed in index.json")
    index_path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    count = sum(len(v) for c in chapters.values() for v in c.values()) + len(out["library"]["soundbox"])
    print(f"index.json: {len(out['stories'])} stories ({count} sounds), {len(out['ballades'])} ballades, {len(out['maps'])} maps")


if __name__ == "__main__":
    main()
