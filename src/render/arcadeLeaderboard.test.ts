/**
 * SPARK — S182 R182-G: the shared ranking client.
 *
 * ⛔ THE ASSERTIONS THAT MATTER MOST ARE THE FAILURE PATHS, NOT THE HAPPY ONE. The happy path will be
 * exercised by hand the first time anyone plays. What will not is the aeroplane, the dead wifi, the
 * captive portal that answers 200 with an HTML login page, and the half-deployed worker that 404s.
 * Every one must end with the run recorded and the arcade still on screen — the recap is the last
 * thing a player sees after a good run and the worst possible place to surface a network error.
 *
 * ⛔ AND UNDER AN AVERAGE, "the run was recorded" IS STRICTLY MORE IMPORTANT THAN IT USED TO BE. A
 * dropped run is not a missed row; it is a permanently wrong number that no later run can repair.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOARD_NONET,
  getLeaderboard,
  isSharedBoardConfigured,
  LocalLeaderboard,
  parseLeaderboardBase,
  RemoteLeaderboard,
  selectLeaderboard,
  setLeaderboardForTests,
  withOwnRow,
} from './arcadeLeaderboard.ts';
import {
  entryOf,
  loadPending,
  loadRanking,
  PENDING_MAX_AGE_MS,
  savePending,
  saveRanking,
} from './arcadeScores.ts';

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

/** A `fetch` stub that answers with `body`/`status` and records what it was called with. */
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

describe('R182-G — which client a build selects', () => {
  /**
   * ⛔ THIS REPLACES TWO TESTS THAT WERE GREEN BY ACCIDENT. They asserted
   * `isSharedBoardConfigured() === false` and a local `kind` — reading the BUILD-TIME constant, which
   * is unset under vitest and SET in production. They therefore asserted the opposite of what ships,
   * passed anyway, and could never have caught a regression in the thing they were named for.
   *
   * The selection RULE is what is worth pinning, so it is tested as a pure function of its input with
   * both branches asserted. Whether the variable reaches the bundle is a source-text question and
   * `ci.leaderboardGate.test.ts` owns it.
   */
  it('⭐ a configured base selects the REMOTE client', () => {
    expect(selectLeaderboard('https://board.example').kind).toBe('remote');
  });

  it('⭐ an empty base selects the LOCAL client — a supported state, not a failure', () => {
    expect(selectLeaderboard('').kind).toBe('local');
  });

  it('getLeaderboard agrees with selectLeaderboard for THIS environment, whatever it is', () => {
    // Deliberately asserts a RELATIONSHIP rather than a value, so it is true in CI and in production.
    expect(getLeaderboard().kind).toBe(isSharedBoardConfigured() ? 'remote' : 'local');
  });

  it('is cached, so two call sites cannot disagree', () => {
    expect(getLeaderboard()).toBe(getLeaderboard());
  });
});

describe('R182-G — the local tier folds an average', () => {
  it('a first run reports no previous average and a count of one', async () => {
    const r = await new LocalLeaderboard().submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.previousAverageMs).toBeNull();
    expect(r.runs).toBe(1);
    expect(r.averageMs).toBe(60_000);
    expect(r.place).toBe(1);
    expect(r.shared).toBe(false); // never claims to be the shared ranking
  });

  it('⭐ a second run reports the OLD average and the new one — the cinematic inputs', async () => {
    const local = new LocalLeaderboard();
    await local.submit(BOARD_NONET, 'DAN', 90_000);
    const r = await local.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.previousAverageMs).toBe(90_000);
    expect(r.averageMs).toBe(75_000);
    expect(r.runs).toBe(2);
  });

  it('is ranked from the very first game — the owner ruled out a minimum run count', async () => {
    const local = new LocalLeaderboard();
    await local.submit(BOARD_NONET, 'OLD', 70_000);
    const r = await local.submit(BOARD_NONET, 'NEW', 40_000);
    expect(r.place).toBe(1); // one run, straight to the top
  });
});

