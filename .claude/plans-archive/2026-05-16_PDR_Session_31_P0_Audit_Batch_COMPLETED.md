# PDR — Session 31 — S30 Audit P0 Batch (5 priorities)

**STATUS:** APPROVED-PENDING-USER-GO
**TIER:** Standard (~22K)
**DATE:** 2026-05-16
**DELIBERATION:** Council R1 (Claude + Grok-4.20-0309-reasoning DISRUPTOR + Gemini-2.5-pro AUDITOR) + PRIME-AUDIT (2 deltas)
**PRECEDING SESSION:** S30 (Voltkin regression repair, 6/6 priorities shipped 2026-05-14)
**AUDIT PROVENANCE:** 4 parallel audit agents this session (code-quality / test-determinism / runtime-correctness / docs-drift) surfaced 24 findings; user selected P0-only for S31, P1 for S32, P2 for S33.

---

## OBJECTIVE

Close five user-visible / multiplayer-visible / stability bugs in Voltkin BEFORE user's pending playtest produces additional voltkin tuning notes. Each bug is independently shippable; bundling reduces context overhead and lets user playtest the alive-feel + correctness of the multiplayer mirror in a single roll-out.

## SCOPE (5 priorities)

### P0-1 — Voltkin spawn-pulse hidden under cinematic overlay

**Bug:** `voltkin.ts` recipe `cinematicMs=4000`, `sustainedEffectMs=500`; `cutsceneOverlay.ts:28 FADE_MS=300`. `main.ts:519` schedules `pendingCreatureSpawn.fireAtTick = world.tick + cinematicMsToTicks(cinematicMs)` = +240 ticks. Overlay opaque (`bg.alpha=1`) until `cinematicMs + sustainedEffectMs` = 4500ms (tick 270), then fade 300ms → alpha=0 at 4800ms (tick 288). Creature exists from tick 240; alpha=0 visible from tick 288. **48 of 60 SPAWNING animation ticks (80%) are hidden under opaque overlay.** First-half spawn pulse is the bug-fix the user is about to evaluate; currently 0% of it is visible.

**Fix:** Change `main.ts:519` from `world.tick + cinematicMsToTicks(recipe.cinematicMs)` to `world.tick + cinematicMsToTicks(recipe.cinematicMs + recipe.sustainedEffectMs + FADE_MS)`. Export `FADE_MS` from `cutsceneOverlay.ts:28` (currently file-private const). Import in `main.ts`.

**Result:** SPAWN_CREATURE fires at tick 288 (exact moment `bg.alpha` reaches 0). Full 60-tick SPAWNING animation visible to player.

**Files:** `src/main.ts`, `src/render/cutsceneOverlay.ts` (export only).

**Tests:** `world.test.ts` — fixed-seed sim dispatches GODLY_TRIGGER for voltkin, advances `world.tick` step-by-step, asserts `pendingCreatureSpawn.fireAtTick === startTick + 288`.

**Council ruling (Q1):** Both Grok + Gemini ruled Option B (spawn at fade-START, emerge through fade).
**PRIME-AUDIT override:** Option A (fade-END) adopted. Reasoning: Option B sacrifices first 18 ticks (~30%) of SPAWNING pulse to fade-out occlusion. User's exact bug target IS the spawn pulse visibility. Gemini's "disjointed pause" objection is mistaken — Option A spawns AT fade-end (zero gap). Documented in PRIME-AUDIT file.

---

### P0-2 — Cinematic teardown leaks on RETURN_TO_TITLE / POSTGAME

**Bug:** `src/state/gameMode.ts:94-125 applyReturnToTitle` clears `primitives, bonds, freeSparks, effects, lastWinnerId, nextPrimitiveId, nextBondId, scoreProgress, scoreByPlayer` — but NOT:
- `world.creatures` (live Voltkin sprite + state stays in world)
- `world.nextCreatureId` (counter not reset)
- `world.activeCinematicPlayerId` (cinematic flag persists)
- `world.currentCinematicEvent` (event metadata persists)
- `world.pendingCinematics` (queued cinematics not drained)
- `world.pendingCreatureSpawn` (host can re-fire spawn on next PLAYING entry)

