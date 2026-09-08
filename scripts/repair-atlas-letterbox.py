#!/usr/bin/env python3
"""SPARK — S168 P9 — REMOVE A SURVIVING VEO LETTERBOX FROM A SHIPPED SPRITE ATLAS.

## ⛔ Why this exists

Owner, on the live build: *"take a look at the kraken, he is moving within a black frame slightly
larger than his body do when he attacks it looks like he gets cut off. also he moves with a black box
frame/background around him. the creature need to be cut out so that he looks like he is actually
integrated within the map right?"*

He was looking at exactly one row of one atlas. Measured across all six bosses and all four states,
the opaque near-black fraction is 2.2–7.1 % everywhere — the ink outlines every cartoon has — except
`t9boss-nagas` ATTACK, which is **27 %**. Two perfectly solid black bars flank the Kraken in that
row: veo returned the attack clip pillarboxed.

## ⭐ Why the existing matte missed it, and why this does not just loosen that rule

`build-sprite-atlas.mjs` already kills border-connected near-black *"ONLY WHEN IT IS SHAPED LIKE A
BAR"*, and its own docblock explains, at length, why the shape test is there: S152 keyed on mere edge
contact, and since a cartoon's INK OUTLINE is also near-black and is ONE connected component, that
erased entire characters. The shape test is `h >= 0.90*H and w <= 0.15*W`.

The Kraken's bars are **0.84 of the height and 0.21 of the width**. They fail both halves, by a
little, in the safe direction — so nothing fired.

⛔ **The fix is NOT to widen those thresholds**, which is precisely the S152 trap. It is to test the
property that actually distinguishes a letterbox from linework: **SOLIDITY**. A letterbox bar fills
its own bounding box completely; a character's outline is a sprawling skeleton that fills almost none
of it. Measured on the real atlas:

    ATTACK cell 0  bar          28512 px   bbox 269x106   fill 1.00   <- letterbox
    ATTACK cell 0  bar          28245 px   bbox 269x105   fill 1.00   <- letterbox
    ATTACK cell 7  tentacle ink  5258 px   bbox 269x116   fill 0.17   <- MUST SURVIVE
    ATTACK cell 7  tentacle ink  1938 px   bbox  68x 69   fill 0.41   <- MUST SURVIVE
    IDLE / WALK / DIE            no border-connected dark component at all

1.00 against 0.41 is not a threshold that needs tuning. `SOLID_FILL_MIN = 0.90` sits in a gap wider
than either side of it.

## What it does

Per CELL (not per atlas — the grid comes from the `-anim.json` beside the png), find near-black
components that touch the cell border, keep only those that are both SOLID and LARGE, and clear their
alpha. Everything else is left byte-identical, which the caller is expected to verify.

Run from the repo root:

    python scripts/repair-atlas-letterbox.py public/art/race-tier9-bosses/t9boss-nagas-atlas.png
    python scripts/repair-atlas-letterbox.py --dry-run <path>...

Needs the pixel toolchain: pip install numpy scipy Pillow
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
    from scipy import ndimage
except ModuleNotFoundError as exc:  # pragma: no cover - environment guard
    # Same contract as check-atlas-scenery.mjs: exit 3 with ONE line, never a stack trace, so a
    # runner without the toolchain reports a missing dependency rather than looking like a defect.
    print(f"[repair-atlas] missing pixel toolchain ({exc.name}) — pip install numpy scipy Pillow")
    raise SystemExit(3)

# A pixel this dark is letterbox-CANDIDATE. Same threshold build-sprite-atlas.mjs uses, deliberately:
# two files disagreeing about what "near-black" means is how the next one of these hides.
DARK_MAX = 42
# Fraction of its own bounding box a component must fill to count as a BAR rather than as linework.
# Measured gap: bars 1.00, the worst surviving ink 0.41.
SOLID_FILL_MIN = 0.90
# And it must be big. A solid 3x3 speck touching the edge is not a letterbox.
MIN_CELL_FRACTION = 0.01


def repair_atlas(png: Path, dry_run: bool) -> int:
    """Returns the number of pixels cleared (0 = the atlas was already clean)."""
    meta_path = png.with_name(png.name.replace("-atlas.png", "-anim.json"))
    if not meta_path.exists():
        print(f"  SKIP  {png} — no {meta_path.name} beside it, so the cell grid is unknown")
        return 0

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    cw, chh = int(meta["cellW"]), int(meta["cellH"])
    img = Image.open(png).convert("RGBA")
    a = np.array(img)
    height, width = a.shape[0], a.shape[1]
    cols, rows = width // cw, height // chh
    cell_area = cw * chh

    row_of = {int(v["row"]): k for k, v in meta["states"].items() if "row" in v}
    cleared_total = 0

    for r in range(rows):
        cleared_row = 0
        for c in range(cols):
            y0, x0 = r * chh, c * cw
            cell = a[y0 : y0 + chh, x0 : x0 + cw]
            rgb, alpha = cell[..., :3], cell[..., 3]
            dark = (rgb.max(axis=2) < DARK_MAX) & (alpha > 0)
            if not dark.any():
                continue
            lab, _ = ndimage.label(dark)
            border = set(
                np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))
            )
            border.discard(0)
            for i in border:
                ys, xs = np.nonzero(lab == i)
                px = ys.size
                if px < MIN_CELL_FRACTION * cell_area:
                    continue
                bbox = (ys.max() - ys.min() + 1) * (xs.max() - xs.min() + 1)
                if px / bbox < SOLID_FILL_MIN:
                    continue  # linework, not a letterbox — this is the S152 lesson
                if not dry_run:
                    cell[..., 3][lab == i] = 0
                cleared_row += px
        if cleared_row:
            name = row_of.get(r, f"row{r}")
            print(f"  {'would clear' if dry_run else 'cleared'} {cleared_row:>8,} px  in {name}")
            cleared_total += cleared_row

    if cleared_total and not dry_run:
        Image.fromarray(a, "RGBA").save(png)
    return cleared_total


def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    targets = [Path(x) for x in argv if not x.startswith("--")]
    if not targets:
        print(__doc__)
        return 2
    total = 0
    for png in targets:
        print(f"[repair-atlas] {png}")
        if not png.exists():
            print("  MISSING")
            return 2
        total += repair_atlas(png, dry_run)
    verb = "would clear" if dry_run else "cleared"
    print(f"[repair-atlas] {verb} {total:,} px in total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
