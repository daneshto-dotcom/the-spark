/**
 * SPARK — S87 P4: QUICK MATCH pure-core tests (election + ready gate).
 * The Trystero discovery plumbing (QuickmatchDiscovery) is integration-only;
 * everything decision-shaped is a pure function and is exhaustively covered here.
 */

import { describe, expect, it } from 'vitest';
import {
  decideQuickmatch,
  qmPromoteDelayMs,
  type QmAnnouncement,
  type QmDecisionState,
} from './quickmatch.ts';
import {
  isQuickmatchAllReady,
  qmReadyCount,
  rosterWithReady,
} from './quickmatchGate.ts';
import type { RosterEntry } from './protocol.ts';

const heard = (...entries: Array<[string, boolean]>): Map<string, QmAnnouncement> => {
  const m = new Map<string, QmAnnouncement>();
  for (const [code, full] of entries) m.set(code, { t: 'host', code, full });
  return m;
};

const seeking = (over: Partial<QmDecisionState> = {}): QmDecisionState => ({
  role: 'seeking',
  myCode: null,
  hostHasPeers: false,
  elapsedMs: 0,
  promoteDelayMs: 2500,
  ...over,
});

const hosting = (myCode: string, over: Partial<QmDecisionState> = {}): QmDecisionState => ({
  role: 'hosting',
  myCode,
  hostHasPeers: false,
  elapsedMs: 0,
  promoteDelayMs: 2500,
  ...over,
});

describe('S87 P4 — decideQuickmatch (election)', () => {
  it('seeker with no beacons before the window WAITs', () => {
    expect(decideQuickmatch(seeking({ elapsedMs: 1000 }), heard()).kind).toBe('wait');
  });

  it('seeker self-PROMOTEs once the jittered window elapses with no host heard', () => {
    expect(decideQuickmatch(seeking({ elapsedMs: 2600 }), heard()).kind).toBe('promote');
  });

  it('seeker JOINs a heard host immediately (even before the window)', () => {
    const d = decideQuickmatch(seeking({ elapsedMs: 100 }), heard(['MNPQRS', false]));
    expect(d).toEqual({ kind: 'join', code: 'MNPQRS' });
  });

  it('seeker joins the SMALLEST advertised code (deterministic convergence)', () => {
    const d = decideQuickmatch(seeking(), heard(['ZZZZZZ', false], ['AAAAAA', false], ['MMMMMM', false]));
    expect(d).toEqual({ kind: 'join', code: 'AAAAAA' });
  });

  it('seeker ignores FULL hosts and waits if all heard rooms are full', () => {
    const d = decideQuickmatch(seeking({ elapsedMs: 100 }), heard(['AAAAAA', true], ['BBBBBB', true]));
    expect(d.kind).toBe('wait');
  });

  it('seeker promotes after the window if every heard room is full', () => {
    const d = decideQuickmatch(seeking({ elapsedMs: 3000 }), heard(['AAAAAA', true]));
    expect(d.kind).toBe('promote');
  });

  it('peerless host with NO smaller code holds (waits)', () => {
    expect(decideQuickmatch(hosting('MMMMMM'), heard(['ZZZZZZ', false])).kind).toBe('wait');
    expect(decideQuickmatch(hosting('MMMMMM'), heard()).kind).toBe('wait');
  });

  it('peerless host demotes (joins) toward a STRICTLY smaller code', () => {
    const d = decideQuickmatch(hosting('MMMMMM'), heard(['AAAAAA', false]));
    expect(d).toEqual({ kind: 'join', code: 'AAAAAA' });
  });

  it('peerless host demotes to the smallest of several smaller codes', () => {
    const d = decideQuickmatch(hosting('MMMMMM'), heard(['LLLLLL', false], ['AAAAAA', false], ['BBBBBB', false]));
    expect(d).toEqual({ kind: 'join', code: 'AAAAAA' });
  });

  it('host WITH peers never demotes, even seeing a smaller code', () => {
    const d = decideQuickmatch(hosting('MMMMMM', { hostHasPeers: true }), heard(['AAAAAA', false]));
    expect(d.kind).toBe('wait');
  });

  it('host never tries to join its OWN announced code echoed back', () => {
    expect(decideQuickmatch(hosting('AAAAAA'), heard(['AAAAAA', false])).kind).toBe('wait');
  });

  it('two peerless hosts converge — larger yields to smaller, smaller holds', () => {
    expect(decideQuickmatch(hosting('BBBBBB'), heard(['AAAAAA', false]))).toEqual({ kind: 'join', code: 'AAAAAA' });
    expect(decideQuickmatch(hosting('AAAAAA'), heard(['BBBBBB', false])).kind).toBe('wait');
  });
});

