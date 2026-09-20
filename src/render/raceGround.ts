/**
 * SPARK — S185 — **THE GROUND UNDER A TOWER BELONGS TO ITS RACE.**
 *
 * Owner: *"It kinda looks like it's sticking out like a sore thumb … maybe goo for zombies, blood
 * for vampires, cracks with fire for demons."* And, ruling the open questions this session: the
 * demon crack burns **violet**, not orange (*"cracks with purple fire. Easy. Violet magentified."*);
 * a slight animation is welcome and comes back out if it is too busy; and whether the decal is also
 * the buildable FOOTPRINT is *"let's just try it and see how it lands."*
 *
 * ## ⛔ ZERO ART, AND THAT IS NOT A COMPROMISE — IT IS THE BETTER ANSWER HERE
 *
 * A decal per race × per tower size would be a combinatorial art bill, and it would be fixed at one
 * size. Drawn procedurally it costs nothing, scales to whatever the structure's hull actually is,
 * and stays correct when a tower is retuned. Four procedural ground marks already ship in this tree
 * (`turretRenderer` and `stinkTowerRenderer` both lay an ellipse shadow under themselves), so the
 * technique is proven here rather than proposed.
 *
 * ## ⚠ THE PALETTE IS THE PART THAT WOULD HAVE FAILED, AND THE REPO ALREADY MEASURED IT ONCE
 *
 * The board is PURE BLACK. `creatureLift.ts` records the measurement: its first cut drew `0x000000`
 * at alpha 0.22 and a pixel sample could not tell it from the background. So **nothing here is
 * black or near-black** — every decal is built from its own race's live colour, darkened for the
 * body and brightened for the accent, so it reads against the board AND against that race's own
 * backdrop, which was generated from the same identity.
 *
 * ## ⛔ NO RANDOMNESS, NO WALL CLOCK
 *
 * Variation is derived from the structure's id via `mix32`, and animation is a function of
 * `world.tick`. Two peers draw the identical ground, and a paused sim has still ground.
 */

import { RACE_COLORS, type RaceId } from '../state/races.ts';
import { mix32 } from '../state/rng.ts';

/** The minimal surface these draws need — so the geometry can be tested without Pixi. */
export interface GroundTarget {
  ellipse: (x: number, y: number, hw: number, hh: number) => GroundTarget;
  poly: (points: number[]) => GroundTarget;
  fill: (style: { color: number; alpha: number }) => GroundTarget;
  moveTo: (x: number, y: number) => GroundTarget;
  lineTo: (x: number, y: number) => GroundTarget;
  stroke: (style: { color: number; alpha: number; width: number }) => GroundTarget;
}

/** Scale a packed RGB toward black (`f < 1`) or toward white (`f > 1`), per channel, clamped. */
export function shade(color: number, f: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * f)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * f)));
  return (r << 16) | (g << 8) | b;
}

/**
 * ⭐ WHICH RACES BREATHE, AND WHY THE OTHER FOUR DO NOT.
 *
 * Owner: *"if it's a slight animation then sure — little bubbles happening or whatever. If it's too
 * much, then we will remove the animation."* So it is deliberately the two where motion is the
 * MATERIAL: goo bubbles and fire flickers. Sand, blood, silt and trampled earth are still things,
 * and six towers all pulsing at once is the "too much" he is guarding against.
 *
 * ⛔ Turning these off is one edit, which is exactly the reversibility he asked for.
 */
export const ANIMATED_RACES: Readonly<Record<RaceId, boolean>> = {
  zombies: true,
  demons: true,
  vampires: false,
  nagas: false,
  mummies: false,
  orcs: false,
};

/** A deterministic 0..1 from an id and a salt — the project's standing pattern for variation. */
export function jitter(id: number, salt: number): number {
  return ((mix32(id, salt) >>> 8) & 0xffff) / 0xffff;
}

/**
 * Draw one race's ground mark, centred on `(cx, cy)`, sized to a hull of `hw × hh` half-extents.
 *
 * ⚠ `tick` drives the two animated races only. It is the SYNCED `world.tick`, never a wall clock —
 * a render that branches on wall time is a desync waiting for a slow frame, and this file is drawn
 * on both peers.
 */
