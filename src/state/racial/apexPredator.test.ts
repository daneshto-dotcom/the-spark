/**
 * SPARK — S188 P7 — APEX PREDATOR (nagas level 5): the stat line, the two emit sites, the negative
 * controls, and the wire.
 *
 * Owner: *"upgrade the tier three piranha into a big one ... all the stats you take and you just
 * triple them"* and *"two times bigger than the current piranha"*.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, RACE_TOWER_EMIT_INTERVAL_TICKS } from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { blueprintBill } from '../blueprints.ts';
import { applyBuildBlueprint } from '../blueprintBuild.ts';
import { makeCastleBank } from '../castleBank.ts';
import { runSpawnerIgnition } from '../godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { RACE_TOWER_IDS, RACE_TOWER_UNIT } from '../raceTowerIds.ts';
import { RACE_FEED_SHAPE, type RaceId } from '../races.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, asPlayerId, type PlayerId } from '../../types.ts';
import { draftedPoolFifths, type DraftPick } from '../draft.ts';
import {
  APEX_PREDATOR_STAT_MUL,
  CREATURE_CONFIGS,
  getCreatureConfig,
  T3_PIRANHA_ELITE_STATS,
} from '../creatures/voltkin-config.ts';
import { makeCreature, creatureMaxEhp, type CreatureType } from '../creatures/creature.ts';
import { attackFifths, unitPoolFifths } from '../stats.ts';
import { snapshot, restore } from '../save.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { creatureSpriteScaleMul, PIRANHA_ELITE_SPRITE_SCALE_MUL } from '../../render/towerFrames.ts';
import { RACIAL_PERK_BUILT, racialPerkFor } from '../racialPerks.ts';
import { towerUnitForSeat } from './apexPredator.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATLASES, GOBLIN_KINDS, PIRANHA_ELITE_ATLAS_BASE } from '../../render/goblinRenderer.ts';
import '../godlyRecipes/raceTower.ts';

const P0 = asPlayerId(0);
const ELITE: CreatureType = 't3PiranhaElite';

/** A seat-0 tier-3 tower of `race`, ignited, in FIGHT, the seat holding `picks`. */
function buildAndIgnite(race: RaceId, picks: DraftPick[]): { w: World } {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!, { x: 0, y: 0 }, race));
  w.players.get(P0)!.draftPicks.push(...picks);
  const bank = makeCastleBank();
  const id = RACE_TOWER_IDS[race];
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: { x: 420, y: 400 } });
  runSpawnerIgnition(w);
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return { w };
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function run(w: World, ticks: number): void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  const until = w.tick + ticks;
  while (w.tick < until) runHostTick(w, d, st);
}

const count = (w: World, t: CreatureType): number => [...w.creatures.values()].filter((c) => c.type === t).length;

function feedOnce(w: World, race: RaceId): void {
  const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === RACE_TOWER_IDS[race])!;
  const bank = w.castleBanks.get(P0)!;
  const shape = RACE_FEED_SHAPE[race];
  bank[shape as number] = (bank[shape as number] ?? 0) + 1;
  dispatch(w, { type: 'FEED_TOWER', playerId: P0, spawnerId: sp.id, sparkType: shape });
}

