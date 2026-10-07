# S196 PROGRESS — net-blip (branch s196/net-blip)

## NEXT STEP (top, always current)
- Fix in transport.ts (84f678d9; working tree clean). NOW: fixed runs F x6 (TAG=F, .tmp-gates/blip/F-*.log) running; typecheck 0; droppedPeerClose.test 11/11. THEN: mutation test (only after F finishes — dev server HMR), git merge master, full gates, spec header + RELAY_HEALTH note, final report.

## Log
- BASELINE B2 (pre-fix, LIGHT_ON_FIRST_DROP, split metric = one side holds the peer, the other none, >= 30 s after LIGHT):
  · #1 ⛔ SPLIT (joiner dropped first at +10.9, host never): joiner RECONNECTING, attempts +12.3/+48.0/+83.3/+118.4/+153.8/
    +189.0, TERMINAL CONNECTION LOST +191.4 (RECONNECT_GIVE_UP_MS); host kept peers=1 the whole 256 s. splitForS 242.
  · #2 no split (second close 0.3 s later) — recovered +32.0.
  · #3 ⛔ SPLIT (host dropped first at +13.3, joiner never): host terminal from +28.5 to the end (+195 s); splitForS 180.
  => SPLIT REPRODUCED 4x pre-fix (s-12000, r1, B2#1, B2#3), BOTH DIRECTIONS; never self-heals; a joiner-side split ends at
  the 3-min terminal, a host-side split leaves the joiner playing a dead board with NO overlay at all.
- BASELINE B x3 (pre-fix, LIGHT_ON_FIRST_DROP; B-30000-*.log): NO split — the second side's close fired 0.2-0.4 s after
  the first (before its ICE could recover), so both left and the rejoin handshook fresh: recovered +51.3 / +88.5 / +42.7 s
  (host terminal CONNECTION LOST shown from ~+29 s each time — host-side grace, unchanged behaviour). The split needs the
  two sides' 5 s timers >= ~0.6 s apart (2 of 9 pre-fix outages so far landed there: s-12000, r1).
- RUN r1 (LIGHT_ON_FIRST_DROP, nostr only; .tmp-gates/blip/r1-30000.log, pre-fix code): ⛔ REPRODUCED, MIRROR DIRECTION.
  Joiner's 5 s close fired at +12.6 s (LIGHT at that instant); host's had not — host ICE back to connected +12.9/+13.5 on
  the joiner's ORPHAN pc. Joiner: RECONNECTING from +13.8, reconnect attempts +13.8 / +49.2 / +84.7 / +119.9 / +155.2
  (35 s retry), never recovered. Host: peers=1, no overlay, never left. RELAY TRACE (.tmp-gates/relay-trace.log, joiner
  RpqCDT=c14, host lcCznE=c13): after the rejoin the joiner sent 24 OFFERS (6 offerIds) to the host's self topic, every
  one DELIVERED to c13 — and the host sent ZERO answers (its last answer was the pre-blip handshake). That is the S195
  suspect (signal-handler.mjs:393-398: connectedPeer health `live` -> return) CONFIRMED — and made permanent by the
  orphan pc answering consent, so it never reads stale. (Run killed at ~+160 s when the fix edit would HMR into it.)
- SWEEP (nostr only, local relay; logs .tmp-gates/blip/s-<ms>.log):
  · 12 s  — ⛔ REPRODUCED, PERMANENT SPLIT. host ICE disc +5.9, joiner +6.9; LIGHT +12.0; host's Trystero 5 s close fired
    at +12.5 (`PEER DROPPED cause=network-died`) — the SAME instant its orphan pc's ICE went back to connected (+12.5/+13.1).
    Joiner's close never fired (ICE back at +12.1): joiner kept peers=1, pc connected/connected, NO reconnect attempt, no
    overlay; host RECONNECTING +14.9 -> terminal CONNECTION LOST +27.7 and stayed so to +476 s (end: host peers 0, joiner
    peers 1). Two worlds ticking apart. Never recovers.
  · 12.5 s / 13 s — self-healed (+14.0 / +14.0): detection was later (+8.0..8.6) so neither 5 s timer expired.
  · 20 s — both sides closed (+12.4 joiner, +13.3 host), reconnect +13.7, new pcs after LIGHT, RECOVERED +37.7 s (host
    showed terminal CONNECTION LOST +28.5..+34.4 — host grace, existing behaviour).
  · 40 s — both closed (+13.7/+14.0), reconnect +15.6, recovered +52.8 s (12.8 s after LIGHT).
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
