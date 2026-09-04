/**
 * SPARK — game-mode dispatch handlers + per-player scoring, extracted
 * from world.ts (S16 P0, S15 § XV carry-forward).
 *
 * S16 P0 — mechanical extraction (zero behavior change) per § XV soft LOC
 * charter compliance. The 3 dispatch case bodies for the FSM-extension
 * actions (START_GAME, RETURN_TO_TITLE, UPDATE_AVATAR_POS) plus the
 * addScore per-player score helper all live here now; world.ts's
 * `dispatch` switch delegates to the exported `apply*` functions.
 *
 * S42 — END_TURN action + applyEndTurn helper DELETED. The 1v1 mode was
 * incorrectly shipped as turn-based hotseat in S15 P2 (commit add497f)
 * contradicting SPARK_Blueprint.md:3,36-56 mandate of real-time
 * simultaneous play. currentPlayerId resets in applyStartGame +
 * applyReturnToTitle also removed (field deleted from World interface).
 *
 * requirePlayer remains in world.ts (pre-existing infrastructure shared by
 * placePrimitive.ts and other state mutators).
 */

import {
  GATHERER_DEPOSIT_OFFSET_Y,
  PHASE_DURATION_TICKS,
  PLAYER_COLORS,
  POOP_CRUISER_MAX_SPEED,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_KILL_REWARD,
  SPAWNER_RADIUS,
  STARTING_VICTORY_POINTS,
} from '../constants.ts';
import { makeIdlePlayer, type Player } from '../game/player.ts';
import { defaultRaceForSeat, type RaceId } from './races.ts';
import { isEliminated } from './elimination.ts';
import { castleAnchor, makeGatherer } from './gatherers/gatherer.ts';
import { layoutForSeatCount } from './zones.ts';
import { asGathererId, asPlayerId, type PlayerId, type Vec2 } from '../types.ts';
import type { GameMode, World } from './world.ts';
import type { CreatureSpawner } from './spawners/spawner.ts';

import { CASTLE_MAX_HP } from '../constants.ts';
/* ────────────────────────── Action types ───────────────────────────── */

export type StartGameAction = {
  readonly type: 'START_GAME';
  readonly mode: GameMode;
  readonly isHost: boolean;
  // S62 — N-player seat roster (ordered by seat). Present for networked starts;
  // omitted for solo and for legacy 2-player test dispatches (which fall back to
  // the historical seat-P1-at-right path). State only needs seat+color; the wire
  // RosterEntry's peerId is consumed net-side (client self-identification).
  // ⭐ W1-A (S160) — `raceId` is OPTIONAL here but REQUIRED on `Player`. Absence means "this caller
  // did not choose", which is what keeps the ~10 test dispatch sites and solo/vs-bots compiling.
  readonly roster?: readonly {
    readonly seat: number;
    readonly color: number;
    readonly raceId?: RaceId;
  }[];
  // S87 — seats driven by AI bots (mode 'bots' only; subset of roster seats,
  // never seat 0). Host-local action — START_GAME is not a client intent and
  // the StartGameMsg wire envelope is unrelated, so no protocol surface.
  readonly botSeats?: readonly number[];
};

export type ReturnToTitleAction = {
  readonly type: 'RETURN_TO_TITLE';
};

export type UpdateAvatarPosAction = {
  readonly type: 'UPDATE_AVATAR_POS';
  readonly playerId: PlayerId;
  readonly pos: Vec2;
};

/**
 * S82 P4(c) — HOST-INTERNAL: bench a player whose transport peer dropped mid-game
 * (no more ghost avatars). Dispatched by the main.ts absence sweep EVERY tick while
 * the peer stays absent (rolling re-stamp), so the bench self-heals ≤ untilTick-now
 * after a rejoin with no unbench action. NOT a client intent — the host INTENT
 * allowlist (net/protocol.ts CLIENT_INTENT_TYPES) drops it from the wire.
 */
export type BenchOfflinePlayerAction = {
  readonly type: 'BENCH_OFFLINE_PLAYER';
  readonly playerId: PlayerId;
  readonly untilTick: number;
};

export function applyBenchOfflinePlayer(world: World, action: BenchOfflinePlayerAction): World {
  const player = world.players.get(action.playerId);
  if (player === undefined) return world;
  // Never SHORTEN an existing bench (a hunter-eaten player who also drops keeps the
  // longer hunter bench; the rolling re-stamp only extends past rejoin-lag).
  if (player.benchedUntilTick === undefined || action.untilTick > player.benchedUntilTick) {
    player.benchedUntilTick = action.untilTick;
  }
  return world;
}

/* ─────────────────────── N-player helpers (S62) ─────────────────────── */

/**
 * S62 — is this a networked multiplayer match (2..MAX_PLAYERS, FFA)? True for
 * any non-solo mode. Replaces the ~17 scattered `gameMode === '1v1'` checks that
 * all meant "are we networked"; makes the count-agnostic intent explicit and
 * future-proof (a new mode value is networked by default).
 *
 * ⚠ S129 correction: the old tail of this docblock read "Behavior-identical today (GameMode is
 * only 'solo' | '1v1')", which has been false since S87 added 'bots' (`worldTypes.ts:51`). It
 * matters because this predicate gates the score LEADERBOARD and its numeric `N/1500` readout in
 * `render/ui.ts` — and 'bots' being networked-by-default is exactly why vs-bots, the primary
 * mode, already shows the full HUD. Pure solo is the only mode that does not, which is what
 * V6-0.2 addresses.
 */
