/**
 * SPARK — S177 P2 (owner) — THE WALK GAIT IS DRIVEN BY GROUND COVERED.
 *
 * Owner: *"the dire wolves' legs move too quickly when he's running, it looks like a cartoon ... It's
 * not that he's running too quickly, it's that they're moving like four times quicker — it looks like
 * he's running in place. Also the goblin hound is the same. Also Vlad the boss ... Just slow it down,
 * make him look like he's actually running according to his real speed."*
 */
import { describe, expect, it } from 'vitest';
import { WALK_PX_PER_FRAME, gaitFrameIndex } from './goblinRenderer.ts';

describe('S177 P2 — the gait advances on DISTANCE, not on ticks', () => {
  it('a creature that has not moved holds frame 0 — no running in place', () => {
    expect(gaitFrameIndex(0, 12)).toBe(0);
    // The whole defect: a tick-driven row advanced here. A distance-driven one cannot.
    expect(gaitFrameIndex(WALK_PX_PER_FRAME - 1, 12)).toBe(0);
  });

  it('one frame per WALK_PX_PER_FRAME of ground, in order', () => {
    for (let f = 0; f < 12; f++) {
      expect(gaitFrameIndex(f * WALK_PX_PER_FRAME, 12), `frame ${f}`).toBe(f);
    }
  });

  it('loops, so a long run keeps cycling instead of sticking on the last frame', () => {
    expect(gaitFrameIndex(12 * WALK_PX_PER_FRAME, 12)).toBe(0);
    expect(gaitFrameIndex(13 * WALK_PX_PER_FRAME, 12)).toBe(1);
  });

  it('HALF SPEED IS HALF THE LEG RATE — the property the owner actually asked for', () => {
    // Two creatures, same elapsed time, one covering half the ground: the slow one is half as many
    // frames in. Under the old tick-driven index both were on the SAME frame, which is what read as
    // a cartoon.
    const fast = gaitFrameIndex(8 * WALK_PX_PER_FRAME, 12);
    const slow = gaitFrameIndex(4 * WALK_PX_PER_FRAME, 12);
    expect(fast).toBe(8);
    expect(slow).toBe(4);
  });

  it('is his FOUR: the stride is 4x the 14px/frame that shipped', () => {
    // Measured at the reference top speed (~3.47 px/tick): a 12-frame row at ticksPerFrame 4 cycled
    // in 48 ticks = 14 px per frame. He called that "four times quicker" than it should be.
    expect(WALK_PX_PER_FRAME).toBe(14 * 4);
  });

  it('degrades rather than throwing on a missing row or a negative accumulator', () => {
    expect(gaitFrameIndex(100, 0)).toBe(0);
    expect(gaitFrameIndex(-5, 12)).toBe(0);
  });
});
