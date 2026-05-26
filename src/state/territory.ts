/**
 * SPARK — Territorial Repulsion system (Sym F, S49 P1).
 *
 * A player's placed structures "own" space around them. The owned radius R
 * grows with structural complexity, blocking enemy placement (hard block)
 * and degrading enemy bonds inside the zone (engulf-warp: sluggish bonds).
 *
 * §10.2 NOTE: computeTerritorialInfluence() mutates bond.stiffnessMultiplier
 * outside the dispatch cycle. This is intentional and §10.2-compliant:
 * stiffnessMultiplier is an ephemeral per-tick physics parameter (like
 * pos/prevPos mutated by verletStepAll), NOT canonical game state. It is
 * recalculated from first principles every tick and carries no
 * inter-tick identity. The dispatch invariant governs game state mutations;
 * per-tick physics derived quantities are exempt.
 *
 * Design (user-locked S46/S47):
 *   complexity  = primCount + 0.5 × bondCount + 0.1 × componentCount
 *   R           = TERRITORY_BASE_RADIUS + TERRITORY_RADIUS_SCALE × log₂(complexity + 1)
 *   hard block  = silent rejection when spark.pos is within R of any enemy prim
 *   engulf-warp = bond.stiffnessMultiplier set to TERRITORY_ENGULF_STIFFNESS (0.3)
 *                 for enemy bonds where at least one endpoint is inside a
 *                 friendly territorial radius
 *   shrink debuff = SHRINK_TERRITORY action halves R for TERRITORY_SHRINK_DURATION_TICKS
 *
 * Council Battle Ledger (S49):
 *   C1 ADOPT per-bond stiffnessMultiplier (C2 pre-collect optimization applied)
 *   C3 ADD diagnostics.territoryBlockRejects counter
 *   C7 ADOPT extract constants (TERRITORY_BASE_RADIUS, TERRITORY_RADIUS_SCALE,
 *      TERRITORY_ENGULF_STIFFNESS, TERRITORY_SHRINK_DURATION_TICKS)
 *   C8 ADOPT enemy-color filter (only degrade bonds both endpoints enemy-owned)
 */

import {
  TERRITORY_BASE_RADIUS,
  TERRITORY_ENGULF_STIFFNESS,
  TERRITORY_RADIUS_SCALE,
} from '../constants.ts';
import { componentOf } from '../game/structure.ts';
import type { PlayerId, Vec2 } from '../types.ts';
import type { World } from './world.ts';

/**
 * Compute the structural complexity of a player's holdings.
 *   complexity = primCount + 0.5 × bondCount + 0.1 × componentCount
 *
 * - primCount:      all primitives placed by this player
 * - bondCount:      bonds where BOTH endpoints are this player's color
 *                   (Sym D invariant: all bonds are same-color, so this is
 *                   all bonds connected only to same-color prims)
 * - componentCount: distinct connected components wholly owned by this player
 *                   (count of isolated structure islands)
 *
 * Returns 0 if the player has no primitives (territory is inactive).
 */
