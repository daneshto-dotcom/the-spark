/**
 * SPARK — S188 — THE HORDE GROWS (orcs L5): *"the goblin towers allow 20 instead of 10. And also
 * your castle generates the base unit twice as fast."*
 *
 * The numbers; the REACH — a goblin tower FED through `dispatch` really holds twenty, and the castle
 * really produces twice in a 30-s window through the real `runHostTick`; and the negatives — an orc
 * seat without the pick, and another race with its racial pick, keep ten and thirty seconds.
 */
import { describe, expect, it } from 'vitest';
import {
  GOBLIN_MAX_GLOBAL,
  GOBLIN_MAX_PER_SPAWNER,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  RACE_UNIT_EMIT_INTERVAL_TICKS,
  SPARK_VISUAL_SIZE,
  SparkType,
  phaseDurationTicks,
} from '../../constants.ts';
import {
  HORDE_CASTLE_EMIT_SPEEDUP,
  HORDE_GOBLIN_MAX_PER_SPAWNER,
  castleEmitIntervalTicks,
  goblinCapPerSpawner,
} from './hordeGrows.ts';
import { castleEmitsOnTick } from '../raceUnitEmit.ts';
import { bankAdd } from '../castleBank.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import type { DraftPick } from '../draft.ts';
import type { RaceId } from '../races.ts';
import type { GodlyId } from '../godlyRecipes/types.ts';
import { asPlayerId, asPrimitiveId, type BondId, type CreatureId, type PlayerId, type SpawnerId } from '../../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(): World {
  const w = makeWorld(0x188c);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  return w;
}

function seatAs(w: World, seat: PlayerId, raceId: RaceId, picks: DraftPick[]): void {
  const pl = w.players.get(seat)!;
  pl.raceId = raceId;
  pl.draftPicks = [...picks];
}

/** A registered spawner (the `goblinFeedCap.test.ts` route): an anchor shape + REGISTER_SPAWNER. */
function tower(w: World, seat: PlayerId, recipeId: GodlyId = 'goblinTower' as GodlyId): SpawnerId {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  w.primitives.set(id, {
    id, type: SparkType.Square, placerColor: player.color, placedBy: seat, createdTick: w.tick,
    pos: { x: 600, y: 300 }, prevPos: { x: 600, y: 300 }, bonds: new Set<BondId>(),
    ownerColor: player.color, lastOwnershipChange: w.tick, hp: PRIMITIVE_MAX_HP,
    radius: Math.max(8, SPARK_VISUAL_SIZE[SparkType.Square] * 0.45), origin: null,
  } as never);
  dispatch(w, { type: 'REGISTER_SPAWNER', ownerPlayerId: seat, anchorPrimitiveId: id, recipeId } as never);
  return [...w.creatureSpawners.keys()][w.creatureSpawners.size - 1]!;
}

