/**
 * SPARK — S188 (`s188/swarm`) — THE SWARM (vampires level 10): the stat line, the draft offer, the two
 * emit sites through the real host tick, the negative controls, the combination with APEX PREDATOR,
 * the wire, and the art.
 *
 * Owner: *"it upgrades the regular tier three bat tower at level 10, if we choose it, to become bat
 * swarm"* and *"whatever we did for the piranha, we double that."*
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
import { ALL_RACES, RACE_FEED_SHAPE, type RaceId } from '../races.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, asPlayerId, type PlayerId } from '../../types.ts';
import { draftedPoolFifths, generalPickForWave, type DraftPick } from '../draft.ts';
import { applyDraftChoice, draftOptionsFor, openDraftIfDue, playerHoldsPerk } from '../draftEvent.ts';
import {
  APEX_PREDATOR_STAT_MUL,
  CREATURE_CONFIGS,
  getCreatureConfig,
  T3_BAT_SWARM_STATS,
  THE_SWARM_STAT_MUL,
} from '../creatures/voltkin-config.ts';
import { makeCreature, creatureMaxEhp, type CreatureType } from '../creatures/creature.ts';
import { attackFifths, unitPoolFifths } from '../stats.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot, wireNumberReplacer, type NetSnapshot } from '../save.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { BAT_SWARM_SPRITE_SCALE_MUL, creatureSpriteScaleMul } from '../../render/towerFrames.ts';
import { RACIAL_PERK_BUILT, RACIAL_PERK_COPY, racialPerkFor } from '../racialPerks.ts';
import { towerUnitForSeat } from './apexPredator.ts';
import { THE_SWARM_FROM, THE_SWARM_PERK, THE_SWARM_TO } from './theSwarm.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ATLASES,
  BAT_SWARM_ATLAS_BASE,
  GOBLIN_KINDS,
  atlasFallbackType,
} from '../../render/goblinRenderer.ts';
import '../godlyRecipes/raceTower.ts';

const P0 = asPlayerId(0);
const SWARM: CreatureType = 't3BatSwarm';
/** A vampire seat's picks that HOLD the swarm: anything at levels 0 and 5, `'racial'` at level 10. */
const HOLDS: DraftPick[] = ['hp', 'def', 'racial'];

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

describe('S188 THE SWARM — the stat line is the bat ×6, derived', () => {
  const base = getCreatureConfig('t3Bat');
  const swarm = getCreatureConfig(SWARM);

  it('⭐⭐ ×6 is HIS derivation — "whatever we did for the piranha, we double that"', () => {
    expect(THE_SWARM_STAT_MUL).toBe(6);
    expect(THE_SWARM_STAT_MUL).toBe(2 * APEX_PREDATOR_STAT_MUL);
  });

  it('⭐⭐ HP / DEF / ATK / PEN are each exactly 6× the bat’s — read off its config, never literals', () => {
    expect(swarm.hp).toBe(base.hp * THE_SWARM_STAT_MUL);
    expect(swarm.def).toBe(base.def * THE_SWARM_STAT_MUL);
    expect(swarm.atk).toBe(base.atk * THE_SWARM_STAT_MUL);
    expect(swarm.pen).toBe(base.pen * THE_SWARM_STAT_MUL);
    expect(T3_BAT_SWARM_STATS.hp).toBe(swarm.hp);
  });

  it('⭐ and ONLY those four move — speed, range, cadence and flags are the bat’s', () => {
    const { type: _a, hp: _b, def: _c, atk: _d, pen: _e, ...restBase } = base;
    const { type: _f, hp: _g, def: _h, atk: _i, pen: _j, ...restSwarm } = swarm;
    expect(restSwarm).toEqual(restBase);
    expect(swarm.type).toBe(SWARM);
    expect(CREATURE_CONFIGS[SWARM]).toBe(swarm);
  });

  it('⚠ on the ladder: the pool is ×6 (DEF 0) and the bite is ×11 (PEN is ×6 too) — reported, not hidden', () => {
    expect(unitPoolFifths(swarm.hp, swarm.def)).toBe(6 * unitPoolFifths(base.hp, base.def));
    expect(attackFifths(swarm.atk, swarm.pen)).toBe(11 * attackFifths(base.atk, base.pen));
    // Today's numbers, so the owner-facing note in the canon draft cannot drift from the code.
    expect(unitPoolFifths(swarm.hp, swarm.def)).toBe(60);
    expect(attackFifths(swarm.atk, swarm.pen)).toBe(132);
  });

  it('drawn at 2× the bat (MINE — unruled)', () => {
    expect(BAT_SWARM_SPRITE_SCALE_MUL).toBe(2);
    expect(creatureSpriteScaleMul(SWARM)).toBe(2 * creatureSpriteScaleMul('t3Bat'));
  });
});

