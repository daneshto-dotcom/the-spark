═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-08-20
Session: S149 — the owner rebuilt the batch mid-session; zones, phase split, walls, footer, arcade, FIX/SCRAP
═══════════════════════════════════════════════════════════

## PROJECT
- Working directory: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
- Branch: `master` · Latest commit: `a8028ec` · **0 unpushed**
- Stack: TypeScript · Pixi.js · Vite · Vitest · Playwright · Trystero/WebRTC · GitHub Pages
- **PROTOCOL_VERSION 27** (25 → 26 in P2, 26 → 27 in P6)

## CURRENT STATE
- Build: **PASS** — entry 710.7 KiB, cap 900 KiB, 189 KiB headroom
- Tests: **2,808 passing / 171 files** (session start: 2,506 / 162) · tsc **0**
- e2e: **50 passed / 3 skipped / 0 failed** (the 3 are `test.fixme`, see OPEN ISSUES)
- Deployment: **LIVE, deploy-verified 4/4** at `50a5c24`
- MCV: **203 assertions, verifier exit 0**

## THIS SESSION'S WORK

⚠ **The batch I opened with was discarded.** I had planned P3 CASTLE HP and had run a Council round
on it when the owner interrupted with a live playtest listing five defects. That became the session.

**P1 — ZONES ARE REAL.** Build legality was `isInsideEnemyTerritory`, a complexity-derived RADIUS
around your own structures — so a player with nothing nearby projected R=0 and *everywhere* was
legal. `canBuildAt` existed, was tested, and was wired into NOTHING. Swapped at all six gates. The
17 broken tests were resolved individually on merit; three findings a bulk fix would have buried
(a second 250px reach gate failing identically, an already-stale "ring" comment, and a test that
still passes but no longer for the reason it claims). New `zones.fixtures.ts` derives in-zone points
FROM the partition. New `buildLegalityGates.test.ts` (62 cases) — mutation-tested.

**P2 — THE PHASE SPLIT (protocol 25→26).** Four independent holes: gatherers, defenders and the
quarry read `matchPhase` NOWHERE. Gatherer shelter is a deterministic SNAP at `deadline − 60`
(a race would make the rule true only for upgraded gatherers). New `canBuildNow` composes WHERE +
WHEN once. Tower dormancy + target-clear at the FIGHT→BUILD edge. Quarry BUILD-only closes
CF-S148-a. ⚠ The frozen-reference differential gate fired and was RIGHT — fixed by ORDERING, not by
weakening it.

**P3 — BORDER WALLS.** Nothing in `src/render/` drew the partition at all. Walls are DERIVED from
`(layout, matchPhase)` — both already hashed — so zero new state and they cannot desync. Creature
dormancy folded in (flagged): creatures were still severing bonds during BUILD.

**P4 — THE FOOTER BAND (R36).** Tower selection indexed by connector count (4,5,6,7,8), derived from
the registry. Reverses the owner's own S136 ruling — flagged, then confirmed.

**P5 — ARCADE + the owner's P4 corrections.** ARCADE title button with NONET, touching zero sim
state. Then the owner's three P4 defects, all real and all fixed (see below).

