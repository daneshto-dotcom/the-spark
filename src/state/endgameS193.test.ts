/**
 * SPARK — ⭐⭐ S193 (owner answers, scope amendment A1): THE ENDGAME, AS HE RULED IT.
 * `.claude/plans/S193_OWNER_ENDGAME_ANSWERS.md`. Every REACH test drives the real `runHostTick` /
 * `dispatch` / reducer, because a rule that exists but is not reached is this project's defect class.
 *
 * Also the S193 merge checks: the pants are ENEMIES of every seat for every predicate master carries
 * (scorch, Ra, the hub blast, the carry, the castle gun, Helga), enumerated mechanically; and the lock
 * against master's placement gates (the blueprint ghost, SCORCHED EARTH, FEED_TOWER, FIX).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASTLE_ATTACK_RANGE,
  MEGA_PANTS_STATS,
  MONSTER_BIRTH_RADIUS_PX,
  MONSTER_HOLD_LEAD_TICKS,
  PHYSICS_HZ,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SparkType,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  STRUCTURE_SELFDESTRUCT_RADIUS,
} from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import {
  asBondId, asCreatureId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type PlayerId,
} from '../types.ts';
import { makeGameStateExtras, tickGameState } from './gameState.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from './creatures/voltkin-config.ts';
import { attackFifths, unitPoolFifths } from './stats.ts';
import { isMonsterFightHeld, megaPantsAtElapsed, megaPantsDue, monstersDueBy, megaPantsSlotTicks, monsterFightTicks, monstersLeftToComeOut, monstersPerSeatForWave, pantsWindowTicks } from './endgame.ts';
import { MONSTER_OWNER_ID, monsterBirthPos, monsterMaxLivePerSeat } from './endgameMonsters.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { applyNetSnapshot as applyNetSnapshotS194, netSnapshot as netSnapshotS194, restore, snapshot } from './save.ts';
import { formatEndgameCue, formatHeldClock, megaPantsArrivalTick, MEGA_PANTS_BANNER, PANTS_BANNER_LINES, PANTS_BANNER_TICKS, pantsBannerText } from '../render/ui.ts';
import { creatureSpriteScaleMul, MEGA_PANTS_SPRITE_SCALE_MUL } from '../render/towerFrames.ts';
import { ATLASES, ENDGAME_MONSTER_ATLAS_BASE, GOBLIN_KINDS } from '../render/goblinRenderer.ts';
import { makeCreature, type Creature } from './creatures/creature.ts';
import { isScorchImmune } from './racial/scorchedEarthRules.ts';
import { runScorchedGround } from './racial/scorchedGround.ts';
import { raColumnTargets } from './racial/raColumn.ts';
import { planHubBlast } from './potatoLifecycle.ts';
import { damageConnector, severWithCarry } from './damage.ts';
import { castleGunsTick, castleFiresOnTick } from './castleGuns.ts';
import { castleShotFifthsFor } from './castleUpgrades.ts';
import { applyDefenderTick, applyRegisterDefender } from './defenders/defenderLifecycle.ts';
import { findNearestEnemyCreatureFrom } from './creatures/creatureAI.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { bankAdd } from './castleBank.ts';
import type { RaceId } from './races.ts';
import type { DraftPick } from './draft.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(seats = 2): World {
  const world = makeWorld(0x193);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: seats }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat]! }));
  if (seats === 2) dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true, roster });
  else if (seats === 1) dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true, roster } as never);
  else dispatch(world, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats: Array.from({ length: seats - 1 }, (_, i) => i + 1) });
  world.gameState = 'PLAYING';
  world.draft = null;
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

function toFightEdge(world: World, wave: number): void {
  world.waveNumber = wave;
  world.matchPhase = 'BUILD';
  world.draft = null;
  world.phaseEndsAtTick = world.tick + 1;
}

const pants = (w: World): Creature[] => [...w.creatures.values()].filter((c) => c.type === 'endgameMonster');
const mega = (w: World): Creature[] => [...w.creatures.values()].filter((c) => c.type === 'megaPants');
const unkillable = (w: World): void => { for (const p of w.players.values()) p.castleHp = 1_000_000_000; };

/** A pants held in place by a long stun — a stun stops what it DOES, never what is done to it. */
function heldPants(w: World, at: { x: number; y: number }, seat: PlayerId = P1): Creature {
  const c = makeCreature(getCreatureConfig('endgameMonster'), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: MONSTER_OWNER_ID, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: null, clock: w,
  });
  c.monsterSeat = seat;
  c.state = 'SEEKING';
  c.stunnedUntilTick = w.tick + 1_000_000;
  w.creatures.set(c.id, c);
  return c;
}

