#!/usr/bin/env python3
"""SPARK — Voltkin true-alpha matte pipeline (S83 P1).

The 6 shipped Voltkin frames have a fake "transparency checkerboard" BAKED
into the background (generator drew the checker pattern literally; 0% real
alpha — S83 audit). This script removes it deterministically:

  1. Candidate mask: achromatic (chroma <= CHROMA_TOL) AND bright
     (luma >= LUM_MIN). Measured checker tones: gray ~240, white ~254,
     chroma <= 5. The character's lightest yellow (#FFEB6B) has chroma ~148
     — a wide separation margin. Black outlines (luma << 224) block the fill
     so enclosed whites (eyes, teeth) are structurally safe.
  2. Edge-connectivity: scipy label; only components touching the image
     border become background. Interior whites keep alpha=255.
  3. Speck absorption: tiny (<= SPECK_AREA px) near-achromatic islands fully
     inside the background are compression debris — absorbed.
  4. Edge decontamination: foreground pixels within FEATHER px of background
     get a distance-ramp alpha AND their RGB unmixed against the *nearest
     actual background pixel's* color (removes the white fringe that
     anti-aliasing baked into boundary pixels).
  5. Interior guarantee: every fg pixel >= FEATHER px from the background is
     written byte-identical to the input. --verify asserts this.

Sources are the SHIPPED frames (already 512x512); originals remain untouched
in assets-source/. Reproducible: run from repo root:

    python scripts/matte-voltkin-frames.py            # write mattes
    python scripts/matte-voltkin-frames.py --verify   # probe outputs
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "godly" / "voltkin" / "sprites"
BACKUP = ROOT / "assets-source" / "godly-voltkin" / "sprites" / "pre-s83-checkerboard"

FRAMES = [
    "voltkin-idle-1.png",
    "voltkin-idle-2.png",
    "voltkin-charge.png",
    "voltkin-zap.png",
    "voltkin-hurt.png",
    "voltkin-victory.png",
]

# Measured from the shipped frames (S83 A.0): checker tones 240/254, chroma<=5.
CHROMA_TOL = 22   # max(R,G,B)-min(R,G,B) for "achromatic"
LUM_MIN = 224     # mean(R,G,B) floor for "bright" (checker gray ~240)
SPECK_AREA = 48   # px; tiny fg islands inside bg absorbed as debris
FEATHER = 2.0     # px; alpha ramp + decontamination band width


def build_bg_mask(rgb: np.ndarray) -> np.ndarray:
    """Border-connected achromatic-bright mask (the baked checkerboard)."""
    chroma = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    lum = rgb.mean(axis=2)
    candidate = (chroma <= CHROMA_TOL) & (lum >= LUM_MIN)

    labels, _ = ndimage.label(candidate, structure=np.ones((3, 3), dtype=np.int8))
    border_labels = np.unique(
        np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    )
    border_labels = border_labels[border_labels != 0]
    bg = np.isin(labels, border_labels)

    # Absorb tiny non-bg specks fully inside bg (compression debris between
    # checker cells). Conservative: small area AND near-achromatic.
    fg_labels, n_fg = ndimage.label(~bg, structure=np.ones((3, 3), dtype=np.int8))
    if n_fg > 1:
        areas = ndimage.sum_labels(np.ones_like(fg_labels), fg_labels, index=np.arange(1, n_fg + 1))
        for lab in np.where(areas <= SPECK_AREA)[0] + 1:
            speck = fg_labels == lab
            if chroma[speck].max() <= CHROMA_TOL + 13:
                bg |= speck
    return bg


def matte(rgb: np.ndarray) -> np.ndarray:
    """Return RGBA with the checkerboard removed + decontaminated edges."""
    bg = build_bg_mask(rgb)

    # Distance of each fg pixel to the nearest bg pixel; also which bg pixel,
    # so decontamination unmixes against the *actual local* checker tone
    # (gray vs white cell) instead of a global average.
    dist, (iy, ix) = ndimage.distance_transform_edt(~bg, return_indices=True)
    alpha = np.clip(dist / FEATHER, 0.0, 1.0)
    alpha[bg] = 0.0

    bg_est = rgb[iy, ix].astype(np.float64)  # nearest-bg color per pixel
    a = alpha[..., None]
    out_rgb = rgb.astype(np.float64).copy()
    band = (alpha > 0.0) & (alpha < 1.0)
    # Unmix: pixel = a*char + (1-a)*bg  =>  char = (pixel - (1-a)*bg) / a
    unmixed = (rgb.astype(np.float64) - (1.0 - a) * bg_est) / np.maximum(a, 1e-6)
    out_rgb[band] = np.clip(unmixed[band], 0, 255)
    out_rgb[bg] = 0  # fully transparent pixels zeroed (premultiply-friendly)

    rgba = np.dstack([out_rgb.round().astype(np.uint8),
                      (alpha * 255).round().astype(np.uint8)])
    return rgba


def run() -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    for name in FRAMES:
        src = SPRITES / name
        rgb = np.array(Image.open(src).convert("RGB"))
        bak = BACKUP / name
        if not bak.exists():
            bak.write_bytes(src.read_bytes())  # byte-exact rollback copy
        rgba = matte(rgb)
        Image.fromarray(rgba, "RGBA").save(src, format="PNG", optimize=True)
        transparent = int((rgba[..., 3] == 0).sum()) * 100 // rgba[..., 3].size
        print(f"{name}: {transparent}% transparent, {src.stat().st_size//1024} KB")


def verify() -> None:
    failures = []
    for name in FRAMES:
        out = np.array(Image.open(SPRITES / name))
        assert out.shape[2] == 4, f"{name}: not RGBA"
        a = out[..., 3]
        rgb_in = np.array(Image.open(BACKUP / name).convert("RGB"))
        bg = build_bg_mask(rgb_in)

        # Burst frames (charge/zap) have chromatic rays that legitimately reach
        # the image border — the ring check forbids CHECKER-TONE survivors only
        # (achromatic + bright), not all opaque pixels.
        ring = np.zeros(a.shape, dtype=bool)
        ring[:4] = ring[-4:] = True
        ring[:, :4] = ring[:, -4:] = True
        ring_rgb = out[..., :3].astype(np.int16)
        ring_checker = (
            ring & (a > 0)
            & (ring_rgb.max(axis=2) - ring_rgb.min(axis=2) <= CHROMA_TOL)
            & (ring_rgb.mean(axis=2) >= LUM_MIN)
        )
        checks = {
            "no checker-tone px in border ring": ring_checker.sum() == 0,
            "every checker px transparent": a[bg].max() == 0,
            "has transparency at all": (a == 0).mean() > 0.30,
            "interior byte-identical": bool(
                np.array_equal(
                    out[..., :3][ndimage.binary_erosion(~bg, iterations=3)],
                    rgb_in[ndimage.binary_erosion(~bg, iterations=3)],
                )
            ),
            "enclosed whites survive": bool(
                (
                    (out[..., :3].max(axis=2).astype(int) - out[..., :3].min(axis=2) <= CHROMA_TOL)
                    & (out[..., :3].mean(axis=2) >= LUM_MIN) & (a == 255)
                ).sum() > 0
            ),
        }
        for label, ok in checks.items():
            if not ok:
                failures.append(f"{name}: FAIL {label}")
        print(f"{name}: " + " | ".join(("OK " if ok else "FAIL ") + k for k, ok in checks.items()))
    if failures:
        sys.exit("\n".join(failures))
    print("ALL VERIFY CHECKS PASSED")


if __name__ == "__main__":
    if "--verify" in sys.argv:
        verify()
    else:
        run()
