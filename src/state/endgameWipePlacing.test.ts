/**
 * SPARK — ⛔ S193 (audit, MED): **AFTER AN ENDGAME WIPE THE CROWNED SEAT IS ROW 1 ON THE STAT BOARD.**
 *
 * A wipe (wave 27+, every castle down) crowns the top SCORE over every seat (`gameState.ts`), even one
 * whose castle fell first. `matchPlacings` let the crown lead only among SURVIVORS, so the board read
 * "BOT 2 WINS" with BOT 2 in 3rd. REACH: the real `START_GAME` reducer, the real `tickGameState` win
 * gate, and the real board model — the auditor's probe, kept.
 */
import { describe, expect, it } from 'vitest';
import { MONSTER_FIRST_WAVE, PLAYER_COLORS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { matchBoardModel } from '../render/matchBoardModel.ts';
import { matchPlacings } from './elimination.ts';
import { makeGameStateExtras, tickGameState } from './gameState.ts';
import { dispatch, makeWorld } from './world.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const P2 = asPlayerId(2);

describe('⛔ S193 — an endgame wipe: the crowned top scorer is placed 1st', () => {
  it('3 seats, the top scorer falls FIRST, then the rest on one tick → he is crowned AND row 1', () => {
    const w = makeWorld(7);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: 'bots', isHost: true,
      roster: [0, 1, 2].map((seat) => ({ seat, color: PLAYER_COLORS[seat]! })), botSeats: [1, 2],
    });
    w.gameState = 'PLAYING';
    w.draft = null;
    w.waveNumber = MONSTER_FIRST_WAVE + 1;
    w.matchPhase = 'FIGHT';
    w.scoreByPlayer.set(P0, 10);
    w.scoreByPlayer.set(P1, 50); // the top score
    w.scoreByPlayer.set(P2, 20);
    const ex = makeGameStateExtras();
    w.players.get(P1)!.castleHp = 0; // the top scorer falls first
    tickGameState(w, ex);
    for (let i = 0; i < 5; i++) { w.tick++; tickGameState(w, ex); }
    w.players.get(P0)!.castleHp = 0; // then the other two, the same tick — the wipe
    w.players.get(P2)!.castleHp = 0;
    w.tick++;
    tickGameState(w, ex);

    expect(w.lastWinnerId, 'fixture: the wipe crowned the top score').toBe(P1);
    expect(w.players.get(P1)!.eliminatedAtTick, 'fixture: and he fell first').toBeLessThan(w.players.get(P0)!.eliminatedAtTick!);
    // The crown first; the rest in reverse elimination order, seat id breaking the same-tick tie.
    expect(matchPlacings(w)).toEqual([P1, P0, P2]);

    w.gameState = 'POSTGAME';
    const m = matchBoardModel(w)!;
    expect(m.rows[0]!.isWinner, 'the WINS row is row 1').toBe(true);
    expect(m.rows.filter((r) => r.isWinner).length).toBe(1);
  });

  it('negative — with no crown (no winner recorded) the fallen keep pure reverse-elimination order', () => {
    const w = makeWorld(7);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.players.get(P0)!.eliminatedAtTick = 10;
    w.players.get(P1)!.eliminatedAtTick = 20;
    w.lastWinnerId = null;
    expect(matchPlacings(w)).toEqual([P1, P0]);
  });
});
