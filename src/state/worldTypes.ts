/**
 * SPARK — world STATE-SHAPE types (S61 P3 §XV de-hypertrophy).
 *
 * The World interface + its GameState/GameMode enums were split out of world.ts
 * (which keeps the dispatch seam + makeWorld/dispatch/requirePlayer runtime).
 * This module is PURE TYPES — it emits no runtime JS. world.ts re-exports these
 * so existing consumers keep importing them from './world.ts' unchanged.
 *
 * All imports are type-only DOMAIN types (no reducer-action types), so there is
 * no cycle: worldTypes -> leaf domain types only.
 */

import type { GameEffect } from '../game/effects.ts';
import type { Player } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Spark } from '../game/spark.ts';
import type { SudokuEvent } from './sudoku.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Bomb } from './bomb.ts';
import type { Creature } from './creatures/creature.ts';
import type { Hunter } from './hunters/hunter.ts';
import type { Potato } from './potato.ts';
import type { Rainbow } from './rainbow.ts';
import type { Poop, Seagull } from './seagulls/seagull.ts';
import type { GodlyTriggerEvent } from './godlyRecipes/types.ts';
import type { ComboKey } from '../combos.ts';
import type { BombId, BondId, CreatureId, HunterId, PlayerId, PoopId, PotatoId, PrimitiveId, RainbowId, SeagullId, SparkId } from '../types.ts';

/**
 * S15 P2: extended FSM. Solo path TITLE→PLAYING→WIN→POSTGAME→TITLE. 1v1
 * path TITLE→LOBBY→PLAYING→WIN→POSTGAME→TITLE. Tests + back-compat: makeWorld
 * still initializes gameState='PLAYING' (test contract) — main.ts boot path
 * overrides to 'TITLE' after construction.
 */
export type GameState = 'TITLE' | 'LOBBY' | 'PLAYING' | 'WIN' | 'POSTGAME';

/**
 * S87 — 'bots' added: VS-BOTS local match (1 human host + 1..MAX_BOTS AI
 * seats). DELIBERATELY non-solo so isNetworked() returns true and the mode
 * inherits the full FFA rule set with zero special-casing: fog of war,
 * territory hard-blocks, SHRINK_TERRITORY, remote-origin reach validation
 * (bot playerIds ≠ localPlayerId, so bots are reach/zone/territory-validated
 * like remote humans), scoreByPlayer WIN attribution. There is NO transport
 * (netTransport stays null — every consumer is null-guarded, audited S87
 * Council F3); isHost=true and the world simulates locally at 60Hz.
 * The internal '1v1' value is KEPT for the networked mode (wire literal +
 * test surface); only UI strings say "Multiplayer".
 */
export type GameMode = 'solo' | '1v1' | 'bots';

