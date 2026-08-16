═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-08-16
Session: S145 — the full-bank deadlock: why "the playtest didnt work" while the deploy was perfect
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (2D real-time multiplayer geometric builder duel)
- Working directory: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
- Git branch: master · Latest commit: `e76fe5d` chore(s145): MCV assertion bindings corrected
- Tech stack: TypeScript + Pixi v8, host-authoritative snapshot sim, optional Web Worker, WebRTC (Trystero)
- Codebase: +1,775 / −359 lines across 11 files this session

## CURRENT STATE
- Build: PASSING · tsc 0 errors · bundle 691.5 KiB, charter raised 750 → **900** KiB (208.5 KiB headroom)
- Tests: vitest **2438/2438** across 158 files (was 2430/157 — +8 tests, +1 file)
- e2e: `e2e:gating` **41/41** (was 39/39 — +2 in the new `bank-deadlock.spec.ts`)
- Deployment: LIVE, verify-deploy **4/4** at `63c00e61`, live asset `index-Blrtx25J.js`
- PROTOCOL_VERSION **21, unchanged** — the fix needed no new wire action
- MCV: 14/14 assertions pass, exit 0 · review gate APPROVED by owner

## SESSION COST
- Model: Opus 5 throughout (ALWAYS-STRONGEST). Council: Grok 1 call (~$0.04), Gemini 1 call (~$0.02)
- 6 Playwright probes against a real browser (~18 min of measured gameplay)
- Context at close: ~320K / 1,000,000 (32% GREEN)
- Model-routing counter file absent → per-tier split unavailable; cumulative `~/.claude/usage-log.csv`

## THIS SESSION'S WORK

**A.0 — the report was right and the pipeline was innocent.** 0 unpushed, `spark-online.space` serving
a byte-identical build, verify-deploy 4/4, 0 console errors. Two independent 4-minute solo runs, no
seeding: bank full at tick ~2755 (~46 s), composition then FROZEN for 11,449 further ticks, every tile
"NEED n MORE", zero towers. Both shipped escape hatches measured FAILING: ordering the missing type
changed nothing in 60 s; freeing a slot by hand let the parked hauler refill it with STALE cargo.

**P1 — break the deadlock (`bb32079`).** `shouldReleaseWaitingCargo` + `parkCargoOnPorch`: a `WAITING`
unit holding cargo that satisfies no live order parks it on the PORCH and re-seeks. The porch is not a
bin — `blueprintBuild` pays from bank ∪ porch, so nothing is destroyed and the V6-1.3 "haulers stall
until you spend" ruling is intact. Released only when an ordered-type spark is genuinely harvestable,
which makes Grok's drop/re-grab spin-loop unreachable. Plus: `pickGathererTarget` suspends the B4
nearest-of-any fall-through while free slots ≤ pending orders — measured spending 3 of 4 player-freed
slots on shapes nobody ordered.

**P2 — the build grid learns the order queue exists (`994f734`).** A short tile is now the ORDER
button: one click enqueues exactly the shortfall AND decants enough bank slots to receive it. Both are
already-shipped actions on the same `dispatchFn` seam → no new wire action, **no PROTOCOL bump**.
Caption reads "CLICK TO ORDER THE MISSING SHAPES"; only LOCKED is inert.

**P3 — coherence audit (`63c00e6`).** 0 TODO/FIXME in src/; all 21 client intents have dispatch sites.
Three fixes: my own P2 loop was host-only (re-read `bankCount` after each dispatch, which cannot move
under postIntent/wire — only ONE pull was sent off-host); the V6-1.3 ruling comment implied WAITING was
terminal; `CASTLE_BANK_CAP`'s docblock now records the real pool (cap + porch = 11) and what cap 7 cost.
Bundle charter 750 → 900 on the build script's own instruction.

**P4 — shipped.** 3 deploy runs success, verify-deploy 4/4, custom domain confirmed independently,
live-site smoke 0 errors over ~30 s of play.

