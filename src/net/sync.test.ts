/**
 * SPARK — S15 P2 sync tests.
 *
 * Coverage:
 *   - HostSync: snapshotSeq monotonic increment.
 *   - ClientSync: receive() accepts newer seq, rejects stale/out-of-order.
 *   - ClientSync.wrapIntent: intentSeq monotonic; envelope shape.
 *   - lerp01 boundary cases (NaN, negative, > 1).
 *   - interpolatePositions: lerp math at t=0 / t=0.5 / t=1.
 */

import { describe, expect, it } from 'vitest';
import { HostSync, ClientSync, interpolatePositions } from './sync.ts';
import { lerp01 } from './lerp.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { applyNetSnapshot, netSnapshot, type NetSnapshot } from '../state/save.ts';
import type { NetSnapshotMsg } from './protocol.ts';
import { asCreatureId, asPlayerId, asSparkId, type CreatureId } from '../types.ts';
import { currentFrameKey, type VoltkinFrameKey } from '../render/voltkinFrames.ts';
import { SparkType } from '../constants.ts';
import type { CreatureState } from '../state/creatures/creature.ts';

function mkSnapMsg(seq: number, snap: NetSnapshot): NetSnapshotMsg {
  return { kind: 'NETSNAPSHOT', snapshotSeq: seq, snapshot: snap };
}

describe('S15 P2 — HostSync', () => {
  it('snapshotSeq increments monotonically per buildSnapshotMessage call', () => {
    const w = makeWorld(0);
    const h = new HostSync();
    expect(h.currentSeq()).toBe(0);
    const m1 = h.buildSnapshotMessage(w);
    expect(m1.snapshotSeq).toBe(1);
    expect(h.currentSeq()).toBe(1);
    const m2 = h.buildSnapshotMessage(w);
    expect(m2.snapshotSeq).toBe(2);
  });

  it('snapshot payload is a NetSnapshot (no host-only fields)', () => {
    const w = makeWorld(0);
    const h = new HostSync();
    const msg = h.buildSnapshotMessage(w);
    expect(msg.kind).toBe('NETSNAPSHOT');
    expect((msg.snapshot as { savedAt?: string }).savedAt).toBeUndefined();
    expect((msg.snapshot as { rngSeed?: number }).rngSeed).toBeUndefined();
    expect((msg.snapshot as { nextPrimitiveId?: number }).nextPrimitiveId).toBeUndefined();
    expect((msg.snapshot as { nextBondId?: number }).nextBondId).toBeUndefined();
    // S82 P2 — spawner state (5 RNG stream words = the spawn schedule) must NEVER ride
    // the wire (rngSeed precedent; param-injection keeps it off by construction).
    expect((msg.snapshot as { spawner?: unknown }).spawner).toBeUndefined();
    // Retained fields present:
    expect(msg.snapshot.gameState).toBeDefined();
    expect(msg.snapshot.tick).toBeDefined();
    expect(msg.snapshot.primitives).toBeDefined();
    expect(msg.snapshot.players).toBeDefined();
  });
});

describe('S15 P2 — ClientSync', () => {
  it('accepts the first snapshot (seq > 0)', () => {
    const w = makeWorld(0);
    const c = new ClientSync();
    const accepted = c.receive(mkSnapMsg(1, netSnapshot(w)), 0);
    expect(accepted).toBe(true);
    expect(c.lastSnapshotSeq()).toBe(1);
  });

  it('rejects out-of-order (lower seq) snapshot', () => {
    const w = makeWorld(0);
    const c = new ClientSync();
    c.receive(mkSnapMsg(5, netSnapshot(w)), 0);
    const accepted = c.receive(mkSnapMsg(3, netSnapshot(w)), 1);
    expect(accepted).toBe(false);
    expect(c.lastSnapshotSeq()).toBe(5); // unchanged
  });

  it('rejects duplicate seq', () => {
    const w = makeWorld(0);
    const c = new ClientSync();
    c.receive(mkSnapMsg(1, netSnapshot(w)), 0);
    const accepted = c.receive(mkSnapMsg(1, netSnapshot(w)), 1);
    expect(accepted).toBe(false);
  });

  it('intentSeq increments monotonically via wrapIntent', () => {
    // S42 — END_TURN action removed; use UPDATE_AVATAR_POS as a representative
    // GameAction for wrapping-semantics testing (the action shape doesn't
    // matter to wrapIntent — it only attaches the seq).
    const c = new ClientSync();
    const env1 = c.wrapIntent({ type: 'UPDATE_AVATAR_POS', playerId: asPlayerId(0), pos: { x: 0, y: 0 } });
    const env2 = c.wrapIntent({ type: 'UPDATE_AVATAR_POS', playerId: asPlayerId(0), pos: { x: 0, y: 0 } });
    expect(env1.kind).toBe('INTENT');
    expect(env1.intentSeq).toBe(1);
    expect(env2.intentSeq).toBe(2);
  });

  it('reset() clears all state', () => {
    const w = makeWorld(0);
    const c = new ClientSync();
    c.receive(mkSnapMsg(7, netSnapshot(w)), 0);
    c.wrapIntent({ type: 'UPDATE_AVATAR_POS', playerId: asPlayerId(0), pos: { x: 0, y: 0 } });
    c.reset();
    expect(c.lastSnapshotSeq()).toBe(0);
    // Post-reset, a new low seq should be accepted (no stale state).
    expect(c.receive(mkSnapMsg(1, netSnapshot(w)), 1)).toBe(true);
  });
});

