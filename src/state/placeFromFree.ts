/**
 * SPARK — PLACE_FROM_FREE atomic action handler (S52 P1).
 *
 * Replaces the legacy LMB-up dispatch sequence PICKUP_SPARK then PLACE_PRIMITIVE
 * (which were two separate intent envelopes routed over the wire). The legacy
 * sequence had a critical defect for the joiner (P2): if PLACE_PRIMITIVE was
 * rejected by ANY of placePrimitive.ts's silent-reject paths (spawner-zone,
 * target-missing race, territory hard block), the PRIOR PICKUP_SPARK had
 * already transitioned `player.kind='Carrying'` and `spark.state='Carried'` —
 * leaving the joiner stuck in Carrying with no DROP path. User-reported as
 * "player 2 has to click it and then its glued to spark, and to leave you
 * need to right click."
 *
 * PLACE_FROM_FREE collapses the two intents into one. Validation happens FIRST;
 * any reject returns world unchanged (spark stays Free, player stays Idle).
 * Only after all validators pass do we transition player→Carrying + spark→
 * Carried + delegate to the existing placePrimitive reducer for bond formation.
 *
 * Council R1 Battle Ledger (S52):
 *   C1 BLOCKER (Grok#8+Gemini#1 CONVERGENT) — PROTOCOL_VERSION bumped 2→3 in
 *      protocol.ts. Old peers fail HELLO same-deploy (S22 P3 precedent).
 *   C2 BLOCKER (Grok#1) — remote-origin intents IGNORE the joiner's
 *      targetPrimitiveId field (untrusted; could be stale or malicious) and
 *      always re-pick via host's pickHostTargetPrimitive against authoritative
 *      world state. Local-origin trusts the action fields (S48 P2 path).
 *   C3 BLOCKER (Grok#2) — validation-then-commit ordering. By the time
 *      placePrimitive runs, every precondition it checks has already been
 *      verified, so it cannot reject. Defensive: if a future check is added
 *      to placePrimitive without mirroring here, the stuck-Carrying bug
 *      regresses. Documented as a contract obligation; tests in
 *      placeFromFree.test.ts assert atomic-reject semantics for every known
 *      reject path.
 *   C4 HIGH (Gemini#2) — dragLock interpolation skip handled in controls.ts +
 *      sync.ts (separate file changes); this reducer is host-side authority.
 *   C5 HIGH (Gemini#3) — granular rejectReasons buckets preserved. Each
 *      reject branch increments the SAME counter the legacy 2-action path
 *      would have hit (pickupPosShape / pickupSparkNotFree / pickupReachFail
 *      / placeTargetMissing / territoryBlockRejects) so the debugOverlay's
 *      per-bucket diagnosis still works.
 *   C6 MED (Gemini#5) — reuse over duplication. Delegates to the existing
 *      placePrimitive function instead of duplicating ~350 LOC of bond
 *      formation logic. ConnectDrag RMB path (which still dispatches a
 *      classic PLACE_PRIMITIVE) is unaffected — byte-identical behavior
 *      for the legacy carry-then-place flow.
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH, REASONABLE_PICKUP_REACH, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS, type StiffnessTier } from '../constants.ts';
import { pickup as fsmPickup } from '../game/player.ts';
import {
  collectHostMergeCandidates,
  pickHostTargetPrimitive,
  placePrimitive,
} from './placePrimitive.ts';
import { isInsideEnemyTerritory } from './territory.ts';
import { requirePlayer, type World } from './world.ts';
import type { PlayerId, PrimitiveId, SparkId, Vec2 } from '../types.ts';

/**
 * Action shape — exported so world.ts can compose GameAction.
 *
 * Field semantics:
 *   sparkId            free spark being committed to a primitive
 *   playerId           dispatching player (host or joiner)
 *   placementPos       authoritative cursor at LMB-up (source of truth for
 *                      target picking + spawner/territory checks)
 *   stiffnessTier      pre-computed from carried spark.type + target.type
 *                      via lookupCombo in controls.ts (joiner trusts the
 *                      combo table; host re-derives if remote-origin)
 *   targetPrimitiveId  joiner's local pick (ADVISORY only for remote-origin
 *                      — host re-picks via pickHostTargetPrimitive per
 *                      Council C2)
 *   mergeCandidateIds  joiner's local sweep (same advisory semantics)
 *   extraBondTargetIds redundancy bond targets in same component (S14 P2.1).
 *                      Local-origin trusted; remote-origin re-derived (not
 *                      yet implemented — defer to S53; the redundancy bonds
 *                      are an optimization not a correctness issue, and
 *                      placePrimitive's DEV-mode validation drops malformed
 *                      entries silently).
 */
