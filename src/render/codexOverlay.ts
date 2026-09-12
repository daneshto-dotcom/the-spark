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
 * WHOLE into `towers`, and registry order (registerAll.ts imports voltkin first) puts him in the
 * tab's first slot. NONET is not in that list because it never was a recipe — it was a synthetic
 * entry built by a `nonetEntry()` helper, and that helper is deleted rather than relocated.
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

import { Application, Container, Graphics, Text, TextStyle, Sprite, Assets, ColorMatrixFilter } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, SPARK_COLORS, SparkType } from '../constants.ts';
import type { GodlyId, GodlyRecipe } from '../state/godlyRecipes/types.ts';
import { loadUnlockedSet } from './codexStore.ts';
import { SHAPE_GLYPHS } from './shapes.ts';
import { MAGIC_COMBO_KEYS, isOrderSymmetric } from '../combos.ts';
import { loadDiscoveredCombos, magicComboCatalog } from './comboCodexStore.ts';
import { codexCopyFor, drawEmblem, type EmblemSpec } from './codexPresentation.ts';
import { fitTextToBox, fitTextToWidth } from './textFit.ts';
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
const COMBO_COLS = 5;

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
  /** Character art — only for entries that ARE characters (Voltkin, HELGA). */
  readonly characterSprite?: string;
  /** Recipe-constellation emblem — only for geometric buildables (drawn in the board's glyph language). */
  readonly emblem?: EmblemSpec;
}

/**
 * S121 P4 — derive a CodexEntry from a GodlyRecipe via the codexPresentation copy map (the single
 * source of presentation truth). The recipe's own `characterSprite` is used ONLY when the map marks
 * the entry as a character — this is what retired the wrong Voltkin placeholder on the three
 * geometric towers (they now show their build constellation instead).
 */
export function entryFromRecipe(recipe: GodlyRecipe): CodexEntry {
  const copy = codexCopyFor(recipe.id);
  return {
    id: recipe.id,
    displayName: copy.name,
    power: copy.power,
    recipeHint: copy.recipe,
    characterSprite: copy.sprite,
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

    this.container.visible = false;
    app.stage.addChild(this.container);
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
    const cols = Math.min(entries.length, 4);
    const totalWidth = cols * TILE_W + (cols - 1) * TILE_GAP;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;
    // S173 P5 — the grid's own geometry decides how far it scrolls, so adding a tower tier needs no
    // edit here: 19 entries at 4 columns is 5 rows whose last tile ends at y=1947, which with the
    // bottom pad is 935 px of travel.
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

    // IMAGE — the S121 coherence rule: characters show their art (brother-surprise hidden until
    // unlocked); geometric buildables show their BUILD CONSTELLATION in the board's own glyph
    // language (visible even locked — the recipe is checkable, per S105 P2; just dimmed).
    if (entry.emblem !== undefined) {
      const emblem = new Graphics();
      drawEmblem(emblem, entry.emblem, isUnlocked);
      emblem.position.set(TILE_W / 2, ART_CY);
      tile.addChild(emblem);
    } else if (entry.characterSprite !== undefined) {
      const spritePath = entry.characterSprite;
      void Assets.load(spritePath).then((tex) => {
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.position.set(TILE_W / 2, ART_CY);
        // Fit the art inside the zone regardless of source resolution (was a fixed 0.26 that
        // assumed one asset size — another "escapes the box" vector for future art drops).
        const fit = Math.min(150 / tex.width, 130 / tex.height);
        sprite.scale.set(Math.min(0.26, fit));
        if (!isUnlocked) {
          const gray = new ColorMatrixFilter();
          gray.desaturate();
          sprite.filters = [gray];
          sprite.alpha = 0.15;
        }
        tile.addChild(sprite);
      }).catch(() => { /* asset missing — leave empty tile */ });
    }

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
    this.subtitle.text = `COMBOS — ${discovered.size} / ${MAGIC_COMBO_KEYS.length} discovered · connect two shapes in play to reveal`;
    const catalog = magicComboCatalog();
    const cw = 224;
    const ch = 132;
    const gx = 24;
    const gy = 24;
    // S173 P5 — the Magic-14 at 5 columns is 3 rows ending at y=679, comfortably inside the
    // viewport, so this is 0 today and COMBOS looks exactly as it did (owner: "they're all fine").
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
    name.position.set(w / 2, 36);
    tile.addChild(name);

    // Recipe row: glyphA <arrow> glyphB (↔ = either order, → = directional dual).
    const cy = 88;
    tile.addChild(this.makeGlyph(entry.a, w / 2 - 46, cy, isDiscovered));
    const arrow = new Text({
      text: isOrderSymmetric(entry.a, entry.b) ? '↔' : '→',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: isDiscovered ? 0xdddddd : 0x555555 }),
    });
    arrow.anchor.set(0.5);
    arrow.position.set(w / 2, cy);
    tile.addChild(arrow);
    tile.addChild(this.makeGlyph(entry.b, w / 2 + 46, cy, isDiscovered));

    if (!isDiscovered) {
      const lock = new Text({
        text: 'connect to reveal',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x555555 }),
      });
      lock.anchor.set(0.5);
      lock.position.set(w / 2, h - 16);
      tile.addChild(lock);
    }
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
