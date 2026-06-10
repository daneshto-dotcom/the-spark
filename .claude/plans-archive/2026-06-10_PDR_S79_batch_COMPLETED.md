STATUS: COMPLETED (S79 P1-P6 + S80 P7 sharpening — all shipped, CI green on 1a89b0a)

# PDR S79 — Batch: playtest round-2 (length + seagull/poop visibility) + carried audit fixes (2 HIGH + 4 MEDIUM + LOW sweep)

## S80 SCOPE AMENDMENT (Rule 16 — user-explicit: "sharpen every detail... any bug you find fix it")
The S79 external 5-lens audit workflow died on the org spend limit (5/5 reviewers failed; empty
result = vacuous). S80 re-ran the audit IN-CONTEXT (direct adversarial re-read of the full diff)
and shipped the confirmed findings:
1. **Foul-set timing inconsistency (introduced by S79 P3, fixed)** — reconcile ran only on
   destroy paths, so a prim bonded into a fouled component stayed un-fouled (earning income on a
   pooped building, un-tinted) until some UNRELATED destroy event retroactively swallowed it.
   Fix: reconcileFouledPrimitives after PLACE_PRIMITIVE + PLACE_FROM_FREE (world.ts) —
   the foul set now ALWAYS equals the splat-anchors' current components. Dispatch-level test.
2. **OPT: applyPoopTick hot path** — `[...keys].sort()` per FALLING poop per tick (array copy +
   O(P log P)) → zero-allocation lowest-id tracking; selection IDENTICAL (differential tests for
   both the primitive and free-spark passes, Map insertion order deliberately scrambled).
3. **Benched-player silent wipe (gameplay bug, fixed)** — a hunter-caught / potato-benched
   player (avatar hidden, input locked, pos frozen) cleaned any splat landing within 44px of
   their frozen position. Clean sweep now skips currently-benched players.
4. **OPT: seagull/poop poll allocation** — size>0 gates added (matches the bomb/potato/rainbow
   poll idiom; skips 3 empty-array allocations per tick in the no-hazard common case).
Verified clean (no action needed): host handler drops non-INTENT kinds; ClientSync seq-wedge now
upstream-gated by P4 sender-auth; HUD reads PHASE_1_WIN_SCORE symbol; no stale codex text;
fog does not leak enemy foul tint (tint rides the fog-masked structure sprite, splat is the
deliberate fog-exempt cue); snapshot absent-field clears fouledPrimitives on the client.

**Tier:** Full (batch >30K) · **Unlock:** USER-EXPLICIT ("i approve full session priority and autonomous run") · **Status:** IN-PROGRESS

## OBJECTIVE
1. Games still end a little quick → apply the planned next lever (win-score raise).
2. User never saw the seagull; wants poop-on-building to be VISIBLE (building visibly fouled + income stopped until a spark wipes it) → cadence + structure-level foul visuals.
3. Ship ALL carried S78 audit findings: 2 HIGH, 4 MEDIUM, LOW sweep.
4. Final full check/analyze/audit (Rule 22 runtime pass + adversarial multi-agent CHECK), fix what's found, /handoff.

## A.0 STATE-DISCOVERY (Rule 21) — empirical probe results (all target files read this session)
| Claim (handoff) | Actual | Delta |
|---|---|---|
| potatoLifecycle.ts:187 delete site | line **191** | line drift (S78 edits) — fix applied at actual site |
| disruptionManager.ts:165 delete site | line 165 confirmed | none |
| bomb destroy path needs own fix | bombs route through applySeverBond→applySeverTopology | 2 sites cover all 3 paths |
| worldTypes doc "fouledPrimitives NOT serialized / HOST-ONLY" | it IS serialized in WorldSnapshot AND rides NetSnapshot (save.ts:469, applySnapshotCore:665) | doc-stale MEDIUM confirmed; ALSO means client can render foul tint with NO wire change |
| (not in handoff) | **NEW BUG**: main.ts orphan sweep dispatches CLEAN_POOP when anchor prim destroyed, but applyCleanPoop's component branch BFS returns [] → deletes NOTHING incl. the poop itself → infinite per-tick re-dispatch + immortal floating splat | added to P3 scope |
| transport.on plumbs peerId | confirmed (MessageHandler = (msg, peerId)) | none |
| seagull "~every 2 min" | 15–24 sparks at the LOCKED 0.15 sparks/s = 100–160 s; ~2-min games ended before first gull | root cause of "didn't even see the bird" |
| e2e win-score coupling | every spec injects __TEST_WIN_SCORE__/score seams | win-score raise is e2e-safe |

