# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-24 | Session: S40 (Deploy pipeline unblock — user-side billing block uncovered)

## Live URL
**https://spark-online.space/** (HTTPS, GH Pages auto-deploy on push to master — but deploys currently BLOCKED on user-side GitHub billing)
**https://spark-online.space/?debug=1** (debug overlay + `[net]` + `[cinematic]` + `[creature]` logs)

## Status
S40 was a scope-amendment session triggered by user urgency ("1v1 lobby still doesnt work! this session is all about that fix!"). Diagnosis revealed S39's lobby-exit fix code WAS already in master HEAD (`f8d237a`) but **production has been frozen on S36-era code (`Last-Modified: 2026-05-16T22:00:06Z`) for 7 days** because the deploy pipeline had been broken across THREE compounding failure layers. Claude resolved 2 of 3 in this session; the third (GitHub billing) requires user action. **Tests still 759/759 green from S39 (no source code touched this session); deploy.yml hardened with paths filter + concurrency group rename.**

**Tests:** 759/759 (unchanged — no code touched)
**Bundle (app code):** 474.26 KB / 500 KB cap (unchanged from S39)
**Branch:** master, clean, in sync with origin at `50008a6` (close commit; +2 commits this session)
**Context at close:** S40 was Micro-tier (no Council); execution + diagnostic ~25K tokens spread across resume turn
**Live production state:** S36-era code from 2026-05-16T22:00:06Z. **All S37/S38/S39 fixes UNSHIPPED until user resolves billing.**

## Next Steps (priority order)

1. **🔴 USER ACTION REQUIRED FIRST**: Resolve GitHub billing block. Visit https://github.com/settings/billing — fix failed payment OR raise Actions spending limit OR change repo visibility to public (Settings → General → Change visibility — removes Actions minute billing for public repos; site URL unchanged; exposes source code). The check-run annotation reads exactly: *"The job was not started because recent account payments have failed or your spending limit needs to be increased."*

2. **After billing restored**: Fire deploy + verify production catch-up:
   ```
   gh workflow run "Deploy to GitHub Pages" --ref master
   gh run watch <new-id> --exit-status
   curl -sI https://spark-online.space/  # Last-Modified must be past 2026-05-16
   ```
   First successful deploy will jump production from S36-era → S40-current in one ~45s run (S37 + S38 + S39 + S40 changes all bundled in master HEAD).

3. **Then S35-P11 2-peer 1v1 smoke** (still pending since S35 P0 — now covers S35 deadlock fix + S36 animation + S37 audio + S38 audit hardening + S39 lobby-exit + S39 cursor alignment + S40 deploy pipeline robustness in one playtest)
   - Hard-refresh `https://spark-online.space/?debug=1` on 2 devices (Ctrl+Shift+R)
   - Host clicks Begin → peer should transition to PLAYING within ~200ms RTT
   - Lobby diagnostic strip (S39) shows `sync N/T seq=K kind=X applyErr=J gs=LOBBY` while waiting, disappears on PLAYING
   - Drag attract-mode to all 4 viewport corners — cursor↔avatar should align (no ±72 CSS-px drift)
   - If anything fails: diagnostic strip text is ground truth, open BUG-A2 PDR with it (not S39 re-conjecture)

4. **vite/vitest major bump** dedicated session — closes 2 moderate dev-server CVEs (carry-forward from S37)

5. **main.ts hypertrophy refactor** — extract netMessageRouter / godlyMatcher / cinematicStateMachine / teardownNet (multi-priority Standard batch)

6. **S37 carry**: P8 FWOOSH SFX, P9 crystal-crown sprite, S38 stretch polish; S38 carry: per-symbol triage of 42 knip-unused exports

## Blockers

- **🔴 GitHub billing** (user-side, ONLY blocker to actually shipping fixes that have been queued for 7 days). User MUST resolve at github.com/settings/billing before next session can verify S39 + S40 in production.
- 2-peer 1v1 smoke gated on (1) above + 2 humans + deployed code.

## Pending Backlog (older carry-forward, not blocked on billing)
- [ ] vite/vitest CVE major bump (regression risk → dedicated session)
- [ ] main.ts hypertrophy refactor (multi-priority Standard batch)
- [ ] Continue-UI product decision on `loadFromLocalStorage` (or downgrade to test-only export)
- [ ] Per-symbol triage of 42 knip-flagged unused exports (5-10 per session pattern)
- [ ] PRIME-AUDIT Δ7 (S36 deferred): re-compress voltkin-zap.png from WINNER source if user notices style drift
- [ ] D9 rollback ladder if S37 charge SFX subjectively grates: waveform swap → recorded sample → gain reduction
- [ ] S38 audit Pass-3 candidates (per AUDIT.md): all from Pass 2 carry/new — see findings.2.json for IDs

