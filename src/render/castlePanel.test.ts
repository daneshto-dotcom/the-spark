/**
 * SPARK — S136 P0 castle context panel: the pure model + geometry.
 *
 * WHY THESE TESTS EXIST, SPECIFICALLY. The owner played the V6-1.2 build and reported "the build
 * extra gatherer or increase speed is not even clickable". Driving the real app in headless Chromium
 * this session proved the buttons were NOT broken — SPEED worked in all six mode×viewport cells.
 * The actual defect was that BUY is unaffordable from t=0 (STARTING_VICTORY_POINTS 100 vs
 * GATHERER_PRICE 105) and the old footer rendered that as an unexplained dim box, which a player
 * cannot distinguish from a dead control.
 *
 * So the thing under test is the REASON, not merely the boolean: every disabled state must name its
 * blocker. `castleControlsModel` is pure and world-only for exactly that reason — the S130 lesson is
 * that logic which lives only inside a draw path cannot be driven headlessly and therefore ships
 * unverified (V6-0.2's tier banner passed CHECK while never rendering once).
 *
 * `panelOrigin` is tested for the LEFT FLIP because the keeps sit on a ring around the arena centre:
 * seats on the right-hand arc would push a right-opening panel off-canvas, and that is invisible
 * until someone plays that specific seat.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_SPARK_TYPES,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CASTLE_BANK_CAP,
  GATHERER_MAX_SPEED_LEVEL,
  GATHERER_PRICE,
  GATHERER_SPEED_UPGRADE_PRICE,
  KEEP_RING_SEATS,
  STARTING_VICTORY_POINTS,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { castleAnchor, makeGatherer } from '../state/gatherers/gatherer.ts';
import { makeWorld, type World } from '../state/world.ts';
import { asGathererId, asPlayerId } from '../types.ts';
import {
  bankRowCount,
  bankSlotsPerRow,
  bankSlotsPerRowSpread,
  bankStripHeight,
  castleControlsModel,
  CHIP_H,
  CHIP_W,
  chipOrigin,
  MAX_CHIPS,
  PALETTE_BTN,
  PALETTE_TYPES,
  paletteOrigin,
  paletteStripHeight,
  queueStripHeight,
  PANEL_W,
  panelHeight,
  panelOrigin,
  panelRect,
  ROW_FONT_ADVANCE,
  ROW_INNER_W,
  SLOT_GAP,
  SLOT_H,
  SLOT_W,
  slotOrigin,
} from './castlePanel.ts';

const P0 = asPlayerId(0);

/** A PLAYING world where seat 0 is local, holds `score`, and owns `gatherers` units at `speedLevel`. */
function world(score: number, gatherers = 1, speedLevel = 0): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  w.tick = 400;
  w.localPlayerId = P0;
  if (!w.players.has(P0)) w.players.set(P0, makeIdlePlayer(P0, 0x3bd7ff, { x: 0, y: 0 }));
  w.scoreByPlayer.set(P0, score);
  for (let i = 0; i < gatherers; i++) {
    const id = asGathererId(i);
    const g = makeGatherer({ id, ownerPlayerId: P0, pos: { x: 0, y: 0 }, spawnedAtTick: 0 });
    g.speedLevel = speedLevel;
    w.gatherers.set(id, g);
  }
  return w;
}

const row = (w: World, key: string) => {
  const r = castleControlsModel(w).find((c) => c.key === key);
  if (r === undefined) throw new Error(`no row ${key}`);
  return r;
};

