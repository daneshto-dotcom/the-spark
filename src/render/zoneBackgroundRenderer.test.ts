/**
 * SPARK — S166 P1 — THE SPAWNER PORTAL IS A HOLE, NOT PAINT OVER THE SHAPE QUEUE.
 *
 * Owner, live on spark-online.space: *"another bug you have put the layer of dark background OVER
 * the primitives (shapes), cant see them being generated but my gatherer keeps gathering"*.
 *
 * He was exactly right, and the second half of his sentence is the diagnosis: the SIM was never
 * involved. `portalCut` was `circle().fill({ color: 0x000000 })` at alpha 1.0 living on
 * `aboveFogLayer`, while `SparkRenderer` sits on `app.stage` BELOW it — so the disc that was meant
 * to keep the shared quarry cosmos-black was painted on top of the one place in the game where
 * every shape is born.
 *
 * ⛔ WHAT THESE TESTS PIN IS THE INVARIANT, NOT THE SYMPTOM. "The disc is 2 px wider" would be a
 * symptom test. The invariant is: **this renderer paints NOTHING opaque, and every backdrop pixel
 * goes through the mask.** That is what makes it structurally unable to cover gameplay again.
 *
 * ⚠ THE SOURCE SCANS STRIP COMMENTS, AND THAT IS NOT OPTIONAL HERE — the module's own docblock now
 * QUOTES the old `fill({ color: 0x000000 })` line verbatim in order to explain why it was wrong. A
 * naive substring scan would match that quote and pass while the defect was live, which is the
 * exact vacuity `registerAll.test.ts` documents and guards the same way.
 */

import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { Application } from 'pixi.js';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import { ZoneBackgroundRenderer } from './zoneBackgroundRenderer.ts';

describe('S166 — the zone backdrop cannot cover the shape queue', () => {
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ 	]*\/\/.*$/gm, '');

  const readSrc = (): string => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return stripComments(
      readFileSync(join(process.cwd(), 'src', 'render', 'zoneBackgroundRenderer.ts'), 'utf8'),
    );
  };

  /** A stub Application: the constructor only does `void app` once an explicit parent is passed. */
  const makeRenderer = (): { parent: Container; layer: Container; r: ZoneBackgroundRenderer } => {
    const parent = new Container();
    const app = { stage: new Container() } as unknown as Application;
    const r = new ZoneBackgroundRenderer(app, parent);
    // `getChildAt(0)` is public API AND it re-asserts the `addChildAt(layer, 0)` contract: the
    // backdrop must be the BOTTOM child of aboveFogLayer so its own siblings paint over it.
    return { parent, layer: parent.getChildAt(0) as Container, r };
  };

  it('mounts at index 0 of its parent, so every sibling gameplay layer paints on top', () => {
    const { parent, layer } = makeRenderer();
    expect(parent.children.length).toBe(1);
    expect(layer).toBeInstanceOf(Container);
  });

  it('holds exactly a masked sprite host and its mask — and nothing that paints', () => {
    const { layer } = makeRenderer();

    // Anti-vacuity: an empty layer would satisfy "nothing paints" trivially.
    expect(layer.children.length).toBe(2);

    const host = layer.children.find((c) => c instanceof Container && !(c instanceof Graphics));
    const mask = layer.children.find((c) => c instanceof Graphics);
    expect(host).toBeDefined();
    expect(mask).toBeDefined();

    // THE LOAD-BEARING ASSERTION. The sprite host is masked, and masked by the Graphics that is
    // actually in the display list (an orphaned mask has no world transform and clips nothing).
    expect(host!.mask).toBe(mask);
    expect(mask!.parent).toBe(layer);
  });

  it("the quarry disc lies completely inside the canvas rect — cut()'s one precondition", () => {
    /*
     * Pixi: *"If a hole is not completely in a shape, it will fail to cut correctly!"* This is the
     * arithmetic behind that sentence, so a future canvas or spawner resize reddens here rather
     * than silently producing a backdrop with no hole in it.
     */
    const r = SPAWNER_RADIUS + 2;
    expect(SPAWNER_CENTER_X - r).toBeGreaterThan(0);
    expect(SPAWNER_CENTER_Y - r).toBeGreaterThan(0);
    expect(SPAWNER_CENTER_X + r).toBeLessThan(CANVAS_WIDTH);
    expect(SPAWNER_CENTER_Y + r).toBeLessThan(CANVAS_HEIGHT);
  });

  it('paints no opaque fill anywhere in the module', () => {
    const src = readSrc();
    // Anti-vacuity first: if stripComments ever eats the whole file, every scan below passes.
    expect(src).toContain('export class ZoneBackgroundRenderer');
    expect(src).toContain('.cut()');

    // The defect itself: an opaque black fill on this layer is what covered the sparks.
    expect(src).not.toContain('0x000000');
    // And no fill at all outside the mask — the mask's own fill is white by convention.
    expect(src.match(/\.fill\(/g)?.length ?? 0).toBe(1);
  });

  it('adds backdrop sprites to the MASKED host, never straight to the layer', () => {
    const src = readSrc();
    expect(src).toContain('this.spriteHost.addChild(sp)');
    // The regression, stated as source: a sprite added to `this.layer` would bypass the mask and
    // paint over the quarry again.
    expect(src).not.toContain('this.layer.addChild(sp)');
  });

  it("setEnabled(false) still hides everything — the owner's workaround must keep working", () => {
    const { layer, r } = makeRenderer();
    expect(r.isEnabled()).toBe(true);
    r.setEnabled(false);
    expect(r.isEnabled()).toBe(false);
    // The mask and the host are both children of this layer, so one flag hides the whole backdrop
    // and restores the plain black board.
    expect(layer.visible).toBe(false);
  });
});
