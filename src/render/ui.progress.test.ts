import { describe, expect, it } from 'vitest';
import { progressBarFractions } from './ui.ts';
import { PHASE_1_WIN_SCORE } from '../constants.ts';
import { asPlayerId } from '../types.ts';

/**
 * S106 P4 — pins the fix for the owner's "I had almost full victory points after my friend won the
 * NONET, but my points should have been cut in half." The main progress bar used to read
 * world.scoreProgress = max-of-all-players (the LEADER), so the owner's own halving was invisible on
 * it. progressBarFractions.own now tracks the LOCAL player's own score; .leader keeps the max for the
 * ghost-tick. These tests lock: own ≠ leader when you're behind, and own DROPS on a NONET loss.
 */
const mk = (scores: Array<[number, number]>, localId: number) => {
  const scoreByPlayer = new Map(scores.map(([id, s]) => [asPlayerId(id), s]));
  const scoreProgress = Math.max(0, ...scores.map(([, s]) => s));
  return { scoreByPlayer, localPlayerId: asPlayerId(localId), scoreProgress };
};

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
