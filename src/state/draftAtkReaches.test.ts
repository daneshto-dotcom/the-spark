/**
 * SPARK — S190 (s188/draft-atk) — ⛔ DOES A DRAFTED ATK / PEN PICK REACH A CREATURE'S STRIKE?
 *
 * The S187 draft offers STRONGER (wave 11) and PIERCING (wave 16): *"Every unit you spawn from now on
 * hits 10% harder."* `draftedAttackFifths` computes that number and has NO production consumer, so
 * every strike site keeps reading the TYPE's `attackFifths(cfg.atk, cfg.pen)`.
 *
 * `draftBuffReaches.test.ts` proves the POOL half reaches a spawned unit — through the spawn reducer
 * only. Nothing ever measured the DAMAGE half at a strike, which is how two of the four general picks
 * shipped as blank cards with every gate green.
 *
 * So this drives the REAL host tick: a drafted seat's creature walks to an enemy and strikes it, and
 * the test reads the number that came off the victim's pool. Phase 1 of the brief: this file is
 * written to be RED on master and green once the fix lands.
 */

import { describe, expect, it } from 'vitest';
import { CASTLE_ATTACK_RANGE, RACE_UNIT_ATK, RACE_UNIT_PEN, phaseDurationTicks } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { characterSheetModel } from '../render/characterSheetModel.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../types.ts';
import { creatureAttackFifths, creatureMaxEhp, makeCreature, type CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { sweepDeferredDeaths } from './creatures/creatureLifecycle.ts';
import { damageEntity } from './damage.ts';
import { draftedAttackFifths, draftedPoolFifths, type DraftPick } from './draft.ts';
import { makeGameStateExtras } from './gameState.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import type { RaceId } from './races.ts';
import { drainRacialSpawnQueue } from './racial/racialTick.ts';
import { mulberry32 } from './rng.ts';
import { attackFifths } from './stats.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0); // the drafting seat
const P1 = asPlayerId(1);
const PENTAGRAM = asSpawnerId(40);

/** The realistic ATK draft: HP (wave 1) → DEF (wave 6) → ATK (wave 11). One damage pick, two pool picks. */
const THREE_DRAFTS: DraftPick[] = ['hp', 'def', 'atk'];

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function fightWorld(picks: DraftPick[], race: RaceId = 'orcs'): World {
  const w = makeWorld(0x5190);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.players.get(P0)!.raceId = race;
  w.players.get(P0)!.draftPicks = [...picks];
  w.players.get(P1)!.raceId = 'zombies';
  w.players.get(P1)!.draftPicks = [];
  return w;
}

function spawnAt(w: World, owner: PlayerId, type: CreatureType, x: number, y: number): CreatureId {
  const id = w.nextCreatureId as unknown as CreatureId;
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: PENTAGRAM,
  });
  if (!w.creatures.has(id)) throw new Error(`fixture: ${type} did not spawn`);
  return id;
}

/**
 * A drafted-or-not race unit and a STUNNED enemy punching bag with a deep pool, mid-board, far from
 * both keeps. Returns every positive drop in the bag's pool over the run — each one is one landed
 * strike, and nothing else in range can hit it.
 */
function landedStrikes(picks: DraftPick[]): number[] {
  const w = fightWorld(picks);
  const at = { x: 960, y: 540 };
  for (const seat of [0, 1]) {
    const a = castleAnchor(seat, w.layout);
    // Fixture guard: the bag must be out of every castle gun's reach, or the castle's 40 pollutes it.
    expect(Math.hypot(a.x - at.x, a.y - at.y)).toBeGreaterThan(CASTLE_ATTACK_RANGE + 100);
  }
  const attacker = spawnAt(w, P0, 'raceUnit', at.x - 20, at.y);
  const bag = spawnAt(w, P1, 'raceUnit', at.x + 20, at.y);
  const b = w.creatures.get(bag)!;
  b.maxEhp = 10_000;
  b.ehp = 10_000;
  b.stunnedUntilTick = w.tick + 1_000_000; // it cannot swing back, so the attacker lives and keeps striking
  const deps = hostDeps();
  const state = makeHostTickState(w);
  const drops: number[] = [];
  let prev = b.ehp;
  for (let i = 0; i < 900 && drops.length < 3; i++) {
    runHostTick(w, deps, state);
    const now = w.creatures.get(bag)?.ehp;
    if (now === undefined) break;
    if (now < prev) drops.push(prev - now);
    prev = now;
  }
  expect(w.creatures.has(attacker), 'the attacker must still be alive to have struck').toBe(true);
  return drops;
}

