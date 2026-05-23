═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK (S39 close: 1v1 BUG-A + BUG-B fixes)
Generated: 2026-05-23
Session: S39 — Live 1v1 regression fix (peer lobby-stuck + cursor↔avatar drift)
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (Phase 2, real-time multiplayer geometric-emergence game)
- Working directory: C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark
- Git branch: master (clean, synced with origin/master at `9d2e600`)
- Latest commit: `9d2e600` [S39 close] reflexion +6 entries + archive S39 PDR as COMPLETED
- S39 fix commit: `f8d237a` [S39] BUG-A: StartGameSignal wire envelope; BUG-B: letterbox-aware cursor mapping
- Tech stack: TypeScript 5.4, Vite 5.2, Pixi.js 8.5, Trystero 0.24 (Nostr P2P), Vitest 1.5

## CURRENT STATE
- Build: passing (tsc clean; vite build → 474.26 KB app code / 25.7 KB headroom on 500 KB cap)
- Tests: **759/759 green** (+14 from S38: +3 protocol, +3 sync, +8 lobbyScreen — letterbox + cssToCanvasCoords + roundtrip + zero-input)
- Deployment: GH Pages → spark-online.space. Deploy `26331426232` PENDING at handoff (auto-cancellation race when close push landed; user may `gh run rerun 26331426232` if stays stuck >10 min)
- Context at close: **346,837 tokens / 1,000,000 (34.68% GREEN)**

## SESSION COST
- Model: Opus 4.7 1M throughout (per memory rule — router advisories ignored)
- Tier: Micro batch (opt-in deliberation waived on user `go`); ~0 deliberation API calls

## THIS SESSION'S WORK

**Phase 1 — State-Discovery Gate (Rule 21)**: empirically verified 10 wire-protocol + render-layer claims before locking PDR. No state-vs-claim DELTA. Confirmed: parseNetMessage wired at transport.ts:164, strict schemaVersion at protocol.ts:178-179, applyNetSnapshot throws on save.ts:344, lobby visibility gate at main.ts:818-820, avatar renders at controls.cursor (local), AttractDrag clamp via enforceSpawnerBounds, S35 P0 fix still in place. Identified BUG-A symptom matches regression of S35 P0 caused by S38 audit's 3 silent-drop additions to snapshot apply chain. Confirmed via user clarification that "cruiser" = mouse cursor.

**Phase 2 — Batch PDR (Micro tier)**: drafted `.claude/plans/2026-05-23_PDR_Session_39_1v1_BugFixes.md`, presented for user `go`. Both bugs in 1v1 critical path, discovered simultaneously, scoped as atomic batch.

**Phase 3 — Execution**

BUG-A (peer stuck on "Waiting for host to begin"):
- `src/net/protocol.ts`: new `StartGameMsg` envelope (`kind: 'START_GAME_SIGNAL', mode: '1v1'`) added to NetMessage union + parseNetMessage case (fail-closed on unknown mode)
- `src/main.ts`: host broadcasts START_GAME_SIGNAL BEFORE local START_GAME dispatch in `onBeginMatch`. Peer's `netTransport.on` handler dispatches local START_GAME on receipt — idempotent via `gameState === 'LOBBY'` guard (added during end-of-session audit per Rule 22 to defend against late/duplicate signals clobbering currentPlayerId / pendingCreatureSpawn)
- `src/net/transport.ts`: new `NetDiagnostics` counters (accepted, rejected, lastSeq, lastKind) + `getDiagnostics()` accessor, incremented in recvFn + reset on disconnect
- `src/net/sync.ts`: new `applyErrorCount` counter in ClientSync + `applyErrors()` accessor, incremented in catch block of `interpolateInto`
- `src/render/lobbyScreen.ts`: new `diagnosticsText` Pixi Text element below statusText + `updateDiagnostics(text)` method. Empty text hides; non-empty shows
- `src/main.ts`: render loop calls `lobbyScreen.updateDiagnostics()` every frame when `!world.isHost && peerCount > 0`, format `sync N/T seq=K kind=X applyErr=J gs=LOBBY` — surfaces all 3 S38 silent-drop modes without `?debug=1`
- Tests +6: `protocol.test.ts` +3 (StartGameSignal accept / reject malformed / JSON roundtrip); `sync.test.ts` +3 (direct lobby-exit signal, signal+snapshot idempotent, applyErrors counter on throw)

