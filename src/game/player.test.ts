import { describe, expect, it } from 'vitest';
import { asPlayerId, asSparkId } from '../types.ts';
import { defaultRaceForSeat } from '../state/races.ts';
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

describe('W1-A (S160) — the carry FSM preserves raceId', () => {
  /**
   * ⛔ `pickup` and `drop` REBUILD the player wholesale, and this file's own subject carries a
   * standing warning that a field omitted from those literals is silently RESET. For `raceId` that
   * would re-race a seat the instant its player touched a spark — the castle would change colour
   * mid-match, with nothing red, because colour is not hashed.
   *
   * tsc catches a straight omission because the field is required. It does NOT catch a literal that
   * writes a *default* instead of copying, which is the shape the `raidPoints` deserializer defect
   * took, so these assert the COPY rather than merely the presence.
   */
  it('⭐ pickup then drop round-trips a NON-DEFAULT race unchanged', () => {
    const seat = asPlayerId(0);
    // Deliberately not seat 0's default, so "reset to default" is distinguishable from "preserved".
    const p = makeIdlePlayer(seat, 0xff3b6b, { x: 0, y: 0 }, 'demons');
    expect(p.raceId).toBe('demons');
    expect(p.raceId, 'the fixture must differ from the default or this proves nothing').not.toBe(
      defaultRaceForSeat(0),
    );

    const carrying = pickup(p, asSparkId(1));
    expect(carrying.raceId, 'pickup rebuilds the player — the race must come along').toBe('demons');

    const idle = drop(carrying);
    expect(idle.raceId, 'and so must drop').toBe('demons');
  });

  it('the factory defaults the race from the SEAT when none is given', () => {
    for (const seat of [0, 1, 2, 3]) {
      expect(makeIdlePlayer(asPlayerId(seat), 0x000000).raceId).toBe(defaultRaceForSeat(seat));
    }
  });
});
