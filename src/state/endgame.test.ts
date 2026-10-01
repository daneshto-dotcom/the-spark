/**
 * SPARK — ⭐⭐ S192 (owner, A3): THE ENDGAME — the last draft, the build lock, the pants monster waves.
 * Spec: `.claude/plans/S192_ENDGAME_SPEC.md`. Every REACH test here drives the real `runHostTick` /
 * `dispatch`, never a helper in isolation, because a rule that exists but is not reached is the
 * defect class this project keeps paying for (CLAUDE.md, "a source-text guard proves a line EXISTS").
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILD_LOCK_FROM_WAVE,
  ENDGAME_MONSTER_STATS,
  LAST_DRAFT_WAVE,
  MONSTER_EMERGE_TICKS,
  MONSTER_HOLD_LEAD_TICKS,
  PHASE_DURATION_TICKS,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SparkType,
} from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type PlayerId, type PrimitiveId } from '../types.ts';
import { makeGameStateExtras, tickGameState } from './gameState.ts';
import { CREATURE_CONFIGS } from './creatures/voltkin-config.ts';
import { attackFifths, unitPoolFifths } from './stats.ts';
import {
  ENDGAME_LOCK_INTENT_POLICY,
  isBuildLocked,
  isEndgameLockDeniedIntent,
  monstersDueBy,
  monstersLeftToComeOut,
  isMonsterFightHeld,
  monstersPerSeatForWave,
  monsterVictimSeat,
} from './endgame.ts';
import { MONSTER_OWNER_ID, removeEndgameMonsters, runEndgameMonsterTargeting } from './endgameMonsters.ts';
import { CLIENT_INTENT_TYPES } from '../net/protocol.ts';
import { isDraftWave } from './draft.ts';
import { canBuildNow } from './buildLegality.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { restore, snapshot } from './save.ts';
import { formatEndgameCue } from '../render/ui.ts';
import { ATLASES, ENDGAME_MONSTER_ATLAS_BASE, GOBLIN_KINDS, pantsSoundDue } from '../render/goblinRenderer.ts';
import { blueprintBill } from './blueprints.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { makeCastleBank } from './castleBank.ts';
import { damageEntity } from './damage.ts';
import type { Creature } from './creatures/creature.ts';
import './godlyRecipes/laserTurret.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const P2 = asPlayerId(2);

function board(seats = 2): World {
  const world = makeWorld(0x192);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: seats }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat]! }));
  if (seats === 2) {
    dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true, roster });
  } else {
    const botSeats = Array.from({ length: seats - 1 }, (_, i) => i + 1);
    dispatch(world, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats });
  }
  world.gameState = 'PLAYING';
  return world;
}

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** Put the board on the LAST BUILD tick of `wave`, so the next host tick crosses the real BUILD→FIGHT edge. */
function toFightEdge(world: World, wave: number): void {
  world.waveNumber = wave;
  world.matchPhase = 'BUILD';
  world.draft = null;
  world.phaseEndsAtTick = world.tick + 1;
}

function monsters(world: World): Creature[] {
  return [...world.creatures.values()].filter((c) => c.type === 'endgameMonster');
}

/* ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('S192 — the pants monster is ON THE LADDER (spec §2)', () => {
  it('pool = unitPoolFifths(10, 5) = 100, strike = attackFifths(5, 3) = 40 — the castle gun\'s own shot', () => {
    const cfg = CREATURE_CONFIGS.endgameMonster;
    expect([cfg.hp, cfg.def, cfg.atk, cfg.pen]).toEqual([
      ENDGAME_MONSTER_STATS.hp, ENDGAME_MONSTER_STATS.def, ENDGAME_MONSTER_STATS.atk, ENDGAME_MONSTER_STATS.pen,
    ]);
    expect(unitPoolFifths(cfg.hp, cfg.def)).toBe(100);
    expect(attackFifths(cfg.atk, cfg.pen)).toBe(40);
    expect(cfg.targetsStructures).toBe(true); // the shipped strike arms serve it
  });

  it('⭐ HIS counts per living seat (S193 Q1): 27 → 10 · 28 → 25 · 29 → 50 · 30 → 100 · 31 → 250; nothing outside', () => {
    expect([26, 27, 28, 29, 30, 31, 32].map(monstersPerSeatForWave)).toEqual([0, 10, 25, 50, 100, 250, 0]);
  });

  it('⭐ HIS pace, as arithmetic: one lane per seat, one pants per lane every EMERGE ticks, lanes staggered', () => {
    expect(MONSTER_EMERGE_TICKS).toBe(45);
    // 2 seats, 20 total: due 1 at t=0, 2 at t=22.5→23, 3 at t=45 …
    expect([0, 22, 23, 44, 45, 67, 68].map((t) => monstersDueBy(t, 2, 20))).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(monstersDueBy(10_000, 2, 20)).toBe(20); // capped at the wave
    expect(monstersDueBy(-1, 2, 20)).toBe(0);
    expect(monstersDueBy(10, 0, 20)).toBe(0);
    // a seat falling mid-wave shrinks N: the due count DIPS, never bursts
    expect(monstersDueBy(450, 1, 10)).toBeLessThan(monstersDueBy(450, 2, 20));
    // his wave 31 at his pace: 250 per lane × 45 = 11 250 ticks of emergence
    expect(250 * MONSTER_EMERGE_TICKS).toBe(11_250);
  });
});

describe('S192 — REACH: each monster wave pours out of the quarry through the real host tick (spec §3)', () => {
  for (const wave of [27, 28, 29]) {
    it(`wave ${wave}: exactly ${monstersPerSeatForWave(wave)} per living seat, assigned round-robin, owned by no seat`, () => {
      const world = board(2);
      toFightEdge(world, wave);
      // The keeps are made unkillable for the COUNT: at 400 a second a bare keep falls inside the
      // window, the match ends, and the spawner (correctly) stops — "instant death" working.
      for (const p of world.players.values()) p.castleHp = 1_000_000_000;
      const d = deps();
      const st = makeHostTickState(world);
      const seen = new Map<number, PlayerId | undefined>();
      const runFor = monstersPerSeatForWave(wave) * MONSTER_EMERGE_TICKS + 30;
      for (let t = 0; t < runFor; t++) {
        runHostTick(world, d, st);
        for (const c of monsters(world)) seen.set(c.id as unknown as number, c.monsterSeat);
        // the defence kills each one as it is counted, so the S193 live cap (30 a seat) never binds here
        for (const c of monsters(world)) dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: c.id });
      }
      expect(world.matchPhase).toBe('FIGHT');
      const per = monstersPerSeatForWave(wave);
      expect(world.monsterWaveSpawned).toBe(per * 2);
      expect(seen.size).toBe(per * 2);
      expect([...seen.values()].filter((s) => s === P0).length).toBe(per);
      expect([...seen.values()].filter((s) => s === P1).length).toBe(per);
      for (const c of monsters(world)) expect(c.ownerPlayerId).toBe(MONSTER_OWNER_ID);
    });
  }

  it('NEGATIVE: wave 26 is the last monster-free fight — nothing spawns', () => {
    const world = board(2);
    toFightEdge(world, 26);
    const d = deps();
    const st = makeHostTickState(world);
    for (let t = 0; t < 400; t++) runHostTick(world, d, st);
    expect(world.matchPhase).toBe('FIGHT');
    expect(monsters(world).length).toBe(0);
    expect(world.monsterWaveSpawned).toBe(0);
  });

  it('⭐ HIS (Q3): the fight\'s survivors VANISH at its end — after the HOLD lets go — and the next fight counts from zero', () => {
    const world = board(2);
    toFightEdge(world, 27);
    for (const p of world.players.values()) p.castleHp = 1_000_000_000;
    const d = deps();
    const st = makeHostTickState(world);
    for (let t = 0; t < 200; t++) runHostTick(world, d, st);
    expect(monsters(world).length).toBeGreaterThan(0);
    // ⚠ MINE (the hold) — a deadline that falls while pants are still to come out is HELD, not crossed.
    world.phaseEndsAtTick = world.tick + 1;
    runHostTick(world, d, st);
    expect(world.matchPhase).toBe('FIGHT');
    expect(monstersLeftToComeOut(world)).toBeGreaterThan(0);
    expect(isMonsterFightHeld(world)).toBe(true);
    expect(world.phaseEndsAtTick - world.tick).toBe(MONSTER_HOLD_LEAD_TICKS);
    // the last pants comes out, then the held lead counts down normally and the real edge is crossed
    let guard = 0;
    while (world.matchPhase === 'FIGHT' && guard++ < 20 * MONSTER_EMERGE_TICKS + MONSTER_HOLD_LEAD_TICKS + 10) {
      runHostTick(world, d, st);
    }
    expect(world.matchPhase).toBe('BUILD');
    expect(world.waveNumber).toBe(28);
    expect(monsters(world).length).toBe(0);
    expect(world.monsterWaveSpawned).toBe(0);
  });

  it('a monster at its victim\'s keep hits it on the ladder — 40 a blow through DEF 0', () => {
    const world = board(2);
    toFightEdge(world, 27);
    const d = deps();
    const st = makeHostTickState(world);
    for (let t = 0; t < 30; t++) runHostTick(world, d, st); // cross into FIGHT; both lanes' first pants are born
    const a = castleAnchor(1, world.layout);
    const m = monsters(world).find((c) => c.monsterSeat === P1)!;
    m.pos.x = a.x; m.pos.y = a.y; m.prevPos.x = a.x; m.prevPos.y = a.y;
    const before = world.players.get(P1)!.castleHp;
    for (let t = 0; t < 240; t++) runHostTick(world, d, st);
    const lost = before - world.players.get(P1)!.castleHp;
    expect(lost).toBeGreaterThan(0);
    expect(lost % 40).toBe(0);
    expect(world.players.get(P0)!.castleHp).toBe(before); // seat 0's keep is not its business
  });
});

describe('S192 — the retarget is DERIVED: leftovers fan out over the survivors (spec §3)', () => {
  it('pure: a live seat keeps its monsters; an eliminated seat\'s go to the survivors, spread by id', () => {
    const world = board(3);
    expect(monsterVictimSeat(world, { id: 5 as never, monsterSeat: P1 })).toBe(P1);
    world.players.get(P1)!.castleHp = 0;
    const victims = new Set<PlayerId | null>();
    for (let id = 0; id < 64; id++) victims.add(monsterVictimSeat(world, { id: id as never, monsterSeat: P1 }));
    expect(victims).toEqual(new Set([P0, P2]));
    for (const p of world.players.values()) p.castleHp = 0;
    expect(monsterVictimSeat(world, { id: 1 as never, monsterSeat: P1 })).toBe(null);
  });

  it('REACH: after seat 1 falls, its monsters march on a SURVIVOR\'s keep through the real host tick', () => {
    const world = board(3);
    toFightEdge(world, 27);
    const d = deps();
    const st = makeHostTickState(world);
    for (let t = 0; t < 90; t++) runHostTick(world, d, st);
    const sent = monsters(world).filter((c) => c.monsterSeat === P1);
    expect(sent.length).toBeGreaterThan(0);
    world.players.get(P1)!.castleHp = 0;
    for (let t = 0; t < 5; t++) runHostTick(world, d, st);
    const keeps = [0, 2].map((s) => castleAnchor(s, world.layout));
    const k1 = castleAnchor(1, world.layout);
    for (const c of sent) {
      const live = world.creatures.get(c.id);
      if (live === undefined || live.state !== 'SEEKING') continue;
      const dSurvivor = Math.min(...keeps.map((k) => Math.hypot(live.targetPos.x - k.x, live.targetPos.y - k.y)));
      const dFallen = Math.hypot(live.targetPos.x - k1.x, live.targetPos.y - k1.y);
      expect(dSurvivor).toBeLessThan(dFallen);
    }
  });

  it('targeting hunts ONLY the victim seat: with an enemy shape beside it, it still walks to its own victim', () => {
    const world = board(2);
    toFightEdge(world, 27);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    const m = monsters(world).find((c) => c.monsterSeat === P0)!;
    m.state = 'SEEKING';
    runEndgameMonsterTargeting(world, m);
    const k0 = castleAnchor(0, world.layout);
    expect(Math.hypot(m.targetPos.x - k0.x, m.targetPos.y - k0.y)).toBeLessThan(40);
  });
});

describe('S192 — THE BUILD LOCK (spec §4)', () => {
  it('the policy covers EVERY client intent, both directions — a new intent forces a decision', () => {
    expect(new Set(Object.keys(ENDGAME_LOCK_INTENT_POLICY))).toEqual(new Set(CLIENT_INTENT_TYPES));
    const denied = Object.entries(ENDGAME_LOCK_INTENT_POLICY).filter(([, v]) => v === 'deny').map(([k]) => k).sort();
    expect(denied).toEqual(['BUILD_BLUEPRINT', 'PLACE_FROM_FREE', 'PLACE_PRIMITIVE', 'PULL_FROM_BANK']);
    expect(isEndgameLockDeniedIntent('REPAIR_STRUCTURE')).toBe(false); // HIS — FIX stays
    expect(isEndgameLockDeniedIntent('FEED_TOWER')).toBe(false); // HIS — "build more goblins"
  });

  it('starts in BUILD of wave 27, not before', () => {
    expect(BUILD_LOCK_FROM_WAVE).toBe(27);
    expect(isBuildLocked({ waveNumber: 26 })).toBe(false);
    expect(isBuildLocked({ waveNumber: 27 })).toBe(true);
    const world = board(2);
    world.matchPhase = 'BUILD';
    const p = castleAnchor(0, world.layout);
    const near = { x: p.x + 120, y: p.y + 60 };
    world.waveNumber = 26;
    const before = canBuildNow(world, near, P0);
    world.waveNumber = 27;
    expect(canBuildNow(world, near, P0)).toBe(false);
    expect(before).toBe(true); // NEGATIVE: the same pixel was buildable at wave 26
  });

  function fundedTurretBoard(): { world: World; centre: { x: number; y: number } } {
    const world = board(2);
    world.matchPhase = 'BUILD';
    world.phaseEndsAtTick = world.tick + PHASE_DURATION_TICKS;
    const bank = world.castleBanks.get(P0) ?? makeCastleBank();
    for (const [type, count] of blueprintBill('laserTurret')) bank[type as number] = (bank[type as number] ?? 0) + count * 3;
    world.castleBanks.set(P0, bank);
    const a = castleAnchor(0, world.layout);
    return { world, centre: { x: a.x + 300, y: a.y + 200 } }; // clear of the castle keep-out
  }

  it('BUILD_BLUEPRINT through dispatch: built at wave 26, REFUSED at wave 27 (and counted)', () => {
    const { world, centre } = fundedTurretBoard();
    world.waveNumber = 26;
    dispatch(world, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'laserTurret', centre });
    const at26 = world.primitives.size;
    expect(at26).toBeGreaterThan(0); // NEGATIVE control: the build path itself works here

    const w2 = fundedTurretBoard();
    w2.world.waveNumber = 27;
    dispatch(w2.world, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'laserTurret', centre: w2.centre });
    expect(w2.world.primitives.size).toBe(0);
    expect(w2.world.bonds.size).toBe(0);
    expect(w2.world.diagnostics.rejectReasons.endgameBuildLocked).toBe(1);
  });

  it('every DENIED intent is refused at the dispatch choke point before its reducer runs', () => {
    const world = board(2);
    world.waveNumber = 27;
    const intents = [
      { type: 'PLACE_PRIMITIVE', playerId: P0 },
      { type: 'PLACE_FROM_FREE', playerId: P0 },
      { type: 'BUILD_BLUEPRINT', playerId: P0 },
      { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Line },
    ];
    for (const a of intents) dispatch(world, a as never); // a malformed payload would throw if the reducer ran
    expect(world.diagnostics.rejectReasons.endgameBuildLocked).toBe(intents.length);
  });

  it('FIX STILL WORKS under the lock — his self-correction', () => {
    const { world, centre } = fundedTurretBoard();
    world.waveNumber = 26;
    applyBuildBlueprint(world, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'laserTurret', centre });
    const full = world.primitives.size;
    const leaf = [...world.primitives.values()].find((p) => p.origin?.nodeIndex === 3)!;
    expect(damageEntity(world, { kind: 'primitive', id: leaf.id }, PRIMITIVE_MAX_HP, 'creature', null)).toBe(true);
    expect(world.primitives.size).toBe(full - 1);
    world.waveNumber = 27; // the lock is on
    const member = [...world.primitives.values()].find((p) => p.origin?.blueprintId === 'laserTurret')!;
    dispatch(world, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: member.id as PrimitiveId });
    expect(world.primitives.size).toBe(full);
    expect(world.diagnostics.rejectReasons.endgameBuildLocked).toBe(0);
  });

  it('towers keep producing: the castle still recruits through BUILD of wave 27 (real host tick)', () => {
    const world = board(2);
    world.waveNumber = 27;
    world.matchPhase = 'BUILD';
    world.phaseEndsAtTick = world.tick + PHASE_DURATION_TICKS;
    const d = deps();
    const st = makeHostTickState(world);
    const count = (): number => [...world.creatures.values()].filter((c) => c.type === 'raceUnit').length;
    const before = count();
    for (let t = 0; t < 1900; t++) runHostTick(world, d, st);
    expect(count()).toBeGreaterThan(before);
  });

  /*
   * ⛔ THE MECHANICAL ENUMERATION GUARD. A source-text guard proves a line EXISTS, so this one pins
   * the SET of sites that can make a shape or a connector exist, and the behaviour tests above prove
   * each is reached by the lock (or deliberately exempt). A new site fails here until someone decides.
   */
  it('every production site that creates a shape or a connector is enumerated, and each has a lock verdict', () => {
    const root = join(process.cwd(), 'src');
    const hits = new Map<string, number>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!p.endsWith('.ts') || p.endsWith('.test.ts') || p.includes('fixtures')) continue;
        const src = readFileSync(p, 'utf8');
        const n = (src.match(/\b(?:world|w)\.(?:bonds|primitives)\.set\(/g) ?? []).length;
        if (n > 0) hits.set(p.slice(root.length + 1).replace(/\\/g, '/'), n);
      }
    };
    walk(root);
    const VERDICT: Record<string, string> = {
      'state/placePrimitive.ts': 'DENIED — PLACE_PRIMITIVE / PLACE_FROM_FREE (dispatch gate + canBuildNow)',
      'state/blueprintBuild.ts': 'DENIED — BUILD_BLUEPRINT (dispatch gate)',
      'state/structureRepair.ts': 'ALLOWED — FIX, his self-correction',
      'state/save.ts': 'EXEMPT — restore rebuilds what already existed',
    };
    expect(new Set(hits.keys())).toEqual(new Set(Object.keys(VERDICT)));
  });
});

