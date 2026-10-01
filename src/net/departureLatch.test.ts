/**
 * ⛔ S192 audit A1 (HIGH) — FIX-2 COULD DEPOSE A LIVE HOST.
 *
 * The first FIX-2 cut latched `hostDepartedPeerId` on EVERY 'lobby' / 'new-match' signal, and two of those
 * can arrive from a host that never left:
 *   · a STALE duplicate of the pre-Begin LOBBY_PRESENCE (phase LOBBY). nostr and torrent each deliver every
 *     control message, with no dedup, so the slower strategy's copy can land AFTER START_GAME_SIGNAL came in
 *     on the faster one — likeliest in quickmatch, where the beacon and Begin go out back to back;
 *   · the seq-regression fallback, which also fires mid-match on our own match id.
 * In a 1v1 that tore a live transport down every 35 s until the give-up; with 3+ seats rank 0 claimed a
 * LIVE host at +15 s — split-brain.
 *
 * Now the latch needs (a) a DEPARTURE PROOF — a presence in phase LOBBY, or a presence / snapshot carrying a
 * DIFFERENT match id (`departureProofOf`; never the seq fallback) — AND (b) a reason it cannot be a stale
 * copy (`shouldLatchDeparture`): a rejoin is pending, or this host was seen ABSENT from our transport during
 * this match (so the message comes from a host that re-appeared — the real FIX-2 case of H re-hosting).
 * Driven through the real `connectAsClient` route.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const fake = vi.hoisted(() => ({
  route: null as null | ((msg: unknown, peerId: string) => void),
}));
vi.mock('./transport.ts', () => ({
  selfId: 'self-peer-id',
  NetTransport: class {
    onError: unknown = null;
    onProtocolMismatch: unknown = null;
    connect(): void {}
    on(h: (msg: unknown, peerId: string) => void): void {
      fake.route = h;
    }
    onPeerChange(): void {}
    peerIds(): string[] {
      return ['host-peer'];
    }
    send(): void {}
    disconnect(): void {}
  },
}));

import { connectAsClient, type JoinAttemptDeps } from './clientHandlers.ts';
import { makeNetSession } from './session.ts';
import { ClientSync } from './sync.ts';
import type { RosterEntry } from './protocol.ts';
import { departureProofOf, shouldLatchDeparture, type HostMessageInput, type HostSignal } from './reconnectPolicy.ts';
import { makeWorld } from '../state/world.ts';

afterEach(() => {
  fake.route = null;
  vi.restoreAllMocks();
});

const HOST = 'host-peer';
const OUR_MATCH = 'host-peer.1';
const ROSTER: RosterEntry[] = [
  { seat: 0, peerId: HOST, color: 0xff3b6b },
  { seat: 1, peerId: 'self-peer-id', color: 0x3bd1ff },
];

/** A client PLAYING match OUR_MATCH, fed (seq 500), following HOST, its transport never lost. */
function liveClient(o: { pending?: boolean; hostAbsentThisMatch?: boolean } = {}) {
  const session = makeNetSession();
  const world = makeWorld(1);
  world.gameState = 'PLAYING';
  session.hostVerifiedPeerId = HOST;
  session.hostPeerId = HOST;
  session.matchId = OUR_MATCH;
  const sync = new ClientSync();
  sync.receive({ kind: 'NETSNAPSHOT', snapshotSeq: 500, snapshot: {} } as never, 1_000);
  session.clientSync = sync;
  const signals: HostSignal[] = [];
  const deps: JoinAttemptDeps = {
    session,
    world,
    controls: { setPlayerId: () => {} } as never,
    onLobbyError: () => {},
    onPresence: () => {},
    clientIdentity: { spkiB64: 'spki', sign: () => Promise.resolve('pop') } as never,
    onHostSignal: (s) => signals.push(s),
    isRejoinPending: () => o.pending === true,
    hostAbsentThisMatch: () => o.hostAbsentThisMatch === true,
  };
  connectAsClient(deps, 'ROOMAA');
  return { session, signals, host: (m: unknown) => fake.route!(m, HOST) };
}

