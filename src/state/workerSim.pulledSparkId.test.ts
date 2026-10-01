/**
 * ⛔ S191 C-1 — THE `?worker=1` INIT SEAM NEVER REPAIRED THE PULLED-SHAPE ALLOCATOR.
 *
 * `world.nextPulledSparkId` is the DESCENDING allocator a castle PULL mints from (−1, −2, −3 …). It is
 * not serialized — `save.ts` has no occurrence of it — so `restore()` leaves it at `makeWorld`'s −1.
 * The two MAIN-thread adoption paths (the worker-failure repair and the migration takeover, both in
 * `main.ts`) repair it through `rebuildAuthorityAllocators`; the worker's own startup restore
 * (`makeWorkerSim`) did not. A worker adopted mid-match therefore resumed at −1 while `freeSparks`
 * already held live pulled shapes at −1, −2 — and its first PULL_FROM_BANK did
 * `freeSparks.set(−1, …)` over the top of a living shape. Silent data loss, not a desync: the worker
 * is the only sim once adopted, so nothing disagrees with it. Latent while `WORKER_DEFAULT_ON` is off.
 *
 * Every assertion here goes through the REAL seams: the reducer mints the source's pulls, the INIT is
 * `snapshot()` → `makeWorkerSim` exactly as `main.ts` builds it, and the worker's pull is an intent on
 * a real `applyTickBatch` (which runs `runHostTick`).
 */
import { describe, expect, it } from 'vitest';
import { SparkType } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { bankAdd } from './castleBank.ts';
import { mulberry32 } from './rng.ts';
import { snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { applyTickBatch, makeWorkerSim, type WorkerSim } from './workerSim.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);

function soloWorld(banked: readonly SparkType[]): World {
  const w = makeWorld(0x5191c001);
  w.gameState = 'TITLE';
  dispatch(w, { type: 'START_GAME', mode: 'solo', isHost: true });
  for (const t of banked) bankAdd(w.castleBanks, P0, t);
  return w;
}

/** The production INIT seam: `snapshot(world, { spawnerState })` JSON → `makeWorkerSim`. */
function adopt(w: World): WorkerSim {
  const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1));
  const saveJson = JSON.stringify(snapshot(w, { spawnerState: spawner.getState() }));
  return makeWorkerSim({ type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0 });
}

/** One real worker batch: the pull rides as an intent, then one host tick runs. */
function pullThroughWorker(sim: WorkerSim, sparkType: SparkType): void {
  applyTickBatch(sim, {
    type: 'TICK_BATCH',
    batchSeq: 1,
    ticks: 1,
    control: { state: { kind: 'Idle' }, cursor: { x: 0, y: 0 } },
    alivePeerIds: null,
    intents: [{ type: 'PULL_FROM_BANK', playerId: P0, sparkType }],
    nowMs: 0,
  });
}

function pulledIds(w: World): number[] {
  return [...w.freeSparks.keys()].map((k) => k as unknown as number).filter((id) => id < 0).sort((a, b) => b - a);
}

