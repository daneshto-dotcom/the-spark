/**
 * SPARK — S144 P2/P3: how a BLUEPRINT is drawn, at any size.
 *
 * ONE renderer, TWO consumers:
 *   • the castle panel's build tiles (P2), scaled down to a ~64 px thumbnail;
 *   • the drag ghost that follows your cursor (P3), at full world scale.
 *
 * Both read `blueprints.ts`, so the thumbnail you clicked, the ghost you dragged and the structure
 * that actually gets stamped are the same geometry by construction — not three drawings that happen
 * to agree today. That is the same contract `dragPreview.ts` established for single-primitive
 * placement: the preview must BE the commit, not a picture of it.
 *
 * ## ⚠ WHY NOT `CODEX_COPY.emblem`
 *
 * The codex already has a `drawEmblem` and a declarative `EmblemSpec`, and reusing it was the first
 * plan. It cannot cover this surface: the codex contract is that every entry has EITHER a `sprite`
 * (character) OR an `emblem` (geometry), never both — and **voltkin and helga are sprite entries with
 * no emblem at all**. Two of the six build tiles would have had nothing to draw. Worse, an emblem is
 * an idealised logo (`{kind:'star', nodes:3, radius:38}`), not the real stamped layout, so a tile
 * drawn from it could disagree with what the build produces. Drawing from the blueprint itself covers
 * all six uniformly and cannot drift.
 *
 * Per-type colours come from `SPARK_COLORS`, the same palette the board uses, so a Square reads blue
 * and a Spiral purple in the tile exactly as it does in the arena — the player learns one mapping.
 *
 * Pixi-touching but WORLD-FREE: it takes a Graphics and coordinates, nothing else. No world, no
 * state, no async asset loading (which is precisely what a sprite-based tile would have needed inside
 * a constructor-built panel).
 */

import { Graphics } from 'pixi.js';
import { SPARK_COLORS } from '../constants.ts';
import { blueprintFor, blueprintRadius } from '../state/blueprints.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';

/**
 * PURE — the scale factor that makes `id`'s whole footprint fit inside `fitRadius` px.
 *
 * Exported so a test can assert a tile never overflows its box for ANY recipe — voltkin's 304 px
 * chain and the stink tower's 88 px star differ by 3.5×, so a single hard-coded scale would either
 * clip the chain or render the tower as a dot.
 */
export function blueprintFitScale(id: GodlyId, fitRadius: number): number {
  return fitRadius / blueprintRadius(id);
}

export interface BlueprintDrawOpts {
  /** Override every node's colour (used by the ghost to signal legal/illegal). Default: per-type. */
  readonly tint?: number;
  /** Overall alpha for the bond lines. Default 0.9. */
  readonly bondAlpha?: number;
  /** Bond line width BEFORE scaling. Default 2. */
  readonly bondWidth?: number;
}

/**
 * Draw `id`'s geometry centred at (cx, cy), scaled by `scale`.
 *
 * Bonds are drawn FIRST so the node glyphs sit on top of the line ends rather than being crossed by
 * them — at thumbnail scale a line drawn over a 4 px glyph erases it.
 */
export function drawBlueprintShape(
  g: Graphics,
  id: GodlyId,
  cx: number,
  cy: number,
  scale: number,
  opts: BlueprintDrawOpts = {},
): void {
  const bp = blueprintFor(id);
  const tint = opts.tint;
  const bondAlpha = opts.bondAlpha ?? 0.9;
  const bondWidth = opts.bondWidth ?? 2;

  const at = (i: number): { x: number; y: number } => ({
    x: cx + bp.nodes[i].dx * scale,
    y: cy + bp.nodes[i].dy * scale,
  });

  // ── BONDS ──
  for (const [a, b] of bp.bonds) {
    const pa = at(a);
    const pb = at(b);
    g.moveTo(pa.x, pa.y).lineTo(pb.x, pb.y).stroke({
      // Floor the width at 1 so a heavily-scaled-down thumbnail still shows its skeleton; without it
      // the pentagram ring and the voltkin chain both vanish into disconnected dots.
      width: Math.max(1, bondWidth * scale),
      color: tint ?? 0x9fc4e8,
      alpha: bondAlpha,
    });
  }

  // ── NODES ──
  for (let i = 0; i < bp.nodes.length; i++) {
    const p = at(i);
    const node = bp.nodes[i];
    drawSparkGlyph(
      g,
      p.x,
      p.y,
      // Floored for the same reason as the bond width. 3 px, not 2: voltkin is an 8-node chain 304 px
      // long, so a square tile forces it to ~0.21 scale and at a 2 px floor it rendered as a row of
      // nearly-invisible specks (checked on the real render, not inferred). 3 px keeps the chain
      // readable as a chain without inflating the compact stars.
      Math.max(3, 9 * scale),
      node.type,
      tint ?? SPARK_COLORS[node.type],
    );
  }
}

/**
 * Convenience for a tile: draw `id` centred in a box of side `boxSize`, auto-scaled with padding.
 *
 * `pad` is the breathing room between the footprint and the box edge — the fit uses the blueprint's
 * own radius, which already includes a small margin, so a tile drawn this way can never clip.
 */
export function drawBlueprintThumb(
  g: Graphics,
  id: GodlyId,
  cx: number,
  cy: number,
  boxSize: number,
  opts: BlueprintDrawOpts = {},
  pad = 6,
): void {
  const scale = blueprintFitScale(id, Math.max(1, boxSize / 2 - pad));
  drawBlueprintShape(g, id, cx, cy, scale, opts);
}
