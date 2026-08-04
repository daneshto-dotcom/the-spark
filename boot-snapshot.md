# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-03 | Session: S130 (V6-0.3 Commit A shipped; Commit B held at playtest)

## ⛔ TWO OWNER ACTIONS STILL GATE EVERYTHING
**1. 17 COMMITS UNPUSHED.** Diagnosis REFINED this session: the READ credential is healthy
(`git ls-remote origin` exits 0, remote master = `f0b8144`), but **WRITE auth is absent** —
`git push --dry-run` asks for a username and then times out. So "the token is dead" was half right.
Owner: `gh auth login -h github.com`, then `git push origin master && git push origin v0.5.2-pre-pivot`.
⚠ That push **fires a production deploy** (src/ touched). It also blocks the Pages `build_type` flip
and CI dispatch — **the e2e lane has not run since S127**.
⛑ Measure unpushed with `git rev-list --count origin/master..master` (= **17**).
**NOT** `git log master..origin/master`, which tests the wrong direction and prints 0.

**2. THE PROBE PLAYTEST GATES ALL OF PHASE 1.** Owner confirmed S130: **not yet run.**
`npm run dev -- --port $SESSION_PORT` → `/?probe=1&regime=new&slots=8`. Keys `[` regime · `]` slots ·
`1`-`6` stock · `Q` draw · `\` reset · `&spawn=N`. Do NOT open V6-1.3/V6-1.4 before B3/B4 are ruled.
Falsification (still carving at 8 slots) is STRONG; confirmation is WEAK.

## STATE
tsc 0 · vitest **1941/1941** (128 files) · bundle **642.6/750 KiB** entry (+218 B measured this
session; 107.4 KiB headroom — note the BACKLOG gate paragraph still says 640.8/109.2) ·
PROTOCOL_VERSION **15** (no bump; ruled) · HEAD `5c45dd6` · master · **MCV exit 0** (8/8 bindings) ·
review gate APPROVED. Live site unchanged — no deploy since S127.
⚠ **NO CI JOB RUNS vitest OR typecheck** — zero hits across `.github/workflows/`. `deploy.yml`'s only
verification is `npm run build`. Every "tsc 0 / 1941 passing" figure is LOCAL and self-reported.
⚠ `npm test` is bare `vitest` = **watch mode, hangs the session**. Use `npx vitest run`.

## Next Steps
1. **OWNER: playtest Commit A's banner.** `npm run dev -- --port $SESSION_PORT`, bots mode, cross 500.
   It now fires at top-centre **y=34**, under `Combos N/14`. I proved it renders + holds by pumping
   `app.ticker.update()`; **placement and legibility are UNVERIFIED** (a hidden pane's GL context
   produces no frames, so no pixels). Judge collision with the combos counter and legibility in the
   ~2 s hold. **This is the checkpoint Commit B is held behind.**
2. **OWNER:** `gh auth login` + push (see above).
3. **P1b — V6-0.3 Commit B, sever attribution. FULLY SPECCED, DO NOT RE-DERIVE.** Read
   `.claude/plans-archive/2026-08-03_PDR_S130_V6-0.3_Learnability_II.md` §2 rows 2-8 and §8 rulings.
   Key facts already settled: **NO PROTOCOL_VERSION bump** (3 verified grounds) · **TWO** additive-
   optional fields, actor **and** victim (an actor id alone cannot answer "am I the victim?") ·
   victim = `primA.placedBy` **always, all 7 causes** (`primitive.ts:28`, immutable; the repo already
   derives bond victims this way at `creatureAI.ts:222` / `creatureLifecycle.ts:207-216`) · **FOUR**
   coordinated wire sites, no spreads, or the field silently never reaches the wire · `'physics'`
   **NEVER** populated (`physicsLoop.ts:171-181` passes a hardcoded `asPlayerId(0)`) · `'godly'`
   omitted + a **tolerant default**, never an exhaustive switch (it is in the effect union but not the
   action union) · suppression is **two** clauses (`actor===victim`; `cause==='bomb'` unconditionally —
   NOT redundant: `bombLifecycle.ts:110` selects on mutable `placerColor` while suppression compares
   readonly `placedBy`) · copy is **seat-based** via the existing tested `avatarNameplateText`, never
   colour names (the rainbow shuffle remaps colours mid-match) · the new drain goes **ABOVE**
   `main.ts:2495`'s `effectsRenderer.sync`.
4. **P2 — CI carrier** (owner-ruled, Rule 16 amendment): gating `vitest` + `typecheck` step in
   `deploy.yml`. A red test will then block a master-push deploy. Not exercisable until the push lands.
5. Parked CI ×4 — the soak-threshold item needed the **Mon 2026-08-03 07:00 UTC** cron sample, still
   unreadable while write auth is down. Do NOT decide it on n=3-4.

## Blockers
- Push + playtest (above). No technical blockers in the code.
- **V6-2.1 (R6) — RULED S130:** owner chose **insert a structure-HP slot BEFORE V6-2.1**. 3 of 5
  targeting priorities currently have no damageable target (`DEFENDER_HP` is a 1e9 sentinel,
  `CreatureSpawner` has no hp field, the only damage fn is `damageCreature`). Adds a Phase-2 slot.
- **V6-1.5 mis-tiered Standard→Full (R7):** deleting `CarryingPlayer` silently changes shipped hazard
  rules. Unchanged from S129.
- **Tier banner is still SOLO/BOTS-ONLY.** `SCORE_TIER` is host-local (`serializeEffect` returns null,
  `save.ts:1400`), so a 1v1 joiner never sees it. Putting the kind on the wire = a new serialized
  literal in the S110 `'WALK'` bump class. Logged, not silently dropped.

## Pending Backlog
- **P1b V6-0.3 Commit B** (specced, not started) · **P2 CI carrier** (not started).
- **PARKED CI ×4:** soak window/threshold (needs the cron sample) · worker-isolate ceiling 10MB→~3MB
  (BLOCKED: `readWorkerFloorMB()` is a single read at `worker-heap.spec.ts:182`, outside the
  stabilization loop at `:174-181`) · Playwright `deviceScaleFactor` lever · `e2e/**` outside tsconfig.
- **23 risks R1–R23** bound to their V6 slots. Earliest-biting: **R1** `stateHash.ts:45-48` omits every
  entity family · **R5** `WIN_TRIGGER` destroys 7 entity families at t=0 · **R10** the r=188 shrink
  hard-fails `collision.pile.test.ts` · **R12** delta encoding is Phase-1-adjacent, not V6-4.2 cleanup.
- **NEW S130 carry-forwards:** per-seat synced carrier for networked sever attribution (the scalar
  `solvedBy`/`comboToastTick` form is **architecturally unfit** — a sever is high-frequency and
  per-victim, so a global scalar is clobbered within one frame's ≤3-tick drain) · `scoring.ts:99`'s
  single-owner victim rule **expires when Steal lands** (its own docblock says so; Steal is Phase 2) ·
  the bomb "show self-harm" copy variant (one-line flip after playtest) · `e2e/smoke.spec.ts:637`
  asserts `v9` while PROTOCOL_VERSION is 15, in a non-gating quarantine lane · the R11 byte guard runs
  on a ZERO-effects fixture so it is blind to effects payload · `BACKLOG:518-521`'s claimed
  `// V6-RISK(Rn):` code anchors **do not exist** (one hit, and it is a B3 marker).
- **THREE approval-handshake bugs found S130** (OS-scale, deliberately untouched): dotted priority ids
  fail `validate_priority_id` so the mint is skipped · the mint `sub()`s an EXISTING key and cannot
  insert one, yet the hook prints "Cleared … Edits permitted" **unconditionally** · `glue_pdr_unlock`
  writes `priority_state='unlocked'` but `pdca-final-gate.sh:82` accepts only
  `approved|in_progress|completed`. Workaround: dot-free ids + pre-staged placeholder keys.

## CRITICAL TRAPS
- **A green suite does not mean the feature runs.** V6-0.2 shipped a banner that never rendered once;
  its tests pinned every pure helper AROUND the defect while the defect was a call-site ORDERING fact.
  New guard: `src/render/ui.drainOrder.test.ts` (source-order lock + order-sensitivity), and it was
  **mutation-tested** — moving the drain below the wipe makes it fail.
- **A hidden Browser pane pauses rAF — but NOT the ticker itself.** `app.ticker.update(now)` pumps the
  real frame callback in production order with no rAF. Two sessions accepted "the visual cannot be
  verified"; the truly blocked layer is only PIXEL output. Re-derive WHICH layer is blocked.
- **A control that reports success may not have acted.** `glue_pdr_unlock` printed "Edits permitted"
  while its mint had silently no-opped. Read the STATE back, never trust the announcement.
- **When a gate blocks, ask whether it caught a real misstatement** before working around it. MCV's
  hard-fail was fixed by making the bookkeeping match reality (splitting a half-done priority), not by
  marking unfinished work complete.
- **Backticks in a bash-embedded payload get command-substituted.** Hit 3×. Use a script FILE or
  `commit -F`. A success count from your own script is NOT verification — grep the result.
- **A pipeline's exit status tests the LAST command.** Hit 2×. Emit a NUMBER, or use `${PIPESTATUS[0]}`.
- `git push` on master IS a production deploy · never trust `gh api .../pages` (stale legacy/gh-pages) —
  trust the deployments API + live asset hash · `npm run deploy` / `scripts/deploy-pages.sh` are
  DELETED, do not recreate · `e2e/**` is NOT type-checked → `npx playwright test <spec> --list` ·
  MCV needs an ABSOLUTE-path `verification[]` binding on a **completed** priority for `BACKLOG.md`
  (bindings on in_progress priorities are IGNORED — `verify-session-claims.py:289`).

## Recent Reflexion (S130 + S129)
- **S130 #test-the-call-site-not-only-the-arithmetic** — extracting logic into pure functions verifies
  the LOGIC, not the WIRING; those fail differently. When the untestable part decides whether the
  feature runs at all, build a seam that makes the wiring assertable.
- **S130 #a-guard-that-only-passes-has-not-been-tested** — an assertion that can never fail is
  indistinguishable from one that always passes. Mutate the source and watch the guard fail.
- **S130 #a-blocked-verification-path-may-have-a-side-door** — rAF is the ticker's DRIVER, not the
  ticker. The recorded blocker was one layer away from the layer that mattered.
- **S130 #a-gate-that-lies-about-unlocking-is-worse-than-one-that-fails** — three handshake bugs; the
  dangerous one announced success while doing nothing.
- **S130 #do-not-satisfy-a-checker-by-making-a-false-claim** — the fast MCV fix was a lie; the honest
  fix was noticing the record didn't match reality.
- **S129 #probe-the-slot-before-believing-the-roadmap-s-estimate-of-it** — a slot's SIZE is a claim
  about external state; Rule 21 applies. Let scope shrink rather than padding to fit the plan.
- **S129 #verify-the-reviewer-s-MECHANISM-not-just-its-conclusion** — now 4 sessions running. In S130's
  A.0, 4 of 6 probe mechanisms were refuted by their auditors while conclusions largely survived.
