/**
 * SPARK — fog-of-war renderer (S57 P1). Blueprint § III.4 / § X.4 / § XII.3.
 *
 * Client-side cosmetic fog. Council R1 CONVERGED design: Option A — a
 * RenderTexture "visibility mask" composed each frame from an opaque dark base
 * minus soft-edged ERASE-brush cutouts at the local player's vision sources.
 * The mask is shown as a single Sprite over the world layer; its alpha is
 * tweened to 0 on WIN so the fog LIFTS and every structure is revealed.
 *
 * Why this technique (vs a GLSL filter): the codebase's one custom shader
 * (CinematicLumaKeyFilter) had a silent-compile-failure history (S29 P0), so
 * both Council models VETOED a fog shader. This path is pure scenegraph —
 * failure modes are visible, and the only non-portable call (the radial brush)
 * is built with Canvas2D, not the v7-removed Graphics gradient API.
 *
 * Pixi v8.18.1 specifics verified against node_modules before writing:
 *   - blend mode is the STRING 'erase' (not BLEND_MODES.* / DST_OUT)
 *   - renderer.render({ container, target, clear }) object signature
 *   - RenderTexture.create({ width, height, resolution })
 *
 * The vision MATH lives in state/vision.ts (pure, unit-tested). This file is
 * the un-unit-testable GPU half; it is verified live in the preview.
 */

import { Application, Container, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  EXPLORED_GRID_COLS,
  EXPLORED_GRID_ROWS,
  MEMORY_FOG_COLOR,
  MEMORY_GHOST_ALPHA,
  VISION_FADE_PX,
} from '../constants.ts';
import {
  computeVisionSources,
  fogTargetAlpha,
  isPointVisible,
  stepFogAlpha,
  type VisionSource,
} from '../state/vision.ts';
import {
  makeExploredGrid,
  makeGhostMemory,
  markVisible,
  resetExploredGrid,
  resetGhostMemory,
  updateGhostMemory,
  type ExploredGrid,
  type GhostMemory,
} from '../state/exploredMemory.ts';
import { destroyShapeTextures, makeShapeTextures, type ShapeTextures } from './shapes.ts';
import type { World } from '../state/world.ts';
import type { PrimitiveId, Vec2 } from '../types.ts';

/** Fogged-area colour. Near-black with a faint cool tint (reads as fog, not void). */
const FOG_COLOR = 0x05070d;
/** Radius (px) of the one-time radial-gradient brush texture. */
const BRUSH_TEX_RADIUS = 128;
/**
 * The fog mask is low-frequency (soft, blurry edges), so it is composed at a
 * fraction of screen resolution and upscaled by the display sprite. Cuts the
 * per-frame fill cost ~4x — decisive under software WebGL (swiftshader CI nearly
 * halved the sim rate at full res) and a real win for mobile battery (a Grok
 * Council concern). Imperceptible: the VISION_FADE band stays smooth under the
 * bilinear upscale.
 */
const MASK_SCALE = 0.5;
/**
 * Recompose the mask every Nth frame only. The mask is low-frequency, so ~20Hz
 * (every 3rd frame at 60fps) is visually identical — the cursor hole lags <=50ms,
 * hidden by the soft fade — while cutting the per-frame render-PASS overhead
 * (RT bind / state flush, the dominant cost under software WebGL) by 3x. The
 * alpha tween still runs every frame, so the win-lift stays perfectly smooth.
 */
const MASK_RENDER_EVERY = 3;
/** Win-lift: full fog dissolves to clear in ~1s (alpha units per second). */
const FOG_FADE_PER_SECOND = 1.0;
/** Clamp the per-frame fade delta so a stalled tab doesn't snap the reveal. */
const MAX_FRAME_DT_SECONDS = 0.1;
/** Below this alpha the fog is effectively gone — stop rendering the pass. */
const ALPHA_EPSILON = 0.002;

export class FogRenderer {
  /** Public for tests/inspection; added to app.stage in the constructor. */
  readonly container: Container;

  private readonly renderer: Renderer;
  private readonly maskRT: RenderTexture;
  /** Offscreen scene rendered INTO maskRT: [opaque base, ...erase brushes]. Never on stage. */
  private readonly maskScene: Container;
  private readonly brushTex: Texture;
  private readonly pool: Sprite[] = [];
  private readonly fogSprite: Sprite;
  /**
   * E2E seam (mirror of __TEST_SPAWN_RATE__ / __TEST_WIN_SCORE__): the 2-peer
   * gameplay smoke specs disable fog so the extra per-frame render pass doesn't
   * slow the software-WebGL (swiftshader) sim and perturb their spawn-timing
   * windows. Fog rendering itself is covered by e2e/fog.spec.ts. Read once at
   * construction (the seam is set via addInitScript before the bundle loads).
   * Production: window undefined / flag absent → false.
   */
  private readonly disabled: boolean;
  private alpha = 0;
  private maskFrameCounter = 0;

