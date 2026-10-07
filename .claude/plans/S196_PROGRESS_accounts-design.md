# S196 PROGRESS — s196/accounts-design (DESIGN + RESEARCH tree, builds nothing)

## NEXT STEP (top, always current) — PAUSED for usage limit
1. RESUMED: surveys re-dispatched as 2 separate agents (Legacy, CNC); Pitch Masters note READ (Godot desktop+web). Payments sources accumulating in .tmp-gates/payments_sources.md (Steam done; next Apple/Google/DMA, Supremacy 1914, Stripe/Paddle MoR).
2. Read (READ-ONLY, `git show`, never checkout/edit) the Pitch Masters plan: repo `Extension Projects/Pitch Masters`, branch `notes/s196-one-login-network`, file `docs/ONE_LOGIN_GAME_NETWORK.md`.
3. Payments web research (Valve rev share + in-game purchase/steering rules, Apple/Google + EU DMA/US external links, Supremacy 1914 routing, own-site desktop download, Stripe/Paddle/MoR EU VAT) — cite + date each source.
4. Write `.claude/plans/S196_ACCOUNTS_DESIGN.md` (one-screen owner summary on top) + HTML copy to `C:\Users\onesh\OneDrive\Desktop\SPARK_Accounts_Design.html`. Commit every 5 min.

## Findings so far (verified in tree)
- Leaderboard worker (LIVE S182, https://spark-leaderboard.saras-fdtta.workers.dev, D1 `spark-leaderboard` WEUR): `server/leaderboard/worker.js` 501 lines. Origin allowlist `ALLOWED_ORIGINS = {https://spark-online.space}` + localhost (worker.js:39,53); writes rejected server-side on bad Origin (:300); per-IP rate limit 40 runs/10 min via append-only `writes` table with salted ip_hash (secret IP_SALT, refuses writes if unset, :294); idempotency `seen_runs` TTL 24h (:95); board registry table `boards`; identity = 3-char typed name (NAME_ALPHABET 37 chars, :104) → `players(board,name,runs,total_ms,updated)`, rank = average (R182-G).
- Cost facts in README (dated 2026-09-18): Free plan 100k Worker req/day, D1 5M reads/day, 100k writes/day, 5GB. KV free = 1k writes/day → don't use KV for writes.
- Canon §9: identity = typed name, collisions merge (accepted); R182-H adaptive difficulty BLOCKED on persistent identity, and collides with average ranking (must normalise by difficulty tier).
- Device-local keys in SPARK master: `spark.arcade.nonet.scores.v1`, `.ranking.v1`, `.pending.v1` (arcadeScores.ts), settings `audio.*`, `display.*`, `spark_audio_muted`. On branch s196/nonet-home: `spark.nonet.progress.v1` = {unlocked 1..30, stars[30] each 0..3} (src/nonet/campaignProgress.ts:13) — merges are MONOTONE (max stars, max unlocked: recordClear) → device→account migration is a lossless max-merge; `spark.nonet.daily.v1` = last solved UTC day key (dailyProgress.ts:10).
- campaignProgress.ts docblock: "No account system is invented before Steam" (R196-D2 6e) — accounts design must respect that NONET ships device-local first.

## Log
- created progress file, merged master (57242870).
- benign: a for-loop `git rev-parse` over non-repo dirs exited 128 (last dir not a git repo) — benign, it found Pitch Masters repo as intended.
