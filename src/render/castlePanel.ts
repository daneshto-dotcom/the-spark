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
  CASTLE_MAX_REGEN_LEVEL,
  CASTLE_REGEN_UPGRADE_PRICE,
  KEEP_H,
} from '../constants.ts';
import { bankOf } from '../state/castleBank.ts';
// S166 — R95's race filter. From the side-effect-free leaf: this module must not fire
// `registerRecipe` as an import side effect (see `raceTowerIds.ts`).
import { RACE_TOWER_IDS, isRaceTowerId } from '../state/raceTowerIds.ts';
// S167 - the tier-9 leaf. Separate table AND separate predicate; see the R95 filter below for why
// folding the twelve ids into one table would put a FEED button on a one-shot boss tower.
import { T9_TOWER_IDS, isT9TowerId } from '../state/t9BossIds.ts';
import { ALL_BLUEPRINT_IDS, blueprintBill, blueprintCost } from '../state/blueprints.ts';
import { availableShapeCounts, planBlueprintPayment } from '../state/blueprintBuild.ts';
import { drawBlueprintThumb } from './blueprintGlyph.ts';
import { codexCopyFor } from './codexPresentation.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';
import { fitTextToWidth } from './textFit.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import type { ZoneLayout } from '../state/zones.ts';
import { isBenched } from '../state/hunters/hunter.ts';
import type { World } from '../state/world.ts';
// ⭐ S188 P3 — the keep's own four stats. The SAME functions the reducer decides with (cap, price,
// level) and the SAME preview the S187 module wrote for this HUD, so a row cannot promise a
// purchase `applyUpgradeCastleStat` refuses, or print a gain it does not bake.
import {
  CASTLE_UPGRADE_MAX_LEVEL,
  CASTLE_UPGRADE_PRICE,
  canBuyCastleStat,
  castleLevelOf,
  castleUpgradePreview,
  type CastleStat,
} from '../state/castleUpgrades.ts';
import type { PlayerId } from '../types.ts';

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
/**
 * ⭐ S188 P3 — a row's optional second line (`PanelControl.detail`). ⚠ MINE, not the owner's: sized
 * so a 17px label and an 11px detail both sit inside the SAME 44px row, so adding a detail never
 * changes a row's height — and so never moves `rowsTop`, `panelHeight` or `getUiPoints`.
 */
export const ROW_DETAIL_FONT_SIZE = 11;
/** Monospace advance at `ROW_DETAIL_FONT_SIZE`, the same 0.6 ratio as `ROW_FONT_ADVANCE`. */
export const ROW_DETAIL_FONT_ADVANCE = 6.6;
/** Where the label's centre moves to when the row carries a detail line, and where the detail sits. */
const ROW_LABEL_Y_WITH_DETAIL = 15;
const ROW_DETAIL_Y = 33;
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
 *   S154 P1 (owner R80) — THE PALETTE + ORDER QUEUE LEFT THIS FILE
 * ========================================================================== */

/**
 * ⭐ THE SHAPE PALETTE AND THE ORDER QUEUE NOW LIVE IN THE FOOTER — see `render/shapeStrip.ts`.
 *
 * This file used to carry a long argument for why they had to live in the panel: B4 (S134) asked
 * for a footer bar, S136 P0 then deleted the footer outright (*"that footer with those options
 * should be clickable once you click on the castle and not always there"*), and building B4
 * verbatim would have re-introduced the surface a later ruling removed.
 *
 * **R80 settles it, and not simply by being newer.** The owner asked three times for the palette
 * and queue to be *"always be visible on the right side of the footer (after tier 8)"*. Re-read in
 * that light, S136 P0 is about **per-tower upgrade controls** — its own justification is *"different
 * towers and stuff will have different upgrades and they will pop up when you click on them"* — and
 * those stay exactly where it put them: in this panel, behind a click on a castle. The shape
 * palette is not a per-tower upgrade; it is a global economy command, which is why the owner kept
 * reaching for it and finding it behind a click. The two rulings are separated by SUBJECT.
 *
 * The removal deleted SIX consumers of the two strip heights from this file's layout (the panel is
 * correspondingly shorter), and `paletteOrigin`/`chipOrigin`/`paletteStripHeight`/`queueStripHeight`
 * are gone with them: they were panel-local geometry and have no meaning in canvas space. The
 * footer's equivalents are pure functions in `shapeStrip.ts`.
 */

/**
 * ⚠ RE-EXPORTED, NOT MOVED-AND-FORGOTTEN. `state/gatherers/gathererOrders.test.ts` imports
 * `coalesceOrders` from this module, and the coalescing RULE did not change when the display moved
 * — only where it is drawn. Re-exporting keeps the one implementation authoritative instead of
 * letting a second copy drift into existence, which is the failure this repo has already paid for.
 */
export { coalesceOrders } from './shapeStrip.ts';
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
/**
 * ⭐ S149 P5 — **THE CASTLE NO LONGER BUILDS TOWERS.** Owner, after playing P4:
 *
 *   *"the towers are still being built within the castle which is wrong. you should remove the area
 *   and put it down in the footer … the castle is just to hold the shapes (inventory) and being able
 *   to pull single shapes to build other random buildings/towers/walls."*
 *
 * So the BUILD grid is gone from this panel and lives in the footer band (R36). The castle keeps
 * what it is actually for: the shape inventory, the porch, the order queue and the gatherer
 * controls.
 *
 * ⚠ RETAINED, NOT DELETED (owner ruling S149: delete nothing this session). Every tile, its art, its
 * affordability model and its hit-testing stay in this file behind this one flag, so the footer
 * reuses `castleStructuresModel` and the arming path rather than forking them — and flipping this
 * back is one line if the surface ever moves again.
 */
const CASTLE_BUILD_GRID_ENABLED = false;

/** How many build tiles this panel actually renders — 0 once the grid moved to the footer. */
function liveTileCount(): number {
  return CASTLE_BUILD_GRID_ENABLED ? ALL_BLUEPRINT_IDS.length : 0;
}

export function structureRowCount(count: number = ALL_BLUEPRINT_IDS.length): number {
  // ⭐ S149 P5 — ZERO TILES MEANS ZERO ROWS. The `Math.max(1, …)` floor was correct while the grid
  // always existed; now the owner has moved tower-building OUT of the castle ("the castle is just
  // to hold the shapes"), the panel renders with no grid at all and a phantom empty row would leave
  // a labelled void where the towers used to be.
  if (count <= 0) return 0;
  return Math.max(1, Math.ceil(count / TILE_COLS));
}

