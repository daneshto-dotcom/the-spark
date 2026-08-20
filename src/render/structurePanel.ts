/**
 * SPARK — S152: **THE FIX / SCRAP AFFORDANCE (R13).**
 *
 * *"there should be a fix and scrap button on actual towers that you've built"* — owner playtest.
 *
 * ## ⭐ WHY THIS IS A SELECTED-TOWER POPOVER AND NOT A CASTLE-PANEL ROW
 *
 * The obvious home was a row in the castle panel — that is where every other player control started
 * out. It is the wrong home now, for a reason this very session established: the owner ruled *"the
 * castle is just to hold the shapes (inventory)"* and the tower BUILD grid was moved out of the
 * panel into the footer band. So the castle answers "what do I have?" and the footer answers "what
 * can I make?" — neither answers "what about THAT one over there".
 *
 * And FIX / SCRAP genuinely need the third question. They act on ONE structure among several
 * identical ones, and the player has to be able to say WHICH. A castle row would need its own list
 * of your towers, its own naming for two stink towers, and its own way to show you which is which —
 * a whole selection UI, invented to avoid the selection UI. Clicking the thing itself is both
 * cheaper and the RTS convention: select the object, act on the object.
 *
 * ## SELECTION IS RENDER-ONLY STATE
 *
 * `selected` never enters `world`, exactly as the footer band's open complexity never does. That is
 * not a shortcut — it is what keeps this feature off the hash, out of the save format and off the
 * wire. Two players may have different towers selected at the same instant and the sim does not
 * care, because the only thing that crosses into the sim is the INTENT, which names its primitive.
 *
 * ## THE CAPTIONS COME FROM THE REDUCER'S OWN PLANNERS
 *
 * `planStructureRepair` / `planStructureScrap` are the same functions `applyRepairStructure` and
 * `applyScrapStructure` consult. A button that says "FIX · 2 SHAPES" and a reducer that refuses is
 * the exact defect that sharing exists to prevent — the `castleStructuresModel` lesson, one panel
 * over. Nothing here re-derives affordability.
 *
 * RENDER-ONLY: reads `world`, never mutates it.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, type SparkType } from '../constants.ts';
import { codexCopyFor } from './codexPresentation.ts';
import { availableShapeCounts } from '../state/blueprintBuild.ts';
import { planStructureRepair, planStructureScrap } from '../state/structureRepair.ts';
import type { PlayerId, PrimitiveId, Vec2 } from '../types.ts';
import type { World } from '../state/world.ts';

/** Button box size — wide enough for "NEED 3 MORE" at 13 px without wrapping. */
const BTN_W = 138;
const BTN_H = 46;
const BTN_GAP = 10;
/** How far above the structure's top edge the popover floats. */
const LIFT = 30;
/** Keeps the popover fully on-canvas when a tower is built hard against an edge. */
const EDGE_MARGIN = 8;

const TINT_ENABLED = 0xffd27a;
const TINT_DISABLED = 0x93a0b4;
const TINT_SCRAP = 0xff9b7a;

export type StructureActionKind = 'FIX' | 'SCRAP';

export interface StructureButtonGeom {
  readonly kind: StructureActionKind;
  /** The big word. */
  readonly label: string;
  /** The small line under it — the cost, the refund, or the reason it is refused. */
  readonly caption: string;
  readonly enabled: boolean;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface StructureActionView {
  readonly primitiveId: PrimitiveId;
  /** The structure's name, or 'STRUCTURE' for something the player bonded together by hand. */
  readonly title: string;
  readonly titlePos: Vec2;
  readonly buttons: readonly StructureButtonGeom[];
}

/**
 * ⭐ PURE — everything the popover shows for the structure at `primitiveId`, or null when there is
 * nothing to show (wrong phase, not this seat's ground, the shape is already rubble).
 *
 * Pixi-free so the whole matrix is unit-testable headlessly — the S130 lesson, and the reason the
 * footer band's layout lives in free functions too.
 *
 * ## The FIX button's three states, and why the third is not "hidden"
 *
 *   • **enabled** — the inventory covers the shortfall (or there is no shortfall and the tower is
 *     merely damaged). Caption names what it will cost.
 *   • **disabled, "NEED n MORE"** — this IS a repairable tower, the seat is just short. The button
 *     stays VISIBLE and says why, which is this codebase's standing contract for a refused control
 *     (`castleStructuresModel`: a disabled tile must SAY why, never read as absent).
 *   • **absent entirely** — `planStructureRepair` returned null: freeform rubble with no blueprint
 *     to restore it to, or two stamps welded into one component. There is no repair to offer, so
 *     offering a greyed one would be a lie about what the game can do.
 *
 * SCRAP has no third state: if you may act on the structure at all, you may tear it down.
 */
export function structureActionModel(
  world: World,
  seat: PlayerId,
  primitiveId: PrimitiveId,
): StructureActionView | null {
  const scrap = planStructureScrap(world, seat, primitiveId);
  if (scrap === null) return null; // wrong seat / wrong phase / gone — no popover at all
  const repair = planStructureRepair(world, seat, primitiveId);

  // Anchor on the structure's own bounding box, not on the clicked shape: clicking a leaf and
  // clicking the hub of the same tower must put the popover in the same place, or the control looks
  // like it moved when only the cursor did.
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const id of scrap.memberIds) {
    const p = world.primitives.get(id);
    if (p === undefined) continue;
    minX = Math.min(minX, p.pos.x - p.radius);
    maxX = Math.max(maxX, p.pos.x + p.radius);
    minY = Math.min(minY, p.pos.y - p.radius);
  }
  if (!Number.isFinite(minX)) return null;

