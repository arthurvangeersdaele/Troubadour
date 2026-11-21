#!/usr/bin/env python3
"""Builds 'The Forest Adventure', a discovery world of Troubadour Map: the old forest, its creek, the bear's den, the
owl glade, the pub and the village, on one map.

Every sound is a sound of the discovery story The Forest Adventure (docs/discovery/sounds/forest), with its sound block
(origin, author, licence) read from docs/discovery/CREDITS.md. Writes
docs/discovery/maps/261121_the_forest_adventure.troubadour-map; then run build_discovery_index.py (or push: the
Update discovery index action does it).

    python3 .github/scripts/map-worlds/forest.py
"""
import hashlib
import json
import math
import random
import re
import subprocess
import uuid
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
DISC = REPO / 'docs' / 'discovery'
FOREST = DISC / 'sounds' / 'forest'
OUT = DISC / 'maps' / '261121_the_forest_adventure.troubadour-map'
TALE = 'The Forest Adventure'
NOW = '2026-11-21T15:00:00Z'
BROUGHT = {'troubadour': 'Troubadour', 'tale': TALE, 'date': '2026-11-21'}

LIC = {'CC BY-SA 3.0', 'CC BY-SA 4.0', 'CC BY 3.0', 'CC BY 4.0', 'CC0', 'Public domain', 'GNU GPL v2+'}


def credits():
    s = (DISC / 'CREDITS.md').read_text()
    out = {}
    for line in s.splitlines():
        m = re.match(r"\| `([^`]+)`( \*edited\*)? \| (.+?) \| (.+?) \| (.+?) \|$", line)
        if not m:
            continue
        origin = []
        for part in m.group(3).split('<br>'):
            pm = re.match(r"(.+?): \[(.+?)\]\((.+?)\)(?: \(\[original\]\((.+?)\)\))?", part.strip())
            if not pm:
                continue
            lic = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', m.group(5)).strip()
            o = {'title': pm.group(2), 'url': pm.group(3), 'project': pm.group(1).strip(), 'author': m.group(4).strip(), 'licence': lic}
            if pm.group(4):
                o['original'] = pm.group(4)
            origin.append(o)
        out[m.group(1)] = (origin, bool(m.group(2)))
    return out


CREDITS = credits()
files, blocks, durations = {}, {}, {}


def length(p):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)], capture_output=True, text=True, check=True).stdout
    return round(float(out.strip()), 1)


def snd(rel, folder):
    """A sound of the forest story (its path under sounds/forest). Returns (path in the archive, name)."""
    src = FOREST / rel
    name = re.sub(r'^\d+_', '', src.stem).replace('-', ' ').capitalize()
    path = f'sounds/{folder}/{src.stem.split("_", 1)[1]}.mp3'
    if path not in files:
        data = src.read_bytes()
        files[path] = data
        origin, edited = CREDITS[rel]
        b = {'id': hashlib.sha256(data).hexdigest()[:16], 'origin': origin}
        if edited:
            b['edited'] = True
        b['brought'] = BROUGHT
        blocks[path] = b
        durations[path] = length(src)
    return path, name


def card(rel, zone, play, vol, rmax=None, blend=None):
    path, n = snd(rel, zone)
    c = {'name': n, 'file': path, 'zone': zone, 'play': play, 'autoplay': True, 'volume': vol}
    if rmax: c['randomMax'] = rmax
    if blend: c['blend'] = blend
    return c


A = lambda rel, v: card(rel, 'ambience', 'loop', v, blend=4)
E = lambda rel, v, rmax=20: card(rel, 'events', 'random', v, rmax)
MU = lambda rel, v=0.55: card(rel, 'music', 'loop', v)

F1, F2, F3, F4 = '1-in-the-forest', '2-fight-with-a-bear', '3-a-night-at-the-pub', '4-the-human-village'

W, H = 3200, 2000
_n = [0]


def nid():
    _n[0] += 1
    return f'e{_n[0]}'


def stamp(title, sid, x, y, size, radius, cards=(), rotation=0):
    return {'id': nid(), 'title': title, 'radius': radius, 'cards': list(cards), 'link': None,
            'shape': {'type': 'stamp', 'stamp': sid, 'x': x, 'y': y, 'size': size, 'rotation': rotation}}


