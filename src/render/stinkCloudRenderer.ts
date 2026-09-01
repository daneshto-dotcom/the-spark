/**
 * SPARK — S158 P6 (CF-S157-b): **the landed stink bag, finally drawn.**
 *
 * S157 built the art — a 12-frame atlas at `public/godly/stink-bag/anim/`, matching the owner's own
 * hanging-bag design — and shipped it with **zero references anywhere in `src/`**. This is the
 * renderer that gives it a job, over the entity added in the same priority.
 *
 * ## Two layers, and why the vector one is not optional
 *
 * 1. A **vector haze** — a soft green disc at the cloud's true damage radius, drawn every frame.
 * 2. The **atlas sprite** on top, once it loads.
 *
 * The haze is not decoration. A stink cloud is an invisible damage field; a player who cannot see
 * its EDGE cannot tell whether stepping there costs them a unit, and the bag sprite is a 128 px
 * picture that says nothing about a 90 px radius. Drawing the actual radius is the difference
 * between a hazard and an ambush. It is also the fallback: if the atlas fails to fetch on some peer,
 * that peer still sees exactly where the ground is foul — the same "never invisible" rule
 * `goblinRenderer` holds for its procedural puppet, and for the same reason.
 *
 * ## Determinism is not a concern here, and that IS worth stating
 *
 * Nothing in this file feeds the sim. The frame index comes from `world.tick - landedAtTick`, so two
 * peers watching the same cloud still see the same frame — not because they must, but because the
 * synced state is right there and a `performance.now()` cursor would have made the animation drift
 * between screens for no gain.
 */

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  stinkCloudProgress,
  type StinkCloud,
} from '../state/defenders/stinkCloud.ts';
import type { StinkCloudId } from '../types.ts';
import type { World } from '../state/worldTypes.ts';

/** The atlas S157 built and nothing drew. Same manifest format as Helga and the goblins. */
const ATLAS_BASE = '/godly/stink-bag/anim/stink-bag';

interface AtlasManifest {
  cellW: number;
  cellH: number;
  footAnchor: { x: number; y: number };
  states: Record<string, { row: number; frames: number; ticksPerFrame: number }>;
}

/** Sized so the bag reads as an object ON the ground rather than a billboard standing in it. */
const SPRITE_SCALE = 0.34;

/** Haze fill/stroke. Deliberately sickly — this is a smell you are meant to avoid. */
const HAZE_COLOR = 0x7fa63a;
const HAZE_FILL_ALPHA = 0.16;
const HAZE_LINE_ALPHA = 0.42;

/**
 * The last fifth of a cloud's life fades out. A hazard that vanishes at full strength teaches the
 * player nothing; one that visibly thins tells them the ground is about to be safe, which is the
 * information that makes it a tactical object rather than a trap.
 */
const FADE_FROM = 0.8;

export class StinkCloudRenderer {
  private readonly haze: Graphics;
  private readonly spriteLayer: Container;
  private readonly sprites = new Map<StinkCloudId, Sprite>();
  private frames: Texture[] | null = null;
  private manifest: AtlasManifest | null = null;
  private loadStarted = false;

  constructor(app: Application, parent: Container = app.stage) {
    this.haze = new Graphics();
    parent.addChild(this.haze);
    this.spriteLayer = new Container();
    parent.addChild(this.spriteLayer);
    void app;
  }

  /**
   * One-time lazy atlas load. Failure is deliberately silent and NOT fatal: the haze below keeps
   * every cloud visible and readable on its own, so a peer that cannot fetch the png still plays the
   * same game — it just plays it with less charm.
   */
  private ensureAtlas(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    void (async () => {
      try {
        const manifest = (await (await fetch(`${ATLAS_BASE}-anim.json`)).json()) as AtlasManifest;
        const tex = (await Assets.load(`${ATLAS_BASE}-atlas.png`)) as Texture;
        const idle = manifest.states.idle;
        if (idle === undefined) return;
        const frames: Texture[] = [];
        for (let i = 0; i < idle.frames; i++) {
          frames.push(new Texture({
            source: tex.source,
            frame: new Rectangle(
              i * manifest.cellW, idle.row * manifest.cellH, manifest.cellW, manifest.cellH,
            ),
          }));
        }
        this.manifest = manifest;
        this.frames = frames;
      } catch {
        // The haze carries the whole feature without it.
      }
    })();
  }

  /** Clear + redraw every live cloud. Cheap no-op when there are none. */
  sync(world: World): void {
    this.haze.clear();
    if (world.stinkClouds.size === 0) {
      // ⚠ Sprites are reaped HERE as well as in the loop below, or a cloud that expired on a frame
      // when the map emptied would leave its bag on the ground forever.
      this.reapAllSprites();
      return;
    }
    this.ensureAtlas();

    const live = new Set<StinkCloudId>();
    for (const c of world.stinkClouds.values()) {
      live.add(c.id);
      const t = stinkCloudProgress(c, world.tick);
      const fade = t <= FADE_FROM ? 1 : 1 - (t - FADE_FROM) / (1 - FADE_FROM);
      this.drawHaze(c, fade);
      this.syncSprite(c, world.tick, fade);
    }

    for (const [id, sp] of this.sprites) {
      if (live.has(id)) continue;
      sp.destroy();
      this.sprites.delete(id);
    }
  }

  /** The damage footprint, drawn at its TRUE radius so the edge is a thing the player can read. */
  private drawHaze(c: StinkCloud, fade: number): void {
    this.haze
      .circle(c.pos.x, c.pos.y, c.radius)
      .fill({ color: HAZE_COLOR, alpha: HAZE_FILL_ALPHA * fade })
      .stroke({ width: 2, color: HAZE_COLOR, alpha: HAZE_LINE_ALPHA * fade });
  }

  private syncSprite(c: StinkCloud, tick: number, fade: number): void {
    const frames = this.frames;
    const manifest = this.manifest;
    if (frames === null || manifest === null || frames.length === 0) return;
    const per = Math.max(1, manifest.states.idle?.ticksPerFrame ?? 15);
    // Age-driven, so every peer showing this cloud shows the same frame. `landedAtTick` is synced.
    const i = Math.floor(Math.max(0, tick - c.landedAtTick) / per) % frames.length;

    let sp = this.sprites.get(c.id);
    if (sp === undefined) {
      sp = new Sprite();
      sp.anchor.set(manifest.footAnchor.x, manifest.footAnchor.y);
      this.spriteLayer.addChild(sp);
      this.sprites.set(c.id, sp);
    }
    sp.texture = frames[i]!;
    sp.position.set(c.pos.x, c.pos.y);
    sp.scale.set(SPRITE_SCALE, SPRITE_SCALE);
    sp.alpha = fade;
  }

  private reapAllSprites(): void {
    if (this.sprites.size === 0) return;
    for (const sp of this.sprites.values()) sp.destroy();
    this.sprites.clear();
  }

  destroy(): void {
    this.reapAllSprites();
    this.haze.destroy();
    this.spriteLayer.destroy();
  }
}
