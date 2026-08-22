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
 * A whole structure's defensive score, in fifths — `connectors × perConnector`.
 *
 * Nothing in the damage path reads this: damage always lands on ONE connector, and the per-connector
 * share is what resists it. It exists because the owner reasons about structures in these terms
 * (*"11hp x 3.2def … total defensive score"*), so the HUD and the tests can speak their language
 * without re-deriving it and drifting.
 */
export function structureDefenceFifths(componentConnectorCount: number): number {
  return componentConnectorCount * connectorCapacityFifths(componentConnectorCount);
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
  // Eats connectors, never fights soldiers — the shipped behaviour, now stated rather than implied.
  chewer: STRUCTURES_ONLY,
  voltkin: BOTH,
  lightningDrone: BOTH,
  goblinMelee: BOTH,
};

/**
 * The same table for towers. Owner R72 names only the laser turret explicitly (*"does both"*).
 *
 * HELGA is `units` only — she is the one unambiguous entry in the whole ruling.
 * The STINK TOWER is `units` only too, and that is shipped behaviour rather than a new decision: it
 * is the AREA denier, its bags splash creatures, and it has never had a structure-attack path.
 */
export const DEFENDER_TARGETS: Readonly<Record<DefenderKind, ReadonlySet<TargetClass>>> = {
  princess: UNITS_ONLY,
  turret: BOTH,
  stinkTower: UNITS_ONLY,
};

/** What each unit is FOR (owner R77's "role"). Exhaustive — a new unit must declare one. */
export const CREATURE_ROLES: Readonly<Record<CreatureType, CombatRole>> = {
  // Walks to an enemy structure and gnaws its connectors. Pure aggression, no holding ground.
  chewer: 'offence',
  // A free melee unit that closes on whatever is nearest — it fights and it screens.
  goblinMelee: 'both',
  // A suicide missile. It has exactly one use and it is not defensive.
  lightningDrone: 'offence',
  // Summoned, powerful, and equally used to clear attackers or to break a line.
  voltkin: 'both',
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
