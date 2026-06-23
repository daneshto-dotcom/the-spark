/**
 * SPARK — Combo Codex overlay (S97 G3b: "Codex marks discovered combos;
 * undiscovered render as silhouettes").
 *
 * A title-screen gallery of the Magic-14. Each tile draws the combo's REAL bond
 * silhouette (the same drawBondVisual the board uses) between two endpoints:
 *   - DISCOVERED → full type-coloured silhouette + resultName + the recipe
 *     ("Dot → Square" as primitive glyphs).
 *   - UNDISCOVERED → a dim grey silhouette teaser + "???" (shape shown, identity
 *     hidden — the brother-surprise convention from the godly CodexOverlay).
 * Discovery is read from the cross-match comboCodexStore (in-match
 * world.discoveredCombos is wiped on return-to-title; main.ts mirrors its growth
 * into that store). Silhouettes animate gently via Ticker.shared while visible
 * (wheels turn, the vortex swirls) — paused when dismissed.
 *
 * LAZY-loaded by main.ts on first open (the CodexOverlay / botSetupOverlay
 * pattern) so its Pixi weight stays off the index chunk.
 */

import { Application, Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, SPARK_COLORS, SparkType } from '../constants.ts';
import { drawBondVisual, type BondVisualParams } from './bondVisualRenderer.ts';
import { SHAPE_GLYPHS } from './shapes.ts';
import { MAGIC_COMBO_KEYS } from '../combos.ts';
import { loadDiscoveredCombos, magicComboCatalog, type ComboCatalogEntry } from './comboCodexStore.ts';

const COLS = 5;
const TILE_W = 224;
const TILE_H = 170;
const TILE_GAP_X = 24;
const TILE_GAP_Y = 26;
const GRID_TOP = 250;
const SIL_W = 128; // on-tile silhouette span (A→B)
const SIL_Y = 66; // silhouette centre-line within the tile (local y)
const GOLD = 0xffd60a;
const LOCKED_STROKE = 0x3a3a44;
const LOCKED_SIL = 0x53536a;

interface Sil {
  readonly g: Graphics;
  readonly entry: ComboCatalogEntry;
  readonly discovered: boolean;
}

export class ComboCodexOverlay {
  readonly container: Container;
  private readonly app: Application;
  private readonly catalog: ComboCatalogEntry[] = magicComboCatalog();
  private readonly subtitle: Text;
  private sils: Sil[] = [];
  private tick = 0;
  private animating = false; // guards Ticker double-add across repeated opens
  private readonly onTick = (): void => {
    this.tick += 1;
    for (const s of this.sils) this.drawSil(s);
  };

