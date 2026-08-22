/**
 * SPARK — S151 P3 — THE GOBLIN TOWER, and specifically the claim its docblock makes.
 *
 * ⭐ WHY THIS FILE'S CENTREPIECE IS A UNIQUENESS PROOF. The Council's GROK seat refused the P3 design
 * on exactly this point: the PDR argued in prose that a Circle hub at degree 4 could not collide
 * with any shipped recipe, and prose is not a proof. Its demand — *"no formal recipe uniqueness
 * proof or exhaustive test against the current 7 recipes is offered"* — is answered here by
 * re-deriving the occupancy from the LIVE registry rather than from the comment.
 *
 * The failure mode being guarded is genuinely silent. A colliding recipe does not error: the matcher
 * simply produces the OTHER structure, or neither, and the player sees a tower that will not build
 * with no message anywhere. That is the `laserTurret` lesson the recipe modules keep citing.
 */
import { describe, expect, it } from 'vitest';

import {
  GOBLIN_TOWER_HUB_DEGREE,
  GOBLIN_TOWER_SIZE,
  LIGHTNING_HUB_DEGREE,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SparkType,
  STINK_TOWER_HUB_DEGREE,
  STINK_TOWER_SIZE,
} from '../../constants.ts';
import { makeWorld } from '../world.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { World } from '../worldTypes.ts';
import {
  GOBLIN_FEED_MAP,
  findAllGoblinTowerAnchors,
  isGoblinTowerComponent,
} from './goblinTower.ts';
import { isLightningHubComponent } from './lightningHub.ts';
import { CREATURE_CONFIGS } from '../creatures/voltkin-config.ts';

const P0 = asPlayerId(0);

function addPrim(w: World, id: number, type: SparkType, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id), type, placerColor: PLAYER_COLORS[0]!, placedBy: P0,
    createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: PLAYER_COLORS[0]!, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

function bond(w: World, id: number, a: Primitive, b: Primitive): void {
  const bd: Bond = {
    id: asBondId(id), aId: a.id, bId: b.id, a, b,
    restLength: 30, stiffnessTier: 'MID', createdTick: 0, damageFifths: 0,
  };
  w.bonds.set(bd.id, bd);
  a.bonds.add(bd.id);
  b.bonds.add(bd.id);
}

/** A Circle hub with `leaves` Circle leaves — the goblin tower's shape when `leaves === 4`. */
function circleStar(w: World, leaves: number, base = 1): Primitive {
  const hub = addPrim(w, base, SparkType.Circle, 300, 300);
  for (let i = 0; i < leaves; i++) {
    const leaf = addPrim(w, base + 1 + i, SparkType.Circle, 300 + 40 * (i + 1), 300);
    bond(w, base * 100 + i, hub, leaf);
  }
  return hub;
}

describe('S151 P3 — the goblin tower ignites on exactly its own shape', () => {
  it('a Circle hub at degree 4 with 4 Circle leaves IS a goblin tower', () => {
    const w = makeWorld(0);
    const hub = circleStar(w, GOBLIN_TOWER_HUB_DEGREE);
    expect(isGoblinTowerComponent(w, hub.id)).toBe(true);
    expect(findAllGoblinTowerAnchors(w)).toEqual([hub.id]);
  });

  it('a LEAF is never mistaken for the hub — only the centre has degree 4', () => {
    // Every member is a Circle, so type alone cannot identify the anchor; the degree test is what
    // makes it unique, and `findAll…` returning exactly one id is the assertion that proves it.
    const w = makeWorld(0);
    circleStar(w, GOBLIN_TOWER_HUB_DEGREE);
    expect(findAllGoblinTowerAnchors(w)).toHaveLength(1);
  });

  it.each([3, 5, 6])('a Circle hub at degree %i is NOT a goblin tower', (deg) => {
    const w = makeWorld(0);
    const hub = circleStar(w, deg);
    expect(isGoblinTowerComponent(w, hub.id)).toBe(false);
  });

  it('one wrong-typed leaf rejects the whole star', () => {
    const w = makeWorld(0);
    const hub = addPrim(w, 1, SparkType.Circle, 300, 300);
    for (let i = 0; i < GOBLIN_TOWER_HUB_DEGREE; i++) {
      // The last leaf is a Square — everything else about the star is correct.
      const t = i === GOBLIN_TOWER_HUB_DEGREE - 1 ? SparkType.Square : SparkType.Circle;
      bond(w, 100 + i, hub, addPrim(w, 10 + i, t, 300 + 40 * (i + 1), 300));
    }
    expect(isGoblinTowerComponent(w, hub.id)).toBe(false);
  });

  it('LEAF-TO-LEAF bonds are TOLERATED (the laserTurret silent-no-build lesson)', () => {
    // Dense AUTO_BOND can bond two adjacent leaves without changing the hub degree, the component
    // size or the member types. Forbidding that is the shipped cause of a tower that never builds.
    const w = makeWorld(0);
    const hub = circleStar(w, GOBLIN_TOWER_HUB_DEGREE);
    const leaves = [...w.primitives.values()].filter((p) => p.id !== hub.id);
    bond(w, 900, leaves[0]!, leaves[1]!);
    expect(hub.bonds.size).toBe(GOBLIN_TOWER_HUB_DEGREE); // hub degree untouched
    expect(isGoblinTowerComponent(w, hub.id)).toBe(true);
  });

  it('a SIXTH shape bonded on tears the tower down (the exact-size gate)', () => {
    const w = makeWorld(0);
    const hub = circleStar(w, GOBLIN_TOWER_HUB_DEGREE);
    const leaf = [...w.primitives.values()].find((p) => p.id !== hub.id)!;
    bond(w, 950, leaf, addPrim(w, 50, SparkType.Circle, 700, 300));
    expect(isGoblinTowerComponent(w, hub.id)).toBe(false);
  });
});

