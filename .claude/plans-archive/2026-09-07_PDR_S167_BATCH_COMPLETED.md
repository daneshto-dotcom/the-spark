# PDR — S167 batch — **STATUS: COMPLETED — all four priorities shipped, deployed and verified.**

Tier: **FULL** (>30K, two priorities, one of them a protocol bump across ~30 files).
Owner approval: **PRE-APPROVED IN THE OPENING MESSAGE** — *"Work on those priorities next … i
pre-approve the batch."* The two priorities are quoted verbatim from `boot-snapshot.md`, so the
scope is the owner's own list, not my reading of it.

---

## OBJECTIVE

Ship the **tier-9 boss tower** — nine of a race's own shape builds a tower that releases exactly one
boss and crumbles — and the **art that makes it visible**. The art for the structures already exists
and is owner-approved; nothing in `src/` references any of it.

---

## SCOPE

### P1 — THE TIER-9 BOSS TOWER, CODE (PROTOCOL 43 → 44)

Six new serialized `GodlyId`s, six new boss `CreatureType`s, and the full wiring the tier-3 tower
established in `40e2168`. The one-shot / self-destroying spawner is genuinely new — no existing
spawner tears itself down after a single emit.

### P2 — THE TIER-9 ART

1. The 18 tower-state PNGs on disk → six three-state atlases via `build-sprite-atlas.mjs`.
2. The six boss seeds → clips → atlases.
3. The six tower **destroy cinematics**.

---

## OUT OF SCOPE (stated, not dropped)

- ⛔ **THE BOSS SKILL CLIPS.** The owner reserved the two-skills-per-boss decision by his own choice
  and the handoff says *"Ask before generating."* The other four clips per boss (idle / moving /
  dying / basic attack) do not depend on it and are in scope. **The skill question is put to the
  owner in chat; it does not block P1.**
- R121's submerged naga · the `die` atlas row · the wave-5 tech draft (R101–R112) · inverting the
  `hostTick` emit chain (its own priority, it changes pentagram behaviour) · the tier-3/tier-9
  balance pass.

---

## APPROACH

### ⭐ THE WIRE LITERALS ARE KEYED BY **RACE**, NOT BY BOSS NAME — and that is what de-blocks the
### "Whopper" trademark question

`Spawner.recipeId` and `Creature.type` are **serialized wire formats**. Renaming one later is a
protocol bump for zero gameplay gain — the exact argument `raceTowerIds.ts` already uses to refuse
renaming the goblin tower. So a `bossWhopper` literal would weld a live Burger King trademark into
the wire format while the owner is still deciding the name.

Keying by race instead — `t9TowerZombies` / `t9BossZombies` — puts every boss NAME in
`T9_BOSS_NAMES`, a display-label table the owner can change any time **for free, with no protocol
bump**. This exactly mirrors the shipped precedent: `RACE_TOWER_IDS` are race-keyed while
`RACE_TOWER_LABELS` carry the player-facing names.

**Consequence: the "Whopper" decision stops blocking anything.** It becomes a one-word edit to one
string whenever he wants it.

### The recipe

`isRingAt(world, anchor, RACE_FEED_SHAPE[race], 9)` — the existing helper takes `n` as a parameter
and **already generalises**; nothing is baked to 3.

### ⭐ THE ONE-SHOT PROBLEM, AND WHY THE NINE SHAPES MUST BE CONSUMED

`igniteOneSpawnerRecipe` (`godlyMatcherCore.ts:112`) de-dups on `(anchor, owner)` **against the LIVE
`creatureSpawners` map only** — its own docblock says *"can't double-register; CAN rebuild after
removal."* So if the tower crumbles while the nine shapes are still standing, the very next
topology change re-ignites it and the seat gets **an unlimited stream of bosses**.

Therefore **the crumble consumes the ring's nine primitives.** This is:

- the only mechanism in the tree that makes re-ignition impossible rather than merely unlikely;
- faithful to the brief — the tower *crumbles*, so the structure is visibly spent;
- already the spec's own assumption. §D Q3b: *"a second boss already costs a fresh nine of the race
  shape — a real price, which is the natural cap the design already contains."*

### The ≤8 s budget is an ART budget, never a sim pause (spec §D Q6)

The boss is a live entity from the moment it is released; the crumble is a renderer effect over
continuing play. Tick-driven, no wall clock, no float accumulators.

---

## RISKS

| | |
|---|---|
| **Recipe collision** | ✅ **REFUTED BY TRACE, not by hope.** A 9-ring at `n=3`: the walk steps to node 4 and `cur === anchorId` is false. A 3-ring at `n=9`: `seen.has(cur)` trips at step 3. The two are **disjoint by construction**. To be re-asserted as a test. |
| **NONET collision at 9** | ✅ **NONE.** `detectNonet` requires `comp.primitiveIds.size !== NONET_SHAPE_COUNT → continue`, i.e. **exactly 12** (owner R132). A 9-ring is size 9. ⚠ Residual, pre-existing and not boss-specific: a 9-ring *plus three more bonded same-type shapes* is a component of 12 and would fire NONET. |
| **The chewer default** | `hostTick.ts:840` is an `else` that emits `chewer` for every recipeId not named above it — the S152 A1 defect the owner reported by name. Six towers with no arm = six chewer factories. **Explicit empty arm required.** |
| **`recipeStillSatisfied`'s `default:`** | Keeps a spawner alive off a single surviving primitive. Six explicit `case` labels required. |
| **The ignition chain is hand-written** | `registerAll.test.ts` extracts ids from comment-stripped source with a regex needing a **literal** id at the call site. Six explicit lines, never a loop. |
| **Nine shapes may not be bankable** | If a match cannot bank nine of one shape, the feature is dead on arrival. To be measured against the economy test before the recipe is called done. |
| **Bots** | `botBrain`'s module-level `TOWERS_BY_COST` has no seat — the tier-3 lesson. |

