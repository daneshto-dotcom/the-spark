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

import type { SparkType } from '../constants.ts';
import type { GameEffect } from '../game/effects.ts';
import type { Player } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Spark } from '../game/spark.ts';
import type { SudokuEvent } from './sudoku.ts';
import type { ZoneLayout } from './zones.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Bomb } from './bomb.ts';
import type { Creature } from './creatures/creature.ts';
import type { Hunter } from './hunters/hunter.ts';
import type { Potato } from './potato.ts';
import type { Rainbow } from './rainbow.ts';
import type { Poop, Seagull } from './seagulls/seagull.ts';
import type { CreatureSpawner } from './spawners/spawner.ts';
import type { Defender } from './defenders/defender.ts';
import type { StinkCloud } from './defenders/stinkCloud.ts';
import type { Gatherer } from './gatherers/gatherer.ts';
import type { CastleBank } from './castleBank.ts';
import type { GodlyId, GodlyTriggerEvent } from './godlyRecipes/types.ts';
import type { ComboKey } from '../combos.ts';
import type { BombId, BondId, CreatureId, DefenderId, GathererId, HunterId, PlayerId, PoopId, PotatoId, PrimitiveId, RainbowId, SeagullId, SparkId, SpawnerId, StinkCloudId } from '../types.ts';

/**
 * S15 P2: extended FSM. Solo path TITLE→PLAYING→WIN→POSTGAME→TITLE. 1v1
 * path TITLE→LOBBY→PLAYING→WIN→POSTGAME→TITLE. Tests + back-compat: makeWorld
 * still initializes gameState='PLAYING' (test contract) — main.ts boot path
 * overrides to 'TITLE' after construction.
 */
export type GameState = 'TITLE' | 'LOBBY' | 'PLAYING' | 'WIN' | 'POSTGAME';

/**
 * S147 P1 — the two halves of the tower-defence match cycle (`World.matchPhase`).
 *
 * BUILD — gather and build, sealed behind zone walls (S149), no scoring (R3).
 * FIGHT — walls drop, towers come alive, points tick from live tower complexity (R7/R16).
 *
 * ⚠ A SERIALIZED STRING LITERAL UNION. Adding a third arm later is a wire-visible change a stale
 * peer cannot parse, so it costs a `PROTOCOL_VERSION` bump — the same rule that forced 12→13 when
 * `DefenderState` gained `'WALK'`. Two arms is the whole design (the owner's notes describe exactly
 * two stages), so this should not need to grow.
 */
