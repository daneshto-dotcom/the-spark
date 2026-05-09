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

import { SPARK_VISUAL_SIZE, type SparkType } from '../constants.ts';
import type { BondId, PlayerId, PrimitiveId, Vec2 } from '../types.ts';
import { v2copy } from '../types.ts';
import type { Spark } from './spark.ts';

export interface Primitive {
  readonly id: PrimitiveId;
  readonly type: SparkType;
  readonly placerColor: number;
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
}

export function makePrimitiveFromSpark(args: {
  id: PrimitiveId;
  spark: Spark;
  placerColor: number;
  placedBy: PlayerId;
  tick: number;
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
  };
}
