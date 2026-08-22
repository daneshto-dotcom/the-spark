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
import { SparkType, PRIMITIVE_MAX_HP } from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSparkId, asSpawnerId } from '../types.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { snapshot, restore, netSnapshot } from './save.ts';
import { tickScoring } from './scoring.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { findNearestBondTarget, findNearestEnemyCreature } from './creatures/creatureAI.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { asCreatureId } from './creatures/creature.ts';
import { stepPhysics } from '../physics/physicsLoop.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { hashWorldState } from './stateHash.ts';
import type { Controls } from '../input/controls.ts';

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
      hp: PRIMITIVE_MAX_HP,
      origin: null,
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
      damageFifths: 0,
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
      bonds: new Set(), ownerColor: 0x00ff00, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
      origin: null,
    };
    world.primitives.set(prim.id, prim);
  }
  for (let i = 0; i < 5; i++) {
    const a = world.primitives.get(asPrimitiveId(900 + i))!;
    const b = world.primitives.get(asPrimitiveId(901 + i))!;
    const bond: import('../physics/bonds.ts').Bond = {
      id: asBondId(900 + i), aId: a.id, bId: b.id, a, b, restLength: 20, stiffnessTier: 'MID', createdTick: 0,
      damageFifths: 0,
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
      ownerColor: 0xff0000, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
      origin: null,
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

  // S104 P1 (Council M6) — the finite-lifetime CHURN is the actual "constantly produce more" fix,
  // and it must be EXERCISED inside the 2-seed gate (the 400-iter stress above never reaches the
  // 3000-tick lifetime, so a value-only despawnAtTick change would pass it silently). Drive a swarm
  // PAST its lifetime (no enemy bonds → chewers just age out): assert (a) both seeds byte-identical
  // through the DESPAWNING→auto-delete path, (b) the swarm fully drains (the despawn path ran), and
  // (c) the live count actually dropped across the run (churn, not a no-op).
  it('S104 P1 — a chewer swarm drains to empty by its finite lifetime (deterministic churn)', () => {
    const LIFE = getCreatureConfig('chewer').lifetimeTicks; // 3000
    const drain = (seed: number): { json: string; finalCount: number; maxLive: number } => {
      const w = makeWorld(seed);
      for (let i = 0; i < 4; i++) {
        dispatch(w, {
          type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: P1,
          pos: { x: i * 20, y: 0 }, targetPos: { x: i * 20, y: 100 }, sourceSpawnerId: asSpawnerId(0),
        });
      }
      let maxLive = w.creatures.size;
      for (let t = 0; t < LIFE + 200; t++) {
        for (const id of [...w.creatures.keys()]) {
          dispatch(w, { type: 'CREATURE_TICK', creatureId: id });
        }
        maxLive = Math.max(maxLive, w.creatures.size);
        w.tick++;
      }
      return { json: determinismJson(w), finalCount: w.creatures.size, maxLive };
    };
    const SEED = 0x5104a;
    const a = drain(SEED);
    const b = drain(SEED);
    expect(a.json).toBe(b.json); // byte-identical through the new despawn path
    expect(a.maxLive).toBeGreaterThan(0); // the swarm existed
    expect(a.finalCount).toBe(0); // … and fully aged out (despawn path actually ran)
    expect(a.finalCount).toBeLessThan(a.maxLive); // count dropped across the run (churn proven)
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
      ownerColor: 0x00ff00, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
      origin: null,
    };
    const primB: import('../game/primitive.ts').Primitive = {
      id: asPrimitiveId(11), type: SparkType.Dot, placerColor: 0x00ff00, placedBy: P2,
      createdTick: 0, pos: { x: 60, y: 0 }, prevPos: { x: 60, y: 0 }, bonds: new Set(),
      ownerColor: 0x00ff00, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
      origin: null,
    };
    host.primitives.set(primA.id, primA);
    host.primitives.set(primB.id, primB);
    const bond: import('../physics/bonds.ts').Bond = {
      id: asBondId(1), aId: primA.id, bId: primB.id, a: primA, b: primB,
      restLength: 20, stiffnessTier: 'MID', createdTick: 0,
      damageFifths: 0,
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
  it('a worst-case world (12 chewers + spawners + prims/bonds) stays under ~16 KB on the wire', () => {
    const host = makeWorld(0xb19);
    host.gameMode = '1v1';
    host.isHost = true;
    host.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), 0x00ff00));

    // Build a dense enemy structure (primitives + bonds). save.ts documents a
    // realistic prim/bond base of ~3 KB; this fixture is deliberately generous
    // (a large full-board structure) so the assertion proves the 12-chewer swarm +
    // spawners do NOT push a realistic worst case past the ~16 KB single-SCTP ceiling.
    // S104 P1: cap raised 8->12 (CHEWER_MAX_GLOBAL). Measured wire ≈124 B / trimMirrorCreature'd
    // chewer (host-only fields stripped), so 12 ≈ +0.5 KiB vs 8 — inside the single-SCTP envelope.
    const N_PRIMS = 40;
    for (let i = 0; i < N_PRIMS; i++) {
      host.primitives.set(asPrimitiveId(i), {
        id: asPrimitiveId(i), type: SparkType.Triangle, placerColor: 0x00ff00, placedBy: asPlayerId(1),
        createdTick: 0, pos: { x: (i % 10) * 30, y: Math.floor(i / 10) * 30 },
        prevPos: { x: (i % 10) * 30, y: Math.floor(i / 10) * 30 },
        bonds: new Set(), ownerColor: 0x00ff00, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
        origin: null,
      });
    }
    for (let i = 0; i < N_PRIMS - 1; i++) {
      const a = host.primitives.get(asPrimitiveId(i))!;
      const b = host.primitives.get(asPrimitiveId(i + 1))!;
      const bond: import('../physics/bonds.ts').Bond = {
        id: asBondId(i), aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0,
        damageFifths: 0,
      };
      host.bonds.set(bond.id, bond);
      a.bonds.add(bond.id);
      b.bonds.add(bond.id);
    }

    // 12 chewers (the global cap, S104 P1) with full host-only sim state set.
    for (let i = 0; i < 12; i++) {
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

    // V6-0.3 (S131) — ONE real sever, so this byte gate is no longer BLIND TO EFFECTS PAYLOAD.
    //
    // Until now the fixture carried zero effects, so `snapshot.effects` was absent from the wire
    // entirely and this "realistic worst case" assertion could not have caught an effects-side
    // regression of any size. One dispatch fixes that and, as a bonus, round-trips the two new
    // attribution fields through the real serializer rather than a hand-built literal.
    //
    // cause 'chewer' is deliberate: it bypasses the charge + hostile-auth gates
    // (disruptionManager.canSeverBond), so the sever LANDS without having to stage disruption
    // charges — and the fixture's chewers are already pointed at bond 0. Actor is the chewer's
    // owner (seat 0); the victim is seat 1, who placed every primitive above.
    dispatch(host, {
      type: 'SEVER_BOND',
      bondId: asBondId(0),
      playerId: asPlayerId(0),
      cause: 'chewer',
    });
    const severed = host.effects.filter((e) => e.kind === 'BOND_SEVERED');
    expect(severed).toHaveLength(1);
    expect(severed[0]).toMatchObject({ cause: 'chewer', actor: asPlayerId(0), victim: asPlayerId(1) });

    const wire = JSON.stringify(netSnapshot(host));
    // MEASURED on exactly this fixture (12 chewers, EVERY one mid-chew — the worst case for
    // the un-strips below), each number taken by running this test with the strip restored
    // and removed, never estimated:
    //   S133  12,413 B → 12,821 B  (+408 B, +3.3%)  un-strip chewProgress + targetBondId
    //   S134  12,821 B → 13,313 B  (+492 B, +3.8%)  un-strip despawnAtTick + sourceSpawnerId
    // Headroom under the ceiling: 3,071 B.
    // ⚠ Deliberately a ONE-SIDED budget assertion. An earlier S133 draft added a
    // `toBeGreaterThan(12 * 1024)` floor, which turned a BUDGET test into a two-sided clamp
    // with 533 B of slack — any legitimate ~4% wire reduction would have gone red (CHECK F10).
    // ⛔ S134 — DO NOT CITE THIS CEILING AS EVIDENCE ABOUT PRODUCTION. It is fixture-scoped
    // and enforces nothing at runtime. This fixture holds ZERO free sparks and ZERO
    // Voltkins; the repo's own live measurements are 6.7-8.5 KB in a 2-peer duel and
    // ~38.5 KB at six seats with a full board — i.e. reality already exceeds 16 KiB by
    // ~2.4x. `transport.ts` also sends the full payload per ACTIVE STRATEGY per peer with
    // both nostr and torrent on, so real upstream is a multiple of this again. Re-basing
    // this number on a realistic fixture is logged as its own item, not done here.
    expect(wire.length).toBeLessThan(16 * 1024);

    // The gate now genuinely sees effects: BOND_SEVERED is one of the five serialized kinds
    // (save.ts serializeEffect), and both attribution fields must survive onto the wire. If a
    // future edit adds a field to the GameEffect variant but not to serializeEffect's per-case
    // literal — the exact silent failure mode that spec called out — this trips.
    expect(wire).toContain('BOND_SEVERED');
    expect(wire).toContain('"actor"');
    expect(wire).toContain('"victim"');
    // Host-local kinds must still NOT reach the wire (serializeEffect returns null for them).
    expect(wire).not.toContain('SEVER_ERASE');

    // ⚠ AMENDED S133 P1 — `chewProgress` and `targetBondId` now RIDE THE WIRE, deliberately.
    // This assertion previously read `not.toContain('chewProgress')`, i.e. it LOCKED IN a
    // bug: stripping chew progress meant a host-migration successor took over with every
    // chew reset to zero, and `chewProgress` IS the bond's HP (`CONNECTOR_HP = CHEW_HITS`).
    // Inverted rather than deleted, so the contract change is explicit in the diff.
    expect(wire).toContain('chewProgress');
    expect(wire).toContain('targetBondId');
    // The measured cost of that decision, on this deliberately worst-case fixture (12
    // chewers, every one mid-chew): see WIRE_BYTES_WITH_CHEW_STATE below. The ~16 KB R1
    // budget above still holds with room to spare — the balloon this strip was built to
    // prevent is bounded by live-chewer count, not by swarm size.
    // ...but the LIFECYCLE / TARGETING fields are still stripped (scoped out of S133).
    // ⚠ Asserted against the CREATURES array only, not the whole wire string. An earlier
    // S133 draft used `expect(wire).not.toContain('targetCreatureId')`, which would have
    // gone red for a perfectly correct trim as soon as the fixture gained a defender —
    // `SerializedDefender` legitimately emits `targetCreatureId` when a turret has a live
    // target. It passed only because this fixture happens to have no defenders (CHECK F7).
    const creaturesWire = JSON.stringify(netSnapshot(host).creatures);
    // ⚠ AMENDED S134 P1 — `sourceSpawnerId` and `despawnAtTick` now RIDE THE WIRE too.
    // Both assertions read `not.toContain(...)` until S134, i.e. they LOCKED IN the bug:
    // with `despawnAtTick` stripped, `deserializeCreature` rehydrates 0, and 0 makes
    // `creatureLifecycle`'s `world.tick >= despawnAtTick` AND `hostTick` Step 1.5's
    // `world.tick >= despawnAtTick - 1` both unconditionally true — a promoted host deleted
    // its entire creature population, after first detonating every inherited drone.
    // `sourceSpawnerId` travels in the same change because the deletion was MASKING two
    // further defects it causes (per-spawner caps disabled; a rehydrated chewer counted as
    // its owner's Voltkin), which are untestable while the creatures are being deleted.
    // Inverted rather than deleted, so the contract change is explicit in the diff.
    // `targetCreatureId` stays stripped — host AI re-acquires it every IDLE tick.
    expect(creaturesWire).toContain('sourceSpawnerId');
    expect(creaturesWire).toContain('despawnAtTick');
    expect(creaturesWire).not.toContain('targetCreatureId');
    // creatureSpawners IS on the wire (clients render the spawn-zone) but only the
    // tiny identity shape — no host-only cadence words.
    // ⛔ S142 P1 — THIS GUARD IS NOW LOAD-BEARING IN A WAY IT WAS NOT BEFORE.
    // Until S142 these fields were absent from the wire BY OMISSION: `serializeSpawner`
    // never emitted them, so the assertion could not fail no matter what `netSnapshot`
    // did. They are now emitted for the LOCAL consumers (disk save + sim-worker INIT) and
    // removed from the wire by an EXPLICIT `trimMirrorSpawner` call — so this assertion is
    // the thing standing between the repo and shipping the upcoming spawn schedule to a
    // modified client (TOWER_DEFENSE_DESIGN.md §3.3). Delete that call and this goes red.
    // ⚠ Scoped to the creatureSpawners array, per the CHECK F7 lesson recorded above:
    // asserting against the whole wire string breaks the moment another entity family
    // legitimately emits a same-named key.
    const spawnersWire = JSON.stringify(netSnapshot(host).creatureSpawners);
    expect(spawnersWire).not.toContain('nextSpawnTick');
    expect(spawnersWire).not.toContain('lastValidatedTick');
    expect(spawnersWire).not.toContain('spawnedCount');
    expect(spawnersWire).not.toContain('ignitedAtTick');
    // ...and the identity half MUST still be there (an over-eager trim that emptied the
    // array would otherwise satisfy every assertion above — the vacuity trap).
    expect(spawnersWire).toContain('anchorPrimitiveId');
    expect(spawnersWire).toContain('recipeId');
  });
});

