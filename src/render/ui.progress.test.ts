import { describe, expect, it } from 'vitest';
import { formatPhaseBanner, progressBarFractions } from './ui.ts';
import { LEADER_DECAY_THRESHOLD_FRACTION, PHASE_1_WIN_SCORE, PHASE_DURATION_TICKS, PHYSICS_HZ } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import type { World } from '../state/world.ts';

/**
 * S106 P4 — pins the fix for the owner's "I had almost full victory points after my friend won the
 * NONET, but my points should have been cut in half." The main progress bar used to read
 * world.scoreProgress = max-of-all-players (the LEADER), so the owner's own halving was invisible on
 * it. progressBarFractions.own now tracks the LOCAL player's own score; .leader keeps the max for the
 * ghost-tick. These tests lock: own ≠ leader when you're behind, and own DROPS on a NONET loss.
 * S107 P1 — also pins `ownDecaying` (drives the amber anti-coast tint).
 */
const mk = (scores: Array<[number, number]>, localId: number, gameMode: World['gameMode'] = '1v1') => {
  const scoreByPlayer = new Map(scores.map(([id, s]) => [asPlayerId(id), s]));
  const scoreProgress = Math.max(0, ...scores.map(([, s]) => s));
  return { scoreByPlayer, localPlayerId: asPlayerId(localId), scoreProgress, gameMode };
};
const DECAY_THRESHOLD = PHASE_1_WIN_SCORE * LEADER_DECAY_THRESHOLD_FRACTION; // 589.5

describe('progressBarFractions (S106 P4 — own-score bar + leader ghost)', () => {
  it('own tracks the LOCAL player, not the leader, when you are behind', () => {
    const w = mk([[0, 200], [1, 600]], 0); // you (P0) have 200, opponent leads with 600
    expect(w.scoreProgress).toBe(600);
    expect(progressBarFractions(w).own).toBeCloseTo(200 / PHASE_1_WIN_SCORE, 6);
    expect(progressBarFractions(w).leader).toBeCloseTo(600 / PHASE_1_WIN_SCORE, 6);
  });

  it('own DROPS when your score is cut by a NONET loss (the reported bug)', () => {
    const before = mk([[0, 400], [1, 300]], 0); // you lead with 400
    const after = mk([[0, 160], [1, 600]], 0); // you lost the NONET: 400×0.4=160, friend 300×2=600
    expect(progressBarFractions(after).own).toBeLessThan(progressBarFractions(before).own);
    expect(progressBarFractions(after).leader).toBeCloseTo(600 / PHASE_1_WIN_SCORE, 6); // ghost = friend now
  });

  it('solo: own === leader (single entry)', () => {
    const w = mk([[0, 300]], 0);
    const f = progressBarFractions(w);
    expect(f.own).toBeCloseTo(f.leader, 6);
  });

  it('clamps to 1 at/over the win score', () => {
    const w = mk([[0, PHASE_1_WIN_SCORE + 50], [1, 10]], 0);
    expect(progressBarFractions(w).own).toBe(1);
  });
});

describe('progressBarFractions.ownDecaying (S107 P1 — anti-coast amber cue)', () => {
  it('TRUE when the LOCAL player is the leader AND past the decay threshold', () => {
    const w = mk([[0, DECAY_THRESHOLD + 50], [1, 100]], 0); // you lead, past 75%
    expect(progressBarFractions(w).ownDecaying).toBe(true);
  });

  it('FALSE when you are NOT the leader (someone else is decaying, not you)', () => {
    const w = mk([[0, 200], [1, DECAY_THRESHOLD + 50]], 0); // opponent leads + decays
    expect(progressBarFractions(w).ownDecaying).toBe(false);
  });

  it('FALSE when leading but still BELOW the threshold (no decay yet)', () => {
    const w = mk([[0, DECAY_THRESHOLD - 50], [1, 100]], 0);
    expect(progressBarFractions(w).ownDecaying).toBe(false);
  });

  it('FALSE in solo (decay is exempt there)', () => {
    const w = mk([[0, DECAY_THRESHOLD + 50]], 0, 'solo');
    expect(progressBarFractions(w).ownDecaying).toBe(false);
  });
});

/**
 * S147 P1 — the MATCH CLOCK readout. Pure formatter, so the arithmetic is tested here rather than
 * through a Pixi canvas (the Browser pane cannot be driven headlessly — a hidden pane pauses
 * requestAnimationFrame, so the ticker never advances; same reason `formatTierBanner` is pure).
 */
describe('S147 P1 — formatPhaseBanner', () => {
  it('renders a full fresh phase as the round number of seconds, not one short', () => {
    // CEIL, not floor: a brand-new 5400-tick phase must read 1:30, and only the final tick reads 0:00.
    expect(formatPhaseBanner('BUILD', PHASE_DURATION_TICKS)).toBe('BUILD  1:30');
    expect(formatPhaseBanner('FIGHT', PHASE_DURATION_TICKS)).toBe('FIGHT  1:30');
  });

  it('zero-pads the seconds so the readout never jitters in width', () => {
    expect(formatPhaseBanner('FIGHT', 7 * PHYSICS_HZ)).toBe('FIGHT  0:07');
    expect(formatPhaseBanner('FIGHT', 65 * PHYSICS_HZ)).toBe('FIGHT  1:05');
  });

  it('reaches 0:00 only at the boundary itself', () => {
    expect(formatPhaseBanner('BUILD', 1)).toBe('BUILD  0:01'); // part of a second still remains
    expect(formatPhaseBanner('BUILD', 0)).toBe('BUILD  0:00');
  });

  /**
   * ⛔ THE CLAMP MATTERS AND IS NOT THEORETICAL. `ticksRemaining` can legitimately go NEGATIVE:
   * a joiner advances `world.tick` locally at 60 Hz between 10 Hz snapshots, so it can pass the
   * deadline before the host's flip arrives; and on the host the NONET freeze advances the tick while
   * skipping the flip entirely. Rendering "-0:03" would read as a broken clock, so it floors at 0:00
   * and waits for the authoritative flip.
   */
  it('clamps at 0:00 rather than showing negative time', () => {
    expect(formatPhaseBanner('FIGHT', -1)).toBe('FIGHT  0:00');
    expect(formatPhaseBanner('FIGHT', -PHASE_DURATION_TICKS * 3)).toBe('FIGHT  0:00');
  });

  it('names the phase verbatim, so the label is the sim value and cannot drift from it', () => {
    expect(formatPhaseBanner('BUILD', 0)).toContain('BUILD');
    expect(formatPhaseBanner('FIGHT', 0)).toContain('FIGHT');
  });
});
