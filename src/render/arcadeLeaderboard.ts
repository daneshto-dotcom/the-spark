/**
 * SPARK — **THE SHARED ARCADE RANKING — the client seam.** LIVE since S182.
 *
 * Owner, S182, on the original bug:
 * > *"I don't see anyone else's records on the arcade... My friend played it and he put his name on
 * > and he got first place. Now I did my shit and I got first place. Who the fuck is first place?"*
 *
 * and then, replacing the design outright (R182-G):
 * > *"The leaderboard will hold the AVERAGE time it takes a user to complete... So people are
 * > competing over a long span."*
 *
 * ## ⭐ THIS IS SPARK'S FIRST AND ONLY BACKEND, AND IT IS SWITCHED ON
 *
 * Deployed S182 to the owner's own Cloudflare account and verified against the live endpoint. Every
 * other `fetch()` in `src/` is a same-origin static asset and the only socket is a WebRTC signalling
 * probe, so this module is the one place the game talks to a server it owns.
 *
 * `VITE_LEADERBOARD_URL` is set as a repository variable and inlined at build time. **Unset is still
 * a fully supported state** — a local build, or a fork without the variable, falls back to the
 * offline tier and behaves exactly as the game did before S182. That is not a leftover from the
 * pre-approval design; it is what makes a dead network survivable.
 *
 * ## ⛔ THE LOCAL TIER IS NOT A STUB, AND UNDER AN AVERAGE IT MATTERS MORE THAN IT USED TO
 *
 * A lost submission used to cost you one row on a best-time table. Under a mean it silently corrupts
 * your standing **permanently**: a slow run played with no signal never enters your average, so your
 * shared number stays better than your real one and no later run can repair it. So every run is
 * written locally FIRST, queued if the network refuses, and flushed on the next successful submit.
 *
 * ## ⛔ THE BOARD IS REVEALED ONLY AFTER YOU SUBMIT — an anti-griefing rule, not a UI flourish
 *
 * > *"You can't see all the names before you put your name, and that way people won't cheat and try
 * > to change each other's score."*
 *
 * Because identity is the typed name, seeing the table before choosing a name lets anyone type a
 * rival's initials and drag their average down on purpose. Gating the reveal removes the casual
 * version of that attack. **It is not airtight and must not be described as if it were** — the GET
 * endpoint is public, so anyone who opens devtools can read the table without playing. What the gate
 * buys is that the attack is no longer the path of least resistance for someone sitting at the
 * cabinet. Enforced structurally in `arcadeRun.ts`: no phase before `RECAP` carries any rows.
 *
 * ## Cheating — named, bounded, NOT solved
 *
 * A public write endpoint with no accounts means anyone can POST a fabricated time. The worker
 * applies a floor, a ceiling and a per-IP rate limit; **none is airtight** while the client owns the
 * puzzle and the clock. ⚠ An average is in one way *more* robust than a best-time board — a single
 * fake run only moves a mean by `1/n` — and in one way less, since a rival's average can be attacked
 * by submitting slow runs under their name. Both are accepted. The remedy if it is ever abused is a
 * per-board wipe, which is one SQL statement.
 */

import {
  BOARD_NONET,
  entryOf,
  foldRun,
  loadPending,
  loadRanking,
  newRunId,
  normaliseName,
  parseRankingRows,
  placeOfName,
  prunePending,
  rankRows,
  savePending,
  saveRanking,
  averageMsOf,
  type PendingRun,
  type RankingEntry,
  type RankingRow,
} from './arcadeScores.ts';

export { BOARD_NONET };

/**
 * What a submission tells the caller — the board AND everything the recap cinematic needs.
 *
 * Owner: *"there'll be a cool little cinematic of the whole calculation: 'we finished this in a
 * minute zero three, so far your best average is a minute eighteen, that brings it down to...'"*
 * Every number in that sentence is a field here, so the renderer computes nothing.
 */
