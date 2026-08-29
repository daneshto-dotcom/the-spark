/**
 * SPARK — S155 P1: the join-stall reducer.
 *
 * ⛔ WHY THIS FILE IS THE POINT, not a formality. The A.0 probe for S155 found that EVERY
 * real-WebRTC multiplayer test in this repo is tagged `@quarantine-flaky` and that `e2e:gating`
 * grep-INVERTS that tag — so the netcode, which is what this game IS, had ZERO blocking coverage for
 * roughly a hundred sessions. That is why a lobby that could never start reached the owner's living
 * room instead of a CI email. Both external Council seats independently ranked that test debt in
 * their top three findings.
 *
 * The structural answer is the `lobbyStateMachine.ts` pattern applied again: put the *interpretation*
 * in a pure function so it can be exhaustively tested with no WebRTC, no Pixi, no timers, and no
 * flake — then the untestable part is only the transport, not the logic. Every branch below is a
 * state the owner could actually have been sitting in.
 */

import { describe, expect, it } from 'vitest';
import {
  JOIN_STALL,
  JOIN_STALL_WARN_MS,
  joinStallMessage,
  makeJoinTrustState,
  noteAttestResult,
  type JoinTrustState,
  JOIN_NO_PEER_WARN_MS,
} from './joinDiagnosis.ts';
import type { AttestDiagnosis } from './hostIdentity.ts';

const T0 = 1_000;
/** Just past the patience window — the earliest instant a stall may be reported. */
const STALLED_AT = T0 + JOIN_STALL_WARN_MS + 1;

function connected(overrides: Partial<JoinTrustState> = {}): JoinTrustState {
  return { ...makeJoinTrustState(), firstPeerAtMs: T0, ...overrides };
}

const fail = (reason: AttestDiagnosis['reason']): AttestDiagnosis => ({
  ok: false,
  reason,
  derivedCode: 'AAAAAA',
  expectedCode: 'BBBBBB',
  senderPeerId: 'peer-host',
});

describe('S155 P1 — joinStallMessage stays SILENT whenever silence is correct', () => {
  it('a verified host is never a stall, however long it took', () => {
    const s = connected({ attestFailures: 3, beginBuffered: true });
    expect(joinStallMessage(s, STALLED_AT + 10 * JOIN_STALL_WARN_MS, true)).toBeNull();
  });

  /*
   * ⛔ S157 N1 — THIS TEST PINNED A RULE THAT WAS HIDING THE OWNER'S ACTUAL BUG.
   *
   * It asserted that `firstPeerAtMs === null` is NEVER a stall, justified as *"a host waiting alone
   * for a friend to type the code must never be told something is wrong"*. That rationale is real
   * but it belongs to a DIFFERENT guard: the per-frame check in main.ts is gated on `!world.isHost`,
   * so a waiting host never reaches this function at all. Inside the function, "no peer" is the
   * JOINER's state — and a joiner sitting with no peer forever is precisely the failure the owner
   * has now hit twice from two countries (*"stuck at connecting and never connects"*).
   *
   * So the silence is now bounded by `JOIN_NO_PEER_WARN_MS` instead of being unconditional: quiet
   * while a cross-country negotiation is legitimately in progress, and honest once it plainly is not.
   */
  it('a joiner with no peer stays quiet INSIDE the no-peer window', () => {
    const s = makeJoinTrustState(T0);
    expect(s.firstPeerAtMs).toBeNull();
    expect(joinStallMessage(s, T0 + JOIN_NO_PEER_WARN_MS - 1, false)).toBeNull();
  });

  it('inside the patience window it stays quiet even with a failure already recorded', () => {
    // A single failed attest is the S82 transient case ("a spoofer's failed attest must not scare
    // the user while the genuine host verifies fine"). That reasoning is preserved exactly.
    const s = connected({ attestFailures: 1 });
    expect(joinStallMessage(s, T0 + JOIN_STALL_WARN_MS - 1, false)).toBeNull();
  });

  it('fires at the boundary, not before it', () => {
    const s = connected({ attestFailures: 1 });
    expect(joinStallMessage(s, T0 + JOIN_STALL_WARN_MS - 1, false)).toBeNull();
    expect(joinStallMessage(s, T0 + JOIN_STALL_WARN_MS, false)).not.toBeNull();
  });
});

