/**
 * SPARK — S77 P3 seagull hazard + poop projectile (pure types, leaf module).
 *
 * Mirrors hunters/hunter.ts + potato.ts: worldTypes.ts imports these domain types so
 * there is NO worldTypes <-> seagullLifecycle cycle (worldTypes -> leaf types only).
 *
 * The seagull is a host-authoritative, RECURRING hazard (unlike the once-per-game hunter):
 * the spawner cadence mints one ~every 2 min (gated SEAGULL_MAX_ACTIVE). It flies straight
 * across the top at a constant horizontal velocity (SIM path is LINEAR — deterministic; the
 * renderer adds a cosmetic sine bob) and drops poop at RANDOM intervals (S81 P3 — a pure hash
 * of (id, lastPoopTick) picks each gap in [POOP_DROP_MIN, MAX]; no RNG stream consumed). It is
 * replicated to clients via the additive-optional seagulls[]/poops[] NetSnapshot fields
 * (hunter precedent); clients never simulate. PROTOCOL_VERSION bumped 6->7 (S77 P3): the
 * global income-affecting foul would confuse a stale peer, so it is gated at the HELLO
 * handshake (rainbow precedent).
 */

import type { PoopId, PrimitiveId, SeagullId, Vec2 } from '../../types.ts';

export interface Seagull {
  readonly id: SeagullId;
  /** pos.x advances by vx each tick (LINEAR sim). pos.y stays at baseY; the render bobs it. */
  pos: Vec2;
  /** Previous pos — drives the render facing/streak; the sim sets it each tick. */
  prevPos: Vec2;
  /** Horizontal cruise velocity (px/tick): +SEAGULL_SPEED (L->R) or -SEAGULL_SPEED (R->L). */
  readonly vx: number;
  /** Constant flight altitude (sim). The renderer bobs ±SEAGULL_BOB_AMPLITUDE around it. */
  readonly baseY: number;
  readonly spawnedAtTick: number;
  /** Tick of the last poop drop — the lifecycle drops again at lastPoopTick +
   *  poopDropIntervalTicks(id, lastPoopTick) (S81 P3 hash-derived random gap). */
  lastPoopTick: number;
}

/**
 * Poop FSM:
 *   FALLING         — descending; checks collision vs primitives + free sparks each tick.
 *   SPLAT_STRUCTURE — stuck on a fouled primitive (fouledPrimId); fouls that prim's whole
 *                     connected structure; removed when any avatar cleans it (or the prim dies).
 *   SPLAT_GROUND    — hit the floor harmlessly; lingers POOP_GROUND_TTL_TICKS then dissipates.
 * (A poop that hits a free SPARK is consumed immediately — it applies the slow + is deleted,
 *  so there is no persistent spark-splat state.)
 */
export type PoopState = 'FALLING' | 'SPLAT_STRUCTURE' | 'SPLAT_GROUND';

export interface Poop {
  readonly id: PoopId;
  pos: Vec2;
  prevPos: Vec2;
  state: PoopState;
  readonly spawnedAtTick: number;
  /** Tick the poop landed (SPLAT_*). Drives the ground TTL + the splat-pop render. -1 while FALLING. */
  landedAtTick: number;
  /** The primitive a SPLAT_STRUCTURE poop is stuck on (the foul anchor). undefined otherwise. */
  fouledPrimId?: PrimitiveId;
}

/** Factory for a freshly-minted seagull entering at a screen edge in FLYING. */
export function makeSeagull(args: {
  id: SeagullId;
  pos: Vec2;
  vx: number;
  spawnedAtTick: number;
}): Seagull {
  return {
    id: args.id,
    pos: { x: args.pos.x, y: args.pos.y },
    prevPos: { x: args.pos.x - args.vx, y: args.pos.y },
    vx: args.vx,
    baseY: args.pos.y,
    spawnedAtTick: args.spawnedAtTick,
    lastPoopTick: args.spawnedAtTick,
  };
}

/** Factory for a freshly-dropped poop in FALLING (prevPos snaps to pos; the lifecycle moves it). */
export function makePoop(args: { id: PoopId; pos: Vec2; spawnedAtTick: number }): Poop {
  return {
    id: args.id,
    pos: { x: args.pos.x, y: args.pos.y },
    prevPos: { x: args.pos.x, y: args.pos.y },
    state: 'FALLING',
    spawnedAtTick: args.spawnedAtTick,
    landedAtTick: -1,
  };
}
