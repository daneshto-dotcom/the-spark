/**
 * SPARK — S149 P2: **THE ONE QUESTION EVERY BUILD GATE ASKS.**
 *
 * *"you can build during fight stage … there is no split"* — owner playtest.
 *
 * ## Why this module exists rather than six phase checks
 *
 * S149 P1 had just finished collapsing six independent legality calls onto one shared predicate
 * (`zones.canBuildAt`), because six copies of a rule is how the drag ghost ends up promising what
 * the host refuses. Adding `matchPhase !== 'BUILD'` at each of those six sites would have
 * re-created the identical problem one session later, in the identical shape.
 *
 * So legality is composed HERE, once, and the six gates ask this instead:
 *
 *   WHERE — is this the seat's own ground?  (`zones.canBuildAt`, the partition)
 *   WHEN  — is it the BUILD stage?          (`world.matchPhase`, the S147 clock)
 *
 * ## Why it lives in its own file
 *
 * It cannot go in `zones.ts`: that module is deliberately `World`-free (it takes a bare
 * `ZoneLayout`), and `worldTypes.ts` already imports `ZoneLayout` from it — so a `World` import
 * there would close an import cycle. Keeping the composition in a leaf module that depends on both
 * is the cheapest way to have one rule without inverting that dependency.
 *
 * ## Not a hazard gate
 *
 * This governs the PLAYER's ability to place. It says nothing about what already stands: structures
 * built during BUILD persist through the FIGHT and are the whole point of building them.
 */

import type { PlayerId, Vec2 } from '../types.ts';
import { canBuildAt } from './zones.ts';
import type { World } from './worldTypes.ts';

/**
 * ⭐ MAY `seat` PLACE AT `pos`, RIGHT NOW?
 *
 * Fails CLOSED on every ambiguity, inheriting `canBuildAt`'s refusals (the shared quarry, a seat
 * with no ground) and adding the phase.
 *
 * ⚠ THE PHASE TEST IS `!== 'BUILD'`, NOT `=== 'FIGHT'`. `MatchPhase` is a two-member union today
 * and the two spellings are equivalent — but only one of them stays SAFE when a third phase is
 * added (a PREP or SUDDEN-DEATH stage would silently become buildable under the `=== 'FIGHT'`
 * form). Building is permitted in exactly one named phase; everything else refuses.
 */
export function canBuildNow(world: World, pos: Vec2, seat: PlayerId): boolean {
  if (world.matchPhase !== 'BUILD') return false;
  return canBuildAt(pos, seat, world.layout);
}
