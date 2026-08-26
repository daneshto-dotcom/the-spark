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

          const nameLabel = this.labelAt(this.chips.length + this.cards.indexOf(card) * 2);
          nameLabel.text = card.name;
          nameLabel.style.fill = tint;
          nameLabel.style.fontSize = 18;
          nameLabel.position.set(card.x + 34 + (card.w - 34) / 2, card.y + 22);
          nameLabel.visible = true;

          const subLabel = this.labelAt(this.chips.length + this.cards.indexOf(card) * 2 + 1);
          // A disabled card must SAY why — the castle panel's standing contract, carried over.
          subLabel.text = card.enabled ? 'READY — click, then place' : card.reason;
          subLabel.style.fill = card.enabled ? TINT_ENABLED : TINT_DISABLED;
          subLabel.style.fontSize = 13;
          subLabel.position.set(card.x + 34 + (card.w - 34) / 2, card.y + 44);
          subLabel.visible = true;
        }
      }
    }
    this.hideLabelsFrom(this.chips.length + this.cards.length * 2);
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
    return this.chipAt(x, y) !== null || this.cardAt(x, y) !== null;
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
  getUiPoints(): { chips: FooterChipGeom[]; cards: FooterCardGeom[]; selected: number | null } {
    return { chips: [...this.chips], cards: [...this.cards], selected: this.selected };
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
