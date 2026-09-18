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
 * `localStorage`, per browser profile. Every read is defensive: a corrupted or hand-edited entry must
 * degrade to "no scores yet" rather than throw on the title screen, so a bad key can never brick the
 * menu.
 *
 * ⛔ **S182 — AND FOR TWO YEARS THAT SENTENCE WAS THE WHOLE FEATURE, WHICH IS THE BUG.** This
 * docblock used to end *"the arcade is a local high-score table, not an account system"*, stated as
 * a design choice. It was never decided: the S150 PDR that built the board never asked where the
 * scores would live, and localStorage was assumed. What the owner actually got:
 *
 * > *"I don't see anyone else's records on the arcade… My friend played it and he put his name on
 * > and he got first place. Now I did my shit and I got first place. Who the fuck is first place?"*
 *
 * Both of them were right, and both boards were real — **two private tables of one row each**, on
 * two browser profiles, neither of which can ever appear on or be beaten by the other. A fresh
 * profile seeds nothing, so the first run committed is always `1ST — NEW RECORD`.
 *
 * `arcadeLeaderboard.ts` is the answer: these functions stay exactly as they are and become the
 * OFFLINE half of a two-tier board, so a dead network still costs a player nothing.
 *
 * PURE apart from the two storage functions, so the ranking rules are unit-testable headlessly.
 */

/** How many rows the board shows. Owner's number. */
export const TOP_N = 25;

/** Arcade initials are exactly three characters. */
export const NAME_LEN = 3;

/** The alphabet the initials picker cycles. Space last, so "AB " is reachable. */
export const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

/**
 * ⭐ S182 — THE DEFAULT BOARD ID, AND WHY STAGE SCOPING IS A STRING RATHER THAN A SCHEMA CHANGE.
 *
 * Owner, S182, on the ten-stage ladder: *"We have different levels of Sudoku… we'll have also
 * leaderboards for the first…"* — a ladder multiplies ONE board into thirty. Designing that in now
 * costs a parameter; retrofitting it later costs a migration on both sides of the wire, so the board
 * is addressed by an opaque id from the very first row. `'nonet'` is the endless single-puzzle board
 * that exists today; a stage board would be `'nonet:s07'`, and nothing below has to change to carry
 * it. The server's table takes the same id as a COLUMN for exactly the same reason.
 */
export const BOARD_NONET = 'nonet';

/**
 * localStorage key for a board.
 *
 * ⛔ `'nonet'` MAPS TO THE LEGACY KEY ON PURPOSE, AND IT IS NOT COSMETIC. The owner has a real board
 * sitting under `spark.arcade.nonet.scores.v1` on his own browser right now. Deriving every key
 * uniformly (`spark.arcade.nonet.scores.v1` → `spark.arcade.board.nonet.v1`, say) would have read as
 * tidier and would have silently wiped his existing times the first time he loaded the new build —
 * the one board in this whole feature that actually has his runs in it.
 */
function storageKeyFor(boardId: string): string {
  return boardId === BOARD_NONET
    ? 'spark.arcade.nonet.scores.v1'
    : `spark.arcade.${boardId}.scores.v1`;
}

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
 * TOLD where they landed, not just shown a table they missed. Use `qualifies` to decide whether the
 * row actually goes on the board.
 *
 * ⛔ BUT THE CEILING IS `TOP_N + 1`, AND THE ORIGINAL WORDING HERE OVERSOLD IT. This docblock used to
 * promise "you came 61st"; it cannot. `placeOf` counts how many STORED rows beat you, storage never
 * holds more than `TOP_N`, so the worst place expressible is **26th** — "26th" means "off the board"
 * rather than a true global rank. Ranking beyond the table would need every run persisted, which is
 * a different feature and a different storage cost. Corrected during the S150 landing audit, which
 * caught the prose and the code disagreeing.
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
  const name = kept.join('');
  // ⛔ S150 P3 — THE ALL-SPACE HOLE. `NAME_ALPHABET` deliberately ENDS with a space so that "AB " is
  // reachable, which means a space is a *mappable* character — so three of them sailed through the
  // filter above and `normaliseName('   ')` returned three spaces: a visually BLANK row on the high
  // score table, which is precisely what the docblock above promises cannot happen. The old test
  // asserted only `toHaveLength(NAME_LEN)`, and three spaces are three characters, so it passed.
  //
  // The fix is deliberately narrower than "reject spaces": a name needs at least ONE non-space
  // character, and beyond that spaces are legal wherever the player put them. "AB " keeps working;
  // "   " becomes the arcade default.
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
 * Read the board.
 *
 * ⚠ TOTAL BY CONSTRUCTION. Storage is user-writable and survives deploys, so a malformed key is an
 * ordinary situation rather than an exceptional one: anything that does not parse into well-formed
 * rows degrades to an empty board. The title screen must never be able to throw because someone
 * edited localStorage.
 */
