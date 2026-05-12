import { describe, expect, it } from 'vitest';
import {
  MAX_DISRUPTION_CHARGES,
  PHYSICS_HZ,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SparkType,
} from '../constants.ts';
import { CarryViolation, makeIdlePlayer, tickBuildAction } from '../game/player.ts';
import { makeFreeSpark, type Spark } from '../game/spark.ts';
import { asPlayerId, asSparkId, type PlayerId } from '../types.ts';
import { dispatch, makeWorld } from './world.ts';
import { snapshot, restore } from './save.ts';

const DT = 1 / PHYSICS_HZ;
const P1 = asPlayerId(0);

function spawnTestSpark(id: number): Spark {
  return makeFreeSpark({
    id: asSparkId(id),
    type: SparkType.Dot,
    pos: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    dt: DT,
    createdTick: 0,
  });
}

describe('world dispatch seam (§ 10.2)', () => {
  it('SPAWN_SPARK adds the spark to freeSparks', () => {
    const w = makeWorld(0);
    const s = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    expect(w.freeSparks.size).toBe(1);
    expect(w.freeSparks.get(s.id)).toBe(s);
  });

  it('PICKUP_SPARK transitions player Idle → Carrying and marks spark Carried', () => {
    const w = makeWorld(0);
    const s = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    const player = w.players.get(P1)!;
    expect(player.kind).toBe('Carrying');
    expect(s.state.kind).toBe('Carried');
  });

  it('double-PICKUP_SPARK throws CarryViolation', () => {
    const w = makeWorld(0);
    const a = spawnTestSpark(0);
    const b = spawnTestSpark(1);
    dispatch(w, { type: 'SPAWN_SPARK', spark: a });
    dispatch(w, { type: 'SPAWN_SPARK', spark: b });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: a.id, playerId: P1 });
    expect(() =>
      dispatch(w, { type: 'PICKUP_SPARK', sparkId: b.id, playerId: P1 }),
    ).toThrow(CarryViolation);
  });

  it('DROP_SPARK returns spark to Free state at the dropped position', () => {
    const w = makeWorld(0);
    const s = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    dispatch(w, { type: 'DROP_SPARK', playerId: P1, pos: { x: 500, y: 500 } });
    expect(s.state.kind).toBe('Free');
    expect(s.pos.x).toBe(500);
    expect(s.pos.y).toBe(500);
    expect(w.players.get(P1)!.kind).toBe('Idle');
  });

  it('PLACE_PRIMITIVE without target creates an anchor primitive (no bond)', () => {
    const w = makeWorld(0);
    const s = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    expect(w.primitives.size).toBe(1);
    expect(w.bonds.size).toBe(0);
    expect(w.freeSparks.size).toBe(0);
    expect(w.players.get(P1)!.kind).toBe('Idle');
  });

  it('PLACE_PRIMITIVE with target creates a primitive AND a bond linking adjacency', () => {
    const w = makeWorld(0);
    // Anchor.
    const s1 = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s1 });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s1.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    const anchorId = [...w.primitives.keys()][0];

    // Second primitive bonded to anchor.
    const s2 = spawnTestSpark(1);
    s2.pos.x = 300;
    s2.pos.y = 300;
    dispatch(w, { type: 'SPAWN_SPARK', spark: s2 });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s2.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: anchorId,
      stiffnessTier: 'HIGH',
    });

    expect(w.primitives.size).toBe(2);
    expect(w.bonds.size).toBe(1);
    const bond = [...w.bonds.values()][0];
    expect(bond.stiffnessTier).toBe('HIGH');
    expect(bond.aId === anchorId || bond.bId === anchorId).toBe(true);
    // Adjacency wired on both primitives.
    for (const p of w.primitives.values()) expect(p.bonds.size).toBe(1);
  });

  it('SEVER_BOND removes the bond and clears adjacency', () => {
    const w = makeWorld(0);
    const s1 = spawnTestSpark(0);
    const s2 = spawnTestSpark(1);
    s2.pos.x = 300; s2.pos.y = 300;
    dispatch(w, { type: 'SPAWN_SPARK', spark: s1 });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s1.id, playerId: P1 });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P1, targetPrimitiveId: null, stiffnessTier: 'MID' });
    const anchorId = [...w.primitives.keys()][0];
    dispatch(w, { type: 'SPAWN_SPARK', spark: s2 });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s2.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: anchorId,
      stiffnessTier: 'MID',
    });
    const bondId = [...w.bonds.keys()][0];
    dispatch(w, { type: 'SEVER_BOND', bondId, playerId: asPlayerId(0), cause: 'physics' });
    expect(w.bonds.size).toBe(0);
    for (const p of w.primitives.values()) expect(p.bonds.size).toBe(0);
  });

  it('TICK_ENERGY accrues passive energy at the constant rate (§ XIV.8)', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'TICK_ENERGY', playerId: P1, deltaSec: 1.0 });
    expect(w.players.get(P1)!.energy).toBeCloseTo(5.0, 6);
  });

  it('WIN_TRIGGER flips gameState and records the winner', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'WIN_TRIGGER', winnerId: P1 });
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P1);
  });

  // § IX.5 (v0.5.1) — no building inside the spawner zone.
  it('PLACE_PRIMITIVE inside spawner zone is silently rejected; carry preserved', () => {
    const w = makeWorld(0);
    const s = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, // dead center
      velocity: { x: 0, y: 0 },
      dt: DT,
      createdTick: 0,
    });
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    expect(w.primitives.size).toBe(0);
    expect(w.players.get(P1)!.kind).toBe('Carrying');
  });

  it('PLACE_PRIMITIVE on the ring boundary is allowed', () => {
    const w = makeWorld(0);
    const s = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: SPAWNER_CENTER_X + 250, y: SPAWNER_CENTER_Y }, // exactly on ring
      velocity: { x: 0, y: 0 },
      dt: DT,
      createdTick: 0,
    });
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    expect(w.primitives.size).toBe(1);
    expect(w.players.get(P1)!.kind).toBe('Idle');
  });
});

