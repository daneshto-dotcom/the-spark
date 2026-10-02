/**
 * SPARK — S193 R192-W1 / R191-B — **THE CASTLE'S FIX ALL ROW, AND THE CARD'S FIX, FROM THE REAL CLICK.**
 *
 * Owner, S192: *"there should be a button on your castle saying fix all. And then it just gives a mass
 * command to all the gatherers to first go and fix all the existing towers before … continuing to
 * gather."*
 *
 * Driven for real: the REAL `CastlePanel` is built and synced, its FIX ALL row is found by the centre
 * `getUiPoints()` reports and pressed through the Graphics child Pixi hit-tests (the S182 rule: an
 * opaque surface must be paired with the hit-test that reaches it); the card's FIX goes through the
 * REAL `Controls.onDown` → `handleSheetActionClick` → main.ts's handler body; the job is then carried out
 * by the REAL host tick.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, type Application } from 'pixi.js';

vi.mock('./textFit.ts', () => ({ fitTextToWidth: () => {}, fitTextToBox: () => {} }));
vi.mock('./audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { PRIMITIVE_MAX_HP, SparkType, GATHERER_DEPOSIT_OFFSET_Y } from '../constants.ts';
import { CastlePanel, castleControlsModel, CASTLE_ROW_KEYS, type CastleRowKey } from './castlePanel.ts';
import { characterSheetModel } from './characterSheetModel.ts';
import { Controls, type CastlePanelLike, type CharacterSheetLike, type SheetSelectable } from '../input/controls.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from '../state/hostTick.ts';
import { runGodlyMatcherCore } from '../state/godlyMatcherCore.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { damageEntity } from '../state/damage.ts';
import { repairFeeShapeFor } from '../state/structureRepair.ts';
import { castleAnchor, makeGatherer } from '../state/gatherers/gatherer.ts';
import { asGathererId, asPlayerId, type PrimitiveId, type Vec2 } from '../types.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import '../state/godlyRecipes/registerAll.ts';

const P0 = asPlayerId(0);

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

function deps(): HostTickDeps {
  return {
    spawner: { tick() {} },
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function tick(w: World, st: HostTickState, n: number): void {
  const d = deps();
  const cursor = { lastMatcherTick: -1 };
  for (let i = 0; i < n; i++) {
    runHostTick(w, d, st); // production order: host tick, matcher, effect wipe
    runGodlyMatcherCore(w, cursor);
    w.effects.length = 0;
    w.creatures.clear();
  }
}

function stamp(w: World, id: GodlyId, centre: Vec2): void {
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre });
}

/** Two stamped towers (a laser turret, a goblin tower), one gatherer, one turret leaf razed. */
function board(): { w: World; st: HostTickState; hub: PrimitiveId; goblinHub: PrimitiveId } {
  const w = makeWorld(0x1920);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  w.freeSparks.clear();
  w.gatherers.clear();
  const st = makeHostTickState(w);
  stamp(w, 'laserTurret', { x: 500, y: 300 });
  stamp(w, 'goblinTower', { x: 640, y: 300 });
  tick(w, st, 3);
  w.castleBanks.set(P0, makeCastleBank());
  const d = [...w.defenders.values()][0]!;
  const hub = d.anchorPrimitiveId;
  const leaf = [...d.ownPrimitiveIds!].filter((id) => id !== hub).sort((a, b) => a - b)[0]!;
  damageEntity(w, { kind: 'primitive', id: leaf }, PRIMITIVE_MAX_HP, 'creature', null, 'physical');
  tick(w, st, 40);
  expect(w.defenders.size, 'fixture: the turret fell').toBe(0);
  const c = castleAnchor(0, w.layout);
  const gid = asGathererId(w.nextGathererId++);
  w.gatherers.set(gid, makeGatherer({ id: gid, ownerPlayerId: P0, pos: { x: c.x, y: c.y + GATHERER_DEPOSIT_OFFSET_Y }, spawnedAtTick: 0 }));
  w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
  return { w, st, hub, goblinHub: [...w.creatureSpawners.values()][0]!.anchorPrimitiveId };
}

