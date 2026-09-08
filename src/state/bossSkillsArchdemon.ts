/**
 * SPARK — S168 (owner R150) — THE ARCHDEMON'S TWO SKILLS.
 *
 * > *"Archdemon skills 1) any enemy around the archdemon radius that drops below 5% health is taken
 * > to hell. (the ground opens beneath him and the hand of Lucifer comes out and pulls him into the
 * > flames of hell, then the ground closes. 2) He can teleport around the map to his targets every
 * > 7 sec allowing him to move from targets to targets. He always targets creatures that have the
 * > least amount of their own teammates around him - essentially targeting lone targets and trying
 * > to destroy them and take them to hell."*
 *
 * ⭐ The two halves are ONE design and it is worth saying so: the teleport hunts stragglers, and a
 * straggler with no allies nearby is exactly the thing that gets ground down to 5% and swallowed.
 * He is a predator on isolation, not a brawler.
 */

import {
  ARCHDEMON_HELL_RADIUS,
  ARCHDEMON_HELL_THRESHOLD_PCT,
  ARCHDEMON_LONELINESS_RADIUS,
  ARCHDEMON_TELEPORT_INTERVAL_TICKS,
} from '../constants.ts';
import { liveIdsOfType } from './bossSkills.ts';
import { maxPoolFifths } from './damageOverTime.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
// S169 R152 — a stunned Archdemon neither drags anyone to hell nor teleports.
import { isStunned } from './creatures/creature.ts';
import type { CreatureId } from '../types.ts';
import type { World } from './world.ts';

/**
 * ⭐⭐ **TAKEN TO HELL.**
 *
 * ⭐ IT IS AN EXECUTE, NOT DAMAGE, AND THAT IS WHY IT COSTS NOTHING ARITHMETICALLY. Every other
 * percentage this session had to be checked for integrality, because `damageEntity` throws on a
 * fractional amount by design and float accumulators are banned. This one is a THRESHOLD —
 * `ehp * 100 < max * 5`, an integer comparison — and the victim is then REMOVED outright, so no
 * damage number is ever produced and no rounding rule is needed.
 *
 * ⚠ THE CINEMATIC IS DELIBERATELY NOT HERE. The entity is GONE the instant this runs, which in this
 * codebase is precisely when an animation belongs to the RENDERER and not to the sim — the same
 * client-local pattern as the tower crumble and the unit corpses. Nothing in the sim reads it, so it
 * cannot desync, and it therefore needs no `GameEffect` kind and no protocol bump. The hand of
 * Lucifer is an ART deliverable (R143), not a wire change.
 *
 * ⚠ Victims are collected, SORTED, then removed. Deleting inside the scan would mutate the map being
 * iterated.
 */
export function runArchdemonHell(world: World): void {
  if (world.gameState !== 'PLAYING') return;
  const rSq = ARCHDEMON_HELL_RADIUS * ARCHDEMON_HELL_RADIUS;

  for (const demonId of liveIdsOfType(world, T9_BOSS_TYPE.demons)) {
    const demon = world.creatures.get(demonId);
    if (demon === undefined || demon.ehp <= 0) continue;
    /*
     * ⭐⭐ S169 (owner R152) — A STUNNED BOSS TAKES NO ACTION. Owner: *"cant do anything"*.
     *
     * Placed beside the corpse guard because it is the same kind of statement: a boss who cannot act
     * does not act. The stun is also the ONLY counterplay a player has against a boss, so leaving
     * the skills running would make it cosmetic on the one unit it matters most against.
     *
     * ⚠ `runWarlordRage` is DELIBERATELY NOT gated — rage is a LATCH over the boss's own health, not
     * an action he takes. See `stunGates.test.ts`, which asserts that exception explicitly.
     */
    if (isStunned(demon, world.tick)) continue;

    const doomed: CreatureId[] = [];
    for (const [id, c] of world.creatures) {
      if (id === demonId) continue;
      if (c.ownerPlayerId === demon.ownerPlayerId) continue; // "any ENEMY around"
      if (c.ehp <= 0) continue;
      if (c.ehp * 100 >= maxPoolFifths(c.type) * ARCHDEMON_HELL_THRESHOLD_PCT) continue;
      const dx = c.pos.x - demon.pos.x;
      const dy = c.pos.y - demon.pos.y;
      if (dx * dx + dy * dy <= rSq) doomed.push(id);
    }
    doomed.sort((a, b) => (a as number) - (b as number));
    for (const id of doomed) world.creatures.delete(id);
  }
}

