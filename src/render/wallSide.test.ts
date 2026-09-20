/**
 * SPARK — S185 — **A ZONE'S WALL STANDS ON THAT ZONE'S SIDE OF THE BORDER.**
 *
 * Owner, S185, after looking at a live board: *"Usually the racial wall is on the other side, which
 * is wrong … if you look at vampires versus nagas, you'll have the vampire zone, their quadrant
 * where they're building, and it'll be the naga-coloured wall and then the vampire wall and then the
 * nagas zone. So you just need to flip the design. Your own wall needs to be at the border of your
 * own zone. It just makes sense."*
 *
 * ## ⛔ WHY THIS IS A TEST AND NOT A ONE-CHARACTER FLIP
 *
 * The shipped code offset `zoneA` by `-1` and `zoneB` by `+1` along the segment normal. That pair is
 * a property of the **segment's winding**, not of the zone, and the board's arms wind differently:
 *
 * ```
 *   north arm  a(SPLIT_X, 0) → b(SPLIT_X, rimTop)      zoneA 0 = LEFT   normal → LEFT   ⇒ WRONG
 *   east arm   a(rimRight, SPLIT_Y) → b(WIDTH, …)      zoneA 1 = TOP    normal → DOWN   ⇒ right
 * ```
 *
 * So a global sign flip would have fixed the arm he was looking at and **silently broken the one he
 * was not**. `sideSignFor` asks `zoneOf` which zone actually lies off the normal, which is correct
 * for every arm, for both layouts, and for a diagonal border nobody has drawn yet.
 *
 * These assertions are the thing that would catch a future "simplification" back to a constant pair.
 */

import { describe, expect, it } from 'vitest';
import { wallSegments } from '../state/walls.ts';
import { zoneOf } from '../state/zones.ts';
import { sideSignFor } from './wallRenderer.ts';

type Layout = Parameters<typeof zoneOf>[1];

/** Where the renderer would actually put `zone`'s strip, given the derived sign. */
function stripCentreFor(layout: Layout, segIndex: number, which: 'A' | 'B'): { x: number; y: number } {
  const seg = wallSegments(layout)[segIndex]!;
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const signA = sideSignFor(layout, seg, nx, ny);
  const sign = which === 'A' ? signA : -signA;
  const off = 24; // out into the zone, clear of the seam
  const mx = (seg.a.x + seg.b.x) / 2;
  const my = (seg.a.y + seg.b.y) / 2;
  return { x: mx + nx * off * sign, y: my + ny * off * sign };
}

describe('⛔ S185 — every border arm puts each wall on its OWN zone', () => {
  for (const layout of ['PITCH_2P', 'QUADRANTS_4P'] as const) {
    const segs = wallSegments(layout as Layout);
    segs.forEach((seg, i) => {
      it(`${layout} arm ${i}: zoneA (${seg.zoneA}) and zoneB (${seg.zoneB}) each stand in themselves`, () => {
        expect(zoneOf(stripCentreFor(layout as Layout, i, 'A'), layout as Layout)).toBe(seg.zoneA);
        expect(zoneOf(stripCentreFor(layout as Layout, i, 'B'), layout as Layout)).toBe(seg.zoneB);
      });
    });
  }
});

describe('S185 — the arms genuinely disagree, which is why a constant pair cannot work', () => {
  /**
   * ⭐ THE REGRESSION GUARD WITH TEETH. If someone replaces `sideSignFor` with a fixed `-1/+1` pair,
   * the test above still passes on whichever arms happen to match it. This one asserts that the
   * derived signs are NOT all identical across the quadrant board — i.e. that a constant is
   * provably insufficient.
   */
  it('⛔ the derived sign is not the same on every arm of the 4P board', () => {
    const layout = 'QUADRANTS_4P' as Layout;
    const signs = wallSegments(layout).map((seg) => {
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      const len = Math.hypot(dx, dy);
      return sideSignFor(layout, seg, -dy / len, dx / len);
    });
    expect(new Set(signs).size).toBeGreaterThan(1);
  });
});
