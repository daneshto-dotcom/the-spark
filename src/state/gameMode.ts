/**
 * SPARK — game-mode dispatch handlers + per-player scoring, extracted
 * from world.ts (S16 P0, S15 § XV carry-forward).
 *
 * S16 P0 — mechanical extraction (zero behavior change) per § XV soft LOC
 * charter compliance. world.ts breached 357 LOC at S15 close (28% over the
 * 280 soft cap created when S15's networking work landed). The 4 dispatch
 * case bodies for the FSM-extension actions (START_GAME, END_TURN,
 * RETURN_TO_TITLE, UPDATE_AVATAR_POS) plus the addScore per-player score
 * helper all live here now; world.ts's `dispatch` switch delegates to the
 * exported `apply*` functions, keeping the case labels (and therefore the
 * public `dispatch(world, action)` API) bit-identical.
 *
 * Council R1 (Standard tier) considered re-export vs switch-delegation;
 * adopted switch-delegation because session15.test.ts's 14 tests exercise
 * the public `dispatch` surface (not internal handler imports), so the
 * delegation is invisible to existing tests.
 *
 * requirePlayer remains in world.ts (pre-existing infrastructure shared by
 * placePrimitive.ts and other state mutators).
 */

import { PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId, type PlayerId, type Vec2 } from '../types.ts';
import type { GameMode, World } from './world.ts';

/* ────────────────────────── Action types ───────────────────────────── */

export type StartGameAction = {
  readonly type: 'START_GAME';
  readonly mode: GameMode;
  readonly isHost: boolean;
};

export type EndTurnAction = {
  readonly type: 'END_TURN';
};

export type ReturnToTitleAction = {
  readonly type: 'RETURN_TO_TITLE';
};

export type UpdateAvatarPosAction = {
  readonly type: 'UPDATE_AVATAR_POS';
  readonly playerId: PlayerId;
  readonly pos: Vec2;
};

/* ─────────────────────────── Handlers ──────────────────────────────── */

/**
 * START_GAME — transition from TITLE / LOBBY → PLAYING with chosen mode.
 * In 1v1 mode, ensures P2 exists at the spawner-rim right with cyan color.
 * Solo mode keeps P1 only.
 */
export function applyStartGame(world: World, action: StartGameAction): World {
  world.gameMode = action.mode;
  world.isHost = action.isHost;
  world.gameState = 'PLAYING';
  world.currentPlayerId = asPlayerId(0);
  if (action.mode === '1v1') {
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
 * END_TURN — flip currentPlayerId 0↔1 in 1v1 PLAYING state. No-op in solo
 * or non-PLAYING states (silently — preserves dispatch idempotence).
 */
export function applyEndTurn(world: World): World {
  if (world.gameMode !== '1v1') return world;
  if (world.gameState !== 'PLAYING') return world;
  const next = world.currentPlayerId === asPlayerId(0) ? asPlayerId(1) : asPlayerId(0);
  world.currentPlayerId = next;
  return world;
}

/**
 * RETURN_TO_TITLE — full reset back to TITLE/solo. Clears world state
 * (primitives, bonds, free sparks, effects, scores, last-winner), drops P2
 * if present, and resets P1's per-game state (energy, buildActions,
 * disruptionCharges, and forces Idle if Carrying).
 */
export function applyReturnToTitle(world: World): World {
  world.gameState = 'TITLE';
  world.gameMode = 'solo';
  world.currentPlayerId = asPlayerId(0);
  world.primitives.clear();
  world.bonds.clear();
  world.freeSparks.clear();
  world.effects.length = 0;
  world.lastWinnerId = null;
  world.nextPrimitiveId = 0;
  world.nextBondId = 0;
  world.scoreProgress = 0;
  world.scoreByPlayer.clear();
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
 */
export function applyUpdateAvatarPos(world: World, action: UpdateAvatarPosAction): World {
  const player = world.players.get(action.playerId);
  if (player === undefined) return world;
  player.avatarPos.x = action.pos.x;
  player.avatarPos.y = action.pos.y;
  return world;
}

/* ────────────────────────── Scoring helper ─────────────────────────── */

/**
 * S15 P2 — per-player score helper.
 *
 * Solo: scoreProgress is the scalar leader (additive). scoreByPlayer also
 * tracks for future-proofing but solo gameplay never reads it. Test
 * contracts that DIRECTLY mutate world.scoreProgress (session10.test.ts
 * scoreProgress=14 pre-bake, session13.test.ts likewise) remain valid
 * because solo path is additive (scoreProgress += delta).
 *
 * 1v1: scoreProgress = max(scoreByPlayer.values()) — the leader's score
 * drives the PHASE_1_WIN_SCORE gate in gameState.ts. Each player's
 * personal score lives in scoreByPlayer for HUD display + winner
 * attribution. The leader-max ensures WIN fires when ANY player crosses
 * the threshold first, not when summed totals do.
 */
export function addScore(world: World, playerId: PlayerId, delta: number): void {
  const prev = world.scoreByPlayer.get(playerId) ?? 0;
  const next = prev + delta;
  world.scoreByPlayer.set(playerId, next);
  if (world.gameMode === '1v1') {
    let max = next;
    for (const v of world.scoreByPlayer.values()) if (v > max) max = v;
    world.scoreProgress = max;
  } else {
    // Solo additive — preserves test contract where world.scoreProgress
    // is the source of truth and may be set directly by callers.
    world.scoreProgress += delta;
  }
}
