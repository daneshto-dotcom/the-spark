# PDR — S52 Batch (Standard tier)

**Session:** S52
**Tier:** Standard (~22K tokens estimated, ~290 LOC across 8 files, deliberation 1-round Council)
**Approved-upfront by user:** "I want us to work on the highest recommended top priority batch this session. I will approve your autonomous run because iil be heading to bed."
**Date:** 2026-05-26
**Author:** ZERO (orchestrator) / KARPATHY (state-discovery)

═══════════════════════════════════════════════════════════
STATUS: COMPLETED (body status corrected S119 — was firing the pre-flight ACTIVE-PLAN WARN every boot since S53)
═══════════════════════════════════════════════════════════

## OBJECTIVE

Eliminate the three P0 user-facing regressions blocking 2-peer playtest, plus the S51-carry-forward Gemini CHECK #1 audio edge case:

1. **P1 — P2 client input asymmetry (BLOCKING).** Joiner's LMB-drag-place flow is broken: (a) clicks "stick" the joiner in a Carrying state forcing RMB-release, (b) the AttractDrag visual jitters or is invisible on the joiner's own screen.
2. **P2 — Raid charge ratio amendment.** Spec §13.11 PRIME-AUDIT B's "cycle-no-consume" rule lets the attacker break ≥1 cycle bond for 0 charges per hostile sever sequence — user reports this reads as "5 destructions per raid point". User-authorized spec amendment: every hostile sever consumes 1 charge regardless of cycle topology.
3. **P3 — duckMusic AudioContext suspend edge.** Gemini CHECK #1 from S51 — `setTimeout(restoreFn, durationMs)` is wall-clock, but `AudioContext.currentTime` freezes during tab-blur suspend. Replace with Web Audio scheduled restore.

## SCOPE

### P0 — State Discovery + Council R1 + PRIME-AUDIT (this priority)

**Tier:** Micro pre-execution (read-only state probe + deliberation; Council waived per "setup phase" precedent)

**State discovery (Phase A.0 empirical probe):**
- ✅ `gh notification` + `gh run list` — git-email source = S50 P4/P5 E2E failures (FIXED by S51 P1, latest CI SUCCESS at SHA `0c277a4`). Cross-project notifications (chateau-guardian, brain-command-center, mockingbird) confirmed out-of-scope.
- ✅ Read `src/input/controls.ts` (full file) — confirmed LMB-up dispatches PICKUP_SPARK + PLACE_PRIMITIVE as TWO separate intents per S46 P2 protocol amendment
- ✅ Read `src/net/protocol.ts` — INTENT envelope schema; KNOWN_GAME_ACTION_TYPES allowlist enforced compile-time + wire
- ✅ Read `src/net/sync.ts` — `interpolatePositions` unconditionally clobbers `freeSparks.pos` every render frame (no escape hatch for locally-dragged spark)
- ✅ Read `src/state/placePrimitive.ts` — spawner-zone reject (line 119-121) + territoryBlock reject (line 128-131) both return early without dropping the carrier
- ✅ Read `src/state/world.ts` SEVER_BOND case (line 367-404) — `chargeToConsume = split.del.size === 0 ? 0 : computeBaseCharge(...)` is the cycle-no-consume code path
- ✅ Read `src/state/disruptionManager.ts` — `canSeverBond` + `computeBaseCharge` pure helpers, both correctly return 0/1 per the locked rule
- ✅ Read `src/state/sparkLifecycle.ts` — `applyPickupSpark` (line 122-161) — confirmed PICKUP_SPARK transitions player→Carrying + sets spark.state='Carried', no rollback path
- ✅ Read `src/game/player.ts` — `tickBuildAction` (line 110-119): builds → charges at BUILD_ACTIONS_PER_CHARGE=5, capped at MAX_DISRUPTION_CHARGES=2
- ✅ Read `src/render/audioManager.ts` `duckMusic` (line 321-354) — confirmed setTimeout-based restore, `audioContext.currentTime` read at TIMEOUT-FIRE not SCHEDULE time
- ✅ Read `src/main.ts` (full file) — confirmed `dispatchFn` joiner path: `PREDICTABLE_ACTIONS = {PICKUP_SPARK, UPDATE_AVATAR_POS}` locally + over wire; PLACE_PRIMITIVE over wire only
- ✅ Read `LOCKED_DECISIONS.md` §13.11 + §13.13 — PRIME-AUDIT B "cycle-no-consume" is explicit LOCKED spec; user-authorized amendment required
- ✅ Read `src/state/disruptionManager.test.ts` — 10 tests in scope (self-sever, hostile, charge cap, cycle paths)
- ✅ Unit baseline: 795/796 PASS. 1 pre-existing flake (`physics/stress.test.ts` worst tick 54.30ms > 50ms tolerance — environmental, PC-reboot variance, not a regression from S51).