describe('S188 APEX PREDATOR — the stat line is the piranha ×3, derived', () => {
  const base = getCreatureConfig('t3Piranha');
  const elite = getCreatureConfig(ELITE);

  it('⭐⭐ HP / DEF / ATK / PEN are each exactly 3× the piranha’s — read off its config, never literals', () => {
    expect(APEX_PREDATOR_STAT_MUL).toBe(3);
    expect(elite.hp).toBe(base.hp * APEX_PREDATOR_STAT_MUL);
    expect(elite.def).toBe(base.def * APEX_PREDATOR_STAT_MUL);
    expect(elite.atk).toBe(base.atk * APEX_PREDATOR_STAT_MUL);
    expect(elite.pen).toBe(base.pen * APEX_PREDATOR_STAT_MUL);
    expect(T3_PIRANHA_ELITE_STATS.hp).toBe(elite.hp);
  });

  it('⭐ and ONLY those four move — speed, range, cadence and flags are the piranha’s', () => {
    const { type: _a, hp: _b, def: _c, atk: _d, pen: _e, ...restBase } = base;
    const { type: _f, hp: _g, def: _h, atk: _i, pen: _j, ...restElite } = elite;
    expect(restElite).toEqual(restBase);
    expect(elite.type).toBe(ELITE);
    expect(CREATURE_CONFIGS[ELITE]).toBe(elite);
  });

  it('⚠ on the ladder: the pool is ×3 (DEF 0) and the bite is ×4 (PEN is tripled too) — reported, not hidden', () => {
    expect(unitPoolFifths(elite.hp, elite.def)).toBe(3 * unitPoolFifths(base.hp, base.def));
    expect(attackFifths(elite.atk, elite.pen)).toBe(4 * attackFifths(base.atk, base.pen));
  });

  it('⭐ drawn TWICE the piranha’s size — his "two times bigger"', () => {
    expect(PIRANHA_ELITE_SPRITE_SCALE_MUL).toBe(2);
    expect(creatureSpriteScaleMul(ELITE)).toBe(2 * creatureSpriteScaleMul('t3Piranha'));
  });

  it('⭐ nagas.l5 is BUILT, so the draft offers it at level 5', () => {
    expect(RACIAL_PERK_BUILT['nagas.l5']).toBe(true);
    expect(racialPerkFor('nagas', 1)).toBe('nagas.l5');
  });
});

describe('S188 APEX PREDATOR — the tower emits the elite ONLY for a naga seat holding the perk', () => {
  const WINDOWS = 2;

  it('⭐⭐ the free trickle (real host tick): a naga seat holding nagas.l5 gets ELITES, no piranhas', () => {
    const { w } = buildAndIgnite('nagas', ['hp', 'racial']);
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS * WINDOWS + 5);
    expect(count(w, ELITE)).toBe(WINDOWS);
    expect(count(w, 't3Piranha')).toBe(0);
  });

  it('⭐⭐ the FED unit (FEED_TOWER) is promoted too — both emit sites ask the same rule', () => {
    const { w } = buildAndIgnite('nagas', ['hp', 'racial']);
    feedOnce(w, 'nagas');
    expect(count(w, ELITE)).toBe(1);
    expect(count(w, 't3Piranha')).toBe(0);
    const e = [...w.creatures.values()].find((c) => c.type === ELITE)!;
    // The seat also holds the general 'hp' pick, so the elite is born on the DRAFTED elite pool —
    // the general draft buffs it exactly as it buffs every unit the seat spawns (45 → 49).
    const cfg = getCreatureConfig(ELITE);
    expect(creatureMaxEhp(e), 'born on the (drafted) elite pool').toBe(draftedPoolFifths(cfg.hp, cfg.def, ['hp', 'racial']));
    expect(creatureMaxEhp(e)).toBeGreaterThan(unitPoolFifths(getCreatureConfig('t3Piranha').hp, getCreatureConfig('t3Piranha').def) * 3);
  });

  it('negative: a naga seat WITHOUT the level-5 pick still gets ordinary piranhas, on both paths', () => {
    for (const picks of [[], ['racial'], ['hp', 'def']] as DraftPick[][]) {
      const { w } = buildAndIgnite('nagas', picks);
      run(w, RACE_TOWER_EMIT_INTERVAL_TICKS + 5);
      feedOnce(w, 'nagas');
      expect(count(w, ELITE), JSON.stringify(picks)).toBe(0);
      expect(count(w, 't3Piranha'), JSON.stringify(picks)).toBeGreaterThan(0);
    }
  });

  it('negative: ANOTHER race holding ITS racial at level 5 is unaffected — its tower emits its own unit', () => {
    const { w } = buildAndIgnite('orcs', ['hp', 'racial']);
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS + 5);
    expect(count(w, RACE_TOWER_UNIT.orcs)).toBeGreaterThan(0);
    expect(count(w, ELITE)).toBe(0);
    // And the rule itself refuses a non-naga seat even if it were somehow handed a piranha.
    expect(towerUnitForSeat(w, P0, 't3Piranha')).toBe('t3Piranha');
  });

  it('⭐ "from now on": piranhas already on the board are NOT converted when the perk is taken', () => {
    const { w } = buildAndIgnite('nagas', ['hp']);
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS + 5);
    const before = [...w.creatures.values()].filter((c) => c.type === 't3Piranha').map((c) => c.id);
    expect(before.length).toBeGreaterThan(0);
    w.players.get(P0)!.draftPicks.push('racial');
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS);
    for (const id of before) expect(w.creatures.get(id)?.type).toBe('t3Piranha');
    expect(count(w, ELITE)).toBeGreaterThan(0);
  });

  it('every other tier-3 unit passes through the rule unchanged', () => {
    const { w } = buildAndIgnite('nagas', ['hp', 'racial']);
    for (const race of Object.keys(RACE_TOWER_UNIT) as RaceId[]) {
      const u = RACE_TOWER_UNIT[race];
      expect(towerUnitForSeat(w, P0, u)).toBe(u === 't3Piranha' ? ELITE : u);
    }
  });
});

