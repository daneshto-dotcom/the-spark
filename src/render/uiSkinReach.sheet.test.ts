/**
 * S194 T5 — REACH: the character card's skin, driven through a REAL `CharacterSheet.sync` on a real
 * goblin tower (the card that carries FIX / SCRAP and the six FEED chips with their auto-build
 * toggles). Every action button is skinned on exactly the rect `isOverAnyAction` / `autoFeedAt` /
 * `actionAt` test — clicked just inside it is that button, just outside it is not — and the card
 * plate wears the panel frame inside `isOver`.
 */
import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { PLAYER_COLORS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { runSpawnerIgnition } from '../state/godlyMatcherCore.ts';
import '../state/godlyRecipes/registerAll.ts';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';

installFakeTextCanvas();

const skinned: Array<{ x: number; y: number; w: number; h: number; state: string }> = [];
const panels: Array<{ x: number; y: number; w: number; h: number }> = [];
vi.mock('./uiSkin.ts', async (orig) => {
  const real = await orig<typeof import('./uiSkin.ts')>();
  return {
    ...real,
    skinButtonFx: (g: never, x: number, y: number, w: number, h: number, o: { state: string }) => {
      skinned.push({ x, y, w, h, state: o.state });
      real.skinButtonFx(g, x, y, w, h, o as never);
    },
    skinPanelFx: (g: never, x: number, y: number, w: number, h: number, a: number, hd?: number, r?: number) => {
      panels.push({ x, y, w, h });
      real.skinPanelFx(g, x, y, w, h, a, hd, r);
    },
  };
});

const { CharacterSheet } = await import('./characterSheet.ts');
const P0 = asPlayerId(0);

function goblinWorld(banked: boolean): { w: World; anchor: number } {
  const w = makeWorld(0x194d);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.creatures.clear();
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('goblinTower')) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'goblinTower', centre: { x: 640, y: 360 } });
  runSpawnerIgnition(w);
  const after = makeCastleBank();
  if (banked) for (let i = 0; i < after.length; i++) after[i] = 3;
  w.castleBanks.set(P0, after);
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 100_000;
  const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === 'goblinTower')!;
  return { w, anchor: Number(sp.anchorPrimitiveId) };
}

for (const banked of [false, true]) {
  describe(`S194 T5 — the card skin sits exactly on its hit rects (goblin tower, ${banked ? 'shapes banked' : 'bank empty'})`, () => {
    const { w, anchor } = goblinWorld(banked);
    const stage = new Container();
    const sheet = new CharacterSheet({ stage } as never, stage);
    sheet.select({ kind: 'structure', primitiveId: anchor as never });
    skinned.length = 0;
    panels.length = 0;
    sheet.sync(w, P0);
    const acts = sheet.getUiPoints().actions;
    // Snapshot NOW: both describe bodies run at collection time, before any it() runs.
    const mySkins = [...skinned];
    const myPanels = [...panels];

    it('the card has actions to check (anti-vacuity), including FEED chips', () => {
      expect(acts.length).toBeGreaterThan(2);
      expect(acts.some((a) => a.kind === 'FEED')).toBe(true);
    });

    it('every action button is skinned exactly once, on exactly its own rect', () => {
      for (const a of acts) {
        const mine = mySkins.filter((s) => s.x === a.x && s.y === a.y && s.w === a.w && s.h === a.h);
        expect(mine.length, `${a.kind}${a.sparkType ?? ''}`).toBe(1);
        expect(mine[0]!.state).toBe(a.enabled ? 'rest' : 'disabled');
      }
    });

    it('just inside a button is that button; just outside is not', () => {
      const e = 1;
      for (const a of acts) {
        for (const [px, py] of [[a.x + e, a.y + a.h / 2], [a.x + a.w - e, a.y + a.h / 2], [a.x + a.w / 2, a.y + e], [a.x + a.w / 2, a.y + a.h - e]]) {
          expect(sheet.isOverAnyAction(px!, py!)).toBe(true);
          if (a.enabled) expect(sheet.actionAt(px!, py!)?.kind).toBe(a.kind);
          if (a.autoFeed !== undefined) expect(sheet.autoFeedAt(px!, py!)?.sparkType).toBe(a.sparkType);
        }
        for (const [px, py] of [[a.x - e - 0.5, a.y + a.h / 2], [a.x + a.w + e + 0.5, a.y + a.h / 2], [a.x + a.w / 2, a.y - e - 0.5], [a.x + a.w / 2, a.y + a.h + e + 0.5]]) {
          const hit = sheet.actionAt(px!, py!);
          const same = hit !== null && hit.kind === a.kind && hit.sparkType === a.sparkType;
          expect(same, `outside ${a.kind}${a.sparkType ?? ''} at (${px},${py})`).toBe(false);
        }
      }
    });

    it('the card plate wears the panel frame on exactly the rect `isOver` claims', () => {
      expect(myPanels.length).toBe(1);
      const p = myPanels[0]!;
      expect(sheet.isOver(p.x + 1, p.y + 1)).toBe(true);
      expect(sheet.isOver(p.x + p.w - 1, p.y + p.h - 1)).toBe(true);
      expect(sheet.isOver(p.x - 2, p.y + p.h / 2)).toBe(false);
      expect(sheet.isOver(p.x + p.w + 2, p.y + p.h / 2)).toBe(false);
    });
  });
}
