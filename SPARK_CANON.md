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
Both peers run that function."* Identical mechanism. **See §6 — the version is 49.**

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

⚠ **AND ONE MORE THING WORTH CHECKING BEFORE ANYONE BUILDS ANY OF IT:** a LOOSE SHAPE has no edge
rule at all — it can already be hand-placed anywhere in that band today. Only a stamped TOWER is
refused. If what he was doing in the playtest was dropping shapes rather than stamping a tower, the
blocker was a footer plate and never this rule.

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

`PROTOCOL_VERSION` is **49**. A mismatched peer is **refused outright** — there is no degraded-play
path. An **additive-optional** field costs no bump; a **required** new field, or a new discriminant
value on an existing action, does.

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

⛔ **THE BLAST ITSELF IS UNCHANGED AND IS AN OPEN QUESTION.** `applyStructureSelfDestruct` still calls
`applyRadialClear` — it **deletes** every enemy creature and shape within `STRUCTURE_SELFDESTRUCT_RADIUS`
outright rather than dealing ladder damage, and (per S157 P0) it **spares the owner's own** shapes and
units. R182-C would replace the raze with 120 fifths, which would not kill a tier-9 boss where today's
blast deletes one. **Not built. See §10.**

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
calls in `main.ts`. ⚠ **No renderer runs under vitest**, so z-order is invisible to every behavioural
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
`structureRepair.ts` refuses any component member with `origin === null`, so **one** welded shape
makes a whole structure permanently unrepairable. Put to him as a defect; he reframed it as a
mechanic and kept it:

> *"So if you have a tower that's producing tier three monsters, let's say a bat tower, and you're
> welding it through many connectors to another bat tower — those two bat towers are a lot harder to
> destroy because now they're welded, so they have a lot higher HP. But they cannot be repaired
> either, because it's like a full shape now. So you can just keep adding connectors to it and make
> it higher HP. And then once the enemy does manage to destroy it, it destroys the connectors that
> he's attacking. So I guess that's just a way of looking at it. That makes sense."* — owner, S185

So welding buys pool and costs repair, on purpose. ⚠ **ONE THING REMAINS UNVERIFIED AND MUST NOT BE
TREATED AS SHIPPED:** R182-F measured that a welded hub reads **48%** on the health bar while its
art reads **32%**. His trade depends on a welded stack reading as *tougher*; if the bar lies about
it, the mechanic does not communicate itself. Verify the pool arithmetic before calling R185-B done.

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

## 10 · ⛔ OPEN — needs the owner, do not guess

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

### ⛔ R182-F — the HEALTH BAR and the DAMAGE ART disagree on a WELDED hub

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
and that is a bigger ruling than this branch was given. `structureRamp.test.ts` asserts the
divergence so it stays a measured fact rather than a sentence someone can delete.

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
