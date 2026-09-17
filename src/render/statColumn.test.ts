/**
 * SPARK — S181: **THE STAT VALUE MUST NOT PRINT INSIDE ITS OWN LABEL.**
 *
 * The owner screenshotted this four times. The card read `CONNECT4RS`, `CONNECT3RS`, `CONNECT9RS`
 * — the connector COUNT drawn on top of the word CONNECTORS — while `SHAPES 4` on the very same
 * card was clean. `characterSheet.draw` printed every value at a hard-coded `+42px`, which clears a
 * 6-character label at 11px monospace and does not clear a 10-character one.
 *
 * ⛔ THE REGRESSION THIS GUARDS IS NOT "42 IS WRONG" — IT IS "A CONSTANT IS WRONG". Bumping 42 to 72
 * would fix his screenshot and re-break the moment a longer stat name is added, which the castle
 * card (RELOAD, RANGE, REGEN) and every future emplacement row make likely. So the assertions below
 * are about the RELATIONSHIP between a label and its column, never about a specific pixel.
 */
import { describe, expect, it } from 'vitest';
import { MONO_EM_RATIO, STAT_GAP_PX, statValueColumnPx } from './characterSheetModel.ts';

/** The width a monospace label occupies — the same product the column is derived from. */
function labelWidth(label: string, size: number): number {
  return label.length * size * MONO_EM_RATIO;
}

describe('S181 — statValueColumnPx clears the widest label present', () => {
  it('⛔ HIS BUG: the value column clears CONNECTORS, which the shipped +42 did not', () => {
    const col = statValueColumnPx(['CONNECTORS', 'SHAPES'], 11);
    expect(col).toBeGreaterThan(labelWidth('CONNECTORS', 11));
    // The exact defect, stated as the thing that must never be true again.
    expect(42).toBeLessThan(labelWidth('CONNECTORS', 11));
  });

  it('clears EVERY label in the set, not just the first', () => {
    const labels = ['CONNECTORS', 'SHAPES', 'ATK', 'PEN', 'RANGE'];
    const col = statValueColumnPx(labels, 11);
    for (const l of labels) expect(col).toBeGreaterThan(labelWidth(l, 11));
  });

  it("the castle's own longer rows are covered too — RELOAD, RANGE, REGEN, SHOT", () => {
    const labels = ['SHOT', 'RANGE', 'RELOAD', 'REGEN'];
    const col = statValueColumnPx(labels, 11);
    for (const l of labels) expect(col).toBeGreaterThan(labelWidth(l, 11));
  });

  it('is DERIVED, so a longer label pushes the column out rather than colliding', () => {
    const narrow = statValueColumnPx(['HP', 'DEF'], 11);
    const wide = statValueColumnPx(['HP', 'DEF', 'CONNECTORS'], 11);
    expect(wide).toBeGreaterThan(narrow);
  });

  it('scales with font size — the ratio is the invariant, not the pixel count', () => {
    expect(statValueColumnPx(['CONNECTORS'], 22)).toBeGreaterThan(
      statValueColumnPx(['CONNECTORS'], 11),
    );
  });

  it('keeps a real gap, so the number never abuts the last glyph', () => {
    const col = statValueColumnPx(['SHAPES'], 11);
    expect(col - labelWidth('SHAPES', 11)).toBeGreaterThanOrEqual(STAT_GAP_PX - 1);
  });

  it('an empty stat list is the gap alone — no NaN, no Infinity', () => {
    expect(statValueColumnPx([], 11)).toBe(STAT_GAP_PX);
  });
});