export interface PlaceFromFreeAction {
  readonly type: 'PLACE_FROM_FREE';
  readonly sparkId: SparkId;
  readonly playerId: PlayerId;
  readonly placementPos: Vec2;
  readonly stiffnessTier: StiffnessTier;
  readonly targetPrimitiveId: PrimitiveId | null;
  readonly mergeCandidateIds?: ReadonlyArray<PrimitiveId>;
  readonly extraBondTargetIds?: ReadonlyArray<PrimitiveId>;
}

/**
 * S52 P1 — atomic reducer. Returns world unchanged on any validation failure;
 * the spark stays Free, the player stays Idle. Only when ALL preconditions
 * are met do we transition player→Carrying + spark→Carried and delegate to
 * placePrimitive for bond formation.
 */
export function applyPlaceFromFree(world: World, action: PlaceFromFreeAction): World {
  // 1 — placementPos shape (Council C5 — same diagnostic bucket as PICKUP_SPARK
  //     pos-shape failure). Wire-level corruption / TS-bypass defense.
  if (!isPosShape(action.placementPos)) {
    world.diagnostics.raceRejects++;
    world.diagnostics.rejectReasons.pickupPosShape++;
    return world;
  }

  // 2 — spark must exist + still be Free (real-time race: opponent grabbed it
  //     between joiner's local click + intent arrival).
  const spark = world.freeSparks.get(action.sparkId);
  if (spark === undefined || spark.state.kind !== 'Free') {
    world.diagnostics.raceRejects++;
    world.diagnostics.rejectReasons.pickupSparkNotFree++;
    return world;
  }

  // 3 — player must exist + be Idle. If they're already Carrying (e.g. they
  //     used the RMB ConnectDrag path concurrently OR a duplicate intent
  //     somehow leaked through), reject silently — the existing carry will
  //     resolve via its own PLACE_PRIMITIVE.
  const player = requirePlayer(world, action.playerId);
  if (player.kind !== 'Idle') {
    world.diagnostics.raceRejects++;
    return world;
  }

  // 4 — remote-origin reach + canvas-bounds plausibility check on
  //     placementPos. Local-origin (solo + host's own actions) skip this
  //     because action.placementPos == cursor == validated by S39 P2
  //     letterbox-aware cssToCanvasCoords already.
  const isRemoteCarrier =
    world.gameMode === '1v1' && action.playerId !== world.localPlayerId;
  if (isRemoteCarrier && !isValidPlacementPos(action.placementPos, player.avatarPos)) {
    world.diagnostics.raceRejects++;
    world.diagnostics.rejectReasons.pickupReachFail++;
    return world;
  }

  // 5 — spawner-zone hard block (§ IX.5). Spark stays Free; the legacy
  //     2-action path called this on spark.pos but spark.pos was snapped to
  //     action.pos (== placementPos) in applyPickupSpark, so the check is
  //     byte-equivalent.
  const dx = action.placementPos.x - SPAWNER_CENTER_X;
  const dy = action.placementPos.y - SPAWNER_CENTER_Y;
  if (dx * dx + dy * dy < SPAWNER_RADIUS * SPAWNER_RADIUS) {
    return world;
  }

  // 6 — enemy-territory hard block (Sym F, S49 P1). Same diagnostic bucket
  //     as the legacy placePrimitive territory reject.
  if (isInsideEnemyTerritory(action.placementPos, action.playerId, world)) {
    world.diagnostics.territoryBlockRejects++;
    return world;
  }

  // 7 — Council C2: resolve target. For remote-origin we IGNORE the joiner's
  //     targetPrimitiveId entirely (untrusted hint, snapshot-lagged or
  //     potentially adversarial) and host re-picks against authoritative
  //     world. Local-origin trusts the action fields (S48 P2 path, byte-
  //     identical to PLACE_PRIMITIVE's existing logic).
  const isRemoteOrigin =
    world.gameMode === '1v1' && world.isHost && action.playerId !== world.localPlayerId;
  let effectiveTargetId: PrimitiveId | null;
  let effectiveMergeIds: ReadonlyArray<PrimitiveId> | undefined;
  if (isRemoteOrigin) {
    effectiveTargetId = pickHostTargetPrimitive(world, action.placementPos, player.color);
    effectiveMergeIds = collectHostMergeCandidates(world, action.placementPos, player.color);
  } else {
    effectiveTargetId = action.targetPrimitiveId;
    effectiveMergeIds = action.mergeCandidateIds;
    if (effectiveTargetId !== null) {
      const target = world.primitives.get(effectiveTargetId);
      if (target === undefined) {
        world.diagnostics.raceRejects++;
        world.diagnostics.rejectReasons.placeTargetMissing++;
        return world;
      }
      if (target.placerColor !== player.color) {
        effectiveTargetId = null; // same-color demotion to anchor (S46 P3)
      }
    }
  }

  // ===== ATOMIC COMMIT — all validation passed; placePrimitive's defensive
  //       checks below are now guaranteed to pass. Council C3 contract.
  //
  // Defensive ordering (S52 CHECK Triumvirate Grok #1 + Gemini #1 CONVERGENT
  // BLOCKER) — fallible operations FIRST, infallible mutations LAST so that
  // an unexpected throw from fsmPickup or placePrimitive cannot leak partial
  // spark.pos mutation. In practice fsmPickup CAN throw CarryViolation when
  // player.kind === 'Carrying'; we pre-validated player.kind === 'Idle' at
  // line ~78 so this throw is unreachable in JS's single-threaded reducer
  // model. placePrimitive's three defensive throw conditions (player missing,
  // player not Carrying, spark undefined) are likewise unreachable post pre-
  // validation. Documented theoretical invariant: any future refactor adding
  // async/await OR concurrent reducer execution MUST add a try/catch rollback
  // here. PDR carry-forward to S53.
  //
  // Step A: fsmPickup (fallible IF player Carrying — unreachable).
  const carrying = fsmPickup(player, action.sparkId);

  // Step B: spark.pos snap (legacy PICKUP_SPARK behavior, S46 P2 mandatory
  //         pos). Verlet history reset to kill drag momentum. Infallible.
  spark.pos.x = action.placementPos.x;
  spark.pos.y = action.placementPos.y;
  spark.prevPos.x = action.placementPos.x;
  spark.prevPos.y = action.placementPos.y;

  // Step C: world.players.set + spark.state assignment. Infallible Map ops.
  world.players.set(carrying.id, carrying);
  spark.state = { kind: 'Carried', carrierId: action.playerId };

  // Step D: delegate to placePrimitive. Because we've already validated all
  //         of its preconditions (Carrying player, Free→Carried spark in
  //         freeSparks, placementPos NOT in spawner-zone, placementPos NOT
  //         in enemy territory, effectiveTargetId exists-or-null), every
  //         placePrimitive reject branch is unreachable. We pass the host-
  //         resolved targetPrimitiveId + mergeCandidateIds so the inner
  //         re-pick logic at placePrimitive.ts:188-204 short-circuits.
  return placePrimitive(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: action.playerId,
    targetPrimitiveId: effectiveTargetId,
    stiffnessTier: action.stiffnessTier,
    mergeCandidateIds: effectiveMergeIds,
    extraBondTargetIds: action.extraBondTargetIds,
    placementPos: action.placementPos,
  });
}

