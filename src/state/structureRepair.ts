/**
 * SPARK — S152: **FIX AND SCRAP — the attrition economy (R13 / R19 / R21).**
 *
 * *"there should be a fix and scrap button on actual towers that you've built so if it is partially
 * destroyed you can either fix or scrap"* — owner playtest.
 *
 *   R13 — Towers PERSIST across cycles. **FIX** (one click; if inventory holds the exact shapes the
 *         structure lost, it repairs automatically using them) and **SCRAP** (tear down, surviving
 *         parts return to inventory for reuse).
 *   R19 — FIX and SCRAP are **BUILD-stage only**.
 *   R21 — SCRAP returns **only the shapes still standing**. Destroyed ones are gone.
 *
 * ## ⭐ THE WHOLE DESIGN IN ONE SENTENCE: A DESTROYED SHAPE IS NOT IN `world.primitives`.
 *
 * R21 reads like an arithmetic problem — "count what survived, subtract what died, do not
 * double-count". It is not, and treating it as one is how it goes wrong. `state/damage.ts` is the
 * ONE damage path, it razes a primitive at hp ≤ 0 through `razePrimitives`, and a razed primitive
 * is DELETED along with every bond incident to it. So:
 *
 *   • **"which shapes are still standing"** = the connected component, read live. Nothing to track.
 *   • **"which shapes were destroyed"** = the blueprint's node indices that no member claims.
 *   • **R21 needs no subtraction at all.** SCRAP walks the surviving members and banks one shape per
 *     member. A destroyed shape is not a member, so it cannot be banked — not because a subtraction
 *     removed it, but because it does not exist. Damage cannot be laundered into inventory.
 *   • **Double-counting is unrepresentable.** `componentOf` returns a `Set`, so a member appears
 *     once; the refund walks that set once; `razePrimitives` then deletes exactly that set. A second
 *     SCRAP for the same structure finds no primitive at all and no-ops — structurally idempotent,
 *     the same guarantee `destroyDefender` gets from deleting before acting.
 *   • **Read-before-vs-after is settled by force.** The refund MUST be read before the raze (after
 *     it there is nothing to read), so the list is captured ONCE and both the banking and the raze
 *     consume that same captured list. There is no second read to disagree with the first.
 *
 * The one thing that genuinely cannot be derived is WHICH BLUEPRINT the rubble used to be. That is
 * `Primitive.origin`, added in S152; the docblock on `PrimitiveOrigin` (game/primitive.ts) records
 * the three derivations that were tried and why each is unsound.
 *
 * ## NO NEW RNG, NO NEW CLOCK, NO NEW WORLD FIELD
 *
 * Neither reducer reads `Math.random` or a wall clock. FIX re-mints missing nodes at positions
 * recovered by a RIGID FIT against the surviving geometry (see `fitBlueprintFrame`) — a closed-form
 * 2-D Procrustes, deterministic and iteration-order-fixed. The selection a player makes to aim
 * these actions is RENDER-ONLY state on the panel, exactly as the footer band's open complexity is:
 * it never enters `world`, so it costs no hash entry, no save field and no wire surface.
 *
 * ## NO-OP, NEVER AN ERROR
 *
 * Both follow `applyPullFromBank`, NOT `placePrimitive`. These are CLIENT INTENTS: a joiner raises
 * them against a lagged snapshot, so a stale `primitiveId`, a phase that has since flipped, or a
 * bank that no longer covers the bill must all cost the host nothing. Every refusal returns `world`
 * untouched, and FIX resolves its FULL payment plan before consuming anything, so a refused repair
 * cannot half-spend the inventory.
 */

import { lookupCombo } from '../combos.ts';
import { PRIMITIVE_MAX_HP, type SparkType } from '../constants.ts';
import { componentOf } from '../game/structure.ts';
import { makePrimitiveFromSpark } from '../game/primitive.ts';
import { asPrimitiveId } from '../types.ts';
import { bankAdd } from './castleBank.ts';
import { blueprintFor, type Blueprint } from './blueprints.ts';
import {
  consumePayments,
  paymentSourceSpark,
  planPaymentForTypes,
  type Payment,
} from './blueprintBuild.ts';
import { canBuildNow } from './buildLegality.ts';
import { getDefenderConfig } from './defenders/defender.ts';
import { detectComboDiscoveries } from './comboDiscovery.ts';
import { destroyDefender } from './damage.ts';
import { makeBond } from './placePrimitive.ts';
import { razePrimitives } from './razePrimitives.ts';
import type { Defender } from './defenders/defender.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import type { PlayerId, PrimitiveId, Vec2 } from '../types.ts';
import type { World } from './world.ts';

