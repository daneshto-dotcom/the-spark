/**
 * SPARK — S87: 'bots' game-mode plumbing tests.
 *
 * Covers the P1 state surface: START_GAME roster+botSeats seating,
 * RETURN_TO_TITLE teardown, save/restore additive round-trip, the
 * isNetworked('bots') semantics inheritance, 7-seat invariants (radial spawn
 * distinctness + rainbow derangement bijection over the extended palette),
 * and the B{n} nameplate helper.
 */

import { describe, expect, it } from 'vitest';
import { MAX_BOTS, MAX_PLAYERS, PLAYER_COLORS } from '../constants.ts';
import { avatarNameplateText } from '../render/avatarRenderer.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { isNetworked, radialSpawnPos } from './gameMode.ts';
import { buildShuffleColorMap } from './rainbowLifecycle.ts';
import { mulberry32 } from './rng.ts';
import { restore, snapshot } from './save.ts';
import { dispatch, makeWorld } from './world.ts';

const BOT_ROSTER = Array.from({ length: 4 }, (_, seat) => ({
  seat,
  color: PLAYER_COLORS[seat],
}));

function startBotsMatch(botCount = 3) {
  const world = makeWorld(7);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: botCount + 1 }, (_, seat) => ({
    seat,
    color: PLAYER_COLORS[seat],
  }));
  const botSeats = Array.from({ length: botCount }, (_, i) => i + 1);
  dispatch(world, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats });
  return world;
}

describe('S87 bots mode — START_GAME seating + botSeats', () => {
  it('seats human at 0 and bots at 1..N with roster colors', () => {
    const world = startBotsMatch(3);
    expect(world.gameMode).toBe('bots');
    expect(world.gameState).toBe('PLAYING');
    expect(world.players.size).toBe(4);
    expect(world.botSeats.size).toBe(3);
    expect(world.botSeats.has(asPlayerId(0))).toBe(false);
    for (let s = 1; s <= 3; s++) {
      expect(world.botSeats.has(asPlayerId(s))).toBe(true);
      expect(world.players.get(asPlayerId(s))?.color).toBe(PLAYER_COLORS[s]);
    }
  });

  it('supports the full 6-bot match (7 seats, the user-mandated max)', () => {
    const world = startBotsMatch(MAX_BOTS);
    expect(world.players.size).toBe(MAX_BOTS + 1);
    expect(world.botSeats.size).toBe(MAX_BOTS);
    // The 7th seat has a real palette color (silver) — never undefined tint.
    expect(world.players.get(asPlayerId(MAX_BOTS))?.color).toBe(PLAYER_COLORS[MAX_BOTS]);
    expect(PLAYER_COLORS[MAX_BOTS]).toBeTypeOf('number');
  });

  it('a START_GAME without botSeats clears stale bot flags (fresh-match invariant)', () => {
    const world = startBotsMatch(2);
    dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
    expect(world.botSeats.size).toBe(0);
  });

  it('RETURN_TO_TITLE drops bot seats with their players', () => {
    const world = startBotsMatch(4);
    dispatch(world, { type: 'RETURN_TO_TITLE' });
    expect(world.botSeats.size).toBe(0);
    expect(world.players.size).toBe(1);
    expect(world.gameMode).toBe('solo');
  });

  it("isNetworked('bots') is TRUE — bots mode inherits the FFA rule set", () => {
    const world = startBotsMatch(1);
    expect(isNetworked(world)).toBe(true);
  });

  it('bot pickups are reach-validated like remote humans (Council F3)', () => {
    const world = startBotsMatch(1);
    const botSeat = asPlayerId(1);
    const bot = world.players.get(botSeat)!;
    // A spark far beyond REASONABLE_PICKUP_REACH(600) of the bot's avatar.
    const farSpark = {
      id: asSparkId(900),
      type: 0,
      pos: { x: bot.avatarPos.x + 1500, y: bot.avatarPos.y },
      prevPos: { x: bot.avatarPos.x + 1500, y: bot.avatarPos.y },
      radius: 8,
      createdTick: 0,
      state: { kind: 'Free' as const },
    };
    world.freeSparks.set(farSpark.id, farSpark as never);
    const rejectsBefore = world.diagnostics.rejectReasons.pickupReachFail;
    dispatch(world, {
      type: 'PICKUP_SPARK',
      sparkId: farSpark.id,
      playerId: botSeat,
      pos: { x: farSpark.pos.x, y: farSpark.pos.y },
    });
    expect(world.players.get(botSeat)?.kind).toBe('Idle');
    expect(world.diagnostics.rejectReasons.pickupReachFail).toBe(rejectsBefore + 1);
  });
});

