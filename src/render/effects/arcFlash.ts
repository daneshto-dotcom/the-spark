/**
 * ARC_FLASH — Voltkin per-attack lightning arc (S27 P0). Jittered polyline
 * from creature.pos (start) to bond midpoint (end) with bright cyan-white
 * core + outer glow halo. Fades linearly over ARC_FLASH_DURATION_TICKS
 * (~300 ms @ 60 Hz).
 *
 * Council R1 Q5 UNANIMOUS creature-only: this drawer is THE per-attack
 * visual feedback. Audio is silent in S27 (Council Q4 2/3 A — S28 ships
 * procedural Web Audio zap synth), so visual prominence compensates.
 * Council Q4 Gemini minority position (reuse 'player' SFX placeholder)
 * REJECTED — tonally wrong (lightning creature ≠ fart SFX); the bright
 * jittered polyline is the right S27 substitute.
 *
 * Jitter algorithm: 5 intermediate vertices along the start→end line, each
 * displaced perpendicular by a deterministic pseudo-random offset seeded
 * from effect.tick (replay-safe + 1v1 host-determinism). Two passes:
 *   1. Outer halo: thicker stroke, 35 % alpha, glow color (pale cyan)
 *   2. Inner core: thin stroke, 100 % alpha (× t-fade), bright white-cyan
 */

import { Graphics } from 'pixi.js';
import type { GameEffect } from '../../game/effects.ts';
import { pseudoRand } from '../../state/rng.ts';

/** Number of jitter segments between start and end. 5 → 6 polyline vertices total. */
const ARC_JITTER_SEGMENTS = 5;
/** Max perpendicular jitter amplitude in px. S30 P0c — bumped 14 → 20 px for more chaotic "zap" feel. */
const ARC_JITTER_AMP_PX = 20;
/** S30 P0c — NEW outer-corona stroke width (the widest, lowest-alpha rim that
 *  conveys "this is electrically charged"). Drawn beneath halo + core. */
const ARC_CORONA_WIDTH = 18;
/** Halo (outer) stroke width in px. S30 P0c — bumped 8 → 12 for more visible glow. */
const ARC_HALO_WIDTH = 12;
/** Core (inner) stroke width in px. S30 P0c — bumped 2.5 → 3.5 for thicker bright line. */
const ARC_CORE_WIDTH = 3.5;
/** S30 P0c — Outer-corona color: deeper cyan with hint of blue for atmospheric depth. */
const ARC_CORONA_COLOR = 0x33aacc;
/** Halo color (pale cyan glow). */
const ARC_HALO_COLOR = 0x66dddd;
/** Core color (bright white-cyan, near-white). */
const ARC_CORE_COLOR = 0xeaffff;

// S30 P0e — radial spark burst at the arc origin (creature center).

/** Number of spark rays radiating outward from start point. */
const SPARK_COUNT = 14;
/** Min spark length in px. */
const SPARK_LEN_MIN = 12;
/** Max spark length in px. */
const SPARK_LEN_MAX = 26;
/** Spark stroke width in px. */
const SPARK_WIDTH = 2.0;
/** Spark color (matches core for cohesion). */
const SPARK_COLOR = 0xeaffff;

/**
 * S33 P1-10 — local `pseudoRand` removed; now imported from `state/rng.ts`.
 * The arcSeed combiner below (CHECK Triumvirate Grok C4 + Gemini G5 ACCEPTED)
 * folds (sx, sy) bit-patterns into the tick via XOR — preserves replay safety
 * (same world state → same pseudoRand sequence) while differentiating same-tick
 * arcs by origin. Floor-to-int via `| 0` keeps the seed integer-stable across
 * sub-pixel pos drift between host snapshot ticks.
 *
 * S33 P1-11 — extended to mix `creatureId` so two creatures attacking on the
 * SAME tick from int-truncated-equal positions render distinct jitter. The
 * creatureId is OPTIONAL on the effect type (legacy pre-S33 emissions omit
 * it); `(creatureId | 0)` coerces `undefined → NaN → 0` so legacy data
 * gracefully degrades to the pre-S33 jitter pattern (additive-optional
 * precedent S15 P2 / S28 P0 / S31 P0-3 — NO schemaVersion bump).
 *
 * Combine effect tick + origin coordinates + creature ID into a single seed
 * integer. Replay-safe because all inputs are reproducible from world state.
 */
