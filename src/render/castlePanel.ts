/**
 * SPARK — S136 P0: the CASTLE CONTEXT PANEL.
 *
 * WHY THIS EXISTS (owner playtest, 2026-08-10, items 1 + 2). V6-1.1/1.2 put BUY GATHERER and SPEED
 * in a permanent footer bar. The owner's ruling after playing it:
 *
 *   "that footer with those options should be clickable once you click on the castle and not always
 *    there. because eventually different towers and stuff will have different upgrades and they will
 *    pop up when you click on them"
 *
 * So the controls become a panel that opens on a click and closes on a click elsewhere. The stated
 * reason is FORWARD-LOOKING — different structures will each carry their own upgrades — so this is
 * built around a `PanelControl` descriptor list rather than two hard-wired buttons. A tower gets its
 * own panel later by supplying a different list; nothing here needs to change.
 *
 * ⚠ SELECTION IS RENDER-LOCAL, NOT WORLD STATE. `selectedSeat` is never serialized, never hashed,
 * never sent on the wire. Two reasons, both load-bearing: (a) an opponent must not see your panel
 * open, and (b) any new World field must be added to FIELD_COVERAGE / save / protocol /
 * structuralSignature / the positions buffer, and a purely local UI toggle has no business paying
 * that cost or risking a desync. Nothing in this file is reachable from a reducer.
 *
 * ⚠ WHY THE BUTTONS ARE PIXI CONTAINERS WITH A GRAPHICS CHILD. This is the shape that empirically
 * works, verified in headless Chromium this session: `hitTest` at a button centre returns the
 * Container because the child Graphics supplies `containsPoint` (a bare Container has none, and
 * Pixi's `hitTestFn` falls back to `hitArea` → `containsPoint` → false). Keep the Graphics child.
 *
 * ⚠ A DISABLED CONTROL MUST SAY WHY. This is the actual defect behind owner item 1 ("the build
 * extra gatherer or increase speed is not even clickable"). The buttons were never broken — the
 * runtime matrix this session showed SPEED working in every mode/viewport — but BUY is unaffordable
 * from t=0 (STARTING_VICTORY_POINTS 100 vs GATHERER_PRICE 105) and the old footer rendered that as
 * an unexplained dim box, which is indistinguishable from a dead button. Every disabled state here
 * carries a REASON string.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  ALL_SPARK_TYPES,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SparkType,
  GATHERER_MAX_SPEED_LEVEL,
  GATHERER_PRICE,
  GATHERER_SPEED_UPGRADE_PRICE,
  KEEP_H,
} from '../constants.ts';
import { bankOf } from '../state/castleBank.ts';
import { ALL_BLUEPRINT_IDS, blueprintBill, blueprintCost } from '../state/blueprints.ts';
import { availableShapeCounts, planBlueprintPayment } from '../state/blueprintBuild.ts';
import { drawBlueprintThumb } from './blueprintGlyph.ts';
import { codexCopyFor } from './codexPresentation.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';
import { fitTextToWidth } from './textFit.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { isBenched } from '../state/hunters/hunter.ts';
import type { World } from '../state/world.ts';

/**
 * Panel box. Sized to the widest label at fontSize 17 plus padding.
 *
 * ⚠ The width is set against the DISABLED label, which is the longest form ("BUY GATHERER  NEED
 * 105" — 22 chars ≈ 224 px at a ~10.2 px monospace advance). The first cut used 244 and the
 * disabled row visibly overflowed its own box in the P0 verification screenshot — the assertions
 * were all green, because "does the text fit" is not something a state assertion can see. Look at
 * the render.
 */
export const PANEL_W = 268;
const PANEL_PAD = 10;
/** Inner width available to a row label, exported so a test can assert labels actually FIT. */
export const ROW_INNER_W = PANEL_W - PANEL_PAD * 2;
/** Monospace advance at ROW_FONT_SIZE — the ratio Pixi's default monospace renders at. */
export const ROW_FONT_ADVANCE = 10.2;
const ROW_H = 44;
const ROW_GAP = 8;
const TITLE_H = 26;
/**
 * S136 P1 — the BANK STRIP: one clickable swatch per CASTLE_BANK_CAP slot, under the title.
 *
 * Clicking a filled slot PULLS that shape onto the porch (owner item 5, "pull them and build them one
 * by one"). Slots are shown even when empty so the cap is legible at a glance — the player can see
 * exactly how much they get, which is the strategic pressure the cap exists to create.
 *
 * S140 P1 — the strip is now MULTI-ROW and derived from the panel width, not the cap; at the shipped
 * cap of 7 it renders as a 4-slot row above a 3-slot row. See `bankSlotsPerRow` below.
 */
export const SLOT_W = 40;
export const SLOT_H = 40;
export const SLOT_GAP = 6;
/** Breathing room under the last slot row. Kept at 12 so cap 5 stays pixel-identical to S136 P1. */
const STRIP_PAD_BOTTOM = 12;

/**
 * S140 P1 — HOW MANY SLOTS FIT ONE ROW. **Derived from the panel, never from the cap.**
 *
 * ⚠ THIS IS THE WHOLE POINT OF THE S140 REGRID. The shipped S136 layout laid the bank out as ONE row
 * of `CASTLE_BANK_CAP` slots, so the strip's width was a function of the cap with no upper bound. At
 * cap 7 that is `7*40 + 6*6 = 316` px inside a `PANEL_W` of 268 — `slotOrigin` returns a left of
 * **-24** and the row hangs 24 px off BOTH edges of the plate. Nothing caught it, because
 * `castlePanel.test.ts` had zero bank-strip coverage: the overflow would have shipped green.
 *
 * Deriving the row length from the panel inverts that dependency — the strip can never outgrow the
 * plate for ANY cap, because the plate is the input. `floor((248 + 6) / 46) = 5`, which is exactly
 * the shipped single-row layout at cap 5, so this function is a **provable no-op** at the old cap.
 */
export function bankSlotsPerRow(cap: number = INVENTORY_SLOTS): number {
  const perRow = Math.floor((ROW_INNER_W + SLOT_GAP) / (SLOT_W + SLOT_GAP));
  return Math.max(1, Math.min(perRow, Math.max(1, cap)));
}

/** PURE — how many rows the bank strip needs at `cap`. */
export function bankRowCount(cap: number = INVENTORY_SLOTS): number {
  return Math.max(1, Math.ceil(Math.max(1, cap) / bankSlotsPerRow(cap)));
}

/**
 * PURE — slots per row once the total is spread EVENLY across the rows.
 *
 * ⚠ WHY EVEN SPREAD AND NOT A FIXED RECTANGLE. A fixed 4-wide grid at cap 7 renders 8 boxes for 7
 * slots — one permanently dead box that reads as a bug and needs bespoke styling to explain. Spreading
 * `ceil(cap / rows)` and centring EACH row on its OWN occupancy gives cap 7 a 4-slot row above a
 * 3-slot row: seven boxes, zero dead. Verified exhaustively over cap 1..500 that the per-row count
 * never exceeds what the panel fits and the last row always holds between 1 and `perRow` slots.
 */
