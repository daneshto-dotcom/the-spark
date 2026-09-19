/**
 * SPARK — **THE ARCADE RANKING STORE.** S149 built it, S182 R182-G rebuilt what it measures.
 *
 * ## ⭐⭐ THE RANKING IS AN AVERAGE, NOT A BEST TIME (owner R182-G, S182)
 *
 * > *"The leaderboard will hold the AVERAGE time it takes a user to complete. If a user played ten
 * > games and the average is a minute twenty, then every new game calculates his new latest time and
 * > boom, his new time. So people are competing over a long span."*
 *
 * The board used to be one row per RUN — twenty-five best times, any of which could be a single
 * lucky puzzle. It is now one row per PLAYER, ranked by their mean completion time across every run
 * they have ever submitted.
 *
 * ⭐ **AND THIS IS WHAT MAKES RANDOM PUZZLES FAIR, which is the whole insight.** An arcade NONET is
 * minted from `performance.now()`, so no two players ever solve the same grid — under a best-time
 * board that is simply unfair, and a fixed seed set was the obvious fix. It is not needed. Difficulty
 * variance is noise with a mean, and an average over N runs washes it out; the player who is
 * genuinely faster wins over a span even though no single pair of runs is comparable. The ladder of
 * fixed stages that S182 researched is **withdrawn** — random generation stays exactly as it is.
 *
 * ## ⛔ SUM AND COUNT ARE STORED. THE AVERAGE IS DERIVED, ALWAYS.
 *
 * `runs` + `totalMs`, never a stored mean. Folding a new run into a stored average
 * (`avg = (avg * n + ms) / (n + 1)`) is lossy: each step rounds, the error compounds with every
 * game, and a player who has logged two hundred runs ends up ranked on an accumulation of rounding
 * rather than on their times. With sum and count the mean is exact at every point and recomputable
 * from scratch, which also means the server and the client can compute it independently and agree.
 *
 * ## Identity is the TYPED NAME, and that is a deliberate, accepted trade
 *
 * Owner: *"hold people at their same name, if not then who cares, come back to it later."* Two
 * people who pick `DAN` share a row and their averages merge. There is no device id, no UUID and no
 * migration path — real identity arrives with a Steam or Google login much later, and inventing a
 * half-identity now would have to be unpicked then.
 *
 * ## Storage
 *
 * `localStorage`, per browser profile — the OFFLINE tier beneath `arcadeLeaderboard.ts`. Every read
 * is total: a corrupted or hand-edited key degrades to an empty ranking rather than throwing on the
 * title screen, because storage is user-writable and survives deploys.
 *
 * PURE apart from the storage functions, so every ranking rule is unit-testable headlessly.
 */

/** How many rows the ranking shows. Owner's number, S149, unchanged by the rebuild. */
export const TOP_N = 25;

/** Arcade initials are exactly three characters. */
export const NAME_LEN = 3;

/** The alphabet the initials picker cycles. Space last, so "AB " is reachable. */
export const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

/**
 * ⭐ THE DEFAULT BOARD ID. Opaque on purpose: it is a string on the client and a COLUMN on the
 * server, so a second board costs a value rather than a migration.
 */
export const BOARD_NONET = 'nonet';

/**
 * localStorage key for a board's ranking.
 *
 * ⚠ `.ranking.v1`, DELIBERATELY NOT REUSING `.scores.v1`. The old key holds per-RUN rows in a shape
 * this module can no longer read, and silently reinterpreting them would have invented run counts
 * from nowhere — a player with 25 best times is not a player with 25 runs. A new key means the old
 * data is simply ignored, which is the honest outcome: a local best-time table cannot be converted
 * into an average history, because the information required (how many runs, including the slow ones)
 * was never recorded.
 */
function rankingKeyFor(boardId: string): string {
  return `spark.arcade.${boardId}.ranking.v1`;
}

/** Key for runs the network has not accepted yet. See `loadPending`. */
function pendingKeyFor(boardId: string): string {
  return `spark.arcade.${boardId}.pending.v1`;
}

/** One player's stored standing. ⛔ The average is NOT stored — see the docblock. */
export interface RankingEntry {
  /** Exactly three characters, upper case. THE identity. */
  readonly name: string;
  /** How many runs have been folded in. Never zero for a stored entry. */
  readonly runs: number;
  /** Sum of every run's elapsed milliseconds. */
  readonly totalMs: number;
}

/** A rendered row: what the player reads. `averageMs` is derived, never persisted. */
export interface RankingRow {
  readonly name: string;
  readonly runs: number;
  readonly averageMs: number;
}

