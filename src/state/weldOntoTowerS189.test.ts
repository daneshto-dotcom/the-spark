/**
 * SPARK — S189 C2 — **WELDING ONTO A TOWER MUST NOT DISSOLVE IT.**
 *
 * Owner, S189 playtest: *"If you connect shapes … to existing towers, like to a laser tower, my
 * brother connected like two triangles … it got his tower disappeared … that's like a regression …
 * we changed it that you can connect towers together … to get them have more HP … as long as the
 * existing tower, the shape is there … it still has a pentagram, but you can connect to it."*
 *
 * ⛔ DRIVEN THROUGH THE REAL PLACEMENT PIPELINE AND THE REAL HOST TICK. The weld is a real
 * `PLACE_FROM_FREE` with the target / merge / redundancy fields computed exactly as `controls.ts`
 * computes them (the pickers are private methods, mirrored from `pentagramBuildability.test.ts`),
 * and the teardown is the real throttled revalidation poll in `runHostTick`. A predicate that is
 * correct but never reached is the shape of this repo's last several defects.
 */
import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { makeGameStateExtras } from './gameState.ts';
import { mulberry32 } from './rng.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { componentOf } from '../game/structure.ts';
import { pickRedundantBondTargets } from '../input/redundantBondTargets.ts';
import { computeStiffnessTier } from '../input/controls.ts';
import type { Controls } from '../input/controls.ts';
import {
  AUTO_BOND_RADIUS,
  MERGE_REACH_RADIUS,
  PRIMITIVE_MAX_HP,
  REDUNDANT_BOND_ANGLE_EPSILON,
  REDUNDANT_BOND_K,
  REDUNDANT_BOND_MAX_CANDIDATES,
  REDUNDANT_BOND_MIN_ANGLE_RAD,
  REVALIDATE_INTERVAL_TICKS,
  SparkType,
} from '../constants.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  asSparkId,
  type BondId,
  type PrimitiveId,
  type Vec2,
} from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { TURRET_HUB_DEGREE, isLaserTurretComponent } from './godlyRecipes/laserTurret.ts';
import { HELGA_SIZE, isHelgaComponent } from './godlyRecipes/princessHelga.ts';
import { STINK_HUB_TYPE, STINK_LEAF_TYPE, isStinkTowerComponent } from './godlyRecipes/stinkTower.ts';
import { isLightningHubComponent } from './godlyRecipes/lightningHub.ts';
import { isPentagramComponent } from './godlyRecipes/pentagram.ts';
import { isGoblinTowerComponent } from './goblinKinds.ts';
import { GOBLIN_TOWER_HUB_DEGREE, LIGHTNING_HUB_DEGREE, STINK_TOWER_HUB_DEGREE } from '../constants.ts';
import { starArmsAt } from './godlyRecipes/starShape.ts';
import { towerFootprintAt, towerMembersAt, towerShapeFor, towerStandsAt } from './towerMembers.ts';
import { readFileSync } from 'node:fs';
import { starBankedFifths, starPoolFifths } from './structureStarHealth.ts';
import { structurePoolFifths } from './stats.ts';
import { rampHealthFrac, rampMembersAt, rampSpecFor, rampTargetFrame } from '../render/structureRamp.ts';
import {
  TOWER_COVER_DRAW_EPSILON,
  TOWER_COVER_FADE_TICKS,
  __resetTowerCoverForTests,
  beginTowerCoverFrame,
  coverAlphaForBond,
  coverAlphaForPrim,
  markTowerCover,
} from '../render/towerCover.ts';
import { planStructureRepair, planStructureScrap } from './structureRepair.ts';
import { structureTowersAt, towerUnitAt, weldedAt } from './towerUnit.ts';
import { razePrimitives } from './razePrimitives.ts';
import { damageEntity } from './damage.ts';
import { nearestEnemySpawnerBond } from '../bots/botBrain.ts';
import { collectSpawnerLockedPrimitiveIds } from './placePrimitive.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { blueprintBill } from './blueprints.ts';
import { makeCastleBank } from './castleBank.ts';
import { makeCreature } from './creatures/creature.ts';
import { makeDefender } from './defenders/defender.ts';
import { CHEWER_CONFIG } from './creatures/voltkin-config.ts';
import { asCreatureId, asDefenderId, asSpawnerId } from '../types.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import { ALL_RACES, RACE_FEED_SHAPE } from './races.ts';
import { RACE_TOWER_IDS, RACE_TOWER_SIZE, RACE_TOWER_UNIT } from './raceTowerIds.ts';
import { T9_BOSS_TYPE, T9_TOWER_IDS, T9_TOWER_SIZE } from './t9BossIds.ts';
import { isRingAt } from './godlyRecipes/ringShape.ts';
import { repairFeeShapeFor } from './structureRepair.ts';
import { towerArtForRecipe, towerRingCentroid } from '../render/towerFrames.ts';
import { characterSheetModel } from '../render/characterSheetModel.ts';
import { codexCopyFor } from '../render/codexPresentation.ts';
import { makeWorkerCinematicState, tickWorkerCinematics } from './godlyMatcherCore.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls, type WorkerTickBatchMsg } from './workerSim.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
// Side-effect imports: the defender recipes register themselves, exactly as `main.ts` imports them.
import './godlyRecipes/registerAll.ts';

const P0 = asPlayerId(0);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** A 1v1 match in BUILD — the phase a player welds in. */
function worldInBuild(seed = 0x5189): World {
  const w = makeWorld(seed);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  return w;
}

function mk(w: World, type: SparkType, x: number, y: number, seat = P0): Primitive {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type, placerColor: player.color, placedBy: seat, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

function bond(w: World, a: Primitive, b: Primitive): BondId {
  const bid = asBondId(w.nextBondId++);
  w.bonds.set(bid, {
    id: bid, aId: a.id, bId: b.id, a, b,
    restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(bid);
  b.bonds.add(bid);
  return bid;
}

/** Hand-built star: a hub and `n` leaves on a ring of radius `r`. Pushes the ignition trigger. */
function star(
  w: World, hubType: SparkType, leafType: SparkType, n: number, cx: number, cy: number, r = 40,
  seat = P0,
): { hub: Primitive; leaves: Primitive[] } {
  const hub = mk(w, hubType, cx, cy, seat);
  const leaves: Primitive[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const leaf = mk(w, leafType, cx + Math.cos(a) * r, cy + Math.sin(a) * r, seat);
    bond(w, hub, leaf);
    leaves.push(leaf);
  }
  w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: cx, y: cy }, bondCount: n });
  return { hub, leaves };
}

// ─── MIRROR of the controls.ts pickers (private methods — mirrored, not imported) ─────────────

function pickPrimitiveInRange(w: World, radius: number, c: Vec2, color: number): PrimitiveId | null {
  let best: Primitive | null = null;
  let bestD2 = radius * radius;
  for (const p of w.primitives.values()) {
    if (p.placerColor !== color) continue;
    const d2 = (p.pos.x - c.x) ** 2 + (p.pos.y - c.y) ** 2;
    if (d2 < bestD2) { best = p; bestD2 = d2; }
  }
  return best?.id ?? null;
}

function allPrimitivesInRange(w: World, radius: number, c: Vec2, color: number): PrimitiveId[] {
  const out: PrimitiveId[] = [];
  for (const p of w.primitives.values()) {
    if (p.placerColor !== color) continue;
    if ((p.pos.x - c.x) ** 2 + (p.pos.y - c.y) ** 2 <= radius * radius) out.push(p.id);
  }
  return out;
}

function redundantTargets(w: World, primary: Primitive, at: Vec2): PrimitiveId[] {
  if (REDUNDANT_BOND_K <= 1) return [];
  const comp = componentOf(primary, w.primitives, w.bonds);
  if (comp.primitiveIds.size <= 1) return [];
  return pickRedundantBondTargets({
    primary: { id: primary.id, pos: primary.pos },
    componentIds: comp.primitiveIds,
    primitives: w.primitives,
    newPrimPos: at,
    radius: AUTO_BOND_RADIUS,
    k: REDUNDANT_BOND_K,
    minAngleRad: REDUNDANT_BOND_MIN_ANGLE_RAD,
    angleEpsilon: REDUNDANT_BOND_ANGLE_EPSILON,
    maxCandidates: REDUNDANT_BOND_MAX_CANDIDATES,
  });
}

let sparkSeq = 9000;
/** ONE real player drop: a Free spark of `type` placed at `at`, fields exactly as `controls.ts`. */
function placeLikeAPlayer(w: World, type: SparkType, at: Vec2, seat = P0): Primitive {
  const spark = makeFreeSpark({
    id: asSparkId(sparkSeq++), type, pos: { x: at.x, y: at.y }, velocity: { x: 0, y: 0 },
    dt: 1 / 60, createdTick: w.tick,
  });
  dispatch(w, { type: 'SPAWN_SPARK', spark });
  const color = w.players.get(seat)!.color;
  const targetId = pickPrimitiveInRange(w, AUTO_BOND_RADIUS, at, color);
  const target = targetId !== null ? w.primitives.get(targetId) ?? null : null;
  const before = new Set(w.primitives.keys());
  dispatch(w, {
    type: 'PLACE_FROM_FREE',
    sparkId: spark.id,
    playerId: seat,
    placementPos: { x: at.x, y: at.y },
    stiffnessTier: computeStiffnessTier(type, target),
    targetPrimitiveId: target?.id ?? null,
    mergeCandidateIds: allPrimitivesInRange(w, MERGE_REACH_RADIUS, at, color),
    extraBondTargetIds: target !== null ? redundantTargets(w, target, at) : [],
  });
  const placed = [...w.primitives.values()].find((p) => !before.has(p.id));
  expect(placed, `the ${SparkType[type]} drop at (${at.x},${at.y}) must actually place`).toBeDefined();
  return placed!;
}

/** Matcher + host tick, `n` times, against one persistent tick state. */
function tick(w: World, st: HostTickState, n: number): void {
  const d = deps();
  const cursor = { lastMatcherTick: -1 };
  for (let i = 0; i < n; i++) {
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    /*
     * ⚠ FIX ROUND — clear the frame's effects, as the real frame loop does (the worker differential's
     * reference rig: `world.effects.length = 0`). Without it a fixture's one BOND_FORMED stayed in
     * `world.effects` forever, so ignition ran on EVERY tick — which made a levelled turret re-ignite
     * in the same BUILD from its surviving shapes and hid what a cut actually does.
     */
    w.effects.length = 0;
  }
}

/** Neighbour ids of `p`, ascending. */
function neighbours(w: World, p: Primitive): PrimitiveId[] {
  const out: PrimitiveId[] = [];
  for (const bid of p.bonds) {
    const b = w.bonds.get(bid);
    if (b !== undefined) out.push(b.aId === p.id ? b.bId : b.aId);
  }
  return out.sort((a, b) => a - b);
}

// Two revalidation windows: long enough that EVERY defender / spawner slot has been polled at least
// once after the weld, whatever phase its id put it in.
const PAST_TWO_POLLS = 2 * REVALIDATE_INTERVAL_TICKS + 2;

describe('⛔ S189 C2 — two triangles welded onto a LASER TURRET (the owner\'s report)', () => {
  it('the reproduction — the weld reaches the HUB through the real placement path', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const { hub } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    tick(w, st, 2);
    expect(w.defenders.size, 'the fixture must ignite a turret').toBe(1);

    // Dropped onto the tower art — i.e. right beside the hub, because the art straddles it.
    const t1 = placeLikeAPlayer(w, SparkType.Triangle, { x: 520, y: 318 });
    const t2 = placeLikeAPlayer(w, SparkType.Triangle, { x: 480, y: 282 });
    // The measurement that makes this a regression rather than a corner case: a drop on the tower
    // bonds to the HUB, because it is the nearest shape and redundancy adds the rest of the star.
    expect(neighbours(w, t1)).toContain(hub.id);
    expect(neighbours(w, t2)).toContain(hub.id);
    expect(hub.bonds.size).toBeGreaterThan(TURRET_HUB_DEGREE);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the turret must still stand after the weld').toBe(1);
  });

  it("the BROTHER's exact path — a JOINER's drop, target re-picked by the HOST — and it stands", () => {
    // He was the joiner: `applyPlaceFromFree` ignores a remote seat's target and re-picks it on the
    // host (`pickHostTargetPrimitive`). A defender is not in the S107 P4 spawner lock, so the host
    // re-pick lands on the turret's hub exactly as the local path does.
    const w = worldInBuild();
    const st = makeHostTickState(w);
    expect(w.localPlayerId, 'the fixture must make seat 1 a REMOTE seat').not.toBe(P1);
    const p1 = w.players.get(P1)!;
    w.players.set(P1, { ...p1, avatarPos: { x: 1400, y: 300 } });
    const { hub } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 1400, 300, 40, P1);
    tick(w, st, 2);
    expect([...w.defenders.values()].map((d) => d.ownerPlayerId)).toEqual([P1]);

    const t1 = placeLikeAPlayer(w, SparkType.Triangle, { x: 1420, y: 318 }, P1);
    const t2 = placeLikeAPlayer(w, SparkType.Triangle, { x: 1380, y: 282 }, P1);
    expect(neighbours(w, t1)).toContain(hub.id);
    expect(neighbours(w, t2)).toContain(hub.id);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, "the joiner's welded turret must still stand").toBe(1);
  });
});

/** Hand-built closed ring of `n` shapes of `type`, radius `r`. Pushes the ignition trigger. */
function ring(w: World, type: SparkType, n: number, cx: number, cy: number, r = 42.5): Primitive[] {
  const nodes: Primitive[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    nodes.push(mk(w, type, cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  for (let i = 0; i < n; i++) bond(w, nodes[i]!, nodes[(i + 1) % n]!);
  w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: cx, y: cy }, bondCount: n });
  return nodes;
}

describe('⛔ S189 C2 — "it still has a pentagram, but you can connect to it"', () => {
  it('a PENTAGRAM with one extra triangle welded on keeps its spawner', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    expect([...w.creatureSpawners.values()].map((s) => s.recipeId)).toEqual(['pentagram']);

    // Outside the ring, beside node 0 — the top vertex.
    const t = placeLikeAPlayer(w, SparkType.Triangle, { x: 500, y: 300 - 42.5 - 30 });
    expect(neighbours(w, t)).toContain(nodes[0]!.id);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'the pentagram must still stand after the weld').toBe(1);
  });

  it('a PENTAGRAM with a foreign-type shape (a Circle) welded on keeps its spawner', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    expect(w.creatureSpawners.size).toBe(1);
    const c = placeLikeAPlayer(w, SparkType.Circle, { x: 500, y: 300 - 42.5 - 30 });
    expect(neighbours(w, c)).toContain(nodes[0]!.id);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'the pentagram must still stand after the weld').toBe(1);
  });
});

describe('⛔ S189 C2 — HELGA\'s hall is on the whole-component test too', () => {
  it('a shape welded onto one of her LEAVES does not tear her hall down', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    // Triangle hub, 3 Spiral + 3 Circle leaves, alternating round the ring.
    const hub = mk(w, SparkType.Triangle, 500, 300);
    const leaves: Primitive[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = mk(w, i % 2 === 0 ? SparkType.Spiral : SparkType.Circle,
        500 + Math.cos(a) * 40, 300 + Math.sin(a) * 40);
      bond(w, hub, leaf);
      leaves.push(leaf);
    }
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 500, y: 300 }, bondCount: 6 });
    tick(w, st, 2);
    expect([...w.defenders.values()].map((d) => d.kind)).toEqual(['princess']);

    // Far enough out that only leaf 0 (at angle 0, x=540) is in reach — never the hub.
    const s = placeLikeAPlayer(w, SparkType.Square, { x: 540 + 45, y: 300 });
    expect(neighbours(w, s)).toContain(leaves[0]!.id);
    expect(neighbours(w, s)).not.toContain(hub.id);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'Helga\'s hall must still stand after the weld').toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE OWED TESTS — every one through the real placement path and the real host tick unless it is