  const buttons: StructureButtonGeom[] = [];
  const count = repair === null ? 1 : 2;
  const totalW = count * BTN_W + (count - 1) * BTN_GAP;
  let left = (minX + maxX) / 2 - totalW / 2;
  left = Math.max(EDGE_MARGIN, Math.min(CANVAS_WIDTH - totalW - EDGE_MARGIN, left));
  // Below the structure instead of above it when there is no room up top, so a tower built against
  // the top wall does not push its own controls off-screen.
  let top = minY - LIFT - BTN_H;
  if (top < EDGE_MARGIN + 18) top = Math.min(CANVAS_HEIGHT - BTN_H - EDGE_MARGIN, minY + LIFT);

  if (repair !== null) {
    const lost = repair.group.missing.length;
    const affordable = repair.payments !== null;
    // Nothing missing, nothing damaged, no bond broken — the tower is whole. The reducer refuses
    // this case (an empty repair would arm the ignition sweep for free), so the button must too.
    const idle = lost === 0 && repair.damagedCount === 0 && repair.missingBondCount === 0;
    const caption = !affordable
      ? `NEED ${shortfallFor(world, seat, repair.cost)} MORE`
      : idle
        ? 'NOTHING TO FIX'
        : lost > 0
          ? `COSTS ${lost}`
          : 'REPAIR FREE'; // damaged but intact — R13 prices FIX at what was LOST, and nothing was
    buttons.push({
      kind: 'FIX',
      label: 'FIX',
      caption,
      enabled: affordable && !idle,
      x: left,
      y: top,
      w: BTN_W,
      h: BTN_H,
    });
  }

  buttons.push({
    kind: 'SCRAP',
    label: 'SCRAP',
    // R21 in one word to the player: this number is the SURVIVORS, so a battered tower hands back
    // less than it cost and the difference is the attrition they actually paid.
    caption: `RETURNS ${scrap.refund.length}`,
    enabled: true,
    x: left + (count === 2 ? BTN_W + BTN_GAP : 0),
    y: top,
    w: BTN_W,
    h: BTN_H,
  });

  const title = repair === null ? 'STRUCTURE' : codexCopyFor(repair.group.blueprintId).name;
  return {
    primitiveId,
    title,
    titlePos: { x: left + totalW / 2, y: top - 13 },
    buttons,
  };
}

/**
 * PURE — how many shapes short the seat is of `cost`.
 *
 * ⚠ EXPLANATORY ONLY. Whether the repair is affordable is decided by `planStructureRepair`'s call
 * into `planPaymentForTypes` — the reducer's own search — and this count never gets a vote. That is
 * the `castleStructuresModel` rule verbatim: `availableShapeCounts` explains a shortfall, it never
 * decides one, because a lookalike count comparison is how a panel and a reducer start disagreeing.
 */
function shortfallFor(world: World, seat: PlayerId, cost: readonly SparkType[]): number {
  const have = availableShapeCounts(world, seat);
  const need = new Map<SparkType, number>();
  for (const t of cost) need.set(t, (need.get(t) ?? 0) + 1);
  let short = 0;
  for (const [type, n] of need) short += Math.max(0, n - (have.get(type) ?? 0));
  return short;
}

