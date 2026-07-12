# PDR — S123: Worker Default-On Prerequisites (Full tier, batch)

**Session:** S123 · **Tier:** Full (>30K; batch → highest tier) · **Owner-selected:** "Worker default-on prereqs"
**Gate:** `pdr_approved` + `deliberation_completed` + `unlock_source=user` (top-level AND per-priority)
**Deliberation:** 2-round 3-way Council (Claude+Grok+Gemini) + PRIME-AUDIT + Rule 22 end-of-session audit.
**Rule 24:** N/A — this modifies game code, NOT skills/hooks/deliberation/routing → no `/inspect-eval`.

---

## 1. OBJECTIVE
De-risk the `?worker=1` sim-worker toward a future **default-on** flip (owner-blocked on a weak-device
playtest). Close the three dev-side prerequisites from the S122 handoff so the only remaining gate is the
owner's playtest:
- **P1** — VS-BOTS support in worker mode (today: `botSeats.size===0` excludes the worker → bots fall back to the direct main-thread sim).
- **P2** — a **networked worker-duel e2e** (2-peer real WebRTC, host on `?worker=1`) proving convergence + oracle-clean.
- **P3** — a **10k-frame GC/heap audit** proving no per-frame allocation creep in worker mode.

## 2. SCOPE
**P1 — VS-BOTS worker support**
- `WorkerInitMsg` gains `botDifficulties?: BotDifficulty[]` (+ explicit `botMatchSeed?: number`, though
  recoverable from `world.rngSeed`). `makeWorkerSim` constructs a `BotManager(difficulties, matchSeed)` when present.
- `applyTickBatch` wires `botManager: sim.botManager` into `HostTickDeps` (currently hard `null`, workerSim.ts:361).
- Adoption gate (main.ts:1382–1388): drop the `world.botSeats.size === 0` exclusion; pass `botDifficulties` into INIT.
- Bot-state probe: `__SPARK__.vsBots` reads main's now-frozen `botManager`. Relocate/augment so the probe reflects the **worker's** authoritative bots (candidate: attach `botStates` to structural batches, or a debug-only request).
- Files: `state/workerSim.ts`, `simWorker.ts`, `main.ts`, + tests.

**P2 — Networked worker-duel e2e** (`e2e/worker-duel.spec.ts`, NEW)
- Reuse the `e2e/helpers.ts` 2-peer pattern (hostmigration/perf-snapshot/nplayer). Host boots `/?worker=1`;
  joiner boots plain. Both reach PLAYING; run a real duel with placements from both sides.
- Assert: host `simWorker.ready && !failed`; host `hashMismatches === 0`; joiner's world converges to host
  (tick advances, host-authored primitive appears on joiner); worker-built snapshots are the wire snapshots
  (joiner receives `HOST_SNAPSHOT` at ~10Hz); zero page errors.

**P3 — 10k-frame GC/heap audit** (`e2e/worker-heap.spec.ts`, NEW + a small instrument if needed)
- Solo `/?worker=1`, seed a TD-heavy world via the DEV `restoreWorld` seam (reuse perf-snapshot inflation),
  run ~10k worker frames. Sample heap via CDP `HeapProfiler.collectGarbage` + `Runtime.getHeapUsage`
  (robust) with `performance.memory.usedJSHeapSize` as a coarse cross-check.
- Assert bounded post-GC growth (threshold set from a warm-up baseline, not arbitrary); record longtask
  count. If a real leak surfaces (e.g. an unbounded array on the mirror-apply path), fix it (in-scope, small).

**OUT OF SCOPE (explicit):** the default-on flip itself (owner playtest gates it); VS-BOTS under
host-migration/reconnect; D4; F9/F10; any PROTOCOL_VERSION bump (worker stays seam/flag-gated, prod inert).

## 3. TESTING
- **P1:** (a) extend the differential HARD gate with a **bots** scenario — worker-vs-direct byte-identical over
  N ticks with a live BotManager on both sides from the same seed; (b) `e2e/worker.spec.ts`-style solo-BOTS
  smoke: `/?worker=1` + bots adopts, ticks advance, a bot-authored primitive lands, `hashMismatches===0`;
  (c) unit: INIT bot-config round-trip (difficulties survive serialize→makeWorkerSim).
- **P2:** the new networked spec green over real WebRTC (headless Chromium).
- **P3:** heap-growth assertion under threshold; longtask/GC observation recorded.
- **Global gates:** `tsc` 0 · `vitest` all-green (1882+ N) · bundle entry ≤750 KiB · MCV exit 0 · Rule 22 audit clean.