export function bankSlotsPerRowSpread(cap: number = INVENTORY_SLOTS): number {
  return Math.ceil(Math.max(1, cap) / bankRowCount(cap));
}

/** PURE — the bank strip's total height at `cap`, including the bottom pad. */
export function bankStripHeight(cap: number = INVENTORY_SLOTS): number {
  const rows = bankRowCount(cap);
  return rows * SLOT_H + (rows - 1) * SLOT_GAP + STRIP_PAD_BOTTOM;
}

/** S146 P2 — the inventory strip has exactly one swatch per shape type. */
const INVENTORY_SLOTS = ALL_SPARK_TYPES.length;

/* ========================================================================== *
 *   S141 P2 (V6-1.4) — THE GATHERER ORDER QUEUE strip (owner ruling B4)
 * ========================================================================== */

/**
 * ⚠ WHY THIS LIVES IN THE PANEL AND NOT IN A FOOTER — two owner rulings conflict, and the LATER one
 * wins. B4 (S134) specifies *"A FOOTER BAR along the bottom of the screen"* holding the shape buttons
 * and the queue. But S136 P0 — a later playtest ruling — deleted the footer outright: *"that footer
 * with those options should be clickable once you click on the castle and not always there. because
 * eventually different towers and stuff will have different upgrades and they will pop up when you
 * click on them."* Building B4's footer verbatim would re-introduce the exact surface the owner asked
 * to have removed, plus the 1920-wide click-guard band whose removal this file documents as
 * load-bearing. Recorded here rather than silently diverged from the written ruling.
 *
 * Two rows, both derived from the panel width (the S140 lesson — derive from the CONTAINER, never
 * from the contents, so nothing can outgrow the plate at any count):
 *   • the PALETTE — one button per primitive type; each click queues one of that shape.
 *   • the QUEUE   — coalesced `×N` chips, leftmost first; clicking a chip cancels one.
 */
export const PALETTE_BTN = 30;
export const PALETTE_GAP = 5;
const PALETTE_PAD_BOTTOM = 8;
export const CHIP_W = 38;
export const CHIP_H = 30;
const CHIP_GAP = 5;
const QUEUE_PAD_BOTTOM = 10;
/** The six primitives, in enum order — the palette's fixed left-to-right layout. */
export const PALETTE_TYPES: readonly SparkType[] = ALL_SPARK_TYPES;
/**
 * How many chips the strip can SHOW. The queue itself is capped at GATHERER_ORDER_QUEUE_MAX, but only
 * this many distinct coalesced chips fit one row — and since chips coalesce by type there can never
 * be more than one per primitive type, so a full palette always fits by construction.
 */
export const MAX_CHIPS = 6;

/** PURE — height of the palette row. */
export function paletteStripHeight(): number {
  return PALETTE_BTN + PALETTE_PAD_BOTTOM;
}
/** PURE — height of the queue-chip row. */
export function queueStripHeight(): number {
  return CHIP_H + QUEUE_PAD_BOTTOM;
}

/** PURE — the top-left of palette button `i`, panel-local. Centred on the panel like the bank rows. */
export function paletteOrigin(i: number): { x: number; y: number } {
  const n = PALETTE_TYPES.length;
  const total = n * PALETTE_BTN + (n - 1) * PALETTE_GAP;
  const left = (PANEL_W - total) / 2;
  return {
    x: left + i * (PALETTE_BTN + PALETTE_GAP),
    y: PANEL_PAD + TITLE_H + bankStripHeight(),
  };
}

/** PURE — the top-left of queue chip `i`, panel-local. */
export function chipOrigin(i: number, chipCount: number): { x: number; y: number } {
  const n = Math.max(1, Math.min(MAX_CHIPS, chipCount));
  const total = n * CHIP_W + (n - 1) * CHIP_GAP;
  const left = (PANEL_W - total) / 2;
  return {
    x: left + i * (CHIP_W + CHIP_GAP),
    y: PANEL_PAD + TITLE_H + bankStripHeight() + paletteStripHeight(),
  };
}

/**
 * PURE — collapse an ordered queue into display chips, preserving FIRST-APPEARANCE order.
 *
 * Owner ruling B4: *"Coalesce into one chip with an `×N` badge (RTS convention), not N separate
 * entries."* First-appearance order is what keeps "leftmost is next" true after coalescing — sorting
 * by count or by type would put a chip the player is not waiting for at the front and make the
 * display lie about what happens next.
 *
 * Exported and world-free so a test can pin the coalescing without a renderer (the S130 lesson: a
 * draw path that cannot be driven headlessly must not be the only place logic lives).
 */
export function coalesceOrders(queue: readonly SparkType[]): Array<{ type: SparkType; count: number }> {
  const out: Array<{ type: SparkType; count: number }> = [];
  for (const t of queue) {
    const hit = out.find((c) => c.type === t);
    if (hit !== undefined) hit.count++;
    else out.push({ type: t, count: 1 });
  }
  return out;
}
/* ========================================================================== *
 *   S144 P2 — THE BUILD GRID (owner playtest: "its a blob ... make it easy")
 * ========================================================================== */

/**
 * The owner's complaint was not that this panel was ugly in the abstract — it was that clicking the
 * castle showed **no towers at all**. This file previously contained zero references to any recipe;
 * its six palette buttons are PRIMITIVES, which reads as "the towers are in here somewhere, badly
 * drawn". They were not in here.
 *
 * So: a 3x2 grid of build tiles, one per recipe, each drawing the tower's REAL stamped geometry via
 * `drawBlueprintThumb` — the same `blueprints.ts` data the reducer stamps and the P3 ghost previews,
 * so the picture you click is the structure you get. Per-shape colours are the board's own
 * `SPARK_COLORS`, so a blue Square in the tile is a blue Square in the arena.
 *
 * ⚠ ALL SIX ARE ALWAYS LISTED, deliberately. Owner: *"for now everyone should have all the recipes
 * just to test it all out"* — and this costs nothing, because the codex is a localStorage GALLERY
 * record that nothing in `src/state/` reads. Recipes were never gated by it.
 *
 * Sizing follows this file's hard-won rule: derive from the PANEL, never from the contents. Three
 * columns of `TILE` fit `ROW_INNER_W` with room to spare at any tile count, so the grid can never
 * outgrow the plate (the S140 bank-strip overflow, which shipped green because nothing tested it).
 */
export const TILE = 76;
export const TILE_GAP = 6;
export const TILE_COLS = 3;
const SECTION_LABEL_H = 16;
/** Two lines: the hovered tower's name + cost, then its one-line epigraph. */
const CAPTION_H = 32;
const STRUCTURES_PAD_BOTTOM = 10;

