/**
 * SPARK — S191 round 2 (INPUT-1 / INPUT-3) — **A MODAL, OR A HUD CONTROL, COVERS THE BOARD: NOTHING UNDER IT ACTS.**
 *
 * The codex, CONNECTION LOST and the exit-confirm backdrops swallow only PIXI events. `Controls` listens
 * on the raw canvas, so both buttons still acted on the board under them — a held tower stamped, a spark
 * was grabbed, a right-click raided (and under the CONNECTION LOST veil the host's clicks kept acting,
 * the net audit's SEAM-3). The BACK TO MAIN button and the settings gear are Pixi controls on the same
 * canvas: a click on BACK TO MAIN with a voltkin armed built it under the button.
 *
 * Driven through the REAL `Controls` handlers and the REAL `FooterBand`. The cover predicate is built
 * EXACTLY as `main.ts` builds it (`mainCover` below; a source-text test pins the two together), from the
 * real `exitButtonRect()` and `settingsGearRect()`. Every scenario runs twice: covered → no board action;
 * uncovered → it reaches the board (the negative control that proves the scenario is real). And a spark
 * drag begun BEFORE the modal still ends cleanly under it: DROP_SPARK, the capture released, Idle — no
 * placement (S52 / S58: `onUp` must never strand a claim).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { Container } from 'pixi.js';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { asCreatureId, asPlayerId, asSparkId, asSpawnerId, type PlayerId } from '../types.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { makeCreature } from '../state/creatures/creature.ts';
import { GOBLIN_MELEE_CONFIG } from '../state/creatures/voltkin-config.ts';
import { canStampAt } from '../state/blueprintLegality.ts';
import { ALL_BLUEPRINT_IDS } from '../state/blueprints.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { Controls, pointInRect, type CastlePanelLike, type CharacterSheetLike, type SheetSelectable } from './controls.ts';
import { FooterBand } from '../render/footerBand.ts';
import { exitButtonRect } from '../render/exitButton.ts';
import { settingsGearRect } from '../render/ui.ts';

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

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
const centre = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** What `main.ts` knows about the screen above the board. */
interface Screen { codex: boolean; connectionLost: boolean; exitConfirm: boolean }
/** ⚠ THE SAME EXPRESSION AS `main.ts`'s `controls.setModalCover(...)` — pinned by the source-text test below. */
function mainCover(w: World, s: Screen): (x: number, y: number) => boolean {
  return (x, y) => s.codex || s.connectionLost || s.exitConfirm
    || (w.gameState === 'PLAYING' && pointInRect(x, y, exitButtonRect())) || pointInRect(x, y, settingsGearRect());
}

interface Rig {
  w: World;
  c: Controls;
  seat: PlayerId;
  band: FooterBand;
  castle: CastlePanelLike & { armed: GodlyId | null };
  screen: Screen;
  sent: GameAction[];
  built: Array<{ id: GodlyId; at: Pt }>;
  selects: Array<SheetSelectable | null>;
  canvas: { style: { cursor: string }; released: number };
}

