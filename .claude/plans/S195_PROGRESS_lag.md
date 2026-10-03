# S195 LAG tree — progress (newest at top)

## NEXT STEP (exact)
Phase 1: Node instrument src/net/lagWaveMeasure.test.ts RUNNING (log .tmp-gates/lag/node-measure.log). Next: browser joiner-replay harness (inject burst-*.json into a real joiner via __SPARK__.netTransport.handleRawMessage, CDP CPU throttle 1x/4x/6x, fx HIGH/LOW/legacy, read __SPARK__.frameMs).

## Log
- step 0: worktree at dcd6af47 (= master), npm install exit 0.
- step 1 (run 1): natural bot match ended in WIN at w9; table: w1 11.1 KiB, w5 78.2, w8 107.7, w9 137 KiB; primitives+bonds = ~95% of bytes and are almost all STATIC fields; deflate-1 = 5.4x smaller at ~0.5 ms; delta (changed entities only) w8 15.9 KiB. Exit 1 was vitest RPC "Timeout calling onTaskUpdate" after the test PASSED (long sync block) — fixed by yielding; win bar lifted by vi.mock in the instrument only.
- WS2 facts (read-only, Project Genesis GENESIS_BLUEPRINT.md §13.1 + registry.json): Oleg's box, Ryzen 9 9950X3D (Zen 5), "trusted SAME-ROOM compute" -> same home uplink as WS1. No hostname/IP/GPU recorded.
