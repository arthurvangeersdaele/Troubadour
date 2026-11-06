#!/usr/bin/env python3
"""Checks every .troubadour file in docs/recueil/ and writes docs/recueil/index.json for the Recueil page,
and docs/recueil/sounds.json: every sound of the Recueil once, with all its names, for the sound libraries.

    python3 .github/scripts/build_recueil_index.py          # rebuild index.json
    python3 .github/scripts/build_recueil_index.py --check  # only validate (pull requests)

Every sound must carry its locked identity (the "sound" block: id of its bytes, origin, who brought it).

In a pull request (PR_AUTHOR and BASE_REF set), --check also guards ownership:
a bard name registered in docs/recueil/troubadours.json (by "Connect with GitHub" in Troubadour's settings)
can only sign tales sent by its GitHub owner; "Forgotten Troubadour" is open to everyone;
a tale already in the Recueil keeps its bard, and an update must raise its revision;
a sound already in the Recueil keeps its origin and the troubadour who brought it (only its name is free).

Format: TROUBADOUR_FORMAT.md at the repo root.
"""
import hashlib
import json
import os
import struct
import subprocess
import sys
import unicodedata
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sound_identity import contains_origin, origin_errors, same_origin, sound_id  # noqa: E402

RECUEIL = Path(__file__).resolve().parents[2] / "docs" / "recueil"
ZONES = ("music", "ambience", "events")
LOOPS = ("once", "twice", "infinite", "random")
# Rows of the builder's sound library, in the order of its tabs.
LIBRARY_ROW = {"music": "music", "ambience": "ambience", "events": "events", "soundbox": "soundbox"}
LIBRARY_ORDER = list(LIBRARY_ROW)
LIMIT = 100 * 1024 * 1024
FORGOTTEN = "Forgotten Troubadour"
# Names kept for Troubadour itself (same list as auth-worker/src/index.js); only the maintainer signs with them.
RESERVED = {"forgotten barde", "forgotten troubadour", "troubadour", "troupe des troubadours", "troupe", "recueil",
            "admin", "administrator", "moderator", "github"}


def name_key(name):
    """Case, accents, apostrophe styles and spacing do not make a different name (as in the worker)."""
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    for q in "\u2019\u2018`\u00b4":
        s = s.replace(q, "'")
    return " ".join(s.lower().split())


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=False)


def from_base(base, rel, default):
    r = git("show", f"{base}:{rel}")
    if r.returncode != 0:
        return default
    try:
        return json.loads(r.stdout)
    except ValueError:
        return default


def tale_sounds(file):
    """(row, sound) for every sound of a tale of the Recueil, in the order of the tale."""
    story = json.loads(zipfile.ZipFile(RECUEIL / file).read("story.json").decode("utf-8"))
    for ch in story.get("chapters", []):
        for z in ZONES:
            for s in ch.get(z, []) or []:
                yield LIBRARY_ROW[z], s
    for s in story.get("soundbox", []) or []:
        yield "soundbox", s


def same_lock(a, b):
    return (same_origin(a.get("origin"), b.get("origin")) and bool(a.get("edited")) == bool(b.get("edited"))
            and (a.get("parent") or None) == (b.get("parent") or None)
            and {k: str((a.get("brought") or {}).get(k, "")) for k in ("troubadour", "tale", "date")}
            == {k: str((b.get("brought") or {}).get(k, "")) for k in ("troubadour", "tale", "date")})


def consistency(entries):
    """A sound is the same sound in every tale: one origin, one troubadour who brought it."""
    errors, first = {}, {}
    for e in entries:
        for _, s in tale_sounds(e["file"]):
            b = s.get("sound") or {}
            if not b.get("id"):
                continue
            if b["id"] not in first:
                first[b["id"]] = (e["file"], b)
            elif not same_lock(first[b["id"]][1], b):
                errors.setdefault(e["file"], []).append(
                    f'{s.get("name")}: sound {b["id"]} has another origin or troubadour in {first[b["id"]][0]}: '
                    "a sound keeps its identity everywhere")
    return errors, {k: v[1] for k, v in first.items()}