export function isNetworked(world: World): boolean {
  return world.gameMode !== 'solo';
}

/**
 * S62 — deterministic per-seat spawn on the spawner rim. Pure fn of (seat,total):
 * seat 0 sits at angle π (left — reproduces the pre-S62 P0 position) and the rest
 * distribute evenly around the central spawner so every player is equidistant
 * from the contested spawn (FFA-fair). Rounded to integer pixels so N=2 reproduces
 * the historical (670,540)/(1250,540) exactly and every client computes identical
 * positions from roster.length (cross-client determinism — no float drift).
 */
export function radialSpawnPos(seat: number, total: number): Vec2 {
  const angle = Math.PI + (seat / Math.max(1, total)) * 2 * Math.PI;
  const r = SPAWNER_RADIUS + 40;
  return {
    x: Math.round(SPAWNER_CENTER_X + r * Math.cos(angle)),
    y: Math.round(SPAWNER_CENTER_Y + r * Math.sin(angle)),
  };
}

/* ─────────────────────────── Handlers ──────────────────────────────── */

/**
 * START_GAME — transition from TITLE / LOBBY → PLAYING with chosen mode.
 * In 1v1 mode, ensures P2 exists at the spawner-rim right with cyan color.
 * Solo mode keeps P1 only.
 *
 * S34 P2-21 — defensive `pendingCreatureSpawn = null` belt-and-suspenders.
 * Four other paths already clear this field on lifecycle transitions
 * (applyReturnToTitle, GODLY_ABORT in world.ts, applySnapshotCore in save.ts,
 * createWorld initializer); clearing again at game entry costs 1 LOC and
 * forward-proofs against any future transition path (Anvil-driven S35+
 * variants) that might skip those four. No production path is currently
 * known to land in START_GAME with a non-null pendingCreatureSpawn, so the
 * clear is a no-op in current flows.
 */
