/**
 * SPARK — ⭐ S191 THE END-OF-MATCH STAT BOARD, AS DATA. Pure: `world` in, rows and graph series out.
 *
 * The Pixi view (`matchBoard.ts`) draws exactly this and decides nothing, so every rule a player reads is
 * testable here without a renderer. Spec: `.claude/plans/S191_ENDGAME_STATS_SPEC.md`.
 *
 * ⛔ IT READS ONLY WHAT SURVIVES `WIN_TRIGGER`. The win edge tears down defenders, gatherers, banks and
 * spawners before the first WIN frame (`world.ts`), so a board authored against a PLAYING world passes every
 * test and is EMPTY in the real game (S182 recon, "THE TRAP"). This file therefore never touches those four
 * families: towers come from the recorder's own counters, which the teardown does not clear.
 *
 * ⚠ ONE LADDER. Damage is printed in FIFTHS, the unit that floats off a unit — no ÷5, no "k", no percent.
 */

import type { CreatureType } from '../state/creatures/creature.ts';
import { matchPlacings } from '../state/elimination.ts';
import type { SeatMatchStats } from '../state/matchStats.ts';
import { sameTeam, TEAM_COUNT, teamOf } from '../state/teams.ts';
import { isNetworked } from '../state/world.ts';
import type { World } from '../state/worldTypes.ts';
import type { PlayerId } from '../types.ts';
import { creatureDisplayName } from './characterSheetModel.ts';
import { raceDisplayName } from './raceBanners.ts';

export interface BoardTypeCount {
  readonly type: CreatureType;
  readonly name: string;
  readonly count: number;
}

export interface BoardRow {
  readonly seat: PlayerId;
  /** 1-based finishing place (R10/R20 via `matchPlacings`). */
  readonly place: number;
  readonly placeLabel: string;
  /** `P2` / `BOT 2` — by SEAT, never by colour name (the rainbow shuffle moves colours mid-match). */
  readonly label: string;
  readonly race: string;
  readonly color: number;
  readonly isLocal: boolean;
  readonly isWinner: boolean;
  /** Its castle fell. The FFA comparator: an early-out seat must read as OUT, not as idle. */
  readonly out: boolean;
  /** The wave it fell on, when the host recorded it (null for a standing seat, or an older host). */
  readonly outOnWave: number | null;
  readonly score: number;
  readonly units: number;
  readonly kills: number;
  readonly towersBuilt: number;
  readonly towersFell: number;
  readonly dealt: number;
  readonly taken: number;
  /** Highest count first, then by name — a stable order the eye can compare across rows. */
  readonly unitsByType: readonly BoardTypeCount[];
  readonly killsByType: readonly BoardTypeCount[];
}

export interface BoardSeries {
  readonly seat: PlayerId;
  readonly color: number;
  readonly values: readonly number[];
}

export interface BoardGraph {
  readonly title: string;
  /** The x axis: the waves the history holds, in order. */
  readonly waves: readonly number[];
  /** One series per seat, in placing order; `values[i]` belongs to `waves[i]` (0 where a seat is absent). */
  readonly series: readonly BoardSeries[];
  /** The y axis top, never below 1 so an all-zero graph still has an axis. */
  readonly maxValue: number;
}

export interface MatchBoardModel {
  readonly headline: string;
  readonly headlineColor: number;
  readonly rows: readonly BoardRow[];
  readonly graphs: readonly [BoardGraph, BoardGraph];
  /** True when the host sent no counters at all (an older host): the view says so instead of drawing zeros. */
  readonly noStats: boolean;
}

const ORDINALS = ['1st', '2nd', '3rd'];
export const placeLabel = (place: number): string => ORDINALS[place - 1] ?? `${place}th`;