def sound_locks(entries, changed, base, is_maintainer, owners):
    """The Recueil's sounds (sounds.json on the base branch) lock what a pull request may say about them."""
    known = {x["id"]: x for x in from_base(base, "docs/recueil/sounds.json", {"sounds": []}).get("sounds", [])
             if x.get("origin")}
    _, current = consistency(entries)
    errors = {}
    for e in entries:
        if f"docs/recueil/{e['file']}" not in changed:
            continue
        errs = errors.setdefault(e["file"], [])
        for _, s in tale_sounds(e["file"]):
            b = s.get("sound") or {}
            sid = b.get("id")
            if not sid:
                continue
            old = known.get(sid)
            if old:
                if not same_lock(old, b):
                    who = (old.get("brought") or {}).get("troubadour", "")
                    errs.append(f'{s.get("name")}: this sound is already in the Recueil, brought by {who}: '
                                "its origin and its troubadour cannot change (its name can)")
                continue
            # A new sound keeps the troubadour who first rhythmed it, even when another one sends the tale:
            # any registered name, or Forgotten Troubadour; names kept for Troubadour itself only by its maintainer.
            who = (b.get("brought") or {}).get("troubadour")
            key = name_key(who)
            if key in RESERVED and key != name_key(FORGOTTEN) and not is_maintainer:
                errs.append(f'{s.get("name")}: is brought by "{who}", a name kept for Troubadour itself')
            elif key not in owners and key != name_key(FORGOTTEN) and key != name_key(e["bard"]) and not is_maintainer:
                errs.append(f'{s.get("name")}: is brought by "{who}", which is not a registered troubadour name')
            # Made from a sound of the Recueil: it keeps every origin of it (it may add more, when mixed).
            parent = known.get(b.get("parent")) or current.get(b.get("parent"))
            if parent and not contains_origin(b.get("origin"), parent.get("origin")):
                errs.append(f'{s.get("name")}: a sound made from another keeps every origin of it')
    return {k: v for k, v in errors.items() if v}


def ownership(entries, author, base, maintainer):
    """Errors per file name for a pull request by `author` against `base` (e.g. origin/main)."""
    errors = {}
    is_maintainer = author.lower() == maintainer.lower()
    changed = git("diff", "--name-only", f"{base}...HEAD", "--", "docs/recueil/").stdout.split()
    for rel in ("docs/recueil/troubadours.json", "docs/recueil/index.json", "docs/recueil/sounds.json"):
        if rel in changed and not is_maintainer:
            errors.setdefault(Path(rel).name, []).append(
                "is kept by Troubadour: register a troubadour name in Troubadour's settings (Connect with GitHub) instead")
    bards = from_base(base, "docs/recueil/troubadours.json", {"bards": []}).get("bards", [])
    owners = {name_key(b.get("name")): b for b in bards}
    known = {t.get("id"): t for t in from_base(base, "docs/recueil/index.json", {"tales": []}).get("tales", []) if t.get("id")}
    for e in entries:
        rel = f"docs/recueil/{e['file']}"
        if rel not in changed:
            continue
        errs = errors.setdefault(e["file"], [])
        bard, key = e["bard"], name_key(e["bard"])
        if key == name_key(FORGOTTEN):
            pass
        elif key in owners:
            owner = owners[key].get("github", "")
            if owner.lower() != author.lower() and not is_maintainer:
                errs.append(f'is signed "{bard}", a troubadour name registered to @{owner}: only its owner can send tales signed with it')
        elif key in RESERVED:
            if not is_maintainer:
                errs.append(f'is signed "{bard}", a name kept for Troubadour itself')
        else:
            errs.append(f'is signed "{bard}", which is not a registered troubadour name: connect GitHub in Troubadour\'s settings '
                        f'and register it, or rhythm the tale as {FORGOTTEN}')
        old = known.get(e["id"])
        if old:
            if name_key(old.get("bard")) != key and not is_maintainer:
                errs.append(f'updates "{old.get("title")}" by {old.get("bard")}: a tale keeps its troubadour, rhythm yours with a new id')
            elif isinstance(e.get("revision"), int) and e["revision"] <= int(old.get("revision") or 0):
                errs.append(f"is revision {e['revision']}, the Recueil already has revision {old.get('revision')}: rhythm it again")
    for name, errs in sound_locks(entries, changed, base, is_maintainer, owners).items():
        errors.setdefault(name, []).extend(errs)
    return {k: v for k, v in errors.items() if v}


