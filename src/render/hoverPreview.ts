/**
 * SPARK — ⭐⭐ S195 N7 (owner) — **THE HOVER PREVIEW: WHAT UNIT THIS SHAPE OR GOBLIN IS.**
 *
 * > *"hovering a goblin or a shape … shows you what unit will be produced … a preview of the character
 * > sheet"*, gone when the mouse leaves. *"What is square? Like, people don't know that."* — owner, S195
 *
 * PURE. `hoverPreviewFor(world, x, y, seat, chip)` resolves the pointer to ONE compact card — a name, its
 * tier, the four ladder stats with their derived pool and strike (`statRowsFor`, the same rows the full
 * card prints), and the SHAPE that makes it — or null. Three sources, tried in this order:
 *
 *   1. a FEED CHIP on the open card (`chip`: the slot the card hit-tested — the card owns that layout, so
 *      it hands the shape and the spawner over rather than this resolver re-laying the strip): the unit
 *      `fedCreatureType` says that tower makes of that shape, promoted the way the reducer promotes it
 *      (`towerUnitForSeat`, APEX PREDATOR). Square on the goblin tower → SHIELD GOBLIN.
 *   2. a CREATURE under the pointer — the SAME pick as a click (`controls.ts` `handleSheetSelect`: the
 *      pointer's distance as a FRACTION of each creature's own drawn radius, ties to the lower id — a total
 *      order), so hover == what a click would open. Its own numbers, as its card would print them.
 *   3. a FREE SHAPE under the pointer (a primitive with no bonds — lying in the quarry, carried out of the
 *      castle, or built and never connected): what the viewer's goblin tower would make of it. Squared
 *      distance, then the lower id.
 *
 * ⛔ NOTHING THROUGH THE FOG (S170): a concealed creature or shape resolves to null — the same
 * `isConcealed` the card's frozen bar reads, so the tooltip cannot read through fog the card respects.
 *
 * Render-only: nothing here is on the wire or in the sim; the renderer derives it every frame from synced
 * state and the local pointer (no bump).
 */
import { SparkType } from '../constants.ts';
import { GOBLIN_FEED_MAP } from '../state/goblinKinds.ts';
import { fedCreatureType } from '../state/goblinTowerFeed.ts';
import { towerUnitForSeat } from '../state/racial/apexPredator.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { creatureAttackFifths, creatureMaxEhp, type CreatureType } from '../state/creatures/creature.ts';
import { hellspawnStrikeFifths } from '../state/racial/hellspawn.ts';
import type { World } from '../state/worldTypes.ts';
import type { CreatureId, PlayerId, PrimitiveId, SpawnerId } from '../types.ts';
import { creatureDisplayName, statRowsFor, tierOf, type SheetStatRow } from './characterSheetModel.ts';
import { isConcealed } from './concealment.ts';
import { creatureDrawnSizeRatio } from './towerFrames.ts';

/**
 * ⚠ MINE — how long the pointer rests on a shape / goblin / chip before the preview appears (ms). Long
 * enough that sweeping the pointer across a board full of goblins does not strobe cards; short enough to
 * read as "hover". 0 would show on the first frame. Owner question: none/longer? Recommend keep.
 */
export const HOVER_PREVIEW_DELAY_MS = 180;

/**
 * The creature pick radius, in px, before the per-type drawn-size ratio — `controls.ts`'s
 * `CREATURE_PICK_DIST`, which is private to the input layer. ⛔ `hoverPreview.test.ts` parses that
 * constant out of `controls.ts` and fails if the two ever differ: hover and click MUST pick the same thing.
 */
export const HOVER_CREATURE_PICK_DIST = 34;
/** The same forgiveness the click's shape scan adds to a primitive's radius (`controls.ts`, `prim.radius + 6`). */
export const HOVER_SHAPE_PICK_PAD = 6;

export interface HoverPreview {
  readonly source: 'chip' | 'creature' | 'shape';
  readonly type: CreatureType;
  readonly name: string;
  /** 'GOBLIN' · 'T3' · 'CASTLE' … (`tierOf`). */
  readonly tier: string;
  /** ATK / PEN / HP / DEF with their derived strike and pool — `statRowsFor`, exactly the card's rows. */
  readonly stats: readonly SheetStatRow[];
  /** The shape that makes it (the feed map read backwards), or null for a unit no shape makes. */
  readonly madeFrom: SparkType | null;
  /** The subject, for a caller that wants to open the full card from the preview. */
  readonly subject: { readonly kind: 'creature'; readonly id: CreatureId } | { readonly kind: 'shape'; readonly id: PrimitiveId } | null;
}

