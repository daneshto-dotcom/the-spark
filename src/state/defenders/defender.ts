/**
 * SPARK — S103 P2 generic tower-defense DEFENDER entity (pure type + config, leaf module).
 *
 * Mirrors the `spawners/spawner.ts` + `creatures/creature.ts` leaf pattern: `worldTypes.ts`
 * imports `Defender` from here (no worldTypes <-> defenderLifecycle cycle); this module never
 * imports world.ts.
 *
 * A Defender is the per-structure identity that makes a built RECIPE "come alive" as a
 * STATIONARY auto-attacker. ONE substrate, two `kind`s (Council MF7 — generalize, don't clone):
 *   • 'turret'   (#9, P3): a slow heavy laser (1 Line deg-7 + 7 Spiral 'Whip' leaves).
 *   • 'princess' (#10, P4): HELGA, a fast slapper (Triangle hub + 3 'Warped Anchor' + 3 'Star').
 * Both target the nearest enemy CREATURE in range via the unified `damageCreature` path.
 *
 * Determinism: the whole FSM (acquire / windup / fire / recover) is a pure fn of `world.tick`
 * — NEVER wall-clock, NEVER Math.random; target acquisition uses `findNearestEnemyCreatureFrom`
 * (lowest-CreatureId tie-break). Host-authoritative; replicated to clients via the additive-
 * optional `defenders[]` NetSnapshot field (creature/spawner precedent). ALL render-relevant
 * fields (state/ticksInState/nextFireTick/targetCreatureId/pos) are SYNCED (Council MF1/MF6):
 * the client renders the beam/slap off the synced FIRE state + the windup rings off nextFireTick.
 *
 * Identity = the shape-defining anchor primitive (the Line for a turret, the Triangle hub for
 * HELGA) — unique within its recipe by construction, stable, and re-validated each poll
 * (`recipeStillSatisfied`). Removal is recipe-break-driven (a chewer eats the structure) — `hp`
 * is a high sentinel kept for a future direct-attack lever (Council MF8), not used in v1.
 */

import {
  DEFENDER_HP,
  PRINCESS_SLAP_INTERVAL_TICKS,
  PRINCESS_SLAP_RANGE,
  PRINCESS_WINDUP_TICKS,
  TURRET_ATTACK_RANGE,
  TURRET_FIRE_INTERVAL_TICKS,
  TURRET_WINDUP_TICKS,
} from '../../constants.ts';
import type { CreatureId, DefenderId, PlayerId, PrimitiveId, Vec2 } from '../../types.ts';
import type { GodlyId } from '../godlyRecipes/types.ts';

/** Which kind of defender — selects the FSM tuning (config) + the renderer. */
export type DefenderKind = 'turret' | 'princess';

/**
 * Generic defender FSM. Both kinds share it; the per-kind config tunes the durations.
 *   IDLE   — waiting for the next fire attempt (`world.tick >= nextFireTick`) AND a target in range.
 *   WINDUP — telegraphing the strike (turret: a brief post-charge tell; HELGA: arm pulls back).
 *   FIRE   — the strike lands (damage dealt at FIRE entry); held DEFENDER_FIRE_HOLD_TICKS so the
 *            1v1 client reliably observes it + renders the beam/slap (Council MF1).
 *   RECOVER— cooldown before returning to IDLE + scheduling the next fire.
 */
export type DefenderState = 'IDLE' | 'WINDUP' | 'FIRE' | 'RECOVER';