/**
 * FIX — restore a structure to its blueprint, paying for exactly what it lost.
 *
 * Addressed by ANY surviving member primitive, not by a structure id: there is no structure id, and
 * inventing one would be the `world.structures` side table `PrimitiveOrigin` argues against. The
 * player clicks a shape; the host walks that shape's component.
 */
export interface RepairStructureAction {
  readonly type: 'REPAIR_STRUCTURE';
  readonly playerId: PlayerId;
  /** Any surviving member of the structure to repair. */
  readonly primitiveId: PrimitiveId;
}

/** SCRAP — tear a structure down; the shapes still standing return to the castle inventory. */
export interface ScrapStructureAction {
  readonly type: 'SCRAP_STRUCTURE';
  readonly playerId: PlayerId;
  /** Any surviving member of the structure to tear down. */
  readonly primitiveId: PrimitiveId;
}

/* ══ READ MODEL ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * PURE — the structure `seat` may act on at `primitiveId`, as ASCENDING member ids, or null.
 *
 * ⭐ THE PHASE HALF OF R19 IS NOT WRITTEN HERE — IT IS BORROWED. `canBuildNow` already composes
 * WHERE (`zones.canBuildAt`, the seat's own ground) with WHEN (`matchPhase === 'BUILD'`), and it
 * exists precisely because S149 P2 found that six copies of a phase check is how a drag ghost ends
 * up promising what the host refuses. FIX and SCRAP are the seventh and eighth gates to ask it, and
 * they must never grow their own `matchPhase !== 'BUILD'` line.
 *
 * Ownership is checked on EVERY member, not just the clicked one. A structure straddling a zone
 * border could otherwise be scrapped for shapes another seat paid for — and since the refund lands
 * in the acting seat's bank, that would be a shape-laundering exploit rather than a cosmetic bug.
 *
 * Ascending id order is load-bearing: `Map` iteration is insertion order, which is host-history
 * dependent, so an unsorted walk would bank the same shapes in a different sequence on a worker
 * mirror. The TALLY would end up identical — but the effect stream would not, and neither would a
 * future per-shape rule, so the order is pinned rather than left to luck.
 */
export function seatStructureAt(
  world: World,
  seat: PlayerId,
  primitiveId: PrimitiveId,
): PrimitiveId[] | null {
  const seed = world.primitives.get(primitiveId);
  if (seed === undefined) return null; // stale client id → no-op
  if (!canBuildNow(world, seed.pos, seat)) return null; // R19 (WHEN) + own ground (WHERE)

  const comp = componentOf(seed, world.primitives, world.bonds);
  const ids = [...comp.primitiveIds].sort((a, b) => Number(a) - Number(b));
  for (const id of ids) {
    const p = world.primitives.get(id);
    if (p === undefined) return null; // component referenced a ghost — fail closed
    if (p.placedBy !== seat) return null; // someone else's shape is welded into this component
  }
  return ids;
}

/** A structure recognised as ONE blueprint stamp, plus the node slots that are now empty. */
export interface BlueprintGroup {
  readonly blueprintId: GodlyId;
  /** node index → the surviving primitive standing in that slot. */
  readonly byNode: ReadonlyMap<number, PrimitiveId>;
  /** Node indices with nobody standing in them — ASCENDING. These are the shapes it LOST. */
  readonly missing: readonly number[];
}

