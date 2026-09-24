# PDR — S119 Batch: B2 phase (a) runHostTick extraction + snapshot-cost probe

**Status:** APPROVED (user verbatim: "Approve full session batch … WORK!")
**Tier:** Full (2-round 3-way Council, 2026-07-09). Grok-4.20-reasoning + Gemini-2.5-pro, 1 call each.
**A.0:** all probes green @ 840f31f (tsc 0, vitest 1826/1826, S107 stepPhysics gate present, stateHash.ts present, succession.ts worker-seam comment present). Named delta: foundation doc's "godly matcher entangles the tick" is stale — matcher runs per-FRAME outside the drain loop.

## OBJECTIVE
Extract the host's authoritative per-tick sim body out of main.ts's ticker closure into a DOM/Pixi-free `runHostTick` unit — the prerequisite for the worker-sim cutover (owner: "smooth regardless of who hosts") — behavior preserved byte-identically. Plus the phase-(b) measurement probe.

## SCOPE
1. NEW `src/state/hostTick.ts` — `runHostTick(world, deps, state)`, verbatim move of the host-only per-tick body (stepPhysics → tickScoring → tickGameState → NONET sweep → creature-spawn/bomb/spawner/defender/creature/hunter/potato/rainbow/seagull-poop polls → bots → DROP-BENCH → DEV invariants). HostTickDeps = { spawner, grid, controls, botManager, P1, gameStateExtras, alivePeerIds, hostSeats }; HostTickState absorbs closure vars (peerAbsentSinceTick, invariantSnap, lastViolationLogTick). Shake call removed from creature loop. Sudoku freeze branch stays in main.ts.
2. `src/main.ts` — host path = one runHostTick call; client path untouched; shared tail watchers (ENDGAME, music, TITLE teardown, lastGameState) untouched in place; NEW post-drain host ARC_FLASH shake scan (mirror of client cursor pattern); alivePeerIds computed once per frame pre-drain.
3. NEW `src/state/hostTick.replay.test.ts` — HARD gate: two same-seed 1000-tick bot-seeded runs → snapshot JSON byte-identical + hashWorldState equal.
4. NEW `src/state/hostTick.differential.test.ts` — frozen-reference differential (verbatim pre-refactor loop body, provenance 840f31f) vs runHostTick, per-tick hash equality; forced-state scenarios: WIN edge, sudoku freeze, hunter spawned, live spawner+defender+drones, potato/rainbow/seagull, DROP-BENCH.
5. `WORKER_SIM_FOUNDATION.md` — phase (a) delivered; godly-matcher per-frame cadence contract + mermaid before/after diagram; correct stale matcher-inside-tick claim.
6. P2 (Micro) — dev-gated performance.mark/measure around snapshot build+stringify at the 10 Hz send site + `__SPARK__.snapshotProbe` accessor.

## NO CHANGES TO
physicsLoop.ts, save.ts, protocol/sync/net wire, reducers, godlyOrchestration.ts, render modules. Zero wire/save bytes; PROTOCOL_VERSION 14 held; godly matcher stays per-frame main-thread (carry to phase d).

## BATTLE LEDGER (condensed)
1. Granularity: verbatim single unit AGREED (Claude 1.75 + Gemini vs Grok split) — split deferred post-gate.
2. Side-effect seam: R1 events design SUPERSEDED by PRIME-AUDIT — edge watchers are SHARED (client runs music/teardown too); they stay verbatim in main.ts tail; NO event mechanism in phase (a).
3. Shake drift (Grok): OVERRULED w/ proof — no render mid-drain + replace semantics → post-drain scan render-identical.
4. Godly deferral: CONCEDED→GROK — document per-frame cadence contract now (item 5).
5. Replay-gate sufficiency: CONCEDED→GROK — frozen-reference differential added (item 4).
6. HostSimulator class: OVERRULED — fn + explicit HostTickState struct (codebase idiom); facade is phase-d API design.
7. P2 instrument: UNANIMOUS → performance.mark/measure.
8. Grok logic opts (entity fusion, edge batching): REJECTED for (a) — violate byte-identity. Logged post-cutover candidates.
9. "BotManager render-adjacent" (Grok HIGH): REFUTED empirically — bots import only sim modules.

## PRIME-AUDIT delta
R1's host-only events design would have broken CLIENT music/teardown (watchers are shared) — caught in R2 trace, events dropped from phase (a). Shake refutation proven from render-cadence + replace semantics.

## GATES
tsc 0 · full vitest (1826+new) · save.replay 24/24 byte-identical · new replay HARD gate · new differential gate · build ≤750 KiB · manual smoke solo+bots.

DIFFERENTIAL_TEST_REQUIRED: true (item 4). HOT_PATH_REFACTOR: true (core loop → Full+Council run).
EST: P1 ~40K + P2 ~4K | MODEL: claude-fable-5
