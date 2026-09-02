/**
 * SPARK — S159 P7: **exactly which recipe OVERLAPS are possible, measured instead of guessed.**
 *
 * S158 B2b replaced the star recipes' whole-component test with `isStarAt` (the owner reported that
 * one neighbouring shape was silently killing a tower). It flagged a consequence for the owner to
 * rule on, in these words:
 *
 *   > *"Dropping the component-size clause means recipes may now OVERLAP: a Circle that is a leaf of
 *   > a lightning hub can simultaneously be the hub of a goblin tower if it has three Circle
 *   > neighbours of its own."*
 *
 * ⛔ **THAT EXAMPLE CANNOT HAPPEN, AND ASKING THE OWNER TO RULE ON IT WOULD HAVE WASTED THEIR TIME.**
 * A goblin-tower hub must have *every* neighbour a Circle. A Circle that is a leaf of a lightning hub
 * is bonded to that hub — a **Dot** — so the all-Circle test fails on that arm. The overlap the flag
 * describes is structurally impossible, and the count is wrong too (the goblin hub is degree **4**,
 * not three).
 *
 * The overlaps that ARE possible are different in kind: they come from **shared LEAVES**, and from
 * one hub standing as another hub's leaf when the two share a leaf type. Each case below is
 * constructed and asserted, with the shape cost written down, so the owner is ruling on the real
 * game rather than on a sentence.
 *
 * ⚠ AND S159 P6 WIDENED THIS. The stink tower was the fourth site of the B2b bug and was still on
 * the component test until this session, so any overlap involving a stink tower is new as of now.
 */

import { describe, expect, it } from 'vitest';

import {
  GOBLIN_TOWER_HUB_DEGREE,
  LIGHTNING_HUB_DEGREE,
  PRIMITIVE_MAX_HP,
  PLAYER_COLORS,
  SparkType,
  STINK_TOWER_HUB_DEGREE,
} from '../../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PrimitiveId } from '../../types.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { Primitive } from '../../game/primitive.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../world.ts';
import { isGoblinTowerComponent } from '../goblinKinds.ts';
import { isStinkTowerComponent } from './stinkTower.ts';
import { isLightningHubComponent } from './lightningHub.ts';

const P0 = asPlayerId(0);
const COLOR_P0 = PLAYER_COLORS[0];

function world(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, COLOR_P0));
  w.primitives.clear();
  w.bonds.clear();
  return w;
}

