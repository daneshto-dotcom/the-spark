/**
 * SPARK — S72 P2 Pac-Man hunter lifecycle reducers.
 *
 * Mirrors the creature/bomb lifecycle shape: pure case-body helpers consumed by
 * world.ts dispatch. Three HOST-INTERNAL actions (none are client INTENTs — the
 * hunter is host-authored + replicated via snapshot, so PROTOCOL_VERSION stays 5):
 *   SPAWN_HUNTER  — main.ts fires this ONCE when the leader first reaches 75%.
 *                   Targets the leading player (LOCKED at spawn). Sets
 *                   world.hunterSpawned so it never re-fires this game.
 *   HUNTER_TICK   — advance one frame: steer toward the target's avatar (momentum
 *                   pursuit), check the catch, run the FSM. Fanned out per hunter
 *                   in main.ts (host-only) after the creature fan-out.
 *   HUNTER_CATCH  — the "eat": bench the victim + drop their carried spark + enter
 *                   the CATCHING chomp. Called inline by applyHunterTick on contact
 *                   (atomic, like applyTriggerBomb -> applySeverBond) AND dispatchable
 *                   for unit-test parity.
 *
 * CRITICAL (Council Gemini #1 — the single highest crash risk): the chased player
 * can disconnect / be removed mid-hunt. applyHunterTick despawns the hunter
 * IMMEDIATELY when its target is gone, and EVERY avatarPos read sits behind that
 * guard — there is no unguarded `target.avatarPos` access anywhere in this module.
 *
 * Determinism: tick-based; pursuit is a pure fn of (pos, prevPos, target, tunables);
 * no RNG, no wall-clock. Host-authoritative — clients receive the result in the next
 * NetSnapshot (additive-optional `hunters[]`) and never simulate.
 */

import {
  CANVAS_WIDTH,
  HUNTER_ACCEL,
  HUNTER_BENCH_TICKS,
  HUNTER_CATCH_HOLD_TICKS,
  HUNTER_CATCH_RADIUS,
  HUNTER_DAMPING,
  HUNTER_DESPAWN_FADE_TICKS,
  HUNTER_MAX_SPEED,
} from '../../constants.ts';
import { asHunterId, type HunterId, type PlayerId } from '../../types.ts';
import { applyDropSpark } from '../sparkLifecycle.ts';
import type { World } from '../worldTypes.ts';
import { makeHunter } from './hunter.ts';
import { huntDistSq, hunterPursue } from './hunterAI.ts';

/** Squared catch radius — precomputed so the per-tick gate stays sqrt-free. */
const HUNTER_CATCH_RADIUS_SQ = HUNTER_CATCH_RADIUS * HUNTER_CATCH_RADIUS;

/** Action shapes — exported so world.ts can compose GameAction. */
export interface SpawnHunterAction {
  readonly type: 'SPAWN_HUNTER';
}
export interface HunterTickAction {
  readonly type: 'HUNTER_TICK';
  readonly hunterId: HunterId;
}
export interface HunterCatchAction {
  readonly type: 'HUNTER_CATCH';
  readonly hunterId: HunterId;
  readonly victimId: PlayerId;
}

/**
 * The leader = highest scoreByPlayer; tie-break LOWEST PlayerId (deterministic,
 * replay-safe — matches the Council "tiebreak lowest PlayerId" adoption). Returns
 * null only if scoreByPlayer is empty (degenerate; PLAYING always seats >= 1).
 * In solo this is the sole player.
 */
export function findLeadingPlayer(world: World): PlayerId | null {
  let bestId: PlayerId | null = null;
  let bestScore = -Infinity;
  for (const [pid, score] of world.scoreByPlayer) {
    const idNum = pid as unknown as number;
    if (
      score > bestScore ||
      (score === bestScore && bestId !== null && idNum < (bestId as unknown as number))
    ) {
      bestScore = score;
      bestId = pid;
    }
  }
  return bestId;
}

/**
 * Host-only: spawn the once-per-game hunter at a canvas edge, targeting the current
 * leader (LOCKED for the chase). Sets world.hunterSpawned so the main.ts trigger
 * never re-fires. No-op if there is no leader (degenerate empty roster).
 */
export function applySpawnHunter(world: World, _action: SpawnHunterAction): World {
  // Once-per-game (defense-in-depth; main.ts also guards on !world.hunterSpawned —
  // mirrors applySpawnCreature's max-1 invariant guard).
  if (world.hunterSpawned) return world;
  const targetPlayerId = findLeadingPlayer(world);
  if (targetPlayerId === null) return world;
  const id = asHunterId(world.nextHunterId++);
  world.hunters.set(
    id,
    makeHunter({
      id,
      targetPlayerId,
      // Spawn at the top-edge centre so it visibly closes in from outside the
      // play area (deterministic; far from the central spawner so the target
      // gets reaction time — juke-ability budget).
      pos: { x: CANVAS_WIDTH / 2, y: 60 },
      spawnedAtTick: world.tick,
    }),
  );
  world.hunterSpawned = true;
  return world;
}

