/**
 * SPARK — S182: the leaderboard worker, EXECUTED.
 *
 * ⛔ THIS FILE EXISTS BECAUSE THE WORKER HAD ZERO TEST COVERAGE WHILE BEING THE ONLY SERVER SPARK HAS
 * AND A PUBLIC WRITE ENDPOINT. Everything about it was verified by source-text greps and by curl
 * against the live deployment — which proves the deployed build, not the file in the repo, and
 * catches nothing before it ships. A rewrite (R182-G changed the entire data model) with no
 * executable tests is how a green suite ships a broken backend.
 *
 * `env.DB` is stubbed by matching on the SQL text rather than by interpreting SQL. That keeps the
 * fake honest about what it is: it is not a database, so it cannot prove a query is *correct* — the
 * live checks do that. What it CAN prove, and what actually breaks in practice, is the routing, the
 * validation, the status codes, the CORS posture, the ordering rule and the fold arithmetic.
 */

import { describe, expect, it } from 'vitest';

import worker, { isAllowedOrigin, normaliseName, parseRuns, rankRows } from '../server/leaderboard/worker.js';

const ORIGIN = 'https://spark-online.space';
const SALT = 'x'.repeat(32);

/** An in-memory stand-in for the D1 binding, dispatching on the SQL it is handed. */
function makeDb(seed: Array<{ name: string; runs: number; total_ms: number }> = []) {
  const players = new Map(seed.map((p) => [p.name, { ...p }]));
  const writes: Array<{ ip_hash: string; created: number }> = [];
  const boards = new Set(['nonet']);

  const stmt = (sql: string) => {
    let args: unknown[] = [];
    const api = {
      bind(...a: unknown[]) { args = a; return api; },
      async first() {
        if (sql.includes('FROM boards')) return boards.has(String(args[0])) ? { ok: 1 } : null;
        if (sql.includes('COUNT(*) AS n FROM writes')) {
          const since = Number(args[1]);
          return { n: writes.filter((w) => w.ip_hash === args[0] && w.created > since).length };
        }
        if (sql.includes('FROM players WHERE board = ?1 AND name = ?2')) {
          return players.get(String(args[1])) ?? null;
        }
        // The true-rank COUNT: how many players sit strictly ahead of (avg, runs, name).
        if (sql.includes('COUNT(*) AS n FROM players')) {
          const [, avg, runs, name] = args as [string, number, number, string];
          const ahead = [...players.values()].filter((p) => {
            const a = p.total_ms / p.runs;
            if (a < avg) return true;
            return a === avg && (p.runs > runs || (p.runs === runs && p.name < name));
          });
          return { n: ahead.length };
        }
        return null;
      },
      async all() {
        if (sql.includes('FROM players WHERE board = ?1')) return { results: [...players.values()] };
        return { results: [] };
      },
      async run() {
        if (sql.startsWith('INSERT INTO writes')) writes.push({ ip_hash: String(args[0]), created: Number(args[1]) });
        else if (sql.startsWith('DELETE FROM writes')) {
          const cutoff = Number(args[0]);
          for (let i = writes.length - 1; i >= 0; i--) if (writes[i].created <= cutoff) writes.splice(i, 1);
        } else if (sql.includes('INSERT INTO players')) {
          const name = String(args[1]);
          const ms = Number(args[2]);
          const cur = players.get(name);
          if (cur === undefined) players.set(name, { name, runs: 1, total_ms: ms });
          else { cur.runs += 1; cur.total_ms += ms; }
        }
        return { success: true };
      },
    };
    return api;
  };

  return {
    prepare: (sql: string) => stmt(sql),
    async batch(list: Array<{ run: () => Promise<unknown> }>) {
      for (const s of list) await s.run();
      return [];
    },
    _players: players,
    _writes: writes,
  };
}

const call = async (
  init: { method?: string; path?: string; origin?: string; body?: unknown; salt?: string },
  db = makeDb(),
) => {
  const req = new Request(`https://w.example${init.path ?? '/board/nonet'}`, {
    method: init.method ?? 'POST',
    headers: {
      ...(init.origin === undefined ? {} : { Origin: init.origin }),
      'content-type': 'application/json',
      'CF-Connecting-IP': '203.0.113.9',
    },
    body: init.method === 'GET' || init.method === 'OPTIONS' ? undefined : JSON.stringify(init.body ?? {}),
  });
  const res = await worker.fetch(req, { DB: db, IP_SALT: init.salt ?? SALT });
  return { res, db, body: res.status === 204 ? null : await res.json() };
};