`main.ts:319-332 teardownNet` and `main.ts:351-358 resetIfPostgame` do NOT call:
- `cutsceneOverlay.abort()` — HTMLVideoElement persists off-DOM playing audio; videoTickerFn keeps pumping; Texture stays GPU-resident
- `screenShake.reset()` — `startTick` stuck at last-trigger; stage offset persists
- `clearTimeout(cinematicTimer)` — fires after teardown, attempts dispatch on stale world (mitigated by P0-4 which removes this timer entirely; ordering: P0-4 lands first)
- `lastCinematicOwner = null` — orchestration state stuck

**Fix (reducer):** `gameMode.ts:applyReturnToTitle` adds 6-line block clearing the 6 fields above.

**Fix (orchestration):** `main.ts` adds gameState transition watcher (mirrors existing `lastGameState !== 'PLAYING'` pattern at line 666-675):
```ts
if (world.gameState === 'TITLE' && lastGameState !== 'TITLE') {
  cutsceneOverlay.abort();
  screenShake.reset();
  lastCinematicOwner = null;
  // Note: cinematicTimer cleanup folded into P0-4 (deletion of the timer)
}
```
Placed inside the tick loop right after `tickGameState(...)`, before `lastGameState = world.gameState` assignment (line 676).

**Files:** `src/state/gameMode.ts`, `src/main.ts`.

**Tests:**
- `gameMode.test.ts` — populate `world.creatures + activeCinematicPlayerId + currentCinematicEvent + pendingCinematics + pendingCreatureSpawn + nextCreatureId`, dispatch `RETURN_TO_TITLE`, assert all 6 fields cleared (also primitives/bonds/freeSparks/effects/etc still cleared as before — back-compat).
- Integration test `cutsceneTeardown.test.ts` (NEW): mock cutsceneOverlay + screenShake, simulate mid-cinematic state, trigger PLAYING→TITLE transition via gameState assignment, assert `cutsceneOverlay.abort()` called, `screenShake.reset()` called, `lastCinematicOwner === null`.
- **Gemini T-01 (ADOPTED):** Peer-disconnect mid-cinematic test. Simulate 1v1 PLAYING + active Voltkin cinematic at tick 120; trigger `connectionLost` (peerCount==0); assert main.ts:707-716 lostConnection path calls `cutsceneOverlay.abort()` AND `screenShake.reset()` (currently abort yes, reset no — needs adding to that path too).

---

### P0-3 — 1v1 client never sees ARC_FLASH lightning or screen-shake

**Bug:** `src/state/save.ts:147-173 snapshot()` serializes everything except `world.effects`. Client peer renders mirrored creatures (S28 added) but no lightning bolts (visual), no clave/sever audio (audio), no shake feedback (kinesthetic). User experience on 1v1 client: bonds vanish with zero explanation; voltkin walks silently and bonds disappear.

**Fix (NetSnapshot, filtered):**
- `save.ts WorldSnapshot` adds `effects?: SerializedEffect[]` (optional for pre-S31 save compat).
- New `SerializedEffect` discriminated-union subset: serialize only `ARC_FLASH | BOND_FORMED | BOND_SEVERED` (3 of 8 kinds — the visual+audio-driving ones; STRUCTURE_GROW/MERGE/SCORE_TIER/SEVER_ERASE/BOND_COMMIT are host-local visual flair).
- Each serialized effect carries: `kind, tick (host emit-tick), pos (Vec2), plus kind-specific fields (bondId for BOND_FORMED/SEVERED, start+end for ARC_FLASH)`.
- `snapshot()` emits only effects with `effect.tick === world.tick` (current-frame effects; renderer wipes after sync).
- `applySnapshotCore` replaces `world.effects` array contents: `world.effects.length = 0; if (snap.effects) for (const e of snap.effects) world.effects.push(deserializeEffect(e));`

**Fix (client-side shake trigger):**
- `main.ts` client-side after `clientSync.receive` / `interpolateInto`: scan `world.effects` for any `e.kind === 'ARC_FLASH' && e.tick === world.tick` → `screenShake.trigger(world.tick)`. ~5 LOC.

**Council ruling (Q2):** Both ruled filtered serialization (CONVERGENT). Adopt.
**Council ruling (Q3):** Both ruled explicit `SCREEN_SHAKE` NetMessage.
**PRIME-AUDIT override:** Implicit detection on client. Reasoning: ARC_FLASH is already in NetSnapshot (filtered Q2 path). Explicit NetMessage adds protocol type definition + send call + receive branch (~25 LOC + protocol surface). Implicit detection is 5 LOC. YAGNI: Anvil hasn't shipped; explicit decoupling can be added when a non-ARC-FLASH shake-source appears. Documented in PRIME-AUDIT.

