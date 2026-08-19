/**
 * SPARK — S144 P1: BUILD_BLUEPRINT — click a tower, it gets built for you.
 *
 * Owner ruling (2026-08-13): *"you have a place to click on the tower (you dont even need to build it
 * physically) and it builds it for you. then the spark (your cruiser) just drags it to where you want
 * it to be!"* — *"like a classical TD (more or less)"*.
 *
 * This reducer is the "it builds it for you" half. It consumes the shapes your gatherers hauled home
 * and stamps the recipe's REAL primitives and bonds at the drop point, then lets the existing
 * structural matcher ignite the tower exactly as if you had assembled it by hand. See
 * `blueprints.ts` for why real geometry is the only workable representation (short version: a
 * defender with no primitives under it fails `stillValid` and is torn down within 0.5 s).
 *
 * ## ⭐ THE ONE LINE THIS WHOLE FEATURE HANGS ON: THE `BOND_FORMED` EMIT
 *
 * `runDefenderIgnition` and `runSpawnerIgnition` (`godlyMatcherCore.ts:137` / `:155`) EACH open with
 * their own sweep over `world.effects` and `if (!hasTopologyChange) return;`. The cinematic arm
 * likewise scans `world.effects` for `BOND_FORMED`. They are called unconditionally every host tick,
 * which makes them *look* like structural scans — they are not. **Without an emitted `BOND_FORMED`,
 * a perfectly-formed stamped structure sits inert forever: no tower, no error, no log line, for all
 * six recipes.** This was caught in S144 PRIME-AUDIT only by reading the callee guards; reading the
 * call site said the opposite. Do not remove the emit, and do not "optimise" it into a per-bond loop:
 * `placePrimitive` emits exactly ONE collapsed event per placement (Council R1 Adoption-B — N events
 * stack N clave SFX), and this mirrors that.
 *
 * ## SOURCING: BANK FIRST, PORCH ONLY AS OVERFLOW
 *
 * The bill is filled from the castle bank first and only then from loose shapes sitting on this
 * player's own porch. Two reasons:
 *   • `CASTLE_BANK_CAP` is 7 and voltkin costs 8, so bank-alone would make ONE of the six recipes
 *     permanently unbuildable. Bank ∪ porch is 11. This deliberately does NOT touch the owner's open
 *     7-vs-12/13 cap ruling — the cap is unchanged and the carve-down tactic it protects is intact.
 *   • Bank-first (rather than nearest-first or cheapest-first) means the only case where a shape the
 *     player can SEE disappears is the one recipe that genuinely cannot be paid for out of the bank.
 *     Council raised exactly this as "why did my porch Square vanish?"; confining it to voltkin is
 *     the answer, and the panel row shows the pooled count so the total is never a surprise.
 *
 * ⚠ Only `state.kind === 'Free'` porch sparks are eligible. A spark mid-carry by a player or a
 * gatherer is excluded — consuming one would strand its carrier holding a spark that no longer
 * exists. (Porch shapes live in `world.freeSparks`, a different collection from `world.primitives`,
 * so they carry no bonds and consuming one can never sever a structure or trigger a death blast.)
 *
 * ## NO-OP, NEVER AN ERROR
 *
 * Follows `applyPullFromBank`, NOT `placePrimitive`: `placePrimitive` is the only reducer family that
 * throws, and a stale client index or a raced affordability check reaching a throwing reducer would
 * kill the host's dispatch loop. Every refusal here returns `world` untouched. Affordability is
 * planned in full BEFORE anything is consumed, so a refused build cannot half-spend the bank.
 */

import { lookupCombo } from '../combos.ts';
import { bankOf, bankRemove, isOwnPorchSpark } from './castleBank.ts';
import { blueprintFor } from './blueprints.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { detectComboDiscoveries } from './comboDiscovery.ts';
import { makePrimitiveFromSpark } from '../game/primitive.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { makeBond } from './placePrimitive.ts';
import { asPrimitiveId, asSparkId } from '../types.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import type { Spark } from '../game/spark.ts';
import type { World } from './world.ts';
import type { PlayerId, Vec2 } from '../types.ts';
import { ALL_SPARK_TYPES, type SparkType } from '../constants.ts';

export interface BuildBlueprintAction {
  readonly type: 'BUILD_BLUEPRINT';
  readonly playerId: PlayerId;
  readonly blueprintId: GodlyId;
  /** Where the player released the drag — the blueprint's centre, not its first node. */
  readonly centre: Vec2;
}

/**
 * One resolved payment for a node, and where it comes from.
 *
 * ⭐ S146 P2 — A BANK PAYMENT NO LONGER CARRIES AN ENTITY. The castle inventory is a per-type tally,
 * so "the bank pays for this node" is fully described by the TYPE. Only a porch payment names a real
 * spark, because that one has to be deleted out of `world.freeSparks`.
 */