export interface RankingUpdate {
  readonly rows: readonly RankingRow[];
  /** 1-based place after this submission. */
  readonly place: number;
  /** Total runs after this submission — *"this is your seventh"*. */
  readonly runs: number;
  /** The run just completed. */
  readonly lastMs: number;
  /** The average BEFORE this submission, or `null` when this is the player's first ever run. */
  readonly previousAverageMs: number | null;
  /** The average after. */
  readonly averageMs: number;
  /**
   * Did the shared ranking actually answer for THIS call?
   *
   * ⚠ REPORTED, NOT INFERRED. `kind === 'remote'` says which client is configured; this says whether
   * the network came back. A remote-configured client that is offline is otherwise indistinguishable
   * from a local one, and the player is owed the difference between "you are 3rd in the world" and
   * "you are 3rd on this machine".
   */
  readonly shared: boolean;
  /**
   * Runs flushed from the offline queue alongside this one, if any.
   *
   * Surfaced so the recap can explain a run count that jumped by more than one, rather than looking
   * like a bug the first time someone plays on a train.
   */
  readonly flushed: number;
}

/**
 * ⭐ THE WHOLE INTERFACE — ONE METHOD.
 *
 * ⛔ THERE IS DELIBERATELY NO `top()`. The previous design had one and it was dead code: nothing in
 * production ever read the board without submitting to it. Under R182-G that is no longer an
 * oversight but a RULE — the reveal is gated on submission — so an interface method that hands back
 * the table without a submission would exist only to be misused. The offline path reads the cached
 * rows through `arcadeScores.loadRanking`, which is storage, not the leaderboard contract.
 */
export interface LeaderboardClient {
  readonly kind: 'local' | 'remote';
  /** Fold a completed run in and return the ranking. Never throws; never loses the run. */
  submit(boardId: string, name: string, ms: number): Promise<RankingUpdate>;
}

/** PURE — build the update a caller sees, from a set of entries and the focus player. */
function updateFrom(
  entries: readonly RankingEntry[],
  name: string,
  lastMs: number,
  previousAverageMs: number | null,
  shared: boolean,
  flushed: number,
  truePlace?: number | null,
  /**
   * ⭐ THE SERVER'S OWN ROW FOR THIS PLAYER — authoritative when present.
   *
   * ⛔ WITHOUT IT THE RECAP LIES TO EVERYONE OUTSIDE THE TOP 25. `entries` is only ever the top
   * `TOP_N` rows the server sent, so `entryOf` finds NOTHING for a player ranked 30th — and the
   * fallbacks below then report `runs: 1` and `averageMs: lastMs`. That player is told "YOUR FIRST
   * RUN" on every single run they ever play, with an average that is just their last time. The
   * server already knows their real row; it returns it in `you`.
   */
  serverMine?: { runs: number; averageMs: number } | null,
): RankingUpdate {
  const rows = rankRows(entries);
  const mine = entryOf(entries, name);
  return {
    rows,
    /*
     * ⛔ THE SERVER'S PLACE WINS WHEN IT GIVES ONE. The client only ever holds the top `TOP_N`
     * rows, so `placeOfName` cannot see past the table: a player ranked 28th is absent from the
     * list and the best it can answer is 26th. That is quietly wrong for everyone outside the top
     * 25, in exactly the number the owner cares about — *"and then that is your ranking."*
     */
    place: truePlace ?? placeOfName(rows, normaliseName(name)),
    // The server's row first, the top-25 slice second, and the single-run guess only when neither
    // exists (which is the genuinely-offline case, where one run IS the whole history we have).
    runs: serverMine?.runs ?? mine?.runs ?? 1,
    lastMs,
    previousAverageMs,
    averageMs:
      serverMine !== null && serverMine !== undefined
        ? serverMine.averageMs
        : mine === null
          ? lastMs
          : averageMsOf(mine),
    shared,
    flushed,
  };
}