describe('R182-G — the remote tier, and every way the network can let a player down', () => {
  it('folds server-side and reports the shared ranking', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({
      rows: [{ name: 'FRD', runs: 9, averageMs: 50_000 }, { name: 'DAN', runs: 2, averageMs: 75_000 }],
      you: { name: 'DAN', runs: 2, averageMs: 75_000, previousAverageMs: 90_000 },
    });
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.shared).toBe(true);
    // ⭐ THE OWNER'S ORIGINAL COMPLAINT AS AN ASSERTION: his friend is on his screen, and his place
    // is measured against them rather than against an empty table.
    expect(r.rows.map((x) => x.name)).toEqual(['FRD', 'DAN']);
    expect(r.place).toBe(2);
    expect(r.previousAverageMs).toBe(90_000);
  });

  it('⭐ PREFERS THE SERVER\'S previous average — local storage is empty on a new device', async () => {
    // The normal case, not an edge one: a phone, a friend's laptop, a cleared cache. Trusting local
    // storage would announce FIRST RUN to someone on their fortieth and count up from nonsense.
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({
      rows: [{ name: 'DAN', runs: 40, averageMs: 71_000 }],
      you: { name: 'DAN', runs: 40, averageMs: 71_000, previousAverageMs: 72_000 },
    });
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.previousAverageMs).toBe(72_000);
    expect(r.runs).toBe(40);
  });

  it('⛔ OFFLINE — the run is recorded locally AND queued for the next submit', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.shared).toBe(false);
    expect(r.runs).toBe(1);
    expect(loadRanking(BOARD_NONET)).toHaveLength(1); // ⭐ the run was NOT lost
    expect(loadPending(BOARD_NONET)).toMatchObject([{ name: 'DAN', ms: 60_000 }]); // ⭐ and will be sent
  });

  it('⭐ FLUSHES the queue on the next successful submit, oldest first', async () => {
    // ⚠ S183 — `at: Date.now()` because the flush now DROPS anything past `PENDING_MAX_AGE_MS`.
    // A literal epoch here would make this test start failing in 1970 + 12 h, which it silently did
    // not before the stamp existed. The expiry itself is asserted below.
    const fresh = Date.now();
    savePending(
      [
        { name: 'DAN', ms: 80_000, id: 'q1', at: fresh },
        { name: 'DAN', ms: 70_000, id: 'q2', at: fresh },
      ],
      BOARD_NONET,
    );
    const remote = new RemoteLeaderboard('https://board.example');
    const { calls } = stubFetch({
      rows: [{ name: 'DAN', runs: 3, averageMs: 70_000 }],
      you: { name: 'DAN', runs: 3, averageMs: 70_000, previousAverageMs: 80_000 },
    });
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    const sent = JSON.parse(String(calls[0][1].body)) as { runs: Array<{ ms: number }> };
    expect(sent.runs.map((x) => x.ms)).toEqual([80_000, 70_000, 60_000]); // queue first, in order
    expect(r.flushed).toBe(2); // surfaced so a run count jumping by 3 is explained, not a bug
    expect(loadPending(BOARD_NONET)).toEqual([]); // and the queue is cleared
  });

  it('⛔ a 500 falls back without throwing, and still queues', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({ rows: [] }, 500);
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.shared).toBe(false);
    expect(loadPending(BOARD_NONET)).toHaveLength(1);
  });

  it('⛔ a 200 with NO `rows` array is a failure, not an empty ranking', async () => {
    // The captive-portal case: hotel wifi answers every request with its own login page, status 200.
    // Treating that as "nobody has played" would wipe every other player out of the cache.
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({ login: 'please sign in' });
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.shared).toBe(false);
    expect(loadPending(BOARD_NONET)).toHaveLength(1);
  });

  it('a malformed remote row is dropped without taking the ranking with it', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({
      rows: [
        { name: 'OKA', runs: 3, averageMs: 50_000 },
        { name: 'ZER', runs: 0, averageMs: 10 },
        { name: 'NAN', runs: 2, averageMs: Number.NaN },
        { nope: true },
      ],
      you: { name: 'OKA', runs: 3, averageMs: 50_000, previousAverageMs: null },
    });
    const r = await remote.submit(BOARD_NONET, 'OKA', 60_000);
    expect(r.rows.map((x) => x.name)).toEqual(['OKA']);
  });

  it('⛔ a remote NAME is re-clamped client-side, not trusted', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({ rows: [{ name: '<script>'.repeat(40), runs: 1, averageMs: 50_000 }], you: null });
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.rows[0].name).toHaveLength(3);
  });

  it('bounds the request so a hanging network cannot freeze the SOLVED screen', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    const { calls } = stubFetch({ rows: [], you: null });
    await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(calls[0][1].signal).toBeDefined();
  });

  it('addresses the board by id, so a second board needs no code change', async () => {
    const remote = new RemoteLeaderboard('https://board.example/'); // trailing slash trimmed
    const { calls } = stubFetch({ rows: [], you: null });
    await remote.submit('nonet:s07', 'DAN', 60_000);
    expect(calls[0][0]).toBe('https://board.example/board/nonet%3As07');
  });
});