describe('⛔ REACH — a drafted ATK pick lands on the enemy, through the real host tick', () => {
  it('the arithmetic this file expects: a race unit strikes 6, and one ATK pick makes it 7', () => {
    expect(attackFifths(RACE_UNIT_ATK, RACE_UNIT_PEN)).toBe(6);
    expect(draftedAttackFifths(RACE_UNIT_ATK, RACE_UNIT_PEN, THREE_DRAFTS)).toBe(7);
  });

  it('⛔ a seat that drafted HP → DEF → ATK strikes for 7, not 6', () => {
    const drops = landedStrikes(THREE_DRAFTS);
    expect(drops.length, 'the drafted unit must land at least one strike').toBeGreaterThan(0);
    for (const d of drops) expect(d).toBe(draftedAttackFifths(RACE_UNIT_ATK, RACE_UNIT_PEN, THREE_DRAFTS));
  });

  it('negative: a seat that drafted NOTHING strikes for exactly the type’s 6', () => {
    const drops = landedStrikes([]);
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) expect(d).toBe(attackFifths(RACE_UNIT_ATK, RACE_UNIT_PEN));
  });
});

describe('⛔ THE CARD — the derived numbers are the creature’s, not its type’s', () => {
  const rowsOf = (w: World, id: CreatureId) => {
    const view = characterSheetModel(w, P0, { kind: 'creature', id });
    if (view === null) throw new Error('fixture: no card');
    const atk = view.stats.find((r) => r.label === 'ATK')?.derived;
    const hp = view.stats.find((r) => r.label === 'HP')?.derived;
    return { atk, hp, barMax: view.health.max };
  };

  it('⛔ a drafted race unit’s card prints the strike and pool it actually has (7 / 8)', () => {
    const w = fightWorld(THREE_DRAFTS);
    const id = spawnAt(w, P0, 'raceUnit', 400, 400);
    const c = w.creatures.get(id)!;
    expect(creatureMaxEhp(c)).toBe(draftedPoolFifths(1, 1, THREE_DRAFTS)); // the S187 half DID land: 8
    const r = rowsOf(w, id);
    expect(r.barMax).toBe(8);
    expect.soft(r.hp).toBe(`${creatureMaxEhp(c)} pool`);
    expect.soft(r.atk).toBe(`${draftedAttackFifths(RACE_UNIT_ATK, RACE_UNIT_PEN, THREE_DRAFTS)} a swing`);
  });

  it('⛔ a HELLSPAWN generation-1 child’s card prints 3 / 2 — what the sim deals and holds — not 7 / 5', () => {
    // demons.l5 is the racial pick at draft index 1 (wave 6). Index 0 is ALSO racial, so no pool pick
    // buffs the parent — which is the owner's report exactly: parent 7 / 5, child 3 / 2. (With 'hp' at
    // index 0 the parent's pool is 6 and the child holds 3; the card is wrong the same way.)
    const w = fightWorld(['racial', 'racial'], 'demons');
    const parent = spawnAt(w, P0, 'chewer', 400, 400);
    // One lethal blow in runHostTick's batch order: open, strike, sweep, drain.
    w.pendingCreatureDeaths = new Set();
    damageEntity(w, { kind: 'creature', id: parent }, 999, 'aura', null);
    sweepDeferredDeaths(w, w.pendingCreatureDeaths);
    w.pendingCreatureDeaths = null;
    drainRacialSpawnQueue(w);
    const kids = [...w.creatures.values()].filter((k) => k.type === 'chewer' && k.hellspawnGen === 1);
    expect(kids).toHaveLength(2);
    const r = rowsOf(w, kids[0]!.id);
    expect(creatureMaxEhp(kids[0]!)).toBe(2); // the sim holds 2 …
    expect(r.barMax).toBe(2); // … and the health bar already says so
    expect.soft(r.hp).toBe('2 pool'); // master prints the TYPE's "5 pool"
    expect.soft(r.atk).toBe('3 a swing'); // master prints the TYPE's "7 a swing"
  });
});