describe('worker — pure helpers', () => {
  it('normaliseName clamps to three characters and defaults an all-space name', () => {
    expect(normaliseName('danny')).toBe('DAN');
    expect(normaliseName('   ')).toBe('AAA');
    expect(normaliseName(null)).toBe('AAA');
  });

  it('⭐ rankRows orders by AVERAGE ascending — the inverted sort, server side', () => {
    const rows = rankRows([
      { name: 'SLO', runs: 1, total_ms: 200_000 },
      { name: 'FST', runs: 2, total_ms: 80_000 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['FST', 'SLO']);
    expect(rows[0].averageMs).toBe(40_000);
  });

  it('and ties break on more runs, then name — matching the client exactly', () => {
    const rows = rankRows([
      { name: 'BBB', runs: 2, total_ms: 120_000 },
      { name: 'AAA', runs: 2, total_ms: 120_000 },
      { name: 'CCC', runs: 9, total_ms: 540_000 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['CCC', 'AAA', 'BBB']);
  });

  it('parseRuns rejects an empty batch, an oversized one, and implausible times', () => {
    expect(parseRuns({ runs: [] }).error).toBe('no runs');
    expect(parseRuns({ runs: Array(99).fill({ name: 'A', ms: 60_000 }) }).error).toBe('too many runs');
    expect(parseRuns({ runs: [{ name: 'A', ms: 5 }] }).error).toBe('implausible time');
    expect(parseRuns({ runs: [{ name: 'A', ms: 60_000 }] }).runs).toEqual([{ name: 'AAA', ms: 60_000 }]);
  });

  it('isAllowedOrigin allows the game and any localhost port, and nothing else', () => {
    expect(isAllowedOrigin(ORIGIN)).toBe(true);
    expect(isAllowedOrigin('http://localhost:33159')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.example')).toBe(false); // ⛔ not a prefix match
    expect(isAllowedOrigin('')).toBe(false);
  });
});

describe('worker — the request surface', () => {
  it('OPTIONS preflight answers 204 with CORS', async () => {
    const { res } = await call({ method: 'OPTIONS', origin: ORIGIN });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('an unknown path is 404', async () => {
    expect((await call({ method: 'GET', path: '/nope' })).res.status).toBe(404);
  });

  it('⛔ a malformed percent-escape is 400, not an uncaught 500', async () => {
    expect((await call({ method: 'GET', path: '/board/%' })).res.status).toBe(400);
  });

  it('⛔ a cross-origin WRITE is refused IN THE WORKER, not left to CORS', async () => {
    // CORS is enforced by the BROWSER on the response; it does not stop the request arriving or the
    // row being written.
    expect((await call({ origin: 'https://evil.example', body: { runs: [{ name: 'HAX', ms: 60_000 }] } })).res.status).toBe(403);
    expect((await call({ body: { runs: [{ name: 'HAX', ms: 60_000 }] } })).res.status).toBe(403); // no Origin at all
  });

  it('⛔ a missing IP_SALT FAILS CLOSED with 503 rather than silently using a public constant', async () => {
    const { res } = await call({ origin: ORIGIN, salt: '', body: { runs: [{ name: 'DAN', ms: 60_000 }] } });
    expect(res.status).toBe(503);
  });

  it('an implausible time is 422 and writes nothing', async () => {
    const { res, db } = await call({ origin: ORIGIN, body: { runs: [{ name: 'CHT', ms: 5 }] } });
    expect(res.status).toBe(422);
    expect(db._players.size).toBe(0);
  });

  it('⛔ an unregistered board is 404 — the namespace is bounded by a registry', async () => {
    const { res } = await call({ origin: ORIGIN, path: '/board/invented', body: { runs: [{ name: 'DAN', ms: 60_000 }] } });
    expect(res.status).toBe(404);
  });

  it('⛔ an unhandled DB error becomes a CORS-BEARING 500, not a headerless crash', async () => {
    // Cloudflare's own 1101 page carries no CORS headers, so the browser rejects it before the client
    // can read the status — making a dead backend pixel-identical to being offline.
    const broken = { prepare() { throw new Error('no such table: players'); }, batch() { throw new Error('x'); } };
    const req = new Request('https://w.example/board/nonet', {
      method: 'GET', headers: { Origin: ORIGIN },
    });
    const res = await worker.fetch(req, { DB: broken, IP_SALT: SALT });
    expect(res.status).toBe(500);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(JSON.stringify(await res.json())).not.toContain('players'); // never echoes schema detail
  });
});

describe('worker — R182-G: the fold', () => {
  it('⭐ a first run creates the player at one run', async () => {
    const { res, body, db } = await call({ origin: ORIGIN, body: { runs: [{ name: 'DAN', ms: 60_000 }], focus: 'DAN' } });
    expect(res.status).toBe(200);
    expect(db._players.get('DAN')).toEqual({ name: 'DAN', runs: 1, total_ms: 60_000 });
    // ⭐ `place` is the server's TRUE rank across every player, not a position within the top 25 —
    // the client cannot compute it, because it only ever receives the top rows.
    expect(body.you).toEqual({
      name: 'DAN', runs: 1, averageMs: 60_000, previousAverageMs: null, place: 1,
    });
  });

  it('⭐ an existing player ACCUMULATES, and the recap gets the OLD average', async () => {
    const db = makeDb([{ name: 'DAN', runs: 10, total_ms: 800_000 }]); // avg 1:20
    const { body } = await call({ origin: ORIGIN, body: { runs: [{ name: 'DAN', ms: 63_000 }], focus: 'DAN' } }, db);
    expect(body.you.previousAverageMs).toBe(80_000); // what it WAS — the cinematic's first number
    expect(body.you.runs).toBe(11);
    expect(body.you.averageMs).toBeCloseTo(78_454.5, 0); // and it came down
  });

  it('a batch folds every run — the offline queue flush', async () => {
    const db = makeDb();
    const { body } = await call({
      origin: ORIGIN,
      body: { runs: [{ name: 'DAN', ms: 60_000 }, { name: 'DAN', ms: 80_000 }, { name: 'SAM', ms: 70_000 }], focus: 'DAN' },
    }, db);
    expect(db._players.get('DAN')).toEqual({ name: 'DAN', runs: 2, total_ms: 140_000 });
    expect(body.you.runs).toBe(2);
    // Both average 70 000 ms, so the tie breaks on RUN COUNT: DAN's two runs outrank SAM's one.
    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(['DAN', 'SAM']);
  });

  it('the server RE-CLAMPS a submitted name rather than trusting the client', async () => {
    const db = makeDb();
    await call({ origin: ORIGIN, body: { runs: [{ name: '<script>alert(1)</script>', ms: 60_000 }] } }, db);
    expect([...db._players.keys()][0]).toHaveLength(3);
  });

  it('GET returns the ranking without writing anything', async () => {
    const db = makeDb([{ name: 'DAN', runs: 2, total_ms: 120_000 }]);
    const { body } = await call({ method: 'GET', origin: ORIGIN }, db);
    expect(body.rows).toEqual([{ name: 'DAN', runs: 2, averageMs: 60_000 }]);
    expect(db._writes).toHaveLength(0);
  });
});

describe('worker — the rate limit', () => {
  it('⛔ counts `writes`, a table nothing prunes, so it cannot erase its own evidence', async () => {
    const db = makeDb();
    for (let i = 0; i < 5; i++) {
      await call({ origin: ORIGIN, body: { runs: [{ name: 'DAN', ms: 60_000 }] } }, db);
    }
    // The first cut counted the ranking table, which its own prune emptied — so the counter never
    // rose and one IP had unlimited writes. These markers survive the fold.
    expect(db._writes.length).toBeGreaterThanOrEqual(5);
  });

  it('⛔ refuses with 429 past the limit, AND STILL RETURNS THE BOARD', async () => {
    // A rate-limited player has just finished a run; answering with a bare error would blank the
    // screen they came to look at, and the client has already recorded the run locally anyway.
    const db = makeDb();
    let last;
    for (let i = 0; i < 45; i++) {
      last = await call({ origin: ORIGIN, body: { runs: [{ name: 'DAN', ms: 60_000 }] } }, db);
    }
    expect(last!.res.status).toBe(429);
    expect(last!.body.rows).toBeDefined();
  });
});
