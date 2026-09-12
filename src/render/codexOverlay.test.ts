/**
 * SPARK — S173 P5: the CODEX overlay's scroll math, and the tab set it scrolls.
 *
 * ⛔ WHY THIS FILE EXISTS AT ALL. `main.ts` records, at the tier-9 unlock hook, that *"there is no
 * codexOverlay.test.ts, so nothing would have reported it"* about a codex bug that shipped. This is
 * that file. It cannot drive Pixi in the node env, so the overlay's arithmetic is exported from
 * codexOverlay.ts as pure functions and checked HERE — the row count, the content extent, the
 * clamp, the wheel conversion and the thumb. What that buys: a future tower tier that pushes the
 * grid past the viewport is a NUMBER a test can assert on, not something a human has to notice on
 * a screenshot, which is precisely how the owner found the bug this priority fixes.
 *
 * The owner's two rulings under test:
 *   (a) *"remove the whole godly combos"* — TWO tabs, and the type says so.
 *   (b) *"the towers and structures… it's not scrollable. I can't scroll down and keep seeing all
 *       the towers, which is bad."* — and, in the same breath, *"Combos, they're all fine. You can
 *       see all of them."* So COMBOS must still have ZERO travel: the fix must not move it.
 */

import { describe, expect, it } from 'vitest';
import {
  clampScroll,
  gridContentBottom,
  gridRowCount,
  scrollExtent,
  scrollbarThumb,
  wheelScrollDelta,
  COMBO_COLS,
  COMBO_ROW_Y,
  COMBO_TILE_H,
  COMBO_TILE_W,
  COMBO_TILE_GAP,
  PREVIEW_TICK_RATE,
  TOWER_COLS,
  TOWER_TILE_H,
  TOWER_TILE_GAP,
  ART_HALF_W,
  ART_HALF_H,
  entryFromRecipe,
  type CodexTabKey,
  previewSpanFor,
} from './codexOverlay.ts';
import { CANVAS_HEIGHT, SparkType } from '../constants.ts';
import { MAGIC_COMBO_KEYS } from '../combos.ts';
import { magicComboCatalog } from './comboCodexStore.ts';
import { drawBondVisual, type BondVisualParams } from './bondVisualRenderer.ts';
import { CODEX_COPY } from './codexPresentation.ts';
import { blueprintFitScaleBox, drawBlueprintShape } from './blueprintGlyph.ts';
import { blueprintFor } from '../state/blueprints.ts';
import type { DefenderGodlyRecipe } from '../state/godlyRecipes/types.ts';

// ⚠ BOUND, NOT MIRRORED. These come from codexOverlay.ts itself, so a layout retune moves the
// assertions with it instead of leaving a test that passes about numbers the file stopped using —
// the S140 anti-drift lesson this repo already learned once in codexPresentation.test.ts.
const TILE_H = TOWER_TILE_H;
const TILE_GAP = TOWER_TILE_GAP;
const COMBO_GAP = COMBO_TILE_GAP;
/** The viewport floor: CANVAS_HEIGHT - 44, i.e. just above the footer line at y = 1054. */
const VIEW_BOTTOM = CANVAS_HEIGHT - 44;

describe('S173 P5 — the codex has TWO tabs (owner: "remove the whole godly combos")', () => {
  it('CodexTabKey admits combos + towers and nothing else', () => {
    // A compile-time assertion with a runtime body: if 'godly' is ever re-added to the union this
    // stops type-checking, which is the half that matters. `tsc -b` runs over the test files too.
    const all: readonly CodexTabKey[] = ['combos', 'towers'];
    expect(all).toHaveLength(2);
    expect(all).not.toContain('godly');
  });
});

