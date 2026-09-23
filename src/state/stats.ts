/**
 * SPARK — THE STAT SYSTEM (S151 P2). Owner rulings R72 · R74 · R75 · R76.
 *
 * ## Why this file exists
 *
 * Owner R72: *"the unit balance … is all very stupidly made. a goblins power should not be the
 * backbone for the whole stat system - there should be a system in place that we define."*
 *
 * They were describing a real, measurable defect. Before this file, FIVE separate numbers derived
 * from one grunt's hit points or were bolted on without validation:
 *
 * ```
 * PRINCESS_SLAP_DAMAGE_VS_CREATURE = round(GOBLIN_MELEE_HP / 2)   // Helga's damage WAS the goblin
 * TURRET_BEAM_DAMAGE_VS_CREATURE   = GOBLIN_MELEE_HP              // so was the laser's
 * goblinRenderer                    uses GOBLIN_MELEE_HP as an hp-bar denominator
 * TURRET_DEFENDER_MAX_HP  = 3000    // "FIRST-PASS BALANCE … unvalidated by play" — its own comment
 * PRINCESS_DEFENDER_MAX_HP = 2000   // ditto
 * ```
 *
 * Every one of them is deleted by this system. Nothing here derives from any specific unit.
 *
 * ## The model — THREE families, each taking the stats that match what it physically is
 *
 * | family                 | HP | DEF | ATK | PEN |
 * |------------------------|----|-----|-----|-----|
 * | UNITS (creatures)      | ✓  | ✓   | ✓   | ✓   |
 * | TOWERS (defenders)     | —  | —   | ✓   | ✓   |
 * | CONNECTORS (bonds)     | ✓  | ✓   | —   | —   |
 *
 * Owner R75: *"towers have attack and piercing but not def and hp because they are based on the
 * connectors that build them. its the connectors that have different hp and def (think about it)."*
 *
 * ⭐ THIS IS A REVERSION TO THE ORIGINAL DESIGN INTENT, NOT A NEW IDEA. Defenders shipped with
 * `DEFENDER_HP = 1e9` — a sentinel that meant *"defenders die by recipe-break, not damage"*. S138
 * replaced it with real hp that its own comment admitted was unvalidated. R75 removes the bolt-on and
 * puts durability back where the structure actually lives: in the bonds.
 *
 * ## The ladders (owner R72 + the follow-up)
 *
 * - **HP and ATK** are integer POINTS on a flat ladder, design range 1..12.
 * - **DEF and PEN** are integer points indexing a LINEAR multiplier ladder `1 + 0.2n`
 *   (×1.2, ×1.4, ×1.6, …) — **not** `1.2^n`. Pinned twice by the owner: *"2 hp and 2 [def] he will
 *   then have 2x1.4 = 2.8"* — 1.4, not 1.44.
 *
 * ## ⭐ WHY EVERYTHING IS IN FIFTHS, AND WHY THAT IS EXACT
 *
 * `1 + 0.2n = (5 + n)/5`. So multiplying by five clears every denominator in the system and **every
 * quantity below is an exact integer**. No floats reach the damage path at all.
 *
 * That is not a micro-optimisation, it is the determinism requirement:
 *   - `damageEntity` THROWS on a non-integer amount (`damage.ts`'s guard), so a fractional effective
 *     hp would be a live crash, not a rounding wobble;
 *   - the host and the `?worker=1` mirror must agree bit-for-bit, and integer arithmetic cannot
 *     drift by an ulp the way `2 * 1.4` can.
 *
 * Worked against the owner's own example: a 2 HP / 2 DEF defender rates `2 × (5+2) = 14` fifths
 * (= 2.8); a 3 ATK / 0 PEN laser deals `3 × (5+0) = 15` fifths (= 3.0); `15 ≥ 14`, so it dies in one
 * hit. Matches *"if a laser tower has 3 attack, then he will be destroyed with one laser hit"*.
 *
 * ## ATK is a POOL, not a threshold (owner R74)
 *
 * Damage ACCUMULATES: `pool -= dmg; if (pool <= 0) die`. The alternative reading — compare once,
 * survive-or-die — was considered and rejected by the owner. It also fails their own words twice
 * over: *"attack = -1 hp point"* is a pool, and under a threshold a 2-ATK attacker could never kill a
 * 3-HP target no matter how many times it hit. Every damage path in this codebase was already a pool,
 * so this ruling cost nothing to honour.
 *
 * ## The PEN placement question is MOOT, and that is a proof rather than a preference
 *
 * Comparing `ATK × (1+0.2·PEN)` against `HP × (1+0.2·DEF)` is algebraically identical to comparing
 * `ATK` against `HP × (1+0.2·DEF) / (1+0.2·PEN)`, since both `(1+0.2·PEN)` and `(1+0.2·DEF)` are
 * strictly positive. Both orderings give the same outcome for every input. The multiply form is used
 * because it needs no division, has no divide-by-zero edge, and stays exact in integers.
 *
 * Pixi-free, DOM-free, World-free, side-effect-free — pure arithmetic and one lookup table.
 */