describe('the FOUR SITES of Creature.atkFifths — factory, save/wire, hash, worker INIT', () => {
  const PEN_TOO: DraftPick[] = ['hp', 'def', 'atk', 'pen']; // both damage picks: 6 → 7 → 8

  it('FACTORY: baked only when a damage pick moved it; the accessor reads it, else the type', () => {
    const cfg = getCreatureConfig('raceUnit');
    const base = attackFifths(cfg.atk, cfg.pen);
    const args = {
      id: 1 as unknown as CreatureId, ownerPlayerId: P0, pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
      spawnedAtTick: 0,
    };
    const none = makeCreature(cfg, { ...args });
    const empty = makeCreature(cfg, { ...args, draftPicks: [] });
    const poolOnly = makeCreature(cfg, { ...args, draftPicks: ['hp', 'def'] });
    const one = makeCreature(cfg, { ...args, draftPicks: THREE_DRAFTS });
    const two = makeCreature(cfg, { ...args, draftPicks: PEN_TOO });
    for (const c of [none, empty, poolOnly]) {
      expect('atkFifths' in c).toBe(false);
      expect(creatureAttackFifths(c)).toBe(base);
    }
    expect(one.atkFifths).toBe(draftedAttackFifths(cfg.atk, cfg.pen, THREE_DRAFTS));
    expect(two.atkFifths).toBe(draftedAttackFifths(cfg.atk, cfg.pen, PEN_TOO));
    expect([base, one.atkFifths, two.atkFifths]).toEqual([6, 7, 8]);
    expect(creatureAttackFifths(two)).toBe(8);
    // ⚠ a PEN pick and an ATK pick move the SAME number — the ladder has only two derived values
    // (`draft.ts` isPoolPick / isDamagePick), so ['pen'] alone is 7 exactly as ['atk'] is.
    expect(makeCreature(cfg, { ...args, draftPicks: ['pen'] }).atkFifths).toBe(7);
  });

  it('HASH (contribution): the field moves the wide oracle, and two values hash differently', () => {
    const w = fightWorld(THREE_DRAFTS);
    const id = spawnAt(w, P0, 'raceUnit', 400, 400);
    const c = w.creatures.get(id)!;
    expect(c.atkFifths).toBe(7);
    const seven = hashWorldStateFull(w);
    c.atkFifths = 8;
    const eight = hashWorldStateFull(w);
    delete c.atkFifths;
    const absent = hashWorldStateFull(w);
    expect(eight).not.toBe(seven);
    expect(absent).not.toBe(seven);
    expect(absent).not.toBe(eight);
  });

  it('SAVE: survives snapshot → restore (the worker INIT and a host-migration successor)', () => {
    const w = fightWorld(PEN_TOO);
    const id = spawnAt(w, P0, 'raceUnit', 400, 400);
    const dst = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), dst);
    expect(dst.creatures.get(id)!.atkFifths).toBe(8);
    expect(creatureAttackFifths(dst.creatures.get(id)!)).toBe(8);
    expect(hashWorldStateFull(dst)).toBe(hashWorldStateFull(w));
  });

  it('WIRE: survives netSnapshot → applyNetSnapshot — the mirror trim does not strip it', () => {
    const w = fightWorld(THREE_DRAFTS);
    const id = spawnAt(w, P0, 'raceUnit', 400, 400);
    const dst = makeWorld(1);
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(w))), dst);
    expect(dst.creatures.get(id)!.atkFifths).toBe(7);
  });

  it('WIRE: a bogus value is DROPPED, never trusted — it reads as the type’s own strike', () => {
    for (const bogus of [0, -7, 2.5, '7', null, Number.NaN]) {
      const w = fightWorld(THREE_DRAFTS);
      const id = spawnAt(w, P0, 'raceUnit', 400, 400);
      for (const which of ['net', 'save'] as const) {
        const snap = JSON.parse(JSON.stringify(which === 'net' ? netSnapshot(w) : snapshot(w)));
        snap.creatures.find((x: { id: number }) => x.id === (id as unknown as number)).atkFifths = bogus;
        const dst = makeWorld(1);
        if (which === 'net') applyNetSnapshot(snap, dst);
        else restore(snap, dst);
        const c = dst.creatures.get(id)!;
        expect(c.atkFifths, `${which} ${String(bogus)}`).toBeUndefined();
        expect(creatureAttackFifths(c)).toBe(6);
      }
    }
  });

  it('negative: an undrafted board carries no field — save and wire are byte-identical to before', () => {
    const w = fightWorld([]);
    spawnAt(w, P0, 'raceUnit', 400, 400);
    spawnAt(w, P1, 'chewer', 500, 400);
    // A pool-only seat too: S187's field rides, this one does not.
    w.players.get(P1)!.draftPicks = ['hp', 'def'];
    spawnAt(w, P1, 'raceUnit', 600, 400);
    expect(JSON.stringify(snapshot(w))).not.toContain('atkFifths');
    expect(JSON.stringify(netSnapshot(w))).not.toContain('atkFifths');
    for (const c of w.creatures.values()) expect('atkFifths' in c).toBe(false);
  });
});

