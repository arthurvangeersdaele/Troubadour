import sys, glob, subprocess, os, numpy as np
from build import load
for f in sys.argv[1:]:
    pk = float(np.abs(load(f)).max())
    if pk > 0.92:
        g = 0.85 / pk
        mono = subprocess.run(['ffprobe','-v','error','-show_entries','stream=channels','-of','csv=p=0',f],capture_output=True,text=True).stdout.strip()=='1'
        br = subprocess.run(['ffprobe','-v','error','-show_entries','format=bit_rate','-of','csv=p=0',f],capture_output=True,text=True).stdout.strip()
        tmp = f + '.tmp.mp3'
        subprocess.run(['ffmpeg','-v','error','-y','-i',f,'-af',f'volume={g:.3f}','-c:a','libmp3lame','-b:a',str(round(int(br)/1000))+'k','-id3v2_version','0',tmp],check=True)
        os.replace(tmp, f); print('fixed', f, round(pk,2), '->', round(float(np.abs(load(f)).max()),2))
