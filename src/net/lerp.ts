/**
 * SPARK — clamped lerp coefficient utility for net sync interpolation.
 * Pure, no dependencies. Extracted for unit testability + future reuse.
 */

/**
 * Clamp a [0, ∞) input ratio to [0, 1] for safe lerp coefficient use.
 * NaN → 0 (defensive). +Infinity → 1 (treat as past-the-end). -Infinity → 0.
 */
export function lerp01(t: number): number {
  if (Number.isNaN(t)) return 0;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}
