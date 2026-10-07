# S196 PROGRESS — net-blip (branch s196/net-blip)

## NEXT STEP (top, always current)
- DONE — final report below; nothing in flight. (Merge owner: audit, then merge.)

## FINAL REPORT (S196 · s196/net-blip)
- **Tip**: see `git log -1` (this commit). Merge of master 7e9d241c = 528ce10d, CLEAN (no conflicts; it brought board-look render files only).
- **Reproduction verdict: REPRODUCED.** Mechanism: `scripts/live-mp/udp-blackhole.mjs` — the joiner's ICE is forced through a local
  UDP relay (init-script RTCPeerConnection wrapper: remote candidates rewritten to the relay, local candidates stripped; mDNS off),
  the relay goes DARK (drops every packet, closes nothing). Faithful: pcs stayed `connected` / channels `open` until ICE consent
  noticed (`disconnected` +5.5..8.6 s), no SCTP abort, no leave before Trystero's own 5 s close. Driver: `live-silent-blip.mjs`
  (local Nostr relay, nostr only, own port 49915). `npm run probe-relays` on the desktop: exit 0, 6/6.
  · dark < close (8/12.5/13 s): self-heals, back +10..14 s. dark > both closes (20/40 s): both leave, back +37.7/+52.8 s.
  · ⛔ dark ending BETWEEN the two sides' 5 s closes = PERMANENT SPLIT. Pre-fix: 4 natural splits (12 s sweep, r1, B2#1, B2#3 —
    ~19 % of 16 runs lit at the first side's drop) + 4/4 in the deterministic SLOW_CLOSE model; both directions; never recovers
    (joiner-side: reconnects every 35 s then TERMINAL at 3 min while the host never notices; host-side: host terminal, joiner on a
    dead board with NO overlay).
  · CAUSE (code + trace): Trystero 0.25.2's disconnected-close only DETACHES the peer (`shared-peer.mjs` clear `destroyPeer:false`,
    `room.mjs` exitPeer → proxy destroy); the RTCPeerConnection lives, reconnects ICE when the network returns, answers consent and
    keeps the far side's channel `open` → the far side's `getConnectedPeerHealth` = live → `signal-handler.mjs:393-398` drops every
    announce/offer of the rejoin. Relay trace r1: 24 offers from the rejoiner DELIVERED to the host, ZERO answers. (T8's suspect,
    confirmed — made permanent by the orphan.) Upstream Trystero defect; worked around in our transport.
- **Fix** (`src/net/transport.ts`, ~25 code lines): `shouldCloseDroppedPeerConnection(conn, ice)` (pure) + `closeDroppedPeerConnection`
  on `onPeerLeave`: when Trystero drops a peer whose connection reads dead (`network-died`), close it (pc captured at join in
  `peerPcs`). NOT on a healthy leave (keeps the ~0.2 s clean-rejoin re-bind), not on our own `disconnect()`, not on `unknown`.
  Host-migration and B-13 code paths untouched (same onPeerLeave events; only the dead pc is now closed).
  Live after the fix: 12 runs, 0 splits (F x6 lit-at-first-drop: 20.7–50.9 s; SLOW_CLOSE x6: 22.0–52.2 s) vs pre-fix SLOW_CLOSE 4/4 split.
  Tests `src/net/droppedPeerClose.test.ts` 11: decision table, REACH through the real transport onPeerLeave seam (×3), negatives
  (healthy leave, re-announce/duplicate join, replaced pc, own disconnect, already-closed/throwing close). Mutation: close removed →
  3 RED; guard removed → 3 RED.
