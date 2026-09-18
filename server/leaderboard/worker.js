/**
 * SPARK — the shared arcade RANKING. A Cloudflare Worker over D1.
 *
 * ⭐⭐ **LIVE SINCE S182 — the first and only server SPARK has.** Deployed to
 * `https://spark-leaderboard.saras-fdtta.workers.dev` on the owner's own Cloudflare account after he
 * approved it. Everything else in this repo is static: every `fetch()` in `src/` is a same-origin
 * asset, the only socket is a WebRTC signalling probe, and the game is a GitHub Pages artifact.
 *
 * ⚠ **THE GAME'S DOMAIN IS NOT ON CLOUDFLARE AND DOES NOT NEED TO BE.** `spark-online.space` is
 * registered through Squarespace, its nameservers are Google's, and the live site is served by GitHub
 * Pages (`Server: GitHub.com`, no `cf-ray`). This worker is a separate thing on a `workers.dev`
 * hostname that the game calls cross-origin — which is why the Origin allowlist below is the whole
 * access-control story. Nothing about the domain changed to make this work.
 *
 * ## ⭐ RANKING IS BY AVERAGE (owner R182-G)
 *
 * One row per PLAYER, not per run. A submission folds one or more completed runs into that player's
 * `runs` + `total_ms`; the mean is derived, never stored. See `schema.sql` for why that is not a
 * stylistic choice.
 *
 * ## ⛔ CHEATING IS BOUNDED HERE, NOT SOLVED
 *
 * A public write endpoint with no accounts means anyone can POST a fabricated time. The mitigations
 * below raise the bar; **not one is airtight**, because nothing on this side of the wire can be while
 * the client owns the puzzle and the clock. ⚠ An average is in one way MORE robust than a best-time
 * board — one fake run moves a mean by only `1/n` — and in one way less, because a rival's average
 * can be dragged down by submitting slow runs under their name. Identity is a typed name and the
 * owner has accepted that explicitly. The remedy if abused is one statement:
 *   DELETE FROM players WHERE board = 'nonet';
 */

/** Rows returned per board. Must equal `TOP_N` in `src/render/arcadeScores.ts`. */
const TOP_N = 25;

/**
 * ⛔ PINNED TO THE ONE ORIGIN, NEVER `*`. `*` on a public write endpoint means any page on the
 * internet can POST from a visitor's browser. Local dev is handled by `isAllowedOrigin`.
 */
const ALLOWED_ORIGINS = new Set(['https://spark-online.space']);

/**
 * Local dev, on ANY port.
 *
 * ⚠ THE FIRST CUT HARDCODED `http://localhost:5173`, and this project assigns a RANDOM session port
 * to every dev server — so that one port is the one a developer is least likely to be on. Writes
 * would 403 during local testing while working in production, the most confusing possible split.
 *
 * ⛔ WIDENING IT COSTS NOTHING SECURITY-WISE, and that is worth stating rather than assuming:
 * `Origin` is set by the BROWSER and cannot be forged by a remote page, so a site at evil.example
 * cannot make a visitor send `Origin: http://localhost:1234`. The only party who can present a
 * localhost origin is someone already running code on the machine, who could use curl regardless.
 */
export function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(origin);
}

/**
 * Plausibility bounds on one submitted run.
 *
 * ⚠ MINE, NOT THE OWNER'S, with the measurement behind them. The floor is 15 s: a 6×6 NONET ships
 * ~16 givens, leaving ~20 cells, and 20 deliberate clicks plus digits cannot be done faster by a
 * human who is also reading the grid. The ceiling only rejects garbage that would otherwise sit
 * harmlessly at the bottom forever.
 *
 * ⛔ THE FLOOR IS A SPEED BUMP. A cheater posts 15001 and is top. It is here because it costs one
 * comparison and stops the *accidental* zero — a client bug sending `0` would pin an unbeatable
 * average at rank 1 permanently, which is the failure that would actually happen.
 */