describe('S87 P4 — qmPromoteDelayMs (jitter)', () => {
  it('is deterministic per id and within [min,max]', () => {
    const a = qmPromoteDelayMs('peer-abc');
    expect(qmPromoteDelayMs('peer-abc')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(2000);
    expect(a).toBeLessThanOrEqual(3500);
  });

  it('de-synchronizes distinct ids (not all identical)', () => {
    const ds = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => qmPromoteDelayMs(`peer-${s}`));
    expect(new Set(ds).size).toBeGreaterThan(1);
  });
});

describe('S87 P4 — isQuickmatchAllReady (start gate)', () => {
  const seats = (...peers: string[]): Map<string, number> =>
    new Map(peers.map((p, i) => [p, i + 1]));
  const ready = (...peers: string[]): Map<string, boolean> =>
    new Map(peers.map((p) => [p, true]));

  it('false with only the host present (<2 players)', () => {
    expect(isQuickmatchAllReady(seats(), ready(), true)).toBe(false);
  });

  it('false until the host itself is ready', () => {
    expect(isQuickmatchAllReady(seats('p1'), ready('p1'), false)).toBe(false);
  });

  it('false while any seated peer is not ready', () => {
    expect(isQuickmatchAllReady(seats('p1', 'p2'), ready('p1'), true)).toBe(false);
  });

  it('true when host + all seated peers are ready and ≥2 present', () => {
    expect(isQuickmatchAllReady(seats('p1'), ready('p1'), true)).toBe(true);
    expect(isQuickmatchAllReady(seats('p1', 'p2'), ready('p1', 'p2'), true)).toBe(true);
  });

  it("a departed peer's stale ready bit cannot wedge OR falsely pass the gate", () => {
    // p2 readied then left (gone from the seat-map but still in readyPeers).
    const stale = ready('p1', 'p2');
    // Gate reads the LIVE seat-map (only p1), so p2's stale bit is irrelevant:
    expect(isQuickmatchAllReady(seats('p1'), stale, true)).toBe(true);
    // And an unready survivor still blocks despite the stale bit.
    expect(isQuickmatchAllReady(seats('p1', 'p3'), stale, true)).toBe(false);
  });
});

describe('S87 P4 — rosterWithReady + qmReadyCount', () => {
  const roster: RosterEntry[] = [
    { seat: 0, peerId: 'HOST', color: 0x111111 },
    { seat: 1, peerId: 'p1', color: 0x222222 },
    { seat: 2, peerId: 'p2', color: 0x333333 },
  ];

  it('attaches the host self-ready to seat 0 and per-peer flags to remotes', () => {
    const out = rosterWithReady(roster, new Map([['p1', true]]), true, 'HOST');
    expect(out[0].ready).toBe(true); // host
    expect(out[1].ready).toBe(true); // p1 ready
    expect(out[2].ready).toBe(false); // p2 default-false
  });

  it('qmReadyCount tallies the ready flags', () => {
    const out = rosterWithReady(roster, new Map([['p1', true]]), true, 'HOST');
    expect(qmReadyCount(out)).toEqual({ ready: 2, total: 3 });
  });
});