/**
 * Advance one hunter frame. Order:
 *   0. Defense-in-depth: missing id (stale fan-out snapshot) → return.
 *   1. CRASH-GUARD: target player gone (disconnect/eliminate) → despawn + return.
 *      EVERY avatarPos read below sits behind this guard.
 *   2. CATCHING: hold the chomp HUNTER_CATCH_HOLD_TICKS then despawn.
 *   3. DESPAWNING: fade HUNTER_DESPAWN_FADE_TICKS then despawn.
 *   4. SEEKING:
 *        a. chase window elapsed (tick >= despawnAtTick) → escape → DESPAWNING.
 *        b. else momentum-pursue the target avatar; if within catch radius → catch.
 */
export function applyHunterTick(world: World, action: HunterTickAction): World {
  const hunter = world.hunters.get(action.hunterId);
  if (hunter === undefined) return world;

  // CRITICAL crash-guard (Council Gemini #1): the chased player may have left the
  // match. Despawn the hunter immediately; do NOT touch a missing player's avatarPos.
  const target = world.players.get(hunter.targetPlayerId);
  if (target === undefined) {
    world.hunters.delete(action.hunterId);
    return world;
  }

  if (hunter.state === 'CATCHING') {
    hunter.ticksInState++;
    if (hunter.ticksInState >= HUNTER_CATCH_HOLD_TICKS) world.hunters.delete(action.hunterId);
    return world;
  }

  if (hunter.state === 'DESPAWNING') {
    hunter.ticksInState++;
    if (hunter.ticksInState >= HUNTER_DESPAWN_FADE_TICKS) world.hunters.delete(action.hunterId);
    return world;
  }

  // SEEKING — escape check first (the player survived the full chase window).
  if (world.tick >= hunter.despawnAtTick) {
    hunter.state = 'DESPAWNING';
    hunter.ticksInState = 0;
    return world;
  }

  hunterPursue(hunter, target.avatarPos, HUNTER_ACCEL, HUNTER_MAX_SPEED, HUNTER_DAMPING);
  hunter.ticksInState++;

  if (huntDistSq(hunter.pos, target.avatarPos) <= HUNTER_CATCH_RADIUS_SQ) {
    applyHunterCatch(world, {
      type: 'HUNTER_CATCH',
      hunterId: action.hunterId,
      victimId: hunter.targetPlayerId,
    });
  }
  return world;
}

/**
 * The "eat": bench the victim (avatar hidden + input locked — both gate on the
 * tick comparison, self-healing per Council R5) and drop any carried spark by
 * REUSING the existing DROP_SPARK path (Council ADOPTED). benchedUntilTick is set
 * BEFORE the drop so it survives the player-object reconstruction inside fsmDrop.
 * The hunter enters CATCHING to hold a brief chomp before applyHunterTick removes it.
 */
export function applyHunterCatch(world: World, action: HunterCatchAction): World {
  const hunter = world.hunters.get(action.hunterId);
  if (hunter === undefined) return world;
  const victim = world.players.get(action.victimId);
  if (victim === undefined) {
    // Target vanished between detection and catch — despawn defensively.
    world.hunters.delete(action.hunterId);
    return world;
  }

  // Math.max so a future longer-duration bencher can't be shortened by a catch
  // (CHECK-Gemini defensive; in v1 the once-per-game single hunter is the only
  // bencher, so this is exactly world.tick + HUNTER_BENCH_TICKS). Set BEFORE the
  // drop so it survives the fsmDrop player-object reconstruction.
  victim.benchedUntilTick = Math.max(victim.benchedUntilTick ?? 0, world.tick + HUNTER_BENCH_TICKS);

  // Drop any carried spark (Council ADOPTED: reuse DROP_SPARK, not a new mechanic).
  // applyDropSpark throws if the carry slot is somehow inconsistent — guard on kind
  // AND swallow defensively so a hunter catch can never crash the host tick loop, but
  // surface it (dev console) so a real carry-1 invariant break stays observable
  // (CHECK-Grok/Gemini: no silent state corruption).
  if (victim.kind === 'Carrying') {
    try {
      applyDropSpark(world, {
        type: 'DROP_SPARK',
        playerId: action.victimId,
        pos: { x: victim.avatarPos.x, y: victim.avatarPos.y },
      });
    } catch (e) {
      console.error('[hunter] DROP_SPARK failed on catch (carry-1 invariant?):', e);
    }
  }

  hunter.state = 'CATCHING';
  hunter.ticksInState = 0;
  return world;
}

/**
 * Teardown — clear all hunter state. Called on PLAYING -> WIN (WIN_TRIGGER) and on
 * RETURN_TO_TITLE so a hunter never persists onto the win screen or into the next
 * match, and no player starts the next match still benched (Council PRIME-AUDIT:
 * orphaned-bench fix). hunterSpawned reset so a fresh game can spawn again.
 */
export function teardownHunters(world: World): void {
  world.hunters.clear();
  world.nextHunterId = 0;
  world.hunterSpawned = false;
  for (const player of world.players.values()) {
    player.benchedUntilTick = undefined;
  }
}
