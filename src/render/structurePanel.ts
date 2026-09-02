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
import { ALL_SPARK_TYPES, CANVAS_HEIGHT, CANVAS_WIDTH, type SparkType } from '../constants.ts';
import { codexCopyFor } from './codexPresentation.ts';
import { availableShapeCounts } from '../state/blueprintBuild.ts';
import { bankCountOf } from '../state/castleBank.ts';
// ⛔ FROM THE SIDE-EFFECT-FREE LEAF, never from `godlyRecipes/goblinTower.ts` — that module calls
// `registerRecipe` at its tail, and the documented S144 trap is that a value import of a recipe
// module registers every recipe for everything downstream of it. `goblinKinds.ts` exists for this.
import { GOBLIN_FEED_MAP, seatGoblinTowerAt } from '../state/goblinKinds.ts';
import { componentOf } from '../game/structure.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';
import { planStructureRepair, planStructureScrap } from '../state/structureRepair.ts';
import type { PlayerId, PrimitiveId, SpawnerId, Vec2 } from '../types.ts';
import type { World } from '../state/world.ts';

/** Button box size — wide enough for "NEED 3 MORE" at 13 px without wrapping. */
const BTN_W = 138;
const BTN_H = 46;
const BTN_GAP = 10;
/**
 * ⭐ S152 P2 — THE FEED ROW: six small square buttons, one per shape.
 *
 * Deliberately a different SHAPE of control from FIX/SCRAP (44 px squares carrying a glyph and a
 * count, versus 138 px word buttons). They do different kinds of thing: FIX and SCRAP act on the
 * structure, FEED spends inventory to produce a unit. Six more word-buttons in the same row would
 * read as eight equal options, and the row would be 1,180 px wide.
 *
 * The layout is the castle panel's six-slot swatch rhythm (castlePanel.ts:1088) rather than a new
 * idiom — a player already reads shape-glyph-plus-count there.
 */
const FEED_BTN = 44;
const FEED_GAP = 6;
/** Between the FIX/SCRAP row and the FEED row. */
const FEED_ROW_GAP = 8;

/** How far above the structure's top edge the popover floats. */
const LIFT = 30;
/** Keeps the popover fully on-canvas when a tower is built hard against an edge. */
const EDGE_MARGIN = 8;

const TINT_ENABLED = 0xffd27a;
const TINT_DISABLED = 0x93a0b4;
const TINT_SCRAP = 0xff9b7a;
/** S152 P2 — FEED reads as a third kind of act, so it gets its own hue rather than FIX's amber. */
const TINT_FEED = 0x8fe36a;

/**
 * ⭐ SHAPE → GOBLIN, IN SIX CHARACTERS, BECAUSE THE MAPPING IS OTHERWISE UNDISCOVERABLE.
 *
 * The tower's whole mechanic is that WHICH SHAPE YOU FEED IT decides what walks out (owner R70:
 * *"takes one shape to feed to then spawn a goblin of different kinds"*), and nothing on screen
 * told the player that. A bank count would have been the obvious caption and is the less useful
 * one: affordability is ALREADY carried by the button being lit or dimmed, whereas
 * Square → shield goblin cannot be inferred from anything.
 *
 * ⚠ SIX CHARACTERS IS A MEASURED CEILING, NOT A STYLE CHOICE: a 44 px button at fontSize 11 fits
 * about six monospace glyphs. Keyed off `GOBLIN_FEED_MAP` so a change to what a shape produces
 * cannot leave this label describing the old unit.
 */
const GOBLIN_SHORT_NAME: Readonly<Record<string, string>> = {
  goblinSuicide: 'SAPPER',
  goblinArcher: 'ARCHER',
  goblinMelee: 'MELEE',
  goblinShield: 'SHIELD',
  goblinHound: 'HOUND',
  goblinBat: 'BAT',
};

/**
 * ⚠ 'FEED' CARRIES A PAYLOAD AND THE OTHER TWO DO NOT, which is why `buttonAt` can no longer
 * return a bare kind. Six separate literals ('FEED_DOT', 'FEED_LINE', …) was the alternative and
 * it is worse: the shape would then be encoded in a STRING that every consumer has to parse back
 * out, and `GOBLIN_FEED_MAP` is already keyed by `SparkType`.
 */
