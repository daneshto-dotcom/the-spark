# S193 PROGRESS — lobby-ci (`s193/lobby-ci`)

Branch base: master `71abc276` (contains `8693fdd`; `git merge master` = no-op, no conflicts).

## NEXT STEP
Fix committed (`96393070`). Running `npm run e2e:lobby` locally ×3 (own port 2xxxx, per-worktree hash), then full gates.

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
(pending)

## Gates
(pending)