**ACCEPTANCE (owner flow, solo, zero seeding):** bank jams at tick 2338 `[1,1,1,3,3,4,5]`, stinkTower
NEED 2 MORE → ONE click → orders `[4,4]`, bank 7→5, porch `[1,4]` → **tile lit 15 s later** → click,
place → `defenders: ["stinkTower"]`, survives revalidation, 0 page errors. Replicated 2/2.

## OPEN ISSUES
- **CF1 (HIGH, blocker on the worker flip):** under `?worker=1` click-to-build stamps 4 primitives and
  DEBITS the bank but `defenders` stays empty — the player pays and gets nothing. PRE-EXISTING S144.
  Zero blast radius today (`WORKER_DEFAULT_ON` false). Traced: ignition lives only inside
  `runGodlyMatcherCore` (`godlyMatcherCore.ts:62/:64`) behind `if (!world.isHost) return null`.
- `e2e-quarantine` still fails (~8 genuinely failing joiner tests) — pre-existing, expected.
- Hand-drag placement e2e remains flaky: `bomb.spec` failed once, passed on rerun.

## BLOCKED ON
1. **Playtest the build grid** — click a tower you cannot afford; it should order + light up.
2. `CASTLE_BANK_CAP` 7 vs 12–13 — now a PACING dial only (CF2), no longer a playability blocker.
3. Stink Tower recipe shapes · R7 design library · energy-vs-score · S139 goblin fog · Q6 bot
   starvation · standing `origin/gh-pages` deletion + Pages `build_type`.

## NEXT STEPS (priority order)
1. **Playtest** the order-on-click loop, then rule CF2.
2. **Diagnose CF1** before any worker work — the discriminator is in `carry_forward` (note the trap:
   seeding `__SPARK__.world` under `?worker=1` writes to the MIRROR, not the authoritative world).
3. Seed `defenders` in the differential harness (was the last gate on the worker flip — CF1 may be a
   bigger one).
4. V6-1.5 hero unit → V6-1.6 → V6-1.7 the boredom gate.

## CHANGED FILES
11 files, +1,775 / −359. New: `e2e/bank-deadlock.spec.ts` (235), `gathererWaitingRelease.test.ts` (193).
Modified: `gathererLifecycle.ts` (+138), `main.ts` (+63), `castlePanel.ts` (+63), `constants.ts` (+13),
`LOCKED_DECISIONS.md`, `scripts/check-bundle-size.mjs`, session-state + plan.

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: **4/4 complete** | ~320K/1M (GREEN)
- P1 Break the full-bank deadlock — completed — `bb32079`
- P2 Build grid → order queue — completed — `994f734`
- P3 Coherence audit — completed — `63c00e6`
- P4 Ship + verify — completed — `63c00e6`
Council: GROK REJECT / GEMINI REJECT of the original bank-eviction design → abandoned on a sustained
livelock + owner-ruling conflict. Two of their strongest claims REFUTED against the code: an 8-shape
bill IS satisfiable from a 7-slot bank (bank ∪ porch = 11, which is why voltkin@8 ships), and host-only
mutation is not a desync here (snapshot-authoritative, not lockstep).

## REFLEXION ENTRIES (this session)
8 entries appended to `.claude/reflexion_log.md` (then pruned to 50; S141 dropped). Headline:
`#the-owner-said-it-didnt-work-and-the-deploy-was-perfect` ·
`#the-workaround-in-the-test-was-a-description-of-the-bug` ·
`#two-features-that-solve-each-other-and-have-never-been-introduced` ·
`#the-council-was-confidently-wrong-about-my-own-codebase-twice` ·
`#my-loop-guard-went-false-after-the-first-iteration` ·
`#vitest-does-not-typecheck-so-my-tests-passed-on-a-type-that-does-not-exist`

## CARRY-FORWARD PRIORITIES
None incomplete — 4/4 shipped. 25 entries in `session-state.json → carry_forward` (3 new: CF1 the
`?worker=1` ignition blocker with a traced root-cause lead, CF2 the cap as a pacing dial, CF3 a sweep
for other specs whose seeding hides a real-path failure).

═══════════════════════════════════════════════════════════
