#!/usr/bin/env python3
"""SPARK — Voltkin intro-cinematic checkerboard removal (S83 P4).

The Veo-generated intro (voltkin-intro.mp4) has the same fake "transparency
checkerboard" baked into its background as the sprites had (S83 audit). The
runtime luma key (threshold .88) removed only the WHITE checker cells — the
gray cells survived as the squares the user saw, and the belly highlight
#FFEB6B (luma .887) sat ON the threshold so the key also punched holes in
the character. This script retires the runtime key entirely by compositing
the checkerboard onto black OFFLINE, preserving the approved cinematic
content exactly:

  1. temporal-median background plate (the checkerboard + pillarbox are
     static; median is robust to the explosion/creature transients)
  2. checker-like plate mask = achromatic & bright, then a 13px morphological
     OPENING so thin static lightning-arc cores baked into the plate are NOT
     keyed (checker cells are ~45px solid blocks; arc cores are <=10px) —
     plus a 5px guarded re-dilation to recover cell boundaries
  3. per-frame soft key INSIDE the mask only: w = clamp((maxdiff-12)/24);
     out = w*frame -> static checker fades to black, anything moving over it
     (glow, shards, creature) is kept by the plate-difference
  4. re-encode libx264 CRF 24 + original AAC track copied + faststart

Source of truth: assets-source/godly-voltkin/cinematic/voltkin-intro.mp4
(pristine) -> output public/godly/voltkin/cinematic/voltkin-intro.mp4.
Pairs with src/state/godlyRecipes/voltkin.ts lumaKey.enabled=false (the
S22 CinematicLumaKeyFilter shader path is no longer needed at runtime).

Run from repo root: python scripts/matte-voltkin-intro.py [--verify]
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-source" / "godly-voltkin" / "cinematic" / "voltkin-intro.mp4"
DST = ROOT / "public" / "godly" / "voltkin" / "cinematic" / "voltkin-intro.mp4"

CHROMA_TOL = 30
LUM_MIN = 170
OPEN_PX = 13      # kills thin (<=10px) static arc cores; keeps ~45px checker cells
REDILATE_PX = 5   # guarded boundary recovery (intersected with candidate)
KEY_T0 = 12.0     # maxdiff below this -> fully black (static checker)
KEY_T1 = 36.0     # maxdiff above this -> fully kept (moving content)
FPS = 24


def build_mask(plate: np.ndarray) -> np.ndarray:
    chroma = plate.max(axis=2).astype(np.int16) - plate.min(axis=2).astype(np.int16)
    lum = plate.mean(axis=2)
    candidate = (chroma <= CHROMA_TOL) & (lum >= LUM_MIN)
    opened = ndimage.binary_opening(candidate, structure=np.ones((OPEN_PX, OPEN_PX)))
    return ndimage.binary_dilation(opened, structure=np.ones((REDILATE_PX, REDILATE_PX))) & candidate


def run() -> None:
    with tempfile.TemporaryDirectory() as td:
        tdir = Path(td)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(SRC),
                        str(tdir / "f%03d.png")], check=True)
        paths = sorted(tdir.glob("f*.png"))
        frames = [np.array(Image.open(p).convert("RGB")) for p in paths]
        plate = np.median(np.stack(frames[::2]), axis=0).astype(np.uint8)
        mask = build_mask(plate)
        print(f"{len(frames)} frames; checker mask {mask.mean() * 100:.1f}% of plate")

        plate_f = plate.astype(np.float64)
        for p, fr in zip(paths, frames):
            diff = np.abs(fr.astype(np.float64) - plate_f).max(axis=2)
            w = np.clip((diff - KEY_T0) / (KEY_T1 - KEY_T0), 0.0, 1.0)
            out = fr.astype(np.float64).copy()
            out[mask] *= w[mask, None]
            Image.fromarray(out.round().astype(np.uint8)).save(p)

        subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
                        "-framerate", str(FPS), "-i", str(tdir / "f%03d.png"),
                        "-i", str(SRC),
                        "-map", "0:v", "-map", "1:a?",
                        "-c:v", "libx264", "-crf", "26", "-preset", "slow",
                        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                        "-c:a", "copy", str(DST)], check=True)
    print(f"wrote {DST.name}: {DST.stat().st_size // 1024} KB (was {SRC.stat().st_size // 1024} KB)")


def verify() -> None:
    with tempfile.TemporaryDirectory() as td:
        tdir = Path(td)
        # plate + mask from the PRISTINE source (same construction as run())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(SRC),
                        str(tdir / "s%03d.png")], check=True)
        src_frames = [np.array(Image.open(p).convert("RGB"))
                      for p in sorted(tdir.glob("s*.png"))]
        plate = np.median(np.stack(src_frames[::2]), axis=0).astype(np.uint8)
        mask = build_mask(plate)

        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(DST),
                        str(tdir / "o%03d.png")], check=True)
        out_paths = sorted(tdir.glob("o%03d.png".replace("%03d", "*")))
        # The defect = the STATIC checkerboard still visible, i.e. an output
        # pixel inside the mask that (a) still matches the plate and (b) is
        # checker-toned. Bright MOVING content legitimately kept over the ring
        # (explosion flash, glass shards, arc cores) differs from the plate and
        # must NOT count — the naive any-bright-achromatic metric false-failed
        # on exactly those pixels (same lesson as P1's border-ring probe).
        worst = 0.0
        plate_f = plate.astype(np.int16)
        for p in out_paths[::8]:
            fr = np.array(Image.open(p).convert("RGB"))
            chroma = fr.max(axis=2).astype(np.int16) - fr.min(axis=2).astype(np.int16)
            lum = fr.mean(axis=2)
            near_plate = np.abs(fr.astype(np.int16) - plate_f).max(axis=2) <= KEY_T0 + 6
            survivors = ((chroma <= CHROMA_TOL) & (lum >= LUM_MIN) & near_plate & mask).sum()
            pct = survivors * 100.0 / max(mask.sum(), 1)
            worst = max(worst, pct)
        print(f"worst static-checker survivor rate inside mask: {worst:.2f}%")
        if worst > 1.0:
            sys.exit("FAIL: the static checkerboard survives in the output")
        print("VERIFY PASSED")


if __name__ == "__main__":
    if "--verify" in sys.argv:
        verify()
    else:
        run()
