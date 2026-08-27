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
import { CANVAS_HEIGHT, CANVAS_WIDTH, FOOTER_TOP_Y } from '../constants.ts';
import { footerBandModel, structuresAtComplexity, type FooterComplexity } from './footerBandModel.ts';
import { LEGEND_SPRITE_STEP, LEGEND_WIDTH } from './renderer.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { drawBlueprintThumb } from './blueprintGlyph.ts';
import type { World } from '../state/world.ts';
import type { SparkType } from '../constants.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';
import {
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

export interface FooterCardGeom {
  readonly id: GodlyId;
  readonly name: string;
  readonly reason: string;
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

export class FooterBand {
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
   * S150 P1 — the six-shape type key, handed over by main.ts. The band POSITIONS it (beside the
   * chips, see `legendAnchor`); main.ts keeps owning its VISIBILITY, because the S16 P3.b overlay
   * gate there already hides it on TITLE/LOBBY alongside the spawner ring. Two writers to one
   * `.visible` flag is a race nobody wins, so ownership is split by property, not shared.
   */
  private legend: Container | null = null;
  /**
   * ⭐ S154 P1 (owner R80) — THE SHAPE STRIP: the palette + order queue, laid out right of the last
   * tier chip and drawn on every frame of a live match. Geometry is PURE and lives in
   * `shapeStrip.ts`; this class owns the pixels and the hit-tests, exactly as it already does for
   * the chips. See that file for why the panel's Pixi-per-button controls were REWRITTEN here
   * rather than reparented.
   */
  private strip: { palette: PaletteButtonGeom[]; queue: QueueChipGeom[] } = { palette: [], queue: [] };
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

    if (world.gameState !== 'PLAYING') {
      this.hideLabelsFrom(0);
      return;
    }

    const model = footerBandModel(world);
    this.chips = layoutChips(model);

    // S150 P1 — re-anchor the type key every frame, from THIS frame's chip row. Cheap (two number
    // writes) and it means a registry change can never leave the key sitting on top of a chip.
    if (this.legend !== null) {
      const a = legendAnchor(this.chips);
      this.legend.position.set(a.x, a.y);
    }

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
     * the strip instead of drawing it through the new chip — the `legendAnchor` discipline, applied
     * on the other side of the row.
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
      drawSparkGlyph(g, b.x + b.w / 2, b.y + b.h / 2, 9, b.type, TINT_ENABLED);
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
      drawSparkGlyph(g, c.x + c.w / 2 - 4, c.y + c.h / 2, 8, c.type, TINT_ENABLED);

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

          const nameLabel = this.labelAt(this.cardLabelBase() + this.cards.indexOf(card) * 2);
          nameLabel.text = card.name;
          nameLabel.style.fill = tint;
          nameLabel.style.fontSize = 18;
          nameLabel.position.set(card.x + 34 + (card.w - 34) / 2, card.y + 22);
          nameLabel.visible = true;

          const subLabel = this.labelAt(this.cardLabelBase() + this.cards.indexOf(card) * 2 + 1);
          // A disabled card must SAY why — the castle panel's standing contract, carried over.
          subLabel.text = card.enabled ? 'READY — click, then place' : card.reason;
          subLabel.style.fill = card.enabled ? TINT_ENABLED : TINT_DISABLED;
          subLabel.style.fontSize = 13;
          subLabel.position.set(card.x + 34 + (card.w - 34) / 2, card.y + 44);
          subLabel.visible = true;
        }
      }
    }
    this.hideLabelsFrom(this.cardLabelBase() + this.cards.length * 2);
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
  isOverChip(x: number, y: number): boolean {
    return this.chipAt(x, y) !== null || this.cardAt(x, y) !== null || this.isOverShapeStrip(x, y);
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

  /** S150 P1 — adopt the shape key so the bottom strip lays out as one row. See `legendAnchor`. */
  attachLegend(legend: Container): void {
    this.legend = legend;
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
  } {
    return {
      chips: [...this.chips],
      cards: [...this.cards],
      selected: this.selected,
      palette: [...this.strip.palette],
      queue: [...this.strip.queue],
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
    this.armed = null;
    this.selected = null;
    this.hideLabelsFrom(0);
  }

  destroy(): void {
    for (const l of this.labels) l.destroy();
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
    enabled: r.enabled,
    x: left + i * (CARD_W + CARD_GAP),
    y: top,
    w: CARD_W,
    h: CARD_H,
  }));
}

/**
 * ⭐ S150 P1 — PURE: where the six-shape type key sits, DERIVED from the chip row it sits beside.
 *
 * See `makeLegend` for the defect this closes (the key was drawn inside the leaderboard's row 0).
 * The interesting decision here is that the anchor is derived rather than fixed: a hardcoded x that
 * clears today's five chips would be quietly wrong the day a sixth complexity enters the recipe
 * registry, because `layoutChips` re-centres the whole row and its left edge marches LEFT by
 * (CHIP_W + CHIP_GAP) / 2 = 38 px per tier. That is the same "duplicated geometry drifts" failure
 * `keepCenter` and `layoutChips` already exist to prevent, so the key reads the chips instead of
 * guessing about them.
 *
 * Vertically centred on the chip row, so the whole bottom strip sits on one line. Returns the
 * container origin, i.e. the CENTRE of the first sprite (they are anchored at 0.5).
 */
export function legendAnchor(chips: readonly FooterChipGeom[]): { x: number; y: number } {
  const leftmost = chips.length > 0 ? Math.min(...chips.map((c) => c.x)) : CANVAS_WIDTH / 2;
  return { x: leftmost - LEGEND_GAP - LEGEND_WIDTH + LEGEND_SPRITE_STEP, y: CHIP_CY };
}

/** Breathing room between the type key and the first connector chip. */
const LEGEND_GAP = 34;

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