// labelled ARITHMETIC.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const P1 = asPlayerId(1);
const byId = (a: PrimitiveId, b: PrimitiveId): number => a - b;

/** The owner's case, built once: a live laser turret with two triangles dropped on its art. */
function weldedTurret(): {
  w: World; st: HostTickState; hub: Primitive; leaves: Primitive[]; welds: Primitive[];
} {
  const w = worldInBuild();
  const st = makeHostTickState(w);
  const { hub, leaves } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
  tick(w, st, 2);
  const welds = [
    placeLikeAPlayer(w, SparkType.Triangle, { x: 520, y: 318 }),
    placeLikeAPlayer(w, SparkType.Triangle, { x: 480, y: 282 }),
  ];
  tick(w, st, PAST_TWO_POLLS);
  expect(w.defenders.size, 'the welded turret must be standing for this case to mean anything').toBe(1);
  return { w, st, hub, leaves, welds };
}

/** Every bond that joins `a` to one of `others`. */
function bondsBetween(w: World, a: Primitive, others: readonly Primitive[]): BondId[] {
  const set = new Set(others.map((p) => p.id));
  const out: BondId[] = [];
  for (const bid of a.bonds) {
    const b = w.bonds.get(bid)!;
    if (set.has(b.aId === a.id ? b.bId : b.aId)) out.push(bid);
  }
  return out;
}

describe('⭐ S189 C2 — the welded turret STAYS, FIRES and KEEPS ITS SPRITE', () => {
  it('keeps its sprite: the ramp walks its six OWN arms, the welds are not members', () => {
    const { w, hub, leaves, welds } = weldedTurret();
    const spec = rampSpecFor('laserTurret')!;
    const at = rampMembersAt(w, hub.id, spec);
    expect(at, 'the renderer must still find a building to draw').not.toBeNull();
    expect([...at!.members].sort(byId)).toEqual([hub.id, ...leaves.map((l) => l.id)].sort(byId));
    for (const t of welds) expect(at!.members).not.toContain(t.id);
    expect(at!.bonds).toHaveLength(TURRET_HUB_DEGREE);
    for (const t of welds) for (const bid of t.bonds) expect(at!.bonds).not.toContain(bid);

    // The sprite stands on the star's OWN centroid — the welds do not drag it sideways.
    const own = [hub.id, ...leaves.map((l) => l.id)].map((id) => w.primitives.get(id)!);
    expect(at!.cx).toBeCloseTo(own.reduce((s, p) => s + p.pos.x, 0) / own.length, 9);
    expect(at!.cy).toBeCloseTo(own.reduce((s, p) => s + p.pos.y, 0) / own.length, 9);

    // Undamaged: frame 1 — NOT the crumble a "missing connector" reading would give.
    const frac = rampHealthFrac(at!.bonds.length, at!.bankedFifths, spec);
    expect(frac).toBe(1);
    expect(rampTargetFrame(frac, spec)).toBe(1);
  });

  it('FIRES: in the next FIGHT its beam kills an enemy chewer', () => {
    const { w, st } = weldedTurret();
    w.matchPhase = 'FIGHT';
    const chewer = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P1,
      pos: { x: 560, y: 300 }, targetPos: { x: 560, y: 300 }, spawnedAtTick: w.tick,
      sourceSpawnerId: asSpawnerId(99),
    });
    w.creatures.set(chewer.id, chewer);
    const d = [...w.defenders.values()][0]!;
    d.nextFireTick = w.tick; // skip the opening charge
    let fired = false;
    const d0 = deps();
    const cursor = { lastMatcherTick: -1 };
    for (let i = 0; i < 90 && w.creatures.has(chewer.id); i++) {
      runGodlyMatcherCore(w, cursor);
      runHostTick(w, d0, st);
      if (w.defenders.get(d.id)?.state === 'FIRE') fired = true;
    }
    expect(fired, 'the welded turret must actually reach FIRE').toBe(true);
    expect(w.creatures.has(chewer.id), 'and its beam must kill the chewer').toBe(false);
    expect(w.defenders.size).toBe(1);
  });
});

describe('⭐ S189 C2 — a welded PENTAGRAM is drawn on its own five', () => {
  it('the weld is not a member; the ring is priced over its own five connectors', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    const t = placeLikeAPlayer(w, SparkType.Triangle, { x: 500, y: 300 - 42.5 - 30 });
    tick(w, st, PAST_TWO_POLLS);
    const sp = [...w.creatureSpawners.values()][0]!;
    const at = rampMembersAt(w, sp.anchorPrimitiveId, rampSpecFor('pentagram')!)!;
    expect([...at.members].sort(byId)).toEqual(nodes.map((n) => n.id).sort(byId));
    expect(at.members).not.toContain(t.id);
    expect(at.bonds).toHaveLength(5);
    expect(rampHealthFrac(at.bonds.length, at.bankedFifths, rampSpecFor('pentagram')!)).toBe(1);
  });
});

describe('⭐ S189 C2 item 1 — a JOINER can weld onto a live SPAWNER (the S107 P4 lock, narrowed)', () => {
  it('the host re-pick now lands on a goblin tower, and the tower stands', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const p1 = w.players.get(P1)!;
    w.players.set(P1, { ...p1, avatarPos: { x: 1400, y: 300 } });
    const goblin = star(w, SparkType.Circle, SparkType.Circle, GOBLIN_TOWER_HUB_DEGREE, 1400, 300, 40, P1);
    tick(w, st, 2);
    expect([...w.creatureSpawners.values()].map((sp) => sp.recipeId)).toEqual(['goblinTower']);
    expect(collectSpawnerLockedPrimitiveIds(w).size, 'a contains-survival spawner is not locked').toBe(0);

    const sq = placeLikeAPlayer(w, SparkType.Square, { x: 1420, y: 318 }, P1);
    expect(neighbours(w, sq), "the joiner's drop bonds onto the goblin hub").toContain(goblin.hub.id);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'and the welded goblin tower stands').toBe(1);
  });
});

describe('⭐⭐ S189 C2 / Council M3 — TWO TOWERS WELDED TOGETHER: BOTH survive (R185-B)', () => {
  it('a laser turret and a goblin tower welded by one square both stand', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const turret = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    const goblin = star(w, SparkType.Circle, SparkType.Circle, GOBLIN_TOWER_HUB_DEGREE, 620, 300);
    tick(w, st, 3);
    expect(w.defenders.size).toBe(1);
    expect([...w.creatureSpawners.values()].map((s) => s.recipeId)).toEqual(['goblinTower']);

    /*
     * ⭐ S189 C2 item 1 — THE DROP IS AIMED AT THE TURRET, and the merge sweep reaches the GOBLIN
     * TOWER, a live SPAWNER. Before the S107 P4 lock was narrowed this was the direction that welded
     * NOTHING: the sweep refused any live spawner's component. Now only a tower a weld would kill is
     * locked, so the square joins both.
     */
    const sq = placeLikeAPlayer(w, SparkType.Square, { x: 556, y: 300 });
    expect(neighbours(w, sq)).toContain(turret.leaves[0]!.id);
    const comp = componentOf(turret.hub, w.primitives, w.bonds);
    expect(comp.primitiveIds.has(goblin.hub.id), 'the square must weld the two into ONE structure').toBe(true);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the turret stands').toBe(1);
    expect(w.creatureSpawners.size, 'and so does the goblin tower').toBe(1);
  });

  it('two pentagrams welded by a TRIANGLE — their own type — both stand', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const a = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    const b = ring(w, SparkType.Triangle, 5, 620, 300);
    tick(w, st, 2);
    expect(w.creatureSpawners.size).toBe(2);

    /*
     * ⭐ S189 C2 item 1 — ONE REAL DROP WELDS BOTH RINGS. Before the S107 P4 lock was narrowed, the
     * merge sweep refused ring B (a second live spawner) and this weld could only be minted by hand.
     */
    const t = placeLikeAPlayer(w, SparkType.Triangle, { x: 560, y: 286.9 });
    const nd = neighbours(w, t);
    expect(nd.some((id) => a.some((p) => p.id === id)), 'the drop reaches ring A').toBe(true);
    expect(nd.some((id) => b.some((p) => p.id === id)), 'and merges into ring B').toBe(true);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'both pentagrams stand').toBe(2);
    for (const sp of w.creatureSpawners.values()) {
      const own = towerMembersAt(w, 'pentagram', sp.anchorPrimitiveId)!;
      expect(own.whole).toBe(true);
      expect(own.prims).not.toContain(t.id);
    }
  });
});

describe('⛔ S189 C2 — cutting the tower\'s OWN connector still levels it (the counterplay survives)', () => {
  it('an enemy cutting one own arm of the welded turret levels it within the poll', () => {
    const { w, st, hub, leaves } = weldedTurret();
    const arm = bondsBetween(w, hub, [leaves[0]!])[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: arm, playerId: P1, cause: 'creature' });
    expect(w.bonds.has(arm)).toBe(false);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'a broken star is a dead tower, welds or not').toBe(0);
  });

  it('…while cutting a WELD leaves it standing', () => {
    const { w, st, hub, welds } = weldedTurret();
    const weldBond = bondsBetween(w, hub, welds)[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: weldBond, playerId: P1, cause: 'creature' });
    expect(w.bonds.has(weldBond)).toBe(false);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size).toBe(1);
  });

  it('a pentagram whose own ring is cut falls, welded or not', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    placeLikeAPlayer(w, SparkType.Circle, { x: 500, y: 300 - 42.5 - 30 });
    const own = bondsBetween(w, nodes[2]!, [nodes[3]!])[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: own, playerId: P1, cause: 'creature' });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size).toBe(0);
  });
});

describe('⭐ S189 C2 — R185-A: the welded shapes draw at FULL opacity under the sprite', () => {
  it('own shapes fade out; the two welded triangles and their connectors stay at alpha 1', () => {
    __resetTowerCoverForTests();
    try {
      const { w, hub, leaves, welds } = weldedTurret();
      const spec = rampSpecFor('laserTurret')!;
      const at = (t: number): World => ({ ...w, tick: t }) as World;
      const t0 = w.tick;
      // Three render frames: publish, publish again once the fade has run, then read.
      for (const t of [t0, t0 + TOWER_COVER_FADE_TICKS + 5]) {
        beginTowerCoverFrame(at(t));
        const m = rampMembersAt(w, hub.id, spec)!;
        markTowerCover(m.members, m.bonds, m.newestTick);
      }
      beginTowerCoverFrame(at(t0 + TOWER_COVER_FADE_TICKS + 6));

      for (const p of [hub, ...leaves]) {
        expect(coverAlphaForPrim(p.id), `own shape ${p.id} is hidden`).toBeLessThan(TOWER_COVER_DRAW_EPSILON);
      }
      for (const t of welds) {
        expect(coverAlphaForPrim(t.id), `welded triangle ${t.id}`).toBe(1);
        for (const bid of t.bonds) expect(coverAlphaForBond(bid), `weld connector ${bid}`).toBe(1);
      }
    } finally {
      __resetTowerCoverForTests();
    }
  });
});

/*
 * ⭐ S191 R191-A — R185-B AMENDED, SO THIS IS RE-PINNED, NOT DELETED. It asserted "one weld makes the
 * whole structure unrepairable". The owner's S191 ruling keeps that for the welded STRUCTURE (a click on
 * the weld) and gives each TOWER in it its own FIX (a click on the tower): *"you can only … fix the tower
 * that's a part of the shape … when you clicking on a welded structure you can't fix it."*
 */
describe('⭐ S189 C2 / S191 R191-A — welding costs STRUCTURE repair; each tower keeps its own FIX', () => {
  it('a dented welded turret: FIX from the WELD is refused, FIX from the TOWER repairs only the tower', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const bank = makeCastleBank();
    for (const [type, count] of blueprintBill('laserTurret')) bank[type as number] = (bank[type as number] ?? 0) + count;
    bank[SparkType.Spiral as number] = (bank[SparkType.Spiral as number] ?? 0) + 1; // the R182-E flat fee
    w.castleBanks.set(P0, bank);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'laserTurret', centre: { x: 500, y: 300 } });
    tick(w, st, 3);
    expect(w.defenders.size, 'the stamp must ignite').toBe(1);
    const hubId = [...w.defenders.values()][0]!.anchorPrimitiveId;
    const hub = w.primitives.get(hubId)!;
    const arm = [...hub.bonds].sort((x, y) => x - y)[0]!;
    w.bonds.get(arm)!.damageFifths = 10;

    expect(planStructureRepair(w, P0, hubId), 'the control: un-welded, a dent is repairable').not.toBeNull();

    const t = placeLikeAPlayer(w, SparkType.Triangle, { x: 520, y: 318 });
    expect(neighbours(w, t)).toContain(hubId);
    const weldBond = [...t.bonds].sort((x, y) => x - y)[0]!;
    w.bonds.get(weldBond)!.damageFifths = 7;
    // R5 — the WELD's card: no FIX, and the reducer refuses.
    expect(planStructureRepair(w, P0, t.id), 'welded structure: no FIX').toBeNull();
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: t.id });
    expect(w.bonds.get(arm)!.damageFifths, 'the reducer refuses too').toBe(10);
    // R4 — the TOWER's card: its own FIX, priced by what IT lost (a dent = the R182-E flat fee).
    const plan = planStructureRepair(w, P0, hubId)!;
    expect(plan.scope).toBe('tower');
    expect(plan.cost).toEqual([repairFeeShapeFor('laserTurret')]);
    expect(plan.memberIds).not.toContain(t.id);
    const defenderId = [...w.defenders.keys()][0]!;
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: hubId });
    expect(w.bonds.get(arm)!.damageFifths, 'its own arm is healed').toBe(0);
    expect(w.bonds.get(weldBond)!.damageFifths, 'the weld is not the tower — untouched').toBe(7);

    tick(w, st, PAST_TWO_POLLS);
    expect([...w.defenders.keys()], 'the SAME turret stands').toEqual([defenderId]);
  });
});