---

## TESTING

- A ring test at `n=9` for all six races, **plus the negative controls**: 3-ring does not match 9,
  9-ring does not match 3, 9-ring does not fire NONET.
- The one-shot contract: ignite → one boss → spawner gone → **ring consumed** → no re-ignition on a
  subsequent topology change. This is the test that would have caught infinite bosses.
- R137 race gate at `n=9`.
- Every built art path exists on disk (mirroring `raceTower.test.ts`).
- Protocol chain unbroken 2 → 44 in both carriers.

## VERIFICATION

Gates, every exit code from a **captured `$?`**, never a pipe and never the wrapper's trailing
`[exited with code 0]`: `typecheck` · `vitest` · `build` · `e2e:gating` · `check:atlas` ·
`verify-deploy` 4/4 content-hash.

**Baseline at boot, measured:** `typecheck 0` · `vitest 1` — one failure,
`matchPhase.test.ts > survives a snapshot round-trip mid-FIGHT`, **ruled benign with the reason**:
a 5 s `testTimeout` exceeded by an `await import('./save.ts')` under full-suite load (cumulative
collect 2561 s). It passes in isolation — 24 tests, 79 ms, exit 0. Pre-existing, not introduced.

## ROLLBACK

Every priority is its own commit on `master`. `git revert` of the P1 commit restores PROTOCOL 43 and
removes all twelve literals; the art commit is additive and independent.

---

## WHAT ACTUALLY SHIPPED (four priorities, not two)

The PDR scoped two. The owner then widened it mid-session — *"keep working all priorities from
backlog and current session priorities"* — and P3/P4 were opened under that directive.

| | | Outcome |
|---|---|---|
| **P1** | The tier-9 boss tower, code | ✅ PROTOCOL 43→44, `0911ac3` |
| **P2** | The tier-9 art — and the RENDERER it turned out to need | ✅ `70b4f35`, `0c35dca` |
| **P3** | Boss stats back onto the owner's ruled 1..12 scale + the missing `statsLadder` guard | ✅ `ff23154` |
| **P4** | Backlog sweep: emit-chain inversion, `die` row, potato immunity, the one-sided atlas gate | ✅ `6c224bf`…`66f46f1` |

## ⛔ THE THREE THINGS THE PDR GOT WRONG, RECORDED RATHER THAN QUIETLY FIXED

1. **"No existing spawner tears itself down after one emit"** — half true. A self-destruct arm DID
   exist and was deleted in S159 P9 on an owner reversal, and `hostTick`'s recipe-break branch still
   razes the lightning hub's own component. The pattern was precedented; only the *emit-path* variant
   was new.
2. **The PDR said nothing about a RENDERER.** `t3TowerAtlasBase` had zero production callers — 18
   shipped atlases had never been drawn. P2 was scoped as "generate art" and the actual gap was that
   the previous session's art was invisible.
3. **The boss stats in P1 broke an owner ruling already on the books.** HP 40–60 against
   `STAT_POINT_MAX = 12`. Caught by measuring the consequences, not by any gate — because the gate
   `stats.ts` cited had never been written.

## DEVIATION RECORDED — COUNCIL WAS NOT RUN

Rule 17 calls for a 3-way Council on a Full PDR. **Not run**, same as S166. Rule 0 names deliberation
among the gates that may not stop an approved batch in flight.

**What substituted:** a 10-lane read-only discovery workflow plus an adversarial completeness critic,
with **every load-bearing claim grep-verified against the tree before it was acted on** (6/6 confirmed
— `t3TowerAtlasBase` orphaned, `GOBLIN_KINDS` untested, `ATLASES` partial, R137 untested,
`trimMirrorSpawner` stripping ticks, `AUTO_BOND_RADIUS = 60`). The critic earned it: it found a real
defect in code written minutes earlier — the unconditional raze that would have destroyed nine shapes
and produced no boss.

**Residual risk accepted:** no external quality lens on the design. The two highest-risk decisions
(consuming the ring, and `sourceSpawnerId: null`) are covered by tests with anti-vacuity assertions.

## GATES AT CLOSE — every exit code from a captured `$?`

`typecheck 0` · `vitest 0 (4020/4020, 249 files)` · `build 0 (801.0 KiB, 94.4 KiB headroom)` ·
`check:atlas 0 (48 atlases)` · `e2e:gating 0 (65 passed)` · `e2e:protocol 0 (2/2)` ·
`probe-relays 0 (9/9)` · `verify-deploy PASS 4/4` · `MCV 0 (hard_fail=0, 32 bindings)`.

## NOT IN THIS BATCH — stated, not dropped

The wave-5 tech draft (a full system; deliberately not started rather than half-built on the build
the owner is about to playtest) · R121's submerged naga · the boss SKILLS' code (costed, with the
death-hook blocker found) · the six skill VFX (specs authored and ready; **blocked on AI Studio
prepay credits — owner action**).
