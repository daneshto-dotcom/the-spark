/**
 * SPARK — the shared arcade leaderboard. A Cloudflare Worker over D1.
 *
 * ⭐⭐ **LIVE SINCE S182 — this is the first server SPARK has ever had.**
 *
 * Deployed to `https://spark-leaderboard.saras-fdtta.workers.dev` on the owner's own Cloudflare
 * account after he approved it in S182. Everything before it in this repo is static: every other
 * `fetch()` in `src/` is a same-origin asset, the only socket is a WebRTC signalling probe, and the
 * game itself is a static artifact on GitHub Pages behind `public/CNAME`.
 *
 * ⚠ **THE GAME'S DOMAIN IS NOT ON CLOUDFLARE AND DOES NOT NEED TO BE.** `spark-online.space` is
 * registered through Squarespace and its nameservers are Google's; the live site is served by GitHub
 * Pages (`Server: GitHub.com`, no `cf-ray`). This worker is a separate thing on a `workers.dev`
 * hostname that the game calls cross-origin — which is why the Origin allowlist below is the whole
 * access-control story. Nothing about the domain changed to make this work, and nothing has to.
 *
 * ## Why Workers + D1, and the one choice that would have quietly broken it
 *
 * ⛔ **NOT WORKERS KV.** KV is the obvious-looking store and its free tier allows **1,000 writes per
 * DAY**. A leaderboard's write path would exhaust that in an afternoon of one person playing, and
 * the failure mode is writes silently starting to fail — a player's record vanishing with the board
 * still rendering fine. D1 is SQLite, its free tier is measured in **100k row writes/day**, and the
 * query this table needs is an indexed `ORDER BY ms LIMIT 25`, which is what a relational store is
 * for. Durable Objects would also work and cost more thought for no gain at this size.
 *
 * ⚠ **Free-tier figures re-read off Cloudflare's own pricing pages on 2026-09-18**, not carried
 * from a handout: Workers 100k requests/DAY, D1 5M rows read/day + 100k rows written/day + 5 GB.
 * Cloudflare has changed these before — re-check rather than trusting this line. See `README.md`.
 *
 * ## ⛔ CHEATING IS BOUNDED HERE, NOT SOLVED, AND SAYING SO IS PART OF THE DESIGN
 *
 * This is a public write endpoint with no accounts. Anyone who opens devtools can POST whatever time
 * they like. The three mitigations below raise the bar; **not one of them is airtight**, because
 * nothing enforced on this side of the wire can be while the client owns the puzzle and the clock.
 * Airtight would mean the SERVER mints the puzzle, holds the solution and times the solve — a
 * different feature, an order of magnitude more work, for a board played among friends.
 *
 * The cheap remedy if it is ever actually abused is a per-board wipe:
 *   DELETE FROM scores WHERE board = 'nonet';
 */

/** Rows returned and kept per board. Must equal `TOP_N` in `src/render/arcadeScores.ts`. */
const TOP_N = 25;

/**
 * ⛔ PINNED TO THE ONE ORIGIN, NEVER `*`.
 *
 * `*` on a public write endpoint means any page on the internet can POST to this board from a
 * visitor's browser — including a page that does it in a loop to fill the table with garbage.
 * Local dev origins are handled separately by `isAllowedOrigin` below.
 */
const ALLOWED_ORIGINS = new Set(['https://spark-online.space']);

/**
 * Local dev, on ANY port.
 *
 * ⚠ THE FIRST CUT HARDCODED `http://localhost:5173` AND THAT PORT IS NOT RELIABLE HERE. This project
 * assigns a RANDOM session port to every dev server so parallel sessions cannot collide, so the one
 * port in the allowlist is the one a developer is least likely to be on. Writes would 403 during
 * local testing while working perfectly in production — the most confusing possible split.
 *
 * ⛔ AND WIDENING IT COSTS NOTHING SECURITY-WISE, which is the part worth stating rather than
 * assuming. `Origin` is set by the BROWSER and cannot be forged by a remote page: a site at
 * evil.example cannot make a visitor's browser send `Origin: http://localhost:1234`. The only party
 * who can present a localhost origin is someone already running code on the machine, who could POST
 * directly with curl regardless of what this list says.
 */
function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(origin);
}

/**
 * Plausibility bounds on a submitted time.
 *
 * ⚠ THESE ARE MINE, NOT THE OWNER'S, AND HERE IS THE MEASUREMENT BEHIND THEM. The floor is 15 s:
 * a 6×6 NONET ships ~16 givens (`SUDOKU_DEFAULT_GIVENS`), leaving ~20 cells, and 20 deliberate
 * clicks plus digits cannot be done in under 15 s by a human who is also reading the grid. The
 * ceiling is 1 hour, which is not a skill statement at all — it only rejects a garbage `ms` that
 * would sit harmlessly at the bottom of the table forever.
 *
 * ⛔ THE FLOOR IS A SPEED BUMP AND NOTHING MORE. A cheater posts 15001 and is top of the board. It
 * is here because it costs one comparison and stops the *accidental* zero — a client bug that sends
 * `0` would otherwise pin an unbeatable row at rank 1 permanently, which is the failure that would
 * actually happen.
 */
