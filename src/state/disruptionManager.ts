/**
 * SPARK — disruption manager (S19 P2).
 *
 * Pure-helper extraction from world.ts SEVER_BOND case. Anti-bloat §XV
 * charter (world.ts was 359 LOC, ~28% over 280 target). Council R1
 * Standard-tier deliberated (Grok DISRUPTOR + Gemini AUDITOR); both
 * converged on the effect-ordering BLOCKER — SEVER_ERASE effects must
 * be emitted BEFORE topology mutation (they read live primitives) and
 * BOND_SEVERED must be emitted AFTER (it represents end-of-operation).
 *
 * Phase-2 §VIII.3 LOCKED semantics (§13.11) preserved bit-for-bit:
 *   - cause='player'  → 1v1 input gate + hostile auth + charge gate
 *   - cause='physics' → bypass all gates (constraint solver overstretch)
 *   - hostile         = EITHER endpoint placerColor ≠ actor.color
 *   - cycle (split.del.size === 0) → no charge consumed, bond still removed
 *   - self-sever (both endpoints share actor's placerColor) → free
 *
 * Helper boundary (post-Council):
 *   1. canSeverBond     — pure auth check (boolean)
 *   2. computeBaseCharge — derives 0 or 1, called AFTER split for cycle rule
 *   3. computeSeverEraseEffects — pre-mutation visual erase effects
 *   4. applySeverTopology — map mutations + snapPrevPosForUnbonded
 *
 * Charge decrement + BOND_SEVERED emission stay in world.ts orchestrator
 * (Gemini AUDITOR finding #2 + #3 — player-state mutation should not be
 * hidden inside a helper named for topology).
 */

import type { GameEffect } from '../game/effects.ts';
import { snapPrevPosForUnbonded } from '../game/invariants.ts';
import type { Primitive } from '../game/primitive.ts';
import { severSplit } from '../game/structure.ts';
import type { Bond } from '../physics/bonds.ts';
import type { World, GameAction } from './world.ts';

/** SeverBond-specific action narrowing. */
type SeverBondAction = Extract<GameAction, { type: 'SEVER_BOND' }>;

type SeverSplit = ReturnType<typeof severSplit>;

/**
 * Authorize a SEVER_BOND action. Pure. Inputs are pre-fetched by caller
 * (no map lookups inside) so caller can early-return on missing prims.
 *
 *   cause==='physics' → always allowed (physics-overstretch bypass)
 *   cause==='player'  → 1v1 input gate (currentPlayerId check) +
 *                       hostile-prereq charge check (silent-reject if <1)
 *
 * Returns `true` iff the action should proceed to mutation. Note: this
 * does NOT consume charges — that happens in the orchestrator after the
 * split is computed (cycle-no-consume rule).
 */
export function canSeverBond(
  world: World,
  action: SeverBondAction,
  primA: Primitive,
  primB: Primitive,
): boolean {
  if (action.cause === 'physics') return true;

  // 1v1 input gate (defense-in-depth — controls layer also guards).
  if (world.gameMode === '1v1' && action.playerId !== world.currentPlayerId) {
    return false;
  }

  const player = world.players.get(action.playerId);
  if (player === undefined) return false;

  const isHostile = primA.placerColor !== player.color || primB.placerColor !== player.color;
  if (isHostile && player.disruptionCharges < 1) return false;
  return true;
}

/**
 * Compute the base charge cost for a player-cause sever, BEFORE the
 * cycle-no-consume rule is applied. Called AFTER severSplit so cycle
 * adjustment can layer on top in the orchestrator.
 *
 * Returns:
 *   - 0 for cause='physics' (bypass)
 *   - 0 for cause='player' + self-sever (both endpoints share actor color)
 *   - 1 for cause='player' + hostile (caller will set to 0 if cycle)
 */
export function computeBaseCharge(
  world: World,
  action: SeverBondAction,
  primA: Primitive,
  primB: Primitive,
): number {
  if (action.cause !== 'player') return 0;
  const player = world.players.get(action.playerId);
  if (player === undefined) return 0;
  const isHostile = primA.placerColor !== player.color || primB.placerColor !== player.color;
  return isHostile ? 1 : 0;
}

/**
 * Build the SEVER_ERASE effects for each primitive about to be deleted.
 * MUST be called BEFORE applySeverTopology while primitives are still
 * live (the effect carries pos/color/radius read from each prim).
 *
 * Returns an array (not pushed directly) so the orchestrator controls
 * effect ordering — Gemini AUDITOR finding #1 BLOCKER.
 */
export function computeSeverEraseEffects(
  world: World,
  split: SeverSplit,
  tick: number,
): GameEffect[] {
  const effects: GameEffect[] = [];
  for (const primId of split.del) {
    const p = world.primitives.get(primId);
    if (p === undefined) continue;
    effects.push({
      kind: 'SEVER_ERASE',
      tick,
      pos: { x: p.pos.x, y: p.pos.y },
      color: p.placerColor,
      radius: p.radius,
    });
  }
  return effects;
}

/**
 * Apply the topological mutation of a sever: remove the severed bond
 * from both endpoints' bond sets, delete it from world.bonds, then
 * cascade-delete dependent bonds + primitives in `split.delBonds` /
 * `split.del`. Calls snapPrevPosForUnbonded unconditionally to refresh
 * verlet history for primitives whose bond count changed.
 *
 * Does NOT touch player.disruptionCharges and does NOT emit any effects —
 * orchestrator owns those (Gemini AUDITOR findings #2 + #3).
 */
export function applySeverTopology(world: World, bond: Bond, split: SeverSplit): void {
  world.primitives.get(bond.aId)?.bonds.delete(bond.id);
  world.primitives.get(bond.bId)?.bonds.delete(bond.id);
  world.bonds.delete(bond.id);

  for (const bondId of split.delBonds) {
    const lost = world.bonds.get(bondId);
    if (lost === undefined) continue;
    world.primitives.get(lost.aId)?.bonds.delete(bondId);
    world.primitives.get(lost.bId)?.bonds.delete(bondId);
    world.bonds.delete(bondId);
  }

  for (const primId of split.del) world.primitives.delete(primId);

  snapPrevPosForUnbonded(world.primitives);
}
