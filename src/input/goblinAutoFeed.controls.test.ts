/**
 * SPARK — ⭐⭐ S193 (owner T4) — CONTROLS REACH: a RIGHT-click on a goblin-tower feed chip toggles its
 * auto-build, through the REAL `Controls.onDown` and the REAL `CharacterSheet` after a real `sync`.
 *
 * > *"right click each of the six shapes that build … the goblins … it's like a toggle."*
 *
 * Every point is the centre of a chip AS THE CARD LAID IT OUT (`getUiPoints().actions`) — the same
 * slots `autoFeedAt` hit-tests and the lit cue is drawn on. The sheet-action handler mirrors main.ts's
 * (`main.ts` itself is source-pinned at the bottom), and the intent is APPLIED to the world so the
 * card's next `sync` reads the toggle back.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { readFileSync } from 'node:fs';
import { Container } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS, SparkType } from '../constants.ts';
import { asPlayerId, type PlayerId, type Vec2 } from '../types.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { runSpawnerIgnition } from '../state/godlyMatcherCore.ts';
import { isAutoFed } from '../state/spawners/spawner.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { CharacterSheet } from '../render/characterSheet.ts';
import { Controls, type CastlePanelLike } from './controls.ts';
import '../state/godlyRecipes/registerAll.ts';

class FakeContext2D {
  font = '10px sans-serif';
  letterSpacing = '0px';
  textLetterSpacing = '0px';
  measureText(s: string): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
    const w = s.length * px * 0.6;
    return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
  }
}
class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext(): FakeContext2D {
    return new FakeContext2D();
  }
}
beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

interface Rig {
  w: World;
  c: Controls;
  sheet: CharacterSheet;
  castle: CastlePanelLike & { armed: GodlyId | null };
  sent: GameAction[];
  apply: boolean;
  anchor: number;
}

/** P0 builds the tower; `viewer` is the seat at this client (P1 = looking at an ENEMY tower). */
function rig(viewer: PlayerId = P0): Rig {
  const w = makeWorld(0x193f);
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
  w.castleBanks.set(P0, makeCastleBank()); // nothing banked → every chip is DIMMED
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 100_000;
  const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === 'goblinTower')!;
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, right: CANVAS_WIDTH, bottom: CANVAS_HEIGHT, x: 0, y: 0 }),
  };
  const r: Rig = {
    w, c: null as unknown as Controls, sheet: null as unknown as CharacterSheet,
    castle: null as unknown as Rig['castle'], sent: [], apply: true, anchor: Number(sp.anchorPrimitiveId),
  };
  r.c = new Controls({ canvas } as never, w, viewer, (a) => { r.sent.push(a); });
  const stage = new Container();
  r.sheet = new CharacterSheet({ stage } as never, stage);
  const castle = {
    armed: null as GodlyId | null,
    isOpen: () => false, toggle() {}, close() {}, isOverPanel: () => false,
    armedBlueprint: () => castle.armed,
    disarm() { castle.armed = null; },
    armExternal(id: GodlyId | null) { castle.armed = id; },
    requestShapesFor() {},
  };
  r.castle = castle;
  r.c.setCastlePanel(castle);
  r.c.setCharacterSheet(r.sheet);
  // ⭐ main.ts's handler for the AUTO_FEED kind, verbatim in shape (source-pinned below).
  r.c.setSheetActionHandler((action) => {
    if (action.kind !== 'AUTO_FEED') return;
    const spawnerId = r.sheet.actionFeedSpawnerId();
    if (spawnerId === null || action.on === undefined) return;
    const intent = { type: 'SET_AUTO_FEED', playerId: viewer, spawnerId, sparkType: action.sparkType as SparkType, on: action.on } as const;
    r.sent.push(intent);
    if (r.apply) dispatch(w, intent);
  });
  r.sheet.select({ kind: 'structure', primitiveId: sp.anchorPrimitiveId });
  r.sheet.sync(w, viewer);
  return r;
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const press = (r: Rig, p: Vec2, button: number): void => {
  (r.c as unknown as { onDown(e: Ptr): void }).onDown({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
  (r.c as unknown as { onUp(e: Ptr): void }).onUp({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
};
const chip = (r: Rig, type: SparkType) => {
  const c = r.sheet.getUiPoints().actions.find((b) => b.kind === 'FEED' && b.sparkType === type);
  expect(c, `fixture: the card drew the ${SparkType[type]} chip`).toBeDefined();
  return c!;
};
const centre = (b: { x: number; y: number; w: number; h: number }): Vec2 => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const toggles = (r: Rig) => r.sent.filter((a) => a.type === 'SET_AUTO_FEED') as Array<Extract<GameAction, { type: 'SET_AUTO_FEED' }>>;
const spawner = (r: Rig) => [...r.w.creatureSpawners.values()].find((s) => s.recipeId === 'goblinTower')!;

describe('⭐ S193 T4 — REACH: a right-click on a goblin-tower feed chip toggles its auto-build', () => {
  it('right-click the Square chip (DIMMED — nothing banked) → SET_AUTO_FEED on; the card reads it back LIT', () => {
    const r = rig();
    const sq = chip(r, SparkType.Square);
    expect(sq.enabled, 'fixture: the chip is dimmed').toBe(false);
    expect(sq.autoFeed, 'a goblin-tower chip is toggleable, and starts off').toBe(false);
    press(r, centre(sq), 2);
    expect(toggles(r).map((a) => [a.sparkType, a.on])).toEqual([[SparkType.Square, true]]);
    expect(isAutoFed(spawner(r), SparkType.Square)).toBe(true);
    r.sheet.sync(r.w, P0);
    expect(chip(r, SparkType.Square).autoFeed, 'the lit cue reads the synced bit').toBe(true);
    expect(chip(r, SparkType.Spiral).autoFeed, 'only that shape').toBe(false);
  });

  it('a second right-click (after the snapshot caught up) turns it OFF', () => {
    const r = rig();
    press(r, centre(chip(r, SparkType.Square)), 2);
    r.sheet.sync(r.w, P0);
    press(r, centre(chip(r, SparkType.Square)), 2);
    expect(toggles(r).map((a) => a.on)).toEqual([true, false]);
    expect(spawner(r).autoFeedMask).toBe(0);
  });

  it('several toggles at once — Square AND Spiral', () => {
    const r = rig();
    press(r, centre(chip(r, SparkType.Square)), 2);
    press(r, centre(chip(r, SparkType.Spiral)), 2);
    expect(spawner(r).autoFeedMask).toBe((1 << SparkType.Square) | (1 << SparkType.Spiral));
  });

  it('⭐ Council M3 — a fast double right-click on a STALE view lands OFF (the pending overlay), not stuck ON', () => {
    const r = rig();
    r.apply = false; // a joiner: nothing comes back before the second click
    const p = centre(chip(r, SparkType.Square));
    press(r, p, 2);
    r.sheet.sync(r.w, P0); // still reads OFF — the snapshot has not arrived
    press(r, p, 2);
    expect(toggles(r).map((a) => a.on)).toEqual([true, false]);
  });
});

describe('⛔ S193 T4 — what a right-click on the card must NOT do', () => {
  it('⛔ a HAND put-back wins: with a tower in hand, the right-click puts it back and toggles nothing', () => {
    const r = rig();
    r.castle.armed = 'pentagram' as GodlyId;
    press(r, centre(chip(r, SparkType.Square)), 2);
    expect(r.castle.armed, 'the held tower was put back').toBe(null);
    expect(toggles(r)).toEqual([]);
    expect(spawner(r).autoFeedMask ?? 0).toBe(0);
    // …and with the hand empty, the same click toggles.
    press(r, centre(chip(r, SparkType.Square)), 2);
    expect(toggles(r)).toHaveLength(1);
  });

  it('a LEFT click on a dimmed chip toggles nothing (it is the FEED gesture, refused)', () => {
    const r = rig();
    press(r, centre(chip(r, SparkType.Square)), 0);
    expect(toggles(r)).toEqual([]);
  });

  it('⛔ nothing on the board under the chip is raided', () => {
    const r = rig();
    const p = centre(chip(r, SparkType.Square));
    dispatch(r.w, { type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P1, pos: { ...p }, targetPos: { ...p } });
    press(r, p, 2);
    expect(r.sent.filter((a) => a.type === 'RAID_TARGET' || a.type === 'SEVER_BOND')).toEqual([]);
    expect(toggles(r)).toHaveLength(1);
  });

  it("⛔ an ENEMY goblin tower's card has no chips — a right-click there toggles nothing", () => {
    const r = rig(P1);
    expect(r.sheet.getUiPoints().actions, 'no FIX / SCRAP / FEED on an enemy card').toEqual([]);
    const rect = r.sheet.rect()!;
    press(r, { x: rect.x + rect.w / 2, y: rect.y + rect.h - 20 }, 2);
    expect(toggles(r)).toEqual([]);
  });

  it('FIX / SCRAP (BUILD phase) carry no toggle — a right-click on them toggles nothing', () => {
    const r = rig();
    r.w.matchPhase = 'BUILD';
    r.sheet.sync(r.w, P0);
    const wide = r.sheet.getUiPoints().actions.filter((b) => b.kind !== 'FEED');
    expect(wide.length, 'fixture: BUILD shows FIX / SCRAP').toBeGreaterThan(0);
    for (const b of wide) {
      expect(b.autoFeed).toBeUndefined();
      press(r, centre(b), 2);
    }
    expect(toggles(r)).toEqual([]);
  });
});

describe('⭐ S193 T4 — the wires exist (source tripwire, paired with the REACH above)', () => {
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const sheet = readFileSync(new URL('../render/characterSheet.ts', import.meta.url), 'utf8');
  it("main.ts turns the card's AUTO_FEED into SET_AUTO_FEED, with the spawner off the card", () => {
    expect(main).toMatch(/action\.kind === 'AUTO_FEED'[\s\S]{0,300}characterSheet\.actionFeedSpawnerId\(\)[\s\S]{0,300}type: 'SET_AUTO_FEED'/);
  });
  it('the card draws the lit toggle off the slot it hit-tests', () => {
    expect(sheet).toContain('if (feed && b.autoFeed === true) {');
    expect(sheet).toContain('autoFeedAt(x: number, y: number)');
  });
});
