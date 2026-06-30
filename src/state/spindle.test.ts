/**
 * SPARK — S115 P2 (G2-PROMO Phase-2) Spindle tangential-swirl tests.
 *
 * A Spindle (Line↔Circle) pushes nearby FREE sparks PERPENDICULAR to the anchor→spark vector so they
 * swirl/orbit, distinct from the Vortex radial suck-in. Asserts: an in-range free spark gains TANGENTIAL
 * velocity; out-of-range / carried / drag-locked sparks are untouched; both orders (S98 symmetry) swirl;
 * a fouled Spindle stops; the swirl is a pure deterministic function of synced state; and — the Council
 * (GROK-ANALYST) anti-escape-velocity requirement — the swirl speed is BOUNDED (non-accumulating) no
 * matter how long a spark stays in range.
 */

import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  SPINDLE_MAX_TANGENTIAL_SPEED,
  SparkType,
} from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeFreeSpark, type Spark } from '../game/spark.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSparkId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { applySpindlePull } from './spindle.ts';

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
    stiffnessTier: 'MID',
    createdTick: 0,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

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

/** A Line(aId)→Circle(bId) Spindle with its anchor (midpoint) at (cx,cy). */
function addSpindle(w: World, cx: number, cy: number): Bond {
  const line = addPrim(w, 1, SparkType.Line, cx - 20, cy);
  const circle = addPrim(w, 2, SparkType.Circle, cx + 20, cy);
  return connect(w, 10, line, circle); // aId=Line, bId=Circle ⇒ Spindle
}

/** velocity = pos − prevPos (the Verlet implicit velocity the swirl injects). */
function vel(s: Spark): { x: number; y: number } {
  return { x: s.pos.x - s.prevPos.x, y: s.pos.y - s.prevPos.y };
}

