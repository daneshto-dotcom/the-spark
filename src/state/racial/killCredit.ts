/**
 * SPARK — S192 (owner T2) — **WHO GETS THE KILL, CAPTURED AT THE BLOW.**
 *
 * > *"every zombie that kills another unit, doesn't matter if it's through an explosion, through an
 * > ability, or through … physical damage, that creates a regular zombie from the castle."* — owner, S192
 *
 * THE RISEN used to re-read the killer from `world.creatures` at the death decision. That cannot see a
 * kill whose dealer is already gone — the zombie boss's death blast is the case he reported (*"he killed
 * like 10 … it didn't produce the 10 zombies"*): the blast fires a tick AFTER he died. So the credit is
 * resolved once, at the blow, into plain data — a seat and a creature type — and carried to the hook.
 *
 * ⚠ CREDIT IS NOT THE ATTACKER. Retaliation and lifesteal keep reading the live `DamageAttacker`, so a
 * dead boss heals nobody and is turned on by nobody; only THE RISEN reads this.
 *
 * A leaf module (type imports only), so `damage.ts` and `creatureLifecycle.ts` can import it without a
 * cycle through the racial mechanics.
 */
import type { CreatureType } from '../creatures/creature.ts';
import type { DamageAttacker } from '../damage.ts';
import type { CreatureId, PlayerId } from '../../types.ts';
import type { World } from '../worldTypes.ts';

/**
 * The seat and the unit type a blow is credited to. `null` = nobody.
 *
 * ⭐ S193 (BLAST-2 fold, merge-owner ruling: ONE attribution seam) — `type` is `null` when a SEAT dealt the
 * blow with no creature: the castle gun, a raid, a Ra column, burning ground, the lightning hub's blast
 * (`{ kind: 'seat' }` attackers) and a tower. Two readers: the end-of-match stat board reads `seat` (DEALT /
 * KILLS, inert — no reducer reads `World.matchStats`), and THE RISEN, which ignores a typeless credit
 * (`riseOnKill`'s first guard), so a seat credit can never raise a zombie under either reading.
 */
export type KillCredit = { readonly seat: PlayerId; readonly type: CreatureType | null } | null;

/**
 * The credit for a blow dealt by creature `id`, read from the LIVE attacker at the moment of the blow.
 * A creature already gone by then credits nobody — the same verdict THE RISEN gave before S192.
 */
export function creatureKillCredit(world: World, id: CreatureId): KillCredit {
  const c = world.creatures.get(id);
  return c === undefined ? null : { seat: c.ownerPlayerId, type: c.type };
}

/**
 * ⭐ S193 — the credit for ANY attacker, at the blow: a creature is `creatureKillCredit`; a tower is its
 * owner's seat (no type); a `{ kind: 'seat' }` is that seat (no type). A creature or tower already gone
 * credits nobody — the hit still counts as TAKEN on the board.
 */
export function killCreditOf(world: World, attacker: DamageAttacker): KillCredit {
  if (attacker === null) return null;
  switch (attacker.kind) {
    case 'creature':
      return creatureKillCredit(world, attacker.id);
    case 'defender': {
      const d = world.defenders.get(attacker.id);
      return d === undefined ? null : { seat: d.ownerPlayerId, type: null };
    }
    case 'seat':
      return { seat: attacker.seat, type: null };
  }
}
