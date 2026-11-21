#!/usr/bin/env python3
"""Builds 'The Werewolves of Ravenmoor', a Troubadour Map world for the Werewolf party game, in three maps:
Ravenmoor at dusk (the introduction, the roles are dealt), Ravenmoor by night, and the day of judgement.

Only long sounds (10 seconds or more): music and ambiences, and a soundbox of long moments (the death knell, the
village is saved...). They come byte for byte, with their sound blocks, from the Recueil tales Werewolves of Ravenmoor
and Werewolf, plus eleven new musics: village fantasy, calm night and stressful music from Battle for Wesnoth
(GNU GPL v2+) and 0 A.D. (CC BY-SA 3.0), downloaded and levelled here (music at about -18.4 LUFS and 112 kb/s, like the Recueil).
Writes docs/discovery/maps/261121_the_werewolves_of_ravenmoor.troubadour-map; then run build_discovery_index.py
(or push: the Update discovery index action does it).

    python3 .github/scripts/map-worlds/ravenmoor.py
"""
import hashlib
import json
import math
import random
import re
import subprocess
import urllib.request
import uuid
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
RECUEIL = REPO / 'docs' / 'recueil'
OUT = REPO / 'docs' / 'discovery' / 'maps' / '261121_the_werewolves_of_ravenmoor.troubadour-map'
CACHE = Path('/tmp/ravenmoor-cache')
TALE = 'The Werewolves of Ravenmoor'
NOW = '2026-11-21T22:30:00Z'
BROUGHT = {'troubadour': 'Troubadour', 'tale': TALE, 'date': '2026-11-21'}

WES = 'https://raw.githubusercontent.com/wesnoth/wesnoth/master/data/core/music/'
WES_PAGE = 'https://github.com/wesnoth/wesnoth/blob/master/data/core/music/'
OAD = 'https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/audio/music/'
OAD_PAGE = 'https://github.com/0ad/0ad/blob/main/binaries/data/mods/public/audio/music/'
GPL, BYSA = 'GNU GPL v2+', 'CC BY-SA 3.0'
# New music: (name, source file, project, author, licence)
NEW = {
    # Village fantasy.
    'Traveling minstrels': ('traveling_minstrels.ogg', 'Battle for Wesnoth', 'Mattias Westlund(West)', GPL),
    'Wanderer': ('wanderer.ogg', 'Battle for Wesnoth', 'Timothy Pinkham(TimothyP)', GPL),
    'Knolls': ('knolls.ogg', 'Battle for Wesnoth', 'Timothy Pinkham(TimothyP)', GPL),
    'Celtica': ('Celtica.ogg', '0 A.D.', 'Wildfire Games', BYSA),
    'Mountain idyll': ('Mountain_Idyll.ogg', '0 A.D.', 'Wildfire Games', BYSA),
    # Calm night.
    'Nunc dimittis': ('nunc_dimittis.ogg', 'Battle for Wesnoth', 'Jeremy Nicoll(jeremy2/eltiare)', GPL),
    'Albian nocturne': ('Albian_Nocturne.ogg', '0 A.D.', 'Wildfire Games', BYSA),
    # Stressful.
    'Suspense': ('suspense.ogg', 'Battle for Wesnoth', 'Ryan Reilly(Rain)', GPL),
    'The dangerous symphony': ('the_dangerous_symphony.ogg', 'Battle for Wesnoth', 'Gianmarco Leone(gmlion)', GPL),
    'Vengeful': ('vengeful.ogg', 'Battle for Wesnoth', 'Jeremy Nicoll(jeremy2/eltiare)', GPL),
    'Underground': ('underground.ogg', 'Battle for Wesnoth', 'Aleksi Aubry-Carlson(Aleksi)', GPL),
}

files, blocks, durations = {}, {}, {}


def slug(s):
    return re.sub(r'-+', '-', ''.join(c if c.isalnum() else '-' for c in s.lower())).strip('-')


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def length(p):
    return round(float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)]).stdout.strip()), 1)


# ---- Sounds of the Recueil tales, byte for byte. ----
TALES = {}
for key, f in [('R', '261107_werewolves_of_ravenmoor.troubadour'), ('W', 'werewolf.troubadour')]:
    z = zipfile.ZipFile(RECUEIL / f)
    story = json.loads(z.read('story.json'))
    cards = {}
    for ch in story['chapters']:
        for zone in ('music', 'ambience', 'events'):
            for c in ch[zone]:
                cards.setdefault(c['name'], c)
    for c in story.get('soundbox', []):
        cards.setdefault(c['name'], c)
    TALES[key] = (z, cards)


def rec(tale, name, folder):
    z, cards = TALES[tale]
    c = cards[name]
    assert c['duration'] >= 10, (name, c['duration'])
    path = f'sounds/{folder}/{slug(name)}.mp3'
    if path not in files:
        files[path] = z.read(c['file'])
        blocks[path] = c['sound']
        durations[path] = c['duration']
    return path, name


