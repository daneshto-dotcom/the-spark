/**
 * SPARK — S89 P6 (G1b) Vortex anchor-pull tests.
 *
 * The first mechanical magic-combo behavior. Asserts: a free spark within range gains velocity
 * TOWARD the anchor; out-of-range / carried / drag-locked sparks are untouched; only the Vortex
 * combo (Dot→Spiral, order-dependent) pulls; a fouled Vortex stops pulling; and the force is a
 * pure deterministic function of synced state (replay-identical, host-authoritative).
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeFreeSpark, type Spark } from '../game/spark.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSparkId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { applyVortexPull } from './vortex.ts';

const RED = PLAYER_COLORS[0];

function baseWorld(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  return w;
}

function addPrim(w: World, id: number, type: SparkType, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type,
    placerColor: RED,
    placedBy: asPlayerId(0),
    createdTick: id,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: RED,
    lastOwnershipChange: 0,
    radius: 8,
  };
  w.primitives.set(p.id, p);
  return p;
}

function connect(w: World, id: number, a: Primitive, b: Primitive): Bond {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 40,
    stiffnessTier: 'HIGH',
    createdTick: 0,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

/** A motionless free spark (prevPos == pos ⇒ zero implicit velocity). */
function addFreeSpark(w: World, id: number, x: number, y: number): Spark {
  const s = makeFreeSpark({
    id: asSparkId(id),
    type: SparkType.Dot,
    pos: { x, y },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: 0,
  });
  w.freeSparks.set(s.id, s);
  return s;
}

/** A Dot(aId)→Spiral(bId) Vortex with its anchor (midpoint) at (cx,cy). */
function addVortex(w: World, cx: number, cy: number): Bond {
  const dot = addPrim(w, 1, SparkType.Dot, cx - 20, cy);
  const spiral = addPrim(w, 2, SparkType.Spiral, cx + 20, cy);
  return connect(w, 10, dot, spiral); // aId=Dot, bId=Spiral ⇒ Vortex
}

/** velocity = pos − prevPos (the Verlet implicit velocity the pull injects). */
function vel(s: Spark): { x: number; y: number } {
  return { x: s.pos.x - s.prevPos.x, y: s.pos.y - s.prevPos.y };
}