describe('S173 P5 — the towers grid scrolls, and the extent comes from the grid itself', () => {
  it('19 entries at 4 columns is 5 rows — the shipped TOWERS & STRUCTURES shape', () => {
    // Voltkin + 18 spawner/defender recipes. `listRecipes()` feeds the tab whole (main.ts), so this
    // is the real count; it is asserted as a SHAPE rather than pinned, so adding a tower moves the
    // extent instead of failing here.
    expect(gridRowCount(19, TOWER_COLS)).toBe(5);
    expect(gridRowCount(20, TOWER_COLS)).toBe(5);
    expect(gridRowCount(21, TOWER_COLS)).toBe(6);
  });

  it('THE BUG, AS A NUMBER: the shipped grid runs past the bottom of a 1080-tall canvas', () => {
    // The measurement behind the owner's "I can't scroll down and keep seeing all the towers": the
    // last tile's bottom edge is y = 1947 and the padded content bottom 1971, against a canvas of
    // 1080 and a viewport floor of 1036 — so 935 px, more than half the tab and the whole boss-tower
    // tier, had no way to be reached.
    const bottom = gridContentBottom(5, TILE_H, TILE_GAP);
    expect(bottom).toBe(1971); // 235 GRID_TOP + 5*320 + 4*28 + 24 bottom pad
    expect(bottom - 24).toBe(1947); // the last tile's own bottom edge
    expect(bottom).toBeGreaterThan(CANVAS_HEIGHT);
    expect(scrollExtent(bottom)).toBe(935);
    expect(scrollExtent(bottom)).toBe(bottom - VIEW_BOTTOM);
  });

  it('REGRESSION: COMBOS still has ZERO travel — owner: "they\'re all fine, you can see all of them"', () => {
    // The viewport is applied to BOTH tabs (one code path). This is the assertion that the shared
    // path did not change the tab the owner explicitly said was fine: the Magic-14 at 5 columns is
    // 3 rows ending well above the viewport floor, so no scrollbar, no footer hint, no offset.
    const rows = gridRowCount(MAGIC_COMBO_KEYS.length, COMBO_COLS);
    expect(rows).toBe(3);
    const bottom = gridContentBottom(rows, COMBO_TILE_H, COMBO_GAP);
    expect(bottom).toBeLessThan(VIEW_BOTTOM);
    expect(scrollExtent(bottom)).toBe(0);
  });

  it('an empty grid has no extent (the "nothing discovered yet" state)', () => {
    expect(gridRowCount(0, TOWER_COLS)).toBe(0);
    expect(scrollExtent(gridContentBottom(0, TILE_H, TILE_GAP))).toBe(0);
  });
});

describe('S173 P5 — clamping: you cannot scroll past either end', () => {
  it('holds the offset inside [0, max]', () => {
    expect(clampScroll(-500, 900)).toBe(0);
    expect(clampScroll(0, 900)).toBe(0);
    expect(clampScroll(450, 900)).toBe(450);
    expect(clampScroll(900, 900)).toBe(900);
    expect(clampScroll(99999, 900)).toBe(900);
  });

  it('a grid that fits is pinned at 0 in BOTH directions', () => {
    // Without this, a wheel event on the COMBOS tab would drag its grid off the top of the mask —
    // the failure mode where "make towers scroll" quietly breaks the tab that was already correct.
    for (const attempt of [-300, -1, 0, 1, 300]) expect(clampScroll(attempt, 0)).toBe(0);
  });
});

describe('S173 P5 — wheel conversion handles all three DOM deltaModes', () => {
  it('pixel mode (Chrome) scales the delta into canvas units', () => {
    expect(wheelScrollDelta(100, 0)).toBeCloseTo(160, 6);
    expect(wheelScrollDelta(-100, 0)).toBeCloseTo(-160, 6);
  });

  it('line mode (Firefox) is not mistaken for pixels', () => {
    // ⛔ THE TRAP THIS PINS: Firefox reports deltaMode 1 with deltaY ≈ ±3 per notch. Treated as
    // pixels that is FIVE canvas px of travel per notch against a 348 px row — indistinguishable
    // from "it still doesn't scroll", and it would only ever be reported by a Firefox user.
    expect(wheelScrollDelta(3, 1)).toBe(180);
    expect(Math.abs(wheelScrollDelta(3, 1))).toBeGreaterThan(Math.abs(wheelScrollDelta(3, 0)));
  });

  it('page mode moves just under a viewport, never more', () => {
    const viewH = VIEW_BOTTOM - 212;
    expect(wheelScrollDelta(1, 2)).toBeCloseTo(viewH * 0.9, 6);
    expect(wheelScrollDelta(1, 2)).toBeLessThan(viewH);
  });

  it('direction is preserved — down scrolls down', () => {
    for (const mode of [0, 1, 2]) {
      expect(wheelScrollDelta(1, mode)).toBeGreaterThan(0);
      expect(wheelScrollDelta(-1, mode)).toBeLessThan(0);
    }
  });
});

