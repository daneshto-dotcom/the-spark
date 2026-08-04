# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-04 | Session: S131 (V6-0.3 CLOSED end-to-end + CI carrier + plates + Triumvirate CHECK)

## ⛔ ONE OWNER ACTION GATES EVERYTHING — AND IT GREW
**30 COMMITS UNPUSHED.** Diagnosis unchanged and re-verified S131: READ auth is healthy
(`git ls-remote origin -h refs/heads/master` exits **0**, so the count is EXACT, not a lower bound),
but **WRITE auth is absent** — `gh auth status` says "The token in default is invalid".
Owner: `gh auth login -h github.com`, then `git push origin master && git push origin v0.5.2-pre-pivot`.
⚠ That push fires a production deploy (src/ touched) **and is the only way to learn whether S131's new
CI gate works** — `deploy.yml` has never executed with it. It also unblocks the Pages `build_type` flip
and CI dispatch; the e2e lane has not run since S127.
⛑ Measure with `git rev-list --count origin/master..master` (= **30**). **NOT** `git log master..origin/master`,
which tests the wrong direction and prints 0.

## STATE
tsc 0 · vitest **1990/1990** (130 files; was 1941/128 at S131 boot) · bundle **645.5/750 KiB** entry
(+2.9 KiB measured this session, 104.5 KiB headroom) · PROTOCOL_VERSION **15** (no bump; ruled twice) ·
**MCV exit 0** (38 bindings, 4 priorities, 0 unbound) · gitleaks 8.30.1 clean (8 commits + working tree) ·
review gate APPROVED by owner. HEAD `7217a1f`+ (handoff commits follow — check `git log -1`).
Live site unchanged — no deploy since S127.
✅ **CI NOW GATES THE SUITE** — `deploy.yml` runs `npm run typecheck` then `npx vitest run` before
`npm run build`, with per-job `timeout-minutes`. **Never executed yet** (no write auth), so it is
STATIC-verified only, and the file says so.
⚠ `npm test` is bare `vitest` = **watch mode, hangs the session**. Use `npx vitest run`. (Fixing the
package.json script is a logged carry-forward.)

