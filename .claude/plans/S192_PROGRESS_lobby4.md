# S192 PROGRESS — s192/lobby4 (T1: the 4th player can't connect)

Brief: `.claude/plans/S192_RESEARCH_T1_lobby4.md`. Branch `s192/lobby4`, never merged/pushed by this agent.

## Commits
1. pool-safe RTCPeerConnection + wiring at all 3 Trystero join sites (transport.ts joinFn, quickmatch.ts
   openRoom, arcade/pitchMasters/bridge.ts) + unit tests (predicate truth table, REAL Trystero
   `peer.mjs` restart driven over a fake base) + mechanical join-site tripwire + Trystero 0.25.x pin.
   - Third site found by the enumeration: `src/arcade/pitchMasters/bridge.ts` (separate Pitch Masters
     page, same bug). No other branch touches it (checked pm-s2/pm-s4/s189/s191/s192 diffs).
   - Mutation check: removing rtcPolyfill from quickmatch.ts turns the tripwire RED (1 failed / 7).
