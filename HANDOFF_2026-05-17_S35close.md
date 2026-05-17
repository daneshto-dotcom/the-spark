═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-05-17
Session: S35 — 1v1 join bootstrap deadlock fix (single-priority Micro PDR)
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (real-time geometric puzzle game)
- Working directory: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
- Git branch: master (clean, in sync with origin)
- Latest commit: `7879223` [S35 P0 close] State + reflexion (autocommit `58961bf` on top)
- Tech stack: TypeScript, Pixi.js v8, Vite, Vitest, Trystero/Nostr (P2P 1v1)
- Codebase: ~125 source files, 627 tests, 468.15 KB bundle

## CURRENT STATE
- Build: passing (`tsc -b --noEmit` clean, `vite build` 4.5s, 468.15 KB / 500 KB cap; 31.85 KB headroom)
- Tests: 627/627 passing (was 625; +2 in sync.test.ts new describe block)
- Deployment: https://spark-online.space/ HTTP 200 ✓ (GH Pages, auto-deploy on push)
- Context at close: ~212K / 1M (21.3% GREEN — Opus 4.7 1M)

## SESSION COST
- Single-priority Micro PDR. No Council R1 (auto-waived on user `approved` per CLAUDE.md Rule 17).
- API: Grok 0 calls ($0.00) + Gemini 0 calls ($0.00). All work in-session Opus.
- Cumulative log: ~/.claude/usage-log.csv

## THIS SESSION'S WORK
**S35 P0 (Micro) — 1v1 join bootstrap deadlock fix.** User reported at boot: joining player enters code, host clicks Begin Match, host transitions to PLAYING but joiner stays in lobby forever. Investigation found bootstrap-gate Catch-22 in main.ts: render-loop client-interpolation gate at [main.ts:765](src/main.ts:765) requires `gameMode === '1v1'` to call `clientSync.interpolateInto` (the only path that runs `applyNetSnapshot`), but `applyNetSnapshot` is what would SET `gameMode = '1v1'` from the host's snapshot. Joiner's gameMode stayed at the [world.ts:267](src/state/world.ts:267) `makeWorld` default `'solo'` forever → NETSNAPSHOTs received but never applied.

**Fix (1 LOC + 14-line JSDoc):** at [main.ts:onJoinAttempt](src/main.ts:284), after `world.isHost = false;`, add `world.gameMode = '1v1';`. Symmetric to host's setup pattern (host gets gameMode='1v1' via local `applyStartGame` reducer in `onBeginMatch`). `RETURN_TO_TITLE` resets gameMode='solo' so back-out remains clean.

