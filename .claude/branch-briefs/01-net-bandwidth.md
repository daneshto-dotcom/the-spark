# BRANCH 1 — `s182/net-bandwidth`

## THE MISSION

**The owner's brother could not play.** Wave 5, a board full of his towers, and his units moved once
every ~5 seconds while the owner — who was hosting — saw everything perfectly. This is the single
highest-value item in the S182 list.

> *"It was lagging a lot. We were in wave five and he could not see his characters moving at all. He
> already built a lot of towers. I didn't build much towers and I was fine. His game was pretty much
> stuck. He showed me a video and nothing was moving, barely. Every five seconds the characters
> moved. I saw it perfectly fine."*

## ⭐ THE DIAGNOSIS — VERIFIED, NOT GUESSED

**The peer is not slow. It is STARVED.** "Every five seconds" is ~0.2 Hz of *discrete jumps*, which
is the signature of snapshot ARRIVAL RATE, not frame rate. The code makes the distinction mechanical:

- A joiner **runs no simulation**. `src/main.ts:2570-2583` is its entire tick:
  `controls.applyPerSubstep()` + `world.tick++` + `tickGameState`. 100% of entity motion comes from
  `applyNetSnapshot`.
- Between arrivals `ClientSync.pickBracket` (`src/net/sync.ts:158`) clamps to the newest buffered
  snapshot with `t=0`, so `interpolatePositions` writes that snapshot's positions unchanged. **The
  board freezes, then snaps on the next arrival.**

### Why arrivals collapse

The host sends a **full, uncompressed, undeltaed world state, as JSON, at 10 Hz**
(`src/main.ts:3038` → `netSnapshot(world)` at `src/state/save.ts:1172`).

⛔ **AND IT SENDS IT TWICE.** `src/net/transport.ts:559-566` serialises once and then sends the whole
payload **per active strategy**. `src/net/iceConfig.ts:92-96` has `nostr: true, torrent: true` — two
independent RTCPeerConnections **to the same machine**. Every byte goes out twice; the joiner decodes
and `JSON.parse`s it twice and discards the second copy on the seq gate (`sync.ts:127`).

### The measurement

Per-entity cost, calibrated against this repo's own S122 figure (49,684 B at 119 prims / 104 bonds /
48 creatures) and reproducing it to within ~2%:

| | bytes |
|---|---|
| primitive | **257** |
| bond | **104** |
| creature | **155** |

Positions ride as **full-precision doubles** (`pos` + `prevPos` = 4 doubles ≈ 72 chars), and
`prevPos` is **explicitly dead on the client** — `creatureRenderer.ts:505`, `chewerRenderer.ts:22`
and `voltkinFrames.ts:286` all say so.

| board | prims | bonds | creatures | per snapshot | upload | doubled |
|---|---:|---:|---:|---:|---:|---:|
| S122 baseline | 119 | 104 | 48 | 48 KiB | 3.9 Mbit/s | 7.8 |
| **the brother, wave 5** | **250** | **260** | **120** | **107 KiB** | **8.8 Mbit/s** | **17.6** |
| heavy TD board | 350 | 380 | 200 | 157 KiB | 12.8 Mbit/s | 25.7 |

⚠ **MAX_PLAYERS IS 4** (`src/constants.ts:87`, owner ruling S147 R41). Several comments in the tree
still say "6-seat" — they are stale leftovers and misled this session once already. Do not size
anything against 6.

### It was predicted and never acted on

`src/net/transport.ts:550-554`, in the tree today:
> *"the 10 Hz snapshot cadence is a CAP, not a delivered rate: this repo has measured it collapsing
> to **2.2 Hz** under a TD-heavy sim, below what the 150 ms render-delay buffer needs."*

The research existed. The action never followed. **That is what this branch is for.**

---

## THE WORK — A LADDER. DO NOT SKIP TO THE BOTTOM.

### STEP 0 — INSTRUMENT FIRST (required, ships first)

One reading falsifies or confirms everything above in a single playtest. **Guessing wrong here costs
the whole branch.**

- A **byte counter at the send site** (`transport.ts` send path): bytes/sec out, per strategy.
- **Accepted-snapshots/sec** and **inter-arrival ms** on the joiner (`sync.ts` accept path).
- Surface both in the existing stats overlay (`src/render/statsOverlay.ts`).
- Gate it behind the existing dev/debug seam — it must not cost anything in a normal build.

**Ship Step 0 as its own commit** so the owner can run one match with his brother and read the truth.

### LEVER 1 — STOP SENDING EVERY SNAPSHOT TWICE ⛔ **GATE — SEE BELOW**

