/**
 * SPARK — S188 — THE RISEN (`zombies.l0`): every enemy your zombies kill rises at your castle.
 *
 * > *"any character that your … zombie characters kill … any racial characters kill. So not like
 * > Voltkin or Helga or Pencil Chewers … Every unit you kill is spawned like a one, one, one, one
 * > zombie from the castle."* — owner, S187
 *
 * ## ⭐ WHO COUNTS AS THE KILLER — HIS WORDS, ENFORCED BY TYPE
 *
 * The KILLER must be one of the zombie seat's RACIAL creatures: the castle's own soldier
 * (`raceUnit` — one literal for all six races, so ownership is what makes it a zombie), the zombie
 * tier-3 unit (`RACE_TOWER_UNIT.zombies`, the hound) and the zombie tier-9 boss. ⛔ Nothing global
 * counts: not a Voltkin, not Helga (a DEFENDER — she never reaches this path), not a pencil chewer,
 * not a goblin, even when the zombie seat owns it. That is his *"so not like Voltkin or Helga or
 * Pencil Chewers"*, and it is the same ownership-AND-type shape as the orcs' BLOOD FRENZY ruling.
 *
 * The VICTIM is any ENEMY creature. The spawn is ONE `raceUnit` at the zombie seat's castle, through
 * the castle emitter's own spawn (`spawnRaceUnitAtCastle`) — so it carries the seat's draft buffs and
 * shelters / releases like every castle soldier.
 *
 * ## ⛔ THE KILL SIGNAL IS "LETHALITY DECIDED FOR THE FIRST TIME", NOT `damageEntity` RETURNING TRUE
 *
 * `damageCreature` has no already-dead guard: under the S155 N1 deferral a lethally-struck creature
 * stays in `world.creatures` until the sweep, so a SECOND lethal blow the same tick re-enters the
 * death branch and returns `true` again (S187's W1 lane E verified it, with the rot aura as a live
 * second source). Hanging the spawn off `died` would raise TWO zombies from ONE corpse. The caller
 * (`racialDeaths.ts`) fires only on the first entry, which the deferral set itself dedupes.
 *
 * ## ⚠ WHAT THIS DOES NOT SEE, STATED RATHER THAN DISCOVERED (all MINE)
 *
 * · A kill with no creature attacker — the castle gun, a raid, area damage — has nobody to credit.
 *   `DamageAttacker` is `null` on those paths by S183's ruling, so they raise nobody.
 * · A RAZE is not a kill. The zombie boss's own R138 death blast is `applyRadialClear`, which
 *   deletes through `removeCreature` without ever deciding lethality — and it is owner-AGNOSTIC
 *   (*"hurting everything"*, including his own side) and fired by a boss that is already dead.
 * · A Pharaoh who enters his Ra ritual has not died (`damageCreature` returns false for him); when
 *   the ritual ends he is removed with no attacker. Neither moment raises a zombie.
 * · A kill made by a zombie that is itself a corpse-in-waiting this tick DOES count: its committed
 *   blow landing is the whole point of the deferral.
 */

import type { Creature, CreatureType } from '../creatures/creature.ts';
import type { CreatureId } from '../../types.ts';
import type { World } from '../worldTypes.ts';
import { RACE_TOWER_UNIT } from '../raceTowerIds.ts';
import { T9_BOSS_TYPE } from '../t9BossIds.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { spawnRaceUnitAtCastle } from '../raceUnitEmit.ts';
import { queueAfterStrike } from './racialTick.ts';

/** True for the three creature types that are a zombie seat's RACIAL units (see the docblock). */
export function isZombieRacialType(type: CreatureType): boolean {
  return type === 'raceUnit' || type === RACE_TOWER_UNIT.zombies || type === T9_BOSS_TYPE.zombies;
}

/**
 * Called once per creature death, at the moment lethality is first decided. Queues ONE castle
 * zombie for the killer's seat when every condition in the docblock holds (Council A5: born after
 * the sweep, never inside the strike batch).
 */
export function riseOnKill(world: World, victim: Creature, killerId: CreatureId | null): void {
  if (killerId === null) return;
  const killer = world.creatures.get(killerId);
  if (killer === undefined) return;
  if (killer.ownerPlayerId === victim.ownerPlayerId) return; // an ENEMY kill only
  if (!isZombieRacialType(killer.type)) return;
  const seat = world.players.get(killer.ownerPlayerId);
  if (seat === undefined || !seatHoldsPerk(seat, 'zombies.l0')) return;
  const owner = killer.ownerPlayerId;
  queueAfterStrike(world, () => {
    spawnRaceUnitAtCastle(world, owner);
  });
}
