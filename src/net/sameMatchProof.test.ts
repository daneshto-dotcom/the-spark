/**
 * SPARK — S191 NETFR-1 (HIGH) + NETFR-2 (MED): **A REJOIN PROVES IT REACHED THE SAME MATCH — POSITIVELY.**
 *
 * The S189 FR-1 cut inferred "the host moved on" from two NEGATIVE signals, and both were wrong in a
 * reachable case:
 *   · NETFR-1 — LOBBY_PRESENCE + 5 s of silence was read as "the host is in a lobby". But a host whose
 *     tab is HIDDEN is exactly that: rAF pauses its snapshot sends while Trystero's event-driven
 *     signalling still fires `onPeerChange('join')` → `broadcastQmPresence` in ANY state. So a rejoin to
 *     a live-but-hidden match was sent to title with a false notice.
 *   · NETFR-2 — "the seq restarted" was the only new-match test. A host's NEXT match whose sequence has
 *     already passed our old watermark sailed through, and the client rendered a stranger's match from
 *     its old seat.
 *
 * The fix is a positive proof: the host mints a per-match id at Begin (`selfId` + a per-page-load
 * counter — never `Math.random`, never a wall clock), and it rides START_GAME_SIGNAL, LOBBY_PRESENCE
 * (with the host's phase, `'LOBBY' | 'MATCH'`) and NETSNAPSHOT. While a rejoin is PENDING, a snapshot
 * reaches `ClientSync.receive` only if its id is OURS; a presence in phase LOBBY is a lobby verdict at
 * once; fields ABSENT fall back to the S189 seq check and never produce a lobby verdict.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fake = vi.hoisted(() => ({
  route: null as null | ((msg: unknown, peerId: string) => void),
  peerChange: [] as Array<(peerId: string, kind: 'join' | 'leave') => void>,
  sent: [] as unknown[],
  peers: ['host-peer'] as string[],
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

import { connectAsClient, type JoinAttemptDeps } from './clientHandlers.ts';
import { createBeginMatchHandler, createHostStartHandler } from './hostHandlers.ts';
import { broadcastQmPresence } from './quickmatchGate.ts';
import { makeNetSession, teardownNet } from './session.ts';
import { ClientSync, HostSync } from './sync.ts';
import { parseNetMessage, type RosterEntry } from './protocol.ts';
import { hostMovedOn, isRejoinPending, type HostSignal } from './reconnectPolicy.ts';
import { makeWorld } from '../state/world.ts';
import { asPlayerId } from '../types.ts';

afterEach(() => {
  fake.route = null;
  fake.peerChange = [];
  fake.sent = [];
  fake.peers = ['host-peer'];
  vi.restoreAllMocks();
});

const HOST = 'host-peer';
const OUR_MATCH = 'host-peer.1';
const ROSTER: RosterEntry[] = [
  { seat: 0, peerId: HOST, color: 0xff3b6b },
  { seat: 1, peerId: 'self-peer-id', color: 0x3bd1ff },
];

/**
 * A client PLAYING a match with id `OUR_MATCH`, watermark seq 500 accepted at 4 s; its transport died and
 * the loop's rejoin attempt fired at 8 s — exactly what `main.ts` does: stamp the attempt, then
 * `connectAsClient` with the SAME session (ClientSync and the verified host latch survive, S82 P4b).
 * `onHostSignal` stamps like main.ts; `verdict()` is main.ts's once-per-frame `hostMovedOn`.
 */
function rejoinHarness(opts: { ourMatchId?: string | null; attempt?: boolean } = {}) {
  let now = 4_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const session = makeNetSession();
  const world = makeWorld(1);
  world.gameState = 'PLAYING';
  session.hostVerifiedPeerId = HOST;
  session.hostPeerId = HOST;
  session.matchId = opts.ourMatchId === undefined ? OUR_MATCH : opts.ourMatchId;
  const sync = new ClientSync();
  sync.receive({ kind: 'NETSNAPSHOT', snapshotSeq: 500, snapshot: {} } as never, now);
  session.clientSync = sync;
  const receive = vi.spyOn(sync, 'receive');
  const signals: HostSignal[] = [];
  let attemptAt = 0;
  let lobbyAt = 0;
  let newMatchAt = 0;
  const deps: JoinAttemptDeps = {
    session,
    world,
    controls: { setPlayerId: () => {} } as never,
    onLobbyError: () => {},
    onPresence: () => {},
    clientIdentity: { spkiB64: 'spki', sign: () => Promise.resolve('pop') } as never,
    onHostSignal: (s: HostSignal) => {
      signals.push(s);
      if (s === 'new-match') newMatchAt = now;
      else lobbyAt = now;
    },
    isRejoinPending: () => isRejoinPending(attemptAt, sync.lastAcceptedAt()),
  };
  now = 8_000;
  if (opts.attempt !== false) attemptAt = now;
  connectAsClient(deps, 'ROOMAA');
  expect(fake.route).not.toBeNull();
  return {
    signals,
    receive,
    sync,
    session,
    at(t: number): void {
      now = t;
    },
    host(msg: unknown): void {
      fake.route!(msg, HOST);
    },
    verdict(): 'new-match' | 'lobby' | null {
      return hostMovedOn({
        lastRejoinAttemptAtMs: attemptAt,
        lastAcceptedAtMs: sync.lastAcceptedAt(),
        lobbyAtMs: lobbyAt,
        newMatchAtMs: newMatchAt,
      });
    },
  };
}

