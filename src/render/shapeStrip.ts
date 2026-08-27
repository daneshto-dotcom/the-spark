/**
 * SPARK — S154 P1 (owner R80): **THE SHAPE STRIP — the palette + order queue, in the FOOTER.**
 *
 * Owner, third time of asking, and the wording that finally pins it: *"always be visible on the
 * right side of the footer (after tier 8)"*. Not left of the last tier, and not only while the
 * castle is open.
 *
 * ## ⚠ THIS RESOLVES A THREE-WAY OWNER-RULING CONFLICT, and the resolution is not "the newest wins"
 *
 * `castlePanel.ts` has carried a long note arguing the palette must live in the panel:
 *   • **B4 (S134)** asked for *"A FOOTER BAR along the bottom of the screen"* holding these controls.
 *   • **S136 P0** then deleted the footer outright: *"that footer with those options should be
 *     clickable once you click on the castle and not always there. because eventually different
 *     towers and stuff will have different upgrades and they will pop up when you click on them."*
 *   • **R80** now asks for the palette and queue in the footer, permanently.
 *
 * Read carelessly, R80 simply reverses S136 P0. Read as written, S136 P0 is about **per-tower
 * upgrade controls** — *"different towers … will have different upgrades and they will pop up when
 * you click on them"* — and those stay exactly where that ruling put them: inside the panel, gated
 * on clicking a castle. The shape palette is not a per-tower upgrade; it is a **global economy
 * command** ("fetch me one of these"), which is why the owner keeps reaching for it and finding it
 * behind a click. `footerBandModel.ts` already records this same reconciliation for R36 vs S136 P0.
 * So the two rulings are separated by SUBJECT, not overruled by date.
 *
 * ## ⛔ WHY THIS IS A REWRITE IN THE FOOTER'S IDIOM AND NOT A REPARENT
 *
 * The banked plan for this priority said to REPARENT the panel's palette Containers into a footer
 * container, since they already carry their own `pointertap`. That is the wrong shape, and the
 * reason is a genuine idiom fork between the two surfaces:
 *
 *   • `castlePanel` builds ONE Pixi `Container` per control and lets **Pixi** hit-test it
 *     (`pointertap` / `pointerover` / `pointerout` per button).
 *   • `footerBand` draws the WHOLE band into ONE shared `Graphics` with pooled `Text`, and
 *     hand-rolls its hit-tests (`chipAt` / `cardAt`), because `controls.ts` must consult the very
 *     same predicates on pointermove — `controls.ts` says so in situ: *"The same isOver*
 *     predicates the CLICK path already consults are asked here on move, so the cursor can never
 *     disagree with what a click would actually hit."*
 *
 * Half-migrating gives controls that **Pixi** hit-tests but that `isOverShapeStrip` knows nothing
 * about, so the cursor, the R81 hover/press highlight and the world-click guard would each have a
 * different opinion about what the pointer is over. That is a worse defect than the one being
 * fixed, and it would be invisible to the unit suite. So the geometry is PURE and lives here, and
 * `footerBand` draws and hit-tests it through the one code path.
 *
 * ## Derived from the chip row, never hardcoded
 *
 * The strip's origin is read off THIS FRAME's chips, exactly as `legendAnchor` reads them for the
 * shape key on the opposite side. A hardcoded x that clears today's five chips would be quietly
 * wrong the day a sixth recipe complexity enters the registry, because `layoutChips` re-centres the
 * whole row and its right edge marches RIGHT by (CHIP_W + CHIP_GAP) / 2 = 38 px per tier.
 *
 * ## ⛔ AND IT HAS TO CLEAR THE SEAT-2 CASTLE PORCH
 *
 * `footerBand.ts` documents, and `footerBand.test.ts` asserts, that the chips are centred because
 * the `QUADRANTS_4P` bottom-quadrant porches sit at **(1790, 1024)** and **(130, 1024)** — INSIDE
 * the footer band. A strip reaching x ≥ 1790 would make that seat's porch unclickable, and no
 * existing test would have caught it: the porch sweep in `footerBand.test.ts` iterated `chips`
 * only. This module's rects are exported so that sweep can cover the strip too, and it now does.
 *
 * PURE and Pixi-free — the whole layout is unit-testable headlessly (the S130 lesson this repo
 * already applies to `layoutChips` and `progressBarFractions`).
 */

import {
  ALL_SPARK_TYPES,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FOOTER_TOP_Y,
  type SparkType,
} from '../constants.ts';
import type { FooterChipGeom } from './footerBand.ts';

/** One palette button / queue chip box, in canvas coordinates. */
export interface StripRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A palette button: the shape it queues, and where it is. */
export interface PaletteButtonGeom extends StripRect {
  readonly type: SparkType;
}

/** A queue chip: the shape queued, how many are coalesced into it, and where it is. */
export interface QueueChipGeom extends StripRect {
  readonly type: SparkType;
  readonly count: number;
  /** True for the leftmost chip — *"leftmost is next"* has to be visible, not merely true. */
  readonly next: boolean;
}

/**
 * The six primitives, in enum order — the palette's fixed left-to-right layout. Fixed rather than
 * inventory-derived on purpose: a palette that reflowed as shapes came and went would move the
 * button under the player's finger mid-click.
 */
export const STRIP_PALETTE_TYPES: readonly SparkType[] = ALL_SPARK_TYPES;

/**
 * Palette button box, px — the panel's own 30, kept deliberately. A larger button would read better
 * at the footer's scale, but every extra px per button is 6 px of strip, and the strip is spending
 * from a fixed budget between the last tier chip and the seat-2 porch at x=1790. Widen only with a
 * fresh porch-clearance measurement, never on taste alone.
 */
