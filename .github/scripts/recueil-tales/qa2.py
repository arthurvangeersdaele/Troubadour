import sys, glob, numpy as np
from build import load, SR
for f in sorted(glob.glob(sys.argv[1] + '/sounds/*/*/*.mp3') + glob.glob(sys.argv[1] + '/sounds/soundbox/*.mp3')):
    if '/music/' in f: continue
    a = load(f); m = a.mean(axis=1); w = int(0.5 * SR); n = len(m) // w
    db = 20 * np.log10(np.sqrt((m[:n * w].reshape(n, w) ** 2).mean(axis=1)) + 1e-9)
    q = (db < -50).mean() * 100; pk = np.abs(a).max(); d = len(a) / SR
    flag = ('QUIET ' if q > 5 and '/ambience/' in f else '') + ('PEAK ' if pk > 0.95 else '') + ('SHORT' if d < 5 else '')
    print(f'{d:6.1f}s {q:3.0f}%q pk{pk:.2f} med{np.median(db):6.1f} {flag:10s} {f.split("sounds/")[1]}')