describe('ARITHMETIC — the survival shape, derived from the blueprint', () => {
  it('each recipe\'s survival shape is exactly its recipe\'s own numbers', () => {
    const starOf = (id: GodlyId): { hub: SparkType; arms: Record<number, number> } => {
      const s = towerShapeFor(id);
      if (s === null || s.kind !== 'star') throw new Error(`${id} is not a star`);
      return { hub: s.hub, arms: Object.fromEntries(s.arms.map((a) => [a.leafType, a.count])) };
    };
    expect(starOf('laserTurret')).toEqual({ hub: SparkType.Line, arms: { [SparkType.Spiral]: TURRET_HUB_DEGREE } });
    expect(starOf('lightningHub')).toEqual({ hub: SparkType.Dot, arms: { [SparkType.Circle]: LIGHTNING_HUB_DEGREE } });
    expect(starOf('goblinTower')).toEqual({ hub: SparkType.Circle, arms: { [SparkType.Circle]: GOBLIN_TOWER_HUB_DEGREE } });
    expect(starOf('stinkTower')).toEqual({ hub: STINK_HUB_TYPE, arms: { [STINK_LEAF_TYPE]: STINK_TOWER_HUB_DEGREE } });
    const helgaLeaves = HELGA_SIZE - 1;
    expect(starOf('helga')).toEqual({
      hub: SparkType.Triangle,
      arms: { [SparkType.Spiral]: helgaLeaves / 2, [SparkType.Circle]: helgaLeaves / 2 },
    });
    expect(towerShapeFor('pentagram')).toEqual({ kind: 'ring', type: SparkType.Triangle, n: 5 });
    // S189 C2 item 2 — RE-PINNED: this asserted `null` while the race rings were left on R136. They
    // are rings of their race's own shape now. The Voltkin is a cinematic, not a standing tower.
    for (const race of ALL_RACES) {
      expect(towerShapeFor(RACE_TOWER_IDS[race]), race).toEqual({ kind: 'ring', type: RACE_FEED_SHAPE[race], n: RACE_TOWER_SIZE });
      expect(towerShapeFor(T9_TOWER_IDS[race]), race).toEqual({ kind: 'ring', type: RACE_FEED_SHAPE[race], n: T9_TOWER_SIZE });
    }
    expect(towerShapeFor('voltkin')).toBeNull();
  });

  const STRICT: Readonly<Record<string, (w: World, a: PrimitiveId) => boolean>> = {
    laserTurret: isLaserTurretComponent,
    lightningHub: isLightningHubComponent,
    goblinTower: isGoblinTowerComponent,
    stinkTower: isStinkTowerComponent,
    helga: isHelgaComponent,
    pentagram: isPentagramComponent,
  };
  it.each(Object.keys(STRICT))('%s — IGNITION ⊆ SURVIVAL: a freshly stamped tower stands', (id) => {
    // A tower that ignites and then fails its own survival test would build and die in 0.5 s.
    const w = worldInBuild();
    const bank = makeCastleBank();
    for (const [type, count] of blueprintBill(id as GodlyId)) bank[type as number] = (bank[type as number] ?? 0) + count;
    w.castleBanks.set(P0, bank);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id as GodlyId, centre: { x: 500, y: 300 } });
    const ids = [...w.primitives.keys()].sort(byId);
    expect(ids.length).toBeGreaterThan(0);
    const anchor = ids.find((a) => STRICT[id]!(w, a));
    expect(anchor, `the stamp satisfies ${id}'s ignition test`).toBeDefined();
    expect(towerStandsAt(w, id as GodlyId, anchor!)).toBe(true);
  });

  /*
   * ⛔ AUDIT W1 — RE-PINNED. This test used to pin the SPARE rule ("lose an original arm and the spare
   * stands in"), a mechanic nobody ruled. Identity is fixed at registration now: the arms a star was
   * BUILT with are the hub bonds to the leaves in its `ownPrimitiveIds` (S191 — shapes, not the retired
   * bond-id watermark), and a weld — even of the arm type — is never one of them.
   */
  it('starArmsAt counts only the arms the star was BUILT with; a same-type weld never stands in', () => {
    const w = worldInBuild();
    const { hub, leaves } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    const own = new Set([hub.id, ...leaves.map((l) => l.id)]); // what registration would record
    const spare = mk(w, SparkType.Spiral, 530, 330);
    const spareBond = bond(w, hub, spare); // minted AFTER the build: a weld
    const spec = [{ leafType: SparkType.Spiral, count: TURRET_HUB_DEGREE }];
    const armsNow = starArmsAt(w, hub.id, SparkType.Line, spec, own)!;
    expect(armsNow.whole).toBe(true);
    expect(armsNow.leaves).not.toContain(spare.id);
    expect(armsNow.bonds).not.toContain(spareBond);

    // Lose one of the arms it was built with: it is NOT whole, the spare notwithstanding.
    const lost = bondsBetween(w, hub, [leaves[0]!])[0]!;
    w.bonds.delete(lost);
    hub.bonds.delete(lost);
    leaves[0]!.bonds.delete(lost);
    const armsAfter = starArmsAt(w, hub.id, SparkType.Line, spec, own)!;
    expect(armsAfter.whole, 'a cut own arm levels it — a same-type weld never stands in').toBe(false);
    expect(armsAfter.leaves).not.toContain(spare.id);
    expect(armsAfter.bonds).toHaveLength(TURRET_HUB_DEGREE - 1);

    // ⭐ S191 (W-FR4) — and the SAME arm re-welded (FIX mints a NEW bond id) counts again: it is a bond
    // between two own shapes, whatever its id.
    const rewelded = bond(w, hub, leaves[0]!);
    expect(Number(rewelded)).toBeGreaterThan(Number(spareBond));
    const armsFixed = starArmsAt(w, hub.id, SparkType.Line, spec, own)!;
    expect(armsFixed.whole, 'a re-welded own arm is own again — a watermark could not see it').toBe(true);
    expect(armsFixed.bonds).toContain(rewelded);
    expect(armsFixed.leaves).not.toContain(spare.id);

    // With NO own set (not a live tower / a pre-S189 save): the exact reading — a 7th arm is not a star.
    const w2 = worldInBuild();
    const s2 = star(w2, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    bond(w2, s2.hub, mk(w2, SparkType.Spiral, 530, 330));
    expect(starArmsAt(w2, s2.hub.id, SparkType.Line, spec)!.whole).toBe(false);
  });

  it('starArmsAt is a TOTAL ORDER — insertion order into `hub.bonds` never decides', () => {
    const w = worldInBuild();
    const { hub } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    const spare = mk(w, SparkType.Spiral, 530, 330);
    bond(w, hub, spare);
    const spec = [{ leafType: SparkType.Spiral, count: TURRET_HUB_DEGREE }];
    const forward = starArmsAt(w, hub.id, SparkType.Line, spec)!;
    hub.bonds = new Set([...hub.bonds].reverse());
    const reversed = starArmsAt(w, hub.id, SparkType.Line, spec)!;
    expect(reversed.bonds).toEqual(forward.bonds);
    expect(reversed.leaves).not.toContain(spare.id);
  });

  it('R182-B on a hub-welded lightning hub: the pool is its OWN five (50), and weld damage is not its', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const { hub } = star(w, SparkType.Dot, SparkType.Circle, LIGHTNING_HUB_DEGREE, 500, 300);
    tick(w, st, 2);
    expect([...w.creatureSpawners.values()].map((s) => s.recipeId)).toEqual(['lightningHub']);
    const t = mk(w, SparkType.Triangle, 520, 318);
    const weldBond = bond(w, hub, t);
    w.bonds.get(weldBond)!.damageFifths = 30;
    expect(hub.bonds.size).toBe(LIGHTNING_HUB_DEGREE + 1);
    expect(starPoolFifths(w, hub.id)).toBe(structurePoolFifths(LIGHTNING_HUB_DEGREE));
    expect(starPoolFifths(w, hub.id)).toBe(50);
    expect(starBankedFifths(w, hub.id)).toBe(0);
  });

  /*
   * ⛔ AUDIT W1 / W7 — RE-PINNED. This asserted that a chord weld's second 5-cycle kept a cut
   * pentagram standing (the spare RING) via an uncapped cycle search. The ring is walked over the
   * connectors it was built with now — an O(n) exact walk — so a bypass never stands in.
   */
  it('the ring is walked over the connectors it was BUILT with; a chord-weld bypass never stands in', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    const sp = [...w.creatureSpawners.values()][0]!;
    expect(sp.ownPrimitiveIds, 'registration records the five shapes').toEqual(nodes.map((n) => n.id).sort(byId));
    // X bonded to nodes 0 and 2 makes 0-X-2-3-4-0 a second simple 5-cycle through node 0.
    const x = mk(w, SparkType.Triangle, 520, 290);
    bond(w, x, nodes[0]!);
    bond(w, x, nodes[2]!);
    const own = towerMembersAt(w, 'pentagram', sp.anchorPrimitiveId)!;
    expect(own.whole).toBe(true);
    expect([...own.prims].sort(byId)).toEqual(nodes.map((n) => n.id).sort(byId));
    const cut = bondsBetween(w, nodes[0]!, [nodes[1]!])[0]!;
    w.bonds.delete(cut);
    nodes[0]!.bonds.delete(cut);
    nodes[1]!.bonds.delete(cut);
    expect(towerMembersAt(w, 'pentagram', sp.anchorPrimitiveId)!.whole, 'the bypass does not save it').toBe(false);
  });
});

describe('⛔ NEGATIVE — IGNITION IS UNCHANGED: exact to build, contains only to survive', () => {
  it('a star welded BEFORE it is complete does not ignite (hysteresis, by design)', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const { hub } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    bond(w, hub, mk(w, SparkType.Triangle, 520, 318)); // a triangle on the hub before ignition
    tick(w, st, PAST_TWO_POLLS);
    expect(isLaserTurretComponent(w, hub.id)).toBe(false);
    expect(w.defenders.size, 'a hub of degree 7 is not a laser turret to BUILD').toBe(0);
  });

  it('a Circle hub with FIVE Circle arms is still no goblin tower', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    star(w, SparkType.Circle, SparkType.Circle, GOBLIN_TOWER_HUB_DEGREE + 1, 500, 300);
    tick(w, st, 3);
    expect(w.creatureSpawners.size).toBe(0);
  });
});

describe('⭐ S189 C2 — HOST vs WORKER: the welded towers are judged identically across a BUILD→FIGHT→BUILD cycle', () => {
  /*
   * The survival rule is now a walk (`towerMembersAt`) that sorts bond ids and searches cycles in
   * ascending id. Both the host and the `?worker=1` sim run it, and the worker adopts the world
   * through the JSON save — so if the walk leaned on `Set` order anywhere, the two sims would keep
   * or drop a welded tower on different ticks. This runs both, lockstep, over a full phase cycle,
   * and compares the WIDE hash every frame.
   */
  it('wide hash byte-equal every frame; both welded towers alive on both sides at the end', () => {
    const w = makeWorld(0x51890001);
    w.gameState = 'TITLE';
    dispatch(w, { type: 'START_GAME', mode: 'solo', isHost: true });
    w.matchPhase = 'BUILD';
    w.creatures.clear();
    const setup = makeHostTickState(w);
    const turret = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    tick(w, setup, 2);
    const penta = ring(w, SparkType.Triangle, 5, 500, 620);
    tick(w, setup, 2);
    expect(w.defenders.size).toBe(1);
    expect(w.creatureSpawners.size).toBe(1);
    placeLikeAPlayer(w, SparkType.Triangle, { x: 520, y: 318 });
    placeLikeAPlayer(w, SparkType.Triangle, { x: 480, y: 282 });
    placeLikeAPlayer(w, SparkType.Circle, { x: 500, y: 620 - 42.5 - 30 });
    // ⭐ S189 C2 item 2 — and a race tower welded with its OWN shape (the owner's bat-tower case).
    const race0 = w.players.get(P0)!.raceId;
    ring(w, RACE_FEED_SHAPE[race0], RACE_TOWER_SIZE, 760, 300, 34);
    tick(w, setup, 2);
    expect([...w.creatureSpawners.values()].map((sp) => sp.recipeId)).toContain(RACE_TOWER_IDS[race0]);
    placeLikeAPlayer(w, RACE_FEED_SHAPE[race0], { x: 760, y: 300 + 34 + 12 });
    expect(turret.hub.bonds.size, 'the turret hub carries welds').toBeGreaterThan(TURRET_HUB_DEGREE);
    expect(componentOf(penta[0]!, w.primitives, w.bonds).primitiveIds.size).toBeGreaterThan(5);
    w.phaseEndsAtTick = w.tick + 200; // cross BUILD→FIGHT inside the compared window
    w.effects.length = 0;
    /*
     * ⚠ `Bond.stiffnessMultiplier` is a PER-TICK transient: `territory.ts` resets it to 1.0 on every
     * bond each tick and it is deliberately not serialized, so a world that has already ticked holds
     * `1` where a freshly adopted one holds `undefined` — measured as the ONLY INIT difference here
     * (the hand-built bonds; the just-placed ones have not ticked yet either). Both sims rewrite it on
     * their next tick, so it is cleared before the fork rather than papered over in the comparison.
     */
    for (const b of w.bonds.values()) delete (b as { stiffnessMultiplier?: number }).stiffnessMultiplier;

    // ── the REFERENCE (direct host path) and the BATCH (worker INIT + applyTickBatch) ──
    const mkSpawner = (): Spawner => new Spawner(
      DEFAULT_SPAWNER_CONFIG, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5),
    );
    const refSpawner = mkSpawner();
    const saveJson = JSON.stringify(snapshot(w, { spawnerState: mkSpawner().getState() }));
    const sim = makeWorkerSim({
      type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0,
      ratePerSecond: DEFAULT_SPAWNER_CONFIG.ratePerSecond,
    });
    expect(hashWorldStateFull(sim.world), 'INIT adoption is bit-exact').toBe(hashWorldStateFull(w));

    const controls = new WorkerControls(w, P0);
    const refState = makeHostTickState(w);
    const refCursor = { lastMatcherTick: -1 };
    const cinematics = makeWorkerCinematicState();
    const extras = makeGameStateExtras();
    const refFrame = (batch: Omit<WorkerTickBatchMsg, 'type' | 'batchSeq'>): void => {
      for (const a of batch.intents) dispatch(w, a);
      controls.setFrame(batch.control);
      const d: HostTickDeps = {
        spawner: refSpawner, controls, botManager: null, gameStateExtras: extras,
        alivePeerIds: null, hostSeats: new Map(),
      };
      for (let i = 0; i < batch.ticks; i++) runHostTick(w, d, refState);
      if (w.gameState === 'PLAYING') runGodlyMatcherCore(w, refCursor);
      tickWorkerCinematics(w, cinematics);
      w.effects.length = 0;
    };

    const phaseOf = (x: World): World['matchPhase'] => x.matchPhase;
    let seq = 0;
    let secondEdge = false;
    let sawFight = false;
    for (let f = 0; f < 300; f++) {
      const batch = {
        ticks: 1 + (f % 3),
        control: { state: { kind: 'Idle' } as const, cursor: { x: 700, y: 400 } },
        alivePeerIds: null,
        intents: [],
        nowMs: f * 16,
      };
      // Read through a call: the setup assigned 'BUILD', and tsc would otherwise narrow the field.
      const inFight = phaseOf(w) === 'FIGHT';
      if (inFight) sawFight = true;
      if (!secondEdge && inFight) {
        w.phaseEndsAtTick = w.tick + 60;
        sim.world.phaseEndsAtTick = sim.world.tick + 60;
        secondEdge = true;
      }
      refFrame(batch);
      applyTickBatch(sim, { type: 'TICK_BATCH', batchSeq: ++seq, ...batch }, { forceSnapshot: true });
      const a = hashWorldStateFull(w);
      const b = hashWorldStateFull(sim.world);
      if (a !== b) throw new Error(`host and worker DIVERGED at frame ${f} (tick ${w.tick})`);
    }
    expect(sawFight, 'the run must cross into FIGHT').toBe(true);
    expect(w.matchPhase, 'and back into BUILD — a full cycle').toBe('BUILD');
    expect(sim.world.matchPhase).toBe('BUILD');
    for (const world of [w, sim.world]) {
      expect(world.defenders.size, 'the welded turret stands on both sides').toBe(1);
      expect([...world.creatureSpawners.values()].map((sp) => sp.recipeId), 'and the welded pentagram')
        .toContain('pentagram');
      expect([...world.creatureSpawners.values()].map((sp) => sp.recipeId), 'and the welded race tower')
        .toContain(RACE_TOWER_IDS[race0]);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S189 C2 item 2 — THE RACE RINGS: exact to build, contains-its-ring to survive.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** The seat's own race, read from the live player (R137: a race tower is its owner's race only). */
function raceOf(w: World, seat: typeof P0): (typeof ALL_RACES)[number] {
  const r = w.players.get(seat)?.raceId;
  if (r === undefined) throw new Error('the fixture seat has no race');
  return r;
}

/** Stamp a blueprint for `seat` through the real reducer (origin set, so FIX applies). */
function stamp(w: World, id: GodlyId, centre: Vec2, seat = P0): void {
  const bank = w.castleBanks.get(seat) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(seat, bank);
  const before = w.primitives.size;
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: id, centre });
  expect(w.primitives.size, `the ${id} stamp at (${centre.x},${centre.y}) must land`).toBeGreaterThan(before);
}

describe('⭐⭐ S189 C2 item 2 — a tier-3 race tower SURVIVES a weld of its OWN shape', () => {
  it('a race tower with its own shape welded on stands — and no second tower ignites', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const race = raceOf(w, P0);
    const type = RACE_FEED_SHAPE[race];
    const nodes = ring(w, type, RACE_TOWER_SIZE, 500, 300, 34);
    tick(w, st, 2);
    expect([...w.creatureSpawners.values()].map((sp) => sp.recipeId)).toEqual([RACE_TOWER_IDS[race]]);

    // Outside the ring, below it — a same-type drop bonds onto the ring.
    const weld = placeLikeAPlayer(w, type, { x: 500, y: 300 + 34 + 12 });
    expect(neighbours(w, weld).some((id) => nodes.some((n) => n.id === id)), 'the weld is on the ring').toBe(true);
    const anchor = [...w.creatureSpawners.values()][0]!.anchorPrimitiveId;
    expect(isRingAt(w, anchor, type, RACE_TOWER_SIZE), 'R136 exact would have DISSOLVED it').toBe(false);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'it stands, and the weld ignites no second tower').toBe(1);
    const own = towerMembersAt(w, RACE_TOWER_IDS[race], anchor)!;
    expect([...own.prims].sort(byId)).toEqual(nodes.map((n) => n.id).sort(byId));
    expect(own.prims).not.toContain(weld.id);
  });

  it('⛔ …and with one of its OWN ring connectors cut it falls', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const race = raceOf(w, P0);
    const nodes = ring(w, RACE_FEED_SHAPE[race], RACE_TOWER_SIZE, 500, 300, 34);
    tick(w, st, 2);
    placeLikeAPlayer(w, RACE_FEED_SHAPE[race], { x: 500, y: 300 + 34 + 12 });
    const own = bondsBetween(w, nodes[0]!, [nodes[1]!])[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: own, playerId: P1, cause: 'creature' });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size).toBe(0);
  });

  it('the building is still DRAWN on its own ring (the exact walk returned null, i.e. no sprite)', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const race = raceOf(w, P0);
    const nodes = ring(w, RACE_FEED_SHAPE[race], RACE_TOWER_SIZE, 500, 300, 34);
    tick(w, st, 2);
    placeLikeAPlayer(w, RACE_FEED_SHAPE[race], { x: 500, y: 300 + 34 + 12 });
    tick(w, st, PAST_TWO_POLLS);
    const anchor = [...w.creatureSpawners.values()][0]!.anchorPrimitiveId;
    const c = towerRingCentroid(w, anchor, towerArtForRecipe(RACE_TOWER_IDS[race])!);
    expect(c, 'a standing tower must have a centroid to draw at').not.toBeNull();
    const own = nodes.map((n) => w.primitives.get(n.id)!);
    expect(c!.x).toBeCloseTo(own.reduce((sum, p) => sum + p.pos.x, 0) / own.length, 9);
    expect(c!.y).toBeCloseTo(own.reduce((sum, p) => sum + p.pos.y, 0) / own.length, 9);
  });

  it('a JOINER can weld onto their own live race tower (the S107 P4 lock is now empty)', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const p1 = w.players.get(P1)!;
    w.players.set(P1, { ...p1, avatarPos: { x: 1400, y: 300 } });
    const race = raceOf(w, P1);
    const nodes: Primitive[] = [];
    for (let i = 0; i < RACE_TOWER_SIZE; i++) {
      const a = -Math.PI / 2 + (i / RACE_TOWER_SIZE) * Math.PI * 2;
      nodes.push(mk(w, RACE_FEED_SHAPE[race], 1400 + Math.cos(a) * 34, 300 + Math.sin(a) * 34, P1));
    }
    for (let i = 0; i < RACE_TOWER_SIZE; i++) bond(w, nodes[i]!, nodes[(i + 1) % RACE_TOWER_SIZE]!);
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 1400, y: 300 }, bondCount: RACE_TOWER_SIZE });
    tick(w, st, 2);
    expect([...w.creatureSpawners.values()].map((sp) => sp.recipeId)).toEqual([RACE_TOWER_IDS[race]]);
    expect(collectSpawnerLockedPrimitiveIds(w).size, 'no shipped spawner is locked any more').toBe(0);
    const weld = placeLikeAPlayer(w, RACE_FEED_SHAPE[race], { x: 1400, y: 300 + 34 + 12 }, P1);
    expect(neighbours(w, weld).some((id) => nodes.some((n) => n.id === id))).toBe(true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size).toBe(1);
  });
});

