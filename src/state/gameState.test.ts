import { describe, expect, it } from 'vitest';
import {
  PHASE_1_WIN_SCORE,
  PHYSICS_HZ,
  SparkType,
} from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { dispatch, makeWorld } from './world.ts';
import {
  makeGameStateExtras,
  softReset,
  tickGameState,
} from './gameState.ts';
import { tickScoring } from './scoring.ts';

const P1 = asPlayerId(0);

// Each call places one anchor (no target) → +SCORE_ANCHOR (=1) to scoreProgress.
function placeOne(world: ReturnType<typeof makeWorld>, idx: number): void {
  const s = makeFreeSpark({
    id: asSparkId(idx),
    type: SparkType.Dot,
    pos: { x: 100 + idx, y: 100 },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: world.tick,
  });
  dispatch(world, { type: 'SPAWN_SPARK', spark: s });
  dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1, pos: { x: s.pos.x, y: s.pos.y } });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: P1,
    targetPrimitiveId: null,
    stiffnessTier: 'MID',
  });
}

describe('Game-state FSM (Phase 1 abridged)', () => {
  it('starts in PLAYING and stays there below the win threshold', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    expect(w.gameState).toBe('PLAYING');
    for (let i = 0; i < 5; i++) placeOne(w, i); // complexity 5 (5 isolated anchors)
    for (let t = 0; t < 20; t++) tickScoring(w); // a little income, well under threshold
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('PLAYING');
    expect(w.scoreProgress).toBeGreaterThan(0); // income is accruing
    expect(Math.floor(w.scoreProgress)).toBeLessThan(PHASE_1_WIN_SCORE);
  });

  it('PLAYING → WIN when income reaches PHASE_1_WIN_SCORE', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    for (let i = 0; i < 20; i++) placeOne(w, i); // complexity 20 (S110 P1: WIN 786→1500, more income needed)
    // Accrue per-tick income until the floored threshold is reached. Cap is generous so the loop
    // is bounded by the SCORE condition (reaches 1500 at ~90k ticks @ cx20/60Hz), not the iteration cap.
    for (let t = 0; t < 150000 && Math.floor(w.scoreProgress) < PHASE_1_WIN_SCORE; t++) tickScoring(w);
    expect(Math.floor(w.scoreProgress)).toBeGreaterThanOrEqual(PHASE_1_WIN_SCORE);
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P1);
    expect(ex.winEnteredTick).toBe(w.tick);
  });

  it('WIN → POSTGAME after dwell ticks', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    // Reach the threshold directly — this test is about the WIN→POSTGAME dwell, not accrual.
    w.scoreByPlayer.set(P1, PHASE_1_WIN_SCORE);
    w.scoreProgress = PHASE_1_WIN_SCORE;
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('WIN');
    // Advance the simulated clock past the dwell.
    w.tick += PHYSICS_HZ * 3;
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('POSTGAME');
  });

  it('softReset clears world state and resets scoreProgress', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    for (let i = 0; i < 3; i++) placeOne(w, i);
    for (let t = 0; t < 50; t++) tickScoring(w); // accrue some income
    expect(w.primitives.size).toBe(3);
    expect(w.scoreProgress).toBeGreaterThan(0);
    softReset(w, ex);
    expect(w.gameState).toBe('PLAYING');
    expect(w.primitives.size).toBe(0);
    expect(w.bonds.size).toBe(0);
    expect(w.freeSparks.size).toBe(0);
    expect(w.scoreProgress).toBe(0);
    expect(w.players.get(P1)!.energy).toBe(0);
  });
});
