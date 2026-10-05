/**
 * S194 R194-24 — the ARCADE MENU in the home screen's look, and its click targets exactly where they
 * were. Per plate (NONET, PITCH MASTERS, BACK): the button's hit rect is its plate; a click just inside
 * is that entry and just outside is not (the menu's own `hitTest`); the hover sheen sweeps only inside
 * the rest-size rect. The games themselves are not touched by this file or by the change it guards.
 */
// ⭐ S195 T18 #2 — census pairing (read by uiSkinCensus.reach.test.ts): the SKINNED rows this file REACHES.
// CENSUS-REACH src/render/arcadeOverlay.ts :: attachButtonFeedback(
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Rectangle, Ticker } from 'pixi.js';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { ArcadeOverlay, arcadeBackGeom, arcadeRowGeoms, ARCADE_GAMES } from './arcadeOverlay.ts';

installFakeTextCanvas();
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => {});

function menu(): ArcadeOverlay {
  const stage = new Container();
  const m = new ArcadeOverlay({ stage } as never, stage, () => {});
  m.show();
  return m;
}

describe('S194 R194-24 — arcade menu plates: same click targets, skinned inside them', () => {
  const m = menu();
  const plates = [...arcadeRowGeoms(), arcadeBackGeom()];
  const buttons = (m as unknown as { buttons: Container[] }).buttons;

  it('one button per entry plus BACK (anti-vacuity), and every game has a badge', () => {
    expect(buttons.length).toBe(plates.length);
    expect(ARCADE_GAMES.every((g) => g.icon !== undefined)).toBe(true);
  });

  for (const [i, r] of plates.entries()) {
    it(`${r.id}: the button's hit rect is its plate, and the menu hit-test agrees inside/outside`, () => {
      const hit = buttons[i]!.hitArea as Rectangle;
      expect([hit.x, hit.y, hit.width, hit.height]).toEqual([0, 0, r.w, r.h]);
      const e = 1.5;
      for (const [x, y] of [[r.x + e, r.y + r.h / 2], [r.x + r.w - e, r.y + r.h / 2], [r.x + r.w / 2, r.y + e], [r.x + r.w / 2, r.y + r.h - e]]) {
        expect(m.hitTest(x!, y!), `inside ${r.id}`).toBe(r.id);
      }
      for (const [x, y] of [[r.x - e, r.y + r.h / 2], [r.x + r.w + e, r.y + r.h / 2], [r.x + r.w / 2, r.y - e], [r.x + r.w / 2, r.y + r.h + e]]) {
        expect(m.hitTest(x!, y!), `outside ${r.id}`).not.toBe(r.id);
      }
    });

    it(`${r.id}: the plate's glass and badge stay inside the plate; the hover sheen too`, () => {
      const b = buttons[i]!;
      const plate = b.children[0] as Graphics;
      const pb = plate.bounds;
      expect(pb.minX).toBeGreaterThanOrEqual(-1); // the 2px outline straddles the edge by 1
      expect(pb.minY).toBeGreaterThanOrEqual(-1);
      expect(pb.maxX).toBeLessThanOrEqual(r.w + 1);
      expect(pb.maxY).toBeLessThanOrEqual(r.h + 1);
      const sheen = b.getChildByLabel('sheen') as Graphics;
      b.emit('pointerover', {} as never);
      let drew = 0;
      for (let k = 0; k < 40; k++) {
        Ticker.shared.update(Ticker.shared.lastTime + 50);
        if (sheen.context.instructions.length === 0) continue;
        drew++;
        const s = sheen.bounds;
        expect(s.minX).toBeGreaterThanOrEqual(0);
        expect(s.minY).toBeGreaterThanOrEqual(0);
        expect(s.maxX).toBeLessThanOrEqual(r.w);
        expect(s.maxY).toBeLessThanOrEqual(r.h);
      }
      expect(drew).toBeGreaterThan(5);
      b.emit('pointerout', {} as never);
      expect(sheen.context.instructions.length).toBe(0);
    });
  }
});
