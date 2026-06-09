/**
 * SPARK — S77 P3 poop renderer.
 *
 * A single shared Graphics, cleared + redrawn each frame from world.poops. Pure Pixi VECTOR — NO
 * assets. Parented into the aboveFogLayer (main.ts) so poop (a global-reach hazard effect) shows
 * THROUGH the fog to everyone. Runs on host AND client (poops ride the additive poops[] snapshot).
 *
 *   FALLING         — a wet teardrop with a tiny wobble + a faint motion streak.
 *   SPLAT_STRUCTURE — a procedural multi-blob splat ON the fouled structure (+ drips) — the
 *                     "your income is halted, go clean it" cue. A short landing POP-scale.
 *   SPLAT_GROUND    — the same splat on the floor (harmless), fading over its TTL.
 *
 * The splat blob layout is derived from the poop id (stable per poop — it must not flicker each
 * frame), and the landing pop + ground fade read world.tick (deterministic; animates on the client
 * too since world.tick advances from snapshots).
 */

import { Application, Container, Graphics } from 'pixi.js';
import { POOP_GROUND_TTL_TICKS, POOP_RADIUS } from '../constants.ts';
import type { World } from '../state/world.ts';

const POOP_LIGHT = 0xeef0d2; // off-white with a faint green (classic "seagull special")
const POOP_DARK = 0x9aa15c; // greenish-brown core
const POOP_GLINT = 0xffffff; // wet highlight
const POP_TICKS = 10; // landing pop-scale settles over ~10 ticks

// Stable blob layout for a splat (units of POOP_RADIUS): [dx, dy, scale]. Rotated per-poop by id
// so each splat looks a little different but never flickers frame-to-frame.
const BLOB_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 1.0],
  [0.85, 0.15, 0.6],
  [-0.7, 0.28, 0.55],
  [0.2, -0.7, 0.5],
  [-0.35, -0.55, 0.45],
  [0.55, 0.7, 0.52],
  [-0.6, -0.15, 0.42],
];

export class PoopRenderer {
  private readonly graphics: Graphics;

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  /** Clear + redraw every poop from world.poops. Cheap no-op when empty. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    if (world.poops.size === 0) return;

    for (const poop of world.poops.values()) {
      const { x, y } = poop.pos;
      const r = POOP_RADIUS;

      if (poop.state === 'FALLING') {
        // Wet teardrop: a round bottom + a pointed top, with a tiny deterministic wobble + streak.
        const wobble = Math.sin(y * 0.08) * 2.5;
        const cx = x + wobble;
        // Faint motion streak above the drop.
        g.moveTo(cx, y - r * 2.6).lineTo(cx, y - r * 0.6).stroke({ width: 1.5, color: POOP_LIGHT, alpha: 0.25 });
        // Teardrop body (pointed top via a triangle blended into the circle).
        g.moveTo(cx, y - r * 1.5)
          .lineTo(cx - r * 0.7, y)
          .lineTo(cx + r * 0.7, y)
          .closePath()
          .fill({ color: POOP_LIGHT, alpha: 0.95 });
        g.circle(cx, y, r * 0.75).fill({ color: POOP_LIGHT, alpha: 0.98 });
        g.circle(cx - r * 0.22, y - r * 0.18, r * 0.22).fill({ color: POOP_GLINT, alpha: 0.6 });
        continue;
      }

      // SPLAT — procedural blob cluster. Landing pop-scale (first ~POP_TICKS) + ground fade.
      const age = world.tick - poop.landedAtTick;
      const pop = age >= 0 && age < POP_TICKS ? 1 + (1 - age / POP_TICKS) * 0.7 : 1;
      const fade =
        poop.state === 'SPLAT_GROUND'
          ? Math.max(0, 1 - age / POOP_GROUND_TTL_TICKS) // dissipate over the TTL
          : 1; // structure splat stays put until cleaned
      if (fade <= 0) continue;

      const phase = ((poop.id as number) % 8) * (Math.PI / 4); // stable per-poop rotation
      for (const [dx, dy, s] of BLOB_OFFSETS) {
        const rx = dx * Math.cos(phase) - dy * Math.sin(phase);
        const ry = dx * Math.sin(phase) + dy * Math.cos(phase);
        g.circle(x + rx * r * pop, y + ry * r * pop, r * s * pop).fill({
          color: POOP_LIGHT,
          alpha: 0.92 * fade,
        });
      }
      // Greenish core + a wet glint so it reads as fresh + gross.
      g.circle(x, y, r * 0.5 * pop).fill({ color: POOP_DARK, alpha: 0.45 * fade });
      g.circle(x - r * 0.25, y - r * 0.22, r * 0.2 * pop).fill({ color: POOP_GLINT, alpha: 0.5 * fade });
      // A couple of drips below the splat.
      g.circle(x - r * 0.5, y + r * 1.05, r * 0.18).fill({ color: POOP_LIGHT, alpha: 0.7 * fade });
      g.circle(x + r * 0.4, y + r * 1.3, r * 0.14).fill({ color: POOP_LIGHT, alpha: 0.55 * fade });
    }
  }

  /** Drop all poop graphics (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
