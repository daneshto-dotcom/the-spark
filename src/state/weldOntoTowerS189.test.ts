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
import { TURRET_HUB_DEGREE } from './godlyRecipes/laserTurret.ts';
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

function mk(w: World, type: SparkType, x: number, y: number): Primitive {
  const player = w.players.get(P0)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type, placerColor: player.color, placedBy: P0, createdTick: w.tick,
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
): { hub: Primitive; leaves: Primitive[] } {
  const hub = mk(w, hubType, cx, cy);
  const leaves: Primitive[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const leaf = mk(w, leafType, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
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
function placeLikeAPlayer(w: World, type: SparkType, at: Vec2): Primitive {
  const spark = makeFreeSpark({
    id: asSparkId(sparkSeq++), type, pos: { x: at.x, y: at.y }, velocity: { x: 0, y: 0 },
    dt: 1 / 60, createdTick: w.tick,
  });
  dispatch(w, { type: 'SPAWN_SPARK', spark });
  const color = w.players.get(P0)!.color;
  const targetId = pickPrimitiveInRange(w, AUTO_BOND_RADIUS, at, color);
  const target = targetId !== null ? w.primitives.get(targetId) ?? null : null;
  const before = new Set(w.primitives.keys());
  dispatch(w, {
    type: 'PLACE_FROM_FREE',
    sparkId: spark.id,
    playerId: P0,
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
