/**
 * SPARK — S136 P1: the one place a primitive SHAPE is drawn as a glyph.
 *
 * Extracted verbatim from `gathererRenderer.drawGatherer`'s switch, which was the only shape drawer
 * in the codebase. It moved here because the castle panel now has to show the shapes held in the
 * bank, and those glyphs MUST be the same marks the board draws — a stored triangle that does not
 * look like a board triangle makes the bank unreadable, which defeats the point of letting the
 * player choose which shape to pull.
 *
 * Pure drawing: takes a Graphics and appends to it. No world read, no state.
 */

import type { Graphics } from 'pixi.js';
import { SparkType } from '../constants.ts';

/**
 * Append the glyph for `shape`, centred on (x, y) and sized to radius `r`, in `color`.
 *
 * `r` is the visual radius the glyph fills — every case is scaled off it, so the same call renders a
 * board-sized gatherer shape and a small panel swatch without per-site tuning.
 */
export function drawSparkGlyph(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  shape: SparkType,
  color: number,
): void {
  const fill = { color, alpha: 0.55 } as const;
  const line = { width: 2, color, alpha: 0.95 } as const;

  switch (shape) {
    case SparkType.Dot:
      g.circle(x, y, r * 0.55).fill(fill).stroke(line);
      break;
    case SparkType.Line:
      g.moveTo(x - r, y).lineTo(x + r, y).stroke({ width: 3, color, alpha: 0.95 });
      break;
    case SparkType.Triangle:
      g.moveTo(x, y - r).lineTo(x + r * 0.9, y + r * 0.7).lineTo(x - r * 0.9, y + r * 0.7).closePath().fill(fill).stroke(line);
      break;
    case SparkType.Square:
      g.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5).fill(fill).stroke(line);
      break;
    case SparkType.Circle:
      g.circle(x, y, r * 0.85).fill(fill).stroke(line);
      break;
    case SparkType.Spiral: {
      // Two-turn spiral, sampled — cheap and unmistakably "the spiral primitive".
      const turns = 2;
      const steps = 26;
      g.moveTo(x, y);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const a = t * turns * Math.PI * 2;
        g.lineTo(x + Math.cos(a) * r * t, y + Math.sin(a) * r * t);
      }
      g.stroke({ width: 2, color, alpha: 0.95 });
      break;
    }
    default: {
      // ⛔ S162 (OF-6) — EXHAUSTIVENESS. This switch returns void, so before this arm existed a
      // seventh primitive compiled clean and silently drew NOTHING here. The `never` binding is what
      // turns that into a tsc error naming this exact site. SPARK_COLORS in constants.ts is the
      // Record-based backstop; it does not mention the seven call sites that draw this glyph.
      const unhandled: never = shape;
      void unhandled;
      break;
    }
  }
}