describe('S15 P2 — lerp01', () => {
  it('returns 0 for negative input', () => {
    expect(lerp01(-0.5)).toBe(0);
  });
  it('returns 1 for > 1 input', () => {
    expect(lerp01(1.5)).toBe(1);
  });
  it('passes through values in [0, 1]', () => {
    expect(lerp01(0)).toBe(0);
    expect(lerp01(0.5)).toBe(0.5);
    expect(lerp01(1)).toBe(1);
  });
  it('returns 0 for NaN / Infinity (defensive)', () => {
    expect(lerp01(NaN)).toBe(0);
    expect(lerp01(Infinity)).toBe(1);
    expect(lerp01(-Infinity)).toBe(0);
  });
});

describe('S35 P0 — joiner bootstrap (1v1 join deadlock regression)', () => {
  // Regression coverage for the S35 P0 fix at main.ts:onJoinAttempt.
  //
  // Bug (existed since S15 commit add497f): main.ts:onJoinAttempt did not
  // set world.gameMode='1v1' on the joiner. The render-loop client-
  // interpolation gate at main.ts's `if (world.gameMode === '1v1' && ...)`
  // is the only path that calls clientSync.interpolateInto, and that's the
  // only path that runs applyNetSnapshot. So host's NETSNAPSHOT (which
  // carries gameMode='1v1' + gameState='PLAYING') was received but never
  // applied — joiner stayed in LOBBY forever.
  //
  // This test cannot exercise the main.ts:765 gate directly (inline in a
  // Pixi ticker callback). It exercises the next-best invariant: given the
  // joiner state setup post-fix (isHost=false + gameMode='1v1' + clientSync
  // wired), receiving and applying a real host-emitted snapshot DOES
  // transition the client world to PLAYING/1v1. The host snapshot is
  // generated via the real applyStartGame reducer to keep the wire payload
  // byte-faithful to production. No Trystero mocking — pure in-memory.
  it('mirror onJoinAttempt state → real host snapshot apply transitions client to PLAYING/1v1', () => {
    // Host world: real applyStartGame produces the same snapshot a host would
    // emit immediately after onBeginMatch.
    const hostWorld = makeWorld(0);
    dispatch(hostWorld, { type: 'START_GAME', mode: '1v1', isHost: true });
    expect(hostWorld.gameState).toBe('PLAYING');
    expect(hostWorld.gameMode).toBe('1v1');

    // Client world: mirror the joiner state shape post-onJoinAttempt POST-FIX.
    // Pre-fix this test fixture would have left gameMode='solo'; with the fix,
    // main.ts explicitly sets gameMode='1v1' here. (We don't run main.ts; we
    // assert the post-fix joiner state shape is sufficient to apply a snapshot.)
    const clientWorld = makeWorld(0);
    clientWorld.isHost = false;
    clientWorld.gameMode = '1v1';
    clientWorld.gameState = 'LOBBY';

    // Wire the same path main.ts uses: HostSync.buildSnapshotMessage on host,
    // ClientSync.receive then ClientSync.interpolateInto on client.
    const host = new HostSync();
    const client = new ClientSync();
    const msg = host.buildSnapshotMessage(hostWorld);
    expect(msg.kind).toBe('NETSNAPSHOT');
    expect(msg.snapshot.gameState).toBe('PLAYING');
    expect(msg.snapshot.gameMode).toBe('1v1');

    const accepted = client.receive(msg, 1000);
    expect(accepted).toBe(true);

    // First interpolateInto call: needsFullApply=true → applyNetSnapshot runs.
    // No prev snapshot yet so position-lerp early-returns (sync.ts:95). The
    // non-position state (gameState, gameMode, currentPlayerId, players,
    // scoreByPlayer) is snapped to current.
    client.interpolateInto(clientWorld, 1000, 100);

    // Client world has transitioned: LOBBY → PLAYING, solo → 1v1.
    expect(clientWorld.gameState).toBe('PLAYING');
    expect(clientWorld.gameMode).toBe('1v1');
    // applyStartGame on a 1v1 host always seats P2 (gameMode.ts:73-83), and
    // the snapshot serializes both players, so the client should mirror both.
    expect(clientWorld.players.has(asPlayerId(0))).toBe(true);
    expect(clientWorld.players.has(asPlayerId(1))).toBe(true);
  });

  it('joiner stays in LOBBY when interpolateInto is never called (pre-fix repro semantics)', () => {
    // Documentation test: without the gate ever opening, clientSync.receive
    // alone does NOT mutate world. This is what was happening pre-fix —
    // receive() was called by the netTransport.on handler, but interpolateInto
    // was never called because the main.ts:765 gate required gameMode='1v1'
    // which was never set. We model that pre-fix state here and assert the
    // client world stays in LOBBY.
    const hostWorld = makeWorld(0);
    dispatch(hostWorld, { type: 'START_GAME', mode: '1v1', isHost: true });

    const clientWorld = makeWorld(0);
    clientWorld.isHost = false;
    // INTENTIONALLY left at 'solo' to model the PRE-FIX state.
    clientWorld.gameState = 'LOBBY';

    const host = new HostSync();
    const client = new ClientSync();
    client.receive(host.buildSnapshotMessage(hostWorld), 1000);

    // interpolateInto deliberately NOT called — pre-fix main.ts:765 gate would
    // have been false on this state.
    expect(clientWorld.gameState).toBe('LOBBY'); // stuck — the bug.
    expect(clientWorld.gameMode).toBe('solo');   // never updated.
  });
});

