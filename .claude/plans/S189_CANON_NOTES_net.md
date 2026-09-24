# S189 — canon notes from `s189/net` (for the merge owner; this branch does not edit `SPARK_CANON.md`)

Each item names the constant or fixture it comes from, so it can go into the canon with its
assertion in the same commit (the canon rule).

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
  Source: `save.ts:2276` (`...(c.maxEhp !== undefined ? { maxEhp: c.maxEhp } : {})`).

## §6 THE WIRE — snapshots now SKIP rather than queue when the uplink cannot carry them (S189)

- `NetTransport.send` (`src/net/transport.ts`, `sendSnapshotOn` / `transmitSnapshot`): at most ONE
  NETSNAPSHOT in flight per strategy and at most one waiting — the newest ("latest wins"). Control
  traffic never enters the gate. No wire field, no protocol bump: it changes WHEN snapshots are sent,
  never what they contain; the client's seq gate already treats a gap as normal.
- Why (reproduced through Trystero's REAL action-wire, `src/net/snapshotBackpressure.test.ts`): the
  old fire-and-forget send at 113 KiB × 10 Hz over a 5 Mbit/s uplink delivered 196 of 900 whole
  snapshots, worst latency 47 s, and a 26 s silence; at 2 Mbit/s, 8 of 900 and a 67 s silence. With
  the gate at 5 Mbit/s: 320 of 600 delivered (the link's capacity), worst latency 405 ms, max gap
  220 ms, channel buffer ≤ 67 KiB. At 20 Mbit/s nothing is skipped.
- Consequence to state in the canon: **the delivered snapshot rate is min(10 Hz, uplink ÷ snapshot
  size)**, and a snapshot's latency is about one transmit time — never a backlog.

## §9 / host migration — what a starved uplink could do before S189 (for the C4 record)

- A silence ≥ `HOST_STARVATION_MS` (6000, `succession.ts:39`) + `RECONNECT_GRACE_MS` (15 000,
  `main.ts:2460`) + the claim ladder makes a warranted CLIENT claim the host seat while the real
  host is still connected. The pre-S189 backlog produced silences of 26 s (5 Mbit/s) and 67 s
  (2 Mbit/s) in the reproduction, i.e. past that trigger. That ends in a MIGRATION TAKEOVER
  (a split-brain, since the real host has no partition evidence and refuses the claim) — it does
  NOT by itself show the CONNECTION LOST overlay, which needs a transport-level peer loss
  (`main.ts:3636-3643`: `peerCount() === 0 || hostLost`).