function snap(seq: number, matchId?: string): unknown {
  return { kind: 'NETSNAPSHOT', snapshotSeq: seq, snapshot: {}, ...(matchId !== undefined ? { matchId } : {}) };
}

describe('S191 NETFR-1 — a rejoin that lands on a HIDDEN live host is not sent to title', () => {
  it('⛔ presence in phase MATCH (and one with no phase), 20 s of silence, then a same-id snapshot: no verdict, the snapshot applies', () => {
    const h = rejoinHarness();
    // The hidden host's Trystero signalling answers our join: onPeerChange → broadcastQmPresence.
    h.at(10_000);
    h.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER, phase: 'MATCH', matchId: OUR_MATCH });
    for (let t = 10_000; t <= 20_000; t += 100) {
      h.at(t);
      expect(h.verdict(), `frame at ${t} ms`).toBeNull();
    }
    // A presence with NO phase (a host that does not stamp one) is not a lobby verdict either.
    h.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER });
    for (let t = 20_000; t <= 30_000; t += 100) {
      h.at(t);
      expect(h.verdict(), `frame at ${t} ms`).toBeNull();
    }
    expect(h.signals).toEqual([]);
    // The tab comes back: its next snapshot carries our id and is released to ClientSync.
    h.at(30_000);
    h.host(snap(501, OUR_MATCH));
    expect(h.receive).toHaveBeenCalledTimes(1);
    expect(h.sync.lastSnapshotSeq()).toBe(501);
    expect(h.verdict()).toBeNull();
    expect(h.signals).toEqual([]);
  });

  it('⛔ presence in phase LOBBY after the attempt IS the lobby verdict — at once, not after a silence', () => {
    const h = rejoinHarness();
    h.at(10_000);
    h.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER, phase: 'LOBBY' });
    expect(h.signals).toEqual(['lobby']);
    expect(h.verdict()).toBe('lobby');
  });

  it('⛔ presence in phase MATCH with a DIFFERENT id: the host is in its next match', () => {
    const h = rejoinHarness();
    h.at(10_000);
    h.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER, phase: 'MATCH', matchId: 'host-peer.2' });
    expect(h.signals).toEqual(['new-match']);
    expect(h.verdict()).toBe('new-match');
  });
});

describe('S191 NETFR-2 — a stranger match whose seq passed our watermark is NOT adopted', () => {
  it('⛔ pending rejoin, watermark 500: a seq-900 snapshot with a DIFFERENT id → new-match at once, ClientSync never sees it', () => {
    const h = rejoinHarness();
    h.at(10_000);
    h.host(snap(900, 'host-peer.2'));
    expect(h.signals).toEqual(['new-match']);
    expect(h.receive).not.toHaveBeenCalled();
    expect(h.sync.lastSnapshotSeq()).toBe(500);
    expect(h.verdict()).toBe('new-match');
  });

  it('the same id at seq 901 is released and applied; nothing is raised and the rejoin is no longer pending', () => {
    const h = rejoinHarness();
    h.at(10_000);
    h.host(snap(901, OUR_MATCH));
    expect(h.signals).toEqual([]);
    expect(h.receive).toHaveBeenCalledTimes(1);
    expect(h.sync.lastSnapshotSeq()).toBe(901);
    expect(h.verdict()).toBeNull();
  });
});

