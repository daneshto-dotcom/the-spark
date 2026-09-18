/**
 * SPARK — **THE ARCADE RUN — the four screens.** S150 built three, S182 R182-G added the recap.
 *
 * The clock over the puzzle, ENTER YOUR INITIALS, the RECAP cinematic, and the RANKING. All state
 * lives in `arcadeRun.ts`; this file decides nothing and renders what it is handed.
 *
 * ## ⛔ VISIBILITY IS A PURE FUNCTION OF STATE, RE-EVALUATED EVERY FRAME
 *
 * The single most important thing about this file, and a direct response to a bug this repo has
 * shipped twice: a renderer keyed on a phase or roster field drew on the TITLE SCREEN, because a
 * never-started world still reads plausible values. S149 shipped it for the border walls and then
 * found FOUR MORE HUD instruments leaking the same way.
 *
 * This overlay is the INVERSE case — it legitimately lives ON the title screen — and the inverse case
 * has its own failure mode: an overlay shown by an imperative `.show()` stays up if the matching
 * `.hide()` is ever missed on any exit path. So **`render()` is called unconditionally every frame
 * and takes `onTitle` as an argument.** There is no `show()` and no `hide()` to forget.
 * `run === null || !onTitle` ⇒ invisible, every frame, forever.
 *
 * ## ⛔ AND THE RANKING CANNOT LEAK EARLY, BY CONSTRUCTION
 *
 * Owner R182-G: *"You can't see all the names before you put your name, and that way people won't
 * cheat and try to change each other's score."* This file cannot violate that even by mistake,
 * because it reads rows only through `visibleRows(run)` and no phase before `RECAP` carries any. The
 * gate is in the state machine's TYPE, not in this renderer's discipline.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import {
  elapsedMs,
  placeLine,
  recapAverageMs,
  recapSettled,
  runName,
  visibleRows,
  type ArcadeRun,
} from './arcadeRun.ts';
import { formatTime, NAME_LEN, TOP_N } from './arcadeScores.ts';
import {
  bannerPose,
  CELEBRATION_DURATION_TICKS,
  fireworkParticles,
  jackpotGlowAlpha,
  jackpotGlowColor,
  makeFireworks,
  type Firework,
} from './nonetCelebration.ts';
import { mulberry32 } from '../state/rng.ts';

/** Rows shown per column. 25 rows in one column would not fit 1080px of height. */
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
   * The container's Pixi `eventMode` this frame. Exposed because an audit once caught a test NAMED
   * 'swallows no pointers' that asserted nothing of the kind: during RUNNING the clock floats over
   * the NONET grid and must be `'none'`, or the puzzle becomes unplayable.
   */
  readonly eventMode: string;
  /** True while the high-score celebration is playing. */
  readonly celebrating: boolean;
  /** Firework particles drawn this frame — 0 when the celebration is over or was never earned. */
  readonly particles: number;
  /** ⭐ R182-G — the average as printed during the recap, so the cinematic is assertable. */
  readonly recapAverage: string;
  /** Whether this build is showing the SHARED ranking or the local one. */
  readonly shared: boolean;
}

const BLANK: ArcadeRunUiPoints = {
  visible: false, phase: null, clock: '', initials: '', cursor: 0, place: '', rows: 0,
  mineIndex: -1, eventMode: 'auto', celebrating: false, particles: 0, recapAverage: '', shared: false,
};

