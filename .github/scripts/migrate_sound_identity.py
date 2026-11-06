#!/usr/bin/env python3
"""One-off (November 2026): gives every sound of the Recueil tales its locked identity (the "sound" block).

Origins come from the credit tables: docs/recueil/CREDITS.md (tales rhythmed by Troubadour) and
docs/play/sounds/CREDITS.md (Werewolf and the Soundbox, which came from the web edition).
"brought" goes to the troubadour of the oldest tale that uses the sound. Every tale is rewritten with its
revision raised by one; the audio entries are copied unchanged.

    python3 .github/scripts/migrate_sound_identity.py           # report only
    python3 .github/scripts/migrate_sound_identity.py --write   # rewrite the tales
"""
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sound_identity import LICENCES, sound_id, origin_errors  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RECUEIL = ROOT / "docs" / "recueil"
ZONES = ("music", "ambience", "events")

LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse_rows(text):
    """{section: {file path: (origins, edited)}} from a credits table."""
    out, section = {}, None
    for line in text.splitlines():
        if line.startswith("## "):
            section = line[3:].strip()
            out[section] = {}
            continue
        if not line.startswith("| `") or section is None:
            continue
        c = cells(line)
        if len(c) < 4:
            continue
        m = re.match(r"`([^`]+)`\s*(\*edited\*)?", c[0])
        path, edited = m.group(1), bool(m.group(2))
        froms = c[1].split("<br>")
        authors = c[2].split("<br>")
        lics = c[3].split("<br>")
        origins = []
        for i, f in enumerate(froms):
            project, _, rest = f.partition(":")
            links = LINK.findall(rest)
            lic_cell = lics[min(i, len(lics) - 1)].strip()
            lm = LINK.search(lic_cell)
            lic = lm.group(1) if lm else lic_cell
            o = {"title": links[0][0] if links else "", "url": links[0][1] if links else "",
                 "project": project.strip(), "author": authors[min(i, len(authors) - 1)].strip(), "licence": lic}
            if len(links) > 1 and links[1][0] == "original":
                o["original"] = links[1][1]
            origins.append({k: v for k, v in o.items() if v})
        out[section][path] = (origins, edited)
    return out


def web_key(path):
    """1-day/events/09_the-werewolves-win.mp3 -> ('1', 'events', '09'); 01_critical-hit.mp3 -> ('soundbox', '01')."""
    parts = path.split("/")
    if len(parts) == 1:
        return ("soundbox", parts[0].split("_")[0])
    return (parts[0].split("-")[0], parts[1], parts[2].split("_")[0])


def tale_key(file):
    """sounds/1/events/09-x.mp3 -> ('1', 'events', '09'); sounds/soundbox/01-x.mp3 -> ('soundbox', '01')."""
    parts = file.split("/")
    if parts[1] == "soundbox":
        return ("soundbox", parts[2].split("-")[0])
    return (parts[1], parts[2], parts[3].split("-")[0])


def places(story):
    for ch in story.get("chapters", []):
        for z in ZONES:
            for s in ch.get(z, []) or []:
                yield s
    for s in story.get("soundbox", []) or []:
        yield s


def main():
    write = "--write" in sys.argv
    recueil_credits = parse_rows((RECUEIL / "CREDITS.md").read_text(encoding="utf-8"))
    web_credits = parse_rows((ROOT / "docs" / "play" / "sounds" / "CREDITS.md").read_text(encoding="utf-8"))
    werewolf = {web_key(p): v for p, v in web_credits.get("Werewolf", {}).items()}
    soundbox = {web_key(p): v for p, v in web_credits.get("Soundbox", {}).items()}
    by_file = {}
    for section, rows in recueil_credits.items():
        m = re.search(r"Tale `([^`]+)`", (RECUEIL / "CREDITS.md").read_text(encoding="utf-8").split(f"## {section}", 1)[1])
        by_file[m.group(1)] = rows

    tales = []
    for path in sorted(RECUEIL.glob("*.troubadour")):
        zf = zipfile.ZipFile(path)
        story = json.loads(zf.read("story.json").decode("utf-8"))
        tales.append((path, zf, story))
    # Oldest tale first: it brought the sounds it shares with later tales.
    tales.sort(key=lambda t: (t[2].get("created", ""), t[0].name))

    registry, missing, problems = {}, [], []
    for path, zf, story in tales:
        rows = by_file.get(path.name, {})
        for s in places(story):
            data = zf.read(s["file"])
            sid = sound_id(data)
            if sid in registry:
                s["sound"] = json.loads(json.dumps(registry[sid]))
                continue
            rel = s["file"][len("sounds/"):]
            found = rows.get(rel)
            if found is None and path.name == "werewolf.troubadour":
                found = werewolf.get(tale_key(s["file"])) or (soundbox.get(tale_key(s["file"])) if "/soundbox/" in s["file"] else None)
            if found is None and "/soundbox/" in s["file"]:
                found = soundbox.get(tale_key(s["file"]))
            if found is None:
                missing.append(f"{path.name}: {s['file']}")
                continue
            origins, edited = found
            errs = origin_errors(origins)
            if errs:
                problems.append(f"{path.name}: {s['file']}: {'; '.join(errs)}")
            block = {"id": sid, "origin": origins}
            if edited:
                block["edited"] = True
            block["brought"] = {"troubadour": story.get("bard", ""), "tale": story.get("title", ""),
                                "date": str(story.get("created", ""))[:10]}
            registry[sid] = block
            s["sound"] = json.loads(json.dumps(block))
        s_recueil = [s for s in places(story) if "recueil" in s]
        for s in s_recueil:
            del s["recueil"]  # replaced by "sound": the tale it came from is in brought, and in the library

    print(f"{len(registry)} distinct sounds in {len(tales)} tales")
    for m in missing:
        print("no credit:", m)
    for p in problems:
        print("origin:", p)
    if missing or problems:
        sys.exit(1)
    if not write:
        return
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for path, zf, story in tales:
        story["revision"] = int(story.get("revision", 1)) + 1
        story["forged"] = stamp
        tmp = path.with_suffix(".tmp")
        with zipfile.ZipFile(tmp, "w") as out:
            info = zipfile.ZipInfo("story.json", date_time=datetime.now().timetuple()[:6])
            info.compress_type = zipfile.ZIP_STORED
            out.writestr(info, json.dumps(story, indent=2, ensure_ascii=False) + "\n")
            for i in zf.infolist():
                if i.filename == "story.json":
                    continue
                out.writestr(i, zf.read(i.filename), compress_type=i.compress_type)
        zf.close()
        tmp.replace(path)
        print(f"rewrote {path.name} (revision {story['revision']})")


if __name__ == "__main__":
    main()
