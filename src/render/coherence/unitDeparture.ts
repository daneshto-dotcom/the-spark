/**
 * SPARK — S194 T9 COHERENCE · **ONE ANSWER TO "DID THAT UNIT DIE?", SHARED BY EVERY RENDERER THAT ASKS.**
 *
 * Owner, S194: *"you … should have everything more … consistent and … cohesive and mindful of each other
 * and coherent."*
 *
 * A creature leaves `world.creatures` on the tick its pool empties, so no renderer ever SEES a death — it
 * sees an id go missing and has to decide what that meant. Before this file four renderers each decided on
 * their own, and they disagreed:
 *
 * | consumer | expiry (last seen DESPAWNING) | mass clear (match reset) | inside the fog |
 * |---|---|---|---|
 * | `creatureRenderer` Voltkin zap | quiet ✓ | quiet (PLAYING guard) ✓ | quiet ✓ |
 * | `chewerRenderer` goo splat | quiet ✓ | quiet ✓ | quiet ✓ |
 * | `damageNumbers` killing-blow number | ⛔ **printed a red number** | ⛔ **printed one per unit** | ⛔ **printed through the fog** |
 * | the new death beat (`unitDeathFx`) | — | — | — |
 *
 * Measured on master `18560cd8` before this file: a Voltkin whose lifetime ran out printed a red **"40"**
 * as if something had killed it, and a match reset with five goblins on the board printed five "30"s.
 * The structure path of the same file had been fixed for exactly the mass-clear case in S182
 * (`structureWatchEpoch`); the creature path beside it had not — two siblings in one file, one fixed.
 *
 * ⭐ THE RULE, IN ONE PLACE. A departure is a **kill** only when all four hold:
 *   1. the creature was last seen in a live state — `DESPAWNING` is the lifecycle's own fade-out, and a
 *      unit that ran it out did not die, it left (S104 P1's discriminator, now shared, not copied);
 *   2. the match is being played (`gameState === 'PLAYING'`) — a title return is not a massacre;
 *   3. no mass clear happened since it was last seen (`world.structureWatchEpoch`, which every
 *      `world.creatures.clear()` site that is not a snapshot rebuild already bumps — S182);
 *   4. the local player is entitled to see the spot (`isConcealed`, owner S170: *"You shouldn't see
 *      anything in their zone"*) — the rule `healthBar`, `effectsRenderer` and both death watchers apply.
 *
 * ⛔ `src/render/coherence/unitDeparture.census.test.ts` counts the production call sites of
 * `classifyCreatureDeparture` and pins them, and it fails if a render file grows its own
 * `!== 'DESPAWNING'` vanish test instead of calling this one. The two T2-owned renderers that still carry a
 * private copy (`chewerRenderer`, `goblinRenderer`) are allow-listed BY NAME there, so routing them to this
 * helper is a one-line change the merge owner can make and the census will notice.
 *
 * RENDER-ONLY. Every input is synced state every peer already holds; nothing is written. No bump.
 */

import type { CreatureState } from '../../state/creatures/creature.ts';
import type { World } from '../../state/world.ts';
import type { PlayerId } from '../../types.ts';
import { isConcealed } from '../concealment.ts';

/** What a vanished creature's departure was. Only `'killed'` earns a death beat or a killing-blow number. */
export type CreatureDeparture = 'killed' | 'expired' | 'offstage' | 'concealed';

/** The last observation a watcher kept of a creature before it vanished. */
export interface CreatureLastSeen {
  readonly state: CreatureState;
  readonly x: number;
  readonly y: number;
  readonly owner: PlayerId;
}

/**
 * Classify a creature that was in `world.creatures` last frame and is not now.
 *
 * ⚠ The mass-clear case (rule 3) is not decided here, because it needs the watcher's own memory of the
 * epoch: a watcher drops its whole map when `world.structureWatchEpoch` moves (see `CreatureWatchEpoch`),
 * so a cleared creature never reaches this function at all.
 */
export function classifyCreatureDeparture(world: World, last: CreatureLastSeen): CreatureDeparture {
  if (last.state === 'DESPAWNING') return 'expired';
  if (world.gameState !== 'PLAYING') return 'offstage';
  if (isConcealed(last.x, last.y, last.owner)) return 'concealed';
  return 'killed';
}

/**
 * Rule 3 as a tiny latch every creature watcher owns one of. `moved(world)` is true exactly once per mass
 * clear, and the watcher answers it by dropping its map WITHOUT emitting anything.
 */
export class CreatureWatchEpoch {
  private seen: number | null = null;

  moved(world: World): boolean {
    const now = world.structureWatchEpoch;
    if (this.seen === null) {
      this.seen = now;
      return false;
    }
    if (now === this.seen) return false;
    this.seen = now;
    return true;
  }
}
