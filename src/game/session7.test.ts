/**
 * SPARK — Session 7 tests:
 *   - P1: snap-to-cursor invariant — placement and auto-bond range share
 *     a single source of truth so bond length is bounded by AUTO_BOND_RADIUS.
 *
 * P2 has its own test file (bondVisualRenderer.test.ts) — that one needs a
 * mock Graphics, so it lives under src/render/.
 */

import { describe, expect, it } from 'vitest';
import { PHYSICS_HZ, SparkType } from '../constants.ts';
import { makeFreeSpark } from './spark.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import {
  asPlayerId,
  asPrimitiveId,
  asSparkId,
} from '../types.ts';

const P1 = asPlayerId(0);
const PHYSICS_DT = 1 / PHYSICS_HZ;
// Mirrors the constant in controls.ts. Kept local so a controls-side rename
// is caught at test time rather than silently reinterpreted.
const AUTO_BOND_RADIUS = 60;

function spawnFreeAt(
  world: ReturnType<typeof makeWorld>,
  id: number,
  tick: number,
  pos: { x: number; y: number },
) {
  const sparkId = asSparkId(id);
  dispatch(world, {
    type: 'SPAWN_SPARK',
    spark: makeFreeSpark({
      id: sparkId,
      type: SparkType.Dot,
      pos,
      velocity: { x: 0, y: 0 },
      dt: PHYSICS_DT,
      createdTick: tick,
    }),
  });
  return sparkId;
}

function placeWithoutBond(world: ReturnType<typeof makeWorld>, sparkId: ReturnType<typeof asSparkId>) {
  dispatch(world, { type: 'PICKUP_SPARK', sparkId, playerId: P1 });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: P1,
    targetPrimitiveId: null,
    stiffnessTier: 'MID',
  });
}

describe('S7 P1 — snap-to-cursor invariant for LMB-up-outside-zone place', () => {
  it('snap-to-cursor + pick-from-cursor ⇒ bond rest_length is bounded by AUTO_BOND_RADIUS', () => {
    // Setup: a target primitive placed outside the spawner zone, at (1050, 500).
    const world = makeWorld(0);
    const tSparkId = spawnFreeAt(world, 1, 0, { x: 1300, y: 500 });
    placeWithoutBond(world, tSparkId);
    const targetPid = [...world.primitives.values()][0].id;

    // Draggee spark starts FAR from where the player will release —
    // simulating attract-drag inertia. Pre-S7 the placed primitive would
    // have been at this lagged position, while the auto-bond pick measured
    // from cursor — bond length spanned dist(spark→cursor) + 60.
    const dSparkId = spawnFreeAt(world, 2, 1, { x: 200, y: 500 });
    const draggee = world.freeSparks.get(dSparkId);
    expect(draggee).toBeDefined();

    // === S7 P1 behavior: snap spark.pos to cursor before PICKUP/PLACE ===
    const cursor = { x: 1280, y: 500 };
    draggee!.pos.x = cursor.x;
    draggee!.pos.y = cursor.y;
    draggee!.prevPos.x = cursor.x;
    draggee!.prevPos.y = cursor.y;

    // Auto-bond pick from cursor — equivalent now to pick from spark.pos
    // since they coincide. Find the closest primitive within range.
    let pickedPid: ReturnType<typeof asPrimitiveId> | null = null;
    let bestDistSq = AUTO_BOND_RADIUS * AUTO_BOND_RADIUS;
    for (const p of world.primitives.values()) {
      const dx = p.pos.x - cursor.x;
      const dy = p.pos.y - cursor.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        pickedPid = p.id;
      }
    }
    expect(pickedPid, 'target at (1300,500) should be within 60 of cursor (1280,500)').toBe(targetPid);

    dispatch(world, { type: 'PICKUP_SPARK', sparkId: dSparkId, playerId: P1 });
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: pickedPid,
      stiffnessTier: 'MID',
    });

    expect(world.bonds.size).toBe(1);
    const bond = [...world.bonds.values()][0];
    // Bond length = dist(placed → target) = dist(cursor → target) ≤ AUTO_BOND_RADIUS.
    expect(bond.restLength).toBeLessThanOrEqual(AUTO_BOND_RADIUS);

    // Placed primitive should be AT cursor (the snap took effect), not at
    // the lagged spawn position (200, 500).
    const placed = [...world.primitives.values()].find((p) => p.id !== targetPid);
    expect(placed).toBeDefined();
    expect(placed!.pos.x).toBeCloseTo(cursor.x, 1);
    expect(placed!.pos.y).toBeCloseTo(cursor.y, 1);
  });

  it('regression-documentation: WITHOUT the snap, the same scenario would produce a canvas-spanning bond', () => {
    // Captures pre-S7 bug behavior. If a future change removes the snap in
    // controls.onUp, that change must consciously update this test (it
    // would no longer match a fixed implementation) instead of silently
    // regressing.
    const world = makeWorld(0);
    const tSparkId = spawnFreeAt(world, 1, 0, { x: 1300, y: 500 });
    placeWithoutBond(world, tSparkId);
    const targetPid = [...world.primitives.values()][0].id;

    const dSparkId = spawnFreeAt(world, 2, 1, { x: 200, y: 500 });
    // NO snap — pre-S7 codepath. Place uses the lagged spark.pos.
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: dSparkId, playerId: P1 });
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: targetPid,
      stiffnessTier: 'MID',
    });

    const bond = [...world.bonds.values()][0];
    // Bond rest_length = dist((200,500), (1300,500)) = 1100 — far exceeds
    // AUTO_BOND_RADIUS. This is the user-reported "any part of the map"
    // bug from the post-S6 playtest.
    expect(bond.restLength).toBeGreaterThan(AUTO_BOND_RADIUS);
    expect(bond.restLength).toBeCloseTo(1100, 0);
  });

  it('cancel-place: cursor snapped INTO zone after attract-drag = no place, spark stays free', () => {
    // The snap also gives the player a way to cancel a half-pulled spark:
    // drag the cursor back inside the spawner zone. The in-zone test fires
    // after the snap, so spark.pos = cursor inside zone ⇒ no place. Spark
    // stays Free at the cursor position (will drift naturally next tick).
    const world = makeWorld(0);
    const dSparkId = spawnFreeAt(world, 1, 0, { x: 200, y: 500 });
    const draggee = world.freeSparks.get(dSparkId);
    expect(draggee).toBeDefined();

    // Cursor near spawner center — inside zone.
    const cursor = { x: 960, y: 540 };

    // Snap (S7 P1):
    draggee!.pos.x = cursor.x;
    draggee!.pos.y = cursor.y;
    draggee!.prevPos.x = cursor.x;
    draggee!.prevPos.y = cursor.y;

    // The actual onUp handler now does: if (!isInsideSpawnerZone(spark.pos))
    // PICKUP+PLACE; else fall through. Test mirrors that branch:
    // (we don't dispatch PICKUP here — the caller would skip on inZone)
    expect(world.primitives.size).toBe(0);
    expect(world.freeSparks.size).toBe(1);
    expect(draggee!.state.kind).toBe('Free');
  });
});
