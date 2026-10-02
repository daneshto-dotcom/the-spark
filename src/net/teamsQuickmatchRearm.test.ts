/**
 * ⭐ S193 (audit F2, teams spec Q2) — **A TEAM PICK RE-ARMS QUICK MATCH'S ALL-READY GATE.**
 *
 * Quick match has no Begin button: the host auto-begins when every seat is READY (`maybeQmAutoBegin`), and
 * `main.ts` refuses a room where every seat is on one team. Before this fix a `CLAIM_TEAM` that turned such a
 * room into two sides never fired the gate again — readiness had not changed, so nothing did — and the room
 * sat ready forever. REACH through the REAL host message route (`createHostStartHandler`, transport mocked).
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

import { createHostStartHandler } from './hostHandlers.ts';
import { sessionTeamsPlayable } from './quickmatchGate.ts';
import { makeNetSession } from './session.ts';
import { makeWorld } from '../state/world.ts';

afterEach(() => {
  fake.route = null;
  fake.peerChange = [];
  fake.sent = [];
  fake.peers = ['peer-a'];
});

/** A quickmatch host on T1, ready, with one joiner. `onAutoBegin` is main.ts's gate: refuse one team. */
function qmHost(quickmatch = true): { route: (msg: unknown, peer: string) => void; begins: () => number; arms: () => number } {
  const session = makeNetSession();
  const world = makeWorld(1);
  world.gameState = 'LOBBY';
  let arms = 0;
  let begins = 0;
  createHostStartHandler({
    session,
    world,
    hostIdentity: { roomCode: 'ROOMAA', makeAttest: () => new Promise(() => {}) } as never,
    onLobbyError: () => {},
    onPresence: () => {},
    onAutoBegin: () => {
      arms += 1;
      if (sessionTeamsPlayable(session)) begins += 1;
    },
    intentRateLimiter: { reset: () => {}, forget: () => {}, tryConsume: () => true } as never,
  })();
  session.quickmatch = quickmatch;
  session.qmSelfReady = true;
  session.selfTeam = 0;
  for (const h of fake.peerChange) h('peer-a', 'join');
  return { route: fake.route!, begins: () => begins, arms: () => arms };
}

describe('S193 F2 — CLAIM_TEAM re-arms the quickmatch auto-begin', () => {
  it('⛔ REACH: ready + ONE team is refused; the joiner then picks T2 → the gate fires again and the match begins', () => {
    const h = qmHost();
    h.route({ kind: 'CLAIM_TEAM', team: 0 }, 'peer-a'); // both on T1 — not ready yet
    expect(h.arms(), 'nobody ready on the joiner side yet').toBe(0);
    h.route({ kind: 'LOBBY_READY', ready: true }, 'peer-a');
    expect(h.arms(), 'all ready → the gate fired').toBeGreaterThan(0);
    expect(h.begins(), 'but one team: refused').toBe(0);
    const armed = h.arms();
    h.route({ kind: 'CLAIM_TEAM', team: 1 }, 'peer-a');
    expect(h.arms(), 'the team pick RE-ARMED the gate').toBe(armed + 1);
    expect(h.begins(), 'two sides now → it begins').toBe(1);
  });

  it('CONTROL — a team pick while someone is NOT ready does not begin', () => {
    const h = qmHost();
    h.route({ kind: 'CLAIM_TEAM', team: 1 }, 'peer-a');
    expect(h.begins()).toBe(0);
  });

  it('CONTROL — the friends lobby (not quickmatch) never auto-begins on a team pick', () => {
    const h = qmHost(false);
    h.route({ kind: 'LOBBY_READY', ready: true }, 'peer-a');
    h.route({ kind: 'CLAIM_TEAM', team: 1 }, 'peer-a');
    expect(h.arms()).toBe(0);
  });

  it('sessionTeamsPlayable: the host’s pick + every seated peer’s', () => {
    const s = makeNetSession();
    expect(sessionTeamsPlayable(s), 'host alone').toBe(true);
    s.lobbySeats.set('a', 1);
    s.selfTeam = 2;
    s.teamByPeer.set('a', 2);
    expect(sessionTeamsPlayable(s), 'both on T3').toBe(false);
    s.teamByPeer.delete('a');
    expect(sessionTeamsPlayable(s), 'the peer unpicked = its own side').toBe(true);
  });
});
