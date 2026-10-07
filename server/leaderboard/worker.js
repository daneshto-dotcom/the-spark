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

/**
 * How long an idempotency key is remembered.
 *
 * ⛔⛔ S183 — **IT IS NOT TRUE THAT "A RETRY FOLLOWS ITS ORIGINAL WITHIN SECONDS", AND THAT SENTENCE
 * STOOD HERE WHILE THE CLIENT COULD RETRY A WEEK LATER.** A retry follows its original within
 * seconds only when the player keeps playing. The client's offline queue was bounded by COUNT, not
 * time, so a run that committed here but timed out on the wire could sit on a closed laptop for
 * days and then be flushed — after any other player's POST had pruned this key. The dedupe SELECT
 * then misses and the same game is folded twice, permanently, because the board stores
 * sum-and-count.
 *
 * ⭐ THE CLIENT IS NOW THE SIDE THAT GIVES WAY: `PENDING_MAX_AGE_MS` (`src/render/arcadeScores.ts`)
 * stops retrying at 12 h, safely inside this window even with a skewed device clock.
 * `src/render/pendingRunExpiry.test.ts` pins the inequality, which is why this constant is
 * EXPORTED — a test that re-typed `24 * 60 * 60 * 1000` would pin nothing.
 *
 * ⚠ RAISING THIS IS ALWAYS SAFE; LOWERING IT BELOW `PENDING_MAX_AGE_MS` RE-OPENS THE DOUBLE-COUNT.
 */
export const SEEN_RUN_TTL_MS = 24 * 60 * 60 * 1000;

/** Most runs accepted in one request — bounds an offline backlog flush. */
const MAX_RUNS_PER_REQUEST = 21;

/** Board ids: `nonet` today, `nonet:s07` if a ladder ever lands. */
const BOARD_RE = /^[a-z0-9]+(?::[a-z0-9]+)?$/;

/**
 * ⭐ S196 #16 — THE DAILY NONET'S BOARDS REGISTER THEMSELVES, BUT ONLY AROUND TODAY.
 *
 * `nonet:dYYYYMMDD` is one board per UTC day (`src/nonet/dailySeed.ts`). Inserting a row into `boards`
 * by hand every day is not a plan, so a POST to a daily board that is not registered yet registers it —
 * IF its date is a real calendar date within ONE day of the server's own UTC date (the slack covers a
 * player who launched at 23:59 and a device clock a little off). The registry's purpose — bounding how
 * many boards exist — still holds: at most three new boards a day, and a forged far-past or far-future
 * date is the same 404 as an invented board. ADDITIVE: every other board id behaves exactly as before.
 */
export const DAILY_BOARD_RE = /^nonet:d(\d{4})(\d{2})(\d{2})$/;
const DAY_MS = 86_400_000;

/**
 * ⭐ S196 #16 Option B — THE 30 CAMPAIGN STAGE BOARDS (`nonet:s01` … `nonet:s30`) register themselves
 * too. A closed set of exactly thirty ids, so the registry's bound is untouched; `nonet:s31`, `nonet:s7`
 * and `nonet:s00` stay 404. Pinned against `src/nonet/campaign.ts` `stageBoardId` by a test.
 */
export const STAGE_BOARD_RE = /^nonet:s(0[1-9]|[12][0-9]|30)$/;

/** PURE — may this board register itself at `nowMs`? (today's daily ± 1 day, or a campaign stage.) */
export function selfRegisteringBoard(board, nowMs) {
  return STAGE_BOARD_RE.test(String(board)) || dailyBoardAcceptable(board, nowMs);
}

/** PURE — may this daily board be auto-registered at `nowMs`? Exported so it is executably tested. */
export function dailyBoardAcceptable(board, nowMs) {
  const m = DAILY_BOARD_RE.exec(String(board));
  if (m === null) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = Date.UTC(y, mo, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) return false;
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(t - today) <= DAY_MS;
}

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
 * PURE — validate and clamp a submitted batch, **per item**.
 *
 * Returns `{ runs, rejected }`, or `{ error }` only when the REQUEST ITSELF is malformed (not an
 * array, empty, oversized). Exported so it is executably tested.
 *
 * ## ⛔⛔ ONE BAD RUN USED TO PERMANENTLY KILL A PLAYER'S SHARED BOARD
 *
 * This function used to `return { error: 'implausible time' }` on the FIRST offending item, failing
 * the whole batch. That is the worst failure this design has available, and it is worth spelling out
 * because the shape is not obvious:
 *
 *   1. a single implausible run enters the offline queue (a tab left open overnight, a clock jump,
 *      a paused laptop — `ms` over the one-hour ceiling);
 *   2. every later run is queued BEHIND it;
 *   3. every flush sends the queue head-first, so every flush contains the poison item;
 *   4. the server 422s the entire batch, the client clears nothing and re-queues;
 *   5. the player's shared average never moves again, and nothing on screen says why.
 *
 * On a board whose whole argument is that **a wrong number is permanent** — see `schema.sql` on why
 * sum-and-count is stored rather than a rolling mean — a queue that can never drain is the one
 * failure that cannot be repaired by playing more.
 *
 * ⭐ SO A BAD ITEM IS DROPPED, NOT THE BATCH. The offending run is discarded permanently (it was
 * never legitimate), the rest are folded, the request succeeds, and the client clears the whole sent
 * batch — which is what breaks the retry loop. `rejected` is reported so the count is visible rather
 * than silent.
 */