**Gemini Q-01 (ADOPTED):** Effect lifetime determinism. NetEffect must carry host `tick` field. Client effectsRenderer must compute age as `(currentWorldTick - effect.tick)` rather than internal `tickLived++`. Otherwise effects span less time on client due to snapshot lag (k-tick latency = (60-k)/60 = 17% duration reduction at 10-tick lag).
**Implementation:** Existing GameEffect types already carry `tick: number` in most kinds (check ARC_FLASH/BOND_FORMED/BOND_SEVERED specifically). If missing, add. Update `effectsRenderer.ts effectLifetime()` helper to compute age from `currentTick - effect.tick` consistently.

**Files:** `src/state/save.ts`, `src/main.ts`, `src/game/effects.ts` (if effect types need tick field), possibly `src/render/effects/lifetime.ts` (age computation).

**Tests:**
- `save.test.ts` — round-trip serialize/deserialize for `effects: [ARC_FLASH, BOND_FORMED, BOND_SEVERED]`. Assert filtered kinds preserved exactly; non-filtered kinds dropped.
- `save.test.ts` — pre-S31 save (no `effects` field) → `applySnapshotCore` defaults to `world.effects.length = 0`; world stays valid.
- `main.test.ts` (or new `clientShake.test.ts`) — simulate applyNetSnapshot with ARC_FLASH at current tick → assert `screenShake.isActive(world.tick) === true`.
- `effectsRenderer.test.ts` — assert effect with `tick = T` rendered at `currentWorldTick = T + 10` shows age 10, not age 0. Replay-deterministic.

---

### P0-4 — Duplicate cinematic-completion GODLY_COMPLETE dispatch

**Bug:** Two timer paths fire GODLY_COMPLETE for the same cinematic:
- `main.ts:523-526` `cinematicTimer = setTimeout(() => dispatch(GODLY_COMPLETE), recipe.cinematicMs + recipe.sustainedEffectMs)` — fires at 4500ms (immediate dispatch, no fade)
- `cutsceneOverlay.ts:227-232` `completeTimer = setTimeout(() => this.fade(...).then(cleanup + ctx.onComplete()))` — fires at 4500ms, fade runs 300ms, `ctx.onComplete()` callback at `main.ts:486-498` dispatches GODLY_COMPLETE at 4800ms

Two GODLY_COMPLETE dispatches 300ms apart. Reducer is idempotent (no-ops if `activeCinematicPlayerId` already null). Latent break-day for any future side-effect added to GODLY_COMPLETE or for any reader observing `activeCinematicPlayerId` between the two dispatches.

**Fix:** Delete `cinematicTimer` field declaration (main.ts:413), all 4 references:
- main.ts:461-464 (clearTimeout in startCinematicIfNeeded null branch)
- main.ts:523-526 (setTimeout setup at end of startCinematicIfNeeded)
- main.ts:709-712 (clearTimeout in connection-lost path)

Rely solely on `cutsceneOverlay.onComplete` callback (main.ts:486-498) to dispatch GODLY_COMPLETE + shift `world.pendingCinematics` queue.

**Connection-lost path (main.ts:707-716):** Becomes simpler. Just call `cutsceneOverlay.abort()` + `dispatch(GODLY_ABORT)` + clear `lastCinematicOwner`. (`abort()` internally clears all overlay timers via `for (const t of this.timers) clearTimeout(t);` — already handles cleanup.)

**Files:** `src/main.ts` (deletions only; ~10 LOC removed).

**Tests:**
- `cinematicCompletion.test.ts` (NEW) — mock cutsceneOverlay, fire Voltkin recipe, advance fake timers to `cinematicMs + sustainedEffectMs + FADE_MS`, assert exactly ONE GODLY_COMPLETE dispatch observed (was 2 pre-fix).
- **Gemini E-01 (ADOPTED):** 18-tick invariant test. P0-1A spawns at tick 288; P0-4 delays GODLY_COMPLETE to tick ~288 also. Both events fire same tick (no window). With P0-1B (rejected) the window would be tick 270-288. With our adopted P0-1A, no window. Document via test: `worldInvariant.test.ts` — assert `world.creatures.size > 0 && world.activeCinematicPlayerId !== null` is FALSE at all ticks for voltkin replay. (Post-P0-1A: creature spawns same tick as cinematic clears; no overlap.)

