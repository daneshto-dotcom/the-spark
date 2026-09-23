/**
 * SPARK — S188 — SCORCHED GROUND (demons L0): YOUR WHOLE TERRITORY BURNS.
 *
 * > *"their quadrant … if it's a four player, then it's a quarter of the map. If it's a two player
 * > game, it's half … does damage over time. Anyone who goes into their lands gets a debuff …
 * > burning hell … the same mechanic as our zombie boss, two percent of their total HP per second
 * > that they're there."* — owner, S187
 *
 * ## ⭐ TWO SHIPPED PIECES, JOINED — nothing new is invented
 *
 *  · **WHERE**: `zoneOf(pos) === zoneOwner(seat)` — the partition the build reducer already treats as
 *    authoritative (`zones.ts`). ⛔ NOT the retired radius `isInsideEnemyTerritory`. The shared quarry
 *    belongs to nobody (`zoneOf` returns null there), so it never burns.
 *  · **HOW MUCH**: the zombie aura's mechanic, `damageOverTime.ts`, used UNCHANGED (Council G4): the
 *    tick always deals exactly ONE fifth and the RATE carries the percentage, phase-spread by the
 *    victim's own id, so a crowd does not pulse and stepping out and back in cannot dodge a tick.
 *    **20 per-mille** — his 2 %, not the boss's 2.5 %. A uniform 50 s to burn anything to death,
 *    whatever its size: the "fair" he asked for when he ruled the aura R138.
 *
 * ## THE CALLS THAT ARE MINE
 *
 *  · **Enemy CREATURES only.** Not the seat's own units, not gatherers (canon §4: nothing can touch
 *    them), not Helga, not structures.
 *  · **FIGHT only** — it runs in `racialTick.ts`'s FIGHT slot beside the boss auras, for the reason
 *    that slot is gated: nothing may be attacked during BUILD (R5).
 *  · **`damageEntity(…, 1, 'aura', null)`** — `'aura'` because it is exactly the zombie aura's kind of
 *    damage; attacker `null` because burning ground is not an entity: nobody retaliates against it
 *    and nobody lifesteals from it. `damage.callSites.test.ts` records it among the `null` sites.
 *  · Inside the strike batch's death deferral, so a unit burned to death this tick still lands its
 *    committed blow and is removed by the same sweep as everything else.
 *
 * No new field, no wire change, no hash change: the perk is read from `Player.draftPicks`, the zone
 * from `World.layout` and the position from `Creature.pos` — all already synced and hashed. The ember
 * look is derived from the same picks on every peer (`render/zoneBackgroundRenderer.ts`).
 */

import { dotDueThisTick } from '../damageOverTime.ts';
import { damageEntity } from '../damage.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { zoneOf, zoneOwner } from '../zones.ts';
import type { World } from '../worldTypes.ts';
import type { CreatureId, PlayerId } from '../../types.ts';

/** ⭐ OWNER, S187 — *"two percent of their total HP per second"*, per-mille so it is an integer. */
export const SCORCHED_GROUND_PER_MILLE = 20;

/** The zone each SCORCHED GROUND seat owns, in seat order. Empty when nobody holds it. */
export function scorchedZones(world: World): Array<{ seat: PlayerId; zone: number }> {
  const out: Array<{ seat: PlayerId; zone: number }> = [];
  const seats = [...world.players.keys()].sort((a, b) => Number(a) - Number(b));
  for (const seat of seats) {
    const pl = world.players.get(seat);
    if (pl === undefined || !seatHoldsPerk(pl, 'demons.l0')) continue;
    const zone = zoneOwner(seat as unknown as number, world.layout);
    if (zone !== null) out.push({ seat, zone });
  }
  return out;
}

/** One FIGHT tick of SCORCHED GROUND. */
export function runScorchedGround(world: World): void {
  const zones = scorchedZones(world);
  if (zones.length === 0) return;
  for (const { seat, zone } of zones) {
    const victims: CreatureId[] = [];
    for (const [id, c] of world.creatures) {
      if (c.ownerPlayerId === seat) continue; // "anyone who goes into THEIR lands" — enemies only
      if (c.ehp <= 0) continue; // already dead this tick, awaiting the sweep
      if (zoneOf(c.pos, world.layout) !== zone) continue;
      if (!dotDueThisTick(world.tick, id as number, c.type, SCORCHED_GROUND_PER_MILLE)) continue;
      victims.push(id);
    }
    // Total order before mutating: damage can remove a creature, so the scan finishes first.
    victims.sort((a, b) => (a as number) - (b as number));
    for (const id of victims) damageEntity(world, { kind: 'creature', id }, 1, 'aura', null);
  }
}
