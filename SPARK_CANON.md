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
| Castle pool | **1500** (`CASTLE_MAX_HP`) |
| Damage an attacker deals to it | **its own `attackFifths(atk, pen)`** — the same ladder as everything else |

⭐ **BOTH OF THIS SECTION'S OPEN QUESTIONS WERE ANSWERED BY THE OWNER IN S180.**

**The pool is 1500, and 2500 is the WIN SCORE, not castle health.** *"I think the castle pool was
1,500 before. Oh yeah, yeah, yeah, it's 1,500. And the 2,500 is how many points someone needs to
win."* (`PHASE_1_WIN_SCORE`.)

**And the flat 6 is gone.** *"Why does every attacker hit the castle for a flat of six? That's not
correct. Every attacker hits anything based on its damage output, which we know the algorithm for.
Doesn't matter if it's a connector, a castle, or another enemy. That's what I need you to get. And to
actually wire."*

So a melee goblin deals **12** to a keep and Vlad deals **150**, off the one ladder.
`GOBLIN_DAMAGE_VS_CASTLE` is retired in place, unread — the last bespoke damage constant in the game.

⚠ **AND IT RETUNED THE SIEGE, MEASURED RATHER THAN ESTIMATED.** Through the real host tick
(`castleGuns.test.ts`), the number of melee goblins needed to fell a keep moved from about **fifteen
to between eight and ten**: 8 leaves it at 264, 10 takes it. One leaker still deals nothing — the
castle gun kills it before its first swing. Read that as one fixture's reading, not a law.

⛔ **THE CASTLE IS STILL THE ONE EXCEPTION ON THE OTHER SIDE OF THE LADDER:** its POOL is a flat 1500
rather than `hp × (1 + 0.2 × def) × 5`. Its DAMAGE TAKEN is now fully on the ladder; its pool is not,
and the owner has never asked for it to be.

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
