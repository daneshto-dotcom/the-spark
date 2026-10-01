/**
 * S192 T1 — the pool-safe RTCPeerConnection: the rollback predicate's truth table, and the REAL
 * Trystero restart sequence replayed over a fake base.
 *
 * ⭐ The second half does not re-type Trystero's restart code. It imports the INSTALLED
 * `@trystero-p2p/core/dist/peer.mjs` and drives its own `getOffer(true)` — the exact path
 * `strategy.mjs:99` takes for a pooled offer older than `offerTtl` — with the fake as `rtcPolyfill`.
 * So if an upgrade changes the restart, this test exercises the new code, and
 * `trysteroPolyfill.test.ts` turns red on the version pin and forces a re-read.
 *
 * ⚠ THE FAKE MODELS THE BROWSER BEHAVIOUR, IT DOES NOT PROVE IT. "Rolling back a connection's first,
 * never-answered offer drops its data-channel section" is Chrome's behaviour, measured S192 (105-byte
 * restart SDP vs 586). The fake encodes that rule; `e2e/poolSafePc.spec.ts` pins it against a real
 * browser. The raw-base case below is the positive control that the fake reproduces the defect.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isUnansweredOfferRollback, makePoolSafePeerConnection } from './poolSafePeerConnection.ts';

describe('isUnansweredOfferRollback — the truth table', () => {
  const R = { type: 'rollback' } as const;
  it('rollback + local offer + no remote ⇒ SKIP (the Trystero pooled-offer restart)', () => {
    expect(isUnansweredOfferRollback(R, { localType: 'offer', hasRemote: false })).toBe(true);
  });
  it('rollback with a remote description ⇒ pass through (an answered / glare rollback)', () => {
    expect(isUnansweredOfferRollback(R, { localType: 'offer', hasRemote: true })).toBe(false);
  });
  it('rollback with no local offer ⇒ pass through', () => {
    expect(isUnansweredOfferRollback(R, { localType: null, hasRemote: false })).toBe(false);
    expect(isUnansweredOfferRollback(R, { localType: undefined, hasRemote: false })).toBe(false);
    expect(isUnansweredOfferRollback(R, { localType: 'answer', hasRemote: false })).toBe(false);
    expect(isUnansweredOfferRollback(R, { localType: 'pranswer', hasRemote: true })).toBe(false);
  });
  it('any non-rollback description, or undefined (implicit), ⇒ pass through', () => {
    for (const hasRemote of [false, true]) {
      for (const localType of ['offer', 'answer', null, undefined] as const) {
        expect(isUnansweredOfferRollback(undefined, { localType, hasRemote })).toBe(false);
        expect(isUnansweredOfferRollback(null, { localType, hasRemote })).toBe(false);
        expect(isUnansweredOfferRollback({}, { localType, hasRemote })).toBe(false);
        for (const type of ['offer', 'answer', 'pranswer'] as const) {
          expect(isUnansweredOfferRollback({ type, sdp: 'x' }, { localType, hasRemote })).toBe(false);
        }
      }
    }
  });
});

/**
 * A recording fake of the parts of RTCPeerConnection `peer.mjs` touches. Its one piece of modelled
 * browser behaviour: rolling back the FIRST offer (no remote description yet) discards the
 * data-channel m-section, so every later offer is empty.
 */
