/**
 * SPARK — ⭐ S191 THE END-OF-MATCH STAT BOARD, AS DATA. Pure: `world` in, rows, pages and charts out.
 * ⭐ S194 v2 — tabs, a page per player, and four charts that each answer a DIFFERENT question.
 *
 * Owner, S194, looking at the v1 board: *"Maybe different types of graphs, maybe more interactive ones, maybe
 * more coherent ones. Um, it seems like you just posted two of the same graphs there … Give you different
 * pages that you can go per player, like in Dota."* Research + design: `.claude/plans/S194_PROGRESS_matchboard.md`.
 *
 * The Pixi view (`matchBoard.ts`) draws exactly this and decides nothing, so every rule a player reads is
 * testable here without a renderer. Spec v1: `.claude/plans/S191_ENDGAME_STATS_SPEC.md`.
 *
 * ⛔ IT READS ONLY WHAT SURVIVES `WIN_TRIGGER`. The win edge tears down defenders, gatherers, banks and
 * spawners before the first WIN frame (`world.ts`), so a board authored against a PLAYING world passes every
 * test and is EMPTY in the real game (S182 recon, "THE TRAP"). This file therefore never touches those four
 * families: towers come from the recorder's own counters, which the teardown does not clear.
 *
 * ⚠ ONE LADDER. Damage is printed in FIFTHS, the unit that floats off a unit — no ÷5, no "k", no percent.
 * ⛔ NO COMPOSITE MVP SCORE (S179 research, the LTD2 "pressure applied" failure): a row's badge is a stat it
 * actually LEADS, never a weighted blend.
 */

import type { CreatureType } from '../state/creatures/creature.ts';
import { matchPlacings } from '../state/elimination.ts';
import type { SeatMatchStats, WaveSampleSeat } from '../state/matchStats.ts';
import type { RaceId } from '../state/races.ts';
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

/** One line of a player page's UNITS ledger: what it raised, lost and killed of one type. */
export interface BoardUnitLine {
  readonly type: CreatureType;
  readonly name: string;
  readonly built: number;
  readonly lost: number;
  readonly killed: number;
}

/** Damage split by what it landed on. `units + structures + keep === total`. */
export interface BoardDamageSplit {
  readonly total: number;
  readonly units: number;
  readonly structures: number;
  readonly keep: number;
}

export interface BoardSeatAmount {
  readonly seat: PlayerId;
  readonly label: string;
  readonly color: number;
  readonly amount: number;
}

export interface BoardRow {
  readonly seat: PlayerId;
  /** 1-based finishing place (R10/R20 via `matchPlacings`). */
  readonly place: number;
  readonly placeLabel: string;
  /** `P2` / `BOT 2` — by SEAT, never by colour name (the rainbow shuffle moves colours mid-match). */
  readonly label: string;
  readonly race: string;
  readonly raceId: RaceId | null;
  readonly color: number;
  readonly isLocal: boolean;
  readonly isWinner: boolean;
  /** Its castle fell. The FFA comparator: an early-out seat must read as OUT, not as idle. */
  readonly out: boolean;
  /** The wave it fell on, when the host recorded it (null for a standing seat, or an older host). */
  readonly outOnWave: number | null;
  /** ⭐ S194 — the survival marker as the row prints it: `STANDING`, `OUT W7`, or `OUT`. */
  readonly status: string;
  /** ⭐ S194 — the ONE distinction this row leads the table in, or null. Never a blend. */
  readonly badge: string | null;
  readonly score: number;
  readonly units: number;
  readonly kills: number;
  readonly lost: number;
  readonly towersBuilt: number;
  readonly towersFell: number;
  readonly dealt: number;
  readonly taken: number;
  readonly dealtSplit: BoardDamageSplit;
  readonly takenSplit: BoardDamageSplit;
  /** Highest count first, then by name — a stable order the eye can compare across rows. */
  readonly unitsByType: readonly BoardTypeCount[];
  readonly killsByType: readonly BoardTypeCount[];
  readonly lostByType: readonly BoardTypeCount[];
  /** ⭐ S194 — the per-player page's ledger: every type it raised, lost or killed. */
  readonly unitLines: readonly BoardUnitLine[];
  /** ⭐ S194 — WHO-HIT-WHOM, this seat's row and column: dealt to each enemy, taken from each enemy. */
  readonly dealtTo: readonly BoardSeatAmount[];
  readonly takenFrom: readonly BoardSeatAmount[];
  /** ⭐ S194 — the most connectors it ever had standing at a wave edge (the BUILD chart's peak). */
  readonly peakBuilt: number;
}

