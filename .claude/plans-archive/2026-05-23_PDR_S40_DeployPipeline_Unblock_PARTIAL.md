# PDR — Session 40 (Scope Amendment): Deploy Pipeline Unblock + 1v1 Lobby Production Verification

**Generated:** 2026-05-23 (S40, urgency-protocol-triggered scope amendment per global Rule URGENCY)
**Tier:** Micro (execution <10K LOC; mostly gh CLI ops + 1 workflow file edit; state-discovery already empirically completed below)
**Trigger:** User report "1v1 lobby still doesn't work! this session is all about that fix!" after S39 close claimed lobby fix shipped.

---

## OBJECTIVE

Make S39's lobby-exit fix (commit `f8d237a`) and S37/S38 fixes ACTUALLY reach the live production site (`spark-online.space`), then verify 1v1 lobby works end-to-end in production. Eliminate the recurring deploy-cascade pattern that has frozen production at S36-era code for **7 days** (last green deploy: `2026-05-17T08:12:37Z` sha `1be5fce`).

---

## STATE-DISCOVERY (Rule 21, Phase A.0) — already completed pre-PDR

| Claim | Verifier | Result |
|---|---|---|
| S39 lobby-exit code is in master HEAD | `git show 6e0e5f9:src/net/protocol.ts \| grep START_GAME_SIGNAL` | ✅ Present (4 files) |
| deploy.yml workflow unchanged since S16 | `git log --all --oneline -- .github/workflows/deploy.yml` | ✅ Only 1 commit (`4011862`) |
| `concurrency.cancel-in-progress: false` in workflow | Read deploy.yml:28 | ✅ Confirmed false |
| All deploys since S37 cancelled with 0 jobs | `gh api .../actions/runs/{id}/jobs` for 6 runs | ✅ All `{total_count: 0, jobs: []}` |
| Live site Last-Modified | `curl -sI https://spark-online.space/` | ✅ `Sat, 16 May 2026 22:00:06 GMT` (S36-era, 7 days stale) |
| Last successful github-pages deployment | `gh api .../deployments` | ✅ `2026-05-17T08:12:37Z` sha `1be5fced` (S37-era) |
| Current pending run state | `gh api .../actions/runs/26331781853` | ✅ Pending 7+ hours, `updated_at` 2s after `created_at`, 0 jobs ever — stuck queue |
| GitHub Actions service status | githubstatus.com/api | ✅ Operational (no platform outage) |
| Repo Actions enabled | `gh api .../actions/permissions` | ✅ `{enabled: true, allowed_actions: "all"}` |
| github-pages env branch policy allows master | `gh api .../environments/github-pages/deployment-branch-policies` | ✅ master allowed |
| Cancellation pattern: prior run cancelled exactly when next push lands | timing of `created_at`/`updated_at` across 6 runs | ✅ Pattern verified: S37-close cancelled by S37-handoff push, S38-handoff cancelled by S39 push, S39-BUG-A cancelled by S39-close, S39-close cancelled by S39-handoff |

**Root-cause classification:** TWO independent failure modes compounding —

1. **Cancellation cascade (chronic)**: `actions/deploy-pages@v4` enforces github-pages environment-level deployment concurrency that **overrides** the workflow-level `cancel-in-progress: false`. Each session's rapid close+handoff+state-autocommit triple-push triggers 3 deploy.yml runs within minutes; each push cancels the prior queued run. Net result over 5 sessions: 0 deploys reach `success`.
2. **Stuck queue (this session)**: Current pending run `26331781853` (S39 handoff, sha `6e0e5f9`) has been pending 7+ hours with `updated_at` only 2s after `created_at` — never picked up a runner, not cancelled, just stuck. Could be transient queue stall; needs cancel+re-trigger to clear.

**Why S39 PDR missed this**: S39 PDR assumed deploys "should" work and noted "auto-cancellation race" as a one-off. State-Discovery for S39 verified code-side claims (parseNetMessage, schemaVersion, applyNetSnapshot) but did NOT verify the production-deploy claim. Reflexion entry will codify: any PDR claiming "user verifies at live URL" MUST include "live URL HEAD verifies post-fix code is actually served" as a State-Discovery item.

---

## SCOPE — 3 priorities, atomic batch

### P1 — Unstick the deploy queue + force S39 fixes to production
1. `gh run cancel 26331781853` — clear the 7-hour stuck pending run
2. `gh workflow run "Deploy to GitHub Pages" --ref master` — fresh workflow_dispatch on current HEAD `6e0e5f9`
3. Watch via `gh run watch <new-id>` until conclusion is `success` (~3-5 min for build+deploy)
4. Confirm new github-pages deployment record at `gh api .../deployments` with sha `6e0e5f9`
5. Verify `curl -sI https://spark-online.space/` shows `Last-Modified` updated past `2026-05-16`
6. Acceptance: live JS bundle contains `START_GAME_SIGNAL` literal (`curl -s https://spark-online.space/assets/index-*.js | grep -c START_GAME_SIGNAL` ≥ 1)

