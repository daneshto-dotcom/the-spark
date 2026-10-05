/**
 * SPARK — ⭐⭐ S195 N7 + N5 (s195/info-ui): REACH through the REAL card.
 *
 * The resolver is pinned in `hoverPreview.test.ts`; this drives `CharacterSheet.sync` with a real Pixi stage
 * (no renderer, as every `uiSkinReach.*` test does) and proves the tooltip APPEARS after the rest
 * (`HOVER_PREVIEW_DELAY_MS`), DISAPPEARS the frame the pointer leaves, shows for a free shape with NO card
 * open, never fires through the open card, and respects the fog. Then the ui-4 seam: a pressed FIX / FEED
 * chip is skinned 'press' while the pointer is down, 'hover' when it lifts — and `Controls.onDown` / `onUp`
 * really drive `setPressed` (the two plumbing lines), through the real class.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import { asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { runSpawnerIgnition } from '../state/godlyMatcherCore.ts';
import '../state/godlyRecipes/registerAll.ts';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { beginConcealmentFrame, resetConcealmentForTest } from './concealment.ts';
import { HOVER_PREVIEW_DELAY_MS } from './hoverPreview.ts';
import { Controls, type CastlePanelLike, type CharacterSheetLike } from '../input/controls.ts';

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

const { CharacterSheet } = await import('./characterSheet.ts');
const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

let now = 10_000;
beforeAll(() => {
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  resetConcealmentForTest();
  skinned.length = 0;
});

function goblinWorld(): { w: World; anchor: number } {
  const w = makeWorld(0x195a);
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
  for (let i = 0; i < after.length; i++) after[i] = 3;
  w.castleBanks.set(P0, after);
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 100_000;
  const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === 'goblinTower')!;
  return { w, anchor: Number(sp.anchorPrimitiveId) };
}

function freeShape(w: World, id: number, x: number, y: number, type: SparkType, owner: PlayerId = P0): Primitive {
  const color = PLAYER_COLORS[owner as number]!;
  const p: Primitive = {
    id: asPrimitiveId(id), type, placerColor: color, placedBy: owner, createdTick: 0, pos: { x, y }, prevPos: { x, y },
    bonds: new Set(), ownerColor: color, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

/** Every VISIBLE Text under `stage`, so "the tooltip is drawn" is a fact about Pixi objects, not a flag. */
function visibleTexts(stage: Container): string[] {
  const out: string[] = [];
  const walk = (c: Container): void => {
    for (const ch of c.children) {
      if (!ch.visible) continue;
      const t = (ch as unknown as { text?: unknown }).text;
      if (typeof t === 'string') out.push(t);
      else if ((ch as Container).children !== undefined) walk(ch as Container);
    }
  };
  walk(stage);
  return out;
}

