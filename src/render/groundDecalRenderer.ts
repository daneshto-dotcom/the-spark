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

import { AlphaFilter, Application, Container, Graphics, Sprite } from 'pixi.js';
import type { World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
// S189 C2 (audit W2-1 / W5) — every tower's zone is measured over its OWN members.
import { towerFootprintAt } from '../state/towerMembers.ts';
import { towerArtForRecipe } from './towerFrames.ts';
import { drawRaceGround, type GroundTarget } from './raceGround.ts';
import { isConcealed } from './concealment.ts';
import { fxActive } from './fx/fxState.ts';
import { fxHighQuality } from './fx/fxRuntime.ts';
import { GROUND_STAIN_SCALE, GROUND_STAIN_TEX_H, GROUND_STAIN_TEX_W, groundStainPick } from './fx/groundStainFx.ts';
import { groundStainTexture } from './groundStainTextures.ts';
import type { RaceId } from '../state/races.ts';

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

/**
 * ⭐⭐ **THE BUILDING'S BASE SITS AT THE CENTRE OF THE ZONE.** Owner, after three rounds of me
 * nudging this: *"think about this. The base of the building needs to sit at the CENTER of the
 * zone. Right? But just one layer above, so the zone doesn't change the building."*
 *
 * ⛔ THAT IS A SPEC, NOT A NUDGE, AND IT IS WHY THIS CONSTANT IS ZERO RATHER THAN TUNED. I shipped
 * 0.3 and then 0.42 trying to chase it by eye from screenshots, which was the wrong method: his
 * sentence defines the geometry exactly. With the centroid anchor from the previous commit, the
 * sprite's bottom edge IS the base, so centring the ellipse there is the whole requirement.
 *
 * ⭐⭐ **−0.21: THE ZONE'S CENTRE SITS ABOVE THE SPRITE'S BOTTOM EDGE, and the sign is the point.**
 *
 * Owner, after five rounds: *"if you move it by the same amount you've just moved it since the last
 * command I gave you, then I think it will be exactly where it needs to be."* The previous move was
 * 0.21 → 0, so the same again is −0.21. A relative instruction, which removed every ambiguity that
 * the absolute ones had.
 *
 * ⛔⛔ **AND MY PIXEL MEASUREMENTS WERE BIASED LOW THE WHOLE TIME — THIS IS THE REAL LESSON.** I kept
 * decoding his screenshots for the zone's red extent and dividing to get a centre. But the BUILDING
 * OCCLUDES THE TOP OF THE ELLIPSE: the upper half is hidden behind masonry, the lower half is not,
 * so the visible red always skews the apparent centre downward. Every "measured" correction I
 * derived was therefore short, which is exactly why each round moved it a little and never enough.
 * On this last capture the measurement said −0.084 and the truth was −0.21, a factor of 2.5.
 *
 * ⚠ SO DO NOT RE-DERIVE THIS FROM A SCREENSHOT. Measuring a partially occluded shape by its visible
 * pixels is the trap. If it ever needs retuning, change it by a relative step and ask.
 * * ⚠ KEPT AS A NAMED CONSTANT RATHER THAN DELETED, so the rule is legible and reversible — and so
 * the next session can see that 0 is a DECISION, not an omission.
 */
const ZONE_SINK = -0.52;

export class GroundDecalRenderer {
  /**
   * ⭐ S193 (V24) — ONE groundLayer child (`fog.spec.ts` index 1, now a Container), holding, in draw
   * order: the noise-textured STAIN sprites (the body of each mark) and the Graphics (the race
   * motifs; the whole S185 drawing on `?fx=legacy` / LOW).
   */
  private readonly root: Container;
  private readonly stains: Container;
  private readonly stainPool: Sprite[] = [];
  private stainsUsed = 0;
  private readonly graphics: Graphics;
  /**
   * ⛔⛔ S193 — **THE ONE FADE, MADE REAL.** The S185 ruling is *"they're not increasing in opacity …
   * it's not like the more zones, the more colour it has"*. A Container's (or a Graphics') `alpha`
   * in Pixi v8 is multiplied into each child's draw, so two overlapping soft stains at 0.34 each still
   * SUM where they overlap. An `AlphaFilter` composites the whole layer first and fades it once —
   * which is what the S185 comment intended. HIGH quality only (the substrate's rule: LOW runs no
   * filter pass), and LOW / legacy keep the S185 drawing exactly.
   */
  private readonly fade = new AlphaFilter({ alpha: GROUND_DECAL_ALPHA });
  private textured = false;

  constructor(app: Application, parent: Container = app.stage) {
    this.root = new Container();
    this.root.label = 'groundDecal';
    this.root.eventMode = 'none';
    this.stains = new Container();
    this.stains.eventMode = 'none';
    this.graphics = new Graphics();
    this.root.addChild(this.stains);
    this.root.addChild(this.graphics);
    parent.addChild(this.root);
  }

  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    this.stainsUsed = 0;
    this.textured = fxActive() && fxHighQuality();
    // the single fade that makes overlapping zones blend instead of darken
    if (this.textured) {
      g.alpha = 1;
      if (this.root.filters === null || this.root.filters === undefined || (this.root.filters as unknown[]).length === 0) this.root.filters = [this.fade];
    } else {
      g.alpha = GROUND_DECAL_ALPHA;
      if (this.root.filters !== null && this.root.filters !== undefined && (this.root.filters as unknown[]).length > 0) this.root.filters = null;
    }
    try {
      this.syncMarks(world);
    } finally {
      for (let i = this.stainsUsed; i < this.stainPool.length; i++) this.stainPool[i]!.visible = false;
    }
  }

  private syncMarks(world: World): void {
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
    /*
     * ⛔⛔ S185 — **THE RING, NOT THE COMPONENT — and `towerRenderer` says so in as many words.**
     *
     * Its own comment at the centroid reads *"Centroid of the RING, not of the component"*, and its
     * file docblock explains why: `ringMembersAt` returns exactly the nodes the recipe validated, so
     * the centre is the ring's own. I walked the whole COMPONENT instead, which sweeps in anything
     * else bonded to the structure and drags the centre off the building — the owner measured it as
     * *"too much to the right"*, 10.5 game px on his capture.
     *
     * ⭐ Using the same walk the sprite uses makes the two incapable of disagreeing, which is the
     * only reason the horizontal offset is gone rather than cancelled by a magic number.
     */
    const art = towerArtForRecipe(recipeId as GodlyId);
    /*
     * ⭐ S189 C2 (audit W2-1 / W5) — THE TOWER'S OWN MEMBERS FOR EVERY RECIPE, not only the race
     * rings. The non-race towers (turret, pentagram, goblin, hub, Helga, stink) fell back to the
     * whole COMPONENT, so a welded one centred its zone on the lattice and stood its feet under the
     * lowest welded shape — the S185 drift, back for exactly the towers that can now carry welds.
     * `towerFootprintAt` is the sim's own walk (for a race ring, its own cycle).
     */
    const footprint = towerFootprintAt(world, recipeId as GodlyId, anchor.id);
    if (footprint === null) return;
    const comp = { primitiveIds: footprint.prims };
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
    const feetY = art !== null
      ? cy + art.sizePx * (0.5 + ZONE_SINK)
      : maxY + (maxX - minX) * 0.5 * ZONE_SINK;

    // the zone spreads well past the building, so neighbours read as one settled area
    const hullHW = Math.max(28, (maxX - minX) / 2, art !== null ? art.sizePx * 0.5 : 0);
    const hw = hullHW * ZONE_SPREAD;
    const hh = hw * 0.62;

    if (this.textured) this.stain(race, id, cx, feetY, hw, hh * 0.34);
    drawRaceGround(
      this.graphics as unknown as GroundTarget,
      race, id, cx, feetY, hw, hh, world.tick,
      { skipBase: this.textured },
    );
  }

  /** One stain sprite covering the S185 ellipse (half-extents `rx`, `ry`), at alpha 1. */
  private stain(race: RaceId, id: number, cx: number, cy: number, rx: number, ry: number): void {
    const pick = groundStainPick(id);
    let sp = this.stainPool[this.stainsUsed];
    if (sp === undefined) {
      sp = new Sprite();
      sp.anchor.set(0.5);
      sp.eventMode = 'none';
      this.stainPool.push(sp);
      this.stains.addChild(sp);
    }
    this.stainsUsed++;
    const tex = groundStainTexture(race, pick.variant);
    if (sp.texture !== tex) sp.texture = tex;
    sp.visible = true;
    sp.position.set(cx, cy);
    // Set from the texture size directly (a `width` setter keeps the old sign, and the pool is reused).
    sp.scale.set(((pick.flip ? -1 : 1) * rx * 2 * GROUND_STAIN_SCALE) / GROUND_STAIN_TEX_W, (ry * 2 * GROUND_STAIN_SCALE) / GROUND_STAIN_TEX_H);
  }

  clear(): void {
    this.graphics.clear();
    for (const sp of this.stainPool) sp.visible = false;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
