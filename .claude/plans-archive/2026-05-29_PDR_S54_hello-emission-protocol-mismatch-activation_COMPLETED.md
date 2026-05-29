# PDR — S54: HELLO Emission at Peer-Join (activate dormant S53 P1 protocol-mismatch system)

**Date:** 2026-05-29 | **Session:** S54 | **Tier:** Standard (3-way Council, 1 round, Battle Ledger)
**Status:** COMPLETED — both priorities shipped (P1 `bb40c90`, P2 `f7fc208`), 842/842 unit GREEN, bundle 498.87 KB, E2E GREEN (Sym F flake confirmed via re-run), CHECK Triumvirate SHIP (all 4 Grok findings refuted). User pre-approved full batch autonomously.

---

## 1. OBJECTIVE
Activate the protocol-mismatch UX + per-peer ban latch shipped (correct + 13 unit tests) but **dormant** in S53 P1, by wiring the missing producer call site: emit a `HELLO` envelope at peer-join time on **both** host and joiner. Today NO production code calls `send({kind:'HELLO'})` (verified S54 A.0: only INTENT/NETSNAPSHOT/ENDGAME/START_GAME_SIGNAL/GODLY_TRIGGER are sent) — so `detectProtocolMismatch` + `onProtocolMismatch` + `protocolMismatchPeers` never fire. This PDR makes the S53 P1 infrastructure user-visible. Bundled: the 3 LOW CHECK-CARRY-S54 cleanups (G3/M4/M5) that live in the same two functions.

## 2. SCOPE

