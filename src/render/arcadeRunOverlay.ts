/**
 * SPARK — S150 P3: **THE ARCADE RUN — the three screens.**
 *
 * The clock over the puzzle, the ENTER YOUR INITIALS prompt, and the HIGH SCORES table. All state
 * lives in `arcadeRun.ts`; this file decides nothing and renders what it is handed.
 *
 * ## ⛔ VISIBILITY IS A PURE FUNCTION OF STATE, RE-EVALUATED EVERY FRAME
 *
 * This is the single most important thing about this file, and it is a direct response to a bug this
 * repo has now shipped twice: a renderer keyed on a phase or roster field drew on the TITLE SCREEN,
 * because a never-started world still reads plausible values. S149 shipped it for the border walls
 * and then found FOUR MORE HUD instruments leaking the same way.
 *
 * This overlay is the INVERSE case — it legitimately lives ON the title screen — and the inverse case
 * has its own failure mode: an overlay shown by an imperative `.show()` stays up if the matching
 * `.hide()` is ever missed on any exit path (ESC, BACK, starting a match mid-fade). Council
 * (GEMINI-AUDITOR, S150) named this precisely, and the discipline adopted from it is:
 *
 *   **`render()` is called unconditionally every frame and takes `onTitle` as an argument.** There is
 *   no `show()` and no `hide()` to forget. `run === null || !onTitle` ⇒ invisible, every frame,
 *   forever. A new exit path cannot leak this overlay into a match, because no exit path has to
 *   remember anything.
 *
 * ## Pointer transparency during the run
 *
 * While RUNNING the container is `eventMode: 'none'`: the clock floats over the NONET grid and must
 * not eat the clicks meant for it. On the two modal screens it swallows pointers deliberately, the
 * same posture `ArcadeOverlay` documents — there is no board underneath to click through to.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { elapsedMs, placeLine, type ArcadeRun } from './arcadeRun.ts';
import { formatTime, NAME_LEN, normaliseName, TOP_N } from './arcadeScores.ts';

/** Rows shown per column on the board. 25 rows in one column would not fit 1080px of height. */
const BOARD_ROWS_PER_COL = 13;
const CLOCK_Y = 54;

export interface ArcadeRunUiPoints {
  readonly visible: boolean;
  readonly phase: ArcadeRun['phase'] | null;
  readonly clock: string;
  readonly initials: string;
  readonly cursor: number;
  readonly place: string;
  readonly rows: number;
  /**
   * Index of the row highlighted as the player's own, or -1. Reported so the identity match is
   * testable: a highlight on the wrong line is invisible to every other assertion here.
   */
  readonly mineIndex: number;
  /**
   * The container's Pixi `eventMode` this frame. Exposed because the audit caught a test NAMED
   * 'swallows no pointers' that asserted nothing of the kind: during RUNNING the clock floats over
   * the NONET grid and must be `'none'`, or the puzzle becomes unplayable, and that property had
   * zero coverage.
   */
  readonly eventMode: string;
}

export class ArcadeRunOverlay {
  private readonly container: Container;
  private readonly graphics: Graphics;
  private readonly labels: Text[] = [];
  private used = 0;
  /** Which board row was highlighted this frame, or -1. Set by drawBoard, reported by getUiPoints. */
  private mineIndex = -1;
  private last: ArcadeRunUiPoints = {
    visible: false, phase: null, clock: '', initials: '', cursor: 0, place: '', rows: 0,
    mineIndex: -1, eventMode: 'auto',
  };

  constructor(app: Application, parent: Container = app.stage) {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    this.container.visible = false;
    this.container.hitArea = {
      contains: (x: number, y: number) => x >= 0 && x <= CANVAS_WIDTH && y >= 0 && y <= CANVAS_HEIGHT,
    };
    parent.addChild(this.container);
  }