describe('⛔ HELLSPAWN — a split chewer’s strike is a share of its PARENT’s, never the seat’s current picks', () => {
  /** One lethal blow on `id` in runHostTick's batch order; returns the generation-`gen` children. */
  const split = (w: World, id: CreatureId, gen: 1 | 2) => {
    w.pendingCreatureDeaths = new Set();
    damageEntity(w, { kind: 'creature', id }, 999, 'aura', null);
    sweepDeferredDeaths(w, w.pendingCreatureDeaths);
    w.pendingCreatureDeaths = null;
    drainRacialSpawnQueue(w);
    return [...w.creatures.values()].filter((k) => k.type === 'chewer' && k.hellspawnGen === gen);
  };
  /** What a chewer actually banks on an enemy connector, through the real strike reducer. */
  const bankedOnAConnector = (w: World, chewerId: CreatureId): number => {
    const c = w.creatures.get(chewerId)!;
    const mk = (id: number, x: number) => {
      const p = {
        id: id as never, type: 0 as never, placerColor: 0, placedBy: P1, createdTick: 0, pos: { x, y: 0 },
        prevPos: { x, y: 0 }, bonds: new Set(), ownerColor: 0, lastOwnershipChange: 0, radius: 8,
        hp: 70, origin: null,
      };
      w.primitives.set(p.id, p as never);
      return p;
    };
    const ps = [mk(9001, 0), mk(9002, 40), mk(9003, 80), mk(9004, 120)];
    const bonds = [0, 1, 2].map((i) => {
      const b = {
        id: (9100 + i) as never, aId: ps[i]!.id, bId: ps[i + 1]!.id, a: ps[i], b: ps[i + 1],
        restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
      };
      w.bonds.set(b.id, b as never);
      ps[i]!.bonds.add(b.id);
      ps[i + 1]!.bonds.add(b.id);
      return b;
    });
    c.pos = { x: 20, y: 10 };
    c.state = 'ATTACKING';
    c.targetBondId = bonds[0]!.id;
    dispatch(w, { type: 'CREATURE_ATTACK', creatureId: c.id, bondId: bonds[0]!.id, targetCreatureId: null });
    return w.bonds.get(bonds[0]!.id)?.damageFifths ?? -1; // a 3-connector pool is 24: nothing here cuts it
  };

  it('⛔ born BEFORE the ATK pick: the children strike ⌊7 / 2⌋ = 3, not ⌊8 / 2⌋ = 4', () => {
    const w = fightWorld(['racial', 'racial'], 'demons'); // demons.l5 held, no damage pick yet
    const parent = spawnAt(w, P0, 'chewer', 400, 400);
    expect(w.creatures.get(parent)!.atkFifths).toBeUndefined(); // born unbuffed: 7
    w.players.get(P0)!.draftPicks.push('atk'); // wave 11 — "from now on"
    const kids = split(w, parent, 1);
    expect(kids).toHaveLength(2);
    for (const k of kids) {
      expect(k.atkFifths, 'the child carries its PARENT’s (absent) strike').toBeUndefined();
      expect(creatureAttackFifths(k)).toBe(7);
    }
    expect(bankedOnAConnector(w, kids[0]!.id)).toBe(3);
  });

  it('born AFTER the ATK pick: the parent strikes 8, its children ⌊8 / 2⌋ = 4, its grandchildren ⌊8 / 4⌋ = 2', () => {
    const w = fightWorld(['racial', 'racial', 'atk'], 'demons');
    const parent = spawnAt(w, P0, 'chewer', 400, 400);
    expect(w.creatures.get(parent)!.atkFifths).toBe(8);
    const kids = split(w, parent, 1);
    for (const k of kids) expect(k.atkFifths).toBe(8);
    expect(bankedOnAConnector(w, kids[0]!.id)).toBe(4);
    const grandkids = split(w, kids[1]!.id, 2);
    expect(grandkids).toHaveLength(2);
    for (const g of grandkids) expect(g.atkFifths).toBe(8);
    expect(bankedOnAConnector(w, grandkids[0]!.id)).toBe(2);
  });

  it('negative: a parent born buffed, whose seat has since drafted AGAIN, still passes on ITS OWN 8', () => {
    const w = fightWorld(['racial', 'racial', 'atk'], 'demons');
    const parent = spawnAt(w, P0, 'chewer', 400, 400);
    w.players.get(P0)!.draftPicks.push('pen'); // the seat now bakes 9 for anything newly born
    const kids = split(w, parent, 1);
    for (const k of kids) expect(k.atkFifths).toBe(8);
  });
});

describe('⛔ "Units already on the board keep what they were born with" — the strike too', () => {
  it('a unit born BEFORE the ATK pick still strikes for 6 after it, through the real host tick', () => {
    const w = fightWorld(['hp', 'def']);
    const at = { x: 960, y: 540 };
    spawnAt(w, P0, 'raceUnit', at.x - 20, at.y);
    const bag = spawnAt(w, P1, 'raceUnit', at.x + 20, at.y);
    const b = w.creatures.get(bag)!;
    b.maxEhp = 10_000;
    b.ehp = 10_000;
    b.stunnedUntilTick = w.tick + 1_000_000;
    w.players.get(P0)!.draftPicks.push('atk'); // drafted AFTER the unit was born
    const deps = hostDeps();
    const state = makeHostTickState(w);
    let prev = b.ehp;
    const drops: number[] = [];
    for (let i = 0; i < 900 && drops.length < 2; i++) {
      runHostTick(w, deps, state);
      const now = w.creatures.get(bag)!.ehp;
      if (now < prev) drops.push(prev - now);
      prev = now;
    }
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) expect(d).toBe(6);
  });
});