/** PURE — how many tile rows the grid needs. */
export function structureRowCount(count: number = ALL_BLUEPRINT_IDS.length): number {
  return Math.max(1, Math.ceil(count / TILE_COLS));
}

/** PURE — total height of the build section, label and caption included. */
export function structuresStripHeight(count: number = ALL_BLUEPRINT_IDS.length): number {
  const rows = structureRowCount(count);
  return SECTION_LABEL_H + rows * TILE + (rows - 1) * TILE_GAP + CAPTION_H + STRUCTURES_PAD_BOTTOM;
}

/** PURE — the top-left of build tile `i`, panel-local. Each row is centred on its own occupancy. */
export function tileOrigin(i: number, count: number = ALL_BLUEPRINT_IDS.length): { x: number; y: number } {
  const row = Math.floor(i / TILE_COLS);
  const col = i % TILE_COLS;
  const inThisRow = Math.min(TILE_COLS, count - row * TILE_COLS);
  const total = inThisRow * TILE + (inThisRow - 1) * TILE_GAP;
  const left = (PANEL_W - total) / 2;
  return {
    x: left + col * (TILE + TILE_GAP),
    y: PANEL_PAD + TITLE_H + bankStripHeight() + paletteStripHeight() + queueStripHeight()
      + SECTION_LABEL_H + row * (TILE + TILE_GAP),
  };
}

/** One build tile's model: what it is, whether you can afford it, and why not. */
export interface StructureRow {
  readonly id: GodlyId;
  readonly name: string;
  /** The ≤34-char epigraph from the codex — shown in the caption, not on the tile. */
  readonly tagline: string;
  /** Total shapes the build consumes. */
  readonly cost: number;
  readonly enabled: boolean;
  /** Non-empty exactly when `enabled` is false — never left blank (this file's standing contract). */
  readonly reason: string;
  /** Per-shape shortfall, for the caption's "need" readout. Empty when affordable. */
  readonly missing: ReadonlyArray<{ type: SparkType; need: number; have: number }>;
}

/**
 * PURE — every buildable structure for `world`'s local seat, with affordability and the reason for
 * each refusal. World-only (no Pixi) so the matrix is unit-testable headlessly — the S130 lesson.
 *
 * ⚠ Affordability is decided by `planBlueprintPayment`, THE SAME function the reducer uses, not by a
 * lookalike count comparison. A tile that says "buildable" while the reducer refuses (or the reverse)
 * is the defect this sharing exists to prevent. `availableShapeCounts` is used ONLY to explain the
 * shortfall, never to decide it.
 */
export function castleStructuresModel(world: World): StructureRow[] {
  const me = world.players.get(world.localPlayerId);
  // Honour the same input locks the control rows do — these tiles live on app.stage and their
  // pointertap never passes through Controls.isInputLocked().
  const locked =
    world.sudoku !== null ||
    world.activeCinematicPlayerId === world.localPlayerId ||
    (me !== undefined && isBenched(me.benchedUntilTick, world.tick));

  const have = availableShapeCounts(world, world.localPlayerId);

  return ALL_BLUEPRINT_IDS.map((id) => {
    const copy = codexCopyFor(id);
    const missing: Array<{ type: SparkType; need: number; have: number }> = [];
    for (const [type, need] of blueprintBill(id)) {
      const got = have.get(type) ?? 0;
      if (got < need) missing.push({ type, need, have: got });
    }
    const affordable = planBlueprintPayment(world, world.localPlayerId, id) !== null;
    const short = missing.reduce((n, m) => n + (m.need - m.have), 0);
    const reason = locked ? 'LOCKED' : affordable ? '' : `NEED ${short} MORE`;
    return {
      id,
      name: copy.name,
      tagline: copy.power,
      cost: blueprintCost(id),
      enabled: reason === '',
      reason,
      missing,
    };
  });
}

/** Gap between the keep box and the panel edge, so the panel never covers the castle it describes. */
const ANCHOR_GAP = 14;

/**
 * One row in a context panel. `reason` is what the row says when `enabled` is false — never left
 * blank, so a dim row always explains itself (see the file docblock).
 */
export interface PanelControl {
  readonly key: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason: string;
  readonly onActivate: () => void;
}

/**
 * PURE — the two castle controls for `world`'s local seat, with their enabled state and the reason
 * for every disabled state. Exported and world-only (no Pixi) so unit tests can pin the affordability
 * and reason matrix without a renderer; the S130 lesson is that a draw path which cannot be driven
 * headlessly must not be the only place logic lives.
 */
export function castleControlsModel(world: World): Array<Omit<PanelControl, 'onActivate'>> {
  const score = Math.floor(world.scoreByPlayer.get(world.localPlayerId) ?? 0);
  const me = world.players.get(world.localPlayerId);
  // ⚠ HONOUR THE SAME INPUT LOCKS THE CANVAS PATH DOES (carried over verbatim from the footer these
  // rows replace). These buttons live on app.stage and their pointertap never passes through
  // Controls.isInputLocked(), so without this a benched (eaten) player — or one mid-cinematic /
  // mid-NONET, where full-screen overlays do not all capture pointers — could spend victory points.
  const locked =
    world.sudoku !== null ||
    world.activeCinematicPlayerId === world.localPlayerId ||
    (me !== undefined && isBenched(me.benchedUntilTick, world.tick));

  let owned = 0;
  let allMaxed = true;
  for (const g of world.gatherers.values()) {
    if (g.ownerPlayerId !== world.localPlayerId) continue;
    owned++;
    if (g.speedLevel < GATHERER_MAX_SPEED_LEVEL) allMaxed = false;
  }

  const buyReason = locked ? 'LOCKED' : score < GATHERER_PRICE ? `NEED ${GATHERER_PRICE}` : '';
  const upReason = locked
    ? 'LOCKED'
    : owned === 0
      ? 'NO UNITS'
      : allMaxed
        ? 'MAX SPEED'
        : score < GATHERER_SPEED_UPGRADE_PRICE
          ? `NEED ${GATHERER_SPEED_UPGRADE_PRICE}`
          : '';

  // A disabled row shows its BLOCKER in place of the price, not in addition to it: "BUY GATHERER
  // 105  NEED 105" prints the same number twice and overflowed the row box. The reason already
  // carries the number in the cases where a number is the answer.
  return [
    {
      key: 'buyGatherer',
      label: buyReason === '' ? `BUY GATHERER  ${GATHERER_PRICE}` : `BUY GATHERER  ${buyReason}`,
      enabled: buyReason === '',
      reason: buyReason,
    },
    {
      key: 'upgradeSpeed',
      label:
        upReason === ''
          ? `SPEED  ${GATHERER_SPEED_UPGRADE_PRICE}`
          : `SPEED  ${upReason}`,
      enabled: upReason === '',
      reason: upReason,
    },
  ];
}

