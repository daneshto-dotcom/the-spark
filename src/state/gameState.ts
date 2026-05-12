/**
 * SPARK — high-level game state FSM.
 * Phase 1 abridged (per § XIII): PLAYING → WIN → POSTGAME → PLAYING (reset).
 * SETUP/COUNTDOWN are deferred to Phase 2 multiplayer.
 *
 * Win condition (Phase 1 placeholder):
 *   primitives.size >= PHASE_1_WIN_PRIMITIVE_COUNT (30 per § XIV.14).
 * Phase 2 will replace with claimedArea / canvasArea ≥ 0.51.
 *
 * tickGameState() is called once per physics tick. It auto-promotes
 * PLAYING → WIN when the threshold is crossed. WIN → POSTGAME is driven
 * by elapsed-tick dwell (so a "WIN" banner shows briefly before save).
 */

import { PHASE_1_WIN_SCORE, PHYSICS_HZ } from '../constants.ts';
import { dispatch } from './world.ts';
import type { GameState, World } from './world.ts';
import type { PlayerId } from '../types.ts';

const WIN_DWELL_TICKS = PHYSICS_HZ * 2; // 2 seconds of WIN before POSTGAME

export interface GameStateExtras {
  winEnteredTick: number | null;
}

export function makeGameStateExtras(): GameStateExtras {
  return { winEnteredTick: null };
}

export function tickGameState(
  world: World,
  extras: GameStateExtras,
  primaryPlayerId: PlayerId,
): GameState {
  switch (world.gameState) {
    case 'TITLE':
    case 'LOBBY':
      // S15 P2 — no per-tick game logic in pre-PLAYING states; main.ts
      // drives transitions via dispatch(START_GAME / RETURN_TO_TITLE).
      return world.gameState;

    case 'PLAYING':
      // S9 P3: WIN by score, not by raw primitive count. Magic combos count
      // 3x, functional 1x, anchor 1x — see constants.ts.
      // S15 P2: in 1v1, winner is the player whose score reached the
      // threshold first; scoreProgress = max(scoreByPlayer) so the gate
      // fires when any player crosses. Attribution scans scoreByPlayer
      // for the max-scoring player.
      if (world.scoreProgress >= PHASE_1_WIN_SCORE) {
        let winnerId: PlayerId = primaryPlayerId;
        if (world.gameMode === '1v1') {
          let maxScore = -1;
          for (const [pid, score] of world.scoreByPlayer.entries()) {
            if (score > maxScore) {
              maxScore = score;
              winnerId = pid;
            }
          }
        }
        dispatch(world, { type: 'WIN_TRIGGER', winnerId });
        extras.winEnteredTick = world.tick;
      }
      return world.gameState;

    case 'WIN':
      if (
        extras.winEnteredTick !== null &&
        world.tick - extras.winEnteredTick >= WIN_DWELL_TICKS
      ) {
        world.gameState = 'POSTGAME';
      }
      return world.gameState;

    case 'POSTGAME':
      return world.gameState;
  }
}

/** Reset to a fresh PLAYING world. Caller is responsible for clearing renderers. */
export function softReset(world: World, extras: GameStateExtras): void {
  world.gameState = 'PLAYING';
  world.primitives.clear();
  world.bonds.clear();
  world.freeSparks.clear();
  world.lastWinnerId = null;
  world.nextPrimitiveId = 0;
  world.nextBondId = 0;
  world.effects.length = 0;
  world.scoreProgress = 0;
  // S15 P2: per-player score reset; keep keyed entries (player roster
  // unchanged by softReset).
  for (const pid of world.scoreByPlayer.keys()) world.scoreByPlayer.set(pid, 0);
  for (const player of world.players.values()) {
    player.energy = 0;
    player.buildActions = 0;
    player.disruptionCharges = 0;
    if (player.kind === 'Carrying') {
      // Demote silently — soft reset isn't a normal FSM transition.
      world.players.set(
        player.id,
        { ...player, kind: 'Idle' as const } as never,
      );
    }
  }
  extras.winEnteredTick = null;
}