describe('S191 C-1 — worker INIT repairs nextPulledSparkId', () => {
  it('⛔ a worker adopted with live pulled shapes mints BELOW them — never over the top of one', () => {
    const w = soloWorld([SparkType.Triangle, SparkType.Circle, SparkType.Square]);
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Triangle }); // −1
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Circle }); // −2
    expect(w.freeSparks.get(asSparkId(-1))?.type).toBe(SparkType.Triangle);
    expect(w.freeSparks.get(asSparkId(-2))?.type).toBe(SparkType.Circle);
    expect(w.nextPulledSparkId).toBe(-3);

    const sim = adopt(w);
    pullThroughWorker(sim, SparkType.Square);
    const f = sim.world.freeSparks;
    // Pre-fix the Square was minted at −1 and EVICTED the live Triangle with no despawn.
    expect(f.get(asSparkId(-1))?.type).toBe(SparkType.Triangle);
    expect(f.get(asSparkId(-2))?.type).toBe(SparkType.Circle);
    expect(f.get(asSparkId(-3))?.type).toBe(SparkType.Square);
    expect(pulledIds(sim.world)).toEqual([-1, -2, -3]);
    expect(sim.world.nextPulledSparkId).toBe(-4);
  });

  it('⭐ and when the newest pull is still live, the adoption is bit-exact again (full-world hash)', () => {
    // `hashWorldStateFull` projects `nextPulledSparkId`, so pre-fix this compare was RED on every
    // mid-match adoption that held a pulled shape: −1 on the worker against −3 on the source.
    // ⚠ ONE SHAPE STAYS BANKED ON PURPOSE. A bank a pull has EMPTIED keeps an all-zero tally in the
    // live map (`cb0:0.0.0.0.0.0` in the wide hash) while `serializeCastleBanks` skips zero tallies,
    // so its restore holds no entry and the wide hash differs for a reason that is not this fix —
    // a pre-existing, test-oracle-only asymmetry (the narrow production hash does not project banks),
    // reported by S191 C-1 rather than fixed here (`save.ts` / `stateHashFull.ts` are hotspots).
    const w = soloWorld([SparkType.Triangle, SparkType.Circle, SparkType.Square]);
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Triangle });
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Circle });
    const sim = adopt(w);
    expect(hashWorldStateFull(sim.world)).toBe(hashWorldStateFull(w));
  });

  it('⛔ the LOWEST id is live while a middle one was consumed — the repair reads the minimum, not the count', () => {
    const w = soloWorld([SparkType.Triangle, SparkType.Circle, SparkType.Square, SparkType.Dot]);
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Triangle }); // −1
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Circle }); // −2
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Square }); // −3
    // −2 leaves the board (placed / collected) — two live pulled shapes, but the lowest is −3.
    w.freeSparks.delete(asSparkId(-2));
    const sim = adopt(w);
    expect(sim.world.nextPulledSparkId).toBe(-4); // a count-based repair would say −3 and collide
    pullThroughWorker(sim, SparkType.Dot);
    expect(sim.world.freeSparks.get(asSparkId(-3))?.type).toBe(SparkType.Square);
    expect(sim.world.freeSparks.get(asSparkId(-4))?.type).toBe(SparkType.Dot);
    expect(pulledIds(sim.world)).toEqual([-1, -3, -4]);
  });

  it('⚠ the NEWEST pull consumed: the scan re-uses that dead id — collision-free, and NOT bit-exact', () => {
    // The scan can only see LIVE ids, so when the newest pull has already left the board the worker
    // resumes one ABOVE the source's counter and re-mints the dead id. That is the same trade both
    // main-thread repair paths make (`rebuildAuthorityAllocators`' docblock: every consumer keys off
    // live maps, so a dead id is safe to reuse). Pinned so the non-bit-exactness is a measured fact:
    // making it bit-exact needs the counter serialized (a `save.ts` hotspot change), not this seam.
    const w = soloWorld([SparkType.Triangle, SparkType.Circle, SparkType.Square, SparkType.Dot]);
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Triangle }); // −1
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Circle }); // −2
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Square }); // −3
    w.freeSparks.delete(asSparkId(-3));
    expect(w.nextPulledSparkId).toBe(-4);
    const sim = adopt(w);
    expect(sim.world.nextPulledSparkId).toBe(-3);
    pullThroughWorker(sim, SparkType.Dot);
    expect(sim.world.freeSparks.get(asSparkId(-1))?.type).toBe(SparkType.Triangle);
    expect(sim.world.freeSparks.get(asSparkId(-2))?.type).toBe(SparkType.Circle);
    expect(sim.world.freeSparks.get(asSparkId(-3))?.type).toBe(SparkType.Dot);
  });

  it('negative — a save with NO pulled shape adopts at −1, bit-exact, exactly as before the fix', () => {
    // The common `?worker=1` case (adoption on the first PLAYING frames) must be byte-identical.
    const w = soloWorld([SparkType.Triangle]);
    const sim = adopt(w);
    expect(sim.world.nextPulledSparkId).toBe(-1);
    expect(hashWorldStateFull(sim.world)).toBe(hashWorldStateFull(w));
    pullThroughWorker(sim, SparkType.Triangle);
    expect(pulledIds(sim.world)).toEqual([-1]);
  });
});
