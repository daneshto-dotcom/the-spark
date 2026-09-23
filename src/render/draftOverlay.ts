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
 * bigger"*) and 559 wide (*"about twice longer"*), centred on `SPAWNER_CENTER`. Every number below
 * is computed from the constants, so if the quarry ever moves or resizes the panel follows it.
 *
 * ## ⭐ S188 — THE RIGHT-HAND TILE IS LIVE WHEN ITS MECHANIC IS, AND DEAD WHEN IT IS NOT
 *
 * S187 shipped the right tile dead, on his instruction:
 *
 * > *"for now just have only on the left side the general upgrades, and on the right side no upgrade
 * > and just like coming soon or something, and it's not choosable."*
 *
 * S188 builds the level-0 and level-5 mechanics, and the tile now follows
 * `draftOptionsFor(wave, race).racial` — nothing else decides it:
 *
 *   - **a perk id** → CHOOSABLE. It joins the hit-test (`draftHitTest` returns `'racial'`), gets the
 *     hover highlight and a detail panel from `RACIAL_PERK_COPY`, draws its card, and a click sends
 *     `onPick('racial')`.
 *   - **null** → the S187 COMING SOON tile, unchanged: dimmed, race-tinted so it still reads as
 *     *theirs*, a `?` mark, and **absent from the hit-test** — a click there does nothing rather
 *     than silently picking the general option. That state is not a leftover: it is the answer at
 *     levels 10+ for every race, and for any level-0/5 perk whose branch has not landed
 *     (`RACIAL_PERK_BUILT` false).
 *
 * ⛔ The hit-test and the renderer read the SAME options object — `draftHitTest(x, y, opts)` takes
 * it as data — so a tile cannot be drawn live and hit-tested dead, or the reverse.
 *
 * ## ⭐ S188 — THE CARDS (`assets-source/upgrade-cards/MANIFEST.md`)
 *
 * Every tile that has a card draws it: the general tile `general-<axis>`, the racial tile
 * `RACIAL_PERK_COPY[perk].card`. They are fetched LAZILY through Pixi `Assets` from
 * `public/art/upgrade-cards/`, so a slow or missing card never blocks the panel — until it arrives
 * (or if it never does) the tile draws its text title exactly as S187 did.
 *
 * ⛔ **A TILE THAT SHOWS ITS CARD DOES NOT DRAW THE OVERLAY'S OWN TITLE.** The card carries its name
 * in baked lettering, and the two collide — the manifest's "one wiring decision". The effect line
 * (`+10% HEALTH`) and the hover detail stay in both states; only the NAME is duplicated.
 *
 * ⛔ **`drawAxisGlyph` IS DELETED, NOT DORMANT.** The owner rejected the vector emblems it painted —
 * *"just a hand drawn heart that looks gay"* — and a dead painter that still compiles is exactly the
 * kind of thing a later session re-enables by accident. `draftOverlay.test.ts` asserts it is gone.
 *
 * ## ⛔ EVERY FILL HERE IS ENUMERATED, AND S182 IS THE REASON
 *
 * That session shipped a live bug under a green source-text tripwire: the guard proved a line
 * EXISTED but could not prove the failing path REACHED it. The fix it found — counting the fill
 * calls mechanically and pairing each with its hit-test — is what `draftOverlay.test.ts` does to
 * this file. A new opaque plate fails that test until someone hit-tests it or declares it
 * decorative. A card SPRITE is not a fill; the stencil that rounds its corners is, and is listed.
 *
 * RENDER-ONLY. This module reads `World` and never mutates it; a pick leaves through `onPick`, which
 * the caller turns into the host-authoritative choice.
 */