export type StructureActionKind = 'FIX' | 'SCRAP' | 'FEED';

/** What a click on a button MEANS — the kind, plus the shape when the kind needs one. */
export type StructureAction =
  | { readonly kind: 'FIX' }
  | { readonly kind: 'SCRAP' }
  | { readonly kind: 'FEED'; readonly sparkType: SparkType };

export interface StructureButtonGeom {
  readonly kind: StructureActionKind;
  /** Set on FEED buttons only — which shape this button hands to the tower. */
  readonly sparkType?: SparkType;
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
  /**
   * Set when this structure is the seat's own live goblin tower — the id `FEED_TOWER` needs.
   * Carried on the VIEW rather than re-looked-up at click time so the id a player sees a row for
   * is the id the dispatch uses, with no second search that could resolve differently.
   */
  readonly feedSpawnerId?: SpawnerId;
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
/*
 * S153 P3 — the private `goblinTowerAmong` walker that stood here is GONE, replaced by the shared
 * `seatGoblinTowerAt` in the goblinKinds leaf. The input layer needs the identical answer to decide
 * whether a click may open this popover at all, and two copies of a predicate that must agree is
 * how they stop agreeing.
 */


export function structureActionModel(
  world: World,
  seat: PlayerId,
  primitiveId: PrimitiveId,
): StructureActionView | null {
  /*
   * ⭐ S153 P3 (owner R79) — TWO SHAPES OF POPOVER, SPLIT ON PHASE.
   *
   * In BUILD this is unchanged: FIX + SCRAP (R19) and, on a goblin tower, the FEED row.
   * Outside BUILD it collapses to FEED ALONE. FIX and SCRAP are BUILD-only by R19 and drawing
   * them disabled mid-fight would be noise; FEED was never phase-gated in the reducer at all —
   * `applyFeedTower` has no phase check — it simply had no reachable surface outside BUILD.
   */
  const inBuild = world.matchPhase === 'BUILD';
  const feedSpawnerId = seatGoblinTowerAt(world, seat, primitiveId);
  const scrap = inBuild ? planStructureScrap(world, seat, primitiveId) : null;
  // BUILD needs something scrappable; outside it, only a feedable tower earns a popover.
  if (inBuild && scrap === null) return null; // wrong seat / gone — no popover at all
  if (!inBuild && feedSpawnerId === null) return null;
  const repair = inBuild ? planStructureRepair(world, seat, primitiveId) : null;

  // The component to anchor on. In BUILD that is the scrap plan's member list; outside it the
  // plan was never computed, so walk the component directly.
  const seedPrim = world.primitives.get(primitiveId);
  if (seedPrim === undefined) return null;
  const memberIds: Iterable<PrimitiveId> =
    scrap !== null ? scrap.memberIds : componentOf(seedPrim, world.primitives, world.bonds).primitiveIds;

  // Anchor on the structure's own bounding box, not on the clicked shape: clicking a leaf and
  // clicking the hub of the same tower must put the popover in the same place, or the control looks
  // like it moved when only the cursor did.
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const id of memberIds) {
    const p = world.primitives.get(id);
    if (p === undefined) continue;
    minX = Math.min(minX, p.pos.x - p.radius);
    maxX = Math.max(maxX, p.pos.x + p.radius);
    minY = Math.min(minY, p.pos.y - p.radius);
  }
  if (!Number.isFinite(minX)) return null;

  const buttons: StructureButtonGeom[] = [];
  // Outside BUILD there is no FIX/SCRAP row at all, so the row width is zero and the FEED strip
  // takes the row's place rather than hanging below an empty gap.
  const count = !inBuild ? 0 : repair === null ? 1 : 2;
  const totalW = count === 0 ? 0 : count * BTN_W + (count - 1) * BTN_GAP;
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

