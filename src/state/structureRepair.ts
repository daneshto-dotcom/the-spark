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
import { detectComboDiscoveries } from './comboDiscovery.ts';
import { destroyDefender } from './damage.ts';
import { makeBond } from './placePrimitive.ts';
import { razePrimitives } from './razePrimitives.ts';
import { zoneOf, zoneOwner } from './zones.ts';
import type { Defender } from './defenders/defender.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import { getDefenderRecipe } from './godlyRecipes/index.ts';
import { starArmsAt } from './godlyRecipes/starShape.ts';
import { ringMembersAt } from './godlyRecipes/ringShape.ts';
import { applyRegisterDefender } from './defenders/defenderLifecycle.ts';
import { applyRegisterSpawner } from './spawners/spawnerLifecycle.ts';
import { raceForTowerId } from './raceTowerIds.ts';
import { raceForT9TowerId } from './t9BossIds.ts';
import { towerShapeFor } from './towerMembers.ts';
import { sharedWithOtherTowers, towerUnitAt, weldedAt, type TowerUnit } from './towerUnit.ts';
import type { BondId, PlayerId, PrimitiveId, Vec2 } from '../types.ts';
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
 * ⭐⭐ S183 — PURE — may `seat` RECLAIM (fix or scrap) what stands at `pos` right now?
 *
 * ## ⛔⛔ WHY THIS IS NOT `canBuildNow`, WHICH IS WHAT IT USED TO BE
 *
 * `seatStructureAt` borrowed `canBuildNow` and its comment named exactly TWO clauses it meant to
 * borrow: *"R19 (WHEN) + own ground (WHERE)"*. S182's placement branch then made the **castle
 * keep-out** the FIRST arm of `canBuildAt` (`zones.ts`) — correctly, for PLACEMENT — and it
 * silently became a third clause on a gate whose author never asked for it.
 *
 * The consequence is the exact S182 lesson recurring: *two branches each correct alone, wrong
 * together*, and their tripwire could not see it because it proved `canBuildAt` CONTAINS the
 * keep-out, not who else READS it.
 *
 * ⛔ **WHAT IT COSTS A PLAYER.** `makeBond`'s 20 px rest-length floor pushes bonded shapes apart
 * and nothing pushes them back out, so a member can drift inside the disc of its own castle. That
 * member then loses its FIX/SCRAP row — and its FEED row too, because `structureActionModel`
 * returns null outright when the scrap plan is null. Sever its bond and the lone shape can never
 * be scrapped or reclaimed for the rest of the match, with nothing on screen saying why.
 *
 * ## The rule, stated rather than inherited
 *
 * **WHEN** — BUILD only (R19), the half that WAS deliberately shared.
 * **WHERE** — the seat's own ground, failing closed on the shared quarry (`zoneOf` null) and on a
 * seat with no ground (`zoneOwner` null), exactly as `canBuildAt` does.
 * **AND NOT the keep-out**, because that rule answers *"may something NEW be put here"*. Taking a
 * shape back is the opposite motion: refusing it keeps the obstruction there forever.
 *
 * ⚠ THE PHASE TEST IS `!== 'BUILD'`, NOT `=== 'FIGHT'`, for `buildLegality.ts`'s own reason — a
 * third `MatchPhase` must default to refusing, not to permitting.
 *
 * ⚠ AND THIS IS A DELIBERATE SECOND PREDICATE, NOT A COPY THAT DRIFTED. S149 P2's warning is about
 * one RULE written six times; this is a DIFFERENT rule that happened to share two of three clauses.
 * `structureRepairKeepOut.test.ts` pins both halves of the divergence — that the two agree outside
 * the disc, and that they disagree inside it — so neither can move without the other being seen.
 * It arguably belongs beside `canBuildNow` in `buildLegality.ts`; that file is outside this
 * branch's boundary, so the move is left to the merge owner.
 */
export function canReclaimNow(world: World, pos: Vec2, seat: PlayerId): boolean {
  if (world.matchPhase !== 'BUILD') return false;
  const owner = zoneOwner(seat, world.layout);
  if (owner === null) return false;
  const zone = zoneOf(pos, world.layout);
  if (zone === null) return false;
  return zone === owner;
}