describe('S136 P0 — castleControlsModel: a disabled control always names its blocker', () => {
  it('THE OWNER-REPORTED STATE: at the opening balance, BUY is disabled and says NEED 105', () => {
    // This is the exact t=0 state of a real match, and the reason the owner read the control as
    // broken. 100 < 105 is deliberate design (constants.ts documents the opening choice) — but it
    // MUST announce itself.
    const w = world(STARTING_VICTORY_POINTS);
    expect(STARTING_VICTORY_POINTS).toBeLessThan(GATHERER_PRICE); // guard the premise
    const buy = row(w, 'buyGatherer');
    expect(buy.enabled).toBe(false);
    expect(buy.reason).toBe(`NEED ${GATHERER_PRICE}`);
  });

  it('and SPEED is ENABLED at the same instant — the button the owner said was dead is live', () => {
    const up = row(world(STARTING_VICTORY_POINTS), 'upgradeSpeed');
    expect(up.enabled).toBe(true);
    expect(up.reason).toBe('');
  });

  it('BUY enables exactly at the price boundary, not one point below it', () => {
    expect(row(world(GATHERER_PRICE - 1), 'buyGatherer').enabled).toBe(false);
    expect(row(world(GATHERER_PRICE), 'buyGatherer').enabled).toBe(true);
  });

  it('SPEED enables exactly at its own price boundary', () => {
    expect(row(world(GATHERER_SPEED_UPGRADE_PRICE - 1), 'upgradeSpeed').enabled).toBe(false);
    expect(row(world(GATHERER_SPEED_UPGRADE_PRICE - 1), 'upgradeSpeed').reason).toBe(
      `NEED ${GATHERER_SPEED_UPGRADE_PRICE}`,
    );
    expect(row(world(GATHERER_SPEED_UPGRADE_PRICE), 'upgradeSpeed').enabled).toBe(true);
  });

  it('a score fractionally below the price is disabled (income accrues in fractions)', () => {
    // Score is a float — it accrues per tick from complexity — so the near-miss case is the common
    // one, not an edge case.
    expect(row(world(GATHERER_PRICE - 0.4), 'buyGatherer').enabled).toBe(false);
    expect(row(world(GATHERER_PRICE + 0.4), 'buyGatherer').enabled).toBe(true);
    // ⚠ NOTE ON `Math.floor` IN castleControlsModel: it is REDUNDANT for this verdict and a
    // mutation removing it correctly survives. Prices are integers, so `x >= P` implies
    // `floor(x) >= P` and vice versa — the floor can never flip the boolean. It is retained
    // because the row LABEL and the reason string are read by a human against a displayed integer
    // score, and it would become load-bearing the day a price stops being a whole number. Recorded
    // here rather than "strengthened" into a fake assertion: the S135 lesson is that a surviving
    // mutation may mean a redundant line, not a weak test.
  });

  it('owning NO units reports NO UNITS, not a price — the reducer refuses to charge for nothing', () => {
    const up = row(world(9999, 0), 'upgradeSpeed');
    expect(up.enabled).toBe(false);
    expect(up.reason).toBe('NO UNITS');
  });

  it('every unit already at max level reports MAX SPEED even with unlimited points', () => {
    const up = row(world(9999, 2, GATHERER_MAX_SPEED_LEVEL), 'upgradeSpeed');
    expect(up.enabled).toBe(false);
    expect(up.reason).toBe('MAX SPEED');
  });

  it('ONE upgradable unit among maxed ones keeps SPEED live (the reducer still steps that one)', () => {
    const w = world(9999, 0);
    for (const [i, lvl] of [GATHERER_MAX_SPEED_LEVEL, GATHERER_MAX_SPEED_LEVEL - 1].entries()) {
      const id = asGathererId(i);
      const g = makeGatherer({ id, ownerPlayerId: P0, pos: { x: 0, y: 0 }, spawnedAtTick: 0 });
      g.speedLevel = lvl;
      w.gatherers.set(id, g);
    }
    expect(row(w, 'upgradeSpeed').enabled).toBe(true);
  });

  it('another seat\'s gatherers do not count as yours', () => {
    const w = world(9999, 0);
    const id = asGathererId(7);
    w.gatherers.set(
      id,
      makeGatherer({ id, ownerPlayerId: asPlayerId(1), pos: { x: 0, y: 0 }, spawnedAtTick: 0 }),
    );
    expect(row(w, 'upgradeSpeed').reason).toBe('NO UNITS');
  });

  describe('input locks — carried over from the footer these rows replace', () => {
    // These rows live on app.stage and their pointertap never passes through Controls.isInputLocked(),
    // so the lock has to be re-checked here or a benched player could spend on an invisible control.
    it('a live NONET trial locks both rows', () => {
      const w = world(9999);
      w.sudoku = { dummy: true } as never;
      for (const c of castleControlsModel(w)) {
        expect(c.enabled).toBe(false);
        expect(c.reason).toBe('LOCKED');
      }
    });

    it('the local player mid-cinematic locks both rows', () => {
      const w = world(9999);
      w.activeCinematicPlayerId = P0;
      expect(row(w, 'buyGatherer').reason).toBe('LOCKED');
    });

    it("ANOTHER player's cinematic does NOT lock yours", () => {
      const w = world(9999);
      w.activeCinematicPlayerId = asPlayerId(1);
      expect(row(w, 'buyGatherer').enabled).toBe(true);
    });

    it('a benched (eaten) player is locked; the same player after the bench expires is not', () => {
      const w = world(9999);
      const me = w.players.get(P0)!;
      me.benchedUntilTick = w.tick + 100;
      expect(row(w, 'buyGatherer').reason).toBe('LOCKED');
      me.benchedUntilTick = w.tick - 1;
      expect(row(w, 'buyGatherer').enabled).toBe(true);
    });
  });
});

