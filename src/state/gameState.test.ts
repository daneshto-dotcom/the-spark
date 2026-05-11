import { describe, expect, it } from 'vitest';
import {
  PHASE_1_WIN_SCORE,
  PHYSICS_HZ,
  SCORE_ANCHOR,
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
  dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: P1,
    targetPrimitiveId: null,
    stiffnessTier: 'MID',
  });
}

// PHASE_1_WIN_SCORE / SCORE_ANCHOR placements of anchors → exactly score threshold.
const ANCHORS_TO_WIN = PHASE_1_WIN_SCORE / SCORE_ANCHOR;

describe('Game-state FSM (Phase 1 abridged)', () => {
  it('starts in PLAYING and stays there until threshold reached', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    expect(w.gameState).toBe('PLAYING');
    for (let i = 0; i < 5; i++) placeOne(w, i);
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('PLAYING');
    expect(w.scoreProgress).toBe(5);
  });

  it('PLAYING → WIN at PHASE_1_WIN_SCORE', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    for (let i = 0; i < ANCHORS_TO_WIN; i++) placeOne(w, i);
    expect(w.scoreProgress).toBeGreaterThanOrEqual(PHASE_1_WIN_SCORE);
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P1);
    expect(ex.winEnteredTick).toBe(w.tick);
  });

  it('WIN → POSTGAME after dwell ticks', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    for (let i = 0; i < ANCHORS_TO_WIN; i++) placeOne(w, i);
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
    expect(w.primitives.size).toBe(3);
    expect(w.scoreProgress).toBe(3);
    softReset(w, ex);
    expect(w.gameState).toBe('PLAYING');
    expect(w.primitives.size).toBe(0);
    expect(w.bonds.size).toBe(0);
    expect(w.freeSparks.size).toBe(0);
    expect(w.scoreProgress).toBe(0);
    expect(w.players.get(P1)!.energy).toBe(0);
  });
});
