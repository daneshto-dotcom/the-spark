/**
 * SPARK — S72 P3 potato-bomb renderer.
 *
 * A single shared Graphics, cleared + redrawn each frame from world.potatoes (max 1
 * live — mirrors BombRenderer / HunterRenderer). Pure Pixi VECTOR (a lumpy brown spud +
 * fuse spark; ARMED adds a red danger ring) — NO sprite assets. Draws at potato.pos (the
 * uniform blast center the host keeps synced across FREE/CARRIED/ARMED), so CARRIED needs
 * no special case. The fuse-countdown URGENCY (pulse rate + redness) is driven by
 * (detonateAtTick - world.tick) — the from-SPAWN fuse is visible the whole time, so even
 * a held potato visibly ticks down ("hot potato"). Runs on host AND client (the client
 * sees potatoes via the additive-optional potatoes[] NetSnapshot field; never simulates).
 */

import { Application, Container, Graphics } from 'pixi.js';
import { POTATO_FUSE_TICKS, POTATO_RADIUS } from '../constants.ts';
import { drawHazardRing } from './hazardRing.ts';
import type { World } from '../state/world.ts';

const BODY_COLOR = 0xb5651d; // potato brown
const BODY_DARK = 0x7a431a; // shading + "eyes"
const FUSE_COLOR = 0xffd27a; // warm fuse spark
const ARMED_RING = 0xff4d4d; // red danger ring while ARMED / near detonation

export class PotatoRenderer {
  private readonly graphics: Graphics;

  // S77 P2 — `parent` defaults to app.stage but main.ts passes aboveFogLayer so the potato
  // (owner-agnostic AoE) renders THROUGH the fog to all players. Rule: visible-to-all iff can-affect-all.
  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  /** Clear + redraw every potato from world.potatoes. Cheap no-op when empty. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    if (world.potatoes.size === 0) return;

    const tSec = performance.now() / 1000;

    for (const potato of world.potatoes.values()) {
      const { x, y } = potato.pos;
      const r = POTATO_RADIUS;

      // Fuse urgency: 0 (just spawned) → 1 (about to blow). Pulse faster + redder near 0.
      const remaining = potato.detonateAtTick - world.tick;
      const urgency = Math.max(0, Math.min(1, 1 - remaining / POTATO_FUSE_TICKS));
      const pulseHz = 1 + urgency * 6; // 1 → 7 Hz as the fuse runs down
      const pulse = (Math.sin(tSec * pulseHz * Math.PI * 2) + 1) * 0.5; // 0..1

      // ARMED → a red danger ring (planted + ticking on the board).
      if (potato.state === 'ARMED') {
        g.circle(x, y, r + 4 + pulse * 4).stroke({ width: 2, color: ARMED_RING, alpha: 0.3 + urgency * 0.5 });
      }

      // Potato body — a lumpy oval with a couple of dark "eyes" so it reads as a spud.
      g.ellipse(x, y, r, r * 0.78).fill({ color: BODY_COLOR, alpha: 0.96 });
      g.ellipse(x - r * 0.3, y - r * 0.2, r * 0.5, r * 0.4).fill({ color: BODY_DARK, alpha: 0.32 });
      g.circle(x + r * 0.35, y + r * 0.12, r * 0.14).fill({ color: BODY_DARK, alpha: 0.42 });

      // Fuse spark on top — brightens + reddens with urgency.
      const fuseColor = urgency > 0.66 ? ARMED_RING : FUSE_COLOR;
      g.circle(x, y - r * 0.95, 2 + pulse * (1.5 + urgency * 2)).fill({
        color: fuseColor,
        alpha: 0.7 + pulse * 0.3,
      });

      // S85 P4b — above-fog hazard identity: dashed white ring (CVD-safe; the
      // ARMED ring above is pure-red, exactly the channel CVD players lose).
      // A CARRIED potato skips it — it's in someone's hand, the carry motion
      // is the cue, and the ring would orbit the cursor distractingly.
      if (potato.state !== 'CARRIED') {
        drawHazardRing(g, x, y, r + 8, tSec);
      }
    }
  }

  /** Drop the potato graphic (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
