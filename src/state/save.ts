/**
 * SPARK — WorldSnapshot serializer + localStorage save/load.
 * § 10.4 LOCKED: schemaVersion: 1 — locked across Phase 1.
 * Sets are converted to arrays. Object refs (Bond.a/Bond.b) are dropped
 * — they're rebuilt from IDs on load.
 *
 * Phase 3 will reuse the same shape for server snapshots / replay scrubbing,
 * so we keep `rngSeed` and `tick` so determinism can be reconstructed.
 */

import { type StiffnessTier } from '../constants.ts';
import { makePrimitiveFromSpark, type Primitive } from '../game/primitive.ts';
import {
  makeFreeSpark,
  type Spark,
  type SparkState,
} from '../game/spark.ts';
import { type Bond } from '../physics/bonds.ts';
import { type SparkType } from '../constants.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  asSparkId,
  type BondId,
  type PlayerId,
  type PrimitiveId,
  type SparkId,
  type Vec2,
} from '../types.ts';
import { type GameState, type World } from './world.ts';
import { type Player } from '../game/player.ts';

const STORAGE_KEY = 'spark.snapshot.v1';
const PHYSICS_DT = 1 / 60;

export interface WorldSnapshot {
  schemaVersion: 1;
  savedAt: string; // ISO timestamp
  tick: number;
  rngSeed: number;
  gameState: GameState;
  lastWinnerId: PlayerId | null;
  nextPrimitiveId: number;
  nextBondId: number;
  freeSparks: SerializedSpark[];
  primitives: SerializedPrimitive[];
  bonds: SerializedBond[];
  players: SerializedPlayer[];
}

interface SerializedSpark {
  id: SparkId;
  type: SparkType;
  pos: Vec2;
  prevPos: Vec2;
  radius: number;
  createdTick: number;
  state: SparkState;
}

interface SerializedPrimitive {
  id: PrimitiveId;
  type: SparkType;
  placerColor: number;
  placedBy: PlayerId;
  createdTick: number;
  pos: Vec2;
  prevPos: Vec2;
  bonds: BondId[]; // Set → array
  ownerColor: number;
  lastOwnershipChange: number;
  radius: number;
}

interface SerializedBond {
  id: BondId;
  aId: PrimitiveId;
  bId: PrimitiveId;
  restLength: number;
  stiffnessTier: StiffnessTier;
  createdTick: number;
}

interface SerializedPlayer {
  id: PlayerId;
  color: number;
  kind: 'Idle' | 'Carrying';
  carriedSparkId: SparkId | null;
  energy: number;
  buildActions: number;
  disruptionCharges: number;
}

export function snapshot(world: World): WorldSnapshot {
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    tick: world.tick,
    rngSeed: world.rngSeed,
    gameState: world.gameState,
    lastWinnerId: world.lastWinnerId,
    nextPrimitiveId: world.nextPrimitiveId,
    nextBondId: world.nextBondId,
    freeSparks: [...world.freeSparks.values()].map(serializeSpark),
    primitives: [...world.primitives.values()].map(serializePrimitive),
    bonds: [...world.bonds.values()].map(serializeBond),
    players: [...world.players.values()].map(serializePlayer),
  };
}

