/**
 * SPARK — S193 (`s193/mres-card`, owner R192-D1) — ⛔ DOES THE WAVE-26 MRES CARD REACH A MAGIC HIT?
 *
 * HIS: *"We'll do another one at level 26 … That's going to be the, the magic damage one."* The card is
 * the general option of the LAST draft (wave 26, `MRES_DRAFT_WAVE`). A pick raises the MAGIC-DEFENDED
 * pool `HP × (5 + MRES)` of every unit the seat spawns AFTER it by the draft's rule (+10 %, floored,
 * minimum 1 — `applyDraftPercent`), baked at birth into `Creature.mresFifths`. A magic hit then lands
 * `floor(A × HP×(5+DEF) / mresFifths)`.
 *
 * ⚠ MINE (reported): "+10 % MRES" read as +10 % of the number MRES feeds, exactly as an HP pick is +10 %
 * of the pool and an ATK pick +10 % of the strike — never "+1 MRES level".
 *
 * Arithmetic this file pins — an ORCS castle soldier (HP 1 / DEF 1 / MRES 1, so magic lands raw today):
 *   magic pool 1 × (5 + 1) = 6 → one pick → 6 + max(1, ⌊0.6⌋) = 7
 *   a Voltkin zap (ATK 3 / PEN 6) = 33 → lands ⌊33 × 6 / 7⌋ = 28 on a soldier born after the pick,
 *   33 on one born before it.
 */

import { describe, expect, it } from 'vitest';
import { CASTLE_ATTACK_RANGE, LAST_DRAFT_WAVE, PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../types.ts';
import { asCreatureId, creatureAttackFifths, makeCreature, type Creature, type CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { sweepDeferredDeaths } from './creatures/creatureLifecycle.ts';
import { damageEntity } from './damage.ts';
import {
  DRAFT_BUFF_PCT, MRES_DRAFT_WAVE, draftedMagicPoolFifths, generalPickForWave, isDraftWave, type DraftPick,
} from './draft.ts';
import { autoPickFor, draftOptionsFor, pickIsOffered } from './draftEvent.ts';
import { makeGameStateExtras } from './gameState.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { landedFifthsPools, magicDot, magicHitFifths, mresFor, RACE_MRES_LEVEL } from './magicResist.ts';
import type { RaceId } from './races.ts';
import { drainRacialSpawnQueue } from './racial/racialTick.ts';
import { mulberry32 } from './rng.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { applyDraftPercent, unitPoolFifths } from './stats.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0); // the drafting seat
const P1 = asPlayerId(1);
const SPAWNER = asSpawnerId(40);
const DEEP = 100_000;
/** Every race — the keys of the exhaustive MRES table, so a seventh race joins this file by itself. */
const RACE_IDS = Object.keys(RACE_MRES_LEVEL) as RaceId[];
/** The five picks a seat holds going into the wave-26 draft (the cycle's own options at 1/6/11/16/21). */
const FIVE: DraftPick[] = ['hp', 'def', 'atk', 'pen', 'hp'];

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function rig(w: World): { d: HostTickDeps; s: HostTickState } {
  return {
    d: {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(11)), controls: stubControls,
      botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
    } as unknown as HostTickDeps,
    s: makeHostTickState(w),
  };
}

/** A 1v1 in the FIGHT of wave 25, one tick from the BUILD edge that opens the wave-26 draft. */
function wave25(race: RaceId = 'orcs'): World {
  const w = makeWorld(0x193d);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0], raceId: race }, { seat: 1, color: PLAYER_COLORS[1], raceId: 'orcs' }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.creatures.clear();
  w.draft = null;
  w.waveNumber = LAST_DRAFT_WAVE - 1;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 2;
  for (const s of [P0, P1]) w.players.get(s)!.draftPicks = [...FIVE];
  return w;
}

function spawnSoldier(w: World, owner: PlayerId, at: { x: number; y: number }): CreatureId {
  const id = w.nextCreatureId as unknown as CreatureId;
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: 'raceUnit', ownerPlayerId: owner,
    pos: { ...at }, targetPos: { ...at }, sourceSpawnerId: SPAWNER,
  });
  if (!w.creatures.has(id)) throw new Error('fixture: the soldier did not spawn');
  return id;
}

/** Cross the wave-25 → wave-26 BUILD edge through the REAL host tick. */
function crossIntoWave26(w: World, r: { d: HostTickDeps; s: HostTickState }): void {
  for (let i = 0; i < 10 && w.waveNumber < LAST_DRAFT_WAVE; i++) runHostTick(w, r.d, r.s);
  expect(w.waveNumber).toBe(26);
  expect(w.matchPhase).toBe('BUILD');
  expect(w.draft?.waveNumber, 'the wave-26 draft opened on the real edge').toBe(26);
}