type Payment =
  | { readonly from: 'bank'; readonly sparkType: SparkType }
  | { readonly from: 'porch'; readonly spark: Spark };

/**
 * PURE — the porch shapes this seat may spend, in deterministic id order.
 *
 * THE single definition of porch eligibility, so the panel's "can I afford this?" readout and the
 * reducer's payment plan can never disagree about what counts. Two rules:
 *   • it must be sitting on THIS seat's porch (`isOwnPorchSpark`);
 *   • it must be `Free` — a spark mid-carry by a player or a gatherer is excluded, because consuming
 *     it would strand its carrier holding a spark that no longer exists.
 * Sorted by id because `Map` iteration is insertion order, which is host-history-dependent; sorting
 * keeps the same bill resolving the same way on every peer.
 */
export function eligiblePorchSparks(world: World, playerId: PlayerId): Spark[] {
  const seat = playerId as unknown as number;
  return [...world.freeSparks.values()]
    .filter((s) => s.state.kind === 'Free' && isOwnPorchSpark(seat, s.pos, world.layout))
    .sort((a, b) => (a.id as unknown as number) - (b.id as unknown as number));
}

/**
 * PURE — how many of each `SparkType` this seat could spend right now (bank ∪ eligible porch).
 *
 * Drives the panel's per-shape have/need readout. Deliberately a COUNT rather than a re-implementation
 * of the payment search: `planBlueprintPayment` is the authority on whether a specific bill can be
 * covered (and the panel calls it for exactly that), while this answers the different question the UI
 * needs — "what am I short, and by how much?".
 */
export function availableShapeCounts(world: World, playerId: PlayerId): Map<SparkType, number> {
  const counts = new Map<SparkType, number>();
  const bump = (t: SparkType): void => { counts.set(t, (counts.get(t) ?? 0) + 1); };
  const bank = bankOf(world.castleBanks, playerId);
  for (const t of ALL_SPARK_TYPES) {
    const n = bank[t as number] ?? 0;
    if (n > 0) counts.set(t, (counts.get(t) ?? 0) + n);
  }
  for (const s of eligiblePorchSparks(world, playerId)) bump(s.type);
  return counts;
}

/**
 * PURE-ish (reads world, mutates nothing) — resolve who pays for every node, or null if the player
 * cannot cover the bill.
 *
 * Exported so the panel's affordability readout and the reducer agree by CONSTRUCTION rather than by
 * two similar-looking implementations. `castleStructuresModel` (P2) asks this exact question.
 *
 * Matching is per-node in blueprint order, bank-before-porch, first-fit by exact `SparkType`. A
 * blueprint's bill is a small multiset (4–8 shapes) over at most 11 candidates, so first-fit is both
 * sufficient and deterministic — there is no packing subtlety, because every node demands one exact
 * type and no shape can satisfy two different types.
 */
export function planBlueprintPayment(
  world: World,
  playerId: PlayerId,
  blueprintId: GodlyId,
): Payment[] | null {
  const bp = blueprintFor(blueprintId);
  if (bp === undefined) return null;
  const bank = bankOf(world.castleBanks, playerId);
  const porch = eligiblePorchSparks(world, playerId);

  // How many of each type the inventory has left to commit as we walk the bill. A local copy, so
  // planning stays PURE — nothing is spent until `applyBuildBlueprint` decides the whole build works.
  const bankLeft = ALL_SPARK_TYPES.map((t) => bank[t as number] ?? 0);
  const usedPorch = new Set<Spark>();
  const payments: Payment[] = [];

  for (const node of bp.nodes) {
    let paid: Payment | null = null;
    if ((bankLeft[node.type as number] ?? 0) > 0) {
      bankLeft[node.type as number] = (bankLeft[node.type as number] ?? 0) - 1;
      paid = { from: 'bank', sparkType: node.type };
    }
    if (paid === null) {
      for (const s of porch) {
        if (usedPorch.has(s) || s.type !== node.type) continue;
        usedPorch.add(s);
        paid = { from: 'porch', spark: s };
        break;
      }
    }
    if (paid === null) return null; // cannot afford — caller must consume NOTHING
    payments.push(paid);
  }
  return payments;
}

/**
 * S144 P1 — build a blueprint at `action.centre`, paying from bank ∪ own porch.
 *
 * Order of operations is load-bearing: validate everything and resolve the FULL payment plan first,
 * then consume, then mint, then emit. Nothing is spent unless the whole build will succeed.
 */
