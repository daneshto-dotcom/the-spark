# Council R1 Battle Ledger — S20 P1 (world.ts → sparkLifecycle + authGate extraction)
**Date:** 2026-05-12
**Tier:** Standard
**Models:** Grok-4-1-fast-non-reasoning (DISRUPTOR) + Gemini-2.5-pro (AUDITOR) + Claude Opus 4.7 1M (SUPERVISOR)
**Round:** R1 (single round per Standard-tier protocol)

---

## A.0-LEVEL-2 PIVOT (pre-Council)

Original P1 scope per S19 handoff: "extract gameState FSM transitions (START_GAME, END_TURN, RETURN_TO_TITLE, UPDATE_AVATAR_POS) into new `worldFsm.ts`". A full re-read of `world.ts` revealed those 4 cases ALREADY delegate to `gameMode.ts` (S16 P0 extraction; file comment line 21-24). PIVOTED to extracting the remaining inline case bodies (SPAWN/DESPAWN/PICKUP/DROP/TICK_ENERGY/WIN_TRIGGER cluster).

---

## GROK DISRUPTOR — 12 challenges

| # | Challenge | Verdict | Rationale |
|---|---|---|---|
| 1 | COHESION_MISMATCH (6-helper grouping mixes lifecycle / interaction / tick / win) | **ADOPT-PARTIAL** | Drop WIN_TRIGGER from extraction; rename `sparkLifecycle` covers spawn/despawn/pickup/drop/tick (player-spark resource cluster) |
| 2 | WIN_TRIGGER_TRIVIAL (3 LOC scalar mutation, extraction adds overhead) | **ADOPT** | Leave WIN_TRIGGER inline in world.ts; reflects single-responsibility |
| 3 | AUTH_GATE_DUPLICATION (1v1 gate at PICKUP/DROP/PLACE_PRIMITIVE = 3 sites) | **ADOPT** | NEW `src/state/authGate.ts` with `requireActivePlayer(world, playerId): boolean` |
| 4 | REGRESSION_SPARK_ID_MISSING (helper must replicate exact null + state-kind guards) | **ADOPT-AS-TEST** | New tests cover both throw paths (spark missing, spark not Free-state) |
| 5 | PICKUP_DROP_ATOMICITY (split helpers risk mid-state world) | **REJECT** | We move whole case bodies, not split single-case-body across helpers; atomicity preserved by scope |
| 6 | TICK_ENERGY_HOTPATH (function-call overhead) | **REJECT** | TICK_ENERGY fires once per frame, not hot. V8 inlines small fns. No measurable cost |
| 7 | BETTER_BOUNDARY_SPARK_FSM (only PICKUP/DROP into sparkHeld.ts) | **REJECT-PARTIAL** | Tighter scope wouldn't hit ≤280 LOC charter (math: 311-13-12+5 = 291). Need the wider cluster |
| 8 | TEST_COVERAGE_GAP (must mirror world.test.ts) | **ADOPT-AS-TEST** | New sparkLifecycle.test.ts covers each helper's branches |
| 9 | IMPORT_BLOAT_CHAIN (cyclic risk world.ts ↔ sparkLifecycle.ts) | **ADOPT** | type-only `World` import in sparkLifecycle.ts (no value-import of world.ts); authGate.ts is leaf module |
| 10 | PLACE_PRIMITIVE_INCONSISTENCY (auth gate at 3 sites) | **ADOPT** | Same as Grok #3; placePrimitive.ts inline gate migrates to shared helper |
| 11 | COUNTERPROPOSAL_TIERED (P1a PICKUP/DROP only) | **REJECT** | Tighter scope doesn't hit charter; full 5-helper extraction needed for ≤280 |
| 12 | DISPATCH_EXTENSIBILITY (central switch vs scattered helpers) | **REJECT** | gameMode.ts pattern already established S16 P0; consistent with existing project convention |

## GEMINI AUDITOR — 10 findings

