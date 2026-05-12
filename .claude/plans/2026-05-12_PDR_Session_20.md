# SPARK — PDR Session 20 (Batch — P0 + P1 + P3)

**Created:** 2026-05-12 (post-S19 close, brother-waiting urgent batch)
**Branch:** master | **Base commit:** `3ae2717` (S19 close + autocommit)
**Tier:** Standard (batch — highest tier across priorities)
**Approval:** User-explicit `go` at 2026-05-12 ~18:55 UTC (batch approved P0 + P1 + P3)
**Deliberation:** Council R1 per priority (3-way Council + PRIME-AUDIT) — Rule 17
**Token budget estimate:** 66-93K total; ≤13% of 1M Opus 4.7 context

---

## OBJECTIVE (session-level)

Three priorities, executed sequentially, each with its own commit + push + completion protocol:

1. **P0 — 1v1 CONNECT BLOCKER** (Standard, FORCED-URGENT) — resolve OR self-diagnose the indefinite-Connecting symptom that S19 P4 relay-pin did NOT fix. A.0 of Trystero 0.24 types found three concrete API-surface gaps (missing `onJoinError` callback, missing `rtcConfig`, type-lie cast). Ship all three fixes + diagnostic instrumentation in one deploy so a user retest is either GREEN (resolved) or YELLOW with logs naming the next layer.
2. **P1 — world.ts → worldFsm extraction** (Standard, anti-bloat §XV) — honor S19 SESSION reflexion (`#refactor-before-feature-S14-lesson-replayed`); world.ts 311 LOC → ~281 (≤280 charter) by moving game-state FSM transition cases into pure helpers.
3. **P3 — bondVisualRenderer.ts magic-silhouette extraction** (Standard, anti-bloat §XV) — 536 LOC → ~450 by splitting 12 magic silhouettes into per-shape files under `src/render/effects/silhouettes/`, shared helpers in `silhouettes/shared.ts`.

P2 (P9 OGG compression) was DEFERRED to S21 in the recommendation — requires ffmpeg availability check first; if budget allows after P3 completes GREEN we may revisit.

---

## A.0 STATE-DISCOVERY GATE (Rule 21) — consolidated table

| Priority | Claim probed | Verifier | Actual | Drift / Action |
|---|---|---|---|---|
| **P0** | Trystero 0.24 `Room.makeAction` signature | `node_modules/@trystero-p2p/core/dist/types.d.mts:59` | 3-tuple `[ActionSender, ActionReceiver, ActionProgress]`; sender → `Promise<void[]>` | ⚠ wrapper lies 2-tuple sync void; FIX in P0 SCOPE |
| **P0** | `joinRoom` callbacks | `types.d.mts:22-26, 123` | 3rd arg `JoinRoomCallbacks { onJoinError?, onPeerHandshake?, handshakeTimeoutMs? }` | ⚠ wrapper passes ZERO callbacks; FIX in P0 SCOPE |
| **P0** | `JoinRoomConfig` ICE/TURN support | `types.d.mts:40-53` | `rtcConfig: RTCConfiguration` + `turnConfig: TurnServerConfig[]` accepted | ⚠ neither passed; FIX in P0 SCOPE (rtcConfig with STUN+TURN) |
| **P0** | Trystero installed version | `node_modules/trystero/package.json:3` | `0.24.0` | ✓ matches LOCKED §13.1 v4 |
| **P1** | world.ts current LOC | `wc -l src/state/world.ts` | 311 (11% over 280 charter) | ✓ matches handoff; P2 S19 reduced from 359 |
| **P1** | FSM transition cases | `grep` for `case 'START_GAME'\|'END_TURN'\|'RETURN_TO_TITLE'` in world.ts | All at lines 288-297 | ✓ extractable boundary clear |
| **P3** | bondVisualRenderer current LOC | `wc -l` | 536 (7% over 500 charter) | ✓ S19 P3 introduced bloat |
| **P3** | Silhouette count | grep magic kind handlers in bondVisualRenderer | 12 magic silhouettes | ✓ matches handoff |
| **P-defer** | lobbyScreen.ts LOC | `wc -l` | 551 (10% over 500) | ✓ pre-existing; in P0 blast radius; defer to S21 |

