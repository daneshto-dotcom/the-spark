# S192 PROGRESS — s192/lobby4 (T1: the 4th player can't connect)

Brief: `.claude/plans/S192_RESEARCH_T1_lobby4.md`. Branch `s192/lobby4`, never merged/pushed by this agent.

## Commits
1. pool-safe RTCPeerConnection + wiring at all 3 Trystero join sites (transport.ts joinFn, quickmatch.ts
   openRoom, arcade/pitchMasters/bridge.ts) + unit tests (predicate truth table, REAL Trystero
   `peer.mjs` restart driven over a fake base) + mechanical join-site tripwire + Trystero 0.25.x pin.
   - Third site found by the enumeration: `src/arcade/pitchMasters/bridge.ts` (separate Pitch Masters
     page, same bug). No other branch touches it (checked pm-s2/pm-s4/s189/s191/s192 diffs).
   - Mutation check: removing rtcPolyfill from quickmatch.ts turns the tripwire RED (1 failed / 7).
2. transport.ts: `onJoinError` is per-PEER (every Trystero call site carries a peerId — verified in
   signal-handler.mjs SDP-exchange + 2 decrypt failures, strategy.mjs onHandshakeError). It no longer sets
   the whole strategy `failed`; failures are recorded per peer (`peerJoinFailures`), and the red UI error
   fires only when THAT peer is unreachable on every live strategy and not connected. Strip shows
   `nostr:6/7✗1` instead of `nostr:fail`. Tests: `src/net/peerJoinError.test.ts` (5). src/net 643 pass.