  // S59 P1 — "remembered areas" memory. The coarse explored grid (pure, in
  // state/exploredMemory.ts) is rasterized into a tiny canvas-backed texture and
  // composited into the SAME mask as an OPAQUE lighter-colour overlay (normal
  // blend) over explored cells, between the dark base and the full-erase live
  // brushes → 3 tiers (dark / dim / clear) in one overlay, with NO live-board leak.
  private readonly grid: ExploredGrid = makeExploredGrid();
  private readonly gridCanvas: HTMLCanvasElement;
  private readonly gridCtx: CanvasRenderingContext2D;
  private readonly gridImageData: ImageData;
  private readonly gridTex: Texture;
  private readonly gridSprite: Sprite;
  private gridNeedsRedraw = true;
  /** Tracks the PLAYING edge so remembered areas reset at the start of each match. */
  private wasActive = false;

  // S60 P2 — last-seen ENEMY-structure memory. A CPU Map of where each enemy
  // structure was last seen (state/exploredMemory.ts) drives dim silhouette sprites in
  // `memoryLayer`, a Container added to the stage ABOVE the fog container. Each ghost is
  // shown ONLY where its structure is currently OUT of live vision (a per-sprite
  // isPointVisible gate); in vision the real structure shows through the erased fog. The
  // layer's alpha mirrors the fog alpha so the silhouettes dissolve with the win-lift.
  private readonly memory: GhostMemory = makeGhostMemory();
  private readonly memoryLayer: Container;
  private readonly ghostTextures: ShapeTextures;
  private readonly ghostSprites: Map<PrimitiveId, Sprite> = new Map();

  constructor(app: Application) {
    this.renderer = app.renderer;
    this.disabled =
      (globalThis as { __FOG_DISABLE__?: boolean }).__FOG_DISABLE__ === true;
    this.brushTex = makeRadialBrushTexture(BRUSH_TEX_RADIUS);

    // Low-res mask texture (resolution 1 — DPI is irrelevant for a blurry mask).
    this.maskRT = RenderTexture.create({
      width: Math.round(CANVAS_WIDTH * MASK_SCALE),
      height: Math.round(CANVAS_HEIGHT * MASK_SCALE),
      resolution: 1,
    });

    // Full-screen opaque fog base. Drawn FIRST in maskScene so the erase brushes
    // (added after) punch soft transparent holes through it. Base + brushes are
    // authored in WORLD coordinates; the container's MASK_SCALE maps them into
    // the smaller mask texture, so sync()'s brush positioning stays world-space.
    const base = new Sprite(Texture.WHITE);
    base.width = CANVAS_WIDTH;
    base.height = CANVAS_HEIGHT;
    base.tint = FOG_COLOR;

    this.maskScene = new Container();
    this.maskScene.scale.set(MASK_SCALE);
    this.maskScene.addChild(base);

    // S59 P1 — the memory overlay, ABOVE the dark base and BELOW the live brushes
    // (added later by ensurePool). A tiny cols×rows canvas (one texel per grid
    // cell) is bilinear-upscaled to board size; explored texels carry the opaque
    // MEMORY_FOG_COLOR (normal blend) so scouted areas read as a dim shade —
    // OPAQUE, so the live board never shows through (no M1 leak). The live brushes
    // erase fully on top, and live ⊆ explored, so they cleanly cut clear holes.
    this.gridCanvas = document.createElement('canvas');
    this.gridCanvas.width = EXPLORED_GRID_COLS;
    this.gridCanvas.height = EXPLORED_GRID_ROWS;
    const gridCtx = this.gridCanvas.getContext('2d');
    if (gridCtx === null) throw new Error('FogRenderer: 2D context unavailable for memory grid');
    this.gridCtx = gridCtx;
    this.gridImageData = gridCtx.createImageData(EXPLORED_GRID_COLS, EXPLORED_GRID_ROWS);
    this.gridTex = Texture.from(this.gridCanvas);
    // (Pixi v8 default scaleMode is 'linear' → the tiny grid texture upscales
    //  bilinearly, smoothing the coarse cells on the dim tier.)
    this.gridSprite = new Sprite(this.gridTex);
    this.gridSprite.width = CANVAS_WIDTH;
    this.gridSprite.height = CANVAS_HEIGHT;
    this.maskScene.addChild(this.gridSprite);

    // Displayed layer: the low-res mask upscaled to full screen (bilinear-smooth).
    // Alpha = fog strength (tweened for the win-lift).
    this.fogSprite = new Sprite(this.maskRT);
    this.fogSprite.width = CANVAS_WIDTH;
    this.fogSprite.height = CANVAS_HEIGHT;
    this.fogSprite.eventMode = 'none'; // never intercept clicks

    this.container = new Container();
    this.container.eventMode = 'none';
    this.container.visible = false;
    this.container.addChild(this.fogSprite);
    app.stage.addChild(this.container);

    // S60 P2 — memory layer, added to the stage AFTER the fog container so it sits
    // ABOVE it (and below the HUD, which main.ts constructs after FogRenderer). Whether
    // a given ghost shows is gated per-sprite in syncGhostSprites (visible only where
    // its structure is NOT in current live vision), reusing the same isPointVisible()
    // as the memory update. (An earlier Sprite(maskRT) GPU mask was dropped: a Pixi
    // sprite mask attenuates by the mask's brightness, and the fog mask is near-black,
    // so it crushed the silhouettes to ~5% — caught by the pixel e2e.)
    this.ghostTextures = makeShapeTextures(app);
    this.memoryLayer = new Container();
    this.memoryLayer.eventMode = 'none';
    this.memoryLayer.visible = false;
    app.stage.addChild(this.memoryLayer);
  }

