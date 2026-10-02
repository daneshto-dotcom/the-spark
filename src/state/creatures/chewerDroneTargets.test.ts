/**
 * SPARK — S194 (T8, owner D): chewers and lightning drones target STRUCTURES ONLY.
 *
 * > *"they only target … buildings, towers, and connectors. And … free shapes. That's their whole
 * > point."* — owner, S194
 *
 * VERIFIED, NOT CHANGED: through the real `runHostTick`, a chewer and a lightning drone parked beside an
 * enemy goblin (which strikes them, so retaliation gets its chance) and an enemy HELGA never hold a
 * creature target, never damage the goblin or Helga, and spend themselves on the enemy BUILDING. What
 * holds it: the chewer is excluded from `findNearestEnemyCreature` (`hostTick.ts`, `!isChewer`) and from
 * retaliation (`NEVER_RETALIATES`, R183-B); the drone's SEEKING branch selects bonds only
 * (`findNearestBondTarget`). REPORTED, not a target scan: with no enemy structure the CHEWER marches to
 * the nearest live enemy keep and chews it (the S154 castle fallback); the DRONE stays at its hub.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, phaseDurationTicks } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from './creature.ts';
import { getCreatureConfig } from './voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { makeDefender, type Defender } from '../defenders/defender.ts';
import type { Controls } from '../../input/controls.ts';
import type { Primitive } from '../../game/primitive.ts';
import { asBondId, asDefenderId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type PlayerId } from '../../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeat(): World {
  const w = makeWorld(0x194d);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}
function unit(w: World, t: CreatureType, o: PlayerId, x: number, y: number): Creature {
  const c = makeCreature(getCreatureConfig(t), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: o, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}
function shape(w: World, o: PlayerId, x: number, y: number): Primitive {
  const color = w.players.get(o)!.color;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p = {
    id, type: SparkType.Square, placerColor: color, placedBy: o, createdTick: 0, pos: { x, y }, prevPos: { x, y },
    bonds: new Set<BondId>(), ownerColor: color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}
function building(w: World, o: PlayerId, x: number, y: number, n: number): BondId[] {
  let prev = shape(w, o, x, y);
  const out: BondId[] = [];
  for (let i = 1; i <= n; i++) {
    const next = shape(w, o, x + 32 * i, y);
    const id = asBondId(w.nextBondId++);
    w.bonds.set(id, { id, aId: prev.id, bId: next.id, a: prev, b: next, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
    prev.bonds.add(id);
    next.bonds.add(id);
    out.push(id);
    prev = next;
  }
  return out;
}
function helga(w: World, o: PlayerId, x: number, y: number): Defender {
  const a = shape(w, o, x + 30, y);
  const d = makeDefender({
    id: asDefenderId(w.nextDefenderId++), kind: 'princess', ownerPlayerId: o, anchorPrimitiveId: a.id,
    recipeId: 'helga' as never, pos: { x, y }, registeredAtTick: w.tick,
  });
  w.defenders.set(d.id, d);
  return d;
}
const deps = (): HostTickDeps => ({
  spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
  controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
  botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
}) as unknown as HostTickDeps;

const BIG = 1_000_000;

/** `who` of P0 beside an enemy goblin + enemy Helga, optionally an enemy building 150 px on; the real host tick. */
function observe(who: CreatureType, withBuilding: boolean, ticks = 900) {
  const w = twoSeat();
  const me = unit(w, who, P0, 900, 540);
  me.ehp = BIG; // held on the board: this measures what it AIMS at, not how long it lives
  const g = unit(w, 'goblinMelee', P1, 915, 540);
  g.ehp = BIG;
  const h = helga(w, P1, 900, 560);
  h.ehp = BIG;
  const bonds = withBuilding ? building(w, P1, 1050, 540, 6) : [];
  const keep0 = w.players.get(P1)!.castleHp;
  const d = deps();
  const st = makeHostTickState(w);
  let creatureTargetTicks = 0;
  let minEhp = BIG;
  for (let i = 0; i < ticks; i++) {
    runHostTick(w, d, st);
    const c = w.creatures.get(me.id);
    if (c === undefined) break;
    if (c.targetCreatureId !== null) creatureTargetTicks++;
    minEhp = Math.min(minEhp, c.ehp);
  }
  return {
    creatureTargetTicks,
    hitTaken: minEhp < BIG,
    goblinLost: BIG - (w.creatures.get(g.id)?.ehp ?? 0),
    helgaLost: BIG - (h.ehp ?? 0),
    struck: bonds.reduce((s, b) => s + (w.bonds.get(b)?.damageFifths ?? 0), 0) + bonds.filter((b) => !w.bonds.has(b)).length,
    keepLost: keep0 - w.players.get(P1)!.castleHp,
  };
}

describe('S194 T8 D — chewers and drones never target a unit or Helga (REACH through runHostTick)', () => {
  it('⭐ the CHEWER: no creature target ever, the goblin and Helga untouched by it, the building chewed', () => {
    const o = observe('chewer', true);
    expect(o.creatureTargetTicks).toBe(0);
    expect(o.goblinLost, 'nothing of P0 but the chewer is on the board').toBe(0);
    expect(o.helgaLost).toBe(0);
    expect(o.struck, 'it spends itself on the building').toBeGreaterThan(0);
  });

  it('⭐ the DRONE: no creature target ever, the goblin and Helga untouched, the building struck', () => {
    const o = observe('lightningDrone', true);
    expect(o.creatureTargetTicks).toBe(0);
    expect(o.goblinLost).toBe(0);
    expect(o.helgaLost).toBe(0);
    expect(o.struck, 'it detonates on the building').toBeGreaterThan(0);
  });

  it('fixture: both are actually struck by the goblin / Helga, so retaliation had its chance', () => {
    expect(observe('chewer', false, 300).hitTaken).toBe(true);
    expect(observe('lightningDrone', false, 300).hitTaken).toBe(true);
  });

  it('REPORTED — no enemy structure: the chewer goes for the keep, the drone stays home; neither for a unit', () => {
    const chew = observe('chewer', false, 1500);
    expect(chew.creatureTargetTicks).toBe(0);
    expect(chew.goblinLost + chew.helgaLost).toBe(0);
    expect(chew.keepLost, 'the S154 castle fallback: a chewer with nothing to chew chews the keep').toBeGreaterThan(0);
    const drone = observe('lightningDrone', false, 900);
    expect(drone.creatureTargetTicks).toBe(0);
    expect(drone.goblinLost + drone.helgaLost).toBe(0);
    expect(drone.keepLost, 'a drone never goes for a keep').toBe(0);
  });
});
