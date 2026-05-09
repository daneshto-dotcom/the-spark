/**
 * SPARK — world state + dispatch seam.
 * § 10.2 LOCKED: every world mutation routes through `dispatch(world, action)`.
 * Phase 1 calls it locally; Phase 3 swaps in `await dispatchOverNetwork(action)`
 * with the same call sites. Actions are JSON-serialisable (IDs only, no refs).
 *
 * State is mutated in place — `dispatch` returns the same world object for
 * call-site ergonomics. The seam is the function-call boundary, not
 * structural immutability.
 */

import { lookupCombo } from '../combos.ts';
import {
  ENERGY_PER_SECOND_FLAT,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  type StiffnessTier,
} from '../constants.ts';
import { type GameEffect } from '../game/effects.ts';
import { snapPrevPosForUnbonded } from '../game/invariants.ts';
import { makePrimitiveFromSpark, type Primitive } from '../game/primitive.ts';
import { severSplit } from '../game/structure.ts';
import {
  CarryViolation,
  drop as fsmDrop,
  makeIdlePlayer,
  pickup as fsmPickup,
  tickBuildAction,
  tickEnergy,
  type Player,
} from '../game/player.ts';
import type { Spark } from '../game/spark.ts';
import type { Bond } from '../physics/bonds.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  type BondId,
  type PlayerId,
  type PrimitiveId,
  type SparkId,
  type Vec2,
} from '../types.ts';

export type GameState = 'PLAYING' | 'WIN' | 'POSTGAME';

export interface World {
  tick: number;
  rngSeed: number;
  freeSparks: Map<SparkId, Spark>;
  primitives: Map<PrimitiveId, Primitive>;
  bonds: Map<BondId, Bond>;
  players: Map<PlayerId, Player>;
  /** Soft cache of primitives ordered by id for determinism. */
  gameState: GameState;
  /** Monotonic counter for primitive IDs. */
  nextPrimitiveId: number;
  /** Monotonic counter for bond IDs. */
  nextBondId: number;
  /** Telemetry / debug — not persisted. */
  lastWinnerId: PlayerId | null;
  /**
   * Visual effect queue — the renderer drains this each frame. NOT
   * persisted by save.ts (the snapshot's serializer enumerates fields
   * explicitly). Bounded by lifetime via the renderer's age check, so
   * worst-case it grows for one POSTGAME pause then drains.
   */
  effects: GameEffect[];
}

export type GameAction =
  | { readonly type: 'SPAWN_SPARK'; readonly spark: Spark }
  | { readonly type: 'DESPAWN_SPARK'; readonly sparkId: SparkId }
  | { readonly type: 'PICKUP_SPARK'; readonly sparkId: SparkId; readonly playerId: PlayerId }
  | { readonly type: 'DROP_SPARK'; readonly playerId: PlayerId; readonly pos: Vec2 }
  | {
      readonly type: 'PLACE_PRIMITIVE';
      readonly playerId: PlayerId;
      readonly targetPrimitiveId: PrimitiveId | null;
      readonly stiffnessTier: StiffnessTier;
    }
  | { readonly type: 'SEVER_BOND'; readonly bondId: BondId }
  | { readonly type: 'TICK_ENERGY'; readonly playerId: PlayerId; readonly deltaSec: number }
  | { readonly type: 'WIN_TRIGGER'; readonly winnerId: PlayerId };

export function makeWorld(rngSeed: number): World {
  const w: World = {
    tick: 0,
    rngSeed,
    freeSparks: new Map(),
    primitives: new Map(),
    bonds: new Map(),
    players: new Map(),
    gameState: 'PLAYING',
    nextPrimitiveId: 0,
    nextBondId: 0,
    lastWinnerId: null,
    effects: [],
  };
  // Phase 1: solo player, P1 only.
  const p1 = makeIdlePlayer(asPlayerId(0), 0xff3b6b);
  w.players.set(p1.id, p1);
  return w;
}