export const STRIP_BTN = 30;
/** Queue chip box, px — wider than a palette button because it carries an ×N badge. */
export const STRIP_CHIP_W = 38;
export const STRIP_CHIP_H = 30;
export const STRIP_GAP = 5;
/**
 * Breathing room between the last tier chip and the strip. Deliberately the same 34 px
 * `LEGEND_GAP` leaves on the other side of the row, so the bottom strip reads as one line with
 * even margins rather than two unrelated clusters.
 */
export const STRIP_MARGIN = 34;
/** Vertical gap between the palette row and the queue row. */
export const STRIP_ROW_GAP = 6;
/** How many coalesced chips the row can SHOW. Chips coalesce by type, so six always suffices. */
export const STRIP_MAX_CHIPS = 6;

/** PURE — total width of the palette row. */
export function paletteRowWidth(): number {
  const n = STRIP_PALETTE_TYPES.length;
  return n * STRIP_BTN + (n - 1) * STRIP_GAP;
}

/** PURE — width of a queue row holding `n` chips (0 → 0). */
export function queueRowWidth(n: number): number {
  if (n <= 0) return 0;
  const k = Math.min(STRIP_MAX_CHIPS, n);
  return k * STRIP_CHIP_W + (k - 1) * STRIP_GAP;
}

/** PURE — the widest the strip can ever be, i.e. with a full queue. Used for clearance tests. */
export function stripMaxWidth(): number {
  return Math.max(paletteRowWidth(), queueRowWidth(STRIP_MAX_CHIPS));
}

/**
 * PURE — the strip's left edge, derived from THIS frame's chip row.
 *
 * Falls back to the centre of the board when there are no chips at all, which only happens before
 * the recipe registry has produced a single complexity — the same degenerate case `legendAnchor`
 * handles the same way, and for the same reason: never return NaN from `Math.max()` of nothing.
 */
export function stripLeft(chips: readonly FooterChipGeom[]): number {
  if (chips.length === 0) return CANVAS_WIDTH / 2; // finite fallback; no chips ⇒ nothing is drawn
  const rightmost = Math.max(...chips.map((c) => c.x + c.w));
  return rightmost + STRIP_MARGIN;
}

/**
 * PURE — the two rows, vertically centred on the band so the pair sits on the chip row's midline.
 *
 * The palette is on TOP and the queue BELOW it, which is the reading order of the action: press a
 * shape, watch it appear in the queue underneath.
 */
export function stripRowTops(): { paletteY: number; queueY: number } {
  const total = STRIP_BTN + STRIP_ROW_GAP + STRIP_CHIP_H;
  const bandMid = FOOTER_TOP_Y + (CANVAS_HEIGHT - FOOTER_TOP_Y) / 2;
  const top = bandMid - total / 2;
  return { paletteY: top, queueY: top + STRIP_BTN + STRIP_ROW_GAP };
}

/**
 * PURE — collapse an ordered queue into display chips, preserving FIRST-APPEARANCE order.
 *
 * Owner ruling B4: *"Coalesce into one chip with an `×N` badge (RTS convention), not N separate
 * entries."* First-appearance order is what keeps "leftmost is next" true after coalescing —
 * sorting by count or by type would put a chip the player is not waiting for at the front and make
 * the display lie about what happens next.
 *
 * ⚠ MOVED HERE FROM `castlePanel.ts` IN S154 P1, and re-exported from there so
 * `gathererOrders.test.ts` — which imports it from the panel — keeps passing. The queue display
 * moved; the coalescing rule did not change, and it must not fork into two copies.
 */
export function coalesceOrders(queue: readonly SparkType[]): Array<{ type: SparkType; count: number }> {
  const out: Array<{ type: SparkType; count: number }> = [];
  for (const t of queue) {
    const hit = out.find((e) => e.type === t);
    if (hit === undefined) out.push({ type: t, count: 1 });
    else hit.count++;
  }
  return out;
}

/**
 * ⭐ PURE — the whole strip for one frame: every palette button and every queue chip, in canvas
 * coordinates, derived from the chip row and the player's live order queue.
 *
 * ONE function answers both "where do I draw it" and "what is under the pointer", so the renderer
 * and the input guard cannot drift apart — the defect that two parallel hit-test paths guarantee.
 */
export function shapeStripLayout(
  chips: readonly FooterChipGeom[],
  orders: readonly SparkType[],
): { palette: PaletteButtonGeom[]; queue: QueueChipGeom[] } {
  if (chips.length === 0) return { palette: [], queue: [] };

  const left = stripLeft(chips);
  const { paletteY, queueY } = stripRowTops();

  const palette: PaletteButtonGeom[] = STRIP_PALETTE_TYPES.map((type, i) => ({
    type,
    x: left + i * (STRIP_BTN + STRIP_GAP),
    y: paletteY,
    w: STRIP_BTN,
    h: STRIP_BTN,
  }));

  // ⚠ LEFT-ALIGNED, unlike the panel's centred version. In the panel the row was centred on a
  // fixed-width plate, so it could not move. Here the row would DANCE sideways every time a chip
  // appeared or was cancelled, dragging the "next" chip out from under the player's finger. Growing
  // rightward from a fixed left edge also makes "leftmost is next" a stable place to look.
  const model = coalesceOrders(orders).slice(0, STRIP_MAX_CHIPS);
  const queue: QueueChipGeom[] = model.map((m, i) => ({
    type: m.type,
    count: m.count,
    next: i === 0,
    x: left + i * (STRIP_CHIP_W + STRIP_GAP),
    y: queueY,
    w: STRIP_CHIP_W,
    h: STRIP_CHIP_H,
  }));

  return { palette, queue };
}

/** PURE — is this canvas point inside `r`? Shared by every strip hit-test so they cannot differ. */
export function hitStripRect(r: StripRect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