export function applyStartGame(world: World, action: StartGameAction): World {
  world.gameMode = action.mode;
  world.isHost = action.isHost;
  world.gameState = 'PLAYING';
  // S42 — reset diagnostics counter at game-start so per-match observability
  // isn't polluted by lobby/title noise.
  // S48 P3 — also reset rejectReasons sub-buckets.
  world.diagnostics.raceRejects = 0;
  world.diagnostics.rejectReasons.pickupPosShape = 0;
  world.diagnostics.rejectReasons.pickupSparkNotFree = 0;
  world.diagnostics.rejectReasons.pickupReachFail = 0;
  world.diagnostics.rejectReasons.placeTargetMissing = 0;
  // S86 P3 — the two buckets both prior reset lists missed (S84 added
  // pickupPoopedTooFar without extending either reset; actorBenched is new).
  world.diagnostics.rejectReasons.pickupPoopedTooFar = 0;
  world.diagnostics.rejectReasons.actorBenched = 0;
  // S49 P1 (Sym F) — reset territory diagnostics + clear any active shrink
  // debuffs from the previous match so a fresh game starts at full radii.
  world.diagnostics.territoryBlockRejects = 0;
  // S125 P2 (F9) — reset the per-match INTENT-throttle counter (the rate-limiter's
  // per-peer buckets are cleared separately in main.ts on this same START_GAME).
  world.diagnostics.intentThrottled = 0;
  for (const player of world.players.values()) {
    player.territorialShrinkUntilTick = null;
    // S72 P2 (Triumvirate CHECK) — a fresh match starts with NO hunter bench. The
    // START-OF-MATCH invariant complement to the RETURN_TO_TITLE exit-path clear
    // (belt-and-suspenders; mirrors the bomb-clear carry-forward posture).
    player.benchedUntilTick = undefined;
    // S72 P3 — a fresh match starts with no carried potato (start-of-match invariant).
    player.carriedPotatoId = undefined;
    /*
     * ⛔ S161 CLOSE-OUT (lane 1) — **A REMATCH STARTS WITH A STANDING CASTLE.**
     *
     * `castleHp` is assigned in exactly one place outside save-rehydration — `makeIdlePlayer` — and
     * seat 0 is never re-created (the roster arm takes the `else` branch for an existing seat), so a
     * player who lost their castle re-entered the next match at 0 HP. Pre-S161 that merely ended the
     * new match instantly: wrong, but loud. S161 made it silent and much worse — the dispatch gate
     * denies EVERY intent for an eliminated seat and the economy gate freezes its haulers, so the
     * host would play a whole round unable to gather, build, place or raid, and in a 3+ seat rematch
     * the last-one-standing rule would not even end it.
     *
     * ⚠ `eliminatedAtTick` MUST be cleared alongside it, or `markFallenSeats`' write-once guard
     * keeps last match's stamp and `matchPlacings` ranks the new match by the old one's deaths.
     */
    player.castleHp = CASTLE_MAX_HP;
    player.eliminatedAtTick = undefined;
  }
  // S72 P2 (Triumvirate CHECK) — clear any lingering hunter at match start so the
  // once-per-game flag + Map can never bleed across matches (invariant: no hunter
  // before the 75% trigger fires this match).
  world.hunters.clear();
  world.nextHunterId = 0;
  world.hunterSpawned = false;
  // S72 P3 — clear any lingering potato at match start (same invariant).
  world.potatoes.clear();
  world.nextPotatoId = 0;
  // S72 P4 — defensive bomb-clear at match start (the S71 CHECK carry-forward; belt-and-
  // suspenders — RETURN_TO_TITLE already clears, but this makes "no hazard pre-game" a
  // start-of-match invariant for ALL THREE hazards: bomb, hunter, potato).
  world.bombs.clear();
  world.nextBombId = 0;
  // S75 P3 — clear any lingering rainbow at match start (same all-hazards invariant).
  world.rainbows.clear();
  world.nextRainbowId = 0;
  // S84 P2 — a fresh match must not resume (or re-yell) a previous match's flyover.
  world.rainbowSwitchTick = undefined;
  // S147 P1 — THE MATCH CLOCK RESTARTS WITH THE MATCH. A fresh match always opens with a FULL BUILD
  // stage (Q12) so nobody can be attacked before they have had a chance to build. Deadline is stamped
  // RELATIVE TO world.tick, not to 0: applyStartGame does not reset the tick, so an absolute 5400
  // would already be in the past on any second match of a session and the phase would flip instantly.
  world.matchPhase = 'BUILD';
  world.phaseEndsAtTick = world.tick + PHASE_DURATION_TICKS;
  // S88 G3a — discovery is per-match: a fresh match starts at Combos 0/14, no stale toast.
  world.discoveredCombos.clear();
  world.comboToastTick = undefined;
  world.lastDiscoveredComboNames = undefined;
  // S93 — a fresh match starts with NO NONET trial active + the once-per-match guard reset.
  world.sudoku = null;
  world.sudokuFiredThisMatch = false;
  world.waveNumber = 1; // S157 B8 — every match opens on wave 1
  world.godlyFiredThisMatch.clear(); // S97 P5 — each godly type can fire again next match
  // S77 P3 — clear seagulls/poops/fouled-prims at match start (same all-hazards invariant).
  world.seagulls.clear();
  world.nextSeagullId = 0;
  world.poops.clear();
  // S158 P6 — landed stink bags clear with every other hazard (CF-S157-b).
  world.stinkClouds.clear();
  world.nextStinkCloudId = 0;
  world.nextPoopId = 0;
  world.fouledPrimitives.clear();
  // S100 P1 (TD Phase 1a) — clear any lingering spawner at match start (same all-hazards
  // start-of-match invariant: no spawner before a player ignites one this match).
  world.creatureSpawners.clear();
  world.nextSpawnerId = 0;
  // S103 P2 — clear any lingering defender at match start (same all-hazards invariant).
  world.defenders.clear();
  world.nextDefenderId = 0;
  // V6-1.1 — clear any lingering gatherer at match start (same all-hazards invariant).
  world.gatherers.clear();
  world.nextGathererId = 0;
  // S136 P1 — and its castle bank. A fresh match must never inherit last match's stored shapes.
  world.castleBanks.clear();
  world.gathererOrders.clear(); // S141 P2 — the order queues tear down with the gatherer economy
  // S34 P2-21 defensive clear (see JSDoc above).
  world.pendingCreatureSpawn = null;
  // S87 — bot-seat identity is per-match: rebuild from the action (empty for
  // solo/networked starts — a fresh match never inherits stale bot flags).
  world.botSeats.clear();
  if (action.botSeats !== undefined) {
    for (const seat of action.botSeats) world.botSeats.add(asPlayerId(seat));
  }
  if (action.roster !== undefined && action.roster.length > 0) {
    // S62 — N-player seating from the host-minted ordered roster. Insert in
    // SEAT ORDER so the players Map iterates identically on every client (same
    // insertion order → same iteration order = cross-client determinism). Each
    // seat's avatar spawns at its radial rim position; color comes from the
    // roster entry (= PLAYER_COLORS[seat]). Idempotent: a player already present
    // (the host's own seat-0 from makeWorld) is left in place — seat 0's radial
    // position equals makeWorld's left-rim spawn, so this is consistent.
    const total = action.roster.length;
    for (const entry of action.roster) {
      const pid = asPlayerId(entry.seat);
      // ⭐ W1-A (S160) — resolve ONCE, so the two arms below cannot disagree.
      const raceId = entry.raceId ?? defaultRaceForSeat(entry.seat);
      if (!world.players.has(pid)) {
        const p = makeIdlePlayer(pid, entry.color, radialSpawnPos(entry.seat, total), raceId);
        world.players.set(p.id, p);
        world.scoreByPlayer.set(p.id, 0);
      } else {
        /*
         * ⛔ W1-A (S160) — THIS ARM IS THE SPEC'S B7, AND WITHOUT IT THE HOST'S OWN RACE IS DROPPED.
         *
         * The idempotent guard above exists because `makeWorld` already built seat 0, so **seat 0
         * ALWAYS already exists** and the `if` never runs for the host. Before this arm, `entry.color`
         * and `entry.raceId` therefore never reached the host at all: every JOINER would see the
         * host as (say) vampires while the host itself rendered whatever `makeWorld` defaulted to.
         *
         * ⚠ A ONE-SIDED, HOST-ONLY, NEVER-RED DESYNC. Colour is not hashed (`FIELD_COVERAGE` marks
         * `players: 'acknowledged'`), so no oracle and no test that only checks joiners would ever
         * have caught it — which is exactly why the spec found it by reading rather than by running.
         */
        const existing = world.players.get(pid)!;
        existing.raceId = raceId;
        existing.color = entry.color;
      }
    }
  } else if (action.mode === '1v1') {
    // Legacy/test 2-player path (no roster): seat P1 at the right rim as pre-S62.
    // Preserved so existing 1v1 unit tests that dispatch START_GAME without a
    // roster keep their 2-player contract.
    const p2Id = asPlayerId(1);
    if (!world.players.has(p2Id)) {
      const p2 = makeIdlePlayer(p2Id, PLAYER_COLORS[1], {
        x: SPAWNER_CENTER_X + SPAWNER_RADIUS + 40,
        y: SPAWNER_CENTER_Y,
      });
      world.players.set(p2.id, p2);
      world.scoreByPlayer.set(p2.id, 0);
    }
  }
  // ⭐ S148 P1 — STAMP THE BOARD. This MUST sit between seating and every seeder below it, and the
  // ordering is load-bearing in BOTH directions:
  //
  //   · AFTER seating, because the board is chosen from the seat count (R2: 1-2 seats = the pitch,
  //     3-4 = the quadrants) and `world.players` is only complete on the line above.
  //   · BEFORE `seedBotSpawners` / `seedStartingGatherers` / `seedStartingUnits`, because every one
  //     of those derives a spawn position from `castleAnchor(seat, world.layout)`. Stamping it after
  //     them would seed the whole opening state on the PREVIOUS match's board — and those positions
  //     are hashed, so it would not be a cosmetic error, it would be a desync on tick 0.
  //
  // Stamped ONCE per match and never written again while it runs: see the `layout` field docblock
  // for why a live-roster derivation would move every castle when somebody joins or drops.
  world.layout = layoutForSeatCount(world.players.size);
  /* ⭐ S148 P2 — THE OPENING IS A CASTLE, ONE GATHERER AND 100 POINTS. NOTHING ELSE.
   *
   * Owner playtest, verbatim: *"everyone should start with nothing but the castle and one gatherer"*.
   * Two seeders were deleted here to make that true, and both were unfair or incoherent rather than
   * merely surplus:
   *
   *   ⛔ `seedBotSpawners(world)` — gave EVERY BOT SEAT a complete PENTAGRAM (5 bonded Triangles + a
   *      registered spawner = a persistent chewer emitter) AND a complete LIGHTNING HUB (which fires
   *      a burst of 3 suicide drones). The human seat got neither. It was demo scaffolding from
   *      S104/S113 so the owner could SEE chewers and drones without building them — and vs-bots
   *      then quietly became the main way the game is played, so the scaffolding became the opening.
   *      It was ALSO still siting those structures with the retired polar-ring math, so a bot's free
   *      pentagram could land in the quarry or inside another seat's zone — which would have broken
   *      own-zone build legality outright, the host refusing a placement it had seeded itself.
   *
   *   ⛔ `seedStartingUnits(world)` — granted every seat one `goblinMelee`. R49: goblins are produced
   *      by the GOBLIN TOWER (R18/R24 — feed it shapes, one goblin per shape, the shape choosing which
   *      of six kinds). ⭐ S159 P6: that clause used to end *"which is S153 and unbuilt"* and it is
   *      BUILT — the reducer landed in S151 P3 (`goblinTowerFeed.ts`) and the player gesture, the FEED
   *      row of six shape buttons in the structure popover, landed in S152 P2 (dispatched at
   *      `main.ts:817`). So the sentence's premise — goblins come from the tower — is now load-bearing
   *      rather than aspirational, which is exactly what makes removing the free grant coherent.
   *      This explicitly reverses the owner's own S139
   *      ruling ("each player starts with one goblin of every kind"), which predates the tower-defence
   *      pivot; the owner confirmed the reversal. The `goblinMelee` creature type is RETAINED and still
   *      fully tested — only the seeding is gone, so its tower can mint it unchanged.
   *
   * What remains is symmetric between human and bot, which is the whole point.
   */
  seedStartingGatherers(world);
  return world;
}


