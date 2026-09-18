# SPARK — THE CANON. How things ARE.

> *"Let's resolve all of this once and for all so I don't have to go over all those things … this
> should be in our canonical document somewhere that you go to to see how things are. It seems like
> you fucking come back to the same things."* — owner, S180

**This file is the answer to "is X still in the game?" and "how much does Y hit for?".**
Read it before writing a table, a plan, or a question to the owner.

⛔ **IT CANNOT ROT, AND THAT IS THE POINT.** Every number below is pinned by `src/canon.test.ts`
against the constant it claims to describe. If someone retunes the game and this page goes stale,
**a test goes red** — it does not quietly mislead the next session. `UNIT_STAT_TABLE.md` is what
happens without that: it still lists Vlad at 90 pool while the code says 260.

⚠ **Why this file exists at all.** S180 wrote a targeting table that listed seagulls as a live
mechanic. They have been archived for dozens of sessions, and `constants.ts` says so in as many
words — *"FOUR WHOLE SUBSYSTEMS ARE THEREFORE UNREACHABLE IN PRODUCTION"*. The information was never
missing. It was not read. A prose doc alone would have the same failure mode, which is why the tests
exist.

---

## 1 · ⛔ WHAT IS NOT IN THE GAME

`HAZARD_SPAWN_ENABLED` is **permanently false** in a shipped build — it can only be turned on from a
Playwright test seam (`window.__TEST_HAZARDS_ENABLED__`). `physicsLoop.ts` is the only producer of
all four. So none of these can happen in a real match:

| | |
|---|---|
| **Seagulls and poop** | ARCHIVED. Do not list them as a mechanic. Do not ask about them. |
| **Potato blast** | ARCHIVED. Owner S179: *"there is no potato blast anymore since a while ago."* |
| **Bombs** | ARCHIVED. |
| **Rainbow flyover** | ARCHIVED. `world.rainbowSwitchTick` has one writer that can never fire. |

Dead by ruling (R14/R23), not by accident. Each one looks like an oversight from inside its own file,
which is exactly why it is recorded here instead.

**Also switched off:** leader score-decay (R28) — the code stays in `scoring.ts`, gated.

---

## 2 · ⭐ THE ONE STAT LADDER. EVERY POOL, EVERY HIT, ONE UNIT.

```
pool   = HP  × (1 + 0.2 × DEF) × 5     fifths     unitPoolFifths(hp, def)
damage = ATK × (1 + 0.2 × PEN) × 5     fifths     attackFifths(atk, pen)
```

The ×5 is what makes every number whole. **There is no conversion anywhere: the number the sim
subtracts IS the number the player reads.**

⛔ **BEFORE INVENTING ANY DAMAGE OR HP NUMBER, ASK WHAT ITS HP/DEF OR ATK/PEN IS.** A bespoke
constant on its own scale is this project's most-repeated defect. `GOBLIN_DAMAGE_VS_PRIMITIVE` — a
flat 167 every creature dealt to a shape, boss and goblin alike — survived 19 sessions and became the
owner's S177 bug report.

### A structure is on the same ladder

Its HP and DEF are both its connector count: `pool(n) = n × (5 + n)`.

| connectors | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|
| pool | 50 | 36 | 24 | 14 | 6 |

That full pool is the cost of **ONE** connector; the survivors re-form at the lower count, so
felling a 5-connector tower costs **130**. Damage banks **structure-wide**, and overkill **spends
into the next connector** rather than being wasted — so a boss's 150 takes the 50, then the 36, then
the 24 in a single blow.

### Shapes

| | pool | |
|---|---|---|
| A shape **lying on the ground**, never built | — | **Not a target at all.** Only a gatherer collects it; a spark can carry one taken back out of the castle. |
| A shape **built but not connected** to anything | **5** | 1 HP / 0 DEF. One hit from anything kills it. |
| A shape **inside a structure** | n/a | **Not targetable.** You kill a building through its connectors. `PRIMITIVE_MAX_HP` (70) still governs area damage. |
| A **stink bag** | **5** | 1 HP / 0 DEF. Anyone one-hits it. It is a placed lone shape and obeys the same rule. |

---

## 3 · THE CASTLE

| | |
|---|---|
| Castle pool | **2500** (`CASTLE_MAX_HP`) — raised from 1500 by the owner in S181 |
| Its gun's shot | **40** fifths — `attackFifths(5, 3)`, i.e. `CASTLE_ATK` 5 / `CASTLE_PEN` 3 |
| Damage an attacker deals to it | **its own `attackFifths(atk, pen)`** — the same ladder as everything else |
| Goblins needed to fell a keep | **between ten and twelve**, measured S181 through the real host tick |
| Regen, once bought | **25 / 30 / 35 / 40 / 45** HP per second by level (1.0–1.8 % of the pool) |

