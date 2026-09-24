"""S188 P2 — build the runtime upgrade cards from the owner's source art.

Reads  assets-source/upgrade-cards/<name>.png   (1254 x 1254, or 784 x 756 for the cropped Grok five)
Writes public/art/upgrade-cards/<name>.webp     (CARD_W x CARD_H, lossy WebP)

The draft tile is 251 x 242 (draftOverlay.ts: PANEL_W 559 x PANEL_H 270, split in two, 14 px pad).
A card ships at 2x that, so it stays sharp on a HiDPI canvas without shipping the 2 MB source.

COVER-FIT, TOP-ANCHORED. Every card has its NAME baked into the top band (MANIFEST.md), so the
crop is spent on the bottom edge and never on the lettering. A square source loses ~3.6 % of its
height off the bottom; a 784 x 756 source is already the tile's ratio and loses nothing.

l10-vampires (THE SWARM) is deliberately NOT built: level 10 has no mechanic, and a card cannot
precede its mechanic (S188 brief P2, item 8). The two -alt files are the owner's kept alternates,
not runtime art.

Usage:  python scripts/build-upgrade-cards.py
Exit:   0 every card written; 1 a source is missing or unreadable.
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-source" / "upgrade-cards"
OUT = ROOT / "public" / "art" / "upgrade-cards"

# The tile, from draftOverlay.ts's generalTileRect(), and the 2x it ships at. MINE, not the owner's.
TILE_W, TILE_H = 251, 242
CARD_W, CARD_H = TILE_W * 2, TILE_H * 2
# Lossy WebP quality. MINE: 82 keeps the baked lettering crisp at 2x and holds each card under
# ~100 KB. The source PNGs stay in assets-source/ as the lossless masters.
QUALITY = 82

CARDS = [
    "general-hp", "general-def", "general-atk", "general-pen",
    "l0-vampires", "l0-zombies", "l0-mummies", "l0-orcs", "l0-demons", "l0-nagas",
    "l5-vampires", "l5-zombies", "l5-mummies", "l5-orcs", "l5-demons", "l5-nagas",
]


def cover_fit_top(im: Image.Image, w: int, h: int) -> Image.Image:
    """Scale so the image COVERS w x h, centre it horizontally, and anchor it to the TOP."""
    sw, sh = im.size
    s = max(w / sw, h / sh)
    nw, nh = max(w, round(sw * s)), max(h, round(sh * s))
    scaled = im.resize((nw, nh), Image.LANCZOS)
    x0 = (nw - w) // 2
    return scaled.crop((x0, 0, x0 + w, h))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    failed = 0
    total = 0
    for name in CARDS:
        src = SRC / f"{name}.png"
        if not src.exists():
            print(f"   XX   {name}: missing source {src}")
            failed += 1
            continue
        im = Image.open(src).convert("RGB")
        card = cover_fit_top(im, CARD_W, CARD_H)
        dst = OUT / f"{name}.webp"
        card.save(dst, "WEBP", quality=QUALITY, method=6)
        kb = dst.stat().st_size / 1024
        total += dst.stat().st_size
        print(f"   OK   {name:<14} {im.size[0]}x{im.size[1]} -> {CARD_W}x{CARD_H}  {kb:6.1f} KB")
    print(f"[cards] {len(CARDS) - failed}/{len(CARDS)} written, {total / 1024:.1f} KB total")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
