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

-- Rate limiting reads (board, ip_hash, created) and nothing else.
CREATE INDEX IF NOT EXISTS idx_scores_ratelimit ON scores (ip_hash, created);