import {
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type FederatedPointerEvent,
  type Texture,
} from 'pixi.js';
import {
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  PHYSICS_HZ,
} from '../constants.ts';
import { RACE_COLORS, type RaceId } from '../state/races.ts';
import { DRAFT_BUFF_PCT, type DraftPick, type GeneralPick } from '../state/draft.ts';
import { draftOptionsFor, draftTicksRemaining, seatMustStillPick } from '../state/draftEvent.ts';
import { RACIAL_PERK_COPY } from '../state/racialPerks.ts';
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
/** The tile's corner radius — the plate, the frame and the card stencil all use it. */
const CORNER = 9;

const PLATE_BG = 0x10131c;
const PLATE_EDGE = 0xd8b45a;
const TILE_BG = 0x1b2030;
const TILE_HOVER = 0x27304a;
const INK = 0xf2efe6;
const DIM = 0x7d8596;
/**
 * A card that is not under the cursor is drawn a touch darker, so the hovered one visibly lifts.
 * ⚠ MINE, not the owner's — a legibility choice, not a ruling.
 */
const CARD_IDLE_TINT = 0xd2d2d2;

/* ── the four general options, in the player's words rather than the code's ───────────────────── */

interface OptionCopy {
  readonly title: string;
  readonly line: string;
  readonly detail: string;
  /** Basename of the card under `public/art/upgrade-cards/` — the same shape as `RacialPerkCopy.card`. */
  readonly card: string;
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
    card: 'general-hp',
  },
  def: {
    title: 'ARMOURED',
    line: `+${DRAFT_BUFF_PCT}% DEFENCE`,
    detail:
      `Every unit you spawn from now on takes ${DRAFT_BUFF_PCT}% longer to kill. ` +
      'Units already on the board keep what they were born with.',
    card: 'general-def',
  },
  atk: {
    title: 'STRONGER',
    line: `+${DRAFT_BUFF_PCT}% ATTACK`,
    detail:
      `Every unit you spawn from now on hits ${DRAFT_BUFF_PCT}% harder. ` +
      'Units already on the board keep what they were born with.',
    card: 'general-atk',
  },
  pen: {
    title: 'PIERCING',
    line: `+${DRAFT_BUFF_PCT}% PENETRATION`,
    detail:
      `Every unit you spawn from now on cuts ${DRAFT_BUFF_PCT}% deeper through armour. ` +
      'Units already on the board keep what they were born with.',
    card: 'general-pen',
  },
};

/** What a seat is offered — exactly `draftOptionsFor`'s shape, so the panel cannot drift from it. */
export type DraftOptions = ReturnType<typeof draftOptionsFor>;
/** The two tiles. */
export type DraftTile = 'general' | 'racial';

/** Where the shipped cards live (`scripts/build-upgrade-cards.py` writes them). */
export const UPGRADE_CARD_DIR = '/art/upgrade-cards';

/** The URL of a card, from its basename (`general-hp`, `l0-vampires`, …). */
export function upgradeCardUrl(card: string): string {
  return `${UPGRADE_CARD_DIR}/${card}.webp`;
}

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

/** The right tile's rectangle. Hit-tested only while a racial perk is on offer. */
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
 * Which tile, if any, a point lands on — given the options the panel is DRAWING.
 *
 * ⛔ The racial tile answers ONLY while `opts.racial` is a perk. When it is null the tile is the
 * COMING SOON plate his S187 instruction asked for (*"not choosable"*), and the honest way to
 * implement that is for the hit-test not to know it exists. Returning `'racial'` and then ignoring
 * it downstream is how a dead option becomes a live bug.
 */
export function draftHitTest(x: number, y: number, opts: DraftOptions): DraftTile | null {
  if (inside(generalTileRect(), x, y)) return 'general';
  if (opts.racial !== null && inside(racialTileRect(), x, y)) return 'racial';
  return null;
}

/**
 * The pick a click on `tile` sends. The general tile sends this wave's axis; the racial tile sends
 * the literal `'racial'` (the race and the draft index name the perk — `racialPerks.ts`), and only
 * while one is on offer. Belt and braces with `draftHitTest`: the host refuses an un-offered pick
 * too (`pickIsOffered`), but a panel that never sends one is the first line.
 */
