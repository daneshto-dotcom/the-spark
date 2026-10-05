/**
 * SPARK — S191 R191-A — **THE TWO CARDS OF A WELDED STRUCTURE.**
 *
 * Owner, S191: *"When you click on the tower that's connected within the welded shape, you can only see
 * the tower with its stats, but when you click on the shape that's welded to it, you can see the whole
 * structure and what it's made of … if a … tower is welded to a larger structure, then it should show
 * its own HP. And then out of how much the total structure has HP. And maybe … what kind of buildings
 * are there just by … little pictures … when you click on the … welded shape itself, it's new character
 * sheet will include like all the structure[s] that are in that … whole structure."*
 *
 * Driven from the REAL click (`Controls.onDown` → the card's `select`) into the REAL card model
 * (`characterSheetModel`), on a world built by the real stamp and the real host tick.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PrimitiveId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from '../state/hostTick.ts';
import { runGodlyMatcherCore } from '../state/godlyMatcherCore.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { mulberry32 } from '../state/rng.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { structurePoolFifths } from '../state/stats.ts';
import { componentOf } from '../game/structure.ts';
import type { Primitive } from '../game/primitive.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { Controls, type CastlePanelLike, type CharacterSheetLike, type SheetSelectable } from '../input/controls.ts';
import { characterSheetModel, type SheetTarget } from './characterSheetModel.ts';
import { codexCopyFor } from './codexPresentation.ts';
import { ENTROPY_SCALE, entropyChance } from '../state/entropy.ts'; // ⭐ S195 N12
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
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
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
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    w.effects.length = 0;
  }
}

function stamp(w: World, id: GodlyId, centre: { x: number; y: number }): void {
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre });
}

function mk(w: World, type: SparkType, x: number, y: number): Primitive {
  const color = w.players.get(P0)!.color;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type, placerColor: color, placedBy: P0, createdTick: w.tick, pos: { x, y }, prevPos: { x, y },
    bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

function bond(w: World, a: Primitive, b: Primitive): BondId {
  const bid = asBondId(w.nextBondId++);
  w.bonds.set(bid, { id: bid, aId: a.id, bId: b.id, a, b, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick });
  a.bonds.add(bid);
  b.bonds.add(bid);
  return bid;
}

/** A stamped laser turret and goblin tower, a Square welding them, and a Triangle welded ON the turret's hub. */
function welded(): { w: World; st: HostTickState; turretHub: PrimitiveId; goblinHub: PrimitiveId; square: Primitive; tri: Primitive } {
  const w = makeWorld(0x5191a);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  const st = makeHostTickState(w);
  stamp(w, 'laserTurret', { x: 500, y: 300 });
  stamp(w, 'goblinTower', { x: 640, y: 300 });
  tick(w, st, 3);
  const turretHub = [...w.defenders.values()][0]!.anchorPrimitiveId;
  const goblinHub = [...w.creatureSpawners.values()][0]!.anchorPrimitiveId;
  const nearest = (hub: PrimitiveId, dir: 1 | -1): Primitive =>
    [...componentOf(w.primitives.get(hub)!, w.primitives, w.bonds).primitiveIds]
      .map((id) => w.primitives.get(id)!).sort((a, b) => dir * (b.pos.x - a.pos.x))[0]!;
  const square = mk(w, SparkType.Square, 570, 300);
  bond(w, square, nearest(turretHub, 1));
  bond(w, square, nearest(goblinHub, -1));
  const tri = mk(w, SparkType.Triangle, 520, 318);
  bond(w, tri, w.primitives.get(turretHub)!);
  tick(w, st, 62);
  expect(w.defenders.size, 'the welded turret stands').toBe(1);
  expect(w.creatureSpawners.size, 'the welded goblin tower stands').toBe(1);
  return { w, st, turretHub, goblinHub, square, tri };
}

