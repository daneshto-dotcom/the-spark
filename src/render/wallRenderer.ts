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

import { Application, Assets, Container, Graphics, TilingSprite, type Texture } from 'pixi.js';
import { wallSegments, wallsAreUp } from '../state/walls.ts';
import { zoneOf, zoneOwner } from '../state/zones.ts';
import { ALL_RACES } from '../state/races.ts';
import type { World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';

/** Half-thickness of each side's strip, in px. The full wall reads as 2× this. */
const STRIP_HALF_W = 5;
/** Breathing pulse cycles per second, driven by world.tick so it pauses with the sim. */
const PULSE_HZ = 0.35;
/** Colour for a border whose adjacent zone has no seated owner (3-player board). */
const UNOWNED_TINT = 0x5a6472;

/**
 * ⭐⭐ S185 — **THE RACE WALLS.** Owner: *"Instead of having just your colour wall in between you and
 * your enemy, it has to be race specific with art … orcish wooden palisades, a coral reef wall for
 * nagas, cracks in the ground with fire for demons."* He generated all six himself.
 *
 * ⚠ STILLS, NOT A LOOP — his call, made after the art landed: *"Don't worry about the loop cinematic
 * of them being taken up and down. Just do it the way it is now, so it fades in and fades out."* So
 * the existing tick-driven breath stays and nothing new animates.
 *
 * The sheets are cropped to their content at an alpha threshold and scaled to 128 px tall on import
 * (993 KiB for all six, against 6.8 MB raw) — they live in `public/`, so none of this is in the JS
 * bundle.
 */
const WALL_ART_BASE = '/art/race-walls';
/** How tall a wall reads on the board. The art is authored 128 px tall and scales to this. */
const WALL_H = 34;

/**
 * ⛔⛔ **WHICH SIDE OF THE BORDER IS THIS ZONE ON? DERIVED, BECAUSE THE HAND-PICKED SIGNS WERE HALF
 * WRONG AND NOBODY COULD SEE IT.** Owner, S185: *"the racial wall is on the other side, which is
 * wrong … your own wall needs to be at the border of your own zone. It just makes sense."*
 *
 * The old code offset `zoneA` by `-1` and `zoneB` by `+1` along the segment normal. That is not a
 * property of a zone, it is a property of the SEGMENT'S WINDING, and the two disagree across the
 * board: on the NORTH arm (`zoneA: 0` left, running downward) the normal points left, so zone 0 was
 * pushed RIGHT onto its neighbour — his bug. On the EAST arm (`zoneA: 1` top, running rightward) the
 * normal points down, so zone 1 was correctly pushed UP.
 *
 * ⛔ **SO A GLOBAL SIGN FLIP WOULD HAVE FIXED THE ARM HE LOOKED AT AND SILENTLY BROKEN THE ONE HE
 * DID NOT.** Asking the board which zone actually lies off the segment's normal is correct for
 * every arm, for both layouts, and for any future board with a diagonal border.
 */
export function sideSignFor(
  layout: Parameters<typeof zoneOf>[1],
  seg: { a: { x: number; y: number }; b: { x: number; y: number }; zoneA: number },
  nx: number, ny: number,
): 1 | -1 {
  const mx = (seg.a.x + seg.b.x) / 2;
  const my = (seg.a.y + seg.b.y) / 2;
  // far enough off the line to be unambiguously inside a zone rather than on the seam
  const probe = 24;
  const hit = zoneOf({ x: mx + nx * probe, y: my + ny * probe }, layout);
  return hit === seg.zoneA ? 1 : -1;
}
export class WallRenderer {
  private readonly graphics: Graphics;
  private readonly spriteLayer: Container;
  /** One tiling sprite per (segment, side), rebuilt lazily and reused across frames. */
  private readonly strips: Map<string, TilingSprite> = new Map();
  private readonly art: Map<string, Texture> = new Map();
  private artLoadStarted = false;

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    this.spriteLayer = new Container();
    parent.addChild(this.spriteLayer);
  }

  /**
   * One-time lazy load of the six race sheets. Failure is silent and NOT fatal: the coloured strip
   * below keeps every border visible and readable, so a peer that cannot fetch the art still sees
   * exactly where the walls are — it just sees them plain.
   */
  private ensureArt(): void {
    if (this.artLoadStarted) return;
    this.artLoadStarted = true;
    for (const race of ALL_RACES) {
      void (async (): Promise<void> => {
        try {
          this.art.set(race, (await Assets.load(`${WALL_ART_BASE}/${race}.png`)) as Texture);
        } catch {
          /* plain strip carries it */
        }
      })();
    }
  }

  /** Clear + redraw every border wall. No-op the moment the walls drop. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    // ⛔ S149 P5 FIX — PLAYING ONLY. `wallsAreUp` asks about the PHASE, and a world that has never
    // started a match still reads `matchPhase === 'BUILD'` (the birth default), so the walls were
    // being drawn straight across the TITLE SCREEN and the lobby. Caught by looking at an arcade
    // screenshot, not by any test — no unit test asserts what the title screen looks like.
    if (world.gameState !== 'PLAYING') { this.hideStrips(); return; }
    if (!wallsAreUp(world)) { this.hideStrips(); return; } // FIGHT — the walls drop, and that IS the state

    // A slow breath so a raised wall reads as active rather than as scenery. Tick-driven, so it
    // freezes with the sim exactly like the other pulses in this folder.
    this.ensureArt();
    const live = new Set<string>();
    const pulse = (Math.sin((world.tick / 60) * PULSE_HZ * Math.PI * 2) + 1) * 0.5; // 0..1
    const alpha = 0.55 + pulse * 0.25;

    let segIndex = -1;
    for (const seg of wallSegments(world.layout)) {
      segIndex++;
      // Unit vector along the segment, and its normal — the offset that separates the two owners'
      // strips. Segments are axis-aligned today, but deriving the normal rather than assuming it
      // keeps this correct if a future board ever has a diagonal border.
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const nx = -dy / len;
      const ny = dx / len;

      /*
       * ⭐⭐ S185 — EACH ZONE'S WALL STANDS ON ITS OWN SIDE, and the side is DERIVED.
       * Owner: *"your own wall needs to be at the border of your own zone. It just makes sense."*
       * The old `[-1, +1]` pair encoded the segment's winding rather than the zone's position, so it
       * was right on the east arm and wrong on the north one. `sideSignFor` asks the board instead.
       */
      const signA = sideSignFor(world.layout, seg, nx, ny);
      for (const [zone, sign] of [[seg.zoneA, signA], [seg.zoneB, -signA]] as const) {
        const tex = this.artFor(world, zone);
        if (tex !== null) {
          const key = `${segIndex}:${zone}`;
          live.add(key);
          const sp = this.stripFor(key, tex);
          // the art sits OUTSIDE the seam, its inner edge on the border, standing in its own zone
          const off = WALL_H / 2;
          sp.width = len;
          sp.height = WALL_H;
          sp.tileScale.set(WALL_H / tex.height);

          /*
           * ⛔⛔ S185 — **WHICH WAY THE WALL FACES, DERIVED — AND ROTATING BY THE SEGMENT ANGLE ALONE
           * WAS WRONG.** Owner, looking at the first build: *"the pikes are pointing up, away from
           * the enemy's zone, and then on the east side it is pointing towards the wall of the
           * enemy. They should all point either towards the castle or away. The vertical wall should
           * point to the west."*
           *
           * `atan2(dy, dx)` aligns the strip's LENGTH with the border, which is necessary — but it
           * leaves the art's up-vector wherever the winding happens to put it. On a horizontal arm
           * that landed INTO the owner's zone; on a vertical one it landed into the ENEMY's. Two
           * arms, two answers, from one line that looked symmetric.
           *
           * ⭐ A strip can only be laid along its border two ways, so the choice is θ or θ+π. Pick
           * whichever points the art INTO its own zone — the same `inward` vector that already
           * decides which side it stands on, so the wall's side and its facing can never disagree.
           *
           * ⚠ FLIPPING BY π REVERSES THE SPRITE'S OWN +x, so the run must start from the segment's
           * FAR end or the wall extends off the board in the opposite direction. That is the half of
           * this fix that is invisible until you look at the board.
           */
          const inx = nx * sign;
          const iny = ny * sign;
          const theta = Math.atan2(dy, dx);
          // the art is authored standing up, so its up-vector after rotation θ is (sin θ, −cos θ)
          const facesInward = Math.sin(theta) * inx + -Math.cos(theta) * iny > 0;
          const start = facesInward ? seg.a : seg.b;
          sp.position.set(start.x + inx * off, start.y + iny * off);
          sp.rotation = facesInward ? theta : theta + Math.PI;
          sp.pivot.set(0, WALL_H / 2);
          sp.alpha = alpha;
          sp.visible = true;
          continue;
        }
        // fallback: the plain coloured strip, which is still the whole feature if the art is missing
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

    for (const [key, sp] of this.strips) if (!live.has(key)) sp.visible = false;
  }

  /** The race sheet for whoever holds `zone`, or null (unowned seat, or art not resolved yet). */
  private artFor(world: World, zone: number): Texture | null {
    const seat = zoneOwner(zone, world.layout);
    if (seat === null) return null;
    const race = world.players.get(asPlayerId(seat))?.raceId ?? null;
    if (race === null) return null;
    return this.art.get(race) ?? null;
  }

  private stripFor(key: string, tex: Texture): TilingSprite {
    let sp = this.strips.get(key);
    if (sp === undefined) {
      sp = new TilingSprite({ texture: tex, width: 1, height: WALL_H });
      this.spriteLayer.addChild(sp);
      this.strips.set(key, sp);
    } else if (sp.texture !== tex) {
      sp.texture = tex;
    }
    return sp;
  }

  private hideStrips(): void {
    for (const sp of this.strips.values()) sp.visible = false;
  }

  /** Drop the graphic (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
    this.hideStrips();
  }

  destroy(): void {
    this.graphics.destroy();
    this.spriteLayer.destroy({ children: true });
    this.strips.clear();
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