export function pickForTile(tile: DraftTile | null, opts: DraftOptions): DraftPick | null {
  if (tile === 'general') return opts.general;
  if (tile === 'racial' && opts.racial !== null) return 'racial';
  return null;
}

/** What one tile shows. Pure — the class below applies it; the test reads it. */
export interface DraftTileView {
  /** In the hit-test, hoverable, sends a pick. */
  readonly choosable: boolean;
  /** Card basename, or null for a tile that has no card (the COMING SOON tile). */
  readonly card: string | null;
  readonly title: string;
  readonly line: string;
  /** The hover detail panel's text, or null for a tile that must promise nothing. */
  readonly detail: string | null;
}

/**
 * ⭐ THE TWO TILES, FROM THE OPTIONS ALONE.
 *
 * ⛔ **THE RACIAL TILE'S CARD COMES ONLY FROM `opts.racial`.** S187 found, by looking at the running
 * game, that the first cut drew the GENERAL option's emblem on the dead tile — which reads as "this
 * option gives you the same thing", the opposite of true. Deriving each tile's art from its own
 * option, and nothing else, is what makes that impossible here; the test pins it.
 */
export function draftTileViews(opts: DraftOptions): { readonly general: DraftTileView; readonly racial: DraftTileView } {
  const g = COPY[opts.general];
  const general: DraftTileView = { choosable: true, card: g.card, title: g.title, line: g.line, detail: g.detail };
  if (opts.racial === null) {
    return {
      general,
      racial: { choosable: false, card: null, title: 'YOUR RACE', line: 'COMING SOON', detail: null },
    };
  }
  const r = RACIAL_PERK_COPY[opts.racial];
  return {
    general,
    racial: { choosable: true, card: r.card, title: r.title, line: r.line, detail: r.detail },
  };
}

/**
 * ⛔ THE MANIFEST'S ONE WIRING DECISION: a tile whose card is ON SCREEN does not draw the overlay's
 * own title (the baked lettering and the text collide). A tile with no card — or whose card has not
 * arrived, or failed — keeps the text title, so the name is always shown exactly once.
 */
export function drawsOwnTitle(view: DraftTileView, cardShown: boolean): boolean {
  return !(view.card !== null && cardShown);
}

/**
 * Cover-fit a card into a tile, anchored to the TOP. Every card carries its name in the top band,
 * so any crop is spent on the bottom edge, never on the lettering (the shipped cards are already
 * the tile's ratio at 2×; this keeps a mis-sized one from shaving the title).
 */
export function coverFitTop(
  texW: number,
  texH: number,
  r: { x: number; y: number; w: number; h: number },
): { x: number; y: number; scale: number } {
  const scale = Math.max(r.w / texW, r.h / texH);
  return { x: r.x + (r.w - texW * scale) / 2, y: r.y, scale };
}

/** Shrink a line to `maxW` if it would overflow its tile. Never grows it. */
function fitWidth(t: Text, maxW: number): void {
  t.scale.set(1);
  if (t.width > maxW) t.scale.set(maxW / t.width);
}

/**
 * The rounded-corner STENCIL a card is clipped to, so a rectangular sprite does not poke past the
 * tile's corners. A Pixi mask is never drawn as a surface — it covers nothing and swallows nothing.
 */
function cardStencil(r: { x: number; y: number; w: number; h: number }): Graphics {
  return new Graphics().roundRect(r.x, r.y, r.w, r.h, CORNER).fill({ color: 0xffffff });
}

/** Seams the tests use. Production passes neither. */
export interface DraftOverlayDeps {
  /**
   * Where the offer comes from. Production: `draftOptionsFor`. A test injects an offered perk here,
   * because on a branch every `RACIAL_PERK_BUILT` entry may still be false — the choosable state
   * must be testable without flipping somebody else's registry.
   */
  readonly optionsFor?: (waveNumber: number, race: RaceId) => DraftOptions;
  /** How a card texture is fetched. Production: Pixi `Assets`, which caches by URL. */
  readonly loadCard?: (url: string) => Promise<Texture>;
}

