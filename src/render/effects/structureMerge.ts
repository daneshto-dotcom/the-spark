/**
 * S10 P3: synchronized union flash on STRUCTURE_MERGE. Unlike STRUCTURE_GROW
 * (BFS-timed cascade), every primitive in unionPrimIds flashes at the same
 * time after a brief MERGE_LEAD_IN delay. Reads as "snap" rather than
 * "wave" — the merge is one event, not a propagation. Stacks visibly over
 * the concurrent STRUCTURE_GROW pulse so cross-structure merges feel
 * distinctly more dramatic than single-bond places.
 */

import { Graphics } from 'pixi.js';
import { STRUCTURE_FLASH_TICKS } from '../../constants.ts';
import type { GameEffect } from '../../game/effects.ts';
import type { World } from '../../state/world.ts';
import { MERGE_LEAD_IN_TICKS } from './lifetime.ts';

export function drawStructureMerge(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'STRUCTURE_MERGE' }>,
  age: number,
  world: World,
): void {
  if (age < MERGE_LEAD_IN_TICKS) return;
  const t = (age - MERGE_LEAD_IN_TICKS) / STRUCTURE_FLASH_TICKS;
  if (t > 1) return;
  const env = Math.sin(t * Math.PI);
  for (const primId of effect.unionPrimIds) {
    const prim = world.primitives.get(primId);
    if (prim === undefined) continue;
    const radius = prim.radius * (1.8 + t * 1.2);
    g.circle(prim.pos.x, prim.pos.y, radius).fill({
      color: effect.color,
      alpha: 0.32 * env,
    });
  }
}
