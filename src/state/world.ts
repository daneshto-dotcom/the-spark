/**
 * SPARK — world state + dispatch seam.
 * § 10.2 LOCKED: every world mutation routes through `dispatch(world, action)`.
 * Phase 1 calls it locally; Phase 3 swaps in `await dispatchOverNetwork(action)`
 * with the same call sites. Actions are JSON-serialisable (IDs only, no refs).
 *
 * State is mutated in place — `dispatch` returns the same world object for
 * call-site ergonomics. The seam is the function-call boundary, not
 * structural immutability.
 */

import { lookupCombo } from '../combos.ts';
import {
  ENERGY_PER_SECOND_FLAT,
  MERGE_IMPULSE_MAGNITUDE,
  MIN_BOND_LENGTH_FOR_IMPULSE,
  SCORE_ANCHOR,
  SCORE_FUNCTIONAL_BOND,
  SCORE_MAGIC_BOND,
  SCORE_TIER_STEP,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  type StiffnessTier,
} from '../constants.ts';
import { type GameEffect } from '../game/effects.ts';
import { snapPrevPosForUnbonded } from '../game/invariants.ts';
import { makePrimitiveFromSpark, type Primitive } from '../game/primitive.ts';
import { bfsHopMap, componentOf, severSplit, type Structure } from '../game/structure.ts';
import {
  CarryViolation,
  drop as fsmDrop,
  makeIdlePlayer,
  pickup as fsmPickup,
  tickBuildAction,
  tickEnergy,
  type Player,
} from '../game/player.ts';
import type { Spark } from '../game/spark.ts';
import type { Bond } from '../physics/bonds.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  type BondId,
  type PlayerId,
  type PrimitiveId,
  type SparkId,
  type Vec2,
} from '../types.ts';

export type GameState = 'PLAYING' | 'WIN' | 'POSTGAME';

export interface World {
  tick: number;
  rngSeed: number;
  freeSparks: Map<SparkId, Spark>;
  primitives: Map<PrimitiveId, Primitive>;
  bonds: Map<BondId, Bond>;
  players: Map<PlayerId, Player>;
  /** Soft cache of primitives ordered by id for determinism. */
  gameState: GameState;
  /** Monotonic counter for primitive IDs. */
  nextPrimitiveId: number;
  /** Monotonic counter for bond IDs. */
  nextBondId: number;
  /** Telemetry / debug — not persisted. */
  lastWinnerId: PlayerId | null;
  /**
   * Visual effect queue — the renderer drains this each frame. NOT
   * persisted by save.ts (the snapshot's serializer enumerates fields
   * explicitly). Bounded by lifetime via the renderer's age check, so
   * worst-case it grows for one POSTGAME pause then drains.
   */
  effects: GameEffect[];
  /**
   * S9 P3: combo-weighted progress toward WIN. Anchors and functional bonds
   * add SCORE_ANCHOR / SCORE_FUNCTIONAL_BOND (=1 each); the 12 magic combos
   * add SCORE_MAGIC_BOND (=3). gameState.ts compares against
   * PHASE_1_WIN_SCORE; ui.ts draws the progress bar as scoreProgress /
   * PHASE_1_WIN_SCORE. Replaces the flat primitives.size / 30 placeholder
   * that made every combination weigh the same. Persisted via save.ts so
   * mid-game saves don't reset progress.
   */
  scoreProgress: number;
  /**
   * S10 P5: debug toggle for the structure cinematics — STRUCTURE_GROW,
   * STRUCTURE_MERGE, SCORE_TIER. BOND_COMMIT and SEVER_ERASE remain
   * unconditional (bond-level visuals are not "structure cinematics" and
   * the user wants them as core combat feedback). Default true; flipped
   * by main.ts's `C` keybind. NOT persisted in save.ts — debug-only,
   * defaults true on each fresh load.
   */
  cinematicsEnabled: boolean;
}

