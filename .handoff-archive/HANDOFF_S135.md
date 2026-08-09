═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-08-09
Session: S135 — the v0.6 economy loop goes live (hunter residual + gatherers + haul cycle)
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK — 6-player FFA geometric-builder duel, mid v0.6 economy pivot
- Working directory: C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark
- Git branch: master · Latest commit: 88ef3b5 (+ session-state chore) · 0 unpushed, remote reachable
- Tech stack: TypeScript · Pixi.js v8 · Vite · Vitest · Playwright · WebRTC (Trystero)
- Live: https://spark-online.space (GitHub Actions artifact deploy — the ONE path)

## CURRENT STATE
- Build: PASSING · bundle 657.2 KiB entry / 750 KiB cap (92.8 KiB headroom)
- Tests: 2069/2069 across 137 files (was 2020/132 at session start — +49 tests, +5 files)
- Typecheck: tsc 0
- Deploy: run 31334062347 success · verify-deploy PASS 4/4 (LIVE hash == local build)

## SESSION COST
Model routing data unavailable (statusline_dead this session). Real context at close:
577,919 / 1,000,000 tokens (57.8% YELLOW). External API calls: Grok 0 ($0.00), Gemini 0 ($0.00) —
deliberation ran on in-repo disk-grounded Claude workflows (chosen deliberately over external
Council for a disk-heavy task, per the documented reviewer-fabrication risk).

## THIS SESSION'S WORK

**P0 — hunter lifetime serialization (95911d1).** `serializeHunter` emitted no lifetime and
`deserializeHunter` hardcoded `despawnAtTick: 0`, so the SEEKING escape gate (`world.tick >= 0`,
always true) made a rehydrated hunter abandon its chase on the first tick — on BOTH host-authoritative
rehydrate paths — and `hunterSpawned` then blocked any respawn, silently deleting the leader-punish
mechanic for the rest of the match. Fix travels `despawnAtTick`/`spawnedAtTick`/`prevPos`
(additive-optional, no schemaVersion bump). Reconciled FOUR stale docblocks (the 4th, on workerSim's
authority-assuming path, was found by the design review — the PDR had named three), the Blueprint
hazard paragraph, and the BACKLOG carry-forward. New `save.hunterLifetime.test.ts` + a seeded
`workerSim.differential` INIT guard (the old one hashed an EMPTY hunter set, which is why this whole
bug class was invisible). This unblocked the sim-worker flip.

**P1 — V6-1.1 gatherers + keep + buy button + score-as-currency (bf08f56).** First player-VISIBLE
feature since the pivot. New gatherer entity family (R3 = a brand-new World Map; freeSparks rejected
for the 10 s TTL reap + rim-snap, a seated Player rejected for the MAX_PLAYERS collision), registered
across the R15 surface. Render-only placeholder keep (no world state). `BUY_GATHERER` at 105 VP
through a new clamped `spendScore`. The monotonicity audit found score was ALREADY non-monotonic
(leader-decay, NONET ×0.4), so only two genuine deltas needed fixing: a milestone banner that could
REPLAY after a spend, and the red drop-flash firing on a voluntary buy. PROTOCOL_VERSION 15→16.

**P2 — the haul cycle (530b8e0 amendment + 88ef3b5).** The owner played P1 and reported the decisive
defect: the gatherers do not move. Rule 16 amendment written and committed BEFORE any code. Gatherers
now SEEK → HAUL → deposit, banking shapes beside the keep; the cruiser's grab MOVED from the spawn
zone to the keep (B6 honoured — `CarryingPlayer` retained and functional, only its SOURCE narrowed).
Added `Spark.escrow` ('hauled'|'banked') whose three exemptions are load-bearing: without them the
10 s TTL deletes a shape mid-carry, the soft cap can evict it, and the rim-snap teleports it back.
Plus: START AT 1 + 100 opening points (closing the P1 deviation), a 50-VP speed upgrade,
SPAWNER_RADIUS 250→125, per-gatherer shape preference (click to cycle), and gatherers joining the
60 Hz positions buffer (8→9 sections — they were correctly excluded while static).

