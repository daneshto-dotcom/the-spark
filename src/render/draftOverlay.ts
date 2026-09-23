/**
 * SPARK — THE UPGRADE DRAFT PANEL. One of two, before wave 1 and every fifth wave.
 *
 * ⭐⭐ HIS GEOMETRY, VERBATIM, AND IT IS DERIVED FROM THE SPAWN ZONE RATHER THAN GUESSED:
 *
 * > *"It shouldn't be too big, it should be like just bigger than the spawn zone so you can't see the
 * > spawners behind — a rectangle with the height just slightly bigger than the circle, like the
 * > diameter of the circle, and the length is going to be about twice longer, and it's going to be
 * > split in the middle. On the left is like the regular one, the 10% HP to all spawned units, and on
 * > the right will be your racial one."*
 *
 * `SPAWNER_RADIUS` is 125, so the disc is 250 across; the plate is 270 tall (his *"slightly
 * bigger"*) and 560 wide (*"about twice longer"*), centred on `SPAWNER_CENTER`. Every number below
 * is computed from the constants, so if the quarry ever moves or resizes the panel follows it.
 *
 * ## ⛔ THE RIGHT-HAND TILE IS DELIBERATELY DEAD, AND THAT IS HIS INSTRUCTION
 *
 * > *"for now just have only on the left side the general upgrades, and on the right side no upgrade
 * > and just like coming soon or something, and it's not choosable."*
 *
 * This REVERSES R126, which said never to ship a two-option draft where one option does nothing
 * ("not a choice, a broken screen every player learns to ignore"). His later ruling governs. The
 * tile is drawn at reduced alpha, tinted with the seat's race colour so it still reads as *theirs*,
 * and — the part that matters — it is **not in the hit-test list at all**, so a click there does
 * nothing rather than silently picking the general option.
 *
 * ## ⛔ EVERY OPAQUE SURFACE HERE IS ENUMERATED, AND S182 IS THE REASON
 *
 * That session shipped a live bug under a green source-text tripwire: the guard proved a line
 * EXISTED but could not prove the failing path REACHED it. The fix it found — counting the opaque
 * `.fill({` calls mechanically and pairing each with its hit-test — is what `draftOverlay.test.ts`
 * does to this file. A new opaque plate fails that test until someone hit-tests it or declares it
 * decorative.
 *
 * RENDER-ONLY. This module reads `World` and never mutates it; a pick leaves through `onPick`, which
 * the caller turns into the host-authoritative choice.
 */

import { Container, Graphics, Text, TextStyle, type FederatedPointerEvent } from 'pixi.js';
import {
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  PHYSICS_HZ,
} from '../constants.ts';
import { RACE_COLORS } from '../state/races.ts';
import { DRAFT_BUFF_PCT, type DraftPick, type GeneralPick } from '../state/draft.ts';
import { draftOptionsFor, draftTicksRemaining } from '../state/draftEvent.ts';
import type { World } from '../state/worldTypes.ts';
import type { PlayerId } from '../types.ts';

/* ── geometry, all derived from the spawn zone ────────────────────────────────────────────────── */

/** *"the height just slightly bigger than the circle"* — the disc is 250 across. */
export const PANEL_H = Math.round(SPAWNER_RADIUS * 2 * 1.08);
/** *"the length is going to be about twice longer"*. */
export const PANEL_W = Math.round(PANEL_H * 2.07);
export const PANEL_X = Math.round(SPAWNER_CENTER_X - PANEL_W / 2);
export const PANEL_Y = Math.round(SPAWNER_CENTER_Y - PANEL_H / 2);
/** The split. Two equal tiles with a hairline seam between them. */
const SEAM = 2;
const TILE_W = Math.round((PANEL_W - SEAM) / 2);
const PAD = 14;

const PLATE_BG = 0x10131c;
const PLATE_EDGE = 0xd8b45a;
const TILE_BG = 0x1b2030;
const TILE_HOVER = 0x27304a;
const INK = 0xf2efe6;
const DIM = 0x7d8596;

/* ── the four general options, in the player's words rather than the code's ───────────────────── */

interface OptionCopy {
  readonly title: string;
  readonly line: string;
  readonly detail: string;
}

/**
 * ⚠ **THE COPY SAYS WHAT HE SEES, NOT WHAT THE LADDER DOES.** S180's muscle-memory rule: he could
 * not parse *"21 of 24 unit types"* and said so. So these read "every unit you spawn from now on",
 * never "creatures whose ownerPlayerId matches the drafting seat".
 */
