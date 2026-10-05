/**
 * SPARK — ⭐⭐ S195 (owner R195-T1 / B-26) — **IN A TEAM GAME THE POINTS RACE IS A TEAM TOTAL.**
 *
 * > *"team games, the points is team total"* — owner, S195 (turn 4)
 * > *"do they need … 5,000 points each … or … 10,000 … or if one has 7,000 and the other … 3,000, do they add
 * > up? Good question"* — owner, B-26 (the question that ruling answered)
 *
 * A team's score is the SUM of its members' banked scores, judged against the wave's bar
 * (`winScoreForWave`) × the team's player count (`TEAM_BAR_SCALES_WITH_SIZE`). One helper, read by the win
 * gate (`gameState.ts`), the hunter trigger (`hostTick.ts`) and the HUD — so the three cannot disagree.
 *
 * ⭐ A FREE-FOR-ALL NEVER REACHES THIS FILE: every caller asks `world.teams !== undefined` first, and the
 * per-seat race (`scoreProgress = max(scoreByPlayer)`) is untouched there — byte-identical.
 *
 * PURE over synced state (`scoreByPlayer`, `teams`, `waveNumber`, castle HP), so the host and a client that
 * both run `tickGameState` agree. Total order everywhere (ascending seat; integer cross-multiplication).
 */

import { winScoreForWave } from '../constants.ts';
import type { PlayerId } from '../types.ts';
import type { World } from './world.ts';
import { isEliminated } from './elimination.ts';

/**
 * ⚠ MINE (the owner ruled "team total", not the bar) — **THE TEAM'S BAR IS THE WAVE'S BAR × ITS PLAYER COUNT**,
 * so a pair needs what two solos would and a 2v1 is fair (the pair's 2 × bar vs the solo's 1 × bar). `false`
 * would judge every team against one seat's bar — a pair would then need only half the work per player.
 * One line to flip.
 */
export const TEAM_BAR_SCALES_WITH_SIZE = true;

/**
 * ⚠ MINE — a FALLEN teammate's banked score still counts toward the team total: the team earned it, and
 * dropping it would let one razed keep cost the survivor half his race. (The per-seat FFA race skips fallen
 * seats because a fallen seat cannot win; a team with a survivor still can.)
 */
export const TEAM_TOTAL_COUNTS_FALLEN = true;

export interface TeamStanding {
  /** The team index (`world.teams[seat]`). */
  readonly team: number;
  /** Its seats, ascending. */
  readonly seats: readonly PlayerId[];
  /** The summed banked score (floored per the score gate's float-safe convention). */
  readonly total: number;
  /** The bar it must reach this wave. */
  readonly bar: number;
  /** Its LOWEST LIVING seat (names the team on a win), or `null` when every member has fallen. */
  readonly lead: PlayerId | null;
}

/** ⭐ Every team's standing this tick, in ascending team-index order. `[]` in a free-for-all. */
export function teamStandings(world: Pick<World, 'teams' | 'players' | 'scoreByPlayer' | 'waveNumber'>, barForWave: (wave: number) => number = winScoreForWave): TeamStanding[] {
  const teams = world.teams;
  if (teams === undefined) return [];
  const bySeat = [...world.players.keys()].sort((a, b) => (a as unknown as number) - (b as unknown as number));
  const groups = new Map<number, PlayerId[]>();
  for (const pid of bySeat) {
    const t = teams[pid as unknown as number];
    if (t === undefined) continue;
    const g = groups.get(t);
    if (g === undefined) groups.set(t, [pid]);
    else g.push(pid);
  }
  const out: TeamStanding[] = [];
  for (const team of [...groups.keys()].sort((a, b) => a - b)) {
    const seats = groups.get(team)!;
    let sum = 0;
    let lead: PlayerId | null = null;
    for (const pid of seats) {
      const p = world.players.get(pid)!;
      const fallen = isEliminated(p);
      if (!fallen && lead === null) lead = pid;
      if (fallen && !TEAM_TOTAL_COUNTS_FALLEN) continue;
      sum += world.scoreByPlayer.get(pid) ?? 0;
    }
    const size = TEAM_BAR_SCALES_WITH_SIZE ? seats.length : 1;
    out.push({ team, seats, total: Math.floor(sum), bar: barForWave(world.waveNumber) * size, lead });
  }
  return out;
}

/**
 * ⭐ THE TEAM POINTS WIN: the seat that names the winning team, or `null` (nobody has reached its bar). A team
 * with no living member cannot win. Among several crossing on one tick, the one furthest PAST its bar
 * (total / bar, compared by integer cross-multiplication — no float division), then the lower team index.
 */
