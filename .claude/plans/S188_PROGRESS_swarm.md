# S188 P9 — `s188/swarm` — THE SWARM (vampires level 10) — PROGRESS (running file, updated every commit)

Base: `4b52fdd` (tip of `s188/racial-d`). Brief: the merge owner's P9 prompt (scope amendment, owner-approved S188).

| step | status |
|---|---|
| 0 · read PDR §0–§8 + BRIEF P7, canon §2/§3d, ART_PIPELINE, bat-swarm FINDINGS + TILE §2 | ✅ done |
| 1 · registry: `vampires.l10` in `racialPerks.ts` (+ generic `perkDraftIndex`) | ✅ wip commit 1 (BUILT still false) |
| 2 · mechanic: `t3BatSwarm` (bat ×6), promotion in `towerUnitForSeat`, every consumer | ✅ wip commit 1 — typecheck exit 0 |
| 3 · tests (`racial/theSwarm.test.ts`) + flip `RACIAL_PERK_BUILT['vampires.l10']` | ⏳ |
| 4 · art: swarm atlas (fly / attack / die) + renderer fallback to the bat | ⏳ |
| 5 · card `public/art/upgrade-cards/l10-vampires.webp` (502×484, q82, cover top-anchored) | ⏳ |
| 6 · gates: typecheck · vitest · build · check:atlas | ⏳ |

## Sheet study (measured this session, before any packing)

| sheet | layout | alpha | verdict |
|---|---|---|---|
| `sheet-fly.png` | 8×3 (192×341 cells), gutters clean | soft (44.6 % a=0, 12 % mid) | candidate |
| `sheet-fly-matted.png` | 6×4 (the S187 re-roll, border-flood matte) | HARD (0 / ≥244 only) | ⚠ enclosed WHITE pockets survive the flood fill — visible white blotches on the black board |
| `sheet-attack.png` | 6×4 | soft (21 % a=0) | the only attack sheet |
| `sheet-die-v1.png` | **5×5** | **0 % transparent** — opaque magenta wash + grey grid baked in | ⛔ unusable (confirms FINDINGS) |
| `sheet-die-v2.png` | 6×4 | soft (16 % a=0) | ✅ usable, BUT a grey 2-px grid is baked in at x=256k/256k+1, y=255+256k (alpha ≈ 39/20) — must be erased before slicing |
