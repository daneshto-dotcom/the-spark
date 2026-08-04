# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-04 | Session: S132 (probe instrument repaired · B3 settled empirically)

## ⛔ TWO OWNER ACTIONS GATE EVERYTHING — AND ONE JUST GOT CHEAPER
**36 COMMITS UNPUSHED.** `gh auth status` still says "The token in default is invalid" — WRITE auth
absent, READ auth healthy (`git ls-remote origin -h refs/heads/master` exits **0**, so the count is
**EXACT, not a lower bound**). Owner: `gh auth login -h github.com`, then
`git push origin master && git push origin v0.5.2-pre-pivot`.
⚠ That push fires a production deploy (src/ touched) **and is still the only way to learn whether
S131's CI gate works** — `deploy.yml` has never executed with it. Fifth session running.
⛑ Measure with `git rev-list --count origin/master..master`. **NOT** `git log master..origin/master`,
which tests the wrong direction and prints 0 while any number sit unpushed — that inversion hid a dead
token for four sessions and reached 48 commits.

## STATE
tsc 0 · vitest **2001/2001** (130 files; was 1990/130 at boot) · bundle **645.5/750 KiB** entry —
**byte-identical hash across the before/after builds** (`index-C4WI_4XB.js`, 661016 B both times),
which is *proof*, not inference, that S132's DEV-only edits ship zero production bytes ·
PROTOCOL_VERSION **15** (no bump; no wire/save surface touched) · **MCV exit 0** · gitleaks 8.30.1
clean (843 commits) · review gate APPROVED by owner. HEAD `603d768`. Live site unchanged since S127.
⚠ `npm test` is bare `vitest` = **watch mode, hangs the session**. Use `npx vitest run`. (Logged
carry-forward, still unfixed.)

## Next Steps
1. **OWNER: `gh auth login -h github.com` + push (36 commits).** Everything deploy-shaped is downstream.
2. **OWNER: THE PROBE PLAYTEST — still not run, but the instrument is now VERIFIED and the recipe is
   FIXED.** It gates ALL of Phase 1 (B3 + B4).
   `npm run dev -- --port 40843` → **`/?probe=1&regime=new&slots=8&spawn=0.03125`**
   ⛑ **`&spawn=0.03125` IS NOT OPTIONAL.** The probe is solo-only by construction, but B3/B4 are
   SIX-SEAT claims, so solo hands the player the WHOLE arena faucet: an 8-slot bank fills in **41 s
   measured** vs **248 s** at a fair 1/6 share. Without the override you test a faucet **6× more
   generous** than B3's condition and would likely rule "starvation isn't real" — wrongly, on seven
   Full-tier slots. `0.03125` = `0.1875 / 6`.
   ✅ **Check the overlay's own verdict line before trusting any reading:**
   `✅ = ONE SEAT of a 6-seat match` (good) vs `⚠ NOT 6-seat-representative … 6.0×` (stop).
   ⏱ **Hold ≥60 s.** The pool mixes on the 10 s TTL; the overlay prints `⚠ ramping (Ns to go)` and
   flips to `✅ past the ramp` when the reading is settled.
   Keys `[` regime · `]` slots · `1`-`6` stock · `Q` draw · `\` reset.
   ⚠ After `[`, **RESTART the match** before judging — the overlay warns when primitives predate the
   counter reset, and carving an old structure gets misattributed to the new regime.
   **The question is B4:** with 8 exact-type slots, do you still build big and carve down to a recipe,
   or assemble the pentagram directly first try? Falsification (still carving) is **STRONG**;
   confirmation is **WEAK** and authorises a second probe, not a redesign. Do NOT open V6-1.3/V6-1.4
   before B3/B4 are ruled.
3. **After the push: `gh run list --workflow=deploy.yml`.** Audit run CONCLUSIONS — a timeout-killed
   job reports `cancelled`, not `failure`, and sends no mail. vitest has no global-suite timeout
   sitting below the job timeout the way `PW_GLOBAL_TIMEOUT_MIN` does for Playwright.
4. **Next V6 slot** — V6-0.3 fully CLOSED. V6-1.x gated on (2). **V6-2.1 needs a structure-HP slot
   inserted BEFORE it** (owner-ruled S130) — that slot is the only substantial V6 work NOT gated on
   the playtest.
5. **Small + logged:** `package.json`'s bare-`vitest` watch trap · P2-18 `'godly'` union cleanup ·
   `e2e/smoke.spec.ts:637` asserts `v9` while PROTOCOL_VERSION is 15 (non-gating quarantine lane) ·
   `BACKLOG:518-521`'s claimed `// V6-RISK(Rn):` code anchors **do not exist**.

## Blockers
- Push + the probe playtest (above). **No technical blockers in the code.**
- **B3's supply side is SETTLED (S132, empirical)** — what remains owner-gated is the DECISION (raise
  λ? re-shape the bank? both?) and all of B4, a human judgment no headless run substitutes for.
