"""The Forest Adventure, 21 November 2026: higher quality and new sounds (for the new tutorial, the forest Ballade
and the forest Map).

1. Every sound of the forest that is not edited (CREDITS.md: no *edited* mark) is encoded again from its original
   (Stendhal's lossless sources for the bears), at 160 kbps for music and 128 kbps for the rest, and brought to the
   loudness its earlier file had (the web edition's targets).
2. New sounds, at the web edition's loudness: Highland Mist and Calm Before the Storm (0 A.D.), the creek
   (0 A.D. river_slow_21), a woodpecker, a blackbird, a branch that snaps, rustling leaves, wings in the trees and a
   horse that whinnies (Stendhal's lossless sources). Credits in docs/discovery/CREDITS.md.

Needs ffmpeg with libmp3lame and the network (raw.githubusercontent.com). Run from the repo root:

    python3 .github/scripts/web-sounds/forest_hq_261121.py
"""
import re, subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
FOREST = REPO / 'docs/discovery/sounds/forest'
WORK = Path(__file__).resolve().parent / 'work' / 'forest_hq'
WORK.mkdir(parents=True, exist_ok=True)
RAW0, RAWW = 'https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/audio', 'https://raw.githubusercontent.com/wesnoth/wesnoth/master/data/core'
RAWS = 'https://raw.githubusercontent.com/arianne/stendhal/master/data/sounds/lossless_sources'
TARGET = {'music': -18.4, 'ambience': -23.3, 'events': -17.4}
# Unedited sounds with no loudness of their own to keep (too short to measure): left at the original's level.
LOSSLESS = {'bear-03.ogg': 'bear-03.flac', 'bear-01.ogg': 'bear-01.flac'}
NEW = [  # source, destination, loudness, kbps
    (f'{RAW0}/music/Highland_Mist.ogg', '1-in-the-forest/music/03_highland-mist.mp3', -18.4, 160),
    (f'{RAW0}/ambient/water/river_slow_21.ogg', '1-in-the-forest/ambience/04_the-creek.mp3', -23.3, 128),
    (f'{RAWS}/bird-woodpecker-01.flac', '1-in-the-forest/events/04_woodpecker.mp3', -19, 128),
    (f'{RAWS}/bird-blackbird-02.flac', '1-in-the-forest/events/05_blackbird-sings.mp3', -19, 128),
    (f'{RAWS}/snap-branch-1.flac', '1-in-the-forest/events/06_a-branch-snaps.mp3', -19, 128),
    (f'{RAWS}/shake-leaves-1.flac', '1-in-the-forest/events/07_rustling-leaves.mp3', -21, 128),
    (f'{RAW0}/music/Calm_Before_the_Storm.ogg', '2-fight-with-a-bear/music/03_calm-before-the-storm.mp3', -18.4, 160),
    (f'{RAWS}/wings-flap-large-1.flac', '2-fight-with-a-bear/events/06_wings-in-the-trees.mp3', -19, 128),
    (f'{RAWS}/horse-whinny-01.flac', '4-the-human-village/events/05_horse-whinnies.mp3', -18, 128),
]


def fetch(url):
    p = WORK / re.sub(r'[^A-Za-z0-9._-]', '_', url.split('githubusercontent.com/')[-1])
    if not p.exists():
        subprocess.run(['curl', '-sSfL', '-o', str(p), url], check=True)
    return p


def lufs(p):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(p), '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float([l for l in r.splitlines() if l.strip().startswith('I:')][-1].split()[1])


def encode(src, dst, target, kbps):
    now = lufs(src)
    g = target - now if target > -60 and now > -60 else 0
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-af', f'volume={g:.2f}dB,alimiter=limit=0.944:attack=2:release=60:level=false',
                    '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', '-id3v2_version', '0', '-map_metadata', '-1', str(dst)], check=True)


def main():
    credits = (REPO / 'docs/discovery/CREDITS.md').read_text()
    sec = credits[credits.index('## The Forest Adventure'):credits.index('## The Big War')]
    new = {d for _, d, _, _ in NEW}
    for line in sec.splitlines():
        m = re.match(r"\| `([^`]+)`( \*edited\*)? \| ([^|]+)\|", line)
        if not m or m.group(2) or m.group(1) in new or m.group(1).endswith(('01_forest-at-day.mp3', '02_restless-wind.mp3')):
            continue  # edited, new, or louder than its original (kept)
        url = re.findall(r"\]\((https://github[^)]+)\)", m.group(3))[0]
        url = url.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/').replace('/0ad/0ad/main/', '/0ad/0ad/master/')
        zone = m.group(1).split('/')[1]
        encode(fetch(url), FOREST / m.group(1), TARGET[zone], 160 if zone == 'music' else 128)
        print('again', m.group(1))
    for url, dst, target, kbps in NEW:
        encode(fetch(url), FOREST / dst, target, kbps)
        print('new', dst)


if __name__ == '__main__':
    main()