/**
 * The scenario: the soldier is born BEFORE or AFTER the seat's wave-26 pick (or the seat picks nothing
 * yet). Then an enemy Voltkin zaps it through the real host tick. Returns every drop off its pool.
 */
function zapsOnSoldier(when: 'before' | 'after' | 'nopick'): { drops: number[]; soldier: Creature } {
  const w = wave25();
  const r = rig(w);
  const at = { x: 960, y: 540 };
  for (const seat of [0, 1]) {
    const a = castleAnchor(seat, w.layout);
    expect(Math.hypot(a.x - at.x, a.y - at.y), 'fixture: out of every castle gun').toBeGreaterThan(CASTLE_ATTACK_RANGE + 100);
  }
  let id: CreatureId | null = when === 'before' ? spawnSoldier(w, P0, at) : null;
  crossIntoWave26(w, r);
  if (when !== 'nopick') {
    dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'mres' });
    expect(w.players.get(P0)!.draftPicks).toEqual([...FIVE, 'mres']);
  }
  if (id === null) id = spawnSoldier(w, P0, at);
  const soldier = w.creatures.get(id)!;
  soldier.ehp = DEEP;
  soldier.maxEhp = DEEP;
  soldier.stunnedUntilTick = w.tick + 1_000_000;
  // The board is fought on: a FIGHT long enough for the zaps, and a Voltkin of the enemy seat beside him.
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 100;
  const v = makeCreature(getCreatureConfig('voltkin'), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P1, pos: { x: at.x - 30, y: at.y },
    targetPos: { x: at.x - 30, y: at.y }, spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(901), clock: w,
  });
  w.creatures.set(v.id, v);
  const drops: number[] = [];
  let prev = soldier.ehp;
  for (let i = 0; i < 400 && drops.length < 3; i++) {
    runHostTick(w, r.d, r.s);
    const now = w.creatures.get(id)?.ehp;
    if (now === undefined) break;
    if (now < prev) drops.push(prev - now);
    prev = now;
  }
  return { drops, soldier };
}

describe('⛔ REACH — the wave-26 MRES card, through the real host tick', () => {
  it('the arithmetic: an orcs soldier’s magic pool is 6, one pick makes it 7, a 33 zap then lands 28', () => {
    expect(mresFor('raceUnit', 'orcs')).toBe(1);
    expect(unitPoolFifths(1, 1)).toBe(6);
    expect(draftedMagicPoolFifths(1, 1, ['mres'])).toBe(7);
    expect(creatureAttackFifths({ type: 'voltkin' })).toBe(33);
    expect(landedFifthsPools(33, 'magic', 6, 7, 0)).toBe(28);
    expect(magicHitFifths(33, 1, 1)).toBe(33);
  });

  it('⛔ a soldier born AFTER the pick takes the Voltkin’s 33 as 28', () => {
    const { drops, soldier } = zapsOnSoldier('after');
    expect(soldier.mresFifths).toBe(7);
    expect(drops.length, 'the Voltkin must land at least one zap').toBeGreaterThan(0);
    for (const d of drops) expect(d).toBe(28);
  });

  it('negative: a soldier born BEFORE the pick keeps what he was born with — 33 lands 33', () => {
    const { drops, soldier } = zapsOnSoldier('before');
    expect(soldier.mresFifths).toBeUndefined();
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) expect(d).toBe(33);
  });

  it('negative: a seat that has not picked at the wave-26 draft — 33 lands 33', () => {
    const { drops, soldier } = zapsOnSoldier('nopick');
    expect(soldier.mresFifths).toBeUndefined();
    for (const d of drops) expect(d).toBe(33);
  });

  it('⛔ a PHYSICAL hit is untouched by the pick — the card moves the magic bar only', () => {
    const w = wave25();
    const r = rig(w);
    crossIntoWave26(w, r);
    dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'mres' });
    const id = spawnSoldier(w, P0, { x: 500, y: 500 });
    const c = w.creatures.get(id)!;
    const before = c.ehp;
    damageEntity(w, { kind: 'creature', id }, 3, 'aura', null, 'physical');
    expect(before - c.ehp).toBe(3);
  });
});

