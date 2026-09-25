**STATUS: IN-PROGRESS — S191 round (brief `.claude/plans/S191_BRIEFS/net.md`, steps 1-7). Step 1 done.**

# S189 — `s189/net` progress (worktree agent, brief = PDR §5.1: C4 disconnect, C5 lag at wave 5, C6 quickmatch seat)

Branch `s189/net`, based at `15035b9` (live deploy #2, PROTOCOL_VERSION 50). Commits are LOCAL, never pushed.
The merge owner resumes from this file if this agent is cut off.

## S191 (audit wf_c0da87a5-e17 → NETFR-1..6; brief S191_BRIEFS/net.md)

| # | step | state | commit |
|---|---|---|---|
| 1 | merge master (42cc2ee, src = deploy #4) into s189/net | done | (merge commit) |
| 2 | NETFR-1 + NETFR-2 — per-match id + host phase, snapshot hold while a rejoin is pending | pending | |
| 3 | NETFR-3 — claim clock starts when a survivor is visible without the host | pending | |
| 4 | NETFR-6 — per-peer slot drop/rejoin test | pending | |
| 5 | NETFR-4 — mechanical `runVite(` ⊂ `it.runIf(SPAWN_VITE)` guard | pending | |
| 6 | NETFR-5 — canon notes rewrite | pending | |
| 7 | final gates + report | pending | |

- **Step 1 — merge master.** `git merge master` was CLEAN (auto-merged `src/main.ts`, `src/input/controls.ts`;
  no conflicts). ⭐ The old "draft panel draws OVER the connection-lost overlay" note (C4 section below) is
  RESOLVED on the merged tree, verified by reading it: `main.ts:1336` stages `draftOverlay.container`;
  `LobbyScreen` is constructed later (`main.ts:1937`) and its constructor calls `makeConnectionLostOverlay`,
  which does `app.stage.addChild(container)` (`connectionLostOverlay.ts:84`) — so the CONNECTION LOST veil,
  text and Return-to-Title button are later children and draw OVER the panel; and
  `draftOverlay.setCoveredBy(… || lobbyScreen.isConnectionLostVisible())` (`main.ts:2063`) takes the panel
  out of input while it is up. Gates on the merged tree (captured `$?`): typecheck **0** · `npx vitest run
  --maxWorkers=4` **0** (404 files + 2 skipped / 6551 tests + 7 skipped) · build **0** (entry **964.0 KiB**,
  cap 1100, headroom 136.0). Benign, recorded: vitest rewrote `pentagramBuildability.test.ts.snap` line
  endings only (`git diff --ignore-cr-at-eol` empty) → restored. ⚠ Bundle: master is 955.9 KiB (S191 PDR §4 figure, not re-measured here), so this
  branch costs **+8.1 KiB** of its 10 KiB budget before the S191 steps.

## FIX ROUND (audit wf_6bc5b278, S190)

- **FR-2 (audit NET-2) — snapshot gate per PEER, not per strategy.** `transport.ts`: one slot
  `{inFlight, pending}` per peer on each strategy (`snapSlots`), each snapshot sent with
  `action.send(serialized, { target: peerId })`; a departed peer's slot is dropped in `onPeerLeave`, and a
  waiting snapshot only goes to a peer still in the live handle. Failing test first
  (`snapshotBackpressure.test.ts` "PER PEER", harness now multi-peer): a 20 Mbit/s peer beside a stalled one
  got **3/100** snapshots → after: **100/100**. Mutation: dropping `{ target: peerId }` → red (5/100). A first
  mutation (gate on "any slot in flight") stayed GREEN — an equivalent mutant, since each slot's own `finally`
  still drains it; recorded, not counted. `npx vitest run src/net/` EXIT=0 (36 files / 555 + 3 skipped).
  Protocol: none — the same bytes to the same peers; only the send grouping changed.

- **FR-3 (audit NET-3) — closing the Codex or Settings with Escape no longer arms the leave.**
  `main.ts`'s Codex close is now `makeOverlayEscapeClose(isOpen, close)` (in `input/doubleEscapeLeave.ts`,
  marks the press consumed); `render/settingsOverlay.ts`'s two Escape listeners (panel root + document) both
  call the new `closeSettingsOnEscape(e, hide)`, which also `preventDefault`s. Docblock consumer list made
  whole. Failing test first: two REACH cases in `doubleEscapeLeave.test.ts` with the Codex close registered
  between Controls and the leave handler and the settings listener first in dispatch order (it is
  document-level) — both LEFT the match before, pass after. Mutation: drop the settings `preventDefault` →
  red. Source guards: settings has exactly 2 `closeSettingsOnEscape(e, hide)` calls and no other Escape
  check; main.ts has one `makeOverlayEscapeClose(` before one `makeDoubleEscapeLeave(`. `vitest src/input/
  + audioManager` EXIT=0 (9 files / 338). Hotspot: `main.ts` Codex listener (~1570, 6 lines → the
  factory) + import. Protocol: none (local input).

- **FR-7 (audit NET-6, owner-question decided conservatively) — the default unit suite never spawns vite.**
  DECISION: env-var gate, not a move. `src/ci.e2ePort.test.ts`: the two cases that start real vite dev
  servers are `it.runIf(SPAWN_VITE)` with `SPAWN_VITE = process.env.SPARK_SPAWN_VITE === '1'`; the
  source-level assertions (the webServer command carries `--strictPort`) always run. Opt-in:
  `SPARK_SPAWN_VITE=1 npx vitest run src/ci.e2ePort.test.ts` (verified EXIT=0, 10/10). Failing guard first:
  "the default unit suite never spawns vite" (exactly two `it.runIf(SPAWN_VITE)(` cases, and neither
  `deploy.yml` nor `e2e.yml` sets the variable) — red before, green after (default run: 8 passed + 2
  skipped). Mutation: ungate one case → red. Protocol: none (tests only).

- **FR-4 (audit NET-4) — the S124 D4 takeover of a FROZEN 1v1 host is RESTORED; the survivor gate now applies
  ONLY on transport loss.** The first cut's `hasSurvivorToHostFor` gate blocked every 1v1 claim, including
  D4's (host connected but silent → client takes over at starvation 6 s + grace 15 s + ladder; the thawed host
  rejoins as a client, S125 v2) — an unapproved change to an existing mechanic. Now the WHEN of a claim is the
  pure `stepMigrationClaim` (`net/reconnectPolicy.ts`), called from main.ts's claim block: host GONE from
  our transport → claim only with a survivor (1v1: reconnect — the C4 fix stays); host PRESENT but starved →
  D4 exactly as before. Plus `stepHostPresence`: starvation is counted from the later of the last snapshot
  and the host's (re)appearance on our transport, so a reconnect that lands is not read as a starved host
  before its first snapshot (the old code never reached that state because it had already claimed).
  Failing test first: `stepMigrationClaim` was first written as today's logic → "1v1 FROZEN HOST takes over at
  the D4 deadline" RED (never claimed) → fixed → GREEN; the claim lands at exactly last-snapshot + 21 s
  (+ one frame). Also pinned: 1v1 transport loss never claims; a late reconnect does not claim before its first
  snapshot; a host that returns and then freezes is taken over at D4 counted from its return; 3-seat host loss
  with a survivor claims at grace + ladder; a non-warranted seat never claims. Mutations: gate on every path →
  3 red; drop the presence stamp → 2 red. The thaw-rejoin path (host side, `onDeposed` → `demoteToClient`)
  is untouched code. `vitest src/net/` EXIT=0 (36 / 562 + 3 skipped). Hotspot: `main.ts` claim block (the
  hostGone/ladder arithmetic → one `stepMigrationClaim` call; the claim body untouched), a `hostPresence`
  state + one `stepHostPresence` line per frame, the import list. Protocol: none — WHEN a peer claims is local;
  the claim message and its verification are unchanged, and D4 behaviour is back to what v50 peers expect.

