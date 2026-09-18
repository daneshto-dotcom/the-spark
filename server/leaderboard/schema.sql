-- SPARK — the shared arcade leaderboard, D1 (SQLite) schema.
--
-- ⛔ NOT DEPLOYED. No Cloudflare account exists for this project and none may be created without the
-- owner's explicit go. This file is the thing that gets applied the moment he says yes.
--
-- Apply with:
--   npx wrangler d1 execute spark-leaderboard --remote --file=./schema.sql

-- ⭐ `board` IS THE STAGE-SCOPING COLUMN, AND IT IS HERE ON DAY ONE ON PURPOSE.
--
-- Owner, S182, on the ladder: *"We have different levels of Sudoku… so we'll have also leaderboards
-- for the first…"* — thirty stages means thirty boards. Adding this column later would mean an
-- ALTER on live data plus a backfill plus a client that has to handle both shapes; adding it now
-- costs one TEXT column that holds 'nonet' until the ladder exists and 'nonet:s07' afterwards.
-- The client already addresses boards by this exact opaque id (`arcadeScores.ts` BOARD_NONET).
CREATE TABLE IF NOT EXISTS scores (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  board    TEXT    NOT NULL,
  name     TEXT    NOT NULL,           -- exactly 3 chars; the worker re-clamps, never trusts the client
  ms       INTEGER NOT NULL,           -- elapsed milliseconds — SMALLER IS BETTER (a time trial)
  at       INTEGER NOT NULL,           -- client wall-clock stamp; tie-break only, never trusted for ranking
  created  INTEGER NOT NULL,           -- SERVER clock. The only timestamp the server would defend.
  ip_hash  TEXT                        -- salted hash, for rate limiting only; never returned to a client
);

-- The ONE query this table serves: "top N for a board, fastest first, earliest wins a tie."
-- Matches `compare()` in arcadeScores.ts exactly — ms ASC, then at ASC.
CREATE INDEX IF NOT EXISTS idx_scores_board_rank ON scores (board, ms ASC, at ASC);

-- ⛔ THE RATE LIMIT GETS ITS OWN TABLE, AND THIS IS A CORRECTNESS FIX, NOT TIDINESS.
--
-- The first cut counted rows in `scores` itself. The prune below deletes every row that misses the
-- top 25 — which is every row an attacker submits once the board is full — so the count that was
-- supposed to stop them was erased by the same request that created it. The limiter reset itself to
-- zero on every call and permitted unlimited unauthenticated writes from one IP, forever. Four
-- independent reviewers found this separately, which is how much it stood out once anyone looked.
--
-- `writes` is append-only and is NEVER pruned by board size. Rows age out by time instead, which is
-- the only thing a rate limit may be allowed to forget.
CREATE TABLE IF NOT EXISTS writes (
  ip_hash TEXT    NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_writes_ratelimit ON writes (ip_hash, created);

-- ⛔ AND THE BOARD NAMESPACE IS BOUNDED BY A REGISTRY, not by the id regex.
--
-- `BOARD_RE` accepts any `[a-z0-9]+(:[a-z0-9]+)?`, so a caller could mint unlimited DISTINCT boards —
-- each holding its own 25 rows that the per-board prune can never reach, because the prune only ever
-- trims WITHIN a board. Storage grows without bound while every individual board looks correctly
-- capped. Only a board listed here can be written to; reads of an unknown board return an empty
-- table, which is what a not-yet-played stage should look like anyway.
--
-- The ten-stage ladder adds rows here. That is the intended way to open a board.
CREATE TABLE IF NOT EXISTS boards (
  board TEXT PRIMARY KEY
);
INSERT OR IGNORE INTO boards (board) VALUES ('nonet');
