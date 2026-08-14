/**
 * SPARK — S144 P1: the BLUEPRINT ↔ RECIPE CROSS-CHECK.
 *
 * `blueprints.ts` MIRRORS four recipe counts rather than importing them, because a value import fires
 * each recipe module's `registerRecipe` side effect and — via `world.ts` → `blueprintBuild.ts` —
 * would register every recipe for essentially the whole codebase (measured: it broke
 * `defenderLifecycle.test.ts`'s unregistered-recipe fallback). This file is the other half of that
 * trade: it imports the recipe modules HERE, where the side effect is confined to one test file, and
 * asserts every mirrored number still equals its source.
 *
 * If a recipe is retuned and this file goes red, the fix is to update `blueprints.ts` — never to
 * relax the assertion. A silent desync ships towers that land and never ignite.
 *
 * Topology invariants are asserted too, because "the right number of shapes" is not the same as "the
 * right shape": the four star recipes gate on an EXACT hub degree, pentagram on every vertex being
 * exactly degree 2, and voltkin on strict chain isolation.
 */

import { describe, expect, it } from 'vitest';
import {
  LIGHTNING_HUB_COMPONENT_SIZE,
  LIGHTNING_HUB_DEGREE,
  SparkType,
  STINK_TOWER_HUB_DEGREE,
  STINK_TOWER_SIZE,
} from '../constants.ts';
import {
  ALL_BLUEPRINT_IDS,
  EXPECTED_COMPONENT_SIZE,
  blueprintBill,
  blueprintCost,
  blueprintFor,
  blueprintPositions,
  blueprintRadius,
} from './blueprints.ts';
// The authoritative sources for the mirrored counts. Importing them registers their recipes, which is
// harmless here and deliberately NOT done from blueprints.ts (see the file docblock).
import { TURRET_SIZE, TURRET_HUB_DEGREE } from './godlyRecipes/laserTurret.ts';
import { HELGA_SIZE } from './godlyRecipes/princessHelga.ts';
import { STINK_HUB_TYPE, STINK_LEAF_TYPE } from './godlyRecipes/stinkTower.ts';
import { VOLTKIN_SIZE } from './godlyRecipes/voltkin.ts';
import type { GodlyId } from './godlyRecipes/types.ts';

/** Degree of every node, derived from the blueprint's own bond list. */
function degrees(id: GodlyId): number[] {
  const bp = blueprintFor(id);
  const d = bp.nodes.map(() => 0);
  for (const [a, b] of bp.bonds) { d[a]++; d[b]++; }
  return d;
}

describe('mirrored counts still match their recipe modules', () => {
  it('laserTurret: 1 Line hub + TURRET_HUB_DEGREE Spirals === TURRET_SIZE', () => {
    expect(blueprintCost('laserTurret')).toBe(TURRET_SIZE);
    expect(blueprintBill('laserTurret').get(SparkType.Spiral)).toBe(TURRET_HUB_DEGREE);
    expect(blueprintBill('laserTurret').get(SparkType.Line)).toBe(1);
    expect(degrees('laserTurret')[0]).toBe(TURRET_HUB_DEGREE); // hub is node 0
  });

  it('princessHelga: 1 Triangle hub + equal Spirals/Circles === HELGA_SIZE', () => {
    expect(blueprintCost('helga')).toBe(HELGA_SIZE);
    const bill = blueprintBill('helga');
    expect(bill.get(SparkType.Triangle)).toBe(1);
    // The predicate counts spirals and circles; an unequal split would still sum to 7 and pass a
    // size-only check, so both halves are pinned explicitly.
    expect(bill.get(SparkType.Spiral)).toBe((HELGA_SIZE - 1) / 2);
    expect(bill.get(SparkType.Circle)).toBe((HELGA_SIZE - 1) / 2);
    expect(degrees('helga')[0]).toBe(HELGA_SIZE - 1);
  });

  it('voltkin: VOLTKIN_SIZE nodes, half Squares then half Triangles', () => {
    expect(blueprintCost('voltkin')).toBe(VOLTKIN_SIZE);
    const bill = blueprintBill('voltkin');
    expect(bill.get(SparkType.Square)).toBe(VOLTKIN_SIZE / 2);
    expect(bill.get(SparkType.Triangle)).toBe(VOLTKIN_SIZE / 2);
    // ORDER matters to the predicate (4 Squares FOLLOWED BY 4 Triangles), not just the totals.
    const types = blueprintFor('voltkin').nodes.map((n) => n.type);
    expect(types).toEqual([
      ...Array<SparkType>(VOLTKIN_SIZE / 2).fill(SparkType.Square),
      ...Array<SparkType>(VOLTKIN_SIZE / 2).fill(SparkType.Triangle),
    ]);
  });

  it('stinkTower: hub/leaf TYPES match the recipe module exports', () => {
    const bill = blueprintBill('stinkTower');
    expect(blueprintCost('stinkTower')).toBe(STINK_TOWER_SIZE);
    expect(bill.get(STINK_HUB_TYPE)).toBe(1);
    expect(bill.get(STINK_LEAF_TYPE)).toBe(STINK_TOWER_HUB_DEGREE);
    expect(degrees('stinkTower')[0]).toBe(STINK_TOWER_HUB_DEGREE);
  });

  it('lightningHub: 1 Dot hub + LIGHTNING_HUB_DEGREE Circles', () => {
    expect(blueprintCost('lightningHub')).toBe(LIGHTNING_HUB_COMPONENT_SIZE);
    expect(blueprintBill('lightningHub').get(SparkType.Circle)).toBe(LIGHTNING_HUB_DEGREE);
    expect(degrees('lightningHub')[0]).toBe(LIGHTNING_HUB_DEGREE);
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: node count === EXPECTED_COMPONENT_SIZE', (id) => {
    expect(blueprintCost(id)).toBe(EXPECTED_COMPONENT_SIZE[id]);
  });
});

