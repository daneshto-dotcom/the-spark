/**
 * SPARK — Codex overlay (S22 P3 D8 from S21 Council).
 *
 * MK-style top-level screen showing locked/unlocked godly recipes. Entry
 * from title screen. Empty on first 1v1 (PRIME-AUDIT-S21 #4 — preserve
 * brother-surprise). Unlocked tiles persist per-browser via localStorage
 * key `spark:codex:unlocked:v1` JSON array of GodlyId.
 *
 * Tile visual:
 *   - Locked: characterSprite with grayscale + alpha 0.15 + '???' caption
 *   - Unlocked: full-color characterSprite + recipe name + recipe hint
 */

import { Application, Container, Graphics, Text, TextStyle, Sprite, Assets, ColorMatrixFilter } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import type { GodlyId, GodlyRecipe } from '../state/godlyRecipes/types.ts';

const STORAGE_KEY = 'spark:codex:unlocked:v1';
const TILE_W = 220;
const TILE_H = 280;
const TILE_GAP = 32;

export interface CodexEntry {
  readonly id: GodlyId;
  readonly displayName: string;
  readonly recipeHint: string;
  readonly characterSprite: string;
}

export function loadUnlockedSet(): Set<GodlyId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is GodlyId => typeof x === 'string') as GodlyId[]);
  } catch {
    return new Set();
  }
}

export function persistUnlockedSet(set: Set<GodlyId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // localStorage may be disabled (private mode); silent skip is fine.
  }
}

/** Record a successful godly trigger as an unlock. Idempotent. */
export function unlockGodly(id: GodlyId): void {
  const set = loadUnlockedSet();
  if (set.has(id)) return;
  set.add(id);
  persistUnlockedSet(set);
}

export class CodexOverlay {
  readonly container: Container;
  private readonly entries: CodexEntry[];
  private readonly app: Application;

  constructor(app: Application, entries: CodexEntry[], onClose: () => void) {
    this.app = app;
    this.container = new Container();
    this.entries = entries;

    const bg = new Graphics();
    bg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.92 });
    this.container.addChild(bg);

    const title = new Text({
      text: 'CODEX',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 48, fill: 0xffffff, letterSpacing: 12 }),
    });
    title.anchor.set(0.5);
    title.position.set(CANVAS_WIDTH / 2, 100);
    this.container.addChild(title);

    const subtitle = new Text({
      text: 'godly combos — discovered through play',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: 0xaaaaaa }),
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(CANVAS_WIDTH / 2, 150);
    this.container.addChild(subtitle);

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

    this.container.visible = false;
    app.stage.addChild(this.container);
  }

  /**
   * (Re)build the tile grid. Called each time setVisible(true) so newly-
   * unlocked entries refresh from localStorage without a page reload.
   */
  private rebuildTiles(): void {
    // Remove any prior tile containers (keep bg + title + subtitle + close).
    while (this.container.children.length > 4) {
      const child = this.container.children[this.container.children.length - 1];
      this.container.removeChild(child);
      child.destroy();
    }

    const unlocked = loadUnlockedSet();
    const totalWidth = this.entries.length * TILE_W + (this.entries.length - 1) * TILE_GAP;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;
    const tileY = CANVAS_HEIGHT / 2 - TILE_H / 2 + 40;

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const isUnlocked = unlocked.has(entry.id);
      const tileX = startX + i * (TILE_W + TILE_GAP);
      const tile = this.makeTile(entry, isUnlocked, tileX, tileY);
      this.container.addChild(tile);
    }
  }

  private makeTile(entry: CodexEntry, isUnlocked: boolean, x: number, y: number): Container {
    const tile = new Container();
    tile.position.set(x, y);

    const bg = new Graphics();
    bg.roundRect(0, 0, TILE_W, TILE_H, 12)
      .fill({ color: 0x0a0a0a, alpha: 0.85 })
      .stroke({ width: 2, color: isUnlocked ? 0xffd60a : 0x444444, alpha: 0.7 });
    tile.addChild(bg);

    // Sprite (async-loaded).
    void Assets.load(entry.characterSprite).then((tex) => {
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.position.set(TILE_W / 2, 110);
      sprite.scale.set(0.32); // 512 × 0.32 ≈ 164 px
      if (!isUnlocked) {
        const gray = new ColorMatrixFilter();
        gray.desaturate();
        sprite.filters = [gray];
        sprite.alpha = 0.15;
      }
      tile.addChild(sprite);
    }).catch(() => { /* asset missing — leave empty tile */ });

    const name = new Text({
      text: isUnlocked ? entry.displayName : '???',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 22,
        fill: isUnlocked ? 0xffd60a : 0x666666,
        letterSpacing: 3,
      }),
    });
    name.anchor.set(0.5);
    name.position.set(TILE_W / 2, 220);
    tile.addChild(name);

    if (isUnlocked) {
      const hint = new Text({
        text: entry.recipeHint,
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 12,
          fill: 0xaaaaaa,
          wordWrap: true,
          wordWrapWidth: TILE_W - 24,
          align: 'center',
        }),
      });
      hint.anchor.set(0.5);
      hint.position.set(TILE_W / 2, 252);
      tile.addChild(hint);
    }

    return tile;
  }

  setVisible(visible: boolean): void {
    if (visible) {
      // S22 hotfix — re-parent to ensure topmost z-order. Codex container was
      // constructed BEFORE titleScreen/lobbyScreen in main.ts boot order, so
      // those screens render on top by default. Pixi's addChild on an existing
      // child moves it to the end of the children array (= topmost in stack).
      this.app.stage.addChild(this.container);
      this.rebuildTiles();
    }
    this.container.visible = visible;
  }
}

/**
 * Convenience: derive a CodexEntry from a GodlyRecipe (used at startup to
 * build the entries array). Recipe hints are recipe-author-supplied via the
 * second argument since the recipe object itself does not embed them.
 */
export function entryFromRecipe(recipe: GodlyRecipe, displayName: string, recipeHint: string): CodexEntry {
  return {
    id: recipe.id,
    displayName,
    recipeHint,
    characterSprite: recipe.characterSprite,
  };
}
