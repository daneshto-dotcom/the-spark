# SPARK Session 15 — PDR (Full Tier, APPROVED)

**Date**: 2026-05-12
**Branch**: master @ 8daafc6 (S14 closeout) → S15 commits
**Status**: APPROVED via user "approved!" → gate fields written to session-state.json
**Tier**: Full (Council R1+R2 closed; PRIME-AUDIT delta applied)
**Council**: R1+R2 parallel (Grok grok-4.20-0309-reasoning + Gemini gemini-2.5-pro). Both R1 = REVISE; R2 converged on Trystero/Nostr + Claude's S15 MVP cut + linear lerp interpolation + sequence numbers. Host-migration split: Gemini won ("Connection lost" overlay v1), Grok carries to S16 if playtest shows annoyance.
**Prior PDR archived**: `.claude/plans-archive/2026-05-12_PDR_Session_14_COMPLETED.md`

---

## CONTEXT

User-driven scope shift across session:
1. Original PDR (Council R1 deliberated): Hotseat + Fog of war Tier-0 (~450 LOC).
2. User amendment 1 (after S14 playtest "looks a lot better"): drop fog; add start screen + lobby; same-machine hotseat.
3. **User amendment 2 (current)**: "not same machine hotseat because my friend is in a different country" — networking required. User explicitly authorized breaking LOCKED § 1 ("Phase-3 net: Colyseus or Geckos.io later") for Phase-2 friends-only play.

---

## P1 — CHARTER EXTRACTION (Micro, mechanical)

**OBJECTIVE**: Close S14 § XV PRIME-AUDIT carry-forward. Extract `pickRedundantBondTargets` + `angularDistance` from `src/input/controls.ts` (565 LOC, 13% over soft charter) to new `src/input/redundantBondTargets.ts`. controls.ts → ~480 LOC.

**SCOPE**:
- New file `src/input/redundantBondTargets.ts` (~125 LOC): exports `angularDistance` + `pickRedundantBondTargets`, types from `../types.ts`.
- `src/input/controls.ts`: remove the two function blocks (lines 449-534); add single import line; wrapper `redundantBondTargetsInSameComponent` (lines 386-404) unchanged — already calls `pickRedundantBondTargets`.
- `src/game/session14.test.ts` (line 30-32 import): change source from `../input/controls.ts` to `../input/redundantBondTargets.ts`.

**APPROACH**: Same pattern as S14 P2.0 (world.ts → placePrimitive.ts). Zero behavior change.

**TESTING**: `npx vitest run` → 252/252 regression. No new tests.

**RISKS**: Negligible.

**BUDGET**: ~5K formula tokens.

**SUCCESS**: controls.ts ≤ 480 LOC; redundantBondTargets.ts ≤ 150 LOC; 252/252 pass; typecheck clean.

---

## P2 — NETWORKED 1v1 MVP (Standard core within Full batch, ~490 LOC)

**OBJECTIVE**: End-to-end playable 1v1 multiplayer for two friends in different countries. Title screen + lobby with 6-char room codes + host-authoritative 10Hz NetSnapshot sync + linear-lerp interpolation. Solo mode preserved exactly.

**SCOPE**:

