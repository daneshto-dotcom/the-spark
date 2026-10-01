/**
 * SPARK — S191 P12 (`s191/perf`) — THE REFERENCE NAV-UNIT PICK. TEST-ONLY. ⛔ Never imported by
 * production code (the `.fixtures.ts` convention).
 *
 * ## What this is
 *
 * A VERBATIM copy of `pickNavUnit` and the two functions it reads — `findNearestEnemyCreatureFrom`
 * and `distSq` — exactly as they shipped at master 42cc2ee (live deploy #4), taken from
 * `creatureAI.ts` before s191/perf routed `pickNavUnit`'s re-acquire through a per-tick enemy index.
 * The ONLY edit is that every name gains a `reference` prefix (importing `creatureAI.ts` from here
 * would be circular when a test `vi.mock`s that module and routes it through this file). Checked
 * mechanically when this file was written: the bodies below diff to zero lines against
 * `git show 42cc2ee:src/state/creatures/creatureAI.ts` bar the prefix.
 *
 * ## Why it exists
 *
 * s191/perf is a PURE performance change: outputs must be byte-identical. `s191Perf.differential.test.ts`
 * routes every host-tick call of `pickNavUnit` through a wrapper that runs THIS beside the real
 * function on the same world at the same instant, and runs a world on this reference beside a world on
 * the index with `hashWorldStateFull` compared every tick.
 *
 * ## ⚠ IF YOU CHANGE NAV-UNIT *BEHAVIOUR* (e.g. stop targeting a unit killed earlier in the tick)
 *
 * Change THIS FILE FIRST — it is the readable specification — then make `creatureAI.ts` agree.
 *
 * ## ⭐ S192 T13 — THE FIRST BEHAVIOUR CHANGE, AND IT LANDED HERE FIRST
 *
 * Owner: *"my spawn were attacking him, even though it was already dead"* — he ruled that a pick
 * returning a unit killed earlier in the same tick IS a bug. The acquire scan and the hold now both
 * skip a creature that is not a live target: `ehp <= 0`, in `pendingCreatureDeaths` (the S155 N1
 * corpse-in-waiting), or untargetable. (A `DESPAWNING` clause shipped in the first cut and was removed
 * by ruling — *"Units are either destroyed or respawned"*.)
 *
 * ⛔ WRITTEN OUT LONGHAND (`referenceIsLiveTarget`), NOT IMPORTED. Production reads the shared
 * `isLiveCreatureTarget` from `creature.ts`; if this file imported it too, a wrong edit to that
 * predicate would move both sides at once and the differential would stay green over it. The
 * longhand copy is what keeps the oracle independent. `isUntargetable` stays imported, as before:
 * it is the S169/S171 rule this file has always shared, and T13 did not change it.
 */
import type { CreatureId, PlayerId, Vec2 } from '../../types.ts';
import type { World } from '../world.ts';
import type { Creature } from './creature.ts';
import { isUntargetable } from './creature.ts';
import { CREATURE_CONFIGS } from './voltkin-config.ts';
import { CHASE_GIVEUP_SLACK_PX, CHASE_GIVEUP_SPEED_RATIO } from '../../constants.ts';
import { zoneOf, zoneOwner } from '../zones.ts';

/**
 * S192 T6 — "don't chase what you can't catch", LONGHAND for the same reason as the liveness rule.
 * `creatureAI.STANDOFF_ENGAGE_FRACTION` is copied as a literal (importing `creatureAI.ts` here is the
 * circular import the file docblock describes); `chaseGiveUp.test.ts` pins the two equal.
 */
export const REFERENCE_STANDOFF_ENGAGE_FRACTION = 0.9;

