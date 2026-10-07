# S196 PROGRESS — s196/joiner-desync

## NEXT STEP
PLAYTEST-2 lead ("existing creatures frozen 30 s on the joiner while additions land"): host-side probe
(src/net/zzFreeze.scratch.test.ts, UNCOMMITTED scratch, log .tmp-gates/freeze-probe.log) shows the HOST freezes the
SAME way, once per wave (BUILD phase?) — confirm with matchPhase in the probe (T=22000), then delete the scratch,
write the verdict here, re-run vitest alone for backlog file (done: green), final report.
Also: joiner world.tick runs LOCALLY (main.ts client branch world.tick++), so a joiner dump's tick moving does NOT
prove a snapshot applied — harness lag should use host seq vs joiner transport lastSeq (todo, optional).

## WHY THE JOINER WAS BEHIND (evidence: 2 real Chromium pages, real WebRTC, local relay)
S195's snapshot codec decoded every received frame through ONE serial promise chain on the joiner: frame N+1's
inflate could not even start until frame N was applied, and each DecompressionStream inflate takes several
main-thread TASK hops. On a joiner whose frames are slow (weaker PC / heavy render), one frame's decode took longer
than the 100 ms between snapshots, so the queue grew without bound: everything the joiner applied — its own
buildings, its bank, its shapes — was older and older. Not rendering cost: the board the joiner DREW was correct,
just tens of seconds old. The host's strong PC never sees it; only the weaker joiner does.

BEFORE trace (`scripts/live-mp/live-joiner-lag.mjs`, joiner CPU 6x throttled, relay 100 ms one-way + 0-50 ms jitter
+ 1 % loss; file .claude/plans/S196_joiner-desync_lag-BEFORE.jsonl): joiner lag behind host grew monotonically
96 -> 336 -> 609 -> 909 -> 1113 ticks (1.6 s -> 25 s), median of last 10 samples 1509 ticks = 25 s, still climbing.

## LOG
- boot: merged master c78f5c58 (no conflicts).
- fix: transport.ts receive pipeline (concurrent inflate on arrival + latest-wins drain, pickSnapFrame static),
  rx/tx counters (snapRxStats/snapTxStats). AFTER trace: lag median 39 ticks (0.6 s), max 120, flat; 218 frames applied
  of 218, superseded 0, keyframes 5 / deltas 213, staleAcks 0 (same 6x CPU + impairment as BEFORE: 1509 and climbing).
- tests: src/net/snapshotCodec.backlog.test.ts (6): pickSnapFrame decision x3 (incl. negative), REACH 5 fps joiner
  80 frames 2 % loss 1-turn ack RTT (lag <= 4 frames; own tower + spent bank <= 3 joiner frames), LATEST WINS, NEGATIVE
  (bogus newer delta cannot discard an inflating keyframe). transport.test R2(b) re-pointed at processSnapFrame; burst
  test states the latest-wins contract.
- mutations: M1 pre-fix transport.ts (master) -> REACH red: "applied 1..41 … expected 39 <= 4" (one frame per turn,
  lag +1/turn = the bug). M2 pick OLDEST -> decision + LATEST WINS red. M3 ignore held-base -> both NEGATIVE red.
- merged master 538476e0 (no conflicts).
- gates (merged tree, pre-timeout-bump): typecheck 0 · vitest 1 = 6 TIMEOUT-only reds (2 mine → REACH describe given 120 s
  budget, commit after; 4 others: botPorchClear, endgameAudit (known flake), spawnEconomy.measure, racialB.differential —
  re-run alone pending) 9467 passed · build 0, entry 1264.7 / 1350 KiB · e2e:gating 0 (72 passed, 1 skipped).
  e2e:lobby + e2e:protocol running.
- vitest re-runs ALONE: snapshotCodec.backlog 6/6 · botPorchClear 6/6 · spawnEconomy.measure 4/4 · racialB.differential 1/1 ·
  endgameAudit 2 TIMEOUT (20 s) alone = the brief's known load flake (not net code). e2e:lobby 0 (5 passed) ·
  e2e:protocol 0 (2 passed).
