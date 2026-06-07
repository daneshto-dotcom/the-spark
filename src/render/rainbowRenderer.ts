/**
 * SPARK — S75 P3 rainbow renderer.
 *
 * A single shared Graphics, cleared + redrawn each frame from world.rainbows (max 1 live, so a
 * per-entity sprite Map is overkill — mirrors BombRenderer). The rainbow is deliberately DUMB-
 * looking: a chunky 6-band semicircular arc, two googly eyes, and one big goofy tooth. It bobs
 * gently (render-only, from world.tick) so it reads as a friendly, clickable pickup rather than
 * a hazard. Clicking it (TRIGGER_RAINBOW) shuffles everyone's colour. Pure Pixi vector (no
 * assets); runs on host AND client (clients see it via the additive-optional rainbows[]
 * NetSnapshot field; they never simulate it).
 */

import { Application, Graphics } from 'pixi.js';
import { RAINBOW_RADIUS } from '../constants.ts';
import type { World } from '../state/world.ts';

// Classic ROYGBIV-ish 6 bands — deliberately NOT the PLAYER_COLORS palette (the rainbow is a
// neutral object, and a literal rainbow reads instantly as "the colour thing").
const RAINBOW_BANDS = [0xff4d4d, 0xff9f1c, 0xffe23b, 0x44ff5e, 0x3bd7ff, 0xb15bff];
const TOOTH_COLOR = 0xffffff;
const EYE_COLOR = 0x1a1320;
const BOB_HZ = 1.1; // gentle vertical bob, ~1×/sec

export class RainbowRenderer {
  private readonly graphics: Graphics;

  constructor(app: Application) {
    this.graphics = new Graphics();
    app.stage.addChild(this.graphics);
  }

  /** Clear + redraw every rainbow from world.rainbows. Cheap no-op when empty. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    if (world.rainbows.size === 0) return;

    // Gentle bob (render-only; pauses with the sim like the effects layer).
    const bob = Math.sin((world.tick / 60) * BOB_HZ * Math.PI * 2) * 2;

    for (const rainbow of world.rainbows.values()) {
      const cx = rainbow.pos.x;
      const cy = rainbow.pos.y + bob;
      const R = RAINBOW_RADIUS;
      const band = R / (RAINBOW_BANDS.length + 1.5); // arc band thickness

      // 6 concentric arc bands, outer (red) to inner (violet) — a top semicircle (y is down,
      // so PI..2PI is the upper half).
      for (let i = 0; i < RAINBOW_BANDS.length; i++) {
        const r = R - i * band - band * 0.5;
        g.arc(cx, cy, r, Math.PI, Math.PI * 2).stroke({
          width: band * 0.95,
          color: RAINBOW_BANDS[i],
          alpha: 0.95,
          cap: 'butt',
        });
      }

      // One big goofy tooth hanging from the arc's flat bottom (centred).
      const toothW = band * 1.1;
      const toothH = band * 2.2;
      g.poly([
        cx - toothW, cy,
        cx + toothW, cy,
        cx, cy + toothH,
      ]).fill({ color: TOOTH_COLOR, alpha: 0.95 });

      // Two dumb little googly eyes tucked under the arc.
      const eyeR = Math.max(1.5, band * 0.28);
      g.circle(cx - R * 0.34, cy - band * 0.6, eyeR).fill({ color: EYE_COLOR, alpha: 0.9 });
      g.circle(cx + R * 0.34, cy - band * 0.6, eyeR).fill({ color: EYE_COLOR, alpha: 0.9 });
    }
  }

  /** Drop the rainbow graphics (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
