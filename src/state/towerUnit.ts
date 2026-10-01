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
 * PURE — the STAMP GROUP a stamped shape belongs to. Ascending.
 *
 * ⭐ S192 (audit SHEETS-1) — **THE WHOLE COMPONENT FIRST.** Every shape in the clicked shape's
 * component stamped with the same blueprint by the same seat and not one of a live same-recipe tower's own, when
 * no node index repeats among them — so a leaf a weld still holds after its own arm was cut is the
 * SAME fallen tower as the hub (round 5 walked stamped-to-stamped bonds only, listed it as a second
 * "DOWN" turret, and its FIX built a whole new turret around it). FIX then re-welds that leaf instead
 * of minting a new one, priced as the connector it lost (R182-E).
 *
 * ⛔ S192 re-audit X2 — and only when every candidate sits in its node slot of ONE fitted stamp
 * (`fitsOneStamp`, ⚠ MINE tolerance): distinct node indices alone admitted two welded turrets with
 * complementary losses as one.
 *
 * ⚠ When a node index REPEATS, or the fit fails (two stamps of one blueprint welded together), it falls
 * back to the stamped-bond walk: every shape of the same blueprint reachable through bonds whose OTHER
 * end is also stamped with it. Sound because a bond only ever joins the shape being placed to shapes
 * already there and FIX re-welds only its own blueprint's edges, so two stamps are never bonded
 * directly; `blueprintGroupOf` still refuses a repeated node index as the fail-closed backstop.
 */
