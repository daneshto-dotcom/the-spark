/**
 * SPARK — NONET Sudoku overlay (S93 P1): the "different realm" trial UI.
 *
 * A full-screen Pixi overlay shown while world.sudoku is active. Late-90s arcade-Tetris
 * visual language (beveled jewel cells, gold cloisonné frame, CRT scanlines, chunky bitmap
 * numerals) fused with a Ghibli dusk world (a forest-kami guardian + kodama). The six Sudoku
 * digits ARE the six SparkType colours, so it reads as a colour-logic puzzle in SPARK's own
 * alphabet (the numeral is the colour-blind-safe primary token).
 *
 * Host-authoritative state lives on world.sudoku; this overlay is pure presentation + local
 * input. On a complete grid it calls the injected `onSubmit` (solo/host → submitSudokuSolve;
 * a future client build sends a SUDOKU_SOLVED intent). Vector spirits are Phase-1 placeholders;
 * Phase 2 swaps in illustrated sprites loaded off-bundle from public/art/nonet/.
 */

import { Application, Assets, Container, type FederatedPointerEvent, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, SPARK_COLORS, SparkType } from '../constants.ts';
import type { World } from '../state/worldTypes.ts';
import {
  floodAlpha,
  playNonetAppear,
  playNonetLose,
  playNonetPop,
  playNonetSolve,
  playNonetTimeout,
  playNonetWrong,
  resolveFloodColor,
} from './nonetJuice.ts';

const N = 6;
const CELLS = 36;
const BOX_H = 2; // box height in cells (rows)
const BOX_W = 3; // box width in cells (cols)

// digit 1..6 → the six SparkType colours (Dot, Line, Triangle, Square, Circle, Spiral)
const DIGIT_TYPE = [
  SparkType.Dot,
  SparkType.Line,
  SparkType.Triangle,
  SparkType.Square,
  SparkType.Circle,
  SparkType.Spiral,
];
const digitColor = (d: number): number => SPARK_COLORS[DIGIT_TYPE[d - 1]];
/** Dark numeral on light jewels (white/yellow/green), light on dark jewels (red/blue/purple). */
const numeralColor = (d: number): number => (d === 1 || d === 2 || d === 5 ? 0x23222a : 0xffffff);

const BOARD = 540;
const CELL = BOARD / N; // 90
const BX = (CANVAS_WIDTH - BOARD) / 2; // 690
const BY = 320;
const GOLD = 0xe8c66a;

export type SubmitFn = (grid: number[]) => boolean;

export class SudokuOverlay {
  readonly container: Container;
  private readonly cells: Graphics;
  private readonly nums: Text[] = [];
  private readonly banner: Text;
  private readonly result: Text;
  private readonly hint: Text;
  // S95 — winner-colour resolve flood + its rising-edge latch + fade state.
  private readonly flood: Graphics;
  private floodStartTick = -1;
  private floodColor = 0xffffff;
  private prevResolved = false;

  private world: World | null = null;
  private entries: number[] = new Array(CELLS).fill(0);
  private givens: number[] = new Array(CELLS).fill(0);
  private selected = -1;
  private activeSeed: number | null = null;
  private wrongFlash = 0;
  private readonly onSubmit: SubmitFn;

