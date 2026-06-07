/**
 * SPARK — S71 P1 bomb renderer.
 *
 * A single shared Graphics, cleared + redrawn each frame from world.bombs (max 1
 * live, so a per-entity sprite Map is overkill — mirrors EffectsRenderer's single-
 * Graphics approach). Each bomb is a distinct DARK pulsing orb with a red danger
 * ring + a warm fuse spark: clearly a hazard if you look, but easy to misclick in
 * the rush (Council "distinct but misclickable"). Pure render — reads world.tick
 * for the pulse phase (render-only, never mutates state) and pauses with the sim
 * exactly like the effects layer. Runs on host AND client (the client sees bombs
 * via the additive-optional bombs[] NetSnapshot field; it never simulates them).
 */

import { Application, Graphics } from 'pixi.js';
import type { World } from '../state/world.ts';

const BODY_COLOR = 0x1a1320;     // near-black bomb body
const DANGER_COLOR = 0xff4d4d;   // red danger rim + inner glow
const FUSE_COLOR = 0xffd27a;     // warm fuse spark
const PULSE_HZ = 2;              // danger rim pulses ~2×/sec

export class BombRenderer {
  private readonly graphics: Graphics;

  constructor(app: Application) {
    this.graphics = new Graphics();
    app.stage.addChild(this.graphics);
  }

  /** Clear + redraw every bomb from world.bombs. Cheap no-op when empty. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    if (world.bombs.size === 0) return;

    // Pulse phase from world.tick (render-only; pauses with the sim like effects).
    const phase = (Math.sin((world.tick / 60) * PULSE_HZ * Math.PI * 2) + 1) * 0.5; // 0..1

    for (const bomb of world.bombs.values()) {
      const { x, y } = bomb.pos;
      const r = bomb.radius;
      // Outer danger ring — pulses in radius + alpha so the orb reads as "armed".
      g.circle(x, y, r + 3 + phase * 3).stroke({
        width: 2,
        color: DANGER_COLOR,
        alpha: 0.35 + phase * 0.4,
      });
      // Dark body.
      g.circle(x, y, r).fill({ color: BODY_COLOR, alpha: 0.95 });
      // Inner red core glow.
      g.circle(x, y, r * 0.55).fill({ color: DANGER_COLOR, alpha: 0.25 + phase * 0.25 });
      // Fuse spark at the top.
      g.circle(x, y - r * 0.9, 2.5 + phase * 1.5).fill({
        color: FUSE_COLOR,
        alpha: 0.7 + phase * 0.3,
      });
    }
  }

  /** Drop all bomb graphics (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
