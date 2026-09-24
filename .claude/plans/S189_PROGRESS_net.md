**STATUS: IN-PROGRESS**

# S189 — `s189/net` progress (worktree agent, brief = PDR §5.1: C4 disconnect, C5 lag at wave 5, C6 quickmatch seat)

Branch `s189/net`, based at `15035b9` (live deploy #2, PROTOCOL_VERSION 50). Commits are LOCAL, never pushed.
The merge owner resumes from this file if this agent is cut off.

## Steps

| # | step | state | commit |
|---|---|---|---|
| 0 | progress skeleton | done | d4e9ae7 |
| 1 | e2e webServer `--strictPort` + its test | done | 68b04a7 |
| 2 | C6 quickmatch seat — find the per-machine bias, fix, two-seeker test in both arrival orders | done | 2bbcd20 |
| 3a | C5 — MEASURE (instrument `src/net/c5WaveFiveMeasure.test.ts`, opt-in `SPARK_C5_MEASURE=1`) | done | (this commit) |
| 3b | C5 — the in-boundary fix the numbers name: snapshot send backpressure (latest-wins) + a reproduction through real NetTransport + real Trystero action-wire | next | |
| 4 | C4 disconnect — own diagnosis, reproduction test BEFORE any fix | pending | |

## In flight

- nothing yet

## C6 — the per-machine bias, named (verified by hand)

- The quickmatch room code IS the host identity fingerprint, minted ONCE PER PAGE LOAD:
  `src/main.ts:280` `generateHostIdentity()` at boot; `src/net/hostHandlers.ts:212` hosts
  `deps.hostIdentity.roomCode`; `src/net/hostIdentity.ts:21-23` documents "one identity per PAGE LOAD".
- The late seeker's promote clock (2–3.5 s from ITS click, `qmPromoteDelayMs`) usually beats the discovery
  handshake (S182, pinned in `quickmatch.test.ts`), so both become peerless hosts and the demote arm
  (`decideQuickmatch`, old `quickmatch.ts:99-105`) decides — the LARGER code yields.
- ⇒ For one pair of open tabs the verdict is the SAME on every attempt. The owner's tab held the larger code:
  demoted whenever both promoted — the swap when he was first, the "correct" P2 when he was second. The
  brother (smaller code) always ended host. "Only this workstation" = per PAGE LOAD, not per machine; a
  reload re-rolls it 50/50. Not the relay set, not beacon reach, not a persisted key (no localStorage in net/).
- Secondary (fixed too): the beacon was a 2 s interval only (no announce-on-join), and `heard` never forgot a
  host that left the discovery room.

## C5 — MEASURED (all numbers MINE, Node 24 on this desktop while sibling suites ran; reproduce with the instrument)

Real 4-seat bots match (seat 0 idle, bots HARD/IMBA/IMBA) through `runHostTick`, to the end of wave 5.
The renderer's per-frame `world.effects` wipe is modelled (without it the wire showed 22.8 KiB of
"effects" at wave 5 that production never sends — first run, corrected).

| pass | board at wave-5 FIGHT | host tick mean / p95 / max | snapshot on the wire |
|---|---|---|---|
| A default draft (bots take racial) | 259 prims · 574 bonds · ≤17 creatures | 1.94 / 2.88 / 6.69 ms | 106–109 KiB (prims 52 K · bonds 50 K) |
| B every seat drafts HP | 236 · 517 · ≤16 | 1.31 / 1.99 / 3.86 ms | 95–99 KiB |
| C all-HP + the brother's 120 creatures held | 236 · 516 · 105–123 | **8.22 / 12.50 / 95.8 ms** | **112–114 KiB** |

- Growth by wave (pass A, host mean ms): w1 BUILD 0.05 · w2 FIGHT 0.32 · w3 FIGHT 0.73 · w4 FIGHT 1.13 · w5 FIGHT 1.94.
- ⭐ WHAT DOMINATES AT WAVE 5 (V8 CPU profile, pass C, wave-5 FIGHT): `structureTargets` 69 % inclusive →
  `findNearestBondTarget` 65 % (scans EVERY bond per creature per tick, ~4 Map.get + a midpoint alloc per
  bond) of which `spreadEnemyTarget` 42 % self (TWO more full bond scans per creature per tick);
  `computeTerritorialInfluence` 6.9 %; `solveBonds` 3.2 %. At ≤17 creatures (pass A) territory is the
  top self-time (23.6 %: players × enemy-bonds × own-prims per tick) and creature targeting ~30 %.
  ⇒ the cost is O(creatures × bonds) per tick, and BOTH grow with the wave. The main loop runs ≤3
  ticks per frame: 3 × 8.2 ms = ~25 ms mean, 3 × 12.5 = ~37 ms p95 per frame for the sim alone on THIS
  desktop — the sim cannot hold 60 Hz and the game slows. That is the "lag at about wave five".
- ⛔ OUTSIDE MY FILE BOUNDARY (`src/state/creatures/creatureAI.ts`, `src/state/territory.ts`; s189/units
  also works in creature AI) — REPORTED, NOT EDITED. Fix shape (pure perf, identical outputs): build the
  enemy-bond candidate list ONCE per tick per owner colour (midpoints, owner seat, strict/mixed flag),
  then each creature does ONE pass over a flat array with the SAME (distSq, bondId) tie-break;
  `spreadEnemyTarget`'s victim set is per colour, not per creature. Expected: ~3 scans × ~4 Map.get per
  bond per creature → 1 flat scan per creature (≥5× on that 65 %). A spatial grid is the next step.
- WIRE: the canon §6 row "84.0 KiB at 250 prims / 260 bonds / 120 creatures" UNDER-COUNTS a real board:
  a real wave-5 board carries ~2.2 bonds per prim (the S182 fixture ~1.0). Real: **~113 KiB =
  9.3 Mbit/s host uplink per peer at 10 Hz** (canon says 6.88). → canon notes.
