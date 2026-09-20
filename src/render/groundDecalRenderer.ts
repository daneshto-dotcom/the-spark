/**
 * SPARK — S185 — **THE GROUND-DECAL LAYER.** One race-appropriate mark under every built structure.
 *
 * Owner: *"It kinda looks like it's sticking out like a sore thumb."* The mark is drawn by
 * `raceGround.ts`; this file only decides WHERE each one goes and WHEN it is drawn.
 *
 * ## ⛔ IT LIVES ON `groundLayer`, AND THAT IS A DELIBERATE CHOICE WITH A TEST ATTACHED
 *
 * `e2e/fog.spec.ts` keeps an exact roll call of that layer — *"GROUND MEANS GROUND: the per-race
 * backdrop, then the border walls"* — and this session already shipped a RED gating lane by adding a
 * node there without reading it. Adding a third entry is legitimate: ground marks are ground, by any
 * reading of that sentence. But it is an ADDITION MADE ON PURPOSE, recorded in the roll call, which
 * is exactly the property that assertion exists to enforce.
 *
 * ⭐ AND IT SITS BETWEEN THE BACKDROP AND THE WALLS. Under the walls because a border should read
 * over a tower's ground stain; over the backdrop because that is what "integrated into the
 * background" means. The zone backdrop forces itself to index 0, so construction order in `main.ts`
 * is what places this — it is built immediately before `WallRenderer`.
 *
 * ## ⚠ WHY THE SIZE COMES FROM THE BLUEPRINT AND NOT FROM THE SPRITE
 *
 * The owner tied this to the buildable footprint himself and then said *"let's just try it and see
 * how it lands."* `blueprintExtent` is that footprint — the same box `stampRefusalAt` refuses
 * against — so the stain a player sees after building is the area the tower actually occupies. If he
 * dislikes the coupling, the two are one constant apart.
 */

