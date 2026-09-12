/**
 * SPARK — Unified CODEX overlay. S104 P3 merged the old godly codexOverlay + the separate
 * comboCodexOverlay into ONE in-game reference with three tabs; S173 P5 cut it back to TWO:
 *
 *   ◆ COMBOS            — the Magic-14 two-shape connections. Unlock = discovered in play.
 *   🏰 TOWERS & STRUCTURES — everything that stays on the field: Voltkin, the pentagram spawner, the
 *                            laser turret, HELGA, the stink/goblin towers, the six race towers and
 *                            the six boss towers. Unlock = you built one (S104 unlock-on-build), or
 *                            in Voltkin's case that his cinematic fired.
 *
 * ⭐ S173 P5 — THE GODLY COMBOS TAB IS GONE, AND SO IS NONET.
 *
 * Owner: *"I already told you to remove the godly combos because [Voltkin] is no more godly as
 * anything else. It's just a tower now and structure… So, yeah, remove the whole godly combos."*
 * And on the synthetic NONET card that rode in the same tab: *"no [NONET] be anywhere in the codex.
 * Easter egg."*
 *
 * ⚠ THE HALF OF THAT DELETION THAT IS EASY TO GET WRONG: `kind: 'cinematic'` has exactly ONE member
 * in the whole registry — Voltkin — and the GODLY tab was the only thing listing it. Deleting the
 * tab while leaving main.ts's `spawner | defender` filter in place would have dropped a LIVE
 * BUILDABLE out of the codex entirely, which is a bigger change than the owner asked for and the
 * opposite of his own sentence ("it's just a tower now"). main.ts therefore feeds `listRecipes()`
 * WHOLE into `towers`, so he is a card among the towers. NONET is not in that list because it never
 * was a recipe — it was a synthetic entry built by a `nonetEntry()` helper, and that helper is
 * deleted rather than relocated.
 *
 * ⚠ AND THE TAB'S ORDER IS NOT A DESIGNED ORDER — I checked, having first written the opposite.
 * `listRecipes()` is `Array.from(REGISTRY.values())`, i.e. the order `registerRecipe` was CALLED,
 * which is module-EVALUATION order and not registerAll.ts's import list: several recipe modules are
 * pulled in earlier by other main.ts imports. MEASURED in the running game, the shipped sequence is
 * pentagram, lightning hub, goblin tower, the six race towers, the six boss towers, VOLTKIN, laser
 * turret, HELGA, stink tower — Voltkin is the sixteenth card, on row four of five. He is reachable,
 * which is what the owner's ruling requires, but nobody chose that position. If a deliberate order
 * is ever wanted it belongs at the main.ts call site as an explicit sort, not as a hope about
 * import order.
 *
 * Each entry shows WHAT it is + HOW TO BUILD it (the recipe). Entries are LOCKED until unlocked at
 * least once (the brother-surprise convention, PRIME-AUDIT-S21 #4) — locked tiles read "???".
 *
 * Opened from the title-screen CODEX button AND in-game via the G+C key chord (main.ts owns the
 * chord; this is a pure-UI overlay that dispatches NOTHING to the sim). LAZY-loaded by main.ts on
 * first open (the botSetupOverlay pattern) so its Pixi weight stays off the index/entry chunk; each
 * tab's Pixi tree is built on first switch (not both on open) to avoid a first-open hitch.
 *
 * Unlock state is read live each open: towers from codexStore (localStorage
 * `spark:codex:unlocked:v1`, keyed by GodlyId); combos from comboCodexStore
 * (`spark:combos:discovered:v1`). All render-layer / localStorage — never touches the sim.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, SPARK_COLORS, SparkType } from '../constants.ts';
import type { GodlyId, GodlyRecipe } from '../state/godlyRecipes/types.ts';
import { loadUnlockedSet } from './codexStore.ts';
import { SHAPE_GLYPHS } from './shapes.ts';
import { MAGIC_COMBO_KEYS, isOrderSymmetric, type ComboKey } from '../combos.ts';
import { loadDiscoveredCombos, magicComboCatalog } from './comboCodexStore.ts';
import { codexCopyFor, drawEmblem, type EmblemSpec } from './codexPresentation.ts';
/*
 * ⭐ S174 (a) — THE RECIPE DIAGRAM FOR THE TWO ENTRIES AN `EmblemSpec` CANNOT DESCRIBE.
 *
 * Owner: *"Helga has reverted back to the state where you can see the actual Helga, but you should
 * see only the STRUCTURE of the building, like the connectors, how it looks. Also for Voltkin."*
 *
 * This is the renderer the castle panel's build tiles already use — the SHIPPED geometry out of
 * `blueprints.ts`, the same nodes and bonds the build stamps — not a second diagram system written
 * for the codex. `blueprintGlyph.ts`'s own docblock argued the case years before this priority
 * needed it: an emblem is "an idealised logo… not the real stamped layout", and voltkin and helga
 * had no emblem at all.
 */
import { blueprintFitScaleBox, drawBlueprintShape } from './blueprintGlyph.ts';
import { fitTextToBox, fitTextToWidth } from './textFit.ts';
// ⭐ S173 P5 — THE SAME DRAW CALL THE BOARD USES. See `syncComboPreview` for why this import, and
// not a hand-drawn approximation, is the whole point of the combo preview.
import { drawBondVisual } from './bondVisualRenderer.ts';
// S87 P4 — re-export so godlyOrchestration (eager) can unlock without importing this heavy overlay.
export { unlockGodly } from './codexStore.ts';

const GOLD = 0xffd60a;
const LOCKED_STROKE = 0x3a3a44;
const LOCKED_SIL = 0x53536a;

