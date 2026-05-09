import { describe, expect, it } from 'vitest';
import { asPlayerId, asSparkId } from '../types.ts';
import {
  CarryViolation,
  drop,
  makeIdlePlayer,
  pickup,
  tickBuildAction,
  tickEnergy,
} from './player.ts';

describe('Player Carry-1 invariant (§ III.3)', () => {
  it('starts Idle and transitions to Carrying via pickup', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff3b6b);
    expect(p.kind).toBe('Idle');
    const c = pickup(p, asSparkId(7));
    expect(c.kind).toBe('Carrying');
    expect(c.carriedSparkId).toBe(7);
  });

  it('throws CarryViolation on double-pickup', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff3b6b);
    const c = pickup(p, asSparkId(1));
    expect(() => pickup(c, asSparkId(2))).toThrow(CarryViolation);
  });

  it('throws CarryViolation on drop-while-idle', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff3b6b);
    expect(() => drop(p)).toThrow(CarryViolation);
  });

  it('preserves common fields across the FSM transition', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff3b6b);
    p.energy = 12.5;
    p.buildActions = 3;
    p.disruptionCharges = 1;
    const c = pickup(p, asSparkId(99));
    expect(c.energy).toBe(12.5);
    expect(c.buildActions).toBe(3);
    expect(c.disruptionCharges).toBe(1);
    expect(c.color).toBe(0xff3b6b);
    const back = drop(c);
    expect(back.kind).toBe('Idle');
    expect(back.energy).toBe(12.5);
  });
});

describe('player accumulators', () => {
  it('tickEnergy adds rate · deltaSec', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff3b6b);
    tickEnergy(p, 0.5, 5);
    expect(p.energy).toBeCloseTo(2.5, 6);
  });

  it('tickBuildAction converts every 5 actions to one disruption charge', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff3b6b);
    for (let i = 0; i < 5; i++) tickBuildAction(p);
    expect(p.disruptionCharges).toBe(1);
    expect(p.buildActions).toBe(0);
  });

  it('caps disruption charges at MAX_DISRUPTION_CHARGES (2)', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff3b6b);
    for (let i = 0; i < 50; i++) tickBuildAction(p);
    expect(p.disruptionCharges).toBe(2);
  });
});
