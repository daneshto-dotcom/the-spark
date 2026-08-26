/**
 * SPARK — S153 P2 (owner R84) — THE ARCHER'S ARROW.
 *
 * Owner: *"when the archer shoots there is no projectile flying, its just invisible and looks
 * wierd. we should make a regular arrow when he shoots enemy units and a flaming arrow when he
 * targets buildings/connectors."*
 *
 * ## Why this is RENDER-DRIVEN and not a `world.effects` push
 *
 * The obvious build is a new `ARROW_SHOT` effect kind alongside ARC_FLASH. A.0 costed it and it is
 * the wrong shape, for two independent reasons — either one alone would be decisive:
 *
 *  1. ⛔ A NEW EFFECT KIND COSTS A PROTOCOL BUMP. `deserializeEffect` is an EXHAUSTIVE switch with
 *     NO DEFAULT ARM. A peer handed an unknown `kind` falls off the end, returns `undefined`, and
 *     pushes that straight into `world.effects`. This is documented in `save.ts` as the entire
 *     reason PROTOCOL_VERSION went 30→31 for the RAIDED cloud. A second bump, in a session already
 *     carrying eight priorities, to draw an arrow.
 *
 *  2. ⛔ AND IT WOULD BE INVISIBLE FIVE TIMES IN SIX ANYWAY. `goblinRenderer` documents the
 *     measurement: a one-shot `world.effects` push is lost ~5/6 of the time, because the snapshot
 *     samples effects at 10 Hz while the renderer wipes them every frame at 60. An arrow that
 *     appears on one shot in six is worse than no arrow — it reads as a rendering bug.
 *
 * So the arrow is DERIVED, every frame, from state that already rides the wire: `state`,
 * `ticksInState`, `pos`, and the synced creature/primitive populations. That is not a workaround —
 * it is the same channel `chewerRenderer` uses for the gnaw, chosen there for the same reason and
 * documented as such. Host and 1v1 client compute it independently and agree, because it is a pure
 * function of synced state with no wall-clock and no RNG anywhere in it.
 *
 * ## Why the flaming/plain split is re-derived rather than sent
 *
 * The discriminator is "is the thing being struck a unit or a structure". The host knows via
 * `targetCreatureId` — but that field is STRIPPED from the wire by `trimMirrorCreature`, so the
 * client cannot read it. Rather than un-stripping a field (a wire change) the rule is re-evaluated
 * locally from populations both peers hold, using the SAME predicate the sim uses to choose a
 * victim: an enemy creature inside `attackRange` wins, else the committed shape. Same inputs, same
 * rule, same answer on both peers.
 */

import type { Graphics } from 'pixi.js';
import { ARROW_FLIGHT_TICKS } from '../constants.ts';
import type { World } from '../state/world.ts';
import type { Creature } from '../state/creatures/creature.ts';
import { distSq } from '../state/creatures/creatureAI.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import type { Vec2 } from '../types.ts';

/** A resolved shot: where the arrow is flying from, to, and whether it burns. */
export interface ArcherShot {
  readonly from: Vec2;
  readonly to: Vec2;
  /** R84 — true when the victim is a structure/connector, false for a unit. */
  readonly flaming: boolean;
  /** 0 → just released, 1 → landing on the fire tick. */
  readonly t: number;
}

/**
 * PURE — resolve the arrow in flight for one creature, or `null` if it is not shooting right now.
 *
 * ⭐ THE FLIGHT WINDOW ENDS EXACTLY ON THE FIRE TICK, and that alignment is the point. Damage is
 * applied at `attackFireTick`; if the arrow landed at any other moment the picture would contradict
 * the simulation, which is precisely the complaint being fixed — the owner is not asking for
 * decoration, they are asking to be able to SEE what already happens.
 */