describe('topology invariants the predicates actually gate on', () => {
  it('pentagram: a closed ring where EVERY vertex is exactly degree 2', () => {
    expect(degrees('pentagram').every((d) => d === 2)).toBe(true);
    // A ring of n has exactly n edges; n-1 would be a path and n+1 a chord.
    expect(blueprintFor('pentagram').bonds).toHaveLength(blueprintCost('pentagram'));
  });

  it('voltkin: a LINEAR chain — endpoints degree 1, interior degree 2', () => {
    const d = degrees('voltkin');
    expect(d[0]).toBe(1);
    expect(d[d.length - 1]).toBe(1);
    expect(d.slice(1, -1).every((x) => x === 2)).toBe(true);
    expect(blueprintFor('voltkin').bonds).toHaveLength(blueprintCost('voltkin') - 1);
  });

  it.each<GodlyId>(['stinkTower', 'lightningHub', 'laserTurret', 'helga'])(
    '%s: a STAR — node 0 is the hub, every leaf is degree 1',
    (id) => {
      const d = degrees(id);
      expect(d[0]).toBe(blueprintCost(id) - 1);
      expect(d.slice(1).every((x) => x === 1)).toBe(true);
      // Star bonds = leaf count; any extra would be a leaf↔leaf bond this builder deliberately omits.
      expect(blueprintFor(id).bonds).toHaveLength(blueprintCost(id) - 1);
    },
  );

  it.each(ALL_BLUEPRINT_IDS)('%s: bond indices are in range and never self-referential', (id) => {
    const bp = blueprintFor(id);
    for (const [a, b] of bp.bonds) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(bp.nodes.length);
      expect(b).toBeLessThan(bp.nodes.length);
      expect(a).not.toBe(b);
    }
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: every node is reachable — one connected component', (id) => {
    // A recipe gates on COMPONENT size. Two disjoint clumps would have the right node count and the
    // right degrees yet form two components, and every predicate would reject it.
    const bp = blueprintFor(id);
    const adj = bp.nodes.map((): number[] => []);
    for (const [a, b] of bp.bonds) { adj[a].push(b); adj[b].push(a); }
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      for (const next of adj[queue.pop()!]) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    expect(seen.size).toBe(bp.nodes.length);
  });
});

describe('spacing keeps a fresh stamp strain-free', () => {
  /**
   * Every bonded pair must sit far enough apart that soft-collision cannot shove them and strain the
   * bond (a bond breaks at 1.25× rest length for HIGH stiffness, and a broken bond tears the recipe
   * down), yet close enough to look like hand-built geometry. Primitive radii top out at 10.8 px, so
   * ~22 px is the physical floor.
   */
  it.each(ALL_BLUEPRINT_IDS)('%s: bonded nodes are 30..60 px apart', (id) => {
    const bp = blueprintFor(id);
    const pos = blueprintPositions(id, { x: 0, y: 0 });
    for (const [a, b] of bp.bonds) {
      const dist = Math.hypot(pos[a].x - pos[b].x, pos[a].y - pos[b].y);
      expect(dist).toBeGreaterThanOrEqual(30);
      expect(dist).toBeLessThanOrEqual(60); // AUTO_BOND_RADIUS — natural hand-built spacing
    }
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: no two nodes overlap', (id) => {
    const pos = blueprintPositions(id, { x: 0, y: 0 });
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        expect(Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y)).toBeGreaterThan(22);
      }
    }
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: radius covers every node', (id) => {
    const r = blueprintRadius(id);
    for (const p of blueprintPositions(id, { x: 0, y: 0 })) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(r);
    }
  });

  it('positions translate with the centre', () => {
    const at = blueprintPositions('stinkTower', { x: 500, y: 400 });
    const origin = blueprintPositions('stinkTower', { x: 0, y: 0 });
    for (let i = 0; i < at.length; i++) {
      expect(at[i].x).toBeCloseTo(origin[i].x + 500);
      expect(at[i].y).toBeCloseTo(origin[i].y + 400);
    }
  });
});
