# PDR — Session 34 — S30 Audit P2 Batch (audit cleanup + voltkin-config refactor)

**Status:** DRAFT — awaiting Council R1 + PRIME-AUDIT + user `go`
**Tier:** Standard (highest of batch — P2-20 voltkin-config refactor is Standard scope)
**Origin:** S30 audit P2 findings #16–#24, deferred from S33 (which shipped only P1 batch)
**Date:** 2026-05-16
**Prior approval signal:** User 2026-05-16 — *"finish fixing all bugs you found in the audit few sessions ago. if none left rerun full methodical and pedantic audit ... then do that!"* — covers Phase A (this PDR) + Phase B (fresh audit, future PDR)

---

## A.0 STATE-DISCOVERY REPORT (Rule 21 — empirical probes before lock)

Pre-PDR probes were run against each BACKLOG.md P2 claim. **3 deltas** were found between BACKLOG narrative and current code state. Scope adjusted accordingly:

| # | Claim (BACKLOG.md §Session 33) | Empirical state | Delta |
|---|---|---|---|
| P2-16 | `ScreenShake.reset() + creatureRenderer.destroy()` wired in teardown | `screenShake.reset()` ✓ wired (`main.ts:743`); `creatureRenderer.destroy()` method EXISTS (`creatureRenderer.ts:195`) but NOT called from any teardown path | **PARTIAL** — destroy() never invoked; sprite cleanup currently piggybacks on `sync()` running with empty `world.creatures` post-reducer-clear |
| P2-17 | `seekForce` unused in prod | Confirmed: only test-usage (`creatureVerlet.test.ts` × 4 sites); `arriveForce` + `repulseForce` same shape (S26 PRIME-AUDIT Δ2 documented as testability exports) | ✓ exact |
| P2-18 | Dead `'godly'` variant in `BOND_SEVERED.cause` | Already documented intentional back-compat at `effects.ts:121-128` + `world.ts:382` + retained `audioManager.test.ts:155` for type-shape regression | **FALSE-POSITIVE candidate** (P1-7 pattern — existing comment documents intent) |
| P2-19 | LOCKED_DECISIONS §13.15+ codification of Phase-2 | §13.14 exists (Audio); §13.15+ does NOT exist | ✓ exact — section creation needed |
| P2-20 | `voltkin-config.ts` per-type CreatureConfig table | File does NOT exist; constants scattered across 6+ files (`creature.ts`, `creatureRenderer.ts`, `creatureLifecycle.ts`, `creatureAttack.ts`, `arcFlash.ts`, `screenShake.ts`) | ✓ exact |
| P2-21 | `pendingCreatureSpawn` clear on `START_GAME` | `applyStartGame` does NOT clear `pendingCreatureSpawn`. Other clear paths verified: `applyReturnToTitle:129` ✓, `GODLY_ABORT (world.ts:416)` ✓, `applySnapshotCore (save.ts:336)` ✓, `createWorld:275` initializes null ✓ | **PARTIAL** — 4 paths cover normal flows, but no defensive belt-and-suspenders at game entry |
| P2-22 | Commented-out code at `cutsceneOverlay.ts:214-218` | Lines 214-226 currently hold ACTIVE code (the consolidated `loadeddata` listener post-S33 P1-8). No commented-out block in that range. | **MOOT** — already cleaned by S33 P1-8 consolidate |
| P2-22b | Handoff S30close `arcFlash.ts` path typo | Confirmed at `.handoff-archive/HANDOFF_2026-05-14_S30close.md:93` — says `src/render/arcFlash.ts` (actual: `src/render/effects/arcFlash.ts`) | ✓ exact |
| P2-23 | Stale `.bak` files — handoff + session-state | Handoff `.bak` (May 9, 7d old) EXISTS — stale ✓. `session-state.json.bak` — SessionStart pre-flight reports "Session PDCA: session-state.json preserved (.bak refreshed)" — **auto-managed, NOT stale** | **PARTIAL** — only handoff `.bak` deletable; session-state `.bak` is a live backup managed by the hook |
| P2-24 | Untested S25-S30 paths | `creatureRenderer.test.ts` exists but covers ONLY pure transform helpers (lerpHex, WINDUP_TINT_EASE, computeCreatureTint/Scale/Rotation); `CreatureRenderer.sync()` is DOM-gated browser-smoke only. `cutsceneOverlay.test.ts` exists but covers ONLY `CutsceneContext` shape regression-lock; play/abort uncovered. `arcFlash.test.ts` does NOT exist; `drawArcFlash` 120 LOC uncovered. | ✓ exact |

