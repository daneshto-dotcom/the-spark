# Multiplayer needs a relay server (TURN) — 5-minute setup

**This is the one thing that cannot be fixed from code, and it is why you and your brother could not
connect.** Everything else is done and deployed.

> ### ⚠ CORRECTION TO THE FIRST VERSION OF THIS PAGE (S158)
> The original runbook told you to put three values in a `.env` file and redeploy. **That would not
> have worked, and you would have had no way to tell.** `.env` is deliberately git-ignored, and the
> live site is built by GitHub Actions from a clean checkout — so the file on your disk is invisible
> to the build that actually ships. You would have done the signup, seen a green deploy, and still
> been unable to reach your brother.
>
> That gap is now closed: the deploy workflow reads the values from **GitHub repository secrets**,
> and prints a line in the build log confirming whether they arrived. `.env` still works, but only
> for builds you run on your own machine. **Follow Step 2 below, not a `.env` file.**

---

## What was actually wrong

The live site was tested in a real browser. The game asked for network routes and got back:

```
host: 1     ← your own machine
srflx: 1    ← your public address (STUN works)
relay: 0    ← NOTHING. This is the problem.
```

Every relay server the game shipped with returned `400 TURN allocate error` — the credentials were
**retired by the provider**. The hostname still resolves, so nothing looked broken from outside.

**What that means in plain terms.** Two players can normally find each other directly. But when both
sides are behind a strict router — which is the *normal* case on mobile networks, and very common
between two countries — the connection has to be *relayed* through a middleman server. That
middleman is called a TURN server. The game had none that worked, so the connection could never
complete, no player ever appeared, and the lobby sat on **"Connecting…"** forever.

It also explains the two things that looked contradictory:
- **Both quickmatch and host-with-a-code failed identically** — they share this one setting.
- **You have connected before.** `srflx: 1` proves the simpler path works, so friendly networks still
  connect. It is the hostile pairs — like Israel ↔ here — that cannot.

## Why it cannot just be hard-coded

A TURN server relays your actual game traffic, so it costs real bandwidth. That is why every free one
eventually shuts down — including the one this game was using. **Four candidates were probed live**
(`openrelay.metered.ca`, `global.relay.metered.ca`, `freestun.net`, `freeturn.net`) and **all four
returned zero relay candidates.** There is nothing credential-free left to hard-code.

So it needs an account. The good news: the free tiers are generous, and the game is now wired so that
turning it on is **pasting three values into GitHub** — no code changes.

---

# Do this (about 5 minutes)

## Step 1 — get credentials

### Option A — Metered (easiest, 50 GB/month free)

1. Sign up at **metered.ca/stun-turn**
2. Open your dashboard. It shows:
   - URLs such as `turn:standard.relay.metered.ca:80` and
     `turn:standard.relay.metered.ca:443?transport=tcp`
   - a **username** and a **credential** (password)

### Option B — Cloudflare (you already have a Cloudflare account)

Cloudflare Realtime includes a TURN service with a large free allowance. Generate a TURN key in the
dashboard and use the URLs + username + credential it gives you.

## Step 2 — put them in GitHub (⭐ this is the step that makes the LIVE site work)

Go to the repository → **Settings** → **Secrets and variables** → **Actions**, and add three
**repository secrets** with these exact names:

| Name | Value |
|---|---|
| `VITE_TURN_URLS` | the urls, comma-separated, e.g. `turn:standard.relay.metered.ca:80,turn:standard.relay.metered.ca:443?transport=tcp` |
| `VITE_TURN_USERNAME` | your username |
| `VITE_TURN_CREDENTIAL` | your credential / password |

> `VITE_TURN_URLS` is not really a secret, so you may instead add it under the **Variables** tab if
> you prefer to be able to read it back — the workflow accepts either.

## Step 3 — redeploy

Any push to `master` that touches the game rebuilds and redeploys. If nothing needs changing, use
**Actions → Deploy to GitHub Pages → Run workflow** to trigger one by hand.

## Step 4 — confirm it worked (two ways, both easy)

### In the game — the **TEST CONNECTION** button ⭐

Open the site, go into **Multiplayer**, and press **TEST CONNECTION** in the bottom-right corner.
It runs the exact measurement described at the top of this page and tells you in plain language which
of these you are in:

- ✓ **"Connection test passed — you can play with anyone"** → done, it is working.
- ⛔ **"No relay server — you can only reach players on friendly networks"** → the secrets have not
  reached the build. Check the spelling of the three names, and that you redeployed after adding them.
- ⛔ **"The relay server refused us"** → the values arrived but are wrong or expired. It will quote the
  error the server gave.

### In the build log

Open the deploy run in **Actions** and look at the step **"TURN wiring report"**. It prints, without
ever revealing the values:

```
[turn] VITE_TURN_URLS set: true
[turn] VITE_TURN_USERNAME set: true
[turn] VITE_TURN_CREDENTIAL set: true
[turn] RELAY WILL BE SHIPPED in this build.
```

If any of those say `false`, that secret did not arrive — the name is misspelled, or it was added to
the wrong repository.

---

## Is it safe to put this in the game?

**Be aware of what this is, because it is worth knowing before you pick a provider.** A TURN
credential used by a *browser* ends up inside the downloaded JavaScript — anyone who opens the site
can read it out. That is not a flaw in how this is wired; it is how browser WebRTC works when there
is no server of our own to hand out short-lived tickets, and this game is a static site with no
backend.

**What that means practically:** someone could, in principle, scrape the credential and use your
relay quota. They cannot see your game traffic or your account.

**So:** pick a provider with a **hard quota cap** rather than pay-as-you-go billing, so the worst case
is "the relay stops until next month" and never a surprise bill. Metered's free tier behaves this way.

The proper long-term fix is short-lived credentials minted by a tiny server endpoint. That needs a
backend this project does not have yet, and it is not worth building before the game has players.

---

## Local development

For `npm run dev` on your own machine, copy `.env.example` to `.env` and fill in the same three
values. That affects **only** your local build — the live site is driven exclusively by Step 2.
