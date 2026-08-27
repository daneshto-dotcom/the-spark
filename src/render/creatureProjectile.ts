/**
 * SPARK — CREATURE PROJECTILES: the archer's ARROW (S153 P2, R84) and the bat rider's HARPOON
 * (S154 P2, R92).
 *
 * Owner on the archer: *"when the archer shoots there is no projectile flying, its just invisible
 * and looks wierd. we should make a regular arrow when he shoots enemy units and a flaming arrow
 * when he targets buildings/connectors."*
 *
 * ⭐ S154 P2 — AND THE SAME COMPLAINT ABOUT THE BAT RIDER HAD A COMPLETELY DIFFERENT CAUSE. Nothing
 * left him because he had no ranged behaviour at all: `GOBLIN_BAT_CONFIG.attackRange` was
 * `GOBLIN_ATTACK_RANGE` (35), the melee constant, so he flew to CONTACT and hit. Giving him
 * `GOBLIN_BAT_RANGE` (150) is what created a projectile to draw in the first place. His harpoon is a
 * VARIANT of this one mechanism rather than a second system: same derived-from-state channel, same
 * flight window, same unit-vs-structure discriminator, different silhouette.
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
import type { Creature, CreatureType } from '../state/creatures/creature.ts';
import { liftOf } from './creatureLift.ts';
import { distSq } from '../state/creatures/creatureAI.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import type { Vec2 } from '../types.ts';

/** Which silhouette this projectile draws with. */
export type ProjectileKind = 'arrow' | 'harpoon';

/** A resolved shot: where the projectile is flying from, to, whether it burns, and what it is. */
export interface ProjectileShot {
  readonly from: Vec2;
  readonly to: Vec2;
  /** R84 — true when the victim is a structure/connector, false for a unit. */
  readonly flaming: boolean;
  /** 0 → just released, 1 → landing on the fire tick. */
  readonly t: number;
  readonly kind: ProjectileKind;
}

/**
 * Which kinds throw something, and what. Keyed on the creature type rather than on a config flag
 * because this is pure PRESENTATION — `holdsRange` decides who fights at a distance, this decides
 * what the picture of that looks like, and the two are not the same question (a future ranged unit
 * might throw neither an arrow nor a harpoon).
 */
const PROJECTILE_BY_TYPE: Partial<Record<CreatureType, ProjectileKind>> = {
  goblinArcher: 'arrow',
  goblinBat: 'harpoon',
};

/**
 * PURE — resolve the arrow in flight for one creature, or `null` if it is not shooting right now.
 *
 * ⭐ THE FLIGHT WINDOW ENDS EXACTLY ON THE FIRE TICK, and that alignment is the point. Damage is
 * applied at `attackFireTick`; if the arrow landed at any other moment the picture would contradict
 * the simulation, which is precisely the complaint being fixed — the owner is not asking for
 * decoration, they are asking to be able to SEE what already happens.
 */
export function resolveProjectileShot(world: World, c: Creature): ProjectileShot | null {
  const kind = PROJECTILE_BY_TYPE[c.type];
  if (kind === undefined) return null;
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
  /*
   * ⭐ S154 P2 — THE LAUNCH POINT IS LIFTED, and for the bat rider that is not cosmetic. His picture
   * is drawn `GOBLIN_LIFT.goblinBat` = 34 px above his `pos` (see `creatureLift.ts`), so a harpoon
   * launched from `pos` would visibly emanate from empty air below the mount. `liftOf` is 0 for
   * every grounded kind, so the archer's arrow is byte-identical.
   *
   * ⚠ ONLY THE `from` END. The victim is a ground-anchored shape or an unlifted unit, so lifting
   * `to` as well would make the shot arrive above whatever it hits.
   */
  const lift = liftOf(c.type);
  return { from: { x: c.pos.x, y: c.pos.y - lift }, to: { x: to.x, y: to.y }, flaming, t, kind };
}

