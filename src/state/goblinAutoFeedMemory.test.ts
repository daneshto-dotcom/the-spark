/**
 * SPARK — ⭐ S193 round 2 (owner T4, audit follow-ups) — ONE BITE MUST NOT WIPE THE TOGGLES, and the
 * runner keeps the forensic counters clean.
 *
 * The revalidation poll removes a goblin tower's spawner the moment one own connector falls; FIX then
 * re-ignites it at the same anchor. `World.goblinAutoFeedMemory` carries the toggles across that gap
 * (⚠ MINE), keyed by the standing anchor; a tower whose anchor is destroyed starts OFF.
 */

import { describe, expect, it } from 'vitest';
import { ALL_SPARK_TYPES, PLAYER_COLORS, REVALIDATE_INTERVAL_TICKS, SparkType } from '../constants.ts';
import { blueprintBill } from './blueprints.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { bankAdd, makeCastleBank } from './castleBank.ts';
import { runSpawnerIgnition } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { AUTO_FEED_POLL_TICKS, runGoblinAutoFeed } from './goblinAutoFeed.ts';
import type { CreatureSpawner } from './spawners/spawner.ts';
import { netSnapshot, restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { asPlayerId, asPrimitiveId, type PlayerId, type PrimitiveId, type SpawnerId } from '../types.ts';
import './godlyRecipes/registerAll.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function towerWorld(seed = 0x193b): { w: World; t: SpawnerId } {
  const w = makeWorld(seed);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.creatures.clear();
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('goblinTower')) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'goblinTower', centre: { x: 420, y: 400 } });
  runSpawnerIgnition(w);
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 100_000;
  w.castleBanks.set(P0, makeCastleBank());
  const t = [...w.creatureSpawners.values()].find((s) => s.recipeId === 'goblinTower')!.id;
  return { w, t };
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function run(w: World, ticks: number): void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls, botManager: null, gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  for (let i = 0; i < ticks; i++) runHostTick(w, d, st);
}
const bankN = (w: World, seat: PlayerId, type: SparkType, n: number): void => {
  for (let i = 0; i < n; i++) bankAdd(w.castleBanks, seat, type);
};
const toggle = (w: World, seat: PlayerId, t: SpawnerId, type: SparkType, on = true): void => {
  dispatch(w, { type: 'SET_AUTO_FEED', playerId: seat, spawnerId: t, sparkType: type, on });
};
const fed = (w: World, t: SpawnerId) => [...w.creatures.values()].filter((c) => c.sourceSpawnerId === t);

/** Sever one of the tower's own connectors and let the REAL host poll remove the spawner. */
function bite(w: World, t: SpawnerId): void {
  const sp = w.creatureSpawners.get(t)!;
  const anchor = w.primitives.get(sp.anchorPrimitiveId)!;
  const bondId = [...anchor.bonds][0]!;
  dispatch(w, { type: 'SEVER_BOND', bondId, playerId: P1, cause: 'creature' } as never);
  run(w, REVALIDATE_INTERVAL_TICKS * 2 + 2);
  expect(w.creatureSpawners.has(t), 'fixture: one bite removed the spawner').toBe(false);
}
function fixAndReignite(w: World, anchor: PrimitiveId): CreatureSpawner | undefined {
  w.matchPhase = 'BUILD';
  for (const type of ALL_SPARK_TYPES) if (type !== SparkType.Square && type !== SparkType.Spiral) bankN(w, P0, type, 6);
  dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: anchor });
  runSpawnerIgnition(w);
  return [...w.creatureSpawners.values()].find((s) => s.recipeId === 'goblinTower');
}

