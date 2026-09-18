/**
 * SPARK — S182: the shared arcade leaderboard client.
 *
 * Owner: *"I don't see anyone else's records on the arcade… Who the fuck is first place? I can't
 * even see his name… It should be saved in a database."*
 *
 * ⛔ THE ASSERTIONS THAT MATTER MOST ARE THE FAILURE PATHS, NOT THE HAPPY ONE.
 *
 * The happy path — a worker answers, the board merges, the player sees everyone — is the easy half
 * and the half that will be exercised by hand the moment it is switched on. What will NOT be
 * exercised by hand is the aeroplane, the dead wifi, the captive portal that returns an HTML login
 * page with a 200, or the half-deployed worker that 404s. Every one of those has to end with the
 * player's run recorded and the arcade still on screen, because the board is the last thing someone
 * sees after a good run and the worst possible place to surface a network error.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOARD_NONET,
  getLeaderboard,
  isSharedBoardConfigured,
  LocalLeaderboard,
  RemoteLeaderboard,
  setLeaderboardForTests,
  type LeaderboardClient,
} from './arcadeLeaderboard.ts';
import { loadScores, mergeBoards, TOP_N, type ArcadeScore } from './arcadeScores.ts';
import { applyRemoteBoard, commitRun, finishRun, startRun, syncRunToBoard } from './arcadeRun.ts';

const row = (name: string, ms: number, at = 0): ArcadeScore => ({ name, ms, at });

function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

beforeEach(installStorage);
afterEach(() => {
  setLeaderboardForTests(null);
  vi.unstubAllGlobals();
});

/** A `fetch` stub that answers with `body` and `status`, and records what it was called with. */
function stubFetch(body: unknown, status = 200): { calls: Array<[string, RequestInit]> } {
  const calls: Array<[string, RequestInit]> = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response);
  });
  return { calls };
}

describe('S182 — the LOCAL board still behaves exactly as it always did', () => {
  it('is what a build with no configured backend selects', () => {
    // ⛔ THE LOAD-BEARING ASSERTION OF THE WHOLE BRANCH. Shipping the seam must not ship the
    // backend: with `VITE_LEADERBOARD_URL` unset the game has to behave byte-for-byte as before,
    // because the owner has not approved an account and none exists.
    expect(isSharedBoardConfigured()).toBe(false);
    expect(getLeaderboard().kind).toBe('local');
  });

  it('records a run and reports the place', async () => {
    const local = new LocalLeaderboard();
    const r = await local.submit(BOARD_NONET, row('ABC', 90_000, 1));
    expect(r.place).toBe(1);
    expect(r.onBoard).toBe(true);
    expect(r.shared).toBe(false); // never claims to be the shared board
    expect(await local.top(BOARD_NONET)).toEqual([row('ABC', 90_000, 1)]);
  });

  it('a board id other than the default gets its OWN storage key', async () => {
    const local = new LocalLeaderboard();
    await local.submit(BOARD_NONET, row('ABC', 90_000, 1));
    await local.submit('nonet:s07', row('XYZ', 50_000, 2));
    // The stage board and the endless board are separate tables — this is the property that lets
    // the 30-stage ladder land without a migration.
    expect((await local.top(BOARD_NONET)).map((s) => s.name)).toEqual(['ABC']);
    expect((await local.top('nonet:s07')).map((s) => s.name)).toEqual(['XYZ']);
  });

  it("⛔ 'nonet' keeps the LEGACY storage key, so the owner's existing board is not wiped", () => {
    // He has real runs under this exact key right now. A tidier uniform key would have deleted them
    // silently on first load of the new build.
    globalThis.localStorage.setItem(
      'spark.arcade.nonet.scores.v1',
      JSON.stringify([row('OLD', 12_345, 7)]),
    );
    expect(loadScores(BOARD_NONET)).toEqual([row('OLD', 12_345, 7)]);
  });
});