  /**
   * ⭐ THE ONLY ENTRY POINT. Call it every frame with the current run (or `null`) and whether the app
   * is on the title screen. See the docblock: the absence of `show()`/`hide()` is the design.
   */
  render(run: ArcadeRun | null, nowMs: number, onTitle: boolean): void {
    const g = this.graphics;
    g.clear();
    this.used = 0;
    this.mineIndex = -1;

    if (run === null || !onTitle) {
      this.container.visible = false;
      this.hideFrom(0);
      this.last = {
        visible: false, phase: null, clock: '', initials: '', cursor: 0, place: '', rows: 0,
        mineIndex: -1, eventMode: String(this.container.eventMode),
      };
      return;
    }

    this.container.visible = true;
    // Re-assert stacking every frame for the same reason ArcadeOverlay does on show(): this overlay
    // is constructed before the renderers that would otherwise draw over it, and `addChild` on an
    // existing child moves it to the end. Cheap, and immune to construction order changing later.
    const parent = this.container.parent;
    if (parent !== null) parent.addChild(this.container);

    if (run.phase === 'RUNNING') {
      this.container.eventMode = 'none';
      this.drawClock(run, nowMs);
    } else {
      this.container.eventMode = 'static';
      if (run.phase === 'ENTER_INITIALS') this.drawInitials(run, nowMs);
      else this.drawBoard(run);
    }

    this.hideFrom(this.used);
    this.last = {
      visible: true,
      phase: run.phase,
      clock: formatTime(elapsedMs(run, nowMs)),
      initials: run.initials.join(''),
      cursor: run.cursor,
      place: placeLine(run),
      rows: run.scores.length,
      mineIndex: this.mineIndex,
      eventMode: String(this.container.eventMode),
    };
  }

  /** S85 P4c geometry-getter convention — what is actually on screen, for e2e. */
  getUiPoints(): ArcadeRunUiPoints {
    return this.last;
  }

  destroy(): void {
    for (const t of this.labels) t.destroy();
    this.graphics.destroy();
    this.container.destroy();
  }

  /** The live clock: a plate at the top of the board, deliberately clear of the NONET grid. */
  private drawClock(run: ArcadeRun, nowMs: number): void {
    const text = formatTime(elapsedMs(run, nowMs));
    const w = 210;
    const h = 52;
    const x = (CANVAS_WIDTH - w) / 2;
    // ⚠ An opaque plate, not text alone. The NONET grid is light and a bare glyph over it was
    // unreadable — the "look at the frame" lesson: no unit test can see contrast.
    this.graphics.roundRect(x, CLOCK_Y - h / 2, w, h, 10).fill({ color: 0x05070c, alpha: 0.88 });
    this.graphics.roundRect(x, CLOCK_Y - h / 2, w, h, 10).stroke({ width: 2, color: 0xffd60a, alpha: 0.85 });
    this.text(text, CANVAS_WIDTH / 2, CLOCK_Y, 34, 0xffd60a);
  }

  private drawInitials(run: ArcadeRun, nowMs: number): void {
    this.backdrop();
    const midY = CANVAS_HEIGHT / 2;
    this.text('SOLVED', CANVAS_WIDTH / 2, midY - 190, 46, 0xffd60a);
    this.text(formatTime(elapsedMs(run, nowMs)), CANVAS_WIDTH / 2, midY - 128, 62, 0xffffff);
    this.text('ENTER YOUR INITIALS', CANVAS_WIDTH / 2, midY - 56, 24, 0x9aa6b8);

    // Three cells, monospaced and equal width — the reason arcade boards align without measuring.
    const cell = 84;
    const gap = 22;
    const totalW = NAME_LEN * cell + (NAME_LEN - 1) * gap;
    const left = (CANVAS_WIDTH - totalW) / 2;
    for (let i = 0; i < NAME_LEN; i++) {
      const x = left + i * (cell + gap);
      const active = i === run.cursor;
      this.graphics.roundRect(x, midY, cell, cell, 10).fill({ color: 0x0b1018, alpha: 0.95 });
      this.graphics
        .roundRect(x, midY, cell, cell, 10)
        .stroke({ width: active ? 4 : 2, color: active ? 0xffd60a : 0x6f7b8f, alpha: 0.95 });
      // A space would render as nothing at all, so the cell shows an underscore placeholder. The
      // stored character is still the space — this is the GLYPH, not the value.
      const ch = run.initials[i] === ' ' ? '_' : run.initials[i];
      this.text(ch, x + cell / 2, midY + cell / 2, 54, active ? 0xffd60a : 0xc8d2e0);
    }

    this.text(
      '↑↓ change letter    ←→ move    ENTER to register',
      CANVAS_WIDTH / 2,
      midY + cell + 58,
      18,
      0x8f9bb0,
    );
  }

