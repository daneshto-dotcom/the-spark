**STATUS: SPEC — written FIRST (S192, `s192/magic`, from master 663c4c9). The rule is the owner's (R192-M1..M7,
`S192_OWNER_RULINGS_teams_magic.md`). Every number marked ⚠ MINE is a proposal until he rules.**

# S192 — MAGIC RESISTANCE (MRES): ONE MORE STAT ON THE ONE LADDER

> *"magic resistance, which is basically on the same ladder as defense levels. One magic resistant level is 1.2, two …
> 1.4, these 1.6, etc."* · *"it will look the same, but it'll be calculated differently."* · *"nothing makes magic
> stronger, it's just different."* · *"every unit and every tower … towers will inherently have the same magic
> resistance as their regular defense."* — owner, S192 (R192-M1, M4, M5)

---

## (a) THE ARITHMETIC

### The problem the rule has to solve

On this ladder DEF is **not subtracted from a hit**. It is folded into the POOL:

```
pool   = HP  × (1 + 0.2 × DEF) × 5 = HP × (5 + DEF)    fifths    unitPoolFifths(hp, def)
damage = ATK × (1 + 0.2 × PEN) × 5 = ATK × (5 + PEN)   fifths    attackFifths(atk, pen)
```

A unit has ONE bar (`Creature.ehp`), sized by DEF. So "MRES defends against magic the way DEF defends against
physical" cannot mean "subtract MRES". It means: **against a magic hit, the unit's bar behaves as if it were
`HP × (5 + MRES)` long instead of `HP × (5 + DEF)`.** One bar, two lengths, depending on who is hitting it.

### The rule — ONE LINE

> **A magic hit of `A` fifths lands on the one bar as `floor(A × (5 + DEF) / (5 + MRES))`, never below 1 on a
> real hit. A physical hit lands as `A`, exactly as today.**

Why that is exact and not an approximation: a magic hit of `A` uses up `A / (HP × (5 + MRES))` of the unit's life
against magic. On the physical bar that same fraction is `A × HP × (5 + DEF) / (HP × (5 + MRES))` — the HP cancels,
leaving `A × (5 + DEF) / (5 + MRES)`. The floor and the floor-at-one are the owner's standing integer rule (the
castle's bought DEF already does exactly this: `floor(A × 5 / (5 + def))`, min 1).

### ⭐ MRES = DEF REPRODUCES TODAY EXACTLY — the proof

If `MRES = DEF` the factor is `(5 + DEF) / (5 + DEF)`: the product `A × (5 + DEF)` is divisible by `(5 + DEF)`, so the
floor is exact and the hit is `A`, for every `A ≥ 1`. Worked:

| target | HP / DEF / MRES | hit A | `A × (5+DEF)` | `÷ (5+MRES)` | lands | today |
|---|---|---:|---:|---:|---:|---:|
| tier-9 boss, Ra column | 22 / 16 / 16 | 300 | 6300 | 21 | **300** | 300 |
| Voltkin bolt on a goblin | 1 / 2 / 2 | 33 | 231 | 7 | **33** | 33 |
| rot tick on a warband | 4 / 1 / 1 | 1 | 6 | 6 | **1** | 1 |
| stink-aura tick on a shield goblin | 2 / 3 / 3 | 1 | 8 | 8 | **1** | 1 |

So **every tower takes the same magic damage it takes physical damage today** (R192-M5: its MRES is its connector
count, the same as its DEF), and so does every shape, bag and Helga under the recommended table below.

### Every target family

| target | its DEF | its MRES | the magic hit | consequence |
|---|---|---|---|---|
| **creature** | its type's `def` (inside the pool) | `mresFor(type, ownerRace)` — table (b) | `floor(A·(5+DEF)/(5+MRES))`, min 1 | the only family where magic and physical differ |
| **connector / structure** | `n` (connector count) | **`n`** — R192-M5 | `floor(A·(5+n)/(5+n))` = **A** | identical to today; the pool `n × (5+n)` per connector is untouched |
| **castle** (off-ladder 2500 pool, DEF applied per hit) | bought `defLevel` | **`defLevel`** ⚠ MINE (Q2) | `floor(A·5/(5+mresLevel))`, min 1 — the castle's existing DEF formula with MRES in DEF's place | identical to today |
| **Helga** (12 HP / 8 DEF) | 8 | **8** ⚠ MINE (globals rule) | = **A** | identical |
| **shape** (14 HP / 0 DEF, a lone shape 1 / 0) | 0 | **0** | = **A** | identical |
| **stink bag** (1 HP / 0 DEF) | 0 | **0** | = **A** | identical |

