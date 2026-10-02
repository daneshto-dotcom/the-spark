# S194 T17 — MULTIPLAYER MUST WORK TONIGHT — progress (branch s194/mp)

## Evidence so far (live deploy #4, index-BMPYtvtQ.js, PROTOCOL 64)
- probe-relays: EXIT 0, 6/6 (4 nostr + 2 torrent) answer.
- TURN in live bundle: ONE url `turn:global.relay.metered.ca:80`, secrets STILL WRAPPED (`urls: "…"`),
  parseTurnConfig unwraps it (console warns). Live creds allocate a relay candidate in 131 ms
  (also :80 tcp, :443, turns:443 tcp all allocate with the same creds).
- LIVE host+join by code: PASS (join 6.9 s, first snapshot 1.7 s after Begin, 30 s tick-locked).
- LIVE quick match: PASS (both connected 8.5 s from first click, first snapshot 2.8 s after READY).
- LIVE host+join forced relay-only (iceTransportPolicy relay on both): PASS, relay<->relay udp, 1.9 s first snapshot.

## Harness
`scripts/live-mp/` — `MODE=code|quick RELAY=1 SECS=30 node scripts/live-mp/live-2peer.mjs` (no __SPARK__ needed:
Pixi `__PIXI_APP_INIT__` hook + RTCDataChannel tap).

## Next step
reconnect-hard-blip grace assessment; teams lobby after deploy #5.
