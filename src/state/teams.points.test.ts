/**
 * SPARK — ⭐⭐ S195 (owner R195-T1 / B-26) — **TEAM GAMES: THE POINTS RACE IS A TEAM TOTAL.**
 *
 * > *"team games, the points is team total"* — owner, S195
 *
 * The team's summed banked score vs the wave's bar × its player count (⚠ MINE `TEAM_BAR_SCALES_WITH_SIZE`),
 * through the real win gate (`tickGameState`, which the client runs too — a bump) and the real host tick's
 * hunter trigger. A free-for-all keeps the per-seat race.
 */

import { describe, expect, it } from 'vitest';
import { dispatch, makeWorld, type World } from './world.ts';
import { makeGameStateExtras, tickGameState } from './gameState.ts';
import { TEAM_BAR_SCALES_WITH_SIZE, TEAM_TOTAL_COUNTS_FALLEN, teamHunterTriggered, teamPointsWinner, teamStandings } from './teamScore.ts';
import { hunterTriggerScoreForWave, PLAYER_COLORS, winScoreForWave } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { formatRaceReadout } from '../render/ui.ts';

const U = undefined;
const P = (n: number) => asPlayerId(n);

function match(teams: (number | undefined)[], scores: number[], wave = 1): World {
  const w = makeWorld(0x5195);
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: teams.map((t, s) => ({ seat: s, color: PLAYER_COLORS[s]!, ...(t !== undefined ? { team: t } : {}) })),
    botSeats: Array.from({ length: teams.length - 1 }, (_, i) => i + 1),
  });
  w.waveNumber = wave;
  scores.forEach((sc, s) => w.scoreByPlayer.set(P(s), sc));
  w.scoreProgress = Math.max(...scores);
  return w;
}

const gate = (w: World) => { tickGameState(w, makeGameStateExtras(), P(0)); return w; };

describe('S195 R195-T1 — the arithmetic', () => {
  it('the defaults are the flagged MINE values', () => {
    expect(TEAM_BAR_SCALES_WITH_SIZE).toBe(true);
    expect(TEAM_TOTAL_COUNTS_FALLEN).toBe(true);
  });
  it('2v2 at wave 1: each pair races its summed score to 2 × 2,500 = 5,000', () => {
    const w = match([0, 0, 1, 1], [1200, 800, 300, 400]);
    expect(winScoreForWave(1)).toBe(2500);
    expect(teamStandings(w).map((s) => [s.team, s.total, s.bar])).toEqual([[0, 2000, 5000], [1, 700, 5000]]);
  });
  it('the owner\'s B-26 case: 7,000 + 3,000 add up — at wave 6 (bar 5,000) that pair\'s 10,000 wins', () => {
    const w = match([0, 0, 1, 1], [7000, 3000, 0, 0], 6);
    expect(teamPointsWinner(w)).toBe(P(0));
  });
  it('2v1: the pair needs 5,000 together, the solo 2,500 alone', () => {
    const w = match([U, 0, 0], [2400, 2600, 2300]);
    expect(teamStandings(w).map((s) => [s.seats.map(Number), s.total, s.bar])).toEqual([[[1, 2], 4900, 5000], [[0], 2400, 2500]]);
    expect(teamPointsWinner(w)).toBeNull();
  });
});

describe('S195 R195-T1 — REACH through the real win gate (the client runs it too)', () => {
  it('⭐ a pair at 3,000 + 2,000 = 5,000 WINS; the banner seat is its lowest living seat', () => {
    const w = gate(match([0, 0, 1, 1], [3000, 2000, 0, 0]));
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(0));
  });

  it('⛔ a seat at 3,000 whose teammate has 1,000 does NOT win a team game (4,000 < 5,000) — the FFA rule would have', () => {
    const w = gate(match([0, 0, 1, 1], [3000, 1000, 0, 0]));
    expect(w.gameState).toBe('PLAYING');
  });

  it('⛔ NEGATIVE — FFA keeps the per-seat race: 3,000 ≥ 2,500 wins for that seat', () => {
    const w = gate(match([U, U, U, U], [100, 3000, 0, 0]));
    expect(w.teams).toBeUndefined();
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(1));
  });

  it('the 2v1 solo wins on HIS bar (2,500) while the pair sits below theirs', () => {
    const w = gate(match([U, 0, 0], [2500, 2000, 2000]));
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(0));
  });

  it('a fallen teammate\'s banked score still counts; the living teammate names the win', () => {
    const w = match([0, 0, 1, 1], [3000, 2000, 0, 0]);
    w.players.get(P(0))!.castleHp = 0;
    w.players.get(P(0))!.eliminatedAtTick = w.tick;
    expect(teamPointsWinner(w)).toBe(P(1));
  });
});

describe('S195 — the hunter follows the TEAM bar (⚠ MINE)', () => {
  it('fires at 75 % of the team bar, not of one seat\'s', () => {
    const trig = hunterTriggerScoreForWave(1);
    expect(teamHunterTriggered(match([0, 0, 1, 1], [trig, 0, 0, 0]), hunterTriggerScoreForWave)).toBe(false);
    expect(teamHunterTriggered(match([0, 0, 1, 1], [trig, trig, 0, 0]), hunterTriggerScoreForWave)).toBe(true);
  });
});

describe('S195 — the HUD readout', () => {
  it('FFA: the pre-S195 text; a team game: own score · T<n> total/bar', () => {
    expect(formatRaceReadout(1234.7, 1, null)).toBe('1234/2500');
    expect(formatRaceReadout(1234.7, 1, { team: 0, total: 3400, bar: 5000 })).toBe('1234 · T1 3400/5000');
  });
});
