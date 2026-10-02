**STATUS: IN-PROGRESS — S194 T10 `s194/matchboard` (END-OF-MATCH STAT BOARD v2).**

# S194 T10 — progress

## NEXT STEP (PAUSED by owner session limit — resume here)
EXACT NEXT STEP: write `src/render/matchBoard.ts` v2 (the Pixi view) against the NEW `matchBoardModel.ts`
(committed) and NEW `matchBoardLayout.ts` (committed): tabs OVERVIEW / GRAPHS / one page per seat; overview =
table (status column, badge under the name, rows clickable -> player page) + SCORE RACE lines with hover
crosshair; GRAPHS = 2x2 (damage per wave grouped bars, built-standing stacked area, kills per wave stacked bars,
who-hit-whom heatmap); PLAYER page = header band, 6 KPI tiles, UNITS ledger (icon + raised/lost/killed),
DAMAGE dealt/taken split units/structures/keep, DEALT TO / TAKEN FROM bars, per-wave dealt-up / taken-down
ledger chart. Tooltip overlay (pure `tooltipFor`), keys ArrowLeft/Right/Tab via `handleKey`, CONTINUE/R + ARM_MS
unchanged, `setPortraitSource` for unit icons (MatchBoardHost passes it through; main.ts one setter line).
Then: update `matchBoardModel.test.ts` (line ~124 seat literal lacks the v2 fields -> typecheck currently RED
there, expected), `matchBoard.test.ts`, new `matchBoardLayout.test.ts` (inside/outside every rect), recorder
tests for lost / dealtTo / keep-structure split / cumulative samples, re-measure `matchStats.wire.test.ts`
(in-window bound 8 KiB will likely need re-pinning with the measured number).
HALF-DONE: model + layout written and committed; view NOT started; tests NOT updated.
GATES LAST RUN: `npm run typecheck` exit 1 — only `matchBoardModel.test.ts:124` (old SeatMatchStats literal)
and the uncommitted scratch probe `src/state/zzProbeMatch.test.ts` (DELETE it before gates; never commit it).
No vitest / build run yet on v2. No background processes running.

## Log
- Step 0 — worktree at master `18560cd8` (merge: already up to date, no conflicts). `npm install` exit 0.
- Step 1 — research + the data-oddity probe (below). Commit: research.

## 1 · Comparative research — patterns worth copying (≤30 min, S194)
Sources: Dota 2 post-game (scoreboard / graphs / breakdowns tabs), SC2 score screen + replay overlay
(income / units / production / army tabs), Legion TD 2 per-wave stats (leak value, value per wave), AoE2
timeline/achievements screen, LoL / Valorant scoreboards. The S179 research (no composite MVP, one row per
player, a survival marker, per-WAVE x axis) still governs.

1. **Tabs, not one wall** (Dota: Scoreboard · Graphs · Breakdown; SC2: Overview · Units · Structures ·
   Income · Production). The first tab answers "who won and how close"; detail is one click away.
2. **A per-player page** (Dota's hero detail / SC2's per-player production row): what THIS seat built, by
   type, with what it lost of each — the "built vs lost" pair is SC2's most-read panel.
3. **Different questions get different chart forms.** Dota's net-worth graph is LINES (a race over time);
   LTD2 shows per-wave quantities as BARS (each wave is its own event, not a running total); AoE2's
   timeline is a STACKED AREA (share of the whole). Two line charts of two running totals look identical
   — that is exactly what the owner saw.
4. **Damage breakdown by target** (Dota Breakdowns: damage dealt TO each enemy hero) → a who-hit-whom
   4×4 heatmap, and per player a dealt-to / taken-from split.
5. **Damage split by what it landed on** (Dota splits by source; LoL by physical/magic/true) → for SPARK:
   vs UNITS · vs STRUCTURES · vs KEEP. This is also what explains the owner's 70,847 (see §2).
6. **One crosshair across the chart on hover** (Dota/LTD2 graphs): a vertical wave marker with every
   seat's value at that wave in a tooltip, rather than one dot at a time.
7. **Headline per row, never a composite score** (LoL/Valorant "badges" done the S179 way): each row
   gets AT MOST one distinction it actually leads in (MOST KILLS, MOST DAMAGE, MOST UNITS, IRON KEEP …).
8. **Click a row to drill in** (Dota / SC2): the overview row IS the link to that player's page.

## 2 · The data oddity — TAKEN 70,847 / DEALT 76,112 vs ~2,000 — VERDICT: no counting bug found; most likely REAL
Probe: a scratch vitest (`zzProbeMatch`, never committed) ran four real 4-seat host-tick bot matches
(HARD×3, NOOB×3, MID×3, MID/IMBA/NOOB; up to 144k ticks) wrapping `recordDamage` with a call-site tally.
- Every recording site is capped at what the pool actually lost (castle after DEF + clamp; creature
  `before − max(0, ehp)`; connector banked in full only while the pool holds, break records
  `landed − remainder` and the carry re-records only the remainder — no double count). The probes' totals
  were 851–7,320 per seat, consistent with ~30 fifths per unit killed.
- The bots in a headless rig never ignited a tower (`towersBuilt` 0 in all four), so the owner's exact
  numbers did not reproduce. The MOST LIKELY mechanism (arithmetic, not reproduced) is the KEEP: `castleRegen.ts` heals
  25–45 per second (level 1–5 of 2,500) through BUILD and FIGHT, so a keep under siege for a whole match
  absorbs ~3,000+ a wave, and every one of those is real applied damage. 20 waves × ~3,500 ≈ 70k.
  The seat that shows DEALT 76k is the one whose units/raids were chewing that keep.
- It READS like a bug because the keep's pool is the canon's one deliberate off-ladder exception and it
  regenerates. Fix (v2, below): DEALT/TAKEN are split by what they landed on — UNITS · STRUCTURES · KEEP —
  so a 70k siege shows as "KEEP 66,000" instead of an unexplained wall.