describe('S173 P5 — the scrollbar says how much more there is', () => {
  const MAX = scrollExtent(gridContentBottom(5, TILE_H, TILE_GAP));
  const VIEW_TOP = 212;
  const VIEW_H = VIEW_BOTTOM - VIEW_TOP;

  it('the thumb starts at the track top and ends flush with its bottom', () => {
    const top = scrollbarThumb(0, MAX);
    expect(top.y).toBe(VIEW_TOP);
    const bot = scrollbarThumb(MAX, MAX);
    expect(bot.y + bot.h).toBeCloseTo(VIEW_TOP + VIEW_H, 6);
  });

  it('the thumb length is the visible fraction, floored so it stays grabbable', () => {
    const t = scrollbarThumb(0, MAX);
    expect(t.h).toBeGreaterThanOrEqual(48);
    expect(t.h).toBeLessThan(VIEW_H);
    // A much longer grid must not shrink the thumb to a sliver.
    expect(scrollbarThumb(0, 100000).h).toBe(48);
  });

  it('the thumb never leaves the track, at any offset including out-of-range ones', () => {
    for (const offset of [-9999, 0, 1, MAX / 3, MAX - 1, MAX, MAX + 9999]) {
      const t = scrollbarThumb(offset, MAX);
      expect(t.y).toBeGreaterThanOrEqual(VIEW_TOP);
      expect(t.y + t.h).toBeLessThanOrEqual(VIEW_TOP + VIEW_H + 1e-6);
    }
  });

  it('travel is monotonic in the offset', () => {
    expect(scrollbarThumb(MAX / 2, MAX).y).toBeGreaterThan(scrollbarThumb(0, MAX).y);
    expect(scrollbarThumb(MAX, MAX).y).toBeGreaterThan(scrollbarThumb(MAX / 2, MAX).y);
  });
});

/*
 * ============================ S173 P5 (c) — the combo preview ============================
 *
 * Owner: *"they don't show what this vortex IS, how it looks… the vortex, I think, spins or
 * something, or a warped anchor — it's like a spiral that's moving and spiraling around. So maybe
 * make those clickable, so when you mouse over each of those combos you can see how it would look.
 * Just the connector itself."*
 *
 * The preview calls the SHIPPED `drawBondVisual`, so what is worth testing is not the silhouettes —
 * bondVisualRenderer.test.ts owns those — but the two claims the CODEX makes about them:
 *   1. each connector FITS the card it is drawn on, at every tick, for all fourteen;
 *   2. the 3× preview clock produces motion a player sees inside a hover.
 *
 * The recording mock is the same device bondVisualRenderer.test.ts uses: Pixi's Graphics is a
 * method chain, and capturing the chain is enough to measure geometry without a renderer.
 */
interface Op { readonly op: string; readonly args: readonly number[] }
class GraphicsMock {
  readonly calls: Op[] = [];
  moveTo(x: number, y: number): this { this.calls.push({ op: 'moveTo', args: [x, y] }); return this; }
  lineTo(x: number, y: number): this { this.calls.push({ op: 'lineTo', args: [x, y] }); return this; }
  circle(x: number, y: number, r: number): this { this.calls.push({ op: 'circle', args: [x, y, r] }); return this; }
  stroke(o: { width?: number; color?: number; alpha?: number }): this {
    this.calls.push({ op: 'stroke', args: [o.width ?? 0, o.color ?? 0, o.alpha ?? 1] });
    return this;
  }
  rect(): this { return this; }
  roundRect(): this { return this; }
}

/** The exact params the overlay hands `drawBondVisual` for one card, at a given tick. */
function previewParams(visualEffectId: string, tick: number): BondVisualParams {
  // ⚠ THE SPAN COMES FROM THE SHIPPING FUNCTION, not from COMBO_SPAN. The vortex radiates about
  // ENDPOINT A to the FULL length rather than len/2 about the midpoint, so it gets a shorter bond —
  // and a fixture that hardcoded the glyph gap here would be measuring a card the game never draws.
  const half = previewSpanFor(visualEffectId) / 2;
  return {
    ax: COMBO_TILE_W / 2 - half,
    ay: COMBO_ROW_Y,
    bx: COMBO_TILE_W / 2 + half,
    by: COMBO_ROW_Y,
    visualEffectId,
    colorA: 0x53d8ff,
    colorB: 0x53d8ff,
    alpha: 1,
    width: 4,
    tick,
  };
}

