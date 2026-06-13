/**
 * SPARK — S82 P4 netcode-hardening unit tests.
 *
 * (a) CRYPTO HOST IDENTITY (net/hostIdentity.ts): payload encoding injectivity
 *     (length-prefix + domain tag), room-code bit-slicing fixed vectors, end-to-end
 *     generate→attest→verify, and every fail-closed rejection path (wrong code, wrong
 *     peer, tampered sig, malformed base64).
 * (c) CLIENT-INTENT ALLOWLIST (net/protocol.ts): genuine player intents pass; host-
 *     internal actions (BENCH_OFFLINE_PLAYER, SPAWN_*, WIN_TRIGGER, START_GAME …) drop.
 *     Plus parseNetMessage's fail-closed hostAttest shape validation.
 * (c) DROP-BENCH reducer (BENCH_OFFLINE_PLAYER): stamps/extends, never shortens,
 *     missing-player no-op.
 *
 * WebCrypto: vitest's node env provides crypto.subtle (Node ≥18) — same API surface
 * the browser uses, so these tests exercise the production code paths directly.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import {
  b64ToBytes,
  buildAttestPayload,
  bytesToB64,
  generateHostIdentity,
  roomCodeFromDigest,
  roomCodeFromPubkey,
  verifyHostAttest,
} from './hostIdentity.ts';
import {
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  isClientIntentAllowed,
  parseNetMessage,
  parseRoomCode,
} from './protocol.ts';

const P1 = asPlayerId(0);

describe('S82 P4(a) — attest payload encoding', () => {
  it('round-trips bytes through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255, 66]);
    expect(b64ToBytes(bytesToB64(bytes))).toEqual(bytes);
  });

  it('is INJECTIVE: the length-prefix kills the bare-concat ambiguity (Council blocker)', () => {
    const a = buildAttestPayload('AB', 'CDE');
    const b = buildAttestPayload('ABC', 'DE');
    expect(bytesToB64(a)).not.toBe(bytesToB64(b));
  });

  it('starts with the domain-separation tag', () => {
    const payload = buildAttestPayload('ABCDEF', 'peer-x');
    const tag = new TextDecoder().decode(payload.slice(0, 'SPARK-HOST-ATTEST-v1'.length));
    expect(tag).toBe('SPARK-HOST-ATTEST-v1');
  });
});

describe('S82 P4(a) — room-code bit slicing (fixed vectors)', () => {
  const digest = (first4: number[]): Uint8Array => {
    const d = new Uint8Array(32);
    d.set(first4);
    return d;
  };

  it('all-zero digest → index 0 everywhere → "222222"', () => {
    expect(roomCodeFromDigest(digest([0, 0, 0, 0]))).toBe('222222');
  });

  it('all-ones digest → index 31 everywhere → "ZZZZZZ"', () => {
    expect(roomCodeFromDigest(digest([0xff, 0xff, 0xff, 0xff]))).toBe('ZZZZZZ');
  });

  it('0x80000000 → 30-bit value 0x20000000 → first char index 16, rest 0 → "J22222"', () => {
    expect(roomCodeFromDigest(digest([0x80, 0x00, 0x00, 0x00]))).toBe('J22222');
    expect(ROOM_CODE_ALPHABET[16]).toBe('J'); // pin the alphabet assumption with it
  });

  it('derived codes are valid typed room codes (parseRoomCode round-trip)', async () => {
    const spki = new Uint8Array([1, 2, 3, 4, 5]);
    const code = await roomCodeFromPubkey(spki);
    expect(code).toHaveLength(6);
    expect(parseRoomCode(code)).toBe(code);
    expect(await roomCodeFromPubkey(spki)).toBe(code); // deterministic
  });
});

describe('S82 P4(a) — generate → attest → verify (end-to-end)', () => {
  it('a genuine attestation verifies; every tamper direction fails closed', async () => {
    const id = await generateHostIdentity();
    expect(id.roomCode).toHaveLength(6);
    const attest = await id.makeAttest('peer-host');
    // cached: same object back for the same peerId
    expect(await id.makeAttest('peer-host')).toBe(attest);

    expect(await verifyHostAttest(attest, id.roomCode, 'peer-host')).toBe(true);
    // wrong room code (≠ fingerprint) → false
    expect(await verifyHostAttest(attest, 'ABCDEF', 'peer-host')).toBe(false);
    // wrong sender peerId (signature binds the peer) → false — THE seat-spoof case
    expect(await verifyHostAttest(attest, id.roomCode, 'peer-evil')).toBe(false);
    // tampered signature → false
    const sigBytes = b64ToBytes(attest.sigB64);
    sigBytes[8] ^= 0xff;
    expect(
      await verifyHostAttest(
        { spkiB64: attest.spkiB64, sigB64: bytesToB64(sigBytes) },
        id.roomCode,
        'peer-host',
      ),
    ).toBe(false);
    // malformed base64 → false (caught, never throws)
    expect(
      await verifyHostAttest({ spkiB64: '!!!notb64!!!', sigB64: attest.sigB64 }, id.roomCode, 'peer-host'),
    ).toBe(false);
  });

  it("a DIFFERENT key cannot attest for someone else's room code (the latch-race kill)", async () => {
    const victim = await generateHostIdentity();
    const attacker = await generateHostIdentity();
    // The attacker signs perfectly validly — for ITS OWN key. Fingerprint mismatch vs
    // the victim's room code rejects it regardless.
    const forged = await attacker.makeAttest('peer-evil');
    expect(await verifyHostAttest(forged, victim.roomCode, 'peer-evil')).toBe(false);
  });
});

describe('S82 P4 — wire validation of hostAttest (parseNetMessage)', () => {
  const hello = (extra: object): unknown => ({
    kind: 'HELLO',
    playerId: 0,
    color: PLAYER_COLORS[0],
    protoVersion: PROTOCOL_VERSION, // S87 P4 — track the live version (was hardcoded 7)
    ...extra,
  });

  it('HELLO without attest still parses (clients never attach one)', () => {
    expect(parseNetMessage(hello({}))).not.toBeNull();
  });

  it('HELLO with a well-formed attest parses; malformed attest rejects the message', () => {
    expect(parseNetMessage(hello({ hostAttest: { spkiB64: 'a', sigB64: 'b' } }))).not.toBeNull();
    expect(parseNetMessage(hello({ hostAttest: { spkiB64: 42, sigB64: 'b' } }))).toBeNull();
    expect(parseNetMessage(hello({ hostAttest: 'junk' }))).toBeNull();
    expect(parseNetMessage(hello({ hostAttest: null }))).toBeNull();
  });

  it('START_GAME_SIGNAL accepts/rejects the optional attest the same way', () => {
    const sig = (extra: object): unknown => ({
      kind: 'START_GAME_SIGNAL',
      mode: '1v1',
      roster: [{ seat: 0, peerId: 'p0', color: 1 }],
      ...extra,
    });
    expect(parseNetMessage(sig({}))).not.toBeNull();
    expect(parseNetMessage(sig({ hostAttest: { spkiB64: 'a', sigB64: 'b' } }))).not.toBeNull();
    expect(parseNetMessage(sig({ hostAttest: { spkiB64: 'a' } }))).toBeNull();
  });
});

describe('S82 P4(c) — client-intent allowlist', () => {
  it('genuine player intents pass', () => {
    for (const t of [
      'PICKUP_SPARK', 'DROP_SPARK', 'PLACE_PRIMITIVE', 'PLACE_FROM_FREE', 'SEVER_BOND',
      'UPDATE_AVATAR_POS', 'SHRINK_TERRITORY', 'TRIGGER_BOMB', 'TRIGGER_RAINBOW',
      'PICKUP_POTATO', 'PLACE_POTATO', 'DROP_POTATO',
    ]) {
      expect(isClientIntentAllowed(t), t).toBe(true);
    }
  });

  it('host-internal / state-machine actions are blocked', () => {
    for (const t of [
      'BENCH_OFFLINE_PLAYER', 'WIN_TRIGGER', 'START_GAME', 'RETURN_TO_TITLE',
      'SPAWN_SPARK', 'DESPAWN_SPARK', 'TICK_ENERGY', 'SPAWN_BOMB', 'DISSIPATE_BOMB',
      'SPAWN_HUNTER', 'HUNTER_TICK', 'HUNTER_CATCH', 'SPAWN_POTATO', 'POTATO_DETONATE',
      'SPAWN_RAINBOW', 'DISSIPATE_RAINBOW', 'SPAWN_SEAGULL', 'SEAGULL_TICK', 'POOP_TICK',
      'CLEAN_POOP', 'SPAWN_CREATURE', 'CREATURE_TICK', 'CREATURE_ATTACK', 'GODLY_TRIGGER',
      'GODLY_COMPLETE', 'GODLY_ABORT',
    ]) {
      expect(isClientIntentAllowed(t), t).toBe(false);
    }
  });
});

describe('S82 P4(c) — BENCH_OFFLINE_PLAYER reducer', () => {
  it('stamps the bench, extends it on re-stamp, never shortens an existing longer bench', () => {
    const w = makeWorld(0);
    w.players.clear();
    w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[0]));
    w.tick = 100;
    dispatch(w, { type: 'BENCH_OFFLINE_PLAYER', playerId: P1, untilTick: 220 });
    expect(w.players.get(P1)!.benchedUntilTick).toBe(220);
    // rolling re-stamp extends
    dispatch(w, { type: 'BENCH_OFFLINE_PLAYER', playerId: P1, untilTick: 280 });
    expect(w.players.get(P1)!.benchedUntilTick).toBe(280);
    // a LONGER existing bench (e.g. hunter 30s) is never shortened
    w.players.get(P1)!.benchedUntilTick = 5000;
    dispatch(w, { type: 'BENCH_OFFLINE_PLAYER', playerId: P1, untilTick: 300 });
    expect(w.players.get(P1)!.benchedUntilTick).toBe(5000);
  });

  it('missing player is a clean no-op', () => {
    const w = makeWorld(0);
    w.players.clear();
    expect(() =>
      dispatch(w, { type: 'BENCH_OFFLINE_PLAYER', playerId: asPlayerId(3), untilTick: 1 }),
    ).not.toThrow();
  });
});
