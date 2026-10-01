/**
 * SPARK — S193 relay rotation, REACHED: what the REAL `NetTransport.connect` hands Trystero's nostr `joinRoom`.
 *
 * `relayLists.test.ts` pins the LIST. A list is only half the story — `transport.ts` decides what it passes
 * (`relayConfig: { urls, redundancy: urls.length }`), and `redundancy = length` is why a dead entry costs a
 * reconnect loop on every page. So this drives the production connect path against a mocked `joinRoom` and
 * reads the config it actually received: none of the three hosts removed in S193, all of the live ones, and
 * the redundancy equal to the list.
 */
import { describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ cfgs: [] as unknown[] }));

vi.mock('@trystero-p2p/nostr', () => ({
  selfId: 'reach-self',
  getRelaySockets: () => ({}),
  joinRoom: (cfg: unknown) => {
    seen.cfgs.push(cfg);
    return {
      onPeerJoin: null,
      onPeerLeave: null,
      getPeers: () => ({}),
      makeAction: () => ({ send: () => Promise.resolve(), onMessage: null }),
      leave: () => Promise.resolve(),
    };
  },
}));
vi.mock('@trystero-p2p/torrent', () => ({
  getRelaySockets: () => ({}),
  joinRoom: () => {
    throw new Error('torrent disabled in this test');
  },
}));

import { NetTransport } from './transport.ts';
import { NOSTR_RELAYS } from './iceConfig.ts';

const REMOVED_S193 = ['wss://relay.mostr.pub', 'wss://offchain.pub', 'wss://nostr-pub.wellorder.net'];

describe('S193 - the nostr relay rotation reaches Trystero', () => {
  it('⭐ REACH: NetTransport.connect passes the rotated list, with redundancy = its length', () => {
    const t = new NetTransport();
    t.connect('ROOMRL');
    const cfg = seen.cfgs[seen.cfgs.length - 1] as { relayConfig?: { urls: string[]; redundancy: number } };
    expect(cfg?.relayConfig, 'connect() did not pass a relayConfig to nostr joinRoom').toBeDefined();
    const { urls, redundancy } = cfg.relayConfig as { urls: string[]; redundancy: number };
    expect(urls).toEqual([...NOSTR_RELAYS]);
    expect(redundancy).toBe(urls.length);
    // ⛔ NEGATIVE: none of the removed hosts is reachable from the production connect path.
    for (const r of REMOVED_S193) expect(urls, `${r} reached Trystero`).not.toContain(r);
    t.disconnect();
  });
});
