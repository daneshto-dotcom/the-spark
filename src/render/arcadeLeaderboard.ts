/**
 * SPARK — S182: **THE SHARED ARCADE LEADERBOARD — the client seam.**
 *
 * Owner, S182:
 * > *"I don't see anyone else's records on the arcade, on NONET, on the Sudoku. My friend played it
 * > and he put his name on and he got first place. Now I did my shit and I got first place. Who the
 * > fuck is first place? I can't even see his name. It should be just like an old arcade thing. You
 * > put your name, you see any other names that hit records, and the last ten places, twenty five
 * > names. It should be saved in a database."*
 *
 * ## ⛔ THIS IS THE FIRST SERVER-SIDE DEPENDENCY SPARK HAS EVER HAD, AND IT IS NOT SWITCHED ON
 *
 * Verified empirically rather than assumed: every `fetch()` in `src/` before this file is a
 * same-origin static asset (audio and atlas manifests), the only socket is `net/relayProbe.ts`'s
 * WebRTC signalling probe, and `deploy.yml` publishes a static artifact to GitHub Pages behind
 * `public/CNAME`. **There is no server of any kind.** Creating one means creating an ACCOUNT, a
 * bill, an uptime surface and a thing that can be attacked — none of which the owner has agreed to.
 *
 * So this module is the seam, not the switch. `REMOTE_BASE` is empty in every build shipped today,
 * `getLeaderboard()` therefore hands back the LOCAL implementation, and the game behaves exactly as
 * it did before — byte for byte at the behaviour level. The day he says yes, `VITE_LEADERBOARD_URL`
 * is set at build time and the same call sites start talking to `server/leaderboard/`. Nothing else
 * changes; there is no second code path to write.
 *
 * ## ⭐ THE LOCAL BOARD IS NOT A STUB — IT IS THE OFFLINE TIER, PERMANENTLY
 *
 * Even with the backend live, `RemoteLeaderboard` writes through to localStorage and MERGES the two
 * on every read. That is deliberate and it is the single most important property here: a player on a
 * dead train with no signal still gets their run recorded, still sees their own history, and loses
 * nothing. A leaderboard that silently discards a personal best because a request timed out is worse
 * than the local-only board this replaces.
 *
 * ⚠ **Consequence, stated plainly rather than discovered later:** merged boards mean a local row can
 * outrank a remote one on the player's own screen and not exist for anyone else, until the submit
 * eventually succeeds. That is the correct trade — the alternative is losing the run — but it means
 * "my screen says 3rd" is a claim about the merge, not about the server.
 *
 * ## Cheating — named, bounded, NOT solved
 *
 * A public write endpoint with no accounts means anyone who opens devtools can POST a 0:01 and sit
 * at the top forever. The worker applies a floor, a ceiling and a rate limit (see
 * `server/leaderboard/worker.js`), and **none of them is airtight**: every one is a bar to climb,
 * not a lock. Airtight would need the server to own the puzzle and the clock — a different feature,
 * an order of magnitude more work, for a board played among friends. The exposure is reported, not
 * gold-plated. If it is ever abused in practice, the cheap answer is a per-board wipe, which is one
 * SQL statement.
 */

import {
  BOARD_NONET,
  loadScores,
  mergeBoards,
  parseScoreRows,
  placeOf,
  recordRun,
  saveScores,
  TOP_N,
  type ArcadeScore,
} from './arcadeScores.ts';

export { BOARD_NONET };

/** What a submit tells the caller: the board as it now stands, and where this run landed on it. */
export interface LeaderboardResult {
  readonly scores: readonly ArcadeScore[];
  readonly place: number;
  readonly onBoard: boolean;
  /**
   * Did the authoritative (remote) board answer?
   *
   * ⚠ REPORTED RATHER THAN INFERRED. `kind === 'remote'` says which client is configured; this says
   * whether the network actually came back for THIS call. The overlay needs the second one to be
   * able to tell the player "this is the shared board" versus "this is your board, we'll sync it" —
   * and a client that is remote-configured but offline looks identical to a local one otherwise.
   */
  readonly shared: boolean;
}

/**
 * ⭐ THE WHOLE INTERFACE. Two methods, and `boardId` on both.
 *
 * The id is opaque and stage scoping rides on it (`'nonet'` today, `'nonet:s07'` when the ladder
 * lands) — see `BOARD_NONET`. Designing it in cost one parameter; retrofitting it would have cost a
 * migration on both sides.
 */
export interface LeaderboardClient {
  readonly kind: 'local' | 'remote';
  /** The top `TOP_N` rows for a board, best (smallest `ms`) first. Never throws; worst case `[]`. */
  top(boardId: string): Promise<readonly ArcadeScore[]>;
  /** Record a run. Never throws, and never loses the run — the local tier always takes it. */
  submit(boardId: string, entry: ArcadeScore): Promise<LeaderboardResult>;
}

/**
 * The board that exists today, and the offline tier once a backend is live.
 *
 * Every method is `async` over synchronous work on purpose: the interface has to be the SAME shape
 * for both implementations, or the call sites grow a branch and the local path stops being the thing
 * the remote path is tested against.
 */
export class LocalLeaderboard implements LeaderboardClient {
  readonly kind = 'local' as const;

  top(boardId: string): Promise<readonly ArcadeScore[]> {
    return Promise.resolve(loadScores(boardId));
  }

  submit(boardId: string, entry: ArcadeScore): Promise<LeaderboardResult> {
    const { scores, place, onBoard } = recordRun(entry.name, entry.ms, entry.at, boardId);
    return Promise.resolve({ scores, place, onBoard, shared: false });
  }
}