export function teamPointsWinner(world: Pick<World, 'teams' | 'players' | 'scoreByPlayer' | 'waveNumber'>): PlayerId | null {
  let best: TeamStanding | null = null;
  for (const s of teamStandings(world)) {
    if (s.lead === null || s.total < s.bar) continue;
    if (best === null || s.total * best.bar > best.total * s.bar) best = s;
  }
  return best?.lead ?? null;
}

/**
 * ⭐ THE HUNTER FOLLOWS THE TEAM BAR (⚠ MINE, the same reasoning as S186's "the trigger follows the bar"):
 * it fires when any team reaches `HUNTER_TRIGGER_FRACTION` of ITS bar. Pinned to one seat's trigger, a pair
 * would summon the anti-runaway hunter at 37.5 % of its own race.
 */
export function teamHunterTriggered(world: Pick<World, 'teams' | 'players' | 'scoreByPlayer' | 'waveNumber'>, triggerForWave: (wave: number) => number): boolean {
  return teamHunterTarget(world, triggerForWave) !== null;
}

/**
 * ⭐ S195 (audit MED-2) — **WHOM THE HUNTER CHASES IN A TEAM GAME: the triggering team's best LIVING seat.**
 * The trigger follows the team bar, so the target must come from the team that tripped it — `findLeadingPlayer`
 * (the top single seat across ALL teams) chased the losing pair's best seat in a 2v1 the solo's team triggered.
 *
 * Among teams past their trigger (`trigger × size`) with at least one living member: the one furthest past it
 * (integer cross-multiplication), then the lower team index; within it, the living seat with the highest banked
 * score, then the lowest seat. `null` = no team has triggered (a team with no living member never does). PURE.
 */
export function teamHunterTarget(world: Pick<World, 'teams' | 'players' | 'scoreByPlayer' | 'waveNumber'>, triggerForWave: (wave: number) => number): PlayerId | null {
  let best: TeamStanding | null = null;
  let bestNeed = 0;
  const trig = triggerForWave(world.waveNumber);
  for (const s of teamStandings(world)) {
    if (s.lead === null) continue;
    const need = trig * (TEAM_BAR_SCALES_WITH_SIZE ? s.seats.length : 1);
    if (s.total < need) continue;
    if (best === null || s.total * bestNeed > best.total * need) {
      best = s;
      bestNeed = need;
    }
  }
  if (best === null) return null;
  let target: PlayerId | null = null;
  let top = -Infinity;
  for (const pid of best.seats) {
    const p = world.players.get(pid)!;
    if (isEliminated(p)) continue;
    const sc = world.scoreByPlayer.get(pid) ?? 0;
    if (sc > top) { top = sc; target = pid; } // seats ascend, so a tie keeps the lower seat
  }
  return target;
}

/**
 * ⭐⭐ RULED (owner, S195 R195-T6) — **AN ENDGAME WIPE CROWNS THE TEAM CLOSEST TO ITS OWN TARGET.**
 * > *"closest to its own target, obviously, if it's one v two, it only makes sense."*
 * At wave 27+ with every keep down (S193 Q2 *"the match ends and the top score wins"*), a team game is judged by
 * the team's total ÷ its bar (the wave's bar × team size) — the win gate's own measure: a pair at 6,000 / 10,000
 * loses to a solo at 4,000 / 5,000. `'total'` (the raw summed score) is kept only as a dead lever; the owner's
 * ruling is `'ratio'` — do not flip it without a new ruling.
 */
export const TEAM_WIPE_JUDGE: 'ratio' | 'total' = 'ratio';

/**
 * ⭐ S195 (audit MED-3) — the seat that names the winning team of an endgame WIPE (everyone's keep down), or
 * `null` in a free-for-all. Best team by `judge` (lower team index on a tie); it is named by its lowest seat
 * among those that fell LAST (the members living at the wipe). PURE, total order.
 */
export function teamWipeWinner(world: Pick<World, 'teams' | 'players' | 'scoreByPlayer' | 'waveNumber'>, judge: 'ratio' | 'total' = TEAM_WIPE_JUDGE): PlayerId | null {
  let best: TeamStanding | null = null;
  for (const s of teamStandings(world)) {
    if (best === null) { best = s; continue; }
    const better = judge === 'ratio' ? s.total * best.bar > best.total * s.bar : s.total > best.total;
    if (better) best = s;
  }
  if (best === null) return null;
  let lastFall = -Infinity;
  for (const pid of best.seats) lastFall = Math.max(lastFall, world.players.get(pid)!.eliminatedAtTick ?? Infinity);
  for (const pid of best.seats) if ((world.players.get(pid)!.eliminatedAtTick ?? Infinity) === lastFall) return pid;
  return best.seats[0] ?? null;
}