export type GameAction =
  | { readonly type: 'SPAWN_SPARK'; readonly spark: Spark }
  | { readonly type: 'DESPAWN_SPARK'; readonly sparkId: SparkId }
  | { readonly type: 'PICKUP_SPARK'; readonly sparkId: SparkId; readonly playerId: PlayerId }
  | { readonly type: 'DROP_SPARK'; readonly playerId: PlayerId; readonly pos: Vec2 }
  | {
      readonly type: 'PLACE_PRIMITIVE';
      readonly playerId: PlayerId;
      readonly targetPrimitiveId: PrimitiveId | null;
      readonly stiffnessTier: StiffnessTier;
      /**
       * S9 P2: nearby primitives the placement should also auto-bond to,
       * one bond per *other* connected component (the primary target's
       * component is already merged via targetPrimitiveId). Caller passes
       * all primitives within AUTO_BOND_RADIUS of spark.pos; placePrimitive
       * dedups by component so each surrounding structure gets exactly one
       * merge bond. Closes the post-S8 playtest report that distinct
       * structures never interconnected.
       */
      readonly mergeCandidateIds?: ReadonlyArray<PrimitiveId>;
    }
  | { readonly type: 'SEVER_BOND'; readonly bondId: BondId }
  | { readonly type: 'TICK_ENERGY'; readonly playerId: PlayerId; readonly deltaSec: number }
  | { readonly type: 'WIN_TRIGGER'; readonly winnerId: PlayerId };

export function makeWorld(rngSeed: number): World {
  const w: World = {
    tick: 0,
    rngSeed,
    freeSparks: new Map(),
    primitives: new Map(),
    bonds: new Map(),
    players: new Map(),
    gameState: 'PLAYING',
    nextPrimitiveId: 0,
    nextBondId: 0,
    lastWinnerId: null,
    effects: [],
    scoreProgress: 0,
    cinematicsEnabled: true,
  };
  // Phase 1: solo player, P1 only.
  const p1 = makeIdlePlayer(asPlayerId(0), 0xff3b6b);
  w.players.set(p1.id, p1);
  return w;
}

export function dispatch(world: World, action: GameAction): World {
  switch (action.type) {
    case 'SPAWN_SPARK':
      world.freeSparks.set(action.spark.id, action.spark);
      return world;

    case 'DESPAWN_SPARK': {
      // Soft-cap enforcement only — never despawns Carried sparks (the
      // player FSM owns those). Silent no-op if the id is gone.
      const s = world.freeSparks.get(action.sparkId);
      if (s === undefined) return world;
      if (s.state.kind !== 'Free') return world;
      world.freeSparks.delete(action.sparkId);
      return world;
    }

    case 'PICKUP_SPARK': {
      const player = requirePlayer(world, action.playerId);
      const spark = world.freeSparks.get(action.sparkId);
      if (spark === undefined) throw new Error(`spark ${action.sparkId} not free`);
      if (spark.state.kind !== 'Free') throw new Error(`spark ${action.sparkId} not Free`);
      const next = fsmPickup(player, action.sparkId);
      world.players.set(next.id, next);
      spark.state = { kind: 'Carried', carrierId: action.playerId };
      // While carried, freeze velocity so cursor placement is stable.
      spark.prevPos.x = spark.pos.x;
      spark.prevPos.y = spark.pos.y;
      return world;
    }

    case 'DROP_SPARK': {
      const player = requirePlayer(world, action.playerId);
      if (player.kind !== 'Carrying') throw new CarryViolation('not carrying');
      const spark = world.freeSparks.get(player.carriedSparkId);
      if (spark === undefined) throw new Error(`carried spark missing`);
      spark.state = { kind: 'Free' };
      spark.pos.x = action.pos.x;
      spark.pos.y = action.pos.y;
      // Reset velocity to zero on drop (player chose this spot).
      spark.prevPos.x = action.pos.x;
      spark.prevPos.y = action.pos.y;
      world.players.set(player.id, fsmDrop(player));
      return world;
    }

    case 'PLACE_PRIMITIVE':
      return placePrimitive(world, action);

    case 'SEVER_BOND': {
      const bond = world.bonds.get(action.bondId);
      if (bond === undefined) return world;
      const split = severSplit(bond, world.primitives, world.bonds);
      // Snapshot the loser side BEFORE deletion so the effects layer can
      // play the sever-erase fade with real positions/colors.
      for (const primId of split.del) {
        const p = world.primitives.get(primId);
        if (p === undefined) continue;
        world.effects.push({
          kind: 'SEVER_ERASE',
          tick: world.tick,
          pos: { x: p.pos.x, y: p.pos.y },
          color: p.placerColor,
          radius: p.radius,
        });
      }
      // Drop the cut bond + its adjacency on both sides.
      const a = world.primitives.get(bond.aId);
      const b = world.primitives.get(bond.bId);
      a?.bonds.delete(bond.id);
      b?.bonds.delete(bond.id);
      world.bonds.delete(bond.id);
      // Erase the loser side's primitives + bonds entirely.
      for (const bondId of split.delBonds) {
        const lost = world.bonds.get(bondId);
        if (lost === undefined) continue;
        world.primitives.get(lost.aId)?.bonds.delete(bondId);
        world.primitives.get(lost.bId)?.bonds.delete(bondId);
        world.bonds.delete(bondId);
      }
      for (const primId of split.del) world.primitives.delete(primId);
      // Surviving primitives that just lost their last bond need prevPos
      // resynced or the immobility guard will (correctly) flag residual
      // solver drift on the next tick.
      snapPrevPosForUnbonded(world.primitives);
      return world;
    }

    case 'TICK_ENERGY': {
      const player = requirePlayer(world, action.playerId);
      tickEnergy(player, action.deltaSec, ENERGY_PER_SECOND_FLAT);
      return world;
    }

    case 'WIN_TRIGGER':
      world.gameState = 'WIN';
      world.lastWinnerId = action.winnerId;
      return world;
  }
}

