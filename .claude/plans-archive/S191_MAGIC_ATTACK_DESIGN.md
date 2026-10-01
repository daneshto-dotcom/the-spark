**STATUS: DESIGN ONLY — to be decided WITH the owner. Nothing here is built. R190-E holds until he rules.**

# S191 A-5 — A MAGIC DAMAGE CLASS, ON THE ONE LADDER

> *"The Ra column is considered a MAGIC attack."* · auras *"may be too"* · *"a whole different spectrum"*
> — owner, S190 (R190-E and the add-ons list in `S190_OWNER_RULINGS.md`).
>
> R190-E, as ruled: a drafted ATK pick buffs **physical melee/ranged hits only** — not boss skills, not Helga.

Every number below is read off a constant or derived with the ladder, never invented:

```
pool   = HP  × (1 + 0.2 × DEF) × 5 = HP × (5 + DEF)   fifths   unitPoolFifths
damage = ATK × (1 + 0.2 × PEN) × 5 = ATK × (5 + PEN)  fifths   attackFifths
```

---

## 1 · WHAT HITS THINGS TODAY — every strike that is not an ordinary unit swing

Line numbers are this branch (`s191/addons`, from master `42cc2ee`). "Drafted" = the seat's ATK/PEN picks
reach it (`draftedAttackFifths`, +10 % compounded per pick, baked into `Creature.atkFifths` at birth).

| # | strike | where | amount today | drafted ATK/PEN? | what defends against it |
|---|---|---|---|---|---|
| 1 | **Pharaoh's Ra columns** (his ritual) | `bossSkillsPharaohRitual.ts:144` → `applyRadialDamage` | `attackFifths(RA_COLUMN_ATK 15, RA_COLUMN_PEN 15)` = **300**, radius 70, ×5 columns; spares nobody | **no** | victim pool (DEF inside it); shapes: 70 |
| 2 | **POWER OF RA / WRATH OF RA** (mummies L0 / L10) | `racial/powerOfRa.ts:204` (area), `:175` (connector cut) | `RA_STRIKE_FIFTHS` = the same **300**; spares the caster; cuts connectors | **no** | victim pool; a connector's structure pool `n × (5 + n)` |
| 3 | **Zombie boss rot aura** | `bossSkills.ts:215` | 1 fifth per `dotIntervalTicks(type pool, ZOMBIE_AURA_PER_MILLE 25)` — **2.5 % of the victim TYPE's pool / s** | **no** | nothing — a % of the pool, so ~40 s to death whatever the stats |
| 4 | **SCORCHED GROUND** (demons L0) | `racial/scorchedGround.ts:78` | 1 fifth per `dotIntervalTicks(type pool, 20)` — **2 % / s** | **no** | nothing — ~50 s to death whatever the stats (canon §3e) |
| 5 | **Stink tower aura** | `defenders/stinkTower.ts:315` | `STINK_AURA_UNIT_FIFTHS` = **1** per cadence, area | **no** | victim pool |
| 6 | **Stink bag splash** / landed-bag burst / stink tower death blast | `stinkTower.ts:249`, `damage.ts:304`, `stinkTower.ts:174` | `attackFifths(STINK_BAG_ATK 1, PEN 1)` = **6**; death blast `attackFifths(STINK_DEATH_BLAST_ATK, PEN)` | **no** | victim pool; shapes |
| 7 | **Castle gun** | `castleGuns.ts:137` | `castleShotFifthsFor` = `attackFifths(CASTLE_ATK 5 + atkLevel, CASTLE_PEN 3 + penLevel)` = **40** unbought | **no** — the keep's own bought ATK/PEN | victim pool |
| 8 | **Laser turret beam · HELGA's slap** | `defenders/defenderLifecycle.ts:479` | `attackFifths(config.atk, config.pen)` | **no** (R190-E: Helga) | victim pool |
| 9 | **Suicide goblin blast** | `creatures/suicideBlast.ts:106` (area), `:154` (connectors) | `creatureAttackFifths(bomber)` — the unit's own strike | **yes** (S190) | victim pool; shapes |
| 10 | **Lightning drone explosion** | `droneLifecycle.ts:201` | `creatureAttackFifths(drone)` — `attackFifths(DRONE_ATK 5, PEN 1)` = **30** unbuffed | **yes** (S190) | victim pool; shapes |
| 11 | **Voltkin chain lightning** | `creatures/voltkinChain.ts:241` / `:249` | `chainJumpFifths(creatureAttackFifths(voltkin), jump)` | **yes** | victim pool; connectors |
| 12 | **Lightning hub self-destruct** | `potatoLifecycle.ts:374` (`applyStructureSelfDestruct`) | today a RAZE; **ruled 120 fifths** = 4 × the drone (canon §9d) — being built by `s191/carry` | n/a | — |
| 13 | **A player's RAID** (right-click) | `world.ts:722` (+ `:749` / `:775` / `:817`) | `attackFifths(RAID_ATK 2, RAID_PEN 0)` = **10**; a connector takes at most `RAID_CONNECTOR_MAX_FIFTHS` 3 | **no** | victim pool |
| 14 | **The keep, when hit** (by anything) | `damage.ts:197` → `castleUpgrades.ts:183` | — | — | **bought DEF as a PER-HIT reduction**: `floor(hit × 5 / (5 + defLevel))`, min 1 |