export class ArcadeRunOverlay {
  private readonly container: Container;
  private readonly graphics: Graphics;
  private readonly labels: Text[] = [];
  private used = 0;
  private mineIndex = -1;
  /**
   * ⭐ CELEBRATION STATE, latched HERE rather than on `ArcadeRun`, so the run model stays a pure
   * state machine with no animation in it. Two things must be stable across frames or the display
   * tears: the moment the board appeared (or the clock restarts every frame and nothing finishes),
   * and the firework layout (or every rocket teleports at 60 Hz). Both computed ONCE on transition.
   */
  private boardStartedMs: number | null = null;
  private fireworks: readonly Firework[] = [];
  private particleCount = 0;
  private recapAverageText = '';
  private last: ArcadeRunUiPoints = BLANK;

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
   * is on the title screen. The absence of `show()`/`hide()` is the design.
   */
  render(run: ArcadeRun | null, nowMs: number, onTitle: boolean): void {
    const g = this.graphics;
    g.clear();
    this.used = 0;
    this.mineIndex = -1;
    this.recapAverageText = '';

    if (run === null || !onTitle) {
      this.container.visible = false;
      this.hideFrom(0);
      // Drop the latch: a NEW run that reaches the board must celebrate from zero, not inherit a
      // clock that has already expired.
      this.boardStartedMs = null;
      this.last = { ...BLANK, eventMode: String(this.container.eventMode) };
      return;
    }

    this.container.visible = true;
    // Re-assert stacking every frame: this overlay is constructed before the renderers that would
    // otherwise draw over it, and `addChild` on an existing child moves it to the end. Cheap, and
    // immune to construction order changing later.
    const parent = this.container.parent;
    if (parent !== null) parent.addChild(this.container);

    if (run.phase !== 'BOARD') this.boardStartedMs = null;
    else if (this.boardStartedMs === null) {
      this.boardStartedMs = nowMs;
      // Seeded off the run's own time so a replay lays its rockets out identically, and so the
      // layout cannot shimmer between frames.
      this.fireworks = makeFireworks(9, CANVAS_WIDTH, CANVAS_HEIGHT, mulberry32((run.finishedMs ?? 1) >>> 0));
    }

    if (run.phase === 'RUNNING') {
      this.container.eventMode = 'none';
      this.drawClock(run, nowMs);
    } else {
      this.container.eventMode = 'static';
      if (run.phase === 'ENTER_INITIALS') this.drawInitials(run, nowMs);
      else if (run.phase === 'RECAP') this.drawRecap(run, nowMs);
      else this.drawBoard(run, nowMs);
    }

    this.hideFrom(this.used);
    this.last = {
      visible: true,
      phase: run.phase,
      clock: formatTime(elapsedMs(run, nowMs)),
      initials: run.initials.join(''),
      cursor: run.cursor,
      place: placeLine(run),
      rows: visibleRows(run).length,
      mineIndex: this.mineIndex,
      eventMode: String(this.container.eventMode),
      celebrating: this.celebrationElapsed(run, nowMs) !== null,
      particles: this.particleCount,
      recapAverage: this.recapAverageText,
      shared: run.update?.shared ?? false,
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

  /** Step 1 and 2 of R182-G: this run's time, then the name. */
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
      // A space renders as nothing at all, so the cell shows an underscore placeholder. The stored
      // character is still the space — this is the GLYPH, not the value.
      const ch = run.initials[i] === ' ' ? '_' : run.initials[i];
      this.text(ch, x + cell / 2, midY + cell / 2, 54, active ? 0xffd60a : 0xc8d2e0);
    }

    // ⚠ A submission crosses the network, so it can take a moment. Saying so is the difference
    // between "it is working" and "it has frozen" — and this screen is where a player is most
    // invested in the outcome.
    this.text(
      run.submitting ? 'SAVING…' : '↑↓ change letter    ←→ move    ENTER to register',
      CANVAS_WIDTH / 2,
      midY + cell + 58,
      18,
      run.submitting ? 0xffd60a : 0x8f9bb0,
    );
  }

