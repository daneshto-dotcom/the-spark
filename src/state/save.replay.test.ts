/**
 * SPARK — replay-determinism guard (S33 P1-12, S30 audit finding #12).
 *
 * Catches future Math.random / Date.now / performance.now / iteration-order
 * creep inside reducers by running the same deterministic dispatch sequence
 * twice from the same seed and asserting that the JSON-serialized
 * WorldSnapshot is byte-equal between runs.
 *
 * Uses the production save.ts serializer (PRIME-AUDIT Δ3 — better than a
 * hand-picked field-slice list, because the serializer covers every
 * deterministic-relevant field already and automatically gains coverage for
 * any field added in future schema additive-optional revisions, S15 P2 /
 * S28 P0 / S31 P0-3 precedent).
 *
 * The script is intentionally varied (spark spawn, pickup, primitive place,
 * tick energy, bond sever) to exercise multiple reducer paths in a single
 * compact test. Any non-determinism introduced into ANY of these reducer
 * paths will surface here as a JSON mismatch.
 */

import { describe, expect, it } from 'vitest';
import { SparkType } from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSparkId, asSpawnerId } from '../types.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { snapshot, restore, netSnapshot } from './save.ts';
import { tickScoring } from './scoring.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { findNearestBondTarget, findNearestEnemyCreature } from './creatures/creatureAI.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { asCreatureId } from './creatures/creature.ts';

const P1 = asPlayerId(0);

/**
 * snapshot() stamps `savedAt: new Date().toISOString()` (save.ts:207) as
 * metadata for localStorage saves — informational, not game state. Strip
 * it before equality comparison so the determinism check measures world
 * state alone.
 */
function determinismJson(world: World): string {
  const snap = snapshot(world);
  const { savedAt: _ignore, ...rest } = snap;
  void _ignore;
  return JSON.stringify(rest);
}

/**
 * Deterministic stress script — fires SPAWN_SPARK, PICKUP_SPARK,
 * PLACE_PRIMITIVE, TICK_ENERGY, and SEVER_BOND in a fixed sequence keyed off
 * the iteration index. Identical world-state input → identical world-state
 * output. No Math.random, no Date.now, no wall-clock.
 */
function runStress(world: World, iterations: number): void {
  for (let i = 0; i < iterations; i++) {
    const s = makeFreeSpark({
      id: asSparkId(i),
      type: (i % 6) as SparkType,
      pos: { x: 100 + (i % 50) * 12, y: 200 + (i % 30) * 7 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: world.tick,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark: s });
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1, pos: { x: s.pos.x, y: s.pos.y } });

    // Every 3rd iteration place onto a prior primitive (chain growth);
    // otherwise place standalone. Mix of growing vs orphan branches.
    const primKeys = [...world.primitives.keys()];
    const targetId = i % 3 === 0 && primKeys.length > 0 ? primKeys[i % primKeys.length] : null;
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: targetId,
      stiffnessTier: i % 3 === 0 ? 'HIGH' : i % 3 === 1 ? 'MID' : 'LOW',
    });

    // Periodic energy tick (deterministic deltaSec).
    if (i % 5 === 0) {
      dispatch(world, { type: 'TICK_ENERGY', playerId: P1, deltaSec: 1 / 60 });
    }

    // S90 P1 — accrue complexity-income every iteration so the scoring path
    // (computeComplexity + tickScoring, incl. the Filament trickle branch and
    // its filamentBonds*FILAMENT_INCOME_COMPLEXITY float multiply) lands in the
    // compared snapshot. Closes the S90 final-audit gap: the prior runStress
    // never called tickScoring, so a Date.now/Math.random crept into scoring
    // would have stayed green. Pure fn of synced state → identical both runs.
    tickScoring(world);

    // Every 7th iteration sever a bond if one exists (exercises SEVER_BOND
    // + computeSeverEraseEffects + bond/primitive cascade).
    if (i % 7 === 0 && world.bonds.size > 0) {
      const firstBondId = [...world.bonds.keys()][0];
      dispatch(world, {
        type: 'SEVER_BOND',
        bondId: firstBondId,
        playerId: P1,
        cause: 'physics',
      });
    }

    world.tick++;
  }
}