describe('S136 P0 — row labels FIT their box (the defect the assertions could not see)', () => {
  // The first cut of the panel appended the reason to the label, so a disabled BUY read
  // "BUY GATHERER  105   NEED 105" and visibly overflowed its own row in the verification
  // screenshot — while every state assertion stayed green. This is the cheap guard for that class.
  const widest = (w: World) =>
    Math.max(...castleControlsModel(w).map((c) => c.label.length)) * ROW_FONT_ADVANCE;

  it('no label overflows in ANY reachable state', () => {
    const states: Array<[string, World]> = [
      ['opening balance (BUY disabled: NEED 105)', world(STARTING_VICTORY_POINTS)],
      ['both affordable', world(9999)],
      ['no units (SPEED: NO UNITS)', world(9999, 0)],
      ['all maxed (SPEED: MAX SPEED)', world(9999, 2, GATHERER_MAX_SPEED_LEVEL)],
      ['broke (both NEED n)', world(0)],
    ];
    for (const [name, w] of states) {
      expect(widest(w), `${name} must fit ${ROW_INNER_W}px`).toBeLessThanOrEqual(ROW_INNER_W);
    }
  });

  it('a disabled label states the blocker ONCE, not the price and the blocker both', () => {
    const buy = row(world(STARTING_VICTORY_POINTS), 'buyGatherer');
    expect(buy.label).toContain(`NEED ${GATHERER_PRICE}`);
    // "105" appears exactly once — twice was the overflow bug.
    expect(buy.label.match(new RegExp(String(GATHERER_PRICE), 'g'))?.length).toBe(1);
  });

  it('an enabled label shows the PRICE (so you know what it costs before you commit)', () => {
    expect(row(world(9999), 'buyGatherer').label).toContain(String(GATHERER_PRICE));
    expect(row(world(9999), 'upgradeSpeed').label).toContain(String(GATHERER_SPEED_UPGRADE_PRICE));
  });
});

