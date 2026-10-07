# S196 PROGRESS — s196/joiner-desync

## NEXT STEP
Fix committed (transport.ts receive pipeline). Running AFTER trace (.tmp-gates/lag-after.log) + codec tests
(.tmp-gates/vt-codec.log). Then: update snapshotCodec.transport.test.ts burst/R2(b) cases for latest-wins; new
snapshotCodec.backlog.test.ts (pickSnapFrame unit, REACH through linkedPair w/ slow inflate, negative, mutation);
then gates.

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
