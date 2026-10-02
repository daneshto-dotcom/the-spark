/**
 * SPARK — ⭐ S191/S194: the stat board's VIEW — visibility, its one exit, its pages, its charts, its wiring.
 *
 * The board is a real Pixi `Container` here (no renderer runs, as in `draftOverlay.test.ts`), driven by the
 * same `pointertap` / `pointermove` Pixi dispatches. What no unit test can see is the canvas; the wiring half
 * is therefore pinned by source text, with that limit stated at the test — and paired with REACH cases that
 * drive the real board object through the same events `main.ts` forwards.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Graphics, Text } from 'pixi.js';
import { MONSTER_OWNER_SEAT, PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import { recordDamage, recordKill, recordUnitBuilt, recordWaveSample } from '../state/matchStats.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { ARM_MS, MatchBoard } from './matchBoard.ts';
import { CONTINUE_RECT, graphsLayout, matrixCells, overviewLayout, plotRect, pointX, tabRects } from './matchBoardLayout.ts';
import { MatchBoardHost } from './matchBoardHost.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function postgame(): World {
  const w = makeWorld(0x5191c);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  recordUnitBuilt(w, P0, 'raceUnit');
  recordUnitBuilt(w, P1, 'chewer');
  recordKill(w, P0, P1, 'chewer');
  recordDamage(w, P1, P0, 40, 'unit');
  recordDamage(w, P0, P1, 300, 'keep');
  w.tick += 10;
  recordWaveSample(w, 1);
  recordDamage(w, P1, P0, 25, 'structure');
  w.tick += 10;
  recordWaveSample(w, 2);
  w.lastWinnerId = P0;
  w.gameState = 'POSTGAME';
  return w;
}

/** A four-seat POSTGAME, for the pages that only show their shape with a full table. */
function fourSeats(): World {
  const w = postgame();
  for (let i = 2; i < 4; i++) {
    const id = asPlayerId(i);
    w.players.set(id, makeIdlePlayer(id, PLAYER_COLORS[i]!));
    recordUnitBuilt(w, id, 'goblinMelee');
  }
  w.tick += 10;
  recordWaveSample(w, 3);
  return w;
}

const tap = (b: MatchBoard, x: number, y: number, button = 0): void => {
  b.container.emit('pointertap', { global: { x, y }, button } as never);
};
const move = (b: MatchBoard, x: number, y: number): void => {
  b.container.emit('pointermove', { global: { x, y } } as never);
};
const center = (r: { x: number; y: number; w: number; h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const visibleTexts = (b: MatchBoard): string[] => {
  const out: string[] = [];
  const walk = (c: { children: unknown[] }): void => {
    for (const ch of c.children as Array<{ visible: boolean; text?: string; children: unknown[] }>) {
      if (!ch.visible) continue;
      if (typeof ch.text === 'string') out.push((ch as unknown as Text).text);
      else if (Array.isArray(ch.children)) walk(ch);
    }
  };
  walk(b.container);
  return out;
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
    const [cx, cy] = center(CONTINUE_RECT);
    const realNow = performance.now;
    try {
      performance.now = () => now + ARM_MS - 1;
      tap(b, cx, cy);
      expect(left).toBe(0);
      performance.now = () => now + ARM_MS;
      tap(b, cx, cy, 2); // right-click is the put-back / raid gesture
      tap(b, CONTINUE_RECT.x - 4, cy); // just outside the button
      tap(b, cx, CONTINUE_RECT.y + CONTINUE_RECT.h + 4);
      expect(left).toBe(0);
      tap(b, cx, cy);
      expect(left).toBe(1);
    } finally {
      performance.now = realNow;
    }
  });
});

