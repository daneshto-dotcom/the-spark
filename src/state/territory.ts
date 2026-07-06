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
import type { PlayerId, Vec2 } from '../types.ts';
import type { World } from './world.ts';

/**
 * S118 P3 (F1b) — ONE per-tick GLOBAL connected-component labeling for ALL primitives, via union-find
 * with union-by-MIN-id (so every component's root is its lowest primitive id → a CANONICAL partition,
 * independent of iteration order). Returns primId → canonical-root map.
 *
 * Replaces the pre-F1b per-player `componentOf` BFS (rebuilt from scratch for every unvisited primitive,
 * inside computePlayerComplexity, itself called per-player per-tick — O(P·prims·BFS)/tick on the host).
 * Sym-D guarantees every bond is same-color, so each component is single-color; counting distinct roots
 * among a color's prims therefore equals the old per-player component count (byte-identical — see the
 * differential test). Dangling bonds (an endpoint primitive missing) are skipped, matching componentOf's
 * `primitives.get(otherId) === undefined` skip. Exported so the differential test can assert the
 * partition is bit-exact against a componentOf-derived reference (Council S118 Q3 gate).
 */
export function computeComponentRoots(world: World): Map<number, number> {
  const parent = new Map<number, number>();
  for (const id of world.primitives.keys()) parent.set(id as number, id as number);
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // Path-compress the chain to the root.
    let c = x;
    while (c !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const bond of world.bonds.values()) {
    const a = bond.aId as number;
    const b = bond.bId as number;
    if (!parent.has(a) || !parent.has(b)) continue; // dangling bond → skip (componentOf parity)
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      // Union by MIN id → root is the lowest primitive id (canonical, order-independent).
      if (ra < rb) parent.set(rb, ra);
      else parent.set(ra, rb);
    }
  }
  const roots = new Map<number, number>();
  for (const id of world.primitives.keys()) roots.set(id as number, find(id as number));
  return roots;
}

/**
 * S118 P3 (F1b) — compute EVERY player's structural complexity in ONE pass (single global labeling +
 * single prim pass + single bond pass, bucketed by color), replacing the per-player re-walk. The final
 * per-player expression is kept VERBATIM from the pre-F1b code:
 *   complexity = primCount + 0.5 × bondCount + 0.1 × componentCount
 * so — given identical integer counts — the result is byte-identical by construction (no incremental
 * float accumulation to reorder). primCount = prims placed by the player's color; bondCount = bonds
 * whose BOTH endpoints are that color (Sym-D); componentCount = distinct component roots among that
 * color's prims. A player with no primitives maps to 0 (territory inactive), matching the old early-out.
 */
export function computeAllPlayerComplexities(world: World): Map<PlayerId, number> {
  const roots = computeComponentRoots(world);
  const primCountByColor = new Map<number, number>();
  const rootsByColor = new Map<number, Set<number>>();
  const bondCountByColor = new Map<number, number>();

  // One prim pass: bucket primCount + distinct component roots by placerColor.
  for (const [id, prim] of world.primitives) {
    const c = prim.placerColor;
    primCountByColor.set(c, (primCountByColor.get(c) ?? 0) + 1);
    let s = rootsByColor.get(c);
    if (s === undefined) {
      s = new Set<number>();
      rootsByColor.set(c, s);
    }
    s.add(roots.get(id as number)!);
  }

  // One bond pass: bucket same-color bondCount by color (dangling / cross-color bonds skipped — parity
  // with the old myPrimIds.has(aId) && myPrimIds.has(bId) check, which failed for missing / off-color).
  for (const bond of world.bonds.values()) {
    const pa = world.primitives.get(bond.aId);
    if (pa === undefined) continue;
    const pb = world.primitives.get(bond.bId);
    if (pb === undefined) continue;
    if (pa.placerColor !== pb.placerColor) continue;
    const c = pa.placerColor;
    bondCountByColor.set(c, (bondCountByColor.get(c) ?? 0) + 1);
  }

  const result = new Map<PlayerId, number>();
  for (const [playerId, player] of world.players) {
    const c = player.color;
    const primCount = primCountByColor.get(c) ?? 0;
    if (primCount === 0) {
      result.set(playerId, 0);
      continue;
    }
    const bondCount = bondCountByColor.get(c) ?? 0;
    const componentCount = rootsByColor.get(c)?.size ?? 0;
    result.set(playerId, primCount + 0.5 * bondCount + 0.1 * componentCount);
  }
  return result;
}

/**
 * S118 P3 (F2) — compute EVERY player's territorial radius in ONE pass from the shared per-tick
 * complexity map, so the per-tick influence pass + per-placement enemy check reuse it instead of
 * re-deriving complexity per player/enemy. Formula kept VERBATIM. A 0-complexity (no-prims) player maps
 * to radius 0 (territory inactive), matching the old !hasPrims early-out; shrink halves an active radius.
 */
export function computeAllPlayerRadii(world: World): Map<PlayerId, number> {
  const complexities = computeAllPlayerComplexities(world);
  const radii = new Map<PlayerId, number>();
  for (const [playerId, player] of world.players) {
    const complexity = complexities.get(playerId) ?? 0;
    if (complexity === 0) {
      radii.set(playerId, 0);
      continue;
    }
    let R = TERRITORY_BASE_RADIUS + TERRITORY_RADIUS_SCALE * Math.log2(complexity + 1);
    if (
      player.territorialShrinkUntilTick !== null &&
      world.tick < player.territorialShrinkUntilTick
    ) {
      R *= 0.5;
    }
    radii.set(playerId, R);
  }
  return radii;
}

/**
 * Compute the structural complexity of a player's holdings (single source of truth = the one-pass
 * computeAllPlayerComplexities; S118 P3 F1b). Byte-identical to the pre-F1b per-player walk.
 *   complexity = primCount + 0.5 × bondCount + 0.1 × componentCount
 * Returns 0 if the player has no primitives (territory is inactive) or is unknown.
 */
export function computePlayerComplexity(playerId: PlayerId, world: World): number {
  return computeAllPlayerComplexities(world).get(playerId) ?? 0;
}

/**
 * Compute the territorial radius for a player (single source of truth = the one-pass
 * computeAllPlayerRadii; S118 P3 F2). Returns 0 if the player has no primitives (territory is inactive —
 * game starts with no territory) or is unknown. The shrink debuff (territorialShrinkUntilTick) halves R
 * inside computeAllPlayerRadii. Byte-identical to the pre-F2 per-player derivation.
 */
export function computeTerritorialRadius(playerId: PlayerId, world: World): number {
  return computeAllPlayerRadii(world).get(playerId) ?? 0;
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

  // S118 P3 (F2) — derive every enemy's radius from ONE shared complexity/radius pass instead of
  // re-deriving complexity per enemy on each placement. Byte-identical value.
  const radii = computeAllPlayerRadii(world);
  for (const [enemyId, enemy] of world.players) {
    if (enemyId === localPlayerId) continue;
    const R = radii.get(enemyId) ?? 0;
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

  // S118 P3 (F1b/F2) — compute ALL players' radii ONCE (one global component-labeling pass, reused)
  // instead of re-deriving complexity+BFS per player inside the loop. Byte-identical value; the win is
  // removing the per-player O(prims·BFS) re-walk on the host every tick.
  const radii = computeAllPlayerRadii(world);

  // Phase 2: for each player's territory, degrade enemy bonds inside it.
  for (const [playerId, player] of world.players) {
    const R = radii.get(playerId) ?? 0;
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
