/**
 * SPARK — S188 — THE RISEN (`zombies.l0`): the arithmetic, the negatives, and the REACH through the
 * real host tick. The host-vs-worker proof lives in `racialB.differential.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { phaseDurationTicks } from '../../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../../types.ts';
import type { CreatureType } from '../creatures/creature.ts';
import { sweepDeferredDeaths } from '../creatures/creatureLifecycle.ts';
import { damageEntity } from '../damage.ts';
import type { DraftPick } from '../draft.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { castleEmitsOnTick, castleSpawnerId } from '../raceUnitEmit.ts';
import type { RaceId } from '../races.ts';
import { mulberry32 } from '../rng.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { drainRacialSpawnQueue, pendingRacialSpawns } from './racialTick.ts';
import { isZombieRacialType } from './theRisen.ts';

const P0 = asPlayerId(0); // the zombie seat
const P1 = asPlayerId(1); // the enemy

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function fightWorld(race: RaceId = 'zombies', picks: DraftPick[] = ['racial']): World {
  const w = makeWorld(0x5188);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.players.get(P0)!.raceId = race;
  w.players.get(P0)!.draftPicks = [...picks];
  w.players.get(P1)!.raceId = 'vampires';
  return w;
}

/** Spawn through the real reducer, with a non-null spawner id so the null-spawner latch cannot eat it. */
function spawnAt(w: World, owner: PlayerId, type: CreatureType, x: number, y: number): CreatureId {
  const id = w.nextCreatureId as unknown as CreatureId;
  dispatch(w, {
    type: 'SPAWN_CREATURE',
    creatureType: type,
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: type === 'raceUnit' ? castleSpawnerId(owner as unknown as number) : asSpawnerId(40 + Number(owner)),
  });
  if (!w.creatures.has(id)) throw new Error(`fixture: ${type} did not spawn`);
  return id;
}

/** P0's race units, as ids. */
function zombiesOf(w: World): CreatureId[] {
  return [...w.creatures.values()]
    .filter((c) => c.type === 'raceUnit' && c.ownerPlayerId === P0)
    .map((c) => c.id);
}

/**
 * One strike batch by hand: open the deferral, land the blows through the ONE damage funnel, then
 * sweep and drain in `runHostTick`'s order. Used for the arithmetic and the negatives; the REACH
 * test below goes through `runHostTick` itself.
 */
function strike(w: World, blows: ReadonlyArray<{ by: CreatureId; on: CreatureId; amount: number }>): void {
  w.pendingCreatureDeaths = new Set();
  for (const b of blows) {
    damageEntity(w, { kind: 'creature', id: b.on }, b.amount, 'creature', { kind: 'creature', id: b.by });
  }
  sweepDeferredDeaths(w, w.pendingCreatureDeaths);
  w.pendingCreatureDeaths = null;
  drainRacialSpawnQueue(w);
}

describe('THE RISEN — who counts as a zombie killer (his words, by type)', () => {
  it('the three zombie RACIAL types count: the castle soldier, the hound, the boss', () => {
    expect(isZombieRacialType('raceUnit')).toBe(true);
    expect(isZombieRacialType('t3Hound')).toBe(true);
    expect(isZombieRacialType('t9BossZombies')).toBe(true);
  });

  it('⛔ "so not like Voltkin or Helga or Pencil Chewers" — nothing global counts', () => {
    for (const t of ['voltkin', 'chewer', 'goblinMelee', 'goblinArcher', 'lightningDrone', 'direwolf'] as const) {
      expect(isZombieRacialType(t), t).toBe(false);
    }
    // …and neither does ANOTHER race's racial unit.
    expect(isZombieRacialType('t3Bat')).toBe(false);
    expect(isZombieRacialType('t9BossVampires')).toBe(false);
  });
});