let nextId = 1;
function prim(w: World, type: SparkType): Primitive {
  const id = asPrimitiveId(nextId++);
  const p: Primitive = {
    id,
    type,
    placerColor: COLOR_P0,
    placedBy: P0,
    createdTick: 0,
    pos: { x: (nextId % 17) * 40, y: (nextId % 13) * 40 },
    prevPos: { x: 0, y: 0 },
    bonds: new Set(),
    ownerColor: COLOR_P0,
    lastOwnershipChange: 0,
    radius: 9,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

let nextBond = 1;
function join(w: World, a: Primitive, b: Primitive): void {
  const id = asBondId(nextBond++);
  const bond: Bond = {
    id,
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 32,
    stiffnessTier: 'MID',
    damageFifths: 0,
    createdTick: 0,
  };
  w.bonds.set(id, bond);
  a.bonds.add(id);
  b.bonds.add(id);
}

/** A star: one hub of `hubType` with `degree` fresh `leafType` leaves. Returns the hub. */
function star(w: World, hubType: SparkType, leafType: SparkType, degree: number): Primitive {
  const hub = prim(w, hubType);
  for (let i = 0; i < degree; i++) join(w, hub, prim(w, leafType));
  return hub;
}

const size = (w: World): number => w.primitives.size;

describe('S159 P7 — recipe overlap after the star test: what is actually possible', () => {
  it('⛔ the flagged example is IMPOSSIBLE: a lightning-hub leaf cannot also be a goblin-tower hub', () => {
    const w = world();
    // A lightning hub: Dot hub, 5 Circle leaves.
    const dot = star(w, SparkType.Dot, SparkType.Circle, LIGHTNING_HUB_DEGREE);
    expect(isLightningHubComponent(w, dot.id)).toBe(true);

    // Take one of its Circle leaves and give it three more Circle neighbours, so it has exactly
    // GOBLIN_TOWER_HUB_DEGREE (4) bonds — the shape the flag describes.
    const leafId = [...dot.bonds]
      .map((b) => w.bonds.get(b)!)
      .map((b) => (b.aId === dot.id ? b.bId : b.aId))[0] as PrimitiveId;
    const leaf = w.primitives.get(leafId)!;
    for (let i = 0; i < GOBLIN_TOWER_HUB_DEGREE - 1; i++) join(w, leaf, prim(w, SparkType.Circle));
    expect(leaf.bonds.size).toBe(GOBLIN_TOWER_HUB_DEGREE);

    // …and it is STILL not a goblin tower, because one of its four arms is the Dot hub.
    expect(isGoblinTowerComponent(w, leafId)).toBe(false);
    // The lightning hub is unaffected, which is the whole point of the star test.
    expect(isLightningHubComponent(w, dot.id)).toBe(true);
  });

  it('✅ TWO GOBLIN TOWERS can chain hub-to-hub: 8 Circles instead of 10', () => {
    const w = world();
    // C1 and C2 are each other's leaf; each also has 3 private Circle leaves.
    const c1 = prim(w, SparkType.Circle);
    const c2 = prim(w, SparkType.Circle);
    join(w, c1, c2);
    for (let i = 0; i < GOBLIN_TOWER_HUB_DEGREE - 1; i++) join(w, c1, prim(w, SparkType.Circle));
    for (let i = 0; i < GOBLIN_TOWER_HUB_DEGREE - 1; i++) join(w, c2, prim(w, SparkType.Circle));

    expect(isGoblinTowerComponent(w, c1.id)).toBe(true);
    expect(isGoblinTowerComponent(w, c2.id)).toBe(true);
    // The discount, stated as a number the owner can weigh: 8 shapes for two towers where two
    // independent stars cost 2 × (1 + 4) = 10.
    expect(size(w)).toBe(8);
    expect(2 * (GOBLIN_TOWER_HUB_DEGREE + 1)).toBe(10);
  });

  it('✅ A STINK TOWER AND A LIGHTNING HUB can share Circle leaves: 7 shapes instead of 10', () => {
    // ⚠ NEW AS OF S159 P6 on the stink side — until this session the stink tower still used the
    // component test, which forbade any overlap involving it.
    const w = world();
    const dot = prim(w, SparkType.Dot);
    const square = prim(w, SparkType.Square);
    const shared: Primitive[] = [];
    for (let i = 0; i < STINK_TOWER_HUB_DEGREE; i++) shared.push(prim(w, SparkType.Circle));
    // Every shared Circle is a leaf of BOTH hubs.
    for (const c of shared) {
      join(w, dot, c);
      join(w, square, c);
    }
    // The Dot needs 5 arms; it has 3 shared, so give it 2 of its own.
    for (let i = 0; i < LIGHTNING_HUB_DEGREE - STINK_TOWER_HUB_DEGREE; i++) {
      join(w, dot, prim(w, SparkType.Circle));
    }

    expect(isStinkTowerComponent(w, square.id)).toBe(true);
    expect(isLightningHubComponent(w, dot.id)).toBe(true);
    // 1 Dot + 1 Square + 5 Circles = 7, against 6 + 4 = 10 built separately.
    expect(size(w)).toBe(7);
    expect(LIGHTNING_HUB_DEGREE + 1 + STINK_TOWER_HUB_DEGREE + 1).toBe(10);
  });

  it('a shared leaf still un-makes BOTH towers when it is eaten — the counterplay scales with the saving', () => {
    const w = world();
    const dot = prim(w, SparkType.Dot);
    const square = prim(w, SparkType.Square);
    const shared: Primitive[] = [];
    for (let i = 0; i < STINK_TOWER_HUB_DEGREE; i++) shared.push(prim(w, SparkType.Circle));
    for (const c of shared) {
      join(w, dot, c);
      join(w, square, c);
    }
    for (let i = 0; i < LIGHTNING_HUB_DEGREE - STINK_TOWER_HUB_DEGREE; i++) {
      join(w, dot, prim(w, SparkType.Circle));
    }
    expect(isStinkTowerComponent(w, square.id)).toBe(true);
    expect(isLightningHubComponent(w, dot.id)).toBe(true);

    // A chewer eats ONE shared Circle: both hubs drop a degree, so both towers fall at once.
    const victim = shared[0];
    for (const b of [...victim.bonds]) {
      const bond = w.bonds.get(b)!;
      const other = bond.aId === victim.id ? bond.bId : bond.aId;
      w.primitives.get(other)!.bonds.delete(b);
      w.bonds.delete(b);
    }
    w.primitives.delete(victim.id);
    expect(isStinkTowerComponent(w, square.id)).toBe(false);
    expect(isLightningHubComponent(w, dot.id)).toBe(false);
  });

  it('a LASER TURRET cannot overlap either of them — its leaf type is the reason', () => {
    // Line hub with Spiral leaves shares no leaf type with the Circle-leaved stars, so no shape can
    // serve both. Recorded because "overlap" is not a property of the star test alone: it is a
    // property of the TYPES, and two of the four recipes cannot participate.
    const w = world();
    const line = star(w, SparkType.Line, SparkType.Spiral, 6);
    const spiralId = [...line.bonds]
      .map((b) => w.bonds.get(b)!)
      .map((b) => (b.aId === line.id ? b.bId : b.aId))[0] as PrimitiveId;
    expect(isGoblinTowerComponent(w, spiralId)).toBe(false);
    expect(isStinkTowerComponent(w, spiralId)).toBe(false);
    expect(isLightningHubComponent(w, spiralId)).toBe(false);
  });
});