describe('the OFFER — wave 26 and nowhere else', () => {
  it('wave 26 offers MRES; 1/6/11/16/21 still offer HP/DEF/ATK/PEN/HP', () => {
    expect(MRES_DRAFT_WAVE).toBe(26);
    expect(isDraftWave(26)).toBe(true);
    for (const race of RACE_IDS) {
      expect(draftOptionsFor(26, race, FIVE).general).toBe('mres');
      expect([1, 6, 11, 16, 21].map((wv) => draftOptionsFor(wv, race).general)).toEqual(['hp', 'def', 'atk', 'pen', 'hp']);
    }
  });

  it('⛔ `pickIsOffered`: MRES only at 26; DEF (the cycle’s old slot-5 axis) is NOT offered there', () => {
    const w = wave25();
    for (const wv of [1, 6, 11, 16, 21]) expect(pickIsOffered(w, P0, wv, 'mres'), `wave ${wv}`).toBe(false);
    expect(pickIsOffered(w, P0, 26, 'mres')).toBe(true);
    expect(pickIsOffered(w, P0, 26, 'def')).toBe(false);
  });

  it('⛔ a modified client cannot take MRES at an earlier draft — the intent is refused', () => {
    const w = wave25();
    w.waveNumber = 21;
    w.players.get(P0)!.draftPicks = ['hp', 'def', 'atk', 'pen'];
    w.draft = { openedAtTick: w.tick, waveNumber: 21 };
    dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'mres' });
    expect(w.players.get(P0)!.draftPicks).toEqual(['hp', 'def', 'atk', 'pen']);
    dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: generalPickForWave(21) });
    expect(w.players.get(P0)!.draftPicks).toEqual(['hp', 'def', 'atk', 'pen', 'hp']);
  });

  it('autoPick (every seat that does not choose, and every bot): MRES at 26, for every race — no racial is built there', () => {
    for (const race of RACE_IDS) {
      const w = wave25(race);
      expect(draftOptionsFor(26, race, FIVE).racial, race).toBeNull();
      expect(autoPickFor(w, P0, 26), race).toBe('mres');
    }
  });

  it('autoPick through the REAL deadline: a silent seat holds MRES once the wave-26 BUILD runs out', () => {
    const w = wave25();
    const r = rig(w);
    crossIntoWave26(w, r);
    const end = w.phaseEndsAtTick;
    for (let i = 0; i < 100_000 && w.draft !== null && w.tick <= end; i++) runHostTick(w, r.d, r.s);
    expect(w.draft).toBeNull();
    for (const s of [P0, P1]) expect(w.players.get(s)!.draftPicks).toEqual([...FIVE, 'mres']);
  });
});