/** The real panel with main.ts's FIX ALL body injected against `w`. */
function mountPanel(w: World) {
  const stage = new Container();
  const panel = new CastlePanel({ stage } as unknown as Application);
  const sent: string[] = [];
  // ⛔ main.ts's body, `dispatchFn` resolved to its solo/host arm.
  panel.setFixAllHandler(() => {
    sent.push('FIX_ALL');
    dispatch(w, { type: 'FIX_ALL', playerId: w.localPlayerId });
  });
  panel.open(0);
  panel.sync(w);
  return { panel, stage, sent };
}

/** PRESS the row `key` through the box Pixi would hit at its reported centre (castleStatButtons' rule). */
function press(m: ReturnType<typeof mountPanel>, w: World, key: CastleRowKey): void {
  m.panel.sync(w);
  const at = m.panel.getUiPoints().rowCenters.find((r) => r.key === key);
  if (at === undefined) throw new Error(`getUiPoints reports no row ${key}`);
  const root = m.stage.children[0] as Container;
  const hits = root.children.filter((child): child is Container => {
    if (!(child instanceof Container) || child.listenerCount('pointertap') === 0) return false;
    const g = child.children[0];
    if (!(g instanceof Graphics)) return false;
    return g.containsPoint({ x: at.x - root.position.x - child.position.x, y: at.y - root.position.y - child.position.y });
  });
  expect(hits, `exactly one clickable box under ${key}`).toHaveLength(1);
  hits[0]!.emit('pointertap', undefined as never);
}

const fixAllRow = (w: World) => castleControlsModel(w).find((r) => r.key === 'fixAll')!;

describe('⭐⭐ S193 R192-W1 — the castle FIX ALL row', () => {
  it('is a real row: listed, reported by getUiPoints, and its box is hit-tested (it inherits the row loop)', () => {
    expect(CASTLE_ROW_KEYS[0], '⚠ MINE: the top row').toBe('fixAll');
    const { w } = board();
    const m = mountPanel(w);
    expect(m.panel.getUiPoints().rowCenters.map((r) => r.key)).toContain('fixAll');
  });

  it('REACH: pressing it queues a job for every damaged tower, and the host tick fixes them; then the row says NOTHING TO FIX', () => {
    const { w, st, goblinHub } = board();
    damageEntity(w, { kind: 'primitive', id: goblinHub }, 20, 'creature', null, 'physical'); // a dent on the goblin tower too
    expect(fixAllRow(w)).toMatchObject({ enabled: true, label: 'FIX ALL  2' });
    const m = mountPanel(w);
    press(m, w, 'fixAll');
    expect(m.sent).toEqual(['FIX_ALL']);
    expect(w.repairJobs).toHaveLength(2);
    const fee = repairFeeShapeFor('goblinTower')!;
    expect(w.repairJobs.map((j) => j.need)).toContainEqual([fee]);
    w.castleBanks.get(P0)![fee as number] = (w.castleBanks.get(P0)![fee as number] ?? 0) + 1; // the goblin tower's one-shape fee (R182-E)
    for (let i = 0; i < 6000 && w.repairJobs.length > 0; i++) tick(w, st, 1);
    tick(w, st, 40);
    expect(w.repairJobs).toHaveLength(0);
    expect(w.defenders.size, 'the turret stands again').toBe(1);
    expect(fixAllRow(w)).toMatchObject({ enabled: false, reason: 'NOTHING TO FIX' });
  });

  it('⛔ negatives: BUILD ONLY in the FIGHT, NO GATHERERS without one, NOT YOURS on another keep — and a press does nothing', () => {
    const { w } = board();
    w.matchPhase = 'FIGHT';
    expect(fixAllRow(w)).toMatchObject({ enabled: false, reason: 'BUILD ONLY' });
    const m = mountPanel(w);
    press(m, w, 'fixAll');
    expect(m.sent, 'a disabled row dispatches nothing').toEqual([]);
    expect(w.repairJobs).toHaveLength(0);
    w.matchPhase = 'BUILD';
    w.gatherers.clear();
    expect(fixAllRow(w)).toMatchObject({ enabled: false, reason: 'NO GATHERERS' });
    expect(castleControlsModel(w, asPlayerId(1)).find((r) => r.key === 'fixAll')!.reason).toBe('NOT YOURS');
  });
});

