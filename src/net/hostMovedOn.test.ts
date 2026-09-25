/**
 * SPARK — S189 fix round (audit NET-1): **A REJOIN MUST PROVE IT REACHED THE SAME MATCH.**
 *
 * The C4 loop keeps retrying past the grace, and the host's room code is fixed per PAGE LOAD
 * (`hostHandlers.ts` hosts `hostIdentity.roomCode`). So a client left on the terminal overlay could
 * rejoin the host's NEXT lobby or match: a ghost seat in the new quickmatch (auto-begin never fires)
 * while its own overlay cleared to a frozen old board.
 *
 * The two signals, neither of which needs a wire change:
 *   · NEW MATCH — the host's snapshots restart their sequence (a new `HostSync` per hosted room) far
 *     below what this client already accepted, at the same epoch. A migration successor jumps UP
 *     (`MIGRATION_SEQ_JUMP`), never down.
 *   · NEW LOBBY — after a rejoin, the host sends LOBBY_PRESENCE and no snapshot follows within
 *     `HOST_LOBBY_CONFIRM_MS`. ⚠ LOBBY_PRESENCE ALONE IS NOT ENOUGH: the host broadcasts it on every
 *     peer join, in a live match too — including this client's own legitimate rejoin.
 * Both are acted on only while a rejoin is PENDING (an attempt fired, nothing accepted since).
 * And a backstop: the loop gives up `RECONNECT_GIVE_UP_MS` after the loss began.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fake = vi.hoisted(() => ({ route: null as null | ((msg: unknown, peerId: string) => void) }));
vi.mock('./transport.ts', () => ({
  selfId: 'client-self',
  NetTransport: class {
    onError: unknown = null;
    onProtocolMismatch: unknown = null;
    connect(): void {}
    on(h: (msg: unknown, peerId: string) => void): void {
      fake.route = h;
    }
    onPeerChange(): void {}
    peerIds(): string[] {
      return ['host'];
    }
  },
}));

import { connectAsClient } from './clientHandlers.ts';
import { makeNetSession } from './session.ts';
import { makeWorld } from '../state/world.ts';
import {
  classifyHostMessage,
  hostMovedOn,
  planConnectionFrame,
  HOST_LOBBY_CONFIRM_MS,
  HOST_SEQ_REGRESSION_SLACK,
  RECONNECT_GIVE_UP_MS,
  RECONNECT_GRACE_MS,
  type HostSignal,
} from './reconnectPolicy.ts';

afterEach(() => {
  fake.route = null;
});

describe('S189 NET-1 — classifyHostMessage', () => {
  const base = { inMatch: true, fromFollowedHost: true, lastSeq: 500, currentEpoch: 0 };
  it('LOBBY_PRESENCE from the followed host while in a match is a lobby signal', () => {
    expect(classifyHostMessage({ ...base, kind: 'LOBBY_PRESENCE' })).toBe('lobby-presence');
  });
  it('a snapshot whose sequence restarted far below what we accepted, same epoch, is a NEW MATCH', () => {
    expect(classifyHostMessage({ ...base, kind: 'NETSNAPSHOT', snapshotSeq: 3, epoch: 0 })).toBe('new-match');
  });
  it('NEGATIVE — reordering inside the slack, a higher seq, another epoch, another peer, or no match: nothing', () => {
    expect(classifyHostMessage({ ...base, kind: 'NETSNAPSHOT', snapshotSeq: 500 - HOST_SEQ_REGRESSION_SLACK, epoch: 0 })).toBeNull();
    expect(classifyHostMessage({ ...base, kind: 'NETSNAPSHOT', snapshotSeq: 900, epoch: 0 })).toBeNull();
    expect(classifyHostMessage({ ...base, kind: 'NETSNAPSHOT', snapshotSeq: 3, epoch: 1 })).toBeNull();
    expect(classifyHostMessage({ ...base, fromFollowedHost: false, kind: 'LOBBY_PRESENCE' })).toBeNull();
    expect(classifyHostMessage({ ...base, inMatch: false, kind: 'LOBBY_PRESENCE' })).toBeNull();
    expect(classifyHostMessage({ ...base, lastSeq: 0, kind: 'NETSNAPSHOT', snapshotSeq: 1, epoch: 0 })).toBeNull();
  });
});

describe('S189 NET-1 — hostMovedOn (the per-frame verdict)', () => {
  // A transport loss at ~4 s, a rejoin attempt at 8 s, the join lands and the host answers at 10 s.
  const rejoin = { lastRejoinAttemptAtMs: 8_000, lastAcceptedAtMs: 4_000, lobbyPresenceAtMs: 0, newMatchAtMs: 0 };
  it('⛔ after a rejoin, LOBBY_PRESENCE then silence for HOST_LOBBY_CONFIRM_MS → the host moved on to a lobby', () => {
    expect(hostMovedOn({ ...rejoin, lobbyPresenceAtMs: 10_000, nowMs: 10_000 + HOST_LOBBY_CONFIRM_MS })).toBe('lobby');
  });
  it('⛔ after a rejoin, a restarted snapshot sequence → the host moved on to a new match, at once', () => {
    expect(hostMovedOn({ ...rejoin, newMatchAtMs: 10_050, nowMs: 10_060 })).toBe('new-match');
  });
  it('NEGATIVE — a live-match rejoin: a snapshot is accepted after the attempt → not moved on', () => {
    expect(hostMovedOn({ ...rejoin, lobbyPresenceAtMs: 10_000, lastAcceptedAtMs: 10_300, nowMs: 60_000 })).toBeNull();
  });
  it('NEGATIVE — no rejoin attempt (a host frozen while still connected — D4’s case): never', () => {
    expect(hostMovedOn({ ...rejoin, lastRejoinAttemptAtMs: 0, lobbyPresenceAtMs: 10_000, nowMs: 60_000 })).toBeNull();
    // …nor a stale attempt from an earlier, recovered episode (snapshots were accepted after it).
    expect(hostMovedOn({ ...rejoin, lastRejoinAttemptAtMs: 2_000, lobbyPresenceAtMs: 10_000, newMatchAtMs: 10_000, nowMs: 60_000 })).toBeNull();
  });
  it('NEGATIVE — inside the confirm window it waits; a signal from BEFORE the attempt is ignored', () => {
    expect(hostMovedOn({ ...rejoin, lobbyPresenceAtMs: 10_000, nowMs: 10_000 + HOST_LOBBY_CONFIRM_MS - 1 })).toBeNull();
    expect(hostMovedOn({ ...rejoin, lobbyPresenceAtMs: 7_000, newMatchAtMs: 7_500, nowMs: 60_000 })).toBeNull();
  });
});

describe('S189 NET-1 — the retry backstop', () => {
  it('retries stop RECONNECT_GIVE_UP_MS after the loss began; the overlay stays terminal', () => {
    let reconnectUntilMs = 0;
    let nextRetryMs = 0;
    const retriesAt: number[] = [];
    let last = '';
    for (let t = 1_000; t <= 1_000 + RECONNECT_GIVE_UP_MS + 60_000; t += 50) {
      const p = planConnectionFrame({
        nowMs: t, zombieDeposed: false, peersGone: true, isHost: false, hasRoomCode: true, migrationCase: false,
        peerCount: 0, reconnectUntilMs, nextRetryMs, migrationExtraMs: 11_000,
      });
      reconnectUntilMs = p.reconnectUntilMs;
      nextRetryMs = p.nextRetryMs;
      if (p.retry) retriesAt.push(t - 1_000);
      last = p.overlay.kind;
    }
    expect(retriesAt.some((d) => d > RECONNECT_GRACE_MS)).toBe(true); // still past the grace (C4)
    expect(Math.max(...retriesAt)).toBeLessThan(RECONNECT_GIVE_UP_MS);
    expect(last).toBe('terminal');
  });
});

describe('S189 NET-1 — REACH through the real connectAsClient route', () => {
  function rejoined(): { signals: HostSignal[]; receive: ReturnType<typeof vi.fn> } {
    const signals: HostSignal[] = [];
    const receive = vi.fn();
    const session = makeNetSession();
    const world = makeWorld(1);
    world.gameState = 'PLAYING';
    // A rejoin keeps the verified host latch and the ClientSync watermark (S82 P4b).
    session.hostVerifiedPeerId = 'host';
    session.hostPeerId = 'host';
    session.clientSync = { lastSnapshotSeq: () => 500, receive } as never;
    connectAsClient(
      {
        session, world, controls: {} as never, onLobbyError: () => {}, onPresence: () => {},
        clientIdentity: { spkiB64: 'spki', sign: () => Promise.resolve('pop') } as never,
        onHostSignal: (s: HostSignal) => signals.push(s),
      },
      'ROOMAA',
    );
    expect(fake.route).not.toBeNull();
    return { signals, receive };
  }

  it('⛔ the host’s snapshots restart (a NEW MATCH) → the client is told, and the snapshot is not applied', () => {
    const { signals, receive } = rejoined();
    fake.route!({ kind: 'NETSNAPSHOT', snapshotSeq: 2, snapshot: {} }, 'host');
    expect(signals).toEqual(['new-match']);
    expect(receive).not.toHaveBeenCalled();
  });

  it('⛔ LOBBY_PRESENCE from the host while PLAYING → the client is told (main.ts confirms it by the silence)', () => {
    const { signals } = rejoined();
    fake.route!({ kind: 'LOBBY_PRESENCE', roster: [] }, 'host');
    expect(signals).toEqual(['lobby-presence']);
  });

  it('NEGATIVE — the same messages from a peer that is NOT the followed host change nothing', () => {
    const { signals } = rejoined();
    fake.route!({ kind: 'LOBBY_PRESENCE', roster: [] }, 'stranger');
    expect(signals).toEqual([]);
  });

  it('NEGATIVE — the host’s NEXT snapshot in a live match is applied and raises nothing', () => {
    const { signals, receive } = rejoined();
    fake.route!({ kind: 'NETSNAPSHOT', snapshotSeq: 501, snapshot: {} }, 'host');
    expect(signals).toEqual([]);
    expect(receive).toHaveBeenCalledTimes(1);
  });
});

describe('S189 NET-1 — main.ts applies the verdict (the one call site)', () => {
  const main = readFileSync(resolve(__dirname, '../main.ts'), 'utf8').replace(/\r\n/g, '\n');
  it('stamps each reconnect attempt, feeds the host signals in, and leaves to title with the notice', () => {
    expect(main).toMatch(/connectionPlan\.retry[\s\S]{0,200}lastRejoinAttemptAtMs = nowMs;/);
    expect(main).toContain('onHostSignal: (signal: HostSignal): void => {');
    expect(main).toMatch(/const movedOn = hostMovedOn\(\{[\s\S]{0,900}leaveToTitle\(\);\n\s*titleScreen\.setNotice\(/);
    expect(main.match(/hostMovedOn\(/g)?.length).toBe(1);
  });
});
