/**
 * SPARK — S166 — THE SPAWNER PORTAL IS A HOLE, AND IT COSTS THE FRAME BUDGET NOTHING.
 *
 * Owner, live on spark-online.space: *"another bug you have put the layer of dark background OVER
 * the primitives (shapes), cant see them being generated but my gatherer keeps gathering"*.
 *
 * He was exactly right, and the second half of his sentence is the diagnosis: the SIM was never
 * involved. `portalCut` was `circle().fill({ color: 0x000000 })` at alpha 1.0 on `aboveFogLayer`,
 * while `SparkRenderer` sits on `app.stage` BELOW it — so the disc meant to keep the shared quarry
 * cosmos-black was painted on top of the one place in the game where every shape is born.
 *
 * ⛔ AND THE FIRST REPAIR WAS A STENCIL MASK, WHICH BROKE CI. That is why this file tests what it
 * tests. A per-frame mask over the whole 1920x1080 canvas is fine on a real GPU and catastrophic on
 * the runner's software GL: the gating lane blew past its 720 s cap and the sim crawled at 5.28
 * ticks/s instead of 60, killing three specs on `waitForWorld timeout: a gatherer banks a shape into
 * the local castle` — this renderer's own fingerprint, the third distinct cause of that same line.
 * A re-run reproduced it, so it was not the runner having a bad day.
 *
 * ⭐ SO THERE ARE TWO INVARIANTS HERE, NOT ONE, and the second is as load-bearing as the first:
 *   1. nothing this renderer owns may paint over gameplay — hence NO opaque fill;
 *   2. nothing this renderer owns may cost anything per frame — hence NO mask and NO Graphics.
 * Both are satisfied by the same absence: the hole is baked into the texture once, and steady state
 * is four plain sprites, exactly what shipped before S166.
 *
 * ⚠ THE SOURCE SCANS STRIP COMMENTS, AND THAT IS NOT OPTIONAL HERE — the module's docblocks now
 * QUOTE both the old opaque `fill({ color: 0x000000 })` and the old `.cut()` mask in order to
 * explain why each was wrong. A naive substring scan would match those quotes and pass while the
 * defect was live, which is the exact vacuity `registerAll.test.ts` documents and guards the same
 * way.
 */

import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { Application } from 'pixi.js';

import { SPAWNER_RADIUS } from '../constants.ts';
import { ZoneBackgroundRenderer, portalInSource } from './zoneBackgroundRenderer.ts';