**The audit.** A 5-lens adversarial sweep of the P0/P1 diff produced 31 findings. Fixed in P2: the
castleAnchor seat-6 keep collision (ring divided by MAX_PLAYERS 6 while VS-BOTS seats 7), the
renderer tinting from the STATIC palette so a rainbow shuffle made your own property read as an
opponent's, `nextGathererId` declared hashed but never projected, the footer guard blacking out the
whole bottom strip, both buttons ignoring input locks, the drop-flash latch never expiring, the
energy gauge overlapping the footer, two BACKLOG self-contradictions, the un-executed NAMING ruling
on doc prose, and a tracked `save.ts.s134bak` still carrying the pre-fix FALSE hunter docblocks.

## OPEN ISSUES
- Deposit-slot column can grow past the footer for the two bottom seats at very high gatherer counts.
- `SCORE_TIER` corner-bloom still replays on a re-cross (only the HUD banner is watermarked).
- Carried-potato `onUp` footer branch can strand pointer capture (narrow: potato + footer + release).
- `origin/gh-pages` remote branch still exists — deletion is OWNER-GATED.
- No two-tab boot-then-smoke for host migration; the e2e migration spec is @quarantine-flaky.
- The vitest lane mocks the wire with a JSON round-trip — no test chains wire → promote → snapshot.

## BLOCKED ON
Nothing. The only thing waiting is the owner PLAYTESTING the haul build.

## NEXT STEPS (priority order)
1. **Playtest the haul build** — everything below is a guess until then.
2. **B3: 6× spark rate** (already ruled). `SPAWN_RATE_PER_SECOND` 0.1875 → ~1.125; re-derive
   `FREE_SPARK_SOFT_CAP` (dead code at the old rate, LIVE at 6×). Most likely to make it feel alive.
3. **V6-1.3: bank cap 5 + waiting-gatherer rule.** Shapes currently pile up uncapped. Keep the cap
   and the recipe-size table adjacent forever.
4. **Sim-worker default-on flip** — now unblocked; the gatherer family is already flip-ready.
5. **V6-1.4: ordered build queue + full footer.** The container is reserved; the shipped preference
   is its single-type precursor, not the queue.

## CHANGED FILES (this session, 7b92713..HEAD)
40 files changed. New: gatherer.ts, gathererLifecycle.ts, gathererRenderer.ts + 4 test files
(hunterLifetime, gathererLifecycle, gathererHaul, gathererEscrow). Heaviest edits: save.ts,
world.ts, ui.ts, controls.ts, constants.ts, gameMode.ts, stateHashFull.ts, workerSim.ts, hostTick.ts.
Docs: BACKLOG.md, SPARK_Blueprint.md, SPARK_v0.6_DESIGN.md (naming ruling executed).
Deleted: src/state/save.ts.s134bak.

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: 3/3 complete | 578K/1M (57.8% YELLOW)
- P0 hunter-lifetime-serialization — completed — 95911d1
- P1 v6-1.1-gatherers-castle-buy-score-currency — completed — bf08f56
- P2 gatherer-haul-cycle (Rule 16 amendment) — completed — 88ef3b5

## REFLEXION ENTRIES (this session)
6 entries appended to `.claude/reflexion_log.md` (pruned to 49): the mutation-matrix double-detector
catch, the false-RED hash trap the adversarial review caught before I shipped it, my-own-test-was-
wrong-not-the-code, a-surviving-mutation-is-not-automatically-a-weak-test, the-forcing-functions-did-
the-work-I-would-have-forgotten, and ship-the-loop-not-the-substrate.

## CARRY-FORWARD PRIORITIES
None. All three priorities completed, committed, pushed and verified live.

═══════════════════════════════════════════════════════════