  /**
   * ⭐⭐ R182-G STEP 5 — THE CALCULATION, AS A BEAT.
   *
   * Owner: *"there'll be a cool little cinematic of the whole calculation: 'we finished this in a
   * minute zero three, so far your best average is a minute eighteen, that brings it down to...' —
   * you already played six games, this is your seventh, so it brings it down to that."*
   *
   * So the screen states the sentence in his order: THIS RUN, then what the average WAS, then the new
   * one easing between them, then the run count. The eased number is the whole point — a cut between
   * two figures is arithmetic, a movement between them is a result.
   */
  private drawRecap(run: ArcadeRun, nowMs: number): void {
    const u = run.update;
    if (u === null) return;
    this.backdrop();
    const midY = CANVAS_HEIGHT / 2;
    const first = u.previousAverageMs === null;

    this.text('THIS RUN', CANVAS_WIDTH / 2, midY - 250, 22, 0x9aa6b8);
    this.text(formatTime(u.lastMs), CANVAS_WIDTH / 2, midY - 200, 58, 0xffffff);

    if (first) {
      // ⚠ A first run has no "before", and inventing one (0:00, or the run itself) would read as a
      // player having lost something. It is simply their average now.
      this.text('YOUR FIRST RUN', CANVAS_WIDTH / 2, midY - 110, 26, 0x7dffa8);
    } else {
      this.text('YOUR AVERAGE WAS', CANVAS_WIDTH / 2, midY - 120, 22, 0x9aa6b8);
      this.text(formatTime(u.previousAverageMs ?? 0), CANVAS_WIDTH / 2, midY - 74, 40, 0xc8d2e0);
    }

    const eased = recapAverageMs(run, nowMs);
    this.recapAverageText = formatTime(eased);
    this.text(first ? 'YOUR RANKING TIME' : 'WHICH BRINGS IT TO', CANVAS_WIDTH / 2, midY + 6, 22, 0x9aa6b8);
    // Green when the average improved, amber when it slipped — the direction IS the feedback, and a
    // slower run genuinely costing you something is what makes a long span competitive.
    const better = first || u.averageMs <= (u.previousAverageMs ?? Number.POSITIVE_INFINITY);
    this.text(this.recapAverageText, CANVAS_WIDTH / 2, midY + 66, 76, better ? 0x7dffa8 : 0xffc46b);

    const ordinal = ordinalOf(u.runs);
    this.text(
      u.flushed > 0
        ? `RUN ${u.runs} — INCLUDING ${u.flushed} SAVED OFFLINE`
        : `YOU HAVE PLAYED ${u.runs} ${u.runs === 1 ? 'GAME' : 'GAMES'} — THIS IS YOUR ${ordinal}`,
      CANVAS_WIDTH / 2,
      midY + 140,
      22,
      0x9aa6b8,
    );

    if (recapSettled(run, nowMs)) {
      this.text('ENTER to see the ranking', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 54, 18, 0x8f9bb0);
    }
  }

  /** Step 4 — and only now. */
  private drawBoard(run: ArcadeRun, nowMs: number): void {
    this.backdrop();
    const rows = visibleRows(run);
    this.text('RANKING', CANVAS_WIDTH / 2, 84, 48, 0xffd60a);
    // ⭐ Say WHAT this is. "3rd in the world" and "3rd on this machine" are different claims and the
    // player is owed the difference — especially since the offline tier is silent otherwise.
    this.text(
      run.update?.shared === true ? 'everyone · by average time' : 'this device only · by average time',
      CANVAS_WIDTH / 2,
      124,
      18,
      run.update?.shared === true ? 0x7dffa8 : 0x8f9bb0,
    );
    const line = placeLine(run);
    if (line !== '') this.text(line, CANVAS_WIDTH / 2, 164, 26, 0x7dffa8);

    // ⛔ MATCHED ON THE NAME, because under R182-G a player IS a row rather than owning one of many.
    // There is exactly one row per name, so there is exactly one answer and no tie-break needed —
    // which is a genuine simplification over the old `(name, ms, at)` triple.
    const myName = run.update === null ? '' : runName(run);
    const mine = rows.findIndex((r) => r.name === myName);
    this.mineIndex = mine;

    const colW = 500;
    const rowH = 34;
    const top = 214;
    const cols = Math.ceil(Math.min(rows.length, TOP_N) / BOARD_ROWS_PER_COL) || 1;
    const leftBase = (CANVAS_WIDTH - cols * colW) / 2;

    if (rows.length === 0) {
      this.text('NO RANKING YET', CANVAS_WIDTH / 2, top + 40, 24, 0x8f9bb0);
      return;
    }

    for (let i = 0; i < rows.length && i < TOP_N; i++) {
      const r = rows[i];
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
      // RANK · NAME · AVERAGE · RUNS. The run count earns its column: an average over 40 games is a
      // different claim from one over 2, and hiding that would make the table look arbitrary.
      this.textLeft(`${String(i + 1).padStart(2, ' ')}.`, x, y, 22, tint);
      this.textLeft(r.name, x + 56, y, 22, tint);
      this.textLeft(formatTime(r.averageMs), x + 170, y, 22, tint);
      this.textLeft(`${r.runs}${r.runs === 1 ? ' run' : ' runs'}`, x + 330, y, 18, isMine ? 0xffd60a : 0x8f9bb0);
    }

    this.text('ESC to leave    ENTER for another run', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 54, 18, 0x8f9bb0);
    this.drawCelebration(run, nowMs);
  }