def path(title, pts, radius, cards=(), closed=True):
    return {'id': nid(), 'title': title, 'radius': radius, 'cards': list(cards), 'link': None,
            'shape': {'type': 'path', 'closed': closed, 'points': [[round(x), round(y)] for x, y in pts]}}


def blob(cx, cy, rx, ry, n=12, seed=0):
    r = random.Random(seed)
    return [[cx + rx * (0.86 + r.random() * 0.26) * math.cos(2 * math.pi * k / n),
             cy + ry * (0.86 + r.random() * 0.26) * math.sin(2 * math.pi * k / n)] for k in range(n)]


def build():
    els = [
        # The road, under everything: from the forest's edge, past the den, to the pub and the village.
        path('', [[1080, 820], [1450, 960], [1800, 1080], [2150, 1230], [2450, 1400], [2700, 1560]], 0, closed=False),
        path('', [[1800, 1080], [1980, 760], [2050, 560]], 0, closed=False),

        # The old forest, top left.
        stamp('The old forest', 'forest', 680, 560, 780, 280, [
            MU(f'{F1}/music/03_highland-mist.mp3'),
            A(f'{F1}/ambience/01_forest-at-day.mp3', 0.55), A(f'{F1}/ambience/02_birdsong.mp3', 0.4),
            E(f'{F1}/events/04_woodpecker.mp3', 0.4, 20), E(f'{F1}/events/05_blackbird-sings.mp3', 0.45, 16),
            E(f'{F1}/events/07_rustling-leaves.mp3', 0.3, 24),
        ]),
        stamp('', 'pine', 1180, 330, 170, 0), stamp('', 'tree', 1060, 1040, 150, 0), stamp('', 'pine', 260, 1100, 160, 0),
        stamp('', 'tree', 330, 1420, 140, 0), stamp('', 'pine', 1500, 240, 130, 0), stamp('', 'grove', 600, 1250, 220, 0),

        # The creek, from the hills to the bottom of the map.
        path('The creek', [[1330, 0], [1390, 380], [1320, 760], [1260, 1160], [1120, 1520], [980, 2000]], 150,
             [A(f'{F1}/ambience/04_the-creek.mp3', 0.5)], closed=False),
        stamp('', 'bridge', 1460, 960, 150, 0, rotation=20),

        # The owl glade, in the deep woods.
        stamp('The owl glade', 'mushrooms', 700, 1650, 200, 230, [
            MU(f'{F1}/music/02_silvan-sanctuary.mp3', 0.5),
            E(f'{F1}/events/03_owl-hoots.mp3', 0.45, 14), E(f'{F1}/events/02_raven-calls.mp3', 0.35, 20),
            E(f'{F1}/events/01_wolf-growl.mp3', 0.3, 30), E(f'{F1}/events/06_a-branch-snaps.mp3', 0.35, 26),
        ]),

        # The bear's den, up the hill.
        stamp("The bear's den", 'cave', 2080, 430, 230, 250, [
            MU(f'{F2}/music/03_calm-before-the-storm.mp3'),
            A(f'{F2}/ambience/02_restless-wind.mp3', 0.4),
            E(f'{F2}/events/02_bear-growl.mp3', 0.5, 12), E(f'{F2}/events/06_wings-in-the-trees.mp3', 0.35, 25),
        ]),
        stamp('', 'rocks', 2330, 560, 150, 0), stamp('', 'pine', 1820, 300, 150, 0), stamp('', 'pine', 2420, 260, 140, 0),

        # The pub, on the road.
        stamp('The pub', 'tavern', 2300, 1330, 240, 160, [
            MU(f'{F3}/music/01_tavern-in-the-mist.mp3'),
            A(f'{F3}/ambience/01_busy-tavern.mp3', 0.5), A(f'{F3}/ambience/02_fireplace.mp3', 0.45),
            E(f'{F3}/events/03_hearty-laugh.mp3', 0.35, 20), E(f'{F3}/events/02_coins-on-the-table.mp3', 0.3, 24),
        ]),

        # The village, bottom right.
        path('Village square', blob(2760, 1660, 230, 160, 12, 5), 200, [
            MU(f'{F4}/music/02_harvest-festival.mp3'),
            A(f'{F4}/ambience/01_village-market.mp3', 0.45), A(f'{F4}/ambience/02_farmyard.mp3', 0.25),
            E(f'{F4}/events/04_chickens.mp3', 0.35, 20), E(f'{F4}/events/05_horse-whinnies.mp3', 0.35, 30),
            E(f'{F4}/events/03_dog-barks.mp3', 0.3, 26),
        ]),
        stamp('The forge', 'forge', 3000, 1300, 170, 140, [A(f'{F4}/ambience/03_blacksmith-at-work.mp3', 0.4)]),
        stamp('The church', 'church', 2480, 1820, 200, 170, [E(f'{F4}/events/01_church-bell.mp3', 0.45, 30)]),
        stamp('', 'house', 3020, 1700, 140, 0), stamp('', 'house', 2900, 1900, 130, 0), stamp('', 'well', 2600, 1600, 90, 0),
        stamp('', 'market', 2780, 1650, 170, 0),
    ]
    general = [MU(f'{F1}/music/01_forest-theme.mp3', 0.5), A(f'{F1}/ambience/03_wind-in-the-leaves.mp3', 0.2)]
    place = {'id': 'forest', 'title': 'The Forest Adventure', 'width': W, 'height': H, 'ground': 'grass',
             'player': [1450, 960], 'general': general, 'walls': [], 'elements': els}
    return place


