/**
 * SPARK — S122 P2 (host-migration D3): the MIGRATION_CLAIM — sign/verify + takeover helpers.
 *
 * HOST_MIGRATION_DESIGN.md §5 step 4-5: on host loss past grace, the successor (the LOWEST
 * warranted seat still transport-alive) broadcasts a claim whose signature chains, via the
 * S118 SuccessionWarrant, back to the room-code commitment. Survivors verify against the
 * ALREADY-VERIFIED stored warrant only (session.warrant is set exclusively after
 * verifyWarrant passed at Begin) — no host-key re-touch at claim time.
 *
 * D3 SCOPE (seam-gated): the happy path behind `window.__TEST_MIGRATION__` — production
 * builds never fire a claim (main.ts gates activation on the seam) and stale peers null the
 * unknown kind at parseNetMessage (Fork-B precedent). NO PROTOCOL_VERSION bump — D4 owns the
 * bump when the feature turns default-on (S122 Council L4, 2-of-3).
 *
 * TRUST BINDINGS (the S82 posture, all fail-closed):
 *   • the payload is length-prefixed + domain-separated (injective — no field-boundary
 *     ambiguity; the warrant/attest discipline);
 *   • the claim binds the SENDER: survivors verify over the TRANSPORT peerId of whoever
 *     delivered the message, never a wire-claimed id — a relayed/replayed claim from any
 *     other peer cannot verify;
 *   • the epoch is in the payload — a replay at a later term cannot verify;
 *   • the verifying pubkey comes from warrantedPubkeyForSeat(warrant, seat) — only the key
 *     the ORIGINAL host warranted for that seat is ever accepted.
 */

import type { MigrationClaimMsg, RosterEntry } from './protocol.ts';
import { ECDSA_PARAMS, KEYGEN_PARAMS, b64ToBytes, type PeerIdentity } from './hostIdentity.ts';
import { warrantedPubkeyForSeat, type SuccessionWarrant } from './successionWarrant.ts';
import type { World } from '../state/world.ts';

const CLAIM_DOMAIN = 'SPARK-MIGRATION-CLAIM-v1';

/**
 * Canonical, INJECTIVE claim payload: utf8(domain) ‖ u16be(len roomCode) ‖ roomCode ‖
 * u32be(epoch) ‖ u16be(seat) ‖ u16be(len peerId) ‖ peerId. Mirrors buildWarrantPayload's
 * length-prefixed discipline (no separator ambiguity).
 */
export function buildClaimPayload(
  roomCode: string,
  epoch: number,
  seat: number,
  peerId: string,
): Uint8Array {
  const enc = new TextEncoder();
  const domain = enc.encode(CLAIM_DOMAIN);
  const code = enc.encode(roomCode);
  const pid = enc.encode(peerId);
  const out = new Uint8Array(domain.length + 2 + code.length + 4 + 2 + 2 + pid.length);
  let o = 0;
  out.set(domain, o); o += domain.length;
  out[o++] = (code.length >> 8) & 0xff;
  out[o++] = code.length & 0xff;
  out.set(code, o); o += code.length;
  out[o++] = (epoch >>> 24) & 0xff;
  out[o++] = (epoch >>> 16) & 0xff;
  out[o++] = (epoch >>> 8) & 0xff;
  out[o++] = epoch & 0xff;
  out[o++] = (seat >> 8) & 0xff;
  out[o++] = seat & 0xff;
  out[o++] = (pid.length >> 8) & 0xff;
  out[o++] = pid.length & 0xff;
  out.set(pid, o);
  return out;
}

/** The successor signs its claim with its D1 client identity key (the one the warrant names). */
export async function signMigrationClaim(
  identity: PeerIdentity,
  roomCode: string,
  epoch: number,
  seat: number,
  selfPeerId: string,
): Promise<MigrationClaimMsg> {
  const sigB64 = await identity.sign(buildClaimPayload(roomCode, epoch, seat, selfPeerId));
  return { kind: 'MIGRATION_CLAIM', epoch, seat, sigB64 };
}

/**
 * Survivor-side verification. TRUE iff the claim's signature verifies under the pubkey the
 * ORIGINAL host warranted for the claimed seat, over (roomCode, epoch, SENDER-peerId).
 * Any malformed input → false (fail-closed).
 */
