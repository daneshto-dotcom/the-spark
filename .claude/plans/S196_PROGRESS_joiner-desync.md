# S196 PROGRESS — s196/joiner-desync

## NEXT STEP
FIX ROUND (audit MED-1 / LOW-2 / LOW-3): code for MED-1 (authority check before inflate + MAX_INFLATING_PER_SENDER=4,
newest held) and LOW-2 (pick highest fid) COMMITTED, tsc green. NEXT: tests in snapshotCodec.backlog.test.ts —
50 bombs → ≤4 concurrent + newest legit applies; non-authority never inflated; [10,9] applies 10; disconnect while
inflating → nothing to handlers; mutate each guard; then merge master, full gates, one live trace, report.

## FINAL REPORT
- ROOT CAUSE (one, with trace): S195 codec receive path decoded every snapshot frame through ONE serial promise chain
  on the joiner; each DecompressionStream inflate waits on the joiner's main thread for several task hops, so on a
  slower joiner a frame took longer than the 100 ms cadence and the queue grew WITHOUT BOUND. Everything the joiner
  applied (its buildings, bank, shapes) was tens of seconds old. Feedback: once > 3.2 s behind its acks named frames
  out of HOST_RING -> host sent keyframes. Trace (2 real Chromium, real WebRTC, joiner CPU 6x, 100 ms one-way + 0-50
  jitter + 1 % loss): BEFORE lag 96 -> 1509 ticks (25 s) and climbing; AFTER median 39 ticks, max 120, flat; in
  snapshots (exact seq measure) 3-29, no growth. Files: .claude/plans/S196_joiner-desync_lag-{BEFORE,AFTER,AFTER-seq}.jsonl.
- PLAYTEST-2 "existing creatures frozen 30 s on the joiner while additions land": NOT a wire bug. The HOST freezes the
  same way in every BUILD phase and only there (probe over a real bots match to tick 66000: frozen sets appear only at
  matchPhase=BUILD, e.g. tick 19800/21600 BUILD; 0 frozen in every FIGHT sample) — creatures park through BUILD and
  the next wave stages SPAWNING/ticksInState 0. ALSO: a joiner's world.tick runs LOCALLY between snapshots (main.ts
  client branch `world.tick++`), so a joiner dump's tick moving proves nothing about snapshot application. Pinned by a
  REACH test that existing creatures' changes reach a slow joiner through deltas during FIGHT.
- Ruled out by reading/probe: (b) authority predicate (session.hostPeerId, stable) + net-blip close (onPeerLeave,
  network-died only); (c) intents ride `msg` ungated, rate limiter 90 cap / 40 per s; (d) bank/SeatMatchStats ride the
  generic codec as entity/atomic text (REACH proves the spent bank lands); (e) frames ~22 KiB deflated keyframes,
  Trystero chunks, no size issue.
- FIX: src/net/transport.ts — inflate starts on ARRIVAL (concurrent); drainSnapFrames applies only the NEWEST frame
  it can rebuild (keyframe or held base), older queued ones superseded (safe: deltas name an ACKED base); a
  non-rebuildable frame never discards a rebuildable older one. Counters snapRxStats()/snapTxStats() (DEV trace).
- TESTS: src/net/snapshotCodec.backlog.test.ts (7): pickSnapFrame decision x3 incl. NEGATIVE; REACH 5 fps joiner
  80 frames 2 % loss (lag <= 4 frames; own tower + spent bank within 3 joiner frames); LATEST WINS; NEGATIVE (bogus
  newer delta vs inflating keyframe); REACH real bots match FIGHT (creatures byte-equal to host, lag <= 4, existing
  creatures change > 20 times). transport.test: R2(b) re-pointed at processSnapFrame; burst test = latest-wins contract.
- MUTATIONS: M1 master transport -> REACH red (lag 39 frames); M2 pick oldest -> decision + LATEST WINS red;
  M3 ignore held base -> both NEGATIVE red; M4 master transport -> FIGHT REACH red (lag 5 > 4).
- GATES (merged tree): typecheck 0 · vitest full 1 = 6 timeout-only (re-run alone: mine 7/7 after 120 s budget,
  botPorchClear/spawnEconomy/racialB green; endgameAudit 2 timeouts alone = known load flake) 9467 passed ·
  build 0, entry 1264.7 / 1350 KiB (+1.4 KiB from this tree, measured vs master transport) · e2e:gating 0 (72 passed,
  1 skipped) · e2e:lobby 0 (5) · e2e:protocol 0 (2). After the last master merge (tests-only): typecheck 0,
  vitest src/net + theRisen 842 passed.
- BUMP VERDICT: NO bump. Frame format, ack format and keyframe policy unchanged; only the receiver's scheduling
  changed. An old host and a new joiner (and vice versa) agree on every frame either computes.
- MINE: none (no gameplay numbers). HOST_RING (32) left as is — staleAcks counter makes it observable (2 in a 45 s
  throttled run). Question for owner/merge owner: none.
- NOT DONE: no UI-driven placement/upgrade in the live harness (covered in the REACH tests); harness spikes to ~29
  snapshots at 1-2 fps under 6x throttle are render-rate, not growth.

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