/** PURE — total height of the build section, label and caption included. */
export function structuresStripHeight(count: number = ALL_BLUEPRINT_IDS.length): number {
  const rows = structureRowCount(count);
  if (rows === 0) return 0; // no grid ⇒ no label, no caption, no padding — see structureRowCount
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
    y: PANEL_PAD + TITLE_H + bankStripHeight()
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
  /**
   * Per-shape shortfall, for the "need" readout. Empty when affordable.
   *
   * ⭐ S173 — ALWAYS IN `ALL_SPARK_TYPES` ORDER, and that is now a tested contract rather than an
   * accident. See `castleStructuresModel` for both reasons (determinism and the bank strip's
   * reading order); a renderer may iterate this array straight through.
   */
  readonly missing: ReadonlyArray<{ type: SparkType; need: number; have: number }>;
  /**
   * ⭐⭐ S182 (owner) — **THE WHOLE BILL, NOT ONLY THE SHORT PART OF IT.**
   *
   * > *"When you click on a tower, before you place it, when you're carrying the template, it
   * > should show you 'this will cost you this much and this much'."*
   *
   * `missing` answers *"what am I still short of"* and is EMPTY once you can afford the build —
   * which is exactly the moment you pick the tower up and start carrying it, so it is structurally
   * the wrong array for a carry readout. This one lists every type in `blueprintBill(id)`,
   * affordable or not, in the same `ALL_SPARK_TYPES` order and from the same loop.
   *
   * ⚠ `need` AND `have`, never a subtraction. A carry readout says what the tower COSTS; whether
   * the count reads as comfortable or tight is the renderer's tint, not a second number. (There is
   * deliberately no mapping sibling to `shortfallEntries` here: that function exists so one
   * subtraction lives in one place, and this array has no subtraction to share — a `billEntries`
   * would have been the identity function.)
   */
  readonly bill: ReadonlyArray<{ type: SparkType; need: number; have: number }>;
}

/* ========================================================================== *
 *   S173 — THE SHORTFALL READOUT: **WHICH** SHAPES, NOT JUST HOW MANY
 * ========================================================================== */

/**
 * ⭐ THE OWNER'S ASK, VERBATIM (playtest, this session):
 *
 *   *"under the tower, it says need five more or, like, need two more. How many shapes it needs more
 *    to be able to build that tower? But it doesn't say WHAT SHAPES. Some towers need different types
 *    of shapes. It's good to know which you're missing. So you can either plan ahead, like, oh, first
 *    I'll get a few of those, then I'll get that... We need the NEED, and then the SYMBOL. Need three
 *    more this and five more this, for example."*
 *
 * The model has computed the per-shape breakdown since S145 — `StructureRow.missing` — and every
 * surface then SUMMED it away into one number (`NEED 5 MORE`), which is exactly the readout he is
 * complaining about. Nothing new has to be measured; the total just has to stop being the only thing
 * that survives to the pixels.
 *
 * ⛔ AND THE ANSWER IS A GLYPH, NOT A WORD, FOR A MEASURED REASON. The widest shortfall in the
 * registry is PRINCESS HELGA (Triangle + Spiral + Circle), which spells out as
 * `NEED 3 TRIANGLE 3 SPIRAL 3 CIRCLE` — 33 characters ≈ 258 px at the footer card's 13 px monospace,
 * inside a card that has 192 px of room. The same three shortfalls as glyph+count pairs are ~120 px.
 * Text cannot carry this readout; `drawSparkGlyph` can, and it draws the SAME mark the board, the
 * castle bank strip and the footer's shape palette draw, so one shape cannot read two ways.
 */

/** One line of the shortfall readout: a shape, and how many MORE of it the build wants. */
export interface ShortfallEntry {
  readonly type: SparkType;
  /** `need - have`, always ≥ 1 — a shape you already have enough of never appears. */
  readonly short: number;
}

/**
 * PURE — the per-shape shortfall as the readout wants it: "how many MORE", not "need vs have".
 *
 * Exists so the subtraction lives in ONE place. Both surfaces that draw this row would otherwise
 * each re-derive `need - have`, and the failure mode of one of them drifting is a card that promises
 * a build the reducer refuses — the `castleStructuresModel` lesson, one layer out.
 *
 * ⚠ Order is inherited from `missing`, which is `ALL_SPARK_TYPES` order by construction. Do not sort
 * here: a second opinion about the order is how two surfaces start disagreeing.
 */
export function shortfallEntries(
  missing: ReadonlyArray<{ type: SparkType; need: number; have: number }>,
): ShortfallEntry[] {
  return missing
    .filter((m) => m.need > m.have)
    .map((m) => ({ type: m.type, short: m.need - m.have }));
}

/** Visual radius handed to `drawSparkGlyph` for a readout glyph — a legible mark at caption size. */
export const SHORTFALL_GLYPH_R = 7;
/** Horizontal advance reserved for one count, sized to its widest realistic form (`x12`). */
const SHORTFALL_COUNT_W = 22;
/** Gap between one glyph+count pair and the next. */
const SHORTFALL_PAIR_GAP = 8;

/** One glyph+count pair, positioned relative to the readout row's LEFT edge. */
export interface ShortfallSlot {
  readonly type: SparkType;
  readonly short: number;
  /** Centre of the shape glyph. */
  readonly glyphX: number;
  /** Centre of the `x3` count that follows it. */
  readonly countX: number;
}

/** Per-surface sizing. Every field has a default, so two surfaces agree unless one says otherwise. */
export interface ShortfallRowOptions {
  readonly glyphR?: number;
  readonly countW?: number;
  readonly gap?: number;
}

/**
 * PURE — lay a shortfall out as a row of glyph+count pairs, and report the width it occupies.
 *
 * Pixi-free on purpose, exactly like every other layout function in this file: the S130 lesson is
 * that a draw path which cannot be driven headlessly is a draw path nobody tests. The caller adds
 * its own origin; these coordinates are row-local.
 *
 * ⚠ `width` is the span of the PAIRS ONLY — no trailing gap — so a caller can centre the row by
 * subtracting half of it. An empty shortfall is width 0, not one gap wide.
 */