/** Feed `tower` `n` Triangles through the client-intent path; return how many goblins it holds. */
function feedMany(w: World, seat: PlayerId, t: SpawnerId, n: number): number {
  for (let i = 0; i < n; i++) bankAdd(w.castleBanks, seat, SparkType.Triangle);
  for (let i = 0; i < n; i++) {
    dispatch(w, { type: 'FEED_TOWER', playerId: seat, spawnerId: t, sparkType: SparkType.Triangle } as never);
  }
  return [...w.creatures.values()].filter((c) => c.sourceSpawnerId === t).length;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 THE HORDE GROWS — the numbers are his', () => {
  it('twenty instead of ten; twice as fast', () => {
    expect(GOBLIN_MAX_PER_SPAWNER).toBe(10);
    expect(HORDE_GOBLIN_MAX_PER_SPAWNER).toBe(20);
    expect(HORDE_CASTLE_EMIT_SPEEDUP).toBe(2);
  });

  it('the halved castle interval is a whole number of ticks — 15 s', () => {
    const half = castleEmitIntervalTicks({ raceId: 'orcs', draftPicks: ['hp', 'racial'] });
    expect(Number.isInteger(half)).toBe(true);
    expect(half * HORDE_CASTLE_EMIT_SPEEDUP).toBe(RACE_UNIT_EMIT_INTERVAL_TICKS);
  });

  it('⛔ without the perk, and for another race with its pick, it stays 30 s', () => {
    expect(castleEmitIntervalTicks({ raceId: 'orcs', draftPicks: ['racial', 'def'] })).toBe(RACE_UNIT_EMIT_INTERVAL_TICKS);
    expect(castleEmitIntervalTicks({ raceId: 'zombies', draftPicks: ['racial', 'racial'] })).toBe(RACE_UNIT_EMIT_INTERVAL_TICKS);
    expect(castleEmitIntervalTicks(undefined)).toBe(RACE_UNIT_EMIT_INTERVAL_TICKS);
  });

  it('⭐ a seat that takes it mid-match keeps its phase: every 30-s tick is also a 15-s tick', () => {
    const half = RACE_UNIT_EMIT_INTERVAL_TICKS / HORDE_CASTLE_EMIT_SPEEDUP;
    for (const seat of [0, 1, 2, 3]) {
      for (let t = 0; t < RACE_UNIT_EMIT_INTERVAL_TICKS * 3; t++) {
        if (castleEmitsOnTick(seat, t)) expect(castleEmitsOnTick(seat, t, half), `seat ${seat} t ${t}`).toBe(true);
      }
    }
  });

  it('only a GOBLIN TOWER is raised — another spawner of the same seat keeps its ten', () => {
    const w = board();
    seatAs(w, P0, 'orcs', ['hp', 'racial']);
    expect(goblinCapPerSpawner(w, tower(w, P0))).toBe(20);
    expect(goblinCapPerSpawner(w, tower(w, P0, 'pentagram' as GodlyId))).toBe(10);
    expect(goblinCapPerSpawner(w, 987654 as unknown as SpawnerId), 'an absent spawner').toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 THE HORDE GROWS — ⭐ REACH: a fed goblin tower really holds twenty', () => {
  it('⭐ an orc seat with the pick: 25 Triangles fed → 20 goblins, and it stops there', () => {
    const w = board();
    seatAs(w, P0, 'orcs', ['hp', 'racial']);
    expect(feedMany(w, P0, tower(w, P0), 25)).toBe(HORDE_GOBLIN_MAX_PER_SPAWNER);
  });

  it('⛔ NEGATIVE: the same orc seat WITHOUT the pick → 10', () => {
    const w = board();
    seatAs(w, P0, 'orcs', ['hp', 'def']);
    expect(feedMany(w, P0, tower(w, P0), 25)).toBe(GOBLIN_MAX_PER_SPAWNER);
  });

  it('⛔ NEGATIVE: ANOTHER race with its level-5 racial pick → 10', () => {
    const w = board();
    seatAs(w, P0, 'vampires', ['racial', 'racial']);
    expect(feedMany(w, P0, tower(w, P0), 25)).toBe(GOBLIN_MAX_PER_SPAWNER);
  });

  it('⛔ the perk is PER SEAT — the enemy’s goblin tower beside it keeps ten', () => {
    const w = board();
    seatAs(w, P0, 'orcs', ['hp', 'racial']);
    seatAs(w, P1, 'orcs', ['hp', 'hp']);
    expect(feedMany(w, P0, tower(w, P0), 25)).toBe(20);
    expect(feedMany(w, P1, tower(w, P1), 25)).toBe(10);
  });

  it('the shared global backstop is untouched', () => {
    expect(GOBLIN_MAX_GLOBAL).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 THE HORDE GROWS — ⭐ REACH: the castle produces twice as often, through the real host tick', () => {
  const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
  const deps = (): HostTickDeps => ({
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps);

  /** Race units BORN to `seat` over one full 30-s interval of real host ticks. */
  function bornIn30s(raceId: RaceId, picks: DraftPick[]): { mine: number; theirs: number } {
    const w = board();
    w.gameState = 'PLAYING';
    w.isHost = true;
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
    w.creatures.clear();
    seatAs(w, P0, raceId, picks);
    seatAs(w, P1, 'orcs', ['hp', 'def']);
    const seen = new Map<CreatureId, PlayerId>();
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < RACE_UNIT_EMIT_INTERVAL_TICKS; t++) {
      runHostTick(w, d, st);
      for (const c of w.creatures.values()) if (c.type === 'raceUnit') seen.set(c.id, c.ownerPlayerId);
    }
    expect(w.matchPhase, 'fixture: one uninterrupted FIGHT').toBe('FIGHT');
    const count = (s: PlayerId) => [...seen.values()].filter((o) => o === s).length;
    return { mine: count(P0), theirs: count(P1) };
  }

  it('⭐ an orc seat with the pick: TWO units in 30 s; the enemy castle beside it: one', () => {
    const r = bornIn30s('orcs', ['hp', 'racial']);
    expect(r.mine).toBe(2);
    expect(r.theirs).toBe(1);
  });

  it('⛔ NEGATIVE: without the pick, and another race with its pick — one each', () => {
    expect(bornIn30s('orcs', ['hp', 'def']).mine).toBe(1);
    expect(bornIn30s('mummies', ['racial', 'racial']).mine).toBe(1);
  });
});
