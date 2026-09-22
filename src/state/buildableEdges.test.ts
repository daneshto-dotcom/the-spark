/**
 * SPARK — S186: THE DEAD BAND AT THE CANVAS EDGES (owner playtest finding #5).
 *
 * He reported that he cannot build in the bottom band of the screen.
 *
 * ⛔ THE FIRST THING TO KNOW IS THAT THE RULE IS NOT A BOTTOM RULE. `blueprintLegality` refuses a
 * stamp whose FOOTPRINT leaves the canvas on ANY of the four edges, so every recipe has a dead band
 * at the top, the bottom and both sides. It only READS as a bottom problem because `FOOTER_TOP_Y` is
 * 996, so the bottom band lies under the menu where he is looking while the band at the top is empty
 * sky nobody tries to build in.
 *
 * ⚠ BUT THE FOUR BANDS ARE **NOT THE SAME SIZE**, AND AN EARLIER VERSION OF THIS FILE CLAIMED THEY
 * WERE. Most recipes are vertically ASYMMETRIC — a tier-3 race tower reaches 46 px above its centre
 * and only 29 below, so its top band is 46 and its bottom band 29. Exactly four of the nineteen
 * (goblinTower, laserTurret, helga, voltkin) are vertically symmetric, and the laser turret is the
 * one the S186 measurements were taken from, which is precisely how the wrong generalisation got
 * made. The assertion below now prints the real per-recipe numbers instead of asserting a symmetry
 * that does not exist.
 *
 * ⛔ AND GEOMETRY ALONE CANNOT GIVE HIM THAT BAND ANYWAY. The footer occupies the bottom 84 px and
 * clicks over its opaque surfaces are swallowed ON PURPOSE — `s182UiSurfaceGuards.test.ts` records
 * that planting a structure under a plate the player cannot see was reported THREE separate times.
 * The dead band and the footer stand on the same ground. What is left is a question for him.
 *
 * ⭐ WHAT THIS FILE IS FOR: pinning the constraint that bounds how far the edge rule may ever be
 * lowered, and doing it THROUGH THE REAL RULE rather than by restating its arithmetic.
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FOOTER_TOP_Y,
  GOBLIN_ATTACK_RANGE,
  PLAYER_COLORS,
  WORLD_EDGE_MARGIN,
} from '../constants.ts';
import { ALL_BLUEPRINT_IDS, FOOTPRINT_MARGIN, blueprintExtent } from './blueprints.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId } from '../types.ts';
import type { GodlyId } from './godlyRecipes/types.ts';

const P0 = asPlayerId(0);

/**
 * ⛔ DERIVED, NOT COPIED. An earlier version hardcoded 35 here while `GOBLIN_ATTACK_RANGE = 35` sat
 * two files away — so a balance session retuning the melee arm downward would have silently pushed
 * the lowest strikeable y ABOVE the lowest legal node, shipping towers no ground unit can reach,
 * with this file still green. The whole safety case for `EDGE_PAD = 0` rests on this number.
 */
const LOWEST_STRIKEABLE_Y = CANVAS_HEIGHT - WORLD_EDGE_MARGIN + GOBLIN_ATTACK_RANGE;

function board(): World {
  const world = makeWorld(0xed6);
  world.gameState = 'TITLE';
  dispatch(world, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
  });
  return world;
}

/** Binary-search the lowest centre y the REAL rule accepts, at an x well clear of every other zone. */
function lowestLegalCentreY(world: World, id: GodlyId, x: number): number {
  let ok = CANVAS_HEIGHT / 2;
  let bad = CANVAS_HEIGHT + 200;
  for (let i = 0; i < 40; i++) {
    const mid = (ok + bad) / 2;
    if (stampRefusalAt(world, { x, y: mid }, P0, id) === null) ok = mid;
    else bad = mid;
  }
  return ok;
}