**P6 — FIX/SCRAP + HUD COHERENCE (2 delegated agents, owner's request) + arcade fixes.**
FIX/SCRAP: survivors are a LIVE READ, so R21 needs no subtraction — damage cannot be laundered into
inventory. One hashed field on `Primitive` (4 sites, not the nine a World field costs). Five
mutations each confirmed red. HUD: seven defects found from measured stage dumps, including the
owner's headline one — the shape legend drawn INSIDE leaderboard row 0 (118×10px intersection).

**Owner corrections, each verified on disk at close:** NONET was INERT in arcade (my P5 bug — input
handlers still read `world.sudoku`); arcade played silent; footer cards now draw the tower SHAPE;
EVERY card is clickable and an unaffordable one ORDERS its shapes; `bringToFront` moved after the
last renderer; the castle's orphaned build caption. **Clock retuned to 90s BUILD / 45s FIGHT.**

## OPEN ISSUES
- **`e2e/click-to-build.spec.ts` — 3 tests are `test.fixme`.** STALE, not flaky: tower selection
  moved to the footer. Deliberately NOT `@quarantine-flaky` — mislabelling a stale test as flaky is
  how a real regression gets waved through. Rewrite recipe is in the file. **CF-S149-d.**
- **Arcade timed trial + leaderboard: model done and tested, UI NOT wired.** An honest half.
  **CF-S149-e, priority 1.**
- **P7 bots-build-towers NOT started** — the last of the five complaints. **CF-S149-f.**
- `e2e/rainbow.spec` + `bomb.spec` remain load-sensitive (3/3 pass isolated, ~1-in-3 in a loaded
  full lane). Measured, not assumed. **CF-S148-c.**
- CF-S149-a (quarry is an open hub — needs an owner DESIGN RULING) · CF-S149-b (wall clamp has no
  sim consumer; wiring it drops the opening economy 7+→5) · CF-S148-b/d · CF-S147-b/c/e · CF1 · CF3.

## BLOCKED ON
Nothing. ⚠ Owner is playtesting 2-player multiplayer with a friend and will report defects next
session — expect an interrupt-driven start.

## NEXT STEPS (priority order)
See the ordered 14-entry `carry_forward_next_session[]` in `.claude/session-state.json`.
**Immediate:** 1. arcade leaderboard UI · 2. click-to-build rewrite · 3. P7 bots build towers.
**Short-term:** 4. quarry-hub design ruling · 5. wall-clamp rim case.
**Medium:** castle HP / elimination (S150 spec, deferred this session) · walls→projectiles→goblin tower.

## CHANGED FILES
~90 files. Headlines: **new** `zones.fixtures.ts`, `buildLegality.ts`, `walls.ts`, `wallRenderer.ts`,
`footerBand.ts`, `footerBandModel.ts`, `arcadeOverlay.ts`, `arcadeScores.ts`, `structureRepair.ts`,
`structurePanel.ts`, plus `buildLegalityGates.test.ts`, `phaseSplit.test.ts`, `walls.test.ts`,
`hudLayout.test.ts`, `arcadeScores.test.ts`, `structureRepair.test.ts`.
**Modified:** the six build gates, `hostTick.ts`, `physicsLoop.ts`, `gathererLifecycle.ts`,
`defenderLifecycle.ts`, `castlePanel.ts`, `sudokuOverlay.ts`, `ui.ts`, `main.ts`, `constants.ts`,
`protocol.ts` (×5 bump sites), `primitive.ts`, `save.ts`, `stateHashFull.ts`.

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: **6 completed / 7** | ~870K/1M (ORANGE)
- P1 ZONES — completed — `316a53f` — 4/4
- P2 PHASE SPLIT — completed — `98c43eb` — 4/4 (protocol 26)
- P3 WALLS — completed — `b79a3b0` — 4/4
- P4 FOOTER — completed — `12ee795` — 4/4
- P5 ARCADE + corrections — completed — `bb46e4e` — shipped in the P6 deploy
- P6 FIX/SCRAP + HUD + arcade fixes — completed — `50a5c24` — 4/4 (protocol 27)
- P7 BOTS BUILD TOWERS — **deferred** (context ORANGE)

## REFLEXION ENTRIES (this session)
31 entries in `session-state.json`; the 12 highest-signal are in `.claude/reflexion_log.md`.
Highest signal:
- a renderer keyed on a phase/roster field needs a `gameState` guard too — I shipped that bug TWICE
- three defects were invisible to 171 green test files; only a rendered frame showed them
- a green suite meant nothing: the whole P2 implementation moved the test count by ZERO
- my deferral shipped a half-affordance the owner correctly read as "it isn't clickable"
- I asserted a determinism property I could not demonstrate; the test failing taught me that
- "stale" and "flaky" are not the same word

## CARRY-FORWARD PRIORITIES
1. **CF-S149-e** arcade timed trial + leaderboard UI (model done + mutation-tested; screens missing)
2. **CF-S149-d** click-to-build e2e rewrite (3 × `test.fixme`, recipe in file)
3. **CF-S149-f** P7 bots build towers (last of the five complaints; Full tier)
4. **CF-S149-a** quarry-is-an-open-hub — OWNER DESIGN RULING
5. **CF-S149-b** wall clamp has no sim consumer (rim case)
6–14. CF-S149-c · CF-S148-b/c/d · CF-S147-b/c/e · CF1 · CF3

═══════════════════════════════════════════════════════════
