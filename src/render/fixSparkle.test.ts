/**
 * S194 `s194/visuals-6` — **THE FIX-ME SPARKLE (owner R194-22, R194-23), REACHED THROUGH THE REAL HOST TICK.**
 *
 * A stamped laser turret welded to a stamped goblin tower (the S191 fixture shape): cut one of the
 * turret's own arms, run the real matcher + host tick past two polls — the turret FALLS inside the
 * structure. `SpawnerZoneRenderer.sync` (fx live) must then draw the soft sparkle on ITS connectors and a
 * mote row along the cut edge; a real FIX (`applyRepairStructure`) must end it. Negatives: a healthy
 * structure has none; a FOGGED enemy's broken tower is not drawn (R194-23: every viewer sees it, fog
 * still hides it — and an unfogged enemy's IS drawn, which is the ruling).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { makeWorld, dispatch, type World } from '../state/world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from '../state/hostTick.ts';
import { runGodlyMatcherCore } from '../state/godlyMatcherCore.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { componentOf } from '../game/structure.ts';
import { computeStiffnessTier, type Controls } from '../input/controls.ts';
import { AUTO_BOND_RADIUS, MERGE_REACH_RADIUS, REVALIDATE_INTERVAL_TICKS, SparkType } from '../constants.ts';
import { asPlayerId, asSparkId, type BondId, type PrimitiveId, type Vec2 } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { applyRepairStructure, planStructureRepair } from '../state/structureRepair.ts';
import { towerUnitAt } from '../state/towerUnit.ts';
import '../state/godlyRecipes/registerAll.ts';
import { recordingSink } from './fx/emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fx/fxState.ts';
import { SpawnerZoneRenderer } from './spawnerZoneRenderer.ts';
import { brokenTowersOf } from './brokenTowers.ts';
import { __resetTowerCoverForTests, beginTowerCoverFrame } from './towerCover.ts';
import { beginConcealmentFrame, resetConcealmentForTest } from './concealment.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const PAST_TWO_POLLS = 2 * REVALIDATE_INTERVAL_TICKS + 2;
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)), controls: stubControls, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}
function tick(w: World, st: HostTickState, n: number): void {
  const d = deps();
  const cursor = { lastMatcherTick: -1 };
  for (let i = 0; i < n; i++) { runGodlyMatcherCore(w, cursor); runHostTick(w, d, st); w.effects.length = 0; }
}
function stamp(w: World, id: GodlyId, centre: Vec2): void {
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre });
}
let sparkSeq = 9000;
function placeLikeAPlayer(w: World, type: SparkType, at: Vec2): Primitive {
  const spark = makeFreeSpark({ id: asSparkId(sparkSeq++), type, pos: { ...at }, velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: w.tick });
  dispatch(w, { type: 'SPAWN_SPARK', spark });
  const color = w.players.get(P0)!.color;
  let target: Primitive | null = null;
  let best = AUTO_BOND_RADIUS * AUTO_BOND_RADIUS;
  const merge: PrimitiveId[] = [];
  for (const p of w.primitives.values()) {
    if (p.placerColor !== color) continue;
    const d2 = (p.pos.x - at.x) ** 2 + (p.pos.y - at.y) ** 2;
    if (d2 < best) { best = d2; target = p; }
    if (d2 <= MERGE_REACH_RADIUS * MERGE_REACH_RADIUS) merge.push(p.id);
  }
  const before = new Set(w.primitives.keys());
  dispatch(w, {
    type: 'PLACE_FROM_FREE', sparkId: spark.id, playerId: P0, placementPos: { ...at },
    stiffnessTier: computeStiffnessTier(type, target), targetPrimitiveId: target?.id ?? null,
    mergeCandidateIds: merge, extraBondTargetIds: [],
  });
  return [...w.primitives.values()].find((p) => !before.has(p.id))!;
}
function cutBond(w: World, bid: BondId): void {
  const b = w.bonds.get(bid)!;
  w.bonds.delete(bid);
  w.primitives.get(b.aId)?.bonds.delete(bid);
  w.primitives.get(b.bId)?.bonds.delete(bid);
}

/** The S191 fixture: a stamped turret + a stamped goblin tower welded by one Square; returns a far arm. */
function weldedPair(): { w: World; st: HostTickState; turretHub: PrimitiveId; arm: BondId; goblinHub: PrimitiveId; goblinArm: BondId } {
  const w = makeWorld(0x5189);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  const st = makeHostTickState(w);
  stamp(w, 'laserTurret', { x: 500, y: 300 });
  stamp(w, 'goblinTower', { x: 640, y: 300 });
  tick(w, st, 3);
  expect(w.defenders.size, 'fixture: the turret stands').toBe(1);
  const turretHub = [...w.defenders.values()][0]!.anchorPrimitiveId;
  const weld = placeLikeAPlayer(w, SparkType.Square, { x: 570, y: 300 });
  expect(componentOf(w.primitives.get(turretHub)!, w.primitives, w.bonds).primitiveIds.size, 'fixture: welded').toBeGreaterThan(10);
  tick(w, st, PAST_TWO_POLLS);
  const weldNbrs = new Set<PrimitiveId>();
  for (const bid of weld.bonds) { const b = w.bonds.get(bid)!; weldNbrs.add(b.aId === weld.id ? b.bId : b.aId); }
  const hub = w.primitives.get(turretHub)!;
  const arm = [...hub.bonds]
    .map((bid) => { const b = w.bonds.get(bid)!; return { bid, leaf: b.aId === turretHub ? b.bId : b.aId }; })
    .filter((x) => !weldNbrs.has(x.leaf) && x.leaf !== weld.id)
    .sort((x, y) => w.primitives.get(x.leaf)!.pos.x - w.primitives.get(y.leaf)!.pos.x || x.bid - y.bid)[0]!.bid;
  const goblinHub = [...w.creatureSpawners.values()].find((sp) => sp.recipeId === 'goblinTower')!.anchorPrimitiveId;
  const gHub = w.primitives.get(goblinHub)!;
  const goblinArm = [...gHub.bonds]
    .map((bid) => { const b = w.bonds.get(bid)!; return { bid, leaf: b.aId === goblinHub ? b.bId : b.aId }; })
    .filter((x) => !weldNbrs.has(x.leaf) && x.leaf !== weld.id)
    .sort((x, y) => w.primitives.get(y.leaf)!.pos.x - w.primitives.get(x.leaf)!.pos.x || x.bid - y.bid)[0]!.bid;
  return { w, st, turretHub, arm, goblinHub, goblinArm };
}

