/**
 * SPARK — S118 P1 (host-migration D2): wire-parse tests for the additive-optional fields.
 *
 * D2 adds three additive-optional fields — HELLO.clientPubkeyPopB64, NETSNAPSHOT.epoch,
 * START_GAME_SIGNAL.warrant — with NO PROTOCOL_VERSION bump. These tests prove: each parses when
 * present + well-formed; each is fail-closed when malformed; and legacy messages WITHOUT them still
 * parse unchanged (back-compat / mixed-build). Cryptographic verification is covered elsewhere; this is
 * the wire-shape gate.
 */

import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, buildHello, parseNetMessage } from './protocol.ts';
import { asPlayerId } from '../types.ts';

const snap = (extra: Record<string, unknown> = {}) => ({
  kind: 'NETSNAPSHOT',
  snapshotSeq: 1,
  snapshot: { schemaVersion: 1 },
  ...extra,
});
const beginSignal = (extra: Record<string, unknown> = {}) => ({
  kind: 'START_GAME_SIGNAL',
  mode: '1v1',
  roster: [{ seat: 0, peerId: 'host', color: 0xff0000 }],
  ...extra,
});
const validWarrant = { epoch: 0, seats: [{ seat: 1, spkiB64: 'pk' }], sigB64: 'sig' };

describe('S118 P1 — D2 wire: HELLO clientPubkeyPopB64 (additive-optional)', () => {
  it('protocol version held at 14 (no wire-breaking bump)', () => {
    expect(PROTOCOL_VERSION).toBe(14);
  });

  it('buildHello threads pubkey + PoP together; the message parses', () => {
    const hello = buildHello(asPlayerId(1), 0x00ff00, undefined, 'PUBKEY-B64', 'POP-SIG-B64');
    expect(hello.clientPubkeyB64).toBe('PUBKEY-B64');
    expect(hello.clientPubkeyPopB64).toBe('POP-SIG-B64');
    expect(parseNetMessage(hello)).not.toBeNull();
  });

  it('a legacy HELLO with NEITHER field still parses (back-compat)', () => {
    const hello = buildHello(asPlayerId(0), 0xff0000);
    expect(hello.clientPubkeyPopB64).toBeUndefined();
    expect(parseNetMessage(hello)).not.toBeNull();
  });

  it('a non-string PoP is fail-closed (rejected)', () => {
    const bad = {
      kind: 'HELLO',
      playerId: 1,
      color: 0,
      protoVersion: PROTOCOL_VERSION,
      clientPubkeyB64: 'k',
      clientPubkeyPopB64: 123,
    };
    expect(parseNetMessage(bad)).toBeNull();
  });
});

describe('S118 P1 — D2 wire: NETSNAPSHOT epoch (additive-optional envelope field)', () => {
  it('a snapshot WITHOUT epoch parses (legacy / original-term = treated as 0)', () => {
    expect(parseNetMessage(snap())).not.toBeNull();
  });

  it('a snapshot WITH a numeric epoch parses', () => {
    const parsed = parseNetMessage(snap({ epoch: 2 }));
    expect(parsed).not.toBeNull();
    expect((parsed as { epoch?: number }).epoch).toBe(2);
  });

  it('a non-number epoch is fail-closed (rejected)', () => {
    expect(parseNetMessage(snap({ epoch: 'soon' }))).toBeNull();
    expect(parseNetMessage(snap({ epoch: null }))).toBeNull();
  });
});

describe('S118 P1 — D2 wire: START_GAME_SIGNAL warrant (additive-optional)', () => {
  it('a Begin WITHOUT a warrant parses (legacy / no proven-pubkey peer)', () => {
    expect(parseNetMessage(beginSignal())).not.toBeNull();
  });

  it('a Begin WITH a well-formed warrant parses', () => {
    expect(parseNetMessage(beginSignal({ warrant: validWarrant }))).not.toBeNull();
  });

  it('a malformed warrant is fail-closed (rejects the whole message)', () => {
    expect(parseNetMessage(beginSignal({ warrant: { epoch: 'x', seats: [], sigB64: 's' } }))).toBeNull();
    expect(parseNetMessage(beginSignal({ warrant: { epoch: 0, seats: 'nope', sigB64: 's' } }))).toBeNull();
    expect(
      parseNetMessage(beginSignal({ warrant: { epoch: 0, seats: [{ seat: 'a', spkiB64: 'k' }], sigB64: 's' } })),
    ).toBeNull();
    expect(parseNetMessage(beginSignal({ warrant: { epoch: 0, seats: [{ seat: 1 }], sigB64: 's' } }))).toBeNull();
    // A present-but-null warrant is NOT treated as absent — null is an object, so the fail-closed
    // validator rejects the whole message (only an OMITTED warrant field is the legacy path).
    expect(parseNetMessage(beginSignal({ warrant: null }))).toBeNull();
  });
});
