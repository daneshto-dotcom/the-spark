/**
 * SPARK — S188 — THE ONE PLACE A CREATURE'S DEATH REACHES THE RACIAL MECHANICS.
 *
 * `damageCreature` (`creatures/creatureLifecycle.ts`) calls `onCreatureDeathDecided` exactly once
 * per death: at the moment lethality is decided for the FIRST time. That is the branch the
 * Pharaoh's Ra ritual already treats as "about to die" (S171 R142), for the reasons its docblock
 * gives — once, immune to overkill, and safe under a same-tick pile-on.
 *
 * ⛔ WHY "THE FIRST TIME" HAS TO BE SAID. Under the S155 N1 deferral a lethally-struck creature
 * stays in the map until the end-of-tick sweep, and `damageCreature` has no already-dead guard, so
 * a second lethal blow the same tick re-enters the death branch. The caller dedupes on the deferral
 * set: an id already in it has already died once this tick.
 *
 * Everything here only QUEUES (`queueAfterStrike`, Council A5): nothing is inserted into
 * `world.creatures` while the strike batch is iterating it.
 */

import type { Creature } from '../creatures/creature.ts';
import type { CreatureId } from '../../types.ts';
import type { World } from '../worldTypes.ts';
import { riseOnKill } from './theRisen.ts';
import { hellspawnOnDeath } from './hellspawn.ts';

export function onCreatureDeathDecided(
  world: World,
  victim: Creature,
  killerId: CreatureId | null,
): void {
  // ORDER IS FIXED AND DETERMINISTIC (both queue, FIFO): the killer's zombie, then the victim's split.
  riseOnKill(world, victim, killerId); // zombies.l0 — THE RISEN
  hellspawnOnDeath(world, victim); // demons.l5 — HELLSPAWN
}
