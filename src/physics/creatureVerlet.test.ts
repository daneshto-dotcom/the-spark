/**
 * SPARK — creature Verlet physics + steering tests (S26 P0, Voltkin Phase 2B).
 *
 * Covers Council R1 + PRIME-AUDIT deltas:
 *   - creatureVerletStep mirrors verletStep shape: pos/prevPos in-place, implicit
 *     velocity preserved + damped per substep.
 *   - Per-behavior steering helpers (Δ2): seekForce / arriveForce / repulseForce
 *     independently testable.
 *   - Δ4: computeSteeringAccel returns ZERO_ACCEL when state !== 'SEEKING'.
 *   - Δ5: computeStubTargetPos deterministic + ownerPlayerId-offset distinguishable.
 *
 * Phase-through (Δ1) is verified architecturally: creatures are NEVER added to
 * sparkArr or bondArr in main.ts (freeSparkArray() at main.ts:629/668 iterates
 * world.freeSparks only; bondArr is Array.from(world.bonds.values())). The bond
 * solver and collision resolver cannot reach into world.creatures. Confirmed by
 * code review of `stepPhysics` in main.ts:651-701. No runtime test exercises this
 * because solveBonds/resolveCollisions never receive a Creature reference — a
 * test passing an empty creature-free array would be tautological.
 */

import { describe, it, expect } from 'vitest';
import {
  CREATURE_ARRIVE_RADIUS,
  CREATURE_MAX_ACCEL,
  CREATURE_SPAWNER_REPULSE_RADIUS,
  ZERO_ACCEL,
  arriveForce,
  computeSteeringAccel,
  computeStubTargetPos,
  creatureVerletStep,
  repulseForce,
  seekForce,
} from './creatureVerlet.ts';
import {
  CREATURE_DESPAWNING_TICKS,
  VOLTKIN_LIFETIME_TICKS,
  asCreatureId,
  makeVoltkinCreature,
  type Creature,
} from '../state/creatures/creature.ts';
import { POOP_SLOW_MULTIPLIER, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, VELOCITY_DAMPING } from '../constants.ts';
import { asPlayerId } from '../types.ts';

const SUBSTEP_DT = 1 / 480; // 60 Hz × 8 substeps

function makeStubCreature(opts: {
  pos?: { x: number; y: number };
  targetPos?: { x: number; y: number };
  state?: Creature['state'];
  ownerPlayerId?: number;
  spawnedAtTick?: number;
}): Creature {
  const c = makeVoltkinCreature({
    id: asCreatureId(0),
    ownerPlayerId: asPlayerId(opts.ownerPlayerId ?? 0),
    pos: opts.pos ?? { x: 100, y: 100 },
    targetPos: opts.targetPos ?? { x: 500, y: 500 },
    spawnedAtTick: opts.spawnedAtTick ?? 0,
  });
  if (opts.state !== undefined) c.state = opts.state;
  return c;
}

describe('creatureVerletStep', () => {
  it('applies acceleration in the correct direction + updates prevPos to old pos', () => {
    const c = makeStubCreature({ pos: { x: 0, y: 0 }, targetPos: { x: 1000, y: 0 } });
    expect(c.prevPos).toEqual(c.pos); // factory snaps prevPos = pos
    creatureVerletStep(c, SUBSTEP_DT, { x: CREATURE_MAX_ACCEL, y: 0 });
    expect(c.pos.x).toBeGreaterThan(0);
    expect(c.pos.y).toBeCloseTo(0, 12);
    expect(c.prevPos.x).toBeCloseTo(0, 12);
    expect(c.prevPos.y).toBeCloseTo(0, 12);
  });

  it('preserves implicit velocity (pos - prevPos) across multi-step with damping decay', () => {
    // Seed an initial velocity by manually offsetting prevPos relative to pos.
    const c = makeStubCreature({ pos: { x: 100, y: 0 } });
    c.prevPos = { x: 99, y: 0 }; // implicit velocity = +1 px/substep on x
    // Run 100 substeps with NO accel — pure damping.
    for (let i = 0; i < 100; i++) creatureVerletStep(c, SUBSTEP_DT, ZERO_ACCEL);
    // After 100 substeps × 0.998 damping, residual velocity ≈ 0.998^100 ≈ 0.819.
    const finalVelocity = c.pos.x - c.prevPos.x;
    expect(finalVelocity).toBeGreaterThan(0.7);
    expect(finalVelocity).toBeLessThan(0.85);
    // Y axis stays untouched.
    expect(c.pos.y).toBeCloseTo(0, 12);
    // Damping coefficient sanity-check (does not drift to negative).
    expect(VELOCITY_DAMPING).toBeGreaterThan(0.99);
  });
});

