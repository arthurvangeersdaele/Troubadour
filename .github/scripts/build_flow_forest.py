#!/usr/bin/env python3
"""Builds the discovery tale of Troubadour Ballade: The Forest Adventure, timed step by step.

Reads the web edition's sounds (docs/discovery/sounds/forest and the soundbox) and writes
docs/discovery/ballades/261121_the-forest-adventure.troubadour-ballade (a .troubadour plus flow.json,
see TROUBADOUR_BALLADE_FORMAT.md). Run from the repo root:

    python3 .github/scripts/build_flow_forest.py
"""
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAY = ROOT / 'docs' / 'discovery'
OUT = PLAY / 'ballades' / '261121_the-forest-adventure.troubadour-ballade'
STAMP = '2026-11-21T15:00:00Z'

index = json.loads((PLAY / 'index.json').read_text())
library, stories = index['library'], index['stories']
meta = next(s for s in stories if s['id'] == 'forest')


def length(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return round(float(out.strip()), 1)


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


# ---------- story.json, as the Story builder would write it ----------
files = {}      # archive path -> source file
by_name = {}    # (chapter index or 'sb', sound name) -> sound
chapters = []
for ci, ch in enumerate(meta['chapters']):
    src = library['chapters'][f"forest/{ch['id']}"]
    out = {'title': ch['title']}
    for zone in ('music', 'ambience', 'events'):
        out[zone] = []
        for k, s in enumerate(src.get(zone, [])):
            path = f"sounds/{ci + 1}/{zone}/{k + 1:02d}-{slug(s['name'])}.mp3"
            files[path] = PLAY / s['file']
            sound = {'name': s['name'], 'file': path, 'loop': 'once' if zone == 'events' else 'infinite',
                     'volume': 0.75, 'duration': length(PLAY / s['file'])}
            out[zone].append(sound)
            by_name[(ci, s['name'])] = dict(sound, zone=zone)
    chapters.append(out)

SOUNDBOX = ['Critical hit', 'Level up', 'Gold coins', 'Drink a potion', 'Creaking door', 'Fanfare']
soundbox = []
for k, name in enumerate(SOUNDBOX):
    s = next(x for x in library['soundbox'] if x['name'] == name)
    path = f"sounds/soundbox/{k + 1:02d}-{slug(name)}.mp3"
    files[path] = PLAY / s['file']
    sound = {'name': name, 'file': path, 'loop': 'once', 'volume': 0.75, 'duration': length(PLAY / s['file'])}
    soundbox.append(sound)
    by_name[('sb', name)] = dict(sound, zone='soundbox')

story = {
    'format': 'troubadour', 'version': 2, 'id': '5e8b1f42-7c3a-4d19-b6e0-2f9a4c7d3b18', 'revision': 1, 'bard': 'Troubadour',
    'title': meta['title'],
    'description': f"{meta['blurb']} Sounds from Battle for Wesnoth, 0 A.D., Flare and Stendhal, credited file by file in the Troubadour repository (docs/discovery/CREDITS.md).",
    'created': STAMP, 'forged': STAMP, 'generator': 'Troubadour Ballade discovery script', 'chapters': chapters, 'soundbox': soundbox,
}


# ---------- flow.json: the timing ----------
def card(ch, name, offset=0, duration=None, repeat=False, fade_in=0, fade_out=0, volume=0.75, start=0):
    s = by_name[(ch, name)]
    return {'name': name, 'file': s['file'], 'zone': s['zone'], 'offset': offset, 'start': start,
            'duration': duration if duration is not None else round(s['duration'] - start, 1),
            'repeat': repeat, 'fadeIn': fade_in, 'fadeOut': fade_out, 'volume': volume,
            # A looping ambiance holds the scene: it lasts as long as the sounds beside it, then loops until the next Go.
            **({'play': 'loop', 'hold': True} if repeat else {'play': 'once'})}


def step(title, cards, gate=True, next_=None):
    return {'title': title, 'gate': gate, 'next': next_, 'cards': cards}


AMB = 20  # a looping ambiance is drawn at least this long, or as long as the sounds beside it

flow_chapters = [
    {'steps': [  # 1. In the forest
        step('Into the old forest', [
            card(0, 'Highland mist', fade_in=6, fade_out=8, volume=0.55),
            card(0, 'Forest at day', duration=AMB, repeat=True, fade_in=4, fade_out=6, volume=0.6),
            card(0, 'Birdsong', offset=5, duration=AMB, repeat=True, fade_in=6, fade_out=6, volume=0.4),
        ], next_=18),
        step('Along the creek', [
            card(0, 'The creek', duration=AMB, repeat=True, fade_in=5, fade_out=6, volume=0.45),
            card(0, 'Woodpecker', offset=6, volume=0.5),
        ], gate=False, next_=16),
        step('A blackbird', [card(0, 'Blackbird sings', volume=0.55), card(0, 'Blackbird sings', offset=7, volume=0.35)]),
        step('Something moves', [
            card(0, 'A branch snaps', volume=0.75),
            card(0, 'Rustling leaves', offset=0.6, volume=0.6),
            card(0, 'Raven calls', offset=2.5, volume=0.5),
        ]),
        step('Dusk', [
            card(0, 'Silvan sanctuary', fade_in=6, fade_out=8, volume=0.5),
            card(0, 'Wind in the leaves', offset=2, duration=AMB, repeat=True, fade_in=6, fade_out=6, volume=0.35),
            card(0, 'Owl hoots', offset=8, volume=0.45),
        ]),
    ]},
    {'steps': [  # 2. Fight with a bear
        step('The woods fall silent', [
            card(1, 'Calm before the storm', fade_in=5, fade_out=6, volume=0.55),
            card(1, 'Restless wind', duration=AMB, repeat=True, fade_in=5, fade_out=6, volume=0.4),
            card(1, 'Heartbeat', offset=8, duration=AMB, repeat=True, fade_in=6, fade_out=4, volume=0.35),
        ], next_=16),
        step('Wings in the trees', [card(1, 'Wings in the trees', volume=0.6), card(1, 'Bear growl', offset=2.5, volume=0.6)], gate=False),
        step('The bear charges', [
            card(1, 'Bear roar', volume=0.95),
            card(1, 'Battle theme', offset=1, fade_in=1, fade_out=6, volume=0.65),
        ]),
        step('Claws and steel', [
            card(1, 'Claw swipe', volume=0.85),
            card(1, 'Sword strike', offset=1.1, volume=0.8),
            card(1, 'Bear growl', offset=2.2, volume=0.7),
            card(1, 'Sword strike', offset=3.4, volume=0.85),
        ], gate=False),
        step('The bear falls', [
            card(1, 'The bear falls', volume=0.9),
            card('sb', 'Fanfare', offset=3.5, volume=0.6),
        ]),
    ]},
    {'steps': [  # 3. A night at the pub
        step('Warmth at last', [
            card(2, 'Door opens', volume=0.7),
            card(2, 'Busy tavern', offset=0.5, duration=AMB, repeat=True, fade_in=3, fade_out=6, volume=0.5),
            card(2, 'Fireplace', offset=1, duration=AMB, repeat=True, fade_in=4, fade_out=6, volume=0.45),
            card(2, 'Tavern in the mist', offset=2, fade_in=5, fade_out=8, volume=0.5),
        ], next_=20),
        step('A round for the table', [
            card(2, 'Coins on the table', volume=0.75),
            card(2, 'Bottle', offset=1.5, volume=0.6),
            card(2, 'Hearty laugh', offset=3, volume=0.6),
        ]),
        step('A brawl', [
            card(2, 'Bar fight punch', volume=0.85),
            card(2, 'Bar fight punch', offset=0.8, volume=0.7),
            card(2, 'Hearty laugh', offset=2, volume=0.5),
        ], gate=False),
        step('The minstrels play', [card(2, 'Traveling minstrels', fade_in=4, fade_out=8, volume=0.55)]),
    ]},
    {'steps': [  # 4. The human village
        step('Market morning', [
            card(3, 'Village market', duration=AMB, repeat=True, fade_in=4, fade_out=6, volume=0.5),
            card(3, 'Town theme', offset=1, fade_in=6, fade_out=8, volume=0.5),
            card(3, 'Farmyard', offset=6, duration=AMB, repeat=True, fade_in=6, fade_out=6, volume=0.3),
        ], next_=18),
        step('The blacksmith', [card(3, 'Blacksmith at work', duration=AMB, repeat=True, fade_in=4, fade_out=6, volume=0.35)], gate=False, next_=12),
        step('Life in the streets', [
            card(3, 'Chickens', volume=0.5),
            card(3, 'Horse whinnies', offset=2.5, volume=0.55),
            card(3, 'Dog barks', offset=5, volume=0.5),
        ]),
        step('The church bell', [
            card(3, 'Church bell', volume=0.7),
            card(3, 'Harvest festival', offset=4, fade_in=5, fade_out=8, volume=0.55),
        ]),
    ]},
]

flow = {
    'format': 'troubadour-ballade', 'version': 1, 'id': '8d2c7a19-4e6b-4f3a-9c51-0b7e2d6f4a83', 'story': story['id'],
    'revision': 1, 'bard': 'Troubadour', 'created': STAMP, 'forged': STAMP, 'generator': 'Troubadour Ballade discovery script',
    'chapters': flow_chapters,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_STORED) as z:
    z.writestr('story.json', json.dumps(story, indent=2, ensure_ascii=False) + '\n')
    z.writestr('flow.json', json.dumps(flow, indent=2, ensure_ascii=False) + '\n')
    for path in sorted(files):
        z.write(files[path], path)
print(f'{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1048576:.1f} MB, {sum(len(c["steps"]) for c in flow_chapters)} steps')