describe('S89 P6 — Vortex anchor-pull', () => {
  it('pulls an in-range free spark TOWARD the anchor (velocity points at it)', () => {
    const w = baseWorld();
    addVortex(w, 500, 400); // anchor at (500,400)
    const s = addFreeSpark(w, 100, 500, 540); // 140px straight BELOW the anchor (< radius 220)
    applyVortexPull(w);
    const v = vel(s);
    expect(v.y).toBeLessThan(0); // pulled UP toward the anchor (anchor.y=400 < spark.y=540)
    expect(Math.abs(v.x)).toBeLessThan(1e-9); // anchor directly above → no horizontal pull
  });

  it('leaves an OUT-of-range free spark untouched', () => {
    const w = baseWorld();
    addVortex(w, 500, 400);
    const s = addFreeSpark(w, 100, 500, 700); // 300px below the anchor — beyond radius 220
    applyVortexPull(w);
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('does NOT pull a CARRIED spark (only Free sparks are pulled)', () => {
    const w = baseWorld();
    addVortex(w, 500, 400);
    const s = addFreeSpark(w, 100, 500, 480);
    s.state = { kind: 'Carried', carrierId: asPlayerId(0) };
    applyVortexPull(w);
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('skips the AttractDragged spark so the pull never fights the player drag', () => {
    const w = baseWorld();
    addVortex(w, 500, 400);
    const s = addFreeSpark(w, 100, 500, 480);
    applyVortexPull(w, s.id); // this spark is being dragged
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('only the Vortex combo pulls — Spiral→Dot (reverse order) and Dot→Dot do NOT', () => {
    // Reverse order: aId=Spiral, bId=Dot ⇒ a placeholder, not a Vortex (order-dependent § V.1).
    const w = baseWorld();
    const spiral = addPrim(w, 1, SparkType.Spiral, 480, 400);
    const dot = addPrim(w, 2, SparkType.Dot, 520, 400);
    connect(w, 10, spiral, dot); // aId=Spiral, bId=Dot
    const s = addFreeSpark(w, 100, 500, 480);
    applyVortexPull(w);
    expect(vel(s)).toEqual({ x: 0, y: 0 });

    // Dot→Dot (a generic placeholder) also does not pull.
    const w2 = baseWorld();
    const d1 = addPrim(w2, 1, SparkType.Dot, 480, 400);
    const d2 = addPrim(w2, 2, SparkType.Dot, 520, 400);
    connect(w2, 10, d1, d2);
    const s2 = addFreeSpark(w2, 100, 500, 480);
    applyVortexPull(w2);
    expect(vel(s2)).toEqual({ x: 0, y: 0 });
  });

  it('a FOULED Vortex (either endpoint pooped) stops pulling until cleaned', () => {
    const w = baseWorld();
    const bond = addVortex(w, 500, 400);
    const s = addFreeSpark(w, 100, 500, 480);
    w.fouledPrimitives.add(bond.aId); // the Dot endpoint is fouled
    applyVortexPull(w);
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('is deterministic: identical worlds → byte-identical pull (replay / host-mirror safe)', () => {
    const build = (): { w: World; s: Spark } => {
      const w = baseWorld();
      addVortex(w, 500, 400);
      const s = addFreeSpark(w, 100, 530, 520); // off-axis so both components are non-zero
      return { w, s };
    };
    const a = build();
    const b = build();
    applyVortexPull(a.w);
    applyVortexPull(b.w);
    expect(vel(a.s)).toEqual(vel(b.s));
    // And the pull is non-trivial (guards against a vacuous "both zero" pass).
    expect(Math.hypot(vel(a.s).x, vel(a.s).y)).toBeGreaterThan(0);
  });

  it('no Vortex on the board → total no-op', () => {
    const w = baseWorld();
    const s = addFreeSpark(w, 100, 500, 480);
    applyVortexPull(w);
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('multi-anchor sum is canonical-ordered: identical regardless of bond Map insertion order (CHECK fix)', () => {
    // Two Vortexes whose pull radii overlap one spark. Build the SAME two in OPPOSITE insertion
    // order; the bond-id sort must make the float sum byte-identical (closes the GROK-ANALYST
    // non-associativity finding — Map order must NOT influence the result).
    const build = (firstBondId: number): Spark => {
      const w = baseWorld();
      // Vortex A anchor ≈ (400,400); Vortex B anchor ≈ (600,420). Distinct ids/positions.
      const aDot = addPrim(w, 1, SparkType.Dot, 380, 400);
      const aSpiral = addPrim(w, 2, SparkType.Spiral, 420, 400);
      const bDot = addPrim(w, 3, SparkType.Dot, 580, 420);
      const bSpiral = addPrim(w, 4, SparkType.Spiral, 620, 420);
      // Insert the two bonds in the order dictated by the args (different Map insertion order).
      if (firstBondId === 10) {
        connect(w, 10, aDot, aSpiral);
        connect(w, 11, bDot, bSpiral);
      } else {
        connect(w, 11, bDot, bSpiral);
        connect(w, 10, aDot, aSpiral);
      }
      const s = addFreeSpark(w, 100, 500, 470); // within both radii, off both axes
      applyVortexPull(w);
      return s;
    };
    const sAB = build(10); // A (bond 10) inserted first
    const sBA = build(11); // B (bond 11) inserted first
    expect(vel(sAB)).toEqual(vel(sBA)); // canonical bond-id order ⇒ identical sum
    expect(Math.hypot(vel(sAB).x, vel(sAB).y)).toBeGreaterThan(0); // non-vacuous
  });

  it('the closer a spark is, the stronger the pull (proximity ramp, capped)', () => {
    const near = baseWorld();
    addVortex(near, 500, 400);
    const sNear = addFreeSpark(near, 100, 500, 460); // 60px away
    applyVortexPull(near);

    const far = baseWorld();
    addVortex(far, 500, 400);
    const sFar = addFreeSpark(far, 100, 500, 600); // 200px away (still < 220)
    applyVortexPull(far);

    expect(Math.abs(vel(sNear).y)).toBeGreaterThan(Math.abs(vel(sFar).y));
  });
});
