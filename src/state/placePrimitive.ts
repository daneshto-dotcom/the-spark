/**
 * SPARK — PLACE_PRIMITIVE dispatch handler, extracted from world.ts.
 *
 * S14 P2.0 — mechanical extraction (zero behavior change) per § XV soft
 * LOC charter compliance (world.ts breached 587 LOC at S13 close, 17% over
 * the 500 soft cap). All logic moved verbatim; only the file address
 * changes. S13's reflexion #per-priority-commit-vs-thematic-batching is
 * deliberately observed: this commit is pure code motion so the
 * 223/216-test diff is preserved exactly through the move.
 *
 * Spec § IX.5 (v0.5.1): no building inside the spawner zone. The zone is
 * for spawning + collection only; placing there would put your structure
 * in the one always-visible-to-all-players area, breaking the geographic
 * trade-off in § X.2.
 *
 * Rejection is silent at the dispatch layer — the carry slot is preserved
 * (no spark loss). The connect-drag preview shows red feedback so the
 * player understands. Caller should check `controls.cursor` first to avoid
 * even sending the action; this is the defensive backstop.
 */

import { lookupCombo } from '../combos.ts';
import {
  MERGE_IMPULSE_MAGNITUDE,
  MIN_BOND_LENGTH_FOR_IMPULSE,
  SCORE_ANCHOR,
  SCORE_FUNCTIONAL_BOND,
  SCORE_MAGIC_BOND,
  SCORE_TIER_STEP,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  STRUCTURE_GROW_IMPULSE,
  type StiffnessTier,
} from '../constants.ts';
import { CarryViolation, drop as fsmDrop, tickBuildAction } from '../game/player.ts';
import { makePrimitiveFromSpark, type Primitive } from '../game/primitive.ts';
import { bfsHopMap, componentOf, type Structure } from '../game/structure.ts';
import type { Bond } from '../physics/bonds.ts';
import { asBondId, asPrimitiveId, type PlayerId, type PrimitiveId } from '../types.ts';
import { addScore, requirePlayer, type World } from './world.ts';

/** Action payload for PLACE_PRIMITIVE — exported so world.ts can compose GameAction. */
export interface PlacePrimitiveAction {
  readonly type: 'PLACE_PRIMITIVE';
  readonly playerId: PlayerId;
  readonly targetPrimitiveId: PrimitiveId | null;
  readonly stiffnessTier: StiffnessTier;
  /**
   * S9 P2: nearby primitives the placement should also auto-bond to,
   * one bond per *other* connected component (the primary target's
   * component is already merged via targetPrimitiveId). Caller passes
   * all primitives within MERGE_REACH_RADIUS of spark.pos; placePrimitive
   * dedups by component AND picks the nearest primitive per component
   * (S13 P1) so each surrounding structure gets exactly one merge bond.
   */
  readonly mergeCandidateIds?: ReadonlyArray<PrimitiveId>;
  /**
   * S14 P2.1: in-same-component additional target IDs for redundancy
   * bonds. Each id creates one extra bond from the new primitive to the
   * target (raid-resistance: a single sever near the new prim no longer
   * amputates if it's bonded to multiple neighbors in the same
   * structure). Caller (controls.ts: redundantBondTargetsInSameComponent)
   * has already filtered for primary's component + AUTO_BOND_RADIUS +
   * angular spread. This handler treats the list as advisory + validates
   * in DEV (drops malformed entries silently in production).
   *
   * Bonds in this list:
   *   - Use combo-table stiffness via lookupCombo(new.type, target.type)
   *   - Emit BOND_COMMIT per bond (visible structure growth)
   *   - DO NOT increment scoreProgress (Council R1 G5/G8 adoption —
   *     redundancy = defense, not score velocity)
   *   - DO NOT receive verlet impulse (intra-component, would perturb
   *     rigid-body equilibrium relative to the primary bond)
   */
  readonly extraBondTargetIds?: ReadonlyArray<PrimitiveId>;
}