// ============================================================================
// S107 P2 — stepPhysics PHYSICS-LOOP determinism (worker-sim foundation prereq)
// ----------------------------------------------------------------------------
// The existing determinism gates above all drive the REDUCER path (dispatch).
// None drove stepPhysics() directly — yet the Verlet integrator + bond solver +
// collision grid (the part a Web Worker would actually run) is exactly where a
// non-deterministic accumulation order / iteration order / wall-clock would
// hide. The backlog names this the prerequisite that must land FIRST, before any
// collision-grid rebuild or worker cutover: it LOCKS the current physics-loop
// output so a later refactor is provably behaviour-identical. See
// WORKER_SIM_FOUNDATION.md. controls is only read for state.kind +
// applyPerSubstep(), so a no-op Idle stub fully drives the host physics path.
// ============================================================================

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function buildPhysicsWorld(seed: number): { world: World; spawner: Spawner } {
  const world = makeWorld(seed);
  const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed));
  // Scatter free sparks across the field INCLUDING near the canvas boundaries
  // (x≈50 and y≈60) so the substep verlet + spawner-bounds + collision passes
  // exercise edge cells, not just the centre.
  for (let i = 0; i < 12; i++) {
    const s = makeFreeSpark({
      id: asSparkId(5000 + i),
      type: (i % 6) as SparkType,
      pos: { x: 50 + i * 140, y: 60 + (i % 4) * 240 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark: s });
  }
  // A bonded 3-prim chain so the bond solver + STRUCTURE_GROW path run under physics.
  for (let i = 0; i < 3; i++) {
    const s = makeFreeSpark({
      id: asSparkId(6000 + i),
      type: SparkType.Line,
      pos: { x: 300 + i * 40, y: 500 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark: s });
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1, pos: { x: s.pos.x, y: s.pos.y } });
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: i === 0 ? null : asPrimitiveId(i - 1),
      stiffnessTier: 'MID',
    });
  }
  return { world, spawner };
}

