/**
 * ⭐ S195 T18 #2 — REACH for the DRAFT (census row: `this.container.` — the two tiles hit-tested by
 * `draftHitTest`), through a real `DraftOverlay.render`: the glass is skinned on EXACTLY the two tile rects,
 * and those rects are the ones `draftHitTest` answers for — just inside each edge is that tile, just outside
 * is not; the panel plate wears the frame inside `isOver`.
 */
// CENSUS-REACH src/render/draftOverlay.ts :: this.container.
import { describe, expect, it, vi } from 'vitest';
import { type PlayerId } from '../types.ts';
import { makeWorld } from '../state/world.ts';
import { applyStartGame } from '../state/gameMode.ts';
import { generalPickForWave, draftIndexForWave } from '../state/draft.ts';
import { RACIAL_PERKS_BY_RACE } from '../state/racialPerks.ts';
import type { RaceId } from '../state/races.ts';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';

installFakeTextCanvas();

type Rec = { x: number; y: number; w: number; h: number; state: string };
const skinned: Rec[] = [];
const panels: Rec[] = [];
vi.mock('./uiSkin.ts', async (orig) => {
  const real = await orig<typeof import('./uiSkin.ts')>();
  return {
    ...real,
    skinButtonFx: (g: never, x: number, y: number, w: number, h: number, o: { state: string }) => {
      skinned.push({ x, y, w, h, state: o.state });
      real.skinButtonFx(g, x, y, w, h, o as never);
    },
    skinPanelFx: (g: never, x: number, y: number, w: number, h: number, accent: number, header?: number, radius?: number) => {
      panels.push({ x, y, w, h, state: 'panel' });
      real.skinPanelFx(g, x, y, w, h, accent, header, radius);
    },
  };
});

const { DraftOverlay, draftHitTest, generalTileRect, racialTileRect } = await import('./draftOverlay.ts');
type DraftOptions = import('./draftOverlay.ts').DraftOptions;

function offerAsIfBuilt(waveNumber: number, race: RaceId): DraftOptions {
  return { general: generalPickForWave(waveNumber), racial: RACIAL_PERKS_BY_RACE[race][draftIndexForWave(waveNumber)] ?? null };
}

describe('S195 — the draft glass is drawn exactly on the two tiles draftHitTest claims (real DraftOverlay.render)', () => {
  const w = makeWorld(0x195e);
  applyStartGame(w, { type: 'START_GAME' } as never);
  const seat = [...w.players.keys()][0] as PlayerId;
  const race = w.players.get(seat)!.raceId;
  const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: () => new Promise(() => {}) });
  skinned.length = 0;
  panels.length = 0;
  o.render(w, seat);
  const opts = offerAsIfBuilt(1, race);
  const tiles = { general: generalTileRect(), racial: racialTileRect() };
  const mine = [...skinned];
  const myPanels = [...panels];

  it('exactly two skinned rects: the general tile and the racial tile, verbatim', () => {
    expect(mine.map((r) => [r.x, r.y, r.w, r.h])).toEqual([tiles.general, tiles.racial].map((t) => [t.x, t.y, t.w, t.h]));
    expect(o.container.visible).toBe(true);
  });

  it('just inside each skinned rect is that tile to draftHitTest; just outside is not', () => {
    for (const [name, t] of Object.entries(tiles) as Array<['general' | 'racial', { x: number; y: number; w: number; h: number }]>) {
      const e = 1.5;
      for (const [x, y] of [[t.x + e, t.y + t.h / 2], [t.x + t.w - e, t.y + t.h / 2], [t.x + t.w / 2, t.y + e], [t.x + t.w / 2, t.y + t.h - e]]) {
        expect(draftHitTest(x!, y!, opts), `${name} inside (${x},${y})`).toBe(name);
      }
      for (const [x, y] of [[t.x - e, t.y + t.h / 2], [t.x + t.w + e, t.y + t.h / 2], [t.x + t.w / 2, t.y - e], [t.x + t.w / 2, t.y + t.h + e]]) {
        expect(draftHitTest(x!, y!, opts), `${name} outside (${x},${y})`).not.toBe(name);
      }
    }
  });

  it('the panel plate wears the frame on a rect `isOver` claims at its centre and edges', () => {
    expect(myPanels.length).toBe(1);
    const p = myPanels[0]!;
    const e = 1.5;
    // Edge MIDPOINTS, not corners: the plate is a 12-px rounded rect, and `isOver` asks the Graphics itself.
    for (const [x, y] of [[p.x + p.w / 2, p.y + p.h / 2], [p.x + e, p.y + p.h / 2], [p.x + p.w - e, p.y + p.h / 2], [p.x + p.w / 2, p.y + e], [p.x + p.w / 2, p.y + p.h - e]]) expect(o.isOver(x!, y!), `inside (${x},${y})`).toBe(true);
    expect(o.isOver(p.x - 3, p.y + p.h / 2)).toBe(false);
  });
});