**Root-cause hypotheses:**

**Bug 1a — Stuck-in-Carrying after place reject (CONFIRMED via code reading):**
- Sequence: joiner LMB-up dispatches PICKUP_SPARK then PLACE_PRIMITIVE separately. Host accepts PICKUP_SPARK (player→Carrying). Host validates PLACE_PRIMITIVE: spawner-zone, target-missing, territory checks. If ANY reject: host returns early without DROP_SPARK rollback → player permanently in Carrying.
- Empirical evidence: player 1 debug snapshot shows `territoryBlock: 45` rejects, all from the joiner's intent stream (P2 debug shows 0 because the counter is host-side).
- User-perceived symptom: "click spark, glues to you, RMB to release" — matches because joiner is now in Carrying state and the only release path is RMB-up ConnectDrag → PLACE_PRIMITIVE at a valid location.

**Bug 1b — AttractDrag visual clobbered by snapshot interpolation (CONFIRMED via code reading):**
- `sync.ts:interpolatePositions` unconditionally writes `spark.pos.x = lerp(prev, curr, t)` every render frame for every spark in the snapshot
- `controls.ts:stepAttractLerp` writes `spark.pos.x = lerp(old, cursor, ATTRACT_FOLLOW_RATE)` every physics substep on the locally-dragged spark
- Conflict: snapshot wins 10× per second (NET_SNAPSHOT_HZ=10), AttractDrag wins ~60× per second between snapshots → jittery, biased toward snapshot position (which is "spark at spawn" until host receives PICKUP_SPARK)
- User-perceived symptom: "you cant see that they are being dragged. they stay at spawn point and then teleport to supposed leave point" — matches because spark visually stays near spawn during drag and "teleports" when the post-place snapshot arrives showing the primitive.

**Bug 2 — Raid charge cycle-no-consume (user-authorized spec amendment):**
- Current §13.11 PRIME-AUDIT B LOCKED: cycle bonds (split.del.size===0) consume 0 charges
- Player's mental model: "I have 2 raid points, each gets me 1 bond break" — but in practice, attacker can break N cycle bonds first then 1 critical bond, paying only 1 charge.
- User's verbatim ask: "each raid point = break 1 connection no 5". Spec amendment.

