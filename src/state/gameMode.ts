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
  PLAYER_COLORS,
  POOP_CRUISER_MAX_SPEED,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import { makeIdlePlayer, type Player } from '../game/player.ts';
import { asPlayerId, type PlayerId, type Vec2 } from '../types.ts';
import type { GameMode, World } from './world.ts';

/* ────────────────────────── Action types ───────────────────────────── */

export type StartGameAction = {
  readonly type: 'START_GAME';
  readonly mode: GameMode;
  readonly isHost: boolean;
  // S62 — N-player seat roster (ordered by seat). Present for networked starts;
  // omitted for solo and for legacy 2-player test dispatches (which fall back to
  // the historical seat-P1-at-right path). State only needs seat+color; the wire
  // RosterEntry's peerId is consumed net-side (client self-identification).
  readonly roster?: readonly { readonly seat: number; readonly color: number }[];
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
 * future-proof (a new mode value is networked by default). Behavior-identical
 * today (GameMode is only 'solo' | '1v1').
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
  for (const player of world.players.values()) {
    player.territorialShrinkUntilTick = null;
    // S72 P2 (Triumvirate CHECK) — a fresh match starts with NO hunter bench. The
    // START-OF-MATCH invariant complement to the RETURN_TO_TITLE exit-path clear
    // (belt-and-suspenders; mirrors the bomb-clear carry-forward posture).
    player.benchedUntilTick = undefined;
    // S72 P3 — a fresh match starts with no carried potato (start-of-match invariant).
    player.carriedPotatoId = undefined;
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
  // S88 G3a — discovery is per-match: a fresh match starts at Combos 0/14, no stale toast.
  world.discoveredCombos.clear();
  world.comboToastTick = undefined;
  world.lastDiscoveredComboNames = undefined;
  // S93 — a fresh match starts with NO NONET trial active + the once-per-match guard reset.
  world.sudoku = null;
  world.sudokuFiredThisMatch = false;
  world.godlyFiredThisMatch.clear(); // S97 P5 — each godly type can fire again next match
  // S77 P3 — clear seagulls/poops/fouled-prims at match start (same all-hazards invariant).
  world.seagulls.clear();
  world.nextSeagullId = 0;
  world.poops.clear();
  world.nextPoopId = 0;
  world.fouledPrimitives.clear();
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
      if (!world.players.has(pid)) {
        const p = makeIdlePlayer(pid, entry.color, radialSpawnPos(entry.seat, total));
        world.players.set(p.id, p);
        world.scoreByPlayer.set(p.id, 0);
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
  return world;
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
  world.nextPoopId = 0;
  world.fouledPrimitives.clear();
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
  let max = 0;
  let any = false;
  for (const v of world.scoreByPlayer.values()) {
    if (!any || v > max) {
      max = v;
      any = true;
    }
  }
  world.scoreProgress = any ? max : 0;
}
