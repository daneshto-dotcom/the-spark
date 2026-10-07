# S196 PROGRESS — s196/joiner-desync

## NEXT STEP
Gates running detached (.tmp-gates/gates.sh → typecheck, vitest, build, e2e:gating, e2e:lobby, e2e:protocol; each
<name>.exit). Read exits; fix reds; write FINAL REPORT at top. Mutations M1-M3 DONE (see LOG).

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