**Bug 3 — duckMusic suspend edge (S51 Gemini CHECK #1 carry-forward):**
- `setTimeout(restore, durationMs)` is wall-clock; runs even when AudioContext is suspended.
- `audioContext.currentTime` freezes during suspend; setTargetAtTime at TIMEOUT-FIRE time can land at a stale ctx-time, producing abrupt volume restore.
- Fix: schedule the restore via `setTargetAtTime(target, scheduledRestoreCtxTime, 0.150)` at SCHEDULE time using `newEnd` (already computed). Web Audio queue handles suspend/resume correctly.

### P1 — Atomic place-from-free + interpolation drag-lock (~210 LOC)

**Files modified:**
- `src/state/world.ts` — add PLACE_FROM_FREE to GameAction union; dispatch case
- `src/state/placeFromFree.ts` — NEW reducer (~150 LOC). Atomic: validates everything FIRST, then commits spark→primitive transformation. On any reject, spark stays Free + player stays Idle.
- `src/state/placePrimitive.ts` — extracted helpers `pickHostTargetPrimitive` + `collectHostMergeCandidates` already exist; reused. Existing PLACE_PRIMITIVE path stays (required for RMB ConnectDrag flow).
- `src/input/controls.ts` — onUp LMB branch: replace `dispatchFn(PICKUP)` + `dispatchFn(PLACE)` with ONE `dispatchFn(PLACE_FROM_FREE { sparkId, playerId, placementPos, carriedType, targetPrimitiveId, stiffnessTier, mergeCandidateIds, extraBondTargetIds })`. ConnectDrag RMB-up path unchanged.
- `src/net/protocol.ts` — add `PLACE_FROM_FREE: true` to KNOWN_GAME_ACTION_TYPES_RECORD
- `src/net/sync.ts` — `interpolatePositions` accepts optional `dragLockedSparkId?: SparkId`; skip lerp for that spark
- `src/main.ts` — pass `controls.state.kind === 'AttractDrag' ? controls.state.sparkId : undefined` to `clientSync.interpolateInto`. PLACE_FROM_FREE NOT in PREDICTABLE_ACTIONS (same as PLACE_PRIMITIVE — primitive ID conflicts).

**Tests added/modified:**
- `src/state/placeFromFree.test.ts` — NEW (~80 LOC). Covers: happy path, spawner-zone reject (spark stays Free), territory reject (spark stays Free), target-missing race (spark stays Free), remote-origin host re-pick of target + merge candidates, color-segregation demotion to anchor.
- `src/net/sync.test.ts` — add 2 tests for dragLockedSparkId opt-out (locked spark not lerped; unlocked sparks still lerped).
- `src/input/controls.test.ts` (if exists) — assert single PLACE_FROM_FREE dispatch per LMB-up burst (no double PICKUP+PLACE).

### P2 — Raid charge ratio amendment (~55 LOC)

**Files modified:**
- `src/state/world.ts` SEVER_BOND case — remove the `split.del.size === 0 ? 0 : ...` branch; always use `computeBaseCharge` directly. Self-sever (0) and hostile (1) paths preserved; cycle path now uniformly 1.
- `src/state/disruptionManager.ts` — update header comment + `computeBaseCharge` JSDoc. Code unchanged (already returns 1 for hostile).
- `LOCKED_DECISIONS.md` §13.11 — amend PRIME-AUDIT B block: replace "cycle-bond sever no-consume" with "cycle-bond sever consumes 1 charge (S52 user-authorized amendment)". Note S52 amendment.
- `src/state/world.test.ts` — update `cycle-no-consume` test from `disruptionCharges).toBe(1)` (preserved) to `.toBe(0)` (consumed). Rename: `cycle-bond hostile sever consumes 1 charge (S52 amendment)`.
- `src/state/disruptionManager.test.ts` — no test directly asserts cycle path (computeBaseCharge tests focus on hostile/self/physics paths). No change needed.

### P3 — duckMusic AudioContext suspend fix (~35 LOC)

**Files modified:**
- `src/render/audioManager.ts` — `duckMusic`: replace `setTimeout(restoreFn, durationMs)` with `musicGainNode.gain.setTargetAtTime(restoreTarget, newEnd, 0.150)`. Remove `duckTimeout` state variable. Add `_resetAudioForTest` clears duckEndCtxTime.
- `src/render/audioManager.test.ts` — add 2 tests: (a) duckMusic schedules restore at ctx-time = now + duration/1000, (b) overlapping ducks extend restore time to max(currentEnd, candidate).

### Out of scope (carry-forward)

- **Host-side visibility of joiner's AttractDrag** (would need new wire message ATTRACT_DRAG_POS at 10Hz). S53+ if user requests.
- **48k Opus re-encode** (S51 user choice — not requested).
- **__TEST_RNG_SEED__ seam** (S51 Council Δ1 deferred).
- **vitest 4.x bump** (S50 carry).
- **Sym E rendering helper** (S50 P5 EOS-audit carry).
- **Phase-2 next mechanic** (user design decision; not building this session).

## TESTING

**Unit:**
- Pre: 795/796 PASS (1 environmental flake)
- Post: 800/801 minimum (5 new tests across P1+P3). Existing flake noted.

**TypeScript:**
- `npx tsc -b --noEmit` clean before commit each priority.

**Build:**
- `npm run build` → bundle ≤500 KB charter. Pre: 497.67 KB. Expected delta: +1.5 KB (PLACE_FROM_FREE reducer + sync interpolation arg). Post: ≤499.5 KB.

**E2E:**
- `npx playwright test` — 6 active (1 skipped Sym E fixme). All should remain GREEN. Cross-color sever tests will need charge=1 setup not charge=0 (cycle test fixture).
- CI GREEN required at HEAD before /handoff.

**Manual (carry to user 2-peer smoke):**
- 1v1 cross-network: joiner LMB-drag spark out of zone → release at non-territory location → primitive forms at release point (NOT teleports from spawn). NO stuck-Carrying state.
- 1v1 cross-network: joiner LMB-drag spark INTO enemy territory → release → spark falls free, joiner stays Idle, NO Carrying state.
- 1v1 cross-network: each player makes 5 same-color bonds → earns 1 raid charge (dot fills). Severing 1 cross-color bond decrements 1 charge regardless of cycle status.

## ROLLBACK

- P1 atomic PLACE_FROM_FREE: revert the new action and reducer file; restore controls.ts onUp double-dispatch. Existing PICKUP_SPARK + PLACE_PRIMITIVE actions are byte-preserved (not deleted) so rollback is mechanical.
- P2 cycle charge: revert single condition flip in world.ts:386-388 + LOCKED_DECISIONS amendment.
- P3 duckMusic: revert audioManager.ts duckMusic body; no schema or wire impact.

## RISKS

1. **PLACE_FROM_FREE protocol fork**: introduces a new wire message. Old peers (pre-S52) will reject it via `parseNetMessage` (unknown action.type → null). Mitigation: same-deploy upgrade (both peers always upgrade together via deploy — same pattern as S22 protoVersion bump).
2. **AttractDrag visual freeze when local controls.state drifts from FSM**: if AttractDrag is locally tracked but the corresponding spark gets consumed by another player's intent first, the drag-locked id remains. Mitigation: existing `applyPerSubstep` already drops to Idle when spark missing or not Free; the lerp-skip is therefore self-correcting next frame.
3. **Cycle-sever amendment changes strategic balance**: defenders now lose investment when attackers chip cycle bonds for 1 charge each. Mitigation: user explicitly authorized; the change matches user's mental model "each raid point = break 1 connection". Codified in §13.11 amendment.
4. **duckMusic Web Audio scheduled restore — what happens on suspend/resume?**: Web Audio's `setTargetAtTime` is queued in the AudioContext clock. During suspend, the clock freezes; on resume, the queued automation continues from the suspend point in ctx-time. Net result: the music is correctly ducked + restored relative to ctx-time, not wall-time, eliminating the abrupt-restore bug. Council to verify the spec behavior is preserved here.

## DELIBERATION

Standard tier — MANDATORY 3-way Council per `~/.claude/CLAUDE.md` DELIBERATION protocol. Battle Ledger 6 rows + Δ rows. Council R1 dispatched in parallel after this PDR write. PRIME-AUDIT pass before user-go (gate auto-satisfied by user's upfront approval).

═══════════════════════════════════════════════════════════
