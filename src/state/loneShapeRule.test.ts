/**
 * SPARK — S179 (owner) — **A LONE SHAPE IS WORTH FIVE AND DIES TO ANYTHING.**
 *
 * > *"A single primitive placed in a player's quadrant has ONE health, no defense, no attack, no
 * > penetration. Just stands there and one hit to destroy by anyone."*
 * > *"For every time there's a single shape, it's always worth five."*
 * > *"Similarly with a poop bag. Poop bag is just like one shape, same system."*
 *
 * And the argument he had to make four times, which is the real specification:
 *
 * > *"It doesn't make sense if one shape by itself has more defense than two shapes connected with
 * > one connector."*
 *
 * ## Why this file exists
 *
 * The rule is two lines. It took THREE sessions because two attempts shipped only half of it, and
 * the half they shipped broke every building in the game. This file pins BOTH halves and, just as
 * importantly, pins the things that must NOT have moved.
 *
 *   · **HALF ONE** — a shape with no connectors is capped at `LONE_PRIMITIVE_POOL_FIFTHS`.
 *   · **HALF TWO** — a creature does not TARGET a shape that has connectors. Without this, a tower
 *     could still be dismantled brick-by-brick through `PRIMITIVE_MAX_HP`, which is a second health
 *     system running beside the connector ladder and disagreeing with it. The owner:
 *     *"He targets the connectors. The whole building... A building that's built from many bricks
 *     needs to be destroyed by removing everything that sticks these bricks together."*
 *
 * ⛔ THE COUNTER-GUARDS BELOW ARE THE POINT. Both previous attempts would have passed a file that
 * only tested the lone shape. What catches them is asserting that a CONNECTED shape is untouched
 * and that one swing does not dismantle a triangle.
 */

import { describe, expect, it } from 'vitest';
import {
  GOBLIN_MELEE_ATK,
  GOBLIN_MELEE_PEN,
  LONE_PRIMITIVE_POOL_FIFTHS,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  STINK_BAG_ATK,
  STINK_BAG_PEN,
  SparkType,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { damageEntity } from './damage.ts';
import { findNearestEnemyPrimitiveFrom } from './creatures/creatureAI.ts';
import { attackFifths, structurePoolFifths, unitPoolFifths } from './stats.ts';
import { makeWorld, type World } from './world.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PrimitiveId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeat(): World {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

function addShape(w: World, owner: typeof P0, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const seat = owner as unknown as number;
  const p = {
    id, type: SparkType.Square,
    placerColor: PLAYER_COLORS[seat]!, placedBy: owner, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<ReturnType<typeof asBondId>>(),
    ownerColor: PLAYER_COLORS[seat]!, lastOwnershipChange: 0,
    radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}

/** A REAL bond — registered in `world.bonds` AND on both endpoints, exactly as production does. */
let nextBond = 7000;
function connect(w: World, a: Primitive, b: Primitive): ReturnType<typeof asBondId> {
  const id = asBondId(nextBond++);
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
  } as never);
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** The weakest attack that exists in the game: the goblin shield, 1 ATK / 0 PEN. */
const FEEBLEST_HIT = attackFifths(1, 0);
const GOBLIN_SWING = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN);

