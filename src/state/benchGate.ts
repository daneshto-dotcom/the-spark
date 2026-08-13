/**
 * SPARK — S86 P3: central BENCH gate policy (Council CONCEDED→GROK).
 *
 * A benched player (eaten by the Pac-Man hunter — `benchedUntilTick`, or the
 * potato-carrier bench) is "out of the game" for its duration: avatar hidden,
 * input locked. Pre-S86 that lock lived ONLY in the input layer
 * (controls.isInputLocked → onDown/onUp), which left two real holes the
 * round-6 playtest hit:
 *   1. an in-flight AttractDrag survived the catch (the catch force-drops the
 *      carried spark → Free → the gesture kept hauling it at full cursor
 *      speed), and
 *   2. NO reducer ever checked benchedUntilTick, so the host applied benched
 *      remote intents verbatim ("when the pacman eats me i can still pick up
 *      primitives").
 *
 * This module is the single source of truth for WHICH player intents a
 * benched actor may perform. `dispatch()` consults it at entry — one choke
 * point, so a future verb cannot ship ungated (Grok S86 R1: per-verb
 * enumeration drifts; HIGH). The policy Record must mirror
 * `CLIENT_INTENT_TYPES` (protocol.ts) exactly — benchGate.test.ts asserts set
 * equality in both directions, so adding a new client intent FORCES an
 * explicit allow/deny decision here.
 *
 * Policy rationale:
 *   - 'deny'  → acquisitive/structural/offensive verbs: a benched player must
 *     not collect, build, or disrupt.
 *   - 'allow' → UPDATE_AVATAR_POS (pure pointer telemetry — keeps the chase
 *     target fresh for un-bench; avatar is hidden anyway) and the two DROP
 *     verbs (release-only: blocking a drop could strand a Carrying state; a
 *     drop never gains the actor anything).
 *
 * Pure fn of synced fields (benchedUntilTick rides the NetSnapshot,
 * world.tick is the shared clock) — a joiner's optimistic dispatch and the
 * host's authoritative dispatch reject identically by construction.
 *
 * Host-internal mechanics (HUNTER_CATCH's own applyDropSpark call, *_TICK,
 * SPAWN_*) either bypass dispatch() or are not client intents — unaffected.
 */

import type { GameAction } from './world.ts';

type BenchPolicy = 'allow' | 'deny';

/**
 * Exhaustive bench policy over the client-intent allowlist. `satisfies` keeps
 * every key a real GameAction type; completeness vs CLIENT_INTENT_TYPES is
 * enforced by benchGate.test.ts (kept as a test, not an import, so this
 * module adds no runtime edge state→net).
 */
export const BENCH_INTENT_POLICY = {
  PICKUP_SPARK: 'deny',
  DROP_SPARK: 'allow',
  PLACE_PRIMITIVE: 'deny',
  PLACE_FROM_FREE: 'deny',
  SEVER_BOND: 'deny',
  UPDATE_AVATAR_POS: 'allow',
  SHRINK_TERRITORY: 'deny',
  // S102 #1 — raiding an enemy chewer is an offensive disruption (like SEVER_BOND); a benched
  // (offline) player can't raid.
  RAID_CREATURE: 'deny',
  TRIGGER_BOMB: 'deny',
  TRIGGER_RAINBOW: 'deny',
  PICKUP_POTATO: 'deny',
  PLACE_POTATO: 'deny',
  DROP_POTATO: 'allow',
  // S93 — the NONET trial is a universal puzzle race in a separate realm; the bench gates
  // building/acquisition, not puzzle participation (a benched player solving is a fair comeback).
  SUDOKU_SOLVED: 'allow',
  // V6-1.1 — buying a gatherer is ACQUISITIVE (it converts victory points into a unit), so it is
  // denied while eaten, exactly like PICKUP_SPARK / PLACE_*. Being benched should cost you tempo;
  // spending from the bench would hand the victim a free economic action mid-punish.
  BUY_GATHERER: 'deny',
  // V6-1.2 — buying speed is the same acquisitive spend as buying a unit: denied while eaten.
  UPGRADE_GATHERER_SPEED: 'deny',
  // V6-1.2 — re-tasking an EXISTING unit costs nothing and gains nothing; it is the economic
  // equivalent of moving your cursor. Allowed while benched, like UPDATE_AVATAR_POS: the bench is
  // meant to stop you ACQUIRING, not to freeze standing orders you already paid for.
  SET_GATHERER_PREFERENCE: 'allow',
  // S136 P1 (V6-1.3) — pulling from your own bank is the first move of BUILDING, and building is
  // exactly what the bench exists to stop (PLACE_* and PICKUP_SPARK are both denied). Allowing it
  // would let an eaten player stage shapes on the porch and place them the instant the bench lifts,
  // converting the punish window into free setup time. The shape is not lost — it stays banked.
  PULL_FROM_BANK: 'deny',
  // S141 P2 (V6-1.4) — queueing an order is the same class as SET_GATHERER_PREFERENCE, not the same
  // class as BUY_GATHERER: it acquires nothing, spends nothing, and moves nothing. It is a standing
  // instruction to units the player already paid for, so it is ALLOWED while benched — the bench
  // exists to stop you ACQUIRING and BUILDING during the punish window, not to make you forget what
  // you wanted. The shapes it causes to be hauled still land in a bank the benched player cannot
  // PULL_FROM (denied above), so no build is enabled by this.
  ENQUEUE_GATHERER_ORDER: 'allow',
  CANCEL_GATHERER_ORDER: 'allow',
} as const satisfies Partial<Record<GameAction['type'], BenchPolicy>>;

/**
 * True iff this action type must be rejected when its actor is benched.
 * Unknown types (host-internal actions, future non-intent actions) return
 * false — the gate only governs the client-intent surface.
 */
export function isBenchDeniedIntent(type: GameAction['type']): boolean {
  return (BENCH_INTENT_POLICY as Partial<Record<GameAction['type'], BenchPolicy>>)[type] === 'deny';
}
