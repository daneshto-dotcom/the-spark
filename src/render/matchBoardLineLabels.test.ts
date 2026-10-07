/**
 * SPARK — ⭐ S196 (board-look): the SCORE RACE's line-end labels never print one seat's name over another's.
 *
 * Found in the S196 LIVE check (real 2v2 bots match, 1920×1080, `.tmp-gates/boardlook`): teammates finished on 301
 * and 298, their line ends sat 4 px apart, and "BOT 3" was drawn over "BOT 4". Every fitted text was inside its
 * box — the fit rule cannot see two boxes on top of each other, which is why this needs its own test.
 *
 * Pinned three ways: the pure spread's arithmetic; a REACH test through the real `MatchBoard.render` (the drawn
 * Text objects, not a re-derivation); and a NEGATIVE — labels already clear of each other are drawn exactly where
 * they always were (the fix moves nothing it does not have to).
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import { recordWaveSample } from '../state/matchStats.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { LINE_LABEL_GAP, overviewLayout, plotRect, spreadLabelBottoms } from './matchBoardLayout.ts';
import { matchBoardModel } from './matchBoardModel.ts';

installFakeTextCanvas();
const { MatchBoard } = await import('./matchBoard.ts');

/** A four-seat POSTGAME whose banked scores, per wave, are `scores[seat][wave]`. */
function race(scores: readonly (readonly number[])[]): World {
  const w = makeWorld(0x5196);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  for (let i = 2; i < scores.length; i++) w.players.set(asPlayerId(i), makeIdlePlayer(asPlayerId(i), PLAYER_COLORS[i]!));
  const waves = scores[0]!.length;
  for (let wave = 1; wave <= waves; wave++) {
    scores.forEach((s, seat) => w.scoreByPlayer.set(asPlayerId(seat), s[wave - 1]!));
    w.tick += 10;
    recordWaveSample(w, wave);
  }
  w.localPlayerId = asPlayerId(0);
  w.lastWinnerId = asPlayerId(1);
  w.gameState = 'POSTGAME';
  return w;
}

interface Drawn { text: string; x: number; y: number }
/** The line-end labels as DRAWN: visible Texts anchored at their bottom-right (legend chips hang from the top). */
function endLabels(b: InstanceType<typeof MatchBoard>, names: readonly string[]): Drawn[] {
  const out: Drawn[] = [];
  const walk = (c: { children: unknown[] }): void => {
    for (const ch of c.children as Array<{ visible: boolean; text?: unknown; anchor?: { x: number; y: number }; position?: { x: number; y: number }; children?: unknown[] }>) {
      if (!ch.visible) continue;
      if (typeof ch.text === 'string' && names.includes(ch.text) && ch.anchor?.x === 1 && ch.anchor.y === 1) {
        out.push({ text: ch.text, x: ch.position!.x, y: ch.position!.y });
      } else if (Array.isArray(ch.children)) walk(ch as { children: unknown[] });
    }
  };
  walk(b.container as unknown as { children: unknown[] });
  return out;
}

describe('S196 spreadLabelBottoms — arithmetic', () => {
  it('pushes a label that would overlap the one above it down by exactly the gap, and returns input order', () => {
    expect(spreadLabelBottoms([532, 528], 16, 900)).toEqual([544, 528]);
  });
  it('three equal ends stack one gap apart, tie broken by series index (a total order)', () => {
    expect(spreadLabelBottoms([500, 500, 500], 16, 900)).toEqual([500, 516, 532]);
  });
  it('labels already clear of each other never move', () => {
    expect(spreadLabelBottoms([100, 300, 200], 16, 900)).toEqual([100, 300, 200]);
  });
  it('a stack that would run past the floor is walked back up from it', () => {
    expect(spreadLabelBottoms([890, 890], 16, 900)).toEqual([884, 900]);
  });
});

describe('S196 SCORE RACE end labels — REACH through the real board', () => {
  const names = ['P1', 'P2', 'P3', 'P4'];

  it('two seats finishing level (the live 301 / 298 case) are drawn at least one label-height apart', () => {
    const w = race([[100, 100, 100], [150, 250, 301], [150, 248, 298], [120, 130, 140]]);
    const b = new MatchBoard(() => {});
    b.render(w, 0);
    const drawn = endLabels(b, names);
    expect(drawn.map((d) => d.text).sort()).toEqual(names);
    const ys = drawn.map((d) => d.y).sort((a, c) => a - c);
    for (let k = 1; k < ys.length; k++) expect(ys[k]! - ys[k - 1]!, `labels ${k - 1}/${k}`).toBeGreaterThanOrEqual(LINE_LABEL_GAP);
    const P = plotRect(overviewLayout(4).chart);
    for (const d of drawn) expect(d.y).toBeLessThanOrEqual(P.y + P.h);
  });

  it('every seat on the same score: four labels, none on another', () => {
    const w = race([[200, 200], [200, 200], [200, 200], [200, 200]]);
    const b = new MatchBoard(() => {});
    b.render(w, 0);
    const ys = endLabels(b, names).map((d) => d.y).sort((a, c) => a - c);
    expect(ys).toHaveLength(4);
    for (let k = 1; k < ys.length; k++) expect(ys[k]! - ys[k - 1]!).toBeGreaterThanOrEqual(LINE_LABEL_GAP);
  });

  it('NEGATIVE: well-separated ends are drawn exactly at their line end (the spread moves nothing it need not)', () => {
    const w = race([[0, 0], [100, 400], [50, 200], [20, 100]]);
    const b = new MatchBoard(() => {});
    b.render(w, 0);
    const g = matchBoardModel(w)!.graphs.score;
    const P = plotRect(overviewLayout(4).chart);
    const yAt = (v: number): number => P.y + P.h - (P.h * v) / g.maxValue;
    const drawn = endLabels(b, names);
    expect(drawn).toHaveLength(4);
    for (const s of g.series) {
      const d = drawn.find((x) => x.text === s.label)!;
      expect(d.y, s.label).toBeCloseTo(yAt(s.values[s.values.length - 1]!) - 6, 6);
    }
  });
});
