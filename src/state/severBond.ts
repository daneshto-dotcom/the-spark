/**
 * SPARK — SEVER_BOND reducer orchestrator (S61 P1 §XV de-hypertrophy).
 *
 * Extracted verbatim from the world.ts dispatch() SEVER_BOND case so the
 * switch is uniformly 1-line delegations (mirrors godlyActions.ts /
 * sparkLifecycle.ts / placeFromFree.ts). The four pure helpers stay in
 * disruptionManager.ts; this module is the ORCHESTRATOR the S19 Council
 * deliberately kept OUT of disruptionManager ("player-state mutation should
 * not be hidden inside a helper named for topology").
 *
 * Effect ordering is LOAD-BEARING (S19 Council R1 Grok#4 + Gemini#1 BLOCKER):
 *   SEVER_ERASE effects emit BEFORE topology mutation (they read live prims
 *   for pos/color/radius); BOND_SEVERED emits AFTER (end-of-operation marker
 *   for the audio drain). The body below preserves that order bit-for-bit.
 *
 * Imports World/GameAction TYPE-ONLY (erased at runtime — same shape as
 * disruptionManager.ts) so there is NO world.ts <-> severBond.ts runtime cycle.
 *
 * S61 P1 Council Option B — the original orchestrator's lone world.ts RUNTIME
 * symbol was requirePlayer(world, id) (which throws on a missing player).
 * Importing it would re-introduce a runtime cycle, so the charge-decrement
 * uses an inline guarded lookup instead. This is PROVABLY EQUIVALENT on every
 * reachable path: computeBaseCharge returns > 0 ONLY for cause==='player' AND
 * a player that world.players.get() resolves (it returns 0 otherwise), so
 * whenever chargeToConsume > 0 the player is guaranteed present and
 * requirePlayer would never have thrown. computeBaseCharge is the guarantor;
 * severBond.test.ts locks the charge-consume behavior so any future path that
 * breaks the guarantee fails loudly. (Council split: Grok pushed verbatim +
 * relocate requirePlayer; PRIME-AUDIT refuted the reachability concern —
 * world.effects is a plain GameEffect[] data array, NOT an emitter, so the
 * BOND_SEVERED push triggers no re-entrant dispatch, and the computeBaseCharge
 * call + the charge line are adjacent synchronous reads of the same Map+key.)
 */

import { severSplit } from '../game/structure.ts';
import {
  applySeverTopology,
  canSeverBond,
  computeBaseCharge,
  computeSeverEraseEffects,
} from './disruptionManager.ts';
import type { GameAction, World } from './world.ts';

/** SeverBond-specific action narrowing (same derivation as disruptionManager.ts). */
type SeverBondAction = Extract<GameAction, { type: 'SEVER_BOND' }>;

export function applySeverBond(world: World, action: SeverBondAction): World {
  // S17 §13.11 LOCKED; S19 P2 orchestrator over disruptionManager helpers.
  // Effect ordering (Council R1 Grok#4 + Gemini#1 BLOCKER): SEVER_ERASE
  // effects emit BEFORE topology mutation (need live prims for pos/color
  // /radius); BOND_SEVERED emits AFTER (end-of-operation marker for audio).
  const bond = world.bonds.get(action.bondId);
  if (bond === undefined) return world;

  const primA = world.primitives.get(bond.aId);
  const primB = world.primitives.get(bond.bId);
  if (primA === undefined || primB === undefined) return world;

  // Capture sever pos before any mutation (audio drain payload).
  const severPos = { x: primA.pos.x, y: primA.pos.y };

  if (!canSeverBond(world, action, primA, primB)) return world;

  const split = severSplit(bond, world.primitives, world.bonds);
  // S52 P2 (LOCKED §13.11 amended — user-authorized) — cycle-no-consume rule
  // REMOVED. Every hostile sever consumes 1 charge regardless of whether the
  // topology split deletes primitives or just removes the bond. Self-sever
  // (both endpoints share the actor's placerColor) still costs 0 via
  // computeBaseCharge — a separate zero-cost path for the actor's own structure.
  const chargeToConsume = computeBaseCharge(world, action, primA, primB);
  if (chargeToConsume > 0) {
    // S61 P1 — inline guarded lookup (was requirePlayer; see module header for
    // the equivalence proof). computeBaseCharge guarantees the actor exists
    // whenever chargeToConsume > 0, so this never silently skips on a real path.
    const actor = world.players.get(action.playerId);
    if (actor !== undefined) actor.disruptionCharges -= chargeToConsume;
  }

  for (const e of computeSeverEraseEffects(world, split, world.tick)) world.effects.push(e);
  applySeverTopology(world, bond, split);
  world.effects.push({
    kind: 'BOND_SEVERED',
    tick: world.tick,
    pos: severPos,
    cause: action.cause,
  });

  return world;
}
