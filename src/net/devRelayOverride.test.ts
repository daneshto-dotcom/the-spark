/**
 * SPARK — S195 T20: the DEV-only Nostr relay override that lets the real-WebRTC e2e specs run on a box whose
 * egress proxy carries no WebSocket upgrade (the Claude Code cloud container; `npm run probe-relays` → 0/6).
 * Three things are pinned: the parser, that `iceConfig.ts` really consults it (else the harness is a no-op),
 * and that the read can never reach a production bundle (`import.meta.env.DEV` guard, own module — see the
 * docblock there for why it is not in `iceConfig.ts`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRelayOverride, devNostrRelayOverride } from './devRelayOverride.ts';
import { NOSTR_RELAYS } from './iceConfig.ts';

describe('S195 T20 — parseRelayOverride', () => {
  it('unset / empty / junk → null (the shipped list stays)', () => {
    expect(parseRelayOverride(undefined)).toBeNull();
    expect(parseRelayOverride(null)).toBeNull();
    expect(parseRelayOverride('')).toBeNull();
    expect(parseRelayOverride('   ')).toBeNull();
    expect(parseRelayOverride('http://not-a-relay, nonsense')).toBeNull();
  });
  it('a comma-separated ws:// / wss:// list is trimmed and kept in order; non-ws tokens are dropped', () => {
    expect(parseRelayOverride('ws://127.0.0.1:43905')).toEqual(['ws://127.0.0.1:43905']);
    expect(parseRelayOverride(' ws://127.0.0.1:1 , WSS://relay.example , ftp://x ')).toEqual(['ws://127.0.0.1:1', 'WSS://relay.example']);
  });
});

describe('S195 T20 — the override is wired, DEV-gated, and inert in this test run', () => {
  const src = readFileSync(new URL('./devRelayOverride.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const ice = readFileSync(new URL('./iceConfig.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

  it('iceConfig.ts derives NOSTR_RELAYS through devNostrRelayOverride() ?? <shipped list>', () => {
    expect(ice).toMatch(/export const NOSTR_RELAYS = devNostrRelayOverride\(\) \?\? \[/);
  });
  it('the env read sits behind `if (!import.meta.env.DEV) return null;` — the production build folds it away', () => {
    const guard = src.indexOf('if (!import.meta.env.DEV) return null;');
    const read = src.indexOf('import.meta.env.VITE_TEST_NOSTR_RELAYS');
    expect(guard).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(guard);
  });
  it('iceConfig.ts itself reads NO new VITE_ name (ci.deployGate pins every one of those to deploy.yml)', () => {
    const names = [...new Set((ice.match(/env\.(VITE_[A-Z0-9_]+)/g) ?? []))].sort();
    expect(names).toEqual(['env.VITE_TURN_CREDENTIAL', 'env.VITE_TURN_URLS', 'env.VITE_TURN_USERNAME']);
  });
  it('with the variable unset (as in CI and in this run) the shipped list is what the game uses', () => {
    expect(process.env.VITE_TEST_NOSTR_RELAYS, 'this suite must run without the override set').toBeUndefined();
    expect(devNostrRelayOverride()).toBeNull();
    expect(NOSTR_RELAYS).toContain('wss://nos.lol');
    expect(NOSTR_RELAYS.every((u) => u.startsWith('wss://'))).toBe(true);
  });
});
