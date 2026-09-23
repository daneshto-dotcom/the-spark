/**
 * SPARK — DEV-ONLY chewer reference renderer. NOT part of the shipped bundle.
 *
 * ⭐ WHY THIS EXISTS. The owner asked for "the pencil chewer's character photo at high quality so I
 * can make it into the demon ones" (S187). There is no photo: the chewer has never had a sprite
 * sheet, and everything the player sees of him is painted procedurally by `drawChewer` in
 * `render/chewerRenderer.ts`. `characterSheetModel.ts:180` records that he, the lightning drone and
 * the locust cloud are the only three creatures with no atlas at all.
 *
 * ⛔ SO THIS PAGE DRAWS THE REAL PUPPET, NOT A REDRAW OF IT. It instantiates the production
 * `ChewerRenderer` and calls the same `drawPortraitInto` the character sheet uses, into a container
 * scaled up by `SCALE`. Pixi `Graphics` are vectors, so the result is genuinely resolution-
 * independent — a true enlargement of the shipped art, not an upscale of a screenshot. If the
 * painter changes, this page changes with it; it cannot go stale the way a checked-in PNG would.
 *
 * ⚠ `drawPortraitInto` freezes the cosmetic jitter (`nowSec` 0) and grounds the hop (`phase` 0), so
 * the portrait is deterministic: two runs produce identical pixels. The extra poses below drive
 * `phase` directly through the same painter to show the squash-and-stretch, because a reference
 * sheet that only shows the neutral pose tells an artist nothing about how the creature moves.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { ChewerRenderer } from '../render/chewerRenderer.ts';

/** Vector scale-up. 18x turns the 17px body radius into a ~600px creature. */
const SCALE = 18;
/** Paper white, matching the sketch-on-paper design intent of the palette. */
const PAPER = 0xffffff;
/**
 * `?alpha=1` renders on transparency instead of paper, so the sheet can be composited over another
 * background. Both are useful: the white one is what you trace on, the transparent one is what you
 * drop into a layer stack.
 */
const TRANSPARENT = new URLSearchParams(window.location.search).get('alpha') === '1';

/**
 * The painter is private, so the poses are produced the only supported way: through the public
 * portrait entry point, with the container transform supplying the variation. `drawPortraitInto`
 * hard-codes a grounded, right-facing, un-jittered pose — which is exactly what a tracing reference
 * wants — so the variants differ by SCALE and mirror only, never by reaching into private state.
 */
function paintCell(
  parent: Container,
  renderer: ChewerRenderer,
  cx: number,
  cy: number,
  scale: number,
  face: 1 | -1,
): void {
  const holder = new Container();
  holder.x = cx;
  holder.y = cy;
  holder.scale.set(scale * face, scale);
  parent.addChild(holder);
  const g = new Graphics();
  holder.addChild(g);
  renderer.drawPortraitInto(g, 0, 0);
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: 1800,
    height: 1100,
    background: PAPER,
    backgroundAlpha: TRANSPARENT ? 0 : 1,
    antialias: true,
    // Render at device scale so the extracted PNG is crisp on a HiDPI panel.
    resolution: 2,
    autoDensity: false,
    preference: 'webgl',
    /**
     * ⛔ REQUIRED, AND ITS ABSENCE IS SILENT. A WebGL drawing buffer is cleared the moment the
     * frame is composited, so `canvas.toDataURL()` on the next line returns a fully BLACK image —
     * no error, no warning, just an empty buffer that looks like a render that drew nothing. The
     * first attempt at this page produced exactly that and cost a round trip to diagnose.
     */
    preserveDrawingBuffer: true,
  });
  document.body.appendChild(app.canvas);

  // The renderer needs a parent container; it adds its own Graphics there for `sync()`, which this
  // page never calls. The portrait path writes into the Graphics WE pass, so that shared one stays
  // empty and harmless.
  const scratch = new Container();
  app.stage.addChild(scratch);
  const renderer = new ChewerRenderer(app as unknown as Application, scratch);

  // ── the hero portrait: the exact pose the character sheet shows, very large ──
  paintCell(app.stage, renderer, 430, 540, SCALE, 1);

  // ⚠ The two facings need their OWN centres. The first cut of this page put both at the same
  // point and they drew on top of each other, which reads as one malformed creature.
  paintCell(app.stage, renderer, 1060, 300, SCALE * 0.42, 1);
  paintCell(app.stage, renderer, 1480, 300, SCALE * 0.42, -1);

  // ── a size ladder: how he actually reads on the board (1x) up to 6x ──
  const ladder: number[] = [1, 2, 3, 4, 6];
  let lx = 950;
  for (const s of ladder) {
    paintCell(app.stage, renderer, lx, 850, s, 1);
    lx += 70 + s * 34;
  }

  app.render();
  /**
   * The extractor calls this immediately before reading the canvas. Even with
   * `preserveDrawingBuffer`, re-rendering in the same task as the read is the belt-and-braces
   * version: it removes any dependence on whether a compositor pass has happened in between.
   */
  (window as unknown as { __CHEWER_RENDER__?: () => void }).__CHEWER_RENDER__ = () => app.render();
  // Signal to the driver that the frame is on the canvas and safe to extract.
  (window as unknown as { __CHEWER_READY__?: boolean }).__CHEWER_READY__ = true;
}

void main();
