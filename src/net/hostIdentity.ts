/**
 * SPARK — S82 P4(a): cryptographic HOST IDENTITY (lifts the S79 P4 TOFU race ceiling).
 *
 * THE IDEA: the room code IS the host's public-key commitment. The host generates an
 * ECDSA P-256 session keypair and the 6-char room code is derived as a 30-bit truncated
 * SHA-256 fingerprint of the public key (same alphabet/UX as before — the friend types
 * the same kind of code). The host attaches {publicKey, signature over (roomCode ||
 * hostPeerId)} to HELLO + START_GAME_SIGNAL. A client latches the host peerId ONLY after
 * verifying (a) the pubkey's fingerprint equals the room code it typed, (b) the signature
 * is valid, and (c) the signed peerId is the actual sender. A spoofer who races the
 * genuine host's first message can no longer win the latch: it cannot produce a key
 * matching the victim's room code (≈2^30 keygen+hash preimage work vs a minutes-long
 * lobby) nor sign for the host's peerId. KILLS the documented S79 ceiling.
 *
 * Wire impact: additive-optional fields only — NO PROTOCOL_VERSION bump (lockstep-deploy
 * procedure; stale peers null-reject unknown shapes at parseNetMessage as usual).
 * Bundle impact: WebCrypto is built-in (0 bytes of dependency).
 *
 * RESIDUAL (documented, accepted): Trystero selfId spoofing at the signaling layer and
 * host-page death (= world death) remain out of scope — the latter is host-migration
 * (backlog carry-forward). One identity per PAGE LOAD: re-hosting from the same tab
 * reuses the keypair, so the room code repeats for this page session (harmless — same
 * host, same trust anchor; a refresh mints a fresh key + code).
 *
 * Payload encoding (Council S82 R1 convergent fix — Grok#11 + Gemini#5): length-prefixed
 * + domain-separated, never bare concatenation:
 *   utf8('SPARK-HOST-ATTEST-v1') || u16be(len(roomCode)) || utf8(roomCode)
 *                                || u16be(len(peerId))   || utf8(peerId)
 */

import { NET_ROOM_CODE_LENGTH } from '../constants.ts';
import { ROOM_CODE_ALPHABET, type HostAttest } from './protocol.ts';

export type { HostAttest };

/** A live host identity: derived room code + attestation signer (private key stays inside). */
export interface HostIdentity {
  readonly spkiB64: string;
  readonly roomCode: string;
  /** Sign an attestation binding this room code to OUR transport peerId. */
  makeAttest(hostPeerId: string): Promise<HostAttest>;
  /**
   * S115 P3 (host-migration D1) — sign ARBITRARY bytes with this host's key (e.g. a SuccessionWarrant
   * payload — successionWarrant.signWarrant). Additive to the interface; existing consumers ignore it.
   * Dormant until host migration is wired (D2+).
   */
  sign(payload: Uint8Array): Promise<string>;
}

const ATTEST_DOMAIN = 'SPARK-HOST-ATTEST-v1';
// S115 P3 (host-migration D1) — EXPORTED so successionWarrant.ts reuses the SAME crypto params (one
// config, no second definition to drift — the Grok#10 "single implementation" convention).
export const ECDSA_PARAMS: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };
export const KEYGEN_PARAMS: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };

/* ───────────────────────────── pure helpers ───────────────────────────── */

export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Length-prefixed, domain-separated attestation payload (PURE — unit-tested). The u16be
 * length prefixes make the encoding injective: ('AB','CDE') can never collide with
 * ('ABC','DE') (the bare-concat ambiguity the Council R1 convergent BLOCKER flagged).
 */
export function buildAttestPayload(roomCode: string, hostPeerId: string): Uint8Array {
  const enc = new TextEncoder();
  const domain = enc.encode(ATTEST_DOMAIN);
  const code = enc.encode(roomCode);
  const peer = enc.encode(hostPeerId);
  const out = new Uint8Array(domain.length + 2 + code.length + 2 + peer.length);
  let o = 0;
  out.set(domain, o); o += domain.length;
  out[o++] = (code.length >> 8) & 0xff;
  out[o++] = code.length & 0xff;
  out.set(code, o); o += code.length;
  out[o++] = (peer.length >> 8) & 0xff;
  out[o++] = peer.length & 0xff;
  out.set(peer, o);
  return out;
}

/**
 * PURE bit-slicer (unit-tested with fixed vectors): map a SHA-256 digest to the 6-char
 * room code. Takes the FIRST 30 bits big-endian (bytes[0..3] >>> 2), then 5 bits per
 * char MSB-first over the 32-char room alphabet. One function, used by BOTH the host
 * (derive) and the client (verify) — no second implementation to drift (Grok R1#10).
 */
