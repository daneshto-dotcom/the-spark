"""
SPARK — S192 endgame: matte the owner's PANTS MONSTER art off its BAKED checkerboard and pack the
walk sheet into the repo's creature atlas format (the `-anim.json` + `-atlas.png` pair that
`goblinRenderer.loadAtlas` reads).

The owner's own note on the art: *"I don't think it's real transparent background ... Gemini ... just
did like with the check marks."* Measured: both PNGs are RGBA with alpha 255 EVERYWHERE, and the
"transparency" is a painted 2-tone checker — near-white (~252) and light grey (~200-204), both
neutral. So the matte is:

  1. BACKGROUND = pixels that are NEUTRAL (max-min channel spread <= SAT_TOL) and not dark
     (min channel >= BG_MIN_V), FLOOD-FILLED FROM THE BORDER. Connected-to-border, not "grey becomes
     transparent", so the enclosed white teeth and drool survive (ART_PIPELINE: "the matte is
     connected-component from the border"). The neutral-grey DROP SHADOW under the feet joins the
     background on purpose: it is a painted shadow on a fake floor, and the board has its own marker.
  2. EDGE ALPHA: the anti-aliased rim (foreground pixels within EDGE_PX of the background) gets an
     alpha estimated from how far it sits from the local checker value toward the black outline, and
     its colour is un-blended against that checker value (no light halo on a black board).
  3. ART_PIPELINE alpha rules: alpha <= 24 -> 0, alpha >= 244 -> 255, so no ghost wash.
  4. Keep only the LARGEST connected opaque component per frame — this drops the Gemini sparkle
     watermark when it sits on the background (the single pose), and stray floor drool drops.

Walk sheet slicing follows the S183 intake: GUTTER DETECTION on the matted alpha (empty columns /
rows), not a fixed grid guess. The sheet measured 5 x 4 = 20 frames (the owner said 18).

Usage: python scripts/matte-endgame-monster.py <walk-sheet.png> <single-pose.png> <out-dir-src> <out-dir-public>
Reads its inputs; never moves or deletes them.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SAT_TOL = 20       # max-min channel spread that still counts as checker grey/white
BG_MIN_V = 150     # darkest channel value a checker pixel can have (shadow core is darker; see below)
SHADOW_MIN_V = 70  # the painted drop shadow is neutral and down to ~90; still above the black outline
EDGE_PX = 2
CELL = 200         # unit cell, like every unit atlas (direwolf, race units)
FILL = 0.94        # subject height as a fraction of the cell
OUTLINE_V = 35.0   # the drawn outline's value — the "fully opaque" end of the edge ramp


def matte(rgb: np.ndarray) -> np.ndarray:
    """Return an RGBA uint8 array with the baked checker keyed out."""
    f = rgb.astype(np.float32)
    mx, mn = f.max(axis=2), f.min(axis=2)
    neutral = (mx - mn) <= SAT_TOL
    cand = neutral & (mn >= SHADOW_MIN_V)
    lab, _ = ndimage.label(cand)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border != 0]
    bg = np.isin(lab, border)
    # Local checker value: the background colour nearest each pixel (an EDT index lookup).
    _, (iy, ix) = ndimage.distance_transform_edt(~bg, return_indices=True)
    bgv = f[iy, ix].mean(axis=2)
    dist = ndimage.distance_transform_edt(~bg)
    alpha = np.where(bg, 0.0, 255.0)
    rim = (~bg) & (dist <= EDGE_PX)
    v = f.mean(axis=2)
    est = np.clip((bgv - v) / np.maximum(1.0, bgv - OUTLINE_V), 0.0, 1.0) * 255.0
    # only darken-toward-outline pixels are blends; a saturated rim pixel (tan cloth) is opaque
    sat_rim = rim & ((mx - mn) > SAT_TOL)
    alpha = np.where(rim & ~sat_rim, est, alpha)
    alpha[alpha <= 24] = 0
    alpha[alpha >= 244] = 255
    # un-blend the rim colour against the local checker value
    a1 = np.maximum(alpha / 255.0, 1e-3)[..., None]
    un = (f - (1 - a1) * bgv[..., None]) / a1
    out_rgb = np.where((rim & (alpha > 0) & (alpha < 255))[..., None], np.clip(un, 0, 255), f)
    rgba = np.dstack([out_rgb, alpha]).astype(np.uint8)
    return rgba


def keep_largest(rgba: np.ndarray) -> np.ndarray:
    lab, n = ndimage.label(rgba[..., 3] > 0)
    if n <= 1:
        return rgba
    sizes = ndimage.sum(np.ones_like(lab), lab, index=range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    out = rgba.copy()
    out[lab != keep] = 0
    return out


def gutters(profile: np.ndarray, min_gap: int = 4) -> list[tuple[int, int]]:
    """Runs of non-empty bins separated by >= min_gap empty bins -> [(start, end)]."""
    occ = profile > 0
    runs, i, n = [], 0, len(occ)
    while i < n:
        if not occ[i]:
            i += 1
            continue
        j = i
        gap = 0
        k = i
        while k < n:
            if occ[k]:
                j = k
                gap = 0
            else:
                gap += 1
                if gap >= min_gap:
                    break
            k += 1
        runs.append((i, j + 1))
        i = k
    return runs


def main() -> None:
    sheet_p, pose_p, src_dir, pub_dir = map(Path, sys.argv[1:5])
    src_dir.mkdir(parents=True, exist_ok=True)
    pub_dir.mkdir(parents=True, exist_ok=True)

    pose = keep_largest(matte(np.array(Image.open(pose_p).convert('RGB'))))
    Image.fromarray(pose).save(src_dir / 'pants-pose-matted.png')

    sheet = matte(np.array(Image.open(sheet_p).convert('RGB')))
    Image.fromarray(sheet).save(src_dir / 'pants-walk-sheet-matted.png')
    a = sheet[..., 3]
    rows = gutters(a.sum(axis=1), min_gap=6)
    frames = []
    for (y0, y1) in rows:
        cols = gutters(a[y0:y1].sum(axis=0), min_gap=6)
        for (x0, x1) in cols:
            frames.append(keep_largest(sheet[y0:y1, x0:x1]))
    print(f'rows={len(rows)} frames={len(frames)}')

    # ONE union bbox (ART_PIPELINE): tight-crop each frame, then fit every frame with ONE scale.
    crops = []
    for fr in frames:
        ys, xs = np.nonzero(fr[..., 3])
        crops.append(fr[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    # ⛔ The LAST frame carries the Gemini sparkle watermark ON the cloth (not on the background, so
    # keep_largest cannot drop it). Measured by eye on the contact sheet; the loop closes on frame 19.
    if len(crops) == 20:
        crops = crops[:19]
    # ⚠ MINE — a deviation from ART_PIPELINE's ONE-union-bbox rule, and the reason: the SOURCE drew
    # frame 5 visibly smaller than its neighbours (a generated sheet, not a seeded clip), so one scale
    # would make the sprite shrink and grow once per stride. Each frame is fitted to the MEDIAN height.
    med_h = float(np.median([c.shape[0] for c in crops]))
    max_w = max(c.shape[1] * (med_h / c.shape[0]) for c in crops)
    base = min(CELL * FILL / med_h, CELL * FILL / max_w)
    scale = base
    cells = []
    for c in crops:
        h, w = c.shape[:2]
        k = base * (med_h / h)
        im = Image.fromarray(c).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
        cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        # feet on a constant baseline, centred horizontally
        cell.paste(im, ((CELL - im.width) // 2, CELL - 2 - im.height), im)
        arr = np.array(cell)
        al = arr[..., 3]
        al[al <= 24] = 0
        al[al >= 244] = 255
        cells.append(arr)

    n = len(cells)
    atlas = np.zeros((CELL, CELL * n, 4), dtype=np.uint8)
    for i, c in enumerate(cells):
        atlas[:, i * CELL:(i + 1) * CELL] = c
    Image.fromarray(atlas).save(pub_dir / 'endgame-monster-atlas.png', optimize=True)
    manifest = {
        'cellW': CELL,
        'cellH': CELL,
        'footAnchor': {'x': 0.5, 'y': 0.99},
        'states': {
            # ⚠ MINE: one sheet (a walk loop) serves every row. idle = frame 0 held, attack = the same
            # stride played at the 60-tick swing (12 frames x 5 ticks), walk = the full loop.
            'idle': {'row': 0, 'frames': 1, 'ticksPerFrame': 8},
            'walk': {'row': 0, 'frames': n, 'ticksPerFrame': 4},
            'attack': {'row': 0, 'frames': min(12, n), 'ticksPerFrame': 5},
        },
    }
    (pub_dir / 'endgame-monster-anim.json').write_text(json.dumps(manifest, indent=2) + '\n', newline='\n')
    print(json.dumps({'frames': n, 'scale': round(scale, 4), 'medH': med_h, 'maxW': round(max_w, 1)}))


if __name__ == '__main__':
    main()
