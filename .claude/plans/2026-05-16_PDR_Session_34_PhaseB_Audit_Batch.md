# PDR — Session 34 Phase B — Fresh-audit cleanup batch

**Status:** DRAFT — awaiting Council R1 + PRIME-AUDIT + final flag
**Tier:** Standard (batch aggregate, mostly Micro individuals)
**Origin:** S34 Phase A close authorized "rerun full methodical and pedantic audit"; user pre-approved post-Council changes through `/handoff`
**Date:** 2026-05-16
**Approval signal:** User explicit *"i approve any changes to session batch after full council consideration ... so you can work autonomously until /handoff"*

---

## A.0 STATE-DISCOVERY REPORT — 4 parallel agent audits + PRIME-AUDIT triage

| Dim | Audit P0 | Audit P1 | Audit P2 | PRIME-AUDIT verdict |
|---|---|---|---|---|
| Test-determinism | 0 | 3 | 1 | All 4 VALID — no false positives |
| Runtime-correctness | 1 | 2 | 0 | **3 of 3 FALSE-POSITIVE** — control flow already guards each case |
| Docs-drift | 1 | 2 | 0 | All 3 VALID |
| Code-quality | 0 | 1 | 1 | 1 VALID (P1); 1 NON-ISSUE already-documented (P2 noted by agent as "no action needed") |

**Net actionable after PRIME-AUDIT:** 9 items (1 P0, 6 P1, 2 P2). 3 false-positives dropped + 1 already-documented P2.

### PRIME-AUDIT REJECTED findings (with evidence)

1. **REJECTED — Runtime P0 `computeCreatureTint` div-by-zero (creatureRenderer.ts:348)**
   - Agent claim: `progress = ticksInState / VOLTKIN_ATTACK_FIRE_TICK` divides by zero if FIRE_TICK=0.
   - Evidence: line 347 guard `if (state === 'ATTACKING' && ticksInState < VOLTKIN_ATTACK_FIRE_TICK)` PREVENTS body execution when FIRE_TICK=0. `ticksInState >= 0` always, so `ticksInState < 0` is impossible — the dangerous division is unreachable.
   - Downgrade: redirect to P2 "tighten voltkin-config invariant test from `>= 0` to `> 0`" so a future Anvil config can't bypass the implicit guard.

2. **REJECTED — Runtime P1 leanFactor subnormal underflow (creatureRenderer.ts:400)**
   - Agent claim: `dist` may underflow without triggering `1e-6` guard.
   - Evidence: `Math.sqrt(dx*dx+dy*dy)` is monotonic non-negative; if both dx,dy ≤ subnormal threshold the inputs underflow to 0, sqrt(0)=0, `0 < 1e-6` triggers the guard and returns 0. No path to NaN.

3. **MOOT — Runtime P1 atan2(0,0) co-located primitives (redundantBondTargets.ts:75)**
   - Agent claim: co-located primitives yield "non-deterministic" angle selection.
   - Evidence: `Math.atan2(0,0)=0` is well-defined; Set iteration in JS is insertion-order (deterministic in tick-sim); bond solver doesn't permit two primitives at exact same position in normal play. Degenerate edge case, deterministic outcome, no fix warranted.

### PRIME-AUDIT pattern (rolling across S33, S34 Phase A, S34 Phase B)

Audit-agent false-positive rate **3 of 32 findings (~9%)**, consistently on "scary pattern without verifying guard." S33 P1-7 (cutsceneOverlay belt-and-suspenders comment), S34 P2-18 ('godly' variant documented intent), S34-PB Runtime P0 (control-flow guards), S34-PB Runtime P1 (epsilon guard). **Future audit triage MUST grep ±10 lines around any "scary" code for a guard / comment before accepting the finding.**

---

## 1 · OBJECTIVE

Close the actionable findings from the fresh audit pass — improve test coverage on 3 reducer paths missed by replay-determinism, fix 1 P0 doc-drift (BACKLOG status markers), 2 P1 doc-drifts (Blueprint + LOCKED frontmatter), delete 1 dead export, harden 2 config invariants.

---

## 2 · SCOPE (9 priorities)

### PB-1 — BACKLOG.md status header refresh (**P0 Micro, ~6 LOC**)

`BACKLOG.md:17, 43, 64` — change `[PLANNED]` → `[COMPLETED] (2026-05-13)` / `[COMPLETED diagnostic-only] (2026-05-14)` / `[COMPLETED] (2026-05-16)` for Sessions 31 / 32 / 33. Add Session 34 entry at top.

### PB-2 — SPARK_Blueprint.md status line refresh (**P1 Micro, 1-2 LOC**)

`SPARK_Blueprint.md:6` — change "Phase 1 in progress" → "Phase 1 complete + Phase-2 Tier-0 (1v1 networked) + Phase-2 Tier-1 (Sever-as-disruption + multi-color + audio + Voltkin godly). Live at spark-online.space."

### PB-3 — LOCKED_DECISIONS.md frontmatter refresh (**P1 Micro, 1-2 LOC**)

`LOCKED_DECISIONS.md:3` — change "Frozen at end of Planning Session, 2026-05-09" → "Frozen at end of S34 Phase A, 2026-05-16. §13.15 (Phase-2 godly/creature) locked S34 P2-19."

### PB-4 — Delete dead `clearRegistry` export (**P1 Micro, -3 LOC**)

`src/state/godlyRecipes/index.ts:31-33` — `clearRegistry()` is exported but has zero importers (grep confirmed). No tests register it. Delete. If S35+ tests need fresh registry state, they can re-add a more explicit `__resetForTests` helper.