export function shortfallRowLayout(
  entries: ReadonlyArray<ShortfallEntry>,
  opts: ShortfallRowOptions = {},
): { readonly slots: ShortfallSlot[]; readonly width: number } {
  const geom = glyphCountRowLayout(entries.length, opts);
  return {
    slots: entries.map((e, i) => ({
      type: e.type,
      short: e.short,
      glyphX: geom.slots[i]!.glyphX,
      countX: geom.slots[i]!.countX,
    })),
    width: geom.width,
  };
}

/** Where one glyph+count pair sits, relative to the row's LEFT edge. Positions only. */
export interface GlyphCountSlot {
  /** Centre of the shape glyph. */
  readonly glyphX: number;
  /** Centre of the `x3` count that follows it. */
  readonly countX: number;
}

/**
 * ⭐ S182 — PURE — **THE GEOMETRY OF A ROW OF `n` GLYPH+COUNT PAIRS, AND NOTHING ELSE.**
 *
 * Extracted from `shortfallRowLayout` when the carry readout (owner S182, item 3) needed the same
 * row for a different fact — what a tower COSTS rather than what you are SHORT of. The positions
 * never depended on the numbers, only on how many pairs there are, so the alternative was either a
 * second copy of four lines of arithmetic or a `short` field carrying a "need". Both are the kind of
 * near-duplicate this file's own docblocks keep warning about; one geometry function is neither.
 *
 * ⚠ `width` is the span of the PAIRS ONLY — no trailing gap — so a caller can centre or RIGHT-ALIGN
 * the row by subtracting it. `n = 0` is width 0, not one gap wide.
 */
export function glyphCountRowLayout(
  n: number,
  opts: ShortfallRowOptions = {},
): { readonly slots: GlyphCountSlot[]; readonly width: number } {
  const glyphR = opts.glyphR ?? SHORTFALL_GLYPH_R;
  const countW = opts.countW ?? SHORTFALL_COUNT_W;
  const gap = opts.gap ?? SHORTFALL_PAIR_GAP;
  const pairW = glyphR * 2 + countW;
  const slots: GlyphCountSlot[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    slots.push({ glyphX: x + glyphR, countX: x + glyphR * 2 + countW / 2 });
    x += pairW + gap;
  }
  return { slots, width: slots.length === 0 ? 0 : x - gap };
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
  /*
   * ⛔ S175 P4b — the `activeCinematicPlayerId` clause was removed from BOTH `locked` expressions
   * in this file, alongside the one in `Controls.isInputLocked`. There is no cutscene to lock
   * behind any more; see the long note at that site. NONET and benched still lock.
   */
  // Honour the same input locks the control rows do — these tiles live on app.stage and their
  // pointertap never passes through Controls.isInputLocked().
  const locked =
    world.sudoku !== null ||
    (me !== undefined && isBenched(me.benchedUntilTick, world.tick));

  const have = availableShapeCounts(world, world.localPlayerId);

  /*
   * ⭐ S166 — R95: A RACE TOWER IS VISIBLE AND BUILDABLE ONLY BY ITS OWNER. Owner: *"there's
   * already the current global towers that everyone can build, but we're adding race towers too
   * which are unique to the player's race."*
   *
   * ⛔ FILTERED HERE RATHER THAN IN `ALL_BLUEPRINT_IDS`, because that list is the REGISTRY of what
   * exists and three other consumers read it — the footer band derives from this model and inherits
   * the filter for free, but `botBrain` does not and is filtered separately at its own sort.
   *
   * ⚠ A SEAT WITH NO PLAYER SEES NO RACE TOWER, not all six. `me` is undefined on a mirror that has
   * not yet received its roster, and showing six unbuildable rows for one frame would read as a bug.
   *
   * ⚠ THE COMPLEMENT MATTERS TOO AND IS TESTED BOTH WAYS: every race still sees all seven GLOBAL
   * towers. That is the regression proving R95's "additive, not replacing" actually held.
   */
  /*
   * ⭐ S167 — R95 NOW COVERS TWO TIERS, AND THE PREDICATES ARE SEPARATE ON PURPOSE.
   * `isRaceTowerId` walks `RACE_TOWER_IDS` only, so the six tier-9 boss towers would fall through
   * this filter as GLOBALS and every seat would see all six bosses in its build panel.
   *
   * ⛔ AND THE TEMPTING FIX — ONE TABLE HOLDING ALL TWELVE IDS — IS A REAL BUG, NOT A STYLE CHOICE.
   * `isRaceTowerId` is also what `goblinKinds.ts`'s `seatFeedTowerAt` uses to decide a structure is
   * FEEDABLE, so folding the tier-9 ids into it would put a FEED button on a boss tower, which is
   * one-shot and must never be fed. Two predicates, two tables, one filter that names both.
   */
  const myTowerId = me === undefined ? null : RACE_TOWER_IDS[me.raceId];
  const myBossTowerId = me === undefined ? null : T9_TOWER_IDS[me.raceId];
  const visible = ALL_BLUEPRINT_IDS.filter(
    (id) =>
      (!isRaceTowerId(id) || id === myTowerId) && (!isT9TowerId(id) || id === myBossTowerId),
  );

  return visible.map((id) => {
    const copy = codexCopyFor(id);
    /*
     * ⭐ S173 — WALKED IN `ALL_SPARK_TYPES` ORDER, NOT IN THE BILL'S MAP ORDER. Two reasons, and the
     * first one is this codebase's standing rule:
     *
     * ⛔ `blueprintBill` returns a `Map` whose key order is FIRST-APPEARANCE IN THE NODE LIST. That
     *    is stable today only because `BLUEPRINTS` is a static table — the moment a recipe's nodes
     *    are reordered (helga's leaves are interleaved "purely cosmetic[ally]", by its own comment)
     *    the readout silently reshuffles under the player's cursor. Letting `Map` iteration decide
     *    an order is the defect class this repo has already paid for; a total order costs one loop.
     *
     * ⭐ AND THE ORDER IT PICKS IS THE ONE THE PLAYER ALREADY READS. `ALL_SPARK_TYPES` is the order
     *    the castle's bank strip draws its six swatches in, and the order the footer's shape palette
     *    lays its buttons out in — the two places the player looks to ACT on this shortfall. A
     *    readout that scans left-to-right the same way as the strip it sends you to is the whole
     *    "so you can plan ahead" half of the owner's ask.
     */
    const bill = blueprintBill(id);
    const missing: Array<{ type: SparkType; need: number; have: number }> = [];
    // ⭐ S182 — the FULL bill, collected in the SAME loop, from the SAME `blueprintBill(id)` call
    // and therefore in the same total order. A second walk (or a second calculator) is this repo's
    // named top defect; `missing` is now literally a filter of this one, applied inline.
    const full: Array<{ type: SparkType; need: number; have: number }> = [];
    for (const type of ALL_SPARK_TYPES) {
      const need = bill.get(type);
      if (need === undefined) continue;
      const got = have.get(type) ?? 0;
      full.push({ type, need, have: got });
      if (got < need) missing.push({ type, need, have: got });
    }
    const affordable = planBlueprintPayment(world, world.localPlayerId, id) !== null;
    const short = missing.reduce((n, m) => n + (m.need - m.have), 0);
    /*
     * ⚠ S173 — `reason` IS NOW THE ONE-LINE FALLBACK, NOT THE WHOLE STORY. It keeps the TOTAL (and
     * the `LOCKED` word, which has no per-shape form), because a surface with a single line of text
     * and no `Graphics` still has to honour this file's standing contract that a disabled thing
     * SAYS why. The surface that can draw — the footer card — renders `missing` as glyph+count
     * pairs instead, which is what the owner actually asked for. Do not delete this string to
     * "avoid duplication": the two say different amounts of the same true thing.
     */
    const reason = locked ? 'LOCKED' : affordable ? '' : `NEED ${short} MORE`;
    return {
      id,
      name: copy.name,
      tagline: copy.power,
      cost: blueprintCost(id),
      enabled: reason === '',
      reason,
      missing,
      bill: full,
    };
  });
}