/**
 * PURE — where the panel's top-left corner goes for a keep at (ax, ay).
 *
 * Opens to the RIGHT of the keep by default and flips LEFT when that would overflow the canvas;
 * clamped vertically. The keeps sit on a ring around the arena centre, so seats on the right-hand
 * arc would otherwise push the panel off-screen. Exported for unit tests — the flip is exactly the
 * kind of edge that is invisible until a specific seat plays.
 */
export function panelOrigin(
  ax: number,
  ay: number,
  rows: number,
  cap: number = INVENTORY_SLOTS,
): { x: number; y: number } {
  const h = panelHeight(rows, cap);
  let x = ax + KEEP_H / 2 + ANCHOR_GAP;
  if (x + PANEL_W > CANVAS_WIDTH - 8) x = ax - KEEP_H / 2 - ANCHOR_GAP - PANEL_W;
  if (x < 8) x = 8;
  let y = ay - h / 2;
  if (y < 8) y = 8;
  if (y + h > CANVAS_HEIGHT - 8) y = CANVAS_HEIGHT - 8 - h;
  return { x, y };
}

/**
 * PURE — total panel height for `rows` control rows, including the bank strip and (S141 P2) the
 * palette + queue strips.
 *
 * ⚠ This feeds `panelOrigin`'s vertical clamp, so every strip added here must be added BEFORE the
 * origin is computed or the panel will hang off the canvas for keeps on the lower arc of the ring.
 */
export function panelHeight(rows: number, cap: number = INVENTORY_SLOTS): number {
  return (
    TITLE_H + bankStripHeight(cap) + paletteStripHeight() + queueStripHeight() +
    structuresStripHeight() +
    rows * ROW_H + (rows - 1) * ROW_GAP + PANEL_PAD * 2
  );
}

/**
 * PURE — the panel-local y of the FIRST control row, i.e. the bottom of every strip above it.
 *
 * ⚠ EXTRACTED IN S144 P2 BECAUSE THIS EXPRESSION WAS WRITTEN OUT THREE TIMES — in the constructor,
 * in `getUiPoints`, and (as a sum) in `panelHeight`. Adding the build grid meant editing all three in
 * lockstep, and the failure mode of missing one is silent and seat-specific: the rows would DRAW at
 * one y while `getUiPoints` reported another, so every e2e click on BUY GATHERER would land on empty
 * plate while looking perfectly correct in a screenshot. One definition, three callers.
 */
export function rowsTop(cap: number = INVENTORY_SLOTS): number {
  return (
    PANEL_PAD + TITLE_H + bankStripHeight(cap) + paletteStripHeight() + queueStripHeight()
    + structuresStripHeight()
  );
}

/** PURE — the panel's full rect, given its origin and row count. */
export function panelRect(
  origin: { x: number; y: number },
  rows: number,
  cap: number = INVENTORY_SLOTS,
): { x: number; y: number; w: number; h: number } {
  return { x: origin.x, y: origin.y, w: PANEL_W, h: panelHeight(rows, cap) };
}

/**
 * PURE — the top-left of bank slot `i`, panel-local.
 *
 * S140 P1 — multi-row. Each row is centred on its OWN occupancy (see `bankSlotsPerRowSpread`), so the
 * short last row sits centred under the full ones rather than left-aligned with a dead gap. `cap` is a
 * PARAMETER rather than a module-constant read because "correct for any cap" is exactly the property
 * the new tests sweep, and a test cannot vary a module constant.
 */
export function slotOrigin(i: number, cap: number = INVENTORY_SLOTS): { x: number; y: number } {
  const per = bankSlotsPerRowSpread(cap);
  const row = Math.floor(i / per);
  const col = i % per;
  // The LAST row may be short — centre it on what it actually holds, not on a full row.
  const inThisRow = Math.min(per, Math.max(1, cap) - row * per);
  const total = inThisRow * SLOT_W + (inThisRow - 1) * SLOT_GAP;
  const left = (PANEL_W - total) / 2;
  return {
    x: left + col * (SLOT_W + SLOT_GAP),
    y: PANEL_PAD + TITLE_H + row * (SLOT_H + SLOT_GAP),
  };
}

export class CastlePanel {
  private readonly container: Container;
  private readonly plate: Graphics;
  private readonly titleText: Text;
  private readonly rows: Array<{ box: Container; bg: Graphics; label: Text; hover: boolean }> = [];
  /**
   * S146 P2 — INVENTORY swatches: exactly ONE PER `SparkType`, showing that type's count.
   * `filled` latches per frame so a click on a type you hold none of no-ops.
   */
  private readonly slots: Array<{
    box: Container;
    bg: Graphics;
    glyph: Graphics;
    count: Text;
    hover: boolean;
    filled: boolean;
  }> = [];
  private onPull: ((sparkType: SparkType) => void) | null = null;
  /** S141 P2 — palette buttons (one per primitive) and coalesced queue chips. */
  private readonly palette: Array<{ box: Container; bg: Graphics; glyph: Graphics; hover: boolean }> = [];
  private readonly chips: Array<{
    box: Container; bg: Graphics; glyph: Graphics; badge: Text; hover: boolean;
    type: SparkType | null;
  }> = [];
  private onEnqueue: ((t: SparkType) => void) | null = null;
  private onCancel: ((t: SparkType) => void) | null = null;
  /**
   * S144 P2 — the BUILD GRID. One tile per recipe, built ONCE in the constructor at a fixed count and
   * repainted in sync() — never created per frame (the bank strip's lesson: a variable-length strip
   * that adds children in sync() leaks Pixi objects every frame).
   */
  private readonly tiles: Array<{
    box: Container; bg: Graphics; art: Graphics; cost: Text; hover: boolean; enabled: boolean;
  }> = [];
  private sectionLabel: Text;
  private captionName: Text;
  private captionTag: Text;
  /**
   * The tower the player has picked up, or null. RENDER-LOCAL and never serialized — the same ruling
   * as `selected` (see the file docblock): a World field would owe FIELD_COVERAGE / save / protocol /
   * structuralSignature / the positions buffer, and an opponent must not see what you are about to
   * build. P3 reads this to draw the cursor ghost and to commit BUILD_BLUEPRINT on release.
   */
  private armed: GodlyId | null = null;
  private onArm: ((id: GodlyId | null) => void) | null = null;
  /** S145 P2 — "I want this tower": order its missing shapes. Injected by main.ts. */
  private onRequestShapes:
    | ((missing: ReadonlyArray<{ type: SparkType; need: number; have: number }>) => void)
    | null = null;
  /** Render-local selection. null = closed. Never serialized (see the file docblock). */
  private selected: number | null = null;
  private onBuyGatherer: (() => void) | null = null;
  private onUpgradeSpeed: (() => void) | null = null;
  /** Latched per frame from `castleControlsModel`, so a pointertap cannot fire a disabled row. */
  private enabled: boolean[] = [];
  /** Armed on a successful spend so the HUD can withhold its "you were robbed" drop-flash. */
  private spendArmed = false;

