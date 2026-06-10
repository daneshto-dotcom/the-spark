/**
 * SPARK — S79 P4 client host sender-auth tests, upgraded for S82 P4(a) crypto identity.
 *
 * hostAuthFilter is the pure gate in front of the joiner's message handler (the
 * #test-via-pure-helper-export pattern). S82 contract under test:
 *   1. the latch — REQUIRES session.hostVerifiedPeerId === sender (cryptographic
 *      precondition, set by verifyHostAttest in the join handler) AND a roster-bearing
 *      message whose seat-0 entry NAMES THE SENDER. The S79 first-NETSNAPSHOT fallback
 *      is REMOVED — that was the raceable path (the documented S79 ceiling).
 *   2. the gate — the five host-authored kinds drop unless sent by the latched host
 *      (fail-closed pre-latch), while INTENT/HELLO flow regardless;
 *   3. the spoof cases: spoofed-snapshotSeq wedge, fake ENDGAME, START_GAME_SIGNAL seat
 *      hijack, roster naming someone else, and the S79 RACE itself — an UNVERIFIED peer
 *      beating the host's first message can no longer win the latch.
 */

import { describe, expect, it } from 'vitest';
import type { NetMessage } from './protocol.ts';
import { hostAuthFilter } from './clientHandlers.ts';

const HOST = 'peer-host';
const EVIL = 'peer-evil';

type LatchState = { hostPeerId: string | null; hostVerifiedPeerId: string | null };
const unverified = (): LatchState => ({ hostPeerId: null, hostVerifiedPeerId: null });
const verifiedHost = (): LatchState => ({ hostPeerId: null, hostVerifiedPeerId: HOST });

const lobbyPresence = (seat0PeerId: string): NetMessage =>
  ({
    kind: 'LOBBY_PRESENCE',
    roster: [
      { seat: 0, peerId: seat0PeerId, color: 0xffd24a },
      { seat: 1, peerId: 'peer-me', color: 0x00e5ff },
    ],
  }) as unknown as NetMessage;

const startGame = (seat0PeerId: string): NetMessage =>
  ({
    kind: 'START_GAME_SIGNAL',
    mode: '1v1',
    roster: [
      { seat: 0, peerId: seat0PeerId, color: 0xffd24a },
      { seat: 1, peerId: 'peer-me', color: 0x00e5ff },
    ],
  }) as unknown as NetMessage;

const ofKind = (kind: string): NetMessage => ({ kind }) as unknown as NetMessage;

describe('S82 P4(a) — hostAuthFilter crypto-preconditioned latch', () => {
  it('latches from a seat-0-self-naming roster ONLY when the sender is crypto-verified', () => {
    const s = verifiedHost();
    expect(hostAuthFilter(s, lobbyPresence(HOST), HOST)).toBe(true);
    expect(s.hostPeerId).toBe(HOST);
    // Host messages keep flowing; the same kinds from another peer drop.
    expect(hostAuthFilter(s, ofKind('NETSNAPSHOT'), HOST)).toBe(true);
    expect(hostAuthFilter(s, ofKind('NETSNAPSHOT'), EVIL)).toBe(false); // spoofed-seq wedge
    expect(hostAuthFilter(s, ofKind('ENDGAME'), EVIL)).toBe(false); // fake win
    expect(hostAuthFilter(s, startGame(EVIL), EVIL)).toBe(false); // seat hijack
    expect(hostAuthFilter(s, ofKind('GODLY_TRIGGER'), EVIL)).toBe(false);
    expect(hostAuthFilter(s, lobbyPresence(EVIL), EVIL)).toBe(false);
  });

  it('THE S79 RACE IS DEAD: an unverified peer racing the first message cannot latch', () => {
    const s = unverified();
    // EVIL wins the race with a perfectly-formed seat-0-self-naming beacon → still dropped.
    expect(hostAuthFilter(s, lobbyPresence(EVIL), EVIL)).toBe(false);
    expect(s.hostPeerId).toBeNull();
    // And the old weak fallback is gone: a first NETSNAPSHOT no longer latches anyone.
    expect(hostAuthFilter(s, ofKind('NETSNAPSHOT'), EVIL)).toBe(false);
    expect(s.hostPeerId).toBeNull();
  });

  it('does NOT latch from a roster whose seat-0 names someone other than the sender', () => {
    const s = verifiedHost();
    // Even a VERIFIED host relaying a roster naming EVIL at seat 0 must not latch EVIL —
    // and EVIL forwarding a roster naming HOST is sender-inconsistent + unverified.
    expect(hostAuthFilter(s, lobbyPresence(HOST), EVIL)).toBe(false);
    expect(s.hostPeerId).toBeNull();
    expect(hostAuthFilter(s, lobbyPresence(HOST), HOST)).toBe(true);
    expect(s.hostPeerId).toBe(HOST);
  });

  it('a verified host still cannot latch via NETSNAPSHOT (roster-bearing kinds only)', () => {
    const s = verifiedHost();
    expect(hostAuthFilter(s, ofKind('NETSNAPSHOT'), HOST)).toBe(false); // pre-latch drop
    expect(s.hostPeerId).toBeNull();
    expect(hostAuthFilter(s, startGame(HOST), HOST)).toBe(true); // roster latches
    expect(hostAuthFilter(s, ofKind('NETSNAPSHOT'), HOST)).toBe(true); // then flows
  });

  it('fail-closed: host-authored kinds drop while un-latched', () => {
    const s = unverified();
    expect(hostAuthFilter(s, ofKind('ENDGAME'), EVIL)).toBe(false);
    expect(hostAuthFilter(s, ofKind('GODLY_TRIGGER'), EVIL)).toBe(false);
    expect(s.hostPeerId).toBeNull();
  });

  it('non-host-authored kinds (INTENT / HELLO) pass through regardless of latch state', () => {
    const s = unverified();
    expect(hostAuthFilter(s, ofKind('INTENT'), EVIL)).toBe(true);
    expect(hostAuthFilter(s, ofKind('HELLO'), EVIL)).toBe(true);
    s.hostPeerId = HOST;
    expect(hostAuthFilter(s, ofKind('INTENT'), EVIL)).toBe(true);
    expect(hostAuthFilter(s, ofKind('HELLO'), EVIL)).toBe(true);
  });

  it('idempotent once latched — even a verified seat-0-consistent roster cannot re-latch', () => {
    const s: LatchState = { hostPeerId: HOST, hostVerifiedPeerId: HOST };
    expect(hostAuthFilter(s, lobbyPresence(EVIL), EVIL)).toBe(false);
    expect(s.hostPeerId).toBe(HOST);
  });
});
