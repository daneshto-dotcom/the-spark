# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-13 | Session: S143 | Commit: `d19618a` | Branch: master | PROTOCOL_VERSION: **20**

**S143 closed all three measured gates on the sim-worker default-on flip. The flip is STILL NOT
TAKEN — deliberately — but it is now a ONE-CONSTANT change: `WORKER_DEFAULT_ON` in
`src/workerFlag.ts`. The 3-week "intermittent" CI red is fixed and PROVEN with two consecutive
green gating runs.**

Deploy verified 4/4 (`index-BY0XKCq3.js`). tsc 0 · vitest **2304/2304** (153 files, was 2275/150) ·
e2e:gating **36/36** · mutation matrix **7/7** · bundle 678.2 KiB (71.8 KiB headroom) ·
**no protocol bump** (still 20) · MCV 26/26 · Rule 22: 14/14 cited symbols verified on disk.

## ⭐ THE 3-WEEK CI RED WAS NEVER A THROUGHPUT QUESTION

It was on record as *"CI throughput **or** a real stall — UNRESOLVED"*. **Neither.** It was
**three defects in one assertion**, and the headline one **no timeout, retry or faster runner
could ever have fixed**:

1. `primitives.length > sampleA` is a strict-increase test on a **counter that FALLS** — razing
   deletes primitives and MID bots sever deliberately (severChance 0.25). A real CI attempt
   sampled **33** and failed at **32**. **Unsatisfiable by construction.** Measured locally in one
   run: 29 primitives alive, max id 38.
2. A **wall-clock budget on a sim-time quantity**. Ticks are frame-bound (≤3 per rendered frame),
   so 60 s buys ~1530 ticks locally and **~670** in CI.
3. **The error message could not tell those apart** — which is exactly why it survived three
   sessions of investigation.

## ⭐ TWO DEFECTS FOUND EN ROUTE THAT WERE IN NO DOCUMENT