describe('Replay determinism (S33 P1-12 — same inputs → same WorldSnapshot)', () => {
  it('two runs with the same seed produce byte-identical snapshot JSON', () => {
    const SEED = 0xc0ffee;
    const ITERS = 1000;

    const wA = makeWorld(SEED);
    runStress(wA, ITERS);
    const jsonA = determinismJson(wA);

    const wB = makeWorld(SEED);
    runStress(wB, ITERS);
    const jsonB = determinismJson(wB);

    expect(jsonA).toBe(jsonB);
  });

  it('shorter run (250 iters) also deterministic', () => {
    const SEED = 0xbeef;
    const ITERS = 250;

    const wA = makeWorld(SEED);
    runStress(wA, ITERS);
    const jsonA = determinismJson(wA);

    const wB = makeWorld(SEED);
    runStress(wB, ITERS);
    const jsonB = determinismJson(wB);

    expect(jsonA).toBe(jsonB);
  });

  it('different seeds produce different snapshots (sanity check — test has real signal)', () => {
    const ITERS = 250;

    const wA = makeWorld(0xaaa);
    runStress(wA, ITERS);
    const jsonA = determinismJson(wA);

    const wB = makeWorld(0xbbb);
    runStress(wB, ITERS);
    const jsonB = determinismJson(wB);

    // Same script, different seeds: makeWorld stores rngSeed which IS in the
    // snapshot, so even if the rest of the state happens to converge, the
    // rngSeed field guarantees JSON divergence. This is the "is this test
    // actually checking anything" canary.
    expect(jsonA).not.toBe(jsonB);
  });

  it('non-empty primitive + bond counts after stress (script exercises real reducer paths)', () => {
    const wA = makeWorld(0x1234);
    runStress(wA, 250);
    // Sanity: the stress actually produced state worth comparing. Without
    // this guard, an all-empty world would trivially match itself across
    // both runs and the determinism check would be vacuous.
    expect(wA.primitives.size).toBeGreaterThan(0);
    expect(wA.bonds.size).toBeGreaterThan(0);
  });
});

/**
 * S34 PB-5 — extends replay-determinism coverage to the S25-S28 creature
 * lifecycle reducers (SPAWN_CREATURE / CREATURE_TICK / DESPAWN_CREATURE).
 * Phase B audit (test-determinism agent) noted: the original runStress only
 * exercises spark+primitive+bond paths; creature reducers were unguarded.
 *
 * Strategy (per Council Q2 SYNTHESIS — Grok's NEW describe-block proposal):
 * use a dedicated stress driver that dispatches SPAWN_CREATURE directly
 * (no GODLY_TRIGGER + cinematic chain — that's orchestration, not reducer
 * domain). Each iteration advances world.tick + dispatches one CREATURE_TICK
 * + occasionally a CREATURE_ATTACK. Bounded to 200 iterations so total
 * runtime stays under ~50 ms per run (PB-5 stretch goal: < 200 ms).
 */
function runCreatureStress(world: World, iterations: number): void {
  // One creature SPAWN per "epoch" of 60 ticks, gated on creatures.size===0.
  // Over a 200-iter run world.tick only reaches 200 < VOLTKIN_LIFETIME_TICKS
  // (1200 since S58 #4; was 480) so the first creature never despawns and the
  // gate keeps a single creature alive for the whole run — this exercises the
  // spawn + per-tick reducers under replay-determinism (the despawn path has
  // its own dedicated coverage in creatureLifecycle.test.ts). Determinism is
  // independent of the lifetime value: both runs use the same config.
  for (let i = 0; i < iterations; i++) {
    // Spawn epoch boundary — start a new creature owned by P1.
    if (i % 60 === 0 && world.creatures.size === 0) {
      // Deterministic spawn position derived from iteration index.
      const posX = 200 + (i % 100);
      const posY = 300 + ((i * 7) % 80);
      dispatch(world, {
        type: 'SPAWN_CREATURE',
        creatureType: 'voltkin',
        ownerPlayerId: P1,
        pos: { x: posX, y: posY },
        targetPos: { x: 400, y: 400 },
      });
    }
    // Tick every alive creature each iteration (mirrors main.ts fan-out).
    for (const creatureId of [...world.creatures.keys()]) {
      dispatch(world, { type: 'CREATURE_TICK', creatureId });
    }
    world.tick++;
  }
}

