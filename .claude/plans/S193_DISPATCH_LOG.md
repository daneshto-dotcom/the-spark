# S193 — DISPATCH LOG (merge owner's resume file)

Dispatched 2026-10-01 from master `8693fdd` (= origin, deploy #16 `10ec442` + S192 bookkeeping). Max 8 live worktrees (owner).
Fix rounds go to the SAME agent by SendMessage. Audits: ONE at a time, single independent auditor. Common rules: `S193_AGENT_RULES.md`.

| P | worktree / branch | progress file | agent id | status |
|---|---|---|---|---|

## Log
- boot: 14 boot reads + backlog + dispatch log + owner rulings; master == origin 8693fdd clean; 7 worktrees clean at their S192 tips (167–232 behind master).
- BOOT FINDINGS (CI, `gh run list`): gating lanes green on the last master run 36884780286. ⚠ `e2e-lobby` nplayer 4-seat red in 4 of the last 5 master runs
  (`waitForWorld timeout (60000ms): early peer 0 sees the other two`, 3 attempts each) → P8 lobby-ci. `e2e-quarantine` red every run (hostmigration ×2, exit-match) —
  non-gating, pre-existing, logged LOW. Deploy-#10 run: gating `e2e` red = Checkout action 3-min timeout (infra, benign); `e2e-soak` worker-heap red once, green after (logged).
