/**
 * SPARK — Unified CODEX overlay (S104 P3 — merges the old godly codexOverlay + the
 * separate comboCodexOverlay into ONE in-game reference with THREE tabs):
 *
 *   ⚡ GODLY COMBOS      — the cinematic summons (Voltkin, …). Unlock = it fired in play.
 *   ◆ COMBOS            — the Magic-14 two-shape connections. Unlock = discovered in play.
 *   🏰 TOWERS & STRUCTURES — the buildables that stay on the field (pentagram spawner, #9 laser
 *                            turret, #10 HELGA). Unlock = you built one (S104 unlock-on-build).
 *
 * Each entry shows WHAT it is + HOW TO BUILD it (the recipe). Entries are LOCKED until unlocked at
 * least once (the brother-surprise convention, PRIME-AUDIT-S21 #4) — locked tiles read "???".
 *
 * Opened from the title-screen CODEX button AND in-game via the G+C key chord (main.ts owns the
 * chord; this is a pure-UI overlay that dispatches NOTHING to the sim). LAZY-loaded by main.ts on
 * first open (the botSetupOverlay pattern) so its Pixi weight stays off the index/entry chunk; each
 * tab's Pixi tree is built on first switch (not all three on open) to avoid a first-open hitch.
 *
 * Unlock state is read live each open: godly + towers from codexStore (localStorage
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

export interface CodexEntry {
  readonly id: GodlyId;
  readonly displayName: string;
  /** One-line epigraph — the entry's soul; shown only when unlocked (part of the reveal). */
  readonly power: string;
  /** Precise "how to build + what it does" — visible in BOTH states (S105 P2 checkable recipes). */
  readonly recipeHint: string;
  /** Character art — only for entries that ARE characters (Voltkin, HELGA, the NONET kami). */
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

/** S121 P4 — the synthetic NONET super-combo entry (not a recipe; copy lives in codexPresentation). */
export function nonetEntry(): CodexEntry {
  const copy = codexCopyFor('nonet');
  return {
    id: 'nonet' as GodlyId,
    displayName: copy.name,
    power: copy.power,
    recipeHint: copy.recipe,
    characterSprite: copy.sprite,
    emblem: copy.emblem,
  };
}

type TabKey = 'godly' | 'combos' | 'towers';
interface TabDef { readonly key: TabKey; readonly label: string; readonly color: number; readonly subtitle: string; }
const TABS: readonly TabDef[] = [
  { key: 'godly', label: 'GODLY COMBOS', color: 0xff6ad5, subtitle: 'cinematic summons — earned in the arena, never given' },
  { key: 'combos', label: 'COMBOS', color: 0x53d8ff, subtitle: 'the geometry itself — two shapes, one magic' },
  { key: 'towers', label: 'TOWERS & STRUCTURES', color: GOLD, subtitle: 'build them true and they fight for you' },
];

export interface CodexOverlayOpts {
  readonly godly: CodexEntry[];
  readonly towers: CodexEntry[];
}

export class CodexOverlay {
  readonly container: Container;
  private readonly app: Application;
  private readonly godly: CodexEntry[];
  private readonly towers: CodexEntry[];
  private active: TabKey = 'godly';
  private readonly content: Container;
  private readonly subtitle: Text;
  private readonly tabButtons = new Map<TabKey, { box: Graphics; label: Text }>();
  // S110 P3 — the player-avatar layer is lifted above this overlay's near-opaque backdrop while
  // open, then restored to its original z-index on close (so fog-of-war layering is untouched).
  private avatarLayer: Container | null = null;
  private savedAvatarIndex = -1;

  constructor(app: Application, opts: CodexOverlayOpts, onClose: () => void) {
    this.app = app;
    this.godly = opts.godly;
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
    const footer = new Text({
      text: 'entries reveal through play · press G+C in-game to open the codex',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: 0x6a6a78, letterSpacing: 1 }),
    });
    footer.anchor.set(0.5);
    footer.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 26);
    this.container.addChild(footer);

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

    this.container.visible = false;
    app.stage.addChild(this.container);
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

  /** Open directly on a given tab (the G+C chord opens 'godly' by default). */
  open(tab: TabKey = 'godly'): void {
    this.active = tab;
    this.setVisible(true);
  }

  private switchTab(tab: TabKey): void {
    if (this.active === tab) return;
    this.active = tab;
    this.rebuild();
  }

  private rebuild(): void {
    this.drawTabBar();
    this.subtitle.text = TABS.find((t) => t.key === this.active)?.subtitle ?? '';
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (this.active === 'godly') this.buildSpriteGrid(this.godly, loadUnlockedSet());
    else if (this.active === 'towers') this.buildSpriteGrid(this.towers, loadUnlockedSet());
    else this.buildCombosGrid();
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

  /** GODLY + TOWERS tabs: a sprite tile grid (locked = grayscale ??? + a build hint when unlocked). */
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
