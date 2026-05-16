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

  // S34 PB-6 — direct coverage for applyUpdateAvatarPos reducer (1v1
  // client→host net path: client dispatches UPDATE_AVATAR_POS each input
  // frame; host applies + serializes via NetSnapshot). Previously only
  // covered transitively through net-sync integration tests.
  it('UPDATE_AVATAR_POS mutates target player avatarPos', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    const p1Before = w.players.get(P1)!.avatarPos;
    expect(p1Before).toBeDefined();
    dispatch(w, { type: 'UPDATE_AVATAR_POS', playerId: P1, pos: { x: 777, y: 888 } });
    expect(w.players.get(P1)!.avatarPos).toEqual({ x: 777, y: 888 });
  });

  it('UPDATE_AVATAR_POS on missing player is a silent no-op (no crash)', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: 'solo', isHost: true });
    // P2 not present in solo mode. Reducer must silently skip.
    const before = w.players.size;
    dispatch(w, { type: 'UPDATE_AVATAR_POS', playerId: P2, pos: { x: 50, y: 50 } });
    expect(w.players.size).toBe(before);
    expect(w.players.has(P2)).toBe(false);
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

  // S31 P0-2 — Phase-2 cinematic/creature state cleanup. Pre-S31 these 6
  // fields were left untouched by applyReturnToTitle; mid-cinematic title-
  // return (POSTGAME click, lobby back, peer-drop via onReturnFromConnectionLost)
  // left orphaned creatures + stuck cinematic flags + queued spawn fires.
  it('S31 P0-2 — clears all 6 Phase-2 cinematic/creature fields (creatures, nextCreatureId, activeCinematicPlayerId, currentCinematicEvent, pendingCinematics, pendingCreatureSpawn)', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });

    const fakeEvent = {
      godlyId: 'voltkin' as const,
      triggererPlayerId: P1,
      targetComponentPrimitiveIds: [],
      targetPos: { x: 100, y: 100 },
      triggerTick: w.tick,
    };
    // Populate cinematic state directly (would normally come from GODLY_TRIGGER
    // matcher in main.ts). Tests target the reducer cleanup invariant in
    // isolation from the trigger path.
    w.activeCinematicPlayerId = P1;
    w.currentCinematicEvent = fakeEvent;
    w.pendingCinematics.push(fakeEvent);
    w.pendingCreatureSpawn = { fireAtTick: w.tick + 288, event: fakeEvent };
    dispatch(w, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: P1,
      pos: { x: 100, y: 100 },
      targetPos: { x: 200, y: 200 },
    });
    expect(w.creatures.size).toBe(1);
    expect(w.nextCreatureId).toBe(1);

    dispatch(w, { type: 'RETURN_TO_TITLE' });

    expect(w.creatures.size).toBe(0);
    expect(w.nextCreatureId).toBe(0);
    expect(w.activeCinematicPlayerId).toBeNull();
    expect(w.currentCinematicEvent).toBeNull();
    expect(w.pendingCinematics).toEqual([]);
    expect(w.pendingCreatureSpawn).toBeNull();
  });

  // S31 P0-2 (Gemini E-01 INVARIANT — adopted per Council R1) — the
  // "creature exists AND cinematic still active" state window is closed
  // after RETURN_TO_TITLE. Codifies the post-clear invariant that PRIME-AUDIT
  // verified during the P0-1A spawn-timing decision.
  it('S31 P0-2 / E-01 — post-RETURN_TO_TITLE: creatures+activeCinematic overlap is FALSE', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.activeCinematicPlayerId = P1;
    dispatch(w, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: P1,
      pos: { x: 100, y: 100 },
      targetPos: { x: 200, y: 200 },
    });
    // Pre-clear: invariant violated (this is the buggy state we're cleaning).
    expect(w.creatures.size > 0 && w.activeCinematicPlayerId !== null).toBe(true);

    dispatch(w, { type: 'RETURN_TO_TITLE' });

    // Post-clear: invariant restored.
    expect(w.creatures.size > 0 && w.activeCinematicPlayerId !== null).toBe(false);
  });

  // S31 P0-2 (Gemini T-01 — adopted per Council R1) — peer-drop mid-cinematic
  // via GODLY_ABORT also clears state. After P0-4 deleted main.ts cinematicTimer,
  // the peer-drop path now relies solely on cutsceneOverlay.abort() (which
  // sweeps overlay-owned timers) + dispatch(GODLY_ABORT) for state clear.
  // This test confirms GODLY_ABORT still does the comprehensive clear (it
  // already did pre-S31; this is a regression baseline that P0-4 didn't break it).
  it('S31 P0-2 T-01 — GODLY_ABORT (peer-drop path) clears all cinematic + creature state', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });

    const fakeEvent = {
      godlyId: 'voltkin' as const,
      triggererPlayerId: P1,
      targetComponentPrimitiveIds: [],
      targetPos: { x: 100, y: 100 },
      triggerTick: w.tick,
    };
    w.activeCinematicPlayerId = P1;
    w.currentCinematicEvent = fakeEvent;
    w.pendingCinematics.push(fakeEvent);
    w.pendingCreatureSpawn = { fireAtTick: w.tick + 288, event: fakeEvent };
    dispatch(w, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: P1,
      pos: { x: 100, y: 100 },
      targetPos: { x: 200, y: 200 },
    });
    expect(w.creatures.size).toBe(1);

    dispatch(w, { type: 'GODLY_ABORT' });

    expect(w.creatures.size).toBe(0);
    expect(w.activeCinematicPlayerId).toBeNull();
    expect(w.currentCinematicEvent).toBeNull();
    expect(w.pendingCinematics).toEqual([]);
    expect(w.pendingCreatureSpawn).toBeNull();
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
