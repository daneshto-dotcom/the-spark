/**
 * SPARK — placeFromFree atomic reducer tests (S52 P1).
 *
 * Coverage targets the contract: "ANY validation failure leaves spark Free
 * + player Idle; only a SUCCESS path mutates state". Each test exercises
 * one reject branch from src/state/placeFromFree.ts + asserts the spark
 * remains Free + the player remains Idle + the appropriate rejectReasons
 * counter increments (Council C5 Gemini #3 HIGH — granular diagnostics
 * preserved).
 *
 * Happy-path tests cover: anchor placement (no target), bonded placement
 * (with target), remote-origin host re-pick (Council C2 BLOCKER), atomic
 * commit (player never observably enters Carrying state from outside).
 */

import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Spark } from '../game/spark.ts';
import { asPlayerId, asPrimitiveId, asSparkId, type PrimitiveId } from '../types.ts';
import { applyPlaceFromFree } from './placeFromFree.ts';
import { makeWorld } from './world.ts';
import { computeComplexity } from './scoring.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const RED = PLAYER_COLORS[0];
const CYAN = PLAYER_COLORS[1];

function makeFreeSpark(id: number, x: number, y: number, type: SparkType = SparkType.Dot): Spark {
  return {
    id: asSparkId(id),
    type,
    pos: { x, y },
    prevPos: { x, y },
    state: { kind: 'Free' },
    radius: 8,
    createdTick: 0,
  };
}

function setupSolo() {
  const world = makeWorld(0);
  world.gameMode = 'solo';
  world.gameState = 'PLAYING';
  // Solo starts with P0 only (auto-populated by makeWorld).
  const spark = makeFreeSpark(1, 600, 600);
  world.freeSparks.set(spark.id, spark);
  return { world, spark };
}

function setup1v1Host() {
  const world = makeWorld(0);
  world.gameMode = '1v1';
  world.gameState = 'PLAYING';
  world.isHost = true;
  world.localPlayerId = P0;
  // Host's P0 already populated by makeWorld; add joiner P1.
  const p1 = makeIdlePlayer(P1, CYAN, { x: 600, y: 400 });
  world.players.set(P1, p1);
  world.scoreByPlayer.set(P1, 0);
  const spark = makeFreeSpark(1, 600, 600);
  world.freeSparks.set(spark.id, spark);
  return { world, spark };
}

// ===== Happy path =====

describe('applyPlaceFromFree — happy path', () => {
  it('anchor placement: spark consumed, primitive created, player stays Idle (no carry transient)', () => {
    const { world, spark } = setupSolo();
    const before = world.players.get(P0)!;
    expect(before.kind).toBe('Idle');

    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P0,
      placementPos: { x: 600, y: 600 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });

    expect(world.freeSparks.has(spark.id)).toBe(false);
    expect(world.primitives.size).toBe(1);
    // Atomic — from outside the reducer, player observed only Idle states.
    expect(world.players.get(P0)!.kind).toBe('Idle');
    // S76: placement no longer scores directly — income accrues per-tick on standing complexity.
    // The anchor raises P0's complexity to 1; scoreProgress stays 0 until a host tick runs.
    expect(computeComplexity(world, P0)).toBe(1);
    expect(world.scoreProgress).toBe(0);
    // buildAction credited (=1).
    expect(world.players.get(P0)!.buildActions).toBe(1);
  });

  it('local-origin bonded placement: target exists, bond formed', () => {
    const { world, spark } = setupSolo();
    // Plant an existing primitive to bond with.
    const existing = {
      id: asPrimitiveId(99),
      type: SparkType.Dot,
      placerColor: RED,
      placedBy: P0,
      createdTick: 0,
      pos: { x: 620, y: 600 },
      prevPos: { x: 620, y: 600 },
      bonds: new Set<never>(),
      ownerColor: RED,
      lastOwnershipChange: 0,
      radius: 8,
    };
    world.primitives.set(existing.id, existing as never);

    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P0,
      placementPos: { x: 600, y: 600 },
      stiffnessTier: 'MID',
      targetPrimitiveId: existing.id,
      mergeCandidateIds: [existing.id],
    });

    expect(world.freeSparks.has(spark.id)).toBe(false);
    expect(world.primitives.size).toBe(2);
    expect(world.bonds.size).toBe(1);
    expect(world.players.get(P0)!.kind).toBe('Idle');
  });
});

// ===== Reject paths — granular rejectReasons preserved (Council C5) =====