  constructor(app: Application, onSubmit: SubmitFn) {
    this.onSubmit = onSubmit;
    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.visible = false;

    // ── dim backdrop (captures clicks so they never fall through to the duel) ──
    const bg = new Graphics();
    bg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x0a0a14, alpha: 0.82 });
    bg.eventMode = 'static';
    this.container.addChild(bg);

    // ── dusk sky band behind the frame ──
    const sky = new Graphics();
    sky.rect(BX - 120, BY - 150, BOARD + 240, BOARD + 320).fill({ color: 0x2a3a5e, alpha: 0.55 });
    sky.rect(BX - 120, BY + 250, BOARD + 240, 200).fill({ color: 0xc8836a, alpha: 0.28 });
    this.container.addChild(sky);

    this.buildSpirits();

    // ── gold cloisonné frame ──
    const frame = new Graphics();
    frame
      .roundRect(BX - 60, BY - 110, BOARD + 120, BOARD + 200, 16)
      .fill({ color: 0x1c1430, alpha: 0.95 })
      .stroke({ width: 3, color: GOLD });
    frame
      .roundRect(BX - 48, BY - 98, BOARD + 96, BOARD + 176, 12)
      .stroke({ width: 1, color: 0x7c5a22 });
    this.container.addChild(frame);

    // ── title plate ──
    const plate = new Graphics();
    plate
      .roundRect(CANVAS_WIDTH / 2 - 150, BY - 96, 300, 64, 10)
      .fill({ color: 0x2a2012 })
      .stroke({ width: 2, color: GOLD });
    this.container.addChild(plate);
    const title = new Text({
      text: 'NONET',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fontSize: 44,
        fill: 0xf6d680,
        letterSpacing: 10,
      }),
    });
    title.anchor.set(0.5);
    title.position.set(CANVAS_WIDTH / 2, BY - 64);
    this.container.addChild(title);

    this.banner = new Text({
      text: 'first to solve · winner x2 · everyone else halved',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: 0xffe9b8, letterSpacing: 1 }),
    });
    this.banner.anchor.set(0.5);
    this.banner.position.set(CANVAS_WIDTH / 2, BY - 18);
    this.container.addChild(this.banner);

    // ── board slot + dynamic cell graphics ──
    const slot = new Graphics();
    slot.roundRect(BX - 6, BY - 6, BOARD + 12, BOARD + 12, 8).fill({ color: 0x120c1f });
    this.container.addChild(slot);

    this.cells = new Graphics();
    this.container.addChild(this.cells);

    // 36 persistent numerals
    for (let i = 0; i < CELLS; i++) {
      const t = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 48, fill: 0xffffff }),
      });
      t.anchor.set(0.5);
      const r = Math.floor(i / N);
      const c = i % N;
      t.position.set(BX + c * CELL + CELL / 2, BY + r * CELL + CELL / 2);
      this.nums.push(t);
      this.container.addChild(t);
    }

    // CRT scanlines over the board
    const scan = new Graphics();
    for (let y = 0; y < BOARD; y += 4) {
      scan.rect(BX, BY + y, BOARD, 1.6).fill({ color: 0x000000, alpha: 0.16 });
    }
    this.container.addChild(scan);

    this.hint = new Text({
      text: 'click a cell · press 1–6 · backspace clears',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: 0xbfd0e8 }),
    });
    this.hint.anchor.set(0.5);
    this.hint.position.set(CANVAS_WIDTH / 2, BY + BOARD + 50);
    this.container.addChild(this.hint);

    this.result = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 34, fill: 0xfff2c8, letterSpacing: 2 }),
    });
    this.result.anchor.set(0.5);
    this.result.position.set(CANVAS_WIDTH / 2, BY + BOARD + 50);
    this.result.visible = false;
    this.container.addChild(this.result);

    // S95 — winner-colour resolve flood: a full-screen wash, drawn topmost + pointer-transparent,
    // filled per-frame in render() while a resolve flood is active.
    this.flood = new Graphics();
    this.flood.eventMode = 'none';
    this.flood.visible = false;
    this.container.addChild(this.flood);

    this.container.on('pointertap', this.onTap);
    window.addEventListener('keydown', this.onKey);
    app.stage.addChild(this.container);
  }

  /** Vector kami guardian + two kodama (Phase-1 placeholders for the Ghibli art). */
  private buildSpirits(): void {
    const kami = new Graphics();
    const kx = BX + BOARD + 150;
    const ky = BY + 250;
    kami.ellipse(kx, ky, 95, 130).fill(0x5f7486); // body
    kami.ellipse(kx + 4, ky + 24, 56, 88).fill(0xb9c4cb); // belly
    kami.poly([kx - 44, ky - 110, kx - 28, ky - 184, kx - 8, ky - 112]).fill(0x5f7486); // ear L
    kami.poly([kx + 6, ky - 112, kx + 28, ky - 186, kx + 48, ky - 110]).fill(0x5f7486); // ear R
    kami.circle(kx - 26, ky - 96, 17).fill(0xffffff);
    kami.circle(kx + 22, ky - 96, 17).fill(0xffffff);
    kami.circle(kx - 24, ky - 94, 7).fill(0x23303a);
    kami.circle(kx + 20, ky - 94, 7).fill(0x23303a);
    kami.poly([kx - 8, ky - 72, kx + 8, ky - 72, kx, ky - 60]).fill(0x34424c); // nose
    kami.circle(kx + 78, ky + 70, 16).fill({ color: 0xff9a4a, alpha: 0.95 }); // lantern
    this.container.addChild(kami);

    // S95 — Phase-2 auto-upgrade: when the illustrated kami sprite is present, swap it in for the
    // vector placeholder above; if the asset is absent (404) the vector spirit simply stays. The
    // sprite loads async + sits to the RIGHT of the board (kx ≈ BX+BOARD+150) so it never occludes
    // the grid. Same asset path as the Codex tile, so both upgrade off the same file.
    void Assets.load('/art/nonet/kami.webp').then((tex) => {
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.position.set(kx, ky - 18);
      sprite.scale.set(0.7); // 512 × 0.7 ≈ 358 px — matches the vector kami's footprint
      this.container.addChild(sprite);
      kami.visible = false;
    }).catch(() => { /* asset missing → keep the vector kami */ });

    for (const [x, y] of [[BX - 110, BY + BOARD + 10], [BX + BOARD + 60, BY + BOARD - 20]]) {
      const k = new Graphics();
      k.ellipse(x, y, 16, 20).fill(0xe9efe2);
      k.circle(x - 5, y - 4, 3).fill(0x2a2a2a);
      k.circle(x + 5, y - 4, 3).fill(0x2a2a2a);
      k.ellipse(x, y + 5, 3.5, 2.5).fill(0x2a2a2a);
      this.container.addChild(k);
    }
  }

  /** Per-frame. Shows/hides off world.sudoku and redraws the dynamic board state. */
  render(world: World): void {
    this.world = world;
    const ev = world.sudoku;
    if (ev === null) {
      this.container.visible = false;
      this.activeSeed = null;
      return;
    }
    if (ev.seed !== this.activeSeed) {
      // New trial → seed the local entry grid from the givens.
      this.activeSeed = ev.seed;
      this.givens = ev.puzzle.givens.slice();
      this.entries = this.givens.slice();
      this.selected = this.givens.findIndex((g) => g === 0);
      this.wrongFlash = 0;
      // S95 — realm-shift sting + reset the resolve-edge latch / any prior flood for the new trial.
      this.prevResolved = false;
      this.floodStartTick = -1;
      this.flood.visible = false;
      playNonetAppear();
    }
    this.container.visible = true;
    const resolved = ev.resolvedTick !== null;

    // S95 — resolve rising edge: fire the outcome SFX + kick off the winner-colour flood (once).
    if (resolved && !this.prevResolved) {
      this.prevResolved = true;
      if (ev.solvedBy === null) playNonetTimeout();
      else if (ev.solvedBy === world.localPlayerId) playNonetSolve();
      else playNonetLose();
      const winnerColor = ev.solvedBy !== null ? world.players.get(ev.solvedBy)?.color : undefined;
      this.floodColor = resolveFloodColor(winnerColor);
      this.floodStartTick = world.tick;
      this.container.setChildIndex(this.flood, this.container.children.length - 1); // keep topmost
    }

    this.cells.clear();
    for (let i = 0; i < CELLS; i++) {
      const r = Math.floor(i / N);
      const c = i % N;
      const x = BX + c * CELL;
      const y = BY + r * CELL;
      const d = this.entries[i];
      if (d !== 0) {
        const col = digitColor(d);
        this.cells.roundRect(x + 5, y + 5, CELL - 10, CELL - 10, 8).fill(col);
        this.cells
          .roundRect(x + 8, y + 8, CELL - 16, 18, 6)
          .fill({ color: 0xffffff, alpha: 0.28 }); // gloss bevel
        if (this.givens[i] !== 0) {
          this.cells.rect(x + 14, y + CELL - 16, CELL - 28, 3).fill({ color: GOLD, alpha: 0.85 }); // given underline
        }
        this.nums[i].text = String(d);
        this.nums[i].style.fill = numeralColor(d);
        this.nums[i].visible = true;
      } else {
        this.nums[i].visible = false;
      }
      // selection ring
      if (i === this.selected && !resolved) {
        const ring = this.wrongFlash > 0 ? 0xff5a5a : 0x8fe9ff;
        this.cells.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 8).stroke({ width: 3, color: ring });
      }
    }
    // thick gold box separators + outer border
    for (let c = BOX_W; c < N; c += BOX_W) {
      this.cells.moveTo(BX + c * CELL, BY).lineTo(BX + c * CELL, BY + BOARD).stroke({ width: 3, color: 0xcaa044 });
    }
    for (let r = BOX_H; r < N; r += BOX_H) {
      this.cells.moveTo(BX, BY + r * CELL).lineTo(BX + BOARD, BY + r * CELL).stroke({ width: 3, color: 0xcaa044 });
    }
    this.cells.roundRect(BX, BY, BOARD, BOARD, 6).stroke({ width: 2, color: GOLD });

    if (this.wrongFlash > 0) this.wrongFlash--;

    // banner / result
    if (resolved) {
      this.banner.visible = false;
      this.hint.visible = false;
      this.result.visible = true;
      const you = world.localPlayerId;
      if (ev.solvedBy === null) {
        this.result.text = "TIME'S UP — no score change";
        this.result.style.fill = 0xbfd0e8;
      } else if (ev.solvedBy === you) {
        this.result.text = 'SOLVED FIRST!  your score x2';
        this.result.style.fill = 0x8fffc0;
      } else {
        this.result.text = `player ${(ev.solvedBy as number) + 1} solved it — your score halved`;
        this.result.style.fill = 0xff9a9a;
      }
    } else {
      this.banner.visible = true;
      this.hint.visible = true;
      this.result.visible = false;
    }

    // S95 — animate the resolve flood: a winner-colour wash that flashes then eases out over ~0.75 s.
    // world.tick advances during the NONET freeze (host) / via snapshots (client), so it drives the fade.
    if (this.floodStartTick >= 0) {
      const a = floodAlpha(world.tick - this.floodStartTick);
      if (a <= 0) {
        this.floodStartTick = -1;
        this.flood.visible = false;
        this.flood.clear();
      } else {
        this.flood.clear();
        this.flood.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: this.floodColor, alpha: a });
        this.flood.visible = true;
      }
    }
  }

  private cellAt(px: number, py: number): number {
    const c = Math.floor((px - BX) / CELL);
    const r = Math.floor((py - BY) / CELL);
    if (c < 0 || c >= N || r < 0 || r >= N) return -1;
    return r * N + c;
  }

  private onTap = (e: FederatedPointerEvent): void => {
    if (!this.container.visible || this.world?.sudoku?.resolvedTick != null) return;
    const p = e.getLocalPosition(this.container);
    const idx = this.cellAt(p.x, p.y);
    if (idx >= 0 && this.givens[idx] === 0) this.selected = idx;
  };

  private onKey = (e: KeyboardEvent): void => {
    const ev = this.world?.sudoku;
    if (!this.container.visible || ev == null || ev.resolvedTick != null) return;
    if (e.key >= '1' && e.key <= '6') {
      if (this.selected >= 0 && this.givens[this.selected] === 0) {
        this.entries[this.selected] = Number(e.key);
        playNonetPop(); // S95 — kawaii cell-place pip
        const next = this.entries.findIndex((v, i) => v === 0 && this.givens[i] === 0);
        if (next >= 0) this.selected = next;
        this.maybeSubmit();
      }
      e.preventDefault();
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      if (this.selected >= 0 && this.givens[this.selected] === 0) this.entries[this.selected] = 0;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      this.selected = Math.min(CELLS - 1, this.selected + 1);
    } else if (e.key === 'ArrowLeft') {
      this.selected = Math.max(0, this.selected - 1);
    } else if (e.key === 'ArrowDown') {
      this.selected = Math.min(CELLS - 1, this.selected + N);
    } else if (e.key === 'ArrowUp') {
      this.selected = Math.max(0, this.selected - N);
    }
  };

  /** When the grid is full, submit it; a wrong grid just flashes (host rejects, race continues). */
  private maybeSubmit(): void {
    if (this.entries.some((v) => v === 0)) return;
    const won = this.onSubmit(this.entries.slice());
    if (!won) {
      this.wrongFlash = 36;
      playNonetWrong(); // S95 — comedic "bonk" on a wrong full grid
    }
  }
}