function prim(w: World, seat: PlayerId, x: number, y: number): Primitive {
  const color = w.players.get(seat)!.color;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type: SparkType.Square, placerColor: color, placedBy: seat, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick,
    radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

function link(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(w.nextBondId++);
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b, restLength: Math.sqrt((b.pos.x - a.pos.x) ** 2 + (b.pos.y - a.pos.y) ** 2),
    stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/* ══════════════════════════════════════════ HIS PACE ══════════════════════════════════════════ */

describe('S193 Q1+Q8 — REACH: one pants at a time out of the circle, never a chunk', () => {
  it('no two pants are born on one tick; each lane spreads its wave EVENLY over HIS window (R194-17), born on the rim facing its keep', () => {
    const world = board(2);
    toFightEdge(world, 28);
    unkillable(world);
    const d = deps();
    const st = makeHostTickState(world);
    const bornAt = new Map<number, { tick: number; seat: PlayerId | undefined; x: number; y: number }>();
    const W = pantsWindowTicks(28); // ⭐ S194 R194-17 — 45 s, HIS
    for (let t = 0; t < W + 10; t++) {
      runHostTick(world, d, st);
      for (const c of pants(world)) {
        const id = c.id as unknown as number;
        if (!bornAt.has(id)) bornAt.set(id, { tick: world.tick, seat: c.monsterSeat, x: c.pos.x, y: c.pos.y });
      }
    }
    expect(bornAt.size).toBe(50);
    const ticks = [...bornAt.values()].map((b) => b.tick);
    expect(new Set(ticks).size, 'never two on one tick').toBe(ticks.length);
    for (const seat of [P0, P1]) {
      const lane = [...bornAt.values()].filter((b) => b.seat === seat).map((b) => b.tick).sort((a, b) => a - b);
      expect(lane).toHaveLength(25);
      // ⭐ S194 — was "every EMERGE (45) ticks". Now each lane every 2 × 2700 / 49 = 110.2 ticks: 110 or 111.
      for (let i = 1; i < lane.length; i++) expect([110, 111]).toContain(lane[i]! - lane[i - 1]!);
    }
    // the whole wave is out by the window's end, the last EXACTLY on it (first at the whistle)
    const all = ticks.slice().sort((a, b) => a - b);
    expect(all[all.length - 1]! - all[0]!).toBe(W);
    // born on the rim (20 px inside the 125 px circle), on the ray to the lane's keep
    const rim = monsterBirthPos(world, P1);
    expect(Math.round(Math.sqrt((rim.x - SPAWNER_CENTER_X) ** 2 + (rim.y - SPAWNER_CENTER_Y) ** 2))).toBe(MONSTER_BIRTH_RADIUS_PX);
    expect(MONSTER_BIRTH_RADIUS_PX).toBeLessThan(SPAWNER_RADIUS);
    const k1 = castleAnchor(1, world.layout);
    const k0 = castleAnchor(0, world.layout);
    const d2 = (p: { x: number; y: number }, q: { x: number; y: number }): number => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    expect(d2(rim, k1)).toBeLessThan(d2(rim, k0));
  });

  it('⭐ HIS COUNTDOWN: the number left to come out falls to 0, and a joiner restored from a snapshot reads the same', () => {
    const world = board(2);
    toFightEdge(world, 27);
    unkillable(world);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    expect(monstersLeftToComeOut(world)).toBe(19);
    for (let t = 0; t < 100; t++) runHostTick(world, d, st);
    const left = monstersLeftToComeOut(world);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(19);
    const joiner = makeWorld(1);
    restore(snapshot(world), joiner);
    expect(monstersLeftToComeOut(joiner)).toBe(left);
    expect(formatEndgameCue(joiner.matchPhase, joiner.waveNumber, monstersLeftToComeOut(joiner))).toBe(`PANTS LEFT TO COME OUT: ${left}`);
    for (let t = 0; t < pantsWindowTicks(27); t++) runHostTick(world, d, st); // ⭐ S194 — his 30 s window
    expect(monstersLeftToComeOut(world)).toBe(0);
    expect(monstersLeftToComeOut(board(2))).toBe(0); // outside a monster fight
  });

  it('⭐⭐ S194 R194-17 — the fight length is PREDICTABLE: set at the whistle to window + 10 s, and the last pants comes out exactly at the window end', () => {
    // Was "⚠ MINE (the hold): wave 30 runs past its 60 s while pants are still coming, then ends 10 s after
    // the last" (an open-ended hold, lastDue = ceil(199 × 45 / 2) = 4478). His window (90 s at wave 30)
    // fixes both numbers in advance: last pants at +5400, fight over at +6000 (⚠ MINE: + the old 10 s tail).
    for (const wave of [27, 30]) {
      const world = board(2);
      toFightEdge(world, wave);
      unkillable(world);
      const d = deps();
      const st = makeHostTickState(world);
      runHostTick(world, d, st);
      const start = world.monsterFightStartTick;
      expect(start).toBeGreaterThan(0);
      expect(world.phaseEndsAtTick - start, `wave ${wave}: the deadline is known at the whistle`).toBe(monsterFightTicks(wave));
      const W = pantsWindowTicks(wave);
      let lastBorn = -1;
      let endedAt = -1;
      const seen = new Set<number>();
      for (let t = 0; t < monsterFightTicks(wave) + 30 && endedAt < 0; t++) {
        runHostTick(world, d, st);
        for (const p of pants(world)) {
          if (!seen.has(p.id as unknown as number)) { seen.add(p.id as unknown as number); lastBorn = world.tick; }
          // a defence that keeps up: the live cap never binds, so the window alone sets the pace
          dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: p.id });
        }
        if (world.matchPhase === 'BUILD') endedAt = world.tick;
      }
      expect(seen.size, `wave ${wave}: every pants came out`).toBe(2 * monstersPerSeatForWave(wave));
      expect(lastBorn - start, `wave ${wave}: the last pants at start + window`).toBe(W);
      expect(world.waveNumber).toBe(wave + 1);
      expect(endedAt - start).toBe(monsterFightTicks(wave));
      expect(endedAt - start).toBe(Math.max(60 * PHYSICS_HZ, W + MONSTER_HOLD_LEAD_TICKS));
      expect(world.monsterFightStartTick, 'cleared on leaving FIGHT').toBe(0);
    }
  });

  it('⭐⭐ S194 R194-17 — REACH: wave 31, 250 a seat, ALL out by 120 s through the real host tick (and the fight goes on — his endless final)', () => {
    const world = board(2);
    toFightEdge(world, 31);
    unkillable(world);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    const start = world.monsterFightStartTick;
    const W = pantsWindowTicks(31);
    expect(W).toBe(120 * PHYSICS_HZ);
    let maxPerTick = 0;
    for (let t = 0; t < W; t++) {
      const before = world.monsterWaveSpawned;
      runHostTick(world, d, st);
      maxPerTick = Math.max(maxPerTick, world.monsterWaveSpawned - before);
      for (const p of pants(world)) dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: p.id });
    }
    expect(world.tick - start).toBe(W);
    expect(world.monsterWaveSpawned).toBe(2 * 250);
    expect(monstersLeftToComeOut(world)).toBe(0);
    expect(maxPerTick, 'one at a time, never a chunk').toBe(1);
    // NEGATIVE: one tick short of the window, the last one is still to come
    const w2 = board(2);
    toFightEdge(w2, 31);
    unkillable(w2);
    const st2 = makeHostTickState(w2);
    runHostTick(w2, d, st2);
    for (let t = 0; t < W - 1; t++) {
      runHostTick(w2, d, st2);
      for (const p of pants(w2)) dispatch(w2, { type: 'DESPAWN_CREATURE', creatureId: p.id });
    }
    expect(monstersLeftToComeOut(w2)).toBe(1);
    // and the final fight is still HIS endless one: two seats alive, the clock never ends it
    for (let t = 0; t < 30 * PHYSICS_HZ; t++) runHostTick(world, d, st);
    expect(world.matchPhase).toBe('FIGHT');
    expect(isMonsterFightHeld(world)).toBe(true);
  });

  it('NEGATIVE: an ordinary fight (wave 26) ends on its 60 s, held by nothing', () => {
    const world = board(2);
    toFightEdge(world, 26);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    expect(world.monsterFightStartTick).toBe(0);
    expect(isMonsterFightHeld(world)).toBe(false);
    for (let t = 0; t < 60 * PHYSICS_HZ; t++) runHostTick(world, d, st);
    expect(world.matchPhase).toBe('BUILD');
  });

  it('the new field is hashed and round-trips (four sites)', () => {
    const world = board(2);
    const before = hashWorldStateFull(world);
    world.monsterFightStartTick = 4321;
    expect(hashWorldStateFull(world)).not.toBe(before);
    const w2 = makeWorld(1);
    restore(snapshot(world), w2);
    expect(w2.monsterFightStartTick).toBe(4321);
    world.monsterFightStartTick = 0;
    expect(snapshot(world)).not.toHaveProperty('monsterFightStartTick', 0); // omitted at 0
  });
});

