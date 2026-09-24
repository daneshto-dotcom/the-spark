# PDR — Session 107 (BATCH A, FULL tier)
**The four S105/S106 carry-forwards: leader-decay · worker-sim foundation · Voltkin cleanup · bot-pentagram fix**

Date: 2026-06-26 · Branch: master · Base commit: 73f01fe
Owner approval: **EXPLICIT, PRE-APPROVED** — "lets run all the carry forward items in a full and thorough methodical session Batch call it Batch A for this session. Then next session B batch then C batch. I pre-approve full session priority batch pdr and autonomous run. Work thoroughly and produce the highest quality output working in the absolute best interests of this project and vision." (`unlock_source: user`)

Next sessions: **Batch B** (Tier-1 G1b/G2/G3b/G4), then **Batch C** (host-migration D1-D4 + Tier-3 infra).

---

## DELIBERATION RECORD
Scoped + adversarially verified via background workflow **wf_d37331f2-37a** (4 deep investigators, one per item; worker-sim got a 3-lens refute panel: DETERMINISM / WORKER-FEASIBILITY / SCOPE-REALISM). 10 agents, ~600K tokens, 280 tool-uses. All four verdicts **SHIP-WITH-FIXES**, high confidence.

**MODEL DEVIATION (logged, ALWAYS-OPUS):** the investigators ran on `claude-haiku-4-5` because `agentType:'Explore'` forces Haiku. The findings are file:line-cited and the adversarial panel caught real errors, but per ALWAYS-OPUS the deliberation conclusion must rest on Opus. **Opus (orchestrator) PRIME-AUDIT was performed** on the load-bearing claims (below). Downstream implementation + CHECK run on Opus. Future workflows: omit `agentType:'Explore'` (it downgrades the model).