**PRIME-AUDIT pedantic pass:** swept all 11 `gameMode === '1v1'` reference sites repo-wide for misfire risk in post-fix interim state (gameMode='1v1' + gameState='LOBBY' on joiner). **Zero misfires found** — 10 of 11 sites additionally gate on `gameState==='PLAYING'` OR are host-only/unreachable from joiner-LOBBY path. Only [main.ts:201](src/main.ts:201) dispatchFn intent-wrap activates earlier (benign — controls in LOBBY don't fire gameplay actions).

**Git blame insight:** gate at main.ts:765 introduced in commit `add497f` (S15 P2 — 1v1 MVP). **Bug has existed ~20 sessions.** Explains recurring "1v1 brother retest pending" carry items across S31/S32/S33/S34 — cross-network 2-peer playtest was IMPOSSIBLE because joiner never left LOBBY.

**Tests added:** 2 in `sync.test.ts` new describe block `'S35 P0 — joiner bootstrap (1v1 join deadlock regression)'` — (a) positive end-to-end using real `applyStartGame` on hostWorld + `HostSync.buildSnapshotMessage` + `clientSync.receive` + `interpolateInto`, asserts post-apply `gameState='PLAYING'` AND `gameMode='1v1'` AND both players seated; (b) pre-fix repro semantics test documenting that without interpolateInto running, world stays in LOBBY/solo.

## OPEN ISSUES
- **2-peer manual smoke pending (user gate).** Trystero/Nostr P2P requires separate browser instances; cannot self-verify in single-session preview. User must open `https://spark-online.space/` on 2 devices with hard refresh.
- **CF-1 (Micro, S35 follow-up):** [main.ts:201](src/main.ts:201) dispatchFn gate doesn't include `gameState==='PLAYING'`. Post-S35-P0-fix, joiner's UPDATE_AVATAR_POS / etc. in LOBBY wrap as INTENT and ship over network. Benign (host applies as no-op) but noisy.
- **CF-2 (Micro, S35 follow-up):** [transport.ts:144](src/net/transport.ts:144) wire deserialize uses `JSON.parse(data) as NetMessage` directly without invoking [protocol.ts:99](src/net/protocol.ts:99) `parseNetMessage` validator. Try/catch saves crashes; admits malformed kinds.

## BLOCKED ON
**User 2-peer manual smoke.** Next priority queued behind this gate.

## NEXT STEPS (priority order)
1. **Immediate:** User runs 2-peer playtest, reports back. If failing, paste F12 `[net]` logs from BOTH peers.
2. **Short-term (post-smoke):** Anvil creature (voltkin-config.ts base ready; see LOCKED §13.15 + open FSM-design Q).
3. **Short-term:** 1v1 brother retest of S31 P0-3 (NetSnapshot effects mirror) + S33 P1-11 (creatureId additivity) — NOW reachable thanks to S35 P0 fix.
4. **Micro queue:** CF-1 (dispatcher gate tighten) + CF-2 (parseNetMessage wire integration).
5. **Medium-term:** Bond UX RMB-drag multi-target (S23 P2 carry), P5 next mechanic.
6. **Long-term:** P3 NET enhancements (client prediction, delta snapshots, host migration, live cursors); P9 OGG compression.

## CHANGED FILES (this session)
```
 .claude/session-state.json | 318 +-- (S34 multi-priority state → S35 single-priority)
 reflexion_log.md           |  12 + (5 new entries; S28 block pruned — net 47/50 cap)
 src/main.ts                |  13 + (1 LOC fix + 14-line JSDoc at onJoinAttempt)
 src/net/sync.test.ts       |  90 + (2 new tests in new describe block)
 boot-snapshot.md           |  -- (regenerated for S36 boot)
 4 files changed, 136 insertions(+), 297 deletions(-)
```

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: 1/1 complete | ~5K/1M (GREEN)
- P0 (Micro) 1v1 join bootstrap deadlock fix — completed — ~5K — commit `1be5fce`

## REFLEXION ENTRIES (this session)
- S35-P0 #integration-blind-spot-since-S15-because-unit-tests-bypass-main-ts-inline-gates
- S35-P0 #asymmetric-host-joiner-setup-needs-symmetry-check-on-every-1v1-relevant-world-field
- S35-P0 #prime-audit-all-gates-sweep-before-state-mutation-in-entry-point-handler
- S35-P0 #bootstrap-gate-catch-22-pattern-codified
- S35-P0 #user-driven-playtest-as-final-validation-gate-when-unit-tests-cannot-reach-the-failure-site

## CARRY-FORWARD PRIORITIES
1. **User 2-peer manual smoke** — gate, not a priority. Blocks announcement of next priority.
2. **Anvil creature** — PDR not drafted. voltkin-config.ts base ready (S34 P2-20). Open design Q: FSM reuse vs new CHARGING state.
3. **CF-1: main.ts:201 dispatchFn gate tighten** — Micro, ~1 LOC, PDR not drafted.
4. **CF-2: parseNetMessage wire integration** — Micro, ~3 LOC, PDR not drafted.

## SCOPE-DRIFT DETECTION (Step 2.9)
10 scope-related entries in reflexion (threshold = 2). However, manual inspection reveals these are SUCCESSFUL drift-PREVENTION lessons (PRIME-AUDIT rejecting scope-expanding Council suggestions, A.0 catching backlog scope-deltas, etc.) — not drift INCIDENTS. Existing rules (Rule 16 SCOPE AMENDMENT, Rule 20 PRIME-AUDIT, Rule 21 A.0 STATE-DISCOVERY) already cover the pattern. **No new rule proposed.**

═══════════════════════════════════════════════════════════