type CardState = Texture | 'loading' | 'failed';

export class DraftOverlay {
  readonly container = new Container();
  private readonly plate = new Graphics();
  private readonly tiles = new Graphics();
  /** The card art. A sprite each, clipped to its tile by a stencil. */
  private readonly generalCard = new Sprite();
  private readonly racialCard = new Sprite();
  /** The tile outlines, drawn ABOVE the cards so the hover highlight shows on the art. Strokes only. */
  private readonly frames = new Graphics();
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
  private hover: DraftTile | null = null;
  /** The options last DRAWN. The pointer handlers read these, never a fresh recomputation. */
  private opts: DraftOptions | null = null;
  private readonly cards = new Map<string, CardState>();
  private readonly onPick: (p: DraftPick) => void;
  private readonly optionsFor: (waveNumber: number, race: RaceId) => DraftOptions;
  private readonly loadCard: (url: string) => Promise<Texture>;

  constructor(onPick: (p: DraftPick) => void, deps: DraftOverlayDeps = {}) {
    this.onPick = onPick;
    this.optionsFor = deps.optionsFor ?? draftOptionsFor;
    this.loadCard = deps.loadCard ?? ((url) => Assets.load<Texture>(url));
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.zIndex = 900;

    const h1 = new TextStyle({ fontFamily: ['Kanit', 'Impact', 'sans-serif'], fontWeight: '900', fontStyle: 'italic', fontSize: 22, fill: INK });
    /*
     * ⛔ SEPARATE INSTANCES, NOT ONE SHARED ONE, AND THIS WAS A REAL BUG.
     *
     * The first cut built one `h2` style and handed it to BOTH lines. `render` then set
     * `racialLine.style.fill = RACE_COLORS[race]` each frame — and because the two Texts pointed at
     * the SAME TextStyle object, that repainted the general option's headline in the race colour
     * too. Every geometry and hit-test assertion stayed green; it was visible only by looking at the
     * running game. A shared mutable style is a shared mutable object like any other. (`h1` IS
     * shared by the three titles, and that is safe only because nothing ever writes to it.)
     *
     * S188 — the dark stroke is what keeps a line legible when it sits on card art rather than on
     * the plain tile.
     */
    const lineStroke = { color: 0x05060a, width: 5, join: 'round' as const };
    const h2General = new TextStyle({ fontFamily: ['Kanit', 'Impact', 'sans-serif'], fontWeight: '900', fontStyle: 'italic', fontSize: 30, fill: INK, stroke: lineStroke });
    const h2Racial = new TextStyle({ fontFamily: ['Kanit', 'Impact', 'sans-serif'], fontWeight: '900', fontStyle: 'italic', fontSize: 30, fill: DIM, stroke: lineStroke });
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

    const generalMask = cardStencil(generalTileRect());
    const racialMask = cardStencil(racialTileRect());
    this.generalCard.mask = generalMask;
    this.racialCard.mask = racialMask;
    this.generalCard.visible = false;
    this.racialCard.visible = false;

    this.container.addChild(this.plate, this.tiles,
      this.generalCard, generalMask, this.racialCard, racialMask, this.frames,
      this.title, this.clock,
      this.generalTitle, this.generalLine, this.racialTitle, this.racialLine, this.racialMark,
      this.tipPlate, this.tip);

    this.container.on('pointermove', (e: FederatedPointerEvent) => {
      const p = e.global;
      this.hover = this.opts === null ? null : draftHitTest(p.x, p.y, this.opts);
    });
    this.container.on('pointertap', (e: FederatedPointerEvent) => {
      if (this.opts === null) return;
      const p = e.global;
      const pick = pickForTile(draftHitTest(p.x, p.y, this.opts), this.opts);
      if (pick !== null) this.onPick(pick);
    });
  }

