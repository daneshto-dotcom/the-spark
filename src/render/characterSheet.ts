/**
 * SPARK — S180: **THE CHARACTER SHEET.** The card itself; the model is `characterSheetModel.ts`.
 *
 * > *"Little picture of the character, like we have the little little fucking health bar, stats,
 * > done."* — owner, S180
 *
 * ## ⛔ VISIBILITY IS A PURE FUNCTION OF STATE, RE-EVALUATED EVERY FRAME
 *
 * The discipline `arcadeRunOverlay.ts` records in full, and the reason it exists: an overlay shown by
 * an imperative `.show()` stays up forever the first time some exit path forgets its `.hide()`. Here
 * `sync()` runs unconditionally, re-derives the whole card from the world, and **clears its own
 * selection when the model returns null** — so a card cannot outlive its subject, and no new exit
 * path has to remember anything.
 *
 * ## ⛔ THE SELECTION IS AN ID AND NEVER ENTERS `world`
 *
 * Two players may have different things selected at the same instant and the sim does not care. That
 * is what keeps this feature off the hash, out of the save format and off the wire — the same
 * argument `structurePanel.ts` makes for the FIX/SCRAP popover it grew out of.
 *
 * RENDER-ONLY: reads `world`, never mutates it.
 */

import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { PlayerId } from '../types.ts';
import type { World } from '../state/worldTypes.ts';
import { codexCopyFor, drawEmblem } from './codexPresentation.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';
import { SparkType } from '../constants.ts';
import type { PrimitiveId, SpawnerId } from '../types.ts';
import {
  characterSheetModel,
  layoutSheetActions,
  MONO_EM_RATIO,
  portraitPlateFor,
  SHEET_W,
  statValueColumnPx,
  type SheetActionSlot,
  type CharacterSheetView,
  type PortraitSpec,
  type SheetTarget,
} from './characterSheetModel.ts';

const PAD = 12;
const PORTRAIT = 76;
const BAR_H = 12;
const ROW_H = 20;
/**
 * How much bigger than board size a procedurally-painted portrait draws.
 *
 * ⚠ MEASURED AGAINST THE RIGS, not chosen. The chewer's `BODY_R` is 17px and the drone runs at
 * `LIGHTNING_DRONE_SPRITE_SCALE`, so both occupy roughly 34–40px on the board against a 76px
 * portrait box. 1.6x fills the box without clipping the stalk eyes or the bolt halo.
 */
const PROCEDURAL_PORTRAIT_SCALE = 1.6;
/** Height the build-recipe strip pushes the health bar down by. Mirrors the model's reservation. */
const BUILD_STRIP_H = 22;
/** Tiny, as he asked — *"a little picture … in the right corner"*. */
const BUILD_EMBLEM_SCALE = 0.2;
/**
 * Characters of build bill that fit between the portrait and the emblem slot.
 *
 * ⚠ MEASURED, NOT GUESSED: the bill starts at `PAD + PORTRAIT + 10` = 98px in, and must stop ~30px
 * short of the right edge to clear the emblem. At 10px monospace x 0.6 advance that is ~18 glyphs on
 * the 236px card. Short, so long bills ellipsise — the codex carries the full recipe.
 */
const BILL_CHARS = 18;