describe('applyPlaceFromFree — reject paths leave spark Free + player Idle', () => {
  it('malformed placementPos increments pickupPosShape', () => {
    const { world, spark } = setupSolo();
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P0,
      placementPos: { x: NaN, y: 600 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    expect(world.freeSparks.has(spark.id)).toBe(true);
    expect(world.diagnostics.rejectReasons.pickupPosShape).toBe(1);
    expect(world.players.get(P0)!.kind).toBe('Idle');
  });

  it('spark already Carried by another increments pickupSparkNotFree', () => {
    const { world, spark } = setupSolo();
    spark.state = { kind: 'Carried', carrierId: P0 };
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P0,
      placementPos: { x: 600, y: 600 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    expect(world.diagnostics.rejectReasons.pickupSparkNotFree).toBe(1);
    expect(world.primitives.size).toBe(0);
  });

  it('player already Carrying rejects (race) — primitive not created', () => {
    const { world, spark } = setupSolo();
    // Force player to Carrying state (shouldn't normally happen — defensive).
    const player = world.players.get(P0)!;
    world.players.set(P0, {
      ...player,
      kind: 'Carrying',
      carriedSparkId: asSparkId(999),
    } as never);
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P0,
      placementPos: { x: 600, y: 600 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    expect(world.diagnostics.raceRejects).toBe(1);
    expect(world.primitives.size).toBe(0);
  });

  it('spawner-zone placement is silently rejected (no counter, spark stays Free)', () => {
    const { world, spark } = setupSolo();
    // Inside spawner zone — well within SPAWNER_RADIUS=250 of center.
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P0,
      placementPos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    expect(world.freeSparks.has(spark.id)).toBe(true);
    expect(world.primitives.size).toBe(0);
    // Spawner-zone reject doesn't fire territoryBlockRejects (different bucket).
    expect(world.diagnostics.territoryBlockRejects).toBe(0);
    expect(world.players.get(P0)!.kind).toBe('Idle');
  });

  it('targetPrimitiveId missing (race) increments placeTargetMissing', () => {
    const { world, spark } = setupSolo();
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P0,
      placementPos: { x: 600, y: 600 },
      stiffnessTier: 'MID',
      targetPrimitiveId: asPrimitiveId(99999),
    });
    expect(world.diagnostics.rejectReasons.placeTargetMissing).toBe(1);
    expect(world.primitives.size).toBe(0);
    expect(world.freeSparks.has(spark.id)).toBe(true);
    expect(world.players.get(P0)!.kind).toBe('Idle');
  });

  it('remote-origin out-of-canvas-bounds placementPos increments pickupReachFail', () => {
    const { world, spark } = setup1v1Host();
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P1,
      placementPos: { x: -50, y: 600 }, // outside canvas
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    expect(world.diagnostics.rejectReasons.pickupReachFail).toBe(1);
    expect(world.primitives.size).toBe(0);
    expect(world.freeSparks.has(spark.id)).toBe(true);
    expect(world.players.get(P1)!.kind).toBe('Idle');
  });

  it('remote-origin out-of-reach placementPos increments pickupReachFail', () => {
    const { world, spark } = setup1v1Host();
    // Joiner avatar at (600, 400); REASONABLE_PICKUP_REACH = 600. Place at
    // (1850, 400) — distance 1250, well outside reach.
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P1,
      placementPos: { x: 1850, y: 400 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    expect(world.diagnostics.rejectReasons.pickupReachFail).toBe(1);
    expect(world.primitives.size).toBe(0);
  });
});

// ===== Remote-origin host re-pick (Council C2 Grok #1 BLOCKER) =====

describe('applyPlaceFromFree — remote-origin target/merge re-pick (Council C2)', () => {
  it("ignores joiner's targetPrimitiveId; host picks from authoritative world", () => {
    const { world, spark } = setup1v1Host();
    // Plant TWO same-color primitives that joiner doesn't know about. Place
    // close to one of them; host should re-pick that one as the target.
    const hostPrimA = {
      id: asPrimitiveId(50),
      type: SparkType.Dot,
      placerColor: CYAN,
      placedBy: P1,
      createdTick: 0,
      pos: { x: 620, y: 400 }, // close to placement (within AUTO_BOND_RADIUS=60)
      prevPos: { x: 620, y: 400 },
      bonds: new Set<never>(),
      ownerColor: CYAN,
      lastOwnershipChange: 0,
      radius: 8,
    };
    const hostPrimB = {
      id: asPrimitiveId(51),
      type: SparkType.Dot,
      placerColor: CYAN,
      placedBy: P1,
      createdTick: 0,
      pos: { x: 1000, y: 400 }, // far from placement
      prevPos: { x: 1000, y: 400 },
      bonds: new Set<never>(),
      ownerColor: CYAN,
      lastOwnershipChange: 0,
      radius: 8,
    };
    world.primitives.set(hostPrimA.id, hostPrimA as never);
    world.primitives.set(hostPrimB.id, hostPrimB as never);

    // Joiner places near hostPrimA but supplies targetPrimitiveId=null
    // (joiner's local map hadn't yet received either prim).
    spark.pos = { x: 600, y: 400 };
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P1, // joiner
      placementPos: { x: 600, y: 400 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });

    expect(world.primitives.size).toBe(3); // 2 hostPrims + new
    expect(world.bonds.size).toBe(1); // host re-picked hostPrimA as target
    // The new prim is bonded to hostPrimA (closer), not hostPrimB.
    const bond = Array.from(world.bonds.values())[0];
    const involved = new Set<PrimitiveId>([bond.aId, bond.bId]);
    expect(involved.has(hostPrimA.id)).toBe(true);
    expect(involved.has(hostPrimB.id)).toBe(false);
  });

  it("remote-origin: even if joiner supplies a STALE targetPrimitiveId, host re-picks", () => {
    const { world, spark } = setup1v1Host();
    const hostPrim = {
      id: asPrimitiveId(50),
      type: SparkType.Dot,
      placerColor: CYAN,
      placedBy: P1,
      createdTick: 0,
      pos: { x: 620, y: 400 },
      prevPos: { x: 620, y: 400 },
      bonds: new Set<never>(),
      ownerColor: CYAN,
      lastOwnershipChange: 0,
      radius: 8,
    };
    world.primitives.set(hostPrim.id, hostPrim as never);

    spark.pos = { x: 600, y: 400 };
    // Joiner sends a stale/wrong id (some prim that no longer exists). For
    // remote-origin, host IGNORES this and re-picks against its own world.
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P1,
      placementPos: { x: 600, y: 400 },
      stiffnessTier: 'MID',
      targetPrimitiveId: asPrimitiveId(99999), // joiner's stale claim
    });

    // Host re-picks hostPrim → placement bonded.
    expect(world.primitives.size).toBe(2);
    expect(world.bonds.size).toBe(1);
    // Importantly — NO placeTargetMissing increment, because remote-origin
    // never reads action.targetPrimitiveId for the existence check.
    expect(world.diagnostics.rejectReasons.placeTargetMissing).toBe(0);
  });
});