def identity_errors(s, zf, ids):
    """Every sound of the Recueil carries its locked identity, and the identity matches its bytes."""
    block = s.get("sound")
    if not isinstance(block, dict):
        return ["has no source: open the tale in the Story builder and give each sound its source (the i on its card)"]
    if s["file"] not in ids:
        ids[s["file"]] = sound_id(zf.read(s["file"]))
    errs = []
    if block.get("id") != ids[s["file"]]:
        errs.append(f"says it is sound {block.get('id')}, its bytes are sound {ids[s['file']]}: rhythm the tale again")
    errs += origin_errors(block.get("origin"))
    b = block.get("brought")
    if not isinstance(b, dict) or not str(b.get("troubadour", "")).strip():
        errs.append("does not say who brought it")
    return errs


def check(path: Path):
    errors = []
    size = path.stat().st_size
    if size > LIMIT:
        errors.append(f"{size / 1048576:.0f} MB, over GitHub's 100 MB limit")
    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return None, ["not a ZIP archive"]
    names = set(zf.namelist())
    if "story.json" not in names:
        return None, ["no story.json inside"]
    try:
        story = json.loads(zf.read("story.json").decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        return None, [f"story.json is not valid JSON ({exc})"]
    if story.get("format") not in ("troubadour", "bardic"):
        errors.append('format must be "troubadour"')
    version = story.get("version")
    if version not in (1, 2):
        errors.append("version must be 1 or 2")
    if version == 2:
        if not str(story.get("bard", "")).strip():
            errors.append("missing troubadour name")
        if not isinstance(story.get("revision"), int) or story["revision"] < 1:
            errors.append("revision must be a whole number from 1")
        if not str(story.get("id", "")).strip():
            errors.append("missing story id")
    title = story.get("title")
    if not isinstance(title, str) or not title.strip():
        errors.append("missing title")
    chapters = story.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        errors.append("at least one chapter is needed")
        chapters = []
    sounds = 0
    ids = {}  # archive path -> id of its bytes

    def sound_list(items, where):
        nonlocal sounds
        if not isinstance(items, list):
            errors.append(f"{where} must be a list")
            return
        for s in items:
            sounds += 1
            if not isinstance(s, dict) or not s.get("name") or not s.get("file"):
                errors.append(f"{where}: a sound has no name or file")
                continue
            if s["file"] not in names:
                errors.append(f"{where}: {s['file']} is missing from the archive")
            else:
                for e in identity_errors(s, zf, ids):
                    errors.append(f"{where}: {s['name']} {e}")
            if s.get("loop") not in LOOPS:
                errors.append(f"{where}: {s['name']} has an unknown loop mode")

    for i, ch in enumerate(chapters, 1):
        if not isinstance(ch, dict) or not str(ch.get("title", "")).strip():
            errors.append(f"chapter {i} has no title")
            continue
        for z in ZONES:
            sound_list(ch.get(z, []), f"chapter {i} {z}")
    sound_list(story.get("soundbox", []), "soundbox")
    entry = {
        "file": path.name,
        "title": (title or path.stem).strip() if isinstance(title, str) else path.stem,
        "id": story.get("id", ""),
        "bard": str(story.get("bard") if version == 2 else story.get("author", "")).strip(),
        "revision": story.get("revision", 1) if version == 2 else 1,
        "description": story.get("description", ""),
        "chapters": [str(c.get("title", "")).strip() for c in chapters if isinstance(c, dict)],
        "sounds": sounds,
        "size": size,
    }
    return entry, errors


def data_span(path: Path, info: zipfile.ZipInfo):
    """Byte offset and length of an entry's data inside the archive (its local header comes first)."""
    with open(path, "rb") as f:
        f.seek(info.header_offset)
        header = f.read(30)
    sig, _, _, _, _, _, _, _, _, name_len, extra_len = struct.unpack("<IHHHHHIIIHH", header)
    if sig != 0x04034B50:
        raise ValueError(f"bad local header for {info.filename}")
    return info.header_offset + 30 + name_len + extra_len, info.compress_size


def library(entries):
    """sounds.json: each sound of the Recueil once, by its identity (the "sound" block), with every name the
    troubadours gave it, the rows it plays in, and where to fetch its bytes.

    The builder and the Map download only these bytes (an HTTP range of the .troubadour file), so the sounds
    are not stored twice in the repository. The bytes are taken from the tale that brought the sound.
    """
    seen = {}
    for e in entries:
        path = RECUEIL / e["file"]
        zf = zipfile.ZipFile(path)
        infos = {i.filename: i for i in zf.infolist()}
        for row, s in tale_sounds(e["file"]):
            info = infos.get(s.get("file"))
            block = s.get("sound") or {}
            sid = block.get("id")
            if info is None or not sid or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                continue
            name = str(s.get("name") or Path(info.filename).stem).strip()
            brought = block.get("brought") or {}
            item = seen.get(sid)
            if item is None:
                item = seen[sid] = {
                    "id": sid, "row": row, "rows": [], "name": name, "names": [],
                    "origin": block.get("origin") or [], "brought": brought,
                    "tale": e["title"], "tales": [], "bard": e["bard"],
                }
                if block.get("edited"):
                    item["edited"] = True
                if block.get("parent"):
                    item["parent"] = block["parent"]
                item["_bytes"] = None
            if row not in item["rows"]:
                item["rows"].append(row)
            if e["title"] not in item["tales"]:
                item["tales"].append(e["title"])
            if not any(n["name"].lower() == name.lower() and n["tale"] == e["title"] for n in item["names"]):
                item["names"].append({"name": name, "tale": e["title"], "bard": e["bard"]})
            # Bytes, name and row of the tale that brought it (else the first tale that has it).
            from_brought = brought.get("tale") == e["title"]
            if item["_bytes"] is None or (from_brought and not item["_bytes"]):
                offset, length = data_span(path, info)
                item.update({"file": e["file"], "path": info.filename, "offset": offset, "length": length,
                             "size": info.file_size, "deflated": info.compress_type == zipfile.ZIP_DEFLATED})
                if from_brought:
                    item.update({"name": name, "row": row, "tale": e["title"], "bard": e["bard"]})
                if isinstance(s.get("duration"), (int, float)) and s["duration"] > 0:
                    item["duration"] = round(float(s["duration"]), 1)
                item["_bytes"] = from_brought
    sounds = list(seen.values())
    for item in sounds:
        del item["_bytes"]
        # The bringing tale's name first, then the others in the order of the tales.
        item["names"].sort(key=lambda n: (n["tale"] != item["tale"] or n["name"] != item["name"]))
    sounds.sort(key=lambda x: (LIBRARY_ORDER.index(x["row"]), x["name"].lower(), x["tale"].lower()))
    return sounds


def write_if_changed(name, key, value):
    """Writes docs/recueil/<name> unless only its "updated" date would change."""
    out = RECUEIL / name
    if out.exists():
        try:
            if json.loads(out.read_text(encoding="utf-8")).get(key) == value:
                print(f"{name} already up to date")
                return
        except ValueError:
            pass
    data = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), key: value}
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{name}: {len(value)} {key}")