const SHAFT_LEN = 13;
/** Harpoon geometry — longer and heavier than the arrow, with a line trailing the tail. */
const HARPOON_LEN = 19;
const HARPOON_LINE = 14;
const HARPOON_SHAFT = 0x6f7d8c; // cold iron
const HARPOON_HEAD = 0xc8d2dc; // honed edge, brighter than the shaft so the barbs read
const HARPOON_LINE_COLOR = 0x8a7c63; // hemp
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
export function drawArrow(g: Graphics, shot: ProjectileShot): void {
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

/**
 * PURE draw — the bat rider's HARPOON: a heavier shaft with a barbed head and a trailing line.
 *
 * ⭐ WHY A DIFFERENT SILHOUETTE AND NOT A RECOLOURED ARROW. The owner asked for the bat rider to
 * throw *harpoons*, and at this size the only things that read at a glance are LENGTH, WEIGHT and
 * the presence of a line. So the shaft is thicker and longer than the arrow's, the head is a pair of
 * swept-back barbs rather than a filled triangle, and a slack line trails from the tail toward the
 * thrower — which is also what makes it read as thrown BY someone rather than fired from a machine.
 *
 * The flaming variant reuses the arrow's three-blob procedural wake for the same reason it exists
 * there: two new textures would count against the texture-census growth budget, and a procedural
 * flame costs none of it while reading correctly at this size.
 */
export function drawHarpoon(g: Graphics, shot: ProjectileShot): void {
  const dx = shot.to.x - shot.from.x;
  const dy = shot.to.y - shot.from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const tipX = shot.from.x + dx * shot.t;
  const tipY = shot.from.y + dy * shot.t;
  const tailX = tipX - ux * HARPOON_LEN;
  const tailY = tipY - uy * HARPOON_LEN;

  // The trailing LINE back toward the thrower — slack, so it curves off the flight axis.
  const slackX = tailX - ux * HARPOON_LINE + px * 3.5;
  const slackY = tailY - uy * HARPOON_LINE + py * 3.5;
  g.moveTo(tailX, tailY)
    .quadraticCurveTo(tailX - ux * HARPOON_LINE * 0.5 + px * 5, tailY - uy * HARPOON_LINE * 0.5 + py * 5, slackX, slackY)
    .stroke({ width: 1, color: shot.flaming ? FLAME_OUTER : HARPOON_LINE_COLOR, alpha: 0.5 });

  if (shot.flaming) {
    const blobs: ReadonlyArray<readonly [number, number, number, number]> = [
      [0.3, 6, FLAME_OUTER, 0.3],
      [0.6, 4.4, FLAME_MID, 0.45],
      [0.86, 2.8, FLAME_CORE, 0.7],
    ];
    for (const [along, radius, color, alpha] of blobs) {
      g.circle(tipX - ux * HARPOON_LEN * (1 - along), tipY - uy * HARPOON_LEN * (1 - along), radius).fill({
        color,
        alpha,
      });
    }
  }

  // Shaft — deliberately heavier than the arrow's 1.6.
  g.moveTo(tailX, tailY)
    .lineTo(tipX, tipY)
    .stroke({ width: 2.6, color: shot.flaming ? FLAME_CORE : HARPOON_SHAFT, alpha: 0.95 });

  // Head: a narrow spike plus two swept-back barbs.
  g.moveTo(tipX, tipY)
    .lineTo(tipX - ux * 7 + px * 3.2, tipY - uy * 7 + py * 3.2)
    .lineTo(tipX - ux * 4.5, tipY - uy * 4.5)
    .lineTo(tipX - ux * 7 - px * 3.2, tipY - uy * 7 - py * 3.2)
    .fill({ color: shot.flaming ? FLAME_MID : HARPOON_HEAD, alpha: 0.95 });
}

/** PURE draw — dispatch one resolved shot to its own silhouette. */
export function drawProjectile(g: Graphics, shot: ProjectileShot): void {
  if (shot.kind === 'harpoon') drawHarpoon(g, shot);
  else drawArrow(g, shot);
}

/** Redraw every in-flight projectile this frame. Called from the goblin renderer's sync. */
export function syncCreatureProjectiles(g: Graphics, world: World): void {
  g.clear();
  for (const c of world.creatures.values()) {
    const shot = resolveProjectileShot(world, c);
    if (shot !== null) drawProjectile(g, shot);
  }
}