  /**
   * The card's texture if it has ARRIVED, else null — and the first ask starts the fetch.
   *
   * ⛔ LAZY, AND A FAILURE IS FINAL AND HARMLESS. A card that 404s or fails to decode is recorded as
   * `'failed'` and the tile keeps its text title for the rest of the page session. The panel is
   * never held back waiting on art: the draft opens on the tick the match starts, and a player who
   * is already reading "TOUGHER" loses nothing if the picture is late.
   */
  private cardTexture(card: string | null): Texture | null {
    if (card === null) return null;
    const state = this.cards.get(card);
    if (state === undefined) {
      this.cards.set(card, 'loading');
      // Through a `then` so a loader that THROWS rather than rejects still lands in 'failed'.
      Promise.resolve().then(() => this.loadCard(upgradeCardUrl(card))).then(
        (t) => { this.cards.set(card, t); },
        () => { this.cards.set(card, 'failed'); },
      );
      return null;
    }
    return typeof state === 'string' ? null : state;
  }

  /** Put a card on its tile, or take it off. Returns whether it is on screen. */
  private placeCard(
    sprite: Sprite,
    tex: Texture | null,
    r: { x: number; y: number; w: number; h: number },
    lit: boolean,
  ): boolean {
    if (tex === null) {
      sprite.visible = false;
      return false;
    }
    sprite.texture = tex;
    const fit = coverFitTop(tex.width, tex.height, r);
    sprite.position.set(fit.x, fit.y);
    sprite.scale.set(fit.scale);
    sprite.tint = lit ? 0xffffff : CARD_IDLE_TINT;
    sprite.visible = true;
    return true;
  }

  private hide(): void {
    this.container.visible = false;
    this.opts = null;
    this.hover = null;
  }

  /**
   * Draw one frame.
   *
   * ⚠ Reads `world.draft` every frame rather than latching on an edge. A one-shot show/hide would be
   * lost to a joiner who arrives mid-BUILD with the panel already open — the same reason this
   * codebase derives per-strike visuals from synced state instead of pushing `world.effects`.
   */
  render(world: World, localSeat: PlayerId | null): void {
    const ev = world.draft;
    // PLAYING only: the draft is match state, and on any other screen the local race is not real.
    if (ev === null || localSeat === null || world.gameState !== 'PLAYING') {
      this.hide();
      return;
    }
    const pl = world.players.get(localSeat);
    // The panel is for a seat that still owes a pick. One that has chosen watches the board.
    if (pl === undefined || !seatMustStillPick(world, localSeat, ev.waveNumber)) {
      this.hide();
      return;
    }
    this.container.visible = true;

    const race = pl.raceId;
    const opts = this.optionsFor(ev.waveNumber, race);
    this.opts = opts;
    // A hover left over from a tile that is no longer choosable must not light it up.
    if (pickForTile(this.hover, opts) === null) this.hover = null;
    const views = draftTileViews(opts);

    const g = generalTileRect();
    const r = racialTileRect();
    const liveRacial = views.racial.choosable;

    this.plate.clear();
    this.plate
      .roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12)
      .fill({ color: PLATE_BG, alpha: 0.97 })
      .stroke({ color: PLATE_EDGE, width: 2, alpha: 0.9 });

    this.tiles.clear();
    this.tiles
      .roundRect(g.x, g.y, g.w, g.h, CORNER)
      .fill({ color: this.hover === 'general' ? TILE_HOVER : TILE_BG, alpha: 1 });
    // The racial tile: a full plate when its perk is on offer; the dimmed dead tile when it is not.
    this.tiles
      .roundRect(r.x, r.y, r.w, r.h, CORNER)
      .fill({ color: this.hover === 'racial' ? TILE_HOVER : TILE_BG, alpha: liveRacial ? 1 : 0.55 });

