/**
 * SPARK — Player entity + Carry-1 invariant.
 * § III.3 LOCKED: a player carries at most one spark.
 * § 11 enforcement: discriminated union `IdlePlayer | CarryingPlayer`
 * + runtime guard at every transition. Type system rejects double-carry
 * at compile time; the guard backstops dispatched-action payload errors.
 */

import {
  BUILD_ACTIONS_PER_CHARGE,
  MAX_DISRUPTION_CHARGES,
  MAX_RAID_POINTS,
  RAID_PROGRESS_PER_POINT,
  CASTLE_MAX_HP,
} from '../constants.ts';
import type { PlayerId, PotatoId, SparkId, Vec2 } from '../types.ts';

interface PlayerCommon {
  readonly id: PlayerId;
  /**
   * S75 P3 — MUTABLE (was readonly): the rainbow colour-shuffle remaps every player's identity
   * colour in place (rainbowLifecycle.applyTriggerRainbow). Set once at construction otherwise;
   * the shuffle is the only other writer. Player reconstruction (fsmDrop) copies the live value.
   */
  color: number;
  energy: number;
  buildActions: number;
  disruptionCharges: number;
  /**
   * ⭐ S152 P1 (owner R78) — SPENDABLE RAID POINTS, A SEPARATE CURRENCY FROM `disruptionCharges`.
   *
   * Owner: *"either once you build 2 towers or make 5 connections you get one **raid point**"* — the
   * owner's own noun, and the reason this is not a third sink on the existing pool.
   *
   * ⛔ WHY NOT REUSE `disruptionCharges`. It caps at `MAX_DISRUPTION_CHARGES = 2` and a defensive
   * sever costs `DEFENSIVE_SEVER_CHARGE_COST = 2` — the WHOLE budget. Sharing the pool would mean
   * one raid (cost 1) leaves a player unable to sever at all, so every offensive click would be a
   * tax on defence. Both Council seats reached "separate currency" independently.
   *
   * ⚠ SERIALIZED BUT NOT HASHED, following `disruptionCharges` exactly (it is absent from
   * `stateHashFull`). The hash covers the families a divergence check needs; currencies are
   * host-authoritative and mirrored by snapshot.
   */
  raidPoints: number;
  /**
   * ⭐ S154 AMENDMENT C (owner A4 / R89) — THIS SEAT'S CASTLE HIT POINTS, counting down from
   * `CASTLE_MAX_HP`. Zero means the castle has fallen and the seat has lost.
   *
   * ## Why it lives on the PLAYER and not in a new `world.castleHp` map
   *
   * A castle is per-seat by construction — `castleAnchor(seat, layout)` is where it stands and there
   * is exactly one per player — so a seat-keyed map would be a second index of something the players
   * map already keys. More practically: `Player` is ALREADY serialized (`SerializedPlayer`) and
   * already threaded through save/load and the wire, so this rides existing machinery instead of
   * adding a family. That is the same reasoning S152 P1 recorded for `raidPoints`/`raidProgress`.
   */
  castleHp: number;
  /**
   * Accrual progress toward the next raid point, in TENTHS. See `RAID_PROGRESS_PER_POINT`.
   * A tower is worth 5, a hand-made connection 2, and 10 tenths is a point — so "2 towers OR 5
   * connections" both come out exact, and mixed building never strands a part-payment.
   */
  raidProgress: number;
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
  /**
   * S82 P1 — cruiser-poopy-slow debuff expiry tick. Set by applyPoopTick when a FALLING
   * poop lands on this player's avatar (within POOP_AVATAR_HIT_RADIUS). While
   * world.tick < poopedUntilTick the cruiser is slowed (cursor-chase movement model,
   * see poopedCursorTarget) and tinted toward POOP_FOUL_TINT. Tick-gated self-heal
   * (mirror of benchedUntilTick / spark.poopyUntilTick — no clear action needed).
   * Additive-optional in save.ts; rides NetSnapshot so clients render the tint.
   */
  poopedUntilTick?: number;
  /**
   * S82 P1 — the slowed cruiser's chase target. While the debuff is active,
   * applyUpdateAvatarPos writes THIS (verbatim cursor) instead of avatarPos, and the
   * host per-tick chase (gameMode.tickCruiserChase) moves avatarPos toward it at
   * ≤ POOP_CRUISER_MAX_SPEED px/tick. Gate is THIS FIELD (not the timer): after the
   * debuff expires the chase completes the residual gap, then exact-snaps and CLEARS
   * the field (Council S82 R2 — guaranteed convergence, no float-equality compare).
   * The first un-debuffed UPDATE_AVATAR_POS also clears it (cursor re-authoritative).
   * Additive-optional in save.ts (emitted only while set).
   */
  poopedCursorTarget?: Vec2;
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
    // S152 P1 — a new seat starts with no raid points and no progress toward one.
    raidPoints: 0,
    castleHp: CASTLE_MAX_HP,
    raidProgress: 0,
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
    // ⛔ S152 P1 — PRESERVE ACROSS THE CARRY-FSM RECONSTRUCTION. `pickup`/`fsmDrop` rebuild the
    // player object wholesale, so a field omitted here is silently RESET every time the seat picks
    // up or drops a shape. That is the documented failure mode of this pair of literals.
    raidPoints: player.raidPoints,
    raidProgress: player.raidProgress,
    // ⛔ S154 AMENDMENT C — AND castleHp, for the exact reason the note above gives: `pickup` and
    // `fsmDrop` rebuild the player wholesale, so a field omitted here is silently RESET to full every
    // time the seat picks up or drops a shape. A castle that heals itself whenever its owner touches a
    // spark is unwinnable, and nothing would have gone red.
    castleHp: player.castleHp,
    avatarPos: { x: player.avatarPos.x, y: player.avatarPos.y },
    godlyCooldownEndsAtTick: player.godlyCooldownEndsAtTick,
    territorialShrinkUntilTick: player.territorialShrinkUntilTick,
    // S72 P2 — preserve the hunter bench across the carry-FSM reconstruction
    // (a benched player can still be holding a spark when caught).
    benchedUntilTick: player.benchedUntilTick,
    // S72 P3 — preserve the potato carry slot (undefined here by mutual exclusion —
    // the spark-pickup paths reject while carrying a potato — but thread it for safety).
    carriedPotatoId: player.carriedPotatoId,
    // S82 P1 — preserve the cruiser-slow debuff across the carry-FSM reconstruction
    // (a slowed player can still pick up a spark; the chase keeps governing avatarPos).
    poopedUntilTick: player.poopedUntilTick,
    poopedCursorTarget: player.poopedCursorTarget,
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
    // ⛔ S152 P1 — PRESERVE ACROSS THE CARRY-FSM RECONSTRUCTION. `pickup`/`fsmDrop` rebuild the
    // player object wholesale, so a field omitted here is silently RESET every time the seat picks
    // up or drops a shape. That is the documented failure mode of this pair of literals.
    raidPoints: player.raidPoints,
    raidProgress: player.raidProgress,
    // ⛔ S154 AMENDMENT C — AND castleHp, for the exact reason the note above gives: `pickup` and
    // `fsmDrop` rebuild the player wholesale, so a field omitted here is silently RESET to full every
    // time the seat picks up or drops a shape. A castle that heals itself whenever its owner touches a
    // spark is unwinnable, and nothing would have gone red.
    castleHp: player.castleHp,
    avatarPos: { x: player.avatarPos.x, y: player.avatarPos.y },
    godlyCooldownEndsAtTick: player.godlyCooldownEndsAtTick,
    territorialShrinkUntilTick: player.territorialShrinkUntilTick,
    // S72 P2 — preserve the hunter bench when the caught player drops their spark
    // (applyHunterCatch sets benchedUntilTick BEFORE calling DROP_SPARK -> fsmDrop).
    benchedUntilTick: player.benchedUntilTick,
    // S72 P3 — preserve the potato carry slot across the carry-FSM reconstruction.
    carriedPotatoId: player.carriedPotatoId,
    // S82 P1 — preserve the cruiser-slow debuff across the carry-FSM reconstruction.
    poopedUntilTick: player.poopedUntilTick,
    poopedCursorTarget: player.poopedCursorTarget,
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

/**
 * ⭐ S152 P1 (owner R78) — EARN RAID PROGRESS, AND CONVERT IT TO POINTS.
 *
 * Owner: *"either once you build 2 towers or make 5 connections you get one raid point"*.
 *
 * `tenths` is `RAID_PROGRESS_PER_TOWER` (5) for a tower or `RAID_PROGRESS_PER_CONNECTION` (2) for a
 * hand-made connection. Deliberately shaped exactly like `tickBuildAction` above — a progress
 * counter that drains into a capped currency — because it is the same kind of thing and the next
 * reader should not have to work out whether it is.
 *
 * ⚠ AT THE CAP, PROGRESS STOPS ACCUMULATING RATHER THAN BANKING INVISIBLY. `tickBuildAction` has
 * this same shape: its `while` cannot run at the cap, so `buildActions` keeps climbing and the
 * moment a charge is spent it instantly refills from the backlog. For raids that would let a player
 * bank an unbounded reserve behind a cap of 3 and then fire it all at once, which is not a cap at
 * all — so this clamps the PROGRESS too, and the surplus is genuinely forfeited.
 */
export function grantRaidProgress(player: Player, tenths: number): void {
  if (!Number.isInteger(tenths) || tenths <= 0) return;
  player.raidProgress += tenths;
  while (player.raidProgress >= RAID_PROGRESS_PER_POINT && player.raidPoints < MAX_RAID_POINTS) {
    player.raidProgress -= RAID_PROGRESS_PER_POINT;
    player.raidPoints++;
  }
  if (player.raidPoints >= MAX_RAID_POINTS && player.raidProgress >= RAID_PROGRESS_PER_POINT) {
    player.raidProgress = RAID_PROGRESS_PER_POINT - 1; // hold just short; do not bank a backlog
  }
}

/** Passive flat energy accrual (§ XIV.8). */
export function tickEnergy(player: Player, deltaSec: number, ratePerSec: number): void {
  player.energy += deltaSec * ratePerSec;
}