/** V6-1.2 — one gatherer + the opening point balance per seated player. Idempotent per seat. */
function seedStartingGatherers(world: World): void {
  for (const pid of world.players.keys()) {
    world.scoreByPlayer.set(pid, STARTING_VICTORY_POINTS);
    let owns = false;
    for (const g of world.gatherers.values()) {
      if (g.ownerPlayerId === pid) { owns = true; break; }
    }
    if (owns) continue;
    const anchor = castleAnchor(pid as unknown as number, world.layout);
    const id = asGathererId(world.nextGathererId++);
    world.gatherers.set(
      id,
      makeGatherer({
        id,
        ownerPlayerId: pid,
        pos: { x: anchor.x, y: anchor.y + GATHERER_DEPOSIT_OFFSET_Y },
        spawnedAtTick: world.tick,
      }),
    );
  }
  // scoreProgress = max over seats, recomputed so the HUD/win gate agree from tick 0.
  let max = 0;
  for (const v of world.scoreByPlayer.values()) if (v > max) max = v;
  world.scoreProgress = max;
}

/**
 * RETURN_TO_TITLE — full reset back to TITLE/solo. Clears world state
 * (primitives, bonds, free sparks, effects, scores, last-winner), drops P2
 * if present, and resets P1's per-game state (energy, buildActions,
 * disruptionCharges, and forces Idle if Carrying).
 *
 * S31 P0-2 — also clears Phase-2 godly/creature cinematic state. Pre-S31
 * the reducer left `world.creatures`, `nextCreatureId`,
 * `activeCinematicPlayerId`, `currentCinematicEvent`, `pendingCinematics`,
 * and `pendingCreatureSpawn` untouched, which caused stuck cinematic state
 * after mid-cinematic title-return (POSTGAME click, lobby back, peer-drop
 * via `onReturnFromConnectionLost`). Orchestration-side teardown
 * (cutsceneOverlay.abort + screenShake.reset + cinematicTimer cleanup) is
 * driven by main.ts's PLAYING→TITLE transition watcher; reducer owns the
 * state half.
 */
