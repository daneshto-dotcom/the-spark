/**
 * ⭐ S162 P0 — THE MALFORMED-TURN MATRIX.
 *
 * These exist because a bad TURN paste took the whole game's multiplayer down — not degraded it,
 * took it DOWN, on every route including two machines on the same LAN. `new RTCPeerConnection`
 * rejects a malformed url synchronously, so the failure is at construction, upstream of host,
 * srflx and relay alike.
 *
 * ⛔ THE ONE INVARIANT WORTH MORE THAN ALL THE REST: nothing `parseTurnConfig` returns may be
 * capable of throwing. Every case below ends up asserting that, and the shipped-`ICE_SERVERS` test
 * at the bottom asserts it of the real module-level constant too.
 */
import { describe, expect, it } from 'vitest';
import {
  HAS_TURN_CONFIGURED,
  ICE_SERVERS,
  parseTurnConfig,
  TURN_CONFIG_NOTE,
  unwrapPastedSecret,
} from './iceConfig.ts';

/** The same shape `RTCPeerConnection` accepts. Mirrored here so the test is not the code. */
const VALID_ICE_URL = /^(?:stun|stuns|turn|turns):[^\s"'`,{}]+$/i;

function allUrls(servers: readonly RTCIceServer[]): string[] {
  return servers.flatMap((s) => (typeof s.urls === 'string' ? [s.urls] : [...s.urls]));
}

describe('unwrapPastedSecret', () => {
  it('is a NO-OP on a clean value', () => {
    expect(unwrapPastedSecret('turn:standard.relay.metered.ca:80', 'urls')).toBe(
      'turn:standard.relay.metered.ca:80',
    );
    expect(unwrapPastedSecret('hunter2', 'credential')).toBe('hunter2');
  });

  it('strips a `key: "value"` dashboard-snippet wrapper', () => {
    expect(unwrapPastedSecret('urls: "turn:global.relay.metered.ca:80"', 'urls')).toBe(
      'turn:global.relay.metered.ca:80',
    );
    expect(unwrapPastedSecret('username: "abc123"', 'username')).toBe('abc123');
  });

  it('tolerates the leading space and trailing comma a copied object line carries', () => {
    expect(unwrapPastedSecret('  credential: "s3cret",  ', 'credential')).toBe('s3cret');
  });

  it('is idempotent — unwrapping an already-unwrapped value changes nothing', () => {
    const once = unwrapPastedSecret('urls: "turn:a.example:3478"', 'urls');
    expect(unwrapPastedSecret(once, 'urls')).toBe(once);
  });

  it('does not eat a value that merely CONTAINS a colon', () => {
    // A credential can legitimately contain a colon — only a LEADING `key:` is a wrapper.
    expect(unwrapPastedSecret('pass:word:123', 'credential')).toBe('pass:word:123');
  });
});

describe('parseTurnConfig', () => {
  it('⭐ THE OWNER ACTUAL S162 PASTE — repaired, not shipped broken and not thrown away', () => {
    // Measured verbatim out of the live bundle index-8UqrIHaf.js, all three keys wrapped.
    const r = parseTurnConfig(
      'urls: "turn:global.relay.metered.ca:80"',
      'username: "dec1df55e852629341951b2a"',
      ' credential: "REDACTED"',
    );
    expect(r.servers).toHaveLength(1);
    expect(allUrls(r.servers)).toEqual(['turn:global.relay.metered.ca:80']);
    expect(r.servers[0]!.username).toBe('dec1df55e852629341951b2a');
    expect(r.servers[0]!.credential).toBe('REDACTED');
    // and it SAYS SO — a silent repair would hide an operator mistake.
    expect(r.note).not.toBeNull();
    expect(r.note).toContain('provider dashboard');
  });

  it('a clean config passes through with NO note', () => {
    const r = parseTurnConfig('turn:standard.relay.metered.ca:80', 'user', 'pass');
    expect(allUrls(r.servers)).toEqual(['turn:standard.relay.metered.ca:80']);
    expect(r.note).toBeNull();
  });

  it('a clean comma-separated pair is kept in order, both urls on ONE server entry', () => {
    const r = parseTurnConfig(
      'turn:standard.relay.metered.ca:80,turn:standard.relay.metered.ca:443?transport=tcp',
      'user',
      'pass',
    );
    expect(r.servers).toHaveLength(1);
    expect(allUrls(r.servers)).toEqual([
      'turn:standard.relay.metered.ca:80',
      'turn:standard.relay.metered.ca:443?transport=tcp',
    ]);
    expect(r.note).toBeNull();
  });

  it('an ARRAY-literal paste survives too — brackets and inner quotes are stripped per token', () => {
    const r = parseTurnConfig('["turn:a.example:3478", "turns:a.example:5349"]', 'user', 'pass');
    expect(allUrls(r.servers)).toEqual(['turn:a.example:3478', 'turns:a.example:5349']);
  });

  it('⛔ a non-ICE scheme is DROPPED, and the survivor still works', () => {
    const r = parseTurnConfig('https://not-a-turn-server.example,turn:a.example:3478', 'u', 'p');
    expect(allUrls(r.servers)).toEqual(['turn:a.example:3478']);
    expect(r.note).toContain('not valid ICE urls');
  });

  it('⛔ when NOTHING valid survives the result is STUN-only — never a throwing config', () => {
    const r = parseTurnConfig('total garbage {oops}', 'u', 'p');
    expect(r.servers).toEqual([]);
    expect(r.note).toContain('STUN-only');
  });

  it('an entirely UNSET config is the supported quiet state — no servers, no note', () => {
    const r = parseTurnConfig('', '', '');
    expect(r.servers).toEqual([]);
    expect(r.note).toBeNull();
  });

  it('a half-filled config (url but no credential) is refused, and says why', () => {
    const r = parseTurnConfig('turn:a.example:3478', 'user', '');
    expect(r.servers).toEqual([]);
    expect(r.note).toContain('username or credential was empty');
  });

  it('whitespace-only values count as unset, not as a credential', () => {
    expect(parseTurnConfig('turn:a.example:3478', '   ', '  ').servers).toEqual([]);
  });

  /**
   * ⛔ THE LOAD-BEARING ONE. Whatever the operator pastes, no url that comes back out may contain
   * the punctuation that made `RTCPeerConnection` throw. If this ever fails, multiplayer is down
   * for EVERY player on EVERY network, which is precisely what happened before it existed.
   */
  it('⛔ INVARIANT — no input can produce a url that RTCPeerConnection would reject', () => {
    const nasty = [
      'urls: "turn:global.relay.metered.ca:80"',
      '{ urls: "turn:a:80", username: "u" }',
      'turn:a:80, , ,turn:b:80',
      '["turn:a:80","turn:b:80",]',
      'stun:stun.l.google.com:19302',
      'turn:a:80 turn:b:80',
      'javascript:alert(1)',
      '\n\tturn:a:80\t\n',
      'urls:',
      '""',
      ',,,,',
      'turns:a.example:5349?transport=tcp',
    ];
    for (const raw of nasty) {
      const r = parseTurnConfig(raw, 'u', 'p');
      for (const u of allUrls(r.servers)) {
        expect(u, `input ${JSON.stringify(raw)} produced an unsafe url`).toMatch(VALID_ICE_URL);
      }
    }
  });
});

describe('the shipped module-level constants', () => {
  it('⛔ every url in the REAL ICE_SERVERS is a valid ICE url', () => {
    expect(ICE_SERVERS.length).toBeGreaterThan(0);
    for (const u of allUrls(ICE_SERVERS)) expect(u).toMatch(VALID_ICE_URL);
  });

  it('HAS_TURN_CONFIGURED agrees with whether a turn/turns url is actually present', () => {
    const hasRelayUrl = allUrls(ICE_SERVERS).some((u) => /^turns?:/i.test(u));
    expect(HAS_TURN_CONFIGURED).toBe(hasRelayUrl);
  });

  it('TURN_CONFIG_NOTE is null or a non-empty string — never an empty string', () => {
    if (TURN_CONFIG_NOTE !== null) expect(TURN_CONFIG_NOTE.length).toBeGreaterThan(0);
  });
});
