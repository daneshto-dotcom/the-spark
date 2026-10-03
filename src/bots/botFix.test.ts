/**
 * SPARK — ⭐ S194 (T7) — BOTS FIX THEIR TOWERS (canon §8, R191-B / R192-W1).
 *
 * Before S194 no bot ever sent `REPAIR_STRUCTURE` or `FIX_ALL` (grep of `src/bots` found neither), so a
 * bot tower only ever went down — and since deploy #23's nearest-enemy-first targeting a neighbour's army
 * chips it every FIGHT. `chooseFix` (botBrain) now sends the castle's FIX ALL for two or more damaged
 * towers and the card's FIX for one, in BUILD, when the seat owns a gatherer; the jobs are carried by
 * the gatherers exactly as a human's are (`repairJobs.ts`).
 *
 * MEASURED (600 s, three BALANCED bots, seeds 0xb07 / 0xbeef, real frame lifecycle) — before S194 every
 * count is 0:
 *   MID   FIX_ALL 0 · FIX 1 · jobs 1 · restored 1 · refused 0
 *   HARD  FIX_ALL 1 · FIX 3 · jobs 6 · restored 6 · refused 0
 *   IMBA  FIX_ALL 1 · FIX 1 · jobs 3 · restored 3 · refused 0
 * (300 s is too short: towers there are razed outright or untouched — HARD 1 FIX, MID/IMBA 0.)
 */

import { afterEach, describe, expect, it } from 'vitest';

import { PLAYER_COLORS } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { runGodlyMatcherCore, type GodlyMatcherCursor } from '../state/godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { fixAllTargets } from '../state/repairJobs.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import { chooseFix } from './botBrain.ts';
import { BOT_CONFIGS, botConfigFor } from './botConfig.ts';
import { BotController } from './botController.ts';
import type { BotDifficulty } from './botTypes.ts';

afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});

const stub = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

interface FixTally {
  fixAllSent: number;
  fixOneSent: number;
  /** FIX intents after which the seat's job count did not grow (a refused or empty FIX). */
  fixNoop: number;
  jobsQueued: number;
  /** Jobs that left the queue with their tower whole again (no FIX left to do on it). */
  restored: number;
  fixSentOutsideBuild: number;
}

function runFixMatch(tier: BotDifficulty, seconds: number, opts: { stripGatherersFromTick?: number } = {}): FixTally {
  const w = makeWorld(0xb07);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: [1, 2, 3],
  });
  const bots = [1, 2, 3].map(
    (s, i) => new BotController(asPlayerId(s), tier, mulberry32(((0xbeef ^ ((i + 1) * 0xb07b07)) >>> 0) || 1), 4),
  );
  const t: FixTally = { fixAllSent: 0, fixOneSent: 0, fixNoop: 0, jobsQueued: 0, restored: 0, fixSentOutsideBuild: 0 };
  // ⭐ S194 (T11 merge seam) — with `stripGatherersFromTick`, only intents sent AFTER the strip are counted:
  // before it the seat HAS gatherers and a FIX is legitimate (measured on the merged tree: 1 FIX before the
  // strip read as a false red against the negative's `toBe(0)`).
  let counting = opts.stripGatherersFromTick === undefined;
  const send = (a: GameAction): void => {
    if (!counting) { dispatch(w, a); return; }
    if (a.type === 'FIX_ALL' || a.type === 'REPAIR_STRUCTURE') {
      if (a.type === 'FIX_ALL') t.fixAllSent++;
      else t.fixOneSent++;
      if (w.matchPhase !== 'BUILD') t.fixSentOutsideBuild++;
      const before = w.repairJobs.length;
      dispatch(w, a);
      const grew = w.repairJobs.length - before;
      if (grew <= 0) t.fixNoop++;
      t.jobsQueued += Math.max(0, grew);
      return;
    }
    dispatch(w, a);
  };
  const deps = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stub,
    botManager: { tick(world: World): void { for (const b of bots) b.tick(world, send); } },
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  const cursor: GodlyMatcherCursor = { lastMatcherTick: -1 };
  // A reader, not a field access, so the compiler does not narrow `gameState` across the tick.
  const playing = (): boolean => w.gameState === 'PLAYING';
  for (let i = 0; i < 60 * seconds; i++) {
    if (opts.stripGatherersFromTick !== undefined && i >= opts.stripGatherersFromTick) {
      for (const [id, g] of [...w.gatherers]) if ((g.ownerPlayerId as unknown as number) !== 0) w.gatherers.delete(id);
      counting = true;
    }
    const jobsBefore = new Map(w.repairJobs.map((j) => [j.id, j]));
    runHostTick(w, deps, st);
    if (playing()) runGodlyMatcherCore(w, cursor);
    w.effects.length = 0;
    for (const [id, job] of jobsBefore) {
      if (w.repairJobs.some((j) => j.id === id)) continue;
      // Gone: restored if none of its shapes is on the seat's FIX list any more and they still stand.
      const listed = new Set(fixAllTargets(w, job.seat).flatMap((x) => [...x.plan.memberIds]));
      if (job.memberIds.every((m) => w.primitives.has(m)) && !job.memberIds.some((m) => listed.has(m))) t.restored++;
    }
  }
  return t;
}

