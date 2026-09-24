# SCOPE AMENDMENT — S148 · THE OPENING IS INCOHERENT (owner playtest)

**Status: AWAITING OWNER APPROVAL.** Tier: **Standard**. Parent: `.claude/plans/2026-08-19_PDR_S148_ZONES.md`.
**Rule 16** — this is new scope from a playtest, so it gets its own amendment before any fix.
**URGENCY PROTOCOL** — raised with frustration, which makes the scope gate *more* important, not less.
Nothing below is implemented yet.

---

## 1. WHAT THE OWNER REPORTED, VERBATIM

> *"starter goblins are way too strong - even helga cant kill them with like 5 slaps ... why are bots
> starting with the pencil chewers and the drones from the start .... not fair. everyone should start
> with nothing but the castle and one gatherer. also why does everyone have one goblin from the start
> ,,,,? the goblin is generated in the goblin tower which you havent designed yet!? one enemy goblin
> destroyed my helga tower and even my laser tower and my laser did like no damage to him!? not fair!
> this is not consistent nor coherent!!!!"*

**All four claims verified on disk. Every one is a coherence defect, not a balance opinion.**

---

## 2. A.0 — WHAT IS ACTUALLY IN THE CODE

### ⛔ F1 — THE TWO DAMAGE SCALES WERE NEVER RECONCILED. This is the root cause of complaints 1 and 4.

There are two HP scales in SPARK and the goblin sits across the seam:

| | scale | value |
|---|---|---|
| Structures (any connector) | real HP | `PRIMITIVE_MAX_HP = 1000` |
| Creatures | a **hit COUNT** | chewer 1 · Voltkin 2 · **goblin 6** (`GOBLIN_MELEE_HP`) |
| **Every defender's strike** | creature scale | `CREATURE_HIT_DAMAGE = 1` (`defenderLifecycle.ts:336`) |
| **Goblin's strike vs a shape** | structure scale | `GOBLIN_DAMAGE_VS_PRIMITIVE = 167` |

Consequences, arithmetic not opinion:
- **HELGA needs SIX slaps** to kill one goblin (6 hp ÷ 1 damage). The owner counted five and it was
  still alive — exactly right.
- **The laser turret also deals 1.** `constants.ts:1298` calls it *"a slow heavy beam"*; against a
  creature it is identical to a slap. That is the "my laser did like no damage" report, and it is true.
- **The goblin kills a tower in ~6 seconds.** 167 × 6 = 1002 ≥ 1000, one swing per second, so six
  swings destroys any connector — and a HELGA or laser tower *is* connectors. The tower needs the same
  six seconds to kill the goblin, but the tower dies first because its components are what get hit.
- **The goblin is 6× tougher than a Voltkin against every defender in the game**, which nothing in any
  design document asks for. `GOBLIN_MELEE_HP = 6` was derived from the owner's *"6 attacks to destroy
  a connector or a UNIT"* rule (S139) — correct for goblin-vs-goblin, and accidentally catastrophic
  against defenders, because nobody checked the rule against the defender damage constant.

### ⛔ F2 — BOTS ARE HANDED TWO FREE GODLY STRUCTURES AT TICK 0. Complaint 2, confirmed.

`seedBotSpawners` (`state/spawners/botSpawnerSeed.ts:71`) gives **every bot seat**:
- a complete **PENTAGRAM** — 5 bonded Triangles + a registered spawner = a *persistent chewer emitter*;
- a complete **LIGHTNING HUB** — 1 Dot + 5 Circles, which emits a burst of 3 suicide drones (`:143`).

The human seat gets neither. Both were seeded in S104/S113 as *demo scaffolding* so the owner could see
chewers and drones without building them — a deliberate choice for a test mode that has since become
the main way the game is played. It is now simply an unfair opening.

### ⚠ F3 — AND THOSE BOT STRUCTURES IGNORE THE ZONES I SHIPPED TODAY.

`botSpawnerSeed.ts:82-84` still places them with the **retired polar ring math**
(`SPAWNER_CENTER + cos(seat angle) × PENTAGRAM_REACH`). So a bot's free pentagram can land in the
quarry, in a neutral strip, or inside *another player's zone*. My S148 P1 did not cause this, but it
made it incoherent — and it will break P2 the moment build legality goes live, because the host would
refuse a placement it seeded itself.