import { GOBLIN_DAMAGE_VS_PRIMITIVE, GOBLIN_MELEE_ATK } from '../constants.ts';
import type { CreatureType } from './creatures/creature.ts';
import type { DefenderKind } from './defenders/defender.ts';

/* ────────────────────────────────────────────────────────────────────────────────────────────── *
 *  THE SCALE
 * ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The fixed-point denominator. Every rating in this module is expressed in FIFTHS of a point, which
 * is exact because the DEF/PEN ladder steps by 0.2 = 1/5.
 *
 * ⚠ Do NOT "simplify" this to a float multiplier. See the docblock — `damageEntity` throws on
 * fractional amounts and the worker mirror must match the host bit-for-bit.
 */
export const FIFTHS = 5;

/**
 * The design range for HP and ATK points (owner: *"scaling will be for hp = 1, 2, 3 … 12"*).
 *
 * ⚠ THIS IS A DESIGN RANGE, NOT A RUNTIME CLAMP — deliberately. Nothing here rejects a value outside
 * it, because owner R76 explicitly made structure DEF **uncapped** (*"No cap - def climbs with the
 * structure complexity"*), and a clamp helper sitting next to an uncapped stat is an invitation to
 * apply it to the wrong one. `statsLadder.test.ts` asserts every SHIPPED unit sits inside the range;
 * the range is enforced by test, not by silent truncation.
 *
 * ⛔ **CORRECTED S167 — THAT LAST SENTENCE WAS A PROMISE, NOT A FACT.** `statsLadder.test.ts` DID
 * NOT EXIST. The comment had been describing a guard nobody had written, for long enough that a
 * later session (this one) read it, believed the range was enforced, and shipped six bosses at
 * HP 40–60 — five times the ruled ceiling — with every gate green. The file exists now and this
 * sentence is true; it is left in place rather than deleted precisely because it is the shape of
 * mistake that repeats: **a comment claiming a guard is not a guard.**
 *
 * ⛔ **AMENDED S172 — AND THIS AMENDMENT EXISTS BECAUSE THE PARAGRAPH ABOVE STARTED DRIFTING AGAIN.**
 *
 * “every SHIPPED unit sits inside the range” is no longer true of six of them. The owner ruled the
 * tier-9 bosses UP, twice: *“bosses should be a lot stronger. So let's double their health and
 * defense, whatever it is right now.”* They now sit at **HP 20–24, DEF 8–16** — outside 1..12 by
 * his instruction, not by drift.
 *
 * ⭐ THE GUARD DID NOT WEAKEN, IT SPLIT. `statsLadder.test.ts` now runs TWO lanes: the roster is
 * still held to 1..12, and the six bosses to their own owner-ruled band. That is STRICTER than
 * what it replaced — a boss must now be ≥ 20, so rolling one back to its old HP fails, which the
 * S172 negative control proved by poisoning the data and watching both lanes fire.
 *
 * ⚠ So read `STAT_POINT_MAX` as the ROSTER ceiling, not a universal one. It is exactly the
 * sentence above, one session older: a range is only as true as the lane that checks it, and this
 * docblock has now been wrong twice in the same place.
 */
export const STAT_POINT_MIN = 1;
export const STAT_POINT_MAX = 12;

/**
 * The DEF/PEN multiplier ladder, in fifths: `1 + 0.2n` → `(5 + n)`.
 *
 * `0 → 5` (×1.0) · `1 → 6` (×1.2) · `2 → 7` (×1.4) · `10 → 15` (×3.0).
 */
export function multiplierFifths(points: number): number {
  return FIFTHS + points;
}