describe('S87 bots mode — save/restore round-trip (additive)', () => {
  it('botSeats round-trips through snapshot/restore', () => {
    const world = startBotsMatch(5);
    const snap = snapshot(world);
    expect(snap.botSeats).toEqual([1, 2, 3, 4, 5]);
    const fresh = makeWorld(1);
    restore(snap, fresh);
    expect([...fresh.botSeats].map((p) => p as number).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('non-bots snapshots omit the field entirely (wire/back-compat byte-identity)', () => {
    const world = makeWorld(3);
    dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true, roster: BOT_ROSTER });
    const snap = snapshot(world);
    expect(snap.botSeats).toBeUndefined();
    expect(JSON.stringify(snap)).not.toContain('botSeats');
  });

  it('restoring a non-bots snapshot over a bots world clears the set', () => {
    const soloWorld = makeWorld(3);
    const snap = snapshot(soloWorld);
    const botsWorld = startBotsMatch(2);
    restore(snap, botsWorld);
    expect(botsWorld.botSeats.size).toBe(0);
  });
});

describe('S87 — 7-seat invariants (Council F2 overrule evidence)', () => {
  it('PLAYER_COLORS covers MAX_BOTS+1 seats with distinct colors', () => {
    expect(PLAYER_COLORS.length).toBe(MAX_BOTS + 1);
    expect(new Set(PLAYER_COLORS).size).toBe(PLAYER_COLORS.length);
    // Wire/lobby cap untouched.
    expect(MAX_PLAYERS).toBe(6);
  });

  it('radialSpawnPos yields 7 distinct rim positions at total=7', () => {
    const seen = new Set<string>();
    for (let seat = 0; seat < 7; seat++) {
      const p = radialSpawnPos(seat, 7);
      seen.add(`${p.x},${p.y}`);
    }
    expect(seen.size).toBe(7);
  });

  it('rainbow keeps all 7 bots-mode seats distinct: 6 humans shuffle, Silver bot stays Silver (S94)', () => {
    // S94 — the derangement permutes only the 6 human colours; the bots-only Silver
    // (PLAYER_COLORS[6], near-white) is FIXED so a human is never deranged into it. 7-seat
    // uniqueness still holds: 6 shuffled (distinct) + Silver (untouched, distinct from the 6).
    const SILVER = PLAYER_COLORS[6];
    const human = PLAYER_COLORS.slice(0, 6);
    const map = buildShuffleColorMap(mulberry32(42), new Set(PLAYER_COLORS));
    expect(map.has(SILVER)).toBe(false); // Silver bot keeps Silver via the ?? fallback
    const humanOut = human.map((c) => map.get(c)!);
    expect(new Set(humanOut)).toEqual(new Set(human)); // bijection over the 6 human colours
    expect(new Set([...humanOut, SILVER]).size).toBe(7); // all 7 seats remain distinct
  });
});

describe('S87 — bot identity surfaces', () => {
  it('nameplates read B{n} for bots, P{n} for humans', () => {
    expect(avatarNameplateText(0)).toBe('P1');
    expect(avatarNameplateText(1, true)).toBe('B2');
    expect(avatarNameplateText(6, true)).toBe('B7');
    expect(avatarNameplateText(3, false)).toBe('P4');
  });
});
