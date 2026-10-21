#!/usr/bin/env python3
"""Builds the second discovery tale of Troubadour Ballade: Treasure Island, a Ballade of choices.

Takes its story and sounds from the Recueil (docs/recueil/261015_treasure_island.troubadour) and writes
docs/ballade/discovery/261021_treasure-island-choices.troubadour-ballade. Choices nest three deep; every scene
has a music, some have effects, some of them at random. Run from the repo root:

    python3 .github/scripts/build_flow_choices.py
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'docs' / 'recueil' / '261015_treasure_island.troubadour'
OUT = ROOT / 'docs' / 'ballade' / 'discovery' / '261021_treasure-island-choices.troubadour-ballade'
STAMP = '2026-10-21T21:30:00Z'

zin = zipfile.ZipFile(SRC)
src = json.loads(zin.read('story.json'))
CH = src['chapters'][:2]
story = {
    'format': 'troubadour', 'version': 2, 'id': '5e2b8c41-7d93-4f0a-b6c2-91e4a7d3f5b8', 'revision': 1, 'bard': 'Troubadour',
    'title': 'Treasure Island, by your choices',
    'description': 'Two chapters of Treasure Island told as a Ballade of choices: the players decide, the troubadour picks their answer, the wire follows. Sounds from the Recueil tale Treasure Island.',
    'created': STAMP, 'forged': STAMP, 'generator': 'Troubadour Ballade discovery script',
    'chapters': CH, 'soundbox': src.get('soundbox', []),
}


def snd(ci, name):
    c = story['chapters'][ci]
    for zone in ('music', 'ambience', 'events'):
        for s in c.get(zone, []):
            if s['name'] == name:
                return s, zone
    raise KeyError(name)


def music(ci, name, offset=0, volume=0.7):
    s, zone = snd(ci, name)
    return {'name': s['name'], 'file': s['file'], 'zone': zone, 'offset': offset, 'start': 0, 'duration': 600,
            'play': 'loop', 'hold': True, 'repeat': True, 'fadeIn': 3, 'fadeOut': 4, 'volume': volume}


amb = music


def once(ci, name, offset=0, volume=0.8):
    s, zone = snd(ci, name)
    d = round(s.get('duration') or 2, 1)
    return {'name': s['name'], 'file': s['file'], 'zone': zone, 'offset': offset, 'start': 0, 'duration': d,
            'play': 'once', 'hold': False, 'repeat': False, 'fadeIn': 0, 'fadeOut': 0, 'volume': volume}


def rnd(ci, name, lo, hi, offset=0, volume=0.6):
    s, zone = snd(ci, name)
    d = round(s.get('duration') or 2, 1)
    return {'name': s['name'], 'file': s['file'], 'zone': zone, 'offset': offset, 'start': 0, 'duration': d,
            'play': 'random', 'hold': True, 'repeat': True, 'gapMin': lo, 'gapMax': hi, 'fadeIn': 0, 'fadeOut': 0, 'volume': volume}


def step(title, cards, gate=True, nxt=None):
    return {'title': title, 'gate': gate, 'next': nxt, 'cards': cards}


B = 0  # The Admiral Benbow Inn
ch1 = {
    'steps': [
        step('A rainy night at the Benbow', [music(B, 'Rainy night at the Benbow'), amb(B, 'Inn fireplace', volume=0.5), rnd(B, 'Creaking timbers', 6, 16)]),
        step('Someone knocks', [once(B, 'Knock at the door')], gate=False, nxt=4),
        step('Billy Bones collapses', [music(B, "Old sailor's tavern"), amb(B, 'Rain on the shutters', volume=0.5)]),
    ],
    'choice': {'question': "Do they open Billy Bones' sea chest?", 'answers': [
        {'label': 'Open it', 'steps': [
            step('The chest creaks open', [music(B, "Old sailor's tavern"), once(B, 'Sea chest opens'), once(B, 'Coins spill', offset=1.5)]),
            step('Tapping on the road', [rnd(B, 'Knock at the door', 3, 7, volume=0.45)], gate=False, nxt=6),
        ], 'choice': {'question': 'Blind Pew and his men are at the door. Fight or flee?', 'answers': [
            {'label': 'Fight', 'steps': [
                step('Pistols in the dark', [music(B, 'Three sheets to the wind'), rnd(B, 'Pistol shot', 2, 6, volume=0.7), amb(B, 'Wind at the door', volume=0.4)]),
                step('The riders break away', [once(B, 'Horses gallop away')], gate=False, nxt=3),
            ], 'choice': {'question': 'Follow the riders into the storm?', 'answers': [
                {'label': 'Follow them', 'steps': [
                    step('Into the storm', [music(B, 'Rainy night at the Benbow'), amb(B, 'Sea storm outside', volume=0.6), rnd(B, 'Horses gallop away', 8, 20, volume=0.4)]),
                ]},
                {'label': 'Stay at the inn', 'steps': [
                    step('Counting the gold', [music(B, "Old sailor's tavern"), amb(B, 'Inn fireplace', volume=0.5), rnd(B, 'Coins spill', 4, 10, volume=0.5)]),
                ]},
            ]}},
            {'label': 'Flee', 'steps': [
                step('Out by the back door', [music(B, 'Rainy night at the Benbow'), amb(B, 'Rain on the shutters', volume=0.6), once(B, 'Horses gallop away', offset=5)]),
            ]},
            {'label': 'Hide', 'steps': [
                step('Under the bridge', [music(B, 'Rainy night at the Benbow', volume=0.5), amb(B, 'Wind at the door', volume=0.6), rnd(B, 'Pistol shot', 6, 14, volume=0.35)]),
            ]},
        ]}},
        {'label': 'Leave it shut', 'steps': [
            step('A quiet drink', [music(B, 'Three sheets to the wind'), amb(B, 'Inn fireplace', volume=0.5), rnd(B, 'Creaking timbers', 8, 18)]),
        ]},
    ]},
}

H = 1  # Aboard the Hispaniola
ch2 = {
    'steps': [
        step('Setting sail', [music(H, 'Fearless sailors'), amb(H, 'Ship under sail', volume=0.5), rnd(H, 'Seagulls', 10, 25, volume=0.4)]),
        step("Ship's bell", [once(H, "Ship's bell")], gate=False, nxt=6),
        step('Open sea', [music(H, 'Tailwind'), amb(H, 'Open sea', volume=0.5), rnd(H, 'Parrot squawks', 8, 20, volume=0.5)]),
    ],
    'choice': {'question': 'Jim hears Silver plotting from the apple barrel. Tell the captain?', 'answers': [
        {'label': 'Tell him', 'steps': [
            step("The captain's cabin", [music(H, "Ireland's coast"), amb(H, 'Creaking hull', volume=0.5), rnd(H, 'Barrel rolls', 6, 15, volume=0.5)]),
        ]},
        {'label': 'Keep quiet', 'steps': [
            step('Land ho!', [music(H, 'Tailwind'), amb(H, 'Wind in the sails', volume=0.5), once(H, 'Anchor chain', offset=4)]),
        ]},
    ]},
}

flow = {'format': 'troubadour-ballade', 'version': 1, 'id': '9a4d2f6e-3b81-4c57-a0e9-7f2c5b8d1e63', 'story': story['id'], 'revision': 1,
        'bard': 'Troubadour', 'created': STAMP, 'forged': STAMP, 'generator': 'Troubadour Ballade discovery script', 'chapters': [ch1, ch2]}


def cards(holder):
    for s in holder.get('steps', []):
        yield from s['cards']
    c = holder.get('choice')
    if c:
        for a in c['answers']:
            yield from cards(a)


used = {s['file'] for c in story['chapters'] for z in ('music', 'ambience', 'events') for s in c.get(z, [])}
used |= {s['file'] for s in story['soundbox']}
used |= {k['file'] for ch in flow['chapters'] for k in cards(ch)}
OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_STORED) as z:
    z.writestr('story.json', json.dumps(story, indent=2) + '\n')
    z.writestr('flow.json', json.dumps(flow, indent=2) + '\n')
    for f in sorted(used):
        z.writestr(f, zin.read(f))
print(OUT, OUT.stat().st_size // 1024, 'KB', len(used), 'sounds')