// S121 P4 — tile anatomy (was 220×230 with the recipe text starting at y=178: every hint longer than
// ~3 lines escaped the box — the owner's "text coming out of the boxes"). The tile is now sized so the
// LONGEST budgeted copy (codexPresentation.test.ts caps recipe at 150 chars) fits at full fontSize,
// with fitTextToBox as the structural overflow guard:
//   name 30 · art/emblem center 116 · power epigraph 200 · divider 216 · recipe zone 226..308.
const TILE_W = 240;
const TILE_H = 320;
const TILE_GAP = 28;
const GRID_TOP = 235;
const ART_CY = 116;
const POWER_Y = 200;
const RECIPE_Y = 226;
/*
 * ⭐ S174 (a) — THE ART ZONE, AS A BOX, because a blueprint diagram has an aspect ratio and an
 * emblem does not. Exported so `codexOverlay.test.ts` binds to these rather than mirroring them.
 *
 * ⚠ MEASURED AGAINST THE TILE'S OWN ANATOMY, not chosen. Horizontally: `TILE_W - 28` leaves the
 * same 14 px gutter the recipe text block uses. Vertically: the zone is ART_CY ± 56, i.e. 60…172 —
 * clear of the name (fontSize 20 anchored at y=30, so it ends at 40) and of the power epigraph
 * (fontSize 13 anchored at POWER_Y, so it starts at ~193). The emblem family's radii top out at 48
 * (pinned by codexPresentation.test.ts), so a blueprint fitted to this box reads at the same weight
 * as the seventeen cards beside it rather than as a bigger or smaller kind of picture.
 */
export const ART_HALF_W = (TILE_W - 28) / 2;
export const ART_HALF_H = 56;
/*
 * ⭐ S173 P5 — THE GRID METRICS ARE EXPORTED so `codexOverlay.test.ts` BINDS to them rather than
 * mirroring them. This file's own history is the argument (see codexPresentation.test.ts, S140): a
 * test that hardcodes a layout number has to be hand-bumped by whoever changes the layout — the same
 * person who would have forgotten — and bumping it is indistinguishable from fixing it.
 */
export const TOWER_COLS = 4;
export const COMBO_COLS = 5;
export const TOWER_TILE_H = TILE_H;
export const TOWER_TILE_GAP = TILE_GAP;

/*
 * ⭐ S173 P5 — COMBO TILE ANATOMY, RESIZED FOR THE LIVE CONNECTOR.
 *
 * Owner: *"you're showing what shapes you need to make this vortex, but they don't show what this
 * vortex IS, how it looks… the vortex, I think, spins or something, or a warped anchor — it's like
 * a spiral that's moving and spiraling around. So maybe make those clickable, so when you mouse
 * over each of those combos you can see how it would look. Just the connector itself."*
 *
 * ⚠ THE TILE HAD TO GROW, 132 → 168, AND THIS IS THE MEASUREMENT. The ornamented silhouettes —
 * wheel, lattice, diamond — draw a ring or a rhombus of radius len/2 around the bond's midpoint, so
 * a connector spanning the two glyphs reaches COMBO_SPAN/2 = 42 px ABOVE and BELOW the glyph row.
 * At the old anatomy (name at y=36, glyphs at y=88, tile 132 tall) that band runs 46…130, i.e.
 * straight through the name and out of the bottom of the card. The row moved to y=96 and the tile to
 * 168 so the band lands at 54…138, clear of the name (bottom ~40) and of the lock line (top ~146).
 *
 * ⚠ AND THE GRID STILL DOES NOT SCROLL, which is the constraint from part (b): 14 entries at 5
 * columns is 3 rows, 235 + 3*168 + 2*24 + 24 pad = 811 against a viewport floor of 1036. Owner:
 * *"Combos, they're all fine. You can see all of them."* A test pins that.
 */
export const COMBO_TILE_W = 224;
export const COMBO_TILE_H = 168;
export const COMBO_TILE_GAP = 24;
const COMBO_NAME_Y = 30;
export const COMBO_ROW_Y = 96;
/** Glyph-to-glyph distance: the preview connector's length, and the ornaments' diameter. */
export const COMBO_SPAN = 84;

/**
 * ⛔⛔ THE VORTEX DOES NOT OBEY THE RULE THE TILE WAS SIZED FOR, AND A TEST CAUGHT IT.
 *
 * Everything above reasons about the ornamented silhouettes — wheel, lattice, diamond — which draw
 * radius `len/2` about the bond's MIDPOINT. `drawVortex` does neither half of that:
 *
 *     const r = t * len;                                     // …to the FULL length, not half it
 *     { x: p.ax + Math.cos(a) * r, y: p.ay + Math.sin(a) * r } // …about ENDPOINT A, not the midpoint
 *
 * So at `COMBO_SPAN = 84` it sweeps a disc of radius 84 centred on the LEFT glyph: vertically
 * 96 ± 84, i.e. **12 … 180** on a card whose name ends at 40 and whose lock line starts at 146. It
 * burst out of BOTH ends at once.
 *
 * ⚠ AND GROWING THE CARD CANNOT FIX IT — that was the tempting move, because the tile had already
 * grown once (132 → 168) for exactly this class of problem. It fixes only the bottom. The top
 * breach (y=12 against a name ending at 40) is above the card's own title no matter how tall the
 * card gets, because the vortex radiates from a point that does not move.
 *
 * ⛔ AND THE ONE FIX THAT MUST NOT BE MADE: changing `drawVortex`. It is the REAL renderer, shared
 * with the board — the spiral running from A out to B's distance is what a vortex IS in this game.
 * Editing gameplay visuals so a thumbnail fits would be the tail wagging the dog.
 *
 * ⇒ So the PREVIEW hands it a shorter bond. `96 − r > 40` and `96 + r < 146` give `r < 50`; 44
 * leaves margin at both ends and lands the swirl at a radius close to the 42 the ornamented family
 * already draws, so the card reads as one set. The connector no longer reaches the two glyphs — an
 * accepted cost, because the owner asked to see *"just the connector itself"*, how it LOOKS, and
 * the shape and its motion are both preserved.
 */
const RADIAL_ABOUT_A_SPAN = 44;

/**
 * The preview bond length for one effect. One entry, not a table, because exactly one of the
 * fourteen radiates about an endpoint — and the per-effect fit test walks all fourteen, so a
 * second offender announces itself rather than needing to be predicted here.
 */
export function previewSpanFor(visualEffectId: string): number {
  return visualEffectId === 'fx.vortex' ? RADIAL_ABOUT_A_SPAN : COMBO_SPAN;
}

