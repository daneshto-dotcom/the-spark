/**
 * SPARK — S193 R191-B / R192-W1 — **FIX IS A GATHERER JOB; THE CASTLE'S FIX ALL QUEUES THEM ALL.**
 *
 * Owner, S191: *"clicking on fix … it actually queues … a gatherer and he has to bring the shape from
 * the castle to the tower that needs fixing. And once he reaches the tower, that fixes [it]
 * automatically"* · *"what are we nearer to? And second of all, does this place even have the shape I
 * need?"* · no shape → keep gathering, fetch when one appears · a repair in flight at FIGHT waits in the
 * castle and lands next BUILD. S192 (R192-W1): *"a button on your castle saying fix all … to first go
 * and fix all the existing towers before … continuing to gather."*
 *
 * Driven for real: a stamped tower ignited by the real matcher, a shape razed through the real damage
 * path, the FIX dispatched as the client intent, and the job carried out by the REAL host tick — no
 * helper calls `tickRepairJobs` directly.
 */
import { describe, expect, it } from 'vitest';
import { PRIMITIVE_MAX_HP, SparkType, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, GATHERER_DEPOSIT_OFFSET_Y } from '../constants.ts';
import { asGathererId, asPlayerId, asSparkId, type PrimitiveId, type Vec2 } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { makeGameStateExtras } from './gameState.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { blueprintBill } from './blueprints.ts';
import { bankCountOf, makeCastleBank } from './castleBank.ts';
import { damageEntity } from './damage.ts';
import { castleAnchor, makeGatherer, type Gatherer } from './gatherers/gatherer.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { planStructureRepair } from './structureRepair.ts';
import { fixAllTargets, REPAIR_JOB_REPLAN_TICKS, REPAIR_JOBS_MAX_PER_SEAT, tickRepairJobs } from './repairJobs.ts';
import { applyRepairStructure } from './structureRepair.ts';
import { structureActionModel } from '../render/structurePanel.ts';
import { castleControlsModel } from '../render/castlePanel.ts';
import { determinismParts, hashWorldStateFull } from './stateHashFull.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { isClientIntentAllowed } from '../net/protocol.ts';
import { isBenchDeniedIntent } from './benchGate.ts';
import { isEliminationDeniedIntent } from './elimination.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import './godlyRecipes/registerAll.ts';

const P0 = asPlayerId(0);
const TURRET_AT: Vec2 = { x: 500, y: 300 };
const GOBLIN_AT: Vec2 = { x: 640, y: 300 };
const FAR = 1_000_000;

/** The quarry yields nothing on its own here, so every spark in it is one a test put there. */
const silentSpawner = { tick() {} };

function deps(): HostTickDeps {
  return {
    spawner: silentSpawner,
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
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
    // ⚠ PRODUCTION ORDER (workerSim.ts / main.ts): the host tick, THEN the matcher, THEN the effect wipe —
    // a FIX restored inside the host tick arms the matcher with its BOND_FORMED in the same frame.
    runHostTick(w, d, st);
    runGodlyMatcherCore(w, cursor);
    w.effects.length = 0;
    w.creatures.clear(); // castle units are not under test; keep the board quiet
  }
}

/** Tick until `done` (or fail after `max` ticks), returning how many ticks it took. */
function tickUntil(w: World, st: HostTickState, done: () => boolean, max = 4000): number {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    tick(w, st, 1);
  }
  throw new Error(`condition not reached in ${max} ticks`);
}

function stamp(w: World, id: GodlyId, centre: Vec2): void {
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre });
}

function hire(w: World, at: Vec2): Gatherer {
  const id = asGathererId(w.nextGathererId++);
  const g = makeGatherer({ id, ownerPlayerId: P0, pos: at, spawnedAtTick: w.tick });
  w.gatherers.set(id, g);
  return g;
}

let sparkSeq = 9000;
function quarrySpark(w: World, type: SparkType, dx = 0): void {
  const id = asSparkId(sparkSeq++);
  w.freeSparks.set(id, makeFreeSpark({
    id, type, pos: { x: SPAWNER_CENTER_X + dx, y: SPAWNER_CENTER_Y }, velocity: { x: 0, y: 0 }, dt: 1, createdTick: w.tick,
  }));
}

