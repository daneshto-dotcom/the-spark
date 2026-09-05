/**
 * SPARK — S15 P2 protocol tests.
 *
 * Coverage:
 *   - Room code generation: length, alphabet, no-confusion-chars.
 *   - Room code parsing: case normalization, length check, alphabet check.
 *   - Envelope shape sanity (types compile; runtime structure).
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  generateRoomCode,
  parseRoomCode,
  parseNetMessage,
  PROTOCOL_VERSION,
  CLIENT_INTENT_TYPES,
  buildHello,
} from './protocol.ts';
import { MAX_PLAYERS, NET_ROOM_CODE_LENGTH, PLAYER_COLORS } from '../constants.ts';
import { asPlayerId } from '../types.ts';

describe('S15 P2 — room code generation', () => {
  it('generates a code of the configured length (default 6)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code.length).toBe(NET_ROOM_CODE_LENGTH);
    }
  });

  it('uses only the non-confusing alphabet (no 0/O/1/I)', () => {
    const allowed = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/;
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(allowed.test(code)).toBe(true);
    }
  });

  it('honors custom length parameter', () => {
    expect(generateRoomCode(4).length).toBe(4);
    expect(generateRoomCode(8).length).toBe(8);
  });
});

describe('S15 P2 — room code parsing', () => {
  it('canonicalizes lowercase input to uppercase', () => {
    expect(parseRoomCode('abc234')).toBe('ABC234');
  });

  it('rejects codes of wrong length', () => {
    expect(parseRoomCode('ABC23')).toBeNull(); // 5 chars
    expect(parseRoomCode('ABC2345')).toBeNull(); // 7 chars
  });

  it('rejects codes containing confusion chars (0/O/1/I/lowercase already canonicalized)', () => {
    expect(parseRoomCode('ABC230')).toBeNull(); // contains 0
    expect(parseRoomCode('ABC23O')).toBeNull(); // contains O
    expect(parseRoomCode('ABC231')).toBeNull(); // contains 1
    expect(parseRoomCode('ABC23I')).toBeNull(); // contains I
  });

  it('accepts a generated code roundtrip', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode();
      const parsed = parseRoomCode(code);
      expect(parsed).toBe(code);
    }
  });

  it('trims whitespace around the input', () => {
    expect(parseRoomCode('  ABC234  ')).toBe('ABC234');
  });
});

describe('S22 P3 — parseNetMessage validator', () => {
  it('PROTOCOL_VERSION is 41 — THE ONE DELIBERATE PIN: a bump must be a decision, never a side effect', () => {
    // ⭐ S140 P1 — THIS IS NOW THE ONLY HARDCODED COPY OF THE VERSION IN THE UNIT SUITE (the e2e
    // lane keeps its own single `LOCAL_PROTO_V`). There were FOUR, and every one of their titles had
    // gone stale — all three of the others said "is 17" while asserting 18. Copies of a number do not
    // enforce it, they just multiply the places it can rot; the other three now assert the real
    // invariant (built HELLO === exported const) instead.
    //
    // This single pin stays deliberate on purpose: bumping the wire version hard-rejects every
    // already-deployed peer at HELLO, so it must be an explicit choice with a ledger entry, not
    // something that rides along with an unrelated edit. If you are here because this went red:
    // update the const, the narrative history JSDoc, the `protoVersion` type literal, this number,
    // and e2e/smoke.spec.ts's LOCAL_PROTO_V.
    //
    // ⚠ S154 P2 — AND THIS TITLE. It read "is 30" while asserting 31, i.e. it had ALREADY drifted one
    // bump before this session touched it — the very failure this test's own comment describes two
    // paragraphs up ("all three of the others said 'is 17' while asserting 18"). Site 5 of the
    // checklist says "this number **and its test title**" for exactly this reason. A title is what a
    // human reads when deciding whether the pin is current, so a stale one is worse than none.
    expect(PROTOCOL_VERSION).toBe(41);
  });

  it('S152 P1 — RAID_TARGET is an allowed CLIENT INTENT (a 1v1 joiner can raid; was RAID_CREATURE until S152)', () => {
    expect(CLIENT_INTENT_TYPES.has('RAID_TARGET')).toBe(true);
    // ⛔ AND THE OLD NAME MUST BE GONE. Leaving it allowlisted would let a stale client keep
    // sending the S102 payload shape, which the v31 reducer has no arm for.
    expect(CLIENT_INTENT_TYPES.has('RAID_CREATURE' as never)).toBe(false);
  });

  it('accepts a HELLO with current protoVersion', () => {
    const msg = { kind: 'HELLO', playerId: 0, color: 0xff0000, protoVersion: PROTOCOL_VERSION };
    expect(parseNetMessage(msg)).toEqual(msg);
  });

  it('rejects a HELLO with protoVersion 2 (no back-compat post-S52)', () => {
    const msg = { kind: 'HELLO', playerId: 0, color: 0xff0000, protoVersion: 2 };
    expect(parseNetMessage(msg)).toBeNull();
  });

  it('rejects a HELLO with protoVersion 1 (no back-compat)', () => {
    const msg = { kind: 'HELLO', playerId: 0, color: 0xff0000, protoVersion: 1 };
    expect(parseNetMessage(msg)).toBeNull();
  });

  it('accepts an INTENT carrying the S71 TRIGGER_BOMB action (allowlist)', () => {
    const msg = { kind: 'INTENT', intentSeq: 1, action: { type: 'TRIGGER_BOMB', bombId: 0, playerId: 0 } };
    expect(parseNetMessage(msg)).toEqual(msg);
  });

  it('accepts an INTENT carrying the S75 TRIGGER_RAINBOW action (allowlist)', () => {
    const msg = { kind: 'INTENT', intentSeq: 1, action: { type: 'TRIGGER_RAINBOW', rainbowId: 0, playerId: 0 } };
    expect(parseNetMessage(msg)).toEqual(msg);
  });

  it('accepts INTENT / NETSNAPSHOT / ENDGAME / GODLY_TRIGGER', () => {
    // S42 — END_TURN removed from allowlist (turn-based gameplay deleted);
    // use SPAWN_SPARK as a representative valid action.
    expect(parseNetMessage({ kind: 'INTENT', intentSeq: 1, action: { type: 'SPAWN_SPARK' } })).not.toBeNull();
    // Audit Pass 2 fix d4541985: NETSNAPSHOT now requires schemaVersion=1
    // (was permissive of undefined for test back-compat).
    expect(parseNetMessage({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: { schemaVersion: 1 } })).not.toBeNull();
    expect(parseNetMessage({ kind: 'ENDGAME', winnerId: 0 })).not.toBeNull();
    expect(parseNetMessage({ kind: 'GODLY_TRIGGER', event: { godlyId: 'voltkin' } })).not.toBeNull();
  });

  it('rejects unknown kinds + non-object inputs', () => {
    expect(parseNetMessage({ kind: 'WHATEVER' })).toBeNull();
    expect(parseNetMessage(null)).toBeNull();
    expect(parseNetMessage('string')).toBeNull();
    expect(parseNetMessage(42)).toBeNull();
  });
});

describe('Audit Pass 1 d3f0e22b + 561e37ce — strengthened parseNetMessage', () => {
  it('HELLO requires numeric playerId and color', () => {
    // S75 — use the CURRENT protoVersion (PROTOCOL_VERSION) so the validator reaches the
    // playerId/color checks rather than short-circuiting on a version mismatch
    // (which would make these pass for the wrong reason).
    expect(parseNetMessage({ kind: 'HELLO', playerId: '0', color: 0xff0000, protoVersion: PROTOCOL_VERSION })).toBeNull();
    expect(parseNetMessage({ kind: 'HELLO', playerId: 0, color: 'red', protoVersion: PROTOCOL_VERSION })).toBeNull();
    expect(parseNetMessage({ kind: 'HELLO', protoVersion: PROTOCOL_VERSION })).toBeNull();
  });

  it('INTENT requires action.type ∈ KNOWN_GAME_ACTION_TYPES', () => {
    expect(parseNetMessage({ kind: 'INTENT', intentSeq: 1, action: { type: 'NUKE_THE_PLANET' } })).toBeNull();
    expect(parseNetMessage({ kind: 'INTENT', intentSeq: 1, action: { type: 'rm -rf /' } })).toBeNull();
    expect(parseNetMessage({ kind: 'INTENT', intentSeq: 1, action: {} })).toBeNull();
    expect(parseNetMessage({ kind: 'INTENT', intentSeq: 1, action: null })).toBeNull();
    expect(parseNetMessage({ kind: 'INTENT', intentSeq: 1, action: 'string' })).toBeNull();
  });

  it('INTENT accepts every known GameAction discriminant', () => {
    // S42 — END_TURN removed (turn-based gameplay deleted, blueprint mandates real-time).
    const known = [
      'SPAWN_SPARK', 'DESPAWN_SPARK', 'PICKUP_SPARK', 'DROP_SPARK',
      'PLACE_PRIMITIVE', 'SEVER_BOND', 'TICK_ENERGY', 'WIN_TRIGGER',
      'START_GAME', 'RETURN_TO_TITLE', 'UPDATE_AVATAR_POS',
      'GODLY_TRIGGER', 'GODLY_COMPLETE', 'GODLY_ABORT',
      'SPAWN_CREATURE', 'DESPAWN_CREATURE', 'CREATURE_TICK', 'CREATURE_ATTACK',
    ];
    for (const t of known) {
      expect(parseNetMessage({ kind: 'INTENT', intentSeq: 1, action: { type: t } })).not.toBeNull();
    }
  });

  it('NETSNAPSHOT rejects schemaVersion mismatch (e.g. peer on a future major)', () => {
    expect(parseNetMessage({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: { schemaVersion: 2 } })).toBeNull();
    expect(parseNetMessage({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: { schemaVersion: 99 } })).toBeNull();
    expect(parseNetMessage({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: { schemaVersion: 'one' } })).toBeNull();
  });

  it('Audit Pass 2 d4541985: NETSNAPSHOT requires schemaVersion=1 (strict; no undefined carve-out)', () => {
    expect(parseNetMessage({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: { schemaVersion: 1 } })).not.toBeNull();
    // Pre-Pass-2 this was permissive (returned NetSnapshotMsg). Post-Pass-2:
    // strict equality, omitted schemaVersion rejected at the wire.
    expect(parseNetMessage({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: {} })).toBeNull();
  });

  it('NETSNAPSHOT rejects non-object snapshot', () => {
    expect(parseNetMessage({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: null })).toBeNull();
    expect(parseNetMessage({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: 'oops' })).toBeNull();
    expect(parseNetMessage({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: 42 })).toBeNull();
  });

  it('GODLY_TRIGGER requires event.godlyId to be a string', () => {
    expect(parseNetMessage({ kind: 'GODLY_TRIGGER', event: { godlyId: 'voltkin' } })).not.toBeNull();
    expect(parseNetMessage({ kind: 'GODLY_TRIGGER', event: { godlyId: 123 } })).toBeNull();
    expect(parseNetMessage({ kind: 'GODLY_TRIGGER', event: {} })).toBeNull();
    expect(parseNetMessage({ kind: 'GODLY_TRIGGER', event: null })).toBeNull();
    expect(parseNetMessage({ kind: 'GODLY_TRIGGER', event: 'string' })).toBeNull();
  });

  it('ENDGAME rejects non-numeric winnerId', () => {
    expect(parseNetMessage({ kind: 'ENDGAME', winnerId: 0 })).not.toBeNull();
    expect(parseNetMessage({ kind: 'ENDGAME', winnerId: '0' })).toBeNull();
    expect(parseNetMessage({ kind: 'ENDGAME' })).toBeNull();
  });

  /*
   * ⭐ S163 P1 — ENDGAME's optional `epoch`. It is the fence that stops a DEPOSED host from ending
   * a match its survivors are still playing under a new host: `hostAuthFilter` only asks "are you
   * the latched host peer?", which a zombie term still satisfies. NETSNAPSHOT has been fenced since
   * D2; this was the one host-authored kind that was not, and it is the one that ENDS the match.
   */
  it('⭐ S163 — ENDGAME accepts an absent epoch (a pre-S163 host) and a valid one', () => {
    expect(parseNetMessage({ kind: 'ENDGAME', winnerId: 1 })).not.toBeNull();
    expect(parseNetMessage({ kind: 'ENDGAME', winnerId: 1, epoch: 0 })).not.toBeNull();
    expect(parseNetMessage({ kind: 'ENDGAME', winnerId: 1, epoch: 7 })).not.toBeNull();
  });

  it('⛔ S163 — ENDGAME rejects a present-but-garbage epoch rather than coercing it', () => {
    // Fail-closed, matching `ready`/`raceId` in isValidRoster and MIGRATION_CLAIM's bounds check.
    // A NaN or a negative reaching the `(msg.epoch ?? 0) < currentEpoch` fence would silently
    // compare as a live term — NaN < n is false, so a NaN epoch would PASS the fence.
    for (const bad of ['3', 1.5, -1, NaN, null, {}]) {
      expect(parseNetMessage({ kind: 'ENDGAME', winnerId: 1, epoch: bad })).toBeNull();
    }
  });
});