describe('R182-G — parseLeaderboardBase: "is it USABLE", never "is it set"', () => {
  it('accepts a real worker origin and a custom domain', () => {
    expect(parseLeaderboardBase('https://spark-leaderboard.x.workers.dev'))
      .toBe('https://spark-leaderboard.x.workers.dev');
    // Host-agnostic on purpose: a workers.dev-specific rule would silently reject a later move to
    // board.spark-online.space and send the owner back to the runbook with no idea why.
    expect(parseLeaderboardBase('https://board.spark-online.space')).toBe('https://board.spark-online.space');
  });

  it('⛔ REJECTS plain http on a public host — the browser blocks it as mixed content', () => {
    expect(parseLeaderboardBase('http://x.workers.dev')).toBe('');
  });

  it('but ALLOWS http on localhost — a dev server on the same machine is legitimate', () => {
    expect(parseLeaderboardBase('http://localhost:33159')).toBe('http://localhost:33159');
  });

  it('⛔ REJECTS a missing scheme, a path, and the literal CI strings', () => {
    expect(parseLeaderboardBase('x.workers.dev')).toBe('');
    expect(parseLeaderboardBase('https://x.workers.dev/board')).toBe('');
    for (const s of ['undefined', 'null', 'false']) expect(parseLeaderboardBase(s)).toBe('');
  });

  it('⭐ RECOVERS a wrapped paste — the exact S162 shape that killed multiplayer', () => {
    expect(parseLeaderboardBase('url: "https://x.workers.dev",')).toBe('https://x.workers.dev');
  });

  it('⛔ and recovering a paste must NOT eat the scheme of a clean value', () => {
    // Caught by RUNNING the report, not by reading it: without the `(?!//)` lookahead the stripper
    // read `https:` as a `key:` prefix, so the parser accepted ONLY wrapped values and rejected every
    // correct one — exactly inverted, and it would have looked like the feature simply did not work.
    expect(parseLeaderboardBase('https://x.workers.dev')).not.toBe('');
  });
});

describe('N1 — the recap must not lie to anyone outside the top 25', () => {
  /**
   * ⛔ `entries` is only ever the top `TOP_N` rows the server sent. A player ranked 30th is simply
   * ABSENT from it, so `entryOf` found nothing and the fallbacks reported `runs: 1` and
   * `averageMs: lastMs` — telling that player "YOUR FIRST RUN" on every run they ever play, with an
   * average that is just their last time. The server knows their real row and returns it in `you`.
   */
  it('⭐ a player OUTSIDE the returned rows still gets their real run count and average', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({
      // 'DAN' is deliberately NOT in rows — he is 30th, the client only ever sees the top 25.
      rows: [
        { name: 'AAA', runs: 9, averageMs: 40_000 },
        { name: 'BBB', runs: 9, averageMs: 41_000 },
      ],
      you: { name: 'DAN', runs: 30, averageMs: 95_000, previousAverageMs: 96_000, place: 30 },
    });
    const r = await remote.submit(BOARD_NONET, 'DAN', 90_000);
    expect(r.runs).toBe(30); // NOT 1
    expect(r.averageMs).toBe(95_000); // NOT lastMs
    expect(r.previousAverageMs).toBe(96_000); // so the recap eases, rather than saying FIRST RUN
    expect(r.place).toBe(30);
  });

  it('when the player IS in the rows, the server row and the slice agree', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({
      rows: [{ name: 'DAN', runs: 4, averageMs: 70_000 }],
      you: { name: 'DAN', runs: 4, averageMs: 70_000, previousAverageMs: 73_000, place: 1 },
    });
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.runs).toBe(4);
    expect(r.averageMs).toBe(70_000);
  });

  it('offline, one run IS the whole history we have — the fallback is still right there', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.runs).toBe(1);
    expect(r.averageMs).toBe(60_000);
  });
});