export function dispatch(world: World, action: GameAction): World {
  switch (action.type) {
    case 'SPAWN_SPARK':
      world.freeSparks.set(action.spark.id, action.spark);
      return world;

    case 'DESPAWN_SPARK': {
      // Soft-cap enforcement only — never despawns Carried sparks (the
      // player FSM owns those). Silent no-op if the id is gone.
      const s = world.freeSparks.get(action.sparkId);
      if (s === undefined) return world;
      if (s.state.kind !== 'Free') return world;
      world.freeSparks.delete(action.sparkId);
      return world;
    }

    case 'PICKUP_SPARK': {
      const player = requirePlayer(world, action.playerId);
      const spark = world.freeSparks.get(action.sparkId);
      if (spark === undefined) throw new Error(`spark ${action.sparkId} not free`);
      if (spark.state.kind !== 'Free') throw new Error(`spark ${action.sparkId} not Free`);
      const next = fsmPickup(player, action.sparkId);
      world.players.set(next.id, next);
      spark.state = { kind: 'Carried', carrierId: action.playerId };
      // While carried, freeze velocity so cursor placement is stable.
      spark.prevPos.x = spark.pos.x;
      spark.prevPos.y = spark.pos.y;
      return world;
    }

    case 'DROP_SPARK': {
      const player = requirePlayer(world, action.playerId);
      if (player.kind !== 'Carrying') throw new CarryViolation('not carrying');
      const spark = world.freeSparks.get(player.carriedSparkId);
      if (spark === undefined) throw new Error(`carried spark missing`);
      spark.state = { kind: 'Free' };
      spark.pos.x = action.pos.x;
      spark.pos.y = action.pos.y;
      // Reset velocity to zero on drop (player chose this spot).
      spark.prevPos.x = action.pos.x;
      spark.prevPos.y = action.pos.y;
      world.players.set(player.id, fsmDrop(player));
      return world;
    }

    case 'PLACE_PRIMITIVE':
      return placePrimitive(world, action);

    case 'SEVER_BOND': {
      const bond = world.bonds.get(action.bondId);
      if (bond === undefined) return world;
      const split = severSplit(bond, world.primitives, world.bonds);
      // Snapshot the loser side BEFORE deletion so the effects layer can
      // play the sever-erase fade with real positions/colors.
      for (const primId of split.del) {
        const p = world.primitives.get(primId);
        if (p === undefined) continue;
        world.effects.push({
          kind: 'SEVER_ERASE',
          tick: world.tick,
          pos: { x: p.pos.x, y: p.pos.y },
          color: p.placerColor,
          radius: p.radius,
        });
      }
      // Drop the cut bond + its adjacency on both sides.
      const a = world.primitives.get(bond.aId);
      const b = world.primitives.get(bond.bId);
      a?.bonds.delete(bond.id);
      b?.bonds.delete(bond.id);
      world.bonds.delete(bond.id);
      // Erase the loser side's primitives + bonds entirely.
      for (const bondId of split.delBonds) {
        const lost = world.bonds.get(bondId);
        if (lost === undefined) continue;
        world.primitives.get(lost.aId)?.bonds.delete(bondId);
        world.primitives.get(lost.bId)?.bonds.delete(bondId);
        world.bonds.delete(bondId);
      }
      for (const primId of split.del) world.primitives.delete(primId);
      // Surviving primitives that just lost their last bond need prevPos
      // resynced or the immobility guard will (correctly) flag residual
      // solver drift on the next tick.
      snapPrevPosForUnbonded(world.primitives);
      return world;
    }

    case 'TICK_ENERGY': {
      const player = requirePlayer(world, action.playerId);
      tickEnergy(player, action.deltaSec, ENERGY_PER_SECOND_FLAT);
      return world;
    }

    case 'WIN_TRIGGER':
      world.gameState = 'WIN';
      world.lastWinnerId = action.winnerId;
      return world;
  }
}

function requirePlayer(world: World, id: PlayerId): Player {
  const p = world.players.get(id);
  if (p === undefined) throw new Error(`player ${id} missing`);
  return p;
}

/**
 * Spec § IX.5 (v0.5.1): no building inside the spawner zone. The zone is
 * for spawning + collection only; placing there would put your structure
 * in the one always-visible-to-all-players area, breaking the geographic
 * trade-off in § X.2.
 *
 * Rejection is silent at the dispatch layer — the carry slot is preserved
 * (no spark loss). The connect-drag preview shows red feedback so the
 * player understands. Caller should check `controls.cursor` first to avoid
 * even sending the action; this is the defensive backstop.
 */
function placePrimitive(
  world: World,
  action: Extract<GameAction, { type: 'PLACE_PRIMITIVE' }>,
): World {
  const player = requirePlayer(world, action.playerId);
  if (player.kind !== 'Carrying') throw new CarryViolation('not carrying — cannot place');

  const sparkId = player.carriedSparkId;
  const spark = world.freeSparks.get(sparkId);
  if (spark === undefined) throw new Error(`carried spark ${sparkId} missing`);

  // No-build-zone enforcement (§ IX.5). Carry is preserved on rejection.
  // Strict inequality: placing exactly on the ring is allowed (liminal,
  // and matches the existing per-substep bound check in spawner.ts).
  const dx = spark.pos.x - SPAWNER_CENTER_X;
  const dy = spark.pos.y - SPAWNER_CENTER_Y;
  if (dx * dx + dy * dy < SPAWNER_RADIUS * SPAWNER_RADIUS) {
    return world;
  }

  const primId = asPrimitiveId(world.nextPrimitiveId++);
  const prim = makePrimitiveFromSpark({
    id: primId,
    spark,
    placerColor: player.color,
    placedBy: player.id,
    tick: world.tick,
  });
  world.primitives.set(primId, prim);

  // Spark is consumed by the placement.
  world.freeSparks.delete(sparkId);

  if (action.targetPrimitiveId !== null) {
    const target = world.primitives.get(action.targetPrimitiveId);
    if (target === undefined) throw new Error(`target primitive ${action.targetPrimitiveId} missing`);
    const bond = makeBond(world, prim, target, action.stiffnessTier);
    world.bonds.set(bond.id, bond);
    prim.bonds.add(bond.id);
    target.bonds.add(bond.id);
    // S6 P3: combo signature drives distinct placeholder flair in the
    // effects renderer. Direction is carried→target (matches order-dependent
    // combo table § V.1).
    const combo = lookupCombo(prim.type, target.type);
    world.effects.push({
      kind: 'BOND_COMMIT',
      tick: world.tick,
      pos: { x: prim.pos.x, y: prim.pos.y },
      color: prim.placerColor,
      radius: prim.radius,
      visualEffectId: combo.visualEffectId,
      otherPos: { x: target.pos.x, y: target.pos.y },
    });
  }

  // Carry-1 reset.
  world.players.set(player.id, fsmDrop(player));

  // Build-action credit (§ XIV.13).
  tickBuildAction(world.players.get(player.id)!);

  return world;
}

function makeBond(
  world: World,
  a: Primitive,
  b: Primitive,
  stiffnessTier: StiffnessTier,
): Bond {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  const restLength = Math.max(20, Math.hypot(dx, dy)); // floor avoids zero-length bond
  return {
    id: asBondId(world.nextBondId++),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength,
    stiffnessTier,
    createdTick: world.tick,
  };
}