export interface Defender {
  readonly id: DefenderId;
  readonly kind: DefenderKind;
  readonly ownerPlayerId: PlayerId;
  /** Stable identity = the shape-defining anchor primitive (Line / Triangle hub). */
  readonly anchorPrimitiveId: PrimitiveId;
  /** Which recipe minted this defender (e.g. 'laserTurret' / 'helga'). */
  readonly recipeId: GodlyId;
  /** Render + range origin — synced; the host refreshes it from the anchor primitive each poll. */
  pos: Vec2;
  state: DefenderState;
  /** Ticks since entering `state`. */
  ticksInState: number;
  /** Sentinel hp (recipe-break removal in v1; a future direct-attack lever routes through here). */
  hp: number;
  /**
   * Tick the next fire ATTEMPT begins. SYNCED so the client derives the laser windup rings from
   * `nextFireTick - world.tick`. Re-phased on load to avoid an insta-fire (Council MF5).
   */
  nextFireTick: number;
  /** Current victim creature (the beam/slap endpoint). SYNCED so the client draws the strike. */
  targetCreatureId: CreatureId | null;
  /**
   * Position the last strike was aimed at, captured at FIRE entry. SYNCED so the client draws the
   * beam/slap to a fixed endpoint even though the victim creature vanishes the SAME tick it dies
   * (the wire-split lesson — a one-shot kill would otherwise leave the beam with no endpoint).
   * Cleared back to null on return to IDLE so it only rides the wire during FIRE/RECOVER.
   */
  lastStrikePos: Vec2 | null;
}

/** Per-kind FSM + combat tuning. One entry per DefenderKind (compile-time exhaustive). */
export interface DefenderConfig {
  readonly kind: DefenderKind;
  /** Ticks between fire attempts (turret 1800 / HELGA 90). */
  readonly fireIntervalTicks: number;
  /** Wind-up telegraph duration before the strike lands. */
  readonly windupTicks: number;
  /** Max distance (px) to the target creature for acquisition + the strike. */
  readonly attackRange: number;
  /** Sentinel hp (see DEFENDER_HP). */
  readonly hp: number;
}

export const TURRET_DEFENDER_CONFIG: DefenderConfig = {
  kind: 'turret',
  fireIntervalTicks: TURRET_FIRE_INTERVAL_TICKS,
  windupTicks: TURRET_WINDUP_TICKS,
  attackRange: TURRET_ATTACK_RANGE,
  hp: DEFENDER_HP,
};

export const PRINCESS_DEFENDER_CONFIG: DefenderConfig = {
  kind: 'princess',
  fireIntervalTicks: PRINCESS_SLAP_INTERVAL_TICKS,
  windupTicks: PRINCESS_WINDUP_TICKS,
  attackRange: PRINCESS_SLAP_RANGE,
  hp: DEFENDER_HP,
};

export const DEFENDER_CONFIGS: Readonly<Record<DefenderKind, DefenderConfig>> = {
  turret: TURRET_DEFENDER_CONFIG,
  princess: PRINCESS_DEFENDER_CONFIG,
};

export function getDefenderConfig(kind: DefenderKind): DefenderConfig {
  return DEFENDER_CONFIGS[kind];
}

/**
 * Factory for a freshly-registered defender (IDLE). `nextFireTick` is seeded one full interval
 * out so it doesn't fire on the ignition tick (mirrors the spawner's `+ SPAWN_INTERVAL_TICKS`
 * seed — the turret's first beam is its first charge cycle, not instant). `pos` is the anchor
 * primitive's position at ignition (the host refreshes it each poll).
 */
export function makeDefender(args: {
  id: DefenderId;
  kind: DefenderKind;
  ownerPlayerId: PlayerId;
  anchorPrimitiveId: PrimitiveId;
  recipeId: GodlyId;
  pos: Vec2;
  registeredAtTick: number;
}): Defender {
  const config = getDefenderConfig(args.kind);
  return {
    id: args.id,
    kind: args.kind,
    ownerPlayerId: args.ownerPlayerId,
    anchorPrimitiveId: args.anchorPrimitiveId,
    recipeId: args.recipeId,
    pos: { x: args.pos.x, y: args.pos.y },
    state: 'IDLE',
    ticksInState: 0,
    hp: config.hp,
    nextFireTick: args.registeredAtTick + config.fireIntervalTicks,
    targetCreatureId: null,
    lastStrikePos: null,
  };
}