# ---- New music, downloaded and levelled. ----
def new(name):
    src, project, author, lic = NEW[name]
    CACHE.mkdir(parents=True, exist_ok=True)
    raw = CACHE / src
    if not raw.exists():
        url = (WES if project == 'Battle for Wesnoth' else OAD) + src
        with urllib.request.urlopen(url) as r:
            raw.write_bytes(r.read())
    mp3 = CACHE / f'{slug(name)}-112k.mp3'
    if not mp3.exists():
        st = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(raw), '-af', 'ebur128', '-f', 'null', '-']).stderr
        lufs = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', st)[-1])
        gain = -18.4 - lufs
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw), '-af', f'volume={gain:.2f}dB,alimiter=limit=0.89:level=false',
             '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '112k', '-map_metadata', '-1', str(mp3)])
    path = f'sounds/music/{slug(name)}.mp3'
    if path not in files:
        data = mp3.read_bytes()
        files[path] = data
        page = (WES_PAGE if project == 'Battle for Wesnoth' else OAD_PAGE) + src
        blocks[path] = {'id': hashlib.sha256(data).hexdigest()[:16],
                        'origin': [{'title': src, 'url': page, 'project': project, 'author': author, 'licence': lic}],
                        'edited': True, 'brought': BROUGHT}
        durations[path] = length(mp3)
    return path, name


def card(ref, zone, vol, play='loop'):
    path, n = ref
    c = {'name': n, 'file': path, 'zone': zone, 'play': play, 'autoplay': True, 'volume': vol}
    if zone == 'ambience':
        c['blend'] = 4
    return c


M = lambda ref, v=0.55: card(ref, 'music', v)
A = lambda ref, v=0.45: card(ref, 'ambience', v)
R = lambda name, folder: rec('R', name, folder)
Wt = lambda name, folder: rec('W', name, folder)

W, H = 3000, 2000
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


def houses(pts, sid='house', size=120):
    return [stamp('', sid, x, y, size, 0) for x, y in pts]