/**
 * ⭐ S182 — PURE — the one row for `id`, or null when this seat cannot see that structure.
 *
 * Exists for the CARRY readout, which needs a bill for the armed blueprint whether or not its
 * complexity menu is open — so it cannot read `FooterCardGeom`, which only exists while the menu is.
 *
 * ⚠ IT GOES THROUGH `castleStructuresModel`, NOT `blueprintBill`, and that is the point: the model
 * is what applies the R95/R137 visibility filter and what asks `planBlueprintPayment` — the same
 * function the reducer uses. A readout built straight off `blueprintBill` would be a second
 * calculator, which is this file's standing warning.
 */
export function structureRowFor(world: World, id: GodlyId): StructureRow | null {
  return castleStructuresModel(world).find((r) => r.id === id) ?? null;
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
  /**
   * ⭐ S188 P3 — an optional SECOND line, drawn small under `label`. Absent on the three original
   * rows, which therefore draw exactly as before. The castle-stat rows put "what the next point
   * buys" here, because level + price + gain on one 17px line is 25 characters and the row fits 24.
   */
  readonly detail?: string;
  readonly onActivate: () => void;
}

/**
 * PURE - the castle controls for `world`'s local seat, with their enabled state and the reason
 * for every disabled state. Exported and world-only (no Pixi) so unit tests can pin the affordability
 * and reason matrix without a renderer; the S130 lesson is that a draw path which cannot be driven
 * headlessly must not be the only place logic lives.
 */
/**
 * The control rows, in draw order, as ONE list.
 *
 * S165 - THIS CONSTANT EXISTS BECAUSE THE SAME FACT WAS WRITTEN IN THREE PLACES AND ONE WAS WRONG.
 * The row count was hardcoded as a literal `2` in the constructor's build loop, the keys were a
 * separate literal array in `getUiPoints`, and `castleControlsModel` returned the real list. S164
 * P1 added the CASTLE REGEN row (owner R128-R131) to the model and to the key list - and not to
 * the loop. So the third row existed in the data, was reported by nothing and was DRAWN by nothing:
 * the upgrade was invisible and unclickable from the day it shipped.
 *
 * The owner found it, not a test: "cant seem to click on castle gatherer upgrades i think you took
 * it off". At 100 victory points BUY GATHERER is unaffordable (105) and SPEED is a different
 * control, so REGEN at exactly 100 was the one purchase available - and it was the missing row.
 *
 * Every consumer now counts from here, so a fourth row is one entry and cannot half-land.
 *
 * ⭐⭐ S188 P3 (owner) — AND IT DID NOT HALF-LAND: FOUR ROWS JOINED IT. *"For now on, we just have
 * regen and I'm pretty sure we have already spec'd out the upgrade for the castle health. So wire
 * that in and implement it."* S187 built HP / ATK / DEF / PEN in the SIM (`castleUpgrades.ts`,
 * intent `UPGRADE_CASTLE_STAT`) and nothing dispatched it — his *"we just have regen"* was exactly
 * right. They are rows of THIS list, drawn by the same loop, hit-tested by the same Graphics child
 * and reported by the same `getUiPoints`, which is what the S165 note above says a new row costs.
 */
export const CASTLE_ROW_KEYS = [
  'buyGatherer', 'upgradeSpeed', 'castleRegen',
  'castleHp', 'castleAtk', 'castleDef', 'castlePen',
] as const;

/** One control row's key. The union `activate` switches over exhaustively. */
export type CastleRowKey = (typeof CASTLE_ROW_KEYS)[number];

/**
 * ⭐ S188 P3 — which row buys which stat, and the word it is printed under. HIS order: *"castle HP …
 * attack as well, and for defense and for penetration"*.
 */
export const CASTLE_STAT_ROWS: ReadonlyArray<{
  readonly key: CastleRowKey;
  readonly stat: CastleStat;
  readonly word: string;
}> = [
  { key: 'castleHp', stat: 'hp', word: 'HP' },
  { key: 'castleAtk', stat: 'atk', word: 'ATK' },
  { key: 'castleDef', stat: 'def', word: 'DEF' },
  { key: 'castlePen', stat: 'pen', word: 'PEN' },
];

/**
 * PURE — the castle controls. `viewedSeat` is the seat whose keep the panel is open on; it defaults
 * to the local seat, which is the only keep `controls.ts` will open it on (`handleCastleClick`).
 *
 * ⚠ S188 P3 — the parameter exists so "not your castle" is a REASON the model states rather than an
 * assumption the click path happens to hold. Every row here spends the LOCAL seat's points on the
 * LOCAL seat's keep, so a panel open on any other seat must not offer a castle-stat purchase at all.
 */