/**
 * The popover itself. Constructed in main.ts after the board renderers so it draws above them, and
 * brought to the front alongside the footer band so the fog cannot bury it (the S149 P5 lesson —
 * `addChild` on an existing child MOVES it to the end).
 */
export class StructurePanel {
  private readonly container: Container;
  private readonly graphics: Graphics;
  private readonly labels: Text[] = [];
  private selected: PrimitiveId | null = null;
  private view: StructureActionView | null = null;

  constructor(app: Application, parent: Container = app.stage) {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    parent.addChild(this.container);
  }

  /**
   * Clear + redraw. Re-derives the whole view from `world` every frame ON PURPOSE: the structure it
   * describes can be shot apart, repaired or scrapped between two frames, and a cached view would
   * keep offering a FIX for a tower that no longer exists. When the model returns null the selection
   * DROPS — the popover cannot outlive the thing it acts on.
   */
  sync(world: World, seat: PlayerId): void {
    const g = this.graphics;
    g.clear();
    this.view = null;

    if (world.gameState !== 'PLAYING' || this.selected === null) {
      this.hideLabelsFrom(0);
      return;
    }
    const view = structureActionModel(world, seat, this.selected);
    if (view === null) {
      this.selected = null;
      this.hideLabelsFrom(0);
      return;
    }
    this.view = view;

    const title = this.labelAt(0);
    title.text = view.title;
    title.style.fontSize = 15;
    title.style.fill = TINT_ENABLED;
    title.position.set(view.titlePos.x, view.titlePos.y);
    title.visible = true;

    for (let i = 0; i < view.buttons.length; i++) {
      const b = view.buttons[i];
      const tint = !b.enabled ? TINT_DISABLED : b.kind === 'SCRAP' ? TINT_SCRAP : TINT_ENABLED;
      g.roundRect(b.x, b.y, b.w, b.h, 10).fill({ color: 0x0b0f16, alpha: 0.92 });
      g.roundRect(b.x, b.y, b.w, b.h, 10).stroke({ width: 2, color: tint, alpha: 0.95 });

      const label = this.labelAt(1 + i * 2);
      label.text = b.label;
      label.style.fontSize = 18;
      label.style.fill = tint;
      label.position.set(b.x + b.w / 2, b.y + 16);
      label.visible = true;

      const caption = this.labelAt(2 + i * 2);
      caption.text = b.caption;
      caption.style.fontSize = 13;
      caption.style.fill = tint;
      caption.position.set(b.x + b.w / 2, b.y + 34);
      caption.visible = true;
    }
    this.hideLabelsFrom(1 + view.buttons.length * 2);
  }

  /**
   * Is this canvas point over a BUTTON? Consumed by `controls.ts` as a click guard — this raw canvas
   * handler hit-tests world objects with no notion of UI, so without it pressing SCRAP would ALSO
   * grab a spark or sever a bond underneath. Buttons only, never a whole plate: the S136 lesson that
   * got the original 1920-wide footer deleted is that a UI region which swallows clicks makes the
   * board under it inert.
   */
  isOverButtons(x: number, y: number): boolean {
    return this.buttonAt(x, y) !== null;
  }

  /** The button under this point, or null. Disabled buttons do not answer — they only explain. */
  buttonAt(x: number, y: number): StructureActionKind | null {
    if (this.view === null) return null;
    for (const b of this.view.buttons) {
      if (!b.enabled) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.kind;
    }
    return null;
  }

  /** The structure the popover is currently aimed at. */
  selection(): PrimitiveId | null {
    return this.selected;
  }

  /** Aim the popover, or dismiss it with null. Render-only — nothing reaches `world` from here. */
  select(primitiveId: PrimitiveId | null): void {
    this.selected = primitiveId;
  }

  /** S85 P4c geometry-getter convention — live click geometry for the e2e harness. */
  getUiPoints(): { selected: PrimitiveId | null; buttons: StructureButtonGeom[]; title: string } {
    return {
      selected: this.selected,
      buttons: this.view === null ? [] : [...this.view.buttons],
      title: this.view?.title ?? '',
    };
  }

  /** S149 P5 — UI belongs above the board AND above the fog. See `FooterBand.bringToFront`. */
  bringToFront(): void {
    const parent = this.container.parent;
    if (parent !== null) parent.addChild(this.container);
  }

  clear(): void {
    this.graphics.clear();
    this.selected = null;
    this.view = null;
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
        style: { fontFamily: 'monospace', fontSize: 16, fill: TINT_ENABLED },
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
