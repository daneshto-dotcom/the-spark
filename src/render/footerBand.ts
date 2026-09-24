/**
 * SPARK — S149 P4: the footer band renderer (R36).
 *
 * A row of NUMBERS along the bottom of the board — one per connector count present in the recipe
 * registry. Clicking one opens the castle panel filtered to that complexity.
 *
 * ## ⛔ THE CHIPS ARE CENTRED, AND THAT IS LOAD-BEARING GEOMETRY
 *
 * `zones.test.ts` has carried this warning since S148: *"the bottom keeps deposit below the footer
 * line, which is only safe while the footer is empty … If a footer control is ever revived, these
 * anchors move up."* Measured this session: on `QUADRANTS_4P` the seat-2 and seat-3 porches sit at
 * **(1790, 1024)** and **(130, 1024)** — inside the band (`FOOTER_TOP_Y` = 996).
 *
 * Rather than move two shipped castle anchors (and every gatherer spawn, deposit and hit-test
 * derived from them), the chips occupy a CENTRED span that clears both corners with ~500 px to
 * spare. Cheaper, and it disturbs no geometry that already works. `zones.test.ts` now asserts that
 * clearance instead of merely warning about it.
 *
 * ## ⛔ AND THE CLICK GUARD COVERS THE CHIPS, NOT THE BAND
 *
 * The other half of the same lesson, recorded in `castlePanel.ts`: the old footer was *"a 1920-wide
 * band whose empty region had to stay clickable, or every world object in the bottom 7.8% went
 * inert."* So `isOverChip` hit-tests the chip rectangles only — the empty stretches of the band
 * stay fully clickable board.
 *
 * RENDER-ONLY: reads `world`, never mutates it.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { ALL_SPARK_TYPES, CANVAS_HEIGHT, CANVAS_WIDTH, FOOTER_TOP_Y } from '../constants.ts';
import { footerBandModel, structuresAtComplexity, type FooterComplexity } from './footerBandModel.ts';
// S169 R153 — the strip states which race owns each shape, in that race's colour.
import { raceColorForShape } from '../state/races.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { drawBlueprintThumb } from './blueprintGlyph.ts';
import type { World } from '../state/world.ts';
import type { SparkType } from '../constants.ts';
// ⭐ S188 P6 — POWER OF RA: the button reads the REDUCER's own predicate, never a second copy of it.
import { raCastRefusal, seatHasPowerOfRa, type RaCastRefusal } from '../state/racial/powerOfRaRules.ts';
import { raAimPreview, setRaAimPreview } from './raAimPreview.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';
// S173 — the shortfall readout. Its shape and its geometry are PURE and live beside the model that
// computes the shortfall, so this surface and the (retained) castle caption cannot lay it out
// differently — the same sharing rule `structuresAtComplexity` follows for affordability.
import {
  SHORTFALL_GLYPH_R,
  glyphCountRowLayout,
  shortfallEntries,
  shortfallRowLayout,
  structureRowFor,
  type GlyphCountSlot,
} from './castlePanel.ts';
import {
  STRIP_MARGIN,
  STRIP_MAX_CHIPS,
  hitStripRect,
  shapeStripLayout,
  type PaletteButtonGeom,
  type QueueChipGeom,
} from './shapeStrip.ts';

/** Chip box size. */
const CHIP_W = 62;
const CHIP_H = 46;
/** Gap between chips. */
const CHIP_GAP = 14;
/** Vertical centre of the chip row, inside the footer band. */
const CHIP_CY = FOOTER_TOP_Y + (CANVAS_HEIGHT - FOOTER_TOP_Y) / 2;

/**
 * Lit when something at this complexity is affordable; dim otherwise.
 *
 * ⚠ THE DISABLED TINT IS DELIBERATELY STILL READABLE. The first pass used 0x4a505c, and the
 * screenshot settled it: dark slate on a black board made the numbers invisible, which defeats the
 * entire point of R36 — the bar exists so the player can SEE which complexities the world holds and
 * what they are working toward. Unaffordable must read as UNAFFORDABLE, never as absent.
 */
const TINT_ENABLED = 0xffd27a;
const TINT_DISABLED = 0x93a0b4;
const TINT_SELECTED = 0x7ef0a0;

/** Tower-card size in the menu that opens above a selected chip. */
const CARD_W = 226; // S149 P6 — widened to seat the tower glyph beside the label
const CARD_H = 62;
const CARD_GAP = 10;
/** The menu floats just above the band. */
const MENU_BOTTOM_GAP = 12;

/**
 * S173 — the most shapes ONE card's shortfall can ever name. Six, because that is how many primitive
 * types exist: a bill cannot be short of a seventh. Derived rather than written as `6` so a new
 * primitive widens the reservation instead of silently truncating the readout.
 */
const SHORTFALL_MAX_SHAPES = ALL_SPARK_TYPES.length;

/* ────────────────────────────────────────────────────────────────────────── *
 *   ⭐⭐ S182 ITEM 3 (owner) — WHAT THE CARRIED TOWER WILL COST
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * > *"When you click on a tower, before you place it, when you're carrying the template, it should
 * > show you 'this will cost you this much and this much'. In a consistent manner without writing
 * > over the shapes. It should be a very understandable place."*
 *
 * ⭐ IT LIVES ON THE **LEFT** OF THE TIER CHIPS, WHICH IS THE ONE EMPTY STRETCH OF THE BAND.
 * The chips are centred, the shape strip occupies the right (S154 P1, R80), and *"without writing
 * over the shapes"* is the owner's own constraint on where this may go. So the readout is the
 * shape strip's mirror image: derived from THIS frame's chip row, growing away from it, never a
 * hardcoded x — the discipline `shapeStripLayout` records for the other side, where a hardcoded
 * origin would be quietly wrong the day a sixth recipe complexity enters the registry.
 *
 * ⛔⛔ AND IT REUSES THE BILL, IT DOES NOT COMPUTE ONE. `StructureRow.bill` comes from
 * `castleStructuresModel`'s single `blueprintBill(id)` loop — the same model whose affordability is
 * `planBlueprintPayment`, the function the reducer itself calls. A second cost calculator that
 * drifts is this repo's named top defect, and it is the one thing this feature could most easily
 * have become.
 */
/** Reserved width for the word `COST`. Four chars at the 13 px monospace ≈ 31 px; 46 leaves air. */
const CARRY_WORD_W = 46;
/**
 * Air between the readout's right edge and the first tier chip. Deliberately `STRIP_MARGIN`, the
 * same 34 px the strip leaves on the other side, so the band reads as one line with even margins.
 */
const CARRY_MARGIN = STRIP_MARGIN;
/** Pooled labels the carry readout reserves: the word, plus one count per shape a bill can name. */
const CARRY_LABELS = 1 + SHORTFALL_MAX_SHAPES;
/**
 * ⚠ How far the PLATE overhangs the readout's content on each side — and it is EXPORTED because the
 * plate, not the content, is the widest thing drawn. A clearance test that measured `left`/`right`
 * would be measuring the wrong rectangle and would pass while the plate sat on a chip.
 */
export const CARRY_PLATE_PAD = 10;
/**
 * Pooled labels ONE card reserves: its name, its sub-line, and one count per shape it can be short
 * of. A FIXED stride, for the reason spelled out at the shape-strip badge block — a running index
 * would shift every later card's labels sideways the moment one card's shortfall changed length.
 */
const CARD_LABELS = 2 + SHORTFALL_MAX_SHAPES;
/** Space between the word `NEED` and the first glyph+count pair. */
const SHORTFALL_PREFIX_GAP = 8;