export function restore(snap: WorldSnapshot, world: World): void {
  if (snap.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion ${snap.schemaVersion}`);
  }
  world.tick = snap.tick;
  world.rngSeed = snap.rngSeed;
  world.gameState = snap.gameState;
  world.lastWinnerId = snap.lastWinnerId;
  world.nextPrimitiveId = snap.nextPrimitiveId;
  world.nextBondId = snap.nextBondId;

  world.freeSparks.clear();
  world.primitives.clear();
  world.bonds.clear();
  world.players.clear();

  for (const s of snap.freeSparks) {
    const spark: Spark = {
      ...makeFreeSpark({
        id: s.id,
        type: s.type,
        pos: s.pos,
        velocity: { x: 0, y: 0 },
        dt: PHYSICS_DT,
        createdTick: s.createdTick,
      }),
      pos: { ...s.pos },
      prevPos: { ...s.prevPos },
      state: s.state,
    };
    world.freeSparks.set(spark.id, spark);
  }

  for (const p of snap.primitives) {
    // Build a stub spark for makePrimitiveFromSpark, then overwrite.
    const stubSpark = makeFreeSpark({
      id: asSparkId(-1),
      type: p.type,
      pos: p.pos,
      velocity: { x: 0, y: 0 },
      dt: PHYSICS_DT,
      createdTick: p.createdTick,
    });
    const prim: Primitive = {
      ...makePrimitiveFromSpark({
        id: p.id,
        spark: stubSpark,
        placerColor: p.placerColor,
        placedBy: p.placedBy,
        tick: p.createdTick,
      }),
      pos: { ...p.pos },
      prevPos: { ...p.prevPos },
      bonds: new Set(p.bonds),
      ownerColor: p.ownerColor,
      lastOwnershipChange: p.lastOwnershipChange,
      radius: p.radius,
    };
    world.primitives.set(prim.id, prim);
  }

  for (const b of snap.bonds) {
    const a = world.primitives.get(b.aId);
    const bb = world.primitives.get(b.bId);
    if (a === undefined || bb === undefined) {
      throw new Error(`bond ${b.id} references missing primitive`);
    }
    const bond: Bond = {
      id: b.id,
      aId: b.aId,
      bId: b.bId,
      a,
      b: bb,
      restLength: b.restLength,
      stiffnessTier: b.stiffnessTier,
      createdTick: b.createdTick,
    };
    world.bonds.set(bond.id, bond);
  }

  for (const p of snap.players) {
    const base = {
      id: p.id,
      color: p.color,
      energy: p.energy,
      buildActions: p.buildActions,
      disruptionCharges: p.disruptionCharges,
    };
    const player: Player =
      p.kind === 'Carrying' && p.carriedSparkId !== null
        ? { ...base, kind: 'Carrying', carriedSparkId: p.carriedSparkId }
        : { ...base, kind: 'Idle' };
    world.players.set(player.id, player);
  }
}

function serializeSpark(s: Spark): SerializedSpark {
  return {
    id: s.id,
    type: s.type,
    pos: { x: s.pos.x, y: s.pos.y },
    prevPos: { x: s.prevPos.x, y: s.prevPos.y },
    radius: s.radius,
    createdTick: s.createdTick,
    state: s.state,
  };
}

function serializePrimitive(p: Primitive): SerializedPrimitive {
  return {
    id: p.id,
    type: p.type,
    placerColor: p.placerColor,
    placedBy: p.placedBy,
    createdTick: p.createdTick,
    pos: { x: p.pos.x, y: p.pos.y },
    prevPos: { x: p.prevPos.x, y: p.prevPos.y },
    bonds: [...p.bonds],
    ownerColor: p.ownerColor,
    lastOwnershipChange: p.lastOwnershipChange,
    radius: p.radius,
  };
}

function serializeBond(b: Bond): SerializedBond {
  return {
    id: b.id,
    aId: b.aId,
    bId: b.bId,
    restLength: b.restLength,
    stiffnessTier: b.stiffnessTier,
    createdTick: b.createdTick,
  };
}

function serializePlayer(p: Player): SerializedPlayer {
  return {
    id: p.id,
    color: p.color,
    kind: p.kind,
    carriedSparkId: p.kind === 'Carrying' ? p.carriedSparkId : null,
    energy: p.energy,
    buildActions: p.buildActions,
    disruptionCharges: p.disruptionCharges,
  };
}

// Brand re-exports so save callers don't need to import types.ts.
export const SaveBrands = { asPlayerId, asPrimitiveId, asBondId };

export function saveToLocalStorage(world: World): WorldSnapshot {
  const snap = snapshot(world);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  }
  return snap;
}

export function loadFromLocalStorage(world: World): WorldSnapshot | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  const snap = JSON.parse(raw) as WorldSnapshot;
  restore(snap, world);
  return snap;
}