describe('S192 A1 — a stale copy never latches a live host as departed (real connectAsClient route)', () => {
  it('⛔ a phase-LOBBY beacon that lands at Begin + 5 ms (the slower strategy) on a host that never left → NO latch', () => {
    const c = liveClient();
    c.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER, phase: 'LOBBY' });
    expect(c.signals).toEqual(['lobby']); // still reported (only a pending rejoin acts on it — hostMovedOn)
    expect(c.session.hostDepartedPeerId).toBeNull();
  });

  it('⛔ a seq regression mid-match on OUR id → NO latch (the fallback is not a departure proof)', () => {
    const c = liveClient({ hostAbsentThisMatch: true, pending: true });
    c.host({ kind: 'NETSNAPSHOT', snapshotSeq: 100, snapshot: {}, matchId: OUR_MATCH });
    expect(c.session.hostDepartedPeerId).toBeNull();
    // …nor an id-less one
    c.host({ kind: 'NETSNAPSHOT', snapshotSeq: 90, snapshot: {} });
    expect(c.session.hostDepartedPeerId).toBeNull();
  });

  it('⭐ the genuine FIX-2 case still latches: H left our transport this match, re-hosted, says LOBBY', () => {
    const c = liveClient({ hostAbsentThisMatch: true });
    c.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER, phase: 'LOBBY' });
    expect(c.session.hostDepartedPeerId).toBe(HOST);
  });

  it('⭐ …and a pending rejoin that lands in H\'s lobby latches too (no seated survivor → title is hostMovedOn\'s, unchanged)', () => {
    const c = liveClient({ pending: true });
    c.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER, phase: 'LOBBY' });
    expect(c.session.hostDepartedPeerId).toBe(HOST);
  });

  it('⭐ a presence of ANOTHER match (phase MATCH, other id) from a host that re-appeared latches', () => {
    const c = liveClient({ hostAbsentThisMatch: true });
    c.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER, phase: 'MATCH', matchId: 'host-peer.2' });
    expect(c.session.hostDepartedPeerId).toBe(HOST);
  });

  it('NEGATIVE — our own match\'s presence (phase MATCH, our id) never latches, even after an absence', () => {
    const c = liveClient({ hostAbsentThisMatch: true, pending: true });
    c.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER, phase: 'MATCH', matchId: OUR_MATCH });
    expect(c.session.hostDepartedPeerId).toBeNull();
  });
});

describe('S192 A1 — the two pure halves', () => {
  const base: HostMessageInput = {
    inMatch: true, fromFollowedHost: true, kind: 'LOBBY_PRESENCE', lastSeq: 500, currentEpoch: 0,
    rejoinPending: false, ourMatchId: OUR_MATCH,
  };
  it('departureProofOf: LOBBY phase, or another match id — never the seq fallback, never outside a match / another sender', () => {
    expect(departureProofOf({ ...base, hostPhase: 'LOBBY' })).toBe(true);
    expect(departureProofOf({ ...base, hostPhase: 'MATCH', matchId: 'other' })).toBe(true);
    expect(departureProofOf({ ...base, kind: 'NETSNAPSHOT', snapshotSeq: 900, matchId: 'other' })).toBe(true);
    expect(departureProofOf({ ...base, kind: 'NETSNAPSHOT', snapshotSeq: 100, matchId: OUR_MATCH })).toBe(false);
    expect(departureProofOf({ ...base, kind: 'NETSNAPSHOT', snapshotSeq: 100 })).toBe(false);
    expect(departureProofOf({ ...base, hostPhase: 'MATCH', matchId: OUR_MATCH })).toBe(false);
    expect(departureProofOf({ ...base, hostPhase: 'LOBBY', inMatch: false })).toBe(false);
    expect(departureProofOf({ ...base, hostPhase: 'LOBBY', fromFollowedHost: false })).toBe(false);
  });
  it('shouldLatchDeparture: only with a pending rejoin or a host seen absent this match', () => {
    expect(shouldLatchDeparture({ rejoinPending: false, hostAbsentThisMatch: false })).toBe(false);
    expect(shouldLatchDeparture({ rejoinPending: true, hostAbsentThisMatch: false })).toBe(true);
    expect(shouldLatchDeparture({ rejoinPending: false, hostAbsentThisMatch: true })).toBe(true);
  });
});

describe('S192 A1 + L1 — main.ts wiring (mechanical)', () => {
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  it('onHostSignal no longer latches; the latch is clientHandlers\', gated by hostAbsentThisMatch', () => {
    const at = main.indexOf('onHostSignal: (signal: HostSignal): void => {');
    const body = main.slice(at, main.indexOf('},', at));
    expect(body).not.toContain('hostDepartedPeerId');
    expect(main).toMatch(/hostAbsentThisMatch: \(\): boolean => hostAbsentSeenFor !== null && hostAbsentSeenFor === session\.hostPeerId,/);
    expect(main.match(/session\.hostDepartedPeerId = /g)?.length, 'only the clear outside PLAYING').toBe(1);
  });
  it('the absence is recorded from the RAW transport while a networked client is PLAYING, and dies with the match', () => {
    expect(main).toMatch(/hostAbsentSeenFor = session\.hostPeerId;/);
    const at = main.indexOf("if (!(isNetworked(world) && !world.isHost && world.gameState === 'PLAYING')) {");
    expect(main.slice(at, at + 400)).toContain('hostAbsentSeenFor = null;');
  });
});