/**
 * S100 P1 (TD Phase 1a) — chewer + spawner replay-determinism stress (HARD GATE,
 * design §3.2 rule 6 / R2). The pre-S100 runCreatureStress only ticks a Voltkin, so
 * it stays green even if every new chewer/spawner reducer is non-deterministic. This
 * driver exercises EXACTLY the new code paths: register a spawner, spawn chewers (split
 * caps), commit them to a stationary enemy bond, accumulate chewProgress through the
 * chew loop, sever via the CREATURE_ATTACK chew path, and re-validate / tear down the
 * spawner — all tick-deterministic, no wall-clock, no Math.random. Two identically-
 * seeded runs MUST produce byte-identical JSON.stringify(snapshot).
 */
function runChewerStress(world: World, iterations: number): void {
  const P2 = asPlayerId(1);
  // Two players so the chewer's enemy-only targeting + FFA spread paths are live.
  world.players.set(P2, makeIdlePlayer(P2, 0x00ff00));

  // A standing enemy structure (player-1-coloured prims) the chewers chew through,
  // built deterministically from fixed positions (no RNG).
  for (let i = 0; i < 6; i++) {
    const prim: import('../game/primitive.ts').Primitive = {
      id: asPrimitiveId(900 + i),
      type: SparkType.Dot,
      placerColor: 0x00ff00,
      placedBy: P2,
      createdTick: 0,
      pos: { x: 100 + i * 20, y: 100 },
      prevPos: { x: 100 + i * 20, y: 100 },
      bonds: new Set(),
      ownerColor: 0x00ff00,
      lastOwnershipChange: 0,
      radius: 8,
    };
    world.primitives.set(prim.id, prim);
  }
  for (let i = 0; i < 5; i++) {
    const a = world.primitives.get(asPrimitiveId(900 + i))!;
    const b = world.primitives.get(asPrimitiveId(901 + i))!;
    const bond: import('../physics/bonds.ts').Bond = {
      id: asBondId(900 + i),
      aId: a.id,
      bId: b.id,
      a,
      b,
      restLength: 20,
      stiffnessTier: 'MID',
      createdTick: 0,
    };
    world.bonds.set(bond.id, bond);
    a.bonds.add(bond.id);
    b.bonds.add(bond.id);
  }

  // Register a spawner over the (anchor) prim 900 — recipeStillSatisfied falls to the
  // anchor-exists check for a non-pentagram-shaped component, which is deterministic.
  dispatch(world, {
    type: 'REGISTER_SPAWNER',
    ownerPlayerId: P1,
    anchorPrimitiveId: asPrimitiveId(900),
    recipeId: 'pentagram',
  });

  for (let i = 0; i < iterations; i++) {
    // Periodically emit a chewer near the enemy structure (capped by underChewerCaps).
    if (i % 20 === 0) {
      dispatch(world, {
        type: 'SPAWN_CREATURE',
        creatureType: 'chewer',
        ownerPlayerId: P1,
        pos: { x: 110 + (i % 30), y: 110 },
        targetPos: { x: 110, y: 100 },
        sourceSpawnerId: asSpawnerId(0),
      });
    }
    // Tick every creature; deterministically drive the chew FSM the way main.ts does:
    // re-select target (enemyOnly for chewers), promote SEEKING→ATTACKING if in range,
    // and fire CREATURE_ATTACK at the chewer's attackFireTick on the final chew.
    for (const creatureId of [...world.creatures.keys()]) {
      const c = world.creatures.get(creatureId);
      if (c === undefined) continue;
      if (c.type === 'chewer' && c.state === 'SEEKING' && c.chewProgress === 0) {
        const tgt = findNearestBondTarget(world, c, true);
        c.targetBondId = tgt;
      }
      dispatch(world, { type: 'CREATURE_TICK', creatureId });
      const after = world.creatures.get(creatureId);
      if (
        after !== undefined &&
        after.type === 'chewer' &&
        after.state === 'ATTACKING' &&
        after.ticksInState === getCreatureConfig(after.type).attackFireTick &&
        after.targetBondId !== null
      ) {
        dispatch(world, {
          type: 'CREATURE_ATTACK',
          creatureId,
          bondId: after.targetBondId,
        });
      }
    }
    // Throttled re-validation + teardown of the spawner near the end of the run.
    if (i === iterations - 5) {
      const sp = world.creatureSpawners.get(asSpawnerId(0));
      if (sp !== undefined) {
        dispatch(world, { type: 'REMOVE_SPAWNER', spawnerId: asSpawnerId(0) });
      }
    }
    world.tick++;
  }
}