- **The migration successor's INTENT arm bypassed the worker route entirely.** Correct *today only
  by accident* (a promoted host's driver is null). Under default-on it would write every remote
  player's action into a render **MIRROR**, silently overwritten by the next snapshot — **every
  other peer's input stops counting, with no error anywhere.**
- **The driver had NO watchdog.** `failed` was set only by an explicit error event, so a worker
  hanging *without throwing* froze the game permanently — and the direct-sim fallback could never
  fire, because the only thing that arms it is the flag a silent hang cannot set.

## WHAT TO DO NEXT

1. **PLAYTEST — still the only thing genuinely waiting on you.** Stink Tower (recipe shapes remain
   a *Claude* ruling — retune is one edit), the gatherer order queue, and the S139 goblin
   (permanent ~120 px roaming vision source that renders above fog — **still unruled**).
   ⭐ **Do NOT do the 2-browser HELLO check** — the `e2e-protocol` GATING lane does it (~11 s).
2. **The flip is one constant now.** Two things gate it: seed `defenders` in the differential
   harness (below), and one owner playtest on `?worker=1` after S143's changes.
3. **Seed `defenders`** — the last real hole, ~2–4 h. It is NOT a one-line intent: `hostTick`
   re-validates every defender each tick and tears an injected one down within a tick, so the
   fixture must build **real stinkTower recipe geometry** (3 Circles bonded to 1 Square).
4. **`gh workflow run e2e.yml` at boot** — `e2e.yml` still has no push trigger, so nothing else
   reports the gating lane.
5. **Next roadmap slot is V6-1.5 (the hero unit), Full.** ⚠ Strategically: **V6-1.7 is a designed
   STOP SIGN** ("is the player bored?") two slots away, and *everything in Phases 2–4 is
   provisional until it runs*.

## ⚠ TRAPS

- **`nextPrimitiveId` is HOST-ONLY and FROZEN on a `?worker=1` mirror** — excluded from
  NetSnapshot. It looks exactly like the cumulative-placement counter you want. An oracle built on
  it reports "no placements ever happened" with total confidence while the game builds normally
  (measured: cursor 33 vs a live primitive with id 38). **Use `maxPrimitiveId`.** I shipped this
  mistake for one iteration.
- **A run-level `cancelled` can hide TWO GREEN gating jobs.** Dispatching a second e2e run cancels
  the first; the run-level conclusion reads `cancelled` even when `e2e` and `e2e-protocol` had
  already concluded **success** (run 31737846412). S126's lesson was that `cancelled` can hide a
  FAILURE; this is the mirror image. **Audit JOB conclusions, never the run conclusion.** Also:
  `gh run view --log-failed` refuses to serve logs while any job is still in progress, so a red
  gating job is unreadable until the 25-minute soak lane finishes.
- **Never edit sources while their suite runs.** A gating run reported 4 failures purely because I
  edited `src/` mid-run against a live vite dev server. The clean rerun was 36/36. I nearly
  attributed 3 phantom regressions to my own correct changes.
- **An aggregate assertion proves nothing about any member.** The differential guard was a SUM of
  10 family sizes; `defenders` was 0 for all 300 frames while it sat green on poops.
- **Mutation-test the guard, not just the code.** My fix for a documented "unforced site" was
  itself unforced — deleting both terms left the whole suite green.
- **Cap the A.0 fan-out at 3 agents.** 3/3 returned this session; three prior sessions lost work.
- **Rebuild before `verify-deploy`.**
- ⛔ **RUN THE `/handoff` SKILL — never hand-author these docs** (S140–S142 all lost reflexion
  entries this way; S143 ran the skill and STEP 2.8.A appended 11 real entries).

## Pending Backlog

18 entries in `session-state.json → carry_forward` (3 added this session). Live: seed `defenders`;
the `nextPrimitiveId` mirror trap; the `cancelled`-hides-a-PASS finding; ~8 genuinely failing
joiner tests in the quarantine lane; the deferred ranged goblin / producer towers; and the
owner-gated set below.

## Blockers (owner-gated — only you can rule these)

1. ⚠ **`CASTLE_BANK_CAP` 7 vs 12–13 — two of your own rulings point OPPOSITE ways.** At 12–13 all
   six recipes become directly assemblable, deleting the carve-down tactic the pivot exists to protect.
2. **R7 design library is not implementable as ruled** (per-browser localStorage cannot satisfy its
   own host-validation contract). A design decision, not an implementation task.
3. **Energy vs score as the currency** (V6-1.6) — score is already spendable; `player.energy` has
   *zero reads*.
4. **The S139 goblin** — renders above fog + permanent vision source. Unruled.
5. **Stink Tower recipe shapes** — a Claude ruling awaiting your blessing or retune.
6. **Q6 bot starvation policy** — last open bot question.
7. Standing: `origin/gh-pages` deletion · Pages `build_type` flip.

## Recent Reflexion (last 2 sessions)

### S143 (2026-08-13)
`#three-sessions-called-it-throughput-and-it-was-an-unsatisfiable-assertion` ·
`#the-error-message-is-why-it-stayed-unresolved-for-three-sessions` ·
`#my-own-new-diagnostic-confidently-asserted-a-product-failure-that-did-not-exist` ·
`#the-guard-asked-about-a-url-spelling-not-the-state-it-guarded` ·
`#the-second-path-was-correct-only-by-accident` ·
`#the-only-thing-that-arms-the-fallback-was-the-flag-a-hang-cannot-set` ·
`#a-sum-cannot-see-a-per-family-hole` · `#my-own-new-guard-caught-my-own-first-version-of-it` ·
`#the-fix-for-an-unforced-site-was-itself-unforced` ·
`#i-invalidated-my-own-test-run-by-editing-source-during-it` ·
`SESSION #verify-the-probe-before-you-act-on-it`

### S142 (2026-08-13)
`#a0-killed-the-headline-priority-and-that-was-the-win` ·
`#both-seats-proposed-a-broken-fix-again-third-session-running` ·
`#a-reviewer-asserted-it-had-searched-and-had-not` · `#i-had-to-refute-my-own-pdr` ·
`#the-owner-was-doing-a-chore-ci-already-performed` ·
`#fully-red-was-half-green-in-both-environments` ·
`#the-instrument-was-hiding-its-own-diagnosis` ·
`#the-gating-lane-was-red-on-clean-master-and-nothing-reported-it` ·
`#the-generalised-method-found-a-second-bug-the-specific-fix-would-have-missed` ·
`#cap-the-fan-out-third-consecutive-session`

## Process deviations (S143)

- **I invalidated my own gating run** by editing `src/state/workerSim.ts` while it executed against
  a live vite dev server (including a window where a function was referenced before it existed).
  Reported 4 failures; the clean rerun was 36/36. Cost: one wasted 3-minute run and a near-miss on
  misattributing 3 phantom regressions.
- **Three self-corrections were caught by instruments written minutes earlier** — the frozen-cursor
  oracle, the final-frame seeding table, and the decorative signature fix. All three are recorded
  in the reflexion log rather than quietly fixed.
