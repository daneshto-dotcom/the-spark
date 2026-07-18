# PDR — S124 Batch: Host-Migration D4 (production-ON) + B2(c) reconciliation + F10 render heap probe

**Tier:** Full (P1 governs) · **Session:** S124 (2026-07-16) · **Approval:** user pre-approved batch + autonomous run ("continue working exactly where we left off… highest possible best quality output", following the explicitly proposed P1/P2/P3 batch)
**Deliberation:** Full 2-round Council (Claude architect + GROK-DISRUPTOR grok-4.20-0309-reasoning + GEMINI-AUDITOR gemini-3.1-pro-preview) + PRIME-AUDIT. Record in §7.

---

## 1. OBJECTIVE

Ship host-migration **D4** — the final phase of `HOST_MIGRATION_DESIGN.md` §9 — turning migration **production-ON**: PROTOCOL_VERSION 14→15, seam becomes timing-override-only, plus zombie demotion, claim ladder (stuck-successor), simultaneous-claim demotion (lowest-seat-wins), pause-only migration window, ghost-seat bench fix, fail-closed intent stamping, POSTGAME gates, LOCKED amendments. Riders: reconcile the stale B2(c) BACKLOG entry (shipped S120 P3, commit 3fc6688); close F10's render side with a direct-mode long-soak heap/render-census e2e.

## 2. SCOPE (files)

**P1 (Full):** `src/net/{succession,sync,protocol,clientHandlers,hostHandlers,session}.ts`, `src/main.ts`, `src/render/lobbyScreen.ts`, `LOCKED_DECISIONS.md`, `HOST_MIGRATION_DESIGN.md`, tests: `src/net/{succession,sync.epoch,migrationClaim}.test.ts` + new `src/net/hostmigD4.test.ts`, `e2e/hostmigration.spec.ts`, version-pinned test updates (`hostmigD2.protocol.test.ts` etc.).
**P2 (Micro, docs-only):** `BACKLOG.md` STATUS banner — B2(c) marked shipped (S120 P3, 3fc6688; collision.ts:18-25 + collision.pile.test.ts lock it).
**P3 (Standard-lite, test-only):** new `e2e/render-heap.spec.ts` (S123 worker-heap.spec pattern, direct mode, Pixi render census).

## 3. DESIGN (P1, Council-synthesized v2 + R2 adjustments)

