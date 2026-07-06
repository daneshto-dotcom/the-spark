/**
 * SPARK — S118 P3 (F1b/F2) territory perf DIFFERENTIAL harness (Council S118 Q3 GATE-STRENGTHENED).
 *
 * F1b replaced the per-player `componentOf` BFS (rebuilt per unvisited primitive) with ONE global
 * union-find labeling pass reused across all players; F2 reuses the resulting radius map across the
 * per-tick influence pass + per-placement enemy check. This must be BYTE-IDENTICAL. The Council (both
 * models REJECTed the naive gate) required proving not just the final complexity/count but the CANONICAL
 * partition (min-id-root primitive→component map) AND the full post-influence stiffness map bit-exact
 * against a `componentOf`-derived reference (componentOf itself is UNCHANGED by F1b). This harness runs
 * 400 random worlds and asserts all four surfaces via Object.is:
 *   1. computeComponentRoots       === reference canonical partition (min id per component)
 *   2. computePlayerComplexity     === reference old per-player algorithm
 *   3. computeTerritorialRadius    === reference old radius (incl. shrink debuff)
 *   4. post-computeTerritorialInfluence bond stiffnessMultiplier map === reference influence map
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import {
  computeComponentRoots,
  computePlayerComplexity,
  computeTerritorialRadius,
  computeTerritorialInfluence,
} from './territory.ts';
import {
  TERRITORY_BASE_RADIUS,
  TERRITORY_ENGULF_STIFFNESS,
  TERRITORY_RADIUS_SCALE,
  SparkType,
} from '../constants.ts';
import { componentOf } from '../game/structure.ts';
import { asPlayerId, asPrimitiveId, asBondId, type PlayerId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { PhysicsBody } from '../physics/bonds.ts';

// ── seeded PRNG (mulberry32) — reproducible random worlds ──────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addPrimAt(world: World, playerIndex: 0 | 1, x: number, y: number): Primitive {
  const player = world.players.get(asPlayerId(playerIndex))!;
  const primId = asPrimitiveId(world.nextPrimitiveId++);
  const prim: Primitive = {
    id: primId,
    type: SparkType.Square,
    placerColor: player.color,
    placedBy: player.id,
    createdTick: world.tick,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: player.color,
    lastOwnershipChange: 0,
    radius: 9,
  };
  world.primitives.set(primId, prim);
  return prim;
}

function bondPrims(world: World, a: Primitive, b: Primitive): void {
  const bondId = asBondId(world.nextBondId++);
  const bond = {
    id: bondId,
    aId: a.id,
    bId: b.id,
    a: a as unknown as PhysicsBody & { id: never },
    b: b as unknown as PhysicsBody & { id: never },
    restLength: Math.max(20, Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y)),
    stiffnessTier: 'MID' as const,
    createdTick: world.tick,
  };
  world.bonds.set(bondId, bond as Parameters<typeof world.bonds.set>[1]);
  a.bonds.add(bondId);
  b.bonds.add(bondId);
}

/** Build a random 2-player world: random prims + random same-color bonds (respecting Sym-D). */
function randomWorld(rng: () => number): World {
  const w = makeWorld(Math.floor(rng() * 1e9));
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true }); // seeds players 0 (RED) + 1 (CYAN)
  w.gameState = 'PLAYING';
  w.tick = Math.floor(rng() * 600);
  for (const idx of [0, 1] as const) {
    const n = Math.floor(rng() * 8); // 0..7 prims for this player
    const prims: Primitive[] = [];
    for (let i = 0; i < n; i++) {
      prims.push(addPrimAt(w, idx, 100 + rng() * 800, 100 + rng() * 600));
    }
    // Random same-color bonds: each pair connected with ~35% prob → random components + singletons.
    for (let i = 0; i < prims.length; i++) {
      for (let j = i + 1; j < prims.length; j++) {
        if (rng() < 0.35) bondPrims(w, prims[i], prims[j]);
      }
    }
    // Occasionally arm the shrink debuff so the radius shrink path is exercised in both impls.
    if (rng() < 0.3) {
      const player = w.players.get(asPlayerId(idx))!;
      player.territorialShrinkUntilTick = w.tick + Math.floor(rng() * 200) - 50; // may be past or future
    }
  }
  return w;
}

// ── reference implementations = the PRE-F1b algorithm (componentOf-based) ──────
function refComponentRoots(world: World): Map<number, number> {
  const roots = new Map<number, number>();
  for (const [id, prim] of world.primitives) {
    const comp = componentOf(prim, world.primitives, world.bonds);
    let min = id as number;
    for (const pid of comp.primitiveIds) if ((pid as number) < min) min = pid as number;
    roots.set(id as number, min);
  }
  return roots;
}

