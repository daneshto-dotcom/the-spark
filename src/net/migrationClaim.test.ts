/**
 * SPARK — S122 P2 (host-migration D3): MIGRATION_CLAIM unit matrix.
 *
 * The claim's trust surface, exhaustively: payload injectivity, sign/verify round-trip
 * under the warranted key, the reject matrix (every field that must bind), the
 * transport-grounded alive set, the D-A allocator rebuild, and the wire-shape gate.
 * verifyMigrationClaim deliberately never re-verifies the WARRANT (session.warrant is
 * stored exclusively post-verifyWarrant) — so these tests build warrants as literals.
 */

import { describe, expect, it } from 'vitest';
import { generateClientIdentity } from './hostIdentity.ts';
import {
  buildClaimPayload,
  computeAliveSeats,
  fnv1a32,
  rebuildAuthorityAllocators,
  signMigrationClaim,
  verifyMigrationClaim,
} from './migrationClaim.ts';
import { parseNetMessage, type MigrationClaimMsg, type RosterEntry } from './protocol.ts';
import type { SuccessionWarrant } from './successionWarrant.ts';
import { dispatch, makeWorld } from '../state/world.ts';

function bytesEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('S122 P2 — migration claim payload', () => {
  it('is injective across field boundaries (no shift ambiguity)', () => {
    // Classic boundary attack: moving a character between adjacent string fields must
    // change the bytes (length prefixes make it so).
    const a = buildClaimPayload('ABCD', 1, 2, 'peerX');
    const b = buildClaimPayload('ABC', 1, 2, 'DpeerX');
    expect(bytesEq(a, b)).toBe(false);
    // Epoch and seat are fixed-width — distinct values, distinct bytes.
    expect(bytesEq(buildClaimPayload('R', 1, 2, 'p'), buildClaimPayload('R', 2, 1, 'p'))).toBe(false);
    // Deterministic: same inputs, same bytes.
    expect(bytesEq(buildClaimPayload('R', 7, 3, 'p'), buildClaimPayload('R', 7, 3, 'p'))).toBe(true);
  });
});

describe('S122 P2 — sign/verify round-trip + reject matrix', () => {
  const ROOM = 'K7Q2';
  const PEER = 'trystero-peer-abc';

  async function fixture(): Promise<{
    warrant: SuccessionWarrant;
    claim: MigrationClaimMsg;
    otherSpki: string;
  }> {
    const identity = await generateClientIdentity();
    const other = await generateClientIdentity();
    const warrant: SuccessionWarrant = {
      epoch: 0,
      seats: [
        { seat: 1, spkiB64: identity.spkiB64 },
        { seat: 2, spkiB64: other.spkiB64 },
      ],
      sigB64: 'unused-by-claim-verification',
    };
    const claim = await signMigrationClaim(identity, ROOM, 1, 1, PEER);
    return { warrant, claim, otherSpki: other.spkiB64 };
  }

  it('accepts the genuine claim (warranted key, bound sender, exact epoch/seat/room)', async () => {
    const { warrant, claim } = await fixture();
    expect(await verifyMigrationClaim(claim, warrant, ROOM, PEER)).toBe(true);
  });

  it('rejects: different sender peerId (relay/replay from another peer)', async () => {
    const { warrant, claim } = await fixture();
    expect(await verifyMigrationClaim(claim, warrant, ROOM, 'someone-else')).toBe(false);
  });

  it('rejects: wrong room code', async () => {
    const { warrant, claim } = await fixture();
    expect(await verifyMigrationClaim(claim, warrant, 'ZZZZ', PEER)).toBe(false);
  });

  it('rejects: epoch tampered after signing (replay at a later term)', async () => {
    const { warrant, claim } = await fixture();
    const tampered: MigrationClaimMsg = { ...claim, epoch: 2 };
    expect(await verifyMigrationClaim(tampered, warrant, ROOM, PEER)).toBe(false);
  });

  it("rejects: seat tampered to another warranted seat (claimant doesn't hold that key)", async () => {
    const { warrant, claim } = await fixture();
    const tampered: MigrationClaimMsg = { ...claim, seat: 2 };
    expect(await verifyMigrationClaim(tampered, warrant, ROOM, PEER)).toBe(false);
  });

  it('rejects: seat absent from the warrant entirely', async () => {
    const { warrant, claim } = await fixture();
    const tampered: MigrationClaimMsg = { ...claim, seat: 5 };
    expect(await verifyMigrationClaim(tampered, warrant, ROOM, PEER)).toBe(false);
  });

  it('rejects: corrupted signature (fail-closed, no throw)', async () => {
    const { warrant, claim } = await fixture();
    const corrupt: MigrationClaimMsg = { ...claim, sigB64: 'AAAA' + claim.sigB64.slice(4) };
    expect(await verifyMigrationClaim(corrupt, warrant, ROOM, PEER)).toBe(false);
    const garbage: MigrationClaimMsg = { ...claim, sigB64: '!!!not-base64!!!' };
    expect(await verifyMigrationClaim(garbage, warrant, ROOM, PEER)).toBe(false);
  });
});