function runStepPhysicsStress(world: World, spawner: Spawner, iters: number): void {
  for (let t = 0; t < iters; t++) stepPhysics(world, spawner, stubControls);
}

describe('Replay determinism — S107 P2 stepPhysics physics-loop (HARD GATE)', () => {
  const ITERS = 300;

  it('two same-seed stepPhysics runs are byte-identical (snapshot AND state hash)', () => {
    const SEED = 0xb0d1e5;
    const a = buildPhysicsWorld(SEED);
    runStepPhysicsStress(a.world, a.spawner, ITERS);
    const b = buildPhysicsWorld(SEED);
    runStepPhysicsStress(b.world, b.spawner, ITERS);
    expect(determinismJson(a.world)).toBe(determinismJson(b.world));
    expect(hashWorldState(a.world)).toBe(hashWorldState(b.world));
  });

  it('different seeds diverge (canary — the gate has real signal)', () => {
    const a = buildPhysicsWorld(0xb0d1e5);
    runStepPhysicsStress(a.world, a.spawner, ITERS);
    const b = buildPhysicsWorld(0xfeed11);
    runStepPhysicsStress(b.world, b.spawner, ITERS);
    // Different spawner streams → different spawned sparks → divergent state.
    expect(hashWorldState(a.world)).not.toBe(hashWorldState(b.world));
  });

  it('actually advances the physics loop (tick + bodies moved, not a no-op)', () => {
    const { world, spawner } = buildPhysicsWorld(0xb0d1e5);
    const before = world.primitives.size;
    runStepPhysicsStress(world, spawner, ITERS);
    expect(world.tick).toBe(ITERS); // stepPhysics increments world.tick once per call
    expect(world.primitives.size).toBe(before); // prims persist (no spurious creation/loss)
    expect(world.freeSparks.size).toBeGreaterThan(0); // the spawner kept the field populated
  });
});