export interface FooterCardGeom {
  readonly id: GodlyId;
  readonly name: string;
  readonly reason: string;
  /**
   * S173 — the per-shape shortfall behind `reason`, carried through verbatim from
   * `castleStructuresModel`. The card draws THIS (as glyph+count pairs) and keeps `reason` only as
   * the one-line fallback for `LOCKED`; see the sub-line block in `sync` for why a total was never
   * enough. Empty exactly when the card is affordable.
   */
  readonly missing: ReadonlyArray<{ type: SparkType; need: number; have: number }>;
  readonly enabled: boolean;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface FooterChipGeom {
  readonly complexity: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly enabled: boolean;
}

/** R81 — pixels a hovered chip grows on each side. Small: the row is dense and must not reflow. */
const HOVER_GROW = 2;

/**
 * ⭐⭐ S187 (owner) — **THE COLLAPSE TAB.** His design, and his brother's problem:
 *
 * > *"My brother is worrying that for a four player game the bottom two quadrants are losing space
 * > because they have this menu there … maybe there should be like an arrow down that removes that
 * > whole menu so you can build there, and then the arrow is looking up and you click on it and it
 * > brings back the menu with the tiers. Very clickable, very understandable, very obvious."*
 *
 * ⛔ **AND THIS IS THE ONLY THING THAT CAN ACTUALLY GIVE HIM THE BOTTOM BAND.** Canon §4b records
 * that the dead band and the footer stand on the SAME ground, so lowering the edge rule further just
 * puts towers under a plate the guards then refuse. Geometry could not solve it; releasing the
 * surface can.
 *
 * ⚠ The tab is DELIBERATELY SMALL and centred. Collapsed, it is the only footer pixel left, so every
 * pixel it occupies is board the player has asked to get back.
 */
export const COLLAPSE_TAB_W = 76;
export const COLLAPSE_TAB_H = 20;

/** Where the tab sits. Expanded it rides the band's top edge; collapsed it hugs the screen bottom. */
export function collapseTabRect(collapsed: boolean): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(CANVAS_WIDTH / 2 - COLLAPSE_TAB_W / 2),
    y: collapsed ? CANVAS_HEIGHT - COLLAPSE_TAB_H : FOOTER_TOP_Y - COLLAPSE_TAB_H,
    w: COLLAPSE_TAB_W,
    h: COLLAPSE_TAB_H,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *   ⭐⭐ S188 P6 (owner, `mummies.l0`) — THE POWER OF RA SKILL BUTTON
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * > *"it adds you a skill button … maybe to the left of the tier three tower because there's nothing
 * > there. So maybe that will be designed for skills."* — owner, S187
 *
 * So it sits immediately LEFT OF THE CHIP ROW (the leftmost chip is the tier-3 tower's), a chip's gap
 * away, on the chip row's own line — derived from THIS frame's chips, never a hardcoded x, the
 * discipline the carry readout and the shape strip both follow. The carry readout, which also lives
 * on this side, is laid out left of the BUTTON when the button is drawn, so the two never meet.
 *
 * ⚠ DRAWN ONLY FOR A SEAT THAT HOLDS THE PERK. A seat without it has no skill, and a permanently
 * dead button would be the "dead button" R126 forbids.
 *
 * ⛔ AND IT SURVIVES THE S187 COLLAPSE, as a compact sun beside the tab. ⚠ MINE: the collapse exists
 * to give the bottom band back, and a once-per-fight attack that disappeared whenever a player had
 * asked for that ground would quietly cost them their racial. The compact button is 44 × 20 — the
 * tab's own height — and like the tab it is both a control (`isOverChip`) and an opaque surface
 * (`isOverBandSurface`), in both states, so nothing is planted under it and nothing is clickable
 * where it is not drawn.
 */
export const RA_BUTTON_W = 84;
export const RA_BUTTON_COLLAPSED_W = 44;
/** Air between the compact button and the collapse tab. ⚠ MINE. */
const RA_BUTTON_COLLAPSED_GAP = 8;
/** The sun's own colour — the Pharaoh's halo, so the button reads as the same power. ⚠ MINE. */
const RA_TINT = 0xffd970;

export interface RaButtonGeom {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The collapsed form: glyph only, no caption. */
  readonly compact: boolean;
}

/** PURE — where the skill button sits this frame, or null when there is no chip row to sit beside. */
export function layoutRaButton(chips: readonly FooterChipGeom[], collapsed: boolean): RaButtonGeom | null {
  if (collapsed) {
    const tab = collapseTabRect(true);
    return {
      x: tab.x - RA_BUTTON_COLLAPSED_GAP - RA_BUTTON_COLLAPSED_W,
      y: tab.y,
      w: RA_BUTTON_COLLAPSED_W,
      h: tab.h,
      compact: true,
    };
  }
  if (chips.length === 0) return null;
  const first = chips.reduce((a, c) => (c.x < a.x ? c : a));
  return { x: first.x - CHIP_GAP - RA_BUTTON_W, y: first.y, w: RA_BUTTON_W, h: first.h, compact: false };
}

/**
 * PURE — what the button SAYS. A refused control must say why (the castle panel's standing contract,
 * carried into every footer control). Exhaustive on purpose: a new refusal fails `tsc` here rather
 * than falling through a tolerant `default` to a blank caption (S182 lesson 7).
 */
export function raButtonCaption(refusal: RaCastRefusal | null, aiming: boolean): string {
  if (refusal === null) return aiming ? 'AIMING' : 'CALL RA';
  switch (refusal) {
    case 'NOT_FIGHT':
      return 'FIGHT ONLY';
    case 'USED':
      return 'USED';
    case 'BENCHED':
      return 'BENCHED';
    case 'ELIMINATED':
      return 'OUT';
    case 'NOT_PLAYING':
    case 'NOT_HELD':
    case 'NO_SEAT':
      return ''; // the button is not drawn in these states
  }
}

export class FooterBand {
  /**
   * ⭐ S188 P6 — the POWER OF RA button as drawn THIS frame, or null. Stored for the reason `carry`
   * is: the hit-test must test the very rectangle `sync` drew.
   */
  private ra: RaButtonGeom | null = null;
  /** The button's caption. NOT in the pooled labels: its own object, so no reservation shifts. */
  private raLabel: Text | null = null;
  private hoverRa = false;
  /**
   * ⭐ S187 — is the band hidden? RENDER-ONLY, never world state: it is one player's view
   * preference, it must not reach the wire, and two peers disagreeing about it is not a divergence.
   * `selected` above is render-only for exactly the same reason.
   */
  private collapsed = false;
  /** S153 P4 — complexity of the chip under the pointer, or null. Set by `setHover`. */
  private hoverChip: number | null = null;
  /** S153 P4 — id of the tower card under the pointer, or null. */
  private hoverCard: GodlyId | null = null;
  /** S153 P4 — pointer is held down. */
  private pressed = false;
  private readonly container: Container;
  private readonly graphics: Graphics;
  private readonly labels: Text[] = [];
  private chips: FooterChipGeom[] = [];
  private cards: FooterCardGeom[] = [];
  /** The tower held on the cursor, mirrored from the castle panel so the card can light up. */
  private armed: GodlyId | null = null;
  /** The complexity the player has opened, or null. Render-only selection — never world state. */
  private selected: number | null = null;
  /**
   * ⭐ S154 P1 (owner R80) — THE SHAPE STRIP: the palette + order queue, laid out right of the last
   * tier chip and drawn on every frame of a live match. Geometry is PURE and lives in
   * `shapeStrip.ts`; this class owns the pixels and the hit-tests, exactly as it already does for
   * the chips. See that file for why the panel's Pixi-per-button controls were REWRITTEN here
   * rather than reparented.
   */
  private strip: { palette: PaletteButtonGeom[]; queue: QueueChipGeom[] } = { palette: [], queue: [] };
  /**
   * ⭐ S182 — THIS FRAME'S CARRY READOUT, or null when no tower is in hand. Stored for the same
   * reason `strip` is: `isOverCarryBill` must hit-test the very rectangle `sync` drew, never a
   * second, independently-computed one.
   */
  private carry: CarryBillGeom | null = null;
  /** The palette shape under the pointer, or null. Set by `setHover`, off the click path's own test. */
  private hoverPalette: SparkType | null = null;
  /** The queue chip under the pointer, or null. */
  private hoverQueue: SparkType | null = null;
  private onEnqueue: ((t: SparkType) => void) | null = null;
  private onCancel: ((t: SparkType) => void) | null = null;

  constructor(app: Application, parent: Container = app.stage) {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.label = 'footerBand'; // S153 P4 — see SparkRenderer for why layers are named.
    this.container.addChild(this.graphics);
    parent.addChild(this.container);
  }

  /**
   * S153 P4 (owner R81) — *"everything clickable should pop out, be highlighted and/or make a
   * sound"*.
   *
   * ⭐ FED FROM THE CLICK PATH'S OWN PREDICATES, never a parallel hit test. `controls.ts` already
   * calls `chipAt`/`cardAt` on every pointermove to decide the cursor; this stores what those
   * returned. A second, independently-written hover test is how a highlight ends up on a control
   * that a click would miss — the exact failure the cursor work in S152 A5 called out and avoided.
   */
  setHover(x: number, y: number): void {
    this.hoverChip = this.chipAt(x, y);
    this.hoverCard = this.cardAt(x, y);
    // S154 P1 — the strip lights up on the same predicates its click path uses, for the reason
    // above: a highlight computed a second way is a highlight that can land on a control a click
    // would miss.
    this.hoverPalette = this.paletteAt(x, y);
    this.hoverQueue = this.queueChipAt(x, y);
    this.hoverRa = this.isOverRaButton(x, y);
  }

  /** Pointer is DOWN. Drives the pressed look; cleared on release wherever it happens. */
  setPressed(down: boolean): void {
    this.pressed = down;
  }

  /** Clear + redraw the bar. Visible only while a match is being played. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    this.chips = [];
    this.strip = { palette: [], queue: [] };
    this.carry = null;
    this.ra = null;
    if (this.raLabel !== null) this.raLabel.visible = false;

    /*
     * ⭐ S188 P6 — POWER OF RA: the seat's state, read ONCE through the reducer's own predicate.
     * An aim left over from a cast that is no longer legal (the fight ended, the seat was benched)
     * is dropped here, so the button never says AIMING over a refusal and the next board click is
     * not swallowed by a dead gesture. The aim is this client's view state (`raAimPreview.ts`).
     */
    const raHeld = seatHasPowerOfRa(world.players.get(world.localPlayerId));
    const raRefusal = raHeld ? raCastRefusal(world, world.localPlayerId) : null;
    if (raAimPreview() !== null && (!raHeld || raRefusal !== null)) setRaAimPreview(null);

    if (world.gameState !== 'PLAYING') {
      this.hideLabelsFrom(0);
      return;
    }

    /*
     * ⭐⭐ S187 — COLLAPSED: draw the tab and nothing else, then stop.
     *
     * ⛔ The early return is what makes it real. `this.chips`, `this.strip` and `this.carry` were
     * cleared at the top of `sync`, so every hit-test that reads them is already empty for this
     * frame — the band cannot swallow a click it did not draw. Hiding the band by alpha instead
     * would have left all three populated, which is the invisible-but-clickable defect this file
     * records shipping twice.
     */
    this.drawCollapseTab(g);
    if (this.collapsed) {
      // ⭐ S188 P6 — the skill survives the collapse, as a compact sun beside the tab.
      if (raHeld) this.drawRaButton(g, layoutRaButton([], true)!, raRefusal);
      this.hideLabelsFrom(0);
      return;
    }

    const model = footerBandModel(world);
    this.chips = layoutChips(model);
    // ⭐ S188 P6 — the skill button, left of the chip row (see `RA_BUTTON_W`).
    const raGeom = raHeld ? layoutRaButton(this.chips, false) : null;
    if (raGeom !== null) this.drawRaButton(g, raGeom, raRefusal);

    for (let i = 0; i < this.chips.length; i++) {
      const c = this.chips[i];
      const isSel = this.selected === c.complexity;
      const tint = !c.enabled ? TINT_DISABLED : isSel ? TINT_SELECTED : TINT_ENABLED;

      /*
       * R81 — HOVER LIFTS, PRESS SINKS. A hovered chip grows by HOVER_GROW on every side and
       * brightens its plate; pressing it puts that back, so the chip visibly takes the click.
       *
       * ⚠ A DISABLED CHIP STILL RESPONDS TO HOVER, deliberately. The standing contract in this
       * codebase is that a refused control must SAY why rather than read as absent (the castle
       * panel's rule, carried into the FEED row in S152). A dead chip that also ignores the mouse
       * reads as "not a control at all", which is the ambiguity the owner actually complained of.
       */
      const hot = this.hoverChip === c.complexity;
      const grow = hot ? (this.pressed ? -1 : HOVER_GROW) : 0;
      const plate = hot ? (this.pressed ? 0x161d29 : 0x131b27) : 0x0b0f16;
      g.roundRect(c.x - grow, c.y - grow, c.w + grow * 2, c.h + grow * 2, 8)
        .fill({ color: plate, alpha: hot ? 0.95 : 0.82 });
      g.roundRect(c.x - grow, c.y - grow, c.w + grow * 2, c.h + grow * 2, 8)
        .stroke({ width: isSel ? 3 : hot ? 3 : 2, color: tint, alpha: 0.95 });

      const label = this.labelAt(i);
      label.text = String(c.complexity);
      label.style.fill = tint;
      label.position.set(c.x + c.w / 2, c.y + c.h / 2);
      label.visible = true;
    }
    /*
     * ⭐ S154 P1 (owner R80) — THE SHAPE STRIP, right of the last tier chip, EVERY frame of a live
     * match. This is the half the owner asked for three times: S153 P5a fixed the enqueue path
     * underneath it, but the controls themselves still only existed inside the castle panel, so
     * the queue was invisible unless you opened the castle — a separate defect from the one that
     * was fixed, and the one R80 is actually about.
     *
     * Laid out from THIS frame's chips (never a cached origin) so a sixth recipe complexity moves
     * the strip instead of drawing it through the new chip. ⚠ S169: this used to say "the
     * `legendAnchor` discipline, applied on the other side of the row" — that helper is gone with
     * the six-shape key (owner R153), and the discipline it named now lives only here.
     */
    const orders = world.gathererOrders.get(world.localPlayerId) ?? [];
    this.strip = shapeStripLayout(this.chips, orders);

    // THE PALETTE. Every button is always enabled: queueing costs nothing and is allowed even
    // while benched (BENCH_INTENT_POLICY), so there is no disabled state to explain here.
    for (const b of this.strip.palette) {
      const hot = this.hoverPalette === b.type;
      const grow = hot ? (this.pressed ? -1 : HOVER_GROW) : 0;
      g.roundRect(b.x - grow, b.y - grow, b.w + grow * 2, b.h + grow * 2, 6).fill({
        color: hot ? (this.pressed ? 0x1a4f83 : 0x1f5f9e) : 0x14283c,
        alpha: 0.95,
      });
      g.roundRect(b.x - grow, b.y - grow, b.w + grow * 2, b.h + grow * 2, 6).stroke({
        width: hot ? 2 : 1.5,
        color: hot ? TINT_ENABLED : 0x2a3a4a,
        alpha: 0.85,
      });
      // The SAME glyph the board and the castle bank draw, so one shape cannot read two ways.
      /*
       * ⭐⭐ S169 (owner R153) — TINTED BY THE RACE THAT OWNS THE SHAPE. This is the half of his
       * ruling that REPLACES what the removed key used to say: he did not ask for the colours to be
       * deleted, he asked for them to move somewhere logical — *"make the shapes on the right side
       * (where the queue menue is) colored with those colors (showing the races that own them)."*
       *
       * ⚠ NO STATE IS LOST BY OVERRIDING `TINT_ENABLED` HERE. The comment above records that every
       * palette button is ALWAYS enabled (queueing costs nothing, even benched), so this tint was
       * carrying no information; hover and press live in the plate fill and stroke, untouched.
       */
      drawSparkGlyph(g, b.x + b.w / 2, b.y + b.h / 2, 9, b.type, raceColorForShape(b.type) ?? TINT_ENABLED);
    }

    // THE QUEUE. Coalesced to one chip per type with an ×N badge (owner ruling B4), in
    // FIRST-APPEARANCE order so the leftmost chip really is what gets fetched next.
    const badgeBase = this.chips.length;
    for (let i = 0; i < this.strip.queue.length; i++) {
      const c = this.strip.queue[i];
      const hot = this.hoverQueue === c.type;
      const grow = hot ? (this.pressed ? -1 : HOVER_GROW) : 0;
      g.roundRect(c.x - grow, c.y - grow, c.w + grow * 2, c.h + grow * 2, 6).fill({
        color: hot ? 0x7a2c2c : c.next ? 0x1b4a76 : 0x14283c,
        alpha: 0.95,
      });
      g.roundRect(c.x - grow, c.y - grow, c.w + grow * 2, c.h + grow * 2, 6).stroke({
        width: c.next ? 2 : 1,
        color: hot ? 0xd46a6a : TINT_ENABLED,
        alpha: c.next ? 0.95 : 0.6,
      });
      // S169 R153 — the same race tint as the palette row; `next` and hover still read from the stroke.
      drawSparkGlyph(g, c.x + c.w / 2 - 4, c.y + c.h / 2, 8, c.type, raceColorForShape(c.type) ?? TINT_ENABLED);

      // Only badge a real multiple — "×1" on every chip is noise.
      const badge = this.labelAt(badgeBase + i);
      badge.text = c.count > 1 ? `x${c.count}` : '';
      badge.style.fontSize = 11;
      badge.style.fill = 0xffffff;
      badge.position.set(c.x + c.w - 8, c.y + c.h - 8);
      badge.visible = c.count > 1;
    }
    /*
     * ⚠ THE BADGE BLOCK IS A FIXED RESERVATION, not a running index, and that is load-bearing.
     * The card labels below are indexed from `STRIP_LABEL_BASE`, so if this block grew and shrank
     * with the queue length every card label would shift sideways whenever a chip appeared — and a
     * label that changes owner mid-frame keeps the previous owner's font size. `hideLabelsFrom`
     * only clears the TAIL, so the slots inside the reservation that no chip is using must be
     * hidden here by hand.
     */
    for (let i = this.strip.queue.length; i < STRIP_MAX_CHIPS; i++) {
      this.labelAt(badgeBase + i).visible = false;
    }

    /*
     * ⭐⭐ S182 ITEM 3 (owner) — **WHAT THE CARRIED TOWER WILL COST**, drawn only while one is in
     * hand. See the `CARRY_WORD_W` block above for where it sits and why it may not sit anywhere
     * else.
     *
     * ⛔ IT PARTICIPATES IN THE LAYOUT RATHER THAN DRAWING AT AN ABSOLUTE POSITION, and S181
     * shipped two bugs of exactly the opposite shape (a block that drew but never advanced the
     * layout cursor, and one that drew straight over an existing row). Concretely, here that means:
     *   · the x origin is `layoutCarryBill(this.chips, …)` — THIS frame's chip row, not a constant,
     *     so a sixth complexity moves the readout instead of drawing it through the new chip;
     *   · the y is the chip row's own midline, so it cannot land on a row it does not know about;
     *   · the labels take a FIXED reservation (`CARRY_LABELS`) between the strip badges and the
     *     card labels, and `cardLabelBase` counts from it — so the cards' labels shift with this
     *     block by construction instead of being overwritten by it. `footerBand.test.ts` asserts
     *     the block clears the chips, the strip and both bottom porches.
     *
     * ⛔⛔ AND THE PLATE **SWALLOWS THE CLICK** — it is registered in `isOverChip` via
     * `isOverCarryBill`. The first cut of this block did NOT, on the argument that *"swallowing here
     * would make this readout the one thing you cannot place a tower on top of"*. That argument was
     * wrong (the chips and the strip are already exactly that) and the omission was a live bug: the
     * plate is opaque and drawn above the ghost, so a click on it planted a tower on board the
     * player could not see. See `isOverCarryBill` for the full account.
     */
    const carryBase = this.carryLabelBase();
    const carryRow = this.armed === null ? null : structureRowFor(world, this.armed);
    // ⭐ S188 P6 — left of the Ra button when it is drawn, so the readout never lands on it.
    const carry = carryRow === null ? null : layoutCarryBill(this.chips, carryRow.bill.length, raGeom?.x);
    this.carry = carry;
    if (carry !== null && carryRow !== null) {
      const plateX = carry.left - CARRY_PLATE_PAD;
      const plateW = carry.right - carry.left + CARRY_PLATE_PAD * 2;
      g.roundRect(plateX, carry.y - CHIP_H / 2, plateW, CHIP_H, 8)
        .fill({ color: 0x0b0f16, alpha: 0.72 });
      g.roundRect(plateX, carry.y - CHIP_H / 2, plateW, CHIP_H, 8)
        .stroke({ width: 2, color: TINT_SELECTED, alpha: 0.75 });

      const word = this.labelAt(carryBase);
      word.text = 'COST';
      word.style.fontSize = 13;
      word.style.fill = TINT_SELECTED;
      word.position.set(carry.wordX, carry.y);
      word.visible = true;

      for (let k = 0; k < carry.slots.length; k++) {
        const slot = carry.slots[k];
        const line = carryRow.bill[k];
        // The same glyph and the same race tint the palette, the bank strip and the shortfall
        // readout draw, so one shape cannot read two ways across four surfaces.
        drawSparkGlyph(
          g,
          carry.pairsLeft + slot.glyphX,
          carry.y,
          SHORTFALL_GLYPH_R,
          line.type,
          raceColorForShape(line.type) ?? TINT_ENABLED,
        );
        const countLabel = this.labelAt(carryBase + 1 + k);
        countLabel.text = `x${line.need}`;
        countLabel.style.fontSize = 13;
        // ⭐ The COUNT is the cost; the TINT is whether you can pay it. Two facts, one pair — and
        // it is the same green/grey the cards use for affordable/short, so it needs no legend.
        countLabel.style.fill = line.have >= line.need ? TINT_ENABLED : TINT_DISABLED;
        countLabel.position.set(carry.pairsLeft + slot.countX, carry.y);
        countLabel.visible = true;
      }
      for (let k = carry.slots.length; k < SHORTFALL_MAX_SHAPES; k++) {
        this.labelAt(carryBase + 1 + k).visible = false;
      }
    } else {
      // The fixed reservation is cleared by hand — `hideLabelsFrom` only clears the TAIL, and the
      // card labels live after this block. Same discipline as the badge block above.
      for (let k = 0; k < CARRY_LABELS; k++) this.labelAt(carryBase + k).visible = false;
    }

    // ⭐ S149 P5 — THE OPEN MENU. Drawn above the bar, so a chip press has a visible consequence.
    this.cards = [];
    if (this.selected !== null) {
      const chip = this.chips.find((c) => c.complexity === this.selected);
      if (chip !== undefined) {
        this.cards = layoutCards(world, this.selected, chip.y);
        for (const card of this.cards) {
          const armedHere = this.armed === card.id;
          const tint = armedHere ? TINT_SELECTED : card.enabled ? TINT_ENABLED : TINT_DISABLED;
          // R81 — the open menu's cards lift and sink exactly like the chips that opened them.
          const hotCard = this.hoverCard === card.id;
          const cg = hotCard ? (this.pressed ? -1 : HOVER_GROW) : 0;
          g.roundRect(card.x - cg, card.y - cg, card.w + cg * 2, card.h + cg * 2, 10)
            .fill({ color: hotCard ? (this.pressed ? 0x161d29 : 0x131b27) : 0x0b0f16, alpha: hotCard ? 0.96 : 0.92 });
          g.roundRect(card.x - cg, card.y - cg, card.w + cg * 2, card.h + cg * 2, 10)
            .stroke({ width: armedHere ? 3 : hotCard ? 3 : 2, color: tint, alpha: 0.95 });

          // ⭐ S149 P6 — DRAW THE TOWER'S SHAPE. Owner: *"it should show the tower shape not only
          // the explanation and name as it did when it was in the castle."* Same `drawBlueprintThumb`
          // the castle tile used, so the two surfaces cannot draw different art for one recipe.
          drawBlueprintThumb(g, card.id, card.x + 30, card.y + card.h / 2, card.h - 12, {
            tint,
            bondAlpha: card.enabled ? 0.9 : 0.45,
          });

          const slotBase = this.cardLabelBase() + this.cards.indexOf(card) * CARD_LABELS;
          const nameLabel = this.labelAt(slotBase);
          nameLabel.text = card.name;
          nameLabel.style.fill = tint;
          nameLabel.style.fontSize = 18;
          nameLabel.position.set(card.x + 34 + (card.w - 34) / 2, card.y + 22);
          nameLabel.visible = true;

          /*
           * ⭐⭐ S173 — THE SUB-LINE NAMES **WHICH** SHAPES, NOT JUST HOW MANY. Owner, playtest:
           *
           *   *"under the tower, it says need five more … But it doesn't say WHAT SHAPES. Some
           *    towers need different types of shapes. It's good to know which you're missing. So you
           *    can either plan ahead … We need the NEED, and then the SYMBOL. Need three more this
           *    and five more this, for example."*
           *
           * So a short card reads `NEED ⟨glyph⟩x3 ⟨glyph⟩x2` instead of `NEED 5 MORE`. The
           * breakdown is not new — `castleStructuresModel` has computed it since S145 for the
           * click-to-order path — it was only ever summed away on the way to the pixels.
           *
           * ⛔ WHY GLYPHS AND NOT WORDS, measured rather than assumed: the widest shortfall in the
           * registry (PRINCESS HELGA — Triangle + Spiral + Circle) spells out as
           * `NEED 3 TRIANGLE 3 SPIRAL 3 CIRCLE`, ~258 px at this label's 13 px monospace, in a card
           * with `CARD_W - 34` = 192 px of room. The same three as glyph pairs are ~120 px.
           *
           * ⚠ A LOCKED CARD STILL FALLS BACK TO THE WORD. `LOCKED` is an input lock, not a
           * shortage, and it has no per-shape form — its `missing` list may be non-empty and would
           * read as a shopping list for something the player is not allowed to buy right now.
           */
          const shortfall =
            card.enabled || card.reason === 'LOCKED' ? [] : shortfallEntries(card.missing);
          const row = shortfallRowLayout(shortfall, { glyphR: SHORTFALL_GLYPH_R });

          const subLabel = this.labelAt(slotBase + 1);
          // A disabled card must SAY why — the castle panel's standing contract, carried over.
          subLabel.text = card.enabled
            ? 'READY — click, then place'
            : shortfall.length > 0
              ? 'NEED'
              : card.reason;
          subLabel.style.fill = card.enabled ? TINT_ENABLED : TINT_DISABLED;
          subLabel.style.fontSize = 13;
          subLabel.visible = true;

          // The whole readout — the word plus the pairs — is centred as ONE block, so a two-shape
          // card and a one-shape card both sit under the middle of the tower name rather than
          // drifting right as shapes are paid off.
          const subY = card.y + 44;
          const rowW = row.width === 0 ? 0 : SHORTFALL_PREFIX_GAP + row.width;
          const blockLeft = card.x + 34 + (card.w - 34) / 2 - (subLabel.width + rowW) / 2;
          subLabel.position.set(blockLeft + subLabel.width / 2, subY);

          const pairsLeft = blockLeft + subLabel.width + SHORTFALL_PREFIX_GAP;
          for (let k = 0; k < row.slots.length; k++) {
            const slot = row.slots[k];
            /*
             * S169 R153's tint, and it earns its keep harder here than on the palette: the player's
             * NEXT action is to press that same shape in the palette strip, so the mark under this
             * count and the button they are being sent to are the same colour as well as the same
             * glyph.
             */
            drawSparkGlyph(
              g,
              pairsLeft + slot.glyphX,
              subY,
              SHORTFALL_GLYPH_R,
              slot.type,
              raceColorForShape(slot.type) ?? TINT_DISABLED,
            );
            const countLabel = this.labelAt(slotBase + 2 + k);
            countLabel.text = `x${slot.short}`;
            countLabel.style.fill = TINT_DISABLED;
            countLabel.style.fontSize = 13;
            countLabel.position.set(pairsLeft + slot.countX, subY);
            countLabel.visible = true;
          }
          /*
           * ⚠ THE SAME FIXED-RESERVATION DISCIPLINE AS THE BADGE BLOCK ABOVE, and for the same
           * reason: `CARD_LABELS` is a constant stride, so a card whose shortfall shrinks by one
           * paid-off shape does not shift every LATER card's labels sideways (a label that changes
           * owner mid-frame keeps the previous owner's font size). `hideLabelsFrom` only clears the
           * tail, so the unused slots INSIDE this card's reservation are hidden here by hand.
           */
          for (let k = row.slots.length; k < SHORTFALL_MAX_SHAPES; k++) {
            this.labelAt(slotBase + 2 + k).visible = false;
          }
        }
      }
    }
    this.hideLabelsFrom(this.cardLabelBase() + this.cards.length * CARD_LABELS);
  }

  /**
   * Is this canvas point over a CHIP? Consumed by `controls.ts` so a click that presses a chip does
   * not ALSO grab a spark or sever a bond — Pixi's `pointertap` does not suppress the canvas
   * handler.
   *
   * ⚠ CHIPS ONLY, never the whole band. See the file docblock: swallowing the empty stretches would
   * make every world object in the bottom 7.8% of the board unclickable, which is the defect that
   * got the original footer deleted.
   */
  /**
   * ⭐ S187 — paint the tab. Drawn in BOTH states, because collapsed it is the only way back.
   *
   * The chevron points the way the click will move the menu: DOWN while the band is up (click to
   * send it away), UP while it is hidden (click to bring it back). His words were *"very clickable,
   * very understandable, very obvious"*, so it is a filled plate with a bright edge rather than a
   * bare glyph — a lone chevron on the board reads as decoration.
   */
  private drawCollapseTab(g: Graphics): void {
    const r = collapseTabRect(this.collapsed);
    g.roundRect(r.x, r.y, r.w, r.h, 6)
      .fill({ color: 0x0b0f16, alpha: 0.92 })
      .stroke({ color: 0x8fa2c4, width: 1.5, alpha: 0.85 });
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const k = 5;
    // Down while expanded, up while collapsed.
    const dir = this.collapsed ? -1 : 1;
    g.moveTo(cx - 9, cy - k * dir)
      .lineTo(cx, cy + k * dir)
      .lineTo(cx + 9, cy - k * dir)
      .stroke({ color: 0xe8eef8, width: 2.4, alpha: 0.95, join: 'round', cap: 'round' });
  }

  /**
   * ⭐ S188 P6 — paint the POWER OF RA button and store the rectangle the hit-test will use.
   *
   * Lit (sun gold) when a cast is legal, green while AIMING, grey when refused — and a refused
   * button still hovers and still takes the click (with the refused cue), the footer's standing
   * rule for a disabled control. The caption says why; the compact form is glyph-only.
   */
  private drawRaButton(g: Graphics, r: RaButtonGeom, refusal: RaCastRefusal | null): void {
    this.ra = r;
    const aiming = raAimPreview() !== null;
    const enabled = refusal === null;
    const edge = !enabled ? TINT_DISABLED : aiming ? TINT_SELECTED : RA_TINT;
    const grow = this.hoverRa ? (this.pressed ? -1 : HOVER_GROW) : 0;
    const plate = this.hoverRa ? (this.pressed ? 0x161d29 : 0x131b27) : 0x0b0f16;
    g.roundRect(r.x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2, r.compact ? 6 : 8)
      .fill({ color: plate, alpha: this.hoverRa ? 0.95 : 0.88 })
      .stroke({ width: aiming || this.hoverRa ? 3 : 2, color: edge, alpha: 0.95 });

    // The sun: a disc and eight rays. Ra is the sun god, and the column is his light.
    const cx = r.x + r.w / 2;
    const cy = r.compact ? r.y + r.h / 2 : r.y + 16;
    const rad = r.compact ? 4.5 : 7;
    g.circle(cx, cy, rad).fill({ color: edge, alpha: enabled ? 1 : 0.6 });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.moveTo(cx + Math.cos(a) * (rad + 2), cy + Math.sin(a) * (rad + 2))
        .lineTo(cx + Math.cos(a) * (rad + (r.compact ? 4.5 : 6)), cy + Math.sin(a) * (rad + (r.compact ? 4.5 : 6)));
    }
    g.stroke({ color: edge, width: 1.6, alpha: enabled ? 0.95 : 0.6, cap: 'round' });

    if (r.compact) return;
    if (this.raLabel === null) {
      this.raLabel = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 11, fill: RA_TINT } });
      this.raLabel.anchor.set(0.5);
      this.container.addChild(this.raLabel);
    }
    this.raLabel.text = raButtonCaption(refusal, aiming);
    this.raLabel.style.fill = edge;
    this.raLabel.position.set(cx, r.y + r.h - 11);
    this.raLabel.visible = true;
  }

  /**
   * ⭐ S188 P6 — is this point over the POWER OF RA button as drawn this frame? A CONTROL, so it is
   * folded into `isOverChip` (the cursor, the click router) and therefore into `isOverBandSurface`
   * (the commit gates) — in BOTH collapse states, because the compact button is drawn in both.
   */
  isOverRaButton(x: number, y: number): boolean {
    const r = this.ra;
    if (r === null) return false;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /**
   * ⭐ S187 — the tab, live in both states. It is the only way back once collapsed.
   *
   * ⛔⛔ S188 (owner) — **AND IT IS ONE LAYER BELOW ANY OPEN TOWER MENU.**
   *
   * > *"the arrow that takes down the footer it actually reads more important than the tower above
   * > it … I'm clicking on number six. It brings up Lightning Hub. That's right over the down arrow.
   * > What I would do is click on six again. It would bring down the Lightning Hub and then the down
   * > arrow would be active. So it'd be one layer below."*
   *
   * The expanded tab rides the band's top edge (y 976-996) and the menu floats above the band
   * (y 941-1003), both centred — so EVERY tier's menu is drawn over it: a one-card tier covers it
   * whole, a two-card tier (5, 7) leaves only the 10 px seam between the cards. `sync` paints the
   * tab first and the cards after, so the cards are on top, and the hit-test now says the same thing
   * the pixels do: where an open card covers the tab, the point is the CARD's.
   *
   * ⚠ DECIDED HERE, IN THE ONE PREDICATE, rather than by reordering `handleFooterChipClick` — this
   * is what the click router, `isOverChip` (the cursor) and `isOverBandSurface` (the placement
   * refusal) all read, so the three cannot disagree about whose pixel it is. Only while expanded:
   * `this.cards` is not cleared by a collapsed `sync`, and the collapsed tab sits below every card.
   */
  isOverCollapseTab(x: number, y: number): boolean {
    const r = collapseTabRect(this.collapsed);
    if (!(x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) return false;
    return this.collapsed || this.cardAt(x, y) === null;
  }

  /** ⭐ S187 — flip it. Returns the new state so the caller can play a sound or log. */
  toggleCollapsed(): boolean {
    this.collapsed = !this.collapsed;
    return this.collapsed;
  }

  /** ⭐ S187 — for the tests and for any caller that needs to know the band is out of the way. */
  isCollapsed(): boolean {
    return this.collapsed;
  }

  isOverChip(x: number, y: number): boolean {
    // ⭐ S188 P6 — the Ra button, in both states (null whenever it was not drawn this frame).
    if (this.isOverRaButton(x, y)) return true;
    // ⛔ S187 — COLLAPSED, THE ONLY CONTROL LEFT IS THE TAB. Returning the chips here would keep the
    // cursor promising `pointer` over a menu that is not drawn, and `handleFooterChipClick` would
    // open a panel from an invisible button.
    if (this.collapsed) return this.isOverCollapseTab(x, y);
    return (
      this.chipAt(x, y) !== null ||
      this.cardAt(x, y) !== null ||
      this.isOverShapeStrip(x, y) ||
      this.isOverCollapseTab(x, y)
    );
  }

  /**
   * ⭐⭐ S182 — **DOES THE BAND COVER THIS PIXEL?** A strictly wider question than `isOverChip`,
   * and the two must not be confused — confusing them is how the carry readout shipped broken
   * TWICE in one session.
   *
   * ⛔ `isOverChip` answers *"is there a CONTROL here"*. It drives the hover cursor and
   * `handleFooterChipClick`, and it must stay narrow: the cursor may only promise `pointer` where a
   * click actually does something, and the empty stretches of the band must stay live board.
   *
   * ⛔ THIS answers *"does the band draw OPAQUE PIXELS here"* — the question every COMMIT gate is
   * really asking. The carry readout's plate is `0x0b0f16` at alpha 0.72 with the band brought to
   * the front, so it hides the board and the blueprint ghost; nothing may be planted underneath it.
   * But it is a READOUT, not a control — clicking it does nothing — so a pointer cursor over it
   * would be a lie.
   *
   * ⭐ THE CHARACTER CARD ALREADY ESTABLISHED THIS SPLIT, and naming it matters because the first
   * two attempts at this fix both ignored it. `controls.ts` guards its commit gates with
   * `isPointerOverCard()` (the WHOLE card) while the hover cursor asks only `isOverAnyAction` and
   * `ownedRowAt` (its CONTROLS) — the card's body swallows a click without claiming to be
   * clickable. The plate is the same kind of surface and gets the same treatment.
   *
   * ⛔⛔ **S187 — THE COLLAPSE IS HONOURED HERE TOO, AND THIS IS THE HALF THAT MATTERS.** Teaching
   * only `isOverChip` would hide the menu and still refuse every placement underneath it: the band
   * would swallow clicks while INVISIBLE, which is this file's own twice-shipped defect wearing a
   * new hat. Giving the owner's brother the bottom band means releasing THIS surface; the cursor is
   * the cosmetic half. The tab itself stays opaque in both states, so nothing can be planted under
   * the one control that brings the menu back.
   */
  isOverBandSurface(x: number, y: number): boolean {
    if (this.isOverRaButton(x, y)) return true; // S188 P6 — opaque in both states
    if (this.collapsed) return this.isOverCollapseTab(x, y); // S187 — see the docblock above
    return this.isOverChip(x, y) || this.isOverCarryBill(x, y);
  }

  /**
   * ⭐⭐ S182 — IS THIS POINT OVER THE CARRY READOUT'S PLATE?
   *
   * ⛔⛔ IT EXISTS BECAUSE ITEM 3 SHIPPED THE S181 DEFECT AGAIN, IN MY OWN WORK, AND AN ADVERSARIAL
   * REVIEW OF THIS BRANCH CAUGHT IT BEFORE THE OWNER DID.
   *
   * The plate is `0x0b0f16` at alpha 0.72 with a 2 px stroke, and `bringToFront()` puts the band
   * above the board AND above `BlueprintGhost` — so you cannot see through it. It is drawn ONLY
   * while a tower is armed, i.e. only during the exact gesture it corrupts. Item 1 then made the
   * band's own y legal for a flat recipe (voltkin's box is ±12 px tall, so `box.maxY` clears
   * `CANVAS_HEIGHT − EDGE_PAD`), so a click dead centre of the plate passed every guard —
   * `chipAt`/`cardAt`/`isOverShapeStrip` all miss it, and `isPointerOverCard` is false — and
   * `canStampAt` said YES. The tower planted under its own cost readout.
   *
   * ⚠ THE COMMENT THAT STOOD HERE ARGUED THE OMISSION WAS DELIBERATE — *"swallowing here would make
   * this readout the one thing you cannot place a tower on top of"* — and it was simply WRONG: the
   * chips and the shape strip are already exactly that, and have been since S149 and S154. A
   * surface you cannot see through must swallow the click. Recording the bad argument next to the
   * fix, because it is the kind that survives review.
   *
   * ⛔⛔ AND THE FIRST FIX FOR IT WAS ALSO WRONG, WHICH IS THE HALF WORTH RECORDING. Folding this
   * into `isOverChip` looked right — one predicate, four call sites, nothing to thread — and it did
   * NOT reach the gate that refuses the placement. `controls.ts` guards the footer by CONSUMPTION:
   * `handleFooterChipClick` tests `isOverChip` and then returns true only when a chip or a strip
   * control was actually pressed. The plate is neither, so it returned FALSE and the click fell
   * straight through to the armed-stamp arm — the bug intact, with a green tripwire sitting on top
   * of it. The same fold-in also made the hover cursor advertise the plate as clickable, which is
   * the precise lie `s182UiSurfaceGuards.test.ts` exists to catch.
   *
   * ⭐ SO IT IS REACHED THROUGH `isOverBandSurface`, and the COMMIT gates ask that — including the
   * armed-stamp arm, which is the gate that actually refuses this placement and which neither
   * earlier attempt touched.
   */
  isOverCarryBill(x: number, y: number): boolean {
    const c = this.carry;
    if (c === null) return false;
    return x >= c.left - CARRY_PLATE_PAD && x <= c.right + CARRY_PLATE_PAD
      && y >= c.y - CHIP_H / 2 && y <= c.y + CHIP_H / 2;
  }

  /**
   * ⭐ S154 P1 — is this point over the SHAPE STRIP (a palette button or a queue chip)?
   *
   * ⛔ AND IT IS DELIBERATELY FOLDED INTO `isOverChip` ABOVE RATHER THAN GUARDED SEPARATELY.
   *
   * `controls.ts` consults `isOverChip` (via `isPointerOverFooterChip`) at FOUR independent places:
   * the pointer-down router, the R81 hover/cursor path, the potato plant, and — the one that
   * matters — the commit gate at the `PLACE_FROM_FREE` site, `if (gates.commit &&
   * !this.isPointerOverPanel() && !this.isPointerOverFooterChip())`. A new, separately-named guard
   * would have had to be threaded into all four, and the failure mode of missing the last one is
   * exactly the defect this priority exists to avoid: pressing a palette button ALSO plants the
   * carried spark on the board underneath it. Folding it into the predicate every site already
   * calls makes that impossible to get wrong, which is worth more than a precise method name.
   *
   * The band's other standing rule is untouched: this covers the strip's RECTANGLES only, never the
   * empty stretches of the band, so the bottom 7.8% of the board stays clickable.
   */
  isOverShapeStrip(x: number, y: number): boolean {
    return this.paletteAt(x, y) !== null || this.queueChipAt(x, y) !== null;
  }

  /** The palette shape under this point, or null. */
  paletteAt(x: number, y: number): SparkType | null {
    for (const b of this.strip.palette) {
      if (hitStripRect(b, x, y)) return b.type;
    }
    return null;
  }

  /** The queued shape under this point, or null. */
  queueChipAt(x: number, y: number): SparkType | null {
    for (const c of this.strip.queue) {
      if (hitStripRect(c, x, y)) return c.type;
    }
    return null;
  }

  /**
   * ⭐ S154 P1 — press the strip: queue a shape, or cancel one. Returns true when consumed.
   *
   * The hit-test and the ACTION live in one function on purpose. Two call sites — one asking "is it
   * over the strip?" and another asking "what is under it?" — is how a guard and an action end up
   * disagreeing about the same pixel.
   *
   * ⚠ THE PALETTE IS CHECKED FIRST, and the rows cannot overlap (see `stripRowTops`), so the order
   * is a formality rather than a tie-break. It is fixed anyway, because a tie-break that depends on
   * iteration order is a bug waiting for someone to change the layout.
   */
  pressShapeStrip(x: number, y: number): boolean {
    const add = this.paletteAt(x, y);
    if (add !== null) {
      this.onEnqueue?.(add);
      return true;
    }
    const drop = this.queueChipAt(x, y);
    if (drop !== null) {
      this.onCancel?.(drop);
      return true;
    }
    return false;
  }

  /**
   * S154 P1 — main.ts injects the ENQUEUE/CANCEL_GATHERER_ORDER dispatches for the local seat.
   * MOVED here from `CastlePanel.setOrderHandlers` with R80; the dispatches themselves are
   * unchanged, so this costs no new action and no protocol bump.
   */
  setOrderHandlers(enqueue: (t: SparkType) => void, cancel: (t: SparkType) => void): void {
    this.onEnqueue = enqueue;
    this.onCancel = cancel;
  }

  /**
   * Where the tower-card labels start in the pooled-label array: after the chip labels AND after
   * the fixed shape-strip badge reservation. See the note at the badge loop for why the strip's
   * block is a fixed size rather than the live queue length.
   */
  private cardLabelBase(): number {
    return this.carryLabelBase() + CARRY_LABELS;
  }

  /**
   * S182 — where the CARRY readout's labels start: after the chips and the strip's badge
   * reservation, before the cards'. A fixed block for the reason the badge block states — a
   * reservation that grew and shrank with the bill would shift every card label sideways.
   */
  private carryLabelBase(): number {
    return this.chips.length + STRIP_MAX_CHIPS;
  }

  /** The tower card under this point, or null. */
  cardAt(x: number, y: number): GodlyId | null {
    // ⛔ S149 P6 — EVERY CARD IS CLICKABLE, AFFORDABLE OR NOT. The first cut filtered on
    // `c.enabled`, and since the bank opens EMPTY that made every card inert — which is exactly
    // what the owner reported twice ("it isnt really clickable"). It also silently destroyed the
    // mechanic they then named: *"before when it was in castle you could click on the towers you
    // want built and it already give the priority shapes to the gatherer"*. In the castle a SHORT
    // tile was actionable — it ORDERED its missing shapes. That behaviour is the reason an
    // unaffordable card must still take the click.
    for (const c of this.cards) {
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c.id;
    }
    return null;
  }

  /** Is this card affordable right now? Decides ARM vs ORDER-THE-SHAPES at the click site. */
  cardEnabled(id: GodlyId): boolean {
    return this.cards.find((c) => c.id === id)?.enabled ?? false;
  }

  /** main.ts mirrors the armed tower here so the open card can show it as held. */
  setArmed(id: GodlyId | null): void {
    this.armed = id;
  }

  /** The complexity under this point, or null. */
  chipAt(x: number, y: number): number | null {
    for (const c of this.chips) {
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c.complexity;
    }
    return null;
  }

  /** Toggle the opened complexity. Returns the new selection. */
  select(complexity: number | null): number | null {
    this.selected = this.selected === complexity ? null : complexity;
    return this.selected;
  }

  selection(): number | null {
    return this.selected;
  }

  /** S85 P4c geometry-getter convention — live click geometry for the e2e harness. */
  getUiPoints(): {
    chips: FooterChipGeom[];
    cards: FooterCardGeom[];
    selected: number | null;
    /** S154 P1 — the shape strip, so an e2e can click it WITHOUT opening the castle (R80's point). */
    palette: PaletteButtonGeom[];
    queue: QueueChipGeom[];
    /** ⭐ S188 P6 — the POWER OF RA button as drawn this frame, or null. */
    ra: RaButtonGeom | null;
  } {
    return {
      chips: [...this.chips],
      cards: [...this.cards],
      selected: this.selected,
      palette: [...this.strip.palette],
      queue: [...this.strip.queue],
      ra: this.ra,
    };
  }

  /**
   * ⛔ S149 P5 FIX — PUT THE BAR BACK ON TOP.
   *
   * Owner: *"it is hidden behind the fog"*. The band is constructed at main.ts:537 and `FogRenderer`
   * at :614, so the fog's container landed LATER in `app.stage.children` and drew straight over the
   * bar. `addChild` on an existing child MOVES it to the end, so calling this once after every
   * stage-level renderer exists puts the UI where UI belongs — above the board and above the fog.
   */
  bringToFront(): void {
    const parent = this.container.parent;
    if (parent !== null) parent.addChild(this.container);
  }

  clear(): void {
    this.graphics.clear();
    this.chips = [];
    this.cards = [];
    this.carry = null;
    this.ra = null;
    if (this.raLabel !== null) this.raLabel.visible = false;
    this.armed = null;
    this.selected = null;
    this.hideLabelsFrom(0);
  }

  destroy(): void {
    for (const l of this.labels) l.destroy();
    this.raLabel?.destroy();
    this.graphics.destroy();
    this.container.destroy();
  }

  private labelAt(i: number): Text {
    while (this.labels.length <= i) {
      const t = new Text({
        text: '',
        style: { fontFamily: 'monospace', fontSize: 24, fill: TINT_ENABLED },
      });
      t.anchor.set(0.5);
      this.container.addChild(t);
      this.labels.push(t);
    }
    return this.labels[i];
  }

  private hideLabelsFrom(i: number): void {
    for (let k = i; k < this.labels.length; k++) this.labels[k].visible = false;
  }
}

/**
 * PURE — chip rectangles for `model`, centred on the board.
 *
 * Exported so the clearance from the corner porches can be asserted headlessly, without Pixi.
 */
/**
 * PURE — the tower cards for an opened complexity, laid out in a row ABOVE the band.
 *
 * ⭐ S149 P5 — THIS IS THE HALF THAT WAS MISSING, and its absence is what the owner reported as
 * *"it isnt clickable"*: P4 shipped chips that toggled a selection and opened nothing, so pressing
 * one looked like a dead control. Rows come from `structuresAtComplexity`, i.e. the same
 * `castleStructuresModel` the reducer's affordability agrees with — the menu cannot offer a tower
 * the build would refuse.
 */
export function layoutCards(
  world: World,
  complexity: number,
  chipTop: number,
): FooterCardGeom[] {
  const rows = structuresAtComplexity(world, complexity);
  if (rows.length === 0) return [];
  const totalW = rows.length * CARD_W + (rows.length - 1) * CARD_GAP;
  const left = (CANVAS_WIDTH - totalW) / 2;
  const top = chipTop - MENU_BOTTOM_GAP - CARD_H;
  return rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    reason: r.reason,
    // S173 — carried, never re-derived. The card's "WHAT SHAPES" readout must be the same shortfall
    // `planBlueprintPayment` refused the build over, not a second count that could drift from it.
    missing: r.missing,
    enabled: r.enabled,
    x: left + i * (CARD_W + CARD_GAP),
    y: top,
    w: CARD_W,
    h: CARD_H,
  }));
}