/** Matches dragPreviewRenderer's PREVIEW_BOND_WIDTH — the same silhouette at the same weight. */
const PREVIEW_BOND_WIDTH = 4;
/*
 * ⚠ THE PREVIEW CLOCK RUNS AT 3×, AND THIS NUMBER IS MINE, NOT THE OWNER'S.
 *
 * The silhouettes animate off `p.tick`, and their phase constants are tuned for a bond you live
 * beside for a whole match, not for a card you hover for two seconds. MEASURED FROM THE SOURCE:
 * `drawVortex` advances its phase by `tick * 0.0035`, so one revolution is 1795 ticks — **30
 * seconds** at one tick per frame. The vortex is the exact combo the owner named as the thing he
 * wants to watch spin, and at 1× a hover shows him a still picture of it.
 *
 * 3× puts the vortex at 10 s per revolution (clearly turning), the warped anchor's ring at 4.4 s,
 * and the wheel's spokes at 0.58 s per quarter-turn. 6× was considered and rejected on the other
 * end of the range: it puts `drawFilament`'s shimmer (`tick * 0.04`, 2.6 s at 1×) at 0.44 s, which
 * is a flicker rather than a shimmer.
 *
 * ⛔ WHAT THIS DOES **NOT** DO IS CHANGE THE SHAPE. The preview calls the shipped `drawBondVisual`,
 * so the geometry cannot drift from the board by construction; only the clock driving it differs,
 * and it differs for a stated reason. A hand-drawn "preview" that looked right today and diverged
 * on the next silhouette retune would be worse than no preview at all.
 */
export const PREVIEW_TICK_RATE = 3;

/*
 * ⭐ S173 P5 — THE SCROLL VIEWPORT.
 *
 * Owner: *"the towers and structures… it's not scrollable. I can't scroll down and keep seeing all
 * the towers, which is bad. Make it so the user can actually go there and scroll down."*
 *
 * ⚠ MEASURED, NOT ESTIMATED. TOWERS & STRUCTURES lists 19 entries at 4 columns = 5 rows; a row is
 * TILE_H + TILE_GAP = 348 tall and the grid starts at GRID_TOP = 235, so its last pixel sits at
 * y = 1947 on a 1080-tall canvas (1971 once the bottom pad is counted, against a viewport floor of
 * 1036 — 935 px of travel). **More than half the tab could not be reached**, and the one row
 * that was partly visible ran under the footer line — which is exactly what the owner's screenshot
 * showed. COMBOS is 14 entries at 5 columns = 3 rows ending at y = 679, wholly inside the viewport,
 * which is why he said *"Combos, they're all fine. You can see all of them."*
 *
 * ⭐ THE VIEWPORT IS APPLIED TO BOTH TABS ON PURPOSE — one code path, no per-tab special case, and
 * `scrollExtent` clamps to 0 when the content already fits. COMBOS therefore draws exactly what it
 * drew before: every tile of it is inside the mask, the scrollbar is not drawn, and the footer keeps
 * its original line. The mask's BOTTOM edge is the second half of the fix: it is what stops a tall
 * grid painting through the footer, rather than merely letting you reach the rows that did.
 */
const SCROLL_VIEW_TOP = 212;                   // below the subtitle (y=192), above GRID_TOP (235)
const SCROLL_VIEW_BOTTOM = CANVAS_HEIGHT - 44; // above the footer line (y=1054)
const SCROLL_VIEW_H = SCROLL_VIEW_BOTTOM - SCROLL_VIEW_TOP;
/** Breathing room under the last row so it does not end flush against the mask's hard edge. */
const SCROLL_BOTTOM_PAD = 24;
const SCROLLBAR_X = CANVAS_WIDTH - 24;
const SCROLLBAR_W = 6;
const SCROLLBAR_MIN_THUMB = 48;
/*
 * ⚠ THESE TWO NUMBERS ARE MINE, NOT THE OWNER'S, and this is the measurement behind them.
 * index.html serves the 1920×1080 canvas under `object-fit: contain`, so on a 1280-wide window one
 * DOM pixel is 1.5 canvas pixels; 1.6 keeps a wheel notch feeling like a notch across the common
 * desktop sizes rather than matching any single one exactly. Chrome sends deltaMode 0 with
 * deltaY ≈ ±100 per notch → 160 canvas px. Firefox sends deltaMode 1 with deltaY ≈ ±3 → 180 canvas
 * px at 60 px/line. A grid row is 348 px, so both land near half a row per notch.
 */
const WHEEL_PIXEL_SCALE = 1.6;
const WHEEL_LINE_PX = 60;

/** S121 P4 footer: how to reopen + the unlock convention, kept out of every tile. */
const FOOTER_BASE = 'entries reveal through play · press G+C in-game to open the codex';
/** S173 P5 — appended only when the active tab actually has somewhere to go. */
const FOOTER_SCROLL_HINT = ' · mouse wheel to scroll';

/*
 * ⭐ THE SCROLL MATH IS PURE AND EXPORTED, and `codexOverlay.test.ts` exercises it.
 *
 * ⛔ main.ts:~3527 records that *"there is no codexOverlay.test.ts, so nothing would have reported
 * it"* about a codex bug that shipped. Keeping the arithmetic out of the Pixi class is what lets
 * that sentence stop being true: the row count, the content extent, the clamp and the thumb are all
 * decidable in node, so a grid that grows past the viewport (another tower tier, say) is a number a
 * test can check rather than something a human has to notice on screen.
 */

/** Rows a grid of `count` tiles occupies at `cols` columns. The ONE place the row count is derived. */
export function gridRowCount(count: number, cols: number): number {
  if (count <= 0 || cols <= 0) return 0;
  return Math.ceil(count / cols);
}

/** The last y a grid occupies in absolute canvas coords, bottom pad included. */
export function gridContentBottom(rows: number, tileH: number, gap: number): number {
  if (rows <= 0) return SCROLL_VIEW_TOP;
  return GRID_TOP + rows * tileH + (rows - 1) * gap + SCROLL_BOTTOM_PAD;
}

/** How far the grid may travel before its last row rests on the viewport floor. 0 ⇒ it all fits. */
export function scrollExtent(contentBottom: number): number {
  return Math.max(0, contentBottom - SCROLL_VIEW_BOTTOM);
}

/**
 * One wheel event in CANVAS units. `deltaMode` is the DOM's own: 0 = pixels, 1 = lines, 2 = pages.
 * Handling all three matters — Firefox reports lines and a few setups report pages, and treating
 * either as pixels would move the grid by three pixels per notch and read as "it still doesn't
 * scroll".
 */
export function wheelScrollDelta(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * WHEEL_LINE_PX;
  if (deltaMode === 2) return deltaY * SCROLL_VIEW_H * 0.9;
  return deltaY * WHEEL_PIXEL_SCALE;
}

