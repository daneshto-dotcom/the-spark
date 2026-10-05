# S195 PROGRESS — s195/net-mp (T20)

NEXT STEP: build the local nostr relay harness (scripts/live-mp/local-nostr-relay.mjs + DEV-only VITE_TEST_NOSTR_RELAYS override in iceConfig.ts) so the real-WebRTC specs can run on this box; then run reconnect-hard-blip.

## Log
- merged ccr-26eaab43-fa9mg3 (1c5ce299) clean.
- ENVIRONMENT: `npm run probe-relays` → 0/6 relays answer a WebSocket handshake ("Received network error or
  non-101 status code") — /root/.ccr/README.md: WebSocket upgrades are NOT supported through the agent proxy.
  Every real-relay spec is therefore unrunnable here as shipped. Exit code 0 (the probe reports, never gates) —
  .tmp-gates/probe-relays.{log,exit}.