// ─────────────────────────────────────────────────────────────────────────────
describe('S179 HALF ONE — a shape with no connectors is worth five', () => {
  it('⭐⭐ HIS RULE — a lone shape dies to the FEEBLEST hit in the game, in one swing', () => {
    const w = twoSeat();
    const lone = addShape(w, P1, 400, 400);
    expect(lone.bonds.size, 'fixture: genuinely lone').toBe(0);

    const died = damageEntity(w, { kind: 'primitive', id: lone.id }, FEEBLEST_HIT, 'creature');

    expect(died, 'one hit from the weakest thing on the board').toBe(true);
    expect(w.primitives.has(lone.id)).toBe(false);
  });

  it('⭐ FIVE *IS* "ANYTHING" — the weakest attack in the game is exactly the lone pool', () => {
    /*
     * He floated two formulations: *"it's always worth five"* and *"doesn't even have HP ... whatever
     * the damage output it gives, it dies."* They are the SAME RULE, and this is why: the smallest
     * attack that exists is `attackFifths(1, 0)` = 5. So a 5-fifth pool dies in one hit to the
     * feeblest unit and to everything above it, with no special-case branch.
     */
    expect(LONE_PRIMITIVE_POOL_FIFTHS).toBe(5);
    expect(FEEBLEST_HIT).toBe(LONE_PRIMITIVE_POOL_FIFTHS);
    expect(unitPoolFifths(1, 0), '1 HP, no DEF — his sentence, on the ladder').toBe(LONE_PRIMITIVE_POOL_FIFTHS);
  });

  it('⭐ the ladder now runs the RIGHT WAY — his monotonicity argument, as arithmetic', () => {
    // *"It doesn't make sense if one shape by itself has more defense than two shapes connected
    // with one connector."* Before the rule a lone shape was 70 against a 1-connector pair's 6.
    expect(LONE_PRIMITIVE_POOL_FIFTHS).toBeLessThan(structurePoolFifths(1));
    expect([
      LONE_PRIMITIVE_POOL_FIFTHS,
      structurePoolFifths(1), structurePoolFifths(2), structurePoolFifths(3),
      structurePoolFifths(4), structurePoolFifths(5),
    ]).toEqual([5, 6, 14, 24, 36, 50]);
  });

  it('⭐ a shape PLACED at full health still dies to one hit — the cap is read at the hit', () => {
    const w = twoSeat();
    const lone = addShape(w, P1, 400, 400);
    expect(lone.hp, 'placed at the full pool').toBe(PRIMITIVE_MAX_HP);
    damageEntity(w, { kind: 'primitive', id: lone.id }, FEEBLEST_HIT, 'creature');
    expect(w.primitives.has(lone.id)).toBe(false);
  });

  it('⭐⭐ THE CASE HE NAMED — a tower survivor with no connectors left dies to one hit', () => {
    // *"anyone that has his tower destroyed and has one shape left on the screen without any
    // connectors."* Asked to confirm, he said: *"Yes. Dies from anything."*
    const w = twoSeat();
    const a = addShape(w, P1, 400, 400);
    const b = addShape(w, P1, 432, 400);
    const bond = connect(w, a, b);

    // the structure comes apart, leaving `a` standing alone
    w.bonds.delete(bond);
    a.bonds.delete(bond);
    b.bonds.delete(bond);

    expect(a.hp, 'it kept the pool it had as a member').toBe(PRIMITIVE_MAX_HP);
    damageEntity(w, { kind: 'primitive', id: a.id }, FEEBLEST_HIT, 'creature');
    expect(w.primitives.has(a.id), 'a survivor with no connectors is a lone shape').toBe(false);
  });

  it('⛔ the cap is a FLOOR, not a heal — a chipped shape is not restored by being hit', () => {
    /*
     * `Math.min`, never an assignment. A shape already below the lone pool (a bag-chipped one, say)
     * must not be lifted back up to 5 by the next strike.
     */
    const w = twoSeat();
    const lone = addShape(w, P1, 400, 400);
    lone.hp = 2; // already chipped below the lone pool
    const died = damageEntity(w, { kind: 'primitive', id: lone.id }, 1, 'hazard');
    expect(died, '2 - 1 = 1, still standing: it was NOT healed up to 5').toBe(false);
    expect(w.primitives.get(lone.id)!.hp).toBe(1);
  });

  it('⭐ the poop bag and the lone shape are ONE number — *"same system"*', () => {
    expect(unitPoolFifths(1, 0)).toBe(LONE_PRIMITIVE_POOL_FIFTHS);
    expect(attackFifths(STINK_BAG_ATK, STINK_BAG_PEN)).toBeGreaterThanOrEqual(LONE_PRIMITIVE_POOL_FIFTHS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S179 HALF TWO — a building is killed through its connectors, not its bricks', () => {
  function triangle(w: World, owner: typeof P0): { ids: PrimitiveId[]; prims: Primitive[] } {
    const a = addShape(w, owner, 600, 600);
    const b = addShape(w, owner, 632, 600);
    const c = addShape(w, owner, 616, 628);
    connect(w, a, b); connect(w, b, c); connect(w, c, a);
    return { ids: [a.id, b.id, c.id], prims: [a, b, c] };
  }

  it('⭐⭐ a creature does NOT acquire a shape that has connectors', () => {
    const w = twoSeat();
    triangle(w, P1);
    const hunter = {
      id: 1, ownerPlayerId: P0, type: 'goblinMelee',
      pos: { x: 610, y: 610 }, placerColor: PLAYER_COLORS[0]!,
    } as never;
    expect(
      findNearestEnemyPrimitiveFrom(w, hunter),
      'every shape on the board belongs to a structure, so there is nothing to acquire',
    ).toBeNull();
  });

  it('⭐ but it DOES acquire a lone one standing beside that same building', () => {
    const w = twoSeat();
    triangle(w, P1);
    const lone = addShape(w, P1, 700, 700);
    const hunter = {
      id: 1, ownerPlayerId: P0, type: 'goblinMelee',
      pos: { x: 705, y: 705 }, placerColor: PLAYER_COLORS[0]!,
    } as never;
    expect(findNearestEnemyPrimitiveFrom(w, hunter), 'the lone shape is the only target').toBe(lone.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('⛔ S179 COUNTER-GUARDS — what must NOT have moved', () => {
  /*
   * ⛔ THESE ARE THE TESTS THAT WOULD HAVE CAUGHT BOTH FAILED ATTEMPTS.
   *
   * Attempt 1 retuned `PRIMITIVE_MAX_HP` 70 -> 5 for EVERY shape. Measured at the time: one
   * 12-fifth goblin swing took a 3-shape triangle from 3 primitives / 3 bonds to 2 / 1 — two of its
   * three connectors gone in a single swing, while its `structurePoolFifths(3)` = 24 pool never
   * applied at all. A file that only tested the lone shape would have shipped it green.
   */
  it('⭐⭐ a CONNECTED shape still has the full pool and survives a goblin swing', () => {
    const w = twoSeat();
    const a = addShape(w, P1, 400, 400);
    const b = addShape(w, P1, 432, 400);
    connect(w, a, b);

    const died = damageEntity(w, { kind: 'primitive', id: a.id }, GOBLIN_SWING, 'creature');

    expect(died, 'a structure member is NOT a lone shape').toBe(false);
    expect(w.primitives.has(a.id)).toBe(true);
    expect(w.primitives.get(a.id)!.hp).toBe(PRIMITIVE_MAX_HP - GOBLIN_SWING);
  });

  it('⭐⭐ ONE SWING DOES NOT DISMANTLE A TRIANGLE — the exact failure of attempt 1', () => {
    const w = twoSeat();
    const a = addShape(w, P1, 600, 600);
    const b = addShape(w, P1, 632, 600);
    const c = addShape(w, P1, 616, 628);
    connect(w, a, b); connect(w, b, c); connect(w, c, a);

    expect(w.primitives.size).toBe(3);
    expect(w.bonds.size).toBe(3);

    damageEntity(w, { kind: 'primitive', id: a.id }, GOBLIN_SWING, 'creature');

    expect(w.primitives.size, 'still three shapes (was 2 under attempt 1)').toBe(3);
    expect(w.bonds.size, 'still three connectors (was 1 under attempt 1)').toBe(3);
  });

  it('⭐ PRIMITIVE_MAX_HP is untouched at 70 — his six-swing ruling still holds', () => {
    expect(PRIMITIVE_MAX_HP).toBe(70);
    expect(Math.ceil(PRIMITIVE_MAX_HP / GOBLIN_SWING), 'six goblin swings fell a member shape').toBe(6);
  });

  it('⭐ the structure ladder is untouched — 6 / 14 / 24 / 50 / 66', () => {
    expect(structurePoolFifths(1)).toBe(6);
    expect(structurePoolFifths(2)).toBe(14);
    expect(structurePoolFifths(3)).toBe(24);
    expect(structurePoolFifths(5)).toBe(50);
    expect(structurePoolFifths(6)).toBe(66);
  });
});
