/**
 * SPARK — V6-1.1 gatherer entity (pure type, leaf module).
 *
 * The "gatherer" is a player-owned hauler unit bought from the placeholder keep for
 * GATHERER_PRICE victory points. Mirrors the creatures/hunters `Map<Id,Entity>` + `nextId`
 * convention; `worldTypes.ts` imports `Gatherer` from here so there is no
 * worldTypes <-> gathererLifecycle cycle (worldTypes -> leaf domain types only).
 *
 * NAMING (owner ruling S134): "gatherer" everywhere in code AND docs. The identifier can
 * NEVER be `Worker` — the Web Worker (workerSim.ts) owns the authoritative World.
 *
 * SCOPE (V6-1.1): the gatherer is a bought, host-authoritative, SERIALIZED world entity that
 * appears at the owner's keep. Its shapeshifting-spark look is RENDERER-ONLY — a pure fn of
 * (tick, gathererId) at render time — and is deliberately NOT a field here: no morph state,
 * no wire cost, cannot desync (owner ruling S134). Roaming/hauling behaviour + the bank are
 * later slots (V6-1.2/1.3); this entity carries only identity, owner, position and birth tick.
 */

import {
  GATHERER_BASE_SPEED,
  GATHERER_MAX_SPEED_LEVEL,
  GATHERER_SPEED_PER_LEVEL,
  KEEP_H,
  KEEP_RING_RADIUS,
  KEEP_RING_SEATS,
  KEEP_W,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  type SparkType,
} from '../../constants.ts';
import type { GathererId, PlayerId, SparkId, Vec2 } from '../../types.ts';

/**
 * V6-1.2 — the haul cycle. SEEKING: walking to the chosen spark in the spawn zone. HAULING:
 * carrying it home to the owner's keep. Deposit flips it straight back to SEEKING, so a gatherer
 * is never idle while shapes exist.
 *
 * S136 P1 (V6-1.3) — WAITING: arrived at the keep with cargo, but the castle bank is at
 * CASTLE_BANK_CAP, so the unit STANDS THERE STILL HOLDING ITS SHAPE and deposits the moment a slot
 * frees (owner ruling: "bank full => a loaded gatherer walks home and WAITS holding its item").
 * Holding rather than dropping is what turns the cap into strategic pressure — your haulers visibly
 * stall until you spend — instead of silently destroying work the player already paid for.
 */
export type GathererState = 'SEEKING' | 'HAULING' | 'WAITING';

export interface Gatherer {
  readonly id: GathererId;
  /** The owning seat — drives the keep it belongs to and its tint (looks like that player's spark). */
  readonly ownerPlayerId: PlayerId;
  /** Where it is. Mutated each host tick by the movement step. */
  pos: Vec2;
  /** Birth tick (deterministic; reserved for future cadence — no runtime reader yet). */
  readonly spawnedAtTick: number;
  /** V6-1.2 — haul-cycle FSM state. */
  state: GathererState;
  /** The spark it is walking toward while SEEKING. Re-validated every tick (it can be taken/reaped). */
  targetSparkId: SparkId | null;
  /** The spark it is carrying while HAULING (escrow 'hauled'; its pos follows this gatherer). */
  carriedSparkId: SparkId | null;
  /**
   * V6-1.2 — purchased speed upgrades. Travel speed is
   * GATHERER_BASE_SPEED + speedLevel * GATHERER_SPEED_PER_LEVEL, capped at GATHERER_MAX_SPEED_LEVEL.
   */
  speedLevel: number;
  /**
   * V6-1.2 — the shape this gatherer prefers to fetch, or null for "nearest, any type" (the B4
   * empty-queue fall-through the owner ruled: a filter is a PRIORITY OVERRIDE, never an on/off
   * switch — if no spark of the preferred type exists, it still fetches the nearest of any type,
   * so an unattended player never stops earning).
   */
  preferredType: SparkType | null;
}

/**
 * Factory for a freshly-bought gatherer. `pos` is copied (never aliased to the caller's Vec2).
 */