describe('S191 — fields ABSENT: the S189 seq check is the fallback, and no lobby verdict', () => {
  it('an id-less snapshot past the watermark applies (today); an id-less restarted seq is still new-match (today)', () => {
    const a = rejoinHarness();
    a.at(10_000);
    a.host(snap(900));
    expect(a.signals).toEqual([]);
    expect(a.receive).toHaveBeenCalledTimes(1);
    const b = rejoinHarness();
    b.at(10_000);
    b.host(snap(3));
    expect(b.signals).toEqual(['new-match']);
    expect(b.receive).not.toHaveBeenCalled();
  });

  it('we hold no id (a Begin that carried none): an id-bearing snapshot falls back to the seq check', () => {
    const h = rejoinHarness({ ourMatchId: null });
    h.at(10_000);
    h.host(snap(900, 'host-peer.2'));
    expect(h.signals).toEqual([]);
    expect(h.receive).toHaveBeenCalledTimes(1);
  });

  it('NEGATIVE — no rejoin pending (D4’s frozen-but-connected host): nothing is held, nothing is raised', () => {
    const h = rejoinHarness({ attempt: false });
    h.at(10_000);
    h.host({ kind: 'LOBBY_PRESENCE', roster: ROSTER, phase: 'MATCH', matchId: OUR_MATCH });
    h.host(snap(501, OUR_MATCH));
    expect(h.signals).toEqual([]);
    expect(h.receive).toHaveBeenCalledTimes(1);
    expect(h.verdict()).toBeNull();
  });
});

describe('S191 — the host mints the id and stamps it on all three carriers', () => {
  function beginDeps() {
    const session = makeNetSession();
    const world = makeWorld(1);
    world.gameState = 'LOBBY';
    const sent: Array<Record<string, unknown>> = [];
    session.netTransport = { peerIds: () => ['peer-a'], send: (m: Record<string, unknown>) => sent.push(m) } as never;
    session.roomCode = 'ROOMAA';
    return { session, world, sent, hostIdentity: {} as never };
  }

  it('Begin mints `selfId.N` from a per-page-load counter (no Math.random), stores it, and START_GAME_SIGNAL carries it', async () => {
    const rnd = vi.spyOn(Math, 'random');
    const a = beginDeps();
    createBeginMatchHandler(a)();
    await Promise.resolve();
    const b = beginDeps();
    createBeginMatchHandler(b)();
    await Promise.resolve();
    const idA = a.session.matchId;
    const idB = b.session.matchId;
    expect(idA).toMatch(/^self-peer-id\.\d+$/);
    expect(idB).toMatch(/^self-peer-id\.\d+$/);
    expect(Number(idB!.split('.')[1])).toBe(Number(idA!.split('.')[1]) + 1);
    expect(a.sent.find((m) => m.kind === 'START_GAME_SIGNAL')?.matchId).toBe(idA);
    expect(rnd).not.toHaveBeenCalled();
  });

  it('presence carries the host phase from gameState, and the id once there is one', () => {
    const s = makeNetSession();
    const sent: Array<Record<string, unknown>> = [];
    const t = { peerIds: () => [], send: (m: Record<string, unknown>) => sent.push(m) } as never;
    broadcastQmPresence(s, t, () => {}, 'LOBBY');
    s.matchId = OUR_MATCH;
    broadcastQmPresence(s, t, () => {}, 'PLAYING');
    broadcastQmPresence(s, t, () => {}, 'POSTGAME');
    expect(sent.map((m) => [m.phase, m.matchId])).toEqual([
      ['LOBBY', undefined],
      ['MATCH', OUR_MATCH],
      ['MATCH', OUR_MATCH],
    ]);
  });

  it('⛔ REACH — the real host path: a peer joining a PLAYING host gets presence in phase MATCH with the id', () => {
    const session = makeNetSession();
    const world = makeWorld(1);
    createHostStartHandler({
      session,
      world,
      hostIdentity: { roomCode: 'ROOMAA', makeAttest: () => new Promise(() => {}) } as never,
      onLobbyError: () => {},
      onPresence: () => {},
      onAutoBegin: () => {},
      intentRateLimiter: { reset: () => {}, forget: () => {}, tryConsume: () => true } as never,
    })();
    world.gameState = 'PLAYING';
    session.matchId = OUR_MATCH;
    for (const h of fake.peerChange) h('rejoiner', 'join');
    const presence = fake.sent.filter((m) => (m as { kind: string }).kind === 'LOBBY_PRESENCE') as Array<Record<string, unknown>>;
    expect(presence).toHaveLength(1);
    expect(presence[0]!.phase).toBe('MATCH');
    expect(presence[0]!.matchId).toBe(OUR_MATCH);
  });

  it('HostSync stamps the id on both envelope builders; null leaves the envelope as it was', () => {
    const w = makeWorld(1);
    const hs = new HostSync();
    expect(hs.buildSnapshotMessage(w, 0, OUR_MATCH).matchId).toBe(OUR_MATCH);
    expect(hs.wrapSnapshot({} as never, 0, OUR_MATCH).matchId).toBe(OUR_MATCH);
    expect('matchId' in hs.buildSnapshotMessage(w, 0, null)).toBe(false);
    expect('matchId' in hs.buildSnapshotMessage(w)).toBe(false);
  });

  it('the client stores the id off the Begin; teardownNet clears it', () => {
    const session = makeNetSession();
    const world = makeWorld(1);
    world.gameState = 'LOBBY';
    session.hostVerifiedPeerId = HOST;
    connectAsClient(
      {
        session, world, controls: { setPlayerId: () => {} } as never, onLobbyError: () => {}, onPresence: () => {},
        clientIdentity: { spkiB64: 'spki', sign: () => Promise.resolve('pop') } as never,
      },
      'ROOMAA',
    );
    fake.route!({ kind: 'START_GAME_SIGNAL', mode: '1v1', roster: ROSTER, matchId: OUR_MATCH }, HOST);
    expect(session.matchId).toBe(OUR_MATCH);
    teardownNet(session, world, { setPlayerId: () => {} } as never, asPlayerId(0));
    expect(session.matchId).toBeNull();
  });
});

