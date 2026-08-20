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
import { footerBandModel, type FooterComplexity } from './footerBandModel.ts';
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

export interface FooterChipGeom {
  readonly complexity: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly enabled: boolean;
}

export class FooterBand {
  private readonly container: Container;
  private readonly graphics: Graphics;
  private readonly labels: Text[] = [];
  private chips: FooterChipGeom[] = [];
  /** The complexity the player has opened, or null. Render-only selection — never world state. */
  private selected: number | null = null;

  constructor(app: Application, parent: Container = app.stage) {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    parent.addChild(this.container);
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

    for (let i = 0; i < this.chips.length; i++) {
      const c = this.chips[i];
      const isSel = this.selected === c.complexity;
      const tint = !c.enabled ? TINT_DISABLED : isSel ? TINT_SELECTED : TINT_ENABLED;

      g.roundRect(c.x, c.y, c.w, c.h, 8).fill({ color: 0x0b0f16, alpha: 0.82 });
      g.roundRect(c.x, c.y, c.w, c.h, 8).stroke({ width: isSel ? 3 : 2, color: tint, alpha: 0.95 });

      const label = this.labelAt(i);
      label.text = String(c.complexity);
      label.style.fill = tint;
      label.position.set(c.x + c.w / 2, c.y + c.h / 2);
      label.visible = true;
    }
    this.hideLabelsFrom(this.chips.length);
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
    return this.chipAt(x, y) !== null;
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
  getUiPoints(): { chips: FooterChipGeom[]; selected: number | null } {
    return { chips: [...this.chips], selected: this.selected };
  }

  clear(): void {
    this.graphics.clear();
    this.chips = [];
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
