"""Builds 'The Wolves of Hollowmere', a Troubadour Map world for the Werewolf party game.

Sounds: the Recueil (byte for byte, with their sound blocks), and four ambiances mixed here from short open-licence
one-shots (Stendhal, /tg/station 13, Cataclysm: DDA CC-Sounds) over Recueil beds, plus a 5 minute debate timer.
Writes /home/claude/forge/ww/261108_the_wolves_of_hollowmere.troubadour-map
"""
import hashlib, json, os, random, subprocess, sys, uuid, zipfile, zlib
sys.path.insert(0, '/home/claude/forge')
import credits

ROOT = '/home/claude/troubadour/docs/recueil'
OUT = '/home/claude/forge/ww'
WORK = os.path.join(OUT, 'work')
os.makedirs(WORK, exist_ok=True)
TALE = 'The Wolves of Hollowmere'
TODAY = '2026-11-08'
BROUGHT = {'troubadour': 'Troubadour', 'tale': TALE, 'date': TODAY}
SOUNDS = {x['id'][:12]: x for x in json.load(open(os.path.join(ROOT, 'sounds.json')))['sounds']}
CACHE = '/home/claude/cache'
REPO_DIR = {'S': 'arianne_stendhal', 'TG': 'tgstation_tgstation', 'CD': 'Fris0uman_CDDA-Soundpacks'}

files = {}      # path in the archive -> bytes
blocks = {}     # path -> sound block
durations = {}


def slug(s):
    return ''.join(c if c.isalnum() else '-' for c in s.lower()).strip('-').replace('--', '-')


def recueil_bytes(x):
    with open(os.path.join(ROOT, x['file']), 'rb') as f:
        f.seek(x['offset'])
        data = f.read(x['length'])
    if x.get('deflated'):
        data = zlib.decompress(data, -15)
    assert len(data) == x['size'], x['name']
    return data


def from_recueil(key, folder):
    """A sound of the Recueil, kept byte for byte with its block. Returns its path in the archive."""
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


def credit_of(ref):
    c = credits.credit(ref)
    o = {'title': c['file'], 'url': c['url'], 'project': c['project'], 'author': c['author'], 'licence': c['license']}
    if c.get('origin'): o['original'] = c['origin']
    return o


def recueil_origin(key):
    return SOUNDS[key]['origin']


def ff(args):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y'] + args, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr[-800:])


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout)


def compose(name, bed_key, bed_gain_db, hits, length, folder='ambience', lufs=-24):
    """A mixed ambiance: a Recueil bed looped to `length` s, and one-shots laid at their times.
    hits: [(ref, time_s, gain_db)]. Loudness brought to `lufs`, true peak under -2 dB."""
    out = os.path.join(WORK, slug(name) + '.mp3')
    bed = os.path.join(WORK, bed_key + '.mp3')
    open(bed, 'wb').write(recueil_bytes(SOUNDS[bed_key]))
    inputs = ['-stream_loop', '-1', '-i', bed]
    parts = [f'[0:a]atrim=0:{length},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo,volume={bed_gain_db}dB[b]']
    labels = ['[b]']
    for i, (ref, t, g) in enumerate(hits, start=1):
        a, rel = ref.split(':', 1)
        src = ref if ':' not in ref else os.path.join(CACHE, REPO_DIR[a], rel)
        inputs += ['-i', src]
        ms = int(t * 1000)
        parts.append(f'[{i}:a]aresample=44100,aformat=channel_layouts=stereo,volume={g}dB,adelay={ms}|{ms}[h{i}]')
        labels.append(f'[h{i}]')
    parts.append(f'{"".join(labels)}amix=inputs={len(labels)}:normalize=0:dropout_transition=0,atrim=0:{length},'
                 f'afade=t=in:d=1.5,afade=t=out:st={length - 1.5}:d=1.5,loudnorm=I={lufs}:TP=-2:LRA=11[o]')
    ff(inputs + ['-filter_complex', ';'.join(parts), '-map', '[o]', '-ar', '44100', '-ac', '2', '-b:a', '128k', out])
    data = open(out, 'rb').read()
    path = f'sounds/{folder}/{slug(name)}.mp3'
    files[path] = data
    origin = recueil_origin(bed_key) + [credit_of(r) for r in dict.fromkeys(h[0] for h in hits)]
    blocks[path] = {'id': hashlib.sha256(data).hexdigest()[:16], 'origin': origin, 'edited': True, 'brought': BROUGHT}
    durations[path] = round(duration(out), 1)
    return path, name


