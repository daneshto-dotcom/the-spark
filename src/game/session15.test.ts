/**
 * SPARK — Session 15 tests:
 *   P2: Networked 1v1 (Trystero/Nostr) — FSM extension (TITLE/LOBBY),
 *       gameMode + currentPlayerId + scoreByPlayer + isHost, START_GAME /
 *       END_TURN / RETURN_TO_TITLE actions, host-side input sanitization
 *       (Gemini R1 BLOCKER), per-player score tracking + winner attribution.
 *
 *   Test groups:
 *     A · gameState FSM extension (TITLE/LOBBY/PLAYING/POSTGAME→TITLE)
 *     B · 1v1 hotseat reducer gates (inactive player rejected)
 *     C · END_TURN flips currentPlayerId + guards
 *     D · scoreByPlayer per-player tracking + winner attribution
 *     E · RETURN_TO_TITLE clears state + drops P2
 *     F · Save format compat: scoreByPlayer + gameMode roundtrip
 */

import { describe, expect, it } from 'vitest';
import { PHASE_1_WIN_SCORE, PHYSICS_HZ, SCORE_ANCHOR, SparkType } from '../constants.ts';
import { makeFreeSpark } from './spark.ts';
import { asPlayerId, asSparkId, type PrimitiveId } from '../types.ts';
import { addScore, dispatch, makeWorld } from '../state/world.ts';
import { makeGameStateExtras, tickGameState } from '../state/gameState.ts';
import { snapshot, restore } from '../state/save.ts';

const P1 = asPlayerId(0);
const P2 = asPlayerId(1);
const PHYSICS_DT = 1 / PHYSICS_HZ;

function placeAnchor(world: ReturnType<typeof makeWorld>, sparkRawId: number, playerId = P1, x = 100, y = 100): PrimitiveId {
  const s = makeFreeSpark({
    id: asSparkId(sparkRawId),
    type: SparkType.Dot,
    pos: { x, y },
    velocity: { x: 0, y: 0 },
    dt: PHYSICS_DT,
    createdTick: world.tick,
  });
  dispatch(world, { type: 'SPAWN_SPARK', spark: s });
  dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId,
    targetPrimitiveId: null,
    stiffnessTier: 'MID',
  });
  return [...world.primitives.keys()][world.primitives.size - 1];
}

// ============================================================================
// A · gameState FSM extension
// ============================================================================

describe('S15 P2 — gameState FSM extension', () => {
  it('makeWorld defaults gameState to PLAYING (test contract) and main.ts boot overrides', () => {
    const w = makeWorld(0);
    expect(w.gameState).toBe('PLAYING');
    expect(w.gameMode).toBe('solo');
    expect(w.currentPlayerId).toBe(P1);
    expect(w.isHost).toBe(true);
  });

  it('TITLE → solo PLAYING via START_GAME(mode=solo)', () => {
    const w = makeWorld(0);
    w.gameState = 'TITLE';
    dispatch(w, { type: 'START_GAME', mode: 'solo', isHost: true });
    expect(w.gameState).toBe('PLAYING');
    expect(w.gameMode).toBe('solo');
    expect(w.players.size).toBe(1); // P1 only
  });

  it('TITLE → 1v1 PLAYING via START_GAME(mode=1v1) adds P2 with cyan color', () => {
    const w = makeWorld(0);
    w.gameState = 'LOBBY';
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    expect(w.gameState).toBe('PLAYING');
    expect(w.gameMode).toBe('1v1');
    expect(w.players.size).toBe(2);
    const p2 = w.players.get(P2);
    expect(p2).toBeDefined();
    expect(p2!.color).toBe(0x3bd7ff); // PLAYER_COLORS[1] cyan
    expect(w.scoreByPlayer.get(P2)).toBe(0);
  });

  it('tickGameState is a no-op in TITLE and LOBBY', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    w.gameState = 'TITLE';
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('TITLE');
    w.gameState = 'LOBBY';
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('LOBBY');
  });
});

// ============================================================================
// B · 1v1 hotseat reducer gates (Gemini R1 BLOCKER)
// ============================================================================

describe('S15 P2 — 1v1 hotseat reducer gates', () => {
  it('PICKUP_SPARK by inactive player is silently rejected', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    expect(w.currentPlayerId).toBe(P1);

    const s = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      dt: PHYSICS_DT,
      createdTick: 0,
    });
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });

    // P2 attempts to PICKUP during P1's turn → silently rejected (no throw).
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P2 });
    expect(s.state.kind).toBe('Free'); // unchanged
    expect(w.players.get(P2)!.kind).toBe('Idle'); // unchanged

    // P1 (active) PICKUP succeeds.
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    expect(s.state.kind).toBe('Carried');
  });

  it('PLACE_PRIMITIVE by inactive player is silently rejected', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    // P1 picks up so we have a carried spark on P1's account.
    const s = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      dt: PHYSICS_DT,
      createdTick: 0,
    });
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });

    // Inactive-player PLACE rejected; no primitive created; P1 still carrying.
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P2,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    expect(w.primitives.size).toBe(0);
    expect(w.players.get(P1)!.kind).toBe('Carrying');

    // Active P1 PLACE succeeds.
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    expect(w.primitives.size).toBe(1);
  });

  it('solo mode does not enforce inactive-player gate (back-compat)', () => {
    const w = makeWorld(0);
    // solo init: gameMode='solo', currentPlayerId=P1.
    const s = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      dt: PHYSICS_DT,
      createdTick: 0,
    });
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    // Despite passing P1 (which IS the active player anyway), gate is bypassed.
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    expect(s.state.kind).toBe('Carried');
  });
});