/* ══════════════════════════════════════ THE FINAL FIGHT ═══════════════════════════════════════ */

describe('S193 Q2 — the final fight does not end on the clock while two seats live; the MEGA PANTS', () => {
  function finalFight(): { world: World; d: HostTickDeps; st: ReturnType<typeof makeHostTickState> } {
    const world = board(2);
    toFightEdge(world, 31);
    unkillable(world);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    return { world, d, st };
  }

  it('⭐ HIS: two seats alive — the deadline passes and the board never goes to BUILD', () => {
    const { world, d, st } = finalFight();
    world.monsterWaveSpawned = monstersPerSeatForWave(31) * 2; // every pants out: only HIS rule can hold now
    world.phaseEndsAtTick = world.tick + 1;
    for (let t = 0; t < 2 * MONSTER_HOLD_LEAD_TICKS; t++) runHostTick(world, d, st);
    expect(world.matchPhase).toBe('FIGHT');
    expect(world.waveNumber).toBe(31);
    expect(isMonsterFightHeld(world)).toBe(true);
    expect(formatHeldClock(31)).toBe('WAVE 31   FINAL FIGHT  NO CLOCK');
  });

  it('⭐ HIS: one keep left standing ends it — the survivor wins', () => {
    const { world, d, st } = finalFight();
    world.players.get(P1)!.castleHp = 0;
    runHostTick(world, d, st);
    expect(world.gameState).toBe('WIN');
    expect(world.lastWinnerId).toBe(P0);
  });

  it('⭐⭐ S194 R194-26 HIS (was MINE, 240 s): the mega pants walks out at the 251st slot, never before; a felled one is replaced', () => {
    const { world, d, st } = finalFight();
    world.monsterWaveSpawned = monstersPerSeatForWave(31) * 2;
    const start = world.monsterFightStartTick;
    // arithmetic: T = 250 × 2 = 500 over W = 7200 → slot r = T at floor(500 × 7200 / 499) = 7214
    const T = monstersPerSeatForWave(31) * 2;
    expect(megaPantsSlotTicks(T, pantsWindowTicks(31))).toBe(Math.floor((T * pantsWindowTicks(31)) / (T - 1)));
    expect(megaPantsSlotTicks(T, pantsWindowTicks(31))).toBe(7214);
    expect(megaPantsSlotTicks(1000, pantsWindowTicks(31))).toBe(7207); // 4 seats
    expect(megaPantsSlotTicks(1, pantsWindowTicks(31))).toBe(pantsWindowTicks(31)); // a lone pants: the window end
    expect(megaPantsAtElapsed(world)).toBe(7214);
    // one interval past the 250th: the last pants is at W, the mega one cadence step later
    expect(megaPantsAtElapsed(world) - pantsWindowTicks(31)).toBe(Math.floor(T * pantsWindowTicks(31) / (T - 1)) - pantsWindowTicks(31));
    world.tick = start + megaPantsAtElapsed(world) - 3;
    world.phaseEndsAtTick = world.tick + MONSTER_HOLD_LEAD_TICKS;
    runHostTick(world, d, st);
    expect(mega(world)).toHaveLength(0);
    for (let t = 0; t < 5; t++) runHostTick(world, d, st);
    expect(mega(world)).toHaveLength(1);
    const m = mega(world)[0]!;
    expect(m.ownerPlayerId).toBe(MONSTER_OWNER_ID);
    expect(megaPantsDue(world)).toBe(false); // one at a time
    dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: m.id });
    runHostTick(world, d, st);
    expect(mega(world)).toHaveLength(1); // "basically unbeatable": another walks out
  });

  it('NEGATIVE: no mega pants on wave 30, nor with one seat left', () => {
    const world = board(2);
    world.waveNumber = 30;
    world.matchPhase = 'FIGHT';
    world.monsterFightStartTick = 1;
    world.tick = 1 + megaPantsAtElapsed(world) + 10;
    world.monsterWaveSpawned = monstersPerSeatForWave(31) * 2;
    expect(megaPantsDue(world)).toBe(false);
    world.waveNumber = 31;
    expect(megaPantsDue(world)).toBe(true);
    // ⭐ S194 R194-26 — "after the last pant came out": one wave pants still to come → not yet
    world.monsterWaveSpawned -= 1;
    expect(megaPantsDue(world)).toBe(false);
    world.monsterWaveSpawned += 1;
    world.players.get(P1)!.castleHp = 0;
    expect(megaPantsDue(world)).toBe(false);
  });

  it('⚠ MINE (the stats), on the ladder: pool 12 500, strike 1 500 — a 2500 keep falls in two blows (REACH)', () => {
    const c = CREATURE_CONFIGS.megaPants;
    expect([c.hp, c.def, c.atk, c.pen]).toEqual([MEGA_PANTS_STATS.hp, MEGA_PANTS_STATS.def, MEGA_PANTS_STATS.atk, MEGA_PANTS_STATS.pen]);
    expect(unitPoolFifths(c.hp, c.def)).toBe(12_500);
    expect(attackFifths(c.atk, c.pen)).toBe(1_500);
    expect(unitPoolFifths(c.hp, c.def) / unitPoolFifths(10, 5)).toBe(125); // 125 wave pants
    const world = board(2);
    toFightEdge(world, 31);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    world.monsterWaveSpawned = monstersPerSeatForWave(31) * 2;
    for (const p of pants(world)) dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: p.id });
    world.tick = world.monsterFightStartTick + megaPantsAtElapsed(world);
    world.phaseEndsAtTick = world.tick + MONSTER_HOLD_LEAD_TICKS;
    runHostTick(world, d, st);
    const m = mega(world)[0]!;
    const victimSeat = [P0, P1].find((s) => {
      const k = castleAnchor(s as unknown as number, world.layout);
      return Math.abs(m.targetPos.x - k.x) < 60 && Math.abs(m.targetPos.y - k.y) < 60;
    })!;
    expect(victimSeat).toBeDefined();
    const k = castleAnchor(victimSeat as unknown as number, world.layout);
    m.pos.x = k.x; m.pos.y = k.y; m.prevPos.x = k.x; m.prevPos.y = k.y;
    const hp0 = world.players.get(victimSeat)!.castleHp;
    for (let t = 0; t < 400 && world.gameState === 'PLAYING'; t++) runHostTick(world, d, st);
    const lost = hp0 - Math.max(0, world.players.get(victimSeat)!.castleHp);
    expect(lost).toBeGreaterThanOrEqual(hp0); // the keep fell
    expect(world.gameState).toBe('WIN'); // and the other seat — the last survivor — won
    expect(world.lastWinnerId).not.toBe(victimSeat);
  });

  it('⭐ HIS: a wipe in the endgame goes to the TOP SCORE; before wave 27 the S162 wipe rule is unchanged', () => {
    for (const [wave, want] of [[31, P1], [20, P0]] as const) {
      const world = board(2);
      world.waveNumber = wave;
      world.scoreByPlayer.set(P0, 100);
      world.scoreByPlayer.set(P1, 900);
      for (const p of world.players.values()) p.castleHp = 0;
      tickGameState(world, makeGameStateExtras(), P0);
      expect(world.gameState, `wave ${wave}`).toBe('WIN');
      expect(world.lastWinnerId, `wave ${wave}`).toBe(want);
    }
  });

  it('the mega pants is drawn: the same sheet, 3.5× a unit, in the renderer\'s owned set', () => {
    expect(ATLASES.megaPants).toBe(ENDGAME_MONSTER_ATLAS_BASE);
    expect(GOBLIN_KINDS.has('megaPants')).toBe(true);
    expect(creatureSpriteScaleMul('megaPants')).toBe(MEGA_PANTS_SPRITE_SCALE_MUL);
    expect(MEGA_PANTS_SPRITE_SCALE_MUL).toBe(3.5);
  });
});