describe('S192 — the draft ends at 26; the match ends after 31 (spec §1, §5, §6)', () => {
  it('the wave-26 draft is the last one', () => {
    expect(LAST_DRAFT_WAVE).toBe(26);
    expect([1, 6, 11, 16, 21, 26].every(isDraftWave)).toBe(true);
    expect(isDraftWave(31)).toBe(false);
    expect(isDraftWave(36)).toBe(false);
  });

  it('REACH: crossing into wave 31 through the real edge opens NO draft', () => {
    const world = board(2);
    world.waveNumber = 30;
    world.draft = null; // the opening draft START_GAME left pending
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + 1;
    world.monsterWaveSpawned = monstersPerSeatForWave(30) * 2; // every pants is out, so nothing holds
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    expect(world.waveNumber).toBe(31);
    expect(world.draft).toBe(null);
  });

  it('⚠ MINE: at the wave-32 edge the living seat with the most points wins', () => {
    const world = board(2);
    world.waveNumber = 32;
    world.scoreByPlayer.set(P0, 100);
    world.scoreByPlayer.set(P1, 900);
    tickGameState(world, makeGameStateExtras(), P0);
    expect(world.gameState).toBe('WIN');
    expect(world.lastWinnerId).toBe(P1);
  });

  it('NEGATIVE: at wave 31 nobody is crowned by the endgame rule', () => {
    const world = board(2);
    world.waveNumber = 31;
    world.scoreByPlayer.set(P1, 900);
    tickGameState(world, makeGameStateExtras(), P0);
    expect(world.gameState).toBe('PLAYING');
  });
});

