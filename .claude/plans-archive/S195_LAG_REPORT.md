# S195 — LAG FOR THE OTHER PLAYERS (N9): what we measured, and the options

*Tree `s195/lag`. Everything below was measured in this session from the code on this branch; each
number gives its method. Nothing here was built into the game yet: the owner picks first.*

## 0 · THE SHORT VERSION

- **The lag grows with what has been BUILT, not with how many monsters are out.** At wave 8 the board had 6
  creatures and the snapshot still weighed 108 KiB, because 314 shapes and 485 connectors ride along in every
  snapshot, ten times a second, whether they moved or not. The bytes grow from 11 KiB at wave 1 to 78 KiB at
  wave 5 and 108–139 KiB from wave 8 on. That is the owner's description almost exactly ("after wave five …
  even worse after wave eight or nine").
- **Ninety per cent of every snapshot is things that did not change.** Shapes and connectors are 90–95 % of the
  bytes, and almost every field on them never changes after they are built (colour, who placed it, when, its
  rest length …). Between two snapshots 100 ms apart, only ~70–150 of ~850 entities change at all.
- **Two cheap measured fixes shrink it 5× to 25×.** Compressing the snapshot (deflate, built into every browser)
  takes wave 10 from 119 KiB to ~22 KiB. Sending only what changed takes it to ~15 KiB, and both together to
  ~4 KiB.
- **The brother's PC also pays to DRAW a big board**, separately from receiving it. On the joiner, the cost of a
  frame is the same with snapshots arriving and with them stopped: it is the drawing (Pixi redrawing every
  connector as vector lines every frame), not the network code. That is a second, independent cause on a weak PC.
- **Hosting on workstation 2 would not fix his lag.** WS2 sits in the same house as the owner's machine (Project
  Genesis records it as "same-room compute"), so it would send through the **same** internet line, the **same**
  snapshot size, to the **same** brother. It moves the host's CPU, which is not where the problem is (the owner
  never lags, and the host's sim is ~1–3 ms a tick). Details and security in §3.3.

## 1 · WHAT WAS MEASURED, AND HOW

### 1a · The wire, wave by wave — `src/net/lagWaveMeasure.test.ts` (opt-in instrument, committed)

`SPARK_LAG_MEASURE=1 SPARK_LAG_OUT=.tmp-gates/lag npx vitest run src/net/lagWaveMeasure.test.ts`

A real four-seat bots match (seat 0 idle, HARD/IMBA/IMBA bots — the same fixture as the S189/S190 C5
instruments), driven through `runHostTick` to wave 16. ⚠ The win bar is lifted **inside the instrument only**
(`vi.mock` of `winScoreForWave`): the first run ended in a bot WIN at wave 9 and could not reach the waves the
owner names. Every snapshot is serialised exactly as `NetTransport.send` does (`stripWirePrevPos` +
`wireNumberReplacer`). The renderer's per-frame wipe of `world.effects` is modelled (C5's lesson). At each
listed wave, 30 consecutive 10 Hz snapshots are taken 30 s into the FIGHT; the table gives the median.

| wave | snapshot | deflate lvl 1 | only-what-changed | changed + deflate | changed / total entities | creatures | shapes | connectors | Mbit/s per joiner @10 Hz |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 11.1 KiB | 2.7 KiB | 4.1 KiB | 1.4 KiB | 23 / 86 | 11 | 20 | 28 | 0.9 |
| 5 | 78.2 KiB | 14.6 KiB | 31.3 KiB | 9.1 KiB | 152 / 607 | 26 | 192 | 358 | 6.4 |
| 8 | 107.7 KiB | 20.0 KiB | 15.9 KiB | 4.7 KiB | 80 / 837 | 6 | 314 | 485 | 8.8 |
| 10 | 119.1 KiB | 22.3 KiB | 15.4 KiB | 4.3 KiB | 76 / 913 | 9 | 359 | 515 | 9.8 |
| 12 | 100.3 KiB | 18.9 KiB | 1.7 KiB | 0.8 KiB | 10 / 751 | 4 | 314 | 402 | 8.2 |
| 15 | 111.5 KiB | 21.0 KiB | 13.8 KiB | 3.9 KiB | 68 / 836 | 5 | 331 | 468 | 9.1 |

