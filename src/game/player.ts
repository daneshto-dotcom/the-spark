/**
 * SPARK — Player entity + Carry-1 invariant.
 * § III.3 LOCKED: a player carries at most one spark.
 * § 11 enforcement: discriminated union `IdlePlayer | CarryingPlayer`
 * + runtime guard at every transition. Type system rejects double-carry
 * at compile time; the guard backstops dispatched-action payload errors.
 */

import { BUILD_ACTIONS_PER_CHARGE, MAX_DISRUPTION_CHARGES } from '../constants.ts';
import type { PlayerId, SparkId } from '../types.ts';

export interface PlayerCommon {
  readonly id: PlayerId;
  readonly color: number;
  energy: number;
  buildActions: number;
  disruptionCharges: number;
}

export type IdlePlayer = PlayerCommon & { readonly kind: 'Idle' };
export type CarryingPlayer = PlayerCommon & {
  readonly kind: 'Carrying';
  readonly carriedSparkId: SparkId;
};
export type Player = IdlePlayer | CarryingPlayer;

export function makeIdlePlayer(id: PlayerId, color: number): IdlePlayer {
  return {
    id,
    color,
    kind: 'Idle',
    energy: 0,
    buildActions: 0,
    disruptionCharges: 0,
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