/* ───────────────────── S17 P1 — Phase-2 §VIII.3 Sever-as-disruption ─────────────────────
 * Cross-player Sever costs 1 disruption charge (§VIII.3 row 1, §VIII.1-2).
 * Auth rule (Council R1 Gemini #3): bond is HOSTILE if EITHER endpoint's
 * placerColor differs from actor.color. Self-sever (both endpoints share
 * actor.color) preserves Phase-1 §VIII.4 zero-cost path. PRIME-AUDIT B:
 * cycle-bond sever (severSplit returns empty del) does NOT consume charge.
 * cause='physics' bypasses both gates (constraint-solver overstretch).
 */

// (S17 P1 helpers imported at top of file alongside Phase-1 imports.)

const P2 = asPlayerId(1);

function setup1v1(): ReturnType<typeof makeWorld> {
  const w = makeWorld(0);
  w.gameMode = '1v1';
  w.gameState = 'PLAYING';
  w.currentPlayerId = P1;
  // P2 — cyan, spawner-rim right (matches applyStartGame init).
  const p2 = makeIdlePlayer(P2, PLAYER_COLORS[1], {
    x: SPAWNER_CENTER_X + SPAWNER_RADIUS + 40,
    y: SPAWNER_CENTER_Y,
  });
  w.players.set(p2.id, p2);
  w.scoreByPlayer.set(p2.id, 0);
  return w;
}

/** Place an anchor-rooted primitive for `playerId`. Returns the prim id. */
function placeFor(world: ReturnType<typeof makeWorld>, playerId: PlayerId, sparkRawId: number, target: number | null): number {
  const sId = asSparkId(sparkRawId);
  const s = makeFreeSpark({
    id: sId,
    type: SparkType.Dot,
    pos: { x: 200 + sparkRawId * 40, y: 200 + sparkRawId * 8 },
    velocity: { x: 0, y: 0 },
    dt: DT,
    createdTick: world.tick,
  });
  dispatch(world, { type: 'SPAWN_SPARK', spark: s });
  // Toggle currentPlayerId so 1v1 input gate allows the placer.
  const saved = world.currentPlayerId;
  world.currentPlayerId = playerId;
  dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId,
    targetPrimitiveId: target as never,
    stiffnessTier: 'MID',
  });
  world.currentPlayerId = saved;
  world.tick++;
  return [...world.primitives.keys()].at(-1)! as unknown as number;
}

function firstBondId(w: ReturnType<typeof makeWorld>): number {
  return [...w.bonds.keys()][0] as unknown as number;
}

