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
import type { Bond } from '../physics/bonds.ts';
import type { PlayerId, Vec2 } from '../types.ts';
import type { World } from './world.ts';
import { sameTeam, sameTeamColor } from './teams.ts';

/**
 * S118 P3 (F1b) — ONE per-tick GLOBAL connected-component labeling for ALL primitives, via union-find
 * with union-by-MIN-id (so every component's root is its lowest primitive id → a CANONICAL partition,
 * independent of iteration order). Returns primId → canonical-root map.
 *
 * Replaces the pre-F1b per-player `componentOf` BFS (rebuilt from scratch for every unvisited primitive,
 * inside computePlayerComplexity, itself called per-player per-tick — O(P·prims·BFS)/tick on the host).
 * ⚠ S191 CORRECTION: this said "Sym-D guarantees every bond is same-color, so each component is
 * single-color". Cross-colour bonds are NOT impossible (a weld bonds two seats' shapes; `makeBond` checks
 * no colour; `structureRepair.ts` already handles "someone else's shape welded into this component"), so
 * a component CAN span colours. The equality still holds, for a different reason: `componentOf` follows
 * every bond whatever its colour, exactly as this union-find unions every bond, so both count "components
 * holding at least one of this colour's prims" — counting distinct roots among a color's prims therefore
 * equals the old per-player component count (byte-identical — see the differential test). Dangling bonds (an endpoint primitive missing) are skipped, matching componentOf's
 * `primitives.get(otherId) === undefined` skip. Exported so the differential test can assert the
 * partition is bit-exact against a componentOf-derived reference (Council S118 Q3 gate).
 *
 * ⚠ S191 — NO LONGER ON THE PER-TICK PATH. `computeAllPlayerComplexities` now labels components with its
 * own dense union-find (it needs only the COUNT per colour, not these min-id roots); this function and
 * its canonical-root contract are unchanged and still exported for the S118 partition test.
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
  /*
   * ⭐ S191 (`s191/perf`, owner C5) — THE SAME THREE COUNTS, WITHOUT THE PER-TICK MAPS. This runs every
   * tick (via `computeAllPlayerRadii`, from the influence pass) and was 5-12 % of a wave-5 host tick
   * AFTER the anchor grid (V8 profile, `S191_PROGRESS_perf.md`): `computeComponentRoots` built two
   * id-keyed Maps and path-compressed through them, then this pass re-read both. It now labels the
   * components with a union-find over a DENSE index (one pass over `world.primitives` numbers them, an
   * `Int32Array` holds the parents) and takes the same-colour bond count in the same bond pass.
   *
   * ⛔ IDENTICAL BY CONSTRUCTION (proven against the verbatim pass, `territoryReference.fixtures.ts`, by
   * `territoryComplexity.differential.test.ts` and the TERRITORY arm of `s191Perf.differential.test.ts`):
   *  · the partition is the connected components of the graph whose edges are the bonds with BOTH
   *    endpoints present — the same edge set `computeComponentRoots` unions (dangling bonds skipped);
   *    a partition does not depend on union order or on which member is the root, and only the NUMBER
   *    of distinct components among a colour's prims is read, never a root's identity;
   *  · primCount and the same-colour bondCount are the same integer counts over the same filters
   *    (a bond counts when both endpoints exist and share a colour);
   *  · the final expression below is untouched, fed the same integers → the same double; the result is
   *    keyed in `world.players` order, as before.
   * `computeComponentRoots` itself is unchanged and still exported (the S118 partition test and the
   * min-id-root contract are its own); this pass simply no longer needs its labels.
   */
  const n = world.primitives.size;
  const indexOf = new Map<number, number>();
  const colourOf: number[] = new Array<number>(n);
  const parent = new Int32Array(n);
  let next = 0;
  for (const [id, prim] of world.primitives) {
    indexOf.set(id as number, next);
    colourOf[next] = prim.placerColor;
    parent[next] = next;
    next++;
  }
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[x] !== r) {
      const up = parent[x]!;
      parent[x] = r;
      x = up;
    }
    return r;
  };

  const bondCountByColor = new Map<number, number>();
  // One bond pass: union the components AND bucket the same-color bondCount by color (dangling /
  // cross-color bonds skipped for the count — parity with the old myPrimIds.has(aId) && myPrimIds.has(bId)
  // check, which failed for missing / off-color; dangling bonds skipped for the union, as before).
  for (const bond of world.bonds.values()) {
    const a = indexOf.get(bond.aId as number);
    if (a === undefined) continue;
    const b = indexOf.get(bond.bId as number);
    if (b === undefined) continue;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      if (ra < rb) parent[rb] = ra;
      else parent[ra] = rb;
    }
    const c = colourOf[a]!;
    if (c !== colourOf[b]) continue;
    bondCountByColor.set(c, (bondCountByColor.get(c) ?? 0) + 1);
  }

  // One prim pass: bucket primCount + distinct component roots by placerColor.
  const primCountByColor = new Map<number, number>();
  const rootsByColor = new Map<number, Set<number>>();
  for (let k = 0; k < n; k++) {
    const c = colourOf[k]!;
    primCountByColor.set(c, (primCountByColor.get(c) ?? 0) + 1);
    let s = rootsByColor.get(c);
    if (s === undefined) {
      s = new Set<number>();
      rootsByColor.set(c, s);
    }
    s.add(find(k));
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
 * ⛔ S149 P1 — RETIRED AS THE BUILD-LEGALITY RULE. RETAINED, NOT DELETED. HAS NO PRODUCTION CALLER.
 *
 * ## Why it was retired
 *
 * This is an INFLUENCE BUBBLE, not a partition: an enemy's radius is derived from their structure
 * complexity, so an enemy who has built nothing near `pos` projects R = 0 and the point is
 * allowed. On an opening board nobody has built anything, so it allowed EVERY point to EVERY
 * player. That is precisely the owner's playtest report — *"there are no walls it seems or player
 * zones, players can build wherever"* — and it was never a bug in this function. It is a rule from
 * the pre-tower-defence game, still faithfully implementing the design it was written for.
 *
 * All six former callers now use `zones.canBuildAt`, which asks the only question the tower-defence
 * design has: is this the seat's own ground? See `buildLegalityGates.test.ts`, which pins all six.
 *
 * ## Why it is still here
 *
 * Owner ruling, S149: **delete nothing this session.** Retained deliberately and left exported +
 * tested. ⚠ TO A FUTURE SESSION: do not "clean up" this function without a ruling, and do NOT wire
 * it back into a build gate — `buildLegalityGates.test.ts` has a test named for the owner-reported
 * defect that exists to fail if the bubble ever returns. The rest of this module is NOT retired:
 * `computeTerritorialInfluence` still runs every tick and has eight live consumers.
 *
 * ---
 *
 * Returns true if `pos` is inside any enemy player's territorial radius.
 * Enemy = any player whose color differs from the player at `localPlayerId`.
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
    if (sameTeam(world, enemyId, localPlayerId)) continue; // S192 — a teammate's territory is not an enemy's
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
 * ⚠ S191 CORRECTION (Council S191 ledger) — CROSS-COLOUR BONDS DO EXIST. This note said "Sym D
 * invariant guarantees all bonds are same-color (no cross-color bonds exist), so 'bond belongs to
 * enemy' ≡ both endpoints have enemy color". False: a weld bonds two seats' shapes, and `makeBond`
 * checks no colour. What decides is the per-bond skip in Phase 2, and it is kept EXACTLY as it was: for
 * player P a bond is skipped when EITHER endpoint is P's colour, so a mixed X/Y bond is never engulfed
 * by X's or by Y's territory — only by a third seat's whose radius reaches it. A bond with an endpoint
 * missing from `world.primitives` is skipped for everyone. `territoryGrid.differential.test.ts` injects
 * welded mixed bonds into a real match and asserts they were visited.
 *
 * ⭐ S191 (`s191/perf`, owner C5: *"it was lagging at about wave five"*) — THE ANCHOR GRID. This pass
 * was the largest SELF time in a wave-5 host tick (13.6 % with 120 creatures, 15.0 % on the ordinary
 * board — V8 profile, `S191_PROGRESS_perf.md`), and all of it was the inner loop: every player × every
 * enemy bond × EVERY one of that player's primitives, per tick — almost all of it for bonds on the far
 * side of the board. Each player's anchors are now bucketed once per call (`buildAnchorGrid`) into
 * cells of side R + 1, and an endpoint is tested only against its own cell and the eight around it.
 *
 * ⛔ THE RESULT IS IDENTICAL BY CONSTRUCTION, NOT BY TOLERANCE (`territoryGrid.differential.test.ts`
 * proves it against the verbatim pre-change pass, `territoryReference.fixtures.ts`):
 *  · the output per bond is a BOOLEAN — "some anchor lies strictly within R of either endpoint" — so
 *    which anchor answers, and in what order, cannot matter (the old `break` was an early exit, never
 *    a tie-break). Players, bonds and the already-degraded skip run in the same order as before;
 *  · every anchor that IS tested is tested with the same arithmetic, op for op, on the same doubles
 *    (`ex - px`, squared, summed, `< R2`);
 *  · no anchor that could pass is skipped. If `dx*dx + dy*dy < R2` holds in doubles then |ex − px| < R
 *    exactly (rounding is monotone and R, R² are the very values compared), so the two cell indices
 *    differ by at most one: the 1 px of slack in the cell side is a gap of 1/(R+1) in cell units,
 *    against a division rounding of < 5e-10/(R+1) while |coord| ≤ 1e6;
 *  · outside that envelope — a non-finite or > 1e6 coordinate, or a grid wider than
 *    ANCHOR_GRID_MAX_CELLS — the old exhaustive test runs instead, so the argument above is never
 *    relied on where it does not hold.
 * Nothing persists between calls: the grid is built and dropped inside this function, so there is no
 * cache to go stale and no new state.
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

  // S191 — the Council C8 colour lookups, done ONCE per call instead of once per player per bond:
  // the bonds whose endpoints both exist (the only ones Phase 2 can degrade), in `world.bonds` order,
  // with their endpoints' colours. Nothing inside this function writes a colour or a Map.
  let candidates: Bond[] | null = null;
  const colourA: number[] = [];
  const colourB: number[] = [];

  // Phase 2: for each player's territory, degrade enemy bonds inside it.
  for (const [playerId, player] of world.players) {
    const R = radii.get(playerId) ?? 0;
    if (R <= 0) continue;
    const R2 = R * R;

    // Pre-collect this player's primitive positions once (Council C2) — into the S191 grid.
    const grid = buildAnchorGrid(world, player.color, R);
    if (grid === null) continue;

    if (candidates === null) {
      candidates = [];
      for (const bond of world.bonds.values()) {
        // Enemy-color filter (Council C8) needs both endpoints' colours from world.primitives.
        const primA = world.primitives.get(bond.aId);
        const primB = world.primitives.get(bond.bId);
        if (primA === undefined || primB === undefined) continue;
        candidates.push(bond);
        colourA.push(primA.placerColor);
        colourB.push(primB.placerColor);
      }
    }

    // Check each bond: degrade if it belongs to an enemy AND any endpoint
    // is inside this player's territorial radius.
    for (let i = 0; i < candidates.length; i++) {
      const bond = candidates[i]!;
      // Already maximally degraded — skip (handles overlap of two territories).
      if ((bond.stiffnessMultiplier ?? 1.0) <= TERRITORY_ENGULF_STIFFNESS) continue;
      // Skip own bonds (either endpoint is this player's colour) — ⭐ S192: or a TEAMMATE's colour, so a
      // territory never sags a friend's structure. FFA: `sameTeamColor` is exactly `===`.
      if (sameTeamColor(world, colourA[i], player.color) || sameTeamColor(world, colourB[i], player.color)) continue;

      // Check if endpoint A or B is inside this player's territory.
      if (
        anchorWithin(grid, bond.a.pos.x, bond.a.pos.y, R2) ||
        anchorWithin(grid, bond.b.pos.x, bond.b.pos.y, R2)
      ) {
        bond.stiffnessMultiplier = TERRITORY_ENGULF_STIFFNESS;
      }
    }
  }
}

