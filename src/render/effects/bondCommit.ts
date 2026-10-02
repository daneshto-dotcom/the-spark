/**
 * BOND_COMMIT — expanding ring from the bonded primitive (~0.4s pop).
 * Dispatches over `visualEffectId` to per-combo silhouette flair from
 * `silhouettes.ts`. Inner flash precedes the silhouette to anchor visual
 * continuity. 12 magic combos have a bespoke commit-pop; the other 24 — the 22
 * functional placeholders + the S91 Anchor/Spindle promotions (whose bespoke
 * commit-pop is deferred to Phase 2) — use drawDefaultRing.
 */

import { Graphics } from 'pixi.js';
import type { GameEffect } from '../../game/effects.ts';
import {
  drawBracket,
  drawCable,
  drawCapsule,
  drawDefaultRing,
  drawDiamond,
  drawFilament,
  drawLattice,
  drawOrbital,
  drawStar,
  drawVortex,
  drawWarped,
  drawWheel,
  drawWhip,
} from './silhouettes.ts';
import { bondCommitFx } from '../fx/buildFx.ts';
import { fxSeedAt } from '../fx/emitter.ts';
import { fxActive, fxTop } from '../fx/fxState.ts';

export function drawBondCommit(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'BOND_COMMIT' }>,
  t: number,
): void {
  const eased = 1 - (1 - t) * (1 - t); // quadratic ease-out
  const alpha = 1 - eased;
  const x = effect.pos.x;
  const y = effect.pos.y;
  /*
   * ⭐ S193 (V20) — with the fx layers live, the flat inner flash and the generic default ring are
   * replaced by soft additive light (`fx/buildFx.ts`). The twelve bespoke silhouettes below still
   * draw: they are the combo's identity, not its punctuation. `?fx=legacy` and the unit suite keep
   * the S6 drawing exactly.
   */
  const fx = fxActive();
  if (fx) bondCommitFx(fxTop(), fxSeedAt(effect.tick, x, y), x, y, effect.radius, effect.color, t);

  // Inner flash — same on every combo. Anchors visual continuity.
  if (!fx && t < 0.3) {
    const flashAlpha = (0.3 - t) / 0.3;
    g.circle(x, y, effect.radius * 1.4).fill({
      color: effect.color,
      alpha: 0.45 * flashAlpha,
    });
  }

  switch (effect.visualEffectId) {
    case 'fx.filament':
      drawFilament(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.cable':
      drawCable(g, effect, eased, alpha);
      break;
    case 'fx.bracket':
      drawBracket(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.diamond':
      drawDiamond(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.wheel':
      drawWheel(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.star':
      drawStar(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.orbital':
      drawOrbital(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.lattice':
      drawLattice(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.capsule':
      drawCapsule(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.vortex':
      drawVortex(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.whip':
      drawWhip(g, effect, eased, alpha);
      break;
    case 'fx.warped':
      drawWarped(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    default:
      if (!fx) drawDefaultRing(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
  }
}
