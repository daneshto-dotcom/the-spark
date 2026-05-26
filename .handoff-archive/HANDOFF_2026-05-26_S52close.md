═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — The Spark
Generated: 2026-05-26
Session: S52 autonomous overnight — joiner input asymmetry fix (atomic PLACE_FROM_FREE + dragLock interpolation) + raid charge cycle-no-consume amendment + duckMusic Web Audio scheduled restore
═══════════════════════════════════════════════════════════

## PROJECT
- Name: spark (Phase 1+2 prototype)
- Working directory: C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark
- Git branch: master (clean, pushed to origin)
- Latest commit: f4b516d [S52 CHECK-Triumvirate] placeFromFree defensive ordering — fallible ops first
- Tech stack: TypeScript 5.4 / Pixi.js 8.5 / Trystero/Nostr WebRTC v3 / vite 6.4.2 / vitest 3.2.4 / Playwright 1.60
- Codebase: ~14.5k LOC across ~102 source files (placeFromFree.ts NEW +210 LOC)

## CURRENT STATE
- Build: passing — `npm run build` → 499.60 KB main bundle (0.40 KB headroom under 500 KB charter)
- Tests: **815/815 unit GREEN** (+19 vs S51 close: +16 placeFromFree atomicity/reject/re-pick tests, +2 sync dragLock tests, +1 protocol v3+v2-reject test)
- TS: `tsc -b --noEmit` clean
- E2E: **SUCCESS at e529c4e (S52 P3)**; CI at HEAD f4b516d (comment-only diff atop e529c4e) was running at handoff time
- Deployment: https://spark-online.space/ — GH Pages Deploy SUCCESS for all 4 S52 commits
- Database: N/A (P2P only)

## SESSION COST
- Model: Opus 4.7 1M MAX (per memory `feedback_model_routing.md`)
- API spend: Grok ~$0.02 (4 calls — Council R1 + CHECK Triumvirate), Gemini ~$0.10 (4 calls — Council R1 + CHECK Triumvirate)
- Cumulative S52: ~$0.12
- Tool calls: ~110 (Read/Edit/Bash/MCP)
- Cumulative log: ~/.claude/usage-log.csv

## THIS SESSION'S WORK

**P1 — Atomic PLACE_FROM_FREE + dragLock interpolation** (commit `7c446a2`, defensive reorder `f4b516d`)