const door = (w: World): Vec2 => {
  const c = castleAnchor(0, w.layout);
  return { x: c.x, y: c.y + GATHERER_DEPOSIT_OFFSET_Y };
};

const spirals = (w: World): number => bankCountOf(w.castleBanks, P0, SparkType.Spiral);

/** A stamped laser turret standing; returns its hub and a leaf. The bank is emptied after the stamp. */
function board(opts: { goblin?: boolean } = {}): { w: World; st: HostTickState; hub: PrimitiveId; leaf: PrimitiveId } {
  const w = makeWorld(0x193b);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + FAR;
  w.creatures.clear();
  w.freeSparks.clear();
  w.gatherers.clear();
  const st = makeHostTickState(w);
  stamp(w, 'laserTurret', TURRET_AT);
  if (opts.goblin === true) stamp(w, 'goblinTower', GOBLIN_AT);
  tick(w, st, 3);
  expect(w.defenders.size, 'fixture: the turret ignites').toBe(1);
  w.castleBanks.set(P0, makeCastleBank());
  const d = [...w.defenders.values()][0]!;
  const hub = d.anchorPrimitiveId;
  const leaf = [...d.ownPrimitiveIds!].filter((id) => id !== hub).sort((a, b) => a - b)[0]!;
  return { w, st, hub, leaf };
}

/** Raze one turret leaf (a Spiral) through the real damage path; the poll then removes the turret. */
function breakTurret(w: World, st: HostTickState, leaf: PrimitiveId): void {
  expect(w.primitives.get(leaf)!.type, 'fixture: a turret leaf is a Spiral').toBe(SparkType.Spiral);
  damageEntity(w, { kind: 'primitive', id: leaf }, PRIMITIVE_MAX_HP, 'creature', null);
  tick(w, st, 40);
  expect(w.defenders.size, 'fixture: the broken turret fell').toBe(0);
}

const fix = (w: World, primitiveId: PrimitiveId): void => {
  dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId });
};