/* ══════════════════════════════════ Q6 — THE QUARRY AND THE BANNER ════════════════════════════ */

describe('S193 Q6 — shapes stop coming from the lock on; the big silly banner', () => {
  it('⭐ HIS: REACH — in BUILD of wave 27 the quarry mints nothing; in BUILD of wave 26 it does', () => {
    for (const [wave, mints] of [[26, true], [27, false]] as const) {
      const world = board(2);
      world.waveNumber = wave;
      world.matchPhase = 'BUILD';
      world.phaseEndsAtTick = world.tick + 100_000;
      world.freeSparks.clear();
      const d = deps();
      const st = makeHostTickState(world);
      for (let t = 0; t < 30 * PHYSICS_HZ; t++) runHostTick(world, d, st);
      expect(world.freeSparks.size > 0, `wave ${wave}`).toBe(mints);
    }
  });

  it('the banner: one silly line per monster wave for its first 4 s, the mega pants line at its arrival, nothing else', () => {
    expect(PANTS_BANNER_TICKS).toBe(4 * PHYSICS_HZ);
    const at = (wave: number, elapsed: number, phase: 'FIGHT' | 'BUILD' = 'FIGHT') =>
      pantsBannerText({ matchPhase: phase, waveNumber: wave, monsterFightStartTick: 1000, tick: 1000 + elapsed }, 1000 + 7214);
    expect(at(27, 0)).toBe('BEWARE THE PANTS!');
    expect(at(28, PANTS_BANNER_TICKS - 1)).toBe('INCOMING PANTS!');
    expect(at(28, PANTS_BANNER_TICKS)).toBe('');
    expect(at(27, 0, 'BUILD')).toBe('');
    expect(at(26, 0)).toBe('');
    expect(at(31, 7214)).toBe(MEGA_PANTS_BANNER);
    expect(at(31, 7213)).toBe(''); // one tick before he arrived
    expect(at(31, 7214 + PANTS_BANNER_TICKS)).toBe('');
    // ⭐ S194 re-audit LOW-1 — no mega pants on the board → no mega banner, whatever the clock says
    expect(pantsBannerText({ matchPhase: 'FIGHT', waveNumber: 31, monsterFightStartTick: 1000, tick: 1000 + 7214 }, null)).toBe('');
    expect(at(30, 7214)).toBe('');
    for (const w of [27, 28, 29, 30, 31]) expect(PANTS_BANNER_LINES[w]!.length).toBeGreaterThan(0);
  });

  it('REACH: the banner reads the real host tick\'s fight start', () => {
    const world = board(2);
    toFightEdge(world, 27);
    runHostTick(world, deps(), makeHostTickState(world));
    expect(pantsBannerText(world, megaPantsArrivalTick(world))).toBe('BEWARE THE PANTS!');
  });

  it('⭐ S194 re-audit LOW-1 — REACH: the mega banner shows on his REAL arrival, not on his slot', () => {
    // A held lane delays him past his slot (`megaPantsDue` waits for the last wave pants); the banner must
    // follow the creature. Here every wave pants is out only 500 ticks after the slot.
    const world = board(2);
    toFightEdge(world, 31);
    unkillable(world);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    const start = world.monsterFightStartTick;
    const slot = megaPantsAtElapsed(world);
    world.tick = start + slot;
    world.phaseEndsAtTick = world.tick + MONSTER_HOLD_LEAD_TICKS;
    // The REAL hold: the last slot belongs to lane P1 (k = T − 1, odd), and P1 is kept AT the live cap
    // (topped up before every tick — the castle guns thin it), so the spawner may not release it.
    const T = monstersPerSeatForWave(31) * 2;
    world.monsterWaveSpawned = T - 1;
    const k1 = castleAnchor(1, world.layout);
    const topUp = (): void => {
      let n = pants(world).filter((c) => c.monsterSeat === P1).length;
      for (; n < monsterMaxLivePerSeat(2); n++) {
        dispatch(world, {
          type: 'SPAWN_CREATURE', creatureType: 'endgameMonster', ownerPlayerId: MONSTER_OWNER_ID,
          pos: monsterBirthPos(world, P1), targetPos: { ...k1 }, sourceSpawnerId: null, monsterSeat: P1,
        });
      }
    };
    let bannerAtSlot = 'unset';
    for (let t = 0; t < 500; t++) {
      topUp();
      runHostTick(world, d, st);
      if (t === 1) bannerAtSlot = pantsBannerText(world, megaPantsArrivalTick(world)); // inside the old slot window
    }
    expect(bannerAtSlot, 'at his slot, held back: the old slot-driven banner would fire here').toBe('');
    expect(world.monsterWaveSpawned, 'the cap really held the last lane').toBe(T - 1);
    expect(mega(world), 'held: no mega yet').toHaveLength(0);
    expect(pantsBannerText(world, megaPantsArrivalTick(world)), 'past his slot, but he is not here — no banner').toBe('');
    for (const p of pants(world)) dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: p.id }); // the defence catches up
    runHostTick(world, d, st);
    expect(world.monsterWaveSpawned).toBe(T);
    expect(mega(world)).toHaveLength(1);
    const arrived = megaPantsArrivalTick(world)!;
    expect(arrived - start).toBeGreaterThan(slot + 400);
    expect(pantsBannerText(world, arrived)).toBe(MEGA_PANTS_BANNER);
    // and a joiner reads the same arrival off the wire (`despawnAtTick` rides it)
    const client = board(2);
    client.isHost = false;
    applyNetSnapshotS194(JSON.parse(JSON.stringify(netSnapshotS194(world))), client);
    expect(megaPantsArrivalTick(client)).toBe(arrived);
  });
});