def main():
    place = build()
    sb = []
    for name, f in [('Critical hit', '01_critical-hit'), ('Level up', '02_level-up'), ('Gold coins', '11_gold-coins'), ('Fanfare', '18_fanfare')]:
        src = DISC / 'sounds' / 'soundbox' / f'{f}.mp3'
        p = f'sounds/soundbox/{f.split("_", 1)[1]}.mp3'
        data = src.read_bytes(); files[p] = data; durations[p] = length(src)
        blocks[p] = {'id': hashlib.sha256(data).hexdigest()[:16], 'origin': CREDITS.get(f'{f}.mp3', ([], False))[0], 'brought': BROUGHT}
        sb.append({'name': name, 'file': p, 'zone': 'soundbox', 'play': 'once', 'autoplay': True, 'volume': 0.6})
    used = {}
    for c in place['general'] + [c for e in place['elements'] for c in e['cards']]:
        used.setdefault(c['file'], (c['name'], c['zone']))
    music = [place['general'][0]] + [c for e in place['elements'] for c in e['cards'] if c['zone'] == 'music']
    chapter = {'title': 'Sounds of the forest', 'description': 'Every sound of the map.', 'music': [], 'ambience': [], 'events': []}
    for p, (name, zone) in sorted(used.items()):
        chapter[zone].append({'name': name, 'file': p, 'loop': {'music': 'infinite', 'ambience': 'infinite'}.get(zone, 'random'),
                              'volume': 0.6, 'duration': durations[p], 'sound': blocks[p]})
    story_box = [{'name': c['name'], 'file': c['file'], 'loop': 'once', 'volume': 0.6, 'duration': durations[c['file']], 'sound': blocks[c['file']]} for c in sb]
    sid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'troubadour-map/the-forest-adventure'))
    story = {
        'format': 'troubadour', 'version': 2, 'id': sid, 'revision': 1, 'bard': 'Troubadour', 'title': TALE,
        'description': 'A discovery world of Troubadour Map: the old forest, its creek, the owl glade, the bear\'s den, '
                       'the pub and the village. Lay the party with a long press and walk it: each place rises as you come near. '
                       'Sounds of the discovery story The Forest Adventure (see each sound\'s origin).',
        'created': NOW, 'forged': NOW, 'generator': 'Troubadour Map discovery script', 'chapters': [chapter], 'soundbox': story_box,
    }
    world = {
        'format': 'troubadour-map', 'version': 1, 'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'troubadour-map/world/the-forest-adventure')),
        'story': sid, 'revision': 1, 'bard': 'Troubadour', 'created': NOW, 'forged': NOW, 'generator': 'Troubadour Map discovery script',
        'wallLoss': 0.7, 'places': [place], 'soundbox': sb, 'music': music, 'stamps': [],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_STORED) as z:
        z.writestr('story.json', json.dumps(story, indent=2, ensure_ascii=False) + '\n')
        z.writestr('map.json', json.dumps(world, indent=2, ensure_ascii=False) + '\n')
        for p in sorted(files):
            z.writestr(p, files[p])
    print(OUT.relative_to(REPO), round(OUT.stat().st_size / 1e6, 1), 'MB,', len(files), 'sounds')


if __name__ == '__main__':
    main()
