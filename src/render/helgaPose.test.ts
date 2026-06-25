/**
 * SPARK — S103 P4 (#10) helgaPose tests.
 *
 * The pose function is pure + deterministic (replay-safe), and produces DISTINCT, authored poses per
 * FSM state — proving HELGA is a real articulated character (a genuine wind-up→impact→recover slap
 * arc), NOT a single-transform twitch.
 */

import { describe, expect, it } from 'vitest';
import { helgaPose } from './helgaPose.ts';
import { PRINCESS_WINDUP_TICKS } from '../constants.ts';

describe('helgaPose — pure + deterministic', () => {
  it('same (state, ticksInState, phaseTick) → identical pose (replay-safe)', () => {
    expect(helgaPose('FIRE', 0, 1234)).toEqual(helgaPose('FIRE', 0, 1234));
    expect(helgaPose('IDLE', 7, 42)).toEqual(helgaPose('IDLE', 7, 42));
  });

  it('a full state×ticks sweep never produces NaN (every field finite)', () => {
    for (const state of ['IDLE', 'WINDUP', 'FIRE', 'RECOVER'] as const) {
      for (let t = 0; t <= 30; t++) {
        const p = helgaPose(state, t, t * 13);
        for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('a per-defender offset DESYNCS the idle ambient across instances (Council CHECK — not robotic unison)', () => {
    // Two HELGAs at the same world.tick but different ids must NOT share an idle phase.
    let anyDiff = false;
    for (let t = 0; t < 120; t++) {
      const a = helgaPose('IDLE', 0, t, 0);
      const b = helgaPose('IDLE', 0, t, 5);
      if (a.bodyBobY !== b.bodyBobY || a.sip !== b.sip) anyDiff = true;
    }
    expect(anyDiff).toBe(true);
  });
});

describe('helgaPose — the slap is a real arc (distinct authored poses)', () => {
  it('WINDUP winds the slap-arm BACK (more negative as the windup progresses)', () => {
    const early = helgaPose('WINDUP', 1, 0).slapArmAngle;
    const late = helgaPose('WINDUP', PRINCESS_WINDUP_TICKS, 0).slapArmAngle;
    expect(late).toBeLessThan(early); // arm rotates further back over the wind-up
  });

  it('FIRE snaps the slap-arm ACROSS the front (positive) with a forward reach at impact', () => {
    const impact = helgaPose('FIRE', 0, 0);
    expect(impact.slapArmAngle).toBeGreaterThan(1); // slapped across the front
    expect(impact.slapReach).toBeGreaterThan(0); // hand thrusts out at the moment of impact
  });

  it('RECOVER eases the arm back toward rest (less extended than the FIRE peak)', () => {
    const fire = helgaPose('FIRE', 0, 0).slapArmAngle;
    const recovered = helgaPose('RECOVER', 12, 0).slapArmAngle;
    expect(recovered).toBeLessThan(fire); // returning home
  });

  it('IDLE has no slap reach + a periodic beer-sip is reachable across the cycle', () => {
    expect(helgaPose('IDLE', 0, 0).slapReach).toBe(0);
    // Somewhere in the idle phase cycle the stein raises to sip (sip > 0).
    let maxSip = 0;
    for (let t = 0; t < 90; t++) maxSip = Math.max(maxSip, helgaPose('IDLE', 0, t).sip);
    expect(maxSip).toBeGreaterThan(0);
  });
});