/**
 * PURE — read `memberIds` as a single blueprint stamp, or null when they are not one.
 *
 * Refuses, deliberately and in all four cases:
 *   • **any member with `origin === null`** — a hand-placed shape is welded on. The component is no
 *     longer the blueprint, so restoring it to the blueprint would leave that shape orphaned in the
 *     middle of a tower that then still would not ignite (every recipe gate counts component size
 *     EXACTLY). SCRAP has no such problem and stays available, which is the honest split: you can
 *     always tear it down, you just cannot ask the game to guess what you meant to build.
 *   • **two different `blueprintId`s** — two stamps bonded into one component.
 *   • **a repeated `nodeIndex`** — the same, for two stamps of the SAME blueprint. This is the case
 *     a naive multiset count would silently accept and then repair into a chimera.
 *   • **an out-of-range `nodeIndex`** — provenance from a blueprint that has since been retuned
 *     smaller. Fails closed rather than indexing `undefined` into the node table.
 *
 * All four are reachable only by welding structures together by hand, which `stampRefusalAt`
 * already makes hard; the refusal exists so that "hard" does not have to mean "impossible".
 */
export function blueprintGroupOf(
  world: World,
  memberIds: readonly PrimitiveId[],
): BlueprintGroup | null {
  if (memberIds.length === 0) return null;
  let blueprintId: GodlyId | null = null;
  const byNode = new Map<number, PrimitiveId>();

  for (const id of memberIds) {
    const p = world.primitives.get(id);
    if (p === undefined || p.origin === null) return null;
    if (blueprintId === null) blueprintId = p.origin.blueprintId;
    else if (blueprintId !== p.origin.blueprintId) return null;
    if (byNode.has(p.origin.nodeIndex)) return null;
    byNode.set(p.origin.nodeIndex, id);
  }
  if (blueprintId === null) return null;

  const bp = blueprintFor(blueprintId);
  if (bp === undefined) return null; // provenance naming a blueprint this build no longer ships
  for (const idx of byNode.keys()) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= bp.nodes.length) return null;
  }

  const missing: number[] = [];
  for (let i = 0; i < bp.nodes.length; i++) if (!byNode.has(i)) missing.push(i);
  return { blueprintId, byNode, missing };
}

/** What a FIX would do, and what it would cost. `payments === null` ⇒ the inventory cannot cover it. */
export interface RepairPlan {
  readonly memberIds: readonly PrimitiveId[];
  readonly group: BlueprintGroup;
  /** The shapes FIX consumes, positionally aligned with `group.missing`. */
  readonly cost: readonly SparkType[];
  /** Resolved funding for `cost`, or null when the seat is short. */
  readonly payments: readonly Payment[] | null;
  /**
   * How many surviving members are below full hp — the free half of the repair.
   *
   * ⚠ COUNTS THE DEFENDER TOO, and that is not a rounding-up of the number. `Primitive.hp` and
   * `Defender.hp` are two SEPARATE health pools on the same tower: `damageEntity` has a distinct
   * arm for each, and a tower can sit at 1 defender-hp with all seven shapes at full health. Left
   * out, FIX would read "NOTHING TO FIX" on a tower that is one hit from dead — the exact case the
   * owner would report as the button being broken.
   */
  readonly damagedCount: number;
  /** Blueprint bonds that no longer exist between two SURVIVING members (strain breaks, severs). */
  readonly missingBondCount: number;
}

/**
 * PURE-ish (reads world, mutates nothing) — plan a FIX, or null when this is not a repairable
 * structure for this seat right now.
 *
 * The null-vs-`payments: null` split is for the panel: null means "there is no FIX here at all"
 * (wrong phase, wrong seat, freeform rubble) and the button does not appear; a plan with
 * `payments: null` means "this IS a tower and it IS broken, you just cannot afford it" and the
 * button appears disabled with the shortfall on it. A control that vanishes teaches nothing.
 */
