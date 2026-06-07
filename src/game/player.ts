/**
 * SPARK — Player entity + Carry-1 invariant.
 * § III.3 LOCKED: a player carries at most one spark.
 * § 11 enforcement: discriminated union `IdlePlayer | CarryingPlayer`
 * + runtime guard at every transition. Type system rejects double-carry
 * at compile time; the guard backstops dispatched-action payload errors.
 */

import { BUILD_ACTIONS_PER_CHARGE, MAX_DISRUPTION_CHARGES } from '../constants.ts';
import type { PlayerId, PotatoId, SparkId, Vec2 } from '../types.ts';

interface PlayerCommon {
  readonly id: PlayerId;
  readonly color: number;
  energy: number;
  buildActions: number;
  disruptionCharges: number;
  /**
   * S15 P2 — per-player cursor / avatar position. In solo (Phase 1) the
   * cursor doubles as the single avatar (avatarRenderer.ts reads
   * controls.cursor). In 1v1 networked play, each Player has their OWN
   * avatarPos written by host on its own input + on client-Intent applied
   * by host; clients render both via NetSnapshot. Council R1 BLOCKER #2
   * (Grok): "personal-vision logic assumes every PlayerId has its own
   * avatar position".
   */
  avatarPos: Vec2;
  /**
   * S22 P3 D7 — godly-trigger cooldown end tick (60s @ 60Hz = 3600 ticks
   * after dispatch). null = never triggered. Authoritative tick-based per
   * Battle Ledger row 4 Solomon split (UI converts to seconds for display).
   */
  godlyCooldownEndsAtTick: number | null;
  /**
   * S49 P1 (Sym F) — territorial radius shrink debuff expiry tick. When
   * SHRINK_TERRITORY targets this player, set to world.tick +
   * TERRITORY_SHRINK_DURATION_TICKS (300 = 5s at 60Hz). While
   * world.tick < territorialShrinkUntilTick, computeTerritorialRadius()
   * halves this player's effective R. null = no active debuff.
   */
  territorialShrinkUntilTick: number | null;
  /**
   * S72 P2 — Pac-Man hunter bench expiry tick. When a hunter catches this
   * player it is set to world.tick + HUNTER_BENCH_TICKS. While
   * world.tick < benchedUntilTick the avatar is HIDDEN (avatarRenderer) AND
   * input is LOCKED (controls.isInputLocked) — both gate on the tick comparison
   * so the bench self-heals even if a clear is missed (Council R5). undefined =
   * never benched / cleared. Mutable: set by applyHunterCatch, cleared by the
   * main.ts bench-expiry sweep + teardownHunters. Additive-optional in save.ts.
   */
  benchedUntilTick?: number;
  /**
   * S72 P3 — id of the potato bomb this player is carrying, or undefined. MUTUALLY
   * EXCLUSIVE with carriedSparkId (carry-1): the spark-pickup paths reject when this
   * is set, and applyPickupPotato rejects when the player is Carrying a spark. Mutable;
   * set by applyPickupPotato, cleared by place/drop/detonate. Additive-optional in save.
   */
  carriedPotatoId?: PotatoId;
}

export type IdlePlayer = PlayerCommon & { readonly kind: 'Idle' };
export type CarryingPlayer = PlayerCommon & {
  readonly kind: 'Carrying';
  readonly carriedSparkId: SparkId;
};
export type Player = IdlePlayer | CarryingPlayer;

export function makeIdlePlayer(id: PlayerId, color: number, avatarPos: Vec2 = { x: 0, y: 0 }): IdlePlayer {
  return {
    id,
    color,
    kind: 'Idle',
    energy: 0,
    buildActions: 0,
    disruptionCharges: 0,
    avatarPos: { x: avatarPos.x, y: avatarPos.y },
    godlyCooldownEndsAtTick: null,
    territorialShrinkUntilTick: null,
  };
}

export class CarryViolation extends Error {
  constructor(message: string) {
    super(`carry-1 violation: ${message}`);
    this.name = 'CarryViolation';
  }
}

/** FSM transition: Idle → Carrying. Throws if already carrying. */
export function pickup(player: Player, sparkId: SparkId): CarryingPlayer {
  if (player.kind === 'Carrying') {
    throw new CarryViolation(`player ${player.id} already carries ${player.carriedSparkId}`);
  }
  return {
    id: player.id,
    color: player.color,
    energy: player.energy,
    buildActions: player.buildActions,
    disruptionCharges: player.disruptionCharges,
    avatarPos: { x: player.avatarPos.x, y: player.avatarPos.y },
    godlyCooldownEndsAtTick: player.godlyCooldownEndsAtTick,
    territorialShrinkUntilTick: player.territorialShrinkUntilTick,
    // S72 P2 — preserve the hunter bench across the carry-FSM reconstruction
    // (a benched player can still be holding a spark when caught).
    benchedUntilTick: player.benchedUntilTick,
    // S72 P3 — preserve the potato carry slot (undefined here by mutual exclusion —
    // the spark-pickup paths reject while carrying a potato — but thread it for safety).
    carriedPotatoId: player.carriedPotatoId,
    kind: 'Carrying',
    carriedSparkId: sparkId,
  };
}

/** FSM transition: Carrying → Idle. Throws if not carrying. */
export function drop(player: Player): IdlePlayer {
  if (player.kind === 'Idle') {
    throw new CarryViolation(`player ${player.id} is not carrying anything`);
  }
  return {
    id: player.id,
    color: player.color,
    energy: player.energy,
    buildActions: player.buildActions,
    disruptionCharges: player.disruptionCharges,
    avatarPos: { x: player.avatarPos.x, y: player.avatarPos.y },
    godlyCooldownEndsAtTick: player.godlyCooldownEndsAtTick,
    territorialShrinkUntilTick: player.territorialShrinkUntilTick,
    // S72 P2 — preserve the hunter bench when the caught player drops their spark
    // (applyHunterCatch sets benchedUntilTick BEFORE calling DROP_SPARK -> fsmDrop).
    benchedUntilTick: player.benchedUntilTick,
    // S72 P3 — preserve the potato carry slot across the carry-FSM reconstruction.
    carriedPotatoId: player.carriedPotatoId,
    kind: 'Idle',
  };
}

/** Add accumulated build actions; convert to disruption charges per § XIV.13. */
export function tickBuildAction(player: Player): void {
  player.buildActions++;
  while (
    player.buildActions >= BUILD_ACTIONS_PER_CHARGE &&
    player.disruptionCharges < MAX_DISRUPTION_CHARGES
  ) {
    player.buildActions -= BUILD_ACTIONS_PER_CHARGE;
    player.disruptionCharges++;
  }
}

/** Passive flat energy accrual (§ XIV.8). */
export function tickEnergy(player: Player, deltaSec: number, ratePerSec: number): void {
  player.energy += deltaSec * ratePerSec;
}