describe("⭐⭐⭐ S189 C2 — THE OWNER'S OWN CASE: two bat towers welded through several connectors (R185-B)", () => {
  it('both stand, both emit, FIX is refused on the WELD (each tower keeps its own — R191-A), and the welded pool is larger', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const race = raceOf(w, P0);
    const id = RACE_TOWER_IDS[race];
    const type = RACE_FEED_SHAPE[race];
    stamp(w, id, { x: 450, y: 300 });
    stamp(w, id, { x: 570, y: 300 });
    tick(w, st, 3);
    const towers = [...w.creatureSpawners.values()].filter((sp) => sp.recipeId === id);
    expect(towers.length, 'two stamped towers ignite').toBe(2);
    const a = towers[0]!.anchorPrimitiveId;
    const b = towers[1]!.anchorPrimitiveId;

    // The control, before the weld: a dent is repairable, and the pool is one tower's own.
    const aBond = [...w.primitives.get(a)!.bonds].sort((x, y) => x - y)[0]!;
    w.bonds.get(aBond)!.damageFifths = 5;
    const bank = w.castleBanks.get(P0)!;
    const fee = repairFeeShapeFor(id)! as number;
    bank[fee] = (bank[fee] ?? 0) + 1;
    expect(planStructureRepair(w, P0, a), 'un-welded, the dented tower is repairable').not.toBeNull();
    const poolBefore = structurePoolFifths(componentOf(w.primitives.get(a)!, w.primitives, w.bonds).bondIds.size);
    expect(poolBefore).toBe(structurePoolFifths(RACE_TOWER_SIZE));

    // "welding it through many connectors": three drops of the ring's own shape across the gap.
    const drops = [286, 300, 314].map((y) => placeLikeAPlayer(w, type, { x: 510, y }));
    const comp = componentOf(w.primitives.get(a)!, w.primitives, w.bonds);
    expect(comp.primitiveIds.has(b), 'the drops weld the two towers into ONE structure').toBe(true);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'BOTH towers stand').toBe(2);

    // "a lot harder to destroy": the welded pool is the WHOLE welded structure's.
    const poolAfter = structurePoolFifths(comp.bondIds.size);
    expect(poolAfter, 'the welded pool is larger than two towers apart').toBeGreaterThan(poolBefore * 2);

    // "they cannot be repaired either" — the welded STRUCTURE, from a weld (R185-B as amended, R191-A)
    expect(planStructureRepair(w, P0, drops[1]!.id), 'welded structure: no FIX').toBeNull();
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: drops[1]!.id });
    expect(w.bonds.get(aBond)!.damageFifths, 'the reducer refuses too').toBe(5);
    // …but tower A, from its own card, repairs itself and nothing else (R191-A R4).
    const bOwnDent = [...w.primitives.get(b)!.bonds].sort((x, y) => x - y)[0]!;
    w.bonds.get(bOwnDent)!.damageFifths = 3;
    expect(planStructureRepair(w, P0, a)!.scope).toBe('tower');
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: a });
    expect(w.bonds.get(aBond)!.damageFifths, 'tower A is healed').toBe(0);
    expect(w.bonds.get(bOwnDent)!.damageFifths, 'tower B is not A').toBe(3);

    // BOTH EMIT — a race tower produces on its own cadence in FIGHT, first unit on the opening tick.
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    tick(w, st, 5);
    const unit = RACE_TOWER_UNIT[race];
    for (const sp of towers) {
      const made = [...w.creatures.values()].filter((c) => c.type === unit && c.sourceSpawnerId === sp.id).length;
      expect(made, `tower ${Number(sp.id)} emits while welded`).toBeGreaterThanOrEqual(1);
    }
    expect(w.creatureSpawners.size).toBe(2);
  });
});

describe('⭐ S189 C2 item 2 — a tier-9 ring welded with its own shape stands, and releases razing ONLY its nine', () => {
  it('the boss walks out; the nine are razed; a weld bonded onward stands, a ring-only weld goes with them', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const race = raceOf(w, P0);
    const type = RACE_FEED_SHAPE[race];
    const nodes = ring(w, type, T9_TOWER_SIZE, 500, 400, 64);
    tick(w, st, 2);
    const sp = [...w.creatureSpawners.values()].find((x) => x.recipeId === T9_TOWER_IDS[race]);
    expect(sp, 'the nine-ring ignites').toBeDefined();
    const weld = placeLikeAPlayer(w, type, { x: 500, y: 400 - 64 - 20 });
    expect(neighbours(w, weld).every((id) => nodes.some((n) => n.id === id)), 'this weld holds only the ring').toBe(true);
    // A second weld that is ALSO bonded onward, to a shape outside the tower.
    const outside = placeLikeAPlayer(w, SparkType.Dot, { x: 500, y: 540 });
    const weld2 = placeLikeAPlayer(w, type, { x: 500, y: 484 });
    expect(neighbours(w, weld2)).toContain(outside.id);
    expect(neighbours(w, weld2).some((id) => nodes.some((n) => n.id === id))).toBe(true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.has(sp!.id), 'the welded nine-ring stands').toBe(true);

    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.creatureSpawners.get(sp!.id)!.nextSpawnTick = w.tick;
    tick(w, st, 3);
    expect(w.creatureSpawners.has(sp!.id), 'released, so the tower is gone').toBe(false);
    expect([...w.creatures.values()].some((c) => c.type === T9_BOSS_TYPE[race]), 'the boss walked out').toBe(true);
    for (const n of nodes) expect(w.primitives.has(n.id), `ring node ${n.id} is razed`).toBe(false);
    // ⭐ S189 C2 (audit W2-2, RE-PINNED) — S157 B2: a shape left holding nothing goes with the
    // structure. The ring-only weld lost its last bond in the raze; the other still holds the Dot.
    expect(w.primitives.has(weld.id), 'the ring-only weld lost its last bond and went with the nine').toBe(false);
    expect(w.primitives.has(weld2.id), 'the weld bonded onward is the player’s and stands').toBe(true);
    expect(w.primitives.has(outside.id)).toBe(true);
  });
});