**A.0 conclusion:** Zero state-vs-claim DELTA after probes. Scope is right-sized on actual API surface, not speculation.

---

## P0 — 1v1 CONNECT BLOCKER

### Tier · Standard · Council R1 · LOCKED §13.1 v5 amendment

### SCOPE

1. **`src/net/transport.ts`** — wire all three Trystero 0.24 affordances:
   - Add `onError: (msg: string) => void` constructor option + `private errorHandler` field
   - In `connect(roomCode)`, call `joinRoom(config, roomCode, callbacks)` with 3rd arg:
     - `onJoinError(details)`: log + invoke `this.errorHandler(`signaling: ${details.error}`)`
     - `onPeerHandshake(peerId, send, receive, isInitiator)`: `console.info('[net] handshake', ...)`
     - `handshakeTimeoutMs: 30000` (explicit)
   - In `JoinRoomConfig`, add `rtcConfig: { iceServers: [ ...stun + ...turn ] }`:
     - STUN: `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`
     - TURN: `turn:openrelay.metered.ca:80` + `turn:openrelay.metered.ca:443?transport=tcp` (creds: `openrelayproject:openrelayproject`)
   - Replace unknown-cast at `transport.ts:84-86` with proper typed `Room.makeAction<JsonValue>('msg')`; destructure 3-tuple `[sendFn, recvFn, _progress]` (intentional throwaway).
   - Wrap `sendFn(msg)` in `.catch((err) => console.error('[net] send failed', err))` to surface unhandled-promise rejections.
   - Add diagnostic `[net]`-tagged logging at every layer transition: connect-entry (roomCode, appId, relay-count), `onPeerJoin/Leave`, periodic `room.getPeers()` ICE state poll (1Hz while `peerSet.size === 0`, max 30s, log `iceConnectionState` + `connectionState` per peer, stop on any peer 'connected').

2. **`src/main.ts`** — plumb `NetTransport.onError` → `lobbyScreen.setErrorMessage`:
   - In `onHostStart` + `onJoinAttempt`, after `new NetTransport()`, set `netTransport.onError = (msg) => lobbyScreen.setErrorMessage(msg)`.

3. **`src/render/lobbyScreen.ts`** — add `setErrorMessage(text: string)` method:
   - Sets `statusText.text = text`, sets `statusText.style.fill = 0xff3b6b` (red).
   - Reset color to `0xaaaaaa` (gray) on `reset()`.

4. **`LOCKED_DECISIONS.md` §13.1 v5 amendment** — codify:
   - The `joinRoom` 3rd-arg `onJoinError` + `onPeerHandshake` + `handshakeTimeoutMs: 30000` wiring is REQUIRED.
   - The `rtcConfig.iceServers` shape (STUN + free TURN) with provider replacement protocol.
   - The `[net]` diagnostic-logging tap-points must remain (do not strip as noise).
   - The `makeAction<JsonValue>('msg')` typed call (drop the unknown cast).

### COUNCIL R1 (1 round)
- **DISRUPTOR (Grok):** challenge TURN choice, retry policy, diagnostic spam in production, blast-radius on existing 1v1 happy path.
- **AUDITOR (Gemini):** correctness review of callback shape vs 0.24 types; alternative API call sites; missing edge cases.
- **SUPERVISOR (Claude):** synthesize, adopt high-value items, reject NITs with rationale, produce final spec.
- **PRIME-AUDIT** delta after synthesis per Rule 20.

### TESTING
- `npx vitest run` → 377/377 hold (gate)
- `npx tsc -b --noEmit` → exit 0 (this PDR FIXES type lie — should improve)
- `npm run build` → bundle delta ≤+2 KB
- **Production retest** (user + brother, F12 Console open):
  - **GREEN:** peer connects, "Begin Match" appears → done
  - **YELLOW:** still stuck; console names layer (e.g. `iceConnectionState: 'failed'` or `onJoinError: 'handshake-timeout'`) → evidence-gated S20 P0.1 amendment
  - **RED:** still stuck AND no console output → wrapper bug → ralph-debug:HUNT

