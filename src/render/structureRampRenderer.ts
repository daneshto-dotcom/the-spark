/**
 * SPARK — S182 — **THE DAMAGE-RAMP RENDERER. Generic over `RAMP_SPECS`; wired once.**
 *
 * The Pixi half of `structureRamp.ts`. Every decision it makes is in that module and runs in vitest;
 * this file is the part that cannot be, and it is deliberately thin.
 *
 * ⭐ **IT IS GENERIC ON PURPOSE, AND THE OWNER IS THE REASON.** He has art waiting for the goblins,
 * the pencil chewer, the pentagram and the laser turret, and he is holding it back until he has seen
 * one work. So the second tower must cost a table row, not a file. It does: this renderer never
 * names the lightning hub.
 *
 * ## THE TWO GATES A NEW RENDERER IN THIS PROJECT OWES, both copied from `voltkinTowerRenderer`
 *
 *   · **the fog gate** — an enemy building is not drawn unless it is in live vision;
 *   · **the `manifest === null` bail** — while the atlas is loading, or after it failed, the
 *     structure's own shapes stay fully visible and the board degrades to exactly what it looked
 *     like before this feature. ⛔ Which is also why `markTowerCover` is called at the point the
 *     sprite is COMMITTED and never earlier: a tower hidden under a sprite that is not being drawn
 *     is a blank patch of board.
 *
 * ## ⭐ THE CURSOR, AND WHY IT IS SAFE
 *
 * `rampCursors` is CLIENT-LOCAL. It is the play-through position R182-D asks for, nothing in the sim
 * reads it, and two peers a beat apart on an animation is invisible — where putting it on the wire
 * would cost a PROTOCOL bump for a puff of smoke. Same reasoning, same shape, as the Voltkin TV's
 * `destroyedAt` / `dying` maps; and like those it is empty on a reload or for a joiner, so a hub that
 * was already hurt when you arrived is drawn at its correct frame immediately rather than animating
 * its whole history at you. That is `seedCursor` below.
 *
 * ⚠ **THE HEALTH ITSELF IS NOT CLIENT-LOCAL AND MUST NOT BE.** It comes from `starHealthFrac`, which
 * both peers and the sim compute identically from `Bond.damageFifths` — already serialized, already
 * hashed. The cursor animates toward a synced target; it never invents one.
 */