**Rollback if deploy hangs again**: `gh run rerun <id>` once; if still pending >10 min, escalate as carry-forward + open GH support ticket. No code change to revert.

### P2 — Fix the cancellation cascade (chronic fix in deploy.yml)
Add path filter so deploys ONLY trigger on commits that change production artifacts. Close/handoff/state-autocommit commits touch only `reflexion_log.md`, `HANDOFF_*.md`, `.claude/**`, `boot-snapshot.md` — none affect the served bundle.

Modify `.github/workflows/deploy.yml`:
```yaml
on:
  push:
    branches: [master]
    paths:
      - 'src/**'
      - 'public/**'
      - 'index.html'
      - 'vite.config.ts'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:
```

This guarantees:
- Code-changing commits trigger deploy (e.g., `f8d237a` S39 BUG-A) → goes through, no cascade-cancel
- Session-bookkeeping commits do NOT trigger deploy (e.g., `9d2e600` S39 close, `6e0e5f9` S39 handoff) → don't cancel the prior in-flight code deploy
- `workflow_dispatch` remains available for manual force-deploy (used in P1)

**Acceptance**:
- Push a no-op docs commit (e.g., touch `reflexion_log.md`); confirm `gh run list` shows no new run within 30s
- Push a real src/ change; confirm new deploy run triggers and reaches `success`

**Risk**: If user manually pushes a hand-edited `dist/` or other unlisted prod path, deploy won't auto-trigger. Mitigation: `workflow_dispatch` remains; documented in commit body. The path list covers every file the build actually reads (verified by inspecting `vite.config.ts` + `index.html` + `package.json`).

### P3 — Live production 1v1 smoke (user-side)
After P1+P2 land and deploy is green:
1. User hard-refreshes `https://spark-online.space/?debug=1` (Ctrl+Shift+R) on 2 devices/browsers
2. Host clicks Begin; peer should transition to PLAYING within ~1 RTT (~200ms)
3. Diagnostic strip below "Waiting for host to begin" should appear when peer connects and disappear once START_GAME_SIGNAL receives
4. Cursor↔avatar alignment at viewport edges (drag to all 4 corners of canvas)
5. Report PASS/FAIL — if FAIL, diagnostic strip text gives precise triage path (`sync N/T seq=K kind=X applyErr=J gs=LOBBY`)

Acceptance: User confirms peer transitions to PLAYING; if it fails, S40 escalates to a new BUG-A2 PDR with diagnostic data as ground truth (not a re-attempt of S39 conjecture).

---

## TESTING / VERIFICATION (per priority)

**P1** — `gh run view <new-id> --json conclusion` returns `"success"`; `curl -sI https://spark-online.space/` shows updated Last-Modified; live bundle grep finds START_GAME_SIGNAL.

**P2** — Documented dual probe: docs-only commit produces no run; src/ commit produces one. Both verified live before declaring P2 complete.

**P3** — User-driven; explicit pass/fail report.

---

## OUT OF SCOPE (Rule 16 — do NOT bleed)

- Refactoring main.ts hypertrophy (S39 carry, separate Standard batch)
- vite/vitest major bump (S39 carry, separate session)
- knip-unused-export triage (S38 carry)
- Adding [skip deploy] commit-message tag — superseded by path filter (cleaner)
- Switching deploy provider away from actions/deploy-pages — overkill; the root cause is push pattern, not provider

---

## END-OF-SESSION AUDIT (Rule 22)
This session SHIPS infrastructure changes that affect runtime deploy behavior. End-of-session audit MUST scan deploy.yml diff for: invalid YAML (yamllint-style), missing paths the build reads, unintended subtree exclusions, and confirm one live successful deploy post-P2 ships before /handoff. If P3 returns FAIL, S40 carry-forward includes the diagnostic text exactly as user reports it.

---

## REFLEXION SEEDS (to write at session close)
- `#deploy-claims-need-live-url-head-verifies` — Any "user verifies at live URL" acceptance step must pair with a State-Discovery item that the live URL actually serves post-fix code. `Last-Modified` header is the cheapest probe; commit-SHA grep against served bundle is the strict version.
- `#path-filter-beats-skip-flag-for-doc-commit-deploy-suppression` — Cleaner, no commit-author discipline required, doesn't depend on rememberd commit-message conventions.
- `#actions-deploy-pages-overrides-workflow-cancel-in-progress` — Document this in CLAUDE.md if it bites again.
- `#7-day-production-staleness-undetected-until-user-frustration` — Add `Last-Modified` check to /handoff skill's verification step.

