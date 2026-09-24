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
import { ringCycleAt } from './godlyRecipes/ringShape.ts';
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
import { planStructureRepair } from './structureRepair.ts';
import { damageEntity } from './damage.ts';
import { nearestEnemySpawnerBond } from '../bots/botBrain.ts';
import { collectSpawnerLockedPrimitiveIds } from './placePrimitive.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { blueprintBill } from './blueprints.ts';
import { makeCastleBank } from './castleBank.ts';
import { makeCreature } from './creatures/creature.ts';
import { CHEWER_CONFIG } from './creatures/voltkin-config.ts';
import { asCreatureId, asSpawnerId } from '../types.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import { ALL_RACES, RACE_FEED_SHAPE } from './races.ts';
import { RACE_TOWER_IDS, RACE_TOWER_SIZE, RACE_TOWER_UNIT } from './raceTowerIds.ts';
import { T9_BOSS_TYPE, T9_TOWER_IDS, T9_TOWER_SIZE } from './t9BossIds.ts';
import { isRingAt } from './godlyRecipes/ringShape.ts';
import { repairFeeShapeFor } from './structureRepair.ts';
import { towerArtForRecipe, towerRingCentroid } from '../render/towerFrames.ts';
import { makeWorkerCinematicState, tickWorkerCinematics } from './godlyMatcherCore.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls, type WorkerTickBatchMsg } from './workerSim.ts';
import { snapshot } from './save.ts';
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