describe('THE RISEN — one kill, one zombie, at the castle', () => {
  it('a zombie soldier kills an enemy: ONE new 1/1/1/1 zombie at the zombie seat’s keep', () => {
    const w = fightWorld();
    const killer = spawnAt(w, P0, 'raceUnit', 960, 500);
    const victim = spawnAt(w, P1, 'chewer', 970, 500);
    const before = zombiesOf(w);

    strike(w, [{ by: killer, on: victim, amount: 999 }]);

    expect(w.creatures.has(victim)).toBe(false);
    const born = zombiesOf(w).filter((id) => !before.includes(id));
    expect(born).toHaveLength(1);
    const z = w.creatures.get(born[0]!)!;
    const anchor = castleAnchor(0, w.layout);
    expect(Math.hypot(z.pos.x - anchor.x, z.pos.y - anchor.y)).toBeLessThanOrEqual(46 + 1e-6);
    expect(z.sourceSpawnerId).toBe(castleSpawnerId(0)); // the castle's own spawn path
    expect(z.ehp).toBe(6); // R125's 1/1/1/1 — pool 6 fifths
    expect(pendingRacialSpawns(w)).toBe(0);
  });

  it('the hound and the boss raise zombies too', () => {
    for (const t of ['t3Hound', 't9BossZombies'] as const) {
      const w = fightWorld();
      const killer = spawnAt(w, P0, t, 960, 500);
      const victim = spawnAt(w, P1, 'chewer', 970, 500);
      const before = zombiesOf(w).length;
      strike(w, [{ by: killer, on: victim, amount: 999 }]);
      expect(zombiesOf(w).length, t).toBe(before + 1);
    }
  });

  it('⛔ TWO lethal blows on ONE corpse in one tick raise ONE zombie, not two', () => {
    const w = fightWorld();
    const a = spawnAt(w, P0, 'raceUnit', 960, 500);
    const b = spawnAt(w, P0, 't3Hound', 950, 500);
    const victim = spawnAt(w, P1, 'chewer', 970, 500);
    const before = zombiesOf(w).length;
    strike(w, [
      { by: a, on: victim, amount: 999 },
      { by: b, on: victim, amount: 999 }, // the corpse-in-waiting is still in the map
    ]);
    expect(zombiesOf(w).length).toBe(before + 1);
  });

  it('two DIFFERENT kills in one tick raise two', () => {
    const w = fightWorld();
    const a = spawnAt(w, P0, 'raceUnit', 960, 500);
    const v1 = spawnAt(w, P1, 'chewer', 970, 500);
    const v2 = spawnAt(w, P1, 'chewer', 975, 500);
    const before = zombiesOf(w).length;
    strike(w, [{ by: a, on: v1, amount: 999 }, { by: a, on: v2, amount: 999 }]);
    expect(zombiesOf(w).length).toBe(before + 2);
  });

  it('A5 — the zombie is QUEUED during the batch and born only after the sweep', () => {
    const w = fightWorld();
    const killer = spawnAt(w, P0, 'raceUnit', 960, 500);
    const victim = spawnAt(w, P1, 'chewer', 970, 500);
    const before = w.creatures.size;
    w.pendingCreatureDeaths = new Set();
    damageEntity(w, { kind: 'creature', id: victim }, 999, 'creature', { kind: 'creature', id: killer });
    // Inside the batch: nothing inserted, one job waiting, the corpse still in the map.
    expect(w.creatures.size).toBe(before);
    expect(pendingRacialSpawns(w)).toBe(1);
    sweepDeferredDeaths(w, w.pendingCreatureDeaths);
    w.pendingCreatureDeaths = null;
    drainRacialSpawnQueue(w);
    expect(w.creatures.size).toBe(before); // one died, one rose
    expect(pendingRacialSpawns(w)).toBe(0);
  });
});

