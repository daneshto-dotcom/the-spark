/**
 * ⭐ S192 (owner R192-T4) — the TEAMS wire: `RosterEntry.team`, `CLAIM_TEAM`, the presence/Begin roster
 * stamping (`withTeams`), plus the lobby view. (S195: the S192 re-seat is gone — the board maps seats.)
 */
import { describe, expect, it } from 'vitest';
import { parseNetMessage, type RosterEntry } from './protocol.ts';
import { withTeams } from './lobbyRoster.ts';
import { layoutForMatch } from '../state/teams.ts';
import { defaultRaceForSeat, RACE_COLORS } from '../state/races.ts';
import { lobbyView, initialLobbyState, type LobbyState } from '../render/lobbyStateMachine.ts';

const entry = (seat: number, peerId: string, extra: Partial<RosterEntry> = {}): RosterEntry => ({
  seat, peerId, color: RACE_COLORS[defaultRaceForSeat(seat)], ...extra,
});

describe('S192 teams — the wire', () => {
  it('CLAIM_TEAM: a team index or null parses; anything else is dropped', () => {
    expect(parseNetMessage({ kind: 'CLAIM_TEAM', team: 2 })).toEqual({ kind: 'CLAIM_TEAM', team: 2 });
    expect(parseNetMessage({ kind: 'CLAIM_TEAM', team: null })).toEqual({ kind: 'CLAIM_TEAM', team: null });
    expect(parseNetMessage({ kind: 'CLAIM_TEAM', team: 4 })).toBeNull();
    expect(parseNetMessage({ kind: 'CLAIM_TEAM', team: 1.5 })).toBeNull();
    expect(parseNetMessage({ kind: 'CLAIM_TEAM', team: '1' })).toBeNull();
    expect(parseNetMessage({ kind: 'CLAIM_TEAM' })).toBeNull();
  });

  it('⛔ a roster team must be 0..3 — a bad one rejects the whole presence message (fail-closed)', () => {
    const ok = { kind: 'LOBBY_PRESENCE', roster: [entry(0, 'h', { team: 0 }), entry(1, 'a', { team: 0 })] };
    expect(parseNetMessage(ok)).not.toBeNull();
    const bad = { kind: 'LOBBY_PRESENCE', roster: [entry(0, 'h', { team: 7 }), entry(1, 'a')] };
    expect(parseNetMessage(bad)).toBeNull();
    const noTeams = { kind: 'LOBBY_PRESENCE', roster: [entry(0, 'h'), entry(1, 'a')] };
    expect(parseNetMessage(noTeams)).not.toBeNull();
  });

  it('withTeams stamps picks by peerId, and an unpicked lobby is byte-identical (no key)', () => {
    const roster = [entry(0, 'host'), entry(1, 'a'), entry(2, 'b')];
    const none = withTeams(roster, new Map(), null, 'host');
    expect(none).toEqual(roster);
    expect(none.every((e) => !('team' in e))).toBe(true);
    const some = withTeams(roster, new Map([['b', 3]]), 1, 'host');
    expect(some.map((e) => e.team)).toEqual([1, undefined, 3]);
  });

  it('⭐ S195 — nobody is re-seated: the roster keeps every seat; the BOARD maps the 2v2 (host team west)', () => {
    // host + 'b' are team 0, 'a' + 'c' team 1. S192 moved 'b' to seat 3; S195 leaves the seats alone and
    // stands seat 2 in the SW quadrant instead (`layoutForMatch` → zone 3 is seat 2's).
    const roster = [
      entry(0, 'host', { team: 0 }), entry(1, 'a', { team: 1 }), entry(2, 'b', { team: 0 }), entry(3, 'c', { team: 1 }),
    ];
    expect(layoutForMatch(4, roster.map((e) => e.team))).toBe('QUADRANTS_4P:0132');
  });

  it('the lobby view carries each seat’s team to the rack', () => {
    const state: LobbyState = {
      ...initialLobbyState(),
      mode: 'hosting',
      presenceRoster: [
        { seat: 0, color: 1, isYou: true, team: 2 },
        { seat: 1, color: 2, isYou: false },
      ],
    } as LobbyState;
    const v = lobbyView(state);
    expect(v.seats[0]!.team).toBe(2);
    expect(v.seats[1]!.team).toBeUndefined();
  });
});
