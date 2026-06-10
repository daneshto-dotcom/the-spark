#!/usr/bin/env python3
"""S83 P2 — Veo walk-cycle probe gate metrics (run from repo root)."""
import glob

import numpy as np
from PIL import Image

FRAMES = sorted(glob.glob("assets-source/godly-voltkin/anim-probe/frames/f*.png"))
OUT = "assets-source/godly-voltkin/anim-probe"


def load(p):
    return np.array(Image.open(p).convert("RGB"), dtype=np.uint8)


def char_mask(rgb):
    """Non-background pixels: not near-white, not pillarbox black-bar."""
    lum = rgb.mean(axis=2)
    chroma = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    white = (lum >= 224) & (chroma <= 26)
    black_cols = (rgb.mean(axis=(0, 2)) < 16)  # pillarbox columns
    mask = ~white
    mask[:, black_cols] = False
    return mask


def dhash(gray8x9):
    return (gray8x9[:, 1:] > gray8x9[:, :-1]).flatten()


def char_dhash(rgb):
    m = char_mask(rgb)
    ys, xs = np.where(m)
    crop = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    g = np.array(Image.fromarray(crop).convert("L").resize((9, 8), Image.LANCZOS), dtype=np.int16)
    return dhash(g)


frames = [load(p) for p in FRAMES]
masks = [char_mask(f) for f in frames]

# --- centroid drift (walk-in-place check) + char size stability ---
cents, areas = [], []
for m in masks:
    ys, xs = np.where(m)
    cents.append((xs.mean(), ys.mean()))
    areas.append(len(xs))
cx = np.array([c[0] for c in cents])
cy = np.array([c[1] for c in cents])
print(f"centroid x: spread {cx.max()-cx.min():.0f}px  y: spread {cy.max()-cy.min():.0f}px (720p)")
print(f"char area: min {min(areas)} max {max(areas)} ratio {max(areas)/min(areas):.2f}")

# --- motion variance: mean abs diff between consecutive frames in char bbox ---
diffs = []
for a, b in zip(frames[:-1], frames[1:]):
    region = masks[0] | masks[1]
    d = np.abs(a.astype(np.int16) - b.astype(np.int16)).mean(axis=2)
    diffs.append(d[region].mean())
diffs = np.array(diffs)
print(f"motion (mean abs diff): min {diffs.min():.2f} mean {diffs.mean():.2f} max {diffs.max():.2f}")
print(f"  frames with near-zero motion (<0.5): {(diffs < 0.5).sum()}/{len(diffs)}")

# --- dHash drift vs seed ---
seed = load("assets-source/godly-voltkin/anim-probe/seed-idle-white.png")
seed_h = char_dhash(seed)
drifts = [int((char_dhash(f) != seed_h).sum()) for f in frames[::6]]
print(f"dHash hamming vs seed (64-bit, every 6th frame): {drifts} (<=24 ~ same design)")

# --- loop closure: best matching frame pair (i, j) with j-i in [8, 20] (0.67-1.67s @12fps) ---
small = [np.array(Image.fromarray(f).resize((160, 90))).astype(np.int16) for f in frames]
best = (1e9, 0, 0)
for i in range(len(small)):
    for j in range(i + 8, min(i + 21, len(small))):
        d = np.abs(small[i] - small[j]).mean()
        if d < best[0]:
            best = (d, i, j)
print(f"best loop: frames {best[1]}..{best[2]} (len {best[2]-best[1]}) closure diff {best[0]:.2f}")
base = np.array([np.abs(small[k] - small[k + 1]).mean() for k in range(len(small) - 1)]).mean()
print(f"  (reference: mean consecutive-frame diff {base:.2f} — closure below this = seamless)")

# --- contact sheet (every 4th frame) ---
thumbs = []
for f in frames[::4]:
    m = char_mask(f)
    ys, xs = np.where(m)
    crop = Image.fromarray(f[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    crop.thumbnail((150, 150))
    thumbs.append(crop)
sheet = Image.new("RGB", (152 * 6, 152 * 2 + 4), (24, 26, 34))
for k, t in enumerate(thumbs[:12]):
    sheet.paste(t, (152 * (k % 6) + (152 - t.width) // 2, 152 * (k // 6) + (152 - t.height) // 2))
sheet.save(f"{OUT}/contact-sheet.png")

# --- game-scale GIF of the best loop over dark bg ---
i, j = best[1], best[2]
gif_frames = []
for f in frames[i:j]:
    m = char_mask(f)
    ys, xs = np.where(m)
    crop = f[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(crop).convert("RGBA")
    im.thumbnail((128, 128))
    cell = Image.new("RGBA", (140, 140), (24, 26, 34, 255))
    cell.paste(im, ((140 - im.width) // 2, (140 - im.height) // 2), im)
    gif_frames.append(cell.convert("P", palette=Image.ADAPTIVE))
gif_frames[0].save(f"{OUT}/walk-loop.gif", save_all=True, append_images=gif_frames[1:],
                   duration=83, loop=0)
print(f"contact sheet + walk-loop.gif written ({j-i} loop frames @12fps)")
