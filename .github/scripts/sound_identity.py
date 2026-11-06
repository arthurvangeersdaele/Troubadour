"""The locked identity of a sound (the "sound" block of a sound in story.json). Spec: TROUBADOUR_FORMAT.md.

    "sound": {
      "id": "9f2c41d07a3be815",            # first 16 hex digits of the SHA-256 of the audio bytes
      "origin": [ { "title": "night_rain.ogg", "url": "https://…", "original": "https://freesound.org/…",
                    "project": "Cataclysm: DDA CC-Sounds", "author": "sergeeo", "licence": "CC BY 3.0" } ],
      "edited": true,                         # cut, mixed, filtered… from its origin(s)
      "parent": "1b07…",                      # the sound it was made from, when a tool changed the bytes
      "brought": { "troubadour": "Troubadour", "tale": "The 1950 Asylum", "date": "2026-10-15" }
    }

Shared by build_recueil_index.py (the Recueil check) and migrate_sound_identity.py.
"""
import hashlib

# Licences the Recueil accepts. Non-commercial and no-derivatives licences stay out: tales are shared freely
# and every tool may crop a sound.
LICENCES = {
    "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "Public domain": "",
    "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
    "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
    "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
    "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
    "OGA-BY 3.0": "https://static.opengameart.org/OGA-BY-3.0.txt",
    "GNU GPL": "https://www.gnu.org/licenses/gpl-3.0.html",
    "GNU GPL v2+": "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html",
    "GNU GPL v3": "https://www.gnu.org/licenses/gpl-3.0.html",
    "GNU GPL v3+": "https://www.gnu.org/licenses/gpl-3.0.html",
    "BSD": "https://opensource.org/license/bsd-3-clause",
}
ORIGIN_KEYS = ("title", "url", "original", "project", "author", "licence", "own")


def sound_id(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def origin_errors(origin):
    """Why an origin list is not enough for the Recueil (empty list: it is fine)."""
    if not isinstance(origin, list) or not origin:
        return ["has no origin: give its source, author and licence in the Story builder (the i on its card)"]
    errs = []
    for o in origin:
        if not isinstance(o, dict):
            errs.append("has a broken origin")
            continue
        if not str(o.get("author", "")).strip():
            errs.append("has an origin without author")
        if o.get("licence") not in LICENCES:
            errs.append(f'has an origin under "{o.get("licence", "")}", a licence the Recueil does not take '
                        f'({", ".join(LICENCES)})')
        if not o.get("own") and not str(o.get("url", "")).startswith(("https://", "http://")):
            errs.append("has an origin without a link to its source")
    return errs


def same_origin(a, b):
    """Origins compared on what they say, not on key order or spacing."""
    def norm(lst):
        return sorted(tuple((k, str(o.get(k, "")).strip()) for k in ORIGIN_KEYS) for o in (lst or []) if isinstance(o, dict))
    return norm(a) == norm(b)


def contains_origin(child, parent):
    """A variant keeps every origin of the sound it was made from (it may add more, when mixed)."""
    have = {tuple((k, str(o.get(k, "")).strip()) for k in ORIGIN_KEYS) for o in (child or []) if isinstance(o, dict)}
    return all(tuple((k, str(o.get(k, "")).strip()) for k in ORIGIN_KEYS) in have for o in (parent or []) if isinstance(o, dict))