/** How long a leaderboard request may hang before the local board answers instead. */
export const REQUEST_TIMEOUT_MS = 4000;

/**
 * The shared board — **inert until a base URL is configured.**
 *
 * ⛔ EVERY FAILURE PATH FALLS BACK TO LOCAL AND NONE OF THEM THROWS. Offline, DNS failure, a 500, a
 * 404 from a half-deployed worker, a hang, HTML returned by a captive-portal wifi login page, JSON
 * that parses but is not an array — all of them are ORDINARY here, not exceptional, and every one of
 * them has to end with the player's run recorded and the arcade still on screen. The board is the
 * last thing a player sees after a good run; it is the worst possible place to surface a network
 * error.
 */
export class RemoteLeaderboard implements LeaderboardClient {
  readonly kind = 'remote' as const;
  private readonly base: string;
  private readonly local = new LocalLeaderboard();

  /** `base` is the worker origin, with any trailing slash trimmed so URL joins stay predictable. */
  constructor(base: string) {
    this.base = base.replace(/\/+$/, '');
  }

  async top(boardId: string): Promise<readonly ArcadeScore[]> {
    const local = loadScores(boardId);
    const remote = await this.get(boardId);
    return remote === null ? local : mergeBoards(remote, local);
  }

  async submit(boardId: string, entry: ArcadeScore): Promise<LeaderboardResult> {
    // ⭐ LOCAL FIRST, ALWAYS, AND BEFORE THE AWAIT. If the tab is closed the instant the board
    // appears — which is exactly when a player who just set a record alt-tabs to tell someone — the
    // run is already on disk. Ordering this after the network call would make "did my run count?"
    // depend on how long the player looked at the screen.
    const localResult = await this.local.submit(boardId, entry);
    const remote = await this.post(boardId, entry);
    if (remote === null) return localResult;

    const scores = mergeBoards(remote, loadScores(boardId));
    // ⚠ Write the merged view BACK to local storage. Without this the player's cache never learns
    // about anyone else's runs, so the first screen after a cold start with no signal shows a board
    // of one row again — the exact symptom this whole feature exists to end.
    saveScores(scores, boardId);
    const place = placeOf(scores, entry);
    return { scores, place, onBoard: place <= TOP_N, shared: true };
  }

  /** GET the board. `null` means "the network did not answer" — distinct from an EMPTY board. */
  private async get(boardId: string): Promise<readonly ArcadeScore[] | null> {
    return this.request(`${this.base}/board/${encodeURIComponent(boardId)}?n=${TOP_N}`, {
      method: 'GET',
    });
  }

  private async post(boardId: string, entry: ArcadeScore): Promise<readonly ArcadeScore[] | null> {
    return this.request(`${this.base}/board/${encodeURIComponent(boardId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: entry.name, ms: entry.ms, at: entry.at }),
    });
  }

  /**
   * One request, one place where every way it can fail is handled.
   *
   * ⚠ THE TIMEOUT IS THE POINT, not the try/catch. `fetch` on a dead-but-not-refused network does
   * not reject quickly — it can hang for the OS TCP timeout, tens of seconds, while the player stares
   * at a frozen SOLVED screen. `AbortSignal.timeout` bounds it at `REQUEST_TIMEOUT_MS` and the local
   * board answers instead.
   */
  private async request(
    url: string,
    init: RequestInit,
  ): Promise<readonly ArcadeScore[] | null> {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      if (typeof body !== 'object' || body === null) return null;
      const rows = (body as { scores?: unknown }).scores;
      // ⛔ AN ABSENT `scores` IS A FAILURE, NOT AN EMPTY BOARD. `parseScoreRows` maps anything
      // non-array to `[]`, so returning it unconditionally here would turn a malformed 200 — a
      // captive portal's HTML, a worker deployed without its route — into "the shared board is
      // empty", quietly wiping every other player's rows out of the merge.
      if (!Array.isArray(rows)) return null;
      return parseScoreRows(rows);
    } catch {
      return null; // offline, DNS, CORS, abort, non-JSON body — all one answer: use the local board
    }
  }
}

/**
 * ⛔ THE GATE, IN ONE CONSTANT. Empty in every build shipped today.
 *
 * Read in the DOTTED form (`import.meta.env.VITE_LEADERBOARD_URL`) and declared in `vite.config.ts`,
 * both of which are load-bearing and neither of which is obvious — see the S158/S160 notes in
 * `ci.deployGate.test.ts`. Aliasing `import.meta.env` into a local first would defeat Vite's
 * `define`, and leaving the key undeclared would make CI (which always defines it, possibly as `''`)
 * emit different BYTES from a local build, which breaks `verify-deploy`'s content-hash carrier on
 * every green deploy. `ci.leaderboardGate.test.ts` pins both halves.
 */
const REMOTE_BASE: string = import.meta.env.VITE_LEADERBOARD_URL ?? '';

let client: LeaderboardClient | null = null;

/**
 * The process-wide leaderboard client.
 *
 * Lazily built and cached, so the choice is made once and cannot differ between two call sites in
 * the same session — the failure mode where a run is submitted remotely and then read back locally.
 */
export function getLeaderboard(): LeaderboardClient {
  if (client === null) {
    client = REMOTE_BASE === '' ? new LocalLeaderboard() : new RemoteLeaderboard(REMOTE_BASE);
  }
  return client;
}

/** TEST SEAM — override the client, or pass `null` to restore the configured default. */
export function setLeaderboardForTests(next: LeaderboardClient | null): void {
  client = next;
}

/** Is a shared board configured in this build? False in everything shipped before the owner's go. */
export function isSharedBoardConfigured(): boolean {
  return REMOTE_BASE !== '';
}