## What Claude resolved this session (permanent)
- ✅ **Phantom github-pages deployment cleared**: deployment record `4716837489` (sha `1be5fce`, May 17) was stuck in `state: waiting` for 7 days holding the github-pages env's deployment-concurrency lock. Cleared via `POST .../deployments/{id}/statuses {state:inactive}` + `DELETE .../deployments/{id}`. Won't recur; if a similar phantom forms in the future, the diagnosis path is documented in S40 reflexion entries.
- ✅ **deploy.yml paths filter shipped** (commit `f6cf27c`): triggers now restricted to `src/`, `public/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `package*.json`, `.github/workflows/deploy.yml`. Session-bookkeeping commits (close, handoff, state-autocommit) no longer trigger deploys — eliminates the chronic cascade-cancel pattern. Empirically verified: this session's close push did NOT trigger a deploy attempt.
- ✅ **Concurrency group renamed** `pages` → `pages-deploy` (defensive against any stuck workflow-level state on the old group name).

## Recent Reflexion (last 2 sessions)

### 2026-05-24 — Session 40 (Deploy pipeline unblock + 1v1 production verification; commit f6cf27c; user-side billing block uncovered)
- #deploy-claims-need-live-url-head-verifies-not-just-tests-green: 759/759 tests green at S39 close didn't catch that production was on S36-era code. Constitutional add to Rule 21: production-deploy claim is a state-discovery item. `curl -sI <live-url>` + bundle commit-SHA grep are the standard probes.
- #phantom-deployment-state-waiting-as-multi-day-concurrency-lock: github-pages env uses deployment-LEVEL concurrency that overrides workflow `cancel-in-progress: false`. Diagnosis: `gh api .../deployments/{id}/statuses` returning only `waiting`/`queued`/`in_progress`. Fix: POST `state: inactive` then DELETE.
- #actions-billing-failure-presents-as-2-second-job-failure-with-empty-runner: Signature = `started_at` set, `runner_name: ""`, `steps: []`, ~2s `completed_at`, `failure`. `gh run view --log-failed` returns "log not found." Real diagnosis is `gh api .../check-runs/{job_id}/annotations`. Never trust `conclusion: failure` alone for empty-runner jobs.
- #path-filter-beats-skip-commit-flag-for-doc-deploy-suppression: Structural filter > convention. Author discipline isn't required. Path list must mirror exact build inputs.
- #compound-deploy-failures-need-empirical-layer-strip-not-conjecture-of-single-cause: 3 distinct failure modes were compounding. Each had its own state machine. Strip layers via API ladder (deployments → workflow_runs → jobs → check-runs/annotations).
- SESSION #s40-deploy-pipeline-bug-stats: 1 source-affecting commit (`f6cf27c` deploy.yml +27/-2). 1 close commit (`50008a6` reflexion + PDR archive). ~25 gh API probes for diagnosis. Bundle untouched. Tests untouched.

### 2026-05-23 — Session 39 (Live 1v1 BUG-A peer-lobby-stuck + BUG-B cursor↔avatar drift; commit f8d237a)
- #runtime-only-bug-needs-runtime-verification-not-just-unit-tests: 745/745 tests passed at S38 close yet BUG-A was live regression. Standard/Full-tier PDRs touching wire-protocol code MUST include "live boot + 1 wire round-trip" verification or explicit deferral with BLOCKER surface.
- #dedicated-control-signals-decouple-state-transitions-from-snapshot-reliability: new START_GAME_SIGNAL envelope is independent of NETSNAPSHOT. Pattern carry-forward: any critical FSM transition (RECONNECT, MATCH_END, FORFEIT) should ride a dedicated signal, not be inferred from the next data payload.
- #visible-to-user-diagnostics-over-debug-flag-required: lobby diagnostic strip surfaces sync N/T seq=K kind=X applyErr=J gs=LOBBY. Any silent-drop path should pair with counter increment + UI-visible exposure (~50 LOC total).
- #object-fit-contain-letterbox-coordinate-mapping-trap: non-uniform sx/sy gives correct answer only at canvas center; wrong at edges under any aspect ≠ canvas aspect. Codify single canonical canvas↔CSS helper; all call sites import it.
- #wire-protocol-handler-idempotence-via-state-gate: any handler whose action RE-INITIALIZES state (vs incrementally updates) should gate on current state. 6-char fix prevents whole class of late/dup signal regressions.
- SESSION #s39-bugfix-batch-stats: 1 commit f8d237a (close 9d2e600). 9 files / +520/-27. Tests 745→759 (+14). Bundle 472.47→474.26 KB. Highest user-value session since S35 P0.
