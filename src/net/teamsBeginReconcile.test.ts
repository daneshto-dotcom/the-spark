/**
 * ⭐ S194 (audit LOW-3, teams spec Q2) — **BEGIN RE-ASKS THE TWO-SIDES GATE ON THE SEATS IT WILL ROSTER.**
 *
 * main.ts asks `sessionTeamsPlayable` before Begin, against `lobbySeats` as the lobby last drew them; `beginMatch`
 * then reconciles those seats against the LIVE transport. A peer that left in between (T1 / T1 / T2, the T2 peer
 * gone) used to let a ONE-team room start. REACH through the real `createBeginMatchHandler`, transport mocked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  route: null as null | ((msg: unknown, peerId: string) => void),
  peerChange: [] as Array<(peerId: string, kind: 'join' | 'leave') => void>,
  sent: [] as unknown[],
  peers: ['peer-a'] as string[],
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
    onPeerChange(h: (peerId: string, kind: 'join' | 'leave') => void): void {
      fake.peerChange.push(h);
    }
    peerIds(): string[] {
      return fake.peers;
    }
    send(m: unknown): void {
      fake.sent.push(m);
    }
    disconnect(): void {}
  },
}));

import { createBeginMatchHandler } from './hostHandlers.ts';
import { makeNetSession } from './session.ts';
import { makeWorld } from '../state/world.ts';

afterEach(() => {
  fake.route = null;
  fake.peerChange = [];
  fake.sent = [];
  fake.peers = ['peer-a'];
});

/** Host on `self`, two seated joiners a / b with the given teams; `live` = the peers still on the transport. */
async function begin(self: number | null, a: number | undefined, b: number | undefined, live: string[]): Promise<{ started: boolean; signals: number }> {
  const session = makeNetSession();
  const world = makeWorld(1);
  world.gameState = 'LOBBY';
  session.netTransport = { peerIds: () => fake.peers, send: (m: unknown) => fake.sent.push(m) } as never;
  session.lobbySeats.set('peer-a', 1);
  session.lobbySeats.set('peer-b', 2);
  session.selfTeam = self;
  if (a !== undefined) session.teamByPeer.set('peer-a', a);
  if (b !== undefined) session.teamByPeer.set('peer-b', b);
  fake.peers = live;
  createBeginMatchHandler({
    session, world,
    hostIdentity: { roomCode: 'ROOMAA', spkiB64: 'h', makeAttest: () => new Promise(() => {}), sign: async () => 'sig' } as never,
  })();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const signals = fake.sent.filter((m) => (m as { kind: string }).kind === 'START_GAME_SIGNAL').length;
  return { started: (world.gameState as string) !== 'LOBBY', signals };
}

describe('S194 LOW-3 — the Begin two-sides gate reads the RECONCILED seats', () => {
  it('⛔ T1 / T1 / T2 with the T2 peer gone at Begin: ONE side left → refused, nothing sent, still LOBBY', async () => {
    expect(await begin(0, 0, 1, ['peer-a'])).toEqual({ started: false, signals: 0 });
  });
  it('CONTROL — the same room with every peer present: two sides → it begins', async () => {
    expect(await begin(0, 0, 1, ['peer-a', 'peer-b'])).toEqual({ started: true, signals: 1 });
  });
  it('NEGATIVE — no teams picked: a peer leaving at Begin still lets the 1v1 start (FFA unchanged)', async () => {
    expect(await begin(null, undefined, undefined, ['peer-a'])).toEqual({ started: true, signals: 1 });
  });
});