## SCOPE (priorities)
- **P1 — game length (Micro):** constants.ts `PHASE_1_WIN_SCORE` 50→150 + `SCORE_TIER_STEP` 15→50 (HUNTER_TRIGGER_SCORE auto-scales to 112). Update stale tier comment.
- **P2 — seagull visibility + pooped-building visuals (Standard):**
  - `SEAGULL_SPAWN_MIN/MAX_SPARKS` 15/24 → 7/12 (first gull ~47–80 s, recurring).
  - structureRenderer: fouled prims tinted sickly poop-green (lerp ownerColor→0x9aa15c); fouled bonds tinted the same way (reads world.fouledPrimitives — synced to clients via NetSnapshot already).
  - poopRenderer: SPLAT_STRUCTURE drawn ~2.3× bigger + extra drips (unmistakable "go wipe it" cue).
- **P3 — HIGH-1 fouledPrimitives correctness (Standard):** new `reconcileFouledPrimitives(world)` in seagullLifecycle (fouled = union of components of live SPLAT_STRUCTURE anchors), called from applySeverTopology + applyPotatoDetonate ends → fixes (a) stale-id leak on sever/bomb/potato, (b) un-cleanable income-0 when a fouled structure is severed off its splat-anchor. Fix applyCleanPoop orphan branch (anchor prim gone → delete the poop). Rewrite worldTypes.ts fouledPrimitives doc (MEDIUM-4 folded in). Unit tests.
- **P4 — HIGH-2 client sender-auth + MEDIUM-2 host-loss limbo (Standard):** NetSession gains `hostPeerId` (latched TOFU in clientHandlers from seat-0-consistent LOBBY_PRESENCE/START_GAME_SIGNAL roster, NETSNAPSHOT fallback; cleared in teardownNet). Gate NETSNAPSHOT/GODLY_TRIGGER/START_GAME_SIGNAL/ENDGAME/LOBBY_PRESENCE on sender===hostPeerId (fail-closed). main.ts connectionLost ALSO fires when a 3+p client loses the host specifically (hostPeerId ∉ peerIds()). Unit tests.
- **P5 — MEDIUM-1 spawner-RNG serialization + MEDIUM-3 CREATURE_CHARGE drain-filter (Standard):** rng.ts mulberry32 → StatefulRng (getState/setState; same sequence); Spawner.getState()/restoreState() (nextId, interarrival, 4 cadence countdowns [null=∞], 5 rng states). effectsRenderer drain-skip CREATURE_CHARGE (+ no-op draw case). Unit tests (round-trip determinism; activeCount).
- **P6 — LOW sweep (Micro):** gameState.ts header (score-based win), addScore stale docstring, protocol.ts `as 7`→`as typeof PROTOCOL_VERSION` + stale "as 6" comment, softReset clears hazards/fouls.
- **FINAL:** Rule 22 runtime audit-pass + adversarial multi-agent CHECK (Workflow) over the full session diff; fix findings; full gates; /handoff.

## OUT OF SCOPE
Backlog #4 netcode infra (host-migration/reconnect) — hostPeerId latch is a stepping stone only. #3 EYES fog/CVD (won't fit with quality gates). S69 lobby seat-UX (deferred plan stays deferred). NO PROTOCOL_VERSION bump anywhere (no wire-shape change; foul tint reads an already-shipped snapshot field).

## RISKS
- Win-score raise → ~5–7 min games is an estimate; user feel-test decides (knobs documented).
- Sender-auth TOFU: a spoofer who beats the host's first roster beacon could latch — accepted ceiling without crypto identity; documented. Fail-closed otherwise.
- reconcileFouledPrimitives changes sever semantics: severed-off splat-less fragment resumes income (correct — no splat on it).
- Foul tint on client relies on fouledPrimitives in NetSnapshot — verified shipped since S77.

## TESTING (gates per priority)
tsc -b 0 errors · vitest suite green (1149+new) · vite build <550 KB · Playwright gating lane locally on gameplay/net-touching priorities (P2/P3/P4) · CI green on push (Rule 22: never declare done before the run concludes).

## ROLLBACK
Each priority = isolated commit; revert by SHA. No migrations, no wire changes.

## TOKEN BUDGET
~350–450K total (GREEN→YELLOW); ORANGE → finish current priority + /handoff.

## SUCCESS CRITERIA
All 6 priorities committed+pushed, gates green, CI green, audit findings closed or logged carry-forward, handoff written.
