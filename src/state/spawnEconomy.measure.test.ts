/**
 * SPARK — S186: THE SPAWN ECONOMY, MEASURED THROUGH THE REAL HOST TICK.
 *
 * Owner, S186: *"every wave the primitives need to be spawned quicker and quicker. So far it does
 * that but not fast enough — because at wave like six or seven all your gatherers are waiting in
 * line and not moving until the shapes come up."*
 *
 * ⛔ THIS FILE EXISTS BECAUSE TWO INDEPENDENT ANALYSES DISAGREED ABOUT THE CAUSE, AND THE PROJECT'S
 * OWN RULE IS THAT AN ECONOMY IS RE-RUN RATHER THAN REASONED ABOUT (`castleGuns.test.ts` is the
 * precedent, and S181 proved the point when guessing the siege from the pool ratio alone was wrong).
 * One analysis said `FREE_SPARK_SOFT_CAP` was destroying the ramp's output from wave 7 on. Its
 * adversarial verifier said a POOL cap cannot throttle an ARRIVAL rate, and that when gatherers are
 * starving the pool sits near zero so the cap never fires at all. Both are plausible on paper.
 *
 * ⭐ THE LOOP SETTLED IT, AND THE VERIFIER WAS RIGHT. Measured with an idle fleet (the upper bound on
 * the pool), the peak standing pool at the owner's wave 6–7 was **18–19 against a cap of 24** — the
 * cap was NOT binding in his regime. His own hypothesis was the correct one: the faucet is the
 * limiter, and spec (B) is the right lever.
 *
 * ⛔ AND THE MEASUREMENT FOUND A SECOND CAUSE NOBODY HAD NAMED, WHICH NO FAUCET NUMBER FIXES —
 * see `the quarry a new BUILD opens onto` below.
 *
 * Every number here is produced by driving `stepPhysics` — the real production spawn path, including
 * the BUILD-only dispatch gate, the TTL reap and the cap — never by arithmetic over the constants.
 */

import { describe, expect, it } from 'vitest';
import {
  FIGHT_PHASE_TICKS,
  FREE_SPARK_POOL_CEILING,
  FREE_SPARK_SOFT_CAP,
  FREE_SPARK_TTL_TICKS,
  PHASE_DURATION_TICKS,
  PHYSICS_HZ,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SPAWN_RATE_PER_SECOND,
  freeSparkSoftCapForWave,
  waveSpawnMultiplier,
} from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { stepPhysics } from '../physics/physicsLoop.ts';
import { mulberry32 } from './rng.ts';
import { makeWorld, type World } from './world.ts';
import type { Controls } from '../input/controls.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

/** A shape only counts as SUPPLY if a gatherer can actually take it — `isHarvestable`'s own test. */
function harvestable(world: World): number {
  let n = 0;
  for (const s of world.freeSparks.values()) {
    if (s.state.kind !== 'Free' || s.escrow !== undefined) continue;
    const dx = s.pos.x - SPAWNER_CENTER_X;
    const dy = s.pos.y - SPAWNER_CENTER_Y;
    if (dx * dx + dy * dy <= SPAWNER_RADIUS * SPAWNER_RADIUS) n++;
  }
  return n;
}

interface WaveRun {
  spawned: number;
  poolAtBuildEnd: number;
  peakPool: number;
  poolAtFightEnd: number;
  ticksToEmptyInFight: number | null;
}

/**
 * One full BUILD (spawning) then one full FIGHT (dispatch gated off, reap still running) at a fixed
 * wave, with NO gatherers — so the pool figures are the IDLE-FLEET upper bound, which is the regime
 * in which the cap can bind at all.
 */
function runWave(wave: number): WaveRun {
  const world = makeWorld(0x5186);
  world.waveNumber = wave;
  world.matchPhase = 'BUILD';
  const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(11));

  const seen = new Set<number>();
  const census = (): void => {
    for (const id of world.freeSparks.keys()) seen.add(id as unknown as number);
  };

  let peakPool = 0;
  for (let t = 0; t < PHASE_DURATION_TICKS; t++) {
    stepPhysics(world, spawner, stubControls);
    world.tick++;
    census();
    peakPool = Math.max(peakPool, harvestable(world));
  }
  const poolAtBuildEnd = harvestable(world);

  world.matchPhase = 'FIGHT';
  let ticksToEmptyInFight: number | null = null;
  for (let t = 0; t < FIGHT_PHASE_TICKS; t++) {
    stepPhysics(world, spawner, stubControls);
    world.tick++;
    if (ticksToEmptyInFight === null && harvestable(world) === 0) ticksToEmptyInFight = t;
  }
  return {
    spawned: seen.size,
    poolAtBuildEnd,
    peakPool,
    poolAtFightEnd: harvestable(world),
    ticksToEmptyInFight,
  };
}