describe('⭐⭐ S193 R191-B — FIX queues a gatherer job; the shape is CARRIED to the tower', () => {
  it('the click restores NOTHING on the spot: one job, the bill, the bank untouched', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    hire(w, door(w));
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    const shapesBefore = w.primitives.size;
    fix(w, hub);
    expect(w.repairJobs).toHaveLength(1);
    expect(w.repairJobs[0]!.need).toEqual([SparkType.Spiral]);
    expect(w.primitives.size, 'no re-mint at the click').toBe(shapesBefore);
    expect(spirals(w), 'the bank is debited on PICKUP, not at the click').toBe(1);
    fix(w, hub);
    expect(w.repairJobs, '⛔ one job per tower — a second click is a no-op').toHaveLength(1);
  });

  it('REACH (host tick): a gatherer takes the Spiral from the CASTLE, walks it to the turret, it stands again, and he goes back to gathering', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    fix(w, hub);
    tick(w, st, 1);
    expect(g.repairTask, 'the top priority: the job is his').not.toBeNull();
    expect(g.repairTask!.source, 'the castle holds it and he is standing at it').toBe('bank');
    tickUntil(w, st, () => g.repairTask?.carrying === true);
    expect(spirals(w), 'debited when he picked it up').toBe(0);
    tickUntil(w, st, () => w.repairJobs.length === 0);
    expect(g.repairTask, 'back to gathering').toBeNull();
    tick(w, st, 40);
    expect(w.defenders.size, 'the turret stands again').toBe(1);
    expect(spirals(w), 'it cost exactly the shape it lost').toBe(0);
  });

  it('REACH: an EMPTY castle — he fetches the Spiral from the QUARRY instead, and the spark is gone from the field', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    quarrySpark(w, SparkType.Spiral);
    const sparksBefore = w.freeSparks.size;
    fix(w, hub);
    tick(w, st, 1);
    expect(g.repairTask?.source).toBe('quarry');
    tickUntil(w, st, () => w.repairJobs.length === 0);
    expect(w.freeSparks.size, 'the quarry spark was used').toBe(sparksBefore - 1);
    tick(w, st, 40);
    expect(w.defenders.size).toBe(1);
    expect(spirals(w), 'the bank was never touched').toBe(0);
  });

  it('⛔ NO SOURCE: the job waits and the gatherer keeps gathering; the moment a Spiral appears he fetches it', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    quarrySpark(w, SparkType.Square); // something else to gather
    fix(w, hub);
    tick(w, st, 30);
    expect(g.repairTask, 'nothing can supply a Spiral').toBeNull();
    expect(g.state === 'HAULING' || g.targetSparkId !== null || g.carriedSparkId !== null, 'he is gathering the Square').toBe(true);
    expect(w.repairJobs[0]!.need).toEqual([SparkType.Spiral]);
    tickUntil(w, st, () => g.state === 'SEEKING' && g.carriedSparkId === null && g.targetSparkId === null);
    quarrySpark(w, SparkType.Spiral, 30);
    tick(w, st, 1);
    expect(g.repairTask?.type, 'fetched as soon as one appears').toBe(SparkType.Spiral);
    tickUntil(w, st, () => w.repairJobs.length === 0);
    tick(w, st, 40);
    expect(w.defenders.size).toBe(1);
  });

  it('"what are we nearer to?" — standing at the castle he takes the bank\'s; standing in the quarry he takes the field\'s', () => {
    for (const where of ['castle', 'quarry'] as const) {
      const { w, st, hub, leaf } = board();
      breakTurret(w, st, leaf);
      w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
      quarrySpark(w, SparkType.Spiral);
      const g = hire(w, where === 'castle' ? door(w) : { x: SPAWNER_CENTER_X + 5, y: SPAWNER_CENTER_Y });
      fix(w, hub);
      tick(w, st, 1);
      expect(g.repairTask?.source, where).toBe(where === 'castle' ? 'bank' : 'quarry');
    }
  });

  it('⛔ a task holder is OFF the haul cycle: walking a FIX shape, he never claims a quarry spark', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    quarrySpark(w, SparkType.Square); // bait for the haul cycle
    fix(w, hub);
    tick(w, st, 1);
    expect(g.repairTask).not.toBeNull();
    let seen = 0;
    while (g.repairTask !== null && seen < 2000) {
      tick(w, st, 1);
      seen++;
      if (g.repairTask === null) break; // delivered this tick — and free to gather again at once
      expect(g.targetSparkId, `tick ${seen}: no haul target while on the job`).toBeNull();
      expect(g.carriedSparkId, `tick ${seen}: no haul cargo while on the job`).toBeNull();
    }
    expect(seen).toBeGreaterThan(1);
  });

  it('N shapes = N tasks: a two-shape bill is split across two gatherers at once', () => {
    const { w, st, hub, leaf } = board();
    const d = [...w.defenders.values()][0]!;
    const leaf2 = [...d.ownPrimitiveIds!].filter((id) => id !== hub && id !== leaf).sort((a, b) => a - b)[0]!;
    damageEntity(w, { kind: 'primitive', id: leaf2 }, PRIMITIVE_MAX_HP, 'creature', null);
    breakTurret(w, st, leaf);
    const a = hire(w, door(w));
    const b = hire(w, door(w));
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 2;
    fix(w, hub);
    expect(w.repairJobs[0]!.need).toEqual([SparkType.Spiral, SparkType.Spiral]);
    tick(w, st, 1);
    expect(a.repairTask?.type).toBe(SparkType.Spiral);
    expect(b.repairTask?.type, 'the second shape went to the second gatherer').toBe(SparkType.Spiral);
    tickUntil(w, st, () => w.repairJobs.length === 0);
    tick(w, st, 40);
    expect(w.defenders.size).toBe(1);
    expect(spirals(w)).toBe(0);
  });

  it('⛔ R19 — no FIX outside BUILD: the intent is refused in FIGHT', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    hire(w, door(w));
    w.matchPhase = 'FIGHT';
    fix(w, hub);
    dispatch(w, { type: 'FIX_ALL', playerId: P0 });
    expect(w.repairJobs).toHaveLength(0);
  });

  it('⚠ MINE — a seat with no gatherer cannot queue a FIX (nobody could ever carry it)', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    fix(w, hub);
    expect(w.repairJobs).toHaveLength(0);
  });

  it('a repair IN HAND at the shelter stays in hand through the FIGHT and lands at the next BUILD; one NOT yet picked up is reopened', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    fix(w, hub);
    tickUntil(w, st, () => g.repairTask?.carrying === true);
    // The shelter fires 1 s before the bell.
    w.phaseEndsAtTick = w.tick + 30;
    tickUntil(w, st, () => w.matchPhase === 'FIGHT', 200);
    expect(g.state).toBe('SHELTERED');
    expect(g.repairTask?.carrying, 'he waits in the castle WITH the shape').toBe(true);
    expect(w.repairJobs[0]!.delivered, 'nothing lands during the FIGHT').toEqual([]);
    tick(w, st, 60);
    expect(w.defenders.size, 'still broken in the FIGHT').toBe(0);
    w.phaseEndsAtTick = w.tick + 1;
    tickUntil(w, st, () => w.matchPhase === 'BUILD', 200);
    w.phaseEndsAtTick = w.tick + FAR;
    tickUntil(w, st, () => w.repairJobs.length === 0);
    tick(w, st, 40);
    expect(w.defenders.size, 'it landed in the next BUILD').toBe(1);

    // And the other half: a task NOT yet picked up when the doors close is open again, never lost.
    const b = board();
    breakTurret(b.w, b.st, b.leaf);
    const far = hire(b.w, { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y });
    b.w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    fix(b.w, b.hub);
    tick(b.w, b.st, 1);
    expect(far.repairTask?.carrying).toBe(false);
    b.w.phaseEndsAtTick = b.w.tick + 30;
    tickUntil(b.w, b.st, () => b.w.matchPhase === 'FIGHT', 200);
    expect(far.repairTask, 'empty-handed: the task is dropped').toBeNull();
    expect(b.w.repairJobs[0]!.need, 'and its shape is open again').toEqual([SparkType.Spiral]);
    expect(spirals(b.w), 'the bank was never debited').toBe(1);
  });

  it('⛔ CANCEL refunds everything: SCRAP the tower with a shape in hand → the shape goes back to the bank', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    fix(w, hub);
    tickUntil(w, st, () => g.repairTask?.carrying === true);
    expect(spirals(w)).toBe(0);
    const standing = [...planStructureRepair(w, P0, hub)!.memberIds].filter((id) => w.primitives.get(id)!.type === SparkType.Spiral).length;
    dispatch(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: hub });
    expect(spirals(w), 'fixture: SCRAP refunded the standing Spirals').toBe(standing);
    tick(w, st, 1);
    expect(w.repairJobs).toHaveLength(0);
    expect(g.repairTask).toBeNull();
    expect(spirals(w), 'and the cancel brought the one in hand home — exactly one more').toBe(standing + 1);
  });

  it('the bill is RE-PLANNED on arrival: a tower that lost another shape on the way grows its bill, never fixes short', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    fix(w, hub);
    tickUntil(w, st, () => g.repairTask?.carrying === true);
    const d = planStructureRepair(w, P0, hub)!;
    const another = d.memberIds.find((id) => id !== hub && w.primitives.get(id)?.type === SparkType.Spiral)!;
    damageEntity(w, { kind: 'primitive', id: another }, PRIMITIVE_MAX_HP, 'creature', null);
    tickUntil(w, st, () => g.repairTask === null);
    tick(w, st, 1);
    expect(w.repairJobs, 'still open: one Spiral delivered, two lost').toHaveLength(1);
    expect(w.repairJobs[0]!.delivered).toEqual([SparkType.Spiral]);
    expect(w.repairJobs[0]!.need.length + (g.repairTask === null ? 0 : 1)).toBe(1);
  });
});

