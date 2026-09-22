/**
 * SPARK — S186: THE STUCK CARRIED SHAPE (owner playtest finding #11).
 *
 * He was mid-drag with a shape pulled out of his castle when the FIGHT whistle blew. The shape
 * stayed glued to his cursor **for the rest of the match**, and every further free-form pickup was
 * refused as though he were still holding something — while towers, upgrades and the castle panel
 * all kept working.
 *
 * ⛔ WHAT MADE IT MATCH-LONG, AND WHY NOTHING IN THE TREE COULD RECOVER FROM IT. `Player.kind` is
 * authoritative, wire-carried world state, and every world pickup in `controls.ts` is nested behind
 * `player?.kind === 'Idle'`. But the complete set of `DROP_SPARK` producers on the human path is
 * gated behind a LOCAL pointer gesture, so ONE lost, skipped or refused release was permanent: there
 * was no reconciler, no timeout, no key and no phase action that could clear `Carrying`. And
 * `applyControlsPerSubstep`'s defensive arm then pinned the carried spark to the cursor on every
 * substep — RENDERING the anomaly forever instead of recovering from it, which is why he described
 * it as welded on.
 *
 * ⭐ HIS RULING: IT GOES TO THE BANK. Not "back to the centre" — a loose Free spark is reaped by
 * `FREE_SPARK_TTL_TICKS` ten seconds later unless a gatherer happens to take it, so dropping it on
 * the ground loses it. The bank is where a shape pulled out of the castle came from.
 */

import { describe, expect, it } from 'vitest';
import {
  FIGHT_PHASE_TICKS,
  PHASE_DURATION_TICKS,
  PLAYER_COLORS,
  SparkType,
} from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { CarryViolation } from '../game/player.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { applyControlsPerSubstep } from '../input/controlsCore.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { applyDropSpark, bankCarriedSparksAtPhaseEdge } from './sparkLifecycle.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import type { Controls } from '../input/controls.ts';

const P1 = asPlayerId(0);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function board(): World {
  const world = makeWorld(0xc11);
  world.gameState = 'TITLE';
  dispatch(world, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
  });
  return world;
}

/** Put seat P1 into the exact stuck state: world says Carrying, spark says Carried by them. */
function putIntoCarry(world: World, type: SparkType = SparkType.Triangle): ReturnType<typeof makeFreeSpark> {
  const spark = makeFreeSpark({
    id: asSparkId(9001),
    type,
    pos: { x: 640, y: 400 },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: world.tick,
  });
  spark.state = { kind: 'Carried', carrierId: P1 };
  world.freeSparks.set(spark.id, spark);
  world.players.set(P1, { ...world.players.get(P1)!, kind: 'Carrying', carriedSparkId: spark.id });
  return spark;
}

