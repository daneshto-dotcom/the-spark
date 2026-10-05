# S195 PROGRESS — net-delta (A compression + B delta snapshots + N18(d) entropy toast)

## NEXT STEP (exact)
- DONE: A+B, item 3, mutations, merge da8a2267, MEASURED, typecheck 0. RUNNING detached: vitest full (.tmp-gates/vitest2.log/.exit). NEXT: read it, fix reds, then build, then e2e gating+lobby+protocol.
## DESIGN (decided)
- Transport boundary only. Host segments the stripped+rounded wire JSON into envelope prefix/suffix + top keys; entity arrays (all objects w/ unique id) → per-id text. Full text = concatenation (== JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer), proven by test).
- Frame = page-unique fid (module counter). Delta vs the peer's last ACKED fid (host ring 32); keyframe = delta vs empty base. Newline-delimited text: header JSON, prefix, suffix, raw segments.
- Binary Trystero action 'snap' (byte0 = 0x11 text / 0x12 deflate), acks on string action 'sack' {f,z,k} targeted to sender. Joiner reconstructs the FULL STRING and feeds handleRawMessage → byte-identical by construction.
- Compression only when the peer's ack says z=1 (DecompressionStream present) → fallback uncompressed, no refusal.
- Handles without snapAction (test fakes / SNAPSHOT_CODEC off) use the legacy string path.

## Log
- worktree created from master c45818cb; npm install OK; lag harness (lagWaveMeasure.test.ts, scripts/lag/*) copied verbatim from s195/lag 4eeee226 (identical files → no merge conflict).
- MUTATIONS (each reverted, each turned a test RED on an assertion, not a compile error): M1 delta base = last SENT not last ACKED → transport burst + oracle red; M2 dup/old-frame gate removed → dup test red; M3 order never sent → reorder unit red; M4 toast wave gate removed → late-joiner negative red; M5 removal not applied to the base map → removal invariant red (first attempt was a compile error in the test — invalid, redone).

## MEASURED (netDeltaMeasure, master da8a2267 + this branch, 30 snapshots @10 Hz mid-FIGHT, medians; host/joiner ms = Node, this shared machine)
| wave | shapes / connectors / creatures | full | A deflate | B delta | A+B | A+B incl. keyframe/100 | Mbit/s/joiner full → A+B | cut | host ms full → A+B | joiner ms full → A+B |
|---:|---|---:|---:|---:|---:|---:|---|---:|---|---|
| 1 | 20 / 28 / 11 | 14.9 KiB | 2.9 | 4.0 | 1.0 | 1.0 | 1.22 → 0.09 | 14.3× | 0.14 → 0.61 | 0.20 → 0.44 |
| 5 | 194 / 327 / 21 | 105.1 KiB | 16.1 | 38.3 | 6.7 | 6.8 | 8.61 → 0.56 | 15.4× | 0.82 → 2.23 | 0.94 → 1.42 |
| 8 | 230 / 379 / 38 | 152.1 KiB | 23.0 | 38.6 | 7.0 | 7.1 | 12.46 → 0.58 | 21.3× | 1.28 → 2.89 | 1.28 → 1.86 |
| 10 | 261 / 408 / 34 | 175.3 KiB | 26.2 | 34.3 | 6.3 | 6.5 | 14.36 → 0.53 | 27.0× | 1.45 → 2.93 | 1.27 → 1.77 |
| 15 | 392 / 615 / 80 | 285.8 KiB | 41.0 | 55.8 | 9.7 | 10.0 | 23.41 → 0.82 | 28.6× | 2.39 → 4.72 | 2.14 → 2.85 |
