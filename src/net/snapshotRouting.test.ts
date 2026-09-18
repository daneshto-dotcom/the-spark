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
import { NetTransport, pickSnapshotStrategy, type StrategyRouteInfo } from './transport.ts';
import { SNAPSHOT_SINGLE_STRATEGY, SNAPSHOT_STRATEGY_PREFERENCE } from './iceConfig.ts';

const ICECONFIG_SRC = readFileSync(new URL('./iceConfig.ts', import.meta.url), 'utf8');
const TRANSPORT_SRC = readFileSync(new URL('./transport.ts', import.meta.url), 'utf8');

function s(name: StrategyRouteInfo['name'], ready: boolean, peerCount: number): StrategyRouteInfo {
  return { name, ready, peerCount };
}

describe('⭐ S182 LEVER 1 — the owner ruled: ON', () => {
  it('SNAPSHOT_SINGLE_STRATEGY ships ON', () => {
    // Owner, S182: "if it halves our bandwidth, then of course we need to do it."
    expect(SNAPSHOT_SINGLE_STRATEGY).toBe(true);
  });

  it('the constant still carries the argument AND the escape hatch', () => {
    const at = ICECONFIG_SRC.indexOf('export const SNAPSHOT_SINGLE_STRATEGY');
    expect(at).toBeGreaterThan(-1);
    const docblock = ICECONFIG_SRC.slice(Math.max(0, at - 4000), at);
    // The ruling, the cost it accepts, and the way back — a future session must find all three.
    expect(docblock).toContain('THE OWNER RULED');
    expect(docblock).toContain('S157/S162');
    expect(docblock).toMatch(/escape hatch/i);
    expect(docblock).toMatch(/residual risk/i);
  });

  it('routing is still gated on the NETSNAPSHOT kind, not applied to all traffic', () => {
    expect(TRANSPORT_SRC).toContain("SNAPSHOT_SINGLE_STRATEGY && msg.kind === 'NETSNAPSHOT'");
  });

  it('⭐ OBSERVED ON THE REAL SEND PATH: one snapshot copy, but HELLO still goes to both', () => {
    // The shipped default now, driven through the actual send path — no module mock.
    // `snapshotFanout.test.ts` is the counterpart that mocks the flag OFF to prove the escape hatch.
    const transport = new NetTransport();
    const priv = transport as unknown as {
      connected: boolean;
      strategies: Map<string, Record<string, unknown>>;
      peerSet: Set<string>;
    };
    priv.connected = true;
    priv.strategies = new Map();
    // ONE peer, reachable on BOTH strategies — the owner's 1v1, and the topology the doubling came
    // from. Shared id across strategies, because it is the same machine on two signalling paths.
    priv.peerSet = new Set(['peer-0']);
    const sent: Record<string, string[]> = { nostr: [], torrent: [] };
    for (const name of ['nostr', 'torrent']) {
      priv.strategies.set(name, {
        name,
        room: null,
        action: { send: (d: string) => { sent[name].push(d); return Promise.resolve(); } },
        state: 'ready',
        peers: new Set(['peer-0']),
        relayUrls: [],
        getSockets: null,
        lastError: null,
        icePollTimer: null,
        icePollStartMs: 0,
      });
    }
    transport.send({
      kind: 'NETSNAPSHOT',
      snapshotSeq: 1,
      snapshot: { schemaVersion: 1, tick: 1 },
    } as never);
    // ⭐ ONE COPY. The doubling the owner's brother was paying for is gone.
    expect(sent.nostr).toHaveLength(1);
    expect(sent.torrent).toHaveLength(0);

    transport.send({ kind: 'HELLO', protoVersion: 47 } as never);
    // …and the message that decides whether a match can START still gets both paths. That is the
    // half of the redundancy the ruling did NOT trade away.
    expect(sent.nostr).toHaveLength(2);
    expect(sent.torrent).toHaveLength(1);
  });
});

