---
STATUS: RESEARCH BRIEF (input to S90 batch PDR — pre-Council, pre-user-approval)
SESSION: S90
DATE: 2026-06-16
SOURCE: 6-reader parallel State-Discovery workflow (wf_f43b7c07-c8b) + cross-cutting verification
---

# S90 PLANNING BRIEF — G1b (DEFENSE / MOTION / ECONOMY) + G2 (Traits + Promotions)

> Verbatim research synthesis preserved below. All file:line citations spot-verified against the
> working tree this session. Build measured: `index-BvKxVMXd.js = 559.82 kB raw = 546.7 KiB` →
> **~3.3 KiB headroom** under the 550 KiB charter (no CI size gate — human-eyeball only).

## 1. PER-PRIORITY INTEGRATION MAP

### P-ECON — Filament (Dot→Line) income trickle  *(SIMPLEST — recommend FIRST)*
- Touch: `combos.ts:177` add `isFilamentCombo` (mirrors `isVortexCombo`). `constants.ts` add `FILAMENT_INCOME_COMPLEXITY=1.0` after `FUNCTIONAL_BOND_CAP_PER_PRIM`. `scoring.ts:90` count filament bonds in the existing loop; add `+ filamentBonds*FILAMENT_INCOME_COMPLEXITY` to the return.
- Approach: extra complexity weight INSIDE `computeComplexity` (not a parallel add) → inherits fouled-skip + single-owner attribution + mirrored sync.
- State/net/save: NONE. Determinism-clean (integer-count-then-multiply, fixed-arity sum).

### P-MOTION — Wheel (Tri→Circle) / Star (Circle→Tri) rotation
- Touch: new `src/state/wheelRotation.ts` (~90 LOC, clone vortex.ts incl. determinism doc). `combos.ts:177` add `isWheelCombo`/`isStarCombo` (order-DISTINCT). `physicsLoop.ts:130` add `applyStructureRotation(world)` after `applyVortexPull`, once/tick before substeps. `constants.ts` add `ROTATION_RAD_PER_TICK`(~0.0035). Reuse `componentOf` (`structure.ts:21`).
- Approach: TRUE rigid rotation = direct pose-write (mutate `prim.pos`, keep `prevPos` consistent), NOT torque/velocity. Precompute sin/cos of the const angle ONCE at module load → per-tick is +−× only. Pivot = combo-bond midpoint (no collection sum → no float-order concern).
- State/net/save: NONE. SerializedPrimitive already carries pos+prevPos. Host-only; clients lerp mirrored pos.

### P-DEF — Diamond (Tri→Tri) / Lattice (Sq→Sq) 2-hit resist  *(HARDEST — recommend LAST or DEFER)*
- Player-sever route (clean): `disruptionManager.ts:108` `computeBaseCharge` → `DEFENSIVE_SEVER_CHARGE_COST=2` when `isDefensiveCombo` AND `cause==='player'`; `:84` floor `< cost`. `combos.ts` add `isDefensiveCombo` (symmetric).
- Voltkin-bolt absorb route (cross-tick state): `severBond.ts:62` gate; host-only `Set<BondId>` mutated in `applySeverBond` when `cause==='creature'` + `isDefensiveCombo`; new `DEFENSE_RESIST` effect (the killCount/ARC_FLASH guard fires no feedback on an absorbed hit). Reset in the `reconcileFouledPrimitives` hook.
- potato (`potatoLifecycle.ts:200`) DELETES prims directly — bypasses sever entirely. bomb bypasses the charge gate (`disruptionManager.ts:78`). physics-cause sever MUST be excluded (else over-tensioned defensive structures become indestructible).
- State/net/save: player-route NONE; Voltkin counter host-only NOT serialized (recommended) → no protocol bump.

### P-G2-TRAITS — rule-based family traits for the 24 functional placeholders
- Touch: `combos.ts:145` replace `...FUNCTIONAL_DEFAULTS` with `...functionalTraits(a,b)`; add `FAMILY_STIFFNESS: Record<SparkType,StiffnessTier>` + ~5-line pure builder.
- Only `stiffnessTier` is mechanically LIVE (`bonds.ts:69` break-ratio, `:75` correction, `structureRenderer.ts:158` width). `areaMultiplier` is DEAD (zero consumers). Key on carried prim `a` (6 family rules).
- State/net/save: NONE (`bond.stiffnessTier` already serialized). **BLOCKER: `LOCKED_DECISIONS §6:268` says functional combos ship as MID/1.0×/generic — needs explicit user lock-amendment + doc + `combos.test.ts:71-77` edit.**