- **V6-2.1 (R6) — RULED S130:** insert a structure-HP + `damageEntity` slot BEFORE it. 3 of 5
  targeting priorities have no damageable target (`DEFENDER_HP` is a 1e9 sentinel, `CreatureSpawner`
  has no hp field, the only damage fn is `damageCreature`).
- **V6-1.5 mis-tiered Standard→Full (R7):** deleting `CarryingPlayer` silently changes shipped hazard
  rules. Unchanged since S129.
- **Tier banner + sever toast are SOLO/BOTS-ONLY in practice.** `SCORE_TIER` is host-local
  (`serializeEffect` returns null), so a 1v1 joiner never sees the banner; the sever toast is on the
  wire but reaches a remote victim only **~1/6** of the time (one-frame effect vs 6-tick snapshot
  cadence), **100% on the host**. Both ruled and named in-code.

## Pending Backlog
- **PARKED CI ×4:** soak window/threshold (needs the Mon 07:00 UTC cron sample — unreadable while
  write auth is down; do NOT decide on n=3-4) · worker-isolate ceiling 10MB→~3MB (BLOCKED:
  `readWorkerFloorMB()` is a single read at `worker-heap.spec.ts:182`, outside the stabilization loop
  at `:174-181`) · Playwright `deviceScaleFactor` lever · `e2e/**` outside tsconfig.
- **23 risks R1–R23** bound to their V6 slots. Earliest-biting: **R1** `stateHash.ts:45-48` omits every
  entity family · **R5** `WIN_TRIGGER` destroys 7 entity families at t=0 · **R10** the r=188 shrink
  hard-fails `collision.pile.test.ts` · **R12** delta encoding is Phase-1-adjacent, not V6-4.2 cleanup.
- **CARRY-FORWARDS (S130–S132):** per-seat synced carrier for networked sever attribution (the scalar
  `solvedBy`/`comboToastTick` form is **architecturally unfit** — needs a 6-slot array) ·
  `scoring.ts:99`'s single-owner victim rule **EXPIRES WHEN STEAL LANDS** · the bomb "show self-harm"
  copy variant · `package.json` bare-`vitest` · **NEW S132:** `Q` is genuinely double-bound between the
  probe's draw and `SHRINK_TERRITORY` (`main.ts:888` advertises it) and is held off ONLY by
  `decideKeyShrink` returning false in solo plus the probe's solo-only auto-disarm — **an incidental
  guard, not a deliberate one.** Goes live if the probe gains a bots/networked mode · **NEW S132:**
  `dist/` sourcemaps embed the full TypeScript of every DEV-only module including the probe harness
  (executable is clean, 0 probe identifiers); whether `.map` files are actually deployed was NOT
  investigated.
- **THREE approval-handshake bugs (OS-scale, deliberately untouched):** dotted priority ids fail
  `validate_priority_id` so the mint is skipped · the mint `sub()`s an EXISTING key and cannot insert
  one, yet prints "Edits permitted" **unconditionally** · `glue_pdr_unlock` writes
  `priority_state='unlocked'` but `pdca-final-gate.sh:82` accepts only `approved|in_progress|completed`.
  Workaround: dot-free ids + pre-staged placeholder keys. Both worked again in S132.
- **Remote branches needing owner action:** `origin/claude/spark-game-state-analysis-a3ot8i` (no local
  counterpart) and `origin/gh-pages` (legacy — deploy is Actions-artifact-only). Neither deletable
  without write auth; `gh-pages` deletion is the owner's call.

## CRITICAL TRAPS
- **A GREEN SUITE PROVES NOTHING UNTIL YOU DELETE THE CODE AND WATCH IT FAIL.** S131 broke 4 of 4 of
  its own new guards this way. S132 applied 8 mutations and caught 8 — mutation-test EVERY assertion.
- **AND A GREEN SUITE CANNOT SEE A CLIPPED STRING.** S132 shipped two defects that 2001 passing tests
  could not detect — an overlay clipping at `max-width:44ch` (`white-space:pre` clips, never wraps)
  and a threshold in the wrong units. Every string was CORRECT; the viewport and denominator were
  wrong. **Screenshot the result.** `[data-probe]` / any DOM overlay needs no compositing at all.
