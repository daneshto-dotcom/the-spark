# S39 — Batch PDR: 1v1 BUG-A (peer lobby-stuck) + BUG-B (cursor↔spark visual desync)

**Tier:** Micro batch (~8K total tokens, 2 priorities). Council opt-in waived on user `go`.
**Trigger:** Live 1v1 playtest report. Two distinct user-facing bugs both blocking 2-peer smoke.
**Author:** Claude (ZERO) | **Approver:** Daniel | **Created:** 2026-05-23

---

## State-Discovery Gate (Rule 21 A.0)

| Claim | Verifier | Result |
|---|---|---|
| `parseNetMessage` is wired at transport.ts:164 | Read transport.ts:142-174 | ✓ confirmed (Pass-1 fix d3f0e22b, S38) |
| `parseNetMessage` requires strict `schemaVersion === 1` | Read protocol.ts:178-179 | ✓ confirmed (Pass-2 fix d4541985, S38) |
| Host `snapshot()` emits `schemaVersion: 1` | Read save.ts:251 | ✓ confirmed |
| `applyNetSnapshot` writes `world.gameState = snap.gameState` | Read save.ts:352 | ✓ confirmed |
| Client interpolateInto gate `!world.isHost && clientSync !== null && gameMode='1v1'` | Read main.ts:795 | ✓ confirmed |
| Lobby visibility gate `world.gameState === 'LOBBY'` | Read main.ts:818-820 | ✓ confirmed |
| Self-avatar renders at `controls.cursor` (local, no wire) | Read avatarRenderer.ts:78 | ✓ confirmed |
| AttractDrag spark lerps toward cursor + is clamped by `enforceSpawnerBounds` | Read controls.ts:163 + main.ts:958 | ✓ confirmed |
| S35 P0 fix at main.ts:795-796 still in place | Read main.ts:795 | ✓ confirmed |
| `cruiser` ≡ mouse cursor (user terminology) | User clarification | ✓ confirmed |

No state-vs-claim DELTAs surface.

---

## P1 — BUG-A: Peer stuck on "Waiting for host to begin" after host starts

### OBJECTIVE
After host clicks Begin Match, peer's lobby must transition to gameplay within ≤2s (≤20 snapshot windows). Currently peer's `world.gameState` stays at `'LOBBY'` indefinitely.

### SCOPE
The snapshot delivery chain has multiple silent-drop points introduced by S38 audit fixes. Even after diagnosis, the dependency on snapshot bandwidth for lobby exit is fragile. This priority adds a **dedicated lobby-exit wire signal** and **visible-to-user diagnostics** so future regressions surface in seconds, not require live re-testing.

**Files touched** (≤7):
1. `src/net/protocol.ts` — add new `StartGameMsg` envelope to `NetMessage` union + `parseNetMessage` case + `KNOWN_GAME_ACTION_TYPES_RECORD` (no-op for it since not a GameAction)
2. `src/main.ts` — host: emit `StartGameMsg` on `onBeginMatch` BEFORE first snapshot. Peer: handle `StartGameMsg` → dispatch local `START_GAME` action (covers snapshot-late case).
3. `src/render/lobbyScreen.ts` — add diagnostic line (visible while joining, only when peerCount>0): `"Sync: <N> snapshots, <M> drops, gs=<gameState>"`. Renders in small grey text below the "Waiting for host" status.
4. `src/net/transport.ts` — increment `rejectCount` on parseNetMessage null + expose accessor `getDiagnostics()` returning `{ accepted, rejected, lastSeq, lastKind }`.
5. `src/net/sync.ts` — increment `applyErrorCount` in the catch block + expose via `getDiagnostics()`.
6. `src/net/protocol.test.ts` — add 2 tests: `StartGameMsg` accept + reject-malformed.
7. `src/net/sync.test.ts` — add 1 test: peer receiving `StartGameMsg` dispatches local START_GAME before any snapshot arrives (end-to-end with a mock transport).

### TESTING (Karpathy K4 success criteria — concrete + falsifiable)
- 745+3 = 748 tests passing locally (`npm test`)
- Lobby UI shows "Sync: 0 snapshots, 0 drops, gs=LOBBY" pre-START_GAME, transitions to "Sync: N>0, ..., gs=PLAYING" within ≤2s of host clicking Begin
- New `StartGameMsg` accepted by parseNetMessage; malformed shape rejected
- Direct `StartGameMsg` path on the peer fires before any NETSNAPSHOT — covered by unit test that fires StartGameMsg WITHOUT broadcasting any NETSNAPSHOT, asserts peer's `world.gameState === 'PLAYING'`
- Bundle size: ≤500 KB app code (current 472.47 KB, expected +1-2 KB)