export function roomCodeFromDigest(digest: Uint8Array): string {
  if (digest.length < 4) throw new Error('hostIdentity: digest too short');
  const v =
    (((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 2) >>> 0;
  let code = '';
  for (let i = 0; i < NET_ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[(v >>> (25 - 5 * i)) & 31];
  }
  return code;
}

/** SHA-256 the SPKI bytes and slice the room code (async — WebCrypto digest). */
export async function roomCodeFromPubkey(spki: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', spki.slice().buffer as ArrayBuffer),
  );
  return roomCodeFromDigest(digest);
}

/* ─────────────────────────── identity lifecycle ───────────────────────── */

/**
 * Generate the page-session host identity: P-256 keypair → SPKI export → room code.
 * ~10-50ms; main.ts awaits it ONCE at boot so the lobby's "Host New Room" handler stays
 * synchronous (no UX/e2e flow change).
 */
export async function generateHostIdentity(): Promise<HostIdentity> {
  const keyPair = await crypto.subtle.generateKey(KEYGEN_PARAMS, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  const spkiB64 = bytesToB64(spki);
  const roomCode = await roomCodeFromPubkey(spki);
  // The payload is fixed per (roomCode, peerId) and selfId is page-constant, so the
  // signature is computed once per peerId and cached.
  const attestCache = new Map<string, HostAttest>();
  return {
    spkiB64,
    roomCode,
    async makeAttest(hostPeerId: string): Promise<HostAttest> {
      const cached = attestCache.get(hostPeerId);
      if (cached !== undefined) return cached;
      const payload = buildAttestPayload(roomCode, hostPeerId);
      const sig = new Uint8Array(
        await crypto.subtle.sign(ECDSA_PARAMS, keyPair.privateKey, payload.slice().buffer as ArrayBuffer),
      );
      const attest: HostAttest = { spkiB64, sigB64: bytesToB64(sig) };
      attestCache.set(hostPeerId, attest);
      return attest;
    },
    async sign(payload: Uint8Array): Promise<string> {
      const sig = new Uint8Array(
        await crypto.subtle.sign(ECDSA_PARAMS, keyPair.privateKey, payload.slice().buffer as ArrayBuffer),
      );
      return bytesToB64(sig);
    },
  };
}

/**
 * S115 P3 (host-migration D1) — a client/peer's ephemeral identity: its public key (so the host can
 * warrant it as a potential successor) + a generic signer (so survivors can later verify its
 * MIGRATION_CLAIM). Unlike a HostIdentity it derives NO room code and makes NO attest — a client is not
 * the room's commitment, it is a warrant-able successor candidate.
 */
export interface PeerIdentity {
  readonly spkiB64: string;
  /** Sign arbitrary bytes with this peer's private key → raw ECDSA signature, base64. */
  sign(payload: Uint8Array): Promise<string>;
}

/**
 * Generate an ephemeral client identity, reusing the host-identity keygen machinery. Clients did NOT
 * previously hold identities (only the host did); under host migration each joiner mints one at boot so
 * (a) the host can sign a SuccessionWarrant naming the joiner's pubkey for its seat and (b) survivors can
 * verify that joiner's signature if it later claims succession. Pure crypto, DORMANT (feature-flagged
 * off): no live path calls this yet — it is the D1 foundation for D2–D4. ~10–50ms (one P-256 keygen).
 */
export async function generateClientIdentity(): Promise<PeerIdentity> {
  const keyPair = await crypto.subtle.generateKey(KEYGEN_PARAMS, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  const spkiB64 = bytesToB64(spki);
  return {
    spkiB64,
    async sign(payload: Uint8Array): Promise<string> {
      const sig = new Uint8Array(
        await crypto.subtle.sign(ECDSA_PARAMS, keyPair.privateKey, payload.slice().buffer as ArrayBuffer),
      );
      return bytesToB64(sig);
    },
  };
}

/**
 * CLIENT-side verification — the latch precondition. True iff:
 *   (a) fingerprint(pubkey) === the room code the user typed (the commitment),
 *   (b) the signature over (roomCode || senderPeerId) verifies under that pubkey,
 *   (c) implicitly: the signed peerId IS the sender (caller passes the transport's
 *       sender peerId, never the message's claim).
 * Any malformed input → false (fail-closed); the caller stays in the pre-latch state
 * and may process the NEXT attestation (Council S82 Gemini R2#2 — a corrupt first
 * attest must not wedge the latch forever).
 */
export async function verifyHostAttest(
  attest: HostAttest,
  roomCode: string,
  senderPeerId: string,
): Promise<boolean> {
  try {
    const spki = b64ToBytes(attest.spkiB64);
    if ((await roomCodeFromPubkey(spki)) !== roomCode) return false;
    const pubKey = await crypto.subtle.importKey(
      'spki',
      spki.slice().buffer as ArrayBuffer,
      KEYGEN_PARAMS,
      false,
      ['verify'],
    );
    const payload = buildAttestPayload(roomCode, senderPeerId);
    const sig = b64ToBytes(attest.sigB64);
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