## Next Steps
1. **OWNER: `gh auth login -h github.com` + push (30 commits).** Everything below is downstream of it.
2. **OWNER: the probe playtest — STILL NOT RUN.** It gates ALL of Phase 1 (B3 + B4).
   `npm run dev -- --port $SESSION_PORT` → `/?probe=1&regime=new&slots=8`. Keys `[` regime · `]` slots ·
   `1`-`6` stock · `Q` draw · `\` reset · `&spawn=N`. Do NOT open V6-1.3/V6-1.4 before B3/B4 are ruled.
   Falsification (still carving at 8 slots) is STRONG; confirmation is WEAK.
3. **After the push lands: confirm the new CI gate actually ran.** `gh run list --workflow=deploy.yml`.
   ⚠ Audit run CONCLUSIONS, not just the absence of failure mail — a timeout-killed job reports
   `cancelled`, not `failure`, and vitest has no global-suite-timeout to sit below the job timeout the
   way `PW_GLOBAL_TIMEOUT_MIN` does for Playwright.
4. **Next V6 slot** — V6-0.3 is fully CLOSED (both commits + both doc items). Pick from BACKLOG V6-x.y;
   V6-1.x is gated on step 2. **V6-2.1 needs a structure-HP slot inserted BEFORE it** (owner-ruled S130).
5. **P2-18** `'godly'` union cleanup, and the `package.json` bare-`vitest` fix — both small, both logged.

## Blockers
- Push + the probe playtest (above). No technical blockers in the code.
- **V6-2.1 (R6) — RULED S130:** owner chose **insert a structure-HP slot BEFORE V6-2.1**. 3 of 5
  targeting priorities have no damageable target (`DEFENDER_HP` is a 1e9 sentinel, `CreatureSpawner`
  has no hp field, the only damage fn is `damageCreature`). Adds a Phase-2 slot.
- **V6-1.5 mis-tiered Standard→Full (R7):** deleting `CarryingPlayer` silently changes shipped hazard
  rules. Unchanged since S129.
- **Tier banner + sever toast are SOLO/BOTS-ONLY in practice.** `SCORE_TIER` is host-local
  (`serializeEffect` returns null, `save.ts`), so a 1v1 joiner never sees the banner. The sever toast
  IS on the wire but reaches a remote victim only **~1/6** of the time (one-frame effect vs 6-tick
  snapshot cadence); **100% on the host**. Both ruled and named in-code, not silent.

## Pending Backlog
- **PARKED CI ×4:** soak window/threshold (needs the Mon 07:00 UTC cron sample — still unreadable while
  write auth is down; do NOT decide it on n=3-4) · worker-isolate ceiling 10MB→~3MB (BLOCKED:
  `readWorkerFloorMB()` is a single read at `worker-heap.spec.ts:182`, outside the stabilization loop at
  `:174-181`) · Playwright `deviceScaleFactor` lever · `e2e/**` outside tsconfig.
- **23 risks R1–R23** bound to their V6 slots. Earliest-biting: **R1** `stateHash.ts:45-48` omits every
  entity family · **R5** `WIN_TRIGGER` destroys 7 entity families at t=0 · **R10** the r=188 shrink
  hard-fails `collision.pile.test.ts` · **R12** delta encoding is Phase-1-adjacent, not V6-4.2 cleanup.
- **CARRY-FORWARDS (S130 + S131):** per-seat synced carrier for networked sever attribution (the scalar
  `solvedBy`/`comboToastTick` form is **architecturally unfit** — a sever is high-frequency and
  per-victim, so a global scalar is clobbered within one frame's ≤3-tick drain; needs a 6-slot array) ·
  `scoring.ts:99`'s single-owner victim rule **EXPIRES WHEN STEAL LANDS** (its own docblock says so;
  Steal is Phase 2) · the bomb "show self-harm" copy variant (one-line flip) · `package.json`'s bare
  `vitest` watch-mode trap · `e2e/smoke.spec.ts:637` asserts `v9` while PROTOCOL_VERSION is 15, in a
  non-gating quarantine lane · `BACKLOG:518-521`'s claimed `// V6-RISK(Rn):` code anchors **do not exist**.
- **THREE approval-handshake bugs (OS-scale, deliberately untouched):** dotted priority ids fail
  `validate_priority_id` so the mint is skipped · the mint `sub()`s an EXISTING key and cannot insert
  one, yet prints "Cleared … Edits permitted" **unconditionally** · `glue_pdr_unlock` writes
  `priority_state='unlocked'` but `pdca-final-gate.sh:82` accepts only `approved|in_progress|completed`.
  Workaround: dot-free ids + pre-staged placeholder keys. Both worked again this session.
- **Remote branches needing owner action:** `origin/claude/spark-game-state-analysis-a3ot8i` (no local
  counterpart) and `origin/gh-pages` (legacy — the deploy path is Actions-artifact-only). Neither can be
  deleted without write auth, and `gh-pages` deletion is the owner's call.

## CRITICAL TRAPS
- **A GREEN SUITE PROVES NOTHING UNTIL YOU DELETE THE CODE AND WATCH IT FAIL.** S131's CHECK broke
  **4 of the guards written that same session** by deleting 1-2 lines each, suite green every time.
  Mutation-test EVERY new assertion; there is no intuition for which one is vacuous.
- **`indexOf` over source text matches your own COMMENTS.** The drain-order guard (which exists solely
  to prevent the V6-0.2 defect) could be blinded by adding `(world)` to a comment. Now pinned with an
  occurrence count of exactly 1 per consumer. Same class killed a CI assertion — assert on EXTRACTED
  commands, never raw file text.
- **A blocked verification path usually has a side door one layer over.** Two sessions recorded the HUD
  visual as unverifiable because the Browser pane will not composite. The blocked layer was the PANE:
  headless Chromium via the project's own `playwright` composites fine. `PW_ENTRY` + a scratchpad
  `.mjs` driving `__SPARK__` is the whole recipe; scripts are in the S131 scratchpad.
- **Drive the real emitter, never a lookalike payload.** Set the leader's score to `SCORE_TIER_STEP-1`
  and let `scoring.ts:301` fire; dispatch a real `SEVER_BOND` via `__SPARK__.controls.dispatchFn` (TS
  `private` is compile-time only). A synthetic payload verifies the consumer and assumes the producer.
- **A frame count is not a duration.** `TIER_BANNER_FRAMES=120` is ~2.0s at 60Hz but ~0.83s at 144Hz —
  nothing caps the Pixi ticker. The sever toast holds in SIM TICKS for exactly this reason.
- **When a detector returns all-negative, suspect the DETECTOR.** A yellow-pixel check reported zero
  banner hits across a whole sweep because that run's leader was cyan (the fill is the leader's colour).
- **Read the reasoning of REFUTED findings.** S131's best correction came from a finding that was
  refuted: it proved my conclusion right and my stated mechanism wrong.
- **`git push` on master IS a production deploy** · never trust `gh api .../pages` (stale
  legacy/gh-pages) — trust the deployments API + live asset hash · `npm run deploy` /
  `scripts/deploy-pages.sh` are DELETED, do not recreate · `e2e/**` is NOT type-checked →
  `npx playwright test <spec> --list` · MCV needs an ABSOLUTE-path `verification[]` binding on a
  **completed** priority for `BACKLOG.md` (bindings on in_progress priorities are IGNORED) · backticks
  in a bash-embedded payload get command-substituted and heredocs choke on apostrophes — **use a script
  FILE** · a pipeline's exit status tests the LAST command, use `${PIPESTATUS[0]}`.

## Recent Reflexion (S131 + S130)
- **S131 #four-of-my-own-guards-were-vacuous-and-only-mutation-testing-found-it** — writing a test after
  fixing a bug is not the same as proving it would have caught the bug.
- **S131 #indexOf-over-source-text-matches-your-own-comments** — and I had fixed that exact class in
  another file the same hour without sweeping for siblings.
- **S131 #a-refutation-that-fails-can-still-correct-you** — a true conclusion resting on a false
  mechanism is how the next session gets misled.
- **S131 #split-a-review-panel-by-what-each-leg-can-actually-verify** — internal agents that can open
  files found 4 surviving mutations by RUNNING them; external models took design questions.
- **S131 #a-blocked-verification-path-usually-has-a-side-door-one-layer-over** · **#drive-the-real-
  emitter-not-a-lookalike-payload** · **#a-detector-can-fail-on-a-property-you-forgot-varies** ·
  **#a-fully-specced-plan-still-needs-its-anchors-probed** (3 of this plan's anchors were wrong) ·
  **#a-frame-count-is-not-a-duration** · **#a-plate-must-die-with-its-label** ·
  **#measure-inside-the-hold-not-on-the-edge-of-the-ramp** · **#a-grep-proves-a-string-is-absent-not-a-behaviour**
  (the "no CI runs typecheck" claim was half false — `npm run build` runs `tsc -b`).
- **S130 #test-the-call-site-not-only-the-arithmetic** · **#a-guard-that-only-passes-has-not-been-tested**
  · **#a-gate-that-lies-about-unlocking-is-worse-than-one-that-fails** ·
  **#do-not-satisfy-a-checker-by-making-a-false-claim**.
- **S129 #verify-the-reviewer-s-MECHANISM-not-just-its-conclusion** — now **5 sessions running**, and in
  S131 it applied to my OWN docblock.