rnd = random.Random(1108)


def timeline(length, groups):
    """groups: [(refs, count_range, spacing_s, gain_db, rest_range)]: bursts of hits (a few strokes), then rests."""
    hits = []
    for refs, (n0, n1), spacing, gain, (r0, r1), start in groups:
        t = start
        while t < length - 4:
            for k in range(rnd.randint(n0, n1)):
                if t > length - 3: break
                hits.append((rnd.choice(refs), round(t, 2), gain + rnd.uniform(-2.5, 1)))
                t += spacing * rnd.uniform(0.85, 1.2)
            t += rnd.uniform(r0, r1)
    return hits


S = lambda p: 'S:data/sounds/lossless_sources/' + p
CHOPS = ['TG:sound/effects/treechop/treechop1.ogg', 'TG:sound/effects/treechop/treechop2.ogg', 'TG:sound/effects/treechop/treechop3.ogg', 'CD:sound/CC-Sounds/tool/axe_1.ogg']


def build_sounds():
    snd = {}
    # ---- Mixed ambiances (people and tools at work) ----
    snd['woodcutter'] = compose('Woodcutter at work', 'f479cf77d553', -8, timeline(60, [
        (CHOPS, (3, 6), 1.25, -7, (4, 8), 1.0),
        ([S('bird-blackbird-01.flac'), S('bird-blackbird-02.flac'), S('bird-woodpecker-01.flac')], (1, 1), 1, -16, (11, 18), 6.0),
    ]), 60)
    snd['workshop'] = compose("Carpenter's workshop", '1760b00db7b5', -10, timeline(60, [
        (['TG:sound/items/hammering_wood.ogg'], (1, 2), 4.6, -8, (6, 11), 0.8),
        (['CD:sound/CC-Sounds/tool/hacksaw_1.ogg'], (3, 6), 1.3, -11, (9, 15), 5.5),
    ]), 60)
    snd['farm'] = compose('Farmyard', '4a34570843c3', -12, timeline(60, [
        ([S('chicken-01.flac'), S('chicken-02.flac'), S('chicken-03.flac')], (1, 3), 1.8, -12, (3, 7), 0.5),
        ([S('cow-2.flac')], (1, 1), 1, -14, (13, 20), 4.0),
        ([S('sheep-01.flac'), S('sheep-02.flac'), S('goat-1.flac'), S('goat-2.flac')], (1, 2), 1.6, -15, (8, 14), 7.0),
        ([S('horse-snort-01.flac'), 'S:data/sounds/horse-whinny-01.ogg'], (1, 1), 1, -15, (14, 22), 11.0),
    ]), 60)
    snd['well'] = compose('The village well', '2592e0e34885', -12, timeline(60, [
        ([S('water-slosh-01.flac'), S('water-slosh-02.flac'), S('water-slosh-03.flac')], (2, 4), 1.6, -9, (7, 13), 2.0),
        ([S('bird-blackbird-01.flac'), S('bird-blackbird-02.flac')], (1, 1), 1, -17, (12, 20), 9.0),
    ]), 60)

    # ---- The debate timer: 5 minutes of quiet ticking, a soft bell each minute, the great bell at the end ----
    tick = os.path.join(WORK, 'tick.mp3'); open(tick, 'wb').write(recueil_bytes(SOUNDS['b14abc528843']))
    soft = os.path.join(WORK, 'soft.mp3'); open(soft, 'wb').write(recueil_bytes(SOUNDS['a4cffdec6f4a']))
    great = os.path.join(WORK, 'great.mp3'); open(great, 'wb').write(recueil_bytes(SOUNDS['7eec42254802']))
    out = os.path.join(WORK, 'timer.mp3')
    parts = ['[0:a]atrim=0:300,asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo,volume=-6dB[t]']
    inputs = ['-stream_loop', '-1', '-i', tick]
    labels = ['[t]']
    for k, m in enumerate([60, 120, 180, 240], start=1):
        inputs += ['-i', soft]
        parts.append(f'[{k}:a]atrim=0:3.5,afade=t=out:st=2:d=1.5,aresample=44100,aformat=channel_layouts=stereo,volume=-10dB,adelay={m * 1000}|{m * 1000}[m{k}]')
        labels.append(f'[m{k}]')
    inputs += ['-i', great]
    parts.append(f'[5:a]aresample=44100,aformat=channel_layouts=stereo,volume=2dB,adelay=300000|300000[g]')
    labels.append('[g]')
    parts.append(f'{"".join(labels)}amix=inputs={len(labels)}:normalize=0:dropout_transition=0,afade=t=in:d=1,alimiter=limit=0.89[o]')
    ff(inputs + ['-filter_complex', ';'.join(parts), '-map', '[o]', '-ar', '44100', '-ac', '2', '-b:a', '96k', out])
    data = open(out, 'rb').read()
    path = 'sounds/soundbox/debate-timer-5-minutes.mp3'
    files[path] = data
    blocks[path] = {'id': hashlib.sha256(data).hexdigest()[:16], 'origin': recueil_origin('b14abc528843') + recueil_origin('a4cffdec6f4a') + recueil_origin('7eec42254802'), 'edited': True, 'brought': BROUGHT}
    durations[path] = round(duration(out), 1)
    snd['timer'] = (path, 'Debate timer, 5 minutes')
    return snd


