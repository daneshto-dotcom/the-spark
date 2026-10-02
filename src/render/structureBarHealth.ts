/**
 * SPARK — S191 C-7 — **A STRUCTURE'S HEALTH, AS THE BAR AND THE SHEET READ IT: THE TOWER'S OWN STAR.**
 *
 * > *"The bar needs to follow the art or the art needs to follow the bar — it has to be consistent.
 * > And we can't have too much of big bars … There should be a maximum size of a bar and a minimum
 * > size of a bar, and it should be proportional … it gets a millimetre bigger every thousand HP or
 * > something. We have to see what's the maximum and what's the minimum, and just put it on a scale.
 * > And the damage of the structure needs to follow the health of the bar. And same as the character
 * > sheet — the health bar on the tower sheet when you click on it has to follow the actual health of
 * > the tower."* — owner, S187 (canon §9d item 3, R182-F)
 *
 * ## RULE 1 — ONE NUMBER, THREE SURFACES
 *
 * The board bar (`healthBar.ts`), the character-sheet bar (`characterSheetModel.ts`) and the damage
 * art (`structureRamp.ts` → `starHealthFrac`) read the SAME pool: a live tower's OWN members —
 * `towerMembersAt`, the walk the sim's survival test, the hub's fuse and the ramp renderer already
 * share (S189 C2) — priced ONCE by `towerUnit.towerOwnPoolAt` (S193 SEAM-C7): the recipe's pool
 * (`structurePoolFifths` of the connectors it is built with) minus the damage banked on its OWN
 * connectors, and 0 once one of them is gone (the crumble rule). A weld is not one of them (R182-B: *"neighbouring shapes are protecting it"*), so it
 * neither pads the bar nor drains it. A structure with NO live tower (a freeform lattice) has no star
 * and keeps reading its whole connected component, exactly as before.
 *
 * ⚠ THE CONSEQUENCE, STATED: a tower welded into a lattice can read EMPTY while no connector has
 * snapped yet, because `damageConnector` prices a sever against the whole component's larger pool.
 * That is the hub's art and fuse already (R182-B); the bar now tells the same story instead of a
 * kinder one. The welds' extra pool is shown on no bar.
 *
 * ## RULE 2 — THE WIDTH IS BOUNDED AND PROPORTIONAL (`structureBarWidth`). ⚠ BOTH BOUNDS ARE MINE.
 *
 * He did not rule the bounds (*"we have to see what's the maximum and what's the minimum"*), so they
 * are MEASURED off the shipped roster (`structureBarHealth.test.ts` re-derives every one):
 *   · the smallest pool that draws a bar is ONE connector — `structurePoolFifths(1)` = 6 fifths (a lone
 *     shape has no connector and no structure bar) → `STRUCTURE_BAR_MIN_W`, the creature bar's own 9 px
 *     floor, so a one-stick structure reads like a chewer;
 *   · the largest TOWER pool on the roster is the tier-9 race ring — 9 connectors, 126 fifths — and the
 *     widest building art is that same tower, 150 px → `STRUCTURE_BAR_MAX_W`, so no bar on the board is
 *     wider than the widest building on it. A welded freeform lattice above 126 fifths pins at 150.
 * Linear between the two ("proportional"); ≈ 1.2 px per fifth. ⚠ NOT his literal *"a millimetre every
 * thousand HP"* — the whole roster is 6–126 fifths, so that slope would draw every bar the same width;
 * he said *"or something"*. The S171/S173 floor still holds on top: a tower with art is never narrower
 * than the building (≤ 150 by construction).
 */
import { T9_TOWER_SPRITE_PX } from './towerFrames.ts';
import { structurePoolFifths } from '../state/stats.ts';
import { towerOwnPoolAt, towerUnitAt, type OwnPoolRead } from '../state/towerUnit.ts';
import { heldOwnBanked } from './towerHealthHold.ts'; // ⭐ S194 T15 (R194-30)
import { componentOf } from '../game/structure.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import type { World } from '../state/worldTypes.ts';
import type { PlayerId, PrimitiveId } from '../types.ts';

