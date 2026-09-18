# SPARK — the shared arcade leaderboard

⛔ **NOTHING HERE IS DEPLOYED, AND NOTHING HERE MAY BE DEPLOYED WITHOUT DANIEL'S EXPLICIT GO.**

This directory is a complete, unwired backend. The client already talks to the interface it
implements; the switch is one build-time environment variable. It was written in S182 so that "yes"
costs ten minutes instead of a session — not because the decision was made.

---

## Why you are reading this

> *"I don't see anyone else's records on the arcade, on NONET, on the Sudoku. My friend played it and
> he put his name on and he got first place. Now I did my shit and I got first place. Who the fuck is
> first place? I can't even see his name. It should be just like an old arcade thing. You put your
> name, you see any other names that hit records, and the last ten places, twenty five names. It
> should be saved in a database."*

He is describing a bug, and it is worse than "not shared". The arcade board lives in
`localStorage` under one key per browser profile, and a fresh profile seeds nothing — so the first
run committed on any machine is always `1ST — NEW RECORD`. **He and his friend each hold a private
table of one row. Neither can ever appear on the other's, and neither can ever be beaten.**

⚠ **His friend's first-place time is unrecoverable.** It is in a localStorage key on his friend's
browser, and nothing in this change can reach it. Unless the friend replays after this ships, it is
gone.

---

## What this would cost — figures read off Cloudflare's own pricing pages on **2026-09-18**

| | Free plan | Paid ($5/mo minimum) |
|---|---|---|
| Worker requests | **100,000 / day** | 10 million / month, then $0.30/M |
| Worker CPU | 10 ms per invocation | 30M CPU-ms/month included |
| D1 rows read | **5 million / day** | 25 billion / month included |
| D1 rows written | **100,000 / day** | 50 million / month included |
| D1 storage | **5 GB total** | 5 GB included, then $0.75/GB-mo |

Sources: `developers.cloudflare.com/workers/platform/pricing/` and `/d1/platform/pricing/`.

**The honest read: this is free, and would stay free at a scale SPARK will not reach.** A NONET run
costs one GET and one POST. The POST inserts one row and, because both of this table's indexes cover
written columns, D1 counts that as roughly 3 rows written, plus the prune. Call it ~10 rows written
per run to be safe: the free daily allowance of 100,000 is **~10,000 completed runs per day**.

⚠ **One correction to how this was originally costed.** The free Worker allowance is **100,000
requests per DAY, not a monthly pool** — limits reset daily at 00:00 UTC. So "600k requests/month
against 3M free" is the wrong shape of argument even though its conclusion holds: 600k/month is
~20k/day, comfortably under. What the daily cap really means is that a **single spike day** is the
only thing that could bite, and the consequence is that D1 returns errors for the rest of that UTC
day — at which point the client falls back to the local board and nobody loses a run.

⛔ **NOT Workers KV, and this is the one choice that would have quietly broken it.** KV looks like
the obvious store. Its free tier allows **1,000 keys written per day** (verified same date), which a
leaderboard write path exhausts in an afternoon, and the failure mode is writes silently starting to
fail while the board still renders. D1 is SQLite, the query is an indexed `ORDER BY ms LIMIT 25`,
and the write allowance is two orders of magnitude larger.

---

## Cheating — the exposure, stated rather than solved

A public write endpoint with no accounts means **anyone who opens devtools can POST a 0:01 and hold
first place forever.** The worker applies three mitigations:

1. a plausibility floor and ceiling on the submitted time (15 s – 1 h);
2. a per-IP rate limit (20 writes / 10 min);
3. an Origin check on writes — enforced in the worker, not left to CORS, because CORS blocks the
   *reply* in the browser and does nothing to stop the row being written.

**Not one of them is airtight, and none of them can be.** While the client owns the puzzle and the
clock, everything enforceable here is a bar to climb. Airtight means the server mints the puzzle,
holds the solution and times the solve — a different feature, an order of magnitude more work, for a
board played among friends. The floor's real job is not the cheater but the *accident*: a client bug
that submits `0` would otherwise pin an unbeatable row at rank 1 permanently.

If it is ever actually abused, the remedy is one statement:

```sql
DELETE FROM scores WHERE board = 'nonet';
```

---

## Deploying it, once he has said yes

```bash
cd server/leaderboard
npx wrangler login
npx wrangler d1 create spark-leaderboard          # prints database_id → paste into wrangler.toml
npx wrangler d1 execute spark-leaderboard --remote --file=./schema.sql
npx wrangler secret put IP_SALT                    # any long random string; never commit it
npx wrangler deploy                                # prints the worker URL
```

Then point the game at it. The client reads **one** build-time variable and there is no second code
path:

- **GitHub → Settings → Secrets and variables → Actions → Variables** → add
  `VITE_LEADERBOARD_URL` = the worker URL (no trailing slash).
- Add it to the `env:` block of the build step in `.github/workflows/deploy.yml`, alongside the
  three `VITE_TURN_*` keys that are already there.
- Push `master`. That is the deploy.

Unset, or set to the empty string, the game uses the local-only board exactly as it does today.

⚠ **It is already declared in `vite.config.ts` and that is load-bearing.** An undeclared `VITE_` key
is *absent* in a local build and *present-but-empty* in CI, the two bundles then differ by those
bytes, and `npm run verify-deploy`'s content-hash check goes red on a perfectly good deploy. That is
the S158 P8 regression; `src/ci.leaderboardGate.test.ts` keeps it from coming back.

---

## The shape of the API

```
GET  /board/:id?n=25   → 200 {"scores":[{"name":"ABC","ms":91234,"at":1750000000000}, …]}
POST /board/:id        → 200 {"scores":[…]}        body: {"name":"ABC","ms":91234,"at":…}
                         422 implausible time · 429 rate limited (board still returned) · 403 bad origin
```

`:id` is `nonet` today. **Stage scoping is already designed in on both sides**: the id is opaque,
`board` is a column in `schema.sql` rather than a table name, and the client addresses boards through
the same string. When the ten-stage ladder lands, `nonet:s07` is a new value, not a migration.