describe('seekForce', () => {
  it('returns a vector of magnitude CREATURE_MAX_ACCEL pointing toward target', () => {
    const c = makeStubCreature({ pos: { x: 100, y: 100 } });
    const f = seekForce(c, { x: 200, y: 100 }); // 100px to the right
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(CREATURE_MAX_ACCEL, 5);
    expect(f.x).toBeGreaterThan(0);
    expect(f.y).toBeCloseTo(0, 12);
  });

  it('returns ZERO when creature is coincident with target (no division-by-zero)', () => {
    const c = makeStubCreature({ pos: { x: 100, y: 100 } });
    const f = seekForce(c, { x: 100, y: 100 });
    expect(f).toEqual({ x: 0, y: 0 });
  });
});

describe('arriveForce', () => {
  it('matches seek magnitude when distance > arriveRadius (full thrust)', () => {
    const c = makeStubCreature({ pos: { x: 0, y: 0 } });
    const farTarget = { x: CREATURE_ARRIVE_RADIUS * 2, y: 0 }; // 160px right
    const arrive = arriveForce(c, farTarget, CREATURE_ARRIVE_RADIUS);
    const seek = seekForce(c, farTarget);
    expect(arrive.x).toBeCloseTo(seek.x, 5);
    expect(arrive.y).toBeCloseTo(seek.y, 5);
  });

  it('linearly scales magnitude inside arriveRadius — half-radius → half thrust', () => {
    const c = makeStubCreature({ pos: { x: 0, y: 0 } });
    const halfRadiusTarget = { x: CREATURE_ARRIVE_RADIUS / 2, y: 0 };
    const f = arriveForce(c, halfRadiusTarget, CREATURE_ARRIVE_RADIUS);
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(CREATURE_MAX_ACCEL / 2, 5);
  });
});

describe('repulseForce', () => {
  it('points AWAY from source when inside repulse radius (positive radial component)', () => {
    const source = { x: 500, y: 500 };
    // Creature offset +50px on x from source, well inside CREATURE_SPAWNER_REPULSE_RADIUS=300.
    const c = makeStubCreature({ pos: { x: 550, y: 500 } });
    const f = repulseForce(c, source, CREATURE_SPAWNER_REPULSE_RADIUS);
    expect(f.x).toBeGreaterThan(0); // points away (positive x relative to source)
    expect(f.y).toBeCloseTo(0, 12);
    // Strength: ramp = 1 - 50/300 ≈ 0.833 → magnitude ≈ 167.
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(CREATURE_MAX_ACCEL * (1 - 50 / CREATURE_SPAWNER_REPULSE_RADIUS), 5);
  });

  it('returns ZERO when creature is outside repulse radius (blueprint Edge Case #5 boundary)', () => {
    const source = { x: 500, y: 500 };
    // Outside the 300px repulse radius — creature is 400px away.
    const c = makeStubCreature({ pos: { x: 900, y: 500 } });
    const f = repulseForce(c, source, CREATURE_SPAWNER_REPULSE_RADIUS);
    expect(f).toEqual({ x: 0, y: 0 });
  });
});