⭐⭐ **S181 — THE OWNER RAISED THE POOL TO 2500 AND ITS DAMAGE ×5.**

*"Raise tower total health to two thousand five hundred points, just like how much you need to win.
So far it's a thousand five hundred."* and *"the damage output of the tower should be stronger. It
should be like five times more than it is now."*

⛔ **THIS IS NOT A CONTRADICTION OF HIS S180 RULING, AND THE NEXT SESSION MUST NOT "FIX" IT BACK.**
In S180 he was asked whether the pool was 2500 and answered *"the castle pool was 1,500 … and the
2,500 is how many points someone needs to win"* (`PHASE_1_WIN_SCORE`) — he was correcting what 2500
MEANT, not refusing it as a pool. In S181 he chose to move the pool to it, deliberately matching the
win score. A clarification, then a decision. Both are his.

⚠ **AND THE ×5 WENT ON THE LADDER, NOT ON THE NUMBER.** `CASTLE_ATK` 1 → 5 with `CASTLE_PEN` held at
3, so `attackFifths(5, 3)` = 40 = exactly five times the old 8. Multiplying a flat 8 would have been
a castle number on its own scale again, 19 sessions after `GOBLIN_DAMAGE_VS_CASTLE` was retired for
being one. **A consequence he chose knowingly: the castle now one-shots a shield goblin**, so it no
longer merely punishes leakers.

⚠ **THE REGEN ROSE WITH THE POOL, AND HE DID NOT ASK FOR THAT IN WORDS.** R128 was given in PERCENT
(1.0–1.8 % of max per level); `15/18/21/24/27` was its consequence at a 1500 pool, never the ruling.
At 2500 the same percentages give 25/30/35/40/45 — a ~67 % buff that rode along. Honouring the
percentage is honouring the ruling, but it is flagged here because it is a balance change nobody
asked for out loud. One line in `CASTLE_REGEN_PCT_BASE` reverses it if he wants the old rates back.

**And the flat 6 is gone.** *"Why does every attacker hit the castle for a flat of six? That's not
correct. Every attacker hits anything based on its damage output, which we know the algorithm for.
Doesn't matter if it's a connector, a castle, or another enemy. That's what I need you to get. And to
actually wire."*

So a melee goblin deals **12** to a keep and Vlad deals **150**, off the one ladder.
`GOBLIN_DAMAGE_VS_CASTLE` is retired in place, unread — the last bespoke damage constant in the game.

⚠ **AND IT RETUNED THE SIEGE TWICE, MEASURED RATHER THAN ESTIMATED BOTH TIMES.** Through the real
host tick (`castleGuns.test.ts`): S180's ladder change moved the melee goblins needed to fell a keep
from about **fifteen to between eight and ten**; S181's pool-and-gun change moved it to **between ten
and twelve** — 10 leaves it at 532, 12 takes it. ⭐ Note that is only ~1.2× harder, not the 1.67× the
pool ratio suggests: the gun got five times stronger at the same time and thins the push. **Guessing
from the pool alone would have been wrong, which is why the fixture is re-run and never reasoned
about.** One leaker still deals nothing — the gun kills it before its first swing. One fixture's
reading, not a law.

⛔ **THE CASTLE IS STILL THE ONE EXCEPTION ON THE OTHER SIDE OF THE LADDER:** its POOL is a flat 2500
rather than `hp × (1 + 0.2 × def) × 5`. Its DAMAGE TAKEN and its DAMAGE DEALT are both fully on the
ladder; its pool is not, and the owner has never asked for it to be.

## 4 · WHAT CAN BE ATTACKED, AND WHAT CANNOT

| | attackable? |
|---|---|
| Creatures | **yes** |
| Connectors | **yes** — this is how buildings die |
| A built-but-unconnected shape, and a stink bag | **yes**, one hit |
| The castle | **yes** |
| Helga (a unit-class defender) | **yes** |
| A tower — turret, stink tower, goblin/race/tier-9 | **no.** It has no pool of its own; it dies by recipe-break when its connectors go. |
| A shape inside a structure | **no** |
| A shape lying loose on the ground | **no** |
| **Gatherers** | **no — intended.** Nothing in the game can touch them. |
| **Your avatar** | **no.** The hunter catches and *benches* you; that is not damage. |
| **The border wall** | **no.** It cannot be damaged, and it comes down during FIGHT. |
| Spawners | not as an object — the pentagram dies when its shape recipe breaks, like any structure |