def build():
    # ---------- 1. Ravenmoor at dusk: the village gathers, the legend is told, the roles are dealt. ----------
    dusk_sign = stamp('Night falls', 'signpost', 2700, 1720, 130, 0, link='night')
    dusk = [
        path('', [[300, 1000], [900, 1000], [1500, 1000], [2100, 1000], [2700, 1000]], 0, closed=False),
        path('', [[1500, 1000], [1600, 1400], [2200, 1650], [2650, 1720]], 0, closed=False),
        path('The village square', blob(1500, 1000, 260, 190, 12, 3), 330, [
            M(new('Celtica')), M(rec('R', 'The cards are dealt', 'music'), 0.5),
            A(R('Murmurs of the villagers', 'ambience'), 0.5), A(R('Torches in the wind', 'ambience'), 0.35),
        ]),
        stamp('', 'well', 1500, 1000, 90, 0),
        stamp('The chapel', 'church', 900, 560, 230, 260, [
            M(R('Legends of the wolf', 'music'), 0.5), A(R('Ravens on the rooftops', 'ambience'), 0.4),
        ]),
        stamp('The Black Raven tavern', 'tavern', 2200, 620, 230, 250, [
            M(new('Wanderer')), A(Wt('Villagers argue', 'ambience'), 0.45), A(R('Torches in the wind', 'ambience'), 0.3),
        ]),
        stamp('The market', 'market', 1050, 1420, 200, 230, [
            M(new('Mountain idyll')), A(Wt('Village square', 'ambience'), 0.45),
        ]),
        stamp("The forest's edge", 'haunted', 330, 1600, 420, 330, [
            M(R('Northern dread', 'music'), 0.5), A(R('Distant howls', 'ambience'), 0.5),
        ]),
        stamp('', 'pine', 160, 1240, 140, 0), stamp('', 'deadtree', 620, 1820, 130, 0),
        stamp('The mill', 'windmill', 2550, 1250, 190, 200, [A(R('Village square at dusk', 'ambience'), 0.45)]),
        *houses([[1200, 700], [1850, 720], [1180, 1250], [1880, 1260], [600, 1000], [2400, 1000], [1700, 420]]),
        stamp('', 'fields', 2700, 400, 320, 0), stamp('', 'barn', 2380, 300, 150, 0),
        dusk_sign,
    ]
    dusk_place = {'id': 'dusk', 'title': 'Ravenmoor at dusk', 'width': W, 'height': H, 'ground': 'grass',
                  'player': [1500, 1180],
                  'general': [M(new('Traveling minstrels'), 0.5), A(R('Village square at dusk', 'ambience'), 0.2)],
                  'walls': [], 'elements': dusk}

    # ---------- 2. Ravenmoor by night: the village sleeps, the wolves hunt, the seer and the witch wake. ----------
    night_sign = stamp('Dawn breaks', 'signpost', 2700, 1720, 130, 0, link='day')
    night = [
        path('', [[300, 1000], [900, 1000], [1500, 1000], [2100, 1000], [2700, 1000]], 0, closed=False),
        path('', [[1500, 1000], [1600, 1400], [2200, 1650], [2650, 1720]], 0, closed=False),
        path("The wolves' trail", [[520, 620], [700, 900], [1000, 1100], [1250, 1350]], 120, [
            M(new('The dangerous symphony'), 0.5), A(R('The pack howls', 'ambience'), 0.35),
        ], closed=False),
        path('The sleeping village', blob(1500, 1000, 300, 220, 12, 8), 330, [
            M(Wt('Night town', 'music'), 0.5), A(Wt('Night wind', 'ambience'), 0.35),
        ]),
        stamp("The wolves' lair", 'cave', 450, 450, 260, 300, [
            M(R('The wolves gather', 'music')), M(new('Suspense')),
            A(R('Wolves circling', 'ambience'), 0.5),
        ]),
        stamp('', 'haunted', 250, 800, 300, 0), stamp('', 'deadtree', 760, 300, 140, 0), stamp('', 'bones', 640, 560, 90, 0),
        stamp("The seer's tower", 'wizard', 2350, 450, 230, 250, [
            M(new('Albian nocturne')), A(R('Wind in the shutters', 'ambience'), 0.35),
        ]),
        stamp("The witch's hut", 'hut', 2450, 1450, 190, 240, [
            M(R('The forsaken', 'music'), 0.5), A(R('Owls in the forest', 'ambience'), 0.45),
        ]),
        stamp('', 'swamp', 2700, 1350, 220, 0),
        stamp("The little girl's house", 'house', 1150, 1520, 150, 200, [
            M(new('Underground'), 0.5), A(R('Restless sleep', 'ambience'), 0.45),
        ]),
        stamp('The graveyard', 'grave', 900, 380, 170, 220, [
            M(R('Into the dark', 'music'), 0.5), A(R('Ghostly wind', 'ambience'), 0.4),
        ]),
        stamp('The chapel', 'church', 1150, 560, 200, 0),
        *houses([[1250, 800], [1780, 760], [1260, 1230], [1800, 1240], [1950, 1000], [1050, 1000]]),
        night_sign,
    ]
    night_place = {'id': 'night', 'title': 'Ravenmoor by night', 'width': W, 'height': H, 'ground': 'dirt',
                   'player': [1500, 1180],
                   'general': [M(new('Nunc dimittis'), 0.45), A(R('Village at night', 'ambience'), 0.35), A(Wt('Crickets', 'ambience'), 0.25)],
                   'walls': [], 'elements': night}

    # ---------- 3. The day of judgement: a body at dawn, the debate, the vote at the gallows. ----------
    day_sign = stamp('Night falls again', 'signpost', 2700, 1720, 130, 0, link='night')
    day = [
        path('', [[300, 1000], [900, 1000], [1500, 1000], [2100, 1000], [2700, 1000]], 0, closed=False),
        path('', [[1500, 1000], [1600, 1400], [2200, 1650], [2650, 1720]], 0, closed=False),
        stamp("The victim's house", 'house', 650, 600, 170, 230, [
            M(R('Into the dark', 'music'), 0.5), A(R('Ghostly wind', 'ambience'), 0.35),
            A(R('Ravens on the rooftops', 'ambience'), 0.35),
        ]),
        path('The village square', blob(1500, 1000, 280, 200, 12, 11), 340, [
            M(R('Frantic accusations', 'music')),
            A(R('Restless villagers', 'ambience'), 0.5), A(Wt('Ticking clock', 'ambience'), 0.3),
        ]),
        stamp('', 'well', 1500, 1000, 90, 0),
        stamp('The gallows', 'gallows', 2250, 600, 200, 260, [
            M(R('Weight of revenge', 'music')), M(new('Vengeful')),
            A(R('Drums of judgement', 'ambience'), 0.45), A(R('Ravens over the gallows', 'ambience'), 0.35),
            A(R('Pounding heart', 'ambience'), 0.3),
        ]),
        stamp('The chapel', 'church', 2350, 1400, 220, 240, [
            M(R('Dawn over Ravenmoor', 'music'), 0.5), A(R('Dawn after the last night', 'ambience'), 0.4),
        ]),
        stamp('The market', 'market', 950, 1450, 200, 230, [
            M(new('Mountain idyll')), A(Wt('Village square', 'ambience'), 0.45),
        ]),
        stamp('The Black Raven tavern', 'tavern', 1700, 1650, 210, 220, [
            M(new('Wanderer')), A(Wt('Villagers argue', 'ambience'), 0.45),
        ]),
        *houses([[1200, 700], [1850, 720], [1180, 1250], [1880, 1260], [400, 1000], [2500, 1000]]),
        stamp('', 'fields', 300, 1650, 320, 0), stamp('', 'pine', 200, 300, 140, 0),
        day_sign,
    ]
    day_place = {'id': 'day', 'title': 'The day of judgement', 'width': W, 'height': H, 'ground': 'grass',
                 'player': [700, 820],
                 'general': [M(new('Knolls'), 0.45), A(R('Grey morning', 'ambience'), 0.25), A(Wt('Sunny morning', 'ambience'), 0.3)],
                 'walls': [], 'elements': day}

    # The in portals: every way leads to the other map's road end, by its own sign.
    night_place['ins'] = [{'from': 'dusk', 'el': dusk_sign['id'], 'at': [300, 1000]},
                          {'from': 'day', 'el': day_sign['id'], 'at': [300, 1000]}]
    day_place['ins'] = [{'from': 'night', 'el': night_sign['id'], 'at': [700, 820]}]
    return [dusk_place, night_place, day_place]