describe('computeSteeringAccel — Δ4 state gate (cross-resolves Q7 momentum trap + DESPAWNING drift)', () => {
  it('returns ZERO_ACCEL during SPAWNING (Gemini Q7 SPAWNING+repulse momentum trap)', () => {
    const c = makeStubCreature({
      pos: { x: 200, y: 200 },
      targetPos: { x: 800, y: 800 },
      state: 'SPAWNING',
    });
    const accel = computeSteeringAccel(c);
    expect(accel.x).toBe(0);
    expect(accel.y).toBe(0);
  });

  it('returns ZERO_ACCEL during DESPAWNING (Grok Q7 substep drift during fade)', () => {
    const c = makeStubCreature({
      pos: { x: 200, y: 200 },
      targetPos: { x: 800, y: 800 },
      state: 'DESPAWNING',
    });
    const accel = computeSteeringAccel(c);
    expect(accel.x).toBe(0);
    expect(accel.y).toBe(0);
  });

  it('returns non-zero accel during SEEKING with non-coincident target', () => {
    const c = makeStubCreature({
      pos: { x: 200, y: 200 },
      targetPos: { x: 1000, y: 200 }, // far, full seek
      state: 'SEEKING',
    });
    const accel = computeSteeringAccel(c);
    expect(Math.hypot(accel.x, accel.y)).toBeGreaterThan(0);
    // Clamped to CREATURE_MAX_ACCEL (Gemini Q4 RISK).
    expect(Math.hypot(accel.x, accel.y)).toBeLessThanOrEqual(CREATURE_MAX_ACCEL + 1e-6);
  });

  it('clamps combined seek+repulse magnitude to CREATURE_MAX_ACCEL', () => {
    // Place creature INSIDE spawner repulse zone AND give it a SEEKING target that
    // would also produce a force in the same direction. Without clamping, summed
    // magnitude could exceed CREATURE_MAX_ACCEL.
    const c = makeStubCreature({
      pos: { x: SPAWNER_CENTER_X + 50, y: SPAWNER_CENTER_Y }, // 50px from spawner → strong repulse
      targetPos: { x: SPAWNER_CENTER_X + 1000, y: SPAWNER_CENTER_Y }, // far right → full seek same direction
      state: 'SEEKING',
    });
    const accel = computeSteeringAccel(c);
    expect(Math.hypot(accel.x, accel.y)).toBeLessThanOrEqual(CREATURE_MAX_ACCEL + 1e-6);
  });
});

describe('S109 P2 — poop-slow scaling in computeSteeringAccel', () => {
  it('is a NO-OP (byte-identical) for an un-pooped creature regardless of tick', () => {
    const c = makeStubCreature({ pos: { x: 200, y: 200 }, targetPos: { x: 1000, y: 200 }, state: 'SEEKING' });
    const base = computeSteeringAccel(c);            // tick defaults to 0
    const withTick = computeSteeringAccel(c, 99999); // un-pooped → must equal base exactly
    expect(withTick.x).toBe(base.x);
    expect(withTick.y).toBe(base.y);
  });

  it('scales the steering accel by POOP_SLOW_MULTIPLIER while poopyUntilTick is live', () => {
    const c = makeStubCreature({ pos: { x: 200, y: 200 }, targetPos: { x: 1000, y: 200 }, state: 'SEEKING' });
    const unslowed = computeSteeringAccel(c, 100);
    c.poopyUntilTick = 1000; // tick 100 < 1000 → slowed
    const slowed = computeSteeringAccel(c, 100);
    expect(slowed.x).toBeCloseTo(unslowed.x * POOP_SLOW_MULTIPLIER, 9);
    expect(slowed.y).toBeCloseTo(unslowed.y * POOP_SLOW_MULTIPLIER, 9);
  });

  it('self-heals: once tick >= poopyUntilTick the slow no longer applies', () => {
    const c = makeStubCreature({ pos: { x: 200, y: 200 }, targetPos: { x: 1000, y: 200 }, state: 'SEEKING' });
    const base = computeSteeringAccel(c, 100);
    c.poopyUntilTick = 100; // tick 100 is NOT < 100 → expired
    const after = computeSteeringAccel(c, 100);
    expect(after.x).toBe(base.x);
    expect(after.y).toBe(base.y);
  });
});