/** PURE — clip to `n` characters with a visible ellipsis, never a silent truncation. */
export function fitChars(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, Math.max(0, n - 1))}…`;
}
/**
 * Characters that fit one description line, and how many lines the card gives it.
 *
 * ⚠ BOTH NUMBERS WERE WRONG IN THE FIRST CUT, and the measurement is why they are here rather than
 * inline. I derived the width from `PANEL_W` (268 — the CASTLE card's width) when the ordinary card
 * is `SHEET_W` 236, and then gave it two lines for a blurb `CodexCopy.recipe` caps at 150 chars.
 * The result: every long description lost 30–50% of itself to an ellipsis.
 *
 * ⭐ DERIVED FROM `SHEET_W` AND THE SAME `MONO_EM_RATIO` the stat column uses, so a font change moves
 * both together: `(236 - 2*12) / (10 * 0.6)` ≈ 35 glyphs, and 5 lines hold 150 chars with room.
 */
const DESC_CHARS_PER_LINE = Math.floor((SHEET_W - PAD * 2) / (10 * MONO_EM_RATIO));
const DESC_MAX_LINES = 5;
/*
 * ⛔ `DESC_MAX_LINES` AND THE MODEL'S `DESC_ROW_H` MUST AGREE, or the card clips its own text. The
 * model reserves `5 * 12 + 4`; a test asserts the pair rather than trusting this comment.
 */

/**
 * PURE — greedy word wrap to `maxLines`, ellipsising the tail rather than dropping it silently.
 *
 * ⚠ TRUNCATION IS VISIBLE ON PURPOSE. `CodexCopy.recipe` is capped at 150 chars by its own test, so
 * two 40-char lines is usually enough — but a line that vanishes without a mark reads as a bug,
 * whereas an ellipsis reads as "there is more in the codex".
 */
export function wrapToWidth(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((t) => t.length > 0);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur === '' ? word : `${cur} ${word}`;
    if (next.length <= perLine) { cur = next; continue; }
    /*
     * ⛔ THE EMPTY-LINE BUG, FOUND BY RUNNING IT RATHER THAN READING IT. When the FIRST word is
     * longer than the line, `cur` is still '' here and the original pushed that empty string as a
     * line — a blank row in the middle of the description. Guarded, and an over-long word is now
     * HARD-BROKEN across lines instead of being emitted whole (which overflowed the card silently).
     */
    if (cur !== '') lines.push(cur);
    if (lines.length >= maxLines) { cur = ''; break; }
    let rest = word;
    while (rest.length > perLine && lines.length < maxLines) {
      lines.push(rest.slice(0, perLine));
      rest = rest.slice(perLine);
    }
    cur = rest;
    if (lines.length >= maxLines) { cur = ''; break; }
  }
  if (lines.length < maxLines && cur !== '') lines.push(cur);
  /*
   * ⚠ TRUNCATION IS VISIBLE, and the comparison is on the CONSUMED text rather than a join of the
   * output — a hard-broken word changes the spacing, so comparing joins reported a phantom overflow.
   */
  const emitted = lines.join('').replace(/\s+/g, '').length;
  const total = words.join('').length;
  if (lines.length === maxLines && emitted < total) {
    const last = lines[maxLines - 1] ?? '';
    lines[maxLines - 1] = `${last.slice(0, Math.max(0, perLine - 1))}…`;
  }
  return lines.filter((l) => l !== '');
}

const INK = 0xe8eef6;
const DIM = 0x93a6bb;
const PLATE = 0x0a1622;
const EDGE = 0x2a3a4a;
const HP_GOOD = 0x6fd08a;
const HP_WARN = 0xe8c35a;
const HP_LOW = 0xe2684a;
/** A frozen bar is LAST-SEEN, not live — it reads as greyed so it cannot be mistaken for current. */
const HP_FROZEN = 0x6c7a8a;

/** Hands back one still frame for a creature portrait. Injected so this file never imports the
 *  sprite renderer — that direction would be a cycle, and `main.ts` already owns both. */
export type PortraitSource = (spec: PortraitSpec) => Texture | null;

/**
 * ⭐⭐ S181 — PAINTS a portrait that has no texture to look up, into a Graphics the card owns.
 *
 * Returns true when it drew something. Injected exactly like `PortraitSource` and for the same
 * reason: this file must never import a creature renderer, and `main.ts` already owns both ends.
 *
 * ⚠ THE CARD SUPPLIES THE ORIGIN AND THE SCALE, so a painter only has to know how to draw itself at
 * (0, 0) — the same contract `drawEmblem` already works under.
 */
export type PortraitPainter = (spec: PortraitSpec, g: Graphics, x: number, y: number) => boolean;

function barColor(cur: number, max: number, frozen: boolean): number {
  if (frozen) return HP_FROZEN;
  const f = max <= 0 ? 0 : cur / max;
  return f > 0.5 ? HP_GOOD : f > 0.2 ? HP_WARN : HP_LOW;
}

export class CharacterSheet {
  private readonly container: Container;
  private readonly g: Graphics;
  private readonly emblem: Graphics;
  private readonly glyphs: Graphics;
  /** S181 — the build-recipe emblem lives alone, because `drawEmblem` ADDS CHILDREN (see draw). */
  private readonly buildGlyph: Container;
  private readonly buildGlyphG: Graphics;
  private readonly portrait: Sprite;
  private readonly labels: Text[] = [];
  private used = 0;
  private selected: SheetTarget | null = null;
  private view: CharacterSheetView | null = null;
  private portraitSource: PortraitSource = () => null;
  private portraitPainter: PortraitPainter = () => false;
  /** Where the owned-unit row was drawn this frame, so a click on it can open that unit's own card. */
  private ownedHit: { x: number; y: number; w: number; h: number } | null = null;
  /**
   * ⭐ S181 — the action buttons AS DRAWN this frame, and the only thing a click is tested against.
   *
   * ⛔ RECORDED FROM THE DRAW, NOT RE-LAID-OUT AT CLICK TIME. `castlePanel.rowsTop`'s docblock
   * records the exact bug the other way round: the rows DREW at one y while `getUiPoints` reported
   * another, so every click landed on empty plate while a screenshot looked perfect. One layout, one
   * consumer.
   */
  private slots: SheetActionSlot[] = [];
  /**
   * ⭐⭐ S181 (owner) — **A CLICKABLE THING MUST LOOK CLICKABLE UNDER THE POINTER.**
   *
   * > *"the buttons scrape or fix or the triangle button … any button that's clickable should, when
   * > you mouse over it, slightly change hue. So it looks like it's popping out. So user knows it's
   * > clickable."*
   *
   * This is his R81 restated for the card — *"everything clickable should pop out, be highlighted
   * and/or make a sound"* — which the footer band and the retired popover both already honoured.
   *
   * ⛔ FED FROM THE SAME `actionAt`/`isOverAnyAction` PREDICATES THE CLICK PATH USES, never a
   * parallel hit test. `controls.updateHoverCursor` records why in full: a highlight that can
   * disagree with what a click would hit is worse than no highlight at all.
   */
  private hover: { x: number; y: number } | null = null;

  constructor(app: Application, parent: Container = app.stage) {
    this.container = new Container();
    this.container.eventMode = 'none'; // the board underneath stays clickable
    this.g = new Graphics();
    this.emblem = new Graphics();
    // S181 — its own child so a feed chip's glyph is not wiped by the plate's `clear()` ordering.
    this.glyphs = new Graphics();
    this.buildGlyph = new Container();
    this.buildGlyphG = new Graphics();
    this.buildGlyph.addChild(this.buildGlyphG);
    this.portrait = new Sprite();
    this.portrait.visible = false;
    this.container.addChild(this.g);
    this.container.addChild(this.emblem);
    this.container.addChild(this.glyphs);
    this.container.addChild(this.buildGlyph);
    this.container.addChild(this.portrait);
    parent.addChild(this.container);
  }

  setPortraitSource(fn: PortraitSource): void {
    this.portraitSource = fn;
  }

  /** S181 — for the three creatures and any building drawn procedurally rather than from a sheet. */
  setPortraitPainter(fn: PortraitPainter): void {
    this.portraitPainter = fn;
  }

  select(target: SheetTarget | null): void {
    this.selected = target;
  }

  selection(): SheetTarget | null {
    return this.selected;
  }

  /** S181 — the pointer moved; light whatever control is under it. Null clears the highlight. */
  setHover(x: number, y: number): void {
    this.hover = { x, y };
  }

  clearHover(): void {
    this.hover = null;
  }

  /** The owned-unit row's target if (x, y) is on it — his *"you can either click on that"*. */
  ownedRowAt(x: number, y: number): SheetTarget | null {
    const h = this.ownedHit;
    const owned = this.view?.owned ?? null;
    if (h === null || owned === null) return null;
    if (x < h.x || x > h.x + h.w || y < h.y || y > h.y + h.h) return null;
    return owned.target;
  }

  /**
   * S181 — the card's rect AS DRAWN this frame, or null when it is closed.
   *
   * Exists so `castlePanel` can dock flush beneath the keep's card and the two read as one window.
   * The panel must not recompute the card's geometry: one layout, one consumer — the same rule the
   * action slots follow, and the one `rowsTop` was extracted to enforce inside the panel itself.
   */
  rect(): { x: number; y: number; w: number; h: number } | null {
    const r = this.view?.rect;
    return r === undefined ? null : { x: r.x, y: r.y, w: r.w, h: r.h };
  }

  /** True while the pointer is over the card, so a click on it does not also act on the board. */
  isOver(x: number, y: number): boolean {
    const r = this.view?.rect;
    if (r === undefined) return false;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  sync(world: World, seat: PlayerId): void {
    const view = this.selected === null ? null : characterSheetModel(world, seat, this.selected);
    /*
     * ⛔ THE ONE LINE THAT MAKES A DEAD SUBJECT'S CARD VANISH WITH NO DEATH LISTENER. `sync` runs
     * every frame; the model returns null the moment its subject leaves the world; the selection
     * clears itself here. Nothing has to remember to close this.
     */
    if (view === null) this.selected = null;
    this.view = view;
    this.reset();
    if (view === null) {
      this.container.visible = false;
      this.ownedHit = null;
      return;
    }
    this.container.visible = true;
    this.draw(view);
  }

  private draw(v: CharacterSheetView): void {
    const { x, y, w, h } = v.rect;
    /*
     * ⭐⭐ S181 (owner) — **THE RACE OUTLINE.** *"That red outline with the red text and everything,
     * that looks good … for the character sheet, do it like that. Every race will have his own
     * outline. The writing, any titles, will be with the race's color. It needs to be distinct."*
     *
     * A 2px accent edge with a soft outer halo, over the shipped dark plate. The halo is two
     * concentric rounded strokes at low alpha rather than a blur filter: a filter on this container
     * would force Pixi to allocate a render texture per frame for an overlay that redraws every
     * frame anyway, and at this size the two strokes are visually identical.
     */
    const accent = v.accent ?? EDGE;
    if (v.accent !== null) {
      this.g.roundRect(x - 3, y - 3, w + 6, h + 6, 11).stroke({ color: accent, width: 1, alpha: 0.12 });
      this.g.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 9.5).stroke({ color: accent, width: 1, alpha: 0.26 });
    }
    this.g
      .roundRect(x, y, w, h, 8)
      .fill({ color: PLATE, alpha: 0.94 })
      .stroke({ color: accent, width: v.accent === null ? 1 : 2 });

    // ── header: the name, largest thing on the card, and one identity line ────────────────────
    //    The TITLE takes the race colour; the identity line stays dim so the name still leads.
    this.text(v.title, x + PAD, y + PAD - 2, 17, v.accent ?? INK);
    this.text(v.subtitle, x + PAD, y + PAD + 18, 11, DIM);

    const top = y + PAD + 36;

    // ── portrait ──────────────────────────────────────────────────────────────────────────────
    this.g
      .roundRect(x + PAD, top, PORTRAIT, PORTRAIT, 6)
      .fill({ color: 0x101a26 })
      .stroke({ color: EDGE, width: 1 });
    this.drawPortrait(v.portrait, x + PAD, top);

    // ── health: the bar AND the number. Both, always — the bar is for peripheral vision and the
    //    number is for the decision. Every RTS since StarCraft shows both.
    /*
     * ⭐⭐ S181 (owner) — **WHAT IT TAKES TO BUILD, ABOVE THE HEALTH BAR.**
     *
     * > *"above the health bar … how many connectors it takes to build it, the exact kind. Maybe a
     * > little picture on the right side, just like you have in the codex, in the right corner above
     * > the health bar, that shows what it takes to build it, and then to the left of it maybe like
     * > an explanation. So like three triangles built in a triangle."*
     *
     * The glyph is the CODEX's own emblem — *"just like you have in the codex"* taken literally, not
     * a lookalike — and the "explanation" to its left is the build bill in words. The bar and its
     * number shift down by exactly the strip's height, so nothing overlaps.
     */
    let barTop = 0;
    if (v.buildBill !== null) {
      this.text('BUILD', x + PAD + PORTRAIT + 10, y + PAD + 40, 9, DIM);
      /*
       * ⚠ TRUNCATED TO THE SPACE THAT ACTUALLY EXISTS. The bill starts right of the portrait and
       * must stop short of the emblem slot, which is ~14px + padding from the right edge. Helga's
       * `1 TRIANGLE + 3 CIRCLES + 3 SPIRALS` ran ~66px past the card before this.
       */
      this.text(fitChars(v.buildBill, BILL_CHARS), x + PAD + PORTRAIT + 10, y + PAD + 51, 10, INK);
      barTop = BUILD_STRIP_H;
    }
    if (v.buildEmblem !== undefined && v.buildEmblem !== null) {
      /*
       * ⛔⛔ S181 — **ITS OWN CONTAINER, AND THE FIRST CUT PUT THE GLYPH ON THE CANVAS ORIGIN.**
       *
       * Two real defects in one block, both found by verifying rather than by a test:
       *
       *  1. I drew into `this.glyphs`, then RESET its position and scale on the next two lines so
       *     the feed chips could keep using absolute coordinates. But a Graphics renders with its
       *     transform AS OF DRAW TIME — so resetting after `drawEmblem` rendered the emblem at
       *     (0, 0) at full size. A large recipe diagram in the top-left corner of the SCREEN, and
       *     an empty top-right corner on the card where he asked for it.
       *  2. `drawEmblem` ends in `g.addChild(wrap)` — and `Graphics.clear()` does NOT remove
       *     children. So every frame added another child and the pile grew for as long as a card
       *     stayed open.
       *
       * ⭐ FIXED BY GIVING IT A CONTAINER NOBODY ELSE TOUCHES, whose transform is set once and never
       * reset, and whose children are destroyed in `reset()`. That is also why it is a `Container`
       * and not a `Graphics`: `drawEmblem` wants a parent, not a canvas.
       */
      this.buildGlyph.position.set(x + w - PAD - 14, y + PAD + 48);
      this.buildGlyph.scale.set(BUILD_EMBLEM_SCALE);
      drawEmblem(this.buildGlyphG, v.buildEmblem);
      barTop = Math.max(barTop, BUILD_STRIP_H);
    }

    const rx = x + PAD + PORTRAIT + 10;
    const rw = w - PAD * 2 - PORTRAIT - 10;
    const { cur, max, frozen } = v.health;
    const frac = max <= 0 ? 0 : Math.max(0, Math.min(1, cur / max));
    const by = top + 6 + barTop;
    this.g.roundRect(rx, by, rw, BAR_H, 3).fill({ color: 0x1b2938 });
    if (frac > 0) {
      this.g.roundRect(rx, by, Math.max(2, rw * frac), BAR_H, 3).fill({ color: barColor(cur, max, frozen) });
    }
    this.text(`${cur} / ${max}`, rx, by + BAR_H + 4, 13, frozen ? DIM : INK);
    if (frozen) this.text('LAST SEEN', rx, by + BAR_H + 20, 10, DIM);

    // ── the four stats. `derived` prints on the row it comes FROM — his own correction. ────────
    let sy = top + PORTRAIT + 10;
    /*
     * ⭐⭐ S181 (owner) — THE VALUE COLUMN IS DERIVED FROM THE WIDEST LABEL, not a constant. The
     * shipped `x + PAD + 42` printed the number INSIDE the word on every label longer than 42px,
     * which is why his screenshots read `CONNECT4RS` / `CONNECT9RS` while `SHAPES 4` beside it was
     * clean. See `statValueColumnPx` for why this is exact rather than a nudged magic number.
     */
    const valueCol = statValueColumnPx(v.stats.map((r) => r.label), 11);
    for (const row of v.stats) {
      this.text(row.label, x + PAD, sy, 11, DIM);
      this.text(String(row.points), x + PAD + valueCol, sy, 13, INK);
      if (row.derived !== null) this.textRight(row.derived, x + w - PAD, sy, 11, DIM);
      sy += ROW_H;
    }

    // ── the unit this building fields, if it fields one ───────────────────────────────────────
    if (v.owned !== null) {
      const oy = sy + 4;
      const oh = 40;
      /*
       * ⭐⭐ S181 — **THE OWNED-UNIT ROW LIGHTS UP TOO.** It is clickable — it re-aims the card at the
       * unit a building fields, his *"you can either click on that"* — and it had a fixed plate with
       * no hover and no pointer cursor, on the same card as buttons that have both. A control that
       * is live but looks inert teaches the player that the card lies about what can be clicked,
       * which is worse than one that is plainly disabled.
       *
       * Same predicate the click path uses, so the highlight and the hit can never disagree.
       */
      const h = this.hover;
      const ownedHot =
        h !== null &&
        h.x >= x + PAD && h.x <= x + w - PAD && h.y >= oy && h.y <= oy + oh;
      if (ownedHot) {
        this.g.roundRect(x + PAD - 2, oy - 2, w - PAD * 2 + 4, oh + 4, 8)
          .stroke({ color: accent, width: 2, alpha: 0.35 });
      }
      this.g
        .roundRect(x + PAD, oy, w - PAD * 2, oh, 6)
        .fill({ color: ownedHot ? 0x1b2c3c : 0x14212e })
        .stroke({ color: ownedHot ? accent : EDGE, width: ownedHot ? 1.5 : 1 });
      this.text(v.owned.name, x + PAD + 46, oy + 6, 12, INK);
      const ow = w - PAD * 2 - 52;
      const of_ = v.owned.health.max <= 0 ? 0 : v.owned.health.cur / v.owned.health.max;
      this.g.roundRect(x + PAD + 46, oy + 24, ow, 8, 3).fill({ color: 0x1b2938 });
      if (of_ > 0) {
        this.g
          .roundRect(x + PAD + 46, oy + 24, Math.max(2, ow * of_), 8, 3)
          .fill({ color: barColor(v.owned.health.cur, v.owned.health.max, v.owned.health.frozen) });
      }
      this.g.roundRect(x + PAD + 4, oy + 4, 32, 32, 4).fill({ color: 0x101a26 }).stroke({ color: EDGE, width: 1 });
      this.ownedHit = { x: x + PAD, y: oy, w: w - PAD * 2, h: oh };
      /*
       * ⛔ S181 — **ADVANCE `sy` PAST THE BLOCK.** It did not, and the description added this
       * session was therefore drawn straight across the owned-unit row while ~80px sat empty at the
       * bottom of the card. Helga's hub was the visible case: her name and health bar with a
       * sentence printed over them.
       */
      sy = oy + oh + 6;
    } else {
      this.ownedHit = null;
    }

    /*
     * ⭐⭐ S181 (owner) — **THE DESCRIPTION, IN THE EMPTY SPACE HE POINTED AT.**
     *
     * > *"there should be a description of the tower. So maybe we have all this empty space just
     * > under the tower health, underneath it. You can just say like spawning bats every this much
     * > seconds, for example."*
     *
     * It is the codex's own `recipe` line, or a derived cadence sentence for a race tower. Wrapped
     * by hand to the card width rather than with a word-wrap style, because Pixi's wrapping needs a
     * fixed `wordWrapWidth` on the style and these Text objects are POOLED and reused at several
     * sizes — setting it here would leak onto the next label that borrows the object.
     */
    if (v.description !== null) {
      for (const line of wrapToWidth(v.description, DESC_CHARS_PER_LINE, DESC_MAX_LINES)) {
        this.text(line, x + PAD, sy + 2, 10, DIM);
        sy += 12;
      }
      sy += 4;
    }

    // ── FIX / SCRAP / FEED — his *"towers lost their scrap and fix. That's wrong."* ────────────
    this.slots = v.actions === null ? [] : layoutSheetActions(v.actions.buttons, v.rect);
    for (const b of this.slots) this.drawActionButton(b, accent);

    /*
     * ⭐⭐ S181 (owner) — **TELL THEM WHAT THE SHAPE BUTTON DOES.**
     *
     * > *"underneath where it shows like triangle, where you build bats, and people need to know
     * > what it does. So just be like 'to build more bats' or something. Click this."*
     *
     * A feed chip is a shape glyph and nothing else — unlabelled by necessity, since no word fits
     * 32px. So the caption goes ABOVE the strip, once, naming what feeding produces. It reads off
     * `v.feedHint`, which the model derives from the tower's own unit table, so a bat tower says bat
     * and a piranha tower says piranha without a second table here.
     *
     * ⚠ ABOVE THE STRIP, NOT BELOW, because the strip is the last thing on the card — a caption
     * under it would be the closest text to the card's bottom edge and read as a footer for the
     * whole panel rather than a label for the row.
     */
    const feed = this.slots.filter((b) => b.kind === 'FEED');
    const hint = v.feedHint;
    if (feed.length > 0 && hint !== null) {
      const top = Math.min(...feed.map((b) => b.y));
      this.textCentred(hint, x + w / 2, top - 12, 9, DIM);
    }
  }

  /**
   * ⭐⭐ S181 (owner) — one control, drawn the way he asked for it: *"beautiful outline, buttons
   * glowing, rounded edges, you know, everything very user-friendly and simple."*
   *
   * ⛔ A DISABLED BUTTON IS DRAWN, DIMMED, AND STILL SAYS WHY — never hidden. That is this
   * codebase's standing contract for a refused control (`castleStructuresModel`: *"a disabled tile
   * must SAY why, never read as absent"*), and the reason the owner can learn that a shape feeds a
   * particular unit while holding none of it. The caption is the model's, not invented here.
   */
  private drawActionButton(b: SheetActionSlot, accent: number): void {
    const feed = b.kind === 'FEED';
    const r = feed ? 6 : 8;
    /*
     * ⭐ S181 — THE HOVER LIFT. Only an ENABLED control lights: a disabled one must still read as
     * refused, and making it glow under the pointer would promise a click that `actionAt`
     * deliberately ignores. A refused control explains itself through its caption instead.
     */
    const h = this.hover;
    const hot =
      b.enabled &&
      h !== null &&
      h.x >= b.x && h.x <= b.x + b.w && h.y >= b.y && h.y <= b.y + b.h;
    // The glow is what reads as "glowing" without a filter: a wider, fainter stroke outside the
    // crisp one. Only an ENABLED control glows — that is what makes the affordable ones pop.
    if (b.enabled) {
      // The glow widens and brightens on hover — that is the whole "popping out" he described.
      this.g.roundRect(b.x - (hot ? 4 : 2), b.y - (hot ? 4 : 2), b.w + (hot ? 8 : 4), b.h + (hot ? 8 : 4), r + 2)
        .stroke({ color: accent, width: hot ? 3 : 2, alpha: hot ? 0.42 : 0.18 });
    }
    this.g
      .roundRect(b.x, b.y, b.w, b.h, r)
      .fill({ color: b.enabled ? (hot ? 0x1f3850 : 0x16283a) : 0x111c28, alpha: 0.96 })
      .stroke({ color: b.enabled ? accent : EDGE, width: b.enabled ? (hot ? 2 : 1.5) : 1, alpha: b.enabled ? (hot ? 1 : 0.9) : 0.55 });

    if (feed) {
      // The shape glyph IS the label for a feed chip — a word would not fit 32px and the player
      // recognises the shape from the palette they built with.
      // Signature is (g, x, y, r, shape, color) — the glyph carries the accent when affordable so
      // the strip reads as "these are yours to spend", and greys out when it is not.
      drawSparkGlyph(
        this.glyphs,
        b.x + b.w / 2,
        b.y + b.h / 2,
        9,
        (b.sparkType ?? 0) as SparkType,
        b.enabled ? accent : DIM,
      );
      return;
    }
    const cx = b.x + b.w / 2;
    this.textCentred(b.label, cx, b.y + 6, 13, b.enabled ? INK : DIM);
    if (b.caption !== '') this.textCentred(b.caption, cx, b.y + 21, 9, DIM);
  }

  private drawPortrait(spec: PortraitSpec, px: number, py: number): void {
    const tex = this.portraitSource(spec);
    if (tex !== null) {
      this.portrait.texture = tex;
      const scale = Math.min((PORTRAIT - 8) / tex.width, (PORTRAIT - 8) / tex.height);
      this.portrait.scale.set(scale);
      this.portrait.position.set(
        px + (PORTRAIT - tex.width * scale) / 2,
        py + (PORTRAIT - tex.height * scale) / 2,
      );
      this.portrait.visible = true;
      return;
    }
    /*
     * ⭐ HIS FALLBACK, NOT A PLACEHOLDER: *"the ones that don't have a tower yet, you just use the
     * one that you used in the codex, like the shape connectors, how it looks."*
     *
     * ⭐⭐ S181 — **`towerFrame` FALLS DOWN THE SAME CHAIN**, which is what makes the art an upgrade
     * rather than a risk. A tower atlas is fetched lazily, so `portraitTexture` answers null for the
     * first frames after a card opens; carrying `recipeId` on the spec lets those frames draw the
     * emblem the card drew before this change instead of flashing the empty plate. Same arm covers a
     * peer whose fetch failed outright.
     */
    /*
     * ⭐⭐ S181 — THE PAINTER, TRIED BETWEEN THE TEXTURE AND THE EMBLEM. A creature with no sheet
     * (the chewer, the lightning drone) draws its own puppet here, so the owner gets the picture he
     * asked for without any art existing. Scaled up because the rigs are authored at board size —
     * a chewer's body radius is 17px against a 76px box.
     */
    this.emblem.position.set(px + PORTRAIT / 2, py + PORTRAIT / 2);
    this.emblem.scale.set(PROCEDURAL_PORTRAIT_SCALE);
    if (this.portraitPainter(spec, this.emblem, 0, 0)) return;
    this.emblem.scale.set(1);

    /*
     * ⭐⭐ S182 — **THE DECISION IS NO LONGER MADE HERE.** `portraitPlateFor` is a total function over
     * `PortraitSpec` with a `never` arm, so a new spec kind cannot reach a fall-through, and no arm
     * can produce the `'…'` this block used to end on. See its docblock for the full enumeration —
     * including the three cases (`freeform`, and the `voltkin` / `direwolf` / `locustCloud`
     * creatures) that no comment in this file had ever named.
     *
     * ⚠ `hasTexture` is FALSE HERE BY CONSTRUCTION: the texture arm above already returned. Passing
     * it explicitly rather than hard-coding `false` inside the resolver is what lets the test walk
     * both states of every spec without a Pixi canvas.
     */
    const plate = portraitPlateFor(
      spec,
      false,
      (id) => codexCopyFor(id).emblem !== undefined,
      (id) => codexCopyFor(id).name,
    );
    if (plate.kind === 'emblem') {
      const em = codexCopyFor(plate.recipeId).emblem;
      if (em !== undefined) {
        this.emblem.position.set(px + PORTRAIT / 2, py + PORTRAIT / 2);
        this.emblem.scale.set(0.55);
        drawEmblem(this.emblem, em);
        return;
      }
    }
    /*
     * ⚠ AND WHEN THERE IS NO ART AND NO EMBLEM, the plate carries a WORD rather than sitting empty.
     * An empty box reads as broken; a labelled one reads as deliberate, and it still tells the
     * player what they clicked. The word is the thing's NAME — a creature's display name, a
     * defender's proper name, a recipe's codex name — never a truncation artefact and never dots.
     */
    const t = this.take();
    t.text = plate.kind === 'word' ? plate.text : '';
    t.style.fontSize = 13;
    t.style.fill = DIM;
    t.anchor.set(0.5, 0.5);
    t.position.set(px + PORTRAIT / 2, py + PORTRAIT / 2);
  }

  private text(s: string, x: number, y: number, size: number, fill: number): void {
    const t = this.take();
    t.text = s;
    t.style.fontSize = size;
    t.style.fill = fill;
    t.anchor.set(0, 0);
    t.position.set(x, y);
  }

  private textCentred(s: string, cx: number, y: number, size: number, fill: number): void {
    const t = this.take();
    t.text = s;
    t.style.fontSize = size;
    t.style.fill = fill;
    t.anchor.set(0.5, 0);
    t.position.set(cx, y);
  }

  private textRight(s: string, x: number, y: number, size: number, fill: number): void {
    const t = this.take();
    t.text = s;
    t.style.fontSize = size;
    t.style.fill = fill;
    t.anchor.set(1, 0);
    t.position.set(x, y);
  }

  /** Pooled, like every other overlay here — a Text per frame would churn the GPU. */
  private take(): Text {
    let t = this.labels[this.used];
    if (t === undefined) {
      t = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: INK }) });
      this.labels.push(t);
      this.container.addChild(t);
    }
    this.used++;
    t.visible = true;
    return t;
  }

  private reset(): void {
    this.g.clear();
    this.emblem.clear();
    this.glyphs.clear();
    /*
     * ⛔ `Graphics.clear()` DOES NOT REMOVE CHILDREN, and `drawEmblem` adds one every call. Both
     * emblem surfaces therefore need their children destroyed, not just cleared — otherwise the pile
     * grows every frame a card is open and the oldest copies keep rendering.
     */
    this.buildGlyphG.clear();
    for (const c of this.buildGlyphG.removeChildren()) c.destroy({ children: true });
    for (const c of this.emblem.removeChildren()) c.destroy({ children: true });
    this.slots = [];
    this.portrait.visible = false;
    for (const t of this.labels) t.visible = false;
    this.used = 0;
  }

  getUiPoints(): {
    selected: SheetTarget | null;
    title: string;
    subtitle: string;
    health: { cur: number; max: number; frozen: boolean } | null;
    stats: { label: string; points: number; derived: string | null }[];
    owned: string | null;
    hasActions: boolean;
    /**
     * ⭐⭐ S181 — THE ACTION BUTTONS' LIVE GEOMETRY, and it is not decoration: it is the e2e seam the
     * retired popover used to provide through `structurePanel.getUiPoints`. `feed-tower.spec.ts`
     * drives a real FEED click through these coordinates, so removing the popover without exposing
     * them here would have deleted that lane's coverage rather than moving it.
     *
     * ⛔ REPORTED FROM THE SLOTS AS DRAWN, never re-laid-out. `castlePanel.rowsTop`'s docblock
     * records the bug the other way round: rows DREW at one y while `getUiPoints` reported another,
     * so every e2e click landed on empty plate while a screenshot looked perfect.
     */
    actions: {
      kind: string; sparkType?: number; label: string; caption: string; enabled: boolean;
      x: number; y: number; w: number; h: number;
    }[];
  } {
    return {
      selected: this.selected,
      title: this.view?.title ?? '',
      subtitle: this.view?.subtitle ?? '',
      health: this.view === null ? null : { ...this.view.health },
      stats: (this.view?.stats ?? []).map((r) => ({ ...r })),
      owned: this.view?.owned?.name ?? null,
      hasActions: this.view?.actions != null,
      actions: this.slots.map((b) => ({ ...b })),
    };
  }

  /**
   * ⭐ S181 — the ENABLED action under (x, y), or null.
   *
   * ⚠ DISABLED BUTTONS ARE DELIBERATELY IGNORED HERE, exactly as `StructurePanel.buttonAt` ignores
   * them: they explain, they do not act. `isOverAnyAction` is the separate question the refused-click
   * cue asks, so a player who clicks an unaffordable FIX hears the refusal rather than silence —
   * owner S152: *"so we know when we have clicked something and it simply didn't work"*.
   */
  actionAt(x: number, y: number): { kind: string; sparkType?: number } | null {
    for (const b of this.slots) {
      if (!b.enabled) continue;
      if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
      return b.sparkType === undefined ? { kind: b.kind } : { kind: b.kind, sparkType: b.sparkType };
    }
    return null;
  }

  /** True over ANY action button, enabled or not — the refused-click cue's question. */
  isOverAnyAction(x: number, y: number): boolean {
    return this.slots.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }

  /**
   * The spawner a FEED click must name.
   *
   * ⛔ READ OFF THE VIEW, NEVER RE-LOOKED-UP. `main.ts` records the reason at the FEED dispatch: the
   * model already resolved primitive → spawner when it decided to SHOW the row, and re-deriving it
   * at click time could resolve differently on a frame where the tower is mid-collapse — offering a
   * row for one tower and feeding another.
   */
  actionFeedSpawnerId(): SpawnerId | null {
    return this.view?.actions?.feedSpawnerId ?? null;
  }

  /** The primitive the action row belongs to, for the FIX / SCRAP intents. */
  actionPrimitiveId(): PrimitiveId | null {
    return this.view?.actions?.primitiveId ?? null;
  }

  bringToFront(): void {
    this.container.parent?.addChild(this.container);
  }

  clear(): void {
    this.selected = null;
    this.view = null;
    this.reset();
    this.container.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

export { SHEET_W };