/**
 * PURE — the structure `seat` may act on at `primitiveId`, as ASCENDING member ids, or null.
 *
 * ⭐ THE PHASE HALF OF R19 IS NOT WRITTEN HERE TWICE — IT IS `canReclaimNow`, directly above, which
 * composes WHEN (`matchPhase === 'BUILD'`) with WHERE (the seat's own ground). FIX and SCRAP must
 * never grow their own `matchPhase !== 'BUILD'` line; S149 P2 found that six copies of a phase
 * check is how a drag ghost ends up promising what the host refuses.
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
  // ⛔ S183 — `canReclaimNow`, NOT `canBuildNow`. R19 (WHEN) + own ground (WHERE), and deliberately
  // NOT the castle keep-out that S182 added to the PLACEMENT predicate — see the docblock above.
  if (!canReclaimNow(world, seed.pos, seat)) return null;

  const comp = componentOf(seed, world.primitives, world.bonds);
  const ids = [...comp.primitiveIds].sort((a, b) => Number(a) - Number(b));
  for (const id of ids) {
    const p = world.primitives.get(id);
    if (p === undefined) return null; // component referenced a ghost — fail closed
    if (p.placedBy !== seat) return null; // someone else's shape is welded into this component
  }
  return ids;
}

/**
 * ⭐⭐ S191 (owner R191-A) — WHAT A FIX / SCRAP ON THIS SHAPE ACTS ON. R185-B AMENDED.
 *
 * > *"you can only scrape the tower that's a part of the shape or only fix the tower that's a part of
 * > the shape … when you clicking on a welded structure you can't fix it because it's … fixing what …
 * > are you fixing all the towers on it no you have to fix [them] manually … you can separate those
 * > two. It's as simple as that."*
 *
 * The SAME clicked shape the card was opened on decides, through the one read model the card uses
 * (`towerUnit.ts`), so there is no new action and no new field on the wire:
 *
 *   · NOT WELDED — `'structure'`, the whole component. EXACTLY the pre-S191 behaviour: a lone tower's
 *     component IS the tower.
 *   · WELDED, the shape belongs to a TOWER (a live tower's own shape, or a stamped tower's remains) —
 *     `'tower'`, that tower's own shapes only. FIX repairs it; SCRAP takes it alone.
 *   · WELDED, a free-form shape — `'structure'`, the whole component: SCRAP takes everything, towers
 *     included; FIX is refused (`planStructureRepair`).
 *
 * Same WHEN/WHERE gate and the same ownership check as `seatStructureAt` — over the WHOLE component
 * in both scopes, deliberately: S152's rule is that someone else's shape welded in makes the structure
 * untouchable, and a tower-scope action must not become the way round it. Ascending ids, for the
 * reason that function gives.
 */
export interface ReclaimScope {
  readonly scope: 'tower' | 'structure';
  readonly memberIds: readonly PrimitiveId[];
  readonly unit: TowerUnit | null;
  readonly welded: boolean;
}