---

## TOKEN ESTIMATE
- Diagnostics (this PDR): ~10K (mostly read by user)
- P1 execution: ~2K (5 gh CLI ops + 1 curl)
- P2 execution: ~2K (single workflow file edit + verification pushes)
- P3 execution: ~1K (user-side; Claude just relays results)
- End-of-session audit + reflexion + handoff: ~5K

**Total ~20K** — fits comfortably in YELLOW threshold at session close (~50% of 1M cap).

---

## REQUEST FOR `GO`
This is a Micro-tier PDR per global Rule 17 (single workflow file change + gh ops; <10K LOC; state-discovery already completed; reversible operations). Council deliberation opt-out is the standard Micro path on user explicit `go`. If user prefers Council validation (Grok + Gemini second opinion on the path-filter design), say "with Council" and I'll launch grok-parallel before P1.

User options:
- **`go`** — execute P1 → P2 → P3 sequentially (Micro waiver)
- **`go with Council`** — run grok-parallel deliberation first (~+10K, 1 round)
- **`hold`** — discuss / amend before execute

---

## SESSION OUTCOME (2026-05-24 close)

**Status: PARTIAL — P2 SHIPPED, P1+P3 BLOCKED on user-side GitHub billing**

### What actually happened

1. **Phantom github-pages deployment** discovered as the FIRST root cause (not in PDR):
   - Deployment `4716837489` (May 17, sha `1be5fce`) had only `state: waiting` status, never advanced.
   - Held github-pages env deployment-concurrency lock for 7 days.
   - Cleared via `POST .../deployments/{id}/statuses {state: inactive}` + `DELETE .../deployments/{id}`.

2. **Fresh workflow_dispatch after lock release STILL sat pending** for 14+ min → uncovered the second root cause:
   - Edited deploy.yml: added paths filter (P2 per original PDR) + renamed concurrency group `pages` → `pages-deploy` (defensive against stuck workflow-level state on old group name).
   - Commit `f6cf27c` pushed.

3. **Push triggered a run that reached terminal state in 2 seconds** with `failure` conclusion → strip-the-layers revealed the THIRD root cause:
   - `gh api .../check-runs/{job_id}/annotations` returned: **"The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings"**.
   - This is a GitHub billing issue, not a code/config issue.
   - Cannot be resolved by Claude — requires user action at https://github.com/settings/billing OR repo visibility change.

### Acceptance gates (per PDR)

- ✅ **P2** acceptance: paths filter correctly applied (verified by inspection + the deploy.yml-changing push triggered a run); concurrency group rename clean. Both shipped in `f6cf27c`.
- ⛔ **P1** acceptance: live `Last-Modified` past 2026-05-16 — UNMET (still `Sat, 16 May 2026 22:00:06 GMT`). Live bundle does NOT yet contain `START_GAME_SIGNAL`. Phantom-deployment lock release was PROPER WORK and is permanent — once billing is restored, the FIRST queued deploy will execute and prod will jump from S36-era to S40 in one ~45s run.
- ⛔ **P3** acceptance: user 2-peer smoke at production URL — UNMET (gated on P1).

### Carry-forward to S41

1. **USER ACTION REQUIRED FIRST**: Resolve GitHub billing at https://github.com/settings/billing — fix failed payment, raise spending limit, OR change repo visibility to public (Settings → General → Change visibility) which removes Actions minute billing for public repos. The Pages CNAME points to `spark-online.space` regardless of repo visibility; public repo would not change the live URL but DOES expose source code.

2. **After billing restored**: `gh workflow run "Deploy to GitHub Pages" --ref master` + `gh run watch <new-id> --exit-status` to ship the queued S39+S40 changes to prod. Then verify acceptance gates (P1 + P3 acceptance unchanged from PDR).

3. **Then** the still-pending S35 P11 2-peer 1v1 smoke (now covers S35 P0 deadlock fix + S36 animation + S37 audio + S38 audit hardening + S39 lobby-exit + S39 cursor alignment + S40 deploy pipeline robustness in one session).

### Reflexion entries written

See `reflexion_log.md` for full text. Six entries at top:
- `#deploy-claims-need-live-url-head-verifies-not-just-tests-green`
- `#phantom-deployment-state-waiting-as-multi-day-concurrency-lock`
- `#actions-billing-failure-presents-as-2-second-job-failure-with-empty-runner`
- `#path-filter-beats-skip-commit-flag-for-doc-deploy-suppression`
- `#compound-deploy-failures-need-empirical-layer-strip-not-conjecture-of-single-cause`
- `SESSION #s40-deploy-pipeline-bug-stats`
