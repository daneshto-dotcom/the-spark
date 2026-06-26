# Worker-Sim Smoothness Milestone — Foundation & Cutover Plan

**Status:** Foundation laid (S107 P2). Cutover carried forward (multi-session).
**Goal (owner, S105):** "smooth regardless of who hosts; best + scalable for future real players." Move the authoritative sim behind a **Web Worker** boundary so the host becomes render-only (== a client), and that worker boundary doubles as the future **dedicated-server** boundary.

---

## Why (the problem)
The HOST runs the full Verlet sim on the render thread: `stepPhysics(world, spawner, grid, controls)` at [main.ts:1056](src/main.ts) (host-only, `!isClient`-gated), plus per-tick polls (scoring, game-state, NONET sweep, creature/bomb/spawner/defender), then serializes the **whole world** to JSON every ~100 ms ([main.ts:831](src/main.ts) → `snapshot()` in [save.ts](src/state/save.ts)) and sends at 10 Hz. The snapshot allocates **15+ array spreads per call** (`save.ts` ~614–714: freeSparks, primitives, bonds, players, creatures, bombs, hunters, potatoes, rainbows, seagulls, poops, fouledPrimitives, effects, creatureSpawners, defenders). As the S100–S104 tower-defense entities grew, the host's per-frame cost rose → host FPS drops → "Player One lags, Player Two is smooth" (S105 field report).

---

## Determinism audit (S107 P2) — IS the sim safe to move to a worker?

**Verdict: YES within a single browser. The cutover blockers are ENGINEERING, not determinism.** Evidence:

1. **Replay-determinism is now PROVEN at the physics-loop level.** Before S107, every determinism gate drove the *reducer* (dispatch) path; none drove `stepPhysics` directly — yet the Verlet integrator + bond solver + collision grid (the part a worker runs) is exactly where non-determinism would hide. S107 P2 added `runStepPhysicsStress` ([save.replay.test.ts](src/state/save.replay.test.ts) "S107 P2 stepPhysics physics-loop (HARD GATE)"): two same-seed runs over 300 `stepPhysics` ticks are **byte-identical** (full snapshot JSON) **and** equal under `hashWorldState`. This LOCKS current physics-loop output — the prerequisite the backlog named ("needs a NEW stepPhysics replay test FIRST") for any collision-grid rebuild or worker move.

2. **Transcendental usage** (grep-confirmed): `Math.sqrt` ([collision.ts:30], [bonds.ts:67]), `Math.cos/sin` ([creatureVerlet.ts:155-156]), `Math.hypot` ([creatureVerlet.ts:134,182,202]). `sqrt`/`hypot` are IEEE-754-mandated to a correctly-rounded result → identical on any conformant engine. `sin`/`cos` are **NOT** spec-pinned to a specific result — but a Web Worker shares the **same V8 isolate semantics** as its parent page, so within one browser they are identical. The ONLY divergence risk is a FUTURE dedicated server on a *different* V8 version (or a non-V8 runtime). → milestone risk, not a today problem; if it bites, swap `sin/cos` for a fixed-point/lookup-table or fdlibm-pinned impl.

3. **Float accumulation order** is deterministic: `solveBonds` iterates `Array.from(world.bonds.values())` (Map insertion order, stable), the collision pass iterates the grid in fixed cell order, and the 8-substep loop order is fixed. No `Math.random`/`Date.now`/`performance.now` in the sim. The replay gate (#1) empirically confirms the accumulation is reproducible.

4. **Iteration order** is deterministic: every sim collection is a `Map`/`Set` (insertion-order-preserving in JS), ids are allocated sequentially + host-authoritative, so insertion order is reproducible. `hashWorldState` additionally **sorts by id** before hashing, so the cross-check oracle is robust even to a future reordering of allocation paths.

**Cross-check primitive:** [stateHash.ts](src/state/stateHash.ts) `hashWorldState(world)` — a pure FNV-1a 32-bit fingerprint of `{tick, scoreProgress, scoreByPlayer, primitives, bonds, freeSparks}`, sorted by id. When the cutover lands, host/worker/client each hash their world and compare one u32 per tick (e.g. behind `?DEBUG_HASH=1`) to catch a silent desync without shipping full JSON. **Not on the wire yet** (no consumer this session — premature to serialize).

---

## The blocker the PRIME-AUDIT caught (worker-feasibility)
The S107 scoping workflow's WORKER-FEASIBILITY lens claimed "`state/` has zero render imports → worker-safe." **FALSE** (Opus PRIME-AUDIT): [`state/godlyOrchestration.ts`](src/state/godlyOrchestration.ts) imports `../render/{cutsceneOverlay, audioManager, codexStore, cinematicVignette, debugOverlay}`. So the host *tick* is entangled with render side-effects (godly cinematics, audio, codex unlocks). A worker cannot import Pixi/DOM. → **`runHostTick` extraction must first separate the pure sim mutation from the render-side-effects** (emit render/audio intents as data the main thread consumes, rather than calling render modules inside the tick). This is the real (a)-phase work, larger than the ~80 LOC the scope first estimated — the host tick spans ~410–560 LOC (main.ts ~1039–1600) once all host-only polls are included.

---

## Carry-forward — sequenced cutover plan (each its own session/PDR)

| Phase | Work | Blocker / prereq | Risk |
|---|---|---|---|
| **(done) d-1** | `stepPhysics` replay-determinism HARD gate + `hashWorldState` oracle | — | shipped S107 P2 |
| **a** | `runHostTick` extraction — pull the host-only per-tick work into a DOM/Pixi-free unit | **untangle the `godlyOrchestration → render` coupling first** (emit render/audio as intents) | HIGH (core-loop refactor; the d-1 gate de-risks it) |
| **b** | Snapshot **pooling + delta-encode** (the real O(world)/100 ms fix) | **MEASURE first** — add a dev snapshot-cost probe (`__SPARK__`), confirm the 15-spread allocation is actually the dominant cost before optimizing (S105 reflexion: "profile before optimizing the host gap"; the scope's "80–90% reduction" is UNMEASURED) | MED |
| **c** | Collision grid 64→8 cell rebuild | the d-1 gate (done) locks behaviour; add an 8-bit cellKey overflow compile-assert (`CANVAS/cell < 256`) | LOW (gated by the gate) |
| **d** | `?worker=1` flag-gated cutover (default OFF): worker entrypoint (sim modules only) + host↔worker message protocol (intents in, snapshots out) + `hashWorldState` cross-check | phases a+b+c; serialization-cost ROI measured (clone+postMessage vs current) | HIGH — ship behind a flag, never default-on until the cross-check is green on real devices |

**Future dedicated-server boundary (beyond the worker):** the same message protocol; the `sin/cos` cross-V8 risk (audit #2) becomes real there — mitigate with a pinned transcendental impl.

---

## What S107 P2 delivered (the safe, high-value foundation)
- `stepPhysics` physics-loop replay-determinism HARD gate (the named prerequisite).
- `hashWorldState` pure cross-check oracle + tests (deterministic, sensitive, order-invariant).
- This audit: determinism is worker-SAFE within a browser; the cutover blockers are engineering (render-coupling untangle, measured pooling ROI, message protocol), now documented + sequenced.

Deliberately NOT shipped (would be risky or premature in a 4-item batch — see the S107 scope workflow's unanimous "groundwork-only" verdict): the runHostTick refactor, pooling/delta-encode, the grid rebuild, and the worker cutover.