- **Peak seen: 138.7 KiB (wave 11)** — at a phase edge, when the effects list (13.6 KiB) and the free sparks
  (8.8 KiB) ride on top of the structures. That is **11.4 Mbit/s per joiner**, application payload only (DTLS/SCTP
  framing is on top).
- **Where the bytes are (wave 10):** shapes 67.9 KiB (~190 B each) · connectors 45.6 KiB (~90 B each) · everything
  else ~6 KiB. A shape on the wire: `{"id":2,"type":3,"placerColor":3921919,"placedBy":1,"createdTick":1459,
  "pos":{…},"bonds":[0,2],"ownerColor":3921919,"lastOwnershipChange":1459,"radius":8,"origin":{…}}` — only `pos`
  moves. A connector: `{"id":0,"aId":2,"bId":3,"restLength":58.89,"stiffnessTier":"HIGH","createdTick":1459}` —
  nothing on it moves at all (damage rides only when damaged).
- **Creatures are NOT the driver on a bot board** (5–26 alive mid-fight). On the brother's S182 board (120 alive)
  they add ~18 KiB (155 B each, measured on the `floor120` variant at wave 1: 24.0 KiB with 122 creatures). And
  the endgame pants waves (27–31, not reached here) add up to 360 × 162 B ≈ 57 KiB (`constants.ts`
  `MONSTER_MAX_LIVE_TOTAL` docblock) — **the late-game worst case is therefore ~170–200 KiB a snapshot**.
- "only-what-changed" = the wire JSON of every entity whose JSON differs from the snapshot 100 ms earlier, plus
  removed ids. "changed + deflate" = the same, deflated (python zlib level 1 over the recorded bursts).
- Host CPU per snapshot: `netSnapshot` build ~0.4 ms + stringify ~2–2.5 ms (once per snapshot, not per peer);
  deflate level 1 ~1 ms on top. Node `JSON.parse` + `applyNetSnapshot` onto a warm client world ~1–2 ms.

### 1b · The joiner — `scripts/lag/joiner-replay.spec.ts` (Playwright, own config, committed)

`npx playwright test -c scripts/lag/playwright.lag.config.ts --project=gpu|swiftshader`

A real two-peer room (real Nostr signalling, real WebRTC) on this worktree's own port; the match is started; then
the joiner's `NetTransport.handleRawMessage` is wrapped and fed the recorded wave-N snapshots at 10 Hz with the
live envelope's match id / epoch and a higher seq — so every gate a real snapshot passes, these pass, through the
same code. The page is checked to have actually applied the board (anti-vacuity: its shape count must match the
recording). CPU weakness is emulated with Chrome DevTools' CPU throttle (4× ≈ "mid-tier", 6× ≈ "low-end").
`handle` = parse + validation + `ClientSync.receive`; `frame` = the DEV frame probe (`__SPARK__.frameMs`: top of
the game tick to the end of Pixi's render — where the joiner applies and interpolates); `idle` = the same board,
same throttle, snapshots stopped.

**Unthrottled, real GPU (RTX 4070 Ti SUPER via D3D11), fx HIGH — run 2, the stable rows:**

| wave | snapshot | handle med / p95 | frame med / p95 | fps med (p5) | snapshots taken in 8 s |
|---:|---:|---:|---:|---:|---:|
| 1 | 11.1 KiB | 0.2 / 0.7 ms | 4.8 / 12.6 ms | 60 (60) | 80 / 80 |
| 5 | 78.1 KiB | 0.4 / 1.5 ms | 12.5 / 21.3 ms | 60 (30) | 80 / 80 |
| 8 | 107.4 KiB | 0.6 / 1.5 ms | 17.2 / 42.7 ms | 60 (20) | 77 / 80 |
| 10 | 119.0 KiB | 0.7 / 3.2 ms | 20.6 / 38.2 ms | 30 (20) | 81 / 80 |
| 15 | 111.4 KiB | 0.6 / 2.0 ms | 18.3 / 41.5 ms | 60 (20) | 80 / 80 |

**Throttled 4×, wave 5 (run 2) — fx HIGH / LOW / legacy:** frame 53.1 / 50.3 / 50.9 ms, fps 15 / 15 / 15,
handle ~1.9 ms. ⭐ **The fx setting barely moves the cost** — the base board drawing is the cost, not the
S192–S194 effects. At 6×: frame 60–67 ms, fps 7.5–8.6.

**Throttled 4×, wave 10 (profile run 2):** frame 24.2 ms with snapshots vs 24.4 ms idle; handle 0.7 / 2.4 ms.

- On THIS machine (Ryzen 9 5900XT + RTX 4070 Ti SUPER), the joiner's frame CPU grows ~4× from wave 1 to wave 10
  (4.8 → 20.6 ms) — the board alone puts a strong PC at the 30 fps edge on wave 10. Receiving a snapshot is
  ≤ 1 ms of that.
- The SwiftShader ("no usable GPU") project was not usable for fps on the shared machine (rAF ~3 fps even at
  wave 1, unthrottled); its handle times agree with the GPU rows (0.7–0.8 ms at wave 10).

⚠ **Read the throttled rows as direction, not as a benchmark.** This machine was shared with seven other
worktrees running test suites during the run (a plain `grep` over `src/render` timed out at 120 s once), and the
CPU throttle compounds that load. Two runs of the same configuration disagreed by up to 3× on fps, and a third full matrix was crushed outright (fps 0.2, 2–3 snapshots taken in 8 s even on wave 1; its anti-vacuity check failed at wave 5 and it was discarded). The
unthrottled rows and the handle times were stable across runs. Two runs were thrown away and are recorded as
invalid: run 1 measured Chrome's background-tab throttling (the joiner window was treated as hidden; fixed with
the no-backgrounding flags + a visibility guard) and the first profile replayed snapshots that were all dropped on
the seq gate (fixed with a monotonic seq + the anti-vacuity check).