describe('ARITHMETIC — IGNITION ⊆ SURVIVAL for all twelve race rings', () => {
  it.each(ALL_RACES)('%s — a stamped tier-3 and tier-9 ring both satisfy exact ignition AND stand', (race) => {
    const cases: readonly (readonly [GodlyId, number, Vec2])[] = [
      [RACE_TOWER_IDS[race], RACE_TOWER_SIZE, { x: 400, y: 300 }],
      [T9_TOWER_IDS[race], T9_TOWER_SIZE, { x: 600, y: 700 }],
    ];
    for (const [id, n, centre] of cases) {
      const w = worldInBuild();
      stamp(w, id, centre);
      const ids = [...w.primitives.keys()].sort(byId);
      const anchor = ids.find((x) => isRingAt(w, x, RACE_FEED_SHAPE[race], n));
      expect(anchor, `${id} satisfies its exact ignition test`).toBeDefined();
      expect(towerStandsAt(w, id, anchor!), `${id} stands`).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S189 C2 item 3 — THE LIGHTNING HUB'S SELF-RAZE TAKES ITS OWN STAR, NOT THE WELDED STRUCTURE.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⭐⭐ S189 C2 item 3 — a hub welded to a laser turret self-destructs; the turret STANDS', () => {
  it('the hub and its own five leaves are razed; the turret, its shapes and the weld are not', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const hub = star(w, SparkType.Dot, SparkType.Circle, LIGHTNING_HUB_DEGREE, 500, 300);
    const turret = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 640, 300);
    tick(w, st, 3);
    expect([...w.creatureSpawners.values()].map((sp) => sp.recipeId)).toEqual(['lightningHub']);
    expect(w.defenders.size).toBe(1);

    const weld = placeLikeAPlayer(w, SparkType.Square, { x: 570, y: 300 });
    const comp = componentOf(hub.hub, w.primitives, w.bonds);
    expect(comp.primitiveIds.has(turret.hub.id), 'the hub and the turret are ONE welded structure').toBe(true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'the welded hub stands').toBe(1);

    // Doom it on its OWN star (R182-B): 34 of its own 50, below a third. Direct banking, no sever.
    let left = 34;
    for (const bid of [...hub.hub.bonds].sort((x, y) => x - y)) {
      const other = w.bonds.get(bid)!;
      const leafId = other.aId === hub.hub.id ? other.bId : other.aId;
      if (!hub.leaves.some((l) => l.id === leafId)) continue; // only its own arms
      const take = Math.min(left, 7);
      other.damageFifths += take;
      left -= take;
      if (left <= 0) break;
    }
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    let blasts = 0;
    const d0 = deps();
    const cursor = { lastMatcherTick: -1 };
    for (let i = 0; i < 4 * REVALIDATE_INTERVAL_TICKS && w.creatureSpawners.size > 0; i++) {
      runGodlyMatcherCore(w, cursor);
      runHostTick(w, d0, st);
      for (const e of w.effects) if (e.kind === 'BOMB_EXPLODE') blasts++;
    }
    expect(w.creatureSpawners.size, 'the doomed hub self-destructed').toBe(0);
    expect(blasts, 'and the blast still went off (untouched)').toBeGreaterThan(0);

    // Its OWN star is gone — no bond-less orphans (S157 P0's reason for razing survives).
    expect(w.primitives.has(hub.hub.id)).toBe(false);
    for (const l of hub.leaves) expect(w.primitives.has(l.id), `own leaf ${l.id} razed`).toBe(false);
    // …and nothing it was welded to.
    expect(w.primitives.has(weld.id), 'the welding square is the player’s, not the hub’s').toBe(true);
    expect(w.primitives.has(turret.hub.id), 'the turret hub stands').toBe(true);
    for (const l of turret.leaves) expect(w.primitives.has(l.id), `turret leaf ${l.id}`).toBe(true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'and the laser turret is still a tower').toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AUDIT W1 — NO SPARE. Cutting one of the connectors a tower was BUILT with levels it, whatever
// same-type shape is welded on. (These two cases pinned the reverse — a spare arm and a spare ring —
// until the fix round; they are RE-PINNED, not deleted, so the reversal stays visible.)
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⛔ NO SPARE — a cut own connector levels the tower even with a same-type weld in place', () => {
  it('STAR: a 7th Spiral welded to the turret HUB does NOT save it when an own Spiral arm is cut', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const { hub, leaves } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    tick(w, st, 2);
    expect(w.defenders.size).toBe(1);
    const spare = mk(w, SparkType.Spiral, 530, 330);
    bond(w, hub, spare); // a weld of the arm type, on the hub itself, AFTER ignition
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the weld alone does not hurt it').toBe(1);
    const arm = bondsBetween(w, hub, [leaves[0]!])[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: arm, playerId: P1, cause: 'creature' });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'it destroys the connectors that he is attacking (R185-B)').toBe(0);
  });

  it('RING: a Triangle bridging nodes 0 and 2 does NOT save the pentagram when edge 0–1 is cut', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    const anchor = [...w.creatureSpawners.values()][0]!.anchorPrimitiveId;
    expect(anchor).toBe(nodes[0]!.id);
    const x = mk(w, SparkType.Triangle, 520, 290);
    bond(w, x, nodes[0]!);
    bond(w, x, nodes[2]!); // 0-X-2-3-4 is a second simple 5-cycle through the anchor
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'the weld alone does not hurt it').toBe(1);
    const cut = bondsBetween(w, nodes[0]!, [nodes[1]!])[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: cut, playerId: P1, cause: 'creature' });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'a cut own connector levels it').toBe(0);
  });

  it('a bat tower welded with its own shape falls to one own cut, and so does a same-type-welded t9 ring', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const race = raceOf(w, P0);
    const type = RACE_FEED_SHAPE[race];
    const t3 = ring(w, type, RACE_TOWER_SIZE, 450, 300, 34);
    tick(w, st, 2);
    // Same-type welds that ALSO close a triangle with two of its nodes (a would-be spare 3-cycle).
    const x = mk(w, type, 450, 346);
    bond(w, x, t3[1]!);
    bond(w, x, t3[2]!);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size).toBe(1);
    const cut = bondsBetween(w, t3[1]!, [t3[2]!])[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: cut, playerId: P1, cause: 'creature' });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'n1-X-n2 is not the ring it was built with').toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// OWNER RULING R190-J — "Every fight she should come back as long as the tower is still up."
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⭐⭐ R190-J — a welded HELGA hall brings her back every fight; a broken one does not', () => {
  /** Triangle hub + alternating 3 Spiral / 3 Circle leaves — her hall, hand-built and ignited. */
  function hall(w: World, st: HostTickState): { hub: Primitive; leaves: Primitive[] } {
    const hub = mk(w, SparkType.Triangle, 500, 300);
    const leaves: Primitive[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = mk(w, i % 2 === 0 ? SparkType.Spiral : SparkType.Circle, 500 + Math.cos(a) * 40, 300 + Math.sin(a) * 40);
      bond(w, hub, leaf);
      leaves.push(leaf);
    }
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 500, y: 300 }, bondCount: 6 });
    tick(w, st, 2);
    expect([...w.defenders.values()].map((d) => d.kind), 'the hall summons her').toEqual(['princess']);
    return { hub, leaves };
  }

  /** Cross the next phase edge through the REAL host tick (so the edge sweeps run). */
  function nextPhase(w: World, st: HostTickState): void {
    const from = w.matchPhase;
    w.phaseEndsAtTick = w.tick + 1;
    tick(w, st, 3);
    expect(w.matchPhase, `the phase must flip from ${from}`).not.toBe(from);
  }

  function helgaOf(w: World) {
    return [...w.defenders.values()].find((d) => d.kind === 'princess');
  }

  function killHelga(w: World): void {
    const h = helgaOf(w)!;
    expect(damageEntity(w, { kind: 'defender', id: h.id }, h.ehp!, 'creature', null), 'the blow kills').toBe(true);
    const after = helgaOf(w)!;
    expect(after.state, 'she is dead — DORMANT, her hall keeps its record').toBe('DORMANT');
    expect(after.ehp, 'no pool: nothing can target, raid or damage her').toBeNull();
  }

  it('⭐ weld onto her HALL, let her die: the next fight she is back with NO bond formed during BUILD', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const { hub } = hall(w, st);
    const weld = placeLikeAPlayer(w, SparkType.Square, { x: 520, y: 318 });
    expect(neighbours(w, weld), 'the weld is on the HUB').toContain(hub.id);
    expect(isHelgaComponent(w, hub.id), 'the EXACT build test would refuse this hall').toBe(false);
    tick(w, st, PAST_TWO_POLLS);
    expect(helgaOf(w)?.state, 'the welded hall stands, she is alive').not.toBe('DORMANT');

    nextPhase(w, st); // → FIGHT
    killHelga(w);
    tick(w, st, PAST_TWO_POLLS);
    expect(helgaOf(w)?.state, 'she stays down for the rest of the fight she died in (S157 B6)').toBe('DORMANT');

    const bondsBefore = w.nextBondId;
    nextPhase(w, st); // → BUILD — nobody builds anything
    expect(w.nextBondId, 'no bond was formed').toBe(bondsBefore);
    const back = helgaOf(w)!;
    expect(back.state, 'she is back at the edge').toBe('IDLE');
    expect(back.ehp, 'with her full pool').toBe(makeDefender({
      id: back.id, kind: 'princess', ownerPlayerId: back.ownerPlayerId, anchorPrimitiveId: hub.id,
      recipeId: 'helga', pos: back.pos, registeredAtTick: 0,
    }).ehp);
    expect(back.anchorPrimitiveId, 'on the same hall').toBe(hub.id);

    nextPhase(w, st); // → FIGHT
    expect(helgaOf(w)?.state, 'and she fights it').not.toBe('DORMANT');
  });

  it('⛔ cut one of the hall\'s OWN connectors: the hall falls, the dormant record goes, she never returns', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const { hub, leaves } = hall(w, st);
    placeLikeAPlayer(w, SparkType.Square, { x: 520, y: 318 });
    tick(w, st, PAST_TWO_POLLS);

    nextPhase(w, st); // → FIGHT
    killHelga(w);
    const arm = bondsBetween(w, hub, [leaves[0]!])[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: arm, playerId: P1, cause: 'creature' });
    expect(towerStandsAt(w, 'helga', hub.id), 'her own Spiral arm is gone — the hall is down').toBe(false);

    nextPhase(w, st); // → BUILD
    expect(helgaOf(w), 'the edge sweep removed the dormant record').toBeUndefined();
    // Even with building going on, the broken hall summons nobody (build is exact).
    placeLikeAPlayer(w, SparkType.Dot, { x: 300, y: 760 });
    placeLikeAPlayer(w, SparkType.Dot, { x: 330, y: 760 });
    tick(w, st, 3);
    nextPhase(w, st); // → FIGHT
    nextPhase(w, st); // → BUILD
    expect(helgaOf(w), 'no hall, no Helga — ever').toBeUndefined();
  });

  it('⛔ a lattice Triangle with 3 Spirals + 3 Circles AND other bonds does NOT ignite a new Helga', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const hub = mk(w, SparkType.Triangle, 500, 300);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bond(w, hub, mk(w, i % 2 === 0 ? SparkType.Spiral : SparkType.Circle, 500 + Math.cos(a) * 40, 300 + Math.sin(a) * 40));
    }
    bond(w, hub, mk(w, SparkType.Square, 470, 340)); // one more shape on the hub: part of a lattice
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 500, y: 300 }, bondCount: 7 });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'her first build is EXACT — an isolated component of her seven').toBe(0);
  });

  it('⛔ …nor does one whose HUB is exact but whose LEAF is bonded into the lattice (component ≠ 7)', () => {
    // The discriminating case: the hub carries exactly her six arms, so only the whole-component
    // test (`isHelgaComponent`) refuses it. A "contains" first build would summon her here.
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const hub = mk(w, SparkType.Triangle, 500, 300);
    const leaves: Primitive[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = mk(w, i % 2 === 0 ? SparkType.Spiral : SparkType.Circle, 500 + Math.cos(a) * 40, 300 + Math.sin(a) * 40);
      bond(w, hub, leaf);
      leaves.push(leaf);
    }
    bond(w, leaves[0]!, mk(w, SparkType.Square, 580, 300)); // the lattice goes on past a leaf
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 500, y: 300 }, bondCount: 7 });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'no Helga hall nobody built').toBe(0);
  });

  it('HOST vs WORKER — a death → dormant → revive cycle hashes identically every frame', () => {
    const w = makeWorld(0x51890002);
    w.gameState = 'TITLE';
    dispatch(w, { type: 'START_GAME', mode: 'solo', isHost: true });
    w.matchPhase = 'BUILD';
    w.creatures.clear();
    const setup = makeHostTickState(w);
    hall(w, setup);
    placeLikeAPlayer(w, SparkType.Square, { x: 520, y: 318 });
    tick(w, setup, 2);
    w.phaseEndsAtTick = w.tick + 30;
    const rig = hostWorkerRig(w);
    let killed = false;
    let revived = false;
    for (let f = 0; f < 120; f++) {
      if (!killed && (w.matchPhase as string) === 'FIGHT') {
        // The same kill on both sims, at the same tick.
        for (const world of [w, rig.worker]) {
          const h = [...world.defenders.values()].find((d) => d.kind === 'princess')!;
          damageEntity(world, { kind: 'defender', id: h.id }, h.ehp!, 'creature', null);
        }
        killed = true;
        w.phaseEndsAtTick = w.tick + 20;
        rig.worker.phaseEndsAtTick = rig.worker.tick + 20;
      }
      rig.step(f);
      if (killed && (w.matchPhase as string) === 'BUILD' && helgaOf(w)?.state === 'IDLE') revived = true;
    }
    expect(killed, 'the kill happened inside the window').toBe(true);
    expect(revived, 'and the revive did').toBe(true);
    expect(helgaOf(rig.worker)?.state, 'on the worker too').toBe('IDLE');
  });
});

/**
 * A lockstep host-vs-worker rig: the worker adopts `w` through the real INIT (JSON save) and both
 * advance by the same batches. `step` throws on the first frame whose WIDE hash differs.
 */
