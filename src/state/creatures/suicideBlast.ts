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
 * separately *"the area of effect on the drones is larger then terrorist goblin"*.
 *
 * ⭐ **AND S158 P3b SETTLED THE HALF R77 LEFT OPEN.** S158 P3 shipped this blast dealing one ordinary
 * goblin strike to shapes, flagged as *"one number here is mine and the owner should rule on it"* —
 * because 4 atk / 0 pen is a UNIT stat and says nothing about a 1000-hit-point shape. They ruled:
 *
 * > *"the 4atk against units + 4 atk against structures/structur connectors"*
 *
 * Three targets, ONE number. Units and connectors are both on the fifths ladder, so both are
 * `attackFifths(4, 0)` = 20 fifths. Shapes are not, so `primitiveDamageForAtk` bridges the two scales
 * from the anchor that already existed (a goblin's 2 atk is 167 shape points, i.e. six swings), which
 * puts this blast at 334 — **three blasts fell a shape**.
 *
 * So he is no longer merely WIDE: at 20 fifths he one-shots most of the roster, and at 20 fifths
 * against a connector he cuts anything in a component of 16 or fewer. He is a real bomb now, which
 * is what the ruling says, and he still pays with his life.
 *
 * ## Determinism
 *
 * All of it comes from `applyRadialDamage`, which collects victims, sorts them by id and only then
 * mutates — the iteration discipline the replay guards depend on. No RNG, no wall clock. The
 * `BOMB_EXPLODE` effect is already wire-mirrored, so this adds **zero wire surface and needs no
 * `PROTOCOL_VERSION` bump**: `SUICIDE_BLAST` is host-internal, exactly like `DRONE_EXPLODE`.
 */

import {
  GOBLIN_SUICIDE_ATK,
  GOBLIN_SUICIDE_PEN,
  GOBLIN_SUICIDE_BLAST_RADIUS,
} from '../../constants.ts';
import type { BondId, CreatureId } from '../../types.ts';
import { applyRadialDamage, damageConnector } from '../damage.ts';
import { attackFifths, primitiveDamageForAtk } from '../stats.ts';
import { dispatch, type World } from '../world.ts';

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
    primitiveDamageForAtk(GOBLIN_SUICIDE_ATK), // ⭐ S158 P3b — the owner's 4 atk, on the shape scale
    SUICIDE_BLAST_UNIT_FIFTHS,
    'creature',
    bomber.ownerPlayerId,
  );

  /*
   * ⭐ S158 P3b (owner) — **AND THE CONNECTORS.**
   *
   * Owner: *"the 4atk against units + 4 atk against structures/structur connectors"*. Three targets,
   * one number. Units and shapes are handled by the radial call above; connectors are not, and
   * deliberately so — `applyRadialDamage`'s own note refuses a connector arm because *"making area
   * damage sever bonds directly would be a large new behaviour nobody asked for — one potato could
   * shred a fortress"*. That reasoning stands for area damage IN GENERAL. It does not stand against
   * an explicit ruling about THIS unit, so the arm lives here, on the one creature the owner named,
   * rather than being pushed down into the shared helper where it would silently arm everything.
   *
   * ⚠ `damageConnector` RETURNS "SHOULD SEVER" AND DOES NOT SEVER — severance must run through the
   * one SEVER_BOND path, which splits topology and emits its effects in the right order. Re-dispatching
   * from inside a reducer is the Council-sanctioned pattern `applyDroneExplode` and `applyCreatureAttack`
   * already use, and JS being single-threaded makes the synchronous re-entry safe.
   *
   * Collected before mutating, and enemy-only by the same `placedBy` rule the raid arm uses: a bond
   * has no owner field, so ownership is read off the primitives it joins.
   */
  const blastFifths = attackFifths(GOBLIN_SUICIDE_ATK, GOBLIN_SUICIDE_PEN);
  const r2 = GOBLIN_SUICIDE_BLAST_RADIUS * GOBLIN_SUICIDE_BLAST_RADIUS;
  const hitBonds: BondId[] = [];
  for (const [bondId, bond] of world.bonds) {
    const aOwner = world.primitives.get(bond.aId)?.placedBy;
    const bOwner = world.primitives.get(bond.bId)?.placedBy;
    if (aOwner === bomber.ownerPlayerId || bOwner === bomber.ownerPlayerId) continue; // spare its own
    const mx = (bond.a.pos.x + bond.b.pos.x) / 2;
    const my = (bond.a.pos.y + bond.b.pos.y) / 2;
    const dx = mx - cx;
    const dy = my - cy;
    if (dx * dx + dy * dy <= r2) hitBonds.push(bondId);
  }
  // Sorted so the severance order is a total order and cannot depend on Map iteration.
  hitBonds.sort((a, b) => (a as unknown as number) - (b as unknown as number));
  for (const bondId of hitBonds) {
    if (!world.bonds.has(bondId)) continue; // a sibling sever already took it
    if (damageConnector(world, bondId, blastFifths)) {
      dispatch(world, { type: 'SEVER_BOND', bondId, playerId: bomber.ownerPlayerId, cause: 'creature' });
    }
  }

  world.creatures.delete(action.creatureId);
  return world;
}