/**
 * S103 #8 (HARD GATE) — Voltkin-vs-chewer combat determinism. Mirrors runChewerStress but ALSO
 * stations a Voltkin (owned by the victim P2) amid the P1 chewer swarm. Each iteration drives the
 * REAL main.ts orchestration for both populations: chewers re-select their enemy bond + chew it,
 * and the Voltkin (a) opportunistically sets `targetCreatureId` via findNearestEnemyCreature
 * (in-range only — MF3), (b) fires CREATURE_ATTACK creature-FIRST when it has one (→ damageCreature,
 * a chewer dies in 1), else severs its bond target. All tick-deterministic (no wall-clock / RNG):
 * two identically-seeded runs MUST be byte-identical. Returns the number of chewer-kills credited
 * to the Voltkin (its killCount) so the sanity test can assert combat actually happened.
 */
function runVoltkinVsChewerStress(world: World, iterations: number): number {
  const P2 = asPlayerId(1);
  world.players.set(P2, makeIdlePlayer(P2, 0x00ff00));

  // A standing P2 structure (the thing P1 chewers chew through), fixed positions.
  for (let i = 0; i < 6; i++) {
    const prim: import('../game/primitive.ts').Primitive = {
      id: asPrimitiveId(900 + i), type: SparkType.Dot, placerColor: 0x00ff00, placedBy: P2,
      createdTick: 0, pos: { x: 100 + i * 20, y: 100 }, prevPos: { x: 100 + i * 20, y: 100 },
      bonds: new Set(), ownerColor: 0x00ff00, lastOwnershipChange: 0, radius: 8,
    };
    world.primitives.set(prim.id, prim);
  }
  for (let i = 0; i < 5; i++) {
    const a = world.primitives.get(asPrimitiveId(900 + i))!;
    const b = world.primitives.get(asPrimitiveId(901 + i))!;
    const bond: import('../physics/bonds.ts').Bond = {
      id: asBondId(900 + i), aId: a.id, bId: b.id, a, b, restLength: 20, stiffnessTier: 'MID', createdTick: 0,
    };
    world.bonds.set(bond.id, bond);
    a.bonds.add(bond.id); b.bonds.add(bond.id);
  }

  dispatch(world, { type: 'REGISTER_SPAWNER', ownerPlayerId: P1, anchorPrimitiveId: asPrimitiveId(900), recipeId: 'pentagram' });

  // Station a Voltkin (owned by victim P2) right in the chewer lane so P1 chewers wander into
  // its 180px attackRange → it opportunistically zaps them.
  dispatch(world, {
    type: 'SPAWN_CREATURE', creatureType: 'voltkin', ownerPlayerId: P2,
    pos: { x: 130, y: 110 }, targetPos: { x: 130, y: 110 },
  });

  for (let i = 0; i < iterations; i++) {
    if (i % 18 === 0) {
      dispatch(world, {
        type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: P1,
        pos: { x: 120 + (i % 24), y: 112 }, targetPos: { x: 110, y: 100 }, sourceSpawnerId: asSpawnerId(0),
      });
    }
    for (const creatureId of [...world.creatures.keys()]) {
      const c = world.creatures.get(creatureId);
      if (c === undefined) continue;
      // ── main.ts SEEKING fan-out (faithful mirror) ──
      if (c.state === 'SEEKING') {
        const isChewer = c.sourceSpawnerId !== null;
        if (isChewer) {
          if (c.chewProgress === 0) c.targetBondId = findNearestBondTarget(world, c, true);
        } else {
          c.targetBondId = findNearestBondTarget(world, c, false);
          c.targetCreatureId = findNearestEnemyCreature(world, c); // S103 #8 opportunistic
        }
      }
      dispatch(world, { type: 'CREATURE_TICK', creatureId });
      const after = world.creatures.get(creatureId);
      if (
        after !== undefined &&
        after.state === 'ATTACKING' &&
        after.ticksInState === getCreatureConfig(after.type).attackFireTick &&
        (after.targetCreatureId !== null || after.targetBondId !== null)
      ) {
        if (after.targetCreatureId !== null) {
          dispatch(world, { type: 'CREATURE_ATTACK', creatureId, bondId: null, targetCreatureId: after.targetCreatureId });
        } else {
          dispatch(world, { type: 'CREATURE_ATTACK', creatureId, bondId: after.targetBondId });
        }
      }
    }
    world.tick++;
  }

  // Total chewer-kills the Voltkin landed (killCount survives even after the Voltkin despawns? no —
  // read it live while it's alive; the determinism check uses the full snapshot regardless).
  let voltkinKills = 0;
  for (const c of world.creatures.values()) {
    if (c.type === 'voltkin') voltkinKills += c.killCount;
  }
  return voltkinKills;
}