describe('S186 #11 — the whistle rescues a shape still in hand', () => {
  it('⭐⭐ a BUILD→FIGHT whistle banks the carried shape, through the REAL host tick', () => {
    const world = board();
    expect(world.matchPhase, 'the fixture must start in BUILD').toBe('BUILD');
    const spark = putIntoCarry(world, SparkType.Triangle);
    const d = deps();
    const st = makeHostTickState(world);

    // Drive the actual phase loop across the whistle he reported — not the helper in isolation.
    for (let t = 0; t < PHASE_DURATION_TICKS + 2; t++) runHostTick(world, d, st);
    expect(world.matchPhase, 'the fixture really crossed the whistle').toBe('FIGHT');

    expect(world.players.get(P1)!.kind, 'the carry must be cleared').toBe('Idle');
    expect(world.freeSparks.has(spark.id), 'and the spark leaves the world').toBe(false);
    expect(
      world.castleBanks.get(P1)?.[SparkType.Triangle as number] ?? 0,
      'his ruling: it goes to the BANK, not onto the ground',
    ).toBeGreaterThanOrEqual(1);
  });

  it('the FIGHT→BUILD whistle rescues it too — both crossings, not just the one he hit', () => {
    const world = board();
    const d = deps();
    const st = makeHostTickState(world);
    for (let t = 0; t < PHASE_DURATION_TICKS + 2; t++) runHostTick(world, d, st);
    expect(world.matchPhase).toBe('FIGHT');

    const spark = putIntoCarry(world, SparkType.Square);
    for (let t = 0; t < FIGHT_PHASE_TICKS + 2; t++) runHostTick(world, d, st);
    expect(world.matchPhase).toBe('BUILD');

    expect(world.players.get(P1)!.kind).toBe('Idle');
    expect(world.freeSparks.has(spark.id)).toBe(false);
    expect(world.castleBanks.get(P1)?.[SparkType.Square as number] ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('⛔ THE SOFT-LOCK IS GONE: the pickup gate reads Idle again', () => {
    // `controls.ts` nests every world pickup behind `player?.kind === 'Idle'`. That predicate reading
    // 'Carrying' forever IS the match-long refusal he reported, so this is the assertion that maps
    // directly onto his complaint.
    const world = board();
    putIntoCarry(world);
    expect(world.players.get(P1)!.kind).toBe('Carrying');
    bankCarriedSparksAtPhaseEdge(world);
    expect(world.players.get(P1)!.kind, 'free-form pickup is gated on exactly this').toBe('Idle');
  });

  it('⭐⭐ and the CLIENT heals itself, because banking DELETES the spark', () => {
    /*
     * The local `ControlState` is not world state, so the host cannot clear it. A host-side DROP
     * would have left the spark Free, `mine` would recompute TRUE, and the client would have gone on
     * lerping it to the cursor — the fix would have needed a second, client-side half.
     *
     * Banking removes the spark from `world.freeSparks`, which is the very map `mine` is computed
     * from, so the stale gesture falls through the `!mine` branch that already exists and returns to
     * Idle on the next substep. This test is what proves the recovery closes itself.
     */
    const world = board();
    const spark = putIntoCarry(world);
    bankCarriedSparksAtPhaseEdge(world);

    const healed = applyControlsPerSubstep(
      world,
      P1,
      { kind: 'AttractDrag', sparkId: spark.id, cursor: { x: 640, y: 400 } },
      { x: 640, y: 400 },
      () => {
        throw new Error('the heal must not need to dispatch anything');
      },
    );
    expect(healed.kind, 'the stale gesture ends on its own').toBe('Idle');
  });

  it('is a no-op for a seat that is not carrying — it cannot invent a banked shape', () => {
    const world = board();
    const before = world.castleBanks.get(P1)?.[SparkType.Triangle as number] ?? 0;
    bankCarriedSparksAtPhaseEdge(world);
    expect(world.castleBanks.get(P1)?.[SparkType.Triangle as number] ?? 0).toBe(before);
    expect(world.players.get(P1)!.kind).toBe('Idle');
  });

  it('runs in seat order, and every carrying seat is rescued', () => {
    const world = board();
    const s0 = putIntoCarry(world, SparkType.Circle);
    const P2 = asPlayerId(1);
    const s1 = makeFreeSpark({
      id: asSparkId(9002),
      type: SparkType.Line,
      pos: { x: 700, y: 400 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: world.tick,
    });
    s1.state = { kind: 'Carried', carrierId: P2 };
    world.freeSparks.set(s1.id, s1);
    world.players.set(P2, { ...world.players.get(P2)!, kind: 'Carrying', carriedSparkId: s1.id });

    bankCarriedSparksAtPhaseEdge(world);
    expect(world.players.get(P1)!.kind).toBe('Idle');
    expect(world.players.get(P2)!.kind).toBe('Idle');
    expect(world.freeSparks.has(s0.id)).toBe(false);
    expect(world.freeSparks.has(s1.id)).toBe(false);
    expect(world.castleBanks.get(P1)?.[SparkType.Circle as number] ?? 0).toBeGreaterThanOrEqual(1);
    expect(world.castleBanks.get(P2)?.[SparkType.Line as number] ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('S186 #11 — the drop is TOTAL, so the rescue path cannot itself strand a player', () => {
  it('⛔ a missing carried spark CLEARS the carry instead of throwing', () => {
    // It used to `throw` BEFORE `fsmDrop`, so the one path that could rescue a stuck player failed by
    // leaving them stuck. On the solo/host path `main.ts` dispatches un-try/caught, so it also killed
    // the authoritative tick; on the joiner and worker paths it vanished into empty `catch {}` blocks.
    const world = board();
    world.players.set(P1, {
      ...world.players.get(P1)!,
      kind: 'Carrying',
      carriedSparkId: asSparkId(4242), // never existed
    });
    expect(() =>
      applyDropSpark(world, { type: 'DROP_SPARK', playerId: P1, pos: { x: 10, y: 20 } }),
    ).not.toThrow();
    expect(world.players.get(P1)!.kind).toBe('Idle');
  });

  it('⚠ but CarryViolation still throws — that one is a CALLER bug, not a world anomaly', () => {
    // Pinned in sparkLifecycle.test.ts and player.test.ts; the S186 change must not weaken it.
    const world = board();
    expect(() =>
      applyDropSpark(world, { type: 'DROP_SPARK', playerId: P1, pos: { x: 10, y: 20 } }),
    ).toThrow(CarryViolation);
  });
});
