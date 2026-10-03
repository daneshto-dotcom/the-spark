# S195 LAG tree — progress (newest at top)

## NEXT STEP (exact)
Joiner replay (gpu project) RUNNING -> .tmp-gates/lag/joiner-gpu.log + joiner-gpu-natural.json. Then run --project=swiftshader, then write .claude/plans/S195_LAG_REPORT.md.

## Log
- step 0: worktree at dcd6af47 (= master), npm install exit 0.
- step 1 (run 1): natural bot match ended in WIN at w9; table: w1 11.1 KiB, w5 78.2, w8 107.7, w9 137 KiB; primitives+bonds = ~95% of bytes and are almost all STATIC fields; deflate-1 = 5.4x smaller at ~0.5 ms; delta (changed entities only) w8 15.9 KiB. Exit 1 was vitest RPC "Timeout calling onTaskUpdate" after the test PASSED (long sync block) — fixed by yielding; win bar lifted by vi.mock in the instrument only.
- WS2 facts (read-only, Project Genesis GENESIS_BLUEPRINT.md §13.1 + registry.json): Oleg's box, Ryzen 9 9950X3D (Zen 5), "trusted SAME-ROOM compute" -> same home uplink as WS1. No hostname/IP/GPU recorded.
- step 2: run-2 first attempt failed to TRANSFORM (await outside async — my edit missed the it() callback); the bg wrapper said exit 0, the captured file said 1. Fixed, re-running.
- step 3: joiner replay harness written: scripts/lag/joiner-replay.spec.ts + playwright.lag.config.ts (inherits hashed port).
- context: S182 netStats docblock already diagnosed the same symptom (snapshot ARRIVAL rate, 'every five seconds the characters moved'); production `?debug=1` overlay shows host `net out` and joiner `snap rx`/`snap gap`.
- step 4: Node run 2 exit 0 (captured). Natural match to wave 16 (win bar lifted). Mid-FIGHT 10 Hz bursts, wire KiB med (max): w1 11.1 · w5 78.2 · w8 107.7 · w10 119.1 · w12 100.3 · w15 111.5; max seen 138.7 (w11, effects 13.6K + freeSparks 8.8K at a phase edge). primitives+bonds = 90-95%. deflate-1: w10 119.1 -> 22.3 KiB (5.3x) at ~1 ms; delta (changed entities only vs previous 10 Hz snapshot): w8 15.9, w10 15.4, w15 13.8 KiB (68-80 of ~840 entities change per 100 ms). host build+stringify ~2.5-3 ms; Node parse+apply ~2 ms. floor120 variant ends WIN at w4 (castles overrun), only w1 usable (24 KiB, creatures 18.6K = 155 B each).
- owner has FIBRE at the domain (BRAIN quotebook: 'Le cable fibre optique'), so a raw home-uplink shortfall is unlikely; WS2 is same-room => same uplink.