export function reclaimScopeAt(world: World, seat: PlayerId, primitiveId: PrimitiveId): ReclaimScope | null {
  const seed = world.primitives.get(primitiveId);
  if (seed === undefined) return null;
  if (!canReclaimNow(world, seed.pos, seat)) return null;
  const comp = [...componentOf(seed, world.primitives, world.bonds).primitiveIds].sort((a, b) => Number(a) - Number(b));
  for (const id of comp) {
    const p = world.primitives.get(id);
    if (p === undefined || p.placedBy !== seat) return null;
  }
  const unit = towerUnitAt(world, primitiveId);
  const welded = weldedAt(world, primitiveId, unit);
  const tower = welded && unit !== null;
  return { scope: tower ? 'tower' : 'structure', memberIds: tower ? [...unit.members] : comp, unit, welded };
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
 *   • **any member with `origin === null`** — a hand-placed shape is among the members, so they are
 *     not one blueprint stamp and there is nothing to restore them TO. ⭐ S191 R191-A: a WELDED
 *     structure is no longer read as one group at all — `reclaimScopeAt` hands this function the ONE
 *     tower that was clicked (its own shapes), so each tower in a weld is fixed on its own, and a click
 *     on a free-form weld is refused before it gets here (R185-B as amended: the weld as a whole is
 *     unfixable, each tower in it is not). SCRAP needs no provenance and stays available.
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

/**
 * ⭐⭐⭐ S182 (owner R182-E) — **A DENT COSTS ONE SHAPE. IT USED TO COST NOTHING.**
 *
 * > *"If there's only an amount of HP missing but no connector destroyed, so it's still intact and
 * > producing characters, then it takes one shape. So far it takes NO shape — that's not correct.
 * > It takes one shape. Whether it's one HP or fifty HP."*
 *
 * ⛔ **AND THE TYPE IS MINE, BECAUSE HE REFUSED TO PICK ONE.** Offered a per-recipe table he called
 * it over-thinking — *"whatever shape is missing is the shape that you need to rebuild"* — which is
 * the answer for a structure that LOST something and says nothing about one that lost nothing. So
 * this derives the fee from the blueprint: **the most numerous node type**, i.e. what the building is
 * mostly made of. It lands on his own two worked examples (pentagram → Triangle, goblin tower →
 * Circle) without either being written down.
 *
 * ⛔ **DERIVED, NEVER HAND-LISTED.** A copied table of seven recipes is the drift defect this file's
 * neighbours are full of; `structureRepairFee.test.ts` asserts the derivation over EVERY registered
 * blueprint, so a recipe retune moves the fee with it and a new recipe cannot be forgotten.
 *
 * ⚠ **THE TIE-BREAK IS FIRST APPEARANCE IN THE NODE LIST, NOT THE HUB TYPE.** Helga is 3 Spirals and
 * 3 Circles around ONE Triangle hub, and the Voltkin chain is 4 Squares and 4 Triangles with no hub
 * at all. Breaking on the hub would charge Helga a Triangle — the one shape she has exactly one of —
 * which reads as arbitrary in the only two cases where the rule is visible. First appearance always
 * names a type the structure is actually built out of, and for every STAR recipe whose hub type wins
 * outright (the goblin tower) the two rules agree anyway, because node 0 IS the hub.
 */
export function repairFeeShapeFor(blueprintId: GodlyId): SparkType | null {
  const bp = blueprintFor(blueprintId);
  if (bp === undefined || bp.nodes.length === 0) return null;
  const counts = new Map<SparkType, number>();
  for (const n of bp.nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  let best: SparkType | null = null;
  let bestCount = 0;
  for (const node of bp.nodes) {
    const c = counts.get(node.type) ?? 0;
    if (c > bestCount) { best = node.type; bestCount = c; } // strict `>` ⇒ first appearance wins ties
  }
  return best;
}

/** What a FIX would do, and what it would cost. `payments === null` ⇒ the inventory cannot cover it. */
export interface RepairPlan {
  readonly memberIds: readonly PrimitiveId[];
  readonly group: BlueprintGroup;
  /**
   * The shapes FIX consumes.
   *
   * ⚠ **EITHER the lost nodes, positionally aligned with `group.missing`, OR — when nothing was lost
   * and the structure is merely hurt — the single flat fee of R182-E.** Never both, and that is what
   * keeps the alignment safe: the flat-fee case is exactly the case where `group.missing` is empty,
   * so the re-mint loop that indexes `payments[i]` against it never runs.
   */
  readonly cost: readonly SparkType[];
  /** Resolved funding for `cost`, or null when the seat is short. */
  readonly payments: readonly Payment[] | null;
  /**
   * How many surviving members are below full health — the free half of the repair.
   *
   * ⚠ COUNTS DAMAGED CONNECTORS TOO, and that is not a rounding-up of the number. S151 P2 (owner
   * R75) removed the tower's own hp pool: a structure's durability now lives on its BONDS. A tower
   * can therefore sit with all seven shapes at full hp and every connector one hit from snapping.
   * Left out, FIX would read "NOTHING TO FIX" on a tower that is one hit from collapse — the exact
   * case the owner would report as the button being broken.
   */
  readonly damagedCount: number;
  /** Blueprint bonds that no longer exist between two SURVIVING members (strain breaks, severs). */
  readonly missingBondCount: number;
  /** S191 R191-A — `'tower'` = one tower inside a welded structure; `'structure'` = the pre-S191 FIX. */
  readonly scope: 'tower' | 'structure';
  /** S191 — the tower being repaired, for `'tower'` scope (a live record, or a fallen stamp). */
  readonly unit: TowerUnit | null;
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
  // ⭐ S191 R191-A — the tower's own shapes inside a weld, else the whole component (pre-S191).
  const sc = reclaimScopeAt(world, seat, primitiveId);
  if (sc === null) return null;
  // ⛔ R191-A — a WELDED structure clicked on a free-form shape is never FIXed: *"are you fixing all the
  // towers on it — no, you have to fix them manually."* Each tower is fixed from its own card.
  if (sc.welded && sc.scope === 'structure') return null;
  const memberIds = sc.memberIds;
  const group = blueprintGroupOf(world, memberIds);
  if (group === null) return null;
  // ⛔ S192 (audit IDENTITY-1) — a FALLEN tower's FIX must be able to stand it up again (it re-registers
  // it, `settleTowerIdentity`); one that cannot is never offered, so the reducer never charges for it.
  if (sc.scope === 'tower' && sc.unit?.kind === 'stamp' && !fallenTowerFixCanRegister(world, seat, group)) return null;

  const bp = blueprintFor(group.blueprintId);

  let damagedCount = 0;
  for (const id of memberIds) {
    const p = world.primitives.get(id);
    if (p !== undefined && p.hp < PRIMITIVE_MAX_HP) damagedCount++;
  }
  // ⭐ S151 P2 (owner R75/R76) — COUNT DAMAGED CONNECTORS, NOT A TOWER HP POOL.
  // The old code counted a defender sitting below `config.hp`. Towers no longer HAVE hit points —
  // their durability is their connectors' — so the equivalent "this tower is hurt but standing"
  // signal is a bond inside the structure carrying accumulated damage. Without this, FIX would read
  // "NOTHING TO FIX" on a tower one hit from collapse, which is exactly the broken-button report the
  // original comment here was written to prevent.
  for (const bondId of bondIdsWithin(world, new Set(memberIds))) {
    const b = world.bonds.get(bondId);
    if (b !== undefined && b.damageFifths > 0) damagedCount++;
  }

  let missingBondCount = 0;
  for (const [ai, bi] of bp.bonds) {
    const aId = group.byNode.get(ai);
    const bId = group.byNode.get(bi);
    if (aId === undefined || bId === undefined) continue; // an endpoint is dead — counted as a shape
    if (!bondExistsBetween(world, aId, bId)) missingBondCount++;
  }

  /*
   * ⭐⭐ R182-E — THE BILL. Lost nodes cost themselves; a structure that lost NOTHING but is hurt
   * costs ONE shape, flat, *"whether it's one HP or fifty HP"*.
   *
   * ⛔ AND A WHOLE TOWER STILL COSTS NOTHING, because there is nothing to buy. The fee is priced off
   * `damagedCount`/`missingBondCount` — which is why they are computed ABOVE this line now — so an
   * idle click on a pristine building still reads NOTHING TO FIX and the reducer still refuses it.
   * Charging there would turn an accidental click into a lost shape.
   *
   * ⚠ `repairFeeShapeFor` returning null (a blueprint with no nodes — unreachable through
   * `blueprintGroupOf`, which has already resolved it) falls back to the free bill rather than
   * throwing: a broken FIX button is better than a crashed host.
   */
  let cost: readonly SparkType[] = group.missing.map((i) => bp.nodes[i].type);
  if (cost.length === 0 && (damagedCount > 0 || missingBondCount > 0)) {
    const fee = repairFeeShapeFor(group.blueprintId);
    if (fee !== null) cost = [fee];
  }
  // ⚠ An EMPTY bill must plan as `[]`, never as null. `planPaymentForTypes([])` returns `[]`, which
  // is the correct "you can afford nothing, and nothing is what this costs".
  const payments = planPaymentForTypes(world, seat, cost);

  return { memberIds, group, cost, payments, damagedCount, missingBondCount, scope: sc.scope, unit: sc.unit };
}

/** What a SCRAP would tear down, and what it would hand back. */
export interface ScrapPlan {
  readonly memberIds: readonly PrimitiveId[];
  /** One entry per SURVIVING member, in `memberIds` order. This IS R21 — there is no second list. */
  readonly refund: readonly SparkType[];
  /** S191 R191-A — `'tower'` = one tower's own shapes inside a weld; `'structure'` = the component. */
  readonly scope: 'tower' | 'structure';
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
  // ⭐ S191 R191-A — the tower alone inside a weld (its welds and the other towers stay), else the
  // whole component, towers included (a free-form click on a weld, and every un-welded structure).
  const sc = reclaimScopeAt(world, seat, primitiveId);
  if (sc === null) return null;
  let memberIds = sc.memberIds;
  if (sc.scope === 'tower' && sc.unit !== null) {
    /*
     * ⚠ MINE — a shape ANOTHER live tower is also built of (a shared leaf, `starShape.ts`) stays: *"the
     * welds and the other towers stay"*. Taking it would level the neighbour for a scrap of this one.
     */
    const shared = new Set(sharedWithOtherTowers(world, sc.unit));
    memberIds = memberIds.filter((id) => !shared.has(id));
    if (memberIds.length === 0) return null;
  }
  const refund: SparkType[] = [];
  for (const id of memberIds) {
    const p = world.primitives.get(id);
    if (p === undefined) return null; // fail closed rather than refund a shape that is not there
    refund.push(p.type);
  }
  return { memberIds, refund, scope: sc.scope };
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

  // ── CONSUME ─────────────────────────────────────────────────────────────────────────────────
  consumePayments(world, action.playerId, payments);
  restorePlannedRepair(world, action.playerId, plan, payments);
  return world;
}

/**
 * ⭐ S193 R191-B — a FIX job's last shape has reached the tower: restore it from what the gatherers
 * DELIVERED. The bill was paid at each pickup (bank) or by lifting the quarry spark, so nothing is
 * consumed here — the delivered types stand in as bank payments, positionally aligned with
 * `plan.cost` exactly as `consumePayments`' list would be. The caller (`repairJobs.ts`) has checked that
 * the delivered multiset covers `plan.cost`. Same restore, same identity settling, as an instant FIX.
 */
export function restoreFromDelivered(world: World, seat: PlayerId, plan: RepairPlan): void {
  if (!world.players.has(seat)) return;
  const payments: Payment[] = plan.cost.map((sparkType) => ({ from: 'bank', sparkType }));
  restorePlannedRepair(world, seat, plan, payments);
}

/** The restore half of a FIX (re-mint, re-weld, heal, arm the matcher, settle identity). Pays nothing. */
function restorePlannedRepair(world: World, seat: PlayerId, plan: RepairPlan, payments: readonly Payment[]): void {
  const player = world.players.get(seat);
  if (player === undefined) return;
  const action = { playerId: seat };
  const bp = blueprintFor(plan.group.blueprintId);

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
  // ⛔⛔ S182 (owner R182-E) — **THIS WAS FREE AND HE SAID IT SHOULD NOT BE.**
  //
  // The comment here used to argue the free heal was the ruling rather than an oversight: R13 prices
  // FIX at "the shapes the structure LOST", chip damage loses no shapes, therefore nothing. He read
  // that behaviour on the board and rejected it — *"so far it takes NO shape — that's not correct.
  // It takes one shape. Whether it's one HP or fifty HP."* The bill is now built in
  // `planStructureRepair` and `consumePayments` above has already taken it; the heal itself is
  // unchanged. Attrition still bites hardest where R16 puts it — on connectors that actually died —
  // but a dent is no longer worth nothing.
  // ⭐ S192 (owner T11) — sum what this repair RESTORES, for the one green number (`structureHealHits`).
  let restored = 0;
  const refilledKeys: string[] = [];
  for (const id of byNode.values()) {
    const p = world.primitives.get(id);
    if (p === undefined) continue;
    if (p.hp < PRIMITIVE_MAX_HP) {
      restored += PRIMITIVE_MAX_HP - p.hp;
      refilledKeys.push(`p:${p.id}`);
    }
    p.hp = PRIMITIVE_MAX_HP;
  }
  // ⭐ S151 P2 (owner R76) — HEAL THE CONNECTORS. This replaces restoring a tower hp pool that no
  // longer exists. Clearing accumulated damage restores FULL durability rather than a captured
  // maximum, because capacity is DERIVED from the live connector count — so a structure repaired
  // after losing shapes correctly comes back tougher only once its connectors are rebuilt, not
  // before. Nothing to rebalance-drift against: there is no stored ceiling to go stale.
  for (const bondId of bondIdsWithin(world, new Set(byNode.values()))) {
    const b = world.bonds.get(bondId);
    if (b === undefined) continue;
    restored += b.damageFifths;
    // ⭐ S193 (carry-fwd T11) — the connector watch key too, so the renderer's JOINER-path derivation
    // (a bank that fell with no sever beside it) sees this bond re-seeded and does not print it twice.
    if (b.damageFifths > 0) refilledKeys.push(`b:${b.id}`);
    b.damageFifths = 0;
  }
  /*
   * ⭐⭐ S192 (owner T11) — *"when a tower heals or anything … every healing should show"*. ONE record per
   * repair, the TOTAL restored (connector banks cleared + shape HP refilled), at the frame centre the
   * BOND_FORMED cue below also uses. One number, not one per connector (the research's recommendation,
   * MINE until he says otherwise). A repair that restored nothing (only missing nodes re-minted) prints
   * nothing here; the re-minted shapes are first sightings, so they print nothing either.
   */
  if (restored > 0) {
    world.structureHealHits.push({ x: frame.cx, y: frame.cy, owner: player.id, amount: restored, keys: refilledKeys });
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

  // ⭐ S191 R191-A — a FIXed tower keeps (or, inside a weld, regains) its identity. See `settleTowerIdentity`.
  // ⚠ IN BOTH SCOPES for a LIVE record: an UN-welded stamped tower that lost a node inside the poll
  // window gets a re-minted shape too, and its record must adopt it or the poll levels it (the master
  // survival test was exact, so this path used to be free).
  if (plan.unit !== null) {
    settleTowerIdentity(world, action.playerId, plan.unit, plan.group.blueprintId, byNode, plan.scope === 'tower');
  }
}

/**
 * ⭐⭐ S191 R191-A — **THE TOWER A FIX RESTORED INSIDE A WELD STANDS AGAIN.**
 *
 * Two cases, and neither may be left to the recipe matcher:
 *
 *   · **A LIVE tower** (dented, or broken inside the ≤ 0.5 s before the poll removes it): its record's
 *     own shapes become the restored stamp's, so a re-minted node is one of its own. Its own connectors
 *     are the bonds between those shapes, so a re-welded connector — a NEW bond id — is own already
 *     (`ownPrimitiveIds`, the audit W-FR4 hazard). It stands at the next poll, same record, same id.
 *     Applies in BOTH scopes (an un-welded tower is its whole component).
 *   · **A FALLEN tower** (its record is gone) — TOWER scope only; an un-welded stamp is left to the
 *     matcher exactly as before (the FIX's own `BOND_FORMED` arms it): exact ignition can NEVER see it again — a welded
 *     component is not an exact recipe — so the restored stamp is registered here, with its own shapes
 *     passed explicitly. The anchor is the one the matcher itself would pick (the hub; the lowest ring
 *     id), so if the weld is later cut away the matcher's de-dup still recognises it. The same gates the
 *     matcher applies: the restored shapes must stand as the recipe on their own, and
 *     `fallenTowerRegistrationRefused` (S192: per collection, as the register reducers de-dup; a race
 *     tower only for its own race, R137; a defender only in BUILD, S157 B6). `planStructureRepair`
 *     asks the same gate first, so a FIX this step would not finish is never offered or charged.
 */
function settleTowerIdentity(
  world: World,
  seat: PlayerId,
  unit: TowerUnit,
  recipeId: GodlyId,
  byNode: ReadonlyMap<number, PrimitiveId>,
  mayRegister: boolean,
): void {
  const groupIds = [...byNode.values()].filter((id) => world.primitives.has(id)).sort((a, b) => Number(a) - Number(b));
  if (unit.kind === 'live') {
    const rec = unit.ref.kind === 'spawner' ? world.creatureSpawners.get(unit.ref.id) : world.defenders.get(unit.ref.id);
    if (
      rec !== undefined && rec.recipeId === recipeId &&
      world.primitives.has(rec.anchorPrimitiveId) && groupIds.includes(rec.anchorPrimitiveId)
    ) {
      rec.ownPrimitiveIds = groupIds;
      return;
    }
  }
  if (!mayRegister) return;
  const shape = towerShapeFor(recipeId);
  if (shape === null) return;
  const own = new Set(groupIds);
  let anchorId: PrimitiveId | undefined;
  if (shape.kind === 'star') {
    anchorId = byNode.get(0);
    if (anchorId === undefined || starArmsAt(world, anchorId, shape.hub, shape.arms, own)?.whole !== true) return;
  } else {
    anchorId = groupIds[0];
    if (anchorId === undefined || ringMembersAt(world, anchorId, shape.type, shape.n, own) === null) return;
  }
  if (fallenTowerRegistrationRefused(world, seat, recipeId, anchorId, own)) return;
  const anchor = world.primitives.get(anchorId)!;
  const defenderRecipe = getDefenderRecipe(recipeId);
  if (defenderRecipe !== undefined) {
    applyRegisterDefender(world, {
      type: 'REGISTER_DEFENDER',
      defenderKind: defenderRecipe.defenderKind,
      ownerPlayerId: seat,
      anchorPrimitiveId: anchorId,
      recipeId,
      pos: { x: anchor.pos.x, y: anchor.pos.y },
      ownPrimitiveIds: groupIds,
    });
    return;
  }
  applyRegisterSpawner(world, { type: 'REGISTER_SPAWNER', ownerPlayerId: seat, anchorPrimitiveId: anchorId, recipeId, ownPrimitiveIds: groupIds });
}

/**
 * ⭐ S192 (audit IDENTITY-1) — PURE: would registering a RESTORED fallen tower at `anchorId` be refused?
 * The ONE gate both `planStructureRepair` (so a FIX that cannot finish is never offered, and the reducer
 * never consumes for it — the "cannot half-spend" contract above) and `settleTowerIdentity` read.
 *
 * ⛔ PER COLLECTION, the way the register reducers themselves de-dup — NOT "any tower anchored among its
 * shapes". Round 5 refused whenever ANY live record (either collection, any recipe) was anchored on one of
 * the restored shapes; on the W2-4 board (a mummies Line ring through a laser turret's Line hub) the
 * ring's anchor IS the hub, so the turret's FIX was charged and never re-registered. A record of the
 * OTHER collection anchored there blocks nothing: spawner and defender maps and de-dups are separate.
 *
 *   · the reducer's own de-dup — a record of THIS collection already anchored at `anchorId`
 *     (`applyRegisterDefender` / `applyRegisterSpawner` would silently register nothing);
 *   · a duplicate — a record of the SAME recipe in this collection anchored among `own`;
 *   · a race tower only for its own race (R137); a defender only in BUILD (S157 B6).
 *
 * `anchorId` is `undefined` when the anchor is a node the FIX is about to re-mint: a fresh id, which no
 * record can be anchored at.
 */
function fallenTowerRegistrationRefused(
  world: World,
  seat: PlayerId,
  recipeId: GodlyId,
  anchorId: PrimitiveId | undefined,
  own: ReadonlySet<PrimitiveId>,
): boolean {
  const race = raceForTowerId(recipeId) ?? raceForT9TowerId(recipeId);
  if (race !== null && world.players.get(seat)?.raceId !== race) return true;
  const isDefender = getDefenderRecipe(recipeId) !== undefined;
  if (isDefender && world.matchPhase !== 'BUILD') return true;
  const records = isDefender ? [...world.defenders.values()] : [...world.creatureSpawners.values()];
  for (const r of records) {
    if (r.anchorPrimitiveId === anchorId) return true;
    if (r.recipeId === recipeId && own.has(r.anchorPrimitiveId)) return true;
  }
  return false;
}

/**
 * ⭐ S192 (audit IDENTITY-1) — PURE: will a tower-scope FIX of this FALLEN stamp be able to register it?
 * Predicts `settleTowerIdentity`'s anchor (a star's hub = node 0; a ring's lowest id — a re-minted node's
 * id is fresh and higher, so the lowest SURVIVING member) and asks the shared gate. The geometric check
 * stays in the settle step as its backstop: a FIX re-welds exactly the blueprint's edges, so the
 * restored group stands as the recipe by construction.
 */
/** S194 (R194-22) — exported for the render-side fix-me sparkle (`render/brokenTowers.ts`): same predicate, no behaviour change. */
export function fallenTowerFixCanRegister(world: World, seat: PlayerId, group: BlueprintGroup): boolean {
  const shape = towerShapeFor(group.blueprintId);
  if (shape === null) return false;
  const survivors = [...group.byNode.values()].filter((id) => world.primitives.has(id)).sort((a, b) => Number(a) - Number(b));
  const anchorId = shape.kind === 'star' ? group.byNode.get(0) : survivors[0];
  return !fallenTowerRegistrationRefused(world, seat, group.blueprintId, anchorId, new Set(survivors));
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
  for (const d of defendersAnchoredIn(world, doomed)) destroyDefender(world, d);

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

/**
 * S151 P2 — every bond whose BOTH endpoints are inside `memberIds`, i.e. the structure's own
 * connectors. Scoped to the member set rather than to a component so a repaired tower never heals a
 * neighbouring structure it happens to be bonded to.
 */
function bondIdsWithin(world: World, memberIds: ReadonlySet<PrimitiveId>): BondId[] {
  const out: BondId[] = [];
  for (const [id, b] of world.bonds) {
    if (memberIds.has(b.aId) && memberIds.has(b.bId)) out.push(id);
  }
  return out;
}