/**
 * ⭐⭐ S183 — PURE — the server's top-25 **plus the player's own row**, which the top 25 may not hold.
 *
 * ## ⛔ THE SAME LIE `serverMine` FIXED ONLINE WAS STILL LIVE OFFLINE
 *
 * `updateFrom`'s `serverMine` repaired the ONLINE recap for a player ranked outside the top 25. The
 * OFFLINE branch kept the defect, and offline is the branch where the server cannot correct it:
 *
 *   1. a successful submit replaced the local cache with the server's **top `TOP_N` rows only**;
 *   2. a player ranked 30th is not among them, so their row was DELETED from local storage;
 *   3. their next submit fails (a train, a hotel portal). `loadRanking` has no row for them, the
 *      local fold creates one at `runs: 1`, and `updateFrom` has no `serverMine` to prefer;
 *   4. the recap prints `YOU HAVE PLAYED 1 GAME — THIS IS YOUR 1ST` with an average equal to that
 *      single run, and `recapAverageMs` short-circuits so the owner's count-up cinematic is skipped.
 *
 * Every offline run, forever, to a player on their fortieth. **The stored data was never wrong —
 * only the payoff screen was**, and `arcadeLeaderboard.ts`'s own comment at `entryOf` asserted this
 * could not happen.
 *
 * ## The three cases
 *
 * - **in the top 25** — nothing to do; the server's row IS their row.
 * - **outside it, and the server sent `you`** — reconstruct the entry from the authoritative
 *   `runs`/`averageMs`. ⚠ `totalMs` is rounded because `averageMs` is `total_ms / runs` as a float;
 *   the product recovers the integer the server holds, to the ULP.
 * - **outside it, and the server said nothing** (an older worker, or a fold that did not land for
 *   the focus name) — keep whatever row the LOCAL cache already had. It is the only history
 *   available, and dropping it is strictly worse than keeping a stale one.
 *
 * ⚠ THIS IS NOT THE "merging two aggregates" THE CALLER REFUSES. Nothing is added to anything: one
 * row that the transport omitted is re-attached, from the server's own numbers where it gave them.
 */
export function withOwnRow(
  entries: readonly RankingEntry[],
  rawName: string,
  serverMine: { runs: number; averageMs: number } | null | undefined,
  localCache: readonly RankingEntry[],
): RankingEntry[] {
  const name = normaliseName(rawName);
  if (entryOf(entries, name) !== null) return [...entries];
  if (serverMine !== null && serverMine !== undefined && serverMine.runs >= 1) {
    return [...entries, { name, runs: serverMine.runs, totalMs: Math.round(serverMine.runs * serverMine.averageMs) }];
  }
  const local = entryOf(localCache, name);
  return local === null ? [...entries] : [...entries, local];
}

/** The offline tier — and the whole ranking when no backend is configured. */
export class LocalLeaderboard implements LeaderboardClient {
  readonly kind = 'local' as const;

  submit(boardId: string, name: string, ms: number): Promise<RankingUpdate> {
    const before = loadRanking(boardId);
    const prev = entryOf(before, name);
    const after = foldRun(before, name, ms);
    saveRanking(after, boardId);
    return Promise.resolve(
      updateFrom(after, name, ms, prev === null ? null : averageMsOf(prev), false, 0),
    );
  }
}

/** How long a leaderboard request may hang before the offline tier answers instead. */
export const REQUEST_TIMEOUT_MS = 4000;

/** Most queued runs sent in one request — bounds a huge backlog into several ordinary calls. */
const FLUSH_BATCH = 20;

/**
 * The shared ranking.
 *
 * ⛔ EVERY FAILURE PATH FALLS BACK AND NONE OF THEM THROWS. Offline, DNS failure, a 500, a 404 from a
 * half-deployed worker, a hang, HTML from a captive-portal login page, JSON that parses but is not
 * the right shape — all ordinary, not exceptional, and every one must end with the run recorded and
 * the arcade still on screen. The recap is the last thing a player sees after a good run; it is the
 * worst possible place to surface a network error.
 */
export class RemoteLeaderboard implements LeaderboardClient {
  readonly kind = 'remote' as const;
  private readonly base: string;

  constructor(base: string) {
    this.base = base.replace(/\/+$/, '');
  }