- **FR-6 (audit NET-5/NET-6) — the C4 main.ts wiring is now a tested function and a pinned call site.**
  The per-frame overlay + retry decision moved out of main.ts into the pure `planConnectionFrame`
  (`net/reconnectPolicy.ts`, behaviour-identical: S82 grace, S124 D4 peersGone split incl. the MIGRATING
  window, S125 v2 zombie fail-safe, S189 retry past the grace); main.ts only applies the plan (overlay calls,
  the attempt). With FR-4's `stepMigrationClaim`, both C4 decisions are unit-driven. New
  `connectionFrame.test.ts`: frame-by-frame (16 ms) — RECONNECTING through the grace then TERMINAL with
  retries on both sides; peers back → hidden + a fresh grace on the next loss; a host never retries; the
  migration case never tears the mesh and shows MIGRATING to its deadline then `migrationDeadline`. And the
  mechanical half: exactly ONE `planConnectionFrame(` and ONE `stepMigrationClaim(` in main.ts, no direct
  `reconnectRetryDue(` or `hasSurvivorToHostFor(` left there, the reconnect happens inside
  `if (connectionPlan.retry …)` and the claim inside `if (claimStep.claim)`. Failing first (the function did
  not exist; main.ts had no such call) → green. Mutation: retries stop at the grace → 2 red.
  `vitest src/net/ + src/input/` EXIT=0 (45 files / 829 + 3 skipped). Hotspot: `main.ts` overlay/retry block
  (~60 lines of branches → one plan + an applier), 3 imports removed. Protocol: none (local UI/timing).