export function planStructureRepair(
  world: World,
  seat: PlayerId,
  primitiveId: PrimitiveId,
): RepairPlan | null {
  const memberIds = seatStructureAt(world, seat, primitiveId);
  if (memberIds === null) return null;
  const group = blueprintGroupOf(world, memberIds);
  if (group === null) return null;

  const bp = blueprintFor(group.blueprintId);
  const cost = group.missing.map((i) => bp.nodes[i].type);
  // ⚠ An EMPTY bill must plan as `[]`, never as null. `planPaymentForTypes([])` returns `[]`, which
  // is the correct "you can afford nothing, and nothing is what this costs" — an intact but damaged
  // tower repairs for free (R13 says FIX consumes what the structure LOST, and it lost nothing).
  const payments = planPaymentForTypes(world, seat, cost);

  let damagedCount = 0;
  for (const id of memberIds) {
    const p = world.primitives.get(id);
    if (p !== undefined && p.hp < PRIMITIVE_MAX_HP) damagedCount++;
  }
  for (const d of defendersAnchoredIn(world, new Set(memberIds))) {
    if (d.hp < getDefenderConfig(d.kind).hp) damagedCount++;
  }

  let missingBondCount = 0;
  for (const [ai, bi] of bp.bonds) {
    const aId = group.byNode.get(ai);
    const bId = group.byNode.get(bi);
    if (aId === undefined || bId === undefined) continue; // an endpoint is dead — counted as a shape
    if (!bondExistsBetween(world, aId, bId)) missingBondCount++;
  }

  return { memberIds, group, cost, payments, damagedCount, missingBondCount };
}

/** What a SCRAP would tear down, and what it would hand back. */
export interface ScrapPlan {
  readonly memberIds: readonly PrimitiveId[];
  /** One entry per SURVIVING member, in `memberIds` order. This IS R21 — there is no second list. */
  readonly refund: readonly SparkType[];
}

/**
 * PURE-ish (reads world, mutates nothing) — plan a SCRAP, or null when this seat may not tear this
 * structure down right now.
 *
 * ⚠ DELIBERATELY DOES NOT REQUIRE A BLUEPRINT ORIGIN, unlike FIX. R17 makes plain hand-built
 * structures and walls a real part of the game ("simple intershape connectors … generate points and
 * act as targets / shields"), and a player must be able to reclaim those too — otherwise the only
 * way to undo a misplaced wall is to let an enemy eat it. FIX needs the bill because it has to know
 * what to restore; SCRAP needs nothing but what is standing in front of it.
 */
export function planStructureScrap(
  world: World,
  seat: PlayerId,
  primitiveId: PrimitiveId,
): ScrapPlan | null {
  const memberIds = seatStructureAt(world, seat, primitiveId);
  if (memberIds === null) return null;
  const refund: SparkType[] = [];
  for (const id of memberIds) {
    const p = world.primitives.get(id);
    if (p === undefined) return null; // fail closed rather than refund a shape that is not there
    refund.push(p.type);
  }
  return { memberIds, refund };
}

/* ══ REDUCERS ═════════════════════════════════════════════════════════════════════════════════ */

/**
 * S152 — FIX. Re-mint the nodes this structure lost, re-weld its missing bonds, and heal what is
 * still standing. Costs EXACTLY the lost shapes (R13); refuses outright when the inventory is short
 * (no partial repair — a half-repaired tower still does not ignite, so it would be pure waste).
 *
 * Order of operations is load-bearing and mirrors `applyBuildBlueprint`: validate and resolve the
 * FULL payment plan first, then consume, then mint, then bond, then emit. Nothing is spent unless
 * the whole repair will succeed.
 */
