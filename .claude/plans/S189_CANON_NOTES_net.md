# S189/S191 — canon notes from `s189/net` (for the merge owner; this branch does not edit `SPARK_CANON.md`)

Each item names the constant or fixture it comes from, so it can go into the canon with its
assertion in the same commit (the canon rule). ⭐ REWRITTEN S191 (audit NETFR-5): the S189 version of the
reconnect section said a 1v1 survivor "never claims the host seat" — that was the first cut, REVERSED by
the S190 fix round (FR-4). The rules below are the ones the code runs at `s189/net` S191.

## §6 THE WIRE — the S182 bandwidth row UNDER-COUNTS A REAL BOARD

Canon §6 today: *"MEASURED, S182 — the brother's wave-5 board (250 primitives / 260 bonds / 120
creatures) … 84.0 KiB … 6.88 Mbit/s"*.

- ⚠ That board came from a FIXTURE with ~1.0 bond per primitive. A REAL wave-5 board, played by the
  shipped bots through `runHostTick`, carries **~2.2 bonds per primitive** (towers are densely
  bonded): 259 prims / 574 bonds (pass A), 236 / 517 (pass B).
- **Measured S189** (`src/net/c5WaveFiveMeasure.test.ts`, opt-in `SPARK_C5_MEASURE=1`; the wire
  string is built exactly as `NetTransport.send` builds it: `JSON.stringify(stripWirePrevPos(msg),
  wireNumberReplacer)`; the renderer's per-frame `world.effects` wipe is modelled):

| board (wave-5 FIGHT) | snapshot | host uplink per peer at `NET_SNAPSHOT_HZ` = 10 |
|---|---:|---:|
| pass A — 259 prims · 574 bonds · ≤17 creatures | 106–109 KiB | ~8.8 Mbit/s |
| pass C — 236 prims · 516 bonds · 105–123 creatures (the brother's 120, all draft-buffed) | **112–114 KiB** | **~9.3 Mbit/s** |

  Breakdown at pass A: primitives ~52 KiB (~200 B each), bonds ~50 KiB (~88 B each); creatures
  ~157 B (BUILD) / ~174–181 B (FIGHT) each.
- ⇒ the canon's "6.88 Mbit/s" should read **~9.3 Mbit/s per peer on a real board** (arithmetic:
  113 KiB × 1024 × 8 × 10 Hz = 9.26 Mbit/s). Suggested assertion: build the pass-C board in a test
  and pin `wireJson(board).length` to a band, the `netWireSize.test.ts` pattern — NOT the literal.
- ⭐ `Creature.maxEhp` (S187) is emitted on EVERY draft-buffed creature, damaged or not — so the
  "emit only when damaged" line in §6 is true of `ehp` and NOT of `maxEhp`. Cost measured:
  **11.2 B per buffed creature**; 1.2–1.36 KiB/snapshot at 120 creatures = **1.1 %** of the wire.
  Source: `save.ts` (`...(c.maxEhp !== undefined ? { maxEhp: c.maxEhp } : {})`).

## §6 THE WIRE — snapshots SKIP rather than queue when the uplink cannot carry them (S189)

- `NetTransport.send` (`src/net/transport.ts`, `sendSnapshotOn` / `transmitSnapshot`): at most ONE
  NETSNAPSHOT in flight **per PEER** (S190 FR-2 — it was per strategy, and one slow client set everyone's
  rate) and at most one waiting — the newest ("latest wins"). Each snapshot is a targeted send
  (`{ target: peerId }`). A departed peer's slot is dropped in `onPeerLeave`; a waiting snapshot never goes
  to a departed peer, a replaced handle, or a fresh slot after a fast rejoin (S191 NETFR-6 pins the
  lifecycle through the real `onPeerLeave`/`onPeerJoin`). Control traffic never enters the gate. No wire
  field, no protocol bump: it changes WHEN snapshots are sent, never what they contain.
- Why (reproduced through Trystero's REAL action-wire, `src/net/snapshotBackpressure.test.ts`): the
  old fire-and-forget send at 113 KiB × 10 Hz over a 5 Mbit/s uplink delivered 196 of 900 whole
  snapshots, worst latency 47 s, and a 26 s silence; at 2 Mbit/s, 8 of 900 and a 67 s silence. With
  the gate at 5 Mbit/s: 320 of 600 delivered (the link's capacity), worst latency 405 ms, max gap
  220 ms, channel buffer ≤ 67 KiB. At 20 Mbit/s nothing is skipped. Per peer: a 20 Mbit/s client
  beside a stalled one got 3/100 snapshots before FR-2, 100/100 after.
- Consequence to state in the canon: **the delivered snapshot rate per peer is min(10 Hz, that peer's
  share of the uplink ÷ snapshot size)**, and a snapshot's latency is about one transmit time — never a
  backlog.

## §6 THE WIRE — a per-match id and the host's phase (S191, NETFR-1/2) — rides deploy #5's 52

Four ADDITIVE-OPTIONAL fields, each validated in `parseNetMessage` (present-but-malformed rejects the whole
message, the file's standing posture):

| message | field | validation |
|---|---|---|
| `START_GAME_SIGNAL` | `matchId?: string` | non-empty, ≤ `MATCH_ID_MAX_LEN` (64) |
| `LOBBY_PRESENCE` | `phase?: 'LOBBY' \| 'MATCH'` | exactly one of the two literals |
| `LOBBY_PRESENCE` | `matchId?: string` | as above |
| `NETSNAPSHOT` | `matchId?: string` | as above; envelope-only like `epoch` — never in NetSnapshot/save/hash |

- The id is `mintMatchId()` (`hostHandlers.ts`): `` `${selfId}.${n}` ``, `n` = Begins on this page load. No
  `Math.random`, no wall clock. Held as `NetSession.matchId` (host: at Begin; client: off the Begin;
  kept across an in-page reconnect and by a migration successor; cleared by `teardownNet`). The phase is
  `hostPhaseOf(world.gameState)` at send time (LOBBY/TITLE → LOBBY; PLAYING/WIN/POSTGAME → MATCH).
- What a client does with them (`classifyHostMessage`, `reconnectPolicy.ts`), ONLY while a rejoin is
  PENDING (an attempt fired, no snapshot accepted since — `isRejoinPending`): a snapshot carrying another
  id is not applied and ends the rejoin as `'new-match'`; only OUR id is released to `ClientSync.receive`;
  presence in phase LOBBY is `'lobby'` at once; presence in phase MATCH with another id is `'new-match'`.
  Fields ABSENT → the S189 seq-regression check, and never a lobby verdict (a frozen or hidden host is left
  to D4 or its thaw). Either verdict → `leaveToTitle()` + *"The host started a new game — this match is over."*
- Bump verdict: none owed BY ITSELF (an id-less peer falls back to today's behaviour; nothing is hashed or
  simulated). Listed so the 52 docblock is complete.
- Suggested assertion: pin `MATCH_ID_MAX_LEN` and the two phase literals to `protocol.ts`.

## §9 / host migration — what a starved uplink could do before S189 (for the C4 record)

- A silence ≥ `HOST_STARVATION_MS` (6000, `succession.ts`) + `RECONNECT_GRACE_MS` (15 000,
  `reconnectPolicy.ts`) + the claim ladder makes a warranted CLIENT claim the host seat while the real
  host is still connected. The pre-S189 backlog produced silences of 26 s (5 Mbit/s) and 67 s
  (2 Mbit/s) in the reproduction, i.e. past that trigger. That is D4's takeover firing on a host that was
  never frozen — it does NOT by itself show the CONNECTION LOST overlay, which needs a transport-level
  peer loss (`peerCount() === 0 || hostLost`). The per-peer gate above removes the backlog.

## §9 / reconnect + migration — the rules as the code runs them (S189 → S191)

**TWO LOSSES, TWO RULES** (`stepMigrationClaim`, `net/reconnectPolicy.ts`):

- ⭐ **D4 takes over a SILENT-BUT-CONNECTED host in ANY seat count, 1v1 included** — unchanged since S124:
  the host is on our transport but starved (`HOST_STARVATION_MS` 6 s, counted from the LATER of the last
  accepted snapshot and the host's (re)appearance on our transport) → the warranted client claims at
  starvation + `RECONNECT_GRACE_MS` + its ladder rung (`CLAIM_LADDER_MS` 1500 × rank); the thawed host
  rejoins as a client (S125 v2). ⛔ The S189 first cut blocked this for a 1v1 — reversed in S190 (FR-4).
- ⭐ **The survivor gate applies ONLY when the host has left OUR TRANSPORT.** Then a claim needs a survivor
  other than the host (`hasSurvivorToHostFor`); a 1v1 client never claims — it reconnects. ⭐ S191
  (NETFR-3): the claim clock itself starts only on the first frame a survivor is visible WITHOUT the host
  ("host gone, nobody else here" is no episode), so a reconnect that lands another client's leg before the
  host's is not an instant claim. The MIGRATING overlay window runs from that clock when it began later
  than the loss (`planConnectionFrame`, `claimClockSinceMs`; never shorter than before).
  ⚠ OPEN — owner question, not built: this narrows, does not close, the case where the other client's leg
  lands promptly (~L+7 s) and the host's is held by Trystero's 23.3 s answering TTL (~L+26–29 s) — the
  claim then fires at ~L+22 s + rung (pinned as the RESIDUAL test in `reconnectPolicy.test.ts`).
- **The client's reconnect loop** (`planConnectionFrame`): on a transport loss it opens the grace
  (`RECONNECT_GRACE_MS` 15 000, S82) and tries at `RECONNECT_FIRST_RETRY_DELAY_MS` (1 000, S82), then every
  **`RECONNECT_RETRY_MS` = 35 000** (S192 C4 step 8, MEASURED — was 8 000 = `JOIN_STALL_WARN_MS` in S189, 4 000 before that): a teardown inside Trystero's 23.3 s answering/post-answer TTL can only restart it; left alone the first attempt recovers in-room (hard-blip e2e: 8 s cadence 2/9 inside the grace, 35 s cadence 10/10 recovered, 7/10 inside).
  It keeps trying PAST the grace, behind the terminal overlay (which clears itself when a peer returns),
  and **stops `RECONNECT_GIVE_UP_MS` (180 000) after the loss began** — the overlay stays (Return to Title).
  A host never retries; the MIGRATION case (host gone, survivors connected) never tears the mesh down.
- `NetTransport.connect()` never joins a room code whose previous `leave()` is still in flight (waits up to
  `PENDING_LEAVE_CAP_MS` 2 000), a room is left once, and a still-leaving room is never adopted — because
  Trystero's `joinRoom` returns the room still registered under that id.
- A rejoin must PROVE it reached the same match (S189 FR-1, made positive in S191 — see the §6 block above).
- Suggested assertions: pin `RECONNECT_GRACE_MS`, `RECONNECT_FIRST_RETRY_DELAY_MS`, `RECONNECT_RETRY_MS`,
  `RECONNECT_GIVE_UP_MS` to `reconnectPolicy.ts`, and `RECONNECT_RETRY_MS ≥ 23333 + 5333 + 6300` (S192: Trystero TTL + announce + fresh join)
  — `reconnectPolicy.test.ts` already asserts the latter.

## EVERY CONSTANT ON THIS BRANCH THAT IS MINE, NOT THE OWNER'S (each says so at the constant)

| constant | value | file | why this number |
|---|---:|---|---|
| `RECONNECT_RETRY_MS` | 35 000 (S192; was 8 000) | `net/reconnectPolicy.ts` | ⚠ MINE: Trystero TTL 23 333 + announce 5 333 + fresh join 6 300, rounded up; pinned against the library constants in `reconnectPolicy.test.ts` |
| `RECONNECT_GIVE_UP_MS` | 180 000 | `net/reconnectPolicy.ts` | long past any blip/sleep/relay hiccup, short of a host that has moved on |
| `HOST_SEQ_REGRESSION_SLACK` | 50 | `net/reconnectPolicy.ts` | ~5 s of snapshots, far past any reorder; now only the id-less FALLBACK |
| ~~`HOST_LOBBY_CONFIRM_MS`~~ | ~~5 000~~ | — | **DELETED S191** — a verdict from silence was NETFR-1 |
| `MATCH_ID_MAX_LEN` | 64 | `net/protocol.ts` | parse hygiene; a real id is ~22 characters |
| `PENDING_LEAVE_CAP_MS` | 2 000 | `net/transport.ts` | a normal leave settles in ~100 ms; must not hold a rejoin hostage |
| `QM_AGE_MARGIN_MS` | 500 | `net/quickmatch.ts` | clock-rate drift + the `ageMs` floor; width of the near-tie band |
| `QM_MAX_AGE_MS` | 86 400 000 | `net/quickmatch.ts` | parse hygiene: an age beyond a day is refused |
| `QM_MAX_HOLDS` | 16 | `net/quickmatch.ts` | parse + send cap on `holds` (~15 B each) |

Not mine (inherited, unchanged): `RECONNECT_GRACE_MS` 15 000 and `RECONNECT_FIRST_RETRY_DELAY_MS` 1 000
(S82), `HOST_STARVATION_MS` 6 000 and `CLAIM_LADDER_MS` 1 500 (S124), the MIGRATING extra
`CLAIM_LADDER_MS × MAX_PLAYERS + 5 000` (S124). Every C5 measurement above is mine and reproducible with
the committed instrument.
