/**
 * SPARK — placePrimitive.ts dedicated unit tests.
 *
 * S48 P2 (Sym C fix) — new file. Coverage focus: host-side authoritative
 * target re-pick + merge candidate re-derivation for REMOTE-origin
 * intents under snapshot-lag conditions. The "first 4 didn't bond, 5th
 * did" user pattern.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId, asPrimitiveId, asSparkId } from '../types.ts';
import { dispatch, makeWorld } from './world.ts';
import {
  pickHostTargetPrimitive,
  collectHostMergeCandidates,
} from './placePrimitive.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function setupTwoPlayer1v1World() {
  const w = makeWorld(0);
  w.gameMode = '1v1';
  w.isHost = true;
  w.localPlayerId = P0;
  // Ensure both players exist with REALISTIC avatarPos so sparkLifecycle's
  // REASONABLE_PICKUP_REACH=250 check (sparkLifecycle.ts:141-144) doesn't
  // silently reject test pickups. Avatars near (200,100) where the test
  // placements happen.
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0], { x: 200, y: 100 }));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1], { x: 200, y: 100 }));
  return w;
}

describe('S48 P2 Sym C — host-side target pick helpers (pure)', () => {
  it('pickHostTargetPrimitive returns nearest same-color prim within radius', () => {
    const w = setupTwoPlayer1v1World();
    // Place two host-color prims at known positions via direct world mutation
    // (test fixture; we exercise the pure helper not the dispatch path).
    const sA = makeFreeSpark({
      id: asSparkId(0), type: SparkType.Square, pos: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    const sB = makeFreeSpark({
      id: asSparkId(1), type: SparkType.Square, pos: { x: 200, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    w.freeSparks.set(sA.id, sA);
    w.freeSparks.set(sB.id, sB);

    dispatch(w, { type: 'PICKUP_SPARK', sparkId: sA.id, playerId: P0, pos: sA.pos });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P0, targetPrimitiveId: null, stiffnessTier: 'MID' });

    dispatch(w, { type: 'PICKUP_SPARK', sparkId: sB.id, playerId: P0, pos: sB.pos });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P0, targetPrimitiveId: null, stiffnessTier: 'MID' });

    // Both prims placed by P0 (host color). Place cursor at (130, 100) —
    // nearer to first prim (100,100) than second (200,100).
    const id = pickHostTargetPrimitive(w, { x: 130, y: 100 }, PLAYER_COLORS[0]);
    expect(id).not.toBeNull();
    // Nearest is the first placed primitive at (100,100), id 0.
    expect(id).toBe(asPrimitiveId(0));
  });

  it('pickHostTargetPrimitive returns null when no prims in range', () => {
    const w = setupTwoPlayer1v1World();
    const id = pickHostTargetPrimitive(w, { x: 500, y: 500 }, PLAYER_COLORS[0]);
    expect(id).toBeNull();
  });

  it('pickHostTargetPrimitive filters by color (Sym D segregation preserved)', () => {
    const w = setupTwoPlayer1v1World();
    // Place one prim per player at the same x — pick from the perspective
    // of P0; expect only P0's prim returned even if P1's is geometrically
    // closer to the search center.
    const s0 = makeFreeSpark({
      id: asSparkId(0), type: SparkType.Square, pos: { x: 200, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    const s1 = makeFreeSpark({
      id: asSparkId(1), type: SparkType.Triangle, pos: { x: 150, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    w.freeSparks.set(s0.id, s0);
    w.freeSparks.set(s1.id, s1);

    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s0.id, playerId: P0, pos: s0.pos });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P0, targetPrimitiveId: null, stiffnessTier: 'MID' });

    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s1.id, playerId: P1, pos: s1.pos });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P1, targetPrimitiveId: null, stiffnessTier: 'MID' });

    // Cursor at (170, 100): closer to P1's prim at (150,100) than P0's at
    // (200,100). Filtering by P0's color should still return P0's prim.
    const id = pickHostTargetPrimitive(w, { x: 170, y: 100 }, PLAYER_COLORS[0]);
    expect(id).toBe(asPrimitiveId(0));
  });

  it('collectHostMergeCandidates returns same-color prims within MERGE_REACH_RADIUS', () => {
    const w = setupTwoPlayer1v1World();
    // Spawn + place 3 prims at distinct positions
    for (let i = 0; i < 3; i++) {
      const s = makeFreeSpark({
        id: asSparkId(i),
        type: SparkType.Square,
        pos: { x: 100 + i * 30, y: 100 }, // 100, 130, 160
        velocity: { x: 0, y: 0 },
        dt: 1 / 60,
        createdTick: 0,
      });
      w.freeSparks.set(s.id, s);
      dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P0, pos: s.pos });
      dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P0, targetPrimitiveId: null, stiffnessTier: 'MID' });
    }
    // Search center at (130, 100) — should pick all 3 (within 100px).
    const ids = collectHostMergeCandidates(w, { x: 130, y: 100 }, PLAYER_COLORS[0]);
    expect(ids.length).toBe(3);
  });
});

describe('S48 P2 Sym C — placePrimitive remote-origin re-pick integration', () => {
  it('host re-picks target when joiner intent has null targetPrimitiveId + placementPos provided', () => {
    const w = setupTwoPlayer1v1World();
    // Host (P0) places a prim at (200, 100). Use direct sequence.
    const sHost = makeFreeSpark({
      id: asSparkId(0), type: SparkType.Square, pos: { x: 200, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    w.freeSparks.set(sHost.id, sHost);
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: sHost.id, playerId: P0, pos: sHost.pos });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P0, targetPrimitiveId: null, stiffnessTier: 'MID' });
    expect(w.primitives.size).toBe(1);
    expect(w.bonds.size).toBe(0);

    // Now simulate REMOTE-origin joiner intent: place a P0-color prim
    // nearby with explicit null target (simulating snapshot-lagged joiner
    // view) but WITH placementPos provided. Host re-pick MUST find the
    // existing prim and form a bond.
    //
    // NOTE: action.playerId === P0 (host) here for setup simplicity — we
    // verify the re-pick triggers when action.playerId !== world.localPlayerId.
    // To simulate the joiner case we'd need P1's color matching; instead
    // we exercise the helper directly + verify it returns the right id.
    // (Full E2E lives in Playwright.)
    const sJoiner = makeFreeSpark({
      id: asSparkId(1), type: SparkType.Square, pos: { x: 230, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    w.freeSparks.set(sJoiner.id, sJoiner);
    // Set localPlayerId to P1 so this dispatch from P0 LOOKS REMOTE to host
    // (host's localPlayerId=P1 in this fixture means actions from P0 are
    // foreign). Inverted vs production semantics but exercises the same
    // code path.
    w.localPlayerId = P1;
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: sJoiner.id, playerId: P0, pos: sJoiner.pos });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P0,
      targetPrimitiveId: null, // SIMULATED SNAPSHOT LAG — joiner saw no target locally
      stiffnessTier: 'MID',
      placementPos: { x: 230, y: 100 },
    });
    // Re-pick should find prim at (200,100) within AUTO_BOND_RADIUS=60.
    // Bond formed.
    expect(w.primitives.size).toBe(2);
    expect(w.bonds.size).toBe(1);
  });

  it('host does NOT re-pick on local-origin intents (preserves pre-S48 behavior)', () => {
    const w = setupTwoPlayer1v1World();
    // localPlayerId === P0 (default). Action from P0 is LOCAL origin.
    const sHost = makeFreeSpark({
      id: asSparkId(0), type: SparkType.Square, pos: { x: 200, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    w.freeSparks.set(sHost.id, sHost);
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: sHost.id, playerId: P0, pos: sHost.pos });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P0, targetPrimitiveId: null, stiffnessTier: 'MID' });

    const sHost2 = makeFreeSpark({
      id: asSparkId(1), type: SparkType.Square, pos: { x: 230, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    w.freeSparks.set(sHost2.id, sHost2);
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: sHost2.id, playerId: P0, pos: sHost2.pos });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P0,
      targetPrimitiveId: null, // local intent says no target
      stiffnessTier: 'MID',
      placementPos: { x: 230, y: 100 }, // present but ignored for local origin
    });
    // Local-origin: pre-S48 behavior preserved → no re-pick → no bond.
    expect(w.primitives.size).toBe(2);
    expect(w.bonds.size).toBe(0);
  });

  it('host does NOT override a joiner-supplied target (preserves explicit anchor placements)', () => {
    const w = setupTwoPlayer1v1World();
    // Place a target prim
    const sA = makeFreeSpark({
      id: asSparkId(0), type: SparkType.Square, pos: { x: 200, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    w.freeSparks.set(sA.id, sA);
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: sA.id, playerId: P0, pos: sA.pos });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P0, targetPrimitiveId: null, stiffnessTier: 'MID' });
    const firstPrimId = Array.from(w.primitives.keys())[0];

    // Simulate joiner intent with EXPLICIT target id pointing to firstPrim
    const sB = makeFreeSpark({
      id: asSparkId(1), type: SparkType.Square, pos: { x: 230, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    w.freeSparks.set(sB.id, sB);
    w.localPlayerId = P1; // make P0 actions appear remote
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: sB.id, playerId: P0, pos: sB.pos });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P0,
      targetPrimitiveId: firstPrimId, // explicit target — should bond
      stiffnessTier: 'MID',
      placementPos: { x: 230, y: 100 },
    });
    expect(w.bonds.size).toBe(1);
  });
});
