/**
 * SPARK — ⭐ S193 BLAST-2 — **WHO DID THIS, FOR THE STAT BOARD. A THIN ADAPTER, NOT A SECOND SEAM.**
 *
 * The merge owner's S193 ruling: there is ONE attribution seam, and it is `s192/zombies`' `KillCredit`
 * (`racial/killCredit.ts` on that branch: `{ seat, type: CreatureType } | null`, resolved at the blow and
 * carried to THE RISEN). That branch lands before this one but is not on master yet, so this file is the
 * stat board's reading of the same idea, shaped as that type WIDENED: `type` may be `null`, because most
 * sources the board credits have a seat and no creature — the castle gun, a raid, a Ra column, burning
 * ground, the lightning hub's blast (all `{ kind: 'seat' }` attackers).
 *
 * ⛔ NON-SIM. Only `matchStats` writers read it (through `damage.ts`), and `World.matchStats` is inert —
 * no reducer reads it. Retaliation, lifesteal and THE RISEN keep reading the live `DamageAttacker`.
 *
 * ── THE FOLD, when s192/zombies is on master (the merge owner's instruction; nothing here pre-empts it) ──
 *  1. Delete this file. In `racial/killCredit.ts` widen `type` to `CreatureType | null` and add
 *     `killCreditOf(world, attacker)` = this function's body (its creature arm IS `creatureKillCredit`).
 *  2. `damage.ts`: `attackerSeat(world, attacker)` becomes `blow?.seat ?? null`, where `damageEntity`
 *     resolves `const blow = credit !== undefined ? credit : killCreditOf(world, attacker)` ONCE, at the top
 *     — so an EXPLICIT credit (the zombie boss's death blast) reaches the board too (DEALT + KILLS for his
 *     seat, which today credit nobody). `damageConnector` / `damageStinkCloud` read `killCreditOf` directly.
 *  3. ⛔ THE RISEN must stay byte-identical: `riseOnKill` gains `if (credit.type === null) return;` BEFORE
 *     the `THE_RISEN_ANY_SEAT_UNIT` lever. Under Reading A (lever off) a `null` type already fails
 *     `isZombieRacialType`; with the lever ON it would otherwise raise a zombie for a castle-gun kill.
 *  4. `zombieDeathBlast.ts`: its connector arm passes `{ kind: 'seat', seat: owner }` (not `null`) so the
 *     board credits it, and its sever goes through `severWithCarry(…, { kind: 'seat', seat: owner })`
 *     (master's S191 carry rule, which that branch must adopt at its own merge anyway).
 *  5. Re-pin the two call-site censuses; add a zombie-death-blast case to `matchStats.blast2.test.ts`.
 */
import type { CreatureType } from './creatures/creature.ts';
import type { DamageAttacker } from './damage.ts';
import type { PlayerId } from '../types.ts';
import type { World } from './worldTypes.ts';

/** The seat a blow is credited to, and — when a creature struck — its type. `null` = nobody. */
export type StatCredit = { readonly seat: PlayerId; readonly type: CreatureType | null } | null;

/**
 * Resolved from the LIVE attacker at the moment of the blow. A creature or tower already gone by then
 * credits nobody: the hit still counts as TAKEN (the S191 rule, unchanged).
 */
export function statCreditOf(world: World, attacker: DamageAttacker): StatCredit {
  if (attacker === null) return null;
  switch (attacker.kind) {
    case 'creature': {
      const c = world.creatures.get(attacker.id);
      return c === undefined ? null : { seat: c.ownerPlayerId, type: c.type };
    }
    case 'defender': {
      const d = world.defenders.get(attacker.id);
      return d === undefined ? null : { seat: d.ownerPlayerId, type: null };
    }
    case 'seat':
      return { seat: attacker.seat, type: null };
  }
}
