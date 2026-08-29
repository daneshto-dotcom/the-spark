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
  /**
   * ⭐ S157 B2 — also take any shape that LOST ITS LAST BOND in this teardown.
   *
   * OPT-IN, and the default is `false` on purpose. The owner's report is about a STRUCTURE coming
   * apart — *"when there are no connectors left in a destroyed tower, the last shape should be
   * destroyed and dissapear with the last connector"* — so the sever and damage paths pass true.
   *
   * ⛔ THE AREA HAZARDS DELIBERATELY DO NOT. `applyRadialClear`'s identity is that it is
   * POSITION-based: it takes what is inside the radius and *"spares those outside"*, which
   * `potatoLifecycle` documents and a shipped test pins by name. Orphan-razing there would reach
   * outside the blast and delete a shape the player can see was never in it — a different mechanic,
   * decided while the owner is asleep. Left for them to rule on; recorded rather than assumed.
   */
  razeOrphans = false,
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

  /*
   * ⭐ S157 B2 (owner) — REMEMBER WHO WAS ATTACHED, so a shape left holding nothing dies with it.
   *
   * Owner: *"when there are no connectors left in a destroyed tower, the last shape/primitive should
   * be destroyed and dissapear with the last connector. instead the last shape stays and attracts
   * enemy fire and it takes a million hits to kill it - WEIRD and too long!"*
   *
   * The survivor is created by `severSplit`, which deletes the SMALLER side of a cut and keeps the
   * larger — so on the final bond of a two-primitive structure both sides are size 1 and the
   * tie-break always leaves exactly one shape standing, by construction. It then has zero bonds, and
   * NOTHING in the game removed a bond-less primitive.
   *
   * That is why it felt unkillable rather than merely annoying: chewers, Voltkin and drones all
   * target BONDS, so three of the four attacker families could not touch it at all, and the fourth
   * needed six swings (`GOBLIN_DAMAGE_VS_PRIMITIVE` 167 vs `PRIMITIVE_MAX_HP` 1000) — six times the
   * cost of the single connector that had been holding it up. Meanwhile it still scored, so a
   * "destroyed" tower kept paying its owner.
   */
  const neighbours = new Set<PrimitiveId>();
  for (const bondId of doomedBonds) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    neighbours.add(bond.aId);
    neighbours.add(bond.bId);
  }

  for (const bondId of [...doomedBonds].sort((a, b) => Number(a) - Number(b))) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    world.primitives.get(bond.aId)?.bonds.delete(bondId);
    world.primitives.get(bond.bId)?.bonds.delete(bondId);
    world.bonds.delete(bondId);
  }

  for (const primId of doomedPrims) world.primitives.delete(primId);

  /*
   * ⭐ S157 B2 — and now take anything that LOST its last bond in this teardown.
   *
   * ⛔ "LOST its last bond", never "has no bonds". A freshly placed shape a player has not bonded to
   * anything yet is a completely legal board state (`invariants.ts` treats bond-less primitives as
   * first-class), and razing those would delete the opening move of every match. The distinction is
   * free here: `neighbours` is derived from the bonds being destroyed, so a shape that was never
   * attached to the doomed set can never appear in it.
   *
   * ⚠ Placed at the ONE removal path rather than at the sever site. Review caught that a sever-only
   * fix is insufficient — a goblin killing one half of a two-shape structure orphans the other half
   * through `damageEntity` with no sever involved, and so does any `applyRadialClear`. All of them
   * funnel through here, which is what this module was extracted to be.
   *
   * No cascade is possible: an orphan by definition holds no bonds, so removing it cannot strip a
   * bond from anyone else. One pass is complete.
   */
  const orphans: PrimitiveId[] = [];
  if (razeOrphans) for (const primId of neighbours) {
    const prim = world.primitives.get(primId);
    if (prim !== undefined && prim.bonds.size === 0) orphans.push(primId);
  }
  if (orphans.length > 0) {
    orphans.sort((a, b) => Number(a) - Number(b)); // deterministic, like every other loop here
    for (const primId of orphans) {
      const prim = world.primitives.get(primId);
      if (prim === undefined) continue;
      world.effects.push({
        kind: 'SEVER_ERASE',
        tick: world.tick,
        pos: { x: prim.pos.x, y: prim.pos.y },
        color: prim.placerColor,
        radius: prim.radius,
      });
      world.primitives.delete(primId);
    }
  }

  snapPrevPosForUnbonded(world.primitives);

  // S79 P3 (HIGH-1) — a raze can delete fouled prims AND split a fouled component off its
  // splat-anchor. Re-derive the foul set from the live splats so no stale id leaks and no
  // splat-less fragment stays income-0 un-cleanable. Early-outs when nothing is fouled.
  reconcileFouledPrimitives(world);
}