function arcSeed(tick: number, sx: number, sy: number, creatureId: number | undefined): number {
  return (
    (tick | 0)
    ^ Math.imul(sx | 0, 374761393)
    ^ Math.imul(sy | 0, 668265263)
    ^ Math.imul((creatureId as number) | 0, 2246822507)
  ) | 0;
}

export function drawArcFlash(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'ARC_FLASH' }>,
  t01: number,
): void {
  // t01: 0 = freshly emitted, 1 = end-of-lifetime. Fade linearly.
  const alpha = Math.max(0, 1 - t01);
  if (alpha <= 0) return;

  const sx = effect.start.x;
  const sy = effect.start.y;
  const ex = effect.end.x;
  const ey = effect.end.y;

  // Perpendicular unit vector for jitter displacement. Degenerate (zero-length
  // line) falls back to (0, 0) — renders a single point pair, harmless.
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = len > 1e-6 ? -dy / len : 0;
  const perpY = len > 1e-6 ? dx / len : 0;

  // Build the jittered polyline vertices once; both halo + core passes share.
  // Seed incorporates start coordinates so simultaneous-tick arcs from
  // different creatures produce distinct patterns (CHECK Triumvirate fix).
  const seed = arcSeed(effect.tick, sx, sy, effect.creatureId);
  const xs: number[] = [sx];
  const ys: number[] = [sy];
  for (let i = 1; i < ARC_JITTER_SEGMENTS + 1; i++) {
    const tSeg = i / (ARC_JITTER_SEGMENTS + 1);
    const baseX = sx + dx * tSeg;
    const baseY = sy + dy * tSeg;
    const offset = pseudoRand(seed, i) * ARC_JITTER_AMP_PX;
    xs.push(baseX + perpX * offset);
    ys.push(baseY + perpY * offset);
  }
  xs.push(ex);
  ys.push(ey);

  // S30 P0e — Pass -1: radial spark burst from the arc origin (creature
  // center). SPARK_COUNT short rays emit at evenly-spaced angles around
  // start. Each ray length is deterministically random in [SPARK_LEN_MIN,
  // SPARK_LEN_MAX] from the same seed. Drawn FIRST so the main arc renders
  // on top, sparks fading "behind" the bolt impact. Front-loaded brightness:
  // fades faster than the arc (alpha² curve) so sparks are intense early
  // then dim, while the arc itself holds visibility longer.
  const sparkAlpha = alpha * alpha; // ease-out for snappier early burst
  if (sparkAlpha > 0.02) {
    for (let s = 0; s < SPARK_COUNT; s++) {
      const angle = (s / SPARK_COUNT) * Math.PI * 2;
      const rayLenRand = (pseudoRand(seed, s + 100) + 1) * 0.5; // [0, 1]
      const rayLen = SPARK_LEN_MIN + (SPARK_LEN_MAX - SPARK_LEN_MIN) * rayLenRand;
      const endXr = sx + Math.cos(angle) * rayLen;
      const endYr = sy + Math.sin(angle) * rayLen;
      g.moveTo(sx, sy);
      g.lineTo(endXr, endYr);
      g.stroke({
        color: SPARK_COLOR,
        width: SPARK_WIDTH,
        alpha: 0.85 * sparkAlpha,
        cap: 'round',
      });
    }
  }

  // S30 P0c — Pass 0: outer corona (widest, lowest-alpha rim). Adds atmospheric
  // depth + makes the lightning look genuinely "electrical" against the play
  // field. Drawn FIRST so halo + core layer on top.
  g.moveTo(xs[0], ys[0]);
  for (let i = 1; i < xs.length; i++) g.lineTo(xs[i], ys[i]);
  g.stroke({
    color: ARC_CORONA_COLOR,
    width: ARC_CORONA_WIDTH,
    alpha: 0.18 * alpha,
    cap: 'round',
    join: 'round',
  });

  // Pass 1: outer halo (thick, low-alpha glow).
  g.moveTo(xs[0], ys[0]);
  for (let i = 1; i < xs.length; i++) g.lineTo(xs[i], ys[i]);
  g.stroke({
    color: ARC_HALO_COLOR,
    width: ARC_HALO_WIDTH,
    alpha: 0.45 * alpha,
    cap: 'round',
    join: 'round',
  });

  // Pass 2: inner core (thin, high-alpha bright line).
  g.moveTo(xs[0], ys[0]);
  for (let i = 1; i < xs.length; i++) g.lineTo(xs[i], ys[i]);
  g.stroke({
    color: ARC_CORE_COLOR,
    width: ARC_CORE_WIDTH,
    alpha,
    cap: 'round',
    join: 'round',
  });
}
