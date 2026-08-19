/**
 * SPARK — S148 P1: DOES THE OPENING BUILD STILL FUND A TOWER?
 *
 * The zone partition moved every castle to an extremity, which took the quarry-rim-to-castle haul
 * from 295 px to 800.7 px on `QUADRANTS_4P` — **2.71x**. That is a big enough change to the economy
 * that "it should be fine" is not an answer, so this file MEASURES it by running the real haul loop
 * over a real BUILD stage and asserting the outcome the owner ruled:
 *
 *   ⭐ OWNER RULING (S148): a first tower must be affordable inside ONE 90 s BUILD with **zero
 *     upgrades bought**. Not "affordable if you play well" — affordable flat.
 *
 * WHY THAT RULING IS A REAL CONSTRAINT AND NOT A FORMALITY (S148 A.0 delta D4): the opening BUILD is
 * hard-locked to ONE gatherer. `STARTING_VICTORY_POINTS` is 100 and `GATHERER_PRICE` is 105, so a
 * second hauler is unbuyable; and S147 R3 gated income to FIGHT, so no points accrue during BUILD to
 * change that. Whatever one gatherer can carry in 5400 ticks IS the opening economy.
 *
 * The target is the Stink Tower — `STINK_TOWER_SIZE` 4, built from 1 Square + 3 Circle — requested
 * through the gatherer ORDER QUEUE, which is how a player asks for specific shapes.
 *
 * ⚠ THIS IS A MEASUREMENT, SO IT MUST NOT BE ABLE TO PASS VACUOUSLY. Three separate controls below:
 * the run must actually spawn sparks, the gatherer must actually complete round trips, and the
 * assertions are on DELIVERED SHAPES rather than on elapsed ticks. The S147 lesson — a negative or
 * threshold test needs a positive control proving the thing it watches for was possible at all.
 */
import { describe, expect, it } from 'vitest';

import {
  GATHERER_BASE_SPEED,
  PHASE_DURATION_TICKS,
  SparkType,
  STINK_TOWER_SIZE,
} from '../../constants.ts';
import { bankOf } from '../castleBank.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asPlayerId } from '../../types.ts';
import { zoneCastleAnchor, type ZoneLayout } from '../zones.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import type { Controls } from '../../input/controls.ts';

/** The host loop needs a controls object; nothing here drives the cursor. */
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function hostDeps(seed = 1): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

const P0 = asPlayerId(0);
/** The Stink Tower's bill: 1 Square hub + 3 Circle leaves. */
const WANTED: readonly SparkType[] = [SparkType.Square, SparkType.Circle, SparkType.Circle, SparkType.Circle];

/** A PLAYING world on `layout`, seated for that board, with the clock at the start of a BUILD. */
function openingBuild(layout: ZoneLayout): World {
  const seats = layout === 'PITCH_2P' ? 2 : 4;
  const world = makeWorld(20260819);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: seats }, (_, seat) => ({ seat, color: 0x111111 * (seat + 1) }));
  dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true, roster });
  // The board must be the one under test — assert rather than assume, so a change to
  // `layoutForSeatCount` shows up here as a failure instead of silently measuring the other board.
  expect(world.layout).toBe(layout);
  return world;
}

/** Run one full BUILD stage, returning what seat 0's castle banked. */
function runOneBuildStage(world: World): { banked: readonly number[]; sparksSpawned: number } {
  // Ask for exactly the tower's bill. `pickGathererTarget` treats an order as a priority override,
  // so the hauler fetches these types ahead of anything nearer.
  for (const t of WANTED) {
    dispatch(world, { type: 'ENQUEUE_GATHERER_ORDER', playerId: P0, sparkType: t });
  }
  const deps = hostDeps();
  const state = makeHostTickState(world);
  const seenIds = new Set<number>();
  // A FULL build stage, driven through the real host loop — same entry point production uses, so
  // the spawner, the gatherer tick and the deposit path are all the shipped ones.
  for (let i = 0; i < PHASE_DURATION_TICKS; i++) {
    runHostTick(world, deps, state);
    for (const s of world.freeSparks.values()) seenIds.add(s.id as unknown as number);
  }
  const sparksSpawned = seenIds.size;
  return { banked: bankOf(world.castleBanks, P0), sparksSpawned };
}

describe('S148 P1 — the opening BUILD funds a first tower on BOTH boards, un-upgraded', () => {
  it.each(['PITCH_2P', 'QUADRANTS_4P'] as const)(
    '%s — one gatherer, no upgrades, banks enough for a Stink Tower inside one 90 s BUILD',
    (layout) => {
      const world = openingBuild(layout);

      // POSITIVE CONTROL 1 — exactly one gatherer, and it is the un-upgraded one. If a future change
      // seeds two, this measurement stops describing the opening and must be re-derived.
      const mine = [...world.gatherers.values()].filter((g) => g.ownerPlayerId === P0);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.speedLevel ?? 0).toBe(0);

      // POSITIVE CONTROL 2 — the haul really is the long one. This is the number the speed constant
      // was derived against; if the anchors move, this fails and the derivation gets revisited.
      const anchor = zoneCastleAnchor(0, layout);
      const haul = Math.hypot(anchor.x - 960, anchor.y - 540) - 125;
      expect(haul).toBeGreaterThan(700);

      const { banked, sparksSpawned } = runOneBuildStage(world);

      // POSITIVE CONTROL 3 — the faucet ran. Without this the whole test could pass on an empty
      // board if a future change accidentally gated spark spawning.
      expect(sparksSpawned).toBeGreaterThan(50);

      // ⭐ THE RULING. Enough total shapes for the tower, AND the right ones.
      const total = banked.reduce((a, b) => a + b, 0);
      expect(
        total,
        `${layout}: banked only ${total} shapes in one BUILD at speed ${GATHERER_BASE_SPEED}; ` +
          `a Stink Tower needs ${STINK_TOWER_SIZE}`,
      ).toBeGreaterThanOrEqual(STINK_TOWER_SIZE);
      expect(banked[SparkType.Square as number] ?? 0, `${layout}: no Square for the hub`).toBeGreaterThanOrEqual(1);
      expect(banked[SparkType.Circle as number] ?? 0, `${layout}: not enough Circles`).toBeGreaterThanOrEqual(3);

      // ⭐ AND THE MARGIN, WHICH IS THE PART THAT ACTUALLY PINS `GATHERER_BASE_SPEED`.
      //
      // ⚠ THE ASSERTIONS ABOVE DO NOT DISCRIMINATE, AND SAYING SO IS THE POINT. Measured: at the
      // OLD speed of 1.9 this board still banks 6 shapes with the full bill, so every assertion
      // above passes at either speed and none of them is evidence that the raise to 2.6 was needed.
      // A test that would have gone green regardless proves nothing about the change it sits next
      // to — the S147 lesson about vacuous coverage, applied to a threshold rather than a negative.
      //
      // This one does discriminate: 6 banked at 1.9, 8-9 at 2.6. It pins the HEADROOM the raise was
      // actually bought for (~2x the tower's cost, so a mis-ordered queue does not waste a whole
      // BUILD stage), and it fails if a future retune quietly gives that headroom back.
      expect(
        total,
        `${layout}: only ${total} banked — the un-upgraded opening should carry roughly double a ` +
          `tower's ${STINK_TOWER_SIZE} shapes. At GATHERER_BASE_SPEED 1.9 this measured 6.`,
      ).toBeGreaterThanOrEqual(7);
    },
  );
});
