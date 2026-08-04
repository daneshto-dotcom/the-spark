═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-08-04
Session: S132 — tested the INSTRUMENT instead of asking the owner a fifth time
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK — 6-player FFA geometric-builder duel, mid v0.6 economy pivot
- Working directory: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
- Git branch: `master` (only local branch; no worktrees, no GitButler artifacts)
- Latest commit: `603d768` chore(s132): ANALYZE — calibration + retrospective
- Tech stack: TypeScript · Vite · Pixi v8 · Verlet physics · Trystero/WebRTC · vitest · Playwright
- Codebase: 130 test files / 2001 tests; entry chunk 645.5 KiB

## CURRENT STATE
- Build: **PASSING** — tsc 0, `npm run build` exit 0, bundle 645.5/750 KiB (104.5 KiB headroom)
- Tests: **2001/2001** across 130 files (+11 from the 1990 boot baseline)
- Deployment: **UNCHANGED since S127** — 36 commits unpushed, write auth dead
- PROTOCOL_VERSION: 15 (no bump — no wire/save/stateHash surface touched)
- gitleaks 8.30.1: clean over 843 commits · MCV exit 0 · review gate APPROVED by owner

## SESSION COST
- Model routing data unavailable for this session (`~/.claude/session-model-counts.tmp` empty)
- Context at close: 237,478 / 1,000,000 (23.75% **GREEN**) — never approached YELLOW
- External API: Grok 0 calls ($0.00), Gemini 0 calls ($0.00) — Micro tier, deliberation waived
- Cumulative log: `~/.claude/usage-log.csv`

## THIS SESSION'S WORK

**A.0 STATE-DISCOVERY — drove the V6-0.1 economy probe harness for the first time.** It gates all of
Phase 1 and had been recorded as "blocked on the owner" for four sessions; nobody had checked whether
the instrument worked. Given V6-0.2 shipped a banner that never rendered once and passed CHECK green,
the prior that an unexercised harness works was not high. Driven in headless Chromium via the
project's own `playwright` + swiftshader. Its overlay is a DOM node (`el.textContent`,
`[data-probe]`), **not Pixi**, so B3 needed no compositing at all — the two prior sessions' "HUD
unverifiable" constraint simply did not apply.

**Verdict: the harness works.** Arms on `?probe=1` · sim advances 122 ticks/2 s (61 Hz effective) ·
keys `1`-`6` stock (`8/8 Sqr ×8`) · `Q` draws (Idle → Carrying, so `SPAWN_SPARK`+`PICKUP_SPARK` both
land) · `?spawn=N` reaches `constants.ts` (import order intact at `main.ts:27`).

**B3 IS NOW EMPIRICALLY CONFIRMED** — measured with a tick-locked in-page census, not read off the
overlay: throughput **0.1933/s** vs λ 0.1875 (n=29 / 150 s, Poisson SE 0.036) · free-spark lifetime
**exactly 600 ticks, min = max = 600** (no leak, no jitter) · standing pool **1.81** vs λ·W 1.93, so
Little's Law holds · 8-slot bank at a fair 1/6 share **248 s** vs the backlog's ~256 s ·
`FREE_SPARK_SOFT_CAP = 50` **confirmed unreachable dead code** (pool peaks at 4). **Every B3 number in
the backlog was right.**

**DELTA-1 (shipped fix) — the probe could not reproduce the condition it exists to test.** Solo-only by
construction (`probeHarness.ts:290,342` refuse to draw and auto-disarm on any peer/bot, so the wire is
never touched), yet B3/B4 are six-seat claims. Solo receives the entire arena faucet → an 8-slot bank
fills in **41 s measured** rather than 248 s, a faucet **6× more generous than B3's condition**. The
handoff's playtest URL carried no correction, so a run would very likely have produced "starvation
isn't real" — on seven Full-tier slots. Added `seatShareReadout()` (pure, testable) and an on-overlay
block that states which condition the run reproduces, with both fill numbers and the
`?spawn=0.03125` fix on screen. Labelled as an **equal-split idealisation** — six seats contend for one
pool, so the leader takes more than a sixth; right for aggregate supply, wrong per-seat.