export function drawRaceGround(
  g: GroundTarget,
  race: RaceId,
  id: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  tick: number,
): void {
  const base = RACE_COLORS[race];
  // the body sits well below the race colour so the tower reads on top of it, never against it
  const body = shade(base, 0.32);
  const accent = shade(base, 1.0);
  const rx = hw;
  const ry = hh * 0.55; // the ground reads as a flattened disc, not a sphere

  switch (race) {
    case 'zombies': {
      // a goo pool with a slow bubble — the one he named first
      g.ellipse(cx, cy, rx, ry).fill({ color: body, alpha: 0.5 });
      g.ellipse(cx, cy, rx * 0.72, ry * 0.72).fill({ color: shade(base, 0.5), alpha: 0.42 });
      for (let i = 0; i < 4; i++) {
        const ph = (tick / 60 + jitter(id, i)) % 1; // one slow cycle per second, per bubble
        const r = ry * 0.16 * Math.sin(ph * Math.PI); // swells then pops
        if (r <= 0.4) continue;
        const bx = cx + (jitter(id, i + 10) - 0.5) * rx * 1.2;
        const by = cy + (jitter(id, i + 20) - 0.5) * ry * 1.1;
        g.ellipse(bx, by, r, r * 0.8).fill({ color: accent, alpha: 0.5 });
      }
      break;
    }
    case 'demons': {
      // ⭐ HIS RULING: the crack burns VIOLET, not orange. Cracks radiate from under the building.
      g.ellipse(cx, cy, rx, ry).fill({ color: shade(base, 0.22), alpha: 0.55 });
      const pulse = 0.55 + 0.35 * Math.sin((tick / 60) * Math.PI); // a slow ember breath
      for (let i = 0; i < 5; i++) {
        const a = jitter(id, i) * Math.PI * 2;
        const len = rx * (0.55 + jitter(id, i + 30) * 0.45);
        const kx = cx + Math.cos(a) * len;
        const ky = cy + Math.sin(a) * len * 0.55;
        g.moveTo(cx, cy).lineTo(kx, ky)
          .stroke({ color: accent, alpha: 0.35 + pulse * 0.4, width: 2.5 });
      }
      g.ellipse(cx, cy, rx * 0.34, ry * 0.34).fill({ color: accent, alpha: 0.25 + pulse * 0.25 });
      break;
    }
    case 'vampires': {
      // blood, pooled and gone tacky at the rim
      g.ellipse(cx, cy, rx, ry).fill({ color: shade(base, 0.26), alpha: 0.55 });
      g.ellipse(cx + rx * 0.1, cy + ry * 0.08, rx * 0.6, ry * 0.58)
        .fill({ color: shade(base, 0.45), alpha: 0.5 });
      for (let i = 0; i < 3; i++) {
        const a = jitter(id, i + 40) * Math.PI * 2;
        const d = rx * (0.85 + jitter(id, i + 50) * 0.3);
        g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.55, rx * 0.1, ry * 0.1)
          .fill({ color: shade(base, 0.4), alpha: 0.5 });
      }
      break;
    }
    case 'mummies': {
      // drifted sand, banked on one side the way wind actually leaves it
      g.ellipse(cx, cy, rx, ry).fill({ color: shade(base, 0.3), alpha: 0.42 });
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * ry * 0.34;
        g.ellipse(cx + rx * 0.16, cy + off, rx * (0.85 - i * 0.16), ry * 0.3)
          .fill({ color: shade(base, 0.42 + i * 0.07), alpha: 0.34 });
      }
      break;
    }
    case 'nagas': {
      // wet silt with pale rings, the drowned-citadel floor its backdrop is built on
      g.ellipse(cx, cy, rx, ry).fill({ color: shade(base, 0.24), alpha: 0.5 });
      for (let i = 1; i <= 3; i++) {
        const f = i / 3;
        g.ellipse(cx, cy, rx * f, ry * f)
          .stroke({ color: accent, alpha: 0.18 + (1 - f) * 0.16, width: 1.5 });
      }
      break;
    }
    case 'orcs': {
      // hardpan: scuffed, trampled, irregular — the one race that may eventually want real art
      g.ellipse(cx, cy, rx, ry).fill({ color: shade(base, 0.26), alpha: 0.45 });
      for (let i = 0; i < 5; i++) {
        const a = jitter(id, i + 60) * Math.PI * 2;
        const d = rx * (0.3 + jitter(id, i + 70) * 0.6);
        const sx = cx + Math.cos(a) * d;
        const sy = cy + Math.sin(a) * d * 0.55;
        g.moveTo(sx, sy).lineTo(sx + rx * 0.18, sy + ry * 0.05)
          .stroke({ color: shade(base, 0.55), alpha: 0.4, width: 2 });
      }
      break;
    }
  }
}