**The hunter** spawns **once per match**, when the leader first reaches **75%** of the win score, and
goes after that leader's avatar.

---

## 5 · WHO SHOOTS WHAT

| building | targets | range |
|---|---|---|
| Laser turret | creatures only | 420 |
| Stink tower | creatures only (its thrown bag splashes shapes) | 260 |
| Helga | units only | 380 |
| Castle gun | creatures only, nearest enemy in range, every 4 s | 300 |
| Every tower that emits units | nothing — it makes units, it does not shoot | — |

Units: see `S180_TARGETING_TABLE.md`, which is the live working document while the owner rules on it.

---

## 6 · THE WIRE

`PROTOCOL_VERSION` is **46**. A mismatched peer is **refused outright** — there is no degraded-play
path. An **additive-optional** field costs no bump; a **required** new field, or a new discriminant
value on an existing action, does.

Already on the wire, so a client can read them for free: creature `ehp`, defender `ehp`, primitive
`hp`, `castleHp`, and **`Bond.damageFifths`**. Each is emitted **only when damaged**; absent means
full, and both peers recompute it identically from the type. **A live enemy health readout therefore
costs nothing.**

⚠ **`Bond.damageFifths` WAS MISSING FROM THAT LIST UNTIL S182, AND IT IS THE MOST LOAD-BEARING ITEM
ON IT.** A structure's whole durability lives on its connectors (R75/R173-B), so *every* building
health readout — the bar, the FIX button, and the damage ramp in §9 — reads this field and nothing
else. It is serialized additive-optionally (`save.ts:1836`, emitted only when > 0, restored `:1665`)
and hashed at both sites (`stateHashFull.ts:278` union, `:547` projection). A session that read the
old list would have concluded a building's health was NOT on the wire and gone looking for a
protocol bump it did not need.

## 7 · ⭐ THE LIGHTNING HUB'S DAMAGE RAMP (S182) — THE PILOT, AND IT IS A PILOT ON PURPOSE

The hub is the **first and so far only** building with real damage-state art: a 24-frame ramp from
pristine to rubble, `public/art/lightning-hub/`, built from the owner's contact sheet by
`scripts/build-sheet-atlas.mjs`.

⛔ **THE OTHER TWELVE TOWERS ARE DELIBERATELY NOT MIGRATED.** *"We're gonna do this one at a time.
We're not gonna do all of them because it's not gonna work, you're gonna get confused, you're gonna
get things wrong. Currently you're just gonna focus on the lightning hub. I will present them one
after another."* `RAMP_SPECS` in `render/structureRamp.ts` has exactly one entry, and `canon.test.ts`
asserts that it does. Adding the second is the owner's call, not a tidy-up.

| health | frame | |
|---|---|---|
| 100 % | 1 | pristine |
| 50 % | 12 | the "damaged" plate — the same `TOWER_DAMAGED_BELOW` the health bar turns amber at |
| 34 % | 16 | barely standing, still repairable |
| **below 33 %** | **17 → 24** | the death run, then the self-destruct |

⭐ **THE THRESHOLD AND THE FRAME COUNT ARE THE SAME BOUNDARY, NOT TWO NUMBERS KEPT IN STEP.** 8 of 24
frames is exactly a third, so "the frame is ≥ 17" and "the health is below `STAR_SELFDESTRUCT_BELOW_FRAC`"
are one test. `structureRamp.test.ts` asserts the equivalence at every integer fifth of the pool.

- **R182-A — below a third, the hub self-destructs. HUB ONLY.** *"From thirty two percent it will just
  get self destroyed, but it is a suicide drone building, so it makes sense. We won't do it for every
  building."* The ramp generalises; this threshold does not.
- **R182-B — the percentage is the hub's OWN star**, `starHealthFrac` over `hub.bonds`, not over its
  connected component. *"A hub welded into a big lattice can reach thirty three percent on its own
  bonds. The sim still considers the wider structure healthy, but we don't care about that … the
  neighbouring shapes are protecting it then, and it's fine."* ⛔ **The divergence from
  `damageConnector`'s component-wide pool is deliberate. Do not reconcile it.**
- **R182-D — the ramp PLAYS THROUGH.** *"You don't skip them, you just run them through … if he
  destroys a whole structure in one hit, within like one second it looks like a whole structure got
  destroyed."* The frame cursor is **client-local presentation state**, never on the wire.