    const generalShown = this.placeCard(this.generalCard, this.cardTexture(views.general.card), g,
      this.hover === 'general');
    const racialShown = this.placeCard(this.racialCard, this.cardTexture(views.racial.card), r,
      this.hover === 'racial');

    this.frames.clear();
    this.frames
      .roundRect(g.x, g.y, g.w, g.h, CORNER)
      .stroke({ color: PLATE_EDGE, width: this.hover === 'general' ? 3 : 1, alpha: this.hover === 'general' ? 1 : 0.8 });
    this.frames
      .roundRect(r.x, r.y, r.w, r.h, CORNER)
      .stroke(liveRacial
        ? { color: RACE_COLORS[race], width: this.hover === 'racial' ? 3 : 1, alpha: this.hover === 'racial' ? 1 : 0.8 }
        : { color: RACE_COLORS[race], width: 1, alpha: 0.35 });

    this.title.x = PANEL_X + PANEL_W / 2 - this.title.width / 2;
    this.title.y = PANEL_Y - 34;
    this.clock.text = formatDraftClock(draftTicksRemaining(world));
    this.clock.x = PANEL_X + PANEL_W - this.clock.width - 4;
    this.clock.y = PANEL_Y - 30;

    this.layoutText(this.generalTitle, this.generalLine, views.general, generalShown, g);
    this.layoutText(this.racialTitle, this.racialLine, views.racial, racialShown, r);
    this.racialTitle.alpha = liveRacial ? 1 : 0.5;
    this.racialLine.alpha = liveRacial ? 1 : 0.5;
    this.racialLine.style.fill = RACE_COLORS[race];

    /*
     * ⛔ THE DEAD TILE GETS A QUESTION MARK, NEVER ANOTHER OPTION'S ART. The first cut drew the
     * general's emblem on both sides at low alpha, which reads as "this option gives you the same
     * thing" — the opposite of true. A '?' says "something, not yet decided", which is what it is.
     * A LIVE racial tile has its own card and needs no mark.
     */
    this.racialMark.visible = !liveRacial;
    this.racialMark.x = r.x + r.w / 2 - this.racialMark.width / 2;
    this.racialMark.y = r.y + r.h * 0.66 - this.racialMark.height / 2;
    this.racialMark.style.fill = RACE_COLORS[race];

    // The hover panel. Only a CHOOSABLE tile has one; hovering the dead tile must not promise anything.
    const hovered = this.hover === 'general' ? views.general : this.hover === 'racial' ? views.racial : null;
    const detail = hovered?.detail ?? null;
    this.tip.text = detail ?? '';
    this.tipPlate.clear();
    if (detail !== null) {
      this.tip.x = PANEL_X + 20;
      this.tip.y = PANEL_Y + PANEL_H + 14;
      this.tipPlate
        .roundRect(PANEL_X, PANEL_Y + PANEL_H + 6, PANEL_W, this.tip.height + 16, 8)
        .fill({ color: PLATE_BG, alpha: 0.95 })
        .stroke({ color: PLATE_EDGE, width: 1, alpha: 0.6 });
    }
  }

  /**
   * A tile's two lines. With its card on screen the card IS the title, so the overlay's own title is
   * hidden and the effect line moves to the bottom band, clear of the baked lettering. Without a
   * card both sit top-left, exactly as S187 laid them out.
   */
  private layoutText(
    title: Text,
    line: Text,
    view: DraftTileView,
    cardShown: boolean,
    r: { x: number; y: number; w: number; h: number },
  ): void {
    title.text = view.title;
    line.text = view.line;
    fitWidth(title, r.w - 32);
    fitWidth(line, r.w - 24);
    title.visible = drawsOwnTitle(view, cardShown);
    title.x = r.x + 16;
    title.y = r.y + 18;
    if (cardShown) {
      line.x = r.x + (r.w - line.width) / 2;
      line.y = r.y + r.h - line.height - 8;
    } else {
      line.x = r.x + 16;
      line.y = r.y + 48;
    }
  }
}