### RISK
- `openrelay.metered.ca` is third-party free TURN; rate-limit fallback exists in STUN path. If down, observability still works.
- Adding TURN may add ~5-20 ms relay latency in worst case; acceptable trade vs. "cannot connect at all".

### FILES TOUCHED (≤4)
- `src/net/transport.ts` (+40-60 LOC: callbacks + rtcConfig + diagnostics + type fix; 124 → ~180 LOC, under 280)
- `src/main.ts` (+5 LOC: onError wiring)
- `src/render/lobbyScreen.ts` (+8 LOC: setErrorMessage method)
- `LOCKED_DECISIONS.md` (§13.1 v5 amendment block)

### TOKEN BUDGET — 26-34K

---

## P1 — world.ts → worldFsm extraction

### Tier · Standard · Council R1 · §XV ledger update

### SCOPE
- NEW `src/state/worldFsm.ts` (~70 LOC): pure helpers for game-state FSM transitions.
  - `applyStartGame(world, action)`: TITLE/LOBBY → PLAYING; init currentPlayerId, gameMode, isHost.
  - `applyEndTurn(world)`: in 1v1, toggle currentPlayerId 0↔1; no-op solo.
  - `applyReturnToTitle(world)`: PLAYING/WIN → TITLE; reset currentPlayerId; preserve persistent state where appropriate.
  - `applyWinTrigger(world)`: PLAYING → WIN (if not already).
  - All helpers return void; mutate `world` in place (matches existing reducer pattern).
- `src/state/world.ts` cases 288-297 collapsed to single-line dispatches: `case 'START_GAME': applyStartGame(world, action); return;`
- Net LOC: world.ts 311 → ~281 (≤280 base charter); worldFsm.ts NEW ~70 (well under 280).
- NEW `src/state/worldFsm.test.ts`: per-helper purity tests (~6 cases).

### COUNCIL R1 (1 round)
Critical challenges to surface:
- (a) `currentPlayerId` reset semantics on END_TURN — preserved or zeroed?
- (b) Lobby-flag (`isHost`) reset on RETURN_TO_TITLE — what's the contract?
- (c) Test fixture `gameState='PLAYING'` at create() — preserved as-is or via helper?
- (d) Effect emission on transitions — does any FSM transition currently emit effects we'd be reordering?
- (e) Network-replay safety — if HostSync sends a snapshot mid-transition, does the client apply order match host order?

### TESTING
- `npx vitest run` → 377+6 new = 383 green (gate)
- `npx tsc` exit 0
- `npm run build` success; bundle delta ≤+0.5 KB
- All existing transition tests (START_GAME from TITLE, END_TURN in 1v1, RETURN_TO_TITLE from PLAYING, WIN_TRIGGER) cover behavior; extraction is pure rename/move — must pass unchanged.

### FILES TOUCHED (≤4)
- `src/state/worldFsm.ts` (NEW ~70 LOC)
- `src/state/world.ts` (-30 LOC: 311 → ~281)
- `src/state/worldFsm.test.ts` (NEW ~80 LOC)
- `LOCKED_DECISIONS.md` (§XV ledger row: world.ts 311 → ~281, removed from violations list)

### TOKEN BUDGET — 18-26K

---

## P3 — bondVisualRenderer.ts magic-silhouette extraction

### Tier · Standard · Council R1 · §XV ledger update

### SCOPE
- NEW `src/render/effects/silhouettes/` directory.
- 12 per-shape files (one fn per file): `filament.ts`, `star.ts`, `vortex.ts`, `wheel.ts`, `bracket.ts`, `diamond.ts`, `lattice.ts`, `capsule.ts`, `orbital.ts`, `warped.ts`, `whip.ts`, `cable.ts` (count + names verified at start of P3 via A.0 sub-probe of current `bondVisualRenderer.ts`).
- Each exports `drawXxxSilhouette(g: Graphics, p: SilhouetteParams): void`.
- NEW `src/render/effects/silhouettes/shared.ts`: exports `midColor`, `strokeAxisLerp`, `strokePathLerp` (currently private in bondVisualRenderer.ts).
- `bondVisualRenderer.ts` becomes a router: shrinks 536 → ~450 LOC. Replaces 12 inline functions with imports + a `switch(kind)` dispatch.