/** `12345` → `12,345`. Grouping only — the number is still the one the sim subtracted. */
export function groupThousands(n: number): string {
  const s = String(Math.max(0, Math.floor(n)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function byType(m: ReadonlyMap<CreatureType, number> | undefined): BoardTypeCount[] {
  if (m === undefined) return [];
  return [...m.entries()]
    .filter(([, n]) => n > 0)
    .map(([type, count]) => ({ type, name: creatureDisplayName(type) ?? String(type), count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const sum = (m: ReadonlyMap<CreatureType, number> | undefined): number => {
  let t = 0;
  if (m !== undefined) for (const n of m.values()) t += n;
  return t;
};

function seatLabel(world: World, seat: PlayerId): string {
  return world.botSeats.has(seat) ? `BOT ${(seat as number) + 1}` : `P${(seat as number) + 1}`;
}

function graph(
  world: World,
  title: string,
  order: readonly PlayerId[],
  pick: (p: { score: number; built: number }) => number,
): BoardGraph {
  const hist = world.matchStats.history;
  const waves = hist.map((h) => h.wave);
  let maxValue = 1;
  const series = order.map((seat) => {
    const values = hist.map((h) => {
      const p = h.seats.find((s) => s.seat === seat);
      const v = p === undefined ? 0 : pick(p);
      if (v > maxValue) maxValue = v;
      return v;
    });
    return { seat, color: world.players.get(seat)?.color ?? 0xffffff, values };
  });
  return { title, waves, series, maxValue };
}

/** The board, or `null` when it must not show (anything but POSTGAME — the WIN banner lands on its own). */
export function matchBoardModel(world: World): MatchBoardModel | null {
  if (world.gameState !== 'POSTGAME') return null;
  const order = matchPlacings(world);
  const winner = world.lastWinnerId;
  const winnerPlayer = winner === null ? undefined : world.players.get(winner);
  // ⭐ S194 (teams) — with teams on, the SIDE wins: the same "TEAM N WINS" the WIN banner (`ui.ts`) prints,
  // and every teammate of the winner is starred. A seat that picked no team keeps its PLAYER/BOT label.
  // FFA: `world.teams` is undefined, so this is the pre-teams headline and `sameTeam` is `seat === winner`.
  const teamWin = winner !== null && world.teams !== undefined && teamOf(world, winner) < TEAM_COUNT;
  const headline = isNetworked(world) && winner !== null && winnerPlayer !== undefined
    ? teamWin
      ? `TEAM ${teamOf(world, winner) + 1} WINS`
      : `${world.botSeats.has(winner) ? 'BOT' : 'PLAYER'} ${(winner as number) + 1} WINS`
    : 'VICTORY';
  const rows = order.map((seat, i): BoardRow => {
    const p = world.players.get(seat);
    const s: SeatMatchStats | undefined = world.matchStats.seats.get(seat);
    const score = Math.floor(world.scoreByPlayer.get(seat) ?? 0);
    return {
      seat,
      place: i + 1,
      placeLabel: placeLabel(i + 1),
      label: seatLabel(world, seat),
      race: p === undefined ? '' : raceDisplayName(p.raceId),
      color: p?.color ?? 0xffffff,
      isLocal: seat === world.localPlayerId,
      isWinner: winner !== null && sameTeam(world, seat, winner),
      out: p?.eliminatedAtTick !== undefined,
      outOnWave: s?.fellOnWave ?? null,
      score,
      units: sum(s?.built),
      kills: sum(s?.kills),
      towersBuilt: s?.towersBuilt ?? 0,
      towersFell: s?.towersFell ?? 0,
      dealt: s?.dealtFifths ?? 0,
      taken: s?.takenFifths ?? 0,
      unitsByType: byType(s?.built),
      killsByType: byType(s?.kills),
    };
  });
  return {
    headline,
    headlineColor: winnerPlayer?.color ?? 0xffffff,
    rows,
    graphs: [
      graph(world, 'SCORE', order, (p) => p.score),
      // ⚠ MINE — connectors standing (see `sampleBuilt`): what a seat HAS built, rising and falling.
      graph(world, 'BUILT', order, (p) => p.built),
    ],
    noStats: world.matchStats.seats.size === 0 && world.matchStats.history.length === 0,
  };
}
