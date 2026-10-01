/**
 * SPARK — ⭐⭐ S193 (owner T4) — THE GOBLIN TOWER'S AUTO-BUILD TOGGLES, through the REAL host tick.
 *
 * > *"each time I have free space in the goblin tower … and if you have the shapes in your castle it
 * > actually builds the … shield goblin … automatically."*
 *
 * REACH: a built, ignited goblin tower; Square toggled through `SET_AUTO_FEED`; the real `runHostTick`
 * builds shield goblins from the bank until the tower is full, and refills a freed slot.
 * NEGATIVES: toggle off · empty bank · full tower · someone else's tower · a race tower · a malformed
 * intent · a benched seat (toggle allowed, feeds wait) · an eliminated seat.
 * ORDER: round-robin across toggled shapes; two towers competing for the last shape → the lower id.
 * FOUR SITES: factory · save · wire · wide hash; and host vs worker bit-exact while it builds.
 * GUARD: the runner dispatches FEED_TOWER (mutation-tested — see the last describe).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALL_SPARK_TYPES,
  GOBLIN_MAX_PER_SPAWNER,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SPARK_VISUAL_SIZE,
  SparkType,
} from '../constants.ts';
import { blueprintBill } from './blueprints.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { bankAdd, bankCountOf, makeCastleBank } from './castleBank.ts';
import { runSpawnerIgnition, runGodlyMatcherCore, makeWorkerCinematicState, tickWorkerCinematics } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { AUTO_FEED_POLL_TICKS, autoFeedChoice, runGoblinAutoFeed } from './goblinAutoFeed.ts';
import { AUTO_FEED_SHAPE_COUNT, isAutoFed } from './spawners/spawner.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls } from './workerSim.ts';
import { asPlayerId, asPrimitiveId, type BondId, type PlayerId, type SpawnerId } from '../types.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import './godlyRecipes/registerAll.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/** A REAL goblin tower: stamped from the bank by BUILD_BLUEPRINT and ignited — the cadence test's fixture. */
function towerWorld(seed = 0x193a): { w: World; t: SpawnerId } {
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
  w.castleBanks.set(P1, makeCastleBank());
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'goblinTower', centre: { x: 420, y: 400 } });
  runSpawnerIgnition(w);
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 100_000;
  const t = [...w.creatureSpawners.values()].find((s) => s.recipeId === 'goblinTower')!.id;
  // Spend the bill remainder so the bank starts EMPTY of every shape — each test banks what it needs.
  w.castleBanks.set(P0, makeCastleBank());
  return { w, t };
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}
function run(w: World, ticks: number): void {
  const d = deps();
  const st = makeHostTickState(w);
  // `runHostTick` advances `world.tick` itself (one tick per call).
  for (let i = 0; i < ticks; i++) runHostTick(w, d, st);
}
const bankN = (w: World, seat: PlayerId, type: SparkType, n: number): void => {
  for (let i = 0; i < n; i++) bankAdd(w.castleBanks, seat, type);
};
const toggle = (w: World, seat: PlayerId, t: SpawnerId, type: SparkType, on = true): void => {
  dispatch(w, { type: 'SET_AUTO_FEED', playerId: seat, spawnerId: t, sparkType: type, on });
};
const fed = (w: World, t: SpawnerId) => [...w.creatures.values()].filter((c) => c.sourceSpawnerId === t);

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('⭐ S193 T4 — REACH: a toggled goblin tower builds from the bank through the real host tick', () => {
  it('Square toggled + 3 Squares banked → 3 shield goblins, the bank spent, the toggle still lit', () => {
    const { w, t } = towerWorld();
    bankN(w, P0, SparkType.Square, 3);
    toggle(w, P0, t, SparkType.Square);
    expect(isAutoFed(w.creatureSpawners.get(t)!, SparkType.Square)).toBe(true);
    run(w, AUTO_FEED_POLL_TICKS * 4);
    expect(fed(w, t).map((c) => c.type)).toEqual(['goblinShield', 'goblinShield', 'goblinShield']);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Square)).toBe(0);
    expect(isAutoFed(w.creatureSpawners.get(t)!, SparkType.Square), 'an empty bank never clears a toggle').toBe(true);
  });

  it('⭐ fills to the cap (10) and STOPS; a freed slot is refilled from the bank on the next look', () => {
    const { w, t } = towerWorld();
    bankN(w, P0, SparkType.Square, GOBLIN_MAX_PER_SPAWNER + 5);
    toggle(w, P0, t, SparkType.Square);
    run(w, AUTO_FEED_POLL_TICKS * (GOBLIN_MAX_PER_SPAWNER + 4));
    expect(fed(w, t)).toHaveLength(GOBLIN_MAX_PER_SPAWNER);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Square), 'a full tower pays nothing').toBe(5);
    // A goblin dies → one slot free → exactly one more is built, and paid for.
    w.creatures.delete(fed(w, t)[0]!.id);
    run(w, AUTO_FEED_POLL_TICKS);
    expect(fed(w, t)).toHaveLength(GOBLIN_MAX_PER_SPAWNER);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Square)).toBe(4);
  });

  it('never more than ONE goblin per tower per look — the cadence', () => {
    const { w, t } = towerWorld();
    bankN(w, P0, SparkType.Line, 10);
    toggle(w, P0, t, SparkType.Line);
    run(w, AUTO_FEED_POLL_TICKS * 3);
    expect(fed(w, t)).toHaveLength(3);
  });

  it('builds in BUILD too — a manual FEED is not phase-gated, so neither is this', () => {
    const { w, t } = towerWorld();
    w.matchPhase = 'BUILD';
    bankN(w, P0, SparkType.Circle, 2);
    toggle(w, P0, t, SparkType.Circle);
    run(w, AUTO_FEED_POLL_TICKS * 3);
    expect(fed(w, t).map((c) => c.type)).toEqual(['goblinHound', 'goblinHound']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('⛔ S193 T4 — NEGATIVES', () => {
  it('no toggle → nothing, however full the bank', () => {
    const { w, t } = towerWorld();
    bankN(w, P0, SparkType.Square, 5);
    run(w, AUTO_FEED_POLL_TICKS * 4);
    expect(fed(w, t)).toEqual([]);
  });

  it('toggled OFF again → nothing more is built', () => {
    const { w, t } = towerWorld();
    bankN(w, P0, SparkType.Square, 5);
    toggle(w, P0, t, SparkType.Square);
    toggle(w, P0, t, SparkType.Square, false);
    expect(w.creatureSpawners.get(t)!.autoFeedMask).toBe(0);
    run(w, AUTO_FEED_POLL_TICKS * 4);
    expect(fed(w, t)).toEqual([]);
  });

  it('empty bank → nothing; a shape that lands later is built', () => {
    const { w, t } = towerWorld();
    toggle(w, P0, t, SparkType.Spiral);
    run(w, AUTO_FEED_POLL_TICKS * 3);
    expect(fed(w, t)).toEqual([]);
    bankN(w, P0, SparkType.Spiral, 1);
    run(w, AUTO_FEED_POLL_TICKS);
    expect(fed(w, t).map((c) => c.type)).toEqual(['goblinBat']);
  });

  it('only the TOGGLED shape is spent — another banked shape is untouched', () => {
    const { w, t } = towerWorld();
    bankN(w, P0, SparkType.Triangle, 4);
    bankN(w, P0, SparkType.Square, 1);
    toggle(w, P0, t, SparkType.Square);
    run(w, AUTO_FEED_POLL_TICKS * 4);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Triangle)).toBe(4);
    expect(fed(w, t).map((c) => c.type)).toEqual(['goblinShield']);
  });

  it("⛔ someone else's tower: the toggle is REFUSED, and the runner never spends another seat's bank", () => {
    const { w, t } = towerWorld();
    toggle(w, P1, t, SparkType.Square);
    expect(w.creatureSpawners.get(t)!.autoFeedMask ?? 0, 'P1 cannot toggle P0’s tower').toBe(0);
    // P0 toggles its own; only P1 holds Squares → nothing is built, P1's bank untouched.
    toggle(w, P0, t, SparkType.Square);
    bankN(w, P1, SparkType.Square, 3);
    run(w, AUTO_FEED_POLL_TICKS * 3);
    expect(fed(w, t)).toEqual([]);
    expect(bankCountOf(w.castleBanks, P1, SparkType.Square)).toBe(3);
  });

  it('⚠ MINE — a race tower / any non-goblin spawner is not toggleable', () => {
    const { w } = towerWorld();
    const anchor = asPrimitiveId(w.nextPrimitiveId++);
    w.primitives.set(anchor, {
      id: anchor, type: SparkType.Square, placerColor: PLAYER_COLORS[0]!, placedBy: P0, createdTick: w.tick,
      pos: { x: 900, y: 300 }, prevPos: { x: 900, y: 300 }, bonds: new Set<BondId>(),
      ownerColor: PLAYER_COLORS[0]!, lastOwnershipChange: w.tick, hp: PRIMITIVE_MAX_HP,
      radius: Math.max(8, SPARK_VISUAL_SIZE[SparkType.Square] * 0.45), origin: null,
    } as never);
    for (const recipeId of ['pentagram', 't3Orcs'] as GodlyId[]) {
      dispatch(w, { type: 'REGISTER_SPAWNER', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId } as never);
      const sp = [...w.creatureSpawners.values()].at(-1)!;
      toggle(w, P0, sp.id, SparkType.Square);
      expect(sp.autoFeedMask ?? 0, recipeId).toBe(0);
    }
  });

  it('a malformed intent (shape out of range, a float, a non-boolean) is a no-op', () => {
    const { w, t } = towerWorld();
    for (const bad of [6, -1, 2.5, Number.NaN]) {
      dispatch(w, { type: 'SET_AUTO_FEED', playerId: P0, spawnerId: t, sparkType: bad as SparkType, on: true });
    }
    dispatch(w, { type: 'SET_AUTO_FEED', playerId: P0, spawnerId: t, sparkType: SparkType.Dot, on: 'yes' as never });
    expect(w.creatureSpawners.get(t)!.autoFeedMask ?? 0).toBe(0);
  });

  it('⛔ a BENCHED seat may toggle, but the feeds wait until the bench lifts (FEED_TOWER is bench-denied)', () => {
    const { w, t } = towerWorld();
    const pl = w.players.get(P0)!;
    pl.benchedUntilTick = w.tick + AUTO_FEED_POLL_TICKS * 3;
    toggle(w, P0, t, SparkType.Square);
    expect(isAutoFed(w.creatureSpawners.get(t)!, SparkType.Square), 'the bench allows a standing order').toBe(true);
    bankN(w, P0, SparkType.Square, 2);
    run(w, AUTO_FEED_POLL_TICKS * 2);
    expect(fed(w, t), 'benched: nothing built, nothing spent').toEqual([]);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Square)).toBe(2);
    run(w, AUTO_FEED_POLL_TICKS * 4);
    expect(fed(w, t), 'bench lifted: both built').toHaveLength(2);
  });

  it('⛔ an ELIMINATED seat cannot toggle', () => {
    const { w, t } = towerWorld();
    w.players.get(P0)!.castleHp = 0;
    toggle(w, P0, t, SparkType.Square);
    expect(w.creatureSpawners.get(t)!.autoFeedMask ?? 0).toBe(0);
  });

  it('the tower dies → its toggles go with it (the spawner record is removed)', () => {
    const { w, t } = towerWorld();
    toggle(w, P0, t, SparkType.Square);
    dispatch(w, { type: 'REMOVE_SPAWNER', spawnerId: t } as never);
    expect(w.creatureSpawners.has(t)).toBe(false);
    bankN(w, P0, SparkType.Square, 2);
    run(w, AUTO_FEED_POLL_TICKS * 3);
    expect(fed(w, t)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('⚠ MINE — several toggles, one slot: round-robin by shape order, persisted cursor', () => {
  it('Square + Spiral with plenty of both → shield, bat, shield, bat', () => {
    const { w, t } = towerWorld();
    bankN(w, P0, SparkType.Square, 5);
    bankN(w, P0, SparkType.Spiral, 5);
    toggle(w, P0, t, SparkType.Spiral);
    toggle(w, P0, t, SparkType.Square);
    run(w, AUTO_FEED_POLL_TICKS * 4 + 1);
    const born = fed(w, t).sort((a, b) => Number(a.id) - Number(b.id)).map((c) => c.type);
    expect(born).toEqual(['goblinShield', 'goblinBat', 'goblinShield', 'goblinBat']);
  });

  it('when one toggled shape runs out, the free slots go to the other', () => {
    const { w, t } = towerWorld();
    bankN(w, P0, SparkType.Square, 1);
    bankN(w, P0, SparkType.Spiral, 3);
    toggle(w, P0, t, SparkType.Square);
    toggle(w, P0, t, SparkType.Spiral);
    run(w, AUTO_FEED_POLL_TICKS * 4 + 1);
    expect(fed(w, t).map((c) => c.type).sort()).toEqual(['goblinBat', 'goblinBat', 'goblinBat', 'goblinShield']);
  });

  it('autoFeedChoice scans from the cursor and wraps', () => {
    const { w, t } = towerWorld();
    const sp = w.creatureSpawners.get(t)!;
    bankN(w, P0, SparkType.Dot, 1);
    bankN(w, P0, SparkType.Circle, 1);
    toggle(w, P0, t, SparkType.Dot);
    toggle(w, P0, t, SparkType.Circle);
    sp.autoFeedCursor = 5;
    expect(autoFeedChoice(w, sp)).toBe(SparkType.Dot); // 5 (untoggled) → wraps to 0
    sp.autoFeedCursor = 1;
    expect(autoFeedChoice(w, sp)).toBe(SparkType.Circle);
  });

  it('the bitfield width is the shape count — a seventh shape turns this red', () => {
    expect(AUTO_FEED_SHAPE_COUNT).toBe(ALL_SPARK_TYPES.length);
    ALL_SPARK_TYPES.forEach((t, i) => expect(t as number).toBe(i));
  });

  it('⛔ two towers of one seat, ONE Square, the same look → exactly one goblin, from the LOWER spawner id', () => {
    const w = makeWorld(0x193c);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
    } as never);
    w.creatures.clear();
    const anchor = asPrimitiveId(w.nextPrimitiveId++);
    w.primitives.set(anchor, {
      id: anchor, type: SparkType.Circle, placerColor: PLAYER_COLORS[0]!, placedBy: P0, createdTick: w.tick,
      pos: { x: 600, y: 300 }, prevPos: { x: 600, y: 300 }, bonds: new Set<BondId>(),
      ownerColor: PLAYER_COLORS[0]!, lastOwnershipChange: w.tick, hp: PRIMITIVE_MAX_HP, radius: 9, origin: null,
    } as never);
    const reg = (recipeId: string): SpawnerId => {
      dispatch(w, { type: 'REGISTER_SPAWNER', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId } as never);
      return [...w.creatureSpawners.values()].at(-1)!.id;
    };
    const a = reg('goblinTower');
    for (let i = 0; i < AUTO_FEED_POLL_TICKS - 1; i++) reg('pentagram'); // spacers → same phase
    const b = reg('goblinTower');
    expect((Number(b) - Number(a)) % AUTO_FEED_POLL_TICKS, 'fixture: the two share one look').toBe(0);
    // Register B FIRST in Map order, so insertion order would pick it — the total order must not.
    const spB = w.creatureSpawners.get(b)!;
    w.creatureSpawners.delete(b);
    const rest = [...w.creatureSpawners.entries()];
    w.creatureSpawners.clear();
    w.creatureSpawners.set(b, spB);
    for (const [k, v] of rest) w.creatureSpawners.set(k, v);
    w.castleBanks.set(P0, makeCastleBank());
    bankN(w, P0, SparkType.Square, 1);
    toggle(w, P0, a, SparkType.Square);
    toggle(w, P0, b, SparkType.Square);
    while ((w.tick + Number(a)) % AUTO_FEED_POLL_TICKS !== 0) w.tick++;
    runGoblinAutoFeed(w);
    const born = [...w.creatures.values()].filter((c) => c.sourceSpawnerId !== null);
    expect(born.map((c) => c.sourceSpawnerId)).toEqual([a]);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Square)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('⭐ S193 T4 — the four sites, and determinism', () => {
  it('FACTORY — a new tower starts with every toggle off and the cursor at 0', () => {
    const { w, t } = towerWorld();
    const sp = w.creatureSpawners.get(t)!;
    expect(sp.autoFeedMask).toBe(0);
    expect(sp.autoFeedCursor).toBe(0);
  });

  it('SAVE + WIRE — a disk restore AND a client snapshot keep the mask and the cursor', () => {
    const { w, t } = towerWorld();
    toggle(w, P0, t, SparkType.Square);
    toggle(w, P0, t, SparkType.Spiral);
    w.creatureSpawners.get(t)!.autoFeedCursor = 4;
    const disk = makeWorld(1);
    restore(snapshot(w), disk);
    expect(disk.creatureSpawners.get(t)!.autoFeedMask).toBe((1 << 3) | (1 << 5));
    expect(disk.creatureSpawners.get(t)!.autoFeedCursor).toBe(4);
    const client = makeWorld(2);
    applyNetSnapshot(netSnapshot(w), client);
    expect(client.creatureSpawners.get(t)!.autoFeedMask, 'the client draws the lit cue off it').toBe((1 << 3) | (1 << 5));
    expect(client.creatureSpawners.get(t)!.autoFeedCursor, 'Council G1: rides the wire').toBe(4);
  });

  it('WIRE — an untoggled tower costs no bytes (emitted only when set)', () => {
    const { w } = towerWorld();
    const json = JSON.stringify(netSnapshot(w));
    expect(json).not.toContain('autoFeedMask');
    expect(json).not.toContain('autoFeedCursor');
  });

  it('WIRE — a hostile payload is sanitised: six bits, a cursor in 0..5', () => {
    const { w, t } = towerWorld();
    const snap = netSnapshot(w) as unknown as { creatureSpawners: Array<Record<string, unknown>> };
    const row = snap.creatureSpawners.find((s) => s.id === t)!;
    row.autoFeedMask = 0xffff;
    row.autoFeedCursor = 99;
    const client = makeWorld(2);
    applyNetSnapshot(snap as never, client);
    expect(client.creatureSpawners.get(t)!.autoFeedMask).toBe(0b111111);
    expect(client.creatureSpawners.get(t)!.autoFeedCursor).toBe(0);
  });

  it('HASH — the mask and the cursor each flip the wide hash', () => {
    const { w, t } = towerWorld();
    const h0 = hashWorldStateFull(w);
    toggle(w, P0, t, SparkType.Square);
    const h1 = hashWorldStateFull(w);
    expect(h1, ':af').not.toBe(h0);
    w.creatureSpawners.get(t)!.autoFeedCursor = 2;
    expect(hashWorldStateFull(w), ':ac').not.toBe(h1);
  });

  it('same seed, same toggles → the same wide hash after building', () => {
    const go = (): number => {
      const { w, t } = towerWorld(0x193d);
      bankN(w, P0, SparkType.Square, 4);
      bankN(w, P0, SparkType.Line, 4);
      toggle(w, P0, t, SparkType.Square);
      toggle(w, P0, t, SparkType.Line);
      run(w, AUTO_FEED_POLL_TICKS * 8);
      expect(fed(w, t).length).toBeGreaterThan(0);
      return hashWorldStateFull(w);
    };
    expect(go()).toBe(go());
  });

  it('⭐ host vs WORKER — bit-exact every frame while the tower auto-builds (the worker INIT carries both fields)', () => {
    const { w, t } = towerWorld(0x193e);
    w.gameState = 'PLAYING';
    bankN(w, P0, SparkType.Square, 6);
    bankN(w, P0, SparkType.Spiral, 6);
    toggle(w, P0, t, SparkType.Square);
    toggle(w, P0, t, SparkType.Spiral);
    w.creatureSpawners.get(t)!.autoFeedCursor = 5;
    // ⚠ Fixture only: a save omits an ALL-ZERO bank, so an empty one would read as an INIT diff that
    // has nothing to do with this feature (probed S193: the only differing part was `cb1:0.0.0.0.0.0`).
    for (const [seat, b] of [...w.castleBanks]) if (b.every((n) => (n ?? 0) === 0)) w.castleBanks.delete(seat);
    for (const b of w.bonds.values()) delete (b as { stiffnessMultiplier?: number }).stiffnessMultiplier;
    w.effects.length = 0;
    const mkSpawner = (): Spawner => new Spawner(
      DEFAULT_SPAWNER_CONFIG, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5),
    );
    const refSpawner = mkSpawner();
    const sim = makeWorkerSim({
      type: 'INIT', saveJson: JSON.stringify(snapshot(w, { spawnerState: mkSpawner().getState() })),
      hostSeats: [], localPlayerId: 0, ratePerSecond: DEFAULT_SPAWNER_CONFIG.ratePerSecond,
    });
    expect(hashWorldStateFull(sim.world), 'INIT adoption is bit-exact').toBe(hashWorldStateFull(w));
    const controls = new WorkerControls(w, P0);
    const refState = makeHostTickState(w);
    const refCursor = { lastMatcherTick: -1 };
    const cinematics = makeWorkerCinematicState();
    const extras = makeGameStateExtras();
    let seq = 0;
    for (let f = 0; f < 60; f++) {
      const batch = {
        ticks: 1 + (f % 3),
        control: { state: { kind: 'Idle' } as const, cursor: { x: 700, y: 400 } },
        alivePeerIds: null, intents: [], nowMs: f * 16,
      };
      controls.setFrame(batch.control);
      const d: HostTickDeps = {
        spawner: refSpawner, controls, botManager: null, gameStateExtras: extras,
        alivePeerIds: null, hostSeats: new Map(),
      };
      for (let i = 0; i < batch.ticks; i++) runHostTick(w, d, refState);
      if (w.gameState === 'PLAYING') runGodlyMatcherCore(w, refCursor);
      tickWorkerCinematics(w, cinematics);
      w.effects.length = 0;
      applyTickBatch(sim, { type: 'TICK_BATCH', batchSeq: ++seq, ...batch }, { forceSnapshot: true });
      expect(hashWorldStateFull(sim.world), `frame ${f} tick ${w.tick}`).toBe(hashWorldStateFull(w));
    }
    expect(fed(w, t).length, 'the window really built goblins').toBeGreaterThan(3);
    expect(fed(sim.world, t).length).toBe(fed(w, t).length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('⛔ GUARD — the runner feeds through FEED_TOWER, never around it', () => {
  /*
   * ⚠ MUTATION-TESTED (S193): replacing the runner's `dispatch(world, { type: 'FEED_TOWER', … })` with a
   * direct `applyFeedTower(world, …)` call turned the BENCH case above RED (a benched seat's goblins
   * were built), and this source guard red too. Both halves matter: the source guard names the line,
   * the bench case proves the gates are REACHED through it.
   */
  const src = readFileSync(new URL('./goblinAutoFeed.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const body = src
    .slice(src.indexOf('export function runGoblinAutoFeed('))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  it('dispatches FEED_TOWER as the tower owner, and touches neither the bank nor SPAWN_CREATURE itself', () => {
    expect(body).toMatch(/dispatch\(world, \{\s*type: 'FEED_TOWER',\s*playerId: sp\.ownerPlayerId,/);
    expect(body).not.toMatch(/bankRemove|applyFeedTower|SPAWN_CREATURE/);
  });
  it('hostTick calls the runner', () => {
    const host = readFileSync(new URL('./hostTick.ts', import.meta.url), 'utf8');
    expect(host).toContain('runGoblinAutoFeed(world);');
  });
});
