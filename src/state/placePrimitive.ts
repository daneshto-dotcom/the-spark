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
  AUTO_BOND_RADIUS,
  MERGE_IMPULSE_MAGNITUDE,
  MERGE_REACH_RADIUS,
  MIN_BOND_LENGTH_FOR_IMPULSE,
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
import { asBondId, asPrimitiveId, type PlayerId, type PrimitiveId, type Vec2 } from '../types.ts';
import { isNetworked, requirePlayer, type World } from './world.ts';
import { isInsideEnemyTerritory } from './territory.ts';
import { detectComboDiscoveries } from './comboDiscovery.ts';
import { detectNonet, mintNonetSeed, startSudoku } from './sudokuEvent.ts';

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
  /**
   * S48 P2 (Sym C fix) — authoritative placement coord (cursor at LMB-up
   * or RMB-up). Optional for back-compat with pre-S48 callers + tests
   * that synthesize PlacePrimitiveAction with target-id-only payloads.
   *
   * Purpose: when the dispatch comes from a REMOTE joiner in 1v1 (host
   * is processing client INTENT), the joiner's `targetPrimitiveId` and
   * `mergeCandidateIds` were derived from the JOINER'S LOCAL primitives
   * map, which is snapshot-lagged by up to RTT/2. If the joiner placed
   * a primitive moments earlier and immediately placed a second, the
   * joiner's local map may not yet contain the first prim — target
   * picking returns null, host applies as anchor, no bond forms. After
   * several placements + snapshot RTT elapsed, joiner's view catches
   * up and bonds start forming. User-reported as "first 4 didn't
   * connect, 5th did."
   *
   * Fix: when remote-origin + placementPos provided, host RE-PICKS
   * targetPrimitiveId AND RE-DERIVES mergeCandidateIds against its
   * OWN authoritative world. Joiner's intent fields become hints, not
   * authority. Local-origin dispatches (solo / host's own actions)
   * skip the re-pick and use the action's fields as-is — pre-S48
   * behavior preserved byte-for-byte.
   */
  readonly placementPos?: Vec2;
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

  // S49 P1 (Sym F) — territorial hard block. Host-authoritative rejection
  // when the carried spark's position is inside any enemy player's territorial
  // radius. Carry is preserved (same pattern as spawner-zone rejection above).
  // controls.ts LMB-up path does an optimistic client-side pre-check that
  // mirrors this logic (snapshot-lagged); this is the authoritative backstop.
  if (isInsideEnemyTerritory(spark.pos, action.playerId, world)) {
    world.diagnostics.territoryBlockRejects++;
    return world;
  }

  // S42 — target-missing race check MUST happen BEFORE primitive creation +
  // spark deletion so the carry slot is preserved (player retains the spark
  // and can try again with a different target). Pre-S42 the check was
  // inside the bonding block and threw AFTER the primitive was created —
  // crashing the dispatch loop AND consuming the spark even on the throw
  // path. Council R1 Battle Ledger row 5 + R2 sharpened (shared-resource
  // race, not player-owned violation).
  // S46 P3 Sym D — effective target ID. Resolves action.targetPrimitiveId
  // through (a) existence check + (b) same-color filter. Cross-color targets
  // silently demote to anchor placement (drop the bond, keep the primitive).
  // controls.ts already filters at the selection layer; this is defense in
  // depth against misbehaving or old clients.
  //
  // S48 P2 (Sym C fix) — race-reject preserved for the legacy "target
  // missing" path so session15.test.ts's "P2 retains carry on race-reject"
  // contract holds. The Sym C remote-origin re-pick lives in a SEPARATE
  // branch below; it only fires when joiner explicitly sent
  // targetPrimitiveId=null (snapshot-lagged target picking) AND placementPos
  // is supplied. Never overrides a joiner-supplied id that the host happens
  // to no longer have — that's still a legitimate race the spark should
  // survive.
  let effectiveTargetId: PrimitiveId | null = action.targetPrimitiveId;
  if (effectiveTargetId !== null) {
    const target = world.primitives.get(effectiveTargetId);
    if (target === undefined) {
      world.diagnostics.raceRejects++;
      world.diagnostics.rejectReasons.placeTargetMissing++; // S48 P3 diagnostic
      return world; // S42 race-reject: preserve carry, no spark consumption
    }
    if (target.placerColor !== player.color) {
      effectiveTargetId = null; // demote to anchor — bond rejected, prim still places
    }
  }

  // S48 P2 (Sym C fix) — host-side authoritative target + merge-candidate
  // re-pick for REMOTE-origin intents with explicit null target. When the
  // joiner places primitive N+1 faster than snapshot RTT, the joiner's
  // local primitives map doesn't contain primitive N yet, so the joiner's
  // target picking returns null → joiner sends `targetPrimitiveId: null`
  // → pre-S48 host applies as anchor (no bond). User-visible as
  // "first 4 didn't connect, 5th did."
  //
  // Re-pick policy: ONLY activate when joiner explicitly sent null target
  // — never override a joiner-supplied id (preserves intentional anchor
  // placements AND the race-reject contract above). Search host's
  // authoritative world for the nearest same-color primitive within
  // AUTO_BOND_RADIUS of placementPos. Local-origin dispatches skip the
  // re-pick entirely → pre-S48 behavior byte-identical for solo + host's
  // own actions.
  const isRemoteOrigin =
    isNetworked(world) &&
    world.isHost &&
    action.playerId !== world.localPlayerId;
  let effectiveMergeCandidateIds: ReadonlyArray<PrimitiveId> | undefined =
    action.mergeCandidateIds;
  if (isRemoteOrigin && action.placementPos !== undefined) {
    if (effectiveTargetId === null && action.targetPrimitiveId === null) {
      effectiveTargetId = pickHostTargetPrimitive(
        world,
        action.placementPos,
        player.color,
      );
    }
    // Re-derive merge candidates from host's world so stale joiner lists
    // don't suppress merges that the host can see. Joiner's list is a hint;
    // host is authoritative.
    effectiveMergeCandidateIds = collectHostMergeCandidates(
      world,
      action.placementPos,
      player.color,
    );
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
  // S88 G3a — bond-id watermark so the placement-level discovery scan below sees
  // exactly the bonds minted by THIS placement (primary + redundancy + merge sweep).
  const firstNewBondId = world.nextBondId;

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

  if (effectiveTargetId !== null) {
    // S42 — target was verified to exist at the top of this function (before
    // primitive creation). `!` non-null assertion is safe here since the
    // race check already early-returned for the undefined case.
    const target = world.primitives.get(effectiveTargetId)!;
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
    // Track the primary target's entire component so the sweep skips it.
    // Also snapshot the pre-existing IDs (component minus new prim) for
    // the S13 P2 STRUCTURE_GROW outward impulse below.
    for (const id of componentOf(target, world.primitives, world.bonds).primitiveIds) {
      mergedComponents.add(id);
      if (id !== prim.id) primaryPreExistingPrims.push(id);
    }
  }
  // S76 P3 — placement no longer scores directly. The placed primitive (anchor) + any
  // magic bond it forms simply RAISE this player's standing complexity, which
  // state/scoring.ts:tickScoring converts into a per-tick income each host tick. So the
  // former anchor-scoring `else` branch is gone (the anchor primitive is already created
  // above regardless of whether a bond formed).

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
    effectiveTargetId !== null
    && action.extraBondTargetIds !== undefined
    && action.extraBondTargetIds.length > 0
  ) {
    const seenInThisPlace = new Set<PrimitiveId>([prim.id, effectiveTargetId]);
    for (const extraId of action.extraBondTargetIds) {
      // Defensive validation — order matters: self-id, primary-id,
      // duplicate, missing-from-world, not-in-primary-component.
      if (extraId === prim.id) {
        if (import.meta.env.DEV) {
          console.error(`[S14 P2.1] extraBondTargetIds contains self-id ${prim.id}`);
        }
        continue;
      }
      if (extraId === effectiveTargetId) {
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
  for (const candId of effectiveMergeCandidateIds ?? []) {
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

  // S76 P3 — SCORE_TIER tier-up pulses moved to state/scoring.ts:tickScoring (scoreProgress
  // now climbs via per-tick complexity-income, not at placement, so the tier-step crossing is
  // detected there and pulsed at the leader's avatar).

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
    // S88 G3a — host-authoritative in-match combo-discovery. One hook covers this
    // path + the PLACE_FROM_FREE delegate; only NEW magic combos stamp the toast.
    detectComboDiscoveries(world, firstNewBondId);
    // S93 — NONET trigger: a placement that closes a structure of EXACTLY 9 connected
    // Squares (and nothing else) summons the Sudoku trial — host-authoritative, once per
    // match. detectNonet seeds from the just-placed prim (it is always in the new component).
    if (world.isHost && !world.sudokuFiredThisMatch && world.sudoku === null) {
      const nonetOwner = detectNonet(world, prim.id);
      if (nonetOwner !== null) {
        startSudoku(world, nonetOwner, mintNonetSeed(world, prim.id));
      }
    }
  }

  // Carry-1 reset.
  world.players.set(player.id, fsmDrop(player));

  // Build-action credit (§ XIV.13).
  tickBuildAction(world.players.get(player.id)!);

  return world;
}

/**
 * S48 P2 (Sym C fix) — host-side authoritative target pick for remote-
 * origin PLACE_PRIMITIVE intents. Mirrors controls.ts pickPrimitiveInRange
 * but operates on host's authoritative world.primitives map (vs joiner's
 * snapshot-lagged local map).
 *
 * Filter: same-color only (matches Sym D color-segregation). Returns the
 * nearest matching primitive within AUTO_BOND_RADIUS of placementPos, or
 * null if none in range.
 *
 * Exported for vitest coverage of the snapshot-lag race scenarios.
 */
export function pickHostTargetPrimitive(
  world: World,
  placementPos: Vec2,
  playerColor: number,
): PrimitiveId | null {
  let best: Primitive | null = null;
  let bestDistSq = AUTO_BOND_RADIUS * AUTO_BOND_RADIUS;
  for (const p of world.primitives.values()) {
    if (p.placerColor !== playerColor) continue;
    const dx = p.pos.x - placementPos.x;
    const dy = p.pos.y - placementPos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      best = p;
      bestDistSq = d2;
    }
  }
  return best?.id ?? null;
}

/**
 * S48 P2 (Sym C fix) — host-side merge candidate sweep for remote-origin
 * intents. Mirrors controls.ts allPrimitivesInRange (MERGE_REACH_RADIUS,
 * same-color filter). Replaces joiner-supplied list to compensate for
 * snapshot lag in the joiner's local view.
 *
 * The downstream merge sweep in placePrimitive() already dedups by
 * connected component + picks the nearest cand per component, so an
 * over-inclusive set (vs joiner's possibly-empty one) is corrected by
 * that downstream logic — net behavior is "all reachable same-color
 * components get exactly one merge bond at the nearest hop."
 */
export function collectHostMergeCandidates(
  world: World,
  placementPos: Vec2,
  playerColor: number,
): ReadonlyArray<PrimitiveId> {
  const r2 = MERGE_REACH_RADIUS * MERGE_REACH_RADIUS;
  const ids: PrimitiveId[] = [];
  for (const p of world.primitives.values()) {
    if (p.placerColor !== playerColor) continue;
    const dx = p.pos.x - placementPos.x;
    const dy = p.pos.y - placementPos.y;
    if (dx * dx + dy * dy <= r2) ids.push(p.id);
  }
  return ids;
}

function makeBond(
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
