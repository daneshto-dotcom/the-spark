/**
 * S194 (T9 coherence finding, built on T5) — the two refused gestures that were SILENT now play the
 * same refused cue (`playUiRefusedSFX`) every other refused control plays, through the REAL
 * `Controls.onDown` / `onUp`:
 *   1. clicking an ILLEGAL spot while holding a tower (the blueprint stamp gate, `canStampAt`);
 *   2. releasing a dragged shape on an ILLEGAL spot (the release gates: reach / spawner zone / territory).
 * And the negative half: a LEGAL click / release stays silent and does its job.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS, SparkType } from '../constants.ts';
import { asPlayerId, asSparkId, type Vec2 } from '../types.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { canStampAt } from '../state/blueprintLegality.ts';
import { canBuildNow } from '../state/buildLegality.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { playUiRefusedSFX } from '../render/audioManager.ts';
import { Controls, type CastlePanelLike } from './controls.ts';
import '../state/godlyRecipes/registerAll.ts';

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const P0 = asPlayerId(0);
const TOWER = 't3TowerVampires' as GodlyId;
const refused = vi.mocked(playUiRefusedSFX);
beforeEach(() => refused.mockClear());

interface Rig { w: World; c: Controls; sent: GameAction[]; built: Vec2[]; castle: CastlePanelLike & { armed: GodlyId | null } }

function rig(): Rig {
  const w = makeWorld(0x194e);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })),
    botSeats: [1],
  });
  w.draft = null; // no panel over the board — the gestures under test are the board's own
  const sent: GameAction[] = [];
  const built: Vec2[] = [];
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, right: CANVAS_WIDTH, bottom: CANVAS_HEIGHT, x: 0, y: 0 }),
  };
  const c = new Controls({ canvas } as never, w, P0, (a) => { sent.push(a); dispatch(w, a); });
  const castle = {
    armed: null as GodlyId | null,
    isOpen: () => false, toggle() {}, close() {}, isOverPanel: () => false,
    armedBlueprint: () => castle.armed,
    disarm() { castle.armed = null; },
    armExternal(id: GodlyId | null) { castle.armed = id; },
    requestShapesFor() {},
  };
  c.setCastlePanel(castle);
  c.setBuildBlueprintHandler((_id, at) => built.push({ x: at.x, y: at.y }));
  return { w, c, sent, built, castle };
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const down = (c: Controls, p: Vec2): void => (c as unknown as { onDown(e: Ptr): void }).onDown({ button: 0, clientX: p.x, clientY: p.y, pointerId: 1 });
const up = (c: Controls, p: Vec2): void => (c as unknown as { onUp(e: Ptr): void }).onUp({ button: 0, clientX: p.x, clientY: p.y, pointerId: 1 });
const move = (c: Controls, p: Vec2): void => (c as unknown as { onMove(e: Ptr): void }).onMove({ button: 0, clientX: p.x, clientY: p.y, pointerId: 1 });

/** A grid scan for the first board point (well clear of the HUD bands) that satisfies `ok`. */
function findPoint(ok: (p: Vec2) => boolean): Vec2 {
  for (let y = 200; y <= 800; y += 20) for (let x = 120; x <= 1800; x += 20) if (ok({ x, y })) return { x, y };
  throw new Error('fixture: no such point on this board');
}

describe('S194 — a refused tower stamp plays the refused cue', () => {
  it('REACH: an illegal click while holding a tower → the refused cue, no build, still holding', () => {
    const r = rig();
    const bad = findPoint((p) => !canStampAt(r.w, p, P0, TOWER));
    r.castle.armed = TOWER;
    down(r.c, bad);
    up(r.c, bad);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(r.built).toEqual([]);
    expect(r.castle.armed, 'the tower stays in hand').toBe(TOWER);
  });

  it('NEGATIVE: a legal click builds and stays silent', () => {
    const r = rig();
    const good = findPoint((p) => canStampAt(r.w, p, P0, TOWER));
    r.castle.armed = TOWER;
    down(r.c, good);
    up(r.c, good);
    expect(refused).not.toHaveBeenCalled();
    expect(r.built).toEqual([good]);
  });
});

describe('S194 — a shape released on an illegal spot plays the refused cue', () => {
  function grab(r: Rig, at: Vec2, id: number): void {
    const s = makeFreeSpark({ id: asSparkId(id), type: SparkType.Square, pos: { ...at }, velocity: { x: 0, y: 0 }, dt: 1, createdTick: r.w.tick });
    r.w.freeSparks.set(s.id, s);
    down(r.c, at);
    expect(r.c.state.kind, 'the grab landed').toBe('AttractDrag');
  }

  it('REACH: released in ANOTHER seat\'s territory (the spark caught up) → refused, nothing placed', () => {
    const r = rig();
    const mine = findPoint((p) => canBuildNow(r.w, p, P0));
    const theirs = findPoint((p) => !canBuildNow(r.w, p, P0));
    grab(r, mine, 9401);
    const s = r.w.freeSparks.get(asSparkId(9401))!;
    s.pos.x = theirs.x;
    s.pos.y = theirs.y;
    move(r.c, theirs);
    r.sent.length = 0;
    up(r.c, theirs);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(r.sent.some((a) => a.type === 'PLACE_FROM_FREE')).toBe(false);
  });

  it('REACH: released out of reach (the spark has not caught up) → refused, nothing placed', () => {
    const r = rig();
    const mine = findPoint((p) => canBuildNow(r.w, p, P0));
    grab(r, mine, 9402);
    const far = { x: mine.x + 400, y: mine.y };
    move(r.c, far);
    r.sent.length = 0;
    up(r.c, far);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(r.sent.some((a) => a.type === 'PLACE_FROM_FREE')).toBe(false);
  });

  it('NEGATIVE: a legal release places the shape and stays silent', () => {
    const r = rig();
    const mine = findPoint((p) => canBuildNow(r.w, p, P0));
    grab(r, mine, 9403);
    r.sent.length = 0;
    up(r.c, mine);
    expect(refused).not.toHaveBeenCalled();
    expect(r.sent.some((a) => a.type === 'PLACE_FROM_FREE')).toBe(true);
  });
});
