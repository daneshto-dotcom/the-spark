/**
 * SPARK — fog-of-war MEMORY (S59). "Remembered areas" — the StarCraft dimmed
 * last-observed tier that sits beneath the live fog.
 *
 * PURE data + logic; no Pixi. render/fogRenderer.ts rasterizes this grid into the
 * fog mask as an OPAQUE lighter-colour overlay over explored cells, so terrain you
 * have scouted reads as a dim "remembered" shade after your live vision leaves it,
 * while never-seen terrain stays near-black and currently-visible terrain is clear
 * (3 tiers, one overlay). Crucially the memory tier is OPAQUE — it never reveals
 * the live board beneath, so live enemy movement in a scouted area stays hidden
 * (the rejected M1 "leak").
 *
 * Council S59 (2-round, ADOPT HYBRID): the proven half-res RenderTexture is kept
 * for LIVE fog; the EXPLORED state lives here as a coarse grid because that makes
 * it (a) unit-testable — the GPU path is not, (b) resize-IMMUNE (resize just
 * re-rasterizes from the grid; no cumulative texture state to lose), and (c) cheap
 * (a few array writes per tick, no second per-frame render target).
 *
 * LOCAL per-peer: each player's own exploration. NEVER networked, NEVER in game
 * state, NEVER serialized, NEVER on the determinism path — fog has always been a
 * client-only view concern (see vision.ts). Symmetric by construction: it consumes
 * the local player's VisionSource[] from computeVisionSources().
 *
 * Terrain-only memory has a safety property the (P2) structure-memory layer lacks:
 * terrain cannot change, so a remembered cell can NEVER show false intel.
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  EXPLORED_GRID_COLS,
  EXPLORED_GRID_ROWS,
  type SparkType,
} from '../constants.ts';
import { isPointVisible, type VisionSource } from './vision.ts';
import type { Primitive } from '../game/primitive.ts';
import { v2copy, type PlayerId, type PrimitiveId, type Vec2 } from '../types.ts';

const CELL_W = CANVAS_WIDTH / EXPLORED_GRID_COLS;
const CELL_H = CANVAS_HEIGHT / EXPLORED_GRID_ROWS;

/**
 * A coarse boolean exploration grid over the board. `cells` is row-major
 * (index = row * cols + col); 1 = the cell's centre has been inside a vision
 * source at least once this match, 0 = never seen.
 */
export interface ExploredGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cells: Uint8Array;
}

/** A fresh, fully-unexplored grid (one per renderer; reset between matches). */
export function makeExploredGrid(): ExploredGrid {
  return {
    cols: EXPLORED_GRID_COLS,
    rows: EXPLORED_GRID_ROWS,
    cells: new Uint8Array(EXPLORED_GRID_COLS * EXPLORED_GRID_ROWS),
  };
}

/**
 * Mark every cell the vision circle OVERLAPS as explored — circle-rect overlap
 * (the cell's nearest point to the source centre is within the radius), NOT a
 * centre-only test. Centre-only would leave a cell unmarked when the circle
 * clips its edge but misses its centre, so the remembered region would shrink ~1
 * cell inside what was actually seen (S59 P1 GROK-ANALYST finding). Overlap makes
 * "remembered" cover the full seen extent.
 *
 * Monotonic (only flips 0→1): memory is permanent within a match — StarCraft, and
 * decay would reintroduce a wait-it-out timing exploit (Council R1).
 *
 * Returns true iff at least one cell newly flipped — lets the renderer skip the
 * texture re-upload on the (common) ticks where exploration didn't grow, which
 * keeps the swiftshader sim-rate canary happy.
 */
export function markVisible(grid: ExploredGrid, sources: readonly VisionSource[]): boolean {
  let changed = false;
  for (const s of sources) {
    const minCol = Math.max(0, Math.floor((s.x - s.radius) / CELL_W));
    const maxCol = Math.min(grid.cols - 1, Math.floor((s.x + s.radius) / CELL_W));
    const minRow = Math.max(0, Math.floor((s.y - s.radius) / CELL_H));
    const maxRow = Math.min(grid.rows - 1, Math.floor((s.y + s.radius) / CELL_H));
    const r2 = s.radius * s.radius;
    for (let row = minRow; row <= maxRow; row++) {
      const top = row * CELL_H;
      const bottom = top + CELL_H;
      const ny = s.y < top ? top : s.y > bottom ? bottom : s.y; // nearest y in cell
      const dy = ny - s.y;
      const rowBase = row * grid.cols;
      for (let col = minCol; col <= maxCol; col++) {
        if (grid.cells[rowBase + col] === 1) continue;
        const left = col * CELL_W;
        const right = left + CELL_W;
        const nx = s.x < left ? left : s.x > right ? right : s.x; // nearest x in cell
        const dx = nx - s.x;
        if (dx * dx + dy * dy <= r2) {
          grid.cells[rowBase + col] = 1;
          changed = true;
        }
      }
    }
  }
  return changed;
}

