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
import { QM_READY_LOCK_MS, QM_UNREADY_TEAM_COOLDOWN_MS, sessionTeamsPlayable } from './quickmatchGate.ts';
import { makeNetSession } from './session.ts';
import { makeWorld } from '../state/world.ts';

afterEach(() => {
  fake.route = null;
  fake.peerChange = [];
  fake.sent = [];
  fake.peers = ['peer-a'];
});

/** A quickmatch host on T1, ready, with one joiner. `onAutoBegin` is main.ts's gate: refuse one team. */
function qmHost(quickmatch = true) {
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
  return { session, route: fake.route!, begins: () => begins, arms: () => arms };
}

const presences = (): Array<{ countdownMs?: number; roster: Array<{ peerId: string; team?: number }> }> =>
  fake.sent.filter((m) => (m as { kind: string }).kind === 'LOBBY_PRESENCE') as never;

describe('S193 F2 + ⭐ S195 N3 — the quickmatch gate, with READY locking your team', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('⛔ REACH: ready + ONE team never counts down; a READY joiner cannot switch (N3); un-ready → 3 s → switch → ready → 3 s lock → begin', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const h = qmHost();
    h.route({ kind: 'CLAIM_TEAM', team: 0 }, 'peer-a'); // both on T1 — not ready yet, so the pick lands
    expect(h.session.teamByPeer.get('peer-a')).toBe(0);
    h.route({ kind: 'LOBBY_READY', ready: true }, 'peer-a');
    expect(h.session.qmCountdownTimer, 'one team: no countdown').toBeNull();
    vi.advanceTimersByTime(QM_READY_LOCK_MS);
    expect(h.arms(), 'one team: never begins').toBe(0);
    // ⛔ N3 — ready locks the team: the claim is REFUSED (the beacon carries the unchanged team)
    h.route({ kind: 'CLAIM_TEAM', team: 1 }, 'peer-a');
    expect(h.session.teamByPeer.get('peer-a'), 'a ready player cannot change team').toBe(0);
    expect(presences().at(-1)!.roster.find((e) => e.peerId === 'peer-a')!.team).toBe(0);
    // un-ready → still locked for 3 s
    h.route({ kind: 'LOBBY_READY', ready: false }, 'peer-a');
    vi.advanceTimersByTime(QM_UNREADY_TEAM_COOLDOWN_MS - 1);
    h.route({ kind: 'CLAIM_TEAM', team: 1 }, 'peer-a');
    expect(h.session.teamByPeer.get('peer-a'), 'inside the un-ready cooldown').toBe(0);
    vi.advanceTimersByTime(1);
    h.route({ kind: 'CLAIM_TEAM', team: 1 }, 'peer-a');
    expect(h.session.teamByPeer.get('peer-a'), 'after 3 s the switch lands').toBe(1);
    // ready again → two sides → the 3 s LOCK, carried on the beacon, then Begin
    h.route({ kind: 'LOBBY_READY', ready: true }, 'peer-a');
    expect(h.session.qmCountdownTimer).not.toBeNull();
    expect(presences().at(-1)!.countdownMs).toBe(QM_READY_LOCK_MS);
    vi.advanceTimersByTime(QM_READY_LOCK_MS - 1);
    expect(h.begins(), 'still counting').toBe(0);
    vi.advanceTimersByTime(1);
    expect(h.begins(), 'the lock ran out — it begins').toBe(1);
  });

  it('⛔ anyone UN-readying during the lock STOPS it (N3 "people can stop it")', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const h = qmHost();
    h.route({ kind: 'CLAIM_TEAM', team: 1 }, 'peer-a');
    h.route({ kind: 'LOBBY_READY', ready: true }, 'peer-a');
    expect(h.session.qmCountdownTimer).not.toBeNull();
    vi.advanceTimersByTime(1500);
    h.route({ kind: 'LOBBY_READY', ready: false }, 'peer-a');
    expect(h.session.qmCountdownTimer).toBeNull();
    expect(presences().at(-1)!.countdownMs, 'the cancel is broadcast: no countdown on the beacon').toBeUndefined();
    vi.advanceTimersByTime(10_000);
    expect(h.arms()).toBe(0);
  });

  it('⛔ NEGATIVE — the friends lobby has no READY, so a team pick is always free', () => {
    const h = qmHost(false);
    h.route({ kind: 'CLAIM_TEAM', team: 1 }, 'peer-a');
    expect(h.session.teamByPeer.get('peer-a')).toBe(1);
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
