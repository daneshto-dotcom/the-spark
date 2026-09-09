/**
 * SPARK — S169 (owner R139) — **THE KRAKEN'S SONAR WAVE: a cone that stuns and pushes back.**
 *
 * > *"Sonar wave - spat from his mouth: stuns and pushes back all enemies in a cone around him."*
 *
 * ## ⭐ THREE NEW VERBS, AND THIS FILE IS WHERE THE LAST TWO MEET
 *
 * The S167 costing of this skill called it *"the largest engineering surface of the three"* because
 * it needs a STUN, a KNOCKBACK and a CONE, and the sim had none of them. STUN shipped first as a
 * general condition (owner R152 — he asked for a condition, not a Kraken feature), so what is left
 * here is the cone geometry and the impulse.
 *
 * ## ⛔ THE CONE IS THE FIRST NON-RADIUS SCAN IN THIS GAME, AND IT NEEDED AN AXIS FROM NOWHERE
 *
 * Every acquisition scan that existed before this one is a radius, and a radius needs no direction.
 * A cone does — and **a `Creature` stores no facing**. The renderer keeps one, but it is a
 * render-only latch (`goblinRenderer`'s `facing` map, flipped off movement `dx`), so it is not
 * synced, not hashed, and reading it from the sim would be a determinism bug of the exact kind this
 * codebase spends its comments on.
 *
 * ⭐ SO THE AXIS IS THE TARGET THAT PROVOKED THE WAVE: the nearest live enemy, chosen by a TOTAL
 * ORDER (squared distance, then an explicit id compare). Both peers derive it from the same synced
 * positions and ids, so both compute the same cone. It also reads correctly — he *spits it at
 * someone* — and it makes the skill self-aiming without inventing a heading field that four other
 * sites would then have to maintain.
 *
 * ⚠ THE ID TIEBREAK IS NOT DECORATION. `Map` iteration is insertion order, and letting it settle a
 * tie is precisely how S155 N1 handed one seat every melee exchange for a whole match. Two enemies
 * at the same distance must not aim the cone differently on host and mirror.
 *
 * ## ⛔ NO TRIGONOMETRY. The half-angle test is
 *
 *     dot > 0  AND  dot² >= COS² · |toTarget|² · |axis|²
 *
 * which is multiplications only — the same shape as every squared-distance compare here.
 * `Math.acos`/`atan2` per candidate per tick would put a transcendental on the sim hot path, and
 * `creatureVerlet`'s own Δ7 note already flags cross-engine `cos`/`sin` agreement as a known 1v1
 * replay hazard. Squaring both sides costs one guard (the dot must be positive, or the REAR half of
 * the line would pass the squared test) and buys exactness.
 *
 * ## ⚠ THE KNOCKBACK IS A VERLET IMPULSE, WHICH MEANS MOVING `prevPos`, NOT `pos`
 *
 * Velocity in this integrator is implicit: `v = pos - prevPos`. So pushing a unit away from the
 * Kraken means dragging its `prevPos` TOWARD the Kraken — the unit then slides outward over the
 * following ticks and decays under `VELOCITY_DAMPING`, instead of teleporting. Writing `pos`
 * directly would move it without giving it any velocity, which reads as a stutter rather than a
 * shove, and would fight the constraint solver on the same frame.
 *
 * ⭐ AND THIS IS WHY STUN GATE 2 RETURNS `ZERO_ACCEL` RATHER THAN HARD-STOPPING. A hard stop would
 * eat the shove the same wave applies — the two halves of one owner sentence cancelling each other.
 * `ZERO_ACCEL` means COAST (the module says so in full), so the stunned unit keeps the impulse and
 * cannot steer against it. The two skills were designed to compose and the composition is asserted.
 */

import {
  KRAKEN_SONAR_COS_HALF_ANGLE,
  KRAKEN_SONAR_INTERVAL_TICKS,
  KRAKEN_SONAR_KNOCKBACK,
  KRAKEN_SONAR_RANGE,
  KRAKEN_SONAR_STUN_TICKS,
} from '../constants.ts';
import { liveIdsOfType } from './bossSkills.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { applyStun, isStunned, type Creature } from './creatures/creature.ts';
import type { CreatureId } from '../types.ts';
import type { World } from './world.ts';

/**
 * The nearest live ENEMY of `boss`, by a total order: squared distance, then id.
 *
 * Exported for the test, which pins the tiebreak directly rather than inferring it from a cone
 * result — a tie that resolved by `Map` order would still usually produce the right cone, and
 * "usually" is what makes this class of bug survive.
 */
export function nearestEnemyFor(
  world: World,
  boss: Creature,
  maxRangeSq: number,
): Creature | null {
  let best: Creature | null = null;
  let bestSq = Infinity;
  for (const c of world.creatures.values()) {
    if (c.ownerPlayerId === boss.ownerPlayerId) continue; // never our own units
    if (c.ehp <= 0) continue;
    if (c.id === boss.id) continue;
    const dx = c.pos.x - boss.pos.x;
    const dy = c.pos.y - boss.pos.y;
    const dSq = dx * dx + dy * dy;
    if (dSq > maxRangeSq) continue;
    if (best === null || dSq < bestSq || (dSq === bestSq && (c.id as number) < (best.id as number))) {
      best = c;
      bestSq = dSq;
    }
  }
  return best;
}