describe('⭐⭐ S191 R191-A — the TOWER card and the STRUCTURE card of a welded structure', () => {
  it('each tower card shows its OWN pool, the structure total, and the OTHER tower', () => {
    const { w, turretHub, goblinHub } = welded();
    const comp = componentOf(w.primitives.get(turretHub)!, w.primitives, w.bonds);
    const total = structurePoolFifths(comp.bondIds.size);
    const turret = characterSheetModel(w, P0, { kind: 'structure', primitiveId: turretHub })!;
    expect(turret.title).toBe(codexCopyFor('laserTurret').name);
    expect(turret.health.max, 'its own six connectors').toBe(structurePoolFifths(6));
    expect(turret.health.cur).toBe(structurePoolFifths(6));
    expect(turret.stats.find((r) => r.label === 'CONNECTORS')!.points, 'its OWN connectors').toBe(6);
    expect(turret.welded?.role).toBe('tower');
    expect(turret.welded!.structure).toEqual({ cur: total, max: total });
    expect(turret.welded!.towers.map((t) => t.name), 'the OTHER tower, not itself').toEqual([codexCopyFor('goblinTower').name]);
    expect(turret.welded!.towers[0]!.health.max).toBe(structurePoolFifths(4));
    expect(turret.actions!.buttons.map((b) => b.kind), 'its own FIX and SCRAP').toEqual(['FIX', 'SCRAP']);

    const goblin = characterSheetModel(w, P0, { kind: 'structure', primitiveId: goblinHub })!;
    expect(goblin.health.max).toBe(structurePoolFifths(4));
    expect(goblin.welded!.towers.map((t) => t.name)).toEqual([codexCopyFor('laserTurret').name]);
    expect(goblin.welded!.structure.max).toBe(total);
    // A dent on the TURRET moves the turret's own pool and the total — never the goblin tower's.
    const arm = [...w.primitives.get(turretHub)!.bonds].sort((x, y) => x - y)[0]!;
    w.bonds.get(arm)!.damageFifths = 10;
    expect(characterSheetModel(w, P0, { kind: 'structure', primitiveId: turretHub })!.health.cur).toBe(structurePoolFifths(6) - 10);
    const g2 = characterSheetModel(w, P0, { kind: 'structure', primitiveId: goblinHub })!;
    expect(g2.health.cur, 'the goblin tower is not dented').toBe(structurePoolFifths(4));
    expect(g2.welded!.structure.cur, 'the structure is').toBe(total - 10);
  });

  it('⭐ S195 N12 — every card of the weld reads the WHOLE structure\'s ENTROPY (the count `planEntropy` prices); LOST is P0\'s alone', () => {
    const { w, turretHub, goblinHub, square } = welded();
    const n = componentOf(square, w.primitives, w.bonds).bondIds.size;
    expect(n, 'anti-vacuity: more connectors than either tower alone').toBeGreaterThan(6);
    for (const id of [turretHub, goblinHub, square.id]) {
      const v = characterSheetModel(w, P0, { kind: 'structure', primitiveId: id })!;
      const e = v.stats.find((r) => r.label === 'ENTROPY %')!;
      expect(e, `ENTROPY row on ${v.title}`).toBeDefined();
      expect(e.points).toBe((entropyChance(n) * 100) / ENTROPY_SCALE);
      expect(v.stats.find((r) => r.label === 'LOST'), 'owner view').toBeDefined();
      const theirs = characterSheetModel(w, asPlayerId(1), { kind: 'structure', primitiveId: id })!;
      expect(theirs.stats.find((r) => r.label === 'LOST'), 'B-17: not on another seat\'s view').toBeUndefined();
    }
    // ⭐ S195 N7a — the welded goblin tower's card still lists its contents (empty here: nothing fed).
    const goblin = characterSheetModel(w, P0, { kind: 'structure', primitiveId: goblinHub })!;
    expect(goblin.welded?.role).toBe('tower');
    expect(goblin.stats.find((r) => r.label === 'GOBLINS')).toEqual({ label: 'GOBLINS', points: 0, derived: 'in the tower' });
    const turret = characterSheetModel(w, P0, { kind: 'structure', primitiveId: turretHub })!;
    expect(turret.stats.find((r) => r.label === 'GOBLINS'), 'the turret holds no goblins').toBeUndefined();
  });

  it('the WELD’s card: the structure’s pool, what it is made of, every tower with its own pool; SCRAP only', () => {
    const { w, square } = welded();
    const comp = componentOf(square, w.primitives, w.bonds);
    const v = characterSheetModel(w, P0, { kind: 'structure', primitiveId: square.id })!;
    expect(v.title).toBe('WELDED STRUCTURE');
    expect(v.health.max).toBe(structurePoolFifths(comp.bondIds.size));
    expect(v.welded?.role).toBe('structure');
    expect(v.welded!.towers.map((t) => t.name), 'spawners by id, then defenders by id')
      .toEqual([codexCopyFor('goblinTower').name, codexCopyFor('laserTurret').name]);
    expect(v.welded!.towers.map((t) => t.health.max)).toEqual([structurePoolFifths(4), structurePoolFifths(6)]);
    const byLabel = new Map(v.stats.map((r) => [r.label, r.points]));
    expect(byLabel.get('CONNECTORS')).toBe(comp.bondIds.size);
    expect(byLabel.get('SHAPES')).toBe(comp.primitiveIds.size);
    expect(byLabel.get('SPIRALS'), 'what it is made of').toBe(6);
    expect(byLabel.get('CIRCLES')).toBe(5);
    expect(byLabel.get('SQUARE')).toBe(1);
    expect(byLabel.get('TRIANGLE')).toBe(1);
    expect(v.actions!.buttons.map((b) => b.kind), 'SCRAP only — no FIX, no FEED on the weld').toEqual(['SCRAP']);
    // Each row opens that tower's card.
    const rowTarget = v.welded!.towers[1]!.target as SheetTarget;
    expect(characterSheetModel(w, P0, rowTarget)!.title).toBe(codexCopyFor('laserTurret').name);
  });

  it('a STANDALONE tower’s card has no welded block', () => {
    const w = makeWorld(0x5191b);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'BUILD';
    w.creatures.clear();
    const st = makeHostTickState(w);
    stamp(w, 'laserTurret', { x: 500, y: 300 });
    tick(w, st, 3);
    const hub = [...w.defenders.values()][0]!.anchorPrimitiveId;
    const v = characterSheetModel(w, P0, { kind: 'structure', primitiveId: hub })!;
    expect(v.welded ?? null).toBeNull();
    expect(v.subtitle).toBe('YOUR BUILDING');
  });

  it('REACH — the real click: the Triangle welded ON the turret’s art opens the STRUCTURE card; the art opens the TOWER card', () => {
    const { w, turretHub, tri } = welded();
    const selects: Array<SheetSelectable | null> = [];
    let sel: SheetSelectable | null = null;
    const sheet: CharacterSheetLike = {
      select(t) { sel = t; selects.push(t); },
      selection: () => sel,
      ownedRowAt: () => null,
      isOver: () => false,
      actionAt: () => null,
      isOverAnyAction: () => false,
      actionPrimitiveId: () => null,
      actionFeedSpawnerId: () => null,
      setHover() {},
    };
    const castle: CastlePanelLike = {
      isOpen: () => false, toggle() {}, close() {}, isOverPanel: () => false, armedBlueprint: () => null,
      disarm() {}, armExternal() {}, requestShapesFor() {},
    } as unknown as CastlePanelLike;
    const canvas = {
      addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, style: { cursor: '' },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
    };
    const c = new Controls({ canvas } as never, w, P0, (a) => dispatch(w, a));
    c.setCastlePanel(castle);
    c.setCharacterSheet(sheet);
    type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
    const click = (x: number, y: number): void => {
      (c as unknown as { onDown(e: Ptr): void }).onDown({ button: 0, clientX: x, clientY: y, pointerId: 1 });
      (c as unknown as { onUp(e: Ptr): void }).onUp({ button: 0, clientX: x, clientY: y, pointerId: 1 });
    };
    click(tri.pos.x, tri.pos.y);
    const onWeld = selects.at(-1) as SheetTarget;
    expect(onWeld, 'the visible weld on the art is what was clicked').toEqual({ kind: 'structure', primitiveId: tri.id });
    expect(characterSheetModel(w, P0, onWeld)!.title).toBe('WELDED STRUCTURE');
    const hub = w.primitives.get(turretHub)!;
    click(hub.pos.x - 20, hub.pos.y - 25); // inside the art box, on no visible shape
    const onArt = selects.at(-1) as SheetTarget;
    expect(characterSheetModel(w, P0, onArt)!.title).toBe(codexCopyFor('laserTurret').name);
    expect(characterSheetModel(w, P0, onArt)!.welded?.role).toBe('tower');
  });
});