describe('S192 — four sites: the new field and the new counter are hashed and round-trip (spec §9)', () => {
  it('Creature.monsterSeat contributes to the wide hash and survives snapshot → restore', () => {
    const world = board(2);
    toFightEdge(world, 27);
    runHostTick(world, deps(), makeHostTickState(world));
    const m = monsters(world)[0]!;
    const before = hashWorldStateFull(world);
    const roundTrip = (): World => {
      const w = makeWorld(1);
      restore(snapshot(world), w);
      return w;
    };
    const hBefore = hashWorldStateFull(roundTrip());
    m.monsterSeat = m.monsterSeat === P0 ? P1 : P0;
    expect(hashWorldStateFull(world)).not.toBe(before);
    const w2 = roundTrip();
    expect(w2.creatures.get(m.id)!.monsterSeat).toBe(m.monsterSeat);
    expect(hashWorldStateFull(w2), 'the field must survive the save the worker INIT rides').not.toBe(hBefore);
  });

  it('World.monsterWaveSpawned contributes to the wide hash and survives snapshot → restore', () => {
    const world = board(2);
    const before = hashWorldStateFull(world);
    world.monsterWaveSpawned = 7;
    expect(hashWorldStateFull(world)).not.toBe(before);
    const w2 = makeWorld(1);
    restore(snapshot(world), w2);
    expect(w2.monsterWaveSpawned).toBe(7);
  });

  it('removeEndgameMonsters leaves every other creature alone', () => {
    const world = board(2);
    toFightEdge(world, 27);
    runHostTick(world, deps(), makeHostTickState(world));
    const others = [...world.creatures.values()].filter((c) => c.type !== 'endgameMonster').length;
    removeEndgameMonsters(world);
    expect(monsters(world).length).toBe(0);
    expect([...world.creatures.values()].length).toBe(others);
  });
});