**Council ruling (Q4):** Grok unsafe (cites lastCinematicOwner / nextCreatureId risk), Gemini safe-with-E-01.
**PRIME-AUDIT verdict:** Grok's specific claims investigated. `pendingCreatureSpawn` is single-slot (main.ts:508-521) — only ONE spawn per cinematic regardless of completion timing. `runGodlyMatcher` gated on `activeCinematicPlayerId != null` (main.ts:418) blocks new triggers during the 300ms gap. `lastCinematicOwner` updates next tick after `startCinematicIfNeeded` sees the null transition. No real race. Gemini's safe-with-test verdict adopted; Grok concern noted but unsubstantiated by code reading.

---

### P0-5 — Flip 5 stale STATUS:IN-PROGRESS plan-archive headers

**Bug:** `.claude/plans-archive/` contains 5 voltkin_phase2 ACTIVE_PLAN files still tagged `STATUS: IN-PROGRESS` despite Phase-2 finale shipping at S28. Pre-flight hook reads from plans-archive and emits WARN every session.

**Files (line 3 of each):**
- `.claude/plans-archive/2026-05-13_ACTIVE_PLAN_voltkin_phase2_draft_S23close.md`
- `.claude/plans-archive/2026-05-14_ACTIVE_PLAN_voltkin_phase2_S24close.md`
- `.claude/plans-archive/2026-05-14_ACTIVE_PLAN_voltkin_phase2_S25close.md`
- `.claude/plans-archive/2026-05-14_ACTIVE_PLAN_voltkin_phase2_S26close.md`
- `.claude/plans-archive/2026-05-14_ACTIVE_PLAN_voltkin_phase2_S28close_PHASE2_FINALE.md`

**Fix:** Edit line 3 of each: `STATUS: IN-PROGRESS` → `STATUS: COMPLETED`.

**Risk:** Zero. Doc-only.

**Tests:** Skip. Visual diff on next session pre-flight WARN absence.

---

## APPROACH (execution order)

Sequential per-priority commits with push (S9 rule). Each priority lands a single commit; per-priority writeback of `session-state.json` (check_completed:true + check_method verbose + checkpoint_commit + real_context_tokens_at_close).

1. **P0-5 first** (trivial doc flip — fastest sanity check that the session toolchain is healthy after S30 close)
2. **P0-4 second** (deletion-only, no dependencies, simplest of code changes)
3. **P0-1 third** (1-LOC main.ts + 1-export cutsceneOverlay.ts; depends on no other P0)
4. **P0-2 fourth** (reducer + orchestration watcher; folds in P0-4 timer-cleanup-already-done)
5. **P0-3 last** (largest scope: NetSnapshot schema additions + filtered serializer + client shake hook + 4 new tests)

Total ~70-90 LOC added + ~15 LOC deleted + ~8 new tests.

## RISKS

- **R1 (P0-3):** Effects serialization is the largest change. Risk: schema misalignment with existing effectsRenderer drainage. Mitigation: filter to 3 kinds only; effectsRenderer already handles all GameEffect kinds idempotently.
- **R2 (P0-1):** `cinematicMsToTicks(recipe.cinematicMs + recipe.sustainedEffectMs + FADE_MS)` requires FADE_MS export from cutsceneOverlay. Risk: circular import (main.ts imports cutsceneOverlay, cutsceneOverlay imports nothing from main.ts). ✓ No circular risk.
- **R3 (P0-2):** Client-side `applyReturnToTitle` runs via `onReturnFromConnectionLost` (main.ts:313-316). Risk: client clears creatures locally then host snapshot rehydrates them. Mitigation: connection-lost path implies host is gone; no incoming snapshot to rehydrate. ✓
- **R4 (P0-4):** 300ms delay to GODLY_COMPLETE. Verified safe (PRIME-AUDIT investigation). Mitigation: E-01 invariant test codifies the post-P0-1A no-window state.
- **R5 (replay determinism):** Adding effect.tick to NetEffect should preserve replay-deterministic visual age computation. Tests verify.
- **R6 (test breakage):** session15.test.ts + gameMode existing tests exercise applyReturnToTitle. Risk: new field clearing changes test snapshots. Mitigation: existing tests don't pre-populate the 6 new fields → they're `undefined` / empty by default → no observable change.

## ROLLBACK