/** The real-click harness: a recording sheet stub + a Controls over `w`. Returns `click(x, y)` → the selection. */
function clicker(w: World): (x: number, y: number) => SheetTarget | null {
  let sel: SheetSelectable | null = null;
  const sheet: CharacterSheetLike = {
    select(t) { sel = t; },
    selection: () => sel,
    ownedRowAt: () => null,
    isOver: () => false,
    actionAt: () => null,
    isOverAnyAction: () => false,
    actionPrimitiveId: () => null,
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
  type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
  return (x, y) => {
    (c as unknown as { onDown(e: Ptr): void }).onDown({ button: 0, clientX: x, clientY: y, pointerId: 1 });
    (c as unknown as { onUp(e: Ptr): void }).onUp({ button: 0, clientX: x, clientY: y, pointerId: 1 });
    return sel as SheetTarget | null;
  };
}

function inBuild(seed: number): { w: World; st: HostTickState } {
  const w = makeWorld(seed);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  return { w, st: makeHostTickState(w) };
}

/** True when no shape lies within its pick radius of (x, y) — the click lands on the art, not a shape. */
function onNoShape(w: World, x: number, y: number): boolean {
  for (const p of w.primitives.values()) if ((p.pos.x - x) ** 2 + (p.pos.y - y) ** 2 <= (p.radius + 6) ** 2) return false;
  return true;
}

describe('⭐ S192 IDENTITY-2 — REACH: the turret\'s ART opens the turret, though a Scarab ring shares its hub', () => {
  it('a click on the laser turret\'s art (no shape under it) opens LASER TURRET; SCRAP from it takes its six Spirals', () => {
    const { w, st } = inBuild(0x5192a);
    const p = w.players.get(P0)!;
    w.players.set(P0, { ...p, raceId: 'mummies' } as typeof p);
    stamp(w, 'laserTurret', { x: 500, y: 300 });
    tick(w, st, 3);
    const turret = [...w.defenders.values()][0]!;
    const hub = w.primitives.get(turret.anchorPrimitiveId)!;
    // The audit W2-4 topology: two Lines on the hub and on each other — an exact Line 3-ring through it.
    const la = mk(w, SparkType.Line, hub.pos.x + 10, hub.pos.y - 17);
    const lb = mk(w, SparkType.Line, hub.pos.x - 10, hub.pos.y - 17);
    bond(w, la, hub); bond(w, lb, hub); bond(w, la, lb);
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { ...hub.pos }, bondCount: 3 });
    tick(w, st, 62);
    expect([...w.creatureSpawners.values()].map((s) => [s.recipeId, s.anchorPrimitiveId])).toEqual([['t3TowerMummies', hub.id]]);
    expect(w.defenders.size).toBe(1);
    const click = clicker(w);
    // BELOW the hub: inside the turret's art box, away from the ring (which sits above the hub), on no shape.
    const at = [20, 26, 32, 38].flatMap((dy) => [-12, -6, 0, 6, 12].map((dx) => ({ x: hub.pos.x + dx, y: hub.pos.y + dy })))
      .find((q) => onNoShape(w, q.x, q.y))!;
    expect(at, 'fixture: a point on the art, not on a shape').toBeDefined();
    const sel = click(at.x, at.y)!;
    expect(sel, 'the art box answered').not.toBeNull();
    expect(characterSheetModel(w, P0, sel)!.title).toBe(codexCopyFor('laserTurret').name);
    const scrapPlan = (sel as { primitiveId: PrimitiveId }).primitiveId;
    const own = [...turret.ownPrimitiveIds!].filter((id) => id !== hub.id).sort((a, b) => a - b);
    // The intent the card's SCRAP sends is the card's own primitiveId: it must name THIS tower.
    dispatch(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: scrapPlan });
    for (const id of own) expect(w.primitives.has(id), 'the turret\'s Spirals are scrapped').toBe(false);
    expect(w.primitives.has(hub.id), 'the hub the ring shares stays').toBe(true);
    expect(w.creatureSpawners.size, 'the Scarab ring is untouched').toBe(1);
  });
});