describe('S155 P1 — joinStallMessage names the layer that is actually stuck', () => {
  it('⭐ BEGIN_REJECTED outranks everything: the host DID start, and we threw it away', () => {
    // This is the owner's exact state and it deserves its own sentence. Saying only "cannot verify
    // host" would understate it — the host is not still deciding, the host has already gone.
    const s = connected({ beginBuffered: true, attestFailures: 2, lastReason: 'SIGNATURE_INVALID' });
    const msg = joinStallMessage(s, STALLED_AT, false);
    expect(msg).toContain(JOIN_STALL.BEGIN_REJECTED);
    expect(msg).toContain('identity signature did not check out');
    expect(msg).toContain(JOIN_STALL.ADVICE);
  });

  it('UNVERIFIED_HOST when an identity was offered and rejected but no Begin arrived', () => {
    const s = connected({ attestFailures: 1, attestsSeen: 1, lastReason: 'CODE_MISMATCH' });
    const msg = joinStallMessage(s, STALLED_AT, false);
    expect(msg).toContain(JOIN_STALL.UNVERIFIED_HOST);
    expect(msg).toContain('room code does not match');
  });

  it('NO_IDENTITY when a peer is connected but has never offered an attestation at all', () => {
    // Distinct cause, distinct sentence: nothing failed, nothing was ever presented. Collapsing this
    // into "cannot verify" would send someone hunting a crypto bug that is not there.
    const s = connected({ attestsSeen: 0, attestFailures: 0 });
    const msg = joinStallMessage(s, STALLED_AT, false);
    expect(msg).toContain(JOIN_STALL.NO_IDENTITY);
  });

  it('EVERY branch ends with the way out — a stall message without an exit is the bug again', () => {
    const branches: JoinTrustState[] = [
      connected({ beginBuffered: true }),
      connected({ attestFailures: 1 }),
      connected(),
    ];
    for (const s of branches) {
      const msg = joinStallMessage(s, STALLED_AT, false);
      expect(msg).not.toBeNull();
      expect(msg as string).toContain(JOIN_STALL.ADVICE);
      // Both exits that genuinely exist today are named, so the advice is actionable rather than
      // sympathetic. If either affordance is ever renamed, this fails loudly.
      expect(msg as string).toMatch(/Back/);
      expect(msg as string).toMatch(/VS BOTS/);
    }
  });

  it('never leaks crypto jargon at the player', () => {
    for (const reason of ['CODE_MISMATCH', 'SIGNATURE_INVALID', 'KEY_IMPORT_FAILED', 'MALFORMED'] as const) {
      const msg = joinStallMessage(connected({ attestFailures: 1, lastReason: reason }), STALLED_AT, false) as string;
      expect(msg).not.toMatch(/ECDSA|SPKI|base64|P-256|fingerprint/i);
      // ...and it is never the raw enum either.
      expect(msg).not.toContain(reason);
    }
  });
});

describe('S155 P1 — noteAttestResult records what the detector needs', () => {
  it('counts attempts and keeps the LATEST failure detail', () => {
    const s = connected();
    noteAttestResult(s, fail('CODE_MISMATCH'));
    noteAttestResult(s, fail('SIGNATURE_INVALID'));
    expect(s.attestsSeen).toBe(2);
    expect(s.attestFailures).toBe(2);
    expect(s.lastReason).toBe('SIGNATURE_INVALID');
    // The log-grade line carries the three values a human compares across two machines.
    expect(s.lastFailure).toContain('senderPeerId=peer-host');
    expect(s.lastFailure).toContain('derivedCode=AAAAAA');
    expect(s.lastFailure).toContain('expectedCode=BBBBBB');
  });

  it('a SUCCESS counts as an attempt but records no failure', () => {
    const s = connected();
    noteAttestResult(s, { ok: true, derivedCode: 'AAAAAA', expectedCode: 'AAAAAA', senderPeerId: 'p' });
    expect(s.attestsSeen).toBe(1);
    expect(s.attestFailures).toBe(0);
    expect(s.lastFailure).toBeNull();
    expect(s.lastReason).toBeNull();
  });
});