⚠ **AND IT IS A REAL BALANCE CHANGE, MEASURED.** The death trigger moved from "the star breaks"
(banked 50 of a 50 pool) to "below a third" (banked 34), so a five-armed hub now falls to **3**
melee-goblin swings instead of 5 and **5** chewer bites instead of 8 — about 40 % faster against
exactly the swarm its own drones counter. One-shot attackers are unchanged. The counterweight is that
it also **detonates** 40 % sooner.

⛔ **THE BLAST ITSELF IS UNCHANGED AND IS AN OPEN QUESTION.** `applyStructureSelfDestruct` still calls
`applyRadialClear` — it **deletes** every enemy creature and shape within `STRUCTURE_SELFDESTRUCT_RADIUS`
outright rather than dealing ladder damage, and (per S157 P0) it **spares the owner's own** shapes and
units. R182-C would replace the raze with 120 fifths, which would not kill a tier-9 boss where today's
blast deletes one. **Not built. See §9.**

## 8 · REPAIR

FIX is **BUILD-only** (R19) and prices what the structure LOST (R13). S182 added the case that lost
nothing:

- **Missing nodes** → the missing shapes themselves. Unchanged.
- **Damaged but intact** (chipped shapes, or a hurt connector with nothing destroyed) → **ONE shape,
  flat.** R182-E: *"If there's only an amount of HP missing but no connector destroyed … then it takes
  one shape. So far it takes NO shape — that's not correct … whether it's one HP or fifty HP."*
  ⚠ It used to be **free**, so a dented tower is no longer unconditionally repairable — with an empty
  bank, FIX now reads `NEED 1 MORE`.
- **Which shape** is `repairFeeShapeFor`: the blueprint's **most numerous node type**, ties broken by
  first appearance. ⚠ The rule is MINE — he dismissed a per-recipe table as over-thinking — but it
  lands on both examples he reached for himself (pentagram → Triangle, goblin tower → Circle).
  `structureRepairFee.test.ts` asserts the derivation over every registered blueprint, so it can
  never become a copied table.

⛔ **TWO REPAIR LIMITS THE OWNER HAS NOT SEEN YET, BOTH CONFIRMED IN CODE:**

1. Repair only works during BUILD, so "a repairable wreck" means *repairable between rounds*. He has
   accepted this (R19).
2. **One friendly hand-placed shape bonded onto one hub leaf makes that hub permanently
   unrepairable.** `blueprintGroupOf` returns null if ANY member of the connected component has
   `origin === null`, and `seatStructureAt` walks the whole component. S158 B2b fixed exactly this
   lattice problem for the RECIPE (`isStarAt` walks the hub's own bonds) and never fixed it for
   REPAIR. Not fixed here either — it is a scope decision, not an oversight.

---

## 9 · ⛔ OPEN — needs the owner, do not guess

*(Both of S180's castle questions were answered — see §3.)*

### ⛔ R182-C — the lightning hub's self-destruct DAMAGE. **UNANSWERED. Nothing was built.**

He ruled *"four times a drone's damage"* = 4 × `attackFifths(DRONE_ATK 5, DRONE_PEN 1)` = **120
fifths** — **believing the blast had no number. It has something else entirely.**

`applyStructureSelfDestruct` calls `applyRadialClear`: it **deletes** every enemy creature and shape
inside `STRUCTURE_SELFDESTRUCT_RADIUS` (240 px) outright. That is an instant-kill radius, not a number
on the ladder, and the difference is not cosmetic — **120 fifths would not kill a tier-9 boss** (pools
260–462) where today's blast deletes one where it stands.

⚠ **And it already spares the owner.** S157 P0, on his own ruling (*"lightning hubs blow up own
structures or nearby friendlies … they shouldnt be able to hit friendlies in friendly territory"*),
made the blast exempt the owner's shapes and units. So his later *"he will also bring down some of his
own connectors"* is **not current behaviour**, and making it so would **reverse S157**.

**TWO ANSWERS NEEDED:**
1. 120 fifths of ladder damage replacing the instant-kill raze — or keep the raze?
2. Should the blast damage the hub owner's own connectors, reversing S157 P0?

S182 built the ramp, the threshold and the repair fee and **left `applyStructureSelfDestruct`
byte-identical**, deliberately. `canon.test.ts` asserts it is still the radial clear, so this cannot be
quietly half-answered.

## 10 · HOW TO KEEP THIS HONEST

- Add a number here only with the constant it comes from, and add its assertion to `src/canon.test.ts`
  in the same commit.
- When the owner rules something, it lands **here**, not only in a handoff. A handoff is read once;
  this is read every time.
- If this file and the code disagree, **the code wins and this file is the bug** — go fix it, and say
  so, the way `UNIT_STAT_TABLE.md` should have been fixed three sessions ago.
