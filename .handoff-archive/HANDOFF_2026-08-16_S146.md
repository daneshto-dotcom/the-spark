═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-08-16
Session: S146 — two owner fixes shipped, then the owner pivoted the game to a classical tower defence
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (2D real-time multiplayer geometric builder → **pivoting to tower defence**)
- Working directory: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
- Git branch: master · Latest commit: `<see git log -1>` · **0 unpushed**
- Tech stack: TypeScript + Pixi v8, host-authoritative snapshot sim, optional Web Worker, WebRTC
- PROTOCOL_VERSION **22** (was 21)

## CURRENT STATE
- Build: PASSING · tsc 0 · bundle 689.3 KiB (cap 900, 210.7 KiB headroom)
- Tests: vitest **2425/2425** across 157 files · e2e:gating **39/39**
- Deployment: LIVE, verify-deploy **4/4**, live asset `index-d98_KqN1.js`
- MCV: 16 assertions, hard_fail=0, **exit 0**
- Context at close: **622,712 / 1,000,000 (62.3% YELLOW)**

## SESSION COST
Opus 5 throughout (ALWAYS-STRONGEST). Council: Grok 2 calls, Gemini 2 calls (~$0.12 total).
493 messages with usage. Model-routing counter absent → per-tier split unavailable.

## THIS SESSION'S WORK

**P1 — loose-spark repulsion DELETED (`e85931d`).** Owner: *"the primitives push each other off like
an antimagnet… now that we have gatherers there is no use for that anymore."* `resolveCollisions` ran
8 iterations/substep over `freeSparks`; because Verlet reconstructs velocity from position, a
positional shove IS an impulse. ⚠ NOT the same mechanism as the earlier anti-magnetism fix
(`constants.ts:644`), which removed the PLACEMENT impulse. `SpatialGrid` deleted with it — it had no
consumer outside the collision pass. `collision.pile.test.ts` replaced by `noSparkRepulsion.test.ts`,
which asserts the property BEHAVIOURALLY through `stepPhysics`.

**P2 — LIMITLESS castle inventory, counted by type (`7c2def1`, `7da9107`).** `CastleBank` went from
`Spark[]` capped at 7 to a FIXED 6-slot tally indexed by `SparkType`, uncapped. `CASTLE_BANK_CAP`
DELETED. A fixed array, not a `Map`, because Map insertion order would desync the hash. `PULL_FROM_BANK`
KEPT (both Council seats said retire it — both wrong, it is the entire bot supply chain) and
re-implemented type-addressed, minting from a DESCENDING NEGATIVE id space provably disjoint from the
Spawner's ascending ids. This DELETED a hazard class: `migrationClaim`'s S141 bank scan is now
unnecessary. Gone with the cap: `bankIsFull`, WAITING-on-full, `shouldReleaseWaitingCargo`,
`parkCargoOnPorch`, the S145 decant click, the scarcity suspension in `pickGathererTarget`.

**THE PIVOT — design + planning (`bb50861` … `<latest>`).** The owner redefined SPARK as a classical
tower defence via handwritten notes + two hand-drawn maps + six review rounds. Produced:
- `SPARK_TD_BLUEPRINT.md` — design, **40 rulings**, adapt-vs-rewrite decision (3-way Council, unanimous
  ADAPT), current-state audit.
- `SPARK_TD_SESSION_SPECS.md` — **11 sessions**, each with objective, data model, determinism
  obligations, protocol y/n, tests, exit gate, traps. §1 answers **13 open questions**.
- Published artifact: https://claude.ai/code/artifact/3eecf851-b88e-4c5c-abd8-e95edf5edd4e

**⭐ A.0 FINDING that shrank the roadmap:** the owner's income model (scaled by complexity, degrading
with connectors, plain structures earning) is **already shipped** — `scoring.ts` has accrued
`0.05 × complexity / PHYSICS_HZ` since S76, where `complexity = #prims + 2×#magicBonds`. The work
reduces to gating it to the FIGHT phase: one guard, one call site.

## OPEN ISSUES
- **CF1 (HIGH, blocks the worker flip only):** under `?worker=1` click-to-build spends shapes and
  builds nothing. Opt-in, `WORKER_DEFAULT_ON=false`, zero live blast radius. S146 **refuted** its
  leading theory (`workerSim.ts:218` sets `isHost=true`; `netSnapshot` carries `defenders`;
  `applySnapshotCore` rehydrates them). Needs a runtime probe.
- CF3 — sweep for other specs whose seeding hides a real-path failure.
- `e2e-quarantine` still fails (~8 genuinely failing joiner tests) — pre-existing, EXPECTED.
- Hand-drag placement e2e remains flaky.

## BLOCKED ON
Nothing blocks S147. Every design question has an answer in the specs §1, marked [OWNER] or
[CLAUDE — overridable].

## NEXT STEPS
1. **S147 — the match clock, ALONE.** Full spec in `SPARK_TD_SESSION_SPECS.md` §2.
2. S148 zones + anchors + build legality (**re-tune the economy in the same session**).
3. S149 walls + shelter · S150 castle · S151 towers+orders · S152 fix/scrap · S153 projectiles+goblins.
4. S154 roster · S155 footer · S156 modes · S157+ balance.
5. CF1 before any worker work.

## CHANGED FILES
~45 files. Deleted: `collision.ts`, `spatial.ts`, `collision.pile.test.ts`,
`gathererWaitingRelease.test.ts`, `bank-deadlock.spec.ts`, `bank-throughput.spec.ts`.
New: `noSparkRepulsion.test.ts`, `SPARK_TD_BLUEPRINT.md`, `SPARK_TD_SESSION_SPECS.md`.

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: **2/2 code complete**, 1 deferred by design | 622K/1M (62.3% YELLOW)
- P1 Kill loose-spark repulsion — completed — `e85931d`
- P2 Limitless counts inventory + PROTOCOL 21→22 — completed — `7c2def1`
- P3 Footer band + gatherer menu — **deferred into the roadmap (S155)**, since the match structure
  it would have been built against was redefined hours later

## REFLEXION ENTRIES (this session)
8 appended, log pruned 58 → 48. Headline:
`#the-council-told-me-to-delete-the-bots-supply-chain` · `#empirical-refutes-plausible-criticals` ·
`#the-forcing-function-caught-what-i-forgot` · `#length-is-six-even-when-empty` ·
`#my-own-patch-deleted-the-thing-i-was-documenting` ·
`#an-audit-that-only-checks-rulings-misses-the-notes` · `#the-feature-was-already-shipped`

## CARRY-FORWARD PRIORITIES
1. P3 footer band + gatherer preference menu — deferred to S155, fully specced.
2. CF1 `?worker=1` ignition — open, theory refuted, needs a runtime probe.
3. CF3 seeding-hides-failures sweep — open.
CF2 (`CASTLE_BANK_CAP` 7 vs 12-13) is **RESOLVED** — the owner ruled limitless; the cap is deleted.

═══════════════════════════════════════════════════════════
