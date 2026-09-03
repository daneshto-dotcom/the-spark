/**
 * SPARK — high-level game state FSM.
 * TITLE/LOBBY → PLAYING → WIN → POSTGAME (+ reset paths back via dispatch).
 *
 * Win condition (S9 P3 score-based; S76 P3 income model): WIN fires when
 * floor(scoreProgress) ≥ PHASE_1_WIN_SCORE, where scoreProgress is the LEADER's
 * score = max(scoreByPlayer) and score accrues per-tick from standing-structure
 * complexity (state/scoring.ts tickScoring). The S0-era primitive-count
 * placeholder (PHASE_1_WIN_PRIMITIVE_COUNT) is long retired from this check.
 *
 * tickGameState() is called once per physics tick. It auto-promotes
 * PLAYING → WIN when the threshold is crossed. WIN → POSTGAME is driven
 * by elapsed-tick dwell (so a "WIN" banner shows briefly before save).
 */

import { PHASE_1_WIN_SCORE, PHYSICS_HZ } from '../constants.ts';
import { computeComplexity } from './scoring.ts';
import { teardownBombs } from './bombLifecycle.ts';
import { teardownHunters } from './hunters/hunterLifecycle.ts';
import { teardownPotatoes } from './potatoLifecycle.ts';
import { teardownRainbows } from './rainbowLifecycle.ts';
import { teardownSeagulls } from './seagulls/seagullLifecycle.ts';
import { teardownSpawners } from './spawners/spawnerLifecycle.ts';
import { teardownDefenders } from './defenders/defenderLifecycle.ts';
import { teardownGatherers } from './gatherers/gathererLifecycle.ts';
import { dispatch, isNetworked } from './world.ts';
import type { GameState, World } from './world.ts';
import type { PlayerId } from '../types.ts';
import { livingSeats, markFallenSeats, matchPlacings } from './elimination.ts';

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
      // S76 P3 (Δ3, float-safe) — scoreProgress is now a per-tick income float, so gate on
      // Math.floor so a 49.9999 hover can't delay the win and the HUD's floored "50/50"
      // reading coincides exactly with the win firing.
      /*
       * ⭐ S154 AMENDMENT C (owner A4 / R89) — THE SECOND VICTORY CONDITION: *"castle OR 1500 points
       * wins"*.
       *
       * Checked BEFORE the score gate, because a razed castle is the more decisive outcome and a
       * simultaneous crossing should read as the castle falling rather than as a points win. Both
       * thresholds are 1500 on purpose, so the two races feel the same length.
       *
       * ⚠ THE WINNER IS THE SURVIVOR, NOT THE DEALER OF THE LAST HIT. Attribution would need damage
       * provenance threaded through `damageEntity` (its `source` is documented as "attribution only
       * for now"), and in a 1v1 the two answers are identical. In FFA the survivor rule is also the
       * fairer one: whoever finishes a wounded castle should not out-rank the seat that did the work.
       * Flagged rather than silently chosen.
       */
      /*
       * ⭐ S161 P2 (owner R127) — **LAST ONE STANDING**, replacing "the first castle to fall ends it
       * for everyone".
       *
       * > *"when a castle is destroyed a player cant gather anymore primitives so yes he is out! but
       * > he should stay as spectator until there is one player left!"*
       *
       * ⛔ WHAT THIS DELETES, AND WHY IT HAD TO GO. The old rule awarded the win to `survivors[0]` —
       * the first entry of a `[...world.players.values()]` filter, i.e. **`Map` insertion order**. In
       * a 1v1 that is right by accident, because there is exactly one survivor. In any FFA it is the
       * S155 N1 defect (`Map` order silently deciding an outcome) sitting on the match result itself:
       * three seats alive, one castle falls, and the game ends handing victory to whichever of the
       * two remaining seats happened to be inserted first.
       *
       * ⚠ THE ELIMINATION STAMP IS WRITTEN BEFORE THE WIN IS TESTED, always, even on the tick the
       * match ends. `matchPlacings` derives 1st-4th from it (R10/R20), and a seat that fell on the
       * final tick without a stamp would sort as a survivor and out-place the seat that actually won.
       *
       * ⚠ SOLO IS EXPLICITLY UNCHANGED. With one seat there is nobody to be "last standing", so a
       * razed castle would otherwise leave a solo player in a match with no exit. One seat keeps the
       * old behaviour verbatim — the fall ends it — and `gameState.test.ts` pins that separately from
       * the multi-seat rule so a future edit cannot collapse the two.
       */
      markFallenSeats(world);
      const living = livingSeats(world);
      const soloBoard = world.players.size <= 1;
      const fallenCount = world.players.size - living.length;
      if (fallenCount > 0 && (soloBoard || living.length <= 1)) {
        // With ≥2 seats the winner is the ONE seat still alive. A zero-survivor board (a
        // simultaneous wipe) has no such seat, and neither does solo — both fall back to the
        // primary, which is the old behaviour for the only cases that ever reached it.
        const winnerId: PlayerId = !soloBoard && living.length === 1 ? living[0]! : primaryPlayerId;
        console.info(
          `[SPARK] WIN-BY-CASTLE tick=${world.tick} winner=P${(winnerId as number) + 1} | ` +
            `placings=${matchPlacings(world).map((id) => `P${(id as number) + 1}`).join('>')} | ` +
            [...world.players.values()].map((p) => `P${(p.id as number) + 1}:${p.castleHp}hp`).join(' '),
        );
        // Same exit the score gate uses — one WIN path, so the dwell timer, the banner and every
        // downstream watcher behave identically however the match was won.
        dispatch(world, { type: 'WIN_TRIGGER', winnerId });
        extras.winEnteredTick = world.tick;
        return world.gameState;
      }

      if (Math.floor(world.scoreProgress) >= PHASE_1_WIN_SCORE) {
        let winnerId: PlayerId = primaryPlayerId;
        if (isNetworked(world)) {
          let maxScore = -1;
          for (const [pid, score] of world.scoreByPlayer.entries()) {
            if (score > maxScore) {
              maxScore = score;
              winnerId = pid;
            }
          }
        }
        // S84 P4 — field-forensics dump (one line, once per match; every peer logs
        // its OWN view): the S84 "a non-builder won the FFA" report could not be
        // reproduced in vitro, so any future mis-attribution must be diagnosable
        // from a console screenshot — per-seat banked score + LIVE complexity at
        // the WIN moment.
        console.info(
          `[SPARK] WIN tick=${world.tick} winner=P${(winnerId as number) + 1} | ` +
            [...world.players.keys()]
              .map((pid) => {
                const s = world.scoreByPlayer.get(pid) ?? 0;
                return `P${(pid as number) + 1}: score=${s.toFixed(1)} cx=${computeComplexity(world, pid)}`;
              })
              .join(' | '),
        );
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
  // S79 P6 — hazard + foul teardown parity with WIN_TRIGGER/START_GAME (S78 audit LOW;
  // inert on today's paths because those transitions already tear down before any
  // softReset, but a fresh PLAYING world must never inherit a live bomb/hunter/potato/
  // rainbow/gull/poop or a fouled prim halting income from match zero).
  teardownBombs(world);
  teardownHunters(world);
  teardownPotatoes(world);
  teardownRainbows(world);
  teardownSeagulls(world);
  // S100 P1 (TD Phase 1a) — a fresh PLAYING world must never inherit a live spawner
  // (it would keep minting chewers + accruing income from match zero).
  teardownSpawners(world);
  // S103 P2 — a fresh PLAYING world must never inherit a live defender either.
  teardownDefenders(world);
  // V6-1.1 — nor a live gatherer.
  teardownGatherers(world);
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
