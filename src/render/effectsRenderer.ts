/**
 * SPARK — visual effect renderer.
 * Drains world.effects each frame and animates short-lived overlays:
 *
 *   BOND_COMMIT  → expanding ring from the bonded primitive (~0.4s pop)
 *   SEVER_ERASE  → ghost circle that shrinks + fades at the deleted
 *                  primitive's last position (~0.5s erase)
 *
 * One Graphics for everything (clear + redraw per frame). Active list is
 * bounded by EFFECT_LIFETIME_TICKS — worst-case dozens of entries during
 * a fast build. The list is held by the renderer, not by the world, so
 * save/load doesn't need to know about it.
 *
 * Ageing uses world.tick (NOT wall-clock): if the simulation pauses
 * (POSTGAME, tab switch), effects pause too — same as the spark physics.
 */

import { Application, Graphics } from 'pixi.js';
import {
  EFFECT_LIFETIME_TICKS,
  type GameEffect,
} from '../game/effects.ts';
import type { World } from '../state/world.ts';

interface ActiveEffect {
  readonly effect: GameEffect;
  readonly bornTick: number;
}

const COMMIT_DURATION_TICKS = 24; // 0.4s @ 60Hz
const ERASE_DURATION_TICKS = 30; // 0.5s @ 60Hz

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
        this.active.push({ effect: e, bornTick: e.tick });
      }
      world.effects.length = 0;
    }

    // Age + cull.
    const g = this.graphics;
    g.clear();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      const age = world.tick - a.bornTick;
      const lifetime =
        a.effect.kind === 'BOND_COMMIT' ? COMMIT_DURATION_TICKS : ERASE_DURATION_TICKS;
      if (age < 0 || age > Math.max(lifetime, EFFECT_LIFETIME_TICKS)) {
        // Past lifetime or rewound below birth (softReset/load) — drop.
        this.active.splice(i, 1);
        continue;
      }
      const t = Math.min(1, age / lifetime);
      this.draw(a.effect, t);
    }
  }

  private draw(effect: GameEffect, t: number): void {
    const g = this.graphics;
    if (effect.kind === 'BOND_COMMIT') {
      // Expanding ring with ease-out.
      const eased = 1 - (1 - t) * (1 - t); // quadratic ease-out
      const r = effect.radius + eased * effect.radius * 2.5;
      const alpha = 1 - eased;
      g.circle(effect.pos.x, effect.pos.y, r).stroke({
        width: 2 - eased,
        color: effect.color,
        alpha: 0.85 * alpha,
      });
      // Inner flash on the bonded primitive — first 30% of the lifetime.
      if (t < 0.3) {
        const flashAlpha = (0.3 - t) / 0.3;
        g.circle(effect.pos.x, effect.pos.y, effect.radius * 1.4).fill({
          color: effect.color,
          alpha: 0.45 * flashAlpha,
        });
      }
    } else {
      // SEVER_ERASE: shrinks + fades, with a faint outward shockwave.
      const eased = t * t; // quadratic ease-in
      const ghostR = effect.radius * (1 - 0.4 * eased);
      const ghostAlpha = (1 - eased) * 0.7;
      g.circle(effect.pos.x, effect.pos.y, ghostR).fill({
        color: effect.color,
        alpha: ghostAlpha,
      });
      const shockR = effect.radius + eased * effect.radius * 3.5;
      const shockAlpha = (1 - eased) * 0.4;
      g.circle(effect.pos.x, effect.pos.y, shockR).stroke({
        width: 1,
        color: effect.color,
        alpha: shockAlpha,
      });
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