export function applyReturnToTitle(world: World): World {
  world.gameState = 'TITLE';
  world.gameMode = 'solo';
  // S62 — reset to the solo identity (seat 0). Pre-S62 this preserved the
  // client's id=1 across title-returns; with N-player the seat is re-assigned
  // fresh from the roster on every game start, so a clean reset to 0 is correct
  // and avoids localPlayerId dangling at a seat dropped below (e.g. a seat-2
  // client returning to title).
  world.localPlayerId = asPlayerId(0);
  world.diagnostics.raceRejects = 0;
  // S48 P3 — also reset rejectReasons sub-buckets on RETURN_TO_TITLE.
  world.diagnostics.rejectReasons.pickupPosShape = 0;
  world.diagnostics.rejectReasons.pickupSparkNotFree = 0;
  world.diagnostics.rejectReasons.pickupReachFail = 0;
  world.diagnostics.rejectReasons.placeTargetMissing = 0;
  // S86 P3 — the buckets both prior reset lists missed (see applyStartGame).
  world.diagnostics.rejectReasons.pickupPoopedTooFar = 0;
  world.diagnostics.rejectReasons.actorBenched = 0;
  // S49 P1 (Sym F) — reset territory block counter.
  world.diagnostics.territoryBlockRejects = 0;
  world.diagnostics.intentThrottled = 0; // S125 P2 (F9) — per-match INTENT-throttle counter
  world.primitives.clear();
  world.bonds.clear();
  world.freeSparks.clear();
  world.effects.length = 0;
  world.lastWinnerId = null;
  world.nextPrimitiveId = 0;
  world.nextBondId = 0;
  world.scoreProgress = 0;
  world.scoreByPlayer.clear();
  // S31 P0-2 — clear Phase-2 godly/creature cinematic state. Mirrors the
  // GODLY_ABORT cascade (world.ts:407-418) but applied on title-return path
  // instead of peer-drop path. Without these clears, an active Voltkin
  // cinematic + live creature would persist through TITLE → re-enter PLAYING
  // with stale state (orphaned creature in the new world, queued spawn
  // firing at a tick the new world hasn't reached, cinematic flag stuck so
  // matcher refuses to fire new godlies).
  world.creatures.clear();
  world.nextCreatureId = 0;
  // S71 P1 — clear bombs on title-return so a hazard never persists into the next
  // match (mirror of the creatures cleanup above).
  world.bombs.clear();
  world.nextBombId = 0;
  // S72 P2 — clear the Pac-Man hunter on title-return (mirror of bombs/creatures).
  // benchedUntilTick is cleared on the surviving P1 below; dropped players (P2+)
  // take their bench with them when removed.
  world.hunters.clear();
  world.nextHunterId = 0;
  world.hunterSpawned = false;
  // S72 P3 — clear potatoes on title-return (mirror of hunters/bombs/creatures).
  // carriedPotatoId is cleared on the surviving P1 below; dropped players take theirs.
  world.potatoes.clear();
  world.nextPotatoId = 0;
  // S75 P3 — clear rainbows on title-return (mirror of potatoes/hunters/bombs/creatures).
  world.rainbows.clear();
  world.nextRainbowId = 0;
  // S84 P2 — drop any in-flight flyover with the rest of the hazard state.
  world.rainbowSwitchTick = undefined;
  // S147 P1 — drop the match clock back to a pristine opening BUILD on title-return, mirroring the
  // hazard/combo/NONET teardown around it. Tick-relative for the same reason as applyStartGame.
  world.matchPhase = 'BUILD';
  world.phaseEndsAtTick = world.tick + PHASE_DURATION_TICKS;
  // S148 P1 — and drop the board back to the solo pitch, mirroring the clock reset above. The next
  // START_GAME re-stamps it from the real seat count; resetting here means a title-return leaves no
  // stale quadrant board behind for a solo match to inherit.
  world.layout = 'PITCH_2P';
  // S88 G3a — drop per-match combo-discovery state on title-return.
  world.discoveredCombos.clear();
  world.comboToastTick = undefined;
  world.lastDiscoveredComboNames = undefined;
  // S93 — drop any active NONET trial + reset the once-per-match guard on title-return.
  world.sudoku = null;
  world.sudokuFiredThisMatch = false;
  world.godlyFiredThisMatch.clear(); // S97 P5 — reset the per-type godly guard on title-return
  // S77 P3 — clear seagulls/poops/fouled-prims on title-return (mirror of the other hazards).
  world.seagulls.clear();
  world.nextSeagullId = 0;
  world.poops.clear();
  // S158 P6 — landed stink bags clear with every other hazard (CF-S157-b).
  world.stinkClouds.clear();
  world.nextStinkCloudId = 0;
  world.nextPoopId = 0;
  world.fouledPrimitives.clear();
  // S100 P1 (TD Phase 1a) — clear creature spawners on title-return (mirror of the other
  // hazards). A lingering spawner would keep minting chewers + accruing income next match.
  world.creatureSpawners.clear();
  world.nextSpawnerId = 0;
  // S103 P2 — clear defenders on title-return (mirror of the other hazards).
  world.defenders.clear();
  world.nextDefenderId = 0;
  // V6-1.1 — clear gatherers on title-return (mirror of the other hazards).
  world.gatherers.clear();
  world.nextGathererId = 0;
  // S136 P1 — and its castle bank, or a title-return would carry stored shapes into the next match.
  world.castleBanks.clear();
  world.gathererOrders.clear(); // S141 P2 — the order queues tear down with the gatherer economy
  world.activeCinematicPlayerId = null;
  world.currentCinematicEvent = null;
  world.pendingCinematics.length = 0;
  world.pendingCreatureSpawn = null;
  // S87 — bot seats are dropped with their players (survivor sweep below).
  world.botSeats.clear();
  // Keep P1 only; drop P2 if present.
  const survivors: PlayerId[] = [];
  for (const pid of world.players.keys()) {
    if (pid !== asPlayerId(0)) survivors.push(pid);
  }
  for (const pid of survivors) world.players.delete(pid);
  // Reset P1's per-game state.
  const p1 = world.players.get(asPlayerId(0));
  if (p1 !== undefined) {
    p1.energy = 0;
    p1.buildActions = 0;
    p1.disruptionCharges = 0;
    // S49 P1 (Sym F) — clear shrink debuff so P1 starts fresh.
    p1.territorialShrinkUntilTick = null;
    // S72 P2 — clear any hunter bench so P1 never starts the next match benched.
    p1.benchedUntilTick = undefined;
    // S72 P3 — clear any carried potato slot so P1 starts the next match empty-handed.
    p1.carriedPotatoId = undefined;
    if (p1.kind === 'Carrying') {
      world.players.set(p1.id, { ...p1, kind: 'Idle' as const } as never);
    }
  }
  world.scoreByPlayer.set(asPlayerId(0), 0);
  return world;
}