describe('S191 — the wire tolerates the new fields and validates them on the way in', () => {
  const snapshot = { kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: { schemaVersion: 1 } };
  const begin = { kind: 'START_GAME_SIGNAL', mode: '1v1', roster: ROSTER };
  const presence = { kind: 'LOBBY_PRESENCE', roster: ROSTER };
  it('absent or well-formed: parsed, fields kept', () => {
    for (const m of [snapshot, begin, presence]) {
      expect(parseNetMessage(m)).not.toBeNull();
      expect((parseNetMessage({ ...m, matchId: OUR_MATCH }) as { matchId?: string } | null)?.matchId).toBe(OUR_MATCH);
    }
    for (const phase of ['LOBBY', 'MATCH']) {
      expect((parseNetMessage({ ...presence, phase }) as { phase?: string } | null)?.phase).toBe(phase);
    }
  });
  it('⛔ malformed: dropped (a non-string, an empty or an over-long id; a phase that is not one of the two literals)', () => {
    for (const m of [snapshot, begin, presence]) {
      for (const bad of [7, '', 'x'.repeat(65), null, {}]) {
        expect(parseNetMessage({ ...m, matchId: bad }), `${m.kind} matchId=${JSON.stringify(bad)}`).toBeNull();
      }
      expect(parseNetMessage({ ...m, matchId: 'x'.repeat(64) })).not.toBeNull();
    }
    for (const bad of ['lobby', 'PLAYING', 1, null]) {
      expect(parseNetMessage({ ...presence, phase: bad }), `phase=${JSON.stringify(bad)}`).toBeNull();
    }
  });
});