User-reported BLOCKER: joiner (P2) input asymmetry. Two compound bugs from the legacy LMB-up burst pattern:
- (a) PICKUP_SPARK + PLACE_PRIMITIVE dispatched as TWO intents. If PLACE rejected (spawner-zone / target-missing race / enemy-territory hard block — host saw `territoryBlock: 45` rejects from joiner intents in user's debug snapshot), the prior PICKUP had already mutated `player.kind='Carrying'` + `spark.state='Carried'` with no rollback → joiner stuck Carrying, perceived as "click and you're glued to the spark; RMB to release".
- (b) `sync.ts:interpolatePositions` unconditionally clobbered `spark.pos` every render frame from snapshot, fighting joiner's local `controls.stepAttractLerp` writes → spark "stays at spawn point and then teleports".

NEW `src/state/placeFromFree.ts` (210 LOC) — atomic reducer. Validation FIRST (placementPos shape, spark.state==='Free' race, player.kind==='Idle' race, remote-origin reach plausibility, spawner-zone, enemy-territory, target-existence+color-demotion OR host re-pick via pickHostTargetPrimitive IGNORING joiner's hint per Council C2 BLOCKER). Then ATOMIC commit (fallible-first ordering per CHECK Triumvirate defensive fix): fsmPickup Idle→Carrying, snap spark.pos to placementPos, spark.state=Carried, delegate to existing placePrimitive (which cannot reject — preconditions verified).

PROTOCOL_VERSION bumped 2→3 in `src/net/protocol.ts`. KNOWN_GAME_ACTION_TYPES_RECORD adds PLACE_FROM_FREE. Old peers fail HELLO at handshake (S22 P3 same-deploy pattern).

`src/input/controls.ts` onUp LMB branch: replaced PICKUP+PLACE 2-dispatch with single PLACE_FROM_FREE; sets `pendingPlaceFromFree { sparkId, sentAt }` 300ms TTL state on dispatch. NEW `getDragLockedSparkId()` returns active AttractDrag sparkId OR pendingPlaceFromFree-within-TTL OR null.

`src/net/sync.ts` `interpolatePositions(prev, curr, t, world, dragLockedSparkId?)` skips lerp for the locked spark. `src/main.ts` threads `controls.getDragLockedSparkId()` to `clientSync.interpolateInto`.

Tests: 16 new in `src/state/placeFromFree.test.ts` (happy anchor/bonded paths, all reject paths preserving rejectReasons buckets per Council C5, remote-origin host re-pick + stale-id ignored per Council C2, atomicity contract — territory/spawner-zone rejects do NOT leave joiner in Carrying); 2 new in `src/net/sync.test.ts` (locked spark not lerped, unlocked sparks still lerped); protocol.test.ts updated for v3 + v2-reject coverage.

**P2 — Raid charge cycle-no-consume amendment** (commit `20e0007`)

User-authorized LOCKED §13.11 PRIME-AUDIT B amendment. Verbatim ask "each raid point = break 1 connection no 5" inverts the cycle-no-consume exception (pre-S52: hostile sever where `split.del.size===0` cost 0 charges → S52: always 1 charge regardless of cycle). Self-sever (`computeBaseCharge=0` for same-color endpoints) is the only remaining 0-cost path.

`src/state/world.ts` SEVER_BOND case — removed ternary `chargeToConsume = split.del.size === 0 ? 0 : computeBaseCharge(...)` → direct `chargeToConsume = computeBaseCharge(...)`. `src/state/disruptionManager.ts` header + computeBaseCharge JSDoc updated. `LOCKED_DECISIONS.md` §13.11 PRIME-AUDIT B amended with S52 amendment block + historical text preserved (strikethrough-style pattern). `src/state/world.test.ts` cycle test assertion flipped 1→0; description renamed cycle-no-consume → cycle-consume.

Strategic-balance shift documented: attackers can no longer chip cycle bonds for free; defenders' triangulated cells now cost actual raid charges to penetrate.

Council C7 (Gemini #4 MED) audit confirmed: existing cycle test constructs a REAL geometric triangle (a-b-c-a with synthBond), not a mocked split. Satisfies Gemini's robust-topology requirement without rewrite.

**P3 — duckMusic Web Audio scheduled restore** (commit `e529c4e`)

S51 Gemini CHECK #1 carry-forward (MED). Pre-S52 `duckMusic` used `setTimeout(restoreFn, durationMs)` wall-clock scheduling; restoreFn read `audioContext.currentTime` at TIMEOUT-FIRE time. Tab-blur mid-duck → ctx.currentTime froze → setTimeout fired at wall-time → restore landed at stale ctx-time → abrupt volume cut on tab refocus.

`src/render/audioManager.ts` duckMusic: removed `duckTimeout` state + setTimeout closure (15 LOC). Added `musicGainNode.gain.setTargetAtTime(restoreTarget, newEnd, 0.150)` at SCHEDULE time. Web Audio automation queue is ctx-time relative — pauses with suspend, resumes naturally — duck persists through tab-blur and restores at originally-scheduled relative ctx-time without abrupt cuts. W3C Web Audio API §4.3.2 confirms (cited by Gemini AUDITOR #6 LOW). `_resetAudioForTest` clears `duckEndCtxTime` (was previously dangling).

**CHECK Triumvirate** (commit `f4b516d`)

CHECK Triumvirate (Grok-ANALYST + Gemini-AUDITOR + inline RALPH self-audit) found 1 CONVERGENT BLOCKER (Grok #1 + Gemini #1): placeFromFree.ts mutated spark.pos BEFORE the fallible fsmPickup+placePrimitive delegation. Unreachable in single-threaded JS post pre-validation, but theoretically valid for async refactors. Adopted defensive reorder: fsmPickup FIRST, then spark.pos mutations, then Map writes, then placePrimitive. Documented theoretical invariant for future async work.

3 HIGH/MED findings RESOLVED as false-positives (E2E brittleness — tests don't assert action-type counters, confirmed by E2E SUCCESS at e529c4e; cycle-charge non-RAID drift — computeBaseCharge returns 0 for non-player causes; duckMusic rapid-fire storm — cancelScheduledValues handles correctly).

2 LOW findings DEFERRED to S53 (PROTOCOL_VERSION mismatch UX gloss; dragLock TTL snapshot-driven clear).

## OPEN ISSUES

- **PROTOCOL_VERSION 2→3 UX gloss** (S52 CHECK Grok #4 + Gemini #2 HIGH, deferred S53): mid-deploy peer mismatch surfaces as generic "Connection lost" overlay; ~20 LOC to add explicit "Protocol mismatch — please refresh" diagnostic.
- **dragLock 300ms fixed TTL** (S52 CHECK Grok #7 LOW, deferred S53): slow networks (>300ms RTT) can blink. Snapshot-driven clear is more robust.
- **Atomic reducer theoretical invariant**: future async/concurrent reducer refactors MUST add try/catch rollback in placeFromFree.ts. Documented in code comments + reflexion #check-triumvirate-convergent-blocker.
- **RMB ConnectDrag entry path now unreachable**: post-S52 P1 atomic LMB-up, no public path enters Carrying state. RMB ConnectDrag code is dead (was bug-mitigation for the legacy stuck-Carrying). S53 cleanup OR repurpose for a primary "precise placement" workflow.

## BLOCKED ON

- **USER 2-peer cross-network smoke** on https://spark-online.space/?debug=1 — verifies S52 P1 fixes in real Chrome. 5-10 min with friend across networks.

## NEXT STEPS

**Immediate:**
1. Verify CI at HEAD f4b516d GREEN (`gh run list --limit 1`)
2. USER 2-peer smoke — joiner LMB-drag (no stuck Carrying), drag visual smooth, territory rejects fall-free, cycle-bond severs consume 1 raid charge, tab-blur audio restore smooth

**Short-term:**
3. Phase-2 next mechanic — D Inject Spiral / E Steal / A Fog / G Mega-combos / Anvil
4. PROTOCOL_VERSION mismatch UX gloss (~20 LOC)
5. dragLock TTL snapshot-driven clear (~30 LOC)

**Medium-term:**
6. Dead-code cleanup: RMB ConnectDrag unreachable path
7. Host-side visibility of joiner drag — ATTRACT_DRAG_POS wire message at 10Hz
8. `__TEST_RNG_SEED__` seam (S51 Council Δ1)
9. vitest 4.x bump (S50 carry)

**Long-term:**
10. Phase-3 net (Colyseus / Geckos.io) for >2-player scalability

## CHANGED FILES (S52 full session diff)
 .claude/plans-archive/                                NEW 2026-05-26_PDR_S52_*.md (mv from plans/)
 .claude/session-state.json                            S51→S52 entries + all 4 priorities completed
 LOCKED_DECISIONS.md                                   §13.11 PRIME-AUDIT B amended
 boot-snapshot.md                                      regenerated for S52
 reflexion_log.md                                      S52 block prepended (7 entries) + S42 pruned (6 entries)
 src/input/controls.ts                                 +45 -55 LOC (LMB single-dispatch + pendingPlaceFromFree + getDragLockedSparkId)
 src/main.ts                                           +15 -5 LOC (dragLock thread)
 src/net/protocol.ts                                   +17 -5 LOC (PROTOCOL_VERSION 2→3 + PLACE_FROM_FREE allowlist)
 src/net/protocol.test.ts                              +17 -3 LOC (v3 + v2-reject + msg updates)
 src/net/sync.ts                                       +27 -3 LOC (dragLockedSparkId opt-out)
 src/net/sync.test.ts                                  +113 LOC (2 dragLock tests)
 src/render/audioManager.ts                            +40 -19 LOC (Web Audio scheduled restore)
 src/state/disruptionManager.ts                        +5 -5 LOC (computeBaseCharge JSDoc)
 src/state/placeFromFree.ts                            NEW 224 LOC (atomic reducer)
 src/state/placeFromFree.test.ts                       NEW 332 LOC (16 tests)
 src/state/world.ts                                    +20 -3 LOC (PLACE_FROM_FREE dispatch + cycle ternary removed)
 src/state/world.test.ts                               +6 -3 LOC (cycle test flip)

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: 4/4 complete | Standard tier | GREEN
P0 State discovery + Council R1 + PRIME-AUDIT — completed — Micro — ec00f3b
P1 Atomic PLACE_FROM_FREE + dragLock — completed — Standard — 7c446a2 (+ defensive reorder f4b516d)
P2 Raid charge cycle-no-consume amendment — completed — Standard — 20e0007
P3 duckMusic Web Audio scheduled restore — completed — Micro — e529c4e

## REFLEXION ENTRIES (this session)
- S52 #atomic-place-from-free-vs-two-action-burst-fixes-stuck-carrying
- S52 #dragLock-skips-snapshot-interpolation-for-local-cursor-spark-fixes-jitter
- S52 #pendingPlaceFromFree-300ms-TTL-closes-1-frame-blink
- S52 #protocol-version-bump-fails-closed-via-HELLO-mismatch
- S52 #cycle-no-consume-removal-strategic-balance-amendment
- S52 #duck-music-webaudio-setTargetAtTime-survives-suspend
- S52 #check-triumvirate-convergent-blocker-on-atomicity-defensive-reorder
- SESSION #s52-shipped-3-priorities-4-commits-815-of-815-green-deploy-success-e2e-success

## CARRY-FORWARD PRIORITIES
None from S52 (all 4 priorities completed in-session). S49+S50+S51 carry-forwards (USER 2-peer smoke + Phase-2 mechanic + vitest 4.x + Sym E + 48k Opus + __TEST_RNG_SEED__) remain.

═══════════════════════════════════════════════════════════
