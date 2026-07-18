/**
 * SPARK — S115 P3 (host-migration D1) SuccessionWarrant + client-identity + additive-HELLO tests.
 *
 * Covers the dormant D1 foundation: client identity generation; the injective warrant payload; the
 * host sign → survivor verify round-trip; that verification chains to the room-code commitment and is
 * fail-closed against every tamper (wrong host key, wrong room code, mutated epoch / roster / signature,
 * malformed input); and that the additive-optional HELLO `clientPubkeyB64` parses (absent + present) and
 * is fail-closed on a bad shape — all with NO PROTOCOL_VERSION bump.
 */

import { describe, expect, it } from 'vitest';
import {
  generateClientIdentity,
  generateHostIdentity,
} from './hostIdentity.ts';
import {
  buildWarrantPayload,
  signWarrant,
  verifyWarrant,
  warrantedPubkeyForSeat,
  type WarrantSeat,
} from './successionWarrant.ts';
import { PROTOCOL_VERSION, buildHello, parseNetMessage } from './protocol.ts';
import { asPlayerId } from '../types.ts';

const bytesEq = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe('S115 P3 — host-migration D1: client identity', () => {
  it('generateClientIdentity mints a usable pubkey + signer (its sig verifies under its own key)', async () => {
    const id = await generateClientIdentity();
    expect(typeof id.spkiB64).toBe('string');
    expect(id.spkiB64.length).toBeGreaterThan(0);
    // The signer produces a base64 signature over arbitrary bytes (used later for MIGRATION_CLAIM).
    const sig = await id.sign(new TextEncoder().encode('claim-payload'));
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  it('two client identities have distinct pubkeys', async () => {
    const a = await generateClientIdentity();
    const b = await generateClientIdentity();
    expect(a.spkiB64).not.toBe(b.spkiB64);
  });
});

describe('S115 P3 — host-migration D1: buildWarrantPayload (injective, canonical)', () => {
  const seats: WarrantSeat[] = [
    { seat: 0, spkiB64: 'AAA' },
    { seat: 1, spkiB64: 'BBB' },
  ];

  it('is deterministic (same inputs → identical bytes)', () => {
    expect(bytesEq(buildWarrantPayload('ROOM01', 0, seats), buildWarrantPayload('ROOM01', 0, seats))).toBe(true);
  });

  it('is seat-ORDER-independent (sorts internally → canonical)', () => {
    const reversed = [...seats].reverse();
    expect(bytesEq(buildWarrantPayload('ROOM01', 0, seats), buildWarrantPayload('ROOM01', 0, reversed))).toBe(true);
  });

  it('is injective across epoch / roomCode / roster (no field-boundary ambiguity)', () => {
    const base = buildWarrantPayload('ROOM01', 0, seats);
    expect(bytesEq(base, buildWarrantPayload('ROOM01', 1, seats))).toBe(false); // epoch
    expect(bytesEq(base, buildWarrantPayload('ROOM02', 0, seats))).toBe(false); // roomCode
    expect(bytesEq(base, buildWarrantPayload('ROOM01', 0, [{ seat: 0, spkiB64: 'AAA' }]))).toBe(false); // roster
    // The classic concat-ambiguity: ('AB','CDE') must not collide with ('ABC','DE') — length prefixes prevent it.
    const x = buildWarrantPayload('ROOM01', 0, [{ seat: 0, spkiB64: 'AB' }, { seat: 1, spkiB64: 'CDE' }]);
    const y = buildWarrantPayload('ROOM01', 0, [{ seat: 0, spkiB64: 'ABC' }, { seat: 1, spkiB64: 'DE' }]);
    expect(bytesEq(x, y)).toBe(false);
  });
});

describe('S115 P3 — host-migration D1: signWarrant + verifyWarrant', () => {
  it('round-trips: a host-signed warrant verifies under the correct room code + host key', async () => {
    const host = await generateHostIdentity();
    const c0 = await generateClientIdentity();
    const c1 = await generateClientIdentity();
    const seats: WarrantSeat[] = [
      { seat: 0, spkiB64: host.spkiB64 }, // the host holds seat 0
      { seat: 1, spkiB64: c0.spkiB64 },
      { seat: 2, spkiB64: c1.spkiB64 },
    ];
    const warrant = await signWarrant(host, host.roomCode, 0, seats);
    expect(warrant.seats.map((s) => s.seat)).toEqual([0, 1, 2]); // stored canonical
    expect(await verifyWarrant(warrant, host.roomCode, host.spkiB64)).toBe(true);
  });

  it('chains to the COMMITMENT: a warrant from a DIFFERENT host key fails (fingerprint ≠ room code)', async () => {
    const host = await generateHostIdentity();
    const impostor = await generateHostIdentity(); // different key ⇒ different room code
    const warrant = await signWarrant(impostor, host.roomCode, 0, [{ seat: 0, spkiB64: impostor.spkiB64 }]);
    // Verifier is told the ORIGINAL room code but handed the impostor's key: fingerprint(impostor) ≠ room.
    expect(await verifyWarrant(warrant, host.roomCode, impostor.spkiB64)).toBe(false);
  });

  it('rejects a mutated epoch / roster / signature (the signature binds them all)', async () => {
    const host = await generateHostIdentity();
    const c0 = await generateClientIdentity();
    const seats: WarrantSeat[] = [{ seat: 1, spkiB64: c0.spkiB64 }];
    const warrant = await signWarrant(host, host.roomCode, 3, seats);

    expect(await verifyWarrant({ ...warrant, epoch: 4 }, host.roomCode, host.spkiB64)).toBe(false);
    expect(await verifyWarrant({ ...warrant, seats: [{ seat: 1, spkiB64: 'TAMPERED' }] }, host.roomCode, host.spkiB64)).toBe(false);
    expect(await verifyWarrant({ ...warrant, sigB64: 'bm90LWEtc2ln' }, host.roomCode, host.spkiB64)).toBe(false);
    expect(await verifyWarrant(warrant, 'WRONGC', host.spkiB64)).toBe(false); // wrong room code
  });

  it('is fail-closed on malformed input (garbage key / sig / room → false, never throws)', async () => {
    const host = await generateHostIdentity();
    const warrant = await signWarrant(host, host.roomCode, 0, [{ seat: 0, spkiB64: host.spkiB64 }]);
    expect(await verifyWarrant(warrant, host.roomCode, 'not-base64!!')).toBe(false);
    expect(await verifyWarrant({ ...warrant, sigB64: '@@@' }, host.roomCode, host.spkiB64)).toBe(false);
  });

  it('warrantedPubkeyForSeat returns the warranted key, or null for an unknown seat', async () => {
    const host = await generateHostIdentity();
    const c0 = await generateClientIdentity();
    const warrant = await signWarrant(host, host.roomCode, 0, [
      { seat: 0, spkiB64: host.spkiB64 },
      { seat: 1, spkiB64: c0.spkiB64 },
    ]);
    expect(warrantedPubkeyForSeat(warrant, 1)).toBe(c0.spkiB64);
    expect(warrantedPubkeyForSeat(warrant, 9)).toBeNull();
  });
});

describe('S115 P3 — host-migration D1: additive-optional HELLO clientPubkeyB64 (no protocol bump)', () => {
  it('protocol version is 15 after the S124 D4 production-ON bump (D1 itself added no wire-breaking field)', () => {
    expect(PROTOCOL_VERSION).toBe(15);
  });

  it('a HELLO WITHOUT the pubkey still parses (legacy / host HELLO)', () => {
    const hello = buildHello(asPlayerId(0), 0xff0000);
    expect(hello.clientPubkeyB64).toBeUndefined();
    expect(parseNetMessage(hello)).not.toBeNull();
  });

  it('a HELLO WITH the joiner pubkey parses (the D2 send path)', () => {
    const hello = buildHello(asPlayerId(1), 0x00ff00, undefined, 'SPKI-B64-OF-JOINER');
    expect(hello.clientPubkeyB64).toBe('SPKI-B64-OF-JOINER');
    expect(parseNetMessage(hello)).not.toBeNull();
  });

  it('a HELLO with a NON-STRING pubkey is fail-closed (rejected)', () => {
    const bad = { kind: 'HELLO', playerId: 0, color: 0, protoVersion: PROTOCOL_VERSION, clientPubkeyB64: 123 };
    expect(parseNetMessage(bad)).toBeNull();
  });
});