### ⛔ F4 — THE STARTER GOBLIN CONTRADICTS THE TD DESIGN. Complaint 3, confirmed.

`seedStartingUnits` (`gameMode.ts:324`) spawns one `goblinMelee` per seat. The owner is right that this
fights the blueprint: **R18/R24 say goblins are PRODUCED BY THE GOBLIN TOWER** — *"feed it shapes from
inventory and it makes 1 goblin per shape"*, the shape deciding which of six kinds. That tower is S153
and does not exist.

⚠ **Stated plainly: removing it reverses an earlier owner ruling.** The starter goblin came from the
owner's own S139 spec (*"each player starts with one goblin of every kind"*), written before the tower
defence pivot. The TD design supersedes it — later and more specific — but this is a reversal, not a
bug fix, so it needs an explicit word rather than my assumption.

### ✅ F5 — what the owner asked for is already almost true

*"everyone should start with nothing but the castle and one gatherer"* — `seedStartingGatherers` already
gives exactly one gatherer + 100 points per seat, human and bot alike. Only F2 and F4 break it.

---

## 3. PROPOSED SCOPE — three priorities, each independently shippable

### PA — THE OPENING IS EMPTY (fixes F2 + F4, and F3 by deletion)
- **Delete the starter goblin.** `seedStartingUnits` retires; the goblin stays in the codebase as a
  fully-working creature type, waiting for its tower in S153. Retained, not deleted, and still tested.
- **Stop seeding bot pentagrams and lightning hubs.** `seedBotSpawners` is gated OFF behind a named
  constant rather than deleted — it is genuinely useful as a dev/demo seam, and the S147 lesson about
  "retained means still reachable and still proven" applies.
- Result: **every seat opens with a castle, one gatherer, 100 points and nothing else.** Symmetric.
- F3 evaporates: nothing is seeded, so nothing is seeded in the wrong zone.

### PB — ONE HP SCALE, AND WEAPONS THAT DIFFER (fixes F1 + the laser)
The real defect is that **every defender deals exactly 1**, so no weapon can ever be stronger than any
other. Proposed: give defenders a **per-kind damage** value against creatures instead of the shared
`CREATURE_HIT_DAMAGE`, so the roster finally means something:

| weapon | today | proposed | reads as |
|---|---|---|---|
| HELGA slap | 1 | **3** | two slaps kills a goblin |
| Laser turret beam | 1 | **6** | one beam kills a goblin — it is the heavy weapon |
| Stink bag / aura | 1 | area chip | crowd control, not single-target |
| Voltkin zap | 1 | **2** | unchanged in feel |

⚠ **MEASURED, NOT GUESSED.** Every number above is a first proposal; PB includes a test that pins the
*relationships* the owner cares about ("HELGA kills a goblin in 2", "the laser is the strongest
single-target weapon") rather than the literals, so a later rebalance cannot silently invert them.

### PC — CASTLE HP + ELIMINATION (R29/R10/R20) — **the thing that makes it a game**
Not in the owner's complaint, but it is the missing half of what makes any of the above matter: today
nothing can die and nothing can be lost. Included as a *proposal only* — say the word and it moves out.

---

## 4. WHAT I WILL **NOT** DO WITHOUT A RULING

- Reverse the S139 starter-goblin ruling (F4) — flagged in §2, not assumed.
- Retune `GOBLIN_DAMAGE_VS_PRIMITIVE` (167 / six-hits-per-connector). That is the owner's own
  *"6 attacks"* rule and it is coherent; the defect is on the defender side, not here.
- Touch `PRIMITIVE_MAX_HP`, which `constants.ts:1184` records as load-bearing for the integer-DoT invariant.

## 5. EXIT GATE

`tsc` 0 · full vitest · `e2e:gating` · a fresh solo match contains exactly one gatherer, one castle and
**zero** creatures/structures for every seat · a bots match likewise · HELGA kills a goblin in 2 slaps
and the laser in 1 · `verify-deploy` 4/4 · screenshot of an empty opening board on both layouts.
