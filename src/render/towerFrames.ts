/**
 * SPARK — S167 — **THE RACE TOWERS BECOME THEIR ART.** The pure half.
 *
 * ## ⛔ WHY THIS EXISTS: 7.4 MiB OF SHIPPED ART THAT NOTHING HAS EVER DRAWN
 *
 * S165 P4 generated, matted, guarded and disk-tested **twelve tier-3 tower atlases** (six towers ×
 * four conditions, plus six destruction cinematics) and S167 added six tier-9 boss towers on top.
 * `t3TowerAtlasBase` has **zero production callers** — grep it: its only references are its own
 * declaration, a re-export, and a test that checks the files exist on disk. The art passes every
 * gate in the repo and has never appeared on screen.
 *
 * That is the worst shape a defect can take here, because every signal says green: the files are
 * present, the paths resolve, `check:atlas` scans them, and the test that "covers" them asserts
 * existence rather than use. Nothing was broken — a renderer was simply never written.
 *
 * This module owns every DECISION that renderer makes; the Pixi half is `towerRenderer.ts`. Nothing
 * here imports Pixi, so all of it runs in vitest.
 *
 * ⛔ THAT SPLIT IS NOT TIDINESS, IT IS THE ONLY WAY THIS GETS TESTED — the same reasoning
 * `castleFrames.ts` records, and this module is deliberately its sibling in shape so the two
 * structure-art paths cannot drift into two different sets of rules.
 *
 * ## ⭐ WHAT DRIVES THE DAMAGE STATE, AND WHY IT NEEDED NO NEW FIELD
 *
 * A castle has `castleHp`. **A spawner has no HP at all** — `CreatureSpawner` carries an id, an
 * owner, an anchor, a recipe and three tick fields, and nothing else. So the obvious move is a new
 * synced `hp` on the spawner, and it would be wrong twice: a new hashed field owes the four-sites
 * tax (factory + serialize + hash + worker), and `trimMirrorSpawner` STRIPS every non-identity
 * spawner field on the wire — so a client would re-seed it and the two peers would draw different
 * damage states from the same board.
 *
 * The tower is MADE OF PRIMITIVES, and a primitive already has `hp`, already serialized, already
 * hashed, already identical on both peers. So the tower's health IS its ring's health, and it costs
 * nothing: no new field, no bump, no divergence. `towerHpFrac` below is the whole mechanism.
 *
 * ⚠ AVERAGED OVER THE RING, NOT MINIMUMED. One chewed node should not make a nine-node tower look
 * like rubble — the art states are a reading of the STRUCTURE's condition, and a mean is what makes
 * "half my tower is gone" and "all of it is half gone" render the same, which is what a player
 * means by damaged.
 *
 * ## ⚠ `destroyed` IS NEARLY UNREACHABLE FOR A LIVE TOWER, AND THAT IS CORRECT
 *
 * `recipeStillSatisfied` removes a spawner the moment its ring stops matching, and a razed node is
 * gone from `world.primitives` entirely — so a tower whose members are dying is usually torn down
 * before its mean HP reaches zero. The `destroyed` frame is therefore art for the CRUMBLE, not for
 * a standing tower, and it is kept in the table so the crumble has a frame to reach for rather than
 * being a fourth thing to generate later.
 */

import type { RaceId } from '../state/races.ts';
import { PRIMITIVE_MAX_HP } from '../constants.ts';
import type { PrimitiveId } from '../types.ts';
import { raceForTowerId, t3TowerAtlasBase } from '../state/raceTowerIds.ts';
import { raceForT9TowerId, t9TowerAtlasBase } from '../state/t9BossIds.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';

/** The three conditions a tower can be drawn in. Atlas ROW ORDER — see `TOWER_STATE_ROWS`. */
export type TowerState = 'intact' | 'damaged' | 'destroyed';

/**
 * ⭐ The damage threshold, deliberately the SAME 0.5 the castle art and the castle HP bar use.
 *
 * One visual language across every structure on the board: a player who has learned that "amber
 * means half" from their keep must not have to learn a second number for their towers.
 * `towerFrames.test.ts` pins it against `CASTLE_DAMAGED_BELOW` so the two cannot drift.
 */
export const TOWER_DAMAGED_BELOW = 0.5;

/**
 * Which art state a tower at this health fraction is drawn in. PURE.
 *
 * ⚠ NaN AND UNDER-ZERO BOTH RESOLVE TO `destroyed`, copied from `castleStateForHp` on purpose: the
 * comparison ORDER is what makes a negative fraction the ruin rather than falling through to
 * pristine, and a structure that renders as rubble because something upstream is broken is a louder
 * bug than one that renders intact.
 */
export function towerStateForHp(hpFrac: number): TowerState {
  if (hpFrac > TOWER_DAMAGED_BELOW) return 'intact';
  if (hpFrac > 0) return 'damaged';
  return 'destroyed';
}