function rig(seatN: 0 | 1, wire = true): Rig {
  const seat = asPlayerId(seatN);
  const w = makeWorld(0x191d);
  w.gameState = 'TITLE';
  dispatch(w, { type: 'START_GAME', mode: 'bots', isHost: true, roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1] });
  w.draft = null; // no draft plate in the way: this file is about the modals
  const sent: GameAction[] = [];
  const built: Array<{ id: GodlyId; at: Pt }> = [];
  const selects: Array<SheetSelectable | null> = [];
  const canvas = {
    released: 0,
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() { canvas.released++; },
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
  };
  const c = new Controls({ canvas } as never, w, seat, (a) => { sent.push(a); dispatch(w, a); });
  const castle = {
    armed: null as GodlyId | null,
    isOpen: () => false, toggle() {}, close() {}, isOverPanel: () => false,
    armedBlueprint: () => castle.armed,
    disarm() { castle.armed = null; },
    armExternal(id: GodlyId | null) { castle.armed = id; },
    requestShapesFor() {},
  };
  let sel: SheetSelectable | null = null;
  const sheet: CharacterSheetLike = {
    select(t) { sel = t; selects.push(t); }, selection: () => sel, ownedRowAt: () => null, isOver: () => false,
    actionAt: () => null, isOverAnyAction: () => false, actionPrimitiveId: () => null, actionFeedSpawnerId: () => null, setHover() {},
  };
  const stage = new Container();
  const band = new FooterBand({ stage } as never, stage);
  c.setCastlePanel(castle);
  c.setBuildBlueprintHandler((id, at) => built.push({ id, at: { x: at.x, y: at.y } }));
  c.setCharacterSheet(sheet);
  c.setFooterBand(band);
  band.sync(w);
  const screen: Screen = { codex: false, connectionLost: false, exitConfirm: false };
  if (wire) c.setModalCover(mainCover(w, screen));
  return { w, c, seat, band, castle, screen, sent, built, selects, canvas };
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const down = (c: Controls, p: Pt, button = 0): void =>
  (c as unknown as { onDown(e: Ptr): void }).onDown({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
const up = (c: Controls, p: Pt, button = 0): void =>
  (c as unknown as { onUp(e: Ptr): void }).onUp({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
const move = (c: Controls, p: Pt): void =>
  (c as unknown as { onMove(e: Ptr): void }).onMove({ button: 0, clientX: p.x, clientY: p.y, pointerId: 1 });
const click = (c: Controls, p: Pt, button = 0): void => { down(c, p, button); up(c, p, button); };

/** What reached the BOARD (DROP_SPARK is how every drag ENDS, placed or not — not a board action). */
const boardActions = (r: Rig): string[] => [
  ...r.sent.filter((a) => a.type !== 'DROP_SPARK').map((a) => a.type),
  ...r.built.map((b) => `BUILD ${b.id}`),
  ...r.selects.map((s) => `CARD ${s === null ? 'closed' : s.kind}`),
];
const clear = (r: Rig): void => { r.sent.length = 0; r.built.length = 0; r.selects.length = 0; };

function enemyGoblinAt(r: Rig, p: Pt): void {
  const enemy = asPlayerId(r.seat === asPlayerId(0) ? 1 : 0);
  const g = makeCreature(GOBLIN_MELEE_CONFIG, {
    id: asCreatureId(9500 + r.w.creatures.size), ownerPlayerId: enemy, pos: { ...p }, targetPos: { ...p },
    spawnedAtTick: r.w.tick, sourceSpawnerId: asSpawnerId(9950), clock: r.w,
  });
  r.w.creatures.set(g.id, g);
}
function freeSparkAt(r: Rig, p: Pt): void {
  const s = makeFreeSpark({ id: asSparkId(8900 + r.w.freeSparks.size), type: SparkType.Square, pos: { ...p }, velocity: { x: 0, y: 0 }, dt: 1, createdTick: r.w.tick });
  r.w.freeSparks.set(s.id, s);
}

/** A tower this seat may legally stamp at `p`, or null. */
function legalTowerAt(r: Rig, p: Pt): GodlyId | null {
  return ALL_BLUEPRINT_IDS.find((id) => canStampAt(r.w, p, r.seat, id)) ?? null;
}

interface Scenario { name: string; setup(r: Rig, p: Pt): boolean; act(r: Rig, p: Pt): void }
const SCENARIOS: Scenario[] = [
  { name: 'LMB with a tower armed — the stamp', setup(r, p) { r.castle.armed = legalTowerAt(r, p); return r.castle.armed !== null; }, act(r, p) { click(r.c, p); } },
  { name: 'LMB on a free spark — the grab', setup(r, p) { freeSparkAt(r, p); return true; }, act(r, p) { down(r.c, p); } },
  { name: 'LMB on your own gatherer — the re-task', setup(r, p) { const g = [...r.w.gatherers.values()].find((q) => q.ownerPlayerId === r.seat)!; g.pos.x = p.x; g.pos.y = p.y; return true; }, act(r, p) { click(r.c, p); } },
  { name: 'LMB on an enemy unit — its card', setup(r, p) { enemyGoblinAt(r, p); return true; }, act(r, p) { click(r.c, p); } },
  { name: 'RMB on an enemy unit — the raid', setup(r, p) { enemyGoblinAt(r, p); return true; }, act(r, p) { click(r.c, p, 2); } },
  { name: 'a carried potato released — the plant', setup(r) { r.w.players.get(r.seat)!.carriedPotatoId = 1 as never; return true; }, act(r, p) { up(r.c, p); } },
];

/** A bare-board point on this seat's own ground where a tower can be stamped (so every scenario can act). */
function bareBoardPoint(r: Rig): Pt {
  for (let y = 250; y <= 850; y += 50) {
    for (let x = 100; x <= 1820; x += 50) {
      const p = { x, y };
      if (r.band.isOverBandSurface(x, y)) continue;
      if (legalTowerAt(r, p) !== null) return p;
    }
  }
  throw new Error('fixture: no stampable bare-board point');
}

function run(seat: 0 | 1, s: Scenario, at: (r: Rig) => Pt, screen: Partial<Screen>, wire = true): { actions: string[]; setupOk: boolean; r: Rig } {
  const r = rig(seat, wire);
  const p = at(r);
  const setupOk = s.setup(r, p);
  clear(r);
  Object.assign(r.screen, screen);
  s.act(r, p);
  return { actions: boardActions(r), setupOk, r };
}

const MODALS: Array<[string, Partial<Screen>]> = [
  ['the CODEX', { codex: true }],
  ['CONNECTION LOST (SEAM-3)', { connectionLost: true }],
  ['the EXIT CONFIRM', { exitConfirm: true }],
];

describe('⛔⛔ S191 R2 INPUT-1 — under a modal NOTHING on the board acts, either button', () => {
  for (const s of SCENARIOS) {
    it(`bare board, no modal: ${s.name} REACHES the board (the negative control)`, () => {
      const { actions, setupOk } = run(0, s, bareBoardPoint, {});
      expect(setupOk, 'fixture').toBe(true);
      expect(actions.length, `${s.name} must act on bare board, or the covered case proves nothing`).toBeGreaterThan(0);
    });
    it.each(MODALS)(`${s.name}, under %s → nothing`, (_m, screen) => {
      const { actions, r } = run(0, s, bareBoardPoint, screen);
      expect(actions).toEqual([]);
      if (s.name.includes('tower armed')) expect(r.castle.armed, 'swallowed, not spent').not.toBeNull();
    });
  }
});

describe('⛔ S191 R2 INPUT-1 — a spark drag begun BEFORE the modal still ends cleanly under it', () => {
  function drag(covered: boolean): Rig {
    const r = rig(0);
    const p = bareBoardPoint(r);
    freeSparkAt(r, p);
    down(r.c, p);
    expect(r.c.state.kind, 'the grab landed before the modal opened').toBe('AttractDrag');
    if (covered) r.screen.codex = true;
    move(r.c, p);
    clear(r);
    up(r.c, p);
    return r;
  }
  it('under the codex: DROP_SPARK, the capture released, Idle — and NO placement', () => {
    const r = drag(true);
    expect(r.sent.map((a) => a.type)).toEqual(['DROP_SPARK']);
    expect(r.canvas.released, 'the pointer capture was released').toBe(1);
    expect(r.c.state.kind).toBe('Idle');
    expect(r.w.players.get(r.seat)!.kind, 'no glued spark (S52 / S58)').toBe('Idle');
  });
  it('the control, no modal: the same release PLACES', () => {
    const r = drag(false);
    expect(r.sent.map((a) => a.type)).toContain('PLACE_FROM_FREE');
  });
});

describe('⛔ S191 R2 INPUT-3 — the HUD controls: BACK TO MAIN and the settings gear', () => {
  const HUD: Array<[string, () => Pt]> = [
    ['BACK TO MAIN', () => centre(exitButtonRect())],
    ['the settings gear', () => centre(settingsGearRect())],
  ];
  it.each(HUD)('%s: every scenario acts on NOTHING under it — and the same point is live board with no cover', (name, at) => {
    let reachedUnwired = 0;
    for (const seat of [0, 1] as const) {
      for (const s of SCENARIOS) {
        const wired = run(seat, s, at, {});
        if (!wired.setupOk) continue;
        expect(wired.actions, `${name}, seat ${seat}: ${s.name}`).toEqual([]);
        if (run(seat, s, at, {}, false).actions.length > 0) reachedUnwired++;
      }
    }
    expect(reachedUnwired, `anti-vacuity: without the cover, the board under ${name} is live`).toBeGreaterThan(0);
  });

  it('⭐ the auditor’s case: BACK TO MAIN with a voltkin armed builds NOTHING (it did, uncovered)', () => {
    const p = centre(exitButtonRect());
    const seat = ([0, 1] as const).find((n) => canStampAt(rig(n, false).w, p, asPlayerId(n), 'voltkin' as GodlyId));
    expect(seat, 'fixture: a seat may stamp a voltkin under the button').toBeDefined();
    const act = (wire: boolean): Rig => {
      const r = rig(seat!, wire);
      r.castle.armed = 'voltkin' as GodlyId;
      click(r.c, p);
      return r;
    };
    expect(act(false).built.map((b) => b.id), 'uncovered: the reported defect').toEqual(['voltkin']);
    const covered = act(true);
    expect(covered.built).toEqual([]);
    expect(covered.castle.armed, 'the voltkin stays in hand').toBe('voltkin');
  });
});

describe('⭐ S191 R2 — the cursor is plain under a modal, and main.ts builds the cover as tested', () => {
  it('a footer chip earns a pointer — but not under the codex', () => {
    const r = rig(0);
    const chip = centre(r.band.getUiPoints().chips[0]!);
    move(r.c, chip);
    expect(r.canvas.style.cursor).toBe('pointer');
    r.screen.codex = true;
    move(r.c, chip);
    expect(r.canvas.style.cursor).toBe('');
  });

  it('main.ts injects the cover once, with the same five terms `mainCover` tests', () => {
    const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const calls = main.match(/controls\.setModalCover\([^\n]*\);/g) ?? [];
    expect(calls).toHaveLength(1);
    for (const term of [
      '(codexOverlay?.isVisible() ?? false)',
      'lobbyScreen.isConnectionLostVisible()',
      'exitButton.isConfirmOpen()',
      "(world.gameState === 'PLAYING' && pointInRect(x, y, exitButtonRect()))",
      'pointInRect(x, y, settingsGearRect())',
    ]) expect(calls[0], term).toContain(term);
    // …and after the exit button exists (a TDZ read would throw at boot).
    expect(main.indexOf('controls.setModalCover(')).toBeGreaterThan(main.indexOf('const exitButton = makeExitButton('));
  });
});
