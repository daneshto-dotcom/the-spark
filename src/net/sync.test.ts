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
import { netSnapshot, type NetSnapshot } from '../state/save.ts';
import type { NetSnapshotMsg } from './protocol.ts';
import { asPlayerId } from '../types.ts';

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
    const c = new ClientSync();
    const env1 = c.wrapIntent({ type: 'END_TURN' });
    const env2 = c.wrapIntent({ type: 'END_TURN' });
    expect(env1.kind).toBe('INTENT');
    expect(env1.intentSeq).toBe(1);
    expect(env2.intentSeq).toBe(2);
  });

  it('reset() clears all state', () => {
    const w = makeWorld(0);
    const c = new ClientSync();
    c.receive(mkSnapMsg(7, netSnapshot(w)), 0);
    c.wrapIntent({ type: 'END_TURN' });
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
