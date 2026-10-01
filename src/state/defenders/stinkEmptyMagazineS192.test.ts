/**
 * SPARK — S192 (s192/magic, found by `magicResist.reach.test.ts`) — ⛔ AN EMPTY STINK TOWER THROWS NOTHING.
 *
 * The documented intent (`defenderLifecycle.ts`, the targeted throw): *"when the magazine is empty the
 * throw simply does not happen and the tower falls through to its depleted aura"*. It did happen:
 * `stinkThrowBag` only decrements while `bagsRemaining > 0` and then splashes and drops a cloud
 * unconditionally, and neither caller (the blind lob, the targeted lob) consulted the magazine. A spent
 * tower kept lobbing a 6-fifth splash plus a lingering cloud every cadence, all FIGHT long.
 *
 * REACH through the real `runHostTick`: an empty tower makes 0 splashes and 0 clouds over 600 ticks, with
 * and without an enemy in range; one bag throws exactly once; and the BUILD-edge reload (`hostTick.ts`,
 * `bagsRemaining = config.bags`) makes a refilled tower throw again next FIGHT. The aura is untouched.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, phaseDurationTicks } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, makeCreature } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { asDefenderId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId } from '../../types.ts';
import { getDefenderConfig, makeDefender, type Defender } from './defender.ts';
import { STINK_HUB_TYPE, STINK_LEAF_TYPE } from '../godlyRecipes/stinkTower.ts';
import { PRIMITIVE_MAX_HP } from '../damage.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { SparkType } from '../../constants.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const AT = { x: 600, y: 300 };

function fightWorld(): World {
  const w = makeWorld(0x5192b);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0], raceId: 'orcs' }, { seat: 1, color: PLAYER_COLORS[1], raceId: 'orcs' }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 100;
  w.creatures.clear();
  w.draft = null;
  return w;
}

/** A REAL stink-tower star (Square hub, three Circle leaves, real bonds) so the recipe poll keeps it. */
function tower(w: World, bags: number): Defender {
  const prim = (type: SparkType, x: number, y: number): Primitive => {
    const p = {
      id: asPrimitiveId(w.nextPrimitiveId++), type, placerColor: PLAYER_COLORS[0]!, placedBy: P0,
      createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: PLAYER_COLORS[0]!,
      lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
    } as unknown as Primitive;
    w.primitives.set(p.id, p);
    return p;
  };
  const hub = prim(STINK_HUB_TYPE, AT.x, AT.y);
  for (const [dx, dy] of [[32, 0], [-16, 28], [-16, -28]] as const) {
    const leaf = prim(STINK_LEAF_TYPE, AT.x + dx, AT.y + dy);
    const id = w.nextBondId++ as unknown as BondId;
    w.bonds.set(id, {
      id, aId: hub.id, bId: leaf.id, a: hub, b: leaf, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
    } as never);
    hub.bonds.add(id);
    leaf.bonds.add(id);
  }
  const d = makeDefender({
    id: asDefenderId(w.nextDefenderId++), kind: 'stinkTower', ownerPlayerId: P0, anchorPrimitiveId: hub.id,
    recipeId: 'stinkTower', pos: { ...AT }, registeredAtTick: 0,
  });
  d.bagsRemaining = bags;
  w.defenders.set(d.id, d);
  return d;
}

/** A held enemy inside the tower's range, so the TARGETED lob path is the one taken. */
function enemyInRange(w: World): void {
  const c = makeCreature(getCreatureConfig('goblinShield'), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P1, pos: { x: AT.x + 100, y: AT.y }, targetPos: { x: AT.x + 100, y: AT.y }, // inside the 120 px aura and the lob range
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(990), clock: w,
  });
  c.ehp = 100_000; c.maxEhp = 100_000;
  c.stunnedUntilTick = w.tick + 1_000_000;
  w.creatures.set(c.id, c);
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function rig(w: World): { d: HostTickDeps; s: HostTickState } {
  return {
    d: {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
      botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
    } as unknown as HostTickDeps,
    s: makeHostTickState(w),
  };
}

