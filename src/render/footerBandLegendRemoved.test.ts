/**
 * SPARK — S169 (owner R153) — **THE SIX-SHAPE KEY IS GONE, AND THE STRIP SAYS IT INSTEAD.**
 *
 * Owner, verbatim: *"in the footer where there are the tiers i want you to do two things next
 * session - something small. you see those six shapes on the left side with their colors - thats
 * illogical to have them. maybe just remove them and make the shapes on the right side (where the
 * queue menue is) colored with those colors (showing the races that own them)."*
 *
 * ## ⭐ TWO THINGS, AND THE SECOND ONE IS WHY THE FIRST IS NOT A DELETION
 *
 * He is not asking for the colours to go away — he is asking them to move somewhere that means
 * something. A standalone key answering *"what shape is what type"* is redundant next to the six
 * shapes you actually click; the same six shapes, tinted by the race that owns them, say it in
 * place. So the key was removed AND the palette/queue glyphs took its colour.
 *
 * ## ⛔ WHY AN "IT IS GONE" TEST, WHICH SOUNDS LIKE TESTING NOTHING
 *
 * Because he called it *"something small"*, and small removals in this codebase are exactly where
 * residue survives — S158 removed a defective clause from three of four star recipes, announced
 * four, and left the fourth live for a session. A legend removal has SIX sites (a factory and two
 * constants in `renderer.ts`, a field, a per-frame re-anchor, an `attachLegend` and a
 * `legendAnchor` in `footerBand.ts`, plus staging and a visibility gate in `main.ts`), and leaving
 * any of them behind is invisible: dead code compiles, and a container nobody adds to the stage
 * draws nothing. Source-text assertions are the only thing that can see an ABSENCE — the same
 * technique `registerAll.test.ts` uses, and for the same reason.
 *
 * ## ⚠ AND ONE CLAIM IN THE DESIGN NOTE WAS WRONG, WHICH IS WORTH RECORDING
 *
 * R153's write-up warned that the legend "is a REGISTERED HUD SURFACE, so its rect must come out of
 * `hudSurfaces()` too". It is not: the surface list is score-rows, charge-dots, raid-pips, q-hint,
 * top-centre-plate, tier-banner, beta-badge, settings-gear, connection-dot, energy-gauge,
 * progress-rail and exit-button. The key was never registered — it was positioned off the live chip
 * row instead. Verified before removing anything, and asserted below so the correction sticks.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SparkType } from '../constants.ts';
import { ALL_RACES, RACE_COLORS, RACE_FEED_SHAPE, RACE_FOR_SHAPE, raceColorForShape } from '../state/races.ts';
import { hudSurfaces } from './ui.ts';

const src = (rel: string): string => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

/** Comments mention the key by name on purpose (the removal is documented); strip them first. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('S169 R153 — the six-shape key is removed, with no residue', () => {
  it('⛔⛔ NO legend code survives in any of the three files that carried it', () => {
    const files = ['render/renderer.ts', 'render/footerBand.ts', 'main.ts'];
    for (const f of files) {
      const code = stripComments(src(f));
      for (const sym of ['makeLegend', 'legendAnchor', 'attachLegend', 'LEGEND_WIDTH', 'LEGEND_SPRITE_STEP', 'LEGEND_GAP']) {
        expect(code.includes(sym), `${f} still references ${sym} in CODE`).toBe(false);
      }
    }
  });

  it('⛔ and `main.ts` no longer stages or gates a legend container', () => {
    const code = stripComments(src('main.ts'));
    expect(code.includes('addChild(legend)')).toBe(false);
    expect(code.includes('legend.visible')).toBe(false);
  });

  it('CONTROL — the scan is not vacuous: a symbol that IS still there is found', () => {
    // If `stripComments` ever over-stripped (or a path went wrong), every assertion above would
    // pass on an empty string. This proves the reader is actually reading code.
    expect(stripComments(src('render/footerBand.ts')).includes('shapeStripLayout')).toBe(true);
  });

  it('⚠ the design note was WRONG — the legend was never a registered HUD surface', () => {
    // Recorded because the note's warning ("its rect must come out of hudSurfaces() too") would
    // have sent the next reader looking for a rect that never existed.
    const names = hudSurfaces({
      rows: 4, rowWidth: 160, comboWidth: 200, comboHeight: 30,
      clockWidth: 90, clockHeight: 26, tierWidth: 120, tierHeight: 24, badgeWidth: 60,
    } as never).map((s) => s.name);
    expect(names.some((n) => n.includes('legend'))).toBe(false);
    expect(names.length, 'CONTROL: surfaces really were enumerated').toBeGreaterThan(5);
  });
});

describe('S169 R153 — the strip is tinted by the race that owns each shape', () => {
  it('⭐⭐ every one of the six shapes maps to exactly one race, and to that race`s colour', () => {
    for (const race of ALL_RACES) {
      const shape = RACE_FEED_SHAPE[race];
      expect(RACE_FOR_SHAPE[shape], `${race} owns its feed shape`).toBe(race);
      expect(raceColorForShape(shape), `${race} colour`).toBe(RACE_COLORS[race]);
    }
  });

  it('⛔ the mapping is a BIJECTION — six races, six distinct shapes', () => {
    // "the races that OWN them" only has an answer while this holds. If a seventh race ever shares
    // a feed shape, the inverse silently picks whichever race the loop visited last — so the
    // property that makes the whole feature meaningful is asserted rather than assumed.
    const shapes = ALL_RACES.map((r) => RACE_FEED_SHAPE[r]);
    expect(new Set(shapes).size, 'distinct feed shapes').toBe(ALL_RACES.length);
    expect(Object.keys(RACE_FOR_SHAPE).length).toBe(ALL_RACES.length);
  });

  it('⭐ a shape no race owns returns null, so the caller keeps its existing tint', () => {
    // `null` rather than a fallback colour: a future seventh shape must degrade to today's look,
    // not to an arbitrary hue nobody chose.
    const owned = new Set(ALL_RACES.map((r) => RACE_FEED_SHAPE[r]));
    const unowned = (Object.values(SparkType) as SparkType[]).filter(
      (t) => typeof t === 'number' && !owned.has(t),
    );
    for (const t of unowned) expect(raceColorForShape(t)).toBeNull();
  });

  it('⭐⭐ BOTH strip rows actually pass the race colour to the glyph — palette AND queue', () => {
    // The behaviour lives inside a Pixi draw call, so the wiring is asserted at the source. Two
    // rows, two call sites: tinting one and forgetting the other is precisely the "three of four
    // sites" failure this repo keeps hitting, and it would look correct in half the footer.
    const code = stripComments(src('render/footerBand.ts'));
    const tinted = [...code.matchAll(/drawSparkGlyph\([^)]*raceColorForShape\([^)]*\)[^)]*\)/g)];
    expect(tinted.length, 'both the palette row and the queue row are tinted').toBe(2);
    // And no glyph in the strip is left on the old flat tint.
    const flat = [...code.matchAll(/drawSparkGlyph\([^)]*,\s*TINT_ENABLED\s*\)/g)];
    expect(flat.length, 'no strip glyph still draws in the flat enabled tint').toBe(0);
  });
});