// S39 P1 — direct lobby-exit signal. Verifies that a peer can transition out
// of LOBBY via the dedicated START_GAME_SIGNAL envelope WITHOUT receiving any
// NETSNAPSHOT. Replicates the main.ts:onJoinAttempt handler logic in-memory.
// This guards against regressions of the S35 P0 fix + the S38 audit's three
// silent-drop modes on the snapshot path (strict schemaVersion, parseNetMessage
// null, applyNetSnapshot throw): even if all three suppress the first snapshot,
// the signal alone is sufficient to enter PLAYING.
describe('S39 P1 — START_GAME_SIGNAL direct lobby-exit (snapshot-independent)', () => {
  it('peer dispatching local START_GAME on receipt transitions to PLAYING/1v1 without any snapshot', () => {
    // Mirror joiner state post-onJoinAttempt: gameMode='1v1', gameState='LOBBY',
    // isHost=false. NO snapshot received yet (clientSync.currentSnap=null).
    const clientWorld = makeWorld(0);
    clientWorld.isHost = false;
    clientWorld.gameMode = '1v1';
    clientWorld.gameState = 'LOBBY';

    // Simulate the wire envelope handler from main.ts:netTransport.on. Real
    // production code lives in-line in main.ts; we exercise the SAME dispatch
    // call shape here to catch regressions where the handler is removed or
    // the action shape changes.
    const signal = { kind: 'START_GAME_SIGNAL', mode: '1v1' as const };
    if (signal.kind === 'START_GAME_SIGNAL') {
      dispatch(clientWorld, { type: 'START_GAME', mode: signal.mode, isHost: false });
    }

    // Peer is now in PLAYING. Subsequent NETSNAPSHOTs will reconcile authoritative
    // state (positions, scores, currentPlayerId) — but the lobby-exit no longer
    // depends on snapshot delivery succeeding.
    expect(clientWorld.gameState).toBe('PLAYING');
    expect(clientWorld.gameMode).toBe('1v1');
    expect(clientWorld.isHost).toBe(false); // peer never claims host authority.
    // applyStartGame in 1v1 mode seats P2 at the spawner rim (gameMode.ts:73-83).
    expect(clientWorld.players.has(asPlayerId(1))).toBe(true);
  });

  it('signal followed by snapshot is idempotent — snapshot reconciles state without regressing gameState', () => {
    // Realistic flow: host sends START_GAME_SIGNAL, ~100ms later first NETSNAPSHOT
    // arrives. Peer should stay in PLAYING, with snapshot data reconciling positions.
    const hostWorld = makeWorld(0);
    dispatch(hostWorld, { type: 'START_GAME', mode: '1v1', isHost: true });

    const clientWorld = makeWorld(0);
    clientWorld.isHost = false;
    clientWorld.gameMode = '1v1';
    clientWorld.gameState = 'LOBBY';

    // Step 1: signal arrives → peer enters PLAYING.
    dispatch(clientWorld, { type: 'START_GAME', mode: '1v1', isHost: false });
    expect(clientWorld.gameState).toBe('PLAYING');

    // Step 2: first snapshot arrives → ClientSync applies authoritative state.
    const host = new HostSync();
    const client = new ClientSync();
    const msg = host.buildSnapshotMessage(hostWorld);
    client.receive(msg, 1000);
    client.interpolateInto(clientWorld, 1000, 100);

    // Still PLAYING, both players seated, no applyNetSnapshot errors.
    expect(clientWorld.gameState).toBe('PLAYING');
    expect(clientWorld.gameMode).toBe('1v1');
    expect(clientWorld.players.has(asPlayerId(0))).toBe(true);
    expect(clientWorld.players.has(asPlayerId(1))).toBe(true);
    expect(client.applyErrors()).toBe(0);
  });

  it('applyErrors() counter increments when applyNetSnapshot throws (visible-to-lobby diagnostic)', () => {
    // Construct a snapshot whose internal shape will cause applyNetSnapshot to
    // throw. The cheapest route: pass a NetSnapshotMsg whose payload has a
    // legal-at-parse schemaVersion=1 but an invalid downstream field (a bond
    // referencing a missing primitive triggers save.ts:applySnapshotCore throw
    // via `bond X references missing primitive Y`).
    const clientWorld = makeWorld(0);
    clientWorld.isHost = false;
    clientWorld.gameMode = '1v1';
    clientWorld.gameState = 'LOBBY';

    const client = new ClientSync();
    // Hand-craft a snapshot with a dangling bond reference — passes wire parse,
    // throws inside applySnapshotCore. We bypass parseNetMessage here because
    // the validator's structural checks DON'T include cross-reference integrity
    // (defense-in-depth is the runtime catch at sync.ts:107-116).
    const badMsg = {
      kind: 'NETSNAPSHOT' as const,
      snapshotSeq: 1,
      snapshot: {
        schemaVersion: 1 as const,
        tick: 0,
        gameState: 'PLAYING' as const,
        gameMode: '1v1' as const,
        // S42 — currentPlayerId removed from new wire payloads (turn-based
        // deleted). The slot remains optional on WorldSnapshot for save
        // back-compat but isn't required for new fixtures.
        scoreProgress: 0,
        lastWinnerId: null,
        scoreByPlayer: [],
        primitives: [],
        bonds: [
          {
            id: 'b-missing' as never,
            aId: 'p-nope-1' as never,
            bId: 'p-nope-2' as never,
            stiffnessTier: 'rigid',
            restLength: 50,
            createdTick: 0,
          },
        ],
        freeSparks: [],
        players: [],
      },
    } as unknown as NetSnapshotMsg;
    client.receive(badMsg, 1000);
    expect(client.applyErrors()).toBe(0); // not yet — counter increments inside interpolateInto.
    client.interpolateInto(clientWorld, 1000, 100);
    expect(client.applyErrors()).toBe(1); // diagnostic surfaces the throw.
    // Note: applySnapshotCore mutates world.gameState early (save.ts:352)
    // before the bond cross-reference check that throws (save.ts:451). Partial
    // mutation is acceptable — `needsFullApply` stays true so the next snapshot
    // (when host re-emits with consistent shape) fully re-applies and reconciles.
    // The behavior under test is the COUNTER + LOG, not roll-back semantics.

    // Second call without a new snapshot retries the apply (still throws → counter++).
    client.interpolateInto(clientWorld, 1000, 100);
    expect(client.applyErrors()).toBe(2);
  });
});

