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

`PROTOCOL_VERSION` is **47**. A mismatched peer is **refused outright** — there is no degraded-play
path. An **additive-optional** field costs no bump; a **required** new field, or a new discriminant
value on an existing action, does.

⚠ **PROTOCOL 47 CARRIES TWO CHANGES FROM TWO PARALLEL BRANCHES.** Both are recorded below.

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
`hp`, and `castleHp`. Each is emitted **only when damaged**; absent means full, and both peers
recompute it identically from the type. **A live enemy health readout therefore costs nothing.**

---

## 7 · ⛔ OPEN — needs the owner, do not guess

*(Both of S180's castle questions were answered — see §3. Nothing is currently open here. When
something is, it goes here AND gets an assertion in `src/canon.test.ts`, so a later session cannot
quietly tidy it away without a ruling.)*

## 8 · HOW TO KEEP THIS HONEST

- Add a number here only with the constant it comes from, and add its assertion to `src/canon.test.ts`
  in the same commit.
- When the owner rules something, it lands **here**, not only in a handoff. A handoff is read once;
  this is read every time.
- If this file and the code disagree, **the code wins and this file is the bug** — go fix it, and say
  so, the way `UNIT_STAT_TABLE.md` should have been fixed three sessions ago.