function requirePlayer(world: World, id: PlayerId): Player {
  const p = world.players.get(id);
  if (p === undefined) throw new Error(`player ${id} missing`);
  return p;
}

/**
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
function placePrimitive(
  world: World,
  action: Extract<GameAction, { type: 'PLACE_PRIMITIVE' }>,
): World {
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

  // Track which components are already bonded to this new primitive so the
  // P2 sweep below doesn't double-bond into a component the primary target
  // already pulled in.
  const mergedComponents = new Set<PrimitiveId>();

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
    world.scoreProgress += combo.isMagical ? SCORE_MAGIC_BOND : SCORE_FUNCTIONAL_BOND;
    // Track the primary target's entire component so the sweep skips it.
    for (const id of componentOf(target, world.primitives, world.bonds).primitiveIds) {
      mergedComponents.add(id);
    }
  } else {
    // S9 P3: anchor placement (no bond) earns one progress point.
    world.scoreProgress += SCORE_ANCHOR;
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
    world.scoreProgress += combo.isMagical ? SCORE_MAGIC_BOND : SCORE_FUNCTIONAL_BOND;

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

  // S10 P4+P5: emit one SCORE_TIER per crossed multiple of SCORE_TIER_STEP,
  // gated on cinematicsEnabled. Multi-tier crossings (e.g. 14 → 31 via
  // primary magic + multiple magic merges) fire one event per band — in
  // practice a Phase 1 place crosses at most 1 band (max ~10 score delta).
  if (world.cinematicsEnabled) {
    const oldTier = Math.floor(oldScore / SCORE_TIER_STEP);
    const newTier = Math.floor(world.scoreProgress / SCORE_TIER_STEP);
    for (let t = oldTier + 1; t <= newTier; t++) {
      world.effects.push({
        kind: 'SCORE_TIER',
        tick: world.tick,
        tier: t,
        color: player.color,
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
  }

  // Carry-1 reset.
  world.players.set(player.id, fsmDrop(player));

  // Build-action credit (§ XIV.13).
  tickBuildAction(world.players.get(player.id)!);

  return world;
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
