/**
 * SPARK — S182 LEVER 1 tests: routing high-rate NETSNAPSHOT traffic over ONE strategy.
 *
 * ⛔ THE MOST IMPORTANT TEST IN THIS FILE IS THE ONE THAT ASSERTS THE FLAG IS **OFF**.
 *
 * Lever 1 trades connectivity redundancy the owner deliberately paid for in S157/S162, after he
 * could not play with his brother in Israel at all (`iceConfig.ts` records ICE gathering `relay: 0`
 * with every TURN URL erroring). A laggy peer is a bad outcome; NO multiplayer is a worse one. So
 * the decision is HIS, it is not yet made, and the default must not drift while it is pending —
 * including by a future session that reads the mechanism, finds it complete and tidy, and flips the
 * constant without noticing it is a gate rather than a leftover.
 *
 * The behavioural tests below exercise the routing through the pure helper, so the mechanism is
 * fully proven while the shipped default stays OFF.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pickSnapshotStrategy, type StrategyRouteInfo } from './transport.ts';
import { SNAPSHOT_SINGLE_STRATEGY, SNAPSHOT_STRATEGY_PREFERENCE } from './iceConfig.ts';

const ICECONFIG_SRC = readFileSync(new URL('./iceConfig.ts', import.meta.url), 'utf8');
const TRANSPORT_SRC = readFileSync(new URL('./transport.ts', import.meta.url), 'utf8');

function s(name: StrategyRouteInfo['name'], ready: boolean, peerCount: number): StrategyRouteInfo {
  return { name, ready, peerCount };
}

describe('⛔ S182 LEVER 1 — the owner gate', () => {
  it('SNAPSHOT_SINGLE_STRATEGY ships OFF — the owner has not ruled on this', () => {
    expect(SNAPSHOT_SINGLE_STRATEGY).toBe(false);
  });

  it('the constant carries the reasoning, so nobody flips it without meeting the argument', () => {
    const at = ICECONFIG_SRC.indexOf('export const SNAPSHOT_SINGLE_STRATEGY');
    expect(at).toBeGreaterThan(-1);
    const docblock = ICECONFIG_SRC.slice(Math.max(0, at - 3000), at);
    // The three facts a future session needs before touching it.
    expect(docblock).toContain('DEFAULT OFF');
    expect(docblock).toContain('S157/S162');
    expect(docblock).toMatch(/relay: 0|redundancy/);
  });

  it('OFF means every strategy still gets the snapshot — the pre-S182 path is untouched', () => {
    // With the flag off, send() never consults the router at all; this asserts the guard shape that
    // makes that true, because a behavioural test of "broadcast" cannot distinguish "flag off" from
    // "router happened to return null".
    expect(TRANSPORT_SRC).toContain("SNAPSHOT_SINGLE_STRATEGY && msg.kind === 'NETSNAPSHOT'");
  });
});

describe('S182 LEVER 1 — pickSnapshotStrategy', () => {
  it('prefers nostr when it is ready and carrying the peer', () => {
    expect(pickSnapshotStrategy([s('nostr', true, 1), s('torrent', true, 1)])).toBe('nostr');
  });

  it('honours the declared preference order regardless of argument order', () => {
    expect(pickSnapshotStrategy([s('torrent', true, 1), s('nostr', true, 1)])).toBe('nostr');
    expect(SNAPSHOT_STRATEGY_PREFERENCE[0]).toBe('nostr');
  });

  it('fails over to torrent when nostr has lost the peer', () => {
    expect(pickSnapshotStrategy([s('nostr', true, 0), s('torrent', true, 1)])).toBe('torrent');
  });

  it('fails over to torrent when nostr is not ready at all', () => {
    expect(pickSnapshotStrategy([s('nostr', false, 0), s('torrent', true, 1)])).toBe('torrent');
  });

  it('⭐ returns null — broadcast — when NO ready strategy has a peer', () => {
    // The conservative arm. With nobody visible there is nothing to route on, and falling back to
    // the pre-S182 broadcast is strictly safer. It also costs nothing: no peers means no traffic.
    expect(pickSnapshotStrategy([s('nostr', true, 0), s('torrent', true, 0)])).toBe(null);
    expect(pickSnapshotStrategy([s('nostr', false, 0), s('torrent', false, 0)])).toBe(null);
    expect(pickSnapshotStrategy([])).toBe(null);
  });

  it('a ready-but-peerless strategy is never chosen — readiness alone is not delivery', () => {
    // A strategy can join the room and bind an action while never completing a peer handshake.
    // Routing every snapshot into it would starve the joiner completely — strictly worse than the
    // doubling this lever exists to remove.
    expect(pickSnapshotStrategy([s('nostr', true, 0), s('torrent', true, 2)])).toBe('torrent');
  });

  it('ignores mqtt unless it is the only one carrying anyone (it is an opt-in lever)', () => {
    expect(pickSnapshotStrategy([s('nostr', true, 1), s('mqtt', true, 1)])).toBe('nostr');
    expect(pickSnapshotStrategy([s('nostr', true, 0), s('mqtt', true, 1)])).toBe('mqtt');
  });

  it('re-picks per call, so a strategy that drops its peer is abandoned on the next snapshot', () => {
    const healthy = [s('nostr', true, 1), s('torrent', true, 1)];
    expect(pickSnapshotStrategy(healthy)).toBe('nostr');
    const nostrDropped = [s('nostr', true, 0), s('torrent', true, 1)];
    expect(pickSnapshotStrategy(nostrDropped)).toBe('torrent');
  });
});

describe('S182 LEVER 1 — only NETSNAPSHOT is ever routed', () => {
  /**
   * The rare control traffic — HELLO, START_GAME_SIGNAL, LOBBY_*, INTENT, MIGRATION_CLAIM — is small,
   * infrequent, and is precisely what multi-strategy redundancy exists to protect. Narrowing the
   * routing to the one high-rate kind is the whole reason this lever is a −50% bandwidth win rather
   * than a −50% reliability loss, so the discrimination is pinned by text.
   */
  it('the send path gates routing on the NETSNAPSHOT kind specifically', () => {
    expect(TRANSPORT_SRC).toContain("msg.kind === 'NETSNAPSHOT'");
    // …and the per-handle skip is what actually narrows the fan-out.
    expect(TRANSPORT_SRC).toContain('if (only !== null && handle.name !== only) continue;');
  });

  it('the skip sits INSIDE the dispatch loop, after the readiness check', () => {
    const loopAt = TRANSPORT_SRC.indexOf('for (const handle of this.strategies.values())');
    const readyAt = TRANSPORT_SRC.indexOf('if (handle.action === null) continue;', loopAt);
    const skipAt = TRANSPORT_SRC.indexOf('if (only !== null && handle.name !== only) continue;');
    expect(loopAt).toBeGreaterThan(-1);
    expect(skipAt).toBeGreaterThan(readyAt);
  });
});