describe('⭐ S194 MatchBoard — pages: tabs, rows, keys', () => {
  it('opens on OVERVIEW; a tap on each tab opens that page; a tap beside the strip changes nothing', () => {
    const b = new MatchBoard(() => {});
    const w = fourSeats();
    b.render(w, 0);
    expect(b.currentTab()).toEqual({ kind: 'overview' });
    const tabs = tabRects(w.players.size);
    expect(tabs).toHaveLength(2 + 4);
    tap(b, ...center(tabs[1]!));
    expect(b.currentTab()).toEqual({ kind: 'graphs' });
    tap(b, ...center(tabs[3]!));
    expect(b.currentTab()).toEqual({ kind: 'player', index: 1 });
    tap(b, tabs[0]!.x - 3, tabs[0]!.y + 5); // just outside the first tab
    expect(b.currentTab()).toEqual({ kind: 'player', index: 1 });
    tap(b, ...center(tabs[0]!));
    expect(b.currentTab()).toEqual({ kind: 'overview' });
  });

  it('a tap on an overview ROW opens that seat\'s page; a right-click does not', () => {
    const b = new MatchBoard(() => {});
    const w = fourSeats();
    b.render(w, 0);
    const rows = overviewLayout(w.players.size).rows;
    tap(b, ...center(rows[2]!), 2);
    expect(b.currentTab()).toEqual({ kind: 'overview' });
    tap(b, ...center(rows[2]!));
    expect(b.currentTab()).toEqual({ kind: 'player', index: 2 });
  });

  it('← → and Tab cycle every page and wrap; R is never consumed (it stays the exit)', () => {
    const b = new MatchBoard(() => {});
    const w = fourSeats();
    expect(b.handleKey('ArrowRight'), 'no board up ⇒ no key is eaten').toBe(false);
    b.render(w, 0);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(JSON.stringify(b.currentTab()));
      expect(b.handleKey('ArrowRight')).toBe(true);
    }
    expect(new Set(seen).size).toBe(6);
    expect(b.currentTab()).toEqual({ kind: 'overview' }); // wrapped
    expect(b.handleKey('ArrowLeft')).toBe(true);
    expect(b.currentTab()).toEqual({ kind: 'player', index: 3 });
    expect(b.handleKey('Tab', true)).toBe(true);
    expect(b.currentTab()).toEqual({ kind: 'player', index: 2 });
    expect(b.handleKey('r')).toBe(false);
    expect(b.handleKey('R')).toBe(false);
  });

  it('every page draws (REACH through render) and prints its own content', () => {
    const b = new MatchBoard(() => {});
    const w = fourSeats();
    b.render(w, 0);
    expect(visibleTexts(b)).toEqual(expect.arrayContaining(['SCORE RACE', 'STANDING', 'PLACE', 'STATUS']));
    b.handleKey('ArrowRight');
    b.render(w, 16);
    expect(visibleTexts(b)).toEqual(expect.arrayContaining(['DAMAGE PER WAVE', 'BUILT, STANDING', 'KILLS PER WAVE', 'WHO HIT WHOM']));
    b.handleKey('ArrowRight');
    b.render(w, 32);
    const page = visibleTexts(b);
    expect(page).toEqual(expect.arrayContaining(['UNITS', 'DAMAGE — WHAT IT LANDED ON', 'DEALT TO', 'TAKEN FROM', 'WAVE BY WAVE']));
    expect(page.some((t) => t.includes('P1'))).toBe(true);
  });

  it('a new POSTGAME always opens on the overview, whatever page the last one was left on', () => {
    const b = new MatchBoard(() => {});
    const w = fourSeats();
    b.render(w, 0);
    b.handleKey('ArrowRight');
    w.gameState = 'PLAYING';
    b.render(w, 16);
    w.gameState = 'POSTGAME';
    b.render(w, 32);
    expect(b.currentTab()).toEqual({ kind: 'overview' });
  });
});

describe('⭐ S194 MatchBoard — hover tooltips', () => {
  it('hovering a SCORE wave prints every seat at that wave; moving off clears it', () => {
    const b = new MatchBoard(() => {});
    const w = fourSeats();
    b.render(w, 0);
    const P = plotRect(overviewLayout(w.players.size).chart);
    move(b, pointX(P, 3, 1), P.y + P.h / 2);
    b.render(w, 16);
    const tip = visibleTexts(b).filter((t) => t.startsWith('WAVE 2'));
    expect(tip).toEqual(['WAVE 2 · SCORE RACE']);
    move(b, 5, 5);
    b.render(w, 32);
    expect(visibleTexts(b).filter((t) => t.startsWith('WAVE 2'))).toEqual([]);
  });

  it('hovering a heatmap cell names attacker → victim and the damage both ways', () => {
    const b = new MatchBoard(() => {});
    const w = postgame();
    b.render(w, 0);
    b.handleKey('ArrowRight'); // GRAPHS
    b.render(w, 1);
    const frame = graphsLayout().matrix;
    // Row 0 (the winner, P1) → column 1 (P2): placings put P0 first.
    const { cells } = matrixCells(frame, 2);
    move(b, ...center(cells[0]![1]!));
    b.render(w, 2);
    const t = visibleTexts(b);
    expect(t).toContain('P1 → P2');
    expect(t).toContain('dealt  65'); // 40 on a unit + 25 on a structure
    expect(t).toContain('P2 hit back  300'); // P2's hits on P1's keep
  });
});

