import { describe, expect, it } from 'vitest';
import { voltkinPose } from './voltkinPose.ts';
import {
  CREATURE_DESPAWNING_TICKS,
  CREATURE_SPAWN_TICKS,
  VOLTKIN_ATTACK_FIRE_TICK,
} from '../state/creatures/creature.ts';

/**
 * S106 P5 — pins the pure Voltkin pose fn that drives the procedural electric-being rig (replaced the
 * bitmap sprite). The load-bearing contract: boltCharge PEAKS exactly at the FIRE tick (the discharge),
 * is low during the wind-up, and the pose is a deterministic fn of (state, ticksInState, worldTick, id).
 */
describe('voltkinPose (S106 P5 — procedural electric-being)', () => {
  it('is deterministic — same inputs → identical pose', () => {
    const a = voltkinPose('ATTACKING', 12, 100, 3);
    const b = voltkinPose('ATTACKING', 12, 100, 3);
    expect(a).toEqual(b);
  });

  it('SPAWNING grows the core in from small to ~full', () => {
    const early = voltkinPose('SPAWNING', 2, 0, 0).coreScale;
    const late = voltkinPose('SPAWNING', CREATURE_SPAWN_TICKS - 1, 0, 0).coreScale;
    expect(early).toBeLessThan(0.6);
    expect(late).toBeGreaterThan(0.95);
  });

  it('SEEKING is alive but low-charge (ambient crackle, ~full size)', () => {
    const p = voltkinPose('SEEKING', 10, 50, 1);
    expect(p.coreScale).toBeGreaterThan(0.9);
    expect(p.coreScale).toBeLessThan(1.1);
    expect(p.boltCharge).toBeGreaterThan(0); // never fully off — a living spark
    expect(p.boltCharge).toBeLessThan(0.4);
  });

  it('ATTACKING boltCharge + armSpread PEAK exactly at the FIRE tick', () => {
    const windup = voltkinPose('ATTACKING', 4, 0, 0);
    const fire = voltkinPose('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK, 0, 0);
    expect(windup.boltCharge).toBeLessThan(0.6); // still charging
    expect(fire.boltCharge).toBe(1); // full discharge at FIRE
    expect(fire.armSpread).toBe(1);
    expect(fire.coreScale).toBeGreaterThan(1.1); // scale punch on the zap
  });

  it('ATTACKING recovers — charge eases back down after the fire tick', () => {
    const fire = voltkinPose('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK, 0, 0).boltCharge;
    const late = voltkinPose('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK + 20, 0, 0).boltCharge;
    expect(late).toBeLessThan(fire);
  });

  it('DESPAWNING shrinks the core + fades the charge over the fade window', () => {
    const start = voltkinPose('DESPAWNING', 2, 0, 0);
    const end = voltkinPose('DESPAWNING', CREATURE_DESPAWNING_TICKS - 1, 0, 0);
    expect(end.coreScale).toBeLessThan(start.coreScale);
    expect(end.boltCharge).toBeLessThan(start.boltCharge);
  });

  it('per-instance offset desyncs the idle ambient (two Voltkins do not pulse in unison)', () => {
    const a = voltkinPose('SEEKING', 10, 100, 0);
    const b = voltkinPose('SEEKING', 10, 100, 5);
    expect(a.bodyBobY).not.toBe(b.bodyBobY); // different phase → different bob
  });
});
