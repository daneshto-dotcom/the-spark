/**
 * SPARK — uniform cell-grid spatial hash for neighbor queries.
 * Keeps per-pair collision below O(N²) at the spawner densities we expect
 * (≤30 free sparks at 6P steady-state).
 *
 * Cell size = 2 × max-radius keeps a body's neighbors confined to its 3×3
 * cell window. We rebuild every substep; bucket indices stay flat arrays
 * so GC pressure stays near zero.
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import type { Spark } from '../game/spark.ts';

export class SpatialGrid {
  private readonly invCellSize: number;
  private readonly cells: Map<number, Spark[]> = new Map();

  constructor(cellSize: number) {
    if (cellSize <= 0) throw new Error('cellSize must be > 0');
    // S120 P3 (worker-sim phase (c)) — 8-bit cellKey headroom guard: a future
    // flat-array grid packs cx/cy into 8 bits each, which is collision-free only
    // while the canvas spans <256 cells per axis. Checked at construction
    // (boot/test-time, zero per-frame cost) so a cellSize shrink or canvas grow
    // fails loudly HERE instead of silently aliasing buckets later.
    if (CANVAS_WIDTH / cellSize >= 256 || CANVAS_HEIGHT / cellSize >= 256) {
      throw new Error(
        `SpatialGrid: cellSize ${cellSize} yields ≥256 cells on a ` +
          `${CANVAS_WIDTH}×${CANVAS_HEIGHT} canvas — overflows the reserved 8-bit cell space`,
      );
    }
    this.invCellSize = 1 / cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  insertAll(sparks: readonly Spark[]): void {
    this.cells.clear();
    for (let i = 0; i < sparks.length; i++) {
      this.insert(sparks[i]);
    }
  }

  insert(spark: Spark): void {
    const key = this.cellKey(spark.pos.x, spark.pos.y);
    const bucket = this.cells.get(key);
    if (bucket === undefined) {
      this.cells.set(key, [spark]);
    } else {
      bucket.push(spark);
    }
  }

  /**
   * Iterate over each unique pair of sparks within the same or neighboring
   * cells. Order is unspecified. Uses spark.id < spark.id to dedupe pairs
   * straddling cells.
   */
  forEachNearbyPair(visit: (a: Spark, b: Spark) => void): void {
    const cells = this.cells;
    const seen = new Set<number>();
    for (const [key, bucket] of cells) {
      // Within-cell pairs.
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          visit(bucket[i], bucket[j]);
        }
      }
      // Cross-cell pairs against 4 of 8 neighbors (E, S, SE, SW) to avoid
      // double-visiting symmetric neighbors.
      const cx = (key >> 16) - 0x8000;
      const cy = (key & 0xffff) - 0x8000;
      const neighborOffsets = [
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
      ] as const;
      for (let n = 0; n < neighborOffsets.length; n++) {
        const [dx, dy] = neighborOffsets[n];
        const nKey = SpatialGrid.packKey(cx + dx, cy + dy);
        if (seen.has(nKey)) continue;
        const other = cells.get(nKey);
        if (other === undefined) continue;
        for (let i = 0; i < bucket.length; i++) {
          for (let j = 0; j < other.length; j++) {
            visit(bucket[i], other[j]);
          }
        }
      }
      seen.add(key);
    }
  }

  private cellKey(x: number, y: number): number {
    const cx = Math.floor(x * this.invCellSize);
    const cy = Math.floor(y * this.invCellSize);
    return SpatialGrid.packKey(cx, cy);
  }

  // 16-bit signed pack: cells in [-32768, 32767], plenty for a 1920×1080 canvas.
  private static packKey(cx: number, cy: number): number {
    return ((cx + 0x8000) << 16) | (cy + 0x8000);
  }
}
