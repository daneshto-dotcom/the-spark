/**
 * SPARK — S153 P2 (owner R84): the archer's arrow.
 *
 * Everything asserted here is about `resolveProjectileShot`, because that function IS the host/client
 * contract. The arrow is not sent over the wire — each peer derives it independently — so the only
 * thing standing between "both peers draw the same arrow" and a desync-looking visual bug is that
 * this function is a pure, tie-broken function of synced state. That is what these tests pin.
 *
 * The drawing itself is deliberately not unit-tested: asserting Graphics call sequences pins the
 * implementation rather than the behaviour, and what actually matters about a drawn arrow — does it
 * read as an arrow, does it point the right way — is a screenshot question, not an assertion one.
 */

import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { ARROW_FLIGHT_TICKS, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { asPlayerId, asPrimitiveId } from '../types.ts';
import { liftOf } from './creatureLift.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import { asCreatureId, makeCreature, type Creature } from '../state/creatures/creature.ts';
import {
  GOBLIN_ARCHER_CONFIG,
  GOBLIN_BAT_CONFIG,
  GOBLIN_MELEE_CONFIG,
} from '../state/creatures/voltkin-config.ts';
import { drawProjectile, resolveProjectileShot } from './creatureProjectile.ts';

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
    expect(resolveProjectileShot(w, melee)).toBeNull();
  });

  it('an archer that is merely SEEKING is not shooting', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, 10, 0);
    archer.state = 'SEEKING';
    archer.ticksInState = FIRE - 1;
    expect(resolveProjectileShot(w, archer)).toBeNull();
  });

  it('is absent BEFORE the flight window opens — the wind-up is not the flight', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, 10, 0);
    archer.state = 'ATTACKING';
    archer.ticksInState = FIRE - ARROW_FLIGHT_TICKS - 1;
    expect(resolveProjectileShot(w, archer)).toBeNull();
  });

  it('is absent AFTER the fire tick — it has already landed', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, 10, 0);
    archer.state = 'ATTACKING';
    archer.ticksInState = FIRE + 1;
    expect(resolveProjectileShot(w, archer)).toBeNull();
  });

  it('has nothing to fly at when there is neither a unit in range nor a committed shape', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    shooting(archer);
    expect(resolveProjectileShot(w, archer)).toBeNull();
  });
});

describe('S153 P2 — owner R84: plain at units, flaming at structures', () => {
  it('a unit in range takes a PLAIN arrow, aimed at that unit', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    const victim = add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE - 10, 0);
    shooting(archer);

    const shot = resolveProjectileShot(w, archer);
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

    const shot = resolveProjectileShot(w, archer);
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
    const withUnit = resolveProjectileShot(w, archer)!;
    expect(withUnit.flaming).toBe(false);
    expect(withUnit.to).toEqual({ x: victim.pos.x, y: victim.pos.y });

    // ...and removing only the unit flips it to the flaming shape shot. Same world, same archer.
    w.creatures.delete(victim.id);
    const withoutUnit = resolveProjectileShot(w, archer)!;
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
    expect(resolveProjectileShot(w, archer)!.flaming).toBe(true);
  });

  it('never shoots a FRIENDLY unit standing in range', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P0, 20, 0); // same owner, well inside range
    const prim = addPrim(w, 7, 120, 40);
    archer.targetPrimitiveId = prim.id;
    shooting(archer);
    // Falls through to the shape rather than loosing at a team-mate.
    expect(resolveProjectileShot(w, archer)!.flaming).toBe(true);
  });
});