def main():
    only_check = "--check" in sys.argv
    files = sorted(RECUEIL.glob("*.troubadour"))
    tales, failed = [], False
    checked = [(f, *check(f)) for f in files]
    clash, _ = consistency([e for _, e, errs in checked if e and not errs])
    for f, entry, errors in checked:
        errors = errors + clash.get(f.name, [])
        if errors:
            failed = True
            print(f"::error file=docs/recueil/{f.name}::{f.name}: " + "; ".join(errors))
        else:
            print(f"ok  {f.name}: {entry['title']} ({len(entry['chapters'])} chapters, {entry['sounds']} sounds)")
            tales.append(entry)
    if only_check:
        author, base = os.environ.get("PR_AUTHOR", ""), os.environ.get("BASE_REF", "")
        if author and base:
            maintainer = os.environ.get("MAINTAINER", "arthurvangeersdaele")
            for name, errs in ownership(tales, author, base, maintainer).items():
                failed = True
                print(f"::error file=docs/recueil/{name}::{name}: " + "; ".join(errs))
            if not failed:
                print(f"ok  ownership: every tale may be sent by @{author}")
        sys.exit(1 if failed else 0)
    tales.sort(key=lambda t: t["title"].lower())
    write_if_changed("index.json", "tales", tales)
    write_if_changed("sounds.json", "sounds", library(tales))


if __name__ == "__main__":
    main()