describe('S182 — mergeBoards folds two tables without losing or duplicating a run', () => {
  it('de-duplicates on the FULL triple, not on the name', () => {
    // The same player appearing three times is the normal case on an arcade board, not a bug.
    const a = [row('ABC', 50_000, 1), row('ABC', 60_000, 2)];
    const b = [row('ABC', 50_000, 1), row('ABC', 70_000, 3)];
    expect(mergeBoards(a, b)).toEqual([
      row('ABC', 50_000, 1),
      row('ABC', 60_000, 2),
      row('ABC', 70_000, 3),
    ]);
  });

  it('⛔ two runs sharing a name AND a time are kept apart by `at`', () => {
    // The likeliest collision of all: one player replaying a board they have memorised. Collapsing
    // these would delete a real run, and would break `drawBoard`'s own-row highlight, which matches
    // on exactly this triple.
    const merged = mergeBoards([row('ABC', 50_000, 1)], [row('ABC', 50_000, 2)]);
    expect(merged).toHaveLength(2);
  });

  it('re-sorts fastest-first and caps at TOP_N', () => {
    const many = Array.from({ length: TOP_N + 10 }, (_, i) => row('AAA', 100_000 - i, i));
    const merged = mergeBoards(many, [row('WIN', 1, 999)]);
    expect(merged).toHaveLength(TOP_N);
    expect(merged[0]).toEqual(row('WIN', 1, 999));
    // lower ms is better — the inverted sort arcadeScores.ts exists to protect
    expect(merged[1].ms).toBeLessThan(merged[2].ms);
  });
});

describe('S182 — the REMOTE board, and every way the network can let a player down', () => {
  it('merges the shared board with the local one and reports `shared`', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({ scores: [row('FRD', 40_000, 5)] });
    const r = await remote.submit(BOARD_NONET, row('DAN', 60_000, 9));
    expect(r.shared).toBe(true);
    // ⭐ THE OWNER'S ACTUAL COMPLAINT, AS AN ASSERTION: his friend's row is on his screen, and his
    // own place is measured against it rather than against an empty table.
    expect(r.scores.map((s) => s.name)).toEqual(['FRD', 'DAN']);
    expect(r.place).toBe(2);
  });

  it('writes the merged board back to local storage, so a cold start is not empty again', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({ scores: [row('FRD', 40_000, 5)] });
    await remote.submit(BOARD_NONET, row('DAN', 60_000, 9));
    expect(loadScores(BOARD_NONET).map((s) => s.name)).toEqual(['FRD', 'DAN']);
  });

  it('⛔ OFFLINE — the run is still recorded and the local board is still shown', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const r = await remote.submit(BOARD_NONET, row('DAN', 60_000, 9));
    expect(r.shared).toBe(false);
    expect(r.onBoard).toBe(true);
    expect(loadScores(BOARD_NONET)).toEqual([row('DAN', 60_000, 9)]); // ⭐ the run was NOT lost
  });

  it('⛔ a 500 falls back rather than throwing', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({ scores: [] }, 500);
    const r = await remote.submit(BOARD_NONET, row('DAN', 60_000, 9));
    expect(r.shared).toBe(false);
    expect(loadScores(BOARD_NONET)).toHaveLength(1);
  });

  it('⛔ a 200 whose body has NO `scores` array is a failure, not an empty board', async () => {
    // The captive-portal case: hotel wifi answers every request with its own login page, status 200.
    // Treating that as "the shared board is empty" would wipe every other player out of the merge.
    const remote = new RemoteLeaderboard('https://board.example');
    globalThis.localStorage.setItem(
      'spark.arcade.nonet.scores.v1',
      JSON.stringify([row('FRD', 40_000, 5)]),
    );
    stubFetch({ login: 'please sign in' });
    const r = await remote.submit(BOARD_NONET, row('DAN', 60_000, 9));
    expect(r.shared).toBe(false);
    expect(r.scores.map((s) => s.name)).toEqual(['FRD', 'DAN']); // the cached rows survived
  });

  it('a malformed remote ROW is dropped without taking the board with it', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({
      scores: [
        { name: 'OK', ms: 30_000, at: 1 },         // legal, but two chars — padded, not rejected
        { name: 'BAD', ms: -5, at: 2 },            // negative time
        { name: 'NAN', ms: Number.NaN, at: 3 },    // NaN survives JSON as null → rejected
        { name: 'INF', ms: 1, at: Number.NaN },    // unusable tie-breaker → rejected
        { nope: true },                            // wrong shape entirely
      ],
    });
    const r = await remote.submit(BOARD_NONET, row('DAN', 60_000, 9));
    expect(r.scores.map((s) => s.name)).toEqual(['OKA', 'DAN']);
  });

  it('⛔ a remote NAME is re-clamped client-side, not trusted', async () => {
    // The endpoint is public: the worker clamps, and so does this. A row arriving with 200 characters
    // of anything would otherwise be handed straight to a Pixi text field on every player's board.
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({ scores: [{ name: '<script>'.repeat(40), ms: 30_000, at: 1 }] });
    const r = await remote.top(BOARD_NONET);
    expect(r[0].name).toHaveLength(3);
  });

  it('submits and reads the board id in the URL, so stage boards are addressable', async () => {
    const remote = new RemoteLeaderboard('https://board.example/');  // trailing slash trimmed
    const { calls } = stubFetch({ scores: [] });
    await remote.top('nonet:s07');
    expect(calls[0][0]).toBe(`https://board.example/board/nonet%3As07?n=${TOP_N}`);
  });

  it('bounds the request so a hanging network cannot freeze the SOLVED screen', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    const { calls } = stubFetch({ scores: [] });
    await remote.top(BOARD_NONET);
    expect(calls[0][1].signal).toBeDefined();
  });

  it('⛔ recording the same run twice does not put two identical rows on the table', async () => {
    // Reachable through a retry or a merge once the remote tier exists: `RemoteLeaderboard.submit`
    // records locally BEFORE the network call, and the same entry can come back through the merge.
    const local = new LocalLeaderboard();
    await local.submit(BOARD_NONET, row('DAN', 60_000, 9));
    await local.submit(BOARD_NONET, row('DAN', 60_000, 9));
    expect(await local.top(BOARD_NONET)).toHaveLength(1);
  });
});

