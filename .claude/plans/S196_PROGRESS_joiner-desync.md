# S196 PROGRESS — s196/joiner-desync

## NEXT STEP
Implement receive-side pipeline in transport.ts onSnapFrame: start inflate CONCURRENTLY on arrival; drain = apply only the
NEWEST done+decodable frame (keyframe or base held), drop superseded older ones (safe: deltas name an ACKED base). Add
snapRxStats()/snapTxStats() counters. Then unit tests (fixtures linkedPair), then browser harness live-joiner-lag.mjs
(CDP CPU throttle on joiner + udp relay impairment) BEFORE/AFTER.

## WHY THE JOINER WAS BEHIND
HYPOTHESIS (net-cpu lead, measured there in Chromium; to be confirmed by my own 2-browser trace):
onSnapFrame chains EVERY frame serially (r.chain.then(decode)); each frame's inflate (DecompressionStream reader) takes
several TASK hops, each waiting for the main thread. Joiner below ~20 fps -> per-frame decode > 100 ms arrival interval
-> queue grows without bound (~0.19 s/s -> ~45 s behind after ~4 min). Feedback: once >3.2 s behind, its acks name fids
the host evicted from the 32-frame txRing -> host ignores them -> every frame a KEYFRAME (~5x bytes/parse) -> worse.
Every symptom (unseen buildings, stale 100/2500, could-not-build) = joiner applying world state tens of seconds old.
Ruled out by reading: (b) authority predicate = session.hostPeerId (stable once latched); net-blip close only runs in
onPeerLeave for a 'network-died' connection, never on a live peer.

## LOG
- boot: merged master c78f5c58 (no conflicts).
