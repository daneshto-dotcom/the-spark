/**
 * SPARK — S194 (T8, owner rulings A + B): THE RISEN on the PANTS and on HELGA.
 *
 * A — *"the pants unit killed by a zombie player racial unit, it should rise a free zombie, of course."*
 *     A pants is a CREATURE owned by `MONSTER_OWNER_SEAT` (255): an ENEMY of every seat, so the one
 *     death hook (`racialDeaths.onCreatureDeathDecided` → `riseOnKill`) already applies. Pinned here
 *     through the real host tick, so it cannot quietly stop applying.
 * B — *"should Helga dying raise a zombie? … Might as well. … it's just one zombie."* Helga is a
 *     DEFENDER, not a creature, so she never reached `riseOnKill`: her death is the `'defender'` arm of
 *     `damageEntity` (she goes DORMANT). S194 adds `riseOnHelgaKill` there — the same guards, ONE
 *     soldier per death (the arm runs only on the blow that takes her pool to 0; she is then `ehp: null`
 *     and immune until her hall re-summons her, which is a new life).
 *
 * Both: the killer must be a zombie seat's RACIAL unit (`isZombieRacialType`), the seat must hold
 * `zombies.l0`, and the zombie is ONE castle soldier at the killer's keep.
 */
import { describe, expect, it } from 'vitest';
import { MONSTER_OWNER_SEAT, PRIMITIVE_MAX_HP, SparkType, phaseDurationTicks } from '../../constants.ts';
import type { Primitive } from '../../game/primitive.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import type { Controls } from '../../input/controls.ts';
import { asDefenderId, asPlayerId, asPrimitiveId, asSpawnerId, type CreatureId, type PlayerId } from '../../types.ts';
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
import { makeDefender, type Defender } from '../defenders/defender.ts';
import { drainRacialSpawnQueue } from './racialTick.ts';

const P0 = asPlayerId(0); // the zombie seat
const P1 = asPlayerId(1); // the enemy (Helga's owner)
const MONSTER = asPlayerId(MONSTER_OWNER_SEAT);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function fightWorld(race: RaceId = 'zombies', picks: DraftPick[] = ['racial']): World {
  const w = makeWorld(0x5194);
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

function spawnAt(w: World, owner: PlayerId, type: CreatureType, x: number, y: number, extra: object = {}): CreatureId {
  const id = w.nextCreatureId as unknown as CreatureId;
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    sourceSpawnerId: type === 'raceUnit' ? castleSpawnerId(owner as unknown as number) : owner === MONSTER ? null : asSpawnerId(40 + Number(owner)),
    ...extra,
  } as never);
  if (!w.creatures.has(id)) throw new Error(`fixture: ${type} did not spawn`);
  return id;
}

const zombiesOf = (w: World): CreatureId[] =>
  [...w.creatures.values()].filter((c) => c.type === 'raceUnit' && c.ownerPlayerId === P0).map((c) => c.id);