### RUNTIME-VERIFIABILITY (Rule 22)
This is a runtime-only failure — unit tests passed S38 audit but wire-roundtrip failed live. Tests added MUST exercise the full path through `JSON.stringify → parseNetMessage → handler-list → dispatch` to mirror the live wire (not just direct method calls). The new sync.test will explicitly JSON-roundtrip the `StartGameMsg` so any future serialization regression is caught.

### ROLLBACK
Single commit. `git revert <sha>` removes both the `StartGameMsg` path and the diagnostics. Lobby falls back to snapshot-only transition (pre-fix S39 behavior).

---

## P2 — BUG-B: Mouse cursor and avatar (player's spark) misaligned at play-area edges

### OBJECTIVE
Player's self-avatar (the colored glow) must visually coincide with the OS cursor at all positions on the playable canvas, including edges. Currently the gap grows as cursor approaches edges.

### SCOPE
Confirm root cause via dev preview (host + dummy second peer in same browser via two iframes, OR observe in 1v1 lobby alone), then apply targeted fix.

**Candidate root causes (ranked by likelihood):**

| # | Hypothesis | Investigation | Fix if confirmed |
|---|---|---|---|
| 1 | `updateCursor()` math drifts when CSS aspect ≠ `CANVAS_WIDTH:CANVAS_HEIGHT` (e.g. browser at 16:10 vs canvas 16:9). The non-uniform `sx/sy` is mathematically correct for letterbox cases but breaks under transform: scale or padding | Log `rect.width / CANVAS_WIDTH` vs `rect.height / CANVAS_HEIGHT` at runtime, inspect canvas CSS. | Force `object-fit: contain` on canvas + uniform scale (use min of sx, sy) + center offset |
| 2 | Avatar renderer uses unscaled cursor while Pixi stage uses a transform | Read renderer mount + check `app.stage.scale/x/y` | Apply same transform to cursor before rendering |
| 3 | AttractDrag spark visibly lags due to `enforceSpawnerBounds` clamp at boundary while cursor continues — user reading this as "avatar lags" | Walk through code paths during AttractDrag at edge | Render a visible attraction-link from cursor to clamped spark so the player understands the clamp; OR clamp the **rendered cursor visual** to spawner disk (avatar visually stops at boundary too) |
| 4 | 1v1-specific: client's local cursor is fine but snapshot-applied player.avatarPos is wire-lagged AND something renders at avatarPos instead of cursor | Grep for any avatar-position render path that uses player.avatarPos | If found: switch to controls.cursor for own-player; keep player.avatarPos only for OTHER players' avatars |

**Files touched** (≤3, depends on confirmed hypothesis): likely `src/render/avatarRenderer.ts` + `src/input/controls.ts`. Possibly `src/main.ts` or CSS.

### TESTING
- Visual reproduction in dev preview: launch with `preview_start`, move cursor to all 4 corners and play-area edges, confirm avatar glow center-aligned with cursor at every position
- Screenshot proof at corners via `preview_screenshot`
- Test for the pure-function fix (if `updateCursor` math changes): assert `(cursor.x, cursor.y)` correctly maps `(rect.right - 1, rect.bottom - 1)` to `(CANVAS_WIDTH - 1, CANVAS_HEIGHT - 1)` under various aspect ratios
- 745+ tests still passing

### RUNTIME-VERIFIABILITY (Rule 22)
Verification MUST be done with `preview_start` + `preview_screenshot` — static parse cannot detect visual misalignment. End-of-session audit re-checks corner screenshots.

### ROLLBACK
Single commit. `git revert <sha>`.

---

## END-OF-SESSION AUDIT (Rule 22)
After both fixes commit:
1. Re-read commit diffs for: unrendered `${VAR}` placeholders, references to non-existent files, mock-vs-runtime drift
2. `gh run list --limit 3` — confirm deploy succeeded after BUG-A push
3. `preview_screenshot` at canvas corners for BUG-B visual confirmation
4. Bundle size guard via `npm run build`

---

## DELIBERATION (Micro tier)
Opt-in deliberation auto-waived per CLAUDE.md when `priority_state:approved` + `unlock_source:user`. User-explicit `go` permits same-turn flag-write + execution per S35 reflexion #4.

## NOT IN SCOPE
- Refactoring main.ts (handoff carry-forward — own session)
- vite/vitest CVE bump (handoff carry-forward — own session)
- S37 P8 FWOOSH SFX, P9 crystal-crown sprite
- Continue-UI product decision
- Audit Pass 3
- Force-rerun stuck deploy `26221358046` (separate one-line user action if needed)