**DELTA-2 (shipped fix) — `Q` while carrying silently destroyed an inventory slot.**
`inventory.shift()` sat above the carry-1 guard. Measured in-browser: `8/8` → `7/8` (genuine draw) →
**`6/8`** (refused draw, item gone anyway). Players hold `Q` down, so the bank leaked under exactly the
input a B4 playtest generates, and `buildCount`/`peakPrimitives` under-read with it. The one-line
reorder was untestable (the live handler is unreachable from vitest, and a source-order assertion is a
known trap here — `indexOf` matches your own comments, and the new comment names `shift` four times),
so decision + consume were moved into one unit, `takeFromInventory()`, that **owns the array**.
Contract: returns `null` and leaves the inventory byte-identical on every refusal path. Verified fixed
in real pixels: `8/8` → `7/8` → `7/8`.

**Two further defects in my own change, caught only by SCREENSHOTTING** — invisible to 2001 passing
tests because every string was correct: (a) `max-width:44ch` with `white-space:pre` **clips** rather
than wraps, and 44ch was already too narrow for content shipped in S128 (REGIME line 53 chars, a
12-slot INVENTORY 77, recipes-fitting 77 — all cut mid-word) → widened to 80ch, which fixes the
pre-existing clipping too; (b) the ramp warning compared `poolSamples.length` against `TTL*6`, but the
sampler fires every 100 ms (~10/s) while the sim runs 60 ticks/s, so it demanded **360 s** of hold
while its own message promised **60 s** → re-denominated in SIM TICKS as `RAMP_SETTLE_TICKS`.

**MUTATION TESTING — 8 applied, 8 CAUGHT, 0 vacuous.** M1 re-hoist the consume above the carry-1 guard
(the original bug) → RED (2) · M2 drop the player-exists refusal → RED (1) · M3 tolerance band → exact
equality → RED (1) · M4 fair-share denominator `MAX_PLAYERS` → 5 → RED (4) · M5 drop
`Number.isFinite` so infinite cap returns Infinity → RED (1) · M6 FIFO → LIFO → RED (1) · M7 ramp
threshold back to sample-count units → RED (2) · M8 settle window → one TTL → RED (2).

**Docs:** `BACKLOG.md` CARRY-FORWARD LEDGER §B records B3 confirmed with measured figures, names the
playtest-URL trap, and logs the `Q` double-binding. `boot-snapshot.md` carries the corrected recipe.
`probeHarness.ts` docblock now warns the next reader off the broad `dist/` grep form.

## OPEN ISSUES
- **36 commits unpushed** — `gh auth status`: "The token in default is invalid". READ auth healthy
  (`ls-remote` exit 0), so the count is **exact, not a lower bound**. Fifth consecutive session.
- **`deploy.yml` has still never executed with S131's CI gate** — static assertions only.
- **`npm test` is bare `vitest` = watch mode, hangs the session.** Use `npx vitest run`. Still unfixed.
- **`Q` is genuinely double-bound** between the probe's draw and `SHRINK_TERRITORY` (`main.ts:888`
  advertises "Q shrink territory"). It cannot fire *only* because `decideKeyShrink` returns false when
  `gameMode === 'solo'` (`controls.ts:868`) and the probe auto-disarms outside solo — **an incidental
  guard, not a deliberate one.** Goes live if the probe gains a bots/networked mode.
- **`dist/` sourcemaps embed the full TypeScript of every DEV-only module**, including this harness.
  The executable is clean (0 probe identifiers, sentinel absent from every `.js`), but whether `.map`
  files are actually deployed was NOT investigated.
- **Scope creep, disclosed:** `0a6144f` swept in `.claude/session-state.s129.bak`, an untracked
  leftover predating this session and outside the PDR scope. Owner reviewed and approved.
- Remote `origin/claude/spark-game-state-analysis-a3ot8i` and `origin/gh-pages` still need owner
  action; neither deletable without write auth.