// S37 P10 — empirical guard that joiner derives the SAME sprite frame as host
// across all 4 Voltkin FSM states + every form-swap boundary. S36 P3 added
// killCount to SerializedCreature (additive-optional wire field); this suite
// asserts that the trimmed render-only payload + deserializeCreature defaults
// reconstruct a creature shape where `currentFrameKey(state, ticksInState,
// killCount)` returns the same key on both sides — the visible animation
// stays locked between peers regardless of snapshot latency.
//
// Council R1 D3 (ADDED-Gemini): also include drain-parity for CREATURE_CHARGE
// so the host's wind-up audio cue surfaces in client.world.effects post-apply
// and the joiner's `drainAudioEffects` fires `playChargeSFX` locally with
// matching tick + pos. Together: visual + audio parity end-to-end across the
// wire for the new Voltkin animation+audio surface.
describe('S37 P10 — NetSnapshot v2 frame-derivation parity', () => {
  function setupHostWithCreature(opts: {
    state: CreatureState;
    ticksInState: number;
    killCount?: number;
  }): { host: ReturnType<typeof makeWorld>; creatureId: CreatureId } {
    const host = makeWorld(0);
    const id = asCreatureId(0);
    host.creatures.set(id, {
      id,
      type: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 100, y: 100 },
      prevPos: { x: 100, y: 100 },
      targetPos: { x: 200, y: 200 },
      targetBondId: null,
      state: opts.state,
      ticksInState: opts.ticksInState,
      killCount: opts.killCount ?? 0,
      spawnedAtTick: 0,
      despawnAtTick: 480,
    });
    return { host, creatureId: id };
  }

  function assertFrameParity(
    opts: { state: CreatureState; ticksInState: number; killCount?: number },
    expectedFrame: VoltkinFrameKey,
  ): void {
    const { host, creatureId } = setupHostWithCreature(opts);
    const snap = netSnapshot(host);
    const client = makeWorld(0);
    applyNetSnapshot(snap, client);

    const hostC = host.creatures.get(creatureId)!;
    const clientC = client.creatures.get(creatureId)!;

    // 1. Wire-faithful state replication (SerializedCreature shape).
    expect(clientC.state).toBe(hostC.state);
    expect(clientC.ticksInState).toBe(hostC.ticksInState);
    expect(clientC.killCount).toBe(hostC.killCount);

    // 2. Frame derivation matches on both sides AND matches the expected key.
    const hostFrame = currentFrameKey(hostC.state, hostC.ticksInState, hostC.killCount);
    const clientFrame = currentFrameKey(clientC.state, clientC.ticksInState, clientC.killCount);
    expect(hostFrame).toBe(expectedFrame);
    expect(clientFrame).toBe(expectedFrame);
  }

  // SPAWNING state — lion→chibi morph at t=30
  it.each([
    { t: 0, expected: 'zap' as const },
    { t: 29, expected: 'zap' as const },
    { t: 30, expected: 'idle1' as const }, // morph boundary
    { t: 59, expected: 'idle1' as const },
  ])('SPAWNING t=$t derives $expected on both host and client', ({ t, expected }) => {
    assertFrameParity({ state: 'SPAWNING', ticksInState: t }, expected);
  });

  // SEEKING state — idle1↔idle2 alternation every IDLE_CYCLE_TICKS=60
  it.each([
    { t: 0, expected: 'idle1' as const },
    { t: 59, expected: 'idle1' as const },
    { t: 60, expected: 'idle2' as const }, // alternation boundary
    { t: 119, expected: 'idle2' as const },
    { t: 120, expected: 'idle1' as const }, // cycle restart
  ])('SEEKING t=$t derives $expected on both host and client', ({ t, expected }) => {
    assertFrameParity({ state: 'SEEKING', ticksInState: t }, expected);
  });

  // ATTACKING state — chibi (0..14) → lion charge (15..29) → zap (30) →
  // lion charge (31..44) → chibi (45..59). Form-swap boundaries: t=15, t=45.
  // FIRE moment: t=30 (single-tick zap frame).
  it.each([
    { t: 0, expected: 'idle1' as const },
    { t: 14, expected: 'idle1' as const }, // last chibi tick pre-windup
    { t: 15, expected: 'charge' as const }, // ENGAGE — lion materializes
    { t: 29, expected: 'charge' as const },
    { t: 30, expected: 'zap' as const }, // FIRE — single tick
    { t: 31, expected: 'charge' as const },
    { t: 44, expected: 'charge' as const }, // last lion tick post-FIRE
    { t: 45, expected: 'idle1' as const }, // RELEASE — chibi cooldown
    { t: 59, expected: 'idle1' as const },
  ])('ATTACKING t=$t derives $expected on both host and client', ({ t, expected }) => {
    assertFrameParity({ state: 'ATTACKING', ticksInState: t }, expected);
  });

  // DESPAWNING state — killCount discriminator (S36 P3 added killCount to
  // SerializedCreature). The whole point of P3's additive-optional wire
  // field was to keep this branch in sync between peers.
  it.each([
    { kc: 0, expected: 'hurt' as const }, // never landed an attack — sad fade
    { kc: 1, expected: 'victory' as const }, // landed at least one — triumphant
    { kc: 5, expected: 'victory' as const }, // multi-kill — still victory
  ])('DESPAWNING killCount=$kc derives $expected on both', ({ kc, expected }) => {
    assertFrameParity({ state: 'DESPAWNING', ticksInState: 30, killCount: kc }, expected);
  });

  it('killCount field is wire-byte-faithful via additive-optional semantics (omitted when 0, present when > 0)', () => {
    // Implicit: assertFrameParity above asserts clientC.killCount === hostC.killCount
    // across kc=0 (wire-omits the field; deserializeCreature defaults to 0) and
    // kc=1/5 (wire serializes the value). This guard test makes the contract explicit.
    const { host: host0, creatureId: id0 } = setupHostWithCreature({
      state: 'DESPAWNING', ticksInState: 30, killCount: 0,
    });
    const snap0 = netSnapshot(host0);
    expect(snap0.creatures?.[0].killCount).toBeUndefined();

    const { host: host3, creatureId: id3 } = setupHostWithCreature({
      state: 'DESPAWNING', ticksInState: 30, killCount: 3,
    });
    const snap3 = netSnapshot(host3);
    expect(snap3.creatures?.[0].killCount).toBe(3);

    // Both round-trip cleanly to the matching client value.
    const c0 = makeWorld(0);
    applyNetSnapshot(snap0, c0);
    expect(c0.creatures.get(id0)?.killCount).toBe(0);

    const c3 = makeWorld(0);
    applyNetSnapshot(snap3, c3);
    expect(c3.creatures.get(id3)?.killCount).toBe(3);
  });
});

