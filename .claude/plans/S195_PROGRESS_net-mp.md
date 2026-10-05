# S195 PROGRESS — s195/net-mp (T20)

NEXT STEP: finish the MP spec batch (.tmp-gates/run-mp-specs.sh → Sym F / Sym I / exit-match MP / join-stall / hostmigration:29) against the local relay, write per-spec verdicts, delete e2e/_scratch-hardblip.spec.ts, run the final gates (typecheck · vitest src/net + ci.e2eLanes · full suite · build), merge ccr-26eaab43-fa9mg3, write the final report.

## Log
- merged ccr-26eaab43-fa9mg3 (1c5ce299) clean.
- ENVIRONMENT: `npm run probe-relays` → 0/6 relays answer a WebSocket handshake ("Received network error or
  non-101 status code") — /root/.ccr/README.md: WebSocket upgrades are NOT supported through the agent proxy.
  Every real-relay spec is therefore unrunnable here as shipped. Exit code 0 (the probe reports, never gates) —
  .tmp-gates/probe-relays.{log,exit}.
- ba543ca6 TURN re-paste (TURN_SETUP.md § "2026-10-05 (S195 T20) — THE RE-PASTE") + iceConfig.test "S195 T20" (reads the row from the runbook) +
  local relay harness: scripts/live-mp/local-nostr-relay.mjs (NIP-01 subset over `ws`, RELAY_TRACE=<file> traces signalling),
  src/net/devRelayOverride.ts (VITE_TEST_NOSTR_RELAYS, `import.meta.env.DEV` only; own module so ci.deployGate's
  "every env.VITE_* in iceConfig.ts is passed by deploy.yml" contract is not widened). With it the real-WebRTC specs RUN here.
- 34a5692e B-13: planConnectionFrame keeps 'reconnecting' past the grace while `rejoinAttemptInFlight` (derived from
  reconnectUntilMs/nextRetryMs — no main.ts change); terminal only at RECONNECT_GIVE_UP_MS. connectionFrame.test re-pinned
  (2 assertions) + 8 new B-13 cases. ⚠ MINE: "failed" = superseded by the loop or the give-up.
- HARD BLIP measured HERE (local relay, Chromium 1194, 4-core box shared by trees): recovered 41.5 / 28.4 / 53.3 s. Two
  traced runs (RTCPeerConnection tracer on both pages + relay trace): the FIRST and only attempt's handshake completed —
  no `after exchanging SDP` error, no offerAnswered/answering reset, no second handshake. Time went to: joiner loss
  detection 1.4–4.6 s (pc.close() fires NO local event; the datachannel close event does) · 1 s first-retry delay ·
  leave→connect handoff 2.7–5 s (transport.ts pendingLeaves) · waiting for the next announce ≤5.3 s · then each
  signalling hop (offer, answer, candidates) took 5–10 s to be PROCESSED by the receiving page (relay delivered in ms) ·
  ICE + Trystero handshake 2–8 s. The pre-blip FRESH join on this box took ~15–25 s vs 6.3 s on the desktop, so the
  box is ~3× slower; CI run 37047025269 measured attempt 5.07 s → recovered 37.5 s. T8's TTL-lock suspect is NOT what
  these traces show; it remains the S192 desktop explanation for the 23–33 s cluster.
- CI lobby reds (run 37047025269, job 110970878012, read via GitHub MCP): join-stall:109 = `Test timeout of 60000ms
  exceeded` ×3 while retry #2's console already carried the JOIN STALLED line; join-stall:85 PASSED at 58.6 s;
  exit-match:173 red ×2 at the 60 s cap with `no RTCPeerConnection yet` at 10 s, PASSED on retry #2 at 59 s;
  nplayer:140 `Test timeout of 330000ms exceeded` ×2. `Binding request timed out` appears in EVERY test's browser log,
  passing ones included (plus `Failed to resolve global.stun.twilio.com -105`, IPv6 sendto ERR_ADDRESS_UNREACHABLE) → NOISE.
  VERDICT: CI time budget (a 2-peer join takes 40–60 s on the runner), NOT STUN. A relay-only path would not help.
