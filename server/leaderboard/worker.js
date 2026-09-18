/**
 * SPARK — the shared arcade leaderboard. A Cloudflare Worker over D1.
 *
 * ⛔⛔ **NOT DEPLOYED, AND NOT DEPLOYABLE WITHOUT THE OWNER'S EXPLICIT GO.**
 *
 * SPARK has never had a backend. Every `fetch()` in `src/` is a same-origin static asset; the only
 * socket is a WebRTC signalling probe; the site is a static artifact on GitHub Pages. Standing this
 * up creates a Cloudflare ACCOUNT, a billing relationship, an uptime surface and a public write
 * endpoint — four things the project has never had and that only he can agree to. This file exists
 * so that "yes" costs ten minutes instead of a session. It is not wired to anything: the client
 * selects it only when `VITE_LEADERBOARD_URL` is set at build time, and it is set nowhere.
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
 * ⚠ **Free-tier figures are as of the pricing page read in May 2026 and MUST be re-checked before
 * signing up.** Cloudflare has changed them before. See `README.md` in this directory.
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
 * visitor's browser — including a page that does it in a loop to fill the table with garbage. The
 * localhost entry is for `npm run dev` and is deliberately the DEV port only.
 */
const ALLOWED_ORIGINS = new Set([
  'https://spark-online.space',
  'http://localhost:5173',
]);

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
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://spark-online.space';
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
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const match = /^\/board\/([^/]+)$/.exec(url.pathname);
    if (match === null) return json({ error: 'not found' }, 404, origin);

    const board = decodeURIComponent(match[1]).toLowerCase();
    if (!BOARD_RE.test(board)) return json({ error: 'bad board' }, 400, origin);

    if (request.method === 'GET') {
      return json({ scores: await readBoard(env, board) }, 200, origin);
    }

    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);

    // ⛔ REJECT A CROSS-ORIGIN WRITE OUTRIGHT, rather than relying on CORS to discourage it. CORS is
    // enforced by the BROWSER on the response; it does not stop the request reaching this worker or
    // the row being written. A script posting from another page would have its reply blocked and its
    // garbage row stored anyway — the check has to happen here to mean anything.
    if (!ALLOWED_ORIGINS.has(origin)) return json({ error: 'forbidden' }, 403, origin);

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

    const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
    const ipHash = await hashIp(ip, env.IP_SALT ?? 'spark');
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ?1 AND created > ?2',
    )
      .bind(ipHash, now - RATE_LIMIT_WINDOW_MS)
      .first();
    if (Number(recent?.n ?? 0) >= RATE_LIMIT_WRITES) {
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

    return json({ scores: await readBoard(env, board) }, 200, origin);
  },
};