describe('⭐⭐ S193 R192-W1 — FIX ALL: every tower, nearest the castle first, then back to gathering', () => {
  it('queues one job per damaged tower in (squared distance from the castle, then lowest shape id) order', () => {
    const { w, st, hub, leaf } = board({ goblin: true });
    const goblin = [...w.creatureSpawners.values()][0]!;
    const goblinLeaf = [...goblin.ownPrimitiveIds!].filter((id) => id !== goblin.anchorPrimitiveId)[0]!;
    damageEntity(w, { kind: 'primitive', id: goblinLeaf }, 20, 'creature', null); // a dent: one shape flat (R182-E)
    breakTurret(w, st, leaf);
    hire(w, door(w));
    const targets = fixAllTargets(w, P0);
    expect(targets).toHaveLength(2);
    const castle = castleAnchor(0, w.layout);
    const d2 = (id: PrimitiveId) => {
      const p = w.primitives.get(id)!.pos;
      return (p.x - castle.x) ** 2 + (p.y - castle.y) ** 2;
    };
    const expected = [
      { hub, d: d2(hub) },
      { hub: goblin.anchorPrimitiveId, d: d2(goblin.anchorPrimitiveId) },
    ].sort((a, b) => a.d - b.d).map((x) => x.hub);
    dispatch(w, { type: 'FIX_ALL', playerId: P0 });
    expect(w.repairJobs).toHaveLength(2);
    const firstHub = (j: (typeof w.repairJobs)[number]) => (j.memberIds.includes(hub) ? hub : goblin.anchorPrimitiveId);
    expect(w.repairJobs.map(firstHub), 'nearest the castle first').toEqual(expected);
    dispatch(w, { type: 'FIX_ALL', playerId: P0 });
    expect(w.repairJobs, '⛔ a second FIX ALL queues nothing new — one job per tower').toHaveLength(2);
  });

  it('REACH: FIX ALL fixes every tower, then the gatherers go back to gathering', () => {
    const { w, st, leaf } = board({ goblin: true });
    const goblin = [...w.creatureSpawners.values()][0]!;
    const goblinLeaf = [...goblin.ownPrimitiveIds!].filter((id) => id !== goblin.anchorPrimitiveId)[0]!;
    damageEntity(w, { kind: 'primitive', id: goblinLeaf }, 20, 'creature', null);
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    const bank = w.castleBanks.get(P0)!;
    bank[SparkType.Spiral as number] = 1;
    bank[SparkType.Circle as number] = 1;
    bank[SparkType.Square as number] = 1;
    bank[SparkType.Triangle as number] = 1;
    bank[SparkType.Dot as number] = 1;
    bank[SparkType.Line as number] = 1;
    dispatch(w, { type: 'FIX_ALL', playerId: P0 });
    tickUntil(w, st, () => w.repairJobs.length === 0, 8000);
    tick(w, st, 40);
    expect(w.defenders.size, 'the turret stands').toBe(1);
    expect(planStructureRepair(w, P0, goblin.anchorPrimitiveId)!.damagedCount, 'the goblin tower is healed').toBe(0);
    expect(g.repairTask, 'and he is gathering again').toBeNull();
    quarrySpark(w, SparkType.Square);
    tick(w, st, 2);
    expect(g.targetSparkId !== null || g.carriedSparkId !== null, 'he went for the quarry').toBe(true);
  });

  it('a welded structure: FIX ALL queues per TOWER (R191-A) — the dented turret alone, never the weld', () => {
    const { w, st, hub, leaf } = board({ goblin: true });
    void leaf; void st;
    // Weld the two towers with a hand-placed Square between them.
    const turret = [...w.defenders.values()][0]!;
    const goblin = [...w.creatureSpawners.values()][0]!;
    const near = (ids: readonly PrimitiveId[], x: number) =>
      [...ids].sort((a, b) => Math.abs(w.primitives.get(a)!.pos.x - x) - Math.abs(w.primitives.get(b)!.pos.x - x))[0]!;
    const sq = w.primitives.get(near(turret.ownPrimitiveIds!, 570))!;
    const gq = w.primitives.get(near(goblin.ownPrimitiveIds!, 570))!;
    const id = w.nextPrimitiveId++ as PrimitiveId;
    w.primitives.set(id, { ...sq, id, type: SparkType.Square, pos: { x: 570, y: 300 }, prevPos: { x: 570, y: 300 }, bonds: new Set(), origin: null, hp: PRIMITIVE_MAX_HP });
    for (const other of [sq, gq]) {
      const bid = w.nextBondId++ as never;
      const weld = w.primitives.get(id)!;
      w.bonds.set(bid, { id: bid, aId: weld.id, bId: other.id, a: weld, b: other, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick });
      weld.bonds.add(bid);
      other.bonds.add(bid);
    }
    const own = [...turret.ownPrimitiveIds!].filter((x) => x !== hub)[1]!;
    damageEntity(w, { kind: 'primitive', id: own }, 20, 'creature', null);
    hire(w, door(w));
    dispatch(w, { type: 'FIX_ALL', playerId: P0 });
    expect(w.repairJobs).toHaveLength(1);
    expect(w.repairJobs[0]!.memberIds, 'the turret\'s own shapes').toEqual([...turret.ownPrimitiveIds!].sort((a, b) => a - b));
    expect(w.repairJobs[0]!.memberIds).not.toContain(id);
  });

  it('⚠ MINE — the queue is bounded per seat', () => {
    expect(REPAIR_JOBS_MAX_PER_SEAT).toBe(32);
  });
});