**What the profile says (CDP CPU profile of the joiner, wave 10, 4×):** the top self-time is Pixi rebuilding
vector Graphics — `stroke` 12.8 %, `buildContextBatches` 7.3 %, `buildLine` 4.1 %, `toFillStyle` 4.8 %,
`structureRenderer.drawBonds`, `damageNumbers.track` 2.9 %, `territory.computeAllPlayerComplexities` 2.6 %.
Receiving the snapshot is small: `handleRawMessage` 1.1 %, `applySnapshotCore` 0.9 %. **Frame with snapshots
24.2 ms vs the same board idle 24.4 ms.** So on the joiner the network code is not the CPU problem; drawing the
board is.

⚠ **A third, unexpected cost:** in one unthrottled wave-10 window the joiner spent ~4.4 s of 13.8 s inside
Trystero's Nostr code (`add`, `sliceBytesNumBE`, `M`, `bytesToNumBE` — secp256k1 maths) plus RTCPeerConnection
churn. Trystero keeps announcing the room on all 4 Nostr relays every 5.3 s (`core/dist/strategy.mjs:10`
`announceIntervalMs = 5333`) and keeps a pool of pre-made offers, for the whole match, on the main thread. It was
bursty (another window showed ~15 ms) and needs its own measurement before anything is changed.

### 1c · The network leg — computed, not measured (and why)

Localhost has no bandwidth limit, and Chrome's network throttling does not apply to WebRTC, so the network half
is arithmetic from the measured bytes:

- **Per joiner, at 10 Hz:** wave 5 ≈ 6.4 Mbit/s · wave 8–15 ≈ 8–10 Mbit/s · peaks ≈ 11.4 Mbit/s · late game
  with pants ≈ 14–16 Mbit/s. The host sends one copy **per joiner** (3 joiners = 3×).
- **What a link that cannot carry it does (S189 "latest wins"):** the host skips snapshots, so the joiner's rate
  falls to `link ÷ snapshot size`. At wave 10 (≈ 975 kbit a snapshot): a 5 Mbit/s path delivers ~5 a second, a
  2 Mbit/s path ~2 a second — the board moves in jumps and his own clicks take a whole snapshot transfer to show.
  This is the S182 symptom ("every five seconds the characters moved"), back again because the boards grew past
  what S182 fixed (84 KiB then, 108–139 KiB now).
- **The owner's line:** BRAIN records fibre at the domain, so the raw home uplink is unlikely to be the limit at
  1v1 (it may be with 3 joiners late-game). The candidates are therefore the path to Israel and the brother's
  own download — and, a hypothesis I could not test here, the data channel's throughput over a long round trip:
  Trystero waits on `bufferedAmountLowThreshold = 65535` per 16 KiB chunk (`core/dist/peer.mjs:104`,
  `action-wire.mjs`); if Chrome counts in-flight unacknowledged bytes in `bufferedAmount`, one channel tops out
  near 64 KiB per round trip ≈ 5 Mbit/s at 100 ms — right in the danger zone. ⚠ UNVERIFIED; it needs a
  long-RTT test or the real-match reading below.