/** Whether the cell containing world point (x, y) has ever been seen this match. */
export function isExplored(grid: ExploredGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) return false;
  const col = Math.min(grid.cols - 1, Math.floor(x / CELL_W));
  const row = Math.min(grid.rows - 1, Math.floor(y / CELL_H));
  return grid.cells[row * grid.cols + col] === 1;
}

/**
 * Clear all exploration. Called at the start of each match (PLAYING edge) and on
 * RETURN_TO_TITLE, so a new game never inherits the previous match's explored map.
 */
export function resetExploredGrid(grid: ExploredGrid): void {
  grid.cells.fill(0);
}

// ============================================================================
// S60 P2 — last-seen ENEMY-STRUCTURE memory ("remembered buildings").
//
// The terrain grid above answers "have I seen this PATCH?". This answers "what
// ENEMY STRUCTURE did I last see HERE, and is it still there?" — the StarCraft
// remembered-building tier. PURE data + a small state machine; render/fogRenderer.ts
// turns each ghost into a dim silhouette in a layer ABOVE the live fog, masked so a
// ghost paints ONLY in currently-fogged area (re-scouting shows the real structure
// or confirms it gone).
//
// Council S59 named this state machine the #1 hazard, so the drop/keep rules are
// explicit and exhaustively unit-tested:
//   SEEN-ON-LIVE      record/refresh while the structure sits in live vision (truth).
//   DESTROYED-LIVE    gone from the world AND we can see the spot → forget it.
//   DESTROYED-IN-FOG  gone from the world but the spot is fogged → KEEP the stale
//                     silhouette (we don't know yet — StarCraft-correct).
//   RE-FOGGED         still exists, now hidden → KEEP unchanged (never drop on fog).
//
// Own structures are never remembered (you hold live beacon vision over your own;
// this is the scout-the-enemy mechanic). "Enemy" = placedBy !== local player.
// placedBy is IMMUTABLE, so a Phase-2 Steal (which mutates ownerColor, not placedBy)
// keeps the gate stable while the snapshot's `color` captures last-seen ownership.
//
// LOCAL per-peer like the grid: never networked, never serialized, off the
// determinism path (consumes the local player's vision sources only).
// ============================================================================

/** The fields the memory state machine reads off a placed primitive (keeps the
 *  pure core trivially testable — no full Primitive/World needed). */
type RememberablePrimitive = Pick<Primitive, 'id' | 'type' | 'placedBy' | 'pos' | 'ownerColor'>;

/** A remembered enemy structure: a frozen snapshot of where/what it was last seen. */
interface GhostStructure {
  readonly id: PrimitiveId;
  readonly type: SparkType;
  /** A COPY of the last-seen position — decoupled from the live prim (which the bond
   *  solver keeps nudging), so a remembered ghost never drifts after you look away. */
  readonly pos: Vec2;
  /** ownerColor at the last-seen tick (a Phase-2 Steal shows the colour you saw). */
  readonly color: number;
  readonly lastSeenTick: number;
}

/** Last-seen enemy structures, keyed by PrimitiveId. One per renderer; reset per match. */
export type GhostMemory = Map<PrimitiveId, GhostStructure>;

export function makeGhostMemory(): GhostMemory {
  return new Map<PrimitiveId, GhostStructure>();
}

/**
 * Advance the last-seen memory by one observation. Call each time the fog mask is
 * recomposed, with the local player's current vision sources. Mutates `memory` in
 * place (the renderer owns one long-lived Map); otherwise pure.
 *
 * Order matters: refresh first (so a structure seen live THIS tick is current),
 * then reconcile disappearances — see the module header for the four transitions.
 */
export function updateGhostMemory(
  memory: GhostMemory,
  primitives: ReadonlyMap<PrimitiveId, RememberablePrimitive>,
  sources: readonly VisionSource[],
  localPlayerId: PlayerId,
  tick: number,
): void {
  // SEEN-ON-LIVE — every enemy structure currently inside live vision is the
  // ground truth: (re)snapshot it. Own structures are never remembered.
  for (const prim of primitives.values()) {
    if (prim.placedBy === localPlayerId) continue;
    if (!isPointVisible(sources, prim.pos.x, prim.pos.y)) continue;
    memory.set(prim.id, {
      id: prim.id,
      type: prim.type,
      pos: v2copy(prim.pos),
      color: prim.ownerColor,
      lastSeenTick: tick,
    });
  }
  // Reconcile remembered structures that are no longer in the world. (Deleting the
  // current key during Map iteration is well-defined in JS.)
  for (const [id, ghost] of memory) {
    if (primitives.has(id)) continue; // RE-FOGGED / still live → keep (refreshed above)
    // DESTROYED-LIVE vs DESTROYED-IN-FOG: only forget it if we can currently SEE the
    // spot it was last at. Otherwise the stale silhouette stands until we re-scout.
    if (isPointVisible(sources, ghost.pos.x, ghost.pos.y)) {
      memory.delete(id);
    }
  }
}

/** Forget every remembered structure (match start + RETURN_TO_TITLE). */
export function resetGhostMemory(memory: GhostMemory): void {
  memory.clear();
}