describe('⭐⭐ S193 R191-B — the card\'s FIX, through the real Controls click, queues a job the gatherer carries out', () => {
  it('REACH: click FIX on the fallen turret\'s card → a job, not a restore; the host tick brings the Spiral and it stands', () => {
    const { w, st, hub } = board();
    const target = { kind: 'structure', primitiveId: hub } as const;
    const fixBtn = () => characterSheetModel(w, P0, target)!.actions!.buttons.find((b) => b.kind === 'FIX')!;
    expect(fixBtn()).toMatchObject({ enabled: true, caption: 'COSTS 1' });
    const AT = { x: 900, y: 900 };
    let sel: SheetSelectable | null = target as unknown as SheetSelectable;
    const sheet: CharacterSheetLike = {
      select(t) { sel = t; },
      selection: () => sel,
      ownedRowAt: () => null,
      isOver: (x, y) => x === AT.x && y === AT.y,
      // The real model decides: a disabled FIX is not an action (it explains, it does not act).
      actionAt: (x, y) => (x === AT.x && y === AT.y && fixBtn().enabled ? { kind: 'FIX' } : null),
      isOverAnyAction: (x, y) => x === AT.x && y === AT.y,
      actionPrimitiveId: () => hub,
      actionFeedSpawnerId: () => null,
      setHover() {},
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
    // ⛔ main.ts's sheet-action body (the FIX arm), `dispatchFn` resolved to its solo/host arm.
    c.setSheetActionHandler((action, primitiveId) => {
      if (action.kind === 'FIX') dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: w.localPlayerId, primitiveId });
    });
    type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
    const click = (): void => {
      (c as unknown as { onDown(e: Ptr): void }).onDown({ button: 0, clientX: AT.x, clientY: AT.y, pointerId: 1 });
      (c as unknown as { onUp(e: Ptr): void }).onUp({ button: 0, clientX: AT.x, clientY: AT.y, pointerId: 1 });
    };
    const shapes = w.primitives.size;
    click();
    expect(w.repairJobs, 'the click QUEUED a job').toHaveLength(1);
    expect(w.primitives.size, 'and restored nothing on the spot').toBe(shapes);
    expect(fixBtn(), 'the card now reads QUEUED').toMatchObject({ enabled: false, caption: 'QUEUED' });
    click();
    expect(w.repairJobs, '⛔ a second click is refused (one job per tower)').toHaveLength(1);
    for (let i = 0; i < 4000 && w.repairJobs.length > 0; i++) tick(w, st, 1);
    tick(w, st, 40);
    expect(w.defenders.size, 'the turret stands').toBe(1);
  });
});

describe('⛔ the main.ts wire (a tripwire, paired with the REACH tests above)', () => {
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  it('main.ts injects the FIX_ALL dispatch for the local seat, through dispatchFn, and does not predict it', () => {
    const at = main.indexOf('castlePanel.setFixAllHandler(() => {');
    expect(at).toBeGreaterThan(-1);
    expect(main.slice(at, at + 160)).toContain("dispatchFn({ type: 'FIX_ALL', playerId: world.localPlayerId });");
    const start = main.indexOf('const PREDICTABLE_ACTIONS');
    expect(main.slice(start, main.indexOf(']);', start))).not.toContain('FIX_ALL');
  });
});
