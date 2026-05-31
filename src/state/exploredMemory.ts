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
} from '../constants.ts';
import type { VisionSource } from './vision.ts';

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