describe('⭐ S193 round 2 — remembered by anchor across REMOVE / REGISTER', () => {
  it('⭐ REACH: toggle → sever one connector (the host poll removes it) → FIX → the toggles are back ON, and it builds', () => {
    const { w, t } = towerWorld();
    toggle(w, P0, t, SparkType.Square);
    toggle(w, P0, t, SparkType.Spiral);
    w.creatureSpawners.get(t)!.autoFeedCursor = 4;
    const anchor = w.creatureSpawners.get(t)!.anchorPrimitiveId;
    bite(w, t);
    expect(w.goblinAutoFeedMemory.get(anchor), 'remembered at the standing anchor')
      .toEqual({ owner: P0, mask: (1 << 3) | (1 << 5), cursor: 4 });
    const back = fixAndReignite(w, anchor);
    expect(back, 'fixture: FIX re-ignited the tower').toBeDefined();
    expect(back!.anchorPrimitiveId).toBe(anchor);
    expect(back!.autoFeedMask).toBe((1 << 3) | (1 << 5));
    expect(back!.autoFeedCursor).toBe(4);
    expect(w.goblinAutoFeedMemory.size, 'the entry is consumed').toBe(0);
    w.matchPhase = 'FIGHT';
    bankN(w, P0, SparkType.Spiral, 1);
    run(w, AUTO_FEED_POLL_TICKS * 2);
    expect(fed(w, back!.id).map((c) => c.type)).toEqual(['goblinBat']);
  });

  it('⛔ NEGATIVE: the ANCHOR destroyed → nothing is remembered (the tower starts OFF wherever it is rebuilt)', () => {
    const { w, t } = towerWorld();
    toggle(w, P0, t, SparkType.Square);
    const anchor = w.creatureSpawners.get(t)!.anchorPrimitiveId;
    w.primitives.delete(anchor);
    run(w, REVALIDATE_INTERVAL_TICKS * 2 + 2);
    expect(w.creatureSpawners.has(t)).toBe(false);
    expect(w.goblinAutoFeedMemory.size, 'a destroyed tower leaves nothing behind').toBe(0);
  });

  it('⛔ NEGATIVE: an untoggled tower leaves nothing; a stale entry is pruned once its anchor goes', () => {
    const { w, t } = towerWorld();
    const anchor = w.creatureSpawners.get(t)!.anchorPrimitiveId;
    bite(w, t);
    expect(w.goblinAutoFeedMemory.size, 'nothing to remember').toBe(0);
    w.goblinAutoFeedMemory.set(anchor, { owner: P0, mask: 1, cursor: 0 });
    w.primitives.delete(anchor);
    dispatch(w, { type: 'REMOVE_SPAWNER', spawnerId: 999 as unknown as SpawnerId } as never);
    expect(w.goblinAutoFeedMemory.size, 'pruned').toBe(0);
  });

  it('⛔ NEGATIVE: another seat registering at the anchor does not inherit the toggles (and consumes them)', () => {
    const { w } = towerWorld();
    const anchor = asPrimitiveId(w.nextPrimitiveId++);
    w.primitives.set(anchor, { ...[...w.primitives.values()][0]!, id: anchor } as never);
    w.goblinAutoFeedMemory.set(anchor, { owner: P0, mask: 0b1000, cursor: 0 });
    dispatch(w, { type: 'REGISTER_SPAWNER', ownerPlayerId: P1, anchorPrimitiveId: anchor, recipeId: 'goblinTower' } as never);
    const sp = [...w.creatureSpawners.values()].find((s) => s.anchorPrimitiveId === anchor)!;
    expect(sp.autoFeedMask).toBe(0);
    expect(w.goblinAutoFeedMemory.size).toBe(0);
  });

  it('cleared on the title return and at match start', () => {
    const { w } = towerWorld();
    const anchor = [...w.primitives.keys()][0]!;
    w.goblinAutoFeedMemory.set(anchor, { owner: P0, mask: 1, cursor: 0 });
    dispatch(w, { type: 'RETURN_TO_TITLE' } as never);
    expect(w.goblinAutoFeedMemory.size).toBe(0);
    w.goblinAutoFeedMemory.set(anchor, { owner: P0, mask: 1, cursor: 0 });
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
    } as never);
    expect(w.goblinAutoFeedMemory.size).toBe(0);
  });

  it('FOUR SITES — disk + worker INIT keep it, the WIRE strips it, the wide hash sees it', () => {
    const { w } = towerWorld();
    const anchor = [...w.primitives.keys()][0]!;
    const h0 = hashWorldStateFull(w);
    w.goblinAutoFeedMemory.set(anchor, { owner: P0, mask: 0b100001, cursor: 3 });
    expect(hashWorldStateFull(w), 'gm: contributes').not.toBe(h0);
    const disk = makeWorld(1);
    restore(snapshot(w), disk); // the worker INIT adopts this same JSON save
    expect(disk.goblinAutoFeedMemory.get(anchor)).toEqual({ owner: P0, mask: 0b100001, cursor: 3 });
    expect(JSON.stringify(netSnapshot(w)), 'host-only').not.toContain('goblinAutoFeedMemory');
  });
});

describe('⭐ S193 round 2 — the runner skips a benched / eliminated seat, so the forensic counters stay clean', () => {
  it('⛔ benched: no feed AND no actorBenched reject from the runner (mutation-tested)', () => {
    /*
     * ⚠ MUTATION-TESTED (S193 round 2): deleting the runner's `isBenched … || isEliminated` skip keeps
     * the goblins unbuilt (dispatch's bench gate still refuses) but turns THIS red — the counter climbs.
     */
    const { w, t } = towerWorld();
    w.players.get(P0)!.benchedUntilTick = w.tick + AUTO_FEED_POLL_TICKS * 4;
    toggle(w, P0, t, SparkType.Square);
    bankN(w, P0, SparkType.Square, 2);
    const before = w.diagnostics.rejectReasons.actorBenched;
    run(w, AUTO_FEED_POLL_TICKS * 3);
    expect(fed(w, t)).toEqual([]);
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(before);
  });

  it('⛔ eliminated: no feed, no actorEliminated reject from the runner', () => {
    const { w, t } = towerWorld();
    toggle(w, P0, t, SparkType.Square);
    bankN(w, P0, SparkType.Square, 2);
    w.players.get(P0)!.castleHp = 0;
    const before = w.diagnostics.rejectReasons.actorEliminated;
    for (let i = 0; i < AUTO_FEED_POLL_TICKS; i++) {
      w.tick++;
      runGoblinAutoFeed(w);
    }
    expect(fed(w, t)).toEqual([]);
    expect(w.diagnostics.rejectReasons.actorEliminated).toBe(before);
  });
});