  constructor(app: Application, onClose: () => void) {
    this.app = app;
    this.container = new Container();

    const bg = new Graphics();
    bg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.93 });
    this.container.addChild(bg);

    const title = new Text({
      text: 'COMBO CODEX',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 48, fill: 0xffffff, letterSpacing: 12 }),
    });
    title.anchor.set(0.5);
    title.position.set(CANVAS_WIDTH / 2, 100);
    this.container.addChild(title);

    this.subtitle = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: 0xaaaaaa, letterSpacing: 1 }),
    });
    this.subtitle.anchor.set(0.5);
    this.subtitle.position.set(CANVAS_WIDTH / 2, 150);
    this.container.addChild(this.subtitle);

    // Close button (top-right) — mirrors codexOverlay.
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

    this.container.visible = false;
    app.stage.addChild(this.container);
  }

  setVisible(visible: boolean): void {
    if (visible) {
      // Re-parent topmost (codexOverlay precedent: constructed before title/lobby in boot order).
      this.app.stage.addChild(this.container);
      this.rebuildTiles();
      if (!this.animating) { // idempotent: re-opening an already-open codex must not stack listeners
        Ticker.shared.add(this.onTick);
        this.animating = true;
      }
    } else if (this.animating) {
      Ticker.shared.remove(this.onTick);
      this.animating = false;
    }
    this.container.visible = visible;
  }

  /** (Re)build the tile grid — called on each open so freshly-discovered combos reveal. */
  private rebuildTiles(): void {
    // Drop prior tiles (keep bg + title + subtitle + close = first 4 children).
    while (this.container.children.length > 4) {
      const child = this.container.children[this.container.children.length - 1];
      this.container.removeChild(child);
      child.destroy({ children: true });
    }
    this.sils = [];

    const discovered = loadDiscoveredCombos();
    this.subtitle.text = `${discovered.size} / ${MAGIC_COMBO_KEYS.length} discovered — connect shapes in play to reveal`;

    for (let i = 0; i < this.catalog.length; i++) {
      const entry = this.catalog[i];
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      // Count in this row → centre short rows (the last row of 4).
      const inRow = Math.min(COLS, this.catalog.length - row * COLS);
      const rowWidth = inRow * TILE_W + (inRow - 1) * TILE_GAP_X;
      const startX = (CANVAS_WIDTH - rowWidth) / 2;
      const x = startX + col * (TILE_W + TILE_GAP_X);
      const y = GRID_TOP + row * (TILE_H + TILE_GAP_Y);
      this.container.addChild(this.makeTile(entry, discovered.has(entry.key), x, y));
    }
  }

  private makeTile(entry: ComboCatalogEntry, isDiscovered: boolean, x: number, y: number): Container {
    const tile = new Container();
    tile.position.set(x, y);

    const bg = new Graphics();
    bg.roundRect(0, 0, TILE_W, TILE_H, 12)
      .fill({ color: 0x0a0a0a, alpha: 0.85 })
      .stroke({ width: 2, color: isDiscovered ? GOLD : LOCKED_STROKE, alpha: 0.75 });
    tile.addChild(bg);

    // The combo silhouette (animated via onTick).
    const sil = new Graphics();
    tile.addChild(sil);
    const silEntry: Sil = { g: sil, entry, discovered: isDiscovered };
    this.sils.push(silEntry);
    this.drawSil(silEntry);

    // Name (discovered) / "???" (locked).
    const name = new Text({
      text: isDiscovered ? entry.outcome.resultName : '???',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 20,
        fill: isDiscovered ? GOLD : 0x666666,
        letterSpacing: 2,
        fontWeight: 'bold',
      }),
    });
    name.anchor.set(0.5);
    name.position.set(TILE_W / 2, 120);
    tile.addChild(name);

    if (isDiscovered) {
      // Recipe row: glyphA → glyphB, each tinted its spec §IV type colour.
      tile.addChild(this.makeGlyph(entry.a, TILE_W / 2 - 42, 148));
      const arrow = new Text({
        text: '→',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: 0xcccccc }),
      });
      arrow.anchor.set(0.5);
      arrow.position.set(TILE_W / 2, 148);
      tile.addChild(arrow);
      tile.addChild(this.makeGlyph(entry.b, TILE_W / 2 + 42, 148));
    } else {
      const hint = new Text({
        text: 'undiscovered',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x555555, letterSpacing: 1 }),
      });
      hint.anchor.set(0.5);
      hint.position.set(TILE_W / 2, 148);
      tile.addChild(hint);
    }

    return tile;
  }

  /** A single primitive glyph (the spawner geometry) tinted its type colour. */
  private makeGlyph(type: SparkType, cx: number, cy: number): Container {
    const wrap = new Container();
    wrap.position.set(cx, cy);
    const g = new Graphics();
    SHAPE_GLYPHS[type](g); // white fill…
    g.tint = SPARK_COLORS[type]; // …recoloured to the spec §IV type colour
    wrap.addChild(g);
    return wrap;
  }

  /** (Re)draw one silhouette at the current tick. Type-coloured when discovered, dim grey when locked. */
  private drawSil(s: Sil): void {
    s.g.clear();
    const cx = TILE_W / 2;
    const p: BondVisualParams = {
      ax: cx - SIL_W / 2,
      ay: SIL_Y,
      bx: cx + SIL_W / 2,
      by: SIL_Y,
      visualEffectId: s.entry.outcome.visualEffectId,
      colorA: s.discovered ? SPARK_COLORS[s.entry.a] : LOCKED_SIL,
      colorB: s.discovered ? SPARK_COLORS[s.entry.b] : LOCKED_SIL,
      alpha: s.discovered ? 0.95 : 0.4,
      width: 5,
      tick: this.tick,
    };
    drawBondVisual(s.g, p);
  }
}