- **TURN cost:** if his connection goes through the relay, a 30-minute wave-10 game is ~2 GB through the
  Metered free tier (50 GB/month, hard cap) — about 24 such games a month before the relay stops.

⭐ **The one reading that settles which leg it is, in a real match, costs nothing:** both open
`spark-online.space/?debug=1` (the netStats overlay ships in production for exactly this, S182). At wave 8–9 the
brother reads **`snap rx`** and **`snap gap`**, the owner reads **`net out`**. Low `snap rx` with long gaps while
his fps stays up = network. `snap rx` near 10 with low fps = his PC.

## 2 · THE BOTTLENECKS, RANKED

1. **Snapshot size (network) — the primary cause, by the shape of the curve.** Grows 12× from wave 1 to wave 10,
   tracks "after five, worse after eight" exactly, ~90 % static bytes, at ~10 Mbit/s per joiner where an
   international P2P path (possibly relayed, possibly window-limited) plausibly cannot keep 10 Hz.
2. **Drawing the board on a weak PC (client render) — real, secondary, independent.** Frame cost grows with the
   board (~4–5 ms at wave 1 → ~17–21 ms at wave 8–10 on this strong machine, unthrottled), and it is drawing,
   not receiving. A PC 3–4× slower than this one sits at 15–25 fps on a late board regardless of the network.
3. **Main-thread signalling noise (Trystero Nostr announce + offer pool)** — observed, bursty, unmeasured in
   size; worth one focused measurement.
4. **Not the bottleneck:** joiner parse/apply (≤ 1 ms unthrottled, 2–6 ms at 4–6×, against a 100 ms budget),
   host CPU (~1–3 ms a tick; the owner never lags), creature count on a typical board.

## 3 · OPTIONS

Gains are from the §1 numbers. "Bump" = `PROTOCOL_VERSION` (the merge owner bumps; this tree never does).
My recommendation is A and B together. C is cheap insurance. D is what was asked for, and it does not
touch his lag.

| | option | what it does, plainly | expected gain (measured) | cost | risk | bump |
|---|---|---|---|---|---|---|
| **A** | **Compress the snapshot** | The host squeezes each snapshot with the browser's own DEFLATE (`CompressionStream`, no new packages) before sending; the joiner unsqueezes it. Trystero already carries binary. | **5.3×** fewer bytes at every wave: w10 119 → 22 KiB, ~9.8 → ~1.8 Mbit/s per joiner. Host +~1 ms per snapshot (once, not per peer); joiner +<1 ms. | ~1 day: `transport.ts` send/receive + a codec + tests (round trip, malformed input, size budget). | Low. Async decode must keep snapshot ORDER (the seq gate already handles a late one). | **Yes**: an old peer cannot read a compressed frame. |
| **B** | **Send what changed, not what exists (delta snapshots)** | Send the full board once (and as a keyframe every few seconds or on request), then each 100 ms only the entities that changed and the ids that vanished. CLAUDE.md names this as the structural fix. | w8–15: **~7×** alone (108–119 → 14–16 KiB); **with A ~25×** (→ ~4–5 KiB, ~0.35 Mbit/s). At w5 mid-fight (structures shaking): ~2.5× alone, ~8.6× with A. | **3–5 days**: per-family diff on the host, keyframe + resync (a joiner that misses a delta asks for a keyframe), the host-migration successor path, the four-sites rule for every family, tests including a long randomised "apply deltas == apply full" oracle. | Medium: a missed or misapplied delta means a joiner sees a wrong board until the next keyframe. The oracle test is what makes it safe. | **Yes.** |
| **C** | **Client auto-quality, VISIBLE** | When a joiner's frame time stays high (e.g. > 33 ms for 3 s), the game shows "Performance mode ON" and switches to a cheaper draw; the player can turn it off. Never silent. | ⚠ **The fx setting alone buys almost nothing**: at w5 4×, fx HIGH/LOW/legacy = 53/50/51 ms. The cost is drawing the BOARD (Pixi redraws every connector as vector lines each frame). A useful performance mode has to draw connectors more cheaply: cache static structure geometry and redraw only when a structure changes. That is the real lever, and it helps the host too. | fx-only toggle: ½ day (worth little). Cached structure drawing: 2–3 days in `src/render/structureRenderer.ts` and related files (outside this tree's boundary). | Low (render-only; must not change what the player sees in normal mode). | No (render-only). |
| **C2** | **Quiet the signalling during a match** | Trystero keeps re-announcing the room on 4 Nostr relays every 5.3 s and keeps a pool of pre-made peer offers, all match long, on the main thread. One profile window showed ~30 % of the joiner's main thread in its secp256k1 maths. | Unknown until measured on its own (bursty: another window showed ~15 ms). Measure first. | ½ day to measure; the fix touches reconnect discovery, which tree **T20** owns. | Medium: slower announces can slow a reconnect. | No. |
| **D** | **Dedicated host on workstation 2** (details in §3.3) | A headless browser on WS2 joins every room as the host, so every human is a joiner; when WS2 is off, today's P2P. | **For the brother: about nothing.** WS2 is in the same house, so it has the same uplink, sends the same snapshot size over the same path to Israel, and his PC pays the same drawing cost. It frees the owner's CPU, which is not a problem today. | **~1–1.5 weeks**: a seat-less host mode (today the host is always seat 0, `lobbyRoster.ts:44`), discovery + a SIGNED beacon, the fallback, WS2 setup and hardening. | Medium-high (a new host role through lobby, roster and succession). | **Yes.** |
| **E** | *(only if ever needed)* a real server in a datacentre | Same as D, but on a rented machine with a fast line (e.g. Frankfurt). | Fixes a weak home uplink and the 3–4-joiner fan-out. Does not fix his download or his drawing. | D's cost + hosting ~€5–20/month. | As D. | Yes. |

