/**
 * SPARK — S172 (owner) — FLOATING DAMAGE NUMBERS.
 *
 * These pin the two things the owner actually specified and the one thing that would silently
 * desync the picture between two peers.
 *
 * ⚠ The class itself constructs Pixi `Text`, which needs a canvas, so the placement maths lives in
 * the exported pure `damageAnchor` and is tested here directly. That is not a workaround — the
 * placement rule IS the owner's ruling, and it deserves to be testable on its own.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { attackFifths, unitPoolFifths } from '../state/stats.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';
import { DAMAGE_LIFT_PX, DAMAGE_TOWARD_ATTACKER, damageAnchor } from './damageNumbers.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeat(): World {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  return world;
}

let spawner = 5000;
function spawn(world: World, type: string, owner: ReturnType<typeof asPlayerId>, x: number, y = 500): CreatureId {
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type as never,
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: spawner++ as never,
  });
  let newest: CreatureId | null = null;
  for (const c of world.creatures.values()) {
    if (newest === null || (c.id as number) > (newest as number)) newest = c.id;
  }
  return newest!;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S172 — the number is placed so you can tell WHO TOOK the hit', () => {
  it('⭐⭐ THE OWNER RULING — a quarter of the way toward the attacker, not the midpoint', () => {
    /*
     * *"If you're going to put it exactly on a line between the two, then you don't know who's
     * receiving what damage if they're both hitting each other at the same time ... you take a
     * line between them, and then you go another fifty percent towards the enemy that received
     * the hit."*  Midpoint 0.5, then half of that back toward the victim ⇒ 0.25.
     */
    expect(DAMAGE_TOWARD_ATTACKER).toBe(0.25);

    const world = twoSeat();
    const victim = spawn(world, 'goblinMelee', P0, 100, 500);
    spawn(world, 'goblinMelee', P1, 300, 500); // attacker 200 px to the RIGHT

    const a = damageAnchor(world, victim, 100, 500);
    expect(a.x, 'a quarter of 200 px toward the attacker').toBeCloseTo(150, 5);
    expect(a.y, 'lifted clear of the body').toBeCloseTo(500 - DAMAGE_LIFT_PX, 5);
  });

  it('⭐⭐ AND IT IS UNAMBIGUOUS WHEN BOTH TRADE — the two numbers land on opposite sides', () => {
    // The exact failure he described: two creatures hitting each other simultaneously. At the
    // midpoint both numbers would sit on the same spot and neither could be attributed.
    const world = twoSeat();
    const left = spawn(world, 'goblinMelee', P0, 100, 500);
    const right = spawn(world, 'goblinMelee', P1, 300, 500);

    const onLeft = damageAnchor(world, left, 100, 500);
    const onRight = damageAnchor(world, right, 300, 500);

    expect(onLeft.x, "the LEFT fighter's damage stays on the left of centre").toBeLessThan(200);
    expect(onRight.x, "the RIGHT fighter's damage stays on the right of centre").toBeGreaterThan(200);
    expect(Math.abs(onRight.x - onLeft.x), 'and they are clearly apart').toBeGreaterThan(50);
  });

  it('⭐ 360° — it follows the attacker whichever way it is, not just left/right', () => {
    for (const [ax, ay, note] of [
      [500, 100, 'above'],
      [500, 900, 'below'],
      [100, 500, 'left'],
      [900, 500, 'right'],
    ] as Array<[number, number, string]>) {
      const world = twoSeat();
      const victim = spawn(world, 'goblinMelee', P0, 500, 500);
      spawn(world, 'goblinMelee', P1, ax, ay);
      const a = damageAnchor(world, victim, 500, 500);
      expect(a.x, `attacker ${note}: x moves toward it`).toBeCloseTo(500 + (ax - 500) * 0.25, 5);
      expect(a.y, `attacker ${note}: y moves toward it`).toBeCloseTo(500 + (ay - 500) * 0.25 - DAMAGE_LIFT_PX, 5);
    }
  });

  it('⛔ NO ATTACKER ON THE BOARD (a stink aura, the Whopper rot) — straight above the victim', () => {
    // There is no direction to point at, and inventing one would be a lie about where the hit
    // came from. Damage-over-time is a first-class case here: R171-F required it be covered.
    const world = twoSeat();
    const victim = spawn(world, 'goblinMelee', P0, 400, 400);
    const a = damageAnchor(world, victim, 400, 400);
    expect(a.x).toBeCloseTo(400, 5);
    expect(a.y).toBeLessThan(400);
  });

  it('⛔ AN ALLY IS NEVER MISTAKEN FOR THE ATTACKER', () => {
    const world = twoSeat();
    const victim = spawn(world, 'goblinMelee', P0, 500, 500);
    spawn(world, 'goblinMelee', P0, 510, 500); // a friend, right next to him
    spawn(world, 'goblinMelee', P1, 700, 500); // the actual enemy, far away
    expect(damageAnchor(world, victim, 500, 500).x, 'points at the ENEMY, not the neighbour')
      .toBeCloseTo(550, 5);
  });

  it('⛔ DETERMINISTIC UNDER A TIE — two equidistant enemies resolve by id, not Map order', () => {
    /*
     * `Map` iteration is insertion order, and letting it decide anything is how S155 handed one
     * seat every melee exchange for a whole match. Two peers can insert in different orders, so a
     * tie broken by iteration would put the number in different places on each screen.
     */
    const world = twoSeat();
    const victim = spawn(world, 'goblinMelee', P0, 500, 500);
    spawn(world, 'goblinMelee', P1, 400, 500);
    spawn(world, 'goblinMelee', P1, 600, 500); // exactly as far, the other side
    const first = damageAnchor(world, victim, 500, 500);
    for (let i = 0; i < 5; i++) {
      expect(damageAnchor(world, victim, 500, 500)).toEqual(first);
    }
    expect(first.x, 'the LOWER id wins the tie, and that is the earlier-spawned left one')
      .toBeCloseTo(475, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S172 — the number printed is the STORED INTEGER, with no conversion', () => {
  it('⭐⭐ his worked example: lv3 atk × lv1 pen = 3 × 1.2 = 3.6 × 5 = 18', () => {
    /*
     * ⛔ THIS IS THE ASSERTION THAT KEEPS S171'S UNIT CONFUSION FROM RECURRING IN REVERSE.
     * S171 reported raw fifths while he was thinking in points, and was corrected. He then
     * formalised the ×5 INTO the stat definition — *"you multiply it by five, so we have
     * fifths"* — and confirmed for this feature: *"there's no conversion ... everything's gonna
     * be whole numbers"*. So the sim's stored integer IS his display number, and a renderer that
     * "helpfully" divided by five would be wrong.
     */
    expect(attackFifths(3, 1)).toBe(18);
  });

  it('⭐ and the pool it eats into is on the same scale — 10 hp / 5 def is his 100', () => {
    expect(unitPoolFifths(10, 5)).toBe(100);
    expect(Math.ceil(unitPoolFifths(10, 5) / attackFifths(3, 4)), 'his "four attacks"').toBe(4);
  });

  it('⭐ every ehp delta is therefore already a whole number — nothing to round', () => {
    // If any pool or hit were fractional the renderer would need a rounding rule, and a rounding
    // rule that differs between host and peer is a visible divergence. The ladder forbids it.
    for (const [hp, def] of [[1, 0], [7, 2], [12, 8], [10, 5]] as Array<[number, number]>) {
      expect(Number.isInteger(unitPoolFifths(hp, def))).toBe(true);
    }
    for (const [atk, pen] of [[1, 0], [3, 1], [10, 10], [25, 5]] as Array<[number, number]>) {
      expect(Number.isInteger(attackFifths(atk, pen))).toBe(true);
    }
  });
});
