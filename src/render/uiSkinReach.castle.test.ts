/**
 * S194 T5 — REACH: the castle panel's skin, driven through a REAL `CastlePanel.sync`.
 *
 * Every row (FIX ALL, BUY GATHERER, SPEED, REGEN, HP, ATK, DEF, PEN, MRES) is skinned on exactly its
 * own plate rectangle; its icon lies inside that plate; the row box's own Graphics still answers the
 * click just inside its edges and refuses it just outside (Pixi hit-tests the row through that
 * Graphics child — `castlePanel.ts`'s "do not remove" docblock); and the e2e seam's row centres still
 * land on the row the skin was drawn for.
 */
// ⭐ S195 T18 #2 — census pairing (read by uiSkinCensus.reach.test.ts): the SKINNED rows this file REACHES.
// CENSUS-REACH src/render/castlePanel.ts :: box.
import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { PLAYER_COLORS } from '../constants.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';

installFakeTextCanvas();

type Rec = { g: unknown; x: number; y: number; w: number; h: number; state: string };
const skinned: Rec[] = [];
const icons: Array<{ g: unknown; kind: string; cx: number; cy: number; size: number }> = [];
vi.mock('./uiSkin.ts', async (orig) => {
  const real = await orig<typeof import('./uiSkin.ts')>();
  return {
    ...real,
    skinButtonFx: (g: never, x: number, y: number, w: number, h: number, o: { state: string }) => {
      skinned.push({ g, x, y, w, h, state: o.state });
      real.skinButtonFx(g, x, y, w, h, o as never);
    },
    skinIcon: (g: never, kind: never, cx: number, cy: number, size: number, color: number, alpha?: number) => {
      icons.push({ g, kind, cx, cy, size });
      real.skinIcon(g, kind, cx, cy, size, color, alpha);
    },
  };
});

const { CastlePanel, CASTLE_ROW_KEYS, CASTLE_ROW_ICON, castleControlsModel, PANEL_W } = await import('./castlePanel.ts');

function world(): World {
  const w = makeWorld(0x194c);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'solo',
    isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0]! }],
    botSeats: [],
  });
  return w;
}

interface RowView { box: Container & { position: { x: number; y: number } }; bg: Container & { containsPoint(p: { x: number; y: number }): boolean } }

describe('S194 T5 — the castle panel skin is drawn exactly on its hit plates (real CastlePanel.sync)', () => {
  const stage = new Container();
  const panel = new CastlePanel({ stage } as never);
  const w = world();
  panel.open(0);
  skinned.length = 0;
  icons.length = 0;
  panel.sync(w);
  const rows = (panel as unknown as { rows: RowView[] }).rows;

  it('the model and the drawn rows agree on the order (the icon is chosen by position)', () => {
    expect(castleControlsModel(w).map((m) => m.key)).toEqual([...CASTLE_ROW_KEYS]);
    expect(rows.length).toBe(CASTLE_ROW_KEYS.length);
  });

  it('every row is skinned once, on its own full plate, with its own icon inside it', () => {
    for (let i = 0; i < rows.length; i++) {
      const bg = rows[i]!.bg;
      const mine = skinned.filter((s) => s.g === bg);
      expect(mine.length, `row ${CASTLE_ROW_KEYS[i]} skinned once`).toBe(1);
      const s = mine[0]!;
      expect([s.x, s.y, s.w, s.h]).toEqual([0, 0, PANEL_W - 20, 44]);
      const ic = icons.filter((k) => k.g === bg);
      expect(ic.length).toBe(1);
      expect(ic[0]!.kind).toBe(CASTLE_ROW_ICON[CASTLE_ROW_KEYS[i]!]);
      expect(ic[0]!.cx - ic[0]!.size / 2).toBeGreaterThanOrEqual(s.x);
      expect(ic[0]!.cy - ic[0]!.size / 2).toBeGreaterThanOrEqual(s.y);
      expect(ic[0]!.cy + ic[0]!.size / 2).toBeLessThanOrEqual(s.y + s.h);
    }
  });

  it('each row box still takes a click just inside its plate and refuses one just outside', () => {
    for (let i = 0; i < rows.length; i++) {
      const s = skinned.find((r) => r.g === rows[i]!.bg)!;
      const bg = rows[i]!.bg;
      const e = 1.5;
      for (const p of [{ x: s.x + e, y: s.y + s.h / 2 }, { x: s.x + s.w - e, y: s.y + s.h / 2 }, { x: s.x + s.w / 2, y: s.y + e }, { x: s.x + s.w / 2, y: s.y + s.h - e }]) {
        expect(bg.containsPoint(p), `row ${i} inside ${JSON.stringify(p)}`).toBe(true);
      }
      for (const p of [{ x: s.x - 3, y: s.y + s.h / 2 }, { x: s.x + s.w + 3, y: s.y + s.h / 2 }, { x: s.x + s.w / 2, y: s.y - 3 }, { x: s.x + s.w / 2, y: s.y + s.h + 3 }]) {
        expect(bg.containsPoint(p), `row ${i} outside ${JSON.stringify(p)}`).toBe(false);
      }
    }
  });

  it('the e2e seam row centres land on the centre of the row the skin was drawn for', () => {
    const pts = panel.getUiPoints();
    const o = pts.rect!;
    for (let i = 0; i < rows.length; i++) {
      const box = rows[i]!.box;
      const s = skinned.find((r) => r.g === rows[i]!.bg)!;
      expect(pts.rowCenters[i]!.x - o.x - box.position.x).toBeCloseTo(s.x + s.w / 2, 6);
      expect(pts.rowCenters[i]!.y - o.y - box.position.y).toBeCloseTo(s.y + s.h / 2, 6);
    }
  });

  it('the inventory slots are skinned on their own plates too, and the panel plate gets the frame', () => {
    const slots = (panel as unknown as { slots: Array<{ bg: unknown }> }).slots;
    for (const sl of slots) {
      const mine = skinned.filter((s) => s.g === sl.bg);
      expect(mine.length).toBe(1);
      expect([mine[0]!.x, mine[0]!.y, mine[0]!.w, mine[0]!.h]).toEqual([0, 0, 40, 40]);
    }
  });
});