describe('S122 P2 — transport-grounded alive set', () => {
  const roster: RosterEntry[] = [
    { seat: 0, peerId: 'host', color: 1 },
    { seat: 1, peerId: 'j1', color: 2 },
    { seat: 2, peerId: 'j2', color: 3 },
  ];

  it('alive = roster ∩ transport-alive, plus self', () => {
    // j2's view: host dead, j1 alive.
    const alive = computeAliveSeats(roster, new Set(['j1']), 2);
    expect([...alive].sort()).toEqual([1, 2]);
  });

  it('a dead host never counts; an unknown transport peer never counts', () => {
    const alive = computeAliveSeats(roster, new Set(['stranger']), 1);
    expect([...alive]).toEqual([1]);
  });
});

describe('S122 P2 — D-A authority rebuild', () => {
  it('allocators = max(live)+1; reseed is deterministic over (roomCode, tick)', () => {
    const world = makeWorld(7);
    world.gameState = 'TITLE';
    dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
    // Craft live entities at high ids by direct Map writes (the mirror-adoption shape:
    // ids exist in Maps, allocators are stale-zero exactly like a netSnapshot-fed world).
    const prim = { id: 41 } as never;
    world.primitives.set(41 as never, prim);
    world.bonds.set(97 as never, { id: 97 } as never);
    world.freeSparks.set(1203 as never, { id: 1203 } as never);
    const r = rebuildAuthorityAllocators(world);
    expect(r.nextPrimitiveId).toBe(42);
    expect(r.nextBondId).toBe(98);
    expect(r.maxSparkId).toBe(1203);
    expect(r.reseed('K7Q2', 5000)).toBe(r.reseed('K7Q2', 5000));
    expect(r.reseed('K7Q2', 5000)).not.toBe(r.reseed('K7Q2', 5001));
    expect(fnv1a32('K7Q2')).toBe(fnv1a32('K7Q2'));
  });
});

describe('S122 P2 — MIGRATION_CLAIM wire-shape gate', () => {
  it('valid shape parses; every malformed variant nulls (fail-closed)', () => {
    const ok = { kind: 'MIGRATION_CLAIM', epoch: 1, seat: 1, sigB64: 'c2ln' };
    expect(parseNetMessage(ok)).not.toBeNull();
    expect(parseNetMessage({ ...ok, epoch: 0 })).toBeNull(); // epoch must be ≥1
    expect(parseNetMessage({ ...ok, epoch: 1.5 })).toBeNull();
    expect(parseNetMessage({ ...ok, seat: -1 })).toBeNull();
    expect(parseNetMessage({ ...ok, seat: 'one' })).toBeNull();
    expect(parseNetMessage({ ...ok, sigB64: 42 })).toBeNull();
    const { sigB64: _s, ...noSig } = ok;
    void _s;
    expect(parseNetMessage(noSig)).toBeNull();
  });
});
