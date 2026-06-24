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
} as const satisfies Partial<Record<GameAction['type'], BenchPolicy>>;

/**
 * True iff this action type must be rejected when its actor is benched.
 * Unknown types (host-internal actions, future non-intent actions) return
 * false — the gate only governs the client-intent surface.
 */
export function isBenchDeniedIntent(type: GameAction['type']): boolean {
  return (BENCH_INTENT_POLICY as Partial<Record<GameAction['type'], BenchPolicy>>)[type] === 'deny';
}