`transport.ts:561` loops every ready strategy. Route **high-rate `NETSNAPSHOT` traffic over ONE
chosen strategy** (prefer nostr; fail over to torrent if nostr loses the peer), while `HELLO`,
`START_GAME_SIGNAL`, `LOBBY_*`, `INTENT` and `MIGRATION_CLAIM` keep the existing redundant broadcast —
those are rare, small, and are exactly what multi-strategy exists to protect.

**−50% of all bytes. No wire-format change. No `PROTOCOL_VERSION` bump. ~15 lines.**

> ⛔ **GATE — OWNER APPROVAL REQUIRED BEFORE YOU SHIP THIS.**
> It trades connectivity redundancy he deliberately paid for in S157/S162. `iceConfig.ts:101` records
> him unable to play with his brother in Israel because every TURN URL errored and ICE gathered
> `relay: 0`. If he has not said yes, **build it behind a flag, default OFF, and report.**

### LEVER 2 — QUANTISE AND TRIM THE WIRE

Round `pos` / `prevPos` / `restLength` to 2 decimals, and **drop `prevPos` from the wire form**.

Measured: primitive **257 → 208 B** on rounding alone, **→ ~170 B** (−34%) when `prevPos` goes;
bond **104 → 88 B**. Combined with Lever 1 that is **~3× fewer bytes** for zero gameplay change.

⛔ **IT MUST NOT TOUCH `serializePrimitive` / `serializeBond` / `snapshot()`.** Those feed the disk
save AND `workerSim.restore()` (main.ts hands `snapshot(world)` to the worker) AND `save.replay`'s
byte-identity gate. Quantising there perturbs the worker mirror's Verlet and breaks `hashWorldState`.
**The change belongs in `netSnapshot()`'s post-trim block beside `trimMirrorCreature`
(`save.ts:1196-1214`)** — the same place, for the same reason, as the S133/S134 lesson recorded there.

⚠ Dropping `prevPos` from the wire costs a promoted successor its Verlet velocity on host migration.
`save.ts:1250` already states the successor's world is not equal to its predecessor's (`prevPos`,
`targetPos`, `spawnedAtTick` never travel for creatures) — so this **widens an accepted gap rather
than opening a new one**. State it in the commit; do not slip it in.

### LEVER 3 — DELTA ENCODING — ⛔ **NOT ON THIS BRANCH**

Send only changed entities keyed on `snapshotSeq`, with a periodic full keyframe. This is the real
structural fix — it makes cost scale with **how much MOVES** instead of **how much EXISTS**, so a
built base becomes free to transmit. It is LARGE and deserves its own dedicated branch.
**Do not attempt it here.**

---

## ⛔ WHAT THIS BRANCH MUST NOT DO

**Do NOT add a cap on race units or chewers.** The owner ruled that explicitly (R123/R124 —
*"they are supposed to be a horde"*), and `W1C_A0_FINDINGS.md:180-190` records the direction verbatim.
`CHEWER_MAX_GLOBAL` / `RACE_UNIT_MAX_GLOBAL` are `10_000` sentinels, not dials. Capping the horde
would be fixing the symptom by deleting the game.

## TESTS OWED

- Wire-size assertions for the trimmed `netSnapshot` form. ⚠ The existing one in
  `save.replay.test.ts` is **FIXTURE-scoped and not a runtime budget** — the tree says so itself.
  Add a per-entity byte assertion derived from the constants, so a future field addition shows up.
- A **source-text tripwire** that `serializePrimitive` / `serializeBond` / `snapshot()` are NOT
  touched by the quantiser — the failure mode is unreached code.
- Round-trip: quantised `netSnapshot` → `applySnapshot` → positions within tolerance.
- A test that `NETSNAPSHOT` goes out on exactly one strategy while `HELLO` goes out on all.
- `hashWorldState` unchanged by the quantiser (it must never see the wire form).

## GATES

`typecheck` · `vitest` · `build` · **`e2e:gating` (this touches the sim path — required)** ·
`npm run probe-relays` if you change strategy routing.

## FILE BOUNDARY

**Yours:** `src/net/transport.ts` · `src/net/iceConfig.ts` · `src/net/sync.ts` ·
`src/render/statsOverlay.ts` · `src/state/save.ts` **— `netSnapshot()` ONLY**

⚠ `src/state/save.ts` is shared with branch 4, which owns the `applySnapshot` wipe sites. Stay in
`netSnapshot`. ⚠ `src/main.ts` is shared with branches 2 and 5 — append only, never reorder imports.

## REPORT BACK

The Step 0 numbers from a real match if the owner runs one; the measured before/after byte counts;
whether Lever 1 shipped or is flagged off pending his approval; and the honest remaining exposure
(Levers 1+2 buy ~3×, which covers wave 5 in a 1v1 — they do **not** make it unconditionally safe).