export function referenceCannotCatch(world: World, chaser: Creature, quarry: Creature, dSq: number): boolean {
  const cc = CREATURE_CONFIGS[chaser.type];
  const reach = (cc.holdsRange ? cc.attackRange * REFERENCE_STANDOFF_ENGAGE_FRACTION : cc.attackRange) + CHASE_GIVEUP_SLACK_PX;
  if (dSq <= reach * reach) return false;
  const qc = CREATURE_CONFIGS[quarry.type];
  const nonCombatant = quarry.type === 'chewer' || (qc.selfExplode && !qc.targetsStructures);
  if (!nonCombatant) return false;
  if (!(qc.maxAccel > cc.maxAccel * CHASE_GIVEUP_SPEED_RATIO)) return false;
  // S192 refinement — at home it is engaged.
  const home = zoneOwner(chaser.ownerPlayerId as unknown as number, world.layout);
  if (home !== null && zoneOf(quarry.pos, world.layout) === home) return false;
  // S192 refinement — and when it can be cut off before it reaches its target.
  const vx = quarry.targetPos.x - quarry.pos.x;
  const vy = quarry.targetPos.y - quarry.pos.y;
  const len2 = vx * vx + vy * vy;
  if (len2 >= 1) {
    const t = Math.min(1, Math.max(0, ((chaser.pos.x - quarry.pos.x) * vx + (chaser.pos.y - quarry.pos.y) * vy) / len2));
    const px = quarry.pos.x + t * vx;
    const py = quarry.pos.y + t * vy;
    const quarryTravel = t * Math.sqrt(len2);
    const chaserTravel = Math.max(0, Math.hypot(chaser.pos.x - px, chaser.pos.y - py) - reach);
    if (chaserTravel * qc.maxAccel <= quarryTravel * cc.maxAccel) return false;
  }
  return true;
}

/**
 * S192 T13 — the liveness rule, longhand (see the file docblock for why it is not imported):
 * a live pool, not a corpse-in-waiting, and selectable.
 */
export function referenceIsLiveTarget(world: World, c: Creature): boolean {
  if (c.ehp <= 0) return false;
  if (world.pendingCreatureDeaths !== null && world.pendingCreatureDeaths.has(c.id)) return false;
  if (isUntargetable(c, world.tick)) return false;
  return true;
}

/**
 * Squared distance between two Vec2 points. Avoids sqrt for hot-path compare.
 */