describe('S186 — what the quarry actually delivers, wave by wave', () => {
  it('⭐ MEASURES the supply, and prints the table the owner can be shown', () => {
    const rows = [1, 5, 6, 10, 15, 20, 25].map((w) => ({ w, ...runWave(w) }));
    // eslint-disable-next-line no-console
    console.info(
      '\n[S186 SPAWN ECONOMY — every figure driven through stepPhysics, idle fleet]\n' +
        'wave | mult | shapes/s | spawned/BUILD | peak pool | cap | pool@FIGHT-end\n' +
        rows
          .map((r) => {
            const m = waveSpawnMultiplier(r.w);
            return (
              `${String(r.w).padStart(4)} | ${m.toFixed(2).padStart(5)} | ` +
              `${(SPAWN_RATE_PER_SECOND * m).toFixed(2).padStart(8)} | ` +
              `${String(r.spawned).padStart(13)} | ${String(r.peakPool).padStart(9)} | ` +
              `${String(freeSparkSoftCapForWave(r.w)).padStart(3)} | ${String(r.poolAtFightEnd).padStart(14)}`
            );
          })
          .join('\n'),
    );

    // The step-up must be VISIBLE in delivered shapes, not merely in the constant. Wave 6 against
    // wave 5 is the boundary he actually complained about.
    const w5 = rows.find((r) => r.w === 5)!;
    const w6 = rows.find((r) => r.w === 6)!;
    expect(w6.spawned, 'wave 6 must deliver materially more than wave 5').toBeGreaterThan(
      w5.spawned * 1.5,
    );
    // And every later band must out-deliver the one before it.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.spawned, `wave ${rows[i]!.w} vs ${rows[i - 1]!.w}`).toBeGreaterThan(
        rows[i - 1]!.spawned,
      );
    }
  });

  it('⛔ THE QUARRY IS EMPTY AT EVERY BUILD WHISTLE FROM WAVE 2 ON — the second, unnamed cause', () => {
    /*
     * The spawn DISPATCH is BUILD-gated (`physicsLoop`, S149 P2) but `reapExpiredFreeSparks` is
     * called UNCONDITIONALLY, and FIGHT is 3600 ticks against a 600-tick TTL. So every unclaimed
     * shape ages out in the first ~10 s of the fight and NOTHING replaces it for the remaining ~50 s.
     *
     * ⭐ THIS IS WHY A FASTER FAUCET ALONE CANNOT FULLY FIX HIS REPORT, AND IT IS WORTH TELLING HIM.
     * At the next BUILD whistle the whole gatherer fleet is released on one tick onto an EMPTY
     * quarry and walks ~870 px as one synchronised pack — "waiting in line and not moving", verbatim.
     * A bigger faucet shortens that window; it does not remove it. The one-line fix (do not reap
     * during FIGHT, so the last BUILD's surplus greets them) is a balance change he has not asked
     * for, so it is MEASURED AND REPORTED here rather than taken.
     */
    expect(FIGHT_PHASE_TICKS).toBeGreaterThan(FREE_SPARK_TTL_TICKS);
    const r = runWave(6);
    expect(r.poolAtFightEnd, 'the quarry a new BUILD opens onto').toBe(0);
    expect(
      r.ticksToEmptyInFight,
      'and it empties early in the fight, not at the end of it',
    ).toBeLessThanOrEqual(FREE_SPARK_TTL_TICKS + PHYSICS_HZ);
  });

  it('⚠ the cap tracks the faucet instead of throttling it, and stays inside its perf ceiling', () => {
    // Wave 1 must be byte-unchanged — the floor is today's constant.
    expect(freeSparkSoftCapForWave(1)).toBe(FREE_SPARK_SOFT_CAP);
    // It rises with the faucet...
    expect(freeSparkSoftCapForWave(6)).toBeGreaterThan(FREE_SPARK_SOFT_CAP);
    for (let w = 1; w < 30; w++) {
      expect(freeSparkSoftCapForWave(w + 1)).toBeGreaterThanOrEqual(freeSparkSoftCapForWave(w));
    }
    // ...but never past the display-list / vortex-scan bound.
    for (let w = 1; w <= 60; w++) {
      expect(freeSparkSoftCapForWave(w)).toBeLessThanOrEqual(FREE_SPARK_POOL_CEILING);
    }
    // 4x today's cap — deliberately inside vortex.ts's own "order of magnitude" tolerance.
    expect(FREE_SPARK_POOL_CEILING).toBe(FREE_SPARK_SOFT_CAP * 4);
  });
});
