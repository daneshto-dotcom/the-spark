/**
 * SPARK — ⭐⭐ S195 (owner N16 / R195-T3) — **THE HOST RE-ARRANGES THE SEATS IN THE LOBBY.**
 *
 * > *"the host of the server should be able to … move players to be from player one, player two, player
 * > three"* · *"it doesn't matter where the host is in the lobby … modular enough to be able to move places."*
 *
 * Host-authoritative: the host writes every peer's board-slot preference (`session.slotByPeer` / `selfSlot`)
 * and answers with the presence beacon (`RosterEntry.slot`). There is NO client message for it, so a peer can
 * never move himself into a taken seat. The Begin roster carries the slots to `applyStartGame`, which stamps
 * the board the rack previewed.
 */

import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { parseNetMessage, type RosterEntry } from './protocol.ts';
import { buildLobbyRoster, hostMoveSeat, withSlots, withTeams } from './lobbyRoster.ts';
import { makeNetSession } from './session.ts';
import { broadcastQmPresence } from './quickmatchGate.ts';
import { boardSlotsForSeats, moveSeatSlot } from '../state/teams.ts';
import { zoneOwner } from '../state/zones.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { BotSetupOverlay } from '../render/botSetupOverlay.ts';

const U = undefined;
// The bot overlay touches `window` / rAF at construction (the uiSkinReach tests stub the same three).
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, innerWidth: 1920, innerHeight: 1080 });
vi.stubGlobal('cancelAnimationFrame', () => {});

describe('S195 N16 — moveSeatSlot: one board slot on, swapping with whoever stands there', () => {
  it('FFA: seat 0 NW → NE swaps with seat 1; again → SE swaps with seat 2', () => {
    const a = moveSeatSlot([U, U, U, U], [U, U, U, U], 0);
    expect(a).toEqual([1, 0, 2, 3]);
    expect(boardSlotsForSeats([U, U, U, U], a)).toEqual([1, 0, 2, 3]);
    expect(moveSeatSlot([U, U, U, U], a, 0)).toEqual([2, 0, 1, 3]);
  });
  it('2v2: moving the host off NW onto the enemy\'s NE sends his whole pair EAST (the rules still hold)', () => {
    const teams = [0, 1, 1, 0]; // west {0,3}, east {1,2}
    expect(boardSlotsForSeats(teams, [U, U, U, U])).toEqual([0, 1, 2, 3]);
    const p = moveSeatSlot(teams, [U, U, U, U], 0);
    const after = boardSlotsForSeats(teams, p);
    expect(after[0]).toBe(1); // the host now NE
    expect([after[0], after[3]].sort()).toEqual([1, 2]); // his teammate shares the EAST side
  });
  it('⛔ the 2v1 solo stays NW whatever is pressed (the owner\'s rule outranks the preference)', () => {
    const teams = [U, 0, 0];
    const p = moveSeatSlot(teams, [U, U, U], 0);
    expect(boardSlotsForSeats(teams, p)[0]).toBe(0);
  });
});

describe('S195 N16 — the wire', () => {
  const entry = (seat: number, peerId: string, extra: Partial<RosterEntry> = {}): RosterEntry => ({ seat, peerId, color: 1, ...extra });
  it('a roster slot must be 0..3 — a bad one rejects the whole presence message (fail-closed)', () => {
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: [entry(0, 'h', { slot: 3 }), entry(1, 'a', { slot: 0 })] })).not.toBeNull();
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: [entry(0, 'h', { slot: 4 }), entry(1, 'a')] })).toBeNull();
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: [entry(0, 'h', { slot: 1.5 }), entry(1, 'a')] })).toBeNull();
  });
  it('⛔ NEGATIVE — nobody moved: withSlots adds no key (byte-identical presence)', () => {
    const r = [entry(0, 'h'), entry(1, 'a')];
    const out = withSlots(r, new Map(), null, 'h');
    expect(out).toEqual(r);
    expect(out.every((e) => !('slot' in e))).toBe(true);
  });
});

describe('S195 N16 — REACH: host move → presence beacon → Begin roster → the stamped board', () => {
  it('⭐ the host moves himself into the east pair; the beacon carries it; START_GAME stamps that board', () => {
    const session = makeNetSession();
    session.lobbySeats.set('a', 1);
    session.lobbySeats.set('b', 2);
    session.lobbySeats.set('c', 3);
    session.selfTeam = 0;
    session.teamByPeer.set('a', 1);
    session.teamByPeer.set('b', 1);
    session.teamByPeer.set('c', 0); // 2v2: host+c (west), a+b (east)
    const lobby = () => withSlots(withTeams(buildLobbyRoster(session.lobbySeats, 'host', session.raceByPeer, U), session.teamByPeer, session.selfTeam, 'host'), session.slotByPeer, session.selfSlot, 'host');
    expect(boardSlotsForSeats(lobby().map((e) => e.team), lobby().map((e) => e.slot))).toEqual([0, 1, 2, 3]);
    expect(hostMoveSeat(lobby(), 0, 'host', session.slotByPeer, (s) => { session.selfSlot = s; })).toBe(true);
    expect(session.selfSlot).toBe(1);
    // the presence beacon (the ONE path) carries every slot
    let seen: readonly RosterEntry[] = [];
    broadcastQmPresence(session, null, (r) => { seen = r; }, 'LOBBY');
    expect(seen.map((e) => e.slot)).toEqual(lobby().map((e) => e.slot));
    const preview = boardSlotsForSeats(seen.map((e) => e.team), seen.map((e) => e.slot));
    expect(preview[0]).toBe(1); // the host's tile on NE
    // Begin: the roster with slots → START_GAME → the board is the preview
    const w = makeWorld(1);
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: seen.map((e) => ({ seat: e.seat, color: e.color, ...(e.team !== undefined ? { team: e.team } : {}), ...(e.slot !== undefined ? { slot: e.slot } : {}) })),
    });
    seen.forEach((_, s) => expect(zoneOwner(s, w.layout), `seat ${s}`).toBe(preview[s]));
  });

  it('⭐ the bot lobby\'s corner button moves a row and START hands the slots to the match', () => {
    let got: readonly (number | undefined)[] | undefined;
    const stage = new Container();
    const o = new BotSetupOverlay({ stage, screen: { width: 1920, height: 1080 } } as never, {
      onStart: (_d: unknown, _r: unknown, _p: unknown, _t: unknown, slots?: readonly (number | undefined)[]) => { got = slots; },
      onClose() {},
    } as never);
    expect(o.boardCorners()).toEqual([0, 1, 2, 3]);
    o.moveSeat(0);
    expect(o.boardCorners()).toEqual([1, 0, 2, 3]);
    (o as unknown as { callbacks: { onStart: (...a: unknown[]) => void } }).callbacks.onStart([], [], [], [], (o as unknown as { slotPrefs: number[] }).slotPrefs.slice(0, 4));
    expect(got).toEqual([1, 0, 2, 3]);
  });
});