export interface BoardSeries {
  readonly seat: PlayerId;
  readonly label: string;
  readonly color: number;
  readonly values: readonly number[];
}

export interface BoardGraph {
  readonly title: string;
  /** One line of plain words under the title: what the chart MEANS, not what it is. */
  readonly caption: string;
  /** The x axis: the waves the history holds, in order. */
  readonly waves: readonly number[];
  /** One series per seat, in placing order; `values[i]` belongs to `waves[i]` (0 where a seat is absent). */
  readonly series: readonly BoardSeries[];
  /** The y axis top, never below 1 so an all-zero graph still has an axis. For `stacked`, the top STACK. */
  readonly maxValue: number;
  /** How the view draws it — each chart answers a different question, so each gets a different form. */
  readonly form: 'lines' | 'bars' | 'stackedArea' | 'stackedBars';
}

/** ⭐ S194 — WHO HIT WHOM. `cells[i][j]` = damage seat `seats[i]` dealt to seat `seats[j]`; diagonal 0. */
export interface BoardMatrix {
  readonly seats: readonly PlayerId[];
  readonly labels: readonly string[];
  readonly colors: readonly number[];
  readonly cells: readonly (readonly number[])[];
  readonly maxValue: number;
}

export interface MatchBoardGraphs {
  /** OVERVIEW — the race: banked score per wave, one line per seat (Dota's net-worth graph). */
  readonly score: BoardGraph;
  /** GRAPHS — damage dealt IN each wave (not a running total): grouped bars (LTD2's per-wave bars). */
  readonly damage: BoardGraph;
  /** GRAPHS — connectors standing, stacked: each seat's share of everything built (AoE2's timeline). */
  readonly built: BoardGraph;
  /** GRAPHS — enemy units killed IN each wave, stacked per seat. */
  readonly kills: BoardGraph;
}