- **FR-1 (audit NET-1) — a rejoin must prove it reached the SAME match; plus a retry backstop.** The loop
  retries past the grace and a host's room code is fixed per page load, so a client on the terminal overlay
  could rejoin the host's NEXT lobby/match (a ghost seat there, a frozen old board here). Now: `clientHandlers`
  classifies what the followed host sends while we are a PLAYING client (`classifyHostMessage`, after
  `hostAuthFilter`): a snapshot whose seq restarted > `HOST_SEQ_REGRESSION_SLACK` (50) below our watermark at
  the same epoch = `'new-match'` (not applied); LOBBY_PRESENCE = `'lobby-presence'` (flows on unchanged).
  main.ts stamps each signal and each reconnect attempt; once per frame `hostMovedOn` returns
  `'new-match'` at once, or `'lobby'` after `HOST_LOBBY_CONFIRM_MS` (5 s) with no snapshot accepted — but ONLY
  while a rejoin is PENDING (an attempt fired, nothing accepted since). ⚠ LOBBY_PRESENCE alone is not a
  verdict: the host broadcasts it on every peer join in ANY state, our own live rejoin included. On a verdict:
  `[net] HOST MOVED ON (…)`, `leaveToTitle()`, and the title shows *"The host started a new game — this match
  is over."* (`TitleScreen.setNotice`, cleared once the title is left). Backstop: `planConnectionFrame` stops
  retrying `RECONNECT_GIVE_UP_MS` (180 s) after the loss began; the terminal overlay stays. All three
  constants are MINE, flagged at the constant. Why the pending gate keeps the rest safe: a live rejoin accepts
  a snapshot and is no longer pending; D4's frozen-but-connected host never starts an attempt (the loop only
  retries on transport loss); a signal from before the attempt is ignored; a delayed duplicate on a second
  strategy's channel mid-match cannot fire it. Failing first (`hostMovedOn.test.ts`, 14 tests, all RED
  before): policy cases + backstop frame-driver + REACH through the real `connectAsClient` route (transport
  mocked, `route` captured): restarted seq → `'new-match'` and `ClientSync.receive` NOT called; host
  LOBBY_PRESENCE while PLAYING → `'lobby-presence'`; a stranger's → nothing; the host's next live snapshot →
  applied, nothing raised; and a main.ts call-site guard (attempt stamped in the retry branch, one
  `hostMovedOn(` call, `leaveToTitle()` then `setNotice(`). Mutation: drop the pending gate → 2 red (live
  rejoin, D4 frozen host). `vitest src/net/` EXIT=0 (39 files / 594 + 3 skipped), typecheck EXIT=0. Hotspot:
  `main.ts` +3 state lets and an `onHostSignal` sink beside `clientJoinDeps`, one per-frame block before
  `hostLost`, one stamp line in the retry branch, one notice-clear line at the title toggle. Protocol: none —
  no field or kind added; both signals read messages v50 already sends.

- **FR-5 (audit NET-5, LOW) — Return to Title no longer logs "CONNECTION RESTORED".** The overlay also hides
  when the player LEAVES (the session is torn down, so nothing is "gone"); the first cut logged that as a
  restore. Now the edge is the pure `connectionEdge({wasLost, isLost, stillInMatch})` (`reconnectPolicy.ts`):
  `'restored'` only while still networked + PLAYING + with a transport, otherwise `'dismissed'` →
  `[net] terminal overlay dismissed — left the match (return to title)`. The cinematic-abort edge is untouched.
  Failing first (4 tests in `connectionFrame.test.ts`, incl. a main.ts guard: one `connectionEdge(` call, the
  RESTORED line under `edge === 'restored'`, the dismissal line present, `stillInMatch` is the
  networked-PLAYING-transport test) → green. Mutation: always `'restored'` → red. Hotspot: `main.ts` E3 log
  block (2 branches → 3) + import. Protocol: none (a log line).

- **FIX-ROUND GATES (tip 163f286, exit codes captured directly):** `npm run typecheck` **0** ·
  `npx vitest run --maxWorkers=6` **0** (378 files passed + 1 skipped / 6314 tests + 5 skipped) · `npm run build`
  **0** (entry 956.2 KiB, cap 1100, headroom 143.8). Benign, recorded: the vitest run rewrote
  `pentagramBuildability.test.ts.snap` line endings only (`git diff --ignore-cr-at-eol` empty) → restored.