/**
 * S191 — the grid's envelope. Inside ±ANCHOR_GRID_COORD_LIMIT the cell-index argument in
 * `computeTerritorialInfluence`'s docblock holds with ~9 orders of magnitude to spare; outside it (or
 * for NaN / ±Infinity, which fail every comparison) a point is tested exhaustively. The board is
 * 1920 × 1080, so a real match never leaves the envelope.
 */
const ANCHOR_GRID_COORD_LIMIT = 1e6;
/** S191 — above this many cells the grid is not built and the exhaustive test runs (a sanity cap, not
 *  a tuning knob: the full board at the smallest radius the formula allows is ~2 000 cells). */
const ANCHOR_GRID_MAX_CELLS = 65_536;

/** S191 — one player's anchors for one call. Positions are COPIED doubles (as `anchorPositions` was). */
interface AnchorGrid {
  /** Every anchor as [x0, y0, x1, y1, …], in `world.primitives` order — the exhaustive fallback. */
  readonly all: number[];
  /** Anchors outside the envelope as [x, y, …] — always tested exhaustively when the grid is used. */
  readonly loose: number[];
  /** `null` ⇒ no grid (nothing in the envelope, or too many cells): every query is exhaustive. */
  readonly start: Int32Array | null;
  /** Grid anchors as [x, y, …], bucketed by cell; cell c spans items[start[c] .. start[c+1]). */
  readonly items: Float64Array;
  readonly cell: number;
  readonly minCx: number;
  readonly minCy: number;
  readonly cols: number;
  readonly rows: number;
}