### 3.1 · Recommended order
1. **First, the free reading** (§1c): one match with `?debug=1`, numbers read at wave 8–9. It says whether his
   problem is mostly network (A/B fix it) or mostly his PC (C fixes it). Two minutes for the owner.
2. **A now** (one day, big gain, low risk), then **B** (the structural fix). With A, B makes snapshot size a
   non-issue at every wave, the pants endgame included.
3. **C (cached structure drawing)** if the reading shows his fps falling while snapshots arrive fine.
4. **Not D** for this problem. If the owner wants WS2 hosting for other reasons (games that survive the human
   host leaving, a consistent host), it can be built; §3.3 covers how and what it costs.

### 3.2 · Bump verdicts
- **This branch: NO BUMP.** The only source file added is `src/net/lagWaveMeasure.test.ts`, an opt-in test
  (skipped unless `SPARK_LAG_MEASURE=1`); `scripts/lag/*` is not in the bundle. Nothing either peer computes
  has changed.
- A, B and D each earn a bump (a peer on the old build cannot read the new frames or messages). C and C2 do not.

### 3.3 · Option D in full: the dedicated host on workstation 2

**What WS2 is** (read-only: Project Genesis `GENESIS_BLUEPRINT.md` §13.1 and
`.claude/audits/ws-orchestration/registry.json`): Oleg's machine, AMD Ryzen 9 **9950X3D** (Zen 5), "trusted
**same-room** compute", reached today through a Google Drive exchange folder. No hostname, IP or GPU is recorded.

**How it would work.**
- WS2 runs headless Chrome on the live site with a `?house=1` flag. The page skips drawing (saves CPU) and runs
  only the host loop. Reusing the real game page is much cheaper than a Node host, which would need WebRTC for
  Node (a new npm package, needs approval) and the host loop pulled out of `main.ts` (4 000+ lines that mix
  drawing and hosting).
- **New piece: a seat-less host.** Today the host is always seat 0 and a player. The house must host without
  holding a seat, and a human must still press "Begin" (a small new message from the lobby leader to the house).
- **Picking it, and falling back.** When a player presses HOST, the page listens for ~1.5 s on a fixed "house"
  room for a beacon. If the beacon is there with a valid signature and the same protocol, the house opens the
  room and the player joins as a joiner. If not, the player hosts over P2P exactly as today. If WS2 dies
  mid-match, the existing host migration promotes a human successor and the match goes on, so the fallback is
  already built.

**What it fixes and what it does not.** It moves the simulation off the owner's PC. It does **not** shrink the
snapshot, it does **not** change the internet line (same house), and it does **not** make the brother's PC draw
faster. The owner would become a joiner too and get the same snapshot stream (over the LAN, so no lag for him).