/** Helga of `owner` at (x, y), on a real anchor shape of hers (a defender with no anchor is swept). */
function helga(w: World, owner: PlayerId, x: number, y: number): Defender {
  const pl = w.players.get(owner)!;
  const anchorId = asPrimitiveId(w.nextPrimitiveId++);
  w.primitives.set(anchorId, {
    id: anchorId, type: SparkType.Square, placerColor: pl.color, placedBy: owner, createdTick: w.tick,
    pos: { x: x + 30, y }, prevPos: { x: x + 30, y }, bonds: new Set(), ownerColor: pl.color,
    lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive);
  const d = makeDefender({
    id: asDefenderId(w.nextDefenderId++), kind: 'princess', ownerPlayerId: owner, anchorPrimitiveId: anchorId,
    recipeId: 'helga' as never, pos: { x, y }, registeredAtTick: w.tick,
  });
  w.defenders.set(d.id, d);
  return d;
}

/** Run the real host tick until `dead()`; return the zombies born on the kill tick. */
function runToKill(w: World, dead: () => boolean, cap = 1500): { killTick: number; born: CreatureId[] } {
  const deps = hostDeps();
  const st = makeHostTickState(w);
  for (let i = 0; i < cap; i++) {
    const before = zombiesOf(w);
    runHostTick(w, deps, st);
    if (dead()) {
      // The kill may land after the tick's drain (a defender death outside the strike batch): one more
      // tick drains it. Count what was born across both.
      const born1 = zombiesOf(w).filter((id) => !before.includes(id));
      const killTick = w.tick;
      runHostTick(w, deps, st);
      const born2 = zombiesOf(w).filter((id) => !before.includes(id) && !born1.includes(id));
      expect(castleEmitsOnTick(0, killTick) || castleEmitsOnTick(0, killTick + 1), 'fixture: the castle cadence must not also fire').toBe(false);
      return { killTick, born: [...born1, ...born2] };
    }
  }
  throw new Error('fixture: the kill never happened');
}

function nearKeep(w: World, id: CreatureId): boolean {
  const z = w.creatures.get(id)!;
  const a = castleAnchor(0, w.layout);
  return Math.hypot(z.pos.x - a.x, z.pos.y - a.y) <= 46 + 1e-6;
}

describe('S194 A — THE RISEN on a PANTS (owner 255) killed by a zombie racial unit', () => {
  it('⭐ REACH: a zombie soldier kills a pants in a real host tick → ONE soldier at its keep', () => {
    const w = fightWorld();
    const z = spawnAt(w, P0, 'raceUnit', 960, 540);
    w.creatures.get(z)!.ehp = 1_000_000; // the pants out-hits a 1/1/1/1 soldier; hold it on the board
    const pants = spawnAt(w, MONSTER, 'endgameMonster', 972, 540, { monsterSeat: P0 });
    w.creatures.get(pants)!.ehp = 1; // one blow fells it; this measures the hook, not the fight
    const r = runToKill(w, () => !w.creatures.has(pants));
    expect(r.born).toHaveLength(1);
    expect(nearKeep(w, r.born[0]!)).toBe(true);
  });

  it('negative: the same kill by a zombie seat WITHOUT the perk raises nobody', () => {
    const w = fightWorld('zombies', ['hp']);
    w.creatures.get(spawnAt(w, P0, 'raceUnit', 960, 540))!.ehp = 1_000_000;
    const pants = spawnAt(w, MONSTER, 'endgameMonster', 972, 540, { monsterSeat: P0 });
    w.creatures.get(pants)!.ehp = 1;
    expect(runToKill(w, () => !w.creatures.has(pants)).born).toHaveLength(0);
  });

  it('negative: a pants felled by a NON-racial unit of the zombie seat (a goblin) raises nobody', () => {
    const w = fightWorld();
    const g = spawnAt(w, P0, 'goblinMelee', 960, 540);
    const pants = spawnAt(w, MONSTER, 'endgameMonster', 972, 540, { monsterSeat: P0 });
    const before = zombiesOf(w).length;
    w.pendingCreatureDeaths = new Set();
    damageEntity(w, { kind: 'creature', id: pants }, 1_000_000, 'creature', { kind: 'creature', id: g }, 'physical');
    sweepDeferredDeaths(w, w.pendingCreatureDeaths);
    w.pendingCreatureDeaths = null;
    drainRacialSpawnQueue(w);
    expect(w.creatures.has(pants)).toBe(false);
    expect(zombiesOf(w).length).toBe(before);
  });
});

describe('S194 B — THE RISEN on HELGA killed by a zombie racial unit', () => {
  it('⭐ REACH: a zombie soldier fells an enemy Helga in a real host tick → ONE soldier at its keep', () => {
    const w = fightWorld();
    w.creatures.get(spawnAt(w, P0, 'raceUnit', 960, 540))!.ehp = 1_000_000; // she slaps back
    const d = helga(w, P1, 972, 540);
    d.ehp = 1;
    const r = runToKill(w, () => d.state === 'DORMANT');
    expect(r.born).toHaveLength(1);
    expect(nearKeep(w, r.born[0]!)).toBe(true);
  });

  it('ONE per death: further blows on a fallen (DORMANT, pool-less) Helga raise nobody', () => {
    const w = fightWorld();
    const z = spawnAt(w, P0, 'raceUnit', 960, 540);
    const d = helga(w, P1, 972, 540);
    d.ehp = 1;
    const before = zombiesOf(w).length;
    for (let i = 0; i < 3; i++) {
      damageEntity(w, { kind: 'defender', id: d.id }, 50, 'creature', { kind: 'creature', id: z }, 'physical');
    }
    drainRacialSpawnQueue(w);
    expect(d.state).toBe('DORMANT');
    expect(zombiesOf(w).length).toBe(before + 1);
  });

  it('negatives: no perk; a non-racial killer; a typeless (seat) credit; his OWN Helga', () => {
    const cases: Array<{ w: World; by: 'raceUnit' | 'goblinMelee' | 'seat'; owner: PlayerId }> = [
      { w: fightWorld('zombies', ['hp']), by: 'raceUnit', owner: P1 },
      { w: fightWorld(), by: 'goblinMelee', owner: P1 },
      { w: fightWorld(), by: 'seat', owner: P1 },
      { w: fightWorld(), by: 'raceUnit', owner: P0 },
    ];
    for (const c of cases) {
      const d = helga(c.w, c.owner, 972, 540);
      d.ehp = 1;
      const before = zombiesOf(c.w).length;
      const attacker = c.by === 'seat'
        ? { kind: 'seat' as const, seat: P0 }
        : { kind: 'creature' as const, id: spawnAt(c.w, P0, c.by, 960, 540) };
      const after0 = zombiesOf(c.w).length;
      damageEntity(c.w, { kind: 'defender', id: d.id }, 50, 'creature', attacker, 'physical');
      drainRacialSpawnQueue(c.w);
      expect(d.state, `${c.by} → ${String(c.owner)}: she fell`).toBe('DORMANT');
      expect(zombiesOf(c.w).length, `${c.by} → ${String(c.owner)}`).toBe(Math.max(before, after0));
    }
  });
});