describe('S39 P1 — START_GAME_SIGNAL envelope (lobby-exit decoupled from snapshot)', () => {
  it('accepts a valid 1v1 signal', () => {
    const msg = {
      kind: 'START_GAME_SIGNAL',
      mode: '1v1',
      roster: [
        { seat: 0, peerId: 'host', color: 0xff3b6b },
        { seat: 1, peerId: 'p1', color: 0x3bd7ff },
      ],
    };
    expect(parseNetMessage(msg)).toEqual(msg);
  });

  it('rejects unknown / malformed mode (fail-closed — future modes must be added explicitly)', () => {
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: 'solo' })).toBeNull();
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: '2v2' })).toBeNull();
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: null })).toBeNull();
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL' })).toBeNull();
  });

  it('S62 — rejects a START_GAME_SIGNAL with a missing/empty/malformed roster (fail-closed seating)', () => {
    // No roster — the N-player contract requires it (was valid pre-S62).
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: '1v1' })).toBeNull();
    // Empty roster — a match always has ≥1 seat (the host).
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: '1v1', roster: [] })).toBeNull();
    // Entry missing required fields / wrong types.
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: '1v1', roster: [{ seat: 0 }] })).toBeNull();
    expect(
      parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: '1v1', roster: [{ seat: 0, peerId: 'h', color: 'red' }] }),
    ).toBeNull();
    // Roster not an array.
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: '1v1', roster: 'nope' })).toBeNull();
  });

  it('survives JSON round-trip (runtime wire fidelity, not just direct call)', () => {
    const msg = {
      kind: 'START_GAME_SIGNAL',
      mode: '1v1',
      roster: [
        { seat: 0, peerId: 'host', color: 0xff3b6b },
        { seat: 1, peerId: 'p1', color: 0x3bd7ff },
      ],
    };
    const wire = JSON.parse(JSON.stringify(msg));
    expect(parseNetMessage(wire)).toEqual(msg);
  });
});