**Not damage, listed so nobody looks for them:** the Archdemon's *taken to hell* is an EXECUTE below 10 %
(a removal, `bossSkillsArchdemon.ts:48`); the Kraken's sonar is a stun + shove (`bossSkillsKraken.ts:211`);
Vlad's sap is a self-heal (`bossSkills.ts:87`). **Summons** — direwolves, the locust cloud, THE RISEN's
soldier, ENDLESS DYNASTY's Pharaoh, HELLSPAWN's chewers — are creatures: their hits are ordinary unit
strikes (`creatureAttack.ts`), drafted at birth like every unit's. The Corpse Eater's bite is his own
drafted strike. Potato, bombs, seagulls, rainbows: ARCHIVED (canon §1).

### Two things the inventory shows that matter for the design

1. **There are ALREADY two DEF models.** A unit's DEF sits inside its pool (`HP × (5 + DEF)`), so it never
   reduces a hit — it only makes the bar longer. The keep's bought DEF is the other shape: it divides each
   hit by `(5 + DEF) / 5`. They are the SAME ladder multiplier, applied at a different end.
2. **Today an HP pick and a DEF pick are the same pick, and so are ATK and PEN.** The draft adds +10 % of the
   whole POOL (hp/def) or the whole STRIKE (atk/pen) — it never moves the DEF or PEN stat itself
   (`draft.ts:152-158`). Any magic rule that treats DEF or PEN specially inherits that: until a DEF pick
   raises DEF, "magic ignores DEF" cannot tell an HP-drafted unit from a DEF-drafted one.

---

## 2 · THREE THINGS "MAGIC" COULD MEAN — all on the ONE ladder, none a bespoke number

### Option 1 — A LABEL, NOTHING ELSE (what the game does today, made explicit)

Each strike site declares `physical` or `magic`. The only rule: **ATK/PEN picks never buff magic**
(R190-E, already true of rows 1–5 because they are not unit strikes). Magic is defended exactly like
physical. **Zero balance change.** Cost: one field per site and a mechanical test that every
`damageEntity` / `damageConnector` / `applyRadialDamage` caller names its class (the S183
`damage.callSites.test.ts` pattern). It is the hook the other two options hang from.

### Option 2 — MAGIC IGNORES DEF

A magic hit lands as if the target's DEF were 0: against a unit the hit is scaled by `(5 + DEF) / 5`
(floored, never below 1 — his floor-at-one); against a connector the structure's DEF `n` likewise; against
the keep, its bought DEF does not reduce it. No new stat.

⚠ **THE CONSEQUENCE HE MUST SEE FIRST — ONE RA COLUMN WOULD KILL EVERY TIER-9 BOSS.** A boss's HP-only part
is `hp × 5`: Vlad 100 · Kraken 120 · Pharaoh 110 · zombie boss 120 · Warlord 110 · Archdemon 100
(`T9_BOSS_STATS`). Every one is under the column's **300**. Today the column kills only the two 260-pool
bosses (Vlad, Archdemon: `20 × 13`) and leaves the Kraken (408), Pharaoh (462), zombie boss (360) and
Warlord (374) standing. The Pharaoh's own ritual would one-shot enemy bosses; WRATH would do it three
times a fight. The tier-3 scarab (`4 × 7` = 28, HP part 20) and warband (`4 × 6` = 24, HP part 20) are
already dead to a column either way.