describe('Replay determinism — S103 #8 Voltkin-vs-chewer combat (HARD GATE)', () => {
  it('two runs with the same seed produce byte-identical snapshot after Voltkin-vs-chewer stress', () => {
    const SEED = 0x8c0ffee;
    const ITERS = 240;
    const wA = makeWorld(SEED);
    runVoltkinVsChewerStress(wA, ITERS);
    const jsonA = determinismJson(wA);
    const wB = makeWorld(SEED);
    runVoltkinVsChewerStress(wB, ITERS);
    const jsonB = determinismJson(wB);
    expect(jsonA).toBe(jsonB);
  });

  it('the Voltkin actually zaps chewers (combat sanity — kills happen)', () => {
    const w = makeWorld(0x5eed1);
    // Run long enough for the Voltkin to materialize (60-tick SPAWNING) + chewers to reach it.
    const kills = runVoltkinVsChewerStress(w, 240);
    expect(kills).toBeGreaterThan(0);
  });

  it('different seeds still diverge (canary)', () => {
    const wA = makeWorld(0xa11); runVoltkinVsChewerStress(wA, 120);
    const wB = makeWorld(0xb22); runVoltkinVsChewerStress(wB, 120);
    expect(determinismJson(wA)).not.toBe(determinismJson(wB));
  });
});

/**
 * S103 P2 (HARD GATE) — generic DEFENDER substrate determinism. Registers a princess + a turret
 * (co-resident, both kinds) over P0 anchors, spawns P1 chewers that wander into range, and drives
 * the REAL main.ts poll each tick (revalidate + DEFENDER_TICK) alongside a minimal chewer tick. The
 * princess (short interval) acquires → windups → FIRES (damageCreature kills a chewer) → recovers;
 * the turret co-ticks. All tick-deterministic (no wall-clock / RNG; lowest-id target tie-break) →
 * two identically-seeded runs MUST be byte-identical.
 */
function runDefenderStress(world: World, iterations: number): void {
  const P2 = asPlayerId(1);
  world.players.set(P2, makeIdlePlayer(P2, 0x00ff00));

  // P0 anchor primitives for the two defenders (fixed positions).
  for (const [pid, x, y] of [[800, 100, 100], [801, 320, 100]] as const) {
    world.primitives.set(asPrimitiveId(pid), {
      id: asPrimitiveId(pid), type: SparkType.Triangle, placerColor: 0xff0000, placedBy: P1,
      createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
      ownerColor: 0xff0000, lastOwnershipChange: 0, radius: 8,
    });
  }
  dispatch(world, { type: 'REGISTER_DEFENDER', defenderKind: 'princess', ownerPlayerId: P1, anchorPrimitiveId: asPrimitiveId(800), recipeId: 'helga', pos: { x: 100, y: 100 } });
  dispatch(world, { type: 'REGISTER_DEFENDER', defenderKind: 'turret', ownerPlayerId: P1, anchorPrimitiveId: asPrimitiveId(801), recipeId: 'laserTurret', pos: { x: 320, y: 100 } });

  for (let i = 0; i < iterations; i++) {
    if (i % 12 === 0) {
      dispatch(world, {
        type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: P2,
        pos: { x: 110 + (i % 20), y: 105 }, targetPos: { x: 110, y: 100 }, sourceSpawnerId: asSpawnerId(0),
      });
    }
    // Defender poll (faithful mirror of main.ts).
    for (const [defenderId, d] of [...world.defenders]) {
      const did = defenderId as unknown as number;
      if (world.tick % 30 === did % 30) {
        if (!world.primitives.has(d.anchorPrimitiveId)) {
          dispatch(world, { type: 'REMOVE_DEFENDER', defenderId });
          continue;
        }
      }
      dispatch(world, { type: 'DEFENDER_TICK', defenderId });
    }
    // Minimal chewer tick (they SEEK their stub target; the defender kills the in-range ones).
    for (const creatureId of [...world.creatures.keys()]) {
      dispatch(world, { type: 'CREATURE_TICK', creatureId });
    }
    world.tick++;
  }
}

