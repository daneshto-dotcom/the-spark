/**
 * SPARK — S71 P1 bomb hazard reducers.
 *
 * Three host-authoritative actions:
 *   SPAWN_BOMB     (host-internal; emitted by the spawner cadence) — mint a bomb.
 *   TRIGGER_BOMB   (client→host INTENT; drives the v4→5 PROTOCOL_VERSION bump) — a
 *                  player grabbed the bomb: INSTANT detonation severing ~25% of THAT
 *                  player's OWN bonds, leaf-first + blast-capped.
 *   DISSIPATE_BOMB (host-internal; polled in main.ts) — TTL elapsed, remove quietly.
 *
 * FORK B (Council R1 SPLIT → R2/R3 CONVERGED) — bomb severance is a DETERMINISTIC,
 * all-topology, blast-capped LEAF-FIRST selection over the FROZEN pre-detonation
 * topology, executed through the SINGLE locked §VIII.4 SEVER_BOND path (no new
 * topology semantics). Grok's R1 critique (lowest-BondId is meaningless + cascade-
 * catastrophic) and Gemini's (no-leaf/loop + fraction-vs-cap undefined) are both
 * resolved by the pinned algorithm in applyTriggerBomb — see STEP comments.
 *
 * Determinism: selection (STEPS 1-3) is a PURE function of the frozen pre-state +
 * BondId (no RNG, no recomputation against post-cascade live counts). The bomb is
 * host-authoritative; clients receive the resulting state in the next NetSnapshot.
 */

import {
  BOMB_PRIM_CAP_FRACTION,
  BOMB_RADIUS,
  BOMB_SEVER_FRACTION,
  BOMB_TTL_TICKS,
} from '../constants.ts';
import { severSplit } from '../game/structure.ts';
import type { Bond } from '../physics/bonds.ts';
import { asBombId, type BombId, type BondId, type PlayerId, type Vec2 } from '../types.ts';
import { applySeverBond } from './severBond.ts';
import type { World } from './worldTypes.ts';

export interface SpawnBombAction {
  readonly type: 'SPAWN_BOMB';
  readonly pos: Vec2;
}
export interface TriggerBombAction {
  readonly type: 'TRIGGER_BOMB';
  readonly bombId: BombId;
  readonly playerId: PlayerId;
}
export interface DissipateBombAction {
  readonly type: 'DISSIPATE_BOMB';
  readonly bombId: BombId;
}

/** Host-only: mint a stationary bomb at the spawner-chosen position. */
export function applySpawnBomb(world: World, action: SpawnBombAction): World {
  const id = asBombId(world.nextBombId++);
  world.bombs.set(id, {
    id,
    pos: { x: action.pos.x, y: action.pos.y },
    radius: BOMB_RADIUS,
    spawnedAtTick: world.tick,
    dissipateAtTick: world.tick + BOMB_TTL_TICKS,
  });
  return world;
}

/** Host-only: an un-grabbed bomb's 15s TTL elapsed — remove it harmlessly (no damage). */
export function applyDissipateBomb(world: World, action: DissipateBombAction): World {
  world.bombs.delete(action.bombId);
  return world;
}

/**
 * A player grabbed the bomb → INSTANT detonation on the PICKER's OWN structure.
 *
 * Pinned deterministic, all-topology, blast-capped LEAF-FIRST severance:
 *   N = picker's bond count (frozen pre-state). N==0 → fizzle (explosion visual only).
 *   target = max(1, round(BOMB_SEVER_FRACTION·N)).
 *   primCap = ceil(BOMB_PRIM_CAP_FRACTION·P), P = picker's primitive count.
 *   STEP 1  cost(bond) = #prims §VIII.4 would delete if this bond ALONE were cut,
 *           computed on the FROZEN pre-state via the PURE severSplit (cycle bond = 0,
 *           leaf = 1, interior > 1). No mutation here.
 *   STEP 2  order by (cost ASC, BondId ASC) — total order, no unresolved ties.
 *   STEP 3  greedily fill the kill-set while (count < target) AND (cumCost+cost ≤ cap);
 *           ascending cost ⇒ once the next-cheapest breaches the cap, all later do too
 *           → stop. Empty kill-set (e.g. one long chain, every cut > cap) → fizzle.
 *   STEP 4  execute through the single locked §VIII.4 path; skip-if-missing for any
 *           bond an earlier cascade already removed.
 */
export function applyTriggerBomb(world: World, action: TriggerBombAction): World {
  const bomb = world.bombs.get(action.bombId);
  if (bomb === undefined) return world; // already gone (dissipated / lost same-tick grab race)

  // Explosion visual fires regardless of damage outcome (even on a 0-bond picker).
  world.effects.push({
    kind: 'BOMB_EXPLODE',
    tick: world.tick,
    pos: { x: bomb.pos.x, y: bomb.pos.y },
    radius: bomb.radius,
  });

  // Single-shot: remove the bomb up-front so a same-tick second grab no-ops.
  world.bombs.delete(action.bombId);

  const picker = world.players.get(action.playerId);
  if (picker === undefined) return world;
  const pickerColor = picker.color;

  // Enumerate the PICKER's own bonds on the frozen pre-state. §13.16 LOCKED:
  // both endpoints of a bond share one placerColor, so a single-endpoint check
  // identifies ownership unambiguously.
  const own: Array<{ bondId: BondId; bond: Bond }> = [];
  for (const [bondId, bond] of world.bonds) {
    const a = world.primitives.get(bond.aId);
    if (a !== undefined && a.placerColor === pickerColor) own.push({ bondId, bond });
  }
  const N = own.length;
  if (N === 0) return world; // explosion visual only — nothing to sever

  let P = 0;
  for (const prim of world.primitives.values()) {
    if (prim.placerColor === pickerColor) P++;
  }

  const target = Math.max(1, Math.round(BOMB_SEVER_FRACTION * N));
  const primCap = Math.ceil(BOMB_PRIM_CAP_FRACTION * P);

  // STEP 1 — per-bond §VIII.4 delete-cost on the FROZEN pre-state (severSplit is pure).
  const ranked = own.map(({ bondId, bond }) => ({
    bondId,
    cost: severSplit(bond, world.primitives, world.bonds).del.size,
  }));

  // STEP 2 — total order: cheapest blast first, BondId as the deterministic tiebreak.
  ranked.sort((x, y) => x.cost - y.cost || x.bondId - y.bondId);

  // STEP 3 — greedy fill under BOTH the target count AND the primitive blast cap.
  const killSet: BondId[] = [];
  let cumulativeCost = 0;
  for (const { bondId, cost } of ranked) {
    if (killSet.length >= target) break;
    if (cumulativeCost + cost > primCap) break; // ascending ⇒ all later also breach
    killSet.push(bondId);
    cumulativeCost += cost;
  }

  // STEP 4 — execute via the single locked severance path; skip any bond a prior
  // cascade already removed (cause='bomb' bypasses charge + auth like 'creature').
  for (const bondId of killSet) {
    if (!world.bonds.has(bondId)) continue;
    applySeverBond(world, { type: 'SEVER_BOND', bondId, playerId: action.playerId, cause: 'bomb' });
  }
  return world;
}
