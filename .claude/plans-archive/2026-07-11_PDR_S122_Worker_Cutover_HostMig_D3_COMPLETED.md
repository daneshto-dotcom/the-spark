STATUS: COMPLETED (S122 — 4/4 shipped: 82ea2c3, 5f53b3a, 999e530, live)

# PDR — S122: B2 phase (d) worker cutover + host-migration D3 + B3 pulse-cap polish → deploy

**Session:** S122 · **Tier:** FULL (batch; P1 is HIGH-risk per WORKER_SIM_FOUNDATION.md phase table) · **Deliberation:** 3-way Council (2 rounds + quality gate) + PRIME-AUDIT
**User approval (verbatim, on record):** "continue working top recommended priority batch in order. work highest value highest leverage priority batch autonomously … I approve full run!" — batch = the S121 handoff's NEXT STEPS order.

---

## 1. OBJECTIVE
- **P1 — B2 phase (d): `?worker=1` flag-gated worker-sim cutover (default OFF).** The arc keystone (owner S105 mandate: "smooth regardless of who hosts"). FIRST the mandated TD-heavy re-measure + serialization-format ROI call, THEN move the authoritative host sim behind a Web Worker at the S119 `runHostTick` seam: intents in, snapshots out, `hashWorldState` cross-check. The worker boundary doubles as the future dedicated-server boundary.
- **P2 — Host-migration D3: MIGRATION_CLAIM takeover** behind a `__TEST_MIGRATION__` seam. Host dies → lowest warranted surviving seat adopts the mirror, rebuilds the five stripped fields, claims with a signature chaining to the room-code commitment; survivors re-latch. Kill-host e2e proves survivors resume PLAYING.
- **P3 — B3 polish:** cap the green income pulse at KEYSTONE_INCOME_MAX_NEIGHBORS(3) in the same deterministic scan order as scoring (visual honesty parity with the income cap).
- **P4 — Deploy** + live verify (manual `npm run deploy` unless Actions confirmed alive).

## 2. SCOPE (files)
**P1 (worker cutover):**
- MOD `e2e/perf-snapshot.spec.ts` — W4 TD-heavy window (seed via `__SPARK__.restoreWorld` crafted snapshot) + `PerformanceObserver('longtask')` + structuredClone-vs-JSON micro-bench (the ROI instrument).
- MOD `WORKER_SIM_FOUNDATION.md` — re-measure results + ROI verdict recorded.
- NEW `src/state/workerSim.ts` — the DOM/Pixi-free batch core: `applyTickBatch(world, batch, simState) → BatchResult` (drain incl. NONET-freeze branch + godly-matcher-core once per batch + netSnapshot + hashWorldState). Message types (`WorkerInit`, `TickBatch`, `BatchResult`, intent envelopes).
- NEW `src/simWorker.ts` — the worker entrypoint (thin I/O around workerSim; imports sim modules only).
- NEW `src/state/workerControls.ts` (or inside workerSim) — minimal Controls facade over a posted `ControlState` plain shape (`state.kind`, cursor, sparkId) satisfying `stepPhysics`'s surface (`controls.state`, `applyPerSubstep()` via the exported `stepAttractLerp`).
- MOD `src/state/godlyOrchestration.ts` — split `runGodlyMatcher` into a worker-safe core (world mutation + event emission) + main-side effect handler (netTransport send, debugProbes, cutscene kickoff). Non-worker path byte-identical (the current fn composes the two).
- MOD `src/main.ts` — `?worker=1` flag: on Begin, spawn Worker, `WorkerInit{snapshot(world,{spawnerState}), botSetup, hostSeats}`; per frame post `TickBatch{ticks, controlState, alivePeerIds}`; on `BatchResult` apply `applyNetSnapshot` to the mirror, run main-side godly effects, forward 10 Hz snapshots to peers (reusing the worker-built snapshot), hash cross-check (mismatch → console.error + flag-off fallback). Local host actions + cutscene completions post as intents to the worker. Flag OFF path byte-identical (existing code untouched around the branch).
- NEW `src/state/workerSim.differential.test.ts` — HARD gate: same seeded bot run via direct `runHostTick` loop vs `applyTickBatch` message path → byte-identical snapshots + equal hashes per batch.
- NEW e2e smoke: `?worker=1` solo reaches PLAYING, tick advances, placement works, 0 console errors, 0 hash mismatches.