describe('Replay determinism — S103 P2 generic defender substrate (HARD GATE)', () => {
  it('two runs with the same seed produce byte-identical snapshot after defender stress', () => {
    const SEED = 0xdefe0d;
    const ITERS = 240;
    const wA = makeWorld(SEED);
    runDefenderStress(wA, ITERS);
    const jsonA = determinismJson(wA);
    const wB = makeWorld(SEED);
    runDefenderStress(wB, ITERS);
    const jsonB = determinismJson(wB);
    expect(jsonA).toBe(jsonB);
  });

  it('the princess defender actually kills chewers (combat sanity)', () => {
    const w = makeWorld(0xc0c0a);
    runDefenderStress(w, 240);
    // 20 chewers spawned (240/12); the princess (range 160, 90-tick cadence) culls those in range,
    // so fewer than the full 20 survive — the FIRE→damageCreature path ran.
    const liveChewers = [...w.creatures.values()].filter((c) => c.type === 'chewer').length;
    expect(liveChewers).toBeLessThan(20);
  });

  it('save→load does NOT make a defender insta-fire (Council MF5)', () => {
    const w = makeWorld(0xabc);
    runDefenderStress(w, 120); // defenders mid-cadence
    const snap = snapshot(w);
    const w2 = makeWorld(0); // fresh world (different tick baseline)
    restore(JSON.parse(JSON.stringify(snap)), w2);
    for (const d of w2.defenders.values()) {
      expect(d.nextFireTick).toBeGreaterThanOrEqual(w2.tick); // re-phased — never in the past
    }
    expect(w2.defenders.size).toBe(2); // both round-tripped
  });

  it('different seeds still diverge (canary)', () => {
    const wA = makeWorld(0x1a); runDefenderStress(wA, 120);
    const wB = makeWorld(0x2b); runDefenderStress(wB, 120);
    expect(determinismJson(wA)).not.toBe(determinismJson(wB));
  });
});

describe('Replay determinism — S34 PB-5 creature lifecycle coverage', () => {
  it('two runs with the same seed produce byte-identical snapshot after creature stress', () => {
    const SEED = 0xc0c0c0;
    const ITERS = 200;

    const wA = makeWorld(SEED);
    runCreatureStress(wA, ITERS);
    const jsonA = determinismJson(wA);

    const wB = makeWorld(SEED);
    runCreatureStress(wB, ITERS);
    const jsonB = determinismJson(wB);

    expect(jsonA).toBe(jsonB);
  });

  it('creature stress actually produces non-empty creature state (sanity)', () => {
    const w = makeWorld(0xfacade);
    // Run JUST long enough to spawn one creature + drive a few CREATURE_TICKs
    // but not long enough to despawn it.
    runCreatureStress(w, 100);
    // After 100 ticks: one SPAWN_CREATURE at i=0, 100 ticks of CREATURE_TICK.
    // Creature is well within lifetime (despawnAtTick = 1200), so still alive.
    expect(w.creatures.size).toBe(1);
    const c = Array.from(w.creatures.values())[0];
    expect(c.type).toBe('voltkin');
    expect(c.ticksInState).toBeGreaterThan(0);
  });

  it('different seeds with creature stress produce different snapshots (canary)', () => {
    const ITERS = 100;

    const wA = makeWorld(0xa1);
    runCreatureStress(wA, ITERS);
    const jsonA = determinismJson(wA);

    const wB = makeWorld(0xb2);
    runCreatureStress(wB, ITERS);
    const jsonB = determinismJson(wB);

    // Same creature script, different seeds → different rngSeed field in
    // snapshot ensures JSON divergence (the "is this test real" canary).
    expect(jsonA).not.toBe(jsonB);
  });
});

