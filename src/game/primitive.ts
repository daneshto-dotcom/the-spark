/**
 * SPARK — placed primitive (a spark committed to a structure).
 * § 10.1 LOCKED: every Phase-1 primitive carries the full Phase-2 schema
 * from day 1 — placerColor, createdTick, bonds, ownerColor,
 * lastOwnershipChange. Skipping any forces a Phase-2 rewrite.
 *
 * § VI.5 immobility: pos is conceptually `readonly` post-commit; only the
 * physics layer (bond solver / collision) mutates it. Object.freeze is NOT
 * applied because it would freeze pos and break the bond solver.
 */

import { PRIMITIVE_MAX_HP, SPARK_VISUAL_SIZE, type SparkType } from '../constants.ts';
// TYPE-ONLY, and it must stay that way: `godlyRecipes/types.ts` imports `World`, so a VALUE
// import here would close a primitive -> types -> world -> primitive cycle. `import type` is
// erased before any of that can happen (the same posture `blueprints.ts` takes).
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import type { BondId, PlayerId, PrimitiveId, Vec2 } from '../types.ts';
import { v2copy } from '../types.ts';
import type { Spark } from './spark.ts';

/**
 * S152 (R13/R19/R21) — BLUEPRINT PROVENANCE: which stamped structure this shape is a node OF.
 *
 * ## Why this is STORED, when three derivations were tried first
 *
 * FIX has to answer "what did this structure LOSE?", and a lost primitive leaves NOTHING behind:
 * `razePrimitives` deletes it together with every bond incident to it. The only surviving evidence
 * of the original bill is what the SURVIVORS remember. Three ways to avoid remembering were
 * examined, and all three are unsound:
 *
 *   • **Multiset-subset match** — ask which blueprint's bill is a superset of the surviving shapes.
 *     A 4-Triangle remnant is a superset-match for BOTH `pentagram` (5 Triangles) and `voltkin`
 *     (4 Squares + 4 Triangles). FIX would "repair" half a voltkin into a pentagram.
 *   • **Subgraph match** — add the bond topology. A 4-node Triangle PATH is still a subgraph of the
 *     5-Triangle pentagram RING (drop one ring node and the ring opens into exactly that path), so
 *     that pair stays ambiguous even with edges.
 *   • **(placedBy, createdTick) run + id contiguity** — a stamp really does mint consecutive ids on
 *     one tick. But the base id is unrecoverable once node 0 dies, and a star's leaves are all one
 *     type, so many candidate bases type-check; and it collapses entirely if two stamps for one
 *     seat ever land on the same tick.
 *
 * ## Why it rides the PRIMITIVE rather than a `world.structures` side table
 *
 * Provenance dies with the shape it describes. A side table keyed by `PrimitiveId` would have to be
 * swept inside `razePrimitives` — a silent site with no compile pressure — and a stale entry there
 * is exactly the double-count R21 forbids ("SCRAP returns only the shapes still standing"). Carried
 * on the primitive, R21 is STRUCTURAL rather than arithmetical: a destroyed shape is not in
 * `world.primitives`, therefore not in the component, therefore it cannot be counted, returned or
 * repaired around. There is no subtraction to get wrong.
 *
 * `null` on every hand-placed shape — which is most of them, and is why FIX refuses on a freeform
 * structure (there is no bill to restore it TO) while SCRAP still works on one.
 *
 * ⚠ FOUR SITES: this type + `makePrimitiveFromSpark` below; `SerializedPrimitive` +
 * `serializePrimitive` + the deserialize projection in `save.ts`; and BOTH the `PrimitiveHashed`
 * union AND the hand-written hash template in `stateHashFull.ts`. Only the hash UNION has a tsc
 * tripwire (`_primComplete`) — the serializer and the template are hand-maintained mirrors.
 */
export interface PrimitiveOrigin {
  /** The blueprint whose bill this shape was stamped from. */
  readonly blueprintId: GodlyId;
  /** This shape's index into that blueprint's `nodes` — the slot FIX re-mints if it dies. */
  readonly nodeIndex: number;
}

export interface Primitive {
  readonly id: PrimitiveId;
  readonly type: SparkType;
  /**
   * S75 P3 — MUTABLE (was readonly): the rainbow colour-shuffle remaps a player's whole
   * structure empire to a new colour (rainbowLifecycle.applyTriggerRainbow), exactly as
   * ownerColor is mutable on a Steal. Set once at placement otherwise — no other writer.
   * Territory + cross-colour bond segregation compare this to player.color, so it must
   * track the owner's current colour after a shuffle.
   */
  placerColor: number;
  readonly placedBy: PlayerId;
  readonly createdTick: number;
  /** Mutable for bond physics; only the physics layer touches this. */
  pos: Vec2;
  prevPos: Vec2;
  /** Adjacency for sever BFS (§ VIII.4). */
  bonds: Set<BondId>;
  /** Mutable on Steal disruption (Phase 2); = placerColor in Phase 1. */
  ownerColor: number;
  lastOwnershipChange: number;
  /** Soft-collision radius (matches the spark's radius). */
  readonly radius: number;
  /**
   * S138 P1 — remaining hit points, `PRIMITIVE_MAX_HP` at placement. Mutated ONLY through
   * `state/damage.ts damageEntity`; at ≤ 0 the primitive is razed via `razePrimitives`.
   *
   * REQUIRED (not `hp?`) on purpose: an optional field forces `hp ?? PRIMITIVE_MAX_HP` at every
   * read site, and the one that gets forgotten is the bug. The wire stays cheap anyway —
   * `serializePrimitive` emits it ONLY when damaged, the same trick `serializeCreature` uses.
   */
  hp: number;
  /**
   * S152 — non-null ONLY on a shape stamped by `applyBuildBlueprint`. See `PrimitiveOrigin` above.
   * REQUIRED (not `origin?`) for the same reason `hp` is: an optional field forces a `?? null` at
   * every read site, and the one that gets forgotten is the bug. The wire stays cheap anyway —
   * `serializePrimitive` emits it only when non-null.
   */
  origin: PrimitiveOrigin | null;
}

export function makePrimitiveFromSpark(args: {
  id: PrimitiveId;
  spark: Spark;
  placerColor: number;
  placedBy: PlayerId;
  tick: number;
  /** S152 — blueprint provenance; omitted (⇒ null) for every hand-placed shape. */
  origin?: PrimitiveOrigin | null;
}): Primitive {
  return {
    id: args.id,
    type: args.spark.type,
    placerColor: args.placerColor,
    placedBy: args.placedBy,
    createdTick: args.tick,
    pos: v2copy(args.spark.pos),
    prevPos: v2copy(args.spark.pos), // zero velocity at placement
    bonds: new Set(),
    ownerColor: args.placerColor,
    lastOwnershipChange: args.tick,
    radius: Math.max(8, SPARK_VISUAL_SIZE[args.spark.type] * 0.45),
    hp: PRIMITIVE_MAX_HP, // S138 P1 — full health at placement
    origin: args.origin ?? null, // S152 — null unless a blueprint stamp says otherwise
  };
}
