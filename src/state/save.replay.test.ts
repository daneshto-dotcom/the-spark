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
import { asPlayerId, asSparkId } from '../types.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { snapshot } from './save.ts';
import { tickScoring } from './scoring.ts';

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
