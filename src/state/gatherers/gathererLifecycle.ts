/**
 * SPARK — V6-1.1 gatherer lifecycle reducers.
 *
 * Mirrors the creature/hunter/defender lifecycle shape: pure case-body helpers consumed by
 * world.ts dispatch. ONE action in V6-1.1:
 *   BUY_GATHERER — a CLIENT INTENT. Spends GATHERER_PRICE victory points from the buyer's own
 *                  scoreByPlayer (ONE POOL — spending sets you back) and mints one gatherer at
 *                  the buyer's keep. Host-authoritative: a joiner's intent routes here on the host.
 *
 * The gatherer is static in V6-1.1 (parked at the keep, cosmetically shapeshifting via a
 * renderer-only pure fn of (tick, gathererId)). Roaming/hauling + the bank are later slots.
 */

import { GATHERER_PRICE } from '../../constants.ts';
import { asGathererId, type PlayerId } from '../../types.ts';
import { spendScore } from '../gameMode.ts';
import type { World } from '../worldTypes.ts';
import { castleAnchor, makeGatherer } from './gatherer.ts';

export interface BuyGathererAction {
  readonly type: 'BUY_GATHERER';
  readonly playerId: PlayerId;
}

/**
 * Buy one gatherer from the placeholder keep. No-op (NOT an error) when the player is missing or
 * cannot afford it — the affordability guard is load-bearing: nothing downstream clamps a negative
 * score, and the buy button already dims when unaffordable. New gatherers fan out beside the keep
 * (deterministic, count-based) so they do not perfectly overlap.
 */
export function applyBuyGatherer(world: World, action: BuyGathererAction): World {
  const buyer = world.players.get(action.playerId);
  if (buyer === undefined) return world;
  const score = world.scoreByPlayer.get(action.playerId) ?? 0;
  if (score < GATHERER_PRICE) return world; // cannot afford → no-op, never a negative score
  spendScore(world, action.playerId, GATHERER_PRICE);

  let owned = 0;
  for (const g of world.gatherers.values()) if (g.ownerPlayerId === action.playerId) owned++;
  const anchor = castleAnchor(action.playerId as unknown as number);
  const id = asGathererId(world.nextGathererId++);
  world.gatherers.set(
    id,
    makeGatherer({
      id,
      ownerPlayerId: action.playerId,
      pos: {
        x: anchor.x + ((owned % 4) * 26 - 39),
        y: anchor.y + 38 + Math.floor(owned / 4) * 26,
      },
      spawnedAtTick: world.tick,
    }),
  );
  return world;
}

/** Clear the gatherer population + reset the mint counter (teardown parity, all sites). */
export function teardownGatherers(world: World): void {
  world.gatherers.clear();
  world.nextGathererId = 0;
}