### COUNCIL R1 (1 round)
Critical challenges:
- (a) Shared helper exposure surface — `midColor`, `strokeAxisLerp`, `strokePathLerp` become public; verify no leak of unstable internals.
- (b) Test-import-path stability — existing `bondVisualRenderer.test.ts` imports the renderer; if it directly tests helpers, those test imports must update.
- (c) Tree-shaking — 12 separate files now imported eagerly; verify Vite bundle doesn't bloat (acceptable: total LOC stays roughly equal across the new files).
- (d) Per-shape param shape — is `SilhouetteParams` uniform across all 12, or does each need a sub-type?
- (e) Backward-compat — existing render call sites must not change.

### TESTING
- `npx vitest run` → 377+ (existing 7 gradient tests cover math; extraction passes them or it's wrong).
- `npx tsc` exit 0.
- `npm run build` → main bundle ≈394 KB (allow ±2 KB).
- Visual: `preview_start` + `preview_screenshot` on a 1v1 cross-player bond → magic silhouettes render identically to pre-extraction.

### FILES TOUCHED (≥13 — refactor)
- `src/render/effects/silhouettes/shared.ts` (NEW)
- 12 × `src/render/effects/silhouettes/<kind>.ts` (NEW; ~30-50 LOC each)
- `src/render/bondVisualRenderer.ts` (-86 LOC: 536 → ~450)
- `src/render/bondVisualRenderer.test.ts` (import-path adjustments)
- `LOCKED_DECISIONS.md` (§XV ledger row update)

### TOKEN BUDGET — 18-25K

---

## SESSION-LEVEL COMPLETION PROTOCOL (per priority, in order)

1. Git commit + push (`S20 PN (tier): <one-line summary>` + signed footer)
2. Update `.claude/session-state.json`:
   - Priority entry: `status: completed`, `check_completed: true`, `check_method: <verbose>`, `real_context_tokens_at_close` (via `python ~/.claude/scripts/real-context-tokens.py --format=json`), `checkpoint_commit: <git SHA>`
3. Pro-active INTEGRITY-WARNING: write checkpoint_commit BEFORE `[CHECKPOINT]` hook can fire reactively
4. Announce: `[ZERO] Priority N complete. Context: T,TTT / 1,000,000 (PP.P% LEVEL). API: Grok N calls ($X.XX), Gemini N calls ($X.XX).`
5. Reflexion entry to `reflexion_log.md` (per-priority lesson)
6. Next priority OR `/handoff` recommendation if budget tight (>50% real-context)

---

## DELIBERATION ARTIFACTS (per priority)

Each priority's Council R1 produces:
- Battle Ledger (Grok challenges + Gemini findings + Claude adopt/reject decisions)
- PRIME-AUDIT delta (Rule 20)
- Pre-execution synthesis spec (what was adopted vs. rejected, with rationale)

Logged inline in `check_method` of session-state.json + summarized in reflexion_log.md.

---

## SESSION-LEVEL RISKS

- **P0 unresolved despite diagnostic ship:** then S20 P0.1 amendment is evidence-gated; we know exactly which layer (signaling vs. ICE/TURN vs. handshake) from console output.
- **Anti-bloat extraction breaks an obscure test:** Council R1 + tsc + vitest cover. If it does, revert + log lesson.
- **Real-context creeps into YELLOW (>50%) mid-session:** orange threshold at 75%, force /handoff at 90%. Currently at 11.36% — should land near 25-35% at S20 close.

---

## END-OF-SESSION

After P3 (or whichever priority closes the session): run `/handoff` skill. Auto-generates HANDOFF_2026-05-12.md with S20 → S21 transition + carry-forward priorities.

═══════════════════════════════════════════════════════════
