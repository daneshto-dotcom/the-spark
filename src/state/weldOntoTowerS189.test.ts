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
import { towerMembersAt, towerShapeFor, towerStandsAt } from './towerMembers.ts';
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
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { blueprintBill } from './blueprints.ts';
import { makeCastleBank } from './castleBank.ts';
import { makeCreature } from './creatures/creature.ts';
import { CHEWER_CONFIG } from './creatures/voltkin-config.ts';
import { asCreatureId, asSpawnerId } from '../types.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
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
     * ⚠ THE DROP IS AIMED AT THE GOBLIN TOWER'S LEAF, AND THAT IS NOT INCIDENTAL. `placePrimitive`'s
     * S107 P4 "locked ring" refuses to MERGE a placement into a live SPAWNER's component (it was the
     * old mitigation for exactly the defect S189 fixes). So the square's PRIMARY bond goes into the
     * spawner — allowed on the local path — and the merge sweep then reaches the turret, a DEFENDER,
     * which is not locked. The reverse drop welds nothing; that lock is reported, not changed here.
     */
    const sq = placeLikeAPlayer(w, SparkType.Square, { x: 566, y: 300 });
    expect(neighbours(w, sq)).toContain(goblin.leaves[2]!.id);
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
     * ⚠ PLACEMENT CANNOT MAKE THIS WELD TODAY, and the case says so rather than hiding it: the S107 P4
     * lock refuses to merge a drop into a second live spawner, so a triangle dropped between the rings
     * bonds to ring A only. The weld below is therefore minted directly — it is the SURVIVAL rule that
     * is under test, and a welded pair must stand however the weld came to exist. The lock itself is
     * reported for the merge owner (it now blocks the R185-B "weld two bat towers" play for spawners).
     */
    const dropped = placeLikeAPlayer(w, SparkType.Triangle, { x: 560, y: 286.9 });
    const nd = neighbours(w, dropped);
    expect(nd.some((id) => a.some((p) => p.id === id)), 'the drop reaches ring A').toBe(true);
    expect(nd.some((id) => b.some((p) => p.id === id)), 'but S107 P4 refuses the merge into ring B').toBe(false);
    const t = mk(w, SparkType.Triangle, 560, 300);
    bond(w, t, a[1]!);
    bond(w, t, b[4]!);

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
    // R136 keeps the race rings; the Voltkin is a cinematic, not a standing tower.
    expect(towerShapeFor('t3TowerVampires')).toBeNull();
    expect(towerShapeFor('t9TowerDemons')).toBeNull();
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
      if (w.matchPhase === 'FIGHT') sawFight = true;
      if (!secondEdge && w.matchPhase === 'FIGHT') {
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
    }
  });
});
