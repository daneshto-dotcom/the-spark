/**
 * SPARK — S159 P5: **the relay lists, and the two ways they go wrong.**
 *
 * The owner pressed TEST CONNECTION on both workstations and sent the result: matchmaking
 * `[nostr:7/7 torrent:fail]`. Measured with a real WebSocket handshake, two of the three pinned
 * torrent trackers were dead — and because `transport.ts` passes `redundancy: relayUrls.length`,
 * the list length IS the requirement, so two dead entries failed the whole strategy rather than
 * degrading it. The fallback that exists for "uncorrelated failure domain" had been contributing
 * nothing while reporting itself in red beside the real blocker (no TURN).
 *
 * ## What these tests assert, and what they deliberately do NOT
 *
 * They do **not** assert that the configured hosts are alive. That would make the suite depend on
 * free public infrastructure staying up, which is exactly the thing that decays — a green suite is
 * not evidence about the internet, and a red one from someone else's outage teaches nothing.
 *
 * They assert the two things that stay true regardless of who is up:
 *   1. **A host measured DEAD is never re-added.** Cheap, permanent, and the actual regression.
 *   2. **`scripts/probe-relays.mjs` matches `iceConfig.ts`.** The probe is plain Node with no build
 *      step, so it cannot import the TypeScript source and the lists are duplicated by hand. A
 *      probe that reports on a DIFFERENT list than the game uses is worse than no probe — it is the
 *      same class of defect as the HTTP-vs-WebSocket false verdict this priority fixed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NOSTR_RELAYS, TORRENT_TRACKERS, STRATEGY_FLAGS } from './iceConfig.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = join(HERE, '..', '..', 'scripts', 'probe-relays.mjs');

/** Pull a `const NAME = [ 'wss://…', … ];` literal out of the probe script's source text. */
function listFromProbe(name: string): string[] {
  const src = readFileSync(PROBE, 'utf8');
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src);
  expect(m, `${name} not found in probe-relays.mjs`).not.toBeNull();
  return [...(m as RegExpExecArray)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/**
 * Hosts measured DEAD on 2026-09-02 with a real WebSocket handshake. This list only ever grows.
 * A host that died once will die again, so re-adding one needs a deliberate argument, not a
 * copy-paste from an old README.
 */
const MEASURED_DEAD = ['wss://tracker.btorrent.xyz', 'wss://tracker.files.fm:7073/announce'];

describe('S159 P5 — relay list hygiene', () => {
  it('never re-adds a tracker measured dead', () => {
    for (const dead of MEASURED_DEAD) {
      expect(TORRENT_TRACKERS, `${dead} was measured DEAD — do not pin it`).not.toContain(dead);
      expect(NOSTR_RELAYS).not.toContain(dead);
    }
  });

  it('keeps at least one torrent tracker while the strategy is enabled', () => {
    // `transport.ts` sets `redundancy: relayUrls.length`, so an EMPTY list is not "no requirement",
    // it is a strategy that starts with no way to announce. If the last tracker ever dies, turn the
    // flag off rather than shipping an empty list.
    if (STRATEGY_FLAGS.torrent) expect(TORRENT_TRACKERS.length).toBeGreaterThan(0);
  });

  it('has no duplicate entries in either list', () => {
    expect(new Set(NOSTR_RELAYS).size).toBe(NOSTR_RELAYS.length);
    expect(new Set(TORRENT_TRACKERS).size).toBe(TORRENT_TRACKERS.length);
  });

  it('only pins wss:// endpoints — a plain ws:// relay would be blocked on an https:// page', () => {
    for (const u of [...NOSTR_RELAYS, ...TORRENT_TRACKERS]) expect(u.startsWith('wss://')).toBe(true);
  });

  it('scripts/probe-relays.mjs probes the SAME lists the game uses', () => {
    expect(listFromProbe('NOSTR_RELAYS')).toEqual([...NOSTR_RELAYS]);
    expect(listFromProbe('TORRENT_TRACKERS')).toEqual([...TORRENT_TRACKERS]);
  });

  it('the probe re-checks the hosts we removed, so a future session sees they stayed dead', () => {
    expect(listFromProbe('KNOWN_DEAD')).toEqual(MEASURED_DEAD);
  });

  it('the probe performs a WebSocket handshake, not an HTTPS GET', () => {
    // The regression this priority fixed: an HTTP 404 from a WSS endpoint is normal, and grading on
    // it reported the one live tracker as suspect.
    const src = readFileSync(PROBE, 'utf8');
    expect(src).toContain('new WebSocket(wssUrl)');
    expect(src).not.toContain("replace(/^wss:/, 'https:')");
  });
});
