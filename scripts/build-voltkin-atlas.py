#!/usr/bin/env python3
"""SPARK — Voltkin animation atlas builder (S83 P3).

Turns the 6 Veo-generated state clips (assets-source/godly-voltkin/anim-probe/)
into ONE 2048x2048 atlas of 256x256 cells + a JSON manifest consumed by
voltkinFrames.ts / creatureRenderer.ts.

Pipeline per clip:
  1. frame selection — loop search (walk/idle), apex-centered (zap),
     even sampling (charge/hurt/victory)
  2. matte — per-clip background key (white or magenta), border-connected
     labeling, 2px feather + nearest-bg decontamination (same algorithm the
     P1 sprite matte validated; P2 validated it on h264 frames)
  3. registration — fixed per-clip crop window (median centroid-x, median
     char-bottom), uniform per-clip scale chosen so the character occupies
     the same fraction of its 256 cell as it does in its corresponding
     static 512 frame (cross-state on-screen size continuity)
  4. packing — row-major 8-col grid; manifest records start/len/kind/apex/
     nativeFacing per clip

Run from repo root:  python scripts/build-voltkin-atlas.py
Deterministic given the same clips; clips are committed (anim-probe/*.mp4),
frames re-extractable via: ffmpeg -i <clip>.mp4 -vf fps=12 frames-<clip>/f%03d.png
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
PROBE = ROOT / "assets-source" / "godly-voltkin" / "anim-probe"
SPRITES = ROOT / "public" / "godly" / "voltkin" / "sprites"
OUT_DIR = ROOT / "public" / "godly" / "voltkin" / "anim"

CELL = 256
COLS = 8
TOL_WHITE = 26     # chroma tolerance for white bg (h264 noise)
LUM_MIN = 215      # white-bg luma floor (looser than P1's 224 for video)
TOL_MAGENTA = 100  # euclidean distance to measured magenta tone
FEATHER = 2.0
QUANT_COLORS = 256  # cel-shaded art quantizes losslessly to the eye; ~6x smaller

# clip -> (frames dir, bg kind, static frame for scale reference, native facing)
CLIPS = {
    "walk":    ("frames",         "white",   "voltkin-idle-1.png",  -1),
    "idle":    ("frames-idle",    "white",   "voltkin-idle-1.png",   1),
    "charge":  ("frames-charge",  "white",   "voltkin-charge.png",   1),
    "zap":     ("frames-zap",     "magenta", "voltkin-zap.png",      1),
    "hurt":    ("frames-hurt",    "magenta", "voltkin-hurt.png",     1),
    "victory": ("frames-victory", "magenta", "voltkin-victory.png",  1),
}


def load(p: Path) -> np.ndarray:
    return np.array(Image.open(p).convert("RGB"), dtype=np.uint8)


def bg_candidate(rgb: np.ndarray, kind: str, tone: np.ndarray) -> np.ndarray:
    if kind == "white":
        chroma = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
        return (chroma <= TOL_WHITE) & (rgb.mean(axis=2) >= LUM_MIN)
    d = np.linalg.norm(rgb.astype(np.float64) - tone, axis=2)
    return d <= TOL_MAGENTA


def measure_bg_tone(rgb: np.ndarray, kind: str) -> np.ndarray:
    """Sample the actual bg tone just inside the pillarbox bars (h264 shifts it)."""
    bars = rgb.mean(axis=(0, 2)) < 16
    content = np.where(~bars)[0]
    x0, x1 = content.min(), content.max()
    patch = np.concatenate([
        rgb[8:40, x0 + 8:x0 + 40].reshape(-1, 3),
        rgb[8:40, x1 - 40:x1 - 8].reshape(-1, 3),
    ])
    if kind == "magenta":  # keep only clearly-magenta samples (corner may hold art)
        keep = (patch[:, 0] > 150) & (patch[:, 2] > 150) & (patch[:, 1] < 120)
        patch = patch[keep] if keep.any() else patch
    return patch.mean(axis=0)


def matte(rgb: np.ndarray, kind: str) -> np.ndarray:
    tone = measure_bg_tone(rgb, kind)
    cand = bg_candidate(rgb, kind, tone)
    cand |= rgb.mean(axis=2) < 16  # pillarbox bars
    labels, _ = ndimage.label(cand, structure=np.ones((3, 3), np.int8))
    bl = np.unique(np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, bl[bl != 0])
    dist, (iy, ix) = ndimage.distance_transform_edt(~bg, return_indices=True)
    alpha = np.clip(dist / FEATHER, 0.0, 1.0)
    alpha[bg] = 0.0
    bge = rgb[iy, ix].astype(np.float64)
    a = alpha[..., None]
    out = rgb.astype(np.float64).copy()
    band = (alpha > 0) & (alpha < 1)
    un = (rgb.astype(np.float64) - (1 - a) * bge) / np.maximum(a, 1e-6)
    out[band] = np.clip(un[band], 0, 255)
    out[bg] = 0
    rgba = np.dstack([out.round().astype(np.uint8), (alpha * 255).round().astype(np.uint8)])
    if kind == "magenta":
        # Despill: h264 smears magenta into the soft glow around bright rays
        # past any sane key tolerance. The locked palette has NO native
        # pink/magenta (character-locked.md: never red family), so wherever
        # min(R,B) > G the cast is spill — lift G to neutralize (magenta-tinted
        # white -> white, leaves yellows/cyans untouched since their G >= min(R,B)).
        r, g, b = (rgba[..., 0].astype(np.int16), rgba[..., 1].astype(np.int16),
                   rgba[..., 2].astype(np.int16))
        spill_floor = np.minimum(r, b)
        spilled = (spill_floor > g) & (rgba[..., 3] > 0)
        rgba[..., 1][spilled] = spill_floor[spilled].astype(np.uint8)
    return rgba


def frame_paths(clip: str) -> list[Path]:
    return sorted((PROBE / CLIPS[clip][0]).glob("f*.png"))


def loop_select(paths: list[Path], min_start: int = 12, min_len: int = 8, max_len: int = 12) -> list[int]:
    small = [np.array(Image.open(p).convert("RGB").resize((160, 90)), dtype=np.int16) for p in paths]
    best = (1e9, min_start, min_start + min_len)
    for i in range(min_start, len(small)):
        for j in range(i + min_len, min(i + max_len + 1, len(small))):
            d = float(np.abs(small[i] - small[j]).mean())
            if d < best[0]:
                best = (d, i, j)
    _, i, j = best
    return list(range(i, j))


def apex_select(paths: list[Path]) -> tuple[list[int], int]:
    """Zap: brightest-burst frame = apex; 2 anticipation + apex + 3 follow-through."""
    bright = []
    for p in paths:
        rgb = load(p)
        bright.append(int(((rgb.mean(axis=2) > 200) & (rgb[..., 1] > 150)).sum()))
    apex = int(np.argmax(bright))
    idxs, seen = [], set()
    for k in (apex - 4, apex - 2, apex, apex + 2, apex + 4, apex + 7):
        k = max(0, min(len(paths) - 1, k))
        if k not in seen:
            seen.add(k)
            idxs.append(k)
    return idxs, idxs.index(apex)


def even_select(paths: list[Path], n: int, lo: int = 3, hi: int = 46) -> list[int]:
    hi = min(hi, len(paths) - 1)
    return [int(round(x)) for x in np.linspace(lo, hi, n)]


def char_height_frac(static_name: str) -> float:
    rgba = np.array(Image.open(SPRITES / static_name))
    ys = np.where(rgba[..., 3] > 0)[0]
    return (ys.max() - ys.min() + 1) / rgba.shape[0]


def build() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    selections = {
        "walk": list(range(29, 37)),                      # P2 gate loop
        "idle": loop_select(frame_paths("idle")),
        "charge": even_select(frame_paths("charge"), 10, lo=5),
        "hurt": even_select(frame_paths("hurt"), 12),
        "victory": even_select(frame_paths("victory"), 12),
    }
    zap_idxs, zap_apex = apex_select(frame_paths("zap"))
    selections["zap"] = zap_idxs

    manifest: dict = {"cell": CELL, "cols": COLS, "atlas": "voltkin-atlas.png", "clips": {}}
    cells: list[Image.Image] = []

    for clip, (_, kind, static_name, native_facing) in CLIPS.items():
        paths = frame_paths(clip)
        idxs = selections[clip]
        mats = [matte(load(paths[k]), kind) for k in idxs]

        boxes = []
        for m in mats:
            ys, xs = np.where(m[..., 3] > 0)
            boxes.append((xs.min(), xs.max(), ys.min(), ys.max()))
        heights = [b[3] - b[2] + 1 for b in boxes]
        h_med = float(np.median(heights))
        target_h = char_height_frac(static_name) * CELL
        s = min(target_h / h_med, (CELL - 8) / max(b[1] - b[0] + 1 for b in boxes),
                (CELL - 8) / max(heights))
        cx_med = float(np.median([(b[0] + b[1]) / 2 for b in boxes]))
        bot_med = float(np.median([b[3] for b in boxes]))

        for m in mats:
            im = Image.fromarray(m, "RGBA")
            im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
            cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            # fixed window: median centroid-x centered; median char bottom sits
            # at a common baseline 12px above the cell floor (in-frame bounce
            # preserved as in-cell vertical motion)
            ox = round(CELL / 2 - cx_med * s)
            oy = round(CELL - 12 - bot_med * s)
            cell.paste(im, (ox, oy), im)
            cells.append(cell)

        entry: dict = {"start": len(cells) - len(mats), "len": len(mats),
                       "kind": "loop" if clip in ("walk", "idle") else "oneshot"}
        if clip == "zap":
            entry["apex"] = zap_apex
        if native_facing != 1:
            entry["nativeFacing"] = native_facing
        manifest["clips"][clip] = entry
        print(f"{clip}: {len(mats)} frames (src idx {idxs[0]}..{idxs[-1]}), scale {s:.3f}")

    rows = -(-len(cells) // COLS)
    atlas = Image.new("RGBA", (COLS * CELL, rows * CELL), (0, 0, 0, 0))
    for k, c in enumerate(cells):
        atlas.paste(c, ((k % COLS) * CELL, (k // COLS) * CELL))
    atlas.quantize(colors=QUANT_COLORS, method=Image.FASTOCTREE, dither=Image.NONE).save(
        OUT_DIR / "voltkin-atlas.png", optimize=True)
    (OUT_DIR / "voltkin-anim.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"atlas: {atlas.size[0]}x{atlas.size[1]}, {len(cells)} cells, "
          f"{(OUT_DIR / 'voltkin-atlas.png').stat().st_size // 1024} KB")
    print(f"manifest: {json.dumps(manifest['clips'])}")


if __name__ == "__main__":
    build()
