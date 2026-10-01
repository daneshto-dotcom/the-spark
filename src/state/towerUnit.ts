/**
 * SPARK — S191 R191-A — **A WELDED STRUCTURE HOLDS TOWERS, AND EACH TOWER IS STILL A TOWER.**
 *
 * Owner, S191: *"a welded shape can still consist of multiple towers, okay? When you click on the tower
 * that's connected within the welded shape, you can only see the tower with its stats, but when you
 * click on the shape that's welded to it, you can see the whole structure and what it's made of …
 * people can still like go and destroy the towers themselves … the towers themselves should still be
 * shown as towers and be able to be repaired and … scraped … just the tower, not the whole shape …
 * when you clicking on a welded structure you can't fix it because it's … fixing what … are you fixing
 * all the towers on it no you have to fix [them] manually … you can separate those two."*
 *
 * ## ONE READ MODEL, THREE CONSUMERS
 *
 * The FIX / SCRAP reducers (`structureRepair.ts`), the button model (`structurePanel.ts`) and the card
 * (`characterSheetModel.ts`) all ask the same two questions of the shape a player clicked, and they
 * must never answer them differently — a card that offers the tower's FIX while the reducer repairs
 * the structure is the S149 P2 "promise the host refuses" defect. So both answers live here:
 *
 *   1. **Which TOWER is this shape part of?** (`towerUnitAt`) — the live tower whose own shapes hold it
 *      (`ownPrimitiveIds`; lowest spawner id, then lowest defender id), else — for a STAMPED shape —
 *      its stamp group: the shapes of the same blueprint joined by bonds between stamped shapes, which
 *      is what is left of a stamped tower that FELL (FIX restores it). Else `null`: a free-form shape.
 *   2. **Is the structure WELDED?** (`weldedAt`) — the connected component holds shapes outside that
 *      tower, or (for a free-form shape) holds any tower at all.
 *
 * ⛔ AN UN-WELDED STRUCTURE IS UNTOUCHED BY ALL OF THIS. A lone tower's component IS the tower, so
 * every consumer keeps its pre-S191 path for it, byte for byte.
 *
 * ⚠ SIDE-EFFECT-FREE (no recipe module import), for the reason `towerMembers.ts` states: `world.ts`
 * reaches this file through `structureRepair.ts`.
 */
import type { SparkType } from '../constants.ts';
import type { BondId, DefenderId, PrimitiveId, SpawnerId } from '../types.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import type { World } from './worldTypes.ts';
import { componentOf } from '../game/structure.ts';
import { blueprintFor } from './blueprints.ts';
import { structurePoolFifths } from './stats.ts';
import { towerMembersAt, towerShapeFor } from './towerMembers.ts';

/** A live tower's record, by collection. Spawner ids and defender ids are separate id spaces. */
export type TowerRef =
  | { readonly kind: 'spawner'; readonly id: SpawnerId }
  | { readonly kind: 'defender'; readonly id: DefenderId };

/** A tower as a unit of FIX / SCRAP / the card. `members` ascending, live shapes only. */
export type TowerUnit =
  | {
      readonly kind: 'live';
      readonly ref: TowerRef;
      readonly recipeId: GodlyId;
      readonly anchorId: PrimitiveId;
      readonly members: readonly PrimitiveId[];
    }
  | {
      /** What is left of a STAMPED tower that fell: restorable by its own FIX. */
      readonly kind: 'stamp';
      readonly recipeId: GodlyId;
      readonly members: readonly PrimitiveId[];
    };

interface LiveTower {
  readonly ref: TowerRef;
  readonly recipeId: GodlyId;
  readonly anchorId: PrimitiveId;
  readonly own: readonly PrimitiveId[] | null;
}

/** Every live tower in a TOTAL order: spawners by id, then defenders by id. Never `Map` order. */
function liveTowers(world: World): LiveTower[] {
  const out: LiveTower[] = [];
  const sps = [...world.creatureSpawners.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const sp of sps) {
    out.push({ ref: { kind: 'spawner', id: sp.id }, recipeId: sp.recipeId, anchorId: sp.anchorPrimitiveId, own: sp.ownPrimitiveIds ?? null });
  }
  const ds = [...world.defenders.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const d of ds) {
    out.push({ ref: { kind: 'defender', id: d.id }, recipeId: d.recipeId, anchorId: d.anchorPrimitiveId, own: d.ownPrimitiveIds ?? null });
  }
  return out;
}

