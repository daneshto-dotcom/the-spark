# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-24 | Session: S42 (BUG-CRITICAL-1 Real-Time 1v1 Restoration — shipped + verified live)

## Live URL
**https://spark-online.space/** — `Last-Modified: 2026-05-24T12:17:23Z` (FRESH, S42 real-time restoration live)
**https://spark-online.space/?debug=1** — debug overlay + `[net]` + `[cinematic]` + `[creature]` logs

## Status
S42 was a Full-tier execution session: BUG-CRITICAL-1 (real-time 1v1 restoration) shipped to production after Council R1+R2 deliberation. The user discovered after S41's fresh deploy that the 1v1 mode was turn-based (PLAYER 2'S TURN · SPACE to end) — a regression from S15 P2 (commit add497f, 2026-05-12) where END_TURN action + currentPlayerId + requireActivePlayer gate were added WITHOUT amending the blueprint. The blueprint locks `SPARK_Blueprint.md:3` as "A Real-Time Multiplayer Game" + lines 36-56 specify real-time core loop. Full teardown of turn-based system + first-Intent-wins race resolution + diagnostics counter for observability.

**Tests:** 754/754 PASS (was 759 — net -5; -11 deleted hotseat/END_TURN/active-player tests + 6 added race/real-time/back-compat tests)
**Bundle (app code):** 472.87 KB local / 472924 bytes live (parity); 500 KB cap (27.13 KB headroom)
**Branch:** master, clean, in sync with origin at `6e3bfaf` (S42 BUG-CRITICAL-1 commit)
**Context at close:** S42 Full tier; Council R1+R2 (~8K Council overhead + ~25K execution) + verification ~35-40K total
**Live production state:** S42-current (real-time gameplay shipped). 4-layer verification 10/10 PASS.

## What S42 Shipped (commit 6e3bfaf, deploy run 26360989574)

### Removed (turn-based teardown)
- `src/state/authGate.ts` — DELETED entirely (36 LOC)
- `requireActivePlayer` calls at 4 reducer sites (PICKUP, DROP, PLACE_PRIMITIVE, SEVER_BOND cause='player')
- `END_TURN` action + `applyEndTurn` handler + dispatch case + `EndTurnAction` type + GameAction union member
- `currentPlayerId` field from World interface + makeWorld init + applyStartGame/applyReturnToTitle resets + main.ts:978 physics-SEVER source (hardcoded asPlayerId(0))
- `onKeyDown` SPACE→END_TURN handler in controls.ts + window event listener
- `turnBadge` field + creation + sync in ui.ts (top-center "PLAYER N'S TURN · SPACE to end")
- " · SPACE end turn (1v1)" suffix from main.ts:394 bottom hint
- `END_TURN: true` from `KNOWN_GAME_ACTION_TYPES_RECORD` wire allowlist

### Added (real-time + observability)
- `World.diagnostics.raceRejects` counter (non-serialized; reset on START_GAME + RETURN_TO_TITLE)
- `World.localPlayerId: PlayerId` (non-serialized convention; main.ts sets to asPlayerId(1) on client join; HUD reads this instead of removed currentPlayerId; guard handles early-frame race)
- Silent-return-instead-of-throw for SHARED-RESOURCE races:
  - `applyPickupSpark` line 90 (spark.state !== Free) — was throw, now silent+counter
  - `placePrimitive` target-missing — moved check BEFORE primitive creation so carry is preserved; was throw mid-function, now silent+counter

### Kept (player-owned violations stay throw per Council R2 distinction)
- `applyDropSpark` CarryViolation (own carry slot — no race possible)
- `placePrimitive` CarryViolation + missing-carried-spark (own invariants)
- `applyPickupSpark` missing-spark (true invariant, not race)
- `canSeverBond` charge<1 already silent (no change)

### Save back-compat
- `WorldSnapshot.currentPlayerId?` kept as ignored-optional slot for pre-S42 saves (Council R1 Battle Ledger row 2 — zero-migration). New saves omit it.

## Next Steps (priority order)

1. **🟡 USER ACTION (highest priority)**: 2-peer 1v1 smoke test (S35-P11 carry, now 7 sessions overdue + covers ALL fixes through S42 INCLUDING real-time restoration). Hard-refresh `https://spark-online.space/?debug=1` on 2 devices. Host clicks "1v1 (2 Player)" → create room → share code → peer joins → Host clicks "Begin". **Expected behavior post-S42**: both players can simultaneously grab sparks from spawner zone (no waiting for "their turn"), both can drag primitives out of zone without snap-back, both can build structures concurrently, no "PLAYER N'S TURN · SPACE to end" badge anywhere, SPACE key does nothing. If anything fails: capture the diagnostic strip readings + open BUG-A3 PDR with observed values.

2. **vite/vitest CVE major bump** — dedicated session, ~20K, closes 2 moderate dev-server CVEs (carry from S37).

3. **main.ts hypertrophy refactor** — extract netMessageRouter / godlyMatcher / cinematicStateMachine / teardownNet. Multi-priority Standard batch ~30-40K with Council deliberation (carry from S37+S39).

4. **chateau-guardian CI audit** (cross-project) — chateau-guardian consumed 53% of Pro 3000-min quota in May; CI audit could free quota for all repos. Switch to chateau-guardian project for this audit.

5. **Knip per-symbol triage** — 5-10 of 42 unused exports (carry from S38, low-risk methodical pattern).

