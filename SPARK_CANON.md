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
into the next connector** rather than being wasted: the struck connector falls first, and what is
left walks on — to the survivor nearest where the hit landed (⚠ MINE, the order: squared distance,
then the lowest bond id) — felling each connector while it covers that connector's pool at the
re-formed count, and banking the rest on the structure. So a boss's 150 on a fresh 5-connector tower
takes the 50, then the 36, then the 24, the 14 and the 6 — **the whole tower, 130, in a single blow**
— and the last 20 has nothing left to land on; a 100 takes the 50 and the 36 and banks 14 on the three
that stand.

> *"I do want the overkill to carry forward because there's only a few like enemies that can actually
> do that … one hit, boom, done. For now, it destroys … however many connectors the hit does … If it
> looks too OP, then later we will change that."* — owner, S191

⭐ **BUILT S191** (`severWithCarry`, on every connector-damage path: creature strikes, the Voltkin
chain, the suicide blast, the hub blast, Ra columns and raids); `canon.test.ts` constructs both
examples through the real `damageConnector` and `SEVER_BOND`. ⚠ Until S191 this sentence stopped the
150 at the 24 and the tree carried nothing at all (the remainder was deleted with the struck bond);
the ladder continues to the 14 and the 6, and so does the code.
⛔ **THE CARRY NEVER LEAVES THE STRUCK CONNECTOR'S OWNER (S192, audit CARRY-1).** It only lands on bonds
whose BOTH ends were placed by the struck bond's owner — never across a weld onto what is welded on, so a
strike on an enemy bond cannot fell the striker's own connectors (S162) and the hub blast's leftover cannot
fell the hub owner's (S157 P0). `connectorCarryOwner.test.ts`.
⛔ **AND A STRUCK WELD CARRIES NOTHING (S193, audit CF-1).** The owner above is read off the struck bond's
`aId`, and on a weld (mixed ends) which end that is is an accident of placement order — a Voltkin's bolt on
a weld whose `aId` was his own seat carried into his OWN connectors. The weld still falls; its overkill has
no single owner to stay on, so it lands nowhere (⚠ MINE: a third seat striking a weld between two others
carries into neither side either). `connectorCarryWeld.test.ts`.

### Shapes

| | pool | |
|---|---|---|
| A shape **lying on the ground**, never built | — | **Not a target at all.** Only a gatherer collects it; a spark can carry one taken back out of the castle. |
| A shape **built but not connected** to anything | **5** | 1 HP / 0 DEF. One hit from anything kills it. |
| A shape **inside a structure** | n/a | **Not targetable.** You kill a building through its connectors. `PRIMITIVE_MAX_HP` (70) still governs area damage. |
| A **stink bag** | **5** | 1 HP / 0 DEF. Anyone one-hits it. It is a placed lone shape and obeys the same rule. |

---

## 2b · ⭐⭐ MAGIC RESISTANCE (MRES) — ONE MORE STAT ON THE SAME LADDER (S192, `s192/magic`)

> *"magic resistance, which is basically on the same ladder as defense levels. One magic resistant level is 1.2,
> two … 1.4, these 1.6, etc."* · *"nothing makes magic stronger, it's just different."* — owner, S192 (R192-M1, M4)

**THE RULE.** DEF is folded into the POOL (§2), so against magic the one bar must behave as if it were
`HP × (5 + MRES)` long. A magic hit of `A` fifths therefore lands as

```
magic landed = floor(A × (5 + DEF) / (5 + MRES))     never below 1 on a real hit     `magicHitFifths`
```

The HP cancels. **At MRES = DEF it is `A` exactly** — so every unit whose MRES equals its DEF plays exactly as it did
before magic existed. `magicResist.differential.test.ts` proves it on a four-seat bots match: an all-physical twin and an
MRES = DEF twin hash identical on EVERY tick for two whole waves (or the whole match, if it ends sooner), with a floor PER
SOURCE — the Ra column, the Voltkin chain, the zombie ROT, SCORCHED GROUND, a SCORCHED EARTH cast (units, Helga, connectors),
the stink aura and the stink cloud each have to reach the rescale. It proves the plumbing, not the table.
The damage number looks the same; magic is not a colour (R192-M4).

**WORKED CASE — the Archdemon, DEF 8 / MRES 14: a magic 300 lands 205** (`floor(300 × 13 / 19)`). A physical 300
lands 300. A soldier with MRES = DEF takes a magic 300 as 300.

**A one-fifth DoT beat cannot use that floor** (it would always land 1), so a magic DoT is spread over the victim's own
beats: `floor((b+1)·r) − floor(b·r)` with `r = (5+DEF)/(5+MRES)` (`magicDotFifths`). Exact on average, 1 on every beat
at MRES = DEF, and **some beats land 0** when MRES > DEF — HIS (R192-M12): *"can be totally resistant to very low level
magic, I accept that"*.

### What is magic, and what is physical (R192-M2 / M3)

| MAGIC | PHYSICAL — *"Physical, anything else"* |
|---|---|
| the **Ra column** — POWER OF RA, every WRATH OF RA charge, the bot cast, AND the Pharaoh boss's ritual (one `landRaColumn`). ⭐ **PER SHARE**: the column's pool is split first, then EACH share is defended by its own target's MRES | every swing, shot and bite |
| the **zombie boss ROT** aura (DoT) | every blast: the suicide goblin, the drone, the hub self-destruct, the **zombie boss death blast**, a stink bag bursting, the stink tower's death blast and bag splash |
| **SCORCHED GROUND** (the passive) and **SCORCHED EARTH** (the cast) (DoT) | the castle guns, the laser, Helga's slap, a raid |
| the **STINK TOWER aura** and the landed-bag **stink cloud** (HIS, S192) (DoT) | the overkill a broken connector carries on (already-landed damage) |
| the **Voltkin's chain lightning** — every hop INCLUDING the first zap — ⭐ HIS (S194): *"All Volkan zaps … the whole chain doesn't matter. First hit, second hit, or fourth hit, they're all magic damage."* | |

`magicResist.callSites.test.ts` pins every production damage call and its class, file by file, plus every direct pool write.

### Who has how much MRES (R192-M5 / M6 / M10)

| | MRES | |
|---|---|---|
| a **STRUCTURE** of `n` connectors | **`n`** = its DEF | HIS: *"towers will inherently have the same magic resistance as their regular defense"* — so magic lands on a tower exactly as physical |
| a **shape**, a **stink bag** | **0** = DEF | |
| a **GLOBAL** unit (goblins, chewer, Voltkin, drone, direwolf, locusts) and **Helga** | **= its own DEF** | HIS (R192-M10) |
| a **race's** tier-3 unit | demons **4** · mummies **4** · vampires **3** · nagas **2** · orcs **1** · zombies **0** | ⚠ MINE numbers on HIS order (R192-M6) |
| the **castle soldier** (R125 1/1/1/1) | **1 for EVERY race** (`CASTLE_SOLDIER_MRES`) | ⭐ HIS (S194): *"They all have just one, so they're all equal between the races."* Until S194 it read its owner's race from the row above |
| a tier-9 **BOSS** | **6 + 2 × race level** — Archdemon / Pharaoh **14** … zombie boss **6** | ⚠ MINE |

⚠ The elite piranha and the bat swarm keep their base unit's level (not ×N). A drafted DEF pick grows the pool, so it helps
against magic too; ⛔ **it does NOT raise MRES — RULED, DO NOT RE-ASK** (R192-D1, re-stated S194: *"We are going to add its own magic resistance draft … And also for the castle upgrades, there's going to be its own … magic resistance upgrade. We've answered that … don't forget it anymore. I don't want to answer it again."*). MRES has its own castle row (§3d). ⭐ S193 — the general MRES draft card is BUILT
(R192-D1, `s193/mres-card`): the wave-26 draft's general option, **WARDED** — see §3d.

### The castle's MRES axis (R192-M9)

*"whatever amount of defense it currently has just give it the same amount of magic resistance but moving forward there
should be … its own upgrades"* — the keep starts at MRES **0** (its starting DEF) and **MRES is its own bought row**:
**100 VP** a point, **10** max, like every axis (§3). A bought DEF point no longer raises MRES. A magic hit on the keep lands
`floor(A × 5 / (5 + MRES level))`, never below 1.

### The RESIST cue (R192-M12, ⚠ MINE look)

When a magic DoT beat lands 0, a grey **"RESIST"** floats over the unit — at most **once a second** per unit, never over a unit
whose MRES = DEF. DERIVED from synced state every frame (`state/magicResistCue.ts` → `render/damageNumbers.ts`); nothing
rides the wire for it. It covers the ROT, SCORCHED GROUND, SCORCHED EARTH casts, the stink aura and the stink cloud.

---

## 3 · THE CASTLE

| | |
|---|---|
| Castle pool | **2500** (`CASTLE_MAX_HP`) — raised from 1500 by the owner in S181 |
| Its gun's shot | **40** fifths — `attackFifths(5, 3)`, i.e. `CASTLE_ATK` 5 / `CASTLE_PEN` 3 |
| Damage an attacker deals to it | **its own strike — `creatureAttackFifths(creature)`**: its type's `attackFifths(atk, pen)`, drafted-buffed when its seat drafted ATK/PEN (S190, §3d) — the same ladder as everything else, through the keep's DEF |
| Goblins needed to fell a keep | **between ten and twelve**, measured S181 through the real host tick |
| Regen, once bought | **25 / 30 / 35 / 40 / 45** HP per second by level on an un-upgraded keep — 1.0–1.8 % of the seat's **UPGRADED** total (owner ruling R190-C, S190; §3d) |
| Bought stats | **HP / ATK / DEF / PEN / MRES**, 100 VP a point, 10 per axis — live buttons since S188 (§3d); MRES (magic resistance) added S192 by his ruling: *"either defense or resistance"* — the keep starts with MRES = its starting DEF, then each axis is bought apart |

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

⭐ **S190 — AND R190-C SETTLED WHICH "MAX": THE UPGRADED TOTAL.** *"your regen is based on the current
health … upgraded total."* A keep that bought HP regenerates a percent of its bought ceiling — §3d.

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

## 3b · ⭐⭐ THE WIN BAR RISES WITH THE WAVE — "NIKUD DINAMI" (S186)

> *"It takes 2,500 points to win in the first five waves. After the fifth wave and until the 10th
> fight wave, it's 5,000. After that, if nobody won with 5,000 points, or by destroying each other's
> castle until then, then it climbs to 10,000 until level 15 from level 10. Then, if nobody won till
> then, it climbs to 20,000 from level 15 to level 20. If nobody won then, from level 20 to level 25,
> it takes 50,000."* — owner, S186

| wave (inclusive) | win score | multiplier of `PHASE_1_WIN_SCORE` |
|---|---:|---:|
| 1 – 5 | **2,500** | ×1 |
| 6 – 10 | **5,000** | ×2 |
| 11 – 15 | **10,000** | ×4 |
| 16 – 20 | **20,000** | ×8 |
| 21 – 25 | **50,000** | ×20 |

`WIN_SCORE_BANDS` + `winScoreForWave(waveNumber)` in `constants.ts`. The win gate is ONE site,
`gameState.ts`.

⭐ **HE CLOSED THE BOUNDARY QUESTION HIMSELF, SO IT IS NOT OPEN.** *"If someone is at level four,
then it's up to 2,500 points. Still. Level five. Still 2,500 points. If nobody won then, then level
six, it's already 5,000 points."* **Each band is INCLUSIVE of its top wave.**

⛔ **THE BAR MOVES; THE BANKED SCORE IS NEVER RESET, AND THAT IS THE ENTIRE FEATURE.** A seat holding
3,000 at wave 5 has won. The same seat that reaches wave 6 without winning now owes 5,000. His
reason: *"in the beginning you really need to build as many gatherers and speed to get as many
shapes. But then you can't cheat by building a lot of them and then just letting the points run at
level five and then everyone can win at level five."* **A session that "fixes" the bar so it cannot
overtake a banked score is reversing this ruling** — `dynamicWinScore.test.ts` drives the real gate
at waves 5 and 6 with the same 3,000 banked and asserts WIN then NOT-WIN.

⭐ **IT COST NO WIRE CHANGE.** `world.waveNumber` was already hashed and already rode the wire
additive-optionally (it drives the spawn rate), so both peers DERIVE the same bar from state they
already agree on: no new field and no four-sites work. The bands are stored as MULTIPLIERS rather
than absolute literals so the E2E `readTestWinScore()` seam still scales the whole ladder — absolutes
would have set the seam to 50 and left the sim demanding 5,000 from wave 6 on.

⛔⛔ **BUT IT STILL EARNED A PROTOCOL BUMP, AND S186 GOT THIS WRONG BEFORE ITS OWN AUDIT CAUGHT IT.**
The four priorities shipped claiming 47 was fine, reasoning only from *"no new field"*. `tickGameState`
is run by **every peer, including the client**, and it gates on `winScoreForWave` — so two builds both
advertising 47 would shake hands and then disagree about when the match ends. ⭐ **The precedent was
already in `protocol.ts`, in as many words:** 39→40 says *"⛔ THE BUMP IS FOR THE RULE, NOT FOR THE
FIELD … a v39 peer ends the match the instant ANY castle reaches zero, while a v40 host plays on …
Both peers run that function."* Identical mechanism. **See §6 for the live version.**

⭐ **THE TICK ORDER MAKES HIS BOUNDARY EXACT FOR FREE.** The wave increments on the BUILD edge in
`hostTick`, which runs BEFORE `tickScoring` (FIGHT-only, so it is skipped on the flip tick) and
before `tickGameState`. No score earned under bar N is ever judged against bar N+1.

⚠ **TWO THINGS HERE ARE MINE, NOT HIS, AND BOTH SAY SO AT THEIR CONSTANT:**

1. **Past wave 25 the bar CLAMPS at 50,000.** He did not speak to it. Climbing would quietly convert
   a long match into a castle-only match; falling back would make the bar *drop* and reward the
   coaster. One line reverses it.
2. **The hunter's trigger FOLLOWS the bar** (it is defined as 75 % of it). Pinned to the wave-1 value
   it would fire at 37.5 % of a wave-6 bar and 3.75 % of a wave-21 bar — spending the game's only
   anti-runaway measure before the race it polices has begun. The `hunterSpawned` latch makes this
   safe in both directions: an already-fired hunter cannot fire twice at a band jump.

⛔ **AND THE CASTLE NO LONGER MATCHES THE POINTS RACE — A REAL CONSEQUENCE, REPORTED NOT ABSORBED.**
`CASTLE_MAX_HP` is 2500 and its docblock says the number is *"deliberately the SAME as
`PHASE_1_WIN_SCORE` … the two victory conditions are meant to feel like equal-length races"*. From
wave 6 on that equality is gone: the castle stays a 2,500 race while the points race climbs to
50,000, so **the longer a match runs, the more decisively castle-rush becomes the correct
strategy.** Left unchanged deliberately — he did not ask, R88 pins one castle constant for every
seat, and raising it would retune every castle relationship measured in S181.

---

## 3d · ⭐⭐ THE UPGRADE DRAFT, AND THE KEEP YOU CAN NOW BUY (S187, LIVE S188)

> *"As the game starts, it gives you like five seconds to choose an upgrade, one of the two … on the
> left is like the regular one, the 10% HP to all spawned units, and on the right will be your racial
> one."* — owner, S187

A draft opens **before wave 1 and again on waves 6, 11, 16, 21** — `(wave − 1) % 5 === 0`. ⚠ **NOT on
waves 5/10/15**: `waveNumber` increments on ENTRY INTO BUILD, so the BUILD after wave 5's FIGHT is
wave 6. The original spec contradicted itself on exactly this point. So "level 0" is the wave-1 draft
(draft index 0) and "level 5" is the wave-6 draft (draft index 1).

| | |
|---|---|
| general track | HP → DEF → ATK → PEN, **cycling** (⚠ the wrap is MINE — he gave the order, not what follows PEN) |
| ⭐ the wave-26 card | S193, HIS (R192-D1): *"We'll do another one at level 26 … That's going to be the, the magic damage one."* The LAST draft (wave 26, `MRES_DRAFT_WAVE` = `LAST_DRAFT_WAVE`) offers **MRES — WARDED** in place of the cycle's DEF; waves 1/6/11/16/21 still offer HP/DEF/ATK/PEN/HP. No racial is built at level 25, so the deadline (and every bot) takes MRES |
| what an MRES pick buys | ⚠ MINE reading of *"+10 % MRES"*: **+10 % of the MAGIC-DEFENDED POOL** `HP × (5 + MRES)` (§2b), by the same `applyDraftPercent` — never "+1 MRES level", because no pick buys a level. Born into `Creature.mresFifths` (`draftedMagicPoolFifths`); a magic hit then lands `floor(A × HP×(5+DEF) / mresFifths)` (`landedFifthsPools`); physical hits are untouched. An orcs soldier: **6 → 7**, so a Voltkin's **33** lands **28** (`draftMresReaches.test.ts`, through the real host tick). ⚠ Its card art is NOT made — the S193 imagen call returned 404 on every Imagen model; the tile shows its text title (`GENERAL_CARDS_AWAITING_ART`) |
| the buff | **+10% of the ladder number, floored, minimum 1** — `applyDraftPercent`. ⭐ Since S190 (deploy #4) EVERY pick lands: HP/DEF on the pool, ATK/PEN on the strike — see *THE DRAFTED STRIKE* below |
| where the buff lives | **born into the creature**: the pool in `Creature.maxEhp` (S187), the strike in `Creature.atkFifths` (S190), each stored ONLY when a pick moved it and read through `creatureMaxEhp` / `creatureAttackFifths` — never re-derived from the type |
| ATK vs PEN | the ladder has two derived numbers, so an ATK pick and a PEN pick move the SAME strike, exactly as HP and DEF move the same pool |
| units already on the board | keep what they were born with — the strike too: a unit born before an ATK pick keeps its 6 (`draftAtkReaches.test.ts`, through the real host tick) |
| deadline | the whole BUILD. It **never freezes the sim** (R106), and the panel is **559 × 270** on the spawn disc (`PANEL_W` × `PANEL_H`), two tiles of **251 × 242** |
| racial track | ⭐ **LEVELS 0 AND 5 ARE LIVE FOR ALL SIX RACES (S188), AND LEVEL 10 FOR TWO (S190)** — THE SWARM for every vampire seat, WRATH OF RA for a mummies seat that took POWER OF RA (§3e). The tile is choosable exactly when `draftOptionsFor(wave, race, picks).racial` names a perk — i.e. when `RACIAL_PERK_BUILT` says its mechanic exists and the seat holds any perk it requires — and it then joins the hit-test and sends `'racial'`. Every other level-10 tile, and levels 15+, stay the dimmed COMING SOON tile, **absent from the hit-test** |
| a pick that was not offered | **refused** — `pickIsOffered` (S188) |
| what a racial pick buffs | **no ladder stat at all** — it is a mechanic, never an axis. ⚠ The label "R104" is a reading, MINE (S188): R104 itself is the no-overlap rule that keeps the draft off the CASTLE's numbers; `draft.ts` extends its line to the racial pick, and the type system holds it |

⛔ **THE FLOOR-AT-ONE RULE IS WHAT MAKES A PERCENTAGE POSSIBLE AT ALL**, and it is his:

> *"Ten percent of a one-one-one-one unit comes out as 0.6 … but we don't have a 0.6, so we just add
> one point. Instead of six health he will have seven. Anything that doesn't ship as at least a whole
> number you just give him the lowest amount possible, which is one."*

The castle-spawned unit is `1/1/1/1` (R125), so its pool is **6 fifths**. It compounds: 6 → 7 → 8. A
260-fifth boss gets a true 26. That is strictly better than R118's flat `+1 POINT`, which was the
same step for a chewer and for a Kraken. **R118 is superseded.** ⭐ S188 — the same rule floors every
racial percentage in §3e: a lifesteal heal, a split chewer's pool and its bite.

⭐⭐ **THE DRAFTED STRIKE — LIVE SINCE S190 (deploy #4, `s188/draft-atk`). AN ATK OR PEN PICK NOW REACHES
EVERY CREATURE STRIKE.** An HP or DEF pick raises the pool of every unit the seat spawns after it
(`draftedPoolFifths`, at birth in `makeCreature`); an ATK or PEN pick now raises its STRIKE the same way —
`draftedAttackFifths`, whose ONE production caller is `makeCreature` (`state/creatures/creature.ts`),
bakes it into `Creature.atkFifths`, and every strike reads it back through `creatureAttackFifths`: the
six arms of the creature attack, the Voltkin chain, the suicide and drone blasts, CORPSE EATER's bite,
the creature card and the fatal-blow floater. So the panel's *"hits 10% harder"* and *"cuts 10% deeper
through armour"* are kept promises now, and the general pick at waves 11 and 16 (ATK, then PEN) buys
what it says.

Worked strikes — one damage pick, then two, each `applyDraftPercent(attackFifths(atk, pen), n, 10)`:

| unit | ATK / PEN | type strike | 1 pick | 2 picks |
|---|---|---:|---:|---:|
| race unit | 1 / 1 | **6** | **7** | **8** |
| melee goblin | 2 / 1 | **12** | **13** | — |
| Voltkin | 3 / 6 | **33** | **36** | — |
| suicide goblin | 4 / 0 | **20** | **22** | — |
| lightning drone | 5 / 1 | **30** | **33** | — |
| tier-9 boss | 10 / 10 | **150** | **165** | — |

The creature card prints the creature's OWN numbers: "N a swing" is the strike it lands (a HELLSPAWN
child's share included) and "N pool" is `creatureMaxEhp` — a generation-1 HELLSPAWN card that read
*"7 a swing / 5 pool"* now reads *"3 a swing / 2 pool"*, and `fatalBlowFifths` credits the same number.

⛔ **THE PRE-S190 TRUTH, KEPT BECAUSE IT WAS LIVE FOR THREE DEPLOYS:** from S187 until S190 the wave-11
STRONGER and wave-16 PIERCING cards did NOTHING — `draftedAttackFifths` had no production caller.

⭐⭐ **R190-E — A DRAFTED ATK PICK BUFFS PHYSICAL HITS ONLY. HIS RULING (S190).** *"The Ra column is
considered a MAGIC attack."* So the Pharaoh's ritual column, POWER OF RA / WRATH OF RA and HELGA (a
defender — the draft reaches neither half of a defender) are NOT buffed (`creatureStrike.guard.test.ts`
keeps each on its SANCTIONED list). ⚠ **ONE QUESTION RECORDED FOR HIM, NOT CHANGED (audit DA-A2):**
boss-skill SUMMONS (the Pharaoh's locusts, the Warlord's direwolves), the Voltkin's lightning and the
suicide / drone blasts ARE buffed today — they are creatures' own hits. The lever if he says no: pass
`draftPicks` undefined for boss-summon types in `applySpawnCreature`'s null-spawner branch (it moves
the pool AND the strike together). A MAGIC damage class is on his list to design with him.

