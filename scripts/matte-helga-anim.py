#!/usr/bin/env python3
"""SPARK — S112 — matte HELGA's 3 veo clips (idle/walk/slap) into ONE transparent animation atlas.

The owner approved her veo (AI image-to-video) clips as her in-world character. This bakes them,
OFFLINE, into a single static atlas PNG + manifest that the renderer tick-indexes (replay-safe,
zero-API, lazy-loaded from public/ ⇒ NEVER bundled into the JS entry chunk). S110 `matte-art-keepers`
precedent (border-connected-component matte = interior whites safe, NO box) extended for VIDEO:

  Per clip: ffmpeg-extract frames → skip the first SKIP_HEAD ramp-in frames (veo's seed→motion
  transition carries a gray checkerboard artifact) → sample FRAMES_PER_STATE evenly from the stable
  window → matte each (remove ONLY the border-connected white bg AND the gray floor drop-shadow via a
  low-saturation∧bright candidate + scipy border-flood; interior whites/creams stay opaque) → feather.

  Δ2 (Council): align every frame on a SHARED, FOOT-ANCHORED fixed canvas (NOT per-frame bbox crop —
  that would make her jitter/teleport in world space). Each frame's alpha bbox is pasted bottom-center
  so her FEET sit on a constant baseline; the renderer anchors the sprite at that baseline ⇒ planted
  feet, body bob preserved, impact aligns with the synced strike pos.

  Pack: one ROW per state (idle row 0, walk row 1, slap row 2), FRAMES_PER_STATE columns, fixed cell.
  Manifest JSON drives the renderer (cell size, foot anchor, per-state frame count + loop cadence).

Also writes a dark-background PREVIEW montage to the OneDrive desktop so the owner can eyeball the
clean matte BEFORE it is wired (matte-art-keepers precedent — the owner's S106 checkerboard burn).

Run from repo root:  python scripts/matte-helga-anim.py
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets-source" / "godly-helga"
OUT_DIR = ROOT / "public" / "godly" / "helga" / "anim"
PREVIEW_DIR = Path("C:/Users/onesh/OneDrive/Desktop/HELGA_atlas_preview_S112")

# state -> (source clip, frame count, ticks-per-frame for LOOP states; slap is FSM-phased so its
# cadence is computed in the renderer from WINDUP/FIRE/RECOVER, ticksPerFrame here is advisory).
STATES = [
    ("idle", "idle.mp4", 12, 7),
    ("walk", "walk.mp4", 12, 4),
    ("slap", "slap.mp4", 12, 3),
]

SKIP_HEAD = 8        # drop the veo ramp-in frames (seed→motion transition / gray checker artifact)
SKIP_TAIL = 4        # drop the last few (often a settle/fade)
S_TOL = 0.22         # a pixel with saturation below this is "achromatic" (white bg OR gray shadow)
V_TOL = 0.32         # ...and value above this = bg/floor/shadow. Low enough to flood the whole soft
                     # drop-shadow (its dark core sits ~0.35), still well above her near-black outline
                     # (~0.1) and protects her colored (saturated) + interior (non-border) light parts.
FEATHER_PX = 1.1     # soft alpha edge (no hard white fringe)
CELL_H = 256         # runtime cell height (downscaled; in-world she renders ~80px, plenty)
SIDE_MARGIN = 12     # transparent px on each side of the shared canvas
TOP_MARGIN = 12
BOTTOM_MARGIN = 10   # px below her feet on the shared canvas (foot baseline)


def extract_frames(clip: Path, tmp: Path) -> list[Path]:
    """ffmpeg-extract every frame of a clip to PNGs; return the sorted list."""
    out = tmp / f"{clip.stem}_%04d.png"
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(clip), "-vsync", "0", str(out)],
        check=True, capture_output=True,
    )
    return sorted(tmp.glob(f"{clip.stem}_*.png"))


def select_frames(frames: list[Path], n: int) -> list[Path]:
    """Evenly sample n frames from the stable window [SKIP_HEAD : len-SKIP_TAIL]."""
    lo, hi = SKIP_HEAD, max(SKIP_HEAD + n, len(frames) - SKIP_TAIL)
    window = frames[lo:hi] or frames
    if len(window) <= n:
        return window
    idx = [round(i * (len(window) - 1) / (n - 1)) for i in range(n)]
    return [window[i] for i in idx]


def matte_rgba(src: Path) -> Image.Image:
    """Border-flood matte: remove only background-connected achromatic-bright pixels (white bg + gray
    floor shadow). Interior whites/creams (apron, foam, blouse) are protected (not border-connected)."""
    im = Image.open(src).convert("RGB")
    arr = np.asarray(im).astype(np.float32) / 255.0
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    candidate = (sat < S_TOL) & (mx > V_TOL)  # achromatic & bright = bg / floor / light shadow

    labels, _ = ndimage.label(candidate)
    border = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border.discard(0)
    bg = np.isin(labels, list(border))  # ONLY the border-connected achromatic-bright region

    # Drop stray opaque specks (veo/compression noise in the margins that isn't achromatic-bright, so
    # the bg flood spares it): keep only the significant foreground components = her silhouette. This
    # is what keeps the alpha bbox tight to HER (not a noise pixel near the frame edge).
    fg = ~bg
    fg_labels, nfg = ndimage.label(fg)
    if nfg >= 1:
        comp = np.bincount(fg_labels.ravel())[1:]  # size per component label 1..nfg
        if comp.size:
            keep_min = max(3000.0, comp.max() * 0.03)
            keep_ids = np.nonzero(comp >= keep_min)[0] + 1
            fg = np.isin(fg_labels, keep_ids)
    alpha = np.where(fg, 255, 0).astype(np.uint8)
    out = Image.fromarray(np.dstack([np.asarray(im), alpha]), "RGBA")
    a = out.split()[-1].filter(ImageFilter.GaussianBlur(FEATHER_PX))
    out.putalpha(a)
    return out


def main() -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        # --- PASS 1: matte every selected frame, record each one's tight content bbox ---
        per_state: dict[str, list[Image.Image]] = {}
        max_w = max_h = 0
        for name, clip, count, _tpf in STATES:
            sel = select_frames(extract_frames(SRC_DIR / clip, tmp), count)
            mats: list[Image.Image] = []
            for f in sel:
                m = matte_rgba(f)
                bbox = m.split()[-1].getbbox()
                if bbox is None:
                    bbox = (0, 0, m.width, m.height)
                content = m.crop(bbox)
                mats.append(content)
                max_w = max(max_w, content.width)
                max_h = max(max_h, content.height)
            per_state[name] = mats
            print(f"  matted {name}: {len(mats)} frames, max content so far {max_w}x{max_h}")

        # --- shared FOOT-ANCHORED canvas (Δ2): every frame placed feet-on-baseline, h-centered ---
        canvas_w = max_w + 2 * SIDE_MARGIN
        canvas_h = max_h + TOP_MARGIN + BOTTOM_MARGIN
        cell_w = round(CELL_H * canvas_w / canvas_h)
        foot_anchor_y = (canvas_h - BOTTOM_MARGIN) / canvas_h
        print(f"  shared canvas {canvas_w}x{canvas_h} -> cell {cell_w}x{CELL_H}, footAnchorY={foot_anchor_y:.4f}")

        n_cols = max(c for _n, _c, c, _t in STATES)
        atlas = Image.new("RGBA", (cell_w * n_cols, CELL_H * len(STATES)), (0, 0, 0, 0))
        manifest: dict = {
            "cellW": cell_w, "cellH": CELL_H,
            "footAnchor": {"x": 0.5, "y": round(foot_anchor_y, 4)},
            "states": {},
        }

        for row, (name, _clip, count, tpf) in enumerate(STATES):
            mats = per_state[name]
            preview_cells = []
            for col, content in enumerate(mats):
                canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
                px = (canvas_w - content.width) // 2
                py = canvas_h - BOTTOM_MARGIN - content.height
                canvas.alpha_composite(content, (px, py))
                cell = canvas.resize((cell_w, CELL_H), Image.LANCZOS)
                atlas.alpha_composite(cell, (col * cell_w, row * CELL_H))
                preview_cells.append(cell)
            manifest["states"][name] = {"row": row, "frames": len(mats), "ticksPerFrame": tpf}

            # dark-bg preview strip for this state (owner eyeball)
            strip = Image.new("RGBA", (cell_w * len(preview_cells), CELL_H), (24, 24, 30, 255))
            for i, c in enumerate(preview_cells):
                strip.alpha_composite(c, (i * cell_w, 0))
            strip.convert("RGB").save(PREVIEW_DIR / f"PREVIEW_{name}_on_dark.png")

        atlas_path = OUT_DIR / "helga-atlas.png"
        atlas.save(atlas_path)
        (OUT_DIR / "helga-anim.json").write_text(json.dumps(manifest, indent=2))

        # opaque-fraction sanity (too low => over-keyed holes)
        opaque = (np.asarray(atlas.split()[-1]) > 16).mean()
        print(f"\nOK atlas {atlas.size} ({atlas_path.stat().st_size // 1024} KB) opaque={opaque:.1%}")
        print(f"manifest: {json.dumps(manifest)}")
        print(f"PREVIEW (eyeball the clean matte / NO box / NO shadow smudge): {PREVIEW_DIR}")


if __name__ == "__main__":
    main()