**P2 (host-mig D3):**
- MOD `src/net/protocol.ts` — NEW `MIGRATION_CLAIM` kind {epoch, seat, successorAttestB64, baseSeq} + fail-closed parse case. **NO PROTOCOL_VERSION bump** (seam-gated, never emitted in production; stale peers null it via `default` — LOBBY_PRESENCE Fork-B precedent; the bump ships in D4 with default-on).
- NEW `src/net/migrationClaim.ts` — claim payload builder/sign/verify (domain-separated, mirrors warrant discipline) + `rebuildAuthorityFromMirror(world, …)` pure helper (nextPrimitiveId/nextBondId = max+1, rng reseed from hash(roomCode)^takeoverTick, fresh SpawnerState, savedAt) + takeover/accept decision fns.
- MOD `src/net/session.ts` — client-side `lastRoster` storage (successor rebuilds hostSeats from roster ∩ alive peers) + takeover state.
- MOD `src/main.ts` — D3 wiring behind `__TEST_MIGRATION__`: starvation+grace expiry → successor fires claim, flips isHost, starts HostSync at `lastSeenSeq + 10_000`, epoch+1; survivors verify (warrant pre-verified at store; claim seat == lowest alive warranted; successorAttest vs `warrantedPubkeyForSeat`) → `clientSync.setEpoch(epoch+1)` + re-latch hostVerifiedPeerId.
- MOD `src/net/clientHandlers.ts`/`hostHandlers.ts` as needed for MIGRATION_CLAIM routing.
- NEW unit tests (claim sign/verify/reject matrix, rebuild helper, takeover decision) + NEW `e2e/hostmigration.spec.ts` kill-host happy path (@quarantine-flaky, reconnect.spec precedent): host+joiner PLAYING → kill host page → within shrunken test windows the joiner claims, resumes PLAYING as authority (tick advances post-takeover).

**P3:** MOD `src/render/keystoneTelegraphRenderer.ts` (+test) — income hubs only: emit pulses in the SAME `[fa,fb]`+`prim.bonds` scan order as scoring, stop at 3. Rigidity hubs unchanged.

**P4:** no code. Deploy after all gates green.

**NOT changing:** PROTOCOL_VERSION (held 14), save schemaVersion, LOCKED_DECISIONS (D3 stays seam-gated → the §13.7/§13.20 amendments ship in D4 with activation), default (non-worker) sim path bytes, combo table.