export function stampGroupAt(world: World, primId: PrimitiveId): PrimitiveId[] | null {
  const seed = world.primitives.get(primId);
  if (seed === undefined || seed.origin === null) return null;
  const bp = seed.origin.blueprintId;
  const owned = new Set<PrimitiveId>();
  // A slot a live tower of THIS blueprint holds is its, not the fallen one's; a shape a tower of ANOTHER
  // recipe is also built of (a mummies ring through a turret's hub, W2-4) is still this stamp's node.
  for (const t of liveTowers(world)) if (t.recipeId === bp) for (const m of liveMembers(world, t)) owned.add(m);
  const comp = componentOf(seed, world.primitives, world.bonds);
  const candidates = [...comp.primitiveIds].filter((id) => {
    const q = world.primitives.get(id);
    return q !== undefined && q.origin !== null && q.origin.blueprintId === bp && q.placedBy === seed.placedBy && !owned.has(id);
  }).sort((a, b) => a - b);
  const nodes = new Set(candidates.map((id) => world.primitives.get(id)!.origin!.nodeIndex));
  if (candidates.includes(primId) && nodes.size === candidates.length && fitsOneStamp(world, bp, candidates)) return candidates;
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
 * ⚠ MINE (S192 re-audit X2) — how far a shape may sit from its node slot and still be read as part of
 * ONE stamp, as a fraction of the blueprint's smallest node-to-node spacing: half the spacing, so a
 * shape is never nearer another node's slot than its own. Distinct node indices alone do not identify
 * a single stamp — two welded turrets of one seat with complementary losses passed it, and the FIX
 * re-welded B's leaf to A's hub with a 124 px bond and registered a turret built from two stamps.
 */
export const STAMP_SLOT_TOLERANCE_FRAC = 0.5;

/**
 * PURE — do `ids` (distinct node indices of blueprint `bp`) sit where ONE stamp of it would put them?
 * The closed-form 2-D Procrustes fit `structureRepair.fitBlueprintFrame` uses (rotation about the
 * matched centroids; sums in ascending node order for host/worker bit-equality — duplicated here
 * because `structureRepair.ts` imports this file), then every shape within the tolerance of its slot.
 */
function fitsOneStamp(world: World, bp: GodlyId, ids: readonly PrimitiveId[]): boolean {
  const blueprint = blueprintFor(bp);
  if (blueprint === undefined) return false;
  const pts = ids
    .map((id) => {
      const p = world.primitives.get(id)!;
      const node = blueprint.nodes[p.origin!.nodeIndex];
      return node === undefined ? null : { i: p.origin!.nodeIndex, px: p.pos.x, py: p.pos.y, qx: node.dx, qy: node.dy };
    });
  if (pts.some((q) => q === null)) return false;
  const ps = (pts as { i: number; px: number; py: number; qx: number; qy: number }[]).sort((a, b) => a.i - b.i);
  if (ps.length < 2) return true;
  let minSpacing = Infinity;
  const ns = blueprint.nodes;
  for (let a = 0; a < ns.length; a++) {
    for (let b = a + 1; b < ns.length; b++) {
      const d = Math.hypot(ns[a]!.dx - ns[b]!.dx, ns[a]!.dy - ns[b]!.dy);
      if (d > 0 && d < minSpacing) minSpacing = d;
    }
  }
  if (!Number.isFinite(minSpacing)) return true;
  let sx = 0, sy = 0, sqx = 0, sqy = 0;
  for (const q of ps) { sx += q.px; sy += q.py; sqx += q.qx; sqy += q.qy; }
  const n = ps.length;
  const cx = sx / n, cy = sy / n, qx = sqx / n, qy = sqy / n;
  let num = 0, den = 0;
  for (const q of ps) {
    const ax = q.qx - qx, ay = q.qy - qy, bx = q.px - cx, by = q.py - cy;
    num += ax * by - ay * bx;
    den += ax * bx + ay * by;
  }
  const th = Math.atan2(num, den), cos = Math.cos(th), sin = Math.sin(th);
  const tol = STAMP_SLOT_TOLERANCE_FRAC * minSpacing;
  for (const q of ps) {
    const ax = q.qx - qx, ay = q.qy - qy;
    const wx = cx + cos * ax - sin * ay, wy = cy + sin * ax + cos * ay;
    if (Math.hypot(q.px - wx, q.py - wy) > tol) return false;
  }
  return true;
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
  /*
   * ⚠ MINE (S192, audit SHEETS-1 P4b / IDENTITY-3) — **A FALLEN TOWER IS A MAJORITY OF ITS STAMP.** Fewer
   * than half its blueprint's shapes — a lone leaf in a hand-built wall, the stray an un-welded FIX
   * left loose and a later drop bonded back on, the two leaves a weld held when the hub was razed — is
   * rubble: a free-form shape (SCRAP, no FIX — master never offered one inside a weld), never a second
   * "DOWN" tower whose FIX builds a whole new one around a single shape. Two disjoint majorities of one
   * stamp cannot exist, so one fallen tower can never be listed twice. Two whole stamps welded together
   * are still two towers.
   */
  const bp = blueprintFor(recipeId);
  if (bp === undefined || group.length * 2 <= bp.nodes.length) return null;
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
  const own = towerOwnPoolAt(world, unit.recipeId, unit.anchorId);
  return own === null ? { cur: 0, max } : { cur: own.cur, max: own.max };
}

/** `towerOwnPoolAt`'s read: the pool, plus the walk it was priced on (the bar positions itself on `prims`). */
export interface OwnPoolRead extends PoolRead {
  /** Fifths banked on the tower's OWN connectors — never a weld's. */
  readonly banked: number;
  /** Own connectors still standing (fewer than the recipe's ⇔ `whole` is false). */
  readonly connectors: number;
  readonly prims: readonly PrimitiveId[];
  readonly whole: boolean;
}

/**
 * ⭐⭐ S193 SEAM-C7 — PURE — **THE ONE PRICING OF A LIVE TOWER'S OWN POOL**, for every surface that shows
 * it: the board bar (`structureBarHealth.towerOwnHealth` → `healthBar.ts`), both character-sheet cards
 * (`structureHealthAt` for a lone tower, `towerOwnHealth` above for a tower in a weld) and — by the same
 * arithmetic over the same walk — the ramp art (`rampHealthFrac` over `rampMembersAt`, asserted equal in
 * `structureBarHealthWeldSeam.test.ts`). ONE walk (`towerMembersAt`: the shapes the tower was BUILT with,
 * `ownPrimitiveIds`, and the bonds among them — a weld is never one), ONE price:
 *   · `max` = the RECIPE's pool (`structurePoolFifths(recipeConnectorCount)`) — a tower is built with a
 *     fixed connector count, so its bar's width never shrinks with a cut arm;
 *   · `cur` = `max − banked` while `whole`; **0** once an own connector is gone (the crumble rule, owner
 *     S183 — zero health and the first snapped connector are one event; `rampHealthFrac` reads 0 there).
 * ⚠ Carry's first cut priced the bar `structurePoolFifths(own connectors left)` — inside the ≤ 0.5 s poll
 * window after a cut that read a healthy pool(n−1) bar over a crumbling sprite. `null` when the walk has
 * nothing (anchor gone, a recipe `towerMembersAt` does not govern).
 */
export function towerOwnPoolAt(world: World, recipeId: GodlyId, anchorId: PrimitiveId): OwnPoolRead | null {
  const own = towerMembersAt(world, recipeId, anchorId);
  if (own === null) return null;
  const max = structurePoolFifths(recipeConnectorCount(recipeId));
  let banked = 0;
  for (const id of own.bonds) banked += world.bonds.get(id)?.damageFifths ?? 0;
  const cur = own.whole ? Math.max(0, max - banked) : 0;
  return { cur, max, banked, connectors: own.bonds.length, prims: own.prims, whole: own.whole };
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

/**
 * ⭐ S192 (audit IDENTITY-2) — PURE: the shape a click on `unit` selects, so that every consumer that
 * re-derives the tower from a shape id (`towerUnitAt` → the card, the FIX / SCRAP planners, the host
 * reducers) lands on THIS tower. Its anchor is not enough: a shape two live towers share resolves to
 * the first in the total order (lowest spawner id), so a turret whose hub a mummies Line ring runs
 * through opened, scrapped and fixed the RING from its own art and its own row. Its lowest own shape no
 * other live tower is built of; the anchor only when every one of them is shared. No wire change: the
 * card's target is still one shape id.
 *
 * ⛔ S192 re-audit X1 — A FALLEN STAMP TOO. Its group is NOT disjoint from live towers: `stampGroupAt`
 * excludes only a live tower of the SAME recipe, so a fallen turret's hub can be a live mummies ring's
 * anchor (W2-4), and `towerUnitAt(hub)` answers the ring. Its lowest member no live tower owns, else
 * its lowest member.
 */
export function unitClickShape(world: World, unit: TowerUnit): PrimitiveId {
  if (unit.kind !== 'live') {
    const owned = new Set<PrimitiveId>();
    for (const t of liveTowers(world)) for (const m of liveMembers(world, t)) owned.add(m);
    for (const m of unit.members) if (!owned.has(m)) return m;
    return unit.members[0]!;
  }
  const shared = new Set(sharedWithOtherTowers(world, unit));
  for (const m of unit.members) if (!shared.has(m)) return m;
  return unit.anchorId;
}

/** ⭐ S192 — PURE: `unitClickShape` for the live tower an ART hit names (anchor + the recipe of the art). */
export function towerClickShapeAt(world: World, anchorId: PrimitiveId, recipeId: GodlyId): PrimitiveId {
  for (const t of liveTowers(world)) {
    if (t.anchorId === anchorId && t.recipeId === recipeId) return unitClickShape(world, unitOfLive(world, t));
  }
  return anchorId;
}