describe('S17 P1 — Phase-2 §VIII.3 cross-player Sever-as-disruption', () => {
  it('cross-player sever consumes 1 charge when actor has >=1', () => {
    const w = setup1v1();
    // P1 builds a chain so P2 has something to sever. P1.color=red, both bond endpoints placerColor=red.
    const a = placeFor(w, P1, 0, null);
    const b = placeFor(w, P1, 1, a);
    const bondId = firstBondId(w);
    // Grant P2 1 charge (bypassing the build-action accumulator for test isolation).
    w.players.get(P2)!.disruptionCharges = 1;
    w.currentPlayerId = P2;
    const primsBefore = w.primitives.size;
    dispatch(w, { type: 'SEVER_BOND', bondId: bondId as never, playerId: P2, cause: 'player' });
    expect(w.players.get(P2)!.disruptionCharges).toBe(0);  // consumed
    expect(w.primitives.size).toBeLessThan(primsBefore);    // destructive (smaller side erased)
    // Suppress unused warning for placement b.
    void b;
  });

  it('cross-player sever with 0 charges is silently rejected (no-op)', () => {
    const w = setup1v1();
    placeFor(w, P1, 0, null);
    const a = [...w.primitives.keys()].at(-1)!;
    placeFor(w, P1, 1, a as unknown as number);
    const bondId = firstBondId(w);
    w.players.get(P2)!.disruptionCharges = 0;
    w.currentPlayerId = P2;
    const primsBefore = w.primitives.size;
    const bondsBefore = w.bonds.size;
    dispatch(w, { type: 'SEVER_BOND', bondId: bondId as never, playerId: P2, cause: 'player' });
    expect(w.players.get(P2)!.disruptionCharges).toBe(0);  // unchanged
    expect(w.primitives.size).toBe(primsBefore);            // no-op
    expect(w.bonds.size).toBe(bondsBefore);                 // bond intact
  });

  it('self-sever consumes 0 charges (Phase-1 §VIII.4 preserved)', () => {
    const w = setup1v1();
    const a = placeFor(w, P1, 0, null);
    placeFor(w, P1, 1, a);
    const bondId = firstBondId(w);
    w.players.get(P1)!.disruptionCharges = 0;
    w.currentPlayerId = P1;
    const primsBefore = w.primitives.size;
    dispatch(w, { type: 'SEVER_BOND', bondId: bondId as never, playerId: P1, cause: 'player' });
    expect(w.players.get(P1)!.disruptionCharges).toBe(0);  // not consumed (both endpoints P1.color)
    expect(w.primitives.size).toBeLessThan(primsBefore);    // self-sever still topologically active
  });

  it('wrong-turn dispatch in 1v1 silently rejects (1v1 input gate)', () => {
    const w = setup1v1();
    placeFor(w, P1, 0, null);
    const a = [...w.primitives.keys()].at(-1)!;
    placeFor(w, P1, 1, a as unknown as number);
    const bondId = firstBondId(w);
    w.players.get(P1)!.disruptionCharges = 5;  // plenty
    w.currentPlayerId = P2;  // P2's turn
    const primsBefore = w.primitives.size;
    // P1 tries to sever DURING P2's turn — must reject regardless of charges.
    dispatch(w, { type: 'SEVER_BOND', bondId: bondId as never, playerId: P1, cause: 'player' });
    expect(w.players.get(P1)!.disruptionCharges).toBe(5);  // unchanged
    expect(w.primitives.size).toBe(primsBefore);            // no-op
  });

  it('mixed-ownership bond — hostile for BOTH players (Gemini #3 either-differs rule)', () => {
    const w = setup1v1();
    // P1 places anchor; P2 places second prim bonded to P1's anchor (inter-player bond, spec §V/§VI.4).
    const a = placeFor(w, P1, 0, null);
    placeFor(w, P2, 1, a);
    const bondId = firstBondId(w);
    // P1 attempts sever: bond.primA.placerColor=red matches P1, but bond.primB.placerColor=cyan differs → HOSTILE.
    w.players.get(P1)!.disruptionCharges = 1;
    w.currentPlayerId = P1;
    const before1 = w.players.get(P1)!.disruptionCharges;
    dispatch(w, { type: 'SEVER_BOND', bondId: bondId as never, playerId: P1, cause: 'player' });
    expect(w.players.get(P1)!.disruptionCharges).toBe(before1 - 1);  // consumed
  });

  it('cycle-bond sever does NOT consume charge (PRIME-AUDIT B §VIII.4)', () => {
    const w = setup1v1();
    // Build a triangle (cycle): a-b-c-a.
    const a = placeFor(w, P1, 0, null);
    const b = placeFor(w, P1, 1, a);
    const c = placeFor(w, P1, 2, b);
    // Synthesize the closing bond c-a manually (same trick as sever.test.ts case 4).
    const synthBondId = (w.bonds.size as unknown) as number;
    const synthBond = {
      id: synthBondId as never,
      aId: c as never,
      bId: a as never,
      a: w.primitives.get(c as never)!,
      b: w.primitives.get(a as never)!,
      restLength: 50,
      stiffnessTier: 'MID' as const,
      createdTick: w.tick,
    };
    w.bonds.set(synthBond.id, synthBond as never);
    w.primitives.get(c as never)!.bonds.add(synthBond.id);
    w.primitives.get(a as never)!.bonds.add(synthBond.id);
    // P2 (hostile) attempts to sever bond a-b — but it's now on a cycle.
    const abBond = [...w.bonds.values()].find((bd) => (bd.aId === a && bd.bId === b) || (bd.aId === b && bd.bId === a))!;
    w.players.get(P2)!.disruptionCharges = 1;
    w.currentPlayerId = P2;
    const primsBefore = w.primitives.size;
    dispatch(w, { type: 'SEVER_BOND', bondId: abBond.id as never, playerId: P2, cause: 'player' });
    expect(w.players.get(P2)!.disruptionCharges).toBe(1);  // PRIME-AUDIT B: not consumed
    expect(w.primitives.size).toBe(primsBefore);            // no prims die on cycle sever
    expect(w.bonds.has(abBond.id)).toBe(false);             // bond still removed (pre-existing behavior)
  });

  it('charge cap respected at MAX_DISRUPTION_CHARGES (§VIII.2) — tickBuildAction direct', () => {
    // §VIII.2 charge cap. Player.test.ts already covers tickBuildAction's
    // cap semantics; this test just confirms MAX_DISRUPTION_CHARGES is the
    // wired constant via the same FSM under dispatch's player records.
    const w = setup1v1();
    const p = w.players.get(P1)!;
    for (let i = 0; i < 50; i++) tickBuildAction(p);
    expect(p.disruptionCharges).toBe(MAX_DISRUPTION_CHARGES);
  });

  it('both players accumulate charges independently', () => {
    const w = setup1v1();
    // Hammer P1's build-action accumulator 5 times → 1 charge. P2 untouched.
    const p1 = w.players.get(P1)!;
    for (let i = 0; i < 5; i++) tickBuildAction(p1);
    expect(w.players.get(P1)!.disruptionCharges).toBe(1);
    expect(w.players.get(P2)!.disruptionCharges).toBe(0);
  });

  it("save.ts roundtrips disruptionCharges (LOCKED §11 schema audit, Gemini #2)", () => {
    // Verify save.ts already serializes the field — A.0 found it pre-wired at
    // SerializedPlayer.disruptionCharges (line 112) and applySnapshotCore
    // (line 275). This test just regression-guards the roundtrip.
    const w = setup1v1();
    w.players.get(P1)!.disruptionCharges = 2;
    w.players.get(P2)!.disruptionCharges = 1;
    w.players.get(P1)!.buildActions = 3;
    const snap = snapshot(w);
    const w2 = setup1v1();
    restore(snap, w2);
    expect(w2.players.get(P1)!.disruptionCharges).toBe(2);
    expect(w2.players.get(P2)!.disruptionCharges).toBe(1);
    expect(w2.players.get(P1)!.buildActions).toBe(3);
  });

  it('physics-cause sever bypasses charge gate (overstretch solver path)', () => {
    const w = setup1v1();
    const a = placeFor(w, P1, 0, null);
    placeFor(w, P1, 1, a);
    const bondId = firstBondId(w);
    // P2 (hostile actor) has 0 charges — but cause='physics' bypasses gate.
    w.players.get(P2)!.disruptionCharges = 0;
    w.currentPlayerId = P2;
    const primsBefore = w.primitives.size;
    dispatch(w, { type: 'SEVER_BOND', bondId: bondId as never, playerId: P2, cause: 'physics' });
    expect(w.primitives.size).toBeLessThan(primsBefore);  // physics path fired
    expect(w.players.get(P2)!.disruptionCharges).toBe(0); // still 0 (physics never consumes)
  });
});