/**
 * ⛔⛔ S182 — WHY EVERY QUICKMATCH PAIRING GOES THROUGH THE DEMOTE, AND WHY THE GAP BETWEEN THE TWO
 * CLICKS IS IRRELEVANT.
 *
 * The owner rejected "you both hit Quick Match at the same moment" as the explanation for his two-P1
 * bug, and he was right: *"It's literally like a minute apart … My brother comes on like three
 * minutes later."* These tests pin the mechanism that DOES explain it.
 *
 * A seeker can only join an incumbent by RECEIVING its `{t:'host'}` beacon. That beacon is a
 * Trystero data-channel broadcast (`action.send`) in the discovery room: it reaches only peers whose
 * WebRTC channel is already open, it is not persisted by the relay, and there is no
 * announce-on-peer-join hook — only a 2000 ms interval. So the second player has to complete a full
 * nostr-relay + ICE + data-channel handshake inside its own promote window of 2000–3500 ms.
 *
 * ⭐ THE TRANSPORT'S OWN BUDGET FOR THAT SAME HANDSHAKE IS `HANDSHAKE_TIMEOUT_MS = 30000` — an order
 * of magnitude more. The clock also starts at CLICK time (`QuickmatchDiscovery.start()` sets
 * `startedMs` before `joinNostr`), so the relay connect is inside the window too. A second player
 * therefore promotes itself to host essentially always, whenever it arrives, and the two hosts then
 * resolve via the demote arm — the path whose lobby transition S182 found was being swallowed.
 */
describe('S182 — the seeker promotes before any incumbent beacon can physically arrive', () => {
  // The real loop: `tick()` every TICK_INTERVAL_MS, `elapsedMs` measured from start().
  const TICK_INTERVAL_MS = 700;
  const HANDSHAKE_TIMEOUT_MS = 30000; // net/iceConfig.ts — the transport's own budget

  /** Run the election loop until it leaves 'wait', with a beacon that lands at `beaconAtMs`. */
  const runUntilDecided = (
    promoteDelayMs: number,
    beaconAtMs: number,
  ): { kind: string; atMs: number } => {
    for (let atMs = TICK_INTERVAL_MS; atMs <= 60000; atMs += TICK_INTERVAL_MS) {
      const d = decideQuickmatch(
        seeking({ elapsedMs: atMs, promoteDelayMs }),
        atMs >= beaconAtMs ? heard(['AAAAAA', false]) : heard(),
      );
      if (d.kind !== 'wait') return { kind: d.kind, atMs };
    }
    throw new Error('never decided');
  };

  it('the WHOLE jitter range expires inside one tick of ~4.2 s, far under the handshake budget', () => {
    // qmPromoteDelayMs is [2000, 3500]; the tick granularity rounds that up to at most 4200 ms.
    const worst = 3500 + TICK_INTERVAL_MS;
    expect(worst).toBeLessThan(HANDSHAKE_TIMEOUT_MS / 5);
    // And the jitter is deterministic per id, so this is a property of every peer, not an average.
    for (const id of ['alice', 'bob', 'carol', 'a', '', 'ZZZZZZZZZZ']) {
      expect(qmPromoteDelayMs(id)).toBeGreaterThanOrEqual(2000);
      expect(qmPromoteDelayMs(id)).toBeLessThanOrEqual(3500);
    }
  });

  it('a beacon arriving after a REALISTIC handshake (5 s) always loses to the promote clock', () => {
    for (const id of ['alice', 'bob', 'carol']) {
      expect(runUntilDecided(qmPromoteDelayMs(id), 5000).kind).toBe('promote');
    }
  });

  it('⛔ arriving THREE MINUTES after the incumbent changes nothing — still promote, then demote', () => {
    // The incumbent has been announcing on a 2 s cadence for 180 s. None of it reached this peer:
    // its discovery channel did not exist yet. The first beacon it can see lands one handshake
    // after ITS OWN click, not after the incumbent's.
    const promoteDelayMs = qmPromoteDelayMs('the-brother');
    expect(runUntilDecided(promoteDelayMs, 6000).kind).toBe('promote');
    // Now it is a peerless host that finally hears a SMALLER code: the demote arm, every time.
    const demote = decideQuickmatch(hosting('ZZZZZZ'), heard(['AAAAAA', false]));
    expect(demote).toEqual({ kind: 'join', code: 'AAAAAA' });
  });

  it('only a sub-2 s beacon could have produced a direct join — the case that does not occur', () => {
    // Stated as the counterexample so the claim above is falsifiable rather than merely asserted:
    // the election is NOT broken, it is starved. Give it a beacon inside the window and it joins.
    expect(runUntilDecided(2500, 1000)).toEqual({ kind: 'join', atMs: 1400 });
  });
});
