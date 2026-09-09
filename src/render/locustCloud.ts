/**
 * SPARK — S171 (owner R142, R171-I) — **THE LOCUST CLOUD, DRAWN PROCEDURALLY.**
 *
 * Owner, asked whether to code it or generate it:
 *
 * > *"you can try building it with code ... I mean, do the best if you can. You could look like sick,
 * > like really scary looking, you know, just a cloud of little locust flying and, you know, eating
 * > enemies. But if you can do it, then we might just generate a video loop. I'll do it myself and
 * > give it to you."*
 *
 * So this is the version he judges. Under R171-M the locust is NEW art and therefore HIS to generate
 * if this does not earn its place — which makes a procedural cloud the correct thing to ship now, not
 * a placeholder apology.
 *
 * ## The look, and why it is a swarm rather than a sprite
 *
 * A cloud is `LOCUST_SWARM_MOTES` individual insects orbiting a drifting centre at their own radii,
 * speeds and phases. Nothing is a circle outline and nothing pulses in unison — a ring would read as
 * the stink tower's radius, which is the exact complaint the owner made about the zombie death blast
 * (*"kinda looks just like a stink tower radius. It didn't really do anything cool"*). Density is
 * highest at the centre and the motes are drawn as short streaks along their own tangent, so the
 * whole thing reads as a boiling mass with a direction rather than as dots on a circle.
 *
 * ⛔ **NO `Math.random`, NO WALL CLOCK, NO STORED STATE.** Every mote's position is a pure function of
 * `(moteIndex, creatureId, world.tick)` via the integer hash the rot aura already uses. Two peers
 * therefore draw the identical swarm on the identical tick, and a host migration cannot make it jump.
 *
 * ⛔ **IT DRAWS INTO AN EXISTING RENDERER'S GRAPHICS.** A new child of `fogHiddenLayer` would shift
 * its child indices and break `tower-art.spec.ts`'s two hardcoded probes (`children[6]` and
 * `children[11]`), which moved four times in one session. Same rule the rot aura, the chewer, the
 * goblin and the creature renderers all carry.
 *
 * ⚠ **AND IT CULLS.** A cloud is enemy-owned content and 15 seconds long; drawn through the fog it
 * would be a bigger position tell than the boss that launched it.
 */

import type { Graphics } from 'pixi.js';
import { isConcealed } from './concealment.ts';
import type { World } from '../state/world.ts';

/** ⚠ MINE. Enough to read as a mass at a glance, few enough to stay cheap at the population cap. */
const LOCUST_SWARM_MOTES = 22;

/** How far the swarm spreads from its centre, in px. Matched to the cloud's own attack range. */
const SWARM_RADIUS = 26;

/** Ticks for a mote to complete one orbit. Coprime-ish spread so the swarm never beats in unison. */
const ORBIT_TICKS = 47;

/** The insects themselves — a dark, dry, sickly brown-green. Not a glow: a plague reads as dirt. */
const LOCUST_TINT = 0x6b5a2a;
const LOCUST_TINT_DARK = 0x3d3318;

/** The haze the swarm sits in, so the mass has a body rather than being loose specks. */
const HAZE_TINT = 0x5c5326;
const HAZE_ALPHA = 0.17;

/**
 * ⭐ Draw every live locust cloud for this frame. Cheap no-op when none is on the board.
 *
 * ⚠ IT WALKS `world.creatures` ITSELF rather than riding the goblin loop, for the same reason
 * `drawBossAuras` does: that loop is gated on `GOBLIN_KINDS` and on an atlas being READY, and a
 * procedural cloud has no atlas to wait for and is not a goblin.
 */
export function drawLocustClouds(g: Graphics, world: World): void {
  for (const [id, c] of world.creatures) {
    if (c.type !== 'locustCloud') continue;
    if (c.ehp <= 0) continue;
    if (isConcealed(c.pos.x, c.pos.y, c.ownerPlayerId)) continue;
    drawOneCloud(g, world.tick, id as unknown as number, c.pos.x, c.pos.y);
  }
}

/**
 * One cloud: a soft haze, then a boiling swarm of streaked motes over it.
 *
 * ⚠ THE SCATTER IS AN INTEGER HASH OF (mote, id), the same
 * `(k * 2654435761 + id * 40503) >>> 0` idiom the rot aura uses. It gives each cloud its own fixed
 * arrangement — two clouds side by side are visibly different swarms rather than the same one drawn
 * twice — while staying a pure function that both peers reproduce exactly.
 */
function drawOneCloud(g: Graphics, tick: number, id: number, cx: number, cy: number): void {
  // The body of the mass. Two overlapping discs rather than one, so the silhouette is lumpy.
  g.circle(cx, cy, SWARM_RADIUS * 0.82).fill({ color: HAZE_TINT, alpha: HAZE_ALPHA });
  g.circle(cx + SWARM_RADIUS * 0.22, cy - SWARM_RADIUS * 0.14, SWARM_RADIUS * 0.55)
    .fill({ color: HAZE_TINT, alpha: HAZE_ALPHA * 0.8 });

  for (let k = 0; k < LOCUST_SWARM_MOTES; k++) {
    const h = (k * 2654435761 + id * 40503) >>> 0;

    // Per-mote orbit: its own radius, its own phase, and its own direction of travel.
    // `sqrt` on the radius keeps the motes DENSE AT THE CENTRE — without it they ring the edge,
    // which is the stink-tower look this deliberately avoids.
    const rFrac = Math.sqrt(((h >>> 3) % 1000) / 1000);
    const r = 4 + rFrac * SWARM_RADIUS;
    const phase = ((h >>> 13) % 628) / 100;
    const dir = (h & 1) === 0 ? 1 : -1;
    // Inner motes orbit faster, like a real swarm winding around its own core.
    const speed = (1.6 - rFrac * 0.9) * dir;
    const ang = phase + (tick / ORBIT_TICKS) * speed * Math.PI * 2;

    // A shallow vertical squash: the board is seen at an angle, matching the rot aura's 0.55.
    const mx = cx + Math.cos(ang) * r;
    const my = cy + Math.sin(ang) * r * 0.62;

    /*
     * Each insect is a short STREAK along its own tangent, not a dot. That is what sells flight at
     * this size — a dot reads as noise, a streak reads as something going somewhere. Length rises
     * with orbital speed, so the fast inner motes blur and the slow outer ones hold still.
     */
    const tangent = ang + Math.PI / 2 * dir;
    const len = 1.6 + Math.abs(speed) * 1.5;
    const ex = mx + Math.cos(tangent) * len;
    const ey = my + Math.sin(tangent) * len * 0.62;

    // A wingbeat flicker, per-mote out of phase so the mass shimmers instead of blinking.
    const beat = (tick * 2 + k * 5 + id) % 7;
    const alpha = beat < 4 ? 0.92 : 0.5;
    const tint = (h >>> 24) % 3 === 0 ? LOCUST_TINT_DARK : LOCUST_TINT;

    g.moveTo(mx, my).lineTo(ex, ey).stroke({ color: tint, width: 1.4, alpha });
  }
}