export function placePrimitive(world: World, action: PlacePrimitiveAction): World {
  const player = requirePlayer(world, action.playerId);
  if (player.kind !== 'Carrying') throw new CarryViolation('not carrying — cannot place');

  const sparkId = player.carriedSparkId;
  const spark = world.freeSparks.get(sparkId);
  if (spark === undefined) throw new Error(`carried spark ${sparkId} missing`);

  // No-build-zone enforcement (§ IX.5). Carry is preserved on rejection.
  // Strict inequality: placing exactly on the ring is allowed (liminal,
  // and matches the existing per-substep bound check in spawner.ts).
  const dx = spark.pos.x - SPAWNER_CENTER_X;
  const dy = spark.pos.y - SPAWNER_CENTER_Y;
  if (dx * dx + dy * dy < SPAWNER_RADIUS * SPAWNER_RADIUS) {
    return world;
  }

  const primId = asPrimitiveId(world.nextPrimitiveId++);
  const prim = makePrimitiveFromSpark({
    id: primId,
    spark,
    placerColor: player.color,
    placedBy: player.id,
    tick: world.tick,
  });
  world.primitives.set(primId, prim);

  // Spark is consumed by the placement.
  world.freeSparks.delete(sparkId);

  // S18 P1 — snapshot bond count for BOND_FORMED audio aggregation.
  const bondsAtStart = world.bonds.size;

  // Track which components are already bonded to this new primitive so the
  // P2 sweep below doesn't double-bond into a component the primary target
  // already pulled in.
  const mergedComponents = new Set<PrimitiveId>();

  // S13 P2: snapshot primary's pre-existing component (everything in
  // primary's component EXCEPT the new prim) so STRUCTURE_GROW outward
  // impulse can apply to those prims only. Cand components get inward
  // MERGE_IMPULSE instead (S10 P3 above). Empty for anchor placements
  // (no primary target → no pre-existing structure to "grow").
  const primaryPreExistingPrims: PrimitiveId[] = [];

  // S10 P4: snapshot scoreProgress so the tier-crossing emission can fire
  // exactly one SCORE_TIER per multiple of SCORE_TIER_STEP crossed during
  // this placement. Captured BEFORE any bond/merge score increments.
  const oldScore = world.scoreProgress;

  if (action.targetPrimitiveId !== null) {
    const target = world.primitives.get(action.targetPrimitiveId);
    if (target === undefined) throw new Error(`target primitive ${action.targetPrimitiveId} missing`);
    const bond = makeBond(world, prim, target, action.stiffnessTier);
    world.bonds.set(bond.id, bond);
    prim.bonds.add(bond.id);
    target.bonds.add(bond.id);
    // S6 P3: combo signature drives distinct placeholder flair in the
    // effects renderer. Direction is carried→target (matches order-dependent
    // combo table § V.1).
    const combo = lookupCombo(prim.type, target.type);
    world.effects.push({
      kind: 'BOND_COMMIT',
      tick: world.tick,
      pos: { x: prim.pos.x, y: prim.pos.y },
      color: prim.placerColor,
      radius: prim.radius,
      visualEffectId: combo.visualEffectId,
      otherPos: { x: target.pos.x, y: target.pos.y },
    });
    // S9 P3: weight progress by combo magic-ness.
    // S15 P2: addScore writes per-player + recomputes scoreProgress in 1v1.
    addScore(world, action.playerId, combo.isMagical ? SCORE_MAGIC_BOND : SCORE_FUNCTIONAL_BOND);
    // Track the primary target's entire component so the sweep skips it.
    // Also snapshot the pre-existing IDs (component minus new prim) for
    // the S13 P2 STRUCTURE_GROW outward impulse below.
    for (const id of componentOf(target, world.primitives, world.bonds).primitiveIds) {
      mergedComponents.add(id);
      if (id !== prim.id) primaryPreExistingPrims.push(id);
    }
  } else {
    // S9 P3: anchor placement (no bond) earns one progress point.
    // S15 P2: per-player tracking via addScore.
    addScore(world, action.playerId, SCORE_ANCHOR);
  }

  // S14 P2.1: redundancy bonds — additional bonds to other primitives
  // in the primary's component (target is required for redundancy; anchor
  // placements have no primary component → no redundancy). Created AFTER
  // primary bond + mergedComponents populated, BEFORE merge sweep so the
  // merge-sweep dedup (skips primary-component candidates) is unaffected.
  //
  // No score, no impulse: see PlacePrimitiveAction.extraBondTargetIds doc.
  // BOND_COMMIT is emitted per bond so the renderer still pops the visual.
  //
  // DEV invariant checks (Gemini G3.3 adoption): caller (controls.ts)
  // is the canonical source of extraBondTargetIds and should never emit
  // malformed payloads, but the dispatch seam is the network boundary in
  // Phase 3 (§ 10.2) so defensive validation matters here. In production
  // any malformed entry is skipped silently to avoid game crashes on
  // unexpected input.
  if (
    action.targetPrimitiveId !== null
    && action.extraBondTargetIds !== undefined
    && action.extraBondTargetIds.length > 0
  ) {
    const seenInThisPlace = new Set<PrimitiveId>([prim.id, action.targetPrimitiveId]);
    for (const extraId of action.extraBondTargetIds) {
      // Defensive validation — order matters: self-id, primary-id,
      // duplicate, missing-from-world, not-in-primary-component.
      if (extraId === prim.id) {
        if (import.meta.env.DEV) {
          console.error(`[S14 P2.1] extraBondTargetIds contains self-id ${prim.id}`);
        }
        continue;
      }
      if (extraId === action.targetPrimitiveId) {
        if (import.meta.env.DEV) {
          console.error(`[S14 P2.1] extraBondTargetIds duplicates primary target ${extraId}`);
        }
        continue;
      }
      if (seenInThisPlace.has(extraId)) {
        if (import.meta.env.DEV) {
          console.error(`[S14 P2.1] extraBondTargetIds contains duplicate ${extraId}`);
        }
        continue;
      }
      const extraTarget = world.primitives.get(extraId);
      if (extraTarget === undefined) {
        if (import.meta.env.DEV) {
          console.error(`[S14 P2.1] extraBondTargetIds references missing primitive ${extraId}`);
        }
        continue;
      }
      if (!mergedComponents.has(extraId)) {
        // Caller bug or stale id — extra target must be in primary's
        // component (mergedComponents was populated from componentOf(target)
        // above; if a target isn't in there, it doesn't belong to the
        // primary's structure).
        if (import.meta.env.DEV) {
          console.error(
            `[S14 P2.1] extraBondTargetIds contains ${extraId} not in primary's component`,
          );
        }
        continue;
      }
      seenInThisPlace.add(extraId);

      const extraCombo = lookupCombo(prim.type, extraTarget.type);
      const extraBond = makeBond(world, prim, extraTarget, extraCombo.stiffnessTier);
      world.bonds.set(extraBond.id, extraBond);
      prim.bonds.add(extraBond.id);
      extraTarget.bonds.add(extraBond.id);

      world.effects.push({
        kind: 'BOND_COMMIT',
        tick: world.tick,
        pos: { x: prim.pos.x, y: prim.pos.y },
        color: prim.placerColor,
        radius: prim.radius,
        visualEffectId: extraCombo.visualEffectId,
        otherPos: { x: extraTarget.pos.x, y: extraTarget.pos.y },
      });
      // DELIBERATE: no scoreProgress increment for redundancy bonds.
      // DELIBERATE: no MERGE_IMPULSE / verlet impulse — intra-component
      //             bond would perturb structure equilibrium relative
      //             to the primary bond. STRUCTURE_GROW outward impulse
      //             at function end will move the target outward as
      //             part of primaryPreExistingPrims, which is correct
      //             (entire structure puffs together on growth).
    }
  }

  // S9 P2 + S13 P1: cross-structure merge sweep. Two-phase:
  //   Phase 1 — group candidates by connected component, picking the
  //             primitive nearest the new prim per component.
  //   Phase 2 — iterate one merge per chosen-nearest cand.
  // Replaces S9's implicit "first-iterated cand wins" pattern with an
  // explicit nearest-pick map so the merge bond endpoint is always the
  // shortest reachable hop into that component (Council Gemini #2:
  // removes reliance on candidate iteration order). Combined with
  // controls.ts using MERGE_REACH_RADIUS (=100, wider than the
  // primary-pick AUTO_BOND_RADIUS=60), this fixes the post-S12 playtest
  // bug "place at center of 3 structures, only one merges" — root cause
  // was the merge sweep sharing the narrower primary-pick radius.
  const candidatesByComp = new Map<PrimitiveId, { cand: Primitive; distSq: number; comp: Structure }>();
  for (const candId of action.mergeCandidateIds ?? []) {
    if (candId === prim.id) continue;
    if (mergedComponents.has(candId)) continue;
    const cand = world.primitives.get(candId);
    if (cand === undefined) continue;
    const candComp = componentOf(cand, world.primitives, world.bonds);
    // Skip if any primitive in the candidate's component is already merged
    // (e.g., it's part of the primary's component, or a previous cand in
    // the iteration already covered it).
    let alreadyCovered = false;
    for (const id of candComp.primitiveIds) {
      if (mergedComponents.has(id)) { alreadyCovered = true; break; }
    }
    if (alreadyCovered) continue;
    // Component root key: smallest primitiveId in the component. Stable
    // across BFS iteration order, used purely as Map key here.
    let rootKey: PrimitiveId | null = null;
    for (const id of candComp.primitiveIds) {
      if (rootKey === null || id < rootKey) rootKey = id;
    }
    if (rootKey === null) continue;
    const dx = cand.pos.x - prim.pos.x;
    const dy = cand.pos.y - prim.pos.y;
    const distSq = dx * dx + dy * dy;
    const existing = candidatesByComp.get(rootKey);
    if (existing === undefined || distSq < existing.distSq) {
      candidatesByComp.set(rootKey, { cand, distSq, comp: candComp });
    }
  }

  for (const { cand, comp: candComp } of candidatesByComp.values()) {
    const combo = lookupCombo(prim.type, cand.type);
    const mergeBond = makeBond(world, prim, cand, combo.stiffnessTier);
    world.bonds.set(mergeBond.id, mergeBond);
    prim.bonds.add(mergeBond.id);
    cand.bonds.add(mergeBond.id);
    world.effects.push({
      kind: 'BOND_COMMIT',
      tick: world.tick,
      pos: { x: prim.pos.x, y: prim.pos.y },
      color: prim.placerColor,
      radius: prim.radius,
      visualEffectId: combo.visualEffectId,
      otherPos: { x: cand.pos.x, y: cand.pos.y },
    });
    // S9 P3: merge bonds also contribute to progress (same weighting).
    // S15 P2: per-player tracking via addScore.
    addScore(world, action.playerId, combo.isMagical ? SCORE_MAGIC_BOND : SCORE_FUNCTIONAL_BOND);

    // S10 P3 + S13 P3: real verlet impulse on the candidate's component.
    // Each prim in candComp gets prevPos pushed AWAY from the new prim's
    // pos → verlet next-step velocity = (pos - prevPos) propels TOWARD
    // the new prim. S10 baseline: 1.2 px ≈ 2% strain on 60-px bond. S13
    // bump to 3.0 px ≈ 5% strain — well under HIGH-tier 25% break, AND
    // compression-only (impulse is INWARD; bonds break on extension per
    // physics/bonds.ts:58 only).
    //
    // S13 P3 short-bond clamp: at idist < MIN_BOND_LENGTH_FOR_IMPULSE=25,
    // scale impulse by (idist/25) so a 3.0-px impulse on a 10-px bond
    // becomes 1.2 px — prevents the impulse from teleporting the cand
    // through the new prim (which would flip the merge bond's direction).
    //
    // NOTE: counteracted on the OTHER side of the merge by STRUCTURE_GROW
    // outward impulse (P2 below) applied to primary's pre-existing
    // component. Net visual: cand sucks IN, existing puffs OUT — distinct
    // signatures across the post-merge component on the same frame.
    const mergeBondRestLength = Math.hypot(
      prim.pos.x - cand.pos.x,
      prim.pos.y - cand.pos.y,
    );
    const shortBondScale = Math.min(
      1,
      mergeBondRestLength / MIN_BOND_LENGTH_FOR_IMPULSE,
    );
    const effectiveMergeImpulse = MERGE_IMPULSE_MAGNITUDE * shortBondScale;
    for (const candPrimId of candComp.primitiveIds) {
      const candPrim = world.primitives.get(candPrimId);
      if (candPrim === undefined) continue;
      const idx = prim.pos.x - candPrim.pos.x;
      const idy = prim.pos.y - candPrim.pos.y;
      const idist = Math.hypot(idx, idy);
      if (idist < 1) continue; // co-located → skip (NaN-safe)
      const inv = effectiveMergeImpulse / idist;
      // Push prevPos away from new prim along the (cand→prim) axis →
      // (pos - prevPos) points toward new prim → instantaneous velocity
      // = effectiveMergeImpulse px in the toward-new-prim direction.
      candPrim.prevPos.x -= idx * inv;
      candPrim.prevPos.y -= idy * inv;
    }

    // S10 P3: STRUCTURE_MERGE union flash. unionPrimIds = primary growing
    // component (current mergedComponents — NOT yet including candidate)
    // ∪ candidate's full component. Snapshotted BEFORE the candidate is
    // added below, so the emit captures exactly the pre-this-merge union.
    // S10 P5: gate on world.cinematicsEnabled — the verlet impulse above
    // stays unconditional (it's a constructive physics event, not a
    // visual one; user explicitly chose physics over visual-only).
    if (world.cinematicsEnabled) {
      const unionPrimIds: PrimitiveId[] = [...mergedComponents];
      for (const id of candComp.primitiveIds) unionPrimIds.push(id);
      world.effects.push({
        kind: 'STRUCTURE_MERGE',
        tick: world.tick,
        originPos: { x: prim.pos.x, y: prim.pos.y },
        unionPrimIds,
        color: prim.placerColor,
      });
    }

    for (const id of candComp.primitiveIds) mergedComponents.add(id);
  }

  // S10 P4+P5 / S13 P4: emit one SCORE_TIER per crossed multiple of
  // SCORE_TIER_STEP, gated on cinematicsEnabled. Multi-tier crossings
  // (e.g. 14 → 31 via primary magic + multiple magic merges) fire one
  // event per band — in practice a Phase 1 place crosses at most 1 band
  // (max ~10 score delta).
  //
  // S13 P4: pos = new prim's position so the pulse co-locates with the
  // placement (was: fixed HUD corner). User attention is at the
  // placement cursor; corner anchor was peripheral.
  if (world.cinematicsEnabled) {
    const oldTier = Math.floor(oldScore / SCORE_TIER_STEP);
    const newTier = Math.floor(world.scoreProgress / SCORE_TIER_STEP);
    for (let t = oldTier + 1; t <= newTier; t++) {
      world.effects.push({
        kind: 'SCORE_TIER',
        tick: world.tick,
        tier: t,
        color: player.color,
        pos: { x: prim.pos.x, y: prim.pos.y },
      });
    }
  }

  // S10 P2+P5: STRUCTURE_GROW outward pulse from the newly-placed primitive,
  // gated on cinematicsEnabled. BFS at emit time over the post-merge
  // component so the wave reaches every primitive connected through any
  // bond, including the just-added merge bonds. Single-anchor placements
  // (no bonds) emit with just the origin in the hop map → renderer flashes
  // only the new prim, no cascade — natural minimum-event for "the
  // structure has one element."
  //
  // S13 P2: paired physical impulse. After the visual emit, push every
  // prim in the primary's pre-existing component (the structure being
  // grown) outward from the component's local centroid. Counteracted on
  // cand components by S10 P3's inward MERGE_IMPULSE above; on a
  // cross-structure merge, existing structure puffs OUT while absorbed
  // components snap IN. Skipped on anchor placements (no pre-existing
  // structure) and on single-prim primary structures (centroid coincides
  // with the only prim → dmag=0 → no direction → loop skips).
  //
  // Gated on cinematicsEnabled WITH the visual emit (unlike MERGE_IMPULSE
  // which is unconditional). Symmetric on/off: toggling C also disables
  // the puff so the user gets a single mental model for the toggle.
  if (world.cinematicsEnabled) {
    const hopMap = bfsHopMap(prim, world.primitives, world.bonds);
    world.effects.push({
      kind: 'STRUCTURE_GROW',
      tick: world.tick,
      originPrimId: prim.id,
      hopByPrimId: hopMap.hopByPrimId,
      hopByBondId: hopMap.hopByBondId,
      color: prim.placerColor,
      maxHop: hopMap.maxHop,
    });

    if (primaryPreExistingPrims.length > 0) {
      // Centroid of primary's full post-bond component (pre-existing prims
      // + new prim). Including the new prim in the centroid makes a
      // 2-prim structure (single anchor + new prim) produce a non-zero
      // outward direction for the anchor — otherwise centroid=anchor.pos
      // and the anchor gets no impulse.
      let cx = prim.pos.x;
      let cy = prim.pos.y;
      for (const id of primaryPreExistingPrims) {
        const p = world.primitives.get(id);
        if (p === undefined) continue;
        cx += p.pos.x;
        cy += p.pos.y;
      }
      const n = primaryPreExistingPrims.length + 1;
      cx /= n;
      cy /= n;

      for (const id of primaryPreExistingPrims) {
        const p = world.primitives.get(id);
        if (p === undefined) continue;
        const dx = p.pos.x - cx;
        const dy = p.pos.y - cy;
        const dmag = Math.hypot(dx, dy);
        if (dmag < 1) continue; // co-located with centroid → NaN-safe skip
        const inv = STRUCTURE_GROW_IMPULSE / dmag;
        // prevPos -= unit_outward × MAG → velocity = pos - prevPos =
        // +unit_outward × MAG → primitive accelerates AWAY from centroid.
        p.prevPos.x -= dx * inv;
        p.prevPos.y -= dy * inv;
      }
    }
  }

  // S18 P1 — audio: emit ONE BOND_FORMED per placement if any bonds formed.
  // Anchor placements (zero bonds) → no clave SFX. Multi-adjacent merges,
  // redundancy bonds, and primary bond all collapse to a single emit per
  // Council R1 Adoption-B / Gemini #4 (prevents N claves stacking).
  const bondsFormedCount = world.bonds.size - bondsAtStart;
  if (bondsFormedCount > 0) {
    world.effects.push({
      kind: 'BOND_FORMED',
      tick: world.tick,
      pos: { x: prim.pos.x, y: prim.pos.y },
      bondCount: bondsFormedCount,
    });
  }

  // Carry-1 reset.
  world.players.set(player.id, fsmDrop(player));

  // Build-action credit (§ XIV.13).
  tickBuildAction(world.players.get(player.id)!);

  return world;
}

export function makeBond(
  world: World,
  a: Primitive,
  b: Primitive,
  stiffnessTier: StiffnessTier,
): Bond {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  const restLength = Math.max(20, Math.hypot(dx, dy)); // floor avoids zero-length bond
  return {
    id: asBondId(world.nextBondId++),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength,
    stiffnessTier,
    createdTick: world.tick,
  };
}
