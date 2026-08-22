/**
 * SPARK — S77 P3 seagull renderer.
 *
 * A single shared Graphics, cleared + redrawn each frame from world.seagulls (max 1 live —
 * mirrors BombRenderer / HunterRenderer / RainbowRenderer). Pure Pixi VECTOR (a flapping gull
 * + beak + eye + a soft shadow) — NO sprite assets. Parented into the aboveFogLayer (main.ts)
 * so the gull — a global-reach hazard — renders THROUGH the fog to every player. Runs on host
 * AND client (the client sees gulls via the additive seagulls[] NetSnapshot field; never simulates).
 *
 * The SIM keeps the gull on a straight line (deterministic); the render adds a gentle vertical
 * sine BOB (cosmetic) + wing FLAP, both from performance.now() so they animate fluidly even on
 * the 10Hz client. Faces its flight direction (sign of vx).
 */

import { Application, Container, Graphics } from 'pixi.js';
import { SEAGULL_BOB_AMPLITUDE, SEAGULL_RADIUS } from '../constants.ts';
import type { World } from '../state/world.ts';

const BODY_COLOR = 0xf6f7fb; // gull white (faint cool tint so it reads on the dark board)
const BODY_SHADE = 0xc9ccd8; // wing/underside grey
const BEAK_COLOR = 0xffb02e; // orange beak
const EYE_COLOR = 0x1a1320; // near-black eye
const SHADOW_COLOR = 0x000000; // soft drop shadow under the gull
const FLAP_HZ = 3.2; // wing flaps ~3×/sec
const BOB_HZ = 0.9; // lazy vertical bob

export class SeagullRenderer {
  private readonly graphics: Graphics;

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  /** Clear + redraw every seagull from world.seagulls. Cheap no-op when empty. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    if (world.seagulls.size === 0) return;

    const tSec = performance.now() / 1000;

    for (const gull of world.seagulls.values()) {
      const dir = gull.vx >= 0 ? 1 : -1; // facing: +1 = flying right, -1 = left
      const r = SEAGULL_RADIUS;
      const x = gull.pos.x;
      // Cosmetic bob around the sim altitude (the SIM y stays constant → deterministic).
      const bob = Math.sin(tSec * BOB_HZ * Math.PI * 2) * SEAGULL_BOB_AMPLITUDE;
      const y = gull.pos.y + bob;

      // Soft shadow a little below — sells the "in the sky" depth (shrinks as it bobs up).
      const shadowScale = 1 - (bob / SEAGULL_BOB_AMPLITUDE) * 0.18;
      g.ellipse(x, y + r * 1.7, r * 0.8 * shadowScale, r * 0.22 * shadowScale).fill({
        color: SHADOW_COLOR,
        alpha: 0.16,
      });

      // Flap phase: -1 (wings down) .. +1 (wings up). Wing tips rise/fall + the body dips a touch.
      const flap = Math.sin(tSec * FLAP_HZ * Math.PI * 2);
      const wingTipY = y - r * 0.15 - flap * r * 0.85; // tips sweep above/below the body
      const wingBackX = x - dir * r * 1.15; // trailing wing root behind the body
      const wingFrontX = x + dir * r * 0.15;

      // Body — a plump oval, slightly tilted into the flight direction.
      g.ellipse(x, y, r * 0.92, r * 0.62).fill({ color: BODY_COLOR, alpha: 0.98 });
      // Belly shade.
      g.ellipse(x, y + r * 0.18, r * 0.7, r * 0.32).fill({ color: BODY_SHADE, alpha: 0.5 });

      // Two wings as soft triangles meeting at the shoulder, tips driven by `flap` (the "M" gull
      // silhouette). Drawn as two strokes-with-fill so they read at any flap angle.
      const shoulderX = x - dir * r * 0.1;
      const shoulderY = y - r * 0.1;
      g.moveTo(shoulderX, shoulderY)
        .lineTo(wingBackX, wingTipY)
        .lineTo(x - dir * r * 0.5, y + r * 0.05)
        .closePath()
        .fill({ color: BODY_SHADE, alpha: 0.95 });
      g.moveTo(shoulderX, shoulderY)
        .lineTo(wingFrontX, wingTipY)
        .lineTo(x + dir * r * 0.1, y + r * 0.05)
        .closePath()
        .fill({ color: BODY_COLOR, alpha: 0.97 });

      // Head + beak at the FRONT (flight direction).
      const headX = x + dir * r * 0.72;
      const headY = y - r * 0.12;
      g.circle(headX, headY, r * 0.34).fill({ color: BODY_COLOR, alpha: 0.98 });
      // Beak — a little orange wedge pointing forward.
      g.moveTo(headX + dir * r * 0.28, headY)
        .lineTo(headX + dir * r * 0.72, headY + r * 0.06)
        .lineTo(headX + dir * r * 0.28, headY + r * 0.16)
        .closePath()
        .fill({ color: BEAK_COLOR, alpha: 1 });
      // Eye.
      g.circle(headX + dir * r * 0.08, headY - r * 0.06, r * 0.07).fill({ color: EYE_COLOR, alpha: 1 });
    }
  }

  /** Drop the gull graphic (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