- **MEASURE INSIDE THE HOLD, NOT ON THE EDGE OF THE RAMP.** A 10 s-TTL pool needs a ≥60 s hold; a 63 s
  window carries ~6 independent samples. S132 misread λ·W twice (2.73, 12.79 — both artifacts) before
  a tick-locked census showed the model exact. **Measure THROUGHPUT, not the standing pool** — the pool
  is a consequence; throughput is the constraint that governs fill time.
- **ASK WHAT AN INSTRUMENT IS A MEASUREMENT *OF*.** The probe measures accurately and measured the
  WRONG CONDITION (solo, not 6-seat) for four sessions without saying so.
- **A BLOCKED VERIFICATION PATH USUALLY HAS A SIDE DOOR ONE LAYER OVER.** The Browser pane will not
  composite; headless Chromium via the project's own `playwright` does. Recipe: `chromium.launch` with
  `--use-gl=swiftshader`, boot through `__SPARK__.titleScreen.getButtonCenters()`, drive real keydowns.
- **`indexOf` OVER SOURCE TEXT MATCHES YOUR OWN COMMENTS.** S132 nearly pinned a statement-order fix
  with a source assertion its own new comment (which names `shift` four times) would have blinded.
  **Restructure so the bug class is testable instead** — put decision and mutation in one unit.
- **VERIFY THE MECHANISM OF YOUR OWN ALARM.** Three false alarms in S132: a recursive `dist/` grep
  "found" PROBE_SENTINEL (it was a sourcemap's `sourcesContent`; the contract is `dist/assets/*.js`);
  a `| tail` made the review gate's **exit 2 read as 0** (`${PIPESTATUS[0]}`); a `sed`/`grep` anchor
  missed because a PDR status line is **bold** markdown (`**STATUS: …**`), not bare.
- **`git push` on master IS a production deploy** · never trust `gh api .../pages` (stale
  legacy/gh-pages) — trust the deployments API + live asset hash · `npm run deploy` /
  `scripts/deploy-pages.sh` are DELETED, do not recreate · `e2e/**` is NOT type-checked →
  `npx playwright test <spec> --list` · MCV needs an ABSOLUTE-path `verification[]` binding on a
  **completed** priority for `BACKLOG.md` (bindings on in_progress priorities are IGNORED) · dot-free
  priority ids or the unlock mint silently no-ops · **use a script FILE for payloads** — backticks get
  command-substituted and heredocs choke on apostrophes (cost S132 two tool calls) · a pipeline's exit
  status tests the LAST command.
- **`.claude/plans/` IS EPHEMERAL AND CAN LIE.** At S132 boot it held an S131 PDR marked
  `IN-PROGRESS` while `plans-archive/` said `COMPLETED`. **The archive is the source of truth.** S132
  deleted the stale copies; if you see a divergence again, trust the archive.

## Recent Reflexion (S132 + S131)
- **S132 #four-sessions-of-owner-hasnt-run-it-and-nobody-checked-the-instrument** — a gate unmet for
  four sessions is a hypothesis about the OWNER, and it was never tested.
- **S132 #an-instrument-that-cannot-reproduce-its-own-test-condition** · **#a-green-suite-cannot-see-a-
  clipped-string** · **#measure-inside-the-hold-not-on-the-edge-of-the-ramp** (re-learned from this
  repo's own snapshot) · **#restructure-so-the-bug-class-is-testable-rather-than-text-pinned** ·
  **#verify-the-mechanism-of-your-own-alarm** · **#the-guard-that-saves-you-may-be-incidental**.
- **S131 #four-of-my-own-guards-were-vacuous-and-only-mutation-testing-found-it** — writing a test
  after fixing a bug is not the same as proving it would have caught the bug.
- **S131 #a-blocked-verification-path-usually-has-a-side-door-one-layer-over** ·
  **#drive-the-real-emitter-not-a-lookalike-payload** · **#a-detector-can-fail-on-a-property-you-
  forgot-varies** · **#a-frame-count-is-not-a-duration** · **#a-grep-proves-a-string-is-absent-not-a-
  behaviour** · **#a-refutation-that-fails-can-still-correct-you**.
- **#verify-the-reviewer-s-MECHANISM-not-just-its-conclusion** — now **6 sessions running**, and in
  S132 the reviewer was me, three times.