describe('S191 MatchBoard — the graphs draw clean polylines', () => {
  it('⛔ every SCORE series stroke is exactly one point per wave (no pen join from the previous shape — canon §7c C7)', () => {
    const b = new MatchBoard(() => {});
    const w = postgame();
    b.render(w, 0);
    const g = b.container.children[0] as Graphics;
    const colors = new Set([...w.players.values()].map((p) => p.color));
    const strokes = g.context.instructions.filter((ins) => {
      if (ins.action !== 'stroke') return false;
      return colors.has((ins.data as unknown as { style: { color: number } }).style.color);
    });
    // the overview's one line chart × one series per seat
    expect(strokes.length).toBe(w.players.size);
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
    expect(host.handleKey('ArrowRight', false), 'no board ⇒ keys pass through').toBe(false);
    let asked = 0;
    host.setPortraitSource(() => { asked += 1; return null; }); // held until the chunk arrives
    w.gameState = 'PLAYING';
    host.render(w, 0); // starts the fetch
    await host.load(); // the same import resolves; the guard makes one board, not two
    expect(host.container.children).toHaveLength(1);
    w.gameState = 'POSTGAME';
    host.render(w, 100);
    expect(host.isShowing()).toBe(true);
    expect(host.isArmed(100 + ARM_MS - 1)).toBe(false);
    expect(host.handleKey('ArrowRight', false)).toBe(true);
    expect(asked, 'the portrait source handed over before the chunk loaded reached the board').toBeGreaterThan(0);
  });

  it('⛔ main.ts never imports the board statically — that is what keeps it off the entry chunk', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).not.toMatch(/from '\.\/render\/matchBoard\.ts'/);
    expect(main).not.toMatch(/from '\.\/render\/matchBoardModel\.ts'/);
    expect(main).not.toMatch(/from '\.\/render\/matchBoardLayout\.ts'/);
    expect(main).not.toMatch(/from '\.\/render\/matchBoardTips\.ts'/);
    expect(main).toContain("from './render/matchBoardHost.ts'");
    const host = readFileSync('src/render/matchBoardHost.ts', 'utf8');
    expect(host).toMatch(/import type \{[^}]*\} from '\.\/matchBoard\.ts'/);
    expect(host).not.toMatch(/^import \{[^}]*\} from '\.\/matchBoard/m);
  });
});

describe('⛔ S191/S194 wiring — source text (the canvas is invisible to vitest; this proves the lines EXIST, not that they run)', () => {
  const main = readFileSync('src/main.ts', 'utf8').replace(/\r\n/g, '\n');
  it('main.ts ignores a canvas click while the board is up, and the exit waits for the board to be armed', () => {
    expect(main).toContain("app.canvas.addEventListener('click', () => { if (!matchBoard.isShowing()) resetIfPostgame(); });");
    expect(main).not.toContain("app.canvas.addEventListener('click', resetIfPostgame);");
    expect(main).toContain("if (world.gameState === 'POSTGAME' && matchBoard.isArmed(performance.now())) {");
  });

  it('⭐ S194 main.ts forwards page keys BEFORE the R exit, and hands the board its portraits', () => {
    const keys = main.indexOf('if (matchBoard.isShowing() && matchBoard.handleKey(e.key, e.shiftKey)) {');
    const r = main.indexOf("if ((e.key === 'r' || e.key === 'R') && world.gameState === 'POSTGAME') {");
    expect(keys).toBeGreaterThan(0);
    expect(r).toBeGreaterThan(keys);
    expect(main).toContain('matchBoard.setPortraitSource((type, race) =>');
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

describe('⭐ S194 (audit T10) — MONSTERS on the heatmap, and the ledger\'s labelled halves', () => {
  it('the GRAPHS page draws MONSTERS and NO SOURCE and never "P256"; hovering the MONSTERS column names them', () => {
    const b = new MatchBoard(() => {});
    const w = postgame();
    const M = asPlayerId(MONSTER_OWNER_SEAT);
    recordDamage(w, M, P0, 70, 'unit');
    recordDamage(w, P1, null, 3, 'unit');
    b.render(w, 0);
    b.handleKey('ArrowRight');
    b.render(w, 1);
    const t = visibleTexts(b);
    expect(t).toEqual(expect.arrayContaining(['→ MONSTERS', 'MONSTERS', 'NO SOURCE']));
    expect(t.some((x) => x.includes('256'))).toBe(false);
    const { cells } = matrixCells(graphsLayout().matrix, 4, 3); // P1, P2, MONSTERS, NO SOURCE × P1, P2, MONSTERS
    move(b, ...center(cells[0]![2]!));
    b.render(w, 2);
    expect(visibleTexts(b)).toEqual(expect.arrayContaining(['P1 → MONSTERS', 'dealt  70']));
  });

  it('the WAVE BY WAVE axis says DEALT above and TAKEN below', () => {
    const b = new MatchBoard(() => {});
    const w = postgame();
    b.render(w, 0);
    b.handleKey('ArrowRight');
    b.handleKey('ArrowRight'); // the first seat's page
    b.render(w, 1);
    expect(visibleTexts(b)).toEqual(expect.arrayContaining(['DEALT ▲', 'TAKEN ▼']));
  });
});
