#!/usr/bin/env python3
"""Builds 'The Four Lands', the discovery world of Troubadour Map: one map with a forest, a lake, a desert and a village.

Every sound comes byte for byte from the Recueil (docs/recueil), with its sound block (origin, author, licence), so the
world needs nothing but this repository. Writes docs/discovery/maps/261117_the_four_lands.troubadour-map; then
run build_discovery_index.py (or push: the Update discovery index action does it).

    python3 .github/scripts/map-worlds/four_lands.py
"""
import json
import math
import random
import uuid
import zipfile
import zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
RECUEIL = REPO / 'docs' / 'recueil'
OUT = REPO / 'docs' / 'discovery' / 'maps' / '261117_the_four_lands.troubadour-map'
TALE = 'The Four Lands'
NOW = '2026-11-17T18:00:00Z'
BROUGHT = {'troubadour': 'Troubadour', 'tale': TALE, 'date': '2026-11-17'}
SOUNDS = {x['id'][:12]: x for x in json.loads((RECUEIL / 'sounds.json').read_text())['sounds']}

files, blocks, durations = {}, {}, {}


def slug(s):
    return ''.join(c if c.isalnum() else '-' for c in s.lower()).strip('-').replace('--', '-')


def recueil_bytes(x):
    with open(RECUEIL / x['file'], 'rb') as f:
        f.seek(x['offset'])
        data = f.read(x['length'])
    if x.get('deflated'):
        data = zlib.decompress(data, -15)
    assert len(data) == x['size'], x['name']
    return data


def rec(key, folder):
    """A Recueil sound, kept byte for byte with its block. Returns (path in the archive, name)."""
    x = SOUNDS[key]
    path = f'sounds/{folder}/{slug(x["name"])}.{x["path"].rsplit(".", 1)[-1]}'
    if path not in files:
        files[path] = recueil_bytes(x)
        b = {'id': x['id'], 'origin': x['origin']}
        if x.get('edited'): b['edited'] = True
        if x.get('parent'): b['parent'] = x['parent']
        b['brought'] = x.get('brought') or BROUGHT
        blocks[path] = b
        durations[path] = x.get('duration') or 0
    return path, x['name']


def card(key, zone, play, vol, rmax=None, blend=None, name=None):
    path, n = rec(key, zone)
    c = {'name': name or n, 'file': path, 'zone': zone, 'play': play, 'autoplay': True, 'volume': vol}
    if rmax: c['randomMax'] = rmax
    if blend: c['blend'] = blend
    return c


A = lambda k, v: card(k, 'ambience', 'loop', v, blend=4)
E = lambda k, v, rmax=20: card(k, 'events', 'random', v, rmax)
MU = lambda k, v=0.55: card(k, 'music', 'loop', v)
SB = lambda k, name=None: card(k, 'soundbox', 'once', 0.6, name=name)

