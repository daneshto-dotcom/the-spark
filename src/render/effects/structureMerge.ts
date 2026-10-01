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
import { mergePrimFx } from '../fx/buildFx.ts';
import { fxSeed } from '../fx/emitter.ts';
import { fxActive, fxTop } from '../fx/fxState.ts';

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
  // ⭐ S193 (V20) — the union snap as soft light + two rising spark pops per shape, when fx is live.
  const fx = fxActive();
  const top = fxTop();
  for (const primId of effect.unionPrimIds) {
    const prim = world.primitives.get(primId);
    if (prim === undefined) continue;
    if (fx) { mergePrimFx(top, fxSeed(primId as unknown as number, effect.tick), prim.pos.x, prim.pos.y, prim.radius, effect.color, t); continue; }
    const radius = prim.radius * (1.8 + t * 1.2);
    g.circle(prim.pos.x, prim.pos.y, radius).fill({
      color: effect.color,
      alpha: 0.32 * env,
    });
  }
}