/**
 * PURE — is `pos` inside the cone of half-angle `cosHalf` around `axis`, apex at `apex`?
 *
 * Exported so the geometry is testable without a world. See the file docblock for why this is a
 * squared dot-product test and not `Math.acos`.
 */
export function inCone(
  apex: { x: number; y: number },
  axis: { x: number; y: number },
  pos: { x: number; y: number },
  cosHalf: number,
  rangeSq: number,
): boolean {
  const tx = pos.x - apex.x;
  const ty = pos.y - apex.y;
  const tSq = tx * tx + ty * ty;
  if (tSq > rangeSq) return false;
  // The apex itself is inside every cone — a unit standing exactly on the Kraken is hit.
  if (tSq === 0) return true;
  const aSq = axis.x * axis.x + axis.y * axis.y;
  if (aSq === 0) return false; // no axis ⇒ no cone (a degenerate wave hits nothing)
  const dot = tx * axis.x + ty * axis.y;
  // ⛔ THE POSITIVE-DOT GUARD IS LOAD-BEARING. Squaring both sides loses the sign, so without this
  // the cone's mirror image BEHIND the Kraken would pass too — he would spit backwards as well.
  if (dot <= 0) return false;
  return dot * dot >= cosHalf * cosHalf * tSq * aSq;
}

/**
 * ⭐⭐ THE WAVE. Host-only, on a cadence, phase-spread by boss id.
 *
 * ⚠ PHASE-SPREAD BY ID, never by an accumulated remainder — `(world.tick + id) % INTERVAL`, the
 * idiom the direwolf pack and the Archdemon teleport already use. Two Krakens on the board fire on
 * different ticks instead of in lockstep, and the cadence is derived from `world.tick` so a
 * mid-match host migration can neither skip nor double a wave.
 */
export function runKrakenSonar(world: World): void {
  if (world.gameState !== 'PLAYING') return;
  const rangeSq = KRAKEN_SONAR_RANGE * KRAKEN_SONAR_RANGE;

  for (const bossId of liveIdsOfType(world, T9_BOSS_TYPE.nagas)) {
    const boss = world.creatures.get(bossId);
    if (boss === undefined || boss.ehp <= 0) continue;
    /*
     * ⭐ S169 R152 — A STUNNED KRAKEN DOES NOT SPIT. The same rule every other boss skill follows,
     * and it matters most here: without it two Krakens could stun-lock each other into a pair of
     * statues that still cleared the board every nine seconds.
     */
    if (isStunned(boss, world.tick)) continue;
    if ((world.tick + (bossId as number)) % KRAKEN_SONAR_INTERVAL_TICKS !== 0) continue;

    // The axis is the provoking target — see the docblock. No target in reach ⇒ no wave.
    const aim = nearestEnemyFor(world, boss, rangeSq);
    if (aim === null) continue;
    const axis = { x: aim.pos.x - boss.pos.x, y: aim.pos.y - boss.pos.y };

    /*
     * ⚠ ORDERED SWEEP. The victims are collected by ascending id before anything is mutated, so the
     * set of units hit cannot depend on `Map` iteration order — and so the impulse written to one
     * unit can never change whether the next one qualifies (it cannot today, since the test reads
     * only positions, but a later reader adding a displacement inside the loop would not notice).
     */
    const victims: CreatureId[] = [];
    for (const c of world.creatures.values()) {
      if (c.ownerPlayerId === boss.ownerPlayerId) continue; // ⭐ enemies only — never his own escort
      if (c.ehp <= 0) continue;
      if (c.id === bossId) continue;
      if (!inCone(boss.pos, axis, c.pos, KRAKEN_SONAR_COS_HALF_ANGLE, rangeSq)) continue;
      victims.push(c.id);
    }
    victims.sort((a, b) => (a as number) - (b as number));

    for (const vid of victims) {
      const v = world.creatures.get(vid);
      if (v === undefined) continue;
      applyStun(v, world.tick + KRAKEN_SONAR_STUN_TICKS);

      /*
       * THE SHOVE, away from the Kraken. Direction is the victim's own bearing from the apex, not
       * the cone axis — a unit at the cone's edge is pushed outward rather than sideways, which is
       * what a wave front does.
       *
       * ⚠ `prevPos` MOVES, NOT `pos`. See the docblock: velocity here is `pos - prevPos`, so
       * dragging `prevPos` toward the Kraken hands the victim outward velocity and it SLIDES.
       */
      const dx = v.pos.x - boss.pos.x;
      const dy = v.pos.y - boss.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0) continue; // exactly on the apex: no direction to push, so no shove
      const ux = dx / d;
      const uy = dy / d;
      v.prevPos.x -= ux * KRAKEN_SONAR_KNOCKBACK;
      v.prevPos.y -= uy * KRAKEN_SONAR_KNOCKBACK;
    }
  }
}