// S37 P10 — Council R1 D3 ADDED-Gemini scope: in addition to frame-derivation
// parity, the new CREATURE_CHARGE GameEffect must survive the NetSnapshot
// wire so the joiner's `drainAudioEffects` fires `playChargeSFX` with the
// same tick + pos as host's. This closes the audio half of the multiplayer
// animation+audio surface (visual half above; audio half here).
describe('S37 P10 — NetSnapshot drain-parity for CREATURE_CHARGE', () => {
  it('host CREATURE_CHARGE in effects → client.world.effects has identical entry post-applyNetSnapshot', () => {
    const host = makeWorld(0);
    host.tick = 50;
    host.effects.push({
      kind: 'CREATURE_CHARGE',
      tick: 50,
      pos: { x: 75, y: 125 },
    });

    const client = makeWorld(0);
    expect(client.effects.length).toBe(0);

    const snap = netSnapshot(host);
    applyNetSnapshot(snap, client);

    expect(client.effects.length).toBe(1);
    const e = client.effects[0];
    expect(e.kind).toBe('CREATURE_CHARGE');
    if (e.kind === 'CREATURE_CHARGE') {
      expect(e.tick).toBe(50);
      expect(e.pos).toEqual({ x: 75, y: 125 });
    }
  });

  it('multiple CREATURE_CHARGE effects (polyphony) all round-trip via NetSnapshot', () => {
    const host = makeWorld(0);
    host.tick = 100;
    host.effects.push(
      { kind: 'CREATURE_CHARGE', tick: 100, pos: { x: 10, y: 10 } },
      { kind: 'CREATURE_CHARGE', tick: 100, pos: { x: 90, y: 90 } },
    );

    const client = makeWorld(0);
    const snap = netSnapshot(host);
    applyNetSnapshot(snap, client);

    const charges = client.effects.filter((e) => e.kind === 'CREATURE_CHARGE');
    expect(charges.length).toBe(2);
    const positions = charges
      .map((e) => (e.kind === 'CREATURE_CHARGE' ? e.pos : null))
      .filter((p): p is { x: number; y: number } => p !== null);
    expect(positions).toContainEqual({ x: 10, y: 10 });
    expect(positions).toContainEqual({ x: 90, y: 90 });
  });

  it('CREATURE_CHARGE coexists with ARC_FLASH + BOND_SEVERED on the wire (FIRE-tick lightning trio)', () => {
    // At ATTACKING FIRE tick (t=30): CHARGE just ended (~16 ms earlier),
    // ARC_FLASH visual emits, BOND_SEVERED cause='creature' triggers
    // lightning-crackle audio. All three must reach the joiner cleanly.
    const host = makeWorld(0);
    host.tick = 30;
    host.effects.push(
      { kind: 'ARC_FLASH', tick: 30, start: { x: 50, y: 50 }, end: { x: 200, y: 200 } },
      { kind: 'BOND_SEVERED', tick: 30, pos: { x: 200, y: 200 }, cause: 'creature' },
    );
    // The CHARGE at t=15 is still in the queue (tick < EFFECT_LIFETIME_TICKS=36)
    host.effects.unshift({ kind: 'CREATURE_CHARGE', tick: 15, pos: { x: 50, y: 50 } });

    const client = makeWorld(0);
    const snap = netSnapshot(host);
    applyNetSnapshot(snap, client);

    expect(client.effects.length).toBe(3);
    const kinds = client.effects.map((e) => e.kind).sort();
    expect(kinds).toEqual(['ARC_FLASH', 'BOND_SEVERED', 'CREATURE_CHARGE']);
  });
});