describe('S182 LEVER 1 — pickSnapshotStrategy', () => {
  it('prefers nostr when it is ready and carrying the peer', () => {
    expect(pickSnapshotStrategy([s('nostr', true, 1), s('torrent', true, 1)], 1)).toBe('nostr');
  });

  it('honours the declared preference order regardless of argument order', () => {
    expect(pickSnapshotStrategy([s('torrent', true, 1), s('nostr', true, 1)], 1)).toBe('nostr');
    expect(SNAPSHOT_STRATEGY_PREFERENCE[0]).toBe('nostr');
  });

  it('fails over to torrent when nostr has lost the peer', () => {
    expect(pickSnapshotStrategy([s('nostr', true, 0), s('torrent', true, 1)], 1)).toBe('torrent');
  });

  it('fails over to torrent when nostr is not ready at all', () => {
    expect(pickSnapshotStrategy([s('nostr', false, 0), s('torrent', true, 1)], 1)).toBe('torrent');
  });

  it('⭐ returns null — broadcast — when NO ready strategy has a peer', () => {
    // The conservative arm. With nobody visible there is nothing to route on, and falling back to
    // the pre-S182 broadcast is strictly safer. It also costs nothing: no peers means no traffic.
    expect(pickSnapshotStrategy([s('nostr', true, 0), s('torrent', true, 0)], 1)).toBe(null);
    expect(pickSnapshotStrategy([s('nostr', false, 0), s('torrent', false, 0)], 1)).toBe(null);
    expect(pickSnapshotStrategy([], 0)).toBe(null);
  });

  it('a ready-but-peerless strategy is never chosen — readiness alone is not delivery', () => {
    // A strategy can join the room and bind an action while never completing a peer handshake.
    // Routing every snapshot into it would starve the joiner completely — strictly worse than the
    // doubling this lever exists to remove.
    expect(pickSnapshotStrategy([s('nostr', true, 0), s('torrent', true, 2)], 1)).toBe('torrent');
  });

  it('ignores mqtt unless it is the only one carrying anyone (it is an opt-in lever)', () => {
    expect(pickSnapshotStrategy([s('nostr', true, 1), s('mqtt', true, 1)], 1)).toBe('nostr');
    expect(pickSnapshotStrategy([s('nostr', true, 0), s('mqtt', true, 1)], 1)).toBe('mqtt');
  });

  it('re-picks per call, so a strategy that drops its peer is abandoned on the next snapshot', () => {
    const healthy = [s('nostr', true, 1), s('torrent', true, 1)];
    expect(pickSnapshotStrategy(healthy, 1)).toBe('nostr');
    const nostrDropped = [s('nostr', true, 0), s('torrent', true, 1)];
    expect(pickSnapshotStrategy(nostrDropped, 1)).toBe('torrent');
  });
});

describe('⛔ S182 LEVER 1 — a strategy must reach the WHOLE table, not just someone', () => {
  /**
   * THE BUG THIS SECTION EXISTS FOR, found by audit after the mechanism was already committed.
   *
   * `StrategyHandle.peers` is PER-STRATEGY and is a subset of `NetTransport.peerSet`, the union.
   * Trystero's `action.send()` reaches only the peers attached to THAT strategy's room. The first
   * cut asked `peerCount > 0` — "does this strategy have A peer" — so with nostr carrying {A} and
   * torrent carrying {A, B}, it chose nostr and peer B received NOTHING for the entire match. Its
   * board would freeze solid: the exact symptom this branch exists to remove, produced by the fix
   * for it, and invisible in the 1v1 the brief is written around.
   *
   * `MAX_PLAYERS` is 4, so this was live for 3- and 4-seat matches.
   */
  it('⭐ does NOT route to a strategy that carries only SOME of the table', () => {
    // nostr sees 1 of 2 peers; torrent sees both. Routing to nostr would starve the second peer.
    expect(pickSnapshotStrategy([s('nostr', true, 1), s('torrent', true, 2)], 2)).toBe('torrent');
  });

  it('⭐ broadcasts when NO single strategy reaches everyone', () => {
    // Split table: nostr has one peer, torrent has the other. Neither can carry the match alone, so
    // the only correct answer is the redundant broadcast — bandwidth is worth less than a playable
    // seat, which is the same principle that keeps the whole lever behind an owner gate.
    expect(pickSnapshotStrategy([s('nostr', true, 1), s('torrent', true, 1)], 2)).toBe(null);
  });

  it('still routes when one strategy covers the whole table at 3 and 4 seats', () => {
    expect(pickSnapshotStrategy([s('nostr', true, 3), s('torrent', true, 3)], 3)).toBe('nostr');
    expect(pickSnapshotStrategy([s('nostr', true, 2), s('torrent', true, 3)], 3)).toBe('torrent');
  });

  it('a peerless table routes nowhere and broadcasts — there is no traffic to double', () => {
    expect(pickSnapshotStrategy([s('nostr', true, 0), s('torrent', true, 0)], 0)).toBe(null);
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
