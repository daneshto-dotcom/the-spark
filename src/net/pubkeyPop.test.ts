/**
 * SPARK — S118 P1 (host-migration D2): client pubkey PROOF-OF-POSSESSION tests (GROK W1 fix).
 *
 * A joiner signs buildPubkeyPopPayload(roomCode, selfId, spki) with its ephemeral key; the host stores
 * peerId→pubkey ONLY if verifyPubkeyPop passes. This closes the "claim any pubkey in HELLO" hole and,
 * via the (roomCode, senderPeerId) binding, blocks cross-room / cross-peer replay of a captured PoP.
 * Covers: the sign→verify round-trip; the impersonation attempt (claim another peer's pubkey); the
 * replay attempts (different sender peerId / different room); fail-closed on garbage; payload injectivity.
 */

import { describe, expect, it } from 'vitest';
import { generateClientIdentity, generateHostIdentity } from './hostIdentity.ts';
import { buildPubkeyPopPayload, verifyPubkeyPop } from './hostIdentity.ts';

const bytesEq = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Produce a genuine PoP: the joiner signs the canonical payload with its OWN key. */
async function makePop(roomCode: string, peerId: string) {
  const id = await generateClientIdentity();
  const sig = await id.sign(buildPubkeyPopPayload(roomCode, peerId, id.spkiB64));
  return { spkiB64: id.spkiB64, sig };
}

describe('S118 P1 — host-migration D2: verifyPubkeyPop round-trip', () => {
  it('accepts a PoP the joiner signed with its own key over (room, selfId, spki)', async () => {
    const { spkiB64, sig } = await makePop('ROOM01', 'peer-A');
    expect(await verifyPubkeyPop(spkiB64, sig, 'ROOM01', 'peer-A')).toBe(true);
  });
});

describe('S118 P1 — host-migration D2: verifyPubkeyPop rejects forgery / replay', () => {
  it('IMPERSONATION: signing your own key but claiming ANOTHER pubkey fails', async () => {
    const attacker = await generateClientIdentity();
    const victim = await generateClientIdentity();
    // Attacker signs the payload naming the VICTIM's spki, but with its OWN (attacker) private key.
    const sig = await attacker.sign(buildPubkeyPopPayload('ROOM01', 'peer-A', victim.spkiB64));
    // Host verifies against the CLAIMED (victim) pubkey → the attacker's signature does not verify.
    expect(await verifyPubkeyPop(victim.spkiB64, sig, 'ROOM01', 'peer-A')).toBe(false);
  });

  it('CROSS-PEER REPLAY: a PoP captured from peer-A cannot be replayed by peer-B', async () => {
    const { spkiB64, sig } = await makePop('ROOM01', 'peer-A');
    expect(await verifyPubkeyPop(spkiB64, sig, 'ROOM01', 'peer-B')).toBe(false);
  });

  it('CROSS-ROOM REPLAY: a PoP for ROOM01 cannot be replayed into ROOM02', async () => {
    const { spkiB64, sig } = await makePop('ROOM01', 'peer-A');
    expect(await verifyPubkeyPop(spkiB64, sig, 'ROOM02', 'peer-A')).toBe(false);
  });

  it('is fail-closed on garbage (bad base64 key / sig → false, never throws)', async () => {
    const { spkiB64, sig } = await makePop('ROOM01', 'peer-A');
    expect(await verifyPubkeyPop('not-base64!!', sig, 'ROOM01', 'peer-A')).toBe(false);
    expect(await verifyPubkeyPop(spkiB64, '@@@not-a-sig', 'ROOM01', 'peer-A')).toBe(false);
    // A well-formed-but-wrong signature (a host attest sig, not a PoP) also fails.
    const host = await generateHostIdentity();
    const wrongSig = (await host.makeAttest('peer-A')).sigB64;
    expect(await verifyPubkeyPop(spkiB64, wrongSig, 'ROOM01', 'peer-A')).toBe(false);
  });
});

describe('S118 P1 — host-migration D2: buildPubkeyPopPayload is injective + deterministic', () => {
  it('same inputs → identical bytes', () => {
    expect(
      bytesEq(buildPubkeyPopPayload('ROOM01', 'p', 'SPKI'), buildPubkeyPopPayload('ROOM01', 'p', 'SPKI')),
    ).toBe(true);
  });

  it('distinct across room / peer / spki, and free of concat-boundary ambiguity', () => {
    const base = buildPubkeyPopPayload('ROOM01', 'p', 'SPKI');
    expect(bytesEq(base, buildPubkeyPopPayload('ROOM02', 'p', 'SPKI'))).toBe(false);
    expect(bytesEq(base, buildPubkeyPopPayload('ROOM01', 'q', 'SPKI'))).toBe(false);
    expect(bytesEq(base, buildPubkeyPopPayload('ROOM01', 'p', 'SPKX'))).toBe(false);
    // ('AB','CDE',..) must not collide with ('ABC','DE',..) — length prefixes prevent it.
    const x = buildPubkeyPopPayload('AB', 'CDE', 'Z');
    const y = buildPubkeyPopPayload('ABC', 'DE', 'Z');
    expect(bytesEq(x, y)).toBe(false);
  });
});