### P-G2-PROMO — promote Dot→Square + Line→Circle to magic (12→14 magical, 24→22 functional)
- Touch: `combos.ts:27-124` append 2 tuples. `combos.test.ts:24,26` counts 12→14; `:71-77` repoint functional example off Dot→Square. `LOCKED_DECISIONS §6` add seed #13/#14. `ui.ts:162` `MAGIC_12_KEYS.length` auto-flips to /14. Visual-complete: ~2 ephemeral + ~2 persistent draw fns + 4 switch cases (`bondCommit.ts:45`, `bondVisualRenderer.ts:58`).
- Approach: pure DATA promotion; `size===36` invariant HOLDS (in-place overwrite). Scoring/discovery/HUD follow the table automatically.
- State/net/save: NONE. **BALANCE: functional +0.25 (capped) → magic +2.0 (uncapped) = 8× jump vs PHASE_1_WIN_SCORE=210 — playtest-gate, Council ratifies.**

## 2. RISK REGISTER (top)
- R1 HIGH — Over-ambition: 3 archetypes + G2 in one session (roadmap = ~1 session/archetype; S89 shipped only Vortex). → enforce CUT-LINE.
- R2 HIGH — DEFENSE no single chokepoint (potato bypasses sever). → scope potato OUT of v1 + regression test.
- R3 HIGH — G2-PROMO 8× scoring jump (live PvP win-pace). → playtest-gate, Council ratifies.
- R4 HIGH — Bundle headroom ~3.3 KiB, no CI gate; DEFENSE most likely to blow it. → eyeball; lazy-load overlay if near.
- R5 HIGH — MAX_DISRUPTION_CHARGES=2: "2 charges to sever" burns a player's ENTIRE budget on one defensive bond. → Council picks per-hazard design.
- R7 MED — MOTION-as-torque fights solver / no rotation state. → rigid isometry (direct pose-write), not torque.
- R11 MED — MOTION multi-Wheel double-rotation. → dedupe by component (seenPrim Set) + tie-break.
- R12 MED — ECONOMY runaway (Filament = cheapest magic, uncapped). → modest 1.0 default, #1 playtest knob, don't pre-cap.
- R14 MED — physics-cause sever excluded from DEFENSE resist. → resist gate branches on cause.

## 3. DETERMINISM CONTRACT
Host/solo-only; no RNG/wall-clock; no order-dependent float-sum over a collection unless id-sorted (ECON/MOTION-midpoint/G2/DEF all exempt — point-lookups/fixed-arity); MOTION precompute sin/cos + keep prevPos consistent; DEFENSE reset counter in reconcileFouledPrimitives; mirror RESULT not force; each behavior gets its OWN run-twice-from-seed byte-equal test (save.replay.test.ts does NOT cover these paths — false confidence).

## 4. HARD DESIGN QUESTIONS (for Council)
- (a) MOTION true rigid rotation (recommended — distance-preserving isometry the solver sees as satisfied) vs visual-only vs deferred. Lock pivot/direction/multi-bond dedupe/sweep-vs-rotate-through.
- (b) DEFENSE per-hazard: player-RMB=2-charge, Voltkin=absorb-first (host-only Set), potato=EXCLUDE. Bond vs component granularity; client-visible clang or host-local; protocol bump or not.
- (c) G2-PROMO: no hard breakage (size invariant holds; only `combos.test.ts` counts + `LOCKED_DECISIONS §6` doc amend); 8× balance ratification.
- (d) ECONOMY: double-count (magic + trickle) is INTENDED — document it; runaway knob.
- (e) G2-TRAITS: stiffnessTier LIVE, areaMultiplier DEAD — minimal scheme varies feel not score; set user expectation. Territorial stiffnessMultiplier stacks (LOW in enemy territory → 0.06 effective, may feel floppy).

## 5. RECOMMENDED SCOPE & SEQUENCING
Independent commits by ascending risk: 1) ECONOMY Filament (Micro) → 2) G2-PROMO (visual-complete) → 3) G2-TRAITS (gated on lock-amend) → 4) MOTION Wheel+Star (Standard) → 5) DEFENSE (Standard→Full).
**CUT-LINE (honest: batch = 3–4 sessions):** MUST-HAVE single-session core = **ECONOMY Filament + MOTION Wheel/Star** (~30–40K tokens, ~1 KiB bundle, zero new wire surface). DEFER: DEFENSE (own session) + ALL G2 (TRAITS lock-amend + PROMO 8× playtest each own session).

## 6. BUNDLE / TEST
~3.3 KiB headroom; ECON/G2-TRAITS/G2-PROMO-data negligible; MOTION + G2-PROMO-visual ~1 KiB; DEFENSE 1.5–3 KiB (#1 risk). Each behavior needs its own determinism test; `combos.test.ts:71-77` breaks under both G2 items; `:24,26` counts break under G2-PROMO.