const inAnchorEnvelope = (x: number, y: number): boolean =>
  x >= -ANCHOR_GRID_COORD_LIMIT && x <= ANCHOR_GRID_COORD_LIMIT &&
  y >= -ANCHOR_GRID_COORD_LIMIT && y <= ANCHOR_GRID_COORD_LIMIT;

/** S191 — bucket `color`'s primitives into cells of side R + 1. `null` when the colour has none. */
function buildAnchorGrid(world: World, color: number, R: number): AnchorGrid | null {
  const all: number[] = [];
  for (const prim of world.primitives.values()) {
    if (prim.placerColor === color) all.push(prim.pos.x, prim.pos.y);
  }
  if (all.length === 0) return null;

  const cell = R + 1;
  const loose: number[] = [];
  const cxs: number[] = [];
  const cys: number[] = [];
  let minCx = Infinity;
  let maxCx = -Infinity;
  let minCy = Infinity;
  let maxCy = -Infinity;
  for (let k = 0; k < all.length; k += 2) {
    const x = all[k]!;
    const y = all[k + 1]!;
    if (!inAnchorEnvelope(x, y)) {
      loose.push(x, y);
      cxs.push(NaN);
      cys.push(NaN);
      continue;
    }
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    cxs.push(cx);
    cys.push(cy);
    if (cx < minCx) minCx = cx;
    if (cx > maxCx) maxCx = cx;
    if (cy < minCy) minCy = cy;
    if (cy > maxCy) maxCy = cy;
  }
  const gridded = all.length / 2 - loose.length / 2;
  const cols = gridded > 0 ? maxCx - minCx + 1 : 0;
  const rows = gridded > 0 ? maxCy - minCy + 1 : 0;
  if (gridded === 0 || cols * rows > ANCHOR_GRID_MAX_CELLS) {
    return { all, loose, start: null, items: new Float64Array(0), cell, minCx: 0, minCy: 0, cols: 0, rows: 0 };
  }

  // Counting sort by cell: start[c + 1] counts, prefix-summed into offsets (in doubles, ×2 for x,y).
  const cells = cols * rows;
  const start = new Int32Array(cells + 1);
  for (let a = 0; a < cxs.length; a++) {
    const cx = cxs[a]!;
    if (cx !== cx) continue; // NaN ⇒ loose
    const c = (cys[a]! - minCy) * cols + (cx - minCx) + 1;
    start[c] = start[c]! + 2;
  }
  for (let c = 0; c < cells; c++) start[c + 1] = start[c + 1]! + start[c]!;
  const fill = start.slice(0, cells);
  const items = new Float64Array(gridded * 2);
  for (let a = 0; a < cxs.length; a++) {
    const cx = cxs[a]!;
    if (cx !== cx) continue;
    const c = (cys[a]! - minCy) * cols + (cx - minCx);
    const at = fill[c]!;
    items[at] = all[2 * a]!;
    items[at + 1] = all[2 * a + 1]!;
    fill[c] = at + 2;
  }
  return { all, loose, start, items, cell, minCx, minCy, cols, rows };
}