import { Application, Container, Graphics } from 'pixi.js';
import type { World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { componentOf } from '../game/structure.ts';
import { towerArtForRecipe } from './towerFrames.ts';
import { drawRaceGround, type GroundTarget } from './raceGround.ts';
import { isConcealed } from './concealment.ts';

/**
 * ⭐⭐ S185 — **ONE ALPHA, APPLIED TO THE WHOLE LAYER.** Owner: *"if they're overlapping each other
 * … they're not increasing in opacity, they're just kind of integrating very equally. It's not like
 * the more zones, the more colour it has."*
 *
 * ⛔ Lowering the per-shape alpha CANNOT deliver that: two semi-transparent fills composited always
 * sum toward opaque. Every shape in `raceGround.ts` therefore draws at alpha 1 and OVERWRITES, and
 * the fade happens exactly once, here. Two overlapping zones then read identically to one.
 */
const GROUND_DECAL_ALPHA = 0.34;

/**
 * ⭐ HOW FAR THE ZONE REACHES PAST THE BUILDING. Owner: *"it should look like a whole zone around
 * the tower … you can make the whole radius of that bigger … and when you build many towers next to
 * each other they all look like they're integrated together."* The blueprint footprint alone stops
 * at the shapes, which reads as a shadow rather than as ground a settlement sits on.
 */
const ZONE_SPREAD = 2.1;

export class GroundDecalRenderer {
  private readonly graphics: Graphics;

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    // the single fade that makes overlapping zones blend instead of darken
    g.alpha = GROUND_DECAL_ALPHA;
    if (world.gameState !== 'PLAYING') return;

    for (const sp of world.creatureSpawners.values()) {
      this.mark(world, sp.recipeId, sp.anchorPrimitiveId, sp.ownerPlayerId, sp.id as unknown as number);
    }
    for (const d of world.defenders.values()) {
      this.mark(world, d.recipeId, d.anchorPrimitiveId, d.ownerPlayerId, d.id as unknown as number);
    }
  }

  /**
   * ⚠ ANCHORED ON THE STRUCTURE'S OWN PRIMITIVE, not on a cached position. A tower's shapes are
   * simulated and drift under the solver, so a stored centre would slide out from under the
   * building — the same reason `structureRampRenderer` re-reads its anchor every frame.
   */
  private mark(
    world: World,
    recipeId: string | null,
    anchorId: unknown,
    owner: unknown,
    id: number,
  ): void {
    if (recipeId === null) return;
    const anchor = world.primitives.get(anchorId as never);
    if (anchor === undefined) return;
    /*
     * ⛔ FOG APPLIES. An enemy's ground stain is as much a "where is their building" tell as the
     * building itself, and the owner's fog ruling is explicit that during BUILD you should see
     * nothing of theirs but their castle. `isConcealed` short-circuits false for your own things,
     * so this costs nothing on your own board.
     */
    if (isConcealed(anchor.pos.x, anchor.pos.y, owner as never)) return;
    const race = world.players.get(asPlayerId(owner as never))?.raceId ?? null;
    if (race === null) return;

    /*
     * ⛔⛔ S185 — **THE CENTROID OF THE WHOLE STRUCTURE, NOT THE ANCHOR PRIMITIVE.** This is the bug
     * the owner reported three times, and my first two fixes both missed it.
     *
     * `towerRenderer` plants its sprite on the CENTROID of the tower's ring — `cx`/`cy` averaged over
     * every member — and then drops it half an art-height to stand on the shapes. I was reading
     * `anchor.pos` instead, and for a RING tower the anchor is a node ON the ring, roughly one radius
     * ABOVE the centre. So the zone landed at the tower's waist and read as a slab behind it, which
     * is exactly what he screenshotted on the demon Soul Eater, the zombie hound tower and the mummy
     * pyramid alike.
     *
     * ⚠ AND MY FIRST DIAGNOSIS OF IT WAS WRONG. I read the wide flat bar as `blueprintExtent`'s
     * known-degenerate Voltkin box (280 x 24); he corrected me — it was the tier-3 demon tower. The
     * degenerate-extent hazard is real but it is a DIFFERENT bug, and it is now moot here because
     * this reads the primitives on the board rather than any blueprint at all.
     *
     * ⭐ SO THE HULL IS MEASURED, NOT LOOKED UP. Walking the component gives the true centre and the
     * true width of what is actually standing there, which cannot be degenerate, needs no per-recipe
     * table, and stays correct if a recipe is retuned.
     */
    const comp = componentOf(anchor, world.primitives, world.bonds);
    let sx = 0, sy = 0, n = 0;
    let maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const pid of comp.primitiveIds) {
      const pr = world.primitives.get(pid);
      if (pr === undefined) continue;
      sx += pr.pos.x; sy += pr.pos.y; n++;
      if (pr.pos.y > maxY) maxY = pr.pos.y;
      if (pr.pos.x < minX) minX = pr.pos.x;
      if (pr.pos.x > maxX) maxX = pr.pos.x;
    }
    if (n === 0) return;
    const cx = sx / n;
    const cy = sy / n;

    /*
     * ⭐ THE ZONE SITS AT THE BUILDING'S FEET. Owner: *"cut the art vertically in half so you can see
     * where it starts — it starts from the bottom half, and then it goes a few millimetres underneath
     * the last art particle."* The tier-3 sheets were decoded to check: the subject's base is FLUSH
     * with the bottom of its cell (bottomGap 0 on every HP state), so the sprite's own bottom edge IS
     * the visible base, and that is `cy + sizePx / 2`.
     *
     * Where a structure has no tower art, the lowest member primitive is the honest stand-in for
     * where it meets the ground.
     */
    const art = towerArtForRecipe(recipeId as GodlyId);
    const feetY = art !== null ? cy + art.sizePx * 0.5 : maxY;

    // the zone spreads well past the building, so neighbours read as one settled area
    const hullHW = Math.max(28, (maxX - minX) / 2, art !== null ? art.sizePx * 0.5 : 0);
    const hw = hullHW * ZONE_SPREAD;
    const hh = hw * 0.62;

    drawRaceGround(
      this.graphics as unknown as GroundTarget,
      race, id, cx, feetY, hw, hh, world.tick,
    );
  }

  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