/** Clamp so neither end can be scrolled past — the owner asked for scrolling, not for a void. */
export function clampScroll(offset: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(max, Math.max(0, offset));
}

/**
 * Scrollbar thumb geometry, in absolute canvas coords. Length is the visible FRACTION of the
 * content (floored at SCROLLBAR_MIN_THUMB so a very long grid still shows a grabbable bar), and it
 * travels the remaining track linearly with the offset — so the bar answers "how much more is
 * there", which is the question a player who cannot see row five is actually asking.
 */
export function scrollbarThumb(offset: number, max: number): { readonly y: number; readonly h: number } {
  const contentH = SCROLL_VIEW_H + Math.max(0, max);
  const h = Math.max(SCROLLBAR_MIN_THUMB, Math.round((SCROLL_VIEW_H / contentH) * SCROLL_VIEW_H));
  const travel = Math.max(0, SCROLL_VIEW_H - h);
  const t = max <= 0 ? 0 : clampScroll(offset, max) / max;
  return { y: SCROLL_VIEW_TOP + travel * t, h };
}

export interface CodexEntry {
  readonly id: GodlyId;
  readonly displayName: string;
  /** One-line epigraph — the entry's soul; shown only when unlocked (part of the reveal). */
  readonly power: string;
  /** Precise "how to build + what it does" — visible in BOTH states (S105 P2 checkable recipes). */
  readonly recipeHint: string;
  /**
   * Recipe-constellation emblem, drawn in the board's glyph language. ABSENT is not a hole: the
   * card then draws the entry's BLUEPRINT instead (S174 (a) — helga's two-leaf-type star and
   * voltkin's chain are the two recipes an `EmblemSpec` cannot express). Either way the picture is
   * the recipe, which is the whole coherence rule.
   */
  readonly emblem?: EmblemSpec;
}

/**
 * S121 P4 — derive a CodexEntry from a GodlyRecipe via the codexPresentation copy map (the single
 * source of presentation truth).
 *
 * ⭐ S174 (a) — `characterSprite` IS GONE FROM THIS TYPE. It carried the recipe's character art
 * into the card for exactly two entries, and the owner's ruling is that those two must show their
 * structure like everything else. The art itself is untouched on the recipes — the cinematic, the
 * defender renderer and the spawner all still read `recipe.characterSprite`; the CODEX simply
 * stopped being one of its consumers.
 */
export function entryFromRecipe(recipe: GodlyRecipe): CodexEntry {
  const copy = codexCopyFor(recipe.id);
  return {
    id: recipe.id,
    displayName: copy.name,
    power: copy.power,
    recipeHint: copy.recipe,
    emblem: copy.emblem,
  };
}

/*
 * ⭐ S173 P5 — `nonetEntry()` LIVED HERE AND IS DELETED. It minted a synthetic 'nonet' CodexEntry
 * (not a recipe — no predicate, no cinematic) for the GODLY COMBOS tab. Owner: *"no [NONET] be
 * anywhere in the codex. Easter egg."* He talked himself out of even a stub card mid-sentence:
 * *"You can just go straight into [NONET]. It already explains it within [NONET], so you don't need
 * to re-explain it."* Its copy row in codexPresentation.ts went with it, and
 * codexPresentation.test.ts now asserts NOTHING in CODEX_COPY mentions nonet, so a future session
 * cannot quietly put it back.
 */

/**
 * The tabs, and the union main.ts names when it calls `open()`. Exported so the call site shares
 * THIS type rather than re-typing a string-literal union that can drift out of step with it —
 * which is exactly what happened while there were three tabs.
 */
export type CodexTabKey = 'combos' | 'towers';
interface TabDef { readonly key: CodexTabKey; readonly label: string; readonly color: number; readonly subtitle: string; }
const TABS: readonly TabDef[] = [
  { key: 'combos', label: 'COMBOS', color: 0x53d8ff, subtitle: 'the geometry itself — two shapes, one magic' },
  { key: 'towers', label: 'TOWERS & STRUCTURES', color: GOLD, subtitle: 'build them true and they fight for you' },
];

export interface CodexOverlayOpts {
  readonly towers: CodexEntry[];
}

/** S173 P5 — everything `syncComboPreview` needs to animate one combo card, captured at build time. */
interface ComboPreview {
  /** The Graphics the silhouette is redrawn into each frame (cleared first — drawBondVisual appends). */
  readonly g: Graphics;
  /** The ↔ / → glyph, hidden while the connector is showing: the preview REPLACES the abstraction. */
  readonly arrow: Text;
  readonly ax: number;
  readonly bx: number;
  readonly cy: number;
  readonly visualEffectId: string;
  readonly color: number;
  readonly discovered: boolean;
}

export class CodexOverlay {
  readonly container: Container;
  private readonly app: Application;
  private readonly towers: CodexEntry[];
  /**
   * ⭐ S173 P5 — the default tab moved off the deleted 'godly' and onto 'towers'. Both entry points
   * now agree: the title-screen CODEX button (`openCodex()`) and the in-game G+C chord
   * (`openCodex('towers')`) land on the buildables — the tab Voltkin moved into, and the one the
   * owner was reading when he reported it would not scroll. COMBOS is one click away, and is the
   * only other tab there is.
   */
  private active: CodexTabKey = 'towers';
  private readonly content: Container;
  private readonly subtitle: Text;
  private readonly footer: Text;
  // S173 P5 — the scroll viewport. `viewportMask` is a SIBLING of `content`, never a child (see
  // the constructor); `scrollbar` is a pure indicator drawn outside the mask.
  private readonly viewportMask: Graphics;
  private readonly scrollbar: Graphics;
  private scrollY = 0;
  private scrollMax = 0;
  /*
   * S173 P5 — COMBOS preview state. `hovered` wins over `pinned` so moving the mouse always shows
   * what is under it; `shown` is what is currently drawn, and the difference between want and shown
   * is what tells `syncComboPreview` to put the previous card's arrow back.
   *
   * ⚠ ALL FIVE ARE RESET IN `rebuild`, because it DESTROYS every tile in `content` — a Map still
   * holding a destroyed Graphics is a draw onto a dead object on the very next frame.
   */
  private readonly comboPreviews = new Map<ComboKey, ComboPreview>();
  private hoveredCombo: ComboKey | null = null;
  private pinnedCombo: ComboKey | null = null;
  private shownCombo: ComboKey | null = null;
  private previewFrame = 0;
  private readonly tabButtons = new Map<CodexTabKey, { box: Graphics; label: Text }>();
  // S110 P3 — the player-avatar layer is lifted above this overlay's near-opaque backdrop while
  // open, then restored to its original z-index on close (so fog-of-war layering is untouched).
  private avatarLayer: Container | null = null;
  private savedAvatarIndex = -1;

