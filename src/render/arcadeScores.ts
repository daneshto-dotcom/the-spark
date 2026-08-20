/**
 * SPARK — S149 P6: **THE ARCADE HIGH-SCORE TABLE.**
 *
 * Owner, S149:
 * > *"we will make it a trial on time. see who can finish it as fast as possible and then he can
 * > register his score and name in an arcade-like winnerboard. only like top 25 are shown and it
 * > tells him place place his score is. like in a real arcade from the 80s"*
 *
 * ## The 1980s cabinet conventions, and which ones actually matter here
 *
 * The genre's rules are consistent enough to state plainly, and each one earns its place:
 *
 * · **THREE-LETTER INITIALS.** Cabinets had no keyboard — you spun a stick through A–Z and punched
 *   a button three times. Three characters is the whole reason arcade boards feel like arcade
 *   boards, and it makes every row the same width so the table aligns without measuring text.
 * · **A FIXED, SHORT TABLE.** Ten was the arcade norm; the owner asked for 25, which is what
 *   `TOP_N` is. A hard cap is the point — falling off the bottom is what makes staying on it mean
 *   something.
 * · **RANK · SCORE · NAME, in that order**, monospaced, one line each.
 * · **"YOUR PLACE" IS TOLD TO YOU EVEN WHEN YOU MISS.** A cabinet that only showed the table left
 *   you guessing; the owner explicitly wants the player told where they landed. `qualifies` and
 *   `placeOf` answer that for a run that did NOT make the cut, too.
 *
 * ## ⛔ LOWER IS BETTER HERE, AND THAT INVERTS THE USUAL SORT
 *
 * This is a **time** trial: the score IS the elapsed milliseconds, so the BEST run is the SMALLEST
 * number. Every comparison below is deliberately `<` rather than `>`. Getting this backwards would
 * still produce a plausible-looking board — sorted, capped, ranked — that silently celebrates the
 * slowest players, which is exactly the kind of bug a green test suite waves through. The tests pin
 * the direction explicitly.
 *
 * ## Storage
 *
 * `localStorage`, per browser profile — the arcade is a local high-score table, not an account
 * system. Every read is defensive: a corrupted or hand-edited entry must degrade to "no scores
 * yet" rather than throw on the title screen, so a bad key can never brick the menu.
 *
 * PURE apart from the two storage functions, so the ranking rules are unit-testable headlessly.
 */

/** How many rows the board shows. Owner's number. */
export const TOP_N = 25;

/** Arcade initials are exactly three characters. */
export const NAME_LEN = 3;

/** The alphabet the initials picker cycles. Space last, so "AB " is reachable. */
export const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

const STORAGE_KEY = 'spark.arcade.nonet.scores.v1';

/** One row on the board. `ms` is elapsed time — SMALLER IS BETTER. */
export interface ArcadeScore {
  /** Exactly three characters, upper case. */
  readonly name: string;
  /** Elapsed milliseconds for the run. */
  readonly ms: number;
  /** Wall-clock stamp of the run, for tie-breaking only. */
  readonly at: number;
}

/**
 * ⭐ THE ORDERING RULE, in one place.
 *
 * Faster first. Ties broken by who got there FIRST (earlier `at`) — the arcade convention that an
 * existing record holder keeps the higher slot until someone genuinely beats them, rather than
 * being bumped by a later player who merely equalled it.
 */
function compare(a: ArcadeScore, b: ArcadeScore): number {
  if (a.ms !== b.ms) return a.ms - b.ms; // ⛔ lower ms wins — this is a TIME trial
  return a.at - b.at;
}

/** PURE — `scores` with `entry` inserted, re-sorted, and capped to the board size. */
export function insertScore(
  scores: readonly ArcadeScore[],
  entry: ArcadeScore,
): ArcadeScore[] {
  return [...scores, entry].sort(compare).slice(0, TOP_N);
}

/**
 * PURE — the 1-based place `entry` would take, ignoring the cap.
 *
 * ⚠ RETURNS A PLACE EVEN WHEN IT IS WORSE THAN 25th. That is the point: the owner wants the player
 * TOLD where they landed, and "you came 61st" is information a cabinet would have given you. Use
 * `qualifies` to decide whether the row actually goes on the board.
 */
export function placeOf(scores: readonly ArcadeScore[], entry: ArcadeScore): number {
  let better = 0;
  for (const s of scores) if (compare(s, entry) < 0) better++;
  return better + 1;
}

/** PURE — would this run earn a row on the board? */
export function qualifies(scores: readonly ArcadeScore[], entry: ArcadeScore): boolean {
  return placeOf(scores, entry) <= TOP_N;
}

/**
 * PURE — clamp arbitrary text to a legal set of initials.
 *
 * Upper-cased, filtered to the alphabet, padded to exactly three. Anything unmappable becomes the
 * arcade default `AAA` rather than an empty row, because a nameless entry on a high-score table
 * reads as a bug.
 */
export function normaliseName(raw: string): string {
  const kept = [...raw.toUpperCase()].filter((c) => NAME_ALPHABET.includes(c)).slice(0, NAME_LEN);
  while (kept.length < NAME_LEN) kept.push('A');
  return kept.join('');
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
 * Read the board.
 *
 * ⚠ TOTAL BY CONSTRUCTION. Storage is user-writable and survives deploys, so a malformed key is an
 * ordinary situation rather than an exceptional one: anything that does not parse into well-formed
 * rows degrades to an empty board. The title screen must never be able to throw because someone
 * edited localStorage.
 */
export function loadScores(): ArcadeScore[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const rows: ArcadeScore[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const o = item as Record<string, unknown>;
      if (typeof o.name !== 'string' || typeof o.ms !== 'number' || typeof o.at !== 'number') continue;
      if (!Number.isFinite(o.ms) || o.ms < 0) continue;
      rows.push({ name: normaliseName(o.name), ms: o.ms, at: o.at });
    }
    return rows.sort(compare).slice(0, TOP_N);
  } catch {
    return [];
  }
}

/** Persist the board. Silent on failure — a full or blocked quota must not break the game. */
export function saveScores(scores: readonly ArcadeScore[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, TOP_N)));
  } catch {
    /* private mode / quota exceeded — the run simply is not recorded */
  }
}

/**
 * Record a run and report where it landed.
 *
 * Returns the new board plus the player's 1-based place and whether it made the cut, so the caller
 * can say "3rd — NEW RECORD" or "you came 41st" without re-deriving either.
 */
export function recordRun(name: string, ms: number, at: number): {
  scores: ArcadeScore[];
  place: number;
  onBoard: boolean;
} {
  const existing = loadScores();
  const entry: ArcadeScore = { name: normaliseName(name), ms, at };
  const place = placeOf(existing, entry);
  const onBoard = place <= TOP_N;
  const scores = insertScore(existing, entry);
  if (onBoard) saveScores(scores);
  return { scores, place, onBoard };
}
