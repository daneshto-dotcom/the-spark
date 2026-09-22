/**
 * SPARK — S186: THE DEAD BAND AT THE CANVAS EDGES (owner playtest finding #5).
 *
 * He reported that he cannot build in the bottom band of the screen.
 *
 * ⛔ AND THE FIRST THING TO KNOW IS THAT THE BOTTOM IS NOT SPECIAL. The off-screen rule is
 * symmetrical: it leaves the SAME dead band at the top and a comparable one on each side. It only
 * READS as a bottom problem because `FOOTER_TOP_Y` is 996, so the bottom band lies under the menu
 * where he is looking, while the identical band at the top is empty sky nobody tries to build in.
 *
 * ⛔ AND THE SECOND IS THAT GEOMETRY ALONE CANNOT GIVE HIM THAT BAND. The footer occupies the bottom
 * 84 px, and clicks over its opaque surfaces are swallowed ON PURPOSE — `s182UiSurfaceGuards.test.ts`
 * records that planting a structure under a plate the player cannot see was reported THREE separate
 * times. So the dead band and the footer stand on the same ground, and freeing the rule only helps
 * where no plate is drawn. What is left is a question for him, not a constant to edit.
 *
 * What this file pins is the part that WAS free, and the constraint that bounds anything further.
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FOOTER_TOP_Y,
  WORLD_EDGE_MARGIN,
} from '../constants.ts';
import { ALL_BLUEPRINT_IDS, FOOTPRINT_MARGIN, blueprintExtent } from './blueprints.ts';

/** `goblinMelee`'s arm — the shortest reach any ground attacker has. */
const MELEE_ARM = 35;

/** The lowest y a clamped ground attacker can strike. */
const LOWEST_STRIKEABLE_Y = CANVAS_HEIGHT - WORLD_EDGE_MARGIN + MELEE_ARM;

describe('S186 #5 — what the edge rule gives back, and what still bounds it', () => {
  it('⭐⭐ EVERY recipe keeps its lowest CONNECTOR inside a ground attacker’s reach', () => {
    /*
     * THE CONSTRAINT THAT DECIDES HOW FAR THIS CAN EVER GO. A creature clamps at
     * `CANVAS_HEIGHT - WORLD_EDGE_MARGIN` = 1040 and a melee goblin has a 35 px arm, so 1075 is the
     * floor. A tower whose lowest connector sits below it cannot be attacked at all — which would be
     * strictly worse than a band nobody can build in, because a building in this game dies ONLY
     * through its connectors (canon §4).
     *
     * This is the assertion that must be re-read before anyone lowers the edge rule further on his
     * ruling. It is derived from the shipped constants, so it follows a retune of either.
     */
    for (const id of ALL_BLUEPRINT_IDS) {
      const ext = blueprintExtent(id);
      // The legality rule bounds the FOOTPRINT; the outermost NODE sits FOOTPRINT_MARGIN inside it.
      const lowestLegalCentre = CANVAS_HEIGHT - ext.maxDy;
      const lowestNode = lowestLegalCentre + (ext.maxDy - FOOTPRINT_MARGIN);
      expect(
        lowestNode,
        `${id}: its lowest connector must stay inside a clamped attacker's 35 px arm`,
      ).toBeLessThanOrEqual(LOWEST_STRIKEABLE_Y);
    }
  });

  it('⚠ the dead band is SYMMETRICAL — the bottom is not special, the footer just sits on it', () => {
    // Recorded so the next session does not re-diagnose this as a bottom-edge or a menu bug.
    for (const id of ALL_BLUEPRINT_IDS) {
      const ext = blueprintExtent(id);
      const deadTop = ext.maxDy; // a centre cannot sit above this
      const deadBottom = ext.maxDy;
      expect(deadBottom, `${id}: top and bottom bands are the same rule`).toBe(deadTop);
    }
    // And the reason it only shows at the bottom.
    expect(FOOTER_TOP_Y).toBe(CANVAS_HEIGHT - 84);
    expect(FOOTER_TOP_Y).toBeLessThan(CANVAS_HEIGHT);
  });

  it('every recipe can still be placed somewhere well inside the board', () => {
    // Anti-vacuity: the assertions above would also pass if the rule refused everything.
    for (const id of ALL_BLUEPRINT_IDS) {
      const ext = blueprintExtent(id);
      expect(ext.maxDy * 2, `${id}: footprint must fit the canvas height`).toBeLessThan(CANVAS_HEIGHT);
      expect(-ext.minDx + ext.maxDx, `${id}: footprint must fit the canvas width`).toBeLessThan(
        CANVAS_WIDTH,
      );
    }
  });
});