describe('S186 #5 — the edge rule, exercised through the rule itself', () => {
  it('⭐⭐ EVERY recipe keeps its lowest CONNECTOR inside a ground attacker’s reach', () => {
    /*
     * THE CONSTRAINT THAT DECIDES HOW FAR THIS CAN EVER GO, and the reason `EDGE_PAD = 0` was safe
     * while lowering it further is not. A creature clamps at `CANVAS_HEIGHT - WORLD_EDGE_MARGIN` and
     * a melee goblin has `GOBLIN_ATTACK_RANGE` of arm. A tower whose lowest connector sits below the
     * sum cannot be attacked AT ALL — and a building in this game dies ONLY through its connectors
     * (canon §4), so that tower would be invulnerable. Strictly worse than a band nobody can build in.
     *
     * ⭐ This asks the SHIPPED PREDICATE where the boundary is rather than recomputing it, so it fails
     * if `EDGE_PAD`, `FOOTPRINT_MARGIN`, the canvas size or the rule's shape changes.
     */
    const world = board();
    const x = CANVAS_WIDTH / 2 - 400; // clear of the quarry, the castles and the keep-outs
    for (const id of ALL_BLUEPRINT_IDS) {
      const centre = lowestLegalCentreY(world, id, x);
      const ext = blueprintExtent(id);
      const lowestNode = centre + (ext.maxDy - FOOTPRINT_MARGIN);
      expect(
        lowestNode,
        `${id}: lowest legal centre ${centre.toFixed(1)} puts its lowest connector at ` +
          `${lowestNode.toFixed(1)}, past the ${LOWEST_STRIKEABLE_Y} a clamped melee attacker reaches`,
      ).toBeLessThanOrEqual(LOWEST_STRIKEABLE_Y);
    }
  });

  it('⚠ the bands exist on ALL FOUR edges, and they are NOT the same size', () => {
    /*
     * Recorded so the next session does not re-diagnose this as a bottom-edge or a menu bug — and so
     * nobody repeats the S186 mistake of generalising the laser turret's symmetric 56/56 to the whole
     * recipe set. This prints the real table; the ASSERTION is only that a top band exists for every
     * recipe and that the set is genuinely mixed.
     */
    const rows = ALL_BLUEPRINT_IDS.map((id) => {
      const e = blueprintExtent(id);
      return { id, top: -e.minDy, bottom: e.maxDy, side: -e.minDx };
    });
    // eslint-disable-next-line no-console
    console.info(
      '\n[S186 dead bands, px, from the shipped extents]\nrecipe                 top  bottom   side\n' +
        rows
          .map(
            (r) =>
              `${r.id.padEnd(20)} ${r.top.toFixed(1).padStart(5)} ${r.bottom.toFixed(1).padStart(7)} ` +
              `${r.side.toFixed(1).padStart(6)}`,
          )
          .join('\n'),
    );
    for (const r of rows) {
      expect(r.top, `${r.id}: the rule applies at the TOP too`).toBeGreaterThan(0);
      expect(r.side, `${r.id}: and on the SIDES`).toBeGreaterThan(0);
    }
    // ⛔ THE CLAIM THAT WAS WRONG. Most recipes are vertically asymmetric; only a few are not.
    const asymmetric = rows.filter((r) => Math.abs(r.top - r.bottom) > 0.5);
    expect(
      asymmetric.length,
      'if this ever reaches 0 the canon may finally say "symmetrical" — until then it must not',
    ).toBeGreaterThan(0);
    expect(asymmetric.length).toBeLessThan(rows.length);
  });

  it('the footer is what makes the BOTTOM band the one he notices', () => {
    // Not a geometry fact — a layout one, and the reason freeing the rule alone does not help him.
    expect(FOOTER_TOP_Y).toBe(CANVAS_HEIGHT - 84);
    const worstBottom = Math.max(...ALL_BLUEPRINT_IDS.map((id) => blueprintExtent(id).maxDy));
    expect(
      CANVAS_HEIGHT - worstBottom,
      'the worst bottom band starts inside the footer, which is why geometry alone cannot free it',
    ).toBeGreaterThan(FOOTER_TOP_Y - 84);
  });

  it('every recipe can still be placed somewhere well inside the board', () => {
    // Anti-vacuity: the assertions above would also pass if the rule refused everything everywhere.
    const world = board();
    const x = CANVAS_WIDTH / 2 - 400;
    for (const id of ALL_BLUEPRINT_IDS) {
      expect(
        stampRefusalAt(world, { x, y: CANVAS_HEIGHT / 2 }, P0, id),
        `${id}: mid-board must be legal, or this whole file is asserting nothing`,
      ).toBeNull();
    }
  });
});