describe('Replay determinism — S100 P1 chewer + spawner coverage (HARD GATE)', () => {
  it('two runs with the same seed produce byte-identical snapshot after chewer stress', () => {
    const SEED = 0xc4e0a7;
    const ITERS = 400;

    const wA = makeWorld(SEED);
    runChewerStress(wA, ITERS);
    const jsonA = determinismJson(wA);

    const wB = makeWorld(SEED);
    runChewerStress(wB, ITERS);
    const jsonB = determinismJson(wB);

    expect(jsonA).toBe(jsonB);
  });

  it('chewer stress actually exercises the new paths (chewers spawned, bonds severed)', () => {
    const w = makeWorld(0xfeed);
    runChewerStress(w, 400);
    // The structure had 5 bonds; the chew path must have severed at least one.
    expect(w.bonds.size).toBeLessThan(5);
    // The spawner was torn down near the end of the run.
    expect(w.creatureSpawners.size).toBe(0);
  });

  it('different seeds with chewer stress diverge (canary — test has real signal)', () => {
    const wA = makeWorld(0xaa11);
    runChewerStress(wA, 200);
    const wB = makeWorld(0xbb22);
    runChewerStress(wB, 200);
    expect(determinismJson(wA)).not.toBe(determinismJson(wB));
  });
});

describe('S100 P1 — host save/load round-trips a mid-chew chewer (R3)', () => {
  it('despawnAtTick / chewProgress / sourceSpawnerId / targetBondId survive snapshot→restore', () => {
    const P2 = asPlayerId(1);
    const host = makeWorld(0x5a4e);
    host.players.set(P2, makeIdlePlayer(P2, 0x00ff00));
    host.tick = 500;

    // Stationary enemy bond.
    const primA: import('../game/primitive.ts').Primitive = {
      id: asPrimitiveId(10), type: SparkType.Dot, placerColor: 0x00ff00, placedBy: P2,
      createdTick: 0, pos: { x: 40, y: 0 }, prevPos: { x: 40, y: 0 }, bonds: new Set(),
      ownerColor: 0x00ff00, lastOwnershipChange: 0, radius: 8,
    };
    const primB: import('../game/primitive.ts').Primitive = {
      id: asPrimitiveId(11), type: SparkType.Dot, placerColor: 0x00ff00, placedBy: P2,
      createdTick: 0, pos: { x: 60, y: 0 }, prevPos: { x: 60, y: 0 }, bonds: new Set(),
      ownerColor: 0x00ff00, lastOwnershipChange: 0, radius: 8,
    };
    host.primitives.set(primA.id, primA);
    host.primitives.set(primB.id, primB);
    const bond: import('../physics/bonds.ts').Bond = {
      id: asBondId(1), aId: primA.id, bId: primB.id, a: primA, b: primB,
      restLength: 20, stiffnessTier: 'MID', createdTick: 0,
    };
    host.bonds.set(bond.id, bond);
    primA.bonds.add(bond.id);
    primB.bonds.add(bond.id);

    dispatch(host, {
      type: 'SPAWN_CREATURE',
      creatureType: 'chewer',
      ownerPlayerId: P1,
      pos: { x: 50, y: 5 },
      targetPos: { x: 50, y: 0 },
      sourceSpawnerId: asSpawnerId(0),
    });
    const cid = asCreatureId(0);
    const c = host.creatures.get(cid)!;
    c.state = 'ATTACKING';
    c.ticksInState = 130;
    c.chewProgress = 2;
    c.targetBondId = bond.id;
    const expectedDespawn = c.despawnAtTick;

    const snap = snapshot(host);
    const loaded = makeWorld(0); // different seed — restore overwrites
    restore(snap, loaded);

    const r = loaded.creatures.get(cid)!;
    expect(r.type).toBe('chewer');
    expect(r.chewProgress).toBe(2);
    expect(r.sourceSpawnerId).toBe(asSpawnerId(0));
    expect(r.targetBondId).toBe(bond.id);
    expect(r.despawnAtTick).toBe(expectedDespawn);
  });

  it('an old save with no TD fields loads as an empty creatureSpawners map (R18)', () => {
    const base = makeWorld(0x01d5);
    const snap = snapshot(base);
    // Simulate a pre-S100 save: strip the additive-optional field entirely.
    delete (snap as { creatureSpawners?: unknown }).creatureSpawners;
    const loaded = makeWorld(0);
    expect(() => restore(snap, loaded)).not.toThrow();
    expect(loaded.creatureSpawners.size).toBe(0);
    expect(loaded.nextSpawnerId).toBe(0);
  });
});