export async function verifyMigrationClaim(
  msg: MigrationClaimMsg,
  warrant: SuccessionWarrant,
  roomCode: string,
  senderPeerId: string,
): Promise<boolean> {
  try {
    const spkiB64 = warrantedPubkeyForSeat(warrant, msg.seat);
    if (spkiB64 === null) return false;
    const pubKey = await crypto.subtle.importKey(
      'spki',
      b64ToBytes(spkiB64).slice().buffer as ArrayBuffer,
      KEYGEN_PARAMS,
      false,
      ['verify'],
    );
    const payload = buildClaimPayload(roomCode, msg.epoch, msg.seat, senderPeerId);
    const sig = b64ToBytes(msg.sigB64);
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
 * The TRANSPORT-GROUNDED alive set (the D3 carry-forward that retires D2's world.players
 * approximation): the seats of roster entries whose peerId is currently transport-alive,
 * plus the caller's own seat (a peer is trivially alive to itself). Pure.
 */
export function computeAliveSeats(
  roster: readonly RosterEntry[],
  alivePeerIds: ReadonlySet<string>,
  selfSeat: number,
): Set<number> {
  const alive = new Set<number>([selfSeat]);
  for (const e of roster) {
    if (alivePeerIds.has(e.peerId)) alive.add(e.seat);
  }
  return alive;
}

/** FNV-1a 32-bit over a string — the design §4 reseed input (hash(roomCode) ^ takeoverTick). */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * D-A rebuild (design §4): the allocator values a successor must adopt before simulating on
 * an adopted mirror — netSnapshot STRIPS nextPrimitiveId/nextBondId and the spawner's spark
 * allocator, so resuming without this would REUSE live entity ids. Pure calc; the caller
 * writes the fields + repairs its Spawner (nextId = maxSparkId + 1, streams reseeded).
 *
 * ⛔ S141 P3 — THE SPARK SCAN MUST COVER `castleBanks`, AND THIS FUNCTION'S OWN DOCBLOCK USED TO
 * ARGUE OTHERWISE.
 *
 * It said: *"Id reuse of entities DESTROYED pre-death is safe: every consumer keys off live Maps
 * (no tombstone semantics in state/)."* That reasoning is sound and its conclusion was still wrong,
 * because a BANKED spark is neither destroyed nor a tombstone — it is a LIVE entity that has
 * deliberately LEFT the live Map. `depositIntoCastle` removes it from `world.freeSparks` on purpose
 * (that removal is what exempts a stored shape from collision, the spatial grid, the renderer, the
 * soft cap and the TTL reap all at once), and holds the whole entity in `world.castleBanks`.
 *
 * So a successor whose highest FREE spark is 40, while a bank holds id 57, used to re-mint 41..57 and
 * COLLIDE. The failure is silent and self-consistent across peers — every survivor applies the same
 * successor snapshot, so the state hash AGREES on a corrupt world and no desync alarm fires. What the
 * player sees instead: `applyPullFromBank` does `freeSparks.set(id, bankSpark)`, which EVICTS the
 * live quarry spark of the same id with no despawn and no effect; if they were carrying it,
 * `placePrimitive` then resolves the carried id to the BANK shape and builds the WRONG SparkType.
 *
 * ⚠ ONLY the bank was missing, and this was checked rather than assumed. A gatherer's cargo mid-haul
 * IS still in `freeSparks` (escrow `'hauled'` — `applyGathererTick` reads it from there), and so is a
 * player's carried spark (`placePrimitive` resolves it from there). Both external Council seats
 * asserted those were also missed; both were wrong on disk. Do not widen the scan further on that
 * advice — every other container holds an id whose referent lives in `freeSparks`.
 *
 * ⚠ AND DO NOT "HARDEN" THE OTHER ALLOCATORS HERE. Creatures, gatherers, spawners and defenders are
 * already repaired on every snapshot apply by `applySnapshotCore`; re-deriving them at takeover would
 * double-write counters that path has already set correctly from the same maps.
 */
export function rebuildAuthorityAllocators(world: World): {
  nextPrimitiveId: number;
  nextBondId: number;
  maxSparkId: number;
  reseed: (roomCode: string, takeoverTick: number) => number;
} {
  let maxPrim = 0;
  for (const id of world.primitives.keys()) if ((id as number) > maxPrim) maxPrim = id as number;
  let maxBond = 0;
  for (const id of world.bonds.keys()) if ((id as number) > maxBond) maxBond = id as number;
  let maxSpark = 0;
  for (const id of world.freeSparks.keys()) if ((id as number) > maxSpark) maxSpark = id as number;
  // S141 P3 — the banked shapes, which are out of `freeSparks` BY DESIGN. See the docblock above.
  for (const bank of world.castleBanks.values()) {
    for (const s of bank) if ((s.id as unknown as number) > maxSpark) maxSpark = s.id as unknown as number;
  }
  return {
    nextPrimitiveId: maxPrim + 1,
    nextBondId: maxBond + 1,
    maxSparkId: maxSpark,
    reseed: (roomCode, takeoverTick) => (fnv1a32(roomCode) ^ takeoverTick) >>> 0,
  };
}

/** The successor's snapshotSeq base: past every survivor's watermark regardless of skew (§5). */
export const MIGRATION_SEQ_JUMP = 10_000;