describe('S155 P1 — the one-shot report flag belongs to the ATTEMPT', () => {
  it('a fresh trust state has never reported, so a retry always gets a fresh verdict', () => {
    // The lifetime property that makes the "press Back to retry" advice honest: teardownNet drops
    // joinTrust, connectAsClient makes a new one, and the new one is silent until it earns a report.
    const stale = connected({ attestFailures: 1, stallReported: true });
    expect(joinStallMessage(stale, STALLED_AT, false)).not.toBeNull(); // the reducer is stateless...
    expect(makeJoinTrustState().stallReported).toBe(false); // ...and the FLAG is per-attempt.
  });
});

describe('S155 P1 — CANARY: the stall strings are pinned', () => {
  /**
   * Mirror of `lobbyStateMachine.test.ts`'s literal canary, and for the same reason: these strings
   * are the entire user-facing output of this priority. A silent reword would leave the player with a
   * message that no longer names an affordance that exists.
   */
  it('literals are byte-exact', () => {
    expect(JOIN_STALL.UNVERIFIED_HOST).toBe('Cannot verify this host');
    expect(JOIN_STALL.NO_IDENTITY).toBe('Connected, but this host has not identified itself');
    expect(JOIN_STALL.BEGIN_REJECTED).toBe('The host started the match, but we could not verify them');
    expect(JOIN_STALL.ADVICE).toBe('press Back to retry, or play VS BOTS.');
  });

  it('the patience window is 8s — between a ~ms verify and the 30s transport timeout', () => {
    expect(JOIN_STALL_WARN_MS).toBe(8_000);
  });
});

/**
 * ⭐ S157 N1 — the branch that answers the owner's report.
 *
 * Measured against the live site: an `RTCPeerConnection` built from the shipped `ICE_SERVERS`
 * gathered `relay: 0` — every TURN url returned `400 TURN allocate error` because the free
 * OpenRelay credentials were retired upstream. STUN-only cannot connect two peers that both sit
 * behind strict NAT, so no peer event ever fires and the lobby hangs on "Connecting..." with
 * nothing to say. These pin the saying-something.
 */
describe('S157 N1 — nobody ever arrived', () => {
  it('⭐ speaks up once the no-peer window has elapsed', () => {
    const s = makeJoinTrustState(T0);
    const msg = joinStallMessage(s, T0 + JOIN_NO_PEER_WARN_MS + 1, false, true);
    expect(msg).not.toBeNull();
    expect(msg).toContain(JOIN_STALL.NO_PEER);
  });

  it('⭐ NAMES THE RELAY as the cause when none is configured', () => {
    const s = makeJoinTrustState(T0);
    const msg = joinStallMessage(s, T0 + JOIN_NO_PEER_WARN_MS + 1, false, false);
    expect(msg).toContain(JOIN_STALL.NO_RELAY);
  });

  it('does NOT blame the relay when one is configured — then it is an honest generic failure', () => {
    const s = makeJoinTrustState(T0);
    const msg = joinStallMessage(s, T0 + JOIN_NO_PEER_WARN_MS + 1, false, true);
    expect(msg).not.toContain(JOIN_STALL.NO_RELAY);
  });

  it('a verified host still silences it, even with no peer ever recorded', () => {
    const s = makeJoinTrustState(T0);
    expect(joinStallMessage(s, T0 + 10 * JOIN_NO_PEER_WARN_MS, true, false)).toBeNull();
  });

  it('⛔ once a peer HAS appeared, the no-peer branch never fires again', () => {
    // Otherwise a slow-but-healthy join would be told the relay is missing, which is both wrong and
    // alarming. The attest branches own that state; this one must hand over cleanly.
    const s = makeJoinTrustState(T0);
    s.firstPeerAtMs = T0 + 1000;
    const msg = joinStallMessage(s, T0 + 10 * JOIN_NO_PEER_WARN_MS, false, false);
    expect(msg).not.toContain(JOIN_STALL.NO_RELAY);
    expect(msg).not.toContain(JOIN_STALL.NO_PEER);
  });
});