describe('S192 — the art, the sound and the HUD cue', () => {
  it('the atlas pair exists on disk and the renderer owns the type (a missing entry is SILENT)', () => {
    expect(ATLASES.endgameMonster).toBe(ENDGAME_MONSTER_ATLAS_BASE);
    expect(GOBLIN_KINDS.has('endgameMonster')).toBe(true);
    const base = join(process.cwd(), 'public', ENDGAME_MONSTER_ATLAS_BASE.slice(1));
    expect(existsSync(`${base}-atlas.png`)).toBe(true);
    const manifest = JSON.parse(readFileSync(`${base}-anim.json`, 'utf8')) as { states: Record<string, unknown> };
    expect(Object.keys(manifest.states).sort()).toEqual(['attack', 'idle', 'walk']);
    expect(existsSync(join(process.cwd(), 'public', 'audio', 'endgame', 'pants-attack.ogg'))).toBe(true);
  });

  it('⭐ S193 (his): the sound is the ATTACK — owed on each swing, never on emergence nor every frame', () => {
    expect(pantsSoundDue(undefined, 'SPAWNING')).toBe(false);
    expect(pantsSoundDue(undefined, 'ATTACKING')).toBe(true);
    expect(pantsSoundDue('SEEKING', 'ATTACKING')).toBe(true);
    expect(pantsSoundDue('ATTACKING', 'ATTACKING')).toBe(false);
    expect(pantsSoundDue('SPAWNING', 'SEEKING')).toBe(false);
  });

  it('the HUD cue reads the lock and the coming wave from synced state', () => {
    expect(formatEndgameCue('BUILD', 26)).toBe('');
    expect(formatEndgameCue('FIGHT', 26)).toBe('');
    expect(formatEndgameCue('BUILD', 27)).toBe('⛔ FIX ONLY · NEXT 10 PANTS EACH');
    expect(formatEndgameCue('FIGHT', 30, 66)).toBe('PANTS LEFT TO COME OUT: 66'); // ⭐ HIS countdown — "I have 66 left"
    expect(formatEndgameCue('FIGHT', 30, 0)).toBe('ALL PANTS ARE OUT');
    expect(formatEndgameCue('BUILD', 32)).toBe('⛔ FIX ONLY');
  });

});