describe('S15 P2 — interpolatePositions', () => {
  it('at t=0 the world matches prev snapshot positions', () => {
    // Build a fixture: world with one primitive at current snap pos (50,50);
    // prev snap had the same primitive at (10,10). interpolate t=0 → world pos = (10,10).
    const w = makeWorld(0);
    // Synthesize prev and current snapshots with identical structure +
    // different positions. Use the public makeWorld + manual state.
    const curr = netSnapshot(w);
    // Inject one primitive into both snaps for interpolation testing.
    const primId = 99 as never;
    const primEntry = {
      id: primId,
      type: 0,
      placerColor: 0xff3b6b,
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 50, y: 50 },
      prevPos: { x: 50, y: 50 },
      bonds: [],
      ownerColor: 0xff3b6b,
      lastOwnershipChange: 0,
      radius: 8,
    };
    const prevEntry = { ...primEntry, pos: { x: 10, y: 10 } };
    const prev = { ...curr, primitives: [prevEntry as never] };
    const current = { ...curr, primitives: [primEntry as never] };
    // World needs a primitive instance to mutate.
    w.primitives.set(primId, {
      id: primId,
      type: 0 as never,
      placerColor: 0xff3b6b,
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 50, y: 50 },
      prevPos: { x: 50, y: 50 },
      bonds: new Set(),
      ownerColor: 0xff3b6b,
      lastOwnershipChange: 0,
      radius: 8,
    });
    interpolatePositions(prev, current, 0, w);
    expect(w.primitives.get(primId)!.pos).toEqual({ x: 10, y: 10 });
  });

  it('at t=1 the world matches current snapshot positions', () => {
    const w = makeWorld(0);
    const baseSnap = netSnapshot(w);
    const primId = 99 as never;
    const primCurr = {
      id: primId,
      type: 0,
      placerColor: 0xff3b6b,
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 100, y: 100 },
      prevPos: { x: 100, y: 100 },
      bonds: [],
      ownerColor: 0xff3b6b,
      lastOwnershipChange: 0,
      radius: 8,
    };
    const primPrev = { ...primCurr, pos: { x: 0, y: 0 } };
    const prev = { ...baseSnap, primitives: [primPrev as never] };
    const current = { ...baseSnap, primitives: [primCurr as never] };
    w.primitives.set(primId, {
      id: primId,
      type: 0 as never,
      placerColor: 0xff3b6b,
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 0, y: 0 },
      prevPos: { x: 0, y: 0 },
      bonds: new Set(),
      ownerColor: 0xff3b6b,
      lastOwnershipChange: 0,
      radius: 8,
    });
    interpolatePositions(prev, current, 1, w);
    expect(w.primitives.get(primId)!.pos).toEqual({ x: 100, y: 100 });
  });

  it('at t=0.5 the world is the midpoint', () => {
    const w = makeWorld(0);
    const baseSnap = netSnapshot(w);
    const primId = 99 as never;
    const primCurr = {
      id: primId,
      type: 0,
      placerColor: 0xff3b6b,
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 100, y: 200 },
      prevPos: { x: 100, y: 200 },
      bonds: [],
      ownerColor: 0xff3b6b,
      lastOwnershipChange: 0,
      radius: 8,
    };
    const primPrev = { ...primCurr, pos: { x: 0, y: 0 } };
    const prev = { ...baseSnap, primitives: [primPrev as never] };
    const current = { ...baseSnap, primitives: [primCurr as never] };
    w.primitives.set(primId, {
      id: primId,
      type: 0 as never,
      placerColor: 0xff3b6b,
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 0, y: 0 },
      prevPos: { x: 0, y: 0 },
      bonds: new Set(),
      ownerColor: 0xff3b6b,
      lastOwnershipChange: 0,
      radius: 8,
    });
    interpolatePositions(prev, current, 0.5, w);
    expect(w.primitives.get(primId)!.pos).toEqual({ x: 50, y: 100 });
  });
});