export function loadScores(boardId: string = BOARD_NONET): ArcadeScore[] {
  try {
    const raw = globalThis.localStorage?.getItem(storageKeyFor(boardId));
    if (raw === null || raw === undefined) return [];
    return parseScoreRows(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * PURE, TOTAL — coerce arbitrary parsed JSON into well-formed, sorted, capped rows.
 *
 * ⭐ S182 — EXTRACTED SO THE NETWORK PATH CANNOT BE LESS PARANOID THAN THE STORAGE PATH. This was
 * inline in `loadScores`, written against a hand-edited localStorage key. A shared leaderboard makes
 * the same bytes arrive from a PUBLIC endpoint that anyone can POST to, which needs strictly more
 * suspicion, not less — and a second hand-rolled parser on the fetch side is how the two drift until
 * one of them lets a `NaN`, a negative time, or a 400-character name onto the table. One function,
 * both callers: a row that would brick the board cannot enter through either door.
 */
export function parseScoreRows(parsed: unknown): ArcadeScore[] {
  if (!Array.isArray(parsed)) return [];
  const rows: ArcadeScore[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.ms !== 'number' || typeof o.at !== 'number') continue;
    if (!Number.isFinite(o.ms) || o.ms < 0) continue;
    if (!Number.isFinite(o.at)) continue;
    rows.push({ name: normaliseName(o.name), ms: o.ms, at: o.at });
  }
  return rows.sort(compare).slice(0, TOP_N);
}

/** Persist the board. Silent on failure — a full or blocked quota must not break the game. */
export function saveScores(scores: readonly ArcadeScore[], boardId: string = BOARD_NONET): void {
  try {
    globalThis.localStorage?.setItem(storageKeyFor(boardId), JSON.stringify(scores.slice(0, TOP_N)));
  } catch {
    /* private mode / quota exceeded — the run simply is not recorded */
  }
}

/**
 * PURE — fold two boards into one, de-duplicated, re-sorted and capped.
 *
 * ⭐ S182 — THIS IS WHAT MAKES A DEAD NETWORK COST NOTHING. The remote board is authoritative for
 * what OTHER people did; the local board is the only record of what happened while the network was
 * down. Replacing one with the other loses a real run either way, so the two are merged.
 *
 * ⛔ THE IDENTITY IS THE FULL TRIPLE `(name, ms, at)`, and the narrower keys are all wrong here:
 * `name` alone collapses a player's whole history to one row; `(name, ms)` collapses the same player
 * repeating a board they have memorised, which `arcadeRun.ts` already documents as the LIKELIEST
 * case rather than a contrived one. `at` is the field the comparator already tie-breaks on, so the
 * triple is exactly the tuple that makes a row unique — the same identity `drawBoard` highlights on.
 */
export function mergeBoards(
  a: readonly ArcadeScore[],
  b: readonly ArcadeScore[],
): ArcadeScore[] {
  const seen = new Set<string>();
  const out: ArcadeScore[] = [];
  for (const s of [...a, ...b]) {
    const key = `${s.name} ${s.ms} ${s.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.sort(compare).slice(0, TOP_N);
}

/**
 * Record a run and report where it landed.
 *
 * Returns the new board plus the player's 1-based place and whether it made the cut, so the caller
 * can say "3rd — NEW RECORD" or "you came 41st" without re-deriving either.
 */
export function recordRun(name: string, ms: number, at: number, boardId: string = BOARD_NONET): {
  scores: ArcadeScore[];
  place: number;
  onBoard: boolean;
} {
  const existing = loadScores(boardId);
  const entry: ArcadeScore = { name: normaliseName(name), ms, at };
  const place = placeOf(existing, entry);
  const onBoard = place <= TOP_N;
  // ⛔ S182 — `mergeBoards`, NOT `insertScore`, AND THE DIFFERENCE IS IDEMPOTENCE ON THE TRIPLE.
  //
  // `insertScore` appends unconditionally, which was harmless while `commitRun` was the only caller
  // and the phase machine made a second commit unreachable. The shared board breaks that assumption:
  // `RemoteLeaderboard.submit` records locally FIRST (so a closed tab cannot cost a run) and the same
  // entry can then arrive again through a retry or a merge. Appending would put two byte-identical
  // rows on the table — and `drawBoard` matches the player's own row on exactly that triple, so it
  // would highlight one and leave its twin sitting beside it. Recording a run twice is now a no-op.
  const scores = mergeBoards(existing, [entry]);
  if (onBoard) saveScores(scores, boardId);
  return { scores, place, onBoard };
}