function refComplexity(playerId: PlayerId, world: World): number {
  const player = world.players.get(playerId);
  if (player === undefined) return 0;
  let primCount = 0;
  const myPrimIds = new Set<number>();
  for (const [id, prim] of world.primitives) {
    if (prim.placerColor === player.color) {
      primCount++;
      myPrimIds.add(id as number);
    }
  }
  if (primCount === 0) return 0;
  let bondCount = 0;
  for (const bond of world.bonds.values()) {
    if (myPrimIds.has(bond.aId as number) && myPrimIds.has(bond.bId as number)) bondCount++;
  }
  let componentCount = 0;
  const visited = new Set<number>();
  for (const [id, prim] of world.primitives) {
    if (prim.placerColor !== player.color) continue;
    if (visited.has(id as number)) continue;
    const comp = componentOf(prim, world.primitives, world.bonds);
    for (const pid of comp.primitiveIds) visited.add(pid as number);
    componentCount++;
  }
  return primCount + 0.5 * bondCount + 0.1 * componentCount;
}

function refRadius(playerId: PlayerId, world: World): number {
  const player = world.players.get(playerId);
  if (player === undefined) return 0;
  let hasPrims = false;
  for (const prim of world.primitives.values()) {
    if (prim.placerColor === player.color) {
      hasPrims = true;
      break;
    }
  }
  if (!hasPrims) return 0;
  const complexity = refComplexity(playerId, world);
  let R = TERRITORY_BASE_RADIUS + TERRITORY_RADIUS_SCALE * Math.log2(complexity + 1);
  if (
    player.territorialShrinkUntilTick !== null &&
    world.tick < player.territorialShrinkUntilTick
  ) {
    R *= 0.5;
  }
  return R;
}

/** Reference influence: the pre-F1b Phase-1/Phase-2 logic into a bondId→multiplier map (no mutation). */
function refInfluenceMap(world: World): Map<number, number> {
  const mult = new Map<number, number>();
  for (const bond of world.bonds.values()) mult.set(bond.id as number, 1.0);
  for (const [pid, player] of world.players) {
    const R = refRadius(pid, world);
    if (R <= 0) continue;
    const R2 = R * R;
    const anchors: Array<{ x: number; y: number }> = [];
    for (const prim of world.primitives.values()) {
      if (prim.placerColor === player.color) anchors.push({ x: prim.pos.x, y: prim.pos.y });
    }
    if (anchors.length === 0) continue;
    for (const bond of world.bonds.values()) {
      if ((mult.get(bond.id as number) ?? 1.0) <= TERRITORY_ENGULF_STIFFNESS) continue;
      const primA = world.primitives.get(bond.aId);
      const primB = world.primitives.get(bond.bId);
      if (primA === undefined || primB === undefined) continue;
      if (primA.placerColor === player.color || primB.placerColor === player.color) continue;
      let inside = false;
      const ax = bond.a.pos.x;
      const ay = bond.a.pos.y;
      const bx = bond.b.pos.x;
      const by = bond.b.pos.y;
      for (const anchor of anchors) {
        const dax = ax - anchor.x;
        const day = ay - anchor.y;
        if (dax * dax + day * day < R2) {
          inside = true;
          break;
        }
        const dbx = bx - anchor.x;
        const dby = by - anchor.y;
        if (dbx * dbx + dby * dby < R2) {
          inside = true;
          break;
        }
      }
      if (inside) mult.set(bond.id as number, TERRITORY_ENGULF_STIFFNESS);
    }
  }
  return mult;
}

describe('S118 P3 — F1b/F2 territory perf differential (byte-identical to the pre-F1b algorithm)', () => {
  it('canonical partition + complexity + radius + post-influence stiffness map are all bit-exact (400 worlds)', () => {
    const rng = mulberry32(0x5eed1b);
    const players: PlayerId[] = [asPlayerId(0), asPlayerId(1)];
    for (let iter = 0; iter < 400; iter++) {
      const w = randomWorld(rng);

      // (1) Canonical (min-id-root) partition bit-exact.
      const newRoots = computeComponentRoots(w);
      const expRoots = refComponentRoots(w);
      expect(newRoots.size).toBe(expRoots.size);
      for (const [id, root] of expRoots) expect(newRoots.get(id)).toBe(root);

      // (2) Per-player complexity + (3) radius bit-exact (Object.is via .toBe).
      for (const pid of players) {
        expect(Object.is(computePlayerComplexity(pid, w), refComplexity(pid, w))).toBe(true);
        expect(Object.is(computeTerritorialRadius(pid, w), refRadius(pid, w))).toBe(true);
      }

      // (4) Full post-influence bond stiffnessMultiplier map bit-exact.
      const expMult = refInfluenceMap(w);
      computeTerritorialInfluence(w); // mutates w.bonds
      for (const bond of w.bonds.values()) {
        expect(Object.is(bond.stiffnessMultiplier, expMult.get(bond.id as number))).toBe(true);
      }
    }
  });
});