describe('S188 THE SWARM — the draft offers it at level 10, to vampires only', () => {
  it('⭐ vampires.l10 is BUILT, and the wave-11 draft offers it to a vampire seat', () => {
    expect(RACIAL_PERK_BUILT['vampires.l10']).toBe(true);
    expect(racialPerkFor('vampires', 2)).toBe('vampires.l10');
    expect(draftOptionsFor(11, 'vampires').racial).toBe('vampires.l10');
    expect(RACIAL_PERK_COPY['vampires.l10'].title).toBe('THE SWARM');
    expect(RACIAL_PERK_COPY['vampires.l10'].card).toBe('l10-vampires');
  });

  it('⛔ every OTHER race is still COMING SOON at level 10', () => {
    for (const race of ALL_RACES) {
      if (race === 'vampires') continue;
      expect(draftOptionsFor(11, race).racial, race).toBeNull();
    }
  });

  it('the level-0 and level-5 drafts still offer their own perks — the swarm is not offered early', () => {
    expect(draftOptionsFor(1, 'vampires').racial).not.toBe('vampires.l10');
    expect(draftOptionsFor(6, 'vampires').racial).not.toBe('vampires.l10');
    expect(draftOptionsFor(16, 'vampires').racial).toBeNull(); // level 15 is undesigned
  });

  it('⭐⭐ REACH: taken through the REAL wave-11 draft, the pick lands at index 2 and the tower emits swarms', () => {
    const { w } = buildAndIgnite('vampires', ['racial', 'racial']);
    w.gameState = 'PLAYING';
    openDraftIfDue(w, 11);
    expect(w.draft?.waveNumber).toBe(11);
    applyDraftChoice(w, P0, 'racial');
    expect(w.players.get(P0)!.draftPicks).toEqual(['racial', 'racial', 'racial']);
    expect(playerHoldsPerk(w, P0, THE_SWARM_PERK)).toBe(true);
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS + 5);
    expect(count(w, SWARM)).toBe(1);
    expect(count(w, 't3Bat')).toBe(0);
  });

  it('negative: a non-vampire seat cannot take "racial" at wave 11 (nothing is offered)', () => {
    const { w } = buildAndIgnite('orcs', ['racial', 'racial']);
    w.gameState = 'PLAYING';
    openDraftIfDue(w, 11);
    applyDraftChoice(w, P0, 'racial');
    expect(w.players.get(P0)!.draftPicks).toEqual(['racial', 'racial']);
    applyDraftChoice(w, P0, generalPickForWave(11));
    expect(w.players.get(P0)!.draftPicks).toEqual(['racial', 'racial', generalPickForWave(11)]);
  });
});