describe('S166 — the zone backdrop covers neither the shape queue nor the frame budget', () => {
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

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

  it('owns exactly one child — the sprite host — and NOTHING that paints or masks', () => {
    const { layer } = makeRenderer();

    // Anti-vacuity: an empty layer would satisfy every negative below trivially.
    expect(layer.children.length).toBe(1);

    const host = layer.getChildAt(0) as Container;
    expect(host).toBeInstanceOf(Container);
    expect(host).not.toBeInstanceOf(Graphics);

    // INVARIANT 1 — no Graphics anywhere on this layer. The opaque disc that hid the shape queue
    // was a Graphics, and so was the stencil mask that replaced it and broke CI.
    expect(layer.children.some((c) => c instanceof Graphics)).toBe(false);

    // INVARIANT 2 — nothing is masked. This is the CI-cost invariant, and it is the one that would
    // regress silently: a mask here is invisible locally and lethal on software GL.
    // ⚠ Pixi leaves an unmasked container's `mask` as `undefined`, not `null` — so this is
    // normalised rather than compared to one or the other. A real mask is always an object.
    expect(host.mask ?? null).toBe(null);
    expect(layer.mask ?? null).toBe(null);
  });

  /*
   * The bake's geometry. `punchPortal` degrades to the UNHOLED texture on every failure rather than
   * throwing, so a mapping error is silent — the symptom is the S165 seam growing back across the
   * quarry, which is where this whole story started. These assertions are the only thing standing
   * between that and a green suite.
   */
  describe('portalInSource — the mapping that can be silently wrong', () => {
    const R = SPAWNER_RADIUS + 2;

    it('reaches EVERY zone on BOTH layouts — a no-op bake is the silent failure', () => {
      for (const zone of [0, 1]) {
        expect(portalInSource(480, 540, zone, 'PITCH_2P').intersects, `2P zone ${zone}`).toBe(true);
      }
      for (const zone of [0, 1, 2, 3]) {
        expect(portalInSource(480, 270, zone, 'QUADRANTS_4P').intersects, `4P zone ${zone}`)
          .toBe(true);
      }
    });

    it('lands the disc on the shared CORNER of every 4P quadrant', () => {
      // A 480x270 source cover-scales x2 into a 960x540 quadrant, so world-centre maps to the
      // texture corner nearest the middle of the board — a different corner per zone.
      expect(portalInSource(480, 270, 0, 'QUADRANTS_4P')).toMatchObject({ cx: 480, cy: 270 });
      expect(portalInSource(480, 270, 1, 'QUADRANTS_4P')).toMatchObject({ cx: 0, cy: 270 });
      expect(portalInSource(480, 270, 2, 'QUADRANTS_4P')).toMatchObject({ cx: 0, cy: 0 });
      expect(portalInSource(480, 270, 3, 'QUADRANTS_4P')).toMatchObject({ cx: 480, cy: 0 });
      // Halved by the x2 cover-scale, which is what makes baking at SOURCE resolution cheap.
      expect(portalInSource(480, 270, 0, 'QUADRANTS_4P').rad).toBeCloseTo(R / 2, 6);
    });

    it('lands the disc on the SPLIT LINE at mid-height on the 2P board', () => {
      // The 2P split is vertical at x=960 and the quarry is at y=540 — an edge midpoint, not a
      // corner. Getting this confused with the 4P case would punch a hole off the quarry.
      expect(portalInSource(480, 540, 0, 'PITCH_2P')).toMatchObject({ cx: 480, cy: 270 });
      expect(portalInSource(480, 540, 1, 'PITCH_2P')).toMatchObject({ cx: 0, cy: 270 });
    });

    /*
     * ⛔ THESE TWO CASES EXIST BECAUSE THE REST OF THIS BLOCK WAS VACUOUS WITHOUT THEM, and a
     * negative control is what proved it: I deleted the cover-scale CENTRING term
     * (`(r.w - texW * scale) / 2`) and every assertion above still passed.
     *
     * The reason is arithmetic. A 480x270 source cover-scaled into a 960x540 quadrant has matching
     * aspect ratios, so the scaled image fits the rect exactly and the centring term is ZERO. Every
     * case above happened to be aspect-matched, so none of them could see it.
     *
     * The SHIPPED art is not aspect-matched: `zoneBackgroundRenderer`'s own docblock says *"3:4 is
     * the nearest portrait the generator offers to the true 8:9"*, so the overflow is real on the
     * 2P board and the term is load-bearing in production. These two cases mismatch deliberately —
     * one overflowing vertically, one horizontally — and they fail if the term is dropped.
     */
    it('accounts for the cover-scale OVERFLOW when the aspect does not match', () => {
      // 3:4 portrait into an 8:9 zone: scale is bound by WIDTH (2x), so the height overflows
      // 1280 into 1080 and the image is centred at y = -100. Undoing that puts the quarry at
      // cy = (540 + 100) / 2 = 320. Drop the centring term and you get 270 — 50 px off the disc.
      expect(portalInSource(480, 640, 0, 'PITCH_2P')).toMatchObject({ cx: 480, cy: 320 });

      // And the mirror case, overflowing horizontally: scale is bound by HEIGHT (2.7x), the width
      // overflows 1296 into 960, centred at x = -168, so cx = 1128 / 2.7. Without the term: 355.6.
      const wide = portalInSource(480, 200, 0, 'QUADRANTS_4P');
      expect(wide.cx).toBeCloseTo(1128 / 2.7, 6);
      expect(wide.cy).toBeCloseTo(200, 6);
    });

    it('a centre outside the texture is CORRECT, not something to clamp', () => {
      // Three of four 4P zones legitimately have the disc centre on or past an edge. A future
      // "fix" that clamped these to the texture would move the hole off the quarry.
      const outside = [1, 2, 3]
        .map((z) => portalInSource(480, 270, z, 'QUADRANTS_4P'))
        .filter((m) => m.cx <= 0 || m.cy <= 0);
      expect(outside.length).toBe(3);
    });
  });

  it('bakes the hole once per (url, layout, zone) and never shows the raw texture', () => {
    const src = readSrc();
    // Anti-vacuity first: if stripComments ever eats the file, every scan below passes.
    expect(src).toContain('export class ZoneBackgroundRenderer');
    expect(src).toContain('function punchPortal');

    // The bake is reached from sync, and cached on all three axes that change the hole.
    expect(src).toContain('punchPortal(raw, zone, layout)');
    expect(src).toContain('`${url}|${layout}|${zone}`');
    // `raw` must never reach a Sprite: that is the seam bug growing back.
    expect(src).not.toContain('new Sprite(raw)');
    expect(src).not.toContain('sp.texture = raw');
  });

  it('paints no opaque fill and mounts no stencil — both past failures, as source', () => {
    const src = readSrc();
    expect(src).toContain('export class ZoneBackgroundRenderer'); // anti-vacuity

    // Failure 1 (S165): an opaque black disc above the sparks.
    expect(src).not.toContain('0x000000');
    // Failure 2 (S166): a per-frame stencil mask over the full canvas.
    expect(src).not.toContain('.cut()');
    expect(src).not.toContain('.mask =');
    expect(src).not.toContain('new Graphics()');
  });

  it('adds backdrop sprites to the sprite host, never straight to the layer', () => {
    const src = readSrc();
    expect(src).toContain('this.spriteHost.addChild(sp);');
    expect(src).not.toContain('this.layer.addChild(sp);');
  });

  it("setEnabled(false) still hides everything — the owner's workaround must keep working", () => {
    const { layer, r } = makeRenderer();
    expect(r.isEnabled()).toBe(true);
    r.setEnabled(false);
    expect(r.isEnabled()).toBe(false);
    expect(layer.visible).toBe(false);
  });
});