/** A run recorded locally that the shared ranking has not accepted yet. */
export interface PendingRun {
  readonly name: string;
  readonly ms: number;
  /**
   * ⭐ THE IDEMPOTENCY KEY, and it MUST survive being queued — that is the whole point.
   *
   * Delivery is at-least-once: the client bounds a submit at 4 s while the worker makes several
   * sequential D1 round trips, so a timeout can abort a request the server has ALREADY COMMITTED. The
   * client then queues the run and the next flush folds it a SECOND time. Under a mean that
   * double-count is permanent and unrepairable. Minting a FRESH id on the retry would defeat the
   * defence entirely, so the id is generated once, when the run happens, and stored with it.
   */
  readonly id: string;
  /**
   * ⭐⭐ S183 — WHEN THE RUN WAS MINTED (`Date.now()`), AND IT IS WHAT MAKES THE ID ABOVE WORTH
   * ANYTHING.
   *
   * ⛔ **THE ID PROTECTS A RETRY ONLY FOR AS LONG AS THE SERVER REMEMBERS IT, AND THE TWO SIDES DID
   * NOT AGREE.** `seen_runs` is pruned after `SEEN_RUN_TTL_MS` (24 h) on every POST from ANY client,
   * while this queue was bounded by COUNT alone (`PENDING_CAP`) and carried no time at all. So:
   *
   *   1. a run commits server-side but the 4 s abort fires before the reply lands, and it queues;
   *   2. the player does not play for two days; some other player's POST prunes the key;
   *   3. the next flush re-sends it, the dedupe SELECT misses, and `runs + 1, total_ms + ms` fires
   *      a SECOND time for one game.
   *
   * Sum-and-count is cumulative, so **no later play repairs it** — the same argument the worker and
   * `schema.sql` make for storing the pair rather than a rolling mean, turned against us.
   *
   * ⚠ THE COST IS REAL AND IS THE LESSER ONE. Past `PENDING_MAX_AGE_MS` the run is dropped instead
   * of re-sent, so a player who is offline for longer than that loses the run from the shared board.
   * That is one absent run against a permanently-wrong average, on a board whose entire claim is
   * that the average is LOSSLESS (`SPARK_CANON.md` §9).
   */
  readonly at: number;
}

/**
 * A fresh idempotency key.
 *
 * ⚠ `crypto.randomUUID` needs a secure context, which https and localhost both are — but a plain-http
 * LAN address is not, and neither is an old browser. The fallback is not cryptographic and does not
 * need to be: a collision costs one dropped fold, and these are compared only against this player's
 * own recent runs.
 */