let top: ReturnType<typeof recordingSink>;
function install(): void { top = recordingSink(); setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } }); }
function draw(w: World, r: SpawnerZoneRenderer): typeof top.out {
  install();
  beginTowerCoverFrame(w);
  r.sync(w);
  return top.out;
}

beforeEach(() => { __resetTowerCoverForTests(); resetConcealmentForTest(); setFxLegacyFlag(false); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); __resetTowerCoverForTests(); resetConcealmentForTest(); });

describe('S194 R194-22 REACH — the fix-me sparkle through the real host tick', () => {
  it('⭐ a welded tower whose recipe breaks sparkles on ITS connectors (and the cut edge) until FIX stands it up', () => {
    const { w, st, turretHub, arm } = weldedPair();
    const r = new SpawnerZoneRenderer({} as never, new Container());
    expect(draw(w, r), 'NEGATIVE — healthy: nothing').toEqual([]);
    expect(brokenTowersOf(w)).toEqual([]);

    const cut = w.bonds.get(arm)!;
    cutBond(w, arm);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the turret fell').toBe(0);
    expect(towerUnitAt(w, turretHub)!.kind).toBe('stamp');
    const broken = brokenTowersOf(w);
    expect(broken).toHaveLength(1);
    expect(broken[0]!.prims).toContain(turretHub);

    const out = draw(w, r);
    expect(out.length).toBeGreaterThan(10);
    // the beads ride the turret's own surviving arms: every white bead lies on a hub→leaf segment
    const hub = w.primitives.get(turretHub)!;
    const beads = out.filter((e) => e.tex === 'core' && e.tint === 0xffffff);
    expect(beads.length, 'one bead per standing connector of the fallen turret').toBeGreaterThan(3);
    for (const b of beads) {
      const onArm = [...hub.bonds].some((bid) => {
        const bd = w.bonds.get(bid)!;
        const o = w.primitives.get(bd.aId === turretHub ? bd.bId : bd.aId)!;
        const cross = Math.abs((o.pos.x - hub.pos.x) * (b.y - hub.pos.y) - (o.pos.y - hub.pos.y) * (b.x - hub.pos.x));
        return cross / Math.hypot(o.pos.x - hub.pos.x, o.pos.y - hub.pos.y) < 1.5;
      });
      expect(onArm, `bead at (${b.x.toFixed(1)},${b.y.toFixed(1)}) on a turret connector`).toBe(true);
    }
    // the cut edge — if both its ends survive — reads as a gap of motes (where FIX re-welds)
    if (w.primitives.has(cut.aId) && w.primitives.has(cut.bId) && broken[0]!.edges.some((e) => e.bond === null)) {
      expect(out.some((e) => e.tex === 'core' && e.tint !== 0xffffff && e.w <= 7)).toBe(true);
    }

    const plan = planStructureRepair(w, P0, turretHub)!;
    const bank = w.castleBanks.get(P0)!;
    for (const t of plan.cost) bank[t as number] = (bank[t as number] ?? 0) + 1;
    applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: turretHub });
    expect(w.defenders.size, 'FIX stood it up').toBe(1);
    tick(w, st, 2);
    expect(brokenTowersOf(w)).toEqual([]);
    expect(draw(w, r), 'fixed: the sparkle is gone').toEqual([]);
  });

  it('⭐ R194-23 — an ENEMY\'s broken tower is shown to you too (unfogged)', () => {
    const { w, st, arm } = weldedPair();
    cutBond(w, arm);
    tick(w, st, PAST_TWO_POLLS);
    w.localPlayerId = P1;
    const r = new SpawnerZoneRenderer({} as never, new Container());
    expect(draw(w, r).length).toBeGreaterThan(10);
  });

  it('⛔ NEGATIVE — a FOGGED enemy\'s broken tower is not drawn', () => {
    const { w, st, arm } = weldedPair();
    cutBond(w, arm);
    tick(w, st, PAST_TWO_POLLS);
    w.localPlayerId = P1;
    beginConcealmentFrame(w, { x: 1800, y: 1000 });
    const r = new SpawnerZoneRenderer({} as never, new Container());
    install();
    beginTowerCoverFrame(w);
    r.sync(w);
    expect(top.out).toEqual([]);
  });

  it('⛔ a shape with NO `origin` field welded into the structure (bare e2e fixtures) never throws out of the render', () => {
    const { w, st, turretHub, arm } = weldedPair();
    cutBond(w, arm);
    tick(w, st, PAST_TWO_POLLS);
    const hub = w.primitives.get(turretHub)!;
    const bare: any = { ...hub, id: 99999, bonds: new Set(), pos: { x: hub.pos.x + 30, y: hub.pos.y + 30 } };
    delete bare.origin;
    w.primitives.set(bare.id, bare);
    const bid = 88888 as BondId;
    w.bonds.set(bid, { id: bid, aId: hub.id, bId: bare.id, a: hub, b: bare, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick } as never);
    hub.bonds.add(bid); bare.bonds.add(bid);
    expect(() => brokenTowersOf(w)).not.toThrow();
    const r = new SpawnerZoneRenderer({} as never, new Container());
    expect(() => draw(w, r)).not.toThrow();
  });

  /*
   * ⭐ S194 re-audit (a) — CONSISTENT ACROSS ALL TOWERS (owner): the FIX gate refuses a DEFENDER outside
   * BUILD (S157 B6, a sim rule), which hid a broken turret's sparkle in FIGHT while a spawner's showed.
   * The render asks "could FIX re-stand it" phase-free.
   */
  for (const kind of ['defender (laser turret)', 'spawner (goblin tower)'] as const) {
    it(`⭐ a broken ${kind} sparkles in BUILD and in FIGHT alike`, () => {
      const { w, st, turretHub, arm, goblinHub, goblinArm } = weldedPair();
      const defender = kind.startsWith('defender');
      cutBond(w, defender ? arm : goblinArm);
      tick(w, st, PAST_TWO_POLLS);
      const hub = defender ? turretHub : goblinHub;
      expect(towerUnitAt(w, hub)!.kind, 'fixture: it fell').toBe('stamp');
      for (const phase of ['BUILD', 'FIGHT'] as const) {
        w.matchPhase = phase;
        const broken = brokenTowersOf(w);
        expect(broken.map((b) => b.prims.includes(hub)), `${phase}: the fallen tower is named`).toContain(true);
        const r = new SpawnerZoneRenderer({} as never, new Container());
        expect(draw(w, r).length, `${phase}: it sparkles`).toBeGreaterThan(8);
      }
    });
  }

  it('⛔ NEGATIVE — `?fx=legacy`: off', () => {
    const { w, st, arm } = weldedPair();
    cutBond(w, arm);
    tick(w, st, PAST_TWO_POLLS);
    setFxLegacyFlag(true);
    const r = new SpawnerZoneRenderer({} as never, new Container());
    expect(draw(w, r)).toEqual([]);
  });
});