export type MatchPhase = 'BUILD' | 'FIGHT';

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
  /**
   * S147 P1 — THE MATCH CLOCK. Which half of the tower-defence cycle the match is in.
   *
   * Owner's notes: *"90 sec to gather & build. End of 90 sec 'build' stage you have 'fight' stage."*
   * BUILD = gather, build, sealed and safe. FIGHT = towers come alive and points accrue (R3/R7).
   * The cycle repeats forever; a match starts in a full BUILD so nobody is attacked before they can
   * build anything.
   *
   * ⚠ ORTHOGONAL TO `gameState`, NOT A SUB-STATE OF IT. `gameState` is the app-level
   * TITLE/LOBBY/PLAYING/WIN/POSTGAME machine; `matchPhase` only advances while `gameState` is
   * PLAYING. Keeping them separate is what lets the phase survive a WIN→POSTGAME→PLAYING cycle
   * without the app machine having to know the cycle exists.
   *
   * Hashed + serialized + on the wire (host-authoritative). A client NEVER computes this — it reads
   * it from the snapshot, exactly like `gameState`.
   */
  matchPhase: MatchPhase;
  /**
   * S147 P1 — the ABSOLUTE tick at which the current `matchPhase` ends. Host stamps it; every peer
   * reads it. The HUD countdown is `(phaseEndsAtTick - tick) / PHYSICS_HZ`.
   *
   * ⛔ ABSOLUTE DEADLINE, NOT A COUNTDOWN — and that is a determinism decision, not a style one.
   * A countdown would have to be decremented every tick on every peer (one more mutation to
   * disagree about). An absolute deadline is written once per phase edge and is otherwise read-only,
   * so a promoted successor at a host migration inherits the exact boundary from the mirror with
   * zero recomputation. This is also why the phase edge is safe across the NONET freeze
   * (`main.ts`), which advances `world.tick` while skipping the host tick body entirely: the
   * deadline does not drift because nothing decrements it, and the `>=` comparison absorbs the
   * elapsed gap on the first tick after the trial ends.
   *
   * ⚠ The flip ADVANCES this by exactly `PHASE_DURATION_TICKS` (`phaseEndsAtTick += …`), never
   * `tick + PHASE_DURATION_TICKS`. Re-stamping from the current tick would let every skipped
   * evaluation push all future boundaries later and later. See `runHostTick`.
   */
  phaseEndsAtTick: number;
  /**
   * ⭐ S148 P1 — WHICH BOARD THIS MATCH IS PLAYED ON. `PITCH_2P` (one vertical split, goalmouth
   * castles) or `QUADRANTS_4P` (a cross split, corner castles). Decided ONCE at match start from
   * the seat count (`layoutForSeatCount`) and never touched again while a match runs.
   *
   * ⚠ THIS IS THE MOST LOAD-BEARING GEOMETRY FIELD IN THE WORLD, WHICH IS WHY IT IS HASHED.
   * `zoneCastleAnchor` derives every keep position from it, and a gatherer's spawn position derives
   * from the keep — so a peer that disagreed about the layout would spawn its haulers somewhere
   * else and diverge on the very first purchase. It is also what `canBuildAt` reads, so a
   * disagreement would mean the host and the client's drag ghost enforcing different borders.
   *
   * ⚠ WHY A WORLD FIELD RATHER THAN A DERIVATION FROM `players.size`. A live roster size changes
   * when somebody joins or drops mid-match; deriving the board from it would move every castle
   * (and every gatherer spawn) at that instant. Stamping it once makes the board immutable for the
   * life of the match, which is also what lets a promoted successor inherit it from the mirror with
   * no recomputation — the same argument as `phaseEndsAtTick` above.
   *
   * Host-authoritative. A client NEVER computes this; it reads it from the snapshot.
   */
  layout: ZoneLayout;
  /** Monotonic counter for primitive IDs. */
  nextPrimitiveId: number;
  /** Monotonic counter for bond IDs. */
  nextBondId: number;
  /**
   * S146 P2 — DESCENDING NEGATIVE allocator for sparks MINTED BY A REDUCER (`PULL_FROM_BANK` taking
   * a shape out of the counted castle inventory onto the porch). −1, −2, −3 …
   *
   * ⛔ THE SIGN IS THE WHOLE SAFETY ARGUMENT. The `Spawner` owns spark-id minting through its private
   * ascending `nextId` (spawner.ts) and no reducer can reach it. Rather than have two allocators
   * agree to stay out of each other's range — an agreement every future edit could break silently —
   * this one runs the other way down the number line. A collision is not unlikely here; it is
   * arithmetically impossible.
   *
   * Host-only, exactly like `nextPrimitiveId`/`nextBondId`: stripped from `NetSnapshot` and rebuilt
   * by `rebuildAuthorityAllocators` at a migration takeover (scan `freeSparks` for the MINIMUM id).
   */
  nextPulledSparkId: number;
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
   * ⭐ S158 P5 (CF-S157-d) — is the CURRENT cinematic the first time this godly has fired this
   * match? Owner: *"voltkin cinematic SHOULD be once per game for the first person to have built
   * him. but the voltkin spawn himself should be generated every time someone builds his tower."*
   *
   * Set by `applyGodlyTrigger` from `godlyFiredThisMatch` BEFORE it records the id — which is the
   * only moment the answer is still available, and the reason this is a field rather than something
   * the renderer re-derives. Cleared on GODLY_COMPLETE / GODLY_ABORT.
   *
   * PRESENTATION-ONLY, and deliberately so: it decides whether the OVERLAY is drawn, never whether
   * the cinematic runs. The timing, the queue and `pendingCreatureSpawn` are untouched, so a repeat
   * summons its Voltkin at exactly the same tick as the first one did.
   */
  cinematicIsFirstShowing: boolean;
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
   * ⭐ S155 N1 — TRANSIENT, ONE-TICK deferral set for creatures that took a lethal blow during the
   * host tick's strike batch. `null` everywhere except inside that batch, which is what keeps every
   * other damage path (raid, laser, potato blast) on the unchanged immediate-delete behaviour.
   *
   * ⛔ WHY IT EXISTS. Owner, after a cross-network match: *"player 2 had a way bigger army then me but
   * theyt couldnt even destroy one of my goblins"* — and, on being told they had engaged, *"both
   * players goblins did appear to be fighting each other but only Player one spawn actuall managed to
   * kill"*. Reproduced and isolated: the deciding variable is neither the seat nor the creature id, it
   * is `creatures` ITERATION ORDER. Whoever the loop reached first killed the other outright and took
   * ZERO damage, because the loser was deleted mid-loop and never reached its own fire tick. Creatures
   * are stored in SPAWN order, so whoever spawned first won every exchange — which is precisely why it
   * looked like only seat 0's units had working stats.
   *
   * ⚠ NEVER SERIALIZED AND NEVER HASHED — `'acknowledged'` in FIELD_COVERAGE. It cannot survive a tick
   * boundary: `runHostTick` opens it before the creature loop and sweeps it immediately after, so no
   * snapshot, save or hash ever observes a non-null value.
   */
  pendingCreatureDeaths: Set<CreatureId> | null;
  /**
   * S25 P0 — monotonic counter for creature IDs. Host-only mint authority.
   */
  nextCreatureId: number;
  /**
   * S100 P1 (TD Phase 1a) — host-authoritative per-structure creature spawners. A
   * spawner-structure (e.g. a closed pentagram) "comes alive": it emits a persistent
   * 'chewer' creature on a tick-deterministic cadence (host-only poll in main.ts) and
   * is re-validated each poll against its anchor primitive + recipe shape (broken
   * shape → REMOVE_SPAWNER → income+swarm STOP instantly). Mirrors the
   * creatures/hunters Map<Id,Entity> + nextId convention. Additive-optional
   * `creatureSpawners[]` on the wire (creature/hunter precedent), emitted only when
   * non-empty; the host save path round-trips cadence state, the wire strips it.
   * Cleared on teardown (teardownSpawners — all four teardown sites).
   */
  creatureSpawners: Map<SpawnerId, CreatureSpawner>;
  /** S100 P1 — monotonic counter for spawner IDs. Host-only mint authority. */
  nextSpawnerId: number;
  /**
   * S103 P2 — host-authoritative generic DEFENDERS (laser turret / HELGA princess). A defender
   * recipe (geometry that "comes alive") mints a stationary Defender that auto-attacks the nearest
   * enemy creature in range via the unified `damageCreature` path. Mirrors the creatureSpawners
   * Map<Id,Entity> + nextId convention; replicated to clients via an additive-optional `defenders[]`
   * NetSnapshot field (ALL render-relevant fields synced — beam/windup VFX derive from them).
   * Re-validated each poll (broken recipe → REMOVE_DEFENDER). Cleared on teardown (all four sites).
   */
  defenders: Map<DefenderId, Defender>;
  /** S103 P2 — monotonic counter for defender IDs. Host-only mint authority. */
  nextDefenderId: number;
  /**
   * V6-1.1 — player-owned "gatherer" hauler units, bought from the placeholder keep for
   * GATHERER_PRICE victory points. Host-authoritative, serialized (additive-optional `gatherers[]`
   * so a bought unit survives host migration / save-load / worker resume). Static in V6-1.1
   * (parked at the keep; the shapeshifting look is renderer-only, NOT world state); roaming/hauling
   * + the bank are V6-1.2/1.3. Registered in stateHashFull FIELD_COVERAGE (NOT the narrow hash, R1).
   * Cleared on teardown (all five sites). NEVER named `Worker` (the Web Worker owns the World).
   */
  gatherers: Map<GathererId, Gatherer>;
  /** V6-1.1 — monotonic counter for gatherer IDs. Host-only mint authority. */
  nextGathererId: number;
  /**
   * S136 P1 (V6-1.3) — THE CASTLE BANK: per-seat stored shapes, held INSIDE the castle.
   *
   * Owner playtest item 4 ("he should just store them within the castle and not outside"). This
   * REPLACES V6-1.2's stockpile of `escrow:'banked'` free sparks parked in world space, which
   * produced both the stacking bug and the grab-flings-the-other bug (see castleBank.ts for the
   * full mechanism of each). A stored shape is now a TYPE in a list — no position, no radius, no
   * collision, no TTL — so neither defect has a surface to occur on.
   *
   * ⭐ S146 P2 — UNCAPPED, AND COUNTED BY TYPE. Owner ruling: *"giving the castle limitless primitive
   * place in the inventory... just hold the 6 shape parts and show how many you have of each"*. This
   * is a fixed 6-entry tally indexed by `SparkType`, not a list of entities and not a `Map` (see the
   * castleBank.ts docblock for why the fixed array is a determinism requirement, not a style call).
   * `CASTLE_BANK_CAP` is GONE — do not reintroduce a cap here without a new owner ruling.
   *
   * Host-authoritative and serialized (additive-optional, so a pre-S136 save loads with empty
   * inventories); registered in stateHashFull FIELD_COVERAGE and folded into workerSim's
   * structuralSignature. Cleared on teardown.
   */
  castleBanks: Map<PlayerId, CastleBank>;
  /**
   * S141 P2 (V6-1.4) — THE GATHERER ORDER QUEUE. Owner ruling B4, ruled in full in S134 and never
   * built until now.
   *
   * An ORDERED, CONSUMED production queue of PRIMITIVE TYPES, in the Red Alert / C&C idiom the owner
   * named directly: *"there should be a queue that you just select what the gatherer should target
   * next … you're not selecting whole recipes but clicking one by one on the shapes (primitives) that
   * they collect in a queue. like in red alert you click on a type of a soldier like x8 times, it
   * will be built 8 times."*
   *
   * ⛔ IT IS NOT A FILTER, AND THE RULING SAYS SO IN BOLD. A filter is a standing rule ("always prefer
   * squares"); this is a list that is consumed. The distinction is load-bearing — the first recording
   * of B4 said "exact type filters" and the owner corrected it. Note that a per-gatherer filter
   * (`Gatherer.preferredType`) DID ship in V6-1.2 and is exactly the mechanic the ruling forbids; it
   * is retained as a FALLBACK rather than deleted (B6 additive-only), and the queue takes precedence.
   *
   * ONE QUEUE PER PLAYER, shared by every gatherer that player owns — not per-unit, because Phase 1
   * deliberately has no unit-selection UI. Leftmost is next; each DELIVERY of a matching type pops one.
   * An EMPTY queue falls through to nearest-of-any-type, so it is a PRIORITY OVERRIDE and never an
   * on/off switch: an unattended player keeps earning.
   *
   * Host-authoritative and SERIALIZED (additive-optional, so a pre-S141 save loads with no queues);
   * registered in stateHashFull FIELD_COVERAGE. Cleared on teardown with the rest of the gatherer
   * economy — a queue is an instruction to units that no longer exist.
   */
  gathererOrders: Map<PlayerId, SparkType[]>;
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
  /**
   * ⭐ S158 P6 (CF-S157-b) — LANDED STINK BAGS. Owner: a thrown bag should *land and stink over
   * time*, not vanish in the frame it arrives. A cloud is the tower's own aura moved to where the bag
   * fell and given an end (see `defenders/stinkCloud.ts`); the impact splash is unchanged, so this is
   * purely what the bag LEAVES BEHIND.
   *
   * Host-authoritative and SERIALIZED — a client that could not see them would draw an empty patch of
   * ground its units are dying on, which is the exact class of blind spot S156 P3 closed for
   * `defenders`. Rides the additive-optional `stinkClouds[]` in NetSnapshot (PROTOCOL 34->35).
   * Self-limiting: one lifetime is one throw interval, so a tower holds one or two at a time.
   */
  stinkClouds: Map<StinkCloudId, StinkCloud>;
  /** S158 P6 — monotonic cloud id counter (host-only mint authority). */
  nextStinkCloudId: number;
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
    /**
     * S125 P2 (F9) — count of remote INTENTs the host DROPPED because the
     * sender's per-peer token bucket (net/intentRateLimiter.ts) was empty —
     * a modified client flooding the authoritative dispatch. Host-local
     * observability only (never serialized); the dropped intent's type is
     * logged alongside for forensics/telemetry.
     */
    intentThrottled: number;
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
  /**
   * ⭐ S157 B8 (owner) — **THE WAVE NUMBER.** One wave = one BUILD + one FIGHT turn.
   *
   * Owner: *"each build-fight turn should be considered as WAVE and there should be a place on the
   * top near the timer counting how many waves has it been. Also every wave the spawned
   * primitives/shapes should spawn faster and faster (0.2 each wave). so wave 1 is normal. wave 2 is
   * 1.2. wave 3 is 1.4x faster. wave 4 is 1.6 times faster etc..."*
   *
   * ⚠ IT CANNOT BE DERIVED, WHICH IS WHY IT IS STORED. The obvious shortcut is `tick / phase length`,
   * and it is wrong: `applyStartGame` does NOT reset `world.tick` (it stamps
   * `phaseEndsAtTick = world.tick + PHASE_DURATION_TICKS` and says so), so a second match in the same
   * page session would start on whatever wave the arithmetic happened to produce.
   *
   * Starts at 1 — the opening BUILD is wave 1, not wave 0 — and increments on each entry INTO BUILD,
   * i.e. once per completed turn. Serialized + hashed so the host, a joiner and the `?worker=1`
   * mirror all agree; a disagreement here would desync the SPAWN RATE, not just a HUD number.
   */
  waveNumber: number;
  /**
   * S97 P5 — per-GodlyId once-per-match guard. Each godly TYPE (voltkin, …) fires at most once
   * per match — "as many godlies as possible but only 1 of each type" (user). Replaces the old
   * per-player 60s cooldown gate (which cross-blocked DIFFERENT types for 60s). Independent of
   * sudokuFiredThisMatch, so a NONET never blocks a godly (and vice-versa). Host-authoritative
   * (the matcher is host-only); serialized additive-optional for host-migration/replay parity.
   * Reset on START_GAME / RETURN_TO_TITLE.
   */
  godlyFiredThisMatch: Set<GodlyId>;
}
