# S31 P0 Batch — Council Battle Ledger (R1)

**Date:** 2026-05-16
**Tier:** Standard
**Models:**
- DISRUPTOR: Grok-4.20-0309-reasoning (premium)
- AUDITOR: Gemini-2.5-pro (premium)
**Domain:** Real-time game / FSM correctness / NetSnapshot determinism / replay safety

## Forked Decisions

### Q1 — P0-1 Spawn timing: fade-START (B, tick 270) vs fade-END (A, tick 288)

**Grok:** B "only if alpha pierce added" — argued tick arithmetic vs wall-time decoupling makes both options "wrong"; suggested spawning at tick 240 with alpha=0 then tweening alpha during fade.
**Gemini:** B — argued "dramatic emergence" effect, tightly couples cinematic climax with creature arrival; Option A creates "disjointed pause between fade-out and spawn."

**Council convergence:** B (both)
**PRIME-AUDIT delta:** OVERRIDE to A. Reasoning: B sacrifices first 18 ticks (30%) of SPAWNING animation to fade-out occlusion. User's bug ("voltkin doesn't feel alive") IS spawn pulse visibility. Option A spawns AT exact fade-end (zero gap — Gemini's "disjointed pause" objection is mistaken). Grok's alpha-pierce is value-add but adds complexity; defer if playtest exposes brief invisibility issue.

### Q2 — P0-3 Serialize ALL effects vs filtered NET-relevant subset

**Grok:** BLOCKER — serializing all 8 kinds bloats JSON >3KB; Trystero WebRTC under Nostr jitter drops >25KB/s sustained. Filter to ARC_FLASH + BOND_FORMED + BOND_SEVERED.
**Gemini:** Filtered — 30x bandwidth reduction (30KB/s → ~1KB/s) critical for WebRTC; maintenance overhead of filter is minor.

**Council convergence:** Filtered (both, BLOCKER per Grok)
**ADOPTED.** Implementation: `SerializedEffect` discriminated union restricted to the 3 kinds; `snapshot()` filters via `world.effects.filter(e => e.kind === 'ARC_FLASH' || e.kind === 'BOND_FORMED' || e.kind === 'BOND_SEVERED')`.

### Q3 — P0-3 Client shake trigger: implicit (detect ARC_FLASH in world.effects) vs explicit (new SCREEN_SHAKE NetMessage)

**Grok:** Explicit — decouples client from host effect taxonomy; 8 bytes/event acceptable.
**Gemini:** Explicit — architecturally superior; host as single source of truth; "implicit forces client to re-implement host-side logic and creates brittle dependency."

**Council convergence:** Explicit (both)
**PRIME-AUDIT delta:** OVERRIDE to implicit. Reasoning: ARC_FLASH is already in NetSnapshot (filtered Q2 path). Implicit detection on client = 5 LOC. Explicit NetMessage adds protocol type + send + receive + dispatch branches = ~25 LOC + protocol surface. YAGNI: Anvil hasn't shipped; the "what if a future creature wants shake without ARC_FLASH" justification is hypothetical. Can refactor to explicit when Anvil arrives.

### Q4 — P0-4 Delete cinematicTimer, accept 300ms GODLY_COMPLETE delay

**Grok:** HIGH — unsafe; cites `lastCinematicOwner + pendingCreatureSpawn` interaction not exercised; warns of "duplicate creature IDs or skipped spawns"; warns of `resetIfPostgame()` + reconnection snapshot apply during 300ms window. Suggests keeping cinematicTimer in main.ts but making it dispatch on exact cinematic-end tick.

**Gemini:** Safe, certified. Verified: (a) cooldowns tied to GODLY_TRIGGER not GODLY_COMPLETE; (b) queue progression handled by onComplete (already correctly placed); (c) runGodlyMatcher pause trivially extended; (d) pendingCreatureSpawn interaction non-critical.

**Council divergence.**
**PRIME-AUDIT verdict:** Grok's specific failure modes investigated against code:
- **"Duplicate creature IDs"** — `pendingCreatureSpawn` is single-slot (main.ts:508-521 with dev-mode warn-on-overwrite guard). Only one creature per cinematic, regardless of when completion fires. ✗ No real failure mode.
- **"Skipped spawns"** — same single-slot guard. Spawn fires when `world.tick >= fireAtTick` (main.ts:551-567); no timing dependency on activeCinematicPlayerId. ✗ No real failure mode.
- **"`runGodlyMatcher` resumes early during extra 300ms"** — main.ts:418 gates matcher on `activeCinematicPlayerId !== null`. During 300ms gap, owner stays set, matcher stays paused. ✗ No real failure mode.
- **`lastCinematicOwner` stale during 300ms** — main.ts:455-457 compares to current `world.activeCinematicPlayerId`. Stays equal (both = owner ID) so the watcher early-returns. Next change (owner=null after GODLY_COMPLETE fires at 4800ms) drives the abort path correctly. ✗ No real failure mode.
- **Reconnection apply during 300ms** — connection-lost path (main.ts:707-716) calls `cutsceneOverlay.abort() + dispatch(GODLY_ABORT)`. GODLY_ABORT clears `activeCinematicPlayerId` immediately, which closes the gap. ✗ No real failure mode.