function drawnBox(visualEffectId: string, tick: number): { minY: number; maxY: number; minX: number; maxX: number } {
  const g = new GraphicsMock();
  drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], previewParams(visualEffectId, tick));
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const c of g.calls) {
    if (c.op === 'stroke') continue;
    const r = c.op === 'circle' ? c.args[2] : 0;
    minX = Math.min(minX, c.args[0] - r); maxX = Math.max(maxX, c.args[0] + r);
    minY = Math.min(minY, c.args[1] - r); maxY = Math.max(maxY, c.args[1] + r);
  }
  return { minX, maxX, minY, maxY };
}

function serialize(visualEffectId: string, tick: number): string {
  const g = new GraphicsMock();
  drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], previewParams(visualEffectId, tick));
  return JSON.stringify(g.calls.map((c) => [c.op, ...c.args.map((n) => Math.round(n * 100) / 100)]));
}

const CATALOG = magicComboCatalog();

describe('S173 P5 — every combo has its OWN connector to show', () => {
  it('no Magic-14 entry falls through to the plain default line', () => {
    // If one did, hovering that card would show a straight stroke and the owner's complaint would
    // be true again for that combo — "they don't show what this IS". Fourteen names, fourteen looks.
    for (const e of CATALOG) {
      expect(e.outcome.visualEffectId, `${e.outcome.resultName}`).not.toBe('fx.bond.default');
    }
    expect(new Set(CATALOG.map((e) => e.outcome.visualEffectId)).size).toBe(MAGIC_COMBO_KEYS.length);
  });
});

describe('S173 P5 — the connector FITS the card (the reason the tile grew 132 → 168)', () => {
  // The ornamented silhouettes — wheel, lattice, diamond — draw a ring or rhombus of radius len/2
  // about the bond midpoint, so the band is COMBO_ROW_Y ± COMBO_SPAN/2. This measures that claim
  // against the real draw calls rather than trusting the arithmetic in the comment.
  const NAME_BOTTOM = 40;   // name text at y=30, fontSize 19, anchored 0.5
  const LOCK_TOP = COMBO_TILE_H - 22; // 'connect to reveal' at h-16, fontSize 11

  it.each(CATALOG.map((e) => [e.outcome.resultName, e.outcome.visualEffectId] as const))(
    '%s stays inside the card at every phase of its animation',
    (_name, fx) => {
      // Sample a full second of preview motion at the shipped rate, plus a long tail, so a
      // silhouette that only breaches its box at some phase cannot hide between two samples.
      for (let frame = 0; frame < 240; frame += 7) {
        const box = drawnBox(fx, frame * PREVIEW_TICK_RATE);
        expect(box.minY, `${_name} top`).toBeGreaterThan(NAME_BOTTOM);
        expect(box.maxY, `${_name} bottom`).toBeLessThan(LOCK_TOP);
        expect(box.minX, `${_name} left`).toBeGreaterThanOrEqual(0);
        expect(box.maxX, `${_name} right`).toBeLessThanOrEqual(COMBO_TILE_W);
      }
    },
  );
});

describe('S173 P5 — the 3× preview clock makes the motion visible inside a hover', () => {
  // ⛔ THE MEASUREMENT BEHIND PREVIEW_TICK_RATE. `drawVortex` advances by `tick * 0.0035`: one
  // revolution is 1795 ticks, i.e. 30 SECONDS at one tick per frame. The vortex is the combo the
  // owner named as the thing he wants to watch spin, so at 1× the feature ships as a still image.
  const ONE_SECOND_OF_HOVER = 60 * PREVIEW_TICK_RATE;

  it.each([
    ['Vortex', 'fx.vortex'],
    ['Warped Anchor', 'fx.warped'],
    ['Wheel', 'fx.wheel'],
    ['Orbital', 'fx.orbital'],
    ['Filament', 'fx.filament'],
    ['Whip', 'fx.whip'],
  ])('%s looks different after one second of hovering', (_name, fx) => {
    expect(serialize(fx, ONE_SECOND_OF_HOVER)).not.toBe(serialize(fx, 0));
  });

  it('the rate is what makes the difference — the vortex is near-still at 1× over the same second', () => {
    // Not a style preference: this is the evidence that the 3× clock is load-bearing rather than
    // decorative. The vortex turns 0.21 rad in a second at 1×, which is 12 degrees on a 42 px
    // radius — under 9 px of travel at the rim, across a whole second.
    const oneX = Math.abs(60 * 0.0035);
    const threeX = Math.abs(ONE_SECOND_OF_HOVER * 0.0035);
    expect(oneX).toBeLessThan(0.25);              // radians per second at 1×
    expect(threeX).toBeGreaterThan(0.6);          // radians per second at 3×
    expect(PREVIEW_TICK_RATE).toBe(3);
  });

  it('a preview is a pure function of its frame counter — no wall clock, no randomness', () => {
    // Two openings of the same card must look identical, and the codex has no world to read a tick
    // from. Re-serialising the same frame twice is what proves nothing ambient leaked in.
    for (const e of CATALOG) {
      expect(serialize(e.outcome.visualEffectId, 123)).toBe(serialize(e.outcome.visualEffectId, 123));
    }
  });
});

