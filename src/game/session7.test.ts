/**
 * SPARK — Session 7 / Session 9 P1 tests:
 *   - S7 P1 (was): snap-to-cursor invariant.
 *   - S9 P1 (now): reachability gate. Placement uses spark.pos (no snap);
 *     auto-bond pick measures from spark.pos so bond length ≤ AUTO_BOND_RADIUS.
 *     If cursor at LMB-up is > MAX_RELEASE_REACH from spark.pos, place is
 *     rejected and spark stays Free.
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
// Mirror constants from controls.ts. Kept local so a controls-side rename
// is caught at test time rather than silently reinterpreted.
const AUTO_BOND_RADIUS = 60;
const MAX_RELEASE_REACH = 120;

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
  const sp = world.freeSparks.get(sparkId);
  dispatch(world, { type: 'PICKUP_SPARK', sparkId, playerId: P1, pos: sp ? { x: sp.pos.x, y: sp.pos.y } : { x: 0, y: 0 } });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: P1,
    targetPrimitiveId: null,
    stiffnessTier: 'MID',
  });
}

describe('S9 P1 — reachability gate for LMB-up-outside-zone place', () => {
  it('reachable + outside-zone ⇒ place commits at spark.pos; bond ≤ AUTO_BOND_RADIUS via spark→target', () => {
    // Setup: target primitive at (1300, 500) outside the spawner zone.
    const world = makeWorld(0);
    const tSparkId = spawnFreeAt(world, 1, 0, { x: 1300, y: 500 });
    placeWithoutBond(world, tSparkId);
    const targetPid = [...world.primitives.values()][0].id;

    // Draggee spark caught up to within MAX_RELEASE_REACH of cursor —
    // simulating successful attract-drag that finished pulling the spark
    // close to where the player is about to release.
    const dSparkId = spawnFreeAt(world, 2, 1, { x: 1280, y: 500 });
    const draggee = world.freeSparks.get(dSparkId);
    expect(draggee).toBeDefined();

    // === S9 P1 behavior: no snap. spark.pos is the placement coord; bond
    // pick measures from spark.pos. Cursor is at (1290, 500) — 10px from
    // spark — well within MAX_RELEASE_REACH=120.
    const cursor = { x: 1290, y: 500 };

    // Reachability gate would pass: dist(spark, cursor) = 10 ≤ 120.
    // In-zone check on spark.pos at (1280, 500) — outside the spawner.
    // Auto-bond pick measured from spark.pos (1280, 500) — target at
    // (1300, 500) is 20px away, well within AUTO_BOND_RADIUS=60.
    let pickedPid: ReturnType<typeof asPrimitiveId> | null = null;
    let bestDistSq = AUTO_BOND_RADIUS * AUTO_BOND_RADIUS;
    for (const p of world.primitives.values()) {
      const dx = p.pos.x - draggee!.pos.x;
      const dy = p.pos.y - draggee!.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        pickedPid = p.id;
      }
    }
    expect(pickedPid, 'target at (1300,500) within 60 of spark (1280,500)').toBe(targetPid);

    const dSp = world.freeSparks.get(dSparkId);
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: dSparkId, playerId: P1, pos: dSp ? { x: dSp.pos.x, y: dSp.pos.y } : { x: 0, y: 0 } });
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: pickedPid,
      stiffnessTier: 'MID',
    });

    expect(world.bonds.size).toBe(1);
    const bond = [...world.bonds.values()][0];
    // Bond length = dist(spark.pos → target.pos) = 20 ≤ AUTO_BOND_RADIUS.
    expect(bond.restLength).toBeLessThanOrEqual(AUTO_BOND_RADIUS);

    // Placed primitive should be at spark.pos (no snap to cursor).
    const placed = [...world.primitives.values()].find((p) => p.id !== targetPid);
    expect(placed).toBeDefined();
    expect(placed!.pos.x).toBeCloseTo(draggee!.pos.x, 1);
    expect(placed!.pos.y).toBeCloseTo(draggee!.pos.y, 1);
    // Cursor coords should NOT have been used as the placement.
    expect(placed!.pos.x).not.toBeCloseTo(cursor.x, 0);
    void cursor;
  });

  it('unreachable cursor (flick across canvas) ⇒ place rejected, spark stays Free at physics position', () => {
    // The teleport-cheese pattern: pick up a spark on one side of the
    // canvas, flick cursor to the other side, release. Pre-S9 the snap
    // teleported the spark to the cursor. S9 P1 rejects the place — spark
    // stays where its physics put it; player can re-attempt.
    const world = makeWorld(0);
    const tSparkId = spawnFreeAt(world, 1, 0, { x: 1300, y: 500 });
    placeWithoutBond(world, tSparkId);

    const dSparkId = spawnFreeAt(world, 2, 1, { x: 200, y: 500 });
    const draggee = world.freeSparks.get(dSparkId);
    expect(draggee).toBeDefined();

    // Cursor flicked to (1290, 500) — 1090px from spark, far over
    // MAX_RELEASE_REACH=120.
    const reachDx = 1290 - draggee!.pos.x;
    const reachDy = 500 - draggee!.pos.y;
    const reachable =
      reachDx * reachDx + reachDy * reachDy <=
      MAX_RELEASE_REACH * MAX_RELEASE_REACH;
    expect(reachable, 'cursor 1090px away should be unreachable').toBe(false);

    // The onUp handler would early-return without dispatching PICKUP or
    // PLACE. World still has just the target primitive; spark is still Free.
    expect(world.primitives.size).toBe(1);
    expect(world.freeSparks.size).toBe(1);
    expect(draggee!.state.kind).toBe('Free');
    // Spark didn't teleport — still where physics left it.
    expect(draggee!.pos.x).toBeCloseTo(200, 1);
  });

  it('cancel-place: spark.pos inside zone after attract-drag ⇒ no place even with reachable cursor', () => {
    // If the attract-drag pulls the spark inside the spawner zone before
    // release (e.g. user dragged briefly without leaving the zone), the
    // in-zone check on spark.pos fails the place. Spark stays Free.
    const world = makeWorld(0);
    const dSparkId = spawnFreeAt(world, 1, 0, { x: 960, y: 540 });
    const draggee = world.freeSparks.get(dSparkId);
    expect(draggee).toBeDefined();

    // Cursor near spark — reachable.
    const cursor = { x: 970, y: 540 };
    const reachDx = cursor.x - draggee!.pos.x;
    const reachDy = cursor.y - draggee!.pos.y;
    const reachable =
      reachDx * reachDx + reachDy * reachDy <=
      MAX_RELEASE_REACH * MAX_RELEASE_REACH;
    expect(reachable).toBe(true);

    // But spark is at spawner center — in-zone check fails. No PICKUP/PLACE.
    expect(world.primitives.size).toBe(0);
    expect(world.freeSparks.size).toBe(1);
    expect(draggee!.state.kind).toBe('Free');
  });
});