describe('computeStubTargetPos — Δ5 deterministic + ownerPlayerId-distinguishable', () => {
  it('is deterministic — identical inputs produce byte-identical output', () => {
    const a = computeStubTargetPos(42, asPlayerId(0));
    const b = computeStubTargetPos(42, asPlayerId(0));
    expect(a).toEqual(b);
  });

  it('produces different targets for the same tick across owners (1v1 simultaneous-trigger safety)', () => {
    const p0Target = computeStubTargetPos(100, asPlayerId(0));
    const p1Target = computeStubTargetPos(100, asPlayerId(1));
    // ownerPlayerId·π offset (Δ5) means the angle differs by π for player 1 →
    // the (x, y) ring point is on the opposite side of the spawner.
    expect(p0Target).not.toEqual(p1Target);
    // Distance between them should be ≈ 2 × STUB_TARGET_RADIUS = 720, modulo
    // canvas clamping that may pull both inward.
    const dx = p0Target.x - p1Target.x;
    const dy = p0Target.y - p1Target.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(100);
  });

  it('clamps to canvas-with-padding (creature can never get stuck pressed against an edge)', () => {
    // Across a large sweep of ticks, target x/y should always be within
    // [STUB_TARGET_PADDING, CANVAS - STUB_TARGET_PADDING].
    for (let tick = 0; tick < 1000; tick += 7) {
      const t = computeStubTargetPos(tick, asPlayerId(0));
      expect(t.x).toBeGreaterThanOrEqual(80);
      expect(t.x).toBeLessThanOrEqual(1920 - 80);
      expect(t.y).toBeGreaterThanOrEqual(80);
      expect(t.y).toBeLessThanOrEqual(1080 - 80);
    }
  });
});

describe('end-to-end smoke — creature in SEEKING actually moves toward target across many substeps', () => {
  it('100 substeps with constant SEEKING + arrive force → pos closer to target', () => {
    const c = makeStubCreature({
      pos: { x: 100, y: 100 },
      targetPos: { x: 500, y: 100 },
      state: 'SEEKING',
    });
    const initialDist = Math.hypot(c.targetPos.x - c.pos.x, c.targetPos.y - c.pos.y);
    for (let i = 0; i < 100; i++) {
      creatureVerletStep(c, SUBSTEP_DT, computeSteeringAccel(c));
    }
    const finalDist = Math.hypot(c.targetPos.x - c.pos.x, c.targetPos.y - c.pos.y);
    expect(finalDist).toBeLessThan(initialDist);
    expect(c.pos.y).toBeCloseTo(100, 1); // no drift on perpendicular axis
  });

  it('Δ4 confirmed at integration level — SPAWNING creature does NOT move even with target far away', () => {
    const c = makeStubCreature({
      pos: { x: 100, y: 100 },
      targetPos: { x: 1000, y: 1000 }, // would be massive force if SEEKING
      state: 'SPAWNING',
    });
    const before = { x: c.pos.x, y: c.pos.y };
    for (let i = 0; i < 100; i++) {
      creatureVerletStep(c, SUBSTEP_DT, computeSteeringAccel(c));
    }
    expect(c.pos.x).toBeCloseTo(before.x, 12);
    expect(c.pos.y).toBeCloseTo(before.y, 12);
  });
});

// Silence unused-import warnings for symbols that document the contract but aren't
// directly asserted (lifecycle constants are exercised in creatureLifecycle.test.ts).
void CREATURE_DESPAWNING_TICKS;
void VOLTKIN_LIFETIME_TICKS;