describe('S70 P1 — LOBBY_PRESENCE envelope (cosmetic lobby roster, NO version bump)', () => {
  it('accepts a valid presence roster (same RosterEntry shape as START_GAME_SIGNAL)', () => {
    const msg = {
      kind: 'LOBBY_PRESENCE',
      roster: [
        { seat: 0, peerId: 'host', color: 0xff3b6b },
        { seat: 1, peerId: 'p1', color: 0x3bd7ff },
      ],
    };
    expect(parseNetMessage(msg)).toEqual(msg);
  });

  it('accepts a host-alone roster (single seat-0 entry)', () => {
    const msg = { kind: 'LOBBY_PRESENCE', roster: [{ seat: 0, peerId: 'host', color: 0xff3b6b }] };
    expect(parseNetMessage(msg)).toEqual(msg);
  });

  it('rejects a missing/empty/non-array/malformed roster (fail-closed, shared isValidRoster)', () => {
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE' })).toBeNull();
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: [] })).toBeNull();
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: 'nope' })).toBeNull();
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: [{ seat: 0 }] })).toBeNull();
    expect(
      parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: [{ seat: 0, peerId: 'h', color: 'red' }] }),
    ).toBeNull();
    expect(
      parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: [{ seat: '0', peerId: 'h', color: 1 }] }),
    ).toBeNull();
  });

  it('survives JSON round-trip (runtime wire fidelity)', () => {
    const msg = {
      kind: 'LOBBY_PRESENCE',
      roster: [
        { seat: 0, peerId: 'host', color: 0xff3b6b },
        { seat: 1, peerId: 'p1', color: 0x3bd7ff },
        { seat: 2, peerId: 'p2', color: 0x9bff3b },
      ],
    };
    expect(parseNetMessage(JSON.parse(JSON.stringify(msg)))).toEqual(msg);
  });

  it('CHECK GROK-ANALYST fix: rejects an OVER-CAP roster (> MAX_PLAYERS) for BOTH kinds (fail-closed length bound)', () => {
    /*
     * ⛔ S163 CHECK — **THE LENGTH BOUND IS NOW SUBSUMED AND CANNOT BE PINNED INDEPENDENTLY.**
     * Stated here rather than faked, because two attempts to "restore" this test both failed and
     * the second failure is the actual result.
     *
     * P4 added `0 <= seat < MAX_PLAYERS` AND cross-entry seat uniqueness. Those two together make
     * an over-cap roster impossible by PIGEONHOLE: more than MAX_PLAYERS entries drawn from
     * MAX_PLAYERS distinct legal seats must repeat one. So every over-cap fixture is now rejected
     * by the range check (distinct seats 0..6) or by the dup check (cycled seats) BEFORE the length
     * bound is consulted — verified by mutation: deleting `roster.length > MAX_PLAYERS` leaves this
     * whole file green either way.
     *
     * The bound is KEPT anyway: it is a cheap O(1) short-circuit ahead of the loop, and it is the
     * one check that still holds if a future edit relaxes seat uniqueness. But it is defence in
     * depth, not an independently-tested guard, and pretending otherwise is what this session spent
     * eight priorities removing.
     */
    const tooMany = Array.from({ length: MAX_PLAYERS + 3 }, (_, i) => ({
      seat: i,
      peerId: `p${i}`,
      color: 0x111111,
    }));
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: tooMany })).toBeNull();
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: '1v1', roster: tooMany })).toBeNull();
    // A roster of exactly MAX_PLAYERS is still valid (the cap is inclusive).
    const exactlyMax = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
      seat: i,
      peerId: `p${i}`,
      color: 0x111111,
    }));
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: exactlyMax })).not.toBeNull();
    // ⭐ S163 CHECK — the pigeonhole argument above, asserted rather than only claimed: a roster of
    // exactly MAX_PLAYERS uses every legal seat, so there is no legal seat left for a further entry.
    expect(new Set(exactlyMax.map((e) => e.seat)).size).toBe(MAX_PLAYERS);
  });

  /*
   * ⛔ S163 P4 — **`seat` WAS TYPE-CHECKED AND NOTHING ELSE.** Both writers of `hostSeats`
   * (`main.ts`, `hostHandlers.ts`) do `hostSeats.set(e.peerId, asPlayerId(e.seat))` straight off
   * this roster, and `asPlayerId` is a BRAND CAST, not a check — so a garbage seat was laundered
   * into a `PlayerId` at the two places a successor rebuilds its seat map after a migration.
   */
  it('⛔ S163 — rejects an out-of-range, negative, fractional or NaN seat', () => {
    const withSeat = (seat: unknown): unknown => ({
      kind: 'LOBBY_PRESENCE',
      roster: [{ seat, peerId: 'p0', color: 0x111111 }],
    });
    for (const bad of [-1, MAX_PLAYERS, MAX_PLAYERS + 5, 1.5, NaN, Infinity]) {
      expect(parseNetMessage(withSeat(bad))).toBeNull();
    }
    // Anti-vacuity: the in-range ends of the interval must still pass.
    expect(parseNetMessage(withSeat(0))).not.toBeNull();
    expect(parseNetMessage(withSeat(MAX_PLAYERS - 1))).not.toBeNull();
  });

  it('⛔ S163 — rejects a roster where two entries claim the SAME seat', () => {
    // The shared root of two S162 findings: the hostSeats seat->peer scan returning on its first
    // Map hit (insertion order deciding whose absence clock could end a match), and the successor
    // rebuilding hostSeats from unchecked wire data. Closed once, here, at the boundary.
    const dup = [
      { seat: 1, peerId: 'p1', color: 0x111111 },
      { seat: 1, peerId: 'p2', color: 0x222222 },
    ];
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: dup })).toBeNull();
    expect(parseNetMessage({ kind: 'START_GAME_SIGNAL', mode: '1v1', roster: dup })).toBeNull();
  });

  it('⭐ S163 — a REPEATED peerId is still accepted, and that is deliberate', () => {
    // `reconcileLobbySeats` is keyed by peerId, so a repeated peer is last-write-wins on a Map
    // rather than an ambiguity. Rejecting it would fail-closed on a benign retransmit. Seat is the
    // field an OUTCOME is derived from; peer is not.
    const sharedPeer = [
      { seat: 0, peerId: 'same', color: 0x111111 },
      { seat: 1, peerId: 'same', color: 0x222222 },
    ];
    expect(parseNetMessage({ kind: 'LOBBY_PRESENCE', roster: sharedPeer })).not.toBeNull();
  });

  // S133 P2 — title said "PROTOCOL_VERSION is 14 after the S113 lightning-drone bump" while the
  // constant has been 15 since S124 P1 (`80f1058`, host-migration D4 production-ON). The
  // assertion below reads the constant, so the test was never wrong — only its name was, and a
  // stale name on a GATING test is what a future session greps to learn the current version.
  // ⚠ S141 — THIS TITLE SAID "is 17" WHILE THE CONSTANT WAS 19. It is the LAST surviving artefact of
  // the four-pin rot S140 fixed everywhere else, and it sits on a GATING test — exactly what a future
  // session greps to learn the current version. The name no longer states a number at all, so it
  // cannot rot again: the assertion below reads the constant, which is the only honest source.
  it('S70 graceful-degradation contract holds at the CURRENT PROTOCOL_VERSION', () => {
    // S70's LOBBY_PRESENCE was cosmetic and did NOT bump the version on its own:
    // unknown kinds fail CLOSED (fall through parseNetMessage's default → null, not
    // a throw), so a stale peer degrades to the count-based rack and can still play.
    // That graceful-degradation contract is unchanged and still asserted below.
    // S71 SEPARATELY bumped 4→5 because TRIGGER_BOMB is a NEW client→host GAMEPLAY
    // intent (Council Fork A) — unlike a cosmetic beacon, a stale peer must be
    // hard-rejected at the HELLO handshake rather than silently desync on bombs.
    // S75 — bumped again 5→6 for the TRIGGER_RAINBOW colour-shuffle intent (same rationale).
    // S77 P3 — bumped 6→7 for the SEAGULL hazard: no new client intent (cleaning is host-detected),
    // but its global income-affecting foul would confuse a stale v6 peer, so it is hard-rejected at
    // HELLO (the rainbow precedent — Council CONVERGED).
    // S87 P4 — bumped 7→8 for LOBBY_READY: a stale v7 peer in a QUICKMATCH room could never send
    // the readiness toggle, so the host's all-ready START GATE would stall forever on its silence
    // (Council F4 CONCEDED→GEMINI — match-gating, unlike the cosmetic LOBBY_PRESENCE precedent).
    // S93 — bumped 8→9 for the NONET SUDOKU_SOLVED client intent + sudoku snapshot field.
    // S100 P1 — bumped 9→10 for the TD spawner lifecycle (REGISTER/REMOVE_SPAWNER, both
    // HOST-INTERNAL — NOT in CLIENT_INTENT_TYPES) + the additive-optional creatureSpawners[]
    // snapshot field; a stale v9 peer can't render the income-affecting + connector-chewing
    // system, so it is hard-rejected at HELLO (seagull/NONET precedent).
    // S102 #1 — bumped 10→11 for the RAID_CREATURE client intent + creature hp.
    // S103 P2 — bumped 11→12 for the generic defender lifecycle (REGISTER/REMOVE/TICK_DEFENDER,
    // all HOST-INTERNAL) + the additive-optional defenders[] snapshot field.
    // S110 P4 — bumped 12→13 for HELGA's walk rework (serialized 'WALK' state + prevPos/walkTargetPos).
    // S113 Batch C — bumped 13→14 for the lightning-drone building (CreatureType lightningDrone + recipeId lightningHub).
    // S124 P1 — bumped 14→15 for host-migration D4 production-ON (MIGRATION_CLAIM live, epoch ≥ 1 semantics).
    // S140 P1 — was a second hardcoded `toBe(18)`. The bump ledger above is documentation; the
    // assertion this test actually needs is that an UNKNOWN message kind is rejected.
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
    expect(
      parseNetMessage({ kind: 'SOME_FUTURE_KIND', roster: [{ seat: 0, peerId: 'h', color: 1 }] }),
    ).toBeNull();
  });
});

