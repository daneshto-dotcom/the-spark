"""SPARK — S188 P11 — cut a footer SKILL ICON from an upgrade card's picture.

Owner: *"the skill has to have the art of the picture, just like a lot smaller, right? It's like a
little square … World of Warcraft? You can see your skills in like little squares on the bottom
left."*

A card (`assets-source/upgrade-cards/*.png`, 1254 x 1254) carries its title BAKED into the top band.
The icon is the PICTURE, so the cut starts BELOW that band and takes the largest square that fits,
centred horizontally, then downsamples (Lanczos) to a small square WebP.

    python scripts/cut-skill-icon.py <card.png> <out.webp> [--top PX] [--side PX] [--size PX]
    python scripts/cut-skill-icon.py --preset power-of-ra      # or wrath-of-ra: the shipped cuts

`--top` is where the title band ends in SOURCE pixels, `--side` the square's edge (default: all the
height left below the band). ⚠ MINE, chosen by eye from three candidates rendered side by side:
on `l0-mummies.png` the title glyphs end at ~y 305, and the full-height square (934 px) cut the
Eye of Ra in half at 46 px. The shipped cut is `--top 310 --side 700` (x 277..977, y 310..1010):
the Eye of Ra and its column of light, no title glyph in frame. `--size` 128 gives ~2.8x the 46 px
slot for high-DPI screens.

⭐ S190 (audit W-5) — EVERY CARD HAS ITS OWN WINDOW, in `CUTS` below. The WRATH icon used to be cut at
RUNTIME from the whole l10 card with the l0 card's proportions, which sliced its three eyes of Ra down
to the middle beam — the "times three" the picture exists to show. `l10-mummies.png` is an 848 px
master with a different composition (title ends ~y 90, three eyes across the full width at y ~105-300),
so its window is its own: `--top 96 --side 752` (x 48..800), all three eyes and beams. ⚠ MINE, chosen
by eye against three alternatives. `src/render/skillIcons.test.ts` pins this table.

Needs Pillow with WebP (`pip install Pillow`). Reproducible: same inputs, same bytes.
"""

import argparse
import sys

from PIL import Image

# The shipped cuts, one window PER CARD: name -> (source card, --top, --side). Source pixels.
CUTS = {
    "power-of-ra": ("assets-source/upgrade-cards/l0-mummies.png", 310, 700),
    "wrath-of-ra": ("assets-source/upgrade-cards/l10-mummies.png", 96, 752),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--top", type=int, default=310)
    ap.add_argument("--side", type=int, default=0)
    ap.add_argument("--size", type=int, default=128)
    ap.add_argument("--preset", choices=sorted(CUTS))
    a = ap.parse_args()
    if a.preset is not None:
        a.src, a.top, a.side = CUTS[a.preset]
        a.out = f"public/art/skills/{a.preset}.webp"
    if a.src is None or a.out is None:
        ap.error("give <card.png> <out.webp>, or --preset")

    im = Image.open(a.src).convert("RGB")
    w, h = im.size
    side = a.side if a.side > 0 else min(w, h - a.top)
    side = min(side, w, h - a.top)
    if side <= 0:
        print(f"--top {a.top} leaves no picture in a {w}x{h} card", file=sys.stderr)
        return 2
    left = (w - side) // 2
    crop = im.crop((left, a.top, left + side, a.top + side))
    icon = crop.resize((a.size, a.size), Image.LANCZOS)
    icon.save(a.out, "WEBP", quality=88, method=6)
    print(f"{a.src}: cut x {left}..{left + side}, y {a.top}..{a.top + side} -> {a.out} ({a.size}px)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