### ⚠ THE ONE PLACE THE FLOOR WOULD BREAK THE RULE — the one-fifth DoT ticks

Four of the six magic sources are **one fifth at a time**: the zombie rot, SCORCHED GROUND, the stink aura (and the
landed-bag cloud). `floor(1 × (5+DEF)/(5+MRES))` with the floor-at-one is **1 whenever MRES ≥ DEF** — MRES would
defend against NONE of them. That would make the stat meaningless against two-thirds of the magic in the game.

So a DoT tick is rescaled across its own beats instead (a stateless Bresenham — no accumulator, no new field):

```
tick lands as  floor((b + 1) × (5+DEF) / (5+MRES))  −  floor(b × (5+DEF) / (5+MRES))
```

where `b` is that victim's own beat number (the DoT's due-count, plus the victim id for phase spread). Over any run
of beats it lands **exactly** `(5+DEF)/(5+MRES)` fifths per beat on average, deterministically, from `world.tick` and
the id alone. At MRES = DEF it is exactly 1 on every beat — today, byte for byte. ⚠ MINE: at MRES > DEF some beats
land **0** (the burn is slower, never stopped); that is the honest expression of the ladder, and it is the one place a
real magic tick can be zero. Burn-down times on the recommended table: a zombie soldier burns in **41.7 s** (today
50), a demon soldier in **75 s**, an Archdemon in **73 s**, Vlad in **65 s**.

---

## (b) THE MRES TABLE — every creature type in `CREATURE_CONFIGS` (26), all ⚠ MINE

Built from his ordering (R192-M6) — **demons ≈ mummies > vampires > nagas > orcs > zombies** — as ONE race level
`L`, then by class (tier) within the race:

| race | `L` | castle soldier (`raceUnit`, 1/1/1/1) | its tier-3 unit | its tier-9 boss (`6 + 2L`) |
|---|---:|---|---|---|
| demons | 4 | **4** (DEF 1) | souleater **4** (DEF 1) | Archdemon **14** (DEF 8) |
| mummies | 4 | **4** | scarab **4** (DEF 2) | Pharaoh **14** (DEF 16) |
| vampires | 3 | **3** | bat **3** (DEF 0) · bat swarm **3** | Vlad **12** (DEF 8) |
| nagas | 2 | **2** | piranha **2** (DEF 0) · elite piranha **2** | Kraken **10** (DEF 12) |
| orcs | 1 | **1** | warband **1** (DEF 1) | Warlord **8** (DEF 12) |
| zombies | 0 | **0** | hound **0** (DEF 0) | zombie boss **6** (DEF 10) |

⚠ `raceUnit` is ONE type for all six races; its MRES reads the owner's `player.raceId` (on the wire since protocol
39), so both peers derive it. ⚠ This departs from R94/R117 *"stat-identical forever"* for the castle soldier — his
later R192-M6 (*"every unit"*, by race) is what governs; flagged, one constant reverses it.

⚠ ELITE PIRANHA and BAT SWARM keep their BASE unit's MRES (2 and 3), they do not multiply it. "Every stat ×N" was
ruled before MRES existed; multiplied, the swarm would be 18 (a 230 s burn, a Ra column landing 1) — his call.