export function applyRepairStructure(world: World, action: RepairStructureAction): World {
  const player = world.players.get(action.playerId);
  if (player === undefined) return world;

  const plan = planStructureRepair(world, action.playerId, action.primitiveId);
  if (plan === null) return world; // not a repairable structure for this seat, here, now
  const payments = plan.payments;
  if (payments === null) return world; // R13: the EXACT shapes, or nothing at all

  // Nothing to do at all — refuse rather than push an empty BOND_FORMED, which would arm the
  // ignition sweep for free on every idle click.
  if (plan.group.missing.length === 0 && plan.damagedCount === 0 && plan.missingBondCount === 0) {
    return world;
  }

  const bp = blueprintFor(plan.group.blueprintId);

  // ── CONSUME ─────────────────────────────────────────────────────────────────────────────────
  consumePayments(world, action.playerId, payments);

  // ── RE-MINT THE LOST NODES ──────────────────────────────────────────────────────────────────
  // The frame is fitted BEFORE anything is minted, so it is derived purely from the shapes that
  // actually survived the fight — re-minted nodes cannot influence where re-minted nodes go.
  const frame = fitBlueprintFrame(world, bp, plan.group.byNode);
  const byNode = new Map(plan.group.byNode);
  plan.group.missing.forEach((nodeIndex, i) => {
    const pos = frameToWorld(frame, bp.nodes[nodeIndex]);
    const spark = paymentSourceSpark(payments[i], pos, world.tick);
    const prim = makePrimitiveFromSpark({
      id: asPrimitiveId(world.nextPrimitiveId++),
      spark,
      placerColor: player.color,
      placedBy: player.id,
      tick: world.tick,
      // The replacement carries the SAME provenance the dead node did, so a tower can be damaged and
      // repaired without limit. Provenance that decayed on repair would make the second FIX refuse.
      origin: { blueprintId: plan.group.blueprintId, nodeIndex },
    });
    world.primitives.set(prim.id, prim);
    byNode.set(nodeIndex, prim.id);
  });

  // ── RE-WELD ─────────────────────────────────────────────────────────────────────────────────
  // EXACTLY the blueprint's bond list, and only the edges that are actually absent. Re-minting a
  // node kills nothing that exists, so this both re-attaches the new shapes AND repairs a bond that
  // strain or a SEVER_BOND broke while both endpoints survived — which is a real way for a tower to
  // stop working with every shape still standing.
  const firstNewBondId = world.nextBondId;
  for (const [ai, bi] of bp.bonds) {
    const aId = byNode.get(ai);
    const bId = byNode.get(bi);
    if (aId === undefined || bId === undefined) continue;
    if (bondExistsBetween(world, aId, bId)) continue;
    const a = world.primitives.get(aId);
    const b = world.primitives.get(bId);
    if (a === undefined || b === undefined) continue;
    // Stiffness from the SAME combo table a hand-placed bond consults, so a repaired Square↔Circle
    // really is a 'Capsule' — the recipes are documented in combo terms and the combo drives feel.
    const bond = makeBond(world, a, b, lookupCombo(a.type, b.type).stiffnessTier);
    world.bonds.set(bond.id, bond);
    a.bonds.add(bond.id);
    b.bonds.add(bond.id);
  }

  // ── HEAL ────────────────────────────────────────────────────────────────────────────────────
  // ⚠ FREE, AND THAT IS THE RULING RATHER THAN AN OVERSIGHT. R13 prices FIX at "the shapes the
  // structure LOST"; chip damage loses no shapes, so it costs nothing. It also keeps FIX from being
  // a dead control in its most common case — the tower that got shot but held — which is precisely
  // what the owner would report as "fix does nothing". Attrition still bites where R16 puts it: on
  // CONNECTORS, i.e. on shapes that actually died and must be bought back above.
  for (const id of byNode.values()) {
    const p = world.primitives.get(id);
    if (p !== undefined) p.hp = PRIMITIVE_MAX_HP;
  }
  // The tower's OWN health pool, which is a different number from its shapes' (see `damagedCount`).
  // Restored from the kind's config rather than a captured maximum, so a later stat rebalance (R30)
  // moves the repair ceiling with it instead of quietly healing to a stale figure.
  for (const d of defendersAnchoredIn(world, new Set(byNode.values()))) {
    d.hp = getDefenderConfig(d.kind).hp;
  }

  // ── ARM THE MATCHER ─────────────────────────────────────────────────────────────────────────
  // ⭐ Do not remove. `runDefenderIgnition` / `runSpawnerIgnition` each open with their own sweep
  // over `world.effects` and `if (!hasTopologyChange) return;`. They are called every host tick,
  // which makes them LOOK like structural scans — they are not. Without an emitted `BOND_FORMED` a
  // perfectly repaired tower sits inert forever: no defender, no error, no log line. Same trap, same
  // one-collapsed-event shape, as `applyBuildBlueprint`.
  const bondsFormed = (world.nextBondId as unknown as number) - (firstNewBondId as unknown as number);
  if (bondsFormed > 0) {
    world.effects.push({
      kind: 'BOND_FORMED',
      tick: world.tick,
      pos: { x: frame.cx, y: frame.cy },
      bondCount: bondsFormed,
    });
    detectComboDiscoveries(world, firstNewBondId);
  }

  return world;
}