- **Gates** (merged tree): typecheck **0** · vitest --maxWorkers=3 **0** (616 files / 7 skipped, 9231 tests / 14 skipped) · build **0**
  entry **1235.9 KiB** (boot 1235.5 → +0.4 incl. master's board-look merge; headroom 114.1) · e2e:gating **0** 67 passed ·
  e2e:lobby **0** 5 passed · hard-blip `--repeat-each 3` **1** (11.3 / 11.1 / 15.5 s — 2/3 inside the 15 s grace) → STAYS quarantined.
- **Bump verdict: NO.** Nothing on the wire changed — a transport-local connection lifecycle decision. A fixed and an unfixed v70
  build compute identical worlds; the fixed side closing its dead pc only helps the unfixed peer converge.
- **MINE** (one line each): (1) close only on `network-died` (dead state), never `unknown` — recommend accept. (2) SLOW_CLOSE (stretching
  one page's 5000 ms timeouts) as the deterministic model of the two machines' clock asymmetry — harness only; recommend accept.
- **Seams / notes for the merge owner**: (a) ⚠ vite's watcher MISSED a source edit on this OneDrive path and served stale code for 6 runs
  (caught by curl; the driver now logs which transport is served) — any tree measuring live behaviour should restart vite after edits.
  (b) The host shows terminal CONNECTION LOST from ~+28 s during any outage > ~15 s (host grace) and restores on rejoin — existing
  behaviour, unchanged, worth an owner look. (c) A real drop (dark > both closes) recovers only ~10–14 s after the network returns.
- **NOT DONE**: torrent-on runs (all measurements BLOCK_TORRENT=1, nostr only — the fix is per strategy, but a mixed-strategy split was
  not measured); a signalling-dark variant (relay WebSocket also silenced) was not built; no CI e2e for the silent drop (needs the
  UDP relay + launch flags — the harness is `scripts/live-mp/live-silent-blip.mjs`).

## Log
- e2e:lobby 0 — 5 passed (4.3 m). hard-blip x3: exit 1 — 11.3/11.1/15.5 s (one 0.5 s past the grace) → stays quarantined (header updated).
- e2e:gating 0 — 67 passed (8.3 m), Playwright's own hashed port (not 5173, not 49915).
- GATES on merged tree 528ce10d: typecheck 0 · vitest --maxWorkers=3 0 — 616 files passed / 7 skipped, 9231 tests passed /
  14 skipped · build 0 — entry 1235.9 KiB (boot 1235.5; +0.4 incl. master's board-look merge), headroom 114.1.
- MUTATION: (1) `pc.close()` removed -> droppedPeerClose.test 3 REACH tests RED (exit 1, .tmp-gates/vt-mutant.log);
  (2) the `shouldCloseDroppedPeerConnection` guard removed (always close) -> 3 NEGATIVE tests RED (exit 1, vt-mutant2.log).
  Source restored byte-identical (git status clean).
- ⭐ SLOW_CLOSE PRE-FIX (SBh/SBj, served NO, same setup as SFh/SFj): 4/4 SPLIT — SBh x2: joiner dropped, host never;
  reconnect attempts every 35 s to +189/+191 s, splitForS 186/217. SBj x2: host dropped, joiner never; host terminal from
  +29 s to the end, splitForS 218/188. (SBj#2: the dev server process died at +20 s — ERR_CONNECTION_REFUSED on vite's HMR
  socket; page code was already loaded and the split was already set at +13.4 s, so counted with that caveat.)
  => WITH vs WITHOUT the fix in the deterministic asymmetric model: 0/6 split vs 4/4 split.
- SLOW_CLOSE WITH FIX (SFh = host's close stretched to 9 s, SFj = joiner's), 6 runs, no split; recovered 22.0/25.3/30.3 (h),
  29.7/31.8/52.2 (j). The rescue is visible: SFh#1/#2 — joiner dropped first and CLOSED its pc; the host's ICE then never
  came back (conn stayed disconnected: the orphan it would have reconnected to is gone) and its stretched close fired
  3.7/3.9 s later -> both sides fresh -> recovered. SFh#3, SFj#1-3 — the second side dropped 0.2-0.3 s after the first's
  close (the stretched timer cannot be what fired; consistent with the close's SCTP abort over the restored path).
- ⚠ STALE-SERVER FINDING: the first "F" sweep served PRE-fix code (vite's watcher missed the edit on this OneDrive path;
  `curl /src/net/transport.ts` had no fix). Those 6 runs are renamed F0stale-* and count as PRE-fix: no split, recovered
  23.5/31.6/50.7/29.2/32.7/51.5 s. Pre-fix LIGHT_ON_FIRST_DROP total: 16 runs, 3 splits (~19 %), + the s-12000 split.
  The driver now logs which transport the server serves. (Also proves B/B2 were genuinely pre-fix: the server never had it.)
- FIXED F x6 (served YES, LIGHT_ON_FIRST_DROP): no split; recovered 29.3/31.0/31.2/50.9/20.7/25.5 s. The close fired on
  both sides every time — but each time the second side's OWN 5 s timer fired 0.1-0.7 s after the first, so these runs
  show no regression, not the rescue. => SLOW_CLOSE mode added (stretch one page's 5000 ms timeouts to 9 s) to make the
  asymmetric window deterministic.
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
