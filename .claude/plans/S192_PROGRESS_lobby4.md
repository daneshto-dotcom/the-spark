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

## STATUS (resume point)
- DONE: commits 1 (2a1ee8f) + 2 (8b2cf91). Working tree clean after this commit.
- IN FLIGHT: nothing running.
- EXACT NEXT STEP: (3) browser canary `e2e/poolSafePc.spec.ts` — goto `/?debug=1`, `page.evaluate`
  dynamic-import `/src/net/poolSafePeerConnection.ts`, raw RTCPeerConnection restart ⇒ no m=application;
  POOL_SAFE_PC ⇒ m=application + changed ufrag (+ optional loopback connect). Then (4) repair
  `e2e/nplayer.spec.ts:73`: prepCtx winScore high (STARTING_VICTORY_POINTS=100 ⇒ winScore 3 ended the match at
  once), inject score 1e9 for the win; wait 3-way mesh, shift Date.now +60 s on the 3 in-room pages, force
  the 4th joiner's selfId to sort ABOVE the others (addInitScript Math.random high for the first calls,
  verify via `await import('/src/net/transport.ts')).selfId`, reload fallback) ⇒ 100% red without fix.
  Prove RED (stash the rtcPolyfill lines) and GREEN; then drop @quarantine-flaky from that describe and
  pin it in `src/ci.e2eLanes.test.ts`. Then gates: typecheck, vitest --maxWorkers=3, build, e2e:gating.
- e2e port: hashed from this worktree's cwd (playwright.config.ts e2ePort); compute with node before running.

## PAUSED (owner order, usage limit) — resume point
- Tip after this commit = the wip commit below. `e2e/poolSafePc.spec.ts` is WRITTEN BUT NEVER RUN.
- Vite pre-start for this worktree: port **22006** (hashed). Was started then killed for the pause (exit of
  the background vite = taskkill, benign). Restart: `npx vite --port 22006 --strictPort --host`, wait
  for `curl http://localhost:22006/?debug=1` = 200.
- EXACT NEXT STEP: run `npx playwright test e2e/poolSafePc.spec.ts` (exit code to a file), fix until green,
  commit; then the nplayer.spec.ts repair as described in STATUS above.

3. Browser canary e2e/poolSafePc.spec.ts GREEN on port 22006 (own vite, PID 77416): raw restart 105 B no m=application; POOL_SAFE_PC 458 B, m=application, ufrag changed, data channel opened over loopback. 1 passed (5.2s), exit 0.
