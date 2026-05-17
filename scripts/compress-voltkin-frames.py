#!/usr/bin/env python3
"""SPARK — Voltkin animation-frame asset pipeline (S36 P1).

Compresses raw Imagen WINNER PNGs from `assets-source/` down to shippable
512x512 RGBA PNGs in `public/godly/voltkin/sprites/`, optimize=True for
zlib-level PNG compression. Target: <=200 KB each for the 5 new frames.

Run from repo root:
    python scripts/compress-voltkin-frames.py

Reproducible: future creatures (Anvil, PacPredator) can model this script.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets-source" / "godly-voltkin" / "notes" / "iterations"
DST_DIR = ROOT / "public" / "godly" / "voltkin" / "sprites"
TARGET_SIZE = (512, 512)

# Map from output filename -> source WINNER filename. Existing voltkin-zap.png
# is intentionally NOT in this list (S36 PRIME-AUDIT Delta7 — keep shipped
# 379 KB version, avoid style-drift risk).
FRAMES = {
    "voltkin-idle-1.png": "voltkin-idle-1-v3-cand0-WINNER-boxy.png",
    "voltkin-idle-2.png": "voltkin-idle-2-v2-cand0-WINNER.png",
    "voltkin-charge.png": "voltkin-charge-v2-cand0-WINNER.png",
    "voltkin-hurt.png": "voltkin-hurt-v1-cand1-WINNER.png",
    "voltkin-victory.png": "voltkin-victory-v1-cand0-WINNER.png",
}


def compress_one(src: Path, dst: Path) -> int:
    """Downscale + zlib-optimize a single sprite. Returns output bytes."""
    img = Image.open(src).convert("RGBA")
    img.thumbnail(TARGET_SIZE, Image.LANCZOS)
    img.save(dst, format="PNG", optimize=True, compress_level=9)
    return dst.stat().st_size


def main() -> None:
    DST_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Source: {SRC_DIR}")
    print(f"Dest:   {DST_DIR}")
    print()
    total = 0
    for dst_name, src_name in FRAMES.items():
        src = SRC_DIR / src_name
        dst = DST_DIR / dst_name
        if not src.exists():
            print(f"!! MISSING: {src}")
            continue
        src_size = src.stat().st_size
        size = compress_one(src, dst)
        total += size
        ratio = size / src_size * 100
        print(
            f"{dst_name:24}  {src_size:>10,} -> {size:>8,} bytes "
            f"({size/1024:5.1f} KB, {ratio:4.1f}% of source)"
        )
    print(f"\nTOTAL: {total:,} bytes ({total/1024:.1f} KB)")


if __name__ == "__main__":
    main()