describe('THE RISEN — negatives: every one of these raises NOBODY', () => {
  const noZombie = (w: World, killerType: CreatureType, victimOwner: PlayerId = P1): void => {
    const killer = spawnAt(w, P0, killerType, 960, 500);
    const victim = spawnAt(w, victimOwner, 'chewer', 970, 500);
    const before = zombiesOf(w).length;
    strike(w, [{ by: killer, on: victim, amount: 999 }]);
    expect(w.creatures.has(victim), 'the kill itself still happens').toBe(false);
    expect(zombiesOf(w).length).toBe(before);
  };

  it('an OWN-side victim (a zombie seat killing its own unit is not an enemy kill)', () => {
    noZombie(fightWorld(), 'raceUnit', P0);
  });

  it('a zombie seat WITHOUT the perk (took the general option)', () => {
    noZombie(fightWorld('zombies', ['hp']), 'raceUnit');
  });

  it('a seat of ANOTHER race that took ITS racial pick', () => {
    noZombie(fightWorld('vampires', ['racial']), 'raceUnit');
  });

  it('⛔ a Voltkin, a pencil chewer or a goblin OWNED BY the zombie seat', () => {
    for (const t of ['voltkin', 'chewer', 'goblinMelee'] as const) noZombie(fightWorld(), t);
  });

  it('a kill with nobody to credit (the castle gun, a raid, area damage all pass null)', () => {
    const w = fightWorld();
    const victim = spawnAt(w, P1, 'chewer', 970, 500);
    const before = zombiesOf(w).length;
    w.pendingCreatureDeaths = new Set();
    damageEntity(w, { kind: 'creature', id: victim }, 999, 'aura', null);
    sweepDeferredDeaths(w, w.pendingCreatureDeaths);
    w.pendingCreatureDeaths = null;
    drainRacialSpawnQueue(w);
    expect(w.creatures.has(victim)).toBe(false);
    expect(zombiesOf(w).length).toBe(before);
  });

  it('a non-lethal hit', () => {
    const w = fightWorld();
    const killer = spawnAt(w, P0, 'raceUnit', 960, 500);
    const victim = spawnAt(w, P1, 't9BossVampires', 970, 500);
    const before = zombiesOf(w).length;
    strike(w, [{ by: killer, on: victim, amount: 6 }]);
    expect(w.creatures.has(victim)).toBe(true);
    expect(zombiesOf(w).length).toBe(before);
  });

  it('⚠ MINE — a fallen castle raises nobody (the emitter’s own rule)', () => {
    const w = fightWorld();
    w.players.get(P0)!.castleHp = 0;
    const killer = spawnAt(w, P0, 'raceUnit', 960, 500);
    const victim = spawnAt(w, P1, 'chewer', 970, 500);
    const before = zombiesOf(w).length;
    strike(w, [{ by: killer, on: victim, amount: 999 }]);
    expect(w.creatures.has(victim)).toBe(false);
    expect(zombiesOf(w).length).toBe(before);
  });
});

describe('THE RISEN — REACH: it happens in a real host tick, not only when the helper is called', () => {
  /**
   * A zombie soldier and an enemy pencil chewer, 10 px apart in mid-board, run through `runHostTick`
   * until the chewer is gone. The AI picks the target, the FSM winds up, the strike lands through
   * `applyCreatureAttack` → `damageEntity` → `damageCreature`, the sweep removes the corpse and the
   * drain raises the zombie — nothing here is called by hand.
   */
  function runUntilVictimDies(w: World, victim: CreatureId): number {
    const deps = hostDeps();
    const state = makeHostTickState(w);
    for (let i = 0; i < 900; i++) {
      runHostTick(w, deps, state);
      if (!w.creatures.has(victim)) return w.tick;
    }
    throw new Error('fixture: the zombie never killed the chewer in 900 ticks');
  }

  it('with the perk: the kill tick raises exactly one zombie at the keep', () => {
    const w = fightWorld();
    spawnAt(w, P0, 'raceUnit', 960, 540);
    const victim = spawnAt(w, P1, 'chewer', 970, 540);
    let before = zombiesOf(w);
    const deps = hostDeps();
    const state = makeHostTickState(w);
    let killTick = -1;
    for (let i = 0; i < 900 && killTick < 0; i++) {
      before = zombiesOf(w);
      runHostTick(w, deps, state);
      if (!w.creatures.has(victim)) killTick = w.tick;
    }
    expect(killTick, 'the zombie must actually kill the chewer').toBeGreaterThan(0);
    expect(castleEmitsOnTick(0, killTick), 'fixture: the cadence must not also fire on this tick').toBe(false);
    const born = zombiesOf(w).filter((id) => !before.includes(id));
    expect(born).toHaveLength(1);
    const z = w.creatures.get(born[0]!)!;
    expect(z.spawnedAtTick).toBe(killTick);
    const anchor = castleAnchor(0, w.layout);
    expect(Math.hypot(z.pos.x - anchor.x, z.pos.y - anchor.y)).toBeLessThanOrEqual(46 + 1e-6);
  });

  it('without the perk: the same fight raises nobody', () => {
    const w = fightWorld('zombies', ['hp']);
    spawnAt(w, P0, 'raceUnit', 960, 540);
    const victim = spawnAt(w, P1, 'chewer', 970, 540);
    const before = zombiesOf(w).length;
    const killTick = runUntilVictimDies(w, victim);
    expect(castleEmitsOnTick(0, killTick)).toBe(false);
    expect(zombiesOf(w).length).toBe(before);
  });
});