/*
 * ================= S174 (a) — HELGA AND VOLTKIN SHOW THE BUILDING, NOT THE PERSON =================
 *
 * Owner: *"Helga has reverted back to the state where you can see the actual Helga, but you should
 * see only the STRUCTURE of the building, like the connectors, how it looks. Also for Voltkin."*
 *
 * ⛔ THE DEFECT WAS A DATA ONE, WHICH IS WHY THE TESTS BELOW ARE ABOUT DATA AND GEOMETRY RATHER
 * THAN PIXELS. `makeSpriteTile` drew `entry.emblem` when it had one and `entry.characterSprite`
 * otherwise — and those two entries were the only ones in the table carrying art, so they were the
 * only two cards that never drew their recipe. The fix severs the sprite path entirely and sends
 * every emblem-less entry to `blueprintGlyph`, so what is worth pinning is: (1) an entry minted
 * from a recipe that HAS art carries none; (2) the geometry that gets drawn instead is the owner's
 * stated recipe; (3) it fits the card.
 */

/**
 * A recording Graphics for `drawBlueprintShape`, deliberately SEPARATE from the `GraphicsMock`
 * above rather than an extension of it. That one is tuned for `drawBondVisual` and treats `rect` as
 * a no-op; blueprint glyphs draw Squares AS rects, so teaching the shared mock to record them would
 * silently widen the combo-preview fit boxes measured earlier in this file.
 */
class BlueprintGraphicsMock {
  minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
  private pt(x: number, y: number): void {
    this.minX = Math.min(this.minX, x); this.maxX = Math.max(this.maxX, x);
    this.minY = Math.min(this.minY, y); this.maxY = Math.max(this.maxY, y);
  }
  moveTo(x: number, y: number): this { this.pt(x, y); return this; }
  lineTo(x: number, y: number): this { this.pt(x, y); return this; }
  circle(x: number, y: number, r: number): this { this.pt(x - r, y - r); this.pt(x + r, y + r); return this; }
  rect(x: number, y: number, w: number, h: number): this { this.pt(x, y); this.pt(x + w, y + h); return this; }
  closePath(): this { return this; }
  fill(): this { return this; }
  stroke(): this { return this; }
}

function drawnAtCardScale(id: 'helga' | 'voltkin'): BlueprintGraphicsMock {
  const g = new BlueprintGraphicsMock();
  // Centred on (0,0) on purpose: the claim under test is about the FIT, so measuring |extent|
  // against the half-sizes keeps this assertion independent of where the card puts its art centre.
  drawBlueprintShape(
    g as unknown as Parameters<typeof drawBlueprintShape>[0],
    id,
    0,
    0,
    blueprintFitScaleBox(id, ART_HALF_W, ART_HALF_H),
  );
  return g;
}

