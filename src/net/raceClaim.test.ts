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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    // the resolved roster correctly.
    //
    // ⛔ S165 — THIS USED TO READ `expect(PROTOCOL_VERSION).toBe(41)` AND THAT WAS THE WRONG SHAPE.
    // The claim being made here is "CLAIM_RACE did not cause a bump", but an absolute pin asserts
    // something much stronger and quite different: "no feature has bumped the protocol since". It
    // duly went red on W1-C's unrelated 41->42, which says nothing whatsoever about CLAIM_RACE.
    // Its own comment even anticipated the confusion ("if this number moves, re-read that docblock
    // before assuming the bump was for this feature") — a warning is not a substitute for asserting
    // the right thing.
    //
    // ⭐ So it now asserts the actual claim, against the bump ledger itself: no entry in the
    // changelog attributes a bump to the race claim. That is drift-proof and STRONGER — an absolute
    // pin would have stayed green if someone later bumped the protocol FOR this feature and simply
    // updated the number here too.
    const changelog = readFileSync(
      join(process.cwd(), 'src', 'net', 'protocol.ts'),
      'utf8',
    );
    const bumpLines = changelog
      .split(/\r?\n/)
      .filter((l) => /bumped\s+\d+\s*->\s*\d+/.test(l) || /\d+\s*->\s*\d+\s*\(/.test(l));
    expect(bumpLines.length).toBeGreaterThan(20); // anti-vacuity: we really are reading the ledger
    expect(bumpLines.filter((l) => /CLAIM_RACE|RACE CLAIM/i.test(l))).toEqual([]);
    // And the version has never gone BACKWARDS past the release CLAIM_RACE shipped in.
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(41);
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
    //
    // ⛔ S163 P6 — THIS PASSED A LITERAL `'HOST-SELF-ID'`, WHICH IS NOT `selfId`. So it took the
    // `claimant !== selfId` branch — the ordinary peer path — and proved nothing about the host.
    // The behaviour was right all along; the CLAIM in the title was simply unproven. `selfId` is
    // imported at the top of this file and is what main.ts actually passes.
    const s = sess();
    s.raceByPeer.set('PEER-A', 'zombies');
    expect(raceIsFree(s, 'zombies', selfId)).toBe(false);
    // Anti-vacuity: the guard must not degenerate into "refuse the host everything". A race nobody
    // holds is still free to seat 0 — which is the whole point of the `claimant === selfId` skip.
    expect(raceIsFree(s, 'orcs', selfId)).toBe(true);
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
 * A host has no transport more often than it looks: before it opens a room, and in the vs-bots
 * setup, which has none at all.
 *
 * ⛔ S163 P2 — **AND THE ROOT CAUSE THIS DOCBLOCK USED TO NAME WAS WRONG.** It said S162 P0's
 * `joinRoom` throw left `session.netTransport` unassigned. It cannot: `hostHandlers.ts` assigns the
 * transport ~25 lines BEFORE it calls `transport.connect(code)` (`clientHandlers.ts` likewise), and
 * `connect()` swallows a `joinFn` throw anyway — `transport.ts` wraps it in a `try` whose `catch`
 * calls `markStrategyFailed`. A failed strategy is a diagnostics row, not an exception.
 *
 * ⭐ WHAT THE CASES BELOW ACTUALLY PIN IS THE CONTRACT, NOT THAT OUTAGE. `session.netTransport` is
 * `NetTransport | null`, so `broadcastQmPresence` must repaint locally whenever it is null for ANY
 * reason. The live mechanism behind the owner's report was the ghost race claim (`raceByPeer` never
 * pruned on departure), fixed separately in S162's post-audit.
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

  /**
   * S165 (sweep Lane 5) - THE GHOST-CLAIM PRUNE HAD ZERO COVERAGE, AND IT WAS AN OWNER-BUG FIX.
   *
   * `quickmatchGate.ts` deletes `raceByPeer` entries for peers no longer in `transport.peerIds()`,
   * and its docblock names the symptom it cures: a departed peer's claim kept a race LOCKED while
   * the picker drew that tile free and clickable - *"i click on it and it shows but it doesnt
   * change"*. The four existing tests in this describe all call `broadcastQmPresence` and then
   * assert on the returned roster; not one looks at `raceByPeer`. The prune loop RUNS in every one
   * of them (the last passes `peerIds: () => []`) and nothing checks what it did.
   *
   * MEASURED CONSEQUENCE: delete the four-line prune and the whole suite stays green.
   */
  it('⛔ prunes a DEPARTED peer race claim, so that race stops reading as taken', () => {
    const s = sess();
    s.raceByPeer.set('GONE-PEER', 'orcs');
    s.raceByPeer.set('HERE-PEER', 'nagas');
    const transport = {
      peerIds: () => ['HERE-PEER'],
      send: () => {},
    } as unknown as NetTransport;

    broadcastQmPresence(s, transport, () => {});

    expect(s.raceByPeer.has('GONE-PEER'), 'a departed peer must not keep holding a race').toBe(false);
    // ...and the present peer is untouched: a prune that cleared everything would also pass the
    // assertion above, which is the whole reason both halves are asserted.
    expect(s.raceByPeer.get('HERE-PEER')).toBe('nagas');
  });

  it('⚠ keys the prune on the TRANSPORT peer list, not on lobbySeats', () => {
    /*
     * The docblock is explicit that this distinction is load-bearing: a peer mid-join is CONNECTED
     * but not yet SEATED, and `raceIsFree`'s third loop exists precisely to honour a claim that
     * arrives before its seat. Pruning by seat would delete the very claims that loop was written
     * for. So a peer present on the transport but absent from `lobbySeats` must KEEP its claim.
     */
    const s = sess();
    s.raceByPeer.set('JOINING-PEER', 'vampires');
    expect(s.lobbySeats.has('JOINING-PEER')).toBe(false);
    const transport = {
      peerIds: () => ['JOINING-PEER'],
      send: () => {},
    } as unknown as NetTransport;

    broadcastQmPresence(s, transport, () => {});

    expect(s.raceByPeer.get('JOINING-PEER'), 'a mid-join peer keeps its claim').toBe('vampires');
  });

  /**
   * S165 (sweep Lane 5) - THE TWO INDEPENDENT TRY/CATCHES HAD ZERO COVERAGE EITHER.
   *
   * S163 P8 argues at length that ONE try, or send-before-repaint, reproduces the owner's bug - and
   * that its own first fix (reordering alone) "removed one way and created its mirror", because a
   * throw in the host's Pixi repaint would swallow the LOBBY_PRESENCE broadcast for the whole room.
   * Two independent catches is the shape that makes "both halves always run" true.
   *
   * MEASURED CONSEQUENCE: revert to a single try, or to one unguarded call, and the suite stays
   * green. These two tests are the only thing that would notice.
   */
  it('⛔ a THROWING repaint still lets the wire broadcast go out', () => {
    const s = sess();
    s.selfRace = 'zombies';
    const sent: { kind: string }[] = [];
    const transport = {
      peerIds: () => [],
      send: (m: { kind: string }) => { sent.push(m); },
    } as unknown as NetTransport;

    expect(() => broadcastQmPresence(s, transport, () => {
      throw new Error('pixi repaint blew up');
    })).not.toThrow();

    expect(sent, 'every remote rack would freeze if this were empty').toHaveLength(1);
    expect(sent[0]!.kind).toBe('LOBBY_PRESENCE');
  });

  it('⛔ a THROWING send still lets the local repaint happen', () => {
    const s = sess();
    s.selfRace = 'mummies';
    const transport = {
      peerIds: () => [],
      send: () => { throw new Error('transport disconnected mid-cycle'); },
    } as unknown as NetTransport;
    const seen: RosterEntry[][] = [];

    expect(() => broadcastQmPresence(s, transport, (r) => { seen.push([...r]); })).not.toThrow();

    // The original symptom in one assertion: the pick is recorded AND visible.
    expect(seen, 'this is the "it shows but it doesnt change" bug').toHaveLength(1);
    expect(seen[0]![0]!.raceId).toBe('mummies');
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