export function castleControlsModel(
  world: World,
  viewedSeat: PlayerId = world.localPlayerId,
): Array<Omit<PanelControl, 'onActivate'>> {
  const score = Math.floor(world.scoreByPlayer.get(world.localPlayerId) ?? 0);
  const me = world.players.get(world.localPlayerId);
  // ⚠ HONOUR THE SAME INPUT LOCKS THE CANVAS PATH DOES (carried over verbatim from the footer these
  // rows replace). These buttons live on app.stage and their pointertap never passes through
  // Controls.isInputLocked(), so without this a benched (eaten) player — or one mid-cinematic /
  // mid-NONET, where full-screen overlays do not all capture pointers — could spend victory points.
  const locked =
    world.sudoku !== null ||
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
  /*
   * ⭐ S164 P1 (owner R128–R131) — THE CASTLE REGEN ROW. Deliberately the same shape as the two
   * above: one price, one blocker string in place of the price, one dispatch through `dispatchFn`.
   *
   * ⚠ NO PHASE BLOCKER, per R129 — *"whenever you want you can upgrade castle regen"*. The only
   * blockers are the ones that are true of any spend (`locked`), the cap, affordability, and a
   * fallen castle, which can never regenerate at all (R131) so buying would be a pure tax.
   */
  const regenLevel = me?.castleRegenLevel ?? 0;
  const regenReason = locked
    ? 'LOCKED'
    : me !== undefined && me.castleHp <= 0
      ? 'CASTLE LOST'
      : regenLevel >= CASTLE_MAX_REGEN_LEVEL
        ? 'MAX REGEN'
        : score < CASTLE_REGEN_UPGRADE_PRICE
          ? `NEED ${CASTLE_REGEN_UPGRADE_PRICE}`
          : '';

  /*
   * ⭐⭐ S188 P3 — THE FOUR CASTLE-STAT ROWS. The regen row above is the template, line for line:
   * one price, the blocker printed IN PLACE of the price, no phase gate (the reducer has none — it is
   * `UPGRADE_CASTLE_REGEN`'s posture), and every refusal names itself.
   *
   * The blockers, in the reducer's own guard order (`applyUpgradeCastleStat`):
   *   · NOT YOURS   — the panel is open on a keep that is not the local seat's, or the local seat has
   *                   no player (a mirror before its roster lands). The purchase would be the local
   *                   seat's, so offering it over someone else's keep would be a lie.
   *   · LOCKED      — a NONET trial or a bench, the SAME `locked` the three rows above honour (the
   *                   bench gate also denies the intent host-side: `benchGate.ts`).
   *   · CASTLE LOST — R131, a fallen keep buys nothing (reducer + `elimination.ts` deny it too).
   *   · MAX         — `canBuyCastleStat`, the reducer's own cap predicate, not a second comparison.
   *   · NEED 100    — `CASTLE_UPGRADE_PRICE`, against the same floored score the rows above use.
   *
   * ⚠ THE LEVEL IS PRINTED IN EVERY STATE, not only when enabled (the regen row drops it when
   * disabled). His cap is *"a maximum of ten upgrade points"*, so `3/10` is the one place a player
   * can read how far along an axis he is — and it matters MOST on the MAX and NEED rows.
   *
   * ⭐ THE SECOND LINE IS WHAT THE NEXT POINT BUYS — `castleUpgradePreview`, S187's own HUD string:
   * `+250 HP` for HP (the CURRENT wave's band, the same `world.waveNumber` the reducer bakes from),
   * `+8 DAMAGE` / `+5 DAMAGE` for ATK / PEN on the ladder, `-17% TAKEN` for DEF. Shown while you can
   * buy it AND while you are saving for it (NEED), because "what am I saving for" is the question a
   * short row raises. Hidden on MAX (the preview itself says MAX) and on the three rows where no
   * amount of points would buy it.
   */
  const notMine = me === undefined || viewedSeat !== world.localPlayerId;
  const needStat = `NEED ${CASTLE_UPGRADE_PRICE}`;
  const statRows = CASTLE_STAT_ROWS.map(({ key, stat, word }) => {
    const reason = notMine
      ? 'NOT YOURS'
      : locked
        ? 'LOCKED'
        : me.castleHp <= 0
          ? 'CASTLE LOST'
          : !canBuyCastleStat(me.castleUpgrades, stat)
            ? 'MAX'
            : score < CASTLE_UPGRADE_PRICE
              ? needStat
              : '';
    const lvl = me === undefined ? 0 : castleLevelOf(me.castleUpgrades, stat);
    const head = `${word} ${lvl}/${CASTLE_UPGRADE_MAX_LEVEL}`;
    const showNext = me !== undefined && (reason === '' || reason === needStat);
    return {
      key,
      label: reason === '' ? `${head}  ${CASTLE_UPGRADE_PRICE}` : `${head}  ${reason}`,
      detail: showNext
        ? `NEXT ${castleUpgradePreview(me.castleUpgrades, stat, world.waveNumber)}`
        : '',
      enabled: reason === '',
      reason,
    };
  });

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
    {
      key: 'castleRegen',
      // The level is shown because it is the only place a player can read it back, and because the
      // effect (HP/s) is otherwise invisible until the castle is actually damaged.
      label:
        regenReason === ''
          ? `REGEN ${regenLevel}→${regenLevel + 1}  ${CASTLE_REGEN_UPGRADE_PRICE}`
          : `REGEN  ${regenReason}`,
      enabled: regenReason === '',
      reason: regenReason,
    },
    ...statRows,
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
  return castleBlockOrigin(ax, ay, panelHeight(rows, cap));
}