function hostWorkerRig(w: World): { worker: World; step: (f: number) => void } {
  for (const b of w.bonds.values()) delete (b as { stiffnessMultiplier?: number }).stiffnessMultiplier; // per-tick transient
  w.effects.length = 0;
  const mkSpawner = (): Spawner => new Spawner(
    DEFAULT_SPAWNER_CONFIG, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5),
  );
  const refSpawner = mkSpawner();
  const sim = makeWorkerSim({
    type: 'INIT', saveJson: JSON.stringify(snapshot(w, { spawnerState: mkSpawner().getState() })),
    hostSeats: [], localPlayerId: 0, ratePerSecond: DEFAULT_SPAWNER_CONFIG.ratePerSecond,
  });
  expect(hashWorldStateFull(sim.world), 'INIT adoption is bit-exact').toBe(hashWorldStateFull(w));
  const controls = new WorkerControls(w, P0);
  const refState = makeHostTickState(w);
  const refCursor = { lastMatcherTick: -1 };
  const cinematics = makeWorkerCinematicState();
  const extras = makeGameStateExtras();
  let seq = 0;
  return {
    worker: sim.world,
    step: (f: number) => {
      const batch = {
        ticks: 1 + (f % 3),
        control: { state: { kind: 'Idle' } as const, cursor: { x: 700, y: 400 } },
        alivePeerIds: null, intents: [], nowMs: f * 16,
      };
      controls.setFrame(batch.control);
      const d: HostTickDeps = {
        spawner: refSpawner, controls, botManager: null, gameStateExtras: extras,
        alivePeerIds: null, hostSeats: new Map(),
      };
      for (let i = 0; i < batch.ticks; i++) runHostTick(w, d, refState);
      if (w.gameState === 'PLAYING') runGodlyMatcherCore(w, refCursor);
      tickWorkerCinematics(w, cinematics);
      w.effects.length = 0;
      applyTickBatch(sim, { type: 'TICK_BATCH', batchSeq: ++seq, ...batch }, { forceSnapshot: true });
      const a = hashWorldStateFull(w);
      const b = hashWorldStateFull(sim.world);
      if (a !== b) throw new Error(`host and worker DIVERGED at frame ${f} (tick ${w.tick})`);
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// AUDIT W3 — a bot's raid aims at the tower's OWN connectors, never at a weld.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⭐ S189 C2 audit W3 — bot raid targeting picks an OWN connector of a welded enemy tower', () => {
  it('with a weld nearer the bot than any own connector, the pick is still an own connector', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    const sp = [...w.creatureSpawners.values()][0]!;
    const weld = placeLikeAPlayer(w, SparkType.Triangle, { x: 500, y: 300 - 42.5 - 30 });
    const weldBonds = [...weld.bonds];
    expect(weldBonds.length).toBeGreaterThan(0);
    const from = { x: weld.pos.x, y: weld.pos.y - 10 }; // the bot stands just past the weld

    const own = towerMembersAt(w, sp.recipeId, sp.anchorPrimitiveId)!;
    const pick = nearestEnemySpawnerBond(w, P1, from);
    expect(pick, 'an enemy spawner exists, so there is a pick').not.toBeNull();
    expect(own.bonds, 'the pick is one of the pentagram’s OWN five').toContain(pick!.bondId);
    expect(weldBonds).not.toContain(pick!.bondId);

    // The case discriminates: a weld connector IS nearer the bot than the pick.
    const d2 = (bid: BondId): number => {
      const b = w.bonds.get(bid)!;
      const a = w.primitives.get(b.aId)!.pos;
      const c = w.primitives.get(b.bId)!.pos;
      return ((a.x + c.x) / 2 - from.x) ** 2 + ((a.y + c.y) / 2 - from.y) ** 2;
    };
    expect(Math.min(...weldBonds.map(d2))).toBeLessThan(d2(pick!.bondId));
    void nodes;
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// AUDIT W2-1 / W5 — the spawner aura and the ground zone are drawn over the tower's OWN members.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⭐ S189 C2 audit W2-1 / W5 — aura strokes and ground zone never ride a weld', () => {
  it('two welded bat towers: each footprint is its own ring, with no weld connector in it', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const race = raceOf(w, P0);
    const id = RACE_TOWER_IDS[race];
    stamp(w, id, { x: 450, y: 300 });
    stamp(w, id, { x: 570, y: 300 });
    tick(w, st, 3);
    const drops = [286, 300, 314].map((y) => placeLikeAPlayer(w, RACE_FEED_SHAPE[race], { x: 510, y }));
    tick(w, st, PAST_TWO_POLLS);
    const towers = [...w.creatureSpawners.values()].filter((sp) => sp.recipeId === id);
    expect(towers.length).toBe(2);
    const weldBonds = new Set(drops.flatMap((d) => [...d.bonds]));
    expect(weldBonds.size).toBeGreaterThan(0);
    for (const sp of towers) {
      const fp = towerFootprintAt(w, sp.recipeId, sp.anchorPrimitiveId)!;
      expect(fp.prims.length, 'the footprint is the ring, not the welded lattice').toBe(RACE_TOWER_SIZE);
      expect(fp.bonds.length).toBe(RACE_TOWER_SIZE);
      for (const b of fp.bonds) expect(weldBonds.has(b), `aura stroke ${b} is not a weld`).toBe(false);
      for (const d of drops) expect(fp.prims).not.toContain(d.id);
    }
  });

  it('a welded laser turret (a non-race tower): the ground-zone footprint is its own star', () => {
    const { w, hub, leaves, welds } = weldedTurret();
    const fp = towerFootprintAt(w, 'laserTurret', hub.id)!;
    expect([...fp.prims].sort(byId)).toEqual([hub.id, ...leaves.map((l) => l.id)].sort(byId));
    for (const t of welds) expect(fp.prims).not.toContain(t.id);
  });

  it('MECHANICAL — neither renderer walks componentOf any more; both take towerFootprintAt', () => {
    for (const f of ['../render/spawnerZoneRenderer.ts', '../render/groundDecalRenderer.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src.includes('componentOf('), `${f} still calls componentOf`).toBe(false);
      expect(src.includes('towerFootprintAt('), `${f} must take the tower's own footprint`).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// AUDIT W2-2 — a weld bonded ONLY to a self-destructing hub's star goes with it (S157 B2).
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⭐ S189 C2 audit W2-2 — the hub self-raze leaves no bond-less orphan', () => {
  it('a Triangle dropped on the hub (bonded to the star only) is razed with it; the blast still fires', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const hub = star(w, SparkType.Dot, SparkType.Circle, LIGHTNING_HUB_DEGREE, 500, 300);
    tick(w, st, 2);
    const weld = placeLikeAPlayer(w, SparkType.Triangle, { x: 518, y: 312 });
    const own = new Set<PrimitiveId>([hub.hub.id, ...hub.leaves.map((l) => l.id)]);
    expect(neighbours(w, weld).length).toBeGreaterThan(0);
    expect(neighbours(w, weld).every((id) => own.has(id)), 'the weld holds nothing but the star').toBe(true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size).toBe(1);

    let left = 34;
    for (const bid of [...hub.hub.bonds].sort((x, y) => x - y)) {
      const b = w.bonds.get(bid)!;
      const other = b.aId === hub.hub.id ? b.bId : b.aId;
      if (!hub.leaves.some((l) => l.id === other)) continue;
      const take = Math.min(left, 7);
      b.damageFifths += take;
      left -= take;
      if (left <= 0) break;
    }
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    let blasts = 0;
    const d0 = deps();
    const cursor = { lastMatcherTick: -1 };
    for (let i = 0; i < 4 * REVALIDATE_INTERVAL_TICKS && w.creatureSpawners.size > 0; i++) {
      runGodlyMatcherCore(w, cursor);
      runHostTick(w, d0, st);
      for (const e of w.effects) if (e.kind === 'BOMB_EXPLODE') blasts++;
    }
    expect(w.creatureSpawners.size, 'the hub self-destructed').toBe(0);
    expect(blasts).toBeGreaterThan(0);
    expect(w.primitives.has(weld.id), 'no bond-less orphan is left to "attract enemy fire" (S157 B2)').toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// AUDIT W1 / S191 — the four sites of `ownPrimitiveIds`: factory (registration), save, wire, hash.
// (Until S191 these pinned the retired `ownBondIdLimit` watermark — see `towerMembers.ts`.)
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⭐ S189 C2 audit W1 / S191 — `ownPrimitiveIds` is recorded at registration and survives every copy', () => {
  function worldWithTowers(): { w: World; spOwn: PrimitiveId[]; dOwn: PrimitiveId[] } {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    const { hub, leaves } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 700, 300);
    tick(w, st, 2);
    return {
      w,
      spOwn: nodes.map((n) => n.id).sort(byId),
      dOwn: [hub.id, ...leaves.map((l) => l.id)].sort(byId),
    };
  }

  it('FACTORY — the spawner and the defender carry the shapes they were built of from registration', () => {
    const { w, spOwn, dOwn } = worldWithTowers();
    expect([...w.creatureSpawners.values()][0]!.ownPrimitiveIds).toEqual(spOwn);
    expect([...w.defenders.values()][0]!.ownPrimitiveIds).toEqual(dOwn);
  });

  it('SAVE + WIRE — a disk restore AND a client snapshot apply both keep it (the client walks need it)', () => {
    const { w, spOwn, dOwn } = worldWithTowers();
    const disk = makeWorld(1);
    restore(snapshot(w), disk);
    expect([...disk.creatureSpawners.values()][0]!.ownPrimitiveIds).toEqual(spOwn);
    expect([...disk.defenders.values()][0]!.ownPrimitiveIds).toEqual(dOwn);
    const client = makeWorld(2);
    applyNetSnapshot(netSnapshot(w), client);
    expect([...client.creatureSpawners.values()][0]!.ownPrimitiveIds, 'NOT trimmed from the wire').toEqual(spOwn);
    expect([...client.defenders.values()][0]!.ownPrimitiveIds).toEqual(dOwn);
  });

  it('⛔ S192 MIGRATION — a PROTOCOL-52 payload (`ownBondIdLimit`, no `ownPrimitiveIds`) restores as UNKNOWN (null), never a guess', () => {
    const { w } = worldWithTowers();
    const snap = JSON.parse(JSON.stringify(snapshot(w))) as Record<string, unknown>;
    let rewritten = 0;
    const v52 = (o: unknown): void => {
      if (Array.isArray(o)) { o.forEach(v52); return; }
      if (o === null || typeof o !== 'object') return;
      const r = o as Record<string, unknown>;
      if ('ownPrimitiveIds' in r) { delete r.ownPrimitiveIds; r.ownBondIdLimit = 3; rewritten++; }
      for (const v of Object.values(r)) v52(v);
    };
    v52(snap);
    expect(rewritten, 'fixture: both towers carried the field').toBe(2);
    const disk = makeWorld(3);
    restore(snap as never, disk);
    expect([...disk.creatureSpawners.values()][0]!.ownPrimitiveIds ?? null).toBeNull();
    expect([...disk.defenders.values()][0]!.ownPrimitiveIds ?? null).toBeNull();
  });

  it('HASH — changing either tower’s own set flips the wide hash (the projection carries it)', () => {
    const { w } = worldWithTowers();
    const before = hashWorldStateFull(w);
    const sp = [...w.creatureSpawners.values()][0]!;
    sp.ownPrimitiveIds = (sp.ownPrimitiveIds ?? []).slice(1);
    const afterSpawner = hashWorldStateFull(w);
    expect(afterSpawner, 'spawner projection').not.toBe(before);
    const d = [...w.defenders.values()][0]!;
    d.ownPrimitiveIds = (d.ownPrimitiveIds ?? []).slice(1);
    expect(hashWorldStateFull(w), 'defender projection').not.toBe(afterSpawner);
  });

  it('CLIENT RENDER — on a client copy, a welded turret still covers only the six arms it was built with', () => {
    const { w, hub, leaves } = weldedTurret();
    const client = makeWorld(3);
    applyNetSnapshot(netSnapshot(w), client);
    const at = rampMembersAt(client, hub.id, rampSpecFor('laserTurret')!)!;
    expect([...at.members].sort(byId)).toEqual([hub.id, ...leaves.map((l) => l.id)].sort(byId));
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// AUDIT W8 — a host-vs-worker differential that CAN see a Set-order dependence and DOES cut.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⭐ S189 C2 audit W8 — host vs worker with REVERSED bond Sets, an own cut and a weld cut inside the window', () => {
  it('wide hash equal every frame; the cut turret falls on both, the weld-cut pentagram and the bat tower stand', () => {
    const w = makeWorld(0x51890003);
    w.gameState = 'TITLE';
    dispatch(w, { type: 'START_GAME', mode: 'solo', isHost: true });
    w.matchPhase = 'BUILD';
    w.creatures.clear();
    const setup = makeHostTickState(w);
    const turret = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    tick(w, setup, 2);
    const penta = ring(w, SparkType.Triangle, 5, 500, 620);
    tick(w, setup, 2);
    const race0 = w.players.get(P0)!.raceId;
    ring(w, RACE_FEED_SHAPE[race0], RACE_TOWER_SIZE, 760, 300, 34);
    tick(w, setup, 2);
    placeLikeAPlayer(w, SparkType.Triangle, { x: 520, y: 318 }); // hub weld on the turret
    const pWeld = placeLikeAPlayer(w, SparkType.Circle, { x: 500, y: 620 - 42.5 - 30 }); // pentagram weld
    placeLikeAPlayer(w, RACE_FEED_SHAPE[race0], { x: 760, y: 300 + 34 + 12 }); // same-type race weld
    tick(w, setup, 2);
    expect(w.defenders.size).toBe(1);
    expect(w.creatureSpawners.size).toBe(2);
    w.phaseEndsAtTick = w.tick + 40;

    const rig = hostWorkerRig(w);
    // ⭐ THE SET-ORDER PROBE: the JSON save rebuilds every `Primitive.bonds` Set in the SAME order, so
    // an order-leaning walk would hash equal anyway. Reverse every Set on the WORKER copy only; the
    // wide hash projects bonds sorted, so any divergence below is a real order dependence.
    for (const p of rig.worker.primitives.values()) p.bonds = new Set([...p.bonds].reverse());

    const ownArm = bondsBetween(w, turret.hub, [turret.leaves[0]!])[0]!;
    const weldBond = [...pWeld.bonds][0]!;
    let cut = false;
    for (let f = 0; f < 160; f++) {
      if (!cut && (w.matchPhase as string) === 'FIGHT') {
        for (const world of [w, rig.worker]) {
          dispatch(world, { type: 'SEVER_BOND', bondId: ownArm, playerId: P1, cause: 'creature' });
          dispatch(world, { type: 'SEVER_BOND', bondId: weldBond, playerId: P1, cause: 'creature' });
        }
        cut = true;
      }
      rig.step(f);
    }
    expect(cut, 'the cuts landed inside the compared window').toBe(true);
    for (const world of [w, rig.worker]) {
      expect(world.defenders.size, 'the turret whose own arm was cut is gone').toBe(0);
      const recipes = [...world.creatureSpawners.values()].map((sp) => sp.recipeId).sort();
      expect(recipes, 'the pentagram (weld cut) and the same-type-welded bat tower stand')
        .toEqual(['pentagram', RACE_TOWER_IDS[race0]].sort());
    }
    void penta;
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// AUDIT W-FR2 — a Helga finished during BUILD is back for the very next FIGHT.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⭐ S189 C2 audit W-FR2 — R190-J for a BUILD death: revived at the BUILD→FIGHT crossing', () => {
  function hallAt(w: World, st: HostTickState): Primitive {
    const hub = mk(w, SparkType.Triangle, 500, 300);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bond(w, hub, mk(w, i % 2 === 0 ? SparkType.Spiral : SparkType.Circle, 500 + Math.cos(a) * 40, 300 + Math.sin(a) * 40));
    }
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 500, y: 300 }, bondCount: 6 });
    tick(w, st, 2);
    return hub;
  }
  const helga = (w: World) => [...w.defenders.values()].find((d) => d.kind === 'princess');
  function crossPhase(w: World, st: HostTickState): void {
    const from = w.matchPhase;
    w.phaseEndsAtTick = w.tick + 1;
    tick(w, st, 3);
    expect(w.matchPhase).not.toBe(from);
  }

  it('raid-killed in BUILD -> cross into FIGHT -> she is IDLE with a full pool', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    hallAt(w, st);
    const h = helga(w)!;
    const full = h.ehp!;
    // A raid finishes her during BUILD (the raid reducer's own damage path).
    expect(damageEntity(w, { kind: 'defender', id: h.id }, full, 'player', null)).toBe(true);
    expect(helga(w)?.state).toBe('DORMANT');
    tick(w, st, PAST_TWO_POLLS);
    expect(helga(w)?.state, 'still down for the rest of BUILD').toBe('DORMANT');
    crossPhase(w, st); // -> FIGHT
    expect(helga(w)?.state, 'back for the fight').toBe('IDLE');
    expect(helga(w)?.ehp, 'with her full pool').toBe(full);
  });

  it('a FIGHT death still waits for the FIGHT->BUILD edge (S157 B6: not in the fight she died in)', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    hallAt(w, st);
    crossPhase(w, st); // -> FIGHT
    const h = helga(w)!;
    damageEntity(w, { kind: 'defender', id: h.id }, h.ehp!, 'creature', null);
    tick(w, st, PAST_TWO_POLLS);
    expect(helga(w)?.state, 'down for the rest of the fight she died in').toBe('DORMANT');
    crossPhase(w, st); // -> BUILD
    expect(helga(w)?.state, 'back at the FIGHT->BUILD edge').toBe('IDLE');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// AUDIT W-FR3 — the hall's sheet does not list a DORMANT Helga as its shooting emplacement.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('S189 C2 audit W-FR3 — a dormant Helga is not the hall\u2019s emplacement on the sheet', () => {
  it('the ATK row is there while she lives and gone while she is DORMANT', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const hub = mk(w, SparkType.Triangle, 500, 300);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bond(w, hub, mk(w, i % 2 === 0 ? SparkType.Spiral : SparkType.Circle, 500 + Math.cos(a) * 40, 300 + Math.sin(a) * 40));
    }
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 500, y: 300 }, bondCount: 6 });
    tick(w, st, 2);
    const labels = (): string[] =>
      characterSheetModel(w, P0, { kind: 'structure', primitiveId: hub.id })!.stats.map((r) => r.label);
    expect(labels(), 'the control: alive, the hall lists her strike').toContain('ATK');
    const h = [...w.defenders.values()][0]!;
    damageEntity(w, { kind: 'defender', id: h.id }, h.ehp!, 'creature', null);
    expect([...w.defenders.values()][0]!.state).toBe('DORMANT');
    expect(labels(), 'dormant: no emplacement row').not.toContain('ATK');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ S191 R191-A — A WELDED STRUCTURE HOLDS TOWERS; EACH TOWER IS FIXED AND SCRAPPED ON ITS OWN.
// Owner: *"you can only scrape the tower that's a part of the shape or only fix the tower that's a part
// of the shape … when you clicking on a welded structure you can't fix it … you can separate those two."*
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Remove one bond from `w` exactly as a sever does to the topology (both endpoints' sets). */
function cutBond(w: World, bid: BondId): void {
  const b = w.bonds.get(bid)!;
  w.bonds.delete(bid);
  w.primitives.get(b.aId)?.bonds.delete(bid);
  w.primitives.get(b.bId)?.bonds.delete(bid);
}

/** Top up `seat`'s bank with one of each shape type in `types`. */
function fund(w: World, types: readonly SparkType[], seat = P0): void {
  const bank = w.castleBanks.get(seat) ?? makeCastleBank();
  for (const t of types) bank[t as number] = (bank[t as number] ?? 0) + 1;
  w.castleBanks.set(seat, bank);
}

/**
 * A STAMPED laser turret and a STAMPED goblin tower, welded into one structure by one Square dropped
 * between them through the real placement path — two towers and one free-form shape.
 */
function stampedPair(): {
  w: World; st: HostTickState; turretHub: PrimitiveId; goblinHub: PrimitiveId; weld: Primitive;
  turretArmAwayFromWeld: BondId;
} {
  const w = worldInBuild();
  const st = makeHostTickState(w);
  stamp(w, 'laserTurret', { x: 500, y: 300 });
  stamp(w, 'goblinTower', { x: 640, y: 300 });
  tick(w, st, 3);
  expect(w.defenders.size, 'the turret stamp ignites').toBe(1);
  expect([...w.creatureSpawners.values()].map((s) => s.recipeId)).toEqual(['goblinTower']);
  const turretHub = [...w.defenders.values()][0]!.anchorPrimitiveId;
  const goblinHub = [...w.creatureSpawners.values()][0]!.anchorPrimitiveId;
  const weld = placeLikeAPlayer(w, SparkType.Square, { x: 570, y: 300 });
  const comp = componentOf(w.primitives.get(turretHub)!, w.primitives, w.bonds);
  expect(comp.primitiveIds.has(goblinHub), 'the Square welds the two towers into ONE structure').toBe(true);
  tick(w, st, PAST_TWO_POLLS);
  expect(w.defenders.size).toBe(1);
  expect(w.creatureSpawners.size).toBe(1);
  // An own turret arm whose leaf the weld does not touch (the far side), so cutting it isolates nothing.
  const hub = w.primitives.get(turretHub)!;
  const weldNbrs = new Set(neighbours(w, weld));
  const arm = [...hub.bonds]
    .map((bid) => {
      const b = w.bonds.get(bid)!;
      return { bid, leaf: b.aId === turretHub ? b.bId : b.aId };
    })
    .filter((x) => !weldNbrs.has(x.leaf) && x.leaf !== weld.id)
    .sort((x, y) => w.primitives.get(x.leaf)!.pos.x - w.primitives.get(y.leaf)!.pos.x || x.bid - y.bid)[0]!.bid;
  return { w, st, turretHub, goblinHub, weld, turretArmAwayFromWeld: arm };
}

describe('⭐⭐ S191 R191-A — FIX / SCRAP on a tower inside a welded structure (R4), and on the weld (R5)', () => {
  it('R4 — the audit W-FR4 window: an own arm cut, then the TOWER’s FIX re-welds it (a NEW bond id) and the SAME turret stands', () => {
    const { w, st, turretHub, turretArmAwayFromWeld } = stampedPair();
    const defenderId = [...w.defenders.keys()][0]!;
    cutBond(w, turretArmAwayFromWeld);
    const plan = planStructureRepair(w, P0, turretHub)!;
    expect(plan.scope, 'the tower, not the structure').toBe('tower');
    expect(plan.missingBondCount).toBe(1);
    fund(w, plan.cost);
    const bondsBefore = w.nextBondId;
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: turretHub });
    expect(w.nextBondId, 'the arm was re-welded with a NEW bond id').toBe(bondsBefore + 1);
    tick(w, st, PAST_TWO_POLLS);
    expect([...w.defenders.keys()], 'the SAME turret stands after the poll').toEqual([defenderId]);
    expect(w.creatureSpawners.size, 'the goblin tower stands').toBe(1);
  });

  it('…control: the same cut WITHOUT a FIX levels the turret at the poll (the counterplay stands)', () => {
    const { w, st, turretArmAwayFromWeld } = stampedPair();
    cutBond(w, turretArmAwayFromWeld);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the turret fell').toBe(0);
    expect(w.creatureSpawners.size, 'the goblin tower did not').toBe(1);
  });

  it('R4 — a FALLEN welded turret: FIX from its remains restores it, it is registered again, and it stands', () => {
    const { w, st, turretHub, weld, turretArmAwayFromWeld } = stampedPair();
    const cut = w.bonds.get(turretArmAwayFromWeld)!;
    const orphanLeaf = cut.aId === turretHub ? cut.bId : cut.aId;
    cutBond(w, turretArmAwayFromWeld);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'fallen').toBe(0);
    const unit = towerUnitAt(w, turretHub)!;
    expect(unit.kind, 'its remains are still a tower — a stamp').toBe('stamp');
    const plan = planStructureRepair(w, P0, turretHub)!;
    expect(plan.scope).toBe('tower');
    fund(w, plan.cost);
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: turretHub });
    expect(w.defenders.size, 're-registered by the FIX — exact ignition can never see a welded tower').toBe(1);
    const d = [...w.defenders.values()][0]!;
    expect(d.anchorPrimitiveId).toBe(turretHub);
    /*
     * Its own shapes: the six still standing in the stamp + the leaf FIX re-minted for the one the cut
     * cut off (that leaf lies loose now, exactly as an un-welded FIX leaves it). Never the weld.
     */
    const own = d.ownPrimitiveIds!;
    expect(own).toHaveLength(TURRET_HUB_DEGREE + 1);
    for (const m of unit.members) expect(own).toContain(m);
    expect(own).not.toContain(weld.id);
    expect(own).not.toContain(orphanLeaf);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'and it STANDS at the poll').toBe(1);
    expect(w.creatureSpawners.size).toBe(1);
  });

  it('R4 — tower SCRAP takes the tower alone: the weld and the other tower stay; the refund is its own shapes', () => {
    const { w, st, turretHub, goblinHub, weld } = stampedPair();
    const plan = planStructureScrap(w, P0, turretHub)!;
    expect(plan.scope).toBe('tower');
    const turretShapes = towerUnitAt(w, turretHub)!.members;
    expect([...plan.memberIds]).toEqual([...turretShapes]);
    expect(plan.memberIds).not.toContain(weld.id);
    const bank = w.castleBanks.get(P0)!;
    const spiralsBefore = bank[SparkType.Spiral as number] ?? 0;
    dispatch(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: turretHub });
    for (const id of turretShapes) expect(w.primitives.has(id), 'the turret is gone').toBe(false);
    expect(w.primitives.has(weld.id), 'the weld stays').toBe(true);
    expect(w.primitives.has(goblinHub), 'the other tower stays').toBe(true);
    expect(bank[SparkType.Spiral as number] ?? 0, 'refunded its own six spirals').toBe(spiralsBefore + TURRET_HUB_DEGREE);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size).toBe(0);
    expect(w.creatureSpawners.size, 'the goblin tower stands').toBe(1);
  });

  it('R5 — structure SCRAP from the WELD takes everything, towers included', () => {
    const { w, st, turretHub, goblinHub, weld } = stampedPair();
    const comp = [...componentOf(weld, w.primitives, w.bonds).primitiveIds];
    const plan = planStructureScrap(w, P0, weld.id)!;
    expect(plan.scope).toBe('structure');
    expect([...plan.memberIds].sort(byId)).toEqual([...comp].sort(byId));
    dispatch(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: weld.id });
    for (const id of comp) expect(w.primitives.has(id)).toBe(false);
    expect(w.primitives.has(turretHub) || w.primitives.has(goblinHub)).toBe(false);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size).toBe(0);
    expect(w.creatureSpawners.size).toBe(0);
  });

  it('R5 — structure FIX from the WELD is refused: no plan, and the reducer changes nothing', () => {
    const { w, turretHub, weld } = stampedPair();
    const arm = [...w.primitives.get(turretHub)!.bonds].sort((x, y) => x - y)[0]!;
    w.bonds.get(arm)!.damageFifths = 9;
    fund(w, [SparkType.Spiral, SparkType.Circle, SparkType.Square]);
    expect(planStructureRepair(w, P0, weld.id)).toBeNull();
    const before = hashWorldStateFull(w);
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: weld.id });
    expect(hashWorldStateFull(w), 'a refused intent is a no-op').toBe(before);
  });

  it('R6 — damage stays connector-specific: a chewer at the turret’s edge severs a TURRET connector; only the turret falls', () => {
    const { w, st, turretHub, goblinHub } = stampedPair();
    const turretArms = new Set(towerMembersAt(w, 'laserTurret', turretHub)!.bonds);
    const goblinArms = new Set(towerMembersAt(w, 'goblinTower', goblinHub)!.bonds);
    const compBonds = [...componentOf(w.primitives.get(turretHub)!, w.primitives, w.bonds).bondIds];
    expect(compBonds.some((b) => !turretArms.has(b) && !goblinArms.has(b)), 'the structure has weld connectors too').toBe(true);
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    // Hold the defenders off the attacker so the only thing that happens is the chewing.
    for (const d of w.defenders.values()) d.nextFireTick = w.tick + 10_000_000;
    for (const sp of w.creatureSpawners.values()) sp.nextSpawnTick = w.tick + 10_000_000;
    const leftmost = [...towerMembersAt(w, 'laserTurret', turretHub)!.prims]
      .map((id) => w.primitives.get(id)!).sort((a, b) => a.pos.x - b.pos.x)[0]!;
    const at = { x: leftmost.pos.x - 30, y: leftmost.pos.y };
    const chewer = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P1,
      pos: { ...at }, targetPos: { ...at }, spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(99),
    });
    chewer.ehp = 1_000_000; // survives whatever else is on the board
    w.creatures.set(chewer.id, chewer);
    const pool = structurePoolFifths(compBonds.length);
    let severed: BondId | null = null;
    for (let i = 0; i < 6000 && severed === null; i++) {
      const before = [...w.bonds.keys()];
      tick(w, st, 1);
      severed = before.find((b) => !w.bonds.has(b)) ?? null;
    }
    expect(severed, `the chewer must break a connector (structure pool ${pool})`).not.toBeNull();
    expect(turretArms.has(severed!), 'the connector that severed is the TURRET’s — the one it attacked').toBe(true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the turret fell').toBe(0);
    expect(w.creatureSpawners.size, 'the goblin tower did not').toBe(1);
  });

  it('HOST vs WORKER — cut → the tower’s FIX → it stands: wide hash equal every frame', () => {
    const { w, turretHub, turretArmAwayFromWeld } = stampedPair();
    fund(w, [SparkType.Spiral, SparkType.Spiral]);
    w.phaseEndsAtTick = w.tick + 100_000; // the whole window in BUILD (FIX is BUILD-only, R19)
    // ⚠ a castle unit spawned during setup does not survive the save round trip bit-exactly
    // (`Creature.spawnedAtTick` — pre-existing, reported); units born inside the window are compared.
    w.creatures.clear();
    const rig = hostWorkerRig(w);
    const defenderId = [...w.defenders.keys()][0]!;
    for (let f = 0; f < 90; f++) {
      if (f === 5) for (const world of [w, rig.worker]) cutBond(world, turretArmAwayFromWeld);
      if (f === 6) {
        for (const world of [w, rig.worker]) dispatch(world, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: turretHub });
      }
      rig.step(f);
    }
    for (const world of [w, rig.worker]) {
      expect([...world.defenders.keys()], 'the same turret stands on both sides').toEqual([defenderId]);
      expect(world.creatureSpawners.size).toBe(1);
    }
  });
});