**Test baseline:** 588/588 ✓ (`vitest run` — 38 files, 4.04s)
**Bundle baseline:** 467.46 KB (32.54 KB headroom on 500 KB hard cap)
**Branch:** master, clean (modulo `.claude/session-state.json` autocommit)
**Deploy:** https://spark-online.space/ → HTTP 200 ✓

---

## 1 · OBJECTIVE

Close the S30 audit P2 batch — verify carry-over completeness from S31 P0-2 and S33 P1, codify Phase-2 system in LOCKED, consolidate Voltkin per-type constants into a config table (prereq for Anvil ship in S35+), and lift coverage on three DOM-gated S25–S30 code paths via pure-helper extraction.

---

## 2 · SCOPE (per-priority breakdown)

### P2-16 — Wire `creatureRenderer.destroy()` into teardown (**Micro, ~3 LOC**)

**Where:** `src/main.ts:741-750` (TITLE-transition watcher).
**Change:** Add `creatureRenderer.destroy()` call alongside existing `cutsceneOverlay.abort()` + `screenShake.reset()`. Re-construct `creatureRenderer` if/when next PLAYING entry needs it — or, simpler, **call `creatureRenderer.destroy()` followed by re-init**, OR keep destroy() for app-end only and add a defensive `clear-and-keep-container` path.

**A.0 follow-up needed:** Decide whether destroy() removes the container itself (one-shot, app-end semantics) or a new `clear()` method that just empties sprites without tearing down the container.
- Currently `destroy()` calls `this.container.destroy({ children: true })` — DESTRUCTIVE to the container, can't be called mid-game.
- Better: add a new `clear()` method that does just `for (const sprite of sprites.values()) sprite.destroy(); sprites.clear();` and KEEPS the container alive for next-game sprite mounts.

**Adopt:** add `clear()` method, wire in teardown. Keep `destroy()` for full-app teardown (currently never called — could also delete).

### P2-17 — Annotate `seekForce` / `arriveForce` / `repulseForce` as test-only exports (**Micro, ~6 LOC doc**)

**Where:** `src/physics/creatureVerlet.ts` — JSDoc on each of 3 exported helpers.
**Change:** Add `@internal Exported for testability only (S26 PRIME-AUDIT Δ2). Production path is computeSteeringAccel which composes these. Do not import from outside src/physics/creatureVerlet.test.ts.`
**Why not delete:** S26 Council Q4 COMPROMISE explicitly preserved per-behavior helpers for testability. Tests provide regression coverage for future variant revival (Anvil may compose differently per FSM state).

### P2-18 — DROP per PRIME-AUDIT false-positive pattern (**0 LOC**)

`'godly'` variant in `BOND_SEVERED.cause` is already documented at `effects.ts:121-128` ("kept for back-compat; no emitter post-S27") + `world.ts:382` ("BOND_SEVERED.cause='godly' is now unreachable in production code but the union variant is preserved in effects.ts for type-system back-compat"). Replay-side `save.ts:195` also retains it for snapshot back-compat.

**This is the same pattern as S33 P1-7** — audit flagged "dead code" where the existing comment already documents intentional retention. Per S33 reflexion **#audit-finding-can-be-false-positive-when-existing-comment-documents-intent**, drop.

**Adopt:** drop. Document the drop in PDR carry-forward.
**Risk if wrong:** Zero — keeping a documented dead union variant has no runtime cost; deleting it would mean a backward-incompatible save format if a future emitter ships.

### P2-19 — Add LOCKED_DECISIONS §13.15 Phase-2 godly/creature system (**Micro, ~80 LOC markdown**)

**Where:** `LOCKED_DECISIONS.md` — append `§13.15 Phase-2 godly/creature system` after `§13.14 Audio subsystem`.

