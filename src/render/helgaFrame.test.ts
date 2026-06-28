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
    expect(helgaCell('IDLE', 0, 0, 0, CFG)).toEqual({ state: 'idle', frame: 0 });
    expect(helgaCell('IDLE', 0, 7, 0, CFG)).toEqual({ state: 'idle', frame: 1 });
    // wraps after idleFrames*ticksPerFrame = 84 ticks
    expect(helgaCell('IDLE', 0, 84, 0, CFG)).toEqual({ state: 'idle', frame: 0 });
  });

  it('WALK → walk strip, brisker cadence', () => {
    expect(helgaCell('WALK', 0, 0, 0, CFG)).toEqual({ state: 'walk', frame: 0 });
    expect(helgaCell('WALK', 0, 4, 0, CFG)).toEqual({ state: 'walk', frame: 1 });
    expect(helgaCell('WALK', 0, 48, 0, CFG)).toEqual({ state: 'walk', frame: 0 }); // wraps at 12*4
  });

  it('WINDUP/FIRE/RECOVER → slap strip, phased across the whole attack window', () => {
    // WINDUP start = frame 0
    expect(helgaCell('WINDUP', 0, 0, 0, CFG)).toEqual({ state: 'slap', frame: 0 });
    // FIRE entry lands partway in (windup is 14/38 of the window → ~frame 4)
    expect(helgaCell('FIRE', 0, 0, 0, CFG)).toEqual({ state: 'slap', frame: 4 });
    // RECOVER end clamps to the last frame
    const last = helgaCell('RECOVER', CFG.recoverTicks, 0, 0, CFG);
    expect(last.state).toBe('slap');
    expect(last.frame).toBe(CFG.slapFrames - 1);
  });

  it('frame index is always in-range for every state + tick (no OOB texture)', () => {
    for (const st of ['IDLE', 'WALK', 'WINDUP', 'FIRE', 'RECOVER'] as const) {
      for (let t = 0; t < 500; t++) {
        const c = helgaCell(st, t, t, t, CFG);
        const max = c.state === 'idle' ? CFG.idleFrames : c.state === 'walk' ? CFG.walkFrames : CFG.slapFrames;
        expect(c.frame).toBeGreaterThanOrEqual(0);
        expect(c.frame).toBeLessThan(max);
      }
    }
  });

  it('is deterministic — same inputs give the same cell (host == client)', () => {
    expect(helgaCell('WALK', 3, 123, 5, CFG)).toEqual(helgaCell('WALK', 3, 123, 5, CFG));
    expect(helgaCell('IDLE', 0, 50, 2, CFG)).toEqual(helgaCell('IDLE', 0, 50, 2, CFG));
  });

  it('per-instance phase desyncs the loop across different ids', () => {
    // two ids at the same tick can land on different idle frames (anti-unison)
    const a = helgaCell('IDLE', 0, 0, 0, CFG).frame;
    const b = helgaCell('IDLE', 0, 0, 3, CFG).frame; // phase = 15 ticks → frame 2
    expect(b).not.toBe(a);
  });
});