## 4. RISKS / UNKNOWNS (Council focus)
1. **Bot-handoff determinism (headline).** The worker adopts a few frames into PLAYING; main's `BotManager`
   has already ticked ≥1 time, advancing each `BotController`'s mulberry32 word + FSM — state the INIT
   snapshot does NOT carry (rng is a closure, no exposed word). **Two designs:**
   - **(A) fresh-from-seed** — worker builds a new `BotManager(difficulties, matchSeed)`; accept a one-frame,
     effectively invisible bot **re-decision** at adoption. **Zero oracle impact** (bots live only in the
     worker; the hash oracle compares worker-vs-mirror, both worker-authored). Simple, low-risk.
   - **(B) bit-exact handoff** — expose/restore the mulberry32 word + serialize BotController FSM into INIT.
     Bit-exact but adds a serialization surface + a new determinism gate. **Council question: is (A) acceptable,
     or is bit-exact required?** (Claude's lean: A — matches the ratified fallback-repair discontinuity class.)
2. **Two BotManagers** (main's frozen + worker's authoritative) — probe staleness, one wasted main-thread bot
   tick pre-adoption. Mitigation: keep main's for pre-PLAYING setup only; route the probe to worker state.
3. **GC instrument fidelity.** `performance.memory` is coarse/Chromium-only + needs GC forcing to read a true
   floor; CDP `HeapProfiler` is robust but slower. Threshold must distinguish a leak from GC sawtooth.
4. **Networked e2e flake** over real WebRTC — mitigate by reusing the proven hostmigration/perf-snapshot harness + generous timeouts.

## 5. APPROACH / SEQUENCE
Proposed **P1 → P2 → P3**. Rationale: P1 is the actual default-on blocker and unblocks the fullest test
surface (solo-bots e2e needs no WebRTC); P2/P3 then validate the (now bot-capable) worker.
**Council alt to weigh:** run **P2+P3 on the existing non-bot path FIRST** (validate current prod code before
P1 changes it), then P1. Trade-off: earlier validation of shipped code vs. later single validation pass.

## 6. FILE MANIFEST
- MOD: `src/state/workerSim.ts` (INIT bot cfg, makeWorkerSim BotManager, deps.botManager), `src/simWorker.ts`
  (pass-through), `src/main.ts` (adoption gate, INIT payload, bot probe).
- NEW: `e2e/worker-duel.spec.ts`, `e2e/worker-heap.spec.ts`, worker-bots differential/unit test additions
  (extend `src/state/workerSim.differential.test.ts` or a sibling).
- Possible small MOD if a leak is found in P3 (mirror-apply / effects path).

## 7. ROLLBACK
Each priority its own commit. `?worker=1` stays **default-OFF** → production inert regardless. `claude-rollback.py`
restore points. No wire/PROTOCOL change → no cross-version desync risk.

## 8. DELIBERATION TIER & GATES
Full → 2-round 3-way Council (Battle Ledger + quality gate) → PRIME-AUDIT (Runtime-Verifiability: would the
worker-bots path survive a real `?worker=1&bots` boot, not just static parse?) → present → owner `go` →
write gate fields (top-level + per-priority) → execute P1→P2→P3 → per-priority COMPLETION PROTOCOL →
Rule 22 end-of-session audit → `/handoff`.

---

## COUNCIL RESOLUTION (R2 — domain-weighted synthesis + PRIME-AUDIT)

**Headline — bot handoff: ADOPT (A) fresh-from-seed. (B) OVERRULED via empirical refutation.**
Both Grok + Gemini voted (B), resting on the SAME load-bearing claim: *"(A) breaks the byte-identical
differential HARD gate."* **VERIFIED FALSE** by reading `workerSim.differential.test.ts:117-128,191-196`: the
gate builds BOTH rigs from the SAME pristine, un-ticked world and asserts bit-exact adoption BEFORE any tick
(line 196), then runs lockstep. It is **fresh-vs-fresh from frame 0 — NOT a runtime handoff.** A bots scenario
builds `BotManager(diffs, matchSeed)` from the identical seed on both sides → byte-identical; (A) passes. The
models hallucinated a "run 1 frame direct, then transfer" mechanism the gate never performs
(`#empirical-refutes-plausible-criticals`). The real 1-frame re-decision exists only in true runtime adoption
(covered by e2e, not this gate), is invisible (avatar pos rides the snapshot; only intent resets — and
BotController re-validates its FSM every tick anyway), has **zero oracle impact** (bots are worker-only), and
matches the **already-ratified fallback-repair discontinuity** (main.ts:1424-1430). Domain: implementation
feasibility → Claude (1.75); dissent weight voided by a factually-refuted premise.
→ **Carry-forward (kernel of Grok R1 preserved, NOT silently dropped):** IF a replay/rewind/spectator-of-bot-
internal-state feature is ever built, expose the mulberry32 word + serialize BotController FSM then. Not now (YAGNI).

**ADOPTED from the Council (genuine value):**
- **P2 cross-mode matrix (Gemini, quality 1.75):** add a Host(`?worker=1`) vs Joiner(`?worker=0`) permutation —
  proves the wire format is execution-model-independent (no protocol bleed) = the exact default-on de-risk property. **ADOPT.**
- **P1 structuredClone silent-freeze guard (Gemini):** strengthen the solo-bots e2e to assert **structural
  snapshot progress** (full-apply tick/seq advancing), not just positions — catches a `DataCloneError`-kills-worker
  regression. Low risk (NetSnapshot is proven-cloneable; bots add no snapshot fields) but cheap insurance. **ADOPT.**
- **P3 instrument (both converge on "force GC first"):** PRIMARY = launch Chromium with `--js-flags=--expose-gc`
  → `window.gc()` → `performance.memory.usedJSHeapSize` delta (warm-up baseline → 10k frames); simpler/faster/CI-
  friendly than CDP. CDP `HeapProfiler` kept only as an optional deeper cross-check if the coarse read is
  ambiguous. Threshold = measured warm-up baseline + assert bounded post-GC growth + **record the actual number**
  (light form of Grok's statistical ask; full 5-run variance rig deferred as over-scope for a first audit). **ADOPT.**
- **Ordering (Grok's kernel):** KEEP P1→P2→P3 (P1 is the blocker; the leak-prone positions/snapshot hot path is
  identical bot-or-not), BUT P3 measures a **non-bot baseline run FIRST** then a bots run — giving Grok's
  "audit shipped code before adding surface" coverage without inverting. **SYNTHESIS.**

**REJECTED (logged, not dropped):** invert-adoption-model (bigger refactor, touches the green non-bot path);
message-replay e2e instead of real WebRTC (proven harness first-run-green — S122; out of scope); incremental
hash / SimulationMode enum / NullBotManager / 20Hz-combat batching (refactors + behavior changes, not prereqs).

**PRIME-AUDIT (self, Runtime-Verifiability):** worker+bots survives a real boot — `botSeats` restores
(save.ts:688,979) so the worker knows it's a bots match; the one impl detail = main must **capture
`difficulties[]` at adoption** (BotManager holds it privately → add a getter/stash) to pass into INIT.
Networked-bots-host now also uses the worker (exclusion only gated on bots, never on networked) — desired, and
P2 covers it. `vsBots` probe relocation is downgraded to OPTIONAL: the e2e asserts observable **bot-authored
world changes** (a bot places a primitive), not FSM labels — avoids per-frame batch overhead.

**CONFIDENCE: HIGH.** No SPLIT items. Ready for owner APPROVE.

---

## SCOPE AMENDMENT — P4: Bot-Intelligence Research (Rule 16, owner-approved same-message 2026-07-12)

**Owner verbatim (condensed):** bots of different levels should "know" the game at different levels too — not
only faster sparks / faster spawn grabs / better connections, but: (1) harder bots increasingly **seek tower-defense
and godly structures** deliberately; (2) smarter bots **watch who is winning and raid the leader**; (3) smartest
bots make **sacrifice plays** — delete their own constructions when it enables a better combination.

**P4 SCOPE:** research + design ONLY — no gameplay code ships this session. Deep-read the existing bot stack
(botBrain / botConfig / botController / combos / scoring / TD design), design the tiered game-knowledge system
under SPARK's hard constraints (determinism via mulberry32, dispatch-only actuation, worker-safety, per-tick
budget), run a Council consideration pass, and produce **BOT_INTELLIGENCE_DESIGN.md** for owner review. The
implementation gets its own PDR in a future session after owner feedback (mirrors the TOWER_DEFENSE_DESIGN.md flow).

**Owner approval also covers:** P1→P2→P3 as Council-resolved above ("I approve full current session priority batch").
