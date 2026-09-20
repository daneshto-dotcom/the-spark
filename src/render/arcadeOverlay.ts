/**
 * SPARK — S149 P5: **ARCADE MODE.**
 *
 * *"we will add ARCADE option to the front page below the Codex and add bunch of minigames like the
 * NONET SODOKU"* — owner, S149.
 *
 * A title-screen menu of standalone minigames. One entry today (NONET), built so adding the next is
 * one row in `ARCADE_GAMES` rather than a new overlay.
 *
 * ## ⭐ WHY THIS EXISTS AT ALL: NONET WAS ABOUT TO BE DELETED
 *
 * The S148 roadmap listed the NONET trial (~1,081 LOC) for demolition. The owner reversed that
 * outright: *"you may not delete NONET. if anything we have made NONET very well and i will use the
 * code for it either in this game or we will add ARCADE option."* This is that home. The trial
 * stays wired into matches exactly as before; the arcade adds a SECOND way to reach the same
 * shipped puzzle, with no fork of the game logic.
 *
 * ## ⛔ THE ARCADE TOUCHES NO SIMULATION STATE
 *
 * `world.sudoku` is a hashed, wire-carried World field — a NONET in a match is a host-authoritative
 * event with a seat that triggered it and a seat that solved it. None of that exists on a title
 * screen. So an arcade puzzle is held HERE, as ordinary render state, and handed to
 * `SudokuOverlay.render`'s `override` parameter. Nothing enters `world`, so nothing is serialized,
 * hashed, or shipped to a peer, and starting a real match afterwards inherits nothing.
 *
 * The puzzle itself is the SHIPPED generator (`generateSudoku`) — the arcade plays the same NONET
 * the game does, not a lookalike.
 */

import { attachButtonFeedback } from './buttonFeedback.ts';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { generateSudoku, type SudokuEvent } from '../state/sudoku.ts';
import { asPlayerId } from '../types.ts';

/** One row on the arcade menu. */
export interface ArcadeGame {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly tint: number;
}

/**
 * The roster. Adding a minigame is a row here plus a branch in `launch` — deliberately a table so
 * the menu's layout, hit-testing and geometry getter all derive from it rather than from a count
 * someone has to remember to bump.
 */
export const ARCADE_GAMES: readonly ArcadeGame[] = [
  {
    id: 'nonet',
    name: 'NONET',
    blurb: 'the six-colour logic trial — fill every row, column and box',
    tint: 0x9b7bff,
  },
];

const ROW_W = 560;
const ROW_H = 78;
const ROW_GAP = 18;
const TITLE_Y = CANVAS_HEIGHT / 2 - 220;
const FIRST_ROW_Y = CANVAS_HEIGHT / 2 - 90;
const BACK_W = 220;
const BACK_H = 56;

export interface ArcadeRowGeom {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** PURE — row rectangles, centred. Exported so layout is testable without Pixi. */
export function arcadeRowGeoms(games: readonly ArcadeGame[] = ARCADE_GAMES): ArcadeRowGeom[] {
  const left = (CANVAS_WIDTH - ROW_W) / 2;
  return games.map((g, i) => ({
    id: g.id,
    x: left,
    y: FIRST_ROW_Y + i * (ROW_H + ROW_GAP),
    w: ROW_W,
    h: ROW_H,
  }));
}

/** PURE — the BACK button's rectangle, below the last row. */
export function arcadeBackGeom(games: readonly ArcadeGame[] = ARCADE_GAMES): ArcadeRowGeom {
  const rows = arcadeRowGeoms(games);
  const lastBottom = rows.length > 0 ? rows[rows.length - 1].y + ROW_H : FIRST_ROW_Y;
  return {
    id: 'back',
    x: (CANVAS_WIDTH - BACK_W) / 2,
    y: lastBottom + 46,
    w: BACK_W,
    h: BACK_H,
  };
}

/**
 * A fresh arcade NONET.
 *
 * ⚠ `triggeredBy` is seat 0 and `solvedBy` stays null: the arcade has no seats, and those fields
 * exist only because the event shape is shared with the match trial. They are never read by the
 * arcade path — the overlay renders the puzzle, and solving is decided locally against
 * `puzzle.solution`.
 */
export function makeArcadeNonet(seed: number): SudokuEvent {
  return {
    seed,
    puzzle: generateSudoku(seed),
    startTick: 0,
    triggeredBy: asPlayerId(0),
    solvedBy: null,
    resolvedTick: null,
  };
}

export class ArcadeOverlay {
  private readonly container: Container;
  private readonly buttons: Container[] = [];
  private onSelect: (id: string) => void = () => {};
  private readonly graphics: Graphics;
  private readonly texts: Text[] = [];
  private open = false;

  /**
   * `onSelect` receives a game id, or `'back'`.
   *
   * ⚠ THE WHOLE OVERLAY SWALLOWS POINTER EVENTS, and unlike the footer band that is correct here:
   * this is a full-screen modal over the title screen, so there is no board underneath for a click
   * to fall through to. The footer sits ON the playfield, which is why its guard is chip-only.
   */
  constructor(app: Application, parent: Container = app.stage, onSelect: (id: string) => void = () => {}) {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= CANVAS_WIDTH && y >= 0 && y <= CANVAS_HEIGHT };
    this.onSelect = onSelect;
    this.container.on('pointertap', (e: { global: { x: number; y: number } }) => {
      if (!this.open) return;
      const local = this.container.toLocal(e.global);
      const id = this.hitTest(local.x, local.y);
      if (id !== null) onSelect(id);
    });
    parent.addChild(this.container);
    this.build();
  }

