/**
 * S158 P1 — the connection self-test.
 *
 * The pure half (`summarizeIce`) carries every judgement, so it carries every test. The impure half
 * is driven through an injected fake `RTCPeerConnection` — no WebRTC stack, no network, and the
 * counting/teardown behaviour is still pinned.
 *
 * ⚠ THE CONTROL each block ends with: a test that only asserts "some string came back" would pass
 * against a stub that always returns the same verdict. Every case below pins WHICH verdict, and the
 * final test proves the five verdicts are mutually distinct.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ICE_VERDICT,
  type IceProbeResult,
  type PeerConnectionFactory,
  probeIce,
  summarizeIce,
} from './iceProbe.ts';

function result(over: Partial<IceProbeResult> = {}): IceProbeResult {
  return { host: 1, srflx: 1, relay: 0, errors: [], turnConfigured: false, complete: true, ...over };
}

describe('summarizeIce — the verdict a human can act on', () => {
  it('⭐ a relay answered ⇒ the only OK verdict', () => {
    const v = summarizeIce(result({ relay: 2 }));
    expect(v.ok).toBe(true);
    expect(v.headline).toBe(ICE_VERDICT.RELAY_OK);
    expect(v.detail).toContain('2 relay routes');
  });

  it('singular/plural is right for exactly one relay (the off-by-one a template literal invites)', () => {
    expect(summarizeIce(result({ relay: 1 })).detail).toContain('1 relay route (');
  });

  /**
   * ⭐ THE S157 CASE, REPRODUCED EXACTLY. `host:1 srflx:1 relay:0` with no TURN configured is the
   * literal measurement that explained why the owner could not reach his brother.
   */
  it('⭐ host:1 srflx:1 relay:0 with no TURN configured ⇒ the known blocker, named', () => {
    const v = summarizeIce(result({ host: 1, srflx: 1, relay: 0, turnConfigured: false }));
    expect(v.ok).toBe(false);
    expect(v.headline).toBe(ICE_VERDICT.NO_TURN_CONFIGURED);
    expect(v.detail).toContain('TURN_SETUP.md');
  });

  it('⭐ a relay IS configured but produced nothing ⇒ a DIFFERENT verdict, because it is a different fix', () => {
    const v = summarizeIce(result({ turnConfigured: true }));
    expect(v.headline).toBe(ICE_VERDICT.TURN_REJECTED);
    // The two no-relay verdicts must never collapse into one another: one says "buy an account",
    // the other says "your account is misconfigured".
    expect(v.headline).not.toBe(ICE_VERDICT.NO_TURN_CONFIGURED);
  });

  it('a configured relay quotes the server error verbatim when there is one', () => {
    const v = summarizeIce(result({ turnConfigured: true, errors: ['401 Unauthorized'] }));
    expect(v.detail).toContain('401 Unauthorized');
  });

  it('a configured relay with no error text still reads as a sentence (no dangling "said:")', () => {
    expect(summarizeIce(result({ turnConfigured: true })).detail).not.toContain('said:');
  });

  it('STUN itself failed ⇒ blocked UDP, which no relay account can rescue', () => {
    const v = summarizeIce(result({ host: 2, srflx: 0, relay: 0 }));
    expect(v.headline).toBe(ICE_VERDICT.NO_STUN);
  });

  it('⛔ nothing at all gathered ⇒ answered FIRST, before the relay question that would be noise', () => {
    const v = summarizeIce(result({ host: 0, srflx: 0, relay: 0, turnConfigured: true }));
    // turnConfigured is true here on purpose: worst-first ordering must beat the TURN branch.
    expect(v.headline).toBe(ICE_VERDICT.NO_ROUTES);
  });

  it('CONTROL — the five verdicts are five distinct strings (a stub returning one would fail here)', () => {
    const seen = new Set([
      summarizeIce(result({ relay: 1 })).headline,
      summarizeIce(result()).headline,
      summarizeIce(result({ turnConfigured: true })).headline,
      summarizeIce(result({ srflx: 0 })).headline,
      summarizeIce(result({ host: 0, srflx: 0 })).headline,
    ]);
    expect(seen.size).toBe(5);
  });

  it('CONTROL — ok is true for exactly the relay case and no other', () => {
    expect(summarizeIce(result({ relay: 1 })).ok).toBe(true);
    for (const r of [result(), result({ turnConfigured: true }), result({ srflx: 0 }), result({ host: 0, srflx: 0 })]) {
      expect(summarizeIce(r).ok).toBe(false);
    }
  });
});

// ── the impure half, driven through a fake peer connection ───────────────────────────────────────

interface FakePc {
  onicecandidate: ((ev: { candidate: RTCIceCandidate | null }) => void) | null;
  onicecandidateerror: ((ev: unknown) => void) | null;
  createDataChannel: (label: string) => void;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (d: RTCSessionDescriptionInit) => Promise<void>;
  close: () => void;
  closed: boolean;
}