| # | Finding | Verdict | Rationale |
|---|---|---|---|
| 1 | Helpers should return World (not void) — matches gameMode.ts pattern | **ADOPT** | Aligns with existing `return applyStartGame(world, action)` precedent |
| 2 | Void breaks early-return-on-auth-gate-no-op | **ADOPT** | Same as #1 — World return enables `if (!requireActivePlayer) return world` |
| 3 | Centralize 1v1 auth gate as `requireActivePlayer` helper | **ADOPT** | Same as Grok #3 + #10; CONVERGENT |
| 4 | applyWinTrigger doesn't belong in sparkLifecycle.ts | **ADOPT** | Same as Grok #2; CONVERGENT |
| 5 | SPAWN_SPARK (2 LOC) extraction marginal — justified only by pattern consistency | **ADOPT** | Extract anyway for cohesion; net LOC saving from case-block structural overhead |
| 6 | New tests must validate exception paths (throw for non-free spark) | **ADOPT-AS-TEST** | Same as Grok #4 + #8 |
| 7 | PICKUP/DROP atomicity invariant | **REJECT-AS-NIT** | Same as Grok #5 — single-scope preserved |
| 8 | requirePlayer cross-module dependency risk | **ADOPT-PARTIAL** | sparkLifecycle.ts imports requirePlayer from world.ts (type-only-where-possible); cycle avoided since world.ts doesn't import sparkLifecycle.ts |
| 9 | placePrimitive.ts auth gate also duplicated | **ADOPT** | Same as Grok #10; CONVERGENT |
| 10 | Order-of-mutation preservation across extraction | **ADOPT-AS-TEST** | Existing 386 tests + new helper-level tests cover order |

---

## CONVERGENT THEMES

1. **Auth-gate de-duplication is the highest-value cleanup** — Grok #3, Grok #10, Gemini #3, Gemini #9 all converge on extracting `requireActivePlayer` to a shared helper called from 3 sites.
2. **WIN_TRIGGER doesn't belong in sparkLifecycle** — Grok #2, Gemini #4 converge; keep inline.
3. **Helpers must return World, not void** — Gemini #1+#2 explicit; Grok implied by pattern alignment.
4. **Throw-path test coverage required** — Grok #4+#8, Gemini #6+#10.

---

## ADOPT LIST (final synthesis → execution spec)

- **A.** NEW `src/state/authGate.ts` (~10 LOC) with `requireActivePlayer(world: World, playerId: PlayerId): boolean` returning `true` when the action SHOULD proceed (= solo mode OR 1v1 mode AND playerId matches currentPlayerId), `false` when it should silently no-op. Pure function, type-only `World` + `PlayerId` imports.
- **B.** NEW `src/state/sparkLifecycle.ts` (~70 LOC) with 5 pure helpers returning `World`:
  - `applySpawnSpark(world, action): World`
  - `applyDespawnSpark(world, action): World`
  - `applyPickupSpark(world, action): World` — calls `requireActivePlayer` first
  - `applyDropSpark(world, action): World` — calls `requireActivePlayer` first
  - `applyTickEnergy(world, action): World`
- **C.** NEW `src/state/sparkLifecycle.test.ts` (~120 LOC) with ~10 cases:
  - applySpawnSpark inserts into freeSparks map
  - applyDespawnSpark removes if free + state-kind 'Free'; no-ops if missing or non-free
  - applyPickupSpark 1v1 wrong-player rejects silently
  - applyPickupSpark throws on spark missing
  - applyPickupSpark throws on spark not Free-state
  - applyPickupSpark happy path: spark.state → Carried, prev-pos snap, player FSM transition
  - applyDropSpark 1v1 wrong-player rejects silently
  - applyDropSpark throws CarryViolation if player not Carrying
  - applyDropSpark happy path: spark released at pos, player FSM transition
  - applyTickEnergy adds energy to player
