# Council R1 Battle Ledger — S20 P0 (1v1 CONNECT BLOCKER)
**Date:** 2026-05-12
**Tier:** Standard
**Models:** Grok-4-1-fast-non-reasoning (DISRUPTOR) + Gemini-2.5-pro (AUDITOR) + Claude Opus 4.7 1M (SUPERVISOR)
**Round:** R1 (single round per Standard-tier protocol)

---

## GROK DISRUPTOR — 12 challenges

| # | Challenge | Verdict | Rationale |
|---|---|---|---|
| 1 | TURN cred rotation risk (`openrelayproject:openrelayproject`) | **DEFER (monitoring)** | metered.ca documents these as stable public creds; rotation alarm is post-ship telemetry concern, not blocker |
| 2 | Trim 6 relays → 3 + reduce redundancy | **REJECT** | S19 P4 explicitly chose 6 for dead-relay-subset resilience; reverting that is regressing yesterday's fix |
| 3 | `handshakeTimeoutMs` race + `onIceConnectionStateChange` listener | **ADOPT** | Our 1Hz `room.getPeers()` poll captures per-peer `iceConnectionState`; codify the field-list in the spec |
| 4 | Peer pubkey validation (Nostr ephemeral keypair) | **REJECT (out of scope)** | Friends-only short-lived 6-char codes; threat model doesn't justify ~100 LOC of auth |
| 5 | Explicit `iceTransportPolicy: 'all'` in rtcConfig | **ADOPT** | Default already, but make explicit for predictable behavior across browsers |
| 6 | Room code collision risk | **REJECT** | 36^6 = 2.1B namespace, scoped per appId, short-lived |
| 7 | ActionSender `.catch()` should notify UI, not just console | **ADOPT** | Escalate to `onError` handler (same wire as join errors) |
| 8 | Pre-connect NAT detection probe | **REJECT (out of scope)** | Diagnostic logging post-connect achieves same observability cheaper |
| 9 | Vite HMR WebRTC leak | **VERIFY** | `disconnect()` already calls `room.leave()` + nulls handles; verify no missed refs |
| 10 | Per-relay status visibility via `getRelaySockets()` | **ADOPT-PARTIAL** | Log socket count in `[net]` diagnostic if function returns truthy (it's `any`-typed) |
| 11 | Mobile bandwidth throttle on TCP TURN | **REJECT** | 10 Hz binary snapshots ≈ few KB/s; well within hotspot limits |
| 12 | Cross-origin Vite dev mismatch | **REJECT** | Dev-only artifact; production deploys from single origin |

## GEMINI AUDITOR — 10 findings

| # | Finding | Verdict | Rationale |
|---|---|---|---|
| 1 | `getPeers()` poll inefficient vs. event-driven `onPeerJoin/Leave` | **CLARIFY** | Use BOTH: onPeerJoin/Leave for presence, getPeers() poll for ICE-state during pre-join handshake (different phases) |
| 2 | `makeAction` 3-tuple `ActionProgress` element discarded | **ALREADY-ADOPTED** | PDR item 4 destructures `[sendFn, recvFn, _progress]` explicitly |
| 3 | Specify `trickleIce` explicitly | **ADOPT** | Explicit `trickleIce: true` avoids relying on undocumented defaults |
| 4 | Differentiate `onJoinError` types (timeout retryable vs. fatal config) | **ADOPT** | Classify on `details.error` substring; UI hint adjusts ("Try again" vs. "Check room code") |
| 5 | `onPeerHandshake` underutilized — protocol-version handshake | **ADOPT-LITE** | Send `{kind:'HELLO_PROTO',version:1}` via handshake `send`; verify on `receive`; mismatch → onError |
| 6 | `onPeerLeave` missing mid-game cleanup | **VERIFY** | Existing `transport.ts:96-99` wires `room.onPeerLeave` → peerHandlers; main.ts has connectionLostOverlay path; confirm chain |
| 7 | `Promise<void[]>` resolve as receipt confirmation | **REJECT** | Out-of-scope feature creep; fire-and-forget is by design for state replication |
| 8 | TURN single-point-of-failure | **ADOPT** | Add third TURN endpoint (UDP variant) for redundancy |
| 9 | `password` field unused → eavesdropping risk | **REJECT** | Same threat-model decision as Grok #4 |
| 10 | Synthesis materially better than current state (affirmation) | **CONFIRMED** | rtcConfig + observability + type fix together close all three A.0 gaps |

---

## CONVERGENT THEMES

1. **TURN reliability** (Grok #1, Gemini #8) — multiple TURN endpoints + observability of TURN reachability
2. **Error differentiation** (Grok #3 ICE-state, Gemini #4 timeout-vs-config) — surface error.error verbatim + classify
3. **Type-system pedantry** (Grok #7, Gemini #2/7) — `.catch()` escalates to UI

---

## ADOPT LIST (synthesis → execution spec)

**Base PDR items 1-5 — UNCHANGED.** Plus:

- **A.** `trickleIce: true` explicit in `JoinRoomConfig`
- **B.** `iceTransportPolicy: 'all'` explicit in `rtcConfig`
- **C.** Third TURN endpoint: `turn:openrelay.metered.ca:443?transport=udp` (in addition to :80 udp + :443 tcp already in scope)
- **D.** `onJoinError` classification: surface `details.error` verbatim; if substring contains `'timeout'` → UI hint "Try again"; if `'rejected'`/`'invalid'`/`'denied'` → UI hint "Check room code"; else surface as-is
- **E.** `onPeerHandshake` protocol handshake: ANY peer sends `{kind:'HELLO_PROTO',version:1}` via handshake `send` (DataPayload-compat JSON); verifies same on `receive`; mismatch → `onError('Protocol version mismatch')`. Version constant lives in `transport.ts` exported as `NET_PROTOCOL_VERSION = 1`.
- **F.** ActionSender `.catch()` escalates to `onError('[net] send failed: ${err.message}')` (not just console)
- **G.** Log `getRelaySockets()` count at connect-entry (if `(joinRoom as any).getRelaySockets` callable; defensive null-check)
- **H.** `room.getPeers()` poll fields: per-peer log `{peerId, iceConnectionState, iceGatheringState, connectionState, signalingState}`

## REJECT LIST (codified for traceability)
- Grok #2, #4, #6, #8, #11, #12 — out-of-scope or regressive
- Grok #1 — defer-monitoring
- Gemini #7, #9 — out-of-scope

## VERIFY LIST (in-code confirmation during implementation)
- Grok #9 — verify `disconnect()` does NOT leak room references after HMR
- Gemini #6 — verify `onPeerLeave` chain terminates cleanly at connectionLostOverlay

---

## PRIME-AUDIT DELTA (Rule 20, post-synthesis self-review)

**Self-question 1:** Was anything rubber-stamped?
→ **NO.** Each Council item has explicit verdict with rationale.

**Self-question 2:** What was claim-addressed-not-actually-fixed?
→ **None.** Every ADOPT item maps to a concrete code change.

**Self-question 3:** Where did consensus mask independent disagreement?
→ Grok-#2 (trim relays) was independent counter to S19 P4 LOCKED v4 — REJECTED with rationale.

**Self-question 4:** What edge cases remain undercaught?
→ **CRITICAL CARRY-FORWARD:** If post-deploy retest shows NO `[net]` logs at all (RED outcome), the wrapper hooks themselves are not firing OR Trystero 0.24 internals don't trigger them. Pivot to **S20 P0.1 amendment: A/B downgrade `trystero@0.20.0`**. Codify as explicit RED-path branch in completion criteria.

**Self-question 5:** Is synthesis materially better than R1 or just longer?
→ **YES, materially better.** R1 surfaced 3 high-value adoptions (trickleIce explicit, error classification, HELLO_PROTO protocol-version handshake) that close edge cases Claude's solo draft missed.

---

## EXECUTION SPEC (ready for implementation)

See [`.claude/plans/2026-05-12_PDR_Session_20.md`](2026-05-12_PDR_Session_20.md) §P0 SCOPE + the ADOPT list above.

**Estimated cost: Grok 1 call (~$0.01), Gemini 1 call (~$0.02), total ~$0.03 API.**

---
Battle Ledger sealed 2026-05-12 19:00 UTC.
