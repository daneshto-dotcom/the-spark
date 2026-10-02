**⏸ PAUSED (owner session limit) during the T10 AUDIT fix round. Resume here.**

## NEXT STEP (exact)
Re-run `npm run e2e:gating` on this worktree's own port (`> .tmp-gates/a-e2e.log 2>&1; echo $? > .tmp-gates/a-e2e.exit`).
It was STOPPED by the pause at 13 tests passed, 0 failed, so it has no verdict yet. After that: optionally retake the
screenshots (`node .tmp-gates/shots.mjs` against `npx vite --port 31947`) to show the labelled WAVE BY WAVE axis, then
the final report.
- Audit items DONE and committed in `3ca9cdea` (merged master `edce64ba` first, no conflicts):
  - MED-1: MONSTERS seat, and a who-hit-whom grid whose rows sum to DEALT and columns to TAKEN.
  - LOW-1: HELL, radial clears and the Pharaoh ritual end are recorded; self-detonations are recorded as neither.
  - LOW-3: the ledger axis now has DEALT/TAKEN labels.
  - LOW-2: 60-wave wire pin.
  - MINE #2 wording corrected.
- NOTHING half-done in source.
- GATES LAST RUN on `3ca9cdea`:
  - typecheck **0**
  - vitest **0**: 529 files / 7,995 tests passed, 4 files / 11 tests skipped
  - build **0**: entry 1136.0 KiB, headroom 114.0; lazy chunk 29.03 kB / 11.04 kB gzip
  - e2e:gating: **INTERRUPTED** (13 ok, 0 failed when stopped)
- Entry delta against the NEW master was NOT measured (master grew; S194 pre-audit delta was +1.9 KiB vs 1121.9).
- No background processes left running (playwright, its vite on 25283, esbuild and worker stopped by PID).

**STATUS: DONE (awaiting merge) — S194 T10 `s194/matchboard` (END-OF-MATCH STAT BOARD v2).**

# S194 T10 — FINAL REPORT (top of file, per S194_AGENT_RULES)

- **Tip:** see `git log -1 s194/matchboard` (this commit). Branch base master `18560cd8`; `git merge master` = already up to date, **no conflicts**.
- **Gates** (exit codes captured to files in `.tmp-gates/`, never through a pipe):
  - `npm run typecheck` → **0**
  - `npx vitest run --maxWorkers=3` → **0**: 522 files passed / 4 skipped; 7,893 tests passed / 11 skipped. Run before the last two cosmetic commits. Those two (tooltip wording, neutral loss colour) were re-verified with the board files (43/43) plus typecheck and build.
  - `npm run build` → **0**: entry **1123.8 KiB** (cap 1250, headroom 126.2). That is **+1.9 KiB** over the rules' stated master entry of 1121.9. The cause is the eager recorder fields, the host passthroughs and the main.ts lines. The board stays a LAZY chunk: `matchBoard-*.js` **28.19 kB / 10.64 kB gzip** (v1 was 7.9 / 3.5).
  - e2e on this worktree's own hashed port: `npx playwright test e2e/exit-match.spec.ts` → **0**, 12/12. The full `e2e:gating` lane was NOT run.
- **Bump verdict: NO bump of its own.** The S186 test asks whether two builds that shake hands can disagree about anything either computes. They cannot: every new counter is INERT, and no reducer reads `World.matchStats` (reach-checked: only renderer + save/hash). The new seat keys are additive-optional and absent at zero. The history keeps the S191 keys and adds one optional `v` array per point, so an S191 peer still draws its two graphs from an S194 host, and an S194 peer reads an S191 host as zeros. `recordDamage` gained a required `on` argument, which is a call-site type and never serialized.
- **Wire, re-measured** (`matchStats.wire.test.ts`, 4 seats × 8 types × 30 waves): totals **2,503 B** (S191: 1,527), history in its window **11,101 B** (S191: 6,765). Named keys per point measured 13,697 B, which is why the wire form packs them as `v`. Bounds re-pinned to 3 KiB / 12 KiB.
- **Screenshots:** `C:\Users\onesh\OneDrive\Desktop\SPARK_S194_MatchBoard\` (01–10), copied from `.tmp-gates/shots/`. Data comes from a REAL headless 4-seat host-tick bot match (HARD×3, seed 0x5194, won by BOT 2 on score in wave 7), injected into a dev build on port 31947 and shot by a Playwright script.

## MINE (owner questions, one line each, with a recommendation)
1. Badges: one per row, only for a stat it LEADS outright (MOST KILLS > MOST DAMAGE > BIGGEST ARMY > MASTER BUILDER > KEEP BREAKER > IRON WALL = peak connectors); ties award nothing. Recommend keeping it. It is not an MVP blend (S179 rule). Lever: `BADGE_CATEGORIES`.
2. UNITS LOST counts every death of the seat's units that a hit or a skill caused: enemy hits, its own side's blasts, unattributed hits, Archdemon HELL, a potato or hub clear, and the Pharaoh's ritual end. ⭐ Audit T10 LOW-1: a SELF-DETONATION (suicide goblin, lightning drone) is NEITHER a loss nor a kill, because the unit spent itself as a weapon and what it hit is already on the board. KILLS go to an enemy seat only: HELL credits the demon's seat, a hub clear the hub owner, and a potato nobody (the sim never records who planted it). Recommend keeping it.
3. The board's charts: SCORE RACE (lines, overview); DAMAGE / KILLS PER WAVE (per-wave differences of the cumulative samples); BUILT, STANDING (stacked area of connectors, still `sampleBuilt`). Recommend he picks any he wants swapped once he has seen them live.
4. Keys ← / → / Tab page the board; R and CONTINUE are unchanged; the 1.2 s arm is unchanged.

## Merge seams
- `src/state/damage.ts`: 8 one-token edits (the target class at each `recordDamage`). Any branch adding a damage arm must pass `'unit' | 'structure' | 'keep'`; `tsc` forces it.
- `src/main.ts`: 2 small blocks (keydown forwarding before the R exit; `matchBoard.setPortraitSource(...)` after the ticker line). T5 ui-upgrade also edits main.ts, so check the keydown handler order after the merge.
- Canon (merge owner): add to the S191 stat-board section the v2 counters (lost, dealtTo, keep/structure split, `v` per wave point), the wire numbers above, and the pages. No new constant needs a canon pin (ARM_MS and HISTORY_WINDOW_TICKS are unchanged).
- Unit portraits use `goblinRenderer.portraitTexture` / `voltkinPortraitTexture`. In the injected-data screenshots the atlases were not loaded, so a lettered chip shows. In a real match the board's atlases are loaded and portraits should show; not verified live.

## NOT DONE
- The full `npm run e2e:gating` and `e2e:races` lanes (only exit-match.spec, 12/12).
- Owner's TAKEN 70,847 is not reproduced (headless bots never ignite towers). It is explained most likely by a regenerating keep (§2). The new KEEP / STRUCTURES / UNITS split will name the source on his next real board.

## Log
- Steps 3–7 (RESUME): v2 view, tooltips, keys, tests (+mutation tests: `'keep'`→`'unit'` at damage.ts:267 and dropping the `lost` bump both turn the suite red), screenshots, gates. Failed-command verdicts: the first dev server exited 1 with no error in its log while `npm run build` ran (benign: terminated, not crashed; restarted and used); a python edit script aborted on an assert (string escaping) and was redone with Edit, nothing was half-written; `vitest` touched `pentagramBuildability.test.ts.snap` (EOL-only, no diff, not committed).
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