/**
 * ⭐⭐ S181 — PURE — where a castle-anchored box of height `blockH` goes: **BESIDE the keep**, flipping
 * to its other side when it would overflow, vertically centred on it and clamped on-canvas.
 *
 * ⛔ **THIS EXISTS BECAUSE "ABOVE THE KEEP" IS GEOMETRICALLY IMPOSSIBLE FOR THE MERGED WINDOW, AND
 * AN E2E TEST PROVED IT RATHER THAN A HUNCH.** The first attempt at the owner's one-window castle
 * floated the card above the keep with the panel docked below it; `castle-panel.spec.ts`
 * ("clicking the castle again closes it") went red. The arithmetic says why: card 240 + panel 292 =
 * a 532px block, and the keep sits at y≈516, so the block cannot fit above it. The bottom clamp
 * then slid it back DOWN over the keep, `onDown`'s `isPointerOverPanel()` early-return swallowed
 * the second click, and the toggle never fired — the panel became impossible to close.
 *
 * ⭐ SO THE MERGED WINDOW GOES WHERE THE PANEL ALWAYS WENT: beside the keep. The owner has been
 * playing with it there since S136, the keep stays clickable, and the only thing that changed is
 * that the card is now the top of the same box.
 *
 * ⚠ ONE PLACEMENT RULE, TWO CALLERS. `panelOrigin` delegates here rather than keeping its own copy
 * of the flip-and-clamp — the same discipline `rowsTop` and `CASTLE_ROW_KEYS` were extracted for in
 * this very file, and for the same reason: a second copy is how the plate and the click geometry
 * start disagreeing.
 */
