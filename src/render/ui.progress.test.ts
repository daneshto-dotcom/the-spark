import { describe, expect, it } from 'vitest';
import { progressBarFractions } from './ui.ts';
import { LEADER_DECAY_THRESHOLD_FRACTION, PHASE_1_WIN_SCORE } from '../constants.ts';
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