/**
 * A UNIT's effective hit-point pool, in fifths: `HP × (1 + 0.2·DEF)`.
 *
 * This is the number damage is subtracted from. The owner's worked example — 2 HP with 2 DEF — is
 * `2 × 7 = 14` fifths, i.e. 2.8.
 */
export function unitPoolFifths(hp: number, def: number): number {
  return hp * multiplierFifths(def);
}

/**
 * An ATTACKER's per-hit damage, in fifths: `ATK × (1 + 0.2·PEN)`.
 *
 * Used identically by units and towers, which is the point of one shared scale — a laser and a
 * goblin are finally comparable numbers rather than two tunings from different sessions.
 */
export function attackFifths(atk: number, pen: number): number {
  return atk * multiplierFifths(pen);
}

/**
 * ⭐⭐ S187 (owner) — **A DRAFT BUFF IS A PERCENTAGE OF THE LADDER NUMBER, FLOORED, MINIMUM ONE.**
 *
 * > *"When we have the 10% HP increase of a one-one-one-one unit then it comes out as 0.6 … but we
 * > don't have a 0.6, so what we do is we just add one point. So instead of six health he will have
 * > seven health. As easy as this. Anything that doesn't ship as at least a whole number you just
 * > give him the lowest amount possible, which is one."* — owner, S187
 *
 * ⛔ **THIS RULING IS WHAT MAKES A PERCENTAGE EXPRESSIBLE ON THIS LADDER AT ALL.** The castle-spawned
 * unit is `1/1/1/1` (R125, `RACE_UNIT_*`), so its pool is `1 × (5+1) = 6` fifths. Ten percent of 6 is
 * 0.6, and `damageEntity` THROWS on a non-integer by design — the stat system is integer fifths
 * precisely so no float can reach the damage path and diverge the host from the `?worker=1` mirror.
 * Before this ruling the only options were a buff that truncated to nothing, or a fractional amount
 * that cannot exist. The floor-at-one rule gives the small unit a real step (6 → 7) while a large
 * pool still scales properly (a 260-fifth boss gets a true 26). That is strictly better than the
 * flat `+1 POINT` R118 had settled for, which was the same size for a chewer and for a Kraken.
 *
 * ⚠ **IT COMPOUNDS, DELIBERATELY.** Each pick applies to the value as it stands, so two picks on a
 * race unit read 6 → 7 → 8 rather than 6 → 7 → 7. R101 makes the draft recurring with no ceiling,
 * and compounding is the only reading under which a late pick is still worth taking.
 *
 * ⛔ **ALL-INTEGER AND ORDER-INDEPENDENT, AND BOTH ARE LOAD-BEARING.** `v * pct` is an integer
 * product and the division floors, so no float is ever constructed. The result depends only on the
 * COUNT of picks — never on the order they arrived, nor the tick they landed — which is what keeps
 * two peers agreeing after a mid-match joiner replays them in a different sequence.
 */
export function applyDraftPercent(baseFifths: number, picks: number, pct: number): number {
  let v = baseFifths;
  for (let i = 0; i < picks; i++) {
    v += Math.max(1, Math.floor((v * pct) / 100));
  }
  return v;
}

/**
 * ⛔⛔ **SUPERSEDED S177 P1 — RETIRED, AND NOTHING IN THE DAMAGE PATH CALLS IT.**
 *
 * This was the bridge between two damage scales. There is only ONE scale now: the owner's ×5 ladder,
 * which a shape joined when `PRIMITIVE_MAX_HP` became 70. Owner, S177: *"it would definitely not come
 * out as a hundred sixty four damage. That's just obscure ... we have a system for this. Like, this
 * should be the canonical system moving forward."* Every former caller now passes the SAME
 * `attackFifths(atk, pen)` it already passed for units.
 *
 * Kept, unused, next to `connectorCapacityFifths` — the other function a newer ruling superseded —
 * so the arithmetic that shipped for 19 sessions stays readable to whoever reads the old tests.
 *
 * ⭐ S158 P3b (owner) — **AN ATK VALUE, ON THE 1000-PER-SHAPE SCALE.**
 *
 * Owner, ruling on the terrorist goblin's blast: *"the 4atk against units + 4 atk against
 * structures/structur connectors"*. Units and connectors both live on the fifths ladder, so those
 * two are `attackFifths` and need nothing new. SHAPES do not — a primitive has 1000 hit points, and
 * until now the only bridge between the two scales was one hard-coded number.
 *
 * The bridge that already existed, made general: `GOBLIN_DAMAGE_VS_PRIMITIVE` (167) is what
 * `GOBLIN_MELEE_ATK` (2) does to a shape, chosen so six goblin swings fell one. That is 83.5 points
 * of shape per point of attack, and every other unit's shape damage now follows from its own ATK
 * rather than needing a bespoke constant nobody can keep in step.
 *
 * ⚠ ROUNDED, because `damageEntity` THROWS on a fraction by design — the DoT model is authored in
 * whole units. 4 atk → 334, i.e. three blasts to fell a shape.
 */