// ============================================================================
// C · END_TURN flips currentPlayerId + guards
// ============================================================================

describe('S15 P2 — END_TURN action', () => {
  it('flips currentPlayerId 0 → 1 → 0 in 1v1 PLAYING', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    expect(w.currentPlayerId).toBe(P1);
    dispatch(w, { type: 'END_TURN' });
    expect(w.currentPlayerId).toBe(P2);
    dispatch(w, { type: 'END_TURN' });
    expect(w.currentPlayerId).toBe(P1);
  });

  it('is a no-op in solo mode', () => {
    const w = makeWorld(0);
    // solo default
    dispatch(w, { type: 'END_TURN' });
    expect(w.currentPlayerId).toBe(P1); // unchanged
  });

  it('is a no-op when gameState != PLAYING', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'WIN';
    dispatch(w, { type: 'END_TURN' });
    expect(w.currentPlayerId).toBe(P1); // unchanged
  });
});

// ============================================================================
// D · scoreByPlayer + winner attribution
// ============================================================================

describe('S15 P2 — scoreByPlayer + winner attribution', () => {
  it('addScore writes to scoreByPlayer in solo and per-player in 1v1', () => {
    const w = makeWorld(0);
    addScore(w, P1, 5);
    expect(w.scoreByPlayer.get(P1)).toBe(5);
    expect(w.scoreProgress).toBe(5); // solo additive

    // Switch to 1v1 and add for P2.
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    addScore(w, P2, 7);
    expect(w.scoreByPlayer.get(P2)).toBe(7);
    // In 1v1, scoreProgress = max(scoreByPlayer.values()) = max(5, 7) = 7
    expect(w.scoreProgress).toBe(7);
    addScore(w, P1, 10); // P1 now 15, P2 still 7
    expect(w.scoreByPlayer.get(P1)).toBe(15);
    expect(w.scoreProgress).toBe(15); // P1 is now leader
  });

  it('1v1 WIN_TRIGGER attributes winner to the highest-score player', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    // P2 wins by crossing threshold first.
    addScore(w, P2, PHASE_1_WIN_SCORE);
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P2);
  });

  it('solo win attributes to primaryPlayerId (P1)', () => {
    const w = makeWorld(0);
    const ex = makeGameStateExtras();
    // Reach threshold via direct anchors.
    for (let i = 0; i < PHASE_1_WIN_SCORE / SCORE_ANCHOR; i++) {
      placeAnchor(w, i, P1, 100 + i, 100);
    }
    tickGameState(w, ex, P1);
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P1);
  });
});

// ============================================================================
// E · RETURN_TO_TITLE clears state + drops P2
// ============================================================================

describe('S15 P2 — RETURN_TO_TITLE', () => {
  it('clears world state + drops P2 + resets scoreProgress', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    placeAnchor(w, 0, P1, 100, 100);
    placeAnchor(w, 1, P1, 200, 200);
    expect(w.primitives.size).toBe(2);
    expect(w.players.size).toBe(2);

    dispatch(w, { type: 'RETURN_TO_TITLE' });
    expect(w.gameState).toBe('TITLE');
    expect(w.gameMode).toBe('solo');
    expect(w.currentPlayerId).toBe(P1);
    expect(w.primitives.size).toBe(0);
    expect(w.bonds.size).toBe(0);
    expect(w.players.size).toBe(1); // P2 removed
    expect(w.scoreProgress).toBe(0);
    expect(w.scoreByPlayer.get(P1)).toBe(0);
    expect(w.scoreByPlayer.has(P2)).toBe(false);
  });
});

// ============================================================================
// F · Save format compat: scoreByPlayer + gameMode roundtrip
// ============================================================================

describe('S15 P2 — save format', () => {
  it('snapshot/restore preserves gameMode + currentPlayerId + scoreByPlayer', () => {
    const w1 = makeWorld(0);
    dispatch(w1, { type: 'START_GAME', mode: '1v1', isHost: true });
    addScore(w1, P1, 12);
    addScore(w1, P2, 8);
    dispatch(w1, { type: 'END_TURN' });

    const snap = snapshot(w1);
    expect(snap.gameMode).toBe('1v1');
    expect(snap.currentPlayerId).toBe(P2);
    expect(snap.scoreByPlayer).toEqual(expect.arrayContaining([[P1, 12], [P2, 8]]));

    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snap)), w2);
    expect(w2.gameMode).toBe('1v1');
    expect(w2.currentPlayerId).toBe(P2);
    expect(w2.scoreByPlayer.get(P1)).toBe(12);
    expect(w2.scoreByPlayer.get(P2)).toBe(8);
  });

  it('snapshot/restore preserves Player.avatarPos', () => {
    const w1 = makeWorld(0);
    const p1 = w1.players.get(P1)!;
    p1.avatarPos.x = 555;
    p1.avatarPos.y = 777;
    const snap = snapshot(w1);
    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snap)), w2);
    expect(w2.players.get(P1)!.avatarPos).toEqual({ x: 555, y: 777 });
  });

  it('pre-S15 save without gameMode/currentPlayerId/scoreByPlayer defaults to solo', () => {
    const w1 = makeWorld(0);
    const snap = snapshot(w1);
    // Strip the S15 fields to simulate pre-S15 save.
    const legacySnap = { ...snap } as Record<string, unknown>;
    delete legacySnap.gameMode;
    delete legacySnap.currentPlayerId;
    delete legacySnap.scoreByPlayer;
    const w2 = makeWorld(0);
    restore(legacySnap as never, w2);
    expect(w2.gameMode).toBe('solo');
    expect(w2.currentPlayerId).toBe(P1);
    expect(w2.scoreByPlayer.size).toBe(0); // no entries when field absent
  });
});
