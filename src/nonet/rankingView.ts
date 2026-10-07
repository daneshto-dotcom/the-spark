/**
 * SPARK — S196 #16: **WHAT THE NONET HOME'S RANKING PAGE MAY SHOW — and the reveal gate it keeps.**
 *
 * ⛔ R182-G (SPARK_CANON §9): *"You can't see all the names before you put your name"* — the board is
 * gated on SUBMISSION, an anti-griefing rule, and `arcadeLeaderboard.ts` deliberately has no `top()`.
 * A RANKING button that fetched the live table would open exactly the hole that rule closes.
 *
 * So RANKING shows only boards THIS DEVICE has already submitted to, as they stood after its last
 * submission (the local cache `RemoteLeaderboard.submit` / `LocalLeaderboard.submit` write — nothing
 * else ever writes it). A board you have never filed to reads LOCKED with the reason. No network call.
 *
 * ⚠ MINE — reported as an owner question: the spec's "RANKING (today's average board)" read
 * literally would show the live board to anyone; this is the reading that keeps R182-G.
 */
import { BOARD_NONET, loadRanking, rankRows, type RankingEntry, type RankingRow } from '../render/arcadeScores.ts';
import { dailyBoardId } from './dailySeed.ts';

/** Rows shown per panel — two panels side by side must fit one screen. */
export const RANKING_PANEL_ROWS = 10;

export interface RankingPanel {
  readonly title: string;
  readonly boardId: string;
  /** `null` = LOCKED: this device has never filed a run to this board. */
  readonly rows: readonly RankingRow[] | null;
}

/** `20261007` → `7 OCT 2026`. */
export function formatDayKey(dayKey: string): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const m = Number(dayKey.slice(4, 6));
  return `${Number(dayKey.slice(6, 8))} ${months[m - 1] ?? '???'} ${dayKey.slice(0, 4)}`;
}

/**
 * PURE (given `load`) — today's daily board and the all-time timed board, each either its cached rows
 * (top `RANKING_PANEL_ROWS`, ranked by average) or LOCKED.
 */
export function rankingPanels(
  todayKey: string,
  load: (boardId: string) => readonly RankingEntry[] = loadRanking,
): RankingPanel[] {
  const panel = (title: string, boardId: string): RankingPanel => {
    const entries = load(boardId);
    return { title, boardId, rows: entries.length === 0 ? null : rankRows(entries).slice(0, RANKING_PANEL_ROWS) };
  };
  return [
    panel(`DAILY · ${formatDayKey(todayKey)}`, dailyBoardId(todayKey)),
    panel('TIMED · ALL-TIME AVERAGE', BOARD_NONET),
  ];
}
