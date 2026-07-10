# PDR S120 — B2 worker-sim arc: phase (b) measure→pooling + phase (c) grid rebuild

**STATUS: IN-PROGRESS** · Tier: **Full** (batch) · Council: 2-round, Battle Ledger in session log
**Approval:** owner verbatim — "I approve to run top recommended priority batch … I approve full session autonomous batch!" (`unlock_source: user`)
**Foundation:** `WORKER_SIM_FOUNDATION.md` phases (b)+(c); completing both unblocks phase (d) `?worker=1` cutover (S121).

## OBJECTIVE
Reduce the host's two remaining measured/suspected per-frame cost centers ahead of the worker cutover: the 10 Hz snapshot build (phase b — MEASURE FIRST, then wire-identical optimization only if data says GO) and the 64×/tick collision-grid rebuild (phase c — hoist to 8×/tick). Zero wire/save byte changes; PROTOCOL_VERSION 14 held; no deploy (zero player-visible delta).

## SCOPE
1. **P1 — MEASURE (no product code).** Dev server :33641; two browser tabs; real Trystero duel via lobby room code. Heavy-load protocol: ≥120 s PLAYING with structures built + creatures/hazards accrued; sample `__SPARK__.snapshotProbe` at intervals (reset() between windows). Record count/avg/max build+send. **GO rule (Council #1):** GO if buildMsAvg ≥ 0.25 ms OR buildMsMax ≥ 2 ms on this dev machine (≈6× weak-host analytic factor vs 16.7 ms frame). Below threshold → NO-GO with **NEAR-MISS class** if allocation volume is still large (GC invisible to perf.mark — documented caveat). Fallback if tab-to-tab WebRTC fails: vitest microbench on heavy fixture, labeled SYNTHETIC/lower-confidence. Protocol + results table land in WORKER_SIM_FOUNDATION.md (Council #5).
2. **P2 — snapshot build-cost reduction, wire-identical (IF GO).** Mechanism = minimal that clears the measured cost (pooled arrays ⊂ skeleton-mutation; Council #2). **HARD gate: emitted NetSnapshot JSON byte-identical to fresh build** — new unit test comparing pooled-vs-fresh across stress fixtures + full replay suite green. NO delta-encode / NO ArrayBuffer wire (phase-d worker-protocol design; carry-forward logged). IF NO-GO: phase (b) marked CLOSED-BY-MEASUREMENT in foundation doc, docs-only.
3. **P3 — collision grid 64→8 rebuilds/tick.** Hoist `grid.insertAll(sparks)` out of the `COLLISION_ITERATIONS` loop **but keep it inside `resolveCollisions`** (once per substep — 8/tick; Council #3 constraint, NOT per-tick). Add 8-bit cellKey bounds dev-assert (CANVAS/cellSize < 256 per axis). NEW dense-pile hardening test (≈30-spark spawner-zone jam: two-run determinism + no-NaN/no-bounds-escape). Informational vitest bench (not a gate).

## NON-GOALS
Delta-encode; ArrayBuffer/base64 wire; worker cutover (phase d, S121); flat-array/Uint16 grid rewrite (carry-forward); client physics; field telemetry infra; CI perf spec (Actions dead — billing lock); deploy.

## APPROACH
P1 via claude-in-chrome two-tab automation (dev server via preview_start); P2 in save.ts behind the byte-equality gate; P3 minimal hoist in collision.ts + assert in spatial.ts. Post-change live A-B re-measure with the same P1 protocol (Council #1/#4).

## RISKS
- WebRTC tab-to-tab fails → SYNTHETIC fallback (severity L, plan intact).
- Pooling stale-reference/enum-order drift → byte-identity HARD gate + replay suite (M→mitigated).
- P3 stale buckets within one substep → bounded (3×3 window = 32 px slack; phantom pairs no-op per collision.ts:29; miss self-heals next substep 2 ms later); dense-pile test hardens (L).
- Measurement optimism (same-machine) → 6× analytic factor in GO rule (M→mitigated).

## TESTING
tsc 0 · vitest full green (1837 + new) · P2 byte-equality gate (if GO) · stepPhysics replay + hostTick replay + differential green · dense-pile test · live 2-tab A-B re-measure · bundle ≤750 KiB · PROTOCOL_VERSION 14 unchanged.

## ROLLBACK
Per-priority commits; single-commit reverts; no migrations; no wire changes.

## SUCCESS CRITERIA
P1 numbers + protocol in foundation doc; P2 measured reduction with byte-identical wire OR documented NO-GO/NEAR-MISS; P3 8 rebuilds/tick with all gates green; phase-(d) prerequisites (a+b+c) satisfied.

## COUNCIL CARRY-FORWARDS (logged, not silently dropped)
- Transferable ArrayBuffer snapshot format → phase-d worker protocol design (Grok).
- Flat Uint16 spatial-hash incremental grid → post-cutover perf pass (Grok).
- Field perf telemetry → owner-gated infra decision (Grok).