describe('S54 P1 — buildHello producer (activates the dormant S53 mismatch system)', () => {
  it('stamps the current PROTOCOL_VERSION + given playerId/color (host = P0/crimson)', () => {
    const msg = buildHello(asPlayerId(0), PLAYER_COLORS[0]);
    expect(msg).toEqual({
      kind: 'HELLO',
      playerId: 0,
      color: PLAYER_COLORS[0],
      protoVersion: PROTOCOL_VERSION,
    });
  });

  it('builds the joiner HELLO with playerId 1 / cyan', () => {
    const msg = buildHello(asPlayerId(1), PLAYER_COLORS[1]);
    expect(msg.playerId).toBe(1);
    expect(msg.color).toBe(PLAYER_COLORS[1]);
    expect(msg.protoVersion).toBe(PROTOCOL_VERSION);
  });

  it('produces a WIRE-VALID envelope (round-trips through parseNetMessage)', () => {
    // The emitted HELLO must survive the receiver's own validator — proves the
    // producer and parser agree on shape (numeric playerId/color +
    // protoVersion === current). This is the contract that keeps a
    // same-version HELLO a harmless no-op rather than a rejected message.
    const msg = buildHello(asPlayerId(0), PLAYER_COLORS[0]);
    const wire = JSON.parse(JSON.stringify(msg));
    expect(parseNetMessage(wire)).toEqual(msg);
  });

  it('always announces the LOCAL version in production (cannot echo a remembered peer version)', () => {
    // In production buildHello takes no protoVersion param and emits the
    // current PROTOCOL_VERSION regardless of playerId/color. The DEV/E2E
    // send-side override seam (window.__TEST_PROTO_VERSION_OVERRIDE__) is the
    // sole exception, exercised in the seam describe below; here window is
    // undefined in vitest's node env so the production path is taken.
    expect(buildHello(asPlayerId(0), 0x111111).protoVersion).toBe(PROTOCOL_VERSION);
    expect(buildHello(asPlayerId(1), 0x222222).protoVersion).toBe(PROTOCOL_VERSION);
  });
});