## Blockers
- **None active.** S42 shipped clean; 4-layer verification 10/10 PASS; browser smoke confirms title screen + cleaned hint text + no console errors.
- 2-peer 1v1 smoke gated only on user calendar (not on infrastructure).

## Pending Backlog (older carry-forward)
- [ ] vite/vitest CVE major bump (regression risk → dedicated session)
- [ ] main.ts hypertrophy refactor (multi-priority Standard batch)
- [ ] Continue-UI product decision on `loadFromLocalStorage` (or downgrade to test-only export)
- [ ] Per-symbol triage of 42 knip-flagged unused exports
- [ ] PRIME-AUDIT Δ7 (S36 deferred): re-compress voltkin-zap.png from WINNER source if user notices style drift
- [ ] D9 rollback ladder if S37 charge SFX subjectively grates: waveform swap → recorded sample → gain reduction
- [ ] S38 audit Pass-3 candidates
- [ ] chateau-guardian CI audit (cross-project leverage)
- [ ] Node.js 20 deprecation in deploy.yml (auto-forced 2026-06-02; deploy.yml uses actions/checkout@v4, setup-node@v4, upload-artifact@v4 — likely no action required)
- [ ] **NEW (S42)**: Client-side prediction rubber-banding UX polish (Gemini R2 weak-edge — under real-time race, P2's optimistic local carry can rubber-band when P1 wins. Defer to playtest feedback; v1 limitation acknowledged in net/sync.ts:13-15)

## What Claude resolved this session (permanent)
- ✅ **BUG-CRITICAL-1 closed**: turn-based 1v1 hotseat REMOVED; real-time per blueprint RESTORED. Commit 6e3bfaf. Deploy run 26360989574 (34s SUCCESS first attempt). 10/10 verification gate PASS.
- ✅ **Race resolution semantics codified**: shared-resource races (PICKUP, PLACE target) → silent-return + `world.diagnostics.raceRejects++`; player-owned violations (CarryViolation, missing-spark) → stay throw. Council R2 sharpened distinction.
- ✅ **Observability**: race counter introduced + tested deterministically (3 tests assert exact counter values).
- ✅ **Constitutional reflexion added** to Rule 21: PDRs touching §LOCKED systems must cite blueprint lines.
- ✅ **Browser smoke**: title screen renders cleanly, no console errors, bottom hint cleaned, "a real-time game" subtitle preserved.

## Recent Reflexion (last 2 sessions)

### 2026-05-24 — Session 42 (BUG-CRITICAL-1: Real-time 1v1 restoration; S15 design-drift fix; commit 6e3bfaf; run 26360989574; deploy 34s)
- #design-drift-can-ship-13-sessions-without-blueprint-amendment-catching-it: S15 P2 (commit add497f) added END_TURN + currentPlayerId + requireActivePlayer gate implementing 1v1 as turn-based hotseat. Blueprint:3 LOCKED says "Real-Time Multiplayer Game". 759 tests passed for the BROKEN implementation; 26 sessions accumulated on top. **Lesson: green tests verify implementation against itself, not against spec. PDRs touching §LOCKED systems must cite blueprint lines.**
- #council-r2-sharpened-shared-vs-owned-error-semantics: R1 proposed blanket silent-return-with-warn. R2 sharpened: silent applies ONLY to SHARED-RESOURCE races (spark, primitive, bond), NOT player-owned violations (carry slot, energy, charges). Applied: PICKUP not-Free → silent+counter (shared); CarryViolation → stay throw (own). **Lesson: classify each error path by resource ownership before deciding throw vs silent.**
- #race-counter-as-observability-not-just-debugging: `world.diagnostics.raceRejects` deterministically testable; resets per-match; future debug overlay can show live count. Counter > console.warn for prod observability + test assertions. **Lesson: throw→silent changes MUST add observability mechanism in same PR.**
- #boot-then-smoke-runtime-verifiability-gate-applied: Tests call real `dispatch(world, intent)` against live World. Deploy verification's bundle-grep step (10/10 PASS positive+negative shibboleths) is runtime-pass complement to static-pass typecheck.
- #first-Intent-wins-is-natural-resolution-for-trystero-p2p: Host network handler at main.ts:275 already first-Intent-wins by construction (FIFO dispatch). S42 only changed loser-handling (was throw → now silent+counter). **Lesson: audit existing path first; often "implementation" is just allowing existing arrival to be silently ignored.**
- SESSION s42-bug-critical-1-stats: 18 files changed (1 deleted), +393/-490 LOC (-97 net), commit 6e3bfaf, deploy 34s SUCCESS first attempt, 10/10 verification, tests 759→754, bundle 474.26→472.87 KB (-1.39 KB).

### 2026-05-24 — Session 41 (S40 P1 verification gate completed; production caught up 8 days; deploy 26357977462; no source commits)
- #billing-block-root-cause-was-pro-quota-exhaustion-not-failed-payment: GitHub annotation OR-phrased. User screenshot disambiguated: Pro 3000-min quota at 100% + $0 Actions ceiling. Fix: raise Actions ceiling to $5/mo.
- #deploy-verification-handshake-as-4-step-ladder: dispatch → watch → curl Last-Modified → bundle grep for fix signature. All 4 layers required.
- #path-filter-empirically-validated: structural trigger filters beat conventional ones.
- #chateau-guardian-actions-bloat-is-separate-medium-term-issue: 53% of monthly Pro quota = dedicated audit warranted.
- SESSION s41-p1-verification-batch-stats: 0 source commits, 1 deploy 42s, 8-day catch-up, 5/5 PASS.