/**
 * UPDATE_AVATAR_POS — client-driven net intent: update one player's
 * avatarPos vector. Silently ignores actions for missing players.
 *
 * S45 BUG-CRITICAL-3 Sym A — when player is Carrying, also sync the carried
 * spark's position to the avatarPos. This is the load-bearing coupling that
 * lets the joiner's carried spark follow their cursor on the authoritative
 * side: host receives joiner's UPDATE_AVATAR_POS intents at the throttled
 * dispatch rate, applies them here, and the joiner's carried spark.pos
 * tracks their avatarPos. The subsequent PLACE_PRIMITIVE then lands at the
 * joiner's intended position (spark.pos = avatarPos = joiner's cursor at
 * dispatch time). Host's local Carrying state is identically coupled —
 * host's controls.applyPerSubstep still drives host's spark.pos via cursor
 * each substep, but the avatarPos→spark.pos sync here keeps the state
 * authoritative and snapshot-coherent. Council R2 C1 (Sym A coupling) +
 * PRIME-AUDIT Δ4 expansion.
 */
export function applyUpdateAvatarPos(world: World, action: UpdateAvatarPosAction): World {
  const player = world.players.get(action.playerId);
  if (player === undefined) return world;
  // S82 P1 — cruiser-poopy-slow: while debuffed, the cursor is a TARGET, not a teleport.
  // Write poopedCursorTarget verbatim and leave avatarPos to the per-tick chase
  // (tickCruiserChase). The reducer stays pure, so the client's optimistic prediction of
  // its own UPDATE_AVATAR_POS matches the host exactly (both write the target).
  if (isCruiserDebuffed(player, world.tick)) {
    if (player.poopedCursorTarget === undefined) {
      player.poopedCursorTarget = { x: action.pos.x, y: action.pos.y };
    } else {
      player.poopedCursorTarget.x = action.pos.x;
      player.poopedCursorTarget.y = action.pos.y;
    }
    return world;
  }
  // S82 P1 (Council R2 — explicit guard): the first UN-debuffed update makes the cursor
  // authoritative again — drop any leftover chase target so verbatim teleport resumes.
  if (player.poopedCursorTarget !== undefined) player.poopedCursorTarget = undefined;
  player.avatarPos.x = action.pos.x;
  player.avatarPos.y = action.pos.y;
  // S45 Sym A — carried-spark coupling to carrier's avatarPos.
  if (player.kind === 'Carrying') {
    const spark = world.freeSparks.get(player.carriedSparkId);
    if (spark !== undefined && spark.state.kind === 'Carried') {
      spark.pos.x = action.pos.x;
      spark.pos.y = action.pos.y;
      spark.prevPos.x = action.pos.x;
      spark.prevPos.y = action.pos.y;
    }
  }
  return world;
}

/* ─────────────── S82 P1 — cruiser-poopy-slow movement model ─────────────── */

/**
 * S82 P1 — is this player's cruiser currently slow-debuffed? Pure tick compare
 * (self-heals at expiry — mirror of spark.poopyUntilTick / benchedUntilTick).
 */
