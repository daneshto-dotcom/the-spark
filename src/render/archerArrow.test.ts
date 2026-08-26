/**
 * SPARK — S153 P2 (owner R84): the archer's arrow.
 *
 * Everything asserted here is about `resolveArcherShot`, because that function IS the host/client
 * contract. The arrow is not sent over the wire — each peer derives it independently — so the only
 * thing standing between "both peers draw the same arrow" and a desync-looking visual bug is that
 * this function is a pure, tie-broken function of synced state. That is what these tests pin.
 *
 * The drawing itself is deliberately not unit-tested: asserting Graphics call sequences pins the
 * implementation rather than the behaviour, and what actually matters about a drawn arrow — does it
 * read as an arrow, does it point the right way — is a screenshot question, not an assertion one.
 */

import { describe, expect, it } from 'vitest';
import { ARROW_FLIGHT_TICKS, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { asPlayerId, asPrimitiveId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import { asCreatureId, makeCreature, type Creature } from '../state/creatures/creature.ts';
import {
  GOBLIN_ARCHER_CONFIG,
  GOBLIN_MELEE_CONFIG,
} from '../state/creatures/voltkin-config.ts';
import { resolveArcherShot } from './archerArrow.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const FIRE = GOBLIN_ARCHER_CONFIG.attackFireTick;
const RANGE = GOBLIN_ARCHER_CONFIG.attackRange;

function setupWorld(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

function add(
  world: World,
  config: typeof GOBLIN_ARCHER_CONFIG,
  id: number,
  owner: typeof P0,
  x: number,
  y: number,
): Creature {
  const c = makeCreature(config, {
    id: asCreatureId(id),
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: 0,
    sourceSpawnerId: null,
  });
  world.creatures.set(c.id, c);
  return c;
}

function addPrim(world: World, id: number, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor: PLAYER_COLORS[1],
    placedBy: P1,
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: PLAYER_COLORS[1],
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  world.primitives.set(p.id, p);
  return p;
}

/** An archer mid-flight, halfway through the window. */
function shooting(archer: Creature): void {
  archer.state = 'ATTACKING';
  archer.ticksInState = FIRE - Math.floor(ARROW_FLIGHT_TICKS / 2);
}

describe('S153 P2 — when there is NO arrow', () => {
  it('a melee goblin never produces one, however hard it is swinging', () => {
    const w = setupWorld();
    const melee = add(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_MELEE_CONFIG, 2, P1, 10, 0);
    shooting(melee);
    expect(resolveArcherShot(w, melee)).toBeNull();
  });

  it('an archer that is merely SEEKING is not shooting', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, 10, 0);
    archer.state = 'SEEKING';
    archer.ticksInState = FIRE - 1;
    expect(resolveArcherShot(w, archer)).toBeNull();
  });

  it('is absent BEFORE the flight window opens — the wind-up is not the flight', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, 10, 0);
    archer.state = 'ATTACKING';
    archer.ticksInState = FIRE - ARROW_FLIGHT_TICKS - 1;
    expect(resolveArcherShot(w, archer)).toBeNull();
  });

  it('is absent AFTER the fire tick — it has already landed', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, 10, 0);
    archer.state = 'ATTACKING';
    archer.ticksInState = FIRE + 1;
    expect(resolveArcherShot(w, archer)).toBeNull();
  });

  it('has nothing to fly at when there is neither a unit in range nor a committed shape', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    shooting(archer);
    expect(resolveArcherShot(w, archer)).toBeNull();
  });
});

describe('S153 P2 — owner R84: plain at units, flaming at structures', () => {
  it('a unit in range takes a PLAIN arrow, aimed at that unit', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    const victim = add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE - 10, 0);
    shooting(archer);

    const shot = resolveArcherShot(w, archer);
    expect(shot).not.toBeNull();
    expect(shot!.flaming).toBe(false);
    expect(shot!.to).toEqual({ x: victim.pos.x, y: victim.pos.y });
  });

  it('a committed SHAPE takes a FLAMING arrow, aimed at that shape', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    const prim = addPrim(w, 7, 120, 40);
    archer.targetPrimitiveId = prim.id;
    shooting(archer);

    const shot = resolveArcherShot(w, archer);
    expect(shot).not.toBeNull();
    expect(shot!.flaming).toBe(true);
    expect(shot!.to).toEqual({ x: 120, y: 40 });
  });

  it('⭐ a unit in range OUTRANKS the committed shape — both halves in one world', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    const prim = addPrim(w, 7, 120, 40);
    archer.targetPrimitiveId = prim.id;
    const victim = add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE - 10, 0);
    shooting(archer);

    // With both present the unit wins and the arrow is plain...
    const withUnit = resolveArcherShot(w, archer)!;
    expect(withUnit.flaming).toBe(false);
    expect(withUnit.to).toEqual({ x: victim.pos.x, y: victim.pos.y });

    // ...and removing only the unit flips it to the flaming shape shot. Same world, same archer.
    w.creatures.delete(victim.id);
    const withoutUnit = resolveArcherShot(w, archer)!;
    expect(withoutUnit.flaming).toBe(true);
    expect(withoutUnit.to).toEqual({ x: 120, y: 40 });
  });

  it('a unit OUT of range does not steal the shot from the shape', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    const prim = addPrim(w, 7, 120, 40);
    archer.targetPrimitiveId = prim.id;
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE + 50, 0);
    shooting(archer);
    expect(resolveArcherShot(w, archer)!.flaming).toBe(true);
  });

  it('never shoots a FRIENDLY unit standing in range', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P0, 20, 0); // same owner, well inside range
    const prim = addPrim(w, 7, 120, 40);
    archer.targetPrimitiveId = prim.id;
    shooting(archer);
    // Falls through to the shape rather than loosing at a team-mate.
    expect(resolveArcherShot(w, archer)!.flaming).toBe(true);
  });
});

describe('S153 P2 — the host/client contract', () => {
  it('lands EXACTLY on the fire tick, when the damage is applied', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE - 10, 0);
    archer.state = 'ATTACKING';

    archer.ticksInState = FIRE - ARROW_FLIGHT_TICKS;
    expect(resolveArcherShot(w, archer)!.t).toBe(0);
    archer.ticksInState = FIRE;
    expect(resolveArcherShot(w, archer)!.t).toBe(1);
  });

  it('advances monotonically across the window', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE - 10, 0);
    archer.state = 'ATTACKING';
    let prev = -1;
    for (let k = FIRE - ARROW_FLIGHT_TICKS; k <= FIRE; k++) {
      archer.ticksInState = k;
      const t = resolveArcherShot(w, archer)!.t;
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it('⭐ tie-breaks on the LOWEST id, so two peers cannot pick different victims', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    // Two enemies at IDENTICAL distance — the case where insertion order could decide.
    add(w, GOBLIN_ARCHER_CONFIG, 9, P1, 0, RANGE - 10);
    add(w, GOBLIN_ARCHER_CONFIG, 4, P1, RANGE - 10, 0);
    shooting(archer);

    // id 4 wins over id 9 despite being inserted second.
    expect(resolveArcherShot(w, archer)!.to).toEqual({ x: RANGE - 10, y: 0 });
  });

  it('is PURE — same world, same answer, no wall-clock anywhere in it', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE - 10, 0);
    shooting(archer);
    expect(resolveArcherShot(w, archer)).toEqual(resolveArcherShot(w, archer));
  });
});