/**
 * ⭐⭐ **THE TELEPORT, AND THE TARGETING RULE THAT IS THE REAL FEATURE.**
 *
 * *"He always targets creatures that have the least amount of their own teammates around him -
 * essentially targeting lone targets"*.
 *
 * ⭐ EVERY OTHER ACQUISITION SCAN IN THIS CODEBASE PICKS THE NEAREST THING. This one picks the most
 * ISOLATED: for each candidate, count how many of ITS OWN allies stand within
 * `ARCHDEMON_LONELINESS_RADIUS`, and take the minimum. That single inversion is what makes him feel
 * like a predator rather than another melee boss, and it is why the ruling spends a whole sentence
 * on it.
 *
 * ⚠ TOTAL ORDER, THREE DEEP — fewest allies, then squared distance to the demon, then an explicit id
 * compare. Two levels alone still leave ties, and a tie resolved by `Map` insertion order is how
 * S155 N1 handed one seat every melee exchange for an entire match.
 *
 * ⚠ COST: the ally count is O(n²) over live creatures. Bounded in practice (`GOBLIN_MAX_GLOBAL` is
 * 200) and it runs once every `ARCHDEMON_TELEPORT_INTERVAL_TICKS` — 420 ticks — per Archdemon, not
 * every tick. Written plainly rather than indexed, because a spatial hash here would be a second
 * source of truth for positions.
 */
export function runArchdemonTeleport(world: World): void {
  if (world.gameState !== 'PLAYING') return;
  const lonelySq = ARCHDEMON_LONELINESS_RADIUS * ARCHDEMON_LONELINESS_RADIUS;

  for (const demonId of liveIdsOfType(world, T9_BOSS_TYPE.demons)) {
    const demon = world.creatures.get(demonId);
    if (demon === undefined || demon.ehp <= 0) continue;
    /*
     * ⭐⭐ S169 (owner R152) — A STUNNED BOSS TAKES NO ACTION. Owner: *"cant do anything"*.
     *
     * Placed beside the corpse guard because it is the same kind of statement: a boss who cannot act
     * does not act. The stun is also the ONLY counterplay a player has against a boss, so leaving
     * the skills running would make it cosmetic on the one unit it matters most against.
     *
     * ⚠ `runWarlordRage` is DELIBERATELY NOT gated — rage is a LATCH over the boss's own health, not
     * an action he takes. See `stunGates.test.ts`, which asserts that exception explicitly.
     */
    if (isStunned(demon, world.tick)) continue;
    if ((world.tick + (demonId as number)) % ARCHDEMON_TELEPORT_INTERVAL_TICKS !== 0) continue;

    let best: { id: CreatureId; allies: number; distSq: number } | null = null;
    for (const [id, c] of world.creatures) {
      if (id === demonId) continue;
      if (c.ownerPlayerId === demon.ownerPlayerId) continue;
      if (c.ehp <= 0) continue;

      let allies = 0;
      for (const [otherId, other] of world.creatures) {
        if (otherId === id) continue;
        if (other.ownerPlayerId !== c.ownerPlayerId) continue; // "their OWN teammates"
        const ax = other.pos.x - c.pos.x;
        const ay = other.pos.y - c.pos.y;
        if (ax * ax + ay * ay <= lonelySq) allies++;
      }

      const dx = c.pos.x - demon.pos.x;
      const dy = c.pos.y - demon.pos.y;
      const distSq = dx * dx + dy * dy;
      const better =
        best === null ||
        allies < best.allies ||
        (allies === best.allies && distSq < best.distSq) ||
        (allies === best.allies && distSq === best.distSq && (id as number) < (best.id as number));
      if (better) best = { id, allies, distSq };
    }
    if (best === null) continue;

    const victim = world.creatures.get(best.id);
    if (victim === undefined) continue;

    demon.pos.x = victim.pos.x + 40; // beside him, so the two sprites do not perfectly overlap
    demon.pos.y = victim.pos.y;
    /*
     * ⛔ `prevPos` MOVES WITH HIM, and forgetting this is the whole bug. The verlet integrator
     * derives velocity from `pos - prevPos`, so a teleport that leaves `prevPos` behind hands him a
     * velocity equal to the whole jump and flings him back across the map on the very next step.
     */
    demon.prevPos.x = demon.pos.x;
    demon.prevPos.y = demon.pos.y;
    demon.targetCreatureId = best.id;
  }
}