export function isCruiserDebuffed(
  player: Pick<Player, 'poopedUntilTick'>,
  tick: number,
): boolean {
  return player.poopedUntilTick !== undefined && tick < player.poopedUntilTick;
}

/**
 * S82 P1 — per-tick capped cursor-chase for slowed cruisers. Called once per fixed
 * physics tick on the HOST/solo path only (physicsLoop.stepPhysics — clients receive
 * avatarPos via NetSnapshot and never simulate).
 *
 * Gate is poopedCursorTarget BEING SET, not the debuff timer: after poopedUntilTick
 * expires mid-chase the residual gap still closes at the capped speed, then the field
 * exact-snaps + clears (Council S82 R2 — guaranteed termination without float-equality;
 * an un-debuffed UPDATE_AVATAR_POS also clears it, whichever comes first).
 *
 * Movement is ≤ POOP_CRUISER_MAX_SPEED px per tick toward the target — a physical
 * speed limit. Spam-immune by construction: extra UPDATE_AVATAR_POS messages only move
 * the target, never the avatar. Math.sqrt on IEEE doubles is exactly-rounded
 * (deterministic cross-platform); the players Map iterates in seat-insertion order
 * (S62 START_GAME inserts ascending), so the pass order is deterministic.
 *
 * Carried-spark coupling (S45 Sym A) mirrors applyUpdateAvatarPos: while the chase
 * governs avatarPos, the carried spark is pinned to the avatar each tick.
 */
export function tickCruiserChase(world: World): void {
  for (const player of world.players.values()) {
    const target = player.poopedCursorTarget;
    if (target === undefined) continue;
    const dx = target.x - player.avatarPos.x;
    const dy = target.y - player.avatarPos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= POOP_CRUISER_MAX_SPEED * POOP_CRUISER_MAX_SPEED) {
      // Within one step: exact snap + clear (terminates the chase deterministically).
      player.avatarPos.x = target.x;
      player.avatarPos.y = target.y;
      player.poopedCursorTarget = undefined;
    } else {
      const dist = Math.sqrt(distSq);
      player.avatarPos.x += (dx / dist) * POOP_CRUISER_MAX_SPEED;
      player.avatarPos.y += (dy / dist) * POOP_CRUISER_MAX_SPEED;
    }
    // S45 Sym A — keep the carried spark pinned to the chasing avatar.
    if (player.kind === 'Carrying') {
      const spark = world.freeSparks.get(player.carriedSparkId);
      if (spark !== undefined && spark.state.kind === 'Carried') {
        spark.pos.x = player.avatarPos.x;
        spark.pos.y = player.avatarPos.y;
        spark.prevPos.x = player.avatarPos.x;
        spark.prevPos.y = player.avatarPos.y;
      }
    }
  }
}

/* ────────────────────────── Scoring helper ─────────────────────────── */

/**
 * S15 P2 — per-player score helper. S76 P3 UNIFIED: ONE path for solo AND
 * networked — write the delta to scoreByPlayer, then scoreProgress is ALWAYS
 * recomputed as the leader's score = max(scoreByPlayer.values()) (solo = the
 * single player's value). The pre-S76 split (solo `scoreProgress += delta` vs
 * networked leader-max) let player-1 score differently and is GONE — this
 * docstring's old "solo is additive" claim with it (S79 P6 doc fix).
 *
 * scoreProgress drives the PHASE_1_WIN_SCORE gate in gameState.ts; per-player
 * values feed HUD display + winner attribution. Production point-gain accrues
 * in state/scoring.ts tickScoring (complexity income); addScore remains for
 * tests + one-shot adjustments and matches tickScoring's leader-max recompute.
 */
export function addScore(world: World, playerId: PlayerId, delta: number): void {
  const prev = world.scoreByPlayer.get(playerId) ?? 0;
  world.scoreByPlayer.set(playerId, prev + delta);
  // S76 P3 — UNIFIED single path (was: solo `scoreProgress += delta` vs networked
  // `scoreProgress = max(scoreByPlayer)` — the divergence that let player-1 score
  // differently). scoreProgress is now ALWAYS the leader's score = max over scoreByPlayer;
  // for solo that's just the single player's value. Every player scores by the identical
  // rule, and this matches state/scoring.ts:tickScoring's per-tick recompute. addScore
  // remains for tests + any manual one-shot adjustment; production point-gain accrues in
  // tickScoring (complexity-income), not here.
  recomputeScoreProgress(world);
}

/**
 * ⭐ S162 POST-AUDIT — **`scoreProgress` IS THE MAX OVER LIVING SEATS, AND IT IS COMPUTED IN ONE PLACE.**
 *
 * S161 P2 wrote the rule at `scoring.ts` — *"A FALLEN SEAT MUST NOT EARN, AND MUST NOT LEAD"* — and
 * taught two of the five sites that decide it. Three identical copies of this loop were left counting
 * corpses: `addScore`, `spendScore` and `resolveSudoku`.
 *
 * ⛔ AND THAT RE-OPENED THE CRITICAL BUG S161 THOUGHT IT HAD CLOSED. Its reasoning was that a dead
 * seat's banked score is FROZEN and therefore stuck below the threshold. It was not frozen —
 * `awardSpawnerKillReward` went on paying eliminated seats — so a corpse could accrue PAST
 * `PHASE_1_WIN_SCORE`, and the corrective recompute lives in `tickScoring`, which is FIGHT-only. One
 * gatherer purchase during BUILD was enough to publish a corpse's score as the leader's and fire the
 * win gate, which then correctly hands the match to the top LIVING seat — a seat that may be nowhere
 * near winning.
 *
 * ⚠ The `>` comparison makes `Map` order irrelevant here: the result is a NUMBER, not a choice of
 * player, so ties cannot be decided by insertion order (the S155 N1 class). The seat SELECTION scans
 * that do care live in `scoring.ts` and `gameState.ts`, and each carries its own explicit id tie-break.
 */
