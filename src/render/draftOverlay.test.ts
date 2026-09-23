/**
 * SPARK — the draft panel: his geometry, and the enumeration that keeps it honest.
 *
 * ⛔ **THE FILL COUNT IS THE POINT OF THIS FILE.** S182 found a source-text tripwire that was green
 * over a live bug — it proved a line EXISTED but not that the failing path REACHED it. The fix it
 * landed on, and the one copied here, is to make the enumeration MECHANICAL: count the opaque
 * `.fill({` calls in the module and pin the total, naming the hit-test that pairs with each. A sixth
 * fill fails this test until somebody either hit-tests it or declares it decorative in writing.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PANEL_H,
  PANEL_W,
  PANEL_X,
  PANEL_Y,
  draftHitTest,
  formatDraftClock,
  generalTileRect,
  racialTileRect,
} from './draftOverlay.ts';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FOOTER_TOP_Y,
  PHYSICS_HZ,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';

describe('his geometry, derived from the spawn zone rather than guessed', () => {
  it('is taller than the spawn disc, but only just — "slightly bigger than the circle"', () => {
    const diameter = SPAWNER_RADIUS * 2;
    expect(PANEL_H).toBeGreaterThan(diameter);
    expect(PANEL_H).toBeLessThan(diameter * 1.25);
  });

  it('is about twice as long as it is tall — "the length is about twice longer"', () => {
    expect(PANEL_W / PANEL_H).toBeGreaterThan(1.9);
    expect(PANEL_W / PANEL_H).toBeLessThan(2.25);
  });

  it('covers the spawn disc, so the spawners are not visible behind it', () => {
    expect(PANEL_X).toBeLessThanOrEqual(SPAWNER_CENTER_X - SPAWNER_RADIUS);
    expect(PANEL_X + PANEL_W).toBeGreaterThanOrEqual(SPAWNER_CENTER_X + SPAWNER_RADIUS);
    expect(PANEL_Y).toBeLessThanOrEqual(SPAWNER_CENTER_Y - SPAWNER_RADIUS);
    expect(PANEL_Y + PANEL_H).toBeGreaterThanOrEqual(SPAWNER_CENTER_Y + SPAWNER_RADIUS);
  });

  it('is centred on the spawn zone', () => {
    expect(Math.abs(PANEL_X + PANEL_W / 2 - SPAWNER_CENTER_X)).toBeLessThanOrEqual(1);
    expect(Math.abs(PANEL_Y + PANEL_H / 2 - SPAWNER_CENTER_Y)).toBeLessThanOrEqual(1);
  });

  it('⛔ clears the FOOTER, which is the surface that has swallowed clicks three times', () => {
    // canon §4b: the footer's opaque plates eat clicks on purpose. A panel overlapping them would
    // be unclickable along its bottom edge, and the cause would look like a draft bug.
    expect(PANEL_Y + PANEL_H).toBeLessThan(FOOTER_TOP_Y);
  });

  it('stays on the canvas on all four sides', () => {
    expect(PANEL_X).toBeGreaterThanOrEqual(0);
    expect(PANEL_Y).toBeGreaterThanOrEqual(0);
    expect(PANEL_X + PANEL_W).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(PANEL_Y + PANEL_H).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });

  it('splits into two tiles that do not overlap', () => {
    const g = generalTileRect();
    const r = racialTileRect();
    expect(g.x + g.w).toBeLessThan(r.x);
    expect(g.w).toBe(r.w);
    expect(g.y).toBe(r.y);
    expect(g.h).toBe(r.h);
  });
});

describe('the hit-test, and the tile that deliberately has none', () => {
  it('picks up a click in the middle of the LEFT tile', () => {
    const g = generalTileRect();
    expect(draftHitTest(g.x + g.w / 2, g.y + g.h / 2)).toBe('general');
  });

  it('⛔ returns NOTHING for the right tile — "it’s not choosable" is his instruction', () => {
    const r = racialTileRect();
    expect(draftHitTest(r.x + r.w / 2, r.y + r.h / 2)).toBeNull();
    expect(draftHitTest(r.x + 1, r.y + 1)).toBeNull();
    expect(draftHitTest(r.x + r.w - 1, r.y + r.h - 1)).toBeNull();
  });

  it('returns nothing for the seam, the padding and anywhere off the plate', () => {
    expect(draftHitTest(PANEL_X + 2, PANEL_Y + 2)).toBeNull(); // inside the plate, outside the tile
    expect(draftHitTest(0, 0)).toBeNull();
    expect(draftHitTest(CANVAS_WIDTH - 1, CANVAS_HEIGHT - 1)).toBeNull();
  });

  it('is inclusive of its own edges, so a click on the border is not swallowed', () => {
    const g = generalTileRect();
    expect(draftHitTest(g.x, g.y)).toBe('general');
    expect(draftHitTest(g.x + g.w, g.y + g.h)).toBe('general');
  });
});

describe('⛔ the mechanical fill enumeration (the S182 lesson)', () => {
  /**
   * Every opaque `.fill({` in the module, and the hit-test it pairs with. "decorative" means the
   * surface is drawn but must never be clickable — and the pairing is what a future session checks
   * rather than re-deriving.
   */
  const FILLS: ReadonlyArray<{ what: string; hitTest: string }> = [
    { what: 'the plate behind both tiles', hitTest: 'decorative — the plate itself is not a button' },
    { what: 'the LEFT (general) tile', hitTest: "draftHitTest -> 'general'" },
    { what: 'the RIGHT (racial) tile', hitTest: 'NONE, deliberately — his "not choosable"' },
    { what: 'the hover detail plate', hitTest: 'decorative — appears only under the cursor' },
  ];

  it('the module contains exactly the enumerated opaque fills, and no more', () => {
    const src = readFileSync(join(__dirname, 'draftOverlay.ts'), 'utf8');
    // Count only CODE, so the docblocks that discuss fills do not inflate the total.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    const fills = code.match(/\.fill\(\{/g) ?? [];
    expect(
      fills.length,
      'A new opaque surface appeared in draftOverlay.ts. Add it to FILLS with the hit-test it pairs ' +
        'with, or say in writing that it is decorative. A surface without a hit-test is how S182 ' +
        'shipped a cost plate that swallowed clicks.',
    ).toBe(FILLS.length);
  });

  it('exactly one enumerated surface is clickable', () => {
    const clickable = FILLS.filter((f) => f.hitTest.startsWith('draftHitTest'));
    expect(clickable).toHaveLength(1);
  });
});

describe('the countdown', () => {
  it('reads in seconds, because that is what he sees', () => {
    expect(formatDraftClock(PHYSICS_HZ * 90)).toBe('1:30');
    expect(formatDraftClock(PHYSICS_HZ * 5)).toBe('0:05');
    expect(formatDraftClock(0)).toBe('0:00');
  });

  it('rounds UP, so it never shows 0:00 while time remains', () => {
    expect(formatDraftClock(1)).toBe('0:01');
  });
});