- **D.** `src/state/world.ts` dispatch cases SPAWN_SPARK / DESPAWN_SPARK / PICKUP_SPARK / DROP_SPARK / TICK_ENERGY collapse to single-line delegates. WIN_TRIGGER stays inline. PLACE_PRIMITIVE inline 1v1 gate replaced with `requireActivePlayer` call.
- **E.** `src/state/placePrimitive.ts` — if it has an inline 1v1 gate (TBD at implementation), replace with `requireActivePlayer` call (Council Grok #10 + Gemini #9 ADOPT). If gate is only at world.ts call site, no change here.
- **F.** `LOCKED_DECISIONS.md` §XV ledger row update: world.ts 311 → ~277 LOC (≤280 charter); sparkLifecycle.ts NEW; authGate.ts NEW.

## REJECT LIST (codified for traceability)
- Grok #5 (atomicity NIT), #6 (TICK_ENERGY hotpath), #7 (tighter scope), #11 (P1a tier), #12 (extensibility) — all REJECT with rationale
- Gemini #7 (atomicity NIT) — REJECT

---

## PRIME-AUDIT DELTA (Rule 20, post-synthesis self-review)

**Self-question 1:** Was anything rubber-stamped?
→ Initial PDR file-naming "sparkLifecycle" — Council #1 forced re-examination. RESOLVED via WIN_TRIGGER exclusion + file-header rationale.

**Self-question 2:** Claim-addressed-not-actually-fixed?
→ `requireActivePlayer` extraction promised "unify all 3 sites" — verified: PICKUP, DROP, PLACE_PRIMITIVE all use same check shape. ADOPT confirmed.

**Self-question 3:** Where did consensus mask disagreement?
→ Grok #11 (P1a tighter scope) was independent counter-proposal. REJECTED with explicit math: 311 - 13 - 12 + 5 = 291 LOC (still 4% over charter); full 5-helper extraction needed for ≤280.

**Self-question 4:** Edge cases undercaught?
→ **requirePlayer throw semantics post-pivot:** currently throws if player missing. In new layout, PICKUP_SPARK runs auth gate first; an INVALID playerId in 1v1 mode goes through auth (returns no-op, player not looked up — no throw). In SOLO mode, falls through to `requirePlayer` which throws. Same behavior as current (solo never hits 1v1 auth gate). ✓
→ **type-only import edge:** `World` is an interface type; TS handles type-only via `import type { World }`. No runtime import needed. ✓
→ **Test fixture compat:** existing `makeWorld(seed)` initializes `gameState='PLAYING'` (test contract). Helpers don't touch gameState. ✓

**Self-question 5:** Is synthesis materially better than R1 or just longer?
→ **MATERIALLY BETTER.** Council R1 surfaced (a) WIN_TRIGGER cohesion-mismatch correction (would have been a stale design choice), (b) auth-gate de-duplication (eliminates 3 inline sites + a probable defense-in-depth duplicate in placePrimitive.ts), (c) helper-return-type pattern alignment with gameMode.ts (Gemini #1+#2). Each of these has runtime + readability + future-maintenance value.

---

## EXECUTION SPEC (ready for implementation)

See ADOPT list above. Estimated cost: Grok 1 call (~$0.01), Gemini 1 call (~$0.02), cumulative session API ~$0.06.

LOC math (verified):
- world.ts case-body extractions: SPAWN (3→1=-2) + DESPAWN (7→1=-6) + PICKUP (15→1=-14) + DROP (14→1=-13) + TICK_ENERGY (5→1=-4) = -39
- world.ts auth-gate inline removal at PICKUP/DROP/PLACE_PRIMITIVE: -3 (replaced with helper calls, +0 LOC net)
- world.ts add `import { requireActivePlayer }`: +1
- world.ts NET change: -39 + 1 = -38 LOC; ~273 LOC final. WELL UNDER 280.

(Conservative estimate ~277 LOC since import block + delegate-line phrasing may add 4-5 LOC of structural overhead I'm not pre-counting.)

---
Battle Ledger sealed 2026-05-12 19:14 UTC.
