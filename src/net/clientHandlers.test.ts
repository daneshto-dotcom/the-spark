/**
 * SPARK — S79 P4 (HIGH-2) client host sender-auth tests.
 *
 * hostAuthFilter is the pure gate in front of the joiner's message handler (the
 * #test-via-pure-helper-export pattern). Contract under test:
 *   1. the latch — host learned from a roster-bearing message whose seat-0 entry NAMES
 *      THE SENDER (genuine host self-identifies at seat 0), or first-NETSNAPSHOT fallback;
 *   2. the gate — the five host-authored kinds drop unless sent by the latched host
 *      (fail-closed pre-latch), while INTENT/HELLO flow regardless;
 *   3. the spoof cases the S78 audit called out: spoofed-snapshotSeq wedge, fake ENDGAME,
 *      START_GAME_SIGNAL seat hijack, roster that claims someone ELSE is host.
 */

import { describe, expect, it } from 'vitest';
import type { NetMessage } from './protocol.ts';
import { hostAuthFilter } from './clientHandlers.ts';

const HOST = 'peer-host';
const EVIL = 'peer-evil';

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

describe('S79 P4 — hostAuthFilter latch', () => {
  it('latches from a LOBBY_PRESENCE whose seat-0 entry names the sender, then gates on it', () => {
    const s = { hostPeerId: null as string | null };
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

  it('does NOT latch from a roster whose seat-0 names someone other than the sender', () => {
    const s = { hostPeerId: null as string | null };
    // EVIL forwards a roster naming HOST at seat 0 — sender-inconsistent → no latch, dropped.
    expect(hostAuthFilter(s, lobbyPresence(HOST), EVIL)).toBe(false);
    expect(s.hostPeerId).toBeNull();
    // The genuine host still latches normally afterwards.
    expect(hostAuthFilter(s, lobbyPresence(HOST), HOST)).toBe(true);
    expect(s.hostPeerId).toBe(HOST);
  });

  it('falls back to latching the first NETSNAPSHOT sender (no lobby beacon seen)', () => {
    const s = { hostPeerId: null as string | null };
    expect(hostAuthFilter(s, ofKind('NETSNAPSHOT'), HOST)).toBe(true);
    expect(s.hostPeerId).toBe(HOST);
    expect(hostAuthFilter(s, ofKind('NETSNAPSHOT'), EVIL)).toBe(false);
  });

  it('fail-closed: host-authored kinds drop while un-latched (no roster, no snapshot yet)', () => {
    const s = { hostPeerId: null as string | null };
    expect(hostAuthFilter(s, ofKind('ENDGAME'), EVIL)).toBe(false);
    expect(hostAuthFilter(s, ofKind('GODLY_TRIGGER'), EVIL)).toBe(false);
    expect(s.hostPeerId).toBeNull();
  });

  it('non-host-authored kinds (INTENT / HELLO) pass through regardless of latch state', () => {
    const s = { hostPeerId: null as string | null };
    expect(hostAuthFilter(s, ofKind('INTENT'), EVIL)).toBe(true);
    expect(hostAuthFilter(s, ofKind('HELLO'), EVIL)).toBe(true);
    s.hostPeerId = HOST;
    expect(hostAuthFilter(s, ofKind('INTENT'), EVIL)).toBe(true);
    expect(hostAuthFilter(s, ofKind('HELLO'), EVIL)).toBe(true);
  });

  it('idempotent once latched — a later seat-0-consistent roster from another peer cannot re-latch', () => {
    const s = { hostPeerId: HOST as string | null };
    expect(hostAuthFilter(s, lobbyPresence(EVIL), EVIL)).toBe(false);
    expect(s.hostPeerId).toBe(HOST);
  });
});