export function newRunId(): string {
  const c = globalThis.crypto;
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID();
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The exact mean, derived. Guards `runs === 0` so a hand-edited key cannot produce `NaN` or
 * `Infinity` and put an un-sortable row at the top of the table forever.
 */
export function averageMsOf(entry: RankingEntry): number {
  return entry.runs > 0 ? entry.totalMs / entry.runs : 0;
}

export function toRow(entry: RankingEntry): RankingRow {
  return { name: entry.name, runs: entry.runs, averageMs: averageMsOf(entry) };
}

/**
 * ⛔ THE ORDERING RULE, IN ONE PLACE. LOWER IS BETTER — this is a time trial, so every comparison is
 * `<` rather than `>`. Getting it backwards still yields a plausible-looking table (sorted, capped,
 * ranked 1..25) that silently celebrates the slowest players, which is exactly what a green suite
 * waves through. The tests pin the direction explicitly.
 *
 * Ties break on **more runs first** — at an identical average, the player who has proved it over
 * more games is ahead — and then on name, so the order is total and two clients cannot disagree.
 */
export function compareRows(a: RankingRow, b: RankingRow): number {
  if (a.averageMs !== b.averageMs) return a.averageMs - b.averageMs; // ⛔ lower average wins
  if (a.runs !== b.runs) return b.runs - a.runs; // more runs at the same average ranks higher
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** PURE — entries → the rendered, sorted, capped ranking. */
export function rankRows(entries: readonly RankingEntry[]): RankingRow[] {
  return entries.map(toRow).sort(compareRows).slice(0, TOP_N);
}

/**
 * PURE — the 1-based place `name` holds in `rows`, or `rows.length + 1` when absent.
 *
 * ⚠ BY NAME, NOT BY VALUE, because a player's row is their identity now rather than one of their
 * results. There is exactly one row per name, so there is exactly one answer.
 */
export function placeOfName(rows: readonly RankingRow[], name: string): number {
  const at = rows.findIndex((r) => r.name === name);
  return at >= 0 ? at + 1 : rows.length + 1;
}

/**
 * ⭐ PURE — fold one completed run into the ranking. THE core rule of R182-G.
 *
 * Returns the new entry list. An existing name accumulates (`runs + 1`, `totalMs + ms`); a new name
 * starts at one run. Nothing is rounded and nothing is discarded, so replaying the same runs in any
 * order produces the identical result.
 */
export function foldRun(
  entries: readonly RankingEntry[],
  rawName: string,
  ms: number,
): RankingEntry[] {
  const name = normaliseName(rawName);
  const clean = Number.isFinite(ms) && ms > 0 ? ms : 0;
  let found = false;
  const out = entries.map((e) => {
    if (e.name !== name) return e;
    found = true;
    return { name, runs: e.runs + 1, totalMs: e.totalMs + clean };
  });
  if (!found) out.push({ name, runs: 1, totalMs: clean });
  return out;
}

/** PURE — the entry for `name`, or `null`. Used to read the average BEFORE a fold, for the recap. */
export function entryOf(
  entries: readonly RankingEntry[],
  rawName: string,
): RankingEntry | null {
  const name = normaliseName(rawName);
  return entries.find((e) => e.name === name) ?? null;
}

/**
 * PURE — clamp arbitrary text to a legal set of initials.
 *
 * Upper-cased, filtered to the alphabet, padded to exactly three. Anything unmappable becomes the
 * arcade default `AAA` rather than an empty row, because a nameless entry on a ranking reads as a bug.
 *
 * ⛔ S150 P3 — THE ALL-SPACE HOLE. `NAME_ALPHABET` deliberately ENDS with a space so that "AB " is
 * reachable, which makes a space a *mappable* character — so three of them sailed through the filter
 * and `normaliseName('   ')` returned a visually BLANK row. The fix is narrower than "reject spaces":
 * a name needs at least ONE non-space character, and beyond that spaces are legal wherever the player
 * put them.
 */
export function normaliseName(raw: string): string {
  const kept = [...String(raw ?? '').toUpperCase()]
    .filter((c) => NAME_ALPHABET.includes(c))
    .slice(0, NAME_LEN);
  while (kept.length < NAME_LEN) kept.push('A');
  const name = kept.join('');
  return name.trim().length === 0 ? 'A'.repeat(NAME_LEN) : name;
}

/** Elapsed ms → the cabinet's `M:SS.cc` readout. Clamped at zero; never negative on screen. */
export function formatTime(ms: number): string {
  const t = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(t / 60000);
  const seconds = Math.floor((t % 60000) / 1000);
  const centis = Math.floor((t % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/**
 * PURE, TOTAL — coerce arbitrary parsed JSON into well-formed entries.
 *
 * ⭐ SHARED BY THE STORAGE PATH AND THE NETWORK PATH, so the network cannot be less paranoid than
 * localStorage. The same bytes now arrive from a PUBLIC endpoint anyone can POST to, which needs
 * strictly more suspicion; a second hand-rolled parser on the fetch side is how the two drift until
 * one lets a `NaN`, a negative total or a 400-character name onto the table.
 */
export function parseRankingEntries(parsed: unknown): RankingEntry[] {
  if (!Array.isArray(parsed)) return [];
  const rows: RankingEntry[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== 'string') continue;
    const runs = Number(o.runs);
    const totalMs = Number(o.totalMs);
    if (!Number.isFinite(runs) || !Number.isInteger(runs) || runs <= 0) continue;
    if (!Number.isFinite(totalMs) || totalMs < 0) continue;
    rows.push({ name: normaliseName(o.name), runs, totalMs });
  }
  return rows;
}

/**
 * PURE, TOTAL — coerce a server's rendered rows (`{name, runs, averageMs}`) into entries.
 *
 * ⚠ THE SERVER SENDS THE DERIVED AVERAGE, so the total is reconstructed as `averageMs * runs`. That
 * round-trip is exact for the values involved and keeps ONE stored shape on the client, rather than
 * two parallel representations that could disagree about who is ahead.
 */
export function parseRankingRows(parsed: unknown): RankingEntry[] {
  if (!Array.isArray(parsed)) return [];
  const rows: RankingEntry[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== 'string') continue;
    const runs = Number(o.runs);
    const avg = Number(o.averageMs);
    if (!Number.isFinite(runs) || !Number.isInteger(runs) || runs <= 0) continue;
    if (!Number.isFinite(avg) || avg < 0) continue;
    rows.push({ name: normaliseName(o.name), runs, totalMs: avg * runs });
  }
  return rows;
}

/**
 * Read a board's ranking.
 *
 * ⚠ TOTAL BY CONSTRUCTION. Storage is user-writable and survives deploys, so a malformed key is an
 * ordinary situation rather than an exceptional one. The title screen must never be able to throw
 * because someone edited localStorage.
 */
export function loadRanking(boardId: string = BOARD_NONET): RankingEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(rankingKeyFor(boardId));
    if (raw === null || raw === undefined) return [];
    return parseRankingEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Persist a board's ranking. Silent on failure — a full or blocked quota must not break the game. */
export function saveRanking(
  entries: readonly RankingEntry[],
  boardId: string = BOARD_NONET,
): void {
  try {
    globalThis.localStorage?.setItem(rankingKeyFor(boardId), JSON.stringify(entries));
  } catch {
    /* private mode / quota exceeded — the run simply is not cached */
  }
}

/**
 * Runs recorded locally that the shared ranking has not accepted yet.
 *
 * ⭐ WHY A QUEUE EXISTS AT ALL, and it is specific to ranking by average. Under the old best-time
 * board a lost submission cost you one row you probably would not have held anyway. Under an average
 * it silently corrupts your standing **forever**: a slow run played on a train with no signal is
 * missing from your mean, so your shared average is permanently better than your real one, and no
 * later run can repair it. Queuing the run and flushing it on the next successful submit is what
 * makes the shared number actually mean what it claims.
 */
export function loadPending(boardId: string = BOARD_NONET): PendingRun[] {
  try {
    const raw = globalThis.localStorage?.getItem(pendingKeyFor(boardId));
    if (raw === null || raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: PendingRun[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const o = item as Record<string, unknown>;
      const ms = Number(o.ms);
      if (typeof o.name !== 'string' || !Number.isFinite(ms) || ms <= 0) continue;
      // ⚠ A QUEUED RUN WITHOUT AN ID GETS ONE HERE, not a fresh one per read — which would be
      // useless. Rows written before this field existed are the only case, and they simply lose the
      // protection rather than being dropped.
      const id = typeof o.id === 'string' && o.id.length > 0 ? o.id : newRunId();
      /*
       * ⚠ A ROW WRITTEN BEFORE `at` EXISTED GETS A FRESH STAMP, NOT A DROP — the same call the `id`
       * backfill above makes, for the same reason. Stamping it "now" hands it one more full retry
       * window, so the upgrade itself cannot silently bin a real backlog; the trade is that those
       * rows keep the old exposure for one window. The stamp becomes permanent on the next
       * `savePending`, which every submit performs.
       */
      const at = Number.isFinite(Number(o.at)) && Number(o.at) > 0 ? Number(o.at) : Date.now();
      out.push({ name: normaliseName(o.name), ms, id, at });
    }
    // ⚠ BOUNDED. An unbounded queue on a browser that is offline for a month would grow until the
    // quota throws, and the throw would land on the storage write that records the player's run.
    return out.slice(-PENDING_CAP);
  } catch {
    return [];
  }
}

/** How many unsynced runs are kept. Mine, not the owner's: 200 runs is far past any real backlog. */
export const PENDING_CAP = 200;

/**
 * ⭐⭐ S183 — HOW LONG A QUEUED RUN MAY STILL BE RETRIED. Past this it is dropped, never re-sent.
 *
 * ⛔ **THIS NUMBER'S ONLY JOB IS TO STAY UNDER THE SERVER'S `SEEN_RUN_TTL_MS` (24 h).** Beyond that
 * TTL the server has forgotten the run's idempotency key, so a retry is no longer deduplicated and
 * folds the same game a second time — permanently, because the board stores sum-and-count. A queue
 * bounded only by COUNT could sit for a week and then do exactly that.
 *
 * ⚠ MINE, NOT THE OWNER'S, and the 12 h rather than 23 h is deliberate slack for CLOCK SKEW: `at`
 * is the player's wall clock and `seen_runs.created` is the server's. Twelve hours of margin means
 * a badly-set device clock cannot walk a retry past the TTL. Twelve hours is also far longer than
 * any real retry — the failure this defends against resolves in seconds — so the slack costs
 * nothing that matters.
 *
 * `src/render/pendingRunExpiry.test.ts` pins this against the worker's own exported constant, so
 * raising one without the other turns a test red instead of quietly re-opening the double-count.
 */
export const PENDING_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * PURE — the queued runs still worth sending at `now`.
 *
 * ⛔ APPLIED TO THE LIST THE CALLER THEN SAVES BACK, so an expired run leaves storage as well as the
 * request. Filtering only the outgoing batch would leave it in the queue to be reconsidered, and
 * re-dropped, on every submit for the rest of the install's life.
 */
export function prunePending(
  pending: readonly PendingRun[],
  now: number = Date.now(),
): PendingRun[] {
  return pending.filter((r) => now - r.at < PENDING_MAX_AGE_MS);
}

export function savePending(
  pending: readonly PendingRun[],
  boardId: string = BOARD_NONET,
): void {
  try {
    globalThis.localStorage?.setItem(
      pendingKeyFor(boardId),
      JSON.stringify(pending.slice(-PENDING_CAP)),
    );
  } catch {
    /* private mode / quota exceeded */
  }
}
