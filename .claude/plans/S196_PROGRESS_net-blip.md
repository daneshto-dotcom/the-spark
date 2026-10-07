# S196 PROGRESS — net-blip (branch s196/net-blip)

## NEXT STEP (top, always current)
- Read S195_PROGRESS_net-mp.md, reconnect-hard-blip.spec.ts, reconnectPolicy.ts, transport.ts, scripts/live-mp/*; npm install running.

## Log
- probe-relays exit 0: 6/6 configured relays answered (desktop has public reach).
- RUN 1 (DARK 8 s, nostr only via local relay): harness VALID — joiner ICE crossed the relay (fwd 36/27 pkts pre-blip,
  20 dropped in the dark, 88 local candidates suppressed); both pcs stayed connected/open until ICE `disconnected` at
  +6.7 s (joiner) / +7.2 s (host); LIGHT at +8.0 -> ICE connected +8.2/+9.1 -> RECOVERED +10.3 s, no leave on either
  side (Trystero's 5 s disconnected-close never expired). => detection ~ +7 s disconnected, close ~ +12 s.
- npm install exit 0.
- CODE READING (Trystero 0.25.2 core) — HYPOTHESIS H1 (stronger than the S195 suspect): a Trystero peer that sits
  ICE `disconnected` for 5 s emits `close` (peer.mjs disconnectedCloseDelayMs) -> shared-peer `clear(destroyPeer:false)`
  -> room `exitPeer` -> proxy.destroy() = detachBinding ONLY. The RTCPeerConnection is NEVER closed. If the path comes
  back, that ORPHAN pc reconnects ICE and keeps its channel `open`. The OTHER side (whose 5 s timer did not expire
  because ICE recovered first) keeps a binding to it: getConnectedPeerHealth = 'live' -> signal-handler.mjs:395 drops
  every announce/offer from the rejoining peer, and nothing ever fails (consent is answered by the orphan).
  => a blip whose length lands between the two sides' detection times would be a PERMANENT split. To be measured.
- boot: worktree at c8239570 (master tip). Progress file created.