## PRIME-AUDIT (Opus, adversarial self-audit of the Haiku scope)
- **CONFIRMED (own reads):** `tickScoring` (scoring.ts:142) is host-only, finds the leader/max, serializes to clients → leader-decay slots in cleanly + replay-safe. The host frame (main.ts:1034+) is a fixed-timestep accumulator loop. Voltkin asset map + the 4 Codex `voltkin-zap.png` referencers + the `voltkinFrames.anim.test.ts` disk-read dependency are accurate. `botSpawnerSeed.ts:48` `PENTAGRAM_REACH = SPAWNER_RADIUS + 240` confirmed; ring placement is pure seat-angle math (no RNG).
- **REFUTED — worker-safety (MATERIAL):** the Haiku WORKER-FEASIBILITY lens claimed "state/ has zero render imports." FALSE: `src/state/godlyOrchestration.ts` imports `../render/{cutsceneOverlay,audioManager,codexStore,cinematicVignette,debugOverlay}`. The sim graph is **not** cleanly worker-safe; the host tick is entangled with render-side-effects → the `runHostTick` extraction is harder than scoped and the worker cutover stays a **carry-forward with a documented blocker**, not a near-term ship.
- **REFUTED — test count:** handoff said vitest 1664/1664; a verifier's `npm test` showed **1663/1664** (`stress.test.ts` timing assertion 51.01ms > 50ms — a perf-gate flake, not a correctness bug). → folded in as a **P0 hygiene fix** (harden the threshold; a self-imposed perf gate that flakes by 1ms erodes the suite's signal — same "raise the gate, don't get stuck" philosophy as the bundle cap).
- **REFINED — leader-decay design:** the scope proposed a FLAT bleed rate, which risks a hard WIN-cap (leader can oscillate below 786 forever → match can't end). I am instead implementing **PROPORTIONAL decay** (`bleed = rate × (score − threshold)`): zero at the threshold, grows with the lead, self-limiting, can't tank below threshold, and never hard-caps WIN (a builder whose income exceeds the decay still climbs). Gentler + safer + more elegant. Per the S106 P4 lesson ("a correct reducer can still be an invisible bug — the display layer"), a **minimal visible cue ships with P1** (the S106 own-score bar already recedes on decay; add a small "coasting" indicator) rather than deferring the HUD entirely.

---

## EXECUTION ORDER (bank safe wins first, riskiest last — S106 META lesson)
**P0 → P3 → P4 → P1 → P2.** Commit + push each (push → GitHub Pages deploy) so the owner can playtest the balance change (P1) and the cleanup mid-session while the worker foundation (P2) proceeds.

---

## P0 — Test-suite hygiene: harden the `stress.test.ts` timing flake  (Micro)
**OBJECTIVE** Restore a green, non-flaky baseline (the suite must be a trustworthy gate before I change sim code).
**ROOT** `src/physics/stress.test.ts` asserts a wall-clock perf budget (~50ms) that flakes under machine/CI load (measured 51.01ms). A perf-timing assertion is inherently machine-variant.
**SCOPE** Make the perf assertion robust: raise the budget with realistic headroom AND/OR convert the hard wall-clock assertion to a warmup-tolerant or env-gated check (skip the timing assertion under CI load while keeping the correctness assertions). Keep it a real signal, not theater.
**TESTING** `npm test` → all green, run twice to confirm no flake. tsc 0.
**DETERMINISM** Test-only; zero sim/wire impact.

## P3 — Voltkin dead-asset cleanup  (Micro; verdict SHIP-WITH-FIXES, confirmed-safe)
**OBJECTIVE** Delete the assets/scripts orphaned by the S106 procedural rewrite; keep everything still referenced.
**SCOPE — DELETE (import-graph-verified zero referencers):**
- `public/godly/voltkin/sprites/{voltkin-idle-1,voltkin-idle-2,voltkin-charge,voltkin-hurt,voltkin-victory}.png` (5 legacy bitmap frames)
- `public/godly/voltkin/sprites/{tv-glowing,tv-off,tv-static}.png` (3 dead earlier-iteration assets)
- `public/godly/voltkin/anim/{voltkin-anim.json,voltkin-atlas.png}` (atlas layer never shipped; exported URLs never imported)
- `scripts/{build-voltkin-atlas.py,compress-voltkin-frames.py,matte-voltkin-frames.py}` (dead build tools)
**SCOPE — KEEP (named referencers):** `voltkin-zap.png` (4 Codex recipes: voltkin/pentagram/laserTurret/princessHelga + codexOverlay loader) · `lightning-crackle.ogg` (audioManager BOND_SEVERED cause=creature) · `voltkin-voice.ogg` + `voltkin-intro.mp4` (cutsceneOverlay) · `matte-voltkin-intro.py` (provenance for re-matting the live mp4) · `assets-source/godly-voltkin/**` (design provenance, 0 bundle cost) · `src/render/voltkinFrames.ts` + its 2 tests + `sync.test.ts` (VoltkinFrameKey wire-type) · `SLICE_SPEC.md`.
**MUST-FIX (the one code change):** `voltkinFrames.anim.test.ts:149-153` `readFileSync('…/voltkin-anim.json')` will fail once the json is deleted → replace the disk read with an inline mock manifest (keep the `currentAnimCell` drift-guard logic, drop the disk I/O).
**TESTING** `npm test` green (esp. voltkinFrames.anim.test) · `check-bundle-size.mjs` < 750 · boot-smoke: Voltkin recipe still plays cinematic + audio + procedural rig. **DETERMINISM** render/asset-only; zero sim/wire impact.

## P4 — Bot self-breaks its own seeded pentagram  (Standard; verdict SHIP-WITH-FIXES, confirmed-safe)
**OBJECTIVE** The bot's seeded chewer-spawner pentagram must NOT be torn down by the bot's own frontier auto-bonding into a ring node (degree 2→3 breaks the exact-5-cycle recipe).
**ROOT** Ring seeded at `SPAWNER_RADIUS+240`=490px; bot grows from ~340px in 48px hops, auto-bonds within 60px → frontier reaches the ring over minutes, raising a node's degree → `recipeStillSatisfied`/`isPentagramComponent` re-validation tears the spawner down.
**SCOPE — robust fix preferred over the band-aid.** The verifier REFUTED "relocate to +340 prevents it indefinitely" (it only slows it — ~4 hops still reach the ring). Therefore: **mark the 5 seeded ring nodes as no-auto-bond** so they can never be auto-bond *targets*, keeping the pentagram degree-2 permanently regardless of distance. Investigate at build time whether an EXISTING property distinguishes ring nodes (spawner-owned / seeded) so the auto-bond candidate filter can skip them with **no new wire field**; if a new flag is needed, it is additive-optional (host-only seeded, replay-safe). If the no-auto-bond approach proves invasive, fall back to relocate (+340) **plus** a documented distance invariant comment. Decision recorded at build time with evidence.
**TESTING** `botSpawnerSeed.test.ts` (determinism HARD gate) + `pentagram.test.ts` green; new test: bot frontier near the ring does NOT raise ring-node degree / does NOT dispatch REMOVE_SPAWNER. **DETERMINISM** host-only seeded geometry/flag, pure fn of seat+tick; replay byte-equivalence preserved (HARD gate). **WIRE** none, or additive-optional flag (no PROTOCOL bump).

## P1 — Anti-coast LEADER SCORE-DECAY  (Standard; verdict SHIP-WITH-FIXES, determinism confirmed-safe)
**OBJECTIVE** A dominant leader can't bank a big lead and coast out the clock; the race stays close — gently, without punishing skilled play, and **visibly**.
**SCOPE — PROPORTIONAL decay (PRIME-AUDIT refinement over the scope's flat rate):**
- `constants.ts`: `LEADER_DECAY_THRESHOLD_FRACTION = 0.75` (decay only past 75% of `PHASE_1_WIN_SCORE` = 589, i.e. only when dominating — coincides with the HUNTER trigger, thematically coherent), `LEADER_DECAY_RATE_PER_SEC` (the proportional pull-back coefficient; conservative default, single-const tunable). Floor = the threshold (equilibrium; can't tank below 589 → never blocks a deserved WIN).
- `scoring.ts` `tickScoring()` after `scoreProgress` is set: if `gameMode !== 'solo'` AND the leader's `scoreByPlayer > DECAY_THRESHOLD`, apply `excess = score − threshold; bleed = LEADER_DECAY_RATE_PER_SEC/PHYSICS_HZ × excess; set(leader, score − bleed)`, then re-compute `scoreProgress = max`. Pure fn of (synced score, tick, constants); host-only (already gated at main.ts:1082).
- `render/ui.ts`: minimal visible cue — the S106 own-score bar already recedes on decay; add a subtle "coasting" tint/indicator on the leader's bar when decay is active (render-only, no nag). (Per S106 P4: don't ship an invisible score change.)
**MUST-FIX (from verify):** (1) gate OUT of solo mode; (2) decay applies to whoever is leader AT THAT tick (leader-swap is intended soft-rebalance); (3) boundary test at exactly threshold (bleed→0, holds); (4) extend `save.replay.test.ts` with a leader-biased decay scenario proving byte-equivalence.
**TESTING** new `scoring.test.ts` cases (decay only-leader / not-below-threshold / proportional-magnitude / leader-swap / solo-exempt) + `save.replay.test.ts` decay determinism + WIN gate & HUNTER trigger still read `scoreProgress(max)` post-decay (no stall/loop). tsc 0; full vitest green. **DETERMINISM** confirmed-safe (host-only, tick-driven, no wall-clock, serialized). **WIRE** none (existing `scoreProgress`/`scoreByPlayer` carry the decayed value; no PROTOCOL bump).
**OWNER TUNING** ships conservative; bleed-rate + threshold are 1-const dials for playtest feedback. The structure-loss **CLAWBACK** alternative remains a SEPARATE future owner-gated PDR (overturns the S76 "banked-safe" invariant — out of Batch A by design).

## P2 — Worker-sim smoothness foundation (MILESTONE increment)  (Full; verdict SHIP-WITH-FIXES, determinism needs-guard)
**OBJECTIVE** Lay the *verifiable, safe* foundation the worker cutover requires — without shipping a risky core-loop refactor or an unmeasured optimization into a 4-item batch. S105 chose the architecture; this session makes it *provable*.
**SHIP THIS SESSION (clean, high-value, zero live-game risk):**
1. **`stepPhysics` replay-determinism test** — extend `save.replay.test.ts` with a `runStepPhysicsStress` that drives `stepPhysics` directly (not the reducer path; that gap is real — current `runStress` is dispatch-only) over 250 ticks with collisions + boundary spawns, asserting byte-identical snapshots across same-seed runs. This LOCKS current physics-loop behavior — the prerequisite for any future grid refactor or worker move.
2. **Deterministic state hash** — a cheap (FNV-1a) hash over sorted sim-identity fields, additive-optional on the snapshot; lets the replay gate (and a future host/worker/client cross-check) assert state equivalence. Pure-additive, no PROTOCOL bump.
3. **Snapshot-cost probe** — a dev-only (`__SPARK__`/flag-gated) measurement of the per-100ms `snapshot()` cost so the NEXT session can decide pooling/delta-encode ROI with DATA (the verifiers flagged the 80-90% claim as unmeasured).
**CARRY-FORWARD (honest, with documented blockers — never silently dropped):**
- **`runHostTick` extraction** — ~410-560 LOC (7× the Haiku estimate) AND entangled with render via `state/godlyOrchestration.ts → render/*` (Opus PRIME-AUDIT). Needs the sim-mutation vs render-side-effect separation untangled first. Carry-forward.
- **Snapshot pooling + delta-encode** — the real O(world)/100ms fix, but ROI unmeasured → measure (probe #3) FIRST.
- **Collision grid 64→8 rebuild** — safe only AFTER the replay test (#1) locks behavior + an 8-bit cellKey overflow compile-assert; the bottleneck is snapshot serialization, not collision, so it's lower-priority.
- **Transcendental / accumulation-order determinism audit** — `resolveCollisions`/`solveBonds` float-accumulation order + cross-context (host vs worker V8) Math equivalence is UNVERIFIED (at-risk). This is the blocker for the cutover.
- **`?worker=1` cutover** — blocked on all of the above. Shipping it without the audit is "reckless" (silent desync). Carry-forward.
**TESTING** full vitest green incl. the new HARD gates · tsc 0 · `check-bundle-size.mjs` < 750 · boot-smoke. **DETERMINISM** #1 is a test (locks, doesn't change); #2/#3 are additive-only.

---
## COMPLETION PROTOCOL (per priority): git commit + push · session-state (`status=completed`, `check_completed:true`, verbose `check_method`, `checkpoint_commit`, tokens) · reflexion entry · announce.
## VERIFY (every priority): tsc 0 · full vitest green (esp. replay determinism HARD gates) · build < 750 KiB · boot-smoke · owner playtest where visual.
## SESSION-CLOSE GATE: honest carry-forward ledger (P2 remainder + clawback) written to session-state; END-OF-SESSION runtime audit before /handoff.