describe('⭐ S189 C2 — R185-B: welding costs repair, on purpose', () => {
  it('FIX is offered on a dented stamped turret, and refused the moment a triangle is welded on', () => {
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
    expect(planStructureRepair(w, P0, hubId), 'welded: no FIX').toBeNull();
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: hubId });
    expect(w.bonds.get(arm)!.damageFifths, 'the reducer refuses too').toBe(10);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'unrepairable is not dead — the welded turret stands').toBe(1);
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

  it('starArmsAt takes the LOWEST-id arms; a surplus same-type weld is not an arm until one is lost', () => {
    const w = worldInBuild();
    const { hub, leaves } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    const spare = mk(w, SparkType.Spiral, 530, 330);
    const spareBond = bond(w, hub, spare); // minted AFTER the arms, so its id is higher
    const spec = [{ leafType: SparkType.Spiral, count: TURRET_HUB_DEGREE }];
    const armsNow = starArmsAt(w, hub.id, SparkType.Line, spec)!;
    expect(armsNow.whole).toBe(true);
    expect(armsNow.leaves).not.toContain(spare.id);
    expect(armsNow.bonds).not.toContain(spareBond);

    // ⚠ The ruled semantics, stated as a test: lose an original arm and the spare stands in —
    // "as long as the existing tower, the shape is there".
    const lost = bondsBetween(w, hub, [leaves[0]!])[0]!;
    w.bonds.delete(lost);
    hub.bonds.delete(lost);
    leaves[0]!.bonds.delete(lost);
    const armsAfter = starArmsAt(w, hub.id, SparkType.Line, spec)!;
    expect(armsAfter.whole).toBe(true);
    expect(armsAfter.leaves).toContain(spare.id);

    // A foreign shape never stands in.
    const w2 = worldInBuild();
    const s2 = star(w2, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE - 1, 500, 300);
    bond(w2, s2.hub, mk(w2, SparkType.Triangle, 530, 330));
    const partial = starArmsAt(w2, s2.hub.id, SparkType.Line, spec)!;
    expect(partial.whole).toBe(false);
    expect(partial.bonds).toHaveLength(TURRET_HUB_DEGREE - 1);
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

  it('ringCycleAt returns the ORIGINAL ring even when a chord weld opens a second 5-cycle', () => {
    const w = worldInBuild();
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    // X bonded to nodes 0 and 2 makes 0-X-2-3-4-0 a second simple 5-cycle through node 0.
    const x = mk(w, SparkType.Triangle, 520, 290);
    bond(w, x, nodes[0]!);
    bond(w, x, nodes[2]!);
    const cycle = ringCycleAt(w, nodes[0]!.id, SparkType.Triangle, 5)!;
    expect([...cycle].sort(byId)).toEqual(nodes.map((n) => n.id).sort(byId));
    // …and with the original ring broken, the weld's cycle keeps it standing.
    const cut = bondsBetween(w, nodes[0]!, [nodes[1]!])[0]!;
    w.bonds.delete(cut);
    nodes[0]!.bonds.delete(cut);
    nodes[1]!.bonds.delete(cut);
    const again = ringCycleAt(w, nodes[0]!.id, SparkType.Triangle, 5)!;
    expect(again).toContain(x.id);
    expect(again).toHaveLength(5);
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
  it('both stand, both emit, FIX is refused, and the welded pool is larger', () => {
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
    for (const y of [286, 300, 314]) placeLikeAPlayer(w, type, { x: 510, y });
    const comp = componentOf(w.primitives.get(a)!, w.primitives, w.bonds);
    expect(comp.primitiveIds.has(b), 'the drops weld the two towers into ONE structure').toBe(true);

    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'BOTH towers stand').toBe(2);

    // "a lot harder to destroy": the welded pool is the WHOLE welded structure's.
    const poolAfter = structurePoolFifths(comp.bondIds.size);
    expect(poolAfter, 'the welded pool is larger than two towers apart').toBeGreaterThan(poolBefore * 2);

    // "they cannot be repaired either"
    expect(planStructureRepair(w, P0, a), 'welded: no FIX').toBeNull();
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: a });
    expect(w.bonds.get(aBond)!.damageFifths, 'the reducer refuses too').toBe(5);

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
  it('the weld survives the release; the boss walks out; the nine are razed', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const race = raceOf(w, P0);
    const type = RACE_FEED_SHAPE[race];
    const nodes = ring(w, type, T9_TOWER_SIZE, 500, 400, 64);
    tick(w, st, 2);
    const sp = [...w.creatureSpawners.values()].find((x) => x.recipeId === T9_TOWER_IDS[race]);
    expect(sp, 'the nine-ring ignites').toBeDefined();
    const weld = placeLikeAPlayer(w, type, { x: 500, y: 400 - 64 - 20 });
    expect(neighbours(w, weld).some((id) => nodes.some((n) => n.id === id))).toBe(true);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.has(sp!.id), 'the welded nine-ring stands').toBe(true);

    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.creatureSpawners.get(sp!.id)!.nextSpawnTick = w.tick;
    tick(w, st, 3);
    expect(w.creatureSpawners.has(sp!.id), 'released, so the tower is gone').toBe(false);
    expect([...w.creatures.values()].some((c) => c.type === T9_BOSS_TYPE[race]), 'the boss walked out').toBe(true);
    for (const n of nodes) expect(w.primitives.has(n.id), `ring node ${n.id} is razed`).toBe(false);
    expect(w.primitives.has(weld.id), "the weld is the player's — it is NOT razed").toBe(true);
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
// THE SPARE RULE, THROUGH THE HOST TICK — exactly when a cut levels a tower and when a weld takes over.
// See `S189_CANON_NOTES_weld.md` §A for the rule these two cases (and the two "cut levels" cases
// above) pin between them.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe('⚖ THE SPARE RULE — a cut levels a tower UNLESS a weld completes its own recipe again', () => {
  it('STAR: a 7th Spiral welded to the turret HUB takes over when an own Spiral arm is cut', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const { hub, leaves } = star(w, SparkType.Line, SparkType.Spiral, TURRET_HUB_DEGREE, 500, 300);
    tick(w, st, 2);
    expect(w.defenders.size).toBe(1);
    const spare = mk(w, SparkType.Spiral, 530, 330);
    bond(w, hub, spare); // a weld of the arm type, on the hub itself, AFTER ignition
    const arm = bondsBetween(w, hub, [leaves[0]!])[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: arm, playerId: P1, cause: 'creature' });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'six Spiral arms on the hub again — the recipe is contained').toBe(1);
    expect(towerMembersAt(w, 'laserTurret', hub.id)!.prims).toContain(spare.id);
  });

  it('RING: a Triangle bridging nodes 0 and 2 takes over when the pentagram edge 0–1 is cut', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const nodes = ring(w, SparkType.Triangle, 5, 500, 300);
    tick(w, st, 2);
    const anchor = [...w.creatureSpawners.values()][0]!.anchorPrimitiveId;
    expect(anchor).toBe(nodes[0]!.id);
    const x = mk(w, SparkType.Triangle, 520, 290);
    bond(w, x, nodes[0]!);
    bond(w, x, nodes[2]!); // 0-X-2-3-4 is a second simple 5-cycle through the anchor
    const cut = bondsBetween(w, nodes[0]!, [nodes[1]!])[0]!;
    dispatch(w, { type: 'SEVER_BOND', bondId: cut, playerId: P1, cause: 'creature' });
    tick(w, st, PAST_TWO_POLLS);
    expect(w.creatureSpawners.size, 'a 5-cycle of Triangles still runs through the anchor').toBe(1);
    expect(towerMembersAt(w, 'pentagram', anchor)!.prims).toContain(x.id);
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

  /** What a player does every BUILD: build something — a bonded pair far from the hall. */
  function buildSomethingElsewhere(w: World): void {
    placeLikeAPlayer(w, SparkType.Dot, { x: 300, y: 760 });
    placeLikeAPlayer(w, SparkType.Dot, { x: 330, y: 760 }); // bonds to the first → BOND_FORMED
  }

  function killHelga(w: World): void {
    const h = [...w.defenders.values()].find((d) => d.kind === 'princess')!;
    damageEntity(w, { kind: 'defender', id: h.id }, h.ehp!, 'creature', null);
    expect([...w.defenders.values()].some((d) => d.kind === 'princess'), 'she is dead').toBe(false);
  }

  it('⭐ weld a shape onto her HALL, let her die, and she re-summons for the next fight', () => {
    const w = worldInBuild();
    const st = makeHostTickState(w);
    const { hub } = hall(w, st);
    const weld = placeLikeAPlayer(w, SparkType.Square, { x: 520, y: 318 });
    expect(neighbours(w, weld), 'the weld is on the HUB').toContain(hub.id);
    expect(isHelgaComponent(w, hub.id), 'the EXACT build test would refuse this hall').toBe(false);
    tick(w, st, PAST_TWO_POLLS);
    expect(w.defenders.size, 'the welded hall stands').toBe(1);

    nextPhase(w, st); // → FIGHT
    killHelga(w);
    tick(w, st, 5);
    expect(w.defenders.size, 'no re-summon inside the fight she died in (S157 B6)').toBe(0);

    nextPhase(w, st); // → BUILD
    buildSomethingElsewhere(w);
    tick(w, st, 3);
    const back = [...w.defenders.values()].filter((d) => d.kind === 'princess');
    expect(back.length, 'she is back for the next fight').toBe(1);
    expect(back[0]!.anchorPrimitiveId, 'on the same hall').toBe(hub.id);

    nextPhase(w, st); // → FIGHT
    expect([...w.defenders.values()].some((d) => d.kind === 'princess'), 'and she fights it').toBe(true);
  });

  it('⛔ cut one of the hall\'s OWN connectors: the hall falls and she does NOT return', () => {
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
    buildSomethingElsewhere(w);
    tick(w, st, 3);
    expect([...w.defenders.values()].some((d) => d.kind === 'princess'), 'no hall, no Helga').toBe(false);
  });
});

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