describe('S188 THE SWARM — the bat tower emits the swarm ONLY for a vampire seat holding the perk', () => {
  const WINDOWS = 2;

  it('⭐⭐ the free trickle (real host tick): a vampire seat holding vampires.l10 gets SWARMS, no bats', () => {
    const { w } = buildAndIgnite('vampires', HOLDS);
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS * WINDOWS + 5);
    expect(count(w, SWARM)).toBe(WINDOWS);
    expect(count(w, 't3Bat')).toBe(0);
  });

  it('⭐⭐ the FED unit (FEED_TOWER) is promoted too — both emit sites ask the same rule', () => {
    const { w } = buildAndIgnite('vampires', HOLDS);
    feedOnce(w, 'vampires');
    expect(count(w, SWARM)).toBe(1);
    expect(count(w, 't3Bat')).toBe(0);
    const s = [...w.creatures.values()].find((c) => c.type === SWARM)!;
    // The seat also holds the general 'hp' and 'def' picks, so the swarm is born on the DRAFTED pool.
    const cfg = getCreatureConfig(SWARM);
    expect(creatureMaxEhp(s), 'born on the (drafted) swarm pool').toBe(draftedPoolFifths(cfg.hp, cfg.def, HOLDS));
    expect(creatureMaxEhp(s)).toBeGreaterThan(6 * unitPoolFifths(getCreatureConfig('t3Bat').hp, getCreatureConfig('t3Bat').def));
  });

  it('negative: a vampire seat that took the GENERAL at wave 11 (or has not drafted it) still gets bats, on both paths', () => {
    for (const picks of [[], ['racial'], ['racial', 'racial'], ['racial', 'racial', 'atk'], ['hp', 'def', 'atk']] as DraftPick[][]) {
      const { w } = buildAndIgnite('vampires', picks);
      run(w, RACE_TOWER_EMIT_INTERVAL_TICKS + 5);
      feedOnce(w, 'vampires');
      expect(count(w, SWARM), JSON.stringify(picks)).toBe(0);
      expect(count(w, 't3Bat'), JSON.stringify(picks)).toBeGreaterThan(0);
    }
  });

  it('negative: ANOTHER race holding its racial at every level is unaffected — its tower emits its own unit', () => {
    const { w } = buildAndIgnite('orcs', ['racial', 'racial', 'racial']);
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS + 5);
    expect(count(w, RACE_TOWER_UNIT.orcs)).toBeGreaterThan(0);
    expect(count(w, SWARM)).toBe(0);
    // And the rule itself refuses a non-vampire seat even if it were somehow handed a bat.
    expect(towerUnitForSeat(w, P0, 't3Bat')).toBe('t3Bat');
  });

  it('⭐ "from now on": bats already on the board are NOT converted when the perk is taken', () => {
    const { w } = buildAndIgnite('vampires', ['hp', 'def']);
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS + 5);
    const before = [...w.creatures.values()].filter((c) => c.type === 't3Bat').map((c) => c.id);
    expect(before.length).toBeGreaterThan(0);
    w.players.get(P0)!.draftPicks.push('racial');
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS);
    for (const id of before) expect(w.creatures.get(id)?.type).toBe('t3Bat');
    expect(count(w, SWARM)).toBeGreaterThan(0);
  });
});

describe('S188 THE SWARM — ONE promotion rule, combined with APEX PREDATOR, not forked', () => {
  it('the rule names the bat → the swarm, gated by vampires.l10', () => {
    expect(THE_SWARM_FROM).toBe('t3Bat');
    expect(THE_SWARM_TO).toBe(SWARM);
    expect(THE_SWARM_PERK).toBe('vampires.l10');
    expect(RACE_TOWER_UNIT.vampires).toBe(THE_SWARM_FROM);
  });

  it('for a vampire seat holding the swarm, only the bat is promoted — every other unit passes through', () => {
    const { w } = buildAndIgnite('vampires', HOLDS);
    for (const race of ALL_RACES) {
      const u = RACE_TOWER_UNIT[race];
      expect(towerUnitForSeat(w, P0, u)).toBe(u === 't3Bat' ? SWARM : u);
    }
  });

  it('⭐ APEX PREDATOR is untouched: a naga seat holding nagas.l5 still gets elites, never swarms', () => {
    const { w } = buildAndIgnite('nagas', ['hp', 'racial', 'racial']);
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS + 5);
    expect(count(w, 't3PiranhaElite')).toBe(1);
    expect(count(w, SWARM)).toBe(0);
    expect(towerUnitForSeat(w, P0, 't3Piranha')).toBe('t3PiranhaElite');
    expect(towerUnitForSeat(w, P0, 't3Bat')).toBe('t3Bat');
  });

  it('⚠ the two emit sites carry NO swarm-specific code — both call towerUnitForSeat (source guard)', () => {
    // A source guard proves the call EXISTS; the REACH tests above prove it is reached.
    const host = readFileSync(join(process.cwd(), 'src/state/hostTick.ts'), 'utf-8');
    const feed = readFileSync(join(process.cwd(), 'src/state/goblinTowerFeed.ts'), 'utf-8');
    expect(host).toMatch(/creatureType: towerUnitForSeat\(world, sp\.ownerPlayerId, RACE_TOWER_UNIT\[race\]\)/);
    expect(feed).toMatch(/creatureType: towerUnitForSeat\(world, spawner\.ownerPlayerId, outType\)/);
    expect(host).not.toMatch(/t3BatSwarm/);
    expect(feed).not.toMatch(/t3BatSwarm/);
  });
});

