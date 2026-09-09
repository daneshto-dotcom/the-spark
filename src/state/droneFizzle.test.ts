/**
 * SPARK — S170 P2b (owner R170): **A DRONE THAT HITS NOTHING MUST NOT SHOW AN EXPLOSION.**
 *
 * Owner: *"the drone sometimes still explodes, like, in his own building or in his own area when the
 * fight just starts... he didn't destroy anything but I saw him blow up in my zone when the fight
 * started."*
 *
 * ## THE MECHANISM, which is three separately-reasonable facts meeting
 *
 *   1. `hostTick`'s Step 1.5 detonates a drone whose fly-time fuse expires **wherever it happens to
 *      be** — explode-in-place, chosen deliberately over a silent fade. With `DRONE_LIFETIME_TICKS`
 *      at 8 s (and a 30-tick materialize window eating part of it), the hub's first drone after the
 *      bell can run out mid-flight, still inside its owner's own zone.
 *   2. `applyDroneExplode` collects **ENEMY bonds only** and `applyRadialDamage` is owner-sparing,
 *      so a detonation at home is guaranteed to damage nothing at all.
 *   3. The `BOMB_EXPLODE` push was UNCONDITIONAL and ran BEFORE both of those.
 *
 * ⇒ full orange shock ring and flash, for an event with no effect whatsoever.
 *
 * ## ⚠ THE GATE IS ON "HIT NOTHING", NOT ON "FUSE EXPIRED"
 *
 * A fuse-expiry blast that lands NEXT TO an enemy base is a real hit and must still read — the
 * explode-in-place choice is not being reverted. Only the empty blast is wrong. That distinction is
 * why the second test here matters more than the first: it is the one that would catch someone
 * "simplifying" this into a silent fade on expiry.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import { asBondId, asCreatureId, asPlayerId, asPrimitiveId, type BondId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { applyDroneExplode } from './droneLifecycle.ts';
import type { Creature } from './creatures/creature.ts';

const P0 = asPlayerId(0);
const DRONE = asCreatureId(77);

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

/** A P0 drone parked at (x, y), with only the fields the explode path reads. */
function placeDrone(w: World, x: number, y: number): void {
  w.creatures.set(DRONE, {
    id: DRONE,
    type: 'lightningDrone',
    ownerPlayerId: P0,
    pos: { x, y },
    prevPos: { x, y },
    state: 'SEEKING',
    ehp: PRIMITIVE_MAX_HP,
    sourceSpawnerId: null,
  } as unknown as Creature);
}

function board(): World {
  const w = makeWorld(0xf122);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.creatures.clear();
  w.effects.length = 0;
  return w;
}

describe('S170 P2b (owner R170) — a drone that severs nothing fizzles silently', () => {
  it('⛔ detonating in its OWN zone with only own bonds nearby pushes NO effect', () => {
    const w = board();
    // The owner's own structure, right where the drone dies. Enemy-only severing means nothing here
    // is a candidate, so the blast is guaranteed empty.
    const a = prim(w, 1, 0, 500, 500);
    const b = prim(w, 2, 0, 530, 500);
    bond(w, 10, a, b);
    placeDrone(w, 515, 500);

    applyDroneExplode(w, { type: 'DRONE_EXPLODE', creatureId: DRONE });

    expect(
      w.effects.filter((e) => e.kind === 'BOMB_EXPLODE'),
      'this is the owner report: "he didn\'t destroy anything but I saw him blow up in my zone"',
    ).toHaveLength(0);
  });

  it('⭐ POSITIVE CONTROL — a blast that DOES sever an enemy bond still shows its explosion', () => {
    /*
     * ⚠ THE ASSERTION THAT MAKES THE ONE ABOVE MEAN SOMETHING, and the one that forbids the wrong
     * fix. Gating on "the fuse expired" instead of "it hit nothing" would silence real blasts too;
     * the explode-in-place behaviour next to an enemy base is deliberate and must survive.
     */
    const w = board();
    const e1 = prim(w, 3, 1, 500, 500);
    const e2 = prim(w, 4, 1, 530, 500);
    bond(w, 11, e1, e2);
    placeDrone(w, 515, 500);

    applyDroneExplode(w, { type: 'DRONE_EXPLODE', creatureId: DRONE });

    expect(
      w.effects.filter((e) => e.kind === 'BOMB_EXPLODE'),
      'a blast with a real victim must still read on screen',
    ).toHaveLength(1);
  });

  it('⚠ and an empty blast is silent WITHOUT becoming a no-op — the drone is still consumed', () => {
    /*
     * The fix is render-only. `world.effects` is client-side cosmetic and unhashed, so gating it
     * moves no determinism oracle — but a "fizzle" that also failed to despawn the drone would leave
     * it alive past its fuse and re-detonating every tick, which is a far worse bug than the one
     * being fixed. Pinned so the render-only claim stays render-only.
     */
    const w = board();
    prim(w, 5, 0, 900, 900); // nothing within blast radius at all
    placeDrone(w, 100, 100);

    applyDroneExplode(w, { type: 'DRONE_EXPLODE', creatureId: DRONE });

    expect(w.effects.filter((e) => e.kind === 'BOMB_EXPLODE')).toHaveLength(0);
    expect(w.creatures.has(DRONE), 'the drone spent itself either way').toBe(false);
  });
});