describe('S52 P1 Council C4 — interpolatePositions dragLockedSparkId opt-out', () => {
  it('locked spark is NOT lerped; its world.pos retains whatever the caller set', () => {
    const w = makeWorld(0);
    // Plant a free spark in world at (700, 700) — the joiner-side
    // AttractDrag would have moved it here locally.
    const sparkId = asSparkId(42);
    w.freeSparks.set(sparkId, {
      id: sparkId,
      type: SparkType.Dot,
      pos: { x: 700, y: 700 },
      prevPos: { x: 700, y: 700 },
      state: { kind: 'Free' },
      radius: 8,
      createdTick: 0,
    });
    // Snapshots say the spark is moving from (100,100) at prev to (200,200)
    // at current — without the lock, interpolatePositions at t=0.5 would
    // overwrite spark.pos to (150,150).
    const baseSnap = netSnapshot(w);
    const prev: NetSnapshot = {
      ...baseSnap,
      freeSparks: [{
        id: sparkId,
        type: SparkType.Dot,
        pos: { x: 100, y: 100 },
        prevPos: { x: 100, y: 100 },
        state: { kind: 'Free' },
        radius: 8,
        createdTick: 0,
      }],
    };
    const current: NetSnapshot = {
      ...baseSnap,
      freeSparks: [{
        id: sparkId,
        type: SparkType.Dot,
        pos: { x: 200, y: 200 },
        prevPos: { x: 200, y: 200 },
        state: { kind: 'Free' },
        radius: 8,
        createdTick: 0,
      }],
    };

    // Without lock — spark gets lerped to (150,150).
    interpolatePositions(prev, current, 0.5, w);
    expect(w.freeSparks.get(sparkId)!.pos).toEqual({ x: 150, y: 150 });

    // Restore local-drag-position; now lock and lerp again.
    w.freeSparks.get(sparkId)!.pos = { x: 700, y: 700 };
    interpolatePositions(prev, current, 0.5, w, sparkId);
    // Locked → world.pos unchanged.
    expect(w.freeSparks.get(sparkId)!.pos).toEqual({ x: 700, y: 700 });
  });

  it('unlocked sparks (different ids) still lerp when dragLock is set', () => {
    const w = makeWorld(0);
    const lockedId = asSparkId(42);
    const unlockedId = asSparkId(43);
    w.freeSparks.set(lockedId, {
      id: lockedId,
      type: SparkType.Dot,
      pos: { x: 700, y: 700 },
      prevPos: { x: 700, y: 700 },
      state: { kind: 'Free' },
      radius: 8,
      createdTick: 0,
    });
    w.freeSparks.set(unlockedId, {
      id: unlockedId,
      type: SparkType.Dot,
      pos: { x: 0, y: 0 },
      prevPos: { x: 0, y: 0 },
      state: { kind: 'Free' },
      radius: 8,
      createdTick: 0,
    });
    const baseSnap = netSnapshot(w);
    const mkSpark = (id: typeof lockedId, pos: { x: number; y: number }) => ({
      id,
      type: SparkType.Dot,
      pos,
      prevPos: pos,
      state: { kind: 'Free' as const },
      radius: 8,
      createdTick: 0,
    });
    const prev: NetSnapshot = {
      ...baseSnap,
      freeSparks: [
        mkSpark(lockedId, { x: 100, y: 100 }),
        mkSpark(unlockedId, { x: 100, y: 100 }),
      ],
    };
    const current: NetSnapshot = {
      ...baseSnap,
      freeSparks: [
        mkSpark(lockedId, { x: 200, y: 200 }),
        mkSpark(unlockedId, { x: 200, y: 200 }),
      ],
    };

    interpolatePositions(prev, current, 0.5, w, lockedId);
    // locked unchanged
    expect(w.freeSparks.get(lockedId)!.pos).toEqual({ x: 700, y: 700 });
    // unlocked still lerped
    expect(w.freeSparks.get(unlockedId)!.pos).toEqual({ x: 150, y: 150 });
  });
});