⛔ **AND IT AUTO-TAKES THE RACIAL ONE AT THE DEADLINE — HIS REVERSAL OF R106, LIVE SINCE S188.** R106
assigned the general; his S187 ruling governs: *"in the end of the build phase it just takes the
racial one automatically."* `autoPickFor` returns `'racial'` whenever a perk is on offer, so at levels
0 and 5 a seat that does not choose gets its RACE's perk — and so does every bot, which drafts through
the same deadline (`SPARK_RACES_SPEC` §9.5). ⚠ Where nothing is on offer — level 10 for zombies,
orcs, demons, nagas and a mummies seat without POWER OF RA; every race from level 15 — it still takes
the general option: a deadline that took a non-existent option would grant nothing.

⛔ **ONLY AN OFFERED OPTION MAY BE TAKEN (S188).** Until S188 `applyDraftChoice` pushed whatever `pick`
the intent carried, so a modified client could take ATK at the HP draft, or stack PEN forever. It was
latent while the panel could only send the offered general; it is not latent once a second option
exists. `pickIsOffered` admits exactly two things: this wave's general axis, and `'racial'` when this
seat's race has a built perk at this draft — and, for a perk with a requirement (`RACIAL_PERK_REQUIRES`:
WRATH OF RA needs POWER OF RA), only when THIS SEAT holds it (`racialPerkFor(race, index, picks)`).

⭐ **A RACIAL PICK IS ONE LITERAL FOR FOURTEEN PERKS.** `DraftPick = GeneralPick | 'racial'`. Which perk
it is follows from the seat's race and the pick's index, so it is never stored twice, and every
mechanic asks one question — `seatHoldsPerk` — which checks the RACE as well as the pick: a seat of
another race that picked its racial holds ITS OWN race's perk, never this one. ⛔ `isPoolPick('racial')`
and `isDamagePick('racial')` are false by construction, so the pick moves no pool and no damage
number (R104).

