/**
 * SPARK — S149 P4: **THE FOOTER BAND, INDEXED BY CONNECTOR COUNT (R36).**
 *
 * *"the tower selection should be on the bottom of the map as a footer"* — owner playtest.
 *
 * R36, precisely: *"The footer band is indexed by CONNECTOR COUNT, not a flat list of towers. It
 * shows just the numbers in the world's current range (4, 5, 6, 7 …); clicking a number opens the
 * build menu for towers of that complexity. Keeps the bar clean instead of messy from the start."*
 *
 * ⭐ S150 — "CONNECTOR COUNT" IS THE WRONG WORD FOR THE RIGHT NUMBER, AND THE OWNER SETTLED IT (R66:
 * *"Footer number i mean number of shapes so it is correct count. leave it as is."*). The chips are
 * bucketed on `blueprintCost`, which is `nodes.length` — the SHAPE count. So chip "4" is the
 * 4-SHAPE / 3-bond stink tower, and that is what R36 meant all along.
 *
 * ⛔ DO NOT "FIX" THIS BY RE-BUCKETING ON BONDS. The S150 audit flagged the mismatch between the
 * quoted wording and the code, and the correct resolution was to change the SENTENCE, not the
 * numbers — re-bucketing would move every chip on the bar (stink 4→3, turret 7→6, voltkin 8→7) and
 * break the one thing players have already learned to read. The bond counts, for reference only:
 * stink 4/3 · pentagram 5/5 · lightningHub 6/5 · laserTurret 7/6 · helga 7/6 · voltkin 8/7.
 *
 * ## ⚠ THIS REVERSES THE OWNER'S OWN S136 RULING, AND THAT IS DELIBERATE
 *
 * A permanent footer existed and was DELETED in S136 P0 on the owner's ruling: *"that footer with
 * those options should be clickable once you click on the castle and not always there."* R36 is a
 * later and more specific ruling that reinstates a DIFFERENT surface — a handful of numbers rather
 * than a flat row of every tower — so it is a refinement, not a contradiction. Flagged rather than
 * silently applied, and confirmed by the owner before this was built.
 *
 * ## Derived from the registry, never hardcoded (Q8)
 *
 * The numbers are the distinct `blueprintCost` values that actually exist. Shipping a hardcoded
 * `[4,5,6,7,8,9]` would rot the first time a recipe is added or retuned, and the bar would then
 * advertise a complexity with nothing in it — or hide one that has something.
 *
 * ## Affordability is the SHIPPED logic, not a lookalike
 *
 * Counts come straight from `castleStructuresModel`, which decides affordability via
 * `planBlueprintPayment` — **the same function the reducer uses**. A band that said "you can build
 * 2 here" while the panel refused both is the exact defect that sharing exists to prevent.
 *
 * PURE and Pixi-free, so the whole model is unit-testable headlessly (the S130 lesson).
 */

import { castleStructuresModel, type StructureRow } from './castlePanel.ts';
import type { World } from '../state/world.ts';

/** One number on the bar: a complexity, and how the player's inventory stands against it. */
export interface FooterComplexity {
  /** The connector count — the number actually drawn on the chip. */
  readonly complexity: number;
  /** How many distinct structures of this complexity exist in the registry. */
  readonly total: number;
  /** How many of them the player can afford RIGHT NOW. */
  readonly affordable: number;
  /** True when at least one is buildable — drives the chip's lit/dim state. */
  readonly enabled: boolean;
}

/**
 * ⭐ THE BAR'S CONTENTS, ascending by complexity.
 *
 * Ascending order is not cosmetic: the bar is a difficulty ramp read left to right, and a stable
 * order means a chip does not move under the player's cursor as their inventory changes. Sorting
 * numerically (not by insertion) is what makes that true regardless of registry order.
 */
export function footerBandModel(world: World): readonly FooterComplexity[] {
  const byComplexity = new Map<number, { total: number; affordable: number }>();

  for (const row of castleStructuresModel(world)) {
    const bucket = byComplexity.get(row.cost) ?? { total: 0, affordable: 0 };
    bucket.total++;
    if (row.enabled) bucket.affordable++;
    byComplexity.set(row.cost, bucket);
  }

  return [...byComplexity.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([complexity, b]) => ({
      complexity,
      total: b.total,
      affordable: b.affordable,
      enabled: b.affordable > 0,
    }));
}

/**
 * The structures at one complexity — what a chip click opens.
 *
 * Returns the SAME `StructureRow` objects the panel's grid renders, so the band and the menu can
 * never disagree about a name, a cost or an affordability verdict.
 */
export function structuresAtComplexity(world: World, complexity: number): readonly StructureRow[] {
  return castleStructuresModel(world).filter((r) => r.cost === complexity);
}