def main():
    places = build()
    sb = []
    for tale, name in [('R', 'Death knell'), ('R', 'Howling gale'), ('R', 'The rain begins'), ('R', 'The werewolves awaken'),
                       ('R', "The pack's victory howl"), ('R', 'The village is saved'), ('W', 'The villagers win')]:
        p, n = rec(tale, name, 'soundbox')
        sb.append({'name': n, 'file': p, 'zone': 'soundbox', 'play': 'once', 'autoplay': True, 'volume': 0.6})
    all_cards = [c for pl in places for c in pl['general'] + [c for e in pl['elements'] for c in e['cards']]]
    used = {}
    for c in all_cards:
        used.setdefault(c['file'], (c['name'], c['zone']))
    music, seen = [], set()
    for c in all_cards:
        if c['zone'] == 'music' and c['file'] not in seen:
            seen.add(c['file']); music.append(c)
    chapter = {'title': 'Sounds of Ravenmoor', 'description': 'Every sound of the three maps.', 'music': [], 'ambience': [], 'events': []}
    for p, (name, zone) in sorted(used.items()):
        chapter[zone].append({'name': name, 'file': p, 'loop': 'infinite', 'volume': 0.6, 'duration': durations[p], 'sound': blocks[p]})
    story_box = [{'name': c['name'], 'file': c['file'], 'loop': 'once', 'volume': 0.6, 'duration': durations[c['file']], 'sound': blocks[c['file']]} for c in sb]
    assert all(d >= 10 for d in durations.values()), [p for p, d in durations.items() if d < 10]
    sid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'troubadour-map/the-werewolves-of-ravenmoor'))
    story = {
        'format': 'troubadour', 'version': 2, 'id': sid, 'revision': 1, 'bard': 'Troubadour', 'title': TALE,
        'description': 'A Troubadour Map world for the Werewolf party game, in three maps: Ravenmoor at dusk (the legend, '
                       'the roles are dealt), Ravenmoor by night (the wolves, the seer, the witch, the little girl) and the day '
                       'of judgement (the body, the debate, the gallows). Take the signposts to go from one to the next. '
                       'Only long sounds: music, ambiences and a soundbox of long moments. Sounds of the Recueil tales '
                       'Werewolves of Ravenmoor and Werewolf, and music from Battle for Wesnoth and 0 A.D. (see each sound\'s origin).',
        'created': NOW, 'forged': NOW, 'generator': 'Troubadour Map discovery script', 'chapters': [chapter], 'soundbox': story_box,
    }
    world = {
        'format': 'troubadour-map', 'version': 1, 'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'troubadour-map/world/the-werewolves-of-ravenmoor')),
        'story': sid, 'revision': 1, 'bard': 'Troubadour', 'created': NOW, 'forged': NOW, 'generator': 'Troubadour Map discovery script',
        'wallLoss': 0.7, 'places': places, 'soundbox': sb, 'music': music, 'stamps': [],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_STORED) as z:
        z.writestr('story.json', json.dumps(story, indent=2, ensure_ascii=False) + '\n')
        z.writestr('map.json', json.dumps(world, indent=2, ensure_ascii=False) + '\n')
        for p in sorted(files):
            z.writestr(p, files[p])
    print(OUT.relative_to(REPO), round(OUT.stat().st_size / 1e6, 1), 'MB,', len(files), 'sounds,',
          sum(1 for p in files if blocks[p].get('brought') == BROUGHT), 'new')
    for p in sorted(files):
        print(f'  {durations[p]:6.1f}s  {p}')


if __name__ == '__main__':
    main()
