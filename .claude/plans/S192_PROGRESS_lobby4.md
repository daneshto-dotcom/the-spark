# S192 PROGRESS — s192/lobby4 (T1: the 4th player can't connect)

Brief: `.claude/plans/S192_RESEARCH_T1_lobby4.md`. Branch `s192/lobby4`, never merged/pushed by this agent.

## Commits
1. pool-safe RTCPeerConnection + wiring at both SPARK Trystero join sites (transport.ts joinFn,
   quickmatch.ts openRoom) + unit tests (predicate truth table, REAL Trystero
   `peer.mjs` restart driven over a fake base) + mechanical join-site tripwire + Trystero 0.25.x pin.
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
4. nplayer 4-player spec repaired (26078c1) + gating via e2e-lobby (this commit).
   - Rot fixed: win score 3 < STARTING_VICTORY_POINTS 100 (instant WIN); free-spark drags waited on sparks
     that no longer exist at match open (0 at tick 900) — removed; win injection now also sets
     `scoreProgress` (tickScoring is FIGHT-only, so BUILD never re-derived it).
   - Determinism: Date.now +60 s on the 3 in-room pages; 4th joiner's selfId forced "zzzz…" (Math.random
     pinned until DOMContentLoaded), precondition asserted.
   - GREEN with fix: 1/1 (1.1m) + --repeat-each=3 3/3 (2.0m, 1.1m, 1.4m). exit 0 both.
   - RED without fix (rtcPolyfill commented out in transport.ts + quickmatch.ts, vite reloaded both):
     exit 1 at "peer 0 has the full mesh (3 peers)", host peerCount 2. Restored; tree clean.
   - Lane: KEPT @quarantine-flaky and added "S192 late 4th joiner" to `e2e:lobby` (GATING e2e-lobby job,
     the S155/S142 precedent) instead of the shared e2e:gating lane: 1–2 min locally ×3–5 on CI would
     endanger the shared 12-min cap. e2e-lobby budget 12→20 / PW 9→16. `src/ci.e2eLanes.test.ts` pins the
     grep selection + the forced-staleness lines + no continue-on-error on e2e-lobby (mutant: adding
     continue-on-error turns it RED). Also `@vite-ignore` added to NOT_A_LANE_TAG.
   - Vite on 22006 died with exit 1 after the repeat run, no error printed, after all runs had
     completed (benign for the results; cause unknown — likely an external orphan sweep).

5. Gates on ab3b291: typecheck 0; vitest --maxWorkers=3 exit 0 (6757 passed / 7 skipped, 422 files); build exit 0, 976.1 KiB / 1100 (123.9 headroom). PROTOCOL_VERSION 52 untouched, protocol.ts not in diff — no bump.

6. e2e:gating exit 0 — 71 passed (5.9m), Playwright-started dev server on this worktree port 22006 (nothing else was listening). e2e:lobby exit 0 — 5 passed (2.1m) incl the 4-player late-joiner (1.0m).

## DONE — awaiting merge owner. Cross-NAT TURN health still UNMEASURED (all proofs are loopback, one machine).

7. OWNER ORDER (S192): the Pitch Masters arcade is another project sharing only the domain — DO NOT TOUCH.
   Reverted its bridge wiring (byte-identical to master); the join-site tripwire now skips that directory
   (comment quotes the owner) and pins the 2 SPARK sites.