export interface MatchBoardModel {
  readonly headline: string;
  readonly headlineColor: number;
  /** ⭐ S194 — one line under the headline: how long, how many, how many still standing. */
  readonly subline: string;
  readonly rows: readonly BoardRow[];
  readonly graphs: MatchBoardGraphs;
  readonly matrix: BoardMatrix;
  /** ⭐ S194 — damage TAKEN in each wave alone, per seat (the player page's ledger draws it under the axis). */
  readonly takenPerWave: readonly BoardSeries[];
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

const byName = (a: { name: string }, b: { name: string }): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const nameOf = (type: CreatureType): string => creatureDisplayName(type) ?? String(type);

function byType(m: ReadonlyMap<CreatureType, number> | undefined): BoardTypeCount[] {
  if (m === undefined) return [];
  return [...m.entries()]
    .filter(([, n]) => n > 0)
    .map(([type, count]) => ({ type, name: nameOf(type), count }))
    .sort((a, b) => b.count - a.count || byName(a, b));
}

/** Every type the seat raised, lost or killed. Most raised first, then most killed, then by name. */
function unitLines(s: SeatMatchStats | undefined): BoardUnitLine[] {
  if (s === undefined) return [];
  const types = new Set<CreatureType>([...s.built.keys(), ...s.kills.keys(), ...(s.lost?.keys() ?? [])]);
  return [...types]
    .map((type) => ({
      type,
      name: nameOf(type),
      built: s.built.get(type) ?? 0,
      lost: s.lost?.get(type) ?? 0,
      killed: s.kills.get(type) ?? 0,
    }))
    .filter((l) => l.built + l.lost + l.killed > 0)
    .sort((a, b) => b.built - a.built || b.killed - a.killed || byName(a, b));
}

const sum = (m: ReadonlyMap<unknown, number> | undefined): number => {
  let t = 0;
  if (m !== undefined) for (const n of m.values()) t += n;
  return t;
};

function split(total: number, keep: number, structures: number): BoardDamageSplit {
  // Clamped so a malformed older payload can never print a negative unit share.
  const k = Math.min(total, Math.max(0, keep));
  const st = Math.min(total - k, Math.max(0, structures));
  return { total, keep: k, structures: st, units: total - k - st };
}

function seatLabel(world: World, seat: PlayerId): string {
  return world.botSeats.has(seat) ? `BOT ${(seat as number) + 1}` : `P${(seat as number) + 1}`;
}

/** The value one wave sample holds for a seat, by key. */
type SamplePick = (p: WaveSampleSeat) => number;

function seriesOf(
  world: World,
  order: readonly PlayerId[],
  pick: SamplePick,
  perWave: boolean,
): BoardSeries[] {
  const hist = world.matchStats.history;
  return order.map((seat) => {
    let prev = 0;
    const values = hist.map((h) => {
      const p = h.seats.find((s) => s.seat === seat);
      const v = p === undefined ? prev : pick(p);
      // ⭐ PER-WAVE = the difference of two running totals. Never negative (a replaced history cannot
      // shrink a total, but a malformed one must not draw a bar below the axis).
      const out = perWave ? Math.max(0, v - prev) : v;
      prev = v;
      return out;
    });
    return { seat, label: seatLabel(world, seat), color: world.players.get(seat)?.color ?? 0xffffff, values };
  });
}

function graphOf(
  title: string,
  caption: string,
  form: BoardGraph['form'],
  waves: readonly number[],
  series: readonly BoardSeries[],
): BoardGraph {
  let maxValue = 1;
  if (form === 'stackedArea' || form === 'stackedBars') {
    for (let i = 0; i < waves.length; i++) {
      let t = 0;
      for (const s of series) t += s.values[i] ?? 0;
      if (t > maxValue) maxValue = t;
    }
  } else {
    for (const s of series) for (const v of s.values) if (v > maxValue) maxValue = v;
  }
  return { title, caption, form, waves, series, maxValue };
}

/**
 * ⭐ S194 — THE BADGES: each row gets AT MOST one distinction, and only one it LEADS outright. Categories are
 * tried in this order; a category whose leader already wears a badge, or whose top is tied or zero, awards
 * nothing — the runner-up is never promoted, because "second-most kills" is not a distinction.
 * ⚠ MINE, not the owner's: the category list and its order. `MOST DAMAGE` counts what was dealt to anything.
 */
export const BADGE_CATEGORIES: ReadonlyArray<{ readonly badge: string; readonly of: (r: BoardRow) => number }> = [
  { badge: 'MOST KILLS', of: (r) => r.kills },
  { badge: 'MOST DAMAGE', of: (r) => r.dealt },
  { badge: 'BIGGEST ARMY', of: (r) => r.units },
  { badge: 'MASTER BUILDER', of: (r) => r.towersBuilt },
  { badge: 'KEEP BREAKER', of: (r) => r.dealtSplit.keep },
  { badge: 'IRON WALL', of: (r) => r.peakBuilt },
];

export function assignBadges(rows: readonly BoardRow[]): Map<PlayerId, string> {
  const out = new Map<PlayerId, string>();
  for (const c of BADGE_CATEGORIES) {
    let best: BoardRow | null = null;
    let tied = false;
    for (const r of rows) {
      const v = c.of(r);
      if (best === null || v > c.of(best)) {
        best = r;
        tied = false;
      } else if (v === c.of(best)) {
        tied = true;
      }
    }
    if (best === null || tied || c.of(best) <= 0 || out.has(best.seat)) continue;
    out.set(best.seat, c.badge);
  }
  return out;
}

/** The board, or `null` when it must not show (anything but POSTGAME — the WIN banner lands on its own). */
export function matchBoardModel(world: World): MatchBoardModel | null {
  if (world.gameState !== 'POSTGAME') return null;
  const order = matchPlacings(world);
  const winner = world.lastWinnerId;
  const winnerPlayer = winner === null ? undefined : world.players.get(winner);
  const headline = isNetworked(world) && winner !== null && winnerPlayer !== undefined
    ? `${world.botSeats.has(winner) ? 'BOT' : 'PLAYER'} ${(winner as number) + 1} WINS`
    : 'VICTORY';
  const hist = world.matchStats.history;
  const peakOf = (seat: PlayerId): number => {
    let m = 0;
    for (const h of hist) for (const p of h.seats) if (p.seat === seat && p.built > m) m = p.built;
    return m;
  };
  const amountsFor = (pairs: Array<[PlayerId, number]>): BoardSeatAmount[] =>
    pairs
      .filter(([, n]) => n > 0)
      .map(([seat, amount]) => ({
        seat, amount, label: seatLabel(world, seat), color: world.players.get(seat)?.color ?? 0xffffff,
      }))
      .sort((a, b) => b.amount - a.amount || (a.seat as number) - (b.seat as number));

  const baseRows = order.map((seat, i): BoardRow => {
    const p = world.players.get(seat);
    const s: SeatMatchStats | undefined = world.matchStats.seats.get(seat);
    const score = Math.floor(world.scoreByPlayer.get(seat) ?? 0);
    const out = p?.eliminatedAtTick !== undefined;
    const outOnWave = s?.fellOnWave ?? null;
    const dealt = s?.dealtFifths ?? 0;
    const taken = s?.takenFifths ?? 0;
    const takenFrom: Array<[PlayerId, number]> = [];
    for (const [other, os] of world.matchStats.seats) {
      if (other !== seat) takenFrom.push([other, os.dealtTo?.get(seat) ?? 0]);
    }
    return {
      seat,
      place: i + 1,
      placeLabel: placeLabel(i + 1),
      label: seatLabel(world, seat),
      race: p === undefined ? '' : raceDisplayName(p.raceId),
      raceId: p?.raceId ?? null,
      color: p?.color ?? 0xffffff,
      isLocal: seat === world.localPlayerId,
      isWinner: seat === winner,
      out,
      outOnWave,
      status: out ? (outOnWave !== null ? `OUT W${outOnWave}` : 'OUT') : 'STANDING',
      badge: null,
      score,
      units: sum(s?.built),
      kills: sum(s?.kills),
      lost: sum(s?.lost),
      towersBuilt: s?.towersBuilt ?? 0,
      towersFell: s?.towersFell ?? 0,
      dealt,
      taken,
      dealtSplit: split(dealt, s?.dealtKeep ?? 0, s?.dealtStruct ?? 0),
      takenSplit: split(taken, s?.takenKeep ?? 0, s?.takenStruct ?? 0),
      unitsByType: byType(s?.built),
      killsByType: byType(s?.kills),
      lostByType: byType(s?.lost),
      unitLines: unitLines(s),
      dealtTo: amountsFor([...(s?.dealtTo?.entries() ?? [])]),
      takenFrom: amountsFor(takenFrom),
      peakBuilt: peakOf(seat),
    };
  });
  const badges = assignBadges(baseRows);
  const rows = baseRows.map((r) => ({ ...r, badge: badges.get(r.seat) ?? null }));

  const waves = hist.map((h) => h.wave);
  const graphs: MatchBoardGraphs = {
    score: graphOf('SCORE RACE', 'banked score at the end of each wave', 'lines', waves,
      seriesOf(world, order, (p) => p.score, false)),
    damage: graphOf('DAMAGE PER WAVE', 'damage dealt in that wave alone', 'bars', waves,
      seriesOf(world, order, (p) => p.dealt, true)),
    // ⚠ MINE — connectors standing (see `sampleBuilt`): what a seat HAS built, rising and falling.
    built: graphOf('BUILT, STANDING', 'connectors each seat has standing — its share of the board', 'stackedArea', waves,
      seriesOf(world, order, (p) => p.built, false)),
    kills: graphOf('KILLS PER WAVE', 'enemy units killed in that wave alone', 'stackedBars', waves,
      seriesOf(world, order, (p) => p.kills, true)),
  };

  let maxCell = 1;
  const cells = order.map((a) => order.map((v) => {
    const n = a === v ? 0 : world.matchStats.seats.get(a)?.dealtTo?.get(v) ?? 0;
    if (n > maxCell) maxCell = n;
    return n;
  }));
  const matrix: BoardMatrix = {
    seats: order,
    labels: order.map((s) => seatLabel(world, s)),
    colors: order.map((s) => world.players.get(s)?.color ?? 0xffffff),
    cells,
    maxValue: maxCell,
  };

  const standing = rows.filter((r) => !r.out).length;
  const lastWave = waves.length > 0 ? waves[waves.length - 1]! : world.waveNumber;
  const subline = `WAVE ${lastWave}  ·  ${rows.length} SEATS  ·  ${standing} STANDING`;

  return {
    headline,
    headlineColor: winnerPlayer?.color ?? 0xffffff,
    subline,
    rows,
    graphs,
    matrix,
    takenPerWave: seriesOf(world, order, (p) => p.taken, true),
    noStats: world.matchStats.seats.size === 0 && world.matchStats.history.length === 0,
  };
}
