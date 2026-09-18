/**
 * SPARK — S87 P4: QUICK MATCH pure-core tests (election + ready gate).
 * The Trystero discovery plumbing (QuickmatchDiscovery) is integration-only;
 * everything decision-shaped is a pure function and is exhaustively covered here.
 */

import { describe, expect, it } from 'vitest';
import {
  decideQuickmatch,
  qmPromoteDelayMs,
  TICK_INTERVAL_MS,
  type QmAnnouncement,
  type QmDecisionState,
} from './quickmatch.ts';
import {
  isQuickmatchAllReady,
  qmReadyCount,
  rosterWithReady,
} from './quickmatchGate.ts';
import type { RosterEntry } from './protocol.ts';
// ⭐ S182 — the real constants, so the timing claim below reds on drift instead of comparing
// this file's own literals to each other.
import { HANDSHAKE_TIMEOUT_MS } from './iceConfig.ts';
import { JOIN_STALL_WARN_MS } from './joinDiagnosis.ts';

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
 * ⛔⛔ S182 — WHY THE DEMOTE IS THE DOMINANT PAIRING PATH, AND WHY THE GAP BETWEEN THE TWO CLICKS
 * IS IRRELEVANT TO IT.
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
 * ⭐ AND THE CLOCK STARTS AT CLICK TIME — `QuickmatchDiscovery.start()` stamps `startedMs` before
 * `joinNostr`, so the relay connect is inside the window too. When the handshake loses that race
 * BOTH peers become hosts, and the pair can then only resolve through the demote arm — the path
 * whose lobby transition S182 found was being swallowed.
 *
 * ⛔ S182 SELF-AUDIT — **THIS BLOCK USED TO SAY "essentially always", REASONING FROM
 * `HANDSHAKE_TIMEOUT_MS = 30000` AS THOUGH IT WERE A LATENCY. It is an ABORT DEADLINE** — a ceiling,
 * not a typical connect time, and `joinDiagnosis.ts` models a healthy join far below it. A fast
 * handshake genuinely can land inside the promote window, in which case the seeker joins directly.
 * The defect, the repro and the fix are all unchanged; the certainty was the error. The assertion
 * below is now the honest relationship between the REAL constants rather than a tautology over two
 * literals this file declared itself.
 */
describe('S182 — the promote clock races the discovery handshake, and often wins', () => {
  /**
   * ⛔ S182 SELF-AUDIT — **THESE WERE LOCAL LITERALS AND THE HEADLINE ASSERTION WAS A TAUTOLOGY.**
   * The file declared its own `TICK_INTERVAL_MS = 700` and `HANDSHAKE_TIMEOUT_MS = 30000` eleven
   * lines apart and then asserted `4200 < 30000/5` — two literals in this file compared to each
   * other, which is the ONLY thing that stood behind the root-cause claim. Changing
   * `iceConfig.ts:398` would have left it green while the docblock it pins became false: exactly the
   * drift SPARK's canon rule forbids (*"a number goes into the canon only with its constant"*).
   * They are imported now, so the relationship is pinned to the real values.
   */
  /** Worst-case promote deadline, DERIVED from the shipped jitter function, not from a literal. */
  const worstPromoteMs = Math.max(
    ...Array.from({ length: 512 }, (_, i) => qmPromoteDelayMs(`peer-${i}`)),
  );

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

  it('⭐ the promote deadline expires while the repo still calls a handshake HEALTHY', () => {
    /*
     * THE HONEST RELATIONSHIP, across three modules and zero local literals: a seeker gives up
     * waiting at `worstPromoteMs + TICK_INTERVAL_MS`, which is below `JOIN_STALL_WARN_MS` — the
     * point at which THIS REPO first considers a join slow enough to warn about. So a handshake that
     * is still entirely healthy by the project's own standard has already outlived the promote
     * clock. That is why both-promote is common; it is NOT a proof that it always happens, and the
     * earlier version of this test claimed that on the strength of a tautology.
     */
    expect(worstPromoteMs + TICK_INTERVAL_MS).toBeLessThan(JOIN_STALL_WARN_MS);
    // …and far below the transport's ABORT deadline, which is a ceiling, never a typical latency.
    expect(JOIN_STALL_WARN_MS).toBeLessThan(HANDSHAKE_TIMEOUT_MS);
    // The jitter is deterministic per id, so this is a property of every peer, not an average.
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