/**
 * S152 — SCRAP. Tear a structure down; every shape STILL STANDING returns to the castle inventory
 * (R21). Destroyed ones are already out of `world.primitives` and therefore already gone.
 *
 * ## ⛔ DEFENDERS ARE STOOD DOWN BEFORE A SINGLE SHAPE MOVES, AND THE ORDER IS THE POINT
 *
 * `destroyDefender` decides whether to fire a death effect by asking whether the anchor is still
 * standing: anchor gone ⇒ something killed it ⇒ `onDefenderDestroyed` (for a stink tower, a blast
 * that damages everything around it). If SCRAP razed first, the host's revalidation poll would find
 * the anchor missing half a second later and DETONATE the player's own tower in the middle of their
 * own base — for the crime of deconstructing it. Removing the defender while its anchor is still up
 * takes the `recipeBreak` branch, which is exactly the "this is building, not dying" case that
 * discriminator was written for.
 *
 * Spawners need no such care: `applyRemoveSpawner` is a bare `delete` with no death behaviour, so
 * the poll cleaning one up a tick later is indistinguishable from doing it here — and doing it here
 * would mean a second copy of a shipped reducer.
 */
export function applyScrapStructure(world: World, action: ScrapStructureAction): World {
  if (!world.players.has(action.playerId)) return world;

  const plan = planStructureScrap(world, action.playerId, action.primitiveId);
  if (plan === null) return world;

  const doomed = new Set<PrimitiveId>(plan.memberIds);

  // 1 — stand down anything anchored on a doomed shape, WHILE IT STILL STANDS. Ascending id so the
  //     traversal is identical on host and worker regardless of map insertion history.
  for (const d of defendersAnchoredIn(world, doomed)) destroyDefender(world, d, 'recipeBreak');

  // 2 — REFUND. One shape per surviving member, read from the SAME captured list step 3 razes, so
  //     there is no second read that could disagree with the first. This loop IS R21.
  for (const id of plan.memberIds) {
    const prim = world.primitives.get(id);
    if (prim === undefined) continue; // nothing above deletes primitives; belt-and-braces
    bankAdd(world.castleBanks, action.playerId, prim.type);
    // Reuse the kind the potato blast and `damageEntity` already emit for an erased primitive, so a
    // scrap is visible without putting a NEW serialized effect literal on the wire.
    world.effects.push({
      kind: 'SEVER_ERASE',
      tick: world.tick,
      pos: { x: prim.pos.x, y: prim.pos.y },
      color: prim.placerColor,
      radius: prim.radius,
    });
  }

  // 3 — RAZE, through the one shared path (incident bonds off both endpoints, bonds gone, prims
  //     gone, then the Verlet + fouled-set fixups). Never hand-roll this.
  razePrimitives(world, plan.memberIds);
  return world;
}

/* ══ GEOMETRY ═════════════════════════════════════════════════════════════════════════════════ */

/**
 * The rigid transform taking BLUEPRINT-LOCAL node offsets to WORLD positions for one structure.
 *
 * `(cx, cy)` is the survivors' centroid in world space, `(qx, qy)` their centroid in blueprint-local
 * space, and `(cos, sin)` the rotation between the two.
 */
interface BlueprintFrame {
  readonly cx: number;
  readonly cy: number;
  readonly qx: number;
  readonly qy: number;
  readonly cos: number;
  readonly sin: number;
}