describe('S188 APEX PREDATOR — the new type on the wire', () => {
  function withElite(damaged: boolean): { w: World; id: ReturnType<typeof asCreatureId> } {
    const w = makeWorld(0);
    w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
    const id = asCreatureId(w.nextCreatureId++);
    const c = makeCreature(getCreatureConfig(ELITE), {
      id, ownerPlayerId: P0 as PlayerId, pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 },
      spawnedAtTick: 0, sourceSpawnerId: null,
    });
    if (damaged) c.ehp -= 7;
    w.creatures.set(id, c);
    return { w, id };
  }

  it('⭐⭐ an UNDAMAGED elite round-trips as itself and is rebuilt at the ELITE pool (its type carries it)', () => {
    const { w, id } = withElite(false);
    const fresh = makeWorld(0);
    restore(snapshot(w), fresh);
    const r = fresh.creatures.get(id)!;
    expect(r.type).toBe(ELITE);
    expect(r.ehp).toBe(unitPoolFifths(getCreatureConfig(ELITE).hp, getCreatureConfig(ELITE).def));
    expect(hashWorldStateFull(fresh)).toBe(hashWorldStateFull(w));
  });

  it('⭐ a damaged elite keeps its wound across the round-trip', () => {
    const { w, id } = withElite(true);
    const fresh = makeWorld(0);
    restore(snapshot(w), fresh);
    expect(fresh.creatures.get(id)!.ehp).toBe(w.creatures.get(id)!.ehp);
  });
});

describe('S188 APEX PREDATOR — the elite has its OWN art, sized to the claim', () => {
  const root = join(process.cwd(), 'public');
  const read = (base: string): { cellH: number; states: Record<string, { frames: number }> } =>
    JSON.parse(readFileSync(join(root, `${base}-anim.json`), 'utf-8'));

  it('⭐⭐ the renderer points at a sheet that EXISTS on disk, and it is not the ordinary piranha’s', () => {
    // A failed atlas load is SILENT in this renderer (it falls back to the green puppet).
    expect(ATLASES.t3PiranhaElite).toBe(PIRANHA_ELITE_ATLAS_BASE);
    expect(PIRANHA_ELITE_ATLAS_BASE).not.toBe(ATLASES.t3Piranha);
    expect(existsSync(join(root, `${PIRANHA_ELITE_ATLAS_BASE}-atlas.png`))).toBe(true);
    expect(existsSync(join(root, `${PIRANHA_ELITE_ATLAS_BASE}-anim.json`))).toBe(true);
    expect(GOBLIN_KINDS.has(ELITE), 'absent from GOBLIN_KINDS it would be invisible').toBe(true);
  });

  it('⭐ same four 12-frame rows and the same cell HEIGHT as the piranha — so 2x draw = 2x the piranha', () => {
    const elite = read(PIRANHA_ELITE_ATLAS_BASE);
    const base = read(ATLASES.t3Piranha!);
    expect(elite.cellH).toBe(base.cellH);
    for (const st of ['idle', 'walk', 'attack', 'die']) expect(elite.states[st]?.frames, st).toBe(12);
  });
});
