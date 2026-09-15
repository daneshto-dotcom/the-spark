/**
 * SPARK — S178: **THE VORTEX AND THE SPINDLE DO NOT TOUCH FREE SPARKS.** Owner ruling.
 *
 * Owner, S178, after his brother used it in a live match: *"How is that a mechanic? When did we ever
 * say that it should be a mechanic? Dot-spiral combo will pull free sparks. That's ridiculous. …
 * for now, it should definitely not affect free shapes, free primitives."* And on the exploit:
 * *"he built it really close to the center where the figures spawn, and it started pulling every
 * primitive … that's like a cheat code he found … We definitely have to fucking get rid of that."*
 *
 * ⛔ WHY THIS FILE EXISTS AT ALL, AND IT IS THE POINT. When the two pulls were unwired from
 * `stepPhysics`, **the entire suite stayed green** — 285 files, 4532 tests, not one red.
 * `vortex.test.ts` and `spindle.test.ts` call `applyVortexPull` / `applySpindlePull` DIRECTLY, so
 * they pin the arithmetic and say nothing about whether the physics loop ever calls them. A mechanic
 * can therefore be armed or disarmed in this codebase without a single test noticing — which is how
 * a self-authorised pull on the shared spawn pool survived from S89 to S178.
 *
 * So this tests the WIRING, not the maths: drive the real `stepPhysics` with a real live Vortex on
 * top of a real free spark, and assert the spark does not move.
 *
 * ⚠ RE-ARMING IT FOR **CREATURES** IS STILL OPEN and must not be blocked by this file. He left that
 * door open in the same breath: *"it could be a cool mechanic to pull in creatures … tag on them so
 * if they're running against it, it will pull them closer, make them slower; if they run [with] it,
 * it'll make him faster. We can discuss it."* That is a different victim. This asserts only that
 * FREE SPARKS are not moved.
 */
import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SPINDLE_PULL_RADIUS,
  SparkType,
  VORTEX_PULL_RADIUS,
} from '../constants.ts';
import { isSpindleCombo, isVortexCombo } from '../combos.ts';
import type { Bond } from './bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeFreeSpark, type Spark } from '../game/spark.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSparkId } from '../types.ts';
import { makeWorld, type World } from '../state/world.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import type { ControlsLike } from '../input/controlsCore.ts';
import { stepPhysics } from './physicsLoop.ts';

const RED = PLAYER_COLORS[0];
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as ControlsLike;

function baseWorld(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  return w;
}

function addPrim(w: World, id: number, type: SparkType, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id), type, placerColor: RED, placedBy: asPlayerId(0), createdTick: id,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: RED,
    lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

function connect(w: World, id: number, a: Primitive, b: Primitive): Bond {
  const bond: Bond = {
    id: asBondId(id), aId: a.id, bId: b.id, a, b,
    restLength: 40, stiffnessTier: 'HIGH', damageFifths: 0, createdTick: 0,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

/** A motionless free spark (prevPos == pos ⇒ zero implicit velocity). */
function addFreeSpark(w: World, id: number, x: number, y: number): Spark {
  const s = makeFreeSpark({
    id: asSparkId(id), type: SparkType.Dot, pos: { x, y },
    velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
  });
  w.freeSparks.set(s.id, s);
  return s;
}

/** Thirty real physics ticks — far more than the pull needed to visibly drag a spark. */
function step(w: World): void {
  const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7));
  for (let i = 0; i < 30; i++) stepPhysics(w, spawner, stubControls);
}

describe('S178 owner ruling — a magic combo must not move a free spark', () => {
  it('the fixture really does build the two combos, so a pass cannot be vacuous', () => {
    // ⛔ GREEN-FOR-THE-WRONG-REASON GUARD. Without this, a change to the combo predicates would make
    // the spark sit still because there is no Vortex at all — and the suite would call that a pass.
    expect(isVortexCombo(SparkType.Dot, SparkType.Spiral)).toBe(true);
    expect(isSpindleCombo(SparkType.Line, SparkType.Circle)).toBe(true);
  });

  it('a live VORTEX sitting on a free spark does not move it', () => {
    const w = baseWorld();
    const c = DEFAULT_SPAWNER_CONFIG.center;
    const a = addPrim(w, 1, SparkType.Dot, c.x - 20, c.y);
    const b = addPrim(w, 2, SparkType.Spiral, c.x + 20, c.y);
    connect(w, 1, a, b);
    // Well inside the pull radius — this spark felt the full force before S178.
    const spark = addFreeSpark(w, 10, c.x + VORTEX_PULL_RADIUS * 0.25, c.y);
    const before = { x: spark.pos.x, y: spark.pos.y };
    step(w);
    const after = w.freeSparks.get(spark.id)!;
    expect(after.pos.x).toBeCloseTo(before.x, 6);
    expect(after.pos.y).toBeCloseTo(before.y, 6);
  });

  it('a live SPINDLE sitting on a free spark does not swirl it', () => {
    const w = baseWorld();
    const c = DEFAULT_SPAWNER_CONFIG.center;
    const a = addPrim(w, 1, SparkType.Line, c.x - 20, c.y);
    const b = addPrim(w, 2, SparkType.Circle, c.x + 20, c.y);
    connect(w, 1, a, b);
    const spark = addFreeSpark(w, 10, c.x, c.y + SPINDLE_PULL_RADIUS * 0.25);
    const before = { x: spark.pos.x, y: spark.pos.y };
    step(w);
    const after = w.freeSparks.get(spark.id)!;
    expect(after.pos.x).toBeCloseTo(before.x, 6);
    expect(after.pos.y).toBeCloseTo(before.y, 6);
  });
});
