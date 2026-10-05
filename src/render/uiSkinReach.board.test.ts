// ⭐ S195 info-ui (N14 / N5) — census pairing (read by uiSkinCensus.reach.test.ts): the SKINNED rows this file REACHES.
// CENSUS-REACH src/render/matchBoard.ts :: this.container.on('pointermove'
// CENSUS-REACH src/render/matchBoard.ts :: this.container.on('pointertap'
/**
 * SPARK — ⭐ S195 N14 / N5: REACH for the stat board's skin, through the REAL Pixi events `main.ts` forwards.
 *
 * Every tab, every overview row and CONTINUE is a rect in `matchBoardLayout.ts` that `matchBoardTips.hoverAt`
 * claims. This proves the skin is laid on EXACTLY that rect: a pointer just inside lights it ('hover'), just
 * outside does not ('rest'), the pressed one sinks ('press') and lifts on up / upoutside — hover and press can
 * never disagree with the click, because all three read `hoverAt` and one latch.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import { recordUnitBuilt, recordWaveSample } from '../state/matchStats.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { CONTINUE_RECT, overviewLayout, tabRects, type Rect } from './matchBoardLayout.ts';
import { hoverAt } from './matchBoardTips.ts';
import { matchBoardModel } from './matchBoardModel.ts';

installFakeTextCanvas();

const skinned: Array<{ x: number; y: number; w: number; h: number; state: string }> = [];
vi.mock('./uiSkin.ts', async (orig) => {
  const real = await orig<typeof import('./uiSkin.ts')>();
  return {
    ...real,
    skinButtonFx: (g: never, x: number, y: number, w: number, h: number, o: { state: string }) => {
      skinned.push({ x, y, w, h, state: o.state });
      real.skinButtonFx(g, x, y, w, h, o as never);
    },
  };
});
const { MatchBoard } = await import('./matchBoard.ts');

function fourSeats(): World {
  const w = makeWorld(0x5195b);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  for (let i = 2; i < 4; i++) w.players.set(asPlayerId(i), makeIdlePlayer(asPlayerId(i), PLAYER_COLORS[i]!));
  for (let i = 0; i < 4; i++) recordUnitBuilt(w, asPlayerId(i), 'goblinMelee');
  w.tick += 10;
  recordWaveSample(w, 1);
  w.localPlayerId = asPlayerId(0);
  w.lastWinnerId = asPlayerId(0);
  w.gameState = 'POSTGAME';
  return w;
}

type B = InstanceType<typeof MatchBoard>;
const move = (b: B, x: number, y: number): void => { b.container.emit('pointermove', { global: { x, y } } as never); };
const down = (b: B, x: number, y: number): void => { b.container.emit('pointerdown', { global: { x, y }, button: 0 } as never); };
const up = (b: B, outside = false): void => { b.container.emit(outside ? 'pointerupoutside' : 'pointerup', {} as never); };
/** The LAST skin state recorded for `r` (the board redraws only on change, so the parked draw's state stands when a probe changes nothing). */
const stateAt = (r: Rect): string | undefined =>
  [...skinned].reverse().find((s) => Math.abs(s.x - r.x) < 0.01 && Math.abs(s.y - r.y) < 0.01 && Math.abs(s.w - r.w) < 0.01 && Math.abs(s.h - r.h) < 0.01)?.state;
/** The board redraws only when (hover, pressed, …) CHANGES, so park the pointer off every control between probes. */
const park = (b: B, w: World, now: number): void => {
  move(b, CONTINUE_RECT.x + CONTINUE_RECT.w / 2, CONTINUE_RECT.y + CONTINUE_RECT.h / 2); // a hover that is never the probe's
  b.render(w, now);
  skinned.length = 0;
  move(b, 2, 2); // off every control — this render ALWAYS redraws (hover continue → null) and records every rest state
  b.render(w, now);
};
const E = 1;
const inside = (r: Rect): Array<[number, number]> => [[r.x + E, r.y + r.h / 2], [r.x + r.w - E, r.y + r.h / 2], [r.x + r.w / 2, r.y + E], [r.x + r.w / 2, r.y + r.h - E]];
const outside = (r: Rect): Array<[number, number]> => [[r.x - E - 0.5, r.y + r.h / 2], [r.x + r.w + E + 0.5, r.y + r.h / 2], [r.x + r.w / 2, r.y - E - 0.5], [r.x + r.w / 2, r.y + r.h + E + 0.5]];