  constructor(app: Application, opts: CodexOverlayOpts, onClose: () => void) {
    this.app = app;
    this.towers = opts.towers;
    this.container = new Container();

    const bg = new Graphics();
    bg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.93 });
    this.container.addChild(bg);

    const title = new Text({
      text: 'CODEX',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 48, fill: 0xffffff, letterSpacing: 12 }),
    });
    title.anchor.set(0.5);
    title.position.set(CANVAS_WIDTH / 2, 70);
    this.container.addChild(title);

    this.subtitle = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: 0xaaaaaa, letterSpacing: 1 }),
    });
    this.subtitle.anchor.set(0.5);
    this.subtitle.position.set(CANVAS_WIDTH / 2, 192);
    this.container.addChild(this.subtitle);

    // S121 P4 — one persistent footer: how to reopen + the unlock convention, out of every tile.
    // S173 P5 — it is a field now because `rebuild` appends the scroll hint to it per tab.
    this.footer = new Text({
      text: FOOTER_BASE,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: 0x6a6a78, letterSpacing: 1 }),
    });
    this.footer.anchor.set(0.5);
    this.footer.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 26);
    this.container.addChild(this.footer);

    // Tab bar.
    const tabY = 130;
    const tabW = 320;
    const tabGap = 16;
    const totalW = TABS.length * tabW + (TABS.length - 1) * tabGap;
    let tx = (CANVAS_WIDTH - totalW) / 2;
    for (const tab of TABS) {
      const btn = new Container();
      const box = new Graphics();
      btn.addChild(box);
      const label = new Text({
        text: tab.label,
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: 0xffffff, letterSpacing: 2, fontWeight: 'bold' }),
      });
      label.anchor.set(0.5);
      label.position.set(tabW / 2, 24);
      btn.addChild(label);
      btn.position.set(tx, tabY);
      btn.eventMode = 'static';
      btn.cursor = 'pointer';
      btn.on('pointertap', () => this.switchTab(tab.key));
      this.container.addChild(btn);
      this.tabButtons.set(tab.key, { box, label });
      tx += tabW + tabGap;
    }
    // Stash tab dims for the redraw helper.
    this.tabW = tabW;

    // Close button (top-right).
    const closeBtn = new Container();
    const closeBg = new Graphics();
    closeBg.roundRect(0, 0, 100, 36, 6).fill({ color: 0x222222, alpha: 0.9 }).stroke({ width: 2, color: 0x888888, alpha: 0.8 });
    closeBtn.addChild(closeBg);
    const closeText = new Text({
      text: 'CLOSE',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: 0xcccccc, letterSpacing: 2 }),
    });
    closeText.anchor.set(0.5);
    closeText.position.set(50, 18);
    closeBtn.addChild(closeText);
    closeBtn.position.set(CANVAS_WIDTH - 130, 30);
    closeBtn.eventMode = 'static';
    closeBtn.cursor = 'pointer';
    closeBtn.on('pointertap', onClose);
    this.container.addChild(closeBtn);

    this.content = new Container();
    this.container.addChild(this.content);

    /*
     * ⭐ S173 P5 — THE SCROLL VIEWPORT, in three parts.
     *
     * ⚠ THE MASK IS A SIBLING OF `content`, NEVER ITS CHILD. A mask parented to the container it
     * masks travels with that container's scroll offset, so it clips nothing and the grid spills
     * over the footer exactly as before — a silent no-op that looks like working code.
     */
    this.viewportMask = new Graphics();
    this.viewportMask.rect(0, SCROLL_VIEW_TOP, CANVAS_WIDTH, SCROLL_VIEW_H).fill(0xffffff);
    this.container.addChild(this.viewportMask);
    this.content.mask = this.viewportMask;

    // Drawn OUTSIDE the mask so it is never clipped by the thing it is describing.
    this.scrollbar = new Graphics();
    this.container.addChild(this.scrollbar);

    /*
     * The wheel, as a DOM listener on the canvas rather than a Pixi federated 'wheel' handler.
     *
     * A federated wheel event needs a hit-testable display object under the cursor, which here would
     * mean making the full-screen backdrop `eventMode: 'static'` — and that backdrop sits under the
     * tab buttons and the close button, so turning it into an event target is a change to this
     * overlay's whole pointer story for one scroll wheel. index.html pins `body { overflow: hidden }`
     * and nothing else in `src/` listens for 'wheel' (grepped), so a plain canvas listener is
     * unambiguous and has no page-scroll to fight; `passive: false` is what lets it preventDefault
     * the events it consumes.
     *
     * ⚠ IT IS NEVER REMOVED, and that is deliberate rather than an oversight: this overlay is built
     * once, lazily, and lives for the life of the page (there is no `destroy()` on this class). The
     * two guards on the first line are what keep it inert the rest of the time — invisible codex, or
     * a tab whose content already fits, and the event is left entirely alone.
     */
    app.canvas.addEventListener('wheel', (e: WheelEvent) => {
      if (!this.container.visible || this.scrollMax <= 0) return;
      e.preventDefault();
      this.scrollY = clampScroll(this.scrollY + wheelScrollDelta(e.deltaY, e.deltaMode), this.scrollMax);
      this.applyScroll();
    }, { passive: false });

    /*
     * ⭐ S173 P5 — the preview's heartbeat. `app.ticker` is the established pattern in this layer
     * (cutsceneOverlay does the same), and the guard on the first line is what keeps it free: on
     * every frame the codex is shut, or is on the TOWERS tab, this costs one boolean and a compare.
     *
     * ⛔ THE COUNTER IS RENDERER-LOCAL AND MUST STAY THAT WAY. `world.tick` is not available here —
     * the codex has no world, it opens on the title screen before a match exists — and it would be
     * wrong even if it were: a codex animation that stops because the sim is paused, or because a
     * NONET trial froze the duel, is a codex that looks broken. No `Math.random` either; the phase
     * is a pure function of this counter, so two openings of the same card look identical.
     */
    app.ticker.add(() => {
      if (!this.container.visible || this.active !== 'combos') return;
      this.previewFrame += PREVIEW_TICK_RATE;
      this.syncComboPreview();
    });

    this.container.visible = false;
    app.stage.addChild(this.container);
  }

  /**
   * ⭐ S173 P5 — DRAW THE HOVERED (or pinned) COMBO'S REAL CONNECTOR, one frame's worth.
   *
   * Owner: *"they don't show what this vortex IS, how it looks… make those clickable, so when you
   * mouse over each of those combos you can see how it would look. Just the connector itself."*
   *
   * ⭐ IT IS `drawBondVisual` — THE FUNCTION THE BOARD ITSELF CALLS, not a codex lookalike. That
   * was the one decision worth making carefully here, and it turned out to cost nothing: the
   * silhouettes are pure `(Graphics, BondVisualParams) → void` with no world, no entity and no
   * lookup, so the codex can call the shipped renderer directly. `dragPreviewRenderer` already
   * proved the pattern (its docblock even claims the Combo Codex does this — as of now that is
   * true). The consequence that matters: a retune of any silhouette moves this preview with it, and
   * a preview that has drifted from the thing it depicts is worse than none.
   *
   * ⚠ AN UNDISCOVERED COMBO STILL PREVIEWS, DIMMED, and that is this file's own existing rule
   * rather than a new one: `drawEmblem` keeps a locked recipe's geometry visible "just dimmed —
   * only character art gets the full brother-surprise hide" (S105 P2, so requirements stay
   * checkable). The NAME is still `???`, which is the part that is actually a spoiler. Hiding the
   * shape too would have made this whole feature invisible on a fresh profile — 0/14 discovered is
   * exactly the state the owner's own screenshot was in.
   */
  private syncComboPreview(): void {
    const want = this.hoveredCombo ?? this.pinnedCombo;
    if (want !== this.shownCombo) {
      const prev = this.shownCombo === null ? undefined : this.comboPreviews.get(this.shownCombo);
      if (prev !== undefined) {
        prev.g.clear();
        prev.g.visible = false;
        prev.arrow.visible = true;
      }
      this.shownCombo = want;
      this.previewFrame = 0; // every card starts its motion from the beginning, every time
    }
    if (want === null) return;
    const view = this.comboPreviews.get(want);
    if (view === undefined) return;
    view.g.visible = true;
    view.arrow.visible = false;
    view.g.clear(); // drawBondVisual APPENDS paths; the caller clears (structureRenderer's contract)
    // ⚠ The span is per-effect, not the glyph gap — see `previewSpanFor`. Derived from the stored
    // endpoints' MIDPOINT so the connector stays centred under the card whatever length it takes.
    const previewHalf = previewSpanFor(view.visualEffectId) / 2;
    const previewMid = (view.ax + view.bx) / 2;
    drawBondVisual(view.g, {
      ax: previewMid - previewHalf,
      ay: view.cy,
      bx: previewMid + previewHalf,
      by: view.cy,
      visualEffectId: view.visualEffectId,
      // Both endpoints take the CARRIED shape's colour, so the connector reads in the same palette
      // as the two glyphs it runs between. (Post-Sym D the silhouettes stroke in colorA anyway.)
      colorA: view.color,
      colorB: view.color,
      alpha: view.discovered ? 1 : 0.55,
      width: PREVIEW_BOND_WIDTH,
      tick: this.previewFrame,
    });
  }

  /**
   * Push `scrollY` into the display list + redraw the indicator. Called on every wheel event and
   * once at the end of every `rebuild`, so the bar and the grid can never disagree.
   */
  private applyScroll(): void {
    this.content.y = -this.scrollY;
    this.scrollbar.clear();
    if (this.scrollMax <= 0) return; // content fits — no track, no thumb, nothing to say
    this.scrollbar.roundRect(SCROLLBAR_X, SCROLL_VIEW_TOP, SCROLLBAR_W, SCROLL_VIEW_H, 3)
      .fill({ color: 0xffffff, alpha: 0.08 });
    const thumb = scrollbarThumb(this.scrollY, this.scrollMax);
    this.scrollbar.roundRect(SCROLLBAR_X, thumb.y, SCROLLBAR_W, thumb.h, 3)
      .fill({ color: GOLD, alpha: 0.55 });
  }

  private tabW = 320;

  /**
   * S110 P3 — register the player-avatar layer so it can be kept visible above this overlay's
   * backdrop while open. Owner: the "cruiser" (avatar) must not disappear behind the codex popup.
   */
  setAvatarLayer(layer: Container): void {
    this.avatarLayer = layer;
  }

  setVisible(visible: boolean): void {
    if (visible) {
      this.app.stage.addChild(this.container); // re-parent topmost (constructed before title/lobby)
      this.rebuild();
      // S110 P3 — lift the avatar ABOVE the codex (which we just put topmost) so the player can
      // always see their cruiser. Record its home index first to restore it on close.
      if (this.avatarLayer !== null && this.avatarLayer.parent === this.app.stage) {
        this.savedAvatarIndex = this.app.stage.getChildIndex(this.avatarLayer);
        this.app.stage.addChild(this.avatarLayer); // moves to topmost (above this.container)
      }
    } else if (this.avatarLayer !== null && this.savedAvatarIndex >= 0
      && this.avatarLayer.parent === this.app.stage) {
      // Restore the avatar to its original z-index (below the fog layer) so fog-of-war is unaffected.
      const idx = Math.min(this.savedAvatarIndex, this.app.stage.children.length - 1);
      this.app.stage.setChildIndex(this.avatarLayer, idx);
      this.savedAvatarIndex = -1;
    }
    this.container.visible = visible;
  }

  /** S109 P0 — public visibility probe so main.ts can toggle the G+C chord and wire Escape-to-close
   *  without reaching into `.container.visible`. */
  isVisible(): boolean {
    return this.container.visible;
  }

  /** Open directly on a given tab; both callers land on TOWERS & STRUCTURES (see `active` above). */
  open(tab: CodexTabKey = 'towers'): void {
    this.active = tab;
    this.setVisible(true);
  }

  private switchTab(tab: CodexTabKey): void {
    if (this.active === tab) return;
    this.active = tab;
    this.rebuild();
  }

  private rebuild(): void {
    this.drawTabBar();
    this.subtitle.text = TABS.find((t) => t.key === this.active)?.subtitle ?? '';
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    // Every tab opens at its own top; the grid builders below set `scrollMax` from what they laid out.
    this.scrollY = 0;
    this.scrollMax = 0;
    // ⛔ S173 P5 — the line above destroyed every tile, so every preview handle in this Map now
    // points at a destroyed Graphics. Clearing here is what stops the next ticker frame drawing
    // into one. The pin does not survive a tab switch either: it belongs to a card that is gone.
    this.comboPreviews.clear();
    this.hoveredCombo = null;
    this.pinnedCombo = null;
    this.shownCombo = null;
    this.previewFrame = 0;
    if (this.active === 'towers') this.buildSpriteGrid(this.towers, loadUnlockedSet());
    else this.buildCombosGrid();
    this.applyScroll();
    // Told, not discovered: a grid you cannot see the bottom of says so on the footer line.
    this.footer.text = this.scrollMax > 0 ? `${FOOTER_BASE}${FOOTER_SCROLL_HINT}` : FOOTER_BASE;
  }

  /** Highlight the active tab; dim the rest. */
  private drawTabBar(): void {
    for (const tab of TABS) {
      const ui = this.tabButtons.get(tab.key);
      if (ui === undefined) continue;
      const on = tab.key === this.active;
      ui.box.clear();
      ui.box.roundRect(0, 0, this.tabW, 48, 8)
        .fill({ color: on ? tab.color : 0x14141a, alpha: on ? 0.9 : 0.85 })
        .stroke({ width: 2, color: on ? 0xffffff : tab.color, alpha: on ? 0.95 : 0.55 });
      ui.label.style.fill = on ? 0x101014 : tab.color;
    }
  }

  /** TOWERS & STRUCTURES: a sprite tile grid (locked = grayscale ??? + a build hint when unlocked). */
  private buildSpriteGrid(entries: CodexEntry[], unlocked: Set<GodlyId>): void {
    if (entries.length === 0) {
      const empty = new Text({
        text: 'nothing discovered yet — play to reveal',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: 0x666666 }),
      });
      empty.anchor.set(0.5);
      empty.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      this.content.addChild(empty);
      return;
    }
    const cols = Math.min(entries.length, TOWER_COLS);
    const totalWidth = cols * TILE_W + (cols - 1) * TILE_GAP;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;
    // S173 P5 — the grid's own geometry decides how far it scrolls, so adding a tower tier needs no
    // edit here: 19 entries at 4 columns is 5 rows whose last tile ends at y=1947, which with the
    // bottom pad is 935 px of travel — confirmed against the running game, not computed on paper.
    this.scrollMax = scrollExtent(gridContentBottom(gridRowCount(entries.length, cols), TILE_H, TILE_GAP));
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (TILE_W + TILE_GAP);
      const y = GRID_TOP + row * (TILE_H + TILE_GAP);
      this.content.addChild(this.makeSpriteTile(entry, unlocked.has(entry.id), x, y));
    }
  }

  private makeSpriteTile(entry: CodexEntry, isUnlocked: boolean, x: number, y: number): Container {
    const tile = new Container();
    tile.position.set(x, y);
    const bg = new Graphics();
    bg.roundRect(0, 0, TILE_W, TILE_H, 12)
      .fill({ color: 0x0a0a0a, alpha: 0.85 })
      .stroke({ width: 2, color: isUnlocked ? GOLD : LOCKED_STROKE, alpha: 0.7 });
    tile.addChild(bg);

    // Name at the TOP (was below the art — long names collided with the hint block).
    const name = new Text({
      text: isUnlocked ? entry.displayName : '???',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: isUnlocked ? GOLD : 0x666666, letterSpacing: 2, fontWeight: 'bold' }),
    });
    name.anchor.set(0.5);
    name.position.set(TILE_W / 2, 30);
    fitTextToWidth(name, TILE_W - 24, 12);
    tile.addChild(name);

    /*
     * IMAGE — the S121 coherence rule, which S174 (a) made exceptionless: EVERY card shows the
     * recipe that builds it, in the board's own glyph language.
     *
     * Owner: *"Helga has reverted back to the state where you can see the actual Helga, but you
     * should see only the STRUCTURE of the building, like the connectors, how it looks. Also for
     * Voltkin."*
     *
     * ⛔ THE `else` IS NOT A FALLBACK FOR MISSING DATA. `BLUEPRINTS` is a full
     * `Record<GodlyId, Blueprint>` — tsc will not let an id exist without one — so every entry that
     * has no emblem HAS a blueprint, and the branch below draws the real stamped nodes and bonds.
     * That is a STRONGER picture than an emblem, not a weaker one: an emblem is an idealised logo
     * while the blueprint is the geometry the build actually lays down.
     */
    const diagram = new Graphics();
    if (entry.emblem !== undefined) {
      drawEmblem(diagram, entry.emblem, isUnlocked);
      diagram.position.set(TILE_W / 2, ART_CY);
    } else {
      drawBlueprintShape(
        diagram,
        entry.id,
        TILE_W / 2,
        ART_CY,
        blueprintFitScaleBox(entry.id, ART_HALF_W, ART_HALF_H),
      );
    }
    tile.addChild(diagram);

    // POWER epigraph — the entry's soul, part of the unlock payoff (hidden while locked).
    if (isUnlocked && entry.power !== '') {
      const power = new Text({
        text: entry.power,
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: 0xe8d9a0, letterSpacing: 1, align: 'center' }),
      });
      power.anchor.set(0.5);
      power.position.set(TILE_W / 2, POWER_Y);
      fitTextToWidth(power, TILE_W - 20, 10);
      tile.addChild(power);
    }

    // Divider between the reveal zone (name/art/power) and the always-visible recipe.
    const divider = new Graphics();
    divider.moveTo(20, POWER_Y + 16).lineTo(TILE_W - 20, POWER_Y + 16)
      .stroke({ width: 1, color: isUnlocked ? 0x3a3624 : 0x22222a, alpha: 0.9 });
    tile.addChild(divider);

    // S105 P2 — the recipe is shown in BOTH states so a player can CHECK the build requirements
    // BEFORE building (the owner couldn't see the 7-spiral turret recipe because it was unlock-gated).
    // When locked, only the NAME + character art + power stay hidden (the brother-surprise reveal) —
    // you learn HOW to build it; the WHAT (its name/look/soul) is the payoff for building it once.
    // S121 P4 — copy budget (≤150 chars, tested) + fitTextToBox make tile overflow impossible.
    const hint = new Text({
      text: entry.recipeHint,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: isUnlocked ? 0xbfbfbf : 0x9a9aa8, wordWrap: true, wordWrapWidth: TILE_W - 28, align: 'center' }),
    });
    hint.anchor.set(0.5, 0);
    hint.position.set(TILE_W / 2, RECIPE_Y);
    fitTextToBox(hint, TILE_W - 28, TILE_H - RECIPE_Y - 12, 9);
    tile.addChild(hint);
    return tile;
  }

  /** COMBOS tab: the Magic-14, each tile = glyphA (→/↔) glyphB = ResultName (the recipe IS the how-to). */
  private buildCombosGrid(): void {
    const discovered = loadDiscoveredCombos();
    // S173 P5 — the subtitle names the interaction, because a hover target with no affordance is a
    // feature nobody finds. (The cursor turns to a pointer on each card for the same reason.)
    this.subtitle.text = `COMBOS — ${discovered.size} / ${MAGIC_COMBO_KEYS.length} discovered · hover a card to watch the connector it makes`;
    const catalog = magicComboCatalog();
    const cw = COMBO_TILE_W;
    const ch = COMBO_TILE_H;
    const gx = COMBO_TILE_GAP;
    const gy = COMBO_TILE_GAP;
    // S173 P5 — the Magic-14 at 5 columns is 3 rows ending at y=811, still inside the viewport, so
    // this is 0 and COMBOS does not scroll (owner: "they're all fine. You can see all of them").
    // It is computed rather than hardcoded so a 15th combo scrolls instead of silently vanishing.
    this.scrollMax = scrollExtent(gridContentBottom(gridRowCount(catalog.length, COMBO_COLS), ch, gy));
    for (let i = 0; i < catalog.length; i++) {
      const entry = catalog[i];
      const row = Math.floor(i / COMBO_COLS);
      const col = i % COMBO_COLS;
      const inRow = Math.min(COMBO_COLS, catalog.length - row * COMBO_COLS);
      const rowWidth = inRow * cw + (inRow - 1) * gx;
      const startX = (CANVAS_WIDTH - rowWidth) / 2;
      const x = startX + col * (cw + gx);
      const yy = GRID_TOP + row * (ch + gy);
      this.content.addChild(this.makeComboTile(entry, discovered.has(entry.key), x, yy, cw, ch));
    }
  }

  private makeComboTile(
    entry: ReturnType<typeof magicComboCatalog>[number],
    isDiscovered: boolean,
    x: number, y: number, w: number, h: number,
  ): Container {
    const tile = new Container();
    tile.position.set(x, y);
    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 12)
      .fill({ color: 0x0a0a0a, alpha: 0.85 })
      .stroke({ width: 2, color: isDiscovered ? GOLD : LOCKED_STROKE, alpha: 0.75 });
    tile.addChild(bg);

    const name = new Text({
      text: isDiscovered ? entry.outcome.resultName : '???',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 19, fill: isDiscovered ? GOLD : 0x666666, letterSpacing: 2, fontWeight: 'bold' }),
    });
    name.anchor.set(0.5);
    name.position.set(w / 2, COMBO_NAME_Y);
    tile.addChild(name);

    // Recipe row: glyphA <arrow> glyphB (↔ = either order, → = directional dual).
    const cy = COMBO_ROW_Y;
    const ax = w / 2 - COMBO_SPAN / 2;
    const bx = w / 2 + COMBO_SPAN / 2;

    // ⭐ S173 P5 — the preview Graphics goes in FIRST, so the connector passes BEHIND its two
    // endpoint glyphs exactly as a bond passes behind its primitives on the board. Empty and hidden
    // until a pointer arrives; `syncComboPreview` owns everything that happens to it after that.
    const preview = new Graphics();
    preview.visible = false;
    tile.addChild(preview);

    tile.addChild(this.makeGlyph(entry.a, ax, cy, isDiscovered));
    const arrow = new Text({
      text: isOrderSymmetric(entry.a, entry.b) ? '↔' : '→',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: isDiscovered ? 0xdddddd : 0x555555 }),
    });
    arrow.anchor.set(0.5);
    arrow.position.set(w / 2, cy);
    tile.addChild(arrow);
    tile.addChild(this.makeGlyph(entry.b, bx, cy, isDiscovered));

    if (!isDiscovered) {
      const lock = new Text({
        text: 'connect to reveal',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x555555 }),
      });
      lock.anchor.set(0.5);
      lock.position.set(w / 2, h - 16);
      tile.addChild(lock);
    }

    this.comboPreviews.set(entry.key, {
      g: preview,
      arrow,
      ax,
      bx,
      cy,
      visualEffectId: entry.outcome.visualEffectId,
      color: isDiscovered ? SPARK_COLORS[entry.a] : LOCKED_SIL,
      discovered: isDiscovered,
    });

    /*
     * Hover is the interaction the owner named; the tap is the one he offered ("maybe make those
     * clickable"). A tap PINS the card so its connector keeps running once the pointer leaves —
     * tapping it again, or tapping another card, releases it. Hover still wins while the pointer is
     * over a card, so pinning can never make the thing under your cursor show something else.
     */
    tile.eventMode = 'static';
    tile.cursor = 'pointer';
    tile.on('pointerover', () => { this.hoveredCombo = entry.key; });
    tile.on('pointerout', () => { if (this.hoveredCombo === entry.key) this.hoveredCombo = null; });
    tile.on('pointertap', () => { this.pinnedCombo = this.pinnedCombo === entry.key ? null : entry.key; });
    return tile;
  }

  /** One primitive glyph tinted its type colour (dim grey when the combo is undiscovered). */
  private makeGlyph(type: SparkType, cx: number, cy: number, discovered: boolean): Container {
    const wrap = new Container();
    wrap.position.set(cx, cy);
    const g = new Graphics();
    SHAPE_GLYPHS[type](g);
    g.tint = discovered ? SPARK_COLORS[type] : LOCKED_SIL;
    if (!discovered) g.alpha = 0.5;
    wrap.addChild(g);
    return wrap;
  }
}
