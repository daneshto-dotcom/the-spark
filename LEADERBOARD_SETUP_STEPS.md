# Turning on the shared arcade leaderboard — ✅ DONE, S182

> ⭐ **THIS IS FINISHED. Nothing below is outstanding.** It is kept as the record of what was run and
> as the recovery procedure if the worker ever has to be rebuilt from scratch.

**Live at** `https://spark-leaderboard.saras-fdtta.workers.dev`, on your own Cloudflare account
(`daneshto@gmail.com`). The repository variable is set. The board goes live on spark-online.space at
the next deploy of the game.

⚠ **This page used to open by telling you, in the present tense, that scores live only in your own
browser — and then walked you through creating a Cloudflare account you already had.** Both were true
when it was written and neither was true an hour later. Corrected rather than deleted, because you
may need the sequence again.

**What it does:** the NONET table used to live only in your own browser, which is why you and your
friend were both "1st place" and couldn't see each other. The scores now live in a real database
everyone reads.

**What it costs:** nothing, and no card. Comfortably inside Cloudflare's free plan — see
`server/leaderboard/README.md` for the measured numbers.

---

## ~~STEP 1 — Get a Cloudflare account~~ ✅ you already had one

You have an account at **https://dash.cloudflare.com** under `daneshto@gmail.com`, with other
projects already on it (`conviction.run`, `legacyoftherealm.com`). Nothing to do here.

⚠ Worth keeping straight, because it caused confusion once: **spark-online.space is NOT on
Cloudflare.** It is registered through Squarespace, its nameservers are Google's, and the live game is
served by GitHub Pages. The leaderboard worker is a separate thing on its own `workers.dev` address
that the game calls out to. Nothing about your domain changed, and nothing needs to.

---

## STEP 2 — Open a terminal in the right folder

Use the **Terminal** tab next to this chat in the Claude app. Paste this and press Enter:

```
cd "/c/Users/onesh/OneDrive/Desktop/Claude/Founder DNA/Extension Projects/The Spark/.claude/worktrees/s182-arcade-leaderboard-02a32c/server/leaderboard"
```

Nothing will appear to happen. That's correct — it just moved you into the right folder.

> **Why this odd path?** The leaderboard files are on the branch I built them on, which isn't merged
> into the main project yet. This folder is where they live for now.

---

## STEP 3 — Connect your computer to your Cloudflare account

```
npx wrangler login
```

**What happens:** your web browser opens a Cloudflare page asking permission. Click the blue
**"Allow"** button. Then come back to the terminal — it will say `Successfully logged in`.

---

## STEP 4 — Create the database

```
npx wrangler d1 create spark-leaderboard
```

**What happens:** it prints a block of text that looks like this:

```
[[d1_databases]]
binding = "DB"
database_name = "spark-leaderboard"
database_id = "a1b2c3d4-5678-90ab-cdef-1234567890ab"
```

👉 **Copy that long `database_id` value** (the part in quotes). You need it in the next step.

---

## STEP 5 — Paste the ID into the config file

Open this file:

```
server/leaderboard/wrangler.toml
```

Find **line 14**. It currently says:

```
database_id = "PASTE-THE-ID-FROM-wrangler-d1-create"
```

Replace the placeholder with your real id, so it looks like:

```
database_id = "a1b2c3d4-5678-90ab-cdef-1234567890ab"
```

Save the file.

> Can't be bothered? Just paste the id into the chat and I'll edit the file for you — it's not a
> secret, it's useless to anyone without your account login.

---

## STEP 6 — Build the tables

```
npx wrangler d1 execute spark-leaderboard --remote --file=./schema.sql
```

**What happens:** it asks you to confirm you want to run this against the remote database. Say
**yes**. Then it prints a few lines about commands executed. This creates the three tables the
leaderboard needs.

---

## STEP 7 — Set the privacy key

First, generate a random value — paste this and press Enter:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

It prints a long line of random letters and numbers. **Copy it.**

Now:

```
npx wrangler secret put IP_SALT
```

**What happens:** it asks you to enter a secret value. Paste the random string you just copied and
press Enter.

> **What this is for:** the server counts how many scores come from each internet connection, so one
> person can't spam the board. That count needs a scrambled version of the address, and this random
> value is what scrambles it. Without it, the scrambling would be reversible. The leaderboard will
> refuse to accept scores until this is set — deliberately.

---

## STEP 8 — Put it online

```
npx wrangler deploy
```

**What happens:** it uploads and then prints a web address, something like:

```
https://spark-leaderboard.your-name.workers.dev
```

👉 **Copy that address.** This is the last thing you need.

---

## STEP 9 — Point the game at it

Paste this, replacing the address with yours:

```
gh variable set VITE_LEADERBOARD_URL --body "https://spark-leaderboard.your-name.workers.dev"
```

> Or just send me the address and I'll do this step and the commit.

---

## STEP 10 — Ship it

The leaderboard goes live the next time the game is deployed, which happens when the branch is merged
and pushed. I handle that.

**How you'll know it worked:** in the deploy log on GitHub there'll be a block like this:

```
── SPARK leaderboard wiring ──────────────────────────────────────────
   VITE_LEADERBOARD_URL: https://spark-leaderboard.your-name.workers.dev
   ✅ SHARED BOARD WILL BE SHIPPED — the arcade will read and write this worker.
──────────────────────────────────────────────────────────────────────
```

If it says **SET but UNUSABLE** instead, it will tell you exactly what's wrong with the address.

Then: play a NONET run in the arcade, put your initials in, and get your friend to do the same. You
should both see both names.

---

## If something goes wrong

| What you see | What it means |
|---|---|
| `wrangler: command not found` | You're not in the right folder — redo Step 2. |
| `Not logged in` | Redo Step 3. |
| `no such table: scores` | Step 6 didn't run — do it again. |
| `server misconfigured: IP_SALT unset` | Step 7 didn't take — do it again. |
| Board still shows only your scores | Check the deploy log block from Step 10. |

**Nothing here is permanent.** If you want it gone: `gh variable delete VITE_LEADERBOARD_URL` and the
game goes straight back to the local board. Nobody loses a score — every run is saved on your own
machine first, before it's ever sent anywhere.