/** Run `n` host ticks; count the bag splashes (BOMB_EXPLODE at the tower's lob radius) and clouds born. */
function watch(w: World, r: { d: HostTickDeps; s: HostTickState }, n: number): { splashes: number; clouds: number } {
  let splashes = 0;
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    w.effects.length = 0;
    runHostTick(w, r.d, r.s);
    splashes += w.effects.filter((e) => e.kind === 'BOMB_EXPLODE').length;
    for (const id of w.stinkClouds.keys()) seen.add(id as unknown as number);
  }
  return { splashes, clouds: seen.size };
}

describe('S192 — ⛔ an EMPTY stink tower throws nothing (REACH through the real host tick)', () => {
  it('blind lob path: 0 bags → 0 splashes, 0 clouds over 600 ticks; the aura still pulses', () => {
    const w = fightWorld();
    const d = tower(w, 0);
    const r = rig(w);
    const seen = watch(w, r, 600);
    expect(w.defenders.has(d.id), 'the tower stood all window').toBe(true);
    expect(seen).toEqual({ splashes: 0, clouds: 0 });
    expect(d.bagsRemaining).toBe(0);
  });

  it('targeted lob path: 0 bags with an enemy in range → 0 splashes, 0 clouds; the enemy still smells the aura', () => {
    const w = fightWorld();
    const d = tower(w, 0);
    enemyInRange(w);
    const victim = [...w.creatures.values()][0]!;
    const r = rig(w);
    const seen = watch(w, r, 600);
    expect(w.defenders.has(d.id)).toBe(true);
    expect(seen).toEqual({ splashes: 0, clouds: 0 });
    expect(100_000 - victim.ehp, 'the aura (magic, 1 fifth a second) is untouched').toBeGreaterThan(0);
    expect(100_000 - victim.ehp, '…and it is ONLY the aura: no 6-fifth splash').toBeLessThanOrEqual(10);
  });

  it('an empty tower idles like an idle tower: it never arms a WINDUP', () => {
    const w = fightWorld();
    const d = tower(w, 0);
    enemyInRange(w);
    const r = rig(w);
    for (let i = 0; i < 600; i++) {
      runHostTick(w, r.d, r.s);
      expect(d.state, `tick ${w.tick}`).toBe('IDLE');
    }
  });

  it('⛔ NEGATIVE — ONE bag throws exactly once (one splash, one cloud), then the tower is empty', () => {
    const w = fightWorld();
    const d = tower(w, 1);
    enemyInRange(w);
    const r = rig(w);
    const seen = watch(w, r, 1200);
    expect(seen).toEqual({ splashes: 1, clouds: 1 });
    expect(d.bagsRemaining).toBe(0);
  });

  it('⭐ the BUILD-edge reload refills an empty tower, and it throws again next FIGHT', () => {
    const w = fightWorld();
    const d = tower(w, 0);
    const r = rig(w);
    w.phaseEndsAtTick = w.tick + 30; // end this FIGHT soon
    expect(watch(w, r, 60)).toEqual({ splashes: 0, clouds: 0 });
    expect(w.matchPhase).toBe('BUILD');
    expect(d.bagsRemaining, 'refilled at the FIGHT → BUILD edge').toBe(getDefenderConfig('stinkTower').bags);
    w.phaseEndsAtTick = w.tick + 5; // skip the rest of BUILD
    let guard = 0;
    while (w.matchPhase !== 'FIGHT' && guard++ < 5000) runHostTick(w, r.d, r.s);
    expect(w.matchPhase).toBe('FIGHT');
    w.draft = null;
    const seen = watch(w, r, 1200);
    expect(seen.splashes, 'a refilled tower lobs again').toBeGreaterThan(0);
    expect(seen.clouds).toBe(seen.splashes);
  });
});