**SECURITY, in plain words (checked against the code, not assumed):**
- **No open doors on WS2.** Nothing on it listens to the internet: no web server, no port forwarding. The page
  makes outgoing connections to the public Nostr relays (signalling), and WebRTC connects peers via STUN/TURN.
  A peer can only reach it through the game's data channel.
- **What a malicious player can send it:** game messages only. Every message is JSON-parsed inside a try/catch
  (`transport.ts` `handleRawMessage`), a peer on the wrong protocol is latched out (`detectProtocolMismatch`),
  each peer is rate-limited (`intentRateLimiter.ts`), only allowlisted client intents are accepted, and every
  intent is re-stamped with the SENDER's own seat (`intentStamp.ts` `stampSenderSeat` / `stampOrReject`: a peer
  can only act as itself, a client sever is always forced to `cause: 'player'`, an unseated peer is rejected).
  The worst a hostile player can do is cheat within his own seat's legal moves or try to crash the page, so the
  page must be a disposable process that restarts.
- **Fake houses are the real danger.** The host decides the game for everyone. If anyone could post a "house
  is here" beacon, they could capture every lobby. So the beacon **must be signed** with a private key that
  exists **only on WS2**, and the game ships only the public key. (The room code is already the fingerprint of
  the host's key, `hostIdentity.ts`, so the room itself stays authenticated; the beacon is the new piece.)
- **No secrets in the game bundle**, only that public key. ⚠ Note: the TURN username/password are ALREADY in
  the public bundle by design (`vite.config.ts` defines `VITE_TURN_*`). They are relay credentials with a hard
  quota, not backend access, as `TURN_SETUP.md` already says.
- **WS2 itself:** a **separate Windows standard (non-admin) user** just for the house, with an empty Chrome
  profile and **no access** to Oleg's files, the Google Drive mount or the Genesis account; Windows Update and
  Chrome auto-update on; **no RDP or remote desktop exposed to the internet**; a scheduled task restarts the
  house process if it dies. Peers will see the house's public IP, which is the owner's house IP, already
  visible to them today in P2P.
- **The site stays on GitHub Pages.** Nothing about hosting the website changes.

## 4 · NOT DONE
- **The throttled joiner numbers only show direction** (shared machine; one full matrix discarded). A clean
  re-run on an idle machine: `npx playwright test -c scripts/lag/playwright.lag.config.ts --project=gpu`.
- **No real long-distance network measurement**: the data-channel-window hypothesis (§1c) is unverified.
- **No board past wave 16, and no human-sized board.** The pants-endgame figure (~170–200 KiB) is computed
  from the S194 measurement, not replayed.
- **Nothing was built.** No fix qualified as no-regret without a bump: every byte-saver changes the wire.

## 5 · ⭐ BUILT (S195 phase 2, owner N17): GRAPHICS TIERS THAT ACTUALLY DO SOMETHING

### 5a · Why the old switch did nothing for his brother
The Settings box "High-quality effects" did apply live (main.ts read it every frame). But all it did was
remove the glow (bloom) filter on the effects layer and the ripple/haze filters, plus two small cheaper draws
(`groundDecalRenderer`, the hub arc). Its own docblock said so: *"LOW keeps every new particle and drops only
the two filter passes."* On a built board those filters are a sliver of the frame. The frame is the
connector renderer re-drawing all ~500 connectors as vector lines every frame, and Pixi re-tessellating them.
(Wave-10 joiner profile, 4× throttle, inclusive: `structureRenderer.sync` 17 %, keystone telegraph 6 %,
damage numbers 4 %, goblins 3 %.) Ticking the box changed neither the look nor the lag, which is what he saw.

### 5b · What the three tiers do (Settings → Graphics: HIGH · LOW · MINIMAL)
- **HIGH** (default): today's game. A test proves it **byte-for-byte**: the HIGH draw calls equal a frozen copy of
  the pre-S195 connector code on randomised boards (`structureRenderer.tiers.test.ts`). R195-P1 is honoured:
  nothing was cut from HIGH.
- **LOW:** no glow or ripples, and connectors are drawn from a **cache**. The board is cut into 128 px squares,
  and a square is redrawn only when something in it changed. That includes moves (snapped to whole
  pixels), severs, stress, tower fade, foul, colour steals and fog. Animated connector shapes step at 10 Hz.
- **MINIMAL** ("potato"): LOW, plus the classic pre-S192 effects (the `?fx=legacy` look, no new particles),
  connector shapes held still, and the keystone telegraph drawn as static links (no travelling dot).
- **Live, remembered, obvious.** A labelled three-way choice with a one-line description. It applies on the
  next frame with no reload, and is stored per viewer. Someone who had switched the old box OFF lands on LOW.
- **The hint (⚠ MINE):** if a match spends 70 % of 5 s in frames slower than 40 ms, one line appears:
  "The game is running slowly. Try Graphics: LOW in Settings (top right)." It shows once per tier per page
  load and hides after 12 s. **It never switches by itself.**
- **Render-only.** No sim read, no wire field, no hash, so **no protocol bump**. Two players on different
  tiers play the identical match.

### 5c · Measured: the joiner replay at waves 5 and 10, RTX 4070 Ti machine, CPU throttle to emulate weak PCs
Joiner page without the DEV debug overlay; the same recorded snapshots at 10 Hz. Median CPU per frame. Two
full repetitions (B1 / B2), plus a back-to-back pair at wave 10 4×. ⚠ The machine was shared with other
worktrees the whole time, so single throttled rows swing by up to ~40 %. Read the repeated rows together.

| wave | throttle | HIGH frame ms (fps) | LOW frame ms (fps) | MINIMAL frame ms (fps) | MINIMAL vs HIGH |
|---:|---:|---|---|---|---:|
| 5 | 1× | 11.0 / 7.1 | 8.9 / 9.7 | **5.9 / 5.8** | −46 % / −18 % |
| 5 | 4× | 60.7 (15) / 43.3 (20) | 61.2 (12) / 60.5 (15) | **46.2 (20) / 46.8 (15)** | −24 % / +8 % |
| 5 | 6× | 66.5 (6.7) / 71.5 (6.7) | 75.1 / 71.5 | **61.6 (10) / 56.4 (15)** | −7 % / −21 % |
| 10 | 1× | 11.0 / 8.1 | 5.6 / 6.5 | **4.8 / 4.9** | −56 % / −40 % |
| 10 | 4× | 62.5 (12) / 52.8 (15) | 43.7 (20) / 52.7 (15) | **27.9 (30) / 42.0 (20)** | **−55 % / −20 %** |
| 10 | 4× back-to-back pair | 84.7 (8.6) · 90.8 (10) | — | **49.2 (20) · 42.9 (20)** | **−42 % · −53 %** |
| 10 | 6× | 68.3 (8.6) / 59.6 (10) | 58.4 / 78.8 | **51.9 (15) / 57.9 (12)** | −24 % / −3 % |

**Board alone (snapshots stopped), wave 10 4×:** HIGH 56.5 / 47.5 / 90.6 / 82.7 ms → MINIMAL 16.5 / 19.8 / 22.7 /
19.5 ms, **−58 % to −76 %**, with fps going from 10–20 to 30–60.

**Acceptance (≥ 40 % less at wave 10, 4×):** met in 3 of the 4 wave-10 4× measurements (−55, −42, −53), missed
in one (−20, run B2, where HIGH itself came in fast at 52.8). Medians across all four: HIGH ~73.6 → MINIMAL ~42.5 ms, **−42 %**, and fps roughly doubles (10–15 → 20–30). With snapshots arriving, the saving is
smaller than on the idle board. Moving units and shaking structures keep invalidating ~10 % of MINIMAL's buckets,
and receiving and applying a snapshot (2–3 ms at 4×) is outside what a graphics tier can remove.

**LOW** helps clearly unthrottled (wave 10: 11.0 → 5.6 ms) but little under heavy throttle (wave 10 4×, after
LOW was moved to whole-pixel snapping: HIGH 83.0 / 80.3 → LOW 70.2 / 62.3 ms). Its animated connectors step every
6 ticks, so a 12-fps frame crosses a step every frame and ~53 % of buckets redraw. That is by design: LOW
keeps the animation, and MINIMAL is the tier for slow PCs.

### 5d · What is still on a MINIMAL frame (the next levers, if more is wanted)
From the MINIMAL profile (wave 10, 4×): the connector cache when things move (~9–13 %), damage numbers
`syncStructures`/`track` (~5 %), the goblin puppets (~4 %), health bars (~3 %), and `tickGameState`'s
complexity/territory maths (~3 %, a sim read, so not a render tier's to cut). Then Pixi's own render pass.
Caching the health bars and the goblin puppet would be the next render-only step.