describe('S56 P1 — interpolateInto preserves the drag-locked spark across snapshot rebuild (GAP 2)', () => {
  // The S52 dragLock above only opts the spark out of the position LERP
  // (interpolatePositions). It does NOT shield applyNetSnapshot/applySnapshotCore,
  // which does world.freeSparks.clear() + rebuild-each-spark-as-a-new-object-at-
  // snapshot-pos on every needsFullApply. Without S56's preserve/restore, the
  // joiner's locally-predicted dragged spark is reset to its host-authoritative
  // spawn pos on every snapshot (10Hz) → sawtooth jitter. These tests pin the
  // preserve/restore + the Council-mandated interruption guards (spark absent /
  // no longer Free → no throw, no stale restore).
  const SPARK = asSparkId(42);
  const SPAWN = { x: 960, y: 540 };   // host-authoritative spawn pos
  const DRAGGED = { x: 300, y: 200 }; // where the client's local prediction moved it

  function seed(): { host: ReturnType<typeof makeWorld>; client: ReturnType<typeof makeWorld>; c: ClientSync } {
    const host = makeWorld(0);
    host.freeSparks.set(SPARK, {
      id: SPARK,
      type: SparkType.Dot,
      pos: { ...SPAWN },
      prevPos: { ...SPAWN },
      state: { kind: 'Free' },
      radius: 8,
      createdTick: 0,
    });
    const client = makeWorld(0);
    const c = new ClientSync();
    // Apply the first snapshot so the client world holds the spark at spawn.
    c.receive(mkSnapMsg(1, netSnapshot(host)), 0);
    c.interpolateInto(client, 0, 100); // first apply, no lerp (prevSnap null)
    return { host, client, c };
  }

  it('keeps the predicted pos when a fresh snapshot would otherwise reset it to spawn', () => {
    const { host, client, c } = seed();
    // Local prediction (applyPerSubstep on the client) moved it off spawn.
    client.freeSparks.get(SPARK)!.pos = { ...DRAGGED };
    client.freeSparks.get(SPARK)!.prevPos = { ...DRAGGED };
    // Host emits another snapshot — spark STILL at spawn (host can't see the drag).
    c.receive(mkSnapMsg(2, netSnapshot(host)), 16);
    c.interpolateInto(client, 16, 100, SPARK); // dragLock set
    expect(client.freeSparks.get(SPARK)!.pos).toEqual(DRAGGED);
    expect(client.freeSparks.get(SPARK)!.prevPos).toEqual(DRAGGED);
  });

  it('WITHOUT the dragLock, the same snapshot resets the spark to spawn (witnesses the bug)', () => {
    const { host, client, c } = seed();
    client.freeSparks.get(SPARK)!.pos = { ...DRAGGED };
    c.receive(mkSnapMsg(2, netSnapshot(host)), 16);
    c.interpolateInto(client, 16, 100); // no dragLock → not shielded
    expect(client.freeSparks.get(SPARK)!.pos).toEqual(SPAWN);
  });

  it('does not throw and ends the drag when the locked spark is ABSENT from the new snapshot (host despawn)', () => {
    const { host, client, c } = seed();
    client.freeSparks.get(SPARK)!.pos = { ...DRAGGED };
    host.freeSparks.delete(SPARK); // host despawned it (free-spark cap)
    c.receive(mkSnapMsg(2, netSnapshot(host)), 16);
    expect(() => c.interpolateInto(client, 16, 100, SPARK)).not.toThrow();
    // Gone from the client world too → the next applyPerSubstep null-check ends the drag.
    expect(client.freeSparks.has(SPARK)).toBe(false);
  });

  it('does not restore (and does not throw) when the spark is grabbed by the OPPONENT in the new snapshot', () => {
    const { host, client, c } = seed();
    // client.localPlayerId is 0 (makeWorld default); the OPPONENT is player 1.
    client.freeSparks.get(SPARK)!.pos = { ...DRAGGED };
    host.freeSparks.get(SPARK)!.state = { kind: 'Carried', carrierId: asPlayerId(1) };
    c.receive(mkSnapMsg(2, netSnapshot(host)), 16);
    expect(() => c.interpolateInto(client, 16, 100, SPARK)).not.toThrow();
    const s = client.freeSparks.get(SPARK)!;
    expect(s.state.kind).toBe('Carried');
    // Carried by opponent → restore skipped → authoritative pos wins. The next
    // controls.applyPerSubstep `mine` guard then ends the local drag (race lost).
    expect(s.pos).toEqual(SPAWN);
  });

  it('S58 (#2) — DOES preserve the predicted pos when the spark is Carried by the LOCAL player (claim)', () => {
    const { host, client, c } = seed();
    // The LMB-down claim: spark is now Carried by the local player (id 0). The
    // joiner keeps driving its predicted drag pos; without preserving the
    // Carried-by-me case it would sawtooth back to the host's 10Hz-stale pos.
    client.freeSparks.get(SPARK)!.pos = { ...DRAGGED };
    client.freeSparks.get(SPARK)!.prevPos = { ...DRAGGED };
    host.freeSparks.get(SPARK)!.state = { kind: 'Carried', carrierId: asPlayerId(0) };
    c.receive(mkSnapMsg(2, netSnapshot(host)), 16);
    c.interpolateInto(client, 16, 100, SPARK); // dragLock set, spark Carried by me
    const s = client.freeSparks.get(SPARK)!;
    expect(s.state.kind).toBe('Carried');
    expect(s.pos).toEqual(DRAGGED); // Carried by me → predicted pos preserved
  });
});

describe('Audit Pass 1 e698a17a — interpolateInto guards applyNetSnapshot throw', () => {
  it('swallows applyNetSnapshot throw on bond → missing primitive and leaves needsFullApply=true', () => {
    const w = makeWorld(0);
    const c = new ClientSync();
    const base = netSnapshot(w);
    // Construct an internally-inconsistent snapshot: a bond whose primitiveId
    // is not in the primitives array. applyNetSnapshot throws at save.ts:435
    // ('bond X references missing primitive'). Pre-fix the throw escaped into
    // the render-loop callback; post-fix interpolateInto catches + skips.
    const torn = {
      ...base,
      bonds: [
        { id: 999 as never, aId: 1 as never, bId: 2 as never, restLength: 10, stiffnessTier: 'tier1' as never, createdTick: 0 },
      ],
      primitives: [],
    } as unknown as NetSnapshot;
    c.receive(mkSnapMsg(1, torn), 0);
    // The fix is: interpolateInto MUST NOT throw, even when applyNetSnapshot does.
    expect(() => c.interpolateInto(w, 100, 100)).not.toThrow();
    // Post-failure the cursor stays armed so the next valid snapshot retries.
    c.receive(mkSnapMsg(2, netSnapshot(w)), 100);
    expect(() => c.interpolateInto(w, 200, 100)).not.toThrow();
  });

  it('swallows applyNetSnapshot throw on bad schemaVersion (defense-in-depth)', () => {
    const w = makeWorld(0);
    const c = new ClientSync();
    const base = netSnapshot(w);
    // Even though the wire validator now rejects schemaVersion!=1 (parseNetMessage),
    // ClientSync.receive accepts NetSnapshotMsg objects regardless of where they
    // came from — so a host-side bug or test fixture that bypasses parseNetMessage
    // must still not crash interpolateInto.
    const wrongVersion = { ...base, schemaVersion: 99 } as unknown as NetSnapshot;
    c.receive(mkSnapMsg(1, wrongVersion), 0);
    expect(() => c.interpolateInto(w, 100, 100)).not.toThrow();
  });
});