### Dependency
- `npm install trystero@^0.20` (~40KB minified bundle add). Import path: `trystero/nostr` (Nostr-primary strategy per PRIME-AUDIT #1; BitTorrent default rejected per Grok R1 concrete failure mode).

### `src/net/transport.ts` (~80 LOC, ceiling ≤120)
- Trystero adapter wrapping `joinRoom`. Exposes: `host(roomCode: string)`, `join(roomCode: string)`, `send(msg: NetMessage)`, `on(handler: (msg) => void)`, `peers: () => Set<PeerId>`, `disconnect()`.
- Auto-fallback config on Trystero strategies.

### `src/net/protocol.ts` (~65 LOC, ceiling ≤90)
- Typed envelopes (discriminated unions):
  - `Hello { kind: 'HELLO', playerId: PlayerId, color: number, snapshotSeq: number }`
  - `Intent { kind: 'INTENT', intentSeq: number, payload: ControlIntent }` where ControlIntent = pointerdown/move/up coords + button + tick
  - `NetSnapshot { kind: 'NETSNAPSHOT', snapshotSeq: number, tick: number, primitives, bonds, freeSparks, players, scoreProgress, currentPlayerId, gameMode }`
  - `EndGame { kind: 'ENDGAME', winnerId: PlayerId }`
- **Per-direction sequence counters** (PRIME-AUDIT #2): `snapshotSeq` (host→client), `intentSeq` (client→host).
- NetSnapshot is a STRIPPED projection of WorldSnapshot — drops `effects` (visual only, derivable), `nextPrimitiveId/nextBondId/nextSparkId` (host-only authority), UI state, predicted positions. Retains entity state + scores + turn + seq + tick.

### `src/net/sync.ts` (~95 LOC, ceiling ≤120)
- Host loop emits `NetSnapshot` at `NET_SNAPSHOT_HZ=10` (every 6 ticks @ 60Hz physics).
- Client `applyNetSnapshot(snap)`: validates `snap.snapshotSeq > lastAppliedSeq`; if out-of-order, reject. Otherwise dispatches `APPLY_AUTHORITATIVE` to update world from snapshot.
- Client maintains `prevSnapshot` and `currentSnapshot`; render-time linear-lerp for primitive/spark positions over the 100ms gap.
- Intent send: on local input → wrap as `Intent` → `transport.send()`.

### `src/render/titleScreen.ts` (~60 LOC, ceiling ≤80)
- Pixi container with "SPARK" title text + two buttons "1 Player" / "1v1 (2 Player)".
- Click "1 Player" → dispatch `START_GAME({ mode: 'solo' })`.
- Click "1v1" → transition to LOBBY state.

### `src/render/lobbyScreen.ts` (~110 LOC, ceiling ≤150)
- Host path: generates 6-char alphanumeric room code (Trystero room id), displays large, "Copy" button (via `navigator.clipboard.writeText`), "Waiting for Player 2..." spinner. On joiner connect: "Player 2 connected. Begin Match" button → dispatches `START_GAME({ mode: '1v1' })`.
- Join path: text input for code → "Connect" button → "Connecting..." spinner → on success becomes client, waits for host to begin → on failure shows error message.
- Connection-lost UI overlay (per Council R2 — Gemini host-migration stance): full-screen "Connection lost — Return to Title" button. Visible whenever gameState is PLAYING and `transport.peers().size === 0`.
- "Back to Title" cancel button.

### `src/state/gameState.ts` (~30 LOC modified)
- FSM extension: `TITLE` (entry) → solo path: `PLAYING` → `WIN` → `POSTGAME` → `TITLE`; 1v1 path: `LOBBY` → `PLAYING` → `WIN` → `POSTGAME` → `TITLE`.
- `RETURN_TO_TITLE` action clears scoreProgress (PRIME-AUDIT #6).

### `src/state/world.ts` (+40 LOC, ceiling ≤280)
- `currentPlayerId: PlayerId` (defaults to playerId 0 for backwards compat; in 1v1 mode flips on END_TURN).
- `scoreProgress: Map<PlayerId, number>` (was scalar — read sites updated).
- `isHost: boolean` (set on enter PLAYING; informs dispatch behavior).
- `gameMode: 'solo' | '1v1'` (set on START_GAME).
- New actions: `START_GAME { mode }`, `END_TURN`, `APPLY_AUTHORITATIVE { snapshot }`, `RETURN_TO_TITLE`.
- Init P2 (playerId 1, color = palette[1] `0x3bd7ff` cyan/blue) when entering 1v1 mode.

### `src/game/player.ts` (+10 LOC)
- `Player` interface gains `avatarPos: Vec2` (Grok R1 BLOCKER #2 carry-forward).
- Init P1 at spawner-rim left, P2 at spawner-rim right (when initialized).

### `src/input/controls.ts` (+30 LOC, post-P1 ≤480 LOC)
- Dispatch on behalf of `currentPlayerId` (not hardcoded P1).
- If `isHost` → local dispatch direct; else → send Intent via transport.
- Space key handler → `END_TURN` (only in 1v1 mode; FSM-Idle guard rejects during AttractDrag/ConnectDrag; auto-releases carried spark on accept).
- Avatar pulse color uses active player's color.

### `src/state/save.ts` (+10 LOC)
- Snapshot includes `gameMode`, `currentPlayerId`, `scoreProgress` map.
- Pre-S15 saves break (no migration shim) — communicate to playtester.

### `src/main.ts` (+20 LOC)
- Render dispatch by gameState: TITLE → titleScreen; LOBBY → lobbyScreen; PLAYING → existing world renderers; WIN/POSTGAME → existing.
- Wire net transport on LOBBY entry; wire host sync loop on 1v1 PLAYING entry.

### `src/render/ui.ts` (+20 LOC)
- Turn indicator badge (1v1 only) with active player color + "Press SPACE to end turn" hint.
- Per-player score readout (1v1 only).
- Connection status dot (1v1 only): green = peers connected, red = disconnected.

### `src/constants.ts` (+8 LOC)
- `NET_SNAPSHOT_HZ = 10`
- `NET_ROOM_CODE_LENGTH = 6`
- `NET_CONNECTION_TIMEOUT_MS = 30000`
- `NET_INTERPOLATION_MS = 100`

### Tests (~25 tests, ~50 LOC) in new `src/net/protocol.test.ts` + `src/net/sync.test.ts` + augment to `src/game/session15.test.ts`
- Protocol roundtrip: Hello/Intent/NetSnapshot/EndGame envelope serialize→deserialize identity.
- Per-direction seq counters increment correctly.
- NetSnapshot wire fields: stripped fields not present; retained fields roundtrip.
- Lerp math: lerp between snapshot[t-1] and snapshot[t] linear; clamp at boundaries; identity on equal snapshots.
- Out-of-order snapshot rejection by seq check.
- FSM transitions: TITLE→PLAYING solo; TITLE→LOBBY→PLAYING 1v1; PLAYING→WIN→POSTGAME→TITLE (scoreProgress cleared).
- Hotseat-on-host: inactive player intent rejected; END_TURN flips currentPlayerId; END_TURN during AttractDrag auto-releases.
- Lobby: 6-char room code generated; invalid code join shows error; both connected → Begin Match enabled.

### Trip-wires (stop + split to S16 if hit)
- controls.ts post-P2 > 600 LOC.
- world.ts > 280 LOC.
- P2 net + integration LOC > 600 mid-implementation.
- Trystero integration > 160 LOC (transport+protocol combined).

**APPROACH**:
- Solo path = identical to post-S14 (no net code reached; mode flag gates).
- Host runs full Verlet sim authoritatively; broadcasts NetSnapshot @ 10Hz.
- Client renders interpolated state; local cursor + AttractDrag rendered immediately (no prediction MVP); commits visible ~RTT/2 lag (S16 prediction).
- Reducer auth gate (defense-in-depth): `if (action.playerId !== world.currentPlayerId) return state`.
- Trystero/Nostr signaling avoids BitTorrent rate-limit concern (Grok R1) while keeping zero-infra (Gemini R1).

**ALTERNATIVES REJECTED**:
- PeerJS — Council R2 closed; Trystero's multi-strategy fallback resolves Grok's tracker concern; PeerJS single-broker SPOF.
- Colyseus — ~900 LOC + Node.js server deploy + ops; violates "fastest-to-playable."
- Geckos.io — UDP-via-WebRTC needs server deploy.
- Lockstep deterministic — Verlet float-accumulation risk (LOCKED § 4).
- Higher snapshot rate (20Hz) — bandwidth 2× for marginal gain w/o delta encoding.
- Mandatory host-migration stub — deferred to S16 if playtest shows annoyance (Council R2 split).
- Client-side AttractDrag prediction + reconciliation — S16 (Grok R1 ask + Gemini "future phase").

**RISKS**:
- Trystero Nostr relay throttling under >8 concurrent long sessions (Grok R2 residual) — friends-only ≤2 rooms expected.
- AttractDrag client latency (~RTT/2 sluggish) — known v1 limit per LOCKED § 11.
- NAT traversal failures (Gemini R2 residual): some residential networks may fail P2P; Trystero TURN fallback ~82% (Grok R2 data). Failure → "Connection lost" overlay.
- Bandwidth ceiling: 10Hz × 5-15KB = 50-150KB/s; well within broadband upstream.
- Floating-point divergence S16+ (Gemini R2 residual) — out-of-scope v1.
- Save format incompat — pre-S15 breaks, no migration shim.
- Tab-hidden host pause (Pixi animation pauses → sim freezes → client sees stale snapshots) — known limitation in § 11.

**BUDGET**: ~30K formula tokens (~70K UI per S35 calibration).

**SUCCESS**:
- `npx vitest run` → 277/277 (252 prior + 25 new).
- `npx tsc -b --noEmit` exit 0.
- transport.ts ≤120 LOC; protocol.ts ≤80 LOC; sync.ts ≤120 LOC; lobbyScreen.ts ≤150 LOC; titleScreen.ts ≤80 LOC; world.ts ≤280 LOC; controls.ts ≤480 LOC.
- Bundle size delta ≈ +40KB; documented in LOCKED § 11.
- **Playtest gate** (manual): two browser tabs or two devices on different networks → host opens "1v1" → generates code → joiner enters code → connection ≤30s → both see same world → P1 places primitive → P2 sees it ~200ms → P2 hits Space → END_TURN → P2 places → P1 sees → loop until score 50 → WIN → POSTGAME → return to TITLE clears scoreProgress.

---

## P3 — CLOSEOUT + SPEC AMENDMENTS

**OBJECTIVE**: Clean session close per CLAUDE.md COMPLETION PROTOCOL + Council-mandated LOCKED amendments.

**SCOPE**:
- Per-priority commits + push.
- **LOCKED_DECISIONS.md amendments**:
  - § 1 v2: "Phase-2 1v1 networked play implemented via Trystero (WebRTC + Nostr signaling, ~40KB bundle). Phase-3 reserved for Colyseus/Geckos.io scalable multi-player infrastructure."
  - § 7: module-map adds `src/net/`; WorldSnapshot note "Basis for NetSnapshot wire variant per § 11."
  - § 10.3: add `net/transport.ts` as second dispatch seam (host validates client intents); reference Council R1+R2 disposition.
  - **New § 11 Networked Play v1**: Trystero/Nostr transport, host-authoritative, 10Hz NetSnapshot, lerp interpolation, 6-char room codes, "Connection lost" UI overlay (no migration v1), known limits (AttractDrag client latency, tab-hidden host pause, NAT failures, save format break, no reconnect).
- session-state.json final updates per priority (status, check_completed, check_method verbose, checkpoint_commit SHA).
- reflexion_log.md: +5 S15 entries; prune ≤50 cap.
- boot-snapshot.md regen.
- PDR archive: this file → `.claude/plans-archive/2026-05-12_PDR_Session_15_COMPLETED.md`.
- BACKLOG.md S15 entry inserted above S14.
- HANDOFF_2026-05-12.md replace + archive copy to `.handoff-archive/HANDOFF_2026-05-12_S15.md`.

**BUDGET**: ~5K formula tokens.

---

## BATTLE LEDGER (R1+R2 condensed, 12+ decisions)

### Council R1 (both REVISE)
| # | Topic | Grok DISRUPTOR | Gemini AUDITOR | Resolution |
|---|---|---|---|---|
| 1 | Library | PeerJS (Trystero trackers fail at 10Hz) | Trystero (zero infra) | **R2 deferred** |
| 2 | Authority | Host-auth correct, needs seq + rollback | Host-auth correct | Adopt — seq numbers added |
| 3 | Sync rate | 10Hz blind apply unsafe; need lerp + seq | 10Hz lerp sufficient v1 | Adopt — lerp + seq |
| 4 | Scope | ~850 LOC realistic (vs ~550); SPLIT | ~550 plausible but aggressive; SPLIT | Adopt — Claude MVP cut ~490 |
| 5 | NetSnapshot | Strip visionMaskFor + caches | Audit WorldSnapshot for wire | Adopt — explicit NetSnapshot type |
| 6 | Host migration | Mandatory one-line stub | Future phase | **R2 deferred** |
| 7 | Security | Input sanitization on host | Implied via host-auth | Adopt — reducer rejects |
| 8 | Spec amendments | § 1 + § 7 + § 10 + § 11 + B.3→B.4 | § 1 text + § 11 + § 7 note | Adopt — full list |

### Council R2 (closing round)
| # | Topic | Grok R2 | Gemini R2 | Final |
|---|---|---|---|---|
| 1 | Library final | **Conceded Trystero** (Nostr fallback negates rate-limit; PeerJS broker-only-for-signaling distinction accepted) | **Trystero** (held) | **Trystero/Nostr primary** |
| 2 | Host migration final | Mandatory stub (30% disconnect on 120ms RTT long sessions) | "Connection lost" UI overlay v1 | **Gemini wins — UI overlay**; stub → S16 if playtest annoys |
| 3 | Seq + lerp | Non-negotiable | Non-negotiable | Adopted in S15 MVP |
| 4 | S15 MVP cut | Accept with tightened sub-budgets | Accept | Adopted Claude's cut |
| 5 | NetSnapshot fields | Strip vision/UI/caches/accumulators/predicted; retain entities/scores/turn/seqNum/tick | Strip vision/UI; retain primitives/bonds/scores/currentPlayerId/seqNum/tick | Merged consolidated retain-list |

### PRIME-AUDIT delta (6 leak-throughs caught)
1. Trystero strategy default BitTorrent → switch to `trystero/nostr` import.
2. Per-direction sequence numbers (host→client SnapshotSeq + client→host IntentSeq), not single shared.
3. package.json + bundle size note (Trystero ~40KB).
4. net/ directory in LOCKED § 7 module-map.
5. AttractDrag client latency caveat (~RTT/2) documented in § 11.
6. scoreProgress reset on RETURN_TO_TITLE.

---

## BUDGET & TRIP-WIRES (batch)

- Total: ~40K formula (~92K UI per S35 2.3× calibration). Within Full tier capacity (UI < 100K threshold).
- LOC delta: +~490 added; -120 moved.
- Tests delta: +25 (252→277).
- New deps: 1 (trystero ^0.20).
- New files: 6 (redundantBondTargets.ts, transport.ts, protocol.ts, sync.ts, titleScreen.ts, lobbyScreen.ts).
- Edited files: 8.
- Doc edits: LOCKED §1, §7, §10.3, new §11.

Trip-wires (split to S16):
- controls.ts > 600 LOC
- world.ts > 280 LOC
- P2 LOC > 600 mid-implementation
- Trystero transport+protocol > 160 LOC combined

---

## APPROVAL GATE

**Approved by**: user "approved! be most technical, pedantic, logical and thorough!" (2026-05-12).
**Path**: A (FINAL, ship as written) — full revised batch.
**Gate flags written**: pdr_approved=true, deliberation_completed=true, unlock_source=user (top-level AND per-priority in session-state.json).