describe('S191 — main.ts wires the proof (mechanical)', () => {
  const main = readFileSync(resolve(__dirname, '../main.ts'), 'utf8').replace(/\r\n/g, '\n');
  // Code only: a comment that names a builder is not a call site.
  const code = main
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  it('EVERY snapshot envelope main.ts builds carries session.matchId', () => {
    const calls = code.match(/\.(?:buildSnapshotMessage|wrapSnapshot)\(/g) ?? [];
    const stamped = code.match(/\.(?:buildSnapshotMessage|wrapSnapshot)\([^;]*?session\.currentEpoch, session\.matchId\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(stamped.length).toBe(calls.length);
  });
  it('EVERY presence broadcast main.ts makes passes world.gameState, and the client deps carry the pending test', () => {
    const calls = main.match(/broadcastQmPresence\(/g) ?? [];
    const phased = main.match(/broadcastQmPresence\(session, session\.netTransport, onPresence, world\.gameState\)/g) ?? [];
    expect(calls.length).toBe(phased.length);
    expect(main).toMatch(/isRejoinPending: \(\): boolean => isRejoinPending\(lastRejoinAttemptAtMs, session\.clientSync\?\.lastAcceptedAt\(\) \?\? 0\)/);
  });
});

/**
 * ⛔ S191 FIX-1 / WIRE-1 (audit wf_0593f6fe-d53, MED) — TWO BEGINS INSIDE THE SIGN WINDOW MINTED TWO IDS.
 *
 * Both strategies deliver a LOBBY_READY, so the quickmatch gate fires Begin twice; `world.gameState` is
 * still LOBBY while `beginMatch` awaits `signWarrant`, so main.ts's LOBBY gate lets both through. #1 sent
 * `sid.1` and started the match; #2 then minted `sid.2` — the host kept .2 while every client stored .1,
 * and every later C4 rejoin of that LIVE match was held as 'new-match' and sent to title.
 */
describe('S191 FIX-1 — one Begin at a time: one START_GAME_SIGNAL, one id, the id the clients hold', () => {
  function signingHost() {
    const session = makeNetSession();
    const world = makeWorld(1);
    world.gameState = 'LOBBY';
    const pendingSigns: Array<(sig: string) => void> = [];
    const hostIdentity = {
      roomCode: 'ROOMAA',
      spkiB64: 'host-spki',
      makeAttest: () => new Promise(() => {}),
      sign: () => new Promise<string>((r) => pendingSigns.push(r)),
    } as never;
    const begin = createBeginMatchHandler({ session, world, hostIdentity });
    fake.peers = ['peer-a'];
    createHostStartHandler({
      session,
      world,
      hostIdentity,
      onLobbyError: () => {},
      onPresence: () => {},
      // main.ts's own wrapper: ignore it once the match has left LOBBY.
      onAutoBegin: () => {
        if (world.gameState === 'LOBBY') begin();
      },
      intentRateLimiter: { reset: () => {}, forget: () => {}, tryConsume: () => true } as never,
    })();
    session.quickmatch = true;
    session.qmSelfReady = true;
    for (const h of fake.peerChange) h('peer-a', 'join');
    // peer-a proved a pubkey, so Begin signs a warrant — the await that opens the window.
    session.peerPubkeys.set('peer-a', 'spki-a');
    const hostRoute = fake.route!;
    const signals = (): Array<Record<string, unknown>> =>
      fake.sent.filter((m) => (m as { kind: string }).kind === 'START_GAME_SIGNAL') as Array<Record<string, unknown>>;
    const resolveSigns = async (): Promise<void> => {
      while (pendingSigns.length > 0) pendingSigns.shift()!('sig');
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };
    return { session, world, begin, hostRoute, signals, resolveSigns };
  }

  it('⛔ two LOBBY_READY copies (both strategies) inside the sign window → ONE signal, ONE id; the client holds the host’s id and a later rejoin is applied', async () => {
    const h = signingHost();
    h.hostRoute({ kind: 'LOBBY_READY', ready: true }, 'peer-a');
    h.hostRoute({ kind: 'LOBBY_READY', ready: true }, 'peer-a'); // the second strategy's copy
    await h.resolveSigns();
    expect(h.signals(), 'exactly one Begin reaches the wire').toHaveLength(1);
    const wireId = h.signals()[0]!.matchId as string;
    expect(h.session.matchId, 'the host keeps the id it sent').toBe(wireId);

    // The client stores what the wire carried …
    const client = makeNetSession();
    const cw = makeWorld(1);
    cw.gameState = 'LOBBY';
    client.hostVerifiedPeerId = HOST;
    connectAsClient(
      {
        session: client, world: cw, controls: { setPlayerId: () => {} } as never, onLobbyError: () => {}, onPresence: () => {},
        clientIdentity: { spkiB64: 'spki', sign: () => Promise.resolve('pop') } as never,
      },
      'ROOMAA',
    );
    fake.route!({ ...h.signals()[0]!, roster: ROSTER }, HOST);
    expect(client.matchId).toBe(h.session.matchId);

    // … and a later C4 rejoin of that live match is RELEASED by the host's snapshots, not sent to title.
    const r = rejoinHarness({ ourMatchId: client.matchId });
    r.at(10_000);
    r.host(snap(501, h.session.matchId!));
    expect(r.signals).toEqual([]);
    expect(r.receive).toHaveBeenCalledTimes(1);
  });

  it('⛔ a double-clicked manual Begin (no LOBBY gate on the button) inside the sign window → one signal, one id', async () => {
    const h = signingHost();
    h.begin();
    h.begin();
    await h.resolveSigns();
    expect(h.signals()).toHaveLength(1);
    expect(h.session.matchId).toBe(h.signals()[0]!.matchId);
    expect(h.session.beginInFlight, 'the latch is released once the Begin settles').toBe(false);
  });

  it('the in-flight latch dies with the session (teardownNet)', () => {
    const s = makeNetSession();
    s.beginInFlight = true;
    teardownNet(s, makeWorld(1), { setPlayerId: () => {} } as never, asPlayerId(0));
    expect(s.beginInFlight).toBe(false);
  });
});