  if (scrap !== null) buttons.push({
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

  /*
   * ⭐ S152 P2 — THE FEED ROW. This is the gesture S151 P3 shipped without.
   *
   * `applyFeedTower` was built, gated and covered by 13 tests, and NOTHING DISPATCHED IT — so the
   * goblin tower could be built, could ignite and could tear down, while its entire mechanic was
   * unreachable in play. `goblinTowerFeed.ts` nominated this panel as the intended home — and note
   * that its docblock went on describing the mechanic as unwired for seven sessions after this row
   * shipped, until S159 P6 corrected it. If you change this row, change that docblock with it: it is
   * the first thing a reader of the reducer sees.
   *
   * Six buttons, always all six, never only the affordable ones — the standing contract in this
   * codebase for a refused control (`castleStructuresModel`: a disabled tile must SAY why, never
   * read as absent). A player must be able to learn that Square makes the shield goblin while
   * holding no Squares.
   */
  const feed = feedSpawnerId === null ? null : { spawnerId: feedSpawnerId };
  if (feed !== null) {
    const feedW = ALL_SPARK_TYPES.length * FEED_BTN + (ALL_SPARK_TYPES.length - 1) * FEED_GAP;
    let feedLeft = (minX + maxX) / 2 - feedW / 2;
    feedLeft = Math.max(EDGE_MARGIN, Math.min(CANVAS_WIDTH - feedW - EDGE_MARGIN, feedLeft));
    // Directly under the FIX/SCRAP row, and clamped like it: a tower against the bottom wall must
    // not push its own feed controls off-screen (the same failure the `top` flip above prevents).
    let feedTop = inBuild ? top + BTN_H + FEED_ROW_GAP : top;
    if (feedTop + FEED_BTN > CANVAS_HEIGHT - EDGE_MARGIN) {
      feedTop = top - FEED_ROW_GAP - FEED_BTN;
    }
    ALL_SPARK_TYPES.forEach((type, i) => {
      // ⛔ THE CASTLE BANK ONLY, NOT `availableShapeCounts`. The reducer's Gate 4 checks
      // `bankCountOf` — the tower is fed from STORES, not from loose shapes on the board — so a
      // count that also included the porch would show a feedable 1 and then be refused with no
      // explanation. The panel must count what the reducer counts.
      const held = bankCountOf(world.castleBanks, seat, type);
      buttons.push({
        kind: 'FEED',
        sparkType: type,
        label: '',           // the glyph IS the label — see the renderer
        caption: GOBLIN_SHORT_NAME[GOBLIN_FEED_MAP[type]] ?? '?',
        enabled: held > 0,
        x: feedLeft + i * (FEED_BTN + FEED_GAP),
        y: feedTop,
        w: FEED_BTN,
        h: FEED_BTN,
      });
    });
  }

  const title = repair !== null
    ? codexCopyFor(repair.group.blueprintId).name
    : feed !== null
      ? 'GOBLIN TOWER' // outside BUILD the repair plan is never computed, so name it directly
      : 'STRUCTURE';
  return {
    primitiveId,
    title,
    titlePos: { x: left + totalW / 2, y: top - 13 },
    buttons,
    ...(feed !== null ? { feedSpawnerId: feed.spawnerId } : {}),
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
  /** S153 P4 (R81) — last pointer position, for the hover look. Off-canvas until a move arrives. */
  private hoverX = -1e9;
  private hoverY = -1e9;
  private pressed = false;

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
      const tint = !b.enabled
        ? TINT_DISABLED
        : b.kind === 'SCRAP'
          ? TINT_SCRAP
          : b.kind === 'FEED'
            ? TINT_FEED
            : TINT_ENABLED;
      /*
       * S153 P4 (owner R81) — hover lifts, press sinks, and a DISABLED button still reacts.
       *
       * The disabled case matters most here: `buttonAt` deliberately ignores disabled buttons so
       * they explain rather than act, and S152 A5 gave that refusal its own SOUND. Giving it a
       * hover look too completes the same thought — the player learns the control is real, is
       * aimed at, and is refusing, which is three different things from "nothing happened".
       */
      const hot =
        this.hoverX >= b.x && this.hoverX <= b.x + b.w &&
        this.hoverY >= b.y && this.hoverY <= b.y + b.h;
      const grow = hot ? (this.pressed ? -1 : 2) : 0;
      g.roundRect(b.x - grow, b.y - grow, b.w + grow * 2, b.h + grow * 2, 10)
        .fill({ color: hot ? (this.pressed ? 0x161d29 : 0x131b27) : 0x0b0f16, alpha: hot ? 0.96 : 0.92 });
      g.roundRect(b.x - grow, b.y - grow, b.w + grow * 2, b.h + grow * 2, 10)
        .stroke({ width: hot ? 3 : 2, color: tint, alpha: 0.95 });

      // ⚠ THE LABEL POOL IS INDEXED ARITHMETICALLY (`1 + i*2`, `2 + i*2`), so EVERY button must
      // claim exactly two slots whether or not it uses both. A FEED button draws its shape with
      // `drawSparkGlyph` instead of a word, so its label slot is set EMPTY rather than skipped —
      // skipping would shift every later button's captions up by one and the trailing
      // `hideLabelsFrom` would then leave a stale word on screen.
      const label = this.labelAt(1 + i * 2);
      if (b.kind === 'FEED' && b.sparkType !== undefined) {
        drawSparkGlyph(g, b.x + b.w / 2, b.y + b.h / 2 - 4, 11, b.sparkType, tint);
        label.text = '';
        label.visible = false;
      } else {
        label.text = b.label;
        label.style.fontSize = 18;
        label.style.fill = tint;
        label.position.set(b.x + b.w / 2, b.y + 16);
        label.visible = true;
      }

      const caption = this.labelAt(2 + i * 2);
      caption.text = b.caption;
      caption.style.fontSize = b.kind === 'FEED' ? 11 : 13;
      caption.style.fill = tint;
      caption.position.set(b.x + b.w / 2, b.kind === 'FEED' ? b.y + b.h - 13 : b.y + 34);
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

  /**
   * ⭐ S152 A5 — is this point over ANY button, INCLUDING a disabled one?
   *
   * `buttonAt` deliberately ignores disabled buttons (they explain, they do not act), which means a
   * click on an unaffordable FEED shape and a click on empty board are INDISTINGUISHABLE to the
   * caller — both get null. That is precisely the ambiguity the owner reported: *"so we know when we
   * have clicked something and it simply didnt work"*. This lets the input layer play a REFUSED cue
   * for the first case and stay silent for the second.
   */
  isOverAnyButton(x: number, y: number): boolean {
    if (this.view === null) return false;
    for (const b of this.view.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    return false;
  }

  /**
   * The ACTION under this point, or null. Disabled buttons do not answer — they only explain.
   *
   * ⚠ RETURNS THE ACTION, NOT THE KIND. It used to return `'FIX' | 'SCRAP' | null`, which cannot
   * express WHICH SHAPE a FEED button hands over. Widening the return type is what tsc-forced every
   * consumer (`controls.ts`'s structural `StructurePanelLike`, `main.ts`'s dispatch) to be updated
   * together, which is the point of typing it this way rather than adding a second lookup method.
   */
  buttonAt(x: number, y: number): StructureAction | null {
    if (this.view === null) return null;
    for (const b of this.view.buttons) {
      if (!b.enabled) continue;
      if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
      if (b.kind === 'FEED') {
        // A FEED button with no shape is a construction bug, not a click to swallow.
        if (b.sparkType === undefined) return null;
        return { kind: 'FEED', sparkType: b.sparkType };
      }
      return { kind: b.kind === 'SCRAP' ? 'SCRAP' : 'FIX' };
    }
    return null;
  }

  /** The goblin tower this popover can feed, when it is aimed at one. */
  feedSpawnerId(): SpawnerId | null {
    return this.view?.feedSpawnerId ?? null;
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

  /**
   * S153 P4 (R81) — where the pointer is, so the draw can light the button under it.
   *
   * Position rather than a resolved index: the popover re-lays itself out every frame from the
   * live world, so an index captured on move could name a different button by the time it is
   * drawn. A point is re-resolved against THIS frame's geometry and cannot go stale.
   */
  setHover(x: number, y: number): void {
    this.hoverX = x;
    this.hoverY = y;
  }

  /** S153 P4 (R81) — pointer is held down. */
  setPressed(down: boolean): void {
    this.pressed = down;
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