/**
 * ⭐ WHERE DOES A RE-MINTED SHAPE GO? Closed-form 2-D Procrustes against the survivors.
 *
 * The naive answer — "stamp the blueprint again at the centre it was built at" — is wrong twice
 * over. The player DRAGS a finished tower to where they want it (that is the whole click-to-build
 * gesture), and Verlet + soft collision then rotate it as it settles and as it is shot at. So the
 * original centre is stale from the first second, and any stored centre would have to be re-derived
 * anyway. Worse, a damaged star's centroid is NOT its hub: lose two leaves off one side and the
 * centroid walks toward the survivors, so a translation fitted from raw positions alone would
 * re-mint the missing leaves inside the tower.
 *
 * The fit corrects both. Each survivor contributes a (blueprint-local, world) pair, and the optimal
 * rotation about the matched centroids is the closed form
 *
 *     θ = atan2( Σ (q'x·p'y − q'y·p'x),  Σ (q'x·p'x + q'y·p'y) )
 *
 * with primes denoting centroid-relative coordinates. No iteration, no search, no RNG, and — with a
 * single survivor — both sums are exactly 0, `atan2(0, 0)` is 0, and the fit degrades gracefully to
 * pure translation, which is the only defensible answer when one point cannot pin an orientation.
 *
 * ⚠ THE ACCUMULATION ORDER IS PINNED to ascending node index. Floating-point addition is not
 * associative, so summing in `Map` insertion order — which is host-history dependent — would let a
 * host and its `?worker=1` mirror land re-minted shapes a few ulps apart, and the differential test
 * hashes positions. This is the same reason `razePrimitives` sorts its bond ids.
 */
function fitBlueprintFrame(
  world: World,
  bp: Blueprint,
  byNode: ReadonlyMap<number, PrimitiveId>,
): BlueprintFrame {
  const indices = [...byNode.keys()].sort((a, b) => a - b);
  const pts: Array<{ px: number; py: number; qx: number; qy: number }> = [];
  for (const i of indices) {
    const prim = world.primitives.get(byNode.get(i)!);
    if (prim === undefined) continue;
    pts.push({ px: prim.pos.x, py: prim.pos.y, qx: bp.nodes[i].dx, qy: bp.nodes[i].dy });
  }
  // Cannot happen through `planStructureRepair` (a group with no live members is not a group), but
  // an identity frame is the only safe answer if it ever does — never a divide by zero.
  if (pts.length === 0) return { cx: 0, cy: 0, qx: 0, qy: 0, cos: 1, sin: 0 };

  let sx = 0, sy = 0, sqx = 0, sqy = 0;
  for (const p of pts) {
    sx += p.px;
    sy += p.py;
    sqx += p.qx;
    sqy += p.qy;
  }
  const n = pts.length;
  const cx = sx / n, cy = sy / n, qx = sqx / n, qy = sqy / n;

  let num = 0, den = 0;
  for (const p of pts) {
    const ax = p.qx - qx, ay = p.qy - qy;
    const bx = p.px - cx, by = p.py - cy;
    num += ax * by - ay * bx;
    den += ax * bx + ay * by;
  }
  const theta = Math.atan2(num, den); // (0, 0) ⇒ 0 ⇒ identity rotation ⇒ pure translation
  return { cx, cy, qx, qy, cos: Math.cos(theta), sin: Math.sin(theta) };
}

/** PURE — where a blueprint node lands under `frame`. */
function frameToWorld(frame: BlueprintFrame, node: { dx: number; dy: number }): Vec2 {
  const ax = node.dx - frame.qx;
  const ay = node.dy - frame.qy;
  return {
    x: frame.cx + frame.cos * ax - frame.sin * ay,
    y: frame.cy + frame.sin * ax + frame.cos * ay,
  };
}

/**
 * PURE — every live defender whose ANCHOR stands among `primIds`, in ASCENDING id order.
 *
 * Ascending, always. `Map` iteration is insertion order, which is host-history dependent, and this
 * list drives `destroyDefender` — a call with side effects. An unsorted walk would tear two towers
 * down in a different sequence on a `?worker=1` mirror, and the effect stream is part of what the
 * differential rig compares.
 */
function defendersAnchoredIn(world: World, primIds: ReadonlySet<PrimitiveId>): Defender[] {
  return [...world.defenders.values()]
    .filter((d) => primIds.has(d.anchorPrimitiveId))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * PURE — is there already a bond joining these two primitives?
 *
 * Walks `a`'s incident bonds rather than all of `world.bonds`: a primitive's degree is single
 * digits in every shipped recipe, so this is O(degree) per blueprint edge instead of O(|bonds|).
 */
function bondExistsBetween(world: World, aId: PrimitiveId, bId: PrimitiveId): boolean {
  const a = world.primitives.get(aId);
  if (a === undefined) return false;
  for (const bondId of a.bonds) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    if (bond.aId === bId || bond.bId === bId) return true;
  }
  return false;
}
