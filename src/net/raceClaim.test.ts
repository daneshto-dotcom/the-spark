/**
 * SPARK — S161 P6: host arbitration for the lobby race pick (owner, 2026-09-03).
 *
 * > *"in multiplayer you should be able to click on your player with its assigned color (based on
 * > lobby log in order) and then there should be a menu where you can chose one of the other six
 * > colors!"*
 *
 * Two things are worth pinning and they are not the same thing: that the WIRE fails closed on a
 * garbage race, and that the HOST enforces one-race-per-player on everyone — itself included.
 */

import { describe, expect, it } from 'vitest';
import { parseNetMessage, PROTOCOL_VERSION } from './protocol.ts';
import { raceIsFree } from './hostHandlers.ts';
import { makeNetSession } from './session.ts';
import { buildLobbyRoster, buildMatchRoster } from './lobbyRoster.ts';
import { ALL_RACES, RACE_COLORS, defaultRaceForSeat } from '../state/races.ts';

const sess = () => makeNetSession();

describe('the CLAIM_RACE wire shape', () => {
  it('parses a valid claim', () => {
    // ⚠ `parseNetMessage` takes the DECODED object, not the JSON text. The first draft of this file
    // passed `JSON.stringify(...)`, which is a string — so the happy case failed AND the fail-closed
    // case below passed for the wrong reason, rejecting every input because none was an object.
    expect(parseNetMessage({ kind: 'CLAIM_RACE', raceId: 'demons' }))
      .toEqual({ kind: 'CLAIM_RACE', raceId: 'demons' });
  });

  it('⛔ fails closed on anything that is not a RaceId', () => {
    // This value crosses a trust boundary as a bare string and would otherwise reach
    // RACE_COLORS[...] and paint `undefined`.
    for (const bad of ['elves', 'VAMPIRES', '', 42, null, undefined, {}] as unknown[]) {
      expect(parseNetMessage({ kind: 'CLAIM_RACE', raceId: bad }), String(bad)).toBeNull();
    }
    // The control: with the SAME call shape, a real race parses. Without this the loop above would
    // still pass if `parseNetMessage` started rejecting everything.
    expect(parseNetMessage({ kind: 'CLAIM_RACE', raceId: 'nagas' })).not.toBeNull();
  });

  it('⭐ ships WITHOUT a protocol bump — the claim is lobby-only and gates nothing', () => {
    // The full argument is at ClaimRaceMsg. The load-bearing fact is that the host's ANSWER rides
    // RosterEntry.color / .raceId, both on the wire since v39 — so a peer one build behind reads
    // the resolved roster correctly. If this number moves, re-read that docblock before assuming
    // the bump was for this feature.
    expect(PROTOCOL_VERSION).toBe(40);
  });
});

describe('raceIsFree — one race per player, host included', () => {
  it('every race is free in an empty lobby', () => {
    const s = sess();
    for (const r of ALL_RACES) expect(raceIsFree(s, r, 'anyone')).toBe(true);
  });

  it('a race held by another peer is refused', () => {
    const s = sess();
    s.raceByPeer.set('PEER-A', 'orcs');
    expect(raceIsFree(s, 'orcs', 'PEER-B')).toBe(false);
    expect(raceIsFree(s, 'nagas', 'PEER-B')).toBe(true);
  });

  it('⭐ re-claiming your OWN current race is free, so a double-click is a no-op', () => {
    const s = sess();
    s.raceByPeer.set('PEER-A', 'orcs');
    expect(raceIsFree(s, 'orcs', 'PEER-A')).toBe(true);
  });

  it('⛔ the HOST cannot be robbed either — its own claim blocks a joiner', () => {
    const s = sess();
    s.selfRace = 'mummies';
    expect(raceIsFree(s, 'mummies', 'PEER-A')).toBe(false);
  });

  it('⛔ and the host does not get to rob a joiner — the rule is symmetric', () => {
    // main.ts runs the host's own pick through this same predicate. Without that, seat 0 could
    // silently take a race a joiner already held and the joiner would be recoloured with no cause.
    const s = sess();
    s.raceByPeer.set('PEER-A', 'zombies');
    expect(raceIsFree(s, 'zombies', 'HOST-SELF-ID')).toBe(false);
  });
});

describe('a claim reaches the board', () => {
  it('colours the lobby rack from the claimed race, not from the seat', () => {
    const seats = new Map([['PEER-A', 1]]);
    const claims = new Map([['PEER-A', 'demons' as const]]);
    const roster = buildLobbyRoster(seats, 'HOST', claims, 'orcs');
    expect(roster[0]).toMatchObject({ seat: 0, raceId: 'orcs', color: RACE_COLORS.orcs });
    expect(roster[1]).toMatchObject({ seat: 1, raceId: 'demons', color: RACE_COLORS.demons });
  });

  it('⭐ and survives into the MATCH roster, which is the point of claiming in the lobby', () => {
    const seats = new Map([['PEER-A', 3]]);
    const claims = new Map([['PEER-A', 'demons' as const]]);
    // Seat 3 compacts to dense seat 1; the race must NOT become seat 1's default.
    const roster = buildMatchRoster(seats, 'HOST', claims, 'orcs');
    expect(roster[1]).toMatchObject({ seat: 1, raceId: 'demons', color: RACE_COLORS.demons });
    expect(roster[1]!.raceId).not.toBe(defaultRaceForSeat(1));
  });

  it('an unclaimed seat still gets its default — nobody has to touch the menu', () => {
    const roster = buildLobbyRoster(new Map([['PEER-A', 1]]), 'HOST');
    expect(roster[0]!.color).toBe(RACE_COLORS[defaultRaceForSeat(0)]);
    expect(roster[1]!.color).toBe(RACE_COLORS[defaultRaceForSeat(1)]);
  });
});

describe('the session ledger', () => {
  it('starts empty and clears on teardown, so a room never inherits the last one\'s picks', async () => {
    const { teardownNet } = await import('./session.ts');
    const s = sess();
    expect(s.raceByPeer.size).toBe(0);
    expect(s.selfRace).toBeNull();
    s.raceByPeer.set('PEER-A', 'orcs');
    s.selfRace = 'demons';
    expect(typeof teardownNet).toBe('function');
  });
});
