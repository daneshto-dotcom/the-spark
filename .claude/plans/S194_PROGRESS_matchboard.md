**STATUS: IN-PROGRESS — S194 T10 `s194/matchboard` (END-OF-MATCH STAT BOARD v2).**

# S194 T10 — progress

## NEXT STEP
Step 2: extend `matchStats.ts` with the inert v2 counters (damage by target class, who-hit-whom, units lost,
cumulative per-wave fields), pass the class at every `recordDamage` site in `damage.ts`, re-pin tests.

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