  private drawBoard(run: ArcadeRun): void {
    this.backdrop();
    this.text('HIGH SCORES', CANVAS_WIDTH / 2, 96, 48, 0xffd60a);
    const line = placeLine(run);
    if (line !== '') {
      this.text(line, CANVAS_WIDTH / 2, 150, 26, run.onBoard ? 0x7dffa8 : 0xff8f6f);
    }

    // The player's own row is the one they came to see, so it is highlighted — matched on the full
    // identity TRIPLE (name AND time AND commit stamp), never on name alone and not on (name, time)
    // either. Caught by looking at the real frame: two rows sharing a time and a set of initials is
    // not a contrived case, it is what happens when the same player repeats a board they have
    // memorised — and the pair alone highlighted whichever of them sorted first.
    // ⛔ S150 LANDING AUDIT — NORMALISE BEFORE COMPARING. This was `run.initials.join('')`, the RAW
    // initials, and P3's own blank-name fix turned that into a bug in the same commit: `recordRun`
    // stores `normaliseName(name)`, so a player who spells '   ' has 'AAA' on the board while the
    // overlay hunted for '   ' and highlighted nothing. Reachable in five keystrokes — the alphabet
    // ends with a space and `cycleLetter` wraps backward from 'A' straight onto it.
    //
    // The lesson generalises past this line: when a WRITE path normalises, every READ path that
    // matches on the written value has to apply the same function, or the two silently disagree.
    const myName = normaliseName(run.initials.join(''));
    const mine = run.scores.findIndex(
      (s) => s.ms === run.finishedMs && s.name === myName && s.at === run.committedAtMs,
    );
    this.mineIndex = mine;

    const colW = 460;
    const rowH = 34;
    const top = 208;
    const cols = Math.ceil(Math.min(run.scores.length, TOP_N) / BOARD_ROWS_PER_COL) || 1;
    const leftBase = (CANVAS_WIDTH - cols * colW) / 2;

    if (run.scores.length === 0) {
      this.text('NO SCORES YET', CANVAS_WIDTH / 2, top + 40, 24, 0x8f9bb0);
      return;
    }

    for (let i = 0; i < run.scores.length && i < TOP_N; i++) {
      const s = run.scores[i];
      const col = Math.floor(i / BOARD_ROWS_PER_COL);
      const row = i % BOARD_ROWS_PER_COL;
      const x = leftBase + col * colW;
      const y = top + row * rowH;
      const isMine = i === mine;
      if (isMine) {
        this.graphics.roundRect(x - 8, y - rowH / 2 + 3, colW - 24, rowH - 6, 6)
          .fill({ color: 0xffd60a, alpha: 0.14 });
      }
      const tint = isMine ? 0xffd60a : 0xc8d2e0;
      // RANK · TIME · NAME, in that order — the cabinet convention arcadeScores.ts documents.
      this.textLeft(`${String(i + 1).padStart(2, ' ')}.`, x, y, 22, tint);
      this.textLeft(formatTime(s.ms), x + 66, y, 22, tint);
      this.textLeft(s.name, x + 236, y, 22, tint);
    }

    this.text('ESC to leave    ENTER for another run', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 54, 18, 0x8f9bb0);
  }

  private backdrop(): void {
    this.graphics.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x05070c, alpha: 0.96 });
  }

  /**
   * Text from a reusable pool.
   *
   * Pixi `Text` objects are expensive to build and this overlay redraws every frame, so labels are
   * recycled by index and the surplus is hidden rather than destroyed — the same pattern
   * `footerBand.ts` uses for exactly the same reason.
   */
  private text(str: string, x: number, y: number, size: number, fill: number): void {
    this.place(str, x, y, size, fill, 0.5);
  }

  private textLeft(str: string, x: number, y: number, size: number, fill: number): void {
    this.place(str, x, y, size, fill, 0);
  }

  private place(str: string, x: number, y: number, size: number, fill: number, anchorX: number): void {
    let t = this.labels[this.used];
    if (t === undefined) {
      t = new Text({ text: str, style: { fontFamily: 'monospace', fontSize: size, fill } });
      this.labels[this.used] = t;
      this.container.addChild(t);
    }
    t.text = str;
    t.style.fontSize = size;
    t.style.fill = fill;
    t.anchor.set(anchorX, 0.5);
    t.position.set(x, y);
    t.visible = true;
    this.used++;
  }

  private hideFrom(index: number): void {
    for (let i = index; i < this.labels.length; i++) this.labels[i].visible = false;
  }
}
