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

JOINER_TABLE_PLACEHOLDER

⚠ **Read the throttled rows as direction, not as a benchmark.** This machine was shared with seven other
worktrees running test suites during the run (a plain `grep` over `src/render` timed out at 120 s once), and the
CPU throttle compounds that load. Two runs of the same configuration disagreed by up to 3× on fps. The
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

OPTIONS_PLACEHOLDER
