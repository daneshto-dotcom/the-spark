/**
 * SPARK — ⭐ S191 THE STAT BOARD'S EAGER SHIM. The board itself (`matchBoard.ts` + its model) is a LAZY chunk.
 *
 * ⛔ WHY LAZY: the board is needed once, in POSTGAME, and costs ~8 KiB of view + model. Eager, it put the
 * branch at +12.4 KiB of the entry chunk against a 10 KiB budget (measured S191, base 955.9 → 968.3 KiB).
 * The codex, NONET and bot-setup overlays already load on demand for exactly this reason. This shim is what
 * `main.ts` constructs and stages: it owns the Container (so the staging line decides z-order as before),
 * fetches the chunk as soon as a match is RUNNING — long before anyone can reach POSTGAME — and until the
 * board exists it answers as "no board": `isShowing()` false, `isArmed()` true, i.e. the pre-S191 behaviour.
 * A failed fetch is final for the page (the `vite:preloadError` handler in `main.ts` reloads on a stale
 * deploy); the match still ends and still exits, just without a board.
 */

import { Container } from 'pixi.js';
import type { World } from '../state/worldTypes.ts';
import type { BoardPortraitSource, MatchBoard } from './matchBoard.ts';

export class MatchBoardHost {
  readonly container = new Container();
  private board: MatchBoard | null = null;
  private state: 'idle' | 'loading' | 'failed' = 'idle';
  private portraits: BoardPortraitSource | null = null;

  constructor(private readonly onContinue: () => void) {}

  /** Every frame. Starts the fetch once a match is running; draws once the board has arrived. */
  render(world: World, nowMs: number): void {
    if (this.board !== null) {
      this.board.render(world, nowMs);
      return;
    }
    if (this.state !== 'idle' || world.gameState === 'TITLE' || world.gameState === 'LOBBY') return;
    this.state = 'loading';
    void this.load();
  }

  /** Resolves when the board is ready (or has failed). Exposed for the test. */
  async load(): Promise<void> {
    try {
      const m = await import('./matchBoard.ts');
      if (this.board === null) {
        this.board = new m.MatchBoard(this.onContinue);
        this.board.setPortraitSource(this.portraits);
        this.container.addChild(this.board.container);
      }
    } catch {
      this.state = 'failed';
    }
  }

  /** ⭐ S194 — the unit portraits for the per-player pages (held until the chunk arrives). */
  setPortraitSource(src: BoardPortraitSource | null): void {
    this.portraits = src;
    this.board?.setPortraitSource(src);
  }

  /** ⭐ S194 — page keys (← → Tab) while the board is up; true when consumed. R is never consumed. */
  handleKey(key: string, shift: boolean): boolean {
    return this.board?.handleKey(key, shift) ?? false;
  }

  isShowing(): boolean {
    return this.board?.isShowing() ?? false;
  }

  isArmed(nowMs: number): boolean {
    return this.board?.isArmed(nowMs) ?? true;
  }
}