class FakePC {
  static instances: FakePC[] = [];
  readonly seen: string[] = [];
  signalingState: RTCSignalingState = 'stable';
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  localDescription: { type: RTCSdpType; sdp: string } | null = null;
  remoteDescription: { type: RTCSdpType; sdp: string } | null = null;
  onnegotiationneeded: ((e: Event) => unknown) | null = null;
  onicecandidate: unknown = null;
  onconnectionstatechange: unknown = null;
  ondatachannel: unknown = null;
  ontrack: unknown = null;
  onremovestream: unknown = null;
  private sctp = false;
  private ufragN = 0;
  constructor(_config?: unknown) {
    FakePC.instances.push(this);
  }
  createDataChannel(): { readyState: string } {
    this.sctp = true;
    return { readyState: 'connecting' };
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  getSenders(): unknown[] {
    return [];
  }
  addIceCandidate(): Promise<void> {
    return Promise.resolve();
  }
  restartIce(): void {
    this.seen.push('restartIce');
  }
  close(): void {
    this.connectionState = 'closed';
    this.signalingState = 'closed';
  }
  private sdp(): string {
    const ufrag = `u${++this.ufragN}`;
    return this.sctp
      ? `v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=ice-ufrag:${ufrag}\r\n`
      : 'v=0\r\n';
  }
  createOffer(opts?: RTCOfferOptions): Promise<{ type: RTCSdpType; sdp: string }> {
    this.seen.push(opts?.iceRestart === true ? 'createOffer(iceRestart)' : 'createOffer');
    return Promise.resolve({ type: 'offer', sdp: this.sdp() });
  }
  setRemoteDescription(d: { type: RTCSdpType; sdp: string }): Promise<void> {
    this.seen.push(`setRemote(${d.type})`);
    this.remoteDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
    return Promise.resolve();
  }
  setLocalDescription(d?: { type: RTCSdpType; sdp?: string }): Promise<void> {
    this.seen.push(`setLocal(${d?.type ?? 'implicit'})`);
    if (d?.type === 'rollback') {
      // ⚠ The modelled Chrome behaviour: the first offer's SCTP section goes with the rollback.
      if (this.remoteDescription === null) this.sctp = false;
      this.localDescription = null;
      this.signalingState = 'stable';
      return Promise.resolve();
    }
    const type: RTCSdpType = d?.type ?? (this.signalingState === 'have-remote-offer' ? 'answer' : 'offer');
    this.localDescription = { type, sdp: d?.sdp ?? this.sdp() };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
    return Promise.resolve();
  }
}
const FAKE = FakePC as unknown as typeof RTCPeerConnection;

type TrysteroPeer = {
  getOffer(restartIce?: boolean): Promise<{ type: string; sdp: string } | undefined>;
  connection: FakePC;
};
type PeerFactory = (initiator: boolean, config: Record<string, unknown>) => TrysteroPeer;

async function loadTrysteroPeer(): Promise<PeerFactory> {
  // The package's `exports` map hides `dist/peer.mjs`, so import it by file URL.
  const url = pathToFileURL(join(process.cwd(), 'node_modules/@trystero-p2p/core/dist/peer.mjs')).href;
  const mod = (await import(/* @vite-ignore */ url)) as { default: PeerFactory };
  return mod.default;
}

/** One pooled offer, then Trystero's own stale-offer restart (`strategy.mjs:99` → `getOffer(true)`). */
async function pooledThenRestart(rtcPolyfill: typeof RTCPeerConnection) {
  const makePeer = await loadTrysteroPeer();
  const peer = makePeer(true, { trickleIce: true, rtcPolyfill });
  const first = await peer.getOffer(false); // the pooled, never-answered offer
  const restarted = await peer.getOffer(true); // what a > offerTtl-old pooled offer goes through
  return { first, restarted, pc: peer.connection };
}

describe('makePoolSafePeerConnection — Trystero 0.25 restart replayed over a fake base', () => {
  it('returns undefined when there is no RTCPeerConnection (node/SSR) — Trystero then uses its own global', () => {
    expect(makePoolSafePeerConnection(undefined)).toBeUndefined();
  });

  it('POSITIVE CONTROL — the raw base loses the data channel on the restart (the defect)', async () => {
    const { first, restarted, pc } = await pooledThenRestart(FAKE);
    expect(first?.sdp).toContain('m=application');
    expect(pc.seen).toContain('setLocal(rollback)');
    expect(restarted?.type).toBe('offer');
    expect(restarted?.sdp).not.toContain('m=application');
  });

  it('⭐ the pool-safe class: the base never sees the rollback and the restarted offer keeps m=application', async () => {
    const Safe = makePoolSafePeerConnection(FAKE)!;
    const { first, restarted, pc } = await pooledThenRestart(Safe);
    expect(pc).toBeInstanceOf(FakePC);
    expect(pc.seen).not.toContain('setLocal(rollback)');
    // The rest of the restart still runs, in order: restartIce → createOffer(iceRestart) → setLocal(offer).
    const tail = pc.seen.slice(pc.seen.indexOf('restartIce'));
    expect(tail).toEqual(['restartIce', 'createOffer(iceRestart)', 'setLocal(offer)']);
    expect(restarted?.sdp).toContain('m=application');
    const ufrag = (s: string | undefined) => /a=ice-ufrag:(\S+)/.exec(s ?? '')?.[1];
    expect(ufrag(restarted?.sdp)).toBeDefined();
    expect(ufrag(restarted?.sdp)).not.toBe(ufrag(first?.sdp));
  });

  it('an ANSWERED connection\'s rollback passes straight through to the base', async () => {
    const Safe = makePoolSafePeerConnection(FAKE)!;
    const pc = new Safe() as unknown as FakePC;
    pc.createDataChannel();
    await pc.setLocalDescription();
    await pc.setRemoteDescription({ type: 'answer', sdp: 'v=0\r\n' });
    await pc.setLocalDescription({ type: 'rollback' });
    expect(pc.seen).toContain('setLocal(rollback)');
  });

  it('a rollback with no local offer, and every non-rollback call, pass through', async () => {
    const Safe = makePoolSafePeerConnection(FAKE)!;
    const pc = new Safe() as unknown as FakePC;
    await pc.setLocalDescription({ type: 'rollback' });
    await pc.setLocalDescription();
    await pc.setLocalDescription({ type: 'offer', sdp: 'v=0\r\n' });
    expect(pc.seen).toEqual(['setLocal(rollback)', 'setLocal(implicit)', 'setLocal(offer)']);
  });
});
