# S196 PROGRESS — s196/dedicated-host (research + design, builds nothing)

**NEXT STEP:** write `.claude/plans/S196_DEDICATED_HOST_DESIGN.md`.

## Log
- opened tree; progress file created.
- read S195_LAG_REPORT (D = same house, same uplink; written at 0.5 MB snapshots pre-delta), N9, R196-P1#6, canon §6 (PROTOCOL 70: delta+deflate, w10 14.36→0.53 Mbit/s/joiner). WS2 = oleg-ws 9950X3D + RTX 5070 Ti on the SAME chateau LAN/router as daniel-ws (BRAIN/_sources THREE_MACHINE_ARCHITECTURE §5); shared Windows account w/ 3 Claude seats + Oleg's work (PART3 §).
- code read: host = seat 0 (lobbyRoster.ts:44); sim runs in Node already (state/hostTick.ts:369 runHostTick, used by vitest); simWorker.ts = sim-only graph; Trystero peer.mjs:12 accepts rtcPolyfill (Node WebRTC = NEW package, needs approval); HOST_STARVATION_MS 6000 (succession.ts:39); net-delta measured w10 0.53 / w15 0.82 Mbit/s/joiner, host 2.9-4.7 ms per snapshot (S195_PROGRESS_net-delta.md:33). net-cpu tree lead hypothesis = joiner serial decode backlog (not a verdict).
