/**
 * SPARK — S195 T19 (owner N4) · **WHO HEARS HELGA.**
 *
 * > *"only if Helga is attacking your units or … it's your Helga attacking someone's units, you two should be
 * > able to hear. The other players shouldn't … she's fucking too loud … I think it's like that now, but I'm
 * > not sure. Just verify."* — owner, S195
 *
 * VERIFIED S195: it was NOT like that. Both of her sounds played on every peer that was not fogged —
 *   · her THEME (`audioManager.updateHelgaTheme`) switched on for ANY engaged Helga on the board, by design
 *     (S112: *"Both peers evaluate the SAME pure predicate … they switch together"* — written for a 1v1,
 *     where both seats are always the two involved);
 *   · her SLAP (`princessRenderer`, `playSlapSFX` on the synced FIRE edge) played wherever she was visible.
 * In a 4-seat match seats 1 and 2 heard seat 3's Helga fighting seat 4's goblins. This helper is the one
 * answer both triggers now ask, so they cannot drift apart again (`helgaAudience.test.ts` pins both).
 *
 * THE AUDIENCE OF ONE HELGA = her OWNER's seat + the seat whose unit she is on. The victim's seat is read
 * off the synced `targetCreatureId` (→ `creature.ownerPlayerId`) and REMEMBERED per Helga in a render-local
 * memo, because a one-shot kill removes the victim on the FIRE tick itself (the wire-split lesson:
 * `Defender.lastStrikePos` exists for the same reason) — the slap must still reach the seat that just lost
 * the unit. The memo clears when she returns to IDLE / goes DORMANT, so a stale victim never leaks into her
 * next fight. ⚠ MINE: teammates are NOT in the audience (the owner's wording names two seats; teams are
 * N1/T12's — if he wants a team to hear its Helga, widen `helgaInvolvesSeat` with the team predicate).
 *
 * RENDER-ONLY, every input is synced state every peer already holds. Nothing written, no bump.
 */
import type { PlayerId } from '../../types.ts';

/** The slice of a defender both triggers read. Structural, so `audioManager`'s decoupled view fits. */
export interface HelgaAudienceDefender {
  /** Optional only for the pre-S195 decoupled theme views; every real defender has one. */
  readonly id?: unknown;
  readonly kind: string;
  readonly state: string;
  readonly targetCreatureId: unknown;
  readonly ownerPlayerId?: PlayerId;
}

export interface HelgaAudienceWorld {
  readonly defenders: ReadonlyMap<unknown, HelgaAudienceDefender>;
  readonly creatures?: ReadonlyMap<unknown, { readonly ownerPlayerId: PlayerId }>;
}

/** Per-Helga memory of the last victim's seat (render-local; a renderer or the audio module owns one each). */
export type HelgaVictimMemo = Map<unknown, PlayerId>;

/**
 * The seat whose unit this Helga is on right now, or was on until the victim died this exchange; `null`
 * when she is home (IDLE with no target) or dead (DORMANT). Updates `memo` as a side effect.
 */
export function helgaVictimSeat(world: HelgaAudienceWorld, d: HelgaAudienceDefender, memo: HelgaVictimMemo): PlayerId | null {
  if (d.state === 'DORMANT' || (d.state === 'IDLE' && (d.targetCreatureId === null || d.targetCreatureId === undefined))) {
    memo.delete(d.id);
    return null;
  }
  if (d.targetCreatureId !== null && d.targetCreatureId !== undefined) {
    const victim = world.creatures?.get(d.targetCreatureId);
    if (victim !== undefined) {
      memo.set(d.id, victim.ownerPlayerId);
      return victim.ownerPlayerId;
    }
  }
  return memo.get(d.id) ?? null;
}

/** Is `seat` one of the two seats that should hear this Helga? (Owner N4.) */
export function helgaInvolvesSeat(
  world: HelgaAudienceWorld, d: HelgaAudienceDefender, seat: PlayerId, memo: HelgaVictimMemo,
): boolean {
  const victim = helgaVictimSeat(world, d, memo); // always resolved, so the memo tracks her whole exchange
  if (d.ownerPlayerId === seat) return true;
  return victim === seat;
}
