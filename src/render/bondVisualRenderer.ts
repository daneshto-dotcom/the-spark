/**
 * SPARK — per-combo persistent bond visuals dispatcher (S7 P2 + S20 P3 slim).
 *
 * The 24 functional combos render as the original straight line. The 12
 * magic combos render as their named silhouette stretched/anchored
 * between the two bond endpoints. The visual IS the bond — there's no
 * separate "decoration" layer. Stress-tint and width are applied by the
 * caller (structureRenderer) so the silhouette inherits stress feedback
 * without this module knowing about it.
 *
 * S20 P3 (Standard, Council R1 + PRIME-AUDIT): the 12 magic silhouettes
 * extracted into 3 archetype files under `src/render/effects/silhouettes/`
 * (axisAligned + midpointOrnaments + parametricPaths) + a shared module
 * for BondVisualParams + helpers (lerpColor, midColor, strokeAxisLerp,
 * strokePathLerp, drawDefaultLine). This file now retains only the
 * dispatcher + back-compat re-exports for the test suite and external
 * consumers. 536 LOC → ≤80 LOC, well under §XV 500 charter.
 *
 * Why between-endpoint and not centered-on-midpoint:
 *   The S6 ephemeral effects (effectsRenderer.ts) used a centered-radius
 *   draw because they were one-shot pops at a single primitive's position.
 *   A persistent bond visual must answer "what shape connects A to B,"
 *   not "what symbol decorates a point" — so the geometry in the
 *   silhouettes is re-imagined: cable spans A→B as twin parallels, diamond
 *   uses A and B as opposite vertices of its long diagonal, capsule is a
 *   pill, etc.
 *
 * Animation (wheel rotation, vortex phase, orbital pulse) is keyed on
 * `tick` rather than wall-clock so the visual pauses with physics —
 * matches the convention established for the ephemeral effects ageing.
 */

import type { Graphics } from 'pixi.js';
import { drawDefaultLine, type BondVisualParams } from './effects/silhouettes/shared.ts';
import {
  drawBracket,
  drawCable,
  drawCapsule,
  drawDiamond,
  drawFilament,
  drawLattice,
  drawOrbital,
  drawStar,
  drawVortex,
  drawWarped,
  drawWheel,
  drawWhip,
} from './effects/silhouettes/index.ts';

// S20 P3 — re-export BondVisualParams + lerpColor so existing consumers
// (bondVisualRenderer.test.ts + structureRenderer.ts) don't need import-path
// changes. lerpColor is used by vitest pixel-sample tests per S10
// #test-via-pure-helper-export pattern.
export type { BondVisualParams };
export { lerpColor } from './effects/silhouettes/shared.ts';

export function drawBondVisual(g: Graphics, p: BondVisualParams): void {
  switch (p.visualEffectId) {
    case 'fx.filament': drawFilament(g, p); break;
    case 'fx.cable': drawCable(g, p); break;
    case 'fx.bracket': drawBracket(g, p); break;
    case 'fx.diamond': drawDiamond(g, p); break;
    case 'fx.wheel': drawWheel(g, p); break;
    case 'fx.star': drawStar(g, p); break;
    case 'fx.orbital': drawOrbital(g, p); break;
    case 'fx.lattice': drawLattice(g, p); break;
    case 'fx.capsule': drawCapsule(g, p); break;
    case 'fx.vortex': drawVortex(g, p); break;
    case 'fx.whip': drawWhip(g, p); break;
    case 'fx.warped': drawWarped(g, p); break;
    default: drawDefaultLine(g, p); break;
  }
}
