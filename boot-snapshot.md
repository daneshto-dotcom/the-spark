# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-09 | Session: S78

## ⭐ NEXT STEPS (S78 shipped 3 playtest fixes — all need YOUR feel-test)
1. ⭐ **PLAYTEST the 3 fixes** on https://spark-online.space/ (live, baa33f2):
   - **GAME LENGTH** — income rate 0.15→0.05 (3× slower). Does a game now last ~5-6 min instead of ~2? Knob: `SCORE_INCOME_PER_COMPLEXITY_PER_SEC` in `src/constants.ts`.
   - **RANDOM EXPLOSIONS** — a free (un-picked-up) potato now DISSIPATES harmlessly instead of blowing up the centre board. Confirm the random centre blasts are gone (CARRIED/ARMED potatoes still detonate = hot-potato intact).
   - **SEAGULL** — `SEAGULL_SPEED` 4.5→3.15 (−30%; crosses in ~10s). Right speed now?
2. Confirm CI **E2E green on 1fe0d6e** (run 27229270275) — Rule 22. (baa33f2's E2E FAILED on a hunter.spec 15s timeout from the income cut; fixed in 1fe0d6e + local playwright pass 14.1s.)
3. If the game STILL ends too fast: next lever is `PHASE_1_WIN_SCORE` 50→~150 + `SCORE_TIER_STEP` 15→~50 (audit rec for ~5-7min; `HUNTER_TRIGGER_SCORE` auto-scales). Seagull still off → `SEAGULL_SPEED` / `SEAGULL_SPAWN_MIN/MAX_SPARKS` (15/24, ~every 2min).

## Audit Findings To Fix (found S78, user deferred to "next session")
- **[HIGH]** `fouledPrimitives` leaks stale ids on sever/bomb/potato destroy paths → add `world.fouledPrimitives.delete(primId)` at disruptionManager.ts:165 + potatoLifecycle.ts:187; ALSO an un-cleanable income-stuck-at-0 state when a fouled structure is severed off its splat-anchor.
- **[HIGH]** client-side sender-auth: clientHandlers.ts trusts ANY peer's GODLY_TRIGGER/NETSNAPSHOT/START_GAME_SIGNAL/ENDGAME → 1-line host-peerId gate (closes backlog #2 client-side; a spoofed snapshotSeq can WEDGE a victim).
- **[MEDIUM]** spawner nextId+5 RNG streams not serialized (restore() can't resume; latent/test-only) · 3+player host-loss limbo (no overlay, no host-migration) · CREATURE_CHARGE not drain-filtered (effectsRenderer.ts:64) · worldTypes.ts:189-197 fouledPrimitives doc stale (code is correct).
- **[LOW]** gameState.ts:7-8 + addScore stale docstrings; protocol DEV `as 7` cast; softReset omits fouled/hazard clears (inert).

## Blockers
None blocking. CI NOTE: baa33f2's E2E **FAILED** (hunter.spec.ts:66 15s timeout — the income cut tripled the hunter's natural-accrual trigger time). **FIXED in 1fe0d6e** (hunter e2e now injects the host score → income-rate-independent, robust to future win-score tuning); verified locally (playwright hunter.spec 14.1s pass); CI re-run **27229270275** confirming green. Deploy GREEN throughout. NO protocol bump (still v7).

## Pending Backlog
#3 EYES fog fuzzy-edge + CVD shape-icons · #4 live-play netcode infra (host-migration/reconnect/6p; natural home for the spawner-RNG-serialization + sender-auth fixes). Deferred plan: S69 P2 lobby seat-UX visual refactor.

## Recent Reflexion (last 2 sessions)
**S78** — 3 playtest fixes (baa33f2): income 0.15→0.05, FREE-potato harmless-dissipate, seagull −30%. Root-caused each before coding (random explosions = free-potato auto-detonate; short game = income crosses WIN=50 mid-build-ramp — verified once-per-tick, a balance issue not a code bug). Minimal-risk levers (rate-only keeping WIN=50; dissipate mirrors DISSIPATE_BOMB; no protocol bump). Caught the exhaustive KNOWN_GAME_ACTION_TYPES Record requiring the new key. PROCESS: the 3-agent parallel audit was thorough (found 2 HIGH + 4 MEDIUM) but slow (~48min) — user pushed back; lesson = under time pressure lead with direct root-cause reads of the NAMED symptoms, time-box the broad fan-out.
**S77** — rainbow 8/14 (P1) + global-reach fog-exempt (P2) + NEW seagull hazard (P3, FULL, PROTOCOL 6→7). Mirrored the hunter/potato pattern end-to-end; Council scoped the income-halt to the hit structure (component); avoided the Verlet implicit-velocity decay trap.