describe('S100 P1 — wire byte budget (R1) + TD host-only stripping', () => {
  it('a worst-case world (8 chewers + spawners + prims/bonds) stays under ~16 KB on the wire', () => {
    const host = makeWorld(0xb19);
    host.gameMode = '1v1';
    host.isHost = true;
    host.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), 0x00ff00));

    // Build a dense enemy structure (primitives + bonds). save.ts documents a
    // realistic prim/bond base of ~3 KB; this fixture is deliberately generous
    // (a large full-board structure) so the assertion proves the 8-chewer swarm +
    // spawners do NOT push a realistic worst case past the ~16 KB single-SCTP ceiling.
    const N_PRIMS = 40;
    for (let i = 0; i < N_PRIMS; i++) {
      host.primitives.set(asPrimitiveId(i), {
        id: asPrimitiveId(i), type: SparkType.Triangle, placerColor: 0x00ff00, placedBy: asPlayerId(1),
        createdTick: 0, pos: { x: (i % 10) * 30, y: Math.floor(i / 10) * 30 },
        prevPos: { x: (i % 10) * 30, y: Math.floor(i / 10) * 30 },
        bonds: new Set(), ownerColor: 0x00ff00, lastOwnershipChange: 0, radius: 8,
      });
    }
    for (let i = 0; i < N_PRIMS - 1; i++) {
      const a = host.primitives.get(asPrimitiveId(i))!;
      const b = host.primitives.get(asPrimitiveId(i + 1))!;
      const bond: import('../physics/bonds.ts').Bond = {
        id: asBondId(i), aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0,
      };
      host.bonds.set(bond.id, bond);
      a.bonds.add(bond.id);
      b.bonds.add(bond.id);
    }

    // 8 chewers (the global cap) with full host-only sim state set.
    for (let i = 0; i < 8; i++) {
      dispatch(host, {
        type: 'SPAWN_CREATURE',
        creatureType: 'chewer',
        ownerPlayerId: asPlayerId(0),
        pos: { x: i * 13, y: 200 },
        targetPos: { x: i * 13, y: 100 },
        sourceSpawnerId: asSpawnerId(i % 3),
      });
    }
    for (const c of host.creatures.values()) {
      c.state = 'ATTACKING';
      c.ticksInState = 130;
      c.chewProgress = 3;
      c.targetBondId = asBondId(0);
    }

    // A few spawners.
    for (let i = 0; i < 3; i++) {
      dispatch(host, {
        type: 'REGISTER_SPAWNER',
        ownerPlayerId: asPlayerId(0),
        anchorPrimitiveId: asPrimitiveId(i),
        recipeId: 'pentagram',
      });
    }

    const wire = JSON.stringify(netSnapshot(host));
    expect(wire.length).toBeLessThan(16 * 1024);

    // The host-only chewer fields MUST be stripped from the wire (render-trimmed shape).
    expect(wire).not.toContain('chewProgress');
    expect(wire).not.toContain('sourceSpawnerId');
    // creatureSpawners IS on the wire (clients render the spawn-zone) but only the
    // tiny identity shape — no host-only cadence words.
    expect(wire).not.toContain('nextSpawnTick');
    expect(wire).not.toContain('lastValidatedTick');
  });
});