function fakeFactory(
  drive: (pc: FakePc) => void,
): { factory: PeerConnectionFactory; pcs: FakePc[] } {
  const pcs: FakePc[] = [];
  const factory = ((): RTCPeerConnection => {
    const pc: FakePc = {
      onicecandidate: null,
      onicecandidateerror: null,
      createDataChannel: () => {},
      createOffer: () => Promise.resolve({ type: 'offer', sdp: '' }),
      setLocalDescription: () => {
        // Candidates arrive after the local description is set, which is when a real browser starts
        // gathering — driving them here rather than synchronously keeps the ordering honest.
        queueMicrotask(() => drive(pc));
        return Promise.resolve();
      },
      close: () => {
        pc.closed = true;
      },
      closed: false,
    };
    pcs.push(pc);
    return pc as unknown as RTCPeerConnection;
  }) as PeerConnectionFactory;
  return { factory, pcs };
}

function candidate(type: string): { candidate: RTCIceCandidate } {
  return { candidate: { type, candidate: `candidate:1 1 udp 1 1.2.3.4 1 typ ${type}` } as RTCIceCandidate };
}

describe('probeIce — counting, without a WebRTC stack', () => {
  it('counts host / srflx / relay by candidate type and finishes on end-of-candidates', async () => {
    const { factory } = fakeFactory((pc) => {
      pc.onicecandidate?.(candidate('host'));
      pc.onicecandidate?.(candidate('srflx'));
      pc.onicecandidate?.(candidate('relay'));
      pc.onicecandidate?.(candidate('relay'));
      pc.onicecandidate?.({ candidate: null });
    });
    const r = await probeIce([], true, factory);
    expect({ host: r.host, srflx: r.srflx, relay: r.relay }).toEqual({ host: 1, srflx: 1, relay: 2 });
    expect(r.complete).toBe(true);
    expect(r.turnConfigured).toBe(true);
  });

  it('falls back to parsing "typ X" out of the raw string when .type is absent', async () => {
    const { factory } = fakeFactory((pc) => {
      pc.onicecandidate?.({
        candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 1 typ relay' } as RTCIceCandidate,
      });
      pc.onicecandidate?.({ candidate: null });
    });
    expect((await probeIce([], false, factory)).relay).toBe(1);
  });

  it('⭐ captures an allocate error verbatim, and DROPS 701 (which fires on healthy machines)', async () => {
    const { factory } = fakeFactory((pc) => {
      pc.onicecandidateerror?.({ errorCode: 400, errorText: 'TURN allocate error' });
      pc.onicecandidateerror?.({ errorCode: 701, errorText: 'Failed to establish connection' });
      pc.onicecandidate?.({ candidate: null });
    });
    const r = await probeIce([], true, factory);
    expect(r.errors).toEqual(['400 TURN allocate error']);
  });

  it('dedupes repeated errors — one bad server per url, not one line per retry', async () => {
    const { factory } = fakeFactory((pc) => {
      pc.onicecandidateerror?.({ errorCode: 401, errorText: 'Unauthorized' });
      pc.onicecandidateerror?.({ errorCode: 401, errorText: 'Unauthorized' });
      pc.onicecandidate?.({ candidate: null });
    });
    expect((await probeIce([], true, factory)).errors).toHaveLength(1);
  });

  it('⛔ ALWAYS closes the peer connection — the button can be pressed repeatedly', async () => {
    const { factory, pcs } = fakeFactory((pc) => pc.onicecandidate?.({ candidate: null }));
    await probeIce([], false, factory);
    expect(pcs[0].closed).toBe(true);
  });

  it('times out with PARTIAL counts rather than failing, and records complete:false', async () => {
    vi.useFakeTimers();
    try {
      const { factory } = fakeFactory((pc) => {
        pc.onicecandidate?.(candidate('host')); // …and then silence. No end-of-candidates.
      });
      const p = probeIce([], false, factory, 50);
      await vi.advanceTimersByTimeAsync(60);
      const r = await p;
      expect(r.host).toBe(1);
      expect(r.complete).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a createOffer rejection resolves instead of hanging the button forever', async () => {
    const pcs: FakePc[] = [];
    const factory = ((): RTCPeerConnection => {
      const pc: FakePc = {
        onicecandidate: null,
        onicecandidateerror: null,
        createDataChannel: () => {},
        createOffer: () => Promise.reject(new Error('no')),
        setLocalDescription: () => Promise.resolve(),
        close: () => {
          pc.closed = true;
        },
        closed: false,
      };
      pcs.push(pc);
      return pc as unknown as RTCPeerConnection;
    }) as PeerConnectionFactory;
    const r = await probeIce([], false, factory);
    expect(r.complete).toBe(false);
    expect(pcs[0].closed).toBe(true); // and it still tore down
  });
});
