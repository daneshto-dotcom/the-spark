"""S196 team-art (owner R196-A2) - transcode the owner's Grok 3v1 TRIO images into the game.

    python transcode_trios.py                      # every file in MAPPING below
    python transcode_trios.py <src.jpg> <ne> <se> <sw>   # one new file (then add the key to TEAM_TRIO_ART)

Each source is a whole-board landscape (about 1168x784). It is cover-scaled to the board (1920x1080), centre-
cropped, LANCZOS-resized to HALF resolution 960x540 (the rule every shipped zone image follows since the S166
texture-memory fix: the renderer draws each quarter 480x270 -> 960x540 at 2x), its NW quarter (x 0-480,
y 0-270) is painted black - the solo owns NW and the renderer never draws that quarter of a trio image, so the
pixels are dead weight - and saved as WebP q75 to
public/art/race-zones/teams/<ne>-<se>-<sw>.webp  (positional: NE, SE, SW - exactly the sheet's card order).

Identification (S195 team-tiles tree, RE-VERIFIED BY EYE in S196 against contact sheets): he generated in the
sheet's card order, oldest download first; card 14 (Demons/Nagas/Vampires) downloaded as a 0-byte file
(hqBp3) and `mLOs2 (1)` is a byte-identical duplicate of mLOs2.
"""
import os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'public', 'art', 'race-zones', 'teams')
DL = r'C:\Users\onesh\Downloads'
RACES = {'demons', 'mummies', 'nagas', 'orcs', 'vampires', 'zombies'}

# file -> (NE, SE, SW)   card number in the comment
MAPPING = {
    'qwb0Y': ('demons', 'demons', 'demons'),      # 1
    'Y209P': ('demons', 'demons', 'mummies'),     # 2
    '7u6BS': ('demons', 'demons', 'nagas'),       # 3
    'Xn4YJ': ('demons', 'demons', 'orcs'),        # 4
    'Cti5A': ('demons', 'demons', 'vampires'),    # 5
    'GIlwP': ('demons', 'demons', 'zombies'),     # 6
    'mTNsB': ('demons', 'mummies', 'mummies'),    # 7
    'F9nFS': ('demons', 'mummies', 'nagas'),      # 8
    'bxt40': ('demons', 'mummies', 'orcs'),       # 9
    'gOsXj': ('demons', 'mummies', 'vampires'),   # 10
    'b0OyK': ('demons', 'mummies', 'zombies'),    # 11
    'CMK8y': ('demons', 'nagas', 'nagas'),        # 12
    'OsCDw': ('demons', 'nagas', 'orcs'),         # 13
    # card 14 demons/nagas/vampires: hqBp3.jpg is 0 bytes - MISSING
    'T7xpW': ('demons', 'nagas', 'zombies'),      # 15
    '9vbUs': ('demons', 'orcs', 'orcs'),          # 16
    'O8ULO': ('demons', 'orcs', 'vampires'),      # 17
    '06oWF': ('demons', 'orcs', 'zombies'),       # 18
    'XFhrY': ('demons', 'vampires', 'vampires'),  # 19
    '00Z0A': ('demons', 'vampires', 'zombies'),   # 20
    'Vafnh': ('demons', 'zombies', 'zombies'),    # 21
    'XEOoT': ('mummies', 'mummies', 'mummies'),   # 22
    '0nA6Y': ('mummies', 'mummies', 'nagas'),     # 23
    'KHeex': ('mummies', 'mummies', 'orcs'),      # 24
    'EeN9B': ('mummies', 'mummies', 'vampires'),  # 25
    'oLzl8': ('mummies', 'mummies', 'zombies'),   # 26
    'l5Ren': ('mummies', 'nagas', 'nagas'),       # 27
    'mLOs2': ('mummies', 'nagas', 'orcs'),        # 28
}


def transcode(src, trio):
    assert all(r in RACES for r in trio), trio
    im = Image.open(src).convert('RGB')
    w, h = 1920, 1080
    s = max(w / im.width, h / im.height)
    im = im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.LANCZOS)
    l, t = (im.width - w) // 2, (im.height - h) // 2
    im = im.crop((l, t, l + w, t + h)).resize((960, 540), Image.LANCZOS)
    a = np.asarray(im).copy()
    a[:270, :480] = 0  # the solo's NW quarter: never drawn from a trio image
    im = Image.fromarray(a)
    dst = os.path.join(OUT, '-'.join(trio) + '.webp')
    im.save(dst, 'WEBP', quality=75, method=6)
    m = a.max(axis=2)[270:, :]  # brightness of the drawn three quarters (bottom half + NE)
    ne = a.max(axis=2)[:270, 480:]
    mean = (float(m.sum()) + float(ne.sum())) / (m.size + ne.size)
    print(f'{os.path.basename(src):12s} -> {os.path.basename(dst):32s} {os.path.getsize(dst):6d} B  '
          f'mean {mean:5.1f}  px>200 {int((m > 200).sum() + (ne > 200).sum())}')


if __name__ == '__main__':
    if len(sys.argv) == 5:
        transcode(sys.argv[1], tuple(sys.argv[2:5]))
    else:
        for f, trio in MAPPING.items():
            transcode(os.path.join(DL, f + '.jpg'), trio)