/** S191 — the pre-grid test, verbatim in its arithmetic, over a flat [x, y, …] list. */
function anyAnchorWithin(list: ArrayLike<number>, ex: number, ey: number, R2: number): boolean {
  for (let k = 0; k < list.length; k += 2) {
    const dx = ex - list[k]!;
    const dy = ey - list[k + 1]!;
    if (dx * dx + dy * dy < R2) return true;
  }
  return false;
}

/** S191 — is some anchor strictly within R (R2 = R·R) of (ex, ey)? Same answer as `anyAnchorWithin`
 *  over `grid.all`, by the argument in `computeTerritorialInfluence`'s docblock. */
function anchorWithin(grid: AnchorGrid, ex: number, ey: number, R2: number): boolean {
  const start = grid.start;
  if (start === null || !inAnchorEnvelope(ex, ey)) return anyAnchorWithin(grid.all, ex, ey, R2);
  if (grid.loose.length > 0 && anyAnchorWithin(grid.loose, ex, ey, R2)) return true;
  const cx = Math.floor(ex / grid.cell) - grid.minCx;
  const cy = Math.floor(ey / grid.cell) - grid.minCy;
  const x0 = cx > 0 ? cx - 1 : 0;
  const x1 = cx < grid.cols - 1 ? cx + 1 : grid.cols - 1;
  const y0 = cy > 0 ? cy - 1 : 0;
  const y1 = cy < grid.rows - 1 ? cy + 1 : grid.rows - 1;
  const items = grid.items;
  for (let gy = y0; gy <= y1; gy++) {
    const row = gy * grid.cols;
    for (let gx = x0; gx <= x1; gx++) {
      const end = start[row + gx + 1]!;
      for (let k = start[row + gx]!; k < end; k += 2) {
        const dx = ex - items[k]!;
        const dy = ey - items[k + 1]!;
        if (dx * dx + dy * dy < R2) return true;
      }
    }
  }
  return false;
}
