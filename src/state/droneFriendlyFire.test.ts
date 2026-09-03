/**
 * SPARK — S161 OPEN-2 (owner, playing 2026-09-03): **"My own lightning drone destroyed his own tower
 * when fight started and he spawned! same issue as we had before and i thought you fixed? why???"**
 *
 * ## The mechanism, and it is one operator
 *
 * `isEnemyBondWithColor` (creatures/creatureAI.ts) is:
 *
 *     return primA.placerColor !== ownerColor || primB.placerColor !== ownerColor;
 *
 * an **OR**. A bond is "enemy" if EITHER endpoint is foreign — so a MIXED bond, one end yours and
 * one end theirs, is enemy. That reading is right for a chewer gnawing at the seam between two
 * empires. It is wrong for `applyDroneExplode`, because a mixed bond is *attached to your own
 * structure*: severing it changes your hub's degree, the star recipe breaks, and the recipe-break
 * branch in `hostTick.ts` fires `STRUCTURE_SELFDESTRUCT`, which razes the hub's whole component.
 *
 * ⇒ Your own drone deletes your own tower, exactly as reported.
 *
 * ⭐ AND THE SAME FUNCTION ALREADY DISAGREES WITH ITSELF ABOUT THIS. Twenty lines above the sever
 * loop, `applyDroneExplode` calls `applyRadialDamage(..., drone.ownerPlayerId)` with the comment
 * *"spares the side that sent it — the contract every area hazard here holds"*. The blast honours
 * owner-sparing; the sever beside it does not. This file pins the contract on both halves.
 *
 * ⚠ WHY THE FIX IS LOCAL TO THE DRONE AND NOT `isEnemyBond`. That predicate is shared by the
 * chewer, the goblin and the Voltkin chain, and `creatureAI.test.ts` /
 * `hostTick.differential.test.ts` / `save.replay.test.ts` pin Voltkin's selection byte-for-byte.
 * Flipping OR→AND globally would silently re-aim every creature in the game to chase a balance bug.
 * The drone's own candidate filter is the right scope.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { isEnemyBond } from './creatures/creatureAI.ts';
import type { Creature } from './creatures/creature.ts';

const P0 = asPlayerId(0);

function prim(w: World, id: number, owner: number, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor: PLAYER_COLORS[owner]!,
    placedBy: asPlayerId(owner),
    createdTick: 0,
    pos: { x, y }, prevPos: { x, y },
    bonds: new Set(),
    ownerColor: PLAYER_COLORS[owner]!,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

function bond(w: World, id: number, a: Primitive, b: Primitive): BondId {
  const bid = asBondId(id);
  w.bonds.set(bid, {
    id: bid, aId: a.id, bId: b.id, a, b,
    restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
  });
  a.bonds.add(bid);
  b.bonds.add(bid);
  return bid;
}

/** A drone owned by P0, standing at the origin. Only the fields the predicate reads matter. */
function droneOf(owner = P0): Creature {
  return { ownerPlayerId: owner, pos: { x: 0, y: 0 } } as unknown as Creature;
}

function board(): World {
  const w = makeWorld(0xd0e);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.creatures.clear();
  return w;
}

describe('OPEN-2 — a drone must never cut a bond touching its OWN structure', () => {
  it('⛔ a MIXED bond (mine + theirs) currently reads as ENEMY — this is the defect', () => {
    const w = board();
    const mine = prim(w, 1, 0, 100, 100);
    const theirs = prim(w, 2, 1, 140, 100);
    const b = bond(w, 1, mine, theirs);
    // The predicate every creature shares. OR semantics: one foreign endpoint is enough.
    expect(isEnemyBond(w, droneOf(), w.bonds.get(b)!)).toBe(true);
  });

  it('a wholly-enemy bond is enemy — the control, so the fix cannot just disable targeting', () => {
    const w = board();
    const a = prim(w, 1, 1, 100, 100);
    const b2 = prim(w, 2, 1, 140, 100);
    expect(isEnemyBond(w, droneOf(), w.bonds.get(bond(w, 1, a, b2))!)).toBe(true);
  });

  it('a wholly-own bond is not enemy', () => {
    const w = board();
    const a = prim(w, 1, 0, 100, 100);
    const b2 = prim(w, 2, 0, 140, 100);
    expect(isEnemyBond(w, droneOf(), w.bonds.get(bond(w, 1, a, b2))!)).toBe(false);
  });
});

describe('OPEN-2 — the drone explosion honours owner-sparing on BOTH halves', () => {
  it('⭐ severs the wholly-enemy bond and SPARES the mixed one attached to its owner', async () => {
    /*
     * The reproduction. Two bonds inside one blast radius:
     *   · MIXED  — the drone owner's own primitive bonded to a foreign one. Must SURVIVE: cutting it
     *     changes the owner's own structure, which is how the hub's recipe breaks and the
     *     STRUCTURE_SELFDESTRUCT razes the tower the owner is complaining about.
     *   · ENEMY  — both endpoints foreign. Must be CUT, or the fix has simply disarmed the drone.
     */
    const { applyDroneExplode } = await import('./droneLifecycle.ts');
    const { makeCreature } = await import('./creatures/creature.ts');
    const { LIGHTNING_DRONE_CONFIG } = await import('./creatures/voltkin-config.ts');
    const { asCreatureId } = await import('../types.ts');
    const w = board();

    const mine = prim(w, 10, 0, 600, 400);
    const foreign = prim(w, 11, 1, 630, 400);
    const mixed = bond(w, 100, mine, foreign);

    const e1 = prim(w, 20, 1, 660, 400);
    const e2 = prim(w, 21, 1, 690, 400);
    const enemy = bond(w, 101, e1, e2);

    const drone = makeCreature(LIGHTNING_DRONE_CONFIG, {
      id: asCreatureId(1),
      ownerPlayerId: P0,
      pos: { x: 645, y: 400 },
      targetPos: { x: 645, y: 400 },
      spawnedAtTick: 0,
      sourceSpawnerId: null,
    });
    w.creatures.set(drone.id, drone);

    applyDroneExplode(w, { type: 'DRONE_EXPLODE', creatureId: drone.id });

    expect(w.bonds.has(enemy), 'the enemy connector is cut — the drone still works').toBe(false);
    expect(
      w.bonds.has(mixed),
      'a bond touching the drone owner\'s OWN primitive must survive its own blast',
    ).toBe(true);
  });
});