**Content (verbatim constants from current code, no derivation):**
- Lifetimes: `VOLTKIN_LIFETIME_TICKS = 480` (8s @ 60Hz); `CREATURE_SPAWN_TICKS = 60`; `CREATURE_DESPAWNING_TICKS = 60`; `CREATURE_FADE_TICKS = 30`
- Attack cadence: `VOLTKIN_ATTACK_CADENCE_TICKS = 60`; `VOLTKIN_ATTACK_FIRE_TICK = 30`
- Range: `VOLTKIN_ATTACK_RANGE = 180` px
- Steering: `SEEKING_LEAN_MAX_RAD ≈ 0.262` (~15°)
- Cinematic timing: `cinematicMs = 4500`; `sustainedEffectMs = 500`; `FADE_MS = 300`
- Effect durations: `ARC_FLASH_DURATION_TICKS = 24` (~400ms post-S30 P0c)
- Screen-shake: 6-tick decay; ±2px amplitude; gated on ARC_FLASH-this-tick (S33 P1-6)
- Spawn delay math: `fireAtTick = world.tick + cinematicMsToTicks(cinematicMs + sustainedEffectMs + FADE_MS)` (S31 P0-1)
- NetSnapshot pass-through: ARC_FLASH + BOND_FORMED + BOND_SEVERED serialized; `creatureId?: CreatureId` additive-optional (S31 P0-3 + S33 P1-11) — **NO SCHEMA_VERSION bumps** per documented additive-optional precedent
- Cause union: `'player' | 'physics' | 'godly' | 'creature'` — `'godly'` dead post-S27, kept for back-compat

Cross-reference: blueprint § VI/VII Voltkin spec; S22 P3 (`godlyRecipes/types.ts`); S25–S28 Phase 2 implementation chain; S30 P0c tune; S31 P0-1/P0-3; S33 P1-6/P1-11.

### P2-20 — Create `src/state/creatures/voltkin-config.ts` per-type CreatureConfig (**Standard, ~120-160 LOC + tests**)

**Where:** NEW `src/state/creatures/voltkin-config.ts`.

**Shape:**
```ts
export interface CreatureConfig {
  readonly type: CreatureType;             // 'voltkin' | ...future
  readonly lifetimeTicks: number;
  readonly spawnTicks: number;
  readonly despawningTicks: number;
  readonly fadeTicks: number;
  readonly attackCadenceTicks: number;
  readonly attackFireTick: number;
  readonly attackRange: number;
  readonly attackRangeSq: number;
  readonly seekingLeanMaxRad: number;
  // ARC_FLASH visual config (when attack === 'arcFlash')
  readonly arcFlashDurationTicks?: number;
  // Screen-shake config (when attack triggers shake)
  readonly screenShakeDecayTicks?: number;
  readonly screenShakeAmplitudePx?: number;
}

export const VOLTKIN_CONFIG: CreatureConfig = { type: 'voltkin', ... };
export const CREATURE_CONFIGS: Readonly<Record<CreatureType, CreatureConfig>> = { voltkin: VOLTKIN_CONFIG };
export function getCreatureConfig(type: CreatureType): CreatureConfig { ... }
```

**Re-import sites (preserve byte-exact constants):**
1. `src/state/creatures/creature.ts` — replace `export const VOLTKIN_*` with `export { VOLTKIN_CONFIG }`-style re-export (preserve old names as `const X = VOLTKIN_CONFIG.lifetimeTicks` etc. for back-compat with downstream test imports). NO test churn.
2. `src/state/creatures/creatureLifecycle.ts` — read via `VOLTKIN_CONFIG` directly.
3. `src/state/creatures/creatureAttack.ts` — same.
4. `src/render/creatureRenderer.ts` — read via `VOLTKIN_CONFIG` directly.
5. `src/render/effects/arcFlash.ts` — read ARC_FLASH duration via config.
6. `src/render/screenShake.ts` — read decay/amplitude via config.

**Critical constraint:** Byte-exact behavior preserved. P1-12 replay-determinism test (S33) is the empirical guard — if it stays green post-refactor, math is preserved.

**Anvil prereq:** Once this lands, adding a second godly is `+1 CreatureConfig entry` + `+1 attack handler dispatch` instead of `+6 file edits per constant`.

