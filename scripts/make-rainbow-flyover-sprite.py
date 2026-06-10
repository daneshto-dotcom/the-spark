"""S84 P2 — rainbow-flyover sprite: matte the Imagen character (white bg -> true alpha).

Descendant of scripts/matte-voltkin-frames.py (S83 P1) specialized for a CLEAN
generator PNG (no h264 noise, no checker cells): the background is near-pure
white, so the candidate mask is simply achromatic+bright, and background = the
border-connected candidate components (enclosed whites — eyes, teeth, band
highlights — are structurally safe, S83 lesson). 2px distance-transform feather
with per-pixel unmix against white; fully-transparent pixels get RGB zeroed
(premultiply-friendly, no resize halos). Downscales 1024 -> 512 (LEGACY_SPRITE_
SOURCE_PX convention) AFTER matting so the feather survives resampling.

Usage:
  python scripts/make-rainbow-flyover-sprite.py <src.png>
Writes public/godly/rainbow-flyover/rainbow-flyover.png and archives the
pristine source under assets-source/rainbow-flyover/. Verification probes run
always; non-zero exit on any failure.
"""

import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "godly" / "rainbow-flyover" / "rainbow-flyover.png"
ARCHIVE = ROOT / "assets-source" / "rainbow-flyover"

CHROMA_TOL = 10  # near-white: channel spread <= 10
LUM_MIN = 235    # near-white: max channel >= 235
FEATHER_PX = 2.0
OUT_SIZE = 512


def main() -> int:
    src = Path(sys.argv[1])
    im = Image.open(src).convert("RGB")
    rgb = np.asarray(im).astype(np.int16)
    h, w, _ = rgb.shape

    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.max(axis=2)
    candidate = (chroma <= CHROMA_TOL) & (lum >= LUM_MIN)

    # Background = candidate components touching the image border (8-conn).
    labels, n = ndimage.label(candidate, structure=np.ones((3, 3)))
    border_ids = np.unique(
        np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    )
    border_ids = border_ids[border_ids != 0]
    bg = np.isin(labels, border_ids)

    # Feather: alpha ramps 0 -> 255 over FEATHER_PX from the bg region.
    dist = ndimage.distance_transform_edt(~bg)
    alpha = np.clip(dist / FEATHER_PX, 0.0, 1.0)

    # Unmix the white bg out of feather pixels: c = a*fg + (1-a)*255.
    a = alpha[..., None]
    fg = np.clip((rgb.astype(np.float64) - (1.0 - a) * 255.0) / np.maximum(a, 1e-6), 0, 255)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    keep = alpha > 0
    out[..., :3][keep] = fg[keep].astype(np.uint8)
    out[..., 3] = (alpha * 255).round().astype(np.uint8)

    img = Image.fromarray(out, "RGBA").resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, ARCHIVE / src.name)

    # ── verification probes ────────────────────────────────────────────────
    res = np.asarray(img)
    fails: list[str] = []
    ring = np.concatenate([res[0, :, 3], res[-1, :, 3], res[:, 0, 3], res[:, -1, 3]])
    if ring.max() != 0:
        fails.append(f"border ring not fully transparent (max alpha {ring.max()})")
    frac = (res[..., 3] == 0).mean()
    if not (0.30 <= frac <= 0.85):
        fails.append(f"transparent fraction {frac:.2%} outside [30%, 85%] sanity band")
    # Enclosed whites survive: the source must contain interior near-white
    # candidate components (eyes/teeth) that stay opaque in the output.
    interior = candidate & ~bg
    n_interior = int(ndimage.label(interior, structure=np.ones((3, 3)))[1])
    if n_interior < 2:
        fails.append(f"expected >=2 enclosed white features (eyes/teeth), found {n_interior}")
    ys, xs = np.nonzero(interior)
    if len(ys) > 0:
        sy, sx = int(ys.mean()) * OUT_SIZE // h, int(xs.mean()) * OUT_SIZE // w
        if res[sy, sx, 3] < 200:
            fails.append(f"enclosed-white centroid probe alpha {res[sy, sx, 3]} < 200")
    # No background-tone survivors: opaque pixels that are still near-white AND
    # were border-connected would be matte failures; sample alpha>0 px adjacent
    # to the cleared region.
    edge_band = (ndimage.distance_transform_edt(res[..., 3] > 0) <= 1.5) & (res[..., 3] > 128)
    band_px = res[..., :3][edge_band].astype(np.int16)
    if len(band_px) > 0:
        whiteish = ((band_px.max(axis=1) >= 250) & (band_px.max(axis=1) - band_px.min(axis=1) <= 4)).mean()
        if whiteish > 0.10:
            fails.append(f"edge band {whiteish:.1%} pure-white survivors (>10%) — halo risk")

    print(f"[sprite] {OUT.relative_to(ROOT)} {OUT_SIZE}px transparent={frac:.1%} "
          f"interior-features={n_interior} size={OUT.stat().st_size // 1024}KB")
    if fails:
        for f in fails:
            print(f"[FAIL] {f}")
        return 1
    print("[sprite] all probes green")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