**The global units — the rule (Q-G):** *recommended: a global unit's MRES = its own DEF ("neutral")*. A goblin is the
same goblin for every seat, the shared roster's balance stays exactly as it is today, and race identity stays where he
put it: on the racial units. The alternative (the seat's race level) would hand a demons seat's goblins, chewers and
Voltkin free magic resistance.

| global unit | HP / DEF | MRES (= DEF) |
|---|---|---:|
| goblinMelee · Archer · Shield · Hound · Bat · Suicide | 1/2 · 1/1 · 2/3 · 1/0 · 2/0 · 2/0 | **2 · 1 · 3 · 0 · 0 · 0** |
| chewer | 1 / 0 | **0** |
| lightningDrone | 2 / 0 | **0** |
| voltkin | 8 / 3 | **3** |
| direwolf (the Warlord's summon — *"not orcs"*, canon §3e) | 3 / 3 | **3** |
| locustCloud (the Pharaoh's summon, untargetable) | 1 / 0 | **0** |
| Helga (a defender with a pool) | 12 / 8 | **8** |

Worked magic numbers on this table (lands / pool):

| victim | pool (phys) | pool vs magic | Pharaoh ritual column 300 | Voltkin bolt 33 | DoT time-to-kill (2 %/s) |
|---|---:|---:|---:|---:|---:|
| zombie soldier | 6 | 5 | 360 → dead | **39** | 41.7 s |
| demon soldier | 6 | 9 | 200 → dead | **22** | 75 s |
| Vlad | 260 | 340 | **229** (today 300 = dead) | 25 | 65 s |
| Archdemon | 260 | 380 | **205** (today dead) | 22 | 73 s |
| Kraken | 408 | 360 | **340** | 37 | 44 s |
| Pharaoh | 462 | 418 | **331** | 36 | 45 s |
| zombie boss | 360 | 264 | **409 → dead** (today survives) | 45 | 37 s |
| Warlord | 374 | 286 | **392 → dead** (today survives) | 43 | 38 s |

⚠ **What he should see before ruling:** with zombies and orcs at the bottom, the Pharaoh's own 300 ritual column now
kills the zombie boss and the Warlord and no longer kills Vlad or the Archdemon. The Ra PERK is unaffected in scale —
after `s191/tune` it is 35 split, so a share is a few fifths either way.

---

## (c) THE ATTACK-CLASS TABLE — enumerated mechanically

Every production call into the four funnels on master 663c4c9 (`grep -rnF "damageEntity(" / "damageConnector(" /
"applyRadialDamage(" / "radialDamage(" src --include=*.ts`, tests excluded). 15 + 5 + 9 = **29 sites**. The castle
takes damage at exactly one place, the castle arm inside `damageEntity`; nothing else writes `castleHp` downward.

| # | site | strike | class | why |
|---|---|---|---|---|
| 1 | `bossSkills.ts:215` | zombie boss ROT aura | **MAGIC (DoT)** | M2 |
| 2 | `racial/scorchedGround.ts:78` | SCORCHED GROUND | **MAGIC (DoT)** | M2 |
| 3 | `defenders/stinkTower.ts:315` | STINK TOWER aura | **MAGIC (DoT)** | M2 |
| 4 | `defenders/stinkCloud.ts:125` | the landed-bag cloud (same smell, same 1 fifth/s) | **MAGIC (DoT)** ⚠ MINE | the code calls it *"a landed bag is the same smell"*; Q-C |
| 5 | `racial/powerOfRa.ts:204` | POWER / WRATH OF RA column — area | **MAGIC** | M2 |
| 6 | `racial/powerOfRa.ts:175` | POWER / WRATH OF RA column — connector cut | **MAGIC** (identity on a structure, M5) | M2 |
| 7 | `bossSkillsPharaohRitual.ts:144` | the Pharaoh's own Ra ritual column | **MAGIC** | R190-E *"The Ra column is considered a MAGIC attack"*; M2 *"the rock column definitely magic"* |
| 8 | `creatures/voltkinChain.ts:241` | Voltkin chain — creature link | **MAGIC** | M2 |
| 9 | `creatures/voltkinChain.ts:249` | Voltkin chain — connector link | **MAGIC** (identity, M5) | M2 |
| 10–14 | `creatures/creatureAttack.ts:199/313/396/443/507` | a unit's swing: creature · Helga · shape · bag · keep | **PHYSICAL** — except the **Voltkin's own zap**, which is **MAGIC** ⚠ MINE | M3; the seed IS the bolt's first link (Q-V) |
| 15 | `creatures/creatureAttack.ts:544` | a unit's swing on a connector | **PHYSICAL**, Voltkin **MAGIC** ⚠ MINE | as above |
| 16 | `castleGuns.ts:137` | castle gun | PHYSICAL | M3 "shoots" |
| 17 | `defenders/defenderLifecycle.ts:482` | laser beam · HELGA's slap | PHYSICAL | M3 |
| 18–19 | `world.ts:749 / 775` | a player's RAID on a creature / Helga | PHYSICAL | M3 |
| 20 | `world.ts:817` | RAID on a connector | PHYSICAL | M3 |
| 21–22 | `creatures/suicideBlast.ts:106 / 154` | suicide goblin blast (area / connectors) | PHYSICAL | M3 "blows up" |
| 23 | `droneLifecycle.ts:201` | lightning drone explosion | PHYSICAL | M3 "blows up" (not on his magic list) |
| 24 | `defenders/stinkTower.ts:174` | stink tower death blast | PHYSICAL | M3 |
| 25 | `defenders/stinkTower.ts:249` | stink bag splash | PHYSICAL | M3 |
| 26 | `damage.ts:304` | a landed bag bursting | PHYSICAL | M3 |
| 27–29 | `damage.ts:733 / 748 / 751` | `applyRadialDamage`'s three arms | **forwarded** from its caller | one blast, one class |

**Not damage** (listed so nobody looks for a class on them): the Archdemon's *taken to hell* (an execute), the Kraken's
sonar (stun + shove), Vlad's sap (a heal), the lightning hub self-destruct on master (a RAZE).

**Sources landing on siblings, to re-tag at merge:** SCORCHED EARTH (`s191/owner`) → **MAGIC**; the Ra perk's 35-split
(`s191/tune`) → **MAGIC**; the hub's ladder blast (`s191/carry`) → PHYSICAL; the zombie death blast (`s192/zombies`) →
PHYSICAL. Because the tag is a REQUIRED argument, each sibling's new call fails `tsc` on the merge until it is tagged.

---

## (d) OPEN QUESTIONS — one recommendation each

| | question | recommendation |
|---|---|---|
| **Q1** | Does a drafted **DEF** pick also raise MRES? | **It already does, and keep it.** A DEF pick has never moved the DEF stat; it adds +10 % to the POOL (`draftedPoolFifths`), and the magic rescale divides that same longer bar — so an HP or DEF pick buys 10 % more life against BOTH classes. Making DEF physical-only would mean the draft starting to move the DEF stat itself: a bigger change, his call. |
| **Q2** | The castle's MRES (it BUYS DEF) | **= its bought DEF level** (the towers' rule, M5), no separate button yet. Identical to today. Only the Voltkin's zap (if Q-V is yes) can hit a keep with magic at all. |
| **Q3** | Does a drafted **ATK** pick buff magic? | **No — keep R190-E** (*"buffs physical melee/ranged hits only"*). ⚠ Consequence he must see: the Voltkin's strike is drafted today (S190); if its lightning is magic, R190-E takes the draft off it. **Not built on this branch** — it changes the draft; one line in `makeCreature` when he confirms. |
| **Q4** | A future MRES draft card? | **Yes, later** — the natural second half of "a whole different spectrum": a fifth general axis (or a racial), once he has played with MRES. Not now. |
| **Q-G** | Global units: seat's race, or own class? | **Own class: MRES = DEF** (table above). |
| **Q-V** | Is the Voltkin's single zap (the bolt's first hit) magic too, or only the hops? | **Magic** — it is the same lightning; one bolt with a physical head and a magic tail would read wrong. One line (`strikeClassFor`) if he says hops only. |
| **Q-C** | The landed stink-bag cloud — aura (magic) or bag (physical)? | **Magic** — it is the aura's own smell, same number, same cadence. |
| **Q-D** | A one-fifth magic tick may land 0 on a high-MRES unit (a slower burn, never immunity) | **Accept** — otherwise MRES does nothing against four of six magic sources. |
| **Q-E** | Elite piranha / bat swarm: multiply MRES like "every stat"? | **No — base MRES** (2 / 3); multiplied, the swarm is near magic-immune. |

---

## (e) WIRE / HASH / BUMP

- **No new field.** MRES is a pure function of the creature TYPE and, for `raceUnit` only, the owner's `raceId` (already
  serialized and hashed). The attack class is code, never state. Nothing to serialize, nothing in `hashWorldState` /
  `hashWorldStateFull`, no four-sites tax.