### PB-5 — Replay-determinism: extend `runStress` to cover creature lifecycle (**P1 Micro, ~30 LOC**)

`src/state/save.replay.test.ts` — current `runStress()` covers SPAWN_SPARK / PICKUP_SPARK / PLACE_PRIMITIVE / TICK_ENERGY / SEVER_BOND. Missing creature actions added S25-S28: SPAWN_CREATURE, CREATURE_TICK, CREATURE_ATTACK. Extend the stress sequence so the byte-exact replay guard catches any creature-side determinism drift (the entire concern that drove S33 P1-12).

### PB-6 — `applyUpdateAvatarPos` unit test (**P1 Micro, ~12 LOC**)

`src/state/gameMode.ts:154-160 applyUpdateAvatarPos` is a public reducer surface (dispatched via UPDATE_AVATAR_POS action in 1v1 client→host net path) but has no direct unit test. Add `session15.test.ts` test verifying avatarPos mutation on dispatch + no-op on unknown playerId.

### PB-7 — ARC_FLASH legacy round-trip assertion gap (**P1 Micro, 1-2 LOC**)

`src/state/save.test.ts:320-324` — existing round-trip test asserts ARC_FLASH start + end + tick but doesn't assert `creatureId === undefined` on the pre-S33 legacy case. Add the explicit assertion to lock the back-compat contract per S33 P1-11.

### PB-8 — Tighten `voltkin-config` `attackFireTick` invariant test (**P2 Micro, 1 LOC**)

`src/state/creatures/voltkin-config.test.ts` — current invariant `expect(VOLTKIN_CONFIG.attackFireTick).toBeGreaterThanOrEqual(0)` permits 0 which would make `computeCreatureTint` skip its non-trivial branch entirely (correct via control flow but undocumented). Tighten to `> 0` to lock the invariant that wind-up duration is nonzero. Documents the implicit guard from PRIME-AUDIT.

### PB-9 — `creatureAttack.test.ts` weak assertion strengthen (**P2 Micro, 1 LOC**)

`src/state/creatures/creatureAttack.test.ts:141` — change `expect(severs.length).toBeGreaterThanOrEqual(1)` → `expect(severs).toHaveLength(1)` for the two-prim chain test. Catches mutations that would produce 0 or 2+ severs instead of letting `>= 1` rubber-stamp.

---

## 3 · TESTING

- Baseline: 620/620 ✓
- Per-priority test delta:
  - PB-1/2/3: doc only (0 test delta)
  - PB-4: -3 LOC; no test impact
  - PB-5: ~+1-2 tests (extend existing stress runs OR new "creature replay" describe block)
  - PB-6: +1 test
  - PB-7: 0 net (extend existing test with one expect)
  - PB-8: 0 net (modify existing expect)
  - PB-9: 0 net (modify existing expect)
- Target: 620 → 622-624

## 4 · ROLLBACK

Per-priority commits. Doc fixes are revertible 1-LOC each. Test additions don't affect production runtime. clearRegistry delete revertible from git history.

## 5 · DELIBERATION QUESTIONS for Council R1

- **Q1 (PB-4 disposition):** delete `clearRegistry` vs keep for hypothetical future test helper vs convert to `__resetForTestsOnly` with explicit `@internal` tag like seekForce siblings?
- **Q2 (PB-5 scope):** extend `runStress` body inline (single integrated stress run) vs add a NEW describe block specifically for creature replay (`'creature lifecycle replay-determinism'`)? Risk of false-positive failure if creature lifecycle requires GODLY_TRIGGER + cinematic setup that increases test runtime substantially.
- **Q3 (PRIME-AUDIT false-positive rate calibration):** 3 of 32 audit findings rejected — is the audit-agent prompt structure mis-tuned ("flag scary patterns" prompts skip guard-check), or is rate within normal tolerance for cheap parallel-agent coverage?
- **Q4 (PB-8 redundant guard):** add an EXPLICIT runtime guard in `computeCreatureTint` even though control flow already prevents the bad case, OR rely solely on the tightened test invariant?

## 6 · ESTIMATE

- **Tokens:** ~8-12K execution (Micro-aggregate; mostly Micros)
- **LOC:** +50 LOC tests, +6 LOC doc, -3 LOC source. Net +53.
- **Bundle delta:** 0 (tests + docs only; clearRegistry already unused so tree-shake-eligible)
- **API spend:** Council R1 ~$0.10
- **Risk:** LOW across all 9 — most invasive change is PB-5 test extension which the existing replay guard verifies

## 7 · SUCCESS CRITERIA

1. All 9 priorities shipped OR documented carry-forward
2. 622+ tests passing
3. Bundle ≤ 468.5 KB
4. P1-12 replay-determinism test stays green after PB-5 (the test EXTENDING itself shouldn't regress its own bar)
5. Per-priority commits + push
6. session-state.json updated with check_completed + check_method per priority
7. reflexion entries added at session close
8. `/handoff` produced

---

## CARRY-FORWARD

- 3 audit-agent false-positives logged as reflexion pattern (#audit-agent-flags-scary-without-verifying-guard) — recurring across S33+S34.
- ~~Runtime atan2 co-located edge case~~ — MOOT, documented in PRIME-AUDIT, not a fix.
- ~~leanFactor subnormal~~ — false alarm, no carry.
- ~~computeCreatureTint div-by-zero~~ — addressed by PB-8 test tightening; no runtime guard added.
- User-noted bugs (from S31/S32 carry) — still pending; user said "i will check later."