/**
 * A live tower's own shapes that still exist, ascending. The RECORD's set when it has one (identity
 * fixed at registration, amended only by FIX); the exact walk for a record that predates the field.
 */
function liveMembers(world: World, t: LiveTower): PrimitiveId[] {
  const own = t.own ?? towerMembersAt(world, t.recipeId, t.anchorId)?.prims ?? [t.anchorId];
  return own.filter((id) => world.primitives.has(id)).sort((a, b) => a - b);
}

function unitOfLive(world: World, t: LiveTower): TowerUnit {
  return { kind: 'live', ref: t.ref, recipeId: t.recipeId, anchorId: t.anchorId, members: liveMembers(world, t) };
}

/**
 * PURE — the STAMP GROUP a stamped shape belongs to: every shape of the same blueprint reachable from
 * it through bonds whose OTHER end is also stamped with that blueprint, by the same seat. Ascending.
 *
 * ⚠ SOUND BECAUSE TWO STAMPS CANNOT TOUCH. A bond only ever joins the shape being placed to shapes
 * already there, and FIX re-welds only its own blueprint's edges — so two stamps of one blueprint are
 * never bonded directly, and a weld (`origin === null`) is never walked through. `blueprintGroupOf`
 * still refuses a repeated node index, which is the fail-closed backstop if that ever changes.
 */