describe('⭐ S191 R191-A — the two identity edges of a tower FIX, and the shared-shape SCRAP rule', () => {
  it('R4 — a LEAF razed inside the poll window: the tower’s FIX re-mints it, the record adopts the new shape, the SAME turret stands', () => {
    const { w, st, turretHub, turretArmAwayFromWeld } = stampedPair();
    const defenderId = [...w.defenders.keys()][0]!;
    const b = w.bonds.get(turretArmAwayFromWeld)!;
    const leaf = b.aId === turretHub ? b.bId : b.aId;
    razePrimitives(w, [leaf]);
    const plan = planStructureRepair(w, P0, turretHub)!;
    expect(plan.scope).toBe('tower');
    expect(plan.group.missing, 'one node lost').toHaveLength(1);
    fund(w, plan.cost);
    const firstNew = w.nextPrimitiveId;
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: turretHub });
    const d = w.defenders.get(defenderId)!;
    expect(d.ownPrimitiveIds, 'the re-minted leaf is one of its own now').toContain(firstNew);
    expect(d.ownPrimitiveIds).not.toContain(leaf);
    tick(w, st, PAST_TWO_POLLS);
    expect([...w.defenders.keys()], 'the SAME turret stands').toEqual([defenderId]);
  });

  it('R4 — tower SCRAP leaves a shape ANOTHER tower is also built of (⚠ MINE): the neighbour stands', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    // A lightning hub and a stink tower SHARING one Circle leaf (`starShape.ts` — a real overlap).
    const dot = star(w, SparkType.Dot, SparkType.Circle, LIGHTNING_HUB_DEGREE, 500, 300);
    const shared = dot.leaves.find((l) => l.pos.x > 530 && Math.abs(l.pos.y - 300) < 1)!;
    const sq = mk(w, STINK_HUB_TYPE, shared.pos.x + 40, 300);
    bond(w, sq, shared);
    const own = [mk(w, STINK_LEAF_TYPE, sq.pos.x + 20, 265), mk(w, STINK_LEAF_TYPE, sq.pos.x + 20, 335)];
    for (const c of own) bond(w, sq, c);
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: sq.pos.x, y: 300 }, bondCount: 3 });
    tick(w, st, 2);
    expect([...w.creatureSpawners.values()].map((s) => s.recipeId)).toEqual(['lightningHub']);
    expect([...w.defenders.values()].map((d) => d.kind)).toEqual(['stinkTower']);
    const plan = planStructureScrap(w, P0, sq.id)!;
    expect(plan.scope).toBe('tower');
    expect([...plan.memberIds].sort(byId)).toEqual([sq.id, ...own.map((c) => c.id)].sort(byId));
    dispatch(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: sq.id });
    expect(w.primitives.has(shared.id), 'the shared Circle stays').toBe(true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the stink tower is scrapped').toBe(0);
    expect(w.creatureSpawners.size, 'the lightning hub still stands on its five').toBe(1);
  });
});

describe('⭐ S191 R191-A — the identity edge on an UN-WELDED tower (the path that was free under master’s exact survival)', () => {
  it('a stamped turret loses a LEAF inside the poll window, FIX re-mints it: the SAME turret stands', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    stamp(w, 'laserTurret', { x: 500, y: 300 });
    tick(w, st, 3);
    expect(w.defenders.size).toBe(1);
    const d = [...w.defenders.values()][0]!;
    const defenderId = d.id;
    const hub = w.primitives.get(d.anchorPrimitiveId)!;
    const leaf = [...hub.bonds].map((bid) => {
      const b = w.bonds.get(bid)!;
      return b.aId === hub.id ? b.bId : b.aId;
    }).sort(byId)[0]!;
    razePrimitives(w, [leaf]);
    const plan = planStructureRepair(w, P0, hub.id)!;
    expect(plan.scope, 'un-welded: the pre-S191 structure FIX').toBe('structure');
    expect(plan.group.missing).toHaveLength(1);
    fund(w, plan.cost);
    const reminted = asPrimitiveId(w.nextPrimitiveId);
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: hub.id });
    expect(w.primitives.has(reminted), 'FIX re-minted the leaf').toBe(true);
    expect(w.defenders.get(defenderId)!.ownPrimitiveIds, 'the record adopts it').toContain(reminted);
    tick(w, st, PAST_TWO_POLLS);
    expect([...w.defenders.keys()], 'the SAME turret stands').toEqual([defenderId]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ S192 — ROUND-5 AUDIT FIXES (S191_AUDIT_DIGEST "s189/weld ROUND 5"). Each case reproduces the
// audit's board through the REAL placement path and fails on the round-5 tip.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Audit W2-4 / IDENTITY-1 / IDENTITY-2 — a mummies seat stamps a laser turret, then drops two Lines on
 * its Line hub. The drops plus the hub are an exact Line 3-ring, so a Scarab tower ignites ANCHORED AT
 * THE TURRET'S HUB (lowest id), while the turret still stands on its six own arms.
 */
function turretWithScarabOnItsHub(): {
  w: World; st: HostTickState; hubId: PrimitiveId; turretId: number; turretOwn: PrimitiveId[]; lines: Primitive[];
} {
  const w = worldInBuild();
  const p = w.players.get(P0)!;
  w.players.set(P0, { ...p, raceId: 'mummies' } as typeof p);
  const st = makeHostTickState(w);
  stamp(w, 'laserTurret', { x: 500, y: 300 });
  tick(w, st, 3);
  expect(w.defenders.size, 'the turret stamp ignites').toBe(1);
  const d0 = [...w.defenders.values()][0]!;
  const hub = w.primitives.get(d0.anchorPrimitiveId)!;
  const lines = [-Math.PI / 3, (-2 * Math.PI) / 3].map((a) =>
    placeLikeAPlayer(w, SparkType.Line, { x: hub.pos.x + 20 * Math.cos(a), y: hub.pos.y + 20 * Math.sin(a) }));
  tick(w, st, PAST_TWO_POLLS);
  const sps = [...w.creatureSpawners.values()];
  expect(sps.map((s) => s.recipeId), 'the Scarab ring ignites through the hub').toEqual(['t3TowerMummies']);
  expect(sps[0]!.anchorPrimitiveId, 'anchored AT the turret hub (W2-4)').toBe(hub.id);
  expect(w.defenders.size, 'the welded turret still stands').toBe(1);
  return { w, st, hubId: hub.id, turretId: d0.id as number, turretOwn: [...d0.ownPrimitiveIds!], lines };
}

describe('⭐ S192 IDENTITY-1 — a paid FIX on a fallen welded tower always brings it back (or is never offered)', () => {
  it('the W2-4 board: the turret falls, FIX from a Spiral re-registers it, and it stands beside the Scarab ring', () => {
    const { w, st, hubId, turretOwn } = turretWithScarabOnItsHub();
    const leaf = turretOwn.filter((id) => id !== hubId)[0]!;
    razePrimitives(w, [leaf], undefined, true, true); // killed through the damage path's raze shape
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the turret fell').toBe(0);
    expect(w.creatureSpawners.size, 'the ring stands').toBe(1);
    const spiral = turretOwn.filter((id) => id !== hubId && w.primitives.has(id)).sort(byId)[0]!;
    const plan = planStructureRepair(w, P0, spiral)!;
    expect(plan, 'FIX is offered on the fallen turret').not.toBeNull();
    expect(plan.scope).toBe('tower');
    fund(w, plan.cost);
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: spiral });
    expect([...w.defenders.values()].map((d) => [d.recipeId, d.anchorPrimitiveId]), 'paid for ⇒ registered')
      .toEqual([['laserTurret', hubId]]);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'and it STANDS at the poll').toBe(1);
    expect([...w.creatureSpawners.values()].map((s) => s.recipeId), 'the ring is untouched').toEqual(['t3TowerMummies']);
  });

  it('⛔ "cannot half-spend": when registration WOULD be refused, no FIX is planned and the bank is untouched', () => {
    const { w, st, hubId, turretOwn } = turretWithScarabOnItsHub();
    const leaf = turretOwn.filter((id) => id !== hubId)[0]!;
    razePrimitives(w, [leaf], undefined, true, true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size).toBe(0);
    // A DEFENDER record already anchored at the hub (contract fixture): `applyRegisterDefender` de-dups on
    // the anchor, so a FIX would consume and register nothing — it must not be offered at all.
    const hub = w.primitives.get(hubId)!;
    const blocker = makeDefender({
      id: asDefenderId(w.nextDefenderId++), kind: 'stinkTower', ownerPlayerId: P0, anchorPrimitiveId: hubId,
      recipeId: 'stinkTower', pos: { ...hub.pos }, registeredAtTick: w.tick, ownPrimitiveIds: [hubId],
    });
    w.defenders.set(blocker.id, blocker);
    const spiral = turretOwn.filter((id) => id !== hubId && w.primitives.has(id)).sort(byId)[0]!;
    // Its OWN-set is just the hub, so the spiral is the fallen stamp's (not the blocker's) shape.
    expect(towerUnitAt(w, spiral)?.kind).toBe('stamp');
    expect(planStructureRepair(w, P0, spiral), 'no FIX that cannot finish').toBeNull();
    fund(w, [SparkType.Spiral]);
    const bank = JSON.stringify(w.castleBanks.get(P0));
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: spiral });
    expect(JSON.stringify(w.castleBanks.get(P0)), 'nothing spent').toBe(bank);
  });
});

