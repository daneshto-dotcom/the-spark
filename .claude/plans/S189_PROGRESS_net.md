**STATUS: IN-PROGRESS**

# S189 — `s189/net` progress (worktree agent, brief = PDR §5.1: C4 disconnect, C5 lag at wave 5, C6 quickmatch seat)

Branch `s189/net`, based at `15035b9` (live deploy #2, PROTOCOL_VERSION 50). Commits are LOCAL, never pushed.
The merge owner resumes from this file if this agent is cut off.

## Steps

| # | step | state | commit |
|---|---|---|---|
| 0 | progress skeleton | done | d4e9ae7 |
| 1 | e2e webServer `--strictPort` + its test | done | 68b04a7 |
| 2 | C6 quickmatch seat — find the per-machine bias, fix, two-seeker test in both arrival orders | done | (this commit) |
| 3 | C5 lag — MEASURE wire + host frame time at a wave-5 racial board, fix what the numbers name | next | |
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
