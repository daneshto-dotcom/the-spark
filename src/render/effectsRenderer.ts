/**
 * SPARK — visual effect renderer.
 * Drains world.effects each frame and animates short-lived overlays:
 *
 *   BOND_COMMIT     → ring pop + per-combo silhouette flair (~0.4s)
 *   SEVER_ERASE     → shrinking ghost + shockwave (~0.5s)
 *   STRUCTURE_GROW  → BFS-timed outward pulse (variable, ~maxHop ticks)
 *   STRUCTURE_MERGE → synchronized union flash (~MERGE_LEAD_IN + FLASH)
 *   SCORE_TIER      → corner bloom + leading ring (~500ms)
 *   ARC_FLASH       → jittered lightning polyline + halo (~300ms, S27 P0)
 *
 * One Graphics for everything (clear + redraw per frame). Active list is
 * bounded by EFFECT_LIFETIME_TICKS — worst-case dozens of entries during
 * a fast build. The list is held by the renderer, not by the world, so
 * save/load doesn't need to know about it.
 *
 * Ageing uses world.tick (NOT wall-clock): if the simulation pauses
 * (POSTGAME, tab switch), effects pause too — same as the spark physics.
 *
 * Per-kind drawers live under `./effects/`. This module owns only the
 * active-list lifecycle (drain, age, cull) + kind dispatch. Drawers are
 * pure functions: parent passes `g: Graphics` + `age: number` (never
 * world.tick directly), drawers append to the shared Graphics.
 */

import { Application, Graphics } from 'pixi.js';
import {
  EFFECT_LIFETIME_TICKS,
  MAX_ACTIVE_EFFECTS,
  type GameEffect,
} from '../game/effects.ts';
import type { World } from '../state/world.ts';
import { drawBondCommit } from './effects/bondCommit.ts';
import { drawArcFlash } from './effects/arcFlash.ts';
import { drawBombExplode } from './effects/bombExplode.ts';
import { effectLifetime } from './effects/lifetime.ts';
import { drawScoreTier } from './effects/scoreTier.ts';
import { drawSeverErase } from './effects/severErase.ts';
import { drawStructureGrow } from './effects/structureGrow.ts';
import { drawStructureMerge } from './effects/structureMerge.ts';

interface ActiveEffect {
  readonly effect: GameEffect;
  readonly bornTick: number;
}

export class EffectsRenderer {
  private readonly graphics: Graphics;
  private readonly active: ActiveEffect[] = [];

  constructor(app: Application) {
    this.graphics = new Graphics();
    app.stage.addChild(this.graphics);
  }

  /** Drain world.effects, age active list, redraw. Idempotent per frame. */
  sync(world: World): void {
    // Drain new effects.
    if (world.effects.length > 0) {
      for (const e of world.effects) {
        // S18 P1 — audio-only effects (BOND_FORMED, BOND_SEVERED) are drained
        // by audioManager earlier in the frame; they have no visual drawer.
        // Skip so they don't enter the active list as dead weight.
        if (e.kind === 'BOND_FORMED' || e.kind === 'BOND_SEVERED') continue;
        this.active.push({ effect: e, bornTick: e.tick });
      }
      world.effects.length = 0;
    }

    // S6 P2: hard count cap. Lifetime ageing handles steady-state, but a
    // single-frame burst (spam-place + spam-sever) could exceed budget
    // before the next cull. Drop oldest first when over cap.
    if (this.active.length > MAX_ACTIVE_EFFECTS) {
      this.active.splice(0, this.active.length - MAX_ACTIVE_EFFECTS);
    }

    // Age + cull.
    const g = this.graphics;
    g.clear();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      const age = world.tick - a.bornTick;
      const lifetime = effectLifetime(a.effect);
      if (age < 0 || age > Math.max(lifetime, EFFECT_LIFETIME_TICKS)) {
        // Past lifetime or rewound below birth (softReset/load) — drop.
        this.active.splice(i, 1);
        continue;
      }
      this.draw(a.effect, age, lifetime, world);
    }
  }

  private draw(effect: GameEffect, age: number, lifetime: number, world: World): void {
    const g = this.graphics;
    switch (effect.kind) {
      case 'BOND_COMMIT':
        drawBondCommit(g, effect, Math.min(1, age / lifetime));
        return;
      case 'SEVER_ERASE':
        drawSeverErase(g, effect, Math.min(1, age / lifetime));
        return;
      case 'STRUCTURE_GROW':
        drawStructureGrow(g, effect, age, world);
        return;
      case 'STRUCTURE_MERGE':
        drawStructureMerge(g, effect, age, world);
        return;
      case 'SCORE_TIER':
        drawScoreTier(g, effect, age);
        return;
      case 'ARC_FLASH':
        drawArcFlash(g, effect, Math.min(1, age / lifetime));
        return;
      case 'BOMB_EXPLODE':
        drawBombExplode(g, effect, Math.min(1, age / lifetime));
        return;
      case 'BOND_FORMED':
      case 'BOND_SEVERED':
        // S18 P1 — audio-only; filtered at drain. Defense-in-depth no-op.
        return;
    }
  }

  /** For tests + stats overlay. */
  get activeCount(): number {
    return this.active.length;
  }

  destroy(): void {
    this.graphics.destroy();
    this.active.length = 0;
  }
}