  async submit(boardId: string, rawName: string, ms: number): Promise<RankingUpdate> {
    const name = normaliseName(rawName);

    // ⭐ LOCAL FIRST, BEFORE THE AWAIT. If the tab closes the instant the recap appears — which is
    // exactly when someone who just set a record alt-tabs to tell a friend — the run is already on
    // disk. Ordering this after the network would make "did my run count?" depend on how long the
    // player looked at the screen.
    const before = loadRanking(boardId);
    const prev = entryOf(before, name);
    const previousAverageMs = prev === null ? null : averageMsOf(prev);
    saveRanking(foldRun(before, name, ms), boardId);

    // ⚠ OLDEST FIRST. `slice(0, FLUSH_BATCH)` takes the head of the queue, not the tail: a run that
    // has been waiting since last week is the one most likely to be lost to a cleared cache, so it
    // goes first. Taking the newest would starve the backlog indefinitely on a flaky connection.
    /*
     * ⛔⛔ S183 — **AND ANYTHING PAST `PENDING_MAX_AGE_MS` IS DROPPED RATHER THAN RE-SENT.**
     *
     * "Waiting since last week" is exactly the run that must NOT go: the server forgets a run's
     * idempotency key after `SEEN_RUN_TTL_MS` (24 h, pruned by any client's POST), so a week-old
     * retry of a run the server DID commit is folded a second time — and sum-and-count makes that
     * permanent. See `PendingRun.at`.
     *
     * ⚠ THE PRUNED LIST IS WHAT GETS SAVED BACK on both exits below, so an expired run leaves
     * storage too instead of being re-evaluated forever.
     */
    const pendingBefore = prunePending(loadPending(boardId));
    const queued = pendingBefore.slice(0, FLUSH_BATCH);
    /*
     * ⭐ THE ID IS MINTED ONCE, HERE, AND IT IS WHAT MAKES A RETRY SAFE.
     *
     * Delivery is at-least-once — the abort below can fire on a request the server already committed
     * — so the same run can be sent twice. Because the id is generated now and then STORED with the
     * queued run, the retry carries the SAME key and the server folds it at most once. Minting a
     * fresh id on the retry would look identical and defend nothing.
     */
    // ⚠ `at` IS STAMPED HERE, WITH THE ID AND FOR THE SAME REASON — see `PendingRun.at`. Stamping
    // it at QUEUE time instead would refresh on every failed flush and the run would never expire.
    const thisRun: PendingRun = { name, ms, id: newRunId(), at: Date.now() };
    const runs = [...queued, thisRun];
    const answer = await this.post(boardId, runs, name);

    if (answer === null) {
      // ⛔ QUEUE IT, WITH ITS ID. Under an average a dropped run is not a missed row, it is a
      // permanently wrong number — see `loadPending`.
      savePending([...pendingBefore, thisRun], boardId);
      return updateFrom(loadRanking(boardId), name, ms, previousAverageMs, false, 0);
    }

    // The server is authoritative: replace the cache with its rows rather than merging. Merging two
    // aggregates is not defined — you cannot tell an overlapping history from a disjoint one — which
    // is exactly why the queue holds individual RUNS and not a local aggregate to reconcile.
    saveRanking(withOwnRow(answer.entries, name, answer.mine, loadRanking(boardId)), boardId);
    // Drop exactly what was accepted, keeping anything that arrived while the request was in flight.
    savePending(pendingBefore.slice(queued.length), boardId);
    /*
     * ⭐ PREFER THE SERVER'S "previous average" OVER THE LOCAL ONE.
     *
     * ⛔ THE LOCAL VALUE IS WRONG ON ANY DEVICE THE PLAYER HAS NOT USED BEFORE, and that is the
     * normal case rather than an edge one — a phone, a friend's laptop, a cleared cache. Local
     * storage would say "no previous entry", the recap would announce FIRST RUN to someone on their
     * fortieth, and the number it counted up from would be nonsense. The server knows the real
     * history because the name is the identity.
     *
     * Falls back to the local value only when the server declines to say (a `you` of null, which
     * means the fold did not land for the focus name).
     */
    const serverPrev = answer.previousAverageMs;
    return updateFrom(
      answer.entries,
      name,
      ms,
      serverPrev !== undefined ? serverPrev : previousAverageMs,
      true,
      queued.length,
      answer.place,
      answer.mine,
    );
  }

