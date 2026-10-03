# S195 LAG tree — progress (newest at top)

## NEXT STEP (exact)
Node instrument run 2 (win bar lifted, to wave 15) is RUNNING -> writes .tmp-gates/lag/burst-*.json + lag-measure.json. When done: `npx playwright test -c scripts/lag/playwright.lag.config.ts` (joiner replay, gpu + swiftshader projects), then write .claude/plans/S195_LAG_REPORT.md.

## Log
- step 0: worktree at dcd6af47 (= master), npm install exit 0.
- step 1 (run 1): natural bot match ended in WIN at w9; table: w1 11.1 KiB, w5 78.2, w8 107.7, w9 137 KiB; primitives+bonds = ~95% of bytes and are almost all STATIC fields; deflate-1 = 5.4x smaller at ~0.5 ms; delta (changed entities only) w8 15.9 KiB. Exit 1 was vitest RPC "Timeout calling onTaskUpdate" after the test PASSED (long sync block) — fixed by yielding; win bar lifted by vi.mock in the instrument only.
- WS2 facts (read-only, Project Genesis GENESIS_BLUEPRINT.md §13.1 + registry.json): Oleg's box, Ryzen 9 9950X3D (Zen 5), "trusted SAME-ROOM compute" -> same home uplink as WS1. No hostname/IP/GPU recorded.
- step 2: run-2 first attempt failed to TRANSFORM (await outside async — my edit missed the it() callback); the bg wrapper said exit 0, the captured file said 1. Fixed, re-running.
- step 3: joiner replay harness written: scripts/lag/joiner-replay.spec.ts + playwright.lag.config.ts (inherits hashed port).
- context: S182 netStats docblock already diagnosed the same symptom (snapshot ARRIVAL rate, 'every five seconds the characters moved'); production `?debug=1` overlay shows host `net out` and joiner `snap rx`/`snap gap`.
