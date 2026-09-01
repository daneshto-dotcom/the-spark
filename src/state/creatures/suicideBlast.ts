/**
 * SPARK — S158 P3: **THE TERRORIST GOBLIN'S BLAST, WHICH IT NEVER HAD.**
 *
 * ## The defect (CF-S157-e, found by review, not by the owner)
 *
 * `GOBLIN_SUICIDE_CONFIG` sets **both** `selfExplode: true` and `targetsStructures: true`. The host
 * tick tested `selfExplode` FIRST, so the suicide goblin fell into the lightning-drone's branch and
 * inherited the drone's entire identity:
 *
 *   | the config says | what actually happened |
 *   |---|---|
 *   | navigates to enemy STRUCTURES (`targetsStructures`) | homed on enemy **connectors** |
 *   | 4 ATK / 0 PEN "in an area of effect" (owner R77) | **dealt no damage at all** — `applyDroneExplode` severs bonds and never reads atk/pen |
 *   | `GOBLIN_SUICIDE_BLAST_RADIUS` 70 px, deliberately smaller than the drone's | used `DRONE_EXPLODE_RADIUS` 110 px |
 *   | one unit, one blow | severed up to `DRONE_MAX_CONNECTORS` bonds |
 *
 * Every stat the owner dictated for this unit applied to nothing. The `else if` that made this
 * possible was written when no creature was ever both — the flag pair had no overlap until the
 * goblin roster landed — so nothing was wrong at the time and nothing failed when it became wrong.
 *
 * ## What this is, and what it deliberately is NOT
 *
 * Owner R77, verbatim: *"only one attack that deals 4atk and 0 pierce in an area of effect"*, and
 * separately *"the area of effect on the drones is larger then terrorist goblin"*. So the blast is a
 * **stat-driven radial hit**, not a connector sever — that is the drone's identity and the two units
 * are meant to be siblings, not clones. Connectors still go when their shapes die, through the
 * ordinary cascade inside `damageEntity`, which is the coherent way for a bomb to take them.
 *
 * ⚠ **ONE NUMBER HERE IS MINE AND THE OWNER SHOULD RULE ON IT.** R77 gives 4 ATK / 0 PEN, which is a
 * *unit* stat; it says nothing about what one blast does to a SHAPE. Rather than invent a balance
 * number, the blast deals `GOBLIN_DAMAGE_VS_PRIMITIVE` — **exactly one ordinary goblin strike** —
 * to every enemy shape in radius. So the suicide goblin is not stronger per target than its cousins;
 * it is WIDE, and it pays with its life. That is the conservative reading, it reuses an owner-ruled
 * constant instead of minting one, and it is flagged rather than silently decided.
 *
 * ## Determinism
 *
 * All of it comes from `applyRadialDamage`, which collects victims, sorts them by id and only then
 * mutates — the iteration discipline the replay guards depend on. No RNG, no wall clock. The
 * `BOMB_EXPLODE` effect is already wire-mirrored, so this adds **zero wire surface and needs no
 * `PROTOCOL_VERSION` bump**: `SUICIDE_BLAST` is host-internal, exactly like `DRONE_EXPLODE`.
 */

import {
  GOBLIN_DAMAGE_VS_PRIMITIVE,
  GOBLIN_SUICIDE_ATK,
  GOBLIN_SUICIDE_PEN,
  GOBLIN_SUICIDE_BLAST_RADIUS,
} from '../../constants.ts';
import type { CreatureId } from '../../types.ts';
import { applyRadialDamage } from '../damage.ts';
import { attackFifths } from '../stats.ts';
import type { World } from '../world.ts';

/**
 * The unit half of the blast, on the stat ladder. Named rather than inlined so the two damage scales
 * cannot be confused at the call site: `applyRadialDamage` takes a 1000-per-shape amount and a
 * fifths amount ADJACENTLY, and swapping them typechecks silently.
 */
const SUICIDE_BLAST_UNIT_FIFTHS = attackFifths(GOBLIN_SUICIDE_ATK, GOBLIN_SUICIDE_PEN);

/** Action shape — exported so world.ts can compose GameAction. Host-internal (NOT a client INTENT). */
export interface SuicideBlastAction {
  readonly type: 'SUICIDE_BLAST';
  readonly creatureId: CreatureId;
}

/**
 * The terrorist goblin detonates: one radial hit centred on itself, then it is gone.
 *
 * ⚠ `sparePlayerId` is the goblin's OWNER, so a bomb never harms the side that sent it — the same
 * contract every other area hazard in the game holds, and the reason `applyRadialDamage` takes the
 * spare rather than a "friendly fire" flag.
 *
 * ⚠ THE CREATURE IS REMOVED LAST, AND ON PURPOSE. `applyRadialDamage` reads `world.creatures` to
 * find unit victims; removing the goblin first would be harmless today (it spares its own owner
 * anyway) and would silently become a bug the moment someone allowed self-damage. Removing last also
 * keeps `pos` valid for the whole call.
 *
 * No-op (idempotent) if the creature is already gone — the stale-fan-out defence `applyDroneExplode`
 * documents, for the same reason: the host tick iterates a snapshot of the id list.
 */
export function applySuicideBlast(world: World, action: SuicideBlastAction): World {
  const bomber = world.creatures.get(action.creatureId);
  if (bomber === undefined) return world;
  const cx = bomber.pos.x;
  const cy = bomber.pos.y;

  // Burst visual — emitted BEFORE the damage, mirroring applyDroneExplode so the two detonations
  // read identically on the wire and in the renderer. The radius carries the goblin's OWN 70 px, so
  // the drawn blast is finally the size the owner asked for.
  world.effects.push({
    kind: 'BOMB_EXPLODE',
    tick: world.tick,
    pos: { x: cx, y: cy },
    radius: GOBLIN_SUICIDE_BLAST_RADIUS,
  });

  applyRadialDamage(
    world,
    cx,
    cy,
    GOBLIN_SUICIDE_BLAST_RADIUS,
    GOBLIN_DAMAGE_VS_PRIMITIVE, // one ordinary goblin strike per shape — see the note above
    SUICIDE_BLAST_UNIT_FIFTHS,
    'creature',
    bomber.ownerPlayerId,
  );

  world.creatures.delete(action.creatureId);
  return world;
}