const COPY: Readonly<Record<GeneralPick, OptionCopy>> = {
  hp: {
    title: 'TOUGHER',
    line: `+${DRAFT_BUFF_PCT}% HEALTH`,
    detail:
      `Every unit you spawn from now on has ${DRAFT_BUFF_PCT}% more health. ` +
      'Units already on the board keep what they were born with.',
  },
  def: {
    title: 'ARMOURED',
    line: `+${DRAFT_BUFF_PCT}% DEFENCE`,
    detail:
      `Every unit you spawn from now on takes ${DRAFT_BUFF_PCT}% longer to kill. ` +
      'Units already on the board keep what they were born with.',
  },
  atk: {
    title: 'STRONGER',
    line: `+${DRAFT_BUFF_PCT}% ATTACK`,
    detail:
      `Every unit you spawn from now on hits ${DRAFT_BUFF_PCT}% harder. ` +
      'Units already on the board keep what they were born with.',
  },
  pen: {
    title: 'PIERCING',
    line: `+${DRAFT_BUFF_PCT}% PENETRATION`,
    detail:
      `Every unit you spawn from now on cuts ${DRAFT_BUFF_PCT}% deeper through armour. ` +
      'Units already on the board keep what they were born with.',
  },
};

/** Seconds left, for the countdown. Ticks are the sim's unit; the player reads seconds. */
export function formatDraftClock(ticks: number): string {
  const s = Math.ceil(ticks / PHYSICS_HZ);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** The left tile's rectangle. Exported so the hit-test and its test read the SAME numbers. */
export function generalTileRect(): { x: number; y: number; w: number; h: number } {
  return { x: PANEL_X + PAD, y: PANEL_Y + PAD, w: TILE_W - PAD * 2, h: PANEL_H - PAD * 2 };
}

/** The right tile's rectangle. It is drawn but NOT hit-tested — see the module docblock. */
export function racialTileRect(): { x: number; y: number; w: number; h: number } {
  return {
    x: PANEL_X + TILE_W + SEAM + PAD,
    y: PANEL_Y + PAD,
    w: TILE_W - PAD * 2,
    h: PANEL_H - PAD * 2,
  };
}

function inside(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Which tile, if any, a point lands on.
 *
 * ⛔ Returns `'general'` ONLY. The racial tile is deliberately absent: his instruction is that it is
 * *"not choosable"*, and the honest way to implement that is for the hit-test not to know it exists.
 * Returning `'racial'` and then ignoring it downstream is how a dead option becomes a live bug.
 */
export function draftHitTest(x: number, y: number): 'general' | null {
  return inside(generalTileRect(), x, y) ? 'general' : null;
}

/**
 * ⭐ THE AXIS EMBLEM — a big vector glyph filling the lower two-thirds of a tile.
 *
 * Painted rather than an atlas lookup, for the reason the pencil chewer's portrait is painted: it
 * costs no art, it cannot go missing behind a `Partial<>` table (the failure that gave the owner
 * "this silly goblin warrior"), and it scales cleanly. Four shapes, one per axis, each legible at a
 * glance without reading the words:
 *   hp  — a heart        · def — a shield
 *   atk — a blade        · pen — an arrowhead punching through a broken bar
 *
 * ⚠ OUTLINE ONLY, NO OPAQUE FILL. Every opaque `.fill({` in this module is enumerated and paired
 * with a hit-test by `draftOverlay.test.ts`; a decorative emblem drawn with `fill` would inflate
 * that count and force a false entry. Strokes keep the enumeration honest AND read better over the
 * tile plate.
 */
function drawAxisGlyph(g: Graphics, pick: GeneralPick, cx: number, cy: number, r: number, tint: number, alpha: number): void {
  const w = 5;
  if (pick === 'hp') {
    const k = r * 0.95;
    g.moveTo(cx, cy + k * 0.85)
      .bezierCurveTo(cx - k * 1.5, cy - k * 0.15, cx - k * 0.55, cy - k * 1.05, cx, cy - k * 0.35)
      .bezierCurveTo(cx + k * 0.55, cy - k * 1.05, cx + k * 1.5, cy - k * 0.15, cx, cy + k * 0.85)
      .stroke({ color: tint, width: w, alpha, join: 'round' });
    return;
  }
  if (pick === 'def') {
    const k = r;
    g.moveTo(cx, cy - k)
      .lineTo(cx + k * 0.82, cy - k * 0.55)
      .lineTo(cx + k * 0.82, cy + k * 0.2)
      .lineTo(cx, cy + k)
      .lineTo(cx - k * 0.82, cy + k * 0.2)
      .lineTo(cx - k * 0.82, cy - k * 0.55)
      .closePath()
      .stroke({ color: tint, width: w, alpha, join: 'round' });
    g.moveTo(cx, cy - k * 0.55).lineTo(cx, cy + k * 0.5)
      .stroke({ color: tint, width: w * 0.5, alpha: alpha * 0.7 });
    return;
  }
  if (pick === 'atk') {
    const k = r;
    // A blade on the diagonal, with a crossguard.
    g.moveTo(cx - k * 0.72, cy + k * 0.86).lineTo(cx + k * 0.62, cy - k * 0.86)
      .stroke({ color: tint, width: w * 1.5, alpha, cap: 'round' });
    g.moveTo(cx - k * 0.1, cy - k * 0.1).lineTo(cx + k * 0.5, cy + k * 0.32)
      .stroke({ color: tint, width: w, alpha, cap: 'round' });
    g.moveTo(cx - k * 0.72, cy + k * 0.86).lineTo(cx - k * 0.95, cy + k * 1.05)
      .stroke({ color: tint, width: w * 0.8, alpha: alpha * 0.8, cap: 'round' });
    return;
  }
  // pen — an arrowhead driving through a broken bar.
  const k = r;
  g.moveTo(cx - k * 0.95, cy).lineTo(cx - k * 0.2, cy)
    .stroke({ color: tint, width: w * 1.3, alpha: alpha * 0.55, cap: 'round' });
  g.moveTo(cx + k * 0.45, cy).lineTo(cx + k * 0.95, cy)
    .stroke({ color: tint, width: w * 1.3, alpha: alpha * 0.55, cap: 'round' });
  g.moveTo(cx - k * 0.1, cy - k * 0.62)
    .lineTo(cx + k * 0.6, cy)
    .lineTo(cx - k * 0.1, cy + k * 0.62)
    .stroke({ color: tint, width: w, alpha, join: 'round' });
}

export class DraftOverlay {
  readonly container = new Container();
  private readonly plate = new Graphics();
  private readonly tiles = new Graphics();
  /** The big axis emblem in each tile. Its own Graphics so the tile plates can be redrawn alone. */
  private readonly glyphs = new Graphics();
  private readonly title: Text;
  private readonly clock: Text;
  private readonly generalTitle: Text;
  private readonly generalLine: Text;
  private readonly racialTitle: Text;
  private readonly racialLine: Text;
  private readonly tip: Text;
  /** The COMING SOON tile's placeholder mark. See the note at its draw site. */
  private readonly racialMark: Text;
  private readonly tipPlate = new Graphics();
  private hover: 'general' | null = null;
  private readonly onPick: (p: DraftPick) => void;

  constructor(onPick: (p: DraftPick) => void) {
    this.onPick = onPick;
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.zIndex = 900;

    const h1 = new TextStyle({ fontFamily: ['Kanit', 'Impact', 'sans-serif'], fontWeight: '900', fontStyle: 'italic', fontSize: 22, fill: INK });
    /*
     * ⛔ TWO SEPARATE INSTANCES, NOT ONE SHARED ONE, AND THIS WAS A REAL BUG.
     *
     * The first cut built one `h2` style and handed it to BOTH lines. `render` then set
     * `racialLine.style.fill = RACE_COLORS[race]` each frame — and because the two Texts pointed at
     * the SAME TextStyle object, that repainted the general option's headline in the race colour
     * too. Every geometry and hit-test assertion stayed green; it was visible only by looking at the
     * running game. A shared mutable style is a shared mutable object like any other.
     */
    const h2General = new TextStyle({ fontFamily: ['Kanit', 'Impact', 'sans-serif'], fontWeight: '900', fontStyle: 'italic', fontSize: 30, fill: INK });
    const h2Racial = new TextStyle({ fontFamily: ['Kanit', 'Impact', 'sans-serif'], fontWeight: '900', fontStyle: 'italic', fontSize: 30, fill: DIM });
    const small = new TextStyle({ fontFamily: ['Kanit', 'Impact', 'sans-serif'], fontWeight: '900', fontSize: 15, fill: DIM });
    const tipStyle = new TextStyle({ fontFamily: ['Kanit', 'sans-serif'], fontSize: 15, fill: INK, wordWrap: true, wordWrapWidth: PANEL_W - 40 });

    this.title = new Text({ text: 'CHOOSE YOUR UPGRADE', style: h1 });
    this.clock = new Text({ text: '', style: small });
    this.generalTitle = new Text({ text: '', style: h1 });
    this.generalLine = new Text({ text: '', style: h2General });
    this.racialTitle = new Text({ text: 'YOUR RACE', style: h1 });
    this.racialLine = new Text({ text: 'COMING SOON', style: h2Racial });
    this.tip = new Text({ text: '', style: tipStyle });
    this.racialMark = new Text({
      text: '?',
      style: new TextStyle({ fontFamily: ['Kanit', 'Impact', 'sans-serif'], fontWeight: '900', fontStyle: 'italic', fontSize: 74, fill: DIM }),
    });
    this.racialMark.alpha = 0.35;

    this.container.addChild(this.plate, this.tiles, this.glyphs, this.title, this.clock,
      this.generalTitle, this.generalLine, this.racialTitle, this.racialLine, this.racialMark,
      this.tipPlate, this.tip);

    this.container.on('pointermove', (e: FederatedPointerEvent) => {
      const p = e.global;
      this.hover = draftHitTest(p.x, p.y);
    });
    this.container.on('pointertap', (e: FederatedPointerEvent) => {
      const p = e.global;
      if (draftHitTest(p.x, p.y) === null) return;
      if (this.offered !== null) this.onPick(this.offered);
    });
  }

  private offered: DraftPick | null = null;

  /**
   * Draw one frame.
   *
   * ⚠ Reads `world.draft` every frame rather than latching on an edge. A one-shot show/hide would be
   * lost to a joiner who arrives mid-BUILD with the panel already open — the same reason this
   * codebase derives per-strike visuals from synced state instead of pushing `world.effects`.
   */
  render(world: World, localSeat: PlayerId | null): void {
    const ev = world.draft;
    if (ev === null || localSeat === null) {
      this.container.visible = false;
      this.offered = null;
      return;
    }
    const pl = world.players.get(localSeat);
    if (pl === undefined) {
      this.container.visible = false;
      return;
    }
    // The panel is for a seat that still owes a pick. One that has chosen watches the board.
    const owed = pl.draftPicks.length < (Math.floor((ev.waveNumber - 1) / 5) + 1);
    if (!owed) {
      this.container.visible = false;
      this.offered = null;
      return;
    }
    this.container.visible = true;

    // S188 — the offer now carries the seat's racial perk (null = COMING SOON). The tile itself is
    // wired by the s188/cards branch; the substrate only keeps this call honest.
    const opts = draftOptionsFor(ev.waveNumber, pl.raceId);
    this.offered = opts.general;
    const copy = COPY[opts.general];
    const race = pl.raceId;

    const g = generalTileRect();
    const r = racialTileRect();

    this.plate.clear();
    this.plate
      .roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12)
      .fill({ color: PLATE_BG, alpha: 0.97 })
      .stroke({ color: PLATE_EDGE, width: 2, alpha: 0.9 });

    this.tiles.clear();
    this.tiles
      .roundRect(g.x, g.y, g.w, g.h, 9)
      .fill({ color: this.hover === 'general' ? TILE_HOVER : TILE_BG, alpha: 1 })
      .stroke({ color: PLATE_EDGE, width: this.hover === 'general' ? 2 : 1, alpha: 0.8 });
    // The dead tile: race-tinted so it still reads as theirs, dimmed so it reads as unavailable.
    this.tiles
      .roundRect(r.x, r.y, r.w, r.h, 9)
      .fill({ color: TILE_BG, alpha: 0.55 })
      .stroke({ color: RACE_COLORS[race], width: 1, alpha: 0.35 });

    this.title.x = PANEL_X + PANEL_W / 2 - this.title.width / 2;
    this.title.y = PANEL_Y - 34;
    this.clock.text = formatDraftClock(draftTicksRemaining(world));
    this.clock.x = PANEL_X + PANEL_W - this.clock.width - 4;
    this.clock.y = PANEL_Y - 30;

    this.generalTitle.text = copy.title;
    this.generalLine.text = copy.line;
    this.generalTitle.x = g.x + 16;
    this.generalTitle.y = g.y + 18;
    this.generalLine.x = g.x + 16;
    this.generalLine.y = g.y + 48;

    this.racialTitle.x = r.x + 16;
    this.racialTitle.y = r.y + 18;
    this.racialLine.x = r.x + 16;
    this.racialLine.y = r.y + 48;
    /*
     * The emblems, sized off the tile so they fill the space the words leave empty. The general one
     * takes the plate's gold; the racial one takes the seat's race colour at low alpha, so the dead
     * tile still reads as THEIRS rather than as a blank.
     */
    this.glyphs.clear();
    const gr = Math.min(g.w, g.h - 70) * 0.34;
    drawAxisGlyph(this.glyphs, opts.general, g.x + g.w / 2, g.y + g.h * 0.66, gr, PLATE_EDGE,
      this.hover === 'general' ? 0.95 : 0.7);
    /*
     * ⛔ THE DEAD TILE GETS A QUESTION MARK, NOT THE GENERAL'S EMBLEM. The first cut drew the same
     * axis glyph on both sides at low alpha, which reads as "this option gives you the same thing" —
     * the opposite of true, and the exact misreading a COMING SOON tile must not invite. A '?' says
     * "something, not yet decided", which is what it actually is.
     */
    this.racialMark.x = r.x + r.w / 2 - this.racialMark.width / 2;
    this.racialMark.y = r.y + r.h * 0.66 - this.racialMark.height / 2;
    this.racialMark.style.fill = RACE_COLORS[race];

    this.racialTitle.alpha = 0.5;
    this.racialLine.alpha = 0.5;
    this.racialLine.style.fill = RACE_COLORS[race];

    // The hover panel. Only the live tile has one; hovering a dead tile must not promise anything.
    const showTip = this.hover === 'general';
    this.tip.text = showTip ? copy.detail : '';
    this.tipPlate.clear();
    if (showTip) {
      this.tip.x = PANEL_X + 20;
      this.tip.y = PANEL_Y + PANEL_H + 14;
      this.tipPlate
        .roundRect(PANEL_X, PANEL_Y + PANEL_H + 6, PANEL_W, this.tip.height + 16, 8)
        .fill({ color: PLATE_BG, alpha: 0.95 })
        .stroke({ color: PLATE_EDGE, width: 1, alpha: 0.6 });
    }
  }

  /* ── ⭐ S188 (s188/input-layer, audit F1) — THE PANEL AS AN INPUT SURFACE ─────────────────────── */

  /**
   * ⛔⛔ **DOES THE PANEL DRAW OVER THIS POINT?** The SURFACE question — what `controls.ts` asks
   * before it lets a click, a drop or a raid reach the board.
   *
   * It exists because the panel was a UI surface registered in NONE of the input layer's gates. Pixi
   * never stops the native event, and `controls.ts` listens on the raw canvas, so ONE click on a tile
   * both sent the pick (the `pointertap` above) AND ran the board handlers under the zIndex-900 plate:
   * it stamped an armed tower on the side-margin ground the plate hides, re-tasked a gatherer, raided
   * on a right-click, opened a character card. The owner's S181 rule for the card applies word for
   * word — *a surface you cannot see through must swallow the click*.
   *
   * ⭐ IT ASKS THE PIXELS, NOT A SECOND COPY OF THE GEOMETRY: every `Graphics` child the panel holds,
   * as drawn THIS frame. That is the plate, both tiles, and the hover-detail plate that `render` draws
   * BELOW the panel rect — the one a plate-rect-only test would have missed — and any plate added
   * later is covered the moment it is drawn, instead of the day someone remembers to register it.
   * A cleared `Graphics` answers false, so a tip that is not showing swallows nothing. The panel draws
   * in canvas coordinates, untransformed — the same assumption `draftHitTest(e.global)` makes.
   */
  isOver(x: number, y: number): boolean {
    if (!this.container.visible) return false;
    const p = { x, y };
    for (const child of this.container.children) {
      if (child instanceof Graphics && child.visible && child.containsPoint(p)) return true;
    }
    return false;
  }

  /**
   * ⭐ **WOULD A CLICK HERE MAKE A PICK?** The CONTROL question — the cursor's, which may only promise
   * a pointer where a click does something. Narrower than `isOver` on purpose (the S182 split): the
   * COMING SOON tile is part of the surface and is not a control.
   */
  isOverChoosable(x: number, y: number): boolean {
    return this.container.visible && this.offered !== null && draftHitTest(x, y) !== null;
  }
}