/**
 * Council Δ5 — canvas-bounds + reach plausibility for remote-origin claims.
 * Mirrors sparkLifecycle.isValidPickupPos byte-for-byte (REASONABLE_PICKUP_REACH
 * = 250 px from avatarPos). Local-origin skips this check because action.pos
 * is the player's own validated cursor.
 */
function isValidPlacementPos(pos: Vec2, avatarPos: Vec2): boolean {
  if (pos.x < 0 || pos.x > CANVAS_WIDTH) return false;
  if (pos.y < 0 || pos.y > CANVAS_HEIGHT) return false;
  const dx = pos.x - avatarPos.x;
  const dy = pos.y - avatarPos.y;
  return dx * dx + dy * dy <= REASONABLE_PICKUP_REACH * REASONABLE_PICKUP_REACH;
}

/**
 * Council Δ5 / Δ6 wire-shape defense. Pre-S52 peers don't emit PLACE_FROM_FREE
 * at all (rejected at parseNetMessage). This check guards against TypeScript-
 * bypass via JSON.parse on a wire payload that names the action but mangles
 * the pos field. Same idiom as sparkLifecycle.isPosShape.
 */
function isPosShape(pos: unknown): pos is Vec2 {
  if (typeof pos !== 'object' || pos === null) return false;
  const p = pos as { x?: unknown; y?: unknown };
  return typeof p.x === 'number' && Number.isFinite(p.x)
    && typeof p.y === 'number' && Number.isFinite(p.y);
}