export function parseRuns(body) {
  if (typeof body !== 'object' || body === null) return { error: 'bad json' };
  const raw = body.runs;
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'no runs' };
  if (raw.length > MAX_RUNS_PER_REQUEST) return { error: 'too many runs' };
  const runs = [];
  let rejected = 0;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      rejected++;
      continue;
    }
    const ms = Number(item.ms);
    if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) {
      rejected++;
      continue;
    }
    runs.push({
      name: normaliseName(item.name),
      ms: Math.round(ms),
      // ⭐ N3 — the idempotency key. See `foldable` in the handler.
      id: typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 64 ? item.id : null,
    });
  }
  return { runs, rejected };
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
  // ⚠ ONLY A MALFORMED REQUEST IS AN ERROR NOW. An implausible ITEM is dropped and reported in
  // `rejected` — see `parseRuns` for why failing the batch was the worst failure available.
  if (parsed.error !== undefined) return json({ error: parsed.error }, 400, origin);
  const runs = parsed.runs;
  const rejected = parsed.rejected;
  // ⚠ `runs` CAN NOW BE EMPTY — every item may have been rejected — so the fallback must not index
  // into it. Dereferencing `runs[runs.length - 1]` on an empty array threw, and the wrapper turned
  // that into a 500: an all-implausible batch would have failed exactly the way N2 exists to stop.
  const focus = normaliseName(
    typeof body.focus === 'string' ? body.focus : (runs[runs.length - 1]?.name ?? ''),
  );

  // ⛔ ONLY A REGISTERED BOARD MAY BE WRITTEN TO. `BOARD_RE` bounds the SHAPE of an id, not how many
  // exist, so unlimited invented boards would be unlimited storage.
  const known = await env.DB.prepare('SELECT 1 AS ok FROM boards WHERE board = ?1').bind(board).first();
  if (known === null || known === undefined) {
    // ⭐ S196 — the one exception: today's daily board (± one day) registers itself. See DAILY_BOARD_RE.
    if (!selfRegisteringBoard(board, Date.now())) return json({ error: 'unknown board' }, 404, origin);
    await env.DB.prepare('INSERT OR IGNORE INTO boards (board) VALUES (?1)').bind(board).run();
  }

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
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM writes WHERE ip_hash = ?1 AND created > ?2',
  )
    .bind(ipHash, now - RATE_LIMIT_WINDOW_MS)
    .first();
  if (Number(recent?.n ?? 0) + runs.length > RATE_LIMIT_RUNS) {
    // ⚠ 429 AND THE BOARD ANYWAY. A rate-limited player has just finished a run and the client
    // already recorded it locally; answering with a bare error would blank the screen they came to
    // look at.
    return json({ error: 'slow down', rows: await readBoard(env, board) }, 429, origin);
  }

  /*
   * ⛔ MARK ONLY WHAT IS ACCEPTED, AND ONLY AFTER THE COUNT. THE LIMITER USED TO EXTEND ITSELF.
   *
   * The first cut inserted a marker per run BEFORE counting — including for the very request it then
   * refused. So every refusal added to the tally that causes refusals: a player who tripped the limit
   * once kept tripping it, each 429 pushing the window further out, and a legitimate player could be
   * locked out of their own board for as long as they kept trying. A rate limit that is extended by
   * being enforced is a lockout, not a limit.
   *
   * ⚠ AND THE ORDER TRADES ONE RACE FOR ANOTHER, DELIBERATELY. Counting first means two concurrent
   * requests can both read a tally below the cap and both pass — an UNDER-count. Marking first (the
   * old order) made a race OVER-count instead, which is safer against a flood but is exactly what
   * produced the self-extending lockout above. Between "a determined attacker gets a few extra writes
   * in a dead heat" and "an honest player is locked out of their own ranking", the first is plainly
   * the better failure. Stated rather than left as an accident of statement order.
   */
  if (runs.length > 0) {
    await env.DB.batch(
      runs.map(() =>
        env.DB.prepare('INSERT INTO writes (ip_hash, created) VALUES (?1, ?2)').bind(ipHash, now),
      ),
    );
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
  /*
   * ⛔⛔ N3 — AT-LEAST-ONCE DELIVERY NEEDS AN IDEMPOTENCY KEY, AND ON AN AVERAGE BOARD IT IS PERMANENT.
   *
   * The client bounds its request with a 4 000 ms `AbortSignal`, and this handler makes several
   * sequential D1 round trips. A timeout therefore aborts requests the server has ALREADY COMMITTED —
   * the client sees a failure, queues the run, and the next flush folds it a second time. Under the
   * old best-time board a duplicate was a duplicate row, visible and deletable. Under a mean it
   * silently and permanently biases the player's average, and no amount of further play repairs it.
   *
   * So every run carries a client-generated id and is folded AT MOST ONCE, ever. Ids already present
   * are skipped; the ones that are new are recorded in the same request that folds them.
   *
   * ⚠ A RUN WITH NO ID IS STILL FOLDED. Older clients, and anything hand-rolled with curl, do not
   * send one — refusing them would break the endpoint for callers that are not broken. They simply do
   * not get the protection, which is exactly where they were before.
   *
   * ⛔⛔ S196 MED-A — AND THE CLAIM IS NOW ATOMIC, BECAUSE CONCURRENT REQUESTS ARE NOW REAL.
   *
   * This used to be read-then-write (`SELECT … FROM seen_runs`, then fold + mark in a batch) and said
   * so: two concurrent requests with the same id could both read "not seen" and both fold, which was
   * accepted because "a retry is sequential by construction". S196 broke that assumption — the NONET
   * home flushes every board's queue when it opens, so a queued run can ride a flush AND an in-flight
   * submit at the same time. (The client now refuses to do that too — `RemoteLeaderboard`'s per-board
   * in-flight set — but the server is the root: a second client, a second tab, must not double-count.)
   *
   * ⛔⛔ S196 MED-B — SO THE CHECK, THE FOLD AND THE MARK ARE ONE `batch()`: ONE TRANSACTION, ONE ROUND TRIP.
   *
   * Per run with an id, two statements, in this order:
   *   1. the upsert, guarded `WHERE NOT EXISTS (SELECT 1 FROM seen_runs WHERE id = ?5)` — it folds
   *      only a run whose id has never been recorded (`meta.changes` 1 = folded, 0 = a duplicate);
   *   2. `INSERT OR IGNORE INTO seen_runs` — records the id.
   * A D1 batch is a single transaction that rolls back on any failure, and D1 executes statements
   * serially per database, so (a) two concurrent requests carrying one id cannot both fold it — the
   * second request's guard sees the first one's mark (MED-A stays closed), and (b) a request that dies
   * mid-way commits NEITHER the fold NOR the mark, so the client's retry folds the run exactly once.
   * Round 2 claimed ids one statement at a time BEFORE folding and accepted "drop rather than
   * double-count"; that trade is gone — a failure now loses nothing and counts nothing twice.
   * Two copies of one id inside ONE request are handled by the same guard (the second sees the first's
   * mark). Id-less runs keep the plain upsert. The 24 h TTL is unchanged: an id still in `seen_runs`
   * reads as seen exactly as before. Verified on real SQLite 3.50.4 (S196 round 3, `schema.sql`).
   */
  const stmts = [];
  /** Index into `stmts` of each id-carrying run's guarded upsert. */
  const guarded = [];
  for (const r of runs) {
    if (r.id === null) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO players (board, name, runs, total_ms, updated) VALUES (?1, ?2, 1, ?3, ?4)
           ON CONFLICT(board, name) DO UPDATE SET
             runs = runs + 1, total_ms = total_ms + ?3, updated = ?4`,
        ).bind(board, r.name, r.ms, now),
      );
      continue;
    }
    guarded.push(stmts.length);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO players (board, name, runs, total_ms, updated)
         SELECT ?1, ?2, 1, ?3, ?4 WHERE NOT EXISTS (SELECT 1 FROM seen_runs WHERE id = ?5)
         ON CONFLICT(board, name) DO UPDATE SET
           runs = runs + 1, total_ms = total_ms + ?3, updated = ?4`,
      ).bind(board, r.name, r.ms, now, r.id),
      env.DB.prepare('INSERT OR IGNORE INTO seen_runs (id, created) VALUES (?1, ?2)').bind(r.id, now),
    );
  }
  const results = stmts.length > 0 ? await env.DB.batch(stmts) : [];
  const duplicates = guarded.filter((i) => Number(results?.[i]?.meta?.changes ?? 0) === 0).length;

  // Age out spent rate-limit markers. Bounded, cheap, and the only thing a limiter may forget.
  await env.DB.prepare('DELETE FROM writes WHERE created <= ?1').bind(now - RATE_LIMIT_WINDOW_MS).run();
  // And spent idempotency keys, so this is not the one table here that grows without bound.
  //
  // ⛔ S183 — THIS PRUNE IS UNSCOPED: any player's POST ages out EVERY player's keys, so the window
  // a given run's key survives is wall-clock and not "until that player next plays". That is what
  // makes the client's `PENDING_MAX_AGE_MS` the load-bearing half of the pair — see
  // `SEEN_RUN_TTL_MS` above for the double-count this used to allow.
  await env.DB.prepare('DELETE FROM seen_runs WHERE created <= ?1').bind(now - SEEN_RUN_TTL_MS).run();

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
      // Reported rather than silent: a run count that did not move by as much as the player expects
      // has a reason, and this is it.
      rejected,
      duplicates,
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