export interface HoverChip {
  readonly spawnerId: SpawnerId;
  readonly sparkType: SparkType;
}

/** The shape whose feed makes `type`, or null. The goblin map read backwards — in shape order, a total order. */
export function shapeThatMakes(type: CreatureType): SparkType | null {
  for (const t of [SparkType.Dot, SparkType.Line, SparkType.Triangle, SparkType.Square, SparkType.Circle, SparkType.Spiral]) {
    if (GOBLIN_FEED_MAP[t] === type) return t;
  }
  return null;
}

/** A unit's preview off its TYPE config — the four points and what they derive to. */
function previewOfType(source: HoverPreview['source'], type: CreatureType, madeFrom: SparkType | null): HoverPreview {
  const cfg = getCreatureConfig(type);
  return {
    source,
    type,
    name: creatureDisplayName(type),
    tier: tierOf(type),
    stats: statRowsFor(cfg.hp, cfg.def, cfg.atk, cfg.pen),
    madeFrom,
    subject: null,
  };
}

export function hoverPreviewFor(
  world: World,
  x: number,
  y: number,
  seat: PlayerId,
  chip: HoverChip | null,
): HoverPreview | null {
  // 1 — a FEED chip on the card: what THAT tower makes of THAT shape.
  if (chip !== null) {
    const sp = world.creatureSpawners.get(chip.spawnerId);
    if (sp === undefined) return null;
    const base = fedCreatureType(sp.recipeId, chip.sparkType);
    if (base === null) return null;
    return previewOfType('chip', towerUnitForSeat(world, sp.ownerPlayerId, base), chip.sparkType);
  }

  // 2 — a creature: the click's own pick (fraction of its drawn radius, ties to the lower id).
  let bestId: CreatureId | null = null;
  let bestScore = Infinity;
  for (const c of world.creatures.values()) {
    const r = HOVER_CREATURE_PICK_DIST * creatureDrawnSizeRatio(c.type);
    const score = Math.hypot(x - c.pos.x, y - c.pos.y) / r;
    if (score >= 1) continue;
    if (bestId !== null) {
      if (score > bestScore) continue;
      if (score === bestScore && (c.id as unknown as number) >= (bestId as unknown as number)) continue;
    }
    bestScore = score;
    bestId = c.id;
  }
  if (bestId !== null) {
    const c = world.creatures.get(bestId)!;
    if (isConcealed(c.pos.x, c.pos.y, c.ownerPlayerId)) return null;
    const cfg = getCreatureConfig(c.type);
    return {
      source: 'creature',
      type: c.type,
      name: creatureDisplayName(c.type),
      tier: tierOf(c.type),
      // Its OWN pool and strike — the numbers its full card prints (S187 / S190), never the type's alone.
      stats: statRowsFor(cfg.hp, cfg.def, cfg.atk, cfg.pen, undefined, {
        poolFifths: creatureMaxEhp(c), strikeFifths: hellspawnStrikeFifths(c, creatureAttackFifths(c)),
      }),
      madeFrom: shapeThatMakes(c.type),
      subject: { kind: 'creature', id: c.id },
    };
  }

  // 3 — a free shape: what the VIEWER's goblin tower would make of it.
  let bestPrim: PrimitiveId | null = null;
  let bestD2 = Infinity;
  for (const p of world.primitives.values()) {
    if (p.bonds.size > 0) continue; // built into something: the structure's card answers for it
    const dx = p.pos.x - x;
    const dy = p.pos.y - y;
    const d2 = dx * dx + dy * dy;
    const r = p.radius + HOVER_SHAPE_PICK_PAD;
    if (d2 > r * r) continue;
    if (d2 > bestD2) continue;
    if (d2 === bestD2 && bestPrim !== null && (p.id as unknown as number) >= (bestPrim as unknown as number)) continue;
    bestD2 = d2;
    bestPrim = p.id;
  }
  if (bestPrim !== null) {
    const p = world.primitives.get(bestPrim)!;
    if (isConcealed(p.pos.x, p.pos.y, p.placedBy)) return null;
    const pv = previewOfType('shape', towerUnitForSeat(world, seat, GOBLIN_FEED_MAP[p.type]), p.type);
    return { ...pv, subject: { kind: 'shape', id: p.id } };
  }
  return null;
}