⭐ **EVERY TILE DRAWS ITS CARD (S188).** The general tile shows `general-<axis>`; the racial tile shows
`RACIAL_PERK_COPY[perk].card` while its perk is on offer — **18** cards in `public/art/upgrade-cards/` (the four general cards and one per registry perk; the WRATH OF RA card `l10-mummies` shipped AHEAD of its perk in S190 train A and is its perk's since deploy #4, so none is ahead),
fetched lazily (`upgradeCardUrl`), so a slow or missing card leaves the tile on its text title and
never blocks the panel. ⛔ A tile showing its card draws **no overlay title** — the name is baked into
the art and the two collided. ⛔ `drawAxisGlyph` is **deleted**, not dormant — owner: *"just a hand
drawn heart that looks gay"*. ⭐ `l10-vampires` (THE SWARM) shipped with its perk in S190.

### ⭐ THE CASTLE NOW CLIMBS TOO — §3b's CONSEQUENCE IS CLOSED

§3b had to record that castle-rush strengthens the longer a match runs, because the win bar climbed
to 50,000 and `CASTLE_MAX_HP` stayed 2,500. He has now answered it: **HP, ATK, DEF and PEN are
purchasable at 100 victory points each, capped at 10 per axis**, with the HP gain on the SAME five
wave bands as the win bar and the quarry:

| wave band | 1–5 | 6–10 | 11–15 | 16–20 | 21–25 |
|---|---:|---:|---:|---:|---:|
| HP per point | 250 | 350 | 450 | 550 | 650 |

⛔ **THE GAIN IS BAKED AT PURCHASE.** The seat stores an accumulated `hpBonus`, not a level it
re-derives — recomputing would re-price every earlier purchase at the current band.

⛔ **AND THE CASTLE STAYS OFF THE LADDER** (§2's deliberate exception). HP adds raw points; DEF
applies the ladder's ratio to INCOMING damage — `floor(amount × 5 / (5 + def))`, floored and **never
below 1 on a real hit**, so a keep can always be felled. ⚠ Past wave 25 the gain holds at 650; that
clamp is MINE, like the win bar's.

### ⭐⭐ S188 — AND NOW HE CAN PRESS THEM: THE FOUR CASTLE BUTTONS ARE LIVE

S187 built all four in the sim and nothing dispatched `UPGRADE_CASTLE_STAT` — his *"we just have
regen"* was exactly right. The castle panel now carries **five rows under REGEN — HP, ATK, DEF, PEN, MRES** (MRES since S192) —
each printing its level out of **10** (`CASTLE_UPGRADE_MAX_LEVEL`), its price **100**
(`CASTLE_UPGRADE_PRICE`), and on a second line what the NEXT point buys (`castleUpgradePreview` — for
HP, the CURRENT band's gain). A disabled row names its reason: `NEED 100` · `MAX` · `LOCKED` ·
`CASTLE LOST` · `NOT YOURS`. The castle's sheet prints the PURCHASED numbers: one ATK point turns the
**40** shot into **48** (`castleShotFifthsFor`).

⭐ **S193 (R192-W1) — A FIFTH KIND OF ROW, ABOVE BUY GATHERER: FIX ALL.** *"there should be a button on
your castle saying fix all. And then it just gives a mass command to all the gatherers to first go and
fix all the existing towers before … continuing to gather."* It is the panel's **top row**
(`CASTLE_ROW_KEYS[0]` = `fixAll`; ⚠ the position is MINE — the five stat rows (HP · ATK · DEF · PEN · MRES) stay directly under
REGEN), reads `FIX ALL  n` (n = the towers it would queue, `fixAllTargets`) and names its blocker:
`NOT YOURS` · `LOCKED` · `CASTLE LOST` · `BUILD ONLY` · `NO GATHERERS` · `QUEUE FULL` · `NOTHING TO FIX`.
It queues one FIX job per own tower that needs one, **nearest the castle first** (squared distance,
then lowest shape id) — see §8.

| | |
|---|---|
| a bought HP point | **adds its band gain to the keep's CURRENT HP too**, not only to its ceiling |
| an absent `castleHp` on the wire | reads as **that seat's upgraded ceiling** (`castleMaxHpFor`), not the flat 2500 — see §6 |
| a rematch | **every bought stat resets** — they used to carry into the next match |
| regen | a percentage of the seat's **UPGRADED** total — owner ruling **R190-C** (S190), built by `s189/units` |

⛔ **THE HP FIX IS HIS TABLE, READ LITERALLY.** *"Each a hundred victory points. If it's in the first
five waves then by 250 …"* — owner, S187. He is buying 250 HP, and a keep that paid for it must HAVE
it. Raising only `hpBonus` moved the ceiling and left `castleHp` where it stood, so without regen the
purchase bought nothing but a longer bar — 2500 / 2750. The heal is the baked delta, capped at the new
ceiling, and never on a fallen keep (R131).

⛔ **THE REMATCH FIX WAS A HIGH FINDING.** `applyStartGame` reset `castleRegenLevel` and never the S187
`castleUpgrades`, so a seat that bought in match 1 opened match 2 with the upgraded shot, reduced
incoming damage and a ceiling above the pool it had been reset to — reachable the moment the buttons
existed. The reset now comes FIRST and `castleHp` is set from the reset seat's own ceiling, so the two
cannot drift.

⭐⭐ **R190-C — REGEN IS A PERCENT OF THE UPGRADED TOTAL. HIS RULING (S190), BUILT IN DEPLOY #4.**
*"your regen is based on the current health … upgraded total."* `castleRegenPerSecond(level, maxHp)` now
takes the seat's own ceiling (`castleMaxHpFor`), for the RATE as well as the cap, so buying castle HP buys
regen too: one wave-1 HP point (**2,750**) regenerates **28** HP/s at level 1 and **50** at level 5, while an
un-upgraded keep keeps its **25–45** (§3). ⚠ A bought pool makes rounding live — 2,750 × 1.8 % is 49.5 —
so the percent is held in tenths and the one division rounds half-up (`Math.round`), the same on every
engine. (Until S190 this paragraph read *"REGEN IS MINE, AND LEFT ALONE ON PURPOSE"* — a percent of the
flat pool, unruled. He has ruled it.)

### ⭐ A FUTURE DIRECTION HE WANTS ON RECORD — A RANDOMISED UPGRADE POOL (S187)

> *"Eventually we could even add a randomizer of upgrades. There'll be a pool of 20 upgrades for
> general, and a pool for racial, and you never know which upgrade will come at every level. It could
> be tiers of upgrades too — five different upgrades you can have at level five, which are racial or
> global, and you don't know. So each game will be completely different. That makes it even more
> interesting. Just something to record to think about for the future."* — owner, S187

⚠ **NOT SCHEDULED, NOT DESIGNED — recorded so it is not re-invented from scratch.** His reasoning for
the whole draft system is that it makes the game DYNAMIC: players take different paths and start
planning around them (*"if I do a general upgrade, then when we reach level 15 my racial is going to
be a lot stronger because…"*). A random pool is the next step of that same idea.

⭐ **THE SUBSTRATE ALREADY ALLOWS IT, AND THAT IS WORTH KNOWING BEFORE ANYONE REDESIGNS.** The draft
event carries the wave and nothing else; the OFFER is derived by `draftOptionsFor(waveNumber)`, a pure
function. A random pool means making that function read a seeded selection instead of a fixed table —
`world.draft` would carry the rolled option ids, minted host-side and BROADCAST exactly as the NONET
seed is, never recomputed per peer. No new architecture; a different `draftOptionsFor` and two more
integers on an event that already exists.

### ⛔ WHAT IS STILL **NOT BUILT** (S190)

All twelve level-0 and level-5 racials are built (§3e), and since S190 (deploy #4) two level-10 ones —
THE SWARM and WRATH OF RA, both in §3e now. Past them, on this tree, **nothing is**: every other level-10
racial tile is COMING SOON, and `RACIAL_PERKS_BY_RACE` holds two perks per race — three for the vampires and the mummies.

| | race · level | status on this tree |
|---|---|---|
| **THE SANDWORM** | mummies · 10, for a seat that did NOT take POWER OF RA | **RULED, art pending, NOT BUILT** — a tier-4 tower that spawns an underground sandworm, untargetable except when it surfaces to strike, visible only by the ground moving above it. No perk id exists: that seat's level-10 tile is COMING SOON |
| everything else | level 10 for zombies, orcs, demons and nagas; levels 15 and 20 for every race | **undesigned** |

> *"At level 10, they will have the power of Ra, but times three. So you can use it three times per
> fight phase … it's only if you've chosen Power of Ra level zero … and if the mummies did not choose
> Power of Ra level zero then instead at level 10 they will receive … a sandworm … Just record it for
> now and don't implement that part yet."* — owner, S188

⭐ **MUMMIES LEVEL 10 IS THE FIRST RACIAL THAT FORKS ON AN EARLIER PICK — AND S190 BUILT THE FORK.**
`racialPerkFor(race, draftIndex, picks)` takes the SEAT's picks, and `RACIAL_PERK_REQUIRES` names the
requirement (`'mummies.l10'` → `'mummies.l0'`); `draftOptionsFor`, `pickIsOffered` and `autoPickFor` all
pass the seat's picks, and `seatHoldsPerk` checks the requirement too — so the day the SANDWORM ships, a
racial pick at index 2 without POWER OF RA can never read as WRATH. Asked without picks, a perk with a
requirement is NOT offered (the safe answer when the caller cannot say whose offer it is).

⭐ **THE 6× IS HIS NUMBER, AND `THE_SWARM_STAT_MUL` CARRIES IT (S190)** — written as
`2 × APEX_PREDATOR_STAT_MUL`, because that is what he said (*"whatever we did for the piranha, we double
that"*). §3e.

## 3e · ⭐⭐ THE FOURTEEN RACIAL UPGRADES — ALL BUILT (S188; LEVEL 10 S190)

> *"Make sure the racial mechanics work … let's do zero and five, okay? Because all of those are
> designed and spec'd. You just need to build and wire them."* — owner, S188

A seat holds a perk iff it is of that race AND its pick at that draft is `'racial'` (`seatHoldsPerk`) —
and, for WRATH OF RA, it also holds POWER OF RA (`RACIAL_PERK_REQUIRES`). Every perk below is
`RACIAL_PERK_BUILT: true`, so its tile is choosable and the deadline takes it. The standing rules apply
to all fourteen: the floor-at-one, the ONE ladder, and *"if something doesn't work when I play it, I'll
just change it … don't argue if it's too OP"*.

| perk | race · level | the rule | the numbers | MINE |
|---|---|---|---|---|
| **BLOOD DEBT** | vampires · 0 | every creature the seat owns heals a share of every hit it LANDS — on a creature, a connector, a lone shape, a stink bag, Helga or a castle | `BLOOD_DEBT_LIFESTEAL_PCT` = **20** % | WHO heals and WHICH hits count (his words are *"every spawned unit"*; the S188 PDR §2 lists it under "my calls"); the share is of the hit SWUNG (overkill in, castle DEF not yet applied) |
| **CRIMSON TIDE** | vampires · 5 | the lifesteal rate becomes 50 %, and it REPLACES 20 — never 70 | `CRIMSON_TIDE_LIFESTEAL_PCT` = **50** % | — |
| **THE SWARM** | vampires · 10 | the seat's bat tower emits the BAT SWARM from now on — every stat ×6 from the bat (R190-D), drawn twice the size; its own atlas and the `l10-vampires` card | `THE_SWARM_STAT_MUL` = **6** → **12 / 0 / 12 / 6** · pool **10 → 60** · bite **12 → 132** · `BAT_SWARM_SPRITE_SCALE_MUL` = **2** | its speed is the bat's; the ×2 draw size |
| **THE RISEN** | zombies · 0 | an ENEMY creature killed by one of the seat's RACIAL units (castle soldier, hound, zombie boss) rises as one castle soldier at the seat's keep | pool **6** — `unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF)`, R125's 1/1/1/1, before the seat's draft buffs | which three types count as "racial" (`isZombieRacialType`); a kill with no creature attacker (castle gun, raid, area) or a raze raises nobody; one corpse raises ONE |
| **CORPSE EATER** | zombies · 5 | the zombie boss's third skill: at ≤ 20 % of his own pool he sits and feeds for 8 s — his ordinary bite, all of it healed, enemies first, then his own units | `CORPSE_EATER_TRIGGER_PCT` = **20** · `CORPSE_EATER_TICKS` = **480** · `CORPSE_EATER_HEAL_PCT` = **100** · `CORPSE_EATER_LEASH_RADIUS` = **60** px | the leash; once per LIFE; "his own units" excludes tier-9 bosses; the heal counts the bite's overkill; the window's clock runs through a stun |
| **POWER OF RA** | mummies · 0 | once per FIGHT, the seat aims five sun columns anywhere on the board — each column's damage is SPLIT between the enemy creatures, Helga, lone shapes, stink bags and structures it catches (S191) | `RA_COLUMN_COUNT` = **5**, one every `RA_COLUMN_TICKS` = **120** · `RA_PERK_STRIKE_FIFTHS` = **35** a column IN TOTAL, split, over `RA_COLUMN_RADIUS` = **70** px (**75** — `RA_WRATH_STRIKE_FIFTHS` — once the seat holds WRATH OF RA) | spares the caster (and does not count its things); the number is `raColumnPoolFor(world, seat)`, the ONE source; a STRUCTURE is ONE target, its share on its connector nearest the centre; a column due after the FIGHT never lands; columns already called still land if the caster's keep falls |
| **ENDLESS DYNASTY** | mummies · 5 | every whole 1,000 HP the keep ACTUALLY loses raises a Pharaoh at the keep, owned by the seat | `DYNASTY_HP_PER_PHARAOH` = **1000** · `DYNASTY_LIVE_PHARAOH_SENTINEL` = **40** | counting starts at the pick; regen never un-counts; a fallen keep raises nobody; the sentinel |
| **WRATH OF RA** | mummies · 10 | POWER OF RA three times per FIGHT — offered ONLY to a seat that took POWER OF RA at level 0; cast from the WoW-style skill square left of the tier chips, whose picture is the PRE-CUT `public/art/skills/wrath-of-ra.webp` | `WRATH_OF_RA_CHARGES` = **3** a FIGHT, each POWER OF RA's strike at the WRATH number (5 columns × **75** fifths, split, over **70** px) — and the seat's POWER OF RA cast and its Pharaoh bosses' columns are **75** too (S192) | the three may be in the air at once; pattern seeded `seat + MAX_PLAYERS × charge` (charge 0 = POWER OF RA's own); a bot casts all three, one in the air at a time |
| **BLOOD FRENZY** | orcs · 0 | while a Warlord of the seat rages by his OWN 25 s clock, the seat's castle soldiers and orc tier-3 units rage too (never another Warlord — S191) — twice as fast, twice the attacks | `WARLORD_RAGE_MULTIPLIER` = **2** | the Warlord's direwolves are not orcs |
| **THE HORDE GROWS** | orcs · 5 | the seat's goblin towers hold 20 goblins instead of 10, and its castle emits its unit twice as fast | `HORDE_GOBLIN_MAX_PER_SPAWNER` = **20** · `HORDE_CASTLE_EMIT_SPEEDUP` = **2** (every **15** s) | "goblin tower" = the `'goblinTower'` recipe only |
| **SCORCHED GROUND** | demons · 0 | every ENEMY creature — and an enemy HELGA (S192: *"Helga is NOT immune"*) — inside the seat's zone (`zoneOf(pos) === zoneOwner(seat)`) burns on the zombie aura's one-fifth tick; the aimed half is SCORCHED EARTH (below) | `SCORCHED_GROUND_PER_MILLE` = **20** | FIGHT only; the quarry never burns; units only (creatures and Helga), never structures |
| **HELLSPAWN** | demons · 5 | a seat's chewer that DIES splits into two at 50 %; each of those into two at 25 %; then nothing | `HELLSPAWN_CHILDREN` = **2** · `HELLSPAWN_PCT_BY_GEN` = 100 / 50 / 25 · `HELLSPAWN_MAX_GEN` = **2** · pool 5 → 2 → 1, bite 7 → 3 → 1 | "the pentagram's chewers" = every chewer the seat owns, and one alive at the pick splits too; ageing out is not dying; the red/black tint is a placeholder |
| **DEEP CURRENT** | nagas · 0 | the gatherer's walk HOME becomes a snap onto its deposit point, shape in hand; the walk out is unchanged | `deepCurrentSnap` — no number | the snap lands one tick after the claim |
| **APEX PREDATOR** | nagas · 5 | the seat's piranha tower emits the ELITE piranha from now on — every stat ×6, like the bat swarm (S192; tripled S188–S191), drawn twice the size | `APEX_PREDATOR_STAT_MUL` = **6** → **18 / 0 / 12 / 6** · `PIRANHA_ELITE_SPRITE_SCALE_MUL` = **2** | its speed is the piranha's |

**His words, one per perk** (S187, verbatim — the S188 PDR §2 holds them in full):

- **BLOOD DEBT** — *"They will heal 20% of each damage output. So let's say if a spawn has 20 a hit,
  then they would be healed by 4 HP every time they hit someone."*
- **CRIMSON TIDE** — *"50% life steal for vampires at level five for all units it might be op but
  we'll see"*
- **THE RISEN** — *"any racial characters kill. So not like Voltkin or Helga or Pencil Chewers …
  Every unit you kill is spawned like a one, one, one, one zombie from the castle."*
- **CORPSE EATER** — *"once he reaches 20% HP, he starts eating everyone around him … he has 100%
  life steal on his attack, so for as much as he attacks that's as much as he heals, for like eight
  seconds … enemy units first, obviously."*
- **POWER OF RA** — *"once per fight, you can use the power of Ra … kind of like Pharaoh has. But you
  get to choose where it lands."* Then S191: *"each column that it does 30 damage it split right so if it
  hits a tower and an enemy at the same time then it split amongst those two … it's not like 30 to each
  thing in the vicinity … we can do it 35 per hit."*
- **ENDLESS DYNASTY** — *"every time a castle loses 1,000 points, it spawns a pharaoh … from now on
  and until the end of the game."*
- **BLOOD FRENZY** — *"Every time your orc warlord does rage … any orc spawn on the screen that is
  currently playing also goes into rage … they move two times faster and they attack two times
  faster."*
- **THE HORDE GROWS** — *"the goblin towers allow 20 instead of 10. And also your castle generates the
  base unit twice as fast."*
- **SCORCHED GROUND** — *"if it's a four player, then it's a quarter of the map. If it's a two player
  game, it's half … the same mechanic as our zombie boss, two percent of their total HP per second
  that they're there."*
- **HELLSPAWN** — *"when a pencil chewer dies, it spawns two more pencil chewers with half the stats
  in each … And when those die, each one of those spawn two more with 25% stats each."*
- **DEEP CURRENT** — *"they will go to get a shape and then they will teleport back to base rather
  than having to walk all the way back."*
- **APEX PREDATOR** — *"So all the stats you take and you just triple them"* and *"two times bigger
  than the current piranha"*. Then S192: *"the Piranha, when it's upgraded … the Nagas get the Piranha
  upgrade, it should be stronger … I think it should be times nine."* — and, shown the ×9 arithmetic, he
  chose **×6, like the bat swarm**.
- **THE SWARM** (S187) — *"it upgrades the regular tier three bat tower at level 10, if we choose it, to
  become bat swarm, to generate and create bat swarms"* and *"Whatever we did for the piranha, we double
  that."* Then R190-D (S190): *"a bat 1/1/1/1 → 6/6/6/6"* — every stat multiplied from the base.
- **WRATH OF RA** (S188) — *"at level 10, they will have the power of Ra, but times three. So you can use
  it three times per fight phase, just by clicking the skill on the bottom left … It's only if you've
  chosen Power of Ra level zero."*

### ⛔ WHAT THE S188 AUDITS ESTABLISHED — READ BEFORE TOUCHING ANY OF THEM

⛔⛔ **BLOOD FRENZY'S PREDICATE IS OWNERSHIP AND RACE-CREATURE TYPE. GOBLINS NEVER RAGE (ruled S187).**

> *"Goblins do not enrage, right? We said enraging works only on orc units, any racial units.
> Goblins are not — goblins can be built by anyone … they don't change their colour and enrage
> like the orcs would."* — owner, S187

A goblin is a GLOBAL tower unit — any race builds goblin towers — so a goblin owned by an orc seat
passes the ownership test and must FAIL the type test (`isOrcRacialCreatureType`: the castle soldier,
the orc tier-3 unit, the Warlord). ⚠ **Filtering by owner alone is the obvious implementation and the
wrong one.** No rage and no rage tint on a goblin. Two more guards (rewritten S191): the frenzy never
touches a Warlord at all (below), and a source is a Warlord whose OWN 25 s window is open
(`Creature.rageStartTick`, stamped only by his latch) — not his health, not the bare `enraged` bit. ⚠ THE
HORDE GROWS raising the goblin cap is not in tension with this: *"orcs and goblins do tend to work
together"*. Orcs get MORE goblins; the goblins simply never rage.

⭐⭐ **THE WARLORD'S RAGE LASTS 25 SECONDS, THEN "COOLDOWN FIRST" (S191).** *"let's do it like 25
seconds"* — once his own latch fires (strictly below `WARLORD_RAGE_TRIGGER_PCT` = **50** % of his own
max, in FIGHT) he rages for `WARLORD_RAGE_TICKS` = **1500** ticks **regardless of healing** — R151's
heal-above-50 exit is retired (`WARLORD_RAGE_CLEAR_PCT` is kept, unread). Then, *"cooldown first"*: he is
calm for `WARLORD_RAGE_COOLDOWN_TICKS` = **1500** ticks whatever his health, and after it, below the line,
he rages again at once. ⭐ The cooldown's length is HIS (S192): *"Rage cooldown 25 seconds, that's fine.
Per warlord."* Both windows derive from ONE stamp per Warlord, `Creature.rageStartTick`, written only by
`runWarlordRage` — serialized, hashed, on the wire.
⭐ **THE PATTERN, RULED (S191):** the latch runs only in FIGHT, so a rage still running at the whistle
stays red through the whole BUILD and the next FIGHT — re-judged on that FIGHT's first tick, which fires afresh —
*"Yeah, that's fine. Who cares? You can't really see the creatures anyways."* A hurt Warlord therefore
rages from each FIGHT's first tick, again every `WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS`
inside `FIGHT_PHASE_TICKS` — today: raging 0–25 s, then from 50 s through the whistle and all of BUILD.
Goblins never rage.

⛔ **THE FRENZY NEVER TOUCHES A WARLORD (S191).** *"I don't think each warlord should be able to enrage
the other warlord. Yes, the warlord enrages all the orc units, but still rage for himself is … warlord
specific."* — owner, S191. BLOOD FRENZY raises the seat's orc racial units — the castle soldier and the
orc tier-3 unit — and NEVER a Warlord (`runBloodFrenzy` neither sets nor clears one): a Warlord rages only
by his own 25 s clock, and when a second Warlord enters his own rage he frenzies the orc units, not the
first Warlord. A source is a Warlord whose own window is open.

⚠ **AND THE GOBLIN CEILING IS LOAD-BEARING, NOT COSMETIC.** Every goblin is `persistent`
(`GOBLIN_MELEE_CONFIG.persistent = true`) — it never ages out — so the per-tower ceiling is what
bounds a goblin army at all. Raising it **10 → 20** for THE HORDE GROWS is fine; removing it is not.

⛔⛔ **AND BLOOD FRENZY FOUND AN S168 BUG: AN ENRAGED UNIT HAD LANDED NOTHING FOR TWENTY SESSIONS.**
Rage halved `attackCadenceTicks` (60 → 30) and left `attackFireTick` at 30, so the FSM left ATTACKING
on the very tick the fire check would have fired — a raging Warlord swung and never hit. `ragedFireTick`
now halves the fire tick with the cadence (30 → **15**), read at the `hostTick` fire check and the
FSM's `targetGoneEarly`, and an enraged unit banks **exactly double** a calm one's damage through the
real host tick (`bloodFrenzy.test.ts`). It is a rule both peers compute, so it rides PROTOCOL 50 (§6).

⛔ **AND A RAGE CHANGE MID-SWING WAITS FOR THE NEXT CYCLE (deploy #2, fix round F3).** Cadence and
fire tick used to be re-derived from the LIVE `enraged` bit every tick, so rage → calm after the raged
fire tick fired AGAIN at the calm one, and calm → rage past the raged fire tick skipped both and lost
the blow — routine for a whole army once BLOOD FRENZY switches it on and off. The FSM now latches
`enraged` into **`Creature.attackCycleRaged`** on the cycle's first tick (`ticksInState === 1`), and
that cycle's cadence and `ragedFireTick` read the LATCH (`attackCycleMultiplier`); movement still reads
the live bit. One blow per cycle, always. The latch is serialized (only when true) and hashed — see §6.

⛔ **HELLSPAWN TERMINATES BY GENERATION, NOT BY LUCK.** The generation lives on the creature
(`Creature.hellspawnGen`, serialized and hashed) and a generation-2 death spawns nothing, so one
chewer has at most **6** descendants, ever. Every child's pool and bite are floored at one, so no
child is born dead — the one way a split could loop (Council A2). The children, like THE RISEN's
soldier and ENDLESS DYNASTY's Pharaoh, are QUEUED and born after the death sweep, never inserted into
`world.creatures` while the strike batch iterates it (Council A5). ⭐ S189 (`s189/units`, LOW d): and a
kill OUTSIDE the host tick — a RAID applied between ticks, or a bot acting after the post-sweep drain —
drains the queue as its top-level `dispatch` returns, and `runHostTick` ends with a final drain, so those
children are born at the raid and the queue is EMPTY wherever a save can land (`spawnQueueBoundary.test.ts`).
⭐ S190 (`s188/draft-atk`): a split chewer's strike is a share of its PARENT's baked strike, stamped on the
child like its pool, never the seat's current picks — unbuffed **7 → 3 → 1**, born after one damage pick
**8 → 4 → 2**; a parent born before the pick still splits into 3s after it.

⛔ **ENDLESS DYNASTY COUNTS WHAT THE KEEP ACTUALLY LOST** — after its bought DEF and after the clamp at
zero, so a killing blow's overkill is not a loss — from the moment the perk is taken. **Regen never
un-counts a loss** (`Player.dynastyHpLost` only rises), and one hit crossing two thousands raises two.
⚠ `DYNASTY_LIVE_PHARAOH_SENTINEL` (**40** live Pharaohs a seat) is a **PERFORMANCE sentinel, never a
gameplay cap** (Council A3, MINE): past it the Pharaoh is not born and its 1,000 is still consumed.

⛔ **POWER OF RA FALLS LIKE THE PHARAOH'S STRIKE BUT IS NOT HIS NUMBER (S191).** Same pattern
(`raColumnPos`), timing (`raColumnImpactTick`) and radius (`RA_COLUMN_RADIUS` **70** px), five columns two
seconds apart — but a column deals `RA_PERK_STRIKE_FIFTHS` = `attackFifths(RA_PERK_COLUMN_ATK 5,
RA_PERK_COLUMN_PEN 2)` = **35** fifths a column IN TOTAL, split by `raSplitShares` over everything it catches
(`raColumnTargets`): each enemy creature with pool left, Helga, lone built shape and landed stink bag is one
target, and each enemy STRUCTURE is ONE target whose share lands on its connector nearest the centre.
Share = floor(35 / n); the remainder goes one fifth apiece to the first targets in the total order
(squared distance, then kind structure < creature < defender < shape < bag, then id). ⚠ MINE: n > 35 →
the first 35 get 1, the rest 0; the ATK/PEN pair 5/2 (35 = 7/0 = 5/2 = 1/30); a corpse and a channelling
Pharaoh take no share; a structure whose shapes but no connector midpoints are in the circle is not a
target (shapes inside a structure are not targetable). The old area arm that razed every shape inside a
structure is GONE — that is what let one column level a tower — and the column now reaches stink bags,
which it never did. Measured: a fresh 5-connector tower stands after one column and falls on the
**5th** column that lands on it (measured S192 with s191/carry's overkill carry — the column's sever goes
through `severWithCarry`; it was the 7th before carry). ⭐⭐ **S192 — THE PHARAOH BOSS'S COLUMN IS THIS COLUMN.**
*"the [Ra] column, Pharaoh boss should not keep … his 300. That's ridiculous. He goes down to 35 per column,
just like a regular column attack. And once we have Ra's Wrath at … level 10 … each column goes … up to 75.
And also Pharaoh's become 75. Okay? If the player chose that ability."* His ritual lands through the same
`landRaColumn` (`racial/raColumn.ts`), one target per structure, and his pool is `raColumnPoolFor(world,
boss.ownerPlayerId)` — the same function as the perk's, the only source of the number: **35**, or **75**
(`attackFifths(RA_WRATH_COLUMN_ATK 5, RA_WRATH_COLUMN_PEN 10)`, ⚠ MINE pair) when the column's OWNER seat holds
WRATH OF RA, read at landing. His columns still **spare nobody** (his own seat included), and they now cut
connectors (`cause: 'unit'`, ⚠ MINE) instead of razing shapes. `RA_COLUMN_ATK/PEN` (15/15 = 300) are retired
from the sim. **Once per FIGHT** (one cast per `waveNumber`, and the wave turns on entry into BUILD). ⚠ Two
differences from his, both MINE: it **spares the caster** (the Pharaoh's own columns spare nobody), and it
cuts CONNECTORS as well (through the structure's one share), because a building dies through its
connectors (§4). ⛔ **The host REFUSES an aim that is off the
canvas, non-finite or not a number** — a no-op, never a clamp to the corner, because a strike landing
at (0, 0) would be an attack nobody aimed — and rounds an on-canvas aim to integers (`raAimPoint`,
Council A1). The button sits in the footer, left of the tier chips, where he put it. ⚠ MINE, and his to
judge: a cut connector is severed with `cause: 'raid'` (the one existing cause that means a PLAYER's
attack), so a column that cuts three connectors plays the player-sever sound three times.

⛔ **CORPSE EATER HEALS THE WHOLE BITE, OVERKILL INCLUDED** — ⚠ MINE: that is the S188 brief's reading
of *"for as much as he attacks that's as much as he heals"* (`corpseEater.ts` says so at `bite`), not
a number he gave. Inside the death deferral a lethally-bitten victim stays in the map below zero, so
the heal is the full hit, not only what the victim had left. Once per boss LIFE (the stamp is never
cleared). The bite is his ordinary `CREATURE_ATTACK` on his ordinary swing clock, so "the same damage
as he would by attacking" is true by construction — and since S190 that bite is HIS OWN strike
(`creatureAttackFifths`, drafted-buffed when his seat drafted ATK/PEN), never the config strike, so the
heal follows the buff. ⚠ The **60 px** leash is MINE.

⛔ **A BOSS SHOVED OUT OF HIS LEASH SITS DOWN WHERE HE LANDS — HE IS NEVER SNAPPED BACK (deploy #2, fix
round F1).** The Kraken's sonar stuns and shoves ~**70** px (`KRAKEN_SONAR_KNOCKBACK_PX`, §5b — it flung units
across the map until S189); the stun rightly suspends the leash for the whole
slide, and the first unstunned feed tick used to clamp him straight back onto the circle — a one-tick
teleport, on both peers. Now, when he is found outside the leash through no step of his own — stunned
on the tick before, or displaced further than his own legs carry him in a tick (`corpseEaterOwnStepPx`,
about **1.9** px for the zombie boss) — the leash is RE-ANCHORED at his feet and the rest of the slide
is spent (`prevPos = pos`). His own shuffle past the circle still clamps, or the leash would creep
outward a step at a time.

⛔ **AND THE WHISTLE CUTS A FEED SHORT (deploy #2, fix round F5).** The feed runner is FIGHT-gated with
every boss skill, so a window straddling FIGHT → BUILD simply ends: `recallArmies` sends him home, no
bite lands in BUILD, and the stamp is left to expire — BUILD (`PHASE_DURATION_TICKS`, **5400** ticks)
outlasts the window (**480**), so it can never reach the next FIGHT. Nothing is paused or carried
over; the once-per-life latch is spent. The renderer stops drawing the feed at the edge
(`showsCorpseEaterFeed`).

⚠ **APEX PREDATOR: "×6 EVERY STAT" IS ×6 HEALTH BUT ×11 BITE — HIS CHOICE (S192, "like the bat
swarm"), THE LADDER'S ARITHMETIC (R190-D).** The ladder multiplies ATK by (5 + PEN), and both are ×6:
pool **15 → 90**, bite **12 → 132** — 12 × (5 + 6) against the piranha's 2 × (5 + 1), the swarm's bite exactly.
One elite bite is more than a whole 5-connector tower, every level of it. Its HP 18 sits OFF the 1..12
point ladder by his ruling; `statsLadder.test.ts` gives the elite its own lane, pinned to exactly piranha ×
`APEX_PREDATOR_STAT_MUL`. ⛔ Equal to THE SWARM's 6 by ruling, not by coupling — both are literals. (S188–S191
it was ×3: pool 45, bite 48; ×9 was proposed in S192 and not chosen.) "From now on" is decided at the EMIT, so piranhas already on the board are untouched, and
both of the tower's emit sites (the free trickle and FEED_TOWER) ask one function, `towerUnitForSeat`.

⚠ **THE SWARM: "×6 EVERY STAT" IS ×6 HEALTH BUT ×11 BITE — AND THAT IS HIS RULING, NOT A FLAG (R190-D,
S190).** *"a bat 1/1/1/1 → 6/6/6/6"* — every stat is multiplied from the base, PEN included, so the ladder
gives pool **10 → 60** and bite **12 → 132**: 12 × (5 + 6) against the bat's 2 × (5 + 1). One swarm bite is
more than it costs to fell a whole 5-connector tower, every level of it (**130**). ✅ CLOSED — never re-ask. His 1/1/1/1 is
illustrative; the bat's real line is 2 / 0 / 2 / 1 (`T3_STATS.bat`), and DEF stays 0 because 0 × 6 = 0.
⛔ Since S192 `THE_SWARM_STAT_MUL` is a LITERAL 6, decoupled from `APEX_PREDATOR_STAT_MUL`: left as
`2 × APEX` the owner's ×6 piranha would have silently made the swarm ×12.

⚠ **A STATED CONSEQUENCE: WITH CRIMSON TIDE ONE SWARM BITE HEALS MORE THAN THE SWARM'S WHOLE POOL** —
`lifestealFifths(132, 50)` = **66** against a pool of **60**. The heal is capped at its own max, so every
swarm that lands a bite is topped back to full (BLOOD DEBT alone: **26**). Vampire bots take both by
default. ⚠ And the character-sheet radar's ATK ceiling rose **10 → 12** for every unit (`RADAR_MAX_ATK` —
the swarm's ATK was then the roster's largest; render-only, left as is on the S190 call). The ×6 elite
piranha (S192) ties it — ATK **12**, PEN 6, bite 132 — and moves NO radar ceiling (HP 18 is under the
bosses' 24; the SHOT ceiling stays Vlad's 150). "From now on" is
decided at the EMIT (`towerUnitForSeat`), so bats already alive stay bats, and a vampire seat that takes
the GENERAL at wave 11 keeps its bats.

⭐ **WRATH OF RA IS POWER OF RA THREE TIMES A FIGHT, AND NOTHING ELSE.** `WRATH_OF_RA_CHARGES` casts,
refilled every FIGHT, each exactly POWER OF RA's strike. ⚠ MINE: the three may be in the air at once
(refusing a cast while one falls would read as a broken button); the column pattern is seeded
`seat + MAX_PLAYERS × charge`, so charge 0 is POWER OF RA's pattern exactly; a bot WRATH seat casts all
three, one in the air at a time (audit F2). The skill square (46 px, left of the tier chips — *"just like
World of Warcraft"*) shows the PRE-CUT `public/art/skills/wrath-of-ra.webp` with one pip per unspent
charge. ⛔ **A column's connector sever is resolved inline** (`applySeverBond`), so a caster benched or
eliminated mid-strike still breaks what the column drained (audit F1). The SANDWORM (§3d) stays RULED,
NOT BUILT.

⚠ **SCORCHED GROUND IS HIS 2 %, NOT THE ZOMBIE BOSS'S 2.5 %** — **20** per-mille against
`ZOMBIE_AURA_PER_MILLE` **25**, on the aura's unchanged mechanic (one fifth a tick, the RATE carries the
percentage). ⚠ **The rate is derived from the victim TYPE's base pool** (`maxPoolFifths(type)`), not
from its drafted `maxEhp`, so the nominal **50 s** to burn anything to death holds only at the TYPE's
pool — and exactly only where the per-fifth interval divides evenly (`dotIntervalTicks` rounds it): the
castle soldier and a chewer burn in **50 s**, a 260-fifth boss in **52 s**. A castle soldier drafted
6 → 7 burns in about **58 s**, and a split chewer, whose pool is below its type's, burns faster.
Recorded, not changed.

⛔ **A FALLEN SEAT'S LAND STOPS BURNING (deploy #2, fix round F4).** `scorchedZones` skips a seat whose
`castleHp <= 0` — the guard every castle-derived effect uses (the gun, regen, the race-unit emitter) —
so an eliminated demon seat's perk does not go on damaging the board after it is out, and the ember
tint (`zoneBackdropTint`) follows the same test.

⭐⭐ **SCORCHED EARTH — THE AIMED HALF OF SCORCHED GROUND (S191, `racial/scorchedEarthRules.ts` +
`racial/scorchedGround.ts`).** *"click on any quadrant of the enemy … you will be resistant. Everybody else
will … receive damage over time. And your enemy too, and his structures and everything … with the same …
amount of … health lost per … second … you can place it on your own as well. And then you would have double
scorched earth."* — owner, S191. A seat holding SCORCHED GROUND also holds the skill (the footer square, Ra's
slot). His answers, each HIS:
- **`SCORCHED_EARTH_CHARGES` = **1** a FIGHT**, and it burns until that FIGHT ends — `CAST_SCORCHED_EARTH
  { zoneSeat }` names a SEAT (its zone), never a point; the record (`Player.scorchedEarth`) is keyed on the
  wave and cleared at the BUILD edge.
- Units (creatures and Helga) burn at **`SCORCHED_EARTH_CAST_PER_MILLE` = **20**** — the passive's own rate,
  derived, never a second literal.
- **Structures at HALF** — *"enemy structures will take half the damage that units take"*:
  `SCORCHED_STRUCTURE_RATE_DIV` = **2** × the unit interval for the structure's CURRENT pool. A structure
  burns as ONE (one clock per component, one fifth on its lowest connector clear of the caster), and a full
  pool severs through `severWithCarry` with the existing `'raid'` cause. Lone built shapes and landed stink
  bags burn at the same half rate.
- **Own zone = double**: the passive and the cast are separate clocks, so outsiders' units there burn ×2.
- **Not burned:** the castle (HIS), gatherers and avatars (§4), a DORMANT Helga (a record, not a unit).
- **Resistance is the CASTER'S SEAT only** — `isScorchImmune(owner, spared)`, the ONE site; R192-T1
  (*teammates never damage each other … a demon teammate's zone does not burn you*) changes that function
  and nothing else when teams are built.
- **A fallen caster:** his cast on an ENEMY zone stops; his OWN zone keeps burning (HIS, S191). ⚠ MINE: the
  zone's owner falling after the cast leaves it burning.
- ⚠ Consequence, measured: one cast banks 60 % of one connector of a 5-connector tower per FIGHT, and burn
  damage stays banked until FIXed — an unrepaired structure loses its first connector in the second
  consecutive scorched FIGHT.

⭐ **LIFESTEAL IS ONE CALL AT THE TWO FUNNELS.** `applyLifesteal` runs inside `damageEntity` and
`damageConnector` (which gained a required attacker for it), so no strike path can forget it and a
BUILDING hit heals too. The heal is `max(1, floor(hit × pct / 100))` — his floor-at-one — capped at the
attacker's own full pool, never an overheal. His example is exact: a **20**-fifth hit heals **4**. A
turret beam, the castle gun, a raid and every area blast pass no creature attacker, so nobody heals
from them, and a dead attacker heals nothing.

⛔ **AND INSIDE THE HOST'S STRIKE BATCH A HEAL IS SUMMED, NOT APPLIED (deploy #2, fix round F1).**
Healing at the moment a blow landed made a melee depend on `world.creatures` iteration order — the
S155 N1 class: the vampire reached first was topped up before the incoming blow and lived, the
identical one a slot later died. While the batch's `world.pendingLifestealFifths` is open,
`applyLifesteal` only ADDS to it; `runHostTick` lands the sums (`applyPendingLifesteal`) after every
blow of the tick and **before the deferred death sweep** — in creature-id order, each capped at the
creature's own full pool, and skipping anyone dead or pending death, so a unit killed this tick is
never healed back over the line. Outside the batch the heal is immediate. The accumulator is
transient: never serialized, never hashed (`'acknowledged'` in `FIELD_COVERAGE`).

---

## 3g · ⭐ THE GOBLIN TOWER AUTO-BUILD TOGGLES (S193, owner T4)

> *"right click each of the six shapes that build … the goblins … it's like a toggle … whenever there's
> a free shape, it builds … those goblins."* — owner, S192 playtest list T4

**Right-click a shape on your own goblin tower's card to toggle auto-build for that goblin kind**
(Square → shield, Spiral → bat, the `GOBLIN_FEED_MAP` row). Several at once. A lit toggle wears a
green ring and a corner pip, dimmed chip or not. Whenever the tower has a free slot (10, or 20 under
THE HORDE GROWS) and the bank holds a toggled shape, the tower builds that goblin by itself — **by
sending an ordinary `FEED_TOWER`**, so it pays exactly what a click pays and every feed gate applies.

- **HIS:** the right-click, the toggle, several at once, "free slot + shape in the bank".
- **MINE (⚠, at the constants):** a toggled tower looks every `AUTO_FEED_POLL_TICKS` = **6** ticks
  (0.1 s), one goblin per look; several toggles take turns in shape order from a saved cursor; the
  goblin tower only (a race tower's chip plays the refused cue); a right-click with something in hand
  puts it back instead; bots do not use it.
- **ONE BITE DOES NOT WIPE IT:** a toggled tower that falls with its anchor standing is remembered by
  that anchor (`World.goblinAutoFeedMemory`, host-only, hashed); FIX re-ignites it there with its
  toggles back. A tower whose anchor is destroyed, or rebuilt elsewhere, starts OFF.
- The toggle is the client intent `SET_AUTO_FEED` (a SET, not a flip). Benched: the toggle is allowed,
  the feeds wait. Eliminated: refused. The endgame build lock: allowed.

---

## 3c · ⭐⭐ THE QUARRY — ONE SHARED FAUCET, AND IT STEPS UP AT THE SAME FOUR WAVES (S186)

> *"Every wave the primitives need to be spawned quicker and quicker. So far it does that but not
> fast enough — because at wave like six or seven all your gatherers are waiting in line and not
> moving until the shapes come up. So we need that too, like significantly faster: after wave 5, then
> after wave 10 even more, even faster after 15, even faster after 20."* — owner, S186

```
shapes/s = SPAWN_RATE_PER_SECOND × (1 + 0.2 × (wave − 1)) × waveSpawnBandFactor(wave)
```

⛔ **THERE IS EXACTLY ONE QUARRY FOR THE WHOLE TABLE.** `main.ts` constructs a single `Spawner` at one
`SPAWNER_CENTER`, so 1.125/s is a **board-wide** faucet that every seat's gatherers share. A session
reasoning about it "per player" will be wrong by the seat count.

| wave | multiplier | shapes/s | shapes per BUILD | pool cap |
|---|---:|---:|---:|---:|
| 1 | 1.00 | 1.13 | **97** | 24 |
| 5 | 1.80 | 2.02 | **184** | 24 |
| 6 | 3.20 | 3.60 | **323** | 36 |
| 10 | 4.48 | 5.04 | **463** | 51 |
| 15 | 8.36 | 9.41 | **874** | 95 |
| 20 | 13.44 | 15.12 | **1399** | 96 |
| 25 | 19.72 | 22.19 | **2009** | 96 |

⭐ **EVERY FIGURE IN THAT TABLE IS MEASURED THROUGH `stepPhysics`, NOT DERIVED** —
`spawnEconomy.measure.test.ts` re-runs it, the way `castleGuns.test.ts` re-runs the siege. It exists
because two independent analyses disagreed about the cause and only the loop settled it.

⛔ **THE S157 RULING SURVIVES INTACT AND MUST KEEP SURVIVING.** Band 1's factor is **1**, so waves 1–5
are byte-identical to his *"wave 1 is normal. wave 2 is 1.2. wave 3 is 1.4x faster"*. And the RATE is
still uncapped — the band factor plateaus past wave 25 but the linear term never does, so
`waveSpawnMultiplier` rises forever, which is what *"dont cap because people build more and more
gatherers"* requires. ⚠ **The band factors themselves are MINE, not his** — he gave the shape, not the
numbers. They are sized off the measured crossover: at the old wave-6 rate the faucet fed about **ten**
fully-upgraded gatherers **for the entire table**, which is two or three per seat, and that is exactly
his *"wave like six or seven"*.

⚠ **THE POOL CAP HAD TO MOVE WITH THE FAUCET, OR HALF THE STEP-UP WOULD HAVE BEEN IMAGINARY.**
`FREE_SPARK_SOFT_CAP`'s own docblock calls 24 a *"safety valve rather than a throttle"*, sized against
a measured wave-1 peak of 18. Left fixed it would have become the throttle it says it must not be.
`freeSparkSoftCapForWave` returns the Little's-Law idle steady state, floored at 24 (so wave 1 is
unchanged) and ceilinged at **96** — ⛔ a PERFORMANCE bound on the per-spark display list and the
`vortex.ts` O(sparks × anchors) scan, **never a bound on the arrival rate**, so it does not touch his
"dont cap" ruling.

### ⛔ AND THE MEASUREMENT FOUND A SECOND CAUSE NOBODY HAD NAMED — HE SHOULD SEE THIS ONE

**Every BUILD from wave 2 on opens onto a COMPLETELY EMPTY quarry.** The spawn *dispatch* is
BUILD-gated, but `reapExpiredFreeSparks` runs **unconditionally**, and FIGHT is 3600 ticks against a
600-tick TTL. So every unclaimed shape ages out in the first ~10 s of the fight and nothing replaces
it for the remaining ~50 s. Measured: `pool@FIGHT-end` is **0 at every wave tested**.

At the next whistle the whole fleet is released on one tick onto nothing and walks ~870 px as one
synchronised pack. **That is "waiting in line and not moving", verbatim — and no faucet number removes
it**, it only shortens the window.

⚠ **NOT FIXED, ON PURPOSE.** The one-line change (stop reaping during FIGHT, so the last BUILD's
surplus greets them) is a balance decision he has not been asked for, and the TTL is also what clears
flung debris. Measured, pinned and reported rather than taken.

---

## 3f · ⭐⭐ THE ENDGAME — THE LAST DRAFT, THE BUILD LOCK, THE PANTS (S192, `s192/endgame`)

> *"after the fight of level 25, it's going to be the last upgrade … wave fight 27, 28, 29, … 30, and 31,
> the next five waves, is going to be basically instant death."* — owner, S192 (A3)

| | |
|---|---|
| last draft | **wave 26** (`LAST_DRAFT_WAVE`) — `isDraftWave` is false past it. ⭐ S193 its general option is the **MRES** card (§3d, R192-D1) |
| build lock | from **BUILD of wave 27** (`BUILD_LOCK_FROM_WAVE`): no PLACE / BUILD_BLUEPRINT / PULL_FROM_BANK. **FIX stays** (his self-correction), towers keep producing, FEED_TOWER and every CAST (Ra, SCORCHED EARTH) pass — a cast is not a build |
| the quarry | ⭐ S193 HIS: *"Shapes don't come anymore, only fucking pants come."* — from the lock on it mints nothing (`stepPhysics`) |
| monsters per LIVING seat | ⭐ S193 ALL HIS: **27 → 10 · 28 → 25 · 29 → 50 · 30 → 100 · 31 → 250** (`MONSTER_WAVE_PER_SEAT`) |
| the pace | ⭐ S193 HIS: one at a time out of the circle, never a chunk. ⚠ MINE as a tick rule: one LANE per living seat, born on the quarry rim facing its keep, **one every 45 ticks** per lane (`MONSTER_EMERGE_TICKS`), lanes staggered |
| the countdown | ⭐ S193 HIS: *"how many are left to come out"* — `PANTS LEFT TO COME OUT: N` on the top banner (`monstersLeftToComeOut`, derived) |
| the hold | ⚠ MINE: waves 27–30 do not end while pants are still to come out; the deadline is held **10 s** ahead (`MONSTER_HOLD_LEAD_TICKS`) and counts down after the last |
| the final fight | ⭐ S193 HIS: wave 31 **never ends on the clock while two or more seats live** — a keep-standing or score win ends it |
| the MEGA PANTS | ⭐ S193 HIS (*"basically unbeatable"*), ⚠ MINE numbers: walks out **240 s** into the final fight (`MEGA_PANTS_AFTER_TICKS`), HP 500 / DEF 20 / ATK 60 / PEN 20 → pool **12500**, strike **1500** (`MEGA_PANTS_STATS`); replaced if felled |
| the pants | HP 10 / DEF 5 / ATK 5 / PEN 3 → pool **100**, strike **40** (`ENDGAME_MONSTER_STATS`, ⭐ HIS since S193 Q9 — ⚠ he once said *"penetration 5"*, a 50 hit; built 40) |
| owner | `MONSTER_OWNER_SEAT` (255) — no seat, so every seat's guns and units treat it as an enemy (enumerated per file in `endgameS193.test.ts`) |
| retarget | DERIVED (`monsterVictimSeat`): its seat while alive, else a survivor by `mix32(id)` |
| the music | ⭐ S193 HIS (R193-M): the FIGHT of waves **27 / 29 / 31 → song 1, 28 / 30 → song 2** (`PANTS_MUSIC_SRC`, `pantsMusicForWave`); the endless final fight keeps 31's. ⚠ MINE: FIGHT only, and it overrides the race-music toggle |
| leftovers | ⭐ S193 HIS: *"they vanish when this wave ends"*; no points for pants kills |
| the end | ⭐ S193 HIS: last keep standing wins; a wipe from wave 27 on → **the top score wins**; a solo board ends at the wave-32 edge, top score |

Spec: `.claude/plans/S192_ENDGAME_SPEC.md`; his answers: `.claude/plans/S193_OWNER_ENDGAME_ANSWERS.md`. Pinned by `canon.test.ts`, `state/endgame.test.ts` and `state/endgameS193.test.ts`.

---

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

**The hunter** spawns **once per match**, when the leader first reaches **75%** of the win score
(⭐ S186 — of the bar for the CURRENT WAVE, see §3b; `hunterTriggerScoreForWave`), and
goes after that leader's avatar.

---

## 4b · ⭐ WHERE A TOWER MAY BE PLACED — THE EDGE RULE (S186)

The owner reported he could not build in the bottom band. Two independent things stand on that
ground, and **a session that finds only one of them will "fix" the wrong one**.

**1 · The off-screen rule.** `blueprintLegality` keeps a stamp's whole FOOTPRINT on the canvas, so
every recipe has a dead band at the top, the bottom AND both sides. ⛔ **IT IS NOT A BOTTOM RULE** —
it only reads as one because `FOOTER_TOP_Y` is 996, so the bottom band lies under the menu while the
band at the top is empty sky nobody tries to build in.

⚠ **BUT THE FOUR BANDS ARE NOT THE SAME SIZE, AND S186 FIRST GOT THIS WRONG.** Most recipes are
vertically ASYMMETRIC, so the top band and the bottom band differ:

| recipe | top | bottom | side |
|---|---:|---:|---:|
| tier-3 race tower | 46 | **29** | 41.4 |
| stink tower | 56 | **34** | 50.1 |
| pentagram | 52 | **44.4** | 50.0 |
| lightning hub | 56 | **47.6** | 53.8 |
| laser turret · Helga · goblin tower | 56 | 56 | 50.1 |
| tier-9 boss tower | 76 | **72.1** | 75.0 |

Exactly four of the nineteen are vertically symmetric — and the **laser turret is one of them**, which
is exactly how "symmetrical" got written onto this page from a single measurement.
`buildableEdges.test.ts` prints the real table and asserts the set stays mixed.

⭐ **S186 gave back the 8 px that were free**: `EDGE_PAD` 8 → 0, on all four sides, for all 19
recipes. The old 8 was an aesthetic borrowed from a panel (*"matching the panel's 8 px canvas
inset"*), not a safety margin. `FOOTPRINT_MARGIN` (12) is untouched, so a node at the boundary is
still drawn in full.

⛔ **AND THIS IS THE CONSTRAINT THAT BOUNDS ANYTHING FURTHER.** A creature clamps at
`CANVAS_HEIGHT − WORLD_EDGE_MARGIN` = **1040** and `goblinMelee` has a **35 px** arm, so **1075** is
the lowest strikeable y. A tower whose lowest CONNECTOR sits below it cannot be attacked at all —
and a building in this game dies only through its connectors (§4), so that tower would be
invulnerable. At pad 0 a laser turret's lowest node is **1068**, inside the arm with 7 px to spare.
`buildableEdges.test.ts` asserts it for every recipe, derived from the constants.

**2 · The footer plates, and they are the bigger half.** The footer occupies the bottom **84 px** and
its opaque surfaces swallow clicks **on purpose** — `s182UiSurfaceGuards.test.ts` records that
planting a structure under a plate the player cannot see was reported **three separate times**, and
lists the gates that now refuse it. So the dead band and the footer stand on the same ground.

⛔ **THEREFORE GEOMETRY ALONE CANNOT GIVE HIM THE BOTTOM BAND**, and lowering the edge rule further
would put towers under a plate the guards then refuse anyway. ⚠ **THE OPEN QUESTION IS THE FOOTER,
NOT THE EDGE RULE** — move it to a side rail, or auto-hide it while a tower is armed. That is his
call and it is the only thing left in this item.

⭐ **HIS ANSWER, IN TWO STEPS: ALT IS THE COLLAPSE ARROW (S191 A-2, ruled again S192).** S187 gave the band
a collapse arrow; S191 let Alt drop it with a tower in hand, and S192 made it unconditional: *"whenever
you click alt on the … keyboard, it should take the footer down just like as if you click the arrow … it
doesn't matter you have a tower, you hold a tower, you're dragging it … or not … it's independent."*
**ALT TOGGLES THE FOOTER EXACTLY AS THE ARROW DOES** — the same `toggleCollapsed`, armed or not,
wherever the arrow can be pressed (PLAYING, outside the NONET lock), and nothing raises it again behind his
back. Lowered, the band gives back the ground under its plates to every placement gate (S187). Ignored: a
held key's auto-repeat, Ctrl/Meta chords (AltGr), a focused text field (`controls.altFooter.test.ts`).

⚠ **AND ONE MORE THING WORTH CHECKING BEFORE ANYONE BUILDS ANY OF IT:** a LOOSE SHAPE has no edge
rule at all — it can already be hand-placed anywhere in that band today. Only a stamped TOWER is
refused. If what he was doing in the playtest was dropping shapes rather than stamping a tower, the
blocker was a footer plate and never this rule.

**3 · ⭐⭐ The castle keep-out — HALVED (S191).** *"the no build zone near castle is like way too
ridiculous. It needs to be halved. Okay, like the radius where you can't build around the castle."*
Nobody builds within `CASTLE_NO_BUILD_RADIUS` = **61** px of ANY castle anchor (S182's 121, halved and
rounded up — his). ⛔ ~~NOR within `CASTLE_PORCH_KEEP_OUT_RADIUS` = 34 px of any of that castle's 4 porch
slots~~ — S191's per-slot discs, **REMOVED from the build rule in S193** (below): they made the keep-out
reach 108 px south. `CASTLE_PORCH_KEEP_OUT_RADIUS` = **34** px (2 × `CASTLE_PORCH_SLOT_CLEAR_RADIUS`, ⚠ MINE)
survives as how close a BUILT shape may stand before a pull skips that slot. ONE rule, `zones.castleKeepOutHitsBox`: a single
shape (`canBuildAt`) and a stamp (`stampRefusalAt` → `CASTLE`), on the host, the client ghost and the bots
alike. Still inside it: the keep box and the unit-emit ring (46 px). ⚠ No longer inside it: the castle
sprite's roof (67 px) and corners (82 px) — a consequence of his halving, reported, not "fixed".

⭐⭐ **S193 P3-1 — AND IT IS ONE DISC, THE SAME ON EVERY SIDE.** *"going down to the south of it look how far
i need to be … to the right of it … i can build pretty close … it should be just as far as the horizontal …
like a short radius that you can't build, like immediately around it."* The porch slots all sit SOUTH
(anchor.y + 74), so S191's per-slot discs stretched the keep-out to **108 px south** against 61 east —
measured through the real `stampRefusalAt` on the 4P board: a laser turret needed a 73.9 px gap east and
108.0 south, a single shape 61 east and 105 south. **THE PORCH DISCS ARE OUT OF THE BUILD RULE**:
`zones.castleKeepOutHitsBox` is the `CASTLE_NO_BUILD_RADIUS` disc and nothing else, so every recipe now
gets the same gap on every side (laser turret 61.9 / 61.0, single shape 61). What the discs protected moved
to where it belongs, both uniform: a **PULL skips any slot a built shape stands within
`CASTLE_PORCH_KEEP_OUT_RADIUS` (34) of** (`firstFreePorchSlot`'s `built` arm — nothing is minted into a
tower; with every slot covered the pull is the old full-porch no-op, the shape stays banked), and a
**stamp is `BLOCKED` over a shape resting on the porch** (`blueprintLegality` arm 5, `STAMP_CLEARANCE`).
⚠ The trade, his call: a player who builds over his own porch loses those slots for pulls until the tower
goes. `castleKeepOutS191.test.ts`, `zones.test.ts` (32 directions × every seat).

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

### 5b · ⭐ THREE UNIT RULES HE REPORTED, FIXED IN S189 (`s189/units`, deploy #4)

- **THE VOLTKIN GOES FOR THE ENEMY FIRST (C3).** *"Vulcan attacks his own buildings … instead of going to
  the right to my zone"* — owner, S189. His order: (1) an enemy UNIT inside his 180 px `attackRange`, zapped
  where he stands; (2) the nearest ENEMY connector ANYWHERE on the board, walked to; (3) only when NO enemy
  connector exists, his own nearest. ⛔ (3) is a FALLBACK, never a distance contest — an enemy connector
  1100 px away beats an own one 30 px away. Pinned through the real host tick by `voltkinEnemyFirst.test.ts`
  (mutation-tested). ⚠ (1) is what holds a Voltkin at home under a continuous raid — shipped behaviour.
- **HELGA STAYS ON THE BOARD (C8).** *"Helga moves behind the map"* — owner, S189. Her patrol point and her
  integrator are both clamped to the creature bound, [40, 1880] × [40, 1040] (`clampIntoPlayfield`,
  `clampPointIntoPlayfield`); the old claim that her hub leash kept her off the edges was false from S183
  on. `helgaOnTheBoard.test.ts`.
- **THE KRAKEN'S SONAR SHOVES 70 PX AND STUNS 2 S (C10).** *"the Kraken sonar sends units flying … outside
  the map … knock them back a little bit … and stun them"* — owner, S189. `KRAKEN_SONAR_KNOCKBACK_PX` =
  **70** (2 × the 35 px melee arm — ⚠ MINE) of slide, the impulse REPLACING the victim's velocity;
  `KRAKEN_SONAR_STUN_TICKS` = **120** (2 s, ⚠ MINE, S169). ⛔ `KRAKEN_SONAR_KNOCKBACK = 26` is DELETED: it
  was a per-substep velocity (~11,000 px of travel), not the "body-length and a half" its docblock claimed.
- **⭐ T16 — EVERY TV GIVES ITS VOLTKIN BACK, EVERY WAVE (S192, `s192/voltkin`).** *"I had five TVs, full
  health, but no new Voltkins each new wave phase. I had to … rebuild the Voltkin tower"* — owner, S192.
  At the **FIGHT→BUILD** edge (Helga's R190-J edge, ⚠ MINE), every standing TV with no Voltkin of its own
  gets one at its centre: `VOLTKINS_PER_TV` = **1** (⚠ MINE). `resummonVoltkins` (`voltkinTv.ts`), one call
  in `hostTick` after `recallArmies`. Live Voltkins and summons already on their way are bound to their own
  seat's TVs, nearest first, over a total order, so no TV is summoned for twice. ⛔ **A TV RE-SUMMONS IFF IT
  WOULD IGNITE NOW** (merge-owner ruling, S192 audit): the census and the ignition predicate share ONE
  isolation test, `isIsolatedVoltkinChain` — S48's *"if you accidentally connect anything else to the
  structure it shouldn't go off"*. ⚠ So a TV with an extra shape welded on stops re-summoning, as it would
  not ignite (unlike Helga, whose hall survives a weld). And ONE owner rule, `voltkinTvOwner`: majority
  colour, **lowest seat on a tie**, for ignition and the wave alike. A fallen or broken TV summons nothing.
  The same branch fixed the two defects that ate TVs at ignition — the matcher ignored every TV closed while
  another Voltkin was emerging, and a queued same-seat emerge latched the slot for the match.
  `voltkinResummon.test.ts`, both sims, mutation-tested. ⚠ Still true: worker mode (`?worker=1`) emerges in
  4.8 s where direct takes 900 ms (late, never lost); two TVs closed in the SAME frame — the second waits
  for the next FIGHT→BUILD.

⭐ **THE FFA SPREAD IS ON THE STRICT PREDICATE (S191 C-6, merge owner's go).** `spreadEnemyTarget`
builds its victims, and scans the chosen victim's bonds, over the S162 STRICT enemy set (neither endpoint
the creature's own seat's colour) — so a chewer / drone / structure-attacker can no longer be handed a
MIXED bond (a weld of its own structure), the "my own creature destroys my own tower" chain S162 closed at
the nearest-bond step. Found by the S190 perf audit (`S190_CANON_NOTES_perf.md`). The reference fixture
(`bondTargetReference.fixtures.ts`) moved first; `spreadStrict.test.ts` drives 40 chewers through the real
host tick beside a welded mixed structure (30 of them targeted a weld before the fix). The Voltkin
(`enemyOnly: false`) is unchanged. A targeting rule both peers compute — it rides the deploy's bump.
⚠ **S193 P3-2: the spread now serves only the CHEWER and the DRONE** — a structure-attacking unit takes the
nearest strict connector with no spread at all (§5c).

⭐ **AND THE SCAN IS NOW INDEXED (S190 `s190/perf`), WITH BYTE-IDENTICAL OUTPUTS.** One classification of
`world.bonds` per colour per tick, opened and closed around exactly the creature loop
(`openBondTargetEpoch` / `closeBondTargetEpoch`) and re-validated before every scan; 120 creatures went
6.6–7.1 → 2.5 ms mean. `bondTargetIndex.differential.test.ts` proves targeting and `hashWorldStateFull`
unchanged.

### 5c · ⭐⭐ WHO A UNIT GOES AFTER — THREE S192 RULES (`s192/units-ai`)

- **HELGA PATROLS IN BUILD TOO (T5).** *"Helga is not patrolling during … the build stage. She just stands
  behind her tower"* — owner, S192. `stepPrincessPatrol` runs from her FSM's IDLE arm (FIGHT) and from the
  host's defender poll in BUILD. BUILD is MOTION ONLY: no acquire, no fire clock, no aura, no state change —
  she stays IDLE with no target, so her theme does not play all build stage. DORMANT (R190-J) does not move.
  `helgaBuildPatrol.test.ts`.
- **NOBODY TARGETS THE DEAD (T13).** *"my spawn were attacking him, even though it was already dead … they
  went back to the castle that's already destroyed"* — owner, S192. ONE predicate, `isLiveCreatureTarget` =
  a live pool · not a corpse-in-waiting (`pendingCreatureDeaths`) · targetable — at every pick AND every hold
  (`liveTargetSites.guards.test.ts` enumerates them). The march never goes to a fallen keep
  (`enemyCastleMarchPos` skips `castleHp <= 0`). ⛔ **SUPERSEDED: the S191 perf report that the nav-unit index
  deliberately did NOT filter a unit killed earlier in the same tick ("a behaviour question, reported, not
  built", `S191_PROGRESS_perf.md`).** He ruled it a bug; the index now reads the predicate live and the perf
  oracle asserts `pendingDeathReturned === 0`. Two rulings bound it: **a fading unit stays a target**
  (R192-U2, *"Units are either destroyed or respawned"* — there is no DESPAWNING clause), and **a fallen
  tower's leftover shapes stay targetable until destroyed** (R192-U1, *"just as it is today"*).
- **CHASE A DRONE SMARTLY — NEVER ACROSS THE MAP (T6).** *"I didn't say ignore drones or pencil chewers all
  the time. It just has to be smart"* — owner, S192. A FAST NON-COMBATANT — cannot strike a unit
  (`isNonCombatantType`: lightning drone, pencil chewer) and faster than `CHASE_GIVEUP_SPEED_RATIO` = **1.25**
  × the chaser (`maxAccel`) — is engaged when ANY of: (1) within the chaser's reach +
  `CHASE_GIVEUP_SLACK_PX` = **20** px; (2) the chaser AND the quarry both stand in the chaser's OWN zone
  (*"you're still in your zone"*); (3) the chaser can cut its path off before it arrives. Otherwise it is
  neither acquired nor held, so it cannot be re-taken until one of the three holds again — no ping-pong, no
  memory. Both numbers ⚠ MINE. A unit that can strike back is never skipped (R184-A untouched); turrets,
  stink towers, castle guns and Helga (*"that's the whole point of Helga"*) are unchanged. Measured, a
  scripted drone flying past a unit 40 px inside enemy ground, 400 ticks: melee goblin −57.0 % of its advance
  before → **−6.6 %**; orc boss −57.8 % → **−7.3 %** (S192's −37.6 % / −38.2 % was before the S193 audit added
  "the chaser too" to (2)). `chaseGiveUp.test.ts`, mutation-tested.
- **⭐⭐ THE NEAREST ENEMY FIRST — NOT POINTS, NOT A HASH (S193 P3-2, `s193/playtest3`).** *"The orcs that are
  underneath me directly … they're not attacking me. They're going all the way diagonally to attack the Nagas
  … Is it because he has more points …? … simple creatures should target the nearest enemy spawn right around
  them first."* — owner, S193. **It WAS points, a hash and seat order:** `structureTargets` took its connector
  through the FFA spread, which picks the VICTIM seat by `mix32(id, sourceSpawnerId) % (n + 1)` with slot 0 =
  the SCORE LEADER (ties → lowest seat). Measured, 4P, seat 3's army of 25 beside seat 0's building (380 px)
  with seat 1's 1370 px away: **9 of 25** went past him with nobody ahead, **16 of 25** once seat 1 led. Now
  every structure-attacker's ladder is geometry in a total order: an enemy UNIT around it (`pickNavUnit`,
  220 px acquire / 300 hold) → the nearer of the nearest lone enemy shape and the nearest STRICT enemy
  connector (`nearestStrictEnemyBond`, squared distance then id) → the nearest LIVE enemy keep
  (`enemyCastleMarchPos`). Measured after: **25 of 25**, whoever leads. Untouched: R183/R184 retaliation, T6,
  T13, the endgame pants (their own victim rule), and the CHEWER and DRONE, which keep the spread from their
  own branches (⚠ MINE to leave — reported). `nearestEnemyFirst.test.ts`, all four quarters, mutation-tested.

---

## 6 · THE WIRE

`PROTOCOL_VERSION` is **62** (S193 — deploy #23; see the S193 entries on the const).

⭐⭐ **WHAT RIDES 62 (S193, deploy #23)** — s193/playtest3: castle keep-out one 61 px disc on every side, creatures attack the nearest enemy first.

⭐⭐ **WHAT RIDES 61 (S193, deploy #22)** — deploy #22 train: weld (repair jobs, FIX_ALL, ownPrimitiveIds), goblin auto-build (SET_AUTO_FEED), CF-1 no carry through a struck mixed weld; bots, visuals-4/5, endstats ride.

⭐⭐ **WHAT RIDES 60 (S193, deploy #22)** — s192/magic: magic resistance on the DEF ladder (attack classes, per-race MRES), the 'mres' castle upgrade.

⭐⭐ **WHAT RIDES 59 (S193, deploy #20)** — s192/endgame: the pants waves 27-31 — monster + mega pants types, the build lock, trickle + live cap, endless final fight.

⭐⭐ **WHAT RIDES 58 (S193, deploy #18)** — s192/zombies: every blast falls off with distance, zombie blast 312 split 2:1 sparing his side, THE RISEN from every zombie kill, CORPSE EATER heal bank.

⭐⭐ **WHAT RIDES 57 (S193, deploy #17)** — s192/units-ai: T13 never attack the dead + fallen-keep march, T6 smart chase (own zone), T5 Helga BUILD patrol — host-tick targeting rules.

⭐⭐ **WHAT RIDES 56 (S192, deploy #12)** — s191/owner: CAST_SCORCHED_EARTH + Player.scorchedEarth, the scorch burn rules incl. Helga, the stock rule (chewers/drones persist).

⭐⭐ **WHAT RIDES 55 (S192, deploy #9)** — s191/tune: Ra column 35 total split (75 for a WRATH seat, its Pharaoh too), castle no-build 61 + porch discs, APEX x6.

⭐⭐ **WHAT RIDES 54 (S192, deploy #8)** — `s191/carry`: the lightning hub's self-destruct as 120 ladder fifths split in a total order (owner spared), the popped-bag spare, the strict FFA spread, and OVERKILL CARRYING into the next connector — only into connectors the struck connector's owner placed. Riding along: the castle's separate heal number (`castleHealedHp`), the bar on the tower's own star, the Ra strike above buildings.

⭐⭐ **WHAT RIDES 53 (S192, deploy #7)** — `s191/addons`: the new optional `Creature.rageStartTick` (serialized, on the wire, wide-hashed `:rs`), the Warlord's 25 s rage latch then a 25 s cooldown (the owner's), and the BLOOD FRENZY source as his own open window — the frenzy never sets or clears a Warlord. Local only: Alt toggles the footer like the arrow, R190-G right-click swallowing, the modal cover + its close-click latch.

⭐⭐ **WHAT RIDES 52 (S191, deploy #5)** — `PROTOCOL_VERSION`'s own docblock is the source: `s189/weld` (at c7436a2) adds `ownBondIdLimit` on spawners and defenders (the connectors a tower was BUILT with; on the wire, wide-hashed), the serialized `'DORMANT'` Helga state (she is kept as a record and revives at both phase edges, R190-J) and the built-with survival rule — a tower stands while its OWN connectors stand, whatever is welded on (C2) — with its render walks, the empty S107 P4 lock and own-member razes; `s189/net` adds the per-match id (`START_GAME_SIGNAL.matchId`, `LOBBY_PRESENCE.phase` + `matchId`, `NETSNAPSHOT.matchId`, envelope-only) and the C6 beacon election (the elder keeps the room). ⚠ Weld round 5 (R191-A, per-tower FIX/SCRAP in a welded structure) is NOT on 52 — audited red in S191 and carried; so a welded structure is still unrepairable on the live build (R185-B as ruled in S185). ⭐ **S193 — that changes when `s189/weld` lands (59 → 60 or later):** rounds 5 + 6 ride it — `ownPrimitiveIds` replaces `ownBondIdLimit` (the shapes a tower was built with), a welded structure IS repairable **per tower** (R191-A, §7b), and FIX becomes a gatherer job with a castle FIX ALL (R191-B / R192-W1, §8): the new `FIX_ALL` intent, `REPAIR_STRUCTURE` queuing instead of restoring, and the serialized, wide-hashed `World.repairJobs` / `nextRepairJobId` / `Gatherer.repairTask`.
A mismatched peer is **refused outright** — there is no degraded-play
path. An **additive-optional** field costs no bump; a **required** new field, or a new discriminant
value on an existing action, does.

⭐⭐ **WHAT RIDES 51 (S190, deploy #4)** — `PROTOCOL_VERSION`'s own docblock is the source; ONE bump for every
branch merged on `s190/deploy4`, and each of these earns it alone: `SerializedPlayer.raStrike` (live in 50) is
REPLACED by **`raStrikes`** (at most `WRATH_OF_RA_CHARGES`, cast order, validated and capped); WRATH OF RA's
conditional wave-11 offer and its three casts a FIGHT seeded `seat + MAX_PLAYERS × charge`; a Ra column's
sever no longer refused for a benched caster; the new serialized `CreatureType` **`'t3BatSwarm'`**; the
level-10 vampire offer; and the drafted strike baked at birth into **`Creature.atkFifths`** (serialized,
hashed `:ak`) — additive-optional in shape, but a v50 successor would strike unbuffed and a v50 client would
print the type's strike, the S186 test. **Riding without needing it:** `Creature.healedFifths` (R190-I, the
heal counter, hashed `:hf`), `WorldSnapshot.nextCreatureId` (emitted only when the live-id derivation would
under-state the host's counter), and `s189/units`' host-side rules (the 70 px sonar, Helga's clamp, CORPSE
EATER's rage latch, R190-C regen, the spawn-queue drains). `s190/perf` changed nothing on the wire.

⭐⭐ **WHAT RIDES 50 (S188)** — `PROTOCOL_VERSION`'s own docblock is the source, and every item on it
earns the bump alone: `CHOOSE_DRAFT.pick` gains the discriminant `'racial'`; the new client intent
**`CAST_POWER_OF_RA`**; the new serialized `CreatureType` **`'t3PiranhaElite'`**; five optional fields,
each emitted only when set and each hashed — `Creature.hellspawnGen`, `Creature.corpseEaterUntilTick`,
`Creature.corpseEaterAnchor`, `Player.dynastyHpLost`, `Player.raStrike` (replaced by `raStrikes` in 51); an absent `castleHp` now
meaning THAT seat's upgraded ceiling (a changed meaning, not a field — a v49 peer would read a bought
keep back at the flat 2500); the enraged-blow rule (`ragedFireTick`, §3e); and the twelve racial rules
both peers compute.

⚠ **AND ONE MORE OPTIONAL FIELD RODE 50: `Creature.attackCycleRaged`** (deploy #2, fix round F3 — the
per-cycle rage latch, §3e). It is emitted only when true and hashed (the `CreatureHashed` union and the
`:ar` projection). ⭐ The 50 docblock omitted it until S190; the deploy-#4 merge BACKFILLED it there, so the
docblock and this list now agree.

✅ **CLOSED — R190-B (S190): DEPLOY #1 AND DEPLOY #2 BOTH ADVERTISE 50.** The deploy-#2 fix rounds changed
four sim rules — the lifesteal batch, the per-cycle rage latch, a fallen demon seat's burn, the feeding
boss's re-anchor — and added that field, all under the same 50. Put to him: *"It's not a question."* Nothing
to do — 51 refuses both old builds at HELLO.

⭐⭐ **S187 TOOK 48 → 49 FOR A NEW CLIENT INTENT, `CHOOSE_DRAFT` — AN ORDINARY BUMP, AND THE
CONTRAST WITH ITS PREDECESSOR IS THE POINT.** The upgrade draft sends the seat's pick as a client
intent, and a v48 host has no row for it in the allowlist: it would DROP a v49 joiner's pick, so
that seat could never draft while every other seat could, and the deadline would choose for it
permanently, every five waves. ⚠ A second reason would have earned it alone — a drafted upgrade
changes a unit's POOL, an undamaged creature's `ehp` is rebuilt by the receiver from its OWN
`hp`/`def`, and the new `Creature.maxEhp` that carries the buffed pool is a field a v48 peer does
not know exists.

⛔⛔ **S186 TOOK 47 → 48 FOR A CHANGE THAT TOUCHED NO FIELD AT ALL — THE FIRST IN THIS REPO'S
HISTORY, AND THE ONE EVERY FUTURE SESSION SHOULD READ.** S186 rebanded the win score, the quarry's
spawn rate and the free-spark cap. All three derive from `world.waveNumber`, which has been synced
since 33→34, so by the letter of the additive-optional rule the change was free — and that reading
was WRONG. ⭐ **A SHARED CONSTANT BOTH PEERS COMPUTE FROM IS PART OF THE PROTOCOL EVEN THOUGH IT
NEVER RIDES THE WIRE**, which is the class `VOLTKIN_HP` (27→28), `attackRange` (31→32) and
`castleHp` (32→33) were all bumped for. Two builds advertising 47 would shake hands and then
disagree three ways: `tickGameState` — **which the CLIENT also runs** — gates on `winScoreForWave`,
so a stale peer at wave 6 declares a WIN the host has not (the exact mechanism of 32→33's *"a NEW
VICTORY CONDITION in tickGameState"*); a stale worker mirror computes a different spawn interval
(precisely why 33→34 was taken); and the two evict different free sparks. ⚠ **It was found by the
end-of-session audit, AFTER the four priorities had shipped claiming no bump was needed** — the
reasoning had stopped at "no new field". **The question is not *did a field change*, it is *can two
builds that will shake hands disagree about anything either of them computes*.**

⚠ **PROTOCOL 47 CARRIED TWO CHANGES FROM TWO PARALLEL BRANCHES.** Both are recorded below.

⭐ **S182 took 46 → 47 for exactly that second reason**, and it is the worked example: the owner
reported *"Voltkin music and electric beams"* on his zombie boss. The beams were a stale negation
and cost nothing. The MUSIC was a new discriminant — every non-chewer creature severed a connector
with `cause: 'creature'`, which `audioManager` routes to the Voltkin's lightning crackle, so all 21
unit types and all six bosses played it. `'unit'` was added and `'creature'` now means the Voltkin
alone. ⚠ The suicide blast was FIRST given the existing `'bomb'` to avoid a
second discriminant, and that was WRONG: `severToastRenderer` suppresses `'bomb'` unconditionally
under the owner's S130 F3-C ruling, so a bomber's sever went silent. It uses `'unit'` too. **A new value on an existing action cannot ride as additive-optional** — a stale
peer passes the allowlist and then falls through every switch over `cause`, which is the
silent-divergence half of a mismatch.

⭐ **AND SO DOES REMOVING A REQUIRED ONE — S182 is the first bump in this repo's history for a
REMOVAL.** The WIRE now strips `prevPos` from every primitive (it is ~34% of a primitive's
wire cost and a joiner runs no sim, so nothing reads it). ⚠ The strip is at the TRANSPORT
boundary, NOT in `netSnapshot()` — `netSnapshot` is also the worker→main mirror transfer and that
mirror runs a sim that needs `prevPos`. Stripping an already-*optional* field —
`trimMirrorCreature`, `trimMirrorSpawner` — is free, because a stale peer's deserializer already had
a default and simply never misses it. `prevPos` was **required**, and a v46 peer does
`{ ...s.prevPos }`: handed `undefined` that yields `{}`, and the first Verlet substep on a promoted
successor turns every position into NaN. **A stale peer does not ignore a missing required field, it
dereferences it.** ⚠ Consequence, accepted: a successor promoted on host migration inherits
primitives at zero velocity — a settled board is unaffected, a mid-swing one settles instead of
oscillating.

⭐ **Coordinates ride the wire rounded to 2 decimal places** (`wireNumberReplacer`, applied by
`NetTransport.send` for `NETSNAPSHOT` only). Integers pass through untouched. The rounding is a
`JSON.stringify` replacer rather than a pass over `netSnapshot()`'s output **because `netSnapshot` is
also the worker→main mirror transfer, and that mirror is hash-compared** — rounding there turned
`?worker=1` red on `HASH MISMATCH` while all 4747 unit tests stayed green.

⭐ **MEASURED, S182 — the brother's wave-5 board (250 primitives / 260 bonds / 120 creatures):**

| stage | snapshot | host uplink |
|---|---:|---:|
| pre-S182 (full precision, `prevPos` on, sent twice) | 107.5 KiB | 17.61 Mbit/s |
| + coordinate rounding | 92.4 KiB | 15.14 Mbit/s |
| + `prevPos` off the wire | 84.0 KiB | 13.77 Mbit/s |
| + one strategy instead of two | 84.0 KiB | **6.88 Mbit/s** |

**2.56× less upload**, 107.5 → 84.0 KiB per snapshot. ⚠ These are Claude's measurements, taken from
the shipped serializers at the brief's entity counts; the baseline row reproduces the brief's
independently-measured ~107 KiB / ~17.6 Mbit/s, which is what makes the rest comparable. It is
application-level payload — WebRTC/DTLS/SCTP framing is on top, so treat every figure as a floor.
⛔ **2.56× is not "fixed".** ~6.9 Mbit/s of sustained upload is still more than many home
connections carry. Delta encoding — cost scaling with what MOVES rather than what EXISTS — is the
structural fix and is not on this branch.

⭐ **Snapshots take ONE strategy; everything else still takes all of them.**
`SNAPSHOT_SINGLE_STRATEGY` is **true** (owner ruling, S182: *"if it halves our bandwidth, then of
course we need to do it"*). `HELLO`, `START_GAME_SIGNAL`, `LOBBY_*`, `INTENT` and `MIGRATION_CLAIM`
keep the full multi-strategy broadcast — those decide whether a match can *start*. The chosen
strategy must carry **every** peer at the table, not merely one, or a 3–4 seat match starves a seat.

Already on the wire, so a client can read them for free: creature `ehp`, defender `ehp`, primitive
`hp`, `castleHp`, and **`Bond.damageFifths`**. Each is emitted **only when damaged**; absent means
full, and both peers recompute it identically from the type. **A live enemy health readout therefore
costs nothing.**

⭐ **THREE FIELDS DEPLOY #4 ADDED TO A CREATURE OR THE SNAPSHOT, AND WHAT EACH COSTS:**
- `Creature.atkFifths` (S190 draft-atk) — emitted only when a pick moved the strike; **+14** chars per
  drafted race unit and **+16** per boss beside `maxEhp`'s 11, so 120 drafted creatures ≈ +1.6 KiB a snapshot,
  ~2 % of the S182 84.0 KiB table (`netWireSize.draftAtk.test.ts`). Validated on the way in: a positive
  integer, or dropped.
- `Creature.healedFifths` (S189 render, R190-I) — a monotonic count of every heal applied, emitted only
  once it is above zero. ⚠ PERMANENT: about 17–19 B a snapshot for every creature that has EVER been healed.
- `WorldSnapshot.nextCreatureId` (S189 units) — emitted only when re-deriving from the live ids would
  under-state the host's counter, so a successor never re-mints a dead creature's id.

⚠ **`Bond.damageFifths` WAS MISSING FROM THAT LIST UNTIL S182, AND IT IS THE MOST LOAD-BEARING ITEM
ON IT.** A structure's whole durability lives on its connectors (R75/R173-B), so *every* building
health readout — the bar, the FIX button, and the damage ramp in §7 — reads this field and nothing
else. It is serialized additive-optionally (`save.ts:1836`, emitted only when > 0, restored `:1665`)
and hashed at both sites (`stateHashFull.ts:278` union, `:547` projection). A session that read the
old list would have concluded a building's health was NOT on the wire and gone looking for a
protocol bump it did not need.

## 7 · ⭐ THE DAMAGE RAMP — FIVE BUILDINGS (S183). THE PILOT WORKED AND HE SCALED IT.

Five buildings now carry a 24-frame ramp from pristine to rubble: the **lightning hub** (the S182
pilot, `scripts/build-sheet-atlas.mjs`) and, added in S183, the **goblin tower**, the **laser
turret**, the **pentagram** and **Helga**, built by the sibling intake
`scripts/build-alpha-sheet-atlas.mjs`. `RAMP_SPECS` in `render/structureRamp.ts` has five entries
and `canon.test.ts` asserts the set.

⭐ **HE OPENED THE GATE HIMSELF, HAVING PLAYED THE PILOT.** In S182 he said *"we're gonna do this one
at a time … currently you're just gonna focus on the lightning hub. I will present them one after
another"*, and that is exactly what happened — he played the hub in S183, said *"a low creature
attacks, you can see the tower actively get more and more destroyed until it gets completely
destroyed. So very well done with the lightning hub. Keep it like that for now,"* and then presented
the other four. **The one-at-a-time rule was satisfied, not overridden.**

⛔ **THE SELF-DESTRUCT DID NOT COME WITH THE RAMP.** R182-A is hub-only — *"it is a suicide drone
building, so it makes sense. We won't do it for every building."* The four new towers carry
`selfDestructBelow: null` and a test asserts exactly one entry opts in. `hostTick` additionally hard-
gates the fuse on `recipeId === 'lightningHub'`, so a future spec cannot leak it by accident.

⛔ **TWO INTAKES, ONE DOWNSTREAM CONTRACT.** The hub's sheet is matted off near-BLACK with drawn
rules and a baked frame number per cell; the four S183 sheets are **alpha-matted** with neither.
Three behaviours therefore invert (gutter detection instead of drawn rules, an alpha clean-up
instead of a colour key, an optional numeral strip instead of a mandatory one) and **everything
after that is the same code** — one union bbox, height-fit, bottom-centre foot anchor,
`<name>-atlas.png` + `<name>-anim.json`, 2 rows of 12. `structureRampAtlas.test.ts` asserts one
manifest contract across both intakes, which is the mechanical proof they did not fork.

⚠ **AND THE ALPHA NEEDED CLEANING, WHICH IS NOT OBVIOUS FROM LOOKING AT THE SHEETS.** On all four,
essentially ZERO pixels were fully opaque (α=255 at 0.0–0.1%) and 19–53% of the canvas sat at α 1–31
— a ghost wash that ships as a translucent box around the tower, the defect he rejected on the
Voltkin. Floor α ≤ 24 → 0, ceil α ≥ 244 → 255. Cells are uneven on every sheet (goblin rows
285/263/216, laser 258/250/211, pentagram 260/240/206, Helga 272/240/234), so bounds are DETECTED at
α ≤ 48; a uniform stride clips frames.

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

⭐ **THE BLAST IS 120 FIFTHS IN TOTAL NOW (R182-C, BUILT S191).** The hub's blast is ladder damage —
`STRUCTURE_SELFDESTRUCT_FIFTHS` (120) split across every enemy entity inside
`STRUCTURE_SELFDESTRUCT_RADIUS` — not the raze, and S157 P0 still spares the owner. See §9d item 2.

---

## 7b · ⭐⭐ ONLY THE TOWER IS VISIBLE (S183) — AND EVERY CONNECTOR MECHANIC MOVED ONTO IT

> *"Once the building is built, I don't wanna see the shapes and connectors behind it. I just wanna
> see the building because it looks messy."* — owner, S183
>
> *"Basically, every mechanic from the built connectors is transferred now to the towers. Very
> simple."*

That second sentence is the rule. The shapes stay simulated, raidable and chewable; only their alpha
moves, and everything the player used to do to a connector they now do to the building.

⛔ **THE FEATURE WAS BUILT IN S175 AND FOUR SEPARATE THINGS DEFEATED IT.** He reported it as *"literally
not here"* and a session that had just read the S175 commit told him it worked. He was right. It is
recorded here because "the feature exists" and "the feature reaches the screen" are different claims,
and only the second one is worth anything.

| # | what defeated it | fixed by |
|---|---|---|
| 1 | `spawnerZoneRenderer` **redraws** the connectors, beads, rings and core on top of the faded ones, with no reference to `towerCover` anywhere in the file — its own comment says it draws *"on top of the normal bond visual `structureRenderer` already drew"* | the aura now fades on the same ramp as the cover |
| 2 | `DAMAGED_BOND_MIN_ALPHA` pinned a connector back to 0.85 the instant it took damage | retired in place (see below) |
| 3 | the goblin tower and pentagram are spawners with no art, so no renderer drew them and none published cover | they are in `RAMP_SPECS` now |
| 4 | the laser turret and Helga are **defenders** — `world.defenders`, not `world.creatureSpawners` — so **no publish site in the tree could ever reach them** (R175-B parked exactly this: *"includes defenders, but they have no art yet"*) | a defender publish path |

⭐ **R183-E — THE REVEAL IS ON THE CRUMBLE, NOT ON THE FIRST SEVER.** He corrected this mid-session,
against the S175 behaviour AND against his own earlier S175 P9 ruling:

> *"It does not come back when the building starts dying so you can still repair it. No — because you
> can see the tower is damaged. You can just click the tower and repair it. You don't have to see the
> connectors. The connectors come back when the tower is being destroyed, like when it hits zero
> health and you can see it crumble and fall. That's when they phase back in within like a second."*

So the shapes are hidden for the building's **whole life**, damaged or not, and return only as it
falls. ⚠ This is why `DAMAGED_BOND_MIN_ALPHA` had to go: S175 P9 added it so *"the floating number
appears over a connector the player can actually see"*, which is precisely the behaviour he reversed.
It only ever did anything UNDER a tower — `Math.max(1, 0.85)` is 1 — so every other bond in the game
draws identically.

⛔ **AND THAT IS WHY THE CLICK TARGET IS LOAD-BEARING, NOT A NICETY.** *"Instead of clicking the shape,
it's transferred to the tower. You click on the tower, ANYWHERE on the tower, and you still have the
tower sheet with those options."* `towerAnchorAtPoint` serves race towers only and walks
`creatureSpawners`, so none of the five ramp towers and neither defender was in it —
`rampAnchorAtPoint` is. ⚠ Its first version hit-tested a band the art does not occupy (the art
**straddles** the centroid; the box assumed it stood on it), so the bottom third of every tower was
dead and 50 px of sky above it was live. **A tower you cannot click is a tower you cannot repair**,
which would have been strictly worse than the mess he asked us to remove.

⭐ **R183-F — THE AURA FADES ON EVERYTHING, FRIEND AND ENEMY.** Asked whether to keep the charged
connectors on enemy towers as a cue for where to cut, he chose to fade them everywhere:

> *"It doesn't matter if you know what connectors to cut. You can't control your spawn. They're just
> attacking based on their mechanics … you can't control your characters anyways."*

⚠ **ONE EXCEPTION TO HIS PREMISE, ACCEPTED KNOWINGLY:** a **raid** IS player-directed —
`world.ts` lets a player right-click a specific bond and pay a raid point for it. Verified safe: the
raid pick never consults `coverAlphaForBond`, so an invisible connector stays clickable and raidable.
The mechanic works; you aim blind. One line reverses it.

⭐ **R183-G — THE UNIT SPRITES GO BEHIND THE BUILDING, NOT AWAY.** Both alternatives were put to him
(suppress the sprite, or add an idle/active state machine) and he rejected both:

> *"They're just fade out and one layer below. They're not over the tower, but behind and kind of
> phased out. So you can kind of count how many sprites you have there. But the tower is the main
> thing that is visible."*

Pixi z-order is `addChild` order, so this is decided purely by the sequence of `new XRenderer(...)`
calls in `main.ts`. ⚠ **S189 C1 — AMONG zIndex-0 CHILDREN ONLY.** `exitButton.ts` sets
`app.stage.sortableChildren = true`, so Pixi sorts the stage by `zIndex` every frame: the S187 draft panel
carried `zIndex = 900` and drew over his cruiser (*"the spark should be one layer above … the mouse is under
it"*). ⭐ The rule since: **no stage child gets a zIndex; place it by its staging line** — the exit-confirm
root (900) is the one standing exception (`s189CruiserAboveDraft.test.ts`). And a surface staged AFTER the
panel now draws over it: the codex and CONNECTION LOST backdrops swallow the click (R2-1), and the panel
answers no input question while either is up (`DraftOverlay.setCoveredBy`, S190). ⚠ **No renderer runs under vitest**, so z-order is invisible to every behavioural
test in the repo — Helga drew on top of her own hall with the whole suite green. A source-text guard
pins the three construction sites in order, and states that limit on itself.

⭐⭐ **R185-A — THE WELD STAYS AT FULL OPACITY. RULED S185, AND THIS CLOSES THE ONLY OPEN CALL THIS
SECTION EVER HAD.** The cover set is the recipe's own members, so a hand-placed shape **welded** onto
a tower is not a member and draws at alpha 1 under the sprite. That was reported as a KNOWN GAP for
two sessions. It is not a gap:

> *"But remember we said we should be able to connect towers together. So in a welded shape, a shape
> that's not from your tower, should be at full opacity."* — owner, S185

⛔ **SO DO NOT HIDE IT AND DO NOT "SWALLOW" IT.** The exclusions that produce this — `ringBondsOf`
refusing any bond with an endpoint outside the ring (`towerRenderer.ts:79`) and the star walk
(`structureRamp.ts:509`) — are **correct as written** and need no change. A session that proposes
hiding a welded shape is reversing a ruling, not fixing a bug.

⭐⭐ **R185-B — AND THE UNREPAIRABLE CONSEQUENCE IS A DELIBERATE TRADE HE ENDORSED, NOT A BUG.**
⚠ **AMENDED S191 BY R191-A — read the paragraph after the quote.** As ruled in S185, `structureRepair.ts`
refused any component member with `origin === null`, so **one** welded shape made a whole structure
permanently unrepairable. Put to him as a defect; he reframed it as a mechanic and kept it:

> *"So if you have a tower that's producing tier three monsters, let's say a bat tower, and you're
> welding it through many connectors to another bat tower — those two bat towers are a lot harder to
> destroy because now they're welded, so they have a lot higher HP. But they cannot be repaired
> either, because it's like a full shape now. So you can just keep adding connectors to it and make
> it higher HP. And then once the enemy does manage to destroy it, it destroys the connectors that
> he's attacking. So I guess that's just a way of looking at it. That makes sense."* — owner, S185

⭐⭐ **R191-A (S191) AMENDS IT: EACH TOWER IN A WELD IS STILL A TOWER.** *"a welded shape can still consist
of multiple towers … the towers themselves should still be shown as towers and be able to be repaired
and … scraped … just the tower, not the whole shape … when you clicking on a welded structure you can't
fix it because it's … fixing what … you have to fix [them] manually."* So: a click on a tower's own shape
opens THAT tower's card, whose FIX restores that tower alone (priced by what IT lost) and whose SCRAP
takes it alone; a click on the welded shape opens the WELDED STRUCTURE card — SCRAP takes everything,
FIX is refused. The weld still buys pool (the structure's pool is shared, R6); it no longer costs the
towers their repair. `towerUnit.ts` is the one read model; `weldOntoTowerS189.test.ts` pins it.

So welding buys pool, on purpose. ⚠ **ONE THING REMAINS UNVERIFIED AND MUST NOT BE
TREATED AS SHIPPED:** R182-F measured that a welded hub read **48%** on the health bar while its
art read **32%**. S191 C-7 made the bar follow the star (§9d item 3), so both read **32%** now — but
that means the bar shows a welded tower's OWN pool, not the bigger component pool that makes the
weld tougher. His trade depends on a welded stack reading as *tougher*; on the bar it now does not.
That is an owner question, not a defect to fix unasked.

## 7c · ⭐⭐ WHAT THE RENDER BRANCH SETTLED (S189/S190, `s189/render`, deploy #4)

⭐ **R190-H — THE RA STRIKE DRAWS ON TOP OF THE UNITS. HIS RULING.** *"Draw it ON TOP of units."* Only the
strike — the owner's sprite frames, or the code-beam shafts before the art loads — goes to the goblin
renderer's layer above its unit sprites (`drawBossAuras(g, world, this.arrowLayer)`); the telegraph shade,
the hitbox scorch and every other aura stay on the ground. Every charge of WRATH OF RA goes the same way.
**AND ABOVE THE BUILDINGS, WITH ITS RUNE RING ON THE GROUND (S191 C-9).** The strike goes to `raStrikeLayer`,
the LAST child `main.ts` stages on `fogHiddenLayer`, so it draws over the laser rig, the Voltkin TV, HELGA, the
ramp buildings and the stink tower and is still masked by the fog. The art's first **4** slots
(`RA_STRIKE_GROUND_SLOTS` — the rune ring alone, before the beam drops) draw on the GROUND, under the units.

⭐ **R190-I — EVERY HIT AND EVERY HEAL SHOWS SEPARATELY, IN THEIR OWN COLOURS, STACKING. HIS RULING.** *"it
shows every single hit or heal … it looks sick."* A same-tick heal used to hide inside a net damage
number. Heals are counted on the creature (`Creature.healedFifths`, written only through
`noteCreatureHeal`), synced and hashed, so a joiner sees the green number too (§6).
**AND ON THE CASTLE (S191 C-8):** `Player.castleHealedHp` counts every point a keep heals — regen and an HP
purchase, the only two places its HP rises — so a keep hit and regenerating in one window prints a red AND a
green number, not the net. Presentational (no sim reads it), emitted only above zero, wide-hashed; a stale
host that never writes it prints the old net number, never a wrong one.

⛔ **EVERY PIXI PATH SEGMENT STARTS WITH `moveTo` (S189 C7).** *"a big line every time they teleport all over
the screen"* — owner, of DEEP CURRENT. Pixi 8 `arc()` / `lineTo()` join the current pen to their start, and
after a fill the pen sits wherever the last path ended, so a bare `arc()` on a shared Graphics draws a line
from elsewhere on the board. Shipped twice (S86 `hazardRing.ts`, S188 the DEEP CURRENT swirl). The rule:
`g.moveTo(start).arc(…)`, never a bare `arc()` (`s189DeepCurrentNoBeam.test.ts`, `s189PenLiftArcs.test.ts`).

## 8 · REPAIR

FIX is **BUILD-only** (R19) and prices what the structure LOST (R13). S182 added the case that lost
nothing:

- **Missing nodes** → the missing shapes themselves. Unchanged.
- **Damaged but intact** (chipped shapes, or a hurt connector with nothing destroyed) → **ONE shape,
  flat.** R182-E: *"If there's only an amount of HP missing but no connector destroyed … then it takes
  one shape. So far it takes NO shape — that's not correct … whether it's one HP or fifty HP."*
  ⚠ It used to be **free**. (S182 then added that an empty bank read `NEED 1 MORE` — superseded by
  R191-B below: the bank no longer gates the button.)
- **Which shape** is `repairFeeShapeFor`: the blueprint's **most numerous node type**, ties broken by
  first appearance. ⚠ The rule is MINE — he dismissed a per-recipe table as over-thinking — but it
  lands on both examples he reached for himself (pentagram → Triangle, goblin tower → Circle).
  `structureRepairFee.test.ts` asserts the derivation over every registered blueprint, so it can
  never become a copied table.

### ⭐⭐ R191-B (S191, built S193) — FIX IS A GATHERER JOB

> *"clicking on fix … it actually queues … a gatherer and he has to bring the shape from the castle to
> the tower that needs fixing. And once he reaches the tower, that fixes [it] automatically … It's going
> to be the top … priority for your gatherers."* — owner, S191. Refined: *"the priority here is, first of
> all, what are we nearer to? And second of all, does this place even have the shape I need?"*

- **FIX queues a job** for the bill above (one job per tower; `REPAIR_STRUCTURE` no longer restores on
  the spot). Each shape is one task, so a bill spreads over several gatherers.
- **A free gatherer** (searching, empty-handed, lowest id first) takes the first open shape it can get,
  from the **nearer** of its castle bank and the nearest quarry spark of that type; the castle wins a tie
  (⚠ MINE). The bank is debited **on arrival** at the castle; a quarry spark is lifted on pickup.
- **No shape anywhere → it waits**, and the gatherer keeps gathering; it is fetched once one appears.
- **When the last shape arrives** the tower is re-planned: covered → restored (surplus to the bank);
  short (it lost more on the way) → the shortfall is fetched too. A tower that is gone, scrapped or no
  longer fixable cancels its job and **every shape goes back to the bank**; so does an eliminated
  seat's.
- **FIGHT:** a shape already in a gatherer's hands waits in the castle with him and lands next BUILD;
  one not yet picked up is open again. From wave 27 the quarry spawns nothing, so jobs draw on the bank.
- The card's FIX reads `QUEUED` · `NOTHING TO FIX` · `NO GATHERERS` (⚠ MINE: no carrier, no job) ·
  `QUEUE FULL` · `COSTS n`. ⚠ MINE: at most **32** jobs a seat (`REPAIR_JOBS_MAX_PER_SEAT`); a waiting
  job re-plans every **15** ticks (`REPAIR_JOB_REPLAN_TICKS`, phase-spread by job id).
- **FIX ALL** (the castle's top row, §3d) queues every own tower that needs a FIX, nearest the castle
  first. `repairJobs.ts` is the code; `repairJobsR191B.test.ts` drives it through the host tick.

⛔ **TWO REPAIR LIMITS THE OWNER HAS NOT SEEN YET, BOTH CONFIRMED IN CODE:**

1. Repair only works during BUILD, so "a repairable wreck" means *repairable between rounds*. He has
   accepted this (R19).
2. ⚠ **SUPERSEDED by R191-A (§7b): each tower in a weld is fixed from its own card.** As written
   before S191: **one friendly hand-placed shape bonded onto one hub leaf makes that hub permanently
   unrepairable.** `blueprintGroupOf` returns null if ANY member of the connected component has
   `origin === null`, and `seatStructureAt` walks the whole component. S158 B2b fixed exactly this
   lattice problem for the RECIPE (`isStarAt` walks the hub's own bonds) and never fixed it for
   REPAIR. Not fixed here either — it is a scope decision, not an oversight.

---

## 9 · ⭐ THE ARCADE BOARD — RANKING IS AN AVERAGE, NOT A BEST TIME (S182)

**R182-G, ruled by the owner in S182.** The NONET arcade board ranks each player by their
**average** completion time across all their runs, recomputed after every game. Not a best time.

> *"The leaderboard will hold the average time it takes a user to complete … so people are
> competing over a long span. And then that is your ranking."*

⭐ **WHY THIS MAKES A RANDOM PUZZLE SET FAIR, WHICH IS THE WHOLE INSIGHT.** Puzzles are GENERATED,
not premade — `generateSudoku(seed)` with a clock-derived seed, so two players never draw the same
grid. A best-time board across different puzzles compares nothing. An AVERAGE over many runs washes
the difficulty variance out, so the randomness stops being a defect and becomes the mechanism.
**This is why the 30-stage fixed-seed ladder was WITHDRAWN** — it existed only to make per-puzzle
boards possible, and per-puzzle boards are no longer needed.

| | |
|---|---|
| Ranked from | **run 1.** No minimum run count — ruled explicitly. |
| Identity | **the typed name.** Two players choosing the same name MERGE, and he accepted that: *"hold people at their same name, if not then who cares, come back to it later."* |
| Stored | `runs` + `total_ms` per player — never a mean, so the average is LOSSLESS **in arithmetic** (see the caveat below) |
| Board visibility | ⛔ **gated on submission.** You cannot see the names until you enter yours. That is an anti-griefing measure, not a UI flourish. |

⭐ **AND IT IS HARDER TO CHEAT THAN A BEST-TIME BOARD.** One faked 0:01 owns a best-time board
forever; against an average over twenty runs it barely registers.

### ⚠ THE CAVEAT ON "LOSSLESS" — S183, and it is a deliberate trade

Sum-and-count means nothing is lost to rounding. It also means **nothing can ever be repaired**: a
run folded twice biases that player's average permanently, and no amount of further play corrects
it. S183 found a live path to exactly that. The server forgets an idempotency key after 24 h
(`SEEN_RUN_TTL_MS`, pruned on any client's POST), while the client's offline queue was bounded by
COUNT and carried no timestamp — so a run that committed server-side but lost its acknowledgement,
and then sat queued past the TTL, folded a second time.

⛔ **THE FIX TRADES ONE LOSS FOR THE OTHER, ON PURPOSE.** Queued runs now carry `at` and expire at
`PENDING_MAX_AGE_MS` (12 h, under the server's 24 h and pinned against the worker's own exported
constant). So a run queued offline for longer than that is **DROPPED** rather than risked. The board
is therefore lossless in arithmetic and **not** guaranteed lossless in delivery — one dropped run
skews an average by a fraction, where one double-counted run skews it forever.

⚠ **12 h is MINE, not the owner's**, and the reason first written for it was wrong: a constant clock
OFFSET cancels, because both sides measure the same elapsed duration. What the margin actually buys
is room for a clock JUMP, the request's flight time, and the server's prune firing on another
client's POST. ⭐ **A better fix exists and is cheap: raise `SEEN_RUN_TTL_MS`** — the inequality test
then lets the client window grow and nothing is ever dropped. It was not taken because the S183
brief scoped the client side only.

### ⚠ R182-H — adaptive difficulty is RULED and DEFERRED, and it COLLIDES with R182-G

The difficulty dial exists (`generateSudoku`'s second argument) and **nothing passes it**. Keep it
that way: do not delete it as dead code, and do not wire it. The intended design is that a player
whose average beats a threshold is promoted to harder grids.

⛔ **IT IS BLOCKED ON PERSISTENT IDENTITY, AND THAT IS THE SAME DEPENDENCY AS THE STEAM LOGIN.**
Tiers need to know who a player is across sessions; R182-G deliberately accepted name collisions.
Both unblock at the same moment — they are ONE dependency, not two.

⛔ **AND THE COLLISION, WHICH MUST BE SOLVED BEFORE H IS BUILT:** an average board is only fair
while every player draws from the SAME distribution. If strong players start drawing harder grids
they post slower times and drift DOWN a table comparing raw averages — **improving would make you
rank worse.** Whoever builds H has to normalise for difficulty or the board stops meaning anything.

## 9b · ⭐⭐ RETALIATION — A UNIT THAT IS ATTACKED TURNS ON ITS ATTACKER (S183/S184)

> *"When a unit is attacked — let's say it's targeting a building, and then it is attacked, and it
> switches target to the targeted attack system. It makes sense. Most units, that is, unless it's
> like a pencil chewer, which only attacks buildings."* — owner, S183

`creatures/retaliation.ts`, called from `damageEntity` and nowhere else, so no strike path can
implement it differently or forget it. **No new field and no protocol bump**: it writes the
existing `Creature.targetCreatureId` / `Defender.targetCreatureId`, which is why `PROTOCOL_VERSION`
needed no bump of its own. ⚠ S186 — this sentence used to read *"which is why `PROTOCOL_VERSION`
stays 47"*, and S186 moved the version for an unrelated reason (see §6). The claim that matters is
unchanged and is now stated as itself: **retaliation added NO serialized field and NO new
discriminant**, so it never owed a bump. Pinning it to a version literal made a static fact look
like it had changed.

| ruling | what the code does |
|---|---|
| **R183-A — IT DOES NOT GO BACK.** *"It won't go back to what it was attacking before. It goes back to the next target."* | Nothing is stored and nothing is restored. When the attacker dies `pickNavUnit`'s hold branch fails and the unit re-acquires normally — R183-A for free, with no memory. |
| **R183-B — THE PENCIL CHEWER NEVER RETALIATES.** | `NEVER_RETALIATES` is a **one-member set of NAMES** — `chewer` — not a predicate over `targetsStructures`. |
| **R183-C — HELGA RETALIATES, INSIDE HER CONSTRAINT.** | Only while she is in **WALK**, only at a creature, and only at an aggressor inside her **hub** leash. |
| **R183-D — THE SUICIDE BOMBER DOES RETALIATE.** *"It's like one or two shots … but whatever, yeah, he retaliates."* | It detonates on its attacker, through Step 1.5's `atUnit` arm. |

⛔ **THE RULE IS NOT "BUILDINGS-ONLY ATTACKERS DO NOT RETALIATE."** That generalisation was put to
him and he OVERRULED it: `goblinSuicide` is also buildings-first and retaliates anyway. The pencil
chewer is a NAMED EXCEPTION, not an instance of a category — a predicate would silently recruit the
next buildings-first unit into an exception he refused to grant.

⚠ **ONE UNIT IS EXCLUDED THAT HE DID NOT NAME, AND IT IS A CAPABILITY STATEMENT:** the **lightning
drone** (`selfExplode && !targetsStructures`). A drone holding a creature target enters ATTACKING,
where the fan-out skips both bond re-selection and the Step 1.5 detonation — it would stop homing
and stop being able to explode, against its own config's *"the drone explodes, it never ATTACKS"*.

⭐ **AN AGGRESSOR IS A STRIKE COMMITMENT, NEVER A NAVIGATION LOCK.** `targetCreatureId` is two
things wearing one name: the strike arm's dispatch field AND the structure-attacker's nav lock,
written for anything in SEEKING inside 220 px. So the answer requires all three of ATTACKING, the
field, and the attacker's own `attackRange` — and it is resolved **nearest, then lower id**, because
retaliation drives NAVIGATION and walking to the lowest-id attacker when a nearer one is at your
feet would look broken.

### ⭐⭐ R184-A — HE RULED IT, HAVING SEEN THE NUMBERS: SHIP IT AS IS

**A melee unit that turns on a ranged attacker it can never catch stops hitting anything at all.**
Measured through the real host tick over 600 ticks — one vampire boss, a decoy at its feet, and a
three-arm control:

| arm | damage the boss DEALT | max `ticksInState` |
|---|---:|---:|
| no archer | 980 | 59 — fires freely |
| archer present, retaliation DISABLED | 980 | 59 |
| archer present, retaliation LIVE | **230** | **29** — never reaches its fire tick of 30 |

The middle arm is what makes it attributable: with retaliation off, the archer changes **nothing**.
`goblinArcher` has `holdsRange: true`, so *"walk to your attacker"* never terminates — the boss
deals 76 % less, never lands a blow on the archer it turned to face, and drifts ~500 px away.

⚠ **THIS IS NOT A CODING ERROR. It is R183-A doing exactly what it says.** The consequence is that
one archer can neutralise any melee unit indefinitely.

⭐ **R184-A — PUT TO HIM WITH THE THREE-ARM TABLE ABOVE, AND HE CHOSE TO SHIP IT AS RULED.** He was
offered the two narrowings (retaliate only against an attacker inside your own arm; or chase only a
non-`holdsRange` attacker) and took neither. So this is **current, intended behaviour** — not a known
bug and not a carry-forward.

⛔ **DO NOT "FIX" IT.** A session that rediscovers the 980 → 230 collapse is rediscovering a ruling,
not a defect. `retaliation.test.ts` pins the measurement as a MEASURED FACT so it cannot drift
silently, and `canon.test.ts` holds this paragraph — if the behaviour is ever changed, it is changed
because he asked for it, and both land in the same commit.

---

## 9c · ⛔⛔ TWO S184 "LOW FINDINGS" THAT HE RULED ARE NOT DEFECTS (S185)

Both were audit findings carried into S185 as candidate work. He was walked through them and
**overruled both**. They are recorded here so no future audit re-reports them as bugs — which is
exactly what this document exists to stop.

⭐ **R185-C — CLICKING AN ENEMY BUILDING THROUGH FOG IS INTENDED. IT IS A SKILL EXPRESSION.**
`rampAnchorAtPoint` (`structureRamp.ts`) applies a pure geometry test and never consults
`isConcealed`; the whole input layer is fog-blind (`grep -rn "isConcealed" src/input/` returns
nothing). The card it opens carries a **live** health value under a "LAST SEEN" label. Reported as
an information leak. It is not:

> *"You should be able to click enemy buildings through fog, because your spark itself, the cruiser,
> highlights everything around it. So you should be able to go and research what your enemy is
> building. It's just taking time off of what you're doing and actually going to do that. So it
> makes sense. It's like a thing that more knowledgeable players would be doing."* — owner, S185

⛔ **DO NOT GATE IT ON `isConcealed`.** Scouting costs tempo; that is the design, and the live
health value is part of the reward. This overrules the S184 LOW finding and my own recommendation.

⭐ **R185-D — THE CONNECTOR DAMAGE NUMBERS ARE GOOD AS THEY ARE.** A floater for a hidden connector
is anchored at the raw bond midpoint (`damageNumbers.ts`), which on a star's upper arms rises clear
of the building art. Reported as "damage numbers print over blank ground". He likes it:

> *"Damage numbers float over nothing — I don't think that's correct. The damage numbers actually
> finally look good. They, like, go over each other, and it looks like… it just looks epic."*

⛔ **DO NOT SUPPRESS AND DO NOT RE-ANCHOR.** ⚠ Note this also settles the conflict the finding
raised between his S175 *"you gotta see damage everywhere"* and R183-E *"you don't have to see the
connectors"* — S175 wins for the floating number, R183-E still governs the connector's own alpha.

## 9d · ⭐⭐ FOUR THINGS THAT KEPT COMING BACK, CLOSED FOR GOOD (S187) — and a fifth (S193)


> *"Resolve all of this now. Do what needs to be done. Don't bring this up again."* — owner, S187


⛔ **EVERY ITEM BELOW WAS RAISED WITH HIM IN MORE THAN ONE SESSION AFTER HE HAD ALREADY ANSWERED IT.**

That is the exact failure §0 of this document exists to prevent, committed against the very list of

open questions meant to prevent it. **Do not re-open any of these. Do not put them in a handoff's

"needs the owner" list.**


### 1 · THE EMPTY QUARRY — CLOSED. It is NOT a defect he wants fixed.


> *"No, no, no. For the empty quarry, that's NOT the waiting in line that I saw. The waiting in line

> is because at level 10 or 12 you each have twelve gatherers on full speed and they gather the shapes

> way faster than they can be taken. That's why I said we should scale it up."* — owner, S187


The measurement in §3c is real and stays recorded. **His complaint was the FAUCET RATE, which S186

already fixed with the band step-up.** He examined the empty-quarry finding and said it is not his

problem. That is an answer, not a deferral. ⛔ Do not ask again whether to stop the FIGHT-phase reap.


### 2 · THE LIGHTNING HUB SELF-DESTRUCT — CLOSED at **120 fifths**, in total. ✅ **BUILT S191** (`s191/carry` C-5).

> *"The lightning hub self-destruct will have to rework then. It can't destroy everything around it,
> but there should be a certain damage output."* — owner, S187

> *"hub blast hit 120 divided by everything that's around it. So 120 damage points in total."*
> — owner, S191

That is the second half of R182-C and it completes it. He ruled the AMOUNT in S182 —
*"four times a drone's damage"* — and the only reason it sat open is that the blast turned out to be
an instant-kill raze rather than a number, which he had not known. **He killed the raze, so his
number stands, and it is now the code — as ONE total that everything around the hub shares:**

```
STRUCTURE_SELFDESTRUCT_FIFTHS = 4 × attackFifths(DRONE_ATK 5, DRONE_PEN 1) = 4 × 30 = 120 fifths
```

⭐ **BUILT, AND `canon.test.ts` PINS BOTH THE NUMBER AND THE ARM.** The hub dispatches
`STRUCTURE_SELFDESTRUCT` with `blast: 'ladder'`, and `planHubBlast` / `applyHubLadderBlast`
(`potatoLifecycle.ts`) — which never call `applyRadialClear` — split **120 across every ENEMY entity
inside `STRUCTURE_SELFDESTRUCT_RADIUS` (240 px)**, through the ordinary funnels and on the one ladder:
creatures, Helga, lone built shapes, landed stink bags, and every enemy connector whose midpoint is
inside — **each connector is one entity** (`damageConnector`, no creature attacker → no lifesteal;
severed with the EXISTING cause `'drone'`, so no new discriminant). ⭐ **S193 (owner R193-B4) — BY
DISTANCE:** each target takes `floor(120 × w / Σw)` with `w = max(1, floor(240 − d))` (the shared falloff,
§9d item 5), and the leftover fifths go one apiece nearest-first, so the shares always sum to exactly
120. (Until S193: an equal split, 120 over n.) The hub's creature:connector weight is 1:1 — ⚠ MINE
(`HUB_BLAST_CREATURE_WEIGHT`); he ruled 2:1 only for the zombie boss. A
shape INSIDE a structure has no arm — a building dies through its connectors (§4). ⚠ **The S157 P0
owner-exemption is UNTOUCHED** — the blast still spares the hub owner's own shapes, units, bags and
Helga, and a connector with either end his. *"He will also bring down some of his own connectors"*
from S182 is NOT current behaviour and must not be reintroduced on the strength of this ruling. ⛔ **The
castle is not an arm**: on both shipped boards no enemy keep can stand within 240 px of a hub built on
its owner's ground (`hubSelfDestructLadder.test.ts` measures it over every buildable point); a board
that changes that needs his ruling first.

⚠ Even alone in the radius, 120 will not kill a tier-9 boss (pools 260–462), nor Helga (**156**),
where the raze deleted them where they stood — and with company each takes less. That is the
consequence of his own ruling, stated so nobody reads it later as a regression. ⚠ **MINE, flagged at
the constant:** who gets the remainder — the order is nearest first (squared distance), then kind
(creature · Helga · shape · bag · connector), then id; past 120 targets the nearest 120 take one fifth
each and the rest nothing (a fifth is the smallest unit the ladder has). And it is the UNBUFFED drone:
a seat that drafted ATK/PEN still blasts 120.
⭐ **HIS RULING (S191, BLAST-1):** a bag the blast pops still BURSTS, and that burst spares the HUB
OWNER as well as the bag's owner (`damageStinkCloud`) — *"Stink bags should not be able to hit your own units or your own … buildings, no matter what, they're resistant"* — owner, S191. Without it S157 P0's exemption leaked 90 px past the blast
through an enemy bag. A bag popped by anything else keeps the S158 A2 rule (spares its owner).

⛔ **THE ZOMBIE BOSS'S R138 DEATH BLAST IS NOT THIS RULING.** It borrowed the same action in S168
(380 px, no owner, *"hurting everything"*). ⭐ **S192 (owner T3): it no longer razes and no longer
uses this action** — `applyZombieDeathBlast` (`racial/zombieDeathBlast.ts`) splits ONE pool by distance.
⭐⭐ **S193 — HIS RULINGS R193-B1..B3:**
> *"312 blast pool, but split over, you know, everyone who's around."* · *"creatures get twice as much
> damage as towers do from that blast."* · *"It does not hit his own side"* — owner, S193

- the pool is **312** (`T9_ZOMBIE_DEATH_BLAST_POOL_FIFTHS` = 3 × `attackFifths(8, 8)`) — HIS now;
- each target weighs `kind × max(1, floor(380 − d))`: **kind 2** for a creature or Helga, **1** for a
  structure (still ONE target, its share on its nearest connector), a lone shape or a bag
  (`T9_ZOMBIE_DEATH_BLAST_CREATURE_WEIGHT`); shares `floor(312 × w / Σw)`, the leftover nearest-first,
  summing to exactly 312. Worked: a goblin and a one-connector tower both 100 px out take **208 / 104**;
- **it does NOT hit his own side** (`T9_ZOMBIE_DEATH_BLAST_HITS_OWN_SIDE` = false) — his units, Helga,
  structures, lone shapes and bags are spared, and a bag it pops bursts without hitting his side either.
  This SUPERSEDES R138's *"hurting everything"* for this blast;
- the radius stays 380 px (⚠ MINE since S168, not re-ruled); the overkill carries (`severWithCarry`).

The `blast: 'raze'` variant has no production dispatcher now. `blast` stays REQUIRED, so no dispatcher
can fall into either blast by omission.

### 3 · THE HEALTH BAR — CLOSED, AND HE WIDENED IT (S187). Three rules, not one.

> *"The bar needs to follow the art or the art needs to follow the bar — it has to be consistent.
> And we can't have too much of big bars. When you connect a bunch of structures you can have really
> big buildings with a lot of health; it doesn't mean the bar needs to be the whole screen. There
> should be a maximum size of a bar and a minimum size of a bar, and it should be proportional. If a
> building has 20 HP or if it has 20,000 HP it should be bigger obviously if it has 20,000, but only
> proportionally — it gets a millimetre bigger every thousand HP or something. We have to see what's
> the maximum and what's the minimum, and just put it on a scale. And the damage of the structure
> needs to follow the health of the bar. And same as the character sheet — the health bar on the
> tower sheet when you click on it has to follow the actual health of the tower."* — owner, S187

**RULE 1 — ONE NUMBER, THREE SURFACES.** The board bar, the damage art (cracks / frame) and the
CHARACTER SHEET bar all read the SAME pool. Today the board bar uses the whole component
(`structureDefenceFifths`) while the damage art uses the tower's own star
(`structurePoolFifths(bonds.size)`), so a welded hub reads 48 % green on the bar and 32 % cracked in
the art. He ruled the STAR counts in S182, so **the bar and the sheet both move onto the star.**

**RULE 2 — ⭐ NEW: THE BAR'S WIDTH IS BOUNDED AND PROPORTIONAL.** Welding structures together makes
arbitrarily large pools, and a bar that scales 1:1 with the pool would run off the screen. So the
bar has a **minimum width**, a **maximum width**, and scales between them with the pool — his
*"a millimetre bigger every thousand HP"*. ⚠ **THE TWO BOUNDS ARE NOT RULED** — he said *"we have
to see what's the maximum and what's the minimum"*. They must be MEASURED off the real roster (the
smallest lone shape at 5 fifths against the largest realistic welded component — ⚠ measured S191: a lone shape
has no structure bar, so the floor is ONE connector, 6 fifths) and flagged as MINE
at the constant, not invented.

**RULE 3 — the damage art follows that same health**, so the frame a player sees and the bar they
read can never tell different stories.


He already ruled the principle in S182: **the STAR is what counts.** S182 did not apply it to the bar

only because it changes the bar for every structure in the game, which that branch judged too big a

change to take unasked.

⭐ **BUILT S191 (`s191/carry` C-7).** `render/structureBarHealth.ts` is the one reading: a live tower's OWN members
(`towerMembersAt`, the walk the fuse and the ramp share), priced ONCE by `towerUnit.towerOwnPoolAt` (S193 SEAM-C7): **the
recipe pool, 0 once an own connector is gone** (the crumble rule — the bar, the card and the art agree in the
poll window too), minus the damage on THOSE connectors. The board bar (one bar per live tower; a freeform lattice keeps its component), the
character sheet (health and the CONNECTORS row) and the hub's ramp art now read it — the welded hub of R182-F reads
**32 %** on all three. `structureRamp.test.ts`'s divergence case is an AGREEMENT case now. The width
(`structureBarWidth`) is linear between bounds MEASURED off the roster and ⚠ MINE at the constants: pool **6**
(one connector — a lone shape has no structure bar) → **9 px** (the creature floor), pool **126** (the tier-9 ring,
the largest tower on the roster) → **150 px** (the widest building art); a bigger welded lattice pins at 150.
⚠ Consequences, stated: a tower welded into a lattice can read EMPTY before any connector snaps (the sever is still
priced on the component), the welds' extra pool shows on no bar, and the race towers' crack FRAMES still read their
shapes' HP (`towerHpFrac`), a separate damage channel — not changed, an owner question.


### 4 · `SEVER_BOND` — CLOSED, and written down here so it is never "owed" again.


A **bond** is the wire between two shapes. It is not drawn as an object you can click: what you see is

two shapes with a line between them, and the "field" is the invisible band along that line. Severing

is what CUTS that wire, and there is exactly one action for it — `SEVER_BOND`. ⭐ **S191: this table is
built from the tree, and `canon.test.ts` pins it MECHANICALLY** — it enumerates every production
`{ type: 'SEVER_BOND', bondId … }` and fails until the table names the file. (It said "six ways" until
S191, three of its causes were wrong, the charge-paid player cut had had no producer since R78 made a
right-click a raid, and the drone, the raid, POWER OF RA and the hub were missing.)

| who severs | cause | file |
|---|---|---|
| a unit cutting a connector — goblins, race and tier-3 units, bosses | `'unit'` | `creatures/creatureAttack.ts` |
| a pencil chewer's final bite | `'chewer'` | `creatures/creatureAttack.ts` |
| a Voltkin's strike | `'creature'` | `creatures/creatureAttack.ts` |
| a Voltkin's lightning chain | `'creature'` | `creatures/voltkinChain.ts` |
| a suicide goblin's blast | `'unit'` | `creatures/suicideBlast.ts` |
| a lightning drone's detonation | `'drone'` | `droneLifecycle.ts` |
| ⭐ the lightning hub's self-destruct (S191) | `'drone'` | `potatoLifecycle.ts` |
| a player's RAID (right-click) reaching the connector's pool | `'raid'` | `world.ts` |
| a POWER OF RA / WRATH OF RA column | `'raid'` | `racial/raColumn.ts` |
| ⭐ the Pharaoh boss's Ra column (S192 — the perk's column, sparing nobody) | `'unit'` | `racial/raColumn.ts` |
| ⭐ SCORCHED EARTH burning through a structure's pool (S191) | `'raid'` | `racial/scorchedGround.ts` |
| ⭐ the zombie boss's death blast reaching a structure's pool (S192 T3) | `'unit'` | `racial/zombieDeathBlast.ts` |
| the physics solver, when a wire is stretched past breaking | `'physics'` | `physics/physicsLoop.ts` |
| a bomb — **ARCHIVED** (§1; unreachable in a shipped build) | `'bomb'` | `bombLifecycle.ts` |


⛔ **THE PART THAT MATTERS AND KEEPS BEING MISSED:** a tower has no health of its own. It dies when its

RECIPE BREAKS, and the recipe breaks when enough wires are cut. So "attacking a building" IS severing

its bonds — §4's *"connectors: yes, this is how buildings die"*. The wire is invisible, the damage

lands on it, and the tower falls when the shape no longer forms its recipe.


⚠ And a new `cause` value costs a PROTOCOL BUMP — never additive-optional. A stale peer that receives

an unknown cause falls through `severToastRenderer`'s switch and goes silent, which S182 shipped.


---


### 5 · ⭐⭐ CLOSER = MORE DAMAGE — FOR EVERY BLAST (owner R193-B4, S193)

> *"whoever is closer to him, to the actual blast, gets damaged more … And that's obviously for every
> blast … the poop bag or the stink tower blast. Similarly, right?"* — owner, S193

ONE falloff, `state/blastFalloff.ts`, and every production blast reads it (`blastFalloff.census.test.ts`
fails on a blast producer that does not):

| blast | kind | rule |
|---|---|---|
| zombie boss death blast (`racial/zombieDeathBlast.ts`) | split pool 312 | weight `kind × max(1, floor(R − d))`, kind 2 : 1 (ruled) |
| lightning hub self-destruct (`potatoLifecycle.ts`) | split pool 120 | weight `max(1, floor(R − d))`, kind 1 : 1 (⚠ MINE) |
| suicide goblin (`creatures/suicideBlast.ts`) — units, shapes AND connectors | full hit | `blastHitAtDistance` |
| lightning drone (`droneLifecycle.ts`) — units and shapes | full hit | `blastHitAtDistance` |
| stink bag throw + landed bag's burst (`defenders/stinkTower.ts`, `damage.ts`) | full hit | `blastHitAtDistance` |
| stink tower death blast (`defenders/stinkTower.ts`) | full hit | `blastHitAtDistance` |

A **full-hit** blast deals its full ladder number at the centre and falls linearly to
`BLAST_EDGE_FLOOR_PERCENT` = **50 %** of it at the rim (⚠ MINE — the curve and the 50 are mine; he ruled
only the direction), floored, never below 1 on a real hit. Worked: the suicide goblin's 20 is 17 at 20 px
and 11 at 60 px of its 70. A **split-pool** blast weights its split instead. Not blasts, so flat: the
stink tower's aura and a landed bag's lingering cloud (1 fifth a second — damage over time), SCORCHED
ground, the Ra column (his S191 equal split — ⚠ whether R193-B4 covers it is an open question). The drone's
connector severs stay his COUNT ruling (*"3 connectors per lightning"*), unconditional.


## 10 · ⛔ OPEN — needs the owner, do not guess

⛔⛔ **R182-C AND R182-F ARE NO LONGER OPEN. THEY MOVED TO §9d IN S187 AND MUST NOT COME BACK
HERE.** Their entries below are kept ONLY as the reasoning that produced the answers — the
questions themselves are ANSWERED. Re-listing either one as "needs the owner" is the exact
failure he named: *"I don't understand why you're bringing this up every session."*


*(Both of S180's castle questions were answered — see §3.)*

### ✅ R182-C — the lightning hub's self-destruct DAMAGE. **ANSWERED S187 → §9d. 120 fifths. BUILT S191.**

He ruled *"four times a drone's damage"* = 4 × `attackFifths(DRONE_ATK 5, DRONE_PEN 1)` = **120
fifths** — **believing the blast had no number. It had something else entirely:**
`applyStructureSelfDestruct` called `applyRadialClear` and **deleted** every enemy creature and shape
inside `STRUCTURE_SELFDESTRUCT_RADIUS` (240 px) outright — an instant-kill radius, not a number on the
ladder. The two questions this entry used to carry are both answered: (1) the raze is gone (S187,
*"it can't destroy everything around it"*), and (2) the blast does NOT damage the hub owner's own
connectors — S157 P0 stands.

⭐ **S191 built it** (`s191/carry` C-5): see §9d item 2 for the arms and the stated consequences.
`canon.test.ts` now asserts the BUILT rule — the ladder arm never reaches the raze and deals
`STRUCTURE_SELFDESTRUCT_FIFTHS` (120) — where it used to assert that the code was still the radial clear.

### ✅ R182-F — the health bar vs the damage art. **ANSWERED S187 → §9d. The bar follows the star.**

**Measured, not suspected.** They share the threshold (`TOWER_DAMAGED_BELOW` 0.5) but not the
denominator, and the denominator is what decides:

| | reads | on a hub with one friendly shape welded to a leaf, banked 34 |
|---|---|---|
| health bar | `structureDefenceFifths(n)` over the whole **component** (`healthBar.ts:421`) | 34/66 → **48 % left** — green-amber, "it's fine" |
| damage art | `structurePoolFifths(hub.bonds.size)` over its **own star** (R182-B) | 34/50 → **32 % left** — frame 17, and it detonates |

For a **standalone** hub the two are the same five connectors and they agree exactly. The split only
opens when something is welded on — which is the case R182-B was written for.

⭐ **The owner ruled the STAR is what counts, so the BAR is the thing that should follow.** That was
not done in S182 because it changes the bar for **every** structure in the game, not just the hub,
and that is a bigger ruling than this branch was given. ⭐ **BUILT S191 (C-7, §9d item 3):** the bar follows the
star and `structureRamp.test.ts` now asserts the AGREEMENT.

⚠ **The S182 brief asserted these would "agree for free". That was wrong, and the wrong claim was in
the tree as a test comment until this entry replaced it.**

### ⚠ WHAT `--dark-bg` STOPS GUARDING on `public/art/lightning-hub`

`check:atlas` runs five checks. The new sheet is matted off a near-BLACK background, so
`scripts/check-atlas-scenery.mjs` is invoked with `--no-size --dark-bg` and **two of the five no
longer run for that directory**:

| check | status for `lightning-hub` | why |
|---|---|---|
| 1 · mid-grey scenery blocks | **ON** — scores 0 px | still meaningful |
| 2 · cross-row seed-size drift | **OFF** (`--no-size`) | rows are conditions, not seeded states — the pre-existing structures exemption |
| 3 · opaque near-white pockets | **OFF** (`--dark-bg`) | on a black-keyed matte a surviving background pixel is near-BLACK; the 4,407 near-white px on this sheet are the lightning's white-hot cores |
| 4 · surviving letterbox bars | **ON** — scores 0 px | still meaningful |
| 5 · near-white edge fringe | **OFF** (`--dark-bg`) | same reason; measured 26 of 66,786 edge px (0.04 %), all bolt tips |

⛔ **So a WHITE-ish defect on a dark-background sheet would not be caught.** The two checks that
*could* catch this sheet's real failure modes — grey scenery welded in, and a surviving background
bar — both still run and both score a clean zero. If a future dark sheet needs a
near-black-pocket check, that is a NEW check, not a threshold tweak to these two.

## 11 · HOW TO KEEP THIS HONEST

- Add a number here only with the constant it comes from, and add its assertion to `src/canon.test.ts`
  in the same commit.
- When the owner rules something, it lands **here**, not only in a handoff. A handoff is read once;
  this is read every time.
- If this file and the code disagree, **the code wins and this file is the bug** — go fix it, and say
  so, the way `UNIT_STAT_TABLE.md` should have been fixed three sessions ago.