## BLOCKED ON
1. **Owner: `gh auth login -h github.com`** then push. Credentials — cannot be done for you.
2. **Owner: the probe playtest.** B4 is a human judgment about whether carving survives an 8-slot
   exact-type inventory. No headless run substitutes for it. The instrument is now verified and the
   recipe corrected, so this is ~10 minutes.

## NEXT STEPS (priority order)
**Immediate**
1. Owner: `gh auth login -h github.com` → `git push origin master && git push origin v0.5.2-pre-pivot`
   (fires a production deploy; the only way to exercise the CI gate).
2. Owner: playtest `/?probe=1&regime=new&slots=8&spawn=0.03125` on `npm run dev -- --port 40843`.
   Check `✅ = ONE SEAT of a 6-seat match`, hold ≥60 s for `✅ past the ramp`, restart the match after
   any `[` regime flip. Report back `peak primitives owned` / `sever actions` / `primitives removed` /
   `placements` / `median gap`.
3. After the push: `gh run list --workflow=deploy.yml` — audit CONCLUSIONS, not the absence of mail;
   a timeout-killed job reports `cancelled`.

**Short-term**
4. The **structure-HP + `damageEntity` slot** ruled S130 to precede V6-2.1 — the only substantial V6
   work NOT gated on the playtest.
5. Small + logged: `package.json` bare-`vitest`; P2-18 `'godly'` union; `e2e/smoke.spec.ts:637` stale
   `v9`; `BACKLOG:518-521`'s non-existent `// V6-RISK(Rn):` anchors.

**Medium-term**
6. V6-1.x once B3/B4 are ruled. R1 (`stateHash.ts:45-48` omits every entity family) bites first.

## CHANGED FILES
```
 .claude/plans/2026-08-04_PDR_S132_Probe_Instrument_Repair.md         | 115 +++++
 .claude/plans-archive/2026-08-04_PDR_S132_Probe_Instrument_Repair.md | 115 +++++
 .claude/session-state.json                                           | 554 +++++-----
 .claude/session-state.s129.bak                                       | 135 +++++
 .claude/session-state.s131.bak                                       | 510 ++++++++++
 BACKLOG.md                                                           |  39 ++
 boot-snapshot.md                                                     |  19 +-
 src/dev/probeHarness.test.ts                                         | 142 +++++-
 src/dev/probeHarness.ts                                              | 160 +++++-
 9 files changed, 1343 insertions(+), 446 deletions(-)
```
Plus, at handoff: `.claude/reflexion_log.md` (+7 entries, pruned 56→47), `boot-snapshot.md`
regenerated, two stale ephemeral plan copies deleted (S130/S131 — `plans-archive/` said COMPLETED
while `plans/` said IN-PROGRESS; that divergence is what mis-set S132's boot read).

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: **1/1 complete** | 237K/1M (**GREEN**, 23.75%)
- P1 `P1-probe-instrument-repair` — **completed** — Micro — `0a6144f` — 8 verification bindings, all
  absolute; check_completed true; ANALYZE complete

## REFLEXION ENTRIES (this session)
- #four-sessions-of-owner-hasnt-run-it-and-nobody-checked-the-instrument
- #an-instrument-that-cannot-reproduce-its-own-test-condition
- #measure-inside-the-hold-not-on-the-edge-of-the-ramp (re-learned from this repo's own snapshot)
- #a-green-suite-cannot-see-a-clipped-string
- #restructure-so-the-bug-class-is-testable-rather-than-text-pinned
- #verify-the-mechanism-of-your-own-alarm (three false alarms: `dist/` grep, `${PIPESTATUS[0]}`, bold-markdown anchor)
- #the-guard-that-saves-you-may-be-incidental

## CARRY-FORWARD PRIORITIES
**None** — 1/1 priorities completed. Carried *items* (not priorities) are in `boot-snapshot.md` under
Pending Backlog, including two new to S132: the `Q` double-binding and the sourcemap question.

═══════════════════════════════════════════════════════════
