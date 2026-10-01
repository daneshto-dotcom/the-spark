/**
 * S192 T1 — Trystero's `onJoinError` is a PER-PEER report and must not mark a STRATEGY failed.
 *
 * The old handler set `handle.state = 'failed'` on the first per-peer error, permanently, so one dead
 * pair on nostr plus one dead pair on torrent (even with two DIFFERENT, non-host peers) tripped
 * `allStrategiesFailed()` and latched the sticky red lobby error while the host link was fine.
 * See `NetTransport.onPeerJoinError`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NetTransport } from './transport.ts';
import { formatStrategySummary } from './strategySummary.ts';

type Priv = {
  connected: boolean;
  peerSet: Set<string>;
  strategies: Map<string, Record<string, unknown>>;
  onPeerJoinError(handle: Record<string, unknown>, d: { error: string; peerId: string }): void;
  markStrategyFailed(name: string, errMsg: string): void;
  clearPeerJoinFailures(peerId: string): void;
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

  /*
   * ⛔ S192 audit F1 — the quiet case above must not become "quiet forever". The host link fails on
   * nostr while torrent has not started (quiet, correctly); torrent then fails OUTRIGHT
   * (`markStrategyFailed`). The peer is now unreachable on every live strategy, and the old code did
   * report this — `markStrategyFailed` must re-ask the per-peer question, not only "all failed?".
   */
  it('F1: per-peer failure on nostr, THEN torrent fails outright ⇒ exactly one red error', () => {
    const { priv, errors } = rig();
    priv.strategies.delete('torrent');
    fail(priv, 'nostr', 'host-x');
    expect(errors).toEqual([]);
    priv.markStrategyFailed('torrent', 'chunk load failed: boom');
    expect(errors).toHaveLength(1);
  });

  /*
   * S192 audit L1 — a recorded per-peer failure must not outlive the peer actually connecting. Before,
   * `peerJoinFailures` only grew while a handle lived: an old nostr failure for a peer that later
   * connected (and later dropped) let ONE fresh torrent failure for it read as "unreachable
   * everywhere", and the strip's ✗N never came down.
   */
  it('L1: a peer that connects has its recorded failures cleared on every strategy', () => {
    const { t, priv, errors } = rig();
    fail(priv, 'nostr', 'peerA');
    priv.clearPeerJoinFailures('peerA'); // what onPeerJoin now does, on any strategy
    expect(t.getDiagnostics().strategies.find((s) => s.name === 'nostr')?.peerJoinFailures).toBe(0);
    // It later drops, and ONE fresh failure on torrent must not escalate on the stale nostr entry.
    fail(priv, 'torrent', 'peerA');
    expect(errors).toEqual([]);
  });

  it('L1: onPeerJoin calls the clear, on the transport-wide peer id', () => {
    const src = readFileSync(join(process.cwd(), 'src/net/transport.ts'), 'utf8').replace(/\r\n/g, '\n');
    const join0 = src.indexOf('room.onPeerJoin = (peerId) => {');
    const leave0 = src.indexOf('room.onPeerLeave = (peerId) => {', join0);
    expect(join0).toBeGreaterThan(-1);
    expect(src.slice(join0, leave0)).toContain('this.clearPeerJoinFailures(peerId);');
  });

  /*
   * ⛔ S192 re-audit L1-RACE — the clear alone is not enough. P connects on torrent (clear runs), then
   * the REDUNDANT nostr handshake for P times out late (HANDSHAKE_TIMEOUT_MS = 30 s) and used to be
   * recorded while P was connected. P later drops, and ONE fresh torrent failure read as "unreachable
   * everywhere" — a latched red error — while nostr's ✗ never came down. A failure for a peer that is
   * connected is not recorded at all.
   */
  it('L1-RACE: connect → late redundant failure → drop → one failure ⇒ no error, nostr ✗ 0', () => {
    const { t, priv, errors } = rig();
    priv.peerSet.add('P');
    (priv.strategies.get('torrent')!.peers as Set<string>).add('P');
    priv.clearPeerJoinFailures('P'); // onPeerJoin on torrent
    fail(priv, 'nostr', 'P'); // the late handshake timeout on the redundant strategy
    expect(errors).toEqual([]);
    priv.peerSet.delete('P'); // drop
    (priv.strategies.get('torrent')!.peers as Set<string>).delete('P');
    fail(priv, 'torrent', 'P');
    expect(errors).toEqual([]);
    expect(t.getDiagnostics().strategies.find((s) => s.name === 'nostr')?.peerJoinFailures).toBe(0);
  });

  it('F1: a strategy failing outright with NO recorded per-peer failure stays quiet (others live)', () => {
    const { priv, errors } = rig();
    priv.markStrategyFailed('torrent', 'chunk load failed: boom');
    expect(errors).toEqual([]);
  });
});
