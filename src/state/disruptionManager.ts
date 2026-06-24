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
 *   - cause='creature' → bypass all gates (S27 P0, autonomous creature actor;
 *                        host-authoritative spawn upstream gates the mint;
 *                        creature doesn't pay disruption charge — semantically
 *                        equivalent to 'physics' from this helper's perspective)
 *   - hostile         = EITHER endpoint placerColor ≠ actor.color
 *   - cycle exception REMOVED (S52 P2 amendment, user-authorized): every
 *                       hostile sever costs 1 charge regardless of split.del
 *                       size. Pre-S52 PRIME-AUDIT B granted cycle severs
 *                       a 0-cost path; user ask "each raid point = break 1
 *                       connection" inverts that exception to a uniform rule.
 *                       See LOCKED §13.11 amended block + world.ts:386-396.
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

import { isDefensiveCombo } from '../combos.ts';
import { DEFENSIVE_SEVER_CHARGE_COST } from '../constants.ts';
import type { GameEffect } from '../game/effects.ts';
import { snapPrevPosForUnbonded } from '../game/invariants.ts';
import type { Primitive } from '../game/primitive.ts';
import { severSplit } from '../game/structure.ts';
import type { Bond } from '../physics/bonds.ts';
import { reconcileFouledPrimitives } from './seagulls/seagullLifecycle.ts';
import type { World, GameAction } from './world.ts';

/** SeverBond-specific action narrowing. */
type SeverBondAction = Extract<GameAction, { type: 'SEVER_BOND' }>;

type SeverSplit = ReturnType<typeof severSplit>;

/**
 * Authorize a SEVER_BOND action. Pure. Inputs are pre-fetched by caller
 * (no map lookups inside) so caller can early-return on missing prims.
 *
 *   cause==='physics'  → always allowed (physics-overstretch bypass)
 *   cause==='creature' → always allowed (host-authoritative creature mint)
 *   cause==='player'   → player-existence + hostile-prereq charge check
 *                        (silent-reject if charges<1)
 *
 * Returns `true` iff the action should proceed to mutation. Note: this
 * does NOT consume charges — that happens in the orchestrator after the
 * split is computed (cycle-no-consume rule).
 *
 * S42 — turn-based 1v1 active-player gate REMOVED (Council R1+R2). The
 * blueprint mandates real-time simultaneous play; either player can sever
 * any bond they have charges for at any time.
 */
export function canSeverBond(
  world: World,
  action: SeverBondAction,
  primA: Primitive,
  primB: Primitive,
): boolean {
  // S27 P0 — PRIME-AUDIT Δ1: 'creature' bypass folded into 'physics' branch.
  // Both bypass all gates (host-authoritative spawn upstream gates the mint
  // for 'creature'; constraint solver fires for 'physics'). computeBaseCharge
  // at line 90 already returns 0 for non-'player' so no change needed there.
  // S102 #2 — 'chewer' bypasses too (a pencil chewer's bite is host-authoritative,
  // exactly like 'creature' — it pays no disruption charge and skips the hostile-auth gate).
  if (
    action.cause === 'physics' ||
    action.cause === 'creature' ||
    action.cause === 'bomb' ||
    action.cause === 'chewer'
  ) return true;

  const player = world.players.get(action.playerId);
  if (player === undefined) return false;

  // S90 P2 — gate on the REQUIRED charge for THIS bond (1 for a normal hostile sever,
  // DEFENSIVE_SEVER_CHARGE_COST for a hostile Diamond/Lattice, 0 for a self-sever). Derived from
  // computeBaseCharge so the entry gate and the decrement in severBond.ts can NEVER disagree
  // (PRIME-AUDIT A4) — an opponent short of the full premium is silent-rejected (§VIII.2) and so
  // can't even START breaking a defensive bond. Self-sever returns 0 → always allowed (unchanged).
  if (player.disruptionCharges < computeBaseCharge(world, action, primA, primB)) return false;
  return true;
}

/**
 * Compute the base charge cost for a player-cause sever.
 *
 * S52 P2 (LOCKED §13.11 amended, user-authorized) — cycle-no-consume rule
 * REMOVED in the orchestrator (world.ts:386-396). This helper's return is
 * now the FINAL chargeToConsume value; caller no longer overrides on cycle.
 *
 * Returns:
 *   - 0 for cause='physics' (bypass)
 *   - 0 for cause='creature' (bypass — host-authoritative spawn upstream)
 *   - 0 for cause='player' + self-sever (both endpoints share actor color)
 *   - 1 for cause='player' + hostile (EVERY hostile sever costs 1 charge
 *     post-S52, including cycle severs that don't delete any primitives)
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
  if (!isHostile) return 0;
  // S90 P2 (G1b DEFENSE) — a hostile Diamond (Tri→Tri) / Lattice (Sq→Sq) sever costs the full
  // DEFENSIVE_SEVER_CHARGE_COST; every other hostile sever still costs 1. Order-symmetric (the
  // two combos are self-paired). Only the cause==='player' path reaches here — physics/creature/
  // bomb returned 0 above, so a hazard still severs a Diamond for free (anti-sabotage, not
  // hazard-immunity — PRIME-AUDIT A1: no indestructible structures).
  return isDefensiveCombo(primA.type, primB.type) ? DEFENSIVE_SEVER_CHARGE_COST : 1;
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

  // S79 P3 (HIGH-1) — a sever (player / physics / creature / bomb all route here) can delete
  // fouled prims AND split a fouled component off its splat-anchor. Re-derive the foul set
  // from the live splats so no stale id leaks and no splat-less fragment stays income-0
  // un-cleanable. Early-outs when nothing is fouled.
  reconcileFouledPrimitives(world);
}