describe('S153 P2 — the host/client contract', () => {
  it('lands EXACTLY on the fire tick, when the damage is applied', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE - 10, 0);
    archer.state = 'ATTACKING';

    archer.ticksInState = FIRE - ARROW_FLIGHT_TICKS;
    expect(resolveProjectileShot(w, archer)!.t).toBe(0);
    archer.ticksInState = FIRE;
    expect(resolveProjectileShot(w, archer)!.t).toBe(1);
  });

  it('advances monotonically across the window', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE - 10, 0);
    archer.state = 'ATTACKING';
    let prev = -1;
    for (let k = FIRE - ARROW_FLIGHT_TICKS; k <= FIRE; k++) {
      archer.ticksInState = k;
      const t = resolveProjectileShot(w, archer)!.t;
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
    expect(resolveProjectileShot(w, archer)!.to).toEqual({ x: RANGE - 10, y: 0 });
  });

  it('is PURE — same world, same answer, no wall-clock anywhere in it', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 0, 0);
    add(w, GOBLIN_ARCHER_CONFIG, 2, P1, RANGE - 10, 0);
    shooting(archer);
    expect(resolveProjectileShot(w, archer)).toEqual(resolveProjectileShot(w, archer));
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════ *
 *   S154 P2 (owner R92) — THE BAT RIDER'S HARPOON
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S154 P2 (R92) — the bat rider throws a HARPOON, and it leaves his picture not his feet', () => {
  it('a bat rider mid-window produces a shot, and it is a harpoon', () => {
    const w = setupWorld();
    const bat = add(w, GOBLIN_BAT_CONFIG, 1, P0, 500, 500);
    const prim = addPrim(w, 9, 500 + GOBLIN_BAT_CONFIG.attackRange - 20, 500);
    bat.targetPrimitiveId = prim.id;
    shooting(bat);
    const shot = resolveProjectileShot(w, bat)!;
    expect(shot).not.toBeNull();
    expect(shot.kind).toBe('harpoon');
  });

  it('an archer still produces an ARROW — the generalisation did not rename his weapon', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 500, 500);
    const prim = addPrim(w, 9, 500 + RANGE - 20, 500);
    archer.targetPrimitiveId = prim.id;
    shooting(archer);
    expect(resolveProjectileShot(w, archer)!.kind).toBe('arrow');
  });

  it('⛔ the harpoon LAUNCHES FROM THE LIFTED PICTURE, not from the ground position', () => {
    /*
     * The bat rider's sprite is drawn GOBLIN_LIFT.goblinBat = 34 px above his `pos` (S152 P3, so a
     * flyer does not walk). A projectile launched from `pos` would visibly emanate from empty air
     * below the mount — the A.0 probe called this "a real geometry bug waiting to happen" and it was
     * right: nothing else in the shot resolution knows the picture is offset.
     */
    const w = setupWorld();
    const bat = add(w, GOBLIN_BAT_CONFIG, 1, P0, 500, 500);
    const prim = addPrim(w, 9, 620, 500);
    bat.targetPrimitiveId = prim.id;
    shooting(bat);
    const shot = resolveProjectileShot(w, bat)!;
    expect(shot.from.y).toBe(500 - liftOf('goblinBat'));
    expect(liftOf('goblinBat')).toBeGreaterThan(0); // anti-vacuity: the lift is real
    // ⚠ and ONLY the `from` end — lifting `to` would land the shot above whatever it hits.
    expect(shot.to.y).toBe(500);
  });

  it('a GROUNDED shooter is unaffected — the archer launches from his own position', () => {
    const w = setupWorld();
    const archer = add(w, GOBLIN_ARCHER_CONFIG, 1, P0, 500, 500);
    const prim = addPrim(w, 9, 620, 500);
    archer.targetPrimitiveId = prim.id;
    shooting(archer);
    expect(liftOf('goblinArcher')).toBe(0);
    expect(resolveProjectileShot(w, archer)!.from.y).toBe(500);
  });

  it('plain at units, flaming at structures — the same discriminator, for the harpoon too', () => {
    const w = setupWorld();
    const bat = add(w, GOBLIN_BAT_CONFIG, 1, P0, 500, 500);
    const prim = addPrim(w, 9, 560, 500);
    bat.targetPrimitiveId = prim.id;
    shooting(bat);
    expect(resolveProjectileShot(w, bat)!.flaming).toBe(true); // a structure burns

    const enemy = add(w, GOBLIN_MELEE_CONFIG, 2, P1, 540, 500);
    expect(enemy).toBeDefined();
    bat.targetCreatureId = enemy.id;
    const atUnit = resolveProjectileShot(w, bat)!;
    expect(atUnit.flaming).toBe(false); // a unit takes the plain iron
    expect(atUnit.kind).toBe('harpoon');
  });

  it('⛔ his RANGE is what makes the shot possible at all — at the melee constant there is none', () => {
    // The regression that started this priority, stated as a shot: with a 35 px reach, a shape 120 px
    // away is out of range, so there is nothing to draw and the owner sees an invisible attack.
    const w = setupWorld();
    const bat = add(w, GOBLIN_BAT_CONFIG, 1, P0, 500, 500);
    const prim = addPrim(w, 9, 620, 500); // 120 px — inside 150, well outside 35
    bat.targetPrimitiveId = prim.id;
    shooting(bat);
    expect(GOBLIN_BAT_CONFIG.attackRange).toBeGreaterThan(120);
    expect(resolveProjectileShot(w, bat)).not.toBeNull();
  });

  it('the two silhouettes both draw geometry, and they differ', () => {
    // A draw path that throws, or that quietly emits nothing, is the failure a pure-resolver test
    // cannot see. Pixi's Graphics works headlessly for path building, so this is cheap to assert.
    const w = setupWorld();
    const bat = add(w, GOBLIN_BAT_CONFIG, 1, P0, 500, 500);
    const prim = addPrim(w, 9, 620, 500);
    bat.targetPrimitiveId = prim.id;
    shooting(bat);
    const harpoon = resolveProjectileShot(w, bat)!;

    const gh = new Graphics();
    drawProjectile(gh, harpoon);
    const ga = new Graphics();
    drawProjectile(ga, { ...harpoon, kind: 'arrow' });
    expect(gh.bounds.width).toBeGreaterThan(0);
    expect(ga.bounds.width).toBeGreaterThan(0);
    // The harpoon is longer than the arrow and trails a line, so its footprint must be bigger.
    expect(gh.bounds.width * gh.bounds.height).toBeGreaterThan(ga.bounds.width * ga.bounds.height);
  });
});