  /** POST a batch of runs. `null` means "the network did not answer" — never "an empty board". */
  private async post(
    boardId: string,
    runs: readonly PendingRun[],
    focus: string,
  ): Promise<{
    entries: RankingEntry[];
    previousAverageMs?: number | null;
    place?: number | null;
    mine?: { runs: number; averageMs: number } | null;
  } | null> {
    try {
      const res = await fetch(`${this.base}/board/${encodeURIComponent(boardId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          runs: runs.map((r) => ({ name: r.name, ms: r.ms, id: r.id })),
          focus,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      if (typeof body !== 'object' || body === null) return null;
      const rows = (body as { rows?: unknown }).rows;
      // ⛔ AN ABSENT `rows` IS A FAILURE, NOT AN EMPTY RANKING. `parseRankingRows` maps anything
      // non-array to `[]`, so returning it unconditionally would turn a malformed 200 — a captive
      // portal's HTML, a worker deployed without its route — into "nobody has played", wiping every
      // other player out of the cache.
      if (!Array.isArray(rows)) return null;
      // `you.previousAverageMs` is optional and may legitimately be null (a first ever run), so
      // absence and null are distinguished: `undefined` means "the server did not say".
      const you = (body as { you?: unknown }).you;
      let previousAverageMs: number | null | undefined;
      let place: number | null | undefined;
      let mine: { runs: number; averageMs: number } | null | undefined;
      if (typeof you === 'object' && you !== null) {
        const p = (you as { previousAverageMs?: unknown }).previousAverageMs;
        if (p === null) previousAverageMs = null;
        else if (typeof p === 'number' && Number.isFinite(p) && p >= 0) previousAverageMs = p;
        const q = (you as { place?: unknown }).place;
        if (typeof q === 'number' && Number.isInteger(q) && q >= 1) place = q;
        // ⭐ N1 — the player's REAL row, which may be nowhere near the top 25 the client receives.
        const yr = Number((you as { runs?: unknown }).runs);
        const ya = Number((you as { averageMs?: unknown }).averageMs);
        if (Number.isInteger(yr) && yr >= 1 && Number.isFinite(ya) && ya >= 0) {
          mine = { runs: yr, averageMs: ya };
        }
      }
      return { entries: parseRankingRows(rows), previousAverageMs, place, mine };
    } catch {
      return null; // offline, DNS, CORS, abort, non-JSON — one answer: use the offline tier
    }
  }
}

/**
 * ⚠ MUST MATCH `LEADERBOARD_ORIGIN_RE` in `scripts/leaderboard-wiring-report.mjs` BYTE FOR BYTE —
 * pinned by `ci.leaderboardGate.test.ts`, exactly as `ICE_URL_RE` is pinned between `iceConfig.ts`
 * and `turn-wiring-report.mjs`. A bare ORIGIN: scheme, host, optional port. No path, query or
 * fragment.
 */
const LEADERBOARD_ORIGIN_RE =
  /^https?:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/i;

/** Hosts for which plain `http:` is legitimate — a dev server on the same machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * ⛔ IS IT *USABLE* — not "is it set". PURE. Returns a clean base, or `''` for anything unusable.
 *
 * ⚠ THE REPO HAS PAID FOR THIS LESSON ONCE ALREADY, IN THE SAME SHAPE. S162:
 * `turn-wiring-report.mjs` printed `✅ RELAY WILL BE SHIPPED` for a build whose ICE config THREW,
 * because it validated `v.trim() !== ''` and nothing else — *"a watchdog that shares the watched
 * code's blind spot is not a watchdog."* The owner had pasted a dashboard value that arrived wrapped
 * as `urls: "turn:…"` and lost multiplayer on every network behind a green deploy.
 *
 * Each rejected shape below fails SILENTLY at runtime with the board falling back to local:
 * plain `http://` (blocked as mixed content from the HTTPS site — the likeliest real mistake, since
 * a hand-typed or older URL loses the `s`); a missing scheme (`fetch` resolves it against
 * spark-online.space); a trailing path or query (every request misrouted); a wrapped or quoted
 * paste; stray whitespace; and the literal strings `undefined` / `null` / `false`, which a
 * mis-templated CI expression produces and which are all truthy.
 */
export function parseLeaderboardBase(raw: string): string {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  // ⚠ THE `(?!\/\/)` IS LOAD-BEARING AND ITS ABSENCE WAS CAUGHT BY RUNNING THIS, NOT BY READING IT.
  // Without it this label-stripper reads `https:` in `https://host` as a `key:` prefix and eats the
  // scheme, so the parser rejected every VALID url and accepted only wrapped ones — precisely
  // inverted. A scheme is a colon followed by `//`; a pasted label never is.
  s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*\s*[:=]\s*(?!\/\/)/, '').trim();
  s = s.replace(/,+$/, '').trim();
  const quoted = /^(['"`])([\s\S]*)\1$/.exec(s);
  if (quoted !== null) s = quoted[2].trim();
  s = s.replace(/\/+$/, '');
  if (s === '' || s === 'undefined' || s === 'null' || s === 'false') return '';
  if (!LEADERBOARD_ORIGIN_RE.test(s)) return '';
  if (s.toLowerCase().startsWith('http://')) {
    const host = s.slice('http://'.length).split(':')[0].toLowerCase();
    if (!LOCAL_HOSTS.has(host)) return '';
  }
  return s;
}

/*
 * ⛔⛔ DECLARATION ORDER IS LOAD-BEARING HERE, AND GETTING IT WRONG BLACK-SCREENED THE WHOLE GAME.
 *
 * `REMOTE_BASE` below is a module-level `const` that CALLS `parseLeaderboardBase`, which reads
 * `LEADERBOARD_ORIGIN_RE`. A `const` is in its temporal dead zone until its own initialiser runs, so
 * with the regex declared AFTER `REMOTE_BASE` the call threw
 * `ReferenceError: Cannot access 'LEADERBOARD_ORIGIN_RE' before initialization` at module load —
 * taking `main.ts` down with it. Not a leaderboard bug: a black screen, no game at all.
 *
 * ⚠ AND NO UNIT TEST COULD HAVE CAUGHT IT, which is the part worth recording. With the variable
 * UNSET — vitest, and every build before the owner approved a backend — `parseLeaderboardBase('')`
 * returns at its empty-string guard BEFORE it ever reaches the regex, so the dead zone is never
 * entered. The crash existed ONLY in a build with a real URL configured, i.e. only in production.
 * It was found by loading the actual game in a browser against the live worker.
 *
 * `ci.leaderboardGate.test.ts` now pins this ordering, because it is invisible to every other check.
 */
/**
 * ⛔ THE BUILD-TIME SWITCH.
 *
 * Read in the DOTTED form and declared in `vite.config.ts`; both are load-bearing and neither is
 * obvious. Aliasing `import.meta.env` first would defeat Vite's `define`, and leaving the key
 * undeclared would make CI (which always defines it, possibly as `''`) emit different BYTES from a
 * local build — breaking `verify-deploy`'s content-hash carrier on every green deploy.
 * `ci.leaderboardGate.test.ts` pins both halves.
 */
const REMOTE_BASE: string = parseLeaderboardBase(import.meta.env.VITE_LEADERBOARD_URL ?? '');


let client: LeaderboardClient | null = null;

/**
 * ⭐ PURE — which client a given base URL selects.
 *
 * ⛔ EXTRACTED BECAUSE THE PREVIOUS TESTS ASSERTED AN AMBIENT FACT AND WERE GREEN BY ACCIDENT. Two of
 * them pinned `isSharedBoardConfigured() === false` and `getLeaderboard().kind === 'local'`. Those
 * read the build-time constant, which is unset under vitest and SET in production — so they asserted
 * the exact opposite of what ships, passed anyway, and could never have caught a regression in the
 * thing they were named for. A test whose verdict depends on which environment happens to run it is
 * not a test of the code.
 *
 * The selection rule is the part worth pinning, so it is a pure function of its input and both
 * branches are asserted deterministically. Whether the VARIABLE reaches the bundle is a separate
 * question, and a source-text one — `ci.leaderboardGate.test.ts` owns it.
 */
export function selectLeaderboard(base: string): LeaderboardClient {
  return base === '' ? new LocalLeaderboard() : new RemoteLeaderboard(base);
}

/**
 * The process-wide leaderboard client.
 *
 * Built once and cached, so the choice cannot differ between two call sites in one session — the
 * failure mode where a run is submitted remotely and read back locally.
 */
export function getLeaderboard(): LeaderboardClient {
  if (client === null) client = selectLeaderboard(REMOTE_BASE);
  return client;
}

/** TEST SEAM — override the client, or pass `null` to restore the configured default. */
export function setLeaderboardForTests(next: LeaderboardClient | null): void {
  client = next;
}

/** Is a shared ranking configured in this build? */
export function isSharedBoardConfigured(): boolean {
  return REMOTE_BASE !== '';
}