const MIN_MS = 15_000;
const MAX_MS = 60 * 60 * 1000;

/** Runs allowed per IP per window. A human finishing NONETs cannot approach this. */
const RATE_LIMIT_RUNS = 40;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Most runs accepted in one request — bounds an offline backlog flush. */
const MAX_RUNS_PER_REQUEST = 21;

/** Board ids: `nonet` today, `nonet:s07` if a ladder ever lands. */
const BOARD_RE = /^[a-z0-9]+(?::[a-z0-9]+)?$/;

/** ⚠ Byte-identical to `NAME_ALPHABET` in `src/render/arcadeScores.ts`. */
const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
const NAME_LEN = 3;

/**
 * Server-side `normaliseName`.
 *
 * ⛔ THE SERVER RE-CLAMPS RATHER THAN TRUSTING THE CLIENT'S CLAMP. The client function is a UI
 * affordance on a form nobody has to use; this is the only thing between a raw POST and a
 * 10,000-character "name" rendered into a Pixi text field on every other player's screen.
 */
export function normaliseName(raw) {
  const kept = [...String(raw ?? '').toUpperCase()]
    .filter((c) => NAME_ALPHABET.includes(c))
    .slice(0, NAME_LEN);
  while (kept.length < NAME_LEN) kept.push('A');
  const name = kept.join('');
  return name.trim().length === 0 ? 'A'.repeat(NAME_LEN) : name;
}

/**
 * PURE — validate and clamp a submitted batch.
 *
 * Returns `{ runs }` on success or `{ error }` with the reason. Exported so it is executably tested:
 * before S182 this worker had ZERO test coverage and was outside `tsc` entirely.
 */
export function parseRuns(body) {
  if (typeof body !== 'object' || body === null) return { error: 'bad json' };
  const raw = body.runs;
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'no runs' };
  if (raw.length > MAX_RUNS_PER_REQUEST) return { error: 'too many runs' };
  const runs = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return { error: 'bad run' };
    const ms = Number(item.ms);
    if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) return { error: 'implausible time' };
    runs.push({ name: normaliseName(item.name), ms: Math.round(ms) });
  }
  return { runs };
}

/** PURE — rows → the ranking order. ⚠ Must match `compareRows` in `arcadeScores.ts`. */
export function rankRows(rows) {
  return [...rows]
    .sort((a, b) => {
      const aa = a.runs > 0 ? a.total_ms / a.runs : 0;
      const bb = b.runs > 0 ? b.total_ms / b.runs : 0;
      if (aa !== bb) return aa - bb;
      if (a.runs !== b.runs) return b.runs - a.runs;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    })
    .slice(0, TOP_N)
    .map((r) => ({ name: r.name, runs: r.runs, averageMs: r.runs > 0 ? r.total_ms / r.runs : 0 }));
}

function corsHeaders(origin) {
  const allowed = isAllowedOrigin(origin) ? origin : 'https://spark-online.space';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });
}

/**
 * Salted hash of the caller's IP, for rate limiting only.
 *
 * ⚠ SALTED, AND THE SALT IS A SECRET. A bare SHA-256 of an IPv4 address is brute-forced in seconds —
 * there are only 2^32 — so an unsalted column would be storing IP addresses with extra steps. This
 * never leaves the database and is never returned.
 */
async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readBoard(env, board) {
  const { results } = await env.DB.prepare(
    'SELECT name, runs, total_ms FROM players WHERE board = ?1',
  )
    .bind(board)
    .all();
  return rankRows(results ?? []);
}

async function readPlayer(env, board, name) {
  return env.DB.prepare(
    'SELECT name, runs, total_ms FROM players WHERE board = ?1 AND name = ?2',
  )
    .bind(board, name)
    .first();
}