export function computePlayerComplexity(playerId: PlayerId, world: World): number {
  const player = world.players.get(playerId);
  if (player === undefined) return 0;

  // Collect this player's primitives in a Set for fast membership test.
  let primCount = 0;
  const myPrimIds = new Set<number>();
  for (const [id, prim] of world.primitives) {
    if (prim.placerColor === player.color) {
      primCount++;
      myPrimIds.add(id as number);
    }
  }
  if (primCount === 0) return 0;

  // Count bonds where both endpoints belong to this player.
  let bondCount = 0;
  for (const bond of world.bonds.values()) {
    if (myPrimIds.has(bond.aId as number) && myPrimIds.has(bond.bId as number)) {
      bondCount++;
    }
  }

  // Count distinct connected components (BFS / componentOf over unvisited prims).
  // Council C4: use count of components (locked spec). Future tuning: Σ(size^1.5)
  // noted in LOCKED_DECISIONS.md §Sym F.
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

/**
 * Compute the territorial radius for a player. Returns 0 if the player has
 * no primitives (territory is inactive — game starts with no territory).
 *
 * Applies the shrink debuff (territorialShrinkUntilTick) by halving R when
 * the debuff is active at the current tick.
 */
export function computeTerritorialRadius(playerId: PlayerId, world: World): number {
  const player = world.players.get(playerId);
  if (player === undefined) return 0;

  // Check if this player has any primitives.
  let hasPrims = false;
  for (const prim of world.primitives.values()) {
    if (prim.placerColor === player.color) { hasPrims = true; break; }
  }
  if (!hasPrims) return 0;

  const complexity = computePlayerComplexity(playerId, world);
  let R = TERRITORY_BASE_RADIUS + TERRITORY_RADIUS_SCALE * Math.log2(complexity + 1);

  // Apply shrink debuff if active.
  if (
    player.territorialShrinkUntilTick !== null &&
    world.tick < player.territorialShrinkUntilTick
  ) {
    R *= 0.5;
  }

  return R;
}

/**
 * Returns true if `pos` is inside any enemy player's territorial radius.
 * Enemy = any player whose color differs from the player at `localPlayerId`.
 *
 * Called by:
 *   - controls.ts LMB-up path (optimistic client gate, snapshot-lagged)
 *   - placePrimitive.ts (host-authoritative hard block)
 *
 * Performance: O(enemies × enemy_prims) per call. Pre-collects enemy
 * primitive positions once per call (not per distance check) per Council
 * C2 optimization. Bounded by game primitive soft-cap (~30 prims/player
 * at WIN threshold) — negligible cost.
 */
export function isInsideEnemyTerritory(
  pos: Vec2,
  localPlayerId: PlayerId,
  world: World,
): boolean {
  const localPlayer = world.players.get(localPlayerId);
  if (localPlayer === undefined) return false;

  for (const [enemyId, enemy] of world.players) {
    if (enemyId === localPlayerId) continue;
    const R = computeTerritorialRadius(enemyId, world);
    if (R <= 0) continue;
    const R2 = R * R;
    // Pre-collect enemy prim positions (Council C2: once per enemy per call).
    for (const prim of world.primitives.values()) {
      if (prim.placerColor !== enemy.color) continue;
      const dx = pos.x - prim.pos.x;
      const dy = pos.y - prim.pos.y;
      if (dx * dx + dy * dy < R2) return true; // early exit on first hit
    }
  }
  return false;
}

/**
 * Per-tick territorial influence pass. Must be called BEFORE solveBonds.
 *
 * For each player:
 *   1. Compute territorial radius R.
 *   2. Pre-collect this player's primitive positions ("territory anchors").
 *   3. For each bond that belongs to the enemy (both endpoints enemy-colored):
 *      If any bond endpoint is inside this player's territory → degrade bond
 *      stiffness to TERRITORY_ENGULF_STIFFNESS.
 *
 * Reset: all bonds reset to stiffnessMultiplier = 1.0 at the start of each
 * call before any degradation is applied. This ensures no stale state leaks
 * across ticks even if territory changes (e.g., shrink debuff expires).
 *
 * Note: Sym D invariant guarantees all bonds are same-color (no cross-color
 * bonds exist), so "bond belongs to enemy" ≡ both endpoints have enemy color.
 */
export function computeTerritorialInfluence(world: World): void {
  // Phase 1: reset all bonds to nominal stiffness.
  for (const bond of world.bonds.values()) {
    bond.stiffnessMultiplier = 1.0;
  }

  // Phase 2: for each player's territory, degrade enemy bonds inside it.
  for (const [playerId, player] of world.players) {
    const R = computeTerritorialRadius(playerId, world);
    if (R <= 0) continue;
    const R2 = R * R;

    // Pre-collect this player's primitive positions once (Council C2).
    const anchorPositions: Array<{ x: number; y: number }> = [];
    for (const prim of world.primitives.values()) {
      if (prim.placerColor === player.color) {
        anchorPositions.push({ x: prim.pos.x, y: prim.pos.y });
      }
    }
    if (anchorPositions.length === 0) continue;

    // Check each bond: degrade if it belongs to an enemy AND any endpoint
    // is inside this player's territorial radius.
    for (const bond of world.bonds.values()) {
      // Already maximally degraded — skip (handles overlap of two territories).
      if ((bond.stiffnessMultiplier ?? 1.0) <= TERRITORY_ENGULF_STIFFNESS) continue;

      // Enemy-color filter (Council C8): both endpoints must have enemy color.
      // Fetching prim color from world.primitives for color check only.
      const primA = world.primitives.get(bond.aId);
      const primB = world.primitives.get(bond.bId);
      if (primA === undefined || primB === undefined) continue;
      // Skip own bonds (both endpoints share this player's color).
      if (primA.placerColor === player.color || primB.placerColor === player.color) continue;

      // Check if endpoint A or B is inside this player's territory.
      let inside = false;
      const ax = bond.a.pos.x;
      const ay = bond.a.pos.y;
      const bx = bond.b.pos.x;
      const by = bond.b.pos.y;
      for (const anchor of anchorPositions) {
        const dax = ax - anchor.x;
        const day = ay - anchor.y;
        if (dax * dax + day * day < R2) { inside = true; break; }
        const dbx = bx - anchor.x;
        const dby = by - anchor.y;
        if (dbx * dbx + dby * dby < R2) { inside = true; break; }
      }
      if (inside) {
        bond.stiffnessMultiplier = TERRITORY_ENGULF_STIFFNESS;
      }
    }
  }
}
