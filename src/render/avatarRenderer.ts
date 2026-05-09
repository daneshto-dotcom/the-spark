/**
 * SPARK — player avatar renderer.
 * Spec § I LOCKED: "You are a single glowing spark on a black field."
 *
 * The player IS a spark — a small glowing point at the cursor location,
 * tinted in the player's color. This is the visual proof of the
 * "spark = player avatar" half of the overloaded term. (The other half —
 * spark = building block — is now visually distinct: free building blocks
 * are colorless shapes, the player avatar is a colored glow.)
 *
 * Phase 1 = solo, only P1 visible. Phase 2 will iterate over all 6 players
 * but render only those visible through the local player's fog mask.
 */

import { Application, Container, Graphics } from 'pixi.js';
import type { Controls } from '../input/controls.ts';
import type { World } from '../state/world.ts';
import type { PlayerId } from '../types.ts';

const AVATAR_INNER_RADIUS = 4;
const AVATAR_OUTER_RADIUS = 11;
const AVATAR_INNER_ALPHA = 0.95;
const AVATAR_OUTER_ALPHA = 0.35;

export class AvatarRenderer {
  private readonly container: Container;
  private readonly graphics: Graphics;

  constructor(app: Application, private readonly playerId: PlayerId) {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    app.stage.addChild(this.container);
  }

  /**
   * Draw the local player's avatar at cursor position. Always visible —
   * the avatar IS the player. Sits on top of the structure layer but below
   * the HUD, so it never disappears behind a structure the player walks
   * over.
   */
  sync(world: World, controls: Controls): void {
    const g = this.graphics;
    g.clear();
    const player = world.players.get(this.playerId);
    if (player === undefined) return;
    const { x, y } = controls.cursor;

    // Outer glow halo.
    g.circle(x, y, AVATAR_OUTER_RADIUS)
      .fill({ color: player.color, alpha: AVATAR_OUTER_ALPHA });
    // Mid ring — gives the spark some visual weight without bloom.
    g.circle(x, y, (AVATAR_INNER_RADIUS + AVATAR_OUTER_RADIUS) / 2)
      .fill({ color: player.color, alpha: AVATAR_OUTER_ALPHA + 0.15 });
    // Inner core.
    g.circle(x, y, AVATAR_INNER_RADIUS)
      .fill({ color: player.color, alpha: AVATAR_INNER_ALPHA });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