/* ══════════════════════════ THE PANTS ARE EVERY SEAT'S ENEMY — MERGE CHECK ═════════════════════ */

describe('S193 merge — every owner predicate on master treats a pants as an enemy of every seat', () => {
  /**
   * ⛔ MECHANICAL, NOT PROSE. Every production comparison of an owner (`ownerPlayerId`, `placedBy`) or
   * call of `isScorchImmune` under `src/state` and `src/bots`, counted per file and pinned with a
   * verdict for an owner that is no seat (`MONSTER_OWNER_SEAT`, 255, never in `world.players`). A new
   * comparison changes a count and turns this red until someone writes its verdict. The REACH tests
   * below then prove the six families the brief names through the real functions.
   */
  /*
   * ⭐ S194 (teams merge) — the files below that DROPPED out, or whose count fell, had their enemy decisions
   * converted to `sameTeam` / `isEnemySeat` (`state/teams.ts`). The pants verdict is unchanged: `sameTeam(world,
   * 255, seat)` reads `world.teams[255]`, which is never set, so a pants is nobody's teammate; and with teams off
   * `sameTeam` IS `===`. The REACH tests below drive the six families through the converted functions. Converted
   * whole: state/bossSkills.ts, state/bossSkillsArchdemon.ts, state/bossSkillsKraken.ts, state/racial/zombieDeathBlast.ts, state/creatures/creatureAI.ts, state/creatures/retaliation.ts, state/creatures/suicideBlast.ts, state/damage.ts, state/defenders/defenderLifecycle.ts, state/defenders/stinkTower.ts, state/potatoLifecycle.ts, state/racial/theRisen.ts, state/world.ts, bots/botController.ts, bots/botRa.ts.
   */
  const SITES: Record<string, { n: number; verdict: string }> = {
    'src/state/bossSkillsPharaoh.ts': { n: 1, verdict: 'counts the boss\'s OWN locusts — a pants never counts' },
    'src/state/bossSkillsWarlord.ts': { n: 1, verdict: 'counts the boss\'s OWN wolves — a pants never counts' },
    'src/state/creatures/creatureLifecycle.ts': { n: 2, verdict: 'summon latch (pants exempt) + kill credit to a different owner — S194 teams: the rest ask sameTeam' },
    'src/state/creatures/voltkinChain.ts': { n: 1, verdict: 'skip OWN → chains onto a pants — S194 teams: the rest ask sameTeam' },
    'src/state/endgameMonsters.ts': { n: 1, verdict: 'the pants\' own victim filter (=== its seat; ⭐ S194 R194-27: the unit half is now the per-tick index KEYED by ownerPlayerId, `ownedBy` — same filter, no comparison)' },
    'src/state/exploredMemory.ts': { n: 2, verdict: 'fog memory of enemy SHAPES — a pants places none' },
    'src/state/gameMode.ts': { n: 1, verdict: 'gatherer / spawner owner bookkeeping — seats only — S194 teams: the rest ask sameTeam' },
    'src/state/gatherers/gathererLifecycle.ts': { n: 5, verdict: 'gatherer ownership — seats only' },
    'src/state/goblinKinds.ts': { n: 2, verdict: 'a seat\'s own spawners — seats only' },
    'src/state/goblinTowerFeed.ts': { n: 1, verdict: 'FEED_TOWER: tower owner === feeder — seats only' },
    // ⭐ S193 T4 (goblin-autobuild) — both seat-only: a pants owns no tower and sends no intent.
    'src/state/goblinAutoFeed.ts': { n: 1, verdict: 'SET_AUTO_FEED: tower owner === toggler — seats only' },
    'src/state/spawners/spawnerLifecycle.ts': { n: 1, verdict: 'remembered toggles restored only to the SAME seat — seats only' },
    'src/state/godlyMatcherCore.ts': { n: 2, verdict: 'a seat\'s own spawners — seats only' },
    'src/state/magicResistCue.ts': { n: 2, verdict: 'cosmetic RESIST cue mirrors each source skip-OWN / isScorchImmune; a pants has MRES = DEF so is never cued — S194 teams: the rest ask sameTeam' },
    'src/state/raceUnitEmit.ts': { n: 1, verdict: 'counts a seat\'s own race units — a pants never counts' },
    'src/state/racial/corpseEater.ts': { n: 1, verdict: 'enemy/own split by boss owner → a pants corpse is an enemy\'s' },
    'src/state/racial/endlessDynasty.ts': { n: 1, verdict: 'counts a seat\'s own mummies' },
    'src/state/racial/scorchedEarthRules.ts': { n: 1, verdict: 'isScorchImmune: owner === spared → never for 255' },
    'src/state/racial/scorchedGround.ts': { n: 6, verdict: 'every burn arm asks isScorchImmune → a pants burns' },
    // ⭐ S193 weld merge seam — `s189/weld` R191-A / R191-B. Every one is seat bookkeeping a pants (255,
    // never in `world.players`) can never be party to: it places no shapes, owns no gatherers, queues no jobs.
    'src/state/repairJobs.ts': { n: 3, verdict: 'FIX jobs: a seat\'s own gatherers / stamped shapes / bank reservations — seats only' },
    'src/state/structureRepair.ts': { n: 2, verdict: 'FIX / SCRAP: a seat\'s own shapes only (seatStructureAt + reclaimScopeAt)' },
    'src/state/towerUnit.ts': { n: 2, verdict: 'a fallen stamp is grouped from ONE placer\'s shapes — a pants places none' },
    'src/state/vision.ts': { n: 2, verdict: 'a seat\'s own sight sources — a pants grants none' },
    'src/bots/botBrain.ts': { n: 12, verdict: 'a bot\'s own shapes/gatherers — seats only; chooseFeed: own spawners; a pants owns none — S194 teams: the rest ask sameTeam; S195 T22: +3 `placedBy === seat` in ownStructures / entropySafeSources / freshStructurePos (the bot\'s OWN structures, is-this-MINE)' },
  };

  it('the enumeration is complete and every site has a verdict (a new comparison turns this red)', () => {
    const re = /ownerPlayerId (!==|===)|(!==|===) [a-zA-Z.?]*ownerPlayerId\b|placedBy (!==|===)|(!==|===) [a-zA-Z.?]*placedBy\b|isScorchImmune\(/g;
    const found: Record<string, number> = {};
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir).sort()) {
        const p = `${dir}/${f}`;
        if (statSync(join(process.cwd(), p)).isDirectory()) { walk(p); continue; }
        if (!p.endsWith('.ts') || /\.test\.ts$|fixtures/.test(p)) continue;
        const n = (readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n').match(re) ?? []).length;
        if (n > 0) found[p] = n;
      }
    };
    walk('src/state');
    walk('src/bots');
    expect(found).toEqual(Object.fromEntries(Object.entries(SITES).map(([k, v]) => [k, v.n])));
  });

  it('SCORCH — isScorchImmune spares no seat\'s enemy pants, and the passive burns one in a demon\'s land (REACH)', () => {
    for (const seat of [0, 1, 2, 3, 4, 5]) expect(isScorchImmune({ teams: undefined }, MONSTER_OWNER_ID, asPlayerId(seat))).toBe(false);
    const w = board(2);
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    const pl = w.players.get(P0)!;
    pl.raceId = 'demons' as RaceId;
    pl.draftPicks = ['racial'] as DraftPick[];
    const m = heldPants(w, { x: 600, y: 200 }, P0);
    const ehp0 = m.ehp;
    for (let t = 0; t < 4 * PHYSICS_HZ; t++) { runScorchedGround(w); w.tick++; }
    expect(m.ehp).toBeLessThan(ehp0);
  });

  it('RA — a column catches a pants, for the perk (sparing the caster) and the boss (sparing nobody)', () => {
    const w = board(2);
    const m = heldPants(w, { x: 700, y: 300 });
    for (const spare of [P0, P1, null]) {
      const hits = raColumnTargets(w, spare, { x: 700, y: 300 });
      expect(hits.some((t) => t.kind === 'creature' && t.id === (m.id as unknown as number)), String(spare)).toBe(true);
    }
  });

  it('HUB BLAST — planHubBlast includes a pants for every hub owner', () => {
    const w = board(2);
    const m = heldPants(w, { x: 700, y: 300 });
    for (const owner of [P0, P1]) {
      const plan = planHubBlast(w, 700, 320, STRUCTURE_SELFDESTRUCT_RADIUS, owner);
      expect(plan.some((s) => s.kind === 'creature' && s.id === (m.id as unknown as number))).toBe(true);
    }
  });

  it('CARRY — a pants\' strike severs through the real dispatch, and the carry stays on the struck seat (never across the weld)', () => {
    const w = board(2);
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    const A = prim(w, P1, 500, 400);
    const B = prim(w, P1, 540, 400);
    const C = prim(w, P0, 580, 400);
    const D = prim(w, P0, 620, 400);
    const ab = link(w, A, B);
    const bc = link(w, B, C);
    const cd = link(w, C, D);
    const bg = link(w, B, prim(w, P1, 540, 440));
    const m = heldPants(w, { x: 520, y: 400 });
    const hit = attackFifths(CREATURE_CONFIGS.endgameMonster.atk, CREATURE_CONFIGS.endgameMonster.pen);
    expect(damageConnector(w, ab, hit, { kind: 'creature', id: m.id }, 'physical')).toBe(true);
    // the sever is dispatched with the pants' owner (255, in no `world.players`) and cause 'unit', as
    // `applyCreatureAttack` does — and it must not be refused for being nobody
    const felled = severWithCarry(w, ab, (id) => dispatch(w, { type: 'SEVER_BOND', bondId: id, playerId: m.ownerPlayerId, cause: 'unit' }));
    expect(felled).toBeGreaterThanOrEqual(1);
    expect(w.bonds.has(ab)).toBe(false);
    expect(w.bonds.has(bc), 'the weld is not a carry target').toBe(true);
    expect(w.bonds.has(cd), 'seat 0\'s connector is not seat 1\'s carry').toBe(true);
    void bg;
  });

  it('CASTLE GUN — a pants inside a keep\'s range is that keep\'s target and takes its shot (REACH)', () => {
    const w = board(2);
    w.matchPhase = 'FIGHT';
    const k = castleAnchor(0, w.layout);
    const m = heldPants(w, { x: k.x + CASTLE_ATTACK_RANGE / 2, y: k.y }, P0);
    expect(findNearestEnemyCreatureFrom(w, k, P0, CASTLE_ATTACK_RANGE ** 2)).toBe(m.id);
    while (!castleFiresOnTick(0, w.tick)) w.tick++;
    const ehp0 = m.ehp;
    castleGunsTick(w);
    expect(ehp0 - m.ehp).toBe(castleShotFifthsFor(w.players.get(P0)!.castleUpgrades));
  });

  it('HELGA — she acquires and slaps a pants (REACH through applyDefenderTick)', () => {
    const w = makeWorld(0);
    w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
    w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
    w.gameState = 'PLAYING';
    w.matchPhase = 'FIGHT';
    const anchor = prim(w, P0, 100, 100);
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: anchor.id, recipeId: 'helga', pos: { x: 100, y: 100 } });
    const m = heldPants(w, { x: 130, y: 100 }, P0);
    const ehp0 = m.ehp;
    for (let i = 0; i < 20 * PHYSICS_HZ && m.ehp === ehp0; i++) {
      for (const id of [...w.defenders.keys()]) applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: id });
      w.tick++;
    }
    expect(m.ehp).toBeLessThan(ehp0);
  });
});

