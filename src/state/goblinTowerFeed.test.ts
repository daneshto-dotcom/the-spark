/**
 * SPARK — S151 P3 — FEED_TOWER.
 *
 * ⭐ THE ASSERTION THIS FILE EXISTS FOR IS THE ATOMICITY ONE. Carry-forward CF1 is a live, shipped
 * bug of exactly this shape on the `?worker=1` path — *"primitives ARE stamped and the bank IS
 * debited; only `defenders` stays empty"* — i.e. a player pays and receives nothing. Every refusal
 * below therefore asserts BOTH halves: no goblin AND no debit. Asserting only "it refused" would
 * pass while the bank silently drained.
 */
import { describe, expect, it } from 'vitest';

import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { makeWorld } from './world.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond } from '../physics/bonds.ts';
import type { World } from './worldTypes.ts';
import { applyFeedTower } from './goblinTowerFeed.ts';
import { bankAdd, bankCountOf } from './castleBank.ts';
import { makeIdlePlayer } from '../game/player.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const TOWER = asSpawnerId(1);

function addPrim(w: World, id: number, x: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id), type: SparkType.Circle, placerColor: PLAYER_COLORS[0]!, placedBy: P0,
    createdTick: 0, pos: { x, y: 300 }, prevPos: { x, y: 300 }, bonds: new Set(),
    ownerColor: PLAYER_COLORS[0]!, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

/** A world holding one live goblin tower owned by P0, with `stock` Triangles banked. */
function setup(stock = 1, recipeId: 'goblinTower' | 'pentagram' = 'goblinTower'): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  const hub = addPrim(w, 1, 300);
  for (let i = 0; i < 4; i++) {
    const leaf = addPrim(w, 10 + i, 340 + 40 * i);
    const bd: Bond = {
      id: asBondId(100 + i), aId: hub.id, bId: leaf.id, a: hub, b: leaf,
      restLength: 30, stiffnessTier: 'MID', createdTick: 0, damageFifths: 0,
    };
    w.bonds.set(bd.id, bd);
    hub.bonds.add(bd.id);
    leaf.bonds.add(bd.id);
  }
  w.creatureSpawners.set(TOWER, {
    id: TOWER, ownerPlayerId: P0, anchorPrimitiveId: hub.id, recipeId,
    nextSpawnTick: 1e9, lastValidatedTick: 0, spawnedCount: 0, ignitedAtTick: 0,
  });
  for (let i = 0; i < stock; i++) bankAdd(w.castleBanks, P0, SparkType.Triangle);
  return w;
}

const feed = (w: World, playerId = P0, sparkType = SparkType.Triangle, spawnerId = TOWER) =>
  applyFeedTower(w, { type: 'FEED_TOWER', playerId, spawnerId, sparkType });

describe('S151 P3 — feeding a goblin tower', () => {
  it('⭐ one Triangle in becomes one melee goblin out, and costs exactly one Triangle', () => {
    const w = setup(2);
    feed(w);
    const born = [...w.creatures.values()];
    expect(born).toHaveLength(1);
    expect(born[0]!.type).toBe('goblinMelee'); // Triangle → swordsman (owner R70)
    expect(born[0]!.ownerPlayerId).toBe(P0);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Triangle)).toBe(1); // 2 - 1
  });

  it.each([
    [SparkType.Dot, 'goblinSuicide'],
    [SparkType.Line, 'goblinArcher'],
    [SparkType.Square, 'goblinShield'],
    [SparkType.Circle, 'goblinHound'],
    [SparkType.Spiral, 'goblinBat'],
  ] as const)('the SAME tower makes a different goblin per shape: %s', (shape, expected) => {
    // This is the whole feature — one tower, six outputs, chosen at feed time rather than at build
    // time. If the tower ever hard-codes its output, this is the test that fails.
    const w = setup(0);
    bankAdd(w.castleBanks, P0, shape);
    feed(w, P0, shape);
    expect([...w.creatures.values()][0]?.type).toBe(expected);
  });

  it('the goblin carries the tower as its sourceSpawnerId (population-cap provenance)', () => {
    const w = setup();
    feed(w);
    expect([...w.creatures.values()][0]!.sourceSpawnerId).toBe(TOWER);
  });

  it('the tower counts what it has produced', () => {
    const w = setup(3);
    feed(w); feed(w);
    expect(w.creatureSpawners.get(TOWER)!.spawnedCount).toBe(2);
  });
});

describe('⭐ S151 P3 — every refusal is ATOMIC: no goblin AND no debit (the CF1 shape)', () => {
  it('refuses when the bank is empty', () => {
    const w = setup(0);
    feed(w);
    expect(w.creatures.size).toBe(0);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Triangle)).toBe(0);
  });

  it("refuses to feed ANOTHER player's tower, and does not touch either bank", () => {
    const w = setup(1);
    bankAdd(w.castleBanks, P1, SparkType.Triangle);
    feed(w, P1);
    expect(w.creatures.size).toBe(0);
    expect(bankCountOf(w.castleBanks, P1, SparkType.Triangle)).toBe(1); // the raider keeps its shape
    expect(bankCountOf(w.castleBanks, P0, SparkType.Triangle)).toBe(1); // the owner keeps its shape
  });

  it('⭐ refuses a NON-goblin-tower spawner — a pentagram is not a goblin factory', () => {
    const w = setup(1, 'pentagram');
    feed(w);
    expect(w.creatures.size).toBe(0);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Triangle)).toBe(1);
  });

  it('refuses a spawner that does not exist', () => {
    const w = setup(1);
    feed(w, P0, SparkType.Triangle, asSpawnerId(999));
    expect(w.creatures.size).toBe(0);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Triangle)).toBe(1);
  });

  it('⭐ refuses when the ANCHOR is already gone, even though the poll has not caught up', () => {
    // Re-validation is throttled by REVALIDATE_INTERVAL_TICKS, so there is a real window in which a
    // collapsed tower is still in the spawner map. Without this gate a player could feed a structure
    // they can already see is rubble.
    const w = setup(1);
    w.primitives.delete(w.creatureSpawners.get(TOWER)!.anchorPrimitiveId);
    feed(w);
    expect(w.creatures.size).toBe(0);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Triangle)).toBe(1);
  });
});
