import { describe, it, expect } from 'vitest';
import { buildLobbyRoster } from './lobbyRoster.ts';
import { PLAYER_COLORS, MAX_PLAYERS } from '../constants.ts';

describe('buildLobbyRoster (S70 P1 — lobby/Begin seat authority)', () => {
  const HOST = 'host-self-id';

  it('host alone → a single seat-0 entry (selfId, PLAYER_COLORS[0])', () => {
    expect(buildLobbyRoster([], HOST)).toEqual([
      { seat: 0, peerId: HOST, color: PLAYER_COLORS[0] },
    ]);
  });

  it('seats remote peers 1..N in join order with PLAYER_COLORS[seat]', () => {
    expect(buildLobbyRoster(['p1', 'p2'], HOST)).toEqual([
      { seat: 0, peerId: HOST, color: PLAYER_COLORS[0] },
      { seat: 1, peerId: 'p1', color: PLAYER_COLORS[1] },
      { seat: 2, peerId: 'p2', color: PLAYER_COLORS[2] },
    ]);
  });

  it('fills exactly MAX_PLAYERS seats when host + (MAX_PLAYERS-1) peers', () => {
    const peers = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => `p${i}`);
    const r = buildLobbyRoster(peers, HOST);
    expect(r).toHaveLength(MAX_PLAYERS);
    expect(r.map((e) => e.seat)).toEqual(Array.from({ length: MAX_PLAYERS }, (_, i) => i));
    expect(r[MAX_PLAYERS - 1].color).toBe(PLAYER_COLORS[MAX_PLAYERS - 1]);
  });

  it('caps at MAX_PLAYERS — a 7th+ peer is dropped (host-authoritative)', () => {
    const peers = Array.from({ length: MAX_PLAYERS + 3 }, (_, i) => `p${i}`);
    const r = buildLobbyRoster(peers, HOST);
    expect(r).toHaveLength(MAX_PLAYERS);
    // The last SEATED remote peer is peer-list index MAX_PLAYERS-2 (→ seat MAX_PLAYERS-1).
    expect(r[MAX_PLAYERS - 1].peerId).toBe(`p${MAX_PLAYERS - 2}`);
  });

  it('seats are contiguous 0..N-1 and colours track the seat index', () => {
    const r = buildLobbyRoster(['a', 'b', 'c'], HOST);
    r.forEach((e, i) => {
      expect(e.seat).toBe(i);
      expect(e.color).toBe(PLAYER_COLORS[i]);
    });
  });

  it('matches the Begin formula: seat 0 is always the local selfId', () => {
    expect(buildLobbyRoster(['x'], 'ME')[0]).toEqual({
      seat: 0,
      peerId: 'ME',
      color: PLAYER_COLORS[0],
    });
  });
});