describe('S55 P2 — buildHello send-side protoVersion override seam (DEV/E2E)', () => {
  const g = globalThis as { window?: { __TEST_PROTO_VERSION_OVERRIDE__?: unknown } };
  // The seam reads `window` (undefined in vitest's node env). Simulate the
  // browser/E2E case by defining a minimal window stand-in, then remove it
  // after each test so no other test in this file observes a defined window.
  afterEach(() => {
    delete g.window;
  });

  it('stamps a numeric override (simulates a stale-build peer announcing an older/newer version)', () => {
    g.window = { __TEST_PROTO_VERSION_OVERRIDE__: 2 };
    expect(buildHello(asPlayerId(1), PLAYER_COLORS[1]).protoVersion).toBe(2);
    g.window = { __TEST_PROTO_VERSION_OVERRIDE__: 4 };
    expect(buildHello(asPlayerId(1), PLAYER_COLORS[1]).protoVersion).toBe(4);
  });

  it('ignores a non-finite / non-number / absent override (production-safe fallthrough to PROTOCOL_VERSION)', () => {
    g.window = { __TEST_PROTO_VERSION_OVERRIDE__: NaN };
    expect(buildHello(asPlayerId(0), 0x111111).protoVersion).toBe(PROTOCOL_VERSION);
    g.window = { __TEST_PROTO_VERSION_OVERRIDE__: 'old' };
    expect(buildHello(asPlayerId(0), 0x111111).protoVersion).toBe(PROTOCOL_VERSION);
    g.window = {}; // window present, override absent (the common DEV-without-seam case)
    expect(buildHello(asPlayerId(0), 0x111111).protoVersion).toBe(PROTOCOL_VERSION);
  });
});