export default {
  /**
   * ⛔ EVERY PATH IS WRAPPED, AND WITHOUT THIS A MISCONFIGURED BACKEND IS INVISIBLE.
   *
   * A missing `DB` binding, an unapplied schema, a transient D1 error or an exhausted daily quota all
   * throw out of the handler, and Cloudflare then answers with its OWN error page — which carries
   * **no CORS headers at all**. The browser rejects that before the client can read the status, the
   * client's catch treats it like being offline, and a completely dead backend looks identical to a
   * healthy one on the owner's screen. So: catch, log (visible in `wrangler tail`), and answer with a
   * CORS-bearing 500 the client can distinguish.
   */
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    try {
      return await handle(request, env, origin);
    } catch (err) {
      console.error('leaderboard worker error:', err && err.stack ? err.stack : String(err));
      return json({ error: 'server error' }, 500, origin); // never echo `err` — it carries schema detail
    }
  },
};

async function handle(request, env, origin) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const match = /^\/board\/([^/]+)$/.exec(url.pathname);
  if (match === null) return json({ error: 'not found' }, 404, origin);

  // ⚠ `decodeURIComponent` THROWS on a malformed escape — `/board/%` is a URIError, which without
  // this is an uncaught 1101 with no CORS headers.
  let board;
  try {
    board = decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return json({ error: 'bad board' }, 400, origin);
  }
  if (!BOARD_RE.test(board)) return json({ error: 'bad board' }, 400, origin);

  if (request.method === 'GET') {
    return json({ rows: await readBoard(env, board) }, 200, origin);
  }
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);

  /*
   * ⛔ FAIL CLOSED ON A MISSING SALT. This was `env.IP_SALT ?? 'spark'` — so skipping
   * `wrangler secret put IP_SALT`, one optional-looking line in a runbook, silently salted every hash
   * with a constant published in this public repo. A privacy property that degrades quietly when a
   * setup step is skipped is not a privacy property.
   */
  if (typeof env.IP_SALT !== 'string' || env.IP_SALT.length < 16) {
    return json({ error: 'server misconfigured: IP_SALT unset' }, 503, origin);
  }

  // ⛔ REJECT A CROSS-ORIGIN WRITE HERE, not via CORS. CORS is enforced by the BROWSER on the
  // RESPONSE; it does not stop the request arriving or the row being written. A script posting from
  // another page would have its reply blocked and its garbage stored anyway.
  if (!isAllowedOrigin(origin)) return json({ error: 'forbidden' }, 403, origin);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400, origin);
  }

  const parsed = parseRuns(body);
  if (parsed.error !== undefined) {
    return json({ error: parsed.error }, parsed.error === 'implausible time' ? 422 : 400, origin);
  }
  const runs = parsed.runs;
  const focus = normaliseName(typeof body.focus === 'string' ? body.focus : runs[runs.length - 1].name);

  // ⛔ ONLY A REGISTERED BOARD MAY BE WRITTEN TO. `BOARD_RE` bounds the SHAPE of an id, not how many
  // exist, so unlimited invented boards would be unlimited storage.
  const known = await env.DB.prepare('SELECT 1 AS ok FROM boards WHERE board = ?1').bind(board).first();
  if (known === null || known === undefined) return json({ error: 'unknown board' }, 404, origin);

  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
  const ipHash = await hashIp(ip, env.IP_SALT);

  /*
   * ⛔ THE LIMITER COUNTS `writes`, NOT the ranking table, and the first cut got this exactly
   * backwards — it counted rows that its own prune deleted moments later, so the counter never rose
   * above zero and the limit never fired.
   *
   * ⚠ MARKERS ARE INSERTED BEFORE THE COUNT, which is the safe order. D1 gives these statements no
   * transaction, so concurrent requests interleave; inserting first makes a race OVER-count (a racer
   * is refused a write it could have had) rather than UNDER-count (both see zero and both pass). A
   * rate limit that fails open under exactly the load it exists to stop is not a rate limit.
   */
  await env.DB.batch(
    runs.map(() =>
      env.DB.prepare('INSERT INTO writes (ip_hash, created) VALUES (?1, ?2)').bind(ipHash, now),
    ),
  );
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM writes WHERE ip_hash = ?1 AND created > ?2',
  )
    .bind(ipHash, now - RATE_LIMIT_WINDOW_MS)
    .first();
  if (Number(recent?.n ?? 0) > RATE_LIMIT_RUNS) {
    // ⚠ 429 AND THE BOARD ANYWAY. A rate-limited player has just finished a run and the client
    // already recorded it locally; answering with a bare error would blank the screen they came to
    // look at.
    return json({ error: 'slow down', rows: await readBoard(env, board) }, 429, origin);
  }

  // Read the focus player BEFORE folding, so the recap can say what the average WAS.
  const prior = await readPlayer(env, board, focus);
  const previousAverageMs =
    prior && Number(prior.runs) > 0 ? Number(prior.total_ms) / Number(prior.runs) : null;

  /*
   * ⭐ THE FOLD. One statement per run, batched. `ON CONFLICT` makes it an upsert, so a new name
   * starts at one run and an existing name accumulates — which IS the ranking rule.
   *
   * ⚠ NOTHING IS PRUNED HERE, deliberately. Pruning a PLAYER is destructive in a way pruning a RUN
   * never was: it erases a whole history and hands that player a fresh average. It is also
   * unnecessary — a 3-character name over a 37-character alphabet bounds a board at 37^3 rows.
   */
  await env.DB.batch(
    runs.map((r) =>
      env.DB.prepare(
        `INSERT INTO players (board, name, runs, total_ms, updated) VALUES (?1, ?2, 1, ?3, ?4)
         ON CONFLICT(board, name) DO UPDATE SET
           runs = runs + 1, total_ms = total_ms + ?3, updated = ?4`,
      ).bind(board, r.name, r.ms, now),
    ),
  );

  // Age out spent rate-limit markers. Bounded, cheap, and the only thing a limiter may forget.
  await env.DB.prepare('DELETE FROM writes WHERE created <= ?1').bind(now - RATE_LIMIT_WINDOW_MS).run();

  const after = await readPlayer(env, board, focus);
  const rows = await readBoard(env, board);

  /*
   * ⭐ THE TRUE PLACE, counted across EVERY player rather than inferred from the top 25.
   *
   * ⛔ THE CLIENT CANNOT COMPUTE THIS. It only ever receives the top `TOP_N` rows, so a player
   * ranked 28th is simply absent from the list and the best the client could say is "26th" — a
   * number that is quietly wrong for everyone outside the table, and wrong in the one place the
   * owner cares about ("and then that is your ranking").
   *
   * ⚠ THE COMPARISON MIRRORS `rankRows` EXACTLY — average ASC, then runs DESC, then name ASC. If it
   * drifted, a player's stated place would disagree with the position their own row occupies on the
   * table they are looking at.
   */
  let truePlace = null;
  if (after !== null && after !== undefined && Number(after.runs) > 0) {
    const avg = Number(after.total_ms) / Number(after.runs);
    const ahead = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM players WHERE board = ?1 AND (
         (CAST(total_ms AS REAL) / runs) < ?2
         OR ((CAST(total_ms AS REAL) / runs) = ?2 AND (runs > ?3 OR (runs = ?3 AND name < ?4)))
       )`,
    )
      .bind(board, avg, Number(after.runs), focus)
      .first();
    truePlace = Number(ahead?.n ?? 0) + 1;
  }
  return json(
    {
      rows,
      you:
        after === null || after === undefined
          ? null
          : {
              name: focus,
              runs: Number(after.runs),
              averageMs: Number(after.total_ms) / Number(after.runs),
              previousAverageMs,
              place: truePlace,
            },
    },
    200,
    origin,
  );
}