describe('⭐ S194 T7 — REACH: bots FIX through the real host tick', () => {
  for (const tier of ['MID', 'HARD', 'IMBA'] as const) {
    it(`${tier}: FIX intents queue repair jobs and towers come back whole`, () => {
      const t = runFixMatch(tier, 600);
      console.log(`[S194 T7 FIX] ${tier}: ${JSON.stringify(t)}`);
      expect(t.fixAllSent + t.fixOneSent, 'FIX intents sent (0 before S194)').toBeGreaterThan(0);
      expect(t.jobsQueued, 'repair jobs queued').toBeGreaterThan(0);
      expect(t.fixSentOutsideBuild, 'FIX outside BUILD (R19)').toBe(0);
      // The PLACE-spam lesson: a proposed FIX is a FIX that queues — no refused-intent stream.
      expect(t.fixNoop, 'FIX intents that queued nothing').toBe(0);
    }, 60_000);
  }

  it('at least one bot tower is actually restored by its gatherers (the job is carried, not just queued)', () => {
    let restored = 0;
    for (const tier of ['HARD', 'IMBA'] as const) restored += runFixMatch(tier, 600).restored;
    expect(restored).toBeGreaterThan(0);
  }, 60_000);

  it('⚠ NEGATIVE: a seat with no gatherer sends no FIX (the reducer would refuse it)', () => {
    // The bots' gatherers are removed at 200 s, after their towers stand (a seat with no economy at all
    // would build nothing to fix, and the test would be vacuous — measured: the first version stripped from
    // tick 0 and stayed green with the gatherer guard deleted). Mutation, guard deleted: 1800 FIX intents,
    // every one refused by the reducer — the refused-intent stream this test exists to forbid.
    const t = runFixMatch('IMBA', 600, { stripGatherersFromTick: 200 * 60 });
    expect(t.fixAllSent + t.fixOneSent).toBe(0);
  }, 60_000);
});

describe('⭐ S194 T7 — chooseFix: the tier knob', () => {
  it('NOOB never fixes; MID/HARD/IMBA do; personalities never move it (a capability)', () => {
    expect(BOT_CONFIGS.NOOB.repairsTowers).toBe('never');
    expect(BOT_CONFIGS.MID.repairsTowers).toBe('broken');
    expect(BOT_CONFIGS.HARD.repairsTowers).toBe('any');
    expect(BOT_CONFIGS.IMBA.repairsTowers).toBe('any');
    for (const p of ['WARMONGER', 'FORTRESS', 'TYCOON', 'SABOTEUR'] as const) {
      expect(botConfigFor('HARD', p).repairsTowers).toBe('any');
    }
  });

  it('outside BUILD chooseFix is null whatever the board holds', () => {
    const w = makeWorld(0xb07);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME',
      mode: 'bots',
      isHost: true,
      roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })),
      botSeats: [1],
    });
    w.matchPhase = 'FIGHT';
    expect(chooseFix(w, asPlayerId(1), BOT_CONFIGS.IMBA)).toBeNull();
    expect(chooseFix(w, asPlayerId(1), BOT_CONFIGS.NOOB)).toBeNull();
  });
});
