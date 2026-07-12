═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-07-12
Session: S123 — worker default-on prereqs batch (owner-selected) + owner scope amendment P4 (bot-intelligence research). Ran on Fable 5 Ultracode.
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (geometric builder duel)
- Working directory: …/Founder DNA/Extension Projects/The Spark
- Git branch: master · Latest commit: 3ba5cf3 · Work: 9f48d50 / a8e073a / c0eca11 / 3ba5cf3
- Tech stack: TypeScript / Vite 6 / Pixi 8.19 / Trystero P2P / Web Worker sim (opt-in)
- Live: https://spark-online.space (serves the S122 batch; S123 is master, default-OFF worker infra + tests + a design doc — nothing user-facing changed)

## CURRENT STATE
- Build: tsc 0 · vitest 1884/1884 (122 files) · bundle entry 635.5/750 KiB (+0.1; simWorker chunk 117KB separate; botManager still its own lazy chunk)
- Deployment: NOT redeployed this session (no user-facing change — worker stays `?worker=1` default-OFF, prod inert). Deploy path decision still owner-pending (Actions + manual both live).
- PROTOCOL_VERSION: 14 (held — no wire change)

## THIS SESSION'S WORK (4/4 shipped)
- **P1 — VS-BOTS worker support** (9f48d50): the `?worker=1` worker now owns bots. `WorkerInitMsg` gains `botDifficulties`/`botMatchSeed`; `makeWorkerSim(init, makeBotManager?)` is a factory-injection seam (simWorker.ts static-imports BotManager = worker chunk only; workerSim.ts stays type-only so the S87 lazy bot chunk never enters the entry bundle); `applyTickBatch` wires `deps.botManager`; the `botSeats.size===0` adoption exclusion dropped (fail-safe: bots match w/o captured config stays direct). **Design = Council (A) fresh-from-seed** — both external seats voted (B) bit-exact on the claim "(A) breaks the differential gate", EMPIRICALLY REFUTED by reading the gate (fresh-vs-fresh from a pristine world, not a runtime handoff). NEW 300-frame VS-BOTS differential HARD gate (byte-identical worker-vs-direct with HARD+IMBA bots) + INIT round-trip unit matrix + `e2e/worker-bots.spec.ts` (green first run: worker adopts, bot-authored prims reach mirror, growth continues = freeze guard, 0 mismatches).
- **P2 — networked worker-duel e2e** (a8e073a): `e2e/worker-duel.spec.ts` — 2-peer real WebRTC, host `?worker=1`. Merged the cross-mode matrix into one stronger room (joiner carries worker=1, asserted simWorker===null: clients never adopt). Proves worker-built snapshots ARE the wire, remote-INTENT round-trip through the worker, count convergence, 0 host mismatches, + a 4–30Hz wire-cadence bound (GEMINI CHECK counterexample shipped same-session). helpers.ts gained backward-compatible url params. @quarantine-flaky.
- **P3 — 10k-tick GC/heap audit** (c0eca11): `e2e/worker-heap.spec.ts` — two ≥10k-tick soaks (TD-heavy transplant baseline + 3×MID bots) under `--expose-gc` + `--enable-precise-memory-info`. CHECK-hardened both seats' CONFIRMED findings: stabilized floor sampling (kills transient masking) + **worker-isolate reads via raw CDP** (`/json/list` worker target → WS → HeapProfiler.collectGarbage×2 → Runtime.getHeapUsage; performance.memory is Window-only). **VERDICT: no leak either isolate** (worker Δ+0.15/+0.54MB, main steady-state Δ+0.08MB). Bonus: ~20k-tick oracle soak, 0 hash mismatches.
- **P4 — BOT_INTELLIGENCE_DESIGN.md** (3ba5cf3, owner Rule-16 amendment): design ONLY, no gameplay code. Tiered bot game-knowledge (KNOWLEDGE BOOK in botConfig + blueprint executor + RAID + SACRIFICE) grounded in the existing pure-brain/dispatch-only/mulberry32 substrate. Council-hardened (§9): dithering/dogpile/thrash CONFIRMED+fixed, kill-the-executor REJECTED, 3 determinism traps refuted w/ cites. 7 owner questions + A/B/C phasing.

## OPEN ISSUES
- Worker default-on known-deltas (unchanged from S122, all documented, flag-experimental): window e2e seams don't reach the worker; DEV restoreWorld acts on the mirror pre-adoption; overlay abort-vs-fade pop under lag (cosmetic).
- P2/P3 specs are @quarantine-flaky / long-soak — local-run gates, CI-advisory (public-relay + wall-time). worker-duel: 3/4 green locally (1 red = relay timeout).
- GEMINI S124 risks: worker default-on flip → main-thread message-queue latency (add depth telemetry); D4 in-flight event loss (pause-and-buffer).

## BLOCKED ON
- OWNER: weak-device playtest of spark-online.space/?worker=1 (the ONLY remaining default-on gate).
- OWNER: answer BOT_INTELLIGENCE_DESIGN.md §7 (Q1–Q7) before bot-intelligence Phase A.
- OWNER: pick ONE deploy path (Actions auto vs manual gh-pages — both ran S122).

## NEXT STEPS (priority order)
1. Owner playtest + owner §7 answers + owner deploy-path decision (all three above).
2. Worker default-on flip (remove flag gate + fallback-latency telemetry) once playtest passes.
3. Host-migration D4 (zombie demotion, claim-timeout, PROTOCOL bump, reconnect reconciliation + pause-and-buffer).
4. Bot-intelligence Phase A (knowledge book + combo-aware pick/placement + raid, Standard, no new FSM) after owner answers.
5. B2 phase (c) collision-grid 64→8; F9 INTENT token-bucket; F10 render-side heap probe.

## CHANGED FILES
11 files, +1217/−217 vs 40ef8e3. NEW: e2e/worker-bots.spec.ts, e2e/worker-duel.spec.ts, e2e/worker-heap.spec.ts, BOT_INTELLIGENCE_DESIGN.md. MOD: src/{main,simWorker}.ts, src/state/{workerSim,workerSim.differential.test}.ts, e2e/helpers.ts.

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: 4/4 complete | ctx ~385K/1M (GREEN at close)
- P1 worker-bots — completed — 9f48d50
- P2 worker-duel-e2e — completed — a8e073a
- P3 gc-audit — completed — c0eca11
- P4 bot-intelligence-research — completed — 3ba5cf3

## REFLEXION ENTRIES (this session)
- S123-P1 #verify-the-gates-mechanism-before-trusting-consensus
- S123-P2 #probe-the-pipeline-before-blaming-the-new-layer
- S123-P3 #a-suspicious-pass-is-a-finding
- S123-P4 #fix-degeneracy-by-sequencing-not-by-knobs

## CARRY-FORWARD PRIORITIES
1. Bit-exact bot serialization (Council (B) kernel) — ONLY if replay/rewind/spectator-of-bot-state ever ships (YAGNI now).
2. Host-mig D4 — not started (+ GEMINI S124 pause-and-buffer note).
3. Bot-intelligence Phases A/B/C — awaiting owner §7 answers.
4. F9 INTENT token-bucket; F10 render-side heap probe; B2 phase (c).
═══════════════════════════════════════════════════════════