const mid = (r: { x: number; y: number; w: number; h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

describe('⭐⭐ N7 REACH — the tooltip through the real card', () => {
  it('a FEED chip: nothing before the rest, the preview after it, gone the frame the pointer leaves', () => {
    const { w, anchor } = goblinWorld();
    const stage = new Container();
    const sheet = new CharacterSheet({ stage } as never, stage);
    sheet.select({ kind: 'structure', primitiveId: anchor as never });
    sheet.sync(w, P0);
    const square = sheet.getUiPoints().actions.find((a) => a.kind === 'FEED' && a.sparkType === SparkType.Square)!;
    expect(square, 'anti-vacuity: the goblin tower card has a Square chip').toBeDefined();
    const [cx, cy] = mid(square);
    sheet.setHover(cx, cy);
    sheet.sync(w, P0);
    let ui = sheet.getUiPoints();
    expect(ui.preview?.name, 'resolved at once').toBe('SHIELD GOBLIN');
    expect(ui.preview?.source).toBe('chip');
    expect(ui.preview?.madeFrom).toBe(SparkType.Square);
    expect(ui.preview?.shown, 'but not drawn yet: the pointer has to rest').toBe(false);
    expect(visibleTexts(stage)).not.toContain('SHIELD GOBLIN');
    now += HOVER_PREVIEW_DELAY_MS - 1;
    sheet.sync(w, P0);
    expect(sheet.isPreviewShown()).toBe(false);
    now += 1;
    sheet.sync(w, P0);
    ui = sheet.getUiPoints();
    expect(ui.preview?.shown).toBe(true);
    const texts = visibleTexts(stage);
    expect(texts, 'the name is on the stage').toContain('SHIELD GOBLIN');
    expect(texts, 'the tier line names the shape — the owner\'s "what is square?"').toContain('GOBLIN · FROM SQUARE');
    expect(texts.some((t) => t.endsWith(' a swing')), 'the ATK row\'s derived strike').toBe(true);
    expect(texts.some((t) => t.endsWith(' pool')), 'the HP row\'s derived pool').toBe(true);
    // Leave: hidden on the very next frame, no delay on the way out.
    sheet.setHover(-1, -1);
    sheet.sync(w, P0);
    expect(sheet.getUiPoints().preview).toBeNull();
    expect(sheet.isPreviewShown()).toBe(false);
    expect(visibleTexts(stage)).not.toContain('SHIELD GOBLIN');
  });

  it('moving to ANOTHER chip restarts the rest (no strobe), and the title area of the card previews nothing', () => {
    const { w, anchor } = goblinWorld();
    const stage = new Container();
    const sheet = new CharacterSheet({ stage } as never, stage);
    sheet.select({ kind: 'structure', primitiveId: anchor as never });
    sheet.sync(w, P0);
    const acts = sheet.getUiPoints().actions;
    const sq = acts.find((a) => a.kind === 'FEED' && a.sparkType === SparkType.Square)!;
    const tri = acts.find((a) => a.kind === 'FEED' && a.sparkType === SparkType.Triangle)!;
    sheet.setHover(...mid(sq));
    sheet.sync(w, P0);
    now += HOVER_PREVIEW_DELAY_MS;
    sheet.sync(w, P0);
    expect(sheet.isPreviewShown()).toBe(true);
    sheet.setHover(...mid(tri));
    sheet.sync(w, P0);
    expect(sheet.getUiPoints().preview?.name).toBe('MELEE GOBLIN');
    expect(sheet.isPreviewShown(), 'a new subject waits its own rest').toBe(false);
    now += HOVER_PREVIEW_DELAY_MS;
    sheet.sync(w, P0);
    expect(sheet.isPreviewShown()).toBe(true);
    // The card's title area: on the card, not a chip → the board under the card is NOT picked.
    const r = sheet.rect()!;
    freeShape(w, 9001, r.x + 20, r.y + 10, SparkType.Square); // a shape hidden under the card's header
    sheet.setHover(r.x + 20, r.y + 10);
    sheet.sync(w, P0);
    expect(sheet.getUiPoints().preview, 'nothing fires through the card').toBeNull();
  });

  it('a FREE SHAPE with NO card open previews what the goblin tower would make of it; a bonded shape does not', () => {
    const { w } = goblinWorld();
    const stage = new Container();
    const sheet = new CharacterSheet({ stage } as never, stage);
    freeShape(w, 9002, 1500, 300, SparkType.Spiral);
    sheet.select(null);
    sheet.setHover(1502, 301);
    sheet.sync(w, P0);
    expect(sheet.getUiPoints().selected).toBeNull();
    expect(sheet.getUiPoints().preview?.source).toBe('shape');
    now += HOVER_PREVIEW_DELAY_MS;
    sheet.sync(w, P0);
    expect(visibleTexts(stage)).toContain('BAT GOBLIN');
    // A shape of the tower itself (bonded): no preview.
    const member = [...w.primitives.values()].find((p) => p.bonds.size > 0)!;
    sheet.setHover(member.pos.x, member.pos.y);
    sheet.sync(w, P0);
    expect(sheet.getUiPoints().preview).toBeNull();
  });

  it('⛔ negative: the enemy\'s free shape in the fog previews nothing; mine in my dark corner does', () => {
    const { w } = goblinWorld();
    w.localPlayerId = P0;
    const stage = new Container();
    const sheet = new CharacterSheet({ stage } as never, stage);
    freeShape(w, 9003, 1700, 900, SparkType.Square, P1);
    freeShape(w, 9004, 1000, 1000, SparkType.Square, P0);
    beginConcealmentFrame(w, { x: 200, y: 200 });
    sheet.setHover(1700, 900);
    sheet.sync(w, P0);
    expect(sheet.getUiPoints().preview).toBeNull();
    sheet.setHover(1000, 1000);
    sheet.sync(w, P0);
    expect(sheet.getUiPoints().preview?.name).toBe('SHIELD GOBLIN');
  });
});

describe('⛔ S195 audit LOW-1 / LOW-2 — the preview never draws under the match board or over a HUD surface', () => {
  it('LOW-1: in POSTGAME a creature under the pointer resolves to NOTHING and nothing is drawn, however long it rests', () => {
    const { w } = goblinWorld();
    const stage = new Container();
    const sheet = new CharacterSheet({ stage } as never, stage);
    dispatch(w, { type: 'SPAWN_CREATURE', creatureType: 'goblinSuicide', ownerPlayerId: P0, pos: { x: 1500, y: 300 }, targetPos: { x: 1500, y: 300 }, sourceSpawnerId: [...w.creatureSpawners.keys()][0] } as never);
    expect(w.creatures.size, 'anti-vacuity').toBe(1);
    sheet.setHover(1500, 300);
    sheet.sync(w, P0);
    now += HOVER_PREVIEW_DELAY_MS;
    sheet.sync(w, P0);
    expect(sheet.isPreviewShown(), 'PLAYING: shown').toBe(true);
    w.gameState = 'POSTGAME';
    sheet.sync(w, P0);
    expect(sheet.getUiPoints().preview).toBeNull();
    expect(sheet.isPreviewShown()).toBe(false);
    expect(visibleTexts(stage)).not.toContain('SAPPER GOBLIN');
    now += HOVER_PREVIEW_DELAY_MS * 10;
    sheet.sync(w, P0);
    expect(sheet.isPreviewShown(), 'still nothing, however long the rest').toBe(false);
    w.gameState = 'PLAYING';
    sheet.sync(w, P0);
    now += HOVER_PREVIEW_DELAY_MS;
    sheet.sync(w, P0);
    expect(sheet.isPreviewShown(), 'back in PLAYING the rest starts again and it shows').toBe(true);
  });

  it('LOW-2: Controls blanks the card\'s hover (-1,-1) under the open castle panel and under the footer surface — through the real class', () => {
    const { w } = goblinWorld();
    const hovers: Array<[number, number]> = [];
    const sheet: CharacterSheetLike = {
      select() {}, selection: () => null, ownedRowAt: () => null, isOver: () => false, actionAt: () => null,
      isOverAnyAction: () => false, actionPrimitiveId: () => null, actionFeedSpawnerId: () => null,
      setHover(x, y) { hovers.push([x, y]); },
    };
    let panelOpen = false;
    let overPanel = false;
    let overBand = false;
    const canvas = {
      addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, style: { cursor: '' },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
    };
    const c = new Controls({ canvas } as never, w, P0, (a) => dispatch(w, a));
    c.setCastlePanel({
      isOpen: () => panelOpen, toggle() {}, close() {}, isOverPanel: () => overPanel, armedBlueprint: () => null,
      disarm() {}, armExternal() {}, requestShapesFor() {},
    } as unknown as CastlePanelLike);
    c.setFooterBand({
      isOverBandSurface: () => overBand, isOverChip: () => false, chipAt: () => null, isOverCollapseTab: () => false, pressCollapseTab: () => false,
      select: () => null, cardAt: () => null, cardEnabled: () => false, setArmed() {}, setHover() {}, setPressed() {},
      pressShapeStrip: () => false, isOverRaSquare: () => false, isOverScorchedEarthSquare: () => false, isOverSkillSquare: () => false,
    } as never);
    c.setCharacterSheet(sheet);
    type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
    const moveTo = (x: number, y: number): void => { (c as unknown as { onMove(e: Ptr): void }).onMove({ button: 0, clientX: x, clientY: y, pointerId: 1 }); };
    moveTo(1500, 300);
    expect(hovers.at(-1), 'open board: the real cursor').toEqual([1500, 300]);
    panelOpen = true; overPanel = true;
    moveTo(1500, 301);
    expect(hovers.at(-1), 'under the open castle panel: blanked').toEqual([-1, -1]);
    panelOpen = false; overPanel = false; overBand = true;
    moveTo(1500, 302);
    expect(hovers.at(-1), 'under the footer surface: blanked').toEqual([-1, -1]);
    overBand = false;
    moveTo(1500, 303);
    expect(hovers.at(-1), 'off both: the real cursor again').toEqual([1500, 303]);
  });
});

describe('⭐ N5 (ui-4 seam) REACH — the card\'s controls sink while the pointer is down', () => {
  it('FIX and a FEED chip: hover → "hover", pressed → "press", released → "hover", off → "rest"', () => {
    const { w, anchor } = goblinWorld();
    const stage = new Container();
    const sheet = new CharacterSheet({ stage } as never, stage);
    sheet.select({ kind: 'structure', primitiveId: anchor as never });
    sheet.sync(w, P0);
    const acts = sheet.getUiPoints().actions.filter((a) => a.enabled && (a.kind === 'FIX' || a.kind === 'SCRAP' || a.kind === 'FEED'));
    expect(acts.length, 'anti-vacuity: enabled controls to press').toBeGreaterThan(1);
    const stateOf = (a: { x: number; y: number; w: number; h: number }): string =>
      skinned.find((s) => s.x === a.x && s.y === a.y && s.w === a.w && s.h === a.h)!.state;
    for (const a of acts) {
      sheet.setHover(...mid(a));
      skinned.length = 0; sheet.sync(w, P0);
      expect(stateOf(a), `${a.kind} hovered`).toBe('hover');
      sheet.setPressed(true);
      skinned.length = 0; sheet.sync(w, P0);
      expect(stateOf(a), `${a.kind} pressed`).toBe('press');
      sheet.setPressed(false);
      skinned.length = 0; sheet.sync(w, P0);
      expect(stateOf(a), `${a.kind} released`).toBe('hover');
      sheet.setHover(-1, -1);
      sheet.setPressed(true); // pressed somewhere else: this control must not sink
      skinned.length = 0; sheet.sync(w, P0);
      expect(stateOf(a), `${a.kind} pressed elsewhere`).toBe('rest');
      sheet.setPressed(false);
    }
  });

  it('⛔ the plumbing: Controls.onDown latches setPressed(true) on the card, onUp releases it — through the real class', () => {
    const { w } = goblinWorld();
    const calls: boolean[] = [];
    const sheet: CharacterSheetLike = {
      select() {}, selection: () => null, ownedRowAt: () => null, isOver: () => false, actionAt: () => null,
      isOverAnyAction: () => false, actionPrimitiveId: () => null, actionFeedSpawnerId: () => null, setHover() {},
      setPressed(d) { calls.push(d); },
    };
    const canvas = {
      addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, style: { cursor: '' },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
    };
    const c = new Controls({ canvas } as never, w, P0, (a) => dispatch(w, a));
    c.setCastlePanel({
      isOpen: () => false, toggle() {}, close() {}, isOverPanel: () => false, armedBlueprint: () => null,
      disarm() {}, armExternal() {}, requestShapesFor() {},
    } as unknown as CastlePanelLike);
    c.setCharacterSheet(sheet);
    type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
    (c as unknown as { onDown(e: Ptr): void }).onDown({ button: 0, clientX: 1500, clientY: 200, pointerId: 1 });
    expect(calls, 'the frame that takes the click shows it taken').toEqual([true]);
    (c as unknown as { onUp(e: Ptr): void }).onUp({ button: 0, clientX: 1500, clientY: 200, pointerId: 1 });
    expect(calls).toEqual([true, false]);
  });
});