describe('N3 — the idempotency key is minted once and survives the queue', () => {
  it('⭐ every submitted run carries an id', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    const { calls } = stubFetch({ rows: [], you: null });
    await remote.submit(BOARD_NONET, 'DAN', 60_000);
    const sent = JSON.parse(String(calls[0][1].body)) as { runs: Array<{ id?: string }> };
    expect(typeof sent.runs[0].id).toBe('string');
    expect(sent.runs[0].id!.length).toBeGreaterThan(0);
  });

  it('⛔ A RETRY SENDS THE SAME ID — a fresh one would defend nothing', async () => {
    // The whole scenario: the abort fires on a request the server already committed, the run is
    // queued, and the next flush sends it again. The server can only recognise the duplicate if the
    // key is identical, so it is generated once and STORED with the queued run.
    const remote = new RemoteLeaderboard('https://board.example');
    vi.stubGlobal('fetch', () => Promise.reject(new Error('timeout')));
    await remote.submit(BOARD_NONET, 'DAN', 60_000);
    const queuedId = loadPending(BOARD_NONET)[0].id;

    const { calls } = stubFetch({ rows: [], you: null });
    await remote.submit(BOARD_NONET, 'DAN', 70_000);
    const sent = JSON.parse(String(calls[0][1].body)) as { runs: Array<{ id: string; ms: number }> };
    const resent = sent.runs.find((x) => x.ms === 60_000);
    expect(resent?.id).toBe(queuedId);
  });

  /*
   * ⛔⛔ S183 — AND THE ID ALONE WAS NOT ENOUGH, WHICH IS WHAT THESE TWO ADD.
   *
   * `seen_runs` is pruned after `SEEN_RUN_TTL_MS` (24 h) by ANY client's POST. A queue bounded only
   * by COUNT could therefore re-send a run whose key the server had already forgotten — and
   * sum-and-count makes that second fold permanent. The submit path now prunes by age.
   *
   * ⭐ THESE DRIVE `RemoteLeaderboard.submit`, NOT `prunePending`. A unit test of the pure helper
   * proves the rule exists; only this proves the submit path REACHES it — the S182 lesson that a
   * guard can be green over a live bug.
   */
  it('⛔ a STALE queued run is not re-sent — the double-count this closes', async () => {
    const stale = Date.now() - PENDING_MAX_AGE_MS - 1;
    savePending([{ name: 'DAN', ms: 80_000, id: 'ancient', at: stale }], BOARD_NONET);
    const remote = new RemoteLeaderboard('https://board.example');
    const { calls } = stubFetch({ rows: [], you: null });
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    const sent = JSON.parse(String(calls[0][1].body)) as { runs: Array<{ id: string }> };
    expect(sent.runs.map((x) => x.id)).not.toContain('ancient');
    expect(sent.runs).toHaveLength(1); // this run only
    expect(r.flushed).toBe(0);
  });

  it('⛔ and it LEAVES STORAGE, rather than being re-dropped on every submit forever', async () => {
    const stale = Date.now() - PENDING_MAX_AGE_MS - 1;
    savePending([{ name: 'DAN', ms: 80_000, id: 'ancient', at: stale }], BOARD_NONET);
    const remote = new RemoteLeaderboard('https://board.example');
    // The OFFLINE exit, because that is the path that writes the queue back with a run appended —
    // the one where a stale entry would otherwise be preserved indefinitely.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(loadPending(BOARD_NONET).map((x) => x.id)).not.toContain('ancient');
    expect(loadPending(BOARD_NONET)).toHaveLength(1); // just the run that failed
  });
});

