**STATUS: IN PROGRESS — S192 audit fix round: merge + A1 done; next L1, owner notes B1/L2/L3, gates.**

# S189 — `s189/net` progress (worktree agent, brief = PDR §5.1: C4 disconnect, C5 lag at wave 5, C6 quickmatch seat)

Branch `s189/net`, based at `15035b9` (live deploy #2, PROTOCOL_VERSION 50). Commits are LOCAL, never pushed.
The merge owner resumes from this file if this agent is cut off.

## S191 (audit wf_c0da87a5-e17 → NETFR-1..6; brief S191_BRIEFS/net.md)

| # | step | state | commit |
|---|---|---|---|
| 1 | merge master (42cc2ee, src = deploy #4) into s189/net | done | 7fe65d4 |
| 2 | NETFR-1 + NETFR-2 — per-match id + host phase, snapshot hold while a rejoin is pending | done | 27531dd |
| 3 | NETFR-3 — claim clock starts when a survivor is visible without the host | done | a08ad56 |
| 4 | NETFR-6 — per-peer slot drop/rejoin test | done | b01a228 |
| 5 | NETFR-4 — mechanical `runVite(` ⊂ `it.runIf(SPAWN_VITE)` guard | done | f62af49 |
| 6 | NETFR-5 — canon notes rewrite | done | 854c319 |
| 7 | final gates + report | done | (this commit) |

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

- **Step 2 — NETFR-1 + NETFR-2: a positive same-match proof.** Design:
  - HOST mints a per-match id at Begin: `mintMatchId()` (`hostHandlers.ts`) = `` `${selfId}.${n}` ``, `n` a
    module-level count of Begins on this page load (no `Math.random`, no clock — pinned by a spy). Stored as
    `NetSession.matchId` (new field; `makeNetSession` null; `teardownNet` clears it; an in-page reconnect keeps
    it; a migration successor keeps the one it holds, so its snapshots carry the same match's id).
  - The CLIENT stores it off START_GAME_SIGNAL (the `gameState === 'LOBBY'` Begin block, beside `lastRoster`).
  - `classifyHostMessage` (`reconnectPolicy.ts`) now decides from the id + phase: presence phase LOBBY →
    `'lobby'`; presence phase MATCH with an id that is not ours → `'new-match'`; presence with no phase, or
    phase MATCH + our id / no id → nothing. NETSNAPSHOT: **the HOLD** — while `isRejoinPending` (new, pure:
    attempt fired and nothing accepted since) and BOTH sides hold an id, the id decides and only OUR id reaches
    `ClientSync.receive` (`clientHandlers` returns on `'new-match'`); otherwise the S189 seq-regression
    fallback exactly as before. `HostSignal` is now `'lobby' | 'new-match'` (was `'lobby-presence'`).
  - `hostMovedOn` is immediate on a proven signal (no silence window); `HOST_LOBBY_CONFIRM_MS` (5 s, MINE)
    is DELETED — a verdict from silence is what NETFR-1 was. `nowMs` dropped from its input,
    `lobbyPresenceAtMs` → `lobbyAtMs`. Docblock rewritten (the false "can never pre-empt D4" line).
  - ⚠ DEVIATION FROM THE BRIEF'S WORDING, cosmetic: presence in phase MATCH with a DIFFERENT id raises
    `'new-match'`, not `'lobby'` (the brief grouped it with LOBBY). Same consequence (leaveToTitle + the same
    notice); only the `[net] HOST MOVED ON (…)` log word differs, and "next match" is what it is.
  - ⚠ Scope kept to the brief: the hold applies ONLY while a rejoin is pending; outside one a snapshot is
    applied exactly as today (a different-id snapshot on a live, un-interrupted connection is not reachable:
    a host's id changes only at a Begin, and a host can only Begin from LOBBY, which it reaches only through
    `teardownNet`, which drops our transport and so starts an attempt).
  - The verifiers' no-wire alternative (a PLAYING host sends one snapshot on a peer join) was NOT built. My
    view for the report: it would fix NETFR-1 only for a VISIBLE host — a hidden host's rAF is exactly what
    is paused — so it does not replace the phase; it cannot prove NETFR-2 at all (a snapshot proves nothing
    about WHICH match). The id is the better shape.
  - **WIRE (all additive-optional; validated in `parseNetMessage`, present-but-malformed rejects the whole
    message, the file's existing posture):**
    · `START_GAME_SIGNAL.matchId?: string` — non-empty, ≤ `MATCH_ID_MAX_LEN` (64, MINE: parse hygiene);
    · `LOBBY_PRESENCE.phase?: 'LOBBY' | 'MATCH'` — exactly one of the two literals (always sent now,
      `hostPhaseOf(world.gameState)`: LOBBY/TITLE → LOBBY, PLAYING/WIN/POSTGAME → MATCH);
    · `LOBBY_PRESENCE.matchId?: string` — same bound; sent when the host holds one;
    · `NETSNAPSHOT.matchId?: string` — same bound; envelope-only like `epoch` (never enters NetSnapshot /
      save / hash). ~22 B per snapshot (0.02 % of a 113 KiB wave-5 snapshot).
    Tolerance checked FIRST: the pre-change parser already kept unknown keys (`return obj as …`, no key
    allowlist; `isValidRoster` reads only `roster`) — the "absent or well-formed" test was GREEN pre-fix.
    Bump verdict: no bump owed BY ITSELF (additive-optional; an id-less peer falls back to today's seq check
    and never produces a lobby verdict; no hash, no sim rule). It rides deploy #5's 52 — the merge owner
    lists the four fields in the 52 docblock.
  - `broadcastQmPresence` gained a REQUIRED 4th parameter `gameState` (so no caller can forget the phase —
    tsc forced all 5 production sites: hostHandlers ×3, main.ts ×2) — and 8 test call sites in
    `raceClaim.test.ts` pass `'LOBBY'`. `HostSync.buildSnapshotMessage/wrapSnapshot` gained an optional 3rd
    `matchId` (tests call them bare); main.ts's 3 call sites pass `session.matchId`, pinned MECHANICALLY
    (every code-line builder call in main.ts carries it; comment lines excluded).
  - Tests: `src/net/sameMatchProof.test.ts` (17) — PRE-FIX 13 red / 4 green → POST 17 green. Hidden host
    (presence phase MATCH at 10 s, a phase-less presence at 20 s, per-100 ms frames to 30 s, then a same-id
    seq-501 snapshot → no verdict throughout, applied); phase LOBBY → `'lobby'` at once; phase MATCH + other
    id → `'new-match'`; NETFR-2 (pending, watermark 500, seq 900 other id → `'new-match'`, `receive` NOT
    called, watermark still 500); same id seq 901 → applied, pending ends; absent fields → seq fallback (900
    applies, 3 is new-match) and our-id-null falls back; D4 negative (no attempt → nothing held/raised);
    host REACH through the real `createHostStartHandler` onPeerChange: a PLAYING host's presence says MATCH +
    id; Begin mints/stores/sends; presence phase from gameState; both builders; client stores + teardown
    clears; wire validation both ways; two mechanical main.ts guards. `hostMovedOn.test.ts` re-pinned to the
    new API (+1 REACH: phase-MATCH/phase-less presence raises nothing). Mutations (byte-copy restore, `cmp`
    verified): M1a remove the id-decides hold branch → 1 red (NETFR-2) · M1b clientHandlers applies a
    new-match snapshot → 2 red · M2 ignore the phase (any presence = lobby) → 3 red (NETFR-1 hidden host).
  - Gates: typecheck **0** · `npx vitest run --maxWorkers=4 src/net/ src/input/ src/render/lobbyStateMachine.test.ts`
    **0** (48 files + 1 skipped / 940 + 3 skipped) · build **0** (entry **965.1 KiB**, +1.1 KiB for this step;
    branch **+9.2 KiB** of 10). First typecheck EXIT=1 — tests only (the old API in hostMovedOn.test.ts,
    `raceClaim.test.ts` 3-arg calls): RESOLVED by the re-pins above. First green run EXIT=1 — my mechanical
    guard counted a COMMENT naming `buildSnapshotMessage(` (`main.ts:2877`): RESOLVED (comment lines excluded).
    A bash heredoc failed to parse (exit 2, nothing ran) — BENIGN, re-run through a script file.
  - Hotspot `main.ts` hunks (net/session sections only): `isRejoinPending` import; `hostLobbyPresenceAtMs` →
    `hostLobbyAtMs` (3 lines); `clientJoinDeps.isRejoinPending` (1 line + comment); `hostMovedOn` call (2 fields);
    2 `broadcastQmPresence` calls + `world.gameState`; 3 snapshot-builder calls + `session.matchId`.

- **Step 3 — NETFR-3: the claim clock starts the first frame a survivor is visible WITHOUT the host.**
  `stepMigrationClaim` (`reconnectPolicy.ts`): `hostLost && !hasSurvivorToHostFor(...)` now returns
  `{ lossObservedAtMs: 0, claim: false }` BEFORE the banking line (it used to bank from the first frame of OUR
  OWN transport loss and test the survivor only at claim time). Consequence, intended: a 3-seat host death
  whose survivors blink out and back restarts the clock when they return (it was kept before).
  (a) `planConnectionFrame` gains a REQUIRED input `claimClockSinceMs` (main.ts passes
  `migrationLossObservedAtMs`, which the claim block wrote earlier in the SAME frame — pinned: the step's
  assignment precedes the one `planConnectionFrame(` call). The MIGRATING deadline is now
  `max(reconnectUntilMs, claimClockSinceMs + RECONNECT_GRACE_MS) + migrationExtraMs` — so it is NEVER shorter
  than before and only runs longer when the claim clock began after the loss (anchoring purely on the claim
  clock would have SHORTENED the window in a starve-then-drop case by up to the 6 s starvation lead; I chose
  max so no existing case moves). Without (a) the NETFR-3 timeline showed MIGRATING → TERMINAL at 36 s →
  hidden when the claim landed at 41.5 s.
  - Tests (failing first: 5 red → green): `reconnectPolicy.test.ts` `firstClaim` gained `othersAt(t)`:
    host absent from 10 s, B absent until 25 s then present, host back at 27 s → **null**; host never back →
    claim at **25 s + grace + ladder** (±1 frame); no survivor → the step reports no episode; ⚠ RESIDUAL
    (below). `connectionFrame.test.ts`: the NETFR-3 timeline stays MIGRATING from 25 s through the claim at
    41.5 s, never retries, and ends `migrationDeadline` at 25 + 15 + 11 s; NEGATIVE: a claim clock that
    started with or before the loss leaves the window exactly as it was; + the mechanical same-frame guard.
    Mutations (restored, `cmp`): M3a bank-then-gate (the S189 order) → 4 red · M3b deadline anchored on the
    loss only → 1 red.
  - ⚠ **THE L+22 s WINDOW: the minimal fix NARROWS it, it does not close it.** Constructed and PINNED as a
    test (`⚠ RESIDUAL (owner question)`): our loss at L; B's leg is an ordinary fresh join (~6.3–7 s,
    measured S189) → visible at ~L+7 s; H's leg sits behind Trystero's 23.3 s answering TTL (S189 traces:
    landing ~L+26–29 s). The clock starts at L+7, so the claim fires at **L+7+15+rung ≈ L+22–23.5 s**, before
    H is back — the same lone-host outcome (B rejects, H refuses, we stop reconnecting). The fix closes only
    the case where B's leg is itself late (≥ ~L+11 s with H by ~L+27). ALSO: from B's arrival
    `migrationCase` is true, so the loop stops retrying; H's leg then lands only if the in-flight attempt's
    handshake completes on its own. The verifier's stronger shape (a seat whose loss began with its own
    transport empty never claims, keeps reconnecting, accepts B's claim as 'advance') closes it, and changes
    C4/D4 → owner question, NOT built.
  - Gates: typecheck **0** · `npx vitest run --maxWorkers=4 src/net/ src/input/` **0** (47 + 1 skipped /
    878 + 3 skipped) · build **0** (965.1 KiB, +0.06 KiB). Hotspot `main.ts`: one line in the
    `planConnectionFrame({…})` input. Protocol: none (WHEN a peer claims is local; the claim and its
    verification are unchanged).

- **Step 4 — NETFR-6 (test only): the per-peer slot's lifecycle.** `snapshotBackpressure.test.ts` gains
  `gatedRoom(peers)` — the REAL `startStrategy` wiring handed a fake room, so `room.onPeerLeave/onPeerJoin`
  are the transport's own handlers; each targeted send is a promise settled per peer. One case, two peers:
  1 → both in flight, 2 waits; peer-0 settles and gets 2 (sibling unaffected); peer-1 LEAVES with 1 in
  flight, its dead send settles → peer-1 received only [1] (its waiting 2 never went out); peer-1 REJOINS →
  snapshot 3 goes at once, on a slot that is not the dead one; then a FAST rejoin (leave + join while 3
  still hangs on the dead channel, 4 waiting) → 5 goes at once, and when the dead send settles the stale 4
  never follows it. Green on the shipped code (no source change).
  - Mutations (byte-copy restore, `cmp`): **M-A** delete `handle.snapSlots?.delete(peerId)` (onPeerLeave) →
    **RED** — at the fresh-slot identity check, and with that assertion removed, BEHAVIOURALLY too
    (`expected [1, 3] to equal [1, 3, 5]`: the rejoined peer's snapshot queued behind the dead send).
    **M-B** drop `handle.peers.has(peerId) &&` from the `finally` → **GREEN — an EQUIVALENT mutant**, proven,
    not assumed: the only `handle.peers.delete` (`transport.ts:599`) sits in the same synchronous handler as
    the slot delete (`:600`), and the only slot writer (`:875`) creates a slot only for a peer in
    `handle.peers` — so `handle.snapSlots?.get(peerId) === slot` already implies `handle.peers.has(peerId)`.
    No test can separate them. Recorded, not counted; the guard is harmless defence in depth (merge owner:
    keep or drop — not touched here).
  - Gate: `npx vitest run src/net/snapshotBackpressure.test.ts -t NETFR-6` EXIT=0. Protocol: none.

- **Step 5 — NETFR-4 (test only): the "default suite never spawns vite" guard is MECHANICAL.** The count
  (`it.runIf(SPAWN_VITE)(` == 2) is replaced in `src/ci.e2ePort.test.ts` by a TypeScript-compiler walk of the
  file itself (`ts.createSourceFile`): EVERY `runVite(` call site's nearest enclosing test case must be
  `it.runIf(SPAWN_VITE)` (found by walking parents to the nearest `it…(` call); `runVite` may be referenced
  only as a callee or its own declaration (no alias escapes the gate); `spawn(` may be called only inside
  `runVite`; ≥ 2 call sites must be found (the walk cannot pass vacuously). The workflow check is unchanged
  and `.github/workflows/*` is untouched. `typescript` is already a devDependency; first test in the repo to
  use its API.
  - Mutations (restored, `cmp`): **M4a** ungate the NEGATIVE REACH case (`it.runIf(SPAWN_VITE)(` → `it(`) →
    RED (`runVite( at line 269 … expected 'it'`); **M4b** add a THIRD spawning case outside the gate — the
    exact hole the count could not see (the count stays 2) → RED (`expected 'it.skip'`).
  - ⚠ Non-zero exit, resolved: the patch went through a bash heredoc that collapsed `\\b` to a literal
    BACKSPACE byte inside `/^it\b/` (the guard would have matched nothing). Caught by reading the bytes;
    fixed; every changed file then scanned for control bytes (all clean) and for mixed line endings (none).
  - Gates: `npx vitest run src/ci.e2ePort.test.ts` EXIT=0 (8 + 2 opt-in skipped); typecheck EXIT=0.

- **Step 6 — NETFR-5: `S189_CANON_NOTES_net.md` rewritten.** The reconnect section now states the rules the
  code runs: TWO LOSSES, TWO RULES — D4 takes over a silent-but-connected host in ANY seat count (1v1
  included; the S189 "a 1v1 survivor never claims" line was the reversed first cut); the survivor gate
  applies ONLY on transport loss, and since S191 its clock starts when a survivor is visible without the
  host; retries continue past the grace and stop `RECONNECT_GIVE_UP_MS` (180 s) after the loss. Added: the
  S191 per-match-id wire table, the per-peer gate + NETFR-6 lifecycle, and a table of EVERY constant on this
  branch that is MINE (9 rows, `HOST_LOBBY_CONFIRM_MS` shown deleted) vs the inherited ones. This file's
  reversed "Hunt B-2 … in a 1v1 the client no longer claims" is STRUCK in place with the correction, and the
  C4 fault-3 line now says "on TRANSPORT loss only".

- **Step 7 — FINAL GATES (s189/net, tip after this commit; exit codes captured directly).** One pre-gate
  self-audit edit: `planConnectionFrame`'s anchor made explicit for a clock of 0 (`claimClockSinceMs > 0 ? … :
  reconnectUntilMs`) — the old form was correct only because `reconnectUntilMs ≥ RECONNECT_GRACE_MS` always
  holds; frame tests re-run EXIT=0 (47). Then: `npm run typecheck` **0** · `npx vitest run --maxWorkers=4`
  **0** (**405 files passed + 2 skipped / 6577 tests passed + 7 skipped**) · `npm run build` **0** — main entry
  **965.2 KiB**, cap 1100, headroom 134.8 (S191 steps cost **+1.2 KiB** over the merged tree's 964.0; branch
  total vs master's 955.9 = **+9.3 KiB**, inside the 10 KiB budget). Benign, recorded: vitest rewrote
  `pentagramBuildability.test.ts.snap` line endings only (`git diff --ignore-cr-at-eol` empty) → restored.
  No e2e run (brief: step 8 only). STOPPED for the audit.

## S191 FIX ROUND (audit wf_0593f6fe-d53, by message from the merge owner — fix ONLY these, one commit each)

| # | item | state | commit |
|---|---|---|---|
| 1 | FIX-1 / WIRE-1 (MED) — one Begin at a time; mint + store the id before the await | done | fd41fad |
| 2 | WIRE-3 (LOW) — "seated survivor" at both sites (claim input + `migrationCase`) | done | 50f1f6e |
| 3 | FIX-3 — never START a claim clock without a seated survivor, but KEEP a running one | done | 6004e8d |
| 4 | SEAM-2 (LOW) — an OS auto-repeat Escape is not a second press | done | 36cf105 |
| 5 | FIX-4 (test) — prove SPAWN_VITE is OFF by default | done | fe7fec1 |
| 6 | SEAM-4 (test) — every Escape branch in `Controls.onKeyDown` consumes the event | done | 68b4532 |
| 7 | gates + report | done | (this commit) |

- **FIX-1 / WIRE-1.** Mechanism (audit, confirmed): both strategies deliver LOBBY_READY, so the quickmatch
  gate fires Begin twice; `world.gameState` is still LOBBY while `beginMatch` awaits `signWarrant`, so
  main.ts's LOBBY gate lets both through — #1 sent `.1` and started the match, #2 minted `.2` and the host
  kept it while the clients held `.1` → every later C4 rejoin of that LIVE match was held as 'new-match'.
  Fix: `NetSession.beginInFlight` (new; `makeNetSession` false; `teardownNet` false) — `beginMatch` returns
  at once if set, sets it synchronously before its first await, clears it in `finally`; the id is minted and
  stored on the session BEFORE the await and START_GAME_SIGNAL carries the STORED value (omitted if a
  teardown nulled it mid-sign). A side effect, intended: the second Begin no longer re-dispatches
  START_GAME either. Tests (`sameMatchProof.test.ts`, through the real `createHostStartHandler` +
  `createBeginMatchHandler`, a controllable `sign`): two LOBBY_READY copies inside the sign window → exactly
  ONE START_GAME_SIGNAL, host id == wire id == the id a real `connectAsClient` stores, and a later rejoin's
  same-id snapshot is applied; a double-clicked manual Begin (no LOBBY gate) → one signal; teardown clears
  the latch. PRE-FIX 3 red (two signals) → green. Mutation: drop the `if (beginInFlight) return` → 2 red.
  `vitest src/net/` EXIT=0 (39 + 1 skipped / 615 + 3 skipped), typecheck EXIT=0. Protocol: none (fewer
  duplicate messages, same fields). Recorded: `hostHandlers.ts` carries one PRE-EXISTING lone CR (`\r\r\n`
  after the constants import, present at base 5934d3b) — preserved, not touched.

- **WIRE-3 — only a SEATED survivor counts.** New pure `seatedSurvivors(lastRoster, transportPeerIds,
  selfPeerId, lostHostPeerId)` (`reconnectPolicy.ts`): Begin-roster entries that are not us, not the lost
  host, and on our transport now. `MigrationClaimInput` gains a REQUIRED `seatedSurvivorIds`, and the
  transport-loss gate is `hasSurvivorToHostFor(i.seatedSurvivorIds, …)` (it was `alivePeerIds`: any peer).
  main.ts uses it at BOTH sites: the `stepMigrationClaim` input and `migrationCase` (was
  `peerCount() > 0`, so a stray kept the migration case on and the loop never retried a reachable host).
  Tests (5 red → green): the pure set (1v1 + stray → empty; 3-seat → the seated one; null roster → empty);
  1v1 + a stray, host gone → NO claim (`firstClaim` gains `roster`); with only a stray `migrationCase` is
  false and the loop RETRIES (> 3 attempts in 50 s); NEGATIVE — 3-seat with a seated survivor + a stray
  claims at grace + rung, as before; a mechanical main.ts guard (two `seatedSurvivors(` calls, one per site;
  `migrationCase` no longer reads `peerCount()`). Mutations: gate back on `alivePeerIds` → 1 red (the 1v1
  stray); `migrationCase` back to `peerCount() > 0` → 1 red (the guard). `vitest src/net/` EXIT=0 (39 + 1 /
  620 + 3), typecheck EXIT=0. Hotspot `main.ts`: the import, one input line, the `migrationCase`
  expression. Protocol: none (local WHEN).

- **FIX-3 — never START a claim clock without a seated survivor, but KEEP a running one.** The NETFR-3 line
  returned `lossObservedAtMs: 0` whenever no seated survivor was visible, so a REAL 3+-seat host death
  restarted its grace on every survivor blink (measured by the new test: a one-frame blink at L+10 s moved
  the claim from L+16.5 s to L+26.5 s). Now it returns `{ lossObservedAtMs: i.lossObservedAtMs, claim: false }`
  — 0 stays 0 (NETFR-3 intact: the "B at 25 s, host back at 27 s → no claim" case and the RESIDUAL stay
  green), a running clock is kept. Tests (3 red → green): the step keeps 12 000 and starts nothing from 0;
  host dies at L with B connected, B blinks for ONE frame at L+10 s → claim at L + grace + rung (±1 frame);
  a claim that falls due DURING a 2.5 s blink fires on the first frame B is back. The old NETFR-3 NEGATIVE
  ("reports no loss episode" from 12 000) is RE-PINNED to FIX-3's rule, not deleted. Mutation: back to
  `lossObservedAtMs: 0` → 3 red. `vitest src/net/` EXIT=0 (39 + 1 / 622 + 3). Canon notes' survivor-gate
  paragraph amended for WIRE-3 + FIX-3 (my own notes, one paragraph). Protocol: none.

- **SEAM-2 — holding Escape no longer leaves the match.** `DoubleEscapeKey` gains `repeat?: boolean`
  (`KeyboardEvent.repeat`); `makeDoubleEscapeLeave` returns on `e.repeat === true` right after the key
  check, without touching `lastEscapeAtMs`. main.ts registers the handler on `window` keydown unchanged, so
  the browser's own event carries the flag. Tests (`doubleEscapeLeave.test.ts`, through the real `Controls`
  in main.ts's listener order; `press` gains a `repeat` flag, repeats 33 ms apart): Ra aim cancel + 3
  repeats → no leave; a bare press + 3 repeats → no leave; press, 3 repeats, then one discrete press
  399 ms after the first → leaves exactly once. PRE-FIX 3 red (1, 2 and 2 leaves) → green. Mutation: drop
  the repeat guard → 3 red. Protocol: none (local input).

- **FIX-4 (test only) — `SPAWN_VITE` is proven OFF by default.** New case in `src/ci.e2ePort.test.ts`
  (TypeScript-compiler walk of the file): exactly ONE binding named `SPAWN_VITE` anywhere (variable,
  parameter, binding element, function/class — so an inner shadow is caught), a module-scope `const`
  initialised to exactly `process.env.SPARK_SPAWN_VITE === '1'`; `process.env.SPARK_SPAWN_VITE` read in that
  initialiser only; no assignment to anything under `process.env`; the name as a string literal only as the
  argument of the workflow check's `.toContain` (so `vi.stubEnv('SPARK_SPAWN_VITE', …)` or
  `process.env['SPARK_SPAWN_VITE']` are caught; the test builds its own copy of the name by concatenation so
  it is not itself a stray). Green on the file. Mutations (each run with `-t FIX-4`, so no mutated run spawns
  vite; restored, `cmp`): `= true` → RED (initialiser) · `!== '0'` → RED (initialiser) · an inner
  `const SPAWN_VITE = true` in the describe → RED (2 bindings) · a top-of-file
  `process.env.SPARK_SPAWN_VITE = '1'` → RED (2 env reads; the write check would also fire). typecheck
  EXIT=0; `vitest src/ci.e2ePort.test.ts` EXIT=0 (9 + 2 opt-in skipped).

- **SEAM-4 (test only) — every Escape branch in `Controls.onKeyDown` consumes the press.** New case in
  `doubleEscapeLeave.test.ts`: `controls.ts` comments stripped, `onKeyDown`'s body sliced by brace matching
  from its exact signature; each `e.key === 'Escape'` branch's block must call `consumeCancel(e)` BEFORE its
  `return`; the branch count is PINNED at **2** (Ra aim, held tower), and the total `consumeCancel(e)` in the
  body must equal it. The s191/owner Scorched Earth aim cancel turns it red at merge until it is wired AND
  the pin is raised. Green on the file. Mutations (restored, `cmp`): drop the Ra-aim `consumeCancel` → RED
  (branch #1); a THIRD Escape branch that returns without consuming → RED (3 ≠ 2); `consumeCancel` moved
  after the tower branch's `return` → RED (branch #2 order). `vitest src/input/doubleEscapeLeave.test.ts`
  EXIT=0 (13).

- **FIX-ROUND GATES (tip after this commit; exit codes captured directly):** every changed file scanned for
  control bytes (none) · `npm run typecheck` **0** · `npx vitest run --maxWorkers=4` **0** (**405 files passed
  + 2 skipped / 6592 tests passed + 7 skipped**; +15 tests over 3f5ab8f) · `npm run build` **0** — main entry
  **965.6 KiB** (+0.4 over 3f5ab8f), cap 1100, headroom 134.4; branch vs master's 955.9 = **+9.7 KiB**, inside
  the 10 KiB budget with 0.3 to spare. Benign, recorded: vitest rewrote `pentagramBuildability.test.ts.snap`
  line endings only (`git diff --ignore-cr-at-eol` empty) → restored. NOT in this round (by the merge
  owner's word, recorded for the owner): FIX-2 (3+-seat survivors never 'pending' when a departed host
  re-hosts the same room code) and SEAM-1 (the terminal overlay text while retrying continues — with step 8).
  Step 8 NOT started. STOPPED for the re-audit.

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
     reconnects -> both sides stuck. -> on TRANSPORT loss only (FR-4 narrowed it; S191 NETFR-3 moved the
     clock start), the claim requires `hasSurvivorToHostFor(alivePeers, hostPeerId)`
     (the rule `main.ts`'s own overlay-split comment already stated: "peerCount === 0 = OUR transport
     died — the S82 reconnect-cycle is the only path back").
- Falls out for free: hunt A3 (a DEPOSED host re-joining its own dying room -> ghost peer) — the same
  `disconnect(); connectAsClient()` pattern at `main.ts:2586-2587`, now fixed by (1). ~~Hunt B-2 (a 2p host
  frozen >= 21 s gets deposed): in a 1v1 the client no longer claims (the host is the only alive peer) ->
  the board pauses until the host returns.~~ ⛔ STRUCK (S191 NETFR-5) — REVERSED by FR-4 (audit NET-4, S190):
  that "falls out" was an UNAPPROVED change to D4, and it was undone. A frozen-but-CONNECTED host is taken
  over by D4 at starvation 6 s + grace 15 s + the ladder rung in ANY seat count, 1v1 included (S124 design;
  the thawed host rejoins as a client, S125 v2). The survivor gate (`hasSurvivorToHostFor`) applies ONLY when
  the host has left OUR TRANSPORT. 3+-seat migration unchanged (a survivor exists).
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

- ⭐ S191 — the complete list (net constants S189 + S191) is the table in `S189_CANON_NOTES_net.md`.

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

## S191 MERGE OWNER — FIX-3 REVERTED ON MASTER (deploy #5)
The re-audit (wf_de15cae4-4a8 ROUND-1, MED) found FIX-3 kept claim clock undoes NETFR-3 in the usual real-drop order (starvation first, then our own transport loss). Reverted 6004e8d on master; NETFR-3 minimal shape is live (known cost: a survivor blink during a real 3+ seat host death restarts the claim clock). Carried to S192 with ROUND-1/ROUND-2/ROUND-3.

## S192 (audit wf_de15cae4-4a8 ROUND-1..3 + FIX-2 ruling + SEAM-1; then C4 step 8)

- **Step 1 — merge master (e4d52dc).** `git merge master` FAST-FORWARDED (master already held 02e493d + the
  70d90fc revert of FIX-3): no conflicts, and the branch carries NO FIX-3 (verified: `reconnectPolicy.ts:182`
  is the NETFR-3 reset line). Gates on the merged tree (captured `$?`): typecheck **0** · `npx vitest run
  --maxWorkers=3` **1** — ONE red, `structureComponents.test.ts` "one sweep beats componentOf-per-primitive"
  (a wall-clock perf ratio, 126.7 vs 120.3 ms, under 8-worktree load; not a net file) → re-run ALONE **0**:
  BENIGN (timing). 6705 passed + 7 skipped / 414 files. build **0**, entry **972.7 KiB** (= master).
  Benign, recorded: vitest rewrote `pentagramBuildability.test.ts.snap` line endings → restored.
- **Step 2 — ROUND-1 (MED): FIX-3 redone with `clockStartedHostAbsent`.** `MigrationClaimInput/Step` gain a
  REQUIRED `clockStartedHostAbsent` (tsc forces main.ts). Set on the clock's FIRST frame only (= `hostLost`);
  in the no-seated-survivor branch a running clock is KEPT only when the flag is true, else dropped (0/false);
  cleared with the clock (the not-lost-not-starved return, main.ts match-reset + D2-recovered sites).
  main.ts: `migrationClockStartedHostAbsent` beside `migrationLossObservedAtMs` (decl + 2 clears + in/out of
  the step). Tests (`reconnectPolicy.test.ts`): PRE-FIX 4 red / 24 green (the two FIX-3 blink cases, the
  NEGATIVE re-pinned with the flag, the flag-lifecycle case) → POST 28 green. ROUND-1 cases: the auditor's
  timeline (starvation clock at L+6 with H present, legs gone L+8/L+8.5, B back L+24, H L+26) → **null**;
  same with H never back → claim at B's return + grace + rung. Mutations (byte-copy restore, `cmp`):
  M-A keep every clock (the 6004e8d shape) → 3 red incl. the ROUND-1 null case · M-B reset every clock (the
  NETFR-3 shape) → 3 red incl. both blink cases. ⚠ My first ROUND-1 timeline (B back at L+15) was green under
  M-A too — a clock from L+6 is not yet due at L+15 — so it was re-pinned to the auditor's numbers (B lands
  15 s after the legs leave). ⚠ Sub-case left as the auditor shaped it: a clock that began as STARVATION and
  then saw the host leave with B visible keeps flag=false, so a later B blink still restarts it (upgrading
  the flag there would re-open ROUND-1 whenever the two legs leave a few frames apart). Gates: typecheck **0**,
  `npx vitest run src/net/` **0** (39 files / 626). Protocol: none (local timing only).

- **Step 3 — ROUND-2 (LOW): migrationCase for a seat with no Begin roster.** The auditor's option (a), as a
  pure `isMigrationCase` (`reconnectPolicy.ts`): host / no warrant / no transport → false; NO roster → any
  transport peer (the S125 v2 rule — a deposed ex-host rejoined as a client); a roster → a SEATED survivor
  (WIRE-3 kept). main.ts's `const migrationCase =` now calls it (one site). New `migrationCaseRoster.test.ts`
  (6): PRE-FIX (the roster-null branch returning the old `false`) 2 red / 4 green → POST 6 green — incl. a
  frame-by-frame REACH: the ex-host with its successor lost and C connected fires NO retry in 40 s (the
  auditor's probe saw disconnect+rejoin every 8 s) + a mechanical main.ts guard. `connectionFrame.test.ts`'s
  WIRE-3 "BOTH sites" guard re-pinned (it went red BY DESIGN: `seatedSurvivors(` is now called directly once
  in main.ts, the second site goes through `isMigrationCase`). The claim gate is untouched (it already needs
  `lastRoster !== null`), so the ex-host still never claims. Gates: typecheck **0**, `vitest src/net/` **0**
  (40 files / 632). Protocol: none.

- **Step 4 — ROUND-3 (LOW, test only): FIX-4 guard holes.** Reproduced first: the S191 FIX-4 case run on the
  HEAD file with `Object.assign(process.env, { SPARK_SPAWN_VITE: '1' })` / `Reflect.set(process.env, 'SPARK_' +
  'SPAWN_VITE', '1')` inserted above the const → exit **0** both (green over the hole). Now the walk is a
  function of the source text, `spawnGateViolations(text)`, and also flags: any call handed `process.env`
  (Object.assign / Reflect.set / Object.defineProperty / …), any `stubEnv(` call, any template naming the
  variable, `delete process.env…`. A new case runs it on NINE mutated copies of the file (= true, a top-of-file
  assignment, Object.assign, vi.stubEnv(`…`), Reflect.set with concatenation, vi.stubEnv with concatenation,
  Object.defineProperty, delete, `let`) and requires each RED — so the mutation tests are permanent, not a log.
  The workflow list is `readdirSync('.github/workflows')` (both sites), and a new case asserts package.json,
  vite.config.ts and playwright.config.ts do not name it. Two self-inflicted reds on the first run (my own
  message template and the decl-line string named the variable) → resolved by building them from `ENV_NAME`.
  `npx vitest run src/ci.e2ePort.test.ts` **0** (11 + 2 skipped). Protocol: none.

- **Step 5 — SEAM-1 (MED): the terminal overlay no longer says "return to title to retry" while retrying.**
  `ConnectionOverlay` 'terminal' gains `retrying` (= `!gaveUp && !isHost && hasRoomCode && !migrationCase`, the
  predicate `reconnectRetryDue` gates on minus the per-attempt time) and `waitingForPeers` (= `!gaveUp && isHost`);
  zombie-deposed / migration-deadline terminals carry neither. New `setTerminal(retrying, waitingForPeers)` on the
  overlay handle (+ `LobbyScreen.setConnectionLostTerminal`) picks the help line: client → "still reconnecting —
  or return to title"; host → "waiting for the other player to reconnect — or return to title"; neither → the
  old line (then true). main.ts's terminal branch calls it instead of `setConnectionLostReconnecting(false)`.
  Tests: PRE-FIX 10 red / 12 green → POST green — `connectionFrame.test.ts` (client flag true until the 180 s
  give-up then false, and no retry fires after it; host flag likewise; migration-deadline + zombie carry
  neither; mechanical main.ts site) + new `src/render/connectionLostTerminal.test.ts` (4, real overlay factory:
  each line, never "to retry" while retrying, repaint back to RECONNECTING/MIGRATING); the S189 migration-
  deadline `toEqual` re-pinned with the two flags. ⚠ NOT changed (outside "fix only this"): the grace
  countdown "retrying automatically (Ns)" still counts to 0; the terminal line that follows now says it is
  still reconnecting, so the two read consistently. ⚠ Overlay wording is MINE (the auditor's suggestion,
  verbatim). Gates: typecheck **0**, net + overlay tests **0** (42 files / 645). Protocol: none.

- **Step 6 — FIX-2 (owner ruling): a host that quits is replaced by the next in line, even when he re-hosts
  the same room.** The audit case reproduced as a pure drive FIRST (`hostDeparted.test.ts` "BEFORE"): H quits
  at 20 s, his re-hosted LOBBY transport lands on our room at 28 s → the claim clock RESETS and the next in
  line only takes over through D4 starvation counted from H's return (≥ 49 s), with no overlay meanwhile.
  Shape (the auditor's "feed it into the claim as host lost, not into a title verdict"):
  · `NetSession.hostDepartedPeerId` (new; null in `makeNetSession`, cleared by `teardownNet` and outside
    PLAYING in main.ts). main.ts's `onHostSignal` latches it to the followed host on 'lobby' / 'new-match'
    (`classifyHostMessage` — a LOBBY_PRESENCE in phase LOBBY, or a presence/snapshot of another match), with
    one `[net] HOST LEFT THE MATCH (…)` line. NETFR-1 untouched: a hidden live host says MATCH + our id → no
    signal → no latch.
  · `matchPeerIds(ids, departed)` (pure) = the transport's peers minus a departed followed host. main.ts reads
    host presence through it at EVERY frame site: the presence stamp, the claim's `alivePeers`, `hostLost`,
    `peersGone` (`matchPeers.length === 0 || hostLost`), `migrationCase`'s peers, the plan's `peerCount`.
  · `observesHostLoss` (pure) replaces clientHandlers' inline `hostGone` for MIGRATION_CLAIM acceptance: gone /
    starved as before, OR departed (a latch for a host we no longer follow proves nothing) — so B accepts A's
    claim while H's lobby sits fed-looking on the transport.
  · the moved-on verdict (pending rejoin) sends to title ONLY when nobody seated is left to wait with
    (`isMigrationCase` over `matchPeers`); with a seated survivor the migration takes it (owner ruling).
  Tests: `src/net/hostDeparted.test.ts` (12): PRE-FIX the file red (11 — the helpers do not exist) → POST 12
  green: rank 0 claims at proof + grace, rank 1 one rung later, a proof landing before H's transport keeps the
  quit-time clock, acceptance with/without the latch, pending + survivor → no title / 1v1 → title, and
  mechanical guards on every main.ts site + clientHandlers + teardown. `migrationCaseRoster.test.ts`'s count
  re-pinned 1 → 2 (the moved-on verdict is the second `isMigrationCase(` site). Mutations (byte-copy restore,
  `cmp`): `matchPeerIds` returns every id → 4 red · drop the departed clause from `observesHostLoss` → 1 red.
  First typecheck EXIT=1: `isSnapshotStarved` unused in clientHandlers after the swap → import dropped.
  ⚠ MINE (timing): the frames between H's transport landing and his presence arriving see a returned,
  not-yet-starved host, so the clock resets there (the NET-4 rule) and restarts at the proof → the claim is
  at PROOF + grace + rung. Skipping the grace on a positive proof would be faster — NOT built (unruled).
  ⚠ **The ruling's second clause ("if the same player rejoins … he's like player three") is NOT built — an
  owner question with the measured facts:** (1) a host that QUIT cannot rejoin the successor's match at all
  today: the successor never runs the host HELLO path (its handler stack is the client's + the additive
  successor handler: NETSNAPSHOT/MIGRATION_CLAIM/INTENT only), and a fresh join is never seated (late joiners
  are strays); (2) a host that FROZE and thawed (S125 v2) rejoins as a client and re-binds to his OLD seat 0
  (the successor's `hostSeats` is the full frozen roster) — same castle, same "P1" banner (`raceBanners.ts`
  labels `P${seat + 1}`) — but he is never in the succession line again (seat 0 is never warranted). So "not
  player one" already holds for HOSTING order; it does not hold for the seat/label, and he can never host
  again. Making him a literal new lower seat needs mid-match seating on the successor (HELLO handling, a new
  player/castle) and a line ordered by join order instead of seat number (warrant re-issue or host-key claim
  verification, and reconciliation by line position instead of lowest-seat-wins) — wire + sim, a bump.
  Gates: typecheck **0**, `vitest src/net/ + overlay` **0** (42 files / 652). Protocol: see the bump verdict.

- **Step 7 — step-A gates (tip a2fa46c), captured `$?`:** typecheck **0** · `npx vitest run --maxWorkers=3`
  **0** (415 files + 2 skipped / 6739 tests + 7 skipped) · build **0**, entry **974.6 KiB** (cap 1100, headroom
  125.4; master 972.7 → this branch's S192 work **+1.9 KiB**). Benign: the pentagram snapshot line-ending
  rewrite → restored. **Net e2e** (`npx playwright test e2e/reconnect.spec.ts e2e/reconnect-hard-blip.spec.ts
  e2e/exit-match.spec.ts e2e/hostmigration.spec.ts --workers=1`) on THIS worktree's hashed port **21241** —
  verified mine while running: the listener's command line is
  `…\.claude\worktrees\s189-net\node_modules\…\vite.js --port 21241 --strictPort --host`. Exit **1**:
  **16 passed, 1 failed** — the failure is `reconnect-hard-blip` "inside the grace" (attempts at 1630 / 9806 /
  17958 ms, recovered at **21 840 ms**, grace 15 000): the KNOWN C4 timing item that step 8 exists for
  (S191 measured 6/7 recovered, only 2 inside the grace), not a regression — the match came back. All four
  hostmigration cases (D3, D4 production, v2 frozen-then-thawed host) and both exit-match cases green.

- **Step 8 — C4 retry tuning: `RECONNECT_RETRY_MS` 8 000 → 35 000 (⚠ MINE, measured).** Measured on
  `e2e/reconnect-hard-blip.spec.ts` (real WebRTC, public relays, this worktree's own port 21241), varying only
  the constant (temporary edits, restored byte-for-byte from a copy):
  · **8 s (S189):** 9 runs (1 in the step-A e2e + 8) → 9/9 recovered, **2/9 inside the grace** (5.8, 5.9 s);
    the rest at 21.8 / 24.7 / 29.4 / 29.7 / 30.4 / 30.6 / 40.4 s — each ~4 s after the LAST attempt; the
    attempts at +9.5 and +17.6 s never landed once.
  · **24.5 s:** 14 runs (8 + 6 with both pages' console captured) → 8/14 inside the grace (5.7–7.8 s); late
    ones 25.6 / 25.7 s with ONE attempt (the stuck first attempt landing in-room on its own), and 27.3 / 30.4 s
    / one NOT within 45 s where the +26 s teardown hit exactly that in-room recovery.
  · **35 s:** 10 runs → **10/10 recovered, 7/10 inside the grace** (6.3–7.6 s), late 23.0 / 28.0 / 32.7 s, never
    a second attempt.
  Diagnosis from the captured consoles: the host sees `cause=peer-left` at +0.3 s, and then NEITHER side has an
  RTCPeerConnection for ~23 s in the slow runs — the first attempt's signalling is stuck behind Trystero's
  per-peer `answeringTtlMs` / `offerPostAnswerTtlMs` (23 333 ms, `signal-handler.mjs`; nostr relays were
  rejecting publishes throughout — "pow: 28 bits needed", "spam not permitted"), after which the next announce
  (`announceIntervalMs` 5 333) re-handshakes. A teardown inside that window cannot land and restarts it.
  35 s = TTL + one announce + the 6.3 s fresh join, rounded up. Tests: the cadence test now pins it against the
  three Trystero constants READ FROM node_modules (a library upgrade that moves them goes red) + a new frame
  case (an attempt stuck 25.6 s lands under the new cadence, never under the 8 s one) — PRE-FIX 2 red → green;
  WIRE-3's "keeps retrying" count re-pinned from a literal `> 3` to the derived count. `JOIN_STALL_WARN_MS` import
  dropped from `reconnectPolicy.ts` (typecheck TS6133). Canon notes updated (constant + table row). ⚠ The
  hard-blip spec's "inside the grace" assertion stays quarantine-flaky: ~1/3 of runs still sit in the stuck
  window (only a Trystero-side change, or a HOST-side transport re-arm, could shorten it — an owner question,
  not built). Not touched: `RECONNECT_FIRST_RETRY_DELAY_MS` (1 s), the 15 s grace, the 180 s give-up.

- **Step 9 — final gates on the shipped constant (tip 487040f), captured `$?`:** hard-blip ×6 (the unmodified
  spec) exit **1** — 6/6 recovered, 4/6 inside the grace (5.9 / 6.3 / 6.6 / 7.4 s; late 23.9 / 32.3 s, one
  attempt each) — the quarantine-flaky "inside the grace" assertion, expected, recorded. **Net e2e** (reconnect,
  reconnect-hard-blip, exit-match, hostmigration; own port 21241) exit **0 — 17/17 passed** (hard-blip 9.3 s).
  35 s cadence in total: **17/17 recovered, 12/17 inside the grace** (8 s cadence: 9/9, 2/9). typecheck **0** ·
  `npx vitest run --maxWorkers=3` **0** (415 files + 2 skipped / 6740 + 7 skipped) · build **0**, **974.6 KiB**
  (headroom 125.4; +1.9 KiB over master 972.7). Benign: pentagram snapshot line endings → restored.
- **DONE — nothing in flight.** Commits: 8dfa641 ROUND-1 · 5a297c3 ROUND-2 · ab5e7d2 ROUND-3 · d3bd907 SEAM-1 ·
  a2fa46c FIX-2 · 44decce step-A gates · 487040f C4 step 8 · (this) final. Merge (step 1) was a fast-forward to
  master e4d52dc — no merge commit, no conflicts, no FIX-3.
- **Bump verdict: NO bump owed by this round.** No wire field, no discriminant, no hash or sim change. FIX-2
  changes only LOCAL decisions (when a survivor counts its followed host as lost, and when it accepts a claim);
  seat assignment is NOT changed (the "new lower seat" clause was not built). Mixed builds converge: an old-52
  survivor rejects the successor's claim while the departed host's lobby looks fed, then accepts it once it
  starves (6 s after the host's return). If the merge owner bumps anyway, list FIX-2 as behaviour only.
- **Open owner questions:** (1) FIX-2's second clause — a returning ex-host as a NEW lower seat ("player
  three"): today a QUIT host cannot rejoin a successor's match at all, and a frozen-then-thawed one gets his old
  seat 0 back but can never host again; building it = mid-match seating + succession by join order (wire + sim,
  a bump). (2) Skip the grace on a positive departure proof (faster takeover; MINE default keeps the grace).
  (3) NETFR-3 stronger shape vs the residual L+22 s window (unchanged, still pinned). (4) C4: ~1/3 of hard blips
  still sit in Trystero's 23.3 s stuck-handshake window — only a library change or a HOST-side transport re-arm
  (free in a 1v1 with no peers left) could shorten it.

## S192 audit fix round (FIX FIRST — A1 HIGH, L1; B1/L2/L3 owner notes)

- **Step 0 — `git merge master` (ada2caa):** merge commit b5e8957, no conflicts. Benign: the pentagram snapshot
  line-ending rewrite → restored.
- **Step 1 — A1 (HIGH): FIX-2 could depose a LIVE host.** Reproduced first with the auditor's throwaway
  `zzAudit.test.ts`, copied in, run, deleted: on the pre-fix tree a phase-LOBBY presence classifies `'lobby'`
  mid-match with NO rejoin pending, the seq fallback classifies `'new-match'` on our own id, and with the latch
  that main.ts took on EVERY signal a 1v1 tore its live transport down at 2.0 / 37.0 / 72.0 / 107.0 / 142.0 /
  177.0 s and a 3-seat rank 0 claimed a fed, present host at +15 s (25 008 ms).
  Fix (the auditor's shape): the latch moved out of main.ts's `onHostSignal` into clientHandlers and needs BOTH
  · `departureProofOf` (pure, new): a presence in phase LOBBY, or a presence / snapshot with a DIFFERENT match
    id — never the seq-regression fallback, never outside a match or from another sender;
  · `shouldLatchDeparture` (pure, new): a rejoin is pending, OR this host was seen ABSENT from our transport
    during this match (`JoinAttemptDeps.hostAbsentThisMatch`; main.ts records `hostAbsentSeenFor` from the
    RAW transport each frame while a networked client is PLAYING, keyed by host id, cleared outside PLAYING) —
    i.e. the message comes from a host that RE-APPEARED, the real FIX-2 case of H re-hosting.
  Chosen over "`hostPresence.presentSinceMs` after Begin" because the presence message can arrive before the
  next rAF frame re-stamps `presentSinceMs` (Trystero's join event and the beacon land within ms), which would
  drop the genuine proof; the absence was always observed in an EARLIER frame.
  Tests: new `src/net/departureLatch.test.ts` through the REAL `connectAsClient` route — beacon at Begin + 5 ms
  with the host present → no latch; seq regression on our id (and id-less) → no latch even when pending + absent;
  genuine FIX-2 (absent this match, then LOBBY) → latch; pending rejoin into the lobby → latch; other-match
  presence → latch; our own MATCH presence → never; plus both pure halves and mechanical main.ts guards.
  Mutations (byte-copy restore, `cmp`): `shouldLatchDeparture` always true → 2 red (incl. the Begin+5 ms case);
  `departureProofOf` accepts any snapshot → 2 red (incl. the seq case); drop the absence clause → 3 red (incl.
  the genuine case). `hostDeparted.test.ts`'s "a host signal latches" guard re-pinned to the clientHandlers site.
  Gates: typecheck **0**, `vitest src/net/` **0**. Protocol: none (local).
