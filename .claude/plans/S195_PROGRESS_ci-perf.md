# S195 PROGRESS — T21 ci-perf (`s195/ci-perf`)

**NEXT STEP:** hunter.spec: seed castle bank (skip ~700-tick economy wait) + tick-derived budget (SLOWEST_CI_TICKS_PER_S=5); fog.spec: frame-pinned extract + bounds diagnostics; new lane e2e-render (@render-lane) + e2e/ci-frame-profile.spec.ts; then soak.

## Log
- step 0: worktree at master dcd6af47, npm install exit 0. Read rules, brief (BACKLOG §A T21 + T22#1), dispatch log, ci.e2eLanes.test.ts, e2e.yml.
- step 1 (item 5 DONE): draftOverlay hover-sheen pinned via vi.spyOn(performance,'now') at SKIN_SHEEN_MS/2 + a scan test proving clamped-out phases exist (<2%) and the pin is not one. uiSkinReach.buttons/chips/teams drive t from Ticker.update(lastTime+50) — already deterministic, no wall clock; uiSkinReach.arcade is arcade (off-limits).
- step 2 (item 6 DONE): .gitattributes `*.snap text eol=lf`; reproduced churn (status M, diff empty) before, clean after a pentagram run.
- step 3 (diagnosis item 1, from run 37047025269 artifacts in .tmp-gates/ci/): hunter trace = every page.evaluate 0.7-1.9 s (main thread ~1 fps under swiftshader), tick ~850 at the 120 s timeout, ~95 s of it in pullFromBank's economy wait (gatherer banking) -> test timeout 120 s < ticks needed / CI ticks/s (~7.7). The pre-wave-1 draft is open (DRAFT_DEADLINE_TICKS = 5400) — visible in the screenshot, not the blocker. fog ghost: pixel read 0 inside ONE synchronous evaluate (state machine counts all pass) -> not frame starvation; suspect stage-bounds mapping (the S193 50ad0bf8 symptom, same words) -> fix: extract with an explicit 1920x1080 frame + report bounds.