/* ════════════════════════════ THE LOCK AGAINST MASTER'S PLACEMENT GATES ════════════════════════ */

describe('S193 merge — the lock against master\'s gates', () => {
  it('the blueprint ghost says LOCKED from wave 27 (and FIGHT still wins in a fight)', () => {
    const w = board(2);
    w.matchPhase = 'BUILD';
    const site = { x: 500, y: 300 };
    w.waveNumber = 26;
    expect(stampRefusalAt(w, site, P0, 'laserTurret')).not.toBe('LOCKED');
    w.waveNumber = 27;
    expect(stampRefusalAt(w, site, P0, 'laserTurret')).toBe('LOCKED');
    w.matchPhase = 'FIGHT';
    expect(stampRefusalAt(w, site, P0, 'laserTurret')).toBe('FIGHT');
  });

  it('SCORCHED EARTH — a cast is not a build: it passes the lock and lands through the real reducer', () => {
    const w = board(2);
    w.waveNumber = 28;
    w.matchPhase = 'FIGHT';
    const pl = w.players.get(P0)!;
    pl.raceId = 'demons' as RaceId;
    pl.draftPicks = ['racial'] as DraftPick[];
    const locked0 = w.diagnostics.rejectReasons.endgameBuildLocked;
    dispatch(w, { type: 'CAST_SCORCHED_EARTH', playerId: P0, zoneSeat: P1 } as never);
    expect(w.diagnostics.rejectReasons.endgameBuildLocked).toBe(locked0);
    expect(pl.scorchedEarth).toEqual({ wave: 28, zoneSeat: P1 });
  });

  it('FEED_TOWER — "they can build more goblins": a feed at wave 27 passes the lock and births a goblin', () => {
    const w = board(2);
    w.waveNumber = 27;
    w.matchPhase = 'BUILD';
    w.creatures.clear();
    const hub = prim(w, P0, 300, 300);
    for (let i = 0; i < 4; i++) link(w, hub, prim(w, P0, 340 + 40 * i, 300));
    const TOWER = asSpawnerId(77);
    w.creatureSpawners.set(TOWER, {
      id: TOWER, ownerPlayerId: P0, anchorPrimitiveId: hub.id, recipeId: 'goblinTower',
      nextSpawnTick: 1e9, lastValidatedTick: 0, spawnedCount: 0, ignitedAtTick: 0,
    } as never);
    bankAdd(w.castleBanks, P0, SparkType.Triangle);
    const locked0 = w.diagnostics.rejectReasons.endgameBuildLocked;
    dispatch(w, { type: 'FEED_TOWER', playerId: P0, spawnerId: TOWER, sparkType: SparkType.Triangle });
    expect(w.diagnostics.rejectReasons.endgameBuildLocked).toBe(locked0);
    expect([...w.creatures.values()].map((c) => c.type)).toEqual(['goblinMelee']);
  });

  it('NEGATIVE: the same wave refuses a hand-placed shape at the choke point, and counts it', () => {
    const w = board(2);
    w.waveNumber = 27;
    w.matchPhase = 'BUILD';
    const locked0 = w.diagnostics.rejectReasons.endgameBuildLocked;
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P0 } as never);
    expect(w.diagnostics.rejectReasons.endgameBuildLocked).toBe(locked0 + 1);
  });
});

