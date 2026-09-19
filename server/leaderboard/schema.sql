-- SPARK — the shared arcade ranking, D1 (SQLite) schema.
--
-- ⭐ LIVE since S182 on the owner's Cloudflare account (database `spark-leaderboard`, region WEUR).
-- Re-apply with:
--   npx wrangler d1 execute spark-leaderboard --remote -y --file=./schema.sql
--
-- ⭐⭐ ONE ROW PER PLAYER, RANKED BY AVERAGE — owner R182-G:
--   "The leaderboard will hold the AVERAGE time it takes a user to complete... So people are
--    competing over a long span."
--
-- This replaced a per-RUN table of best times. The rebuild is what makes RANDOM puzzles fair: no two
-- players ever solve the same grid, which is indefensible under a best-time board and simply washes
-- out under a mean. The fixed-seed stage ladder that would otherwise have been needed is withdrawn.

-- ⚠ THE OLD PER-RUN `scores` TABLE IS DELIBERATELY LEFT ALONE RATHER THAN DROPPED.
--
-- R182-G replaced it, so it is dead weight — but this file is a RUNBOOK that gets re-applied, and a
-- runbook that destroys data when re-run is a trap. It is empty and unreferenced, it costs nothing,
-- and removing it is a one-line decision the owner can make deliberately rather than one that fires
-- as a side effect of somebody re-reading the setup instructions. Every statement below is
-- `IF NOT EXISTS` or an upsert, so applying this schema twice is a no-op.

-- ⛔ SUM AND COUNT ARE STORED; THE AVERAGE IS ALWAYS DERIVED.
--
-- Folding into a stored mean (`avg = (avg*n + ms)/(n+1)`) rounds at every step and the error
-- compounds with every game played, so a long-standing player ends up ranked on accumulated rounding.
-- With `runs` + `total_ms` the mean is exact at every point, recomputable from scratch, and the
-- server and client can each derive it independently and still agree.
--
-- ⭐ AND THE TABLE IS BOUNDED BY CONSTRUCTION, so nothing here needs pruning. Identity is a
-- three-character arcade name over a 37-character alphabet, so a board can hold at most 37^3 = 50,653
-- rows ever — a couple of megabytes against a 5 GB free tier. That matters because pruning a PLAYER
-- is destructive in a way pruning a RUN never was: deleting a row erases somebody's whole history and
-- silently hands them a fresh average.
CREATE TABLE IF NOT EXISTS players (
  board    TEXT    NOT NULL,
  name     TEXT    NOT NULL,           -- exactly 3 chars; the worker re-clamps, never trusts a client
  runs     INTEGER NOT NULL,           -- how many runs have been folded in; >= 1
  total_ms INTEGER NOT NULL,           -- sum of every run's elapsed ms
  updated  INTEGER NOT NULL,           -- SERVER clock, last fold
  PRIMARY KEY (board, name)
);

-- The one query this table serves: "top N for a board, lowest AVERAGE first."
-- ⚠ The ordering expression must match `compareRows` in src/render/arcadeScores.ts:
--   average ASC, then runs DESC, then name ASC.
CREATE INDEX IF NOT EXISTS idx_players_rank
  ON players (board, (CAST(total_ms AS REAL) / runs) ASC, runs DESC, name ASC);

-- ⛔ THE RATE LIMIT GETS ITS OWN TABLE, AND THAT IS A CORRECTNESS FIX RATHER THAN TIDINESS.
--
-- The first cut counted rows in the score table, which the per-board prune deleted moments later — so
-- the count that was supposed to stop an attacker was erased by the same request that created it, the
-- limiter reset itself to zero on every call, and one IP had unlimited unauthenticated writes.
-- `writes` is append-only and ages out by TIME, which is the only thing a rate limit may forget.
CREATE TABLE IF NOT EXISTS writes (
  ip_hash TEXT    NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_writes_ratelimit ON writes (ip_hash, created);

-- ⛔ IDEMPOTENCY KEYS, because delivery is AT-LEAST-ONCE and a double-count here is PERMANENT.
--
-- The client bounds its request with a 4 s abort, and the handler makes several sequential D1 round
-- trips — so a timeout can abort a request the server has already committed. The client then queues
-- the run and the next flush folds it a SECOND time. Under the old best-time board that was a visible
-- duplicate row; under a mean it silently and permanently biases the player's average, and no amount
-- of further play repairs it. A run is folded at most once, ever.
--
-- Rows age out after a day (`SEEN_RUN_TTL_MS`), because keeping them forever would make this the one
-- table here that grows without bound.
--
-- ⛔ S183 — THIS COMMENT USED TO SAY "a retry follows its original within seconds, so a day is
-- generous by orders of magnitude". IT WAS NOT TRUE, and it was the premise that hid a real
-- double-count. The client's offline queue was bounded by COUNT, not time, so a run that committed
-- here but timed out on the wire could be flushed DAYS later — after some other player's POST had
-- pruned this row, since the prune is unscoped. The dedupe SELECT then misses and the game is folded
-- twice, permanently, because this schema stores sum-and-count rather than a mean.
--
-- The client now stops retrying at `PENDING_MAX_AGE_MS` (12 h, `src/render/arcadeScores.ts`), inside
-- this window with room for clock skew. Lowering the TTL below that constant re-opens the defect.
CREATE TABLE IF NOT EXISTS seen_runs (
  id      TEXT PRIMARY KEY,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seen_runs_created ON seen_runs (created);

-- ⛔ AND THE BOARD NAMESPACE IS BOUNDED BY A REGISTRY, not by the id regex. `BOARD_RE` bounds the
-- SHAPE of an id, not how many exist, so a caller could otherwise mint unlimited distinct boards.
CREATE TABLE IF NOT EXISTS boards (
  board TEXT PRIMARY KEY
);
INSERT OR IGNORE INTO boards (board) VALUES ('nonet');