describe('W1-A (S160) — RosterEntry.raceId crosses the validator, fail-closed', () => {
  /**
   * ⭐ ONE EDIT COVERS BOTH CARRIERS. `START_GAME_SIGNAL` and `LOBBY_PRESENCE` share `isValidRoster`
   * by design, so the single check added there guards each of them — asserted here in both, because
   * "they share a validator" is the kind of claim that stops being true without anyone noticing.
   */
  const entry = (extra: Record<string, unknown>) => ({ seat: 0, peerId: 'h', color: 0xff3b6b, ...extra });
  const start = (e: unknown) => ({ kind: 'START_GAME_SIGNAL', mode: '1v1', roster: [e] });
  const presence = (e: unknown) => ({ kind: 'LOBBY_PRESENCE', roster: [e] });

  it('ABSENT is accepted — additive-optional, so a v38-shaped roster still parses', () => {
    expect(parseNetMessage(start(entry({})))).not.toBeNull();
    expect(parseNetMessage(presence(entry({})))).not.toBeNull();
  });

  it('a VALID race is accepted on both carriers', () => {
    expect(parseNetMessage(start(entry({ raceId: 'demons' })))).not.toBeNull();
    expect(parseNetMessage(presence(entry({ raceId: 'nagas' })))).not.toBeNull();
  });

  it('⭐ present-but-not-a-race REJECTS THE WHOLE MESSAGE, on both carriers', () => {
    // An unvalidated string here would reach RACE_COLORS[...] and paint `undefined`. Fail-closed
    // mirrors the `ready` flag's posture directly above it in the validator.
    for (const bad of ['ELVES', '', 'Vampires', 'vampire', 0, true, null, {}, []]) {
      expect(parseNetMessage(start(entry({ raceId: bad }))), `start/${String(bad)}`).toBeNull();
      expect(parseNetMessage(presence(entry({ raceId: bad }))), `presence/${String(bad)}`).toBeNull();
    }
  });
});