describe('S188 THE SWARM — the new type on the save and on the wire', () => {
  function withSwarm(damaged: boolean): { w: World; id: ReturnType<typeof asCreatureId> } {
    const w = makeWorld(0);
    w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!, { x: 0, y: 0 }, 'vampires'));
    const id = asCreatureId(w.nextCreatureId++);
    const c = makeCreature(getCreatureConfig(SWARM), {
      id, ownerPlayerId: P0 as PlayerId, pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 },
      spawnedAtTick: 0, sourceSpawnerId: null,
    });
    if (damaged) c.ehp -= 7;
    w.creatures.set(id, c);
    return { w, id };
  }

  it('⭐⭐ SAVE: an UNDAMAGED swarm round-trips as itself and is rebuilt at the SWARM pool (its type carries it)', () => {
    const { w, id } = withSwarm(false);
    const fresh = makeWorld(0);
    restore(snapshot(w), fresh);
    const r = fresh.creatures.get(id)!;
    expect(r.type).toBe(SWARM);
    expect(r.ehp).toBe(unitPoolFifths(getCreatureConfig(SWARM).hp, getCreatureConfig(SWARM).def));
    expect(hashWorldStateFull(fresh)).toBe(hashWorldStateFull(w));
  });

  it('⭐ SAVE: a damaged swarm keeps its wound across the round-trip', () => {
    const { w, id } = withSwarm(true);
    const fresh = makeWorld(0);
    restore(snapshot(w), fresh);
    expect(fresh.creatures.get(id)!.ehp).toBe(w.creatures.get(id)!.ehp);
  });

  it('⭐⭐ WIRE: the host’s net snapshot, through JSON, lands on a client mirror as a swarm at its own pool', () => {
    for (const damaged of [false, true]) {
      const { w, id } = withSwarm(damaged);
      const wire = JSON.parse(JSON.stringify(netSnapshot(w), wireNumberReplacer)) as NetSnapshot;
      const client = makeWorld(0);
      applyNetSnapshot(wire, client);
      const r = client.creatures.get(id)!;
      expect(r.type, `damaged=${damaged}`).toBe(SWARM);
      expect(r.ehp, `damaged=${damaged}`).toBe(w.creatures.get(id)!.ehp);
      expect(creatureMaxEhp(r)).toBe(creatureMaxEhp(w.creatures.get(id)!));
    }
  });
});

describe('S188 THE SWARM — its OWN art, and a missing sheet degrades to the bat', () => {
  const root = join(process.cwd(), 'public');
  const read = (base: string): { cellH: number; states: Record<string, { frames: number }> } =>
    JSON.parse(readFileSync(join(root, `${base}-anim.json`), 'utf-8'));

  // ART-TESTS-LAND-WITH-THE-ATLAS
  it('⭐ a swarm whose sheet has not resolved draws with the BAT’s sheet — never the green puppet', () => {
    expect(atlasFallbackType(SWARM)).toBe('t3Bat');
    expect(ATLASES[atlasFallbackType(SWARM)!]).toBeTypeOf('string');
    // Nothing else borrows a sheet — every other type keeps its pre-S188 behaviour.
    for (const t of Object.keys(CREATURE_CONFIGS) as CreatureType[]) {
      if (t !== SWARM) expect(atlasFallbackType(t), t).toBeNull();
    }
  });
});
