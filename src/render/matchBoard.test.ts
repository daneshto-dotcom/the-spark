/**
 * SPARK — ⭐ S191: the stat board's VIEW — its visibility, its one exit, its graphs, and its wiring.
 *
 * The board is a real Pixi `Container` here (no renderer runs, as in `draftOverlay.test.ts`), driven by the
 * same `pointertap` Pixi dispatches. What no unit test can see is the canvas; the wiring half is therefore
 * pinned by source text, with that limit stated at the test.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { asPlayerId } from '../types.ts';
import { recordUnitBuilt, recordWaveSample } from '../state/matchStats.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { ARM_MS, MatchBoard, matchBoardLayout } from './matchBoard.ts';
import { MatchBoardHost } from './matchBoardHost.ts';

const P0 = asPlayerId(0);

function postgame(): World {
  const w = makeWorld(0x5191c);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  recordUnitBuilt(w, P0, 'raceUnit');
  w.tick += 10;
  recordWaveSample(w, 1);
  w.tick += 10;
  recordWaveSample(w, 2);
  w.lastWinnerId = P0;
  w.gameState = 'POSTGAME';
  return w;
}

const tap = (b: MatchBoard, x: number, y: number, button = 0): void => {
  b.container.emit('pointertap', { global: { x, y }, button } as never);
};

describe('S191 MatchBoard — visibility and the one exit', () => {
  it('shows only in POSTGAME, and goes away by itself on the way out (no hide() to forget)', () => {
    const b = new MatchBoard(() => {});
    const w = postgame();
    b.render(w, 1000);
    expect(b.container.visible).toBe(true);
    expect(b.isShowing()).toBe(true);
    dispatch(w, { type: 'RETURN_TO_TITLE' });
    b.render(w, 1016);
    expect(b.container.visible).toBe(false);
    expect(b.isShowing()).toBe(false);
    expect(b.isArmed(1016), 'no board ⇒ every other exit path is unchanged').toBe(true);
  });

  it('⛔ CONTINUE is refused until the board has been up ARM_MS, then fires once; right-click and elsewhere never', () => {
    let left = 0;
    const b = new MatchBoard(() => { left += 1; });
    const w = postgame();
    const now = 5000;
    b.render(w, now);
    const c = matchBoardLayout(w.players.size).cont;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    // Too early: a click still in flight from the last fight must not skip the board.
    const realNow = performance.now;
    try {
      performance.now = () => now + ARM_MS - 1;
      tap(b, cx, cy);
      expect(left).toBe(0);
      performance.now = () => now + ARM_MS;
      tap(b, cx, cy, 2); // right-click is the put-back / raid gesture
      tap(b, c.x - 40, cy); // not on the button
      expect(left).toBe(0);
      tap(b, cx, cy);
      expect(left).toBe(1);
    } finally {
      performance.now = realNow;
    }
  });
});

describe('S191 MatchBoard — the graphs draw clean polylines', () => {
  it('⛔ every series stroke is exactly one point per wave (no pen join from the previous shape — canon §7c C7)', () => {
    const b = new MatchBoard(() => {});
    const w = postgame();
    b.render(w, 0);
    const g = b.container.children[0] as Graphics;
    const colors = new Set([...w.players.values()].map((p) => p.color));
    const strokes = g.context.instructions.filter((ins) => {
      if (ins.action !== 'stroke') return false;
      return colors.has((ins.data as unknown as { style: { color: number } }).style.color);
    });
    // two graphs × one series per seat
    expect(strokes.length).toBe(2 * w.players.size);
    for (const ins of strokes) {
      const prims = (ins.data as unknown as { path: { shapePath: { shapePrimitives: Array<{ shape: { points?: number[] } }> } } })
        .path.shapePath.shapePrimitives.filter((p) => p.shape.points !== undefined);
      expect(prims).toHaveLength(1);
      expect(prims[0]!.shape.points!.length).toBe(2 * w.matchStats.history.length);
    }
  });
});

describe('S191 MatchBoardHost — the eager shim; the board is a lazy chunk', () => {
  it('answers as "no board" until the chunk arrives, fetches only once a match runs, then delegates', async () => {
    const host = new MatchBoardHost(() => {});
    const w = postgame();
    w.gameState = 'TITLE';
    host.render(w, 0);
    expect([host.isShowing(), host.isArmed(0), host.container.children.length]).toEqual([false, true, 0]);
    w.gameState = 'PLAYING';
    host.render(w, 0); // starts the fetch
    await host.load(); // the same import resolves; the guard makes one board, not two
    expect(host.container.children).toHaveLength(1);
    w.gameState = 'POSTGAME';
    host.render(w, 100);
    expect(host.isShowing()).toBe(true);
    expect(host.isArmed(100 + ARM_MS - 1)).toBe(false);
  });

  it('⛔ main.ts never imports the board statically — that is what keeps its ~8 KiB off the entry chunk', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).not.toMatch(/from '\.\/render\/matchBoard\.ts'/);
    expect(main).not.toMatch(/from '\.\/render\/matchBoardModel\.ts'/);
    expect(main).toContain("from './render/matchBoardHost.ts'");
  });
});

describe('⛔ S191 wiring — source text (the canvas is invisible to vitest; this proves the lines EXIST, not that they run)', () => {
  const main = readFileSync('src/main.ts', 'utf8').replace(/\r\n/g, '\n');
  it('main.ts ignores a canvas click while the board is up, and the exit waits for the board to be armed', () => {
    expect(main).toContain("app.canvas.addEventListener('click', () => { if (!matchBoard.isShowing()) resetIfPostgame(); });");
    expect(main).not.toContain("app.canvas.addEventListener('click', resetIfPostgame);");
    expect(main).toContain("if (world.gameState === 'POSTGAME' && matchBoard.isArmed(performance.now())) {");
  });

  it('main.ts stages the board after the draft panel and before the cruiser lift, and drives it every frame', () => {
    const draft = main.indexOf('app.stage.addChild(draftOverlay.container);');
    const board = main.indexOf('app.stage.addChild(matchBoard.container);');
    const cruiser = main.indexOf('avatarRenderer.bringLocalToFront();');
    expect(draft).toBeGreaterThan(0);
    expect(board).toBeGreaterThan(draft);
    expect(cruiser).toBeGreaterThan(board);
    expect(main).toContain('app.ticker.add(() => matchBoard.render(world, performance.now()));');
  });

  it('the HUD no longer promises "click … to reset" in POSTGAME', () => {
    const ui = readFileSync('src/render/ui.ts', 'utf8');
    expect(ui).not.toContain('click or press R to reset`');
  });
});
