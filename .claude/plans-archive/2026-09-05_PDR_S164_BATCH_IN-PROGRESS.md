# PDR — S164 batch — **STATUS: IN-PROGRESS — P1-P4 SHIPPED AND DEPLOYED. P5 art delivered, WIRING NOT STARTED. P6 not started.**

Tier: **Full**. Owner selected the priorities directly and ruled on every open design question
in-session. Baseline `eaf85e2`.

**Work order (owner):** V6-2.4 → W1-C (races #1) → the art-direction brief (#3).
**#2 (energy sinks) is PARKED at owner request — "i would like to first discuss it". Do not start it.**

## OWNER RULINGS THIS SESSION (verbatim intent, R128–R133)

- **R128 — castle "repair" is a VP-PURCHASED REGEN UPGRADE, not an active repair action.**
  *"spend victory points on castle upgrades (same as gatherer upgrades). 100vp on hp regeneration.
  upgrade lv 1 = +1% hp reg, lv 2 = 1.2%, lv 3 1.4%, lv 4 1.6%"*
- **R129 — purchasable at any time.** *"whenever you want you can upgrade castle regen."*
- **R130 — the rate is 1% of max HP per SECOND**, not per tick. Ruled after I put the arithmetic in
  front of the owner: per-TICK is 900 HP/s, which out-heals 150 goblins and makes the castle
  unkillable at level 1, deleting the second win condition.
- **R131 — cap 5 (gatherer parity), and NO regen from zero.** A fallen castle stays fallen; R127
  stands.
- **R132 — NONET moves from 9 to 12 same-shape primitives**, stays an easter egg, and must NOT be
  added to the footer tower menu. This resolves the boss-tower collision by construction: 9 = boss,
  12 = NONET, no precedence rule needed.
- **R133 — B1 resolved as a CASTLE SENTINEL `SpawnerId`.** Race units take the normal spawner
  population path rather than widening the voltkin exemption.

## A.0 STATE-DISCOVERY — 3 lanes, all returned, 0 spend-limit deaths

Gates at boot: `typecheck 0` · `vitest 3649/3649` (233 files) · tree clean at `eaf85e2`.

### What A.0 changed about the plan

**⛔ THE SPEC'S REPAIR MECHANIC IS UNIMPLEMENTABLE AS WRITTEN, and the owner replaced it.**
`SPARK_v0.6_DESIGN.md` and `SPARK_Blueprint.md` both say repair works by *"attaching connectors"*.
A.0 proved the castle is **not a bondable entity**: a bond's endpoints are typed `PrimitiveId`
(`physics/bonds.ts`), and the castle is one scalar on `Player` with no geometry in `world.primitives`
at all. So "re-attach connectors to your castle" has nothing to attach to. R128 replaces it with the
gatherer-upgrade model, which the code already supports end-to-end.

**⭐ THE GATHERER PRECEDENT IS AN EXACT TEMPLATE, and VP is already spendable.** The v0.6 design doc
claims Score/VP is *"Spent on: Nothing — never spendable"*. That is **stale**:
`applyUpgradeGathererSpeed` (`gatherers/gathererLifecycle.ts:150-151`) reads `world.scoreByPlayer`
and calls `spendScore`. The owner's instinct matched shipped code. Same shape throughout: a client
intent, a `spendScore` price, an integer level, a cap.

**⭐ THE 0.2 LADDER IS THE SHIPPED ONE.** `stats.ts:41` — DEF/PEN are *"integer points indexing a
LINEAR multiplier ladder `1 + 0.2n`"*, *"steps by 0.2 = 1/5"*. R128's 1.0 → 1.2 → 1.4 → 1.6 is that
same step, so the owner's "same scaling — right?" is **confirmed against the tree**, not agreed from
memory.

**⭐ AND THE RATE LANDS ON EXACT INTEGERS, which is what makes it determinism-safe.**
`1500 × 1.0% = 15`, `1.2% = 18`, `1.4% = 21`, `1.6% = 24`, `1.8% = 27` HP/sec — all whole. So regen
is INTEGER HP on a once-per-second tick cadence, phase-spread by seat. **No float accumulator**,
which this project forbids in the sim, and **no rounding rule to get wrong**.

### Real defects A.0 found in the SHIPPED castle system

The owner asked to "make sure it all works". These are in scope for that.

- **A2 (MED) — the castle strike is ordered BEFORE the bond arm, contradicting its own docblock
  twice.** `creatureAttack.ts:250` and `:339` both say the castle is *"Ordered LAST, after bond /
  creature / shape"*. It is not: the castle block at `:376-379` `return`s above the bond branch at
  `:382`. So a Voltkin (attackRange 180) committed to an enemy connector anywhere within 180 px of
  an enemy keep spends every strike on the keep and **never severs the bond** — verbatim the S157 F1
  symptom, which was fixed for the SHAPE arm only and left live for bonds.
- **C5 (HIGH) — `damageEntity` is already a working HEAL vector.** The castle arm at `damage.ts:111`
  returns *above* the integer/non-negative guard at `:120`, so
  `damageEntity(world, {kind:'castle'}, -300, …)` computes `Math.max(0, hp + 300)` — unvalidated,
  unclamped, and straight into C4.
- **C4 (HIGH) — overheal would be a SILENT WIRE DIVERGENCE.** `save.ts:1796` emits `castleHp` **only
  when below max**; `save.ts:1618` rehydrates absent as `CASTLE_MAX_HP`. A host at 1700 emits nothing
  and every peer reads 1500 — and `stateHashFull.ts:167` marks `players:'acknowledged'`, so **neither
  oracle can see it**. Any heal path MUST clamp at `CASTLE_MAX_HP`.

### Constraints A.0 established (obeyed, not rediscovered)

- **A new client intent IS a bump.** Unbroken precedent: `REPAIR_STRUCTURE`, `FEED_TOWER`,
  `RAID_TARGET`, `ENQUEUE_GATHERER_ORDER` all bumped. `PROTOCOL_VERSION` 40 → 41, **six** edit sites.
  ⭐ W1-C also owes 40 → 41, so **both priorities share ONE bump** if they land together.
- **A new `Player` field costs NINE sites, two of which `tsc` cannot catch** — the `pickup` and
  `drop` carry-FSM literals (`player.ts`), where an optional field omitted is silently reset on every
  spark pickup. The verification MUST include a pickup/drop round-trip assertion.
- **Both policies must be `deny`.** `ELIMINATION_INTENT_POLICY` and `BENCH_INTENT_POLICY` are
  exhaustive maps with forcing tests; and `elimination.test.ts:67` pins elimination as STRICTER than
  the bench, so `(bench deny, elimination allow)` is structurally impossible.
- **Not locally predicted.** `PREDICTABLE_ACTIONS` is exactly PICKUP/DROP/UPDATE_AVATAR_POS. An
  optimistic castle heal would flash the HP bar and the castle art-state, then snap back.
- **Bots are DEFERRED, and that is stated here rather than buried** — no bot emits `REPAIR_STRUCTURE`
  or `FEED_TOWER` either, so human-only verbs already ship. Hook point if wanted:
  `botBrain.ts chooseGoal` beside `PULL`.

## THE PRIORITIES

| # | Priority | Tier | Protocol |
|---|---|---|---|
| P1 | Castle regen upgrade (R128–R131) — the unbuilt half of V6-2.4 | Full | 40 → 41 |
| P2 | A2 — the castle strike preempts the bond arm | Standard | none |
| P3 | C5 + C4 — close the heal vector, clamp overheal | Standard | none |
| P4 | R132 — NONET 9 → 12, stays off the footer menu | Micro | none |
| P5 | W1-C — the castle produces its race's unit (R133) | Full | shares 41 |
| P6 | The art-direction brief — zones + tier-9 boss towers | Full | TBD |

### P1 — CASTLE REGEN UPGRADE

**Model, mirroring `applyUpgradeGathererSpeed` verbatim:**
- New client intent `UPGRADE_CASTLE_REGEN`, cost `CASTLE_REGEN_UPGRADE_PRICE = 100` via `spendScore`.
- New `Player.castleRegenLevel: number`, init 0, cap `CASTLE_MAX_REGEN_LEVEL = 5`.
- **Rate:** level 0 → **no regen at all**; level L∈1..5 → `(0.8 + 0.2·L)` % of `CASTLE_MAX_HP` per
  second = **15 / 18 / 21 / 24 / 27 HP/s**. The 0 → 1.0% step at first purchase is deliberate and is
  the owner's ladder: the first 100 VP buys a real effect.
- **Applied as integer HP once per second on a `world.tick` cadence, phase-spread by seat** — never a
  per-tick float. Clamped to `[1, CASTLE_MAX_HP]`.
- **Never from zero** (R131): regen requires `castleHp > 0`, so a fallen castle stays fallen and
  `eliminatedAtTick` can never go stale.
- Purchasable in any phase (R129). ⚠ **Whether the regen TICK runs in BUILD as well as FIGHT is MINE,
  not the owner's** — it does, and the arithmetic is recorded at the constant: a 90 s BUILD at lv1
  restores 1350 HP, so a beaten castle recovers between rounds, which is the death-spiral fix the
  slot exists for. A 45 s FIGHT at lv1 offsets 2.5 goblins, so a 5-goblin push still kills.

### P2 — THE CASTLE STRIKE PREEMPTS THE BOND
Move the castle block below the bond branch so the code matches the two docblocks that already claim
it. Add the bond twin of `strikeOrderAndRecall.test.ts:68`, plus an anti-vacuity case proving a
creature with no bond still hits the keep.

### P3 — THE HEAL VECTOR AND THE CLAMP
Move the castle arm below `damageEntity`'s integer/non-negative guard (or validate in-arm) so a
negative amount is refused, and add the round-trip test that an over-max value cannot be produced.

### P4 — NONET 9 → 12
`NONET_SHAPE_COUNT` 9 → 12 (`sudokuEvent.ts:21`). ⭐ A.0 confirmed NONET is **not** in the recipe
registry, so it does not appear in the footer band today — R132's "keep it off the menu" is satisfied
by construction and the job is to NOT add it. The name stays (it is the feature's identity across
audio, save and UI); a note records that "nonet" is now a misnomer.
⚠ **One reading is mine:** `detectNonet` counts PRIMITIVES (`comp.primitiveIds.size`), so "12
same-shape-connectors" is implemented as 12 primitives of one type. One word from the owner flips it
to 12 bonds.

### P5 — W1-C (R133) · P6 — THE ART BRIEF
Detailed at execution time; P5 takes the castle-sentinel `SpawnerId` decision at the gate with the
reasoning written there, per the standing races PDR.

## TESTING
Per priority: `typecheck` → `vitest` → `build`, exit codes read directly, never through a pipe.
P1/P5 additionally `e2e:gating` (protocol bump). Batch close: `verify-deploy` 4/4 + a `gh run list`
conclusions audit + `verify-session-claims.py` exit 0 **after CHECK, not only after DO** (the S163
lesson).

## NOT IN THIS BATCH
**V6-1.6 energy sinks** — parked by the owner for discussion. Note for that conversation: A.0 found
`player.energy` has exactly ONE production read (`ui.ts:1104`, the gauge), so it accrues every tick
and rides the wire as a mandatory field while doing nothing.