describe('⭐ S192 IDENTITY-5 — "welded" is MEMBERSHIP (a shape outside the tower), never a size compare', () => {
  it('a pentagram with ONE weld on its anchor, both anchor neighbours killed inside the poll window: still welded, tower FIX, SCRAP keeps the weld', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    stamp(w, 'pentagram', { x: 500, y: 300 });
    tick(w, st, 3);
    const sp = [...w.creatureSpawners.values()][0]!;
    expect(sp.recipeId).toBe('pentagram');
    const anchor = w.primitives.get(sp.anchorPrimitiveId)!;
    // Outward from the ring centre, beside the anchor: a real drop that bonds to the anchor alone.
    const dx = anchor.pos.x - 500, dy = anchor.pos.y - 300, len = Math.hypot(dx, dy);
    const weld = placeLikeAPlayer(w, SparkType.Square, { x: anchor.pos.x + (dx / len) * 28, y: anchor.pos.y + (dy / len) * 28 });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'the welded pentagram stands').toBe(1);
    const own = new Set(sp.ownPrimitiveIds!);
    expect(own.has(weld.id)).toBe(false);
    const ringNbrs = neighbours(w, anchor).filter((id) => own.has(id));
    expect(ringNbrs).toHaveLength(2);
    razePrimitives(w, ringNbrs, undefined, true, true); // the damage path's raze shape; NO tick
    // The window: 3 own shapes live (anchor + the far pair), the anchor's component is anchor + weld (2).
    // A size compare reads 2 > 3 = "not welded"; the weld is plainly outside the tower.
    const unit = towerUnitAt(w, anchor.id)!;
    expect(unit.kind).toBe('live');
    expect(weldedAt(w, anchor.id, unit), 'the anchor sits in a welded structure').toBe(true);
    const fix = planStructureRepair(w, P0, anchor.id);
    expect(fix?.scope, 'the TOWER\'s FIX is offered').toBe('tower');
    const scrap = planStructureScrap(w, P0, anchor.id)!;
    expect(scrap.scope).toBe('tower');
    expect(scrap.memberIds, 'a tower SCRAP never takes the weld').not.toContain(weld.id);
    // The card asks the same question through the same helper.
    const view = characterSheetModel(w, P0, { kind: 'structure', primitiveId: anchor.id });
    expect(view?.welded?.role, 'the card reads it as a tower in a weld').toBe('tower');
  });
});

describe('⭐ S192 IDENTITY-4 — "the other towers" strip compares tower IDENTITY, not (lowest shape, recipe)', () => {
  it('two goblin towers chained hub-to-leaf share their LOWEST shape: each card lists exactly the other one', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    // G: hub c1 with four Circle leaves; G2: hub = G's leaf l1, with three more Circles (plus c1).
    const c1 = mk(w, SparkType.Circle, 400, 300);
    const l1 = mk(w, SparkType.Circle, 450, 300);
    const gLeaves = [l1, mk(w, SparkType.Circle, 400, 250), mk(w, SparkType.Circle, 400, 350), mk(w, SparkType.Circle, 350, 300)];
    for (const l of gLeaves) bond(w, c1, l);
    const g2Leaves = [mk(w, SparkType.Circle, 500, 300), mk(w, SparkType.Circle, 480, 260), mk(w, SparkType.Circle, 480, 340)];
    for (const c of g2Leaves) bond(w, l1, c);
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { ...l1.pos }, bondCount: 7 });
    tick(w, st, PAST_TWO_POLLS);
    const sps = [...w.creatureSpawners.values()].sort((a, b) => a.id - b.id);
    expect(sps.map((s) => [s.recipeId, s.anchorPrimitiveId])).toEqual([['goblinTower', c1.id], ['goblinTower', l1.id]]);
    expect(sps[0]!.ownPrimitiveIds![0], 'fixture: both own sets start at c1').toBe(sps[1]!.ownPrimitiveIds![0]);
    const gPrivate = gLeaves[2]!; // a leaf only G is built of
    const g2Private = g2Leaves[1]!; // a leaf only G2 is built of
    const cardG = characterSheetModel(w, P0, { kind: 'structure', primitiveId: gPrivate.id })!;
    const cardG2 = characterSheetModel(w, P0, { kind: 'structure', primitiveId: g2Private.id })!;
    expect(cardG.welded?.role).toBe('tower');
    expect(cardG2.welded?.role).toBe('tower');
    expect(cardG.welded!.towers, 'G lists G2').toHaveLength(1);
    expect(cardG2.welded!.towers, 'G2 lists G').toHaveLength(1);
  });
});

describe('⭐ S192 IDENTITY-2 — a tower named on a card opens THAT tower, even when its anchor is shared', () => {
  it('the W2-4 board: the Scarab card\'s turret row opens the LASER TURRET; the turret card\'s Scarab row opens the SCARAB', () => {
    const { w, hubId, turretOwn, lines } = turretWithScarabOnItsHub();
    const spiral = turretOwn.filter((id) => id !== hubId).sort(byId)[0]!;
    const turretCard = characterSheetModel(w, P0, { kind: 'structure', primitiveId: spiral })!;
    expect(turretCard.title, 'fixture: a Spiral opens the turret').toBe(codexCopyFor('laserTurret').name);
    const scarabCard = characterSheetModel(w, P0, { kind: 'structure', primitiveId: lines[0]!.id })!;
    expect(scarabCard.title, 'fixture: a Line opens the Scarab').toBe(codexCopyFor('t3TowerMummies').name);
    const turretRow = scarabCard.welded!.towers.find((t) => t.name === codexCopyFor('laserTurret').name)!;
    const scarabRow = turretCard.welded!.towers.find((t) => t.name === codexCopyFor('t3TowerMummies').name)!;
    expect(characterSheetModel(w, P0, turretRow.target)!.title, 'the turret row → the turret').toBe(codexCopyFor('laserTurret').name);
    expect(characterSheetModel(w, P0, scarabRow.target)!.title, 'the Scarab row → the Scarab').toBe(codexCopyFor('t3TowerMummies').name);
    // …and FIX / SCRAP from that card act on that tower: SCRAP takes the six Spirals, never the shared hub.
    const scrap = planStructureScrap(w, P0, (turretRow.target as { primitiveId: PrimitiveId }).primitiveId)!;
    expect([...scrap.memberIds].sort(byId)).toEqual(turretOwn.filter((id) => id !== hubId).sort(byId));
  });
});

/** A stamped laser turret with a Triangle dropped (real path) on its art between the hub and leaf L. */
function turretWithTriangleOnHubAndLeaf(): { w: World; st: HostTickState; hub: Primitive; L: Primitive; tri: Primitive; hubL: BondId } {
  const w = worldInBuild();
  const st = makeHostTickState(w);
  stamp(w, 'laserTurret', { x: 500, y: 300 });
  tick(w, st, 3);
  expect(w.defenders.size).toBe(1);
  const hub = w.primitives.get([...w.defenders.values()][0]!.anchorPrimitiveId)!;
  const L = w.primitives.get(neighbours(w, hub)[0]!)!;
  const dx = L.pos.x - hub.pos.x, dy = L.pos.y - hub.pos.y, len = Math.hypot(dx, dy);
  const tri = placeLikeAPlayer(w, SparkType.Triangle, {
    x: (hub.pos.x + L.pos.x) / 2 + (-dy / len) * 8, y: (hub.pos.y + L.pos.y) / 2 + (dx / len) * 8,
  });
  expect(neighbours(w, tri), 'fixture: the drop bonds the hub AND L').toEqual(expect.arrayContaining([hub.id, L.id]));
  tick(w, st, PAST_TWO_POLLS);
  expect(w.defenders.size, 'the welded turret stands').toBe(1);
  const hubL = [...hub.bonds].find((bid) => { const b = w.bonds.get(bid)!; return b.aId === L.id || b.bId === L.id; })!;
  return { w, st, hub, L, tri, hubL };
}

describe('⭐ S192 SHEETS-1 — one fallen tower is ONE fallen tower, and its FIX charges only what it lost', () => {
  it('the hub–L arm severs while the weld holds L: ONE "DOWN" row; L is that tower; FIX re-welds L (no new shape) and the turret stands', () => {
    const { w, st, hub, L, tri, hubL } = turretWithTriangleOnHubAndLeaf();
    w.matchPhase = 'FIGHT';
    dispatch(w, { type: 'SEVER_BOND', bondId: hubL, playerId: P1, cause: 'chewer' });
    w.matchPhase = 'BUILD';
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the turret fell').toBe(0);
    expect(componentOf(L, w.primitives, w.bonds).primitiveIds.has(hub.id), 'fixture: L is still in the weld').toBe(true);
    const towers = structureTowersAt(w, tri.id)!.towers;
    expect(towers.map((t) => [t.kind, t.recipeId]), 'ONE fallen turret, not two').toEqual([['stamp', 'laserTurret']]);
    expect(towers[0]!.members, 'L is one of its shapes').toContain(L.id);
    const onL = planStructureRepair(w, P0, L.id)!;
    const onHub = planStructureRepair(w, P0, hub.id)!;
    expect(onL.memberIds, 'L and the hub name the same tower').toEqual(onHub.memberIds);
    expect(onHub.group.missing, 'it lost no SHAPE').toEqual([]);
    expect(onHub.missingBondCount, 'it lost one connector').toBe(1);
    expect(onHub.cost, 'one shape (R182-E), not a whole turret').toHaveLength(1);
    fund(w, onHub.cost);
    const shapes = w.primitives.size;
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: hub.id });
    expect(w.primitives.size, 'no shape minted').toBe(shapes);
    expect(neighbours(w, hub), 'L re-welded to the hub').toContain(L.id);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the turret stands again').toBe(1);
    expect(structureTowersAt(w, tri.id)!.towers.map((t) => t.kind), 'and the weld lists exactly it').toEqual(['live']);
  });

  it('⚠ MINE — the hub razed, two leaves held by the weld: the remains are rubble (no phantom DOWN rows, no 6-shape FIX)', () => {
    const { w, st, hub, L, tri } = turretWithTriangleOnHubAndLeaf();
    const other = neighbours(w, tri).find((id) => id !== hub.id && id !== L.id);
    razePrimitives(w, [hub.id], undefined, true, true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size).toBe(0);
    expect(structureTowersAt(w, tri.id)!.towers, 'a minority of a turret is not a fallen turret').toEqual([]);
    expect(planStructureRepair(w, P0, L.id), 'no FIX builds a whole turret around one leaf inside a weld').toBeNull();
    if (other !== undefined) expect(planStructureRepair(w, P0, other)).toBeNull();
    expect(planStructureScrap(w, P0, L.id), 'SCRAP still reclaims it').not.toBeNull();
  });

  it('⚠ MINE (P4b / IDENTITY-3) — a stray stamped leaf (left loose by an un-welded FIX) welded back on: rubble, never a second turret', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    stamp(w, 'laserTurret', { x: 500, y: 300 });
    tick(w, st, 3);
    const hub = w.primitives.get([...w.defenders.values()][0]!.anchorPrimitiveId)!;
    const arm = [...hub.bonds].sort((a, b) => a - b)[0]!;
    const b0 = w.bonds.get(arm)!;
    const stray = w.primitives.get(b0.aId === hub.id ? b0.bId : b0.aId)!;
    cutBond(w, arm);
    const fix = planStructureRepair(w, P0, hub.id)!;
    expect(fix.scope, 'un-welded: the pre-S191 structure FIX').toBe('structure');
    fund(w, fix.cost);
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: hub.id });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size).toBe(1);
    expect(stray.origin?.blueprintId, 'fixture: the stray still carries its stamp').toBe('laserTurret');
    // A hand-built wall onto the stray (P4b): no tower card, no FIX.
    const wall = mk(w, SparkType.Square, stray.pos.x + 200, stray.pos.y);
    bond(w, wall, stray);
    expect(towerUnitAt(w, stray.id), 'one shape of seven is rubble').toBeNull();
    expect(planStructureRepair(w, P0, stray.id)).toBeNull();
    // Welded back ONTO the live turret (IDENTITY-3): still rubble; no FIX registers a second turret.
    bond(w, stray, hub);
    expect(towerUnitAt(w, stray.id)?.kind ?? null).toBeNull();
    expect(planStructureRepair(w, P0, stray.id)).toBeNull();
    expect(structureTowersAt(w, stray.id)!.towers.map((t) => t.kind), 'the weld lists the one live turret').toEqual(['live']);
  });
});

describe('⭐ S192 re-audit X1 — a FALLEN tower\'s row opens that tower, even when its anchor is a live tower\'s shape', () => {
  it('the W2-4 board after the turret falls: the Scarab card\'s "LASER TURRET · DOWN" row opens the turret, and its SCRAP is the turret\'s', () => {
    const { w, st, hubId, turretOwn, lines } = turretWithScarabOnItsHub();
    const leaf = turretOwn.filter((id) => id !== hubId)[0]!;
    razePrimitives(w, [leaf], undefined, true, true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size).toBe(0);
    const scarabCard = characterSheetModel(w, P0, { kind: 'structure', primitiveId: lines[0]!.id })!;
    const row = scarabCard.welded!.towers.find((t) => t.name === codexCopyFor('laserTurret').name)!;
    expect(row?.down, 'fixture: the fallen turret is listed').toBe(true);
    expect(characterSheetModel(w, P0, row.target)!.title, 'row → the turret').toBe(codexCopyFor('laserTurret').name);
    const target = (row.target as { primitiveId: PrimitiveId }).primitiveId;
    const scrap = planStructureScrap(w, P0, target)!;
    expect(scrap.memberIds, 'never the ring\'s Lines').not.toContain(lines[0]!.id);
    expect(scrap.memberIds).not.toContain(lines[1]!.id);
  });
});

describe('⭐ S192 re-audit X2 — two stamps of one blueprint welded together are never read as ONE fallen tower', () => {
  it('turret A loses node k; turret B loses all but its node-k leaf the weld holds: A\'s FIX never bonds B\'s leaf to A\'s hub', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    stamp(w, 'laserTurret', { x: 500, y: 300 });
    tick(w, st, 3);
    stamp(w, 'laserTurret', { x: 660, y: 300 });
    tick(w, st, 3);
    expect(w.defenders.size).toBe(2);
    const ds = [...w.defenders.values()].sort((a, b) => a.id - b.id);
    const aOwn = ds[0]!.ownPrimitiveIds!, bOwn = ds[1]!.ownPrimitiveIds!;
    const weld = placeLikeAPlayer(w, SparkType.Square, { x: 580, y: 300 });
    const wn = neighbours(w, weld);
    tick(w, st, PAST_TWO_POLLS);
    const bLeaf = wn.find((id) => bOwn.includes(id) && id !== ds[1]!.anchorPrimitiveId)!;
    expect(bLeaf, 'fixture: the weld holds a leaf of B').toBeDefined();
    const k = w.primitives.get(bLeaf)!.origin!.nodeIndex;
    const aK = aOwn.find((id) => w.primitives.get(id)!.origin!.nodeIndex === k)!;
    expect(wn, 'fixture: A\'s node-k leaf is not held by the weld').not.toContain(aK);
    razePrimitives(w, [aK, ...bOwn.filter((id) => id !== bLeaf)], undefined, true, true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size).toBe(0);
    const hubA = ds[0]!.anchorPrimitiveId;
    const unit = towerUnitAt(w, hubA)!;
    expect(unit.kind).toBe('stamp');
    expect(unit.members, 'B\'s leaf is not one of A\'s shapes').not.toContain(bLeaf);
    const plan = planStructureRepair(w, P0, hubA);
    if (plan !== null) {
      fund(w, plan.cost);
      dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: hubA });
    }
    const hub = w.primitives.get(hubA)!;
    expect(neighbours(w, hub), 'no 124 px bond from A\'s hub to B\'s leaf').not.toContain(bLeaf);
    for (const d of w.defenders.values()) expect(d.ownPrimitiveIds, 'no turret built from two stamps').not.toContain(bLeaf);
  });
});
