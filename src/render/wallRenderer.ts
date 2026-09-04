/**
 * SPARK — S149 P3: the BORDER WALL renderer.
 *
 * *"there are no walls it seems or player zones"* — owner playtest.
 *
 * ⚠ THE SECOND HALF OF THAT SENTENCE IS A RENDER DEFECT, AND IT SURVIVED P1. S149 P1 made the zone
 * partition mechanically real at all six build gates, but probing for THIS priority found that
 * **nothing in `src/render/` draws the partition at all** — there is a quarry-disc renderer and
 * nothing else. So a player was being refused on ground they could not see they did not own, which
 * reads as a broken game rather than a rule. A wall you cannot see is not a wall.
 *
 * ## Two-tone by design
 *
 * *"A wall in that player's colour is erected on the borders he shares with other players' zones."*
 * Every border is SHARED, so each segment is drawn as two parallel strips — one per adjacent zone,
 * each in that zone owner's colour. You read your own wall as yours, from your side.
 *
 * ## Render-only, and phase-driven
 *
 * Reads `world`, never mutates it. Presence is `wallsAreUp(world)`, the same predicate
 * `clampAcrossWalls` would use IF it were ever wired into the sim.
 *
 * ⛔ S163 P5 — IT IS NOT, and this docblock used to assert that it was ("the SAME predicate the
 * sim's movement clamp uses, so the wall cannot be drawn in a phase where it does not block").
 * The clamp has no sim consumer — a measured finding, written up at `clampAcrossWalls` in
 * `walls.ts`; that is the one place for it, so do not restate it here. The wall is therefore a
 * VISIBLE rule: the sealing players feel comes from build legality and BUILD-phase dormancy, not
 * from a movement barrier.
 *
 * One shared `Graphics`, cleared and redrawn each frame (the BombRenderer / SpawnerZoneRenderer
 * idiom), and a cheap no-op during FIGHT.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { wallSegments, wallsAreUp } from '../state/walls.ts';
import { zoneOwner } from '../state/zones.ts';
import type { World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';

/** Half-thickness of each side's strip, in px. The full wall reads as 2× this. */
const STRIP_HALF_W = 5;
/** Breathing pulse cycles per second, driven by world.tick so it pauses with the sim. */
const PULSE_HZ = 0.35;
/** Colour for a border whose adjacent zone has no seated owner (3-player board). */
const UNOWNED_TINT = 0x5a6472;

export class WallRenderer {
  private readonly graphics: Graphics;

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  /** Clear + redraw every border wall. No-op the moment the walls drop. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    // ⛔ S149 P5 FIX — PLAYING ONLY. `wallsAreUp` asks about the PHASE, and a world that has never
    // started a match still reads `matchPhase === 'BUILD'` (the birth default), so the walls were
    // being drawn straight across the TITLE SCREEN and the lobby. Caught by looking at an arcade
    // screenshot, not by any test — no unit test asserts what the title screen looks like.
    if (world.gameState !== 'PLAYING') return;
    if (!wallsAreUp(world)) return; // FIGHT — the walls are down, and drawing nothing IS the state

    // A slow breath so a raised wall reads as active rather than as scenery. Tick-driven, so it
    // freezes with the sim exactly like the other pulses in this folder.
    const pulse = (Math.sin((world.tick / 60) * PULSE_HZ * Math.PI * 2) + 1) * 0.5; // 0..1
    const alpha = 0.55 + pulse * 0.25;

    for (const seg of wallSegments(world.layout)) {
      // Unit vector along the segment, and its normal — the offset that separates the two owners'
      // strips. Segments are axis-aligned today, but deriving the normal rather than assuming it
      // keeps this correct if a future board ever has a diagonal border.
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const nx = -dy / len;
      const ny = dx / len;

      for (const [zone, sign] of [[seg.zoneA, -1], [seg.zoneB, 1]] as const) {
        const ox = nx * STRIP_HALF_W * 0.5 * sign;
        const oy = ny * STRIP_HALF_W * 0.5 * sign;
        g.moveTo(seg.a.x + ox, seg.a.y + oy)
          .lineTo(seg.b.x + ox, seg.b.y + oy)
          .stroke({ width: STRIP_HALF_W, color: tintForZone(world, zone), alpha });
      }

      // A thin bright seam down the middle so the border reads as one wall rather than two fences.
      g.moveTo(seg.a.x, seg.a.y)
        .lineTo(seg.b.x, seg.b.y)
        .stroke({ width: 1, color: 0xffffff, alpha: 0.18 + pulse * 0.12 });
    }
  }

  /** Drop the graphic (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

/**
 * The live colour of whoever owns `zone`, or a neutral grey when nobody does.
 *
 * ⚠ THE UNOWNED CASE IS REAL, NOT DEFENSIVE. R2 puts three players on the quadrant board with one
 * quadrant simply empty, so a border between an occupied zone and an empty one is an ordinary
 * situation — and `zoneOwner` is the identity mapping, so the seat id equals the zone index.
 * Exported for headless unit testing (this class needs Pixi; this function does not).
 */
export function tintForZone(world: World, zone: number): number {
  const seat = zoneOwner(zone, world.layout);
  if (seat === null) return UNOWNED_TINT;
  return world.players.get(asPlayerId(seat))?.color ?? UNOWNED_TINT;
}
