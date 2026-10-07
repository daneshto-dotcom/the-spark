/**
 * SPARK — S196 #16 (Option A, "a front door"): **THE DAILY NONET — one grid per UTC day, the same for
 * everyone.** Spec: `.claude/plans/S195_NONET_HOME_OPTIONS.md` §(b) Option A + §(c).1 ("one fixed seed
 * per UTC day, everyone solves the same grid, a board per day").
 *
 * ## ⛔ EVERY FUNCTION HERE IS PURE — THE CLOCK IS READ BY THE CALLER, AT THE MENU
 *
 * The date comes from `Date.now()` at the NONET home when DAILY is pressed. That is UI, not the sim:
 * an arcade puzzle touches no simulation state, crosses no wire and is never hashed (`arcadeOverlay.ts`
 * header; `world.sudoku` stays null for the whole run). So a wall clock is legitimate at the call site,
 * and everything below takes the epoch-ms as an ARGUMENT, which keeps it deterministic and testable:
 * two players whose clocks agree on the UTC date get byte-identical seeds, on any machine, in any time
 * zone. ⚠ A player whose device clock is WRONG by a day plays the wrong day's grid and files to that
 * day's board — accepted; the worker only accepts boards within a day of its own clock (see
 * `server/leaderboard/worker.js` `dailyBoardAcceptable`).
 *
 * No `Math.random`, no float accumulation: the seed is an integer hash of the eight-digit day key.
 */

/** The board-id prefix of every daily board: `nonet:d20261007`. Matches the worker's `BOARD_RE`. */
export const DAILY_BOARD_PREFIX = 'nonet:d';

/** One UTC day, in ms. */
export const DAY_MS = 86_400_000;

/**
 * PURE — the UTC calendar day of `epochMs` as `YYYYMMDD`. `getUTC*` reads the instant, never the
 * device's time zone, which is the whole "same for everyone" property.
 */
export function utcDayKey(epochMs: number): string {
  const d = new Date(Math.floor(epochMs));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, '0')}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

/** PURE — is this an eight-digit day key that names a real calendar date? */
export function isDayKey(key: string): boolean {
  if (!/^\d{8}$/.test(key)) return false;
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(4, 6));
  const d = Number(key.slice(6, 8));
  if (m < 1 || m > 12 || d < 1) return false;
  return utcDayKey(Date.UTC(y, m - 1, d)) === key; // rejects 20261131 (rolls to Dec 1)
}

/**
 * PURE — the day's puzzle seed: FNV-1a over the key's characters, then a murmur3 finaliser so
 * consecutive days (keys differing in their last digit) land far apart. Unsigned 32-bit, like every
 * other NONET seed (`makeArcadeNonet(seed >>> 0)`).
 *
 * ⚠ The salt string makes the daily stream disjoint from "seed = the day number" — it is MINE and
 * changing it changes every past and future daily grid, so it is pinned by a test.
 */
export const DAILY_SEED_SALT = 'spark-nonet-daily-v1:';

export function dailySeed(dayKey: string): number {
  return dailySeedHash(DAILY_SEED_SALT + dayKey);
}

/**
 * PURE — the string hash under every fixed NONET seed (the daily's, and the campaign's stage seeds in
 * `campaign.ts`): FNV-1a, then the murmur3 finaliser. Unsigned 32-bit.
 */
export function dailySeedHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** PURE — the day's own average board. */
export function dailyBoardId(dayKey: string): string {
  return `${DAILY_BOARD_PREFIX}${dayKey}`;
}

/** PURE — the day key inside a daily board id, or null when `boardId` is not a daily board. */
export function dayKeyOfBoard(boardId: string): string | null {
  if (!boardId.startsWith(DAILY_BOARD_PREFIX)) return null;
  const key = boardId.slice(DAILY_BOARD_PREFIX.length);
  return isDayKey(key) ? key : null;
}