export interface World {
  tick: number;
  rngSeed: number;
  freeSparks: Map<SparkId, Spark>;
  primitives: Map<PrimitiveId, Primitive>;
  bonds: Map<BondId, Bond>;
  players: Map<PlayerId, Player>;
  gameState: GameState;
  /** Monotonic counter for primitive IDs. */
  nextPrimitiveId: number;
  /** Monotonic counter for bond IDs. */
  nextBondId: number;
  /** Telemetry / debug — not persisted. */
  lastWinnerId: PlayerId | null;
  effects: GameEffect[];
  /**
   * S9 P3 / S15 P2: combo-weighted progress. In solo, equals the lone
   * player's progress. In 1v1, equals max(scoreByPlayer.values()) — i.e.
   * the leader's score, which drives the WIN check. Per-player scores are
   * tracked in `scoreByPlayer` for 1v1 HUD.
   */
  scoreProgress: number;
  /**
   * S15 P2 — per-player score map. In solo: { 0 → scoreProgress }. In 1v1:
   * both players' scores tracked independently; HUD reads this directly;
   * win = first player to reach PHASE_1_WIN_SCORE.
   */
  scoreByPlayer: Map<PlayerId, number>;
  /**
   * S10 P5: debug toggle for structure cinematics.
   */
  cinematicsEnabled: boolean;
  /**
   * S15 P2 — game mode. Solo (Phase 1 preserved) vs 1v1 (networked). Set
   * by START_GAME action when transitioning from TITLE / LOBBY → PLAYING.
   * makeWorld defaults to 'solo' for test back-compat.
   */
  gameMode: GameMode;
  /**
   * S15 P2 — host vs client flag for 1v1. Host runs the authoritative sim;
   * client renders interpolated snapshots and sends Intent envelopes. In
   * solo, isHost is true (the local player IS the authority).
   */
  isHost: boolean;
  /**
   * S22 P3 — currently-playing godly cinematic owner. Null when no cinematic
   * is active. Single-slot serialization (PRIME-AUDIT Δ2): concurrent
   * GODLY_TRIGGER actions queue into pendingCinematics and fire one at a
   * time so cinematics never overlap visually.
   */
  activeCinematicPlayerId: PlayerId | null;
  /**
   * S22 P4 — currently-playing godly cinematic event (godlyId + targetPos
   * + targetComponentPrimitiveIds + triggerTick). Used by the renderer to
   * pick the right recipe for cutsceneOverlay.play(). Cleared on
   * GODLY_COMPLETE / GODLY_ABORT.
   */
  currentCinematicEvent: GodlyTriggerEvent | null;
  /**
   * S22 P3 — queue of pending godly triggers behind the active one. Host
   * processes one at a time. main.ts setTimeout (wall-clock cinematicMs +
   * sustainedEffectMs) shifts the next event and re-dispatches.
   */
  pendingCinematics: GodlyTriggerEvent[];
  /**
   * S25 P0 — autonomous creature actors (Voltkin Phase 2A). Host-authoritative;
   * spawned at cinematic handoff (T+cinematicMs), auto-removed at despawnAtTick
   * (8s lifetime per blueprint Q5). S28 P0 mirrors host→client via NetSnapshot
   * v2 (additive-optional `creatures?` field on WorldSnapshot — Council Q1
   * UNANIMOUS A S15 P2 pattern). Cleared by GODLY_ABORT cascade.
   */
  creatures: Map<CreatureId, Creature>;
  /**
   * S25 P0 — monotonic counter for creature IDs. Host-only mint authority.
   */
  nextCreatureId: number;
  /**
   * S28 P0 — tick-deterministic pending-spawn schedule (Council Q2 UNANIMOUS A
   * single-slot). Replaces S25's wall-clock `setTimeout(handoff, cinematicMs)`
   * in cutsceneOverlay.ts (S25 reflexion: never mutate world from wall-clock
   * setTimeout — replay determinism breaks). Set by main.ts startCinematicIfNeeded
   * after recipe lookup (host-only); polled in physics tick loop; dispatches
   * SPAWN_CREATURE + clears self when `world.tick >= fireAtTick`. GODLY_ABORT
   * MUST clear this (PRIME-AUDIT Δ5 enforced — otherwise zombie spawn fires
   * after peer-drop abort, violating blueprint Edge Case #2).
   */
  pendingCreatureSpawn: { fireAtTick: number; event: GodlyTriggerEvent } | null;
  /**
   * S71 P1 — host-authoritative pickup-bomb hazards living in the spawn zone.
   * Spawned by the spawner cadence (host-only); grab = INSTANT self-sever
   * (bombLifecycle.applyTriggerBomb); auto-removed at dissipateAtTick if un-grabbed.
   * Additive-optional `bombs[]` in NetSnapshot (creature precedent) so clients
   * render them; clients never simulate (host-authoritative). Cleared on teardown.
   */
  bombs: Map<BombId, Bomb>;
  /** S71 P1 — monotonic bomb id counter (host-only mint authority). */
  nextBombId: number;
  /**
   * S72 P2 — host-authoritative Pac-Man hunters (SEPARATE from Voltkin creatures;
   * §13.15 LOCKED + untouched per Council Fork C). At most one lives at a time
   * (once-per-game). Spawned by the main.ts 75%-score trigger; chases
   * world.players[targetPlayerId].avatarPos; benches the victim on contact.
   * Additive-optional `hunters[]` in NetSnapshot so clients render the mirror
   * (they never simulate). Cleared on teardown (WIN / RETURN_TO_TITLE).
   */
  hunters: Map<HunterId, Hunter>;
  /** S72 P2 — monotonic hunter id counter (host-only mint authority). */
  nextHunterId: number;
  /**
   * S72 P2 — once-per-game guard. Set true by applySpawnHunter so the trigger
   * fires exactly once; reset on teardown. Serialized additive-optional so a host
   * save/load mid-game does not re-spawn a second hunter.
   */
  hunterSpawned: boolean;
  /**
   * S72 P3 — host-authoritative potato bombs (SEPARATE Map; Council Fork D UNANIMOUS,
   * NOT the bombs Map — keeps each feature simple). Carryable (carry-slot exclusive with
   * a spark); detonates on a from-SPAWN fuse with a deterministic position-based radial
   * AoE. Additive-optional `potatoes[]` in NetSnapshot so clients render the mirror;
   * cleared on teardown (WIN / RETURN_TO_TITLE / START_GAME).
   */
  potatoes: Map<PotatoId, Potato>;
  /** S72 P3 — monotonic potato id counter (host-only mint authority). */
  nextPotatoId: number;
  /**
   * S75 P3 — host-authoritative rainbow color-shuffle pickups (SEPARATE Map, mirroring
   * bombs/potatoes/hunters). At most one lives at a time. Spawned by the spawner cadence
   * (RARER than bomb/potato); clicking it (TRIGGER_RAINBOW) runs a deterministic global colour
   * derangement; un-clicked -> DISSIPATE at its TTL. Additive-optional `rainbows[]` in
   * NetSnapshot so clients render the mirror (they never simulate). Cleared on teardown.
   */
  rainbows: Map<RainbowId, Rainbow>;
  /** S75 P3 — monotonic rainbow id counter (host-only mint authority). */
  nextRainbowId: number;
  /**
   * S84 P2 — tick of the most recent rainbow colour-switch (host stamps in
   * applyTriggerRainbow). Drives the flyover celebration render window +
   * yell audio on EVERY peer: rides NetSnapshot additive-optional (a one-shot
   * GameEffect would be lost ~5/6 of the time — the 10Hz snapshot samples
   * world.effects live while effectsRenderer wipes it per frame; Council S84
   * A.0 probe). A second switch overwrites the tick = restart semantics; a
   * late joiner sees the remaining window. Cleared on START_GAME +
   * RETURN_TO_TITLE with the other hazard state.
   */
  rainbowSwitchTick?: number;
  /**
   * S88 G3a — in-match combo DISCOVERY (the magic set). Global per-match: the host
   * adds a combo's ComboKey the FIRST time it forms in a match (comboDiscovery.ts,
   * driven from placePrimitive — covers PLACE_PRIMITIVE + the PLACE_FROM_FREE
   * delegate). `discoveredCombos.size` drives the "Combos N/14" HUD counter.
   * NON-optional (always a Set, like fouledPrimitives): initialised empty in
   * makeWorld, serialised additive-optional (SORTED string[]) only when non-empty,
   * cleared on START_GAME / RETURN_TO_TITLE.
   */
  discoveredCombos: Set<ComboKey>;
  /**
   * S88 G3a — tick of the most recent NEW-combo discovery (host stamps =
   * world.tick). Drives the "NEW COMBO — <name>!" toast window on EVERY peer,
   * keyed purely off (world.tick - comboToastTick) — the rainbowSwitchTick
   * pattern (additive-optional, NO protocol bump; overwrite = restart; a late
   * joiner sees the remaining window). Cleared with discoveredCombos.
   */
  comboToastTick?: number;
  /**
   * S88 G3a — resultName(s) discovered AT comboToastTick, in deterministic
   * bond-id order. An array (not a scalar) so a single placement that weaves
   * >1 NEW magic combo on one tick toasts ALL of them (PRIME-AUDIT R1 — no
   * silent drop). Host-authoritative; the client renders this synced array
   * verbatim (never recomputes) ⇒ replay-deterministic + 1v1-mirror-consistent.
   */
  lastDiscoveredComboNames?: string[];
  /**
   * S77 P3 — host-authoritative seagulls (SEPARATE Map, mirroring the other hazards). A
   * RECURRING hazard: the spawner cadence mints one ~every 2 min (gated SEAGULL_MAX_ACTIVE).
   * Flies across the top dropping poop. Additive-optional `seagulls[]` in NetSnapshot so
   * clients render the mirror; cleared on teardown (WIN / RETURN_TO_TITLE / START_GAME).
   */
  seagulls: Map<SeagullId, Seagull>;
  /** S77 P3 — monotonic seagull id counter (host-only mint authority). */
  nextSeagullId: number;
  /**
   * S77 P3 — host-authoritative poop projectiles dropped by seagulls. FALLING poops check
   * collision vs primitives (foul → world.fouledPrimitives) + free sparks (poopy slow); a
   * SPLAT_STRUCTURE poop persists until cleaned, a SPLAT_GROUND poop until its TTL.
   * Additive-optional `poops[]` in NetSnapshot. Cleared on teardown.
   */
  poops: Map<PoopId, Poop>;
  /** S77 P3 — monotonic poop id counter (host-only mint authority). */
  nextPoopId: number;
  /**
   * S77 P3 — primitives currently FOULED by seagull poop. tickScoring zeroes the income of
   * any player owning a fouled primitive ("the whole structure stops generating income" — a
   * poop fouls the hit prim's whole connected component). HOST-COMPUTED but SERIALIZED: it
   * rides WorldSnapshot AND NetSnapshot (save.ts — additive-optional, emitted only when
   * non-empty), so a host save/load resumes the income halt exactly and the client renders
   * the fouled-structure tint (structureRenderer, S79 P2) without recomputing income.
   * Maintained invariant (S79 P3): the set ALWAYS equals the union of the current connected
   * components of live SPLAT_STRUCTURE poop anchors — CLEAN_POOP unfoels its component, and
   * reconcileFouledPrimitives re-derives the set after destroy-path topology changes
   * (sever/bomb cascade + potato AoE). Cleared on teardown.
   */
  fouledPrimitives: Set<PrimitiveId>;
  /**
   * S42 — host-side counter of "shared-resource race rejected" events.
   * Increments when applyPickupSpark or placePrimitive silently no-ops
   * because the targeted spark/primitive was claimed by the other player
   * first under real-time race. Non-serialized (test-observable; per-session
   * informational). Replaces the prior throw-on-race pattern (S20 invariant)
   * which would crash dispatch under legitimate concurrent intents.
   * Council R1+R2 Battle Ledger row 1 (CONVERGENT Grok-C1 + Gemini-#1) +
   * row 5 (Gemini-#3 R2-sharpened — shared-resource vs player-owned).
   */
  /**
   * S48 P3 (Sym A diagnostic gap fix) — extended with rejectReasons
   * sub-bucket so the joiner-side debug overlay can surface WHICH path
   * silently rejected an intent. `raceRejects` remains the aggregate
   * counter (back-compat with session15.test.ts + sparkLifecycle.test.ts
   * assertions); rejectReasons is purely additive and incremented in
   * parallel with `raceRejects` at each reject site:
   *   - pickupPosShape: PICKUP_SPARK pos field malformed (wire corruption /
   *     pre-S46 peer / TS-bypass via JSON.parse)
   *   - pickupSparkNotFree: target spark already Carried by other player
   *     under real-time race (S42 shared-resource race)
   *   - pickupReachFail: remote carrier's pos failed isValidPickupPos
   *     (canvas bounds OR REASONABLE_PICKUP_REACH plausibility from
   *     avatarPos)
   *   - pickupPoopedTooFar: carrier is poop-debuffed and its avatar has not
   *     yet arrived within POOP_PICKUP_ARRIVAL_RADIUS of the spark (S84 P1
   *     — the cursor outruns the 7px/tick cruiser chase; pickup waits for
   *     the avatar)
   *   - placeTargetMissing: PLACE_PRIMITIVE references a primitive id that
   *     no longer exists on host (race: host severed it between joiner
   *     intent and host application)
   *   - actorBenched: intent rejected by the S86 P3 central dispatch-entry
   *     bench gate — the actor was benched (eaten / potato-bench) and the
   *     action type is 'deny' in BENCH_INTENT_POLICY (benchGate.ts)
   * Surfaced in debugOverlay (?debug=1) so 2-peer smoke tests can pinpoint
   * the rejection path in real time.
   */
  diagnostics: {
    raceRejects: number;
    rejectReasons: {
      pickupPosShape: number;
      pickupSparkNotFree: number;
      pickupReachFail: number;
      pickupPoopedTooFar: number;
      placeTargetMissing: number;
      actorBenched: number;
    };
    /**
     * S49 P1 (Sym F) — count of PLACE_PRIMITIVE attempts silently rejected
     * by the host territorial hard-block (isInsideEnemyTerritory returned
     * true). Carry preserved on each reject. Surfaced in debugOverlay.
     */
    territoryBlockRejects: number;
  };
  /**
   * S42 — local player id (non-serialized convention; client only mutates
   * its own copy at join time). Default asPlayerId(0) covers solo + 1v1
   * host. main.ts onJoinAttempt sets to asPlayerId(1) for the client peer.
   * HUD reads this to render the LOCAL player's energy gauge in 1v1 (was
   * previously reading world.currentPlayerId which only made sense in the
   * removed turn-based model). Replaces Grok-C3 + Gemini-validated R2
   * concern about HUD signature-threading.
   */
  localPlayerId: PlayerId;
  /**
   * S87 — seats occupied by AI bots in 'bots' mode (empty otherwise). SIM
   * STATE, not orchestration: renderers key the B{n} nameplate / leaderboard
   * rows / win-banner label off it, and a DEV save must restore it (additive-
   * optional in WorldSnapshot). The bot CONTROLLERS (decision state) live in
   * the lazily-loaded BotManager (main.ts orchestration), mirroring the
   * spawner split: identity in world, behavior in orchestration. Cleared on
   * START_GAME (refilled from the action) and RETURN_TO_TITLE.
   */
  botSeats: Set<PlayerId>;
  /**
   * S93 — NONET event. Non-null while a 9-square Sudoku trial is active (the duel FREEZES
   * for ALL players until it resolves). Host-authoritative: host mints the seed + drives the
   * lifecycle (start / resolve / timeout); the seed rides NetSnapshot and every client
   * regenerates the identical puzzle (mulberry32) — only seed + solvedBy + resolvedTick cross
   * the wire, never the grid. Cleared on resolve-window expiry + START_GAME / RETURN_TO_TITLE.
   */
  sudoku: SudokuEvent | null;
  /**
   * S93 — once-per-match guard (mirror of hunterSpawned): the NONET trial fires at most once
   * per match. Reset on START_GAME / RETURN_TO_TITLE.
   */
  sudokuFiredThisMatch: boolean;
}
