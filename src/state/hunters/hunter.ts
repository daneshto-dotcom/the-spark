/**
 * SPARK — S72 P2 Pac-Man hunter entity (pure type, leaf module).
 *
 * Mirrors the `creatures/creature.ts` + `bomb.ts` pattern: `worldTypes.ts`
 * imports `Hunter` from here so there is NO worldTypes <-> hunterLifecycle cycle
 * (worldTypes -> leaf domain types only).
 *
 * The hunter is a SEPARATE host-authoritative entity — NOT a Voltkin CreatureType
 * (§13.15 is LOCKED + untouched; Council Fork C UNANIMOUS separate-Map). It chases
 * ONE player's avatar (`targetPlayerId`, LOCKED at spawn) and is replicated to
 * clients via the additive-optional `hunters[]` NetSnapshot field (creature
 * precedent; NO PROTOCOL_VERSION bump — the wire already shipped v5 for the S71
 * TRIGGER_BOMB intent, and a snapshot field is additive).
 */

import { HUNTER_HUNT_TICKS } from '../../constants.ts';
import type { HunterId, PlayerId, Vec2 } from '../../types.ts';

/**
 * Hunter FSM:
 *   SEEKING    — pursuing the target's avatar (the only steering state).
 *   CATCHING   — caught the victim; holding a brief chomp (the renderer shows the
 *                bite) before the hunter despawns. The victim is benched on ENTRY.
 *   DESPAWNING — the target survived the HUNT window; fading out, then removed.
 */
export type HunterState = 'SEEKING' | 'CATCHING' | 'DESPAWNING';

export interface Hunter {
  readonly id: HunterId;
  /** pos/prevPos carry the Verlet implicit velocity (pos - prevPos) for momentum pursuit. */
  pos: Vec2;
  prevPos: Vec2;
  state: HunterState;
  /** Ticks since entering `state`; resets on transition. Drives despawn/chomp timing + render. */
  ticksInState: number;
  /** The chased player — LOCKED at spawn (the one who FIRST hit 75%). */
  readonly targetPlayerId: PlayerId;
  readonly spawnedAtTick: number;
  /** Tick at which an uncaught hunter gives up the chase (spawnedAtTick + HUNTER_HUNT_TICKS). */
  readonly despawnAtTick: number;
}

/**
 * Factory for a freshly-spawned hunter in SEEKING state. `prevPos` snaps to `pos`
 * (zero initial implicit velocity). `despawnAtTick` is fixed at construction so the
 * chase window is deterministic from this point.
 */
export function makeHunter(args: {
  id: HunterId;
  targetPlayerId: PlayerId;
  pos: Vec2;
  spawnedAtTick: number;
}): Hunter {
  return {
    id: args.id,
    pos: { x: args.pos.x, y: args.pos.y },
    prevPos: { x: args.pos.x, y: args.pos.y },
    state: 'SEEKING',
    ticksInState: 0,
    targetPlayerId: args.targetPlayerId,
    spawnedAtTick: args.spawnedAtTick,
    despawnAtTick: args.spawnedAtTick + HUNTER_HUNT_TICKS,
  };
}

/**
 * S72 P2 — pure bench predicate, shared by avatarRenderer (hide the avatar) +
 * controls (lock input). Extracted for unit-testability (the codebase "pure
 * helper" idiom — computeReleaseGates / decideKeyShrink / computeAvatarAlphas).
 * undefined or a past/equal tick = NOT benched (the bench self-heals at expiry).
 */
export function isBenched(benchedUntilTick: number | undefined, tick: number): boolean {
  return benchedUntilTick !== undefined && benchedUntilTick > tick;
}
