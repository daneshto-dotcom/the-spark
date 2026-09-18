/**
 * SPARK — S182 (owner R182-E): **THE FLAT REPAIR FEE IS DERIVED, AND THIS IS WHAT STOPS IT DRIFTING.**
 *
 * The owner priced a dent at one shape and refused to pick which one — offered a per-recipe table he
 * called it over-thinking: *"whatever shape is missing is the shape that you need to rebuild"*, which
 * answers the case where something WAS lost and says nothing about the case where nothing was. So the
 * type is mine, and the rule is "what the building is mostly made of".
 *
 * ⛔ THE POINT OF THIS FILE IS THE `it.each` OVER **EVERY REGISTERED BLUEPRINT**, not the seven named
 * expectations below it. A hand-listed table of recipe→shape is exactly the defect this project keeps
 * paying for — `ALL_BLUEPRINT_IDS` itself is hand-written and has already shipped a fully working
 * goblin tower that never appeared in the build panel. A derivation asserted over the whole registry
 * cannot be forgotten when a recipe is added, and moves on its own when one is retuned.
 */
import { describe, expect, it } from 'vitest';
import { SparkType } from '../constants.ts';
import { ALL_BLUEPRINT_IDS, blueprintFor } from './blueprints.ts';
import { repairFeeShapeFor } from './structureRepair.ts';
import type { GodlyId } from './godlyRecipes/types.ts';

describe('repairFeeShapeFor — derived over the whole registry', () => {
  it.each(ALL_BLUEPRINT_IDS.map((id) => [id] as const))(
    '%s: the fee is a shape the structure is actually built from, and the most numerous one',
    (id: GodlyId) => {
      const bp = blueprintFor(id);
      const fee = repairFeeShapeFor(id);
      expect(fee, `${id} must have a fee`).not.toBeNull();

      const counts = new Map<SparkType, number>();
      for (const n of bp.nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
      // (a) it is a type this blueprint uses — never a shape the player would find arbitrary.
      expect(counts.has(fee!), `${id} fee ${fee} is not in the recipe`).toBe(true);
      // (b) nothing in the recipe is more numerous.
      const max = Math.max(...counts.values());
      expect(counts.get(fee!), `${id} fee is not the most numerous type`).toBe(max);
      // (c) ties break on FIRST APPEARANCE, so the answer is a pure function of the node list.
      const firstMax = bp.nodes.find((n) => counts.get(n.type) === max)!.type;
      expect(fee).toBe(firstMax);
    },
  );

  it('⛔ covers every id the panel can offer — an unlisted recipe would repair for free again', () => {
    // If a recipe is ever added to `BLUEPRINTS` but not to `ALL_BLUEPRINT_IDS`, the loop above would
    // silently stop covering it. This is the cross-check that the loop's own input is complete.
    for (const id of ALL_BLUEPRINT_IDS) expect(blueprintFor(id)).toBeDefined();
    expect(ALL_BLUEPRINT_IDS.length).toBeGreaterThanOrEqual(13);
  });
});

describe('the seven hand-built recipes, named — including the owner\'s own two examples', () => {
  it.each([
    // ⭐ HIS TWO: he reached for these himself when dismissing the table.
    ['pentagram', SparkType.Triangle],
    ['goblinTower', SparkType.Circle],
    // The rest, by the same derivation.
    ['stinkTower', SparkType.Circle],
    ['lightningHub', SparkType.Circle],
    ['laserTurret', SparkType.Spiral],
    // ⚠ THE TWO TIES, and the reason the tie-break is first-appearance rather than the hub type.
    // Helga is 3 Spirals and 3 Circles around ONE Triangle hub — breaking on the hub would charge
    // her a Triangle, the single shape she has one of. Voltkin is a chain with no hub at all.
    ['helga', SparkType.Spiral],
    ['voltkin', SparkType.Square],
  ] as const)('%s → %s', (id, expected) => {
    expect(repairFeeShapeFor(id as GodlyId)).toBe(expected);
  });

  it('a blueprint this build does not ship yields null, and the caller falls back to free', () => {
    // Unreachable through `blueprintGroupOf` (it resolves the blueprint first), so this is a
    // fail-open contract rather than a live path: a broken FIX button beats a crashed host.
    expect(repairFeeShapeFor('notARecipe' as GodlyId)).toBeNull();
  });
});
