#!/usr/bin/env python3
"""SPARK — S110 P5 (Batch D) — matte the imagen art keepers to clean TRANSPARENT sprites.

The keepers are imagen-4-ultra stills on a UNIFORM WHITE background (RGB, no alpha). The owner's
burned history (S106 audit) is the trap to avoid: a naive luma/white key removes ALL bright pixels,
which (a) punches HOLES in the character's light parts (Voltkin belly #FFEB6B, Helga apron/stein foam)
and (b) leaves a visible "square" matte. THE FIX: remove only the BACKGROUND-CONNECTED white — flood
from the border via connected-component labelling — so interior whites stay opaque and there is NO box.

Pipeline per keeper: near-white mask -> scipy label -> drop only components touching the border ->
soft 1px alpha feather -> tight-crop to the alpha bbox (kills the transparent margin = no box) ->
downscale to a runtime size -> save RGBA PNG into public/godly/ (served as a separate static file, so
it is NEVER bundled into the JS entry chunk; the renderer lazy-loads it via Assets.load).

Also writes a dark-background PREVIEW composite to the desktop so the owner can eyeball the clean matte.

Run from repo root: python scripts/matte-art-keepers.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = Path("C:/Users/onesh/OneDrive/Desktop/SPARK_Batch_D_art_spike_S109")
OUT_DIR = ROOT / "public" / "godly"
PREVIEW_DIR = Path("C:/Users/onesh/OneDrive/Desktop/SPARK_Batch_D_matte_preview_S110")

WHITE_TOL = 18      # a pixel within this L2 distance of pure white is "candidate background"
FEATHER_PX = 1.2    # gaussian blur on the alpha edge to avoid a hard white fringe
RUNTIME_MAX = 512   # max dimension of the runtime sprite (downscaled; plenty for in-world + codex)

# (source file, output path under public/godly/)
KEEPERS = [
    ("voltkin_idle_A_ONMODEL.png",        "voltkin/anim/voltkin-idle.png"),
    ("voltkin_zap_A_ONMODEL_keeper.png",  "voltkin/anim/voltkin-zap.png"),
    ("helga_B_stein_slap-ready_keeper.png", "helga/helga.png"),
]


def matte(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGB")
    arr = np.asarray(im).astype(np.float32)  # float32 avoids the int16 overflow on (0-255)^2
    # L2 distance to pure white per pixel.
    dist = np.sqrt(((arr - 255.0) ** 2).sum(axis=2))
    candidate = dist <= WHITE_TOL  # near-white pixels (bg + any interior whites)

    # Label connected near-white regions; keep ONLY the ones that touch the image border as background.
    labels, n = ndimage.label(candidate)
    border = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border.discard(0)
    bg = np.isin(labels, list(border))  # background = border-connected near-white ONLY

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    out = Image.fromarray(np.dstack([np.asarray(im), alpha]), "RGBA")
    # Soft feather on the alpha so the cut edge isn't a hard jaggie (no white fringe halo).
    a = out.split()[-1].filter(ImageFilter.GaussianBlur(FEATHER_PX))
    out.putalpha(a)

    # Tight-crop to the opaque bbox → removes the transparent margin entirely (the "no box" guarantee).
    bbox = out.split()[-1].getbbox()
    if bbox:
        out = out.crop(bbox)
    # Downscale to the runtime size (aspect-preserving).
    out.thumbnail((RUNTIME_MAX, RUNTIME_MAX), Image.LANCZOS)
    return out


def main() -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for src_name, out_rel in KEEPERS:
        src = SRC_DIR / src_name
        matted = matte(src)
        dst = OUT_DIR / out_rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        matted.save(dst)
        # opaque-pixel fraction = a quick sanity number (too low => over-keyed/holes).
        a = np.asarray(matted.split()[-1])
        opaque_frac = (a > 16).mean()
        print(f"OK {src_name} -> public/godly/{out_rel}  {matted.size}  opaque={opaque_frac:.1%}  {dst.stat().st_size//1024}KB")
        # dark-bg preview composite for owner eyeball.
        bgp = Image.new("RGBA", matted.size, (24, 24, 30, 255))
        bgp.alpha_composite(matted)
        bgp.convert("RGB").save(PREVIEW_DIR / f"PREVIEW_{Path(out_rel).name.replace('.png','')}_on_dark.png")
    print(f"\nPreviews (eyeball the clean matte / NO box): {PREVIEW_DIR}")


if __name__ == "__main__":
    main()