export function resolveArcherShot(world: World, c: Creature): ArcherShot | null {
  if (c.type !== 'goblinArcher') return null;
  if (c.state !== 'ATTACKING') return null;

  const config = getCreatureConfig(c.type);
  const fireTick = config.attackFireTick;
  const start = fireTick - ARROW_FLIGHT_TICKS;
  if (c.ticksInState < start || c.ticksInState > fireTick) return null;

  // Same victim rule the sim uses, re-evaluated from synced populations (see docblock).
  const rangeSq = config.attackRange * config.attackRange;
  let to: Vec2 | null = null;
  let flaming = false;

  let bestId = Infinity;
  for (const [id, other] of world.creatures) {
    if (id === c.id) continue;
    if (other.ownerPlayerId === c.ownerPlayerId) continue;
    if (distSq(c.pos, other.pos) > rangeSq) continue;
    // Lowest-id tie-break, matching every other selector in the sim so both peers pick the same one.
    const n = id as unknown as number;
    if (n < bestId) {
      bestId = n;
      to = other.pos;
    }
  }

  if (to === null && c.targetPrimitiveId !== null) {
    const prim = world.primitives.get(c.targetPrimitiveId);
    if (prim !== undefined) {
      to = prim.pos;
      flaming = true; // R84 — buildings and connectors take the burning arrow.
    }
  }
  if (to === null) return null;

  const span = ARROW_FLIGHT_TICKS <= 0 ? 1 : ARROW_FLIGHT_TICKS;
  const t = Math.max(0, Math.min(1, (c.ticksInState - start) / span));
  return { from: { x: c.pos.x, y: c.pos.y }, to: { x: to.x, y: to.y }, flaming, t };
}

const SHAFT_LEN = 13;
const PLAIN_COLOR = 0xd8cdb4; // pale ash shaft
const PLAIN_HEAD = 0x8a8f98; // grey flint
const FLAME_CORE = 0xffe08a;
const FLAME_MID = 0xff9a2e;
const FLAME_OUTER = 0xd8341c;

/**
 * PURE draw — one arrow at its interpolated position, nocked along its own flight direction.
 *
 * The flame is three stacked translucent blobs trailing the shaft rather than a sprite: two new
 * textures would count against the texture-census growth budget the repo tracks, and a procedural
 * flame costs none of it while reading correctly at this size.
 */
export function drawArrow(g: Graphics, shot: ArcherShot): void {
  const dx = shot.to.x - shot.from.x;
  const dy = shot.to.y - shot.from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len;
  const uy = dy / len;

  // Tip position along the flight path.
  const tipX = shot.from.x + dx * shot.t;
  const tipY = shot.from.y + dy * shot.t;
  const tailX = tipX - ux * SHAFT_LEN;
  const tailY = tipY - uy * SHAFT_LEN;

  if (shot.flaming) {
    // Trailing fire — largest and most transparent furthest back, so it reads as a wake.
    const blobs: ReadonlyArray<readonly [number, number, number, number]> = [
      [0.34, 5.2, FLAME_OUTER, 0.3],
      [0.62, 3.8, FLAME_MID, 0.45],
      [0.86, 2.4, FLAME_CORE, 0.7],
    ];
    for (const [along, radius, color, alpha] of blobs) {
      g.circle(tipX - ux * SHAFT_LEN * (1 - along), tipY - uy * SHAFT_LEN * (1 - along), radius).fill({
        color,
        alpha,
      });
    }
  }

  // Shaft.
  g.moveTo(tailX, tailY)
    .lineTo(tipX, tipY)
    .stroke({ width: 1.6, color: shot.flaming ? FLAME_CORE : PLAIN_COLOR, alpha: 0.95 });

  // Head — a small filled triangle at the tip, perpendicular offsets for the barbs.
  const px = -uy;
  const py = ux;
  g.moveTo(tipX, tipY)
    .lineTo(tipX - ux * 4.5 + px * 2.4, tipY - uy * 4.5 + py * 2.4)
    .lineTo(tipX - ux * 4.5 - px * 2.4, tipY - uy * 4.5 - py * 2.4)
    .fill({ color: shot.flaming ? FLAME_MID : PLAIN_HEAD, alpha: 0.95 });

  // Fletching — two short barbs at the tail, plain arrows only (fire would swallow them).
  if (!shot.flaming) {
    g.moveTo(tailX, tailY)
      .lineTo(tailX + ux * 3.5 + px * 2.2, tailY + uy * 3.5 + py * 2.2)
      .stroke({ width: 1.1, color: PLAIN_COLOR, alpha: 0.75 });
    g.moveTo(tailX, tailY)
      .lineTo(tailX + ux * 3.5 - px * 2.2, tailY + uy * 3.5 - py * 2.2)
      .stroke({ width: 1.1, color: PLAIN_COLOR, alpha: 0.75 });
  }
}

/** Redraw every in-flight arrow this frame. Called from the goblin renderer's sync. */
export function syncArcherArrows(g: Graphics, world: World): void {
  g.clear();
  for (const c of world.creatures.values()) {
    const shot = resolveArcherShot(world, c);
    if (shot !== null) drawArrow(g, shot);
  }
}