describe('the FOUR SITES of Creature.mresFifths — factory, save/wire, hash, worker INIT', () => {
  const args = (owner: PlayerId = P0) => ({
    id: 1 as unknown as CreatureId, ownerPlayerId: owner, pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
    spawnedAtTick: 0,
  });

  it('FACTORY: baked only when an MRES pick is held, from the type’s HP and its MRES (the owner race for a soldier)', () => {
    const cfg = getCreatureConfig('raceUnit');
    for (const picks of [undefined, [], FIVE] as (DraftPick[] | undefined)[]) {
      expect('mresFifths' in makeCreature(cfg, { ...args(), draftPicks: picks, ownerRace: 'orcs' })).toBe(false);
    }
    // orcs MRES 1: 6 → 7 · demons MRES 4: 9 → 10 · zombies MRES 0: 5 → 6 (each the floor-at-one step)
    const picked = [...FIVE, 'mres'] as DraftPick[];
    const want: Record<RaceId, number> = {} as Record<RaceId, number>;
    for (const race of RACE_IDS) {
      want[race] = applyDraftPercent(unitPoolFifths(1, RACE_MRES_LEVEL[race]), 1, DRAFT_BUFF_PCT);
      expect(makeCreature(cfg, { ...args(), draftPicks: picked, ownerRace: race }).mresFifths, race).toBe(want[race]);
    }
    expect([want.orcs, want.demons, want.zombies]).toEqual([7, 10, 6]);
    // A type whose MRES is its own (a goblin) ignores the race; a boss uses its table value.
    const gob = getCreatureConfig('goblinMelee');
    expect(makeCreature(gob, { ...args(), draftPicks: ['mres'] }).mresFifths)
      .toBe(draftedMagicPoolFifths(gob.hp, gob.def, ['mres']));
    const boss: CreatureType = 't9BossDemons';
    const bc = getCreatureConfig(boss);
    expect(makeCreature(bc, { ...args(), draftPicks: ['mres'] }).mresFifths)
      .toBe(applyDraftPercent(unitPoolFifths(bc.hp, mresFor(boss, null)), 1, DRAFT_BUFF_PCT));
  });

  function pickedWorld(): { w: World; id: CreatureId } {
    const w = wave25();
    w.players.get(P0)!.draftPicks = [...FIVE, 'mres'];
    const id = spawnSoldier(w, P0, { x: 400, y: 400 });
    return { w, id };
  }

  it('HASH (contribution): the field moves the wide oracle, and two values hash differently', () => {
    const { w, id } = pickedWorld();
    const c = w.creatures.get(id)!;
    expect(c.mresFifths).toBe(7);
    const seven = hashWorldStateFull(w);
    c.mresFifths = 8;
    const eight = hashWorldStateFull(w);
    delete c.mresFifths;
    const absent = hashWorldStateFull(w);
    expect(eight).not.toBe(seven);
    expect(absent).not.toBe(seven);
    expect(absent).not.toBe(eight);
  });

  it('SAVE: survives snapshot → restore (the worker INIT and a host-migration successor)', () => {
    const { w, id } = pickedWorld();
    const dst = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), dst);
    expect(dst.creatures.get(id)!.mresFifths).toBe(7);
    expect(hashWorldStateFull(dst)).toBe(hashWorldStateFull(w));
  });

  it('WIRE: survives netSnapshot → applyNetSnapshot', () => {
    const { w, id } = pickedWorld();
    const dst = makeWorld(1);
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(w))), dst);
    expect(dst.creatures.get(id)!.mresFifths).toBe(7);
  });

  it('WIRE/SAVE: a bogus value is DROPPED, never trusted (it is a divisor)', () => {
    for (const bogus of [0, -7, 2.5, '7', null, Number.NaN]) {
      for (const which of ['net', 'save'] as const) {
        const { w, id } = pickedWorld();
        const snap = JSON.parse(JSON.stringify(which === 'net' ? netSnapshot(w) : snapshot(w)));
        snap.creatures.find((x: { id: number }) => x.id === (id as unknown as number)).mresFifths = bogus;
        const dst = makeWorld(1);
        if (which === 'net') applyNetSnapshot(snap, dst);
        else restore(snap, dst);
        expect(dst.creatures.get(id)!.mresFifths, `${which} ${String(bogus)}`).toBeUndefined();
      }
    }
  });

  it('negative: a board without an MRES pick carries no field — save and wire are byte-identical to before', () => {
    const w = wave25();
    spawnSoldier(w, P0, { x: 400, y: 400 });
    spawnSoldier(w, P1, { x: 500, y: 400 });
    expect(JSON.stringify(snapshot(w))).not.toContain('mresFifths');
    expect(JSON.stringify(netSnapshot(w))).not.toContain('mresFifths');
  });
});

describe('HELLSPAWN — a split chewer keeps its PARENT’s magic bar', () => {
  it('a demons chewer born after the pick passes its mresFifths to both children', () => {
    const w = wave25('demons');
    w.players.get(P0)!.draftPicks = ['racial', 'racial', 'atk', 'pen', 'hp', 'mres']; // demons.l5 held
    const id = w.nextCreatureId as unknown as CreatureId;
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: P0,
      pos: { x: 400, y: 400 }, targetPos: { x: 400, y: 400 }, sourceSpawnerId: SPAWNER,
    });
    const parent = w.creatures.get(id)!;
    const ch = getCreatureConfig('chewer');
    expect(parent.mresFifths).toBe(draftedMagicPoolFifths(ch.hp, ch.def, ['mres']));
    w.pendingCreatureDeaths = new Set();
    damageEntity(w, { kind: 'creature', id }, 999, 'aura', null, 'physical');
    sweepDeferredDeaths(w, w.pendingCreatureDeaths);
    w.pendingCreatureDeaths = null;
    drainRacialSpawnQueue(w);
    const kids = [...w.creatures.values()].filter((k) => k.type === 'chewer' && k.hellspawnGen === 1);
    expect(kids).toHaveLength(2);
    for (const k of kids) expect(k.mresFifths).toBe(parent.mresFifths);
  });
});

describe('a magic DoT beat on a picked soldier — RESIST becomes possible at MRES = DEF', () => {
  it('one fifth a beat, ratio 6/7: exact on average, and some beats land 0', () => {
    const beats = Array.from({ length: 70 }, (_, b) => landedFifthsPools(1, magicDot(b), 6, 7, 0));
    expect(beats.reduce((s, x) => s + x, 0)).toBe(60);
    expect(beats.filter((x) => x === 0)).toHaveLength(10);
  });
});