### P2-21 — Defensive `pendingCreatureSpawn = null` in `applyStartGame` (**Micro, 1 LOC + 1 test**)

**Where:** `src/state/gameMode.ts:applyStartGame` (line 57-74).
**Change:** Add `world.pendingCreatureSpawn = null;` before the function returns. Belt-and-suspenders for the rare path that bypasses applyReturnToTitle/GODLY_ABORT/applySnapshotCore/createWorld.

**Why even though 4 paths already clear:** S35+ Anvil could introduce a new transition path; defensive clear at game entry is cheap insurance.

**Test:** `gameMode.test.ts` — new test "applyStartGame clears pendingCreatureSpawn" — set non-null, dispatch START_GAME, assert null.

### P2-22 — MOOT-confirm + handoff typo fix (**Micro, 1 archived doc line**)

**Part a (commented-out cutsceneOverlay):** verify lines 200-230 of `cutsceneOverlay.ts` have no commented blocks. CONFIRMED clean per A.0 probe — already cleaned by S33 P1-8. Document as closed, no code change.

**Part b (handoff typo):** `.handoff-archive/HANDOFF_2026-05-14_S30close.md:93` — change `src/render/arcFlash.ts` → `src/render/effects/arcFlash.ts`. 1-line edit to archived doc (post-hoc correction of a path that didn't exist at that path even at S30 close).

### P2-23 — Delete stale handoff `.bak` (**Micro, 1 file delete**)

**Where:** `.handoff-archive/HANDOFF_2026-05-09_session3of10.md.bak`.
**Why:** 7-day-old `.bak` from a 1-of-10 sequence file; `.bak` semantics imply scratch/save-before-overwrite; archive content is now the .md sibling.
**Skip:** `.claude/session-state.json.bak` is auto-refreshed by SessionStart per pre-flight ("Session PDCA: session-state.json preserved (.bak refreshed)") — live backup, NOT stale.

### P2-24 — Pure-helper extraction + tests for S25-S30 paths (**Standard, ~80-120 LOC tests + 0-30 LOC extractions**)

**Strategy:** Don't try to mock Pixi for full `CreatureRenderer.sync()` / `drawArcFlash` / `CutsceneOverlay.abort()` (high-cost, brittle). Instead, EXTRACT the embedded pure logic into testable helpers and lift them out of the DOM-gated paths. Coverage rises by adding tests on the extracted helpers, not on the DOM-bound containers.

**Targets:**

1. **`creatureRenderer.sync` orchestration** — currently mixes sprite-attach decisions (pure: "for each id in world.creatures, do I have a sprite? if not create; if so update; if id removed delete") with Pixi-side mounts. Extract `computeSpriteDelta(currentIds: Set<CreatureId>, worldIds: Iterable<CreatureId>): { toCreate: CreatureId[]; toRemove: CreatureId[] }` as a pure helper. Test: 4-5 cases (empty→empty, empty→2, 2→0, 2→3 overlapping, 2→2 different).

2. **`drawArcFlash` polyline + jitter** — currently mixes pure math (jittered vertex array generation given seed) with Pixi Graphics calls. Extract `buildJitteredPolyline(seed: number, startX, startY, endX, endY, segments, ampPx): Vec2[]` as a pure helper. Test: 5-6 cases (determinism per seed, endpoint preservation, segment count, amplitude bound, zero-amp passthrough, two-seeds-differ).

3. **`CutsceneOverlay.abort` ordering** — already documented; the structural-shape test exists. ADD a pure helper `computeAbortCleanupSteps(active: boolean, hasVideo: boolean, hasTickerFn: boolean): AbortStep[]` enumerating in-order steps. Test the helper; sync the implementation. Lightweight regression-lock for cleanup ordering. 3-4 cases.

**Net test add:** +12-15 tests. 588 → ~600-603.

---

## 3 · TESTING (full plan)

- Baseline: 588/588 ✓
- Per-priority test deltas:
  - P2-16: clear() invocation test in creatureRenderer.test.ts pure mock + main.ts integration if jsdom-allowable (+1-2)
  - P2-17: doc only, no test
  - P2-18: dropped, no test
  - P2-19: doc only, no test
  - P2-20: existing tests (creatureLifecycle, creatureAttack, creatureRenderer pure helpers, arcFlash drawer, screenShake) must remain green post-config-refactor. Add 2-3 new tests on getCreatureConfig + CREATURE_CONFIGS shape.
  - P2-21: gameMode.test.ts new test (+1)
  - P2-22: no test
  - P2-23: no test
  - P2-24: +12-15 new tests on extracted helpers
- **Target post-batch:** 600-610 passing (effective +12-22)
- **Critical guards:**
  - P1-12 replay-determinism test must stay green (P2-20 byte-exact guard)
  - audioManager.test.ts BOND_SEVERED cause='godly' test must stay green (P2-18 drop is to act ON variant — variant stays in types)

## 4 · ROLLBACK

Per-priority commits enable selective revert. P2-20 is the highest-risk refactor; if replay-determinism breaks post-commit, revert that single commit; other priorities are independent.

## 5 · DELIBERATION QUESTIONS for Council R1

- **Q1 (P2-16 method choice):** Add new `creatureRenderer.clear()` method (sprites + container survives) vs reuse `destroy()` (container dies, must reconstruct on next PLAYING entry) vs leave as-is and rely on `sync()` cleanup with empty world.creatures map?
- **Q2 (P2-18 false-positive disposition):** Drop per S33 PRIME-AUDIT pattern (existing comment documents intent) vs keep but improve comment vs actually delete the union variant + downgrade audioManager test?
- **Q3 (P2-20 config shape):** Flat `Readonly<Record<Type, Config>>` lookup vs class hierarchy (CreatureConfigBase → VoltkinConfig) vs frozen object module + getter? Anvil-extensibility view.
- **Q4 (P2-24 strategy):** Pure-helper extraction + new-helper tests (proposed) vs minimal jsdom + Pixi mocks + integration tests vs split into S35 carry?
- **Q5 (P2-21 defensive vs no-op):** Add defensive clear in applyStartGame even though 4 paths already clear, OR document conclusion + skip the code change (verify-only)?
- **Q6 (P2-22b archived doc edit):** Fix historical typo in archived handoff vs leave as historical record + add correction note?

## 6 · ESTIMATE

- **Tokens:** ~20-25K (Standard tier mid-range)
- **LOC:** +250-320, -10
- **Bundle delta:** +0.5 KB to +1.5 KB (voltkin-config + extracted helpers; tests don't bundle)
- **Bundle headroom post:** ~30-32 KB on 500 KB cap (well within GREEN)
- **API spend:** Council R1 (Grok + Gemini) ~$0.05-0.10; total ~$0.10-0.15 for full pipeline

## 7 · RISK ASSESSMENT

- **HIGH:** P2-20 byte-exact preservation — replay-determinism test is the guard
- **MEDIUM:** P2-16 method choice — destroy() vs clear() semantics, choose wrong and you get either broken next-game (destroy without reinit) or memory leaks (no clear)
- **LOW:** all others — doc/typo/delete/defensive-clear/test-add

## 8 · SUCCESS CRITERIA

1. All 9 P2 items addressed (closed-as-shipped, closed-as-MOOT, or closed-as-DROPPED with PRIME-AUDIT rationale)
2. Test count: ≥600 passing (was 588)
3. Bundle: ≤468.5 KB (≤+1 KB delta)
4. P1-12 replay-determinism test green (proves byte-exact P2-20 refactor)
5. LOCKED_DECISIONS.md §13.15 added and cross-referenced from blueprint
6. `git log` per-priority commits + push to master
7. Deploy live + HTTP 200 verified
8. reflexion_log.md per-priority entries written
9. session-state.json `check_completed: true + check_method (verbose)` for each priority

---

## CARRY-FORWARD

- **Phase B (S35+):** User authorized fresh full audit AFTER this batch closes. Will fire after S34 close as a new PDR draft.
- **S34 noted-bug list:** User said "i will check later" — not blocking this PDR.
- **S35+ Anvil creature:** post-P2-20 voltkin-config base.
- **1v1 brother retest:** S31 P0-3 + S33 P1-11 fixes pending cross-network confirmation.