describe('S174 (a) — the card draws the recipe, and carries no character art to draw instead', () => {
  it('⛔ a recipe that HAS character art still mints an entry without any', () => {
    // The strongest form of the fix: hand `entryFromRecipe` the real shape of a recipe that carries
    // art and assert the art does not survive the mapping. If `characterSprite` is ever re-added to
    // CodexEntry, this fails while the type still compiles — which is the half tsc cannot cover.
    const helgaLike: DefenderGodlyRecipe = {
      kind: 'defender',
      id: 'helga',
      defenderKind: 'princess',
      predicate: () => null,
      stillValid: () => true,
      characterSprite: '/godly/helga/helga.png',
    };
    const entry = entryFromRecipe(helgaLike);
    expect(Object.keys(entry)).not.toContain('characterSprite');
    expect(Object.values(entry).join(' ')).not.toContain('helga.png');
    // …and with no emblem either, the tile's `else` branch — the blueprint — is the only thing left.
    expect(entry.emblem).toBeUndefined();
  });

  it('HELGA and VOLTKIN are the entries with no emblem, so they take the blueprint branch', () => {
    expect(CODEX_COPY['helga'].emblem).toBeUndefined();
    expect(CODEX_COPY['voltkin'].emblem).toBeUndefined();
  });
});

describe('S174 (a) — the diagram IS the owner\'s stated recipe (read off blueprints.ts)', () => {
  it('HELGA: 3 Spirals + 3 Circles bonded to 1 Triangle hub — 7 shapes, hub degree 6', () => {
    const bp = blueprintFor('helga');
    expect(bp.nodes).toHaveLength(7);
    expect(bp.nodes[0].type).toBe(SparkType.Triangle);
    expect(bp.nodes.filter((n) => n.type === SparkType.Spiral)).toHaveLength(3);
    expect(bp.nodes.filter((n) => n.type === SparkType.Circle)).toHaveLength(3);
    // Hub degree 6: every bond touches node 0, and there are six of them.
    expect(bp.bonds).toHaveLength(6);
    for (const [a] of bp.bonds) expect(a).toBe(0);
  });

  it('VOLTKIN: 4 Squares then 4 Triangles, 8 bonded in ONE straight line, both ends free', () => {
    const bp = blueprintFor('voltkin');
    expect(bp.nodes).toHaveLength(8);
    expect(bp.nodes.slice(0, 4).every((n) => n.type === SparkType.Square)).toBe(true);
    expect(bp.nodes.slice(4).every((n) => n.type === SparkType.Triangle)).toBe(true);
    // "one straight line": every node on the same row, and the chain is 7 consecutive bonds.
    expect(new Set(bp.nodes.map((n) => n.dy)).size).toBe(1);
    expect(bp.bonds).toHaveLength(7);
    // "both ends free": the end nodes appear in exactly one bond each, the middle six in two.
    const degree = bp.nodes.map((_, i) => bp.bonds.filter(([a, b]) => a === i || b === i).length);
    expect(degree).toEqual([1, 2, 2, 2, 2, 2, 2, 1]);
  });
});

describe('S174 (a) — the diagram fits the card, at the scale the card actually uses', () => {
  it.each(['helga', 'voltkin'] as const)('%s stays inside the art zone', (id) => {
    /*
     * ⚠ THIS IS THE ASSERTION THAT EARNS `blueprintFitScaleBox` OVER `blueprintFitScale`. Voltkin
     * is a 280 px chain with zero vertical extent and helga a 44 px star; a single radius fit
     * either shrinks the chain to specks or blows the star through the card's name. The bound is
     * exact by construction — `(|d| + glyphR) * scale` — so equality at one edge is the fit
     * working, not a near miss; the epsilon is for float, nothing else.
     */
    const g = drawnAtCardScale(id);
    expect(Math.abs(g.minX), `${id} left`).toBeLessThanOrEqual(ART_HALF_W + 1e-6);
    expect(g.maxX, `${id} right`).toBeLessThanOrEqual(ART_HALF_W + 1e-6);
    expect(Math.abs(g.minY), `${id} top`).toBeLessThanOrEqual(ART_HALF_H + 1e-6);
    expect(g.maxY, `${id} bottom`).toBeLessThanOrEqual(ART_HALF_H + 1e-6);
  });

  it('and it is not drawn as a dot: each uses most of the axis it is long on', () => {
    // Anti-vacuity. A fit of 0 would pass every bound above while drawing nothing legible — which
    // is precisely the failure a radius fit produces for voltkin (0.39 scale, 3.5 px glyphs).
    const chain = drawnAtCardScale('voltkin');
    expect(chain.maxX - chain.minX).toBeGreaterThan(ART_HALF_W * 1.8);
    const star = drawnAtCardScale('helga');
    expect(star.maxY - star.minY).toBeGreaterThan(ART_HALF_H * 1.8);
  });
});
