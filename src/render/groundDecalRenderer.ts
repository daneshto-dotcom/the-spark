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
import { blueprintExtent } from '../state/blueprints.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { towerArtForRecipe } from './towerFrames.ts';
import { drawRaceGround, type GroundTarget } from './raceGround.ts';
import { isConcealed } from './concealment.ts';

/** Fallback half-extents for a structure whose recipe has no blueprint box. */
const FALLBACK_HW = 46;
const FALLBACK_HH = 46;

export class GroundDecalRenderer {
  private readonly graphics: Graphics;

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  sync(world: World): void {
    const g = this.graphics;
    g.clear();
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

    let hw = FALLBACK_HW;
    let hh = FALLBACK_HH;
    try {
      const e = blueprintExtent(recipeId as GodlyId);
      hw = Math.max(18, (e.maxDx - e.minDx) / 2);
      hh = Math.max(18, (e.maxDy - e.minDy) / 2);
    } catch {
      /* a recipe with no blueprint box keeps the fallback */
    }

    /*
     * ⛔⛔ S185 — **THE MARK GOES AT THE TOWER'S FEET, NOT AT ITS SHAPE RING.** Owner, on the first
     * build: *"why is it above the tower? It should be around the base of the tower. This looks
     * stupid, it looks like clouds … if you look at the zombies, it needs to be at the base of the
     * zombie tower, around the whole tower, because it's sitting on that goo."*
     *
     * He was right and the cause is one offset. The anchor primitive is the centre of the structure's
     * SHAPE RING, but `towerRenderer` draws the building with a BOTTOM anchor at
     * `cy + art.sizePx * 0.5` — its own comment says *"the sprite's FOOT sits at the ring centroid,
     * so the building stands ON the shapes"*. Drawing on the raw anchor therefore put the stain half
     * an art-height ABOVE the feet, which is exactly the cloud he screenshotted.
     *
     * ⚠ The art height is the right offset, not the blueprint's — the footprint box describes where
     * the SHAPES are, and the building is taller than them. Where there is no tower art (a spawner
     * with none, the ramp towers) the footprint's own half-height is the honest fallback.
     */
    let baseY = anchor.pos.y + hh * 0.5;
    const art = towerArtForRecipe(recipeId as GodlyId);
    if (art !== null) baseY = anchor.pos.y + art.sizePx * 0.5;

    drawRaceGround(
      this.graphics as unknown as GroundTarget,
      race, id, anchor.pos.x, baseY, hw, hh, world.tick,
    );
  }

  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