const MIN_MS = 15_000;
const MAX_MS = 60 * 60 * 1000;

/** Writes allowed per IP per window. A human finishing a NONET cannot approach this. */
const RATE_LIMIT_WRITES = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Board ids are `nonet` today and `nonet:s07` once the ladder lands — nothing else is addressable. */
const BOARD_RE = /^[a-z0-9]+(?::[a-z0-9]+)?$/;

/** The alphabet `normaliseName` clamps to, kept byte-identical to `arcadeScores.ts`. */
const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
const NAME_LEN = 3;

/**
 * Server-side `normaliseName`.
 *
 * ⛔ THE SERVER RE-CLAMPS RATHER THAN TRUSTING THE CLIENT'S CLAMP, and that is not paranoia for its
 * own sake: the client function is a UI affordance on a form nobody has to use, while this is the
 * only thing standing between a raw POST and a 10,000-character "name" rendered into a Pixi text
 * field on every other player's high-score screen. Same rules, both ends, stated twice on purpose.
 */
function normaliseName(raw) {
  const kept = [...String(raw ?? '').toUpperCase()]
    .filter((c) => NAME_ALPHABET.includes(c))
    .slice(0, NAME_LEN);
  while (kept.length < NAME_LEN) kept.push('A');
  const name = kept.join('');
  return name.trim().length === 0 ? 'A'.repeat(NAME_LEN) : name;
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
 * ⚠ SALTED, AND THE SALT IS A SECRET RATHER THAN A CONSTANT. A bare SHA-256 of an IPv4 address is
 * reversible by brute force in seconds — there are only 2^32 of them — so an unsalted column would
 * be storing IP addresses with extra steps. This never leaves the database and is never returned.
 */
async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readBoard(env, board) {
  const { results } = await env.DB.prepare(
    'SELECT name, ms, at FROM scores WHERE board = ?1 ORDER BY ms ASC, at ASC LIMIT ?2',
  )
    .bind(board, TOP_N)
    .all();
  return results ?? [];
}

export default {
  /**
   * ⛔ EVERY PATH IS WRAPPED, AND WITHOUT THIS A MISCONFIGURED BACKEND IS INVISIBLE.
   *
   * Nothing below caught anything in the first cut. A missing `DB` binding, an unapplied schema, a
   * transient D1 error or an exhausted daily quota all throw straight out of the handler, and
   * Cloudflare then answers with its OWN error page — which carries **no CORS headers at all**. The
   * browser rejects that before the client can read the status, the client's catch treats it like
   * being offline, and the board silently falls back to local. A completely dead backend and a
   * healthy one look identical on the owner's screen.
   *
   * So: catch, log (visible in `wrangler tail`), and answer with a CORS-bearing 500 that the client
   * can actually distinguish.
   */
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    try {
      return await handle(request, env, origin);
    } catch (err) {
      console.error('leaderboard worker error:', err && err.stack ? err.stack : String(err));
      // Never echo `err` to the client — it can carry schema and binding details.
      return json({ error: 'server error' }, 500, origin);
    }
  },
};