1. **Production-ON:** remove `__TEST_MIGRATION__` as activation REQUIREMENT from the firing block (main.ts:1734) and the acceptance handler (clientHandlers.ts:320-327); seam remains honored for `starvationMs`/`graceMs`/`ladderMs` overrides (e2e). `PROTOCOL_VERSION = 15` (protocol.ts:95) — v14 peers are HELLO-banned (transport `protocolMismatchPeers`), joins are lobby-only ⇒ no mixed-version warranted match (lobby negotiation refuted).
2. **Claim ladder:** rank = index of own seat in ascending warranted-TRANSPORT-ALIVE seats; successor-candidate fires at `grace + rank*CLAIM_LADDER_MS` (**1500ms**; rank 0 ≡ D3 behavior, existing e2e unchanged). Firing no longer requires being THE unique computed successor — being warranted + alive + rung-elapsed suffices; lowest-seat-wins reconciles races.
3. **Acceptance gates (survivor):** (a) stored verified warrant · (b′) `msg.epoch > currentEpoch` OR (`msg.epoch === currentEpoch` AND `msg.seat < session.latchedClaimSeat`) — monotonic-forward + downward-only same-epoch re-latch · (c) locally-observed hostGone (peer-left OR starvation) — UNCHANGED, already shipped · (d) DELETED (was: exact-successor match; replaced by ladder + b′) · (e) sig verifies, sender-bound · NEW (f) `gameState === 'PLAYING'`. On accept: latch hostPeerId/hostVerifiedPeerId, `currentEpoch`, `latchedClaimSeat`, `clientSync.setEpoch()`.
4. **Demotion (shared core `demoteToClient`):** adopter receiving a verified same-epoch LOWER-seat claim or any verified higher-epoch claim → `isHost=false`, `hostSync=null`, re-latch to winner, `migrationClaimedEpoch=-1`, `setEpoch` (with watermark reset), stop worker driver if active. Zombie (original host, or any deposed host observing a verified claim `epoch > currentEpoch` while disconnected-from-the-new-term) → same core + v1 terminal connection-lost overlay (design §5 v1; no auto-rejoin).
5. **Claim echo:** a MIGRATED host re-broadcasts its own signed claim when (i) it receives a NETSNAPSHOT with `(epoch??0) < currentEpoch` (zombie detected) or (ii) a peer JOINS (rejoiner support); rate-limited ≥5s. Unsigned snapshots can never demote (spoof-proof); a fake-stale-snapshot flood costs 1 claim/5s.
6. **Watermark hardening:** `ClientSync.setEpoch(e)` for `e > currentEpoch` also resets the seq watermark (belt-and-braces — the +10000 jump already guarantees forward progress; PRIME-AUDIT refuted the "trap" but the reset makes it provable without arithmetic). Unit-locked.
7. **hostSeats at takeover = FULL lastRoster minus self** (was ∩ alive): dead peers (incl. the dead host's seat) enter the S82 drop-bench sweep automatically (rolling re-stamp, self-heals on rejoin); post-migration rejoiner intents stamp correctly.
8. **Fail-closed stamping BOTH paths:** hostHandlers.ts:289 and the successor's additive handler — unknown peer → DROP + `raceRejects++` (closes the pre-existing any-stranger spoof hole; safe: reconnects keep selfId, mid-match joins don't exist).
9. **Pause-only window:** while `!world.isHost && hostLost && warrant !== null` suppress local intent wire-send AND optimistic application (dispatcher gate). No buffering (Council: stale-materialization UX + reseeded world > negligible value). Overlay gains a "MIGRATING…" line. `suppressForMigration` (no transport tearing) becomes production: `warrant !== null` (seam-independent). peersGone split: `peerCount===0` → S82 reconnect-cycle unchanged; `hostLost && peerCount>0` → migration path.
10. **LOCKED amendments:** §13.7 (+ host migration after grace), §13.20 (warrant = sanctioned delegation of the room-code key's authority), new §13.x (epoch semantics: monotonic terms, lowest-seat-wins, v1 zombie-overlay). HOST_MIGRATION_DESIGN.md gains a D4 as-built section.

## 4. RISKS

- **Flaky e2e lane** (public-relay WebRTC) — quarantine-flaky class; local-run gates, CI advisory (S122/S123 precedent).
- **20s frozen-input UX** during migration — v1 accepted (design §6/§8); overlay messaging mitigates; playtest-gated tuning.
- **Race churn** (adjacent-rank double claims under >1.5s skew) — correctness-independent (lowest-seat-wins), brief; unit matrix locks convergence.
- **PROTOCOL bump mid-deploy mix** — the version gate force-disconnects, S22/S52 precedent; deploy is a single artifact.
- Rung/echo constants are dials; all seam-overridable for tests.

## 5. TESTING

- **Unit:** ladder rank/delay matrix (alive-subset permutations); acceptance-gate matrix (monotonic epoch, same-epoch-lower-seat, hostGone-required, gameState, sig-fail); demotion (loser + zombie: latch reset, watermark reset, worker-stop callback); echo rate-limit + triggers; roster-complete hostSeats → drop-bench sweep benches dead host seat (hostTick integration); fail-closed stamping (both postures). setEpoch watermark reset.
- **e2e (quarantine-flaky lane):** existing D3 kill-host spec green unchanged (seam = timing override, rank0 path identical); NEW no-seam production-activation test (kill host → transport peer-left → real 15s grace → claim → successor isHost + survivor epoch 1).
- **Gates:** tsc 0 · full vitest green (1884 baseline + new) · bundle < 750 KiB · version-pinned tests updated.

## 6. ROLLBACK

Single-session revert: all D4 behavior keys off PROTOCOL_VERSION 15 + the seam-independent gates; `git revert` of the P1 commits restores D3 seam-gated state. No save/schema changes (epoch is envelope-only; save.replay byte-identical by construction).

## 7. DELIBERATION RECORD (Full, 2 rounds + PRIME-AUDIT)

| Finding | Source | Verdict | Landing |
|---|---|---|---|
| "Premature coup" — no host-loss gate on claim acceptance | BOTH seats R1 (CRITICAL) | **REFUTED** — gate (c) shipped in S122 (clientHandlers.ts:311-346, "Council L3"); my R1 brief omitted it (truncated read). 14th #empirical-refutes-plausible-criticals, 2nd double-seat instance | §3.3 unchanged gate (c) |
| Unstamped-INTENT fallback = D3 flaw | Gemini R1 | **CONFIRMED, provenance corrected** — byte-identical copy of hostHandlers.ts:289 (S62); pre-existing hole | §3.8 both paths fail-closed |
| Ladder > local-exclusion for stuck successor | Grok R1 + Gemini R1 | **ADOPTED** (rank-based, 1500ms synthesis of 800 vs 2000) | §3.2 |
| Lobby version negotiation required | Grok R1 | **REFUTED** (Gemini A6 + transport.ts protocolMismatchPeers ban + lobby-only joins) | §3.1 |
| Demotion must clear one-shot latch | Grok R1 | **CONFIRMED** | §3.4 |
| Zombie demotion via "signed INTENTs" | Grok R1 | **INVALID** (INTENTs unsigned); claim-only demotion + echo adopted | §3.4-3.5 |
| Buffer in-flight intents | Grok R1 (PLACE+SEVER) vs Gemini R1 (FAIL→pause-only) | **Gemini ADOPTED** | §3.9 |
| First-snapshot-before-repair race | Grok R1 C4 | **REFUTED** (single continuation; rAF can't interleave) | — |
| Ghost rejoiner needs HELLO handler | Gemini R1 | **PARTIALLY REFUTED** (latches survive in-page; broadcasts flow); real gaps = stamping + missed epochs → roster-complete hostSeats + monotonic gate + join-echo | §3.3/3.5/3.7 |
| Watermark trap (loser rejects winner forever) | Gemini R2 (CRITICAL) | **REFUTED** (loser's ClientSync watermark never advances during adoption — hostAuthFilter drops pre-demotion, no self-loopback) — **hardened anyway** (setEpoch reset) | §3.6 |
| Claim replay via relay/transport-spoof | Grok R2 | **REFUTED** (sender-binding: verification over deliverer peerId fails for any relayer) | — |
| HostSync "emits until GC" / spawnEnemy callback / latch-on-ClientSync | Grok R2 | **FABRICATED** (no such mechanics/symbols; demotion synchronous, rAF-driven emission) | — |
| Successor freeze-lock | Gemini R2 | **REFUTED** (hostLost requires non-null hostPeerId, nulled at takeover) — `!world.isHost` added anyway | §3.9 |
| Monotonic epoch gate + same-epoch-lower-seat rule | Gemini R2 QA | **ADOPTED** (Grok's oscillation counter rested on the refuted relay-spoof) | §3.3 |
| Dead-host seat never benched | Claude A.0 | **CONFIRMED** (hostTick.ts:596-627 sweeps hostSeats only) | §3.7 |
| Gemini quality score | R2 | 4.5/5 with 5 adjustments: 2 adopted, 2 refuted-verified, 1 already-true (epoch already serialized ≥1) | — |

**PRIME-AUDIT delta:** consciously-accepted items — 20s pause-only UX (v1, playtest-gated); solo-survivor self-migration ships implicitly (design §10 Q3 "recommend yes"); worker-mode successor takes over in DIRECT mode (documented v1); migrate→WIN e2e replaced by unit-level gate coverage (score-out too slow for e2e). Boot-then-smoke: vitest + real-WebRTC e2e exercise the runtime paths; no static-only claims.

## 8. SUCCESS CRITERIA

tsc 0 · vitest all-green (baseline 1884 + new suite) · existing hostmigration.spec green with seam-as-timing · new no-seam production test green locally · bundle < 750 · PROTOCOL_VERSION 15 consistent (code+tests+docs) · LOCKED/design docs amended · BACKLOG reconciled (P2) · render-heap spec landed + verdict recorded (P3).