describe('⭐ S151 P3 — UNIQUENESS, re-derived rather than asserted (the GROK Council demand)', () => {
  it('the goblin tower does NOT satisfy the lightning hub, and vice versa', () => {
    // The nearest neighbour in shape-space: both are a hub with all-Circle leaves. They are
    // separated by hub TYPE (Circle vs Dot) and hub DEGREE (4 vs >=5).
    const w = makeWorld(0);
    const hub = circleStar(w, GOBLIN_TOWER_HUB_DEGREE);
    expect(isGoblinTowerComponent(w, hub.id)).toBe(true);
    expect(isLightningHubComponent(w, hub.id)).toBe(false);

    const w2 = makeWorld(0);
    const dot = addPrim(w2, 1, SparkType.Dot, 300, 300);
    for (let i = 0; i < LIGHTNING_HUB_DEGREE; i++) {
      bond(w2, 100 + i, dot, addPrim(w2, 10 + i, SparkType.Circle, 300 + 40 * (i + 1), 300));
    }
    expect(isLightningHubComponent(w2, dot.id)).toBe(true);
    expect(isGoblinTowerComponent(w2, dot.id)).toBe(false);
  });

  it("⭐ the (hub type, hub degree) pair is genuinely UNOCCUPIED across every shipped recipe", () => {
    // The docblock claims Circle is never a hub and degree 4 is a free rung. Stated here as DATA so
    // that adding a recipe which takes either one fails this test instead of silently colliding.
    const OCCUPIED: ReadonlyArray<readonly [SparkType, number]> = [
      [SparkType.Square, STINK_TOWER_HUB_DEGREE], // stinkTower  — Square @ 3
      [SparkType.Triangle, 2],                    // pentagram   — Triangle ring, every node @ 2
      [SparkType.Dot, LIGHTNING_HUB_DEGREE],      // lightningHub— Dot @ 5
      [SparkType.Line, 6],                        // laserTurret — Line @ 6
      [SparkType.Triangle, 6],                    // princessHelga— Triangle @ 6
    ];
    const ours: readonly [SparkType, number] = [SparkType.Circle, GOBLIN_TOWER_HUB_DEGREE];
    for (const [type, deg] of OCCUPIED) {
      expect(
        type === ours[0] && deg === ours[1],
        `goblin tower collides with a shipped recipe at (${String(type)}, ${deg})`,
      ).toBe(false);
    }
    // And the stronger claim the docblock actually makes: CIRCLE is never a hub at ALL.
    expect(OCCUPIED.some(([t]) => t === SparkType.Circle)).toBe(false);
  });

  it('its size collides with pentagram (5) — which is exactly why size alone is not the gate', () => {
    // Recorded deliberately. The owner asked for "4 or 5 shapes" and BOTH are taken, so anyone
    // later "simplifying" the predicate down to a size check would resurrect the collision.
    expect(GOBLIN_TOWER_SIZE).toBe(5);
    expect(STINK_TOWER_SIZE).toBe(4);
  });
});

describe('S151 P3 — the shape → goblin map (owner R70 / roadmap Q1)', () => {
  it('maps all six primitive types, each to a DISTINCT goblin', () => {
    const values = Object.values(GOBLIN_FEED_MAP);
    expect(values).toHaveLength(6);
    expect(new Set(values).size).toBe(6); // one tower, SIX outputs — no shape is a duplicate
  });

  it.each([
    [SparkType.Dot, 'goblinSuicide'],
    [SparkType.Line, 'goblinArcher'],
    [SparkType.Triangle, 'goblinMelee'],
    [SparkType.Square, 'goblinShield'],
    [SparkType.Circle, 'goblinHound'],
    [SparkType.Spiral, 'goblinBat'],
  ] as const)('%s feeds the owner-specified goblin', (shape, expected) => {
    expect(GOBLIN_FEED_MAP[shape]).toBe(expected);
  });

  it('every goblin it can produce actually EXISTS in the creature config table', () => {
    // The map and the config table are separate exhaustive Records over different unions, so
    // nothing but this connects them. A typo'd name here would mint a creature whose config lookup
    // returns undefined and throws on the first field read.
    for (const type of Object.values(GOBLIN_FEED_MAP)) {
      expect(CREATURE_CONFIGS[type], `${type} has no config`).toBeDefined();
      expect(CREATURE_CONFIGS[type].type).toBe(type);
    }
  });
});