describe('⭐ S193 — the wire and the gates', () => {
  it('FIX_ALL is a client intent; benched and fallen seats are denied it, like REPAIR_STRUCTURE', () => {
    expect(isClientIntentAllowed('FIX_ALL')).toBe(true);
    expect(isBenchDeniedIntent('FIX_ALL')).toBe(true);
    expect(isEliminationDeniedIntent('FIX_ALL')).toBe(true);
  });

  it('FOUR SITES — the job, the task and the counter round-trip the disk save AND the wire snapshot, and a restored host finishes the job', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    fix(w, hub);
    tickUntil(w, st, () => g.repairTask?.carrying === true);
    expect(w.nextRepairJobId).toBe(1);
    for (const via of ['disk', 'wire'] as const) {
      const copy = makeWorld(0x193b);
      if (via === 'disk') restore(snapshot(w), copy);
      else applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(w))), copy);
      expect(copy.repairJobs, via).toEqual(w.repairJobs);
      expect(copy.nextRepairJobId, via).toBe(w.nextRepairJobId);
      expect([...copy.gatherers.values()][0]!.repairTask, via).toEqual(g.repairTask);
      const rj = (x: World) => determinismParts(x).filter((p) => p.startsWith('rj') || p.startsWith('ga'));
      expect(rj(copy), `${via}: the job and gatherer parts hash identically`).toEqual(rj(w));
    }
    // A successor that inherited the save carries on: the shape in hand lands and the turret stands.
    const heir = makeWorld(0x193b);
    restore(snapshot(w), heir);
    const st2 = makeHostTickState(heir);
    tickUntil(heir, st2, () => heir.repairJobs.length === 0);
    tick(heir, st2, 40);
    expect(heir.defenders.size, 'the heir finished the job').toBe(1);
  });

  it('DETERMINISM — two identical runs through queue, fetch, carry and restore hash equal on every frame', () => {
    const run = () => {
      const b = board({ goblin: true });
      breakTurret(b.w, b.st, b.leaf);
      hire(b.w, door(b.w));
      hire(b.w, { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y });
      b.w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
      quarrySpark(b.w, SparkType.Spiral, 10);
      dispatch(b.w, { type: 'FIX_ALL', playerId: P0 });
      return b;
    };
    sparkSeq = 20000;
    const a = run();
    sparkSeq = 20000;
    const b = run();
    for (let i = 0; i < 600; i++) {
      tick(a.w, a.st, 1);
      tick(b.w, b.st, 1);
      expect(hashWorldStateFull(b.w), `frame ${i}`).toBe(hashWorldStateFull(a.w));
    }
    expect(a.w.repairJobs).toHaveLength(0);
  });

  it('the wide hash sees every part of a job and a task', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    fix(w, hub);
    const h0 = hashWorldStateFull(w);
    w.repairJobs[0]!.need.push(SparkType.Dot);
    const h1 = hashWorldStateFull(w);
    expect(h1).not.toBe(h0);
    w.repairJobs[0]!.delivered.push(SparkType.Dot);
    const h2 = hashWorldStateFull(w);
    expect(h2).not.toBe(h1);
    g.repairTask = { jobId: 0, type: SparkType.Dot, source: 'bank', sparkId: null, carrying: false };
    const h3 = hashWorldStateFull(w);
    expect(h3).not.toBe(h2);
    g.repairTask.carrying = true;
    expect(hashWorldStateFull(w)).not.toBe(h3);
    w.nextRepairJobId += 1;
    expect(hashWorldStateFull(w)).not.toBe(h3);
  });
});