import { Application, Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { BondId, PrimitiveId } from '../types.ts';
import { starHealthFrac } from '../state/structureStarHealth.ts';
import { isConcealed } from './concealment.ts';
import { markTowerCover } from './towerCover.ts';
import { TOWER_SPRITE_ANCHOR } from './towerFrames.ts';
import {
  advanceRampCursor, rampCell, rampFrameForHealth, rampSpecFor,
  type RampCursor, type RampSpec,
} from './structureRamp.ts';

interface RowMeta { readonly row: number; readonly frames: number; readonly ticksPerFrame: number }
interface Manifest {
  readonly cellW: number;
  readonly cellH: number;
  readonly footAnchor: { readonly x: number; readonly y: number };
  readonly states: Readonly<Record<string, RowMeta | undefined>>;
}

/**
 * ⭐ HOW LONG THE WRECKAGE LINGERS after the last frame, in ticks.
 *
 * Finite, and for a sharper reason than the Voltkin TV's: when a hub self-destructs the sim RAZES
 * its component, so there is nothing left underneath for the sprite to misrepresent — but a ruins
 * sprite held forever would sit on ground a player can immediately rebuild on. 0.7 s is long enough
 * to read the wreck and short enough to be gone before the rebuild.
 *
 * ⚠ MINE, not the owner's.
 */
export const RAMP_RUINS_HOLD_TICKS = 42;

/** A structure that has left the world but whose collapse is still playing out on THIS peer. */
interface Ghost {
  readonly x: number;
  readonly y: number;
  readonly spec: RampSpec;
  /** The tick after which the sprite is released. */
  readonly untilTick: number;
  cursor: RampCursor;
}

export class StructureRampRenderer {
  readonly layer = new Container();
  private readonly sprites = new Map<string, Sprite>();
  private readonly cursors = new Map<string, RampCursor>();
  private readonly ghosts = new Map<string, Ghost>();
  private readonly lastSeen = new Map<string, { x: number; y: number; spec: RampSpec }>();
  /** One loader per atlas base, so a table with six towers fetches six sheets and no sheet twice. */
  private readonly loadStarted = new Set<string>();
  private readonly sheets = new Map<string, Texture>();
  private readonly manifests = new Map<string, Manifest>();
  /** Cut textures, keyed `base:state:col`. Cutting is cheap but not free, and `sync` runs per frame. */
  private readonly cells = new Map<string, Texture>();

  constructor(_app: Application, parent: Container) {
    parent.addChild(this.layer);
  }

  private ensureAtlas(base: string): void {
    if (this.loadStarted.has(base)) return;
    this.loadStarted.add(base);
    void (async () => {
      try {
        const manifest = (await (await fetch(`${base}-anim.json`)).json()) as Manifest;
        const sheet = (await Assets.load(`${base}-atlas.png`)) as Texture;
        this.sheets.set(base, sheet);
        this.manifests.set(base, manifest);
      } catch {
        // Left absent and never retried — see the load-failure contract in the file docblock.
        this.sheets.delete(base);
        this.manifests.delete(base);
      }
    })();
  }

  private frameTexture(spec: RampSpec, frame: number): Texture | null {
    const sheet = this.sheets.get(spec.atlasBase);
    const manifest = this.manifests.get(spec.atlasBase);
    if (sheet === undefined || manifest === undefined) return null;
    const { state, col } = rampCell(frame, spec);
    const key = `${spec.atlasBase}:${state}:${col}`;
    const hit = this.cells.get(key);
    if (hit !== undefined) return hit;
    const meta = manifest.states[state];
    if (meta === undefined) return null;
    const c = Math.min(Math.max(0, col), Math.max(0, meta.frames - 1));
    const tex = new Texture({
      source: sheet.source,
      frame: new Rectangle(c * manifest.cellW, meta.row * manifest.cellH, manifest.cellW, manifest.cellH),
    });
    this.cells.set(key, tex);
    return tex;
  }

  /**
   * Place and draw one sprite.
   *
   * ⭐ **OFFSET BY THE ART AND BY THE MANIFEST'S FOOT, NOT BY THE BOX.** The bottom anchor puts the
   * sprite BOX's base at `y`, and the drawn building's ground line is at `footAnchor.y` of that box
   * — this sheet deliberately leaves rows of cell below the ground line so the soft fade under the
   * rubble survives. Ignoring that hovers the tower above its own shapes, which is the S178 Voltkin
   * defect exactly. Half the ART then straddles the centroid, the way every other tower here sits.
   *
   * ⛔ **AND THE ART SIZE COMES FROM THE SPEC, NEVER FROM A NAMED TOWER'S CONSTANT.** This read
   * `HUB_ART_PX` in its first draft — correct for the one entry in the table today and silently
   * wrong for every tower the owner presents next, which would have made this renderer generic in
   * shape and hub-specific in behaviour. `structureRamp.test.ts` pins that every spec carries both.
   */
  private place(sprite: Sprite, spec: RampSpec, tex: Texture, cx: number, cy: number): void {
    const footY = this.manifests.get(spec.atlasBase)?.footAnchor.y ?? 1;
    sprite.texture = tex;
    sprite.width = spec.spritePx;
    sprite.height = spec.spritePx;
    sprite.x = cx;
    sprite.y = cy + spec.artPx * 0.5 + (1 - footY) * spec.spritePx;
  }

  /**
   * First sight of a structure: start the cursor AT its current damage rather than at frame 1.
   *
   * ⛔ Without this a joiner — or anyone who tabs back after a reload — watches every standing hub on
   * the board play its whole damage history from pristine. The ramp is for damage arriving NOW.
   */
  private seedCursor(key: string, target: number, tick: number): RampCursor {
    const had = this.cursors.get(key);
    if (had !== undefined) return had;
    const seeded = { frame: target, sinceTick: tick };
    this.cursors.set(key, seeded);
    return seeded;
  }

  sync(world: World): void {
    if (world.creatureSpawners.size === 0 && this.sprites.size === 0) return;

    const live = new Set<string>();
    for (const sp of world.creatureSpawners.values()) {
      const spec = rampSpecFor(sp.recipeId);
      if (spec === null) continue; // the twelve towers with no ramp art — drawn by towerRenderer
      this.ensureAtlas(spec.atlasBase);

      const hub = world.primitives.get(sp.anchorPrimitiveId);
      if (hub === undefined) continue;
      // Fog: the same test, on the same field, that every other structure renderer applies.
      if (isConcealed(hub.pos.x, hub.pos.y, hub.placedBy)) continue;
      if (!this.manifests.has(spec.atlasBase)) continue; // loading, or failed — shapes stay bare

      // The star's centroid: the hub and the leaves its OWN bonds reach. Same walk `isStarAt` does,
      // so the sprite stands on exactly the shape the recipe recognised.
      const members: PrimitiveId[] = [sp.anchorPrimitiveId];
      const bonds: BondId[] = [];
      let cx = hub.pos.x;
      let cy = hub.pos.y;
      let n = 1;
      let newestTick = 0;
      for (const bondId of hub.bonds) {
        const bond = world.bonds.get(bondId);
        if (bond === undefined) continue;
        const leafId = bond.aId === sp.anchorPrimitiveId ? bond.bId : bond.aId;
        const leaf = world.primitives.get(leafId);
        if (leaf === undefined) continue;
        members.push(leafId);
        bonds.push(bondId);
        cx += leaf.pos.x;
        cy += leaf.pos.y;
        n++;
        if (bond.createdTick > newestTick) newestTick = bond.createdTick;
      }
      cx /= n;
      cy /= n;

      const key = `s${Number(sp.id)}`;
      const frac = starHealthFrac(world, sp.anchorPrimitiveId);
      const target = rampFrameForHealth(frac ?? 1, spec.frames);
      const cursor = advanceRampCursor(this.seedCursor(key, target, world.tick), target, world.tick, spec);
      this.cursors.set(key, cursor);

      const tex = this.frameTexture(spec, cursor.frame);
      if (tex === null) continue;
      let sprite = this.sprites.get(key);
      if (sprite === undefined) {
        sprite = new Sprite();
        sprite.anchor.set(TOWER_SPRITE_ANCHOR.x, TOWER_SPRITE_ANCHOR.y);
        this.layer.addChild(sprite);
        this.sprites.set(key, sprite);
      }
      this.place(sprite, spec, tex, cx, cy);

      // Declared HERE, after the sprite is committed — never above the fog skip or the atlas bail.
      markTowerCover(members, bonds, newestTick);
      this.lastSeen.set(key, { x: cx, y: cy, spec });
      live.add(key);
    }

    /*
     * ⭐ A STRUCTURE THAT LEFT THE WORLD PLAYS ITS COLLAPSE OUT WHERE IT STOOD.
     *
     * ⛔ AND FOR THIS RAMP THAT IS NOT A NICETY, IT IS THE ONLY WAY THE LAST THIRD OF THE SHEET IS
     * EVER SEEN. Frames 17-24 are reachable only BELOW the self-destruct threshold, and crossing
     * that threshold is precisely what makes the host dispatch the blast, remove the spawner and
     * raze the star — all in the same tick. Without a ghost the hub would vanish at frame 16 and the
     * eight frames of collapse the owner commissioned would never draw. Same defect, same fix, as
     * S177 P4 on the Voltkin TV.
     *
     * ⚠ FIGHT-GATED, so scrapping your own tower in BUILD does not detonate it on screen. A
     * structure taken apart deliberately is not a destruction.
     */
    for (const key of this.sprites.keys()) {
      if (live.has(key) || this.ghosts.has(key)) continue;
      if (world.matchPhase !== 'FIGHT') continue;
      const at = this.lastSeen.get(key);
      if (at === undefined) continue;
      const cursor = this.cursors.get(key) ?? { frame: 1, sinceTick: world.tick };
      const toPlay = Math.max(0, at.spec.frames - cursor.frame);
      this.ghosts.set(key, {
        x: at.x,
        y: at.y,
        spec: at.spec,
        untilTick: world.tick + toPlay * at.spec.ticksPerFrame + RAMP_RUINS_HOLD_TICKS,
        cursor: { frame: cursor.frame, sinceTick: world.tick },
      });
    }

    for (const [key, ghost] of [...this.ghosts]) {
      const sprite = this.sprites.get(key);
      if (sprite === undefined || world.tick >= ghost.untilTick) {
        this.ghosts.delete(key);
        continue;
      }
      ghost.cursor = advanceRampCursor(ghost.cursor, ghost.spec.frames, world.tick, ghost.spec);
      const tex = this.frameTexture(ghost.spec, ghost.cursor.frame);
      if (tex === null) { this.ghosts.delete(key); continue; }
      this.place(sprite, ghost.spec, tex, ghost.x, ghost.y);
      live.add(key); // keep it off the reaper for one more frame
    }

    for (const [key, sprite] of this.sprites) {
      if (live.has(key)) continue;
      sprite.destroy();
      this.sprites.delete(key);
      this.cursors.delete(key);
      this.lastSeen.delete(key);
      this.ghosts.delete(key);
    }
  }

  /** Drop every sprite — title-return, the same contract as the other renderers. */
  clear(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.cursors.clear();
    this.ghosts.clear();
    this.lastSeen.clear();
  }
}
