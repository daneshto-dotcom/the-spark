/**
 * SPARK — S62 N-player core: deterministic seating, radial spawns, the
 * isNetworked predicate, title-return identity reset, and host intent stamping.
 *
 * These lock the behaviors the 3-peer e2e (P3) exercises at runtime: every
 * client must seat the same players at the same positions from the same ordered
 * roster (cross-client determinism), the 3rd player is yellow, and the host
 * stamps intents by sender seat (anti-spoof).
 */

import { describe, it, expect } from 'vitest';
import {
  applyReturnToTitle,
  applyStartGame,
  isNetworked,
  radialSpawnPos,
  type StartGameAction,
} from './gameMode.ts';
import { makeWorld } from './world.ts';
import { stampSenderSeat } from '../net/intentStamp.ts';
import { asPlayerId } from '../types.ts';
import { PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS } from '../constants.ts';

const RIM = SPAWNER_RADIUS + 40; // 290
const LEFT = { x: SPAWNER_CENTER_X - SPAWNER_RADIUS - 40, y: SPAWNER_CENTER_Y }; // 670,540
const RIGHT = { x: SPAWNER_CENTER_X + SPAWNER_RADIUS + 40, y: SPAWNER_CENTER_Y }; // 1250,540
const distFromCenter = (p: { x: number; y: number }): number =>
  Math.hypot(p.x - SPAWNER_CENTER_X, p.y - SPAWNER_CENTER_Y);

const roster3 = [
  { seat: 0, color: PLAYER_COLORS[0] },
  { seat: 1, color: PLAYER_COLORS[1] },
  { seat: 2, color: PLAYER_COLORS[2] },
];

describe('S62 — radialSpawnPos (deterministic per-seat rim placement)', () => {
  it('N=2 reproduces the historical left/right positions EXACTLY (no float drift)', () => {
    expect(radialSpawnPos(0, 2)).toEqual(LEFT);
    expect(radialSpawnPos(1, 2)).toEqual(RIGHT);
  });

  it('seat 0 is always the left rim regardless of N (angle π)', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      expect(radialSpawnPos(0, n)).toEqual(LEFT);
    }
  });

  it('every seat is equidistant from the spawner (FFA-fair) and integer-valued', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      for (let s = 0; s < n; s++) {
        const p = radialSpawnPos(s, n);
        expect(Number.isInteger(p.x)).toBe(true);
        expect(Number.isInteger(p.y)).toBe(true);
        expect(Math.abs(distFromCenter(p) - RIM)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('no two seats spawn on the same pixel (up to 6 players)', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 6; s++) {
      const p = radialSpawnPos(s, 6);
      seen.add(`${p.x},${p.y}`);
    }
    expect(seen.size).toBe(6);
  });
});

describe('S62 — isNetworked predicate', () => {
  it('false for solo, true for any networked mode', () => {
    const w = makeWorld(1);
    expect(isNetworked(w)).toBe(false);
    w.gameMode = '1v1';
    expect(isNetworked(w)).toBe(true);
  });
});

describe('S62 — applyStartGame N-player roster seating', () => {
  const start = (mode: 'solo' | '1v1', isHost: boolean, roster?: StartGameAction['roster']) => {
    const w = makeWorld(1);
    applyStartGame(w, { type: 'START_GAME', mode, isHost, roster });
    return w;
  };

  it('seats ALL roster players, with the right colors, at radial positions', () => {
    const w = start('1v1', true, roster3);
    expect(w.players.size).toBe(3);
    expect(w.scoreByPlayer.size).toBe(3);
    expect(w.players.get(asPlayerId(0))?.avatarPos).toEqual(radialSpawnPos(0, 3));
    expect(w.players.get(asPlayerId(1))?.avatarPos).toEqual(radialSpawnPos(1, 3));
    expect(w.players.get(asPlayerId(2))?.avatarPos).toEqual(radialSpawnPos(2, 3));
    expect(w.players.get(asPlayerId(2))?.color).toBe(PLAYER_COLORS[2]);
    expect(w.gameState).toBe('PLAYING');
    expect(w.gameMode).toBe('1v1');
  });

  it('inserts players in SEAT ORDER → identical Map iteration on every client (determinism)', () => {
    const w = start('1v1', false, roster3);
    expect([...w.players.keys()]).toEqual([asPlayerId(0), asPlayerId(1), asPlayerId(2)]);
  });

  it('the 3rd player (seat 2) is YELLOW — the user spec', () => {
    expect(PLAYER_COLORS[2]).toBe(0xffe23b);
    const w = start('1v1', true, roster3);
    expect(w.players.get(asPlayerId(2))?.color).toBe(0xffe23b);
  });

  it('legacy path: mode 1v1 WITHOUT a roster still seats exactly P0+P1 (back-compat)', () => {
    const w = start('1v1', true);
    expect(w.players.size).toBe(2);
    expect(w.players.get(asPlayerId(1))?.avatarPos).toEqual(RIGHT);
    expect(w.players.get(asPlayerId(1))?.color).toBe(PLAYER_COLORS[1]);
  });

  it('solo start (no roster) keeps P0 only', () => {
    const w = start('solo', true);
    expect(w.players.size).toBe(1);
    expect([...w.players.keys()]).toEqual([asPlayerId(0)]);
  });

  it('seating is idempotent — re-applying does not duplicate players', () => {
    const w = start('1v1', true, roster3);
    applyStartGame(w, { type: 'START_GAME', mode: '1v1', isHost: true, roster: roster3 });
    expect(w.players.size).toBe(3);
  });
});

describe('S62 — applyReturnToTitle resets to the solo identity (seat 0)', () => {
  it('drops non-local players and resets localPlayerId to 0 (e.g. a seat-2 client)', () => {
    const w = makeWorld(1);
    applyStartGame(w, { type: 'START_GAME', mode: '1v1', isHost: false, roster: roster3 });
    w.localPlayerId = asPlayerId(2); // we were the 3rd player
    applyReturnToTitle(w);
    expect(w.players.size).toBe(1);
    expect([...w.players.keys()]).toEqual([asPlayerId(0)]);
    expect(w.localPlayerId).toBe(asPlayerId(0));
    expect(w.gameMode).toBe('solo');
    expect(w.gameState).toBe('TITLE');
  });
});

describe('S62 — stampSenderSeat (host anti-spoof intent stamping)', () => {
  it('overrides the wire playerId with the sender seat', () => {
    const action = { type: 'UPDATE_AVATAR_POS' as const, playerId: asPlayerId(0), pos: { x: 1, y: 2 } };
    const stamped = stampSenderSeat(action, asPlayerId(2));
    expect(stamped).toEqual({ type: 'UPDATE_AVATAR_POS', playerId: asPlayerId(2), pos: { x: 1, y: 2 } });
  });

  it('a client claiming a different seat is overridden to its real seat (anti-spoof)', () => {
    // Client at seat 2 sends an avatar move STAMPED as seat 0 on the wire.
    const spoof = { type: 'UPDATE_AVATAR_POS' as const, playerId: asPlayerId(0), pos: { x: 9, y: 9 } };
    expect((stampSenderSeat(spoof, asPlayerId(2)) as { playerId: number }).playerId).toBe(asPlayerId(2));
  });

  it('passes an action with no playerId through unchanged (same reference)', () => {
    const action = { type: 'GODLY_COMPLETE' as const };
    expect(stampSenderSeat(action, asPlayerId(1))).toBe(action);
  });
});
