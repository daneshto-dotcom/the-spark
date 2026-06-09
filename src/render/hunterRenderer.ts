/**
 * SPARK — S72 P2 Pac-Man hunter renderer.
 *
 * A single shared Graphics, cleared + redrawn each frame from world.hunters (max 1
 * live — a per-entity sprite Map is overkill; mirrors BombRenderer / EffectsRenderer).
 * Pure Pixi VECTOR (a chomping wedge + eye) — NO sprite assets (simpler than
 * Voltkin's textures; Council Fork C separate + self-contained). Reads world.tick
 * via the FSM state for the catch-burst + escape-fade, and performance.now() for the
 * smooth mouth chomp (so the chomp animates fluidly even on the 10Hz client). Runs on
 * host AND client (the client sees hunters via the additive-optional hunters[]
 * NetSnapshot field; it never simulates). Faces the chased player's avatar.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { HUNTER_CATCH_HOLD_TICKS, HUNTER_DESPAWN_FADE_TICKS, HUNTER_RADIUS } from '../constants.ts';
import type { World } from '../state/world.ts';

const BODY_COLOR = 0xffd21a; // Pac-Man gold
const OUTLINE_COLOR = 0x3a2a00; // dark-gold outline so the "mouth" reads as a threat
const EYE_COLOR = 0x1a1320; // near-black eye
const CHOMP_HZ = 4; // mouth open/close ~4×/sec
const MOUTH_MIN = 0.06 * Math.PI; // nearly closed
const MOUTH_MAX = 0.3 * Math.PI; // wide open

export class HunterRenderer {
  private readonly graphics: Graphics;

  // S77 P2 — `parent` defaults to app.stage but main.ts passes aboveFogLayer so the hunter
  // (board-wide chaser) renders THROUGH the fog to all players. Rule: visible-to-all iff can-affect-all.
  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  /** Clear + redraw every hunter from world.hunters. Cheap no-op when empty. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    if (world.hunters.size === 0) return;

    const tSec = performance.now() / 1000;

    for (const hunter of world.hunters.values()) {
      const { x, y } = hunter.pos;
      const r = HUNTER_RADIUS;

      // Face the chased player's avatar. Guard if the target is gone this frame —
      // the host despawns on a missing target, but render defensively (default +x).
      const target = world.players.get(hunter.targetPlayerId);
      const facing = target !== undefined
        ? Math.atan2(target.avatarPos.y - y, target.avatarPos.x - x)
        : 0;

      // Mouth chomp: smooth open/close. Snaps shut during the CATCHING bite.
      const chompPhase = (Math.sin(tSec * CHOMP_HZ * Math.PI * 2) + 1) * 0.5; // 0..1
      let mouth = MOUTH_MIN + (MOUTH_MAX - MOUTH_MIN) * chompPhase;
      let alpha = 1;

      if (hunter.state === 'CATCHING') {
        // Bite down hard + flash an expanding chomp ring.
        const p = Math.min(1, hunter.ticksInState / HUNTER_CATCH_HOLD_TICKS);
        mouth = MOUTH_MIN * (1 - p); // snap fully shut as the bite completes
        g.circle(x, y, r + p * r * 1.6).stroke({ width: 3, color: BODY_COLOR, alpha: 0.6 * (1 - p) });
      } else if (hunter.state === 'DESPAWNING') {
        alpha = Math.max(0, 1 - hunter.ticksInState / HUNTER_DESPAWN_FADE_TICKS);
      }

      // Pac-Man wedge: full disc minus the mouth gap centred on `facing`.
      g.moveTo(x, y);
      g.arc(x, y, r, facing + mouth, facing + Math.PI * 2 - mouth);
      g.lineTo(x, y);
      g.fill({ color: BODY_COLOR, alpha });
      g.stroke({ width: 2, color: OUTLINE_COLOR, alpha: alpha * 0.8 });

      // Eye — offset perpendicular to the facing axis (toward the "top" of the head).
      const eyeAngle = facing - Math.PI / 2;
      const eyeDist = r * 0.45;
      g.circle(
        x + Math.cos(eyeAngle) * eyeDist,
        y + Math.sin(eyeAngle) * eyeDist,
        r * 0.13,
      ).fill({ color: EYE_COLOR, alpha });
    }
  }

  /** Drop the hunter graphic (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
