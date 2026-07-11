/**
 * SPARK — S122 P1 (B2 phase d): the DOM/Pixi-free core of the input layer.
 *
 * controls.ts (the pointer-event class) imports render/lobbyScreen for coordinate mapping,
 * which drags Pixi — so everything the SIM needs from the input layer lives HERE, imported
 * by both controls.ts (which re-exports for its long-standing consumers) and the worker sim
 * (state/workerSim.ts), keeping the worker chunk render-free.
 *
 * Moved VERBATIM from controls.ts (S122): ControlState, ControlsDispatchFn, ControlsLike,
 * stepAttractLerp, applyControlsPerSubstep. No behavior change — controls.ts delegates.
 */

import { ATTRACT_FOLLOW_RATE, POOP_SLOW_MULTIPLIER } from '../constants.ts';
import { isBenched } from '../state/hunters/hunter.ts';
import type { GameAction, World } from '../state/world.ts';
import type { PlayerId, SparkId, Vec2 } from '../types.ts';

/**
 * S15 P2 — dispatcher injection. Solo / host mode passes a fn that calls
 * dispatch(world, action) locally. Client mode passes a fn that wraps the
 * action as an Intent envelope and sends over the network transport (host
 * applies authoritatively, snapshot returns ~RTT/2 later). The input layer
 * has no direct net dependency; main.ts decides the wiring.
 */
export type ControlsDispatchFn = (action: GameAction) => void;

export type ControlState =
  | { readonly kind: 'Idle' }
  | {
      readonly kind: 'AttractDrag';
      readonly sparkId: SparkId;
      readonly cursor: Vec2;
    };
// S53 P2 — ConnectDrag variant removed. See controls.ts header for rationale.

/**
 * S122 P1 — the minimal structural surface stepPhysics/runHostTick actually consume from
 * Controls (S107 P2 finding: `state.kind`/`state.sparkId` reads + the per-substep apply).
 * The full DOM-wired Controls class satisfies it structurally; the worker sim provides a
 * plain facade over a per-frame-posted ControlState — no DOM, no Pixi.
 */
export interface ControlsLike {
  readonly state: ControlState;
  applyPerSubstep(): void;
}

/**
 * S10 P1 — position-lerp attract follow. Replaces the S5-era impulse-on-prevPos scheme
 * (slow pendulum: momentum → overshoot → swing back; user: "stupid magnet slowly swinging
 * back and forward"). Lerping spark.pos directly and restoring prevPos = old pos keeps
 * residual velocity = lerp delta, so verlet still gives a tiny "alive" feel but cannot
 * overshoot. Exported for the client prediction path + unit tests.
 */
export function stepAttractLerp(
  pos: { x: number; y: number },
  prevPos: { x: number; y: number },
  cursor: { x: number; y: number },
  rate: number,
): void {
  const oldX = pos.x, oldY = pos.y;
  pos.x = oldX + (cursor.x - oldX) * rate;
  pos.y = oldY + (cursor.y - oldY) * rate;
  prevPos.x = oldX;
  prevPos.y = oldY;
}

/**
 * S122 P1 — the per-substep control application, extracted VERBATIM from
 * Controls.applyPerSubstep so the worker facade runs the byte-identical authoritative path.
 * Pure over its inputs; returns the (possibly ended) ControlState.
 *
 * Preserved semantics, in order:
 *  • S86 P3 — a benched (eaten) player's in-flight gesture dies NOW: the hunter catch
 *    force-drops the carried spark, and pre-S86 the `mine` Free-allowance below yanked it
 *    straight back to the cursor ("the pacman ate me and i can still pick up primitives").
 *    Also kills the stuck-gesture hole (onUp early-returns while input-locked). DROP_SPARK
 *    is 'allow' in BENCH_INTENT_POLICY — release-only verbs stay open.
 *  • S58 (#2) — drive a spark that is Free OR Carried by ME; end cleanly if gone, consumed,
 *    or grabbed by the opponent (race-lost reconciliation).
 *  • S77 P3 — a seagull-pooped spark drags at half speed until poopyUntilTick.
 *  • S58 (#2) — Carrying-without-gesture defensive hard-snap to the cursor.
 */
export function applyControlsPerSubstep(
  world: World,
  playerId: PlayerId,
  state: ControlState,
  cursor: Vec2,
  dispatchFn: ControlsDispatchFn,
): ControlState {
  const player = world.players.get(playerId);
  if (player === undefined) return state;

  if (state.kind === 'AttractDrag') {
    const spark = world.freeSparks.get(state.sparkId);
    if (isBenched(player.benchedUntilTick, world.tick)) {
      if (player.kind === 'Carrying' && spark !== undefined && player.carriedSparkId === spark.id) {
        dispatchFn({
          type: 'DROP_SPARK',
          playerId,
          pos: { x: cursor.x, y: cursor.y },
        });
      }
      return { kind: 'Idle' };
    }
    const mine =
      spark !== undefined &&
      (spark.state.kind === 'Free' ||
        (spark.state.kind === 'Carried' && spark.state.carrierId === playerId));
    if (!mine) {
      return { kind: 'Idle' };
    }
    const followRate =
      spark.poopyUntilTick !== undefined && world.tick < spark.poopyUntilTick
        ? ATTRACT_FOLLOW_RATE * POOP_SLOW_MULTIPLIER
        : ATTRACT_FOLLOW_RATE;
    stepAttractLerp(spark.pos, spark.prevPos, state.cursor, followRate);
  }

  if (player.kind === 'Carrying' && state.kind !== 'AttractDrag') {
    const carried = world.freeSparks.get(player.carriedSparkId);
    if (carried !== undefined) {
      carried.pos.x = cursor.x;
      carried.pos.y = cursor.y;
      carried.prevPos.x = cursor.x;
      carried.prevPos.y = cursor.y;
    }
  }
  return state;
}