describe('S193 — the clock readout tells the truth', () => {
  it('a wave-30 fight counts its 60 s normally, and says PANTS STILL COMING only once the deadline is held', async () => {
    const { isClockFrozenForDisplay } = await import('./endgame.ts');
    const world = board(2);
    toFightEdge(world, 30);
    unkillable(world);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    expect(isMonsterFightHeld(world)).toBe(true);
    expect(isClockFrozenForDisplay(world), 'early in the fight the 60 s count is true').toBe(false);
    world.phaseEndsAtTick = world.tick + 1;
    runHostTick(world, d, st);
    expect(isClockFrozenForDisplay(world)).toBe(true);
    expect(formatHeldClock(30)).toBe('WAVE 30   FIGHT  PANTS STILL COMING');
    const fin = board(2);
    toFightEdge(fin, 31);
    runHostTick(fin, deps(), makeHostTickState(fin));
    expect(isClockFrozenForDisplay(fin), 'the final fight has no clock from its first tick').toBe(true);
  });
});

describe('S193 — a CLIENT reads the same countdown, banner and clock from the 10 Hz wire', () => {
  it('netSnapshot → applyNetSnapshot carries monsterFightStartTick and monsterWaveSpawned', async () => {
    const { netSnapshot, applyNetSnapshot } = await import('./save.ts');
    const { isClockFrozenForDisplay } = await import('./endgame.ts');
    const host = board(2);
    toFightEdge(host, 31);
    unkillable(host);
    const d = deps();
    const st = makeHostTickState(host);
    for (let t = 0; t < 120; t++) runHostTick(host, d, st);
    const client = board(2);
    client.isHost = false;
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), client);
    expect(client.monsterFightStartTick).toBe(host.monsterFightStartTick);
    expect(monstersLeftToComeOut(client)).toBe(monstersLeftToComeOut(host));
    expect(pantsBannerText(client, megaPantsArrivalTick(client))).toBe(pantsBannerText(host, megaPantsArrivalTick(host)));
    expect(isClockFrozenForDisplay(client)).toBe(isClockFrozenForDisplay(host));
    expect(monstersLeftToComeOut(client)).toBeGreaterThan(0);
  });
});