  show(): void {
    this.open = true;
    this.container.visible = true;
    // ⛔ S149 P5 FIX — RE-ADD TO THE PARENT SO IT IS ON TOP.
    //
    // This overlay is constructed BEFORE `TitleScreen` (its select-callback has to exist before the
    // title's callbacks are built), so it lands EARLIER in `app.stage.children` and Pixi drew the
    // whole title screen — logo, subtitle, all five buttons — straight through the menu's backdrop.
    // Caught by looking at the screenshot; no headless test can see a z-order fault. `addChild` on
    // an existing child MOVES it to the end, so this is the cheapest correct fix and it re-asserts
    // itself every time the menu opens, immune to whatever is constructed later.
    const parent = this.container.parent;
    if (parent !== null) parent.addChild(this.container);
  }

  hide(): void {
    this.open = false;
    this.container.visible = false;
  }

  isOpen(): boolean {
    return this.open;
  }

  /** The game id under this canvas point, `'back'`, or null. */
  hitTest(x: number, y: number): string | null {
    if (!this.open) return null;
    for (const r of [...arcadeRowGeoms(), arcadeBackGeom()]) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id;
    }
    return null;
  }

  /** S85 P4c geometry-getter convention — live click geometry for e2e. */
  getUiPoints(): { open: boolean; rows: ArcadeRowGeom[]; back: ArcadeRowGeom } {
    return { open: this.open, rows: arcadeRowGeoms(), back: arcadeBackGeom() };
  }

  destroy(): void {
    for (const t of this.texts) t.destroy();
    this.graphics.destroy();
    this.container.destroy();
  }

  /** Static chrome — drawn once; the menu has no per-frame state. */
  private build(): void {
    const g = this.graphics;
    g.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x05070c, alpha: 0.95 });

    this.addText('ARCADE', CANVAS_WIDTH / 2, TITLE_Y, 54, 0xffd60a);
    this.addText(
      'standalone trials — no match, no opponents, just the puzzle',
      CANVAS_WIDTH / 2,
      TITLE_Y + 52,
      20,
      0x9aa6b8,
    );

    /*
     * ⭐⭐ S185 — THE ARCADE ROWS POP, LIKE EVERY OTHER BUTTON. Owner, auditing the whole UI in one
     * pass: *"on the main screen they all pop out when you mouse over them, which is great. But then
     * if you go to arcade, the next stage doesn't pop out. So the NONET doesn't, the back one
     * doesn't."*
     *
     * ⚠ THEY USED TO BE PAINTED STRAIGHT ONTO THE SHARED BACKDROP GRAPHICS and hit-tested by
     * rectangle from a container-level tap. That cannot pop: there is no node to scale. Each row and
     * BACK now own a Container with their own plate and labels, centred on their pivot, which is
     * what lets `attachButtonFeedback` give them the same hover/press/click grammar — and the same
     * click SOUND — as the title screen, rather than a second look-alike written here.
     *
     * ⭐ `hitTest` IS DELIBERATELY UNTOUCHED AND STILL CORRECT. It reads the same pure geometry
     * helpers, so the keyboard/geometry path and the pointer path cannot drift apart, and the
     * container-level tap below stays as the fallback for anything not inside a row.
     */
    const rows = arcadeRowGeoms();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const game = ARCADE_GAMES[i];
      this.addButton(r, 12, game.tint, () => this.onSelect(r.id), [
        { text: game.name, dy: 26, size: 28, fill: game.tint },
        { text: game.blurb, dy: 55, size: 16, fill: 0x8f9bb0 },
      ]);
    }

    const back = arcadeBackGeom();
    this.addButton(back, 10, 0x6f7b8f, () => this.onSelect('back'), [
      { text: 'BACK', dy: back.h / 2, size: 24, fill: 0xc8d2e0 },
    ]);
  }

  /** One pop-out button: its own plate, its own labels, centred so it scales from the middle. */
  private addButton(
    r: { x: number; y: number; w: number; h: number },
    radius: number,
    stroke: number,
    onClick: () => void,
    labels: readonly { text: string; dy: number; size: number; fill: number }[],
  ): void {
    const btn = new Container();
    const plate = new Graphics();
    plate.roundRect(0, 0, r.w, r.h, radius).fill({ color: 0x0b1018, alpha: 0.95 });
    plate.roundRect(0, 0, r.w, r.h, radius).stroke({ width: 2, color: stroke, alpha: 0.9 });
    btn.addChild(plate);
    for (const l of labels) {
      const t = new Text({ text: l.text, style: { fontFamily: 'monospace', fontSize: l.size, fill: l.fill } });
      t.anchor.set(0.5);
      t.position.set(r.w / 2, l.dy);
      btn.addChild(t);
      this.texts.push(t);
    }
    btn.pivot.set(r.w / 2, r.h / 2);
    btn.position.set(r.x + r.w / 2, r.y + r.h / 2);
    attachButtonFeedback(btn, plate, onClick, { hit: { x: 0, y: 0, w: r.w, h: r.h } });
    this.container.addChild(btn);
    this.buttons.push(btn);
  }

  private addText(text: string, x: number, y: number, size: number, fill: number): void {
    const t = new Text({ text, style: { fontFamily: 'monospace', fontSize: size, fill } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.container.addChild(t);
    this.texts.push(t);
  }
}
