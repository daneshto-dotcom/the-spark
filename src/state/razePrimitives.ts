/**
 * SPARK — the ONE way a placed primitive leaves the world.
 *
 * ## Why this file exists (S138 P1, found by A.0 + Council)
 *
 * Before this, there was **no shared raze path**. Exactly two sites deleted primitives —
 * `disruptionManager.applySeverTopology` and `potatoLifecycle` (the blast) — and they
 * DUPLICATED an identical four-step cleanup contract:
 *
 *   1. unregister every incident bond from BOTH endpoint primitives' `bonds` sets,
 *   2. delete those bonds from `world.bonds`,
 *   3. delete the primitives themselves,
 *   4. `snapPrevPosForUnbonded` (Verlet fixup) + `reconcileFouledPrimitives` (S79 P3 HIGH-1).
 *
 * S138 P1 introduces a THIRD reason a primitive can vanish — reaching 0 hp — and the
 * Council's standing objection was precisely that a third hand-rolled copy is how the
 * copies silently diverge. So the contract is extracted here ONCE and all three callers
 * route through it. Steps 3 and 4 are the ones that bite when skipped: omitting (1)/(2)
 * leaves a bond pointing at a deleted primitive, and omitting (4) leaves a fouled-splat
 * fragment permanently income-0 and un-cleanable.
 *
 * ## What this function deliberately does NOT do
 *
 * - **No effects.** Callers push their own (`SEVER_ERASE`, `BOMB_EXPLODE`, …) before
 *   calling, because the effect kind and its position are caller semantics.
 * - **No authorization.** Charge costs / bench gates / legality live in the callers.
 * - **No recipe-break handling.** Removing a primitive can break a godly recipe; that is
 *   re-derived by the existing host-tick matcher poll (`REMOVE_DEFENDER`), which already
 *   runs off live geometry every tick and therefore needs no notification from here.
 *
 * ## Determinism
 *
 * Bond ids are deleted in ASCENDING NUMERIC ORDER. The potato site already sorted; the
 * sever site did not. Bond deletion is order-independent in its effect on final state
 * (each removal touches only its own two endpoints and its own map entry, and this
 * function pushes no effects), so sorting cannot change the hash — it is adopted because
 * it makes the traversal identical on host and worker regardless of how the caller's
 * collection was built. Tick-domain only; no RNG; no wall-clock.
 */

import { snapPrevPosForUnbonded } from '../game/invariants.ts';
import type { BondId, PrimitiveId } from '../types.ts';
import { reconcileFouledPrimitives } from './seagulls/seagullLifecycle.ts';
import type { World } from './worldTypes.ts';

/**
 * Remove `primIds` from the world, together with every bond incident to them.
 *
 * @param primIds  the primitives to delete. Ids that are already gone are skipped.
 * @param alsoBonds  extra bonds to delete even though they may survive the primitive
 *   sweep — used by SEVER, where the severed bond itself dies while BOTH of its endpoint
 *   primitives can live on (a sever that splits a component deletes no primitive at all).
 */
export function razePrimitives(
  world: World,
  primIds: Iterable<PrimitiveId>,
  alsoBonds?: Iterable<BondId>,
): void {
  // Collect first, mutate second. Deriving the incident set from the live primitives BEFORE
  // any deletion is what makes "taking [0,1,2]" safe here — cf. the bankTake splice trap.
  const doomedBonds = new Set<BondId>(alsoBonds ?? []);
  const doomedPrims: PrimitiveId[] = [];
  for (const primId of primIds) {
    const prim = world.primitives.get(primId);
    if (prim === undefined) continue;
    doomedPrims.push(primId);
    for (const bondId of prim.bonds) doomedBonds.add(bondId);
  }

  for (const bondId of [...doomedBonds].sort((a, b) => Number(a) - Number(b))) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    world.primitives.get(bond.aId)?.bonds.delete(bondId);
    world.primitives.get(bond.bId)?.bonds.delete(bondId);
    world.bonds.delete(bondId);
  }

  for (const primId of doomedPrims) world.primitives.delete(primId);

  snapPrevPosForUnbonded(world.primitives);

  // S79 P3 (HIGH-1) — a raze can delete fouled prims AND split a fouled component off its
  // splat-anchor. Re-derive the foul set from the live splats so no stale id leaks and no
  // splat-less fragment stays income-0 un-cleanable. Early-outs when nothing is fouled.
  reconcileFouledPrimitives(world);
}
