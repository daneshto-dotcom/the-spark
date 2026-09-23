# BAT SWARM — art intake, measured S187

Vampire **level 10** racial: the tier-3 bat tower becomes a **bat swarm** generator.
Stats: **6×** the base tier-3 unit — owner, *"whatever we did for the piranha, we double that"*
(piranha L5 = 3×, so this is 6×).

## ⛔ USE `sheet-die-v2`. `sheet-die-v1` IS UNUSABLE.

| sheet | transparency | verdict |
|---|---:|---|
| `sheet-fly` | 44.6 % | usable |
| `sheet-attack` | 21.0 % | usable |
| **`sheet-die-v1`** | **0.0 %** | ⛔ **REJECT** |
| `sheet-die-v2` | 16.2 % | ✅ use this one |

The owner suspected v1 — *"he made too much red around the image… it might look weird if it's still
within a black frame"*. He was right, and the reason is worse than a colour problem: **v1 has no
alpha content whatsoever.** It is a fully opaque image with a magenta wash edge-to-edge and a grey
grid baked into the pixels. Composited on the board it would draw as a solid magenta rectangle, not
a swarm. No matte pass recovers that — the bats were never separated from the background.

## ⚠ THE FOUR SHEETS DO NOT SHARE A GRID

`sheet-fly` reads as **8 × 3**; `sheet-attack` and both `die` sheets read as **6 × 4**. All are
1536 × 1024, so the cell size differs per sheet (192 × 341 against 256 × 256). The packer takes a
fixed stride and cannot infer this, so a re-roll must pin ONE layout across all four.

## ⚠ AND EVERY SHEET TOUCHES ITS CELL EDGES

Measured at both candidate layouts, 15–24 of 24 frames touch an edge on every sheet. For a
character that is fatal (`ART_PIPELINE.md`: amputation is the unrecoverable class). For a SWARM it
is softer — the boundary is wispy bats rather than a limb — but the cloud is still being cut, and
the frames where it matters are the death ones, where the dispersal is the whole point.

## What to ask for on a re-roll

Same three fixed blocks as the corpse eater (`../../race-tier9-bosses/zombie-corpse-eater/PROMPTS.md`),
with the grid pinned to **6 columns × 4 rows = 24 frames** on all four sheets, and the swarm sized to
about **70 %** of the cell so the dispersal has somewhere to go.
