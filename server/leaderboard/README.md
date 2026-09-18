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

## ⭐ DEPLOYED — S182. This is the record of what was run, and how to redo it.

Live at **https://spark-leaderboard.saras-fdtta.workers.dev**, database `spark-leaderboard`
(id `a3db764b-1982-46ef-9d29-7c5f54d3aa93`, region WEUR). The owner ran `wrangler login`; the rest was
run for him. Re-running the sequence below is safe — every statement in `schema.sql` is
`IF NOT EXISTS` or an upsert, so applying it twice is a no-op and it never destroys data.

⚠ **R182-G changed the data model after the first deploy.** The ranking is now one row per PLAYER,
averaged across their runs — see `schema.sql`. The original per-run `scores` table is retired but left
in place rather than dropped, so this runbook cannot delete anything by being re-read.

### The original sequence, for reference

⛔ **Steps 1 and 2 require Daniel's own Cloudflare credentials and cannot be done for him.**
`wrangler login` is a browser OAuth flow against his account. Everything after them is mechanical.

```bash
cd server/leaderboard
npx wrangler login                                 # ← HIS browser, HIS account. Step 1.
npx wrangler d1 create spark-leaderboard           # ← prints database_id. Step 2.
                                                   #    paste it into wrangler.toml
npx wrangler d1 execute spark-leaderboard --remote --file=./schema.sql
npx wrangler secret put IP_SALT                    # ⛔ MANDATORY — see below
npx wrangler deploy                                # prints https://spark-leaderboard.<sub>.workers.dev
```

⛔ **`IP_SALT` IS NOT OPTIONAL AND THE WORKER NOW REFUSES WRITES WITHOUT IT.** It used to default to
the literal `'spark'` — a constant published in this public repo — which would have made the stored
`ip_hash` column a brute-forceable encoding of players' IP addresses (there are only 2^32 IPv4
addresses) while the code claimed the opposite. Skipping one line of a runbook must not silently
downgrade a privacy property, so a missing or short salt is now a loud `503`, recoverable in one
command. Use something long and random:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 
```

⚠ **`workers.dev` is a Free-tier hostname and Cloudflare's own docs call it "intended for personal
or hobby projects that aren't business-critical".** That is exactly what this is, so it is the right
choice — but if the board ever matters more, put it behind a custom domain. The client accepts any
https origin, so that move is a variable change and nothing else.

Then point the game at it:

```bash
gh variable set VITE_LEADERBOARD_URL --body "https://spark-leaderboard.<sub>.workers.dev"
```

and push `master`. The deploy log will print a `── SPARK leaderboard wiring ──` block saying either
`✅ SHARED BOARD WILL BE SHIPPED` or exactly what is wrong with the value. **Read that block** — it
is the only thing that distinguishes a working board from the original bug, which looks identical.

To check a value before committing to it:

```bash
VITE_LEADERBOARD_URL="https://..." node scripts/leaderboard-wiring-report.mjs
```

Unset, or set to the empty string, the game uses the local-only board exactly as it does today.

⚠ **ORDERING: deploy the worker BEFORE setting the variable.** Between the two, nothing breaks —
the variable is only read at build time, so the live site keeps using the local board until the next
push. There is no window where the game is pointed at a worker that does not exist yet.

**Rolling back** is the same property in reverse: `gh variable delete VITE_LEADERBOARD_URL` and push.
The next build ships the local board again and no player loses a run, because every local row was
written before the network call. Nothing here is irreversible except the Cloudflare account itself.

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