describe('⛔ S192 SHEETS-4 — loose rubble on an UN-welded tower\'s art does not steal the art\'s click', () => {
  it('a lone free-form shape inside the turret\'s art box: clicking it opens the TURRET (canon §7b "ANYWHERE on the tower")', () => {
    const { w, st } = inBuild(0x5192b);
    const loose = mk(w, SparkType.Square, 454, 254); // put down first, unbonded
    stamp(w, 'laserTurret', { x: 500, y: 300 });
    tick(w, st, 3);
    expect(w.defenders.size).toBe(1);
    const hub = w.primitives.get([...w.defenders.values()][0]!.anchorPrimitiveId)!;
    expect(componentOf(hub, w.primitives, w.bonds).primitiveIds.has(loose.id), 'fixture: not welded').toBe(false);
    const sel = clicker(w)(loose.pos.x, loose.pos.y)!;
    expect(characterSheetModel(w, P0, sel)!.title, 'the tower opens from anywhere on its art').toBe(codexCopyFor('laserTurret').name);
  });

  it('…while a shape WELDED onto that art still opens the structure (R191-A, unchanged)', () => {
    const { w, tri } = welded();
    const sel = clicker(w)(tri.pos.x, tri.pos.y)!;
    expect(sel).toEqual({ kind: 'structure', primitiveId: tri.id });
    expect(characterSheetModel(w, P0, sel)!.title).toBe('WELDED STRUCTURE');
  });
});