export function applyBuildBlueprint(world: World, action: BuildBlueprintAction): World {
  const player = world.players.get(action.playerId);
  if (player === undefined) return world;

  const bp = blueprintFor(action.blueprintId);
  if (bp === undefined) return world; // unknown id from a stale/hostile client → no-op

  // Host re-validates the drop site authoritatively. The client tinted its ghost with this same
  // predicate, but a joiner tints against a lagged snapshot, so the host's answer is the real one.
  if (stampRefusalAt(world, action.centre, action.playerId, action.blueprintId) !== null) return world;

  const payments = planBlueprintPayment(world, action.playerId, action.blueprintId);
  if (payments === null) return world; // unaffordable → nothing consumed

  // ── CONSUME ────────────────────────────────────────────────────────────────────────────────────
  // ⭐ S146 P2 — no more descending-index splice dance. The old bank was an array and `bankTake`
  // spliced, so consuming a low index first shifted every higher one and paid the wrong shapes; the
  // fix was to sort indices descending. A per-type tally has no indices to invalidate, so the whole
  // hazard is gone and the order of these decrements cannot matter.
  for (const p of payments) {
    if (p.from === 'bank') bankRemove(world.castleBanks, action.playerId, p.sparkType);
    else world.freeSparks.delete(p.spark.id);
  }

  // ── MINT PRIMITIVES ────────────────────────────────────────────────────────────────────────────
  // Each consumed spark BECOMES the primitive at its node, keeping the substrate honest: the shapes
  // your gatherers hauled home are literally the shapes standing in the tower.
  const minted = payments.map((p, i) => {
    const node = bp.nodes[i];
    // A porch payment converts the REAL spark that was standing there. A bank payment has no entity
    // to convert (the inventory is a tally), so a TRANSIENT source is synthesized for the node's
    // type. It is never inserted into any collection and its id is never observed:
    // `makePrimitiveFromSpark` reads only `type` and `pos`, and the primitive is minted with its own
    // `nextPrimitiveId`. Using the shared allocator here would burn negative ids for objects that do
    // not survive the statement.
    const spark: Spark =
      p.from === 'porch'
        ? p.spark
        : makeFreeSpark({
            id: asSparkId(0),
            type: p.sparkType,
            pos: { x: action.centre.x + node.dx, y: action.centre.y + node.dy },
            velocity: { x: 0, y: 0 },
            dt: 1,
            createdTick: world.tick,
          });
    // makePrimitiveFromSpark copies spark.pos into BOTH pos and prevPos (zero implied velocity), so
    // the position must be set before the call. Zero velocity + rest-length bonds = zero initial
    // strain, which is what keeps a fresh stamp from tearing itself apart (see blueprintLegality).
    spark.pos.x = action.centre.x + node.dx;
    spark.pos.y = action.centre.y + node.dy;
    const prim = makePrimitiveFromSpark({
      id: asPrimitiveId(world.nextPrimitiveId++),
      spark,
      placerColor: player.color,
      placedBy: player.id,
      tick: world.tick,
    });
    world.primitives.set(prim.id, prim);
    return prim;
  });

  // ── MINT BONDS ─────────────────────────────────────────────────────────────────────────────────
  // EXACTLY the blueprint's bond list — no primary-target search, no redundancy spread, no
  // cross-component merge sweep. Those three are what ordinary placement adds
  // (`computePreviewBonds`), and any one of them would weld a chord onto pentagram's deg-2 ring or
  // break voltkin's strict chain isolation.
  const firstNewBondId = world.nextBondId;
  for (const [ai, bi] of bp.bonds) {
    const a = minted[ai];
    const b = minted[bi];
    // Stiffness comes from the SAME combo table a hand-placed bond consults, so a stamped Square↔
    // Circle really is a 'Capsule' — which matters, because the recipes are documented in combo
    // terms ("1 Square + 3 Capsules") and the combo drives both feel and discovery.
    const bond = makeBond(world, a, b, lookupCombo(a.type, b.type).stiffnessTier);
    world.bonds.set(bond.id, bond);
    a.bonds.add(bond.id);
    b.bonds.add(bond.id);
  }

  // ── ARM THE MATCHER ────────────────────────────────────────────────────────────────────────────
  // ⭐ Do not remove. Without this the structure never ignites — see the file docblock.
  const bondsFormed = (world.nextBondId as unknown as number) - (firstNewBondId as unknown as number);
  if (bondsFormed > 0) {
    world.effects.push({
      kind: 'BOND_FORMED',
      tick: world.tick,
      pos: { x: action.centre.x, y: action.centre.y },
      bondCount: bondsFormed,
    });
    // A menu-built tower discovers its combos exactly like a hand-built one — otherwise the Codex
    // would quietly stop filling in for players who use the build menu, which is now the primary
    // way to build.
    detectComboDiscoveries(world, firstNewBondId);
  }

  return world;
}
