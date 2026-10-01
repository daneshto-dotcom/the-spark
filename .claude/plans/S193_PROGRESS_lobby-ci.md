# S193 PROGRESS — lobby-ci (`s193/lobby-ci`)

## ⭐ WIDENED (coordinator, R193-CI): every failing e2e job in the last 20 master runs + relay rotation
NEXT STEP: worker-bots wall-cap fix (in progress), then soak, quarantine (hostmigration x2, exit-match), relays.

### Triage of last 20 master runs (gh run list --workflow e2e.yml --branch master -L 20)
Run conclusion = failure (the emails) ONLY via gating jobs: e2e-lobby (fixed above), e2e (gating), e2e-worker-bots.
e2e-soak and e2e-quarantine are `continue-on-error: true` — they never email (36844358659, 36765928848 = success with them red).
e2e-protocol and e2e-races: GREEN in all 20 runs. The owner's email lists the RUN (all jobs), not the failing job —
42c421c/b37cc72/1e9d1da/f6ae104 were red from e2e-lobby (+ 1e9d1da's checkout timeout), not protocol/races.
- e2e (gating) red in 36840314291, 36822641370, 36689223067 (hunter + worker: `gatherer banks a shape` 30 s WALL wait,
  720 s cap): HARNESS defect, ALREADY FIXED by 811121ba (S191 A-4, tick-budgeted wait; landed 48207dc→521f23a).
  Green in all 13 runs since. 36871399300's e2e red = Checkout 3-min timeout (infra).
- e2e-worker-bots red once (36867560496): helper itself says WALL BACKSTOP BOUND FIRST — 1104/1800 ticks in 180 s
  (6.12 ticks/s). HARNESS defect: GROWTH_WALL_CAP_MS (180 s, sized for the 1200-tick growth wait at 11 t/s) was
  "reused unchanged" as the backstop of the 1800-tick FIRST-build wait. Fix in progress.


Branch base: master `71abc276` (contains `8693fdd`; `git merge master` = no-op, no conflicts).

## FINAL REPORT
- tip: see `git log -1` (this commit); fix `96393070`. Merge: base master `71abc276`, `git merge master` no-op, 0 conflicts.
- Gates (exit codes from files): typecheck 0 · vitest --maxWorkers=3 0 (470 files passed / 4 skipped; 7241 tests passed / 11 skipped) · build 0.
- Entry 1034.7 KiB, delta 0 (no src/ change; headroom 65.3 KiB, none used).
- e2e:lobby locally on own port 33396: run1 exit 0 (5 passed, 2.7m) · run2 exit 0 (5 passed, 2.9m) · run3 exit 0 (5 passed, 2.6m); late-4th-joiner test 1.4 m each.
- Bump verdict: NO BUMP — only e2e/CI/test files changed; nothing on the wire, nothing either build computes differs.
- MINE: `LATE_JOINER_BUDGET_MS = 330_000` and the lane's 22/32 min are my numbers from the CI traces (282 s measured + margin). Recommendation: keep; if CI minutes matter, the alternative is cutting render cost in the 4-page test, not the budget.
- Seams: (1) `e2e.yml` + `ci.e2eLanes.test.ts` + `playwright.config.ts` are shared files — re-run ci.e2eLanes after merging any other branch that touches them. (2) Residual, NOT fixed (out of scope): a restarted pooled offer carries 0 inline ICE candidates and depends on trickled candidate messages through relays that are partly rejecting writes (purplerelay/offchain/wellorder; mostr DEAD). One CI attempt of 12 lost a stale-path pair this way-or-by-flake. Candidates for later: relay rotation (RELAY_HEALTH.md), or waiting for gathering on the restart path.
- NOT DONE: nothing in scope. The CI proof itself happens on the next push of this lane (merge owner).

## VERDICT: (b) TEST-HARNESS DEFECT — the whole-test budget. Not (a), not mainly (c).

The T1 fix WORKS on CI. The late-4th-joiner test's own `test.setTimeout(150_000)` is smaller than the
CI runner's measured critical path, so a mesh that had already passed the T1 assertion could not finish.

### Evidence (traces + error-context of all 12 attempts, 4 runs; artifacts `playwright-lobby-results`)
| run | attempt | died on | host state at death |
|---|---|---|---|
| 36882836513 | 1 | 150 s test cap | **WIN, 4 players** |
| 36882836513 | retry1 | `early peer 0 sees the other two` (60 s) | LOBBY, peerCount 1 |
| 36882836513 | retry2 | 150 s test cap | **PLAYING, 4 players** |
| 36877965841 | 1 / r1 / r2 | 150 s test cap | LOBBY (r1 trace: 3-mesh at +108 s, 4th still loading UI at the cap) |
| 36875812341 | 1 / r1 / r2 | 150 s test cap | LOBBY (r1 trace: joiner 2 UI took 73 s; 3-mesh at +147 s) |
| 36871399300 | 1 | 150 s test cap | **WIN, 4 players** |
| 36871399300 | r1 | 150 s test cap | LOBBY (4th was mid-`fill` at the cap) |
| 36871399300 | r2 | 150 s test cap | **PLAYING, 4 players** |
| 36873674352 | — | `actions/checkout` 3-min timeout | no test ran (infra) |

- 11/12 attempts: no assertion failed; the 150 s cap fired. **4/12 had the full 4-way mesh with forced-stale
  offers formed** — the S192 T1 assertion PASSED on CI, then WIN-propagation waits ran out of budget.
- Why so slow: three live Pixi canvases on SwiftShader starve the CPU. A joiner's navigate → click → fill → Enter
  took 40–75 s; one 6-char `fill` took 10–16 s. Joiner 2 connected 69–118 s after the host.
- Passing run 36884780286: the test took 2.2 min (132 s) — 18 s under the cap.
- `browserContext.close: Protocol error` / `Target page … closed`: ruled BENIGN — a consequence of the timeout
  (Playwright tears contexts down while the `finally` closes them), not a separate fault.
- "early peer 0 sees the other two" (the brief's headline) is ONE attempt of 12, and fails BEFORE the 4th joins:
  host(9Tg)→joiner2(YGj) exchanged SDP and never connected on nostr (×2) or torrent. ⚠ That pair WAS a
  stale-pool offer (host pool 70 s old — CI slowness makes joiner 2 itself a "late joiner"). But in the same
  traces 3 other stale-path pairs on the 3-mesh and the 12 stale pairs of the 4 attempts that formed the
  4-way mesh all connected, and fresh pairs fail "after exchanging SDP" on torrent too. ⇒ the relay/ICE flake
  class the lane's 2 retries exist for, not a T1 regression. Recorded as a residual, see seams.
- Relays (probe-relays 8/9 handshake OK locally; mostr DEAD). Functionally, CI console shows writes REJECTED by
  purplerelay ("No space left on device"), offchain.pub ("web of trust"), nostr-pub.wellorder.net ("spam not
  permitted") in failed AND succeeded attempts alike ⇒ only nos.lol / nostr.mom / relay.primal.net take writes.
  Not discriminating for this failure; a relay-rotation item for the merge owner.

### Measured locally (probe, deleted): restarted offer carries 0 inline candidates (fresh: 2); its 2 trickled
candidates arrived AFTER `ensureOffer` attached its signal handler, so none were lost here. ⇒ the restart path
depends on separate candidate messages through the relays; a fresh offer is self-contained.

## FIX (commit 96393070) — only the total budget moves
- `e2e/nplayer.spec.ts`: `LATE_JOINER_BUDGET_MS = 330_000` (was 150 000), docblock with the table above.
  Every per-step wait and assertion UNCHANGED.
- `.github/workflows/e2e.yml` `e2e-lobby`: PW_GLOBAL_TIMEOUT_MIN 16→22, timeout-minutes 20→32
  (3 × 330 s + 4 × 60 s = 20.5 min; ≥ 8 min runner headroom — setup took 7.5 min in run 36882836513,
  so at 16/20 a full-length run would have been SIGKILLed into `cancelled`, the S126 trap).
- `playwright.config.ts`: stale lane comment `lobby 9<12` → `lobby 22<32 (S193)`.
- `src/ci.e2eLanes.test.ts`: new test pinning budget ≥ 282 s measured, the test actually calls
  `test.setTimeout(LATE_JOINER_BUDGET_MS)`, 3 attempts fit the lane, runner ≥ 8 min above Playwright, no retries override.
- Mutations (each RED, then restored GREEN): M1 budget 150 000 · M2 literal `setTimeout(150_000)` ·
  M3 PW_GLOBAL 16 · M4 timeout-minutes 28. Restored: EXIT 0, 8/8.

## Local e2e:lobby runs
port 33396 · 3/3 exit 0 (see final report)

## Gates
tc 0 · vitest 0 · build 0 (see final report)