**P1 — HELLO emission at peer-join (CORE).**
- NEW pure helper `buildHello(playerId, color): HelloMsg` in `src/net/protocol.ts` (S10 #test-via-pure-helper-export pattern — the only unit-testable seam, since no handler test files exist).
- `src/net/hostHandlers.ts` `createHostStartHandler`: after `transport.connect(code)`, register `transport.onPeerChange((_peerId, kind) => { if (kind === 'join') transport.send(buildHello(asPlayerId(0), PLAYER_COLORS[0])); })`.
- `src/net/clientHandlers.ts` `createJoinAttemptHandler`: symmetric — `onPeerChange` → on `'join'` → `send(buildHello(asPlayerId(1), PLAYER_COLORS[1]))`.
- `onPeerChange` is currently **unused API** (main.ts polls `peerCount()` each frame for the connection-lost overlay) → registering it here is conflict-free.

**P2 — CHECK-CARRY-S54 LOW cluster (POLISH, same two functions).**
- **G3**: in `formatProtocolMismatchMessage`, guard the verbatim `String(peerVersion)` interpolation so a non-primitive `peerVersion` renders cleanly (avoid `v[object Object]`).
- **M4**: replace `parsed as Record<string, unknown>` cast in `detectProtocolMismatch` with a small `isHelloShaped`/object type-guard.
- **M5**: revise `"Your friend's version is older"` → neutral `"The other player's version is older"` (matchmaking-future-proof). **← Council decision point: ship now vs YAGNI-defer (no matchmaking on roadmap; "friend" is the game's intentional positioning).**

**OUT OF SCOPE (deferred, logged):**
- Full 2-bundle Playwright E2E (v2-tab + v3-tab) — high-effort, separate session; unit + integration coverage suffices for activation.
- M3 controls.test.ts foundation suite — unrelated, large; separate.

## 3. APPROACH / DESIGN

**Why send-on-join, not send-on-connect:** `transport.send()` broadcasts to all *currently connected* peers ([transport.ts:511](../../src/net/transport.ts)). At `connect()` time peerCount=0 → a HELLO would be dropped ("send dropped — no strategy ready yet"). `onPeerChange('join')` fires once per peerId (deduped across strategies, [transport.ts:382-394](../../src/net/transport.ts)) when the data channel is open → send reaches the peer.

**Symmetric handshake:** both sides receive their own `onPeerJoin` → both emit HELLO → each side checks the other's `protoVersion` at its receive boundary (`detectProtocolMismatch` runs BEFORE `parseNetMessage`, [transport.ts:361](../../src/net/transport.ts)). Required for either-side-older detection.

**Same-version is a no-op:** matching HELLO → `{mismatch:false}` → parsed → routed to handlers that ignore `kind:'HELLO'` (host handles only INTENT; client handles NETSNAPSHOT/GODLY_TRIGGER/START_GAME_SIGNAL/ENDGAME). Zero behavioral change on the happy path; only `diagnostics.accepted` ticks up.

**Mismatch path (the activation):** old peer's HELLO carries protoVersion≠3 → `emitProtocolMismatch` fires `onProtocolMismatch` (→ `formatProtocolMismatchMessage` → lobby error text) + latches peerId → all subsequent messages from that peer dropped. Idempotent per peerId across the multi-strategy fan-out.

## 4. RISKS
- **R1 (primary): send-on-join data-channel readiness race.** A HELLO emitted inside the `onPeerJoin` tick could theoretically race the channel-open on a given strategy. Mitigant: Trystero fires `onPeerJoin` when the data channel is established; START_GAME_SIGNAL already sends successfully post-join via the same path. Validation: integration test + the overdue USER 2-peer smoke. ← Council scrutiny requested.
- **R2: multi-strategy duplicate HELLO.** `send()` broadcasts on every active strategy; receiver processes each delivery. Harmless for same-version (idempotent ignore); for mismatch the latch is idempotent. Accepted.
- **R3: HELLO playerId/color drift from authoritative assignment.** Currently informational only (no receiver reads them). Using `PLAYER_COLORS[0/1]` + `asPlayerId(0/1)` matches `gameMode.ts` host/joiner assignment. Low.
- **R4: M5 regression of intentional tone.** "Friend" is the game's positioning; neutral text is colder. Reversible 1-liner. Council to weigh ship-now vs defer.

## 5. TESTING
- Unit (`protocol.test.ts`): `buildHello` returns `{kind:'HELLO', playerId, color, protoVersion:3}` for host (0/crimson) + joiner (1/cyan); output passes `parseNetMessage` round-trip (proves the emitted envelope is wire-valid).
- Unit (`transport.test.ts`): G3 — `formatProtocolMismatchMessage` with object/array/null peerVersion renders no `[object Object]`; M4 — `detectProtocolMismatch` type-guard still returns correct `{mismatch}` for all existing 13 cases (no regression).
- Integration (new minimal `hostHandlers.test.ts` OR extend transport.test.ts with a fake transport): assert `onPeerChange('join')` triggers exactly one `send` whose payload is a HELLO; assert no send on `'leave'`.
- Full suite: 828 → ~838+ GREEN. `tsc -b --noEmit` clean. `npm run build` ≤ 500 KB (expect ≈ +0.2 KB).
- CI: E2E (2-browser harness) must stay GREEN at HEAD (watch the known Sym F flake — rerun if it trips).

## 6. ROLLBACK
Single-commit-per-priority. Revert P1 = drop the two `onPeerChange` registrations + `buildHello` → system returns to dormant (pre-S54) state, fully safe. P2 reverts independently (pure text/type changes).

## 7. ESTIMATE
~15-25K tokens. +40-65 LOC (P1 ~30-45, P2 ~10-20). Bundle +≈0.2 KB. 2 commits (P1, P2) + closeout.

## 8. DELIBERATION TARGETS (for Council)
1. Is `onPeerChange('join')` the correct + race-safe emission point, or is a different hook / explicit readiness guard warranted (R1)?
2. Should both sides emit, or is host-only sufficient? (PDR position: both, for either-side-older detection.)
3. M5: ship neutral language now or YAGNI-defer until matchmaking exists?
4. Does `buildHello` belong in protocol.ts (envelope home) or a handler-shared module?
5. Any wire/desync hazard from same-version HELLO now flowing through `messageHandlers` (currently ignored — confirm no handler has a fall-through that could mis-route it)?
