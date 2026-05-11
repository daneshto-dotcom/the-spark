/**
 * S10 P2: outward structure pulse. Each entry in the hop maps flashes when
 * the wavefront (age / HOP_TICKS) reaches its hop distance. Primitives and
 * bonds whose IDs vanished between emit and draw (severed mid-effect) are
 * silently skipped — keeps the effect robust against P2-merge-then-sever
 * sequences without state in the renderer.
 */

import { Graphics } from 'pixi.js';
import {
  STRUCTURE_FLASH_TICKS,
  STRUCTURE_GROW_HOP_TICKS,
} from '../../constants.ts';
import type { GameEffect } from '../../game/effects.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { World } from '../../state/world.ts';

export function drawStructureGrow(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'STRUCTURE_GROW' }>,
  age: number,
  world: World,
): void {
  for (const [primId, hop] of effect.hopByPrimId) {
    const arrival = hop * STRUCTURE_GROW_HOP_TICKS;
    const flashEnd = arrival + STRUCTURE_FLASH_TICKS;
    if (age < arrival || age > flashEnd) continue;
    const prim = world.primitives.get(primId);
    if (prim === undefined) continue; // severed mid-effect
    const t = (age - arrival) / STRUCTURE_FLASH_TICKS;
    // Sine envelope: 0 → 1 → 0 over the flash window. Peak alpha 0.7.
    const env = Math.sin(t * Math.PI);
    const radius = prim.radius * (1.5 + t * 1.4);
    g.circle(prim.pos.x, prim.pos.y, radius).stroke({
      width: 2.5 * (1 - t * 0.4),
      color: effect.color,
      alpha: 0.7 * env,
    });
  }
  for (const [bondId, hop] of effect.hopByBondId) {
    const arrival = hop * STRUCTURE_GROW_HOP_TICKS;
    const flashEnd = arrival + STRUCTURE_FLASH_TICKS;
    if (age < arrival || age > flashEnd) continue;
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    const t = (age - arrival) / STRUCTURE_FLASH_TICKS;
    const env = Math.sin(t * Math.PI);
    const a = bond.a as Primitive;
    const b = bond.b as Primitive;
    g.moveTo(a.pos.x, a.pos.y)
      .lineTo(b.pos.x, b.pos.y)
      .stroke({
        width: 3 * (1 - t * 0.4),
        color: effect.color,
        alpha: 0.55 * env,
      });
  }
}
