/**
 * SPARK — S100 P1 (TD Phase 1a) spawner-zone renderer.
 *
 * When a built structure is a LIVE creature-spawner (its id sits in
 * `world.creatureSpawners`, which the host re-validates every poll so only
 * still-valid shapes remain), this draws a RADIATING pulsed aura over the
 * spawner's anchor component + a distinct "alive" pulse along that component's
 * bonds — so the shape reads as a special, more-complex spawn zone, while still
 * visibly being a built structure that can be raided and destroyed (the
 * primitives + bonds themselves are still drawn by structureRenderer underneath;
 * this layer only adds the "it's alive" overlay on top).
 *
 * One shared `Graphics`, cleared + redrawn each frame (mirrors BombRenderer /
 * HunterRenderer / SeagullRenderer — a per-spawner Graphics is overkill at the
 * Phase-1 cap, and one Graphics is the bundle-budget path). Cheap no-op when
 * `world.creatureSpawners` is empty.
 *
 * Determinism / clocks: the breathing/expanding rings are keyed off `world.tick`
 * (render-only, pauses with the sim exactly like bombRenderer's pulse) PLUS a
 * `performance.now()` shimmer so the aura animates fluidly even on the 10 Hz
 * client mirror. RENDER-ONLY — reads `world`, never mutates it. The anchor
 * component is recomputed each frame via `componentOf` (the same on-demand BFS
 * the sim's re-validation uses); at the Phase-1 cap (a handful of spawners over
 * ~5-prim pentagrams) this is negligible.
 *
 * Owner colour tints the aura so each player's spawn zone reads as theirs.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { componentOf } from '../game/structure.ts';
import type { Primitive } from '../game/primitive.ts';
import type { World } from '../state/world.ts';

/** How many concentric rings radiate outward from the zone centre. */
const RING_COUNT = 3;
/** Outer reach of the radiating rings as a multiple of the component radius. */
const RING_REACH = 1.55;
/** Breathing pulse cycles per second (driven by world.tick). */
const PULSE_HZ = 0.6;
/** Cosmetic shimmer cycles per second (driven by performance.now, client-fluid). */
const SHIMMER_HZ = 1.4;
/** Fallback aura tint if the owner colour can't be resolved. */
const FALLBACK_TINT = 0xffd27a;

export class SpawnerZoneRenderer {
  private readonly graphics: Graphics;

  // S100 P1 — defaults to app.stage but main.ts passes aboveFogLayer: a spawn
  // zone is a cross-player landmark (everyone must see the high-value target to
  // raid it), so it renders THROUGH the fog like the other global-reach visuals.
  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  /** Clear + redraw the aura for every live spawner. No-op when none. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    if (world.creatureSpawners.size === 0) return;

    // world.tick pulse (pauses with the sim) + wall-clock shimmer (client-fluid).
    const pulse = (Math.sin((world.tick / 60) * PULSE_HZ * Math.PI * 2) + 1) * 0.5; // 0..1
    const shimmer = (Math.sin((performance.now() / 1000) * SHIMMER_HZ * Math.PI * 2) + 1) * 0.5;

    for (const sp of world.creatureSpawners.values()) {
      const anchor = world.primitives.get(sp.anchorPrimitiveId);
      if (anchor === undefined) continue; // re-validation will remove it next poll
      const comp = componentOf(anchor, world.primitives, world.bonds);

      // Centroid + radius of the anchor component (the zone's footprint).
      let cx = 0;
      let cy = 0;
      let n = 0;
      const prims: Primitive[] = [];
      for (const pid of comp.primitiveIds) {
        const p = world.primitives.get(pid);
        if (p === undefined) continue;
        prims.push(p);
        cx += p.pos.x;
        cy += p.pos.y;
        n++;
      }
      if (n === 0) continue;
      cx /= n;
      cy /= n;
      let radius = 0;
      for (const p of prims) {
        radius = Math.max(radius, Math.hypot(p.pos.x - cx, p.pos.y - cy));
      }
      radius = Math.max(radius + p0Pad(prims), 28); // pad past prim sprites, min floor

      const tint = anchorTint(world, anchor);

      // ── breathing tint disc under the structure (the "alive" glow floor) ──
      g.circle(cx, cy, radius * (0.85 + pulse * 0.1)).fill({
        color: tint,
        alpha: 0.06 + pulse * 0.05,
      });

      // ── radiating concentric rings expanding outward, staggered in phase ──
      for (let i = 0; i < RING_COUNT; i++) {
        // Each ring rides its own offset slice of the pulse so they appear to
        // emanate outward (inner→outer) rather than breathe in unison.
        const ringPhase = (pulse + i / RING_COUNT) % 1;
        const ringR = radius * (0.6 + ringPhase * (RING_REACH - 0.6));
        const ringAlpha = (1 - ringPhase) * 0.45;
        g.circle(cx, cy, ringR).stroke({ width: 2, color: tint, alpha: ringAlpha });
      }

      // ── distinct 'alive' styling on the component's own bonds ──
      // A bright energized pulse traced over each spawner bond (on top of the
      // normal bond visual structureRenderer already drew), so the connectors
      // read as charged/living — and the player can see EXACTLY which bonds to
      // cut to kill the zone.
      const bondAlpha = 0.4 + shimmer * 0.45;
      for (const bid of comp.bondIds) {
        const bond = world.bonds.get(bid);
        if (bond === undefined) continue;
        const a = bond.a as Primitive;
        const b = bond.b as Primitive;
        g.moveTo(a.pos.x, a.pos.y).lineTo(b.pos.x, b.pos.y)
          .stroke({ width: 1.5 + shimmer * 1.5, color: tint, alpha: bondAlpha });
        // A travelling spark bead at the shimmering midpoint sells "energy flow".
        const mx = a.pos.x + (b.pos.x - a.pos.x) * (0.3 + shimmer * 0.4);
        const my = a.pos.y + (b.pos.y - a.pos.y) * (0.3 + shimmer * 0.4);
        g.circle(mx, my, 2 + pulse * 1.5).fill({ color: 0xffffff, alpha: 0.5 + shimmer * 0.4 });
      }

      // ── a steady core glow at the anchor itself (the spawn point) ──
      g.circle(anchor.pos.x, anchor.pos.y, 5 + pulse * 3).fill({
        color: tint,
        alpha: 0.35 + pulse * 0.3,
      });
      g.circle(anchor.pos.x, anchor.pos.y, 2.5).fill({ color: 0xffffff, alpha: 0.85 });
    }
  }

  /** Drop the aura graphic (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

/** Small extra padding past the primitive sprites so the aura clears the shape. */
function p0Pad(prims: readonly Primitive[]): number {
  let r = 0;
  for (const p of prims) r = Math.max(r, p.radius);
  return r * 1.6 + 10;
}

/**
 * Aura tint = the spawner owner's live colour (read off the anchor primitive's
 * ownerColor, which tracks rainbow-shuffles). Falls back to a warm amber if the
 * colour is somehow unresolved. Exported for unit testability.
 */
export function anchorTint(world: World, anchor: Primitive): number {
  const owner = world.players.get(anchor.placedBy);
  if (owner !== undefined) return owner.color;
  if (anchor.ownerColor !== 0) return anchor.ownerColor;
  return FALLBACK_TINT;
}
