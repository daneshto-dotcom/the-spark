# Multiplayer needs a relay server (TURN) — 5-minute setup

**This is the one thing I could not fix from code, and it is why you and your brother could not
connect.** Everything else is done and deployed.

---

## What was actually wrong

I tested the live site in a real browser. The game asked for network routes and got back:

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

## Why I could not just fix it

A TURN server relays your actual game traffic, so it costs real bandwidth. That is why every free one
eventually shuts down — including the one this game was using. **I probed four candidates live**
(`openrelay.metered.ca`, `global.relay.metered.ca`, `freestun.net`, `freeturn.net`) and **all four
returned zero relay candidates.** There is nothing credential-free left to hard-code.

So it needs an account. The good news: the free tiers are generous, and the game is now wired so that
turning it on is **pasting three values** — no code changes.

---

## Do this (about 5 minutes)

### Option A — Metered (easiest, 50 GB/month free)

1. Sign up at **metered.ca/stun-turn**
2. Open your dashboard → it shows credentials that look like:
   - URLs such as `turn:standard.relay.metered.ca:80` and `turn:standard.relay.metered.ca:443?transport=tcp`
   - a **username** and a **credential** (password)
3. Create a file called **`.env`** in the project root with:

```
VITE_TURN_URLS=turn:standard.relay.metered.ca:80,turn:standard.relay.metered.ca:443?transport=tcp
VITE_TURN_USERNAME=paste_your_username
VITE_TURN_CREDENTIAL=paste_your_credential
```

4. Tell me, or run a deploy — the values are baked in at build time.

### Option B — Cloudflare (you already have a Cloudflare account)

Cloudflare Realtime/Calls includes a TURN service. Generate a TURN key in the dashboard and put its
URLs + username + credential into the same three variables.

> ⚠ `.env` is git-ignored, so the credentials never enter the repository. That is deliberate — a
> TURN credential in a public repo gets scraped and used as free bandwidth by strangers.

### How to confirm it worked

Open the deployed site, press **F12 → Console**, paste this, and press Enter:

```js
const pc = new RTCPeerConnection({ iceServers: [{ urls: 'turn:YOUR_URL', username: 'YOUR_USER', credential: 'YOUR_PASS' }], iceTransportPolicy: 'relay' });
pc.createDataChannel('x'); await pc.setLocalDescription(await pc.createOffer());
setTimeout(() => console.log('RELAY CANDIDATES:', (pc.localDescription.sdp.match(/ typ relay/g) || []).length), 8000);
```

**Any number above 0 means it works.** `0` means the credentials are wrong or the service is down.

---

## What I changed tonight, so this is not silent again

1. **Removed the dead relay servers.** They were failing on *every* connection attempt, adding delay
   and error noise even to connections that would otherwise have succeeded.
2. **Widened the direct-connection servers** from one operator (Google) to three (Google, Cloudflare,
   Twilio), so one outage is not an outage for you.
3. **⭐ The lobby now tells you what is wrong.** After 20 seconds with nobody arriving it says:

   > *Could not reach the other player: no relay server is configured, so players behind strict
   > routers or mobile networks cannot be reached — press Back to retry, or play VS BOTS.*

   It no longer spins forever. And once you configure a relay, that message automatically stops
   blaming the relay and reports an honest generic failure instead.
4. **Made TURN a config value**, so the fix above is a paste and a rebuild.

The 20-second wait is deliberate: it sits below the transport's own 30-second limit, so you are told
what is happening *before* the machinery gives up underneath you, and well above any healthy
cross-country connection time.