/* ══════════════════════ ⭐⭐ S194 R194-17 + R194-2 — A FALLEN SEAT'S LANE STOPS ══════════════════════ */

describe('⭐⭐ S194 R194-17 × R194-2 — a seat knocked out mid-window: its un-emerged pants never come', () => {
  it('REACH (3 seats, wave 28): after seat 2 falls, not one more pants is born for it, and the rest are still out by the window end', () => {
    const world = board(3);
    toFightEdge(world, 28);
    unkillable(world);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    const start = world.monsterFightStartTick;
    const W = pantsWindowTicks(28);
    const P2 = asPlayerId(2);
    const seen = new Map<number, PlayerId | undefined>();
    const sweep = (): void => {
      for (const p of pants(world)) {
        seen.set(p.id as unknown as number, p.monsterSeat);
        dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: p.id });
      }
    };
    while (world.tick - start < W / 2) { runHostTick(world, d, st); sweep(); }
    const beforeFall = [...seen.values()].filter((s) => s === P2).length;
    expect(beforeFall, 'anti-vacuity: seat 2 had pants before it fell').toBeGreaterThan(0);
    world.players.get(P2)!.castleHp = 0;
    const fallTick = world.tick;
    while (world.tick - start <= W) { runHostTick(world, d, st); sweep(); }
    expect([...seen.values()].filter((s) => s === P2).length, 'no pants for the fallen seat after the fall').toBe(beforeFall);
    expect(world.tick).toBeGreaterThan(fallTick);
    // ⭐ S194 (T8 merge) — the schedule runs over the LANES that started the fight: the fallen lane's slots
    // are skipped at no cost, so every slot is consumed by the window's end and each SURVIVOR gets his full
    // count, at an unchanged pace (was: the total shrank to count × living and the survivors got fewer).
    expect(world.monsterWaveSpawned).toBe(monstersPerSeatForWave(28) * 3);
    for (const s of [0, 1]) expect([...seen.values()].filter((v) => v === asPlayerId(s)).length, `seat ${s}`).toBe(monstersPerSeatForWave(28));
    expect(monstersLeftToComeOut(world)).toBe(0);
  });
});

/* ═══════════════════════ ⭐⭐ S194 R194-26 — THE MEGA PANTS IS THE 251st (REACH) ═══════════════════════ */

describe('⭐⭐ S194 R194-26 — REACH: the mega pants walks out exactly one cadence step after the 250th', () => {
  for (const seats of [2, 4]) {
    it(`${seats} seats: the last wave pants at start + W, the mega pants at start + floor(T × W / (T − 1)), nothing between`, () => {
      const world = board(seats);
      toFightEdge(world, 31);
      unkillable(world);
      const d = deps();
      const st = makeHostTickState(world);
      runHostTick(world, d, st);
      const start = world.monsterFightStartTick;
      const W = pantsWindowTicks(31);
      const T = monstersPerSeatForWave(31) * seats;
      const slot = Math.floor((T * W) / (T - 1)); // derived from the constants, not typed
      let lastPants = -1;
      let megaAt = -1;
      const seen = new Set<number>();
      for (let t = 0; t < slot + 60 && megaAt < 0; t++) {
        runHostTick(world, d, st);
        for (const p of pants(world)) {
          const id = p.id as unknown as number;
          if (!seen.has(id)) { seen.add(id); lastPants = world.tick; }
          dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: p.id });
        }
        if (mega(world).length > 0) megaAt = world.tick;
      }
      expect(seen.size, 'every wave pants out first').toBe(T);
      expect(lastPants - start).toBe(W);
      expect(megaAt - start, 'the 251st slot').toBe(slot);
      expect(megaAt - start).toBe(megaPantsAtElapsed(world));
      expect(megaAt - start).toBeGreaterThan(lastPants - start); // after the last, never before
      expect(mega(world)).toHaveLength(1);
    });
  }
});

describe('⭐⭐ S194 R194-26 × T8 lanes — a seat falls mid-window and the mega pants STILL comes at his 251st slot', () => {
  it('REACH (3 seats, wave 31): seat 2 falls at half the window; the mega pants walks out at start + floor(T × W / (T − 1)), T = 250 × 3 lanes', () => {
    const world = board(3);
    toFightEdge(world, 31);
    unkillable(world);
    const d = deps();
    const st = makeHostTickState(world);
    runHostTick(world, d, st);
    const start = world.monsterFightStartTick;
    const W = pantsWindowTicks(31);
    const T = monstersPerSeatForWave(31) * 3; // the LANES that started the fight, not the living seats
    const slot = Math.floor((T * W) / (T - 1));
    let megaAt = -1;
    for (let t = 0; t < slot + 60 && megaAt < 0; t++) {
      if (world.tick - start === Math.floor(W / 2)) world.players.get(asPlayerId(2))!.castleHp = 0;
      runHostTick(world, d, st);
      for (const p of pants(world)) dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: p.id });
      if (mega(world).length > 0) megaAt = world.tick;
    }
    expect(world.players.get(asPlayerId(2))!.castleHp, 'anti-vacuity: seat 2 really fell').toBe(0);
    expect(world.monsterWaveSpawned, 'every lane slot consumed, the fallen lane\'s skipped').toBe(T);
    expect(megaAt - start, 'the 251st slot, unmoved by the fall').toBe(slot);
    expect(megaAt - start).toBe(megaPantsAtElapsed(world));
  });

  it('NEGATIVE (the hazard the T8 auditor named): a schedule over LIVING seats would leave spawned short of the lane total — no mega', () => {
    // with `living` (2) in the due line the schedule tops out at 250 × 2 = 500 slots, while the wave's
    // slot total (`monsterWaveTotal`, the lanes) stays 750 → `megaPantsDue` waits forever
    const W = pantsWindowTicks(31);
    expect(monstersDueBy(W + 1000, 2, 250 * 2, W)).toBeLessThan(250 * 3);
    expect(monstersDueBy(W, 3, 250 * 3, W)).toBe(250 * 3);
  });
});