// ===== Atomic guarantee (the actual user-facing fix) =====

describe('applyPlaceFromFree — atomicity (the S52 P1 contract)', () => {
  it('territory-rejected placement does NOT leave joiner in Carrying state', () => {
    const { world, spark } = setup1v1Host();
    // Place a host-color primitive establishing a territorial radius around it
    // — joiner placing nearby should be inside enemy territory.
    const hostTerritoryPrim = {
      id: asPrimitiveId(50),
      type: SparkType.Dot,
      placerColor: RED, // P0's color — joiner's enemy
      placedBy: P0,
      createdTick: 0,
      pos: { x: 600, y: 400 },
      prevPos: { x: 600, y: 400 },
      bonds: new Set<never>(),
      ownerColor: RED,
      lastOwnershipChange: 0,
      radius: 8,
    };
    world.primitives.set(hostTerritoryPrim.id, hostTerritoryPrim as never);

    spark.pos = { x: 600, y: 400 };
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P1, // joiner placing inside red's territory
      placementPos: { x: 600, y: 400 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });

    // KEY assertion — the bug we're fixing. Pre-S52 PICKUP+PLACE burst would
    // have left player.kind='Carrying' after PLACE_PRIMITIVE silently
    // rejected with territoryBlockRejects++. PLACE_FROM_FREE atomically
    // returns world unchanged on reject.
    expect(world.players.get(P1)!.kind).toBe('Idle');
    expect(world.freeSparks.get(spark.id)?.state.kind).toBe('Free');
    expect(world.diagnostics.territoryBlockRejects).toBe(1);
    expect(world.primitives.size).toBe(1); // only the host's prim, no joiner prim
  });

  it('spawner-zone-rejected placement does NOT leave joiner in Carrying state', () => {
    const { world, spark } = setup1v1Host();
    // Move joiner avatar close to spawner zone so isValidPlacementPos passes;
    // SPAWNER_CENTER_X = CANVAS_WIDTH/2; place joiner avatarPos within reach.
    const joiner = world.players.get(P1)!;
    world.players.set(P1, { ...joiner, avatarPos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y } });
    spark.pos = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P1,
      placementPos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    expect(world.players.get(P1)!.kind).toBe('Idle');
    expect(world.freeSparks.get(spark.id)?.state.kind).toBe('Free');
    expect(world.primitives.size).toBe(0);
  });

  it('successful placement increments buildAction ONCE (not twice for the burst)', () => {
    const { world, spark } = setupSolo();
    expect(world.players.get(P0)!.buildActions).toBe(0);
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P0,
      placementPos: { x: 600, y: 600 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    // Atomic: one PLACE_FROM_FREE = one buildAction credit (matches
    // placePrimitive's existing tickBuildAction call). Pre-S52 burst path
    // also credited 1 (PICKUP_SPARK doesn't tick build, only PLACE_PRIMITIVE
    // does), so this preserves the build-rate math for raid charges.
    expect(world.players.get(P0)!.buildActions).toBe(1);
  });
});

// ===== Canvas bounds defense =====

describe('applyPlaceFromFree — defense in depth', () => {
  it('canvas-bounds check rejects negative coords', () => {
    const { world, spark } = setup1v1Host();
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P1,
      placementPos: { x: -100, y: 600 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    expect(world.diagnostics.rejectReasons.pickupReachFail).toBe(1);
  });

  it('canvas-bounds check rejects over-canvas coords', () => {
    const { world, spark } = setup1v1Host();
    applyPlaceFromFree(world, {
      type: 'PLACE_FROM_FREE',
      sparkId: spark.id,
      playerId: P1,
      placementPos: { x: CANVAS_WIDTH + 50, y: CANVAS_HEIGHT + 50 },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
    expect(world.diagnostics.rejectReasons.pickupReachFail).toBe(1);
  });
});
