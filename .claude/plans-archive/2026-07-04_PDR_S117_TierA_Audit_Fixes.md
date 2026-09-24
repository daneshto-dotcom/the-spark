# PDR — S117: Tier-A audit fixes (F1a perf + F3/F4/F5 consistency + F6 deps)

**Date:** 2026-07-04 · **Tier:** Standard (P1 is a determinism-critical hot-path refactor) · **Council:** 3-WAY R1 (Grok-4.20-reasoning + Gemini-2.5-pro + Fable 5 Supervisor) + PRIME-AUDIT
**Approval:** USER — "approved to run per your recommendations" (the AUDIT_S116.md Tier-A recommendation: F1 memoization + F3/F4/F5/F6 cleanup).

═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S117: Tier-A audit fixes
═══════════════════════════════════════════════════════════

OBJECTIVE
  Execute the audit's Tier-A batch: (P1) kill the top per-tick host-perf waste
  (F1a) with a byte-identical single-pass complexity computation; (P2) clear the
  consistency/hygiene drift the audit found (F3 dead areaMultiplier, F4 stale
  "Magic-12" doc, F5 stray HANDOFF clutter); (P3) patch-bump deps (F6). Deferring
  F1b (territory global-labeling) to its own increment per Council risk-isolation.

CURRENT STATE (S116 audit @ 7aed58a; master clean; tsc 0; vitest 1779/1779)
  - scoring.tickScoring calls computeComplexity(world,p) PER PLAYER each tick —
    each call walks ALL primitives + ALL bonds (lookupCombo per bond). O(P×(prims+bonds)).
  - VERIFIED: computeComplexity counts INTEGERS (primCount++/magicBonds++/…) then
    does the float math ONCE in a single final expression — it does NOT accumulate
    floats in a loop. (This refutes Grok's float-order REJECT — see BATTLE LEDGER.)
  - areaMultiplier: on all 36 combos + LOCKED §6 schema, ZERO production consumers.
  - LOCKED_DECISIONS.md:800 says "Magic-12 silhouettes" (stale; now Magic-14).
  - 64 HANDOFF_*.md in root (~41 untracked); protocol archives to .handoff-archive/.
  - deps: trystero 0.25.0 (0.25.2 avail), pixi 8.18 (8.19 avail).

SCOPE (3 priorities)
──────────────────────────────────────────────────────────
P1 — F1a single-pass complexity (state/scoring.ts + new test)
  1. NEW computeAllComplexities(world): Map<PlayerId,number> — ONE pass over
     world.primitives (bucket primCount + owned-spawner by placedBy, skip fouled),
     ONE pass over world.bonds (bucket magic/functional/filament by the aId-owner
     with the IDENTICAL predicates: a=get(aId) skip-if-undefined/wrong-owner,
     b=get(bId) skip-if-undefined, skip-if-fouled(aId||bId), classify), then per
     player apply the IDENTICAL final expression:
       primCount*PRIM_WEIGHT + magicBonds*MAGIC_BONUS +
       min(functionalBonds, floor(FUNCTIONAL_BOND_CAP_PER_PRIM*primCount))*FUNCTIONAL_BOND_COMPLEXITY +
       filamentBonds*FILAMENT_INCOME_COMPLEXITY + spawnerCount*SPAWNER_INCOME_COMPLEXITY
     Byte-identical BY CONSTRUCTION (same integer counts → same one-shot expression).
  2. computeComplexity(world,p) becomes a THIN WRAPPER over computeAllComplexities
     (Gemini: single source of truth — no parallel drift). Single-shot callers
     (WIN-forensics log in gameState.ts, debugOverlay) keep working; the per-match
     WIN cost is negligible.
  3. tickScoring computes the map ONCE, reads per player in the accrual loop.
  4. NEW state/scoring.differential.test.ts — bit-exact (Object.is/toBe) equivalence
     of computeAllComplexities vs a reference per-player loop across many random
     worlds (interleaved ownership, 0/1/N players, fouled prims, spawners, cap
     boundary, empty). Plus the 24 save.replay byte-identity tests as the HARD gate.

P2 — F3/F4/F5 consistency & hygiene
  5. F3 areaMultiplier: assess refs (incl. tests). If ZERO non-doc consumers →
     remove the field from ComboOutcome + all 36 entries + FUNCTIONAL_DEFAULTS +
     amend LOCKED §6 schema (dead-data removal). If any test references it → leave
     + add a one-line "reserved/unused" note (no silent scope-creep).
  6. F4 LOCKED_DECISIONS.md:800 "Magic-12"→"Magic-14"; add Anchor+Spindle to the list.
  7. F5 move the ~41 untracked stray HANDOFF_*.md from root → .handoff-archive/.

P3 — F6 dep patch bumps (package.json + lockfile)
  8. trystero 0.25.0→0.25.2, pixi ^8.5.0→^8.5.0 (already caret; refresh lock to 8.19).
     npm install; full tsc + vitest. Revert if any test regresses.

NO CHANGES TO
  PROTOCOL_VERSION (14); save/wire format; territory formula/behavior (F1b deferred);
  the final complexity ARITHMETIC (expression kept verbatim); any gameplay balance;
  deploy (manual). No new hazards/combos.

RISK ASSESSMENT
  R1 (P1 determinism — THE risk): a bucketing predicate diverging from the per-player
     loop → replay desync. MITIGATION: predicates copied line-for-line; final
     expression kept verbatim; bit-exact differential test + 24 replay tests gate it.
     Council float-order REJECT REFUTED by code read (integer counts, one-shot float).
  R2 (P1 maintainability): parallel paths drift. MITIGATION: computeComplexity is a
     wrapper — ONE implementation (Gemini mandate).
  R3 (P2 F3): removing a LOCKED-schema field. MITIGATION: assess-first; only remove
     if zero refs; else document. Amend LOCKED §6 in lockstep.
  R4 (P3): a patch bump breaks a test. MITIGATION: full suite gate; revert on red.

TESTING PLAN
  P1: new bit-exact differential test + full vitest (1779+N) + ALL 24 save.replay
      byte-identity + tsc 0. P2: tsc 0 + vitest (F3 touches combos.test) + git status
      shows handoffs moved. P3: npm install + tsc 0 + full vitest. Each priority its
      own commit + RALPH:PATROL. Deploy deferred (manual; owner playtests later).

TOOL TRIAGE
  Visual output?      No — sim/perf refactor + docs + deps.
  Research/external?  Done — 3-way Council on the F1a design this session.
  Artifact delivery?  No — code + tests in-repo.

DIFFERENTIAL_TEST_REQUIRED: true — P1 is determinism-critical; the bit-exact
  differential test (new === reference across random worlds) IS the equivalence proof.
HOT_PATH_REFACTOR: true — P1 touches the per-tick scoring path → already at 3-way
  Council R1 (satisfied this session).

BATTLE LEDGER (R1) + PRIME-AUDIT
  P1 F1a: Grok REJECT (float summation order: "N*0.6 vs incremental +=0.6 in Map
    order"). → SUPERVISOR OVERRULE with code evidence: the original counts INTEGERS
    then multiplies ONCE (primCount*PRIM_WEIGHT + …) — there is NO incremental float
    accumulation; keeping the final expression verbatim makes the result byte-
    identical by construction. Grok's kill-shot rested on a misread of the code.
    Gemini ADOPT-WITH-MANDATES (canonical wrapper + Object.is bit-exact differential
    test + deterministic player order) → ALL ADOPTED.
  Ship split: Grok said "F1b only"; Gemini said "F1a only". → SUPERVISOR: ship F1a
    (hotter path, byte-identical by construction, lower real risk once the misread
    is corrected); DEFER F1b (territory union-find + placerColor-keyed labeling —
    Grok's valid "labeling must respect the exact player-relative rule" fix earns
    its own increment + differential test). Risk-isolation honored (Gemini).
  CARRY-FORWARD (logged, not dropped): F1b territory global component-labeling
    (union-find, placerColor-keyed, own differential test) + F2 placement-path
    radius reuse.

ESTIMATED TOKENS: ~28K | MODEL: strongest pinned (session reports opus-4-8; MODEL
  DRIFT WARN surfaced to owner — settings/CLI pin issue, not a scope matter).

═══════════════════════════════════════════════════════════
  GATE: USER-APPROVED ("approved to run per your recommendations") — same-turn
  flag-write + execution; mandatory 3-way Council + PRIME-AUDIT recorded above.
═══════════════════════════════════════════════════════════