describe('S182 — reconciling a committed run against the shared board', () => {
  const committedRun = (): ReturnType<typeof commitRun> =>
    commitRun(finishRun(startRun(0), 60_000), 9);

  it('applyRemoteBoard replaces the board, the place and the onBoard flag', () => {
    const run = committedRun();
    expect(run.place).toBe(1); // local board of one — always "1ST — NEW RECORD" before this lands
    const synced = applyRemoteBoard(run, {
      scores: [row('FRD', 40_000, 5), row('AAA', 60_000, 9)],
      place: 2,
      onBoard: true,
    });
    expect(synced.place).toBe(2);
    expect(synced.scores).toHaveLength(2);
  });

  it('⛔ a reply that lands after the player started ANOTHER run is dropped', () => {
    // The async hazard: this resolves frames later, and ENTER on the BOARD screen starts a fresh run
    // with a live clock. Writing a stale board and place over it would show the last run's result.
    const running = startRun(0);
    expect(running.phase).toBe('RUNNING');
    const synced = applyRemoteBoard(running, { scores: [row('X', 1, 1)], place: 1, onBoard: true });
    expect(synced).toBe(running); // untouched, same object
  });

  it('⭐ syncRunToBoard is a NO-OP while no backend is configured — the shipped state today', async () => {
    const run = committedRun();
    let called = false;
    setLeaderboardForTests({
      kind: 'remote',
      top: () => { called = true; return Promise.resolve([]); },
      submit: () => { called = true; throw new Error('must not be reached'); },
    } as LeaderboardClient);
    expect(await syncRunToBoard(run)).toBe(run);
    expect(called).toBe(false); // it never even asks for the client
  });
});