# ---------------- The places drawn for the world (world.stamps) ----------------
def rect(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


def tri(a, b, c):
    return [a, b, c, a]


def st(w, pts):
    return {'w': w, 'p': [[round(x, 3), round(y, 3)] for x, y in pts]}


def cottage(sid, name, roof, wall='ground'):
    return {'id': sid, 'name': name, 'v': 1, 'paint': [], 'strokes': [
        st(0.022, rect(0.22, 0.48, 0.78, 0.88)), st(0.022, tri((0.13, 0.5), (0.5, 0.15), (0.87, 0.5))),
        st(0.018, rect(0.44, 0.66, 0.56, 0.88)), st(0.014, rect(0.28, 0.57, 0.38, 0.67)), st(0.014, rect(0.62, 0.57, 0.72, 0.67)),
        st(0.018, rect(0.64, 0.2, 0.72, 0.36))],
        'fills': [{'x': 0.3, 'y': 0.8, 'c': wall}, {'x': 0.5, 'y': 0.38, 'c': roof}, {'x': 0.5, 'y': 0.8, 'c': 'hole'},
                  {'x': 0.33, 'y': 0.62, 'c': 'music'}, {'x': 0.67, 'y': 0.62, 'c': 'music'}, {'x': 0.68, 'y': 0.28, 'c': 'stone'}]}


STAMPS = [
    cottage('p-ww-seer', "Seer's house", '#6e4fa3'),
    cottage('p-ww-witch', "Witch's cottage", 'leaf'),
    cottage('p-ww-hunter', "Hunter's lodge", '#7a4a26'),
    cottage('p-ww-cupid', "Cupid's cottage", '#c86f86'),
    cottage('p-ww-girl', "Little Girl's home", '#d8a43a'),
    cottage('p-ww-elder', "Elder's house", 'stone'),
    cottage('p-ww-home', 'Cottage', 'events'),
    {'id': 'p-ww-church', 'name': 'Church', 'v': 1, 'paint': [], 'strokes': [
        st(0.022, rect(0.14, 0.52, 0.64, 0.9)), st(0.022, tri((0.1, 0.54), (0.39, 0.3), (0.68, 0.54))),
        st(0.022, rect(0.64, 0.3, 0.86, 0.9)), st(0.022, tri((0.6, 0.32), (0.75, 0.1), (0.9, 0.32))),
        st(0.016, [[0.75, 0.01], [0.75, 0.1]]), st(0.016, [[0.71, 0.045], [0.79, 0.045]]),
        st(0.018, rect(0.34, 0.7, 0.44, 0.9)), st(0.014, rect(0.71, 0.42, 0.79, 0.54))],
        'fills': [{'x': 0.25, 'y': 0.8, 'c': 'stone'}, {'x': 0.39, 'y': 0.45, 'c': '#4a3a2c'}, {'x': 0.7, 'y': 0.7, 'c': 'stone'},
                  {'x': 0.75, 'y': 0.25, 'c': '#4a3a2c'}, {'x': 0.39, 'y': 0.85, 'c': 'hole'}, {'x': 0.75, 'y': 0.48, 'c': 'music'}]},
    {'id': 'p-ww-tavern', 'name': 'Tavern', 'v': 1, 'paint': [], 'strokes': [
        st(0.022, rect(0.1, 0.5, 0.9, 0.88)), st(0.022, [[0.06, 0.52], [0.24, 0.24], [0.76, 0.24], [0.94, 0.52], [0.06, 0.52]]),
        st(0.018, rect(0.45, 0.66, 0.57, 0.88)), st(0.014, rect(0.17, 0.58, 0.29, 0.68)), st(0.014, rect(0.71, 0.58, 0.83, 0.68)),
        st(0.012, [[0.33, 0.56], [0.33, 0.62]]), st(0.014, rect(0.27, 0.62, 0.39, 0.7))],
        'fills': [{'x': 0.2, 'y': 0.8, 'c': 'ground'}, {'x': 0.5, 'y': 0.4, 'c': '#8c3b2e'}, {'x': 0.51, 'y': 0.8, 'c': 'hole'},
                  {'x': 0.23, 'y': 0.63, 'c': 'music'}, {'x': 0.77, 'y': 0.63, 'c': 'music'}, {'x': 0.33, 'y': 0.66, 'c': 'music'}]},
    {'id': 'p-ww-workshop', 'name': 'Workshop', 'v': 1, 'paint': [], 'strokes': [
        st(0.022, rect(0.16, 0.46, 0.84, 0.88)), st(0.022, [[0.1, 0.48], [0.5, 0.26], [0.9, 0.48], [0.1, 0.48]]),
        st(0.018, rect(0.3, 0.6, 0.56, 0.88)), st(0.016, [[0.43, 0.6], [0.43, 0.88]]),
        st(0.018, rect(0.66, 0.62, 0.78, 0.74)), st(0.018, rect(0.7, 0.18, 0.78, 0.38))],
        'fills': [{'x': 0.22, 'y': 0.8, 'c': 'ground'}, {'x': 0.5, 'y': 0.4, 'c': 'stone'}, {'x': 0.36, 'y': 0.8, 'c': '#5b3d22'},
                  {'x': 0.5, 'y': 0.8, 'c': '#5b3d22'}, {'x': 0.72, 'y': 0.68, 'c': 'fire'}, {'x': 0.74, 'y': 0.28, 'c': 'stone'}]},
    {'id': 'p-ww-barn', 'name': 'Barn', 'v': 1, 'paint': [], 'strokes': [
        st(0.022, [[0.14, 0.88], [0.14, 0.46], [0.5, 0.18], [0.86, 0.46], [0.86, 0.88], [0.14, 0.88]]),
        st(0.018, rect(0.36, 0.56, 0.64, 0.88)), st(0.014, [[0.36, 0.56], [0.64, 0.88]]), st(0.014, [[0.64, 0.56], [0.36, 0.88]]),
        st(0.014, rect(0.44, 0.34, 0.56, 0.44))],
        'fills': [{'x': 0.22, 'y': 0.7, 'c': '#8c3b2e'}, {'x': 0.42, 'y': 0.72, 'c': '#e8dcc0'}, {'x': 0.58, 'y': 0.72, 'c': '#e8dcc0'},
                  {'x': 0.5, 'y': 0.62, 'c': '#e8dcc0'}, {'x': 0.5, 'y': 0.82, 'c': '#e8dcc0'}, {'x': 0.5, 'y': 0.39, 'c': 'hole'}]},
    {'id': 'p-ww-gallows', 'name': 'Gallows', 'v': 1, 'paint': [], 'fills': [], 'strokes': [
        st(0.026, [[0.3, 0.9], [0.3, 0.14]]), st(0.026, [[0.24, 0.17], [0.74, 0.17]]), st(0.02, [[0.3, 0.32], [0.45, 0.17]]),
        st(0.012, [[0.66, 0.17], [0.66, 0.42]]), st(0.012, [[0.66, 0.42], [0.62, 0.46], [0.63, 0.52], [0.69, 0.52], [0.7, 0.46], [0.66, 0.42]]),
        st(0.026, [[0.14, 0.9], [0.56, 0.9]])]},
]

# ---------------- Map layout (the same village on the three maps) ----------------
W, H = 2600, 1625
K = 1.3  # the village was laid out on 2000 x 1250: spread over a larger map, names keep their room
_id = [0]


def nid():
    _id[0] += 1
    return f'e{_id[0]}'


def card(sound, zone, play, vol, rmax=None, blend=None):
    path, name = sound
    c = {'name': name, 'file': path, 'zone': zone, 'play': play, 'autoplay': True, 'volume': vol}
    if rmax: c['randomMax'] = rmax
    if blend: c['blend'] = blend
    return c


def stamp(title, sid, x, y, size, radius, cards, link=None):
    return {'id': nid(), 'title': title, 'radius': round(radius * K), 'cards': cards, 'link': link, 'shape': {'type': 'stamp', 'stamp': sid, 'x': round(x * K), 'y': round(y * K), 'size': round(size * 1.15), 'rotation': 0}}


def area(title, pts, radius, cards, closed=True):
    return {'id': nid(), 'title': title, 'radius': round(radius * K), 'cards': cards, 'link': None, 'shape': {'type': 'path', 'closed': closed, 'points': [[round(x * K), round(y * K)] for x, y in pts]}}


def blob(cx, cy, rx, ry, n=10, seed=0):
    r = random.Random(seed)
    return [[round(cx + rx * (0.88 + r.random() * 0.24) * __import__('math').cos(2 * 3.14159 * k / n)), round(cy + ry * (0.88 + r.random() * 0.24) * __import__('math').sin(2 * 3.14159 * k / n))] for k in range(n)]


STREAM = [[0, 1010], [260, 960], [520, 1030], [760, 1110], [1020, 1170], [1300, 1150], [1560, 1190], [1800, 1160], [2000, 1200]]

POS = {
    'square': (1000, 600), 'church': (1000, 300), 'tavern': (1290, 520), 'seer': (720, 400), 'witch': (520, 760),
    'cupid': (1240, 800), 'girl': (790, 840), 'hunter': (1480, 760), 'elder': (1300, 300), 'home1': (640, 600), 'home2': (1010, 860),
    'wood': (1720, 300), 'woodcutter': (1540, 520), 'workshop': (380, 520), 'farm': (300, 860), 'well': (430, 250),
    'gallows': (1730, 980), 'cemetery': (760, 210), 'sign': (1000, 1080),
}


def village(m, R, night=False):
    """The drawings shared by the three maps; `m` holds the cards of each place for this map."""
    g = lambda k: m.get(k, [])
    P = POS
    els = [
        area('Village square', blob(*P['square'], 165, 120, 12, 3), 150, g('square')),
        stamp('Church', 'p-ww-church', *P['church'], 210, 170, g('church')),
        stamp('Tavern', 'p-ww-tavern', *P['tavern'], 190, 150, g('tavern')),
        stamp("Seer's house", 'p-ww-seer', *P['seer'], 150, 120, g('seer')),
        stamp("Witch's cottage", 'p-ww-witch', *P['witch'], 150, 120, g('witch')),
        stamp("Cupid's cottage", 'p-ww-cupid', *P['cupid'], 150, 120, g('cupid')),
        stamp("Little Girl's home", 'p-ww-girl', *P['girl'], 140, 120, g('girl')),
        stamp("Hunter's lodge", 'p-ww-hunter', *P['hunter'], 150, 120, g('hunter')),
        stamp("Elder's house", 'p-ww-elder', *P['elder'], 150, 120, g('elder')),
        stamp("Villagers' cottage", 'p-ww-home', *P['home1'], 140, 110, g('home1')),
        stamp('', 'p-ww-home', *P['home2'], 140, 110, g('home2')),
        stamp("The Wolves' wood", 'forest', *P['wood'], 430, 260, g('wood')),
        stamp('', 'tree', 1880, 560, 150, 0, []),
        stamp("Woodcutter's clearing", 'tree', *P['woodcutter'], 130, 170, g('woodcutter')),
        stamp("Carpenter's workshop", 'p-ww-workshop', *P['workshop'], 170, 150, g('workshop')),
        stamp('Farm', 'p-ww-barn', *P['farm'], 190, 180, g('farm')),
        stamp('The old well', 'well', *P['well'], 110, 150, g('well')),
        stamp('Gallows hill', 'p-ww-gallows', *P['gallows'], 170, 170, g('gallows')),
        stamp('Cemetery', 'grave', *P['cemetery'], 90, 130, g('cemetery')),
        stamp('', 'grave', 700, 170, 70, 0, []), stamp('', 'grave', 820, 170, 70, 0, []),
        area('The stream', STREAM, 110, g('stream'), closed=False),
        stamp('', 'hill', 220, 160, 220, 0, []),
        stamp('', 'rocks', 1880, 1080, 120, 0, []),
    ]
    if 'murder' in m:
        els.append(area('Where the body lies', blob(470, 290, 130, 110, 9, 7), 140, g('murder')))
    if 'sign' in m:
        title, sid, link = m['sign']
        els.append(stamp(title, sid, *P['sign'], 110, 0, [], link))
    # Walls: the stone walls of the churchyard, so the bells are muffled on the far side.
    walls = [{'id': nid(), 'points': [[round(640 * K), round(120 * K)], [round(1120 * K), round(120 * K)]]}]
    return els, walls


def build_world(snd, rec):
    A = lambda k, v, blend=4: card(rec(k, 'ambience'), 'ambience', 'loop', v, blend=blend)
    Ev = lambda k, v, rmax=25: card(rec(k, 'events'), 'events', 'random', v, rmax)
    Mu = lambda k: card(rec(k, 'music'), 'music', 'loop', 0.55)
    MIX = lambda s, v: card(snd[s], 'ambience', 'loop', v, blend=3)

    musics = {
        'rules': Mu('1dc7259fe694'),     # The cards are dealt
        'night': Mu('e4ff716626ee'),     # Night town
        'dawn': Mu('87117eba17ea'),      # Dawn over Ravenmoor
        'murder': Mu('c947e638a6eb'),    # Casualties of the night
        'debate': Mu('0f4c569c5d98'),    # Unrest in Ravenmoor
    }
    more = [Mu(k) for k in ['013007e61795', 'a0c0fa705d78', 'a665a4c8c3ed', '9a3c24d142ce', 'fa32976c2708', '13846b8d82ff', '1b4e432cc75f', 'c04b9ce3ef6d']]
    # Teeth in the dark, Northern dread, The wolves gather, Legends of the wolf, Frantic accusations, Siege of doubt, Quiet village, Mourning

    ids = {'begin': 'place-dusk', 'night': 'place-night', 'day': 'place-day'}

    # 1. Dusk: the village gathers, the rules are told; each house plays the motif of its role.
    dusk = {
        'square': [A('b32f74e27006', 0.55), A('8c17feea31c3', 0.4)],
        'church': [A('b5f92f406c9f', 0.4)],
        'tavern': [A('e8ff164edd11', 0.45), A('3b7a8845c4ac', 0.4)],
        'seer': [A('1760b00db7b5', 0.3), Ev('7ce85179857a', 0.45, 20)],
        'witch': [A('1760b00db7b5', 0.3), Ev('dc4c657d34e7', 0.45, 20)],
        'cupid': [A('1760b00db7b5', 0.3), Ev('ecd7d907e76b', 0.45, 20)],
        'girl': [A('1760b00db7b5', 0.3), Ev('3bf37c4bcbdc', 0.45, 20)],
        'hunter': [A('1760b00db7b5', 0.3), Ev('eb497bfb017a', 0.4, 25)],
        'elder': [A('fc5e0cf259c9', 0.3), Ev('588ba823b56c', 0.45, 20)],
        'home1': [A('1760b00db7b5', 0.3)], 'home2': [A('1760b00db7b5', 0.3)],
        'wood': [A('fc72d9a95a59', 0.5), A('d8b4a1e55d1d', 0.3), Ev('3364283440af', 0.45, 20)],
        'woodcutter': [MIX('woodcutter', 0.5)], 'workshop': [MIX('workshop', 0.5)], 'farm': [MIX('farm', 0.5)],
        'well': [MIX('well', 0.45)], 'stream': [A('2592e0e34885', 0.45)],
        'gallows': [A('c0a12dc2d9a0', 0.4)], 'cemetery': [A('58c3148dfcfd', 0.35)],
        'sign': ('Nightfall: the first night', 'altar', ids['night']),
    }
    # 2. Night: walk the party to the house of the role you call; only there is it heard.
    night = {
        'square': [A('0734f0d4c8ec', 0.35)],
        'church': [A('d321d0d84c3f', 0.35), Ev('a4cffdec6f4a', 0.3, 30)],
        'tavern': [A('08f022fabba4', 0.35)],
        'seer': [A('83029382b3bc', 0.35), Ev('7ce85179857a', 0.5, 18)],
        'witch': [A('1760b00db7b5', 0.35), Ev('8559b905434d', 0.5, 18)],
        'cupid': [A('0ee5666b636a', 0.3), Ev('103ce0f7079f', 0.5, 18), Ev('725a4d3bbd63', 0.4, 25)],
        'girl': [A('9ce4f996d3dd', 0.35), Ev('c36ecbef4952', 0.5, 18)],
        'hunter': [A('9773ed9f2d26', 0.3)],
        'elder': [A('fc5e0cf259c9', 0.3)],
        'home1': [A('9ce4f996d3dd', 0.3)], 'home2': [A('9ce4f996d3dd', 0.3)],
        'wood': [A('c20f5c1252bb', 0.5), A('cdaf0b102814', 0.35), A('42518f561422', 0.35), Ev('25be82e7c12a', 0.5, 18)],
        'stream': [A('849540a43972', 0.4)],
        'gallows': [A('8d721647a735', 0.35)], 'cemetery': [A('58c3148dfcfd', 0.35)],
        'sign': ('Dawn: to the day', 'altar', ids['day']),
    }
    # 3. Day: morning music; the place of the body turns it to dread, the square to the suspense of the debate.
    day = {
        'square': [musics['debate'], A('b853a6a8fe19', 0.5), A('5048d8055b3c', 0.35)],
        'murder': [musics['murder'], A('b5811ea0ffae', 0.3), A('341e1e01fa1a', 0.4), Ev('e55710a92ee9', 0.45, 30)],
        'church': [A('ee987cbf810f', 0.35), A('6c107448402a', 0.35)],
        'tavern': [A('e8ff164edd11', 0.45), A('3b7a8845c4ac', 0.4)],
        'wood': [A('353d58526115', 0.45)],
        'woodcutter': [MIX('woodcutter', 0.5)], 'workshop': [MIX('workshop', 0.5)], 'farm': [MIX('farm', 0.5)],
        'stream': [A('2592e0e34885', 0.45)],
        'gallows': [A('c0a12dc2d9a0', 0.45), Ev('ec80b2a688b4', 0.45, 25)], 'cemetery': [A('58c3148dfcfd', 0.35)],
        'sign': ('Nightfall: to the night', 'altar', ids['night']),
    }
    places = []
    for pid, title, m, general, player0 in [
        (ids['begin'], 'Dusk: the rules of the village', dusk, [musics['rules'], A('f479cf77d553', 0.3)], list(POS['square'])),
        (ids['night'], 'Night: the village sleeps', night, [musics['night'], A('f2610e4b73c8', 0.4), A('0ee5666b636a', 0.3), Ev('f6988fbe30dc', 0.3, 30)], list(POS['square'])),
        (ids['day'], 'Day: the body and the debate', day, [musics['dawn'], A('7fb97573c4dd', 0.4)], [1000, 960]),
    ]:
        player = [round(player0[0] * K), round(player0[1] * K)]
        els, walls = village(m, None)
        places.append({'id': pid, 'title': title, 'width': W, 'height': H, 'player': player, 'general': general, 'walls': walls, 'elements': els})
    world_music = [musics['rules'], musics['night'], musics['dawn'], musics['murder'], musics['debate']] + more
    soundbox = [
        card(rec('e6465b3b8b5c', 'soundbox'), 'soundbox', 'once', 0.6),   # Thunder
        card(rec('812a430d831b', 'soundbox'), 'soundbox', 'once', 0.6),   # The rain begins
        card(rec('7615966502cb', 'soundbox'), 'soundbox', 'once', 0.6),   # Howling gale
        card(rec('5e93ba8ba8a3', 'soundbox'), 'soundbox', 'once', 0.6),   # The pack's victory howl
        card(snd['timer'], 'soundbox', 'once', 0.6),
    ]
    soundbox[0]['name'] = 'Thunderclap'; soundbox[1]['name'] = 'Rain'; soundbox[2]['name'] = 'Wind'; soundbox[3]['name'] = 'Wolf howl'
    return places, world_music, soundbox


def main():
    snd = build_sounds()
    folder = {'ambience': 'ambience', 'events': 'events', 'music': 'music', 'soundbox': 'soundbox'}
    rec = lambda key, kind: from_recueil(key, folder[kind])
    places, world_music, soundbox = build_world(snd, rec)
    # The story: its sounds by kind, so Troubadour reads it too.
    used = {}
    def note(c, zone):
        used.setdefault(c['file'], (c['name'], zone))
    for p in places:
        for c in p['general']: note(c, c['zone'])
        for e in p['elements']:
            for c in e['cards']: note(c, c['zone'])
    for c in world_music: note(c, 'music')
    chapter = {'title': 'Sounds of Hollowmere', 'description': 'Every sound of the three maps.', 'music': [], 'ambience': [], 'events': []}
    story_box = []
    for path, (name, zone) in sorted(used.items()):
        entry = {'name': name, 'file': path, 'loop': {'music': 'infinite', 'ambience': 'infinite'}.get(zone, 'random'), 'volume': 0.6, 'duration': durations[path], 'sound': blocks[path]}
        chapter[zone if zone in ('music', 'ambience') else 'events'].append(entry)
    for c in soundbox:
        story_box.append({'name': c['name'], 'file': c['file'], 'loop': 'once', 'volume': 0.6, 'duration': durations[c['file']], 'sound': blocks[c['file']]})
    now = '2026-11-08T19:30:00Z'
    sid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'troubadour-map/the-wolves-of-hollowmere'))
    story = {
        'format': 'troubadour', 'version': 2, 'id': sid, 'revision': 1, 'bard': 'Troubadour', 'title': TALE,
        'description': 'A world for the Werewolf party game, in three maps. Dusk: the village gathers and the rules are told, a house for each role. Night: walk the party to the house of the role you call. Day: morning, then dread at the place of the body and suspense on the square for the debate. Sounds from the Troubadour Recueil, Stendhal, /tg/station 13 and Cataclysm: DDA CC-Sounds (see each sound\'s origin).',
        'created': now, 'forged': now, 'generator': 'Troubadour Map world rhythm', 'chapters': [chapter], 'soundbox': story_box,
    }
    world = {
        'format': 'troubadour-map', 'version': 1, 'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'troubadour-map/world/hollowmere')), 'story': sid,
        'revision': 1, 'bard': 'Troubadour', 'created': now, 'forged': now, 'generator': 'Troubadour Map world rhythm',
        'wallLoss': 0.7, 'places': places, 'soundbox': soundbox, 'music': world_music, 'musicLoops': 1, 'stamps': STAMPS,
    }
    os.makedirs(OUT, exist_ok=True)
    name = os.path.join(OUT, '261108_the_wolves_of_hollowmere.troubadour-map')
    with zipfile.ZipFile(name, 'w', zipfile.ZIP_STORED) as z:
        z.writestr('story.json', json.dumps(story, indent=2) + '\n')
        z.writestr('map.json', json.dumps(world, indent=2) + '\n')
        for p in sorted(files):
            z.writestr(p, files[p])
    print(name, round(os.path.getsize(name) / 1e6, 1), 'MB,', len(files), 'sounds')
    short = [p for p in files if durations[p] < 7]
    print('under 7 s:', short)


if __name__ == '__main__':
    main()