  /**
   * Ticks since the board appeared, or `null` when no celebration is owed or it has finished.
   *
   * ⚠ DRIVEN BY WALL CLOCK, CONVERTED TO TICKS. `nonetCelebration`'s math is written in ticks because
   * its original caller rides `world.tick` — but the sim does not advance on the title screen, so a
   * tick-driven celebration here would never move. Converting at 60/s keeps the shared math correct:
   * the same easing, the same photosensitivity ceiling, one source.
   */
  private celebrationElapsed(run: ArcadeRun, nowMs: number): number | null {
    if (run.phase !== 'BOARD' || this.boardStartedMs === null) return null;
    const elapsed = ((nowMs - this.boardStartedMs) / 1000) * 60;
    return elapsed >= 0 && elapsed < CELEBRATION_DURATION_TICKS ? elapsed : null;
  }

  /**
   * ⭐ FIREWORKS FOR A RANKING THAT IMPROVED.
   *
   * Reuses `nonetCelebration.ts` wholesale rather than inventing a second effect: that module is
   * pure, unit-tested, and carries this project's PHOTOSENSITIVITY CHARTER — the full-screen glow
   * breathes at ~0.95 Hz under a 0.30 alpha ceiling, with the "flashy" feel coming from small-area
   * particles rather than a strobe.
   *
   * ⚠ THE TRIGGER CHANGED WITH THE DESIGN. It used to be "did you make the table", which under
   * R182-G is always true — everyone is ranked from their first game, so celebrating it would
   * celebrate nothing. It now fires when the average IMPROVED (or on a first run). Celebrating a run
   * that made you slower is how a reward stops meaning anything.
   */
  private drawCelebration(run: ArcadeRun, nowMs: number): void {
    this.particleCount = 0;
    const u = run.update;
    if (u === null) return;
    const improved = u.previousAverageMs === null || u.averageMs < u.previousAverageMs;
    if (!improved) return;
    const elapsed = this.celebrationElapsed(run, nowMs);
    if (elapsed === null) return;

    const glow = jackpotGlowAlpha(elapsed);
    if (glow > 0) {
      this.graphics.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
        .fill({ color: jackpotGlowColor(elapsed), alpha: glow });
    }

    for (const fw of this.fireworks) {
      for (const pt of fireworkParticles(fw, elapsed, CANVAS_HEIGHT)) {
        this.graphics.circle(pt.x, pt.y, pt.r).fill({ color: pt.color, alpha: pt.alpha });
        this.particleCount++;
      }
    }

    const pose = bannerPose(elapsed);
    if (pose.alpha > 0) {
      const word = u.place === 1 ? 'TOP OF THE RANKING!' : 'AVERAGE IMPROVED!';
      this.text(word, CANVAS_WIDTH / 2, 168, Math.round(40 * pose.scale), 0xffd60a, pose.alpha);
      this.text('CONGRATULATIONS', CANVAS_WIDTH / 2, 168 + Math.round(34 * pose.scale), 20, 0xffffff, pose.alpha);
    }
  }

  private backdrop(): void {
    this.graphics.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x05070c, alpha: 0.96 });
  }

  /**
   * Text from a reusable pool.
   *
   * Pixi `Text` objects are expensive to build and this overlay redraws every frame, so labels are
   * recycled by index and the surplus hidden rather than destroyed — the same pattern `footerBand.ts`
   * uses for the same reason.
   */
  private text(str: string, x: number, y: number, size: number, fill: number, alpha = 1): void {
    this.place(str, x, y, size, fill, 0.5, alpha);
  }

  private textLeft(str: string, x: number, y: number, size: number, fill: number): void {
    this.place(str, x, y, size, fill, 0, 1);
  }

  private place(
    str: string, x: number, y: number, size: number, fill: number, anchorX: number, alpha = 1,
  ): void {
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
    t.alpha = alpha;
    t.visible = true;
    this.used++;
  }

  private hideFrom(index: number): void {
    for (let i = index; i < this.labels.length; i++) this.labels[i].visible = false;
  }
}

/** PURE — "7th", "1st", "23rd". Exported-adjacent helper kept local; the recap is its only caller. */
function ordinalOf(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