## 3. APPROACH / KEY DESIGN
### P1 — worker cutover
- **Authority model:** worker owns World + Spawner + SpatialGrid + BotManager + GameStateExtras + HostTickState. Main thread becomes a client of its own worker: per-frame `TickBatch` in, per-batch `BatchResult{netSnapshot, hash, godlyEvents, seq}` out; mirror updated via the PROVEN `applyNetSnapshot` path (fresh-this-frame → no interpolation needed). Remote peers get the SAME worker-built snapshot at 10 Hz wall-clock (build cost paid once, in the worker).
- **Input path:** host local GameActions → intents posted to worker (the client's existing intent semantics); worker stamps/dispatches. AttractDrag: `ControlState` plain shape forwarded per frame; worker runs the authoritative `stepAttractLerp`. Accepted ~2-frame (~33 ms) drag latency behind the flag; playtest judges.
- **Godly-matcher contract (WORKER_SIM_FOUNDATION §contract):** matcher core runs IN the worker ONCE PER BATCH (= per frame — cadence cap preserved by construction); world mutations in-worker; emitted events ride BatchResult; main does transport send + cutscene/vignette/probes; cutscene completion dispatches (GODLY_COMPLETE / chained GODLY_TRIGGER) return as intents.
- **NONET:** freeze branch (tickSudoku + continue) lives in the worker drain; host sudoku solve posts the EXISTING `SUDOKU_SOLVED` intent.
- **Cross-check:** worker hash per batch vs main-side `hashWorldState(mirror)` after apply. Mismatch → forensic dump + automatic same-session fallback to the direct path (flag is experimental).
- **Shared tail watchers** (ENDGAME send, music/teardown edges) stay main-side reading the mirror (they already run off mirror state on clients; `lastWinnerId`/`effects`/`sudoku` all ride netSnapshot — verified).
- **Serialization ROI (pre-registered rule):** measure TD-heavy W4 (restoreWorld-seeded) + 6× throttle + longtask + structuredClone-vs-JSON bench FIRST. If per-batch build+clone ≤ 2 ms under 6× throttle → plain structured-clone postMessage of the netSnapshot object (no ArrayBuffer format this phase; candidate stays logged). Phase-b data (build ≤0.35 ms throttled) predicts ≪.
### P2 — D3 (design doc §4–§6, D2 carry-forwards)
- Trust: survivors verify claims against the ALREADY-VERIFIED stored warrant only (session.warrant is set exclusively post-`verifyWarrant`) — no host key re-touch at claim time. Successor signs (roomCode ‖ epoch+1 ‖ selfId) with its D1 client identity key.
- Alive set: transport-grounded — `netTransport.peerIds()` ∩ roster (the D2 world.players approximation retired).
- Timing: existing starvation (6 s) + reconnect grace (15 s) run first, unchanged; `__TEST_MIGRATION__` seam shrinks both for the e2e AND gates the takeover fire (D3 never activates in production).
### P3 — first-3-in-scan-order cap; both peers derive identically from synced bonds arrays; scoring counts (not identifies) its 3, so the visual picks the same deterministic first-3 the scan meets.

## 4. DETERMINISM / REPLAY-SAFETY
- P1: default path byte-identical (flag OFF = existing code). Worker path: same modules, same order, same tick semantics — proven by the differential HARD gate (byte-identical snapshots per batch). Worker shares the V8 isolate semantics (S107 audit #2). Existing `hostTick.replay/differential`, `stepPhysics` replay, `save.replay` gates all stay green untouched.
- P2: zero effect until a claim fires (seam-gated); epoch gate already provably inert at 0. Takeover reseeds RNG/spawner — accepted one-time divergence (design §4, ratified S85).
- P3: render-only, zero world state.

## 5. TESTING (gates — all green before P4)
tsc 0 · vitest full (1865 + new) · workerSim differential HARD gate · hostTick/stepPhysics/save.replay untouched-green · P2 unit matrix + kill-host e2e (@quarantine-flaky, run locally) · P1 e2e worker smoke · P3 renderer tests updated · bundle ≤ 750 KiB · MCV 0 · live hash verify post-deploy.

## 6. RISKS / MITIGATIONS
- **R1 godly-under-worker entanglement** (cutscene completion mutates authoritative world): intents-back design above; if the round-trip proves deeper than scoped, ship worker mode with a logged carry-forward polish item — the flag is default-OFF/experimental (never blocks the default path).
- **R2 worker init/restore drift:** INIT uses the S82 bit-exact `snapshot/restore` path; differential gate catches drift.
- **R3 e2e flake (real WebRTC):** quarantine-flaky lane, reconnect.spec precedent; gating happy path kept minimal (host+1 joiner).
- **R4 MIGRATION_CLAIM without version bump:** seam-gated (production peers never see one); stale peers null unknown kinds (verified `default → null`). D4 owns the bump.
- **R5 restoreWorld TD-seed fidelity:** if mid-duel restore misbehaves, fall back to DEV-seam-driven incremental seeding; the measurement only needs composition, not provenance.
- **R6 scope size:** P1 is the session's big rock; if context hits ORANGE before P2, P2 carries forward whole (never half-shipped) — priorities are independently shippable in order.

## 7. DELIBERATION — questions for the 2-round Council
- **Q1 (P1 architecture):** main-as-client-of-worker via per-batch netSnapshot+applyNetSnapshot vs structured-clone World transfer vs SharedArrayBuffer — is the proven-path choice right? Hidden costs of 60 Hz applyNetSnapshot on the mirror?
- **Q2 (P1 godly):** worker-side matcher core + events-out + intents-back — does it preserve the per-frame cadence contract and the client-identical cutscene UX? Failure modes?
- **Q3 (P2 trust):** claim verification against the stored pre-verified warrant + successorAttest + lowest-alive-seat — any spoof/race hole (zombie host, simultaneous claims, seq jump)?
- **Q4 (P2 scope):** is seam-gated-no-bump correct for D3 (vs bumping now)?
- **Q5 (ROI rule):** is the pre-registered ≤2 ms structured-clone threshold the right GO/simple-format rule?
- Battle Ledger + quality gate + PRIME-AUDIT (incl. boot-then-smoke runtime-verifiability) before execution.

## 8. SEQUENCING
P1 re-measure → ROI call → cutover impl → gates → P2 D3 → gates → P3 (trivial) → P4 deploy. Per-priority completion protocol (commit → session-state check fields + real-context tokens → `[ZERO]` line → reflexion entry) at every boundary. Context thresholds: GREEN <500K proceed / ORANGE 750K finish+handoff.