BUG-B (cursor↔avatar drift at viewport edges):
- Root cause: `updateCursor` used non-uniform `sx = CANVAS_W/rect.width`, `sy = CANVAS_H/rect.height`. Canvas is `object-fit: contain` (Pixi default) — at any viewport aspect ≠ canvas aspect, content is letterboxed inside CSS box. Formula was correct ONLY at matched aspect; at non-matched aspects cursor mapping diverged from visible canvas content by up to letterbox-bar size. Bug invisible at visual center, max ±72 CSS-px at visible canvas edges (empirically verified at 1280×900 viewport via preview_eval)
- `src/render/lobbyScreen.ts`: new shared pure helpers `cssToCanvasCoords(rect, canvasW, canvasH, cssX, cssY)` and `fitCanvasIntoRect(boxW, boxH, canvasW, canvasH)` returning `{ fittedW, fittedH, offsetX, offsetY, scale }`. `mapCanvasRectToPage` rewritten to use letterbox-aware math too (same root issue, latent in HTML input positioning — would have surfaced on non-16:9)
- `src/input/controls.ts`: `updateCursor` now uses `cssToCanvasCoords` helper. Old non-uniform formula deleted
- Tests +8: `lobbyScreen.test.ts` updated existing letterboxed test to assert correct math + 7 new cssToCanvasCoords cases (identity, matched-aspect, letterboxed-taller, letterboxed-wider, roundtrip-under-3-aspects, rect-offset, degenerate-input). Empirical live verification at 1280×900: drift went from {-90, -72, -54, 0, +50, +72, +90} CSS-px (pre-fix) → 0 CSS-px (post-fix) across the CSS-y range

**Phase 4 — End-of-Session Audit (Rule 22)**: re-scanned commit diffs. No unrendered placeholders, no dangling file refs, no mock-vs-runtime drift, no hallucinated flags. Caught 1 defensive improvement (added `world.gameState === 'LOBBY'` guard to START_GAME_SIGNAL handler — late/duplicate signals can't clobber post-snapshot state). Build clean (474.26 KB +1.79 vs S38). gh run list confirmed S39 deploy run kicked off.

## OPEN ISSUES
- Deploy run `26331426232` PENDING at handoff (auto-cancellation race when `[S39 close]` push pruned the in-flight `[S39]` BUG-A deploy run after 21m42s). User can `gh run rerun 26331426232` if it stays stuck >10 min
- 2-peer 1v1 smoke STILL PENDING (gated since S35 P0). Now covers 6 sessions' worth of fixes if user can find 2-peer time

## BLOCKED ON
- User: 2-peer 1v1 manual smoke + production playtest at https://spark-online.space/?debug=1
- External: GH Actions deploy queue occasionally stalls; manual `gh run rerun` may be needed

## NEXT STEPS (priority order)
1. **Verify deploy + user playtest** — once `gh run view 26331426232` shows `success`, hard-refresh https://spark-online.space/?debug=1 + confirm new lobby diagnostic strip appears below "Waiting for host..." when peer is connected. If peer joins + host clicks Begin, peer should transition to PLAYING within ≤1 RTT (~200ms)
2. **2-peer 1v1 smoke** — covers S35 deadlock + S36 animation + S37 audio + S37 wire-parity + S38 audit hardening + S39 lobby-exit + S39 cursor alignment in one session
3. **vite/vitest major bump** dedicated session — closes 2 moderate dev-server CVEs; semVerMajor → own session
4. **main.ts hypertrophy refactor** — extract netMessageRouter / godlyMatcher / cinematicStateMachine / teardownNet (multi-priority Standard batch)
5. S37 carry: P8 FWOOSH SFX, P9 crystal-crown sprite, S38 stretch polish
6. S38 carry: per-symbol triage of 42 knip-unused exports, Continue-UI product decision

## CHANGED FILES (S38close..HEAD)
```
.claude/plans-archive/2026-05-23_PDR_Session_39_1v1_BugFixes_COMPLETED.md  +111
.claude/session-state.json                          1 line
reflexion_log.md                                    +S39 6 entries / -S31 6 entries (50 cap)
src/input/controls.ts                               +24 / -13
src/main.ts                                         +37 / -4
src/net/protocol.test.ts                            +20 / -0
src/net/protocol.ts                                 +30 / -2
src/net/sync.test.ts                                +124 / -0
src/net/sync.ts                                     +9 / -0
src/net/transport.ts                                +36 / -0
src/render/lobbyScreen.test.ts                      +112 / -8
src/render/lobbyScreen.ts                           +129 / -1
```
Total: 12 files, +646/-28 across c9db329..9d2e600 (2 commits f8d237a + 9d2e600)

## REFLEXION ENTRIES (this session — full text in reflexion_log.md)
- S39 #runtime-only-bug-needs-runtime-verification-not-just-unit-tests
- S39 #dedicated-control-signals-decouple-state-transitions-from-snapshot-reliability
- S39 #visible-to-user-diagnostics-over-debug-flag-required
- S39 #object-fit-contain-letterbox-coordinate-mapping-trap
- S39 #wire-protocol-handler-idempotence-via-state-gate
- SESSION #s39-bugfix-batch-stats

## CARRY-FORWARD PRIORITIES
None — both S39 batch priorities COMPLETED. Pending work documented in NEXT STEPS + Pending Backlog (boot-snapshot.md) is from earlier sessions (S35 P11 smoke, S37 carry, S38 carry, vite CVE bump, main.ts refactor).

═══════════════════════════════════════════════════════════