/**
 * Atlas row per state. The tier-3 sheets carry a fourth `spawning` row between `intact` and
 * `damaged`; the tier-9 sheets do not.
 *
 * ⛔ SO THE ROW INDEX IS NOT SHARED BETWEEN THE TIERS AND MUST NOT BE GUESSED. Reading a tier-3
 * sheet with tier-9 row numbers draws `spawning` where `damaged` belongs — a wrong frame rather
 * than a missing one, which no test that checks "did it draw" can catch. The renderer prefers the
 * shipped `-anim.json` manifest and uses these only as the fallback and the contract, exactly as
 * `gathererRenderer` does with `CASTLE_STATE_ROWS`.
 */
export const T3_TOWER_STATE_ROWS: Readonly<Record<TowerState, number>> = {
  intact: 0,
  // row 1 is `spawning` on the tier-3 sheets — deliberately skipped, see above.
  damaged: 2,
  destroyed: 3,
};

export const T9_TOWER_STATE_ROWS: Readonly<Record<TowerState, number>> = {
  intact: 0,
  damaged: 1,
  destroyed: 2,
};

/**
 * On-screen size of a tower sprite, in px.
 *
 * ⚠ THE TIER-9 TOWER IS DRAWN BIGGER, AND THE NUMBER COMES FROM THE STRUCTURE RATHER THAN FROM
 * TASTE. A tier-3 ring is 3 nodes at `TRI_RING_R = 34` (a ~68 px footprint); a tier-9 ring is 9
 * nodes at `NINE_RING_R = 64` (a ~128 px footprint). Drawing both at one size would either float a
 * small sprite inside a wide ring of shapes or bury the shapes under a large one. These track the
 * ring diameters they sit on.
 *
 * ⚠ MINE, NOT THE OWNER'S, and the honest caveat is that a sprite size can only really be judged
 * from a captured frame (the S147 lesson). These are derived to match the footprint; they are the
 * first thing to change after he looks at it.
 */
export const T3_TOWER_SPRITE_PX = 84;
export const T9_TOWER_SPRITE_PX = 150;

/**
 * ⚠ ANCHORED AT THE SPRITE'S FOOT, NOT ITS CENTRE — the `CASTLE_SPRITE_ANCHOR` lesson, which cost a
 * capture: anchoring a building to the centroid of the thing it stands on buries its lower half in
 * the ground. The ring's centroid is where the tower STANDS, so the sprite's base goes there.
 */
export const TOWER_SPRITE_ANCHOR = { x: 0.5, y: 1 } as const;

/** What the renderer needs to draw one tower. `null` when the spawner is not a race tower. */
export interface TowerArt {
  readonly atlasBase: string;
  readonly rows: Readonly<Record<TowerState, number>>;
  readonly sizePx: number;
  readonly race: RaceId;
  readonly tier: 3 | 9;
}

/**
 * PURE — the mean health fraction of `members`, clamped to 0..1.
 *
 * ⚠ A MEMBER THAT IS GONE COUNTS AS ZERO rather than being skipped, and that is the difference
 * between "my tower is hurt" and "my tower is half missing" reading the same on screen. Skipping
 * absent members would make a nine-ring with four nodes destroyed average the five survivors and
 * render pristine.
 *
 * ⚠ AN EMPTY LIST RETURNS 0, not 1 — a tower with no members left is not a healthy tower.
 */
export function towerHpFrac(
  members: readonly PrimitiveId[],
  hpOf: (id: PrimitiveId) => number | undefined,
): number {
  if (members.length === 0) return 0;
  let total = 0;
  for (const id of members) {
    const hp = hpOf(id);
    total += hp === undefined ? 0 : Math.max(0, Math.min(hp, PRIMITIVE_MAX_HP));
  }
  return total / (members.length * PRIMITIVE_MAX_HP);
}

/**
 * PURE — which tower art (if any) a spawner recipe draws. `null` for every non-race recipe, which
 * is most of them: the pentagram, the goblin tower and the lightning hub have no structure art.
 *
 * ⛔ FROM THE SIDE-EFFECT-FREE LEAVES, never from the recipe modules. `raceTowerIds.ts` and
 * `t9BossIds.ts` exist precisely so a consumer can reach these tables without firing twelve
 * `registerRecipe` calls as an import side effect (the S144 P1 bug).
 */
export function towerArtForRecipe(recipeId: GodlyId): TowerArt | null {
  const t3 = raceForTowerId(recipeId);
  if (t3 !== null) {
    return {
      atlasBase: t3TowerAtlasBase(t3),
      rows: T3_TOWER_STATE_ROWS,
      sizePx: T3_TOWER_SPRITE_PX,
      race: t3,
      tier: 3,
    };
  }
  const t9 = raceForT9TowerId(recipeId);
  if (t9 !== null) {
    return {
      atlasBase: t9TowerAtlasBase(t9),
      rows: T9_TOWER_STATE_ROWS,
      sizePx: T9_TOWER_SPRITE_PX,
      race: t9,
      tier: 9,
    };
  }
  return null;
}
