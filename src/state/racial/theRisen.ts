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
 * counts: not a Voltkin, not Helga (a DEFENDER, never a killer here), not a pencil chewer,
 * not a goblin, even when the zombie seat owns it. That is his *"so not like Voltkin or Helga or
 * Pencil Chewers"*, and it is the same ownership-AND-type shape as the orcs' BLOOD FRENZY ruling.
 *
 * The VICTIM is any ENEMY creature — including a PANTS (owner 255, everyone's enemy; owner S194 *"of
 * course"*) — and, since S194, an enemy HELGA (`riseOnHelgaKill`, called from `damageEntity`'s defender arm). The spawn is ONE `raceUnit` at the zombie seat's castle, through
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
 * ## ⭐⭐ S192 (owner T2) — EVERY WAY A ZOMBIE KILLS RAISES ONE
 *
 * > *"every zombie that kills another unit, doesn't matter if it's through an explosion, through an
 * > ability, or through … physical damage, that creates a regular zombie from the castle. I mean,
 * > that's their strength."* — owner, S192
 *
 * This OVERRIDES the "area" and "raze" halves of S188's MINE call below for a zombie's own explosion:
 * the boss's death blast is now ladder damage that decides lethality (`zombieDeathBlast.ts`), and it
 * passes the credit `{ seat: his owner, type: zombie boss }` captured when he died, so the boss being
 * gone does not matter. The credit is resolved at the blow (`racial/killCredit.ts`), never re-read here.
 * Melee, the CORPSE EATER bite and the rot aura already named the boss and already raised.
 *
 * ⚠ MINE — READING A, pending his confirmation: "every zombie" = the seat's three RACIAL types, his S187
 * *"so not like Voltkin or Helga or Pencil Chewers"*. `THE_RISEN_ANY_SEAT_UNIT` is the one-line lever
 * that widens it to every unit the seat owns (Reading B) — OFF until he says so.
 *
 * ## ⚠ WHAT THIS DOES NOT SEE, STATED RATHER THAN DISCOVERED (all MINE)
 *
 * · A kill with no creature attacker — the castle gun, a raid — has nobody to credit. They are not
 *   zombies, so T2 does not reach them, and they raise nobody.
 * · A splash with no named dealer (a hub, a drone, a bag) credits nobody, whoever owns it.
 * · A Pharaoh who enters his Ra ritual has not died (`damageCreature` returns false for him); when
 *   the ritual ends he is removed with no attacker. Neither moment raises a zombie.
 * · A kill made by a zombie that is itself a corpse-in-waiting this tick DOES count: its committed
 *   blow landing is the whole point of the deferral.
 */

import type { Creature, CreatureType } from '../creatures/creature.ts';
import type { World } from '../worldTypes.ts';
import type { KillCredit } from './killCredit.ts';
import type { PlayerId } from '../../types.ts';
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
 * ⚠ MINE (S192 T2) — THE READING-B LEVER, OFF. `false` = Reading A: only the three racial types
 * (`isZombieRacialType`) raise, his S187 words. `true` = every creature the seat owns that is CREDITED
 * with a kill (a named attacker or an explicit blast credit) raises — his S192 "every zombie" read
 * literally. ⚠ Flipping it does not make an UNNAMED splash (a hub, a drone, a bag) credit anyone; those
 * pass no credit today. Do not flip it without his answer.
 */
export const THE_RISEN_ANY_SEAT_UNIT = false;

/**
 * Called once per creature death, at the moment lethality is first decided. Queues ONE castle
 * zombie for the credited seat when every condition in the docblock holds (Council A5: born after
 * the sweep, never inside the strike batch). ⭐ S192 — the credit is plain data captured at the blow,
 * so the killer need no longer be alive.
 */
export function riseOnKill(world: World, victim: Creature, credit: KillCredit): void {
  riseForVictimOf(world, victim, credit);
}

/**
 * ⭐⭐ S194 (T8, owner B) — HELGA FALLING RAISES ONE TOO. *"should Helga dying raise a zombie? … Might as
 * well. … it's just one zombie."* She is a DEFENDER, not a creature, so `riseOnKill` never saw her: her
 * death is the `'defender'` arm of `damageEntity`, which calls this on the ONE blow that takes her pool to
 * 0 (she then goes DORMANT with `ehp: null`, immune to every further blow, so a pile-on cannot raise a
 * second). Her hall re-summoning her at the next phase edge is a new life, and a new kill raises again.
 * The SAME guards as any creature kill (enemy only, a typed racial credit, `zombies.l0`), so his S187
 * "not like … Helga" — Helga as a KILLER — is untouched: she is the victim here.
 */
export function riseOnHelgaKill(world: World, helgaOwner: PlayerId, credit: KillCredit): void {
  riseForVictimOf(world, { ownerPlayerId: helgaOwner }, credit);
}

/**
 * The one rule both deaths share: a victim (only its owner is read), a blow credited to `credit`. Takes the
 * owner as `ownerPlayerId` so the S193 owner-predicate census (`endgameS193.test.ts`) still SEES this site.
 */
function riseForVictimOf(world: World, victim: Pick<Creature, 'ownerPlayerId'>, credit: KillCredit): void {
  if (credit === null) return;
  if (credit.seat === victim.ownerPlayerId) return; // an ENEMY kill only — his own units never raise
  // ⭐ S193 — a SEAT credit (castle gun, raid, Ra, scorch, hub, tower: `type: null`) raises nobody, under
  // Reading A AND with the lever on — the stat board's credit must never become a sim rule.
  if (credit.type === null) return;
  if (!THE_RISEN_ANY_SEAT_UNIT && !isZombieRacialType(credit.type)) return;
  const seat = world.players.get(credit.seat);
  if (seat === undefined || !seatHoldsPerk(seat, 'zombies.l0')) return;
  const owner = credit.seat;
  queueAfterStrike(world, () => {
    spawnRaceUnitAtCastle(world, owner);
  });
}
