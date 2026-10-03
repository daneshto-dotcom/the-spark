# S195 PROGRESS — T21 ci-perf (`s195/ci-perf`)

**NEXT STEP:** diagnose item 1 (fog/hunter) from .tmp-gates/ci/e2e.log; then soak, lobby/quarantine.

## Log
- step 0: worktree at master dcd6af47, npm install exit 0. Read rules, brief (BACKLOG §A T21 + T22#1), dispatch log, ci.e2eLanes.test.ts, e2e.yml.
- step 1 (item 5 DONE): draftOverlay hover-sheen pinned via vi.spyOn(performance,'now') at SKIN_SHEEN_MS/2 + a scan test proving clamped-out phases exist (<2%) and the pin is not one. uiSkinReach.buttons/chips/teams drive t from Ticker.update(lastTime+50) — already deterministic, no wall clock; uiSkinReach.arcade is arcade (off-limits).
- step 2 (item 6 DONE): .gitattributes `*.snap text eol=lf`; reproduced churn (status M, diff empty) before, clean after a pentagram run.