export function primitiveDamageForAtk(atk: number): number {
  return Math.round((atk * GOBLIN_DAMAGE_VS_PRIMITIVE) / GOBLIN_MELEE_ATK);
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── *
 *  CONNECTORS — owner R76
 * ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * ⭐ THE WHOLE CONNECTOR-DEFENCE SYSTEM, IN ONE EXPRESSION.
 *
 * Owner R76: *"DEFENCE of a structure matters on the ammount of connectors or bonds. the first two
 * shapes interconnected do not have any def … but only 1 HP. if there are three shapes connected in a
 * row so with only two connectors the shapes overall defensive strength is 2HPx1.2DEF which makes it
 * 2.4 and each of those two connectors are 1.2. now if those three shapes are connected in a triangle
 * form making 3 connectors the overall shape strength will be 3hpx1.4 = 4.2 and each of those
 * connectors will be 1.4."*
 *
 * Read off those three data points:
 *   - every connector is worth **1 HP**, so a structure's HP **is** its connector count;
 *   - the structure's **DEF = connectorCount − 1** (1 connector → 0, 2 → 1, 3 → 2).
 *
 * ⭐ AND THE PER-CONNECTOR SHARE COLLAPSES TO THE MULTIPLIER ITSELF. The owner defines a connector's
 * durability as the structure's total divided by its connector count:
 *
 * ```
 *   total          = HP × mult = connectors × mult
 *   per-connector  = total / connectors = mult          ← the HP term cancels exactly
 * ```
 *
 * so the division is a mathematical no-op and only the multiplier is ever needed. In fifths that is
 * `5 + (c − 1)` = **`c + 4`**.
 *
 * Verified against every owner example: 1 → 5 (×1.0) · 2 → 6 (×1.2) · 3 → 7 (×1.4) · 11 → 15 (×3.0).
 *
 * ⚠ **THIS IS DYNAMIC, AND THAT IS THE INTENDED MECHANIC — NOT A SIDE EFFECT.** The count is the
 * CURRENT connector count of the bond's connected component, so destroying one connector lowers the
 * count, which lowers DEF, which weakens *every surviving connector in that structure*. Structures
 * therefore crumble at an ACCELERATING rate. Owner, confirming: *"the more complex the tower is the
 * harder it is to beat up at first as it is scaled in defense with complexity. but if you manage to
 * damage its connectors then it also scales down in defense and will be easier to keep beating down."*
 *
 * ⚠ **UNCAPPED, BY RULING.** A 40-connector fortress rates ×9.0 per connector. Balance comes from
 * OPPORTUNITY COST, not arithmetic: owner — *"super complex towers dont have powers … they are just
 * building geometric score making towers while other players building armies … youd have to chose the
 * tactic."*
 *
 * @param componentConnectorCount how many bonds are in this bond's connected component RIGHT NOW.
 */
export function connectorCapacityFifths(componentConnectorCount: number): number {
  return componentConnectorCount + (FIFTHS - 1);
}

/**
 * ⭐⭐⭐ S177 P1 (owner R173-A/B — RULED S173, NEVER BUILT, RE-STATED IN FULL S177) — **THE STRUCTURE POOL.**
 *
 * The canonical system, in his own words, and it is the SAME LADDER every unit already uses — which
 * is the entire point of it:
 *
 * > *"Towers are made of connections of a set of connectors. If there are five connectors ... each
 * > connector is one HP and one level of defense. So level five of defense comes out as two, because
 * > the defense ladder goes level one 1.2, level two 1.4, level three 1.6, level four 1.8, and level
 * > five is two. So you take five HP, then you times it times two. It comes out as ten. And then you
 * > times it times five. So that is fifty HP to destroy the ... tower."*
 *
 * And on the algebraic form, S177: *"HP times one plus zero point two times defense ... Sure. Yeah.
 * That works. You can define it like that ... And similarly for the ladder of attack."*
 *
 * ⇒ **HP = n, DEF level = n, pool = n × (1 + 0.2n) × 5 = `n × (FIFTHS + n)` fifths.**
 *
 * | n | his arithmetic | pool |
 * |---|---|---|
 * | 5 | 5 × 2.0 × 5 | **50** |
 * | 4 | 4 × 1.8 × 5 | **36** |
 * | 3 | 3 × 1.6 × 5 | **24** |
 * | 2 | 2 × 1.4 × 5 | **14** |
 * | 1 | 1 × 1.2 × 5 | **6**  |
 *
 * ⛔ **THIS FULL POOL IS THE COST OF ONE CONNECTOR, NOT OF THE WHOLE TOWER** (R173-B). He is
 * explicit: *"which also is defined by the first connection that is destroyed. And there's still four
 * other connectors, and you need to destroy all of them to completely destroy the building ... Then
 * it falls down to four connectors left. Four connectors left would be four HP times one point eight
 * defense, and then times five."* So levelling a 5-connector tower costs
 * 50 + 36 + 24 + 14 + 6 = **130 fifths**, at an accelerating rate — R76's own intent, unchanged; only
 * the LADDER moved up a level and the pool became structure-wide instead of per-bond.
 *
 * ⛔ SUPERSEDES R76 AS RECORDED IN `connectorCapacityFifths` ABOVE (DEF = n − 1, damage banked on ONE
 * bond). That function is kept, and kept OUT of the damage path, so both rulings stay legible.
 *
 * ⭐ AND THIS IS THE ANSWER TO *"why does a tower show a hundred sixty seven"* — not a display fix. A
 * tower's pool now lives on the ×5 ladder units already use, so the number a goblin prints on a
 * connector is the number it prints on a goblin. His worked case: *"a boss that has twelve attack and
 * five penetration could still destroy a tower with one hit"* — `attackFifths(12,5)` = 12 × 10 =
 * **120** against a 50 pool. ✓
 */
export function structurePoolFifths(componentConnectorCount: number): number {
  return componentConnectorCount * multiplierFifths(componentConnectorCount);
}

/**
 * A whole structure's defensive score, in fifths — `connectors × perConnector`.
 *
 * Nothing in the damage path reads this: damage always lands on ONE connector, and the per-connector
 * share is what resists it. It exists because the owner reasons about structures in these terms
 * (*"11hp x 3.2def … total defensive score"*), so the HUD and the tests can speak their language
 * without re-deriving it and drifting.
 */
export function structureDefenceFifths(componentConnectorCount: number): number {
  return structurePoolFifths(componentConnectorCount);
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── *
 *  THE TARGETING MATRIX — owner R72
 * ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * ⭐ S151 P2 (owner R77) — WHAT THIS THING IS FOR. The first half of the "natural law".
 *
 * Owner: *"each unit or tower has a role some are offence some are defence some are both. some
 * target only units some only towers/connectors, some both... pretty simple but needs to be within
 * our build as a natural law of things. so when we add more towers and units and stuff youll
 * understand their role right away based on how i will explain it."*
 *
 * So role and targeting are DECLARED, not inferred from behaviour. Both tables below are exhaustive
 * `Record`s, which is the mechanism that makes this a law rather than a convention: adding a unit
 * without stating what it is for, and what it may hit, is a COMPILE error.
 *
 * - `offence` — it goes to the enemy (chewers, suicide drones, most goblins).
 * - `defence` — it holds ground where it was built (emplacements).
 * - `both`    — it does either depending on the situation.
 *
 * ⚠ THE ROLES BELOW ARE CLAUDE'S READING OF THE SHIPPED ROSTER, NOT OWNER-STATED VALUES. The owner
 * supplied HP/ATK/DEF/PEN for every unit (R77) and said roles would be explained per unit as new
 * ones arrive; these are inferred from what each thing already does in the sim, and are the one part
 * of this file a future owner ruling is most likely to move. They drive no arithmetic today — they
 * are declarative, so a correction costs one line and no behaviour.
 */
export type CombatRole = 'offence' | 'defence' | 'both';

/**
 * What an attacker is allowed to hit.
 *
 * ⚠ `'structures'` IS THE OWNER'S "TOWERS", AND THE WIDER READING IS DELIBERATE. R72 says
 * *"chewers only attack towers"*. Taken with R61 (*"a tower is a geometric form that has a function"*)
 * the literal reading would forbid a chewer from eating a plain, functionless pair of shapes — which
 * would be a large, unrequested nerf to the shipped chewer, whose whole job is eating connectors.
 * The natural reading of the matrix is UNITS versus STRUCTURES: chewers eat buildings, they do not
 * fight soldiers. That preserves shipped behaviour exactly, and it is what is implemented.
 *
 * Under R75 a tower has no hit points of its own, so "attacking a structure" always means damaging
 * one of its CONNECTORS — for a chewer and for a laser turret alike.
 */
export type TargetClass = 'units' | 'structures';

/** Both classes, for the many attackers that hit anything. Frozen so a consumer cannot mutate it. */
const BOTH: ReadonlySet<TargetClass> = new Set<TargetClass>(['units', 'structures']);
const UNITS_ONLY: ReadonlySet<TargetClass> = new Set<TargetClass>(['units']);
const STRUCTURES_ONLY: ReadonlySet<TargetClass> = new Set<TargetClass>(['structures']);

/**
 * ⭐ THE MATRIX, AS ONE TABLE — which is the entire point of it.
 *
 * Owner R72 stated this as a list: *"Helga only attacks enemy units, chewers only attack towers,
 * goblins of all kinds can do both, laser torretr does both, lightning drones can do both, voltkin
 * can do both."*
 *
 * Before this table the same information lived as per-unit special cases scattered across
 * `creatureAttack.ts`, `defenderLifecycle.ts` and `hostTick.ts` — the `targetsStructures` flag, the
 * `chewHits > 0` branch, and the defender fire path's implicit creature-only assumption. Three
 * encodings of one rule, none of which named it. A new unit had to rediscover all three.
 *
 * `Record` (not a partial map) so adding a `CreatureType` without deciding what it may attack is a
 * COMPILE error — the six goblin kinds in P3 land as six forced decisions.
 */
export const CREATURE_TARGETS: Readonly<Record<CreatureType, ReadonlySet<TargetClass>>> = {
  /*
   * ⭐ S168 (owner R149) — the Orc Warlord's summoned direwolf. BOTH, like the rest of the melee
   * roster: he summons it as a war pack, and a pack that walked past an enemy tower to reach a
   * soldier would read as broken. Nothing in the ruling narrows it, and BOTH is the roster default
   * for anything that closes to melee.
   */
  direwolf: BOTH,
  /*
   * ⭐ S171 (owner R142) — *"targeting units AND building"*, in as many words. BOTH.
   *
   * ⚠ THIS MUST AGREE WITH `LOCUST_CLOUD_CONFIG.targetsStructures: true`. The two disagreeing is the
   * incoherence this table's own docblock names — a unit that walks to a castle and then refuses to
   * hit it.
   */
  locustCloud: BOTH,
  // Eats connectors, never fights soldiers — the shipped behaviour, now stated rather than implied.
  chewer: STRUCTURES_ONLY,
  voltkin: BOTH,
  lightningDrone: BOTH,
  goblinMelee: BOTH,
  // ⭐ Owner R72 is unambiguous and covers the whole family at once: *"goblins of all kinds can do
  // both"*. Stated per-kind anyway rather than via a loop, because this Record is the FORCING
  // FUNCTION — a future goblin must make the decision, not inherit it silently.
  goblinArcher: BOTH,
  goblinShield: BOTH,
  goblinHound: BOTH,
  goblinBat: BOTH,
  goblinSuicide: BOTH,
  // W1-C — the castle's race unit. BOTH, matching the goblin family it fights alongside: it is the
  // baseline soldier, and a unit that could not touch structures would be unable to press an
  // advantage its own castle created.
  raceUnit: BOTH,
  /*
   * S166 — the six tier-3 units target BOTH, matching `targetsStructures: true` on their configs.
   *
   * ⚠ THESE TWO PLACES MUST AGREE OR THE UNIT IS INCOHERENT. `targetsStructures` picks the
   * `hostTick` branch (march, retreat, shape targeting) while this set is what the acquisition scans
   * read; a unit that marches on structures but is told to target units only would walk to a castle
   * and then refuse to hit it. `raceUnit` above documents the same pairing.
   */
  t3Hound: BOTH,
  t3Scarab: BOTH,
  t3Piranha: BOTH,
  // S188 APEX PREDATOR — the elite piranha fights exactly as the piranha does, bigger.
  t3PiranhaElite: BOTH,
  t3Bat: BOTH,
  t3Warband: BOTH,
  t3Souleater: BOTH,
  /*
   * S167 — the six TIER-9 BOSSES target BOTH, and the pairing warning above applies with the most
   * force here: every boss config carries `targetsStructures: true`, because the owner's brief has
   * the boss marching on the enemy CASTLE (§B item 7 sends it back to a castle between phases). A
   * boss that walked to a castle and then refused to hit it would be the single most visible bug
   * this feature could ship.
   */
  t9BossVampires: BOTH,
  t9BossNagas: BOTH,
  t9BossMummies: BOTH,
  t9BossZombies: BOTH,
  t9BossOrcs: BOTH,
  t9BossDemons: BOTH,
};

/**
 * The same table for towers. Owner R72 names only the laser turret explicitly (*"does both"*).
 *
 * HELGA is `units` only — she is the one unambiguous entry in the whole ruling.
 *
 * ⛔ S165 — THIS TABLE HAS NO PRODUCTION CONSUMER, AND SAYING SO IS THE POINT. Its accessor
 * `defenderCanTarget` is called by `stats.test.ts` and by nothing else; the creature half of this
 * module IS live (`creatureCanTarget` is used by `hostTick.ts`). So this half is a SPEC of what the
 * roster should do, not a description of what it does — and a swept audit that reads it as
 * behaviour will be wrong twice, in opposite directions. Both are recorded below.
 *
 * ⛔ S165 — THE STINK TOWER ENTRY WAS FACTUALLY WRONG AND IS CORRECTED HERE. It said `units` only
 * and justified itself with *"it has never had a structure-attack path"*. It has one and it always
 * did: `stinkThrowBag` calls `applyRadialDamage(..., STINK_BAG_DAMAGE, ...)`, and that argument is
 * the PRIMITIVE amount — 150 damage to every structure in the blast. `defenderLifecycle.ts` says so
 * in as many words at the call site (*"unlike the turret beam it damages primitives, so it can chew
 * an enemy build"*), so the repository has been asserting both facts at once. The call site is
 * right.
 *
 * ⭐⭐ S182 — **THE TURRET CARRY-FORWARD IS CLOSED: THE OWNER RETIRED R72'S TURRET CLAUSE.** The
 * paragraph here used to read *"an owner ruling the code has not caught up to"* and kept the entry
 * as `BOTH` so that a future session would implement it. It must NOT be implemented. Reading the
 * targeting table back to him in S180 he ruled:
 *
 * > *"Yeah, laser turrets, creatures only. That's fine… maybe it doesn't do both. It does only
 * > creatures, so that's fine."*
 *
 * ⭐ THE HISTORY IS KEPT AND ONLY THE CONCLUSION INVERTS, which is the point of writing it down.
 * R72 did once say the turret *"does both"*; the beam (`defenderLifecycle.ts`, the `else` arm of
 * the stink branch) calls `damageEntity` with `{ kind: 'creature' }` and never had a structure arm.
 * For three sessions the table asserted the ruling and the code asserted the opposite. S180 settled
 * it in the CODE's favour, so the entry below is now a TRUTH FIX rather than an unbuilt promise.
 *
 * ⚠ AND IT CHANGES NO BEHAVIOUR, which is why it is safe to correct rather than schedule:
 * repo-wide, `DEFENDER_TARGETS` and `defenderCanTarget` appear in exactly two files — this one and
 * `stats.test.ts`. The table has NO production consumer. It is documentation with a type on it, and
 * documentation that disagreed with the shipped beam is the whole defect.
 *
 * ⚠ `SPARK_CANON.md` §5 already says *"Laser turret: creatures only"*. Canon and code agreed; only
 * this table was wrong.
 */
export const DEFENDER_TARGETS: Readonly<Record<DefenderKind, ReadonlySet<TargetClass>>> = {
  princess: UNITS_ONLY,
  /**
   * ⭐ S180 (owner) — *"Yeah, laser turrets, creatures only. That's fine… maybe it doesn't do both.
   * It does only creatures, so that's fine."* This MATCHES the shipped beam; see the docblock above.
   */
  turret: UNITS_ONLY,
  /** ⭐ S165 — corrected from UNITS_ONLY. The bag splash deals STINK_BAG_DAMAGE to primitives. */
  stinkTower: BOTH,
};

/** What each unit is FOR (owner R77's "role"). Exhaustive — a new unit must declare one. */
export const CREATURE_ROLES: Readonly<Record<CreatureType, CombatRole>> = {
  // ⭐ S168 (R149) — a summoned war pack. It goes where the Warlord is going; it does not hold ground.
  direwolf: 'offence',
  // S171 R142 — a swarm that eats units and buildings alike; it defends nothing.
  locustCloud: 'offence',
  // Walks to an enemy structure and gnaws its connectors. Pure aggression, no holding ground.
  chewer: 'offence',
  // A free melee unit that closes on whatever is nearest — it fights and it screens.
  goblinMelee: 'both',
  // A suicide missile. It has exactly one use and it is not defensive.
  lightningDrone: 'offence',
  // Summoned, powerful, and equally used to clear attackers or to break a line.
  voltkin: 'both',
  // The archer kills from outside the melee band — pure offence, and helpless once reached.
  goblinArcher: 'offence',
  // ⭐ The one genuinely DEFENSIVE goblin. Owner R77 gave it 3 DEF, 1 ATK: it exists to be attacked
  // rather than to attack, which is the definition of the role.
  goblinShield: 'defence',
  goblinHound: 'offence',
  goblinBat: 'offence',
  // One attack, and it dies delivering it. Nothing about that holds ground.
  goblinSuicide: 'offence',
  // ⭐ 'both', and it is the honest answer rather than a shrug. The race unit arrives free and
  // unbidden every ~30 s wherever the castle is, so in practice it screens the keep it spawned at
  // AND walks out with the army. R125's flat 1/1/1/1 gives it no lean in either direction.
  raceUnit: 'both',
  /*
   * S166 — all six are 'both': they screen the tower they came from AND walk out with the army,
   * exactly as `raceUnit` does. R135's variation is in the STAT SPREAD, not in role — giving the
   * scarab 'defence' and the warband 'offence' would be a second, hidden balance axis on top of the
   * numbers the owner is going to rule on by testing, and it would make his A/B unreadable.
   */
  t3Hound: 'both',
  t3Scarab: 'both',
  t3Piranha: 'both',
  t3PiranhaElite: 'both', // S188 — the piranha's role, tripled stats
  t3Bat: 'both',
  t3Warband: 'both',
  t3Souleater: 'both',
  /*
   * S167 — all six bosses are 'both'. A boss is the most expensive thing a seat can field and there
   * is exactly ONE of it alive, so pinning it to a single role would make nine shapes a gamble on
   * which half of the game you were about to be in. The owner's own axes describe how each one
   * FIGHTS, never a posture: even the Pharaoh's *"inevitability … dread rather than aggression"* is
   * a description of an advance, not of holding ground.
   */
  t9BossVampires: 'both',
  t9BossNagas: 'both',
  t9BossMummies: 'both',
  t9BossZombies: 'both',
  t9BossOrcs: 'both',
  t9BossDemons: 'both',
};

/** What each tower is FOR. Exhaustive — a new kind must declare one. */
export const DEFENDER_ROLES: Readonly<Record<DefenderKind, CombatRole>> = {
  // A long-range emplacement that never moves — the definition of holding ground.
  turret: 'defence',
  // ⭐ R77 reclassifies her as a spawned UNIT rather than an emplacement, and she behaves like one:
  // she leaves her hub, chases her target and returns. Offence and defence both.
  princess: 'both',
  // Area denial: it lobs, then when spent it just stands there pulling aggro off everything else.
  stinkTower: 'defence',
};

/** May this creature type attack that target class? */
export function creatureCanTarget(type: CreatureType, target: TargetClass): boolean {
  return CREATURE_TARGETS[type].has(target);
}

/** May this tower kind attack that target class? */
export function defenderCanTarget(kind: DefenderKind, target: TargetClass): boolean {
  return DEFENDER_TARGETS[kind].has(target);
}
