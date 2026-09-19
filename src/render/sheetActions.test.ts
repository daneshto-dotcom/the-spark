/**
 * SPARK — S181: **FIX / SCRAP / FEED, ON THE CARD.**
 *
 * Owner, S181 playtest: *"Similarly, towers lost their scrap and fix. That's wrong. So when you
 * click on Piranha Tower, you should see everything you see now … and underneath, it should have
 * also scrap or fix, and how much it costs to fix."* And: *"if it's like a bat tower, a tier three
 * tower, they can pay to buy more tier three soldiers. Just like it used to be last session, before
 * you removed the scrape and the fix and the buy a character with the primitive."*
 *
 * ⛔ THE DEFECT WAS A BLIND RENDERER, NOT MISSING LOGIC. `CharacterSheetView.actions` has carried the
 * whole `StructureActionView` since S180 and `characterSheet.draw` read none of it — `heightFor` did
 * not even reserve space, so nothing looked clipped.
 *
 * ⭐ THE LAST DESCRIBE IN THIS FILE IS THE ONE THAT MATTERS MOST, and it is the S180 lesson made
 * mechanical: green gates are not proof a feature is wired. A patch adding the sheet to a click
 * silently failed to apply last session and typecheck, 4,588 tests, the build and the deploy were
 * ALL green while the feature was dead. Source-text tripwires on the call sites are what catch that.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { actionBlockHeight, layoutSheetActions, type SheetActionSlot } from './characterSheetModel.ts';

const RECT = { x: 100, y: 100, w: 236, h: 300 };
const PAD = 12;

function btn(kind: string, over: Partial<SheetActionSlot> = {}): SheetActionSlot {
  return { kind, label: kind, caption: '', enabled: true, x: 0, y: 0, w: 0, h: 0, ...over };
}

describe('S181 — actionBlockHeight reserves exactly what is drawn', () => {
  it('costs NOTHING when there are no actions, so an enemy card is unchanged', () => {
    expect(actionBlockHeight([])).toBe(0);
  });

  it('a wide row alone is shorter than a wide row plus the feed strip', () => {
    const wide = actionBlockHeight([btn('FIX'), btn('SCRAP')]);
    const both = actionBlockHeight([btn('FIX'), btn('SCRAP'), btn('FEED')]);
    expect(wide).toBeGreaterThan(0);
    expect(both).toBeGreaterThan(wide);
  });

  it('a FEED-only set still reserves height — the outside-BUILD case', () => {
    // `structureActionModel` drops FIX/SCRAP outside BUILD and keeps the feed strip; the card must
    // not collapse to zero and clip it.
    expect(actionBlockHeight([btn('FEED'), btn('FEED')])).toBeGreaterThan(0);
  });
});

describe('S181 — layoutSheetActions places buttons INSIDE the card', () => {
  it('⛔ discards the popover coordinates instead of scattering them across the screen', () => {
    // The incoming geometry is for a board-anchored popover. Re-using it is the bug this guards.
    const far = [btn('FIX', { x: 9999, y: -500, w: 7, h: 7 })];
    const [out] = layoutSheetActions(far, RECT);
    expect(out).toBeDefined();
    expect(out?.x).not.toBe(9999);
    expect(out?.y).not.toBe(-500);
  });

  it('every button lands within the card rect, horizontally and vertically', () => {
    const all = [btn('FIX'), btn('SCRAP'), ...Array.from({ length: 6 }, () => btn('FEED'))];
    for (const b of layoutSheetActions(all, RECT)) {
      expect(b.x).toBeGreaterThanOrEqual(RECT.x);
      expect(b.x + b.w).toBeLessThanOrEqual(RECT.x + RECT.w);
      expect(b.y).toBeGreaterThanOrEqual(RECT.y);
      expect(b.y + b.h).toBeLessThanOrEqual(RECT.y + RECT.h);
    }
  });

  it('the wide row fills the inner width and its buttons do not overlap', () => {
    const out = layoutSheetActions([btn('FIX'), btn('SCRAP')], RECT);
    expect(out).toHaveLength(2);
    const a = out[0];
    const b = out[1];
    expect(a?.x).toBe(RECT.x + PAD);
    expect(b?.x).toBeGreaterThanOrEqual((a?.x ?? 0) + (a?.w ?? 0));
    expect((b?.x ?? 0) + (b?.w ?? 0)).toBeCloseTo(RECT.x + RECT.w - PAD, 5);
  });

  it('a LONE wide button spans the full inner width', () => {
    const out = layoutSheetActions([btn('SCRAP')], RECT);
    expect(out[0]?.w).toBeCloseTo(RECT.w - PAD * 2, 5);
  });

  it('the FEED strip sits on its OWN row beneath the wide row', () => {
    const out = layoutSheetActions([btn('FIX'), btn('FEED')], RECT);
    const fix = out.find((b) => b.kind === 'FIX');
    const feed = out.find((b) => b.kind === 'FEED');
    expect(fix).toBeDefined();
    expect(feed).toBeDefined();
    expect(feed?.y ?? 0).toBeGreaterThanOrEqual((fix?.y ?? 0) + (fix?.h ?? 0));
  });

  it('the FEED strip is CENTRED on its own occupancy — no dead left gap on a short strip', () => {
    const out = layoutSheetActions(Array.from({ length: 3 }, () => btn('FEED')), RECT);
    const left = Math.min(...out.map((b) => b.x));
    const right = Math.max(...out.map((b) => b.x + b.w));
    expect((left + right) / 2).toBeCloseTo(RECT.x + RECT.w / 2, 5);
  });

  it('carries kind, caption, enabled and sparkType through VERBATIM', () => {
    // The pricing and affordability are the model's. Re-deriving any of it here would be the
    // bespoke-constant defect CLAUDE.md's stat-ladder section forbids.
    const src = [btn('FIX', { caption: 'COSTS 2', enabled: false }), btn('FEED', { sparkType: 3 })];
    const out = layoutSheetActions(src, RECT);
    expect(out.find((b) => b.kind === 'FIX')?.caption).toBe('COSTS 2');
    expect(out.find((b) => b.kind === 'FIX')?.enabled).toBe(false);
    expect(out.find((b) => b.kind === 'FEED')?.sparkType).toBe(3);
  });

  it('an empty set lays out nothing', () => {
    expect(layoutSheetActions([], RECT)).toEqual([]);
  });
});

describe('S181 — ⛔ THE CALL SITES EXIST (the S180 green-gates tripwire)', () => {
  const sheet = readFileSync('src/render/characterSheet.ts', 'utf-8');
  const model = readFileSync('src/render/characterSheetModel.ts', 'utf-8');
  const controls = readFileSync('src/input/controls.ts', 'utf-8');
  const main = readFileSync('src/main.ts', 'utf-8');

  it('the card actually CALLS layoutSheetActions and draws each slot', () => {
    /*
     * ⚠ RE-PINNED IN S183 FROM THE EXACT CALL STRING TO THE RELATIONSHIP, for the same reason the
     * `heightFor` assertion below was re-pinned in S181: this read
     * `'layoutSheetActions(v.actions.buttons, v.rect)'` verbatim and went red when S183 added a
     * third argument (the feed caption's width, so the chip and its caption are centred as one
     * row). An assertion that breaks on a new argument is measuring the SPELLING of a call.
     *
     * What must stay true is that the card's OWN buttons and the card's OWN rect reach the layout —
     * a trailing argument is free to arrive.
     */
    expect(sheet).toMatch(/layoutSheetActions\(v\.actions\.buttons,\s*v\.rect[,)]/);
    expect(sheet).toContain('this.drawActionButton(b, accent)');
  });

  it('the structure branch RESERVES the action height', () => {
    /*
     * ⚠ RE-PINNED IN S181 FROM A LITERAL CALL STRING TO THE RELATIONSHIP. This asserted
     * `heightFor(stats.length, owned !== null, actions?.buttons ?? [])` verbatim and went red when a
     * fourth argument was added for the description + build-recipe strip — a correct change. An
     * assertion that breaks on a new argument is measuring the SPELLING of a call, which is exactly
     * the brittle shape `verify-session-claims` warns about for chained commands.
     *
     * What must stay true is that the ACTION BUTTONS reach `heightFor`, because a block that is
     * drawn without being reserved is the defect this whole file exists for — and it is invisible,
     * since nothing looks clipped when no space was ever allocated.
     */
    expect(model).toMatch(/heightFor\([\s\S]{0,160}?actions\?\.buttons \?\? \[\]/);
    // And the new blocks are reserved the same way, by the same function.
    expect(model).toContain('buildInfoHeight(info)');
  });

  it('⛔ the action click is tested BEFORE the card swallows the click', () => {
    // If `isOver` ran first it would eat every button press, which is the one ordering that makes
    // this whole feature silently dead while every gate stays green.
    const actionAt = controls.indexOf('this.characterSheet.actionAt(');
    const swallow = controls.indexOf('this.characterSheet.isOver(this.cursor.x, this.cursor.y)) return true');
    expect(actionAt).toBeGreaterThan(-1);
    expect(swallow).toBeGreaterThan(-1);
    expect(actionAt).toBeLessThan(swallow);
  });

  it('main.ts dispatches the card actions, and FEED reads the spawner off the CARD', () => {
    expect(main).toContain('controls.setSheetActionHandler(');
    expect(main).toContain('characterSheet.actionFeedSpawnerId()');
  });

  it('the card wears the race accent on its plate and its title', () => {
    expect(model).toContain('accent: accentFor(world,');
    expect(sheet).toContain('const accent = v.accent ?? EDGE');
  });
});
