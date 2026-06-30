/**
 * SPARK — S115 P3 (host-migration D1): the SuccessionWarrant — the host pre-authorizes its successors
 * while it is still alive and trusted (HOST_MIGRATION_DESIGN.md §5).
 *
 * THE IDEA: today the host page IS the match — if the host's tab dies, every survivor loses the game.
 * Host migration lets a surviving peer take over. The hard part is TRUST: the room code is a 30-bit
 * fingerprint of the ORIGINAL host's public key (net/hostIdentity.ts), so a successor cannot attest under
 * it — it does not hold that private key. The SuccessionWarrant solves this: at Begin Match the host signs
 * an ordered list of (seat, joiner-pubkey) with ITS key; survivors store it. On host loss the lowest
 * surviving seat broadcasts a MIGRATION_CLAIM (D3) whose signature chains, via this warrant, back to the
 * room-code commitment. The trust model is preserved end-to-end: the room code never changes; trust flows
 * through a signature chain rooted in it. No TOFU re-latch, no room-code rotation.
 *
 * D1 SCOPE: the build/sign/verify PRIMITIVES + their tests ONLY. Nothing here is wired into the live
 * handshake or any decision path yet — it is DORMANT (feature-flagged off). Detection (D2), MIGRATION_CLAIM
 * + takeover (D3) and hardening (D4) build on these. NO PROTOCOL_VERSION bump (the warrant rides nothing
 * on the wire yet; the joiner pubkey is an additive-optional HELLO field — protocol.ts).
 *
 * ENCODING: the warrant payload reuses the EXACT length-prefixed + domain-separated discipline of
 * buildAttestPayload (hostIdentity.ts) — injective by construction (no field-boundary ambiguity), so a
 * signature can never be replayed across a different (roomCode, epoch, roster). WebCrypto ECDSA emits raw
 * P-1363 signatures (not DER), so there is no signature-malleability surface. Verification is fail-closed:
 * any malformed input → false, never a throw or a junk shape downstream.
 */

import {
  ECDSA_PARAMS,
  KEYGEN_PARAMS,
  b64ToBytes,
  roomCodeFromPubkey,
} from './hostIdentity.ts';

const WARRANT_DOMAIN = 'SPARK-SUCCESSION-WARRANT-v1';

/** One (seat, pubkey) entry — the joiner the host authorizes to claim succession for that seat. */
export interface WarrantSeat {
  readonly seat: number;
  readonly spkiB64: string;
}

export interface SuccessionWarrant {
  /** 0 for the original host's term; a migrated session runs at epoch ≥ 1 (zombie-host defense). */
  readonly epoch: number;
  /** The authorized successors, CANONICALLY ordered by seat ascending. */
  readonly seats: readonly WarrantSeat[];
  /** Host signature over buildWarrantPayload(roomCode, epoch, seats), base64. */
  readonly sigB64: string;
}

/**
 * Canonical, INJECTIVE warrant payload (mirrors buildAttestPayload's length-prefixed + domain-separated
 * form). Layout: utf8(domain) ‖ u16be(len roomCode) ‖ roomCode ‖ u32be(epoch) ‖ u16be(seatCount) ‖
 * [ u16be(seat) ‖ u16be(len spki) ‖ spki ] × seatCount. Seats are sorted by seat ASCENDING here, so the
 * payload is independent of caller ordering (sign and verify always agree).
 */
export function buildWarrantPayload(
  roomCode: string,
  epoch: number,
  seats: readonly WarrantSeat[],
): Uint8Array {
  const enc = new TextEncoder();
  const domain = enc.encode(WARRANT_DOMAIN);
  const code = enc.encode(roomCode);
  const sorted = [...seats]
    .sort((a, b) => a.seat - b.seat)
    .map((s) => ({ seat: s.seat, spki: enc.encode(s.spkiB64) }));
  let total = domain.length + 2 + code.length + 4 + 2;
  for (const s of sorted) total += 2 + 2 + s.spki.length;
  const out = new Uint8Array(total);
  let o = 0;
  out.set(domain, o); o += domain.length;
  out[o++] = (code.length >> 8) & 0xff;
  out[o++] = code.length & 0xff;
  out.set(code, o); o += code.length;
  out[o++] = (epoch >>> 24) & 0xff;
  out[o++] = (epoch >>> 16) & 0xff;
  out[o++] = (epoch >>> 8) & 0xff;
  out[o++] = epoch & 0xff;
  out[o++] = (sorted.length >> 8) & 0xff;
  out[o++] = sorted.length & 0xff;
  for (const s of sorted) {
    out[o++] = (s.seat >> 8) & 0xff;
    out[o++] = s.seat & 0xff;
    out[o++] = (s.spki.length >> 8) & 0xff;
    out[o++] = s.spki.length & 0xff;
    out.set(s.spki, o); o += s.spki.length;
  }
  return out;
}

/**
 * The HOST signs the warrant. `host` is anything exposing the host pubkey + a generic signer — i.e. a
 * HostIdentity (net/hostIdentity.ts). The returned warrant stores its seats canonically (seat-sorted).
 */
export async function signWarrant(
  host: { readonly spkiB64: string; sign(payload: Uint8Array): Promise<string> },
  roomCode: string,
  epoch: number,
  seats: readonly WarrantSeat[],
): Promise<SuccessionWarrant> {
  const sorted = [...seats]
    .sort((a, b) => a.seat - b.seat)
    .map((s) => ({ seat: s.seat, spkiB64: s.spkiB64 }));
  const sigB64 = await host.sign(buildWarrantPayload(roomCode, epoch, sorted));
  return { epoch, seats: sorted, sigB64 };
}

/**
 * Survivor-side verification — the precondition for accepting a migration. TRUE iff:
 *   (a) the host pubkey's fingerprint equals the room code (the warrant chains to the SAME commitment the
 *       room is named by — a forged warrant under a different key cannot match), AND
 *   (b) the signature verifies over the canonical payload (so epoch + the full roster are bound).
 * Any malformed input → false (fail-closed); mirrors verifyHostAttest's posture.
 */
export async function verifyWarrant(
  warrant: SuccessionWarrant,
  roomCode: string,
  hostSpkiB64: string,
): Promise<boolean> {
  try {
    const hostSpki = b64ToBytes(hostSpkiB64);
    if ((await roomCodeFromPubkey(hostSpki)) !== roomCode) return false;
    const pubKey = await crypto.subtle.importKey(
      'spki',
      hostSpki.slice().buffer as ArrayBuffer,
      KEYGEN_PARAMS,
      false,
      ['verify'],
    );
    const payload = buildWarrantPayload(roomCode, warrant.epoch, warrant.seats);
    const sig = b64ToBytes(warrant.sigB64);
    return await crypto.subtle.verify(
      ECDSA_PARAMS,
      pubKey,
      sig.slice().buffer as ArrayBuffer,
      payload.slice().buffer as ArrayBuffer,
    );
  } catch {
    return false;
  }
}

/**
 * Pure: the warranted pubkey for `seat`, or null if the warrant names no such seat. A successor's own
 * MIGRATION_CLAIM signature (D3) is checked against this — only the pubkey the host warranted for the
 * claiming seat is accepted.
 */
export function warrantedPubkeyForSeat(warrant: SuccessionWarrant, seat: number): string | null {
  for (const s of warrant.seats) if (s.seat === seat) return s.spkiB64;
  return null;
}