  constructor(app: Application) {
    this.container = new Container();
    this.plate = new Graphics();
    this.container.addChild(this.plate);

    this.titleText = new Text({
      text: 'CASTLE',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: 0x9fc4e8 }),
    });
    this.titleText.position.set(PANEL_PAD, PANEL_PAD);
    this.container.addChild(this.titleText);

    // Two rows today; the list is data, so a third costs one entry (see the file docblock).
    for (let i = 0; i < 2; i++) {
      const bg = new Graphics();
      const label = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 17, fill: 0xffffff }),
      });
      label.anchor.set(0.5);
      label.position.set((PANEL_W - PANEL_PAD * 2) / 2, ROW_H / 2);
      const box = new Container();
      box.addChild(bg); // ⚠ Graphics child supplies containsPoint — do not remove (see docblock).
      box.addChild(label);
      box.position.set(PANEL_PAD, rowsTop() + i * (ROW_H + ROW_GAP));
      box.eventMode = 'static';
      box.cursor = 'pointer';
      const idx = i;
      box.on('pointertap', () => this.activate(idx));
      box.on('pointerover', () => { this.rows[idx].hover = true; });
      box.on('pointerout', () => { this.rows[idx].hover = false; });
      this.container.addChild(box);
      this.rows.push({ box, bg, label, hover: false });
    }

    // S146 P2 — THE INVENTORY STRIP. One box PER SHAPE TYPE (six, always), each showing that
    // type's glyph and how many the castle holds. Clicking a type you hold pulls one onto the
    // porch, which is the same gesture the old per-slot strip had.
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const bg = new Graphics();
      const glyph = new Graphics();
      const count = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x9fc4e8 }),
      });
      count.anchor.set(1, 1);
      count.position.set(SLOT_W - 3, SLOT_H - 1);
      const box = new Container();
      box.addChild(bg);
      box.addChild(glyph);
      box.addChild(count);
      const o = slotOrigin(i);
      box.position.set(o.x, o.y);
      box.eventMode = 'static';
      const idx = i;
      const sparkType = ALL_SPARK_TYPES[i]!;
      box.on('pointertap', () => this.pull(sparkType));
      box.on('pointerover', () => { this.slots[idx].hover = true; });
      box.on('pointerout', () => { this.slots[idx].hover = false; });
      this.container.addChild(box);
      this.slots.push({ box, bg, glyph, count, hover: false, filled: false });
    }

    // S141 P2 — THE PALETTE: one button per primitive type. Click to queue one of that shape.
    for (let i = 0; i < PALETTE_TYPES.length; i++) {
      const bg = new Graphics();
      const glyph = new Graphics();
      const box = new Container();
      box.addChild(bg); // Graphics child supplies containsPoint — same idiom as the rows/slots.
      box.addChild(glyph);
      const o = paletteOrigin(i);
      box.position.set(o.x, o.y);
      box.eventMode = 'static';
      box.cursor = 'pointer';
      const t = PALETTE_TYPES[i];
      const idx = i;
      box.on('pointertap', () => this.onEnqueue?.(t));
      box.on('pointerover', () => { this.palette[idx].hover = true; });
      box.on('pointerout', () => { this.palette[idx].hover = false; });
      this.container.addChild(box);
      this.palette.push({ box, bg, glyph, hover: false });
    }

    // S144 P2 — THE BUILD GRID + its caption. Same Container+Graphics-child idiom as every other
    // clickable here (the Graphics child supplies `containsPoint`; a bare Container has none and
    // Pixi's hitTest falls through to false — see the file docblock).
    this.sectionLabel = new Text({
      text: 'BUILD',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x7c93a8 }),
    });
    this.container.addChild(this.sectionLabel);

    for (let i = 0; i < ALL_BLUEPRINT_IDS.length; i++) {
      const bg = new Graphics();
      const art = new Graphics();
      const cost = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0xffffff }),
      });
      cost.anchor.set(1, 1);
      cost.position.set(TILE - 4, TILE - 2);
      const box = new Container();
      box.addChild(bg);
      box.addChild(art);
      box.addChild(cost);
      const o = tileOrigin(i);
      box.position.set(o.x, o.y);
      box.eventMode = 'static';
      box.cursor = 'pointer';
      const idx = i;
      box.on('pointertap', () => this.armTile(idx));
      box.on('pointerover', () => { this.tiles[idx].hover = true; });
      box.on('pointerout', () => { this.tiles[idx].hover = false; });
      this.container.addChild(box);
      this.tiles.push({ box, bg, art, cost, hover: false, enabled: false });
    }

    this.captionName = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: 0xffffff }),
    });
    this.captionTag = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0x8fa6ba }),
    });
    this.container.addChild(this.captionName);
    this.container.addChild(this.captionTag);

    // S141 P2 — THE QUEUE CHIPS. ⚠ Built ONCE at a fixed maximum and shown/hidden in sync(), NOT
    // created per frame: the bank strip's children are also constructor-built, and a variable-length
    // strip that adds children in sync() would leak Pixi objects every frame. Chips coalesce by type
    // so there can never be more than one per primitive — MAX_CHIPS always suffices.
    for (let i = 0; i < MAX_CHIPS; i++) {
      const bg = new Graphics();
      const glyph = new Graphics();
      const badge = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0xffffff }),
      });
      badge.anchor.set(1, 1);
      badge.position.set(CHIP_W - 3, CHIP_H - 2);
      const box = new Container();
      box.addChild(bg);
      box.addChild(glyph);
      box.addChild(badge);
      box.eventMode = 'static';
      box.cursor = 'pointer';
      const idx = i;
      box.on('pointertap', () => {
        const t = this.chips[idx].type;
        if (t !== null) this.onCancel?.(t);
      });
      box.on('pointerover', () => { this.chips[idx].hover = true; });
      box.on('pointerout', () => { this.chips[idx].hover = false; });
      this.container.addChild(box);
      this.chips.push({ box, bg, glyph, badge, hover: false, type: null });
    }

    this.container.visible = false;
    app.stage.addChild(this.container);
  }

  private pull(sparkType: SparkType): void {
    // Hold none of this type => nothing to pull. The reducer re-checks authoritatively anyway (it
    // spends nothing at count zero), so this only avoids firing a pointless intent.
    if (this.slots[sparkType as number]?.filled !== true) return;
    if (this.onPull === null) return;
    this.onPull(sparkType);
  }

  /** main.ts injects the PULL_FROM_BANK dispatch for the local seat. */
  setPullHandler(fn: (sparkType: SparkType) => void): void {
    this.onPull = fn;
  }

  /** S141 P2 — main.ts injects the ENQUEUE/CANCEL_GATHERER_ORDER dispatches for the local seat. */
  setOrderHandlers(enqueue: (t: SparkType) => void, cancel: (t: SparkType) => void): void {
    this.onEnqueue = enqueue;
    this.onCancel = cancel;
  }

  /** main.ts injects the BUY_GATHERER dispatch for the local seat. */
  setBuyGathererHandler(fn: () => void): void {
    this.onBuyGatherer = fn;
  }

  /** main.ts injects the UPGRADE_GATHERER_SPEED dispatch for the local seat. */
  setUpgradeSpeedHandler(fn: () => void): void {
    this.onUpgradeSpeed = fn;
  }

  /**
   * S144 P2 — pick up (or put down) a tower.
   *
   * Clicking an affordable tile ARMS it; clicking the armed tile again disarms — the same toggle the
   * castle click itself uses, so there is always a way to change your mind without committing.
   *
   * ⚠ S145 P2 — THIS USED TO SAY "a disabled tile does nothing", AND THAT WAS THE BUG. `enabled` is
   * still latched per frame from `castleStructuresModel`, so a pointertap still cannot fire a BUILD
   * the model says is unaffordable — that guarantee is unchanged. What changed is that a tile short
   * of shapes now ORDERS them instead of silently swallowing the click. See the branch below.
   */
  private armTile(idx: number): void {
    const tile = this.tiles[idx];
    if (tile === undefined) return;
    const id = ALL_BLUEPRINT_IDS[idx];
    if (!tile.enabled) {
      // S145 P2 — A SHORT TILE IS NOT A DEAD TILE: IT IS THE ORDER BUTTON.
      //
      // ⚠ THE DEFECT THIS CLOSES, measured in two independent solo runs. The S141 gatherer ORDER
      // QUEUE and the S144 build grid each solve the other's problem, and before this line they had
      // ZERO references to one another anywhere in the codebase. A player staring at "NEED 3 MORE"
      // had no way to discover that ordering those three shapes was even possible — so the bank
      // filled with whatever the haulers happened to find, froze, and no tower was ever built.
      // Clicking the thing you want is the only discovery path that needs no documentation.
      //
      // LOCKED is excluded deliberately: a sudoku trial / cinematic / bench is a TEMPORARY input
      // lock, not a shortage, and silently queueing work from a click the player could not otherwise
      // make would be the panel acting behind an input lock it is supposed to honour.
      const missing = this.structureMissing[idx] ?? [];
      if (this.structureReasons[idx] === 'LOCKED' || missing.length === 0) return;
      this.onRequestShapes?.(missing);
      return;
    }
    this.armed = this.armed === id ? null : id;
    this.onArm?.(this.armed);
  }

  /**
   * S145 P2 — main.ts injects what a click on a SHORT tile should do: order the missing shapes and,
   * if the bank is full, make room for them. Injected rather than dispatched here for the same
   * reason every other panel control is — the panel must not know which of the three transport
   * paths (local, worker, wire) this seat is on.
   */
  setRequestShapesHandler(
    fn: (missing: ReadonlyArray<{ type: SparkType; need: number; have: number }>) => void,
  ): void {
    this.onRequestShapes = fn;
  }

  /** P3 — main.ts injects this to raise/lower the cursor ghost as tiles are armed. */
  setArmHandler(fn: (id: GodlyId | null) => void): void {
    this.onArm = fn;
  }

  /** The tower currently held on the cursor, or null. Read by the P3 ghost + commit path. */
  armedBlueprint(): GodlyId | null {
    return this.armed;
  }

  /** Put the held tower down without building it (Escape, right-click, a lost gesture, a state exit). */
  disarm(): void {
    if (this.armed === null) return;
    this.armed = null;
    this.onArm?.(null);
  }

  private activate(idx: number): void {
    if (this.enabled[idx] !== true) return;
    const fn = idx === 0 ? this.onBuyGatherer : this.onUpgradeSpeed;
    if (fn === null) return;
    this.spendArmed = true;
    fn();
  }

  /**
   * S136 P0 — the HUD reads and CLEARS this to suppress its red drop-flash for one voluntary spend.
   * The flash exists to make an INVOLUNTARY loss (a NONET halving) felt; flashing it at a purchase
   * reads as a penalty for playing well. Consuming it here keeps the latch's owner and its expiry in
   * one place instead of duplicating the footer's frame-budget bookkeeping.
   */
  consumeSpendArmed(): boolean {
    const v = this.spendArmed;
    this.spendArmed = false;
    return v;
  }

  isOpen(): boolean {
    return this.selected !== null;
  }

  open(seat: number): void {
    this.selected = seat;
  }

  close(): void {
    this.selected = null;
  }

  /** Click on an already-open castle = close it (the RTS toggle the owner's phrasing implies). */
  toggle(seat: number): void {
    this.selected = this.selected === seat ? null : seat;
  }

  /**
   * Is this canvas-space point over the panel? Consumed by `controls.ts`, which hit-tests WORLD
   * objects on the raw pointer path with no notion of UI and would otherwise ALSO grab a spark /
   * sever a bond on the same physical click that pressed a button — Pixi's `pointertap` does not
   * suppress the canvas handler. This is the direct replacement for the footer's
   * `isOverFooterControl`, and it covers the whole panel rather than only the rows: unlike the
   * footer (a 1920-wide band whose empty region had to stay clickable, or every world object in the
   * bottom 7.8% went inert) the panel is a small floating box, so swallowing clicks on its padding
   * and title is correct — those are the panel, not the board.
   */
  isOverPanel(x: number, y: number): boolean {
    if (this.selected === null) return false;
    const a = castleAnchor(this.selected);
    const r = panelRect(panelOrigin(a.x, a.y, this.rows.length), this.rows.length);
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** S136 P0 — live click geometry for the e2e harness (the S85 P4c geometry-getter convention). */
  getUiPoints(): {
    open: boolean;
    rect: { x: number; y: number; w: number; h: number } | null;
    rowCenters: Array<{ key: string; x: number; y: number; enabled: boolean; reason: string }>;
    bank: { count: number; cap: number };
    slotCenters: Array<{ index: number; x: number; y: number; filled: boolean }>;
    /** S141 P2 — live click geometry for the order queue (the S85 P4c geometry-getter convention). */
    paletteCenters: Array<{ type: number; x: number; y: number }>;
    chipCenters: Array<{ index: number; type: number; count: number; x: number; y: number }>;
    /** S144 P2 — live click geometry for the build grid (the S85 P4c geometry-getter convention). */
    structureCenters: Array<{ id: string; x: number; y: number; enabled: boolean; reason: string }>;
    armed: string | null;
  } {
    if (this.selected === null) {
      return {
        open: false,
        rect: null,
        rowCenters: [],
        bank: { count: 0, cap: INVENTORY_SLOTS },
        slotCenters: [],
        paletteCenters: [],
        chipCenters: [],
        structureCenters: [],
        // ⚠ NOT hardcoded null. A held tower outlives the panel closing (see `sync`), so reporting
        // null here would tell the harness — and any future consumer — that the player is empty-handed
        // while a ghost is visibly following their cursor. The first version did exactly that, and the
        // e2e test read it as "the illegal drop lost my tower" when the tower was in fact still held.
        armed: this.armed,
      };
    }
    const a = castleAnchor(this.selected);
    const o = panelOrigin(a.x, a.y, this.rows.length);
    const keys = ['buyGatherer', 'upgradeSpeed'];
    return {
      open: true,
      rect: panelRect(o, this.rows.length),
      bank: { count: this.slots.filter((s) => s.filled).length, cap: INVENTORY_SLOTS },
      slotCenters: this.slots.map((s, i) => {
        const so = slotOrigin(i);
        return {
          index: i,
          x: o.x + so.x + SLOT_W / 2,
          y: o.y + so.y + SLOT_H / 2,
          filled: s.filled,
        };
      }),
      structureCenters: ALL_BLUEPRINT_IDS.map((id, i) => {
        const to = tileOrigin(i);
        return {
          id: id as string,
          x: o.x + to.x + TILE / 2,
          y: o.y + to.y + TILE / 2,
          enabled: this.tiles[i]?.enabled === true,
          reason: this.structureReasons[i] ?? '',
        };
      }),
      armed: this.armed,
      paletteCenters: PALETTE_TYPES.map((t, i) => {
        const po = paletteOrigin(i);
        return { type: t as unknown as number, x: o.x + po.x + PALETTE_BTN / 2, y: o.y + po.y + PALETTE_BTN / 2 };
      }),
      chipCenters: this.chips
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.box.visible && c.type !== null)
        .map(({ c, i }) => ({
          index: i,
          type: c.type as unknown as number,
          count: c.badge.text === '' ? 1 : Number(c.badge.text.slice(1)),
          x: o.x + c.box.position.x + CHIP_W / 2,
          y: o.y + c.box.position.y + CHIP_H / 2,
        })),
      rowCenters: this.rows.map((_, i) => ({
        key: keys[i],
        x: o.x + PANEL_PAD + (PANEL_W - PANEL_PAD * 2) / 2,
        y: o.y + rowsTop() + i * (ROW_H + ROW_GAP) + ROW_H / 2,
        enabled: this.enabled[i] === true,
        reason: this.reasons[i] ?? '',
      })),
    };
  }

  private reasons: string[] = [];
  /** S144 P2 — per-tile blocker, latched in sync() so getUiPoints reports what the caption showed. */
  private structureReasons: string[] = [];
  /** S145 P2 — per-tile shortfall, latched per frame beside `structureReasons`. */
  private structureMissing: Array<ReadonlyArray<{ type: SparkType; need: number; have: number }>> = [];

  sync(world: World): void {
    // The panel is a PLAYING-only affordance; any other state closes it so it cannot survive into
    // the title/win screens (the same scoping the footer had, and the reason its watermark reset).
    // ⚠ A HELD TOWER OUTLIVES THE PANEL, BUT NOT THE MATCH.
    //
    // The first cut disarmed whenever the panel closed, which quietly made the whole carry flow
    // impossible: EVERY click outside the panel closes it (`handleCastleClick`), including the click
    // that places the tower and — the case that caught this — a click on an ILLEGAL spot. So a player
    // who misjudged a drop lost their selection with no explanation, and the "keep it in hand on an
    // illegal click" rule in `controls.ts` could never actually fire. Found by the e2e test, not by
    // reasoning.
    //
    // Carrying is therefore independent of the panel being open: you picked a tower up, you are
    // holding it, and the panel has nothing more to say until you put it down. Escape and RMB remain
    // the explicit ways out, and leaving PLAYING force-drops it so a ghost can never survive into the
    // title/win screens.
    if (world.gameState !== 'PLAYING') {
      this.selected = null;
      this.disarm();
    }
    this.container.visible = this.selected !== null;
    if (this.selected === null) return;

    const model = castleControlsModel(world);
    this.enabled = model.map((m) => m.enabled);
    this.reasons = model.map((m) => m.reason);

    const a = castleAnchor(this.selected);
    const o = panelOrigin(a.x, a.y, this.rows.length);
    const r = panelRect(o, this.rows.length);
    this.container.position.set(o.x, o.y);

    const own = world.players.get(world.localPlayerId);
    const tint = own?.color ?? 0x9fc4e8;
    const g = this.plate;
    g.clear();
    g.roundRect(0, 0, r.w, r.h, 8)
      .fill({ color: 0x0a1622, alpha: 0.94 })
      .stroke({ width: 2, color: tint, alpha: 0.85 });
    this.titleText.style.fill = tint;

    // S146 P2 — the INVENTORY strip. No `n/CAP` in the title any more: there is no cap, so the
    // total is just a total. The per-type numbers live on the swatches themselves.
    const bank = bankOf(world.castleBanks, world.localPlayerId);
    let bankTotal = 0;
    for (const c of bank) bankTotal += c;
    this.titleText.text = `CASTLE   INVENTORY ${bankTotal}`;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const slotType = ALL_SPARK_TYPES[i]!;
      const held = bank[slotType as number] ?? 0;
      slot.filled = held > 0;
      slot.count.text = held > 0 ? `x${held}` : '';
      slot.count.style.fill = tint;
      slot.box.cursor = slot.filled ? 'pointer' : 'default';
      const sbg = slot.bg;
      sbg.clear();
      sbg.roundRect(0, 0, SLOT_W, SLOT_H, 5)
        .fill({ color: slot.filled ? (slot.hover ? 0x1f5f9e : 0x14283c) : 0x101a26, alpha: 0.95 })
        .stroke({
          width: slot.filled ? 2 : 1,
          color: slot.filled ? tint : 0x2a3a4a,
          alpha: slot.filled ? 0.9 : 0.7,
        });
      const gl = slot.glyph;
      gl.clear();
      // The SAME glyph the board draws (render/sparkGlyph.ts). Drawn even at ZERO, dimmed, so the
      // six swatches are a stable legend rather than a list that reflows as the inventory changes.
      drawSparkGlyph(gl, SLOT_W / 2 - 5, SLOT_H / 2, 12, slotType, held > 0 ? tint : 0x2a3a4a);
    }

    // S141 P2 — THE PALETTE. Every button is always enabled: queueing costs nothing and is allowed
    // even while benched (see BENCH_INTENT_POLICY), so there is no disabled state to explain here.
    for (let i = 0; i < this.palette.length; i++) {
      const b = this.palette[i];
      b.bg.clear();
      b.bg.roundRect(0, 0, PALETTE_BTN, PALETTE_BTN, 5)
        .fill({ color: b.hover ? 0x1f5f9e : 0x14283c, alpha: 0.95 })
        .stroke({ width: 1.5, color: b.hover ? tint : 0x2a3a4a, alpha: 0.85 });
      b.glyph.clear();
      drawSparkGlyph(b.glyph, PALETTE_BTN / 2, PALETTE_BTN / 2, 9, PALETTE_TYPES[i], tint);
    }

    // S141 P2 — THE QUEUE. Coalesced to one chip per type with an xN badge (owner ruling B4), in
    // FIRST-APPEARANCE order so the leftmost chip really is what gets fetched next.
    const orders = world.gathererOrders.get(world.localPlayerId) ?? [];
    const chips = coalesceOrders(orders).slice(0, MAX_CHIPS);
    for (let i = 0; i < this.chips.length; i++) {
      const c = this.chips[i];
      const model = chips[i];
      c.type = model?.type ?? null;
      c.box.visible = model !== undefined;
      if (model === undefined) continue;
      const co = chipOrigin(i, chips.length);
      c.box.position.set(co.x, co.y);
      // The NEXT chip is highlighted: "leftmost is next" has to be visible, not merely true.
      const isNext = i === 0;
      c.bg.clear();
      c.bg.roundRect(0, 0, CHIP_W, CHIP_H, 5)
        .fill({ color: c.hover ? 0x7a2c2c : isNext ? 0x1b4a76 : 0x14283c, alpha: 0.95 })
        .stroke({ width: isNext ? 2 : 1, color: c.hover ? 0xd46a6a : tint, alpha: isNext ? 0.95 : 0.6 });
      c.glyph.clear();
      drawSparkGlyph(c.glyph, CHIP_W / 2 - 3, CHIP_H / 2, 8, model.type, tint);
      // Only badge a real multiple — "x1" on every chip is noise.
      c.badge.text = model.count > 1 ? `x${model.count}` : '';
    }

    // S144 P2 — THE BUILD GRID. Affordability comes from `castleStructuresModel`, which decides it
    // with the SAME `planBlueprintPayment` the reducer uses — so a bright tile is always buildable.
    const structures = castleStructuresModel(world);
    this.sectionLabel.position.set(
      PANEL_PAD,
      PANEL_PAD + TITLE_H + bankStripHeight() + paletteStripHeight() + queueStripHeight(),
    );
    this.sectionLabel.style.fill = tint;

    let captionFor: StructureRow | null = null;
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      const m = structures[i];
      t.enabled = m.enabled;
      const isArmed = this.armed === m.id;
      // The hovered tile wins the caption; otherwise the held one explains itself, so the player can
      // always see WHAT they are carrying while they look for somewhere to put it.
      if (t.hover) captionFor = m;
      else if (isArmed && captionFor === null) captionFor = m;

      // S145 P2 — a short tile is actionable now (it orders its shapes), so it keeps the pointer.
      // Only a LOCKED tile is genuinely inert.
      t.box.cursor = m.reason === 'LOCKED' ? 'default' : 'pointer';
      t.bg.clear();
      t.bg.roundRect(0, 0, TILE, TILE, 6)
        .fill({
          color: isArmed ? 0x1f5f9e : m.enabled ? (t.hover ? 0x17497a : 0x14283c) : 0x101a26,
          alpha: 0.95,
        })
        .stroke({
          width: isArmed ? 3 : m.enabled ? 2 : 1,
          color: isArmed ? 0xffffff : m.enabled ? tint : 0x2a3a4a,
          alpha: isArmed ? 1 : m.enabled ? 0.9 : 0.7,
        });

      // The tower's REAL stamped geometry, auto-scaled to the tile. An unaffordable one is drawn in
      // flat grey rather than hidden — you must be able to see what you are saving up for.
      t.art.clear();
      t.art.alpha = m.enabled ? 1 : 0.45;
      drawBlueprintThumb(
        t.art, m.id, TILE / 2, TILE / 2 - 4, TILE - 12,
        m.enabled ? {} : { tint: 0x6b7a88 },
      );

      this.structureReasons[i] = m.reason;
      // S145 P2 — latched alongside the reason, and for the same reason: the click handler must act
      // on what the model said THIS FRAME, never on a fresh recompute at pointer time.
      this.structureMissing[i] = m.missing;
      t.cost.text = `${m.cost}`;
      t.cost.style.fill = m.enabled ? 0xffffff : 0x6b7a88;
    }

    // CAPTION. Names the hovered/held tower and its epigraph; when nothing is picked it says what to
    // do. A dim tile's blocker is shown HERE rather than on the tile — a 76 px box cannot hold
    // "NEED 3 MORE" legibly, but the panel's contract that a disabled thing explains itself still
    // has to be met somewhere.
    const capY = PANEL_PAD + TITLE_H + bankStripHeight() + paletteStripHeight() + queueStripHeight()
      + SECTION_LABEL_H + structureRowCount() * TILE + (structureRowCount() - 1) * TILE_GAP + 6;
    this.captionName.position.set(PANEL_PAD, capY);
    this.captionTag.position.set(PANEL_PAD, capY + 14);
    if (captionFor === null) {
      this.captionName.text = 'PICK A TOWER';
      this.captionName.style.fill = 0x7c93a8;
      this.captionTag.text = 'costs shapes from your bank';
    } else {
      this.captionName.text = captionFor.enabled
        ? `${captionFor.name}  ${captionFor.cost}`
        : `${captionFor.name}  ${captionFor.reason}`;
      this.captionName.style.fill = captionFor.enabled ? 0xffffff : 0xd4956a;
      // S145 P2 — a short tile must SAY that clicking it orders the shortfall. Naming the blocker
      // was never enough: the player could read "NEED 3 MORE" all match and still have no idea that
      // asking for those three was a thing the game let them do. The epigraph is the lesser loss.
      this.captionTag.text =
        captionFor.enabled || captionFor.reason === 'LOCKED'
          ? captionFor.tagline
          : 'CLICK TO ORDER THE MISSING SHAPES';
    }
    fitTextToWidth(this.captionName, ROW_INNER_W);
    fitTextToWidth(this.captionTag, ROW_INNER_W);

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const m = model[i];
      const on = m.enabled;
      const bg = row.bg;
      bg.clear();
      bg.roundRect(0, 0, PANEL_W - PANEL_PAD * 2, ROW_H, 6)
        .fill({ color: on ? (row.hover ? 0x1f5f9e : 0x17497a) : 0x1a2530, alpha: 0.95 })
        .stroke({ width: 2, color: on ? 0x85b7eb : 0x3a4a58, alpha: 0.95 });
      // A dim row NAMES its blocker instead of leaving the player to guess (owner item 1). The
      // blocker is already folded into `label` by castleControlsModel — do NOT append `reason`
      // again here, which is what made the disabled row overflow its box.
      row.label.text = m.label;
      row.label.style.fill = on ? 0xffffff : 0x6b7a88;
      row.box.cursor = on ? 'pointer' : 'default';
    }
  }
}