Per-priority commits enable selective revert. P0-5 doc-only (revert is `git checkout HEAD~ -- .claude/plans-archive/`). P0-1/P0-4 single-file changes. P0-2 affects 2 files. P0-3 affects 2-3 files. Worst case: `git revert` 5 priority commits + reflexion delete; world returns to S30 state (post-9d69a21).

## ESTIMATE

- **Tokens:** ~22K (Standard tier — 5 priorities × ~3-5K each + verification)
- **LOC delta:** +70-90 add, -15 delete
- **Tests:** +8-10 new (currently 560, target ~568-570)
- **Bundle:** +0.5KB max (effects serializer + FADE_MS export + client shake hook). 466.23KB → ~466.7KB. 33.27KB headroom on 500KB cap.
- **Real context budget:** ~150K of 1M (GREEN throughout).

## VERIFICATION / CHECK PHASE

- `npx vitest run` — all 568-570 tests green (was 560 baseline).
- `npx tsc -b --noEmit` exit 0.
- `npx vite build` — main bundle ≤467KB.
- Preview-tool browser verification (per S30 P0f pattern):
  1. Open dev server `?debug=1`, transition title → PLAYING.
  2. Trigger Voltkin via `__SPARK__.controls.dispatchFn({type:'GODLY_TRIGGER', event:{godlyId:'voltkin', triggererPlayerId:0, targetComponentPrimitiveIds:[], targetPos:{x:640, y:360}}})`.
  3. Force ticker pump: `for(let i=0;i<350;i++) app.ticker.update(performance.now()+i*16.67)`.
  4. Screenshot at tick ~290 — assert SPAWNING animation visible (no opaque overlay) + creature.state === 'SPAWNING'.
  5. Cancel mid-cinematic: dispatch RETURN_TO_TITLE at tick 100. Verify `world.creatures.size === 0`, `activeCinematicPlayerId === null`, `cutsceneOverlay.isActive() === false`, `screenShake.isActive(world.tick) === false`.
- Triumvirate CHECK is degraded (Standard tier nominally requires Triumvirate; Gemini may again hit quota). Fallback: Grok-ANALYST + RALPH-PATROL + Claude self-audit. Document degradation in session-state.

## COUNCIL ADOPTION TABLE

| Item | Source | Severity | Verdict |
|------|--------|----------|---------|
| Filter effects to 3 kinds (Q2) | Grok+Gemini CONVERGENT | BLOCKER | ADOPT |
| Effect.tick for client age (Q-01) | Gemini | Quality | ADOPT |
| 18-tick invariant test (E-01) | Gemini | Concern | ADOPT (with P0-1A means no window — test asserts that) |
| Peer-disconnect mid-cinematic test (T-01) | Gemini | Test gap | ADOPT |
| Tooling/teardown integration test | Grok | BLOCKER | ADOPT |
| Spawn at fade-START (Q1=B) | Grok+Gemini CONVERGENT | Design | REJECT (PRIME-AUDIT: spawn pulse visibility) — Option A |
| Explicit SCREEN_SHAKE NetMessage (Q3) | Grok+Gemini CONVERGENT | Architecture | REJECT (PRIME-AUDIT: YAGNI) — implicit |
| Keep cinematicTimer, move dispatch tick-driven (Q4) | Grok | High | REJECT — safety claim unsubstantiated |
| Alpha-pierce on creature during fade | Grok | High | REJECT — over-engineered; revisit if playtest needs |
| `world.resetVisualState()` extraction | Grok | Medium | REJECT — premature abstraction; single-site reset is enough |

## DELIBERATION HISTORY

See `2026-05-16_PDR_Session_31_BattleLedger.md` (Grok + Gemini full responses).
See `2026-05-16_PDR_Session_31_PRIME_AUDIT.md` (override rationale Q1+Q3).

## USER APPROVAL

Awaiting `go` / `ship it` / `approved`. On approval:
1. Write `pdr_approved:true + deliberation_completed:true + unlock_source:user` to session-state.json at BOTH top-level AND each priority entry (per Genesis S35 hook semantics).
2. Mark chapter "S31 P0 batch execution."
3. Execute P0-5 → P0-4 → P0-1 → P0-2 → P0-3 sequentially.
4. CHECK phase: vitest + tsc + vite build + preview-tool browser verification.
5. Closeout: per-priority reflexion entries; BACKLOG already updated; handoff.
