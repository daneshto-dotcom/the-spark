/**
 * SPARK — S191 (owner item 1b) — **A BOT DEMON SCORCHES TOO.**
 *
 * The draft's deadline takes the racial pick for every bot (`autoPickFor`), so every bot demons seat
 * holds SCORCHED GROUND — and with it the aimed SCORCHED EARTH. A skill the bot never USES is a bot
 * silently weaker than the human it replaces (the POWER OF RA bot's reasoning, `botRa.ts`), so it casts.
 *
 * ## ⛔ SYNCED STATE IN, AN INTENT OUT — AND NOTHING THE BOT REMEMBERS
 *
 * The host's `BotManager` and the worker's must produce the SAME cast on the SAME tick. This reads the
 * seat's own record, the phase and the synced scores, and imposes a total order on its choice (score,
 * then seat id), so there is no controller-private state to diverge after a worker adoption or a host
 * migration. It needs no RNG at all.
 *
 * ## ⚠ ALL MINE, NONE THE OWNER'S (the brief's default, flagged)
 *
 *  · WHO: the zone of the ENEMY seat with the HIGHEST score — the leader is the seat the rest of the
 *    table most needs slowed. Ties go to the lowest seat id. Only a target the reducer would take
 *    (`scorchedEarthTargetZone`: at the table, its zone on this board, its castle standing).
 *  · WHEN: at its first look in each FIGHT. The scorch lasts until the FIGHT ends, so every tick it
 *    waits is burn it throws away.
 *  · HOW OFTEN it looks: `BOT_SCORCH_EVAL_EVERY_TICKS`, phase-spread by seat (Ra's cadence).
 *  · It never scorches its OWN zone (the double is a human's call to make).
 *  · ⭐ S193 (owner R192-T1) — nor a TEAMMATE's: "the highest-scoring ENEMY" means not on its team. In a
 *    free-for-all `sameTeam(world, other, seat)` is exactly the old `other === seat`.
 */

import type { PlayerId } from '../types.ts';
import type { GameAction, World } from '../state/world.ts';
import { scorchedEarthCastRefusal, scorchedEarthTargetZone } from '../state/racial/scorchedEarthRules.ts';
import { sameTeam } from '../state/teams.ts';

/** How often a bot looks, in ticks (twice a second), phase-spread by seat. ⚠ MINE — Ra's cadence. */
export const BOT_SCORCH_EVAL_EVERY_TICKS = 30;

/** The seat a bot would scorch, or null: the highest-scoring legal enemy, ties to the lowest seat. */
export function botScorchTarget(world: World, seat: PlayerId): PlayerId | null {
  let best: { seat: PlayerId; score: number } | null = null;
  const seats = [...world.players.keys()].sort((a, b) => Number(a) - Number(b));
  for (const other of seats) {
    if (sameTeam(world, other, seat)) continue; // its own seat, or a teammate (R192-T1)
    if (scorchedEarthTargetZone(world, other) === null) continue;
    const score = world.scoreByPlayer.get(other) ?? 0;
    // Strictly greater only: seats are visited in id order, so a tie keeps the lower seat.
    if (best === null || score > best.score) best = { seat: other, score };
  }
  return best === null ? null : best.seat;
}

/** The CAST_SCORCHED_EARTH a bot seat should send THIS tick, or null. Pure; never mutates the world. */
export function botScorchedEarthAction(world: World, seat: PlayerId): GameAction | null {
  const s = seat as unknown as number;
  if (world.tick % BOT_SCORCH_EVAL_EVERY_TICKS !== s % BOT_SCORCH_EVAL_EVERY_TICKS) return null;
  if (scorchedEarthCastRefusal(world, seat) !== null) return null;
  const target = botScorchTarget(world, seat);
  if (target === null) return null;
  return { type: 'CAST_SCORCHED_EARTH', playerId: seat, zoneSeat: target };
}