export function referenceDistSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * S103 #8 — the GENERIC nearest-enemy-creature scan, the inverse of `findNearestBondTarget`
 * for the creature population. Returns the `CreatureId` of the nearest LIVE creature owned by
 * a DIFFERENT player than `ownerPlayerId`, within `maxRangeSq` (squared px) of `fromPos`, or
 * `null` if none. This is the ONE shared helper (Council MF7) used by:
 *   - Voltkin (#8) — opportunistic zap of a chewer that wanders within its attackRange;
 *   - the laser turret (P3) + HELGA (P4) — both `Defender`s pick their slap/beam victim with it.
 * That is why it takes a bare `(pos, ownerPlayerId, range)` rather than a `Creature` — a defender
 * is not a creature but targets the same population from the same rule.
 *
 * Determinism (replay + 1v1 host-authority): pure read, no `Math.random` / wall-clock; squared
 * distances (no sqrt); **lowest-`CreatureId` tie-break** on equal distance (V8 Map iteration is
 * insertion order, so the explicit id compare guarantees a stable pick regardless of insert order).
 * `excludeId` lets a creature-caller skip itself (a defender passes `undefined`).
 */
export function referenceFindNearestEnemyCreatureFrom(
  world: World,
  fromPos: Vec2,
  ownerPlayerId: PlayerId,
  maxRangeSq: number = Infinity,
  excludeId?: CreatureId,
  chaser?: Creature,
): CreatureId | null {
  let bestId: CreatureId | null = null;
  let bestDistSq = Infinity;
  for (const [id, c] of world.creatures) {
    if (id === excludeId) continue;
    if (c.ownerPlayerId === ownerPlayerId) continue; // enemy-only
    /*
     * ⭐⭐ S169 (owner R142, and R121) — **CANNOT BE TARGETED, ENFORCED AT THE CHOKEPOINT.**
     *
     * Owner on the Pharaoh's locusts: *"locusts attack with 10 atk and 10 pen and they cannot be
     * targeted."* R121 wants the same for the submerged naga.
     *
     * ⭐ THIS ONE LINE COVERS EVERY CREATURE-TARGETING PATH IN THE GAME, which is the happy finding
     * of the enumeration: creature-vs-creature acquisition (`findNearestEnemyCreature` and the
     * standoff wrapper), the CASTLE GUNS (`castleGuns.ts`), every generic DEFENDER — laser turret,
     * Helga, the stink tower (`defenderLifecycle.ts`) — and the gatherer renderer's preview of the
     * castle gun all funnel through this function. So untargetability is inherited BY CONSTRUCTION
     * rather than by each future acquisition path remembering, which is exactly what the R142 design
     * note asked for.
     *
     * ⚠ AND IT IS DELIBERATELY *NOT* IMMUNITY. This gate makes a unit impossible to SELECT as a
     * target; it does not make it impossible to HURT. Area effects that sweep a region rather than
     * pick a victim — the potato's radial clear, the hub's self-destruct, the zombie rot aura, the
     * Kraken's own sonar cone — still reach it, because "cannot be targeted" is a statement about
     * ACQUISITION and reading it as invulnerability would make a 15-second locust cloud unkillable
     * by anything at all. `untargetableGates.test.ts` pins both halves.
     *
     * S192 T13 — and not dead: the liveness rule, longhand.
     */
    if (!referenceIsLiveTarget(world, c)) continue;
    const dSq = referenceDistSq(fromPos, c.pos);
    if (dSq > maxRangeSq) continue; // range gate
    if (chaser !== undefined && referenceCannotCatch(world, chaser, c, dSq)) continue; // S192 T6
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (bestId === null || (id as unknown as number) < (bestId as unknown as number)))
    ) {
      bestDistSq = dSq;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * R83 — pick the enemy UNIT a structure-attacker should navigate toward, with hysteresis.
 *
 * ⭐ THE HYSTERESIS NEEDS NO NEW FIELD, AND THAT IS THE WHOLE REASON THIS SHAPE WAS CHOSEN.
 * `held` is the value `creature.targetCreatureId` still carries from LAST tick — the field is
 * already declared, already serialized, already hashed and already cleared on every FSM
 * transition. Enumerating the chain for a genuinely new creature field first (the
 * `targetPrimitiveId` precedent) measured FOURTEEN files and ~45 sites, plus a hashed-state
 * question. Reusing the field that already persists costs zero of that.
 *
 * Returns the unit to chase, or `null` to fall through to the structure target.
 */
export function referencePickNavUnit(
  world: World,
  creature: Creature,
  held: CreatureId | null,
  acquireRadiusSq: number,
  leashRadiusSq: number,
): CreatureId | null {
  // Hold an existing lock while the quarry stays inside the (wider) leash. This is the branch
  // that kills the 60 Hz pirouette — see GOBLIN_UNIT_LEASH_RADIUS for why the radii differ.
  if (held !== null) {
    const quarry = world.creatures.get(held);
    if (
      quarry !== undefined &&
      quarry.ownerPlayerId !== creature.ownerPlayerId &&
      // ⭐⭐ S179 (owner) — **RETENTION MUST RE-CHECK UNTARGETABILITY, NOT ONLY ACQUISITION.**
      // The defender half of this was fixed in S171 (`defenderLifecycle.ts`, "without this line
      // every turret already locked onto him keeps firing into a creature that is between
      // realities"); the CREATURE half never was, and `creature.ts` asserts the rule is universal.
      // Consequence the owner approved fixing: a Pharaoh entering his 10 s Ra ritual becomes
      // untargetable, every unit already locked on him renewed that lock here, and because
      // ATTACKING returns ZERO_ACCEL they stood FROZEN for the full ritual dealing nothing —
      // his own S177 P9 complaint, *"pretending to attack and not hitting anything"*.
      // S192 T13 — a corpse-in-waiting is not held either.
      referenceIsLiveTarget(world, quarry) &&
      referenceDistSq(creature.pos, quarry.pos) <= leashRadiusSq &&
      // S192 T6 — and a quarry it cannot catch is let go.
      !referenceCannotCatch(world, creature, quarry, referenceDistSq(creature.pos, quarry.pos))
    ) {
      return held;
    }
  }
  // No lock, or the quarry died / broke the leash → re-acquire inside the tighter radius.
  return referenceFindNearestEnemyCreatureFrom(
    world,
    creature.pos,
    creature.ownerPlayerId,
    acquireRadiusSq,
    creature.id,
    creature,
  );
}