- **The differential is the proof of no accidental change:** with every MRES forced equal to DEF, a long bots match
  through the real host tick must hash byte-identical to the all-physical run (master's arithmetic).
- **BUMP — yes.** The S186 test: a shared rule both peers compute. Damage is host-authoritative, but the `?worker=1`
  mirror and every successor host after a migration run this arithmetic; a pre-MRES successor would land magic hits at
  full strength and diverge. The table differs from DEF for most race units, so the result changes → **bump at merge**
  (52 → 53, or whatever the merge owner is at). This branch does not edit `PROTOCOL_VERSION`.

---

## Build (STEP 2) — the substrate

- `src/state/magicResist.ts` — `DamageClass = 'physical' | 'magic' | MagicDot`, `magicHitFifths`, `magicDotFifths`,
  `mresFor(type, race)`, `structureMres(n)`, `castleMresLevel(u)`, `RACE_MRES_LEVEL`, `CREATURE_MRES`
  (an exhaustive `Record<CreatureType, …>` so a new type cannot be added without an answer), `strikeClassFor(type)`.
- `damageEntity(…, attacker, cls)`, `damageConnector(…, attacker, cls)`, `applyRadialDamage(…, spare, cls)` and
  `RadialDamageFn` — **the class is a REQUIRED last argument**, so `tsc` enumerated every one of the 29 sites.
- Tests: arithmetic; a REACH test per magic source through `runHostTick`; the MRES = DEF differential over a bots match;
  negatives (physical untouched by MRES; MRES = DEF identity; connectors/castle/shapes identity); a mutation-tested
  census of the funnel call sites by class.
