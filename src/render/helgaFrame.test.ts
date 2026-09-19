import { describe, expect, it } from 'vitest';
import { helgaCell, type HelgaAnimConfig } from './helgaFrame.ts';

const CFG: HelgaAnimConfig = {
  idleFrames: 12,
  walkFrames: 12,
  slapFrames: 12,
  idleTicksPerFrame: 7,
  walkTicksPerFrame: 4,
  windupTicks: 14,
  fireTicks: 12,
  recoverTicks: 12,
};

describe('helgaCell — pure veo-atlas frame selection', () => {
  it('IDLE → idle strip, loops on world.tick / ticksPerFrame', () => {
    expect(helgaCell('IDLE', 0, 0, 0, CFG, false)).toEqual({ state: 'idle', frame: 0 });
    expect(helgaCell('IDLE', 0, 7, 0, CFG, false)).toEqual({ state: 'idle', frame: 1 });
    // wraps after idleFrames*ticksPerFrame = 84 ticks
    expect(helgaCell('IDLE', 0, 84, 0, CFG, false)).toEqual({ state: 'idle', frame: 0 });
  });

  it('WALK → walk strip, brisker cadence', () => {
    expect(helgaCell('WALK', 0, 0, 0, CFG, false)).toEqual({ state: 'walk', frame: 0 });
    expect(helgaCell('WALK', 0, 4, 0, CFG, false)).toEqual({ state: 'walk', frame: 1 });
    expect(helgaCell('WALK', 0, 48, 0, CFG, false)).toEqual({ state: 'walk', frame: 0 }); // wraps at 12*4
  });

  /**
   * ⭐⭐ S185 — THE OWNER'S REPORT, PINNED. *"She walks to attack, she attacks, and then instead of
   * walking back, she's like idle drinking a beer but still moving back. That looks stupid."*
   *
   * S183's patrol translates her while the FSM state is still `IDLE`, so `IDLE` alone cannot decide
   * the row. These four cases are the whole contract, and each one fails on its own if the arm is
   * removed — the `isMoving` branch, the STANDING regression hold, the CADENCE (which catches a fix
   * that returns the walk strip but keeps counting on the idle clock), and the WALK no-op.
   */
  it('⭐ IDLE while MOVING draws the WALK strip — the S185 beer-walk', () => {
    expect(helgaCell('IDLE', 0, 0, 0, CFG, true)).toEqual({ state: 'walk', frame: 0 });
    expect(helgaCell('IDLE', 0, 4, 0, CFG, true)).toEqual({ state: 'walk', frame: 1 });
  });

  it('IDLE while STANDING still draws the idle strip — the regression hold', () => {
    expect(helgaCell('IDLE', 0, 4, 0, CFG, false)).toEqual({ state: 'idle', frame: 0 });
    expect(helgaCell('IDLE', 0, 7, 0, CFG, false)).toEqual({ state: 'idle', frame: 1 });
  });

  /**
   * ⛔ THE CADENCE IS THE HALF A CARELESS FIX GETS WRONG. Returning the walk STRIP while still
   * indexing it on `idleTicksPerFrame` (7) would pass a strip-only assertion and animate at the
   * wrong speed on screen. At tick 7 the walk clock (4) is already on frame 1, and the idle clock
   * would say frame 1 too — so the discriminating tick is 4, where they disagree.
   */
  it('⛔ a MOVING idle indexes on the WALK clock, not the idle clock', () => {
    expect(helgaCell('IDLE', 0, 4, 0, CFG, true).frame).toBe(1);   // walk clock: 4/4
    expect(helgaCell('IDLE', 0, 4, 0, CFG, false).frame).toBe(0);  // idle clock: 4/7
    // and it wraps on the walk period (48), not the idle one (84)
    expect(helgaCell('IDLE', 0, 48, 0, CFG, true)).toEqual({ state: 'walk', frame: 0 });
  });

  it('an explicit WALK is unaffected by isMoving either way', () => {
    expect(helgaCell('WALK', 0, 4, 0, CFG, true)).toEqual(helgaCell('WALK', 0, 4, 0, CFG, false));
  });

  it('the moving-idle selection is deterministic, like every other arm', () => {
    expect(helgaCell('IDLE', 3, 123, 5, CFG, true)).toEqual(helgaCell('IDLE', 3, 123, 5, CFG, true));
  });

  it('WINDUP/FIRE/RECOVER → slap strip, phased across the whole attack window', () => {
    // WINDUP start = frame 0
    expect(helgaCell('WINDUP', 0, 0, 0, CFG, false)).toEqual({ state: 'slap', frame: 0 });
    // FIRE entry lands partway in (windup is 14/38 of the window → ~frame 4)
    expect(helgaCell('FIRE', 0, 0, 0, CFG, false)).toEqual({ state: 'slap', frame: 4 });
    // RECOVER end clamps to the last frame
    const last = helgaCell('RECOVER', CFG.recoverTicks, 0, 0, CFG, false);
    expect(last.state).toBe('slap');
    expect(last.frame).toBe(CFG.slapFrames - 1);
  });

  it('frame index is always in-range for every state + tick (no OOB texture)', () => {
    for (const st of ['IDLE', 'WALK', 'WINDUP', 'FIRE', 'RECOVER'] as const) {
      for (let t = 0; t < 500; t++) {
        const c = helgaCell(st, t, t, t, CFG, false);
        const max = c.state === 'idle' ? CFG.idleFrames : c.state === 'walk' ? CFG.walkFrames : CFG.slapFrames;
        expect(c.frame).toBeGreaterThanOrEqual(0);
        expect(c.frame).toBeLessThan(max);
      }
    }
  });

  it('is deterministic — same inputs give the same cell (host == client)', () => {
    expect(helgaCell('WALK', 3, 123, 5, CFG, false)).toEqual(helgaCell('WALK', 3, 123, 5, CFG, false));
    expect(helgaCell('IDLE', 0, 50, 2, CFG, false)).toEqual(helgaCell('IDLE', 0, 50, 2, CFG, false));
  });

  it('per-instance phase desyncs the loop across different ids', () => {
    // two ids at the same tick can land on different idle frames (anti-unison)
    const a = helgaCell('IDLE', 0, 0, 0, CFG, false).frame;
    const b = helgaCell('IDLE', 0, 0, 3, CFG, false).frame; // phase = 15 ticks → frame 2
    expect(b).not.toBe(a);
  });
});