export function recomputeScoreProgress(world: World): void {
  let max = 0;
  let any = false;
  for (const [pid, v] of world.scoreByPlayer) {
    const p = world.players.get(pid);
    if (p !== undefined && isEliminated(p)) continue; // a corpse does not lead
    if (!any || v > max) {
      max = v;
      any = true;
    }
  }
  world.scoreProgress = any ? max : 0;
}

/**
 * V6-1.1 — spend victory points from ONE pool (the buyer's own scoreByPlayer). Clamps at 0 so a
 * spend can never drive a player negative (defense-in-depth; callers also affordability-guard),
 * then recomputes scoreProgress = max exactly like addScore/tickScoring. This is the game's first
 * real score SINK: scoreProgress can now cross a SCORE_TIER boundary DOWNWARD, and the HUD's
 * point-drop flash was built for NONET losses — both are handled at the spend's UI seam so a
 * voluntary buy does not read as a penalty. Score stays monotonic-safe everywhere that latches
 * (hunterSpawned, a reached WIN) because those gate on a threshold already crossed, not on the
 * current value falling back below it.
 */
export function spendScore(world: World, playerId: PlayerId, cost: number): void {
  const prev = world.scoreByPlayer.get(playerId) ?? 0;
  world.scoreByPlayer.set(playerId, Math.max(0, prev - cost));
  recomputeScoreProgress(world);
}

/**
 * S100 P1 (TD Phase 1a) — award SPAWNER_KILL_REWARD when an enemy spawner is destroyed
 * by a raid (TOWER_DEFENSE_DESIGN.md §4.3). Called ONCE from the host re-validation poll
 * (main.ts) on the destruction branch — the moment the spawner's exact shape is broken —
 * just BEFORE the REMOVE_SPAWNER dispatch. NOT a per-tick accrual loop (the passive income
 * is the recomputed scoring.ts term; this is the discrete one-shot raid incentive, the
 * resolveSudoku precedent) and NOT fired on teardown (teardownSpawners clears the map
 * directly without going through this path — so a match-end / title-return mints no reward).
 *
 * SEVERER ATTRIBUTION: the reward SPLITS evenly across every player OTHER than the spawner
 * owner (`addScore` per recipient — the unified leader-max path, no parallel loop). In a
 * raid the enemies ARE the severers (the owner doesn't raid their own structure, and a
 * chewer-driven self-collapse can't happen — chewers never eat their own spawner, R8). This
 * is the deterministic "split across severers" at the granularity available WITHOUT new
 * per-bond severer tracking (which would be cross-cutting state on the SEVER_BOND path); a
 * precise last-/contributing-severer split is the documented Phase-3 refinement. Solo (no
 * enemies) → no recipients → no-op, so a solo self-destruct mints nothing. Deterministic:
 * recipients are iterated in `world.players` (insertion = seat) order and each gets an equal
 * `SPAWNER_KILL_REWARD / enemyCount` share (float — replay-safe, host-authoritative).
 */
export function awardSpawnerKillReward(world: World, spawner: CreatureSpawner): void {
  // S147 P1 (R3) — *"Points accrue during the FIGHT stage ONLY."* This is the SECOND score path in
  // the codebase (the first is tickScoring's complexity income) and it is the one that is easy to
  // miss, because it is event-driven rather than per-tick: a spawner dying during BUILD would award
  // a bounty and quietly falsify the "score is 0 across a whole BUILD" invariant.
  //
  // ⚠ A DELIBERATE, FLAGGED ADDITION beyond the S147 spec's "one guard, one call site". Gating only
  // tickScoring would have left the invariant TRUE-BY-COINCIDENCE (it holds in tests only because no
  // test kills a spawner during BUILD) rather than true by construction. In the target design this
  // gate is behaviour-neutral anyway — from S149 nothing can attack during BUILD (R5), so a bounty in
  // BUILD cannot arise; it matters only in the S147 interim where towers are still always-on.
  if (world.matchPhase !== 'FIGHT') return;
  const enemies: PlayerId[] = [];
  for (const player of world.players.values()) {
    // ⛔ S162 POST-AUDIT — A FALLEN SEAT IS NOT A RAIDER. The only filter here was "not the owner",
    // so an eliminated seat kept collecting kill bounties — flatly against the invariant `scoring.ts`
    // states, and against R127's own mechanic (no castle, no earning). It also DILUTED the living
    // raiders' share, because corpses inflated `enemies.length`.
    if (player.id === spawner.ownerPlayerId || isEliminated(player)) continue;
    enemies.push(player.id);
  }
  if (enemies.length === 0) return; // solo / no raider — nothing to award
  const share = SPAWNER_KILL_REWARD / enemies.length;
  for (const pid of enemies) addScore(world, pid, share);
}
