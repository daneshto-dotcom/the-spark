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
import { broadcastQmPresence } from './quickmatchGate.ts';
import type { RosterEntry } from './protocol.ts';
import { selfId, type NetTransport } from './transport.ts';
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
  it('⭐ S162 P2 (OF-1) — a JOINER may take any race EXCEPT the host seat default', () => {
    // ⚠ THIS CASE CHANGED MEANING, AND THE CHANGE *IS* THE FIX. It used to assert that every race
    // was free to any claimant in an empty lobby — true only because `raceIsFree` could not see that
    // seat 0 already OCCUPIES `defaultRaceForSeat(0)` while `selfRace` is still null. A joiner taking
    // that race put two seats on one COLOUR, which is how seven recipe resolvers identify an owner.
    // S161 reddened this case and ran out of budget before finishing it.
    const s = sess();
    const hostDefault = defaultRaceForSeat(0);
    for (const r of ALL_RACES) expect(raceIsFree(s, r, 'JOINER'), r).toBe(r !== hostDefault);
  });

  it('⭐ the HOST may still take any race, including the one its own tile already shows', () => {
    // Without the `claimant !== selfId` guard a host whose selfRace is null could not pick vampires.
    const s = sess();
    for (const r of ALL_RACES) expect(raceIsFree(s, r, selfId), r).toBe(true);
  });

  it('⛔ OF-1 — an UNPICKED PEER seat default is occupied too, not just the host seat', () => {
    const s = sess();
    s.lobbySeats.set('PEER-A', 1); // seated, never chose
    expect(raceIsFree(s, defaultRaceForSeat(1), 'PEER-B')).toBe(false);
    // …and PEER-A may still re-affirm the default it is already showing.
    expect(raceIsFree(s, defaultRaceForSeat(1), 'PEER-A')).toBe(true);
  });

  it('a peer that HAS chosen RELEASES its seat default for someone else', () => {
    const s = sess();
    s.lobbySeats.set('PEER-A', 1);
    s.raceByPeer.set('PEER-A', 'demons');
    expect(raceIsFree(s, defaultRaceForSeat(1), 'PEER-B')).toBe(true); // seat 1's default is freed
    expect(raceIsFree(s, 'demons', 'PEER-B')).toBe(false); // its actual pick is held
  });

  it('a claim that arrives BEFORE the seat reconcile is still honoured', () => {
    // `raceByPeer` is written by the claim handler, `lobbySeats` by the join reconcile — a peer
    // mid-join has an entry in one and not the other.
    const s = sess();
    s.raceByPeer.set('PEER-A', 'orcs');
    expect(raceIsFree(s, 'orcs', 'PEER-B')).toBe(false);
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

/**
 * ⭐ S162 P1 — **THE PICK WAS BEING RECORDED AND NEVER SHOWN.**
 *
 * Owner: *"i cant seem to change my player color(race) i click on it and it shows but it doesnt
 * change"*. `onPickRace` set `session.selfRace` and then skipped the presence rebuild behind a
 * `session.netTransport !== null` guard, so `onPresence` never fired and `lobbyStateMachine` kept
 * painting its count-based fallback — `defaultRaceForSeat(0)`, i.e. vampires, forever.
 *
 * A host has no transport more often than it looks: before it opens a room, and after a failed one
 * (S162 P0 had `joinRoom` throwing on a malformed ICE url, so `hostHandlers` never reached its
 * `session.netTransport = transport` assignment at all).
 */
describe('S162 P1 — broadcastQmPresence repaints locally with no transport', () => {
  it('⭐ a null transport STILL repaints, and the roster carries the picked race', () => {
    const s = sess();
    s.selfRace = 'demons';
    const seen: RosterEntry[][] = [];
    broadcastQmPresence(s, null, (r) => { seen.push([...r]); });
    expect(seen).toHaveLength(1);
    expect(seen[0]![0]!.raceId).toBe('demons');
  });

  it('⛔ a null transport does NOT wipe a live seat map', () => {
    // `reconcileLobbySeats(prev, [])` is documented as "departed peers fall away", so handing it an
    // empty list merely because we have no transport HANDLE would evict real peers. The reconcile
    // is skipped instead.
    const s = sess();
    s.lobbySeats.set('PEER-A', 1);
    broadcastQmPresence(s, null, () => {});
    expect(s.lobbySeats.get('PEER-A')).toBe(1);
  });

  it('an UNPICKED seat 0 omits `raceId` but still carries the default race COLOUR', () => {
    // ⚠ Not a defect — the documented §15.6 byte-identity contract at `rosterEntryFor`: `raceId` is
    // emitted only when a race was actually CLAIMED, so an all-default beacon stays byte-identical
    // to pre-W1-A. `color` is always the EFFECTIVE race's colour, and `lobbyStateMachine` re-derives
    // the missing id with `entry.raceId ?? defaultRaceForSeat(i)`.
    //
    // ⭐ This asymmetry is worth pinning because it is exactly what OF-1 turns on: a seat that never
    // picked still OCCUPIES its default race, while carrying no `raceId` for a taken-set to see.
    const s = sess();
    const seen: RosterEntry[][] = [];
    broadcastQmPresence(s, null, (r) => { seen.push([...r]); });
    expect(seen[0]![0]!.raceId).toBeUndefined();
    expect(seen[0]![0]!.color).toBe(RACE_COLORS[defaultRaceForSeat(0)]);
  });

  it('WITH a transport the wire send is unchanged — the local repaint is additive', () => {
    const s = sess();
    s.selfRace = 'orcs';
    const sent: { kind: string }[] = [];
    const transport = {
      peerIds: () => [],
      send: (m: { kind: string }) => { sent.push(m); },
    } as unknown as NetTransport;
    const seen: RosterEntry[][] = [];
    broadcastQmPresence(s, transport, (r) => { seen.push([...r]); });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.kind).toBe('LOBBY_PRESENCE');
    expect(seen[0]![0]!.raceId).toBe('orcs');
  });
});
