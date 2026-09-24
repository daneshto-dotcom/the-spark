/**
 * SPARK — S188 — DEEP CURRENT (nagas L0): THE GATHERER TELEPORTS HOME WITH ITS SHAPE.
 *
 * > *"allows their gatherers to teleport back to base. So they will go to get a shape and then they
 * > will teleport back to base rather than having to walk all the way back … we actually have
 * > teleportation already."* — owner, S187
 *
 * ## ⭐ ONE LINE OF THE HAUL CHANGES, AND NOTHING ELSE
 *
 * `applyGathererTick`'s HAULING leg walks the cargo home with `stepToward`. For a seat holding the
 * perk, that walk is replaced by this snap onto the deposit point — the exact point the walk was
 * heading for — and it reports ARRIVED, so the leg's existing code runs unchanged in the same tick:
 * the cargo is slaved to the new position (its `pos` AND `prevPos` — the verlet trap the Archdemon's
 * blink documents, where a teleport that left `prevPos` behind hands a body a velocity equal to the
 * whole jump), then `depositIntoCastle` lifts it out of `freeSparks`, then back to SEEKING. ⭐ So the
 * trap cannot bite here at all: the shape leaves the world on the very tick it arrives, and no
 * physics substep ever sees it at the far end. The outbound walk to the quarry is untouched: *"they
 * will go to get a shape"*.
 *
 * ⚠ A GATHERER HAS NO `prevPos` — it is not a verlet body, its position is written directly each tick
 * (`stepToward`) — so the snap is `pos` alone. `tickGathererShelter` already snaps a gatherer home
 * the same way at the BUILD edge; this is that move, one leg earlier.
 *
 * ⚠ MINE: the snap happens on the first HAULING tick, i.e. one tick after the claim, so the shape is
 * seen in the gatherer's hands at the quarry for a tick before it vanishes. The vortex at both ends
 * is drawn by `render/gathererRenderer.ts`, derived from the position jump on every peer.
 *
 * No new field, no wire change, no hash change: the perk is read from `Player.draftPicks` and every
 * position written here is already synced and hashed.
 */

import { seatHoldsPerk } from '../racialPerks.ts';
import type { World } from '../worldTypes.ts';
import type { Gatherer } from '../gatherers/gatherer.ts';
import type { Vec2 } from '../../types.ts';

/**
 * If this gatherer's seat holds DEEP CURRENT, put it on `home` and return true (ARRIVED). Otherwise
 * touch nothing and return false, so the caller falls through to the walk.
 */
export function deepCurrentSnap(world: World, g: Gatherer, home: Vec2): boolean {
  const owner = world.players.get(g.ownerPlayerId);
  if (owner === undefined || !seatHoldsPerk(owner, 'nagas.l0')) return false;
  g.pos.x = home.x;
  g.pos.y = home.y;
  return true;
}