describe('S115 P2 — Spindle tangential swirl', () => {
  it('pushes an in-range free spark TANGENTIALLY (perpendicular to the anchor→spark vector)', () => {
    const w = baseWorld();
    addSpindle(w, 500, 400); // anchor at (500,400)
    const s = addFreeSpark(w, 100, 500, 540); // 140px straight BELOW the anchor (< radius 200)
    applySpindlePull(w);
    const v = vel(s);
    // Radial dir (anchor→spark) is straight DOWN; the swirl is perpendicular ⇒ horizontal. (−dy,dx)
    // with dy = 400−540 = −140 ⇒ +x. So the spark is pushed in +x, with ~zero vertical (radial) component.
    expect(v.x).toBeGreaterThan(0);
    expect(Math.abs(v.y)).toBeLessThan(1e-9);
  });

  it('the injected velocity is purely tangential (zero radial component)', () => {
    const w = baseWorld();
    addSpindle(w, 500, 400);
    const s = addFreeSpark(w, 100, 560, 470); // off-axis so both components are non-zero
    applySpindlePull(w);
    const v = vel(s);
    // radial = anchor − spark; tangential push ⇒ v · radial ≈ 0.
    const rx = 500 - 560;
    const ry = 400 - 470;
    const dot = v.x * rx + v.y * ry;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
    expect(Math.hypot(v.x, v.y)).toBeGreaterThan(0); // non-vacuous
  });

  it('leaves an OUT-of-range free spark untouched', () => {
    const w = baseWorld();
    addSpindle(w, 500, 400);
    const s = addFreeSpark(w, 100, 500, 650); // 250px below — beyond radius 200
    applySpindlePull(w);
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('does NOT swirl a CARRIED spark (only Free sparks swirl)', () => {
    const w = baseWorld();
    addSpindle(w, 500, 400);
    const s = addFreeSpark(w, 100, 500, 480);
    s.state = { kind: 'Carried', carrierId: asPlayerId(0) };
    applySpindlePull(w);
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('skips the AttractDragged spark so the swirl never fights the player drag', () => {
    const w = baseWorld();
    addSpindle(w, 500, 400);
    const s = addFreeSpark(w, 100, 500, 480);
    applySpindlePull(w, s.id);
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('S98 order-symmetry: Circle→Line is ALSO a Spindle and swirls', () => {
    const w = baseWorld();
    const circle = addPrim(w, 1, SparkType.Circle, 480, 400);
    const line = addPrim(w, 2, SparkType.Line, 520, 400);
    connect(w, 10, circle, line); // aId=Circle, bId=Line ⇒ Spindle (S98 symmetric)
    const s = addFreeSpark(w, 100, 500, 480);
    applySpindlePull(w);
    expect(vel(s)).not.toEqual({ x: 0, y: 0 });
  });

  it('a FOULED Spindle (either endpoint pooped) stops swirling until cleaned', () => {
    const w = baseWorld();
    const bond = addSpindle(w, 500, 400);
    const s = addFreeSpark(w, 100, 500, 480);
    w.fouledPrimitives.add(bond.aId);
    applySpindlePull(w);
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('no Spindle on the board → total no-op', () => {
    const w = baseWorld();
    const s = addFreeSpark(w, 100, 500, 480);
    applySpindlePull(w);
    expect(vel(s)).toEqual({ x: 0, y: 0 });
  });

  it('is deterministic: identical worlds → byte-identical swirl (replay / host-mirror safe)', () => {
    const build = (): { w: World; s: Spark } => {
      const w = baseWorld();
      addSpindle(w, 500, 400);
      const s = addFreeSpark(w, 100, 540, 520);
      return { w, s };
    };
    const a = build();
    const b = build();
    applySpindlePull(a.w);
    applySpindlePull(b.w);
    expect(vel(a.s)).toEqual(vel(b.s));
    expect(Math.hypot(vel(a.s).x, vel(a.s).y)).toBeGreaterThan(0);
  });

  it('multi-anchor sum is canonical-ordered: identical regardless of bond Map insertion order', () => {
    const build = (firstBondId: number): Spark => {
      const w = baseWorld();
      const aLine = addPrim(w, 1, SparkType.Line, 380, 400);
      const aCircle = addPrim(w, 2, SparkType.Circle, 420, 400);
      const bLine = addPrim(w, 3, SparkType.Line, 580, 420);
      const bCircle = addPrim(w, 4, SparkType.Circle, 620, 420);
      if (firstBondId === 10) {
        connect(w, 10, aLine, aCircle);
        connect(w, 11, bLine, bCircle);
      } else {
        connect(w, 11, bLine, bCircle);
        connect(w, 10, aLine, aCircle);
      }
      const s = addFreeSpark(w, 100, 500, 470);
      applySpindlePull(w);
      return s;
    };
    const sAB = build(10);
    const sBA = build(11);
    expect(vel(sAB)).toEqual(vel(sBA));
    expect(Math.hypot(vel(sAB).x, vel(sAB).y)).toBeGreaterThan(0);
  });

  it('BOUNDED SPEED (Council anti-escape-velocity): swirl never exceeds the cap, however long in range', () => {
    // Without integrating between calls, pos is fixed ⇒ the tangential direction is constant, so the
    // injected velocity accumulates along ONE axis — the worst case for the clamp. Drive 500 ticks: an
    // UNBOUNDED design would reach ~500 × per-tick impulse ≫ the cap and fling the spark off. The cap
    // must hold the swirl speed at ≤ SPINDLE_MAX_TANGENTIAL_SPEED every single tick.
    const w = baseWorld();
    addSpindle(w, 500, 400);
    const s = addFreeSpark(w, 100, 540, 400); // 40px from the anchor — strong swirl, fast to saturate
    let maxSpeed = 0;
    for (let t = 0; t < 500; t++) {
      applySpindlePull(w);
      maxSpeed = Math.max(maxSpeed, Math.hypot(vel(s).x, vel(s).y));
    }
    expect(maxSpeed).toBeLessThanOrEqual(SPINDLE_MAX_TANGENTIAL_SPEED + 1e-9);
    // And it actually SATURATED the cap (proves the clamp engaged, not that the force was just weak).
    expect(Math.hypot(vel(s).x, vel(s).y)).toBeGreaterThan(SPINDLE_MAX_TANGENTIAL_SPEED - 1e-6);
  });

  it('the closer a spark is, the stronger the (sub-cap) swirl (proximity ramp)', () => {
    const near = baseWorld();
    addSpindle(near, 500, 400);
    const sNear = addFreeSpark(near, 100, 500, 460); // 60px
    applySpindlePull(near);

    const far = baseWorld();
    addSpindle(far, 500, 400);
    const sFar = addFreeSpark(far, 100, 500, 580); // 180px (still < 200)
    applySpindlePull(far);

    expect(Math.abs(vel(sNear).x)).toBeGreaterThan(Math.abs(vel(sFar).x));
  });
});