- ⛔ **C4 END-TO-END, NOW MEASURED — AND IT IS ONLY PARTLY FIXED. NOT DONE; for the merge owner.** The post-fix
  `e2e/reconnect-hard-blip.spec.ts` (owed since step 4a) was run on the final tree, 7 times (spec ×4 + a
  temporary diagnostic copy ×3, deleted): recovered at **7.2 s, 10.0 s** (inside the 15 s grace) · **21.0, 29.1,
  29.2, 30.7 s** (after it — the terminal overlay shows, then clears itself) · **1 run not within 45 s** (six
  attempts). Spec EXIT=1 on 5 of 7 (it asserts inside-the-grace). Pre-fix: never recovered, and the joiner claimed
  the host seat. What HELD in every run: the joiner stayed a client (no lone claim — C4 fault 3, FR-4), it was
  never sent to title (FR-1's pending gate), the loop kept trying past the grace (fault 2).
  **Diagnosis (evidence, not a fix):** the host drops the dead peer at once (`PEER DROPPED … cause=peer-left`
  at +0.2 s in every traced run), so it is NOT a stale host peer. The late landings match Trystero's own signalling
  TTLs in `@trystero-p2p/core/dist/signal-handler.mjs` — `answeringTtlMs` / `offerPostAnswerTtlMs` = **23,333 ms**,
  `disconnectedPeerGraceMs` = 7,533 ms. Traced: attempt 1 at +1.70 s (its offer relayed ~+2.4 s) → host
  `[net] nostr failed` (Trystero join timeout) at **+25.76 s** = 2.4 + 23.33 → the next attempt landed 3 s later
  (+29.3 s). So when the first rejoin's handshake does not complete, the host sits in that peer's answering state
  for ~23 s and later attempts from the same selfId cannot land until it expires; and a first-attempt handshake
  measured ~8 s once, right at `RECONNECT_RETRY_MS` (8 s) — one retry tore down a join in its last millisecond
  (+9.753 handshake / +9.754 retry). Why the first attempt's handshake sometimes stalls is NOT established.
  Candidate directions (each is a change to C4 behaviour → merge owner / owner call, not done here): don't tear
  down an attempt with a handshake in flight; pace retries against Trystero's 23.3 s TTL after the first; a
  rejoin that reuses the live shared peer. The spec stays @quarantine-flaky (non-gating); deploy is not blocked.

## Steps

| # | step | state | commit |
|---|---|---|---|
| 0 | progress skeleton | done | d4e9ae7 |
| 1 | e2e webServer `--strictPort` + its test | done | 68b04a7 |
| 2 | C6 quickmatch seat — find the per-machine bias, fix, two-seeker test in both arrival orders | done | 2bbcd20 |
| 3a | C5 — MEASURE (instrument `src/net/c5WaveFiveMeasure.test.ts`, opt-in `SPARK_C5_MEASURE=1`) | done | b72a4c4 |
| 3b | C5 — the in-boundary fix the numbers name: snapshot send backpressure (latest-wins) + a reproduction through real NetTransport + real Trystero action-wire | done | 0c9acdc |
| 4a | C4 — diagnosis + e2e REPRODUCTION (hard blip) + the auto-reconnect fix (coordinator priority 2) | done | 6dae206 |
| 4b | C4 — E3 drop-reason logging (coordinator priority 3) | done | fe9b4ac |
| 4m | merge master (5934d3b, train A / deploy #3) into s189/net — clean, no conflicts | done | ffab016 |
| 4c | C4 — A1 Escape-as-cancel does not arm the double-Escape leave | done | 776f56c |
| 5 | final gates (typecheck, full vitest, build) + report | done | (this commit) |
| 4 | C4 disconnect — own diagnosis, reproduction test BEFORE any fix | pending | |

## In flight

- nothing. OWED TO THE MERGE OWNER: the e2e lanes on the merged tree, and specifically
  `e2e/reconnect-hard-blip.spec.ts` (@quarantine-flaky; RED pre-fix by design, expected GREEN now),
  `e2e/reconnect.spec.ts`, `e2e/exit-match.spec.ts`, `e2e/hostmigration.spec.ts` (3-seat migration must
  still claim — the lone-survivor gate must not have touched it).

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

## C5b — the snapshot backpressure (in boundary: `src/net/transport.ts`)

- MECHANISM (verified against `node_modules/@trystero-p2p/core/dist/action-wire.mjs`): Trystero cuts a
  message into 16 KiB chunks and, per chunk, awaits `bufferedamountlow` (threshold 65535, `peer.mjs:104`)
  with a 10 s timeout (`backpressureWaitTimeoutMs`), after which it `break`s — the rest of that message is
  ABANDONED. `NetTransport.send` fired one un-awaited send per 100 ms, so an uplink below demand grew an
  unbounded set of concurrent sends.
- REPRODUCTION (`src/net/snapshotBackpressure.test.ts`, REAL action-wire both ends, modelled channel):
  fire-and-forget, 113 KiB @10 Hz — 5 Mbit/s: 196/900 whole snapshots, worst latency 47.4 s, longest
  silence 26.0 s, channel buffer 7.0 MiB · 2 Mbit/s: 8/900, silence 67 s · 8 Mbit/s: 672/900, worst
  latency 24.7 s, max gap 3.5 s. The pre-fix NetTransport through the same link (REACH test, 60 s @5):
  165/600, worst 40.0 s, gap 8.3 s → RED.
- FIX: latest-wins — ≤1 snapshot in flight per strategy + the newest waiting; control traffic ungated;
  a waiting snapshot never goes to a handle that is no longer live (disconnect/reconnect); a rejected
  send releases the gate; `snapshotsSkipped()` diagnostic; netStats records a snapshot where it is
  TRANSMITTED. AFTER, same link: 320/600 delivered (= link capacity), worst latency 405 ms, max gap
  220 ms, channel buffer ≤ 67 KiB. At 20 Mbit/s nothing is skipped (negative test, every seq arrives).
- Mutation (gate disabled): 3 red (REACH + latest-wins + left-room); restored from a byte copy.
- Re-pinned: `snapshotFanout.test.ts` "10 snapshots produce 20 sends" now spaces its sends (a synchronous
  burst honestly coalesces); `netStats.test.ts` guard-site count 6 → 8 (the two transmit-time records).
- ⭐ THE COORDINATOR'S QUESTION — can backlog → Trystero 10 s drop → starvation END in CONNECTION LOST?
  **NO, not by itself.** The overlay needs a TRANSPORT-level loss (`main.ts:3636-3643`: `peerCount() === 0
  || hostLost`, hostLost = host peerId absent from `peerIds()`); a backlog leaves the peer connected.
  Starvation instead drives the MIGRATION path (`main.ts:3366-3401`): silence ≥ `HOST_STARVATION_MS` 6 s
  marks the loss, and `RECONNECT_GRACE_MS` 15 s later the warranted client (rank 0 of
  `computeClaimDelayMs`, `succession.ts:89`) CLAIMS THE HOST SEAT while the real host is still there —
  which refuses the claim without partition evidence → a split-brain, not an overlay. The reproduction's
  26 s / 67 s silences are past that 21 s trigger. So C5's backlog explains "lag" and can explain "the
  game went wrong" (two hosts), but the CONNECTION LOST / peer-dropped overlay the owner screenshotted
  needs a peer to leave the transport. Channel-close by Chrome's 16 MiB send cap is NOT reached by this
  mechanism: Trystero's 10 s wait bounds the buffer to ~10 s × uplink (measured 7.0 MiB @5 Mbit/s), and an
  uplink fast enough to exceed 16 MiB (~13 Mbit/s) carries the 9.3 Mbit/s demand with no backlog.

## C4 — diagnosis (my own, then matched against the hunt's verified A2/A4/E2 — they agree)

- The owner (R190-A, via the coordinator): BOTH players saw CONNECTION LOST, both still in the game, "lagging
  very hard right before", before wave 5 ended. So: a TRANSPORT-level loss (the overlay needs
  `peerCount() === 0 || hostLost`, `main.ts:3636-3643`) that the auto-reconnect failed to heal in 15 s.
- The trigger class (hunt A4, agreed): every mid-match peer removal the app does not start itself comes from
  Trystero's RTCPeerConnection lifecycle (ICE disconnected >= 5 s, failed/closed, channel close). The
  pre-S189 snapshot backlog (step 3b) does NOT by itself drop the transport (measured buffer <= 7 MiB, under
  Chrome's 16 MiB channel cap) — it produces the lag and 26-67 s silences.
- ⛔ THE RECOVERY WAS BROKEN — REPRODUCED END-TO-END over real WebRTC + live relays
  (`e2e/reconnect-hard-blip.spec.ts`, run PRE-fix, EXIT=1): the joiner's peer connection closed mid-match ->
  reconnect attempts at 1450 / 5503 / 9541 / 13663 ms -> **never recovered within 45 s**; the joiner ended
  `isHost: true` (it had CLAIMED the host seat with no peers) and both boards froze behind the terminal
  overlay (which the open draft panel hid — see "for the merge owner"). Measured the same session: a
  clean-disconnect rejoin (the only case `reconnect.spec.ts` covers) re-binds Trystero's still-open SHARED
  peer connection in ~0.2 s; a FRESH join took **6.3 s**.
- Three faults, all in code, all fixed here:
  1. The rejoin bound to the DYING room: `disconnect()` fire-and-forgets `leave()`, the loop calls
     `connectAsClient` in the same frame, and Trystero's `joinRoom` returns the still-registered room
     (`strategy.mjs:79`) until `onSelfLeave` (after `await leaveAction.send` + 99 ms, `room.mjs:70-78`).
     A second `leave()` on that room then deletes the NEXT room's registry entry + Nostr topics (hunt A2).
     -> FIX `transport.ts`: `connect()` waits for a same-code leave in flight (`pendingLeaves`, capped
     `PENDING_LEAVE_CAP_MS` 2 s); a room is left ONCE (`leavingRooms` WeakSet) and a still-leaving room is
     never adopted; chunk-load callbacks check a connect GENERATION (a disconnect+connect inside a torrent
     chunk load used to start an orphaned second torrent room).
  2. A retry killed the join it was waiting for: `RECONNECT_RETRY_MS` 4 s < a fresh join (6.3 s measured;
     "3-6 s" per reconnect.spec's own comment). -> `RECONNECT_RETRY_MS = JOIN_STALL_WARN_MS` (8 s), and the
     loop no longer stops at the grace (terminal overlay unchanged; it clears itself when a peer returns).
  3. The lone 1v1 client claimed the host seat at 15 s with NO peer to host for, and a host never
     reconnects -> both sides stuck. -> the claim requires `hasSurvivorToHostFor(alivePeers, hostPeerId)`
     (the rule `main.ts`'s own overlay-split comment already stated: "peerCount === 0 = OUR transport
     died — the S82 reconnect-cycle is the only path back").
- Falls out for free: hunt A3 (a DEPOSED host re-joining its own dying room -> ghost peer) — the same
  `disconnect(); connectAsClient()` pattern at `main.ts:2586-2587`, now fixed by (1). Hunt B-2 (a 2p host
  frozen >= 21 s gets deposed): in a 1v1 the client no longer claims (the host is the only alive peer) ->
  the board pauses until the host returns. 3+-seat migration unchanged (a survivor exists).
- ⚠ The post-fix e2e (`e2e/reconnect-hard-blip.spec.ts`, @quarantine-flaky) was NOT re-run by me — my two
  targeted e2e runs were the rejoin-latency measurement (temporary spec, deleted) and the pre-fix
  reproduction. It is OWED to the merge owner: expected GREEN post-fix (one attempt at ~1 s, landing ~7 s).
- ⛔ FOR THE MERGE OWNER (render, outside my boundary): during a draft the DRAFT PANEL draws OVER the
  connection-lost overlay (`app.stage.addChild(draftOverlay.container)` at `main.ts:~936` is added after
  the lobby screen's overlay) and hides the "CONNECTION LOST" text and its Return-to-Title button — seen in
  the reproduction's screenshots (dark 0.88 veil, draft panel on top, no text).

## C4 / E3 — the drop is now readable (step 4b)

- `[net] PEER DROPPED strategy=… peer=… cause=network-died|peer-left|unknown conn=… ice=… lastRxAgoMs=…
  visibility=…` — one line per strategy drop (`transport.ts` `logPeerDrop`), the cause read from the peer
  connection's LAST observed state (listeners attached at `onPeerJoin`, `watchPeerConnection`): any of
  disconnected/failed/closed → network-died; connected+connected/completed → peer-left (a leave message:
  tab close, BACK TO MAIN, double-Escape); nothing observed → unknown. `classifyPeerDrop` is pure + exported.
- `[net] CONNECTION LOST (terminal) cause=zombieDeposed|migrationDeadline|hostLost|peerCount0 isHost=… peers=…`
  on the terminal edge (`main.ts`, cause from the pure `terminalLossCause`), and
  `[net] CONNECTION RESTORED after the terminal overlay — a peer is back` on the recovery edge (reachable now
  that the loop keeps trying past the grace).
- Reproduced first: `peerDropLog.test.ts` RED before the change (5/5 — no such line), GREEN after; mutation
  (drop the `logPeerDrop` call) → 3 red; restored from a byte copy.

## C4 / A1 — a cancel no longer arms "leave the match" (step 4c)

- Mechanism (hunt A1, re-verified on the merged tree): `Controls` registers its window keydown listener
  first (constructed at `main.ts:~618`); Escape there drops a held tower (`controls.ts` onKeyDown) or puts
  the Ra aim away, and returned WITHOUT marking the event. `main.ts`'s double-Escape listener then saw the
  same event; its only guard (`castlePanel.armedBlueprint() !== null`) read the state AFTER the disarm, so
  the cancel counted as press #1 and one more Escape inside `TITLE_EXIT_CONFIRM_MS` (1600) ran
  `leaveToTitle()` → `teardownNet` → Trystero `@_leave` → the OTHER player: RECONNECTING → CONNECTION LOST.
- FIX: `controls.ts` — `consumeCancel(e)` (`preventDefault`, tolerant of hand-built test events) on both
  cancel branches. `src/input/doubleEscapeLeave.ts` — the leave handler body, moved out of `main.ts` as
  `makeDoubleEscapeLeave(deps)` (same guards, same order), plus: a consumed Escape is not a leave press
  and resets the chord. `main.ts` registers it with the same deps (thunks — `exitButton`/`leaveToTitle`
  are declared later, as before).
- Reproduced first: `doubleEscapeLeave.test.ts` drives the REAL `Controls` + the real handler through a
  window stub in main.ts's registration order, one event object per press. PRE-fix EXIT=1 (tower, Ra aim
  and double-cancel all LEFT the match); POST EXIT=0. Mutation (drop the tower `consumeCancel`) → 2 red.
- ⚠ `e2e/exit-match.spec.ts` (bare double-Escape in solo) is the e2e for the unchanged half; not re-run
  here (e2e budget spent) — owed to the merge owner's lanes.

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

- `src/main.ts` (step 4c, session/leave section): the inline double-Escape `keydown` listener body
  (~1607-1638, 32 lines) replaced by `window.addEventListener('keydown', makeDoubleEscapeLeave({…}))`;
  import of `makeDoubleEscapeLeave`; the now-unused `TITLE_EXIT_CONFIRM_MS` import removed. The S153
  docblock above it is unchanged.
- `src/input/controls.ts` (step 4c — outside the original boundary, authorised by the coordinator for A1):
  `consumeCancel` helper + one call on each of the two Escape-cancel branches. Nothing else.
- `src/main.ts` (step 4b): `terminalLossCause` + `TerminalLossCause` added to the reconnectPolicy import;
  `let terminalCause` beside `let connectionLost`; set in the zombie branch and the terminal else-branch; one
  log block (two edges) just above the existing `if (connectionLost && !lastConnectionLost)` cinematic-abort.
- `src/main.ts` (step 4a, net/reconnect sections only, self-contained):
  1. import block after `./net/session.ts` — `hasSurvivorToHostFor`, `reconnectRetryDue`, `RECONNECT_*`
     from `./net/reconnectPolicy.ts`;
  2. the three local `RECONNECT_*` consts (was ~2460-2462) replaced by a 2-line comment (same names imported);
  3. the migration-claim `if` (~3399) gains `&& hasSurvivorToHostFor(alivePeers, session.hostPeerId)`;
  4. the reconnect retry moved OUT of `if (nowMs < reconnectUntilMs)` to just before it, gated by
     `reconnectRetryDue(...)` — the overlay branches below it are unchanged.

## Wire / hash / shared-rule changes (each owes a protocol-bump verdict; branch never bumps)

- A1 (step 4c): local input handling only. No wire, no hash, no bump.

- E3 (step 4b): console lines only. No wire, no hash, no bump.

- C4 (step 4a): NO wire change. Reconnect timing and the leave/join ordering are local. The claim gate
  changes only WHEN a lone peer would claim — a claim it would have broadcast to nobody. Two builds that
  shake hands cannot disagree about any value either computes. No bump owed.

- C5b: NO wire change — when snapshots are sent, never what they contain. A v50 peer receiving from a
  gated host sees only fewer snapshots (its seq gate already accepts gaps). No bump owed.

- C6: the DISCOVERY beacon (`spark-qm-v{PROTO}`, NOT HELLO/LOBBY_*) gains additive-optional `ageMs`,
  `holds`. The election is a shared rule, so the question is whether a mixed pair can disagree: an ageless
  (pre-S189) beacon is judged by the code rule, which is what the old build runs toward us (it ignores the
  new fields) — the pair stays consistent (pinned: `quickmatchSeniority.test.ts` "pre-S189 beacon"). No
  bump OWED. (Train D's bump renames the discovery room anyway, so builds never meet there.) No hash, no
  save.ts, no HELLO/LOBBY field.

## Gate exit codes (captured `$?`)

- ⭐ FINAL, on the merged tree (s189/net @ 776f56c = master 5934d3b + this branch): `npm run typecheck`
  EXIT=0 · `npx vitest run --maxWorkers=6` EXIT=0 (376 files passed + 1 skipped [the opt-in C5 instrument] /
  6279 tests + 3 skipped) · `npm run build` EXIT=0 — main entry 951.9 KiB, cap 1100, headroom 148.1 KiB
  (train A measured 948.1 → this branch +3.8 KiB, inside its 10 KiB budget).

- step 4c: `doubleEscapeLeave.test.ts` PRE EXIT=1 (4 red: 3 = the mechanism, 1 = a test-harness listener
  reset, fixed) → POST EXIT=0; typecheck EXIT=0 (after removing the unused import: first run EXIT=1,
  TS6133 — RESOLVED); `npx vitest run src/input/` EXIT=0 (8 files / 257). Mutation EXIT=1 (2 red).

- step 4b: `peerDropLog.test.ts` PRE EXIT=1 (5 red, the reproduction) → POST EXIT=0; typecheck EXIT=0;
  `npx vitest run src/net/` EXIT=0 (36 files / 554 + 3 skipped). Mutation EXIT=1 (3 red).

- step 4a: e2e `reconnect-hard-blip.spec.ts` PRE-fix EXIT=1 (the reproduction — attempts 1450/5503/9541/
  13663 ms, no recovery in 45 s); e2e temp rejoin-latency spec EXIT=0 (fresh join 6299 ms; clean rejoins
  2014/2031/2038 ms incl. the 1 s first-retry delay). typecheck EXIT=0; `npx vitest run src/net/
  src/ci.e2eLanes.test.ts src/ci.e2ePort.test.ts` EXIT=0 (37 files / 562 tests + 3 skipped). Mutations:
  no leave-wait + 4 s cadence -> EXIT=1, 6 red; restored from byte copies.

- step 3b: typecheck EXIT=0; `npx vitest run src/net/` EXIT=0 (33 files passed + 1 skipped [the opt-in
  instrument] / 535 tests + 3 skipped).

- step 2: typecheck EXIT=0; `npx vitest run src/net/ src/render/lobbyStateMachine.test.ts` EXIT=0 (33 files /
  597 tests). Mutation (restore the pre-S189 code-only demote arm): EXIT=1, 5 red incl. the REACH owner's
  case, the both-orders matrix and the 300-pair sweep; restored from a byte copy.

- step 1: `npx vitest run src/ci.e2ePort.test.ts` EXIT=0 (9/9). Mutation (drop `--strictPort`): EXIT=1, 3 red
  incl. the REACH test ("vite was still running after 25 s — it drifted"); restored from a byte copy.

## For the merge owner (outside my boundary — REPORTED, not edited)

- STALE COMMENT: `src/render/lobbyStateMachine.test.ts:645-658` says "there is no announce-on-peer-join
  hook" and "the larger code demotes" — both false after step 2 (ageless beacons only). A comment, no test.

## Non-zero exits and their verdicts

- step 4a: `npm run probe-relays` output interleaved with a vitest run of `src/state/zzProbeClone.test.ts`
  — NOT from my worktree (no such file here). BENIGN: a SIBLING agent shares this session's scratchpad and
  wrote to the same `probe.log` path. The relay result itself was intact (8/9 relays answered). Since then
  my scratch files are prefixed `net_`.
- step 4a: first `rejoinSameRoom` run EXIT=1 (3 red) — my test did not reset its room counter between
  tests. RESOLVED (`reg.n = 0` in afterEach).
- step 4a: two bash heredocs failed to PARSE (exit 2, nothing ran) — tool quoting; the scripts now go
  through files. BENIGN, verified nothing was committed by them.

- step 3b: first typecheck EXIT=1 — TS7016 on importing Trystero's internal `action-wire.mjs` (no .d.ts,
  not in the package `exports`). RESOLVED: typed by cast + `@ts-expect-error` at that one import.
- step 3b: first net run EXIT=1 — `snapshotFanout` "10 → 20 sends" (a synchronous burst now coalesces BY
  DESIGN) and `netStats` guard-site count. RESOLVED by re-pinning both (reasons above), not silencing.
- step 3b: an 8 Mbit/s probe of the reproduction EXIT=1 — BENIGN, deliberate: at 8 Mbit/s the silence stays
  under 6 s, so the repro's starvation assertion does not hold there; the committed repro runs at 5.
- step 3a: `c5WaveFiveMeasure` first run showed 22.8 KiB of effects — a harness artifact (no renderer wipe),
  RESOLVED by modelling the wipe.

- step 1, first run: EXIT=1 was `grep -c` returning 1 on zero matches and short-circuiting the `&&` chain
  (vitest never ran; the tail showed an unrelated old `$TEMP/s1.log`). BENIGN — the named recurring case;
  logs now go to the session scratchpad and nothing is chained behind `grep -c`.