async function handle(request, env, origin) {
  {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const match = /^\/board\/([^/]+)$/.exec(url.pathname);
    if (match === null) return json({ error: 'not found' }, 404, origin);

    // ⚠ `decodeURIComponent` THROWS on a malformed escape — `/board/%` is a URIError, which before
    // the wrapper above became an uncaught 1101 with no CORS headers. Decoded defensively so a
    // stray percent sign is an ordinary 400 rather than a server error.
    let board;
    try {
      board = decodeURIComponent(match[1]).toLowerCase();
    } catch {
      return json({ error: 'bad board' }, 400, origin);
    }
    if (!BOARD_RE.test(board)) return json({ error: 'bad board' }, 400, origin);

    if (request.method === 'GET') {
      return json({ scores: await readBoard(env, board) }, 200, origin);
    }

    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);

    /*
     * ⛔ FAIL CLOSED ON A MISSING SALT. This was `env.IP_SALT ?? 'spark'` — so skipping
     * `wrangler secret put IP_SALT`, one optional-looking line in a five-line runbook, silently
     * salted every hash with a constant published in this public repo. There are only 2^32 IPv4
     * addresses; a known-salt SHA-256 of one is brute-forced in seconds, so the column would have
     * been a reversible encoding of players' IP addresses while the code claimed otherwise.
     *
     * A privacy property that degrades quietly when a setup step is skipped is not a privacy
     * property. Refusing writes is loud, recoverable in one command, and cannot leak anything.
     */
    if (typeof env.IP_SALT !== 'string' || env.IP_SALT.length < 16) {
      return json({ error: 'server misconfigured: IP_SALT unset' }, 503, origin);
    }

    // ⛔ REJECT A CROSS-ORIGIN WRITE OUTRIGHT, rather than relying on CORS to discourage it. CORS is
    // enforced by the BROWSER on the response; it does not stop the request reaching this worker or
    // the row being written. A script posting from another page would have its reply blocked and its
    // garbage row stored anyway — the check has to happen here to mean anything.
    if (!isAllowedOrigin(origin)) return json({ error: 'forbidden' }, 403, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad json' }, 400, origin);
    }

    const ms = Number(body?.ms);
    if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) {
      return json({ error: 'implausible time' }, 422, origin);
    }
    const name = normaliseName(body?.name);
    const at = Number.isFinite(Number(body?.at)) ? Math.trunc(Number(body.at)) : Date.now();
    const now = Date.now();

    // ⛔ ONLY A REGISTERED BOARD MAY BE WRITTEN TO. `BOARD_RE` bounds the SHAPE of an id, not how
    // many distinct ids exist — and the prune only trims WITHIN a board, so unlimited invented
    // boards means unlimited storage while every individual board still looks correctly capped.
    const known = await env.DB.prepare('SELECT 1 AS ok FROM boards WHERE board = ?1').bind(board).first();
    if (known === null || known === undefined) return json({ error: 'unknown board' }, 404, origin);

    const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
    const ipHash = await hashIp(ip, env.IP_SALT);

    /*
     * ⛔ THE LIMITER COUNTS `writes`, NOT `scores`, AND THE FIRST CUT GOT THIS EXACTLY BACKWARDS.
     *
     * Counting `scores` meant counting rows the prune below deletes moments later. Every submission
     * that missed the top 25 — i.e. every submission an attacker makes once a board is full — left
     * no trace, so the counter never rose above zero and the limit never fired. The check erased its
     * own evidence.
     *
     * ⚠ THE MARKER IS INSERTED BEFORE THE COUNT, WHICH IS THE SAFE ORDER. D1 does not give these two
     * statements a transaction, so concurrent requests can interleave; inserting first makes a race
     * OVER-count (two racers each see the other's marker and one is refused a write it could have
     * had) rather than UNDER-count (both see zero and both get through). A rate limit that fails
     * open under exactly the load it exists to stop is not a rate limit.
     */
    await env.DB.prepare('INSERT INTO writes (ip_hash, created) VALUES (?1, ?2)').bind(ipHash, now).run();
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM writes WHERE ip_hash = ?1 AND created > ?2',
    )
      .bind(ipHash, now - RATE_LIMIT_WINDOW_MS)
      .first();
    if (Number(recent?.n ?? 0) > RATE_LIMIT_WRITES) {
      // ⚠ 429 AND THE BOARD ANYWAY. A rate-limited player must still SEE the table — they have just
      // finished a run, the local client already recorded it, and answering with a bare error would
      // blank the screen they came to look at.
      return json({ error: 'slow down', scores: await readBoard(env, board) }, 429, origin);
    }

    await env.DB.prepare(
      'INSERT INTO scores (board, name, ms, at, created, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    )
      .bind(board, name, ms, at, now, ipHash)
      .run();

    /*
     * ⭐ PRUNE PAST `TOP_N`, so the table cannot grow without bound.
     *
     * ⚠ AND THE SUBQUERY IS ORDERED THE SAME WAY THE READ IS. Deleting "everything not in the top 25"
     * under a DIFFERENT order than the one that renders the board would evict rows that are still on
     * screen. One ordering rule — `ms ASC, at ASC` — appears in the index, the read and this delete,
     * and it is the same rule as `compare()` in `arcadeScores.ts`.
     */
    await env.DB.prepare(
      `DELETE FROM scores WHERE board = ?1 AND id NOT IN (
         SELECT id FROM scores WHERE board = ?1 ORDER BY ms ASC, at ASC LIMIT ?2
       )`,
    )
      .bind(board, TOP_N)
      .run();

    // Age out spent rate-limit markers. Bounded, cheap, and the only thing a limiter may forget.
    await env.DB.prepare('DELETE FROM writes WHERE created <= ?1').bind(now - RATE_LIMIT_WINDOW_MS).run();

    return json({ scores: await readBoard(env, board) }, 200, origin);
  }
}