  /**
   * Per render frame. `localCursor` is the live local cursor (personal-vision
   * centre); `dtSeconds` is the frame delta (drives the win-lift fade).
   */
  sync(world: World, localCursor: Vec2, dtSeconds: number): void {
    if (this.disabled) return; // container stays hidden (E2E gameplay specs)
    const target = fogTargetAlpha(world);
    // S59 P1 — wipe remembered areas at the start of each match (the PLAYING edge),
    // so a new game never inherits the previous match's explored map.
    if (target > 0 && !this.wasActive) {
      resetExploredGrid(this.grid);
      this.gridNeedsRedraw = true;
      this.resetMemory(); // S60 P2 — a new match must not inherit the last match's ghosts
    }
    this.wasActive = target > 0;
    const fadeStep =
      FOG_FADE_PER_SECOND * Math.max(0, Math.min(dtSeconds, MAX_FRAME_DT_SECONDS));
    this.alpha = stepFogAlpha(this.alpha, target, fadeStep);

    // Fully lifted / inactive → hide and skip the offscreen pass (zero cost in solo).
    if (this.alpha <= ALPHA_EPSILON) {
      this.container.visible = false;
      this.memoryLayer.visible = false;
      this.maskFrameCounter = 0; // force an immediate recompose on re-activation
      return;
    }
    this.container.visible = true;
    this.fogSprite.alpha = this.alpha;
    // S60 P2 — the memory layer rides the same fade as the fog so remembered
    // silhouettes dissolve in lockstep on the win-lift (and snap on at match start).
    this.memoryLayer.visible = true;
    this.memoryLayer.alpha = this.alpha;

    // Throttle the expensive mask recompose (~20Hz). The alpha tween above runs
    // every frame, so this never affects win-lift smoothness. Frame 0 after
    // activation always composes (counter reset to 0 on hide).
    const due = this.maskFrameCounter % MASK_RENDER_EVERY === 0;
    this.maskFrameCounter += 1;
    if (!due) return;

    const sources = computeVisionSources(world, localCursor);
    // S59 P1 — accumulate explored cells; only re-upload the grid texture when the
    // explored set actually grew (most ticks it doesn't) — keeps the sim canary happy.
    if (markVisible(this.grid, sources) || this.gridNeedsRedraw) {
      this.redrawGridTexture();
      this.gridNeedsRedraw = false;
    }
    // S60 P2 — advance the last-seen enemy-structure memory + reconcile its ghost
    // sprites at the same ~20Hz cadence (cheap: O(structures + ghosts)).
    updateGhostMemory(this.memory, world.primitives, sources, world.localPlayerId, world.tick);
    this.syncGhostSprites(sources);
    this.ensurePool(sources.length);
    for (let i = 0; i < this.pool.length; i++) {
      const brush = this.pool[i];
      if (i < sources.length) {
        const src = sources[i];
        brush.visible = true;
        brush.position.set(src.x, src.y);
        // Map the brush's BRUSH_TEX_RADIUS to (radius + fade) so the soft band
        // lands OUTSIDE the nominal radius — the full radius stays fully revealed.
        brush.scale.set((src.radius + VISION_FADE_PX) / BRUSH_TEX_RADIUS);
      } else {
        brush.visible = false;
      }
    }

    // Compose the mask: opaque fog base minus soft holes → opaque-where-fogged.
    // clear:true is non-negotiable — without it, prior-frame cutouts persist as
    // a vision trail, leaking where the cursor/structures have been.
    this.renderer.render({ container: this.maskScene, target: this.maskRT, clear: true });
  }

