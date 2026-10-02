/**
 * SPARK — ⭐ S194: what the pointer is over, and what the tooltip says. Pure — no renderer.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import { recordDamage, recordKill, recordUnitBuilt, recordWaveSample } from '../state/matchStats.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import {
  CONTINUE_RECT, graphsLayout, matrixCells, overviewLayout, playerLayout, plotRect, pointX, tabRects,
} from './matchBoardLayout.ts';
import { matchBoardModel } from './matchBoardModel.ts';
import { hoverAt, tooltipFor } from './matchBoardTips.ts';

const P = (n: number) => asPlayerId(n);

function world3(): World {
  const w = makeWorld(0x5194);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.players.set(P(2), makeIdlePlayer(P(2), PLAYER_COLORS[2]!));
  recordUnitBuilt(w, P(0), 'raceUnit');
  recordDamage(w, P(1), P(0), 30, 'unit');
  recordKill(w, P(0), P(1), 'raceUnit');
  w.tick = 100;
  recordWaveSample(w, 1);
  recordDamage(w, P(1), P(0), 70, 'structure');
  recordDamage(w, P(0), P(2), 11, 'keep');
  w.tick = 200;
  recordWaveSample(w, 2);
  w.lastWinnerId = P(0);
  w.gameState = 'POSTGAME';
  return w;
}

const mid = (r: { x: number; y: number; w: number; h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

describe('S194 hoverAt — the target under the pointer', () => {
  const m = matchBoardModel(world3())!;

  it('CONTINUE and the tab strip answer on every page', () => {
    for (const tab of [{ kind: 'overview' }, { kind: 'graphs' }, { kind: 'player', index: 0 }] as const) {
      expect(hoverAt(m, tab, ...mid(CONTINUE_RECT))).toEqual({ kind: 'continue' });
      expect(hoverAt(m, tab, ...mid(tabRects(3)[4]!))).toEqual({ kind: 'tab', index: 4 });
    }
  });

  it('overview: a row, a score wave, and nothing over empty plate', () => {
    const tab = { kind: 'overview' } as const;
    const L = overviewLayout(3);
    expect(hoverAt(m, tab, ...mid(L.rows[1]!))).toEqual({ kind: 'row', index: 1 });
    const p = plotRect(L.chart);
    expect(hoverAt(m, tab, pointX(p, 2, 1), p.y + 10)).toEqual({ kind: 'wave', chart: 'score', index: 1 });
    expect(hoverAt(m, tab, 20, 20)).toBeNull();
  });

  it('graphs: each chart answers with its own key; the heatmap diagonal never answers', () => {
    const tab = { kind: 'graphs' } as const;
    const G = graphsLayout();
    for (const k of ['damage', 'built', 'kills'] as const) {
      const p = plotRect(G[k]);
      expect(hoverAt(m, tab, p.x + p.w * 0.9, p.y + p.h / 2)).toEqual({ kind: 'wave', chart: k, index: 1 });
    }
    const { cells } = matrixCells(G.matrix, 3);
    expect(hoverAt(m, tab, ...mid(cells[0]![2]!))).toEqual({ kind: 'cell', attacker: 0, victim: 2 });
    expect(hoverAt(m, tab, ...mid(cells[1]![1]!))).toBeNull();
  });

  it('player page: the per-wave ledger answers with its wave', () => {
    const p = plotRect(playerLayout().ledger);
    expect(hoverAt(m, { kind: 'player', index: 0 }, p.x + 2, p.y + 5)).toEqual({ kind: 'ledger', index: 0 });
  });
});

describe('S194 tooltipFor — what it says', () => {
  const w = world3();
  const m = matchBoardModel(w)!;

  it('a wave lists EVERY seat at that wave, highest first', () => {
    const lines = tooltipFor(m, { kind: 'graphs' }, { kind: 'wave', chart: 'damage', index: 1 })!.map((l) => l.text);
    expect(lines[0]).toBe('WAVE 2 · DAMAGE PER WAVE');
    expect(lines.slice(1)).toEqual(['P1  70', 'P3  11', 'P2  0']); // wave 2 alone: 70 dealt by P1, 11 by P3
  });

  it('a stacked chart adds the total', () => {
    const lines = tooltipFor(m, { kind: 'graphs' }, { kind: 'wave', chart: 'kills', index: 0 })!.map((l) => l.text);
    expect(lines.at(-1)).toBe('ALL  1');
  });

  it('a heatmap cell gives the damage both ways', () => {
    const order = m.matrix.seats;
    const a = order.indexOf(P(0));
    const v = order.indexOf(P(1));
    const cell = tooltipFor(m, { kind: 'graphs' }, { kind: 'cell', attacker: a, victim: v })!;
    expect(cell.map((l) => l.text)).toEqual(['P1 → P2', 'dealt  100', 'took back  0']);
    expect(cell[0]!.color, "the attacker's line is in the attacker's colour").toBe(w.players.get(P(0))!.color);
  });

  it('the ledger reads this seat\'s dealt and taken in that wave; tabs and CONTINUE have none', () => {
    const i = m.rows.findIndex((r) => r.seat === P(0));
    expect(tooltipFor(m, { kind: 'player', index: i }, { kind: 'ledger', index: 1 })!.map((l) => l.text))
      .toEqual(['WAVE 2 · P1', 'dealt  70', 'taken  11']);
    expect(tooltipFor(m, { kind: 'overview' }, { kind: 'tab', index: 0 })).toBeNull();
    expect(tooltipFor(m, { kind: 'overview' }, { kind: 'continue' })).toBeNull();
    expect(tooltipFor(m, { kind: 'overview' }, null)).toBeNull();
  });
});