/** ⚠ MINE (measured) — the smallest pool that draws a structure bar: one connector. */
export const STRUCTURE_BAR_POOL_MIN = structurePoolFifths(1);
/** ⚠ MINE (measured) — the largest TOWER pool on the roster: the tier-9 race ring's 9 connectors. */
export const STRUCTURE_BAR_POOL_MAX = structurePoolFifths(9);
/** ⚠ MINE — the narrowest structure bar, px: the creature bar's floor (`healthBar.ts` `BAR_MIN_W`). */
export const STRUCTURE_BAR_MIN_W = 9;
/** ⚠ MINE (measured) — the widest structure bar, px: the widest building art (the tier-9 tower). */
export const STRUCTURE_BAR_MAX_W = T9_TOWER_SPRITE_PX;

/** PURE — a structure bar's track width for a pool, px: linear between the bounds, clamped at both. */
export function structureBarWidth(poolFifths: number): number {
  if (!Number.isFinite(poolFifths)) return STRUCTURE_BAR_MIN_W;
  const t = (poolFifths - STRUCTURE_BAR_POOL_MIN) / (STRUCTURE_BAR_POOL_MAX - STRUCTURE_BAR_POOL_MIN);
  return STRUCTURE_BAR_MIN_W + (STRUCTURE_BAR_MAX_W - STRUCTURE_BAR_MIN_W) * Math.max(0, Math.min(1, t));
}

/** A live tower a structure bar can be read from. */
export interface BarTower {
  readonly anchorId: PrimitiveId;
  readonly recipeId: GodlyId;
  readonly ownerPlayerId: PlayerId;
  /** A SPAWNER's recipe draws building art (`towerArtForRecipe`); a defender's rig is its own renderer. */
  readonly spawner: boolean;
}

/**
 * PURE — every live tower, keyed by the shape it stands on. One per anchor, in `liveTowerRecipeAt`'s
 * order: the lowest spawner id, else the lowest defender id — never `Map` order.
 */
export function liveBarTowers(world: World): Map<PrimitiveId, BarTower> {
  const out = new Map<PrimitiveId, BarTower>();
  const spawners = [...world.creatureSpawners.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const sp of spawners) {
    if (out.has(sp.anchorPrimitiveId)) continue;
    out.set(sp.anchorPrimitiveId, { anchorId: sp.anchorPrimitiveId, recipeId: sp.recipeId, ownerPlayerId: sp.ownerPlayerId, spawner: true });
  }
  const defenders = [...world.defenders.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const d of defenders) {
    if (out.has(d.anchorPrimitiveId)) continue;
    out.set(d.anchorPrimitiveId, { anchorId: d.anchorPrimitiveId, recipeId: d.recipeId, ownerPlayerId: d.ownerPlayerId, spawner: false });
  }
  return out;
}

/**
 * ⭐ S193 SEAM-C7 — PURE — EVERY live tower, grouped by the shape it stands on, each group in the same
 * total order (spawners by id, then defenders by id). `liveBarTowers` keeps only the FIRST per anchor,
 * and exact ignition does not keep anchors disjoint across recipes (weld audit W2-4: a mummies Line
 * ring anchored at a laser turret's Line hub) — so the bar loop reads THIS, and the turret keeps its
 * own bar beside the ring's instead of losing it to the lower id.
 */
export function liveBarTowersByAnchor(world: World): Map<PrimitiveId, BarTower[]> {
  const out = new Map<PrimitiveId, BarTower[]>();
  const add = (t: BarTower): void => {
    const list = out.get(t.anchorId);
    if (list === undefined) out.set(t.anchorId, [t]);
    else list.push(t);
  };
  const spawners = [...world.creatureSpawners.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const sp of spawners) add({ anchorId: sp.anchorPrimitiveId, recipeId: sp.recipeId, ownerPlayerId: sp.ownerPlayerId, spawner: true });
  const defenders = [...world.defenders.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const d of defenders) add({ anchorId: d.anchorPrimitiveId, recipeId: d.recipeId, ownerPlayerId: d.ownerPlayerId, spawner: false });
  return out;
}