  /** Grow the erase-brush pool so EVERY own primitive gets a beacon (no unrendered own units). */
  private ensurePool(n: number): void {
    while (this.pool.length < n) {
      const brush = new Sprite(this.brushTex);
      brush.anchor.set(0.5);
      brush.blendMode = 'erase';
      brush.visible = false;
      this.pool.push(brush);
      this.maskScene.addChild(brush);
    }
  }

  /**
   * S59 P1 — re-rasterize the explored grid into its texture: explored texels →
   * opaque MEMORY_FOG_COLOR, unexplored → fully transparent (so the dark base
   * shows). Bilinear upscale (linear scaleMode) smooths the coarse cells.
   */
  private redrawGridTexture(): void {
    const cells = this.grid.cells;
    const data = this.gridImageData.data;
    const r = (MEMORY_FOG_COLOR >> 16) & 0xff;
    const g = (MEMORY_FOG_COLOR >> 8) & 0xff;
    const b = MEMORY_FOG_COLOR & 0xff;
    for (let i = 0; i < cells.length; i++) {
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = cells[i] === 1 ? 255 : 0;
    }
    this.gridCtx.putImageData(this.gridImageData, 0, 0);
    this.gridTex.source.update();
  }

  /**
   * S60 P2 — reconcile the dim silhouette sprite pool against the last-seen Map:
   * spawn a sprite for a newly-remembered structure, keep its tint synced (Phase-2
   * Steal recolours), reposition to the last-seen point, and drop sprites whose
   * structure was forgotten. WHERE each ghost actually paints is gated by the
   * memoryLayer's alpha mask (live holes hide it); this only maintains the pool.
   */
  private syncGhostSprites(sources: readonly VisionSource[]): void {
    for (const ghost of this.memory.values()) {
      let sprite = this.ghostSprites.get(ghost.id);
      if (sprite === undefined) {
        sprite = new Sprite(this.ghostTextures[ghost.type]);
        sprite.anchor.set(0.5);
        sprite.eventMode = 'none';
        sprite.alpha = MEMORY_GHOST_ALPHA;
        this.memoryLayer.addChild(sprite);
        this.ghostSprites.set(ghost.id, sprite);
      }
      if (sprite.tint !== ghost.color) sprite.tint = ghost.color;
      sprite.position.set(ghost.pos.x, ghost.pos.y);
      // Show the silhouette ONLY where the structure is currently out of live vision;
      // in vision the real structure shows (the fog is erased there), so hide the ghost.
      sprite.visible = !isPointVisible(sources, ghost.pos.x, ghost.pos.y);
    }
    if (this.ghostSprites.size > this.memory.size) {
      for (const [id, sprite] of this.ghostSprites) {
        if (!this.memory.has(id)) {
          sprite.destroy(); // shared ghostTextures NOT freed (no { texture: true })
          this.ghostSprites.delete(id);
        }
      }
    }
  }

  /**
   * S60 P2 — forget all remembered structures + free their silhouettes. Called at the
   * match-start (PLAYING) edge so a new game never inherits the prior match's ghosts;
   * P3's explicit reset() (RETURN_TO_TITLE) will reuse this.
   */
  private resetMemory(): void {
    resetGhostMemory(this.memory);
    for (const sprite of this.ghostSprites.values()) sprite.destroy();
    this.ghostSprites.clear();
  }

  /** DEV/test only — count of remembered enemy structures (drives the e2e memory assert). */
  get rememberedCount(): number {
    return this.memory.size;
  }

  /** DEV/test only — the composed fog mask (opaque where fogged, transparent at vision sources). */
  get maskTexture(): RenderTexture {
    return this.maskRT;
  }

  /** DEV/test only — current overlay alpha (1 = full fog, 0 = lifted). */
  get currentAlpha(): number {
    return this.alpha;
  }

  destroy(): void {
    this.maskRT.destroy(true);
    this.brushTex.destroy(true);
    this.container.destroy({ children: true });
    // S60 P2 — free the memory layer + its silhouette texture set. (P1's gridTex is
    // freed in P3, alongside wiring destroy() into an actual teardown path.)
    this.memoryLayer.destroy({ children: true });
    destroyShapeTextures(this.ghostTextures);
    this.ghostSprites.clear();
  }
}

/**
 * One-time radial-gradient "vision brush": white opaque core → transparent
 * edge. Built with Canvas2D (version-proof; the Pixi v8 Graphics gradient API
 * differs from v7 and we sidestep it entirely). The inner plateau (stop 0.72)
 * keeps the core fully erasing; the outer band is the soft VISION_FADE edge.
 */
function makeRadialBrushTexture(radius: number): Texture {
  const size = radius * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('FogRenderer: 2D canvas context unavailable');
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.72, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}