**Gemini's safe-with-E-01-test verdict ADOPTED.** Grok's concern noted but not substantiated by code reading.

## Additional Findings

### Gemini Q-01 — Effect lifetime determinism

Effects need `creationTick` field serialized so client computes age as `(currentWorldTick - effect.tick)` rather than `effect.tickLived++` (which starts at 0 on snapshot apply, losing k-tick latency window — 17% duration shrink at 10-tick lag).

**ADOPTED.** Effects already carry `tick` field in most kinds (per `src/game/effects.ts`). Audit during P0-3 implementation; add if missing. Update `effectsRenderer.ts` age computation to use `currentTick - effect.tick`.

### Gemini E-01 — P0-1 ∩ P0-4 interaction window

Defined 18-tick state window where `world.creatures.size > 0 && world.activeCinematicPlayerId !== null` (Option B path).

**ADOPTED — but P0-1A eliminates the window.** With Option A, creature spawns at tick 288 (same tick GODLY_COMPLETE fires via overlay.onComplete). Zero overlap. Test codifies as invariant.

### Gemini T-01 — Peer-disconnect mid-cinematic test gap

Test plan for P0-2 focuses on graceful exits but overlooks 1v1 peer-leave mid-cinematic. Race: peer-leave triggers teardownNet but cinematic timer (now sole-managed by cutsceneOverlay per P0-4) still active.

**ADOPTED.** Mandatory new test: 1v1 mode, voltkin trigger, peer-leave at tick 120, advance fake timers past completion point, assert no GODLY_COMPLETE dispatched + all cinematic state cleared.

### Grok #4 — Tooling/Quality BLOCKER

"560 tests + plans-archive pre-flight give false confidence; zero coverage for cinematic teardown races or replay determinism." Suggests ReplayDriver replacing Date.now/setTimeout with tick-driven scheduler.

**PARTIAL ADOPT.** ReplayDriver-grade refactor is multi-session scope. Adopted: at least ONE integration test for cinematic teardown (folded into T-01 above). ReplayDriver consideration deferred to S33+ as separate Standard PDR if user prioritizes.

### Grok #5 — `world.resetVisualState()` extraction

Suggests extracting cinematic-state-reset into helper. "world.creatures holds Pixi Container graphs with live event listeners."

**REJECTED.** Factual error: `world.creatures` is a Map of state-only Creature objects (id, type, pos, state, ticksInState, target* fields). NO Pixi Containers. CreatureRenderer holds sprites separately and disposes them in its own `sync()` on world.creatures.delete. The 6-line field-clear in `applyReturnToTitle` is appropriate scope; helper extraction is premature abstraction.

## Adopt-Reject Summary

| Council Item | Severity | Verdict |
|--------------|----------|---------|
| Q2 filter effects to 3 kinds | BLOCKER | ADOPT |
| Q-01 effect.tick for age computation | Quality | ADOPT |
| E-01 invariant test (post-P0-1A) | Concern | ADOPT (zero-window assertion) |
| T-01 peer-disconnect mid-cinematic test | Test gap | ADOPT |
| Grok #4 teardown integration test | BLOCKER | ADOPT (full ReplayDriver deferred to S33+) |
| Q1 Option B (fade-START) | Design | REJECT — PRIME-AUDIT override A |
| Q3 explicit SCREEN_SHAKE NetMessage | Architecture | REJECT — PRIME-AUDIT YAGNI |
| Q4 keep cinematicTimer | High | REJECT — unsubstantiated |
| Grok alpha-pierce | High | REJECT — over-engineered |
| Grok world.resetVisualState() | Medium | REJECT — factual error |

## API Cost (this session, this deliberation)

- Grok-4.20-0309-reasoning: 1 call (~$0.04)
- Gemini-2.5-pro: 1 call (~$0.01 estimated; quota at 1000/day cap, refresh ~midnight UTC)
- Total Council R1: ~$0.05