export function stampGroupAt(world: World, primId: PrimitiveId): PrimitiveId[] | null {
  const seed = world.primitives.get(primId);
  if (seed === undefined || seed.origin === null) return null;
  const bp = seed.origin.blueprintId;
  const seen = new Set<PrimitiveId>([primId]);
  const queue: PrimitiveId[] = [primId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const p = world.primitives.get(id)!;
    const next: PrimitiveId[] = [];
    for (const bid of p.bonds) {
      const b = world.bonds.get(bid);
      if (b === undefined) continue;
      const other = b.aId === id ? b.bId : b.aId;
      if (seen.has(other)) continue;
      const q = world.primitives.get(other);
      if (q === undefined || q.origin === null || q.origin.blueprintId !== bp || q.placedBy !== seed.placedBy) continue;
      next.push(other);
    }
    for (const other of next.sort((a, b) => a - b)) {
      seen.add(other);
      queue.push(other);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * ⭐ PURE — the tower `primId` is part of, or `null` for a free-form shape. See the file docblock.
 * ⚠ A shape two live towers share (a shared leaf — `starShape.ts`) resolves to the FIRST in the total
 * order: lowest spawner id, then lowest defender id.
 */
export function towerUnitAt(world: World, primId: PrimitiveId): TowerUnit | null {
  if (!world.primitives.has(primId)) return null;
  for (const t of liveTowers(world)) {
    if (!world.primitives.has(t.anchorId)) continue; // mid-teardown: the poll is about to remove it
    if (liveMembers(world, t).includes(primId)) return unitOfLive(world, t);
  }
  const group = stampGroupAt(world, primId);
  if (group === null) return null;
  const recipeId = world.primitives.get(primId)!.origin!.blueprintId;
  return { kind: 'stamp', recipeId, members: group };
}

/** The shapes of one structure, and every tower in it, in the order the card lists them. */
export interface StructureTowers {
  readonly primitiveIds: ReadonlySet<PrimitiveId>;
  readonly bondIds: ReadonlySet<BondId>;
  /** Live towers (spawners by id, then defenders by id), then fallen stamps by lowest shape id. */
  readonly towers: readonly TowerUnit[];
}

/** PURE — the structure `primId` stands in and the towers welded into it. `null` for a stale id. */
export function structureTowersAt(world: World, primId: PrimitiveId): StructureTowers | null {
  const seed = world.primitives.get(primId);
  if (seed === undefined) return null;
  const comp = componentOf(seed, world.primitives, world.bonds);
  const towers: TowerUnit[] = [];
  const covered = new Set<PrimitiveId>();
  for (const t of liveTowers(world)) {
    if (!comp.primitiveIds.has(t.anchorId)) continue;
    const u = unitOfLive(world, t);
    towers.push(u);
    for (const m of u.members) covered.add(m);
  }
  const stamped = [...comp.primitiveIds]
    .filter((id) => !covered.has(id) && world.primitives.get(id)?.origin != null)
    .sort((a, b) => a - b);
  for (const id of stamped) {
    if (covered.has(id)) continue;
    const u = towerUnitAt(world, id);
    if (u === null || u.kind !== 'stamp') continue;
    towers.push(u);
    for (const m of u.members) covered.add(m);
  }
  return { primitiveIds: comp.primitiveIds, bondIds: comp.bondIds, towers };
}

/**
 * ⭐ PURE — is the structure at `primId` WELDED, as the reducers and the card mean it? A tower's shape:
 * its component holds shapes outside that tower. A free-form shape: its component holds a tower.
 */
export function weldedAt(world: World, primId: PrimitiveId, unit: TowerUnit | null = towerUnitAt(world, primId)): boolean {
  const seed = world.primitives.get(primId);
  if (seed === undefined) return false;
  const comp = componentOf(seed, world.primitives, world.bonds);
  /*
   * ⛔ S192 (audit IDENTITY-5) — MEMBERSHIP, never a size compare. Inside the poll window a broken tower's
   * live own shapes can sit OUTSIDE this component (a detached leaf, the far side of a cut ring), so
   * "component bigger than the tower" read a one-shape weld as un-welded: FIX refused, SCRAP took the weld.
   */
  if (unit !== null) {
    const mine = new Set(unit.members);
    for (const id of comp.primitiveIds) if (!mine.has(id)) return true;
    return false;
  }
  const st = structureTowersAt(world, primId);
  return st !== null && st.towers.length > 0;
}

/** PURE — how many connectors the recipe is built with (its full pool is `structurePoolFifths` of it). */
export function recipeConnectorCount(recipeId: GodlyId): number {
  const shape = towerShapeFor(recipeId);
  if (shape === null) return blueprintFor(recipeId).bonds.length;
  if (shape.kind === 'ring') return shape.n;
  let n = 0;
  for (const a of shape.arms) n += a.count;
  return n;
}

/** A pool read for the card: what is left of it, and what it was. Fifths, on the one ladder. */
export interface PoolRead {
  readonly cur: number;
  readonly max: number;
}

/**
 * ⭐ PURE — **A TOWER'S OWN POOL: THE NUMBER ITS ART FOLLOWS** (R182-B / canon §9d rule 1). The full
 * pool of the connectors it is built with, minus the damage standing on THOSE connectors; a tower that
 * has lost an own connector reads 0 (the crumble rule — `rampHealthFrac`), and a fallen stamp reads 0.
 * The welded structure's pool is `structureHealth`; the two are deliberately different numbers.
 */
export function towerOwnHealth(world: World, unit: TowerUnit): PoolRead {
  const max = structurePoolFifths(recipeConnectorCount(unit.recipeId));
  if (unit.kind !== 'live') return { cur: 0, max };
  const own = towerMembersAt(world, unit.recipeId, unit.anchorId);
  if (own === null || !own.whole) return { cur: 0, max };
  let banked = 0;
  for (const id of own.bonds) banked += world.bonds.get(id)?.damageFifths ?? 0;
  return { cur: Math.max(0, max - banked), max };
}

/**
 * ⭐ PURE — **A STRUCTURE'S POOL** (R173-B): `structurePoolFifths` of its connector count minus every
 * fifth banked on it — the same arithmetic `damageConnector` spends, so the card and the sim agree.
 */
export function structureHealth(world: World, bondIds: ReadonlySet<BondId>): PoolRead {
  const max = structurePoolFifths(bondIds.size);
  let banked = 0;
  for (const id of bondIds) banked += world.bonds.get(id)?.damageFifths ?? 0;
  return { cur: Math.max(0, max - banked), max };
}

/** PURE — what a structure is made of: shape counts by type, ascending type. */
export function structureComposition(
  world: World,
  primitiveIds: ReadonlySet<PrimitiveId>,
): { readonly type: SparkType; readonly count: number }[] {
  const counts = new Map<SparkType, number>();
  for (const id of primitiveIds) {
    const p = world.primitives.get(id);
    if (p !== undefined) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([type, count]) => ({ type, count }));
}

/** PURE — the shapes `unit` shares with ANOTHER live tower (a shared leaf). Ascending. */
export function sharedWithOtherTowers(world: World, unit: TowerUnit): PrimitiveId[] {
  const mine = new Set(unit.members);
  const shared = new Set<PrimitiveId>();
  for (const t of liveTowers(world)) {
    if (unit.kind === 'live' && t.ref.kind === unit.ref.kind && t.ref.id === unit.ref.id) continue;
    for (const m of liveMembers(world, t)) if (mine.has(m)) shared.add(m);
  }
  return [...shared].sort((a, b) => a - b);
}