### Option 3 — A MAGIC RESIST STAT: "A WHOLE DIFFERENT SPECTRUM"

A fifth stat, **RES**, on the same ladder: physical hits are defended by DEF (as now), magic hits by RES —
implemented on the ONE pool as a scale factor on the magic hit, `(5 + DEF) / (5 + RES)` (floored, min 1),
so no unit grows a second health bar. ⭐ **RES starts EQUAL TO DEF for every unit, tower and keep**, which
makes day one byte-identical to today (factor 1) — no boss becomes one-shot. From then on DEF and RES are
separate levers: a DEF pick for physical, a RES pick for magic, races that lean one way. It is the only
option that gives the draft a new, real choice. Cost: the most — a stat on every config, the four wide
sites if it is per-creature, a draft axis, a character-card row, the keep's own RES purchase.

---

## 3 · THE DRAFT (R190-E)

As built, an ATK/PEN pick reaches every **unit** strike — melee and ranged, and also the three unit
"explosions" (rows 9–11: the suicide goblin, the drone, the Voltkin's chain, drafted since S190). It
reaches NO skill, aura, tower, keep or raid (rows 1–8, 13). Under every option above that stays true:
**no ATK/PEN pick ever buffs magic.** What would buff magic is a separate question (Q3).

---

## 4 · QUESTIONS FOR HIM — plain words, one recommendation each

**Q1 · Which attacks are magic?**
Recommendation: **magic = a SKILL or an AURA** — the Ra columns (the Pharaoh's and POWER / WRATH OF RA), the
zombie boss's rot, SCORCHED GROUND, the stink tower's aura. **Physical = anything a unit, a tower, the keep
or a player swings, shoots or blows up** — melee, arrows, the castle gun, the laser, Helga, the stink bags,
the suicide goblin, the drone, the Voltkin, a raid.

**Q2 · What should magic DO differently?**
Recommendation: **Option 3 (a RES stat that starts equal to DEF)** if he wants it to be "a whole different
spectrum" — it changes nothing on day one and opens a new draft choice. Say NO to Option 2 as it stands:
one Ra column would kill every boss in the game. If he only wants the words right for now, **Option 1**
costs nothing and is what R190-E already does.

**Q3 · What makes magic stronger, if not an ATK pick?**
Recommendation: **nothing new yet.** WRATH OF RA already triples POWER OF RA's casts; a "spell power" draft
pick can come once the Q1 list is settled and he has played with it. (Under Option 3 the matching defence
pick — RES — would come first.)

**Q4 · The three "lightning / explosion" units — the drone, the Voltkin's chain lightning, the suicide
goblin — physical or magic?**
Recommendation: **physical, as built.** They are a unit's own attack and his S190 draft-ATK ruling already
buffs them; calling them magic would take that buff back. Same answer for the lightning hub's self-destruct
(ruled at 4 × a drone, so it follows the drone).

**Q5 · Should magic go through the keep's bought DEF?**
Recommendation: **follow Q2.** Option 1: the keep's DEF stops magic like anything else (today's rule).
Option 3: the keep gets a RES that starts at its bought DEF, and a separate button to buy more.

---

## 5 · IF HE PICKS ONE — what building it would touch (for the merge owner's sizing, not a plan)

- **Option 1**: a `DamageClass` beside `DamageSource` (`damage.ts:115`), one argument at every caller in §1,
  a call-sites test. No wire, no hash, no protocol bump.
- **Option 2**: Option 1 + the scale factor inside `damageEntity` / `damageConnector` and the keep's arm;
  a SHARED RULE both peers compute → **protocol bump**; re-pin every Ra / aura test that counts kills.
- **Option 3**: Option 2's factor with `RES` in place of 0 + a `res` stat on every creature config (default
  = `def`), the keep's RES purchase, a draft axis, the character-card row. If RES can ever differ from the
  type's (a drafted RES), it is a per-creature wide field (four sites) → **protocol bump**.