# ---------------- Drawings of the world (world.stamps) ----------------
def rect(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


def st(w, pts):
    return {'w': w, 'p': [[round(x, 3), round(y, 3)] for x, y in pts]}


def cottage(sid, name, roof):
    return {'id': sid, 'name': name, 'v': 1, 'paint': [], 'strokes': [
        st(0.022, rect(0.22, 0.48, 0.78, 0.88)), st(0.022, [[0.13, 0.5], [0.5, 0.15], [0.87, 0.5], [0.13, 0.5]]),
        st(0.018, rect(0.44, 0.66, 0.56, 0.88)), st(0.014, rect(0.28, 0.57, 0.38, 0.67)), st(0.014, rect(0.62, 0.57, 0.72, 0.67)),
        st(0.018, rect(0.64, 0.2, 0.72, 0.36))],
        'fills': [{'x': 0.3, 'y': 0.8, 'c': 'ground'}, {'x': 0.5, 'y': 0.38, 'c': roof}, {'x': 0.5, 'y': 0.8, 'c': 'hole'},
                  {'x': 0.33, 'y': 0.62, 'c': 'music'}, {'x': 0.67, 'y': 0.62, 'c': 'music'}, {'x': 0.68, 'y': 0.28, 'c': 'stone'}]}


def palm():
    frond = lambda a, b, c: st(0.02, [a, b, c])
    return {'id': 'p-fl-palm', 'name': 'Palm tree', 'v': 1, 'paint': [], 'fills': [], 'strokes': [
        st(0.03, [[0.52, 0.92], [0.5, 0.7], [0.47, 0.5], [0.47, 0.3]]),
        frond([0.47, 0.3], [0.3, 0.22], [0.12, 0.34]), frond([0.47, 0.3], [0.62, 0.2], [0.86, 0.3]),
        frond([0.47, 0.3], [0.36, 0.12], [0.2, 0.1]), frond([0.47, 0.3], [0.6, 0.1], [0.78, 0.12]),
        frond([0.47, 0.3], [0.5, 0.16], [0.52, 0.04]), st(0.022, [[0.3, 0.92], [0.74, 0.92]])]}


def dunes():
    wave = lambda y, x0, x1: st(0.02, [[x0 + (x1 - x0) * t / 8, y - 0.08 * math.sin(math.pi * t / 8)] for t in range(9)])
    return {'id': 'p-fl-dunes', 'name': 'Dunes', 'v': 1, 'paint': [], 'fills': [], 'strokes': [
        wave(0.42, 0.08, 0.62), wave(0.62, 0.34, 0.94), wave(0.84, 0.04, 0.56)]}


STAMPS = [
    cottage('p-fl-house', 'Cottage', '#8c3b2e'),
    cottage('p-fl-house2', 'Cottage', 'stone'),
    {'id': 'p-fl-tavern', 'name': 'Tavern', 'v': 1, 'paint': [], 'strokes': [
        st(0.022, rect(0.1, 0.5, 0.9, 0.88)), st(0.022, [[0.06, 0.52], [0.24, 0.24], [0.76, 0.24], [0.94, 0.52], [0.06, 0.52]]),
        st(0.018, rect(0.45, 0.66, 0.57, 0.88)), st(0.014, rect(0.17, 0.58, 0.29, 0.68)), st(0.014, rect(0.71, 0.58, 0.83, 0.68)),
        st(0.012, [[0.33, 0.56], [0.33, 0.62]]), st(0.014, rect(0.27, 0.62, 0.39, 0.7))],
        'fills': [{'x': 0.2, 'y': 0.8, 'c': 'ground'}, {'x': 0.5, 'y': 0.4, 'c': '#8c3b2e'}, {'x': 0.51, 'y': 0.8, 'c': 'hole'},
                  {'x': 0.23, 'y': 0.63, 'c': 'music'}, {'x': 0.77, 'y': 0.63, 'c': 'music'}, {'x': 0.33, 'y': 0.66, 'c': 'music'}]},
    {'id': 'p-fl-chapel', 'name': 'Chapel', 'v': 1, 'paint': [], 'strokes': [
        st(0.022, rect(0.14, 0.52, 0.64, 0.9)), st(0.022, [[0.1, 0.54], [0.39, 0.3], [0.68, 0.54], [0.1, 0.54]]),
        st(0.022, rect(0.64, 0.3, 0.86, 0.9)), st(0.022, [[0.6, 0.32], [0.75, 0.1], [0.9, 0.32], [0.6, 0.32]]),
        st(0.016, [[0.75, 0.01], [0.75, 0.1]]), st(0.016, [[0.71, 0.045], [0.79, 0.045]]),
        st(0.018, rect(0.34, 0.7, 0.44, 0.9)), st(0.014, rect(0.71, 0.42, 0.79, 0.54))],
        'fills': [{'x': 0.25, 'y': 0.8, 'c': 'stone'}, {'x': 0.39, 'y': 0.45, 'c': '#4a3a2c'}, {'x': 0.7, 'y': 0.7, 'c': 'stone'},
                  {'x': 0.75, 'y': 0.25, 'c': '#4a3a2c'}, {'x': 0.39, 'y': 0.85, 'c': 'hole'}, {'x': 0.75, 'y': 0.48, 'c': 'music'}]},
    palm(),
    dunes(),
]

# ---------------- The map ----------------
W, H = 3200, 2000
_n = [0]


def nid():
    _n[0] += 1
    return f'e{_n[0]}'


def stamp(title, sid, x, y, size, radius, cards=(), link=None, rotation=0):
    return {'id': nid(), 'title': title, 'radius': radius, 'cards': list(cards), 'link': link,
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
        # Roads first, under everything: from the crossroads to each land.
        path('', [[1600, 1000], [1380, 860], [1150, 760]], 0, closed=False),
        path('', [[1600, 1000], [1380, 1160], [1220, 1330]], 0, closed=False),
        path('', [[1600, 1000], [1820, 860], [2050, 760]], 0, closed=False),
        path('', [[1600, 1000], [1780, 1180], [1960, 1380]], 0, closed=False),

        # The forest, top left.
        stamp('The old forest', 'forest', 720, 520, 760, 260, [
            MU('520e04716adc'),                                   # Deep forest
            A('fc72d9a95a59', 0.55), A('353d58526115', 0.4),      # Deep woods, Birds in the oaks
            E('47946f94cfb0', 0.4, 18), E('5f8987f58404', 0.55, 25), E('f6c5731e4319', 0.35, 22),
        ]),
        stamp('', 'tree', 1230, 420, 170, 0), stamp('', 'tree', 1170, 640, 140, 0), stamp('', 'tree', 300, 960, 150, 0),
        stamp('', 'tree', 1290, 230, 130, 0),
        stamp('The hollow', 'rocks', 980, 880, 150, 160, [E('0b4824e41d02', 0.4, 25), E('802334acc2ec', 0.3, 30)]),

        # The lake, bottom left, with its creek.
        path('The silver lake', blob(760, 1500, 430, 270, 14, 3), 230, [
            A('81b1123680d6', 0.55), A('2592e0e34885', 0.45),     # Lake shore, Lapping water (first: the water's colour)
            E('644a5c71a2bf', 0.4, 15), E('9f0a0c7d9ea3', 0.3, 30),
            MU('875719be4d7c'),                                   # Pleasant creek
        ]),
        path('The creek', [[1150, 1440], [1320, 1500], [1450, 1640], [1520, 1860], [1560, 1990]], 140,
             [A('be206677a1ab', 0.3)], closed=False),
        stamp("Fisher's pier", 'bridge', 1080, 1260, 140, 120, [E('f6f6e8547c1a', 0.4, 20)], rotation=-30),

        # The desert, right, with an oasis and a caravan camp.
        path('The sea of dunes', [[2050, 140], [3100, 140], [3100, 1060], [2700, 1120], [2360, 1020], [2120, 820], [2000, 520]], 200, [
            MU('0c08a28cc008'),                                   # Mirage
            A('0c04ab0b5c39', 0.5), A('14e4426c9581', 0.35),      # Wind over the dunes, Drifting sand
            E('df3826a0d62a', 0.4, 15), E('97d047fc966c', 0.35, 28),
        ]),
        stamp('', 'p-fl-dunes', 2350, 380, 300, 0), stamp('', 'p-fl-dunes', 2900, 860, 260, 0), stamp('', 'p-fl-dunes', 2440, 860, 200, 0),
        stamp('The oasis', 'p-fl-palm', 2850, 420, 220, 220, [
            MU('33c8e24c2a5f'),                                   # Desert bazaar
            A('b5367ce61903', 0.5), A('266cc2dcbb86', 0.4), E('f61388b43701', 0.4, 22),
        ]),
        stamp('', 'p-fl-palm', 2700, 330, 150, 0), stamp('', 'p-fl-palm', 2990, 560, 160, 0),
        stamp('Caravan camp', 'tent', 2620, 780, 190, 180, [A('7f42fdf9d716', 0.45), E('f08bb64f6218', 0.4, 25), E('5f21d4e04f73', 0.3, 30)]),
        stamp('Sunken ruins', 'ruins', 2250, 620, 180, 160, [A('be4841c609ba', 0.4), E('cc5de1d16869', 0.35, 30)]),

        # The village, bottom right.
        path('Village square', blob(2350, 1580, 200, 140, 12, 9), 180, [
            MU('b040a80363e0'),                                   # Market day
            A('ad6f5835b40b', 0.45), A('0848119fd951', 0.35),     # Village square, Sunny morning
            E('67c6d7afb4b3', 0.35, 25),
        ]),
        stamp('The tavern', 'p-fl-tavern', 2720, 1500, 220, 130, [MU('a4233294bd3b'), A('e8ff164edd11', 0.5)]),  # Old sailor's tavern
        stamp('Chapel', 'p-fl-chapel', 2080, 1360, 210, 170, [A('ce8f506f1606', 0.35), E('9deb4c0787b1', 0.35, 30)]),
        stamp('', 'p-fl-house', 2560, 1800, 150, 0), stamp('', 'p-fl-house2', 2120, 1780, 150, 0),
        stamp('', 'p-fl-house', 2900, 1780, 140, 0), stamp('', 'p-fl-house2', 2960, 1300, 140, 0),
        stamp('The well', 'well', 2380, 1360, 100, 110, [A('471cba8cd9bf', 0.3)]),
    ]
    # A palisade on the desert side of the village: the sand wind is muffled behind it.
    walls = [{'id': nid(), 'points': [[1990, 1230], [2500, 1250], [3100, 1200]]}]
    general = [MU('70756d06a7f1', 0.5), A('437871a8a232', 0.2)]  # Wanderer, Morning breeze
    place = {'id': 'four-lands', 'title': 'The Four Lands', 'width': W, 'height': H, 'ground': 'grass',
             'player': [1600, 1000], 'general': general, 'walls': walls, 'elements': els}
    soundbox = [SB('e6465b3b8b5c', 'Thunderclap'), SB('f6988fbe30dc'), SB('802334acc2ec', 'Wolf howl'),
                SB('41caaf5dc880'), SB('691472152d9b')]
    return place, soundbox


def main():
    place, soundbox = build()
    used = {}
    for c in place['general']:
        used.setdefault(c['file'], (c['name'], c['zone']))
    for e in place['elements']:
        for c in e['cards']:
            used.setdefault(c['file'], (c['name'], c['zone']))
    music = [place['general'][0]] + [c for e in place['elements'] for c in e['cards'] if c['zone'] == 'music']
    chapter = {'title': 'Sounds of the Four Lands', 'description': 'Every sound of the map.', 'music': [], 'ambience': [], 'events': []}
    for p, (name, zone) in sorted(used.items()):
        chapter[zone].append({'name': name, 'file': p, 'loop': {'music': 'infinite', 'ambience': 'infinite'}.get(zone, 'random'),
                              'volume': 0.6, 'duration': durations[p], 'sound': blocks[p]})
    story_box = [{'name': c['name'], 'file': c['file'], 'loop': 'once', 'volume': 0.6, 'duration': durations[c['file']], 'sound': blocks[c['file']]}
                 for c in soundbox]
    sid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'troubadour-map/the-four-lands'))
    story = {
        'format': 'troubadour', 'version': 2, 'id': sid, 'revision': 1, 'bard': 'Troubadour', 'title': TALE,
        'description': 'The discovery world of Troubadour Map: one map with an old forest, a silver lake, a sea of dunes '
                       'and a village. Walk the party from the crossroads and hear each land rise as you come near. '
                       'Sounds from the Troubadour Recueil (see each sound\'s origin).',
        'created': NOW, 'forged': NOW, 'generator': 'Troubadour Map discovery script', 'chapters': [chapter], 'soundbox': story_box,
    }
    world = {
        'format': 'troubadour-map', 'version': 1, 'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'troubadour-map/world/the-four-lands')),
        'story': sid, 'revision': 1, 'bard': 'Troubadour', 'created': NOW, 'forged': NOW, 'generator': 'Troubadour Map discovery script',
        'wallLoss': 0.7, 'places': [place], 'soundbox': soundbox, 'music': music, 'stamps': STAMPS,
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
