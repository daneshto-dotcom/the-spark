# S196 PROGRESS — s196/accounts-design (DESIGN + RESEARCH tree, builds nothing)

## STATUS: DONE. Next step: none in this tree. The merge owner relays the owner questions; building starts only after the owner answers them and approves a PDR.

## FINAL REPORT
- **Deliverables:**
  - `.claude/plans/S196_ACCOUNTS_DESIGN.md`, with the one-screen owner summary at the top;
  - `C:\Users\onesh\OneDrive\Desktop\SPARK_Accounts_Design.html`;
  - raw notes in `.tmp-gates/survey_cnc.md`, `survey_legacy.md` and `payments_sources.md`.
- **Recommendation:** a small `account` Cloudflare Worker with its own D1 database (created with `--jurisdiction eu`) on the owner's existing account, at `id.<company-domain>`.
  - **Login:** email code/link, Google and Discord in Phase 1; Steam OpenID linking in Phase 2; silent Steam-ticket login in Phase 3. No passwords.
  - **Cross-domain:** top-level redirects with PKCE. A session cookie on the `id.` domain, plus per-game refresh tokens, rotated, kept in HttpOnly cookies through a Worker route on each game domain. Access tokens are Ed25519 JWTs that the leaderboard checks offline.
  - **Phase 1:** login, plus NONET progress sync (an automatic, lossless max-merge, since campaign progress only goes up), plus leaderboard rows per account (guest typed names kept).
- **Reuse headline:**
  - from CNC: the magic-link design (with its consumed-on-GET defect fixed), revocable server-side sessions and the `auth_events` log;
  - from Legacy of the Realm: saves with a revision number and 409 on stale writes, plus the "link, do not replace" rule with a blocking prompt on a second device;
  - from the SPARK leaderboard: the origin check, salted IP hash, time-aged rate limits and idempotency keys.
  - **Avoid:** CNC's in-memory rate limits, Redis lockout and open redirect; Legacy's unrevocable token and signing key shared with CNC; bcrypt; passwords in general (workerd caps PBKDF2 at 100k iterations, and checking one needs the paid plan's CPU).
  - Neither project has OAuth, so that is built new.
- **Payments headline:**
  - **Steam:** takes 30% (25% above $10M, 20% above $50M). Anything bought inside a Steam build must go through the Steam Wallet. Steam keys may be sold on our own site if Steam buyers get a comparable deal. Store pages may not link to other sites; use the website link field.
  - **Our own sites:** sell through a merchant of record (Paddle at 5% + $0.50, or Stripe Managed Payments), which handles all EU VAT. Otherwise OSS applies above the €10k EU threshold.
  - **Apple EU, from 2026-10-01:** 26% in-app, 20% alternative payment, 15% link-out (small business 15/10/10%), 5% Core Technology Commission. The Apple US link-out commission is still in court.
  - **Google, from 2026-06-30 in UK/EEA/AU/JP:** 10% on the first $1M; about 10% on link-outs.
  - **Supremacy 1914:** one account, and each store sells through its own checkout.
  - **Not verified:** whether Valve allows web-bought items to work in a Steam build. Ask Valve in writing.
- **Owner questions**, each with a recommendation:
  1. Company domain for `id.`: buy it now and put it on Cloudflare.
  2. Move spark-online.space DNS to Cloudflare: yes.
  3. Keep guest typed names on the board: yes, as guest rows that cannot be claimed.
  4. Passwords: no.
  5. Web purchases inside Steam: not until Valve answers in writing.
  6. Age line "15+ or with a parent's permission": yes.
  7. Workers Paid at $5/mo from Phase 1 go-live: yes.
  8. Merchant of record: Paddle, with Stripe MP as the alternative.
  9. "Continue as X?" click the first time per game: yes (MINE).
- **Gates:** none apply. Docs only: no game code, no npm install, no build. Tip SHA: see `git log -1`. Merge with master is clean (57242870); no conflicts. Bundle delta 0 KiB. Bump verdict: NONE (nothing touches the wire).
- **Merge seams:** none. New files are only under `.claude/plans/` and `.tmp-gates/`. The `.tmp-gates` files were force-added; the merge owner may drop them.
- **NOT DONE / unverified** (listed in the design doc §6): Valve's position on cross-store entitlements; the Apple US rate; Paddle and virtual currency; itch VAT; the impact of the spark-online.space DNS move on Pages TLS and verify-deploy.
- **Benign failures, recorded:**
  - a `git rev-parse` loop exited 128 on a non-repo directory;
  - the `markdown`/`marked` libraries are absent, so I wrote a tiny converter in scratch instead of installing anything;
  - the itch.io docs returned 403, recorded as unverified;
  - the browser pane never finished loading a file:// page, so I checked the HTML structure by tag counts instead;
  - one Python heredoc failed with a `\U` escape error in a path string; nothing was written, and I redid the edit with the Edit tool.

## Findings so far (verified in tree)
- Leaderboard worker (LIVE S182, https://spark-leaderboard.saras-fdtta.workers.dev, D1 `spark-leaderboard` WEUR): `server/leaderboard/worker.js` 501 lines. Origin allowlist `ALLOWED_ORIGINS = {https://spark-online.space}` + localhost (worker.js:39,53); writes rejected server-side on bad Origin (:300); per-IP rate limit 40 runs/10 min via append-only `writes` table with salted ip_hash (secret IP_SALT, refuses writes if unset, :294); idempotency `seen_runs` TTL 24h (:95); board registry table `boards`; identity = 3-char typed name (NAME_ALPHABET 37 chars, :104) → `players(board,name,runs,total_ms,updated)`, rank = average (R182-G).
- Cost facts in README (dated 2026-09-18): Free plan 100k Worker req/day, D1 5M reads/day, 100k writes/day, 5GB. KV free = 1k writes/day → don't use KV for writes.
- Canon §9: identity = typed name, collisions merge (accepted); R182-H adaptive difficulty BLOCKED on persistent identity, and collides with average ranking (must normalise by difficulty tier).
- Device-local keys in SPARK master: `spark.arcade.nonet.scores.v1`, `.ranking.v1`, `.pending.v1` (arcadeScores.ts), settings `audio.*`, `display.*`, `spark_audio_muted`. On branch s196/nonet-home: `spark.nonet.progress.v1` = {unlocked 1..30, stars[30] each 0..3} (src/nonet/campaignProgress.ts:13) — merges are MONOTONE (max stars, max unlocked: recordClear) → device→account migration is a lossless max-merge; `spark.nonet.daily.v1` = last solved UTC day key (dailyProgress.ts:10).
- campaignProgress.ts docblock: "No account system is invented before Steam" (R196-D2 6e) — accounts design must respect that NONET ships device-local first.

## Log
- created progress file, merged master (57242870).
- benign: a for-loop `git rev-parse` over non-repo dirs exited 128 (last dir not a git repo) — benign, it found Pitch Masters repo as intended.
