# S191 — s191/perf progress (P12: the wave-5 host tick, next hotspots — outputs byte-identical)

Owner, verbatim (C5): *"it was lagging at about wave five. I thought we fixed the lags"*.
Branch `s191/perf`, from master 42cc2ee (src = deploy #4). Worktree agent; the main session is the merge
owner. Commits are LOCAL only. Brief: `.claude/plans/S191_BRIEFS/perf.md` (main checkout).

⚠ **Seven worktrees share this 32-core machine.** Every timing below is NOISY: each is repeated, reported
as mean and spread, and compared only against a before taken on the same machine in the same hour.

## Step 0 — setup  ✅
- `npm ci` in this worktree: **NPMCI_EXIT=0** (own install, no junction).

## Step 1 — measure (the S190 instrument, the same wave-5 board)  — next
## Step 2 — one hotspot per commit  — pending
## Step 3 — cache-invariant guards  — pending
## Step 4 — final gates, numbers, report  — pending
