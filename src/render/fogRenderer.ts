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
import { CANVAS_HEIGHT, CANVAS_WIDTH, VISION_FADE_PX } from '../constants.ts';
import {
  computeVisionSources,
  fogTargetAlpha,
  stepFogAlpha,
} from '../state/vision.ts';
import type { World } from '../state/world.ts';
import type { Vec2 } from '../types.ts';

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
  }

  /**
   * Per render frame. `localCursor` is the live local cursor (personal-vision
   * centre); `dtSeconds` is the frame delta (drives the win-lift fade).
   */
  sync(world: World, localCursor: Vec2, dtSeconds: number): void {
    if (this.disabled) return; // container stays hidden (E2E gameplay specs)
    const target = fogTargetAlpha(world);
    const fadeStep =
      FOG_FADE_PER_SECOND * Math.max(0, Math.min(dtSeconds, MAX_FRAME_DT_SECONDS));
    this.alpha = stepFogAlpha(this.alpha, target, fadeStep);

    // Fully lifted / inactive → hide and skip the offscreen pass (zero cost in solo).
    if (this.alpha <= ALPHA_EPSILON) {
      this.container.visible = false;
      this.maskFrameCounter = 0; // force an immediate recompose on re-activation
      return;
    }
    this.container.visible = true;
    this.fogSprite.alpha = this.alpha;

    // Throttle the expensive mask recompose (~20Hz). The alpha tween above runs
    // every frame, so this never affects win-lift smoothness. Frame 0 after
    // activation always composes (counter reset to 0 on hide).
    const due = this.maskFrameCounter % MASK_RENDER_EVERY === 0;
    this.maskFrameCounter += 1;
    if (!due) return;

    const sources = computeVisionSources(world, localCursor);
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
