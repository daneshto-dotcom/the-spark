# S196 · DEDICATED HOST ON WORKSTATION 2: research and design

*Tree `s196/dedicated-host`. This tree builds nothing. Nothing was installed, opened, deployed or touched on
workstation 2. Every number cites its source. Owner rulings this answers: S195 **N9** (host on WS2 as a server
while it is up, P2P when it is down, "just for the development stage", ⛔ "make sure nobody can like go into our
backend") and S196 **R196-P1 item 6** ("maybe our host … server … isn't strong enough … pay for better hosting …
or run it on workstation two" / "I was the host, so why was he lagging?").*

---

## ⭐ ONE SCREEN: THE ANSWER

**Recommendation: do not build the dedicated host yet. First let the three trees already hunting Mark's lag
land (`s196/joiner-desync`, `s196/joiner-lag`, `s196/net-cpu`), then play one match with `?debug=1`. A
dedicated host cannot fix what Mark hit. If after that you still want an always-on host (for stability, not
lag), build ONE "house mode" (a headless copy of the game page that hosts without a seat). Run it free on WS2
during development under a locked-down Windows user, and move the same thing to a ~€5–15/month rented server
when it should be always on, or when you want it fully away from the home network.**

| your question | plain answer | recommendation |
|---|---|---|
| **"Is our hosting not strong enough? Should we pay for better hosting?"** | No. The website host (GitHub Pages) only hands out the game's files once, when the page loads. It never touches a match. The match runs **inside the host player's browser**, which in your game with Mark was **your PC**. Paying for better web hosting would change nothing in a match. | Pay nothing. |
| **"I was the host, so why was he lagging?"** | Because the host is only one of four places lag can come from, and a strong host fixes only that one. The others are **Mark's own PC** (it has to draw the whole board itself, 60 times a second), **Mark's own internet download**, and **a bug** in how a joiner unpacks snapshots. Your upload is no longer a suspect: since S195 the game sends each joiner about **0.5–0.8 Mbit/s** (it used to be 14–23). The bug is the strongest lead today, and a separate tree is confirming it. | Wait for the three lag trees. They are about Mark's side, which is where the evidence points. |
| **"Run it on workstation 2 — fat connection, strong idle computer?"** | WS2 is in **the same house, behind the same router, on the same fibre line** as your PC (BRAIN: three-machine architecture §5). So WS2 has the same internet connection your PC has, no fatter. It does have a faster CPU (Ryzen 9 9950X3D vs your 5900XT), but your PC is not struggling to host. It can be done safely with no open ports, about 1–1.5 weeks of work. It would make the host steadier and always available. It would **not** fix a joiner's weak PC, his connection, or the joiner bug. | Later, only if you want an always-on host. Phase plan in §5. |
| **"Or a rented server?"** | A €5–15/month machine in a datacentre (Hetzner / Fly.io) runs the same "house mode" with zero risk to the home network. Cloudflare (where the leaderboard already lives) is the cheapest to run, but the most code to build, because its servers cannot speak WebRTC. | The best home for an always-on host, once one is wanted. |
| **"Nobody gets into our backend?"** | The design opens **no inbound port** anywhere. The host machine only makes outgoing connections, exactly as a player's browser does today. It runs under its own powerless Windows user that cannot see Oleg's files, and only a signed beacon can claim to be "the house". | Built into every phase (§4). |

⚠ **One thing to check with you:** you said WS2 has "a really fat network connection". The BRAIN records it on
the **same home router** as your machine. If WS2 actually sits somewhere else (an office, another line), tell me,
because that changes §3's network row. Even so, it would not change the verdict for Mark: at ~0.5–0.8 Mbit/s per
joiner, any fibre line is far more than enough.

⚠ **And one thing that is not mine to decide:** WS2 is **Oleg's machine**. It runs his UPLAH / dOS work, three
Claude seats on one Windows account, a ~1 TB memory database and a nightly NAS mirror (BRAIN TNAS/WS2 sweep,
2026-10-06). It is not idle in the sense of "nothing on it". A house process needs Oleg's OK, and it must run at
low priority so it never slows his work.

---

## 1 · WHERE THE GAME ACTUALLY RUNS (answers "is our hosting not strong enough?")

| piece | where it runs | what it does in a match |
|---|---|---|
| **spark-online.space** | GitHub Pages (static files) | Nothing. It sends the game's JS/art **once**, when the page opens. CLAUDE.md: "Pushing `master` IS shipping"; the deploy is just files. |
| **Matchmaking ("signalling")** | public Nostr / MQTT / torrent relays, through Trystero (`package.json`: `@trystero-p2p/*` 0.25.2) | Introduces the players to each other. After that it carries nothing of the match. |
| **TURN relay** (only if two players cannot connect directly) | Metered.ca (owner's account, `TURN_SETUP.md`) | Passes bytes through when a direct path fails. Free tier, 50 GB/month. |
| **The match itself: the simulation** | **The host player's browser.** The host is always seat 0 (`src/net/lobbyRoster.ts:44`), the player who pressed HOST. | Runs every tick (`runHostTick`, `src/state/hostTick.ts:369`), then sends each joiner a snapshot 10 times a second (`NET_SNAPSHOT_HZ = 10`, `constants.ts:1109`). |
| **Each joiner** | **His own browser, on his own PC** | Unpacks the snapshot, rebuilds the board and **draws it**. The drawing happens on his machine, at his machine's speed. |
| **Arcade leaderboard** | a Cloudflare Worker (`server/leaderboard/`) | High scores only. Not part of a match. |

**So "better hosting" cannot help a match.** There is no game server today. Upgrading GitHub Pages, or paying
for any web host, changes how fast the page **loads** and nothing after that. In your match with Mark, the
"server" was your own PC.

## 2 · "I WAS THE HOST, SO WHY WAS HE LAGGING?"

A snapshot goes from your sim, to your upload, across the internet, to Mark's download, into Mark's unpacking
code, and then onto Mark's screen. Lag can come from any of those legs, and a strong host covers only the first.
Today's evidence for each leg:

| # | candidate | evidence today | would a dedicated host fix it? |
|---|---|---|---|
| 1 | **Host CPU** (your PC too busy to simulate + send) | Sim ~1–3 ms a tick (S195 lag report §2). Encoding a snapshot for one joiner is ~2.9 ms at wave 10 and ~4.7 ms at wave 15 (`S195_PROGRESS_net-delta.md:33`), against a 100 ms budget. You were the host on a strong PC and **you** never lagged. The `s196/net-cpu` tree is measuring the 3+ joiner case. | **Yes**, but this leg is not where Mark's problem is. |
| 2 | **Host upload** | **No longer a candidate.** Since PROTOCOL 70 (S195 deploy #10, net-delta), one joiner costs **0.53 Mbit/s at wave 10 and 0.82 at wave 15** (was 14.4 / 23.4). Three joiners cost ~2.5 Mbit/s, a small slice of a fibre upload. | No (and nothing to fix). |
| 3 | **The path / Mark's download** | Unmeasured for Mark. At ~0.5–0.8 Mbit/s even a weak line carries it. A long or relayed (TURN) path adds delay and jitter, but not 45 seconds of it. | **No.** The bytes come out of the same house, over the same path. |
| 4 | **Mark's own PC drawing the board** | Measured S195: on a joiner, the cost is **drawing** the board, not receiving it (wave-10 frame 24.2 ms with snapshots vs 24.4 ms idle, 4× throttle). A weak PC sits at 15–25 fps on a late board. MINIMAL graphics cut ~40–55 %. Mark said it still lagged on the lowest setting. The `s196/joiner-lag` tree is profiling exactly that. | **No.** Every joiner draws on his own machine. |
| 5 | **A joiner-side BUG** (state ~45 s late, buildings he could not see, a score that stayed stale) | P1 items 2–4 describe a board that is **tens of seconds old**, not choppy. That is not what too little bandwidth or CPU looks like. The `s196/joiner-desync` tree is hunting it. The `s196/net-cpu` tree has an unconfirmed hypothesis written in its progress file (snapshot unpacking queued serially on the joiner, so a slow joiner falls further behind without limit). **This tree does not give a verdict; it belongs to that tree.** | **No.** It lives in the joiner's own code path. Any host, however strong, feeds it the same frames. |

**Bottom line:** the evidence points at Mark's side (legs 4 and 5), and a dedicated host only touches leg 1.
That is why the recommendation is to wait for the three lag trees, not to build a host.

⭐ **How to tell the legs apart in a real match, for free:** both open `spark-online.space/?debug=1`. At wave 8–9,
Mark reads `snap rx` / `snap gap` and his fps, and you read `net out`. If `snap rx` is near 10 while fps is low,
the cause is his PC. If `snap rx` is low while fps is fine, it is the network. If `snap rx` is fine and fps is fine
but the board is still old, it is the bug.

## 3 · RE-EXAMINING S195's "WS2 WOULD NOT HELP" WITH TODAY'S FACTS

S195 (`S195_LAG_REPORT.md` §0, §3 option D) concluded that WS2 would not help Mark because it shares the home
uplink. Here is what changed since then, and what did not:

| fact | S195 (before net-delta) | today (PROTOCOL 70) | effect on the WS2 question |
|---|---|---|---|
| bytes per joiner, wave 10 | ~10–14 Mbit/s | **0.53 Mbit/s** | The uplink argument is now **moot in both directions**: it is not a problem from your PC, and WS2 would not improve it. |
| WS2's location | same house | same house: **same router, same LAN** (BRAIN `_sources/onboarding_2026-10-06/grok_pack/THREE_MACHINE_ARCHITECTURE.md` §5) | Still the same line. |
| WS2's CPU | Ryzen 9 9950X3D | 9950X3D + RTX 5070 Ti (same file, §1) | A faster host, but the host is not the bottleneck. |
| joiner symptoms | choppy at wave 8+ | **stale by ~45 s**, invisible buildings, stale score (R196-P1) | Points at a joiner-side bug. No host helps. |

**Verdict: S195's conclusion stands for the lag, now for a stronger reason.** With bytes no longer the problem,
the remaining causes (the joiner's PC and the joiner bug) are both out of a host's reach.

**What WS2 hosting WOULD genuinely give (real, just not Mark's lag):**
- **An always-on, always-identical host.** No match depends on which player pressed HOST, or on that player's PC
  being busy with a stream, a game or a compile.
- **Your PC freed up.** Today you simulate, encode one snapshot per joiner and draw, all on your browser's main
  thread. Under house mode you become a joiner like everyone else, connected over the LAN.
- **Fewer host migrations.** A human host who quits or crashes forces the existing succession (`succession.ts`,
  `HOST_STARVATION_MS = 6000`). A house that stays up rarely needs it.
- **A cleaner path to "the strongest machine hosts"** (R196-N1, the `s196/net-cpu` tree). A house is the limiting
  case of that rule: the strongest machine that is always present.

## 4 · THE DESIGN: "HOUSE MODE"

### 4.1 · How to run the simulation headless: three options

| | option | what it is | pros | cons | effort |
|---|---|---|---|---|---|
| **H1** ⭐ | **Headless browser running the real game page** with `?house=1` | Chrome on the host machine opens spark-online.space with a flag. The page skips drawing, runs only the host loop and the existing sim worker (`simWorker.ts`, the `?worker=1` path). | Reuses everything: Trystero, WebRTC, the codec, host migration, the worker. Always runs **the live build** (it loads the site), so it can never be on the wrong protocol for long. **No new package**: Chrome already exists, and Playwright is already a devDependency if a driver is wanted. | ~300–500 MB of RAM per open room. Chrome is a big process to keep alive. | ~1–1.5 weeks with discovery + hardening (matches S195 §3 option D). |
| H2 | **Node process** running the sim | The sim already runs in Node: the unit suite drives `runHostTick` directly (`lagWaveMeasure.test.ts`). Trystero accepts a WebRTC replacement (`@trystero-p2p/core/dist/peer.mjs:12`, `rtcPolyfill`). | Lean (~100 MB), no browser. | **Needs a new npm package for WebRTC in Node** (e.g. `node-datachannel`), which requires your explicit approval. The host loop must be pulled out of `main.ts` (4,718 lines that mix drawing, lobby and hosting) into a module both can use. | ~2–3 weeks. |
| H3 | **WebSocket server** instead of WebRTC | Players connect to the machine with WebSockets. | Simplest networking model. Works on Cloudflare. | Needs a **listening port**: either a hole in the home router (⛔ against your security ask) or a tunnel. It is a second transport to keep correct next to WebRTC, for every message type. A cloud server is its natural home, not a home PC. | ~3+ weeks. |

**Choose H1.** It is the only option that needs no new package and no open port. It also cannot drift from the
live game, because it **is** the live game.

### 4.2 · How players connect: the same WebRTC path, with the house as a permanent peer

- The house joins matchmaking exactly as a player's browser does: **outgoing** connections to the public
  signalling relays, then WebRTC to each player, with STUN for hole-punching and TURN as the fallback. **No port
  forwarding, no listening service, nothing new reachable from the internet.** The UDP pinholes WebRTC uses are
  the same ones every player's browser opens today, and they close when the match ends.
- **New piece, a seat-less host.** Today the host is always seat 0 and a player (`lobbyRoster.ts:44`). The house
  must host **without taking a seat**: every human is a joiner, and the first human in the room is the lobby
  leader who presses Begin (one small new lobby message). The roster, the succession warrant and the end-of-match
  board must all skip the house. Under the four-sites rule, every roster consumer gets visited, not only the ones
  `tsc` forces. **This earns a PROTOCOL bump** (new message + a new host role).
- **Finding the house, and falling back.** When a player presses HOST, the page listens ~1.5 s on a fixed "house"
  room for a beacon. If the beacon is present, **correctly signed**, on the same protocol and not full, the house
  opens the room and the player joins it. Otherwise the player hosts over P2P **exactly as today**. A player can
  force P2P with `?nohouse=1`.
- **The house dies mid-match:** the existing host migration promotes a human successor and the match continues.
  The fallback is already built. It needs one test proving the warrant never names the seat-less house.

### 4.3 · ⛔ SECURITY (your "nobody can go into our backend")

**What could be attacked, and the answer to each:**

| threat | answer |
|---|---|
| Someone on the internet reaching the house machine | **No inbound port, no port forward, no web server, no remote desktop on the internet.** The house only dials out. Windows Firewall gets **no new inbound rule**. |
| A hostile player sending crafted messages to the house | Already defended in the code a house would run (checked S195 §3.3): JSON parsed inside try/catch (`transport.ts` `handleRawMessage`), wrong-protocol peers latched out (`detectProtocolMismatch`), per-peer rate limit (`intentRateLimiter.ts`), only allowlisted intents accepted, every intent re-stamped with the **sender's own seat** (`intentStamp.ts`). The worst case is crashing the page, so the house runs as a **disposable process that restarts itself**. |
| **A fake house** capturing every lobby (the real danger: the host decides the game) | The beacon is **signed with a private key that exists only on the house machine**. The game ships only the public key. The room code is already the fingerprint of the host's key (`hostIdentity.ts`), so the room stays authenticated end to end. The beacon carries an expiry, so a copied one goes stale. |
| A breakout from the house process into WS2 / the home network | A **separate Windows standard (non-admin) user**, `spark-house`, used for nothing else. Its own empty Chrome profile, no logins, no saved passwords. **NTFS denies it Oleg's folders, the Google Drive mount, the NAS shares and the Claude seats.** Not in the Tailscale ACL. Chrome's own sandbox stays on (never `--no-sandbox`). |
| Secrets leaking | **None go into the game bundle** except the beacon's public key. ⚠ The TURN username/password are already public in the bundle by design (`vite.config.ts` `VITE_TURN_*`). They are relay credentials with a hard quota, not backend access (`TURN_SETUP.md`). |
| Players learning the house's IP | They see the **home's public IP**, which they already see today when you host over P2P. Unchanged. Only a rented server (§6) hides it. |
| Slowing Oleg's machine | The house runs at **Below Normal priority**, capped at **2 rooms**. Above that it stops beaconing, and players fall back to P2P. |
| Staying patched | Windows Update and Chrome auto-update on. The house reloads the live site between matches, so a new deploy reaches it automatically. A protocol mismatch makes it restart. |
| **Kill switch** | Three levels. (1) Close the house process, or disable its scheduled task: no beacon, so every player falls back to P2P within ~1.5 s. (2) Revoke the key: ship a build with the public key removed, and **every** client ignores the house. (3) Per player: `?nohouse=1`. |

### 4.4 · Availability

- **Up:** WS2 on, `spark-house` logged in (or the task set to run whether or not anyone is logged on), the
  beacon present. **Down:** today's P2P, with no difference a player can see except who hosts.
- **Mid-match failure:** the existing succession takes over in ≤ 6 s (`HOST_STARVATION_MS`).
- A scheduled task restarts the house if it exits. A health line goes to a local log only, with no remote
  monitoring service (that would be a new open door).

## 5 · PHASED PLAN (smallest useful slice first)

| phase | what | who | effort | gate |
|---|---|---|---|---|
| **0** | **Do nothing new.** Let `s196/joiner-desync`, `s196/joiner-lag` and `s196/net-cpu` land. Then one match with Mark on `?debug=1`, readings at wave 8–9 (§2). | the three trees + you (2 min) | 0 | If Mark is fine afterwards, **stop here**. The house was never the fix. |
| **1** | **House mode in the game:** `?house=1`, which skips drawing, hosts without a seat, and adds the lobby-leader Begin message. Tests: the seat-less roster, a succession warrant that never names the house, every roster consumer visited. **PROTOCOL bump.** | a worktree | ~4–6 days | You say "yes, I want an always-on host". |
| **2** | **Signed beacon + discovery + P2P fallback + `?nohouse=1` + the revoke path.** | a worktree | ~2–3 days | Phase 1 merged. |
| **3** | **WS2 setup runbook** (a document, carried out by you or Oleg, not by an agent): the `spark-house` user, NTFS denies, the scheduled task, priority, the key generated on WS2 itself, no inbound rule. Then a soak test: 3 humans + bots for a full match. | you / Oleg, with a runbook | ~½ day | **Oleg agrees** to it running on his machine. |
| **4** *(optional)* | **Move the same house to a rented server**, if it should be always on or fully away from home (§6). | a worktree + your account action | ~1 day + ~€5–15/month | You want 24/7 or full isolation. |
| **5** *(optional)* | **Node host (H2)** instead of headless Chrome: leaner, but it needs your approval for a WebRTC package. | a worktree | ~2–3 weeks | Only if Chrome's RAM becomes the limit. |

Phases 1–3 come to **~1–1.5 weeks**, the same as S195's estimate.

## 6 · RENTED SERVER INSTEAD OF WS2: ROUGH MONTHLY COST

⚠ Prices are approximate from published list prices as I know them. **Check the provider's page before
buying.** Signing up is your account action. Bandwidth is no longer a cost driver: a 30-minute 4-player match is
~3 joiners × 0.6 Mbit/s × 1,800 s ≈ **0.4 GB**.

| option | what you run | rough cost / month | for | against |
|---|---|---|---|---|
| **Hetzner Cloud** (Germany / Finland), 2–4 vCPU, 4–8 GB | H1 (headless Chrome), as a Linux service | **~€5–15** | Cheapest real machine. 20 TB of traffic included. Fully off the home network. | You administer a Linux box: updates, SSH locked to keys. |
| **Fly.io**, 1–2 shared CPU, 2 GB, in a container | H1 in a container | **~$10–25** | Deploys from a Dockerfile, restarts itself, can sit near players. | Billing is per usage. Headless Chrome needs ~2 GB, which raises the price. |
| **Cloudflare Durable Objects** (Workers Paid, already used for the leaderboard) | The sim in a Durable Object, players on **WebSockets** (H3) | **~$5 base + pennies** per match | Cheapest to run. The same account as the leaderboard. Nothing to patch. | **Cloudflare cannot speak WebRTC**, so it needs the WebSocket transport (H3, ~3+ weeks) and a sim that fits Durable Object CPU/time limits. The most code by far. |
| **WS2** | H1 | **€0** (electricity) | Free, as you asked "for the development stage". | Same home line. Shares Oleg's machine. Down when WS2 is off. Lives on the home network, so §4.3's isolation must be done properly. |

**What any server fixes, home or rented:** host CPU and a stable, always-present host. **What none fixes:** a
joiner's weak PC, a joiner's own connection, and a joiner-side bug.

## 7 · NOT DONE / OPEN
- **Mark's location, line and PC are unknown here.** The `?debug=1` reading (§2) is what settles legs 3–4.
- **The joiner-bug verdict belongs to `s196/joiner-desync`.** This document quotes only that a hypothesis exists.
- **Host CPU with 3+ joiners** is `s196/net-cpu`'s measurement. The 2.9–4.7 ms per joiner figure here is the
  S195 Node measurement on a shared machine.
- **Cloud prices were not checked live** (§6 warning).
- **WS2's real uplink speed is not recorded** anywhere in the BRAIN, only that it is fibre at the château.
- **Owner/Oleg decisions:** (a) build house mode at all (Phase 1); (b) WS2 or a rented server; (c) Oleg's consent
  for WS2.