export function castleBlockOrigin(ax: number, ay: number, blockH: number): { x: number; y: number } {
  let x = ax + KEEP_H / 2 + ANCHOR_GAP;
  if (x + PANEL_W > CANVAS_WIDTH - 8) x = ax - KEEP_H / 2 - ANCHOR_GAP - PANEL_W;
  if (x < 8) x = 8;
  let y = ay - blockH / 2;
  if (y < 8) y = 8;
  if (y + blockH > CANVAS_HEIGHT - 8) y = CANVAS_HEIGHT - 8 - blockH;
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
    TITLE_H + bankStripHeight(cap) +
    structuresStripHeight(liveTileCount()) +
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
    PANEL_PAD + TITLE_H + bankStripHeight(cap)
    + structuresStripHeight(liveTileCount())
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
  private readonly rows: Array<{
    box: Container; bg: Graphics; label: Text; detail: Text; hover: boolean;
  }> = [];
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
  /**
   * S148 P1 — the board this match is on, LATCHED from `world.layout` every `sync`.
   *
   * ⚠ A CACHE, AND IT HAS TO BE. `isOverPanel` and `getUiPoints` are called on the raw pointer path
   * and by the e2e harness, neither of which carries a `World` — but the panel's position derives
   * from `castleAnchor`, which now needs the layout. Threading a world into a hit-test would spread
   * world access into the input path for one scalar.
   *
   * SAFE because the value is immutable for the life of a match (`layout` is stamped once at
   * START_GAME and never written again) and re-latched every frame regardless, so the worst case is
   * one frame of the previous match's board on the very first sync after a mode change — before
   * which `selected` is null and both readers return early anyway.
   */
  private layout: ZoneLayout = 'PITCH_2P';
  private onBuyGatherer: (() => void) | null = null;
  private onUpgradeSpeed: (() => void) | null = null;
  private onCastleRegen: (() => void) | null = null;
  /** S188 P3 — the four castle-stat rows' one dispatch, injected by main.ts. */
  private onCastleStat: ((stat: CastleStat) => void) | null = null;
  /** S181 — when set, the panel docks flush beneath the character card instead of beside the keep. */
  private dock: { x: number; y: number; w: number; h: number } | null = null;
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

    /*
     * S165 - COUNTED FROM `CASTLE_ROW_KEYS`, NOT A LITERAL. This read `i < 2` with a comment
     * promising that "a third costs one entry"; S164 P1 then added the third entry to the model and
     * this loop kept building two, so the castle-regen upgrade was never drawn and never clickable.
     * A count that lives next to the list cannot fall behind it.
     */
    for (let i = 0; i < CASTLE_ROW_KEYS.length; i++) {
      const bg = new Graphics();
      const label = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 17, fill: 0xffffff }),
      });
      label.anchor.set(0.5);
      label.position.set((PANEL_W - PANEL_PAD * 2) / 2, ROW_H / 2);
      // ⭐ S188 P3 — the optional second line (`PanelControl.detail`). Built for every row so the
      // loop stays one shape; a row with no detail leaves it empty and its label centred.
      const detail = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: ROW_DETAIL_FONT_SIZE, fill: 0x9fc4e8 }),
      });
      detail.anchor.set(0.5);
      detail.position.set((PANEL_W - PANEL_PAD * 2) / 2, ROW_DETAIL_Y);
      const box = new Container();
      box.addChild(bg); // ⚠ Graphics child supplies containsPoint — do not remove (see docblock).
      box.addChild(label);
      box.addChild(detail);
      box.position.set(PANEL_PAD, rowsTop() + i * (ROW_H + ROW_GAP));
      box.eventMode = 'static';
      box.cursor = 'pointer';
      const idx = i;
      box.on('pointertap', () => this.activate(idx));
      box.on('pointerover', () => { this.rows[idx].hover = true; });
      box.on('pointerout', () => { this.rows[idx].hover = false; });
      this.container.addChild(box);
      this.rows.push({ box, bg, label, detail, hover: false });
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

    // S144 P2 — THE BUILD GRID + its caption. Same Container+Graphics-child idiom as every other
    // clickable here (the Graphics child supplies `containsPoint`; a bare Container has none and
    // Pixi's hitTest falls through to false — see the file docblock).
    this.sectionLabel = new Text({
      text: 'BUILD',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x7c93a8 }),
    });
    this.container.addChild(this.sectionLabel);

    this.sectionLabel.visible = CASTLE_BUILD_GRID_ENABLED;
    for (let i = 0; CASTLE_BUILD_GRID_ENABLED && i < ALL_BLUEPRINT_IDS.length; i++) {
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
    // ⛔ S149 P6 FIX — THE CAPTION GOES WITH THE GRID. Owner screenshot: "PICK A TOWER / costs
    // shapes from your bank" was drawing straight through "BUY GATHERER  NEED 105". My own
    // regression from this session: disabling the grid collapsed the strip to zero height but
    // left its two caption lines visible, so they landed on top of the control rows that moved
    // up into the space. Hiding the tiles is not enough — everything the strip owned must go.
    this.captionName.visible = CASTLE_BUILD_GRID_ENABLED;
    this.captionTag.visible = CASTLE_BUILD_GRID_ENABLED;

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

  /** main.ts injects the BUY_GATHERER dispatch for the local seat. */
  setBuyGathererHandler(fn: () => void): void {
    this.onBuyGatherer = fn;
  }

  /** main.ts injects the UPGRADE_CASTLE_REGEN dispatch for the local seat (S164 P1). */
  setCastleRegenHandler(fn: () => void): void {
    this.onCastleRegen = fn;
  }

  /** main.ts injects the UPGRADE_GATHERER_SPEED dispatch for the local seat. */
  setUpgradeSpeedHandler(fn: () => void): void {
    this.onUpgradeSpeed = fn;
  }

  /**
   * ⭐ S188 P3 — main.ts injects the UPGRADE_CASTLE_STAT dispatch for the local seat. ONE handler for
   * the four rows, parameterised by the stat, because they are one intent with a `stat` field — four
   * setters would be four chances for one of them to be left unwired, which is how S164's regen row
   * shipped invisible.
   */
  setCastleStatHandler(fn: (stat: CastleStat) => void): void {
    this.onCastleStat = fn;
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

  /**
   * ⭐ S149 P5 — ARM A TOWER FROM OUTSIDE THE PANEL (the footer band).
   *
   * The BUILD grid moved to the footer, but `armed` deliberately stays HERE: `controls.ts` reads
   * `castlePanel.armedBlueprint()`, the cursor ghost follows it, and the place-commit path is built
   * on it. Re-homing that state would have meant rewiring the whole carry flow to chase a UI move.
   * So the footer routes its card click through this one method and every downstream behaviour —
   * ghost, escape-to-disarm, right-click cancel, commit — is inherited unchanged.
   */
  /**
   * ⭐ S149 P6 — ORDER THE SHAPES A TOWER STILL NEEDS, addressed by blueprint id.
   *
   * The castle's build tile already did exactly this for a SHORT tile. The footer needs the same
   * behaviour now that it owns tower selection, and the owner was explicit that the mechanic must
   * PERSIST rather than be rebuilt: *"we literally just move the tower purchase section to where
   * classical tower defence footbars are. the mechanics we had should persist!"*
   *
   * ⚠ Addressed by ID, not by tile INDEX — the footer has no tiles. And the row is recomputed here
   * rather than read from `structureMissing[]`, which is only populated while the (now disabled)
   * grid renders and would therefore be permanently empty.
   */
  /**
   * ⛔ S153 P5a (owner R91) — DERIVED ON DEMAND, NOT READ FROM A LATCH. This is a bug fix, and the
   * bug it fixes is the one the owner hit.
   *
   * Owner: *"i clicked on tier 5 buld and then goblin tower twice - and then when i clicked on the
   * castle it didnt show anything in queue. only when the castle page was up and then i clicked on
   * them again, those shape that make the goblin tower came up to queue."*
   *
   * The cause was one line below: this read `this.structuresModel`, a field assigned ONLY inside
   * the panel's draw. A player who had never opened the castle had an EMPTY latch, so `find`
   * returned undefined and this returned silently — the order was dropped with no refusal, no
   * sound, and nothing on screen. Opening the panel once populated the latch, which is exactly why
   * the owner's second attempt worked and why it looked so arbitrary.
   *
   * ⚠ THE LATCH WAS ITSELF A FIX FOR THIS CLASS, which is worth recording rather than quietly
   * deleting: S149 P6 introduced it because the per-tile slices it replaced were left permanently
   * empty when the grid moved to the footer. It closed "the panel was open and then closed" and
   * left "the panel was never opened" wide open. `castleStructuresModel` is a PURE function of
   * `world`, so there was never a reason to cache it — deriving removes the whole failure mode
   * instead of moving its boundary.
   */
  requestShapesFor(world: World, id: GodlyId): void {
    const row = castleStructuresModel(world).find((r) => r.id === id);
    if (row === undefined || row.enabled) return; // affordable ⇒ nothing to order
    if (row.reason === 'LOCKED') return;          // a temporary input lock, not a shortage
    if (row.missing.length === 0) return;
    this.onRequestShapes?.(row.missing.map((m) => ({ type: m.type, need: m.need, have: m.have })));
  }

  armExternal(id: GodlyId | null): void {
    this.armed = this.armed === id ? null : id;
    this.onArm?.(this.armed);
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
    /*
     * ⭐ S188 P3 — THE INDEX CHAIN BECAME A KEY SWITCH, as S164's note here asked ("an index chain is
     * fine at three, but the NEXT one should become a map"). The chain was `idx === 0 ? … : idx === 1
     * ? … : regen`, so a fourth row would have fallen into its last arm and silently bought REGEN.
     * An exhaustive switch over `CastleRowKey` makes a new key a `tsc` error until it is handled.
     */
    const key = CASTLE_ROW_KEYS[idx];
    if (key === undefined) return;
    const fn = this.handlerFor(key);
    if (fn === null) return;
    this.spendArmed = true;
    fn();
  }

  /** The injected dispatch for one row, or null while main.ts has not injected it yet. */
  private handlerFor(key: CastleRowKey): (() => void) | null {
    switch (key) {
      case 'buyGatherer':
        return this.onBuyGatherer;
      case 'upgradeSpeed':
        return this.onUpgradeSpeed;
      case 'castleRegen':
        return this.onCastleRegen;
      case 'castleHp':
      case 'castleAtk':
      case 'castleDef':
      case 'castlePen': {
        const onStat = this.onCastleStat;
        const row = CASTLE_STAT_ROWS.find((r) => r.key === key);
        if (onStat === null || row === undefined) return null;
        return () => onStat(row.stat);
      }
      default: {
        const unreachable: never = key;
        return unreachable;
      }
    }
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
  /**
   * ⭐⭐ S181 (owner) — **THE CASTLE IS ONE WINDOW, NOT TWO.**
   *
   * > *"Look at the castle. You've made a new thing while I told you that the castle inventory with
   * > the little selectors, the gatherers, the gatherer speed upgrade, the castle regen and
   * > everything, that should be a part of the castle character sheet, just an expanded form. I
   * > don't need two windows. It's confusing this way."*
   *
   * ⛔ **DOCKED, NOT DUPLICATED, AND THAT IS THE WHOLE DESIGN DECISION.** This panel owns THREE
   * interactive strips — the buy rows (`activate`), the bank pull (`pull`) and the blueprint tiles
   * (`armTile`). Re-implementing them inside `characterSheet` would be ~600 lines of second copy of
   * logic that must agree, which is the defect this codebase spends most of its comments on and
   * which `rowsTop`'s own docblock records happening here before: the rows DREW at one y while
   * `getUiPoints` reported another, so every click landed on empty plate and a screenshot looked
   * perfect. So the card keeps the identity (portrait, name, health, stats) and this panel docks
   * flush beneath it as the expanded body. One outline, one window, zero duplicated controls.
   *
   * ⚠ NOTHING IS LOST BY DOCKING RATHER THAN FOLDING. Measured in the live client this session: the
   * FOOTER BAND already carries the full build surface — the blueprint chips for complexity 3..9 and
   * all six palette shapes. The panel's tiles and bank are the SECOND copy, not the only one, which
   * is why absorbing this panel wholesale was never necessary.
   */
  setDock(rect: { x: number; y: number; w: number; h: number } | null): void {
    this.dock = rect;
  }

  /**
   * The panel's top-left: docked under the card when one is open on this keep, else its own
   * keep-anchored placement.
   *
   * ⛔ ONE RESOLVER, THREE CALLERS — `isOverPanel`, `getUiPoints` and `sync` each computed
   * `panelOrigin(a.x, a.y, rows)` separately. That is the exact triplication `rowsTop` was extracted
   * to end, and docking from only two of the three would put the plate in one place and the click
   * geometry in another.
   */
  private originNow(a: { x: number; y: number }): { x: number; y: number } {
    if (this.dock !== null) {
      const h = panelHeight(this.rows.length);
      // Clamped like `panelOrigin` does, so a keep low on the ring cannot push its own controls off
      // the bottom of the canvas.
      const y = Math.min(CANVAS_HEIGHT - 8 - h, this.dock.y + this.dock.h);
      return { x: this.dock.x, y: Math.max(8, y) };
    }
    return panelOrigin(a.x, a.y, this.rows.length);
  }

  isOverPanel(x: number, y: number): boolean {
    if (this.selected === null) return false;
    const a = castleAnchor(this.selected, this.layout);
    const r = panelRect(this.originNow(a), this.rows.length);
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** S136 P0 — live click geometry for the e2e harness (the S85 P4c geometry-getter convention). */
  getUiPoints(): {
    open: boolean;
    rect: { x: number; y: number; w: number; h: number } | null;
    rowCenters: Array<{ key: string; x: number; y: number; enabled: boolean; reason: string }>;
    bank: { count: number; cap: number };
    slotCenters: Array<{ index: number; x: number; y: number; filled: boolean }>;
    /*
     * ⭐ S154 P1 (R80) — `paletteCenters` / `chipCenters` ARE GONE FROM HERE. The palette and the
     * order queue moved to the permanently-visible footer strip, so their live geometry is reported
     * by `FooterBand.getUiPoints()` as `palette` / `queue`. `e2e/stink-tower.spec.ts` reads them
     * there now — and no longer has to open the castle first, which is the whole point of R80.
     */
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
        structureCenters: [],
        // ⚠ NOT hardcoded null. A held tower outlives the panel closing (see `sync`), so reporting
        // null here would tell the harness — and any future consumer — that the player is empty-handed
        // while a ghost is visibly following their cursor. The first version did exactly that, and the
        // e2e test read it as "the illegal drop lost my tower" when the tower was in fact still held.
        armed: this.armed,
      };
    }
    const a = castleAnchor(this.selected, this.layout);
    const o = this.originNow(a);
    const keys = CASTLE_ROW_KEYS;
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
  /** S149 P6 — the last full build model, latched every sync so the FOOTER can consult it. */
  private structureReasons: string[] = [];
  /** S145 P2 — per-tile shortfall, latched per frame beside `structureReasons`. */
  private structureMissing: Array<ReadonlyArray<{ type: SparkType; need: number; have: number }>> = [];

  sync(world: World): void {
    // S148 P1 — latch the board FIRST, above every early return. `isOverPanel` and `getUiPoints`
    // read it without a World (see the field docblock), so it must be refreshed on every frame the
    // panel is synced, not only on the frames where it is open.
    this.layout = world.layout;
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

    // ⭐ S188 P3 — the seat the panel is OPEN ON, so "not your castle" is decided by the model.
    const model = castleControlsModel(world, this.selected as unknown as PlayerId);
    this.enabled = model.map((m) => m.enabled);
    this.reasons = model.map((m) => m.reason);

    const a = castleAnchor(this.selected, this.layout);
    const o = this.originNow(a);
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
    /*
     * ⭐ S181 (owner) — DROP THE REDUNDANT WORD WHEN DOCKED. The card immediately above already
     * says CASTLE in the race colour, at 17px; repeating it 40px lower is the *"confusing this
     * way"* he objected to, in miniature. The INVENTORY count is NOT redundant and stays either way
     * — it is the only readout of how many shapes the keep is holding.
     */
    this.titleText.text = this.dock !== null ? `INVENTORY ${bankTotal}` : `CASTLE   INVENTORY ${bankTotal}`;
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

    // S144 P2 — THE BUILD GRID. Affordability comes from `castleStructuresModel`, which decides it
    // with the SAME `planBlueprintPayment` the reducer uses — so a bright tile is always buildable.
    const structures = castleStructuresModel(world);
    // ⛔ S153 P5a — THE S149 P6 LATCH IS GONE. It cached this model so the footer's
    // order-the-shapes path had something to read, which worked only once the panel had drawn at
    // least once; a player who never opened the castle silently lost their order (owner R91).
    // `requestShapesFor` now derives the model itself from `world`, so there is nothing to latch.
    this.sectionLabel.position.set(
      PANEL_PAD,
      PANEL_PAD + TITLE_H + bankStripHeight(),
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
    const capY = PANEL_PAD + TITLE_H + bankStripHeight()
      + SECTION_LABEL_H + structureRowCount(liveTileCount()) * TILE
      + (structureRowCount(liveTileCount()) - 1) * TILE_GAP + 6;
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
      // ⭐ S188 P3 — a row with a detail line lifts its label to make room; one without it draws
      // exactly where every row drew before this change.
      const detail = m.detail ?? '';
      row.label.position.y = detail === '' ? ROW_H / 2 : ROW_LABEL_Y_WITH_DETAIL;
      row.detail.text = detail;
      row.detail.style.fill = on ? 0x9fc4e8 : 0x6b7a88;
      row.box.cursor = on ? 'pointer' : 'default';
    }
  }
}