describe('S136 P0 — panelOrigin / panelRect geometry', () => {
  it('never leaves the canvas for ANY seat on the keep ring', () => {
    // The keeps ring the arena centre, so this is the test that catches an off-screen panel for one
    // unlucky seat rather than leaving it to be discovered in play.
    for (let seat = 0; seat < KEEP_RING_SEATS; seat++) {
      const a = castleAnchor(seat);
      const r = panelRect(panelOrigin(a.x, a.y, 2), 2);
      expect(r.x, `seat ${seat} left`).toBeGreaterThanOrEqual(0);
      expect(r.y, `seat ${seat} top`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, `seat ${seat} right`).toBeLessThanOrEqual(CANVAS_WIDTH);
      // ⚠ S140 P1 — THE MISSING FOURTH SIDE. This sweep shipped asserting three edges. HEIGHT is
      // precisely the dimension a bank-strip regrid grows (52 -> 98 at cap 7), so the one test that
      // looks like it guards the panel envelope was blind to this entire change class.
      expect(r.y + r.h, `seat ${seat} bottom`).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
  });

  it('opens to the RIGHT of a keep with room, and FLIPS LEFT when it would overflow', () => {
    const mid = panelOrigin(400, 540, 2);
    expect(mid.x).toBeGreaterThan(400); // right of the anchor

    const nearRight = panelOrigin(CANVAS_WIDTH - 20, 540, 2);
    const r = panelRect(nearRight, 2);
    expect(nearRight.x).toBeLessThan(CANVAS_WIDTH - 20); // flipped to the left side
    expect(r.x + r.w).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  it('is vertically centred on the keep when there is room', () => {
    const o = panelOrigin(400, 540, 2);
    const r = panelRect(o, 2);
    expect(o.y + r.h / 2).toBeCloseTo(540, 5);
  });

  it('grows with the row count — so a tower with more upgrades still fits the same way', () => {
    expect(panelRect(panelOrigin(400, 540, 4), 4).h).toBeGreaterThan(
      panelRect(panelOrigin(400, 540, 2), 2).h,
    );
  });
});

/**
 * S140 P1 — THE BANK STRIP. This block did not exist, and its absence is the finding.
 *
 * ⚠ WHY IT MATTERS THAT THIS WAS EMPTY. The shipped S136 strip was ONE row of `CASTLE_BANK_CAP`
 * slots, so its width grew with the cap without bound. At cap 7 that is 316 px inside a 268 px plate:
 * `slotOrigin(0)` returned **x = -24** and the row hung 24 px off both edges. Every test in this file
 * stayed green, because not one of them touched a slot. The owner's cap raise would have shipped a
 * visibly broken panel with a clean CI run — the exact "perfect, tested, and never called" shape this
 * repo keeps re-learning, in its layout form.
 *
 * These are SWEPT INVARIANTS, not pinned values: the standing lesson is "pin the relationship, not the
 * value", so raising the cap again must never require editing this block. I1 is the one that goes red
 * against the pre-S140 code.
 */
describe('S140 P1 — bank strip geometry, swept across caps', () => {
  const CAPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 20] as const;
  const PANEL_PAD = (PANEL_W - ROW_INNER_W) / 2;

  it('I1 — every slot sits INSIDE the plate, at every cap (the -24px overflow guard)', () => {
    for (const cap of CAPS) {
      for (let i = 0; i < cap; i++) {
        const o = slotOrigin(i, cap);
        expect(o.x, `cap ${cap} slot ${i} left`).toBeGreaterThanOrEqual(PANEL_PAD);
        expect(o.x + SLOT_W, `cap ${cap} slot ${i} right`).toBeLessThanOrEqual(PANEL_W - PANEL_PAD);
      }
    }
  });

  it('I1b — WITNESS: the pre-S140 single-row formula genuinely fails I1 at cap 7', () => {
    // ⚠ PROVE THE GUARD, DON'T READ IT. An invariant that has never been red is a wish. This
    // reproduces the exact shipped S136 arithmetic and shows it puts slot 0 at x = -24 — 24 px
    // outside the plate — which is what I1 now forbids. If someone "simplifies" slotOrigin back to a
    // single row, I1 fails and this test explains why.
    const cap = 7;
    const oldTotal = cap * SLOT_W + (cap - 1) * SLOT_GAP;
    const oldLeft = (PANEL_W - oldTotal) / 2;
    expect(oldTotal).toBe(316);
    expect(oldLeft).toBe(-24);
    expect(oldLeft).toBeLessThan(PANEL_PAD); // the violation I1 catches
    // …and the derived layout puts that same slot back inside the plate.
    expect(slotOrigin(0, cap).x).toBeGreaterThanOrEqual(PANEL_PAD);
  });

  it('I2 — every slot sits inside the strip its own height reserves', () => {
    for (const cap of CAPS) {
      const stripTop = PANEL_PAD + 26; // TITLE_H
      for (let i = 0; i < cap; i++) {
        const o = slotOrigin(i, cap);
        expect(o.y, `cap ${cap} slot ${i} top`).toBeGreaterThanOrEqual(stripTop);
        expect(o.y + SLOT_H, `cap ${cap} slot ${i} bottom`).toBeLessThanOrEqual(
          stripTop + bankStripHeight(cap),
        );
      }
    }
  });

  it('I3 — no two slots overlap, at any cap', () => {
    for (const cap of CAPS) {
      const rects = Array.from({ length: cap }, (_, i) => slotOrigin(i, cap));
      for (let a = 0; a < rects.length; a++) {
        for (let b = a + 1; b < rects.length; b++) {
          const ra = rects[a]!;
          const rb = rects[b]!;
          const disjoint =
            ra.x + SLOT_W <= rb.x ||
            rb.x + SLOT_W <= ra.x ||
            ra.y + SLOT_H <= rb.y ||
            rb.y + SLOT_H <= ra.y;
          expect(disjoint, `cap ${cap}: slot ${a} overlaps slot ${b}`).toBe(true);
        }
      }
    }
  });

  it('I4 — ZERO DEAD BOXES: rows hold exactly `cap` slots between them', () => {
    // A fixed 4-wide grid at cap 7 renders 8 boxes for 7 slots. Spreading + per-row centring means the
    // number of drawn boxes always equals the cap exactly.
    for (const cap of CAPS) {
      const rows = bankRowCount(cap);
      const per = bankSlotsPerRowSpread(cap);
      const lastRow = cap - (rows - 1) * per;
      expect(lastRow, `cap ${cap} last row count`).toBeGreaterThanOrEqual(1);
      expect(lastRow, `cap ${cap} last row count`).toBeLessThanOrEqual(per);
      expect(per, `cap ${cap} per-row fits the plate`).toBeLessThanOrEqual(bankSlotsPerRow(cap));
    }
  });

  it('I5 — each row is centred on its OWN occupancy, so a short last row is not left-aligned', () => {
    // cap 7 = a 4-slot row above a 3-slot row; the narrower row must start further right.
    const rowTop = slotOrigin(0, 7);
    const rowBottom = slotOrigin(4, 7);
    expect(rowBottom.y).toBeGreaterThan(rowTop.y);
    expect(rowBottom.x).toBeGreaterThan(rowTop.x);
    // And it is genuinely centred: left margin === right margin.
    const leftMargin = rowBottom.x;
    const rightMargin = PANEL_W - (rowBottom.x + 3 * SLOT_W + 2 * SLOT_GAP);
    expect(leftMargin).toBeCloseTo(rightMargin, 5);
  });

  it('I6 — panelHeight ACCOUNTS for the strip: a taller strip makes a taller panel', () => {
    const twoRowCap = 7;
    expect(bankRowCount(twoRowCap)).toBe(2);
    expect(panelRect(panelOrigin(400, 540, 2, twoRowCap), 2, twoRowCap).h).toBeGreaterThan(
      panelRect(panelOrigin(400, 540, 2, 5), 2, 5).h,
    );
    expect(bankStripHeight(7) - bankStripHeight(5)).toBe(SLOT_H + SLOT_GAP);
  });

  it('I7 — the panel still fits the canvas for EVERY seat at EVERY cap', () => {
    for (const cap of CAPS) {
      for (let seat = 0; seat < KEEP_RING_SEATS; seat++) {
        const a = castleAnchor(seat);
        const r = panelRect(panelOrigin(a.x, a.y, 2, cap), 2, cap);
        expect(r.x, `cap ${cap} seat ${seat} left`).toBeGreaterThanOrEqual(0);
        expect(r.y, `cap ${cap} seat ${seat} top`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, `cap ${cap} seat ${seat} right`).toBeLessThanOrEqual(CANVAS_WIDTH);
        expect(r.y + r.h, `cap ${cap} seat ${seat} bottom`).toBeLessThanOrEqual(CANVAS_HEIGHT);
      }
    }
  });

  it('I8 — slot index round-trips: a point in slot i resolves back to i, at every cap', () => {
    // This is the assertion that binds the DRAW geometry to the CLICK geometry. The renderer sets each
    // box position from slotOrigin(i) and Pixi hit-tests the box, so if the two ever disagreed the
    // player would pull the wrong shape — silent, and invisible to a state assertion.
    for (const cap of CAPS) {
      for (let i = 0; i < cap; i++) {
        const o = slotOrigin(i, cap);
        const cx = o.x + SLOT_W / 2;
        const cy = o.y + SLOT_H / 2;
        let hit = -1;
        for (let j = 0; j < cap; j++) {
          const p = slotOrigin(j, cap);
          if (cx >= p.x && cx <= p.x + SLOT_W && cy >= p.y && cy <= p.y + SLOT_H) hit = j;
        }
        expect(hit, `cap ${cap} slot ${i} round-trip`).toBe(i);
      }
    }
  });

  it('I9 — the SHIPPED cap is laid out sanely (whatever it currently is)', () => {
    expect(bankRowCount(CASTLE_BANK_CAP)).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < CASTLE_BANK_CAP; i++) {
      const o = slotOrigin(i);
      expect(o.x, `shipped cap slot ${i}`).toBeGreaterThanOrEqual(PANEL_PAD);
      expect(o.x + SLOT_W).toBeLessThanOrEqual(PANEL_W - PANEL_PAD);
    }
  });

  it('I10 — cap 5 is BYTE-IDENTICAL to the pre-S140 single-row layout', () => {
    // The regrid must be a provable no-op at the old cap, so it could ship before the cap moved.
    expect(bankRowCount(5)).toBe(1);
    expect(bankStripHeight(5)).toBe(52);
    for (let i = 0; i < 5; i++) {
      expect(slotOrigin(i, 5)).toEqual({ x: 22 + i * 46, y: 36 });
    }
  });
});

/* ========================================================================== *
 *   S141 P2 (V6-1.4) — the order-queue strips
 * ========================================================================== */

/** TITLE_H is module-private in castlePanel.ts; mirrored here so the layout maths is assertable. */
const TITLE_H_PROBE = 26;

describe('S141 P2 — the palette + queue strips fit the plate at every count', () => {
  it('the panel still fits the canvas with both new strips added', () => {
    // panelHeight feeds panelOrigin's clamp, so a strip added to the panel WITHOUT being added to
    // panelHeight would silently push the plate off-screen for keeps on the lower arc of the ring.
    const h = panelHeight(2);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(CANVAS_HEIGHT - 16);
    // and it is genuinely taller than before the strips existed
    expect(h).toBeGreaterThan(TITLE_H_PROBE + bankStripHeight());
  });

  it('every palette button sits INSIDE the plate horizontally', () => {
    for (let i = 0; i < PALETTE_TYPES.length; i++) {
      const o = paletteOrigin(i);
      expect(o.x, `palette ${i} left`).toBeGreaterThanOrEqual(0);
      expect(o.x + PALETTE_BTN, `palette ${i} right`).toBeLessThanOrEqual(PANEL_W);
    }
  });

  it('the palette holds one button per primitive type, in enum order', () => {
    expect(PALETTE_TYPES.length).toBe(6);
    expect([...PALETTE_TYPES]).toEqual([...ALL_SPARK_TYPES]);
  });

  it('every chip sits INSIDE the plate, at every chip count 1..MAX_CHIPS', () => {
    for (let n = 1; n <= MAX_CHIPS; n++) {
      for (let i = 0; i < n; i++) {
        const o = chipOrigin(i, n);
        expect(o.x, `chip ${i}/${n} left`).toBeGreaterThanOrEqual(0);
        expect(o.x + CHIP_W, `chip ${i}/${n} right`).toBeLessThanOrEqual(PANEL_W);
      }
    }
  });

  it('each strip sits BELOW the one above it — no overlap', () => {
    const bankBottom = bankStripHeight();
    const paletteTop = paletteOrigin(0).y;
    const chipTop = chipOrigin(0, 1).y;
    expect(paletteTop).toBeGreaterThanOrEqual(bankBottom);
    expect(chipTop).toBeGreaterThanOrEqual(paletteTop + PALETTE_BTN);
  });

  it('the control rows sit below BOTH new strips (they were pushed down, not overlapped)', () => {
    const rows = castleControlsModel(makeWorld(0));
    expect(rows.length).toBe(2);
    // The chip strip's bottom must clear the top of the first control row.
    const chipBottom = chipOrigin(0, 1).y + CHIP_H;
    const firstRowTop = 10 /* PANEL_PAD */ + TITLE_H_PROBE + bankStripHeight()
      + paletteStripHeight() + queueStripHeight();
    expect(firstRowTop).toBeGreaterThanOrEqual(chipBottom);
  });
});