/** Where the carry readout's parts sit this frame. Row-relative pair positions, canvas x/y origin. */
export interface CarryBillGeom {
  /** Centre of the word `COST`. */
  readonly wordX: number;
  /** Row midline — the chip row's own, so the readout sits on the line the band already reads on. */
  readonly y: number;
  /** Canvas x that `slots`' row-relative positions are added to. */
  readonly pairsLeft: number;
  readonly slots: GlyphCountSlot[];
  readonly left: number;
  readonly right: number;
}

/**
 * ⭐ S182 — PURE — lay the carry readout out LEFT of this frame's chip row. `null` when there is
 * nothing to draw (no chips yet, or a bill of no shapes — neither is reachable in a live match, and
 * both are cheaper to answer than to assume away).
 *
 * ⚠ RIGHT-ALIGNED against the chips, so the block grows LEFTWARD as a bill names more shapes. The
 * alternative — a fixed left edge — would march the numbers toward the chips and, at three shapes,
 * into them. `glyphCountRowLayout`'s `width` excludes the trailing gap precisely so a caller can
 * subtract it like this.
 */
export function layoutCarryBill(
  chips: readonly FooterChipGeom[],
  shapeCount: number,
  /** ⭐ S188 P6 — the x the readout must stay left of when something (the Ra button) sits there. */
  leftOf?: number,
): CarryBillGeom | null {
  if (chips.length === 0 || shapeCount <= 0) return null;
  const row = glyphCountRowLayout(shapeCount, { glyphR: SHORTFALL_GLYPH_R });
  const right = Math.min(leftOf ?? Infinity, ...chips.map((c) => c.x)) - CARRY_MARGIN;
  const left = right - (CARRY_WORD_W + SHORTFALL_PREFIX_GAP + row.width);
  return {
    wordX: left + CARRY_WORD_W / 2,
    y: CHIP_CY,
    pairsLeft: left + CARRY_WORD_W + SHORTFALL_PREFIX_GAP,
    slots: row.slots,
    left,
    right,
  };
}

export function layoutChips(model: readonly FooterComplexity[]): FooterChipGeom[] {
  const n = model.length;
  if (n === 0) return [];
  const totalW = n * CHIP_W + (n - 1) * CHIP_GAP;
  const left = (CANVAS_WIDTH - totalW) / 2;
  const top = CHIP_CY - CHIP_H / 2;
  return model.map((m, i) => ({
    complexity: m.complexity,
    x: left + i * (CHIP_W + CHIP_GAP),
    y: top,
    w: CHIP_W,
    h: CHIP_H,
    enabled: m.enabled,
  }));
}