/** A tower's own-star health: its pool, the damage on its own connectors, and the shapes it covers. */
export interface OwnStarHealth {
  readonly max: number;
  readonly banked: number;
  readonly connectors: number;
  readonly prims: readonly PrimitiveId[];
}

/**
 * PURE — the tower `recipeId` at `anchorId` read on its OWN members (Rule 1). `null` when the walk has
 * nothing (anchor gone, a recipe `towerMembersAt` does not govern, no connector left) — the caller
 * then falls back to the component, so a standing structure never loses its bar.
 *
 * ⭐⭐ S193 SEAM-C7 (weld × carry) — **ONE PRICING, NOT TWO.** This was a second copy of the own-pool sum
 * beside `towerUnit.towerOwnHealth` (the welded-tower card), and the two disagreed inside the poll window
 * after a cut arm: this read `structurePoolFifths(own connectors LEFT)` − banked — a healthy-looking bar
 * over a crumbling sprite — while the card and the art read 0. Both now come from `towerOwnPoolAt`: the
 * recipe's pool, 0 once an own connector is gone (the crumble rule), the walk `ownPrimitiveIds` defines.
 */
export function towerOwnHealth(world: World, recipeId: GodlyId, anchorId: PrimitiveId): OwnStarHealth | null {
  const own = heldOwnPoolAt(world, recipeId, anchorId);
  if (own === null || own.connectors === 0) return null;
  return { max: own.max, banked: own.max - own.cur, connectors: own.connectors, prims: own.prims };
}

/**
 * ⭐ S194 T15 (owner R194-30) — `towerOwnPoolAt`, with the damage a re-form of the tower's WELDED structure
 * drained back on it (`towerHealthHold.ts`). The ONE read every live-tower health surface in the renderer
 * takes — this bar, both cards (`characterSheetModel.ts`) and, by the same `heldOwnBanked`, the ramp art —
 * so a welded tower no longer reads full again (and its art pristine again) each time a connector of its
 * structure falls. Identical to `towerOwnPoolAt` until the hold is running, and for a tower nothing drained.
 */
export function heldOwnPoolAt(world: World, recipeId: GodlyId, anchorId: PrimitiveId): OwnPoolRead | null {
  const own = towerOwnPoolAt(world, recipeId, anchorId);
  if (own === null) return null;
  const banked = heldOwnBanked(recipeId, anchorId, own.banked);
  if (banked === own.banked) return own;
  return { ...own, banked, cur: own.whole ? Math.max(0, own.max - banked) : 0 };
}

/**
 * PURE — the health the CHARACTER SHEET shows for the structure `primitiveId` belongs to: the own pool
 * of the tower the shape is part of, else its whole component. `null` when the shape is gone.
 *
 * ⭐ S193 SEAM-C7 — "the tower the shape is part of" is `towerUnitAt`, the SAME resolution the FIX / SCRAP
 * reducers, the button model and the welded cards use (by `ownPrimitiveIds`; lowest spawner id, then
 * lowest defender id). Carry's first cut scanned `liveBarTowers` by lowest ANCHOR id instead — a second
 * answer to "whose shape is this?" that could name a different tower for a shared shape.
 */
export function structureHealthAt(
  world: World, primitiveId: PrimitiveId,
): { cur: number; max: number; connectors: number } | null {
  const prim = world.primitives.get(primitiveId);
  if (prim === undefined) return null;
  const unit = towerUnitAt(world, primitiveId);
  if (unit !== null && unit.kind === 'live') {
    const own = heldOwnPoolAt(world, unit.recipeId, unit.anchorId);
    if (own !== null && own.connectors > 0) return { cur: own.cur, max: own.max, connectors: own.connectors };
  }
  const comp = componentOf(prim, world.primitives, world.bonds);
  const max = structurePoolFifths(comp.bondIds.size);
  let banked = 0;
  for (const id of comp.bondIds) banked += world.bonds.get(id)?.damageFifths ?? 0;
  return { cur: Math.max(0, max - banked), max, connectors: comp.bondIds.size };
}