beforeAll(() => { vi.stubGlobal('document', undefined); });

describe('S195 — the board skin sits exactly on the rects hoverAt claims (tabs, rows, CONTINUE)', () => {
  const w = fourSeats();
  const b = new MatchBoard(() => {});
  const armed = 1000 + 100_000;
  b.render(w, 1000);
  const m = matchBoardModel(w)!;
  const tabs = tabRects(m.rows.length);
  const rows = overviewLayout(m.rows.length).rows;

  it('anti-vacuity: six tabs, four rows, one CONTINUE — each skinned exactly once at rest', () => {
    skinned.length = 0; b.render(w, armed);
    for (const r of [...tabs, ...rows, CONTINUE_RECT]) {
      expect(skinned.filter((s) => s.x === r.x && s.y === r.y && s.w === r.w && s.h === r.h).length, JSON.stringify(r)).toBe(1);
    }
    expect(tabs.length).toBe(6);
    expect(rows.length).toBe(4);
  });

  it('just inside a control: hoverAt names it AND it is skinned hover; just outside: neither', () => {
    const controls: Array<{ r: Rect; is: (h: ReturnType<typeof hoverAt>) => boolean }> = [
      ...tabs.map((r, i) => ({ r, is: (h: ReturnType<typeof hoverAt>) => h?.kind === 'tab' && h.index === i })),
      ...rows.map((r, i) => ({ r, is: (h: ReturnType<typeof hoverAt>) => h?.kind === 'row' && h.index === i })),
      { r: CONTINUE_RECT, is: (h) => h?.kind === 'continue' },
    ];
    for (const { r, is } of controls) {
      for (const [x, y] of inside(r)) {
        expect(is(hoverAt(m, { kind: 'overview' }, x, y)), `hoverAt inside ${JSON.stringify(r)}`).toBe(true);
        park(b, w, armed);
        move(b, x, y);
        b.render(w, armed);
        const st = stateAt(r);
        // The current page's tab is 'active' whatever the pointer does; everything else lights.
        expect(st === 'hover' || (st === 'active' && r === tabs[0]), `skinned inside ${JSON.stringify(r)} → ${st}`).toBe(true);
      }
      for (const [x, y] of outside(r)) {
        expect(is(hoverAt(m, { kind: 'overview' }, x, y)), `hoverAt outside ${JSON.stringify(r)}`).toBe(false);
        park(b, w, armed);
        move(b, x, y);
        b.render(w, armed);
        const st = stateAt(r);
        expect(st === 'rest' || (st === 'active' && r === tabs[0]), `skinned outside ${JSON.stringify(r)} → ${st}`).toBe(true);
      }
    }
  });

  it('⭐ N5 — the pressed control sinks, lifts on up, lifts on upoutside; nothing else sinks', () => {
    for (const r of [tabs[2]!, rows[1]!, CONTINUE_RECT]) {
      const [x, y] = [r.x + r.w / 2, r.y + r.h / 2];
      move(b, x, y);
      down(b, x, y);
      skinned.length = 0; b.render(w, armed);
      expect(stateAt(r), `pressed ${JSON.stringify(r)}`).toBe('press');
      expect(skinned.filter((s) => s.state === 'press').length, 'exactly one thing sinks').toBe(1);
      up(b);
      skinned.length = 0; b.render(w, armed);
      expect(stateAt(r)).toBe('hover');
      down(b, x, y);
      skinned.length = 0; b.render(w, armed);
      expect(stateAt(r)).toBe('press');
      up(b, true);
      skinned.length = 0; b.render(w, armed);
      expect(stateAt(r), 'released off the board: lifted').toBe('hover');
    }
  });
});