describe('S183 — a veteran outside the top 25 is no longer told it is their first run', () => {
  /*
   * ⛔⛔ THE DEFECT. A successful submit replaced the local cache with the server's TOP 25 ONLY, so a
   * player ranked 30th had their own row DELETED. Their next FAILED submit then found no local row,
   * folded a fresh one at `runs: 1`, and the recap printed `THIS IS YOUR 1ST` with an average equal
   * to that single time — on every offline run, forever.
   *
   * ⭐ This is the same lie `serverMine` fixed on the ONLINE branch, still live on the OFFLINE one —
   * where the server is not there to correct it.
   */
  const TOP25_WITHOUT_ME = [{ name: 'AAA', runs: 50, averageMs: 30_000 }];

  it('⛔ a successful submit PRESERVES the player row the top 25 omits', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({
      rows: TOP25_WITHOUT_ME,
      you: { name: 'DAN', runs: 39, averageMs: 90_000, previousAverageMs: 90_500, place: 30 },
    });
    await remote.submit(BOARD_NONET, 'DAN', 60_000);
    const cached = loadRanking(BOARD_NONET);
    expect(cached.map((e) => e.name)).toContain('DAN');
    expect(entryOf(cached, 'DAN')?.runs).toBe(39);
    expect(entryOf(cached, 'DAN')?.totalMs).toBe(39 * 90_000);
    // ⚠ and the other players are still there — this preserves a row, it does not replace the board.
    expect(cached.map((e) => e.name)).toContain('AAA');
  });

  it('⛔⛔ so the NEXT, OFFLINE submit reports their real history, not run 1', async () => {
    const remote = new RemoteLeaderboard('https://board.example');
    stubFetch({
      rows: TOP25_WITHOUT_ME,
      you: { name: 'DAN', runs: 39, averageMs: 90_000, previousAverageMs: 90_500, place: 30 },
    });
    await remote.submit(BOARD_NONET, 'DAN', 60_000);

    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.shared).toBe(false);
    expect(r.runs).toBe(40);              // 39 the server knew about, plus this one
    expect(r.runs).not.toBe(1);           // ⛔ the bug report, stated as an assertion
    expect(r.averageMs).not.toBe(60_000); // …and the average is not just the last run
    expect(r.previousAverageMs).toBe(90_000);
  });

  it('⚠ the regression witness — a cache WITHOUT the row is what produced `runs: 1`', async () => {
    // Exactly the old behaviour, forced: save only the server's top 25 and go offline.
    saveRanking(
      TOP25_WITHOUT_ME.map((x) => ({ name: x.name, runs: x.runs, totalMs: x.runs * x.averageMs })),
      BOARD_NONET,
    );
    const remote = new RemoteLeaderboard('https://board.example');
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const r = await remote.submit(BOARD_NONET, 'DAN', 60_000);
    expect(r.runs).toBe(1);
    expect(r.averageMs).toBe(60_000);
  });
});

describe('S183 — withOwnRow, the three cases', () => {
  const TOP = [{ name: 'AAA', runs: 10, totalMs: 300_000 }];

  it('a player IN the table is left exactly as the server sent them', () => {
    const inTable = [...TOP, { name: 'DAN', runs: 4, totalMs: 200_000 }];
    expect(withOwnRow(inTable, 'DAN', { runs: 99, averageMs: 1 }, [])).toEqual(inTable);
  });

  it('a player OUTSIDE it is re-attached from the SERVER row when there is one', () => {
    const out = withOwnRow(TOP, 'DAN', { runs: 7, averageMs: 50_000 }, []);
    expect(entryOf(out, 'DAN')).toEqual({ name: 'DAN', runs: 7, totalMs: 350_000 });
  });

  it('⚠ the reconstructed totalMs is ROUNDED — averageMs is a float division', () => {
    // 3 runs summing 100_000 gives an average that is not representable; runs × average must still
    // come back to the integer the server holds.
    const out = withOwnRow(TOP, 'DAN', { runs: 3, averageMs: 100_000 / 3 }, []);
    expect(entryOf(out, 'DAN')?.totalMs).toBe(100_000);
  });

  it('falls back to the LOCAL row when the server declines to say — an older worker', () => {
    const local = [{ name: 'DAN', runs: 12, totalMs: 600_000 }];
    expect(entryOf(withOwnRow(TOP, 'DAN', undefined, local), 'DAN')?.runs).toBe(12);
    expect(entryOf(withOwnRow(TOP, 'DAN', null, local), 'DAN')?.runs).toBe(12);
  });

  it('adds NOTHING when there is neither a server row nor a local one', () => {
    expect(withOwnRow(TOP, 'DAN', null, [])).toEqual(TOP);
  });

  it('matches on the NORMALISED name, like every other lookup here', () => {
    const out = withOwnRow(TOP, 'dan', { runs: 2, averageMs: 10_000 }, []);
    expect(entryOf(out, 'DAN')?.runs).toBe(2);
  });

  it('is PURE — the server rows it was handed are not mutated', () => {
    const src = [...TOP];
    withOwnRow(src, 'DAN', { runs: 2, averageMs: 10_000 }, []);
    expect(src).toEqual(TOP);
  });
});
