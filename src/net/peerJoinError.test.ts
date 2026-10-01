/**
 * S192 T1 — Trystero's `onJoinError` is a PER-PEER report and must not mark a STRATEGY failed.
 *
 * The old handler set `handle.state = 'failed'` on the first per-peer error, permanently, so one dead
 * pair on nostr plus one dead pair on torrent (even with two DIFFERENT, non-host peers) tripped
 * `allStrategiesFailed()` and latched the sticky red lobby error while the host link was fine.
 * See `NetTransport.onPeerJoinError`.
 */
import { describe, expect, it } from 'vitest';
import { NetTransport } from './transport.ts';
import { formatStrategySummary } from './strategySummary.ts';

type Priv = {
  connected: boolean;
  peerSet: Set<string>;
  strategies: Map<string, Record<string, unknown>>;
  onPeerJoinError(handle: Record<string, unknown>, d: { error: string; peerId: string }): void;
};

const SDP_FAIL = 'could not connect to peer X after exchanging SDP; check that your TURN server URLs';

function rig(): { t: NetTransport; priv: Priv; errors: string[] } {
  const t = new NetTransport();
  const errors: string[] = [];
  t.onError = (m) => errors.push(m);
  const priv = t as unknown as Priv;
  priv.connected = true;
  priv.peerSet = new Set(['host']);
  const handle = (name: string) => ({
    name, room: null, action: null, state: 'ready', peers: new Set(['host']), relayUrls: [], getSockets: null,
    lastError: null, icePollTimer: null, icePollStartMs: 0,
  });
  priv.strategies = new Map([['nostr', handle('nostr')], ['torrent', handle('torrent')]]);
  return { t, priv, errors };
}
const fail = (priv: Priv, strat: string, peerId: string) =>
  priv.onPeerJoinError(priv.strategies.get(strat)!, { error: SDP_FAIL, peerId });

describe('S192 T1 — a per-peer join error is not a strategy failure', () => {
  it('one dead pair per strategy, with DIFFERENT peers ⇒ no red error, and both strategies stay ready', () => {
    const { t, priv, errors } = rig();
    fail(priv, 'nostr', 'peerA');
    fail(priv, 'torrent', 'peerB');
    expect(errors).toEqual([]);
    const diag = t.getDiagnostics().strategies.filter((s) => s.state !== 'disabled');
    expect(diag.map((s) => s.state)).toEqual(['ready', 'ready']);
    expect(diag.map((s) => s.peerJoinFailures)).toEqual([1, 1]);
    // The strip still says something went wrong per-peer, without claiming the strategy is dead.
    expect(formatStrategySummary(diag)).toBe('nostr:✓✗1 torrent:✓✗1');
  });

  it('the SAME peer dead on every live strategy, and not connected ⇒ the red error, once per report', () => {
    const { priv, errors } = rig();
    fail(priv, 'nostr', 'peerA');
    expect(errors).toEqual([]);
    fail(priv, 'torrent', 'peerA');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^\[torrent\] /);
  });

  it('a peer that failed everywhere but IS connected (a later pair succeeded) ⇒ quiet', () => {
    const { priv, errors } = rig();
    priv.peerSet.add('peerA');
    fail(priv, 'nostr', 'peerA');
    fail(priv, 'torrent', 'peerA');
    expect(errors).toEqual([]);
  });

  it('a strategy that truly failed (join threw) does not count as one the peer could still use', () => {
    const { priv, errors } = rig();
    priv.strategies.get('torrent')!.state = 'failed';
    fail(priv, 'nostr', 'peerA');
    expect(errors).toHaveLength(1);
  });

  it('a strategy not yet started may still reach the peer ⇒ quiet until it reports', () => {
    const { priv, errors } = rig();
    priv.strategies.delete('torrent');
    fail(priv, 'nostr', 'peerA');
    expect(errors).toEqual([]);
  });
});