export function makeGatherer(args: {
  id: GathererId;
  ownerPlayerId: PlayerId;
  pos: Vec2;
  spawnedAtTick: number;
}): Gatherer {
  return {
    id: args.id,
    ownerPlayerId: args.ownerPlayerId,
    pos: { x: args.pos.x, y: args.pos.y },
    spawnedAtTick: args.spawnedAtTick,
    state: 'SEEKING',
    targetSparkId: null,
    carriedSparkId: null,
    speedLevel: 0,
    preferredType: null,
  };
}

/** Travel speed in px/tick for a gatherer at `speedLevel` (pure — shared by sim and any preview). */
export function gathererSpeed(speedLevel: number): number {
  const lvl = Math.max(0, Math.min(GATHERER_MAX_SPEED_LEVEL, speedLevel));
  return GATHERER_BASE_SPEED + lvl * GATHERER_SPEED_PER_LEVEL;
}

/**
 * The fixed per-seat KEEP anchor — a deterministic ring around the central spawner. Seat 0 sits
 * to the LEFT of the spawner, matching the P0 avatar start in `makeWorld`; the remaining seats
 * fan evenly around it. This is the single source of truth for BOTH the (render-only) castle box
 * and a bought gatherer's spawn position, so the unit always appears at its owner's keep. Pure +
 * deterministic — a gatherer's spawn pos is hashed host-authoritative state and must be
 * replay-stable across the host and the worker/mirror.
 */
export function castleAnchor(seat: number): Vec2 {
  // ⚠ DIVIDE BY KEEP_RING_SEATS, NOT MAX_PLAYERS. MAX_PLAYERS is 6, but VS-BOTS seats SEVEN
  // (1 human + up to 6 bots — constants.ts documents exactly this, which is why PLAYER_COLORS has a
  // 7th entry). Dividing by 6 makes castleAnchor(6) numerically identical to castleAnchor(0), so in
  // a full bots match the 7th seat's keep lands EXACTLY on the human's and its gatherers spawn
  // inside the human's stockpile. Caught by the S135 end-of-session audit.
  // The divisor must be a CONSTANT, never a live roster size: a gatherer's spawn pos is hashed
  // host-authoritative state, so a seat-count-dependent ring would move every keep (and diverge the
  // hash) the moment a player joins or drops.
  const angle = Math.PI + (seat / KEEP_RING_SEATS) * Math.PI * 2;
  // S138 P2 — was `SPAWNER_RADIUS + 150` (275). Now a named constant at 420 so the keeps sit at the
  // extremities instead of clustered near the quarry (owner playtest: "so that you cant all build at
  // the middle from the start and make a mess of it"). See KEEP_RING_RADIUS for the measured
  // throughput consequence — this nearly doubles the haul.
  const r = KEEP_RING_RADIUS;
  return {
    x: SPAWNER_CENTER_X + Math.cos(angle) * r,
    y: SPAWNER_CENTER_Y + Math.sin(angle) * r,
  };
}

/**
 * S136 P0 — is this canvas-space point inside `seat`'s keep box?
 *
 * Clicking your own keep is what OPENS the castle panel (owner playtest item 2: the automation
 * controls stop being a permanent footer and become a panel that opens on the castle, "because
 * eventually different towers and stuff will have different upgrades and they will pop up when you
 * click on them").
 *
 * Lives HERE, next to `castleAnchor`, deliberately: the anchor is already the single source of
 * truth shared by the renderer and the gatherer spawn position, and KEEP_W/KEEP_H were promoted to
 * constants.ts in the same change, so the hit target is derived from exactly the numbers the box is
 * drawn from. Pure, no Pixi, no world read — so `controls.ts` can call it on the raw pointer path
 * and a unit test can pin it without a renderer.
 *
 * ⚠ Render-only consumer. Selection is NOT world state: it is never serialized, never hashed and
 * never put on the wire (a second player must not see your panel open), so nothing here may be
 * called from a reducer.
 */
export function isPointInKeep(x: number, y: number, seat: number): boolean {
  const { x: cx, y: cy } = castleAnchor(seat);
  return (
    x >= cx - KEEP_W / 2 && x <= cx + KEEP_W / 2 && y >= cy - KEEP_H / 2 && y <= cy + KEEP_H / 2
  );
}