- maxEhp (the brief's question): YES it defeats "emit only when damaged" for maxEhp — every buffed creature
  carries it, damaged or not — but it costs **11.2 B per buffed creature** (`,"maxEhp":NN`), `ehp` 8 B only
  when damaged. At 120 buffed creatures: 1.2–1.36 KiB/snapshot = **1.1 %** of the wire, +0.1 Mbit/s. Not
  the lag; not worth a protocol change. `atkFifths` (draft-atk, wave 11) will cost the same class (~13 B).
- Per creature on the wire: ~157 B (BUILD) · ~174–181 B (FIGHT). Host build+stringify 1.0–1.5 ms, client
  parse+apply 0.8–1.3 ms at wave 5 — neither dominates.
- DraftOverlay (coordinator lead): NOT the owner's wave-5 cause — the panel renders only while the LOCAL
  seat still owes a pick (`draftOverlay.ts:503`), i.e. seconds at waves 1/6/11 in a human match, and
  hidden at wave 5. In the e2e soak lane seat 0 never picks, so the panel is up for the whole 5400-tick
  BUILD and re-clears 4 Graphics + 2 stencil masks every frame (`:526-589`) — consistent with the CI
  fixed-per-frame signature. Browser frame time NOT measured (needs a GPU path; Node cannot tessellate).
  Outside my boundary — REPORTED.

## Decisions

- Step 1: `--strictPort` goes on the webServer COMMAND only; `vite.config.ts` keeps `strictPort: false`
  (for plain `npm run dev` drifting is a convenience). CLI flag beats the config — proven by the REACH
  test, not assumed.
- Step 1 finding (MINE, measured): a `0.0.0.0` occupant does NOT block vite `--host` on Windows (vite binds
  `::` and started on the "occupied" port). The orphan that bites is one bound the same way vite binds;
  the test's occupant listens with no host argument for that reason.
- C6 fix shape: beacons carry `ageMs` (sender's lobby age on its OWN monotonic clock — no clock sync) and
  `holds` (codes it has judged it outranks). Election: the ELDER keeps the room; judgments are STICKY; a
  mutual hold (near-tie, |gap| ≲ margin+transit) is broken by the code (larger yields once it SEES the
  other's hold). Proof in `decideQuickmatch`'s docblock: D = age difference is constant and every estimate
  is an under-estimate, so no pair can both yield, whatever time each evaluates. Seekers join the eldest
  (then smallest code) so they converge where a young host is about to yield. Announce-on-join added
  (`room.onPeerJoin` → targeted beacon). `heard` entries dropped on discovery `onPeerLeave`.
  Clock: `performance.now()` (monotonic) instead of `Date.now()`; injectable via `QmDiscoveryDeps`.
- C6 alternatives rejected: wall-clock "lobby-entry epoch" (two machines' clocks are not synced; a skew
  silently inverts "first"); age BUCKETS (the bucket order flips over time — I constructed a double-yield);
  a fixed tie band G (a permanent stalemate at |D| ≈ G).

## Numbers that are MINE (not the owner's)

- `QM_AGE_MARGIN_MS = 500` (quickmatch.ts) — safety margin on every age estimate (clock-rate drift ~1e-4,
  floor). Proof needs only ≥ 0. Width of the near-tie band the code decides.
- `QM_MAX_AGE_MS = 86_400_000`, `QM_MAX_HOLDS = 16` — parse hygiene caps.
- Every C5 number above (measured, instrument committed).

## Hotspot hunks (`save.ts`, `stateHashFull.ts`, `worldTypes.ts`, `main.ts`)

- none yet

## Wire / hash / shared-rule changes (each owes a protocol-bump verdict; branch never bumps)

- C6: the DISCOVERY beacon (`spark-qm-v{PROTO}`, NOT HELLO/LOBBY_*) gains additive-optional `ageMs`,
  `holds`. The election is a shared rule, so the question is whether a mixed pair can disagree: an ageless
  (pre-S189) beacon is judged by the code rule, which is what the old build runs toward us (it ignores the
  new fields) — the pair stays consistent (pinned: `quickmatchSeniority.test.ts` "pre-S189 beacon"). No
  bump OWED. (Train D's bump renames the discovery room anyway, so builds never meet there.) No hash, no
  save.ts, no HELLO/LOBBY field.

## Gate exit codes (captured `$?`)

- step 2: typecheck EXIT=0; `npx vitest run src/net/ src/render/lobbyStateMachine.test.ts` EXIT=0 (33 files /
  597 tests). Mutation (restore the pre-S189 code-only demote arm): EXIT=1, 5 red incl. the REACH owner's
  case, the both-orders matrix and the 300-pair sweep; restored from a byte copy.

- step 1: `npx vitest run src/ci.e2ePort.test.ts` EXIT=0 (9/9). Mutation (drop `--strictPort`): EXIT=1, 3 red
  incl. the REACH test ("vite was still running after 25 s — it drifted"); restored from a byte copy.

## For the merge owner (outside my boundary — REPORTED, not edited)

- STALE COMMENT: `src/render/lobbyStateMachine.test.ts:645-658` says "there is no announce-on-peer-join
  hook" and "the larger code demotes" — both false after step 2 (ageless beacons only). A comment, no test.

## Non-zero exits and their verdicts

- step 1, first run: EXIT=1 was `grep -c` returning 1 on zero matches and short-circuiting the `&&` chain
  (vitest never ran; the tail showed an unrelated old `$TEMP/s1.log`). BENIGN — the named recurring case;
  logs now go to the session scratchpad and nothing is chained behind `grep -c`.