describe('⛔ S193 audit fix round — the LOWs', () => {
  it('an ELIMINATED seat’s jobs end, and everything they held goes back to the bank', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    const g = hire(w, door(w));
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    fix(w, hub);
    tickUntil(w, st, () => g.repairTask?.carrying === true);
    expect(spirals(w)).toBe(0);
    w.players.get(P0)!.castleHp = 0; // R127: the castle fell — the seat is out
    // ⚠ The pass itself, not the host tick: in a 1v1 the fall ENDS the match and the teardown would clear
    // the queue for its own reason, which is not what this pins (a 3+ seat match goes on without him).
    tickRepairJobs(w);
    expect(w.repairJobs, 'the job ended').toHaveLength(0);
    expect(g.repairTask).toBeNull();
    expect(spirals(w), 'the shape in hand came home').toBe(1);
  });

  it('negative: a LIVING seat’s job is not cancelled by the same pass', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    hire(w, door(w));
    fix(w, hub);
    tick(w, st, 3 * REPAIR_JOB_REPLAN_TICKS);
    expect(w.repairJobs, 'no source, still waiting — never dropped').toHaveLength(1);
  });

  it('QUEUE FULL — at the bound the card FIX and the FIX ALL row say so and stay disabled; one under, they act', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    hire(w, door(w));
    const filler = (n: number) => {
      w.repairJobs = [];
      for (let i = 0; i < n; i++) {
        w.repairJobs.push({ id: 100 + i, seat: P0, targetId: (90_000 + i) as PrimitiveId, memberIds: [(90_000 + i) as PrimitiveId], need: [SparkType.Dot], delivered: [] });
      }
    };
    filler(REPAIR_JOBS_MAX_PER_SEAT);
    const card = structureActionModel(w, P0, hub)!.buttons.find((b) => b.kind === 'FIX')!;
    expect(card).toMatchObject({ enabled: false, caption: 'QUEUE FULL' });
    expect(castleControlsModel(w).find((r) => r.key === 'fixAll')).toMatchObject({ enabled: false, reason: 'QUEUE FULL' });
    fix(w, hub);
    expect(w.repairJobs, 'the reducer refuses too').toHaveLength(REPAIR_JOBS_MAX_PER_SEAT);
    filler(REPAIR_JOBS_MAX_PER_SEAT - 1);
    expect(structureActionModel(w, P0, hub)!.buttons.find((b) => b.kind === 'FIX')!.enabled).toBe(true);
    expect(castleControlsModel(w).find((r) => r.key === 'fixAll')!.enabled).toBe(true);
  });

  it('fixAllTargets: a WHOLE tower is neither queued nor allowed to block a damaged one', () => {
    const { w, st, leaf } = board({ goblin: true });
    breakTurret(w, st, leaf);
    const goblin = [...w.creatureSpawners.values()][0]!;
    hire(w, door(w));
    const targets = fixAllTargets(w, P0);
    expect(targets, 'only the broken turret').toHaveLength(1);
    expect(targets[0]!.plan.memberIds).not.toContain(goblin.anchorPrimitiveId);
  });

  it('the re-plan is PHASE-SPREAD: a waiting job whose tower stopped needing a FIX is dropped within REPLAN_TICKS, on its own phase', () => {
    const { w, st, hub, leaf } = board();
    breakTurret(w, st, leaf);
    hire(w, door(w));
    fix(w, hub);
    const job = w.repairJobs[0]!;
    // Repaired some other way (an instant restore): the job has nothing left to do.
    w.castleBanks.get(P0)![SparkType.Spiral as number] = 1;
    applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: hub });
    let n = 0;
    while (w.repairJobs.length > 0 && n < 4 * REPAIR_JOB_REPLAN_TICKS) { tick(w, st, 1); n++; }
    expect(w.repairJobs, 'dropped').toHaveLength(0);
    expect(n, 'within one re-plan period').toBeLessThanOrEqual(REPAIR_JOB_REPLAN_TICKS);
    // And on its own phase: the pass that dropped it ran on a tick with (tick + id) % N === 0.
    expect((w.tick + job.id) % REPAIR_JOB_REPLAN_TICKS, 'the dropping pass ran on its phase (the host tick advances `tick` before the pass)').toBe(0);
  });

  it('⚠ MINE — the re-plan period is a quarter second', () => {
    expect(REPAIR_JOB_REPLAN_TICKS).toBe(15);
  });
});
